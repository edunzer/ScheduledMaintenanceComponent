import { createElement } from 'lwc';
import ScheduledMaintenanceComponent from 'c/scheduledMaintenanceComponent';
import getActiveScheduledMaintenances from '@salesforce/apex/ScheduledMaintenanceService.getActiveScheduledMaintenances';
import getAppByDeveloperName from '@salesforce/apex/ScheduledMaintenanceService.getAppByDeveloperName';
import getUserProfileName from '@salesforce/apex/ScheduledMaintenanceService.getUserProfileName';

jest.mock('@salesforce/apex/ScheduledMaintenanceService.getActiveScheduledMaintenances', () => ({ default: jest.fn() }), { virtual: true });
jest.mock('@salesforce/apex/ScheduledMaintenanceService.getAppByDeveloperName', () => ({ default: jest.fn() }), { virtual: true });
jest.mock('@salesforce/apex/ScheduledMaintenanceService.getUserProfileName', () => ({ default: jest.fn() }), { virtual: true });

const NOW = new Date('2026-10-09T17:00:00.000Z');
const minutesFromNow = (minutes) => new Date(NOW.getTime() + minutes * 60 * 1000).toISOString();
const maintenance = (overrides) => ({
    Id: 'a00000000000001AAA',
    Subject__c: 'CRM upgrade',
    Description__c: 'Details',
    Start_Date_Time__c: minutesFromNow(60),
    End_Date_Time__c: minutesFromNow(120),
    Alert_Frequency__c: 'Daily',
    Dismissible__c: true,
    Applicable_Apps__c: 'CRM',
    ...overrides
});

// Lets the chained Apex promises settle without advancing the fake clock.
const flushPromises = async () => {
    for (let i = 0; i < 20; i++) {
        await Promise.resolve();
    }
};

describe('c-scheduled-maintenance-component alert style', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        jest.setSystemTime(NOW);
        localStorage.clear();
        getUserProfileName.mockResolvedValue('Standard User');
        getAppByDeveloperName.mockResolvedValue(null);
    });

    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
        jest.clearAllMocks();
        jest.useRealTimers();
    });

    async function render(records, alertStyle) {
        getActiveScheduledMaintenances.mockResolvedValue(records);
        const element = createElement('c-scheduled-maintenance-component', { is: ScheduledMaintenanceComponent });
        if (alertStyle) {
            element.alertStyle = alertStyle;
        }
        element.currentAppContext = 'CRM';
        document.body.appendChild(element);
        await flushPromises();
        return element;
    }

    const getBanner = (element) => element.shadowRoot.querySelector('.slds-notify_alert');
    const getDialog = (element) => element.shadowRoot.querySelector('section.slds-modal');

    it('uses the dialog by default', async () => {
        const element = await render([maintenance()]);

        expect(getDialog(element)).not.toBeNull();
        expect(getBanner(element)).toBeNull();
    });

    it('shows a reminder as a banner instead of a dialog', async () => {
        const element = await render([maintenance()], 'Banner');
        const banner = getBanner(element);

        expect(getDialog(element)).toBeNull();
        expect(banner.getAttribute('role')).toBe('status');
        expect(banner.classList).not.toContain('slds-alert_warning');
        expect(banner.querySelector('h2').textContent).toMatch(/^Scheduled Maintenance Reminder: CRM upgrade · Fri, Oct 9, 11:00\sAM\s–\s12:00\sPM PDT/);
    });

    it('counts several maintenances in the banner', async () => {
        const element = await render([maintenance({ Id: 'a01' }), maintenance({ Id: 'a02' })], 'Banner');

        expect(getBanner(element).querySelector('h2').textContent).toMatch(/^Scheduled Maintenance Reminder: 2 maintenances/);
    });

    it('uses warning colors while a dismissible maintenance is in progress', async () => {
        const element = await render([maintenance({ Start_Date_Time__c: minutesFromNow(-60) })], 'Banner');

        expect(getBanner(element).classList).toContain('slds-alert_warning');
        expect(getBanner(element).querySelector('h2').textContent).toMatch(/^Scheduled Maintenance Alert: /);
    });

    it('opens the details in the dialog', async () => {
        const element = await render([maintenance()], 'Banner');

        getBanner(element).querySelector('.banner-link').click();
        await flushPromises();

        expect(getBanner(element)).toBeNull();
        expect(getDialog(element)).not.toBeNull();
        expect(element.shadowRoot.querySelectorAll('c-maintenance-card')).toHaveLength(1);
    });

    it('dismisses from the banner', async () => {
        const element = await render([maintenance()], 'Banner');

        getBanner(element).querySelector('button[title="Dismiss"]').click();
        await flushPromises();

        expect(getBanner(element)).toBeNull();
        expect(getDialog(element)).toBeNull();
        expect(JSON.parse(localStorage.getItem('scheduledMaintenance_dismissed_005000000000000000'))).toHaveLength(1);
    });

    it('still uses the dialog for a lock', async () => {
        const element = await render([maintenance({ Start_Date_Time__c: minutesFromNow(-60), Dismissible__c: false })], 'Banner');

        expect(getBanner(element)).toBeNull();
        expect(getDialog(element).getAttribute('role')).toBe('alertdialog');
    });
});

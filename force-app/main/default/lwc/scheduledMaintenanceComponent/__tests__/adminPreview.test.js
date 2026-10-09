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
    Subject__c: 'System upgrade',
    Description__c: 'Details',
    Start_Date_Time__c: minutesFromNow(-60),
    End_Date_Time__c: minutesFromNow(60),
    Alert_Frequency__c: 'Daily',
    Dismissible__c: false,
    Applicable_Apps__c: 'System',
    ...overrides
});

// Lets the chained Apex promises settle without advancing the fake clock.
const flushPromises = async () => {
    for (let i = 0; i < 20; i++) {
        await Promise.resolve();
    }
};

describe('c-scheduled-maintenance-component admin status and preview', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        jest.setSystemTime(NOW);
        localStorage.clear();
        getUserProfileName.mockResolvedValue('System Administrator');
        getAppByDeveloperName.mockResolvedValue(null);
    });

    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
        jest.clearAllMocks();
        jest.useRealTimers();
    });

    async function render(records) {
        getActiveScheduledMaintenances.mockResolvedValue(records);
        const element = createElement('c-scheduled-maintenance-component', { is: ScheduledMaintenanceComponent });
        document.body.appendChild(element);
        await flushPromises();
        return element;
    }

    const statusText = (element) => element.shadowRoot.querySelector('.admin-status p').textContent.replace(/\s+/g, ' ').trim();
    const previewButton = (element) =>
        Array.from(element.shadowRoot.querySelectorAll('.admin-status button')).find((b) => b.textContent === 'Preview');
    const getDialog = (element) => element.shadowRoot.querySelector('section.slds-modal');

    it('says when nothing is scheduled, without a preview', async () => {
        const element = await render([]);

        expect(statusText(element)).toBe("Scheduled maintenance: nothing to show right now. You're exempt from maintenance locks.");
        expect(previewButton(element)).toBeUndefined();
    });

    it('summarizes an active lock', async () => {
        const element = await render([maintenance()]);

        expect(statusText(element)).toMatch(/^Scheduled maintenance: All apps are unavailable until Fri, Oct 9, 11:00\sAM PDT\. You're exempt/);
    });

    it('counts the alerts users see', async () => {
        const reminder = { Dismissible__c: true, Start_Date_Time__c: minutesFromNow(60), End_Date_Time__c: minutesFromNow(120) };
        const element = await render([maintenance({ Id: 'a01', ...reminder }), maintenance({ Id: 'a02', ...reminder })]);

        expect(statusText(element)).toMatch(/^Scheduled maintenance: 2 alerts are shown to users\./);
    });

    it('previews the lock dialog users see, and closes it without dismissing anything', async () => {
        const element = await render([maintenance()]);
        expect(getDialog(element)).toBeNull();

        previewButton(element).click();
        await flushPromises();

        const dialog = getDialog(element);
        expect(dialog.getAttribute('role')).toBe('alertdialog');
        expect(element.shadowRoot.querySelector('.lock-summary')).not.toBeNull();
        const footerButtons = Array.from(element.shadowRoot.querySelectorAll('footer lightning-button')).map((b) => b.label);
        expect(footerButtons).toEqual(['Close preview']);

        element.shadowRoot.querySelector('header button[title="Close"]').click();
        await flushPromises();

        expect(getDialog(element)).toBeNull();
        expect(localStorage.getItem('scheduledMaintenance_dismissed_005000000000000000')).toBeNull();
    });

    it('closes the preview with Escape, even for a lock', async () => {
        const element = await render([maintenance()]);
        previewButton(element).click();
        await flushPromises();

        getDialog(element).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }));
        await flushPromises();

        expect(getDialog(element)).toBeNull();
    });
});

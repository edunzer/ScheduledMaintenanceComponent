import { createElement } from 'lwc';
import ScheduledMaintenanceComponent from 'c/scheduledMaintenanceComponent';
import getActiveScheduledMaintenances from '@salesforce/apex/ScheduledMaintenanceService.getActiveScheduledMaintenances';
import getAppIdByDeveloperName from '@salesforce/apex/ScheduledMaintenanceService.getAppIdByDeveloperName';
import getUserProfileName from '@salesforce/apex/ScheduledMaintenanceService.getUserProfileName';

jest.mock('@salesforce/apex/ScheduledMaintenanceService.getActiveScheduledMaintenances', () => ({ default: jest.fn() }), { virtual: true });
jest.mock('@salesforce/apex/ScheduledMaintenanceService.getAppIdByDeveloperName', () => ({ default: jest.fn() }), { virtual: true });
jest.mock('@salesforce/apex/ScheduledMaintenanceService.getUserProfileName', () => ({ default: jest.fn() }), { virtual: true });

const NOW = new Date('2026-10-09T17:00:00.000Z');
const minutesFromNow = (minutes) => new Date(NOW.getTime() + minutes * 60 * 1000).toISOString();
const maintenance = (overrides) => ({
    Id: 'a00000000000001AAA',
    Subject__c: 'Release',
    Description__c: 'Details',
    Start_Date_Time__c: minutesFromNow(-60),
    End_Date_Time__c: minutesFromNow(60),
    Alert_Frequency__c: 'Daily',
    Dismissible__c: true,
    Applicable_Apps__c: 'System',
    ...overrides
});

// Lets the chained Apex promises settle without advancing the fake clock.
const flushPromises = async () => {
    for (let i = 0; i < 20; i++) {
        await Promise.resolve();
    }
};

describe('c-scheduled-maintenance-component modal states', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        jest.setSystemTime(NOW);
        localStorage.clear();
        getUserProfileName.mockResolvedValue('Standard User');
        getAppIdByDeveloperName.mockResolvedValue('06m000000000001AAA');
    });

    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
        jest.clearAllMocks();
        jest.useRealTimers();
    });

    async function render(records, appContext) {
        getActiveScheduledMaintenances.mockResolvedValue(records);
        const element = createElement('c-scheduled-maintenance-component', { is: ScheduledMaintenanceComponent });
        element.currentAppContext = appContext;
        document.body.appendChild(element);
        await flushPromises();
        return element;
    }

    // What the user can see and do in the modal
    const describeModal = (element) => ({
        open: element.shadowRoot.querySelector('section[role="dialog"]') !== null,
        closed: Array.from(element.shadowRoot.querySelectorAll('header lightning-badge')).some((b) => b.label === 'This App is Closed'),
        closeIcon: element.shadowRoot.querySelector('header button[title="Close"]') !== null,
        buttons: Array.from(element.shadowRoot.querySelectorAll('footer lightning-button')).map((b) => b.label)
    });

    it('full lock: a System maintenance that cannot be dismissed leaves no way out', async () => {
        const element = await render([maintenance({ Dismissible__c: false })]);

        expect(describeModal(element)).toEqual({ open: true, closed: true, closeIcon: false, buttons: [] });
    });

    it('app lock: an app maintenance that cannot be dismissed offers the exit app', async () => {
        const element = await render([maintenance({ Dismissible__c: false, Applicable_Apps__c: 'CRM' })], 'CRM');

        expect(describeModal(element)).toEqual({ open: true, closed: true, closeIcon: false, buttons: ['Navigate to Welcome App'] });
    });

    it('dismissible reminder: can be closed, and the dismissal is saved', async () => {
        const element = await render([maintenance({ Start_Date_Time__c: minutesFromNow(60), End_Date_Time__c: minutesFromNow(120) })]);
        expect(describeModal(element)).toEqual({ open: true, closed: false, closeIcon: true, buttons: ['Dismiss'] });

        element.shadowRoot.querySelector('footer lightning-button').click();
        await flushPromises();

        expect(describeModal(element).open).toBe(false);
        expect(JSON.parse(localStorage.getItem('scheduledMaintenance_dismissed_005000000000000000'))).toEqual([
            { recordId: 'a00000000000001AAA', dismissedAt: NOW.toISOString() }
        ]);
    });

    it('stays closed when there is nothing to show', async () => {
        const element = await render([]);

        expect(describeModal(element).open).toBe(false);
    });

    it('refreshes every 5 minutes for the first 30 minutes, then every 30 minutes', async () => {
        await render([]);
        const fetchCountAfter = async (minutes) => {
            jest.advanceTimersByTime(minutes * 60 * 1000);
            await flushPromises();
            return getActiveScheduledMaintenances.mock.calls.length;
        };

        expect(getActiveScheduledMaintenances).toHaveBeenCalledTimes(1); // on load
        expect(await fetchCountAfter(25)).toBe(6); // at 5, 10, 15, 20 and 25 minutes
        expect(await fetchCountAfter(29)).toBe(6); // nothing until 55 minutes
        expect(await fetchCountAfter(1)).toBe(7); // 55 minutes
        expect(await fetchCountAfter(30)).toBe(8); // 85 minutes
    });
});

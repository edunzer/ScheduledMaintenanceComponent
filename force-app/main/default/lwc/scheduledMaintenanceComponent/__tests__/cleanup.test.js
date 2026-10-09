import { createElement } from 'lwc';
import ScheduledMaintenanceComponent from 'c/scheduledMaintenanceComponent';
import getActiveScheduledMaintenances from '@salesforce/apex/ScheduledMaintenanceService.getActiveScheduledMaintenances';
import getAppIdByDeveloperName from '@salesforce/apex/ScheduledMaintenanceService.getAppIdByDeveloperName';
import getUserProfileName from '@salesforce/apex/ScheduledMaintenanceService.getUserProfileName';

jest.mock('@salesforce/apex/ScheduledMaintenanceService.getActiveScheduledMaintenances', () => ({ default: jest.fn() }), { virtual: true });
jest.mock('@salesforce/apex/ScheduledMaintenanceService.getAppIdByDeveloperName', () => ({ default: jest.fn() }), { virtual: true });
jest.mock('@salesforce/apex/ScheduledMaintenanceService.getUserProfileName', () => ({ default: jest.fn() }), { virtual: true });

// sfdx-lwc-jest's default user ID
const DISMISSALS_KEY = 'scheduledMaintenance_dismissed_005000000000000000';
const LEGACY_KEY = 'scheduledMaintenance_dismissed';
const NOW = new Date('2026-10-09T17:00:00.000Z');
const minutesFromNow = (minutes) => new Date(NOW.getTime() + minutes * 60 * 1000).toISOString();

const maintenance = (id, startMinutes, endMinutes) => ({
    Id: id,
    Subject__c: 'Maintenance ' + id,
    Description__c: 'Details',
    Start_Date_Time__c: minutesFromNow(startMinutes),
    End_Date_Time__c: minutesFromNow(endMinutes),
    Alert_Frequency__c: 'Daily',
    Dismissible__c: true,
    Applicable_Apps__c: 'System'
});

// Lets the chained Apex promises settle without advancing the fake clock.
const flushPromises = async () => {
    for (let i = 0; i < 20; i++) {
        await Promise.resolve();
    }
};

const isModalOpen = (element) => element.shadowRoot.querySelector('section[role="dialog"]') !== null;

describe('c-scheduled-maintenance-component cleanup', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        jest.setSystemTime(NOW);
        localStorage.clear();
        getUserProfileName.mockResolvedValue('Standard User');
        getAppIdByDeveloperName.mockResolvedValue(null);
    });

    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
        jest.clearAllMocks();
        jest.useRealTimers();
    });

    async function render() {
        const element = createElement('c-scheduled-maintenance-component', { is: ScheduledMaintenanceComponent });
        document.body.appendChild(element);
        await flushPromises();
        return element;
    }

    it('switches back to the reminder title when the in-progress maintenance ends', async () => {
        getActiveScheduledMaintenances.mockResolvedValue([maintenance('a01', -60, 2), maintenance('a02', 60, 120)]);
        const element = await render();
        expect(element.shadowRoot.querySelector('header h2').textContent).toBe('Scheduled Maintenance Alert');

        jest.advanceTimersByTime(2.1 * 60 * 1000);
        await flushPromises();

        expect(element.shadowRoot.querySelector('header h2').textContent).toBe('Scheduled Maintenance Reminder');
    });

    it('does not start polling if removed before the startup calls finish', async () => {
        getActiveScheduledMaintenances.mockResolvedValue([]);
        const element = createElement('c-scheduled-maintenance-component', { is: ScheduledMaintenanceComponent });
        document.body.appendChild(element);
        document.body.removeChild(element);

        await flushPromises();
        jest.advanceTimersByTime(60 * 60 * 1000);
        await flushPromises();

        expect(getActiveScheduledMaintenances).not.toHaveBeenCalled();
    });

    it('stores dismissals per user and drops ones older than 30 days', async () => {
        localStorage.setItem(
            DISMISSALS_KEY,
            JSON.stringify([
                { recordId: 'a0old', dismissedAt: new Date(NOW.getTime() - 31 * 24 * 60 * 60 * 1000).toISOString() },
                { recordId: 'a0recent', dismissedAt: new Date(NOW.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString() }
            ])
        );
        localStorage.setItem(LEGACY_KEY, JSON.stringify([{ recordId: 'a0legacy', dismissedAt: NOW.toISOString() }]));
        getActiveScheduledMaintenances.mockResolvedValue([maintenance('a01', 60, 120)]);
        const element = await render();

        Array.from(element.shadowRoot.querySelectorAll('footer lightning-button'))
            .find((b) => b.label === 'Dismiss')
            .click();

        const stored = JSON.parse(localStorage.getItem(DISMISSALS_KEY)).map((item) => item.recordId);
        expect(stored.sort()).toEqual(['a01', 'a0recent']);
        expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
    });

    it("ignores dismissals saved under the old shared key, which may be another user's", async () => {
        localStorage.setItem(LEGACY_KEY, JSON.stringify([{ recordId: 'a01', dismissedAt: NOW.toISOString() }]));
        getActiveScheduledMaintenances.mockResolvedValue([maintenance('a01', 60, 120)]);

        expect(isModalOpen(await render())).toBe(true);
    });
});

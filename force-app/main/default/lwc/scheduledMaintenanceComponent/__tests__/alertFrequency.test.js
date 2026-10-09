import { createElement } from 'lwc';
import ScheduledMaintenanceComponent from 'c/scheduledMaintenanceComponent';
import getActiveScheduledMaintenances from '@salesforce/apex/ScheduledMaintenanceService.getActiveScheduledMaintenances';
import getAppIdByDeveloperName from '@salesforce/apex/ScheduledMaintenanceService.getAppIdByDeveloperName';
import getUserLocaleInfo from '@salesforce/apex/ScheduledMaintenanceService.getUserLocaleInfo';
import getUserProfileName from '@salesforce/apex/ScheduledMaintenanceService.getUserProfileName';

jest.mock('@salesforce/apex/ScheduledMaintenanceService.getActiveScheduledMaintenances', () => ({ default: jest.fn() }), { virtual: true });
jest.mock('@salesforce/apex/ScheduledMaintenanceService.getAppIdByDeveloperName', () => ({ default: jest.fn() }), { virtual: true });
jest.mock('@salesforce/apex/ScheduledMaintenanceService.getUserLocaleInfo', () => ({ default: jest.fn() }), { virtual: true });
jest.mock('@salesforce/apex/ScheduledMaintenanceService.getUserProfileName', () => ({ default: jest.fn() }), { virtual: true });

const RECORD_ID = 'a00000000000001AAA';

// A dismissible maintenance that starts in 2 hours (inside its alert buffer).
const upcomingMaintenance = (frequency) => ({
    Id: RECORD_ID,
    Subject__c: 'Release',
    Description__c: 'Release window',
    Start_Date_Time__c: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    End_Date_Time__c: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
    Alert_Frequency__c: frequency,
    Dismissible__c: true,
    Applicable_Apps__c: 'System'
});

const seedDismissal = (dismissedAt) =>
    localStorage.setItem('scheduledMaintenance_dismissed', JSON.stringify([{ recordId: RECORD_ID, dismissedAt }]));

// Lets the chained Apex promises settle without advancing the fake clock.
const flushPromises = async () => {
    for (let i = 0; i < 20; i++) {
        await Promise.resolve();
    }
};

const isModalOpen = (element) => element.shadowRoot.querySelector('section[role="dialog"]') !== null;

describe('c-scheduled-maintenance-component alert frequency', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        localStorage.clear();
        getUserProfileName.mockResolvedValue('Standard User');
        getUserLocaleInfo.mockResolvedValue({ timeZone: 'America/Los_Angeles', locale: 'en_US' });
        getAppIdByDeveloperName.mockResolvedValue(null);
    });

    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
        jest.clearAllMocks();
        jest.useRealTimers();
    });

    async function render(frequency) {
        getActiveScheduledMaintenances.mockResolvedValue([upcomingMaintenance(frequency)]);
        const element = createElement('c-scheduled-maintenance-component', { is: ScheduledMaintenanceComponent });
        document.body.appendChild(element);
        await flushPromises();
        return element;
    }

    describe('Every Visit', () => {
        it('stays closed during background refreshes after it is dismissed', async () => {
            jest.setSystemTime(new Date('2026-10-09T17:00:00Z'));
            const element = await render('Every Visit');
            expect(isModalOpen(element)).toBe(true);

            const dismiss = Array.from(element.shadowRoot.querySelectorAll('footer lightning-button')).find((b) => b.label === 'Dismiss');
            dismiss.click();
            await flushPromises();
            expect(isModalOpen(element)).toBe(false);

            // The next background refresh is 5 minutes later
            const fetchCount = getActiveScheduledMaintenances.mock.calls.length;
            jest.advanceTimersByTime(5 * 60 * 1000);
            await flushPromises();
            expect(getActiveScheduledMaintenances.mock.calls.length).toBe(fetchCount + 1);
            expect(isModalOpen(element)).toBe(false);
        });

        it('shows again on the next page visit', async () => {
            jest.setSystemTime(new Date('2026-10-09T17:00:00Z'));
            seedDismissal('2026-10-09T16:59:00Z');

            const element = await render('Every Visit');

            expect(isModalOpen(element)).toBe(true);
        });
    });

    describe('Daily (user in America/Los_Angeles)', () => {
        // Dismissed at 4:00pm Pacific (23:00 UTC)
        beforeEach(() => seedDismissal('2026-10-09T23:00:00Z'));

        it('stays closed after UTC midnight if it is still the same day for the user', async () => {
            jest.setSystemTime(new Date('2026-10-10T00:30:00Z')); // 5:30pm Pacific, same day

            expect(isModalOpen(await render('Daily'))).toBe(false);
        });

        it("shows again after the user's midnight", async () => {
            jest.setSystemTime(new Date('2026-10-10T07:30:00Z')); // 12:30am Pacific, next day

            expect(isModalOpen(await render('Daily'))).toBe(true);
        });
    });

    describe('Weekly', () => {
        beforeEach(() => seedDismissal('2026-10-02T23:00:00Z'));

        it('stays closed until 7 days have passed', async () => {
            jest.setSystemTime(new Date('2026-10-09T22:00:00Z')); // 6 days 23 hours later

            expect(isModalOpen(await render('Weekly'))).toBe(false);
        });

        it('shows again 7 days after it was dismissed', async () => {
            jest.setSystemTime(new Date('2026-10-09T23:01:00Z'));

            expect(isModalOpen(await render('Weekly'))).toBe(true);
        });
    });
});

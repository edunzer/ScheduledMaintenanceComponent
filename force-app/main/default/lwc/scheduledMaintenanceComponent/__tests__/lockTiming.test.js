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

const NOW = new Date('2026-10-09T17:00:00.000Z');
const minutesFromNow = (minutes) => new Date(NOW.getTime() + minutes * 60 * 1000).toISOString();

// A non-dismissible System maintenance: a full lock while it's in progress.
const systemLock = (startMinutes, endMinutes) => ({
    Id: 'a00000000000001AAA',
    Subject__c: 'System upgrade',
    Description__c: 'Salesforce is unavailable',
    Start_Date_Time__c: minutesFromNow(startMinutes),
    End_Date_Time__c: minutesFromNow(endMinutes),
    Alert_Frequency__c: 'Daily',
    Dismissible__c: false,
    Applicable_Apps__c: 'System'
});

// Lets the chained Apex promises settle without advancing the fake clock.
const flushPromises = async () => {
    for (let i = 0; i < 20; i++) {
        await Promise.resolve();
    }
};

const isLocked = (element) =>
    Array.from(element.shadowRoot.querySelectorAll('lightning-badge')).some((badge) => badge.label === 'This App is Closed');
const isModalOpen = (element) => element.shadowRoot.querySelector('section[role="dialog"]') !== null;

describe('c-scheduled-maintenance-component lock timing', () => {
    let element;

    beforeEach(() => {
        jest.useFakeTimers();
        jest.setSystemTime(NOW);
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

    async function render() {
        element = createElement('c-scheduled-maintenance-component', { is: ScheduledMaintenanceComponent });
        document.body.appendChild(element);
        await flushPromises();
    }

    async function advanceMinutes(minutes) {
        jest.advanceTimersByTime(minutes * 60 * 1000);
        await flushPromises();
    }

    it('locks when the maintenance starts, without waiting for the next fetch', async () => {
        getActiveScheduledMaintenances.mockResolvedValue([systemLock(3, 60)]);
        await render();
        const fetchCount = getActiveScheduledMaintenances.mock.calls.length;

        expect(isModalOpen(element)).toBe(true);
        expect(isLocked(element)).toBe(false);

        await advanceMinutes(3.1);

        expect(isLocked(element)).toBe(true);
        expect(getActiveScheduledMaintenances.mock.calls.length).toBe(fetchCount);
    });

    it('unlocks when the maintenance ends, without waiting for the next fetch', async () => {
        getActiveScheduledMaintenances.mockResolvedValue([systemLock(-60, 2)]);
        await render();
        const fetchCount = getActiveScheduledMaintenances.mock.calls.length;

        expect(isLocked(element)).toBe(true);

        await advanceMinutes(2.1);

        expect(isModalOpen(element)).toBe(false);
        expect(getActiveScheduledMaintenances.mock.calls.length).toBe(fetchCount);
    });

    it('refetches when the tab becomes visible again', async () => {
        getActiveScheduledMaintenances.mockResolvedValue([]);
        await render();
        const fetchCount = getActiveScheduledMaintenances.mock.calls.length;

        jest.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
        document.dispatchEvent(new Event('visibilitychange'));
        await flushPromises();

        expect(getActiveScheduledMaintenances.mock.calls.length).toBe(fetchCount + 1);
    });

    it('stops listening for tab visibility once removed from the page', async () => {
        getActiveScheduledMaintenances.mockResolvedValue([]);
        await render();
        document.body.removeChild(element);
        const fetchCount = getActiveScheduledMaintenances.mock.calls.length;

        jest.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
        document.dispatchEvent(new Event('visibilitychange'));
        await flushPromises();

        expect(getActiveScheduledMaintenances.mock.calls.length).toBe(fetchCount);
    });
});

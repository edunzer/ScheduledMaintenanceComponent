import { createElement } from 'lwc';
import ScheduledMaintenanceComponent from 'c/scheduledMaintenanceComponent';
import getActiveScheduledMaintenances from '@salesforce/apex/ScheduledMaintenanceService.getActiveScheduledMaintenances';
import getAppIdByDeveloperName from '@salesforce/apex/ScheduledMaintenanceService.getAppIdByDeveloperName';
import getUserProfileName from '@salesforce/apex/ScheduledMaintenanceService.getUserProfileName';

// A Salesforce locale with a variant that Intl rejects as-is, in a 24-hour time zone. Each test file loads
// the component once, so these are fixed for this file.
jest.mock('@salesforce/i18n/locale', () => ({ default: 'de_DE_EURO' }), { virtual: true });
jest.mock('@salesforce/i18n/timeZone', () => ({ default: 'Europe/Berlin' }), { virtual: true });
jest.mock('@salesforce/apex/ScheduledMaintenanceService.getActiveScheduledMaintenances', () => ({ default: jest.fn() }), { virtual: true });
jest.mock('@salesforce/apex/ScheduledMaintenanceService.getAppIdByDeveloperName', () => ({ default: jest.fn() }), { virtual: true });
jest.mock('@salesforce/apex/ScheduledMaintenanceService.getUserProfileName', () => ({ default: jest.fn() }), { virtual: true });

// Lets the chained Apex promises settle without advancing the fake clock.
const flushPromises = async () => {
    for (let i = 0; i < 20; i++) {
        await Promise.resolve();
    }
};

describe('c-scheduled-maintenance-component date format', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
        jest.useRealTimers();
    });

    it("uses the user's locale, including 24-hour time, even with a locale variant", async () => {
        jest.useFakeTimers();
        jest.setSystemTime(new Date('2026-10-09T16:00:00Z'));
        localStorage.clear();
        getUserProfileName.mockResolvedValue('Standard User');
        getAppIdByDeveloperName.mockResolvedValue(null);
        getActiveScheduledMaintenances.mockResolvedValue([
            {
                Id: 'a00000000000001AAA',
                Subject__c: 'Release',
                Start_Date_Time__c: '2026-10-09T17:00:00.000Z',
                End_Date_Time__c: '2026-10-09T18:00:00.000Z',
                Alert_Frequency__c: 'Daily',
                Dismissible__c: true,
                Applicable_Apps__c: 'System'
            }
        ]);

        const element = createElement('c-scheduled-maintenance-component', { is: ScheduledMaintenanceComponent });
        document.body.appendChild(element);
        await flushPromises();

        const start = Array.from(element.shadowRoot.querySelectorAll('p')).find((p) => p.textContent.startsWith('Start:'));
        // 17:00 UTC is 19:00 in Berlin, written the German way
        expect(start.textContent).toBe('Start: 09.10.26, 19:00');
    });
});

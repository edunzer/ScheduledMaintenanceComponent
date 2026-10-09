import { createElement } from 'lwc';
import ScheduledMaintenanceComponent from 'c/scheduledMaintenanceComponent';
import getActiveScheduledMaintenances from '@salesforce/apex/ScheduledMaintenanceService.getActiveScheduledMaintenances';
import getAppIdByDeveloperName from '@salesforce/apex/ScheduledMaintenanceService.getAppIdByDeveloperName';
import getUserLocaleInfo from '@salesforce/apex/ScheduledMaintenanceService.getUserLocaleInfo';
import getUserProfileName from '@salesforce/apex/ScheduledMaintenanceService.getUserProfileName';

// sfdx-lwc-jest resolves @salesforce/i18n/timeZone to America/Los_Angeles and locale to en-US.
jest.mock('@salesforce/apex/ScheduledMaintenanceService.getActiveScheduledMaintenances', () => ({ default: jest.fn() }), { virtual: true });
jest.mock('@salesforce/apex/ScheduledMaintenanceService.getAppIdByDeveloperName', () => ({ default: jest.fn() }), { virtual: true });
jest.mock('@salesforce/apex/ScheduledMaintenanceService.getUserLocaleInfo', () => ({ default: jest.fn() }), { virtual: true });
jest.mock('@salesforce/apex/ScheduledMaintenanceService.getUserProfileName', () => ({ default: jest.fn() }), { virtual: true });

// Lets the chained Apex promises settle without advancing the fake clock.
const flushPromises = async () => {
    for (let i = 0; i < 20; i++) {
        await Promise.resolve();
    }
};

// Paragraphs inside the maintenance cards, which render in their own shadow roots.
const cardParagraphs = (element) =>
    Array.from(element.shadowRoot.querySelectorAll('c-maintenance-card')).flatMap((card) => Array.from(card.shadowRoot.querySelectorAll('p')));

describe('c-scheduled-maintenance-component startup', () => {
    let element;

    beforeEach(async () => {
        jest.useFakeTimers();
        jest.setSystemTime(new Date('2026-10-09T16:00:00Z'));
        localStorage.clear();
        getUserProfileName.mockResolvedValue('Standard User');
        // Not used anymore; a different time zone here shows the component no longer relies on it
        getUserLocaleInfo.mockResolvedValue({ timeZone: 'Australia/Brisbane', locale: 'en_AU' });
        getAppIdByDeveloperName.mockResolvedValue(null);
        getActiveScheduledMaintenances.mockResolvedValue([
            {
                Id: 'a00000000000001AAA',
                Subject__c: 'Release',
                Description__c: 'Release window',
                Start_Date_Time__c: '2026-10-09T17:00:00.000Z',
                End_Date_Time__c: '2026-10-09T18:00:00.000Z',
                Alert_Frequency__c: 'Daily',
                Dismissible__c: true,
                Applicable_Apps__c: 'System'
            }
        ]);

        element = createElement('c-scheduled-maintenance-component', { is: ScheduledMaintenanceComponent });
        document.body.appendChild(element);
        await flushPromises();
    });

    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
        jest.clearAllMocks();
        jest.useRealTimers();
    });

    it('fetches maintenances once on load', () => {
        expect(getActiveScheduledMaintenances).toHaveBeenCalledTimes(1);
    });

    it('does not call Apex for the locale and time zone', () => {
        expect(getUserLocaleInfo).not.toHaveBeenCalled();
    });

    it("formats dates in the user's Salesforce time zone", () => {
        const start = cardParagraphs(element).find((p) => p.textContent.startsWith('Start:'));
        // 17:00 UTC is 10:00am in America/Los_Angeles
        expect(start.textContent).toMatch(/10\/09\/26, 10:00\sAM/);
    });
});

import { createElement } from 'lwc';
import ScheduledMaintenanceComponent from 'c/scheduledMaintenanceComponent';
import getActiveScheduledMaintenances from '@salesforce/apex/ScheduledMaintenanceService.getActiveScheduledMaintenances';
import getAppByDeveloperName from '@salesforce/apex/ScheduledMaintenanceService.getAppByDeveloperName';
import getUserLocaleInfo from '@salesforce/apex/ScheduledMaintenanceService.getUserLocaleInfo';
import getUserProfileName from '@salesforce/apex/ScheduledMaintenanceService.getUserProfileName';

jest.mock('@salesforce/apex/ScheduledMaintenanceService.getActiveScheduledMaintenances', () => ({ default: jest.fn() }), { virtual: true });
jest.mock('@salesforce/apex/ScheduledMaintenanceService.getAppByDeveloperName', () => ({ default: jest.fn() }), { virtual: true });
jest.mock('@salesforce/apex/ScheduledMaintenanceService.getUserLocaleInfo', () => ({ default: jest.fn() }), { virtual: true });
jest.mock('@salesforce/apex/ScheduledMaintenanceService.getUserProfileName', () => ({ default: jest.fn() }), { virtual: true });

const hoursFromNow = (hours) => new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
const maintenance = (id, startHours, endHours) => ({
    Id: id,
    Subject__c: 'Release ' + id,
    Description__c: 'Line one\nLine two',
    Start_Date_Time__c: hoursFromNow(startHours),
    End_Date_Time__c: hoursFromNow(endHours),
    Alert_Frequency__c: 'Daily',
    Dismissible__c: true,
    Applicable_Apps__c: 'System'
});

// Lets the chained Apex promises in connectedCallback settle.
const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

// Paragraphs inside the maintenance cards, which render in their own shadow roots.
const cardParagraphs = (element) =>
    Array.from(element.shadowRoot.querySelectorAll('c-maintenance-card')).flatMap((card) => Array.from(card.shadowRoot.querySelectorAll('p')));

describe('c-scheduled-maintenance-component description', () => {
    beforeEach(() => {
        localStorage.clear();
        getUserProfileName.mockResolvedValue('Standard User');
        getUserLocaleInfo.mockResolvedValue({ timeZone: 'America/Los_Angeles', locale: 'en_US' });
        getAppByDeveloperName.mockResolvedValue(null);
    });

    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
        jest.clearAllMocks();
    });

    // Reminders on their own, and the "Happening now" / "Coming up" groups
    it.each([
        ['reminder view', [maintenance('a01', 1, 2)]],
        ['Happening now and Coming up groups', [maintenance('a01', -1, 1), maintenance('a02', 1, 2)]]
    ])('keeps line breaks in descriptions in the %s', async (view, records) => {
        getActiveScheduledMaintenances.mockResolvedValue(records);
        const element = createElement('c-scheduled-maintenance-component', { is: ScheduledMaintenanceComponent });
        document.body.appendChild(element);
        await flushPromises();

        const descriptions = cardParagraphs(element).filter((p) => p.textContent === 'Line one\nLine two');
        expect(descriptions).toHaveLength(records.length);
        descriptions.forEach((p) => expect(p.classList).toContain('multi-line'));
    });
});

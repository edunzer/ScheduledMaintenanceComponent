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

const hoursFromNow = (hours) => new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
const maintenance = (startHours, endHours) => ({
    Id: 'a00000000000001AAA',
    Subject__c: 'Release',
    Description__c: 'Release window',
    Start_Date_Time__c: hoursFromNow(startHours),
    End_Date_Time__c: hoursFromNow(endHours),
    Alert_Frequency__c: 'Daily',
    Dismissible__c: true,
    Applicable_Apps__c: 'System'
});
const IN_PROGRESS = maintenance(-1, 1);
const UPCOMING = maintenance(1, 2);

// Lets the chained Apex promises in connectedCallback settle.
const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('c-scheduled-maintenance-component title', () => {
    beforeEach(() => {
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
    });

    async function renderTitle(records, props = {}) {
        getActiveScheduledMaintenances.mockResolvedValue(records);
        const element = createElement('c-scheduled-maintenance-component', { is: ScheduledMaintenanceComponent });
        Object.assign(element, props);
        document.body.appendChild(element);
        await flushPromises();
        return element.shadowRoot.querySelector('header h2').textContent;
    }

    it('uses the default alert title while a maintenance is in progress', async () => {
        expect(await renderTitle([IN_PROGRESS])).toBe('Scheduled Maintenance Alert');
    });

    it('uses the default reminder title when maintenances are only upcoming', async () => {
        expect(await renderTitle([UPCOMING])).toBe('Scheduled Maintenance Reminder');
    });

    it('shows the configured alert title instead of overwriting it', async () => {
        expect(await renderTitle([IN_PROGRESS], { title: 'Planned Outage' })).toBe('Planned Outage');
    });

    it('shows the configured reminder title', async () => {
        expect(await renderTitle([UPCOMING], { reminderTitle: 'Coming Up' })).toBe('Coming Up');
    });

    it('keeps the configured title on the public property', async () => {
        getActiveScheduledMaintenances.mockResolvedValue([UPCOMING]);
        const element = createElement('c-scheduled-maintenance-component', { is: ScheduledMaintenanceComponent });
        element.title = 'Planned Outage';
        document.body.appendChild(element);
        await flushPromises();

        expect(element.title).toBe('Planned Outage');
    });
});

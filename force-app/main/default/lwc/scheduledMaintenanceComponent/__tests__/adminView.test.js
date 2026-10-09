import { createElement } from 'lwc';
import ScheduledMaintenanceComponent from 'c/scheduledMaintenanceComponent';
import getActiveScheduledMaintenances from '@salesforce/apex/ScheduledMaintenanceService.getActiveScheduledMaintenances';
import getAppIdByDeveloperName from '@salesforce/apex/ScheduledMaintenanceService.getAppIdByDeveloperName';
import getUserProfileName from '@salesforce/apex/ScheduledMaintenanceService.getUserProfileName';

// Users get the shared stub for the bypass permission (false).
jest.mock('@salesforce/apex/ScheduledMaintenanceService.getActiveScheduledMaintenances', () => ({ default: jest.fn() }), { virtual: true });
jest.mock('@salesforce/apex/ScheduledMaintenanceService.getAppIdByDeveloperName', () => ({ default: jest.fn() }), { virtual: true });
jest.mock('@salesforce/apex/ScheduledMaintenanceService.getUserProfileName', () => ({ default: jest.fn() }), { virtual: true });

// An in-progress, non-dismissible System maintenance: a full lock.
const SYSTEM_LOCK = {
    Id: 'a00000000000001AAA',
    Subject__c: 'System upgrade',
    Description__c: 'Salesforce is unavailable',
    Start_Date_Time__c: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    End_Date_Time__c: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    Alert_Frequency__c: 'Daily',
    Dismissible__c: false,
    Applicable_Apps__c: 'System'
};

// Lets the chained Apex promises in connectedCallback settle.
const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('c-scheduled-maintenance-component admin view', () => {
    beforeEach(() => {
        localStorage.clear();
        getAppIdByDeveloperName.mockResolvedValue(null);
        getActiveScheduledMaintenances.mockResolvedValue([SYSTEM_LOCK]);
    });

    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
        jest.clearAllMocks();
    });

    async function render() {
        const element = createElement('c-scheduled-maintenance-component', { is: ScheduledMaintenanceComponent });
        document.body.appendChild(element);
        await flushPromises();
        return {
            adminView: element.shadowRoot.textContent.includes('(Admin View)'),
            modal: element.shadowRoot.querySelector('section[role="dialog"]') !== null
        };
    }

    it('shows the admin view to the System Administrator profile', async () => {
        getUserProfileName.mockResolvedValue('System Administrator');

        expect(await render()).toEqual({ adminView: true, modal: false });
    });

    it('locks other users', async () => {
        getUserProfileName.mockResolvedValue('Custom: System Admin');

        expect(await render()).toEqual({ adminView: false, modal: true });
    });
});

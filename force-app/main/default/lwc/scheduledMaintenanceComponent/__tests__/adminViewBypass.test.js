import { createElement } from 'lwc';
import ScheduledMaintenanceComponent from 'c/scheduledMaintenanceComponent';
import getActiveScheduledMaintenances from '@salesforce/apex/ScheduledMaintenanceService.getActiveScheduledMaintenances';
import getAppByDeveloperName from '@salesforce/apex/ScheduledMaintenanceService.getAppByDeveloperName';
import getUserProfileName from '@salesforce/apex/ScheduledMaintenanceService.getUserProfileName';

// Each test file loads the component once, so the permission is fixed for this file.
jest.mock('@salesforce/customPermission/Bypass_Scheduled_Maintenance', () => ({ __esModule: true, default: true }));
jest.mock('@salesforce/apex/ScheduledMaintenanceService.getActiveScheduledMaintenances', () => ({ default: jest.fn() }), { virtual: true });
jest.mock('@salesforce/apex/ScheduledMaintenanceService.getAppByDeveloperName', () => ({ default: jest.fn() }), { virtual: true });
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

describe('c-scheduled-maintenance-component admin view with the bypass permission', () => {
    beforeEach(() => {
        localStorage.clear();
        getAppByDeveloperName.mockResolvedValue(null);
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
            adminView: element.shadowRoot.querySelector('.admin-status') !== null,
            modal: element.shadowRoot.querySelector('section.slds-modal') !== null
        };
    }

    it('shows the admin view, not the lock, to users with the bypass permission', async () => {
        getUserProfileName.mockResolvedValue('Custom: System Admin');

        expect(await render()).toEqual({ adminView: true, modal: false });
    });

    it('still honors the bypass permission if the profile lookup fails', async () => {
        getUserProfileName.mockRejectedValue(new Error('No access'));

        expect(await render()).toEqual({ adminView: true, modal: false });
    });
});

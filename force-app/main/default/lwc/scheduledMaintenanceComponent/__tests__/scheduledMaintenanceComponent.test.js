import { createElement } from 'lwc';
import ScheduledMaintenanceComponent from 'c/scheduledMaintenanceComponent';
import getActiveScheduledMaintenances from '@salesforce/apex/ScheduledMaintenanceService.getActiveScheduledMaintenances';
import getAppByDeveloperName from '@salesforce/apex/ScheduledMaintenanceService.getAppByDeveloperName';
import getUserLocaleInfo from '@salesforce/apex/ScheduledMaintenanceService.getUserLocaleInfo';
import getUserProfileName from '@salesforce/apex/ScheduledMaintenanceService.getUserProfileName';

// The URL the platform builds for the exit app; null where app navigation isn't available (Experience Cloud).
const mockGenerateUrl = jest.fn();
jest.mock('lightning/navigation', () => {
    const Navigate = Symbol('Navigate');
    const GenerateUrl = Symbol('GenerateUrl');
    const NavigationMixin = (Base) =>
        class extends Base {
            [Navigate]() {}
            [GenerateUrl](pageReference) {
                return mockGenerateUrl(pageReference);
            }
        };
    NavigationMixin.Navigate = Navigate;
    NavigationMixin.GenerateUrl = GenerateUrl;
    return { NavigationMixin };
});
jest.mock('@salesforce/apex/ScheduledMaintenanceService.getActiveScheduledMaintenances', () => ({ default: jest.fn() }), { virtual: true });
jest.mock('@salesforce/apex/ScheduledMaintenanceService.getAppByDeveloperName', () => ({ default: jest.fn() }), { virtual: true });
jest.mock('@salesforce/apex/ScheduledMaintenanceService.getUserLocaleInfo', () => ({ default: jest.fn() }), { virtual: true });
jest.mock('@salesforce/apex/ScheduledMaintenanceService.getUserProfileName', () => ({ default: jest.fn() }), { virtual: true });

// An in-progress, non-dismissible maintenance for CRM only: an app lock, not a full system lock.
const APP_LOCK_MAINTENANCE = {
    Id: 'a00000000000001AAA',
    Subject__c: 'CRM upgrade',
    Description__c: 'CRM is unavailable',
    Start_Date_Time__c: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    End_Date_Time__c: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    Alert_Frequency__c: 'Daily',
    Dismissible__c: false,
    Applicable_Apps__c: 'CRM'
};

// Lets the chained Apex promises in connectedCallback settle.
const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('c-scheduled-maintenance-component', () => {
    beforeEach(() => {
        mockGenerateUrl.mockImplementation((pageReference) => Promise.resolve('/lightning/app/' + pageReference.attributes.appTarget));
        getUserProfileName.mockResolvedValue('Standard User');
        getUserLocaleInfo.mockResolvedValue({ timeZone: 'America/Los_Angeles', locale: 'en_US' });
        getActiveScheduledMaintenances.mockResolvedValue([]);
        getAppByDeveloperName.mockResolvedValue(null);
    });

    afterEach(() => {
        // The jsdom instance is shared across test cases in a single file so reset the DOM
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
        jest.clearAllMocks();
    });

    describe('exit app button', () => {
        async function renderAppLock(props = {}) {
            getActiveScheduledMaintenances.mockResolvedValue([APP_LOCK_MAINTENANCE]);
            const element = createElement('c-scheduled-maintenance-component', {
                is: ScheduledMaintenanceComponent
            });
            Object.assign(element, { currentAppContext: 'CRM' }, props);
            document.body.appendChild(element);
            await flushPromises();
            return element;
        }

        const getFooterButtons = (element) => element.shadowRoot.querySelectorAll('footer lightning-button');

        it('navigates to the Welcome app by default when it is found', async () => {
            getAppByDeveloperName.mockResolvedValue({ durableId: '06m000000000001AAA', label: 'Welcome' });

            const element = await renderAppLock();

            expect(getAppByDeveloperName).toHaveBeenCalledWith({ developerName: 'Welcome' });
            expect(mockGenerateUrl).toHaveBeenCalledWith({ type: 'standard__app', attributes: { appTarget: '06m000000000001AAA' } });
            const buttons = getFooterButtons(element);
            expect(buttons).toHaveLength(1);
            expect(buttons[0].label).toBe('Go to Welcome');
        });

        it('looks up the configured exit app and shows its label', async () => {
            getAppByDeveloperName.mockResolvedValue({ durableId: '06m000000000002AAA', label: 'Sales Console' });

            const element = await renderAppLock({ exitAppDeveloperName: 'Sales_Console' });

            expect(getAppByDeveloperName).toHaveBeenCalledWith({ developerName: 'Sales_Console' });
            expect(getFooterButtons(element)[0].label).toBe('Go to Sales Console');
        });

        it('is hidden when the exit app is not found', async () => {
            getAppByDeveloperName.mockResolvedValue(null);

            const element = await renderAppLock();

            expect(element.shadowRoot.querySelector('section.slds-modal')).not.toBeNull();
            expect(getFooterButtons(element)).toHaveLength(0);
        });

        it('is hidden where the platform cannot navigate to apps, such as Experience Cloud sites', async () => {
            getAppByDeveloperName.mockResolvedValue({ durableId: '06m000000000001AAA', label: 'Welcome' });
            mockGenerateUrl.mockResolvedValue(null);

            const element = await renderAppLock();

            expect(element.shadowRoot.querySelector('section.slds-modal')).not.toBeNull();
            expect(getFooterButtons(element)).toHaveLength(0);
        });

        it('is hidden if building the app URL fails', async () => {
            getAppByDeveloperName.mockResolvedValue({ durableId: '06m000000000001AAA', label: 'Welcome' });
            mockGenerateUrl.mockRejectedValue(new Error('Unsupported page reference'));
            const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

            const element = await renderAppLock();

            expect(getFooterButtons(element)).toHaveLength(0);
            consoleError.mockRestore();
        });
    });
});

import { createElement } from 'lwc';
import ScheduledMaintenanceComponent from 'c/scheduledMaintenanceComponent';
import getActiveScheduledMaintenances from '@salesforce/apex/ScheduledMaintenanceService.getActiveScheduledMaintenances';
import getAppIdByDeveloperName from '@salesforce/apex/ScheduledMaintenanceService.getAppIdByDeveloperName';
import getUserProfileName from '@salesforce/apex/ScheduledMaintenanceService.getUserProfileName';

jest.mock('@salesforce/apex/ScheduledMaintenanceService.getActiveScheduledMaintenances', () => ({ default: jest.fn() }), { virtual: true });
jest.mock('@salesforce/apex/ScheduledMaintenanceService.getAppIdByDeveloperName', () => ({ default: jest.fn() }), { virtual: true });
jest.mock('@salesforce/apex/ScheduledMaintenanceService.getUserProfileName', () => ({ default: jest.fn() }), { virtual: true });

const hoursFromNow = (hours) => new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
const maintenance = (dismissible) => ({
    Id: 'a00000000000001AAA',
    Subject__c: 'System upgrade',
    Description__c: 'Salesforce is unavailable',
    Start_Date_Time__c: hoursFromNow(-1),
    End_Date_Time__c: hoursFromNow(1),
    Alert_Frequency__c: 'Daily',
    Dismissible__c: dismissible,
    Applicable_Apps__c: 'System'
});

// Lets the chained Apex promises in connectedCallback settle.
const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('c-scheduled-maintenance-component keyboard and screen reader support', () => {
    beforeEach(() => {
        localStorage.clear();
        getUserProfileName.mockResolvedValue('Standard User');
        getAppIdByDeveloperName.mockResolvedValue(null);
    });

    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
        jest.clearAllMocks();
    });

    async function render(dismissible) {
        getActiveScheduledMaintenances.mockResolvedValue([maintenance(dismissible)]);
        const element = createElement('c-scheduled-maintenance-component', { is: ScheduledMaintenanceComponent });
        document.body.appendChild(element);
        await flushPromises();
        return element;
    }

    const getDialog = (element) => element.shadowRoot.querySelector('section[role="dialog"]');
    const pressEscape = (element) =>
        getDialog(element).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }));

    it('labels the dialog with its heading and content', async () => {
        const element = await render(true);
        const dialog = getDialog(element);

        expect(dialog.getAttribute('aria-labelledby')).toBe(element.shadowRoot.querySelector('header h2').id);
        expect(dialog.getAttribute('aria-describedby')).toBe(element.shadowRoot.querySelector('.slds-modal__content').id);
    });

    it('moves focus into the dialog when it opens', async () => {
        const element = await render(true);

        expect(element.shadowRoot.activeElement).toBe(getDialog(element));
    });

    it('closes on Escape when the alert can be dismissed', async () => {
        const element = await render(true);

        pressEscape(element);
        await flushPromises();

        expect(getDialog(element)).toBeNull();
    });

    it('stays open on Escape during a lock', async () => {
        const element = await render(false);

        pressEscape(element);
        await flushPromises();

        expect(getDialog(element)).not.toBeNull();
    });

    it('wraps Tab and Shift+Tab around inside the dialog', async () => {
        const element = await render(true);
        const [startGuard, endGuard] = element.shadowRoot.querySelectorAll('div[tabindex="0"]');
        const footerButton = element.shadowRoot.querySelector('footer lightning-button');
        footerButton.focus = jest.fn();

        // Tab past the last control reaches the guard after the dialog, which sends focus back to the top
        endGuard.focus();
        expect(element.shadowRoot.activeElement).toBe(getDialog(element));

        // Shift+Tab from the top reaches the guard before the dialog, which sends focus to the footer button
        startGuard.focus();
        expect(footerButton.focus).toHaveBeenCalled();
    });
});

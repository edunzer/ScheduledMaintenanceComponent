import { createElement } from 'lwc';
import MaintenanceCard from 'c/maintenanceCard';

// A record as prepared by maintenanceUtils.toDisplayRecord
const MAINTENANCE = {
    Id: 'a00000000000001AAA',
    Subject: 'CRM upgrade',
    Description__c: 'Line one\nLine two',
    dateRange: 'Fri, Oct 9, 10:00 – 11:00 AM PDT',
    affects: 'CRM, PSA',
    lockLabel: '',
    lockActive: false
};

describe('c-maintenance-card', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    function render(maintenance) {
        const element = createElement('c-maintenance-card', { is: MaintenanceCard });
        element.maintenance = maintenance;
        document.body.appendChild(element);
        return element;
    }

    it('shows the subject, date range, description and affected apps', () => {
        const element = render(MAINTENANCE);
        const text = (selector) => element.shadowRoot.querySelector(selector).textContent.trim();

        expect(element.shadowRoot.querySelector('h3').textContent).toBe('CRM upgrade');
        expect(text('.date-range')).toBe('Fri, Oct 9, 10:00 – 11:00 AM PDT');
        expect(text('.multi-line')).toBe('Line one\nLine two');
        expect(text('.affects')).toBe('Affects: CRM, PSA');
    });

    it('leaves out a blank description', () => {
        const element = render({ ...MAINTENANCE, Description__c: undefined });

        expect(element.shadowRoot.querySelector('.multi-line')).toBeNull();
    });

    it('shows a lock badge only for a maintenance that cannot be dismissed, highlighted while it locks', () => {
        expect(render(MAINTENANCE).shadowRoot.querySelector('lightning-badge')).toBeNull();

        const locking = render({ ...MAINTENANCE, lockLabel: 'Locks CRM, PSA', lockActive: true }).shadowRoot.querySelector('lightning-badge');
        expect(locking.label).toBe('Locks CRM, PSA');
        expect(locking.iconName).toBe('utility:lock');
        expect(locking.classList).toContain('slds-theme_warning');

        const upcoming = render({ ...MAINTENANCE, lockLabel: 'Will lock CRM, PSA' }).shadowRoot.querySelector('lightning-badge');
        expect(upcoming.label).toBe('Will lock CRM, PSA');
        expect(upcoming.classList).not.toContain('slds-theme_warning');
    });
});

import { createElement } from 'lwc';
import MaintenanceCard from 'c/maintenanceCard';

const MAINTENANCE = {
    Id: 'a00000000000001AAA',
    Subject: 'CRM upgrade',
    Description__c: 'Line one\nLine two',
    startDisplay: '10/09/26, 10:00 AM',
    endDisplay: '10/09/26, 11:00 AM',
    Dismissible__c: true,
    BadgeLabel: '',
    appBadges: ['CRM', 'PSA']
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

    it('shows the subject, description and times', () => {
        const element = render(MAINTENANCE);

        expect(element.shadowRoot.querySelector('h2').textContent).toBe('CRM upgrade');
        const paragraphs = Array.from(element.shadowRoot.querySelectorAll('p')).map((p) => p.textContent);
        expect(paragraphs).toEqual(['Description: Line one\nLine two', 'Start: 10/09/26, 10:00 AM', 'End: 10/09/26, 11:00 AM']);
        expect(element.shadowRoot.querySelector('p').classList).toContain('multi-line');
    });

    it('lists the applicable apps', () => {
        const element = render(MAINTENANCE);

        const apps = Array.from(element.shadowRoot.querySelectorAll('.slds-badge_lightest')).map((span) => span.textContent);
        expect(apps).toEqual(['CRM', 'PSA']);
    });

    it('shows the lock badge only for a maintenance that cannot be dismissed', () => {
        expect(render(MAINTENANCE).shadowRoot.querySelector('lightning-badge')).toBeNull();

        const locked = render({ ...MAINTENANCE, Dismissible__c: false, BadgeLabel: 'Requires App Lock' });
        expect(locked.shadowRoot.querySelector('lightning-badge').label).toBe('Requires App Lock');
    });
});

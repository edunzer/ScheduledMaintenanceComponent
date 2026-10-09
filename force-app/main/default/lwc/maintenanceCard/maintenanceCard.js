import { LightningElement, api } from 'lwc';

// One maintenance in the Scheduled Maintenance modal: subject, lock badge, date range, description and affected apps.
export default class MaintenanceCard extends LightningElement {
    // A record prepared by maintenanceUtils.toDisplayRecord, with Subject, dateRange, affects, lockLabel and lockActive
    @api maintenance;

    // Orange while the maintenance locks; neutral for one that will lock later
    get lockBadgeClass() {
        return this.maintenance.lockActive ? 'slds-theme_warning' : '';
    }
}

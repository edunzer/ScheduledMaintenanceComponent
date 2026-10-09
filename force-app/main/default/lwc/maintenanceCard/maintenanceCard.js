import { LightningElement, api } from 'lwc';

// One maintenance in the Scheduled Maintenance modal: subject, description, times, lock badge and applicable apps.
export default class MaintenanceCard extends LightningElement {
    // A record prepared by scheduledMaintenanceComponent, with Subject, startDisplay, endDisplay, BadgeLabel and appBadges
    @api maintenance;

    get showLockBadge() {
        return !this.maintenance.Dismissible__c;
    }

    get hasAppBadges() {
        return Array.isArray(this.maintenance.appBadges) && this.maintenance.appBadges.length > 0;
    }
}

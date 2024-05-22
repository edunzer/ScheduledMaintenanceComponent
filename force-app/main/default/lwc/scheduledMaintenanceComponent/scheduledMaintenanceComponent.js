import { LightningElement, api, wire, track } from 'lwc';
import getActiveScheduledMaintenances from '@salesforce/apex/ScheduledMaintenanceService.getActiveScheduledMaintenances';
import getAppIdByDeveloperName from '@salesforce/apex/ScheduledMaintenanceService.getAppIdByDeveloperName';
import { NavigationMixin } from 'lightning/navigation';
// Extends LightningElement to create a custom element.
export default class ScheduledMaintenanceComponent extends NavigationMixin(LightningElement) {
    @track scheduledMaintenances = []; // Tracks the state of maintenance records
    @track appId = null;               // Stores the App ID for navigation
    @track isModalOpen = false;        // Controls the visibility of the modal
    @track isDismissible = true;       // Determines if the modal can be dismissed
    @track isSystemMaintenance = false;// Indicates if there's an active system-wide maintenance
    @track isInMaintenance = false;    // Indicates if one of the records is in the maintenance window 
    @track isFullLock = false;         // Indicates if the application is fully locked due to maintenance
    @api title = 'Scheduled Maintenance Alert'; // Default Title
    @api currentAppContext;            // Public property for application context
    @track activeSectionName = '';     // Stores the name of the active section in accordion

    intervalId = null;                 // Interval ID for clearing intervals

    // Lifecycle hook that's called after the component is inserted into the DOM.
    connectedCallback() {
        this.fetchAppId();
        this.fetchScheduledMaintenances(); // Initial fetch
        this.setupIntervals();
    }

    disconnectedCallback() {
        // Clear intervals when the component is destroyed
        if (this.intervalId) {
            clearInterval(this.intervalId);
        }
    }

    // Fetches the scheduled maintenances from Apex
    fetchScheduledMaintenances() {
        console.log('Fetching scheduled maintenances at', new Date().toLocaleString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }));
        getActiveScheduledMaintenances({ appContext: this.currentAppContext })
            .then(data => {
                const now = new Date();
                this.processScheduledMaintenances(data, now);
            })
            .catch(error => {
                console.error('Error fetching maintenance records:', error);
                this.scheduledMaintenances = [];
                this.isModalOpen = false;
            });
    }

    // Processes the fetched scheduled maintenances
    processScheduledMaintenances(data, now) {
        this.scheduledMaintenances = data.filter(record => this.shouldShowAlert(record, now))
            .map(record => ({
                ...record,
                Start_Date_Time__c: this.formatDateTime(record.Start_Date_Time__c),
                End_Date_Time__c: this.formatDateTime(record.End_Date_Time__c),
                Dismissible: this.calculateDismissible(record, now),
                Subject: record.Subject__c,
                BadgeLabel: !record.Dismissible__c ? (record.Applicable_Apps__c.includes('System') ? 'Requires System Lock' : 'Requires App Lock') : ''
            }));
        if (this.scheduledMaintenances.length > 0) {
            this.activeSectionName = this.scheduledMaintenances[0].Id;
        }
        // Check maintenance status
        data.some(record => {
            const startDate = new Date(record.Start_Date_Time__c);
            const endDate = new Date(record.End_Date_Time__c);
            const isCurrent = now >= startDate && now <= endDate;

            if (isCurrent) {
                this.isInMaintenance = true;
                if (record.Applicable_Apps__c.includes('System')) {
                    this.isSystemMaintenance = true;
                    return true;
                }
            }
            return false;
        });
        this.title = this.isInMaintenance ? 'Scheduled Maintenance Alert' : 'Scheduled Maintenance Reminder';
        this.updateDismissibleStatus();
        this.isModalOpen = this.scheduledMaintenances.length > 0;
    }

    // Setup intervals for fetching data
    setupIntervals() {
        let elapsedTime = 0;
        const firstPhaseInterval = 5 * 60 * 1000; // 5 minutes
        const secondPhaseInterval = 30 * 60 * 1000; // 30 minutes
        const maxTimeFirstPhase = 30 * 60 * 1000; // 30 minutes

        const fetchAndSetupNextInterval = () => {
            this.fetchScheduledMaintenances();
            elapsedTime += firstPhaseInterval;

            if (elapsedTime < maxTimeFirstPhase) {
                this.intervalId = setTimeout(fetchAndSetupNextInterval, firstPhaseInterval);
            } else {
                this.intervalId = setTimeout(fetchAndSetupNextInterval, secondPhaseInterval);
            }
        };

        // Initial fetch
        fetchAndSetupNextInterval();
    }

    // Updates the dismissible status based on system admin rights or maintenance conditions.
    updateDismissibleStatus() {
        const now = new Date();
        this.isFullLock = this.scheduledMaintenances.some(record => {
            const startDate = new Date(record.Start_Date_Time__c);
            const endDate = new Date(record.End_Date_Time__c);
            return record.Applicable_Apps__c.includes('System') && now >= startDate && now <= endDate && !record.Dismissible__c;
        });
        this.isDismissible = !this.isFullLock && this.scheduledMaintenances.every(record => {
            const startDate = new Date(record.Start_Date_Time__c);
            const endDate = new Date(record.End_Date_Time__c);
            return now < startDate || now > endDate || record.Dismissible__c;
        });
        console.log('Is Dismissible: ' + this.isDismissible);
        console.log('Is Full Lock: ' + this.isFullLock);
        console.log('Is in Maintenance: ' + this.isInMaintenance);
        console.log('Is System Maintenance: ' + this.isSystemMaintenance);

    }

    // Determines if a record is dismissible based on its start and end times.
    calculateDismissible(record, now) {
        const startDate = new Date(record.Start_Date_Time__c);
        const endDate = new Date(record.End_Date_Time__c);
        if (now >= startDate && now <= endDate && !record.Dismissible__c) {
            return false; 
        }
        return now < startDate || record.Dismissible__c; 
    }    
    // Fetches the app ID for navigation purposes.
    fetchAppId() {
        getAppIdByDeveloperName({ developerName: 'Welcome' })
            .then(result => {
                this.appId = result;
            })
            .catch(error => {
                console.error('Error fetching App ID:', error);
            });
    }
    // Navigates to another app based on the fetched app ID.
    navigateToApp() {
        if (this.appId) {
            this[NavigationMixin.Navigate]({
                type: 'standard__app',
                attributes: {
                    appTarget: this.appId,
                    actionName: 'view'
                }
            });
        } else {
            console.error('App Durable ID not found, cannot navigate.');
        }
    }
    // Dismisses all records by updating their last dismissed date.
    dismissAllRecords() {
        this.scheduledMaintenances.forEach(record => {
            const today = new Date().toISOString().slice(0, 10);
            localStorage.setItem(`maintenanceDismissed_${record.Id}`, today);
        });
        this.isModalOpen = false;
    }
    
    // Determines if an alert should be shown based on its timing and dismissibility.
    shouldShowAlert(record, currentDate) {
        const startDate = new Date(record.Start_Date_Time__c);
        const endDate = new Date(record.End_Date_Time__c);
        if (currentDate >= startDate && currentDate <= endDate && !record.Dismissible__c) {
            return true;
        }
        const lastDismissedDate = localStorage.getItem(`maintenanceDismissed_${record.Id}`);
        const lastDismissed = lastDismissedDate ? new Date(lastDismissedDate) : null;
        return !lastDismissed || this.frequencyAllowsAlert(record.Alert_Frequency__c, lastDismissed, currentDate);
    }
    // Determines if a maintenance alert should be repeated based on its frequency and the last dismissal date.
    frequencyAllowsAlert(frequency, lastDismissed, currentDate) {
        switch (frequency) {
            case 'Every Visit':
                return true;
            case 'Daily':
                return !lastDismissed || lastDismissed.toISOString().slice(0, 10) !== currentDate.toISOString().slice(0, 10);
            case 'Weekly':
                let oneWeekAgo = new Date(currentDate);
                oneWeekAgo.setDate(currentDate.getDate() - 7);
                return !lastDismissed || lastDismissed < oneWeekAgo;
            default:
                return true;
        }
    }
    // Formats date and time strings for display.
    formatDateTime(dateTime) {
        return new Intl.DateTimeFormat('en-US', {
            year: '2-digit', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', hour12: true
        }).format(new Date(dateTime));
    }
    
}
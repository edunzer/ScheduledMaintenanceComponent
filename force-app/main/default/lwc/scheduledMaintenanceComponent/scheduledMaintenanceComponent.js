import { LightningElement, api, wire, track } from 'lwc';
import getActiveScheduledMaintenances from '@salesforce/apex/ScheduledMaintenanceService.getActiveScheduledMaintenances';
import getAppIdByDeveloperName from '@salesforce/apex/ScheduledMaintenanceService.getAppIdByDeveloperName';
import getUserLocaleInfo from '@salesforce/apex/ScheduledMaintenanceService.getUserLocaleInfo';
import { NavigationMixin } from 'lightning/navigation';
// Extends LightningElement to create a custom element.
export default class ScheduledMaintenanceComponent extends NavigationMixin(LightningElement) {
    @track scheduledMaintenances = [];
    @track appId = null;
    @track isModalOpen = false;
    @track isDismissible = true;
    @track isSystemMaintenance = false;
    @track isInMaintenance = false;
    @track isFullLock = false;
    @api title = 'Scheduled Maintenance Alert';
    @api currentAppContext;
    @track activeSectionName = '';
    @track userTimeZone = null;
    @track userLocale = null;
    intervalId = null;
    _previousIsModalOpen = false;
    _focusableSelectors =
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

    // Lifecycle hook that's called after the component is inserted into the DOM.
    connectedCallback() {
        this.fetchAppId();
        // Fetch user locale/timezone first, then fetch maintenances
        getUserLocaleInfo()
            .then(info => {
                this.userTimeZone = info.timeZone;
                this.userLocale = info.locale;
            })
            .catch(() => {
                this.userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
                this.userLocale = navigator.language || 'en-US';
            })
            .finally(() => {
                this.fetchScheduledMaintenances();
                this.setupIntervals();
            });
    }

    disconnectedCallback() {
        // Clear timeout when the component is destroyed
        if (this.intervalId) {
            clearTimeout(this.intervalId);
        }
    }

    // Moves focus to the first focusable element when the modal opens
    renderedCallback() {
        if (this.isModalOpen && !this._previousIsModalOpen) {
            const firstFocusable = this.template.querySelector(this._focusableSelectors);
            if (firstFocusable) {
                firstFocusable.focus();
            }
        }
        this._previousIsModalOpen = this.isModalOpen;
    }

    // Handles keyboard events for Escape (dismiss) and Tab (focus trapping)
    handleKeyDown(event) {
        if (event.key === 'Escape' && this.isDismissible && !this.isFullLock) {
            this.dismissAllRecords();
            return;
        }
        if (event.key === 'Tab') {
            const focusable = [...this.template.querySelectorAll(this._focusableSelectors)];
            if (focusable.length === 0) return;
            const firstEl = focusable[0];
            const lastEl = focusable[focusable.length - 1];
            const activeEl = this.template.activeElement;
            if (event.shiftKey && activeEl === firstEl) {
                event.preventDefault();
                lastEl.focus();
            } else if (!event.shiftKey && activeEl === lastEl) {
                event.preventDefault();
                firstEl.focus();
            }
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
        // Use user's locale and timezone for formatting
        const userLocale = this.userLocale || navigator.language || 'en-US';
        const userTimeZone = this.userTimeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;
        this.scheduledMaintenances = data.filter(record => this.shouldShowAlert(record, now))
            .map(record => {
                // Parse apps for badge display
                let appBadges = [];
                if (record.Applicable_Apps__c) {
                    // Multi-select picklists in Salesforce use ';' as delimiter
                    appBadges = record.Applicable_Apps__c.split(';').map(app => app.trim()).filter(app => !!app);
                }
                return {
                    ...record,
                    // Preserve raw ISO values for logic
                    startDisplay: this.formatDateTimeLocal(record.Start_Date_Time__c, userLocale, userTimeZone),
                    endDisplay: this.formatDateTimeLocal(record.End_Date_Time__c, userLocale, userTimeZone),
                    Dismissible: this.calculateDismissible(record, now),
                    Subject: record.Subject__c,
                    BadgeLabel: !record.Dismissible__c ? (record.Applicable_Apps__c.includes('System') ? 'Requires System Lock' : 'Requires App Lock') : '',
                    appBadges
                };
            });
        if (this.scheduledMaintenances.length > 0) {
            this.activeSectionName = this.scheduledMaintenances[0].Id;
        }
        // Check maintenance status
        data.some(record => {
            const startDate = this.parseUTCDate(record.Start_Date_Time__c);
            const endDate = this.parseUTCDate(record.End_Date_Time__c);
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
            const startDate = this.parseUTCDate(record.Start_Date_Time__c);
            const endDate = this.parseUTCDate(record.End_Date_Time__c);
            return record.Applicable_Apps__c.includes('System') && now >= startDate && now <= endDate && !record.Dismissible__c;
        });
        this.isDismissible = !this.isFullLock && this.scheduledMaintenances.every(record => {
            const startDate = this.parseUTCDate(record.Start_Date_Time__c);
            const endDate = this.parseUTCDate(record.End_Date_Time__c);
            return now < startDate || now > endDate || record.Dismissible__c;
        });
        console.log('Is Dismissible: ' + this.isDismissible);
        console.log('Is Full Lock: ' + this.isFullLock);
        console.log('Is in Maintenance: ' + this.isInMaintenance);
        console.log('Is System Maintenance: ' + this.isSystemMaintenance);

    }

    // Determines if a record is dismissible based on its start and end times.
    calculateDismissible(record, now) {
        const startDate = this.parseUTCDate(record.Start_Date_Time__c);
        const endDate = this.parseUTCDate(record.End_Date_Time__c);
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
        const startDate = this.parseUTCDate(record.Start_Date_Time__c);
        const endDate = this.parseUTCDate(record.End_Date_Time__c);
        if (currentDate >= startDate && currentDate <= endDate && !record.Dismissible__c) {
            return true;
        }
        const lastDismissedDate = localStorage.getItem(`maintenanceDismissed_${record.Id}`);
        const lastDismissed = lastDismissedDate ? this.parseUTCDate(lastDismissedDate) : null;
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
                let oneWeekAgo = new Date(Date.UTC(currentDate.getUTCFullYear(), currentDate.getUTCMonth(), currentDate.getUTCDate() - 7));
                return !lastDismissed || lastDismissed < oneWeekAgo;
            default:
                return true;
        }
    }

    // Formats date and time strings for display in user's local timezone and locale
    formatDateTimeLocal(dateTime, locale, timeZone) {
        if (!dateTime) return '';
        const d = this.parseUTCDate(dateTime);
        // Fix locale if it uses underscore (e.g., en_AU -> en-AU)
        let safeLocale = locale;
        if (typeof safeLocale === 'string' && safeLocale.includes('_')) {
            safeLocale = safeLocale.replace('_', '-');
        }
        try {
            return d.toLocaleString(safeLocale, {
                year: '2-digit', month: '2-digit', day: '2-digit',
                hour: '2-digit', minute: '2-digit', hour12: true,
                timeZone: timeZone
            });
        } catch (e) {
            // fallback to default locale
            return d.toLocaleString(undefined, {
                year: '2-digit', month: '2-digit', day: '2-digit',
                hour: '2-digit', minute: '2-digit', hour12: true,
                timeZone: timeZone
            });
        }
    }

    // Parse a date string as UTC (expects ISO 8601 with Z)
    parseUTCDate(dateString) {
        if (!dateString) return null;
        // If already a Date, return as is
        if (dateString instanceof Date) return dateString;
        // Always parse as UTC
        return new Date(dateString);
    }
    
}
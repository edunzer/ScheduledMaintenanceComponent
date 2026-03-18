import { LightningElement, api } from 'lwc';
import getActiveScheduledMaintenances from '@salesforce/apex/ScheduledMaintenanceService.getActiveScheduledMaintenances';
import getAppIdByDeveloperName from '@salesforce/apex/ScheduledMaintenanceService.getAppIdByDeveloperName';
import getUserLocaleInfo from '@salesforce/apex/ScheduledMaintenanceService.getUserLocaleInfo';
import getUserProfileName from '@salesforce/apex/ScheduledMaintenanceService.getUserProfileName';
import { NavigationMixin } from 'lightning/navigation';
// Extends LightningElement to create a custom element.
export default class ScheduledMaintenanceComponent extends NavigationMixin(LightningElement) {
    scheduledMaintenances = [];
    appId = null;
    isModalOpen = false;
    isDismissible = true;
    isSystemMaintenance = false;
    isInMaintenance = false;
    isFullLock = false;
    scheduledMaintenances = [];
    inProgressMaintenances = [];
    upcomingMaintenances = [];
    @api title = 'Scheduled Maintenance Alert';
    @api currentAppContext;
    activeSectionName = '';
    userTimeZone = null;
    userLocale = null;
    intervalId = null;
    isAdmin = false;
    profileName = '';

    // Lifecycle hook that's called after the component is inserted into the DOM.
    connectedCallback() {
        this.fetchAppId();
        // Fetch user profile name first
        getUserProfileName()
            .then(profileName => {
                this.profileName = profileName;
                this.isAdmin = profileName === 'System Administrator';
            })
            .catch(() => {
                this.profileName = '';
                this.isAdmin = false;
            })
            .finally(() => {
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
            });
    }

    disconnectedCallback() {
        // Clear timeout when the component is destroyed
        if (this.intervalId) {
            clearTimeout(this.intervalId);
        }
    }

    // Fetches the scheduled maintenances from Apex
    fetchScheduledMaintenances() {
        getActiveScheduledMaintenances({ appContext: this.currentAppContext })
            .then(data => {
                const now = new Date();
                this.processScheduledMaintenances(data, now);
            })
            .catch(error => {
                this.scheduledMaintenances = [];
                this.isModalOpen = false;
            });
    }

    // Processes the fetched scheduled maintenances
    processScheduledMaintenances(data, now) {
        // Use user's locale and timezone for formatting
        const userLocale = this.userLocale || navigator.language || 'en-US';
        const userTimeZone = this.userTimeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;
        // Map and format all records first
        const allRecords = data.filter(record => this.shouldShowAlert(record, now)).map(record => {
            let appBadges = [];
            if (record.Applicable_Apps__c) {
                appBadges = record.Applicable_Apps__c.split(';').map(app => app.trim()).filter(app => !!app);
            }
            return {
                ...record,
                startDisplay: this.formatDateTimeLocal(record.Start_Date_Time__c, userLocale, userTimeZone),
                endDisplay: this.formatDateTimeLocal(record.End_Date_Time__c, userLocale, userTimeZone),
                Dismissible: this.calculateDismissible(record, now),
                Subject: record.Subject__c,
                BadgeLabel: !record.Dismissible__c ? (record.Applicable_Apps__c.includes('System') ? 'Requires System Lock' : 'Requires App Lock') : '',
                appBadges
            };
        });

        // Split into in progress and upcoming
        const inProgress = [];
        const upcoming = [];
        allRecords.forEach(record => {
            const startDate = this.parseUTCDate(record.Start_Date_Time__c);
            const endDate = this.parseUTCDate(record.End_Date_Time__c);
            if (now >= startDate && now <= endDate) {
                inProgress.push(record);
            } else if (now < startDate) {
                upcoming.push(record);
            }
        });

        // Sort inProgress: locking first, then by start date
        inProgress.sort((a, b) => {
            const aLock = a.Applicable_Apps__c && a.Applicable_Apps__c.includes('System') && !a.Dismissible__c ? 0 : 1;
            const bLock = b.Applicable_Apps__c && b.Applicable_Apps__c.includes('System') && !b.Dismissible__c ? 0 : 1;
            if (aLock !== bLock) return aLock - bLock;
            return new Date(a.Start_Date_Time__c) - new Date(b.Start_Date_Time__c);
        });
        // Sort upcoming by start date
        upcoming.sort((a, b) => new Date(a.Start_Date_Time__c) - new Date(b.Start_Date_Time__c));

        this.inProgressMaintenances = inProgress;
        this.upcomingMaintenances = upcoming;
        this.scheduledMaintenances = allRecords;

        // Set active section logic
        if (inProgress.length > 0) {
            this.activeSectionName = 'inProgress';
        } else if (upcoming.length > 0) {
            this.activeSectionName = 'upcoming';
        } else {
            this.activeSectionName = '';
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
        this.isModalOpen = allRecords.length > 0;
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
        // Load or initialize the dismissal array
        let dismissedArr = [];
        try {
            dismissedArr = JSON.parse(localStorage.getItem('scheduledMaintenance_dismissed')) || [];
        } catch (e) {
            dismissedArr = [];
        }
        const now = new Date().toISOString();
        this.scheduledMaintenances.forEach(record => {
            // Remove any previous dismissal for this record
            dismissedArr = dismissedArr.filter(item => item.recordId !== record.Id);
            // Add new dismissal
            dismissedArr.push({ recordId: record.Id, dismissedAt: now });
        });
        localStorage.setItem('scheduledMaintenance_dismissed', JSON.stringify(dismissedArr));
        this.isModalOpen = false;
    }
    
    // Determines if an alert should be shown based on its timing and dismissibility.
    shouldShowAlert(record, currentDate) {
        const startDate = this.parseUTCDate(record.Start_Date_Time__c);
        const endDate = this.parseUTCDate(record.End_Date_Time__c);
        if (currentDate >= startDate && currentDate <= endDate && !record.Dismissible__c) {
            return true;
        }
        // Load dismissals array
        let dismissedArr = [];
        try {
            dismissedArr = JSON.parse(localStorage.getItem('scheduledMaintenance_dismissed')) || [];
        } catch (e) {
            dismissedArr = [];
        }
        // Find the most recent dismissal for this record
        const dismissal = dismissedArr.find(item => item.recordId === record.Id);
        let lastDismissed = null;
        if (dismissal) {
            lastDismissed = this.parseUTCDate(dismissal.dismissedAt);
        }
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
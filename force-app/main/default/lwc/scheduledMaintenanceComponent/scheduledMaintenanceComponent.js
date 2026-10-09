import { LightningElement, api } from 'lwc';
import getActiveScheduledMaintenances from '@salesforce/apex/ScheduledMaintenanceService.getActiveScheduledMaintenances';
import getAppIdByDeveloperName from '@salesforce/apex/ScheduledMaintenanceService.getAppIdByDeveloperName';
import locale from '@salesforce/i18n/locale';
import timeZone from '@salesforce/i18n/timeZone';
import getUserProfileName from '@salesforce/apex/ScheduledMaintenanceService.getUserProfileName';
import communityId from '@salesforce/community/Id';
import hasBypassPermission from '@salesforce/customPermission/Bypass_Scheduled_Maintenance';
import { NavigationMixin } from 'lightning/navigation';
// Extends LightningElement to create a custom element.
export default class ScheduledMaintenanceComponent extends NavigationMixin(LightningElement) {
    scheduledMaintenances = [];
    appId = null;
    isModalOpen = false;
    isDismissible = true;
    // IDs of records dismissed during this page visit; used for the 'Every Visit' frequency.
    dismissedThisVisit = new Set();
    isSystemMaintenance = false;
    isInMaintenance = false;
    isFullLock = false;
    scheduledMaintenances = [];
    inProgressMaintenances = [];
    upcomingMaintenances = [];
    @api title = 'Scheduled Maintenance Alert';
    @api reminderTitle = 'Scheduled Maintenance Reminder';
    @api currentAppContext;
    @api exitAppDeveloperName = 'Welcome';
    activeSectionName = '';
    // The user's Salesforce time zone and locale, available without an Apex call
    userTimeZone = timeZone;
    userLocale = locale;
    intervalId = null;
    boundaryTimeoutId = null;
    isAdmin = false;
    profileName = '';

    // Lifecycle hook that's called after the component is inserted into the DOM.
    connectedCallback() {
        this.fetchAppId();
        // Users with the bypass permission or the System Administrator profile see the admin view instead of the lock
        getUserProfileName()
            .then(profileName => {
                this.profileName = profileName;
                this.isAdmin = hasBypassPermission || profileName === 'System Administrator';
            })
            .catch(() => {
                this.profileName = '';
                this.isAdmin = hasBypassPermission;
            })
            .finally(() => {
                // Fetches maintenances straight away, then on a schedule
                this.setupIntervals();
            });
    }

    disconnectedCallback() {
        // Clear timeout when the component is destroyed
        if (this.intervalId) {
            clearTimeout(this.intervalId);
        }
        clearTimeout(this.boundaryTimeoutId);
        document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    }

    // Fetches the scheduled maintenances from Apex
    fetchScheduledMaintenances() {
        getActiveScheduledMaintenances({ appContext: this.currentAppContext })
            .then(data => {
                const now = new Date();
                this.processScheduledMaintenances(data, now);
                this.scheduleNextBoundary(data, now);
            })
            .catch(error => {
                this.scheduledMaintenances = [];
                this.isModalOpen = false;
            });
    }

    // Processes the fetched scheduled maintenances
    processScheduledMaintenances(data, now) {
        // Drop records that have ended since they were fetched (when re-evaluated between fetches)
        data = data.filter(record => this.parseUTCDate(record.End_Date_Time__c) >= now);
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
        this.updateDismissibleStatus();
        this.isModalOpen = allRecords.length > 0;
    }

    // The configured alert title while a maintenance is in progress, otherwise the reminder title.
    get modalTitle() {
        return this.isInMaintenance ? this.title : this.reminderTitle;
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
        // Refetch when the user returns to the tab, so they don't see stale data
        document.addEventListener('visibilitychange', this.handleVisibilityChange);
    }

    handleVisibilityChange = () => {
        if (document.visibilityState === 'visible') {
            this.fetchScheduledMaintenances();
        }
    };

    // Re-evaluates the fetched records when the next maintenance starts or ends, so the lock
    // turns on and off on time instead of waiting for the next fetch. No server call is needed.
    scheduleNextBoundary(data, now) {
        clearTimeout(this.boundaryTimeoutId);
        const upcomingBoundaries = data
            .flatMap(record => [this.parseUTCDate(record.Start_Date_Time__c), this.parseUTCDate(record.End_Date_Time__c)])
            .filter(date => date && date > now)
            .map(date => date.getTime());
        if (upcomingBoundaries.length === 0) {
            return;
        }
        // Fire just after the boundary so the start/end comparisons have flipped. setTimeout can't wait
        // longer than ~24.8 days, so cap the delay; firing early just re-evaluates and reschedules.
        const delay = Math.min(Math.min(...upcomingBoundaries) - now.getTime() + 1000, 2147483647);
        this.boundaryTimeoutId = setTimeout(() => {
            const current = new Date();
            this.processScheduledMaintenances(data, current);
            this.scheduleNextBoundary(data, current);
        }, delay);
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
    // Fetches the app ID for navigation purposes. App navigation isn't available on Experience Cloud sites.
    fetchAppId() {
        if (communityId || !this.exitAppDeveloperName) {
            return;
        }
        getAppIdByDeveloperName({ developerName: this.exitAppDeveloperName })
            .then(result => {
                this.appId = result;
            })
            .catch(error => {
                console.error('Error fetching App ID:', error);
            });
    }
    // The exit button is only shown once the target app has been found.
    get showExitButton() {
        return !!this.appId;
    }
    get exitButtonLabel() {
        return `Navigate to ${this.exitAppDeveloperName} App`;
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
            this.dismissedThisVisit.add(record.Id);
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
        return !lastDismissed || this.frequencyAllowsAlert(record.Alert_Frequency__c, lastDismissed, currentDate, record.Id);
    }
    // Determines if a maintenance alert should be repeated based on its frequency and the last dismissal date.
    frequencyAllowsAlert(frequency, lastDismissed, currentDate, recordId) {
        switch (frequency) {
            case 'Every Visit':
                // Once per page visit: stays closed during background refreshes until the page is loaded again
                return !this.dismissedThisVisit.has(recordId);
            case 'Daily':
                // Shows again on the next calendar day in the user's time zone
                return !lastDismissed || this.toLocalDateKey(lastDismissed) !== this.toLocalDateKey(currentDate);
            case 'Weekly':
                // Shows again 7 days after the dismissal
                return !lastDismissed || currentDate - lastDismissed >= 7 * 24 * 60 * 60 * 1000;
            default:
                return true;
        }
    }

    // Formats a date as YYYY-MM-DD in the user's time zone, for comparing calendar days
    toLocalDateKey(date) {
        const dateOptions = { year: 'numeric', month: '2-digit', day: '2-digit' };
        try {
            const timeZone = this.userTimeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;
            return new Intl.DateTimeFormat('en-CA', { ...dateOptions, timeZone }).format(date);
        } catch (e) {
            // Unrecognized time zone: fall back to the browser's
            return new Intl.DateTimeFormat('en-CA', dateOptions).format(date);
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
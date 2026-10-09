import { LightningElement, api } from 'lwc';
import getActiveScheduledMaintenances from '@salesforce/apex/ScheduledMaintenanceService.getActiveScheduledMaintenances';
import getAppByDeveloperName from '@salesforce/apex/ScheduledMaintenanceService.getAppByDeveloperName';
import locale from '@salesforce/i18n/locale';
import timeZone from '@salesforce/i18n/timeZone';
import getUserProfileName from '@salesforce/apex/ScheduledMaintenanceService.getUserProfileName';
import hasBypassPermission from '@salesforce/customPermission/Bypass_Scheduled_Maintenance';
import userId from '@salesforce/user/Id';
import { NavigationMixin } from 'lightning/navigation';
import {
    addDismissals,
    canDismiss,
    hasFullLock,
    isAlertWindowOpen,
    lockSummary,
    msUntilNextBoundary,
    parseUTCDate,
    pruneDismissals,
    shouldShowAlert,
    splitByStatus,
    toDisplayRecord
} from 'c/maintenanceUtils';

// Dismissals are stored per user, so on a shared computer one user's dismissals don't hide alerts from the next.
const DISMISSALS_KEY = 'scheduledMaintenance_dismissed_' + userId;
// Key used before dismissals were stored per user
const LEGACY_DISMISSALS_KEY = 'scheduledMaintenance_dismissed';
// Dismissals older than this are removed when saving; no frequency needs them
const DISMISSAL_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
// Extends LightningElement to create a custom element.
export default class ScheduledMaintenanceComponent extends NavigationMixin(LightningElement) {
    scheduledMaintenances = [];
    appId = null;
    appLabel = '';
    // What's locked and until when, shown in the header of a lock
    lockSummary = '';
    isModalOpen = false;
    isDismissible = true;
    // IDs of records dismissed during this page visit; used for the 'Every Visit' frequency.
    dismissedThisVisit = new Set();
    isFullLock = false;
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
    isDisconnected = false;
    // Whether focus has been moved into the currently open dialog
    dialogFocused = false;

    // Lifecycle hook that's called after the component is inserted into the DOM.
    connectedCallback() {
        this.isDisconnected = false;
        this.fetchAppId();
        // Users with the bypass permission or the System Administrator profile see the admin view instead of the lock
        getUserProfileName()
            .then(profileName => {
                this.isAdmin = hasBypassPermission || profileName === 'System Administrator';
            })
            .catch(() => {
                this.isAdmin = hasBypassPermission;
            })
            .finally(() => {
                // Fetches maintenances straight away, then on a schedule. Skipped if the component was
                // removed while waiting, since disconnectedCallback has already run and couldn't clear the timers.
                if (!this.isDisconnected) {
                    this.setupIntervals();
                }
            });
    }

    disconnectedCallback() {
        this.isDisconnected = true;
        // Clear timeout when the component is destroyed
        if (this.intervalId) {
            clearTimeout(this.intervalId);
        }
        clearTimeout(this.boundaryTimeoutId);
        document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    }

    // Moves focus into the dialog when it opens, so keyboard and screen reader users start inside it.
    renderedCallback() {
        const dialog = this.template.querySelector('section.slds-modal');
        if (!dialog) {
            this.dialogFocused = false;
        } else if (!this.dialogFocused) {
            this.dialogFocused = true;
            dialog.focus();
        }
    }

    // Escape closes the dialog, but only when the alert can be dismissed.
    handleDialogKeyDown(event) {
        if (event.key === 'Escape' && this.isDismissible) {
            event.stopPropagation();
            this.dismissAllRecords();
        }
    }

    // Shift+Tab from the top of the dialog wraps to its last control: the footer button, if there is one.
    handleFocusStartGuard() {
        const footerButton = this.template.querySelector('footer lightning-button');
        (footerButton || this.template.querySelector('section.slds-modal')).focus();
    }

    // Tab past the last control wraps to the top of the dialog.
    handleFocusEndGuard() {
        this.template.querySelector('section.slds-modal').focus();
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
                // Keep showing what was last loaded, so a temporary error doesn't lift an active lock
                console.error('Error fetching scheduled maintenances:', error);
            });
    }

    // Processes the fetched scheduled maintenances
    processScheduledMaintenances(data, now) {
        // Use user's locale and timezone for formatting
        const userLocale = this.userLocale || navigator.language || 'en-US';
        const userTimeZone = this.userTimeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;
        const dismissals = this.loadDismissals();
        const allRecords = data
            // Drop records that have ended since they were fetched (when re-evaluated between fetches)
            .filter(record => parseUTCDate(record.End_Date_Time__c) >= now)
            // Records fetched ahead of their alert window are shown once it starts
            .filter(record => isAlertWindowOpen(record, now))
            .filter(record => shouldShowAlert(record, now, { dismissals, dismissedThisVisit: this.dismissedThisVisit, timeZone: userTimeZone }))
            .map(record => toDisplayRecord(record, userLocale, userTimeZone));
        const { inProgress, upcoming } = splitByStatus(allRecords, now);

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

        this.isFullLock = hasFullLock(allRecords, now);
        this.lockSummary = lockSummary(allRecords, now, { appContext: this.currentAppContext, locale: userLocale, timeZone: userTimeZone });
        this.isDismissible = canDismiss(allRecords, now);
        this.isModalOpen = allRecords.length > 0;
    }

    // Whether any shown maintenance is in progress; recalculated whenever the records are re-evaluated.
    get isInMaintenance() {
        return this.inProgressMaintenances.length > 0;
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

    // Re-evaluates the fetched records when the next alert window starts or a maintenance starts or ends, so the lock
    // turns on and off on time instead of waiting for the next fetch. No server call is needed.
    scheduleNextBoundary(data, now) {
        clearTimeout(this.boundaryTimeoutId);
        const delay = msUntilNextBoundary(data, now);
        if (delay === null) {
            return;
        }
        this.boundaryTimeoutId = setTimeout(() => {
            const current = new Date();
            this.processScheduledMaintenances(data, current);
            this.scheduleNextBoundary(data, current);
        }, delay);
    }

    // Fetches the app ID for the exit button. The button is only shown if the platform can build a URL for the app,
    // which it can't on Experience Cloud sites. (Importing @salesforce/community/Id to detect sites instead stops the
    // component loading in Lightning Experience.)
    fetchAppId() {
        if (!this.exitAppDeveloperName) {
            return;
        }
        getAppByDeveloperName({ developerName: this.exitAppDeveloperName })
            .then(app => {
                if (!app) {
                    return null;
                }
                return this[NavigationMixin.GenerateUrl]({ type: 'standard__app', attributes: { appTarget: app.DurableId } }).then(url => (url ? app : null));
            })
            .then(app => {
                this.appId = app ? app.DurableId : null;
                this.appLabel = app ? app.Label : '';
            })
            .catch(error => {
                console.error('Error fetching App ID:', error);
            });
    }
    // The exit button is only shown for an app lock (not a full System lock), once the target app has been found.
    get showExitButton() {
        return !!this.appId && !this.isFullLock;
    }
    // A maintenance that can't be dismissed is in progress, so the app is closed.
    get isAppClosed() {
        return !this.isDismissible;
    }
    get exitButtonLabel() {
        return `Go to ${this.appLabel}`;
    }
    // Locks use the SLDS prompt pattern: an alert dialog with a warning-themed header.
    get dialogRole() {
        return this.isAppClosed ? 'alertdialog' : 'dialog';
    }
    get headerClass() {
        return this.isAppClosed ? 'slds-modal__header slds-theme_warning slds-theme_alert-texture' : 'slds-modal__header';
    }
    // A full lock has no buttons, so the footer is left out.
    get hasFooterButtons() {
        return this.isDismissible || this.showExitButton;
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
        const recordIds = this.scheduledMaintenances.map(record => record.Id);
        recordIds.forEach(recordId => this.dismissedThisVisit.add(recordId));
        this.saveDismissals(addDismissals(this.loadDismissals(), recordIds, new Date()));
        this.isModalOpen = false;
    }

    // Loads this user's dismissals ({ recordId, dismissedAt }) from localStorage.
    loadDismissals() {
        try {
            return JSON.parse(localStorage.getItem(DISMISSALS_KEY)) || [];
        } catch (e) {
            return [];
        }
    }

    // Saves this user's dismissals, dropping ones older than the retention period and the legacy shared key.
    saveDismissals(dismissedArr) {
        localStorage.setItem(DISMISSALS_KEY, JSON.stringify(pruneDismissals(dismissedArr, new Date(), DISMISSAL_RETENTION_MS)));
        localStorage.removeItem(LEGACY_DISMISSALS_KEY);
    }
}

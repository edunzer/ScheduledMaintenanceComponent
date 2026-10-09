// Pure logic for the Scheduled Maintenance component: which alerts show, locks, frequencies, ordering and
// date formatting. Every function takes the current time as `now` so it can be tested with fixed dates.

const DAY_MS = 24 * 60 * 60 * 1000;
// setTimeout can't wait longer than this (~24.8 days)
const MAX_TIMEOUT_MS = 2147483647;

// Parses an ISO 8601 date string (Apex sends UTC with a Z suffix). Dates are returned as is.
export function parseUTCDate(value) {
    if (!value) return null;
    if (value instanceof Date) return value;
    return new Date(value);
}

// Whether the maintenance window contains `now` (start and end included).
export function isInProgress(record, now) {
    return now >= parseUTCDate(record.Start_Date_Time__c) && now <= parseUTCDate(record.End_Date_Time__c);
}

// Whether the record's alert window (Start_Date_with_Buffer__c) has started. Apex also returns records whose
// window starts soon, so the component can show them on time between refreshes.
export function isAlertWindowOpen(record, now) {
    const windowStart = parseUTCDate(record.Start_Date_with_Buffer__c);
    return !windowStart || windowStart <= now;
}

// Whether the record is a maintenance in progress that can't be dismissed, so it locks its apps.
export function isLocking(record, now) {
    return isInProgress(record, now) && !record.Dismissible__c;
}

// The record's Applicable Apps values as a list.
export function getAppBadges(record) {
    if (!record.Applicable_Apps__c) return [];
    return record.Applicable_Apps__c.split(';').map(app => app.trim()).filter(app => !!app);
}

function appliesToSystem(record) {
    return getAppBadges(record).includes('System');
}

// A System maintenance that can't be dismissed is in progress: everything is locked.
export function hasFullLock(records, now) {
    return records.some(record => appliesToSystem(record) && isLocking(record, now));
}

// The alert can be dismissed unless a maintenance that can't be dismissed is in progress.
export function canDismiss(records, now) {
    return !records.some(record => isLocking(record, now));
}

// Formats a date as YYYY-MM-DD in the given time zone, for comparing calendar days.
export function toLocalDateKey(date, timeZone) {
    const dateOptions = { year: 'numeric', month: '2-digit', day: '2-digit' };
    try {
        return new Intl.DateTimeFormat('en-CA', { ...dateOptions, timeZone }).format(date);
    } catch (e) {
        // Unrecognized time zone: fall back to the browser's
        return new Intl.DateTimeFormat('en-CA', dateOptions).format(date);
    }
}

// Whether a dismissed alert should show again, based on its Alert Frequency:
//  - Every Visit: on the next page load, so not if it was dismissed during this visit
//  - Daily: on the next calendar day in the user's time zone
//  - Weekly: 7 days after the dismissal
export function frequencyAllowsAlert(frequency, lastDismissed, now, { timeZone, dismissedThisVisit = false } = {}) {
    switch (frequency) {
        case 'Every Visit':
            return !dismissedThisVisit;
        case 'Daily':
            return !lastDismissed || toLocalDateKey(lastDismissed, timeZone) !== toLocalDateKey(now, timeZone);
        case 'Weekly':
            return !lastDismissed || now - lastDismissed >= 7 * DAY_MS;
        default:
            return true;
    }
}

// Whether to show the alert for a record: always while it locks, otherwise unless the user dismissed it and
// its frequency says not to show it again yet. `dismissals` is the stored list of { recordId, dismissedAt }.
export function shouldShowAlert(record, now, { dismissals = [], dismissedThisVisit = new Set(), timeZone } = {}) {
    if (isLocking(record, now)) {
        return true;
    }
    const dismissal = dismissals.find(item => item.recordId === record.Id);
    const lastDismissed = dismissal ? parseUTCDate(dismissal.dismissedAt) : null;
    return (
        !lastDismissed ||
        frequencyAllowsAlert(record.Alert_Frequency__c, lastDismissed, now, {
            timeZone,
            dismissedThisVisit: dismissedThisVisit.has(record.Id)
        })
    );
}

// Splits records into in progress and upcoming. In progress lists System locks first; both are then
// ordered by start time.
export function splitByStatus(records, now) {
    const byStart = (a, b) => parseUTCDate(a.Start_Date_Time__c) - parseUTCDate(b.Start_Date_Time__c);
    const systemLockFirst = (a, b) => (appliesToSystem(b) && !b.Dismissible__c) - (appliesToSystem(a) && !a.Dismissible__c);
    const inProgress = records.filter(record => isInProgress(record, now)).sort((a, b) => systemLockFirst(a, b) || byStart(a, b));
    const upcoming = records.filter(record => now < parseUTCDate(record.Start_Date_Time__c)).sort(byStart);
    return { inProgress, upcoming };
}

// Milliseconds until just after the next alert window start, start or end time among the records, or null if there's none.
export function msUntilNextBoundary(records, now) {
    const boundaries = records
        .flatMap(record => [record.Start_Date_with_Buffer__c, record.Start_Date_Time__c, record.End_Date_Time__c].map(parseUTCDate))
        .filter(date => date && date > now)
        .map(date => date.getTime());
    if (boundaries.length === 0) {
        return null;
    }
    // Just after the boundary so the start/end comparisons have flipped. Capped at setTimeout's limit;
    // firing early just re-evaluates and reschedules.
    return Math.min(Math.min(...boundaries) - now.getTime() + 1000, MAX_TIMEOUT_MS);
}

// The year of a date in the given time zone.
function yearIn(date, timeZone) {
    try {
        return new Intl.DateTimeFormat('en-US', { year: 'numeric', timeZone }).format(date);
    } catch (e) {
        return String(date.getUTCFullYear());
    }
}

// A formatter for weekday, date, time and time zone, e.g. "Wed, Mar 18, 4:00 PM PDT". The year is added only
// when one of the dates isn't in the current year.
function dateTimeFormatter(dates, now, locale, timeZone) {
    const options = { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' };
    if (dates.some(date => yearIn(date, timeZone) !== yearIn(now, timeZone))) {
        options.year = 'numeric';
    }
    // Keep only the language and region (e.g. de_DE_EURO -> de-DE); Intl rejects Salesforce's extra variants
    const intlLocale = typeof locale === 'string' ? locale.split(/[_-]/).slice(0, 2).join('-') : locale;
    // Fall back to the browser's locale, then also its time zone, if Intl rejects the user's
    for (const [fallbackLocale, fallbackTimeZone] of [[intlLocale, timeZone], [undefined, timeZone], [undefined, undefined]]) {
        try {
            return new Intl.DateTimeFormat(fallbackLocale, { ...options, timeZone: fallbackTimeZone });
        } catch (e) {
            // try the next fallback
        }
    }
    return null;
}

// Formats a single date and time, e.g. "Wed, Mar 18, 4:00 PM PDT".
export function formatMoment(value, now, locale, timeZone) {
    const date = parseUTCDate(value);
    return date ? dateTimeFormatter([date], now, locale, timeZone).format(date) : '';
}

// Formats a maintenance window as one range, e.g. "Mon, Mar 16, 4:00 – 6:00 PM PDT" or
// "Mon, Mar 16, 4:00 PM PDT – Wed, Mar 18, 4:00 PM PDT".
export function formatDateRange(startValue, endValue, now, locale, timeZone) {
    const start = parseUTCDate(startValue);
    const end = parseUTCDate(endValue);
    if (!start || !end) {
        return formatMoment(start || end, now, locale, timeZone);
    }
    const formatter = dateTimeFormatter([start, end], now, locale, timeZone);
    return typeof formatter.formatRange === 'function'
        ? formatter.formatRange(start, end)
        : `${formatter.format(start)} – ${formatter.format(end)}`;
}

// Says what's locked and until when, e.g. "CRM is unavailable until Wed, Mar 18, 4:00 PM PDT.", or '' if nothing is.
export function lockSummary(records, now, { appContext, locale, timeZone } = {}) {
    const locking = records.filter(record => isLocking(record, now));
    if (locking.length === 0) {
        return '';
    }
    const lockEnd = new Date(Math.max(...locking.map(record => parseUTCDate(record.End_Date_Time__c).getTime())));
    let what = 'This app is';
    if (hasFullLock(records, now)) {
        what = 'All apps are';
    } else if (appContext) {
        what = `${appContext} is`;
    }
    return `${what} unavailable until ${formatMoment(lockEnd, now, locale, timeZone)}.`;
}

// Adds the fields the maintenance cards display: subject, date range, affected apps and lock badge.
//  - affects: "CRM, PSA", or "All apps" for System maintenances
//  - lockLabel: "Locks CRM" while a maintenance that can't be dismissed is in progress, "Will lock CRM" before it
//    starts, or '' for a dismissible one; lockActive is true while it locks
export function toDisplayRecord(record, now, locale, timeZone) {
    const appBadges = getAppBadges(record);
    const affects = appBadges.includes('System') ? 'All apps' : appBadges.join(', ');
    let lockLabel = '';
    if (!record.Dismissible__c) {
        const lockedApps = appBadges.includes('System') ? 'all apps' : affects;
        lockLabel = isInProgress(record, now) ? `Locks ${lockedApps}` : `Will lock ${lockedApps}`;
    }
    return {
        ...record,
        Subject: record.Subject__c,
        dateRange: formatDateRange(record.Start_Date_Time__c, record.End_Date_Time__c, now, locale, timeZone),
        affects,
        lockLabel,
        lockActive: isLocking(record, now),
        appBadges
    };
}

// Records a dismissal at `now` for each record ID, replacing any earlier one for the same record.
export function addDismissals(dismissals, recordIds, now) {
    const dismissedAt = now.toISOString();
    return [
        ...dismissals.filter(item => !recordIds.includes(item.recordId)),
        ...recordIds.map(recordId => ({ recordId, dismissedAt }))
    ];
}

// Drops dismissals older than the retention period.
export function pruneDismissals(dismissals, now, retentionMs) {
    const cutoff = now.getTime() - retentionMs;
    return dismissals.filter(item => parseUTCDate(item.dismissedAt).getTime() >= cutoff);
}

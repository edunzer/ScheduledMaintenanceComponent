import {
    addDismissals,
    canDismiss,
    formatDateTime,
    frequencyAllowsAlert,
    getAppBadges,
    hasFullLock,
    isAlertWindowOpen,
    isInProgress,
    msUntilNextBoundary,
    parseUTCDate,
    pruneDismissals,
    shouldShowAlert,
    splitByStatus,
    toDisplayRecord,
    toLocalDateKey
} from 'c/maintenanceUtils';

const NOW = new Date('2026-10-09T17:00:00.000Z');
const at = (minutes) => new Date(NOW.getTime() + minutes * 60 * 1000).toISOString();
const DAY_MS = 24 * 60 * 60 * 1000;

const record = (overrides = {}) => ({
    Id: 'a01',
    Subject__c: 'Release',
    Start_Date_Time__c: at(-60),
    End_Date_Time__c: at(60),
    Alert_Frequency__c: 'Daily',
    Dismissible__c: true,
    Applicable_Apps__c: 'System',
    ...overrides
});

describe('parseUTCDate', () => {
    it('parses ISO strings, passes dates through and returns null for blanks', () => {
        expect(parseUTCDate('2026-10-09T17:00:00.000Z').getTime()).toBe(NOW.getTime());
        expect(parseUTCDate(NOW)).toBe(NOW);
        expect(parseUTCDate(null)).toBeNull();
        expect(parseUTCDate('')).toBeNull();
    });
});

describe('isInProgress', () => {
    it('includes the start and end times', () => {
        expect(isInProgress(record({ Start_Date_Time__c: at(0) }), NOW)).toBe(true);
        expect(isInProgress(record({ End_Date_Time__c: at(0) }), NOW)).toBe(true);
        expect(isInProgress(record({ Start_Date_Time__c: at(1) }), NOW)).toBe(false);
        expect(isInProgress(record({ End_Date_Time__c: at(-1) }), NOW)).toBe(false);
    });
});

describe('isAlertWindowOpen', () => {
    it('is open once Start_Date_with_Buffer__c has passed, or when it is missing', () => {
        expect(isAlertWindowOpen(record({ Start_Date_with_Buffer__c: at(-1) }), NOW)).toBe(true);
        expect(isAlertWindowOpen(record({ Start_Date_with_Buffer__c: at(0) }), NOW)).toBe(true);
        expect(isAlertWindowOpen(record({ Start_Date_with_Buffer__c: at(1) }), NOW)).toBe(false);
        expect(isAlertWindowOpen(record(), NOW)).toBe(true);
    });
});

describe('getAppBadges', () => {
    it('splits the multi-select value', () => {
        expect(getAppBadges(record({ Applicable_Apps__c: 'CRM;PSA' }))).toEqual(['CRM', 'PSA']);
        expect(getAppBadges(record({ Applicable_Apps__c: undefined }))).toEqual([]);
    });
});

describe('locks', () => {
    const systemLock = record({ Dismissible__c: false });
    const appLock = record({ Dismissible__c: false, Applicable_Apps__c: 'CRM' });
    const upcomingSystemLock = record({ Dismissible__c: false, Start_Date_Time__c: at(30) });
    const reminder = record();

    it('is a full lock only for a System maintenance in progress that cannot be dismissed', () => {
        expect(hasFullLock([systemLock], NOW)).toBe(true);
        expect(hasFullLock([appLock], NOW)).toBe(false);
        expect(hasFullLock([upcomingSystemLock], NOW)).toBe(false);
        expect(hasFullLock([reminder], NOW)).toBe(false);
    });

    it('matches System exactly, not as part of another value', () => {
        expect(hasFullLock([record({ Dismissible__c: false, Applicable_Apps__c: 'Systems' })], NOW)).toBe(false);
    });

    it('cannot be dismissed while any maintenance that cannot be dismissed is in progress', () => {
        expect(canDismiss([reminder, appLock], NOW)).toBe(false);
        expect(canDismiss([reminder, systemLock], NOW)).toBe(false);
        expect(canDismiss([reminder, upcomingSystemLock], NOW)).toBe(true);
        expect(canDismiss([], NOW)).toBe(true);
    });
});

describe('toLocalDateKey', () => {
    it('uses the calendar day in the given time zone', () => {
        // 23:30 UTC on Oct 9 is still Oct 9 in Los Angeles but already Oct 10 in Brisbane
        const date = new Date('2026-10-09T23:30:00Z');
        expect(toLocalDateKey(date, 'America/Los_Angeles')).toBe('2026-10-09');
        expect(toLocalDateKey(date, 'Australia/Brisbane')).toBe('2026-10-10');
    });

    it('falls back to the default time zone for an unknown one', () => {
        expect(toLocalDateKey(NOW, 'Not/AZone')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
});

describe('frequencyAllowsAlert', () => {
    it('Every Visit shows again unless dismissed during this visit', () => {
        expect(frequencyAllowsAlert('Every Visit', NOW, NOW, { dismissedThisVisit: false })).toBe(true);
        expect(frequencyAllowsAlert('Every Visit', NOW, NOW, { dismissedThisVisit: true })).toBe(false);
    });

    it("Daily shows again after midnight in the user's time zone, not UTC midnight", () => {
        const losAngeles = { timeZone: 'America/Los_Angeles' };
        const dismissed = new Date('2026-10-09T23:00:00Z'); // 4pm Pacific
        expect(frequencyAllowsAlert('Daily', dismissed, new Date('2026-10-10T06:59:00Z'), losAngeles)).toBe(false); // 11:59pm
        expect(frequencyAllowsAlert('Daily', dismissed, new Date('2026-10-10T07:00:00Z'), losAngeles)).toBe(true); // midnight

        const brisbane = { timeZone: 'Australia/Brisbane' };
        const dismissedBrisbane = new Date('2026-10-09T23:00:00Z'); // 9am Oct 10 in Brisbane
        expect(frequencyAllowsAlert('Daily', dismissedBrisbane, new Date('2026-10-10T13:59:00Z'), brisbane)).toBe(false); // 11:59pm
        expect(frequencyAllowsAlert('Daily', dismissedBrisbane, new Date('2026-10-10T14:00:00Z'), brisbane)).toBe(true); // midnight
    });

    it('Daily follows the local day across a daylight saving change', () => {
        // US daylight saving ends on Nov 1, 2026: midnight Pacific is 07:00 UTC before and 08:00 UTC after
        const losAngeles = { timeZone: 'America/Los_Angeles' };
        const dismissed = new Date('2026-11-01T20:00:00Z'); // noon Pacific on Nov 1
        expect(frequencyAllowsAlert('Daily', dismissed, new Date('2026-11-02T07:30:00Z'), losAngeles)).toBe(false); // 11:30pm Nov 1
        expect(frequencyAllowsAlert('Daily', dismissed, new Date('2026-11-02T08:00:00Z'), losAngeles)).toBe(true); // midnight Nov 2
    });

    it('Weekly shows again exactly 7 days later', () => {
        expect(frequencyAllowsAlert('Weekly', NOW, new Date(NOW.getTime() + 7 * DAY_MS - 1), {})).toBe(false);
        expect(frequencyAllowsAlert('Weekly', NOW, new Date(NOW.getTime() + 7 * DAY_MS), {})).toBe(true);
    });

    it('shows again for an unknown frequency', () => {
        expect(frequencyAllowsAlert(undefined, NOW, NOW, {})).toBe(true);
    });
});

describe('shouldShowAlert', () => {
    const dismissedNow = [{ recordId: 'a01', dismissedAt: NOW.toISOString() }];

    it('shows records that were never dismissed', () => {
        expect(shouldShowAlert(record(), NOW, { dismissals: [] })).toBe(true);
    });

    it('hides a dismissed record until its frequency allows it again', () => {
        expect(shouldShowAlert(record(), NOW, { dismissals: dismissedNow, timeZone: 'UTC' })).toBe(false);
    });

    it('always shows a lock, even if it was dismissed as a reminder', () => {
        expect(shouldShowAlert(record({ Dismissible__c: false }), NOW, { dismissals: dismissedNow })).toBe(true);
    });

    it('applies Every Visit using the records dismissed during this visit', () => {
        const everyVisit = record({ Alert_Frequency__c: 'Every Visit' });
        expect(shouldShowAlert(everyVisit, NOW, { dismissals: dismissedNow, dismissedThisVisit: new Set(['a01']) })).toBe(false);
        expect(shouldShowAlert(everyVisit, NOW, { dismissals: dismissedNow, dismissedThisVisit: new Set() })).toBe(true);
    });
});

describe('splitByStatus', () => {
    it('lists System locks first, then orders by start time', () => {
        const records = [
            record({ Id: 'reminder-early', Start_Date_Time__c: at(-120) }),
            record({ Id: 'app-lock', Dismissible__c: false, Applicable_Apps__c: 'CRM', Start_Date_Time__c: at(-90) }),
            record({ Id: 'system-lock', Dismissible__c: false, Start_Date_Time__c: at(-30) }),
            record({ Id: 'upcoming-late', Start_Date_Time__c: at(120), End_Date_Time__c: at(180) }),
            record({ Id: 'upcoming-soon', Start_Date_Time__c: at(30), End_Date_Time__c: at(90) }),
            record({ Id: 'ended', Start_Date_Time__c: at(-120), End_Date_Time__c: at(-60) })
        ];

        const { inProgress, upcoming } = splitByStatus(records, NOW);

        expect(inProgress.map((r) => r.Id)).toEqual(['system-lock', 'reminder-early', 'app-lock']);
        expect(upcoming.map((r) => r.Id)).toEqual(['upcoming-soon', 'upcoming-late']);
    });
});

describe('msUntilNextBoundary', () => {
    it('waits until just after the next start or end time', () => {
        expect(msUntilNextBoundary([record({ Start_Date_Time__c: at(10), End_Date_Time__c: at(60) })], NOW)).toBe(10 * 60 * 1000 + 1000);
        expect(msUntilNextBoundary([record({ End_Date_Time__c: at(5) })], NOW)).toBe(5 * 60 * 1000 + 1000);
    });

    it('includes the start of the alert window', () => {
        const fetchedEarly = record({ Start_Date_with_Buffer__c: at(3), Start_Date_Time__c: at(3), End_Date_Time__c: at(60) });
        expect(msUntilNextBoundary([fetchedEarly], NOW)).toBe(3 * 60 * 1000 + 1000);
        const buffered = record({ Start_Date_with_Buffer__c: at(5), Start_Date_Time__c: at(65), End_Date_Time__c: at(120) });
        expect(msUntilNextBoundary([buffered], NOW)).toBe(5 * 60 * 1000 + 1000);
    });

    it('returns null when nothing changes later', () => {
        expect(msUntilNextBoundary([record({ Start_Date_Time__c: at(-60), End_Date_Time__c: at(-1) })], NOW)).toBeNull();
        expect(msUntilNextBoundary([], NOW)).toBeNull();
    });

    it("caps the delay at setTimeout's limit", () => {
        // Starts in 60 days, beyond the ~24.8-day limit
        expect(msUntilNextBoundary([record({ Start_Date_Time__c: at(60 * 24 * 60), End_Date_Time__c: at(61 * 24 * 60) })], NOW)).toBe(2147483647);
    });
});

describe('formatDateTime', () => {
    it("formats in the user's locale and time zone", () => {
        expect(formatDateTime('2026-10-09T17:00:00.000Z', 'en-US', 'America/Los_Angeles')).toMatch(/^10\/09\/26, 10:00\sAM$/);
        expect(formatDateTime('2026-10-09T17:00:00.000Z', 'en_AU', 'Australia/Brisbane')).toMatch(/^10\/10\/26, 03:00\sam$/i);
    });

    it('uses 24-hour time where the locale does, even with a Salesforce locale variant', () => {
        expect(formatDateTime('2026-10-09T17:00:00.000Z', 'de_DE_EURO', 'Europe/Berlin')).toBe('09.10.26, 19:00');
    });

    it('returns an empty string for a blank value', () => {
        expect(formatDateTime(null, 'en-US', 'UTC')).toBe('');
    });
});

describe('toDisplayRecord', () => {
    it('adds display fields and the lock badge label', () => {
        const display = toDisplayRecord(record({ Dismissible__c: false, Applicable_Apps__c: 'CRM;PSA' }), 'en-US', 'UTC');

        expect(display).toMatchObject({ Subject: 'Release', BadgeLabel: 'Requires App Lock', appBadges: ['CRM', 'PSA'] });
        expect(display.startDisplay).toMatch(/^10\/09\/26, 04:00\sPM$/);
        expect(toDisplayRecord(record({ Dismissible__c: false }), 'en-US', 'UTC').BadgeLabel).toBe('Requires System Lock');
        expect(toDisplayRecord(record(), 'en-US', 'UTC').BadgeLabel).toBe('');
    });
});

describe('dismissal storage', () => {
    it('replaces an earlier dismissal for the same record', () => {
        const earlier = [
            { recordId: 'a01', dismissedAt: '2026-10-01T00:00:00.000Z' },
            { recordId: 'a02', dismissedAt: '2026-10-01T00:00:00.000Z' }
        ];

        expect(addDismissals(earlier, ['a01'], NOW)).toEqual([
            { recordId: 'a02', dismissedAt: '2026-10-01T00:00:00.000Z' },
            { recordId: 'a01', dismissedAt: NOW.toISOString() }
        ]);
    });

    it('drops dismissals older than the retention period', () => {
        const dismissals = [
            { recordId: 'old', dismissedAt: new Date(NOW.getTime() - 31 * DAY_MS).toISOString() },
            { recordId: 'recent', dismissedAt: new Date(NOW.getTime() - 29 * DAY_MS).toISOString() }
        ];

        expect(pruneDismissals(dismissals, NOW, 30 * DAY_MS).map((d) => d.recordId)).toEqual(['recent']);
    });
});

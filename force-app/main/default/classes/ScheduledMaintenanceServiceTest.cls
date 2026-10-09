@IsTest
public class ScheduledMaintenanceServiceTest {
    // Time zones on either side of UTC. Time-window tests run as a user in each, so a query that compares
    // against the user's local time instead of UTC (#52) is shifted by 7+ hours and returns the wrong records.
    private static final List<String> TEST_TIME_ZONES = new List<String>{'America/Los_Angeles', 'Australia/Brisbane'};

    @TestSetup
    static void setup() {        // Create test data for Scheduled_Maintenance__c
        List<Scheduled_Maintenance__c> maintenances = new List<Scheduled_Maintenance__c>();
        DateTime now = DateTime.now();
        maintenances.add(new Scheduled_Maintenance__c(
            Start_Date_Time__c = now.addHours(-1),
            End_Date_Time__c = now.addHours(1),
            Subject__c = 'Subject 1',
            Description__c = 'Description 1',
            Alert_Frequency__c = 'Daily',
            Alert_Buffer__c = 0,
            Dismissible__c = true,
            Applicable_Apps__c = 'PSA',
            Status__c = 'Scheduled'
        ));
        maintenances.add(new Scheduled_Maintenance__c(
            Start_Date_Time__c = now.addDays(-1),
            End_Date_Time__c = now.addHours(-1),
            Subject__c = 'Subject 2',
            Description__c = 'Description 2',
            Alert_Frequency__c = 'Daily',
            Alert_Buffer__c = 0,
            Dismissible__c = false,
            Applicable_Apps__c = 'System;CRM',
            Status__c = 'Draft'
        ));
        maintenances.add(new Scheduled_Maintenance__c(
            Start_Date_Time__c = now.addHours(-1),
            End_Date_Time__c = now.addHours(2),
            Subject__c = 'Subject 3',
            Description__c = 'Description 3',
            Alert_Frequency__c = 'Daily',
            Alert_Buffer__c = 0,
            Dismissible__c = true,
            Applicable_Apps__c = 'SMS',
            Status__c = 'Scheduled'
        ));
        // Add a second active SMS record for testGetActiveScheduledMaintenances
        maintenances.add(new Scheduled_Maintenance__c(
            Start_Date_Time__c = now.addHours(-2),
            End_Date_Time__c = now.addHours(2),
            Subject__c = 'Subject 3b',
            Description__c = 'Description 3b',
            Alert_Frequency__c = 'Daily',
            Alert_Buffer__c = 0,
            Dismissible__c = true,
            Applicable_Apps__c = 'SMS',
            Status__c = 'Scheduled'
        ));
        // System record with Alert_Buffer__c = 0
        maintenances.add(new Scheduled_Maintenance__c(
            Start_Date_Time__c = now.addHours(-1),
            End_Date_Time__c = now.addHours(2),
            Subject__c = 'Subject 4',
            Description__c = 'Description 4',
            Alert_Frequency__c = 'Daily',
            Alert_Buffer__c = 0,
            Dismissible__c = true,
            Applicable_Apps__c = 'System',
            Status__c = 'Scheduled'
        ));
        // System record with Alert_Buffer__c > 0 (should be visible earlier)
        maintenances.add(new Scheduled_Maintenance__c(
            Start_Date_Time__c = now.addHours(1),
            End_Date_Time__c = now.addHours(3),
            Subject__c = 'Subject 5',
            Description__c = 'Description 5',
            Alert_Frequency__c = 'Daily',
            Alert_Buffer__c = 2,
            Dismissible__c = true,
            Applicable_Apps__c = 'System',
            Status__c = 'Scheduled'
        ));
        // Add a CRM-only, scheduled, active record for CRM context test
        maintenances.add(new Scheduled_Maintenance__c(
            Start_Date_Time__c = now.addHours(-1),
            End_Date_Time__c = now.addHours(2),
            Subject__c = 'Subject CRM',
            Description__c = 'Description CRM',
            Alert_Frequency__c = 'Daily',
            Alert_Buffer__c = 0,
            Dismissible__c = true,
            Applicable_Apps__c = 'CRM',
            Status__c = 'Scheduled'
        ));
        insert maintenances;
    }

    @IsTest
    static void testActiveMaintenanceReturnedInAllTimeZones() {
        // A record that is currently in its maintenance window must be returned for every user, whatever their time zone
        DateTime now = DateTime.now();
        insert new Scheduled_Maintenance__c(
            Start_Date_Time__c = now.addHours(-1),
            End_Date_Time__c = now.addHours(1),
            Subject__c = 'Active Maintenance',
            Description__c = 'In progress',
            Alert_Frequency__c = 'Daily',
            Alert_Buffer__c = 0,
            Dismissible__c = false,
            Applicable_Apps__c = 'System',
            Status__c = 'Scheduled'
        );
        List<User> users = createViewers(TEST_TIME_ZONES);

        Test.startTest();
        for (User u : users) {
            Assert.isTrue(
                getActiveSubjectsAs(u, null).contains('Active Maintenance'),
                'An in-progress maintenance should be returned for a user in ' + u.TimeZoneSidKey
            );
        }
        Test.stopTest();
    }

    @IsTest
    static void testStartBoundaryExcludesFutureMaintenances() {
        // A record whose Start_Date_with_Buffer__c is beyond the look-ahead window (no buffer) must not be returned.
        // It starts in an hour but ends much later, so a query shifted ahead by a UTC+ offset would wrongly include it.
        DateTime now = DateTime.now();
        insert new Scheduled_Maintenance__c(
            Start_Date_Time__c = now.addHours(1),
            End_Date_Time__c = now.addDays(1),
            Subject__c = 'Future Maintenance',
            Description__c = 'Not yet started',
            Alert_Frequency__c = 'Daily',
            Alert_Buffer__c = 0,
            Dismissible__c = true,
            Applicable_Apps__c = 'System',
            Status__c = 'Scheduled'
        );
        List<User> users = createViewers(TEST_TIME_ZONES);

        Test.startTest();
        for (User u : users) {
            Assert.isFalse(
                getActiveSubjectsAs(u, null).contains('Future Maintenance'),
                'A maintenance whose start is in the future should not be returned for a user in ' + u.TimeZoneSidKey
            );
        }
        Test.stopTest();
    }

    @IsTest
    static void testLookAheadReturnsMaintenancesStartingSoon() {
        // Records whose alert window starts within the look-ahead window are returned early, so the component
        // can show them on time between refreshes; later ones are not
        DateTime now = DateTime.now();
        Integer lookahead = ScheduledMaintenanceService.LOOKAHEAD_MINUTES;
        insert new List<Scheduled_Maintenance__c>{
            new Scheduled_Maintenance__c(
                Start_Date_Time__c = now.addMinutes(lookahead - 15),
                End_Date_Time__c = now.addHours(2),
                Subject__c = 'Starting Soon',
                Alert_Frequency__c = 'Daily',
                Alert_Buffer__c = 0,
                Dismissible__c = false,
                Applicable_Apps__c = 'System',
                Status__c = 'Scheduled'
            ),
            new Scheduled_Maintenance__c(
                Start_Date_Time__c = now.addMinutes(lookahead + 15),
                End_Date_Time__c = now.addHours(2),
                Subject__c = 'Starting Later',
                Alert_Frequency__c = 'Daily',
                Alert_Buffer__c = 0,
                Dismissible__c = false,
                Applicable_Apps__c = 'System',
                Status__c = 'Scheduled'
            )
        };
        List<User> users = createViewers(TEST_TIME_ZONES);

        Test.startTest();
        for (User u : users) {
            Set<String> subjects = getActiveSubjectsAs(u, null);
            Assert.isTrue(subjects.contains('Starting Soon'), 'A maintenance starting within the look-ahead window should be returned for a user in ' + u.TimeZoneSidKey);
            Assert.isFalse(subjects.contains('Starting Later'), 'A maintenance starting after the look-ahead window should not be returned for a user in ' + u.TimeZoneSidKey);
        }
        Test.stopTest();
    }

    @IsTest
    static void testEndBoundaryExcludesPastMaintenances() {
        // A record whose End_Date_Time__c has already passed must not be returned
        DateTime now = DateTime.now();
        insert new Scheduled_Maintenance__c(
            Start_Date_Time__c = now.addDays(-2),
            End_Date_Time__c = now.addMinutes(-10), // Ensure well before now
            Subject__c = 'Past Maintenance',
            Description__c = 'Already ended',
            Alert_Frequency__c = 'Daily',
            Alert_Buffer__c = 0,
            Dismissible__c = true,
            Applicable_Apps__c = 'System',
            Status__c = 'Scheduled'
        );
        List<User> users = createViewers(TEST_TIME_ZONES);

        Test.startTest();
        for (User u : users) {
            Assert.isFalse(
                getActiveSubjectsAs(u, null).contains('Past Maintenance'),
                'A maintenance that has already ended should not be returned for a user in ' + u.TimeZoneSidKey
            );
        }
        Test.stopTest();
    }

    @IsTest
    static void testAlertBufferEnablesEarlyVisibility() {
        // A record with a future Start_Date_Time__c but an Alert_Buffer__c large enough to push
        // Start_Date_with_Buffer__c (= Start - buffer days) into the past should still be returned.
        DateTime now = DateTime.now();
        insert new Scheduled_Maintenance__c(
            Start_Date_Time__c = now.addHours(2),
            End_Date_Time__c = now.addHours(4),
            Subject__c = 'Buffered Maintenance',
            Description__c = 'Visible early via buffer',
            Alert_Frequency__c = 'Daily',
            Alert_Buffer__c = 1, // subtracts 1 day: Start_Date_with_Buffer__c ≈ 22 hours in the past (< now)
            Dismissible__c = true,
            Applicable_Apps__c = 'System',
            Status__c = 'Scheduled'
        );
        List<User> users = createViewers(TEST_TIME_ZONES);

        Test.startTest();
        for (User u : users) {
            Assert.isTrue(
                getActiveSubjectsAs(u, null).contains('Buffered Maintenance'),
                'A maintenance within its alert-buffer window should be returned before its start time for a user in ' + u.TimeZoneSidKey
            );
        }
        Test.stopTest();
    }

    @IsTest
    static void testAlertBufferHoursEnablesEarlyVisibility() {
        // Alert_Buffer_Hours__c moves Start_Date_with_Buffer__c earlier by hours, on top of the Alert_Buffer__c days
        DateTime now = DateTime.now();
        insert new List<Scheduled_Maintenance__c>{
            new Scheduled_Maintenance__c(
                Start_Date_Time__c = now.addHours(2),
                End_Date_Time__c = now.addHours(4),
                Subject__c = 'Three Hour Buffer',
                Alert_Frequency__c = 'Daily',
                Alert_Buffer__c = 0,
                Alert_Buffer_Hours__c = 3, // visible from 1 hour ago
                Dismissible__c = true,
                Applicable_Apps__c = 'System',
                Status__c = 'Scheduled'
            ),
            new Scheduled_Maintenance__c(
                Start_Date_Time__c = now.addHours(2),
                End_Date_Time__c = now.addHours(4),
                Subject__c = 'One Hour Buffer',
                Alert_Frequency__c = 'Daily',
                Alert_Buffer__c = 0,
                Alert_Buffer_Hours__c = 1, // not visible for another hour
                Dismissible__c = true,
                Applicable_Apps__c = 'System',
                Status__c = 'Scheduled'
            )
        };
        List<User> users = createViewers(TEST_TIME_ZONES);

        Test.startTest();
        for (User u : users) {
            Set<String> subjects = getActiveSubjectsAs(u, null);
            Assert.isTrue(subjects.contains('Three Hour Buffer'), 'A maintenance within its hours buffer should be returned for a user in ' + u.TimeZoneSidKey);
            Assert.isFalse(subjects.contains('One Hour Buffer'), 'A maintenance before its hours buffer should not be returned for a user in ' + u.TimeZoneSidKey);
        }
        Test.stopTest();
    }

    @IsTest
    static void testValidationRules() {
        DateTime now = DateTime.now();
        Map<String, Scheduled_Maintenance__c> invalidRecords = new Map<String, Scheduled_Maintenance__c>{
            'End Date/Time must be after Start Date/Time.' => new Scheduled_Maintenance__c(
                Start_Date_Time__c = now, End_Date_Time__c = now.addHours(-1), Alert_Buffer__c = 0
            ),
            'Alert Buffer can\'t be negative.' => new Scheduled_Maintenance__c(
                Start_Date_Time__c = now, End_Date_Time__c = now.addHours(1), Alert_Buffer__c = -1
            ),
            'Alert Buffer Hours can\'t be negative.' => new Scheduled_Maintenance__c(
                Start_Date_Time__c = now, End_Date_Time__c = now.addHours(1), Alert_Buffer__c = 0, Alert_Buffer_Hours__c = -1
            )
        };

        Test.startTest();
        for (String expectedError : invalidRecords.keySet()) {
            Scheduled_Maintenance__c record = invalidRecords.get(expectedError);
            record.Subject__c = 'Invalid';
            record.Alert_Frequency__c = 'Daily';
            record.Applicable_Apps__c = 'System';
            record.Status__c = 'Scheduled';
            Database.SaveResult result = Database.insert(record, false);
            Assert.isFalse(result.isSuccess(), 'Should be rejected: ' + expectedError);
            Assert.areEqual(expectedError, result.getErrors()[0].getMessage());
        }
        Test.stopTest();
    }

    @IsTest
    static void testOverlappingMaintenanceWindowsAllReturned() {
        // Multiple overlapping active windows for the same app context must all be returned together
        DateTime now = DateTime.now();
        insert new List<Scheduled_Maintenance__c>{
            new Scheduled_Maintenance__c(
                Start_Date_Time__c = now.addHours(-3),
                End_Date_Time__c = now.addHours(3),
                Subject__c = 'Overlap A',
                Alert_Frequency__c = 'Daily',
                Alert_Buffer__c = 0,
                Dismissible__c = true,
                Applicable_Apps__c = 'CRM',
                Status__c = 'Scheduled'
            ),
            new Scheduled_Maintenance__c(
                Start_Date_Time__c = now.addHours(-2),
                End_Date_Time__c = now.addHours(4),
                Subject__c = 'Overlap B',
                Alert_Frequency__c = 'Daily',
                Alert_Buffer__c = 0,
                Dismissible__c = true,
                Applicable_Apps__c = 'CRM',
                Status__c = 'Scheduled'
            ),
            new Scheduled_Maintenance__c(
                Start_Date_Time__c = now.addHours(-1),
                End_Date_Time__c = now.addHours(2),
                Subject__c = 'Overlap C',
                Alert_Frequency__c = 'Daily',
                Alert_Buffer__c = 0,
                Dismissible__c = true,
                Applicable_Apps__c = 'CRM',
                Status__c = 'Scheduled'
            ),
            // Add a fourth CRM record to ensure 4 returned
            new Scheduled_Maintenance__c(
                Start_Date_Time__c = now.addHours(-4),
                End_Date_Time__c = now.addHours(2),
                Subject__c = 'Overlap D',
                Alert_Frequency__c = 'Daily',
                Alert_Buffer__c = 0,
                Dismissible__c = true,
                Applicable_Apps__c = 'CRM',
                Status__c = 'Scheduled'
            )
        };

        User viewer = createViewers(new List<String>{'America/Los_Angeles'})[0];

        Test.startTest();
        List<Scheduled_Maintenance__c> results = getActiveAs(viewer, 'CRM');
        Test.stopTest();

        // 4 new CRM records + 1 active CRM record from @TestSetup (Subject CRM)
        Integer crmCount = 0;
        for (Scheduled_Maintenance__c maint : results) {
            if (maint.Applicable_Apps__c.contains('CRM')) {
                crmCount++;
            }
        }
        Assert.areEqual(5, crmCount, 'All active, overlapping CRM maintenance windows should be returned together');
    }

    @IsTest
    static void testIncludesMultiValuePicklistMatchesAllApps() {
        // A record tagged to multiple apps (CRM;PSA) must be returned for queries on either app
        DateTime now = DateTime.now();
        insert new Scheduled_Maintenance__c(
            Start_Date_Time__c = now.addHours(-1),
            End_Date_Time__c = now.addHours(1),
            Subject__c = 'Multi-App Maintenance',
            Alert_Frequency__c = 'Daily',
            Alert_Buffer__c = 0,
            Dismissible__c = true,
            Applicable_Apps__c = 'CRM;PSA',
            Status__c = 'Scheduled'
        );

        User viewer = createViewers(new List<String>{'America/Los_Angeles'})[0];

        Test.startTest();
        Set<String> crmSubjects = getActiveSubjectsAs(viewer, 'CRM');
        Set<String> psaSubjects = getActiveSubjectsAs(viewer, 'PSA');
        Test.stopTest();

        Assert.isTrue(crmSubjects.contains('Multi-App Maintenance'), 'A CRM;PSA maintenance should be returned for the CRM app: ' + crmSubjects);
        Assert.isTrue(psaSubjects.contains('Multi-App Maintenance'), 'A CRM;PSA maintenance should be returned for the PSA app: ' + psaSubjects);
    }

    @IsTest
    static void testIncludesNotMatchedByUnrelatedApp() {
        // A record tagged only to PSA must not appear when querying an unrelated app (SMS)
        DateTime now = DateTime.now();
        insert new Scheduled_Maintenance__c(
            Start_Date_Time__c = now.addHours(-1),
            End_Date_Time__c = now.addHours(1),
            Subject__c = 'PSA Only Maintenance',
            Alert_Frequency__c = 'Daily',
            Alert_Buffer__c = 0,
            Dismissible__c = true,
            Applicable_Apps__c = 'PSA',
            Status__c = 'Scheduled'
        );

        User viewer = createViewers(new List<String>{'America/Los_Angeles'})[0];

        Test.startTest();
        Set<String> smsSubjects = getActiveSubjectsAs(viewer, 'SMS');
        Test.stopTest();

        Assert.isFalse(smsSubjects.contains('PSA Only Maintenance'), 'A PSA-only maintenance record should not appear in an SMS context query');
    }

    @IsTest
    static void testUserWithoutAccessGetsError() {
        // The query runs in user mode, so a user without the Level 1 permission set gets an error rather than an empty list
        User noAccess = buildUser('America/Los_Angeles');
        insert noAccess;

        Test.startTest();
        String error;
        System.runAs(noAccess) {
            try {
                ScheduledMaintenanceService.getActiveScheduledMaintenances(null);
            } catch (AuraHandledException ex) {
                error = ex.getMessage();
            }
        }
        Test.stopTest();

        Assert.isNotNull(error, 'A user without access should get an error');
        Assert.isTrue(error.startsWith('Unable to load scheduled maintenances'), error);
    }

    @IsTest
    static void testGetAppByDeveloperName() {
        // Look up an app that exists in this org rather than assuming a specific one (like 'Welcome') is installed
        AppDefinition expected = [SELECT DeveloperName, DurableId, Label FROM AppDefinition LIMIT 1];

        Test.startTest();
        ScheduledMaintenanceService.ExitApp app = ScheduledMaintenanceService.getAppByDeveloperName(expected.DeveloperName);
        ScheduledMaintenanceService.ExitApp missing = ScheduledMaintenanceService.getAppByDeveloperName('NonExistentApp');
        Test.stopTest();

        Assert.isNotNull(app, 'An app should be returned for a valid developer name');
        Assert.areEqual(expected.DeveloperName, [SELECT DeveloperName FROM AppDefinition WHERE DurableId = :app.durableId].DeveloperName, 'The ID should belong to the requested app');
        Assert.areEqual([SELECT Label FROM AppDefinition WHERE DurableId = :app.durableId].Label, app.label, 'The app label should be returned for the button');
        Assert.isNull(missing, 'No app should be returned for a non-existent developer name');
    }

    @IsTest
    static void testGetUserProfileName() {
        String expected = [SELECT Name FROM Profile WHERE Id = :UserInfo.getProfileId()].Name;

        Test.startTest();
        String profileName = ScheduledMaintenanceService.getUserProfileName();
        Test.stopTest();

        Assert.areEqual(expected, profileName, 'Should return the running user\'s profile name');
    }

    // Builds (but does not insert) a Standard User in the given time zone. Without a permission set they can't read maintenances.
    private static User buildUser(String timeZone) {
        String uniqueKey = String.valueOf(Math.abs(Crypto.getRandomLong()));
        return new User(
            ProfileId = [SELECT Id FROM Profile WHERE Name = 'Standard User' LIMIT 1].Id,
            Username = 'scheduledmaint.' + uniqueKey + '@example.com',
            Email = 'scheduledmaint.' + uniqueKey + '@example.com',
            LastName = 'Maintenance Test',
            Alias = uniqueKey.left(8),
            TimeZoneSidKey = timeZone,
            LocaleSidKey = 'en_US',
            EmailEncodingKey = 'UTF-8',
            LanguageLocaleKey = 'en_US'
        );
    }

    // Inserts one user per time zone with the Level 1 permission set, the access the component's users need.
    private static List<User> createViewers(List<String> timeZones) {
        List<User> users = new List<User>();
        for (String timeZone : timeZones) {
            users.add(buildUser(timeZone));
        }
        Id level1 = [SELECT Id FROM PermissionSet WHERE Name = 'Object_Scheduled_Maintenance_Level_1'].Id;
        // runAs allows setup DML (users, permission set assignments) in the same test as maintenance records
        System.runAs(new User(Id = UserInfo.getUserId())) {
            insert users;
            List<PermissionSetAssignment> assignments = new List<PermissionSetAssignment>();
            for (User u : users) {
                assignments.add(new PermissionSetAssignment(AssigneeId = u.Id, PermissionSetId = level1));
            }
            insert assignments;
        }
        return users;
    }

    // Returns the active maintenances returned when the given user calls the service.
    private static List<Scheduled_Maintenance__c> getActiveAs(User u, String appContext) {
        List<Scheduled_Maintenance__c> results;
        System.runAs(u) {
            results = ScheduledMaintenanceService.getActiveScheduledMaintenances(appContext);
        }
        return results;
    }

    // Returns the subjects of the active maintenances returned when the given user calls the service.
    private static Set<String> getActiveSubjectsAs(User u, String appContext) {
        Set<String> subjects = new Set<String>();
        for (Scheduled_Maintenance__c maint : getActiveAs(u, appContext)) {
            subjects.add(maint.Subject__c);
        }
        return subjects;
    }
}

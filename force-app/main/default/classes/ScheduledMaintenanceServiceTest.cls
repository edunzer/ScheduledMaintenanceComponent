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
        List<User> users = createTimeZoneUsers();

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
        // A record whose Start_Date_with_Buffer__c is in the future (no buffer) must not be returned.
        // It starts soon but ends much later, so a query shifted ahead by a UTC+ offset would wrongly include it.
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
        List<User> users = createTimeZoneUsers();

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
        List<User> users = createTimeZoneUsers();

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
        List<User> users = createTimeZoneUsers();

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

        Test.startTest();
        List<Object> results = ScheduledMaintenanceService.getActiveScheduledMaintenances('CRM');
        Test.stopTest();

        // 4 new CRM records + 1 active CRM record from @TestSetup (Subject CRM)
        Integer crmCount = 0;
        for (Object o : results) {
            Map<String, Object> maint = (Map<String, Object>)o;
            if (((String)maint.get('Applicable_Apps__c')).contains('CRM')) {
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

        Test.startTest();
        List<Object> crmResults = ScheduledMaintenanceService.getActiveScheduledMaintenances('CRM');
        List<Object> psaResults = ScheduledMaintenanceService.getActiveScheduledMaintenances('PSA');
        Test.stopTest();

        Boolean foundInCRM = false;
        Boolean foundInPSA = false;
        for (Object o : crmResults) {
            Map<String, Object> maint = (Map<String, Object>) o;
            if (maint.get('Subject__c') == 'Multi-App Maintenance') {
                foundInCRM = true;
            }
        }
        for (Object o : psaResults) {
            Map<String, Object> maint = (Map<String, Object>) o;
            if (maint.get('Subject__c') == 'Multi-App Maintenance') {
                foundInPSA = true;
            }
        }
        Assert.isTrue(foundInCRM, 'A CRM;PSA maintenance should be returned for the CRM app: ' + crmResults);
        Assert.isTrue(foundInPSA, 'A CRM;PSA maintenance should be returned for the PSA app: ' + psaResults);
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

        Test.startTest();
        List<Object> smsResults = ScheduledMaintenanceService.getActiveScheduledMaintenances('SMS');
        Test.stopTest();

        for (Object o : smsResults) {
            Map<String, Object> maint = (Map<String, Object>) o;
            System.assertNotEquals(
                'PSA Only Maintenance',
                maint.get('Subject__c'),
                'A PSA-only maintenance record should not appear in an SMS context query'
            );
        }
    }

    @IsTest
    static void testGetAppIdByDeveloperName() {
        // Look up an app that exists in this org rather than assuming a specific one (like 'Welcome') is installed
        AppDefinition app = [SELECT DeveloperName FROM AppDefinition LIMIT 1];

        Test.startTest();

        String appId = ScheduledMaintenanceService.getAppIdByDeveloperName(app.DeveloperName);
        System.assertNotEquals(null, appId, 'App ID should not be null for valid developer name');
        System.assertEquals(app.DeveloperName, [SELECT DeveloperName FROM AppDefinition WHERE DurableId = :appId].DeveloperName, 'App ID should belong to the requested app');

        appId = ScheduledMaintenanceService.getAppIdByDeveloperName('NonExistentApp');
        System.assertEquals(null, appId, 'App ID should be null for non-existent developer name');

        Test.stopTest();
    }

    @IsTest
    static void testGetUserLocaleInfo() {
        User u = buildUser('Australia/Brisbane');
        u.LocaleSidKey = 'en_AU';
        insert u;

        Map<String, Object> info;
        Test.startTest();
        System.runAs(u) {
            info = ScheduledMaintenanceService.getUserLocaleInfo();
        }
        Test.stopTest();

        Assert.areEqual('Australia/Brisbane', info.get('timeZone'), 'Should return the running user\'s time zone');
        Assert.areEqual('en_AU', info.get('locale'), 'Should return the running user\'s locale');
    }

    @IsTest
    static void testGetUserProfileName() {
        String expected = [SELECT Name FROM Profile WHERE Id = :UserInfo.getProfileId()].Name;

        Test.startTest();
        String profileName = ScheduledMaintenanceService.getUserProfileName();
        Test.stopTest();

        Assert.areEqual(expected, profileName, 'Should return the running user\'s profile name');
    }

    // Builds (but does not insert) a user in the given time zone with the running user's profile.
    private static User buildUser(String timeZone) {
        String uniqueKey = String.valueOf(Math.abs(Crypto.getRandomLong()));
        return new User(
            ProfileId = UserInfo.getProfileId(),
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

    // Inserts one user for each of TEST_TIME_ZONES.
    private static List<User> createTimeZoneUsers() {
        List<User> users = new List<User>();
        for (String timeZone : TEST_TIME_ZONES) {
            users.add(buildUser(timeZone));
        }
        insert users;
        return users;
    }

    // Returns the subjects of the active maintenances returned when the given user calls the service.
    private static Set<String> getActiveSubjectsAs(User u, String appContext) {
        Set<String> subjects = new Set<String>();
        System.runAs(u) {
            for (Object o : ScheduledMaintenanceService.getActiveScheduledMaintenances(appContext)) {
                subjects.add((String) ((Map<String, Object>) o).get('Subject__c'));
            }
        }
        return subjects;
    }
}

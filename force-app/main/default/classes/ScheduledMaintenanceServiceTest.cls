@IsTest
public class ScheduledMaintenanceServiceTest {
    @TestSetup
    static void setup() {
        // Create test data for Scheduled_Maintenance__c
        List<Scheduled_Maintenance__c> maintenances = new List<Scheduled_Maintenance__c>();
        DateTime now = DateTime.now();
        maintenances.add(new Scheduled_Maintenance__c(
            Start_Date_Time__c = now.addHours(-1),
            End_Date_Time__c = now.addHours(1),
            Subject__c = 'Subject 1',
            Description__c = 'Description 1',
            Alert_Frequency__c = 'Daily',
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
            Dismissible__c = true,
            Applicable_Apps__c = 'SMS',
            Status__c = 'Scheduled'
        ));
        maintenances.add(new Scheduled_Maintenance__c(
            Start_Date_Time__c = now.addHours(-1),
            End_Date_Time__c = now.addHours(2),
            Subject__c = 'Subject 4',
            Description__c = 'Description 4',
            Alert_Frequency__c = 'Daily',
            Dismissible__c = true,
            Applicable_Apps__c = 'System',
            Status__c = 'Scheduled'
        ));
        insert maintenances;
    }

    @IsTest
    static void testGetActiveScheduledMaintenances() {
        Test.startTest();

        // Test with no app context (should include only 'System')
        List<Object> results = ScheduledMaintenanceService.getActiveScheduledMaintenances(null);
        System.debug('Results for no context: ' + results);
        for (Object o : results) {
            Map<String, Object> maint = (Map<String, Object>)o;
            System.debug('Record for no context: ' + maint + ', Applicable_Apps__c: ' + maint.get('Applicable_Apps__c'));
        }
        System.assertEquals(1, results.size(), 'There should be 1 active maintenance record for System');

        // Test with app context 'System'
        results = ScheduledMaintenanceService.getActiveScheduledMaintenances('System');
        System.debug('Results for System context: ' + results);
        for (Object o : results) {
            Map<String, Object> maint = (Map<String, Object>)o;
            System.debug('Record for System context: ' + maint + ', Applicable_Apps__c: ' + maint.get('Applicable_Apps__c'));
        }
        System.assertEquals(1, results.size(), 'There should be 1 active maintenance record for System');

        // Test with app context 'CRM'
        results = ScheduledMaintenanceService.getActiveScheduledMaintenances('CRM');
        System.debug('Results for CRM context: ' + results);
        for (Object o : results) {
            Map<String, Object> maint = (Map<String, Object>)o;
            System.debug('Record for CRM context: ' + maint + ', Applicable_Apps__c: ' + maint.get('Applicable_Apps__c'));
        }
        System.assertEquals(1, results.size(), 'There should be 1 active maintenance records for CRM');

        // Test with app context 'SMS'
        results = ScheduledMaintenanceService.getActiveScheduledMaintenances('SMS');
        System.debug('Results for SMS context: ' + results);
        for (Object o : results) {
            Map<String, Object> maint = (Map<String, Object>)o;
            System.debug('Record for SMS context: ' + maint + ', Applicable_Apps__c: ' + maint.get('Applicable_Apps__c'));
        }
        System.assertEquals(2, results.size(), 'There should be 2 active maintenance record for SMS');

        // Test with app context 'PSA'
        results = ScheduledMaintenanceService.getActiveScheduledMaintenances('PSA');
        System.debug('Results for PSA context: ' + results);
        for (Object o : results) {
            Map<String, Object> maint = (Map<String, Object>)o;
            System.debug('Record for PSA context: ' + maint + ', Applicable_Apps__c: ' + maint.get('Applicable_Apps__c'));
        }
        System.assertEquals(2, results.size(), 'There should be 2 active maintenance record for PSA');

        Test.stopTest();
    }

    @IsTest
    static void testStartBoundaryExcludesFutureMaintenances() {
        // A record whose Start_Date_with_Buffer__c is in the future (no buffer) must not be returned
        DateTime now = DateTime.now();
        insert new Scheduled_Maintenance__c(
            Start_Date_Time__c = now.addDays(1),
            End_Date_Time__c = now.addDays(2),
            Subject__c = 'Future Maintenance',
            Description__c = 'Not yet started',
            Alert_Frequency__c = 'Daily',
            Alert_Buffer__c = 0,
            Dismissible__c = true,
            Applicable_Apps__c = 'System',
            Status__c = 'Scheduled'
        );

        Test.startTest();
        List<Object> results = ScheduledMaintenanceService.getActiveScheduledMaintenances(null);
        Test.stopTest();

        for (Object o : results) {
            Map<String, Object> maint = (Map<String, Object>) o;
            System.assertNotEquals(
                'Future Maintenance',
                maint.get('Subject__c'),
                'A maintenance whose start is in the future should not be returned'
            );
        }
    }

    @IsTest
    static void testEndBoundaryExcludesPastMaintenances() {
        // A record whose End_Date_Time__c has already passed must not be returned
        DateTime now = DateTime.now();
        insert new Scheduled_Maintenance__c(
            Start_Date_Time__c = now.addDays(-2),
            End_Date_Time__c = now.addHours(-1),
            Subject__c = 'Past Maintenance',
            Description__c = 'Already ended',
            Alert_Frequency__c = 'Daily',
            Alert_Buffer__c = 0,
            Dismissible__c = true,
            Applicable_Apps__c = 'System',
            Status__c = 'Scheduled'
        );

        Test.startTest();
        List<Object> results = ScheduledMaintenanceService.getActiveScheduledMaintenances(null);
        Test.stopTest();

        for (Object o : results) {
            Map<String, Object> maint = (Map<String, Object>) o;
            System.assertNotEquals(
                'Past Maintenance',
                maint.get('Subject__c'),
                'A maintenance whose end time has passed should not be returned'
            );
        }
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

        Test.startTest();
        List<Object> results = ScheduledMaintenanceService.getActiveScheduledMaintenances(null);
        Test.stopTest();

        Boolean found = false;
        for (Object o : results) {
            Map<String, Object> maint = (Map<String, Object>) o;
            if (maint.get('Subject__c') == 'Buffered Maintenance') {
                found = true;
            }
        }
        System.assert(found, 'A maintenance within its alert-buffer window should be returned before its start time');
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
            )
        };

        Test.startTest();
        List<Object> results = ScheduledMaintenanceService.getActiveScheduledMaintenances('CRM');
        Test.stopTest();

        // 3 new CRM records + 1 System record from @TestSetup (Subject 4, active)
        System.assertEquals(4, results.size(), 'All overlapping maintenance windows should be returned simultaneously');
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
        for (Object o : crmResults) {
            Map<String, Object> maint = (Map<String, Object>) o;
            if (maint.get('Subject__c') == 'Multi-App Maintenance') {
                foundInCRM = true;
            }
        }
        System.assert(foundInCRM, 'A CRM;PSA record should be returned for a CRM context query');

        Boolean foundInPSA = false;
        for (Object o : psaResults) {
            Map<String, Object> maint = (Map<String, Object>) o;
            if (maint.get('Subject__c') == 'Multi-App Maintenance') {
                foundInPSA = true;
            }
        }
        System.assert(foundInPSA, 'A CRM;PSA record should be returned for a PSA context query');
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
        Test.startTest();

        // This part of the test can only validate behavior, assuming the data exists in the actual org
        // Here we simply call the method assuming the data exists
        String appId = ScheduledMaintenanceService.getAppIdByDeveloperName('Welcome');
        System.assertNotEquals(null, appId, 'App ID should not be null for valid developer name');

        appId = ScheduledMaintenanceService.getAppIdByDeveloperName('NonExistentApp');
        System.assertEquals(null, appId, 'App ID should be null for non-existent developer name');

        Test.stopTest();
    }
}

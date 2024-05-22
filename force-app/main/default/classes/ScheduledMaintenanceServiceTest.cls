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
        List<Scheduled_Maintenance__c> results = ScheduledMaintenanceService.getActiveScheduledMaintenances(null);
        System.debug('Results for no context: ' + results);
        for (Scheduled_Maintenance__c maint : results) {
            System.debug('Record for no context: ' + maint + ', Applicable_Apps__c: ' + maint.Applicable_Apps__c);
        }
        System.assertEquals(1, results.size(), 'There should be 1 active maintenance record for System');

        // Test with app context 'System'
        results = ScheduledMaintenanceService.getActiveScheduledMaintenances('System');
        System.debug('Results for System context: ' + results);
        for (Scheduled_Maintenance__c maint : results) {
            System.debug('Record for System context: ' + maint + ', Applicable_Apps__c: ' + maint.Applicable_Apps__c);
        }
        System.assertEquals(1, results.size(), 'There should be 1 active maintenance record for System');

        // Test with app context 'CRM'
        results = ScheduledMaintenanceService.getActiveScheduledMaintenances('CRM');
        System.debug('Results for CRM context: ' + results);
        for (Scheduled_Maintenance__c maint : results) {
            System.debug('Record for CRM context: ' + maint + ', Applicable_Apps__c: ' + maint.Applicable_Apps__c);
        }
        System.assertEquals(1, results.size(), 'There should be 1 active maintenance records for CRM');

        // Test with app context 'SMS'
        results = ScheduledMaintenanceService.getActiveScheduledMaintenances('SMS');
        System.debug('Results for SMS context: ' + results);
        for (Scheduled_Maintenance__c maint : results) {
            System.debug('Record for SMS context: ' + maint + ', Applicable_Apps__c: ' + maint.Applicable_Apps__c);
        }
        System.assertEquals(2, results.size(), 'There should be 2 active maintenance record for SMS');

        // Test with app context 'PSA'
        results = ScheduledMaintenanceService.getActiveScheduledMaintenances('PSA');
        System.debug('Results for PSA context: ' + results);
        for (Scheduled_Maintenance__c maint : results) {
            System.debug('Record for PSA context: ' + maint + ', Applicable_Apps__c: ' + maint.Applicable_Apps__c);
        }
        System.assertEquals(2, results.size(), 'There should be 2 active maintenance record for PSA');

        Test.stopTest();
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

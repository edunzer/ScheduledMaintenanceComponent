@IsTest
private class ScheduledMaintenanceAppPicklistTest {
    @IsTest
    static void testValuesMatchApplicableApps() {
        Set<Object> expected = new Set<Object>();
        for (Schema.PicklistEntry entry : Scheduled_Maintenance__c.Applicable_Apps__c.getDescribe().getPicklistValues()) {
            if (entry.isActive()) {
                expected.add(entry.getValue());
            }
        }

        Test.startTest();
        ScheduledMaintenanceAppPicklist picklist = new ScheduledMaintenanceAppPicklist();
        Set<Object> values = new Set<Object>();
        for (VisualEditor.DataRow row : picklist.getValues().getDataRows()) {
            values.add(row.getValue());
        }
        Test.stopTest();

        Assert.areEqual(expected, values, 'The picklist should offer every active Applicable Apps value');
        Assert.isTrue(values.contains('CRM'), 'CRM should be offered as an app context');
        Assert.isNull(picklist.getDefaultValue(), 'There should be no default app context');
    }
}

// Lists the Applicable Apps values for the component's Current App Context property in Lightning App Builder,
// so the context is picked from the same values as the maintenance records instead of typed.
global with sharing class ScheduledMaintenanceAppPicklist extends VisualEditor.DynamicPickList {
    // No default: without an app context, the component shows System maintenances only.
    global override VisualEditor.DataRow getDefaultValue() {
        return null;
    }

    global override VisualEditor.DynamicPickListRows getValues() {
        VisualEditor.DynamicPickListRows rows = new VisualEditor.DynamicPickListRows();
        for (Schema.PicklistEntry entry : Scheduled_Maintenance__c.Applicable_Apps__c.getDescribe().getPicklistValues()) {
            if (entry.isActive()) {
                rows.addRow(new VisualEditor.DataRow(entry.getLabel(), entry.getValue()));
            }
        }
        return rows;
    }
}

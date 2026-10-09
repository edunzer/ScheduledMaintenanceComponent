public with sharing class ScheduledMaintenanceService {
    // Also returns maintenances whose alert window starts within this many minutes. It's longer than the
    // component's slowest refresh (30 minutes), so the component already has a record when its window starts
    // and can show it, or lock, on time without waiting for the next refresh.
    @TestVisible
    private static final Integer LOOKAHEAD_MINUTES = 35;

    // Retrieves active and soon-to-be-active scheduled maintenances applicable to the specified app context.
    // Runs in user mode, so users need read access to Scheduled_Maintenance__c and its fields (the Level 1 permission set).
    @AuraEnabled(cacheable=false)
    public static List<Scheduled_Maintenance__c> getActiveScheduledMaintenances(String appContext) {
        DateTime now = DateTime.now();
        DateTime visibleBy = now.addMinutes(LOOKAHEAD_MINUTES);
        // System maintenances apply to every app; with no app context, only those are returned.
        String app = String.isBlank(appContext) ? 'System' : appContext;
        try {
            return [
                SELECT Id, Name, Start_Date_Time__c, End_Date_Time__c, Subject__c, Description__c, Alert_Frequency__c,
                    Start_Date_with_Buffer__c, Dismissible__c, Applicable_Apps__c
                FROM Scheduled_Maintenance__c
                WHERE Start_Date_with_Buffer__c <= :visibleBy AND End_Date_Time__c >= :now AND Status__c = 'Scheduled'
                    AND Applicable_Apps__c INCLUDES ('System', :app)
                WITH USER_MODE
                ORDER BY Start_Date_Time__c ASC
            ];
        } catch (Exception ex) {
            // Usually missing access to the object or its fields. Let the component decide how to handle it.
            String message = 'Unable to load scheduled maintenances: ' + ex.getMessage();
            AuraHandledException auraEx = new AuraHandledException(message);
            auraEx.setMessage(message);
            throw auraEx;
        }
    }

    // Retrieves the App ID based on the developer name specified, useful for navigation purposes.
    @AuraEnabled(cacheable=true)
    public static String getAppIdByDeveloperName(String developerName) {
        // Query to find an app by its developer name, limited to one result.
        List<AppDefinition> apps = [SELECT DurableId FROM AppDefinition WHERE DeveloperName = :developerName LIMIT 1];
        // If an app is found, return its durable ID.
        if (!apps.isEmpty()) {
            return apps[0].DurableId;
        }
        // Return null if no matching app is found.
        return null;
    }

    // Retrieves the running user's profile name
    @AuraEnabled(cacheable=true)
    public static String getUserProfileName() {
        User u = [SELECT Profile.Name FROM User WHERE Id = :UserInfo.getUserId() LIMIT 1];
        return u.Profile.Name;
    }
}
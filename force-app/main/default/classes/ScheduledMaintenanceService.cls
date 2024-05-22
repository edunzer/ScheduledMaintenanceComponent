public with sharing class ScheduledMaintenanceService {
    // Retrieves active scheduled maintenances applicable to the specified app context.
    @AuraEnabled(cacheable=false)
    public static List<Scheduled_Maintenance__c> getActiveScheduledMaintenances(String appContext) {
        // Record the current date and time.
        DateTime now = DateTime.now();
        System.debug('Current DateTime used: ' + now);
        // Initialize a list with 'System' always included as a default filter.
        List<String> filters = new List<String>{'System'};
        // If an additional app context is provided, add it to the filters.
        if (appContext != null && appContext != '') {
            filters.add(appContext);
        }

        // Concatenate all filters into a single string formatted for a SOQL query's INCLUDES clause.
        String filterString = '\'' + String.join(filters, '\',\'') + '\'';
        System.debug('Using filter: ' + filterString);
        // Construct the SOQL query string.
        String queryString = 'SELECT Id, Name, Start_Date_Time__c, End_Date_Time__c, Subject__c, Description__c, Alert_Frequency__c, Start_Date_with_Buffer__c, Dismissible__c, Applicable_Apps__c ' +
                             'FROM Scheduled_Maintenance__c ' +
                             'WHERE Start_Date_with_Buffer__c <= :now AND End_Date_Time__c >= :now AND Status__c = \'Scheduled\' ' +
                             'AND Applicable_Apps__c INCLUDES (' + filterString + ')' + 
                             'ORDER BY Start_Date_Time__c ASC'; // Orders the results by the start date.

        // Execute the query and retrieve the list of scheduled maintenance records.
        List<Scheduled_Maintenance__c> records = Database.query(queryString);
        // Log the number of records fetched.
        System.debug('Fetched records: ' + records.size());
        return records;
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
}
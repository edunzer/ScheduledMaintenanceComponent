public with sharing class ScheduledMaintenanceService {
    // Retrieves active scheduled maintenances applicable to the specified app context.
    @AuraEnabled(cacheable=false)
    public static List<Object> getActiveScheduledMaintenances(String appContext) {
        // Record the current date and time.
        DateTime now = DateTime.now();
        System.debug('Current DateTime used: ' + now);
        // Initialize a list with 'System' always included as a default filter.
        List<String> filters = new List<String>{'System'};
        // If an additional app context is provided, add it to the filters.
        if (appContext != null && appContext != '') {
            filters.add(appContext);
        }

        // Escape each filter value to prevent SOQL injection and breakage.
        List<String> escapedFilters = new List<String>();
        for (String f : filters) {
            escapedFilters.add(String.escapeSingleQuotes(f));
        }
        // Concatenate all filters into a single string formatted for a SOQL query's INCLUDES clause.
        String filterString = '\'' + String.join(escapedFilters, '\',\'') + '\'';
        System.debug('Using filter: ' + filterString);
        // Format the current datetime for SOQL (ISO8601 format)
        String nowStr = now.format('yyyy-MM-dd\'T\'HH:mm:ss\'Z\'');
        // Construct the SOQL query string with the datetime injected directly
        String queryString = 'SELECT Id, Name, Start_Date_Time__c, End_Date_Time__c, Subject__c, Description__c, Alert_Frequency__c, Start_Date_with_Buffer__c, Dismissible__c, Applicable_Apps__c ' +
                     'FROM Scheduled_Maintenance__c ' +
                     'WHERE Start_Date_with_Buffer__c <= ' + nowStr + ' AND End_Date_Time__c >= ' + nowStr + ' AND Status__c = \'Scheduled\' ' +
                     'AND Applicable_Apps__c INCLUDES (' + filterString + ')' + 
                     'ORDER BY Start_Date_Time__c ASC'; // Orders the results by the start date.

        try {
            // Execute the query and retrieve the list of scheduled maintenance records.
            List<Scheduled_Maintenance__c> records = Database.query(queryString);
            // Log the number of records fetched.
            System.debug('Fetched records: ' + records.size());
            // Convert date fields to UTC ISO strings for each record
            List<Map<String, Object>> result = new List<Map<String, Object>>();
            for (Scheduled_Maintenance__c rec : records) {
                Map<String, Object> m = new Map<String, Object>();
                m.put('Id', rec.Id);
                m.put('Name', rec.Name);
                m.put('Start_Date_Time__c', rec.Start_Date_Time__c != null ? rec.Start_Date_Time__c.formatGMT('yyyy-MM-dd\'T\'HH:mm:ss.SSS\'Z\'') : null);
                m.put('End_Date_Time__c', rec.End_Date_Time__c != null ? rec.End_Date_Time__c.formatGMT('yyyy-MM-dd\'T\'HH:mm:ss.SSS\'Z\'') : null);
                m.put('Subject__c', rec.Subject__c);
                m.put('Description__c', rec.Description__c);
                m.put('Alert_Frequency__c', rec.Alert_Frequency__c);
                m.put('Start_Date_with_Buffer__c', rec.Start_Date_with_Buffer__c != null ? rec.Start_Date_with_Buffer__c.formatGMT('yyyy-MM-dd\'T\'HH:mm:ss.SSS\'Z\'') : null);
                m.put('Dismissible__c', rec.Dismissible__c);
                m.put('Applicable_Apps__c', rec.Applicable_Apps__c);
                result.add(m);
            }
            return (List<Object>)result;
        } catch (Exception ex) {
            System.debug('Exception during Database.query: ' + ex.getMessage());
            return new List<Object>();
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

    // Retrieves the running user's timezone and locale
    @AuraEnabled(cacheable=true)
    public static Map<String, Object> getUserLocaleInfo() {
        User u = [SELECT Id, TimeZoneSidKey, LocaleSidKey FROM User WHERE Id = :UserInfo.getUserId() LIMIT 1];
        Map<String, Object> result = new Map<String, Object>();
        result.put('timeZone', u.TimeZoneSidKey);
        result.put('locale', u.LocaleSidKey);
        return result;
    }
    // Retrieves the running user's profile name
    @AuraEnabled(cacheable=true)
    public static String getUserProfileName() {
        User u = [SELECT Profile.Name FROM User WHERE Id = :UserInfo.getUserId() LIMIT 1];
        return u.Profile.Name;
    }
}
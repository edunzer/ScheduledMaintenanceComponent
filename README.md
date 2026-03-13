# Scheduled Maintenance Component

## Overview

The `ScheduledMaintenanceComponent` is a Salesforce Lightning Web Component (LWC) designed to manage and display scheduled maintenance alerts within a Salesforce ORG. It leverages the `Scheduled_Maintenance__c` object to retrieve and display relevant maintenance records based on their field values directly to the use on page view.

Key features include: 
- Visual updates of maintenance/release information at specified times and intervals.
- Ensuring users remain informed without needing to refresh the page with auto data refresh. 
- Blocking apps or the system from usage during maintenance time frames

> Blocking users from access can be achieved as long as the component is placed on the appropriate Lightning pages and experience sites. The app context can be defined on the component located on the Lightning page. The targeted maintenance alert can be adjusted in the maintenance record based on the values of the multi-select picklist called `Applicable Apps`.

> All components by default have a app context of "System" so any scheduled maintenance records with "system" in the Applicable Apps field will show on every component.

The component enhances user experience by providing timely alerts and essential information about maintenance activities, ensuring users are informed about potential disruptions. This can be done before the actual maintenance time if you want using the `Alert Buffer` field.

![Modal Popup Example](./img/Screenshot%202026-03-13%20151025.png)

## Features

- **Real-time Data Fetching**: Fetches scheduled maintenance data immediately upon initial load.
- **Interval-based Data Refresh**: 
  - Refreshes data every 5 minutes for the first 30 minutes.
  - After the first 30 minutes, refreshes data every 30 minutes indefinitely.
- **Maintenance Alerts**:
  - Displays a modal dialog with maintenance alerts.
  - Alerts are shown based on the maintenance schedule and user interaction history.
- **Dismissible Alerts**: Allows users to dismiss alerts, with the option to not allow dismiss during the maintenance time frame.
- **Alert Frequency**: Only show alerts on a set frequency basis (every time, daily, weekly) thanks to browser cache data.
- **Record Specific Cache**: Uses local storage to remember which alerts have been dismissed by the user.
- **System and Application Maintenance**:
  - Differentiates between system-wide maintenance and application-specific maintenance.
  - Provides visual cues (e.g., badges) for alerts requiring system or app lock.
- **User Navigation**: Facilitates navigation to another application based on the fetched App ID.
- **Adaptive Titles**: Updates the title of the modal based on the current maintenance status.
- **Locale-aware Date/Time Display**: Maintenance start and end times are formatted to the user's local date and time, using their Salesforce-configured locale and timezone.
- **Applicable Apps Badges**: Each maintenance alert displays the applicable apps as visual badges for clearer context about which systems or applications are affected.

![Dismissable Modal Popup Example](./img/Screenshot%202026-03-13%20150809.png)

## Changelog

### v1.1.0

- **Locale-aware Date/Time Display**: Maintenance start and end times are now formatted using the user's Salesforce locale and timezone settings. The Apex service returns date fields as UTC ISO 8601 strings, which the component then converts to the user's local time for display.
- **Applicable Apps Badges**: The maintenance modal now displays each applicable app as a visual badge, making it easier to understand which systems are affected by a scheduled maintenance.
- **User Locale and Timezone Retrieval**: A new Apex method (`getUserLocaleInfo`) retrieves the running user's locale and timezone (`TimeZoneSidKey`, `LocaleSidKey`) to support accurate local date formatting in the component. If retrieval fails, the component falls back to browser defaults.
- **UTC Date Handling in Apex**: The `getActiveScheduledMaintenances` method now returns a list of plain objects with all date fields formatted as UTC ISO 8601 strings (`yyyy-MM-dd'T'HH:mm:ss.SSS'Z'`), ensuring consistent timezone-safe date handling on the client side.
- **SOQL Injection Prevention**: Filter values passed to the SOQL query are now escaped using `String.escapeSingleQuotes()`, preventing potential SOQL injection vulnerabilities.
- **SOQL Error Handling**: The `getActiveScheduledMaintenances` method now wraps the database query in a try/catch block, returning an empty list on failure instead of throwing an unhandled exception.
- **SOQL Datetime Formatting**: The current datetime used in the SOQL query is now formatted in ISO 8601 format (`yyyy-MM-dd'T'HH:mm:ss'Z'`) for accurate querying of scheduled maintenance records.
- **Code Comment Fix**: The comment in `disconnectedCallback` now correctly describes that a timeout is cleared (not an interval).

## Documentation

For mor information please checkout the [Wiki](https://github.com/edunzer/ScheduledMaintenanceComponent/wiki) for this repo. It incldes information like:
- [A Component Overview](https://github.com/edunzer/ScheduledMaintenanceComponent/wiki)
- [Installation Guide](https://github.com/edunzer/ScheduledMaintenanceComponent/wiki/Installation)
- [Details about the Object & Fields](https://github.com/edunzer/ScheduledMaintenanceComponent/wiki/Object-and-Fields)
- [Details about the LWC HTML](https://github.com/edunzer/ScheduledMaintenanceComponent/wiki/ScheduledMaintenanceComponent-HTML)
- [Details about the LWC Javascript](https://github.com/edunzer/ScheduledMaintenanceComponent/wiki/ScheduledMaintenanceComponent-JavaScript)
- [Details about the Apex class](https://github.com/edunzer/ScheduledMaintenanceComponent/wiki/ScheduledMaintenanceService-Class)


# Scheduled Maintenance Component

## Overview

The `ScheduledMaintenanceComponent` is a Salesforce Lightning Web Component (LWC) designed to manage and display scheduled maintenance alerts within a Salesforce ORG. It leverages the `Scheduled_Maintenance__c` object to retrieve and display relevant maintenance records based on their field values directly to the use on page view.

Key features include: 
- Visual updates of maintenance/release information at specified times and intervals.
- Ensuring users remain informed without needing to refresh the page with auto data refresh. 
- Blocking apps or the system from usage during maintenance time frames

> Blocking users from access can be achieved as long as the component is placed on the appropriate Lightning pages and experience sites. The app context can be defined on the component located on the Lightning page, by picking one of the `Applicable Apps` values. The targeted maintenance alert can be adjusted in the maintenance record based on the values of the multi-select picklist called `Applicable Apps`. The lock is a user-experience control, not access control; see [Limitations](#limitations).

> All components by default have a app context of "System" so any scheduled maintenance records with "system" in the Applicable Apps field will show on every component.

The component enhances user experience by providing timely alerts and essential information about maintenance activities, ensuring users are informed about potential disruptions. This can be done before the actual maintenance time if you want using the `Alert Buffer` (days) and `Alert Buffer Hours` fields.

## Features

- **Real-time Data Fetching**: Fetches scheduled maintenance data immediately upon initial load.
- **Interval-based Data Refresh**: 
  - Refreshes data every 5 minutes for the first 30 minutes.
  - After the first 30 minutes, refreshes data every 30 minutes indefinitely.
- **Maintenance Alerts**:
  - Displays a modal dialog with maintenance alerts.
  - Alerts are shown based on the maintenance schedule and user interaction history.
- **Dismissible Alerts**: Allows users to dismiss alerts, with the option to not allow dismiss during the maintenance time frame.
- **Alert Frequency**: Controls when a dismissed alert is shown again, using browser cache data:
  - **Every Visit**: on the next page load. It stays closed during background refreshes.
  - **Daily**: on the next calendar day in the user's Salesforce time zone.
  - **Weekly**: 7 days after it was dismissed.
- **Record Specific Cache**: Uses local storage to independently track dismissals per maintenance record, ensuring each alert's frequency is evaluated separately. Dismissals are stored per Salesforce user, so on a shared computer one user's dismissals don't hide alerts from the next, and entries older than 30 days are removed.
- **System and Application Maintenance**:
  - Differentiates between system-wide maintenance and application-specific maintenance.
  - Provides visual cues (e.g., badges) for alerts requiring system or app lock.
- **User Navigation**: When an app is locked, offers a button to navigate to another app, set with the `Exit App Developer Name` property (defaults to `Welcome`). The button is hidden if that app isn't found, and on Experience Cloud sites.
- **Adaptive Titles**: Updates the title of the modal based on the current maintenance status.
- **Locale-aware Date/Time Display**: Maintenance start and end times are formatted to the user's local date and time, using their Salesforce-configured locale and timezone.
- **Applicable Apps Badges**: Each maintenance alert displays the applicable apps as visual badges for clearer context about which systems or applications are affected.
- **Admin View**: Users with the `Bypass Scheduled Maintenance` custom permission, or the `System Administrator` profile, see a distinct read-only label instead of the maintenance modal and are never locked. This makes it easy to identify the component while editing Lightning pages. Assign the `Scheduled Maintenance Bypass` permission set to anyone else who should bypass the lock, such as admins on cloned profiles.

## Permissions

The component reads maintenance records with the user's own object and field permissions, so assign permission sets as follows:

- **Object - Scheduled Maintenance - Level 1**: read access. Required for every user who sees the component. Without it the component can't load maintenances, and no alert or lock is shown.
- **Object - Scheduled Maintenance - Level 6**: full access, for people who create and edit maintenance records.
- **Scheduled Maintenance Bypass**: exempts users from the lock (see Admin View) and from Maintenance Mode checks (see Limitations).

Maintenance records are shared org-wide as Public Read Only.

## Limitations

The System Lock and App Lock are a user-experience control, not access control. The lock is a modal shown by the component, so it only covers pages that include the component, in a browser tab that has loaded it. During a non-dismissible maintenance, users can still:

- Open records, list views and reports through direct URLs, bookmarks, global search, or any page that doesn't include the component.
- Use the Salesforce mobile app, or any Lightning or Experience Cloud page without the component.
- Use the API, Data Loader and integrations, along with any flows and triggers they set off.
- Remove the modal with the browser's developer tools.

That's fine when the lock is a courtesy notice. If data integrity depends on keeping users out during maintenance, add a server-side control as well, for example:

- A Login Flow that blocks or warns non-admin users at login while a System lock is active. This only applies at login, not to sessions that are already open.
- The included Maintenance Mode setting, checked by validation rules or triggers on key objects (see below).
- Temporarily removing permission set assignments from affected users during the window.

### Server-side lock with Maintenance Mode

The `Scheduled Maintenance Settings` hierarchy custom setting has a `Maintenance Mode` checkbox. It does nothing on its own: you check it in validation rules or triggers on the objects you want to protect, then turn it on for the maintenance window.

1. Add a validation rule to each object to protect, for example on Account:

   ```
   $Setup.Scheduled_Maintenance_Settings__c.Maintenance_Mode__c && NOT($Permission.Bypass_Scheduled_Maintenance)
   ```

   with an error message such as "Salesforce is in scheduled maintenance. Changes are blocked until it ends." In Apex triggers, use the same check:

   ```apex
   if (Scheduled_Maintenance_Settings__c.getInstance().Maintenance_Mode__c
           && !FeatureManagement.checkPermission('Bypass_Scheduled_Maintenance')) {
       record.addError('Salesforce is in scheduled maintenance. Changes are blocked until it ends.');
   }
   ```

2. Assign the `Scheduled Maintenance Bypass` permission set to admins and integration users who must keep working.
3. When the maintenance starts, go to **Setup > Custom Settings > Scheduled Maintenance Settings > Manage** and check `Maintenance Mode` in the organization default, or for specific profiles or users. Uncheck it when the maintenance ends. A scheduled flow can do this for you.

## Examples
- **Non Dismissable**
  - ![NonDismissable Modal Inprogress And Upcoming](./img/Screenshot%202026-03-17%20150537.png)
- **Dismissable with Inprogress and Upcoming**
  - ![Dismissable Modal Inprogress And Upcoming](./img/Screenshot%202026-03-17%20150601.png)
- **Dismissiable with Upcoming**
  - ![Dismissable Modal Upcoming](./img/Screenshot%202026-03-17%20150702.png)

## Changelog

### v1.3.0

- **Admin View**: System Administrators now see a distinct read-only view displaying only the component name ("Scheduled Maintenance Component (Admin View)") instead of the full maintenance modal. This makes it easy for admins to identify and locate the component while editing Lightning pages, without being shown maintenance alerts.
- **Profile-based Access Control**: The component now retrieves the running user's profile name at startup to determine whether to render the admin view or the standard maintenance modal. Users whose profile is `System Administrator` receive the admin view; all others see the normal modal behavior.
- **New Apex Method – `getUserProfileName`**: A new cacheable Apex method has been added to `ScheduledMaintenanceService` that queries the running user's `Profile.Name`. This supports the profile-based rendering logic in the component.
- **Initialization Order Update**: The `connectedCallback` lifecycle hook now fetches the user's profile name first, then resolves locale and timezone information, before initiating the maintenance data fetch and refresh intervals.

### v1.2.0

- **Refactored Dismissal Storage**: The localStorage strategy now uses a single key, `scheduledMaintenance_dismissed`, storing an array of objects with the structure `{ recordId, dismissedAt }`. This replaces the previous approach and enables independent per-record dismissal tracking.
- **Per-Record Dismissal Tracking**: Each maintenance record's dismissal is checked and stored independently, allowing multiple concurrent maintenance alerts to be handled correctly without affecting one another.
- **Dismiss on Explicit User Action Only**: Dismissals are now only recorded when the user clicks the dismiss button, not when the modal is closed by other means.
- **Removed Debug Console Logs**: Unnecessary `console.log` statements have been removed from production code for a cleaner, Salesforce Locker Service-compatible implementation.
- **Improved Error Logging**: Error handling in `fetchAppId` and `navigateToApp` now uses `console.error` for clearer debugging, and localStorage parsing is wrapped in try/catch to gracefully handle malformed data.

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

For more information please checkout the [Wiki](https://github.com/edunzer/ScheduledMaintenanceComponent/wiki) for this repo. It includes information like:
- [A Component Overview](https://github.com/edunzer/ScheduledMaintenanceComponent/wiki)
- [Installation Guide](https://github.com/edunzer/ScheduledMaintenanceComponent/wiki/Installation)
- [Details about the Object & Fields](https://github.com/edunzer/ScheduledMaintenanceComponent/wiki/Object-and-Fields)
- [Details about the LWC HTML](https://github.com/edunzer/ScheduledMaintenanceComponent/wiki/ScheduledMaintenanceComponent-HTML)
- [Details about the LWC Javascript](https://github.com/edunzer/ScheduledMaintenanceComponent/wiki/ScheduledMaintenanceComponent-JavaScript)
- [Details about the Apex class](https://github.com/edunzer/ScheduledMaintenanceComponent/wiki/ScheduledMaintenanceService-Class)


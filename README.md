# Scheduled Maintenance Component

## Overview

The `ScheduledMaintenanceComponent` is a Salesforce Lightning Web Component (LWC) designed to manage and display scheduled maintenance alerts within a Salesforce ORG. It leverages the `Scheduled_Maintenance__c` object to retrieve and display relevant maintenance records based on their field values directly to the use on page view.

Key features include dynamic updates of maintenance information at specified intervals, ensuring users remain informed without needing to refresh the page. Authorized admins can block apps or the system usage as long as the component is placed on the appropriate Lightning pages and experience sites. The app context can be defined on the component located on the Lightning page. The targeted system maintenance can be adjusted in the maintenance record based on the values of the multi-select picklist called `Applicable Apps`.

The component enhances user experience by providing timely alerts and essential information about maintenance activities, ensuring users are informed about potential disruptions. This can be done before the actual maintenance time if you want using the `Alert Buffer` field.

![Modal Popup Example](./img/Screenshot%202024-05-21%20155756.png)

## Features

- **Real-time Data Fetching**: Fetches scheduled maintenance data immediately upon initial load.
- **Interval-based Data Refresh**: 
  - Refreshes data every 5 minutes for the first 30 minutes.
  - After the first 30 minutes, refreshes data every 30 minutes indefinitely.
- **Maintenance Alerts**:
  - Displays a modal dialog with maintenance alerts.
  - Alerts are shown based on the maintenance schedule and user interaction history.
- **Dismissible Alerts**: Allows users to dismiss alerts, with the option to not show the same alert again based on the specified frequency.
- **System and Application Maintenance**:
  - Differentiates between system-wide maintenance and application-specific maintenance.
  - Provides visual cues (e.g., badges) for alerts requiring system or app lock.
- **User Navigation**: Facilitates navigation to another application based on the fetched App ID.
- **Adaptive Titles**: Updates the title of the modal based on the current maintenance status.
- **Local Storage**: Uses local storage to remember which alerts have been dismissed by the user.

![Dismissable Modal Popup Example](./img/Screenshot%202024-05-21%20155951.png)

## Fields in Scheduled_Maintenance__c Object

The component relies on the following fields from the `Scheduled_Maintenance__c` object:

- **Start_Date_Time__c** (DateTime): Start date and time of the maintenance.
- **End_Date_Time__c** (DateTime): End date and time of the maintenance.
- **Subject__c** (Text): Subject of the maintenance alert, displayed as the title in the modal.
- **Description__c** (Text): Detailed information about the maintenance activity.
- **Alert_Frequency__c** (Picklist: e.g., Daily, Weekly): Frequency of the alert repetition if dismissed.
- **Dismissible__c** (Checkbox): Indicates if the alert can be dismissed by the user.
- **Applicable_Apps__c** (Multi-select Picklist: e.g., System, CRM, SMS, PSA, SVC): Applications affected by the maintenance.
- **Status__c** (Picklist: e.g., Scheduled, Draft, Complete, Cancelled): Status of the maintenance; only 'Scheduled' records are active for alerts.

![Maintenance Records Example](./img/Screenshot%202024-05-21%20162544.png)

## Apex Methods

This component relies on two Apex methods:

1. `getActiveScheduledMaintenances(appContext)` - Fetches active scheduled maintenance records.
2. `getAppIdByDeveloperName(developerName)` - Fetches the application ID for navigation.

## Properties

- `@track scheduledMaintenances`: Stores the fetched maintenance records.
- `@track appId`: Stores the App ID for navigation.
- `@track isModalOpen`: Controls the visibility of the modal.
- `@track isDismissible`: Determines if the modal can be dismissed.
- `@track isSystemMaintenance`: Indicates if there is an active system-wide maintenance.
- `@track isInMaintenance`: Indicates if any record is in the maintenance window.
- `@track isFullLock`: Indicates if the application is fully locked due to maintenance.
- `@api title`: Default title for the modal.
- `@api currentAppContext`: Application context.
- `@track activeSectionName`: Stores the name of the active section in the accordion.

## Methods

### Lifecycle Methods

- **`connectedCallback()`**: Called after the component is inserted into the DOM. It initializes the App ID fetching and sets up the maintenance data fetch intervals.
- **`disconnectedCallback()`**: Called when the component is removed from the DOM. Clears any set intervals to prevent memory leaks.

### Data Fetching and Processing

- **`fetchScheduledMaintenances()`**: Fetches scheduled maintenance records from the Apex service and logs the fetch time.
- **`processScheduledMaintenances(data, now)`**: Processes the fetched maintenance records, filtering and formatting them for display.

### Interval Management

- **`setupIntervals()`**: Sets up the intervals for fetching data:
  - Fetches data every 5 minutes for the first 30 minutes.
  - Switches to fetching data every 30 minutes after the first 30 minutes.

### Maintenance Status and Alerts

- **`updateDismissibleStatus()`**: Updates the dismissible status of the modal based on the current maintenance conditions.
- **`calculateDismissible(record, now)`**: Determines if a record is dismissible based on its start and end times.
- **`shouldShowAlert(record, currentDate)`**: Determines if an alert should be shown based on its timing and dismissibility.
- **`frequencyAllowsAlert(frequency, lastDismissed, currentDate)`**: Determines if a maintenance alert should be repeated based on its frequency and the last dismissal date.

### Navigation

- **`fetchAppId()`**: Fetches the App ID for navigation purposes.
- **`navigateToApp()`**: Navigates to another app using the fetched App ID.

### User Interactions

- **`dismissAllRecords()`**: Dismisses all maintenance records by updating their last dismissed date in local storage.

### Utility Methods

- **`formatDateTime(dateTime)`**: Formats date and time strings for display.

## Usage

To use the `ScheduledMaintenanceComponent`, include it in your Lightning page or another component as follows:

```html
<c-scheduled-maintenance-component current-app-context="YourAppContext"></c-scheduled-maintenance-component>

# Scheduled Maintenance Component

## Overview

The `ScheduledMaintenanceComponent` is a Salesforce Lightning Web Component (LWC) designed to manage and display scheduled maintenance alerts within a Salesforce ORG. It leverages the `Scheduled_Maintenance__c` object to retrieve and display relevant maintenance records based on their field values directly to the use on page view.

Key features include dynamic updates of maintenance information at specified intervals, ensuring users remain informed without needing to refresh the page. Authorized admins can block apps or the system usage as long as the component is placed on the appropriate Lightning pages and experience sites. The app context can be defined on the component located on the Lightning page. The targeted system maintenance can be adjusted in the maintenance record based on the values of the multi-select picklist called `Applicable Apps`. All components by default have a app context of "System" so any scheduled maintenance records with "system" in the Applicable Apps field will show on every component. 

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

## Usage

To use the `ScheduledMaintenanceComponent`, include it in your Lightning page or another component as follows:

```html
<c-scheduled-maintenance-component current-app-context="YourAppContext"></c-scheduled-maintenance-component>

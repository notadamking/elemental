# TB62: Settings Page - Notifications Specification

**Version:** 1.0.0
**Status:** Implemented
**Last Updated:** 2026-01-24

## Purpose

Provide user-configurable notification preferences for controlling what events trigger notifications and how toast notifications appear in the application.

## Features

### 1. Notification Type Preferences

Users can toggle notifications for specific event types:

| Type | Description | Default |
|------|-------------|---------|
| Task Assigned | When a task is assigned to you or your team | Enabled |
| Task Completed | When a task you're watching is completed | Enabled |
| New Message | When you receive a new message in a channel | Enabled |
| Workflow Completed | When a workflow finishes or encounters an error | Enabled |

Each toggle can be independently enabled or disabled. These settings control both in-app toast notifications and browser notifications (when enabled).

### 2. Browser Notifications

Browser (desktop) notification support with permission handling:

- **Permission Request**: Button to request browser notification permission when not yet granted
- **Permission Status Display**: Shows current permission state (granted, denied, or unsupported)
- **Enable/Disable Toggle**: When permission is granted, users can toggle browser notifications on/off

Permission states:
- `default`: Show "Enable Browser Notifications" button
- `granted`: Show toggle to enable/disable
- `denied`: Show warning message that notifications are blocked
- `unsupported`: Show warning that browser doesn't support notifications

### 3. Toast Notification Settings

Configure in-app toast notification appearance:

**Duration Options:**
- 3 seconds (quick)
- 5 seconds (default)
- 10 seconds (extended)

**Position Options:**
- Top Right (default)
- Top Left
- Bottom Right
- Bottom Left

## Storage

| Key | Type | Description |
|-----|------|-------------|
| `settings.notifications` | JSON | Full notification settings object |

### Settings Object Schema

```typescript
interface NotificationsSettings {
  browserNotifications: boolean;
  preferences: {
    taskAssigned: boolean;
    taskCompleted: boolean;
    newMessage: boolean;
    workflowCompleted: boolean;
  };
  toastDuration: 3000 | 5000 | 10000;
  toastPosition: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
}

const DEFAULT_NOTIFICATIONS: NotificationsSettings = {
  browserNotifications: false,
  preferences: {
    taskAssigned: true,
    taskCompleted: true,
    newMessage: true,
    workflowCompleted: true,
  },
  toastDuration: 5000,
  toastPosition: 'top-right',
};
```

## Implementation Details

### Settings Page Component

Location: `apps/web/src/routes/settings.tsx`

- `NotificationsSection` component with three grouped subsections:
  - Browser Notifications (permission handling)
  - Notification Types (toggle rows)
  - Toast Settings (duration and position selectors)
- `ToggleSwitch` reusable component for on/off toggles
- `NotificationToggleRow` component for notification type toggles with icon and description
- Button-based selectors for duration and position (visual active state)

### Toast Library Integration

Location: `apps/web/src/main.tsx`

- Sonner library (`sonner`) provides toast notifications
- `DynamicToaster` component reads position and duration from settings
- Settings changes take effect immediately (polling for same-tab changes)
- `storage` event listener for cross-tab synchronization

### Exported Functions

Location: `apps/web/src/routes/settings.tsx`

```typescript
export function getNotificationSettings(): NotificationsSettings;
export function getToastPosition(): ToastPosition;
export function getToastDuration(): ToastDuration;
export function shouldNotify(type: keyof NotificationPreferences): boolean;
```

### UI Components

- **Toggle Switch**: Custom switch component with accessible `role="switch"` and `aria-checked`
- **Toggle Row**: Horizontal row with icon, label, description, and toggle
- **Duration Buttons**: Row of 3 buttons, selected shows blue border
- **Position Grid**: 2x2 grid of buttons for corner positions

## Test Coverage

21 Playwright tests in `apps/web/tests/notification-settings.spec.ts`:

- Section visibility and navigation
- Toggle defaults and state changes
- Duration and position selection
- localStorage persistence
- Cross-session persistence (page reload)
- Multiple settings changed in sequence

## User Experience

1. User navigates to Settings → Notifications
2. Sees three sections:
   - Browser Notifications (with permission UI if not granted)
   - Notification Types (four toggles)
   - Toast Settings (duration and position selectors)
3. Toggles notification types on/off as desired
4. Selects preferred toast duration and position
5. All changes persist immediately to localStorage
6. Toast notifications respect the configured position and duration

## Dependencies

- `sonner`: Toast notification library
- Integrated with React via `<Toaster>` component

## Future Considerations

- Add notification sounds (with volume control)
- Add notification center to view history of notifications
- Add "Do Not Disturb" mode
- Add per-channel notification settings
- Add email notification settings (requires server-side implementation)
- Integrate with WebSocket events to trigger real notifications on task/message events

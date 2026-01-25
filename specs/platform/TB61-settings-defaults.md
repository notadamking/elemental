# TB61: Settings Page - Default Views Specification

**Version:** 1.0.0
**Status:** Implemented
**Last Updated:** 2026-01-25

## Purpose

Provide user-configurable default view preferences that persist across sessions and are applied automatically when loading pages.

## Features

### 1. Tasks Default View

Users can choose between:
- **List View**: Traditional table layout with sorting and filtering
- **Kanban View**: Drag-and-drop board organized by status

The selection is stored in `settings.defaults` (JSON) and also synced to `tasks.viewMode` for compatibility with existing task page logic.

### 2. Dashboard Default Lens

Users can choose which dashboard lens to show when navigating to the dashboard:
- **Overview**: Key metrics and quick actions (default)
- **Task Flow**: Ready, blocked, and completed tasks in columns
- **Agents**: Agent workload and activity monitoring
- **Dependencies**: Visual dependency graph
- **Timeline**: Chronological event feed

The router redirects `/` to the user's preferred lens route.

### 3. Default Sort Order

Users can choose the default sort order for lists:
- **Last Updated**: Most recently modified first (default)
- **Date Created**: Newest items first
- **Priority**: Highest priority first
- **Title**: Alphabetical order

## Storage

| Key | Type | Description |
|-----|------|-------------|
| `settings.defaults` | JSON | Master defaults object with all settings |
| `tasks.viewMode` | string | Synced from `settings.defaults.tasksView` for backwards compatibility |

### Settings Object Schema

```typescript
interface DefaultsSettings {
  tasksView: 'list' | 'kanban';
  dashboardLens: 'overview' | 'task-flow' | 'agents' | 'dependencies' | 'timeline';
  sortOrder: 'updated_at' | 'created_at' | 'priority' | 'title';
}
```

## Implementation Details

### Settings Page Component

Location: `apps/web/src/routes/settings.tsx`

- `DefaultsSection` component with three grouped option grids
- `OptionCard` reusable component for each preference option
- Checkmark icon indicates selected option
- Selections persist immediately without requiring page refresh

### Router Integration

Location: `apps/web/src/router.tsx`

- Index route (`/`) checks `getDefaultDashboardLens()` and redirects accordingly
- Dashboard lens routes map:
  - `overview` → `/dashboard`
  - `task-flow` → `/dashboard/task-flow`
  - `agents` → `/dashboard/agents`
  - `dependencies` → `/dashboard/dependencies`
  - `timeline` → `/dashboard/timeline`

### Exported Functions

Location: `apps/web/src/routes/settings.tsx`

```typescript
export function getDefaultTasksView(): 'list' | 'kanban';
export function getDefaultDashboardLens(): DashboardLens;
export function getDefaultSortOrder(): DefaultSortOrder;
```

## Test Coverage

20 Playwright tests in `apps/web/tests/defaults-settings.spec.ts`:

- Section visibility and option display
- Selection persistence in localStorage
- Cross-page effect verification (tasks page respects view mode)
- Router redirection based on lens preference
- Multiple settings can be changed in sequence

## User Experience

1. User navigates to Settings → Defaults
2. Sees three groups of options with visual cards
3. Clicks an option to select it (immediate visual feedback)
4. Option is persisted to localStorage automatically
5. Next time user loads the affected page, their preference is applied

## Future Considerations

- Add default view settings for other pages (plans, workflows, documents)
- Add ability to reset defaults to factory settings
- Consider syncing defaults across devices via server-side storage

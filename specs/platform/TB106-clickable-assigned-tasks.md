# TB106: Clickable Assigned Tasks

**Status:** Implemented
**Last Updated:** 2026-01-26

## Purpose

Make task list items in EntityDetailPanel clickable so users can quickly navigate to task details from an entity's profile.

## Requirements

- [x] Web: Task list items in EntityDetailPanel are clickable
- [x] Web: Click → navigate to `/tasks?selected=:id`
- [x] Web: Consistent with task clicking behavior elsewhere in app (uses URL search params)
- [x] Web: Proper hover and focus states for visual feedback
- [x] Web: Keyboard accessible (Enter/Space to activate)
- [x] Web: "View all tasks" link when entity has more than 5 tasks

## Implementation Details

### Modified Components

1. **TaskMiniCard** (`apps/web/src/routes/entities.tsx:938-973`)
   - Added optional `onClick` prop for click handler
   - Added keyboard event handlers (Enter/Space)
   - Added proper ARIA attributes (`role="button"`, `tabIndex={0}`)
   - Added hover and focus styling classes
   - Added `data-testid` for testing

2. **EntityDetailPanel** (`apps/web/src/routes/entities.tsx:1897+`)
   - Added `handleNavigateToTask` function that navigates to `/tasks?selected={taskId}`
   - Updated TaskMiniCard usage to pass `onClick={handleNavigateToTask}`
   - Updated "more tasks" text to be a clickable button that navigates to `/tasks?assignee={entityId}`

### Navigation Pattern

When a task is clicked:
1. User clicks task in EntityDetailPanel
2. `handleNavigateToTask(taskId)` is called
3. Navigation to `/tasks?selected={taskId}&page=1&limit=25`
4. Tasks page opens with the task selected and detail panel visible

When "view all tasks" is clicked:
1. User clicks "+X more tasks" button
2. Navigation to `/tasks?assignee={entityId}&page=1&limit=25`
3. Tasks page opens filtered to show all tasks assigned to that entity

## Testing

### Playwright Tests

File: `apps/web/tests/tb106-clickable-assigned-tasks.spec.ts`

| Test | Description | Status |
|------|-------------|--------|
| task items in entity detail are clickable | Verifies clicking task navigates to /tasks with selected param | Pass |
| task items have proper hover state | Verifies role="button", tabIndex, cursor-pointer class | Pass |
| task items are keyboard accessible | Verifies Enter key triggers navigation | Pass |
| view all tasks link navigates to filtered tasks | Verifies "+X more tasks" navigates with assignee filter | Skip (needs >5 tasks) |
| task click behavior is consistent with task list page | Verifies navigation pattern matches rest of app | Pass |

**Test Results:** 4 passed, 1 skipped (entity needs >5 assigned tasks)

## Verification

1. Navigate to `/entities`
2. Click on an entity card to open detail panel
3. In the "Assigned Tasks" section, tasks should be clickable
4. Click a task → should navigate to `/tasks?selected={taskId}`
5. Task detail panel should open on the tasks page
6. If entity has >5 tasks, "+X more tasks" should navigate to filtered view

## Related Specs

- [TB104: Clickable Member Names](./TB104-clickable-member-names.md) - Similar clickable entity pattern
- [TB105: Clickable Workload Distribution](./TB105-clickable-workload.md) - Similar navigation to filtered tasks

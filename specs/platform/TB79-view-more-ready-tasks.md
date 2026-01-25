# TB79: View More Ready Tasks Fix

## Purpose

Enable users to navigate from the dashboard "Ready Tasks" widget to the Tasks page with a pre-applied filter showing only ready (unblocked) tasks. This provides a seamless workflow for users who want to focus on actionable tasks.

## Properties / Structure

### URL Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `readyOnly` | boolean | When `true`, filters tasks to show only ready (unblocked) tasks |

### Filter Chip

| Component | Description |
|-----------|-------------|
| ReadyFilterChip | Displays "Ready tasks only" with a clear button when `readyOnly=true` |

## Behavior

### Dashboard Links

1. **"View all" link** in Ready Tasks section navigates to `/tasks?readyOnly=true`
2. **"View N more ready tasks" link** (when >5 ready tasks exist) navigates to `/tasks?readyOnly=true`
3. **Quick Action "View Ready Tasks" button** navigates to `/tasks?readyOnly=true`

### Tasks Page Filtering

1. When `readyOnly=true` is in the URL:
   - Fetch ready task IDs from `/api/tasks/ready` endpoint
   - Filter in-memory task list to only include tasks with those IDs
   - Display blue "Ready tasks only" filter chip with clear button
2. Filter is preserved during:
   - Pagination (changing pages)
   - Sorting (changing sort field/direction)
   - Clearing other filters (status, priority, assignee)
3. Clicking "Clear filter" removes `readyOnly` from URL and shows all tasks

### Ready Tasks Definition

A task is "ready" when:
- Status is `open` or `in_progress` (not blocked, closed, deferred)
- Not in the `blocked_cache` table (no blocking dependencies)
- Not scheduled for the future
- Not part of an ephemeral workflow (unless `includeEphemeral` is true)

## Implementation

### Files Modified

| File | Changes |
|------|---------|
| `apps/web/src/router.tsx` | Added `readyOnly` to tasks route validateSearch |
| `apps/web/src/routes/dashboard.tsx` | Updated all "View" links to include `readyOnly=true` |
| `apps/web/src/routes/tasks.tsx` | Added `useReadyTaskIds` hook, filter logic, and filter chip UI |

### Key Components

```typescript
// Hook to fetch ready task IDs
function useReadyTaskIds() {
  return useQuery<Set<string>>({
    queryKey: ['tasks', 'ready', 'ids'],
    queryFn: async () => {
      const response = await fetch('/api/tasks/ready');
      const tasks = await response.json();
      return new Set(tasks.map((t) => t.id));
    },
  });
}

// Filter function that respects readyOnly
const filterFn = useMemo(() => {
  if (readyOnly && readyTaskIds) {
    return (task: Task) => {
      if (!readyTaskIds.has(task.id)) return false;
      if (baseFilter) return baseFilter(task);
      return true;
    };
  }
  return baseFilter;
}, [readyOnly, readyTaskIds, baseFilter]);
```

## Implementation Checklist

- [x] Phase 1: Router Update
  - [x] Add `readyOnly` parameter to tasks route validateSearch

- [x] Phase 2: Dashboard Links
  - [x] Update "View all" link with readyOnly=true
  - [x] Update "View N more ready tasks" link with readyOnly=true
  - [x] Update "View Ready Tasks" quick action button with readyOnly=true

- [x] Phase 3: Tasks Page Filter
  - [x] Add useReadyTaskIds hook to fetch ready task IDs
  - [x] Extract readyOnly from URL search params
  - [x] Create filter function that filters by ready task IDs
  - [x] Include ready tasks loading state in isLoading

- [x] Phase 4: Filter Chip UI
  - [x] Add filter chip component showing "Ready tasks only"
  - [x] Add clear button to remove readyOnly filter
  - [x] Style with blue background to match ready task theme

- [x] Phase 5: URL Preservation
  - [x] Preserve readyOnly during pagination
  - [x] Preserve readyOnly during sorting
  - [x] Preserve readyOnly when clearing other filters

- [x] Phase 6: Testing
  - [x] Playwright tests for dashboard link navigation
  - [x] Playwright tests for filter chip display/clear
  - [x] Playwright tests for filter preservation during pagination
  - [x] Integration test for full flow

## Test Coverage

10 Playwright tests in `apps/web/tests/tb79-view-more-ready-tasks.spec.ts`:

1. View all link navigates to tasks page with readyOnly filter
2. "View N more ready tasks" link navigates with readyOnly filter
3. Quick action "View Ready Tasks" button navigates with readyOnly filter
4. Tasks page displays filter chip when readyOnly is in URL
5. Filter chip shows clear button that removes filter
6. Tasks page without readyOnly shows all tasks (no filter chip)
7. readyOnly filter is preserved during pagination
8. readyOnly filter filters tasks correctly
9. Other filters work alongside readyOnly filter
10. Clearing other filters preserves readyOnly filter
11. Full flow: Dashboard → Tasks with readyOnly → Clear filter

## Status

**Implemented** - 2026-01-25

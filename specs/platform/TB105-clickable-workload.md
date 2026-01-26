# TB105: Clickable Workload Distribution

**Status:** Implemented
**Created:** 2026-01-25

## Purpose

Make workload distribution charts interactive by allowing users to click on bars to navigate to tasks filtered by the clicked entity. This provides a quick way to drill down from workload visualizations to the underlying task data.

## Scope

Workload charts exist in three locations:
1. **Dashboard Overview** - `WorkloadByAgentChart` (Recharts horizontal bar chart)
2. **Agent Activity Page** - `WorkloadChart` (custom progress bars)
3. **Team Detail Panel** - `WorkloadBar` components

## Requirements

### Click Behavior
- [x] Clicking on a workload bar navigates to `/tasks?assignee=:entityId`
- [x] Navigation includes default pagination parameters (`page=1`, `limit=25`)
- [x] Tasks page respects the `assignee` URL parameter for filtering

### Hover Behavior
- [x] Workload bars show hover effect (cursor change, color highlight)
- [x] Dashboard chart shows tooltip with exact count and percentage
- [x] Agent Activity and Team bars display count and percentage inline

### URL Parameter Support
- [x] Tasks page route accepts `assignee` search parameter
- [x] Filter state syncs with URL `assignee` parameter
- [x] Clearing filters removes `assignee` from URL

## Implementation Details

### Files Modified

1. **`apps/web/src/router.tsx`**
   - Added `assignee` to tasks route `validateSearch` return type

2. **`apps/web/src/routes/tasks.tsx`**
   - Added `assigneeFromUrl` from URL search params
   - Initialize filter state with URL assignee
   - Sync assignee filter when URL changes
   - Include assignee in URL when filter changes
   - Clear assignee from URL when clearing all filters

3. **`apps/web/src/components/dashboard/DashboardCharts.tsx`**
   - Added `useNavigate` import
   - Updated `WorkloadByAgentData` interface to include `percentage`
   - Updated `calculateWorkloadByAgent` to compute percentage
   - Updated `BarChartTooltip` to show percentage and click hint
   - Added click handler to `Bar` component in `WorkloadByAgentChart`

4. **`apps/web/src/routes/agent-activity.tsx`**
   - Added `onBarClick` prop to `WorkloadChart` component
   - Changed workload items from `div` to `button` elements
   - Added cursor and hover styling
   - Connected click handler to navigate to filtered tasks

5. **`apps/web/src/routes/teams.tsx`**
   - Added `onClick` prop to `WorkloadBar` component
   - Added `useNavigate` hook inside component
   - Changed from `div` to `button` element
   - Added cursor and hover styling
   - Default click behavior navigates to filtered tasks

### Test Coverage

**Test File:** `apps/web/tests/tb105-clickable-workload.spec.ts`

9 tests covering:
- Dashboard chart bar click navigation
- Dashboard chart tooltip percentage display
- Agent Activity bar click navigation
- Agent Activity bar hover effect
- Agent Activity bar count/percentage display
- Team workload bar click navigation
- Team workload bar count/percentage display
- Tasks page assignee URL parameter support
- Filter clearing removes assignee from URL

## User Experience

1. User views a workload chart in Dashboard, Agent Activity, or Team Detail
2. User hovers over a bar to see exact count and percentage
3. User clicks on a bar
4. Navigation occurs to Tasks page with assignee filter pre-applied
5. User sees only tasks assigned to the clicked entity
6. User can clear the filter to see all tasks again

## Design Decisions

1. **Preserve existing navigation params**: When navigating, include default pagination (`page=1`, `limit=25`) to ensure consistent URL structure
2. **Button semantics**: Changed workload bars to `<button>` elements for proper accessibility and keyboard support
3. **Visual feedback**: Added hover effects (cursor pointer, text color change) to indicate clickability
4. **Tooltip enhancement**: Dashboard chart tooltip now shows both count and percentage with "Click to view tasks" hint
5. **URL as source of truth**: The assignee filter syncs bidirectionally with the URL, ensuring deep linking works correctly

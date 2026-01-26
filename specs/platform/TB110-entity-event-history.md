# TB110: Entity Event History (Commit History Style)

## Purpose

Add a "History" tab to the EntityDetailPanel that displays all events performed by the entity in a git commit log style. This provides a comprehensive audit trail view that shows exactly what the entity has done, with the ability to expand events to see detailed changes (old/new values).

## Properties / Structure

### API Endpoint

**GET /api/entities/:id/history**

Query Parameters:
- `limit` (number, default: 50) - Number of events per page
- `offset` (number, default: 0) - Pagination offset
- `eventType` (string, optional) - Filter by event type (created, updated, closed, deleted). Supports comma-separated values.

Response:
```typescript
interface EntityHistoryResult {
  items: ElementalEvent[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
}
```

### UI Components

**HistoryTabContent**
- Manages pagination state (page, pageSize)
- Manages event type filter with localStorage persistence
- Manages expanded events set
- Shows loading, error, and empty states
- Displays pagination controls when total > pageSize

**HistoryEventItem**
- Git commit log style display:
  - Short hash (7 digits from event ID)
  - Event description (human-readable)
  - Element ID (monospace, truncated)
  - Timestamp (relative or absolute)
- Expandable details showing:
  - Changed fields with old/new values
  - Diff-style coloring (red for removed, green for added)

### Event Type Filter Options

| Value | Label | Description |
|-------|-------|-------------|
| all | All Events | Show all event types |
| created | Created | Show only 'created' events |
| updated | Updated | Show only 'updated' events |
| closed | Closed | Show only 'closed' events |
| deleted | Deleted | Show only 'deleted' events |

## Behavior

### Tab Navigation
1. History tab button appears in entity detail tabs
2. Clicking tab switches to history content
3. Tab state resets when entity changes

### Event Display
1. Events displayed in chronological order (newest first)
2. Short hash clickable to toggle expansion
3. Eye icon also toggles expansion
4. Expand/collapse all buttons for bulk operations

### Filtering
1. Click filter button to filter by event type
2. "All Events" is default
3. Selected filter persists to localStorage
4. Pagination resets when filter changes

### Pagination
1. Default page size: 25 events
2. Previous/Next buttons shown when total > pageSize
3. Current page and total pages displayed
4. Showing X-Y of Z total displayed

### Expansion Details
1. Shows "Changes (N)" header
2. Lists changed fields with:
   - Field name
   - Old value (red background with minus)
   - New value (green background with plus)
3. Limited to 10 fields with "+N more" overflow
4. Shows "No detailed changes recorded" if no data

## Implementation

### Server Changes

File: `apps/server/src/index.ts`
- Enhanced `/api/entities/:id/events` endpoint with offset and eventType params
- Added new `/api/entities/:id/history` endpoint with pagination response format

### Web Changes

File: `apps/web/src/routes/entities.tsx`
- Added `'history'` to `EntityDetailTab` type
- Added `useEntityHistory` hook for paginated history fetching
- Added `HistoryEventTypeFilter` type and filter options
- Added localStorage helpers for filter persistence
- Added `HistoryEventItem` component for commit-log style display
- Added `HistoryTabContent` component managing full history tab
- Updated EntityDetailPanel tabs to include History tab

### Data Structures

```typescript
type HistoryEventTypeFilter = 'all' | 'created' | 'updated' | 'closed' | 'deleted';

interface EntityHistoryResult {
  items: ElementalEvent[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
}
```

## Implementation Checklist

- [x] Server: Add `/api/entities/:id/history` endpoint with pagination
- [x] Server: Support `eventType` filter parameter
- [x] Server: Support `offset` and `limit` parameters
- [x] Web: Add History tab to EntityDetailPanel tabs
- [x] Web: Create `useEntityHistory` hook
- [x] Web: Create `HistoryEventItem` component
- [x] Web: Create `HistoryTabContent` component
- [x] Web: Event type filter buttons with active state
- [x] Web: Filter persistence in localStorage
- [x] Web: Expand/collapse all functionality
- [x] Web: Expandable event details with diff view
- [x] Web: Pagination controls
- [x] Web: Loading, error, and empty states
- [x] Tests: 10 Playwright tests passing

## Test Coverage

File: `apps/web/tests/tb110-entity-event-history.spec.ts`

| Test | Description |
|------|-------------|
| history tab is visible | Verifies History tab button appears |
| clicking history tab shows history content | Verifies tab switch works |
| history tab shows event type filter buttons | Verifies all filter buttons present |
| history items display in commit log style | Verifies hash, message, timestamp display |
| clicking event hash expands to show details | Verifies expansion toggle (skipped if no events) |
| expand all / collapse all buttons work | Verifies bulk expansion buttons |
| clicking filter button updates displayed events | Verifies filter switching |
| filter persists in localStorage | Verifies persistence across page loads |
| pagination controls appear | Verifies pagination UI |
| shows empty state when no events | Verifies empty state message |
| shows filtered empty state | Verifies filtered empty state message |

## Future Enhancements

- Add page size selector
- Add date range filter
- Add element type filter
- Export history to CSV/JSON
- Search within history
- Keyboard navigation for events

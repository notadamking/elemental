# TB116: Horizontal Timeline View

## Purpose

Add a horizontal timeline visualization option to the Timeline lens, allowing users to see events plotted on a time axis. This provides a visual alternative to the list view that makes it easier to understand event patterns, clustering, and temporal relationships.

## Properties / Structure

### View Mode State

| Property | Type | Description |
|----------|------|-------------|
| viewMode | `'list' \| 'horizontal'` | Current view mode, persisted in localStorage |
| timeRange | `'24h' \| '7d' \| '30d' \| 'all'` | Time range filter for horizontal view |
| zoom | number | Zoom level (1.0 = 100%, up to 10.0 = 1000%) |
| panOffset | number | Horizontal scroll offset in pixels |

### Time Range Options

| Value | Label | Hours |
|-------|-------|-------|
| 24h | Last 24 Hours | 24 |
| 7d | Last 7 Days | 168 |
| 30d | Last 30 Days | 720 |
| all | All Time | null |

### Event Dot Positioning

Events are positioned on an SVG canvas with:
- X position: Calculated from `(eventTime - minTime) / timeSpan * canvasWidth`
- Y position: Base Y at 100px, with stacking for overlapping events
- Collision detection: Events within 20px horizontal distance are stacked vertically

### Event Dot Colors

Event type colors match the existing EVENT_TYPE_COLORS scheme:
- Created: Green (#22c55e)
- Updated: Blue (#3b82f6)
- Closed: Purple (#a855f7)
- Reopened: Yellow (#eab308)
- Deleted: Red (#ef4444)
- And more...

## Behavior

### View Mode Toggle

1. **Default**: List view is the default for new users
2. **Persistence**: View mode saved to localStorage key `timeline-view-mode`
3. **Toggle**: Two-button toggle in the header (List | Horizontal)
4. **Active State**: Active button has white background with shadow

### Horizontal Timeline Interactions

1. **Pan**: Click and drag to pan when zoomed in (cursor changes to grab/grabbing)
2. **Zoom**:
   - Click zoom in/out buttons (1.5x steps)
   - Ctrl/Cmd + scroll wheel
   - Max zoom: 10x, Min zoom: 1x
3. **Fit to View**: Reset zoom to 100% and pan to 0
4. **Hover**: Shows tooltip with event details (type, element ID, timestamp, actor)
5. **Click**: Opens event card below the timeline

### Time Axis

- Auto-scales labels based on time span:
  - < 2 days: Show time (HH:MM)
  - < 30 days: Show date (MMM DD)
  - > 30 days: Show month/year (MMM 'YY)
- Labels positioned evenly across canvas width
- Number of labels scales with canvas width (min 4)

### Filter Integration

All existing filters (event type, actor, element type, search) work in both views:
- Filtered events are passed to HorizontalTimeline component
- Filter controls remain visible in header regardless of view mode

## Implementation Methodology

### Phase 1: View Mode Toggle ✓
- Add TimelineViewMode type
- Add ViewModeToggle component
- Add viewMode state with localStorage persistence
- Modify TimelinePage to conditionally render views

### Phase 2: Horizontal Timeline Component ✓
- Create HorizontalTimeline component
- Implement time bounds calculation with padding
- Implement event dot positioning with collision detection
- Add time axis label generation

### Phase 3: Interactions ✓
- Add pan support (mouse drag)
- Add zoom controls (buttons + scroll)
- Add event dot hover tooltip
- Add event dot click to show card

### Phase 4: Polish ✓
- Add time range selector
- Add legend
- Add loading state
- Add empty state

## Implementation Checklist

- [x] Web: Add "Horizontal" view toggle to Timeline lens (alongside List view)
- [x] Web: Horizontal timeline shows events as dots on a time axis
- [x] Web: X-axis: time (auto-scaled based on date range)
- [x] Web: Events positioned by timestamp, stacked if overlapping
- [x] Web: Event dots colored by event type (create=green, update=blue, delete=red)
- [x] Web: Hover dot → show event details tooltip
- [x] Web: Click dot → show full event card
- [x] Web: Pan and zoom with mouse/touch (Ctrl+scroll for zoom)
- [x] Web: Time range selector (Last 24h, 7 days, 30 days, All)
- [x] Web: View mode persisted in localStorage
- [x] Web: Legend showing event type colors
- [x] **Verify:** 25 new Playwright tests passing (`apps/web/tests/timeline.spec.ts`)

## Files Modified

| File | Changes |
|------|---------|
| `apps/web/src/routes/timeline.tsx` | Added HorizontalTimeline component, ViewModeToggle, view mode state |
| `apps/web/tests/timeline.spec.ts` | Added 25 new tests for TB116 functionality |
| `specs/platform/PLAN.md` | Marked TB116 as complete |
| `specs/README.md` | Added entry for TB116 spec |

## Testing

### Playwright Tests (25 tests)

1. View mode toggle is visible
2. View mode toggle has List and Horizontal options
3. List view is default
4. Can switch to Horizontal view
5. Can switch back to List view from Horizontal
6. View mode is persisted in localStorage
7. Horizontal timeline shows time range selector
8. Can change time range
9. Horizontal timeline shows zoom controls
10. Zoom in button works
11. Zoom out button is disabled at 100%
12. Zoom out button is enabled after zooming in
13. Fit to view resets zoom
14. Timeline canvas is visible
15. Event dots are displayed when events exist
16. Clicking event dot shows event card
17. Can close selected event card
18. Timeline legend is visible
19. Filters still work in horizontal view

# TB117: Timeline Brush Selection

## Purpose

Add brush selection tool to the horizontal timeline that allows users to drag to select a time range, filtering events within that range for detailed analysis. The selection is shareable via URL parameters.

## Status

**Implemented** - All features complete and tested.

## Features

### 1. Mode Toggle (Pan vs Brush)

- **Pan Mode (Default)**: Drag to navigate the timeline (existing behavior)
- **Brush/Select Mode**: Drag to select a time range
- Visual toggle in toolbar with Hand (pan) and Paintbrush (select) icons
- Mode persists during session

### 2. Brush Selection Interaction

- In brush mode, cursor changes to crosshair
- Drag across timeline canvas to select time range
- Visual feedback during drag:
  - Blue semi-transparent overlay shows selection area
- After completing drag:
  - Dashed border overlay shows committed selection
  - Selection info bar appears with time range details

### 3. Selection Info Bar

- Shows selected time range: "Time range selected: [start date/time] — [end date/time]"
- Shows count of events within selection
- Paintbrush icon for visual context

### 4. Filtered Events List

- Below the timeline, shows list of events within selected range
- Uses same EventCard component as list view
- Scrollable container (max 256px height)
- Empty state when no events in range

### 5. Clear Selection

- "Clear selection" button appears in toolbar when selection active
- Removes selection overlay, info bar, and filtered list
- Resets URL parameters

### 6. URL Synchronization

- Selection synced to URL via `startTime` and `endTime` parameters
- Timestamps stored as milliseconds since epoch
- Enables sharing/bookmarking specific time range views
- Selection restored on page load from URL params

## Implementation Details

### Files Modified

- `apps/web/src/routes/timeline.tsx` - Main implementation
- `apps/web/src/router.tsx` - URL param validation for startTime/endTime
- `apps/web/src/components/navigation/CommandPalette.tsx` - Type fix for navigation
- `apps/web/src/routes/dashboard.tsx` - Type fix for navigation
- `apps/web/src/routes/entities.tsx` - Type fix for navigation

### Key Components

1. **BrushSelection Interface**
   ```typescript
   interface BrushSelection {
     startTime: number;
     endTime: number;
   }
   ```

2. **Mode Toggle** - Switches between pan and brush modes
3. **xToTime/timeToX** - Convert between pixel coordinates and timestamps
4. **Brush Overlays** - Active (during drag) and committed (after drag)

### URL Parameters

| Param | Type | Description |
|-------|------|-------------|
| startTime | number | Start of selection (ms since epoch) |
| endTime | number | End of selection (ms since epoch) |

## Testing

11 Playwright tests in `apps/web/tests/timeline.spec.ts`:

1. Mode toggle is visible in horizontal view
2. Pan mode is default
3. Can switch to brush/select mode
4. Brush selection creates time range selection via drag
5. Brush selection shows clear button
6. Clear button removes selection
7. Brush selection shows selected events list
8. Brush selection syncs with URL params
9. Brush selection is restored from URL on page load
10. Committed selection shows dashed border overlay
11. Can switch back to pan mode after selection

## Implementation Checklist

- [x] Web: Add brush selection tool to horizontal timeline
- [x] Web: Drag to select time range
- [x] Web: Selected range shows filtered events in list below
- [x] Web: "Clear selection" button
- [x] Web: Selection syncs with URL params for shareability
- [x] **Verify:** 11 Playwright tests passing

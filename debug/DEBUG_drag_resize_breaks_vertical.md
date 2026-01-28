# Debug: Drag-to-resize Breaks Vertical Resizing

## Problem Statement

**Reproduction steps:**
1. Navigate to the workspaces page
2. Add 3 panes (creating a layout with 1 pane on left spanning full height, 2 panes stacked on right)
3. Drag the vertical line horizontally to resize column widths
4. Drag the horizontal line vertically to resize the heights of the two rows on the right
5. Console throws errors: "SES_UNCAUGHT_EXCEPTION: null" at lockdown-install.js:1
6. After this, dragging the vertical line to resize widths no longer works

**Expected Behavior:** Both resize operations should work independently and consecutively without errors.

**Actual Behavior:** After resizing rows, the horizontal (column) resize handle stops working.

## Environment

- Date: 2026-01-27
- Files involved:
  - `apps/orchestrator-web/src/components/workspace/WorkspaceGrid.tsx`
  - `apps/orchestrator-web/src/components/workspace/usePaneManager.ts`
  - `apps/orchestrator-web/src/components/workspace/ResizeHandle.tsx`
  - `apps/orchestrator-web/src/components/workspace/types.ts`

## Solution

### Root Cause

The issue had two components:

1. **Z-index missing on resize handles**: The resize handle wrapper divs didn't have a z-index, causing them to be covered by pane content (like "Persistent Worker • Interactive" badges) after resizing changed the layout dimensions. This made the handles unclickable.

2. **Insufficient defensive coding**: The resize handlers in `WorkspaceGrid.tsx` and `usePaneManager.ts` lacked proper validation of array indices and object properties before accessing them, which could cause errors when state was inconsistent.

### Fixes Applied

1. **Added z-index to resize handle wrappers** (`WorkspaceGrid.tsx`):
   - Added `z-10` class to both horizontal and vertical resize handle wrapper divs
   - This ensures resize handles are always above pane content

2. **Improved defensive coding in `handleResizeStart`** (`WorkspaceGrid.tsx`):
   - Added null checks for `gridConfig`
   - Validated sizes array existence and length
   - Validated divider index is within bounds
   - Reset all refs on error
   - Set `currentDeltaFrRef.current = 0` before starting resize

3. **Improved defensive coding in `handleResize`** (`WorkspaceGrid.tsx`):
   - Added explicit validation for each required ref
   - Added type checks for size object `.fr` properties
   - Used map instead of direct array mutation for building new sizes

4. **Improved defensive coding in `startResize`** (`usePaneManager.ts`):
   - Added array validation for sizes
   - Added type checks for size object properties
   - Track validity state to prevent setting resize state with invalid data

5. **Improved defensive coding in `resizeTrack`** (`usePaneManager.ts`):
   - Added validation for source sizes array
   - Added type checks for startSizes tuple elements
   - Used map instead of direct mutation for updating sizes

### Why the fix works

- The z-index ensures resize handles remain interactive regardless of how pane content is positioned
- The defensive coding prevents errors when state is inconsistent during rapid resize operations or when switching between resize directions
- Using map instead of direct mutation ensures immutability and prevents shared reference issues

### Testing

- Added a new test `can resize both horizontal and vertical dividers sequentially` that exercises the exact scenario reported by the user
- All 38 workspace tests pass

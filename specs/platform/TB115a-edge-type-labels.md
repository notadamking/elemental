# TB115a: Edge Type Labels

## Purpose

Display dependency type labels on graph edges with color coding by category to make relationships immediately visible and understandable at a glance.

## Features

### Edge Labels

- Each edge displays its dependency type as a small label centered on the edge
- Labels use a pill-style design with background color matching the edge type
- Labels include tooltips with the full dependency type description
- Labels are visible by default but can be toggled off

### Color Coding by Type Category

Edges are color-coded by dependency type category:

| Category | Types | Color |
|----------|-------|-------|
| Blocking (Critical Path) | blocks, parent-child, awaits | Red/Orange (#ef4444, #f97316, #f59e0b) |
| Associative (Informational) | relates-to, references, validates | Blue/Gray (#3b82f6, #6b7280, #8b5cf6) |
| Attribution (People) | authored-by, assigned-to | Green (#22c55e, #10b981) |

### Toggle Control

- Tag icon button in the toolbar toggles edge label visibility
- Button highlights blue when labels are visible, gray when hidden
- State persists during the session (not saved to localStorage)

### Legend

- Edge type legend section appears below the status legend
- Shows all 8 dependency types with their corresponding colors
- Uses line segments matching the edge stroke colors

## Implementation

### Files Modified

- `apps/web/src/routes/dependency-graph.tsx`
  - Added `EDGE_TYPE_COLORS` configuration for color mapping
  - Added `getEdgeColor()` helper function
  - Extended `CustomEdgeData` interface with `showLabels` property
  - Modified `CustomEdge` component to render labels with colors
  - Added `showEdgeLabels` state and toggle handler
  - Updated `GraphToolbar` with edge labels toggle button
  - Added edge type legend in the footer section

### Components

#### CustomEdge

Enhanced to display:
- Color-coded stroke based on dependency type
- Centered label using `foreignObject` with pill styling
- Tooltip with dependency type description
- Support for hiding labels via `showLabels` prop

#### GraphToolbar

Added:
- Edge labels toggle button (Tag icon)
- Visual feedback for toggle state (blue/gray)

#### Legend Section

Added:
- Edge type legend row showing all 8 dependency types
- Color-coded line segments matching edge strokes

## Testing

6 Playwright tests in `apps/web/tests/dependency-graph.spec.ts`:

1. Edge type legend is displayed
2. Edge type legend shows all dependency types
3. Edge labels toggle button is displayed
4. Clicking edge labels toggle hides and shows edge labels
5. Edge labels display dependency type text
6. Edges have color-coded strokes based on type

## Implementation Checklist

- [x] Web: Display dependency type label on each edge (blocks, parent-child, awaits, relates-to, etc.)
- [x] Web: Label positioning: centered on edge using `foreignObject`
- [x] Web: Label styling: small font, muted color, background pill for readability
- [x] Web: Color-code edges by type:
  - [x] Blocking types (blocks, parent-child, awaits): red/orange
  - [x] Associative types (relates-to, references, validates): blue/gray/purple
  - [x] Attribution types (authored-by, assigned-to): green
- [x] Web: Toggle to show/hide edge labels (default: show)
- [x] Web: Hover edge label → show tooltip with full dependency info
- [x] Web: Legend showing edge type colors and meanings
- [x] **Verify:** 37 Playwright tests passing (`apps/web/tests/dependency-graph.spec.ts`); graph displays labeled, color-coded edges; labels readable at various zoom levels

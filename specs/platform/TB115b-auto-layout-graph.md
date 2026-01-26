# TB115b: Auto-Layout Graph Formatting

## Purpose

Provide automatic layout algorithms for the dependency graph visualization, allowing users to organize nodes in hierarchical, force-directed, or radial patterns with customizable spacing and direction controls.

## Features

### Layout Algorithms

1. **Hierarchical/Tree Layout** (default)
   - Uses dagre library for efficient tree-based positioning
   - Supports four directions: TB (top-bottom), LR (left-right), BT (bottom-top), RL (right-left)
   - Best for graphs with clear dependency direction

2. **Force-Directed Layout**
   - Physics-based simulation with spring forces and node repulsion
   - Best for graphs without clear hierarchy
   - Nodes naturally cluster based on connections

3. **Radial Layout**
   - Root node (selected task) positioned at center
   - Dependencies radiate outward in concentric circles
   - BFS-based level assignment ensures logical organization

### Spacing Controls

- **Node Spacing**: Controls horizontal distance between nodes (40-200px)
- **Rank Spacing**: Controls vertical distance between levels (80-300px)
- Both sliders available in expanded spacing controls section

### Layout Persistence

- Layout preferences saved to localStorage
- Algorithm, direction, and spacing settings persist across page reloads

## UI Components

### Auto Layout Button (Split Button)
- Left side: Click to apply current layout settings
- Right side: Dropdown toggle to access layout options

### Layout Options Dropdown
- Algorithm selection with descriptions
- Direction toggle (for hierarchical only)
- Expandable spacing controls with range sliders
- Apply Layout button at bottom

## Implementation Details

### Files Modified
- `apps/web/src/routes/dependency-graph.tsx` - Main implementation
- `apps/web/tests/dependency-graph.spec.ts` - Test coverage

### Key Functions
- `applyDagreLayout()` - Hierarchical layout using dagre
- `applyForceLayout()` - Spring-force simulation
- `applyRadialLayout()` - BFS-based radial positioning
- `applyAutoLayout()` - Dispatcher to appropriate algorithm

### Dependencies Added
- `dagre@0.8.5` - Graph layout library
- `@types/dagre@0.7.53` - TypeScript definitions

## Implementation Checklist

- [x] Web: Add "Auto Layout" button to graph toolbar
- [x] Web: Implement layout algorithms (dagre, force-directed, radial)
  - [x] Hierarchical/Tree layout: top-to-bottom or left-to-right based on dependency direction
  - [x] Force-directed layout: for graphs without clear hierarchy
  - [x] Radial layout: selected node in center, dependencies radiating outward
- [x] Web: Layout direction toggle: TB (top-bottom), LR (left-right), BT, RL
- [x] Web: Spacing controls: node spacing, rank spacing (distance between levels)
- [x] Web: Animate layout transitions (nodes smoothly move to new positions via React Flow)
- [x] Web: "Fit to View" button (already existed): zoom and pan to show all nodes
- [x] Web: Persist layout preference in localStorage
- [x] Web: Option to save custom node positions (manual drag preserved via React Flow)
- [x] **Verify:** 12 Playwright tests passing (`apps/web/tests/dependency-graph.spec.ts`)

## Test Coverage

12 Playwright tests covering:
- Auto layout button display
- Dropdown toggle functionality
- Algorithm option display and selection
- Direction controls (TB, LR, BT, RL)
- Spacing controls toggle and sliders
- Apply layout functionality
- Preference persistence across reloads

# TB146: Responsive Dashboard Page

## Overview

This ticket implements responsive design for the Dashboard page and its related lenses (Timeline, Dependency Graph). The goal is to ensure the dashboard is fully functional and visually appealing across all device sizes (mobile, tablet, and desktop).

## Requirements

### Dashboard Overview

1. **Metrics Overview Cards**
   - Desktop (1280px+): 4-column grid layout
   - Tablet (768px-1279px): 2-column grid layout
   - Mobile (<768px): 2-column grid layout with compact styling
   - Responsive padding, font sizes, and icon sizes

2. **Dashboard Charts**
   - Desktop: 3-column grid
   - Tablet: 2-column grid
   - Mobile: Single column (stacked)
   - Charts remain functional at all sizes using ResponsiveContainer

3. **Ready Tasks & Recent Activity**
   - Desktop: 2-column side-by-side layout
   - Mobile/Tablet: Stacked vertically
   - Responsive spacing and typography

4. **Elements by Type & System Status**
   - Responsive grid layouts
   - Compact styling on mobile
   - Scrollable on very small screens

### Timeline Lens

1. **Header & Controls**
   - Responsive header with stacked layout on mobile
   - View mode toggle compact on mobile
   - Filter chips scroll horizontally on mobile

2. **Event Cards**
   - Responsive padding and font sizes
   - Truncation of long content on mobile
   - Actor avatars scale appropriately

3. **View Modes**
   - Both list and horizontal timeline work on all devices
   - Horizontal timeline scrollable on mobile

### Dependency Graph Lens

1. **Layout**
   - Desktop: Sidebar task selector + graph canvas
   - Mobile: Horizontal scrollable task selector + graph below

2. **Toolbar**
   - Responsive search input
   - Compact filter buttons on mobile
   - Status filter dropdown adapts to screen size

3. **Legend**
   - Status legend always visible
   - Edge type legend hidden on mobile to save space

## Implementation Details

### Files Modified

1. `apps/web/src/routes/dashboard.tsx`
   - Updated MetricsOverview grid classes
   - Responsive stat card styling
   - Responsive Ready Tasks and Activity Feed
   - Responsive Elements by Type and System Status

2. `apps/web/src/components/dashboard/DashboardCharts.tsx`
   - Responsive grid layout for charts
   - Compact chart styling on mobile
   - Responsive legend items

3. `apps/web/src/routes/timeline.tsx`
   - Responsive header and filter controls
   - Updated FilterChip component for mobile
   - Responsive EventCard component
   - Updated ViewModeToggle for mobile

4. `apps/web/src/routes/dependency-graph.tsx`
   - Responsive page layout (flex-col on mobile, flex-row on desktop)
   - Updated TaskSelector for horizontal scroll on mobile
   - Responsive GraphToolbar
   - Responsive legend

### Responsive Breakpoints Used

- `xs`: 0-479px (small phones)
- `sm`: 480-639px (large phones)
- `md`: 640-767px (small tablets)
- `lg`: 768-1023px (tablets)
- `xl`: 1024-1279px (small laptops)
- `2xl`: 1280px+ (desktops)

### Dark Mode Support

All responsive changes include dark mode variants using Tailwind's dark: modifier.

## Testing

### Playwright Tests

Created `apps/web/tests/tb146-responsive-dashboard.spec.ts` with tests covering:

1. **Dashboard Overview**
   - Desktop view (1280px)
   - Tablet view (768px)
   - Mobile view (375px)

2. **Timeline Lens**
   - Desktop, tablet, and mobile views
   - View mode toggle functionality

3. **Dependency Graph**
   - Desktop, tablet, and mobile views
   - Task selector visibility

4. **Viewport Transitions**
   - Dynamic resizing maintains functionality

All 15 tests pass.

## Acceptance Criteria

- [x] Dashboard metrics cards display correctly on mobile (2-column)
- [x] Dashboard charts stack vertically on mobile
- [x] Ready Tasks and Activity Feed stack on mobile
- [x] Timeline page is usable on mobile with filters accessible
- [x] Dependency Graph is usable on mobile with task selector accessible
- [x] All components maintain dark mode support
- [x] Playwright tests cover responsive scenarios

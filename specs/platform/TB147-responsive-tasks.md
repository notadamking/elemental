# TB147: Responsive Tasks Page Specification

**Version:** 0.1.0 (Draft)
**Last Updated:** 2026-01-26

## Purpose

Make the Tasks page fully responsive across all screen sizes. The Tasks page is the most heavily used page with list view, kanban view, and a detail panel. All three views need mobile-appropriate layouts with touch interactions.

## Breakpoints

Following TB144 responsive foundation:
- **Mobile (xs/sm)**: < 640px - Card-based list, single column kanban, full-screen detail panel
- **Tablet (md/lg)**: 640-1023px - Condensed table, 2-3 column kanban, narrower detail panel
- **Desktop (xl/2xl)**: 1024px+ - Full table, all kanban columns, standard detail panel

## Components Affected

1. **TasksPage** (`routes/tasks.tsx`) - Main layout and responsive logic
2. **ListView / VirtualTaskRow** - Task table/list display
3. **KanbanBoard** - Kanban column layout
4. **TaskDetailPanel** - Side panel / full-screen sheet
5. **CreateTaskModal** - Task creation form
6. **FilterBar** - Filter controls
7. **TaskSearchBar** - Search input
8. **BulkActionMenu** - Bulk operations

## Design Decisions

### Mobile Layout Strategy

1. **List View on Mobile**:
   - Convert table rows to card layout (similar to TaskCard in kanban)
   - Show key info: title, status badge, priority, assignee avatar
   - Touch-friendly: minimum 44px tap targets
   - Swipe gestures deferred (not in initial implementation)

2. **Kanban View on Mobile**:
   - Single column view with column selector tabs
   - Column selector as horizontal scrollable tabs or dropdown
   - Touch-friendly drag and drop with long-press to initiate

3. **Detail Panel on Mobile**:
   - Full-screen modal/sheet (slides up from bottom)
   - Sticky header with close button
   - Hardware back button closes panel
   - URL updates when panel opens/closes

4. **Filters on Mobile**:
   - Collapsed into filter button with active count badge
   - Opens as bottom sheet or modal
   - Search always visible but compact

### Tablet Layout Strategy

1. **List View**: Condensed table, hide less important columns (tags, type)
2. **Kanban**: 2-3 columns visible, horizontal scroll for others
3. **Detail Panel**: Narrower side panel (~320px)

## Implementation Checklist

- [x] Step 1: Create MobileTaskCard component for card-based list view on mobile
- [x] Step 2: Update ListView to switch to card layout on mobile
- [x] Step 3: Make TaskSearchBar and FilterBar responsive
- [x] Step 4: Update KanbanBoard with mobile column selector
- [x] Step 5: Create MobileDetailSheet for full-screen task detail on mobile
- [x] Step 6: Make TaskDetailPanel use MobileDetailSheet on mobile
- [x] Step 7: Make CreateTaskModal full-screen on mobile
- [x] Step 8: Add responsive view toggle (icon-only on mobile)
- [x] Step 9: Add floating action button for create task on mobile
- [x] Step 10: Ensure touch-friendly interactions throughout
- [x] Step 11: Write Playwright tests for all breakpoints

## Technical Notes

### Responsive Hooks Used
- `useIsMobile()` - Check if viewport is mobile (xs/sm)
- `useIsTablet()` - Check if viewport is tablet (md/lg)
- `useBreakpoint()` - Get current breakpoint

### CSS Patterns
- Use Tailwind responsive prefixes: `sm:`, `md:`, `lg:`, `xl:`, `2xl:`
- Use CSS tokens from `tokens.css` for consistent spacing
- Touch target minimum: 44x44px (`touch-target` class)

### State Management
- Maintain view mode preference in localStorage
- URL params for selected task (works across breakpoints)
- Filter state persisted in localStorage

## Verification

Playwright tests at minimum 3 breakpoints:
- Mobile: 375px width
- Tablet: 768px width
- Desktop: 1280px width

Tests cover:
- List view display at each breakpoint
- Kanban view display at each breakpoint
- Detail panel behavior (side panel vs full-screen)
- Create modal behavior
- Filter bar responsiveness
- Search bar responsiveness
- View toggle behavior
- Touch interactions (where applicable)

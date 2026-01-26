# TB155: Responsive Data Tables

**Status:** Complete

## Purpose

Make data display patterns (lists, pagination, sorting) fully responsive across all screen sizes. The app uses card-based layouts rather than traditional data tables, so this ticket focuses on making those card views and their controls responsive.

## Implementation

### Responsive Pagination Component

The `Pagination` component (`apps/web/src/components/shared/Pagination.tsx`) has been enhanced with:

**Mobile Layout (< 640px):**
- Stacked vertical layout with info on top and navigation on bottom
- Compact "X / page" format for page size selector
- Touch-friendly 44px minimum tap targets for prev/next buttons
- Centered page navigation
- Fewer visible page numbers (3 max) to fit mobile width
- Active states for touch feedback

**Desktop Layout (>= 640px):**
- Horizontal layout with info on left and navigation on right
- Full "Show X per page" format with label
- First/Last page buttons visible
- More visible page numbers (5 max)
- Standard hover states

### ResponsiveSortDropdown Component

New component `apps/web/src/components/shared/ResponsiveSortDropdown.tsx`:

**Mobile Layout:**
- Full dropdown button with sort field and direction indicator
- Direction toggle section in dropdown menu
- 44px minimum tap targets for all options
- Clear selected state indication

**Desktop Layout:**
- Compact inline button with "Sort: Field" format
- Direction indicator visible
- Standard dropdown menu

### ResponsiveDataList Component

New component `apps/web/src/components/shared/ResponsiveDataList.tsx`:

**Features:**
- Renders mobile card view vs desktop list view automatically
- Supports virtualization for large datasets
- Consistent empty state handling
- `ResponsiveDataListHeader` sub-component for consistent header patterns

**Mobile Layout:**
- Card-based layout with spacing
- Header stacks vertically: title + actions, then search, then controls

**Desktop Layout:**
- Compact list with dividers
- Header in single row with all controls

## Files Changed

| File | Description |
|------|-------------|
| `apps/web/src/components/shared/Pagination.tsx` | Responsive pagination with mobile stacked layout |
| `apps/web/src/components/shared/ResponsiveSortDropdown.tsx` | New responsive sort control component |
| `apps/web/src/components/shared/ResponsiveDataList.tsx` | New responsive data display wrapper component |
| `apps/web/tests/tb155-responsive-tables.spec.ts` | 16 Playwright tests for responsive data tables |

## Implementation Checklist

- [x] Make Pagination component responsive with mobile stacked layout
- [x] Add 44px touch targets for pagination buttons on mobile
- [x] Show fewer page numbers on mobile
- [x] Create ResponsiveSortDropdown component
- [x] Create ResponsiveDataList component
- [x] Add dark mode support to all components
- [x] Write Playwright tests (16 tests passing)

## Testing

Run tests with:
```bash
npx playwright test tb155-responsive-tables.spec.ts
```

### Test Coverage

1. **Responsive Pagination**
   - Stacked layout on mobile
   - Horizontal layout on desktop
   - Fewer page numbers on mobile
   - Page navigation works on mobile
   - Page size selector works on mobile

2. **Touch-Friendly Elements**
   - Pagination buttons have 44px touch targets
   - Search input has adequate touch target

3. **View Mode Toggle**
   - Works at all viewport sizes

4. **Dark Mode**
   - Pagination has dark mode classes

5. **Timeline**
   - Event cards are responsive
   - Filter chips scroll horizontally on mobile
   - Pagination works in timeline

6. **Entities Page**
   - List adapts to mobile viewport
   - Search works on mobile

7. **Viewport Transitions**
   - Pagination adapts when viewport changes
   - Layout remains usable during viewport changes

## Usage Examples

### Using ResponsiveSortDropdown

```tsx
import { ResponsiveSortDropdown } from '../components/shared/ResponsiveSortDropdown';

const sortOptions = [
  { value: 'name', label: 'Name' },
  { value: 'date', label: 'Date' },
  { value: 'priority', label: 'Priority' },
];

<ResponsiveSortDropdown
  options={sortOptions}
  sortBy="date"
  sortDirection="desc"
  onSortChange={(field, direction) => {
    setSortBy(field);
    setSortDirection(direction);
  }}
/>
```

### Using ResponsiveDataList

```tsx
import { ResponsiveDataList, ResponsiveDataListHeader } from '../components/shared/ResponsiveDataList';

<ResponsiveDataListHeader
  title="Tasks"
  totalCount={tasks.length}
  searchInput={<SearchInput />}
  sortDropdown={<SortDropdown />}
  actions={<CreateButton />}
/>

<ResponsiveDataList
  items={tasks}
  keyExtractor={(task) => task.id}
  renderMobileCard={(task) => <MobileTaskCard task={task} />}
  renderDesktopItem={(task) => <TaskRow task={task} />}
  emptyState={<EmptyTasksState />}
/>
```

## Design Decisions

1. **Card-based layouts** - The app doesn't use traditional data tables with columns, so we focused on making the existing card patterns responsive rather than implementing table-to-card transforms.

2. **Virtualization threshold** - ResponsiveDataList enables virtualization automatically for lists with more than 20 items to balance performance with simplicity.

3. **Touch target sizing** - We followed the WCAG recommendation of 44px minimum tap targets for interactive elements on mobile.

4. **Page number count** - Mobile shows maximum 3 page numbers vs 5 on desktop to avoid cramped layouts.

5. **Dark mode support** - All components include `dark:` variants for proper theming support.

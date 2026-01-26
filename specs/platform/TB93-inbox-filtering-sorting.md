# TB93: Inbox Filtering and Sorting Specification

## Purpose

Add filtering and sorting capabilities to the entity inbox, allowing users to filter messages by source type (direct messages, mentions) and sort by various criteria (newest, oldest, sender name). This enhances the inbox UX by helping users quickly find specific messages.

## Features

### Source Type Filtering

Users can filter inbox messages by their source type:

| Filter Option | Description |
|---------------|-------------|
| All Messages | Show all messages (default) |
| Direct Messages | Show only direct messages (`sourceType === 'direct'`) |
| Mentions | Show only @mentions (`sourceType === 'mention'`) |

### Sort Options

Users can sort inbox messages by:

| Sort Option | Description |
|-------------|-------------|
| Newest First | Sort by `createdAt` descending (default) |
| Oldest First | Sort by `createdAt` ascending |
| By Sender | Sort alphabetically by sender name |

### UI Components

1. **Filter Dropdown Button**
   - Located in the inbox header controls area
   - Shows "Filter" with filter icon
   - Highlighted (blue background) when a filter is active
   - Opens dropdown with source type options

2. **Sort Dropdown Button**
   - Located next to filter button
   - Shows "Sort" with arrows icon
   - Highlighted when sort is not default (newest)
   - Opens dropdown with sort options

3. **Filter Chips**
   - Displayed below view tabs when filters/sort are active
   - Each chip shows the active filter/sort name
   - X button on each chip to clear that setting
   - "Clear all" button when both filter and sort are non-default

4. **Filtered Empty State**
   - Special empty state when filters exclude all messages
   - "No messages match your filters" message
   - "Clear filters" link to reset

## Data Model

### Types

```typescript
type InboxSourceFilter = 'all' | 'direct' | 'mention';
type InboxSortOrder = 'newest' | 'oldest' | 'sender';
```

### LocalStorage Keys

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `inbox.sourceFilter` | `InboxSourceFilter` | `'all'` | Persisted source type filter |
| `inbox.sortOrder` | `InboxSortOrder` | `'newest'` | Persisted sort order |

## Implementation

### Client-Side Filtering

Filtering is implemented client-side using `useMemo`:

```typescript
const filteredAndSortedInboxItems = useMemo(() => {
  if (!inboxData?.items) return [];

  let items = [...inboxData.items];

  // Apply source filter
  if (inboxSourceFilter !== 'all') {
    items = items.filter((item) => item.sourceType === inboxSourceFilter);
  }

  // Apply sorting
  items.sort((a, b) => {
    switch (inboxSortOrder) {
      case 'newest':
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      case 'oldest':
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      case 'sender':
        const senderA = a.sender?.name || '';
        const senderB = b.sender?.name || '';
        return senderA.localeCompare(senderB);
      default:
        return 0;
    }
  });

  return items;
}, [inboxData?.items, inboxSourceFilter, inboxSortOrder]);
```

### Combining with View Filter

The source filter combines with the existing view filter (Unread/All/Archived):

1. View filter (TB90) determines which inbox items are fetched from API
2. Source filter (TB93) applies client-side filtering on the fetched items
3. Sort order (TB93) applies client-side sorting on the filtered items

Example: View "Unread" + Filter "Mentions" shows only unread mention messages.

## Behavior

### Filter/Sort Interaction

1. Changing filter resets the selected inbox item
2. Changing sort preserves the selected inbox item
3. Changing view (unread/all/archived) preserves filter/sort settings
4. Filter/sort preferences persist across page navigation

### Keyboard Navigation

Keyboard navigation (J/K keys from TB91) works with the filtered list, navigating only through visible messages.

### Count Display

When filters are active, the count display shows:
- "Showing X of Y (filtered)" where X is filtered count, Y is total fetched

## Test IDs

| Test ID | Component |
|---------|-----------|
| `inbox-filter-sort-controls` | Container for filter/sort buttons |
| `inbox-filter-button` | Filter dropdown trigger |
| `inbox-filter-dropdown` | Filter dropdown menu |
| `inbox-filter-all` | "All Messages" option |
| `inbox-filter-direct` | "Direct Messages" option |
| `inbox-filter-mention` | "Mentions" option |
| `inbox-sort-button` | Sort dropdown trigger |
| `inbox-sort-dropdown` | Sort dropdown menu |
| `inbox-sort-newest` | "Newest First" option |
| `inbox-sort-oldest` | "Oldest First" option |
| `inbox-sort-sender` | "By Sender" option |
| `inbox-active-filters` | Active filter chips container |
| `inbox-filter-chip-direct` | Direct messages filter chip |
| `inbox-filter-chip-mention` | Mentions filter chip |
| `inbox-sort-chip-oldest` | Oldest first sort chip |
| `inbox-sort-chip-sender` | By sender sort chip |
| `inbox-clear-source-filter` | Clear source filter button |
| `inbox-clear-sort` | Clear sort button |
| `inbox-clear-all-filters` | Clear all filters button |
| `inbox-filtered-empty` | Empty state when filters exclude all |
| `inbox-clear-filters-link` | Clear filters link in empty state |

## Implementation Checklist

- [x] Add `InboxSourceFilter` and `InboxSortOrder` types
- [x] Add localStorage helper functions for persistence
- [x] Add state variables and handlers in `EntityDetailPanel`
- [x] Implement `filteredAndSortedInboxItems` useMemo
- [x] Update keyboard navigation to use filtered list
- [x] Add filter dropdown UI
- [x] Add sort dropdown UI
- [x] Add active filter chips with clear buttons
- [x] Add filtered empty state
- [x] Update count display for filtered state
- [x] Write Playwright tests (17 tests)
- [x] Update PLAN.md

## Playwright Tests

Test file: `apps/web/tests/tb93-inbox-filtering-sorting.spec.ts`

Test coverage:
1. Filter and Sort UI Controls (3 tests)
   - Shows filter and sort buttons
   - Filter dropdown options
   - Sort dropdown options

2. Filter Functionality (3 tests)
   - Direct Messages filter
   - Mentions filter
   - Clear filter chip

3. Sort Functionality (3 tests)
   - Oldest First sort
   - By Sender sort
   - Clear sort chip

4. Combined Filters and Sort (2 tests)
   - Apply both filter and sort
   - Clear All button

5. LocalStorage Persistence (4 tests)
   - Filter persistence
   - Sort persistence
   - Filter restore on reload
   - Sort restore on reload

6. Filter Button Styling (2 tests)
   - Filter button highlighted when active
   - Sort button highlighted when non-default

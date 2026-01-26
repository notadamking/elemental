# TB130: Virtualize Documents List with Infinite Scroll

## Purpose

Replace the "Load more" pagination pattern in the Documents page with smooth virtualized scrolling using @tanstack/react-virtual. This provides a seamless scrolling experience for large document collections without the need for manual pagination.

## Implementation

### Components Modified

1. **LibraryView** (`apps/web/src/routes/documents.tsx`)
   - Removed `displayCount`, `hasMore`, and `handleLoadMore` state/logic
   - Replaced document list with `VirtualizedList` component
   - Changed count display from "X of Y documents" to just "Y documents"
   - Added `renderDocumentItem` callback with memoization
   - Uses `scrollRestoreId` for scroll position preservation

2. **AllDocumentsView** (`apps/web/src/routes/documents.tsx`)
   - Removed `displayCount`, `hasMore`, and `handleLoadMore` state/logic
   - Replaced document list with `VirtualizedList` component
   - Changed count display from "X of Y documents" to just "Y documents"
   - Added `renderDocumentItem` callback with memoization
   - Uses `scrollRestoreId` for scroll position preservation
   - Client-side search filtering works instantly with virtualized list

### Technical Details

- **Item Height**: 64px (`DOCUMENT_ITEM_HEIGHT` constant)
- **Gap**: 8px between items
- **Overscan**: 5 items rendered outside visible area for smooth scrolling
- **Scroll Restoration**: Each view has unique `scrollRestoreId` for position preservation

### VirtualizedList Props Used

```typescript
<VirtualizedList
  items={filteredDocuments}
  getItemKey={(doc) => doc.id}
  estimateSize={DOCUMENT_ITEM_HEIGHT}  // 64px
  renderItem={renderDocumentItem}
  overscan={5}
  className="h-full pt-2"
  scrollRestoreId="all-documents-scroll"
  testId="virtualized-all-documents-list"
  gap={8}
/>
```

## Behavior

1. **No Load More Button**: Documents load continuously as user scrolls
2. **Instant Filtering**: Search results update immediately with all matching documents
3. **Total Count Display**: Shows total count (e.g., "157 documents") instead of partial count
4. **Scroll Position**: Preserved when navigating away and returning
5. **Selection State**: Document selection works correctly in virtualized list

## Test Coverage

13 Playwright tests in `apps/web/tests/tb130-virtualized-documents.spec.ts`:

1. All Documents view uses virtualized list component
2. All Documents view does not have Load More button
3. All Documents view shows total count without "X of Y" format
4. All Documents search filter works instantly with virtualized list
5. Library view uses virtualized list component
6. Library view does not have Load More button
7. Library view shows total count without "X of Y" format
8. virtualized documents list supports smooth scrolling
9. selecting a document works in virtualized list
10. empty documents state shows correctly
11. library empty documents state shows correctly
12. virtualized list preserves scroll position via scrollRestoreId
13. virtualized list items are efficiently rendered with gap spacing

## Implementation Checklist

- [x] Web: Replace documents grid/list with VirtualizedList
- [x] Web: Remove any "Load more" buttons
- [x] Web: All documents rendered via virtualization (no display limit)
- [x] Web: Works in both list view modes (AllDocumentsView, LibraryView)
- [x] Web: Selection state preserved during scroll
- [x] Web: Search/filter works with virtualized list (instant, client-side)
- [x] **Verify:** 13 Playwright tests passing

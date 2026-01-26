# TB129: Virtualize Libraries List with Infinite Scroll

## Purpose

Improve performance of the library tree sidebar by using virtualization to render only visible items. This ensures smooth scrolling even with hundreds of libraries.

## Implementation

### Flattened Tree Structure

The library tree is stored hierarchically but rendered as a flat virtualized list. A helper function `flattenLibraryTree` converts the tree to a flat array based on which nodes are expanded:

```typescript
interface FlatLibraryItem {
  node: LibraryTreeNode;
  level: number;      // Indentation level
  hasChildren: boolean;
  isExpanded: boolean;
}

function flattenLibraryTree(
  nodes: LibraryTreeNode[],
  expandedIds: Set<string>,
  level = 0
): FlatLibraryItem[]
```

### Components

| Component | File | Purpose |
|-----------|------|---------|
| `FlatLibraryTreeItem` | `routes/documents.tsx` | Renders a single flattened library item with correct indentation |
| `LibraryTree` | `routes/documents.tsx` | Container that uses VirtualizedList to render flattened items |
| `VirtualizedList` | `components/shared/VirtualizedList.tsx` | Generic virtualization component using @tanstack/react-virtual |

### Key Features

1. **Virtualization**: Only visible items are rendered using @tanstack/react-virtual
2. **Flat Rendering**: Tree is flattened before rendering, re-flattened when expand/collapse changes
3. **Indentation**: Level-based padding (`8 + level * 16px`) maintains visual hierarchy
4. **Scroll Restoration**: `scrollRestoreId="library-tree-scroll"` enables scroll position persistence
5. **Fixed Item Height**: 36px per item for optimal virtualization performance

### Data Flow

```
libraries (API)
  → buildLibraryTree() → LibraryTreeNode[]
  → flattenLibraryTree(nodes, expandedIds) → FlatLibraryItem[]
  → VirtualizedList renders only visible FlatLibraryItems
```

## Files Modified

- `apps/web/src/routes/documents.tsx`: Added virtualization to LibraryTree component

## Tests

10 Playwright tests in `apps/web/tests/tb129-virtualized-libraries.spec.ts`:

1. Library tree uses virtualized list component
2. Creating libraries shows them in virtualized list
3. Expand/collapse preserves state in virtualized list
4. Selecting a library works in virtualized list
5. All Documents button is always visible outside virtualized area
6. Library count is displayed correctly
7. Nested libraries show correct indentation
8. Scroll position restoration infrastructure is in place
9. Empty library state shows when no libraries exist
10. Virtualized list uses efficient rendering

## Implementation Checklist

- [x] Replace current libraries list in sidebar with VirtualizedList
- [x] Flatten tree structure for virtualization while preserving expand/collapse state
- [x] All libraries rendered from in-memory (upfront loaded)
- [x] Smooth scroll experience with @tanstack/react-virtual
- [x] Preserve expand/collapse state during scroll
- [x] Scroll position restoration infrastructure
- [x] Write Playwright tests

# TB70: Deep-Link Navigation

## Overview

Deep-link navigation allows users to share direct URLs to specific elements (tasks, entities, teams, etc.) and have the application automatically navigate to and highlight that element.

## Features

### URL-Based Selection

All element pages support a `?selected=<id>` URL parameter:

- `/tasks?selected=el-task-xyz&page=1&limit=25`
- `/entities?selected=entity-abc&page=1&limit=25`
- `/teams?selected=team-123&page=1&limit=25`
- `/documents?selected=doc-456&page=1&limit=25`
- `/plans?selected=plan-789`
- `/workflows?selected=wf-101`

### Auto-Page Navigation

When navigating to a deep-link URL:
1. The system finds the element in the full dataset
2. Calculates which page the element appears on
3. Automatically navigates to that page
4. Opens the detail panel for the selected element

### Highlight Animation

When an element is deep-linked:
1. The row/card receives a 2-second yellow flash animation
2. The element is scrolled into view
3. A subtle border ring fades in and out

### Not Found Handling

If the linked element doesn't exist:
1. An `ElementNotFound` component is displayed
2. Shows the element type and ID that wasn't found
3. Provides a "Back to [List]" button to navigate away

## Implementation

### Core Files

- `apps/web/src/lib/deep-link.ts` - Utility functions
- `apps/web/src/hooks/useDeepLink.ts` - React hook
- `apps/web/src/components/shared/ElementNotFound.tsx` - Not-found component
- `apps/web/src/index.css` - Highlight animation styles

### Usage

```tsx
import { useDeepLink } from '../hooks/useDeepLink';
import { ElementNotFound } from '../components/shared/ElementNotFound';

function MyPage() {
  const search = useSearch({ from: '/my-route' });
  const { data: allItems } = useAllItems();

  const deepLink = useDeepLink({
    data: allItems,
    selectedId: search.selected,
    currentPage: 1,
    pageSize: 25,
    getId: (item) => item.id,
    routePath: '/my-route',
    rowTestIdPrefix: 'item-row-',
    autoNavigate: true,
    highlightDelay: 200,
  });

  return (
    <div>
      {selectedItemId && (
        deepLink.notFound ? (
          <ElementNotFound
            elementType="Item"
            elementId={selectedItemId}
            backRoute="/my-route"
            backLabel="Back to Items"
            onDismiss={handleClose}
          />
        ) : (
          <ItemDetailPanel itemId={selectedItemId} />
        )
      )}
    </div>
  );
}
```

### Hook Options

| Option | Type | Description |
|--------|------|-------------|
| `data` | `T[] \| undefined` | Full dataset (all items) |
| `selectedId` | `string \| undefined` | Target element ID from URL |
| `currentPage` | `number` | Current page number (1-based) |
| `pageSize` | `number` | Items per page |
| `getId` | `(item: T) => string` | Function to extract ID from item |
| `routePath` | `string` | Route path for navigation |
| `rowTestIdPrefix` | `string` | Test ID prefix for rows (for highlight) |
| `autoNavigate` | `boolean` | Auto-navigate to correct page (default: true) |
| `highlightDelay` | `number` | Delay before highlighting (ms, default: 100) |

### Hook Return Values

| Value | Type | Description |
|-------|------|-------------|
| `found` | `boolean` | Whether the element was found |
| `isNavigating` | `boolean` | Currently navigating to element |
| `notFound` | `boolean` | Element doesn't exist |
| `targetPage` | `number` | Page where element is located |
| `navigateToElement` | `(id: string) => void` | Manual navigation function |

## CSS Animation

The highlight animation is defined in `index.css`:

```css
@keyframes deep-link-flash {
  0% { background-color: rgba(250, 204, 21, 0); }
  20% { background-color: rgba(250, 204, 21, 0.4); }
  100% { background-color: rgba(250, 204, 21, 0); }
}

.deep-link-highlight {
  animation: deep-link-flash 2s ease-out;
}
```

## Test Coverage

Playwright tests in `tests/deep-link.spec.ts` cover:
- Deep-linking to existing elements (tasks, entities, teams, documents, plans, workflows)
- Not-found handling for non-existent elements
- URL updates when selecting/deselecting elements
- Back navigation from not-found state
- Highlight animation application

## Supported Pages

| Page | Route | Selection Param | Test ID Prefix |
|------|-------|-----------------|----------------|
| Tasks | `/tasks` | `selected` | `task-row-` |
| Entities | `/entities` | `selected` | `entity-card-` |
| Teams | `/teams` | `selected` | `team-card-` |
| Documents | `/documents` | `selected` | `document-item-` |
| Plans | `/plans` | `selected` | `plan-item-` |
| Workflows | `/workflows` | `selected` | `workflow-item-` |

# TB104: Clickable Member Names

**Status:** Implemented
**Last Updated:** 2026-01-26

## Purpose

Make entity references throughout the application clickable links that navigate to the entity detail page, with hover preview cards showing entity information at a glance.

## Scope

This feature applies to all entity references in the UI:
- Team member names in TeamDetailPanel
- Task assignee and owner in TaskDetailPanel
- Task creator (createdBy) in TaskDetailPanel
- Message sender in message list
- Channel member names in ChannelMembersPanel

## Components

### EntityLink Component

**Location:** `apps/web/src/components/entity/EntityLink.tsx`

A reusable component that renders entity references as clickable links with hover preview.

**Props:**
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| entityRef | string | required | Entity ID (el-xxx) or name |
| children | ReactNode | undefined | Display text (defaults to entity name) |
| className | string | '' | Additional CSS classes |
| showPreview | boolean | true | Whether to show hover preview card |
| showIcon | boolean | false | Whether to show entity type icon |
| data-testid | string | undefined | Test ID for Playwright |

**Behavior:**
- Clicking navigates to `/entities?selected={entityId}`
- If entityRef is an ID (starts with "el-"), fetches entity by ID
- If entityRef is a name, searches for entity by name
- Hover delay of 400ms before showing preview

### EntityPreviewCard

**Location:** Inside `apps/web/src/components/entity/EntityLink.tsx`

Hover preview card using Radix UI HoverCard component.

**Content:**
- Entity icon with type-specific color
- Entity name and type badge
- Stats grid: Open tasks, Completed tasks, Total tasks
- Current task (if in progress)
- Tags (first 3 with "+N more" indicator)
- "View full profile" link

## Dependencies

- `@radix-ui/react-hover-card` - For hover preview functionality
- `@tanstack/react-query` - For data fetching with caching
- `@tanstack/react-router` - For navigation

## Implementation Details

### Data Fetching

Entity data is fetched using TanStack Query with 30-second stale time for caching:

```typescript
function useEntityByRef(entityRef: string | null) {
  const isId = entityRef?.startsWith('el-');
  return useQuery<Entity | null>({
    queryKey: ['entities', 'byRef', entityRef],
    queryFn: async () => {
      if (isId) {
        // Fetch by ID
        const response = await fetch(`/api/entities/${entityRef}`);
        return response.json();
      } else {
        // Search by name
        const response = await fetch(`/api/entities?search=${encodeURIComponent(entityRef)}`);
        const result = await response.json();
        return result.items.find(e => e.name.toLowerCase() === entityRef.toLowerCase());
      }
    },
    enabled: !!entityRef,
    staleTime: 30000,
  });
}
```

### Styling

Entity types have distinct color schemes:
- **Agent:** Purple (`bg-purple-100`, `text-purple-700`)
- **Human:** Blue (`bg-blue-100`, `text-blue-700`)
- **System:** Gray (`bg-gray-100`, `text-gray-700`)

Links use blue color with hover underline: `text-blue-600 hover:text-blue-800 hover:underline`

## Files Modified

1. `apps/web/src/components/entity/EntityLink.tsx` - New component
2. `apps/web/src/routes/teams.tsx` - Updated TeamDetailPanel member names
3. `apps/web/src/components/task/TaskDetailPanel.tsx` - Updated assignee, owner, createdBy
4. `apps/web/src/routes/messages.tsx` - Updated message sender
5. `apps/web/src/components/message/ChannelMembersPanel.tsx` - Updated member names
6. `apps/web/package.json` - Added @radix-ui/react-hover-card dependency

## Implementation Checklist

- [x] Web: Create EntityLink component with hover preview - `apps/web/src/components/entity/EntityLink.tsx`
- [x] Web: Team member names in TeamDetailPanel are clickable links - `apps/web/src/routes/teams.tsx`
- [x] Web: Click → navigate to `/entities?selected=:id`
- [x] Web: Task assignee in TaskDetailPanel is clickable - `apps/web/src/components/task/TaskDetailPanel.tsx`
- [x] Web: Task owner in TaskDetailPanel is clickable - `apps/web/src/components/task/TaskDetailPanel.tsx`
- [x] Web: Task createdBy is clickable - `apps/web/src/components/task/TaskDetailPanel.tsx`
- [x] Web: Message sender is clickable - `apps/web/src/routes/messages.tsx`
- [x] Web: Channel member names are clickable - `apps/web/src/components/message/ChannelMembersPanel.tsx`
- [x] Web: Hover shows entity preview card (name, type, avatar, stats)
- [x] **Verify:** 6/7 Playwright tests passing (`apps/web/tests/tb104-clickable-member-names.spec.ts`)

## Testing

**Playwright Test File:** `apps/web/tests/tb104-clickable-member-names.spec.ts`

**Test Coverage:**
- Team member names are clickable links (passes)
- Team member names show hover preview (passes)
- Task assignee is clickable link (passes)
- Task assignee shows hover preview (passes)
- Task creator is clickable link (passes)
- Message sender is clickable link (skipped - needs test data)
- EntityLink navigates to entity detail (passes)

**Results:** 6 passed, 1 skipped

## Visual Design

```
┌──────────────────────────────────────┐
│ [🤖]  Claude Agent                    │
│       Agent                           │
│                                       │
│  ┌────────┐ ┌────────┐ ┌────────┐   │
│  │   5    │ │   12   │ │   17   │   │
│  │  Open  │ │  Done  │ │ Total  │   │
│  └────────┘ └────────┘ └────────┘   │
│                                       │
│  ┌─────────────────────────────────┐ │
│  │ 🕐 Currently working on         │ │
│  │    Fix authentication bug       │ │
│  └─────────────────────────────────┘ │
│                                       │
│  [backend] [api] [+2 more]           │
│                                       │
│  View full profile →                  │
└──────────────────────────────────────┘
```

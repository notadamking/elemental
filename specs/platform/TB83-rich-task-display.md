# TB83: Rich Task Display

## Overview

Enhance TaskCard components across the application to display rich, at-a-glance information including:
- Description preview with hover tooltip for full content
- Attachment count badge
- Dependency counts (blocks/blocked by)

This brings Linear-quality information density to task cards without overwhelming the UI.

## Implementation Details

### Server-Side Changes

#### Task Enrichment Helper
Added `enrichTasksWithCounts()` function in `apps/server/src/index.ts` that:
- Queries all dependencies in a single efficient SQL query
- Builds lookup maps for blocks, blocked-by, and attachment (references) counts
- Enriches tasks with `_attachmentCount`, `_blocksCount`, `_blockedByCount` fields

#### Endpoint Updates

1. **`GET /api/elements/all?includeTaskCounts=true`**
   - When `includeTaskCounts=true` query param is present, tasks include count fields
   - Used by the data preloader for upfront loading

2. **`GET /api/tasks/ready`**
   - Now includes task counts for rich display in dashboard ready tasks section

3. **`GET /api/tasks/blocked`**
   - Now includes task counts for rich display

### Frontend Changes

#### Task Type Updates
Updated Task interface in:
- `apps/web/src/api/hooks/useAllElements.ts`
- `apps/web/src/components/entity/types.ts`

New optional fields:
```typescript
interface Task {
  // ... existing fields
  _attachmentCount?: number;
  _blocksCount?: number;
  _blockedByCount?: number;
  description?: string;
}
```

#### useAllElements Hook
Updated `fetchAllElements()` to request `includeTaskCounts=true` from the API:
```typescript
const response = await fetch('/api/elements/all?includeTaskCounts=true');
```

#### TaskCard Component (`apps/web/src/components/entity/TaskCard.tsx`)

**New Props:**
- `showDescription?: boolean` (default: true) - Show description preview
- `showCounts?: boolean` (default: true) - Show attachment/dependency counts

**Features:**
1. **Description Preview**
   - Shows first 2 lines of description (max 150 chars)
   - Uses `line-clamp-2` for CSS-based truncation
   - If truncated, wraps in Radix Tooltip showing full description (up to 500 chars)
   - Uses 400ms delay before showing tooltip

2. **Attachment Count**
   - Shows Paperclip icon with count when `_attachmentCount > 0`
   - Styled in secondary text color

3. **Dependency Counts**
   - "Blocks N" shown in warning color (yellow/orange)
   - "Blocked by N" shown in error color (red)
   - Uses GitBranch icon for blocks, Link2 icon for blocked by
   - Title attributes provide full text on hover

4. **Counts Container**
   - Only rendered when at least one count > 0
   - Uses `data-testid="task-counts"` for testing

### Test Data IDs
- `task-card-{taskId}` - Main card container
- `task-description-preview` - Description paragraph
- `task-description-tooltip` - Full description tooltip content
- `task-counts` - Container for count indicators
- `task-attachment-count` - Attachment count badge
- `task-blocks-count` - "Blocks N" indicator
- `task-blocked-by-count` - "Blocked by N" indicator

## Testing

### Playwright Tests (`apps/web/tests/tb83-rich-task-display.spec.ts`)

**API Tests:**
- `elements/all endpoint includes task counts when includeTaskCounts=true`
- `elements/all endpoint does not include counts by default`
- `ready tasks endpoint includes counts for TB83`
- `blocked tasks endpoint includes counts for TB83`

**Dashboard TaskCard Tests:**
- `dashboard loads ready tasks section`
- `TaskCard renders with count data from ready endpoint`
- `TaskCard shows blocked by count`
- `TaskCard hides counts when no counts to display`

**Multiple Counts Tests:**
- `Task can have both blocks and blocked-by counts`
- `Task with multiple attachments shows correct count`
- `Task blocking multiple tasks shows correct count`

**Props Tests:**
- `TaskCard can disable counts display via showCounts prop`
- `TaskCard can disable description preview via showDescription prop`

Run tests:
```bash
cd apps/web && bun run test --grep "TB83"
```

## Dependencies

- `@radix-ui/react-tooltip` - For hover description tooltips
- `lucide-react` - For icons (Paperclip, Link2, GitBranch)

## Files Changed

- `apps/server/src/index.ts` - Added enrichTasksWithCounts helper and updated endpoints
- `apps/web/src/api/hooks/useAllElements.ts` - Updated fetch URL and Task type
- `apps/web/src/components/entity/types.ts` - Updated Task type
- `apps/web/src/components/entity/TaskCard.tsx` - Added rich display features
- `apps/web/tests/tb83-rich-task-display.spec.ts` - New test file
- `specs/platform/PLAN.md` - Marked TB83 complete

## Visual Design

The counts are displayed in a row below the task type badge:
```
┌─────────────────────────────────────┐
│ Task Title                  [High]  │
│ el-xxxx                             │
│ First line of description...        │
│ Second line truncated if...         │
│ [task] Assigned: John               │
│ 📎 2  🔀 Blocks 3  🔗 Blocked by 1 │
│ #tag1 #tag2 +1                      │
└─────────────────────────────────────┘
```

Colors:
- Attachment count: secondary text color
- Blocks count: warning color (indicates this task is blocking others)
- Blocked by count: error color (indicates this task is blocked)

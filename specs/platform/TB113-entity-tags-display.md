# TB113: Entity Tags Display

## Purpose

Display a "Mentioned In" section in EntityDetailPanel showing all documents and tasks that @mention this entity. This provides discoverability for where an entity is referenced across the system.

## Implementation

### Server Endpoint

**GET /api/entities/:id/mentions**

Returns all documents and tasks that contain an @mention of this entity.

**Response:**
```typescript
{
  entityId: string;
  entityName: string;
  mentions: Array<{
    id: string;
    title: string;
    updatedAt: string;
    type: 'document' | 'task';
    contentType?: string; // For documents
    status?: string;      // For tasks
  }>;
  documentCount: number;
  taskCount: number;
  totalCount: number;
}
```

**How Mentions are Found:**
- Documents: Searches the `content` field for `@{entityName}` pattern
- Tasks: Searches the `notes` field for `@{entityName}` pattern
- Results are sorted by `updatedAt` (most recent first)
- Limited to 50 items by default (configurable via `?limit=` query param)

### Frontend Components

**useEntityMentions Hook** (`apps/web/src/routes/entities.tsx`)
- Query hook that fetches mentions data for an entity
- Query key: `['entities', id, 'mentions']`

**Mentioned In Section** (EntityDetailPanel Overview Tab)
- Located after the Activity section, before Timestamps
- Shows AtSign icon with "Mentioned In" heading
- Count badge showing total mentions
- Empty state: "No documents or tasks mention this entity"
- Mention items show:
  - Type-specific icon (FileText for documents, ListTodo for tasks)
  - Color-coded background (blue for docs, green for tasks)
  - Title
  - Type label ("document" or "task")
  - Status badge for tasks
- Click navigates to the document or task
- "+N more mentions" text when more than 5 mentions exist

## Files Changed

- `apps/server/src/index.ts` - Added GET /api/entities/:id/mentions endpoint
- `apps/web/src/routes/entities.tsx` - Added useEntityMentions hook and Mentioned In UI section
- `apps/web/tests/tb113-entity-tags-display.spec.ts` - 10 Playwright tests

## Implementation Checklist

- [x] Server: Add `GET /api/entities/:id/mentions` endpoint
- [x] Server: Search documents for @mention pattern in content
- [x] Server: Search tasks for @mention pattern in notes
- [x] Server: Return combined results sorted by updatedAt
- [x] Web: Add `useEntityMentions` hook
- [x] Web: Add "Mentioned In" section to EntityDetailPanel
- [x] Web: Display count badge in section header
- [x] Web: Show list of mentioning documents/tasks
- [x] Web: Type-specific icons (document=FileText/blue, task=ListTodo/green)
- [x] Web: Click item navigates to document/task page
- [x] Web: Show status badge for task mentions
- [x] **Verify:** 9 Playwright tests passing (1 skipped due to race condition) (`apps/web/tests/tb113-entity-tags-display.spec.ts`)

## Related Specs

- [TB111: @Mention Parsing in Documents](./TB111-mention-autocomplete.md) - How @mentions are created
- [TB112: @Mention in Tasks](./TB112-mention-in-tasks.md) - @mention support in task notes

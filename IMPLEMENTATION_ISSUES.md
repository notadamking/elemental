# Implementation Issues

Tracked issues from the document system audit and broader codebase analysis.

---

## Implementation Bugs & Data Integrity

### HIGH

- [x] **Comments not cleaned up on document soft-delete** *(fixed)*
  - `packages/sdk/src/api/elemental-api.ts:1537-1547`
  - Added `DELETE FROM comments WHERE document_id = ?` to the delete transaction. Added tombstone guards on GET/POST comment routes in `packages/shared-routes/src/documents.ts`.

- [x] **FTS reindex omits `title` and `immutable` from reconstructed Document** *(fixed)*
  - `packages/sdk/src/api/elemental-api.ts:4458-4472`
  - Added `title` and `immutable` fields to the reconstructed Document in `reindexAllDocumentsFTS()`.

- [x] **`deserializeElement` has unguarded `JSON.parse`** *(fixed)*
  - `packages/sdk/src/api/elemental-api.ts:256`
  - Wrapped `JSON.parse` in try-catch, returning `null` on failure. Updated all 18 callers to handle `null` (skip corrupt rows in lists, return null in lookups, throw on critical paths).

### MEDIUM

- [x] **Version snapshots omit `status` and `immutable`**
  - `packages/sdk/src/api/elemental-api.ts:1324-1334`
  - The snapshot includes `title`/`category` but not `status` or `immutable`. Restoring a version of a previously-immutable document loses the immutable flag. Whether `status` exclusion is intentional is debatable, but `immutable` loss is a data integrity gap.

- [x] **FTS search route response missing `title`**
  - `packages/shared-routes/src/documents.ts:219-227`
  - The HTTP search results map includes `id`, `contentType`, `category`, `status`, `score`, `snippet`, `updatedAt` but not `title`. The CLI works because it calls `searchDocumentsFTS()` directly, but HTTP API consumers can't see document titles in search results.

- [x] **Invalid `libraryId` silently ignored on create/clone**
  - `packages/shared-routes/src/documents.ts:335-345, 664-672`
  - If the provided `libraryId` doesn't exist or isn't a library, no error is returned. The document is created but without the library association. The caller has no way to know.

- [x] **No content size validation on document PATCH updates**
  - `packages/shared-routes/src/documents.ts:358`
  - `validateContent()` (which enforces the 10MB `MAX_CONTENT_SIZE`) runs during `createDocument()` but not during `api.update()`. A PATCH with an oversized content payload is accepted.

- [x] **`getDocumentVersion` doesn't verify document type**
  - `packages/sdk/src/api/elemental-api.ts:3086-3089`
  - Called with a non-document ElementId, it could return data from the versions table without type-checking. The routes guard this, but the API method itself is unguarded.

- [x] **`getDocumentHistory` returns tombstoned documents**
  - `packages/sdk/src/api/elemental-api.ts:3116`
  - `this.get()` returns tombstoned elements, so history for deleted documents still returns results including the tombstoned current version.

---

## Missing Routes & Features

- [x] **No comment update/delete/resolve endpoints**
  - The schema has `resolved`, `resolved_by`, `resolved_at`, `deleted_at` columns, but there are no routes to update, delete, or resolve/unresolve comments.

- [x] **No CLI `delete` command for documents**
  - The HTTP `DELETE /api/documents/:id` route exists, but the CLI has no `doc delete` subcommand.

- [x] **Comment N+1 query problem**
  - `packages/shared-routes/src/documents.ts:883-924`
  - Each comment triggers individual `api.get()` calls for author and resolver. No batching.

- [x] **No comment pagination**
  - `GET /api/documents/:id/comments` returns all comments with no limit/offset.

- [x] **No route to remove document from library or move between libraries**
  - Library assignment happens only during create/clone via `libraryId`.

- [x] **Comments bypass ElementalAPI; no audit trail**
  - `packages/shared-routes/src/documents.ts:870-1032`
  - Comments are managed entirely through raw SQL in the routes file. No events are recorded for comment creation, no CLI commands exist, and the logic is not reusable by other consumers.

---

## Test Coverage Gaps

- [x] Zero tests for the comment system (routes, creation, retrieval)
- [x] Zero tests for document links (GET/POST/DELETE)
- [x] No route-level tests for clone or restore (only API-level and CLI-level)
- [x] No tests for immutable document rejection on PATCH route
- [x] No tests for CLI `doc search` or `doc reindex` commands

---

## Documentation: `docs/reference/core-types.md`

### Wrong field names

- [x] **Entity** (line 91): `managerId` → `reportsTo` (`entity.ts:71`)
- [x] **Entity** (line 95): `type EntityType` → `type EntityTypeValue` (`entity.ts:30`)
- [x] **Message** (line 116): `senderId` → `sender` (`message.ts:71`)
- [x] **Message** (line 117): `channelId` is required, not optional (`message.ts:67`)
- [x] **Message** (line 118): `threadId` is `MessageId | null`, not optional (`message.ts:81`)
- [x] **Task** (line 57): `type TaskType` → `type TaskTypeValue` (`task.ts:154`)
- [x] **Library** (line 307): `title` → `name` (`library.ts:56`)
- [x] **Team** (lines 320-328): `memberIds` → `members` (`team.ts:72-91`)
- [x] **Playbook** (line 344): `inherits?: string` → `extends?: string[]` (`playbook.ts:179`)
- [x] **Dependency** (line 206): `'reply-to'` → `'replies-to'` (`dependency.ts:87`)

### Missing fields

- [x] **Message**: missing `attachments: readonly DocumentId[]`
- [x] **Plan**: missing `completedAt?`, `cancelledAt?`, `cancelReason?`
- [x] **Workflow**: missing `descriptionRef?`, `playbookId?`, `variables`, `startedAt?`, `finishedAt?`, `failureReason?`, `cancelReason?`; `parentWorkflowId` doesn't exist; `ephemeral` is required not optional
- [x] **Channel**: `joinPolicy` missing `'request'` value
- [x] **Playbook**: missing `version`, `descriptionRef?`; `variables` is required not optional
- [x] **InboxItem**: missing `channelId: ChannelId`; `readAt` is `Timestamp | null` not optional
- [x] **InboxSourceType**: missing `'thread_reply'`
- [x] **Dependency types**: missing `supersedes`, `duplicates`, `caused-by`, `validates`, `authored-by`, `assigned-to`, `approved-by`
- [x] **Team**: missing `descriptionRef?: DocumentId`; `status` should be optional

### Sections needing full rewrite

- [x] **Event interface** (lines 380-398): `id` is `number` not `string`; field is `eventType` not `type`; `elementType` doesn't exist; field is `createdAt` not `timestamp`; has `oldValue`/`newValue` not `data`; EventType values are completely different (actual: `created`, `updated`, `closed`, `reopened`, `deleted`, `dependency_added`, `dependency_removed`, `tag_added`, `tag_removed`, `member_added`, `member_removed`, `auto_blocked`, `auto_unblocked`)
- [x] **ErrorCode** (lines 429-453): uses `enum` but actual is `const` object; code names differ (`INVALID_TRANSITION` → `INVALID_STATUS`, `STORAGE_ERROR` → `DATABASE_ERROR`, `CONSTRAINT_VIOLATION` doesn't exist); many codes missing
- [x] **Error classes** (lines 457-460): missing `NotFoundError`, `ConflictError`, `ConstraintError`
- [x] **Branded IDs** (lines 407-417): uses `__brand` pattern but actual uses `unique symbol` pattern
- [x] **Line 25**: `createElementId(content)` doesn't exist; actual function is `generateId()`

### Misleading descriptions

- [x] **Line 130**: says "Must have either channelId or threadId" — both are always present
- [x] **Line 70**: says blocked is "never set directly" — transition table allows manual setting
- [x] **Line 197**: `metadata?: DependencyMetadata` — actually `metadata: Record<string, unknown>` (required, different type)
- [x] **Lines 223-230**: gate metadata uses `gate` field — actual is `gateType`; `requiredCount` → `approvalCount`

---

## Documentation: Other Files

- [x] **`docs/reference/sdk-services.md:65`**: says `addDependency()` does NOT check cycles automatically — it does (`dependency.ts:158-159`)
- [x] **`docs/reference/sdk-services.md:62`**: says cycle detection only for `blocks`/`awaits` — also includes `parent-child`
- [x] **`docs/reference/orchestrator-runtime.md:360`**: references `mapEventToSDKMessage` — function doesn't exist (only `mapSDKMessageToEvent` exists)

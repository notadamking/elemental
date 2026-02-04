# Critical Gotchas

Common pitfalls and their solutions, organized by severity and category.

## Task Status

- **`blocked` status is computed** from dependencies, not set directly
- Use `api.update(taskId, { status: 'closed' })`, not direct SQL
- Closing a task auto-unblocks dependents via `BlockedCacheService`
- Status transitions are validated - not all transitions are allowed:
  - `CLOSED` → only `OPEN` (not to IN_PROGRESS, BLOCKED, or DEFERRED)
  - `DEFERRED` → only `OPEN` or `IN_PROGRESS`
  - `TOMBSTONE` is terminal (no transitions allowed)
- `api.ready()` excludes ephemeral tasks by default (use `includeEphemeral: true`)
- `closedAt` is cleared when reopening a closed task

## Dependencies

- Self-referential dependencies rejected with `CYCLE_DETECTED` error
- **Cycle detection NOT implemented in `api.addDependency()`** - API callers must check cycles via `DependencyService.detectCycle()` manually
- `relates-to` is bidirectional but stored normalized (smaller ID is always source)
  - **Gotcha**: Query both directions: `getDependencies(id, ['relates-to'])` + `getDependents(id, ['relates-to'])`
- Cycle detection depth limit: 100 levels (may pass with "no cycle" if cycle exists beyond limit)
- Only blocking types (`blocks`, `awaits`, `parent-child`) trigger blocked status
- `parent-child` blocking is NOT symmetric: child waits for parent, not vice versa
- **`blocks` direction is OPPOSITE to `parent-child`/`awaits`**: For `blocks`, target waits for source. For `parent-child`/`awaits`, source waits for target.
- **Tasks in a plan are NOT blocked by the plan's status** (plans are collections only)
- DependencyService does NOT emit events - caller must use helper functions

## Entity

- Names must be unique (case-sensitive)
- Reserved names: `system`, `anonymous`, `unknown` (case-insensitive check)
- Names must start with a letter: `agent123` valid, `123agent` invalid
- Name pattern: `/^[a-zA-Z][a-zA-Z0-9_-]*$/`
- Soft identity by default (no crypto verification needed)
- `createdBy` references an Entity ID

## Storage

- **SQLite is cache, JSONL is source of truth**
- **All backend methods are synchronous** (not async/Promise)
- Use `getDirtyElements()` - returns `{ elementId, markedAt }[]`, not Element objects
- Content hash excludes timestamps (for merge detection)
- Don't modify SQLite directly - use the API
- Deleting elements CASCADE deletes dependencies (FK constraint)
- `dirty_elements` table is auto-created in constructor, not via migrations

## Documents

- **`category` and `status` are required** on all Document objects (defaults: `category: 'other'`, `status: 'active'`)
- **Archived documents hidden by default** - `api.list()`, `api.listPaginated()`, and `api.searchDocumentsFTS()` return only active documents unless `status: 'archived'` is explicitly requested
- **System categories** (`task-description`, `message-content`) are managed automatically - do not set these manually
- **`designRef` has been removed** from Task and Plan interfaces - use `descriptionRef` instead
- Invalid category values produce `INVALID_CATEGORY` error; invalid status values produce `INVALID_DOCUMENT_STATUS` error
- **Imported documents are not FTS-indexed** - After `el import` or `api.import()`, documents exist in the database but are invisible to `searchDocumentsFTS()`. Run `el doc reindex` or call `api.reindexAllDocumentsFTS()` to rebuild the search index
- **`doc reindex` does not create versions** - Unlike `api.update()`, the reindex operation directly rebuilds the FTS index without incrementing document versions
- **FTS table may not exist** - If schema migrations have not been run (migration 7+), `searchDocumentsFTS()` throws `StorageError`. Run `initializeSchema()` to create the table

## Libraries

- **Library nesting uses `parent-child` dependencies** - Child libraries have `blockedId = child`, `blockerId = parent`
- **Circular nesting is prevented** - Cannot move a library to its own descendant (API returns `VALIDATION_ERROR`)
- **Moving documents to top-level requires confirmation** - Dropping a document on "All Documents" shows a confirmation dialog
- **Library re-parenting is atomic** - `PUT /api/libraries/:id/parent` removes old parent and adds new one in sequence

## Messages

- Messages are **immutable** after creation (`updatedAt === createdAt` always)
- Cannot edit or delete message content
- Must have either `channelId` or `threadId`
- Content is stored as `DocumentId` reference (`contentRef`), not inline

## Channels

- **Channel uses plain `description: string | null`, not `descriptionRef: DocumentId | null`** like Task, Plan, and Library. This means channel descriptions don't need hydration.

## Direct Channels

- Direct channel names are deterministic: `[entityA:entityB]` sorted alphabetically
- Creating A→B or B→A produces the same channel (find-or-create semantics)

## IDs

- IDs are hash-based (content-addressable)
- Short IDs supported for CLI (minimum unique prefix)
- ID length calculated from element count (cached for 60 seconds)
- **Branded Types**: `ElementId`, `DocumentId`, `MessageId`, etc. are distinct - using one where another is expected may cause runtime issues
- **Cast utilities**: Use `asEntityId(str)` and `asElementId(str)` from `@elemental/core` instead of `x as unknown as EntityId` double-casts. Only use at trust boundaries (DB rows, API responses).

## Workflows

- Ephemeral workflows NOT synced to JSONL
- Ephemeral workflows and their tasks need explicit cleanup via `garbageCollectWorkflows()`
- `getOrderedTasksInWorkflow()` silently skips cycles instead of throwing

## Playbooks

- Variable substitution uses `{{varName}}` syntax - pattern: `/\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g`
- Playbook inheritance requires separate resolution via `resolvePlaybookHierarchy()`
- YAML uses snake_case (`task_type`, `depends_on`) vs camelCase in code

## Services

- **`BlockedCacheService` not exported from `src/services/index.ts`** - import directly from `src/services/blocked-cache.ts`
- **`sortByEffectivePriority()` mutates array in place** - returns same reference
- **Effective priority walks upstream** (tasks that depend on this task)
- **Aggregate complexity walks downstream** (tasks this task depends on) - opposite directions!
- `BlockedCacheService.setStatusTransitionCallback()` required for auto-transitions
- Gate satisfaction (`recordApproval()`, `satisfyGate()`) is opt-in - no automatic triggering
- `IdLengthCache` refreshes automatically on access if stale

## Platform

- **WebSocket uses 500ms polling**, not instant push
- WebSocket events should invalidate TanStack Query cache
- Routes must be registered in `router.tsx`
- **CORS hardcoded for localhost:5173** - needs env vars for production
- **Server default port is 3456**, not 3000
- Dashboard routes are under `/dashboard/*` not root
- Bulk operations (`PATCH /api/tasks/bulk`) don't return updated entities - must refetch

## CLI

- `el dep add --type=blocks A B` means A is blocked BY B (B must complete first)
- Priority: 1=critical, 2=high, 3=medium, 4=low, 5=minimal
- Use `--json` flag for machine-readable output

## API

- `sendDirectMessage()` requires a `DocumentId` for `contentRef`, not raw text - create Document first
- `garbageCollectWorkflows()` uses `maxAgeMs` (milliseconds number), not string like `'7d'`
- Bulk plan operations use `closeReason`, `addTags`/`removeTags` - not `reason`, `add`/`remove`
- `api.search()` has **100 result hard limit** - searches title, content, and tags only
- `api.create()` requires `type` and `createdBy` in input object - no 2-param syntax
- `HydrationOptions` is `{ description?, content?, attachments? }` not just `true`
- **Auto status transitions:** `BlockedCacheService` auto-transitions tasks to/from `blocked` status, generating `auto_blocked`/`auto_unblocked` events with actor `'system:blocked-cache'`

## Sync

- Merge conflict: `closed` and `tombstone` statuses **always win** regardless of timestamp
- Tags are merged as union - you cannot remove a tag via sync, only add
- `force: true` on import bypasses merge logic entirely (remote always wins)

## Validation

- Tag validation includes duplicate detection and whitespace trimming
- Metadata has reserved key prefix `_el_` that cannot be used
- Metadata size limited to 64KB when serialized
- Document content size limited to 10MB (checked in UTF-8 bytes)

## Orchestrator

- Agent channels are created atomically during registration with format `agent-{agentId}`
- Each agent can only have one active session at a time
- Session history is limited to 20 entries per agent
- **Headless mode** uses `child_process.spawn()` with stream-json I/O
- **Interactive mode** uses PTY (node-pty) for terminal emulation
- `ELEMENTAL_ROOT` env var is set for worktree root-finding
- Built-in prompts are loaded from `packages/orchestrator-sdk/src/prompts/`
- Project-level prompt overrides go in `.elemental/prompts/`
- **Handoff notes are in the description Document**, not in metadata fields. `handoffTask()` appends `[AGENT HANDOFF NOTE]: {message}` to the task's `descriptionRef` Document. The `handoffHistory` array in metadata tracks handoff audit history.
- **Agent names must be unique** — `registerDirector`, `registerWorker`, `registerSteward` throw if an agent with the same name already exists
- **Tasks cannot be double-assigned** — `assignToAgent` throws if the task is already assigned to a different agent
- **`DispatchDaemonConfig.projectRoot`** enables project-level prompt overrides for triage sessions (defaults to `process.cwd()`)
- **`updateConfig()` restarts the poll interval** if `pollIntervalMs` changes — other config changes take effect immediately since they're checked inside `runPollCycle`

## Identity

- **Default mode is `soft`** (name-based, no verification)
- Ed25519 public keys are 44-character base64 strings
- Ed25519 signatures are 88-character base64 strings
- Signature format: `actor|signedAt|requestHash`
- Default time tolerance: 5 minutes
- `signedAt` must be ISO 8601 timestamp
- Request hash is SHA256 hex (64 characters)

## Configuration

- Config precedence: CLI > Environment > File > Defaults
- Environment variables use `ELEMENTAL_` prefix
- Config file is `.elemental/config.yaml`
- `ELEMENTAL_CONFIG_PATH` overrides config file location
- Duration strings supported: `5m`, `1h`, `7d`
- Config cache invalidated on `setValue()` or `unsetValue()`

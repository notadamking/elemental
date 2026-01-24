# Query API Specification

The Query API provides the primary programmatic interface to Elemental, enabling CRUD operations, queries, dependency management, and system administration. It abstracts storage details and provides type-safe operations.

## Purpose

The Query API provides:
- Type-safe element operations
- Flexible filtering and pagination
- Dependency management
- Search and hydration
- Event and history access

## API Structure

### Main Interface

The `ElementalAPI` interface is the primary entry point:

| Category | Methods |
|----------|---------|
| CRUD | get, list, create, update, delete |
| Tasks | ready, blocked |
| Dependencies | addDependency, removeDependency, getDependencies, getDependents, getDependencyTree |
| Search | search |
| History | getEvents, getDocumentVersion, getDocumentHistory |
| Sync | export, import |
| Stats | stats |

## Element CRUD

### get

Retrieve a single element by ID.

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | `ElementId` | Element identifier |
| `options` | `GetOptions` | Hydration options |

Returns: `Promise<T | null>`

Behavior:
- Returns null if not found
- Returns element typed as T
- Optionally hydrates references
- **Should include** `blockedBy` and `blockReason` for blocked tasks
  - **BUG el-pjjg**: Currently missing - only `blocked()` includes these fields

### list

Retrieve multiple elements matching filter.

| Parameter | Type | Description |
|-----------|------|-------------|
| `filter` | `ElementFilter` | Query constraints |

Returns: `Promise<T[]>`

Behavior:
- Returns empty array if no matches
- Applies all filter criteria
- Respects limit and offset
- Ordered by specified field

### create

Create a new element.

| Parameter | Type | Description |
|-----------|------|-------------|
| `input` | `ElementInput<T>` | Element data |

Returns: `Promise<T>`

Behavior:
- Generates ID if not provided
- Validates all required fields
- Sets timestamps
- Records creation event
- Returns complete element

### update

Update an existing element.

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | `ElementId` | Element identifier |
| `updates` | `Partial<T>` | Fields to update |

Returns: `Promise<T>`

Behavior:
- Validates element exists
- Validates update is allowed (Messages reject)
- Applies updates
- Updates timestamp
- Records update event
- Returns updated element

### delete

Soft-delete an element.

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | `ElementId` | Element identifier |
| `reason` | `string` | Optional deletion reason |

Returns: `Promise<void>`

Behavior:
- Validates element exists
- Validates delete is allowed (Messages reject)
- Sets tombstone status
- Records delete event

## Filter Types

### ElementFilter

Base filter for all element queries:

| Field | Type | Description |
|-------|------|-------------|
| `type` | `ElementType[]` | Filter by type(s) |
| `tags` | `string[]` | Must have ALL tags |
| `tagsAny` | `string[]` | Must have ANY tag |
| `createdBy` | `EntityId` | Filter by creator |
| `createdAfter` | `Timestamp` | Created after date |
| `createdBefore` | `Timestamp` | Created before date |
| `updatedAfter` | `Timestamp` | Updated after date |
| `updatedBefore` | `Timestamp` | Updated before date |
| `includeDeleted` | `boolean` | Include tombstones |
| `limit` | `number` | Maximum results |
| `offset` | `number` | Skip N results |
| `orderBy` | `string` | Sort field |
| `orderDir` | `asc\|desc` | Sort direction |

### TaskFilter

Extended filter for tasks:

| Field | Type | Description |
|-------|------|-------------|
| `status` | `TaskStatus[]` | Filter by status(es) |
| `priority` | `Priority[]` | Filter by priority |
| `complexity` | `Complexity[]` | Filter by complexity |
| `assignee` | `EntityId` | Filter by assignee |
| `owner` | `EntityId` | Filter by owner |
| `taskType` | `string[]` | Filter by task type |
| `hasDeadline` | `boolean` | Has deadline set |
| `deadlineBefore` | `Timestamp` | Deadline before date |
| `includeEphemeral` | `boolean` | Include ephemeral |

## Task Queries

### ready

Get tasks ready for work.

| Parameter | Type | Description |
|-----------|------|-------------|
| `filter` | `TaskFilter` | Optional constraints |

Returns: `Promise<Task[]>`

Criteria for ready:
- Status is `open` or `in_progress`
- Not blocked by any dependency
- scheduledFor is null or past
- Not ephemeral (unless requested)

### blocked

Get blocked tasks with reasons.

| Parameter | Type | Description |
|-----------|------|-------------|
| `filter` | `TaskFilter` | Optional constraints |

Returns: `Promise<BlockedTask[]>`

BlockedTask includes:
- All Task fields
- `blockedBy`: Blocking element ID
- `blockReason`: Human-readable reason

## Dependency Operations

### addDependency

Create a new dependency.

| Parameter | Type | Description |
|-----------|------|-------------|
| `dep` | `DependencyInput` | Dependency data |

Returns: `Promise<Dependency>`

Behavior:
- Validates source element exists
- Validates dependency type
- Checks for cycles (blocking types)
- Creates dependency
- Updates blocked cache
- Records event

### removeDependency

Delete a dependency.

| Parameter | Type | Description |
|-----------|------|-------------|
| `sourceId` | `ElementId` | Source element |
| `targetId` | `ElementId` | Target element |
| `type` | `DependencyType` | Dependency type |

Returns: `Promise<void>`

### getDependencies

Get dependencies of an element.

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | `ElementId` | Element ID |
| `types` | `DependencyType[]` | Filter by type |

Returns: `Promise<Dependency[]>`

### getDependents

Get elements depending on this element.

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | `ElementId` | Element ID |
| `types` | `DependencyType[]` | Filter by type |

Returns: `Promise<Dependency[]>`

### getDependencyTree

Get full dependency graph.

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | `ElementId` | Root element |

Returns: `Promise<DependencyTree>`

DependencyTree structure:
- `element`: The element
- `dependencies`: Child trees (outgoing)
- `dependents`: Parent trees (incoming)

## Search

### search

Full-text search across elements.

| Parameter | Type | Description |
|-----------|------|-------------|
| `query` | `string` | Search text |
| `filter` | `ElementFilter` | Additional filters |

Returns: `Promise<Element[]>`

Searches:
- Element titles
- Element content (via Documents)
- Tags

## Hydration

### GetOptions

Options for get operations:

| Field | Type | Description |
|-------|------|-------------|
| `hydrate` | `HydrationOptions` | References to resolve |

### HydrationOptions

| Field | Type | Description |
|-------|------|-------------|
| `description` | `boolean` | Hydrate descriptionRef |
| `design` | `boolean` | Hydrate designRef |
| `content` | `boolean` | Hydrate contentRef |
| `attachments` | `boolean` | Hydrate attachments |

### Hydration Process

1. Fetch element
2. Collect reference IDs to hydrate
3. Batch fetch Documents
4. Populate hydrated fields
5. Return combined result

## History

### getEvents

Get audit events for element.

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | `ElementId` | Element ID |
| `filter` | `EventFilter` | Optional constraints |

Returns: `Promise<Event[]>`

### getDocumentVersion

Get specific Document version.

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | `DocumentId` | Document ID |
| `version` | `number` | Version number |

Returns: `Promise<Document | null>`

### getDocumentHistory

Get all versions of Document.

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | `DocumentId` | Document ID |

Returns: `Promise<Document[]>`

Returns newest first.

## Sync

### export

Export elements to JSONL.

| Parameter | Type | Description |
|-----------|------|-------------|
| `options` | `ExportOptions` | Export configuration |

### import

Import elements from JSONL.

| Parameter | Type | Description |
|-----------|------|-------------|
| `options` | `ImportOptions` | Import configuration |

Returns: `Promise<ImportResult>`

ImportResult includes:
- Elements imported count
- Dependencies imported count
- Conflicts encountered
- Errors if any

## Stats

### stats

Get system statistics.

Returns: `Promise<SystemStats>`

SystemStats includes:
- Total element count
- Count by type
- Total dependencies
- Total events
- Ready tasks count
- Blocked tasks count

## Implementation Methodology

### API Construction

Create API instance with storage backend:
1. Accept storage backend in constructor
2. Initialize caches
3. Return API interface

### Transaction Handling

Operations use transactions:
- Single mutations: Auto-wrapped
- Batch operations: Explicit transaction
- Reads: Optional consistency

### Error Handling

Convert storage errors to API errors:
- NOT_FOUND for missing elements
- INVALID_INPUT for validation failures
- CYCLE_DETECTED for dependency cycles
- IMMUTABLE for message modifications

### Caching

Optional caching for:
- Blocked cache (essential)
- Element count (for ID generation)
- Frequent queries (configurable)

## Implementation Checklist

### Phase 1: Interface Definition ✅
- [x] Define ElementalAPI interface (src/api/types.ts)
- [x] Define all parameter types (ElementFilter, TaskFilter, GetOptions, DependencyInput, ExportOptions, ImportOptions)
- [x] Define all return types (BlockedTask, DependencyTree, DependencyTreeNode, ListResult, ImportResult, SystemStats)
- [x] Define filter interfaces (ElementFilter, TaskFilter with pagination and sorting)
- [x] Define type guards and validation helpers (isSortDirection, isConflictStrategy, isValidElementFilter, etc.)
- [x] Unit tests for Phase 1 (110 tests in src/api/types.test.ts)

### Phase 2: CRUD Operations ✅
- [x] Implement get with hydration (src/api/elemental-api.ts)
- [x] Implement list with filtering (src/api/elemental-api.ts)
- [x] Implement create with validation (src/api/elemental-api.ts)
- [x] Implement update with restrictions (src/api/elemental-api.ts)
- [x] Implement delete (soft) (src/api/elemental-api.ts)

### Phase 3: Task Operations ✅
- [x] Implement ready query (src/api/elemental-api.ts)
- [x] Implement blocked query (src/api/elemental-api.ts)
- [x] Integrate with blocked cache (src/api/elemental-api.ts)

### Phase 4: Dependency Operations ✅
- [x] Implement addDependency (src/api/elemental-api.ts)
- [x] Implement removeDependency (src/api/elemental-api.ts)
- [x] Implement getDependencies (src/api/elemental-api.ts)
- [x] Implement getDependents (src/api/elemental-api.ts)
- [x] Implement getDependencyTree (src/api/elemental-api.ts)

### Phase 5: Search and Hydration ✅
- [x] Implement search (src/api/elemental-api.ts)
- [x] Implement hydration (src/api/elemental-api.ts)
- [x] Optimize batch fetching (batchFetchTags helper eliminates N+1 queries for list operations and hydration)

### Phase 6: History Operations ✅
- [x] Implement getEvents (src/api/elemental-api.ts)
- [x] Implement getDocumentVersion (src/api/elemental-api.ts)
- [x] Implement getDocumentHistory (src/api/elemental-api.ts)

### Phase 7: Sync and Stats ✅
- [x] Implement export (via SyncService, src/api/elemental-api.ts)
- [x] Implement import (via SyncService with element/dependency separation, merge strategy, dry-run support)
- [x] Implement stats (src/api/elemental-api.ts)

### Phase 8: Testing ✅
- [x] Unit tests for interface definitions (110 tests)
- [x] Unit tests for each operation (70 tests in src/api/elemental-api.test.ts including export/import)
- [x] Integration tests for workflows (included in elemental-api.test.ts)
- [x] Performance tests for queries (33 tests in src/api/query-performance.test.ts)

# Dependency System Specification

The dependency system manages relationships between elements, enabling blocking relationships, knowledge graphs, attribution tracking, and message threading. It is fundamental to task orchestration and element interconnection.

## Purpose

The dependency system provides:
- Blocking relationships for task orchestration
- Associative links for knowledge graphs
- Attribution tracking for audit trails
- Message threading support
- Cycle detection for integrity
- Blocked work calculation optimization

## Dependency Structure

Each dependency connects a source element to a target element:

| Field | Type | Description |
|-------|------|-------------|
| `sourceId` | `ElementId` | Element that has the dependency |
| `targetId` | `ElementId` | Element being depended on |
| `type` | `DependencyType` | Category of relationship |
| `createdAt` | `Timestamp` | When dependency was created |
| `createdBy` | `EntityId` | Who created the dependency |
| `metadata` | `object` | Type-specific additional data |

## Dependency Types

### Blocking Dependencies

Affect work readiness; tasks cannot proceed until blockers resolve.

| Type | Semantics | Target Requirement |
|------|-----------|-------------------|
| `blocks` | Target waits for source to close | Source must close |
| `parent-child` | Hierarchical containment | Transitive blocking |
| `awaits` | External gate dependency | Gate must be satisfied |

### Associative Dependencies

Non-blocking; create knowledge graph connections.

| Type | Semantics | Bidirectional |
|------|-----------|---------------|
| `relates-to` | Semantic link | Yes |
| `references` | Citation | No |
| `supersedes` | Version chain | No |
| `duplicates` | Deduplication | No |
| `caused-by` | Audit trail | No |
| `validates` | Test verification | No |

### Attribution Dependencies

Link elements to entities for tracking.

| Type | Semantics | Target Type |
|------|-----------|-------------|
| `authored-by` | Creator | Entity |
| `assigned-to` | Responsibility | Entity |
| `approved-by` | Sign-off | Entity |

### Threading Dependencies

Support message conversations.

| Type | Semantics | Target Type |
|------|-----------|-------------|
| `replies-to` | Thread parent | Message |

## Blocking Semantics

### Blocked State

An element is blocked if any of:
- Has `blocks` dependency on non-closed element
- Has `parent-child` dependency on blocked parent
- Has `awaits` dependency on unsatisfied gate

### Ready State

A task is ready for work when:
- Status is `open` or `in_progress`
- Not blocked by any dependency
- `scheduledFor` is null or past
- Not in ephemeral workflow (unless requested)

### Transitive Blocking

`parent-child` creates transitive blocking:
- If Plan A is blocked, all child Tasks are blocked
- Blocking propagates down the hierarchy
- Unblocking propagates up (when all children complete)

## Gate Dependencies

`awaits` dependencies support external gates:

### Gate Types

| Gate Type | Satisfied When |
|-----------|----------------|
| `timer` | Current time >= `waitUntil` |
| `approval` | Required approvals received |
| `external` | External system confirms |
| `webhook` | Webhook callback received |

### Awaits Metadata

| Field | Type | Gate Types | Description |
|-------|------|------------|-------------|
| `gateType` | `string` | All | Type of gate |
| `waitUntil` | `Timestamp` | timer | When gate opens |
| `externalSystem` | `string` | external | System identifier |
| `externalId` | `string` | external | External reference |
| `requiredApprovers` | `EntityId[]` | approval | Who must approve |
| `approvalCount` | `number` | approval | How many needed |
| `currentApprovers` | `EntityId[]` | approval | Who has approved |
| `satisfied` | `boolean` | external, webhook | Whether gate is satisfied |
| `satisfiedAt` | `Timestamp` | external, webhook | When gate was satisfied |
| `satisfiedBy` | `EntityId` | external, webhook | Who satisfied the gate |

## Validates Metadata

`validates` dependencies track test verification:

| Field | Type | Description |
|-------|------|-------------|
| `testType` | `string` | e.g., "unit", "integration", "manual" |
| `result` | `string` | "pass" or "fail" |
| `details` | `string` | Test output or notes |

## Cycle Detection

Before adding blocking dependencies, verify no cycle would result.

### Self-Referential Check

First, reject self-referential dependencies:
- If `sourceId === targetId`, reject with `CYCLE_DETECTED`
- Message: "Cannot create self-referential dependency"
- This is the simplest form of cycle (length 1)

### Algorithm

1. Reject if source equals target (self-referential)
2. Check if dependency type is blocking
3. If not blocking, allow (no cycle possible in acyclic graph)
4. Start from target, traverse all blocking dependencies
5. If source is reachable, cycle would be created
6. Reject with `CYCLE_DETECTED` error

### Traversal

Breadth-first search with visited set:
- Start queue with target
- Pop element, check if equals source
- Add all blocking dependency targets to queue
- Continue until queue empty or source found
- Depth limit: 100 (configurable)

### Exclusions

`relates-to` is excluded from cycle detection:
- Bidirectional by design
- Would always "cycle" (A relates-to B implies B relates-to A)
- Stored as single dependency, interpreted bidirectionally

## Blocked Cache

Materialized view for fast ready-work queries.

### Structure

| Column | Type | Description |
|--------|------|-------------|
| `element_id` | `ElementId` | Blocked element |
| `blocked_by` | `ElementId` | Blocking element |
| `reason` | `string` | Human-readable reason |

### Invalidation Triggers

Cache invalidated when:
- Blocking dependency added/removed
- Element status changes (especially closing)
- Gate satisfaction changes
- Parent blocking state changes

### Rebuild Algorithm

1. Clear cache
2. For each element with potential blockers:
   a. Check all `blocks` dependencies
   b. Check all `parent-child` parents recursively
   c. Check all `awaits` gates
3. If blocked, insert into cache with reason
4. Propagate through `parent-child` children

### Performance

Cache provides ~25x speedup on large datasets:
- Ready query: Single table scan of non-blocked
- Without cache: Recursive dependency check per element

## Dependency Storage

### Schema

Dependencies stored in `dependencies` table:
- Composite primary key: (source_id, target_id, type)
- Allows multiple dependency types between same elements
- Indexed on target_id for reverse lookups

### Constraints

- source_id must reference valid element
- target_id: No foreign key (allows external references)
- type must be valid DependencyType
- No self-references (source_id != target_id)

### Implementation Status

> **Note:** Cycle detection including self-referential checks are specified but not yet enforced.
> See el-5w9d (cycle detection) and el-4pyu (self-referential dependency).
>
> **Workaround:** If a self-referential dependency is accidentally created, it can be removed
> with `el dep remove <task-id> <task-id> --type blocks` to recover the task to "open" status.

## Operations

### Add Dependency

1. Validate source element exists
2. Validate dependency type
3. Check for cycles (if blocking type)
4. Insert dependency record
5. Update blocked cache (if blocking type)
6. Emit `dependency_added` event

### Remove Dependency

1. Validate dependency exists
2. Delete dependency record
3. Update blocked cache (if blocking type)
4. Emit `dependency_removed` event

### Delete Element (Cascade Cleanup)

When an element is deleted (tombstoned), dependencies should be cleaned up:

1. Find all dependencies where element is source
2. Find all dependencies where element is target
3. Remove all found dependencies
4. Update blocked cache for affected elements
5. Emit `dependency_removed` events

> **Implementation Status:** Cascade cleanup is NOT currently implemented.
> See el-nyh7 (task delete orphans), el-4egr (plan delete orphans), el-wjo9 (channel delete orphans).
> Orphan dependencies remain in database pointing to tombstoned elements.
> The blocked cache IS correctly updated (tasks become unblocked), but dependency records persist.

### Get Dependencies

Query all dependencies where element is source.

### Get Dependents

Query all dependencies where element is target.

### Get Dependency Tree

Recursive traversal building full tree:
- Element at root
- Dependencies as children
- Dependents as separate branch
- Cycle handling for `relates-to`
- **Depth limit**: Configurable via `--depth` option (default: 5 for CLI, 100 for API)
  - **BUG el-5z7k**: CLI `--depth` option ignored, API uses hardcoded 10 in `elemental-api.ts:2186`

## Implementation Methodology

### Bidirectional relates-to

Store as single record:
- Smaller source_id is always source
- Query both directions by checking both columns
- Application layer handles interpretation

### Blocking Check

Function `isBlocked(elementId)`:
1. Check blocked_cache first (fast path)
2. If not in cache, compute and cache
3. Return blocked status and reason

### Ready Work Query

1. Query tasks with status in (open, in_progress)
2. Left join with blocked_cache
3. Filter where blocked_cache.element_id is null
4. Filter where scheduledFor is null or <= now
5. Order by priority, createdAt

## Implementation Checklist

### Phase 1: Type Definitions ✅
- [x] Define `Dependency` interface
- [x] Define `DependencyType` union (blocking, associative, attribution, threading)
- [x] Define `AwaitsMetadata` interface (timer, approval, external, webhook gates)
- [x] Define `ValidatesMetadata` interface
- [x] Create type guards (isValidDependencyType, isDependency, isValidAwaitsMetadata, etc.)
- [x] Create validators (validateDependency, validateAwaitsMetadata, etc.)
- [x] Create factory functions (createDependency, createAwaitsDependency, createValidatesDependency)
- [x] Create utility functions (isBlockingDependency, filterByType, describeDependency, etc.)
- [x] Unit tests (175 tests)

### Phase 2: Core Operations ✅
- [x] Implement addDependency (DependencyService.addDependency)
- [x] Implement removeDependency (DependencyService.removeDependency)
- [x] Implement getDependencies (DependencyService.getDependencies, getRelatedTo, getDependenciesForMany)
- [x] Implement getDependents (DependencyService.getDependents)
- [x] Add dependency events (createDependencyAddedEvent, createDependencyRemovedEvent)
- [x] Additional utilities: exists, getDependency, countDependencies, countDependents
- [x] Bulk operations: removeAllDependencies, removeAllDependents
- [x] Unit tests (67 tests)

### Phase 3: Cycle Detection ⚠️ (Partial)
- [x] Implement BFS traversal (detectCycle method using breadth-first search)
- [x] Implement depth limiting (configurable maxDepth, default 100)
- [x] Handle relates-to exclusion (non-blocking types skip cycle detection)
- [ ] **BUG el-5w9d**: Add cycle detection to addDependency (ElementalApi.addDependency has TODO at line 1995 but never calls DependencyService.checkForCycle)
- [x] Unit tests (33 tests covering all cycle detection scenarios in DependencyService)

### Phase 4: Blocked Cache ✅
- [x] Create blocked_cache table (in src/storage/schema.ts migration 001)
- [x] Implement cache invalidation triggers (BlockedCacheService.onDependencyAdded/Removed, onStatusChanged, onElementDeleted)
- [x] Implement cache rebuild (BlockedCacheService.rebuild with topological ordering)
- [x] Integrate with ready work query (ElementalAPIImpl uses blocked_cache for ready/blocked queries)
- [x] Add automatic status transitions (migration 003 adds previous_status column, StatusTransitionCallback triggers auto_blocked/auto_unblocked events - 20 tests)
- [x] Integration tests (60 tests in blocked-cache.test.ts, 20 tests in auto-blocked-status.test.ts)

### Phase 5: Gate Dependencies ✅
- [x] Implement timer gate checking (BlockedCacheService.isGateSatisfied with GateType.TIMER)
- [x] Implement approval gate checking (BlockedCacheService.isGateSatisfied with GateType.APPROVAL)
- [x] Implement external gate interface (BlockedCacheService.isGateSatisfied with GateType.EXTERNAL/WEBHOOK - always blocks until satisfied via API)
- [x] Add gate satisfaction API (BlockedCacheService.satisfyGate, recordApproval, removeApproval - updates dependency metadata and recomputes blocking state - 23 tests)

### Phase 6: Queries ✅
- [x] Implement ready work query (ElementalAPI.ready() - filters open/in_progress tasks, excludes blocked and future-scheduled)
- [x] Implement blocked work query (ElementalAPI.blocked() - returns BlockedTask with blockedBy and blockReason)
- [x] Implement dependency tree (ElementalAPI.getDependencyTree() - recursive traversal with depth limiting)
- [x] Add filtering options (TaskFilter support for priority, assignee, owner, taskType, deadline)

### Phase 7: CLI Commands ✅
- [x] dep add (src/cli/commands/dep.ts - depAddCommand)
- [x] dep remove (src/cli/commands/dep.ts - depRemoveCommand)
- [x] dep list (src/cli/commands/dep.ts - depListCommand with direction filtering)
- [x] dep tree (src/cli/commands/dep.ts - depTreeCommand with depth option)

### Phase 8: Testing ✅
- [x] Unit tests for cycle detection (33 tests in dependency.test.ts)
- [x] Unit tests for blocked calculation (blocked-cache.test.ts - computeBlockingState tests)
- [x] Unit tests for cache invalidation (blocked-cache.test.ts - invalidation tests)
- [x] Integration tests for ready work (blocked-cache.test.ts - rebuild tests, API integration)
- [x] Integration tests for ready/blocked queries (31 tests in ready-blocked.integration.test.ts)
- [x] Performance tests for large graphs (22 tests in dependency.perf.test.ts - cycle detection, cache rebuild, query benchmarks)

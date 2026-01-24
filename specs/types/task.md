# Task Type Specification

Tasks represent units of work to be tracked and completed within Elemental. They are the primary work-tracking primitive, supporting rich metadata, scheduling, assignment, and lifecycle management.

## Purpose

Tasks provide:
- Work item tracking with status lifecycle
- Priority and complexity scoring for work planning
- Assignment to entities for ownership tracking
- Scheduling with deadlines and defer dates
- Integration with external systems
- Soft deletion with tombstone pattern

## Properties

### Content

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `title` | `string` | Yes | Task title, 1-500 characters |
| `descriptionRef` | `DocumentId` | No | Reference to description Document |
| `designRef` | `DocumentId` | No | Reference to technical design Document |
| `acceptanceCriteria` | `string` | No | Definition of done criteria |
| `notes` | `string` | No | Scratchpad for additional context |

### Workflow

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `status` | `TaskStatus` | Yes | Current lifecycle state |
| `priority` | `Priority` | Yes | 1-5 scale, 1 is highest |
| `complexity` | `Complexity` | Yes | 1-5 scale, 1 is simplest |
| `taskType` | `string` | Yes | Classification (bug, feature, task, chore) |
| `closeReason` | `string` | No | Explanation when closed |

### Assignment

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `assignee` | `EntityId` | No | Entity currently working on task |
| `owner` | `EntityId` | No | Entity responsible for task completion |

### Scheduling

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `deadline` | `Timestamp` | No | External deadline constraint |
| `scheduledFor` | `Timestamp` | No | When task becomes actionable |
| `closedAt` | `Timestamp` | No | When task was closed |

### Soft Delete

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `deletedAt` | `Timestamp` | No | When task was soft-deleted |
| `deletedBy` | `EntityId` | No | Entity that deleted the task |
| `deleteReason` | `string` | No | Explanation for deletion |

### External Integration

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `externalRef` | `string` | No | URL or ID in external system |

## Status Lifecycle

### States

| Status | Description | Ready for Work |
|--------|-------------|----------------|
| `open` | Available for work | Yes |
| `in_progress` | Currently being worked | Yes |
| `blocked` | Waiting on dependency | No |
| `deferred` | Deliberately postponed | No |
| `closed` | Completed | No |
| `tombstone` | Soft-deleted | No |

### Valid Transitions

- `open` → `in_progress`, `blocked`, `deferred`, `closed`
- `in_progress` → `open`, `blocked`, `deferred`, `closed`
- `blocked` → `open`, `in_progress`, `deferred`, `closed`
- `deferred` → `open`, `in_progress`
- `closed` → `open` (reopen)
- `tombstone` → (terminal, no transitions)

### Automatic Transitions

- Task becomes `blocked` when blocking dependency added
- Task becomes unblocked when all blockers resolve
- `blocked` status is computed, not directly set by users

## Priority Scale

| Value | Meaning | Guidelines |
|-------|---------|------------|
| 1 | Critical | Production issues, security vulnerabilities |
| 2 | High | Important features, significant bugs |
| 3 | Medium | Standard work items (default) |
| 4 | Low | Nice-to-have improvements |
| 5 | Minimal | Can be done when time permits |

## Complexity Scale

| Value | Meaning | Guidelines |
|-------|---------|------------|
| 1 | Trivial | Single-line changes, typo fixes |
| 2 | Simple | Small, well-defined changes |
| 3 | Medium | Moderate changes, some research needed |
| 4 | Complex | Significant changes, multiple components |
| 5 | Very Complex | Large scope, architectural changes |

## Dependency-Based Priority

Tasks inherit priority from their dependents. If a high-priority task depends on a low-priority task, the low-priority task's **effective priority** is boosted to match.

### Effective Priority Calculation

The effective priority is the minimum (highest urgency) of:
- The task's own/base priority
- The priorities of all tasks that directly or transitively depend on it

This ensures that blockers for critical work are surfaced appropriately.

### Example

```
Task A (P3/Medium) <- Task B (P1/Critical)
```

Task A has base priority P3, but Task B (P1) depends on it. Task A's effective priority becomes P1, ensuring it's worked on before unrelated P2 tasks.

### Aggregate Complexity

A task's **aggregate complexity** represents total effort including its blockers:
- Sum of the task's own complexity plus all blocking tasks' complexities
- Useful for estimating total work remaining

## Task Types

Built-in types (extensible):
- `bug` - Defect requiring fix
- `feature` - New functionality
- `task` - General work item
- `chore` - Maintenance, cleanup, technical debt

Custom types can be defined via configuration.

## Hydration

Tasks support hydration of Document references:

| Reference | Hydrated Field |
|-----------|----------------|
| `descriptionRef` | `description` |
| `designRef` | `design` |

Hydration is opt-in per query to avoid unnecessary fetches.

## Ready Work Calculation

A task is "ready" (available for work) when:
1. Status is `open` or `in_progress`
2. Not blocked by any dependency
3. `scheduledFor` is null or in the past
4. Not in an ephemeral workflow (unless explicitly requested)

## Assignment vs Ownership

- **Assignee**: Who is actively working on the task
- **Owner**: Who is accountable for completion (for escalation, metrics)

A task can have an owner but no assignee (unassigned but accountable).

## Scheduling Semantics

- **deadline**: External constraint, typically set by humans. Represents when work MUST be complete.
- **scheduledFor**: When task becomes visible/actionable. Task is hidden from ready queries until this time.

Neither field implies when work will actually complete (agents should not estimate completion times).

## Tombstone Behavior

When soft-deleted:
1. Status changes to `tombstone`
2. `deletedAt`, `deletedBy` populated
3. Task excluded from normal queries
4. Task still blocks dependents (prevents orphaned work)
5. After TTL (default 30 days), may be permanently removed

## Implementation Methodology

### Storage

Tasks are stored in the `elements` table with:
- `type = 'task'`
- Type-specific fields in JSON `data` column
- Indexed fields: status, priority, assignee, owner, deadline

### Blocked Cache Integration

When task status or dependencies change:
1. Recompute blocked state for task
2. Update `blocked_cache` table
3. Propagate changes to dependent tasks

### Document Reference Resolution

Hydration fetches referenced Documents:
1. Collect all `*Ref` fields to hydrate
2. Batch fetch Documents by ID
3. Populate corresponding hydrated fields
4. Return combined result

### Hierarchical IDs

Tasks under Plans use hierarchical IDs:
- Plan: `el-abc`
- Task: `el-abc.1`, `el-abc.2`
- Subtask: `el-abc.1.1`

## Implementation Checklist

### Phase 1: Type Definitions ✅
- [x] Define `Task` interface extending `Element`
- [x] Define `HydratedTask` interface
- [x] Define `TaskStatus` union type
- [x] Define `Priority` and `Complexity` types
- [x] Define `TaskTypeValue` (bug, feature, task, chore)
- [x] Create type guards for Task validation (`isTask`, `validateTask`)
- [x] Create factory function (`createTask`)
- [x] Implement status transition validation (`isValidStatusTransition`, `validateStatusTransition`)
- [x] Implement `updateTaskStatus` function
- [x] Implement `softDeleteTask` function (tombstone transition)
- [x] Create utility functions (`isReadyForWork`, `isBlocked`, `isClosed`, etc.)
- [x] Unit tests for all Phase 1 functionality (135 tests)

### Phase 2: Lifecycle Management
- [x] Implement status transition validation
- [x] Implement automatic blocked status computation ✅ (BlockedCacheService triggers auto_blocked/auto_unblocked events, stores previous_status for restoration, integrates with ElementalAPI via callback - 20 tests)
- [x] Implement tombstone transition logic
- [x] Create status change event emission ✅ (emits 'closed' event when status changes to closed, 'reopened' event when status changes from closed, 'updated' for other changes - 9 tests)

### Phase 3: Queries ✅
- [x] Implement ready work query ✅ (api.ready() with TaskFilter, 31+ integration tests)
- [x] Implement blocked work query with reasons ✅ (api.blocked() returns BlockedTask[] with blockedBy/blockReason)
- [x] Implement assignment-based queries ✅ (TaskFilter.assignee, TaskFilter.owner - 6 integration tests)
- [x] Implement deadline-based queries ✅ (TaskFilter.hasDeadline, TaskFilter.deadlineBefore - 10 integration tests)

### Phase 4: Hydration ✅
- [x] Implement Document reference resolution ✅ (hydrateTask method in elemental-api.ts fetches referenced Documents)
- [x] Implement batch hydration for lists ✅ (hydrateTasks + batchFetchDocuments for efficient bulk operations)
- [x] Add hydration options to query API ✅ (hydrate option in ElementFilter, supports list/listPaginated - 18 tests)

### Phase 5: Integration ✅
- [x] Integrate with dependency system ✅ (PriorityService for dependency-based priority calculation)
- [x] Integrate with blocked cache ✅ (ready() excludes blocked tasks via blocked_cache)
- [x] Integrate with event system ✅ (auto_blocked/auto_unblocked events)
- [x] Add CLI commands for task operations ✅ (ready, blocked, close, reopen, assign, defer, undefer - 58 tests)
- [x] Dependency-based priority calculation ✅ (PriorityService.calculateEffectivePriority - 21 tests)
- [x] Complexity inheritance ✅ (PriorityService.calculateAggregateComplexity)
- [x] Ready query uses effective priority for sorting ✅ (tasks blocking high-priority work sort first - 5 integration tests)

### Phase 6: Testing
- [x] Unit tests for status transitions
- [x] Unit tests for ready/blocked computation (with dependencies) ✅ (priority-service.test.ts - 21 tests)
- [x] Integration tests for hydration ✅ (task-hydration.integration.test.ts - 18 tests)
- [x] Integration tests for dependency-based priority ✅ (ready-blocked.integration.test.ts - 5 tests)
- [x] E2E tests for task lifecycle ✅ (task.test.ts - 12 E2E lifecycle tests covering: complete lifecycle, deferral, blocking/unblocking, reopen, priority ordering, soft delete, assignment filtering, dependency chains, cascading unblock, multiple blockers, task type filtering, close reason persistence)

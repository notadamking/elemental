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

### Phase 1: Type Definitions
- [ ] Define `Task` interface extending `Element`
- [ ] Define `HydratedTask` interface
- [ ] Define `TaskStatus` union type
- [ ] Define `Priority` and `Complexity` types
- [ ] Create type guards for Task validation

### Phase 2: Lifecycle Management
- [ ] Implement status transition validation
- [ ] Implement automatic blocked status computation
- [ ] Implement tombstone transition logic
- [ ] Create status change event emission

### Phase 3: Queries
- [ ] Implement ready work query
- [ ] Implement blocked work query with reasons
- [ ] Implement assignment-based queries
- [ ] Implement deadline-based queries

### Phase 4: Hydration
- [ ] Implement Document reference resolution
- [ ] Implement batch hydration for lists
- [ ] Add hydration options to query API

### Phase 5: Integration
- [ ] Integrate with dependency system
- [ ] Integrate with blocked cache
- [ ] Integrate with event system
- [ ] Add CLI commands for task operations

### Phase 6: Testing
- [ ] Unit tests for status transitions
- [ ] Unit tests for ready/blocked computation
- [ ] Integration tests for hydration
- [ ] E2E tests for task lifecycle

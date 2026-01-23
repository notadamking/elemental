# Plan Type Specification

Plans are collections of related tasks, similar to Epics in agile methodologies. They organize work into logical groupings for batch tracking, progress monitoring, and high-level planning.

## Purpose

Plans provide:
- Logical grouping of related tasks
- High-level progress tracking
- Work breakdown structure
- Milestone organization
- Batch operations on task sets

## Properties

### Content

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `title` | `string` | Yes | Plan title, 1-500 characters |
| `descriptionRef` | `DocumentId` | No | Reference to description Document |

### Workflow

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `status` | `PlanStatus` | Yes | Current lifecycle state |

## Status Lifecycle

### States

| Status | Description |
|--------|-------------|
| `draft` | Planning phase, tasks being defined |
| `active` | Execution phase, work in progress |
| `completed` | All tasks closed successfully |
| `cancelled` | Plan abandoned |

### Valid Transitions

- `draft` → `active`, `cancelled`
- `active` → `completed`, `cancelled`
- `completed` → `active` (reopen)
- `cancelled` → `draft` (restart)

### Automatic Completion

A Plan can automatically transition to `completed` when:
- All child tasks reach `closed` status
- No child tasks are in `open`, `in_progress`, or `blocked`
- Optional: configured to auto-complete

## Task Association

Tasks are associated with Plans via `parent-child` dependency:

- Plan is the parent
- Tasks are children
- Hierarchical IDs reflect relationship (Plan: `el-abc`, Task: `el-abc.1`)
- Tasks inherit plan context

### Hierarchy Depth

- Plan: Level 0
- Task: Level 1
- Subtask: Level 2
- Maximum: 3 levels (configurable)

### Orphan Tasks

Tasks can exist without a plan (standalone tasks):
- No `parent-child` dependency to a plan
- Root-level ID (e.g., `el-xyz`, not `el-abc.1`)
- Fully functional independently

## Progress Tracking

Plan progress is computed from child tasks:

### Metrics

| Metric | Calculation |
|--------|-------------|
| Total Tasks | Count of child tasks |
| Completed | Tasks with `closed` status |
| In Progress | Tasks with `in_progress` status |
| Blocked | Tasks with `blocked` status |
| Remaining | `open` + `deferred` tasks |

### Progress Percentage

`completedPercentage = (closed / total) * 100`

### Weighted Progress

Optional: weight by complexity or priority for more accurate progress.

## Plan Operations

### Create Plan

1. Validate title
2. Set status to `draft`
3. Generate plan ID
4. Create plan record
5. Optionally create initial tasks

### Add Tasks

1. Create task with plan as parent
2. Task gets hierarchical ID
3. `parent-child` dependency created
4. Task contributes to plan progress

### Remove Tasks

1. Remove `parent-child` dependency
2. Task becomes orphaned (or moved to another plan)
3. Plan progress recalculated

### Activate Plan

1. Change status from `draft` to `active`
2. Emit status change event
3. Tasks become eligible for assignment

### Complete Plan

1. Verify all tasks closed (or force-complete)
2. Change status to `completed`
3. Record completion time
4. Emit completion event

### Cancel Plan

1. Change status to `cancelled`
2. Optionally cancel all child tasks
3. Record cancellation reason
4. Emit cancellation event

## Bulk Operations

Plans support bulk operations on child tasks:

- **Bulk Close**: Close all tasks in plan
- **Bulk Defer**: Defer all tasks
- **Bulk Reassign**: Reassign all tasks to new entity
- **Bulk Tag**: Add/remove tags from all tasks

## Query Patterns

### Plan Queries

- List plans by status
- List plans by creator
- Search plans by title

### Task-in-Plan Queries

- List tasks in a plan
- List ready tasks in a plan
- List blocked tasks in a plan with reasons

## Implementation Methodology

### Storage

Plans stored in `elements` table with:
- `type = 'plan'`
- Type-specific fields in JSON `data` column
- Status indexed for filtering

### Task Association

Via dependency system:
- `parent-child` dependency from task to plan
- Query: `getDependents(planId, ['parent-child'])`

### Progress Calculation

Computed on-demand:
1. Fetch all child tasks
2. Group by status
3. Calculate percentages
4. Cache for performance (optional)

### Hierarchical IDs

When creating task under plan:
1. Get plan ID (e.g., `el-abc`)
2. Get next child counter for plan
3. Generate task ID (e.g., `el-abc.3`)
4. Create `parent-child` dependency

## Implementation Checklist

### Phase 1: Type Definitions ✅
- [x] Define `Plan` interface extending `Element`
- [x] Define `PlanStatus` union type
- [x] Create type guards for Plan validation
- [x] Implement `createPlan` factory function
- [x] Implement `updatePlanStatus` function
- [x] Implement utility functions (isDraft, isActive, isCompleted, isCancelled)
- [x] Implement progress calculation functions
- [x] Implement filter and sort utilities
- [x] Unit tests (103 tests)

### Phase 2: Lifecycle Management
- [x] Implement status transition validation
- [x] Implement auto-completion detection (canAutoComplete)
- [ ] Create status change event emission

### Phase 3: Task Association
- [ ] Implement task-to-plan linking
- [ ] Implement hierarchical ID generation
- [ ] Add task removal from plan

### Phase 4: Progress Tracking
- [ ] Implement progress calculation
- [ ] Add progress caching (optional)
- [ ] Implement weighted progress (optional)

### Phase 5: Bulk Operations
- [ ] Implement bulk close
- [ ] Implement bulk defer
- [ ] Implement bulk reassign
- [ ] Implement bulk tag

### Phase 6: Queries
- [ ] Implement plan listing
- [ ] Implement tasks-in-plan query
- [ ] Add progress to list results

### Phase 7: Integration
- [ ] Integrate with task creation
- [ ] Integrate with hierarchical IDs
- [ ] Add CLI commands (plan create, plan list, plan show)

### Phase 8: Testing
- [ ] Unit tests for status transitions
- [ ] Unit tests for progress calculation
- [ ] Integration tests for task association
- [ ] E2E tests for plan lifecycle

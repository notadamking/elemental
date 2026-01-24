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
- `completed` → `active` (reopen) - **NOT YET IMPLEMENTED (el-6c3v)**
- `cancelled` → `draft` (restart) - **NOT YET IMPLEMENTED (el-6c3v)**

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

1. Verify plan is draft or active (not completed/cancelled) - **BUG el-4uvk: Verification not enforced**
2. Create task with plan as parent
3. Task gets hierarchical ID
4. `parent-child` dependency created
5. Task contributes to plan progress

### Remove Tasks

1. Remove `parent-child` dependency
2. Task becomes orphaned (or moved to another plan)
3. Plan progress recalculated

### Activate Plan

1. Change status from `draft` to `active`
2. Emit status change event
3. Tasks become eligible for assignment

### Complete Plan

1. Verify all tasks closed (or force-complete with `--force` flag) - **BUG el-g5qk: Verification not enforced**
2. Change status to `completed`
3. Record completion time
4. Emit completion event

### Reopen Plan - **NOT YET IMPLEMENTED (el-6c3v)**

1. Change status from `completed` or `cancelled` to `active`
2. Clear completedAt/cancelledAt timestamps
3. Emit reopen event

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
- [x] Create status change event emission ✅ (emits 'closed' event when status changes to completed/cancelled, 'reopened' event when status changes from completed/cancelled - 12 tests)
- [ ] **BUG el-g5qk**: Enforce task completion validation before plan complete (or require --force)
- [ ] **BUG el-4uvk**: Reject adding tasks to completed/cancelled plans
- [ ] **ENHANCEMENT el-6c3v**: Implement `el plan reopen` command

### Phase 3: Task Association ✅
- [x] Implement task-to-plan linking (`addTaskToPlan`, `removeTaskFromPlan`, `getTasksInPlan` API methods)
- [x] Implement hierarchical ID generation (`createTaskInPlan` generates IDs like `el-planid.1`)
- [x] Add task removal from plan (31 integration tests)

### Phase 4: Progress Tracking ✅
- [x] Implement progress calculation (`getPlanProgress` API method, `calculatePlanProgress` utility - 12 integration tests)
- [ ] Add progress caching (optional)
- [ ] Implement weighted progress (optional)

### Phase 5: Bulk Operations ✅
- [x] Implement bulk close (`bulkClosePlanTasks` API method - closes all non-closed/tombstone tasks with optional filter and close reason)
- [x] Implement bulk defer (`bulkDeferPlanTasks` API method - defers open/in_progress/blocked tasks with optional filter)
- [x] Implement bulk reassign (`bulkReassignPlanTasks` API method - reassigns tasks to new entity or unassigns with optional filter)
- [x] Implement bulk tag (`bulkTagPlanTasks` API method - adds/removes tags from tasks with optional filter)
- [x] Integration tests (39 tests in plan-bulk-operations.integration.test.ts)

### Phase 6: Queries ✅
- [x] Implement plan listing (src/cli/commands/plan.ts:planListHandler - lists plans with status filtering, tag filtering, and limit)
- [x] Implement tasks-in-plan query (src/cli/commands/plan.ts:planTasksHandler - lists tasks with status filtering)
- [x] Add progress to list results (plan list shows PROGRESS column, plan show shows detailed progress breakdown)
- [x] CLI tests - 57 tests (src/cli/commands/plan.test.ts)

### Phase 7: Integration ✅
- [x] Integrate with task creation (createTaskInPlan API)
- [x] Integrate with hierarchical IDs (el-planid.n format)
- [x] Add CLI commands (plan create, plan list, plan show, plan activate, plan complete, plan cancel, plan add-task, plan remove-task, plan tasks)

### Phase 8: Testing ✅
- [x] Unit tests for status transitions (src/types/plan.test.ts - 103 tests)
- [x] Unit tests for progress calculation (API integration tests)
- [x] Integration tests for task association (plan-task-linking.integration.test.ts - 31 tests)
- [x] CLI integration tests (src/cli/commands/plan.test.ts - 40 tests)
- [x] E2E tests for plan lifecycle (src/cli/commands/plan.test.ts - 17 tests covering lifecycle scenarios, progress tracking, task management, and status transitions)

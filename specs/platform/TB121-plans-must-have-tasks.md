# TB121: Plans Must Have Task Children

## Purpose

Enforce that plans (collections of tasks) must always contain at least one task. This prevents empty plan shells that clutter the system and ensures plans serve their intended purpose as task containers.

## Rationale

Plans are organizational containers for grouping related tasks. An empty plan provides no value and creates noise in the system. By requiring at least one task:

1. **Data Integrity**: Plans always represent meaningful work containers
2. **UX Clarity**: Users see plans as task collections, not empty placeholders
3. **System Cleanliness**: Prevents orphaned/empty plans from accumulating

## Implementation

### Server-Side Changes

#### POST /api/plans - Create Plan

**Before (TB121):** Plans could be created without any tasks.

**After (TB121):** Plans require one of:
- `initialTask` - Object with task details to create atomically with the plan
- `initialTaskId` - ID of an existing task to add to the plan

**Request Body:**
```json
{
  "title": "Plan Title",
  "createdBy": "entity-id",
  "initialTask": {
    "title": "First Task",
    "priority": 3,
    "status": "open"
  }
}
```

Or:
```json
{
  "title": "Plan Title",
  "createdBy": "entity-id",
  "initialTaskId": "el-existing-task"
}
```

**Response:** Returns created plan with `initialTask` field containing the task (created or referenced).

**Error Response (no task provided):**
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Plans must have at least one task. Provide either initialTaskId (existing task ID) or initialTask (object with title to create new task)."
  }
}
```

#### DELETE /api/plans/:id/tasks/:taskId - Remove Task from Plan

**Before (TB121):** Any task could be removed from a plan.

**After (TB121):** Cannot remove the last task. Returns error if attempted.

**Error Response:**
```json
{
  "error": {
    "code": "LAST_TASK",
    "message": "Cannot remove the last task from a plan. Plans must have at least one task."
  }
}
```

#### GET /api/plans/:id/can-delete-task/:taskId - Check If Task Can Be Deleted

**New endpoint** to check if a task removal would orphan the plan.

**Response:**
```json
{
  "canDelete": false,
  "reason": "Cannot remove the last task from a plan. Plans must have at least one task."
}
```

Or:
```json
{
  "canDelete": true
}
```

### Web UI Changes

#### Create Plan Modal (CreatePlanModal)

- Added "Create Plan" button to plans page header
- Modal requires an initial task before creation is allowed
- Two modes:
  1. **Create New Task**: Enter task title and priority for a new task
  2. **Use Existing Task**: Search and select from existing tasks
- Submit button disabled until task is provided
- Shows "Initial Task Required" info box explaining the requirement

#### Plan Detail Panel (PlanDetailPanel)

- **Last Task Warning**: Shows amber warning banner when plan has only one task
- **Disabled Remove Button**: Remove button is disabled for the last task
- **Tooltip**: Explains why removal is not allowed ("Cannot remove - plans must have at least one task")
- **Toast Error**: If user somehow clicks remove on last task, shows error toast

### Data Model

No changes to the underlying Plan or Task schemas. The constraint is enforced at the API level.

## Verification

19 Playwright tests cover:
- API validation for plan creation without task
- Atomic plan + task creation
- Using existing task for plan creation
- Last task removal prevention
- Can-delete endpoint
- UI modal functionality
- Warning displays
- Button states

## Files Changed

### Server
- `apps/server/src/index.ts` - Added validation and new endpoint

### Web
- `apps/web/src/routes/plans.tsx` - Added CreatePlanModal, updated PlanTaskList with last-task protection

### Tests
- `apps/web/tests/tb121-plans-must-have-tasks.spec.ts` - 19 comprehensive tests

## Implementation Checklist

- [x] Server: Add validation in `POST /api/plans` - require at least one task ID in request body OR create with initial task
- [x] Server: Add `POST /api/plans` variant that creates plan + first task atomically
- [x] Server: Prevent deletion of last task in plan (return error with helpful message)
- [x] Server: Add `GET /api/plans/:id/can-delete-task/:taskId` endpoint to check if deletion would orphan plan
- [x] Web: Update CreatePlanModal to require initial task (title input + "Add First Task" section)
- [x] Web: Show validation error if trying to submit plan without task
- [x] Web: In PlanDetailPanel, show warning when removing task would leave plan empty
- [x] Web: Disable "Remove" button on last task with tooltip explaining why
- [x] **Verify:** 19 Playwright tests passing (`apps/web/tests/tb121-plans-must-have-tasks.spec.ts`)

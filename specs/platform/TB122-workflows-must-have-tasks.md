# TB122: Workflows Must Have Task Children

## Purpose

Enforce that workflows (execution containers for tasks) must always contain at least one task. This prevents empty workflow shells that clutter the system and ensures workflows serve their intended purpose as task execution containers.

## Rationale

Workflows are execution containers that track task progress toward a goal. An empty workflow provides no value and creates noise in the system. By requiring at least one task:

1. **Data Integrity**: Workflows always represent meaningful execution units
2. **UX Clarity**: Users see workflows as task execution containers, not empty placeholders
3. **System Cleanliness**: Prevents orphaned/empty workflows from accumulating
4. **Progress Tracking**: Workflow progress only makes sense with tasks to track

## Key Differences from Plans (TB121)

Unlike Plans which have explicit add/remove task operations, Workflows have a different model:

1. **Creation via Pour**: Most workflows are created by "pouring" from a playbook, which generates tasks
2. **Direct Creation**: Workflows can also be created directly via `POST /api/workflows`
3. **No Remove Operation**: There's no `DELETE /api/workflows/:id/tasks/:taskId` endpoint - tasks are managed individually
4. **Burn Operation**: The entire workflow (with all tasks) can be "burned" (deleted) if ephemeral

## Implementation

### Server-Side Changes

#### POST /api/workflows - Create Workflow Directly

**Before (TB122):** Workflows could be created without any tasks.

**After (TB122):** Workflows created directly require one of:
- `initialTask` - Object with task details to create atomically with the workflow
- `initialTaskId` - ID of an existing task to add to the workflow
- `playbookId` - Reference to playbook (signals intent to pour tasks later, still requires initial task)

**Request Body (with new task):**
```json
{
  "title": "Workflow Title",
  "createdBy": "entity-id",
  "initialTask": {
    "title": "First Task",
    "priority": 3,
    "status": "open"
  }
}
```

**Request Body (with existing task):**
```json
{
  "title": "Workflow Title",
  "createdBy": "entity-id",
  "initialTaskId": "el-existing-task"
}
```

**Response:** Returns created workflow with `initialTask` field containing the task info.

**Error Response (no task provided):**
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Workflows must have at least one task. Provide either initialTaskId (existing task ID) or initialTask (object with title to create new task)."
  }
}
```

#### POST /api/workflows/pour - Pour from Playbook

**Before (TB122):** Playbooks with no steps (or all steps filtered by conditions) would create empty workflows.

**After (TB122):** Validation ensures at least one task will be created.

**Validation Steps:**
1. Check playbook has at least one step defined
2. After condition filtering, ensure at least one step remains
3. Return error if workflow would be empty

**Error Response (playbook has no steps):**
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Cannot pour workflow: playbook has no steps defined."
  }
}
```

**Error Response (all steps filtered):**
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Cannot pour workflow: all playbook steps were filtered by conditions. At least one task must be created."
  }
}
```

#### DELETE /api/tasks/:id - Soft-delete Task

**Before (TB122):** Any task could be soft-deleted.

**After (TB122):** Cannot delete the last task in a workflow.

**Error Response:**
```json
{
  "error": {
    "code": "LAST_TASK",
    "message": "Cannot delete the last task in a workflow. Workflows must have at least one task. Use 'Burn' to delete the entire workflow."
  }
}
```

#### GET /api/workflows/:id/can-delete-task/:taskId - Check If Task Can Be Deleted

**New endpoint** to check if deleting a task would leave the workflow empty.

**Response (cannot delete):**
```json
{
  "canDelete": false,
  "reason": "Cannot delete the last task in a workflow. Workflows must have at least one task.",
  "isLastTask": true
}
```

**Response (can delete):**
```json
{
  "canDelete": true
}
```

### Web UI Changes

#### PourWorkflowModal

- Added validation before pour: if playbook has no steps, disable Pour button
- Show warning message: "This playbook has no steps defined"
- After receiving "all steps filtered" error, show helpful message explaining why

#### WorkflowDetailPanel

- **Last Task Warning**: Shows amber warning banner when workflow has only one task
- **Empty State Enhancement**: Updated empty state message for workflows with no tasks (shouldn't happen after TB122)

#### TaskDetailPanel (for tasks in workflows)

- When task is part of a workflow and is the last task:
  - Show warning banner: "This is the only task in its workflow"
  - Add tooltip to delete button explaining why deletion might fail

### Data Model

No changes to the underlying Workflow or Task schemas. The constraint is enforced at the API level through:
- Validation on workflow creation
- Validation on task deletion when task is in a workflow

## Verification

Playwright tests cover:
- API validation for workflow creation without task
- Atomic workflow + task creation via POST /api/workflows
- Using existing task for workflow creation
- Pour validation when playbook has no steps
- Pour validation when all steps filtered by conditions
- Last task deletion prevention
- Can-delete endpoint for workflows
- UI pour modal validation
- Warning displays for last task

## Files Changed

### Server
- `apps/server/src/index.ts` - Added validation to POST /api/workflows, POST /api/workflows/pour, DELETE /api/tasks/:id, and new endpoint

### Web
- `apps/web/src/components/workflow/PourWorkflowModal.tsx` - Added empty playbook validation
- `apps/web/src/routes/workflows.tsx` - Added last-task warning in WorkflowDetailPanel

### Tests
- `apps/web/tests/tb122-workflows-must-have-tasks.spec.ts` - Comprehensive tests

## Implementation Checklist

- [x] Server: Add validation in `POST /api/workflows` - require at least one task (initialTask or initialTaskId)
- [x] Server: Add validation in `POST /api/workflows/pour` - ensure playbook has at least one step
- [x] Server: Add validation in `POST /api/workflows/pour` - ensure at least one task created after condition filtering
- [x] Server: Add check in `DELETE /api/tasks/:id` - prevent deleting last task in workflow
- [x] Server: Add `GET /api/workflows/:id/can-delete-task/:taskId` endpoint
- [x] Web: Update PourWorkflowModal to validate playbook has steps before pour
- [x] Web: In WorkflowDetailPanel, show warning when workflow has only one task
- [ ] Web: Update TaskDetailPanel to show warning for last task in workflow (deferred - no current UI for this)
- [x] **Verify:** 14 Playwright tests passing (`apps/web/tests/tb122-workflows-must-have-tasks.spec.ts`)

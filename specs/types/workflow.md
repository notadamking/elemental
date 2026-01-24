# Workflow Type Specification

Workflows are executable instances of ordered tasks, representing a sequence of work to be performed. They can be instantiated from Playbooks (templates) or created ad-hoc. Workflows support both durable (persistent) and ephemeral (temporary) modes.

## Purpose

Workflows provide:
- Ordered task execution sequences
- Template instantiation from Playbooks
- Variable substitution for parameterized work
- Ephemeral mode for temporary/experimental work
- Execution state tracking

## Properties

### Content

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `title` | `string` | Yes | Workflow title, 1-500 characters |
| `descriptionRef` | `DocumentId` | No | Reference to description Document |

### Workflow State

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `status` | `WorkflowStatus` | Yes | Current execution state |

### Source

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `playbookId` | `PlaybookId` | No | Playbook this was instantiated from |

### Execution Mode

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `ephemeral` | `boolean` | Yes | If true, not synced to JSONL |

### Variables

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `variables` | `object` | Yes | Resolved variable values |

## Status Lifecycle

### States

| Status | Description |
|--------|-------------|
| `pending` | Created but not started |
| `running` | Active execution |
| `completed` | All tasks finished successfully |
| `failed` | Execution failed |
| `cancelled` | Manually cancelled |

### Valid Transitions

- `pending` → `running`, `cancelled`
- `running` → `completed`, `failed`, `cancelled`
- `completed` → (terminal)
- `failed` → (terminal)
- `cancelled` → (terminal)

### Automatic Transitions

- `pending` → `running`: When first task starts
- `running` → `completed`: When all tasks close successfully
- `running` → `failed`: When any required task fails

## Ephemeral vs Durable

### Durable Workflows (`ephemeral: false`)

- Persisted to both SQLite and JSONL
- Included in git sync
- Survives application restarts
- Full audit trail
- Use for: important processes, compliance, long-running work

### Ephemeral Workflows (`ephemeral: true`)

- Persisted to SQLite only
- Not synced to JSONL or git
- May be garbage collected
- Lightweight creation/deletion
- Use for: experiments, patrols, temporary automation

### Ephemeral Operations

| Command | Description |
|---------|-------------|
| `workflow burn <id>` | Delete workflow and all tasks immediately |
| `workflow squash <id>` | Promote to durable (begin syncing) |
| `workflow gc --age <d>` | Garbage collect old ephemeral workflows |

## Instantiation ("Pouring")

Workflows are instantiated from Playbooks via "pouring":

### Process

1. Load Playbook definition
2. Resolve inheritance chain (if `extends`)
3. Collect and validate variables
4. Evaluate step conditions
5. Substitute variables in templates
6. Create Workflow element
7. Create Task elements for each step
8. Wire `blocks` dependencies
9. Return Workflow with tasks

### Variable Resolution

Variables are resolved at pour time:
- Provided values override defaults
- Required variables must be provided
- Enum values validated against allowed list
- Type coercion applied

### Condition Evaluation

Step conditions determine inclusion:
- Truthy: include step
- Falsy: skip step
- Missing variable: treated as falsy

### Task Creation

For each included step:
1. Generate hierarchical ID under workflow
2. Substitute variables in title/description
3. Set priority, complexity from step
4. Create task with workflow as parent

### Dependency Wiring

Step `dependsOn` creates `blocks` dependencies:
- Step A depends on Step B
- Task A `blocks` Task B
- Dependency created automatically

## Ad-hoc Workflows

Workflows can be created without a Playbook:
- Set `playbookId` to null
- Add tasks manually
- Wire dependencies manually
- Useful for one-off sequences

## Task Association

Tasks belong to Workflows via `parent-child`:
- Workflow is parent
- Tasks are children
- Hierarchical IDs (Workflow: `el-wf`, Task: `el-wf.1`)
- Tasks ordered by dependency graph

## Execution Model

Elemental provides data structures only, not an executor:
- Status transitions managed externally
- Task completion triggers recalculation
- Ready tasks determined by dependency system

### External Executors

Executors (separate packages) can:
1. Query ready tasks in workflow
2. Execute or assign tasks
3. Update task status
4. Trigger workflow transitions

## Garbage Collection

Ephemeral workflows support automatic cleanup:

### Criteria

- Workflow is ephemeral
- Age exceeds configured threshold
- Status is terminal (completed, failed, cancelled)

### Process

1. Identify eligible workflows
2. Delete all child tasks
3. Delete workflow element
4. No event trail for deleted items

## Implementation Methodology

### Storage

Workflows stored in `elements` table with:
- `type = 'workflow'`
- Type-specific fields in JSON `data` column
- `ephemeral` field for filtering exports

### Pouring Process

1. Validate playbook exists
2. Validate all required variables
3. Begin transaction
4. Create workflow element
5. For each step (filtered by condition):
   - Create task element
   - Create parent-child dependency
6. For each dependsOn relationship:
   - Create blocks dependency
7. Commit transaction
8. Emit workflow_created event

### Ephemeral Handling

On export:
1. Query all elements
2. Filter: exclude where workflow is ephemeral
3. Filter: exclude tasks with ephemeral workflow parent
4. Export remaining elements

### Squash Operation

1. Validate workflow is ephemeral
2. Set `ephemeral = false`
3. Mark workflow and tasks as dirty
4. Trigger export
5. Workflow now syncs normally

## Implementation Checklist

### Phase 1: Type Definitions ✅
- [x] Define `Workflow` interface extending `Element` (src/types/workflow.ts)
- [x] Define `WorkflowStatus` union type (src/types/workflow.ts)
- [x] Define `WorkflowId` and `PlaybookId` branded types (src/types/workflow.ts)
- [x] Create type guards for Workflow validation (src/types/workflow.ts)
- [x] Create validators for all workflow properties (src/types/workflow.ts)
- [x] Create `createWorkflow` factory function (src/types/workflow.ts)
- [x] Implement status transition validation (src/types/workflow.ts)
- [x] Implement `updateWorkflowStatus` function (src/types/workflow.ts)
- [x] Implement `squashWorkflow` operation (src/types/workflow.ts)
- [x] Implement utility functions (filters, sorts, groups) (src/types/workflow.ts)
- [x] Implement garbage collection helpers (src/types/workflow.ts)
- [x] Unit tests - 121 tests (src/types/workflow.test.ts)

### Phase 2: Lifecycle Management ✅
- [x] Implement auto-completion detection (src/types/workflow-pour.ts:shouldAutoComplete)
- [x] Implement auto-failure detection (src/types/workflow-pour.ts:shouldAutoFail)
- [x] Implement auto-start detection (src/types/workflow-pour.ts:shouldAutoStart)
- [x] Implement computeWorkflowStatus helper (src/types/workflow-pour.ts:computeWorkflowStatus)
- [ ] Create status change event emission (requires event service integration)

### Phase 3: Pouring ✅
- [x] Implement playbook loading (src/types/workflow-pour.ts:pourWorkflow uses resolvePlaybookInheritance)
- [x] Implement variable resolution (src/types/workflow-pour.ts uses resolveVariables from playbook.ts)
- [x] Implement condition evaluation (src/types/workflow-pour.ts uses filterStepsByConditions from playbook.ts)
- [x] Implement variable substitution (src/types/workflow-pour.ts uses substituteVariables from playbook.ts)
- [x] Implement task creation (src/types/workflow-pour.ts:createTaskFromStep)
- [x] Implement dependency wiring (src/types/workflow-pour.ts:createBlocksDependencies, createParentChildDependencies)
- [x] Implement validatePour for dry-run validation (src/types/workflow-pour.ts:validatePour)
- [x] Unit tests - 59 tests (src/types/workflow-pour.test.ts)

### Phase 4: Ephemeral Support
- [ ] Implement ephemeral filtering in export
- [ ] Implement `burn` operation (delete workflow and tasks)
- [ ] Implement garbage collection service

### Phase 5: Task Association ✅
- [x] Implement task-to-workflow linking (src/types/workflow-pour.ts:createParentChildDependencies)
- [x] Implement hierarchical ID generation (src/types/workflow-pour.ts uses generateChildId)
- [ ] Implement task ordering queries

### Phase 6: Queries
- [ ] Implement workflow listing
- [ ] Implement tasks-in-workflow query
- [ ] Implement ready tasks in workflow
- [ ] Add ephemeral filtering

### Phase 7: Integration
- [x] Integrate with Playbook system (src/types/workflow-pour.ts uses playbook inheritance)
- [x] Integrate with dependency system (creates blocks and parent-child dependencies)
- [ ] Integrate with export system
- [ ] Add CLI commands (pour, burn, squash, gc)

### Phase 8: Testing
- [x] Unit tests for status transitions (src/types/workflow.test.ts)
- [x] Unit tests for pouring logic - 59 tests (src/types/workflow-pour.test.ts)
- [x] Unit tests for ephemeral filtering (src/types/workflow.test.ts)
- [ ] Integration tests for full pour flow
- [ ] E2E tests for workflow lifecycle

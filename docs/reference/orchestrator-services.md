# Orchestrator Services Reference

Services from `@elemental/orchestrator-sdk` (`packages/orchestrator-sdk/src/services/`).

## RoleDefinitionService

**File:** `services/role-definition-service.ts`

Manages agent role definitions (stored prompts and behavioral configurations).

```typescript
import { createRoleDefinitionService } from '@elemental/orchestrator-sdk';

const roleDefService = createRoleDefinitionService(api);
```

### Create Role Definition

```typescript
const roleDef = await roleDefService.createRoleDefinition({
  role: 'worker',
  name: 'Frontend Developer',
  description: 'Specialized in React and TypeScript',
  systemPrompt: `You are a frontend developer...`,
  maxConcurrentTasks: 1,
  behaviors: {
    onStartup: 'Check for existing work before starting.',
    onStuck: 'Break down the problem into smaller parts.',
    onError: 'Log the error and notify the director.',
  },
  workerMode: 'persistent',  // For workers
  tags: ['frontend', 'senior'],
  createdBy: userEntityId,
});
```

### Query Role Definitions

```typescript
// Get by ID
const roleDef = await roleDefService.getRoleDefinition(roleDefId);

// Get system prompt text
const promptText = await roleDefService.getSystemPrompt(roleDefId);

// Get default for role type
const defaultDirector = await roleDefService.getDefaultRoleDefinition('director');

// List all
const all = await roleDefService.listRoleDefinitions();

// Filter
const workers = await roleDefService.listRoleDefinitions({ role: 'worker' });
const ephemeral = await roleDefService.listRoleDefinitions({ workerMode: 'ephemeral' });
const mergeStewards = await roleDefService.listRoleDefinitions({ stewardFocus: 'merge' });
const byTags = await roleDefService.listRoleDefinitions({ tags: ['frontend'] });
const byName = await roleDefService.listRoleDefinitions({ nameContains: 'react' });

// Get all for role
const allWorkers = await roleDefService.getRoleDefinitionsByRole('worker');
```

### Update Role Definition

```typescript
// Update fields (merged with existing)
await roleDefService.updateRoleDefinition(roleDefId, {
  name: 'Senior Frontend Developer',
  description: 'Updated description',
});

// Update system prompt (creates new Document version)
await roleDefService.updateRoleDefinition(roleDefId, {
  systemPrompt: 'New and improved prompt...',
});

// Update maxConcurrentTasks
await roleDefService.updateRoleDefinition(roleDefId, {
  maxConcurrentTasks: 2,
});

// Update behaviors (merged)
await roleDefService.updateRoleDefinition(roleDefId, {
  behaviors: { onError: 'New error handling instructions' },
});
```

### Delete Role Definition

```typescript
const deleted = await roleDefService.deleteRoleDefinition(roleDefId);
// Returns true if deleted, false if not found
```

### AgentBehaviors

```typescript
interface AgentBehaviors {
  onStartup?: string;      // Appended when agent starts
  onTaskAssigned?: string; // Appended when task is assigned
  onStuck?: string;        // Appended when agent appears stuck
  onHandoff?: string;      // Appended before creating a handoff
  onError?: string;        // Appended when handling errors
}
```

---

## TaskAssignmentService

**File:** `services/task-assignment-service.ts`

Comprehensive task assignment management.

```typescript
import { createTaskAssignmentService } from '@elemental/orchestrator-sdk';

const assignmentService = createTaskAssignmentService(api);
```

### Assignment Operations

```typescript
// Assign task
const task = await assignmentService.assignToAgent(taskId, agentId, {
  branch: 'custom/branch',
  worktree: '.elemental/.worktrees/custom',
  sessionId: 'session-123',
  markAsStarted: true,
});

// Unassign
const task = await assignmentService.unassignTask(taskId);

// Start task
const task = await assignmentService.startTask(taskId, 'session-456');

// Complete task
const task = await assignmentService.completeTask(taskId);
```

### Handoff

```typescript
// Hand off a task (unassigns, preserves branch/worktree, appends note to description)
const task = await assignmentService.handoffTask(taskId, {
  sessionId: 'session-123',
  message: 'Completed API integration, needs infrastructure access for CORS fix',
  branch: 'agent/worker-1/abc123-implement-login',
  worktree: '.elemental/.worktrees/worker-1-implement-login',
});
```

Handoff appends `[AGENT HANDOFF NOTE]: {message}` to the task's description Document and records the handoff in `handoffHistory`. The task is unassigned and returns to the pool for reassignment.

### Workload Queries

```typescript
// Get agent's tasks
const tasks = await assignmentService.getAgentTasks(agentId);

// Get workload summary
const workload = await assignmentService.getAgentWorkload(agentId);
// workload.totalTasks, workload.inProgressCount, workload.awaitingMergeCount, workload.byStatus

// Check capacity
const hasCapacity = await assignmentService.agentHasCapacity(agentId);
```

### Task Status Queries

```typescript
// Unassigned tasks
const unassigned = await assignmentService.getUnassignedTasks();

// By assignment status
const inProgress = await assignmentService.getTasksByAssignmentStatus('in_progress');
const completed = await assignmentService.getTasksByAssignmentStatus('completed');

// Awaiting merge
const awaitingMerge = await assignmentService.getTasksAwaitingMerge();

// Flexible filtering
const assignments = await assignmentService.listAssignments({
  agentId,
  taskStatus: 'in_progress',
  assignmentStatus: ['assigned', 'in_progress'],
  mergeStatus: 'pending',
  includeEphemeral: true,
});
```

### Assignment Status

| Status | Description |
|--------|-------------|
| `unassigned` | No agent assigned |
| `assigned` | Agent assigned but task not started |
| `in_progress` | Agent actively working |
| `completed` | Task completed, awaiting merge |
| `merged` | Branch successfully merged |

---

## DispatchService

**File:** `services/dispatch-service.ts`

Combines assignment with notification.

```typescript
import { createDispatchService } from '@elemental/orchestrator-sdk';

const dispatchService = createDispatchService(api, assignmentService, registry);
```

### Direct Dispatch

```typescript
const result = await dispatchService.dispatch(taskId, agentId, {
  branch: 'custom/branch',
  worktree: '.elemental/.worktrees/custom',
  priority: 10,
  restart: true,
  markAsStarted: true,
  notificationMessage: 'Custom message',
  dispatchedBy: senderEntityId,
});

// Result includes:
// result.task - Updated task
// result.agent - Target agent
// result.notification - Notification message
// result.channel - Agent's channel
// result.isNewAssignment
// result.dispatchedAt
```

### Batch Dispatch

```typescript
const results = await dispatchService.dispatchBatch(
  [taskId1, taskId2, taskId3],
  agentId,
  { priority: 5 }
);
```

### Agent Notification (without assignment)

```typescript
await dispatchService.notifyAgent(
  agentId,
  'restart-signal',  // 'task-assignment' | 'task-reassignment' | 'restart-signal'
  'Please restart your session',
  { reason: 'configuration change' }
);
```

---

## DispatchDaemon

**File:** `services/dispatch-daemon.ts`

Continuously running process that coordinates task assignment and message delivery across all agents.

```typescript
import { createDispatchDaemon } from '@elemental/orchestrator-sdk';

const daemon = createDispatchDaemon(api, spawner, sessionManager, {
  pollIntervalMs: 5000,
  projectRoot: process.cwd(), // For project-level prompt overrides
});
```

### Starting the Daemon

```typescript
// Start the daemon
await daemon.start();

// Stop the daemon
await daemon.stop();
```

### Runtime Configuration

```typescript
// Update config while running (restarts poll interval if pollIntervalMs changes)
daemon.updateConfig({ pollIntervalMs: 10000 });
```

### Polling Loops

The daemon runs six polling loops:

| Loop | Purpose |
|------|---------|
| **Orphan Recovery** | Detect workers with assigned tasks but no active session; resume or respawn to continue work |
| **Worker Availability** | Find available ephemeral workers and assign highest priority unassigned tasks |
| **Inbox Polling** | Deliver messages to agents and spawn sessions when needed |
| **Steward Triggers** | Check for triggered conditions and create workflows from playbooks |
| **Workflow Tasks** | Assign workflow tasks to available stewards |
| **Closed-Unmerged Reconciliation** | Detect CLOSED tasks with non-merged mergeStatus and move them back to REVIEW |

### Worker Dispatch Behavior

1. Find ephemeral workers without an active session
2. For each available worker:
   - Query for ready, unassigned tasks via `api.ready()`
   - Assign highest priority task to worker
   - Send dispatch message to worker's inbox
   - Spawn worker in task worktree

**Note:** The daemon uses `api.ready()` which filters out:
- Blocked tasks (via blocked cache)
- Tasks in draft plans (plan status = 'draft')
- Future-scheduled tasks
- Ephemeral workflow tasks

This ensures tasks are only dispatched when they're truly ready to be worked on.

### Orphan Recovery Behavior

The daemon recovers orphaned task assignments on startup and at the start of each poll cycle:

1. Find ephemeral workers without an active session
2. Check if worker has assigned tasks (OPEN or IN_PROGRESS status)
3. For each orphaned assignment:
   - **Resume session:** If `sessionId` exists in task metadata, try `sessionManager.resumeSession()` with a restart notification prompt
   - **Fresh spawn:** If no sessionId or resume fails, call `sessionManager.startSession()` with the full task prompt
4. Reuse existing worktree/branch from task metadata if available; create new if missing

**Configuration:** Set `orphanRecoveryEnabled: false` to disable (default: `true`).

**Note:** REVIEW status tasks are not recovered by this mechanism — they are handled by merge steward dispatch in `pollWorkflowTasks()`.

### Inbox Dispatch Behavior

For ephemeral workers and stewards (two-path model):
- Dispatch message → mark as read (spawn handled by worker availability polling)
- Non-dispatch message + active session → leave unread (do NOT forward)
- Non-dispatch message + no active session → accumulate for triage batch

For persistent workers and directors:
- Active session = forward message as user input
- No active session = message waits

### Triage Spawn

The daemon can spawn triage sessions to evaluate and categorize incoming messages.

```typescript
// Process a batch of messages awaiting triage
await daemon.processTriageBatch();

// Spawn a single triage session for a specific message or context
await daemon.spawnTriageSession(triageContext);

// Build the prompt used by triage sessions
const prompt = daemon.buildTriagePrompt(triageContext);
```

#### `processTriageBatch()`

Polls for messages that need triage, groups them, and spawns triage sessions to evaluate them. Called automatically as part of the daemon's polling loops.

#### `spawnTriageSession(context)`

Spawns a headless agent session in a read-only worktree (see `WorktreeManager.createReadOnlyWorktree()`). The session receives the triage prompt and evaluates messages, then cleans up on exit.

#### `buildTriagePrompt(context)`

Constructs the prompt for a triage session using the `message-triage.md` prompt template. Includes the messages to evaluate and any relevant project context.

### Closed-Unmerged Reconciliation Behavior

Tasks can end up with `status=CLOSED` but `mergeStatus` not `'merged'` (e.g. when `el close` is run on a REVIEW task, or from race conditions between CLI commands and steward processing). While these tasks appear in the **Awaiting Merge** section of the web UI (alongside `REVIEW` status tasks), they are invisible to merge stewards which only query for `status=REVIEW`.

The reconciliation poll detects and recovers these stuck tasks:

1. Query for tasks with `status=CLOSED` and `mergeStatus` in `['pending', 'testing', 'merging', 'conflict', 'test_failed', 'failed']`
2. For each stuck task:
   - **Grace period:** Skip if `closedAt` is within `closedUnmergedGracePeriodMs` (default: 120s) to avoid racing with in-progress close+merge sequences
   - **Safety valve:** Skip and warn if `reconciliationCount >= 3` to prevent infinite loops
   - Move task back to REVIEW status, clear `closedAt` and `closeReason`, increment `reconciliationCount` in metadata

**Configuration:**
- `closedUnmergedReconciliationEnabled` — enable/disable (default: `true`)
- `closedUnmergedGracePeriodMs` — grace period before reconciliation (default: `120000`)

**Execution Timing:** Runs after `pollWorkflowTasks()` so reconciled tasks are picked up on the next cycle.

---

## StewardScheduler

**File:** `services/steward-scheduler.ts`

Schedules steward execution based on triggers.

```typescript
import { createStewardScheduler } from '@elemental/orchestrator-sdk';

const scheduler = createStewardScheduler(api);
```

### Methods

```typescript
// Register steward for scheduling
scheduler.register(stewardId, triggers);

// Unregister
scheduler.unregister(stewardId);

// Check if steward should run
const shouldRun = await scheduler.shouldRun(stewardId, context);

// Get execution history
const history = scheduler.getExecutionHistory(stewardId);

// Record execution
scheduler.recordExecution(stewardId, result);
```

### Trigger Types

| Type | Description |
|------|-------------|
| `cron` | Time-based (e.g., `'0 */15 * * *'`) |
| `event` | On specific events (e.g., `'task_completed'`) |
| `condition` | When condition is met |

---

## PluginExecutor

**File:** `services/plugin-executor.ts`

Executes steward plugins.

```typescript
import { createPluginExecutor } from '@elemental/orchestrator-sdk';

const executor = createPluginExecutor(api);
```

### Built-in Plugins

| Plugin | Focus | Purpose |
|--------|-------|---------|
| `merge-plugin` | `merge` | Merge completed branches |
| `health-plugin` | `health` | Monitor agent health |
| `reminder-plugin` | `reminder` | Send reminders |
| `ops-plugin` | `ops` | Operational tasks |

### Methods

```typescript
// Execute plugin
const result = await executor.execute(stewardId, pluginName, context);

// Register custom plugin
executor.registerPlugin({
  name: 'custom-plugin',
  focus: 'ops',
  execute: async (context) => {
    // Plugin logic
    return { success: true };
  },
});

// List available plugins
const plugins = executor.listPlugins();
```

---

## HealthStewardService

**File:** `services/health-steward-service.ts`

Monitors agent health and triggers remediation.

```typescript
import { createHealthStewardService } from '@elemental/orchestrator-sdk';

const healthService = createHealthStewardService(api, sessionManager);
```

### Methods

```typescript
// Check all agent health
const results = await healthService.checkAllAgents();

// Check specific agent
const health = await healthService.checkAgentHealth(agentId);

// Get health history
const history = await healthService.getHealthHistory(agentId, limit);

// Run remediation
const remediated = await healthService.remediate(agentId, issue);

// Activity tracking
healthService.recordActivity(agentId, activityType);
const lastActivity = healthService.getLastActivity(agentId);
```

### Health Check Result

```typescript
interface HealthCheckResult {
  agentId: EntityId;
  healthy: boolean;
  issues: HealthIssue[];
  checkedAt: Timestamp;
  recommendations: string[];
}

interface HealthIssue {
  type: 'unresponsive' | 'stuck' | 'overloaded' | 'error';
  severity: 'warning' | 'critical';
  description: string;
  detectedAt: Timestamp;
}
```

---

## WorkerTaskService

**File:** `services/worker-task-service.ts`

Worker-specific task operations.

```typescript
import { createWorkerTaskService } from '@elemental/orchestrator-sdk';

const workerTaskService = createWorkerTaskService(api, assignmentService);
```

### Methods

```typescript
// Get current task for worker
const task = await workerTaskService.getCurrentTask(workerId);

// Claim next available task
const task = await workerTaskService.claimNextTask(workerId);

// Complete current task
await workerTaskService.completeCurrentTask(workerId, result);

// Request help
await workerTaskService.requestHelp(workerId, taskId, message);
```

---

## WorktreeManager

**File:** `services/worktree-manager.ts`

Manages Git worktree creation and cleanup for agent sessions.

### createReadOnlyWorktree

Creates a detached HEAD worktree on the default branch without creating a new branch. Used for triage sessions and other read-only operations where the agent needs repository access but should not make commits.

```typescript
import { createWorktreeManager } from '@elemental/orchestrator-sdk';

const worktreeManager = createWorktreeManager(projectRoot);

const worktreePath = await worktreeManager.createReadOnlyWorktree(agentName, purpose);
// Returns path: .elemental/.worktrees/{agent-name}-{purpose}/
```

**Path pattern:** `.elemental/.worktrees/{agent-name}-{purpose}/`

**Behavior:**
- Checks out a detached HEAD at the tip of the default branch
- Does not create a new Git branch (unlike standard worktree creation)
- Suitable for triage sessions that only need to read the codebase
- The worktree should be cleaned up when the session exits

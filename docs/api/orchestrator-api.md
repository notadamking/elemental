# Orchestrator API

The `@elemental/orchestrator-sdk` package extends the core Elemental SDK with AI agent orchestration capabilities.

## Overview

The OrchestratorAPI extends ElementalAPI with:
- Agent registration and management (Director, Worker, Steward roles)
- Session tracking with Claude Code integration
- Orchestrator-specific task metadata (branch, worktree, sessionId)
- Capability-based task routing

## Installation

```typescript
import { createOrchestratorAPI, type OrchestratorAPI } from '@elemental/orchestrator-sdk';
import { createStorage, initializeSchema } from '@elemental/storage';

const storage = createStorage('./my-project/.elemental/db.sqlite');
initializeSchema(storage);

const api = createOrchestratorAPI(storage);
```

## Agent Registration

### Register a Director
```typescript
const director = await api.registerDirector({
  name: 'MainDirector',
  createdBy: humanEntityId,
  capabilities: {
    skills: ['planning', 'coordination'],
    maxConcurrentTasks: 1,
  },
});
```

### Register a Worker
```typescript
const worker = await api.registerWorker({
  name: 'FrontendWorker',
  workerMode: 'ephemeral', // or 'persistent'
  createdBy: directorEntityId,
  reportsTo: directorEntityId,
  capabilities: {
    skills: ['frontend', 'testing'],
    languages: ['typescript', 'javascript'],
    maxConcurrentTasks: 2,
  },
});
```

### Register a Steward
```typescript
const steward = await api.registerSteward({
  name: 'MergeSteward',
  stewardFocus: 'merge', // or 'health', 'reminder', 'ops'
  triggers: [
    { type: 'event', event: 'task_completed' },
  ],
  createdBy: directorEntityId,
});
```

## Agent Channels

Each agent automatically gets a dedicated messaging channel when registered. This enables inter-agent communication and notifications.

### Channel Creation

Channels are created atomically during registration:
- Channel name format: `agent-{agentId}`
- Members: agent entity + creator entity
- Visibility: private
- Join policy: invite-only

### Accessing Agent Channels

Using the AgentRegistry service:

```typescript
import { createAgentRegistry } from '@elemental/orchestrator-sdk';

const registry = createAgentRegistry(api);

// Get the full channel object
const channel = await registry.getAgentChannel(agentId);
if (channel) {
  console.log(`Channel: ${channel.name}, Members: ${channel.members.length}`);
}

// Get just the channel ID (faster)
const channelId = await registry.getAgentChannelId(agentId);
```

### Channel Name Utilities

```typescript
import {
  generateAgentChannelName,
  parseAgentChannelName,
} from '@elemental/orchestrator-sdk';

// Generate channel name for an agent
const channelName = generateAgentChannelName(agentId);
// Returns: 'agent-el-abc123'

// Parse agent ID from channel name
const parsedAgentId = parseAgentChannelName('agent-el-abc123');
// Returns: 'el-abc123' (or null if not an agent channel)
```

### Sending Messages to Agents

```typescript
// Send a message to an agent's channel
const channelId = await registry.getAgentChannelId(agentId);
if (channelId) {
  await api.create({
    type: 'message',
    channelId,
    sender: senderEntityId,
    contentRef: messageDocumentId,
    metadata: {
      type: 'task-assignment', // or 'status-update', 'help-request', etc.
    },
  });
}
```

## Agent Capabilities

Capabilities enable intelligent task routing based on agent skills and languages.

### AgentCapabilities
```typescript
interface AgentCapabilities {
  skills: readonly string[];      // e.g., ['frontend', 'testing', 'database']
  languages: readonly string[];   // e.g., ['typescript', 'python']
  maxConcurrentTasks: number;     // default: 1
}
```

### TaskCapabilityRequirements
```typescript
interface TaskCapabilityRequirements {
  requiredSkills?: readonly string[];     // Agent MUST have ALL
  preferredSkills?: readonly string[];    // Used for ranking
  requiredLanguages?: readonly string[];  // Agent MUST have ALL
  preferredLanguages?: readonly string[]; // Used for ranking
}
```

### Capability Matching

```typescript
import {
  matchAgentToTask,
  findAgentsForTask,
  getBestAgentForTask,
  setTaskCapabilityRequirements,
} from '@elemental/orchestrator-sdk';

// Set requirements on a task
const taskMeta = setTaskCapabilityRequirements(task.metadata, {
  requiredSkills: ['frontend'],
  preferredSkills: ['testing'],
  requiredLanguages: ['typescript'],
});
const task = await api.update(taskId, { metadata: taskMeta });

// Match a single agent
const result = matchAgentToTask(worker, task);
console.log(result.isEligible);  // true if meets all requirements
console.log(result.score);       // 0-100, higher is better match

// Find all eligible agents
const workers = await api.getAvailableWorkers();
const matches = findAgentsForTask(workers, task);
// Returns: [{ agent, matchResult }] sorted by score descending

// Get the best agent
const best = getBestAgentForTask(workers, task);
if (best) {
  console.log(`Best match: ${best.agent.name} (score: ${best.matchResult.score})`);
}
```

### Scoring Algorithm

- **Base (50 points)**: Meeting all required skills and languages
- **Preferred skills (25 points)**: Proportional to matched preferred skills
- **Preferred languages (25 points)**: Proportional to matched preferred languages

If any required skill or language is missing, the agent is not eligible (score = 0).

### Capability Utilities

```typescript
import {
  getAgentCapabilities,
  agentHasSkill,
  agentHasLanguage,
  agentHasAllSkills,
  agentHasCapacity,
  validateAgentCapabilities,
} from '@elemental/orchestrator-sdk';

// Get agent's capabilities (with defaults if not set)
const caps = getAgentCapabilities(worker);

// Check individual capabilities
agentHasSkill(worker, 'frontend');         // true/false
agentHasLanguage(worker, 'typescript');    // true/false
agentHasAllSkills(worker, ['frontend', 'testing']); // true if has both
agentHasCapacity(worker, currentTaskCount); // true if under maxConcurrentTasks

// Validate capability configuration
const { valid, errors } = validateAgentCapabilities(worker);
```

## Agent Queries

```typescript
// Get specific agent
const agent = await api.getAgent(entityId);
const agentByName = await api.getAgentByName('FrontendWorker');

// List and filter
const allAgents = await api.listAgents();
const workers = await api.listAgents({ role: 'worker' });
const ephemeralWorkers = await api.listAgents({
  role: 'worker',
  workerMode: 'ephemeral'
});

// Role-specific queries
const director = await api.getDirector();
const stewards = await api.getStewards();
const availableWorkers = await api.getAvailableWorkers();
```

## Task Assignment

### Basic Assignment (OrchestratorAPI)

```typescript
// Assign task to agent (auto-generates branch and worktree names)
const task = await api.assignTaskToAgent(taskId, workerId);

// With explicit options
const task = await api.assignTaskToAgent(taskId, workerId, {
  branch: 'agent/worker-1/task-feat-auth',
  worktree: '.worktrees/worker-1-feat-auth',
  sessionId: 'claude-session-123',
});

// Get/update orchestrator metadata
const meta = await api.getTaskOrchestratorMeta(taskId);
await api.updateTaskOrchestratorMeta(taskId, {
  mergeStatus: 'pending'
});
```

### TaskAssignmentService (TB-O8)

For comprehensive task assignment management, use the TaskAssignmentService:

```typescript
import {
  createTaskAssignmentService,
  type TaskAssignment,
  type AssignmentStatus,
} from '@elemental/orchestrator-sdk';

const assignmentService = createTaskAssignmentService(api);
```

#### Assignment Operations

```typescript
// Assign a task to an agent
const task = await assignmentService.assignToAgent(taskId, agentId, {
  branch: 'custom/branch',      // Optional: auto-generated if not provided
  worktree: '.worktrees/custom', // Optional: auto-generated if not provided
  sessionId: 'session-123',      // Optional: Claude Code session ID
  markAsStarted: true,           // Optional: immediately mark as in_progress
});

// Unassign a task
const task = await assignmentService.unassignTask(taskId);

// Start a task (mark as in_progress)
const task = await assignmentService.startTask(taskId, 'session-456');

// Complete a task (mark as closed, set mergeStatus to pending)
const task = await assignmentService.completeTask(taskId);
```

#### Workload Queries

```typescript
// Get all tasks assigned to an agent
const tasks = await assignmentService.getAgentTasks(agentId);

// Get workload summary
const workload = await assignmentService.getAgentWorkload(agentId);
console.log(`Total tasks: ${workload.totalTasks}`);
console.log(`In progress: ${workload.inProgressCount}`);
console.log(`Awaiting merge: ${workload.awaitingMergeCount}`);
console.log(`By status:`, workload.byStatus);

// Check if agent has capacity for more tasks
const hasCapacity = await assignmentService.agentHasCapacity(agentId);
```

#### Task Status Queries

```typescript
// Get unassigned tasks
const unassigned = await assignmentService.getUnassignedTasks();

// Get tasks by assignment status
// Status: 'unassigned' | 'assigned' | 'in_progress' | 'completed' | 'merged'
const inProgress = await assignmentService.getTasksByAssignmentStatus('in_progress');
const completed = await assignmentService.getTasksByAssignmentStatus('completed');

// Get tasks awaiting merge (completed but not yet merged)
const awaitingMerge = await assignmentService.getTasksAwaitingMerge();

// List with flexible filtering
const assignments = await assignmentService.listAssignments({
  agentId: agentId,                    // Filter by agent
  taskStatus: 'in_progress',           // Filter by task status
  assignmentStatus: ['assigned', 'in_progress'], // Filter by assignment status
  mergeStatus: 'pending',              // Filter by merge status
  includeEphemeral: true,              // Include ephemeral tasks
});
```

#### Assignment Status

The `AssignmentStatus` type tracks where a task is in the assignment lifecycle:

| Status | Description |
|--------|-------------|
| `unassigned` | No agent assigned |
| `assigned` | Agent assigned but task not yet started |
| `in_progress` | Agent actively working on task |
| `completed` | Task completed, awaiting merge |
| `merged` | Branch successfully merged |

### DispatchService (TB-O8a)

The DispatchService combines task assignment with agent notification and provides capability-based smart routing.

```typescript
import {
  createDispatchService,
  type DispatchResult,
  type SmartDispatchOptions,
} from '@elemental/orchestrator-sdk';

const dispatchService = createDispatchService(api, assignmentService, registry);
```

#### Direct Dispatch

```typescript
// Dispatch a task to a specific agent
const result = await dispatchService.dispatch(taskId, agentId, {
  branch: 'custom/branch',        // Optional: custom branch name
  worktree: '.worktrees/custom',  // Optional: custom worktree path
  priority: 10,                    // Optional: priority level (higher = more urgent)
  restart: true,                   // Optional: signal agent to restart
  markAsStarted: true,             // Optional: immediately mark as in_progress
  notificationMessage: 'Custom message', // Optional: custom notification
  dispatchedBy: senderEntityId,    // Optional: who dispatched (for message sender)
});

// Result includes:
// - result.task: Updated task after assignment
// - result.agent: The agent dispatched to
// - result.notification: The notification message sent
// - result.channel: The agent's channel
// - result.isNewAssignment: true if first assignment, false if reassignment
// - result.dispatchedAt: Timestamp of dispatch
```

#### Batch Dispatch

```typescript
// Dispatch multiple tasks to the same agent
const results = await dispatchService.dispatchBatch(
  [taskId1, taskId2, taskId3],
  agentId,
  { priority: 5 }
);
```

#### Smart Dispatch (Capability-based Routing)

```typescript
// Automatically dispatch to the best matching available agent
const result = await dispatchService.smartDispatch(taskId, {
  eligibleOnly: true,    // Only consider agents meeting all requirements
  minScore: 50,          // Minimum capability score threshold
  priority: 5,           // Priority for notification
});

// Get candidate agents without dispatching
const candidates = await dispatchService.getCandidates(taskId, {
  eligibleOnly: true,
  minScore: 0,
});
// candidates.candidates: sorted list by score
// candidates.bestCandidate: highest scoring agent
// candidates.hasRequirements: whether task has capability requirements
// candidates.requirements: the task's capability requirements

// Get just the best agent
const best = await dispatchService.getBestAgent(taskId);
if (best) {
  console.log(`Best: ${best.agent.name} (score: ${best.matchResult.score})`);
}
```

#### Agent Notification (without task assignment)

```typescript
// Send notification to an agent without assigning a task
await dispatchService.notifyAgent(
  agentId,
  'restart-signal',                // 'task-assignment' | 'task-reassignment' | 'restart-signal'
  'Please restart your session',   // Message content
  { reason: 'configuration change' } // Optional metadata
);
```

#### Dispatch Notification Metadata

Notifications sent via dispatch include structured metadata:

```typescript
interface DispatchNotificationMetadata {
  type: 'task-assignment' | 'task-reassignment' | 'restart-signal';
  taskId: ElementId;
  priority?: number;
  restart?: boolean;
  branch?: string;
  worktree?: string;
  sessionId?: string;
  dispatchedAt: Timestamp;
  dispatchedBy?: EntityId;
}
```

## Session Management

```typescript
// Update agent session
await api.updateAgentSession(agentId, 'session-123', 'running');

// Session states: 'idle' | 'running' | 'suspended' | 'terminated'
```

## Type Definitions

Key files:
- `packages/orchestrator-sdk/src/types/agent.ts` - Agent and capability types
- `packages/orchestrator-sdk/src/types/task-meta.ts` - Task orchestrator metadata
- `packages/orchestrator-sdk/src/services/capability-service.ts` - Capability matching
- `packages/orchestrator-sdk/src/services/agent-registry.ts` - Agent registration and channel management
- `packages/orchestrator-sdk/src/services/task-assignment-service.ts` - Task assignment and workload management
- `packages/orchestrator-sdk/src/services/dispatch-service.ts` - Task dispatch with assignment + notification

## See Also

- [ElementalAPI](elemental-api.md) - Base API documentation
- [Storage](../core/storage.md) - Storage layer
- [STAGE_2_PLAN.md](../../specs/STAGE_2_PLAN.md) - Implementation roadmap

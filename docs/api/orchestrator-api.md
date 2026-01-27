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

## SpawnerService (TB-O9)

The SpawnerService manages Claude Code process spawning and lifecycle for AI agents.

### Creating a Spawner

```typescript
import { createSpawnerService, type SpawnerService } from '@elemental/orchestrator-sdk';

const spawner = createSpawnerService({
  claudePath: 'claude',           // Path to Claude Code binary
  workingDirectory: '/workspace', // Default working directory
  timeout: 30000,                 // Timeout for init (30s)
  elementalRoot: '/workspace',    // Sets ELEMENTAL_ROOT env var
  environmentVariables: {},       // Additional env vars
});
```

### Spawning Agents

```typescript
// Spawn a headless worker (ephemeral workers, stewards)
const result = await spawner.spawn(agentId, 'worker', {
  mode: 'headless',                      // Uses stream-json format
  workingDirectory: '/path/to/worktree',
  resumeSessionId: 'previous-session',   // Resume previous session
  initialPrompt: 'Implement the feature', // Initial prompt
});

// Access session info and event emitter
console.log(result.session.id);           // Internal session ID
console.log(result.session.claudeSessionId); // Claude Code session ID (for resume)
console.log(result.session.status);       // 'running'

// Listen for events
result.events.on('event', (event) => {
  console.log(`Event type: ${event.type}`);  // assistant, tool_use, tool_result, error, system
  if (event.message) console.log(event.message);
});

result.events.on('exit', (code, signal) => {
  console.log(`Process exited with code ${code}`);
});
```

### Session States

Sessions follow a state machine:

| State | Description | Valid Transitions |
|-------|-------------|-------------------|
| `starting` | Process is starting | running, terminated |
| `running` | Agent is active | suspended, terminating, terminated |
| `suspended` | Paused for later resume | running, terminated |
| `terminating` | Shutting down | terminated |
| `terminated` | Process ended | (none) |

### Session Operations

```typescript
// Terminate a session
await spawner.terminate(sessionId, true); // graceful=true (SIGTERM then SIGKILL)
await spawner.terminate(sessionId, false); // force kill (SIGKILL)

// Suspend a session (marks for later resume)
await spawner.suspend(sessionId);

// Send input to a headless session
await spawner.sendInput(sessionId, 'Please continue');
```

### Session Queries

```typescript
// Get session by ID
const session = spawner.getSession(sessionId);

// List active sessions
const active = spawner.listActiveSessions();
const forAgent = spawner.listActiveSessions(agentId);

// List all sessions (including terminated)
const all = spawner.listAllSessions();

// Get most recent session for an agent
const recent = spawner.getMostRecentSession(agentId);

// Get event emitter for a session
const events = spawner.getEventEmitter(sessionId);
```

### Stream JSON Events

Headless agents emit stream-json events:

```typescript
interface SpawnedSessionEvent {
  type: StreamJsonEventType;    // 'system' | 'assistant' | 'user' | 'tool_use' | 'tool_result' | 'result' | 'error'
  subtype?: string;             // e.g., 'init', 'text'
  receivedAt: Timestamp;        // When event was received
  raw: StreamJsonEvent;         // Raw event data
  message?: string;             // Parsed message content
  tool?: {                      // Tool information (for tool_use/tool_result)
    name?: string;
    id?: string;
    input?: unknown;
  };
}
```

### Utility Functions

```typescript
import {
  canReceiveInput,
  isTerminalStatus,
  getStatusDescription,
} from '@elemental/orchestrator-sdk';

canReceiveInput('running');      // true
isTerminalStatus('terminated');  // true
getStatusDescription('running'); // 'Running'
```

### Universal Work Principle (UWP) - TB-O9a

The Universal Work Principle (UWP) states: "If there is work on your anchor, YOU MUST RUN IT"

On agent startup, use `checkReadyQueue()` to check for pending work:

```typescript
import type { UWPCheckResult, UWPTaskInfo } from '@elemental/orchestrator-sdk';

// The getReadyTasks callback allows integration with TaskAssignmentService
// without circular dependencies
const getReadyTasks = async (agentId: EntityId, limit: number): Promise<UWPTaskInfo[]> => {
  // Use TaskAssignmentService to query ready tasks
  const assignments = await assignmentService.getAgentTasks(agentId, {
    taskStatus: ['open', 'in_progress'],
  });

  return assignments.slice(0, limit).map(a => ({
    id: a.task.id,
    title: a.task.title,
    priority: a.task.priority,
    status: a.task.status,
  }));
};

// Check for ready tasks on startup
const result = await spawner.checkReadyQueue(agentId, {
  getReadyTasks,
  limit: 1,        // Check first task only
  autoStart: true, // Signal that caller should start the task
});

if (result.hasReadyTask) {
  console.log(`Found ready task: ${result.taskTitle} (${result.taskId})`);
  if (result.autoStarted) {
    // Caller should start the task using TaskAssignmentService
    await assignmentService.startTask(result.taskId as ElementId, sessionId);
  }
} else {
  // No work found - enter idle/polling mode
  console.log('No ready tasks, entering idle mode');
}
```

#### UWP Types

```typescript
interface UWPCheckResult {
  hasReadyTask: boolean;      // Whether a ready task was found
  taskId?: string;            // The ready task ID if found
  taskTitle?: string;         // The task title if found
  taskPriority?: number;      // The task priority if found
  autoStarted: boolean;       // Whether the task was flagged for auto-start
  sessionId?: string;         // Session ID if a task was auto-started
}

interface UWPCheckOptions {
  autoStart?: boolean;        // Signal auto-start intent (default: false)
  limit?: number;             // Max tasks to check (default: 1)
  getReadyTasks?: (           // Callback to get task info
    agentId: EntityId,
    limit: number
  ) => Promise<UWPTaskInfo[]>;
}

interface UWPTaskInfo {
  id: string;
  title: string;
  priority: number;
  status: string;
}
```

### Notes

- **Headless mode** uses `child_process.spawn()` with stream-json I/O
- **Interactive mode** requires `node-pty` (not yet implemented)
- The `ELEMENTAL_ROOT` environment variable is set for worktree root-finding
- Sessions persist in memory; for cross-restart persistence, use the SessionManager (TB-O10)

## SessionManager (TB-O10)

The SessionManager provides higher-level session lifecycle management with Claude Code session ID support for resumable sessions and cross-restart persistence.

### Creating a SessionManager

```typescript
import {
  createSessionManager,
  createSpawnerService,
  type SessionManager,
} from '@elemental/orchestrator-sdk';

// SessionManager wraps SpawnerService and integrates with AgentRegistry
const spawner = createSpawnerService({ /* config */ });
const sessionManager = createSessionManager(spawner, api, agentRegistry);
```

### Starting Sessions

```typescript
// Start a new session for an agent
const { session, events } = await sessionManager.startSession(agentId, {
  workingDirectory: '/path/to/worktree',
  worktree: '/worktrees/worker-1',
  initialPrompt: 'Please implement the feature',
  interactive: false,  // true for PTY mode
});

console.log(session.id);              // Internal session ID
console.log(session.claudeSessionId); // Claude Code session ID (for resume)
console.log(session.status);          // 'running'

// Listen for events
events.on('event', (event) => console.log(event));
events.on('status', (status) => console.log(`Status: ${status}`));
events.on('exit', (code, signal) => console.log(`Exited: ${code}`));
```

### Resuming Sessions

```typescript
// Resume a previous session using its Claude Code session ID
const { session, events, uwpCheck } = await sessionManager.resumeSession(agentId, {
  claudeSessionId: 'previous-claude-session-id',
  workingDirectory: '/path/to/worktree',
  resumePrompt: 'Continue where you left off',
});
```

### Session Recovery with UWP (TB-O10a)

When resuming a session, the SessionManager implements the Universal Work Principle (UWP): before continuing with the previous context, it checks if any tasks were assigned during suspension.

```typescript
import type { UWPTaskInfo, ResumeUWPCheckResult } from '@elemental/orchestrator-sdk';

// Define callback to get ready tasks (integrates with TaskAssignmentService)
const getReadyTasks = async (agentId: EntityId, limit: number): Promise<UWPTaskInfo[]> => {
  const assignments = await assignmentService.getAgentTasks(agentId, {
    taskStatus: ['open', 'in_progress'],
  });
  return assignments.slice(0, limit).map(a => ({
    id: a.task.id,
    title: a.task.title,
    priority: a.task.priority,
    status: a.task.status,
  }));
};

// Resume with UWP check enabled (default)
const { session, events, uwpCheck } = await sessionManager.resumeSession(agentId, {
  claudeSessionId: 'previous-session-id',
  checkReadyQueue: true,  // Default - checks for assigned tasks before resuming
  getReadyTasks,          // Callback to query ready tasks
  resumePrompt: 'Continue where you left off',
});

// Check UWP result
if (uwpCheck?.hasReadyTask) {
  console.log(`Task found: ${uwpCheck.taskTitle} (${uwpCheck.taskId})`);
  console.log('Session will process this task before continuing');
  // The resume prompt is automatically prepended with task instructions
}

// Disable UWP check if needed
const { session: session2 } = await sessionManager.resumeSession(agentId, {
  claudeSessionId: 'session-id',
  checkReadyQueue: false, // Skip UWP check, resume normally
});
```

#### ResumeUWPCheckResult Type

```typescript
interface ResumeUWPCheckResult {
  hasReadyTask: boolean;      // Whether a task was found
  taskId?: string;            // Task ID if found
  taskTitle?: string;         // Task title if found
  taskPriority?: number;      // Task priority if found
  shouldProcessFirst: boolean; // Whether task instructions were prepended
}
```

**How it works:**
1. When `checkReadyQueue` is true (default), the manager calls `getReadyTasks(agentId, 1)` before spawning
2. If a task is found, it builds a task prompt with instructions to process it first
3. The task prompt is prepended to any `resumePrompt` provided
4. The `uwpCheck` in the result indicates what was found and whether task instructions were added

### Stopping and Suspending Sessions

```typescript
// Stop a session (terminate)
await sessionManager.stopSession(sessionId, {
  graceful: true,     // SIGTERM then SIGKILL
  reason: 'Task completed',
});

// Suspend a session (can be resumed later)
await sessionManager.suspendSession(sessionId, 'Context overflow');
// Claude session ID is preserved in agent metadata for later resume
```

### Session Queries

```typescript
// Get session by internal ID
const session = sessionManager.getSession(sessionId);

// Get active session for an agent
const activeSession = sessionManager.getActiveSession(agentId);

// List sessions with filters
const sessions = sessionManager.listSessions({
  agentId,                           // Filter by agent
  role: 'worker',                    // Filter by role
  status: ['running', 'suspended'],  // Filter by status
  resumable: true,                   // Only sessions with Claude session ID
});

// Get most recent resumable session
const resumable = sessionManager.getMostRecentResumableSession(agentId);
```

### Session History

```typescript
// Get session history for an agent (stored in agent metadata)
const history = await sessionManager.getSessionHistory(agentId, 10);

for (const entry of history) {
  console.log(`${entry.id}: ${entry.status} (${entry.startedAt} - ${entry.endedAt})`);
}
```

### Role-based Session History (TB-O10c)

The SessionManager provides role-based session history queries, enabling predecessor queries across all agents with the same role.

```typescript
import type { RoleSessionHistoryEntry } from '@elemental/orchestrator-sdk';

// Get session history for all agents with a specific role
const workerHistory = await sessionManager.getSessionHistoryByRole('worker', 20);
const directorHistory = await sessionManager.getSessionHistoryByRole('director');

for (const entry of workerHistory) {
  console.log(`${entry.agentName}: ${entry.status} (role: ${entry.role})`);
  console.log(`  Started: ${entry.startedAt}, Ended: ${entry.endedAt}`);
  if (entry.claudeSessionId) {
    console.log(`  Can resume: ${entry.claudeSessionId}`);
  }
}
```

#### Get Previous Session for Role

Find the most recent ended (suspended or terminated) session for a role:

```typescript
// Get the most recent previous session for a role
const previousWorker = await sessionManager.getPreviousSession('worker');
const previousDirector = await sessionManager.getPreviousSession('director');

if (previousWorker) {
  console.log(`Previous worker session: ${previousWorker.agentName}`);
  console.log(`  Session ID: ${previousWorker.claudeSessionId}`);
  console.log(`  Status: ${previousWorker.status}`);
  console.log(`  Ended: ${previousWorker.endedAt}`);

  // This session can be consulted for predecessor queries (TB-O10d)
  // or resumed if needed
}
```

#### RoleSessionHistoryEntry Type

```typescript
interface RoleSessionHistoryEntry extends SessionHistoryEntry {
  /** Agent role for this session */
  readonly role: AgentRole;
  /** Agent entity ID */
  readonly agentId: EntityId;
  /** Agent name at time of session */
  readonly agentName?: string;
}

interface SessionHistoryEntry {
  /** Internal session ID */
  readonly id: string;
  /** Claude Code session ID */
  readonly claudeSessionId?: string;
  /** Session status when entry was created */
  readonly status: SessionStatus;
  /** Working directory */
  readonly workingDirectory: string;
  /** Worktree path */
  readonly worktree?: string;
  /** Session started timestamp */
  readonly startedAt?: Timestamp;
  /** Session ended timestamp */
  readonly endedAt?: Timestamp;
  /** Termination reason */
  readonly terminationReason?: string;
}
```

#### Session History Persistence

Session history is automatically persisted to agent entity metadata when sessions end or are persisted:

```typescript
// Session history is stored under metadata.agent.sessionHistory
// Persisted automatically on stop/suspend, or manually:
await sessionManager.persistSession(sessionId);

// Loaded on startup:
await sessionManager.loadSessionState(agentId);
```

The history is limited to 20 entries per agent to avoid metadata bloat. Role-based queries aggregate history from all agents with the specified role.

### Session Communication

```typescript
// Send a message to a running session via its agent channel
const result = await sessionManager.messageSession(sessionId, {
  content: 'Please provide a status update',
  senderId: directorAgentId,
  metadata: { urgent: true },
});

if (result.success) {
  console.log(`Message sent: ${result.messageId}`);
}
```

### Session Events

The session's event emitter provides:

| Event | Description | Payload |
|-------|-------------|---------|
| `event` | Parsed stream-json event | `SpawnedSessionEvent` |
| `status` | Session status change | `SessionStatus` |
| `error` | Session error | `Error` |
| `exit` | Process exit | `(code, signal)` |
| `stderr` | stderr output | `Buffer` |
| `raw` | Raw stdout data | `Buffer` |

### Session Record

```typescript
interface SessionRecord {
  id: string;                    // Internal session ID
  claudeSessionId?: string;      // Claude Code session ID (for resume)
  agentId: EntityId;             // Agent entity ID
  agentRole: AgentRole;          // 'director' | 'worker' | 'steward'
  workerMode?: WorkerMode;       // 'ephemeral' | 'persistent'
  pid?: number;                  // Process ID (if running)
  status: SessionStatus;         // Session state
  workingDirectory: string;      // Working directory
  worktree?: string;             // Git worktree path
  createdAt: Timestamp;          // When session was created
  startedAt?: Timestamp;         // When running state entered
  lastActivityAt: Timestamp;     // Last activity timestamp
  endedAt?: Timestamp;           // When terminated/suspended
  terminationReason?: string;    // Reason for termination
}
```

### Persistence

Session state is automatically coordinated with the AgentRegistry:

```typescript
// Explicitly persist session state
await sessionManager.persistSession(sessionId);

// Load session state from database on startup
await sessionManager.loadSessionState(agentId);
```

### Notes

- SessionManager integrates SpawnerService, AgentRegistry, and ElementalAPI
- Agent session status is automatically updated in the registry
- Session history is stored in agent entity metadata for cross-restart persistence
- Each agent can only have one active session at a time

## InboxPollingService (TB-O10b)

The InboxPollingService provides periodic inbox checking for agent sessions, dispatching messages based on type.

### Creating an InboxPollingService

```typescript
import {
  createInboxPollingService,
  type InboxPollingService,
  type InboxPollingConfig,
} from '@elemental/orchestrator-sdk';
import { createInboxService } from '@elemental/sdk';

const inboxService = createInboxService(storage);
const pollingService = createInboxPollingService(inboxService, agentRegistry, {
  pollIntervalMs: 30000,        // Default: 30 seconds
  autoStart: true,               // Auto-start polling on session start
  autoMarkAsRead: true,          // Mark messages as read after processing
  maxMessagesPerPoll: 10,        // Max messages per poll cycle
  processOldestFirst: true,      // FIFO ordering
});
```

### Starting and Stopping Polling

```typescript
// Start polling for an agent
const events = pollingService.startPolling(agentId, {
  pollIntervalMs: 5000,  // Override default config
});

// Listen for poll events
events.on('poll', (result) => {
  console.log(`Polled ${result.totalFound} messages, processed ${result.processed}`);
});

events.on('error', (error) => {
  console.error('Polling error:', error);
});

// Stop polling for an agent
pollingService.stopPolling(agentId);

// Check if agent is being polled
pollingService.isPolling(agentId);

// Get all polling agents
const agents = pollingService.getPollingAgents();
```

### Immediate Polling

```typescript
// Poll immediately without waiting for interval
const result = await pollingService.pollNow(agentId);

console.log(`Found: ${result.totalFound}`);
console.log(`Processed: ${result.processed}`);
console.log(`Skipped: ${result.skipped}`);
console.log(`Duration: ${result.durationMs}ms`);

// Messages by type
console.log('Task assignments:', result.byType['task-assignment']);
console.log('Status updates:', result.byType['status-update']);
```

### Message Handlers

```typescript
import { OrchestratorMessageType } from '@elemental/orchestrator-sdk';

// Register handler for specific message type
pollingService.onMessageType(
  OrchestratorMessageType.TASK_ASSIGNMENT,
  async (message, agentId) => {
    console.log(`Agent ${agentId} received task: ${message.item.messageId}`);
    // Process task assignment
  }
);

// Register handler for all messages
pollingService.onAnyMessage(async (message, agentId) => {
  console.log(`Agent ${agentId} received message of type ${message.messageType}`);
});

// Remove handlers
pollingService.offMessageType(OrchestratorMessageType.TASK_ASSIGNMENT, handler);
pollingService.offAnyMessage(anyHandler);
```

### Message Types

The following message types are defined for orchestrator inter-agent communication:

| Type | Description |
|------|-------------|
| `task-assignment` | New task assigned to the agent |
| `status-update` | Status update from another agent |
| `help-request` | Agent requesting assistance |
| `handoff` | Session handoff request |
| `health-check` | Health check ping from steward |
| `generic` | Generic message (no specific type) |

```typescript
import { OrchestratorMessageType } from '@elemental/orchestrator-sdk';

// Access message type constants
OrchestratorMessageType.TASK_ASSIGNMENT;  // 'task-assignment'
OrchestratorMessageType.STATUS_UPDATE;    // 'status-update'
OrchestratorMessageType.HELP_REQUEST;     // 'help-request'
OrchestratorMessageType.HANDOFF;          // 'handoff'
OrchestratorMessageType.HEALTH_CHECK;     // 'health-check'
OrchestratorMessageType.GENERIC;          // 'generic'
```

### Configuration

```typescript
interface InboxPollingConfig {
  pollIntervalMs?: number;      // Interval in ms (default: 30000, min: 1000, max: 300000)
  autoStart?: boolean;          // Auto-start on session start (default: true)
  autoMarkAsRead?: boolean;     // Mark messages as read (default: true)
  maxMessagesPerPoll?: number;  // Max messages per cycle (default: 10)
  processOldestFirst?: boolean; // FIFO ordering (default: true)
}

// Update default config
pollingService.setDefaultConfig({ pollIntervalMs: 10000 });

// Get current default config
const config = pollingService.getDefaultConfig();
```

### Polling State

```typescript
// Get polling state for an agent
const state = pollingService.getPollingState(agentId);
if (state) {
  console.log(`Polling: ${state.isPolling}`);
  console.log(`Last poll: ${state.lastPollAt}`);
  console.log(`Config: ${JSON.stringify(state.config)}`);
}
```

### Poll Result

```typescript
interface InboxPollResult {
  agentId: EntityId;                // Agent polled
  totalFound: number;               // Total unread messages found
  processed: number;                // Messages processed
  skipped: number;                  // Messages skipped (errors)
  byType: Record<OrchestratorMessageType, ProcessedInboxMessage[]>;
  polledAt: string;                 // Timestamp
  durationMs: number;               // Poll duration
}

interface ProcessedInboxMessage {
  item: InboxItem;                  // The inbox item
  messageType: OrchestratorMessageType;  // Parsed message type
  metadata?: Record<string, unknown>;    // Raw message metadata
  markedAsRead: boolean;            // Whether message was marked as read
}
```

### Cleanup

```typescript
// Dispose the service (stops all polling, clears handlers)
pollingService.dispose();
```

### Integration with SessionManager

The InboxPollingService can be integrated with SessionManager for automatic polling:

```typescript
// Integration is available but requires SessionManager event emission
pollingService.integrateWithSessionManager(sessionManager);

// Currently, you can manually start/stop polling on session events:
// When starting a session:
sessionManager.startSession(agentId, options);
pollingService.startPolling(agentId);

// When stopping a session:
sessionManager.stopSession(sessionId);
pollingService.stopPolling(agentId);
```

### Polling Constants

```typescript
import {
  DEFAULT_POLL_INTERVAL_MS,  // 30000 (30 seconds)
  MIN_POLL_INTERVAL_MS,      // 1000 (1 second)
  MAX_POLL_INTERVAL_MS,      // 300000 (5 minutes)
} from '@elemental/orchestrator-sdk';
```

## PredecessorQueryService (TB-O10d)

The PredecessorQueryService enables agents to consult previous sessions for context and guidance. It implements the predecessor query pattern for collaborative problem-solving between agents.

### Creating a PredecessorQueryService

```typescript
import {
  createPredecessorQueryService,
  type PredecessorQueryService,
} from '@elemental/orchestrator-sdk';

const predecessorService = createPredecessorQueryService(sessionManager);
```

### Checking for Predecessors

```typescript
// Check if a predecessor exists and can be queried
const hasPredecessor = await predecessorService.hasPredecessor('director');
const hasWorkerPredecessor = await predecessorService.hasPredecessor('worker');

// Get detailed predecessor information
const predecessorInfo = await predecessorService.getPredecessorInfo('director');

if (predecessorInfo) {
  console.log(`Previous director: ${predecessorInfo.agentName}`);
  console.log(`  Agent ID: ${predecessorInfo.agentId}`);
  console.log(`  Session ID: ${predecessorInfo.claudeSessionId}`);
  console.log(`  Last active: ${predecessorInfo.suspendedAt}`);
}
```

### Querying a Predecessor

The main method `consultPredecessor()` performs the full predecessor query flow:

1. Finds the most recent suspended/terminated session for the role
2. Resumes that session using Claude Code's `--resume` flag
3. Sends the provided message to the predecessor
4. Waits for and captures the response
5. Suspends the predecessor session again
6. Returns the response to the caller

```typescript
// Query the previous director for strategic context
const result = await predecessorService.consultPredecessor(
  currentAgentId,
  'director',
  'What was your approach to the authentication feature?',
  {
    timeout: 60000,             // Optional: max wait time (default: 60s)
    context: 'Working on auth feature',  // Optional: additional context
    workingDirectory: '/workspace',       // Optional: override working dir
    suspendAfterResponse: true,           // Default: true
  }
);

if (result.success) {
  console.log('Predecessor response:', result.response);
  console.log(`Query took ${result.durationMs}ms`);

  // Access predecessor info
  if (result.predecessor) {
    console.log(`Queried: ${result.predecessor.agentName}`);
    console.log(`Role: ${result.predecessor.role}`);
  }
} else {
  console.error('Query failed:', result.error);
}
```

### Query Options

```typescript
interface PredecessorQueryOptions {
  // Maximum time to wait for response (default: 60000ms)
  timeout?: number;

  // Whether to suspend predecessor after response (default: true)
  suspendAfterResponse?: boolean;

  // Additional context prepended to the message
  context?: string;

  // Override the predecessor's working directory
  workingDirectory?: string;
}
```

### Query Result

```typescript
interface PredecessorQueryResult {
  // Whether the query was successful
  success: boolean;

  // The response text from the predecessor
  response?: string;

  // Information about the predecessor session
  predecessor?: PredecessorInfo;

  // Error message if the query failed
  error?: string;

  // When the query completed
  completedAt: Timestamp;

  // Duration of the query in milliseconds
  durationMs: number;
}

interface PredecessorInfo {
  agentId: EntityId;
  agentName?: string;
  role: AgentRole;
  claudeSessionId: string;
  sessionId: string;
  workingDirectory: string;
  originalStartedAt?: Timestamp;
  suspendedAt?: Timestamp;
}
```

### Managing Active Queries

```typescript
// List all active predecessor queries
const activeQueries = predecessorService.listActiveQueries();

for (const query of activeQueries) {
  console.log(`Query ${query.id}:`);
  console.log(`  From: ${query.requestingAgentId}`);
  console.log(`  To role: ${query.targetRole}`);
  console.log(`  Status: ${query.status}`);
  console.log(`  Message: ${query.message}`);
}

// Get specific active query by ID
const query = predecessorService.getActiveQuery(queryId);

// Cancel an active query
await predecessorService.cancelQuery(queryId);
```

### Query Status

Active queries track their status through the lifecycle:

| Status | Description |
|--------|-------------|
| `pending` | Query initialized, not yet started |
| `resuming` | Resuming the predecessor session |
| `waiting_response` | Session resumed, waiting for response |
| `completed` | Response received successfully |
| `failed` | Query failed due to error |
| `timed_out` | Query timed out waiting for response |

### Error Handling

```typescript
import {
  TimeoutError,
  NoPredecessorError,
} from '@elemental/orchestrator-sdk';

try {
  const result = await predecessorService.consultPredecessor(
    agentId,
    'steward',
    'What was the last cleanup operation?',
    { timeout: 10000 }
  );
} catch (error) {
  if (error instanceof TimeoutError) {
    console.error('Query timed out - predecessor may be unresponsive');
  } else if (error instanceof NoPredecessorError) {
    console.error('No previous steward session exists');
  }
}

// Alternatively, check result.success
const result = await predecessorService.consultPredecessor(/* ... */);
if (!result.success) {
  // result.error contains the error message
  console.error(result.error);
}
```

### Timeout Configuration

```typescript
import {
  DEFAULT_QUERY_TIMEOUT_MS,  // 60000 (60 seconds)
  MIN_QUERY_TIMEOUT_MS,      // 10000 (10 seconds)
  MAX_QUERY_TIMEOUT_MS,      // 300000 (5 minutes)
} from '@elemental/orchestrator-sdk';
```

### Use Cases

**Worker consulting previous worker:**
```typescript
// A new worker asking about implementation approach
const result = await predecessorService.consultPredecessor(
  currentWorkerId,
  'worker',
  'How did you structure the database migrations? I need to add a new table.',
  { context: 'Working on user preferences feature' }
);
```

**Director consulting previous director:**
```typescript
// A new director asking about project strategy
const result = await predecessorService.consultPredecessor(
  currentDirectorId,
  'director',
  'What tasks were prioritized and why? What is the current sprint focus?'
);
```

**Steward consulting previous steward:**
```typescript
// A steward asking about operational context
const result = await predecessorService.consultPredecessor(
  currentStewardId,
  'steward',
  'What maintenance tasks have been completed recently? Any issues I should be aware of?'
);
```

### Integration with Session History

The PredecessorQueryService builds on the session history features from TB-O10c:

```typescript
// The service uses getPreviousSession internally
// You can also query session history directly:
const history = await sessionManager.getSessionHistoryByRole('worker', 10);
const previous = await sessionManager.getPreviousSession('worker');
```

### Notes

- Predecessors must have a Claude session ID to be resumable
- The predecessor session is suspended after the query by default
- Query timeout is normalized between 10 seconds and 5 minutes
- Active queries are automatically cleaned up after completion
- Context is prepended to the message in the format: `Context: {context}\n\nQuestion: {message}`

## HandoffService (TB-O10e, TB-O10f)

The HandoffService enables agent session handoffs for context preservation. Agents can hand off to a fresh instance of themselves (self-handoff) or to another agent (agent-to-agent handoff).

### Creating a HandoffService

```typescript
import {
  createHandoffService,
  type HandoffService,
} from '@elemental/orchestrator-sdk';

const handoffService = createHandoffService(sessionManager, agentRegistry, api);
```

### Self-Handoff (TB-O10e)

Self-handoff allows an agent to hand off to a fresh instance of itself, preserving context through a handoff message. This is useful when:

- Context window is getting full
- Agent needs to restart with fresh state
- Transitioning between phases of work

```typescript
import { type SelfHandoffOptions, type SelfHandoffResult } from '@elemental/orchestrator-sdk';

// Perform a self-handoff
const result = await handoffService.selfHandoff(agentId, sessionId, {
  contextSummary: 'Working on feature X, completed steps 1-3, step 4 in progress',
  nextSteps: 'Continue with step 4: implement the API endpoint',
  reason: 'Context overflow',
  metadata: { phase: 'implementation' },
});

if (result.success) {
  console.log(`Handoff document: ${result.handoffDocumentId}`);
  console.log(`Message sent: ${result.messageId}`);
  console.log(`Session suspended: ${result.suspendedSession?.id}`);
} else {
  console.error('Handoff failed:', result.error);
}
```

**What happens during self-handoff:**
1. Creates a handoff document with context summary, next steps, and Claude session ID
2. Sends a handoff message to the agent's own channel
3. Suspends the current session (preserving Claude session ID for predecessor queries)
4. Returns the result with document ID, message ID, and suspended session info

The new session can:
- Find the handoff message in its inbox
- Query the suspended predecessor for more context using PredecessorQueryService

### Agent-to-Agent Handoff (TB-O10f)

Agent-to-agent handoff allows transferring work from one agent to another:

```typescript
import { type AgentHandoffOptions, type AgentHandoffResult } from '@elemental/orchestrator-sdk';

// Hand off to another agent
const result = await handoffService.handoffToAgent(
  fromAgentId,
  toAgentId,
  sessionId,
  {
    contextSummary: 'Database schema designed, ready for implementation',
    nextSteps: 'Implement migrations and model layer',
    reason: 'Backend specialist needed',
    taskIds: ['task-001', 'task-002'],  // Tasks to transfer
    metadata: { priority: 'high' },
    triggerTarget: true,  // Signal target agent to wake up
  }
);

if (result.success) {
  console.log(`Handed off to: ${result.targetAgentId}`);
  console.log(`Message sent to target: ${result.messageId}`);
}
```

**What happens during agent-to-agent handoff:**
1. Creates a handoff document with context, task IDs, and source session info
2. Sends a handoff message to the target agent's channel
3. Suspends the source agent's session
4. (Optional) Could trigger the target agent to wake up (requires notification integration)

### Checking for Pending Handoffs

When an agent starts or resumes, it can check for pending handoff messages:

```typescript
// Check if there's a pending handoff
const hasPending = await handoffService.hasPendingHandoff(agentId);

// Get the most recent handoff content
const handoff = await handoffService.getLastHandoff(agentId);

if (handoff) {
  console.log(`Handoff from: ${handoff.fromAgentId}`);
  console.log(`Context: ${handoff.contextSummary}`);
  console.log(`Next steps: ${handoff.nextSteps}`);
  console.log(`Reason: ${handoff.reason}`);

  if (handoff.taskIds) {
    console.log(`Tasks to pick up: ${handoff.taskIds.join(', ')}`);
  }

  // Can query predecessor for more context
  if (handoff.claudeSessionId) {
    const queryResult = await predecessorService.consultPredecessor(
      agentId,
      'worker',  // or appropriate role
      'What was the specific blocker you encountered?'
    );
  }
}
```

### Handoff Types

```typescript
interface SelfHandoffOptions {
  contextSummary: string;              // Required: summary of current context
  nextSteps?: string;                   // Recommended next steps
  reason?: string;                      // Reason for handoff
  metadata?: Record<string, unknown>;   // Additional metadata
}

interface AgentHandoffOptions {
  contextSummary: string;              // Required: summary of current context
  nextSteps?: string;                   // Recommended next steps for target
  reason?: string;                      // Reason for handoff
  taskIds?: string[];                   // Task IDs to transfer
  metadata?: Record<string, unknown>;   // Additional metadata
  triggerTarget?: boolean;              // Signal target to wake up (default: true)
}

interface HandoffContent {
  type: 'handoff';                     // Message type identifier
  fromAgentId: EntityId;               // Source agent
  toAgentId?: EntityId;                // Target agent (undefined for self-handoff)
  contextSummary: string;              // Context summary
  nextSteps?: string;                  // Next steps
  reason?: string;                     // Handoff reason
  taskIds?: string[];                  // Transferred task IDs
  claudeSessionId?: string;            // Claude session ID for predecessor query
  initiatedAt: Timestamp;              // When handoff was initiated
}
```

### Handoff Results

```typescript
interface SelfHandoffResult {
  success: boolean;
  handoffDocumentId?: DocumentId;      // Created handoff document
  messageId?: MessageId;               // Message sent to channel
  suspendedSession?: SessionRecord;    // The suspended session
  error?: string;                      // Error message if failed
  completedAt: Timestamp;
}

interface AgentHandoffResult {
  success: boolean;
  handoffDocumentId?: DocumentId;      // Created handoff document
  messageId?: MessageId;               // Message sent to target channel
  suspendedSession?: SessionRecord;    // Source session (suspended)
  targetAgentId?: EntityId;            // Target agent ID
  error?: string;                      // Error message if failed
  completedAt: Timestamp;
}
```

### Constants

```typescript
import {
  HANDOFF_DOCUMENT_TAG,   // 'handoff' - tag for handoff documents
  HANDOFF_MESSAGE_TYPE,   // 'handoff' - message type for handoff messages
} from '@elemental/orchestrator-sdk';
```

### Integration with Other Services

**With InboxPollingService:**
```typescript
// Register handler for handoff messages
pollingService.onMessageType(
  OrchestratorMessageType.HANDOFF,
  async (message, agentId) => {
    const handoff = await handoffService.getLastHandoff(agentId);
    if (handoff) {
      console.log(`Processing handoff from ${handoff.fromAgentId}`);
      // Process handoff - pick up tasks, apply context, etc.
    }
  }
);
```

**With PredecessorQueryService:**
```typescript
// After receiving handoff, query predecessor for more context
const handoff = await handoffService.getLastHandoff(agentId);
if (handoff?.claudeSessionId) {
  const result = await predecessorService.consultPredecessor(
    agentId,
    'worker',
    'Can you elaborate on the authentication implementation?',
    { context: handoff.contextSummary }
  );
}
```

### Error Handling

Self-handoff can fail for several reasons:

```typescript
const result = await handoffService.selfHandoff(agentId, sessionId, options);

if (!result.success) {
  switch (true) {
    case result.error?.includes('Session not found'):
      console.error('Invalid session ID');
      break;
    case result.error?.includes('does not belong to agent'):
      console.error('Session belongs to a different agent');
      break;
    case result.error?.includes('Cannot handoff session in status'):
      console.error('Session is not running (already suspended or terminated)');
      break;
    case result.error?.includes('has no channel'):
      console.error('Agent does not have a messaging channel');
      break;
    default:
      console.error('Unexpected error:', result.error);
  }
}
```

### Use Cases

**Context Overflow Recovery:**
```typescript
// When context window is getting full
await handoffService.selfHandoff(agentId, sessionId, {
  contextSummary: `
    Implementing auth feature:
    - Created user model
    - Set up JWT tokens
    - Working on login endpoint
  `,
  nextSteps: 'Complete login endpoint validation and error handling',
  reason: 'Context overflow - approaching token limit',
});
```

**Specialist Handoff:**
```typescript
// Frontend agent handing off to backend specialist
await handoffService.handoffToAgent(frontendAgentId, backendAgentId, sessionId, {
  contextSummary: 'API contract defined, frontend components ready for data',
  nextSteps: 'Implement backend endpoints matching the API contract',
  taskIds: ['task-backend-api'],
  reason: 'Backend expertise required',
});
```

**Shift Change:**
```typescript
// End of work period, handing off to next agent
await handoffService.selfHandoff(agentId, sessionId, {
  contextSummary: `
    Sprint progress:
    - Completed: task-001, task-002
    - In progress: task-003 (50% done)
    - Blocked: task-004 (waiting on design review)
  `,
  nextSteps: 'Continue task-003, follow up on task-004 blocker',
  reason: 'Session time limit reached',
});
```

### Notes

- Handoff is a manual operation - agents decide when to hand off
- Handoff documents are stored persistently for audit trail
- Messages are sent through the existing channel/inbox system
- Claude session ID is preserved for predecessor queries
- The source session is suspended (not terminated) to allow predecessor queries

## WorktreeManager (TB-O11)

The WorktreeManager provides git worktree operations for the orchestration system. Each worker agent gets a dedicated git worktree for true parallel development.

### Creating a WorktreeManager

```typescript
import {
  createWorktreeManager,
  type WorktreeManager,
  type WorktreeManagerConfig,
} from '@elemental/orchestrator-sdk';

const worktreeManager = createWorktreeManager({
  workspaceRoot: '/path/to/project',      // Must be a git repository
  worktreeDir: '.worktrees',               // Default: '.worktrees'
  defaultBaseBranch: 'main',               // Default: auto-detected
});

// Initialize workspace (verifies git repo, creates worktree directory)
await worktreeManager.initWorkspace();

// Check if initialized
worktreeManager.isInitialized();  // true

// Get workspace root
worktreeManager.getWorkspaceRoot();  // '/path/to/project'
```

### Creating Worktrees

Worktrees are created with auto-generated branch names and paths:

```typescript
import type { CreateWorktreeOptions, CreateWorktreeResult } from '@elemental/orchestrator-sdk';

// Create worktree for a worker
const result = await worktreeManager.createWorktree({
  agentName: 'alice',
  taskId: 'task-123',
  taskTitle: 'Implement Feature',        // Optional: used for slug
  baseBranch: 'main',                     // Optional: default branch
  trackRemote: true,                      // Optional: set up tracking
});

console.log(result.branch);        // 'agent/alice/task-123-implement-feature'
console.log(result.path);          // '/path/to/project/.worktrees/alice-implement-feature'
console.log(result.branchCreated); // true (false if branch already existed)
console.log(result.worktree.state); // 'active'

// Create with custom branch and path
const custom = await worktreeManager.createWorktree({
  agentName: 'bob',
  taskId: 'task-456',
  customBranch: 'feature/custom-branch',
  customPath: '.worktrees/custom-path',
});
```

### Naming Conventions

Branches and worktree paths follow predictable naming conventions:

- **Branch naming**: `agent/{worker-name}/{task-id}-{slug}`
- **Worktree path**: `.worktrees/{worker-name}-{task-slug}/`

```typescript
import {
  generateBranchName,
  generateWorktreePath,
  createSlugFromTitle,
} from '@elemental/orchestrator-sdk';

// Generate branch name
const branch = generateBranchName('alice', 'task-123', 'implement-feature');
// 'agent/alice/task-123-implement-feature'

// Generate worktree path
const wtPath = generateWorktreePath('alice', 'implement-feature');
// '.worktrees/alice-implement-feature'

// Create slug from title
const slug = createSlugFromTitle('Implement Feature!');
// 'implement-feature'
```

### Removing Worktrees

```typescript
import type { RemoveWorktreeOptions } from '@elemental/orchestrator-sdk';

// Remove worktree (keeps branch)
await worktreeManager.removeWorktree('.worktrees/alice-feature');

// Remove worktree and delete branch
await worktreeManager.removeWorktree('.worktrees/alice-feature', {
  deleteBranch: true,
  forceBranchDelete: true,  // Delete even if not fully merged
});

// Force remove (even with uncommitted changes)
await worktreeManager.removeWorktree('.worktrees/alice-feature', {
  force: true,
});
```

### Suspending and Resuming Worktrees

```typescript
// Suspend a worktree (marks inactive but preserves it)
await worktreeManager.suspendWorktree('.worktrees/alice-feature');

// Resume a suspended worktree
await worktreeManager.resumeWorktree('.worktrees/alice-feature');
```

### Querying Worktrees

```typescript
import type { WorktreeInfo } from '@elemental/orchestrator-sdk';

// List all worktrees (excluding main)
const worktrees = await worktreeManager.listWorktrees();

// List all worktrees (including main)
const allWorktrees = await worktreeManager.listWorktrees(true);

// Get specific worktree
const worktree = await worktreeManager.getWorktree('.worktrees/alice-feature');

// Get worktree path for an agent/task
const path = worktreeManager.getWorktreePath('alice', 'Feature Task');

// Get worktrees for a specific agent
const aliceWorktrees = await worktreeManager.getWorktreesForAgent('alice');

// Check if worktree exists
const exists = await worktreeManager.worktreeExists('.worktrees/alice-feature');
```

### WorktreeInfo

```typescript
interface WorktreeInfo {
  path: string;           // Full absolute path
  relativePath: string;   // Relative to workspace root
  branch: string;         // Branch checked out
  head: string;           // HEAD commit hash
  isMain: boolean;        // Whether this is the main worktree
  state: WorktreeState;   // Lifecycle state
  agentName?: string;     // Agent name (if parseable from path)
  taskId?: string;        // Task ID (if parseable from branch)
  createdAt?: Timestamp;  // When created (if tracked)
}
```

### Branch Operations

```typescript
// Get current branch of main worktree
const currentBranch = await worktreeManager.getCurrentBranch();

// Get default branch (main, master, etc.)
const defaultBranch = await worktreeManager.getDefaultBranch();

// Check if branch exists
const exists = await worktreeManager.branchExists('feature/my-branch');
```

### Worktree Lifecycle States

Worktrees follow a state machine:

| State | Description | Valid Transitions |
|-------|-------------|-------------------|
| `creating` | Being created | active, cleaning |
| `active` | Active and in use | suspended, merging, cleaning |
| `suspended` | Suspended (can be resumed) | active, cleaning |
| `merging` | Branch being merged | archived, cleaning, active |
| `cleaning` | Being cleaned up | archived |
| `archived` | Archived (removed) | (none) |

```typescript
import {
  isWorktreeState,
  isValidStateTransition,
  getWorktreeStateDescription,
} from '@elemental/orchestrator-sdk';

isWorktreeState('active');                    // true
isValidStateTransition('active', 'suspended'); // true
getWorktreeStateDescription('suspended');      // 'Suspended (can be resumed)'
```

### Error Handling

```typescript
import {
  GitRepositoryNotFoundError,
  WorktreeError,
} from '@elemental/orchestrator-sdk';

try {
  await worktreeManager.initWorkspace();
} catch (error) {
  if (error instanceof GitRepositoryNotFoundError) {
    // No git repository found
    console.error(error.message);
    // "Git repository not found at /path/to/project.
    //  Please initialize a git repository first:
    //    cd /path/to/project
    //    git init
    //    ..."
  }
}

try {
  await worktreeManager.createWorktree({ agentName: 'alice', taskId: 'task-1' });
} catch (error) {
  if (error instanceof WorktreeError) {
    console.error(`Error: ${error.message}`);
    console.error(`Code: ${error.code}`);      // 'WORKTREE_EXISTS', 'NOT_INITIALIZED', etc.
    console.error(`Details: ${error.details}`); // Additional error info
  }
}
```

### Error Codes

| Code | Description |
|------|-------------|
| `NOT_INITIALIZED` | WorktreeManager not initialized |
| `WORKTREE_EXISTS` | Worktree already exists at path |
| `WORKTREE_NOT_FOUND` | Worktree not found |
| `CANNOT_REMOVE_MAIN` | Cannot remove the main worktree |
| `INVALID_STATE_TRANSITION` | Invalid worktree state transition |
| `WORKTREE_INFO_FAILED` | Failed to get worktree info |
| `LIST_FAILED` | Failed to list worktrees |
| `REMOVE_FAILED` | Failed to remove worktree |
| `BRANCH_DELETE_FAILED` | Failed to delete branch |
| `BRANCH_QUERY_FAILED` | Failed to query branch |

### Notes

- **Git Repository Required**: The orchestrator requires an existing git repository. If no repo is found, `initWorkspace()` throws `GitRepositoryNotFoundError` with setup instructions.
- **ELEMENTAL_ROOT**: Agents spawned in worktrees use the `ELEMENTAL_ROOT` environment variable to find the main workspace's `.elemental` directory.
- **Gitignore**: The worktree directory is automatically added to `.gitignore` during initialization.
- **Symlinks**: The manager handles filesystem symlinks (like `/tmp` → `/private/tmp` on macOS) correctly.
- **State Persistence**: Worktree states are tracked in memory; for cross-restart persistence, use orchestrator task metadata.

## Type Definitions

Key files:
- `packages/orchestrator-sdk/src/types/agent.ts` - Agent and capability types
- `packages/orchestrator-sdk/src/types/task-meta.ts` - Task orchestrator metadata
- `packages/orchestrator-sdk/src/services/capability-service.ts` - Capability matching
- `packages/orchestrator-sdk/src/services/agent-registry.ts` - Agent registration and channel management
- `packages/orchestrator-sdk/src/services/task-assignment-service.ts` - Task assignment and workload management
- `packages/orchestrator-sdk/src/services/dispatch-service.ts` - Task dispatch with assignment + notification
- `packages/orchestrator-sdk/src/runtime/spawner.ts` - Claude Code process spawning (TB-O9)
- `packages/orchestrator-sdk/src/runtime/session-manager.ts` - Session lifecycle management (TB-O10)
- `packages/orchestrator-sdk/src/runtime/inbox-polling.ts` - Inbox polling service (TB-O10b)
- `packages/orchestrator-sdk/src/runtime/predecessor-query.ts` - Predecessor query service (TB-O10d)
- `packages/orchestrator-sdk/src/runtime/handoff.ts` - Handoff service (TB-O10e, TB-O10f)
- `packages/orchestrator-sdk/src/git/worktree-manager.ts` - Git worktree management (TB-O11)

## See Also

- [ElementalAPI](elemental-api.md) - Base API documentation
- [Storage](../core/storage.md) - Storage layer
- [STAGE_2_PLAN.md](../../specs/STAGE_2_PLAN.md) - Implementation roadmap

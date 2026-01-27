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

## Message Types (TB-O14a)

The orchestrator-sdk defines typed message conventions for inter-agent communication. These types extend the base Elemental messaging system with orchestrator-specific semantics.

### Message Type Constants

```typescript
import {
  MessageTypeValue,
  AllMessageTypes,
} from '@elemental/orchestrator-sdk';

// Access message type constants
MessageTypeValue.TASK_ASSIGNMENT;  // 'task-assignment'
MessageTypeValue.STATUS_UPDATE;    // 'status-update'
MessageTypeValue.HELP_REQUEST;     // 'help-request'
MessageTypeValue.HANDOFF;          // 'handoff'
MessageTypeValue.HEALTH_CHECK;     // 'health-check'
MessageTypeValue.GENERIC;          // 'generic'

// Iterate over all types
AllMessageTypes.forEach(type => console.log(type));
```

### Task Assignment Message

Sent when a task is assigned to an agent:

```typescript
import {
  createTaskAssignmentMessage,
  isTaskAssignmentMessage,
  type TaskAssignmentMessage,
} from '@elemental/orchestrator-sdk';

// Create a task assignment message
const message = createTaskAssignmentMessage({
  taskId: 'el-task001',
  taskTitle: 'Implement feature X',
  priority: 1,
  assignedBy: directorId,
  branch: 'agent/alice/task-001-feature',
  worktree: '.worktrees/alice-feature',
  isReassignment: false,
});

// Validate a message
if (isTaskAssignmentMessage(rawMessage)) {
  console.log(`Task: ${rawMessage.taskTitle}`);
}
```

### Status Update Message

Sent for progress updates:

```typescript
import {
  createStatusUpdateMessage,
  isStatusUpdateMessage,
  StatusUpdateSeverity,
} from '@elemental/orchestrator-sdk';

const message = createStatusUpdateMessage({
  agentId: workerId,
  message: 'Completed step 3 of 5',
  severity: StatusUpdateSeverity.INFO,
  taskId: 'el-task001',
  progress: 60,
  phase: 'implementation',
});
```

### Help Request Message

Sent when an agent needs assistance:

```typescript
import {
  createHelpRequestMessage,
  isHelpRequestMessage,
  HelpRequestUrgency,
} from '@elemental/orchestrator-sdk';

const message = createHelpRequestMessage({
  agentId: workerId,
  problem: 'Cannot resolve merge conflict in auth module',
  attemptedSolutions: ['Tried rebasing', 'Checked docs'],
  taskId: 'el-task001',
  urgency: HelpRequestUrgency.HIGH,
  errorMessage: 'CONFLICT (content): Merge conflict in auth.ts',
  suggestedActions: ['Review conflicting changes', 'Consult team lead'],
});
```

### Handoff Message

Sent for session handoff between agents (extends the HandoffService types):

```typescript
import {
  createHandoffMessage,
  isHandoffMessage,
  type HandoffMessage,
} from '@elemental/orchestrator-sdk';

const message = createHandoffMessage({
  fromAgent: currentAgentId,
  toAgent: targetAgentId,  // undefined for self-handoff
  taskIds: ['task-001', 'task-002'],
  contextSummary: 'Completed steps 1-3, step 4 in progress',
  nextSteps: 'Continue with step 4',
  reason: 'Context overflow',
  claudeSessionId: 'session-123',
  handoffDocumentId: 'doc-456',
});

// Self-handoff (toAgent is undefined)
const selfHandoff = createHandoffMessage({
  fromAgent: agentId,
  taskIds: [],
  contextSummary: 'Need fresh context',
});
console.log(selfHandoff.isSelfHandoff);  // true
```

### Health Check Message

Sent for health monitoring:

```typescript
import {
  createHealthCheckRequest,
  createHealthCheckResponse,
  isHealthCheckMessage,
  HealthCheckStatus,
} from '@elemental/orchestrator-sdk';

// Create a health check request
const request = createHealthCheckRequest({
  targetAgentId: workerId,
  sourceAgentId: stewardId,
});

// Create a health check response
const response = createHealthCheckResponse({
  targetAgentId: workerId,
  sourceAgentId: stewardId,
  status: HealthCheckStatus.HEALTHY,
  lastActivityAt: Date.now(),
  currentTaskId: 'el-task001',
  metrics: {
    memoryUsage: 50,
    cpuUsage: 25,
    timeSinceLastOutput: 5000,
    errorCount: 0,
  },
  correlationId: request.correlationId,
});
```

### Generic Message

For backwards compatibility or custom types:

```typescript
import {
  createGenericMessage,
  isGenericMessage,
} from '@elemental/orchestrator-sdk';

const message = createGenericMessage({
  content: 'Hello world',
  data: { custom: 'payload' },
});
```

### Validation Utilities

```typescript
import {
  isOrchestratorMessage,
  parseMessageMetadata,
  getMessageType,
  isMessageType,
} from '@elemental/orchestrator-sdk';

// Validate any orchestrator message
if (isOrchestratorMessage(rawData)) {
  switch (rawData.type) {
    case 'task-assignment':
      // Handle task assignment
      break;
    case 'handoff':
      // Handle handoff
      break;
  }
}

// Parse message from raw metadata
const parsed = parseMessageMetadata(rawMetadata);
if (parsed) {
  console.log(`Message type: ${parsed.type}`);
}

// Extract type from metadata
const type = getMessageType(metadata);
if (type) {
  console.log(`Type: ${type}`);
}

// Validate type value
if (isMessageType('task-assignment')) {
  // Valid type
}
```

### Severity and Urgency Constants

```typescript
import {
  StatusUpdateSeverity,
  HelpRequestUrgency,
  HealthCheckStatus,
} from '@elemental/orchestrator-sdk';

// Status update severity
StatusUpdateSeverity.INFO;      // 'info'
StatusUpdateSeverity.WARNING;   // 'warning'
StatusUpdateSeverity.ERROR;     // 'error'

// Help request urgency
HelpRequestUrgency.LOW;         // 'low'
HelpRequestUrgency.NORMAL;      // 'normal'
HelpRequestUrgency.HIGH;        // 'high'
HelpRequestUrgency.CRITICAL;    // 'critical'

// Health check status
HealthCheckStatus.HEALTHY;      // 'healthy'
HealthCheckStatus.DEGRADED;     // 'degraded'
HealthCheckStatus.UNHEALTHY;    // 'unhealthy'
HealthCheckStatus.UNKNOWN;      // 'unknown'
```

### Notes

- All messages include a `timestamp` (auto-generated if not provided)
- All messages support optional `correlationId` for tracking related messages
- Message types are designed to work with the InboxPollingService handlers
- The HandoffMessage type extends the HandoffContent from handoff.ts

## WorkerTaskService (TB-O20)

The WorkerTaskService orchestrates the complete workflow for workers picking up tasks and working in isolated worktrees. It combines dispatch, worktree creation, session spawning, and task context delivery into a unified API.

### Creating a WorkerTaskService

```typescript
import {
  createWorkerTaskService,
  type WorkerTaskService,
} from '@elemental/orchestrator-sdk';

const workerTaskService = createWorkerTaskService(
  api,                    // ElementalAPI
  taskAssignmentService,  // TaskAssignmentService
  agentRegistry,          // AgentRegistry
  dispatchService,        // DispatchService
  spawnerService,         // SpawnerService
  sessionManager,         // SessionManager
  worktreeManager,        // WorktreeManager (optional)
);
```

### Starting a Worker on a Task

This method performs the complete workflow:
1. Creates a worktree for the task (if worktrees enabled)
2. Dispatches the task to the worker (assigns + notifies)
3. Spawns the worker session in the worktree
4. Sends task context to the worker

```typescript
import type { StartWorkerOnTaskOptions, StartWorkerOnTaskResult } from '@elemental/orchestrator-sdk';

const result = await workerTaskService.startWorkerOnTask(taskId, workerId, {
  branch: 'custom-branch-name',       // Optional: auto-generated
  worktreePath: '/custom/path',       // Optional: auto-generated
  baseBranch: 'main',                 // Optional: default branch
  additionalPrompt: 'Focus on tests', // Optional: extra instructions
  priority: 5,                        // Optional: dispatch priority
  skipWorktree: false,                // Optional: skip worktree creation
  workingDirectory: '/path',          // Optional: custom cwd (if skipWorktree)
  performedBy: directorId,            // Optional: entity performing operation
});

// Result includes:
console.log(result.task);             // Updated task
console.log(result.agent);            // Worker agent
console.log(result.session);          // Session record
console.log(result.worktree);         // Worktree result (if created)
console.log(result.dispatch);         // Dispatch result
console.log(result.taskContextPrompt); // The prompt sent to worker
console.log(result.startedAt);        // Timestamp
```

### Completing a Task

Mark a task as completed and ready for merge:

```typescript
import type { CompleteTaskOptions, CompleteTaskResult } from '@elemental/orchestrator-sdk';

const result = await workerTaskService.completeTask(taskId, {
  summary: 'Implemented feature X with tests',  // Optional
  commitHash: 'abc123',                          // Optional: final commit
  performedBy: workerId,                         // Optional
});

// Result includes:
console.log(result.task);         // Completed task (status: closed)
console.log(result.worktree);     // Worktree info (if available)
console.log(result.readyForMerge); // true
console.log(result.completedAt);  // Timestamp
```

### Task Context

Get task context information or build a prompt for workers:

```typescript
// Get structured context
const context = await workerTaskService.getTaskContext(taskId);
console.log(context.taskId);
console.log(context.title);
console.log(context.description);
console.log(context.branch);
console.log(context.worktreePath);

// Build a formatted prompt
const prompt = await workerTaskService.buildTaskContextPrompt(taskId, 'Additional instructions');
// Returns formatted markdown with:
// - Task ID, title, description
// - Priority, complexity, tags
// - Git branch and working directory
// - Step-by-step instructions
// - CLI command for completion
```

### Cleaning Up

After a task is merged, clean up the worktree:

```typescript
// Clean up worktree (optionally delete branch)
const success = await workerTaskService.cleanupTask(taskId, true); // deleteBranch=true
```

### REST API Endpoints

The orchestrator-server exposes these endpoints:

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/tasks/:id/start-worker` | Start a worker on a task with worktree |
| POST | `/api/tasks/:id/complete` | Complete task, mark ready for merge |
| GET | `/api/tasks/:id/context` | Get task context and prompt |
| POST | `/api/tasks/:id/cleanup` | Clean up worktree after merge |

---

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
- `packages/orchestrator-sdk/src/types/message-types.ts` - Inter-agent message types (TB-O14a)
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
- `packages/orchestrator-sdk/src/services/steward-scheduler.ts` - Steward scheduler service (TB-O23)

## StewardScheduler (TB-O23)

The StewardScheduler service executes stewards on cron schedules or in response to events. It provides cron-based scheduling, event-triggered execution, condition evaluation, and execution history tracking.

### Creating a StewardScheduler

```typescript
import {
  createStewardScheduler,
  createDefaultStewardExecutor,
  type StewardScheduler,
  type StewardSchedulerConfig,
  type StewardExecutor,
} from '@elemental/orchestrator-sdk';

// Create an executor that runs stewards (customize for your environment)
const executor: StewardExecutor = async (stewardId, context) => {
  console.log(`Executing steward ${stewardId}`);
  // Your steward execution logic here
  return { success: true, message: 'Steward executed' };
};

// Or use the default executor (simple execution with logging)
const defaultExecutor = createDefaultStewardExecutor(sessionManager, spawnerService);

// Create the scheduler
const scheduler = createStewardScheduler(api, agentRegistry, executor, {
  checkIntervalMs: 60000,        // Cron check interval (default: 60s)
  maxHistoryEntries: 100,        // Max history entries (default: 100)
  enableCronScheduling: true,    // Enable cron scheduling (default: true)
  enableEventTriggers: true,     // Enable event triggers (default: true)
});
```

### Starting and Stopping

```typescript
// Start the scheduler (activates all cron jobs and event subscriptions)
scheduler.start();

// Stop the scheduler (deactivates all jobs and subscriptions)
scheduler.stop();

// Check if running
scheduler.isRunning();  // true/false
```

### Registering Stewards

```typescript
// Register a single steward (creates cron jobs and event subscriptions based on triggers)
const result = await scheduler.registerSteward(stewardId);
console.log(`Registered: ${result.jobs.length} cron jobs, ${result.subscriptions.length} event subscriptions`);

// Register all stewards in the system
const allResult = await scheduler.registerAllStewards();
console.log(`Registered ${allResult.registeredCount} stewards`);

// Unregister a steward (removes its cron jobs and event subscriptions)
const unregistered = await scheduler.unregisterSteward(stewardId);
console.log(`Unregistered: ${unregistered}`);
```

### Manual Execution

```typescript
// Manually execute a steward (useful for testing or on-demand execution)
const result = await scheduler.executeManually(stewardId, {
  triggerReason: 'manual',
  context: { requestedBy: 'admin' },
});

if (result.success) {
  console.log('Execution succeeded:', result.result);
} else {
  console.log('Execution failed:', result.error);
}
```

### Event Publishing

```typescript
// Publish an event to trigger event-based stewards
const triggered = await scheduler.publishEvent('task_completed', {
  taskId: 'task-123',
  status: 'done',
});
console.log(`Triggered ${triggered} stewards`);
```

### Querying Scheduled Jobs

```typescript
import type { ScheduledJobInfo } from '@elemental/orchestrator-sdk';

// Get all scheduled cron jobs
const jobs = scheduler.getScheduledJobs();

// Get jobs for a specific steward
const stewardJobs = scheduler.getScheduledJobs(stewardId);

for (const job of jobs) {
  console.log(`Job ${job.id}:`);
  console.log(`  Steward: ${job.stewardId}`);
  console.log(`  Schedule: ${job.schedule}`);
  console.log(`  Active: ${job.isActive}`);
  console.log(`  Next run: ${job.nextRun}`);
  console.log(`  Last run: ${job.lastRun}`);
}
```

### Querying Event Subscriptions

```typescript
import type { EventSubscriptionInfo } from '@elemental/orchestrator-sdk';

// Get all event subscriptions
const subscriptions = scheduler.getEventSubscriptions();

// Get subscriptions for a specific steward
const stewardSubs = scheduler.getEventSubscriptions(stewardId);

for (const sub of subscriptions) {
  console.log(`Subscription ${sub.id}:`);
  console.log(`  Steward: ${sub.stewardId}`);
  console.log(`  Event: ${sub.eventName}`);
  console.log(`  Condition: ${sub.condition || '(none)'}`);
  console.log(`  Active: ${sub.isActive}`);
}
```

### Execution History

```typescript
import type { StewardExecutionEntry, ExecutionHistoryFilter } from '@elemental/orchestrator-sdk';

// Get execution history (most recent first)
const history = scheduler.getExecutionHistory();

// Get history with filters
const filteredHistory = scheduler.getExecutionHistory({
  stewardId: 'steward-123',           // Filter by steward
  triggerType: 'cron',                 // 'cron' | 'event' | 'manual'
  success: true,                       // Filter by success/failure
  limit: 50,                           // Max entries to return
});

for (const entry of history) {
  console.log(`Execution ${entry.id}:`);
  console.log(`  Steward: ${entry.stewardId}`);
  console.log(`  Trigger: ${entry.triggerType}`);
  console.log(`  Success: ${entry.success}`);
  console.log(`  Started: ${entry.startedAt}`);
  console.log(`  Duration: ${entry.durationMs}ms`);
  if (entry.eventData) {
    console.log(`  Event: ${entry.eventData.eventName}`);
  }
}

// Get last execution for a steward
const lastExecution = scheduler.getLastExecution(stewardId);
```

### Scheduler Statistics

```typescript
import type { StewardSchedulerStats } from '@elemental/orchestrator-sdk';

const stats = scheduler.getStats();
console.log(`Registered stewards: ${stats.registeredStewards}`);
console.log(`Active cron jobs: ${stats.activeCronJobs}`);
console.log(`Active event subscriptions: ${stats.activeEventSubscriptions}`);
console.log(`Total executions: ${stats.totalExecutions}`);
console.log(`Successful executions: ${stats.successfulExecutions}`);
console.log(`Failed executions: ${stats.failedExecutions}`);
```

### Scheduler Events

The scheduler emits events for monitoring:

```typescript
// Listen for execution events
scheduler.on('execution:started', (entry) => {
  console.log(`Steward ${entry.stewardId} execution started`);
});

scheduler.on('execution:completed', (entry) => {
  console.log(`Steward ${entry.stewardId} completed in ${entry.durationMs}ms`);
});

scheduler.on('execution:failed', (entry) => {
  console.error(`Steward ${entry.stewardId} failed: ${entry.error}`);
});

// Listen for scheduler lifecycle events
scheduler.on('scheduler:started', () => console.log('Scheduler started'));
scheduler.on('scheduler:stopped', () => console.log('Scheduler stopped'));

scheduler.on('steward:registered', ({ stewardId }) => {
  console.log(`Steward ${stewardId} registered`);
});

scheduler.on('steward:unregistered', ({ stewardId }) => {
  console.log(`Steward ${stewardId} unregistered`);
});
```

### Utility Functions

```typescript
import {
  isValidCronExpression,
  getNextCronRunTime,
  evaluateCondition,
} from '@elemental/orchestrator-sdk';

// Validate a cron expression
isValidCronExpression('*/5 * * * *');  // true
isValidCronExpression('invalid');       // false

// Get next run time for a cron expression
const nextRun = getNextCronRunTime('0 2 * * *');  // 2 AM daily
console.log(`Next run: ${nextRun?.toISOString()}`);

// Evaluate a condition expression (for event triggers)
const context = {
  task: { status: 'done', priority: 1 },
  event: { type: 'task_completed' },
};
const matches = evaluateCondition("task.status === 'done'", context);
console.log(`Matches: ${matches}`);  // true
```

### REST API Endpoints

The orchestrator-server exposes these scheduler endpoints:

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/scheduler/status` | Get scheduler status and stats |
| POST | `/api/scheduler/start` | Start the scheduler |
| POST | `/api/scheduler/stop` | Stop the scheduler |
| POST | `/api/scheduler/register-all` | Register all stewards |
| POST | `/api/scheduler/stewards/:id/register` | Register a single steward |
| POST | `/api/scheduler/stewards/:id/unregister` | Unregister a steward |
| POST | `/api/scheduler/stewards/:id/execute` | Manually execute a steward |
| POST | `/api/scheduler/events` | Publish an event |
| GET | `/api/scheduler/jobs` | Get scheduled cron jobs |
| GET | `/api/scheduler/subscriptions` | Get event subscriptions |
| GET | `/api/scheduler/history` | Get execution history |
| GET | `/api/scheduler/stewards/:id/last-execution` | Get last execution for steward |

### Configuration

```typescript
interface StewardSchedulerConfig {
  /** Interval to check cron jobs (default: 60000ms = 1 minute) */
  checkIntervalMs?: number;

  /** Maximum execution history entries to keep (default: 100) */
  maxHistoryEntries?: number;

  /** Enable cron scheduling (default: true) */
  enableCronScheduling?: boolean;

  /** Enable event triggers (default: true) */
  enableEventTriggers?: boolean;
}
```

### Types

```typescript
interface StewardExecutionResult {
  success: boolean;
  message?: string;
  data?: unknown;
  error?: string;
}

interface StewardExecutionEntry {
  id: string;
  stewardId: EntityId;
  stewardName?: string;
  triggerType: 'cron' | 'event' | 'manual';
  success: boolean;
  startedAt: Timestamp;
  completedAt: Timestamp;
  durationMs: number;
  result?: StewardExecutionResult;
  error?: string;
  manual?: boolean;
  eventData?: {
    eventName: string;
    eventData?: unknown;
    condition?: string;
  };
}

type StewardExecutor = (
  stewardId: EntityId,
  context: {
    triggerType: 'cron' | 'event' | 'manual';
    schedule?: string;
    eventName?: string;
    eventData?: unknown;
    context?: unknown;
  }
) => Promise<StewardExecutionResult>;
```

### Notes

- **Cron Expressions**: Uses standard 5-field cron format (`minute hour day month weekday`)
- **Event Conditions**: Conditions are JavaScript expressions evaluated with `Function` constructor; context variables are available in the expression
- **Execution History**: Capped at `maxHistoryEntries` (default 100) to prevent memory growth
- **Thread Safety**: The scheduler uses internal locking to prevent concurrent execution of the same steward

## PluginExecutor (TB-O23a)

The PluginExecutor service executes plugins for stewards and automated maintenance tasks. Plugins enable custom scripts, commands, and playbooks to be executed as part of steward automation.

### Plugin Types

Three plugin types are supported:

```typescript
// Command plugin - executes shell commands
interface CommandPlugin {
  type: 'command';
  name: string;
  description?: string;
  command: string;           // Shell command to execute
  cwd?: string;              // Working directory
  env?: Record<string, string>; // Environment variables
  timeout?: number;          // Timeout in milliseconds
  continueOnError?: boolean; // Continue batch on failure (default: true)
  tags?: string[];
}

// Script plugin - executes script files
interface ScriptPlugin {
  type: 'script';
  name: string;
  description?: string;
  path: string;              // Script path (relative or absolute)
  args?: string[];           // Command-line arguments
  cwd?: string;
  env?: Record<string, string>;
  timeout?: number;
  continueOnError?: boolean;
  tags?: string[];
}

// Playbook plugin - executes Elemental playbooks
interface PlaybookPlugin {
  type: 'playbook';
  name: string;
  description?: string;
  playbookId: PlaybookId;    // Playbook to execute
  variables?: Record<string, string>; // Variables to pass
  timeout?: number;
  continueOnError?: boolean;
  tags?: string[];
}
```

### Creating a PluginExecutor

```typescript
import {
  createPluginExecutor,
  type PluginExecutor,
  type StewardPlugin,
} from '@elemental/orchestrator-sdk';

const executor = createPluginExecutor({
  api: elementalApi,          // Optional: required for playbook plugins
  workspaceRoot: '/path/to/project', // Default working directory
});
```

### Executing Plugins

```typescript
// Execute a single plugin
const result = await executor.execute({
  type: 'command',
  name: 'cleanup',
  command: 'rm -rf /tmp/cache',
});

console.log(`Success: ${result.success}`);
console.log(`Duration: ${result.durationMs}ms`);
console.log(`Output: ${result.stdout}`);

// Execute multiple plugins in sequence
const batchResult = await executor.executeBatch([
  { type: 'command', name: 'build', command: 'npm run build' },
  { type: 'command', name: 'test', command: 'npm test' },
  { type: 'command', name: 'deploy', command: 'npm run deploy' },
], {
  stopOnError: true, // Stop on first failure
});

console.log(`Succeeded: ${batchResult.succeeded}/${batchResult.total}`);
console.log(`All succeeded: ${batchResult.allSucceeded}`);
```

### Built-in Plugins

Four built-in plugins are available for common maintenance tasks:

```typescript
import {
  GcEphemeralTasksPlugin,      // Garbage collect old ephemeral tasks
  CleanupStaleWorktreesPlugin, // Clean up stale git worktrees
  GcEphemeralWorkflowsPlugin,  // Garbage collect old ephemeral workflows
  HealthCheckAgentsPlugin,     // Check agent health status
  getBuiltInPlugin,
  listBuiltInPlugins,
} from '@elemental/orchestrator-sdk';

// List all built-in plugins
const names = listBuiltInPlugins();
// ['gc-ephemeral-tasks', 'cleanup-stale-worktrees', 'gc-ephemeral-workflows', 'health-check-agents']

// Get a built-in plugin by name
const plugin = getBuiltInPlugin('gc-ephemeral-tasks');

// Execute a built-in plugin
const result = await executor.execute(GcEphemeralTasksPlugin);
```

### Plugin Validation

```typescript
// Validate a plugin configuration
const validation = executor.validate({
  type: 'command',
  name: 'test',
  command: 'echo hello',
});

if (validation.valid) {
  console.log('Plugin is valid');
} else {
  console.log('Errors:', validation.errors);
}
```

### Execution Results

```typescript
interface PluginExecutionResult {
  pluginName: string;
  pluginType: 'playbook' | 'script' | 'command';
  success: boolean;
  error?: string;
  stdout?: string;
  stderr?: string;
  exitCode?: number;        // For script/command plugins
  durationMs: number;
  itemsProcessed?: number;  // For plugins that track items
  startedAt: Timestamp;
  completedAt: Timestamp;
}

interface BatchPluginExecutionResult {
  total: number;
  succeeded: number;
  failed: number;
  skipped: number;          // Skipped due to stopOnError
  results: PluginExecutionResult[];
  durationMs: number;
  allSucceeded: boolean;
}
```

### REST API Endpoints

The orchestrator-server exposes these plugin endpoints:

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/plugins/builtin` | List all built-in plugins |
| GET | `/api/plugins/builtin/:name` | Get details of a built-in plugin |
| POST | `/api/plugins/validate` | Validate a plugin configuration |
| POST | `/api/plugins/execute` | Execute a single plugin |
| POST | `/api/plugins/execute-batch` | Execute multiple plugins |
| POST | `/api/plugins/execute-builtin/:name` | Execute a built-in plugin by name |

### Example: Custom Steward with Plugins

```typescript
// Define a steward with plugins
const steward = await api.registerSteward({
  name: 'MaintenanceSteward',
  stewardFocus: 'ops',
  triggers: [
    { type: 'cron', schedule: '0 2 * * *' }, // Daily at 2 AM
  ],
  createdBy: systemEntity,
});

// Configure plugins for this steward
const maintenancePlugins: StewardPlugin[] = [
  GcEphemeralTasksPlugin,
  GcEphemeralWorkflowsPlugin,
  CleanupStaleWorktreesPlugin,
  {
    type: 'script',
    name: 'custom-cleanup',
    path: './scripts/cleanup.sh',
    timeout: 300000, // 5 minutes
  },
];

// Execute all maintenance plugins when steward runs
const result = await executor.executeBatch(maintenancePlugins);
console.log(`Maintenance complete: ${result.succeeded}/${result.total} succeeded`);
```

## HealthStewardService (TB-O24)

The HealthStewardService monitors agent health and detects stuck or problematic agents. It runs periodic health checks and takes corrective actions when issues are detected.

### Creating the Service

```typescript
import {
  createHealthStewardService,
  type HealthStewardService,
  type HealthStewardConfig,
} from '@elemental/orchestrator-sdk';

const config: HealthStewardConfig = {
  noOutputThresholdMs: 5 * 60 * 1000,      // 5 minutes without output
  errorCountThreshold: 5,                   // 5 errors triggers alert
  errorWindowMs: 10 * 60 * 1000,           // Within 10 minute window
  staleSessionThresholdMs: 15 * 60 * 1000, // 15 minutes stale session
  healthCheckIntervalMs: 60 * 1000,        // Check every minute
  maxPingAttempts: 3,                       // Try 3 pings before escalating
  autoRestart: true,                        // Auto-restart stuck agents
  autoReassign: true,                       // Auto-reassign tasks from crashed agents
  notifyDirector: true,                     // Notify Director of issues
};

const healthSteward = createHealthStewardService(
  api,
  agentRegistry,
  sessionManager,
  taskAssignment,
  dispatchService,
  config
);
```

### Health Issue Types

The service detects these types of issues:

| Issue Type | Description | Default Threshold |
|------------|-------------|-------------------|
| `no_output` | Agent hasn't produced output | 5 minutes |
| `repeated_errors` | Too many errors in window | 5 errors in 10 min |
| `process_crashed` | Agent process exited unexpectedly | Immediate |
| `high_error_rate` | Error rate exceeds 50% | 50% of outputs |
| `session_stale` | Session inactive too long | 15 minutes |
| `unresponsive` | Agent not responding to pings | 3 failed pings |

### Issue Severity

Issues are classified by severity:

| Severity | Description |
|----------|-------------|
| `warning` | Minor issue, monitor |
| `error` | Significant issue, action needed |
| `critical` | Agent is unusable, immediate action |

### Running Health Checks

```typescript
// Start automatic health checks (runs at configured interval)
healthSteward.start();

// Stop automatic health checks
healthSteward.stop();

// Check if running
const running = healthSteward.isRunning();

// Run a single health check manually
const result = await healthSteward.runHealthCheck();
console.log(`Checked ${result.agentsChecked} agents`);
console.log(`Found ${result.newIssues.length} new issues`);
console.log(`Resolved ${result.resolvedIssues.length} issues`);

// Check a specific agent
const status = await healthSteward.checkAgent(agentId);
if (!status.isHealthy) {
  console.log(`Agent has ${status.issues.length} issues`);
  for (const issue of status.issues) {
    console.log(`- ${issue.issueType}: ${issue.description}`);
  }
}

// Get all agent health statuses
const allStatuses = await healthSteward.getAllAgentHealth();
```

### Activity Tracking

The service must be notified of agent activity to track health:

```typescript
// Call when agent produces output
healthSteward.recordOutput(agentId);

// Call when agent encounters an error
healthSteward.recordError(agentId, 'Error message');

// Call when agent process crashes
healthSteward.recordCrash(agentId, exitCode);
```

### Issue Management

```typescript
// Get all active issues
const issues = healthSteward.getActiveIssues();

// Get issues for a specific agent
const agentIssues = healthSteward.getIssuesForAgent(agentId);

// Resolve an issue manually
healthSteward.resolveIssue(issueId);

// Clear resolved issue history
healthSteward.clearResolvedIssues();
```

### Taking Actions

```typescript
// Actions the service can take
type HealthAction =
  | 'monitor'           // Continue monitoring
  | 'send_ping'         // Send ping to check responsiveness
  | 'restart'           // Restart the agent session
  | 'notify_director'   // Notify the Director agent
  | 'reassign_task'     // Stop agent and reassign task
  | 'escalate';         // Escalate to human

// Take action on an issue (auto-determines action if not specified)
const result = await healthSteward.takeAction(issueId);

// Take specific action
const result = await healthSteward.takeAction(issueId, 'restart');

// Individual actions
await healthSteward.pingAgent(agentId);
await healthSteward.restartAgent(agentId);
await healthSteward.notifyDirector(issue);
await healthSteward.reassignTask(agentId, taskId);
```

### Action Results

```typescript
interface HealthActionResult {
  success: boolean;
  action: HealthAction;
  issueId: string;
  message: string;
  actionTakenAt: Timestamp;
  newTaskId?: ElementId;     // If task reassigned
  newAgentId?: EntityId;     // If task reassigned
  error?: string;            // If action failed
}
```

### Events

```typescript
// Subscribe to events
healthSteward.on('issue:detected', (issue) => {
  console.log(`New issue: ${issue.description}`);
});

healthSteward.on('issue:resolved', (issueId) => {
  console.log(`Resolved: ${issueId}`);
});

healthSteward.on('action:taken', (result) => {
  console.log(`Action ${result.action}: ${result.success ? 'success' : 'failed'}`);
});

healthSteward.on('check:completed', (result) => {
  console.log(`Health check completed in ${result.durationMs}ms`);
});

// Unsubscribe
healthSteward.off('issue:detected', listener);
```

### Statistics

```typescript
const stats = healthSteward.getStats();
console.log(`Total checks: ${stats.totalChecks}`);
console.log(`Issues detected: ${stats.totalIssuesDetected}`);
console.log(`Issues resolved: ${stats.totalIssuesResolved}`);
console.log(`Actions taken: ${stats.totalActionsTaken}`);
console.log(`Successful actions: ${stats.successfulActions}`);
console.log(`Failed actions: ${stats.failedActions}`);
console.log(`Active issues: ${stats.activeIssues}`);
console.log(`Monitored agents: ${stats.monitoredAgents}`);
```

### Health Check Results

```typescript
interface HealthCheckResult {
  timestamp: Timestamp;
  agentsChecked: number;
  agentsWithIssues: number;
  newIssues: HealthIssue[];
  resolvedIssues: string[];       // Issue IDs that resolved
  actionsTaken: HealthActionResult[];
  durationMs: number;
}

interface AgentHealthStatus {
  agentId: EntityId;
  agentName: string;
  agentRole: AgentRole;
  isHealthy: boolean;
  issues: HealthIssue[];
  lastActivityAt?: Timestamp;
  lastHealthCheckAt?: Timestamp;
  sessionStatus?: HealthSessionStatus;
  currentTaskId?: ElementId;
  recentErrorCount: number;
  recentOutputCount: number;
}

interface HealthIssue {
  id: string;
  agentId: EntityId;
  agentName: string;
  agentRole: AgentRole;
  issueType: HealthIssueType;
  severity: HealthIssueSeverity;
  description: string;
  detectedAt: Timestamp;
  lastSeenAt: Timestamp;
  occurrenceCount: number;
  sessionId?: string;
  taskId?: ElementId;
  context?: Record<string, unknown>;
}
```

### Integration with Other Services

**With SessionManager:**
```typescript
// Session manager can record activity for health tracking
sessionManager.on('session:output', (agentId) => {
  healthSteward.recordOutput(agentId);
});

sessionManager.on('session:error', (agentId, error) => {
  healthSteward.recordError(agentId, error);
});

sessionManager.on('session:crashed', (agentId, exitCode) => {
  healthSteward.recordCrash(agentId, exitCode);
});
```

**With StewardScheduler:**
```typescript
// Configure health steward to run via scheduler
const steward = await api.registerSteward({
  name: 'HealthMonitor',
  stewardFocus: 'health',
  triggers: [
    { type: 'cron', schedule: '*/5 * * * *' }, // Every 5 minutes
  ],
  createdBy: systemEntity,
});

// The scheduler can invoke health checks
scheduler.on('steward:execute', async (steward) => {
  if (steward.stewardFocus === 'health') {
    await healthSteward.runHealthCheck();
  }
});
```

## See Also

- [ElementalAPI](elemental-api.md) - Base API documentation
- [Storage](../core/storage.md) - Storage layer
- [STAGE_2_PLAN.md](../../specs/STAGE_2_PLAN.md) - Implementation roadmap

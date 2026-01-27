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

## See Also

- [ElementalAPI](elemental-api.md) - Base API documentation
- [Storage](../core/storage.md) - Storage layer
- [STAGE_2_PLAN.md](../../specs/STAGE_2_PLAN.md) - Implementation roadmap

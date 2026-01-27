# Elemental Orchestrator: AI Agent Orchestration Platform

> **Claude Code CLI Reference**: https://code.claude.com/docs/en/cli-reference

## Overview

Transform the Elemental codebase into a TurboRepo monorepo that supports both:

1. **Elemental** - Standalone library/CLI and web platform for task/workflow management
2. **Elemental Orchestrator** - AI agent orchestration platform built on top of Elemental

This is the spiritual successor to Gas Town, upgrading from tmux UI to a full web platform while simplifying the architecture.

> **UI/UX Details**: See **specs/STAGE_2_WEB_UI.md** for detailed UI/UX specifications, page layouts, and UI-specific tracer bullets.

---

## Key Architecture Decisions

### 1. Package Namespace

All packages under `@elemental/*` scope:

- `@elemental/core` - Shared types, utilities, ID generation
- `@elemental/storage` - SQLite storage layer
- `@elemental/sdk` - Core Elemental API (current @elemental/cli)
- `@elemental/ui` - **ALL shared React components** (extracted from current web app)
- `@elemental/web` - Elemental web platform (imports from @elemental/ui)
- `@elemental/server` - Elemental server
- `@elemental/orchestrator-sdk` - Orchestration library extending SDK
- `@elemental/orchestrator-web` - Orchestration web platform (imports from @elemental/ui)
- `@elemental/orchestrator-server` - Orchestration server

**Critical**: The `@elemental/ui` package contains ALL reusable components from the current web app. Both `@elemental/web` and `@elemental/orchestrator-web` import from this shared package.

### 2. Agent Runtime Model

| Agent Type        | Runtime         | Interface           | Flags                                                                                                        |
| ----------------- | --------------- | ------------------- | ------------------------------------------------------------------------------------------------------------ |
| Director          | Interactive PTY | xterm + node-pty    | `--dangerously-skip-permissions --session-id {id}`                                                           |
| Persistent Worker | Interactive PTY | xterm + node-pty    | `--dangerously-skip-permissions --session-id {id}`                                                           |
| Ephemeral Worker  | Headless        | stream-json via SSE | `-p --dangerously-skip-permissions --output-format stream-json --input-format stream-json --session-id {id}` |
| Steward           | Headless        | stream-json via SSE | `-p --dangerously-skip-permissions --output-format stream-json --input-format stream-json --session-id {id}` |

**Implementation**: Claude Code as initial agent backend.

**Permission Model**: All agents run with `--dangerously-skip-permissions` to enable fully autonomous operation. The orchestrator is responsible for security boundaries (worktree isolation, allowed operations).

**Communication Model**:

- **Interactive agents** (Director, Persistent Worker): WebSocket with xterm + node-pty for real terminal experience
- **Headless agents** (Ephemeral Worker, Steward): Server-Sent Events (SSE) for streamed output, HTTP POST for user input
- **All agents**: Use `--session-id {id}` and support `--resume {session_id}`

**Agents use the `elemental` CLI directly** for all operations (no MCP). The CLI is available in the agent's PATH.

### 3. Four-Role Agent Model

| Role                  | Authority                           | Reports To | Lifecycle                            |
| --------------------- | ----------------------------------- | ---------- | ------------------------------------ |
| **Human**             | Ultimate (approvals)                | -          | Permanent                            |
| **Director**          | Strategic (creates tasks)           | Human      | Long-lived, 1 per workspace          |
| **Ephemeral Worker**  | Execution (produces code)           | Director   | Short-lived, spawned per task        |
| **Persistent Worker** | Execution (produces code)           | Human      | Long-lived, human-supervised         |
| **Steward**           | Support (merges, health, reminders) | Director   | Long-lived, configurable per project |

**Hierarchy**:

- **Ephemeral Workers** report to **Director** (automated task management)
- **Persistent Workers** report to **Human** (human-supervised, interactive)
- **Stewards** report to **Director** (automated support)

Stewards assist workers by:

- Merging completed branches (Merge Steward)
- Detecting stuck agents and helping unstick (Health Steward)
- Sending reminders and notifications (Reminder Steward)
- Running scheduled maintenance tasks (Ops Steward)

**When tests fail**: Steward creates a new task, assigns it to a worker, and messages that worker to start—does NOT escalate to Director.

Stewards are **user-configurable** in the UI with custom focus areas and schedules.

### 3.1 Session Resume & Inter-Agent Communication

The `--resume {session_id}` feature serves two critical purposes:

1. **Crash Recovery**: When a worker crashes and restarts, it auto-resumes in the correct worktree with full context preserved.

2. **Inter-Agent Messaging**: Agents can message previous agent sessions to discuss tasks:
   - Worker can message the Director session that created its task
   - Steward can message the Worker session whose branch it's merging
   - This enables collaborative problem-solving between agents

### 3.2 Universal Work Principle (UWP)

**Rule**: "If there is work on your anchor, YOU MUST RUN IT"

On agent startup:

1. Query: `el task ready --assignee <self> --limit 1`
2. If task exists → Set task status to IN_PROGRESS, begin execution
3. If no task → Enter idle/polling mode, wait for assignment

On session resume: Check queue before continuing previous context.

### 3.3 Inter-Agent Messaging

Uses existing Elemental Messages, Channels, and Inbox system:

- **Agent Channels**: Each agent gets a direct channel for receiving messages
- **Message Types** (via metadata):
  - `type: 'task-assignment'` - New task assigned
  - `type: 'status-update'` - Progress notification
  - `type: 'help-request'` - Agent needs assistance
  - `type: 'handoff'` - Session handoff request
  - `type: 'health-check'` - Ping from Steward
- **Inbox Polling**: Agents check inbox on startup and periodically

### 3.4 Dispatch Mechanism

Uses existing task assignment + messaging:

```
dispatch(task, agent, options):
1. Update task: `el task assign <task-id> <agent-entity>`
2. Send notification: `el msg send --channel <agent-channel> --content "Task <id> assigned"`
3. If options.restart: Signal agent to restart session
4. If agent idle: Trigger agent to check ready queue
```

### 3.5 Session Handoff

**Trigger**: Manual only - agent decides when to hand off.

Two types:

1. **Self-Handoff**: Agent hands off to fresh instance of itself
2. **Agent-Agent Handoff**: Agent hands off to another agent

```
handoff(fromAgent, toAgent?, note?):
1. Create handoff message with context summary
2. If toAgent: Send to toAgent's channel; Else: Send to own channel
3. Mark current session as "suspended" (available for predecessor query)
4. Terminate current session gracefully
5. If toAgent: Trigger toAgent to process handoff
```

### 3.6 Predecessor Query

New agent can send message to previous session and receive response:

```
consultPredecessor(currentAgent, role, message):
1. Find most recent session for this role
2. Get previous session's Claude Code session ID
3. Resume previous session with: `--resume <previous-session-id>`
4. Send message, capture response
5. Suspend predecessor session again
6. Return response to current agent
```

### 3.7 Ephemeral Tasks

Tasks with `ephemeral: true` are temporary work items:

- Stored in SQLite only, excluded from JSONL export
- Can be promoted to durable via `promoteTask()`
- Garbage collected after configurable retention (default 24h)

Use cases: Steward patrol tasks, automated maintenance, temporary workflow steps.

### 4. Git Isolation Strategy (Worktrees)

Each Worker gets a dedicated **git worktree** for true parallel development.

**Requirement**: The orchestrator requires an existing git repository. If no git repo is found, the orchestrator displays a detailed error with instructions.

```
workspace/
├── .git/                          # Existing repo (REQUIRED)
├── src/                           # Main branch (working directory)
└── .worktrees/
    ├── worker-alice-feat-123/     # Worker Alice's isolated worktree
    ├── worker-bob-bugfix-456/     # Worker Bob's isolated worktree
    └── worker-carol-refactor-789/ # Worker Carol's isolated worktree
```

**Branch naming**: `agent/{worker-name}/{task-id}-{slug}`
**Worktree path**: `.worktrees/{worker-name}-{task-slug}/`

**Worktree Root-Finding**: Workers in worktrees need the root database. The spawner sets `ELEMENTAL_ROOT` env var pointing to workspace root. Config loader checks this env var first, then falls back to walk-up search.

**Merge workflow**:

1. Worker completes task → marks Task as `done`
2. Merge Steward detects completed task → runs tests on branch
3. If tests pass → Steward auto-merges to main, cleanup worktree
4. If tests fail → Steward creates new task, assigns to worker, messages worker to fix
5. If merge conflict → Steward attempts auto-resolve, else creates task for worker/human

### 5. Steward Configuration & Scheduling

Stewards support both **cron-style** and **event-driven** triggers:

**Cron triggers** (scheduled):

```yaml
steward:
  name: "Nightly Cleanup"
  focus: ops
  schedule: "0 2 * * *" # 2 AM daily
  workflow: cleanup-stale-branches
```

**Event triggers** (reactive):

```yaml
steward:
  name: "Merge Bot"
  focus: merge
  triggers:
    - event: task_completed
      condition: "task.status === 'done' && task.assignedAgent?.role === 'worker'"
    - event: branch_ready
      condition: "branch.tests === 'passing'"
```

**Plugin System**: Stewards can execute plugins (Playbooks, scripts, or commands) on patrol:

```yaml
steward:
  name: "Ops Steward"
  focus: ops
  schedule: "*/15 * * * *"
  plugins:
    - type: playbook
      name: cleanup-stale-branches
      playbookId: pb-cleanup-001
    - type: script
      name: custom-gc
      path: ./scripts/custom-gc.sh
    - type: command
      name: gc-ephemeral
      command: el gc --ephemeral --older-than 24h
```

### 6. No Work Orders—Use Tasks

Tasks are the universal work unit. Tasks already have an `assignee` field. For orchestration, Tasks gain additional metadata:

- `branch: string` - Git branch for this task
- `worktree: string` - Path to worktree
- `sessionId: string` - Claude Code session ID for resumption

No separate "work order" concept needed—use existing Task primitives.

---

## Tracer Bullets (TB)

Each tracer bullet is a small, full-stack feature verified immediately after completion.

### Phase 0: Core Library Additions

#### - [x] TB-Core-1: Ephemeral Task Support

**Goal**: Add ephemeral field to Task type

**Changes**:

- [x] Add `ephemeral: boolean` field to Task type (default: false)
- [x] Update `createTask()` to accept ephemeral option
- [x] Update validation functions

**Verification**: Create ephemeral task, verify field persists

---

#### - [x] TB-Core-2: Task Promote Operation

**Goal**: Promote ephemeral tasks to durable

**Changes**:

- [x] Add `promoteTask()` function to convert ephemeral → durable
- [x] Add utility functions: `isEphemeralTask`, `isDurableTask`, `filterEphemeralTasks`, `filterDurableTasks`
- [x] Add GC eligibility functions: `isTaskEligibleForGarbageCollection`, `filterTaskGarbageCollectionByAge`

**Verification**: Create ephemeral task, promote it, verify now durable

---

#### - [x] TB-Core-3: Ephemeral GC Service

**Goal**: Garbage collect completed ephemeral tasks

**Changes**:

- [x] Add garbage collection for completed ephemeral tasks (`garbageCollectTasks()` API method)
- [x] Configurable retention period (default 24h via `maxAgeMs` parameter)
- [x] Add `el gc tasks` and `el gc workflows` CLI commands
- [x] Integrate with Ops Steward for scheduled runs (deferred to Phase 6 TB-O23a - now complete)

**Verification**: Integration tests in `src/api/task-gc.integration.test.ts`

---

### Phase 1: Monorepo Foundation

#### - [x] TB-O1: TurboRepo Scaffold

**Goal**: Working monorepo with build pipeline

**Changes**:

- [x] Create `turbo.json` with build/dev/test/lint tasks
- [x] Create root `package.json` with pnpm workspaces
- [x] Create `packages/` and `apps/` directories
- [x] Move existing code to `apps/legacy/` temporarily
- [x] Add shared `tsconfig.json` base configs

**Verification**: `pnpm install && pnpm build` succeeds

---

#### - [x] TB-O2: Extract @elemental/core

**Goal**: Shared types package compiles independently

**Changes**:

- [x] Create `packages/core/` with package.json
- [x] Copy `src/types/*.ts` to `packages/core/src/types/` (keeping originals in legacy for now)
- [x] Copy `src/errors/` to `packages/core/src/errors/`
- [x] Copy `src/id/` to `packages/core/src/id/`
- [x] Copy `src/utils/` to `packages/core/src/utils/`
- [x] Export all from `packages/core/src/index.ts`

**Verification**: `pnpm --filter @elemental/core build` succeeds, types importable

**Notes**:
- Files were copied (not moved) to allow incremental migration while legacy package continues to function
- Two integration test files were excluded as they require cross-package dependencies (storage, api)
- 2,682 tests pass, 813 exports available

---

#### - [x] TB-O3: Extract @elemental/storage

**Goal**: Storage layer as independent package

**Changes**:

- [x] Create `packages/storage/` with package.json
- [x] Copy `src/storage/*.ts` to `packages/storage/src/`
- [x] Add dependency on `@elemental/core`
- [x] Export storage backends and schema

**Verification**: Storage tests pass in isolation (131 tests passing)

**Notes**:
- Files were copied (not moved) to allow incremental migration while legacy package continues to function
- Storage backends for Bun, Node.js, and Browser are all included
- Schema management and migrations are exported for downstream use

---

#### - [x] TB-O4: Extract @elemental/sdk

**Goal**: Core API as independent package (replaces @elemental/cli)

**Changes**:

- [x] Create `packages/sdk/` with package.json
- [x] Move `src/api/`, `src/services/`, `src/sync/`, `src/cli/` to `packages/sdk/src/`
- [x] Add dependencies on `@elemental/core` and `@elemental/storage`
- [x] Update CLI binary to use new package structure

**Verification**: `elemental doctor` and `elemental stats` work from CLI

**Notes**:
- Files were copied (not moved) to allow incremental migration while legacy package continues to function
- Also copied: `config/`, `http/`, `systems/`, `bin/` directories required for CLI operation
- 2,625 tests pass, CLI commands work correctly
- Extensive import updates required to replace relative paths with `@elemental/core` and `@elemental/storage`

---

#### - [x] TB-O5: Migrate Apps to Monorepo

**Goal**: Existing web and server apps work in monorepo

**Changes**:

- [x] Move `apps/legacy/apps/web/` to `apps/web/` (already done in previous migration)
- [x] Move `apps/legacy/apps/server/` to `apps/server/` (already done in previous migration)
- [x] Update imports to use `@elemental/core`, `@elemental/storage`, `@elemental/sdk`
- [x] Remove `apps/legacy/`

**Verification**: `pnpm dev` starts both web and server, UI loads in browser

**Notes**:
- Server imports updated from `@elemental/cli` to proper package imports
- Core types and factory functions imported from `@elemental/core`
- Storage layer imported from `@elemental/storage`
- API and services imported from `@elemental/sdk`
- TypeScript path mappings updated in server tsconfig
- Root tsconfig updated to reference packages instead of legacy
- Docs updated to reflect new package structure

---

### Phase 2: Orchestrator SDK Foundation

#### - [x] TB-O6: Create @elemental/orchestrator-sdk Package

**Goal**: Orchestrator SDK scaffold with agent types

**Changes**:

- [x] Create `packages/orchestrator-sdk/` with package.json
- [x] Define agent role types in `src/types/agent.ts`:
  ```typescript
  type AgentRole = "director" | "steward" | "worker";
  type WorkerMode = "ephemeral" | "persistent";
  type StewardFocus = "merge" | "health" | "reminder" | "ops";
  type StewardTrigger =
    | { type: "cron"; schedule: string }
    | { type: "event"; event: string; condition?: string };
  ```
- [x] Define Task orchestrator metadata in `src/types/task-meta.ts`:
  ```typescript
  interface OrchestratorTaskMeta {
    branch?: string;
    worktree?: string;
    sessionId?: string;
  }
  ```
- [x] Create `OrchestratorAPI` class extending `ElementalAPI`

**Verification**: Types compile, can instantiate OrchestratorAPI

**Notes**:
- Agent metadata stored nested under `entity.metadata.agent` key
- OrchestratorAPIImpl extends ElementalAPIImpl for full API access
- 66 tests passing across agent types, task metadata, and integration tests
- Agent channel setup deferred to TB-O7a (requires separate entity for direct channel)

---

#### - [x] TB-O6a: Agent Capability System

**Goal**: Define agent capabilities for intelligent task routing

**Changes**:

- [x] Add capability types to `packages/orchestrator-sdk/src/types/agent.ts`:
  ```typescript
  interface AgentCapabilities {
    skills: string[]; // e.g., ['frontend', 'testing', 'database']
    languages: string[]; // e.g., ['typescript', 'python']
    maxConcurrentTasks: number;
  }
  interface TaskCapabilityRequirements {
    requiredSkills?: string[];
    preferredSkills?: string[];
    requiredLanguages?: string[];
    preferredLanguages?: string[];
  }
  ```
- [x] Store capabilities in Entity metadata: `entity.metadata.agent.capabilities`
- [x] Create `CapabilityService` with methods: `matchAgentToTask()`, `matchAgentToTaskRequirements()`, `getAgentCapabilities()`, `validateAgentCapabilities()`, `findAgentsForTask()`, `getBestAgentForTask()`, `agentHasSkill()`, `agentHasLanguage()`, `agentHasCapacity()`
- [ ] Integrate with dispatch service for capability-aware routing (deferred to TB-O8a)

**Verification**: Register agent with capabilities, create task with requirements, dispatch routes to matching agent

**Implementation Notes**:
- Capability matching is case-insensitive (normalized to lowercase)
- Scoring system: 50 points for meeting requirements, 25 points for preferred skills, 25 for preferred languages
- 128 tests passing for capability system (56 new tests)

---

#### - [x] TB-O7: Agent Registry Service

**Goal**: Register and query agents by role

**Changes**:

- [x] Implement `AgentRegistry` service in orchestrator-sdk
- [x] Store agent metadata on Entity: `{ agentRole, capabilities, workerMode?, stewardFocus?, stewardTriggers? }`
- [x] Add methods: `registerAgent()`, `getAgentsByRole()`, `getAvailableWorkers()`, `getStewards()`
- [x] Use existing Entity and Team primitives

**Verification**: Unit tests for agent registration and role queries

**Implementation Notes**:
- Created standalone `AgentRegistry` service class in `packages/orchestrator-sdk/src/services/agent-registry.ts`
- Service uses `ElementalAPI` for storage operations, creating Entity elements with specialized agent metadata
- Supports filtering by role, workerMode, stewardFocus, sessionStatus, reportsTo, hasSession, requiredSkills, requiredLanguages, hasCapacity
- Agent metadata stored under `entity.metadata.agent` key (consistent with OrchestratorAPI)
- 47 new unit tests added covering registration, queries, session management, and capability filtering

---

#### - [x] TB-O7a: Agent Channel Setup

**Goal**: Create direct channel per agent for messaging

**Changes**:

- [x] On agent registration, create dedicated channel: `agent-{agentId}`
- [x] Add method: `getAgentChannel(agentId)` to AgentRegistry
- [x] Ensure channel created atomically with agent registration

**Verification**: Register agent, verify channel exists, send message to channel

**Implementation Notes**:
- Channel created as group channel with agent and creator as members
- Added `getAgentChannel(agentId)` and `getAgentChannelId(agentId)` methods to AgentRegistry
- Added utility functions: `generateAgentChannelName()`, `parseAgentChannelName()`
- Channel has metadata: `agentId`, `purpose`, tags: `['agent-channel']`
- Channel permissions: private visibility, invite-only join policy
- 15 new tests added covering channel creation, retrieval, and utility functions

---

#### - [x] TB-O7b: Agent Role Definition Storage

**Goal**: Store agent system prompts and role behaviors as Documents

**Changes**:

- [x] Define role definition structure:
  ```typescript
  interface AgentRoleDefinition {
    role: AgentRole;
    systemPromptRef: DocumentId;
    capabilities: AgentCapabilities;
    behaviors?: {
      onStartup?: string;
      onTaskAssigned?: string;
      onStuck?: string;
      onHandoff?: string;
      onError?: string;
    };
  }
  ```
- [x] Store prompts as Documents with tags: `['agent-prompt', 'role:{role}']`
- [x] Reference from Entity metadata: `entity.metadata.agent.roleDefinitionRef`
- [x] Add methods: `createRoleDefinition()`, `getRoleDefinition()`, `getSystemPrompt()`, `listRoleDefinitions()`, `updateRoleDefinition()`, `deleteRoleDefinition()`, `getDefaultRoleDefinition()`, `getRoleDefinitionsByRole()`

**Verification**: Create role definition document, register agent referencing it, agent spawns with correct prompt

**Implementation Notes**:
- Created `AgentRoleDefinition` types with support for Director, Worker, and Steward variants
- Created `AgentBehaviors` interface for behavioral hooks (onStartup, onTaskAssigned, onStuck, onHandoff, onError)
- Role definitions stored as JSON documents with `role-definition` tag
- System prompts stored as separate markdown documents referenced by `systemPromptRef`
- Added `RoleDefinitionService` with full CRUD operations and filtering
- Added `roleDefinitionRef` field to BaseAgentMetadata and all registration inputs
- 69 new tests covering type guards and service operations

---

#### - [x] TB-O8: Task Assignment Service

**Goal**: Assign tasks to agents with orchestrator metadata

**Changes**:

- [x] Implement `TaskAssignmentService` extending Task functionality
- [x] Methods: `assignToAgent()`, `getAgentWorkload()`, `getUnassignedTasks()`
- [x] Use existing `task.assignee` for agent assignment
- [x] Track `branch`, `worktree`, `sessionId` in task metadata
- [x] Query tasks by assignment status

**Verification**: Can assign task to registered agent, query workload by agent

**Implementation Notes**:
- Created `TaskAssignmentService` with full interface, implementation, and factory function
- Added methods: `assignToAgent()`, `unassignTask()`, `startTask()`, `completeTask()`, `getAgentTasks()`, `getAgentWorkload()`, `agentHasCapacity()`, `getUnassignedTasks()`, `getTasksByAssignmentStatus()`, `listAssignments()`, `getTasksAwaitingMerge()`
- Added types: `AssignTaskOptions`, `TaskAssignment`, `AssignmentFilter`, `AssignmentStatus`, `AgentWorkloadSummary`
- Uses OrchestratorTaskMeta for branch, worktree, sessionId tracking
- 42 new tests covering assignment operations, workload queries, and filtering

---

#### - [x] TB-O8a: Dispatch Service

**Goal**: Implement dispatch operation combining assignment + notification

**Changes**:

- [x] Create `DispatchService` in `packages/orchestrator-sdk/src/services/`
- [x] Methods: `dispatch(task, agent, options)` - assigns task, sends notification, optionally triggers agent
- [x] Integrate with capability system for smart routing
- [x] Support options: `{ restart?: boolean, priority?: number }`

**Verification**: Dispatch task to agent, verify assignment and notification sent

**Implementation Notes**:
- Created `DispatchService` with interface, implementation, and factory function
- Added methods: `dispatch()`, `dispatchBatch()`, `smartDispatch()`, `getCandidates()`, `getBestAgent()`, `notifyAgent()`
- Added types: `DispatchOptions`, `DispatchResult`, `SmartDispatchOptions`, `SmartDispatchCandidatesResult`, `DispatchMessageType`, `DispatchNotificationMetadata`
- Smart routing filters available workers by capacity and matches against task capability requirements
- 32 new tests covering dispatch, batch dispatch, smart dispatch, candidate retrieval, and notifications

---

### Phase 3: Agent Process Management

#### - [x] TB-O9: Claude Code Process Spawner

**Goal**: Spawn Claude Code in headless or interactive mode

**Changes**:

- [x] Create `packages/orchestrator-sdk/src/runtime/spawner.ts`
- [x] Two spawn modes:
  - **Headless** (ephemeral workers, stewards): `child_process.spawn()` with stream-json flags
  - **Interactive** (Director, persistent workers): Placeholder for `node-pty` (throws clear error until dependency added)
- [x] All modes support `--resume {session_id}`
- [x] Parse stream-json events: `assistant`, `tool_use`, `tool_result`, `error`, `system`

**Verification**: Unit tests for spawner logic; integration tests available (RUN_INTEGRATION_TESTS=true)

**Implementation Notes**:
- Created `SpawnerService` interface with methods: `spawn()`, `terminate()`, `suspend()`, `getSession()`, `listActiveSessions()`, `listAllSessions()`, `getMostRecentSession()`, `sendInput()`, `getEventEmitter()`
- Created types: `SpawnMode`, `SpawnConfig`, `SpawnOptions`, `StreamJsonEvent`, `SpawnedSessionEvent`, `SessionStatus`, `SpawnedSession`, `SpawnResult`
- Session status state machine with valid transitions
- ELEMENTAL_ROOT environment variable support for worktree root-finding
- 37 new unit tests, 4 integration tests (skipped by default)
- Interactive mode deferred until node-pty dependency is added

---

#### - [x] TB-O9a: UWP Agent Startup Check

**Goal**: Implement Universal Work Principle on agent startup

**Changes**:

- [x] Add ready queue check to spawner before accepting new instructions
- [x] Query: `el task ready --assignee <self> --limit 1`
- [x] If task found, auto-start execution

**Verification**: Assign task to stopped agent, start agent, verify auto-pickup

**Implementation Notes**:
- Added `checkReadyQueue()` method to SpawnerService interface
- Added types: `UWPCheckResult`, `UWPCheckOptions`, `UWPTaskInfo`
- Uses callback pattern (`getReadyTasks`) to avoid circular dependencies with TaskAssignmentService
- Caller is responsible for actually starting the task using TaskAssignmentService.startTask()
- 25 new unit tests covering UWP functionality

---

#### - [x] TB-O9b: Worktree Root-Finding via ELEMENTAL_ROOT

**Goal**: Ensure workers in worktrees interact with root-level SQLite database

**Changes**:

- [x] Modify `packages/sdk/src/config/file.ts` to check `ELEMENTAL_ROOT` env var first
- [x] Update spawner to set `ELEMENTAL_ROOT` when spawning workers (already implemented in TB-O9)

**Verification**: Unit tests in `packages/sdk/src/config/file.test.ts` verify ELEMENTAL_ROOT behavior

**Implementation Notes**:
- Modified `findElementalDir()` to check `ELEMENTAL_ROOT` env var before walk-up search
- When spawner spawns agents with `elementalRoot` config, it sets `ELEMENTAL_ROOT` env var
- This allows workers in worktrees to find and use the main workspace's `.elemental` directory
- 14 new unit tests covering ELEMENTAL_ROOT priority, fallback behavior, and worktree simulation

---

#### - [x] TB-O10: Agent Session Manager with Resume

**Goal**: Track sessions with Claude Code session ID support

**Changes**:

- [x] Create `SessionManager` class tracking active processes
- [x] Store session state: `pid`, `agentId`, `claudeSessionId`, `worktree`, `status`, `startedAt`
- [x] Methods: `startSession()`, `resumeSession()`, `stopSession()`, `getSession()`, `listSessions()`, `messageSession()`
- [x] Persist session IDs to database for cross-restart resumption

**Verification**: 49 unit tests covering session lifecycle, queries, history, communication, and event forwarding

**Implementation Notes**:
- Created `SessionManager` interface and `SessionManagerImpl` class in `packages/orchestrator-sdk/src/runtime/session-manager.ts`
- Session state types: `SessionRecord`, `StartSessionOptions`, `ResumeSessionOptions`, `StopSessionOptions`, `MessageSessionOptions`, `SessionFilter`, `SessionHistoryEntry`
- Full integration with SpawnerService for process lifecycle
- Session status coordinated with AgentRegistry for agent metadata updates
- Event forwarding from spawner to session emitters for real-time updates
- In-memory session history with support for cross-restart persistence via agent metadata
- 49 new unit tests in `session-manager.test.ts`

---

#### - [x] TB-O10a: Session Recovery with UWP

**Goal**: Check ready queue on session resume

**Changes**:

- [x] On resume, check queue before continuing previous context
- [x] If task assigned during suspension, process it first

**Verification**: Suspend agent, assign task, resume, verify task processed

**Implementation Notes**:
- Added `checkReadyQueue` option to `ResumeSessionOptions` (defaults to true)
- Added `getReadyTasks` callback to allow integration without circular dependencies
- Added `ResumeUWPCheckResult` type to report UWP check results
- Modified `resumeSession()` to perform UWP check before resuming
- If tasks found, prepends task instructions to resume prompt using `buildUWPTaskPrompt()`
- 7 new unit tests covering all UWP scenarios (enabled, disabled, no tasks, defaults)

---

#### - [x] TB-O10b: Inbox Polling Service

**Goal**: Periodic inbox check in session manager

**Changes**:

- [x] Add periodic inbox check to session manager
- [x] Configurable poll interval (default 30s)
- [x] Process unread messages by type

**Verification**: Send message to agent channel, verify agent processes it

**Implementation Summary**:
- Created `InboxPollingService` in `packages/orchestrator-sdk/src/runtime/inbox-polling.ts`
- Configurable poll interval (30s default, min 1s, max 5 min)
- Message type-based processing with `OrchestratorMessageType` constants (task-assignment, status-update, help-request, handoff, health-check, generic)
- Per-agent polling with start/stop controls
- Event emission for poll results and message processing
- Handler registration for type-specific and all-message processing
- 34+ unit tests with comprehensive coverage
- Documentation added to `docs/api/orchestrator-api.md`

---

#### - [x] TB-O10c: Session History Tracking

**Goal**: Store session history per role for predecessor queries

**Changes**:

- [x] Track session history:
  ```typescript
  interface RoleSessionHistoryEntry extends SessionHistoryEntry {
    role: AgentRole;
    agentId: EntityId;
    agentName?: string;
    claudeSessionId?: string;
    worktree?: string;
    startedAt?: Timestamp;
    endedAt?: Timestamp;
    status: SessionStatus;
  }
  ```
- [x] Query methods: `getSessionHistoryByRole(role, limit)`, `getPreviousSession(role)`
- [x] Session history persisted to agent entity metadata under `metadata.agent.sessionHistory`

**Verification**: 19 new unit tests covering role-based history queries and persistence

**Implementation Notes**:
- Added `RoleSessionHistoryEntry` type extending `SessionHistoryEntry` with role context
- `getSessionHistoryByRole(role, limit)` aggregates history from all agents with the specified role
- `getPreviousSession(role)` returns the most recent ended (suspended/terminated) session
- Session history automatically persisted via `persistSession()` to agent metadata
- History limited to 20 entries per agent to avoid metadata bloat
- All 434 tests pass (4 skipped as expected)

---

#### - [x] TB-O10d: Predecessor Query Service

**Goal**: Enable agents to consult previous sessions

**Changes**:

- [x] Add `consultPredecessor(role, message)` method to PredecessorQueryService
- [x] Resume previous session, send message, capture response, suspend again
- [x] Add supporting methods: `getPredecessorInfo()`, `hasPredecessor()`, `cancelQuery()`, `listActiveQueries()`, `getActiveQuery()`
- [x] Add timeout handling with configurable limits (10s-5min)
- [x] Add error classes: `TimeoutError`, `NoPredecessorError`

**Verification**: 27 unit tests covering predecessor queries, query lifecycle, error handling

**Implementation Notes**:
- Created `PredecessorQueryService` in `packages/orchestrator-sdk/src/runtime/predecessor-query.ts`
- Service builds on TB-O10c session history features (`getPreviousSession()`)
- Query status tracking through lifecycle: pending → resuming → waiting_response → completed/failed/timed_out
- Context can be prepended to messages for additional context
- Active queries tracked and can be cancelled mid-execution
- Documentation added to `docs/api/orchestrator-api.md`

---

#### - [x] TB-O10e: Self-Handoff

**Goal**: Agent can trigger own restart with context preservation

**Changes**:

- [x] Add `selfHandoff(note?)` method
- [x] Creates handoff message, marks session suspended, terminates gracefully

**Verification**: Agent triggers handoff, new session finds handoff note

**Implementation Notes**:
- Created `HandoffService` in `packages/orchestrator-sdk/src/runtime/handoff.ts`
- `selfHandoff()` creates handoff document with context summary, Claude session ID, and next steps
- Sends handoff message to agent's own channel for new session to find
- Suspends current session (preserving Claude session ID for predecessor queries)
- New session can query suspended predecessor using PredecessorQueryService
- 26 unit tests covering self-handoff scenarios in `handoff.test.ts`
- Documentation added to `docs/api/orchestrator-api.md`

---

#### - [x] TB-O10f: Agent-Agent Handoff

**Goal**: Transfer work between agents

**Changes**:

- [x] Add `handoffTo(targetAgent, taskIds, note?)` method
- [x] Sends handoff message to target agent's channel
- [x] Triggers target agent to process handoff

**Verification**: Agent A hands off to Agent B, B receives and processes

**Implementation Notes**:
- `handoffToAgent()` method in `HandoffService` transfers work from one agent to another
- Creates handoff document with context, task IDs, and source session info
- Sends handoff message to target agent's channel
- Suspends source agent's session
- Target agent can process handoff via InboxPollingService
- 9 additional unit tests for agent-to-agent handoff
- Helper methods: `getLastHandoff()`, `hasPendingHandoff()` for checking pending handoffs
- Full documentation added to `docs/api/orchestrator-api.md`

---

#### - [x] TB-O11: Worktree Manager

**Goal**: Create and manage git worktrees for workers

**Changes**:

- [x] Create `packages/orchestrator-sdk/src/git/worktree-manager.ts`
- [x] On init, verify git repo exists; if not, throw descriptive error
- [x] Methods: `initWorkspace()`, `createWorktree()`, `removeWorktree()`, `listWorktrees()`, `getWorktreePath()`
- [x] Additional methods: `suspendWorktree()`, `resumeWorktree()`, `getWorktree()`, `getWorktreesForAgent()`, `worktreeExists()`, `getCurrentBranch()`, `getDefaultBranch()`, `branchExists()`
- [x] Branch naming: `agent/{worker-name}/{task-id}-{slug}`
- [x] Worktree path: `.worktrees/{worker-name}-{task-slug}/`
- [x] Auto-add worktree directory to `.gitignore`
- [x] Handle filesystem symlinks (like `/tmp` → `/private/tmp` on macOS)
- [x] Worktree state machine: creating → active → suspended/merging → cleaning → archived
- [x] Error types: `GitRepositoryNotFoundError`, `WorktreeError` with codes

**Verification**: 38+ new unit tests covering worktree creation, removal, suspension, listing, branch operations, state transitions, and error handling

**Implementation Notes**:
- Created `WorktreeManager` interface and `WorktreeManagerImpl` class
- `WorktreeState` type with state transitions validation
- `WorktreeInfo` type tracks path, branch, head, state, agent, and task metadata
- Factory function `createWorktreeManager()` for instantiation
- Utility functions: `isWorktreeState()`, `isValidStateTransition()`, `getWorktreeStateDescription()`
- Uses utilities from `types/task-meta.ts`: `generateBranchName()`, `generateWorktreePath()`, `createSlugFromTitle()`
- Documentation added to `docs/api/orchestrator-api.md`

---

#### - [x] TB-O11a: Worktree & Session Lifecycle State Machines

**Goal**: Formalize state transitions for worktrees and sessions

**Changes**:

- [x] Add lifecycle state types:
  ```typescript
  type WorktreeState = "creating" | "active" | "suspended" | "merging" | "cleaning" | "archived";
  type SessionState = "starting" | "running" | "suspended" | "terminating" | "terminated";
  ```
- [x] Track state in memory (database persistence deferred)
- [x] Add state transition validation (`WorktreeStateTransitions`, `SessionStatusTransitions`)

**Verification**: Unit tests validate state transitions through worktree and session lifecycles

**Implementation Notes**:
- `WorktreeState` implemented in `worktree-manager.ts` with `WorktreeStateTransitions` map
- `SessionStatus` (equivalent to SessionState) implemented in `spawner.ts` with `SessionStatusTransitions` map
- State history in database deferred - current implementation tracks state in memory
- Utility functions: `isWorktreeState()`, `isValidStateTransition()` for worktrees
- Utility functions: `isTerminalStatus()`, `canReceiveInput()` for sessions

---

#### - [x] TB-O12: Orchestrator Server Scaffold

**Goal**: Server with agent session and worktree endpoints

**Changes**:

- [x] Create `apps/orchestrator-server/` extending `apps/server/`
- [x] Add endpoints:
  - `POST /api/agents/:id/start` - Start agent session
  - `POST /api/agents/:id/stop` - Stop agent session
  - `POST /api/agents/:id/resume` - Resume previous session
  - `GET /api/agents/:id/status` - Get session status
  - `GET /api/agents/:id/stream` - SSE stream for headless agent output
  - `POST /api/agents/:id/input` - Send input to headless agent
  - `GET /api/sessions` - List active sessions
  - `GET /api/worktrees` - List active worktrees
- [x] WebSocket endpoint for interactive terminals

**Verification**: 7 unit tests passing in `apps/orchestrator-server/src/index.test.ts`

**Implementation Notes**:
- Created `apps/orchestrator-server/` with package.json and tsconfig.json
- Server uses Hono framework for HTTP routing and Bun for WebSocket
- All orchestrator services initialized from `@elemental/orchestrator-sdk`
- Services: AgentRegistry, SessionManager, SpawnerService, WorktreeManager, TaskAssignmentService, DispatchService, RoleDefinitionService
- SSE streaming via `hono/streaming` with event types: `connected`, `agent_{type}`, `heartbeat`, `agent_error`, `agent_exit`
- WebSocket support for interactive terminals with subscribe/input/ping message types
- WorktreeManager gracefully disabled if git repository not found
- Health endpoint reports status of all services

---

### Phase 4: Real-time Agent Communication

#### - [x] TB-O13: Agent SSE Stream (Headless Agents)

**Goal**: Stream headless agent output to browser via Server-Sent Events

**Changes**:

- [x] Add SSE endpoint `GET /api/agents/:id/stream`
- [x] Pipe stream-json events from spawner to SSE stream
- [x] Event types: `agent_{type}` (assistant, tool_use, tool_result, error, system)
- [x] Support `Last-Event-ID` header for reconnection

**Verification**: Connect to SSE endpoint, start headless agent, see events stream

**Implementation Notes**:
- Implemented in `apps/orchestrator-server/src/index.ts` as part of TB-O12
- Uses Hono's `streamSSE()` for proper SSE formatting
- Event types prefixed with `agent_` (e.g., `agent_assistant`, `agent_tool_use`)
- Includes `connected`, `heartbeat`, `agent_error`, `agent_exit` events
- 30-second heartbeat keeps connection alive

---

#### - [x] TB-O14: Agent Input via HTTP POST (Headless Agents)

**Goal**: Send user messages to running headless agent

**Changes**:

- [x] Add endpoint `POST /api/agents/:id/input`
- [x] Write to agent process stdin in stream-json format
- [x] Return 202 Accepted (response comes via SSE stream)

**Verification**: Start headless agent, POST message, see response in SSE stream

**Implementation Notes**:
- Implemented in `apps/orchestrator-server/src/index.ts` as part of TB-O12
- Uses `spawnerService.sendInput()` to write to stdin
- Supports `isUserMessage` flag for proper stream-json formatting

---

#### - [x] TB-O14a: Message Event Types

**Goal**: Define typed message conventions

**Changes**:

- [x] Define message type schemas in orchestrator-sdk
- [x] Types: `task-assignment`, `status-update`, `help-request`, `handoff`, `health-check`, `generic`
- [x] Validation functions for each type

**Verification**: 50+ unit tests in `message-types.test.ts`

**Implementation Notes**:
- Types defined in `packages/orchestrator-sdk/src/types/message-types.ts`
- Type guards: `isTaskAssignmentMessage()`, `isStatusUpdateMessage()`, `isHelpRequestMessage()`, `isHandoffMessage()`, `isHealthCheckMessage()`, `isGenericMessage()`
- Factory functions: `createTaskAssignmentMessage()`, `createStatusUpdateMessage()`, etc.
- Utilities: `parseMessageMetadata()`, `getMessageType()`, `isOrchestratorMessage()`
- Constants: `MessageTypeValue`, `AllMessageTypes`, `StatusUpdateSeverity`, `HelpRequestUrgency`, `HealthCheckStatus`

---

#### - [x] TB-O14b: Handoff Message Type

**Goal**: Define handoff message schema

**Changes**:

- [x] Define schema:
  ```typescript
  interface HandoffMessage {
    type: "handoff";
    fromAgent: EntityId;
    toAgent?: EntityId;
    taskIds: TaskId[];
    contextSummary: string;
    nextSteps?: string;
    isSelfHandoff: boolean;
    claudeSessionId?: string;
    handoffDocumentId?: string;
  }
  ```
- [x] Validation and parsing utilities

**Verification**: Create handoff message, validate schema

**Implementation Notes**:
- `HandoffMessage` in `packages/orchestrator-sdk/src/types/message-types.ts`
- Additional implementation in `packages/orchestrator-sdk/src/runtime/handoff.ts` (TB-O10e, TB-O10f)
- `isHandoffMessage()` type guard
- `createHandoffMessage()` factory function
- 35 tests in `handoff.test.ts`, additional tests in `message-types.test.ts`

---

#### - [x] TB-O15: Orchestrator Web Scaffold

**Goal**: Basic orchestrator web app with three-column layout

**Changes**:

- [x] Create `apps/orchestrator-web/` with Vite + React + TanStack Router + TanStack Query
- [x] Create three-column layout:
  - Left sidebar: Navigation tabs with expandable sections (Overview, Work, Orchestration, Analytics)
  - Center: Main content area with route-based pages
  - Right panel: Director terminal placeholder (collapsible)
- [x] Routes: `/activity`, `/tasks`, `/agents`, `/workspaces`, `/workflows`, `/metrics`, `/settings`
- [x] Shared design tokens copied from `apps/web` (will be extracted to `@elemental/ui` in future TB)
- [x] Theme toggle (light/dark/system)
- [x] Responsive layout with mobile sidebar drawer
- [x] 14 Playwright tests validating scaffold functionality

**Verification**: Web app loads, three-column layout renders, navigation works, all 14 tests pass

**Implementation Notes**:
- Created standalone app with its own dependencies (similar structure to `apps/web`)
- Sidebar with collapsible sections and active state indicators
- Director panel on right with collapsed/expanded states
- Breadcrumb navigation based on current route
- Connection status indicator (shows disconnected since orchestrator server not running)
- Built successfully with vendor chunk splitting for optimal caching

> See **specs/STAGE_2_WEB_UI.md** for detailed UI/UX specifications.

---

#### - [x] TB-O16: Agent List Page

**Goal**: View and manage agents and stewards with status

**Changes**:

- [x] Create `/agents` route with tabs: Agents, Stewards
- [x] Display: name, role, capabilities, session status
- [x] Show worktree status for workers (branch display for workers)
- [ ] [+ Create Agent] and [+ Create Steward] buttons (UI present, dialog TODO)

**Verification**: Register agents via CLI, see them in web UI with status badges

**Implementation Notes** (2026-01-27):
- Created `api/types.ts` with Agent, Session, and Worktree types
- Created `api/hooks/useAgents.ts` with React Query hooks for agents API
- Created agent components: `AgentCard`, `AgentStatusBadge`, `AgentRoleBadge`
- Implemented full `/agents` route with:
  - Agents tab showing Director, Persistent Workers, and Ephemeral Workers sections
  - Stewards tab grouped by focus (merge, health, reminder, ops)
  - Search functionality filtering by name, skills, and languages
  - Start/Stop agent session buttons with pending states
  - Empty states for when no agents/stewards exist
  - Error handling with retry button
  - Loading indicator while fetching
- 16 Playwright tests in `tests/agents.spec.ts` covering:
  - Page layout and header
  - Tab navigation and URL persistence
  - Empty states for both tabs
  - Search functionality
  - Error handling
  - Responsive design
  - Loading state

---

#### - [x] TB-O17: Director Terminal Panel

**Goal**: Interactive xterm terminal for Director agent

**Changes**:

- [x] Implement right sidebar panel with xterm.js terminal
- [x] Director terminal always accessible (not a separate route)
- [x] WebSocket connection for real-time communication
- [x] Collapse to icon with activity indicator
- [ ] Full PTY terminal experience via node-pty (deferred - requires node-pty dependency)
- [ ] Resize handle (deferred to TB-O17a)

**Verification**: 46 Playwright tests pass, Director terminal panel visible with xterm.js

**Implementation Notes** (2026-01-27):
- Created `XTerminal` component in `apps/orchestrator-web/src/components/terminal/XTerminal.tsx`
  - Full xterm.js integration with @xterm/xterm, @xterm/addon-fit, @xterm/addon-web-links
  - WebSocket connection to orchestrator server for real-time agent communication
  - Dark/light theme support with custom color schemes
  - Auto-fit to container with ResizeObserver
  - Reconnection logic with exponential backoff
- Updated `DirectorPanel` to integrate XTerminal:
  - Shows "No Director" state when no director agent registered
  - Session control buttons (Start/Stop) with pending states
  - Status indicator (Idle, Running, Connecting, Error, No Director)
  - Terminal header with session indicator lights
  - "Open in Workspaces" button for future full-screen terminal
- Added `useDirector` hook to fetch director agent with status
- 16 new Playwright tests in `tests/director-terminal.spec.ts` covering:
  - Terminal layout and dimensions
  - Panel header with title and status
  - Session controls and collapse functionality
  - XTerm container rendering
  - Accessibility (aria-labels)
  - Responsive behavior

---

#### - [x] TB-O17a: Terminal Multiplexer (Workspaces Page)

**Goal**: Tmux-like interface for managing multiple agent sessions

**Changes**:

- [x] Create `/workspaces` route with terminal multiplexer
- [x] Pane management: add, remove, resize (via layout presets), drag-drop to reorganize (deferred)
- [x] Layout presets: single, vertical split, horizontal split, grid
- [x] Two pane types:
  - **Interactive terminal** (persistent workers): Full xterm.js PTY
  - **Stream viewer** (ephemeral workers): JSON stream rendered as terminal-like output
- [x] Layout persistence to localStorage

**Verification**: 31 Playwright tests in `tests/workspaces.spec.ts`

**Implementation Notes** (2026-01-27):
- Created `components/workspace/` directory with:
  - `types.ts` - Types for panes, layouts, stream events
  - `usePaneManager.ts` - Hook for managing pane state and persistence
  - `WorkspacePane.tsx` - Individual pane component with header and controls
  - `WorkspaceGrid.tsx` - Grid layout container supporting multiple presets
  - `StreamViewer.tsx` - JSON stream viewer for ephemeral agents with input
  - `AddPaneDialog.tsx` - Agent selection dialog with search and grouping
- Workspaces page features:
  - Layout selector with preset options (single, split-v, split-h, grid)
  - Save/load named layouts to localStorage
  - Clear all panes and delete saved layouts
  - Empty state with CTA for adding first pane
  - Pane controls: maximize, close, menu
- Drag-drop reordering deferred to future iteration
- Resize handles deferred (using preset-based layouts instead)

---

### Phase 5: Task Management & Agent Workflow

#### - [x] TB-O18: Orchestrator Task List Page

**Goal**: View tasks with orchestrator metadata

**Changes**:

- [x] Create `/tasks` route extending elemental task list
- [x] Additional columns: Assigned Agent, Branch, Worktree Status
- [x] Filter by: unassigned, assigned to agent, completed awaiting merge
- [x] Kanban view: Unassigned → Assigned → In Progress → Done → Merged

**Verification**: 28 Playwright tests in `tests/tasks.spec.ts`

**Implementation Notes** (2026-01-27):
- Created task API types and hooks in `api/types.ts` and `api/hooks/useTasks.ts`
  - Types: `Task`, `TaskStatus`, `Priority`, `Complexity`, `TaskTypeValue`, `OrchestratorTaskMeta`, `MergeStatus`, `TestResult`, `TaskFilter`
  - Hooks: `useTasks()`, `useTask()`, `useTasksByStatus()`, `useTaskCounts()`, `useStartTask()`, `useCompleteTask()`, `useCreateTask()`, `useUpdateTask()`, `useAssignTask()`, `useDeleteTask()`
  - Utility functions: `getStatusDisplayName()`, `getPriorityDisplayName()`, `getTaskTypeDisplayName()`, `getStatusColor()`, `getPriorityColor()`
- Created task components in `components/task/`:
  - `TaskStatusBadge.tsx` - Status badge with merge status support
  - `TaskPriorityBadge.tsx` - Priority badge with icons
  - `TaskTypeBadge.tsx` - Task type badge (bug, feature, task, chore)
  - `TaskCard.tsx` - Card view component for kanban
  - `TaskRow.tsx` - Table row component for list view
- Implemented `/tasks` route with:
  - Header with search, view toggle (list/kanban), and Create Task button
  - 6 filter tabs: All, Unassigned, Assigned, In Progress, Done, Awaiting Merge
  - List view with table showing: Task, Status, Priority, Type, Assignee, Branch, Updated, Actions
  - Kanban view with 5 columns (Unassigned, Assigned, In Progress, Done, Awaiting Merge)
  - Empty states for each tab
  - Loading and error states with retry
  - Search functionality filtering by title, ID, and tags
  - URL persistence for active tab

---

#### - [x] TB-O19: Director Creates & Assigns Tasks

**Goal**: Director agent can create tasks and assign to workers

**Changes**:

- [x] REST API endpoints for task creation and dispatch in orchestrator-server:
  - `GET /api/tasks` - List tasks with filters (status, assignee, unassigned)
  - `GET /api/tasks/unassigned` - Get unassigned tasks
  - `POST /api/tasks` - Create tasks with capability requirements
  - `GET /api/tasks/:id` - Get task details with assignment info
  - `POST /api/tasks/:id/dispatch` - Dispatch task to specific agent
  - `POST /api/tasks/:id/dispatch/smart` - Smart dispatch with capability matching
  - `GET /api/tasks/:id/candidates` - Get candidate agents ranked by capability
  - `GET /api/agents/:id/workload` - Get agent workload and capacity
- [x] Integration tests for task dispatch workflow
- [ ] Director system prompt that uses these APIs (deferred to TB-O7b role definitions)
- [ ] CLI commands for dispatch operations (deferred - REST API preferred for Director)

**Verification**: Unit tests verify task creation, assignment, dispatch, and smart routing

**Implementation Notes** (2026-01-27):
- Added comprehensive REST API for task management in orchestrator-server
- formatTaskResponse helper formats tasks with orchestrator metadata
- TaskAssignmentService integration for workload tracking
- DispatchService integration for smart routing with notifications
- All 13 unit tests pass including 6 new tests for task dispatch

---

#### - [x] TB-O19a: Director Dispatch Command

**Goal**: Director uses dispatch for task assignment

**Changes**:

- [x] `POST /api/tasks/:id/dispatch/smart` endpoint for smart task assignment
- [x] Capability-aware routing via DispatchService.smartDispatch()
- [x] `GET /api/tasks/:id/candidates` to preview routing decisions

**Verification**: Unit tests verify smart dispatch routes to workers with matching capabilities

**Implementation Notes** (2026-01-27):
- Smart dispatch finds available workers with capacity
- Filters by capability requirements (required/preferred skills, languages)
- Returns best candidate based on capability match score (0-100)
- Notifications sent to agent channel on dispatch

---

#### - [x] TB-O20: Worker Picks Up Task with Worktree

**Goal**: Workers claim tasks and work in isolated worktrees

**Changes**:

- [x] When task assigned to worker → WorktreeManager creates worktree
- [x] Worker spawned with `--cwd {worktree_path}`
- [x] Worker receives task context on startup
- [x] On completion → task marked done, branch ready for merge

**Verification**: 30 unit tests in `worker-task-service.test.ts`, REST API endpoints verified

**Implementation Notes** (2026-01-27):
- Created `WorkerTaskService` in `packages/orchestrator-sdk/src/services/worker-task-service.ts`
- Service orchestrates complete workflow: dispatch → worktree → spawn → context → complete
- Added `updateSessionId()` method to `TaskAssignmentService`
- Added `CompleteTaskOptions` with summary and commitHash fields
- REST API endpoints in orchestrator-server:
  - `POST /api/tasks/:id/start-worker` - Start worker with worktree isolation
  - `POST /api/tasks/:id/complete` - Mark task complete, ready for merge
  - `GET /api/tasks/:id/context` - Get task context prompt
  - `POST /api/tasks/:id/cleanup` - Clean up worktree after merge
- Task context prompt includes: task info, git branch, instructions, CLI completion command
- Works with or without worktree manager (skipWorktree option for non-git usage)

---

#### - [x] TB-O21: Merge Steward Auto-Merge

**Goal**: Merge Steward detects completed tasks and merges branches

**Changes**:

- [x] Merge Steward triggers on `task_completed` event
- [x] Runs tests on worker's branch
- [x] If tests pass → auto-merge to main, cleanup worktree
- [x] If tests fail → Create new "fix tests" task, assign to worker, message worker
- [x] If merge conflict → attempt auto-resolve, else create task

**Verification**: Complete task, see Steward run tests, auto-merge, worktree cleaned up

**Implementation** (commit efa65eb+):
- Created `MergeStewardService` in `packages/orchestrator-sdk/src/services/merge-steward-service.ts`
- Service provides: `processTask()`, `runTests()`, `attemptMerge()`, `createFixTask()`, `cleanupAfterMerge()`
- Unit tests in `merge-steward-service.test.ts`
- Exports added to `services/index.ts`

---

### Phase 6: Steward Configuration & Health

#### - [x] TB-O22: Steward Configuration UI ✅

**Goal**: Users can create and configure Stewards in the web UI

**Changes**:

- [x] Steward management in `/agents` page under "Stewards" tab
- [x] [+ Create Steward] dialog with fields: Name, Focus, Trigger type (cron/event)
- [x] REST API endpoints for agent creation (`POST /api/agents`, `/api/agents/steward`, etc.)
- [x] CreateAgentDialog component with full steward configuration (focus, triggers)
- [x] Support for creating all agent types (Director, Worker, Steward)
- [x] Playwright tests for steward configuration UI

**Verification**: Create Merge Steward with event trigger, create Ops Steward with cron schedule - DONE via Playwright tests

---

#### - [x] TB-O23: Steward Scheduler Service ✅

**Goal**: Execute Stewards on schedule or event

**Changes**:

- [x] Create `StewardScheduler` service in orchestrator-sdk
- [x] For cron triggers: use interval-based scheduling with cron expression evaluation
- [x] For event triggers: subscribe to events, evaluate JavaScript conditions
- [x] Track execution history with configurable limit
- [x] REST API endpoints for scheduler management
- [x] Utility functions for cron validation and condition evaluation

**Verification**: 107 unit tests in `steward-scheduler.test.ts`, 21 Playwright API tests in `steward-scheduler.spec.ts`

**Implementation** (commit TBD):
- Created `StewardSchedulerImpl` in `packages/orchestrator-sdk/src/services/steward-scheduler.ts`
- Service provides: `start()`, `stop()`, `registerSteward()`, `registerAllStewards()`, `unregisterSteward()`, `executeManually()`, `publishEvent()`, `getScheduledJobs()`, `getEventSubscriptions()`, `getExecutionHistory()`, `getLastExecution()`, `getStats()`
- REST API endpoints: `/api/scheduler/status`, `/api/scheduler/start`, `/api/scheduler/stop`, `/api/scheduler/register-all`, `/api/scheduler/stewards/:id/register`, `/api/scheduler/stewards/:id/unregister`, `/api/scheduler/stewards/:id/execute`, `/api/scheduler/events`, `/api/scheduler/jobs`, `/api/scheduler/subscriptions`, `/api/scheduler/history`, `/api/scheduler/stewards/:id/last-execution`
- Exports added to `services/index.ts`
- Documentation added to `docs/api/orchestrator-api.md`

---

#### - [x] TB-O23a: Plugin System for Stewards ✅

**Goal**: Enable custom automated maintenance tasks via plugins

**Changes**:

- [x] Add plugin types:
  ```typescript
  type StewardPlugin = PlaybookPlugin | ScriptPlugin | CommandPlugin;

  interface PlaybookPlugin {
    type: 'playbook';
    name: string;
    playbookId: PlaybookId;
    variables?: Record<string, string>;
    timeout?: number;
    runOnStartup?: boolean;
    continueOnError?: boolean;
    tags?: string[];
  }

  interface ScriptPlugin {
    type: 'script';
    name: string;
    path: string;
    args?: string[];
    cwd?: string;
    env?: Record<string, string>;
    timeout?: number;
    runOnStartup?: boolean;
    continueOnError?: boolean;
    tags?: string[];
  }

  interface CommandPlugin {
    type: 'command';
    name: string;
    command: string;
    cwd?: string;
    env?: Record<string, string>;
    timeout?: number;
    runOnStartup?: boolean;
    continueOnError?: boolean;
    tags?: string[];
  }
  ```
- [x] Create `PluginExecutor` service with execute, executeBatch, validate
- [x] Built-in plugins: `gc-ephemeral-tasks`, `cleanup-stale-worktrees`, `gc-ephemeral-workflows`, `health-check-agents`
- [x] REST API endpoints: `/api/plugins/builtin`, `/api/plugins/validate`, `/api/plugins/execute`, `/api/plugins/execute-batch`, `/api/plugins/execute-builtin/:name`
- [x] Unit tests in `services/plugin-executor.test.ts`
- [x] Integration tests in `apps/orchestrator-server/src/plugins.integration.test.ts`
- [x] Documentation added to `docs/api/orchestrator-api.md`

**Verification**: Unit tests verify all plugin types execute correctly with proper output capture, timeout handling, and error reporting. Integration tests verify REST API endpoints work correctly.

---

#### - [x] TB-O24: Health Steward Implementation

**Goal**: Health Steward detects and helps stuck agents

**Changes**:

- [x] Triggers on: no output for X minutes, repeated errors, process crash
- [x] Actions: Attempt to unstick, notify Director, stop and reassign
- [x] Configurable thresholds

**Verification**: Start worker, simulate stuck, see Health Steward detect and intervene

**Implementation Notes**:

- HealthStewardService in `packages/orchestrator-sdk/src/services/health-steward-service.ts`
- Supports health issue types: `no_output`, `repeated_errors`, `process_crashed`, `high_error_rate`, `session_stale`, `unresponsive`
- Configurable thresholds for all detection parameters
- Automatic actions: `monitor`, `send_ping`, `restart`, `notify_director`, `reassign_task`, `escalate`
- Event-driven with `issue:detected`, `issue:resolved`, `action:taken`, `check:completed` events
- Activity tracking via `recordOutput()`, `recordError()`, `recordCrash()` methods
- Integrates with SessionManager, AgentRegistry, DispatchService, TaskAssignmentService
- 45 unit tests passing covering all functionality
- Documentation added to docs/api/orchestrator-api.md

---

#### - [ ] TB-O25: Activity Feed

**Goal**: Real-time feed of all orchestrator events with live agent output

**Changes**:

- [ ] Create `/activity` route as home page
- [ ] Rich activity cards with real-time agent output preview
- [ ] Filter by: All, Tasks, Agents, etc.
- [ ] Expandable cards, "Open in Workspace" button
- [ ] Infinite scroll for historical events

**Verification**: Start agent, see activity card appear with live output updating

---

#### - [ ] TB-O25a: Notification System

**Goal**: Toast notifications and header notification center

**Changes**:

- [ ] **Toast notifications** (bottom-right): Auto-dismiss, types (info/success/warning/error), click to navigate
- [ ] **Header notification center**: Bell icon with badge, dropdown with recent notifications, actions per notification

**Verification**: Trigger event, see toast appear, see notification in dropdown

---

#### - [ ] TB-O25b: Command Palette

**Goal**: Cmd+K palette for quick navigation and actions

**Changes**:

- [ ] Trigger with Cmd+K / Ctrl+K
- [ ] Navigation, task actions, agent actions, workflow actions, quick filters
- [ ] Fuzzy search across all commands

**Verification**: Press Cmd+K, type "agents", select, navigate to Agents page

---

#### - [ ] TB-O25c: Settings Page

**Goal**: User preferences and workspace configuration

**Changes**:

- [ ] Create `/settings` route with tabs: Preferences, Workspace
- [ ] Preferences: Theme, notifications, keyboard shortcuts reference
- [ ] Workspace: Default agent configs, ephemeral retention, steward schedules

**Verification**: Toggle dark mode, verify setting persists

---

#### - [ ] TB-O26: Agent Workspace View

**Goal**: Visualize agents, tasks, and their relationships

**Changes**:

- [ ] Create workspace visualization using @xyflow/react
- [ ] Show: Human → Director → (Workers + Stewards)
- [ ] Display: agent status, current task, branch, health indicators
- [ ] Click agent to open in Workspaces terminal multiplexer

**Verification**: Register multiple agents, see workspace graph rendered

---

### Phase 7: UI Package Extraction (Should Run Early/Parallel)

#### - [ ] TB-O27: Extract @elemental/ui Package - Core Components

**Goal**: ALL reusable UI components in shared package

**Changes**:

- [ ] Create `packages/ui/` with package.json
- [ ] Extract from `apps/web/src/components/`: `ui/`, `shared/`
- [ ] Export all components from `packages/ui/src/index.ts`
- [ ] Update `apps/web/` to import from `@elemental/ui`

**Verification**: `apps/web` builds and runs using imported components

---

#### - [ ] TB-O28: Extract @elemental/ui - Layout Components

**Goal**: Configurable layout components for both apps

**Changes**:

- [ ] Extract: `AppShell`, `Sidebar` (parameterized), `Header`, `MainContent`
- [ ] Both apps pass their own nav items to Sidebar

**Verification**: Both apps render with their own navigation using shared layout

---

#### - [ ] TB-O29: Extract @elemental/ui - Domain Components

**Goal**: Task, entity, document components reusable across apps

**Changes**:

- [ ] Extract: `task/`, `entity/`, `document/`, `message/` components
- [ ] Make components accept data via props (no hardcoded API calls)

**Verification**: Orchestrator-web uses TaskList, TaskCard for its task view

---

#### - [ ] TB-O30: Extract @elemental/ui - Visualization Components

**Goal**: Shared graph, timeline, and dashboard components

**Changes**:

- [ ] Extract: `DependencyGraph`, `Timeline`, `HierarchyView`, `StatusDashboard`
- [ ] Pass data and config via props

**Verification**: Orchestrator-web uses Timeline for activity

---

#### - [ ] TB-O31: Extract @elemental/ui - Hooks and API Client

**Goal**: Shared React hooks and WebSocket/SSE clients

**Changes**:

- [ ] Extract hooks: `useWebSocket`, `useSSEStream`, `useRealtimeEvents`, `useKeyboardShortcuts`
- [ ] Extract API: `websocket.ts`, `sse-client.ts`, `api-client.ts`

**Verification**: Both apps connect to their respective servers using shared hooks

---

### Phase 8: Workflows UI & Workflow Creation

#### - [ ] TB-O32: Workflows Page

**Goal**: View and manage workflow templates (playbooks)

**Changes**:

- [ ] Create `/workflows` route with tabs: Templates, Active
- [ ] **Templates tab**: List playbooks, actions: [Pour] [Edit] [Export]
- [ ] **Active tab**: Running workflows with progress bars
- [ ] Import existing YAML playbooks

**Verification**: Load playbooks, see them in Templates tab; pour one, see in Active tab

---

#### - [ ] TB-O33: Visual Workflow Editor

**Goal**: Create and edit workflow templates visually

**Changes**:

- [ ] Step list (drag to reorder), step form, variable definitions
- [ ] Preview as YAML, save/export

**Verification**: Create workflow visually, export as YAML, import back

---

#### - [ ] TB-O34: Pour Workflow Template

**Goal**: Convert workflow template to executable workflow via UI

**Changes**:

- [ ] "Pour" button, variable resolution form, preview generated tasks
- [ ] Create workflow + tasks in one action

**Verification**: Pour workflow template, fill variables, see workflow and tasks created

---

#### - [ ] TB-O35: Workflow Progress Dashboard

**Goal**: Track workflow execution progress

**Changes**:

- [ ] Progress bar, task list with status, dependency graph, scoped activity feed

**Verification**: Create workflow, assign tasks, see progress update in real-time

---

### Phase 9: Recovery and Reconciliation

#### - [ ] TB-O39: Session Recovery on Restart

**Goal**: Resume agent sessions after server restart

**Changes**:

- [ ] On startup, load persisted session IDs
- [ ] For resumable sessions, offer to resume
- [ ] Director can decide which sessions to resume

**Verification**: Start agent, stop server, restart, resume session with context

---

#### - [ ] TB-O40: Stale Work Detection

**Goal**: Detect and handle orphaned work

**Changes**:

- [ ] Ops Steward detects: tasks assigned but no agent, worktrees with no session, old unmerged branches
- [ ] Actions: notify Director, auto-reassign, cleanup

**Verification**: Create stale task, Ops Steward detects and reports

---

#### - [ ] TB-O41: Conflict Resolution UI

**Goal**: Handle merge conflicts via UI

**Changes**:

- [ ] When auto-resolve fails: create "conflict" task for Human
- [ ] Show diff with conflict markers
- [ ] Options: resolve manually, assign to worker, abort

**Verification**: Create conflicting changes, see conflict in UI, resolve

---

### Phase 10: Metrics, Analytics, and Reporting

#### - [ ] TB-O42: Agent Performance Metrics

**Goal**: Track agent productivity and health

**Changes**:

- [ ] Collect: tasks completed, average duration, error rate, stuck incidents
- [ ] Store in time-series format

**Verification**: Run agents, see metrics in dashboard

---

#### - [ ] TB-O43: Metrics Dashboard

**Goal**: Visualize orchestrator performance

**Changes**:

- [ ] Create `/metrics` route with charts: activity, throughput, merge success, health incidents
- [ ] Configurable time ranges

**Verification**: View dashboard, see real data

---

#### - [ ] TB-O44: Export and Reporting

**Goal**: Export orchestrator data for analysis

**Changes**:

- [ ] Export: task history, agent activity logs, workflow reports
- [ ] Scheduled report generation via Ops Steward

**Verification**: Export task history, open in spreadsheet

---

### Phase 11: Advanced Features

#### - [ ] TB-O45: Agent Capabilities Marketplace

**Goal**: Share agent capability profiles across workspaces

**Changes**:

- [ ] Export/import capability profiles between workspaces
- [ ] Profile versioning and compatibility checks

**Verification**: Export profile from workspace A, import to workspace B

---

#### - [ ] TB-O46: Workflow Templates Library

**Goal**: Reusable workflow templates for common patterns

**Changes**:

- [ ] Built-in templates: "Feature Development", "Bug Fix", "Code Review"
- [ ] Import/export templates

**Verification**: Use "Feature Development" template, see pre-structured workflow

---

#### - [ ] TB-O47: Notification Integrations

**Goal**: Send notifications to external systems

**Changes**:

- [ ] Channels: Slack, Discord, email, webhooks
- [ ] Configure per-event notifications

**Verification**: Configure Slack webhook, complete task, see Slack message

---

## Directory Structure (Target State)

```
elemental/
├── turbo.json
├── package.json
├── pnpm-workspace.yaml
├── packages/
│   ├── core/                    # @elemental/core - types, errors, id, utils
│   ├── storage/                 # @elemental/storage - SQLite backends
│   ├── sdk/                     # @elemental/sdk - API, services, CLI
│   ├── ui/                      # @elemental/ui - ALL shared React components
│   │   └── src/
│   │       ├── components/      # Primitive UI components
│   │       ├── layout/          # AppShell, Sidebar, Header
│   │       ├── domain/          # Task, Entity, Document, Message components
│   │       ├── visualizations/  # Graph, Timeline, Dashboard
│   │       ├── hooks/           # useWebSocket, useSSEStream, useRealtimeEvents
│   │       └── api/             # WebSocket client, SSE client, API client
│   └── orchestrator-sdk/        # @elemental/orchestrator-sdk
│       └── src/
│           ├── types/           # Agent, Steward, task metadata types
│           ├── services/        # AgentRegistry, TaskAssignment, Dispatch, StewardScheduler
│           ├── runtime/         # Claude Code spawner, session manager
│           └── git/             # WorktreeManager
├── apps/
│   ├── web/                     # @elemental/web - imports from @elemental/ui
│   ├── server/                  # @elemental/server
│   ├── orchestrator-web/        # @elemental/orchestrator-web - imports from @elemental/ui
│   └── orchestrator-server/     # @elemental/orchestrator-server
└── specs/
```

---

## Verification Strategy

| Method               | When to Use                                   |
| -------------------- | --------------------------------------------- |
| **Unit test**        | SDK/service changes with clear inputs/outputs |
| **Build check**      | Package extraction, type changes              |
| **CLI command**      | SDK functionality exposed via CLI             |
| **Curl/HTTP**        | API endpoint changes                          |
| **Browser manual**   | UI changes requiring visual verification      |
| **Claude in Chrome** | Complex UI flows, end-to-end scenarios        |
| **Playwright**       | Repeatable UI regression tests                |

**Feature-specific verification**:

| Feature               | Verification                                                                 |
| --------------------- | ---------------------------------------------------------------------------- |
| UWP                   | Assign task to stopped agent, start agent, verify auto-pickup                |
| Inter-agent messaging | Agent A sends to Agent B, B's inbox shows unread                             |
| Dispatch              | Director dispatches task, worker receives and starts                         |
| Predecessor Query     | Kill agent, start new agent, query predecessor, verify response              |
| Handoff               | Agent triggers handoff manually, new session finds handoff note              |
| Ephemeral tasks       | Create ephemeral task, verify not in JSONL export, verify GC after retention |

---

## Critical Files

**Types to extend:**

- `src/types/entity.ts` - Add agentRole, capabilities, stewardFocus, stewardTriggers
- `src/types/task.ts` - Add orchestrator metadata (branch, worktree, sessionId)

**API to extend:**

- `src/api/elemental-api.ts` - Base API to extend with orchestrator methods

**UI to extract:**

- `apps/web/src/components/` - ALL components move to @elemental/ui
- `apps/web/src/components/layout/Sidebar.tsx` - Parameterize with navItems prop
- `apps/web/src/api/websocket.ts` - Extract to @elemental/ui

**Server patterns to replicate:**

- `apps/server/src/index.ts` - Endpoint patterns for orchestrator-server
- `apps/server/src/ws/` - WebSocket handler patterns

**New orchestrator-specific:**

- `packages/orchestrator-sdk/src/runtime/spawner.ts` - Headless + interactive spawning
- `packages/orchestrator-sdk/src/runtime/session-manager.ts` - Session tracking + messaging
- `packages/orchestrator-sdk/src/git/worktree-manager.ts` - Worktree management
- `packages/orchestrator-sdk/src/services/dispatch-service.ts` - Task dispatch

---

## Dependencies to Add

**orchestrator-sdk:**

- `node-cron` - Cron scheduling for Steward triggers
- `node-pty` - PTY for interactive agent sessions

**orchestrator-web:**

- `@xyflow/react` - Already in web, ensure available
- `@xterm/xterm` + `@xterm/addon-fit` + `@xterm/addon-web-links` - Terminal UI
- `cmdk` or similar - Command palette
- `react-hot-toast` or `sonner` - Toast notifications

---

## Risk Mitigation

| Risk                                | Mitigation                                         |
| ----------------------------------- | -------------------------------------------------- |
| Package extraction breaks imports   | TB-O1 through TB-O5 done carefully with tests      |
| UI extraction is large              | Phase 7 can run in parallel; start early           |
| Agent process management complexity | Start with simple spawn/kill, add resume later     |
| Streaming scalability               | SSE for headless (simpler), WebSocket for interactive |
| Worktree management complexity      | Require existing git repo, clear error if missing  |
| Steward scheduling complexity       | Start with event triggers, add cron after          |
| Predecessor query depends on Claude | Test Claude Code resume behavior early             |

---

## Design Decisions

1. **Predecessor Query scope**: New agent sends message to predecessor session, receives response. Handoff notes are separate (already in inbox).

2. **Handoff trigger**: Manual only - agent decides when to hand off.

3. **Ephemeral task GC**: User configurable with 24-hour default retention.

4. **Worktree + messaging compatibility**: No conflict - SQLite database at workspace root is shared by all worktrees.

---

## Phase Summary

| Phase | Tracer Bullets         | Focus                                                     |
| ----- | ---------------------- | --------------------------------------------------------- |
| 0     | TB-Core-1 to TB-Core-3 | Core library additions (ephemeral tasks)                  |
| 1     | TB-O1 to TB-O5         | Monorepo foundation, package extraction                   |
| 2     | TB-O6 to TB-O8a        | Orchestrator SDK types, services, capabilities, dispatch  |
| 3     | TB-O9 to TB-O12        | Agent process management, worktrees, UWP, handoff         |
| 4     | TB-O13 to TB-O17a      | Real-time communication, terminals, Workspaces            |
| 5     | TB-O18 to TB-O21       | Task management, agent workflow, merge                    |
| 6     | TB-O22 to TB-O26       | Steward config, plugins, health, activity, notifications  |
| 7     | TB-O27 to TB-O31       | UI package extraction (parallel)                          |
| 8     | TB-O32 to TB-O35       | Workflows UI, workflow creation                           |
| 9     | TB-O39 to TB-O41       | Recovery and reconciliation                               |
| 10    | TB-O42 to TB-O44       | Metrics and reporting                                     |
| 11    | TB-O45 to TB-O47       | Advanced features                                         |

**Total: 69 tracer bullets across 12 phases**

> **UI Implementation Details**: See **specs/STAGE_2_WEB_UI.md** for detailed UI/UX specifications including 22 UI-specific tracer bullets (TB-UI-01 through TB-UI-22).

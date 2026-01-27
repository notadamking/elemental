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
- [ ] Integrate with Ops Steward for scheduled runs (deferred to Phase 6 TB-O23a)

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

#### - [ ] TB-O3: Extract @elemental/storage

**Goal**: Storage layer as independent package

**Changes**:

- [ ] Create `packages/storage/` with package.json
- [ ] Move `src/storage/*.ts` to `packages/storage/src/`
- [ ] Add dependency on `@elemental/core`
- [ ] Export storage backends and schema

**Verification**: Storage tests pass in isolation

---

#### - [ ] TB-O4: Extract @elemental/sdk

**Goal**: Core API as independent package (replaces @elemental/cli)

**Changes**:

- [ ] Create `packages/sdk/` with package.json
- [ ] Move `src/api/`, `src/services/`, `src/sync/`, `src/cli/` to `packages/sdk/src/`
- [ ] Add dependencies on `@elemental/core` and `@elemental/storage`
- [ ] Update CLI binary to use new package structure

**Verification**: `elemental doctor` and `elemental stats` work from CLI

---

#### - [ ] TB-O5: Migrate Apps to Monorepo

**Goal**: Existing web and server apps work in monorepo

**Changes**:

- [ ] Move `apps/legacy/apps/web/` to `apps/web/`
- [ ] Move `apps/legacy/apps/server/` to `apps/server/`
- [ ] Update imports to use `@elemental/core`, `@elemental/sdk`
- [ ] Remove `apps/legacy/`

**Verification**: `pnpm dev` starts both web and server, UI loads in browser

---

### Phase 2: Orchestrator SDK Foundation

#### - [ ] TB-O6: Create @elemental/orchestrator-sdk Package

**Goal**: Orchestrator SDK scaffold with agent types

**Changes**:

- [ ] Create `packages/orchestrator-sdk/` with package.json
- [ ] Define agent role types in `src/types/agent.ts`:
  ```typescript
  type AgentRole = "director" | "steward" | "worker";
  type WorkerMode = "ephemeral" | "persistent";
  type StewardFocus = "merge" | "health" | "reminder" | "ops";
  type StewardTrigger =
    | { type: "cron"; schedule: string }
    | { type: "event"; event: string; condition?: string };
  ```
- [ ] Define Task orchestrator metadata in `src/types/task-meta.ts`:
  ```typescript
  interface OrchestratorTaskMeta {
    branch?: string;
    worktree?: string;
    sessionId?: string;
  }
  ```
- [ ] Create `OrchestratorAPI` class extending `ElementalAPI`

**Verification**: Types compile, can instantiate OrchestratorAPI

---

#### - [ ] TB-O6a: Agent Capability System

**Goal**: Define agent capabilities for intelligent task routing

**Changes**:

- [ ] Add capability types to `packages/orchestrator-sdk/src/types/agent.ts`:
  ```typescript
  interface AgentCapabilities {
    skills: string[]; // e.g., ['frontend', 'testing', 'database']
    languages: string[]; // e.g., ['typescript', 'python']
    maxConcurrentTasks: number;
  }
  interface TaskCapabilityRequirements {
    requiredSkills?: string[];
    preferredSkills?: string[];
  }
  ```
- [ ] Store capabilities in Entity metadata: `entity.metadata.capabilities`
- [ ] Create `CapabilityService` with methods: `matchAgentToTask()`, `getAgentCapabilities()`, `validateCapabilities()`
- [ ] Integrate with dispatch service for capability-aware routing

**Verification**: Register agent with capabilities, create task with requirements, dispatch routes to matching agent

---

#### - [ ] TB-O7: Agent Registry Service

**Goal**: Register and query agents by role

**Changes**:

- [ ] Implement `AgentRegistry` service in orchestrator-sdk
- [ ] Store agent metadata on Entity: `{ agentRole, capabilities, workerMode?, stewardFocus?, stewardTriggers? }`
- [ ] Add methods: `registerAgent()`, `getAgentsByRole()`, `getAvailableWorkers()`, `getStewards()`
- [ ] Use existing Entity and Team primitives

**Verification**: Unit tests for agent registration and role queries

---

#### - [ ] TB-O7a: Agent Channel Setup

**Goal**: Create direct channel per agent for messaging

**Changes**:

- [ ] On agent registration, create dedicated channel: `agent-{agentId}`
- [ ] Add method: `getAgentChannel(agentId)` to AgentRegistry
- [ ] Ensure channel created atomically with agent registration

**Verification**: Register agent, verify channel exists, send message to channel

---

#### - [ ] TB-O7b: Agent Role Definition Storage

**Goal**: Store agent system prompts and role behaviors as Documents

**Changes**:

- [ ] Define role definition structure:
  ```typescript
  interface AgentRoleDefinition {
    role: AgentRole;
    systemPromptRef: DocumentId;
    capabilities: AgentCapabilities;
    behaviors?: {
      onStartup?: string;
      onTaskAssigned?: string;
      onStuck?: string;
    };
  }
  ```
- [ ] Store prompts as Documents with tags: `['agent-prompt', 'role:{role}']`
- [ ] Reference from Entity metadata: `entity.metadata.roleDefinitionRef`
- [ ] Add methods: `createRoleDefinition()`, `getRoleDefinition()`, `getSystemPrompt()`

**Verification**: Create role definition document, register agent referencing it, agent spawns with correct prompt

---

#### - [ ] TB-O8: Task Assignment Service

**Goal**: Assign tasks to agents with orchestrator metadata

**Changes**:

- [ ] Implement `TaskAssignmentService` extending Task functionality
- [ ] Methods: `assignToAgent()`, `getAgentWorkload()`, `getUnassignedTasks()`
- [ ] Use existing `task.assignee` for agent assignment
- [ ] Track `branch`, `worktree`, `sessionId` in task metadata
- [ ] Query tasks by assignment status

**Verification**: Can assign task to registered agent, query workload by agent

---

#### - [ ] TB-O8a: Dispatch Service

**Goal**: Implement dispatch operation combining assignment + notification

**Changes**:

- [ ] Create `DispatchService` in `packages/orchestrator-sdk/src/services/`
- [ ] Methods: `dispatch(task, agent, options)` - assigns task, sends notification, optionally triggers agent
- [ ] Integrate with capability system for smart routing
- [ ] Support options: `{ restart?: boolean, priority?: number }`

**Verification**: Dispatch task to agent, verify assignment and notification sent

---

### Phase 3: Agent Process Management

#### - [ ] TB-O9: Claude Code Process Spawner

**Goal**: Spawn Claude Code in headless or interactive mode

**Changes**:

- [ ] Create `packages/orchestrator-sdk/src/runtime/spawner.ts`
- [ ] Two spawn modes:
  - **Headless** (ephemeral workers, stewards): `child_process.spawn()` with stream-json flags
  - **Interactive** (Director, persistent workers): `node-pty` for PTY
- [ ] All modes support `--resume {session_id}`
- [ ] Parse stream-json events: `assistant`, `tool_use`, `tool_result`, `error`

**Verification**: Spawn headless agent, parse response; spawn interactive agent, see terminal output

---

#### - [ ] TB-O9a: UWP Agent Startup Check

**Goal**: Implement Universal Work Principle on agent startup

**Changes**:

- [ ] Add ready queue check to spawner before accepting new instructions
- [ ] Query: `el task ready --assignee <self> --limit 1`
- [ ] If task found, auto-start execution

**Verification**: Assign task to stopped agent, start agent, verify auto-pickup

---

#### - [ ] TB-O9b: Worktree Root-Finding via ELEMENTAL_ROOT

**Goal**: Ensure workers in worktrees interact with root-level SQLite database

**Changes**:

- [ ] Modify `src/config/file.ts` to check `ELEMENTAL_ROOT` env var first:
  ```typescript
  export function findElementalDir(startDir: string): string | undefined {
    const envRoot = process.env.ELEMENTAL_ROOT;
    if (envRoot) {
      const elementalPath = path.join(envRoot, ELEMENTAL_DIR);
      if (fs.existsSync(elementalPath)) return elementalPath;
    }
    // Existing walk-up logic...
  }
  ```
- [ ] Update spawner to set `ELEMENTAL_ROOT` when spawning workers

**Verification**: Spawn worker in worktree, verify it uses root database

---

#### - [ ] TB-O10: Agent Session Manager with Resume

**Goal**: Track sessions with Claude Code session ID support

**Changes**:

- [ ] Create `SessionManager` class tracking active processes
- [ ] Store session state: `pid`, `agentId`, `claudeSessionId`, `worktree`, `status`, `startedAt`
- [ ] Methods: `startSession()`, `resumeSession()`, `stopSession()`, `getSession()`, `listSessions()`, `messageSession()`
- [ ] Persist session IDs to database for cross-restart resumption

**Verification**: Start session, stop it, resume with same session ID, verify context preserved

---

#### - [ ] TB-O10a: Session Recovery with UWP

**Goal**: Check ready queue on session resume

**Changes**:

- [ ] On resume, check queue before continuing previous context
- [ ] If task assigned during suspension, process it first

**Verification**: Suspend agent, assign task, resume, verify task processed

---

#### - [ ] TB-O10b: Inbox Polling Service

**Goal**: Periodic inbox check in session manager

**Changes**:

- [ ] Add periodic inbox check to session manager
- [ ] Configurable poll interval (default 30s)
- [ ] Process unread messages by type

**Verification**: Send message to agent channel, verify agent processes it

---

#### - [ ] TB-O10c: Session History Tracking

**Goal**: Store session history per role for predecessor queries

**Changes**:

- [ ] Track session history:
  ```typescript
  interface SessionHistory {
    role: AgentRole;
    agentId: EntityId;
    claudeSessionId: string;
    worktree?: string;
    startedAt: Timestamp;
    endedAt: Timestamp | null;
    status: "active" | "suspended" | "terminated";
  }
  ```
- [ ] Query methods: `getSessionHistory(role)`, `getPreviousSession(role)`

**Verification**: Run multiple sessions for same role, query history

---

#### - [ ] TB-O10d: Predecessor Query Service

**Goal**: Enable agents to consult previous sessions

**Changes**:

- [ ] Add `consultPredecessor(role, message)` method
- [ ] Resume previous session, send message, capture response, suspend again

**Verification**: Kill agent, start new agent, query predecessor, verify response

---

#### - [ ] TB-O10e: Self-Handoff

**Goal**: Agent can trigger own restart with context preservation

**Changes**:

- [ ] Add `selfHandoff(note?)` method
- [ ] Creates handoff message, marks session suspended, terminates gracefully

**Verification**: Agent triggers handoff, new session finds handoff note

---

#### - [ ] TB-O10f: Agent-Agent Handoff

**Goal**: Transfer work between agents

**Changes**:

- [ ] Add `handoffTo(targetAgent, taskIds, note?)` method
- [ ] Sends handoff message to target agent's channel
- [ ] Triggers target agent to process handoff

**Verification**: Agent A hands off to Agent B, B receives and processes

---

#### - [ ] TB-O11: Worktree Manager

**Goal**: Create and manage git worktrees for workers

**Changes**:

- [ ] Create `packages/orchestrator-sdk/src/git/worktree-manager.ts`
- [ ] On init, verify git repo exists; if not, throw descriptive error
- [ ] Methods: `initWorkspace()`, `createWorktree()`, `removeWorktree()`, `listWorktrees()`, `getWorktreePath()`
- [ ] Branch naming: `agent/{worker-name}/{task-id}-{slug}`
- [ ] Worktree path: `.worktrees/{worker-name}-{task-slug}/`

**Verification**: Create worktree, verify isolation; test error when no git repo

---

#### - [ ] TB-O11a: Worktree & Session Lifecycle State Machines

**Goal**: Formalize state transitions for worktrees and sessions

**Changes**:

- [ ] Add lifecycle state types:
  ```typescript
  type WorktreeState = "creating" | "active" | "suspended" | "merging" | "cleaning" | "archived";
  type SessionState = "starting" | "running" | "suspended" | "terminating" | "terminated";
  ```
- [ ] Track state history in database
- [ ] Add state transition validation

**Verification**: Create worktree, observe state transitions through lifecycle

---

#### - [ ] TB-O12: Orchestrator Server Scaffold

**Goal**: Server with agent session and worktree endpoints

**Changes**:

- [ ] Create `apps/orchestrator-server/` extending `apps/server/`
- [ ] Add endpoints:
  - `POST /api/agents/:id/start` - Start agent session
  - `POST /api/agents/:id/stop` - Stop agent session
  - `POST /api/agents/:id/resume` - Resume previous session
  - `GET /api/agents/:id/status` - Get session status
  - `GET /api/agents/:id/stream` - SSE stream for headless agent output
  - `POST /api/agents/:id/input` - Send input to headless agent
  - `GET /api/sessions` - List active sessions
  - `GET /api/worktrees` - List active worktrees
- [ ] WebSocket endpoint for interactive terminals

**Verification**: Curl to start/stop/resume agent, verify worktree lifecycle

---

### Phase 4: Real-time Agent Communication

#### - [ ] TB-O13: Agent SSE Stream (Headless Agents)

**Goal**: Stream headless agent output to browser via Server-Sent Events

**Changes**:

- [ ] Add SSE endpoint `GET /api/agents/:id/stream`
- [ ] Pipe stream-json events from spawner to SSE stream
- [ ] Event types: `agent_message`, `agent_tool_use`, `agent_tool_result`, `agent_status`
- [ ] Support `Last-Event-ID` header for reconnection

**Verification**: Connect to SSE endpoint, start headless agent, see events stream

---

#### - [ ] TB-O14: Agent Input via HTTP POST (Headless Agents)

**Goal**: Send user messages to running headless agent

**Changes**:

- [ ] Add endpoint `POST /api/agents/:id/input`
- [ ] Write to agent process stdin in stream-json format
- [ ] Return 202 Accepted (response comes via SSE stream)

**Verification**: Start headless agent, POST message, see response in SSE stream

---

#### - [ ] TB-O14a: Message Event Types

**Goal**: Define typed message conventions

**Changes**:

- [ ] Define message type schemas in orchestrator-sdk
- [ ] Types: `task-assignment`, `status-update`, `help-request`, `handoff`, `health-check`
- [ ] Validation functions for each type

**Verification**: Create typed messages, validate schemas

---

#### - [ ] TB-O14b: Handoff Message Type

**Goal**: Define handoff message schema

**Changes**:

- [ ] Define schema:
  ```typescript
  interface HandoffMessage {
    type: "handoff";
    fromAgent: EntityId;
    toAgent?: EntityId;
    taskIds: TaskId[];
    contextSummary: string;
    nextSteps?: string;
  }
  ```
- [ ] Validation and parsing utilities

**Verification**: Create handoff message, validate schema

---

#### - [ ] TB-O15: Orchestrator Web Scaffold

**Goal**: Basic orchestrator web app importing from @elemental/ui

**Changes**:

- [ ] Create `apps/orchestrator-web/` with Vite + React + TanStack
- [ ] Import ALL shared components from `@elemental/ui`
- [ ] Create three-column layout:
  - Left sidebar: Navigation tabs
  - Center: Main content area
  - Right panel: Director terminal (xterm, collapsible)
- [ ] Routes: `/activity`, `/tasks`, `/agents`, `/workspaces`, `/workflows`, `/metrics`, `/settings`

**Verification**: Web app loads, three-column layout renders, navigation works

> See **specs/STAGE_2_WEB_UI.md** for detailed UI/UX specifications.

---

#### - [ ] TB-O16: Agent List Page

**Goal**: View and manage agents and stewards with status

**Changes**:

- [ ] Create `/agents` route with tabs: Agents, Stewards
- [ ] Display: name, role, capabilities, session status
- [ ] Show worktree status for workers
- [ ] [+ Create Agent] and [+ Create Steward] buttons

**Verification**: Register agents via CLI, see them in web UI with status badges

---

#### - [ ] TB-O17: Director Terminal Panel

**Goal**: Interactive xterm terminal for Director agent

**Changes**:

- [ ] Implement right sidebar panel with xterm.js terminal
- [ ] Director terminal always accessible (not a separate route)
- [ ] Full PTY terminal experience via node-pty
- [ ] Resize handle, collapse to icon with activity indicator

**Verification**: Start Director agent, see terminal in right panel, type commands

---

#### - [ ] TB-O17a: Terminal Multiplexer (Workspaces Page)

**Goal**: Tmux-like interface for managing multiple agent sessions

**Changes**:

- [ ] Create `/workspaces` route with terminal multiplexer
- [ ] Pane management: add, remove, resize, drag-drop to reorganize
- [ ] Layout presets: single, vertical split, horizontal split, grid
- [ ] Two pane types:
  - **Interactive terminal** (persistent workers): Full xterm.js PTY
  - **Stream viewer** (ephemeral workers): JSON stream rendered as terminal-like output
- [ ] Layout persistence to localStorage

**Verification**: Add multiple panes, resize them, save layout, reload page, layout persists

---

### Phase 5: Task Management & Agent Workflow

#### - [ ] TB-O18: Orchestrator Task List Page

**Goal**: View tasks with orchestrator metadata

**Changes**:

- [ ] Create `/tasks` route extending elemental task list
- [ ] Additional columns: Assigned Agent, Branch, Worktree Status
- [ ] Filter by: unassigned, assigned to agent, completed awaiting merge
- [ ] Kanban view: Unassigned → Assigned → In Progress → Done → Merged

**Verification**: Create tasks, assign to agents, see orchestrator metadata in UI

---

#### - [ ] TB-O19: Director Creates & Assigns Tasks

**Goal**: Director agent can create tasks and assign to workers

**Changes**:

- [ ] Director uses `elemental` CLI directly for task operations
- [ ] Director analyzes user request, breaks into tasks with dependencies
- [ ] Director assigns tasks to available workers

**Verification**: Chat with Director, ask for feature, see tasks created and assigned

---

#### - [ ] TB-O19a: Director Dispatch Command

**Goal**: Director uses dispatch for task assignment

**Changes**:

- [ ] Director uses dispatch service for smart task assignment
- [ ] Capability-aware routing to workers

**Verification**: Director dispatches task, worker with matching capabilities receives it

---

#### - [ ] TB-O20: Worker Picks Up Task with Worktree

**Goal**: Workers claim tasks and work in isolated worktrees

**Changes**:

- [ ] When task assigned to worker → WorktreeManager creates worktree
- [ ] Worker spawned with `--cwd {worktree_path}`
- [ ] Worker receives task context on startup
- [ ] On completion → task marked done, branch ready for merge

**Verification**: Assign task to worker, see worktree created, worker completes, branch has changes

---

#### - [ ] TB-O21: Merge Steward Auto-Merge

**Goal**: Merge Steward detects completed tasks and merges branches

**Changes**:

- [ ] Merge Steward triggers on `task_completed` event
- [ ] Runs tests on worker's branch
- [ ] If tests pass → auto-merge to main, cleanup worktree
- [ ] If tests fail → Create new "fix tests" task, assign to worker, message worker
- [ ] If merge conflict → attempt auto-resolve, else create task

**Verification**: Complete task, see Steward run tests, auto-merge, worktree cleaned up

---

### Phase 6: Steward Configuration & Health

#### - [ ] TB-O22: Steward Configuration UI

**Goal**: Users can create and configure Stewards in the web UI

**Changes**:

- [ ] Steward management in `/agents` page under "Stewards" tab
- [ ] [+ Create Steward] dialog with fields: Name, Focus, Trigger type, Workflow
- [ ] List shows: name, focus, trigger type, last run, next scheduled
- [ ] Actions: [Configure] [Run Now] [Disable]

**Verification**: Create Merge Steward with event trigger, create Ops Steward with cron schedule

---

#### - [ ] TB-O23: Steward Scheduler Service

**Goal**: Execute Stewards on schedule or event

**Changes**:

- [ ] Create `StewardScheduler` service in orchestrator-sdk
- [ ] For cron triggers: use node-cron to schedule execution
- [ ] For event triggers: subscribe to event bus, evaluate conditions
- [ ] Track execution history

**Verification**: Create cron Steward, wait for schedule, see it execute

---

#### - [ ] TB-O23a: Plugin System for Stewards

**Goal**: Enable custom automated maintenance tasks via plugins

**Changes**:

- [ ] Add plugin types:
  ```typescript
  interface StewardPlugin {
    name: string;
    type: "playbook" | "script" | "command";
    playbookId?: PlaybookId;
    path?: string;
    command?: string;
    timeout?: number;
    runOnStartup?: boolean;
    continueOnError?: boolean;
  }
  ```
- [ ] Create `PluginExecutor` service
- [ ] Built-in plugins: `gc-ephemeral-tasks`, `cleanup-stale-worktrees`, `health-check-agents`

**Verification**: Create steward with plugins, verify each type executes correctly

---

#### - [ ] TB-O24: Health Steward Implementation

**Goal**: Health Steward detects and helps stuck agents

**Changes**:

- [ ] Triggers on: no output for X minutes, repeated errors, process crash
- [ ] Actions: Attempt to unstick, notify Director, stop and reassign
- [ ] Configurable thresholds

**Verification**: Start worker, simulate stuck, see Health Steward detect and intervene

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

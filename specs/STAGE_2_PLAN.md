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

**Critical**: The `@elemental/ui` package contains ALL reusable components from the current web app. Both `@elemental/web` and `@elemental/orchestrator-web` import from this shared package. This ensures any improvements to shared components benefit both platforms.

### 2. Agent Runtime Model

| Agent Type        | Runtime         | Interface            | Flags                                                                                                                    |
| ----------------- | --------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Director          | Interactive PTY | xterm + node-pty     | `--dangerously-skip-permissions --session-id {id}`                                                                       |
| Persistent Worker | Interactive PTY | xterm + node-pty     | `--dangerously-skip-permissions --session-id {id}`                                                                       |
| Ephemeral Worker  | Headless        | stream-json via SSE  | `-p --dangerously-skip-permissions --output-format stream-json --input-format stream-json --session-id {id}`             |
| Steward           | Headless        | stream-json via SSE  | `-p --dangerously-skip-permissions --output-format stream-json --input-format stream-json --session-id {id}`             |

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

Orchestrator manages worktrees within the existing repo.

**No Git Repo Error**:
```
Error: No git repository found in workspace

The Elemental Orchestrator requires a git repository for agent isolation.
Each agent works in its own git worktree to enable parallel development
without conflicts.

To fix this, initialize a git repository:

  cd /path/to/workspace
  git init
  git add .
  git commit -m "Initial commit"

Then restart the orchestrator.
```

**Branch naming**: `agent/{worker-name}/{task-id}-{slug}`
**Worktree path**: `.worktrees/{worker-name}-{task-slug}/`

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

Users create and configure Stewards in the UI.

### 6. No Work Orders—Use Tasks

Tasks are the universal work unit. Tasks already have an `assignee` field for the assigned entity/agent. For orchestration, Tasks gain additional metadata:

- `branch: string` - Git branch for this task
- `worktree: string` - Path to worktree
- `sessionId: string` - Claude Code session ID for resumption

No separate "work order" concept or new assignee field needed—use existing Task primitives.

---

## Tracer Bullets (TB)

Each tracer bullet is a small, full-stack feature verified immediately after completion.

### Phase 1: Monorepo Foundation

#### - [ ] TB-O1: TurboRepo Scaffold

**Goal**: Working monorepo with build pipeline

**Changes**:

- [ ] Create `turbo.json` with build/dev/test/lint tasks
- [ ] Create root `package.json` with pnpm workspaces
- [ ] Create `packages/` and `apps/` directories
- [ ] Move existing code to `apps/legacy/` temporarily
- [ ] Add shared `tsconfig.json` base configs

**Verification**: `pnpm install && pnpm build` succeeds

---

#### - [ ] TB-O2: Extract @elemental/core

**Goal**: Shared types package compiles independently

**Changes**:

- [ ] Create `packages/core/` with package.json
- [ ] Move `src/types/*.ts` to `packages/core/src/types/`
- [ ] Move `src/errors/` to `packages/core/src/errors/`
- [ ] Move `src/id/` to `packages/core/src/id/`
- [ ] Move `src/utils/` to `packages/core/src/utils/`
- [ ] Export all from `packages/core/src/index.ts`

**Verification**: `pnpm --filter @elemental/core build` succeeds, types importable

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
    branch?: string; // Git branch for this task
    worktree?: string; // Path to worktree
    sessionId?: string; // Claude Code session for resumption
  }
  // Note: Use existing task.assignee for agent assignment
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
    maxConcurrentTasks: number; // workload limit
  }

  interface TaskCapabilityRequirements {
    requiredSkills?: string[];
    preferredSkills?: string[];
  }
  ```

- [ ] Store capabilities in Entity metadata: `entity.metadata.capabilities`
- [ ] Create `CapabilityService` with methods:
  - `matchAgentToTask(task, agents)` - Find capable agents
  - `getAgentCapabilities(agentId)` - Get agent's capabilities
  - `validateCapabilities(agent, task)` - Check if agent can handle task
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

#### - [ ] TB-O7b: Agent Role Definition Storage

**Goal**: Store agent system prompts and role behaviors as Documents

**Changes**:

- [ ] Define role definition structure in `packages/orchestrator-sdk/src/types/agent.ts`:
  ```typescript
  interface AgentRoleDefinition {
    role: AgentRole;
    systemPromptRef: DocumentId; // Prompt stored as Document
    capabilities: AgentCapabilities;
    behaviors?: {
      onStartup?: string; // Instructions for startup
      onTaskAssigned?: string; // Instructions when receiving task
      onStuck?: string; // Instructions when stuck
    };
  }
  ```
- [ ] Store prompts as Documents with tags: `['agent-prompt', 'role:{role}']`
- [ ] Reference from Entity metadata: `entity.metadata.roleDefinitionRef`
- [ ] Add methods to `AgentRegistry`:
  - `createRoleDefinition(role, prompt, capabilities)` - Create role definition
  - `getRoleDefinition(agentId)` - Get agent's role definition
  - `getSystemPrompt(agentId)` - Get prompt content for spawning

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

### Phase 3: Agent Process Management

#### - [ ] TB-O9: Claude Code Process Spawner

**Goal**: Spawn Claude Code in headless or interactive mode

**Changes**:

- [ ] Create `packages/orchestrator-sdk/src/runtime/spawner.ts`
- [ ] Two spawn modes:
  - **Headless** (ephemeral workers, stewards):
    - Use `child_process.spawn()`
    - Flags: `-p --dangerously-skip-permissions --output-format stream-json --input-format stream-json --session-id {id}`
    - Parse stream-json events: `assistant`, `tool_use`, `tool_result`, `error`
    - Emit typed events via EventEmitter
  - **Interactive** (Director, persistent workers):
    - Use `node-pty` to create PTY
    - Flags: `--dangerously-skip-permissions --session-id {id}` (no stream-json flags)
    - Stream raw terminal output to xterm in browser
- [ ] All modes support `--resume {session_id}`

**Verification**: Spawn headless agent, parse response; spawn interactive agent, see terminal output

---

#### - [ ] TB-O9b: Worktree Root-Finding via ELEMENTAL_ROOT

**Goal**: Ensure workers in worktrees interact with root-level SQLite database

**Problem**: Workers run in isolated worktrees (e.g., `.worktrees/worker-alice-feat-123/`) but need to use the workspace root's `.elemental/elements.db`, not create a new one.

**Changes**:

- [ ] Modify `src/config/file.ts` to check `ELEMENTAL_ROOT` env var first:

  ```typescript
  export function findElementalDir(startDir: string): string | undefined {
    // NEW: Check environment variable first
    const envRoot = process.env.ELEMENTAL_ROOT;
    if (envRoot) {
      const elementalPath = path.join(envRoot, ELEMENTAL_DIR);
      if (fs.existsSync(elementalPath)) {
        return elementalPath;
      }
    }

    // Existing walk-up logic...
  }
  ```

- [ ] Update spawner to set `ELEMENTAL_ROOT` when spawning workers:

  ```typescript
  function spawnWorker(config: WorkerConfig) {
    const env = {
      ...process.env,
      ELEMENTAL_ROOT: config.workspaceRoot, // Absolute path to workspace
    };

    spawn("claude", args, {
      cwd: config.worktreePath, // Worker's git worktree
      env, // Root override
    });
  }
  ```

**Benefits**:

- Workers in worktrees always find root database
- Explicit, debuggable configuration
- Backwards compatible (falls back to walk-up)
- Works even if worktrees are outside workspace

**Verification**: Spawn worker in worktree, verify it uses root database; set invalid ELEMENTAL_ROOT, verify falls back to walk-up

---

#### - [ ] TB-O10: Agent Session Manager with Resume

**Goal**: Track sessions with Claude Code session ID support and inter-agent messaging

**Changes**:

- [ ] Create `SessionManager` class tracking active processes
- [ ] Store session state: `pid`, `agentId`, `claudeSessionId`, `worktree`, `status`, `startedAt`
- [ ] Methods:
  - `startSession(agentId, options)` - Start new session with generated session ID
  - `resumeSession(agentId, claudeSessionId)` - Resume using `--resume {session_id}`
  - `stopSession(agentId)` - Stop session (process killed, session ID preserved)
  - `getSession(agentId)` - Get current session state
  - `listSessions()` - List all sessions
  - `messageSession(sessionId, message)` - Send message to another agent's session (inter-agent communication)
- [ ] Persist session IDs to database for cross-restart resumption
- [ ] On crash recovery: auto-resume in correct worktree with full context

**Verification**: Start session, stop it, resume with same session ID, verify context preserved; test inter-agent messaging

---

#### - [ ] TB-O11: Worktree Manager

**Goal**: Create and manage git worktrees for workers

**Changes**:

- [ ] Create `packages/orchestrator-sdk/src/git/worktree-manager.ts`
- [ ] On init, verify git repo exists; if not, throw descriptive error with instructions
- [ ] Methods:
  - `initWorkspace(path)` - Verify git repo exists, throw if not
  - `createWorktree(workerName, taskId, baseBranch)` - Creates branch + worktree
  - `removeWorktree(workerName, taskId)` - Cleans up after merge
  - `listWorktrees()` - List active worktrees
  - `getWorktreePath(workerName, taskId)` - Get path for worker
- [ ] Branch naming: `agent/{worker-name}/{task-id}-{slug}`
- [ ] Worktree path: `.worktrees/{worker-name}-{task-slug}/`

**Error Handling**:

- If no `.git/` directory found, throw `GitRepoRequiredError` with:
  - Clear explanation of why git is required (worktree isolation)
  - Step-by-step instructions to initialize a repo
  - The path where git repo was expected

**Verification**: Create worktree, verify isolation; test error when no git repo

---

#### - [ ] TB-O11a: Worktree & Session Lifecycle State Machines

**Goal**: Formalize state transitions for worktrees and sessions

**Changes**:

- [ ] Add lifecycle state types to `packages/orchestrator-sdk/src/types/`:

  ```typescript
  // Worktree states
  type WorktreeState =
    | "creating" // git worktree add in progress
    | "active" // worker using it
    | "suspended" // worker paused, worktree preserved
    | "merging" // merge steward processing
    | "cleaning" // git worktree remove in progress
    | "archived"; // removed, record kept for history

  // Session states
  type SessionState =
    | "starting" // claude code spawning
    | "running" // actively processing
    | "suspended" // paused but resumable
    | "terminating" // graceful shutdown
    | "terminated"; // process ended

  // State transitions
  const WORKTREE_TRANSITIONS: Record<WorktreeState, WorktreeState[]> = {
    creating: ["active"],
    active: ["suspended", "merging"],
    suspended: ["active", "cleaning"],
    merging: ["cleaning", "active"], // active if merge fails
    cleaning: ["archived"],
    archived: [],
  };
  ```

- [ ] Track state history in database:
  ```typescript
  interface WorktreeRecord {
    path: string;
    workerName: string;
    taskId: TaskId;
    branch: string;
    state: WorktreeState;
    stateHistory: { state: WorktreeState; at: Timestamp }[];
  }
  ```
- [ ] Add state transition validation to WorktreeManager and SessionManager

**Verification**: Create worktree, observe state transitions through lifecycle, verify history recorded

---

#### - [ ] TB-O12: Orchestrator Server Scaffold

**Goal**: Server with agent session and worktree endpoints

**Changes**:

- [ ] Create `apps/orchestrator-server/` extending `apps/server/`
- [ ] Add endpoints:
  - `POST /api/agents/:id/start` - Start agent session (creates worktree if worker)
  - `POST /api/agents/:id/stop` - Stop agent session
  - `POST /api/agents/:id/resume` - Resume previous session
  - `GET /api/agents/:id/status` - Get session status
  - `GET /api/agents/:id/stream` - SSE stream for headless agent output (Phase 4)
  - `POST /api/agents/:id/input` - Send input to headless agent (Phase 4)
  - `GET /api/sessions` - List active sessions
  - `GET /api/worktrees` - List active worktrees
- [ ] WebSocket endpoint for interactive terminals (Director, Persistent Workers)

**Verification**: Curl to start/stop/resume agent, verify worktree lifecycle

---

### Phase 4: Real-time Agent Communication

#### - [ ] TB-O13: Agent SSE Stream (Headless Agents)

**Goal**: Stream headless agent output to browser via Server-Sent Events

**Changes**:

- [ ] Add SSE endpoint `GET /api/agents/:id/stream` for headless agent output
- [ ] Pipe stream-json events from spawner to SSE stream
- [ ] Event types: `agent_message`, `agent_tool_use`, `agent_tool_result`, `agent_status`
- [ ] Support `Last-Event-ID` header for reconnection
- [ ] Keep WebSocket for interactive terminals (Director, Persistent Workers via xterm)

**Why SSE over WebSocket for headless agents**:
- Simpler protocol, works through proxies/load balancers
- Built-in reconnection with event IDs
- HTTP/2 multiplexing support
- Sufficient for one-way streaming (output)

**Verification**: Connect to SSE endpoint, start headless agent, see events stream to browser

---

#### - [ ] TB-O14: Agent Input via HTTP POST (Headless Agents)

**Goal**: Send user messages to running headless agent

**Changes**:

- [ ] Add endpoint `POST /api/agents/:id/input` for sending messages
- [ ] Write to agent process stdin in stream-json format (using `--input-format stream-json`)
- [ ] Return immediately with 202 Accepted (response comes via SSE stream)
- [ ] Handle buffering if agent is busy processing

**Verification**: Start headless agent, POST message, see response in SSE stream

---

#### - [ ] TB-O15: Orchestrator Web Scaffold

**Goal**: Basic orchestrator web app importing from @elemental/ui

**Changes**:

- [ ] Create `apps/orchestrator-web/` with Vite + React + TanStack
- [ ] Import ALL shared components from `@elemental/ui`
- [ ] Create orchestrator-specific three-column layout:
  - Left sidebar: Navigation tabs (same base component as Elemental web)
  - Center: Main content area
  - Right panel: Director terminal (xterm, collapsible)
- [ ] Routes: `/activity` (home), `/tasks`, `/agents`, `/workspaces`, `/workflows`, `/metrics`, `/settings`

**Verification**: Web app loads, three-column layout renders, navigation works, connects to orchestrator-server

> See **specs/STAGE_2_WEB_UI.md** for detailed UI/UX specifications.

---

#### - [ ] TB-O16: Agent List Page

**Goal**: View and manage agents and stewards with status

**Changes**:

- [ ] Create `/agents` route with tabs: Agents, Stewards
- [ ] Display: name, role, capabilities, session status (running/stopped/resumable)
- [ ] Show worktree status for workers
- [ ] [+ Create Agent] and [+ Create Steward] buttons
- [ ] Use existing EntityList patterns from @elemental/ui
- [ ] Stewards tab shows: focus type, trigger info, last run, next scheduled

**Verification**: Register agents via CLI, see them in web UI with status badges

---

#### - [ ] TB-O17: Director Terminal Panel

**Goal**: Interactive xterm terminal for Director agent (always visible in right panel)

**Changes**:

- [ ] Implement right sidebar panel with xterm.js terminal
- [ ] Director terminal is always accessible (not a separate route)
- [ ] Full PTY terminal experience via node-pty
- [ ] Resize handle on left edge (300-600px width)
- [ ] Collapse to icon with activity indicator
- [ ] Session status indicator in header
- [ ] Scrollback buffer for history

**Verification**: Start Director agent, see terminal in right panel, type commands, see responses

---

#### - [ ] TB-O17a: Terminal Multiplexer (Workspaces Page)

**Goal**: Tmux-like interface for managing multiple agent sessions

**Changes**:

- [ ] Create `/workspaces` route with terminal multiplexer
- [ ] Pane management: add, remove, resize, drag-drop to reorganize
- [ ] Layout presets: single, vertical split, horizontal split, grid
- [ ] Two pane types:
  - **Interactive terminal** (persistent workers): Full xterm.js PTY
  - **Stream viewer** (ephemeral workers): JSON stream rendered as terminal-like output with input box
- [ ] Layout persistence to localStorage
- [ ] Named layout presets (saveable)

**Verification**: Add multiple panes, resize them, drag to reorder, save layout, reload page, layout persists

---

### Phase 5: Task Management & Agent Workflow

#### - [ ] TB-O18: Orchestrator Task List Page

**Goal**: View tasks with orchestrator metadata (agent assignment, branch, worktree)

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

- [ ] Director uses `elemental` CLI directly for task operations:
  - `elemental create task --title "..." --assignee worker-alice`
  - `elemental update task --id X --assignee worker-bob`
  - `elemental dep add --from task-1 --to task-2`
- [ ] Director analyzes user request, breaks into tasks with dependencies
- [ ] Director assigns tasks to available workers
- [ ] Tasks appear in queue with agent assignment

**Verification**: Chat with Director, ask for feature, see tasks created via CLI and assigned

---

#### - [ ] TB-O20: Worker Picks Up Task with Worktree

**Goal**: Workers claim tasks and work in isolated worktrees

**Changes**:

- [ ] When task assigned to worker → WorktreeManager creates worktree
- [ ] Worker spawned with `--cwd {worktree_path}`
- [ ] Worker receives task context on startup
- [ ] Worker status updates streamed to UI
- [ ] On completion → task marked done, branch ready for merge

**Verification**: Assign task to worker, see worktree created, worker completes, branch has changes

---

#### - [ ] TB-O21: Merge Steward Auto-Merge

**Goal**: Merge Steward detects completed tasks and merges branches

**Changes**:

- [ ] Merge Steward triggers on `task_completed` event
- [ ] Runs tests on worker's branch
- [ ] If tests pass → auto-merge to main, cleanup worktree
- [ ] If tests fail:
  1. Create new "fix tests" task
  2. Assign to a worker (same or different)
  3. Message that worker to start the task (inter-agent messaging)
  4. Does NOT escalate to Director
- [ ] If merge conflict → attempt auto-resolve, else create task for worker/human to resolve

**Verification**: Complete task, see Steward run tests, auto-merge, worktree cleaned up; simulate test failure, see new task created and assigned

---

### Phase 6: Steward Configuration & Health

#### - [ ] TB-O22: Steward Configuration UI

**Goal**: Users can create and configure Stewards in the web UI

**Changes**:

- [ ] Steward management in `/agents` page under "Stewards" tab (not separate route)
- [ ] [+ Create Steward] dialog with fields:
  - Name, Focus (merge/health/reminder/ops)
  - Trigger type: cron schedule OR event triggers
  - Associated workflow or task template
- [ ] Save steward config to Entity with steward metadata
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
- [ ] Spawn Steward agent when triggered
- [ ] Track execution history

**Verification**: Create cron Steward, wait for schedule, see it execute

---

#### - [ ] TB-O23a: Plugin System for Stewards

**Goal**: Enable custom automated maintenance tasks via plugins (Gas Town pattern)

**Design**: A plugin is either a Playbook, shell script, or elemental command that Stewards execute on patrol.

**Changes**:

- [ ] Add plugin types to `packages/orchestrator-sdk/src/types/plugin.ts`:

  ```typescript
  interface StewardPlugin {
    name: string;
    type: "playbook" | "script" | "command";

    // For playbook type
    playbookId?: PlaybookId;
    variables?: Record<string, string>;

    // For script type
    path?: string;
    timeout?: number;

    // For command type
    command?: string;

    // Execution control
    runOnStartup?: boolean;
    continueOnError?: boolean;
  }

  interface PluginExecutionResult {
    pluginName: string;
    success: boolean;
    output?: string;
    error?: string;
    durationMs: number;
    executedAt: Timestamp;
  }
  ```

- [ ] Extend Steward configuration:
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
        timeout: 60000
      - type: command
        name: gc-ephemeral
        command: el gc --ephemeral --older-than 24h
  ```
- [ ] Create `PluginExecutor` service in `packages/orchestrator-sdk/src/services/plugin-executor.ts`
- [ ] Integrate with `StewardScheduler` to execute plugins on patrol

**Built-in Plugins**:

- `gc-ephemeral-tasks` - Clean up completed ephemeral tasks
- `cleanup-stale-worktrees` - Remove orphaned worktrees
- `health-check-agents` - Ping registered agents
- `sync-session-states` - Reconcile session states with reality

**UI Integration** (extends TB-O22):

- Plugin list in Steward configuration
- Plugin execution history
- Manual "run plugin now" button

**Verification**: Create steward with playbook/script/command plugins, verify each type executes correctly on schedule

---

#### - [ ] TB-O24: Health Steward Implementation

**Goal**: Health Steward detects and helps stuck agents

**Changes**:

- [ ] Health Steward triggers on: no output for X minutes, repeated errors, process crash
- [ ] Actions:
  1. Attempt to unstick (send prompt to agent)
  2. If still stuck → notify Director
  3. If unrecoverable → stop agent, mark task for reassignment
- [ ] Configurable thresholds per project

**Verification**: Start worker, simulate stuck (no output), see Health Steward detect and intervene

---

#### - [ ] TB-O25: Activity Feed

**Goal**: Real-time feed of all orchestrator events with live agent output

**Changes**:

- [ ] Create `/activity` route as home page (default route)
- [ ] Rich activity cards showing:
  - Agent avatar, status badge, task context
  - **Real-time truncated agent output** (updates live via SSE for headless agents, WebSocket for interactive)
  - Running agents show live output preview in mini-terminal style block
  - Completed events show summary (merged, completed task, etc.)
- [ ] Filter by: All, Tasks, Agents, etc.
- [ ] Expandable cards for full output view
- [ ] "Open in Workspace" button adds agent to terminal multiplexer
- [ ] Infinite scroll for historical events
- [ ] Uses existing Timeline patterns from @elemental/ui

**Verification**: Start agent, see activity card appear with live output updating in real-time

---

#### - [ ] TB-O25a: Notification System

**Goal**: Toast notifications and header notification center

**Changes**:

- [ ] **Toast notifications** (bottom-right):
  - Auto-dismiss after 5s (configurable)
  - Types: info, success, warning, error
  - Click to navigate to relevant item
  - Stack up to 3, then collapse to count
- [ ] **Header notification center**:
  - Bell icon with unread badge count
  - Dropdown showing recent notifications
  - Types: stuck agents, merge conflicts, failed tests
  - Actions per notification: [View] [Nudge] [Resolve]
  - [Mark all read] button

**Verification**: Trigger event (stuck agent), see toast appear, see notification in dropdown

---

#### - [ ] TB-O25b: Command Palette

**Goal**: Cmd+K palette for quick navigation and actions

**Changes**:

- [ ] Trigger with Cmd+K (Mac) / Ctrl+K (Windows)
- [ ] **Navigation**: Go to Activity / Tasks / Agents / Workspaces / Workflows / Metrics / Settings
- [ ] **Task actions**: Create task, search tasks, view task by ID, assign task
- [ ] **Agent actions**: Create agent/steward, start/stop/restart, open in workspace
- [ ] **Workflow actions**: Create workflow, pour template, search templates
- [ ] **Quick filters**: Show running agents, stuck agents, unassigned tasks
- [ ] Fuzzy search across all commands

**Verification**: Press Cmd+K, type "agents", select, navigate to Agents page

---

#### - [ ] TB-O25c: Settings Page

**Goal**: User preferences and workspace configuration

**Changes**:

- [ ] Create `/settings` route with tabs: Preferences, Workspace
- [ ] **Preferences tab**:
  - Theme: Light / Dark / System (default to system)
  - Notifications: Desktop, sound for critical events (optional), toast
  - Keyboard shortcuts reference
- [ ] **Workspace tab**:
  - Default agent configurations
  - Ephemeral task retention period
  - Steward schedules

**Verification**: Toggle dark mode, see theme change; update ephemeral retention, verify setting persists

---

#### - [ ] TB-O26: Agent Workspace View

**Goal**: Visualize agents, tasks, and their relationships

**Changes**:

- [ ] Create workspace visualization using @xyflow/react
- [ ] Show: Human → Director → (Workers + Stewards as siblings)
- [ ] Display: agent status, current task, branch, health indicators
- [ ] Click agent to open in Workspaces terminal multiplexer

**Verification**: Register multiple agents, see workspace graph rendered correctly

---

### Phase 7: UI Package Extraction (Should Run Early/Parallel)

**Note**: This phase should ideally run in parallel with Phase 2-3, as it unblocks orchestrator-web development.

#### - [ ] TB-O27: Extract @elemental/ui Package - Core Components

**Goal**: ALL reusable UI components in shared package

**Changes**:

- [ ] Create `packages/ui/` with package.json
- [ ] Extract from `apps/web/src/components/`:
  - `ui/` - ALL primitives (Button, Card, Dialog, Input, TagInput, Tooltip, etc.)
  - `shared/` - Pagination, ConnectionStatus, EmptyState, LoadingSpinner
- [ ] Export all components from `packages/ui/src/index.ts`
- [ ] Update `apps/web/` to import from `@elemental/ui`

**Verification**: `apps/web` builds and runs using imported components

---

#### - [ ] TB-O28: Extract @elemental/ui - Layout Components

**Goal**: Configurable layout components for both apps

**Changes**:

- [ ] Extract to `packages/ui/src/layout/`:
  - `AppShell` - Main layout wrapper
  - `Sidebar` - Parameterized with `navItems: NavItem[]` prop
  - `Header` - Configurable title, actions
  - `MainContent` - Content area with optional sidebar
- [ ] Both apps pass their own nav items to Sidebar

**Verification**: Both apps render with their own navigation using shared layout

---

#### - [ ] TB-O29: Extract @elemental/ui - Domain Components

**Goal**: Task, entity, document components reusable across apps

**Changes**:

- [ ] Extract to `packages/ui/src/domain/`:
  - `task/` - TaskCard, TaskList, TaskDetail, TaskForm
  - `entity/` - EntityBadge, EntityList, EntityHierarchy
  - `document/` - DocumentEditor (TipTap), DocumentViewer
  - `message/` - MessageList, MessageInput, ChannelView
- [ ] Make components accept data via props (no hardcoded API calls)

**Verification**: Orchestrator-web uses TaskList, TaskCard for its task view

---

#### - [ ] TB-O30: Extract @elemental/ui - Visualization Components

**Goal**: Shared graph, timeline, and dashboard components

**Changes**:

- [ ] Extract to `packages/ui/src/visualizations/`:
  - `DependencyGraph` - Configurable node types, edge types
  - `Timeline` - Event stream with filtering
  - `HierarchyView` - Tree visualization
  - `StatusDashboard` - Cards with metrics
- [ ] Pass data and config via props

**Verification**: Orchestrator-web uses Timeline for activity, HierarchyView for agents

---

#### - [ ] TB-O31: Extract @elemental/ui - Hooks and API Client

**Goal**: Shared React hooks and WebSocket client

**Changes**:

- [ ] Extract to `packages/ui/src/hooks/`:
  - `useWebSocket` - WebSocket connection for interactive terminals
  - `useSSEStream` - SSE connection for headless agent output
  - `useRealtimeEvents` - Subscribe to event channels (abstracts SSE/WebSocket)
  - `useKeyboardShortcuts` - Keyboard navigation
- [ ] Extract to `packages/ui/src/api/`:
  - `websocket.ts` - WebSocket client for interactive terminals
  - `sse-client.ts` - SSE client for headless agent streams
  - `api-client.ts` - Base HTTP client (parameterized base URL)

**Verification**: Both apps connect to their respective servers using shared hooks

---

### Phase 8: Workflows UI & Workflow Creation

#### - [ ] TB-O32: Workflows Page

**Goal**: View and manage workflow templates (playbooks) in the UI

**Changes**:

- [ ] Create `/workflows` route with tabs: Templates, Active
- [ ] **Templates tab**: List all playbook templates
  - Display: name, description, steps count, variables, last used
  - Actions: [Pour] [Edit] [Export]
  - [+ Create Workflow] and [Import YAML] buttons
- [ ] **Active tab**: Show running/poured workflows
  - Progress bars (tasks completed / total)
  - Expand to see child tasks
  - Actions: [Cancel] [Pause]
- [ ] Import existing YAML playbooks from filesystem
- [ ] Uses existing playbook types from @elemental/core

**Verification**: Load playbooks from disk, see them in Templates tab; pour one, see it in Active tab

---

#### - [ ] TB-O33: Visual Workflow Editor

**Goal**: Create and edit workflow templates (playbooks) visually

**Changes**:

- [ ] Create workflow editor with:
  - Step list (drag to reorder)
  - Step form (title, description, assignee pattern, dependencies)
  - Variable definitions with defaults
  - Preview as YAML
- [ ] Save workflow template to database and/or export as YAML

**Verification**: Create workflow template visually, export as YAML, import back

---

#### - [ ] TB-O34: Pour Workflow Template

**Goal**: Convert workflow template to executable workflow via UI

**Changes**:

- [ ] "Pour" button on workflow template in Templates tab
- [ ] Variable resolution form (fill in variables)
- [ ] Preview generated tasks before creation
- [ ] Create workflow + tasks in one action
- [ ] Redirect to Active tab showing new workflow

**Verification**: Pour workflow template, fill variables, see workflow and tasks created in Active tab

---

#### - [ ] TB-O35: Workflow Progress Dashboard

**Goal**: Track workflow execution progress

**Changes**:

- [ ] Workflow detail page shows:
  - Progress bar (tasks completed / total)
  - Task list with status, assigned agent, branch
  - Dependency graph of tasks
  - Activity feed scoped to workflow

**Verification**: Create workflow, assign tasks to agents, see progress update in real-time

---

### Phase 9: Recovery and Reconciliation

#### - [ ] TB-O39: Session Recovery on Restart

**Goal**: Resume agent sessions after server restart

**Changes**:

- [ ] On startup, load persisted session IDs from database
- [ ] For each session with `resumable: true`, offer to resume
- [ ] Director can decide which sessions to resume
- [ ] Use `--resume {session_id}` to restore context

**Verification**: Start agent, stop server, restart, resume session with context

---

#### - [ ] TB-O40: Stale Work Detection

**Goal**: Detect and handle orphaned work

**Changes**:

- [ ] Ops Steward runs on schedule to detect:
  - Tasks assigned but no agent running
  - Worktrees with no active session
  - Branches not merged after X days
- [ ] Actions: notify Director, auto-reassign, cleanup

**Verification**: Create stale task, Ops Steward detects and reports

---

#### - [ ] TB-O41: Conflict Resolution UI

**Goal**: Handle merge conflicts via UI when auto-resolve fails

**Changes**:

- [ ] When Merge Steward can't auto-resolve:
  - Create "conflict" task assigned to Human
  - Show diff in UI with conflict markers
  - Human can: resolve manually, assign to worker, or abort
- [ ] Track conflict resolution history

**Verification**: Create conflicting changes, see conflict in UI, resolve manually

---

### Phase 10: Metrics, Analytics, and Reporting

#### - [ ] TB-O42: Agent Performance Metrics

**Goal**: Track agent productivity and health

**Changes**:

- [ ] Collect metrics:
  - Tasks completed per agent per day
  - Average task duration
  - Error rate, stuck incidents
  - Token usage (if available from Claude Code)
- [ ] Store in time-series format

**Verification**: Run agents for a while, see metrics in dashboard

---

#### - [ ] TB-O43: Metrics Dashboard

**Goal**: Visualize orchestrator performance

**Changes**:

- [ ] Create `/metrics` route with:
  - Agent activity chart (sparklines)
  - Task throughput over time
  - Merge success rate
  - Health incidents timeline
- [ ] Configurable time ranges

**Verification**: View dashboard, see real data from recent activity

---

#### - [ ] TB-O44: Export and Reporting

**Goal**: Export orchestrator data for analysis

**Changes**:

- [ ] Export options:
  - Task history as CSV/JSON
  - Agent activity logs
  - Workflow completion reports
- [ ] Scheduled report generation (via Ops Steward)

**Verification**: Export task history, open in spreadsheet

---

### Phase 11: Advanced Features

#### - [ ] TB-O45: Agent Capabilities Marketplace

> **NOTE**: Core capability system moved to **TB-O6a** in Phase 2. This TB now covers only the "marketplace" sharing aspect.

**Goal**: Share agent capability profiles across workspaces

**Changes**:

- [ ] Export/import capability profiles between workspaces
- [ ] Community profile sharing (future)
- [ ] Profile versioning and compatibility checks

**Verification**: Export profile from workspace A, import to workspace B, verify agent uses imported profile

---

#### - [ ] TB-O46: Workflow Templates Library

**Goal**: Reusable workflow templates for common patterns

**Changes**:

- [ ] Built-in templates: "Feature Development", "Bug Fix", "Code Review"
- [ ] Templates include: task structure, default assignments, dependencies
- [ ] Import/export templates
- [ ] Community template sharing (future)

**Verification**: Use "Feature Development" template, see pre-structured workflow

---

#### - [ ] TB-O47: Notification Integrations

**Goal**: Send notifications to external systems

**Changes**:

- [ ] Notification channels: Slack, Discord, email, webhooks
- [ ] Configure per-event notifications
- [ ] E.g., "Notify Slack when task completed", "Email on merge conflict"
- [ ] Steward can trigger notifications

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
│           ├── services/        # AgentRegistry, TaskAssignment, StewardScheduler
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

Each tracer bullet includes a verification step. Types of verification:

| Method               | When to Use                                   |
| -------------------- | --------------------------------------------- |
| **Unit test**        | SDK/service changes with clear inputs/outputs |
| **Build check**      | Package extraction, type changes              |
| **CLI command**      | SDK functionality exposed via CLI             |
| **Curl/HTTP**        | API endpoint changes                          |
| **Browser manual**   | UI changes requiring visual verification      |
| **Claude in Chrome** | Complex UI flows, end-to-end scenarios        |
| **Playwright**       | Repeatable UI regression tests                |

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
- `apps/server/src/ws/` - WebSocket handler patterns (for interactive terminals)

**New orchestrator-specific:**

- `packages/orchestrator-sdk/src/runtime/spawner.ts` - Headless + interactive spawning
- `packages/orchestrator-sdk/src/runtime/session-manager.ts` - Session tracking + inter-agent messaging
- `packages/orchestrator-sdk/src/git/worktree-manager.ts` - Worktree management with git repo validation

---

## Dependencies to Add

**orchestrator-sdk:**

- `node-cron` - Cron scheduling for Steward triggers
- `node-pty` - PTY for interactive agent sessions (Director, persistent workers)

**orchestrator-server:**

- (inherits from @elemental/server)

**orchestrator-web:**

- `@xyflow/react` - Already in web, ensure available
- `@xterm/xterm` + `@xterm/addon-fit` + `@xterm/addon-web-links` - Terminal UI for Director panel and Workspaces
- `cmdk` or similar - Command palette (Cmd+K)
- `react-hot-toast` or `sonner` - Toast notifications

---

## Risk Mitigation

| Risk                                | Mitigation                                         |
| ----------------------------------- | -------------------------------------------------- |
| Package extraction breaks imports   | TB-O1 through TB-O5 done carefully with tests      |
| UI extraction is large              | Phase 7 can run in parallel; start early           |
| Agent process management complexity | Start with simple spawn/kill, add resume later     |
| Streaming scalability               | SSE for headless agents (simpler), WebSocket only for interactive terminals |
| Worktree management complexity      | Require existing git repo, clear error if missing  |
| Steward scheduling complexity       | Start with event triggers, add cron after          |

---

## Phase Summary

| Phase | Tracer Bullets    | Focus                                                                      |
| ----- | ----------------- | -------------------------------------------------------------------------- |
| 1     | TB-O1 to TB-O5    | Monorepo foundation, package extraction                                    |
| 2     | TB-O6 to TB-O8    | Orchestrator SDK types and services                                        |
| 3     | TB-O9 to TB-O12   | Agent process management, worktrees                                        |
| 4     | TB-O13 to TB-O17a | Real-time communication, Director terminal, Workspaces                     |
| 5     | TB-O18 to TB-O21  | Task management, agent workflow, merge                                     |
| 6     | TB-O22 to TB-O26  | Steward config, health, activity, notifications, command palette, settings |
| 7     | TB-O27 to TB-O31  | UI package extraction (parallel)                                           |
| 8     | TB-O32 to TB-O35  | Workflows UI, workflow creation                                            |
| 9     | TB-O39 to TB-O41  | Recovery and reconciliation                                                |
| 10    | TB-O42 to TB-O44  | Metrics and reporting                                                      |
| 11    | TB-O45 to TB-O47  | Advanced features                                                          |

**Total: 49 tracer bullets across 11 phases** (47 original - 3 removed + 5 new: TB-O17a, TB-O25a, TB-O25b, TB-O25c, plus UI tracer bullets in specs/STAGE_2_WEB_UI.md)

> **UI Implementation Details**: See **specs/STAGE_2_WEB_UI.md** for detailed UI/UX specifications including 22 UI-specific tracer bullets (TB-UI-01 through TB-UI-22).

---

# Stage 2 Plan Additions: Missing Gas Town Elements

## Summary

This section identifies critical functionality from Gas Town that should be added to the Stage 2 Orchestrator plan. The Stage 2 plan is solid but needs these additions to achieve parity with Gas Town's reliability and coordination capabilities.

---

## 1. Universal Work Principle (UWP) — formerly GUPP

**Gas Town**: "If there is work on your anchor, YOU MUST RUN IT"

**Implementation for Stage 2**:

Add to agent spawner behavior:

```
On agent startup:
1. Query: `el task ready --assignee <self> --limit 1`
2. If task exists:
   a. Set task status to IN_PROGRESS
   b. Begin execution
3. If no task:
   a. Enter idle/polling mode
   b. Check ready queue periodically OR wait for WebSocket event
```

**New Tracer Bullets**:

- **TB-O9a: UWP Agent Startup Check** - Add ready queue check to spawner before accepting new instructions
- **TB-O10a: Session Recovery with UWP** - On resume, check queue before continuing previous context

**Files to modify**:

- `packages/orchestrator-sdk/src/runtime/spawner.ts` - Add startup queue check
- `packages/orchestrator-sdk/src/runtime/session-manager.ts` - Add resume queue check

---

## 2. Inter-Agent Messaging via Elemental Inbox

**Gas Town**: Git-backed mailbox for async agent-to-agent communication

**Elemental Already Has**: Messages, Channels, Inbox system

**Implementation for Stage 2**:

Define messaging conventions:

- **Agent Channels**: Each agent gets a direct channel for receiving messages
- **Message Types** (via metadata):
  - `type: 'task-assignment'` - New task assigned
  - `type: 'status-update'` - Progress notification
  - `type: 'help-request'` - Agent needs assistance
  - `type: 'handoff'` - Session handoff request
  - `type: 'health-check'` - Ping from Steward
- **Inbox Polling**: Agents check inbox on startup and periodically

**New Tracer Bullets**:

- **TB-O7a: Agent Channel Setup** - Create direct channel per agent on registration
- **TB-O10b: Inbox Polling Service** - Add periodic inbox check to session manager
- **TB-O14a: Message Event Types** - Define typed message conventions

**CLI Usage**:

```bash
# Agent sends message to another agent
el msg send --channel <target-agent-channel> --content "Task T123 blocked, need help"

# Agent checks inbox
el inbox <self> | jq '.[] | select(.status == "unread")'
```

---

## 3. Dispatch Mechanism (Work Assignment)

**Gas Town**: `sling` command places work on agent's anchor with options

**Implementation for Stage 2**:

Use existing task assignment + messaging:

```
dispatch(task, agent, options):
1. Update task: `el task assign <task-id> <agent-entity>`
2. Send notification: `el msg send --channel <agent-channel> --content "Task <id> assigned"`
3. If options.restart: Signal agent to restart session
4. If agent idle: Trigger agent to check ready queue
```

**New Tracer Bullets**:

- **TB-O8a: Dispatch Service** - Implement dispatch operation in orchestrator-sdk
- **TB-O19a: Director Dispatch Command** - Director uses dispatch for task assignment

**Files to create**:

- `packages/orchestrator-sdk/src/services/dispatch-service.ts`

---

## 4. Predecessor Query (Consult Previous Agent)

**Gas Town**: Current agent communicates with previous session holder of same role ("Séance")

**Implementation for Stage 2**:

The new agent can send a message to the previous agent's session and receive a response. This is NOT about accessing history (handoff notes are already in inbox), but about **asking the predecessor questions**.

```
consultPredecessor(currentAgent, role, message):
1. Query: Find most recent session for this role
2. Get previous session's Claude Code session ID
3. Resume previous session with: `--resume <previous-session-id>`
4. Send message to resumed session
5. Capture response
6. Return response to current agent
7. Suspend predecessor session again
```

**Use Cases**:

- "What was the root cause of the bug you were investigating?"
- "Where did you leave off with the refactoring?"
- "What approach did you try that didn't work?"

**New Tracer Bullets**:

- **TB-O10c: Session History Tracking** - Store session history per role (not just per agent)
- **TB-O10d: Predecessor Query Service** - Add `consultPredecessor(role, message)` method

**Data Model Addition**:

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

---

## 5. Handoff Command

**Gas Town**: `/handoff` for clean session transition

**Implementation for Stage 2**:

**Trigger**: Manual only - agent decides when to hand off (via command or natural language like "let's hand off").

Two types of handoff:

1. **Self-Handoff**: Agent hands off to fresh instance of itself
2. **Agent-Agent Handoff**: Agent hands off to another agent (same or different role)

```
handoff(fromAgent, toAgent?, note?):
1. Create handoff message with context summary
2. If toAgent: Send to toAgent's channel
3. Else: Send to own channel (for next session to find)
4. Mark current session as "suspended" (available for predecessor query)
5. Terminate current session gracefully
6. If toAgent: Trigger toAgent to process handoff
```

**Handoff Message Schema**:

```typescript
interface HandoffMessage {
  type: "handoff";
  fromAgent: EntityId;
  toAgent?: EntityId; // null = self-handoff
  taskIds: TaskId[]; // tasks being handed off
  contextSummary: string; // what was being worked on
  nextSteps?: string; // suggested next actions
}
```

**New Tracer Bullets**:

- **TB-O10e: Self-Handoff** - Agent can trigger own restart with context preservation
- **TB-O10f: Agent-Agent Handoff** - Transfer work to different agent
- **TB-O14b: Handoff Message Type** - Define handoff message schema

---

## 6. Ephemeral Work Items

**Gas Town**: Wisps - non-persisted temporary work items

**Implementation for Stage 2**:

Add `ephemeral` field to Task (following existing Workflow pattern):

```typescript
// In src/types/task.ts
interface Task extends Element {
  // ... existing fields
  ephemeral: boolean; // default: false
}

// In CreateTaskInput
interface CreateTaskInput {
  // ... existing fields
  ephemeral?: boolean;
}
```

**Behavior**:

- Ephemeral tasks stored in SQLite only
- Excluded from JSONL export by default
- Can be promoted to durable via `promoteTask()`
- Garbage collected after configurable retention period

**Garbage Collection**:

- **Default retention**: 24 hours after completion
- **Configurable** at workspace level via config
- Ops Steward runs GC on schedule

```typescript
// In workspace config
interface WorkspaceConfig {
  ephemeralRetention: number; // hours, default 24
}
```

**Use Cases**:

- Steward patrol tasks (health checks)
- Automated maintenance operations
- Temporary workflow steps

**New Tracer Bullets**:

- **- [ ] TB-Core-1: Ephemeral Task Support** - Add ephemeral field to Task type
- **- [ ] TB-Core-2: Task Promote Operation** - Promote ephemeral → durable
- **- [ ] TB-Core-3: Ephemeral GC Service** - Garbage collect old ephemeral tasks

**Files to modify**:

- `src/types/task.ts` - Add ephemeral field
- `src/sync/service.ts` - Already handles ephemeral filtering
- `src/config/config.ts` - Add ephemeralRetention setting

---

## 7. Steward Meta-Monitoring

**Gas Town**: Boot the Dog watches the Maintenance Manager

**Implementation for Stage 2**:

Stewards can watch other Stewards (no special handling needed):

```yaml
steward:
  name: "Steward Watcher"
  focus: health
  triggers:
    - event: steward_unhealthy
      condition: "steward.lastHeartbeat < now() - 5min"
  actions:
    - restart_steward
    - notify_director
```

**No new tracer bullets needed** - existing TB-O23 (Steward Scheduler) and TB-O24 (Health Steward) cover this.

---

## 8. Plans as Work Batches (Convoys)

**Gas Town**: Convoys track collections of related work items

**Implementation for Stage 2**:

Use existing Elemental Plans:

- Plan contains tasks (children)
- Plan has progress tracking (via child task completion)
- Plan has metadata for batch labeling

**Already Covered** by existing tracer bullets:

- TB-O32 to TB-O35 cover Playbook/Workflow/Plan UI

---

## Updated Tracer Bullet Summary

### New Tracer Bullets to Add:

| ID          | Phase  | Description                                      |
| ----------- | ------ | ------------------------------------------------ |
| TB-Core-1   | 0      | Ephemeral Task Support (core library)            |
| TB-Core-2   | 0      | Task Promote Operation (core library)            |
| TB-Core-3   | 0      | Ephemeral GC Service (core library)              |
| **TB-O6a**  | **2**  | **Agent Capability System (moved from TB-O45)**  |
| TB-O7a      | 2      | Agent Channel Setup                              |
| **TB-O7b**  | **2**  | **Agent Role Definition Storage**                |
| TB-O8a      | 2      | Dispatch Service                                 |
| TB-O9a      | 3      | UWP Agent Startup Check                          |
| **TB-O9b**  | **3**  | **Worktree Root-Finding via ELEMENTAL_ROOT**     |
| TB-O10a     | 3      | Session Recovery with UWP                        |
| TB-O10b     | 3      | Inbox Polling Service                            |
| TB-O10c     | 3      | Session History Tracking                         |
| TB-O10d     | 3      | Predecessor Query Service                        |
| TB-O10e     | 3      | Self-Handoff                                     |
| TB-O10f     | 3      | Agent-Agent Handoff                              |
| **TB-O11a** | **3**  | **Worktree & Session Lifecycle State Machines**  |
| TB-O14a     | 4      | Message Event Types                              |
| TB-O14b     | 4      | Handoff Message Type                             |
| **TB-O17a** | **4**  | **Terminal Multiplexer (Workspaces Page)**       |
| TB-O19a     | 5      | Director Dispatch Command                        |
| **TB-O23a** | **6**  | **Plugin System for Stewards**                   |
| **TB-O25a** | **6**  | **Notification System (toasts + header center)** |
| **TB-O25b** | **6**  | **Command Palette (Cmd+K)**                      |
| **TB-O25c** | **6**  | **Settings Page**                                |

### UI-Specific Tracer Bullets (in specs/STAGE_2_WEB_UI.md):

| ID                   | Description                                                            |
| -------------------- | ---------------------------------------------------------------------- |
| TB-UI-01 to TB-UI-03 | Three-column layout shell, sidebar navigation, Director terminal panel |
| TB-UI-04 to TB-UI-05 | Activity page with live agent output                                   |
| TB-UI-06 to TB-UI-07 | Agents page with create dialogs                                        |
| TB-UI-08 to TB-UI-09 | Tasks page with kanban/list toggle                                     |
| TB-UI-10 to TB-UI-13 | Workspaces terminal multiplexer                                        |
| TB-UI-14 to TB-UI-16 | Workflows page with pour flow                                          |
| TB-UI-17             | Metrics page                                                           |
| TB-UI-18 to TB-UI-20 | Command palette, notifications, settings                               |
| TB-UI-21 to TB-UI-22 | Responsive design (tablet/mobile)                                      |

### Phase 0: Core Library Additions (New Phase)

Should run before Phase 2, as orchestrator-sdk depends on these:

**- [ ] TB-Core-1: Ephemeral Task Support**

- [ ] Add `ephemeral: boolean` field to Task type
- [ ] Update `createTask()` to accept ephemeral option
- [ ] Update validation functions

**- [ ] TB-Core-2: Task Promote Operation**

- [ ] Add `promoteTask()` function to convert ephemeral → durable
- [ ] Mirror existing `squashWorkflow()` pattern (rename to `promoteWorkflow()` for consistency)

**- [ ] TB-Core-3: Ephemeral GC Service**

- [ ] Add garbage collection for completed ephemeral tasks
- [ ] Configurable retention period (default 24h)
- [ ] Integrate with Ops Steward for scheduled runs

---

## Worktree + Messaging Compatibility

**Analysis**: No conflict between worktree isolation and shared messaging.

- SQLite database is at workspace root (`.elemental/elements.db`)
- All worktrees share the same database
- Workers in different worktrees can message each other through shared SQLite
- No git conflicts since messages are SQLite-only

---

## Verification Strategy for New Features

| Feature               | Verification                                                                 |
| --------------------- | ---------------------------------------------------------------------------- |
| UWP                   | Assign task to stopped agent, start agent, verify auto-pickup                |
| Inter-agent messaging | Agent A sends to Agent B, B's inbox shows unread                             |
| Dispatch              | Director dispatches task, worker receives and starts                         |
| Predecessor Query     | Kill agent, start new agent, query predecessor, verify response              |
| Handoff               | Agent triggers handoff manually, new session finds handoff note              |
| Ephemeral tasks       | Create ephemeral task, verify not in JSONL export, verify GC after retention |

---

## Risk Assessment

| Addition          | Complexity | Risk   | Mitigation                                      |
| ----------------- | ---------- | ------ | ----------------------------------------------- |
| UWP               | Low        | Low    | Simple queue check on startup                   |
| Messaging         | Low        | Low    | Uses existing system                            |
| Dispatch          | Medium     | Low    | Thin wrapper over existing                      |
| Predecessor Query | Medium     | Medium | Depends on Claude Code resume behavior          |
| Handoff           | Medium     | Low    | Manual trigger only, clean shutdown + messaging |
| Ephemeral         | Low        | Low    | Follows existing Workflow pattern               |

---

## Design Decisions (Resolved)

1. **Predecessor Query scope**: New agent sends message to predecessor session, receives response. Handoff notes are separate (already in inbox).

2. **Handoff trigger**: Manual only - agent decides when to hand off.

3. **Ephemeral task GC**: User configurable with 24-hour default retention.

---

## Updated Phase Summary

| Phase | Tracer Bullets                            | Focus                                                                                         |
| ----- | ----------------------------------------- | --------------------------------------------------------------------------------------------- |
| 0     | TB-Core-1 to TB-Core-3                    | Core library additions (ephemeral)                                                            |
| 1     | TB-O1 to TB-O5                            | Monorepo foundation, package extraction                                                       |
| 2     | TB-O6 to TB-O8a + **TB-O6a, TB-O7b**      | Orchestrator SDK types, services, dispatch, **capabilities, role definitions**                |
| 3     | TB-O9 to TB-O12 + **TB-O9b, TB-O11a**     | Agent process management, worktrees, UWP, handoff, **ELEMENTAL_ROOT, lifecycle states**       |
| 4     | TB-O13 to TB-O17a                         | Real-time communication, Director terminal, Workspaces (terminal multiplexer)                 |
| 5     | TB-O18 to TB-O21                          | Task management, agent workflow, merge                                                        |
| 6     | TB-O22 to TB-O26 + **TB-O23a, TB-O25a-c** | Steward config, health, activity, **plugin system, notifications, command palette, settings** |
| 7     | TB-O27 to TB-O31                          | UI package extraction (parallel)                                                              |
| 8     | TB-O32 to TB-O35                          | Workflows UI (renamed from Playbooks), workflow creation                                      |
| 9     | TB-O39 to TB-O41                          | Recovery and reconciliation                                                                   |
| 10    | TB-O42 to TB-O44                          | Metrics and reporting                                                                         |
| 11    | TB-O45 to TB-O47                          | Advanced features (TB-O45 core moved to TB-O6a)                                               |

**Total: 69 tracer bullets across 12 phases** (47 original + 17 additions + 5 new UI features)

> **UI Implementation Details**: See **specs/STAGE_2_WEB_UI.md** for detailed UI/UX specifications including 22 UI-specific tracer bullets (TB-UI-01 through TB-UI-22) that complement the backend tracer bullets above.

# Orchestrator Server

The Orchestrator Server (`apps/orchestrator-server/`) provides HTTP and WebSocket APIs for managing AI agent sessions, worktrees, and real-time communication.

## Quick Start

```bash
# Start the orchestrator server
pnpm --filter @elemental/orchestrator-server dev

# Default port: 3457
# Environment variables:
#   ORCHESTRATOR_PORT - Override default port
#   PORT - Fallback port if ORCHESTRATOR_PORT not set
#   HOST - Hostname (default: localhost)
#   ELEMENTAL_DB_PATH - Database path (default: .elemental/elemental.db)
```

## Architecture

The orchestrator server extends the base Elemental server with:

- **Agent session management** - Start, stop, resume agent processes
- **SSE streaming** - Real-time output from headless agents
- **WebSocket** - Interactive terminals for interactive agents
- **Worktree management** - Git worktree CRUD operations

```
┌─────────────────────────────────────────────────────────────────┐
│                    Orchestrator Server                          │
├────────────────────────┬────────────────────────────────────────┤
│  HTTP Endpoints        │  WebSocket                              │
│  - /api/agents/*       │  - /ws (subscribe, input, ping)        │
│  - /api/sessions       │                                        │
│  - /api/worktrees/*    │                                        │
│  - /api/health         │                                        │
├────────────────────────┴────────────────────────────────────────┤
│                    Orchestrator SDK Services                     │
│  - AgentRegistry       - SessionManager                          │
│  - SpawnerService      - WorktreeManager                         │
│  - TaskAssignmentService  - DispatchService                      │
│  - RoleDefinitionService                                         │
├─────────────────────────────────────────────────────────────────┤
│                    Elemental SDK                                 │
└─────────────────────────────────────────────────────────────────┘
```

## API Endpoints

### Health Check

```
GET /api/health
```

Returns server status and service availability.

```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "database": "/path/to/.elemental/elemental.db",
  "services": {
    "agentRegistry": "ready",
    "sessionManager": "ready",
    "spawnerService": "ready",
    "worktreeManager": "ready",  // or "disabled" if no git repo
    "taskAssignment": "ready",
    "dispatch": "ready",
    "roleDefinition": "ready"
  }
}
```

### Agent Endpoints

#### List Agents

```
GET /api/agents
GET /api/agents?role=worker
```

Query parameters:
- `role` - Filter by role: `director`, `worker`, `steward`

#### Get Agent

```
GET /api/agents/:id
```

#### Create Agent (TB-O22)

```
POST /api/agents
```

Register a new agent (Director, Worker, or Steward).

Body:
```json
{
  "role": "steward",
  "name": "Merge Bot",
  "stewardFocus": "merge",
  "triggers": [
    { "type": "cron", "schedule": "0 * * * *" },
    { "type": "event", "event": "task_completed" }
  ],
  "capabilities": {
    "skills": ["git", "testing"],
    "languages": ["typescript"],
    "maxConcurrentTasks": 1
  },
  "tags": ["automation"],
  "createdBy": "el-human123"
}
```

Required fields by role:
- **All roles**: `role`, `name`
- **Workers**: `workerMode` (`ephemeral` | `persistent`)
- **Stewards**: `stewardFocus` (`merge` | `health` | `reminder` | `ops`)

Response (201):
```json
{
  "agent": {
    "id": "el-steward123",
    "name": "Merge Bot",
    "type": "entity",
    "entityType": "agent",
    "status": "active",
    "metadata": {
      "agent": {
        "agentRole": "steward",
        "stewardFocus": "merge",
        "triggers": [...],
        "sessionStatus": "idle"
      }
    }
  }
}
```

Error (409) if name already exists.

**Role-specific endpoints:**

```
POST /api/agents/director  # Create Director
POST /api/agents/worker    # Create Worker
POST /api/agents/steward   # Create Steward
```

These accept the same body fields but default `role` to the endpoint type.

#### Get Agent Status

```
GET /api/agents/:id/status
```

Returns active session info and recent history.

```json
{
  "agentId": "el-abc123",
  "hasActiveSession": true,
  "activeSession": { ... },
  "recentHistory": [ ... ]
}
```

#### Start Agent Session

```
POST /api/agents/:id/start
```

Body:
```json
{
  "workingDirectory": "/path/to/work",  // optional
  "worktree": "worker-alice-feat-123",   // optional
  "initialPrompt": "Start working...",   // optional
  "interactive": false                    // optional, default false
}
```

Response:
```json
{
  "success": true,
  "session": { ... }
}
```

Error (409) if agent already has active session:
```json
{
  "error": { "code": "SESSION_EXISTS", "message": "..." },
  "existingSession": { ... }
}
```

#### Stop Agent Session

```
POST /api/agents/:id/stop
```

Body:
```json
{
  "graceful": true,      // optional, default true
  "reason": "User requested"  // optional
}
```

#### Resume Agent Session

```
POST /api/agents/:id/resume
```

Body:
```json
{
  "claudeSessionId": "...",     // optional, uses most recent if not provided
  "workingDirectory": "...",    // optional
  "worktree": "...",            // optional
  "resumePrompt": "Continue...", // optional
  "checkReadyQueue": true       // optional, default true (UWP)
}
```

Response includes UWP check results:
```json
{
  "success": true,
  "session": { ... },
  "uwpCheck": {
    "checked": true,
    "hasReadyTasks": true,
    "tasks": [ ... ]
  }
}
```

### Agent Streaming

#### SSE Stream (Headless Agents)

```
GET /api/agents/:id/stream
```

Headers:
- `Last-Event-ID` - Resume from specific event (reconnection support)

Events:
- `connected` - Initial connection established
- `agent_{type}` - Agent events (output, tool_use, etc.)
- `heartbeat` - Keep-alive (every 30s)
- `agent_error` - Error occurred
- `agent_exit` - Process exited

Example event:
```
id: 1
event: connected
data: {"sessionId":"sess-123","agentId":"el-abc123","timestamp":"..."}

id: 2
event: agent_output
data: {"type":"output","content":"Working on task..."}
```

#### Send Input to Agent

```
POST /api/agents/:id/input
```

Body:
```json
{
  "input": "Continue with the next step",
  "isUserMessage": true  // optional
}
```

Returns 202 Accepted (response comes via SSE stream).

### Task Endpoints (TB-O19)

Task endpoints enable the Director agent to create, query, and dispatch tasks to workers.

#### List Tasks

```
GET /api/tasks
GET /api/tasks?status=open
GET /api/tasks?assignee=el-worker123
GET /api/tasks?unassigned=true
GET /api/tasks?limit=50
```

Query parameters:
- `status` - Filter by task status: `open`, `in_progress`, `closed`
- `assignee` - Filter by assigned agent ID
- `unassigned` - Only show unassigned tasks (`true`)
- `limit` - Maximum results (default: 100)

#### Get Unassigned Tasks

```
GET /api/tasks/unassigned
GET /api/tasks/unassigned?limit=20
```

Shortcut for `?unassigned=true`.

#### Create Task

```
POST /api/tasks
```

Body:
```json
{
  "title": "Implement user authentication",
  "description": "Add login/logout with session management",
  "priority": "high",
  "complexity": "medium",
  "tags": ["feature", "auth"],
  "capabilityRequirements": {
    "requiredSkills": ["backend", "security"],
    "preferredSkills": ["authentication"],
    "requiredLanguages": ["typescript"]
  },
  "ephemeral": false,
  "createdBy": "el-director123"
}
```

Fields:
- `title` (required) - Task title
- `description` - Task description
- `priority` - `critical`, `high`, `medium`, `low`
- `complexity` - `trivial`, `simple`, `medium`, `complex`, `very_complex`
- `tags` - Array of tag strings
- `capabilityRequirements` - Skills/languages needed for smart routing
- `ephemeral` - Whether task is temporary (default: false)
- `createdBy` - Entity ID of creator (default: "system")

Response:
```json
{
  "task": {
    "id": "el-task123",
    "title": "Implement user authentication",
    "description": "Add login/logout with session management",
    "status": "open",
    "priority": 2,
    "complexity": 3,
    "taskType": "task",
    "orchestrator": null,
    ...
  }
}
```

#### Get Task

```
GET /api/tasks/:id
```

Returns task with assignment information:
```json
{
  "task": { ... },
  "assignment": {
    "agent": {
      "id": "el-worker123",
      "name": "backend-specialist",
      "role": "worker"
    },
    "branch": "agent/backend-specialist/el-task123-implement-auth",
    "worktree": ".worktrees/backend-specialist-implement-auth/",
    "sessionId": "sess-abc",
    "mergeStatus": "pending",
    "startedAt": "2024-01-01T00:00:00Z"
  }
}
```

#### Dispatch Task

```
POST /api/tasks/:id/dispatch
```

Assigns task to specific agent and sends notification.

Body:
```json
{
  "agentId": "el-worker123",
  "priority": 5,
  "restart": false,
  "markAsStarted": true,
  "branch": "custom-branch-name",
  "worktree": ".worktrees/custom-path/",
  "notificationMessage": "High priority task assigned",
  "dispatchedBy": "el-director123"
}
```

Fields:
- `agentId` (required) - Agent to dispatch to
- `priority` - Dispatch priority for notification
- `restart` - Signal agent to restart session
- `markAsStarted` - Mark task IN_PROGRESS immediately
- `branch` - Custom branch name (auto-generated if not provided)
- `worktree` - Custom worktree path (auto-generated if not provided)
- `notificationMessage` - Custom notification message
- `dispatchedBy` - Entity performing the dispatch

Response:
```json
{
  "success": true,
  "task": { ... },
  "agent": {
    "id": "el-worker123",
    "name": "backend-specialist"
  },
  "notification": {
    "id": "el-msg123",
    "channelId": "el-chan123"
  },
  "isNewAssignment": true,
  "dispatchedAt": "2024-01-01T00:00:00Z"
}
```

#### Smart Dispatch

```
POST /api/tasks/:id/dispatch/smart
```

Finds the best available agent based on capabilities and dispatches.

Body:
```json
{
  "eligibleOnly": true,
  "minScore": 50,
  "priority": 5,
  "restart": false,
  "markAsStarted": true,
  "dispatchedBy": "el-director123"
}
```

Fields:
- `eligibleOnly` - Only consider agents meeting all requirements (default: true)
- `minScore` - Minimum capability match score 0-100 (default: 0)
- Other fields same as dispatch

Returns 404 with `NO_ELIGIBLE_AGENTS` if no suitable agents found.

#### Get Task Candidates

```
GET /api/tasks/:id/candidates
GET /api/tasks/:id/candidates?eligibleOnly=true&minScore=50
```

Gets agents ranked by capability match for a task.

Response:
```json
{
  "task": {
    "id": "el-task123",
    "title": "Implement user authentication"
  },
  "hasRequirements": true,
  "requirements": {
    "requiredSkills": ["backend", "security"],
    "preferredSkills": ["authentication"]
  },
  "candidates": [
    {
      "agent": {
        "id": "el-worker123",
        "name": "backend-specialist",
        "role": "worker",
        "capabilities": { ... }
      },
      "isEligible": true,
      "score": 85,
      "matchDetails": {
        "matchedRequiredSkills": ["backend", "security"],
        "matchedPreferredSkills": ["authentication"],
        "matchedRequiredLanguages": ["typescript"],
        "missingRequiredSkills": [],
        "missingRequiredLanguages": []
      }
    }
  ],
  "bestCandidate": {
    "agent": { "id": "el-worker123", "name": "backend-specialist" },
    "score": 85
  }
}
```

#### Get Agent Workload

```
GET /api/agents/:id/workload
```

Returns agent's current workload and capacity.

Response:
```json
{
  "agentId": "el-worker123",
  "agentName": "backend-specialist",
  "workload": {
    "agentId": "el-worker123",
    "totalTasks": 2,
    "byStatus": { "1": 1, "2": 1 },
    "inProgressCount": 1,
    "awaitingMergeCount": 0
  },
  "hasCapacity": true,
  "maxConcurrentTasks": 3
}
```

### Session Endpoints

#### List Sessions

```
GET /api/sessions
GET /api/sessions?agentId=el-abc123
GET /api/sessions?role=worker
GET /api/sessions?status=running
GET /api/sessions?resumable=true
```

Query parameters:
- `agentId` - Filter by agent
- `role` - Filter by agent role
- `status` - Filter by status (comma-separated: `starting,running,suspended,terminating,terminated`)
- `resumable` - Only show resumable sessions

#### Get Session

```
GET /api/sessions/:id
```

### Worktree Endpoints

> **Note**: Worktree endpoints return 503 if no git repository is found.

#### List Worktrees

```
GET /api/worktrees
```

#### Get Worktree

```
GET /api/worktrees/:path
```

Path is URL-encoded.

#### Create Worktree

```
POST /api/worktrees
```

Body:
```json
{
  "agentName": "worker-alice",
  "taskId": "el-task123",
  "taskTitle": "Implement feature X",  // optional
  "customBranch": "custom-branch",     // optional
  "customPath": ".worktrees/custom/",  // optional
  "baseBranch": "main"                 // optional
}
```

Response:
```json
{
  "success": true,
  "worktree": { ... },
  "branch": "agent/worker-alice/el-task123-implement-feature-x",
  "path": ".worktrees/worker-alice-implement-feature-x/",
  "branchCreated": true
}
```

#### Remove Worktree

```
DELETE /api/worktrees/:path?force=true&deleteBranch=true
```

Query parameters:
- `force` - Force removal even with uncommitted changes
- `deleteBranch` - Also delete the associated branch

## WebSocket API

Connect to `/ws` for interactive terminal sessions.

### Message Types

#### Subscribe to Agent

```json
{ "type": "subscribe", "agentId": "el-abc123" }
```

Response:
```json
{ "type": "subscribed", "agentId": "el-abc123", "hasSession": true }
```

#### Send Input

```json
{ "type": "input", "input": "user message" }
```

#### Ping/Pong

```json
{ "type": "ping" }
```

Response:
```json
{ "type": "pong" }
```

### Server Events

When subscribed, you receive:

```json
{ "type": "event", "event": { "type": "output", "content": "..." } }
{ "type": "error", "error": "message" }
{ "type": "exit", "code": 0, "signal": null }
```

## Session Record Format

```typescript
interface SessionRecord {
  id: string;                    // Internal session ID
  claudeSessionId?: string;      // Claude Code session ID for resume
  agentId: EntityId;             // Agent entity ID
  agentRole: AgentRole;          // director, worker, steward
  workerMode?: WorkerMode;       // ephemeral, persistent (workers only)
  pid?: number;                  // Process ID
  status: SessionStatus;         // starting, running, suspended, terminating, terminated
  workingDirectory?: string;     // Working directory path
  worktree?: string;             // Worktree path (workers only)
  createdAt: Timestamp;
  startedAt?: Timestamp;
  lastActivityAt?: Timestamp;
  endedAt?: Timestamp;
  terminationReason?: string;
}
```

## Worktree Info Format

```typescript
interface WorktreeInfo {
  path: string;           // Absolute path
  relativePath: string;   // Relative to workspace
  branch: string;         // Git branch name
  head: string;           // Current HEAD commit
  isMain: boolean;        // Is this the main worktree?
  state: WorktreeState;   // creating, active, suspended, merging, cleaning, archived
  agentName?: string;     // Assigned agent name
  taskId?: ElementId;     // Associated task ID
  createdAt?: Timestamp;
}
```

## Error Responses

All endpoints return errors in this format:

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Agent not found"
  }
}
```

Common error codes:
- `NOT_FOUND` - Resource not found
- `SESSION_EXISTS` - Agent already has active session
- `NO_SESSION` - Agent has no active session
- `NO_RESUMABLE_SESSION` - No resumable session found
- `INVALID_INPUT` - Invalid request body
- `WORKTREES_DISABLED` - Worktree management disabled (no git repo)
- `INTERNAL_ERROR` - Server error

## Configuration

Environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `ORCHESTRATOR_PORT` | 3457 | Server port |
| `PORT` | 3457 | Fallback port |
| `HOST` | localhost | Server hostname |
| `ELEMENTAL_DB_PATH` | `.elemental/elemental.db` | SQLite database path |

## Testing

```bash
# Run tests
pnpm --filter @elemental/orchestrator-server test

# Type check
pnpm --filter @elemental/orchestrator-server build
```

## Related Documentation

- [Orchestrator API](../api/orchestrator-api.md) - SDK services used by the server
- [SpawnerService](../api/orchestrator-api.md#spawnerservice-tb-o9) - Agent process management
- [SessionManager](../api/orchestrator-api.md#sessionmanager-tb-o10) - Session lifecycle
- [WorktreeManager](../api/orchestrator-api.md#worktreemanager-tb-o11) - Git worktree operations

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

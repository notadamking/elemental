# Elemental Web Platform Specification

**Version:** 0.1.0 (Draft)
**Last Updated:** 2025-01-24

## 1. Overview

### 1.1 Purpose

Build a standalone web platform for managing AI agent orchestration - a command center for human operators supervising multiple agent teams. The platform provides real-time visibility into all Elemental elements with drill-down capabilities.

### 1.2 Primary User

Human operators managing multiple teams of AI agents working on a product or platform. Key workflows:

- Bird's eye view of all elements in the system
- Drill into specific sub-sections and make targeted changes
- Monitor task completion and agent coordination
- Review and edit knowledge base (specifications, documentation)
- View messages between agents and participate in channels
- Monitor plans and workflows, spin up ad-hoc workflows

### 1.3 Design Principles

- **Tracer Bullets**: Build thin, end-to-end slices that prove the full path works
- **Immediate Verification**: Every change results in working software testable in browser
- **Hybrid Navigation**: Context-adaptive UI (Linear for tasks, Slack for messages, Notion for docs)
- **Real-time Essential**: WebSocket-based live updates without page refresh
- **Keyboard-first**: Command palette (Cmd+K) and shortcuts for power users

---

## 2. Architecture

### 2.1 System Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser                               │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                   apps/web (React SPA)               │    │
│  │  TanStack Query ←──────────────→ WebSocket Client   │    │
│  └──────────┬────────────────────────────┬─────────────┘    │
└─────────────┼────────────────────────────┼──────────────────┘
              │ HTTP                        │ WS
              ▼                             ▼
┌─────────────────────────────────────────────────────────────┐
│                    apps/server (Hono)                        │
│  ┌─────────────────┐    ┌──────────────────────────────┐    │
│  │   REST Routes   │    │    WebSocket Server          │    │
│  │  /api/tasks     │    │  Event broadcasting          │    │
│  │  /api/plans     │    │  Channel subscriptions       │    │
│  │  /api/entities  │    └──────────────────────────────┘    │
│  │  /api/...       │                                        │
│  └────────┬────────┘                                        │
│           │                                                  │
│           ▼                                                  │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              ElementalAPI (existing)                 │    │
│  └────────┬────────────────────────────────────────────┘    │
│           │                                                  │
│           ▼                                                  │
│  ┌─────────────────────────────────────────────────────┐    │
│  │           SQLite Database (.elemental/db)            │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Project Structure

```
apps/
├── server/                         # Hono HTTP + WebSocket server
│   ├── src/
│   │   ├── index.ts               # Entry point, server startup
│   │   ├── routes/                # API route handlers
│   │   │   ├── tasks.ts
│   │   │   ├── plans.ts
│   │   │   ├── workflows.ts
│   │   │   ├── messages.ts
│   │   │   ├── channels.ts
│   │   │   ├── documents.ts
│   │   │   ├── libraries.ts
│   │   │   ├── entities.ts
│   │   │   ├── teams.ts
│   │   │   ├── dependencies.ts
│   │   │   ├── events.ts
│   │   │   └── sync.ts
│   │   ├── ws/                    # WebSocket handlers
│   │   │   ├── server.ts          # WS connection management
│   │   │   ├── subscriptions.ts   # Channel subscription logic
│   │   │   └── broadcaster.ts     # Event broadcasting
│   │   └── middleware/
│   │       ├── cors.ts
│   │       └── error.ts
│   ├── package.json
│   └── tsconfig.json
│
└── web/                           # React SPA
    ├── src/
    │   ├── main.tsx               # Entry point
    │   ├── App.tsx                # Root component + providers
    │   ├── routes.tsx             # TanStack Router config
    │   │
    │   ├── api/                   # Data layer
    │   │   ├── client.ts          # HTTP fetch wrapper
    │   │   ├── websocket.ts       # WS connection manager
    │   │   ├── types.ts           # Re-export from @elemental/types
    │   │   └── hooks/             # TanStack Query hooks
    │   │       ├── useTasks.ts
    │   │       ├── usePlans.ts
    │   │       ├── useWorkflows.ts
    │   │       ├── useMessages.ts
    │   │       ├── useChannels.ts
    │   │       ├── useDocuments.ts
    │   │       ├── useLibraries.ts
    │   │       ├── useEntities.ts
    │   │       ├── useTeams.ts
    │   │       ├── useDependencies.ts
    │   │       ├── useEvents.ts
    │   │       └── useStats.ts
    │   │
    │   ├── components/
    │   │   ├── ui/                # Primitives (Button, Input, Dialog, etc.)
    │   │   ├── layout/            # AppShell, Sidebar, Header
    │   │   ├── navigation/        # CommandPalette, Breadcrumbs
    │   │   ├── data-display/      # DataTable, KanbanBoard, TreeView
    │   │   ├── entity/            # TaskCard, MessageBubble, etc.
    │   │   ├── editor/            # BlockEditor, blocks/
    │   │   └── graph/             # DependencyGraph, GraphCanvas
    │   │
    │   ├── features/              # Feature modules
    │   │   ├── dashboard/         # 4 lenses (TaskFlow, AgentActivity, Graph, Timeline)
    │   │   ├── tasks/             # List + Kanban + Detail
    │   │   ├── plans/
    │   │   ├── workflows/
    │   │   ├── messages/          # Slack-style
    │   │   ├── documents/         # Notion-style
    │   │   ├── entities/
    │   │   ├── teams/
    │   │   └── settings/
    │   │
    │   ├── hooks/                 # Shared hooks
    │   │   ├── useKeyboardShortcuts.ts
    │   │   ├── useLocalStorage.ts
    │   │   └── useRealtime.ts
    │   │
    │   ├── stores/                # Zustand stores
    │   │   ├── ui.store.ts
    │   │   └── preferences.store.ts
    │   │
    │   └── lib/                   # Utilities
    │       ├── cn.ts              # Class name utility
    │       ├── format.ts          # Date/number formatters
    │       └── keyboard.ts        # Shortcut registry
    │
    ├── package.json
    ├── vite.config.ts
    ├── tailwind.config.ts
    └── tsconfig.json
```

---

## 3. Tech Stack

| Category | Library | Purpose |
|----------|---------|---------|
| **Server** | Hono | HTTP server (fast, minimal, Bun-native) |
| **UI Framework** | React 19 | Component framework |
| **Bundler** | Vite | Fast dev server + build |
| **Styling** | Tailwind CSS v4 | Utility-first CSS |
| **Server State** | TanStack Query v5 | Async state management, caching |
| **Client State** | Zustand | Lightweight UI state |
| **Routing** | TanStack Router | Type-safe routing |
| **UI Primitives** | Radix UI | Accessible, unstyled components |
| **Command Palette** | cmdk | Cmd+K implementation |
| **Tables** | @tanstack/react-table | Headless data tables |
| **DnD** | @dnd-kit/core | Drag-and-drop (kanban) |
| **Graph** | @xyflow/react | Dependency graph visualization |
| **Editor** | Tiptap | Block-based markdown editor |
| **Icons** | lucide-react | Icon library |
| **Dates** | date-fns | Date formatting |

---

## 4. API Specification

### 4.1 REST Endpoints

All endpoints return JSON. Errors follow the pattern: `{ error: { code, message, details? } }`.

#### System

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/stats` | System statistics (element counts, ready/blocked) |

#### Tasks

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/tasks` | List tasks with filters |
| GET | `/api/tasks/ready` | Ready tasks (unblocked, actionable) |
| GET | `/api/tasks/blocked` | Blocked tasks with block reasons |
| GET | `/api/tasks/:id` | Get single task (supports hydration) |
| POST | `/api/tasks` | Create task |
| PATCH | `/api/tasks/:id` | Update task |
| DELETE | `/api/tasks/:id` | Soft-delete task |

**Query Parameters (GET /api/tasks):**
- `status` - Filter by status (open, in_progress, blocked, etc.)
- `priority` - Filter by priority (1-5)
- `assignee` - Filter by assignee entity ID
- `tags` - Filter by tags (comma-separated)
- `limit`, `offset` - Pagination
- `orderBy`, `orderDir` - Sorting
- `hydrate` - Hydration options (description, design)

#### Plans

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/plans` | List plans |
| GET | `/api/plans/:id` | Get plan |
| GET | `/api/plans/:id/tasks` | Tasks in plan |
| GET | `/api/plans/:id/progress` | Plan progress metrics |
| POST | `/api/plans` | Create plan |
| PATCH | `/api/plans/:id` | Update plan |

#### Workflows

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/workflows` | List workflows |
| GET | `/api/workflows/:id` | Get workflow |
| GET | `/api/workflows/:id/tasks` | Tasks in workflow |
| GET | `/api/workflows/:id/progress` | Workflow progress |
| POST | `/api/workflows/pour` | Pour workflow from playbook |
| DELETE | `/api/workflows/:id/burn` | Burn ephemeral workflow |

#### Messages & Channels

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/channels` | List channels |
| GET | `/api/channels/:id` | Get channel |
| GET | `/api/channels/:id/messages` | Messages in channel |
| POST | `/api/channels` | Create channel |
| POST | `/api/messages` | Send message |

#### Documents & Libraries

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/documents` | List documents |
| GET | `/api/documents/:id` | Get document |
| GET | `/api/documents/:id/versions` | Document history |
| POST | `/api/documents` | Create document |
| PATCH | `/api/documents/:id` | Update document |
| GET | `/api/libraries` | List libraries |
| GET | `/api/libraries/:id/documents` | Documents in library |

#### Entities & Teams

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/entities` | List entities |
| GET | `/api/entities/:id` | Get entity |
| GET | `/api/teams` | List teams |
| GET | `/api/teams/:id` | Get team |
| GET | `/api/teams/:id/metrics` | Team metrics |

#### Dependencies & Events

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/dependencies/:id` | Dependencies for element |
| GET | `/api/dependencies/:id/tree` | Dependency tree |
| POST | `/api/dependencies` | Add dependency |
| DELETE | `/api/dependencies` | Remove dependency |
| GET | `/api/events` | List events (with filters) |

### 4.2 WebSocket Protocol

**Connection:** `ws://localhost:3000/ws`

**Client → Server Messages:**

```typescript
// Subscribe to channels
{ type: "subscribe", channels: ["tasks", "plans:el-abc"] }

// Unsubscribe
{ type: "unsubscribe", channels: ["tasks"] }
```

**Server → Client Messages:**

```typescript
// Element event
{
  type: "event",
  event: {
    id: number,
    elementId: string,
    elementType: string,
    eventType: "created" | "updated" | "deleted" | ...,
    actor: string,
    oldValue?: object,
    newValue?: object,
    createdAt: string
  }
}
```

**Subscription Channels:**
- `tasks` - All task events
- `plans` - All plan events
- `workflows` - All workflow events
- `messages:${channelId}` - Messages in specific channel
- `entities` - All entity events
- `*` - All events (wildcard)

---

## 5. UI Specification

### 5.1 Layout

```
┌─────────────────────────────────────────────────────────────┐
│                         Header                               │
│  [Breadcrumbs]                         [Search] [User Menu] │
├──────────┬──────────────────────────────────────────────────┤
│          │                                                   │
│  Sidebar │              Main Content Area                    │
│          │                                                   │
│  [Logo]  │   ┌───────────────────────────────────────────┐  │
│          │   │                                           │  │
│  [Dash]  │   │    Feature-specific content               │  │
│  [Tasks] │   │    (List + Detail split, or full-width)   │  │
│  [Plans] │   │                                           │  │
│  [Flows] │   │                                           │  │
│  [Msgs]  │   │                                           │  │
│  [Docs]  │   └───────────────────────────────────────────┘  │
│  [Ents]  │                                                   │
│  [Teams] │                                                   │
│          │                                                   │
│  ──────  │                                                   │
│  [Setts] │                                                   │
└──────────┴──────────────────────────────────────────────────┘
```

### 5.2 Navigation Patterns

**Sidebar (Linear-style):**
- Fixed width (240px), collapsible
- Icon + label for each section
- Keyboard shortcut hints
- Active state indicator

**Context-Adaptive Content:**
- Tasks/Plans/Workflows → Master-detail split view
- Messages → Slack-style (channel list + message view)
- Documents → Notion-style (tree + page editor)

### 5.3 Dashboard Lenses

#### Task Flow Lens
- **Ready Tasks**: Unblocked tasks sorted by priority
- **Blocked Tasks**: Tasks with block reasons displayed
- **Recently Completed**: Tasks closed in last 24h
- **Velocity**: Tasks completed per day (sparkline)

#### Agent Activity Lens
- **Agent Grid**: Cards showing each agent's current task
- **Workload Distribution**: Bar chart of tasks per agent
- **Activity Feed**: Recent events by all agents

#### Dependency Graph Lens
- **Graph Canvas**: React Flow interactive visualization
- **Tree View**: Hierarchical alternative view
- **Bottleneck Highlights**: High-dependent-count nodes

#### Timeline Lens
- **Event Feed**: Chronological list of all events
- **Filters**: By event type, actor, element
- **Search**: Full-text search within events

### 5.4 Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+K` | Open command palette |
| `Cmd+B` | Toggle sidebar |
| `G T` | Go to Tasks |
| `G P` | Go to Plans |
| `G W` | Go to Workflows |
| `G M` | Go to Messages |
| `G D` | Go to Documents |
| `G E` | Go to Entities |
| `G R` | Go to Teams |
| `G H` | Go to Dashboard |
| `C` | Create (context-aware) |
| `E` | Edit selected |
| `X` | Close/complete task |
| `J/K` | Navigate list up/down |
| `1-5` | Set priority (tasks) |
| `V L` | List view |
| `V K` | Kanban view |

### 5.5 Routing

| Route | View |
|-------|------|
| `/` | Redirect to `/dashboard` |
| `/dashboard` | Dashboard with lens tabs |
| `/dashboard/task-flow` | Task Flow lens |
| `/dashboard/agents` | Agent Activity lens |
| `/dashboard/dependencies` | Dependency Graph lens |
| `/dashboard/timeline` | Timeline lens |
| `/tasks` | Task list/kanban |
| `/tasks/:id` | Task detail (split view) |
| `/plans` | Plan list |
| `/plans/:id` | Plan detail with tasks |
| `/workflows` | Workflow list |
| `/workflows/:id` | Workflow detail |
| `/messages` | Channel list |
| `/messages/:channelId` | Channel messages |
| `/documents` | Library tree + documents |
| `/documents/:id` | Document editor |
| `/entities` | Entity list |
| `/entities/:id` | Entity profile |
| `/teams` | Team list |
| `/teams/:id` | Team detail |
| `/settings` | Preferences |

---

## 6. Real-time Strategy

### 6.1 TanStack Query Integration

```typescript
// On WebSocket event received
function handleEvent(event: ElementalEvent) {
  const queryClient = getQueryClient();

  switch (event.elementType) {
    case 'task':
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['tasks', event.elementId] });
      queryClient.invalidateQueries({ queryKey: ['tasks', 'ready'] });
      queryClient.invalidateQueries({ queryKey: ['tasks', 'blocked'] });
      break;
    case 'plan':
      queryClient.invalidateQueries({ queryKey: ['plans'] });
      queryClient.invalidateQueries({ queryKey: ['plans', event.elementId] });
      break;
    // ... other types
  }
}
```

### 6.2 Optimistic Updates

For mutations (create, update, delete):
1. Immediately update cache optimistically
2. Send request to server
3. On success: update cache with server response
4. On error: rollback to previous state, show error

---

## 7. Implementation Checklist

### Phase 1: Foundation

- [x] **TB1: Hello World (Full Stack)**
  - [x] Create `apps/server/` with Hono
  - [x] Add `GET /api/health` endpoint
  - [x] Add CORS middleware
  - [x] Create `apps/web/` with Vite + React + Tailwind
  - [x] Fetch and display health status
  - [x] **Verify:** Both servers run, UI shows "Connected" (Playwright tests passing)

- [x] **TB2: System Stats Display**
  - [x] Server: Add `GET /api/stats` endpoint
  - [x] Web: Create StatsCard component
  - [x] Web: Add TanStack Query
  - [x] **Verify:** Stats card shows real database numbers (Playwright tests passing)

- [x] **TB3: Ready Tasks List**
  - [x] Server: Add `GET /api/tasks/ready` endpoint
  - [x] Web: Create ReadyTasksList component
  - [x] Web: Add `useReadyTasks()` hook
  - [x] **Verify:** List shows tasks from database (Playwright tests passing)

- [ ] **TB4: Real-time Updates (WebSocket)**
  - [ ] Server: Add WebSocket endpoint `/ws`
  - [ ] Server: Implement subscription mechanism
  - [ ] Server: Hook into ElementalAPI events
  - [ ] Web: Add WebSocket connection manager
  - [ ] Web: Invalidate queries on events
  - [ ] **Verify:** Create task via CLI, UI updates instantly

### Phase 2: Navigation & Layout

- [ ] **TB5: Basic Sidebar Navigation**
  - [ ] Web: Add TanStack Router
  - [ ] Web: Create AppShell layout
  - [ ] Web: Create Sidebar component
  - [ ] Web: Add routes for `/dashboard` and `/tasks`
  - [ ] **Verify:** Navigation between pages works

### Phase 3: Dashboard MVP

- [ ] **TB6: Task Flow Lens**
  - [ ] Server: Add `GET /api/tasks/blocked` endpoint
  - [ ] Web: Create TaskFlowLens component
  - [ ] Web: Three-column layout (ready/blocked/completed)
  - [ ] **Verify:** All three columns show correct data

- [ ] **TB7: Agent Activity Lens**
  - [ ] Server: Add `GET /api/entities` endpoint
  - [ ] Web: Create AgentActivityLens component
  - [ ] Web: Agent cards with current tasks
  - [ ] **Verify:** Agent cards show assigned tasks

- [ ] **TB8: Dependency Graph Lens**
  - [ ] Server: Add `GET /api/dependencies/:id/tree` endpoint
  - [ ] Web: Add React Flow
  - [ ] Web: Create DependencyGraphLens component
  - [ ] **Verify:** Graph renders with pan/zoom

- [ ] **TB9: Timeline Lens**
  - [ ] Server: Add `GET /api/events` endpoint
  - [ ] Web: Create TimelineLens component
  - [ ] Web: Event filtering
  - [ ] **Verify:** Events display with filters

### Phase 4: Core Features

- [ ] **TB10: Command Palette**
  - [ ] Web: Add cmdk
  - [ ] Web: Create CommandPalette component
  - [ ] Web: Wire up navigation actions
  - [ ] **Verify:** Cmd+K opens, navigation works

- [ ] **TB11: Task Detail Panel**
  - [ ] Server: Add hydration to `GET /api/tasks/:id`
  - [ ] Web: Create TaskDetailPanel component
  - [ ] Web: Split view layout
  - [ ] **Verify:** Click task shows detail panel

- [ ] **TB12: Edit Task**
  - [ ] Server: Add `PATCH /api/tasks/:id` endpoint
  - [ ] Web: Make TaskDetailPanel editable
  - [ ] Web: Optimistic updates
  - [ ] **Verify:** Edit persists, other tabs update via WS

### Phase 5: Tasks Feature Complete

- [ ] **TB13: Create Task**
  - [ ] Web: Create task modal
  - [ ] Server: Add `POST /api/tasks` endpoint
  - [ ] **Verify:** Create task from UI

- [ ] **TB14: Kanban View**
  - [ ] Web: Add dnd-kit
  - [ ] Web: Create KanbanBoard component
  - [ ] Web: View toggle (list/kanban)
  - [ ] **Verify:** Drag tasks between columns

- [ ] **TB15: Bulk Operations**
  - [ ] Web: Multi-select in list
  - [ ] Web: Bulk action menu
  - [ ] Server: Bulk update endpoint
  - [ ] **Verify:** Select multiple, change status

### Phase 6: Messaging

- [ ] **TB16: Channel List**
  - [ ] Server: Add `GET /api/channels` endpoint
  - [ ] Web: Create ChannelList component
  - [ ] **Verify:** Channels display

- [ ] **TB17: Message Display**
  - [ ] Server: Add `GET /api/channels/:id/messages` endpoint
  - [ ] Web: Create ChannelView component
  - [ ] Web: MessageBubble component
  - [ ] **Verify:** Messages display in channel

- [ ] **TB18: Send Message**
  - [ ] Server: Add `POST /api/messages` endpoint
  - [ ] Web: Create MessageComposer component
  - [ ] **Verify:** Send message, appears in channel

- [ ] **TB19: Threading**
  - [ ] Web: Thread panel
  - [ ] Web: Reply to message
  - [ ] **Verify:** Threaded conversations work

### Phase 7: Documents

- [ ] **TB20: Library Tree**
  - [ ] Server: Add `GET /api/libraries` endpoint
  - [ ] Web: Create LibraryTree component
  - [ ] **Verify:** Tree navigation works

- [ ] **TB21: Document Display**
  - [ ] Server: Add `GET /api/documents/:id` endpoint
  - [ ] Web: Create DocumentView component
  - [ ] **Verify:** Document content displays

- [ ] **TB22: Block Editor**
  - [ ] Web: Add Tiptap
  - [ ] Web: Create BlockEditor component
  - [ ] Web: Custom blocks (task embed, doc embed)
  - [ ] **Verify:** Edit document with blocks

- [ ] **TB23: Document Versions**
  - [ ] Server: Add `GET /api/documents/:id/versions` endpoint
  - [ ] Web: Version history sidebar
  - [ ] **Verify:** View and restore versions

### Phase 8: Plans & Workflows

- [ ] **TB24: Plan List with Progress**
  - [ ] Web: Create PlansPage component
  - [ ] Web: Progress bars
  - [ ] **Verify:** Plans display with progress

- [ ] **TB25: Workflow List + Pour**
  - [ ] Web: Create WorkflowsPage component
  - [ ] Web: Pour workflow modal
  - [ ] Server: Add `POST /api/workflows/pour` endpoint
  - [ ] **Verify:** Pour workflow from playbook

- [ ] **TB26: Playbook Browser**
  - [ ] Web: PlaybookPicker component
  - [ ] Web: Variable input form
  - [ ] **Verify:** Browse and select playbooks

---

## 8. Verification Approach

After every tracer bullet:

1. **Manual Browser Test**
   - Open app in browser
   - Exercise the new feature
   - Verify it works as expected

2. **Real-time Test** (if applicable)
   - Make change via CLI (`el create task ...`)
   - Verify UI updates without refresh

3. **Persistence Test**
   - Refresh browser
   - Verify data persists

4. **Error States**
   - Server down → graceful error
   - Empty data → appropriate empty state

5. **Playwright E2E** (optional)
   - Write test for critical paths
   - Run before next tracer bullet

---

## 9. Dependencies on Existing Code

| File | Usage |
|------|-------|
| `src/types/index.ts` | All type exports (Task, Plan, Entity, etc.) |
| `src/api/types.ts` | Filter types, API interfaces |
| `src/api/elemental-api.ts` | Full API implementation to wrap |
| `src/http/sync-handlers.ts` | Existing sync HTTP handlers |
| `src/types/event.ts` | Event types for real-time |
| `src/types/dependency.ts` | Dependency system types |

---

## 10. Future Considerations

- **Authentication**: Currently no auth modeled; add middleware layer
- **Multi-tenancy**: Single database assumed; extend for multiple workspaces
- **Mobile**: Responsive design but no native app
- **Offline**: Browser storage backend exists but not integrated in web platform
- **Federation**: Cross-system sync deferred

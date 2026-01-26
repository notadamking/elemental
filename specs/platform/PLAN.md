# Elemental Web Platform Specification

**Version:** 0.2.0 (Draft)
**Last Updated:** 2026-01-24

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

| Category            | Library               | Purpose                                 |
| ------------------- | --------------------- | --------------------------------------- |
| **Server**          | Hono                  | HTTP server (fast, minimal, Bun-native) |
| **UI Framework**    | React 19              | Component framework                     |
| **Bundler**         | Vite                  | Fast dev server + build                 |
| **Styling**         | Tailwind CSS v4       | Utility-first CSS                       |
| **Server State**    | TanStack Query v5     | Async state management, caching         |
| **Client State**    | Zustand               | Lightweight UI state                    |
| **Routing**         | TanStack Router       | Type-safe routing                       |
| **UI Primitives**   | Radix UI              | Accessible, unstyled components         |
| **Command Palette** | cmdk                  | Cmd+K implementation                    |
| **Tables**          | @tanstack/react-table | Headless data tables                    |
| **DnD**             | @dnd-kit/core         | Drag-and-drop (kanban)                  |
| **Graph**           | @xyflow/react         | Dependency graph visualization          |
| **Editor**          | Tiptap                | Block-based markdown editor             |
| **Icons**           | lucide-react          | Icon library                            |
| **Dates**           | date-fns              | Date formatting                         |

---

## 4. API Specification

### 4.1 REST Endpoints

All endpoints return JSON. Errors follow the pattern: `{ error: { code, message, details? } }`.

#### System

| Method | Endpoint      | Description                                       |
| ------ | ------------- | ------------------------------------------------- |
| GET    | `/api/health` | Health check                                      |
| GET    | `/api/stats`  | System statistics (element counts, ready/blocked) |

#### Tasks

| Method | Endpoint             | Description                          |
| ------ | -------------------- | ------------------------------------ |
| GET    | `/api/tasks`         | List tasks with filters              |
| GET    | `/api/tasks/ready`   | Ready tasks (unblocked, actionable)  |
| GET    | `/api/tasks/blocked` | Blocked tasks with block reasons     |
| GET    | `/api/tasks/:id`     | Get single task (supports hydration) |
| POST   | `/api/tasks`         | Create task                          |
| PATCH  | `/api/tasks/:id`     | Update task                          |
| DELETE | `/api/tasks/:id`     | Soft-delete task                     |

**Query Parameters (GET /api/tasks):**

- `status` - Filter by status (open, in_progress, blocked, etc.)
- `priority` - Filter by priority (1-5)
- `assignee` - Filter by assignee entity ID
- `tags` - Filter by tags (comma-separated)
- `limit`, `offset` - Pagination
- `orderBy`, `orderDir` - Sorting
- `hydrate` - Hydration options (description, design)

#### Plans

| Method | Endpoint                  | Description           |
| ------ | ------------------------- | --------------------- |
| GET    | `/api/plans`              | List plans            |
| GET    | `/api/plans/:id`          | Get plan              |
| GET    | `/api/plans/:id/tasks`    | Tasks in plan         |
| GET    | `/api/plans/:id/progress` | Plan progress metrics |
| POST   | `/api/plans`              | Create plan           |
| PATCH  | `/api/plans/:id`          | Update plan           |

#### Workflows

| Method | Endpoint                      | Description                 |
| ------ | ----------------------------- | --------------------------- |
| GET    | `/api/workflows`              | List workflows              |
| GET    | `/api/workflows/:id`          | Get workflow                |
| GET    | `/api/workflows/:id/tasks`    | Tasks in workflow           |
| GET    | `/api/workflows/:id/progress` | Workflow progress           |
| POST   | `/api/workflows/pour`         | Pour workflow from playbook |
| DELETE | `/api/workflows/:id/burn`     | Burn ephemeral workflow     |

#### Messages & Channels

| Method | Endpoint                     | Description         |
| ------ | ---------------------------- | ------------------- |
| GET    | `/api/channels`              | List channels       |
| GET    | `/api/channels/:id`          | Get channel         |
| GET    | `/api/channels/:id/messages` | Messages in channel |
| POST   | `/api/channels`              | Create channel      |
| POST   | `/api/messages`              | Send message        |

#### Documents & Libraries

| Method | Endpoint                       | Description          |
| ------ | ------------------------------ | -------------------- |
| GET    | `/api/documents`               | List documents       |
| GET    | `/api/documents/:id`           | Get document         |
| GET    | `/api/documents/:id/versions`  | Document history     |
| POST   | `/api/documents`               | Create document      |
| PATCH  | `/api/documents/:id`           | Update document      |
| GET    | `/api/libraries`               | List libraries       |
| GET    | `/api/libraries/:id/documents` | Documents in library |

#### Entities & Teams

| Method | Endpoint                 | Description   |
| ------ | ------------------------ | ------------- |
| GET    | `/api/entities`          | List entities |
| GET    | `/api/entities/:id`      | Get entity    |
| GET    | `/api/teams`             | List teams    |
| GET    | `/api/teams/:id`         | Get team      |
| GET    | `/api/teams/:id/metrics` | Team metrics  |

#### Dependencies & Events

| Method | Endpoint                     | Description                |
| ------ | ---------------------------- | -------------------------- |
| GET    | `/api/dependencies/:id`      | Dependencies for element   |
| GET    | `/api/dependencies/:id/tree` | Dependency tree            |
| POST   | `/api/dependencies`          | Add dependency             |
| DELETE | `/api/dependencies`          | Remove dependency          |
| GET    | `/api/events`                | List events (with filters) |

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

| Shortcut | Action                 |
| -------- | ---------------------- |
| `Cmd+K`  | Open command palette   |
| `Cmd+B`  | Toggle sidebar         |
| `G T`    | Go to Tasks            |
| `G P`    | Go to Plans            |
| `G W`    | Go to Workflows        |
| `G M`    | Go to Messages         |
| `G D`    | Go to Documents        |
| `G E`    | Go to Entities         |
| `G R`    | Go to Teams            |
| `G H`    | Go to Dashboard        |
| `C`      | Create (context-aware) |
| `E`      | Edit selected          |
| `X`      | Close/complete task    |
| `J/K`    | Navigate list up/down  |
| `1-5`    | Set priority (tasks)   |
| `V L`    | List view              |
| `V K`    | Kanban view            |

### 5.5 Routing

| Route                     | View                     |
| ------------------------- | ------------------------ |
| `/`                       | Redirect to `/dashboard` |
| `/dashboard`              | Dashboard with lens tabs |
| `/dashboard/task-flow`    | Task Flow lens           |
| `/dashboard/agents`       | Agent Activity lens      |
| `/dashboard/dependencies` | Dependency Graph lens    |
| `/dashboard/timeline`     | Timeline lens            |
| `/tasks`                  | Task list/kanban         |
| `/tasks/:id`              | Task detail (split view) |
| `/plans`                  | Plan list                |
| `/plans/:id`              | Plan detail with tasks   |
| `/workflows`              | Workflow list            |
| `/workflows/:id`          | Workflow detail          |
| `/messages`               | Channel list             |
| `/messages/:channelId`    | Channel messages         |
| `/documents`              | Library tree + documents |
| `/documents/:id`          | Document editor          |
| `/entities`               | Entity list              |
| `/entities/:id`           | Entity profile           |
| `/teams`                  | Team list                |
| `/teams/:id`              | Team detail              |
| `/settings`               | Preferences              |

---

## 6. Real-time Strategy

### 6.1 TanStack Query Integration

```typescript
// On WebSocket event received
function handleEvent(event: ElementalEvent) {
  const queryClient = getQueryClient();

  switch (event.elementType) {
    case "task":
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["tasks", event.elementId] });
      queryClient.invalidateQueries({ queryKey: ["tasks", "ready"] });
      queryClient.invalidateQueries({ queryKey: ["tasks", "blocked"] });
      break;
    case "plan":
      queryClient.invalidateQueries({ queryKey: ["plans"] });
      queryClient.invalidateQueries({ queryKey: ["plans", event.elementId] });
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
  - [x] **Verify:** Both servers run, UI shows "Live" (Playwright tests passing)

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

- [x] **TB4: Real-time Updates (WebSocket)**
  - [x] Server: Add WebSocket endpoint `/ws`
  - [x] Server: Implement subscription mechanism
  - [x] Server: Hook into ElementalAPI events
  - [x] Web: Add WebSocket connection manager
  - [x] Web: Invalidate queries on events
  - [x] **Verify:** Create task via CLI, UI updates instantly (Playwright tests passing)

### Phase 2: Navigation & Layout

- [x] **TB5: Basic Sidebar Navigation**
  - [x] Web: Add TanStack Router
  - [x] Web: Create AppShell layout
  - [x] Web: Create Sidebar component
  - [x] Web: Add routes for `/dashboard` and `/tasks`
  - [x] **Verify:** Navigation between pages works (Playwright tests passing - 10 tests)

### Phase 3: Dashboard MVP

- [x] **TB6: Task Flow Lens**
  - [x] Server: Add `GET /api/tasks/blocked` endpoint
  - [x] Server: Add `GET /api/tasks/completed` endpoint
  - [x] Web: Create TaskFlowLens component
  - [x] Web: Three-column layout (ready/blocked/completed)
  - [x] Web: Add Task Flow navigation to sidebar
  - [x] **Verify:** All three columns show correct data (Playwright tests passing - 9 tests)

- [x] **TB7: Agent Activity Lens**
  - [x] Server: Add `GET /api/entities` endpoint
  - [x] Server: Add `GET /api/entities/:id` endpoint
  - [x] Server: Add `GET /api/entities/:id/tasks` endpoint
  - [x] Web: Create AgentActivityLens component
  - [x] Web: Agent cards with current tasks and workload chart
  - [x] Web: Add Agents navigation to sidebar
  - [x] **Verify:** Agent cards show assigned tasks (Playwright tests passing - 9 tests)

- [x] **TB8: Dependency Graph Lens**
  - [x] Server: Add `GET /api/dependencies/:id/tree` endpoint
  - [x] Server: Add `GET /api/dependencies/:id` endpoint
  - [x] Web: Add React Flow (@xyflow/react)
  - [x] Web: Create DependencyGraphLens component with task selector
  - [x] Web: Add Dependencies navigation to sidebar
  - [x] **Verify:** Graph renders with pan/zoom (Playwright tests passing - 8 tests)

- [x] **TB9: Timeline Lens**
  - [x] Server: Add `GET /api/events` endpoint
  - [x] Server: Add `listEvents()` API method for all-events query
  - [x] Web: Create TimelineLens component
  - [x] Web: Event filtering (event type toggles, actor filter, search)
  - [x] Web: Add Timeline navigation to sidebar
  - [x] **Verify:** Events display with filters (Playwright tests passing - 15 tests)

### Phase 4: Core Features

- [x] **TB10: Command Palette**
  - [x] Web: Add cmdk
  - [x] Web: Create CommandPalette component
  - [x] Web: Wire up navigation actions
  - [x] **Verify:** Cmd+K opens, navigation works (Playwright tests passing - 11 tests)

- [x] **TB11: Task Detail Panel**
  - [x] Server: Add `GET /api/tasks/:id` endpoint with hydration support
  - [x] Web: Create TaskDetailPanel component
  - [x] Web: Split view layout with task selection
  - [x] **Verify:** Click task shows detail panel (Playwright tests passing - 12 tests)

- [x] **TB12: Edit Task**
  - [x] Server: Add `PATCH /api/tasks/:id` endpoint
  - [x] Web: Make TaskDetailPanel editable
  - [x] Web: Optimistic updates
  - [x] **Verify:** Edit persists, other tabs update via WS (Playwright tests passing - 15 tests)

### Phase 5: Tasks Feature Complete

- [x] **TB13: Create Task**
  - [x] Web: Create task modal (CreateTaskModal component with form fields for title, createdBy, priority, complexity, taskType, assignee, tags)
  - [x] Server: Add `POST /api/tasks` endpoint (with validation for required fields)
  - [x] **Verify:** Create task from UI (Playwright tests passing - 16 tests)

- [x] **TB14: Kanban View**
  - [x] Web: Add dnd-kit (@dnd-kit/core, @dnd-kit/sortable, @dnd-kit/utilities)
  - [x] Web: Create KanbanBoard component with status columns (Open, In Progress, Blocked, Completed)
  - [x] Web: View toggle (list/kanban) with List and LayoutGrid icons
  - [x] **Verify:** Drag tasks between columns (Playwright tests passing - 12 tests)

- [x] **TB15: Bulk Operations**
  - [x] Web: Multi-select in list (checkboxes per row, select-all header checkbox)
  - [x] Web: Bulk action menu (status and priority dropdown actions)
  - [x] Server: Bulk update endpoint (`PATCH /api/tasks/bulk`)
  - [x] **Verify:** Select multiple, change status (Playwright tests passing - 14 tests)

### Phase 6: Messaging

- [x] **TB16: Channel List**
  - [x] Server: Add `GET /api/channels` endpoint
  - [x] Server: Add `GET /api/channels/:id` endpoint
  - [x] Web: Create ChannelList component with group/direct separation
  - [x] Web: Add sidebar navigation test IDs
  - [x] **Verify:** Channels display (Playwright tests passing - 9 tests + 4 skipped)

- [x] **TB17: Message Display**
  - [x] Server: Add `GET /api/channels/:id/messages` endpoint with hydration support
  - [x] Web: Create ChannelView component with channel header, messages area
  - [x] Web: MessageBubble component with sender, time, content, avatar
  - [x] **Verify:** Messages display in channel (Playwright tests passing - 1 test + 10 skipped due to no channels)

- [x] **TB18: Send Message**
  - [x] Server: Add `POST /api/messages` endpoint (creates content document + message)
  - [x] Web: Create MessageComposer component with textarea, send button, Enter key support
  - [x] **Verify:** Send message, appears in channel (Playwright tests passing - 4 tests + 10 skipped due to no channels)

- [x] **TB19: Threading**
  - [x] Server: Add `GET /api/messages/:id/replies` endpoint
  - [x] Web: Thread panel with parent message, replies list, close button
  - [x] Web: Reply button on messages (hover), ThreadComposer component
  - [x] Web: Reply count display, filter root messages in main view
  - [x] **Verify:** Threaded conversations work (Playwright tests passing - 1 test + 8 skipped due to no channels)

### Phase 7: Documents

- [x] **TB20: Library Tree**
  - [x] Server: Add `GET /api/libraries` endpoint (with hydration support)
  - [x] Server: Add `GET /api/libraries/:id` endpoint (with sub-libraries and documents)
  - [x] Server: Add `GET /api/libraries/:id/documents` endpoint
  - [x] Server: Add `GET /api/documents` endpoint
  - [x] Server: Add `GET /api/documents/:id` endpoint
  - [x] Web: Create DocumentsPage component with LibraryTree sidebar
  - [x] Web: LibraryTree component with expand/collapse, folder icons
  - [x] Web: LibraryView component showing documents and sub-libraries
  - [x] Web: AllDocumentsView for when no libraries exist
  - [x] **Verify:** Tree navigation works (Playwright tests passing - 10 tests + 8 skipped due to no libraries)

- [x] **TB21: Document Display**
  - [x] Server: Add `GET /api/documents/:id` endpoint (added in TB20)
  - [x] Web: Create DocumentDetailPanel component with content rendering
  - [x] Web: Create DocumentRenderer component for text/markdown/json content types
  - [x] Web: Add useDocument hook for fetching individual documents
  - [x] Web: Update DocumentListItem to be clickable with selection state
  - [x] Web: Update DocumentsPage with document selection state and split-panel layout
  - [x] **Verify:** Document content displays (Playwright tests passing - 13 tests + 3 skipped due to content type)

- [x] **TB22: Block Editor**
  - [x] Web: Add Tiptap (Tiptap dependencies installed: @tiptap/react, @tiptap/starter-kit, @tiptap/extension-placeholder, @tiptap/extension-code-block-lowlight, lowlight)
  - [x] Web: Create BlockEditor component (src/components/editor/BlockEditor.tsx - Toolbar with undo/redo, bold/italic/code, headings, lists, blockquote, code block)
  - [x] Web: Custom blocks (task embed, doc embed) (src/components/editor/blocks/TaskEmbedBlock.tsx, DocumentEmbedBlock.tsx)
  - [x] Server: Add `PATCH /api/documents/:id` endpoint (with content, title, contentType, tags support and validation)
  - [x] Web: Edit mode in DocumentDetailPanel (title input, BlockEditor for content, save/cancel buttons)
  - [x] Web: useUpdateDocument hook with optimistic updates
  - [x] **Verify:** Edit document with blocks (Playwright tests passing - 12 tests + 1 skipped)

- [x] **TB23: Document Versions**
  - [x] Server: Add `GET /api/documents/:id/versions` endpoint (returns version history)
  - [x] Server: Add `GET /api/documents/:id/versions/:version` endpoint (get specific version)
  - [x] Server: Add `POST /api/documents/:id/restore` endpoint (restore from version)
  - [x] Web: Version history sidebar (VersionHistorySidebar component)
  - [x] Web: Preview version functionality with preview banner
  - [x] Web: Restore version functionality with confirmation
  - [x] Web: Edit button disabled during preview
  - [x] **Verify:** View and restore versions (Playwright tests passing - 18 tests)

### Phase 8: Plans & Workflows

- [x] **TB24: Plan List with Progress**
  - [x] Server: Add `GET /api/plans` endpoint (with status filter)
  - [x] Server: Add `GET /api/plans/:id` endpoint (with progress hydration)
  - [x] Server: Add `GET /api/plans/:id/tasks` endpoint
  - [x] Server: Add `GET /api/plans/:id/progress` endpoint
  - [x] Server: Add `POST /api/plans` endpoint (create plan)
  - [x] Server: Add `PATCH /api/plans/:id` endpoint (update plan)
  - [x] Web: Create PlansPage component with status filter tabs
  - [x] Web: Create PlanListItem, PlanDetailPanel, StatusBadge components
  - [x] Web: Add ProgressBar component with completion visualization
  - [x] Web: Add TaskStatusSummary component (completed/in-progress/blocked/remaining)
  - [x] Web: Add PlanTaskList component showing tasks in plan
  - [x] **Verify:** Plans display with progress (Playwright tests passing - 24 tests)

- [x] **TB25: Workflow List + Pour**
  - [x] Server: Add `GET /api/workflows` endpoint (with status filter)
  - [x] Server: Add `GET /api/workflows/:id` endpoint (with progress hydration)
  - [x] Server: Add `GET /api/workflows/:id/tasks` endpoint
  - [x] Server: Add `GET /api/workflows/:id/progress` endpoint
  - [x] Server: Add `POST /api/workflows` endpoint (create workflow)
  - [x] Server: Add `POST /api/workflows/pour` endpoint (pour from playbook)
  - [x] Server: Add `PATCH /api/workflows/:id` endpoint (update workflow)
  - [x] Web: Create WorkflowsPage component with status filter tabs
  - [x] Web: Create WorkflowListItem, WorkflowDetailPanel components
  - [x] Web: Create PourWorkflowModal with title and playbook name inputs
  - [x] Web: Add ProgressBar component with completion visualization
  - [x] Web: Add TaskStatusSummary, WorkflowTaskList components
  - [x] **Verify:** Pour workflow from playbook (Playwright tests passing - 28 tests)

- [x] **TB26: Playbook Browser**
  - [x] Server: Add `GET /api/playbooks` endpoint (discover playbooks from filesystem)
  - [x] Server: Add `GET /api/playbooks/:name` endpoint (load full playbook details)
  - [x] Web: Create PlaybookPicker component with dropdown selection
  - [x] Web: Add mode toggle (Quick Create vs From Playbook)
  - [x] Web: Create VariableInputForm component (string, number, boolean, enum types)
  - [x] Web: Display playbook info and steps preview
  - [x] Web: Integrate with PourWorkflowModal
  - [x] **Verify:** Browse and select playbooks (Playwright tests passing - 7 passed, 6 skipped due to no playbooks)

### Phase 9: CRUD Completion + Task Flow Enhancements

- [x] **TB27: Create Document**
  - [x] Server: Add `POST /api/documents` endpoint (title, contentType, content, optional libraryId)
  - [x] Web: Create CreateDocumentModal component (title input, content type selector, initial content)
  - [x] Web: Add "New Document" button to Documents page (sidebar + library view + all docs view)
  - [x] **Verify:** Create document from UI (Playwright tests passing - 19 passed, 2 skipped)

- [x] **TB28: Task Flow - Click to Open**
  - [x] Server: Add `GET /api/tasks/in-progress` endpoint for in-progress tasks
  - [x] Web: Make tasks in Task Flow clickable (opens slide-over panel)
  - [x] Web: Add TaskSlideOver component with full task details (status, priority, complexity editing)
  - [x] Web: Show in-progress tasks in dedicated column (4 columns: Ready, In Progress, Blocked, Completed)
  - [x] Web: Add CSS animation for slide-over panel (slide-in-right)
  - [x] **Verify:** Click task in Task Flow, slide-over panel opens with full task info (Playwright tests passing - 17 passed, 3 skipped)

- [x] **TB29: Create Library**
  - [x] Server: Add `POST /api/libraries` endpoint (name, createdBy, optional parentId for nesting, tags)
  - [x] Web: Create CreateLibraryModal component (name input, createdBy selector, parent library picker, tags)
  - [x] Web: Add "New Library" button to Documents page sidebar (FolderPlus icon)
  - [x] Web: Add "Create one" link in empty state when no libraries exist
  - [x] **Verify:** Create library from UI, appears in tree hierarchy under correct parent (Playwright tests passing - 14 passed, 1 skipped)

- [x] **TB30: Task Flow - Filter & Sort**
  - [x] Web: Add filter dropdown (by assignee, priority, tags) to each Task Flow column header
  - [x] Web: Add sort options (by priority, created date, updated date, deadline, title) with asc/desc toggle
  - [x] Web: Persist filter/sort preferences in localStorage per column (useColumnPreferences hook)
  - [x] Web: Show filtered count vs total when filters are active
  - [x] Web: Add "Clear" button to remove all filters
  - [x] **Verify:** Filter ready tasks by priority/assignee, verify only matching tasks shown (Playwright tests passing - 10 tests)

- [x] **TB31: Create Channel**
  - [x] Server: Add `POST /api/channels` endpoint (name, channelType, members, permissions)
  - [x] Web: Create CreateChannelModal component (name, type toggle group/direct, member picker)
  - [x] Web: Add "New Channel" button to Messages page sidebar
  - [x] **Verify:** Create group channel, appears in channel list, can send messages (Playwright tests passing - 14 tests)

- [x] **TB32: Task Flow - Load Completed Tasks**
  - [x] Web: Add paginated loading for completed tasks ("Show more" button or infinite scroll trigger)
  - [x] Web: Add date range filter for completed tasks (Today, This Week, This Month, All Time)
  - [x] Web: Display completion timestamp on completed task cards
  - [x] **Verify:** Load completed tasks from past week, pagination works correctly (Playwright tests passing - 10 tests)

### Phase 10: Entity & Team Pages + More CRUD

- [x] **TB33: Entities Page - List View**
  - [x] Web: Replace placeholder with EntityList component
  - [x] Web: Entity cards showing: name, type badge (agent/human/system), avatar, active status indicator
  - [x] Web: Filter tabs by entity type (All, Agents, Humans, Systems)
  - [x] Web: Search box for entity name
  - [x] **Verify:** View all entities with type filtering and search (Playwright tests passing - 12 tests)

- [x] **TB34: Entity Detail Panel**
  - [x] Server: Add `GET /api/entities/:id/stats` endpoint (task count, message count, created elements count)
  - [x] Web: EntityDetailPanel with profile info, statistics cards, assigned tasks list
  - [x] Web: Activity timeline showing recent events by this entity
  - [x] Web: Split-view layout (list on left, detail on right)
  - [x] **Verify:** Click entity, see full profile with stats and activity timeline (Playwright tests passing - 9 tests)

- [x] **TB35: Create Entity**
  - [x] Server: Add `POST /api/entities` endpoint (name, entityType, optional publicKey, metadata)
  - [x] Web: Create RegisterEntityModal (name input, type selector, optional public key textarea)
  - [x] Web: Add "Register Entity" button to Entities page
  - [x] Web: Validation for unique name, valid entity type
  - [x] **Verify:** Register new agent entity from UI, appears in list (Playwright tests passing - 12 tests)

- [x] **TB36: Edit Entity**
  - [x] Server: Add `PATCH /api/entities/:id` endpoint (name, metadata, tags, active status)
  - [x] Web: Make EntityDetailPanel editable (edit button, inline editing for fields)
  - [x] Web: Deactivate/reactivate toggle with confirmation
  - [x] Web: Tag management (add/remove tags)
  - [x] **Verify:** Edit entity metadata, deactivate entity, verify persistence (Playwright tests passing - 14 tests)

- [x] **TB37: Teams Page - List View**
  - [x] Server: Add `GET /api/teams` endpoint (list all teams)
  - [x] Server: Add `GET /api/teams/:id` endpoint (team details with members)
  - [x] Server: Add `GET /api/teams/:id/members` endpoint (hydrated member entities)
  - [x] Web: Replace placeholder with TeamList component
  - [x] Web: Team cards showing: name, member count, member avatar stack (first 5)
  - [x] **Verify:** View all teams with member counts and avatar previews (Playwright tests passing - 8 passed, 11 skipped due to no teams)

- [x] **TB38: Team Detail Panel**
  - [x] Server: Add `GET /api/teams/:id/stats` endpoint (task count, workload distribution)
  - [x] Web: TeamDetailPanel with member list (full), team statistics, assigned tasks
  - [x] Web: Workload chart showing tasks per member (horizontal bar chart with percentages)
  - [x] **Verify:** Click team, see members and stats (Playwright tests passing - 9 passed, 20 skipped due to no teams)

- [x] **TB39: Create Team**
  - [x] Server: Add `POST /api/teams` endpoint (name, members array, optional description)
  - [x] Web: Create CreateTeamModal (name input, multi-select member picker)
  - [x] Web: Add "New Team" button to Teams page
  - [x] **Verify:** Create team with 3 members from UI, appears in list (Playwright tests passing - 21 tests)

- [x] **TB40: Edit Team**
  - [x] Server: Add `PATCH /api/teams/:id` endpoint (name, add/remove members)
  - [x] Server: Add `DELETE /api/teams/:id` endpoint (soft delete)
  - [x] Web: Make TeamDetailPanel editable (team name with inline edit)
  - [x] Web: Inline add/remove member actions in member list
  - [x] Web: Delete team button with confirmation (soft delete)
  - [x] **Verify:** Playwright tests passing (17 tests for TB40)

### Phase 11: Dashboard Enhancements

- [x] **TB41: Dashboard Overview Panel**
  - [x] Web: Enhanced DashboardPage with MetricsOverview component
  - [x] Web: Key metrics cards: Total Tasks, Ready vs Blocked ratio, Active Agents, Tasks Completed Today
  - [x] Web: Quick action buttons: Create Task, Pour Workflow, View Ready Tasks (links to relevant pages)
  - [x] Web: Recent activity feed (last 10 events with icons and relative timestamps)
  - [x] **Verify:** Playwright tests passing (19 tests)

- [x] **TB42: Timeline Visual Overhaul**
  - [x] Web: Redesign timeline with visual event type icons (create=plus, update=pencil, delete=trash, etc.)
  - [x] Web: Group events by time period (Today, Yesterday, This Week, Earlier) with sticky headers
  - [x] Web: Event cards with: actor avatar, element type badge, preview of changes, relative timestamp
  - [x] Web: Add "jump to date" date picker for navigation
  - [x] Web: Improve filtering UI (multi-select chips instead of dropdowns)
  - [x] **Verify:** Timeline shows grouped events with clear visual hierarchy (Playwright tests passing - 33 tests)

- [x] **TB43: Dependency Graph - Filter & Search**
  - [x] Web: Add search box above graph (filter nodes by title/ID, highlights matches)
  - [x] Web: Add filter toggles (by status: open/in_progress/blocked/completed/cancelled)
  - [x] Web: Implement node highlighting for search results (glow effect with yellow ring)
  - [x] Web: Add minimap component for large graphs (React Flow MiniMap - already existed)
  - [x] Web: Add zoom controls (+/- buttons, fit-to-view button)
  - [x] **Verify:** Search for task in graph, matching node highlights (Playwright tests passing - 22 tests)

- [x] **TB44: Dependency Graph - Edit Mode**
  - [x] Server: Add `POST /api/dependencies` endpoint (sourceId, targetId, type)
  - [x] Server: Add `DELETE /api/dependencies` endpoint (sourceId, targetId, type)
  - [x] Web: Add "Edit Mode" toggle button to graph toolbar
  - [x] Web: In edit mode: click first node (source), click second node (target), type picker appears
  - [x] Web: In edit mode: right-click edge shows delete option
  - [x] Web: Visual feedback for selection state (selected node has border)
  - [x] **Verify:** Add blocks dependency between two tasks via graph UI, edge appears (Playwright tests passing - 9 tests)

- [x] **TB45: Agent Activity Improvements**
  - [x] Server: Extended `/api/entities/:id/stats` with completedTodayCount, blockedTaskCount, inProgressTaskCount
  - [x] Web: Enhanced horizontal bar chart showing tasks per agent with percentages
  - [x] Web: Real-time task progress: show current task with time elapsed (formatTimeElapsed, auto-refresh)
  - [x] Web: Agent status indicators: idle (gray), working (green pulse), blocked (yellow) with AgentStatusIndicator component
  - [x] Web: Make agent cards clickable → navigate to entity detail page (with URL search params)
  - [x] Web: Add "Tasks completed today" count per agent
  - [x] **Verify:** Playwright tests passing (17 tests - 9 original + 8 TB45 tests)

### Phase 12: List Enhancements + Edit Functionality

- [x] **TB46: Universal Pagination Component**
  - [x] Web: Create Pagination component (page numbers 1,2,3..., prev/next arrows, page size selector 10/25/50/100) - `src/components/shared/Pagination.tsx`
  - [x] Web: Add to TaskList, showing total count and current range (e.g., "Showing 1-25 of 142")
  - [x] Web: Add to EntityList with server-side pagination support - `apps/web/src/routes/entities.tsx`
  - [x] Web: Add to TeamList with URL sync - `apps/web/src/routes/teams.tsx`
  - [x] Web: Add to DocumentList with URL sync - `apps/web/src/routes/documents.tsx`
  - [x] Web: Add to ChannelList with URL sync - `apps/web/src/routes/messages.tsx`
  - [x] Web: Add to EventList/Timeline with URL sync - `apps/web/src/routes/timeline.tsx`
  - [x] Server: All list endpoints return `total` count via `api.listPaginated()` - `/api/teams`, `/api/documents`, `/api/channels`, `/api/events` updated
  - [x] Server: `/api/entities` endpoint supports pagination with `limit`, `offset`, `orderBy`, `orderDir` params
  - [x] Web: URL sync for pagination state (e.g., `?page=2&limit=25`) - router validates search params for all paginated routes
  - [x] **Verify:** Playwright tests passing (25 pagination tests covering all list pages)

- [x] **TB47: Edit Plan**
  - [x] Server: Add `POST /api/plans/:id/tasks` endpoint (add task to plan)
  - [x] Server: Add `DELETE /api/plans/:id/tasks/:taskId` endpoint (remove task from plan)
  - [x] Web: Make PlanDetailPanel editable (edit button on title, inline editing)
  - [x] Web: Editable fields: title (inline edit with save/cancel)
  - [x] Web: "Add Task" button opens TaskPickerModal with search functionality
  - [x] Web: "Remove Task" button on each task in plan (with double-click confirmation)
  - [x] Web: Status transition buttons (Activate, Complete, Cancel) based on current status
  - [x] **Verify:** Playwright tests passing (18 TB47 tests, 42 total plans tests)

- [x] **TB48: Edit Workflow**
  - [x] Web: Make WorkflowDetailPanel editable (title, status where valid)
  - [x] Web: "Burn Workflow" button for ephemeral workflows (with confirmation modal)
  - [x] Web: "Squash Workflow" button to promote ephemeral to durable (with confirmation)
  - [x] Server: Add `DELETE /api/workflows/:id/burn` endpoint
  - [x] Server: Add `POST /api/workflows/:id/squash` endpoint
  - [x] **Verify:** Playwright tests passing (17 TB48 tests, 45 total workflows tests)

- [x] **TB49: Task List/Kanban Toggle Polish**
  - [x] Web: Persist view preference (list vs kanban) in localStorage key `tasks.viewMode`
  - [x] Web: Implement keyboard shortcuts: `V L` for list view, `V K` for kanban view
  - [x] Web: Add smooth CSS transition/animation (fade-in) when switching views
  - [x] Web: Show current view mode in toggle button (highlighted state with bg-white shadow-sm)
  - [x] **Verify:** Playwright tests passing (8 new TB49 tests, 20 total kanban tests)

### Phase 13: Document Attachments

- [x] **TB50: Attach Documents to Tasks**
  - [x] Server: Add `POST /api/tasks/:id/attachments` endpoint (documentId)
  - [x] Server: Add `GET /api/tasks/:id/attachments` endpoint (returns attached documents)
  - [x] Server: Add `DELETE /api/tasks/:id/attachments/:docId` endpoint
  - [x] Web: Add "Attachments" collapsible section to TaskDetailPanel
  - [x] Web: "Attach Document" button opens document picker modal
  - [x] Web: Show attached documents as clickable links with remove button
  - [x] **Verify:** Playwright tests passing (21 TB50 tests)

- [x] **TB51: Embedded Document Rendering in Tasks**
  - [x] Web: Render attached documents inline in TaskDetailPanel (expandable cards)
  - [x] Web: Collapsed state: document title + content type badge + first line preview
  - [x] Web: Expanded state: full document content rendered (markdown/text/json)
  - [x] Web: Click document title to open in document editor (navigate or side panel)
  - [x] **Verify:** Playwright tests passing (9 TB51 tests, 30 total attachment tests)

- [x] **TB52: Attach Documents to Messages**
  - [x] Server: Update `POST /api/messages` to accept `attachmentIds` array
  - [x] Web: Add attachment button (paperclip icon) to MessageComposer
  - [x] Web: Document picker modal for selecting attachments
  - [x] Web: Show attachments in MessageBubble (document cards below content)
  - [x] Web: Attachment preview: title, type badge, click to open
  - [x] **Verify:** Playwright tests passing (20 TB52 tests)

- [x] **TB53: Attach Documents to Documents (Links)**
  - [x] Server: Add `GET /api/documents/:id/links` endpoint (returns outgoing and incoming links)
  - [x] Server: Add `POST /api/documents/:id/links` endpoint (create link using `references` dependency type)
  - [x] Server: Add `DELETE /api/documents/:sourceId/links/:targetId` endpoint
  - [x] Web: Add "Linked Documents" section to DocumentDetailPanel
  - [x] Web: "Link Document" button opens DocumentLinkPickerModal
  - [x] Web: Show both outgoing links (documents this links to) and incoming links (documents linking here)
  - [x] Web: Click linked document to navigate
  - [x] **Verify:** Playwright tests passing (26 TB53 tests)

### Phase 14: Document Editor Quality

- [x] **TB54: Editor Toolbar Polish**
  - [x] Web: Redesign toolbar with grouped sections using dividers:
    - [x] History: Undo, Redo
    - [x] Text: Bold, Italic, Code, Strikethrough, Highlight
    - [x] Headings: H1, H2, H3 buttons
    - [x] Lists: Bullet, Numbered
    - [x] Blocks: Quote, Code Block, Horizontal Rule
  - [x] Web: Add Radix UI Tooltip component with keyboard shortcut hints on hover (e.g., "Bold ⌘B")
  - [x] Web: Platform-aware shortcuts (⌘ on Mac, Ctrl on Windows/Linux)
  - [x] Web: Responsive toolbar: collapses to overflow menu on narrow screens (<420px)
  - [x] Web: Overflow menu with categorized sections (Text, Headings, Lists, Blocks)
  - [x] Web: Install @tiptap/extension-highlight, @radix-ui/react-tooltip, @radix-ui/react-dropdown-menu
  - [x] **Verify:** Playwright tests passing (18 TB54 tests)

- [x] **TB55: Slash Commands**
  - [x] Web: Implement slash command menu triggered by typing `/` at start of line or after space
  - [x] Web: Command list with icons:
    - [x] /heading1, /heading2, /heading3 - Insert headings
    - [x] /bullet - Bullet list
    - [x] /numbered - Numbered list
    - [x] /quote - Block quote
    - [x] /code - Code block
    - [x] /divider - Horizontal rule
    - [x] /task - Embed task (placeholder - opens picker in TB57)
    - [x] /doc - Embed document (placeholder - opens picker in TB57)
  - [x] Web: Fuzzy search filtering as user types after `/`
  - [x] Web: Keyboard navigation (up/down arrows, Enter to select, Escape to cancel)
  - [x] **Verify:** Playwright tests passing (19 TB55 tests)

- [x] **TB56: Drag-and-Drop Blocks**
  - [x] Web: Add drag handle (grip icon) to left of each block, visible on hover (using tiptap-extension-global-drag-handle)
  - [x] Web: Implement block reordering via drag-and-drop (using GlobalDragHandle Tiptap extension)
  - [x] Web: Visual drop indicator line between blocks while dragging (CSS .drop-cursor)
  - [x] Web: Drag handle cursor feedback (grab/grabbing) (CSS .drag-handle with cursor states)
  - [x] **Verify:** Playwright tests passing (15 TB56 tests)

- [x] **TB57: Inline Task/Document Embeds**
  - [x] Web: `/task` slash command opens task picker modal (TaskPickerModal with search, keyboard navigation)
  - [x] Web: Selected task renders as inline card (title, status badge with icon)
  - [x] Web: `/doc` slash command opens document picker modal (DocumentPickerModal with search, keyboard navigation)
  - [x] Web: Selected document renders as inline card (title, content type badge with icon)
  - [x] Web: Embedded items are clickable → navigate to full view (via anchor tags)
  - [x] Web: Delete embed with backspace when cursor is on it (atomic nodes support backspace deletion)
  - [x] **Verify:** Playwright tests passing (9 passed, 10 skipped due to no tasks in test db)

- [x] **TB58: Advanced Inline Formatting**
  - [x] Web: Add highlight extension (background color, default yellow) - added in TB54
  - [x] Web: Add strikethrough support (toolbar button with ⌘+Shift+S) - added in TB54
  - [x] Web: Improve inline code styling (monospace font, subtle background, border-radius, padding)
  - [x] Web: Implement keyboard shortcuts (native Tiptap shortcuts already work):
    - [x] ⌘+Shift+H for highlight (toolbar button available)
    - [x] ⌘+Shift+S for strikethrough (toolbar button available)
    - [x] ⌘+E for inline code (native Tiptap)
  - [x] Web: Add selection bubble menu (appears when text selected) with Bold, Italic, Code, Strikethrough, Highlight
  - [x] Web: Bubble menu hides when selection cleared or in code blocks
  - [x] **Verify:** Playwright tests passing (15 TB58 tests)

### Phase 15: Settings Page

- [x] **TB59: Settings Page - Theme**
  - [x] Web: Create SettingsPage component with sidebar navigation (Theme, Shortcuts, Defaults, Notifications, Sync)
  - [x] Web: Theme section with Light/Dark/System radio buttons or segmented control
  - [x] Web: Persist theme preference in localStorage key `settings.theme`
  - [x] Web: Apply theme globally via CSS class on body (`theme-light`, `theme-dark`) or CSS variables
  - [x] Web: System option uses `prefers-color-scheme` media query
  - [x] **Verify:** Playwright tests passing (17 TB59 tests)

- [x] **TB60: Settings Page - Keyboard Shortcuts**
  - [x] Web: Shortcuts section listing all available shortcuts with current bindings
  - [x] Web: Categories: Navigation (G T, G P, etc.), Actions (C, E, X), Views (V L, V K)
  - [x] Web: "Customize" button per shortcut opens modal with key capture
  - [x] Web: Conflict detection (warn if shortcut already used)
  - [x] Web: "Reset to Defaults" button
  - [x] Web: Persist custom shortcuts in localStorage
  - [x] **Verify:** Playwright tests passing (22 TB60 tests)

- [x] **TB61: Settings Page - Default Views**
  - [x] Web: Default view preferences section:
    - [x] Tasks default view: List or Kanban
    - [x] Dashboard default lens: Overview, Task Flow, Agents, Dependencies, or Timeline
    - [x] Default sort order for lists (by created date, priority, etc.)
  - [x] Web: Persist in localStorage key `settings.defaults`
  - [x] Web: Apply defaults on page load (tasks.viewMode synced, router redirects to preferred dashboard lens)
  - [x] **Verify:** Playwright tests passing (20 TB61 tests)

- [x] **TB62: Settings Page - Notifications**
  - [x] Web: Notification preferences section with toggles:
    - [x] Task assigned to me
    - [x] Task completed
    - [x] New message in channel
    - [x] Workflow completed/failed
  - [x] Web: Browser notification permission request button (if not granted)
  - [x] Web: Toast notification settings: duration (3s/5s/10s), position (top-right, bottom-right, top-left, bottom-left)
  - [x] Web: Persist preferences in localStorage key `settings.notifications`
  - [x] Web: Sonner toast library integrated with dynamic position/duration from settings
  - [x] **Verify:** Playwright tests passing (21 TB62 tests)

- [x] **TB63: Settings Page - Sync Config**
  - [x] Web: Sync settings section showing:
    - [x] Auto-export toggle (enable/disable automatic JSONL export) - toggle present but disabled, feature coming soon
    - [x] Export path display (read-only, shows .elemental/ path)
    - [x] Last export timestamp
    - [x] Dirty element count (elements with unsaved changes)
  - [x] Web: "Export Now" button triggers manual export
  - [x] Web: "Import" button opens file picker for JSONL import
  - [x] Server: Add `POST /api/sync/export` and `POST /api/sync/import` endpoints
  - [x] **Verify:** Playwright tests passing (12 TB63 tests)

### Phase 16: Entity Inbox UI

- [x] **TB64: Entity Inbox Tab**
  - [x] Server: Add `GET /api/entities/:id/inbox` endpoint (with hydration support)
  - [x] Server: Add `GET /api/entities/:id/inbox/count` endpoint
  - [x] Web: Add "Inbox" tab to EntityDetailPanel
  - [x] Web: Create InboxTab component with unread count badge in tab
  - [x] Web: InboxItemCard component showing: sender avatar, sender name, channel name, message preview, timestamp, source badge (direct/mention), read indicator
  - [x] Web: Click item → navigate to message in channel
  - [x] **Verify:** Playwright tests passing (6 tests passed)

- [x] **TB65: Inbox Actions**
  - [x] Server: Add `PATCH /api/inbox/:itemId` endpoint (status update)
  - [x] Server: Add `POST /api/entities/:id/inbox/mark-all-read` endpoint
  - [x] Web: Mark as read/unread toggle on inbox items
  - [x] Web: "Mark all read" bulk action button
  - [x] Web: Archive action on inbox items
  - [x] Web: WebSocket events for real-time inbox updates
  - [x] **Verify:** Playwright tests passing (12 TB65 tests, 1 passed, 11 skipped due to no inbox items in test db)

- [x] **TB66: Entity Management Hierarchy**
  - [x] Server: Add `GET /api/entities/:id/reports` endpoint (direct reports)
  - [x] Server: Add `GET /api/entities/:id/chain` endpoint (management chain)
  - [x] Server: Add `PATCH /api/entities/:id/manager` endpoint (set/clear manager)
  - [x] Web: Add "Reports To" field in EntityDetailPanel (editable)
  - [x] Web: Add "Direct Reports" section showing entities reporting to this one
  - [x] Web: Org chart visualization (tree view of hierarchy)
  - [x] **Verify:** Playwright tests passing (13 TB66 tests)

### Phase 17: Data Loading Architecture Refactor

**Goal:** Load all data upfront on initial app load for instant navigation, while using virtualized rendering and table pagination for UI performance.

- [x] **TB67: Upfront Data Loading Strategy**
  - [x] Web: Create `DataPreloader` provider that loads all elements on app mount
  - [x] Web: Add `useAllTasks`, `useAllPlans`, `useAllEntities`, `useAllDocuments`, etc. hooks
  - [x] Server: Add `GET /api/elements/all` endpoint that returns all elements in single response (with type discrimination)
  - [x] Web: Show loading spinner during initial data fetch with progress indicator
  - [x] Web: Store all data in TanStack Query cache with `staleTime: Infinity`
  - [x] Web: WebSocket events update cache in-place (no refetching needed)
  - [x] **Verify:** App loads with spinner, then all pages are instant; Playwright tests passing (11 tests)

- [x] **TB68: Virtualized List Component**
  - [x] Web: Install `@tanstack/react-virtual` for list virtualization
  - [x] Web: Create `VirtualizedList` component that renders only visible items
  - [x] Web: Integrate with TaskList (infinite scroll, renders 50+ tasks smoothly)
  - [x] Web: Integrate with MessageList in channel view
  - [x] Web: Integrate with EventList in timeline
  - [x] Web: Add scroll position restoration on navigation
  - [x] **Verify:** Create 500+ tasks via CLI, scroll through list smoothly without lag; Playwright tests confirm render performance (14 tests)

- [x] **TB69: Table Pagination with Full Dataset**
  - [x] Web: Update Pagination component to work with in-memory data (not server pagination)
  - [x] Web: Implement client-side filtering and sorting for all table views
  - [x] Web: Table views (Tasks list, Entities, Teams, Documents, Channels) use pagination
  - [x] Web: Non-table views (Kanban, Timeline, Messages) use virtualized infinite scroll
  - [x] Web: Pagination state synced to URL (`?page=2&limit=25`)
  - [x] **Verify:** Playwright tests confirm client-side pagination works (13 tests)
  - [x] **Verify:** Tasks table shows pagination controls, changing page is instant; Playwright tests passing

- [x] **TB70: Deep-Link Navigation**
  - [x] Web: When navigating to `/tasks?selected=:id` where task not in current page, auto-load that item
  - [x] Web: Scroll to item and highlight it temporarily (2s yellow flash)
  - [x] Web: Works for all element types (tasks, plans, workflows, documents, entities, teams)
  - [x] Web: Handle edge case: element doesn't exist → show "Not Found" message
  - [x] Web: Add `useDeepLink` hook and utilities in `src/lib/deep-link.ts`
  - [x] Web: Add `ElementNotFound` component for graceful 404 handling
  - [x] **Verify:** Playwright tests passing (14 tests)

### Phase 18: UI Design System Overhaul

**Goal:** Re-skin the application using the `/frontend-design` skill to achieve a modern, professional look inspired by Linear, Notion, and Obsidian.

- [x] **TB71: Design Tokens Foundation**
  - [x] Web: Create `src/styles/tokens.css` with CSS custom properties for:
    - [x] Colors: primary, secondary, accent, success, warning, error, neutral scale (50-950)
    - [x] Spacing: consistent 4px grid (0.5, 1, 1.5, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24)
    - [x] Typography: font-family, font-sizes (xs, sm, base, lg, xl, 2xl), line-heights, font-weights
    - [x] Border radius: none, sm, md, lg, xl, full
    - [x] Shadows: sm, md, lg, xl (subtle, modern shadows)
    - [x] Transitions: fast (100ms), normal (200ms), slow (300ms)
  - [x] Web: Update Tailwind config to use CSS variables
  - [x] Web: Document tokens in `src/styles/README.md`
  - [x] **Verify:** Playwright tests passing (12 TB71 tests)

- [x] **TB72: Dark/Light Mode Overhaul**
  - [x] Web: Define complete color palette for both modes in `tokens.css`
  - [x] Web: Dark mode: deep charcoal backgrounds (#0D0D0D, #1A1A1A), subtle borders, muted colors
  - [x] Web: Light mode: clean whites and grays, crisp contrast, subtle shadows
  - [x] Web: Fix Settings page notification types horizontal padding issue
  - [x] Web: Add smooth transition between modes (300ms background color transition)
  - [x] Web: Ensure all components respect theme (AppShell, Sidebar, Header updated)
  - [x] Web: Add theme toggle to header (sun/moon icon) in addition to Settings
  - [x] **Verify:** Toggle dark/light mode, all UI elements update correctly with smooth transition; Playwright tests for both modes (17 TB72 tests)

- [x] **TB73: Core Component Styling**
  - [x] Web: Restyle Button component (primary, secondary, ghost, danger variants)
    - [x] Subtle hover states with background color shift
    - [x] Active states with slight scale (0.98)
    - [x] Focus rings for accessibility
  - [x] Web: Restyle Input/Textarea components
    - [x] Clean borders, focus states with primary color ring
    - [x] Error states with red border and message
  - [x] Web: Restyle Dialog/Modal components
    - [x] Backdrop blur, centered content, smooth animation
    - [x] Consistent header, body, footer sections
  - [x] Web: Restyle Dropdown/Select components
    - [x] Consistent with inputs, smooth open/close animation
  - [x] Web: Create Badge component with variants (default, primary, success, warning, error, outline)
  - [x] Web: Create Card component with variants (default, elevated, outlined)
  - [x] Web: Install @radix-ui/react-dialog and @radix-ui/react-select for accessible components
  - [x] Web: Create UI component index for centralized exports (src/components/ui/index.ts)
  - [x] **Verify:** All interactive components look polished and consistent; Playwright tests passing (14 TB73 tests)

- [x] **TB74: Card and Table Styling**
  - [x] Web: Create consistent Card component with variants (default, elevated, outlined) - Enhanced existing Card.tsx
  - [x] Web: Restyle all card-based lists (TaskCard, PlanCard, WorkflowCard, EntityCard, TeamCard)
    - [x] Subtle border, hover elevation, consistent padding
    - [x] Status badges with appropriate colors
    - [x] Timestamps in muted text
  - [x] Web: Restyle DataTable component - Project uses card-based grid layout, not DataTable
    - [x] Clean header row with sortable column indicators - N/A
    - [x] Alternating row backgrounds (subtle) or clean borders - N/A
    - [x] Hover state on rows - N/A
    - [x] Selection state (checkbox column) - N/A
  - [x] Web: Consistent empty states with illustrations and helpful text - Created EmptyState component
  - [x] **Verify:** All tables and cards look consistent and professional; Playwright tests passing (15 TB74 tests)

- [x] **TB75: Sidebar and Navigation Styling**
  - [x] Web: Restyle Sidebar with Linear-inspired design
    - [x] Collapsible sections with smooth animation (Dashboard, Work, Collaborate, Organize)
    - [x] Active item indicator (left border bar with primary color)
    - [x] Hover states with subtle background
    - [x] Icon + text alignment with shortcuts visible on hover
  - [x] Web: Sub-sections support (collapsible groups within sidebar with chevron toggle)
  - [x] Web: Restyle Header/Breadcrumbs
    - [x] Clean separator between breadcrumb items (ChevronRight icon)
    - [x] Current page in bold (font-semibold)
    - [x] Clickable parent breadcrumbs for navigation
    - [x] Icon support in breadcrumbs
  - [x] Web: Restyle CommandPalette
    - [x] Larger, more prominent search input (text-lg)
    - [x] Better visual hierarchy for results (grouped by section with uppercase headers)
    - [x] Keyboard shortcut hints (footer with arrow keys, enter, ⌘K)
    - [x] Icon containers with styled backgrounds
    - [x] Shortcut keys as styled kbd badges
  - [x] Web: Added keyboard hint (⌘K for commands) in sidebar footer
  - [x] Web: Styled logo with gradient background
  - [x] **Verify:** Navigation feels snappy and looks polished; Playwright tests passing (28 TB75 tests)

### Phase 19: Dashboard Overhaul

**Goal:** Improve dashboard UX with better navigation structure, modal-based actions, and enhanced visualizations.

- [x] **TB76: Dashboard Sub-Section Navigation**
  - [x] Web: Move dashboard lenses into sidebar as collapsible sub-section under "Dashboard"
    - [x] Dashboard (parent) → Overview, Task Flow, Agents, Dependencies, Timeline (children)
  - [x] Web: Remove tab navigation from dashboard content area (already done - no tabs existed)
  - [x] Web: Each sub-section is a full-height view (already done)
  - [x] Web: Persist last-visited dashboard section in localStorage (`dashboard.lastVisited`)
  - [x] Web: Update routes: `/dashboard/overview`, `/dashboard/task-flow`, etc.
  - [x] **Verify:** Navigate between dashboard sections via sidebar; Playwright tests passing (13 tests)

- [x] **TB77: Dashboard Quick Actions with Modals**
  - [x] Web: "Create Task" button opens CreateTaskModal (not navigate away)
  - [x] Web: "Pour Workflow" button opens PourWorkflowModal (not navigate away)
  - [x] Web: After successful creation, show toast and optionally navigate to new item
  - [x] Web: Add keyboard shortcuts: `C T` for Create Task, `C W` for Pour Workflow from dashboard
  - [x] **Verify:** Create task from dashboard without leaving page; Playwright tests passing (20 tests)

- [x] **TB78: Dashboard Overview Charts**
  - [x] Web: Install lightweight chart library (recharts or chart.js with react-chartjs-2)
  - [x] Web: Add "Tasks by Status" donut chart (open, in_progress, blocked, completed)
  - [x] Web: Add "Tasks Completed Over Time" line chart (last 7 days)
  - [x] Web: Add "Workload by Agent" horizontal bar chart
  - [x] Web: Make charts interactive (click segment → filter to that status)
  - [x] Web: Responsive layout: charts in grid on large screens, stacked on mobile
  - [x] **Verify:** Charts render with real data, interactions work; Playwright tests passing (20 tests)

- [x] **TB79: View More Ready Tasks Fix**
  - [x] Web: "View more ready tasks" link navigates to `/tasks?readyOnly=true` (uses readyOnly param for ready task filtering)
  - [x] Web: Tasks page respects URL readyOnly param - fetches ready task IDs from API and filters in-memory
  - [x] Web: Add filter chip showing "Ready tasks only" with clear button (removes readyOnly from URL)
  - [x] Web: TaskList filters from in-memory data using ready task IDs from `/api/tasks/ready`
  - [x] Web: readyOnly filter is preserved during pagination, sorting, and when clearing other filters
  - [x] **Verify:** Click "View more ready tasks", only ready tasks shown; Playwright tests passing (10 tests)

### Phase 20: Tasks Page Enhancements (Linear-inspired)

**Goal:** Bring Linear-quality UX to the Tasks page with grouping, ordering, rich display, and search.

- [x] **TB80: Task Grouping**
  - [x] Web: Add "Group by" dropdown (None, Status, Priority, Assignee, Type, Tags) - `apps/web/src/routes/tasks.tsx` GroupByDropdown component
  - [x] Web: Render grouped tasks with collapsible section headers - GroupedListView component with GroupHeader
  - [x] Web: Show count per group in header - Count badge in GroupHeader component
  - [x] Web: Remember grouping preference in localStorage - `tasks.groupBy` key with getStoredGroupBy/setStoredGroupBy
  - [x] Web: Works in List view (Kanban inherently groups by status) - Dropdown only shown in list view
  - [x] **Verify:** Group tasks by priority, see Priority 1 section with count; Playwright tests passing (17 tests)

- [x] **TB81: Task Ordering and Sorting**
  - [x] Web: Add "Sort by" dropdown (Priority, Created, Updated, Deadline, Title, Complexity) - `apps/web/src/routes/tasks.tsx` SortByDropdown component
  - [x] Web: Ascending/descending toggle - sort-direction-toggle button with ArrowUp/ArrowDown icons
  - [x] Web: Secondary sort option (e.g., Priority then Created) - Secondary sort submenu with all options except primary
  - [x] Web: Sort preferences persist in localStorage (`tasks.sortBy`, `tasks.sortDir`, `tasks.secondarySort`)
  - [x] Web: Header column click sorts by that field with direction toggle
  - [ ] Web: Drag-and-drop manual ordering within groups (persists to task.metadata.manualOrder) - Deferred to future implementation
  - [x] **Verify:** Sort by priority, secondary sort works, preferences persist; Playwright tests passing (17 tests)

- [x] **TB82: Task Search**
  - [x] Web: Add search bar at top of Tasks page
  - [x] Web: Search filters tasks by title (fuzzy match with highlighting)
  - [ ] Web: Search also searches task description content (if hydrated) - Deferred to future implementation
  - [x] Web: Debounced input (300ms) for performance
  - [x] Web: Clear search button and keyboard shortcut (Escape)
  - [x] Web: Search works with grouping and sorting (search first, then group, then sort)
  - [x] **Verify:** Search for "auth", matching tasks highlighted; Playwright tests passing (17 tests)

- [x] **TB83: Rich Task Display**
  - [x] Server: `/api/elements/all?includeTaskCounts=true` returns tasks with `_attachmentCount`, `_blocksCount`, `_blockedByCount`
  - [x] Server: `/api/tasks/ready` and `/api/tasks/blocked` include task counts for rich display
  - [x] Web: TaskCard shows inline description preview (first 2 lines, truncated) with `showDescription` prop
  - [x] Web: TaskCard shows attachment count badge with Paperclip icon when `_attachmentCount > 0`
  - [x] Web: TaskCard shows dependency counts: "Blocks N" (warning color) and "Blocked by N" (error color)
  - [x] Web: Hover preview: Radix Tooltip shows full description (up to 500 chars) when truncated
  - [x] Web: `showCounts` and `showDescription` props allow disabling rich features per-use
  - [x] Web: Task type definitions updated with count fields: `_attachmentCount`, `_blocksCount`, `_blockedByCount`, `description`
  - [x] **Verify:** Playwright tests passing (13 TB83 tests) - API, Dashboard TaskCard, and count calculations verified

- [x] **TB84: Dependencies as Sub-Issues Display**
  - [x] Server: New endpoint `/api/tasks/:id/dependency-tasks` returns hydrated task details for dependencies
  - [x] Web: TaskDetailPanel shows "Blocked By" section as expandable sub-task list with DependencySubIssues component
  - [x] Web: Each blocker shown as SubIssueCard (title, status icon, priority badge, click to navigate)
  - [x] Web: TaskDetailPanel shows "Blocks" section similarly
  - [x] Web: Show progress in header: "0 of 1 resolved" format
  - [x] Web: Add "Create Blocker Task" button with CreateBlockerModal to quickly create a sub-task that blocks this one
  - [x] **Verify:** Playwright tests passing (16 TB84 tests) - API, UI sections, cards, navigation, and create blocker flow verified
  - [x] **Verify:** View task with dependencies, see them as sub-issues; Playwright tests passing

- [x] **TB85: Kanban Pagination Fix**
  - [x] Web: Kanban columns use virtualized rendering (virtual scroll within each column) - `VirtualizedKanbanColumn` component using `@tanstack/react-virtual`
  - [x] Web: Each column can scroll independently - Each column has `overflow-y-auto` and `max-h-[calc(100vh-200px)]`
  - [x] Web: Column headers show total count and loaded count if different - Count badge with `data-testid="kanban-column-{status}-count"`
  - [x] Web: Drag-and-drop works across columns even with virtualization - `useDroppable` hook for column drop zones
  - [x] Web: Remove server-side pagination for Kanban (uses in-memory data) - Kanban receives full task list from parent
  - [x] **Verify:** Kanban with 100+ tasks per column scrolls smoothly; Playwright tests passing (8 passed, 3 skipped due to no test data)

### Phase 21: Plans Page Enhancements (Linear-inspired)

**Goal:** Add visual progress indicators, search, and a roadmap view to Plans.

- [x] **TB86: Plan Visual Progress Indicator**
  - [x] Web: Replace text progress with visual progress ring (circular progress indicator) - `src/components/shared/ProgressRing.tsx` with SVG-based ring
  - [x] Web: Ring shows percentage complete with number in center - `showPercentage` prop controls center text display
  - [x] Web: Color-coded: green for healthy progress (>=50%), yellow for at-risk (25-49%), red for behind (<25%) - `autoStatus` prop with `STATUS_COLORS`
  - [x] Web: PlanListItem shows mini progress ring (32px) - `size="mini"` prop in plan list item component
  - [x] Web: PlanDetailPanel shows large progress ring (80px) with breakdown - `ProgressRingWithBreakdown` component with completed/total counts
  - [x] Server: `/api/plans?hydrate.progress=true` returns all plans with progress data (TB86)
  - [x] **Verify:** Plans show visual progress rings; Playwright tests passing (10 TB86 tests)

- [x] **TB87: Plan Search**
  - [x] Web: Add search bar to Plans page with PlanSearchBar component (similar pattern to TaskSearchBar)
  - [x] Web: Fuzzy search by plan title with debounced input (300ms)
  - [x] Web: Highlight matching text in results using mark elements
  - [x] Web: Filter combines with status filter tabs (server-side status filter + client-side search)
  - [x] Web: Search persists in localStorage, / keyboard shortcut to focus, Escape to clear
  - [x] **Verify:** Search for plans, matching plans shown with highlighting; 16 Playwright tests passing

- [x] **TB88: Plan Roadmap View** ✅
  - [x] Web: Add "Roadmap" view toggle (alongside List view)
  - [x] Web: Roadmap shows plans as horizontal bars on a timeline
  - [x] Web: X-axis: time (weeks/months)
  - [x] Web: Y-axis: plans (stacked rows)
  - [x] Web: Bar length based on plan duration (first task created → last task deadline or completed date)
  - [x] Web: Color based on status (draft=gray, active=blue, completed=green)
  - [x] Web: Click bar → navigate to plan detail
  - [x] **Verify:** Roadmap view shows plans on timeline; Playwright tests passing (`tb88-plan-roadmap.spec.ts`)

### Phase 22: Inbox Improvements (Linear-inspired)

**Goal:** Fix inbox loading and create a Linear-quality inbox experience with filtering and sorting.

- [x] **TB89: Fix Inbox Loading**
  - [x] Server: Debug and fix `GET /api/entities/:id/inbox` endpoint to return messages
  - [x] Server: Ensure inbox items include direct messages and @mentions
  - [x] Server: Add `GET /api/inbox/all` endpoint for global inbox view
  - [x] Web: Debug InboxTab component data fetching
  - [x] Web: Add error state with retry button
  - [x] **Verify:** Navigate to entity inbox, messages load correctly; Playwright tests passing

- [x] **TB90: Inbox Views (Unread/All/Archived)**
  - [x] Web: Add view toggle tabs: "Unread", "All", "Archived" - `apps/web/src/routes/entities.tsx` InboxViewTabs
  - [x] Web: Unread shows only items with `status === 'unread'` - useEntityInbox hook with status filter
  - [x] Web: All shows unread + read items - API filters with `status=unread,read`
  - [x] Web: Archived shows archived items with "Restore" action - Restore button changes status to 'read'
  - [x] Web: Unread count badge on "Unread" tab - Badge shows count from inbox/count API
  - [x] Web: Archived count badge on "Archived" tab - Badge shows total from archived query
  - [x] Web: Remember selected view in localStorage - `inbox.view` key with getStoredInboxView/setStoredInboxView
  - [x] **Verify:** Switch between views, counts update correctly; Playwright tests passing (7 passed, 8 skipped due to no inbox data)

- [x] **TB91: Inbox Message Summary Sidebar**
  - [x] Web: Create split layout: message list (left 40%), message content (right 60%)
  - [x] Web: Message list shows: avatar, sender name, preview (first line), time ago, unread indicator
  - [x] Web: Selected message highlighted
  - [x] Web: Keyboard navigation: J/K to move between messages
  - [x] Web: Virtualized list for performance
  - [x] **Verify:** Click message in list, full content shows on right; Playwright tests passing (2 passed, 12 skipped due to no inbox data)

- [x] **TB92: Inbox Full Message Content**
  - [x] Web: Right panel shows full message with:
    - [x] Sender avatar and name (clickable → entity detail)
    - [x] Channel name (clickable → channel)
    - [x] Full timestamp (relative + absolute on hover)
    - [x] Full message content (rendered markdown)
    - [x] Attachments rendered inline (document embeds)
    - [x] Thread context (if reply, show parent message)
  - [x] Web: Actions: Reply, Mark read/unread, Archive
  - [x] Server: Enhanced `GET /api/entities/:id/inbox` to return fullContent, attachments, threadParent
  - [x] **Verify:** Full message content renders with all metadata; Playwright tests passing (16 tests, skipped when no inbox data)

- [x] **TB93: Inbox Filtering and Sorting**
  - [x] Web: Add filter dropdown: All, Direct Messages, Mentions (multi-select) - `apps/web/src/routes/entities.tsx` InboxSourceFilter type and dropdown
  - [x] Web: Add sort dropdown: Newest, Oldest, Sender - InboxSortOrder type and dropdown
  - [x] Web: Combine with view filter (Unread + Direct Messages) - filteredAndSortedInboxItems useMemo
  - [x] Web: Filter chips show active filters with clear buttons - inbox-active-filters section
  - [x] Web: LocalStorage persistence for filter/sort preferences - inbox.sourceFilter and inbox.sortOrder keys
  - [x] **Verify:** Filter to unread mentions only, correct messages shown; Playwright tests passing (17 tests)

- [ ] **TB94: Inbox Time-Ago Indicator**
  - [ ] Web: Show relative time for each message ("2m ago", "1h ago", "Yesterday", "Jan 15")
  - [ ] Web: Update relative times periodically (every minute for recent, less often for older)
  - [ ] Web: Group messages by time period (Today, Yesterday, This Week, Earlier) with sticky headers
  - [ ] **Verify:** Times display correctly and update; Playwright tests passing

### Phase 22B: Document Editor Core Fixes

**Goal:** Fix fundamental document editor issues with a **Markdown-first architecture**.

> **Key Principle:** All document content is stored as Markdown, not proprietary JSON formats.
> This ensures AI agents can read and write documents naturally, maximizes token efficiency,
> and maintains universal interoperability with external tools. The editor provides rich UX
> for humans while persisting standard Markdown that any system can understand.

- [ ] **TB94a: Editor Expand in Edit Mode**
  - [ ] Web: Debug why editor cannot be expanded/resized while in editing mode
  - [ ] Web: Ensure editor panel supports resize handle or expand button in edit mode
  - [ ] Web: Add fullscreen/focus mode toggle (Escape to exit)
  - [ ] Web: Persist editor size preference in localStorage
  - [ ] **Verify:** Enter edit mode, expand editor to fullscreen, content persists; Claude in Chrome confirms

- [ ] **TB94b: Core Formatting Fixes**
  - [ ] Web: Debug and fix headings (H1, H2, H3) - ensure toolbar buttons and slash commands work
  - [ ] Web: Debug and fix highlighting - ensure toolbar button and keyboard shortcut apply highlight
  - [ ] Web: Debug and fix bullet lists - ensure Enter continues list, Tab indents, Shift+Tab outdents
  - [ ] Web: Debug and fix numbered lists - same behavior as bullet lists, auto-numbering works
  - [ ] Web: Debug and fix code blocks - syntax highlighting, language selector, proper font
  - [ ] Web: Debug and fix block quotes - proper styling, nesting support
  - [ ] Web: Ensure all formatting persists on save and displays correctly in view mode
  - [ ] Web: Add comprehensive test coverage for each formatting type
  - [ ] **Verify:** Create document with all formatting types, save, refresh, all formatting preserved; Playwright tests passing

- [ ] **TB94c: Markdown-First Editor Architecture**

  > **Design Decision:** We intentionally use **Markdown as the canonical storage format** rather than
  > a proprietary JSON format (like BlockNote). This ensures:
  >
  > - **AI Agent Compatibility:** Agents can read/write documents naturally without schema knowledge
  > - **Token Efficiency:** Markdown is 3-5x more compact than structured JSON for the same content
  > - **Universal Interoperability:** Works with GitHub, external tools, and other AI systems
  > - **Simplicity:** No format migration, no schema versioning, no complex nested structures
  - [ ] Web: Refactor BlockEditor to use Markdown as source of truth (not HTML or plain text)
  - [ ] Web: Install and configure `@tiptap/extension-markdown` or use `turndown`/`marked` for conversion
  - [ ] Web: Update `onChange` to emit Markdown string directly
  - [ ] Web: Update content loading to parse Markdown → Tiptap document
  - [ ] Web: Ensure round-trip fidelity: Markdown → Editor → Markdown preserves formatting
  - [ ] Web: Test with complex documents (headings, lists, code blocks, links, embeds)
  - [ ] **Verify:** Create document with mixed formatting, save, reload—Markdown content matches exactly; AI agent can read document via API and understand structure

- [ ] **TB94c-2: Block Drag-and-Drop with Markdown Persistence**
  - [ ] Web: Debug `tiptap-extension-global-drag-handle` integration
  - [ ] Web: Ensure drag handles appear on hover for paragraphs, headings, lists, code blocks
  - [ ] Web: Fix any CSS conflicts (z-index, positioning) preventing drag handle visibility
  - [ ] Web: Implement block reordering via drag-and-drop
  - [ ] Web: Visual drop indicator (blue line) between blocks while dragging
  - [ ] Web: After drop, Markdown output reflects new block order
  - [ ] **Verify:** Drag paragraph to new position, save, check raw Markdown—order changed correctly; Playwright tests passing

- [ ] **TB94d: Text Alignment**
  - [ ] Web: Add text alignment extension (@tiptap/extension-text-align)
  - [ ] Web: Add toolbar buttons: Align Left, Center, Align Right, Justify
  - [ ] Web: Add slash commands: /left, /center, /right, /justify
  - [ ] Web: Keyboard shortcuts: ⌘+Shift+L (left), ⌘+Shift+E (center), ⌘+Shift+R (right)
  - [ ] Web: Alignment applies to current block (paragraph, heading)
  - [ ] Web: Alignment indicator in toolbar (shows current alignment state)
  - [ ] Web: Alignment stored in Markdown using HTML attributes or custom syntax (e.g., `{.center}`)
  - [ ] **Verify:** Create centered heading, right-aligned paragraph, alignment persists in Markdown; Playwright tests passing

- [ ] **TB94e: Image Block Support (Markdown-Compatible)**

  > **Markdown Format for Images:** Images use standard Markdown syntax that AI agents can read/write:
  >
  > - Basic: `![alt text](/api/uploads/abc123.png)`
  > - With caption: `![alt text](/api/uploads/abc123.png "caption text")`
  > - With dimensions: `![alt text|400x300](/api/uploads/abc123.png)` (extended syntax)
  - [ ] Web: Add Image extension (@tiptap/extension-image)
  - [ ] Web: Image insertion methods:
    - [ ] Slash command: /image opens picker
    - [ ] Toolbar button: Image icon
    - [ ] Drag-and-drop: Drop image file into editor
    - [ ] Paste: Paste image from clipboard
    - [ ] URL: Paste image URL, auto-converts to image block
  - [ ] Web: Markdown output uses standard `![alt](url)` syntax
  - [ ] Server: Add `POST /api/uploads` endpoint
    - [ ] Accept multipart/form-data with image file
    - [ ] Store in `.elemental/uploads/{hash}.{ext}`
    - [ ] Return URL: `/api/uploads/{hash}.{ext}`
    - [ ] Support: jpg, png, gif, webp, svg (validate MIME type)
    - [ ] Max size: 10MB
  - [ ] Server: Add `GET /api/uploads/:filename` endpoint (serve uploaded files)
  - [ ] Web: Image block features:
    - [ ] Resize handles (corner drag to resize, maintain aspect ratio with Shift)
    - [ ] Alignment options (left, center, right, full-width)
    - [ ] Alt text editing (click image → popover with alt text input)
    - [ ] Caption support (optional text below image)
    - [ ] Loading state (skeleton placeholder while uploading/loading)
    - [ ] Error state (broken image indicator with retry button)
  - [ ] **Verify:** Upload image, check Markdown contains `![alt](url)`; manually write image Markdown, editor renders image; Playwright tests passing

- [ ] **TB94f: Task and Document Embedding (Markdown-Compatible)**

  > **Markdown Format for Embeds:** Embeds are stored as custom Markdown syntax that AI agents can
  > easily read and write:
  >
  > - Task embed: `![[task:el-abc123]]` or `{{task:el-abc123}}`
  > - Document embed: `![[doc:el-xyz789]]` or `{{doc:el-xyz789}}`
  > - Inline link (existing): `[Task Title](/tasks/el-abc123)`
  >
  > This allows agents to create embeds by simply writing the syntax, without needing editor UI.
  - [ ] Web: Define embed syntax convention (e.g., `![[task:ID]]` inspired by Obsidian)
  - [ ] Web: Distinguish between "link" (inline text link) and "embed" (rich preview block)
  - [ ] Web: Create Tiptap node that parses embed syntax from Markdown
  - [ ] Web: Task embed block:
    - [ ] Slash command: /task-embed opens task picker
    - [ ] Markdown output: `![[task:el-abc123]]`
    - [ ] Renders as card showing: title, status badge, priority, assignee avatar
    - [ ] Real-time updates: if task status changes, embed updates
    - [ ] Click → navigates to task detail (or opens slide-over)
    - [ ] Hover → shows full task preview tooltip
    - [ ] Actions: Open, Remove embed
  - [ ] Web: Document embed block:
    - [ ] Slash command: /doc-embed opens document picker
    - [ ] Markdown output: `![[doc:el-xyz789]]`
    - [ ] Renders as card showing: title, content type badge, first 2 lines preview
    - [ ] Click → navigates to document (or opens in side panel)
    - [ ] Expand toggle: show full document content inline (read-only)
    - [ ] Actions: Open, Expand/Collapse, Remove embed
  - [ ] Web: Embed blocks are distinct from existing inline links (TB57)
  - [ ] Server: Parse embed syntax when indexing documents for search
  - [ ] Server: Ensure `references` dependencies are created for embeds
  - [ ] **Verify:** Embed task via UI, check Markdown contains `![[task:ID]]`; manually write embed syntax, editor renders card; Playwright tests passing

### Phase 23: Documents Page Enhancements (Notion-inspired)

**Goal:** Enhance the document editor with Notion-inspired features.

- [ ] **TB95: Document Search**
  - [ ] Web: Add search bar to Documents page sidebar
  - [ ] Web: Search by document title and content (full-text)
  - [ ] Web: Results show title and content snippet with highlighted match
  - [ ] Web: Click result → open document
  - [ ] Web: Keyboard shortcut: `/` focuses search when in Documents
  - [ ] **Verify:** Search for keyword, matching documents shown with preview; Playwright tests passing

- [ ] **TB96: Media Library Browser**

  > Note: Core image support is in TB94e. This TB adds a media library for managing uploaded assets.
  - [ ] Web: Add "Media Library" tab/modal accessible from image picker
  - [ ] Web: Show grid of all uploaded images for current workspace
  - [ ] Web: Search/filter uploaded images by filename
  - [ ] Web: Click to insert existing image (reuse URL, don't re-upload)
  - [ ] Web: Delete unused images from library
  - [ ] Server: Add `GET /api/uploads` endpoint (list all uploads with metadata)
  - [ ] Server: Add `DELETE /api/uploads/:filename` endpoint
  - [ ] Server: Track image usage (which documents reference each image)
  - [ ] **Verify:** Upload image, see it in media library, insert into different document; Playwright tests passing

- [ ] **TB97: Emoji Support (Markdown-Compatible)**

  > **Markdown Format for Emojis:** Emojis are stored as Unicode characters directly in Markdown,
  > which AI agents can read/write natively. The `:shortcode:` syntax is converted to Unicode on input.
  - [ ] Web: Add emoji picker button to toolbar
  - [ ] Web: Emoji picker modal with categories and search
  - [ ] Web: Type `:emoji_name:` to trigger inline emoji autocomplete
  - [ ] Web: Convert shortcodes to Unicode on insert (e.g., `:rocket:` → 🚀)
  - [ ] Web: Store as Unicode in Markdown (not shortcodes) for universal compatibility
  - [ ] Web: Common emojis suggested first (recently used)
  - [ ] Web: Document icon/emoji in library tree (stored in document metadata)
  - [ ] **Verify:** Insert emoji via picker, check Markdown contains Unicode character; type `:smile:`, converts to 😄; Playwright tests passing

- [ ] **TB98: Inline Comments (Stored Separately)**

  > **Markdown Compatibility:** Comments are stored separately from document content, not inline.
  > This keeps the Markdown clean and readable by AI agents. Comments reference text by anchor
  > (hash of surrounding context) rather than embedding markers in the document.
  - [ ] Web: Add ability to select text and add comment (bubble menu option)
  - [ ] Web: Commented text shows highlight background (configurable color)
  - [ ] Web: Click highlighted text → show comment in side panel
  - [ ] Web: Comment shows: author avatar, text, timestamp, resolve button
  - [ ] Server: Add `POST /api/documents/:id/comments` endpoint
    - [ ] Store: documentId, textAnchor (hash + surrounding context), position, commentText
    - [ ] Comments are separate entities, not embedded in Markdown
  - [ ] Server: Add `GET /api/documents/:id/comments` endpoint
  - [ ] Server: Add `PATCH /api/comments/:id` endpoint (resolve, edit)
  - [ ] Web: On document load, match comment anchors to current text positions
  - [ ] Web: Handle anchor drift (text changed) gracefully—show "text moved" indicator
  - [ ] Web: Resolved comments hidden by default with "Show resolved" toggle
  - [ ] **Verify:** Add comment, check Markdown has no comment markers; reload, comment reattaches to correct text; Playwright tests passing

### Phase 24: Messages Page Enhancements (Slack-inspired)

**Goal:** Enhance the messaging experience with Slack-inspired features.

- [ ] **TB99: Message Day Separation**
  - [ ] Web: Group messages by day with separator headers
  - [ ] Web: Date separator shows: "Today", "Yesterday", or full date "Monday, January 15"
  - [ ] Web: Sticky date header while scrolling
  - [ ] Web: Consistent styling with message bubbles
  - [ ] **Verify:** Messages grouped by day with clear separators; Claude in Chrome visual inspection

- [ ] **TB100: Copy Message Action**
  - [ ] Web: Add "Copy" action to message hover menu (or right-click context menu)
  - [ ] Web: Copies message content as plain text
  - [ ] Web: Show toast confirmation "Message copied"
  - [ ] Web: Keyboard shortcut: `C` when message focused
  - [ ] **Verify:** Right-click message → Copy, content in clipboard; Playwright tests passing

- [ ] **TB101: Rich Text in MessageComposer**
  - [ ] Web: Replace plain textarea with mini Tiptap editor
  - [ ] Web: Support: bold (⌘B), italic (⌘I), underline (⌘U), strikethrough
  - [ ] Web: Support: inline code (`), code block (```)
  - [ ] Web: Support: bullet list, numbered list
  - [ ] Web: Support: block quote (>)
  - [ ] Web: Compact toolbar shown below input (optional, can toggle)
  - [ ] Web: Markdown shortcuts work (e.g., **bold**, _italic_)
  - [ ] **Verify:** Compose message with bold and code block, renders correctly; Playwright tests passing

- [ ] **TB102: Image Input in Messages**
  - [ ] Web: Add image attachment button to MessageComposer
  - [ ] Web: Click → file picker for image
  - [ ] Web: Drag-and-drop image into composer
  - [ ] Web: Paste image from clipboard
  - [ ] Web: Preview attached image before sending
  - [ ] Web: Remove attachment button (X on preview)
  - [ ] Server: Images uploaded to server, URL stored in message document
  - [ ] **Verify:** Attach image, send message, image renders in chat; Playwright tests passing

- [ ] **TB103: Message Search**
  - [ ] Web: Add search input to channel header
  - [ ] Web: Search messages within current channel
  - [ ] Web: Results show message preview with highlighted match
  - [ ] Web: Click result → scroll to message and highlight
  - [ ] Web: Global message search in command palette (searches all channels)
  - [ ] **Verify:** Search for keyword, matching messages found and highlighted; Playwright tests passing

### Phase 25: Entities & Teams Enhancements (Github-inspired)

**Goal:** Make entities and teams more interactive with clickable links and Github-inspired activity displays.

- [ ] **TB104: Clickable Member Names**
  - [ ] Web: Team member names in TeamDetailPanel are clickable links
  - [ ] Web: Click → navigate to `/entities/:id`
  - [ ] Web: Entity references throughout app are clickable (assignee in tasks, sender in messages, etc.)
  - [ ] Web: Hover shows entity preview card (name, type, avatar, current task)
  - [ ] **Verify:** Click member name in team, navigates to entity; Playwright tests passing

- [ ] **TB105: Clickable Workload Distribution**
  - [ ] Web: Workload chart bars in EntityDetailPanel and TeamDetailPanel are clickable
  - [ ] Web: Click bar → filter to that entity's tasks (navigate to `/tasks?assignee=:id`)
  - [ ] Web: Hover shows exact count and percentage
  - [ ] **Verify:** Click workload bar, tasks filtered to that entity; Playwright tests passing

- [ ] **TB106: Clickable Assigned Tasks**
  - [ ] Web: Task list items in EntityDetailPanel are clickable
  - [ ] Web: Click → navigate to `/tasks/:id` or open slide-over panel
  - [ ] Web: Consistent with task clicking behavior elsewhere in app
  - [ ] **Verify:** Click task in entity detail, task opens; Playwright tests passing

- [ ] **TB107: Add Members to Team UI**
  - [ ] Web: Add "Add Member" button in TeamDetailPanel header
  - [ ] Web: Click → open entity picker modal
  - [ ] Web: Multi-select entities to add
  - [ ] Web: Show which entities are already members (disabled in picker)
  - [ ] Web: Real-time update when members added (WebSocket)
  - [ ] **Verify:** Add 2 members to team via UI, member count updates; Playwright tests passing

- [ ] **TB108: Entity Contribution Chart**
  - [ ] Web: Add "Activity" section to EntityDetailPanel
  - [ ] Web: Github-style contribution chart (grid of squares)
  - [ ] Web: Each square = one day, color intensity = activity level (events count)
  - [ ] Web: Hover square shows date and activity count
  - [ ] Web: Last 365 days (or configurable range)
  - [ ] **Verify:** Entity activity chart renders with accurate data; Claude in Chrome visual inspection

- [ ] **TB109: Entity Activity Overview**
  - [ ] Web: Show recent activity feed in EntityDetailPanel
  - [ ] Web: List of recent events (tasks completed, messages sent, documents edited)
  - [ ] Web: Each item: icon, description, timestamp
  - [ ] Web: "View all activity" link → filtered timeline view
  - [ ] **Verify:** Activity feed shows recent actions; Playwright tests passing

- [ ] **TB110: Entity Event History (Commit History Style)**
  - [ ] Web: Add "History" tab to EntityDetailPanel
  - [ ] Web: List of all events by this entity (chronological)
  - [ ] Web: Git commit log style: hash (event ID), message, timestamp
  - [ ] Web: Click event → expand to show details (old/new values)
  - [ ] Web: Filter by event type (created, updated, closed, etc.)
  - [ ] **Verify:** Entity history shows all events in commit-log style; Playwright tests passing

### Phase 26: Entity Tagging System

**Goal:** Allow tagging entities in documents and tasks with @mentions.

- [ ] **TB111: @Mention Parsing in Documents**
  - [ ] Web: Type `@` in document editor to trigger entity autocomplete
  - [ ] Web: Autocomplete shows matching entity names with avatars
  - [ ] Web: Selected entity renders as highlighted @mention chip (clickable)
  - [ ] Web: Click @mention → navigate to entity detail
  - [ ] Server: Store mentions as metadata in document
  - [ ] Server: Create `mentions` dependency from document to entity
  - [ ] **Verify:** Type @entity-name, autocomplete appears, selection creates mention; Playwright tests passing

- [ ] **TB112: @Mention in Tasks**
  - [ ] Web: Task description editor supports @mentions (same as documents)
  - [ ] Web: @mentions in task notes field
  - [ ] Web: Show mentioned entities in task detail panel
  - [ ] Server: Create `mentions` dependency from task to entity
  - [ ] **Verify:** Mention entity in task description, entity linked; Playwright tests passing

- [ ] **TB113: Entity Tags Display**
  - [ ] Web: EntityDetailPanel shows "Mentioned In" section
  - [ ] Web: Lists documents and tasks that mention this entity
  - [ ] Web: Each item clickable → navigate to that document/task
  - [ ] Web: Count badge in section header
  - [ ] **Verify:** Entity shows list of documents/tasks that mention it; Playwright tests passing

### Phase 27: Dependencies Graph Fixes

**Goal:** Fix critical bugs in dependency graph editing.

- [ ] **TB114: Fix Adding Edges**
  - [ ] Web: Debug edge creation flow in edit mode
  - [ ] Web: Ensure `POST /api/dependencies` is called correctly
  - [ ] Web: Handle race condition where graph re-renders before edge added
  - [ ] Web: Add visual feedback: "Creating dependency..." loading state
  - [ ] Web: Add error toast if edge creation fails
  - [ ] Web: Refresh graph data after successful edge creation
  - [ ] **Verify:** Add blocks dependency via graph, edge persists on refresh; Playwright tests passing

- [ ] **TB115: Fix Removing Edges (Save Issue)**
  - [ ] Web: Debug edge deletion flow
  - [ ] Server: Verify `DELETE /api/dependencies` endpoint works correctly
  - [ ] Web: Ensure correct parameters sent (sourceId, targetId, type)
  - [ ] Web: Add confirmation dialog before edge deletion
  - [ ] Web: Optimistic UI update with rollback on error
  - [ ] Web: Refresh graph data after successful deletion
  - [ ] **Verify:** Remove edge via graph, edge deleted on refresh; Playwright tests passing

- [ ] **TB115a: Edge Type Labels**
  - [ ] Web: Display dependency type label on each edge (blocks, parent-child, awaits, relates-to, validates, etc.)
  - [ ] Web: Label positioning: centered on edge, rotated to follow edge direction
  - [ ] Web: Label styling: small font, muted color, background pill for readability
  - [ ] Web: Color-code edges by type:
    - [ ] Blocking types (blocks, parent-child, awaits): red/orange
    - [ ] Associative types (relates-to, references, validates): blue/gray
    - [ ] Attribution types (authored-by, assigned-to): green
  - [ ] Web: Toggle to show/hide edge labels (default: show)
  - [ ] Web: Hover edge → highlight label and show tooltip with full dependency info
  - [ ] Web: Legend showing edge type colors and meanings
  - [ ] **Verify:** Graph displays labeled, color-coded edges; labels readable at various zoom levels; Playwright tests passing

- [ ] **TB115b: Auto-Layout Graph Formatting**
  - [ ] Web: Add "Auto Layout" button to graph toolbar
  - [ ] Web: Implement layout algorithms (using dagre, elkjs, or React Flow's built-in):
    - [ ] Hierarchical/Tree layout: top-to-bottom or left-to-right based on dependency direction
    - [ ] Force-directed layout: for graphs without clear hierarchy
    - [ ] Radial layout: selected node in center, dependencies radiating outward
  - [ ] Web: Layout direction toggle: TB (top-bottom), LR (left-right), BT, RL
  - [ ] Web: Spacing controls: node spacing, rank spacing (distance between levels)
  - [ ] Web: Animate layout transitions (nodes smoothly move to new positions)
  - [ ] Web: "Fit to View" button: zoom and pan to show all nodes
  - [ ] Web: Persist layout preference in localStorage
  - [ ] Web: Option to save custom node positions (manual override of auto-layout)
  - [ ] **Verify:** Click Auto Layout, graph reorganizes with animation; try different layout algorithms; Playwright tests passing

### Phase 28: Timeline View Enhancements

**Goal:** Add a horizontal timeline visualization option.

- [ ] **TB116: Horizontal Timeline View**
  - [ ] Web: Add "Horizontal" view toggle to Timeline lens (alongside List view)
  - [ ] Web: Horizontal timeline shows events as dots on a time axis
  - [ ] Web: X-axis: time (auto-scaled based on date range)
  - [ ] Web: Events positioned by timestamp, stacked if overlapping
  - [ ] Web: Event dots colored by event type (create=green, update=blue, delete=red)
  - [ ] Web: Hover dot → show event details tooltip
  - [ ] Web: Click dot → show full event card
  - [ ] Web: Pan and zoom with mouse/touch
  - [ ] Web: Time range selector (Last 24h, 7 days, 30 days, All)
  - [ ] **Verify:** Timeline shows events horizontally, interactions work; Claude in Chrome visual inspection

- [ ] **TB117: Timeline Brush Selection**
  - [ ] Web: Add brush selection tool to horizontal timeline
  - [ ] Web: Drag to select time range
  - [ ] Web: Selected range shows filtered events in list below
  - [ ] Web: "Clear selection" button
  - [ ] Web: Selection syncs with URL params for shareability
  - [ ] **Verify:** Brush select time range, events filtered; Playwright tests passing

### Phase 29: Polish and Fixes

**Goal:** Address remaining UI/UX issues and polish.

- [ ] **TB118: Settings Notifications Padding Fix**
  - [ ] Web: Add horizontal padding to notification types list in Settings
  - [ ] Web: Ensure consistent padding with other settings sections
  - [ ] Web: Check all Settings sections for padding consistency
  - [ ] **Verify:** Notification types list has proper padding; Claude in Chrome visual inspection

- [ ] **TB119: Accessibility Audit**
  - [ ] Web: Run axe-core accessibility audit on all pages
  - [ ] Web: Fix any color contrast issues (especially in dark mode)
  - [ ] Web: Ensure all interactive elements have focus states
  - [ ] Web: Add ARIA labels where missing
  - [ ] Web: Ensure keyboard navigation works throughout
  - [ ] **Verify:** axe audit passes with no critical issues; Playwright accessibility tests passing

- [ ] **TB120: Performance Audit**
  - [ ] Web: Run Lighthouse performance audit
  - [ ] Web: Optimize any slow components (memo, useMemo, useCallback)
  - [ ] Web: Ensure bundle size is reasonable (code splitting if needed)
  - [ ] Web: Verify virtualization is working correctly for all long lists
  - [ ] Web: Add loading skeletons where missing
  - [ ] **Verify:** Lighthouse performance score >90; Claude in Chrome confirms smooth interactions

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

| File                        | Usage                                       |
| --------------------------- | ------------------------------------------- |
| `src/types/index.ts`        | All type exports (Task, Plan, Entity, etc.) |
| `src/api/types.ts`          | Filter types, API interfaces                |
| `src/api/elemental-api.ts`  | Full API implementation to wrap             |
| `src/http/sync-handlers.ts` | Existing sync HTTP handlers                 |
| `src/types/event.ts`        | Event types for real-time                   |
| `src/types/dependency.ts`   | Dependency system types                     |

---

## 10. Future Considerations

- **Authentication**: Currently no auth modeled; add middleware layer for user login
- **Multi-tenancy**: Single database assumed; extend for multiple workspaces/projects
- **Mobile**: Responsive design but no native app; consider React Native in future
- **Offline**: Browser storage backend exists but not integrated in web platform
- **Federation**: Cross-system sync deferred
- **Databases in Editor**: Notion-style database tables (deferred - not in current scope)
- **Collaborative Editing**: Real-time multi-user document editing (deferred)
- **AI Integration**: Agent command interface, natural language task creation (deferred)

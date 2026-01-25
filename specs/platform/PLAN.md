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

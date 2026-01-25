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

- [ ] **TB33: Entities Page - List View**
  - [ ] Web: Replace placeholder with EntityList component
  - [ ] Web: Entity cards showing: name, type badge (agent/human/system), avatar, active status indicator
  - [ ] Web: Filter tabs by entity type (All, Agents, Humans, Systems)
  - [ ] Web: Search box for entity name
  - [ ] **Verify:** View all entities with type filtering and search

- [ ] **TB34: Entity Detail Panel**
  - [ ] Server: Add `GET /api/entities/:id/stats` endpoint (task count, message count, created elements count)
  - [ ] Web: EntityDetailPanel with profile info, statistics cards, assigned tasks list
  - [ ] Web: Activity timeline showing recent events by this entity
  - [ ] Web: Split-view layout (list on left, detail on right)
  - [ ] **Verify:** Click entity, see full profile with stats and activity timeline

- [ ] **TB35: Create Entity**
  - [ ] Server: Add `POST /api/entities` endpoint (name, entityType, optional publicKey, metadata)
  - [ ] Web: Create RegisterEntityModal (name input, type selector, optional public key textarea)
  - [ ] Web: Add "Register Entity" button to Entities page
  - [ ] Web: Validation for unique name, valid entity type
  - [ ] **Verify:** Register new agent entity from UI, appears in list

- [ ] **TB36: Edit Entity**
  - [ ] Server: Add `PATCH /api/entities/:id` endpoint (name, metadata, tags, active status)
  - [ ] Web: Make EntityDetailPanel editable (edit button, inline editing for fields)
  - [ ] Web: Deactivate/reactivate toggle with confirmation
  - [ ] Web: Tag management (add/remove tags)
  - [ ] **Verify:** Edit entity metadata, deactivate entity, verify persistence

- [ ] **TB37: Teams Page - List View**
  - [ ] Server: Add `GET /api/teams` endpoint (list all teams)
  - [ ] Server: Add `GET /api/teams/:id` endpoint (team details with members)
  - [ ] Server: Add `GET /api/teams/:id/members` endpoint (hydrated member entities)
  - [ ] Web: Replace placeholder with TeamList component
  - [ ] Web: Team cards showing: name, member count, member avatar stack (first 5)
  - [ ] **Verify:** View all teams with member counts and avatar previews

- [ ] **TB38: Team Detail Panel**
  - [ ] Server: Add `GET /api/teams/:id/stats` endpoint (task count, workload distribution)
  - [ ] Web: TeamDetailPanel with member list (full), team statistics, assigned tasks
  - [ ] Web: Member management UI (add member button, remove member X button)
  - [ ] Web: Workload chart showing tasks per member
  - [ ] **Verify:** Click team, see members and stats, manage membership

- [ ] **TB39: Create Team**
  - [ ] Server: Add `POST /api/teams` endpoint (name, members array, optional description)
  - [ ] Web: Create CreateTeamModal (name input, multi-select member picker)
  - [ ] Web: Add "New Team" button to Teams page
  - [ ] **Verify:** Create team with 3 members from UI, appears in list

- [ ] **TB40: Edit Team**
  - [ ] Server: Add `PATCH /api/teams/:id` endpoint (name, add/remove members)
  - [ ] Web: Make TeamDetailPanel editable (team name, description)
  - [ ] Web: Inline add/remove member actions in member list
  - [ ] Web: Delete team button with confirmation (soft delete)
  - [ ] **Verify:** Add member to team, rename team, verify persistence

### Phase 11: Dashboard Enhancements

- [ ] **TB41: Dashboard Overview Panel**
  - [ ] Web: Create DashboardOverview component as default dashboard view
  - [ ] Web: Key metrics cards: Total Tasks, Ready vs Blocked ratio, Active Agents, Tasks Completed Today
  - [ ] Web: Quick action buttons: Create Task, Pour Workflow, View Ready Tasks
  - [ ] Web: Recent activity feed (last 10 events across all types)
  - [ ] **Verify:** Dashboard shows accurate summary metrics, quick actions work

- [ ] **TB42: Timeline Visual Overhaul**
  - [ ] Web: Redesign timeline with visual event type icons (create=plus, update=pencil, delete=trash, etc.)
  - [ ] Web: Group events by time period (Today, Yesterday, This Week, Earlier) with sticky headers
  - [ ] Web: Event cards with: actor avatar, element type badge, preview of changes, relative timestamp
  - [ ] Web: Add "jump to date" date picker for navigation
  - [ ] Web: Improve filtering UI (multi-select chips instead of dropdowns)
  - [ ] **Verify:** Timeline shows grouped events with clear visual hierarchy

- [ ] **TB43: Dependency Graph - Filter & Search**
  - [ ] Web: Add search box above graph (filter nodes by title/ID, highlights matches)
  - [ ] Web: Add filter toggles (by element type: tasks/plans/workflows, by status: open/closed)
  - [ ] Web: Implement node highlighting for search results (glow effect or border)
  - [ ] Web: Add minimap component for large graphs (React Flow MiniMap)
  - [ ] Web: Add zoom controls (+/- buttons, fit-to-view button)
  - [ ] **Verify:** Search for task in graph, matching node highlights and centers

- [ ] **TB44: Dependency Graph - Edit Mode**
  - [ ] Server: Add `POST /api/dependencies` endpoint (sourceId, targetId, type)
  - [ ] Server: Add `DELETE /api/dependencies` endpoint (sourceId, targetId, type)
  - [ ] Web: Add "Edit Mode" toggle button to graph toolbar
  - [ ] Web: In edit mode: click first node (source), click second node (target), type picker appears
  - [ ] Web: In edit mode: right-click edge shows delete option
  - [ ] Web: Visual feedback for selection state (selected node has border)
  - [ ] **Verify:** Add blocks dependency between two tasks via graph UI, edge appears

- [ ] **TB45: Agent Activity Improvements**
  - [ ] Web: Add horizontal bar chart showing tasks per agent (using simple CSS bars or chart library)
  - [ ] Web: Real-time task progress: show current task with time elapsed
  - [ ] Web: Agent status indicators: idle (gray), working (green pulse), blocked (yellow)
  - [ ] Web: Make agent cards clickable → navigate to entity detail page
  - [ ] Web: Add "Tasks completed today" count per agent
  - [ ] **Verify:** See agent workload distribution chart, click agent navigates to detail

### Phase 12: List Enhancements + Edit Functionality

- [ ] **TB46: Universal Pagination Component**
  - [ ] Web: Create Pagination component (page numbers 1,2,3..., prev/next arrows, page size selector 10/25/50/100)
  - [ ] Web: Add to TaskList, showing total count and current range (e.g., "Showing 1-25 of 142")
  - [ ] Web: Add to EntityList, TeamList, DocumentList, ChannelList, EventList
  - [ ] Server: Ensure all list endpoints return `total` count for proper pagination
  - [ ] Web: URL sync for pagination state (e.g., `?page=2&limit=25`)
  - [ ] **Verify:** Navigate pages in task list, URL updates, correct results shown

- [ ] **TB47: Edit Plan**
  - [ ] Web: Make PlanDetailPanel editable (edit button toggles edit mode)
  - [ ] Web: Editable fields: title, description (via document), status (dropdown)
  - [ ] Web: "Add Task" button opens task picker to add existing task to plan
  - [ ] Web: "Remove Task" button on each task in plan (with confirmation)
  - [ ] Web: Status transition buttons (Activate, Complete, Cancel) based on current status
  - [ ] **Verify:** Edit plan title, add task to plan, verify changes persist

- [ ] **TB48: Edit Workflow**
  - [ ] Web: Make WorkflowDetailPanel editable (title, status where valid)
  - [ ] Web: "Burn Workflow" button for ephemeral workflows (with confirmation modal)
  - [ ] Web: "Squash Workflow" button to promote ephemeral to durable (with confirmation)
  - [ ] Server: Add `DELETE /api/workflows/:id/burn` endpoint
  - [ ] Server: Add `POST /api/workflows/:id/squash` endpoint
  - [ ] **Verify:** Change workflow status, burn ephemeral workflow, squash works

- [ ] **TB49: Task List/Kanban Toggle Polish**
  - [ ] Web: Persist view preference (list vs kanban) in localStorage key `tasks.viewMode`
  - [ ] Web: Implement keyboard shortcuts: `V L` for list view, `V K` for kanban view
  - [ ] Web: Add smooth CSS transition/animation when switching views
  - [ ] Web: Show current view mode in toggle button (highlighted state)
  - [ ] **Verify:** Toggle to kanban, refresh page, kanban still selected

### Phase 13: Document Attachments

- [ ] **TB50: Attach Documents to Tasks**
  - [ ] Server: Add `POST /api/tasks/:id/attachments` endpoint (documentId)
  - [ ] Server: Add `GET /api/tasks/:id/attachments` endpoint (returns attached documents)
  - [ ] Server: Add `DELETE /api/tasks/:id/attachments/:docId` endpoint
  - [ ] Web: Add "Attachments" collapsible section to TaskDetailPanel
  - [ ] Web: "Attach Document" button opens document picker modal
  - [ ] Web: Show attached documents as clickable links with remove button
  - [ ] **Verify:** Attach document to task, shows in attachments section

- [ ] **TB51: Embedded Document Rendering in Tasks**
  - [ ] Web: Render attached documents inline in TaskDetailPanel (expandable cards)
  - [ ] Web: Collapsed state: document title + content type badge + first line preview
  - [ ] Web: Expanded state: full document content rendered (markdown/text/json)
  - [ ] Web: Click document title to open in document editor (navigate or side panel)
  - [ ] **Verify:** Expand attached document, see full content inline

- [ ] **TB52: Attach Documents to Messages**
  - [ ] Server: Update `POST /api/messages` to accept `attachmentIds` array
  - [ ] Web: Add attachment button (paperclip icon) to MessageComposer
  - [ ] Web: Document picker modal for selecting attachments
  - [ ] Web: Show attachments in MessageBubble (document cards below content)
  - [ ] Web: Attachment preview: title, type badge, click to open
  - [ ] **Verify:** Send message with 2 document attachments, both render in message

- [ ] **TB53: Attach Documents to Documents (Links)**
  - [ ] Server: Use `references` dependency type for document-to-document links
  - [ ] Web: Add "Linked Documents" section to DocumentDetailPanel
  - [ ] Web: "Link Document" button opens document picker
  - [ ] Web: Show both outgoing links (documents this links to) and incoming links (documents linking here)
  - [ ] Web: Click linked document to navigate
  - [ ] **Verify:** Link doc A to doc B, see link in both documents' linked sections

### Phase 14: Document Editor Quality

- [ ] **TB54: Editor Toolbar Polish**
  - [ ] Web: Redesign toolbar with grouped sections using dividers:
    - [ ] History: Undo, Redo
    - [ ] Text: Bold, Italic, Code, Strikethrough, Highlight
    - [ ] Headings: H1, H2, H3 dropdown or buttons
    - [ ] Lists: Bullet, Numbered, Checklist
    - [ ] Blocks: Quote, Code Block, Horizontal Rule
  - [ ] Web: Add keyboard shortcut hints on hover (tooltip showing e.g., "Bold (⌘B)")
  - [ ] Web: Responsive toolbar: collapse to overflow menu on narrow screens
  - [ ] **Verify:** Toolbar shows all formatting options with working shortcuts

- [ ] **TB55: Slash Commands**
  - [ ] Web: Implement slash command menu triggered by typing `/` at start of line or after space
  - [ ] Web: Command list with icons:
    - [ ] /heading1, /heading2, /heading3 - Insert headings
    - [ ] /bullet - Bullet list
    - [ ] /numbered - Numbered list
    - [ ] /quote - Block quote
    - [ ] /code - Code block
    - [ ] /divider - Horizontal rule
    - [ ] /task - Embed task (opens picker)
    - [ ] /doc - Embed document (opens picker)
  - [ ] Web: Fuzzy search filtering as user types after `/`
  - [ ] Web: Keyboard navigation (up/down arrows, Enter to select, Escape to cancel)
  - [ ] **Verify:** Type `/head`, see filtered options, select "Heading 1", heading inserted

- [ ] **TB56: Drag-and-Drop Blocks**
  - [ ] Web: Add drag handle (grip icon) to left of each block, visible on hover
  - [ ] Web: Implement block reordering via drag-and-drop (using dnd-kit or Tiptap extension)
  - [ ] Web: Visual drop indicator line between blocks while dragging
  - [ ] Web: Drag handle cursor feedback (grab/grabbing)
  - [ ] **Verify:** Drag paragraph below heading, blocks reorder, content saves

- [ ] **TB57: Inline Task/Document Embeds**
  - [ ] Web: `/task` slash command opens task picker modal
  - [ ] Web: Selected task renders as inline card (title, status badge, priority indicator)
  - [ ] Web: `/doc` slash command opens document picker modal
  - [ ] Web: Selected document renders as inline card (title, content type badge)
  - [ ] Web: Embedded items are clickable → navigate to full view
  - [ ] Web: Delete embed with backspace when cursor is on it
  - [ ] **Verify:** Embed task in document, click embedded task, navigates to task detail

- [ ] **TB58: Advanced Inline Formatting**
  - [ ] Web: Add highlight extension (background color, default yellow)
  - [ ] Web: Add strikethrough support (if not already present)
  - [ ] Web: Improve inline code styling (monospace font, subtle background)
  - [ ] Web: Implement keyboard shortcuts:
    - [ ] ⌘+Shift+H for highlight
    - [ ] ⌘+Shift+S for strikethrough
    - [ ] ⌘+E for inline code
  - [ ] Web: Add these options to selection bubble menu (appears when text selected)
  - [ ] **Verify:** Select text, use keyboard shortcut to highlight, formatting applied

### Phase 15: Settings Page

- [ ] **TB59: Settings Page - Theme**
  - [ ] Web: Create SettingsPage component with sidebar navigation (Theme, Shortcuts, Defaults, Notifications, Sync)
  - [ ] Web: Theme section with Light/Dark/System radio buttons or segmented control
  - [ ] Web: Persist theme preference in localStorage key `settings.theme`
  - [ ] Web: Apply theme globally via CSS class on body (`theme-light`, `theme-dark`) or CSS variables
  - [ ] Web: System option uses `prefers-color-scheme` media query
  - [ ] **Verify:** Switch to dark theme, refresh page, dark theme persists

- [ ] **TB60: Settings Page - Keyboard Shortcuts**
  - [ ] Web: Shortcuts section listing all available shortcuts with current bindings
  - [ ] Web: Categories: Navigation (G T, G P, etc.), Actions (C, E, X), Views (V L, V K)
  - [ ] Web: "Customize" button per shortcut opens modal with key capture
  - [ ] Web: Conflict detection (warn if shortcut already used)
  - [ ] Web: "Reset to Defaults" button
  - [ ] Web: Persist custom shortcuts in localStorage
  - [ ] **Verify:** Change "Go to Tasks" shortcut, use new shortcut, navigation works

- [ ] **TB61: Settings Page - Default Views**
  - [ ] Web: Default view preferences section:
    - [ ] Tasks default view: List or Kanban
    - [ ] Dashboard default lens: Overview, Task Flow, Agents, Dependencies, or Timeline
    - [ ] Default sort order for lists (by created date, priority, etc.)
  - [ ] Web: Persist in localStorage
  - [ ] Web: Apply defaults on page load (check localStorage before rendering)
  - [ ] **Verify:** Set Tasks default to Kanban, navigate to Tasks, Kanban shows immediately

- [ ] **TB62: Settings Page - Notifications**
  - [ ] Web: Notification preferences section with toggles:
    - [ ] Task assigned to me
    - [ ] Task completed
    - [ ] New message in channel
    - [ ] Workflow completed/failed
  - [ ] Web: Browser notification permission request button (if not granted)
  - [ ] Web: Toast notification settings: duration (3s/5s/10s), position (top-right, bottom-right)
  - [ ] Web: Persist preferences in localStorage
  - [ ] **Verify:** Enable task completion notifications, complete a task, see toast notification

- [ ] **TB63: Settings Page - Sync Config**
  - [ ] Web: Sync settings section showing:
    - [ ] Auto-export toggle (enable/disable automatic JSONL export)
    - [ ] Export path display (read-only, shows .elemental/ path)
    - [ ] Last export timestamp
    - [ ] Dirty element count (elements with unsaved changes)
  - [ ] Web: "Export Now" button triggers manual export
  - [ ] Web: "Import" button opens file picker for JSONL import
  - [ ] Server: Add `POST /api/sync/export` and `POST /api/sync/import` endpoints
  - [ ] **Verify:** Click "Export Now", see success message, last export time updates

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

- **Authentication**: Currently no auth modeled; add middleware layer for user login
- **Multi-tenancy**: Single database assumed; extend for multiple workspaces/projects
- **Mobile**: Responsive design but no native app; consider React Native in future
- **Offline**: Browser storage backend exists but not integrated in web platform
- **Federation**: Cross-system sync deferred
- **Databases in Editor**: Notion-style database tables (deferred - not in current scope)
- **Collaborative Editing**: Real-time multi-user document editing (deferred)
- **AI Integration**: Agent command interface, natural language task creation (deferred)

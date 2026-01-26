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

Completed implementation phases have been moved to specs/platform/COMPLETED_PHASES.md.

### Phase 31: Task Description Rich Editor

**Goal:** Add optional rich markdown description to Tasks, using the same editor experience as Documents for consistency.

- [] **TB124: Task Description Field with Rich Editor**
  - [x] Server: Task type already has `descriptionRef` pointing to Document - ensure API supports creating/updating description document inline
  - [x] Server: Add `PATCH /api/tasks/:id` support for `description` field that creates/updates linked Document
  - [x] Server: When task created with `description` string, auto-create Document with content and link via `descriptionRef`
  - [x] Server: Add `GET /api/tasks/:id?hydrate.description=true` returns task with description content inline
  - [x] Web: Add collapsible "Description" section to TaskDetailPanel below title
  - [x] Web: View mode: render description as markdown (same as DocumentRenderer)
  - [x] Web: Edit mode: show same BlockEditor used for Documents
  - [x] Web: "Add description" button when description is empty
  - [x] Web: Description auto-saves on blur with debounce (like document editing) - Manual save with Save button
  - [x] Web: Show character count and "Saved" indicator - Save/Cancel buttons with loading state
  - [x] Web: CreateTaskModal: add optional "Description" textarea with markdown preview toggle
  - [ ] Web: TaskSlideOver: show description preview (first 3 lines) with "Show more" expansion
  - [x] **Verify:** Create task with description, edit with rich editor, formatting persists; Playwright tests passing in `apps/web/tests/tb124-task-description-editor.spec.ts`

### Phase 32: Document Embed Search Fix

**Goal:** Fix the embed search functionality so task/document pickers actually find items.

- [x] **TB125: Fix Task Embed Search in Editor**
  - [x] Web: Debug TaskPickerModal search - verify it queries `/api/tasks` with search param
  - [x] Server: Ensure `GET /api/tasks?search=query` works correctly (fuzzy match on title) - Added search param support using api.search()
  - [x] Web: If using in-memory data (from DataPreloader), ensure search filters loaded tasks - TaskPickerModal uses server search
  - [x] Web: Add loading state while searching - Already implemented with Loader2 spinner
  - [x] Web: Show "No tasks found" empty state with suggestion to check spelling - Already implemented
  - [x] Web: Ensure keyboard navigation works (arrow keys, Enter to select) - Already implemented
  - [x] Web: Fix any race conditions between typing and results - TanStack Query handles this
  - [x] **Verify:** 6 Playwright tests passing (`apps/web/tests/tb125-task-embed-search.spec.ts`)

- [x] **TB126: Fix Document Embed Search in Editor**
  - [x] Web: Debug DocumentPickerModal search - verify it queries `/api/documents` with search param
  - [x] Server: Ensure `GET /api/documents?search=query` works correctly (fuzzy match on title + content) - Uses api.search() for comprehensive search
  - [x] Web: If using in-memory data, ensure search filters loaded documents - DocumentPickerModal uses server search with correct response parsing
  - [x] Web: Show document content type badge in results - Already implemented
  - [x] Web: Show "No documents found" empty state - Already implemented
  - [x] Web: Ensure picker excludes current document (can't embed self) - Already implemented via excludeIds prop
  - [x] **Verify:** 7 Playwright tests passing (`apps/web/tests/tb126-document-embed-search.spec.ts`)

### Phase 33: Message Channel Enhancements

**Goal:** Add slash commands and element embedding to message composer for power-user workflows.

- [ ] **TB127: Slash Commands in Message Composer**
  - [ ] Web: Add slash command support to MessageComposer (similar to document editor)
  - [ ] Web: Implement SlashCommandMenu component for messages
  - [ ] Web: Commands:
    - [ ] `/task` - Insert task reference (opens picker)
    - [ ] `/doc` - Insert document reference (opens picker)
    - [ ] `/code` - Insert code block
    - [ ] `/quote` - Insert block quote
    - [ ] `/bold`, `/italic` - Apply formatting
    - [ ] `/emoji` - Open emoji picker
  - [ ] Web: Fuzzy search filtering as user types after `/`
  - [ ] Web: Keyboard navigation (up/down, Enter, Escape)
  - [ ] Web: Trigger on `/` at start of line or after space
  - [ ] Web: Command list positioned above composer (like Slack)
  - [ ] **Verify:** Type `/task` in message composer, picker opens; select task, reference inserted; Playwright tests passing

- [ ] **TB128: Element Embedding in Messages with #{id}**
  - [ ] Web: Detect `#{element_id}` pattern in message content
  - [ ] Web: Parse and validate element ID format (e.g., `#el-abc123`, `#task:el-abc123`, `#doc:el-abc123`)
  - [ ] Web: Inline autocomplete: typing `#` shows recent tasks/docs, typing more filters
  - [ ] Web: On send, `#{id}` renders as embedded card in message (similar to Slack unfurls)
  - [ ] Web: Task embed shows: title, status badge, priority, assignee
  - [ ] Web: Document embed shows: title, content type, first line preview
  - [ ] Web: Embeds are clickable → navigate to element
  - [ ] Server: Parse `#{id}` references when creating message, store as `references` dependencies
  - [ ] Server: Hydrate referenced elements when fetching messages
  - [ ] **Verify:** Type `#el-abc123` in message, autocomplete suggests matching elements; send, embed renders; Playwright tests passing

### Phase 34: Virtualization & Infinite Scroll

**Goal:** Replace pagination and "Load more" buttons with smooth infinite scroll using virtualization for all list views.

- [ ] **TB129: Virtualize Libraries List with Infinite Scroll**
  - [ ] Web: Replace current libraries list in sidebar with VirtualizedList component
  - [ ] Web: Remove "Load more" button, implement infinite scroll trigger at bottom
  - [ ] Web: Load libraries in batches as user scrolls (if server paginated) or render from in-memory
  - [ ] Web: Smooth scroll experience with no jank
  - [ ] Web: Preserve expand/collapse state of library tree nodes during scroll
  - [ ] Web: Scroll position restoration when navigating back
  - [ ] **Verify:** Create 100+ libraries, scroll through list smoothly; Playwright tests confirm render count matches visible items

- [ ] **TB130: Virtualize Documents List with Infinite Scroll**
  - [ ] Web: Replace documents grid/list with VirtualizedList (or VirtualizedGrid for grid view)
  - [ ] Web: Remove any "Load more" buttons
  - [ ] Web: Infinite scroll loads more documents as needed
  - [ ] Web: Works in both list and grid view modes
  - [ ] Web: Selection state preserved during scroll
  - [ ] Web: Search/filter works with virtualized list
  - [ ] **Verify:** Create 500+ documents, scroll through smoothly; filter works instantly; Playwright tests passing

- [ ] **TB131: Virtualize Channel Messages with Infinite Scroll**
  - [ ] Web: Replace current MessageList with virtualized version
  - [ ] Web: New messages load at bottom (reverse infinite scroll pattern)
  - [ ] Web: Older messages load when scrolling up
  - [ ] Web: Scroll to bottom on new message arrival
  - [ ] Web: "Jump to latest" button when scrolled up
  - [ ] Web: Day separators work correctly with virtualization
  - [ ] Web: Thread view also virtualized
  - [ ] **Verify:** Channel with 1000+ messages scrolls smoothly; new message appears, auto-scrolls; Playwright tests passing

- [ ] **TB132: Kanban Column Virtualization with Infinite Scroll**
  - [ ] Web: Load ALL tasks upfront (from in-memory cache via DataPreloader)
  - [ ] Web: Each Kanban column uses VirtualizedList independently
  - [ ] Web: Infinite scroll within each column (no page size limit visible to user)
  - [ ] Web: Column header shows total count (not "showing X of Y")
  - [ ] Web: Drag-and-drop works across virtualized columns
  - [ ] Web: Filter/search works with full dataset (instant, client-side)
  - [ ] Web: Column scroll positions preserved when switching views
  - [ ] **Verify:** 500 tasks across columns, each column scrolls independently and smoothly; Playwright tests passing

### Phase 35: Graph & Navigation Cleanup

**Goal:** Remove unused features and simplify navigation based on user feedback.

- [ ] **TB133: Remove Edit Mode from Dependency Graph**
  - [ ] Web: Remove "Edit Mode" toggle button from graph toolbar
  - [ ] Web: Remove edge creation click-to-select flow
  - [ ] Web: Remove right-click edge deletion context menu
  - [ ] Web: Remove all edit mode state management
  - [ ] Web: Keep graph as read-only visualization
  - [ ] Web: Keep all view features: zoom, pan, search, filter, minimap
  - [ ] Web: Update any documentation or tooltips referencing edit mode
  - [ ] Server: Keep dependency endpoints (dependencies can still be managed via Task detail panel)
  - [ ] **Verify:** Graph loads as read-only; no edit mode toggle visible; Playwright tests updated

- [ ] **TB134: Delete Agents Page**
  - [ ] Web: Remove `/dashboard/agents` route from router config
  - [ ] Web: Remove "Agents" navigation item from sidebar
  - [ ] Web: Delete `AgentActivityLens` component and related files
  - [ ] Web: Remove `useAgentActivity` hook if dedicated
  - [ ] Web: Update command palette to remove "Go to Agents" action
  - [ ] Web: Update keyboard shortcuts to remove `G A` binding
  - [ ] Web: Remove any "Agents" references from dashboard overview
  - [ ] Web: Keep entity listing at `/entities` (Agents are just entities with type "agent")
  - [ ] Web: Agent workload info moved to entity detail page
  - [ ] **Verify:** Agents link gone from sidebar; URL `/dashboard/agents` returns 404 or redirects; Playwright tests updated

### Phase 36: Accessibility & Contrast Fixes

**Goal:** Fix all text contrast issues where light text appears on light backgrounds or dark text on dark backgrounds.

- [ ] **TB135: Audit and Fix Text Contrast Issues**
  - [ ] Web: Run automated contrast checker across all pages (axe-core or similar)
  - [ ] Web: Identify all failing contrast ratios (WCAG AA requires 4.5:1 for text)
  - [ ] Web: Fix light mode issues:
    - [ ] Muted/secondary text should use `text-gray-600` minimum (not `text-gray-400`)
    - [ ] Disabled states should still be readable (use `text-gray-500`)
    - [ ] Placeholder text needs sufficient contrast
  - [ ] Web: Fix dark mode issues:
    - [ ] Text on dark backgrounds should use `text-gray-200` minimum (not `text-gray-500`)
    - [ ] Status badges need readable text in both modes
    - [ ] Chart labels and legends need adequate contrast
  - [ ] Web: Update design tokens in `tokens.css` with accessible color values
  - [ ] Web: Add `--text-primary`, `--text-secondary`, `--text-muted` semantic tokens
  - [ ] Web: Replace hardcoded color classes with semantic tokens throughout
  - [ ] Web: Test with Chrome DevTools "Emulate vision deficiencies"
  - [ ] **Verify:** axe-core audit passes; all text readable in both light and dark modes; Claude in Chrome visual inspection

- [ ] **TB136: High Contrast Mode Support**
  - [ ] Web: Add "High Contrast" theme option in Settings (alongside Light/Dark/System)
  - [ ] Web: High contrast mode: pure white on black, increased border weights
  - [ ] Web: Ensure all interactive elements visible in high contrast
  - [ ] Web: Test with Windows High Contrast Mode
  - [ ] **Verify:** Toggle high contrast mode, all UI elements clearly visible; Playwright tests passing

### Phase 37: Human Inbox Page

**Goal:** Create a dedicated full-page inbox for the human operator, separate from entity-specific inboxes.

- [ ] **TB137: Human Inbox Page**
  - [ ] Web: Add new route `/inbox` to router
  - [ ] Web: Add "Inbox" navigation item to sidebar (top-level, with badge for unread count)
  - [ ] Server: Determine "current user" entity (human operator) - may need config or auth context
  - [ ] Server: Add `GET /api/inbox` endpoint (global inbox, uses current user context)
  - [ ] Server: Add `GET /api/inbox/count` endpoint for unread count
  - [ ] Web: Create InboxPage component with full-page layout (not embedded in entity detail)
  - [ ] Web: Reuse inbox components: InboxViewTabs, InboxItemCard, InboxSourceFilter, etc.
  - [ ] Web: Split layout: message list (left), message content (right)
  - [ ] Web: Show all direct messages and @mentions for current user
  - [ ] Web: Keyboard shortcuts: `G I` to go to inbox, `J/K` to navigate messages
  - [ ] Web: Add command palette action "Go to Inbox"
  - [ ] Web: Unread badge in sidebar updates in real-time via WebSocket
  - [ ] **Verify:** Navigate to /inbox, see all messages; mark as read, badge updates; Playwright tests passing

- [ ] **TB138: Inbox Notification Dot**
  - [ ] Web: Add small notification dot to Inbox sidebar item when unread count > 0
  - [ ] Web: Dot pulses/animates briefly on new message arrival
  - [ ] Web: Dot disappears when all messages read
  - [ ] Web: Dot is visible even when sidebar collapsed (icon-only mode)
  - [ ] Web: Optional: browser tab title shows unread count "(3) Elemental"
  - [ ] **Verify:** Receive new message, dot appears; read all messages, dot gone; Claude in Chrome visual inspection

- [ ] **TB139: Inbox Empty State & Onboarding**
  - [ ] Web: Create helpful empty state for new users with no inbox messages
  - [ ] Web: Empty state shows: icon, "Your inbox is empty", helpful tips
  - [ ] Web: Tips: "Messages sent to you appear here", "You'll also see @mentions"
  - [ ] Web: Link to Messages page to start conversations
  - [ ] Web: Empty state for filtered views: "No unread messages" with link to view all
  - [ ] **Verify:** New user sees helpful empty state; Playwright tests passing

### Phase 38: UI/UX Polish & Navigation Improvements

**Goal:** Address critical UX issues that impact daily usability—rendering attachments properly, making sidebar accessible without keyboard shortcuts, reorganizing navigation, and fixing timeline event loading.

**Methodology:** Each tracer bullet is a thin, full-stack slice following the "tracer bullet" approach from The Pragmatic Programmer. Complete one bullet fully (including verification) before starting the next. Every change should result in working software that can be tested immediately in the browser or via Playwright.

- [x] **TB140: Render Task Attachments as Markdown**

  **Context:** Task attachments (documents) currently render as preformatted plain text in the TaskDetailPanel. Markdown documents should render with proper formatting (headings, lists, code blocks, links) using the existing MarkdownRenderer component.

  **Tracer Bullet Steps:**
  - [x] Step 1: Locate and read `renderDocumentContent()` in `TaskDetailPanel.tsx` (lines 1025-1053)
    - **Verify immediately:** Understand current rendering logic for markdown content type
  - [x] Step 2: Import `MarkdownRenderer` component at top of `TaskDetailPanel.tsx`
    - **Verify immediately:** No TypeScript errors, component available
  - [x] Step 3: Modify `renderDocumentContent()` to use `MarkdownRenderer` for markdown content type
    - Change from `<pre className="...">{content}</pre>` to `<MarkdownRenderer content={content} />`
    - Keep JSON rendering as-is (formatted JSON in pre tag)
    - Keep plain text rendering as-is
    - **Verify immediately:** Open task with markdown attachment, confirm headings/lists/code render properly
  - [x] Step 4: Add prose styling wrapper for consistent typography
    - Use existing `prose` class from Tailwind typography
    - **Verify immediately:** Text spacing and sizing matches document viewer
  - [x] Step 5: Test edge cases
    - Empty markdown document
    - Very long markdown document (scrolling works)
    - Markdown with code blocks, tables, images
    - **Verify immediately:** All edge cases render correctly
  - [x] Step 6: Write Playwright test for markdown attachment rendering
    - Create task, attach markdown document, verify formatted content visible
    - **Verify:** 10 tests pass in `apps/web/tests/tb140-attachment-markdown.spec.ts`

- [ ] **TB141: Sidebar Expand Button When Collapsed**

  **Context:** The sidebar can be collapsed with `Cmd+B`, but users without keyboard access (or those who don't know the shortcut) have no way to expand it. Add a visible button/affordance to expand the sidebar when it's in collapsed state.

  **Tracer Bullet Steps:**
  - [ ] Step 1: Read current sidebar collapse implementation in `Sidebar.tsx` and `AppShell.tsx`
    - Understand how `collapsed` prop flows and `onToggle` is called
    - **Verify immediately:** Know where to add the expand button
  - [ ] Step 2: Add expand button to collapsed sidebar state
    - Position at bottom of collapsed sidebar (above Settings icon)
    - Use `PanelLeftOpen` or `ChevronRight` icon from lucide-react
    - Only visible when `collapsed={true}`
    - **Verify immediately:** Collapse sidebar with Cmd+B, see expand button appear
  - [ ] Step 3: Wire button to call `onToggle`
    - On click, expand sidebar
    - **Verify immediately:** Click button, sidebar expands
  - [ ] Step 4: Add tooltip to button
    - Tooltip: "Expand sidebar (⌘B)"
    - Uses existing tooltip component
    - **Verify immediately:** Hover button, see tooltip
  - [ ] Step 5: Style button for visual consistency
    - Match other sidebar icon styling (muted color, hover state)
    - Ensure button is keyboard accessible (tabIndex, focus ring)
    - **Verify immediately:** Button looks native to sidebar design
  - [ ] Step 6: Add accessibility attributes
    - `aria-label="Expand sidebar"`
    - `aria-expanded="false"` when collapsed
    - **Verify immediately:** Screen reader announces button purpose
  - [ ] Step 7: Write Playwright test
    - Collapse sidebar, verify expand button visible
    - Click expand button, verify sidebar expands
    - **Verify:** Test passes in `apps/web/tests/tb141-sidebar-expand-button.spec.ts`

- [ ] **TB142: Move Dependencies to Work Section in Sidebar**

  **Context:** The Dependencies navigation item is currently in the Dashboard section. For better information architecture, it should be in the Work section (alongside Tasks, Plans, Workflows) since dependencies are integral to work management.

  **Tracer Bullet Steps:**
  - [ ] Step 1: Read `NAV_SECTIONS` array in `Sidebar.tsx` (lines 40-82)
    - Identify Dependencies item in Dashboard section (line 50)
    - Identify Work section structure (lines 53-58)
    - **Verify immediately:** Understand current nav structure
  - [ ] Step 2: Move Dependencies nav item from Dashboard to Work section
    - Remove from Dashboard items array
    - Add to Work items array (after Workflows)
    - **Verify immediately:** Refresh browser, see Dependencies under Work section
  - [ ] Step 3: Update route if needed
    - Check if `/dashboard/dependencies` route should change to `/dependencies`
    - If changing route, update router.tsx accordingly
    - **Verify immediately:** Click Dependencies in sidebar, navigate to correct page
  - [ ] Step 4: Update keyboard shortcut hint if needed
    - Currently `G G` - consider if this still makes sense
    - Could change to `G D` for "Go to Dependencies" (check conflicts)
    - **Verify immediately:** Keyboard shortcut works from anywhere
  - [ ] Step 5: Update command palette entry
    - Search "dependencies" in command palette should still work
    - **Verify immediately:** Cmd+K, type "dep", action appears
  - [ ] Step 6: Update Dashboard section if needed
    - Remove any orphaned references
    - Check Dashboard overview page doesn't break
    - **Verify immediately:** Dashboard overview page loads correctly
  - [ ] Step 7: Write Playwright test
    - Verify Dependencies appears in Work section
    - Verify navigation works
    - Verify keyboard shortcut works
    - **Verify:** Test passes in `apps/web/tests/tb142-dependencies-nav-location.spec.ts`

- [ ] **TB143: Timeline Eager Event Loading with UI Pagination**

  **Context:** The timeline page uses lazy loading—users must click "Next page" repeatedly to see all events, with no way to know the total count upfront. Change to eager loading (fetch all events on mount) while keeping page-based UI pagination for performance.

  **Tracer Bullet Steps:**
  - [ ] Step 1: Analyze current event loading in `timeline.tsx`
    - Find `useEvents()` hook usage (lines 210-244)
    - Understand current pagination params (limit, offset)
    - Note: Server already returns `total` in response
    - **Verify immediately:** Understand current data flow
  - [ ] Step 2: Create new hook `useAllEvents()` or modify `useEvents()` with `fetchAll` option
    - Fetches events with large limit (e.g., 10000) or multiple batched requests
    - Returns all events at once plus total count
    - **Verify immediately:** Hook compiles, can log full event count
  - [ ] Step 3: Update timeline page to use eager loading
    - Fetch all events on mount (may need loading state for large datasets)
    - Store full event array in state
    - Display total count immediately: "X total events"
    - **Verify immediately:** Timeline shows "Loading events..." then total count
  - [ ] Step 4: Implement client-side pagination
    - Slice events array based on current page and page size
    - Update URL params (page, limit) on navigation
    - **Verify immediately:** Page 1 shows first N events, page 2 shows next N
  - [ ] Step 5: Update pagination controls to show accurate totals
    - "Showing 1-100 of 5,432 events"
    - "Page 1 of 55"
    - **Verify immediately:** Pagination shows correct numbers
  - [ ] Step 6: Add loading state for initial fetch
    - Show skeleton or spinner while fetching all events
    - Show helpful message if many events: "Loading 5,000+ events..."
    - **Verify immediately:** Loading state appears, then results
  - [ ] Step 7: Optimize for large datasets
    - If >10,000 events, consider chunked loading with progress
    - Cache events in TanStack Query with long stale time
    - **Verify immediately:** Performance acceptable with 1000+ events
  - [ ] Step 8: Ensure filters still work
    - Client-side filtering on full dataset (fast, instant feedback)
    - Server-side filtering as optimization (optional)
    - **Verify immediately:** Type in search, results filter instantly
  - [ ] Step 9: Test horizontal timeline view
    - All events available for pan/zoom/brush selection
    - No "Load more" needed when zooming out
    - **Verify immediately:** Horizontal view shows all events
  - [ ] Step 10: Write Playwright test
    - Load timeline, verify total count shown immediately
    - Navigate pages, verify correct events shown
    - Search/filter, verify instant results
    - **Verify:** Test passes in `apps/web/tests/tb143-timeline-eager-loading.spec.ts`

### Phase 39: Comprehensive Responsive Design

**Goal:** Make every page and component in the application fully responsive across all screen sizes—from mobile phones (320px) to large desktop monitors (1920px+). Users should have a seamless, native-feeling experience regardless of device.

**Methodology:** This phase is larger than typical phases. Each tracer bullet focuses on a specific area (layout, page, or component group). Complete each bullet with full verification before moving to the next. Use Chrome DevTools device emulation and real device testing for verification. Every change must be tested at minimum 3 breakpoints: mobile (375px), tablet (768px), and desktop (1280px).

**Breakpoint Strategy:**

- **xs**: < 480px (small phones)
- **sm**: 480px - 639px (large phones)
- **md**: 640px - 767px (small tablets)
- **lg**: 768px - 1023px (tablets)
- **xl**: 1024px - 1279px (small laptops)
- **2xl**: ≥ 1280px (desktops)

**Touch Target Requirements:**

- Minimum touch target: 44×44px on mobile
- Adequate spacing between interactive elements
- No hover-only interactions (must have touch alternative)

---

- [ ] **TB144: Responsive Foundation & CSS Infrastructure**

  **Context:** Before making individual components responsive, establish the CSS infrastructure—breakpoint utilities, responsive spacing scale, and testing helpers. This creates a consistent foundation for all subsequent work.

  **Tracer Bullet Steps:**
  - [ ] Step 1: Audit current Tailwind config for responsive breakpoints
    - Check `tailwind.config.ts` for breakpoint definitions
    - Verify breakpoints match our strategy (xs through 2xl)
    - Add any missing breakpoints
    - **Verify immediately:** `@media` queries work at all defined breakpoints
  - [ ] Step 2: Create responsive spacing utilities
    - Define mobile-first spacing scale in `tokens.css`
    - Add `--spacing-mobile`, `--spacing-tablet`, `--spacing-desktop` CSS variables
    - Create utility classes: `.p-responsive`, `.gap-responsive`
    - **Verify immediately:** Spacing changes at breakpoints in DevTools
  - [ ] Step 3: Create responsive typography scale
    - Smaller base font on mobile (14px), larger on desktop (16px)
    - Heading sizes scale appropriately
    - Line heights adjust for readability
    - **Verify immediately:** Text is readable and well-proportioned at all sizes
  - [ ] Step 4: Add viewport meta tag verification
    - Ensure `<meta name="viewport" content="width=device-width, initial-scale=1">` is present
    - Disable user-scalable=no (accessibility requirement)
    - **Verify immediately:** Page scales correctly on mobile devices
  - [ ] Step 5: Create responsive testing utilities
    - Add `useBreakpoint()` hook to detect current breakpoint
    - Add `useIsMobile()`, `useIsTablet()`, `useIsDesktop()` convenience hooks
    - **Verify immediately:** Hooks return correct values at each breakpoint
  - [ ] Step 6: Create Playwright responsive testing helpers
    - Helper to test at multiple viewport sizes
    - Screenshot comparison utilities
    - Touch event simulation helpers
    - **Verify immediately:** Helper functions work in test file
  - [ ] Step 7: Document responsive patterns
    - Create `RESPONSIVE.md` guide with patterns and examples
    - Document breakpoint usage, spacing, and touch targets
    - **Verify:** Documentation is clear and complete

---

- [ ] **TB145: Responsive AppShell & Sidebar**

  **Context:** The AppShell is the root layout component. The sidebar must transform from always-visible (desktop) to overlay drawer (mobile). This is the most critical responsive component as it affects navigation throughout the app.

  **Tracer Bullet Steps:**
  - [ ] Step 1: Analyze current AppShell and Sidebar structure
    - Read `AppShell.tsx` and `Sidebar.tsx`
    - Identify fixed widths, absolute positioning, flexbox usage
    - **Verify immediately:** Understand current layout constraints
  - [ ] Step 2: Implement mobile sidebar as slide-out drawer
    - On mobile (< 768px): sidebar hidden by default
    - Add hamburger menu button in header (visible only on mobile)
    - Sidebar slides in from left as overlay with backdrop
    - **Verify immediately:** Resize to mobile, tap hamburger, sidebar slides in
  - [ ] Step 3: Add backdrop and close behavior
    - Dark semi-transparent backdrop behind sidebar on mobile
    - Tap backdrop to close sidebar
    - Swipe left to close sidebar
    - **Verify immediately:** Tap outside sidebar, it closes
  - [ ] Step 4: Handle sidebar close on navigation
    - When user taps nav item on mobile, close sidebar automatically
    - Prevent scroll on body when sidebar open
    - **Verify immediately:** Tap "Tasks" on mobile, sidebar closes, navigate to Tasks
  - [ ] Step 5: Implement tablet behavior
    - On tablet (768px - 1023px): sidebar starts collapsed (icons only)
    - Can expand to full width as overlay
    - Collapse button visible
    - **Verify immediately:** Resize to tablet, see icon-only sidebar
  - [ ] Step 6: Implement desktop behavior
    - On desktop (≥ 1024px): sidebar always visible, can toggle collapsed
    - Smooth transition between collapsed and expanded
    - Content area adjusts width accordingly
    - **Verify immediately:** Resize to desktop, sidebar visible, toggle works
  - [ ] Step 7: Add responsive header
    - Mobile: hamburger + centered logo + user menu
    - Tablet: breadcrumbs truncated + search icon (expands on tap)
    - Desktop: full breadcrumbs + search bar + user menu
    - **Verify immediately:** Header adapts correctly at each breakpoint
  - [ ] Step 8: Handle keyboard shortcuts on touch devices
    - Hide keyboard shortcut hints on touch devices
    - Command palette (Cmd+K) still works on devices with keyboards
    - **Verify immediately:** No shortcut hints on mobile, still work on iPad with keyboard
  - [ ] Step 9: Test touch targets
    - All nav items at least 44px touch target
    - Adequate spacing between items
    - **Verify immediately:** Can tap nav items accurately on phone
  - [ ] Step 10: Persist sidebar state per breakpoint
    - Store desktop sidebar state in localStorage
    - Mobile always starts closed
    - **Verify immediately:** Refresh on desktop, sidebar state preserved
  - [ ] Step 11: Write comprehensive Playwright tests
    - Test at mobile, tablet, desktop viewports
    - Test hamburger menu, drawer open/close, navigation
    - Test keyboard shortcuts presence/absence
    - **Verify:** Tests pass in `apps/web/tests/tb145-responsive-appshell.spec.ts`

---

- [ ] **TB146: Responsive Dashboard Page**

  **Context:** The Dashboard has multiple "lenses" (Overview, Task Flow, Agents, Dependencies, Timeline) with complex layouts including charts, grids, and graphs. Each lens needs a mobile-appropriate layout.

  **Tracer Bullet Steps:**
  - [ ] Step 1: Audit Dashboard Overview layout
    - Identify grid layout for stat cards and charts
    - Note chart components (Recharts) and their current sizing
    - **Verify immediately:** Know what needs to change
  - [ ] Step 2: Make stat cards responsive
    - Desktop: 4 columns
    - Tablet: 2 columns
    - Mobile: 1 column (stacked)
    - **Verify immediately:** Cards stack correctly at each breakpoint
  - [ ] Step 3: Make dashboard charts responsive
    - Charts resize to container width
    - Reduce chart height on mobile (300px → 200px)
    - Simplify legends on mobile (hide or move below chart)
    - **Verify immediately:** Charts render correctly, no overflow
  - [ ] Step 4: Responsive Task Flow lens
    - Desktop: 3-column layout (Ready, Blocked, Completed)
    - Tablet: 2 columns with scroll
    - Mobile: single column with tabs or accordion
    - **Verify immediately:** Task flow is usable on mobile
  - [ ] Step 5: Responsive Agent Activity lens
    - Desktop: grid of agent cards
    - Mobile: stack vertically, smaller cards
    - Workload chart adapts to width
    - **Verify immediately:** Agent cards readable on mobile
  - [ ] Step 6: Responsive Dependency Graph lens
    - Graph always takes full available space
    - Controls (zoom, layout) move to bottom toolbar on mobile
    - Minimap hidden on mobile (screen too small)
    - Touch gestures for pan/zoom
    - **Verify immediately:** Can pan and zoom graph with touch
  - [ ] Step 7: Responsive Timeline lens
    - List view: cards stack vertically, no horizontal overflow
    - Horizontal timeline: works with touch pan/zoom
    - Brush selection works with touch (drag handle visible)
    - **Verify immediately:** Timeline is fully usable on mobile
  - [ ] Step 8: Lens tab navigation on mobile
    - Desktop: horizontal tabs
    - Mobile: dropdown selector or horizontal scroll tabs
    - Preserve selected lens in URL
    - **Verify immediately:** Can switch lenses easily on mobile
  - [ ] Step 9: Write Playwright tests for each lens
    - Test each lens at each breakpoint
    - Test chart rendering, touch interactions
    - **Verify:** Tests pass in `apps/web/tests/tb146-responsive-dashboard.spec.ts`

---

- [ ] **TB147: Responsive Tasks Page (List, Kanban, Detail)**

  **Context:** The Tasks page is the most heavily used page. It has list view, kanban view, and a detail panel. All three views need to work well on mobile with appropriate touch interactions.

  **Tracer Bullet Steps:**
  - [ ] Step 1: Audit current Tasks page layout
    - Identify split view (list + detail panel)
    - Note kanban board implementation
    - Identify filters, search, view toggles
    - **Verify immediately:** Understand current structure
  - [ ] Step 2: Responsive task list view
    - Desktop: table with columns (title, status, priority, assignee, etc.)
    - Tablet: condensed table, hide less important columns
    - Mobile: card-based list (no table), show key info only
    - **Verify immediately:** List is readable and tappable on mobile
  - [ ] Step 3: Responsive TaskCard component
    - Ensure TaskCard works at all widths
    - Touch-friendly: status toggle, priority selector
    - Swipe actions (optional): swipe right to complete, swipe left to delete
    - **Verify immediately:** TaskCard is fully functional on mobile
  - [ ] Step 4: Responsive kanban view
    - Desktop: all columns visible side by side
    - Tablet: 2-3 columns visible, horizontal scroll for others
    - Mobile: single column view with column selector tabs/dropdown
    - **Verify immediately:** Kanban is usable on mobile (not unusably cramped)
  - [ ] Step 5: Touch-friendly drag and drop
    - Kanban drag and drop works with touch
    - Long-press to initiate drag (not conflict with scroll)
    - Visual feedback during drag
    - Drop zones clearly indicated
    - **Verify immediately:** Can drag task between columns on phone
  - [ ] Step 6: Responsive detail panel
    - Desktop: side panel (right side, ~400px)
    - Tablet: side panel (narrower, ~320px)
    - Mobile: full-screen modal/sheet (slides up from bottom)
    - **Verify immediately:** Detail panel is readable on mobile
  - [ ] Step 7: Detail panel close behavior
    - Mobile: swipe down or tap close button to dismiss
    - Hardware back button closes panel on mobile
    - URL updates when panel opens/closes
    - **Verify immediately:** Back button works, URL is correct
  - [ ] Step 8: Responsive filters and search
    - Desktop: filter bar always visible
    - Mobile: filters in collapsible section or modal
    - Search: always visible, but compact on mobile
    - Active filter count badge when filters collapsed
    - **Verify immediately:** Can filter tasks on mobile
  - [ ] Step 9: Responsive view toggle (List/Kanban)
    - Desktop: toggle buttons in toolbar
    - Mobile: dropdown or icon-only toggle
    - **Verify immediately:** Can switch views on mobile
  - [ ] Step 10: Responsive quick actions
    - Create task button: FAB (floating action button) on mobile
    - Bulk actions: long-press to select, action bar appears
    - **Verify immediately:** Can create task quickly on mobile
  - [ ] Step 11: Responsive task form/modal
    - Create/Edit task modal: full-screen on mobile
    - Form fields stack vertically
    - Date pickers are mobile-friendly
    - **Verify immediately:** Can create task with all fields on mobile
  - [ ] Step 12: Write comprehensive Playwright tests
    - Test list view, kanban view, detail panel at all breakpoints
    - Test drag and drop on mobile
    - Test filters, search, create
    - **Verify:** Tests pass in `apps/web/tests/tb147-responsive-tasks.spec.ts`

---

- [ ] **TB148: Responsive Plans & Workflows Pages**

  **Context:** Plans and Workflows pages share similar patterns—a list view and a detail view with task collections. Ensure both are fully responsive with consistent patterns.

  **Tracer Bullet Steps:**
  - [ ] Step 1: Audit Plans page layout
    - Identify list component, detail panel, progress display
    - **Verify immediately:** Understand current structure
  - [ ] Step 2: Responsive Plans list
    - Desktop: table or card grid
    - Mobile: stacked cards with progress bars
    - Touch targets for plan actions
    - **Verify immediately:** Plans list usable on mobile
  - [ ] Step 3: Responsive PlanDetailPanel
    - Desktop: side panel
    - Mobile: full-screen sheet
    - Progress ring scales appropriately
    - Task list within plan is scrollable
    - **Verify immediately:** Plan detail fully readable on mobile
  - [ ] Step 4: Responsive plan task operations
    - Add task to plan: modal is full-screen on mobile
    - Remove task: confirmation dialog works on mobile
    - **Verify immediately:** Can manage plan tasks on mobile
  - [ ] Step 5: Audit Workflows page layout
    - Similar to Plans—list and detail
    - Pour workflow modal
    - **Verify immediately:** Understand structure
  - [ ] Step 6: Responsive Workflows list
    - Same patterns as Plans list
    - Status badges clearly visible
    - **Verify immediately:** Workflows list usable on mobile
  - [ ] Step 7: Responsive WorkflowDetailPanel
    - Desktop: side panel
    - Mobile: full-screen sheet
    - Task sequence clearly shown
    - **Verify immediately:** Workflow detail readable on mobile
  - [ ] Step 8: Responsive PourWorkflowModal
    - Full-screen on mobile
    - Playbook selection dropdown works on mobile
    - Variable inputs stack vertically
    - **Verify immediately:** Can pour workflow on mobile
  - [ ] Step 9: Write Playwright tests
    - Test both pages at all breakpoints
    - Test modals and panels
    - **Verify:** Tests pass in `apps/web/tests/tb148-responsive-plans-workflows.spec.ts`

---

- [ ] **TB149: Responsive Messages Page (Slack-style)**

  **Context:** The Messages page has a Slack-style layout: channel list on left, message view on right. On mobile, this needs to become a two-screen navigation pattern.

  **Tracer Bullet Steps:**
  - [ ] Step 1: Audit current Messages layout
    - Identify channel list, message list, composer
    - Note any existing responsive behavior
    - **Verify immediately:** Understand current structure
  - [ ] Step 2: Implement two-screen mobile navigation
    - Mobile: Channel list is full screen initially
    - Tap channel → navigate to full-screen message view
    - Back button returns to channel list
    - URL reflects current view (/messages vs /messages/:channelId)
    - **Verify immediately:** Can navigate between channels and messages on mobile
  - [ ] Step 3: Responsive channel list
    - Desktop: fixed-width sidebar (250px)
    - Mobile: full width, larger touch targets
    - Unread badges clearly visible
    - **Verify immediately:** Channel list usable on mobile
  - [ ] Step 4: Responsive message list
    - Messages take full width on mobile
    - Sender avatars smaller on mobile
    - Timestamps adapt (relative on mobile, full on desktop)
    - Day separators work at all widths
    - **Verify immediately:** Messages readable on mobile
  - [ ] Step 5: Responsive message bubbles
    - Max width constraint (80% on mobile)
    - Long messages wrap correctly
    - Code blocks have horizontal scroll
    - Images scale to fit
    - **Verify immediately:** All message types render correctly on mobile
  - [ ] Step 6: Responsive message composer
    - Full width on mobile
    - Formatting toolbar: collapsed into menu on mobile
    - Attachment button accessible
    - Send button always visible
    - **Verify immediately:** Can compose message with formatting on mobile
  - [ ] Step 7: Responsive @mention and emoji picker
    - Autocomplete dropdown fits screen
    - Emoji picker: full-screen or bottom sheet on mobile
    - **Verify immediately:** Can @mention and add emoji on mobile
  - [ ] Step 8: Responsive message actions
    - Desktop: hover to reveal actions
    - Mobile: long-press to show action menu
    - Copy, react, reply actions accessible
    - **Verify immediately:** Can copy message on mobile via long-press
  - [ ] Step 9: Responsive search
    - Search results fit mobile width
    - Jump to message works on mobile
    - **Verify immediately:** Can search messages on mobile
  - [ ] Step 10: Handle keyboard appearance on mobile
    - Composer stays visible above keyboard
    - Scroll to keep context when keyboard opens
    - **Verify immediately:** Keyboard doesn't obscure composer on iOS/Android
  - [ ] Step 11: Write Playwright tests
    - Test channel navigation, message viewing, composing
    - Test at all breakpoints
    - **Verify:** Tests pass in `apps/web/tests/tb149-responsive-messages.spec.ts`

---

- [ ] **TB150: Responsive Documents Page (Notion-style)**

  **Context:** The Documents page has a library tree on the left and a document editor on the right. The editor (Tiptap) needs to work well on mobile with touch-friendly controls.

  **Tracer Bullet Steps:**
  - [ ] Step 1: Audit current Documents layout
    - Library tree, document list, document editor
    - Editor toolbar and formatting controls
    - **Verify immediately:** Understand current structure
  - [ ] Step 2: Implement two-screen mobile navigation
    - Mobile: Library/document list full screen
    - Tap document → full-screen editor
    - Back button returns to list
    - **Verify immediately:** Can navigate documents on mobile
  - [ ] Step 3: Responsive library tree
    - Desktop: expandable tree sidebar
    - Mobile: full width, larger tap targets
    - Expand/collapse works with touch
    - **Verify immediately:** Library tree usable on mobile
  - [ ] Step 4: Responsive document list
    - Grid view → single column on mobile
    - Document cards show key info (title, type, updated)
    - **Verify immediately:** Document list readable on mobile
  - [ ] Step 5: Responsive document editor container
    - Full width minus padding on mobile
    - Comfortable reading width on desktop (max 800px)
    - **Verify immediately:** Editor content area adapts to width
  - [ ] Step 6: Responsive editor toolbar
    - Desktop: full toolbar with all buttons visible
    - Tablet: grouped buttons, overflow menu for less common
    - Mobile: minimal toolbar (bold, italic, list) + overflow menu
    - Toolbar sticky at top on mobile
    - **Verify immediately:** Can access formatting on mobile
  - [ ] Step 7: Touch-friendly editor interactions
    - Selection handles for text selection
    - Drag handle for blocks visible and usable
    - Slash commands work (keyboard input)
    - **Verify immediately:** Can select text and move blocks on mobile
  - [ ] Step 8: Responsive slash command menu
    - Desktop: dropdown below cursor
    - Mobile: bottom sheet or centered modal
    - Touch-friendly option selection
    - **Verify immediately:** Slash commands usable on mobile
  - [ ] Step 9: Responsive embed pickers (task/doc)
    - Full-screen on mobile
    - Search works on mobile
    - **Verify immediately:** Can embed task/doc on mobile
  - [ ] Step 10: Responsive image handling
    - Images scale to fit container
    - Upload from camera/photos on mobile
    - **Verify immediately:** Can add images from phone camera
  - [ ] Step 11: Responsive media library modal
    - Full-screen on mobile
    - Grid of images with touch selection
    - **Verify immediately:** Media library works on mobile
  - [ ] Step 12: Write Playwright tests
    - Test navigation, editing, formatting at all breakpoints
    - **Verify:** Tests pass in `apps/web/tests/tb150-responsive-documents.spec.ts`

---

- [ ] **TB151: Responsive Entities & Teams Pages**

  **Context:** Entities and Teams pages have list views and detail panels with various sections (activity charts, contribution graphs, member lists). Ensure all sections adapt to mobile.

  **Tracer Bullet Steps:**
  - [ ] Step 1: Audit Entities page layout
    - Entity list, EntityDetailPanel sections
    - Contribution chart, activity feed, history tab
    - **Verify immediately:** Understand current structure
  - [ ] Step 2: Responsive entity list
    - Desktop: table with columns
    - Mobile: card list with avatar, name, type, task count
    - **Verify immediately:** Entity list usable on mobile
  - [ ] Step 3: Responsive EntityDetailPanel
    - Desktop: side panel
    - Mobile: full-screen sheet
    - Sections stack vertically
    - **Verify immediately:** Entity detail readable on mobile
  - [ ] Step 4: Responsive contribution chart
    - Desktop: full year (52 weeks)
    - Mobile: last 6 months or scrollable
    - Squares slightly larger for touch
    - Tooltip works on tap (not just hover)
    - **Verify immediately:** Contribution chart usable on mobile
  - [ ] Step 5: Responsive activity feed
    - Compact items on mobile
    - Timestamps relative
    - **Verify immediately:** Activity feed readable on mobile
  - [ ] Step 6: Responsive history tab
    - Event items stack vertically
    - Expand/collapse works with touch
    - Diff view readable on mobile
    - **Verify immediately:** History tab usable on mobile
  - [ ] Step 7: Audit Teams page layout
    - Team list, TeamDetailPanel
    - Member list, workload chart
    - **Verify immediately:** Understand structure
  - [ ] Step 8: Responsive team list
    - Desktop: cards or table
    - Mobile: stacked cards
    - **Verify immediately:** Team list usable on mobile
  - [ ] Step 9: Responsive TeamDetailPanel
    - Desktop: side panel
    - Mobile: full-screen sheet
    - Member list scrollable
    - Add member search works on mobile
    - **Verify immediately:** Team detail fully functional on mobile
  - [ ] Step 10: Responsive workload chart in teams
    - Chart adapts to width
    - Bar labels readable
    - Tap bar to navigate (not just click)
    - **Verify immediately:** Workload chart interactive on mobile
  - [ ] Step 11: Write Playwright tests
    - Test both pages at all breakpoints
    - **Verify:** Tests pass in `apps/web/tests/tb151-responsive-entities-teams.spec.ts`

---

- [ ] **TB152: Responsive Settings Page**

  **Context:** The Settings page has multiple sections (theme, shortcuts, defaults, notifications, sync). Ensure all settings are accessible and usable on mobile.

  **Tracer Bullet Steps:**
  - [ ] Step 1: Audit Settings page layout
    - Section navigation, settings controls
    - **Verify immediately:** Understand current structure
  - [ ] Step 2: Responsive settings navigation
    - Desktop: sidebar navigation (Theme, Shortcuts, etc.)
    - Mobile: top tabs or accordion sections
    - **Verify immediately:** Can navigate settings on mobile
  - [ ] Step 3: Responsive theme settings
    - Theme cards adapt to width
    - Preview visible
    - **Verify immediately:** Theme selection works on mobile
  - [ ] Step 4: Responsive shortcuts settings
    - Shortcut list full width on mobile
    - Key capture modal works (if applicable)
    - **Verify immediately:** Can view shortcuts on mobile
  - [ ] Step 5: Responsive defaults settings
    - Dropdowns work on mobile (native or custom)
    - Labels don't truncate
    - **Verify immediately:** Can change defaults on mobile
  - [ ] Step 6: Responsive notifications settings
    - Toggle switches large enough for touch
    - Labels clearly associated
    - **Verify immediately:** Can toggle notifications on mobile
  - [ ] Step 7: Responsive sync settings
    - Export/Import buttons accessible
    - Status display readable
    - **Verify immediately:** Can export/import on mobile
  - [ ] Step 8: Write Playwright tests
    - Test all settings sections at all breakpoints
    - **Verify:** Tests pass in `apps/web/tests/tb152-responsive-settings.spec.ts`

---

- [ ] **TB153: Responsive Modals & Dialogs**

  **Context:** The app has many modals (create task, create plan, pour workflow, pickers, confirmations). All must work well on mobile, typically as full-screen sheets.

  **Tracer Bullet Steps:**
  - [ ] Step 1: Inventory all modals in the app
    - Create: Task, Plan, Workflow, Channel, Document, Entity, Team
    - Pickers: Document, Task, Entity, Emoji, Media
    - Confirmations: Delete, Remove, Discard
    - **Verify immediately:** Complete list of modals
  - [ ] Step 2: Create responsive modal wrapper
    - Desktop: centered modal with backdrop
    - Mobile: full-screen sheet (slides up from bottom)
    - Consistent close button position (top right)
    - **Verify immediately:** Base modal behavior correct
  - [ ] Step 3: Update create modals
    - Form fields stack vertically on mobile
    - Submit button full width at bottom
    - Keyboard doesn't obscure inputs
    - **Verify immediately:** Create Task modal works on mobile
  - [ ] Step 4: Update picker modals
    - Full screen on mobile
    - Search input always visible
    - List items large enough for touch
    - **Verify immediately:** Document picker works on mobile
  - [ ] Step 5: Update confirmation dialogs
    - Desktop: small centered dialog
    - Mobile: centered but full-width with padding
    - Buttons large enough for touch
    - **Verify immediately:** Delete confirmation works on mobile
  - [ ] Step 6: Handle modal stacking
    - If modal opens another modal (e.g., picker from create form)
    - Proper z-index management
    - Back gesture closes top modal only
    - **Verify immediately:** Can open picker from create form on mobile
  - [ ] Step 7: Write Playwright tests
    - Test representative modals at all breakpoints
    - **Verify:** Tests pass in `apps/web/tests/tb153-responsive-modals.spec.ts`

---

- [ ] **TB154: Responsive Command Palette**

  **Context:** The command palette (Cmd+K) is a power-user feature but should also work on mobile for quick navigation. Adapt it for touch devices.

  **Tracer Bullet Steps:**
  - [ ] Step 1: Audit current command palette
    - cmdk library usage
    - Current sizing and positioning
    - **Verify immediately:** Understand current implementation
  - [ ] Step 2: Responsive command palette container
    - Desktop: centered, max-width 640px
    - Mobile: full-screen or near full-screen
    - **Verify immediately:** Palette fits mobile screen
  - [ ] Step 3: Responsive search input
    - Full width on mobile
    - Larger text for readability
    - Clear button visible
    - **Verify immediately:** Can type search on mobile
  - [ ] Step 4: Responsive result items
    - Larger touch targets (minimum 44px height)
    - Icons and text properly sized
    - Keyboard shortcut hints hidden on mobile
    - **Verify immediately:** Can tap results on mobile
  - [ ] Step 5: Handle keyboard on mobile
    - Mobile keyboard appears when palette opens
    - Results visible above keyboard
    - **Verify immediately:** Results visible while typing on mobile
  - [ ] Step 6: Alternative mobile trigger
    - Desktop: Cmd+K
    - Mobile: long-press logo, or dedicated search button in header
    - **Verify immediately:** Can open palette on mobile without keyboard
  - [ ] Step 7: Write Playwright tests
    - Test palette open, search, select at all breakpoints
    - **Verify:** Tests pass in `apps/web/tests/tb154-responsive-command-palette.spec.ts`

---

- [ ] **TB155: Responsive Data Tables**

  **Context:** Several pages use data tables (tasks list, entities, events). Tables need a mobile strategy—either card view, horizontal scroll, or responsive columns.

  **Tracer Bullet Steps:**
  - [ ] Step 1: Inventory tables in the app
    - Tasks list, Entities list, Events list, etc.
    - Note column counts and content types
    - **Verify immediately:** Complete list of tables
  - [ ] Step 2: Create responsive table strategy
    - < 640px: Convert to card layout
    - 640-1024px: Hide less important columns, horizontal scroll
    - > 1024px: Show all columns
    - **Verify immediately:** Strategy documented
  - [ ] Step 3: Implement card view for tables
    - Create `ResponsiveTable` component
    - Accepts `cardRenderer` prop for mobile view
    - Automatic switch at breakpoint
    - **Verify immediately:** Table shows cards on mobile
  - [ ] Step 4: Update Tasks table
    - Card view shows: title, status badge, priority, assignee avatar
    - Touch-friendly interactions
    - **Verify immediately:** Tasks table works on mobile
  - [ ] Step 5: Update other tables
    - Apply same pattern to Entities, Events, etc.
    - Customize card content per table
    - **Verify immediately:** All tables work on mobile
  - [ ] Step 6: Responsive table headers and sorting
    - Sort dropdown instead of clickable headers on mobile
    - Column visibility toggle on tablet
    - **Verify immediately:** Can sort tables on mobile
  - [ ] Step 7: Responsive table pagination
    - Page size options appropriate for mobile
    - Pagination controls fit screen
    - **Verify immediately:** Can paginate on mobile
  - [ ] Step 8: Write Playwright tests
    - Test tables at all breakpoints
    - **Verify:** Tests pass in `apps/web/tests/tb155-responsive-tables.spec.ts`

---

- [ ] **TB156: Responsive Charts & Visualizations**

  **Context:** The app uses Recharts for charts and React Flow for the dependency graph. Ensure all visualizations work well on mobile with touch interactions.

  **Tracer Bullet Steps:**
  - [ ] Step 1: Audit all charts in the app
    - Dashboard: donut, line, bar charts
    - Entity: contribution chart
    - Team: workload bar chart
    - **Verify immediately:** Complete list of charts
  - [ ] Step 2: Implement responsive chart containers
    - Charts use 100% width of container
    - Height scales appropriately (not too short on mobile)
    - **Verify immediately:** Charts resize with container
  - [ ] Step 3: Responsive chart legends
    - Desktop: legend beside or below chart
    - Mobile: below chart, wrapped if needed
    - Smaller font size on mobile
    - **Verify immediately:** Legends don't overflow on mobile
  - [ ] Step 4: Touch-friendly tooltips
    - Desktop: hover to show tooltip
    - Mobile: tap to show tooltip, tap elsewhere to dismiss
    - Tooltip positioned within viewport
    - **Verify immediately:** Tooltips work on mobile
  - [ ] Step 5: Responsive axis labels
    - Rotate or hide labels on narrow charts
    - Fewer tick marks on mobile
    - **Verify immediately:** Axis labels readable on mobile
  - [ ] Step 6: Responsive dependency graph (React Flow)
    - Touch pan and pinch zoom
    - Node tap to select (not just click)
    - Controls accessible on mobile
    - Minimap hidden on small screens
    - **Verify immediately:** Graph interactive on mobile
  - [ ] Step 7: Contribution chart responsiveness
    - Fewer weeks visible on mobile (scrollable)
    - Tap square to show count (not just hover)
    - **Verify immediately:** Contribution chart works on mobile
  - [ ] Step 8: Write Playwright tests
    - Test charts at all breakpoints
    - **Verify:** Tests pass in `apps/web/tests/tb156-responsive-charts.spec.ts`

---

- [ ] **TB157: Responsive Empty States & Loading States**

  **Context:** Empty states and loading states appear throughout the app. Ensure they look good and are properly sized on all screens.

  **Tracer Bullet Steps:**
  - [ ] Step 1: Inventory empty states
    - No tasks, no messages, no documents, etc.
    - **Verify immediately:** Complete list
  - [ ] Step 2: Responsive empty state component
    - Icon scales appropriately
    - Text centered and readable
    - Action button full-width on mobile
    - **Verify immediately:** Empty states look good on mobile
  - [ ] Step 3: Update all empty states
    - Apply responsive component throughout
    - **Verify immediately:** All empty states responsive
  - [ ] Step 4: Inventory loading states
    - Skeletons, spinners, progress indicators
    - **Verify immediately:** Complete list
  - [ ] Step 5: Responsive skeleton components
    - Skeleton shapes match responsive layouts
    - (e.g., card skeletons on mobile, table row skeletons on desktop)
    - **Verify immediately:** Skeletons match final layouts
  - [ ] Step 6: Write Playwright tests
    - Test empty and loading states at all breakpoints
    - **Verify:** Tests pass in `apps/web/tests/tb157-responsive-states.spec.ts`

---

- [ ] **TB158: Final Responsive Audit & Polish**

  **Context:** After all components are responsive, do a final audit across every page at every breakpoint. Fix any remaining issues and ensure consistent behavior.

  **Tracer Bullet Steps:**
  - [ ] Step 1: Full mobile audit (375px)
    - Navigate through entire app on mobile viewport
    - Note any overflow, truncation, touch issues
    - **Verify immediately:** List of issues documented
  - [ ] Step 2: Full tablet audit (768px)
    - Navigate through entire app on tablet viewport
    - Note any layout issues
    - **Verify immediately:** List of issues documented
  - [ ] Step 3: Full desktop audit (1280px)
    - Verify desktop experience not degraded
    - All features accessible
    - **Verify immediately:** List of issues documented
  - [ ] Step 4: Fix documented issues
    - Address all issues from audits
    - **Verify immediately:** Issues resolved
  - [ ] Step 5: Test real devices
    - iPhone (Safari)
    - Android phone (Chrome)
    - iPad (Safari)
    - **Verify immediately:** Works on real devices
  - [ ] Step 6: Test orientation changes
    - Portrait to landscape transitions smooth
    - No broken layouts after rotation
    - **Verify immediately:** Orientation changes work
  - [ ] Step 7: Test with screen readers on mobile
    - VoiceOver on iOS
    - TalkBack on Android
    - Ensure announcements make sense
    - **Verify immediately:** Accessible on mobile
  - [ ] Step 8: Performance audit on mobile
    - Page load time acceptable
    - Smooth scrolling
    - No jank during interactions
    - **Verify immediately:** Performance acceptable
  - [ ] Step 9: Write comprehensive E2E test suite
    - Full user journey tests at each breakpoint
    - Regression tests for responsive behavior
    - **Verify:** All tests pass in `apps/web/tests/tb158-responsive-audit.spec.ts`
  - [ ] Step 10: Document responsive patterns for future development
    - Update RESPONSIVE.md with learnings
    - Add examples for common patterns
    - **Verify:** Documentation complete and useful

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

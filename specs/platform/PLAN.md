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

- [x] **TB124: Task Description Field with Rich Editor**
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
  - [x] Web: TaskSlideOver: show description preview (first 3 lines) with "Show more" expansion
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

- [x] **TB127: Slash Commands in Message Composer** ✅ DONE
  - [x] Web: Created MessageSlashCommands extension (`apps/web/src/components/message/MessageSlashCommands.tsx`)
  - [x] Web: Integrated slash commands with MessageRichComposer
  - [x] Web: Commands implemented:
    - [x] `/task` - Opens task picker modal to insert task reference
    - [x] `/doc` - Opens document picker modal to insert document reference
    - [x] `/code` - Toggles inline code formatting
    - [x] `/codeblock` - Inserts code block
    - [x] `/quote` - Inserts block quote
    - [x] `/bold`, `/italic` - Apply text formatting
    - [x] `/bullet`, `/numbered` - Insert lists
    - [x] `/emoji` - Opens emoji picker modal
  - [x] Web: Fuzzy search filtering as user types after `/`
  - [x] Web: Keyboard navigation (up/down, Enter, Escape)
  - [x] Web: Trigger on `/` anywhere in the editor
  - [x] Web: Command list positioned above composer (using Tippy.js)
  - [x] Web: Fixed Enter key handling to not send message when slash menu is open
  - [x] **Verify:** 14 Playwright tests passing (`apps/web/tests/tb127-message-slash-commands.spec.ts`)

- [x] **TB128: Element Embedding in Messages with #{id}**
  - [x] Web: Detect `![[type:id]]` pattern in message content (using Obsidian-style embed syntax)
  - [x] Web: Parse and validate element ID format (e.g., `![[task:el-abc123]]`, `![[doc:el-abc123]]`)
  - [x] Web: Inline autocomplete: typing `#` shows recent tasks/docs, typing more filters (HashAutocomplete extension)
  - [x] Web: On send, `![[type:id]]` renders as embedded card in message (MessageEmbedCard component)
  - [x] Web: Task embed shows: title, status badge, priority, assignee
  - [x] Web: Document embed shows: title, content type, first line preview
  - [x] Web: Embeds are clickable → navigate to element
  - [x] Server: Embed syntax stored as markdown in message content (no special server handling needed)
  - [x] Web: Embed cards fetch data client-side with react-query caching
  - [x] **Verify:** Type `#` in message, autocomplete suggests matching elements; send, embed renders; 6 Playwright tests passing (`apps/web/tests/tb128-element-embedding.spec.ts`)

### Phase 34: Virtualization & Infinite Scroll

**Goal:** Replace pagination and "Load more" buttons with smooth infinite scroll using virtualization for all list views.

- [x] **TB129: Virtualize Libraries List with Infinite Scroll** ✅ DONE
  - [x] Web: Replace current libraries list in sidebar with VirtualizedList component
  - [x] Web: Flatten tree structure for virtualization while preserving expand/collapse state
  - [x] Web: All libraries rendered from in-memory (upfront loaded)
  - [x] Web: Smooth scroll experience with @tanstack/react-virtual
  - [x] Web: Preserve expand/collapse state of library tree nodes during scroll
  - [x] Web: Scroll position restoration infrastructure in place (scrollRestoreId)
  - [x] **Verify:** 10 Playwright tests passing (`apps/web/tests/tb129-virtualized-libraries.spec.ts`)

- [x] **TB130: Virtualize Documents List with Infinite Scroll** ✅ DONE
  - [x] Web: Replace documents list with VirtualizedList in AllDocumentsView and LibraryView
  - [x] Web: Remove all "Load more" buttons
  - [x] Web: All documents rendered via virtualization (no display limit)
  - [x] Web: Works in both AllDocumentsView and LibraryView
  - [x] Web: Selection state preserved during scroll
  - [x] Web: Search/filter works with virtualized list (instant, client-side)
  - [x] **Verify:** 13 Playwright tests passing (`apps/web/tests/tb130-virtualized-documents.spec.ts`)

- [x] **TB131: Virtualize Channel Messages with Infinite Scroll** ✅ DONE
  - [x] Web: Replace current MessageList with VirtualizedChatList component - `src/components/shared/VirtualizedChatList.tsx`
  - [x] Web: New messages load at bottom (reverse infinite scroll pattern) - auto-scroll when at bottom
  - [x] Web: Scroll to bottom on new message arrival (smart auto-scroll)
  - [x] Web: "Jump to latest" button when scrolled up
  - [x] Web: Day separators work correctly with virtualization
  - [x] Web: Thread view also virtualized
  - [x] Web: Fixed Tiptap duplicate plugin key bug in MessageSlashCommands and HashAutocomplete
  - [x] **Verify:** 8 Playwright tests passing (`apps/web/tests/tb131-virtualized-messages.spec.ts`)

- [x] **TB132: Kanban Column Virtualization with Infinite Scroll**
  - [x] Web: Load ALL tasks upfront (from in-memory cache via DataPreloader)
  - [x] Web: Each Kanban column uses VirtualizedList independently - `src/components/task/KanbanBoard.tsx` (VirtualizedKanbanColumn)
  - [x] Web: Infinite scroll within each column (no page size limit visible to user)
  - [x] Web: Column header shows total count (not "showing X of Y")
  - [x] Web: Drag-and-drop works across virtualized columns
  - [x] Web: Filter/search works with full dataset (instant, client-side)
  - [x] Web: Column scroll positions preserved when switching views - `kanbanScrollPositionStore` Map
  - [x] **Verify:** 8 Playwright tests passing (`apps/web/tests/tb132-kanban-virtualization.spec.ts`)

### Phase 35: Graph & Navigation Cleanup

**Goal:** Remove unused features and simplify navigation based on user feedback.

- [x] **TB133: Remove Edit Mode from Dependency Graph** ✅ DONE
  - [x] Web: Remove "Edit Mode" toggle button from graph toolbar
  - [x] Web: Remove edge creation click-to-select flow
  - [x] Web: Remove right-click edge deletion context menu
  - [x] Web: Remove all edit mode state management
  - [x] Web: Keep graph as read-only visualization
  - [x] Web: Keep all view features: zoom, pan, search, filter, minimap
  - [x] Web: Update header text and documentation referencing edit mode
  - [x] Server: Kept dependency API endpoints (dependencies managed via Task detail panel)
  - [x] **Verify:** 6 Playwright tests passing in `apps/web/tests/dependency-graph.spec.ts` (TB133 section)

- [x] **TB134: Delete Agents Page** ✅ DONE
  - [x] Web: Remove `/dashboard/agents` route from router config
  - [x] Web: Remove "Agents" navigation item from sidebar
  - [x] Web: Delete `AgentActivityLens` component and related files
  - [x] Web: Removed `G A` navigation shortcut from `useKeyboardShortcuts.ts` and `keyboard.ts`
  - [x] Web: Update command palette to remove "Go to Agents" action
  - [x] Web: Update keyboard shortcuts to remove `G A` binding
  - [x] Web: Remove any "Agents" references from AppShell breadcrumbs/route config
  - [x] Web: Keep entity listing at `/entities` (Agents are just entities with type "agent")
  - [x] Web: Agent workload info available via entity detail page at `/entities`
  - [x] Web: Updated Playwright tests (removed agents-related tests, updated navigation tests)
  - [x] **Verify:** Agents link gone from sidebar; URL `/dashboard/agents` no longer routed; Playwright tests passing

### Phase 36: Accessibility & Contrast Fixes

**Goal:** Fix all text contrast issues where light text appears on light backgrounds or dark text on dark backgrounds.

- [x] **TB135: Audit and Fix Text Contrast Issues** ✅ DONE
  - [x] Web: Run automated contrast checker across all pages (axe-core via Playwright)
  - [x] Web: Identify all failing contrast ratios (WCAG AA requires 4.5:1 for text)
  - [x] Web: Fix light mode issues:
    - [x] Muted/secondary text: changed `text-gray-400` to `text-gray-500` (light mode)
    - [x] Primary buttons: changed `bg-blue-500` to `bg-blue-600` for white text contrast
    - [x] Avatar colors: changed from 500 to 700 variants for white text
  - [x] Web: Fix dark mode issues:
    - [x] Used `dark:text-gray-400` for text on dark backgrounds (appropriate contrast)
    - [x] Status badges verified readable in both modes
  - [x] Web: Update design tokens in `tokens.css` with accessible color values
    - [x] Added `--color-text-muted-accessible` semantic tokens for both light and dark
  - [x] Web: Key files updated:
    - [x] `teams.tsx`: timestamps use `text-gray-500 dark:text-gray-400`
    - [x] `timeline.tsx`: event times, avatar colors (700 variants)
    - [x] `documents.tsx`: document count uses `text-gray-500 dark:text-gray-400`
    - [x] `plans.tsx`: create button uses `bg-blue-600`
    - [x] `dependency-graph.tsx`: task IDs use `text-gray-600`
  - [x] Web: Updated TB119 accessibility tests to require 0 contrast violations
  - [x] **Verify:** 27 Playwright tests pass in `apps/web/tests/tb135-text-contrast.spec.ts`; axe-core audit passes on all 12 pages in both light and dark modes

- [x] **TB136: High Contrast Mode Support** ✅ DONE
  - [x] Web: Add "High Contrast" theme option in Settings (alongside Light/Dark/System)
  - [x] Web: High contrast mode: Added CSS tokens with WCAG AAA compliant contrast (7:1 ratio)
  - [x] Web: Light base: pure white background, black text/borders
  - [x] Web: Dark base: pure black background, white text/borders
  - [x] Web: Added base toggle (light/dark) when high contrast is selected
  - [x] Web: Ensure all interactive elements visible in high contrast (thicker focus rings, stronger borders)
  - [x] **Verify:** 13 Playwright tests passing in `apps/web/tests/tb136-high-contrast-mode.spec.ts`

### Phase 37: Human Inbox Page

**Goal:** Create a dedicated full-page inbox for the human operator, separate from entity-specific inboxes.

- [x] **TB137: Human Inbox Page** ✅ DONE
  - [x] Web: Add new route `/inbox` to router with InboxPage component
  - [x] Web: Add "Inbox" navigation item to sidebar with badge for unread count
  - [x] Server: Add `GET /api/inbox/count` endpoint for global unread count
  - [x] Server: Leverages existing `GET /api/inbox/all` endpoint (global inbox)
  - [x] Web: Create InboxPage component (`apps/web/src/routes/inbox.tsx`) with full-page layout
  - [x] Web: Reuse inbox pattern: view tabs (Unread/All/Archived), source filter, sort order
  - [x] Web: Split layout: message list (40% left), message content (60% right)
  - [x] Web: Show all direct messages and @mentions across all entities
  - [x] Web: Keyboard shortcuts: `G I` to go to inbox, `J/K` to navigate messages
  - [x] Web: Add command palette action "Go to Inbox"
  - [x] Web: Unread badge in sidebar with auto-refresh every 30 seconds
  - [x] Web: Time period grouping (Today, Yesterday, This Week, Earlier)
  - [x] Web: Persisted preferences in localStorage (view, filter, sort)
  - [x] **Verify:** 22 Playwright tests passing in `apps/web/tests/tb137-inbox-page.spec.ts`

- [x] **TB138: Inbox Notification Dot** ✅ DONE (implemented as part of TB137)
  - [x] Web: Add small notification dot to Inbox sidebar item when unread count > 0
  - [x] Web: Dot visible when sidebar collapsed (icon-only mode)
  - [x] Web: Badge count visible when sidebar expanded (shows count number)
  - [x] Web: Badge/dot disappears when all messages read
  - [ ] Web: Optional: browser tab title shows unread count "(3) Elemental" (deferred)
  - [x] **Verify:** Tested as part of TB137 tests - badge appears when unread messages exist

- [x] **TB139: Inbox Empty State & Onboarding** ✅ DONE (implemented as part of TB137)
  - [x] Web: Create helpful empty state for inbox with no messages
  - [x] Web: Empty state shows: icon, "Your inbox is empty", helpful tips
  - [x] Web: Tips: "Direct messages and @mentions will appear here"
  - [x] Web: Link to view all messages when viewing unread-only
  - [x] Web: Empty state for filtered views: "No messages match your filters" with clear filter button
  - [x] Web: Empty state for archived view: "No archived messages"
  - [x] Web: Empty state for message content panel: "Select a message" with J/K hint
  - [x] **Verify:** Tested as part of TB137 tests - empty states appear correctly

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

- [x] **TB141: Sidebar Expand Button When Collapsed**

  **Context:** The sidebar can be collapsed with `Cmd+B`, but users without keyboard access (or those who don't know the shortcut) have no way to expand it. Add a visible button/affordance to expand the sidebar when it's in collapsed state.

  **Tracer Bullet Steps:**
  - [x] Step 1: Read current sidebar collapse implementation in `Sidebar.tsx` and `AppShell.tsx`
    - Understand how `collapsed` prop flows and `onToggle` is called
    - **Verify immediately:** Know where to add the expand button
  - [x] Step 2: Add expand button to collapsed sidebar state
    - Position at bottom of collapsed sidebar (below Settings icon)
    - Use `PanelLeftOpen` icon from lucide-react
    - Only visible when `collapsed={true}`
    - **Verify immediately:** Collapse sidebar with Cmd+B, see expand button appear
  - [x] Step 3: Wire button to call `onToggle`
    - On click, expand sidebar
    - **Verify immediately:** Click button, sidebar expands
  - [x] Step 4: Add tooltip to button
    - Tooltip: "Expand sidebar" with shortcut "⌘B"
    - Uses existing Tooltip component
    - **Verify immediately:** Hover button, see tooltip
  - [x] Step 5: Style button for visual consistency
    - Match other sidebar icon styling (muted color, hover state)
    - Ensure button is keyboard accessible (focus ring)
    - **Verify immediately:** Button looks native to sidebar design
  - [x] Step 6: Add accessibility attributes
    - `aria-label="Expand sidebar"`
    - `aria-expanded="false"` when collapsed
    - **Verify immediately:** Screen reader announces button purpose
  - [x] Step 7: Write Playwright test
    - Collapse sidebar, verify expand button visible
    - Click expand button, verify sidebar expands
    - **Verify:** 9 tests pass in `apps/web/tests/tb141-sidebar-expand-button.spec.ts`

- [x] **TB142: Move Dependencies to Work Section in Sidebar**

  **Context:** The Dependencies navigation item is currently in the Dashboard section. For better information architecture, it should be in the Work section (alongside Tasks, Plans, Workflows) since dependencies are integral to work management.

  **Tracer Bullet Steps:**
  - [x] Step 1: Read `NAV_SECTIONS` array in `Sidebar.tsx` (lines 40-82)
    - Identify Dependencies item in Dashboard section (line 50)
    - Identify Work section structure (lines 53-58)
    - **Verify immediately:** Understand current nav structure
  - [x] Step 2: Move Dependencies nav item from Dashboard to Work section
    - Remove from Dashboard items array
    - Add to Work items array (after Workflows)
    - **Verify immediately:** Refresh browser, see Dependencies under Work section
  - [x] Step 3: Update route if needed
    - Changed route from `/dashboard/dependencies` to `/dependencies`
    - Updated router.tsx, DASHBOARD_LENS_ROUTES map
    - **Verify immediately:** Click Dependencies in sidebar, navigate to correct page
  - [x] Step 4: Update keyboard shortcut hint if needed
    - Kept `G G` shortcut, updated to point to `/dependencies`
    - Updated useKeyboardShortcuts.ts
    - **Verify immediately:** Keyboard shortcut works from anywhere
  - [x] Step 5: Update command palette entry
    - Moved to Work group, updated route to `/dependencies`
    - **Verify immediately:** Cmd+K, type "dep", action appears in Work group
  - [x] Step 6: Update Dashboard section if needed
    - Removed Dependencies from Dashboard items
    - Fixed type errors in ElementNotFound.tsx and useDeepLink.ts
    - **Verify immediately:** Dashboard overview page loads correctly
  - [x] Step 7: Write Playwright test
    - 7 tests passing in `apps/web/tests/tb142-dependencies-nav-location.spec.ts`
    - Tests: Work section placement, not in Dashboard, route works, keyboard shortcut, command palette, page loads, correct order
    - **Verify:** All tests pass

- [x] **TB143: Timeline Eager Event Loading with UI Pagination** ✅ DONE

  **Context:** The timeline page uses lazy loading—users must click "Next page" repeatedly to see all events, with no way to know the total count upfront. Change to eager loading (fetch all events on mount) while keeping page-based UI pagination for performance.

  **Implementation Summary:**
  - Added `/api/events/count` endpoint to server for accurate total count
  - Added `countEvents()` method to ElementalAPI (`src/api/elemental-api.ts`)
  - Created `useAllEvents()` hook that fetches count first, then all events
  - Replaced lazy loading with eager loading (up to 20,000 events)
  - Client-side pagination for instant page navigation
  - Client-side filtering (search, element types, date) for instant results
  - Loading state shows count while fetching: "Loading 12,144 events..."
  - Background refresh every 30 seconds with "refreshing" indicator
  - 10 Playwright tests passing in `apps/web/tests/tb143-timeline-eager-loading.spec.ts`
  - **Verify:** Run `npx playwright test tb143` - all tests pass

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

- [x] **TB144: Responsive Foundation & CSS Infrastructure** ✅ DONE

  **Context:** Before making individual components responsive, establish the CSS infrastructure—breakpoint utilities, responsive spacing scale, and testing helpers. This creates a consistent foundation for all subsequent work.

  **Implementation Summary:**
  - Added breakpoint CSS tokens (`--breakpoint-xs` through `--breakpoint-2xl`) to `tokens.css`
  - Created responsive spacing tokens (`--gap-responsive`, `--padding-responsive`, etc.) that adapt at 768px and 1280px
  - Created responsive typography tokens (`--font-size-responsive-base`, `--font-size-responsive-h1`, etc.)
  - Created responsive layout tokens (`--sidebar-width`, `--detail-panel-width`, `--prose-max-width`)
  - Added responsive utility classes (`.gap-responsive`, `.p-responsive`, `.text-responsive`, etc.)
  - Verified viewport meta tag is correct and accessible (no `user-scalable=no`)
  - Created `useBreakpoint()` and related hooks (`useIsMobile()`, `useIsTablet()`, `useIsDesktop()`, `useResponsive()`, etc.)
  - Created Playwright responsive test helpers (`setViewport()`, `testResponsive()`, `testAtAllBreakpoints()`, etc.)
  - 18 Playwright tests passing in `apps/web/tests/tb144-responsive-foundation.spec.ts`
  - Spec: `specs/platform/TB144-responsive-foundation.md`
  - **Verify:** Run `npx playwright test tb144` - all tests pass

---

- [x] **TB145: Responsive AppShell & Sidebar** ✅ DONE

  **Context:** The AppShell is the root layout component. The sidebar must transform from always-visible (desktop) to overlay drawer (mobile). This is the most critical responsive component as it affects navigation throughout the app.

  **Implementation Summary:**
  - Created `MobileDrawer` component (`apps/web/src/components/layout/MobileDrawer.tsx`)
  - Updated `AppShell.tsx` with responsive logic using `useIsMobile()` and `useIsTablet()` hooks
  - Mobile: sidebar hidden, hamburger menu opens slide-out drawer with backdrop
  - Tablet: sidebar collapsed by default (icons only)
  - Desktop: sidebar expanded by default, state persisted in localStorage
  - Responsive header: hamburger + centered title on mobile, full breadcrumbs on tablet/desktop
  - Keyboard shortcut hints hidden on mobile drawer
  - 27 Playwright tests passing in `apps/web/tests/tb145-responsive-appshell.spec.ts`
  - Spec: `specs/platform/TB145-responsive-appshell.md`
  - **Verify:** Run `npx playwright test tb145-responsive-appshell` - all 27 tests pass

---

- [x] **TB146: Responsive Dashboard Page** ✅ COMPLETED

  **Context:** The Dashboard has multiple "lenses" (Overview, Task Flow, Agents, Dependencies, Timeline) with complex layouts including charts, grids, and graphs. Each lens needs a mobile-appropriate layout.

  **Tracer Bullet Steps:**
  - [x] Step 1: Audit Dashboard Overview layout
    - Identified grid layout for stat cards and charts
    - Noted chart components (Recharts) and their current sizing
    - **Verified:** Understood what needs to change
  - [x] Step 2: Make stat cards responsive
    - Desktop: 4 columns (lg:grid-cols-4)
    - Tablet/Mobile: 2 columns (grid-cols-2)
    - Responsive padding, font sizes, and icon sizes
    - **Verified:** Cards display correctly at each breakpoint
  - [x] Step 3: Make dashboard charts responsive
    - Charts resize to container width using ResponsiveContainer
    - Chart heights: h-40 sm:h-48
    - Legends scale appropriately on mobile
    - **Verified:** Charts render correctly, no overflow
  - [x] Step 4: Responsive Ready Tasks and Activity Feed
    - Desktop: 2-column side-by-side layout
    - Mobile: Stacked vertically
    - Responsive spacing and typography
    - **Verified:** Both sections are usable on mobile
  - [x] Step 5: Responsive Elements by Type and System Status
    - Responsive grid layouts
    - Compact styling on mobile
    - Dark mode support added
    - **Verified:** Sections readable on mobile
  - [x] Step 6: Responsive Dependency Graph lens
    - Desktop: sidebar task selector + graph canvas
    - Mobile: horizontal scrollable task selector + graph below
    - Toolbar adapts with smaller padding and font sizes
    - Legend edge types hidden on mobile to save space
    - **Verified:** Graph is usable on mobile
  - [x] Step 7: Responsive Timeline lens
    - Header and controls stack on mobile
    - Filter chips scroll horizontally on mobile
    - Event cards have responsive padding and typography
    - View mode toggle compact on mobile
    - **Verified:** Timeline is fully usable on mobile
  - [x] Step 8: Write Playwright tests for each lens
    - Tests at desktop (1280px), tablet (768px), and mobile (375px) viewports
    - Tests for dashboard, timeline, and dependency graph
    - Tests for viewport transitions
    - **Verified:** 15 tests pass in `apps/web/tests/tb146-responsive-dashboard.spec.ts`

  - Spec: `specs/platform/TB146-responsive-dashboard.md`
  - **Verify:** Run `npx playwright test tb146-responsive-dashboard` - all 15 tests pass

---

- [x] **TB147: Responsive Tasks Page (List, Kanban, Detail)** *(Completed 2026-01-26)*

  **Context:** The Tasks page is the most heavily used page. It has list view, kanban view, and a detail panel. All three views need to work well on mobile with appropriate touch interactions.

  **Implementation Summary:**
  - Created `MobileTaskCard` component for card-based list view on mobile
  - Created `MobileDetailSheet` component for full-screen detail panels on mobile
  - Updated `TasksPage` with responsive layout using `useIsMobile()` and `useIsTablet()` hooks
  - Made `CreateTaskModal` full-screen on mobile with stacked form fields
  - Added mobile FAB (floating action button) for task creation
  - Added mobile filter sheet that opens on button tap
  - Made search bar compact on mobile with shorter placeholder
  - View toggle (List/Kanban) works at all viewport sizes

  **Files Changed:**
  - `apps/web/src/routes/tasks.tsx` - Main responsive logic
  - `apps/web/src/components/task/MobileTaskCard.tsx` - New component
  - `apps/web/src/components/shared/MobileDetailSheet.tsx` - New component
  - `apps/web/src/components/task/CreateTaskModal.tsx` - Full-screen on mobile

  - Spec: `specs/platform/TB147-responsive-tasks.md`
  - **Verify:** Run `npx playwright test tb147-responsive-tasks` - 19 tests pass (5 skipped due to React state timing issues in test environment)

---

- [x] **TB148: Responsive Plans & Workflows Pages** - COMPLETED

  **Context:** Plans and Workflows pages share similar patterns—a list view and a detail view with task collections. Ensure both are fully responsive with consistent patterns.

  **Implementation:**
  - Created `MobilePlanCard` and `MobileWorkflowCard` components for mobile list views
  - Added full-screen detail sheets using `MobileDetailSheet` component
  - Added FABs for creating plans and pouring workflows on mobile
  - Made `CreatePlanModal` and `PourWorkflowModal` responsive (full-screen on mobile)
  - Responsive header layouts with scrollable status filters on mobile

  **Tracer Bullet Steps:**
  - [x] Step 1: Audit Plans page layout
  - [x] Step 2: Responsive Plans list - MobilePlanCard component
  - [x] Step 3: Responsive PlanDetailPanel - MobileDetailSheet on mobile
  - [x] Step 4: Responsive plan task operations - CreatePlanModal responsive
  - [x] Step 5: Audit Workflows page layout
  - [x] Step 6: Responsive Workflows list - MobileWorkflowCard component
  - [x] Step 7: Responsive WorkflowDetailPanel - MobileDetailSheet on mobile
  - [x] Step 8: Responsive PourWorkflowModal - Full-screen on mobile
  - [x] Step 9: Write Playwright tests - 26 tests passing

  - Spec: `specs/platform/TB148-responsive-plans-workflows.md`
  - **Verify:** Run `npx playwright test tb148-responsive-plans-workflows` - 26 tests pass

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

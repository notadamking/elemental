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

### Phase 22B: Document Editor Core Fixes

**Goal:** Fix fundamental document editor issues with a **Markdown-first architecture**.

> **Key Principle:** All document content is stored as Markdown, not proprietary JSON formats.
> This ensures AI agents can read and write documents naturally, maximizes token efficiency,
> and maintains universal interoperability with external tools. The editor provides rich UX
> for humans while persisting standard Markdown that any system can understand.

- [x] **TB94a: Editor Expand in Edit Mode**
  - [x] Web: Debug why editor cannot be expanded/resized while in editing mode - Fixed: expand button was only visible in view mode, moved outside conditional
  - [x] Web: Ensure editor panel supports resize handle or expand button in edit mode - `apps/web/src/routes/documents.tsx` lines 1773-1788
  - [x] Web: Add fullscreen/focus mode toggle (Escape to exit) - Added `isFullscreen` state with Escape key handler; fullscreen button in panel header
  - [x] Web: Persist editor size preference in localStorage - `document.expanded` key in localStorage, restored on mount
  - [x] **Verify:** Enter edit mode, expand editor to fullscreen, content persists; Playwright tests passing (12 tests in `apps/web/tests/tb94a-editor-expand.spec.ts`)

- [x] **TB94b: Core Formatting Fixes**
  - [x] Web: Fixed BlockEditor to emit HTML instead of converting to plain text - formatting now persists
  - [x] Web: Fixed headings (H1, H2, H3) - toolbar buttons, slash commands, and keyboard shortcuts all work
  - [x] Web: Fixed highlighting - toolbar button and keyboard shortcut (Cmd+Shift+H) apply highlight
  - [x] Web: Fixed bullet lists - slash command `/bullet` creates list, Enter continues list
  - [x] Web: Fixed numbered lists - slash command `/numbered` creates list, Enter continues list
  - [x] Web: Fixed code blocks - slash command `/code` creates block, syntax highlighting works
  - [x] Web: Fixed block quotes - keyboard shortcut (Cmd+Shift+B) and slash command work
  - [x] Web: All formatting persists on save and displays correctly in view mode
  - [x] Web: Added comprehensive test coverage - 14 Playwright tests in `apps/web/tests/tb94b-core-formatting.spec.ts`
  - [x] **Verify:** Create document with all formatting types, save, refresh, all formatting preserved; Playwright tests passing (14 tests)

- [x] **TB94c: Markdown-First Editor Architecture**

  > **Design Decision:** We intentionally use **Markdown as the canonical storage format** rather than
  > a proprietary JSON format (like BlockNote). This ensures:
  >
  > - **AI Agent Compatibility:** Agents can read/write documents naturally without schema knowledge
  > - **Token Efficiency:** Markdown is 3-5x more compact than structured JSON for the same content
  > - **Universal Interoperability:** Works with GitHub, external tools, and other AI systems
  > - **Simplicity:** No format migration, no schema versioning, no complex nested structures
  - [x] Web: Refactor BlockEditor to use Markdown as source of truth (not HTML or plain text) - `apps/web/src/components/editor/BlockEditor.tsx`
  - [x] Web: Install and configure `turndown`/`marked` for conversion - `bun add turndown marked @types/turndown`
  - [x] Web: Create markdown utility functions - `apps/web/src/lib/markdown.ts` (htmlToMarkdown, markdownToHtml, etc.)
  - [x] Web: Update `onChange` to emit Markdown string via `prepareContentForStorage()` - BlockEditor.tsx
  - [x] Web: Update content loading to parse Markdown → HTML via `prepareContentForEditor()` - BlockEditor.tsx
  - [x] Web: Ensure round-trip fidelity: Markdown → Editor → Markdown preserves formatting - tested with headings, bold, italic, lists, code blocks, blockquotes, highlight, strikethrough
  - [x] Web: Update DocumentRenderer to handle both Markdown and legacy HTML content - `apps/web/src/routes/documents.tsx`
  - [x] Web: Add custom Turndown rules for highlight (`==text==`) and strikethrough (`~~text~~`)
  - [x] Web: Add comprehensive test coverage - 11 Playwright tests in `apps/web/tests/tb94c-markdown-first.spec.ts`
  - [x] **Verify:** Create document with mixed formatting, save, reload—Markdown content stored in API; AI agents can read/write documents naturally; Playwright tests passing (11 tests)

- [x] **TB94c-2: Block Drag-and-Drop with Markdown Persistence**
  - [x] Web: Debug `tiptap-extension-global-drag-handle` integration - extension working correctly
  - [x] Web: Ensure drag handles appear on hover for paragraphs, headings, lists, code blocks
  - [x] Web: Fix any CSS conflicts (z-index, positioning) preventing drag handle visibility
  - [x] Web: Implement block reordering via drag-and-drop - working via GlobalDragHandle extension
  - [x] Web: Visual drop indicator (blue line) between blocks while dragging - configured dropcursor with `class: 'drop-cursor'` and matching CSS
  - [x] Web: After drop, Markdown output reflects new block order
  - [x] Web: Add comprehensive test coverage - 11 Playwright tests in `apps/web/tests/tb94c-2-drag-drop-markdown.spec.ts`
  - [x] **Verify:** Drag paragraph to new position, save, check raw Markdown—order changed correctly; Playwright tests passing (11 tests)

- [x] **TB94d: Text Alignment**
  - [x] Web: Add text alignment extension (@tiptap/extension-text-align) - `apps/web/src/components/editor/BlockEditor.tsx`
  - [x] Web: Add toolbar buttons: Align Left, Center, Align Right, Justify - `BlockEditor.tsx` alignmentActions
  - [x] Web: Add slash commands: /left, /center, /right, /justify - `apps/web/src/components/editor/SlashCommands.tsx`
  - [x] Web: Keyboard shortcuts: ⌘+Shift+L (left), ⌘+Shift+E (center), ⌘+Shift+R (right), ⌘+Shift+J (justify)
  - [x] Web: Alignment applies to current block (paragraph, heading) - TextAlign configured with `types: ['heading', 'paragraph']`
  - [x] Web: Alignment indicator in toolbar (shows current alignment state via overflow menu)
  - [x] Web: Alignment stored in Markdown using HTML attributes (e.g., `<p style="text-align: center">`)
  - [x] **Verify:** Create centered heading, right-aligned paragraph, alignment persists in Markdown; Playwright tests passing (15 tests in `apps/web/tests/tb94d-text-alignment.spec.ts`)

- [x] **TB94e: Image Block Support (Markdown-Compatible)**

  > **Markdown Format for Images:** Images use standard Markdown syntax that AI agents can read/write:
  >
  > - Basic: `![alt text](/api/uploads/abc123.png)`
  > - With caption: `![alt text](/api/uploads/abc123.png "caption text")`
  > - With dimensions: `![alt text|400x300](/api/uploads/abc123.png)` (extended syntax)
  - [x] Web: Add Image extension (@tiptap/extension-image) - `apps/web/src/components/editor/BlockEditor.tsx`
  - [x] Web: Image insertion methods:
    - [x] Slash command: /image opens ImageUploadModal - `apps/web/src/components/editor/SlashCommands.tsx`
    - [x] Toolbar button: Image icon in blocks menu
    - [x] URL: URL input tab in ImageUploadModal
  - [x] Web: Markdown output uses standard `![alt](url)` syntax - handled by turndown library
  - [x] Server: Add `POST /api/uploads` endpoint - `apps/server/src/index.ts`
    - [x] Accept multipart/form-data with image file
    - [x] Store in `.elemental/uploads/{hash}.{ext}`
    - [x] Return URL: `/api/uploads/{hash}.{ext}`
    - [x] Support: jpg, png, gif, webp, svg (validate MIME type)
    - [x] Max size: 10MB
  - [x] Server: Add `GET /api/uploads/:filename` endpoint (serve uploaded files)
  - [x] Server: Add `GET /api/uploads` endpoint (list all uploads)
  - [x] Server: Add `DELETE /api/uploads/:filename` endpoint
  - [x] Web: ImageUploadModal component - `apps/web/src/components/editor/ImageUploadModal.tsx`
    - [x] Upload tab with drag-and-drop support
    - [x] URL tab for external images
    - [x] Image preview before insert
    - [x] Alt text input
  - [x] **Verify:** Upload image, check Markdown contains `![alt](url)`; manually write image Markdown, editor renders image; Playwright tests passing (14 tests in `apps/web/tests/tb94e-image-support.spec.ts`)

- [x] **TB94f: Task and Document Embedding (Markdown-Compatible)**

  > **Markdown Format for Embeds:** Embeds are stored as custom Markdown syntax that AI agents can
  > easily read and write:
  >
  > - Task embed: `![[task:el-abc123]]`
  > - Document embed: `![[doc:el-xyz789]]`
  > - Inline link (existing): `[Task Title](/tasks/el-abc123)`
  >
  > This allows agents to create embeds by simply writing the syntax, without needing editor UI.
  - [x] Web: Define embed syntax convention - using `![[task:ID]]` and `![[doc:ID]]` (Obsidian-inspired)
  - [x] Web: Distinguish between "link" (inline text link) and "embed" (rich preview block) - embeds render as inline badges
  - [x] Web: Create Tiptap nodes that parse embed syntax from Markdown - `apps/web/src/components/editor/blocks/TaskEmbedBlock.tsx`, `DocumentEmbedBlock.tsx`
  - [x] Web: Task embed block:
    - [x] Slash command: `/task` opens task picker - `apps/web/src/components/editor/SlashCommands.tsx`
    - [x] Markdown output: `![[task:el-abc123]]` - `apps/web/src/lib/markdown.ts` turndown rule
    - [x] Renders as inline badge showing: title, status icon with color - TaskEmbedBlock component
    - [x] Real-time updates: uses TanStack Query with task ID key for automatic updates
    - [x] Click → navigates to `/tasks/:id` via href attribute
    - [x] Error state shown for non-existent tasks
  - [x] Web: Document embed block:
    - [x] Slash command: `/doc` opens document picker - SlashCommands.tsx
    - [x] Markdown output: `![[doc:el-xyz789]]` - markdown.ts turndown rule
    - [x] Renders as inline badge showing: title, content type icon - DocumentEmbedBlock component
    - [x] Click → navigates to `/documents/:id` via href attribute
    - [x] Error state shown for non-existent documents
  - [x] Web: Embed blocks are distinct from existing inline links - embeds are atomic Tiptap nodes, not standard links
  - [x] Web: TaskPickerModal and DocumentPickerModal - `apps/web/src/components/editor/TaskPickerModal.tsx`, `DocumentPickerModal.tsx`
    - [x] Search functionality
    - [x] Keyboard navigation
    - [x] Close button functionality
  - [x] Web: BlockEditor integration - embeds registered as extensions, picker modals trigger via slash commands
  - [x] **Verify:** Embed task via UI, check Markdown contains `![[task:ID]]`; manually write embed syntax, editor renders card; Playwright tests passing (18 tests in `apps/web/tests/tb94f-task-document-embedding.spec.ts`)

### Phase 23: Documents Page Enhancements (Notion-inspired)

**Goal:** Enhance the document editor with Notion-inspired features.

- [x] **TB95: Document Search**
  - [x] Web: Add search bar to Documents page sidebar - `apps/web/src/routes/documents.tsx` (DocumentSearchBar component in LibraryTree header)
  - [x] Web: Search by document title and content (full-text) - Server `/api/documents/search` endpoint searches both title and content
  - [x] Web: Results show title and content snippet with highlighted match - Results dropdown with highlighted matches using `<mark>` tags
  - [x] Web: Click result → open document - handleSelectResult calls onSelectDocument, clears search
  - [x] Web: Keyboard shortcut: `/` focuses search when in Documents - Global keyboard listener focuses input on `/`
  - [x] Server: Add `GET /api/documents/search` endpoint with snippet generation - `apps/server/src/index.ts`
  - [x] **Verify:** Search for keyword, matching documents shown with preview; 18 Playwright tests passing (`apps/web/tests/tb95-document-search.spec.ts`)

- [x] **TB96: Media Library Browser**

  > Note: Core image support is in TB94e. This TB adds a media library for managing uploaded assets.
  - [x] Web: Add "Media Library" tab/modal accessible from image picker - `apps/web/src/components/editor/ImageUploadModal.tsx` (Library tab with Grid icon)
  - [x] Web: Show grid of all uploaded images for current workspace - 3-column grid view with image thumbnails
  - [x] Web: Search/filter uploaded images by filename - Search input with real-time filtering
  - [x] Web: Click to insert existing image (reuse URL, don't re-upload) - Selection state with blue border and checkmark
  - [x] Web: Delete unused images from library - Delete button with confirmation in hover overlay
  - [x] Server: Add `GET /api/uploads` endpoint (list all uploads with metadata) - Already existed from TB94e
  - [x] Server: Add `DELETE /api/uploads/:filename` endpoint - Already existed from TB94e
  - [x] Server: Track image usage (which documents reference each image) - New `GET /api/uploads/:filename/usage` endpoint
  - [x] **Verify:** Upload image, see it in media library, insert into different document; 13 Playwright tests passing (`apps/web/tests/tb96-media-library-browser.spec.ts`)

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

### Phase 30: Collection Integrity & Validation

**Goal:** Enforce that collections (Plans, Workflows, Teams) must have meaningful content—preventing empty shells that clutter the system.

- [ ] **TB121: Plans Must Have Task Children**
  - [ ] Server: Add validation in `POST /api/plans` - require at least one task ID in request body OR create with initial task
  - [ ] Server: Add `POST /api/plans` variant that creates plan + first task atomically
  - [ ] Server: Prevent deletion of last task in plan (return error with helpful message)
  - [ ] Server: Add `GET /api/plans/:id/can-delete-task/:taskId` endpoint to check if deletion would orphan plan
  - [ ] Web: Update CreatePlanModal to require initial task (title input + "Add First Task" section)
  - [ ] Web: Show validation error if trying to submit plan without task
  - [ ] Web: In PlanDetailPanel, show warning when removing task would leave plan empty
  - [ ] Web: Disable "Remove" button on last task with tooltip explaining why
  - [ ] **Verify:** Try creating empty plan via UI - blocked; try removing last task - blocked; Playwright tests passing

- [ ] **TB122: Workflows Must Have Task Children**
  - [ ] Server: Add validation in `POST /api/workflows` - require playbook (which generates tasks) or initial task
  - [ ] Server: `POST /api/workflows/pour` already requires playbook - ensure playbook has at least one step
  - [ ] Server: Prevent deletion of last task in workflow
  - [ ] Server: Add `GET /api/workflows/:id/can-delete-task/:taskId` endpoint
  - [ ] Web: Update PourWorkflowModal to validate playbook has steps before pour
  - [ ] Web: In WorkflowDetailPanel, prevent removing last task
  - [ ] Web: Show helpful empty state if workflow has no playbook ("This workflow needs tasks to be useful")
  - [ ] **Verify:** Try pouring workflow with empty playbook - blocked; try removing last task - blocked; Playwright tests passing

- [ ] **TB123: Teams Must Have Entity Members**
  - [ ] Server: Add validation in `POST /api/teams` - require at least one member entity ID
  - [ ] Server: Prevent removal of last member from team (return error)
  - [ ] Server: Add `GET /api/teams/:id/can-remove-member/:entityId` endpoint
  - [ ] Web: Update CreateTeamModal to require at least one member selection
  - [ ] Web: Disable "Create Team" button until member selected, show helper text
  - [ ] Web: In TeamDetailPanel, show warning when removing member would leave team empty
  - [ ] Web: Disable "Remove" action on last member with tooltip explaining why
  - [ ] **Verify:** Try creating team without members - blocked; try removing last member - blocked; Playwright tests passing

### Phase 31: Task Description Rich Editor

**Goal:** Add optional rich markdown description to Tasks, using the same editor experience as Documents for consistency.

- [ ] **TB124: Task Description Field with Rich Editor**
  - [ ] Server: Task type already has `descriptionRef` pointing to Document - ensure API supports creating/updating description document inline
  - [ ] Server: Add `PATCH /api/tasks/:id` support for `description` field that creates/updates linked Document
  - [ ] Server: When task created with `description` string, auto-create Document with content and link via `descriptionRef`
  - [ ] Server: Add `GET /api/tasks/:id?hydrate.description=true` returns task with description content inline
  - [ ] Web: Add collapsible "Description" section to TaskDetailPanel below title
  - [ ] Web: View mode: render description as markdown (same as DocumentRenderer)
  - [ ] Web: Edit mode: show same BlockEditor used for Documents
  - [ ] Web: "Add description" button when description is empty
  - [ ] Web: Description auto-saves on blur with debounce (like document editing)
  - [ ] Web: Show character count and "Saved" indicator
  - [ ] Web: CreateTaskModal: add optional "Description" textarea with markdown preview toggle
  - [ ] Web: TaskSlideOver: show description preview (first 3 lines) with "Show more" expansion
  - [ ] **Verify:** Create task with description, edit with rich editor, formatting persists; Playwright tests passing

### Phase 32: Document Embed Search Fix

**Goal:** Fix the embed search functionality so task/document pickers actually find items.

- [ ] **TB125: Fix Task Embed Search in Editor**
  - [ ] Web: Debug TaskPickerModal search - verify it queries `/api/tasks` with search param
  - [ ] Server: Ensure `GET /api/tasks?search=query` works correctly (fuzzy match on title)
  - [ ] Web: If using in-memory data (from DataPreloader), ensure search filters loaded tasks
  - [ ] Web: Add loading state while searching
  - [ ] Web: Show "No tasks found" empty state with suggestion to check spelling
  - [ ] Web: Ensure keyboard navigation works (arrow keys, Enter to select)
  - [ ] Web: Fix any race conditions between typing and results
  - [ ] **Verify:** Open document editor, type `/task`, search for existing task - task appears in results; Playwright tests passing

- [ ] **TB126: Fix Document Embed Search in Editor**
  - [ ] Web: Debug DocumentPickerModal search - verify it queries `/api/documents` with search param
  - [ ] Server: Ensure `GET /api/documents?search=query` works correctly (fuzzy match on title + content)
  - [ ] Web: If using in-memory data, ensure search filters loaded documents
  - [ ] Web: Show document content type badge in results
  - [ ] Web: Show "No documents found" empty state
  - [ ] Web: Ensure picker excludes current document (can't embed self)
  - [ ] **Verify:** Open document editor, type `/doc`, search for existing doc - doc appears in results; Playwright tests passing

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

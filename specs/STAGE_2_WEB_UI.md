# Stage 2 Orchestrator: UI/UX Structure Plan

## Overview

This plan defines the UI/UX structure for the Elemental Orchestrator web platform - a browser-based multi-agent orchestration system built on Elemental.

**Key design principles:**

- Director-centric workflow with always-accessible terminal
- Live activity feed as the information hub
- Terminal multiplexer for worker management
- Full responsive design for all screen sizes
- Power-user features (command palette, keyboard shortcuts)

---

## App Architecture

Two separate apps sharing a component library:

```
@elemental/ui          → Shared React components
@elemental/web         → Base Elemental platform (tasks, docs, etc.)
@elemental/orchestrator-web → Orchestrator platform (agents, workers)
```

Both apps import from `@elemental/ui` for consistent look and feel.

---

## Layout Structure

### Desktop (≥1024px): Three-Column Layout

```
┌─────────────────────────────────────────────────────────────────────┐
│  [Logo]                          [🔔 Notifications]  [User Menu]    │  ← Header
├──────┬──────────────────────────────────────────────┬───────────────┤
│ 📊   │                                              │               │
│ Act  │                                              │   Director    │
│ ──── │                                              │   Terminal    │
│ ✅   │              Main Content                    │    (xterm)    │
│ Tasks│              (scrollable)                    │               │
│ ──── │                                              │  (resizable)  │
│ 🤖   │                                              │ (collapsible) │
│Agents│                                              │               │
│ ──── │                                              │               │
│ 💻   │                                              │               │
│Worksp│                                              │               │
│ ──── │                                              │               │
│ 📋   │                                              │               │
│Workfl│                                              │               │
│ ──── │                                              │               │
│ 📈   │                                              │               │
│Metric│                                              │               │
│      │                                              │               │
│ ──── │                                              │               │
│ ⚙️   │                                              │               │
│Settin│                                              │               │
├──────┴──────────────────────────────────────────────┴───────────────┤
│  [⌘K Quick actions...]                    [Toast notifications →]   │
└─────────────────────────────────────────────────────────────────────┘
```

- **Left sidebar**: Navigation tabs (same base component as Elemental web)
- **Center**: Main content area (scrollable)
- **Right panel**: Director terminal (xterm, resizable 300-600px, collapsible)
- **Bottom left**: Cmd+K hint
- **Bottom right**: Toast notifications

### Tablet (768-1023px): Two-Column with Overlay

- Left sidebar collapses to icons
- Director terminal becomes slide-over panel (triggered by icon in header)
- Main content gets full width when terminal is closed

### Mobile (<768px): Single Column with Bottom Nav

- Bottom navigation bar with key sections
- Director terminal as full-screen modal
- Swipe gestures for navigation

---

## Navigation Structure

### Primary Navigation (Left Sidebar)

Uses the same base Sidebar component as Elemental web app.

| Section        | Icon | Description                           |
| -------------- | ---- | ------------------------------------- |
| **Activity**   | 📊   | Live feed (home/default)              |
| **Tasks**      | ✅   | Kanban + list view of tasks and plans |
| **Agents**     | 🤖   | Agent/steward registry, create new    |
| **Workspaces** | 💻   | Terminal multiplexer                  |
| **Workflows**  | 📋   | Workflow templates (playbooks)        |
| **Metrics**    | 📈   | Analytics and cost tracking           |
| ---            | ---  | ---                                   |
| **Settings**   | ⚙️   | Configuration (bottom of sidebar)     |

### Header Elements

- Logo/brand (left)
- Notification bell with badge count + dropdown (right)
- User menu (right)

Note: No project filter needed - all projects in a workspace are combined.

### Command Palette (Cmd+K)

Covers **all major pages and actions**:

**Navigation**:

- Go to Activity / Tasks / Agents / Workspaces / Workflows / Metrics / Settings

**Task Actions**:

- Create task
- Search tasks by title/ID
- View task by ID
- Assign task to agent

**Agent Actions**:

- Create agent / steward
- Start/stop/restart agent
- Open agent in workspace
- Send message to Director

**Workflow Actions**:

- Create workflow
- Pour playbook
- Search playbooks

**Quick Filters**:

- Show running agents
- Show stuck agents
- Show unassigned tasks

---

## Page Specifications

### 1. Activity (Home)

**Purpose**: Real-time feed of all orchestrator events with live agent output

**Layout**:

```
┌────────────────────────────────────────┐
│  [Filters: All | Tasks | Agents | ...]  │
├────────────────────────────────────────┤
│  ┌──────────────────────────────────┐  │
│  │ 🤖 worker-alice        ● Running │  │
│  │ Task: Implement login form       │  │
│  │ ┌──────────────────────────────┐ │  │
│  │ │ > Reading src/auth/login.ts  │ │  │
│  │ │ > Adding email validation... │ │  │ ← Live truncated output
│  │ │ > _                          │ │  │
│  │ └──────────────────────────────┘ │  │
│  │ [View] [Open in Workspace]       │  │
│  └──────────────────────────────────┘  │
│                                        │
│  ┌──────────────────────────────────┐  │
│  │ ⚙️ merge-steward       ✓ Done    │  │
│  │ Merged branch: feat/login        │  │
│  │ 3 files changed, +142 -23        │  │
│  │ 5 min ago                        │  │
│  └──────────────────────────────────┘  │
│                                        │
│  [Load more...]                        │
└────────────────────────────────────────┘
```

**Features**:

- Rich cards with agent avatar, status badge, task context
- **Real-time updating feed**: Each card shows truncated last few lines of agent output (updates live via WebSocket)
- Running agents show live output preview in a mini-terminal style block
- Completed events show summary (merged, completed task, etc.)
- Expandable cards for full output view
- "Open in Workspace" button adds agent to terminal multiplexer
- Click task name to navigate to task detail
- Auto-refresh with WebSocket (live mode)
- Infinite scroll for historical events

### 2. Tasks

**Purpose**: Manage tasks and plans (reuses components from Elemental web)

**Layout**: Toggle between Kanban and List views

**Kanban View** (reuse TaskKanban from @elemental/ui):

```
┌─────────┬─────────┬───────────┬─────────┬─────────┐
│Unassigned│Assigned│In Progress│  Done   │ Merged  │
├─────────┼─────────┼───────────┼─────────┼─────────┤
│ [Task]  │ [Task]  │  [Task]   │ [Task]  │ [Task]  │
│ [Task]  │         │  [Task]   │         │         │
│         │         │           │         │         │
└─────────┴─────────┴───────────┴─────────┴─────────┘
```

**Task Card** (extend TaskCard from @elemental/ui):

- Title, status badge
- Assigned agent (avatar + name) or "Unassigned"
- Branch name (if assigned)
- Priority indicator
- Drag to reassign (to agent or status column)

**List View** (reuse TaskList from @elemental/ui):

- Sortable columns: Title, Status, Agent, Priority, Updated
- Bulk actions: assign, change status, delete
- Quick filters: by agent, status

**Plans Tab** (reuse PlanList, PlanDetail from @elemental/ui):

- Active plans
- Progress bars (tasks completed / total)
- Expand to see child tasks

Note: Workflow templates and playbooks are managed in the **Workflows** page, not here.

### 3. Agents

**Purpose**: View, manage, and create agents and stewards

**Layout**:

```
┌────────────────────────────────────────┐
│  [Tab: Agents] [Tab: Stewards]         │
│  [+ Create Agent]  [+ Create Steward]  │
├────────────────────────────────────────┤
│  Director                              │
│  ┌──────────────────────────────────┐  │
│  │ 👔 director • Running            │  │
│  │ Session: abc123 • 2h uptime      │  │
│  │ [Open Terminal] [Restart]        │  │
│  └──────────────────────────────────┘  │
│                                        │
│  Persistent Workers                    │
│  ┌──────────────────────────────────┐  │
│  │ 🔧 architect • Running           │  │
│  │ Task: Design auth system         │  │
│  │ [Open Workspace] [Stop]          │  │
│  └──────────────────────────────────┘  │
│                                        │
│  Ephemeral Workers (3 active)          │
│  ┌──────────────────────────────────┐  │
│  │ ⚡ worker-001 • Running          │  │
│  │ Task: Fix login bug              │  │
│  │ Branch: agent/worker-001/T-123   │  │
│  │ [View Stream] [Add to Workspace] │  │
│  └──────────────────────────────────┘  │
└────────────────────────────────────────┘
```

**Create Agent Dialog**:

- Name, role (worker), mode (ephemeral/persistent)
- Capabilities (skills, languages)
- System prompt (optional, uses default if blank)

**Create Steward Dialog**:

- Name, focus (merge/health/ops/reminder)
- Trigger: cron schedule OR event conditions
- Associated workflow (optional)

**Stewards Tab**:

- List of configured stewards
- Focus type (merge, health, ops, reminder)
- Trigger info (cron schedule or event)
- Last run, next scheduled
- [Configure] [Run Now] [Disable] actions

**Agent Actions**:

- Start/Stop/Restart
- View session history
- Open in Workspace (adds to terminal multiplexer)
- View assigned tasks
- Edit configuration

### 4. Workspaces (Terminal Multiplexer)

**Purpose**: Tmux-like interface for managing multiple agent sessions

**Layout**:

```
┌─────────────────────────────────────────────────────────┐
│  [+ Add Pane] [Layout: ═ ║ ⊞] [Save Layout] [Presets ▼] │
├────────────────────────┬────────────────────────────────┤
│                        │                                │
│  architect             │  worker-001                    │
│  ───────────────────   │  ─────────────────────────     │
│  > Working on auth...  │  {"type":"assistant",...}      │
│  > Created entity...   │  {"type":"tool_use",...}       │
│  > _                   │  {"type":"tool_result",...}    │
│                        │                                │
│  [input box]           │  [input box]                   │
│                        │                                │
├────────────────────────┼────────────────────────────────┤
│                        │                                │
│  worker-002            │  worker-003                    │
│  ─────────────────     │  ─────────────────────────     │
│  (stream output)       │  (stream output)               │
│                        │                                │
└────────────────────────┴────────────────────────────────┘
```

**Features**:

- **Pane management**: Add, remove, resize, drag-drop to reorganize
- **Layout presets**: Single, vertical split, horizontal split, grid
- **Two pane types**:
  - **Interactive terminal** (persistent workers): Full xterm.js PTY
  - **Stream viewer** (ephemeral workers): JSON stream rendered as terminal-like output with input box

**Pane header**:

- Agent name + status indicator
- Current task (if any)
- [Maximize] [Close] [Pop Out] buttons

**Stream viewer for ephemeral workers**:

- Renders stream-json events with syntax highlighting
- `assistant` messages shown as chat bubbles
- `tool_use` / `tool_result` shown as collapsible blocks
- Input box at bottom for sending messages

**Persistence**:

- Layout saved to localStorage
- Panes restored on page reload
- Named layout presets (saveable)

### 5. Workflows

**Purpose**: Create, manage, and instantiate workflow templates (playbooks)

**Layout**:

```
┌────────────────────────────────────────┐
│  [Tab: Templates] [Tab: Active]        │
│  [+ Create Workflow] [Import YAML]     │
├────────────────────────────────────────┤
│  Templates                             │
│  ┌──────────────────────────────────┐  │
│  │ 📋 Feature Development           │  │
│  │ 5 steps • 2 variables            │  │
│  │ Last used: 2 days ago            │  │
│  │ [Pour] [Edit] [Export]           │  │
│  └──────────────────────────────────┘  │
│                                        │
│  ┌──────────────────────────────────┐  │
│  │ 📋 Bug Fix Workflow              │  │
│  │ 3 steps • 1 variable             │  │
│  │ Last used: 5 hours ago           │  │
│  │ [Pour] [Edit] [Export]           │  │
│  └──────────────────────────────────┘  │
└────────────────────────────────────────┘
```

**Active Tab** (running workflows):

- Shows poured/instantiated workflows
- Progress bars (tasks completed / total)
- Expand to see child tasks
- [Cancel] [Pause] actions

**Pour Flow** (instantiate playbook):

1. Click [Pour] → modal opens
2. Fill in variable values
3. Preview generated tasks
4. [Create Workflow] → creates plan + tasks
5. Redirect to Active tab showing new workflow

**Workflow Editor**:

- Visual step builder (drag to reorder)
- Step form: title, description, assignee pattern, dependencies
- Variable definitions with defaults
- YAML preview/export
- Import from YAML file

### 6. Metrics

**Purpose**: Analytics, performance tracking, cost monitoring

**Layout**:

```
┌────────────────────────────────────────┐
│  [Time Range: Last 24h ▼]              │
├────────────────────────────────────────┤
│  ┌─────────┐ ┌─────────┐ ┌─────────┐  │
│  │  $42.50 │ │   23    │ │   4     │  │
│  │  Cost   │ │ Tasks   │ │ Agents  │  │
│  │  today  │ │completed│ │ active  │  │
│  └─────────┘ └─────────┘ └─────────┘  │
│                                        │
│  ┌──────────────────────────────────┐  │
│  │  [Task throughput chart]         │  │
│  │  ~~~~~~~~~~~~~~~~~~~~~~~~        │  │
│  └──────────────────────────────────┘  │
│                                        │
│  ┌──────────────────────────────────┐  │
│  │  [Agent activity sparklines]     │  │
│  │  architect: ▁▂▄▆▇▅▃▂            │  │
│  │  worker-001: ▃▄▅▆▇▆▄▃           │  │
│  └──────────────────────────────────┘  │
│                                        │
│  Budget: $150/day  [████████░░] 80%   │
│  [Configure Budget]                    │
└────────────────────────────────────────┘
```

**Sections**:

- Summary cards (cost, tasks, agents)
- Task throughput over time
- Agent activity sparklines
- Merge success rate
- Budget tracking with alerts
- Export options (CSV, JSON)

### 7. Settings

**Purpose**: User preferences and workspace configuration

**Layout**:

```
┌────────────────────────────────────────┐
│  [Tab: Preferences] [Tab: Workspace]   │
├────────────────────────────────────────┤
│  Appearance                            │
│  ┌──────────────────────────────────┐  │
│  │ Theme: [Light ▼] [Dark] [System] │  │
│  └──────────────────────────────────┘  │
│                                        │
│  Notifications                         │
│  ┌──────────────────────────────────┐  │
│  │ ☑ Desktop notifications          │  │
│  │ ☑ Sound for critical events      │  │
│  │   Volume: [████░░░░░░]           │  │
│  │ ☑ Toast notifications            │  │
│  └──────────────────────────────────┘  │
│                                        │
│  Keyboard Shortcuts                    │
│  ┌──────────────────────────────────┐  │
│  │ Command palette: ⌘K              │  │
│  │ Toggle Director: ⌘D              │  │
│  │ [View all shortcuts]             │  │
│  └──────────────────────────────────┘  │
└────────────────────────────────────────┘
```

**Workspace Tab**:

- Budget limits and alerts
- Default agent configurations
- Ephemeral task retention period
- Steward schedules

---

## Director Terminal Panel (Right Sidebar)

**Always visible on desktop** (collapsible to icon)

The Director panel is a **full xterm terminal**, not a custom chat UI. This provides:

- Consistent experience with Workspaces page
- Full terminal capabilities (scrollback, copy/paste, etc.)
- Native Claude Code CLI experience

```
┌─────────────────────────┐
│  Director      [−] [×]  │
│  ● Running • 2h         │
├─────────────────────────┤
│                         │
│  $ claude               │
│  > You: Create a login  │
│  form with email valid- │
│  ation                  │
│                         │
│  I'll break this down   │
│  into tasks and assign  │
│  them to workers...     │
│                         │
│  [Creating task T-001]  │
│  [Assigning to worker-  │
│   alice]                │
│                         │
│  > _                    │
│                         │
└─────────────────────────┘
```

**Features**:

- Full xterm.js terminal (same as Workspaces)
- Session status indicator in header
- Resize handle on left edge (300-600px width)
- Collapse to icon (terminal icon with activity indicator)
- [−] minimize, [×] collapse to icon
- Scrollback buffer for history

---

## Notification System

### Toast Notifications

- Appear bottom-right
- Auto-dismiss after 5s (configurable)
- Types: info, success, warning, error
- Click to navigate to relevant item
- Stack up to 3, then collapse to count

### Header Notification Center

```
┌─────────────────────────────┐
│  🔔 Notifications (3)       │
├─────────────────────────────┤
│  ⚠️ worker-002 stuck        │
│     No output for 10 min    │
│     [View] [Nudge]          │
├─────────────────────────────┤
│  ⚡ Merge conflict          │
│     feat/login → main       │
│     [Resolve]               │
├─────────────────────────────┤
│  💰 Budget warning          │
│     80% of daily limit      │
│     [View Metrics]          │
├─────────────────────────────┤
│  [Mark all read]            │
└─────────────────────────────┘
```

---

## Responsive Breakpoints

| Breakpoint  | Layout Changes                                |
| ----------- | --------------------------------------------- |
| ≥1280px     | Three-column, expanded sidebar                |
| 1024-1279px | Three-column, collapsed sidebar icons         |
| 768-1023px  | Two-column, Director as overlay               |
| <768px      | Single column, bottom nav, full-screen modals |

### Mobile Adaptations

- **Activity**: Cards stack vertically, swipe to dismiss
- **Tasks**: List view only (no kanban on mobile)
- **Workspaces**: Single pane with tab switcher
- **Director**: Full-screen modal with back button

---

## Component Library Requirements

### From @elemental/ui (shared) - Extracted from apps/web

**Primitives** (`@elemental/ui/primitives`):

- Button, Card, Dialog, Input, Select, Tooltip, Badge, Avatar, Tabs, Toggle
- TagInput, Checkbox, RadioGroup, Dropdown, Popover

**Layout** (`@elemental/ui/layout`):

- AppShell, Sidebar, Header, MainContent
- ThemeProvider (light/dark/system)

**Domain Components** (`@elemental/ui/domain`) - MUST REUSE:

- `task/`: TaskCard, TaskList, TaskDetail, TaskForm, TaskKanban
- `plan/`: PlanCard, PlanList, PlanDetail, PlanProgress
- `message/`: MessageList, MessageInput, MessageBubble, ChannelView
- `document/`: DocumentEditor (TipTap), DocumentViewer
- `entity/`: EntityBadge, EntityList, EntityInbox, EntityHierarchy

**Visualizations** (`@elemental/ui/visualizations`):

- Timeline, StatusDashboard, DependencyGraph, Sparkline

**Hooks** (`@elemental/ui/hooks`):

- useWebSocket, useRealtimeEvents, useKeyboardShortcuts
- useTheme, useCommandPalette

### Orchestrator-specific (in @elemental/orchestrator-web only)

**Terminal Components**:

- XtermPane - Full PTY terminal for interactive agents
- StreamViewer - JSON stream renderer for ephemeral agents
- PaneManager - Split/resize/drag-drop pane management
- LayoutPresets - Saved layout configurations

**Agent Components**:

- AgentCard - Extended EntityBadge with session status
- AgentStatusBadge - Running/Stopped/Stuck indicators
- DirectorTerminalPanel - Right sidebar terminal wrapper
- AgentStreamOverlay - Tool use/result rendering in messages

**Workspace Components**:

- WorkspaceGrid - Terminal multiplexer container
- PaneHeader - Agent name, status, actions
- PaneControls - Maximize, close, pop-out buttons

**Metrics Components**:

- CostTracker - Budget display and alerts
- AgentSparklines - Per-agent activity charts
- ThroughputChart - Tasks over time

---

## Implementation Priority: Tracer Bullets

Following the "tracer bullet" approach from The Pragmatic Programmer: each bullet is a small, full-stack slice that can be verified immediately. After each bullet, use **Claude in Chrome** or **Playwright** to verify the UI works as expected.

### TB-UI-01: Three-Column Layout Shell

**Build**: AppShell with left sidebar, main content area, right panel placeholder
**Verify**: Navigate to app, see three-column layout, sidebar collapses on click

### TB-UI-02: Sidebar Navigation

**Build**: Sidebar with all nav items (Activity, Tasks, Agents, Workspaces, Workflows, Metrics, Settings)
**Verify**: Click each nav item, URL changes, active state highlights

### TB-UI-03: Director Terminal Panel

**Build**: Right panel with xterm.js, resize handle, collapse/expand
**Verify**: See terminal, type commands, resize panel, collapse to icon, expand back

### TB-UI-04: Activity Page - Basic

**Build**: Activity route with placeholder cards, WebSocket connection
**Verify**: Navigate to Activity, see placeholder cards, WebSocket connects

### TB-UI-05: Activity Page - Live Output

**Build**: Activity cards with real-time truncated agent output
**Verify**: Start an agent, see card appear with live output updating

### TB-UI-06: Agents Page - List

**Build**: Agents page with tabs (Agents/Stewards), list of registered agents
**Verify**: See Director and any workers, status badges update

### TB-UI-07: Agents Page - Create

**Build**: [+ Create Agent] and [+ Create Steward] dialogs
**Verify**: Open dialogs, fill forms, submit, new agent appears in list

### TB-UI-08: Tasks Page - Kanban

**Build**: Tasks page with kanban view (reuse TaskKanban from @elemental/ui)
**Verify**: See tasks in columns, drag task to different column

### TB-UI-09: Tasks Page - List Toggle

**Build**: Toggle button to switch to list view
**Verify**: Click toggle, view switches to list, click again, back to kanban

### TB-UI-10: Workspaces Page - Basic

**Build**: Workspaces page with pane management, add/remove panes
**Verify**: Add pane, see empty pane appear, remove pane

### TB-UI-11: Workspaces Page - Xterm

**Build**: Xterm panes for persistent workers
**Verify**: Add pane, select worker, see terminal with live output

### TB-UI-12: Workspaces Page - Stream Viewer

**Build**: Stream viewer panes for ephemeral workers
**Verify**: Add pane, select ephemeral worker, see JSON stream rendered

### TB-UI-13: Workspaces Page - Layout

**Build**: Split/resize/drag-drop pane management, layout presets
**Verify**: Resize panes, drag to reorder, save layout, reload page, layout persists

### TB-UI-14: Workflows Page - Templates

**Build**: Workflows page with template list
**Verify**: See list of playbooks, click one to see details

### TB-UI-15: Workflows Page - Pour

**Build**: Pour dialog with variable input, task preview
**Verify**: Click Pour, fill variables, see preview, create workflow

### TB-UI-16: Workflows Page - Active

**Build**: Active tab showing running workflows with progress
**Verify**: Pour a workflow, switch to Active tab, see progress bar

### TB-UI-17: Metrics Page

**Build**: Metrics page with summary cards, charts
**Verify**: See cost, task count, agent activity sparklines

### TB-UI-18: Command Palette

**Build**: Cmd+K palette with navigation and actions
**Verify**: Press Cmd+K, type "agents", select, navigate to Agents page

### TB-UI-19: Notifications

**Build**: Header bell with dropdown, toast system
**Verify**: Trigger event (stuck agent), see toast, see notification in dropdown

### TB-UI-20: Settings Page

**Build**: Settings page with theme toggle, notification preferences
**Verify**: Toggle dark mode, theme changes, toggle audio notifications

### TB-UI-21: Responsive - Tablet

**Build**: Tablet breakpoint (768-1023px)
**Verify**: Resize to tablet width, sidebar collapses, Director panel becomes overlay

### TB-UI-22: Responsive - Mobile

**Build**: Mobile breakpoint (<768px)
**Verify**: Resize to mobile width, bottom nav appears, Director is full-screen modal

---

### Verification Strategy

After each tracer bullet:

1. **Manual verification** (Claude in Chrome):
   - Navigate to the feature
   - Perform the expected interactions
   - Confirm visual appearance matches spec

2. **Automated verification** (Playwright):
   - Write test for critical user flows
   - Run test, confirm passes
   - Add to CI pipeline

3. **Feedback loop**:
   - If verification fails, fix before proceeding
   - Update spec if requirements change
   - Document any deviations

---

## Design Decisions (Resolved)

1. **Theme**: Light/dark mode toggle, defaults to system preference
2. **Audio**: Optional sound alerts for critical events (stuck agents, conflicts, budget warnings). Configurable in settings.
3. **Multi-window**: Future consideration (not v1)
4. **Recording/replay**: Future consideration (not v1)

---

## Component Reuse from Elemental Web

**Critical**: The orchestrator-web app should import and reuse these existing components from `@elemental/ui` (extracted from `apps/web`):

### Must Reuse (not rebuild)

| Component          | Source                              | Usage in Orchestrator               |
| ------------------ | ----------------------------------- | ----------------------------------- |
| **TaskCard**       | `apps/web/src/components/task/`     | Tasks/Plans page, activity feed     |
| **TaskList**       | `apps/web/src/components/task/`     | Tasks/Plans page (list view)        |
| **TaskDetail**     | `apps/web/src/components/task/`     | Task detail modal/page              |
| **PlanCard**       | `apps/web/src/components/plan/`     | Plans section                       |
| **PlanDetail**     | `apps/web/src/components/plan/`     | Plan progress view                  |
| **MessageList**    | `apps/web/src/components/message/`  | Director chat, agent messages       |
| **MessageInput**   | `apps/web/src/components/message/`  | Director chat input                 |
| **DocumentEditor** | `apps/web/src/components/document/` | Playbook editing, task descriptions |
| **DocumentViewer** | `apps/web/src/components/document/` | View task content                   |
| **EntityInbox**    | `apps/web/src/components/entity/`   | Agent inbox, notifications          |
| **EntityBadge**    | `apps/web/src/components/entity/`   | Agent avatars, assignee display     |

### Orchestrator-Specific Extensions

The orchestrator adds metadata overlays to these shared components:

- **TaskCard + Agent badge**: Show assigned agent, branch, worktree status
- **MessageList + Stream events**: Render tool_use/tool_result blocks
- **EntityInbox + Agent messages**: Inter-agent communication display

### Component Extension Pattern

```tsx
// In orchestrator-web, extend shared components:
import { TaskCard } from "@elemental/ui";

function OrchestratorTaskCard({ task, ...props }) {
  return (
    <TaskCard task={task} {...props}>
      {/* Orchestrator-specific slot content */}
      <AgentBadge agent={task.assignee} />
      <BranchTag branch={task.metadata?.branch} />
    </TaskCard>
  );
}
```

---

## Mapping to specs/STAGE_2_PLAN Tracer Bullets

This UI/UX plan introduces **TB-UI-xx** tracer bullets that complement the existing TB-O-xx bullets from specs/STAGE_2_PLAN.md:

| UI Tracer Bullet   | Related Backend TB | Integration Point                       |
| ------------------ | ------------------ | --------------------------------------- |
| TB-UI-01, TB-UI-02 | TB-O15             | Orchestrator Web Scaffold               |
| TB-UI-03           | TB-O9, TB-O10      | Agent Process Spawner + Session Manager |
| TB-UI-04, TB-UI-05 | TB-O13, TB-O25     | WebSocket Channel + Activity Feed       |
| TB-UI-06, TB-UI-07 | TB-O7, TB-O16      | Agent Registry + Agent List Page        |
| TB-UI-08, TB-UI-09 | TB-O18             | Task List Page                          |
| TB-UI-10-13        | TB-O17 (extended)  | Terminal Multiplexer (new)              |
| TB-UI-14-16        | TB-O32-35          | Playbook UI + Workflow Creation         |
| TB-UI-17           | TB-O42-43          | Metrics + Cost Tracking                 |
| TB-UI-18           | New                | Command Palette                         |
| TB-UI-19           | New                | Notification System                     |
| TB-UI-20           | New                | Settings Page                           |
| TB-UI-21-22        | New                | Responsive Design                       |

### New Backend Dependencies

These UI features require new or extended backend support:

**TB-O-NEW-1: Agent Output Streaming to Activity Feed**

- Stream truncated agent output via WebSocket
- Activity cards subscribe to agent channels
- Aggregate events for historical view

**TB-O-NEW-2: Layout Persistence API**

- Store workspace layouts per user
- Endpoint: GET/PUT /api/user/layouts

**TB-O-NEW-3: Notification Event System**

- Server-side event classification (info/warning/error)
- WebSocket channel for notifications
- Persistence for notification history

---

## Summary

The orchestrator UI is designed around:

1. **Activity feed as home** - Live stream with real-time agent output previews
2. **Director terminal always accessible** - xterm in right panel for coordination
3. **Terminal multiplexer for workers** - Tmux-like workspace management with split panes
4. **Component reuse** - Tasks, Plans, Messages, Documents from Elemental web
5. **Tracer bullet implementation** - 22 small, verifiable UI slices
6. **Full responsiveness** - Works on all devices
7. **Power user features** - Command palette (Cmd+K), keyboard shortcuts

### Key Architectural Decisions

- **Separate apps**: @elemental/web and @elemental/orchestrator-web share @elemental/ui
- **xterm everywhere**: Director panel and Workspaces use xterm.js, not custom chat
- **No project filter**: All projects in workspace are combined, no switcher needed
- **Tight feedback loops**: Every tracer bullet verified with Claude in Chrome or Playwright

This creates a command-center experience while remaining approachable for new users through progressive disclosure.

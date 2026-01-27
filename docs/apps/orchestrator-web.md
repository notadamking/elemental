# Orchestrator Web App

The Orchestrator Web App is the web interface for the Elemental Orchestrator platform. It provides a three-column layout for managing AI agents, viewing activity, and interacting with the Director agent.

## Overview

- **Package**: `@elemental/orchestrator-web`
- **Location**: `apps/orchestrator-web/`
- **Port**: 5174 (development)
- **Technology Stack**: Vite, React 19, TanStack Router, TanStack Query, Tailwind CSS

## Features

### Three-Column Layout

1. **Left Sidebar**: Navigation with expandable sections
   - Overview (Activity)
   - Work (Tasks, Workflows)
   - Orchestration (Agents, Workspaces)
   - Analytics (Metrics)
   - Settings

2. **Main Content Area**: Route-based pages for each feature

3. **Right Director Panel**: Collapsible terminal panel for the Director agent

### Pages

| Route | Description |
|-------|-------------|
| `/activity` | Real-time feed of agent events and updates |
| `/tasks` | Task management with agent assignments |
| `/agents` | Agent and steward management |
| `/workspaces` | Terminal multiplexer for agent sessions |
| `/workflows` | Workflow templates and active workflows |
| `/metrics` | Performance analytics and health monitoring |
| `/settings` | User preferences and workspace configuration |

### Theme Support

- Light, Dark, and System themes
- Theme toggle in header
- Theme persisted to localStorage

### Responsive Design

- Mobile: Sidebar as drawer, simplified header
- Tablet: Collapsed sidebar
- Desktop: Full sidebar and director panel

## Development

### Setup

```bash
# From monorepo root
cd apps/orchestrator-web
npm install
```

### Running

```bash
# Development server (port 5174)
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

### Testing

```bash
# Run Playwright tests
npm run test

# Run tests with UI
npm run test:ui
```

### Type Checking

```bash
npm run typecheck
```

## Architecture

### Dependencies

- **@tanstack/react-router**: File-based routing with typed routes
- **@tanstack/react-query**: Server state management
- **@radix-ui/***: Accessible UI primitives (Dialog, Dropdown, Select, Tooltip)
- **@xterm/xterm**: Terminal emulator for Director panel
- **@xterm/addon-fit**: Auto-resize xterm to container
- **@xterm/addon-web-links**: Clickable links in terminal
- **lucide-react**: Icon library
- **sonner**: Toast notifications

### Directory Structure

```
apps/orchestrator-web/
├── src/
│   ├── components/
│   │   ├── layout/
│   │   │   ├── AppShell.tsx      # Main layout wrapper
│   │   │   ├── Sidebar.tsx       # Navigation sidebar
│   │   │   ├── DirectorPanel.tsx # Right terminal panel with xterm.js
│   │   │   └── MobileDrawer.tsx  # Mobile sidebar overlay
│   │   ├── terminal/
│   │   │   ├── XTerminal.tsx     # xterm.js terminal component
│   │   │   └── index.ts          # Terminal exports
│   │   ├── agent/
│   │   │   ├── AgentCard.tsx     # Agent display card
│   │   │   ├── AgentStatusBadge.tsx # Status indicator
│   │   │   └── AgentRoleBadge.tsx # Role badge
│   │   └── ui/
│   │       ├── Tooltip.tsx       # Tooltip component
│   │       └── ThemeToggle.tsx   # Theme switcher
│   ├── routes/
│   │   ├── activity/             # Activity page
│   │   ├── tasks/                # Tasks page
│   │   ├── agents/               # Agents page
│   │   ├── workspaces/           # Workspaces page
│   │   ├── workflows/            # Workflows page
│   │   ├── metrics/              # Metrics page
│   │   └── settings/             # Settings page
│   ├── styles/
│   │   └── tokens.css            # Design tokens
│   ├── index.css                 # Global styles
│   ├── main.tsx                  # Entry point
│   └── router.tsx                # Route configuration
├── tests/
│   ├── scaffold.spec.ts          # Scaffold Playwright tests
│   ├── agents.spec.ts            # Agent page tests
│   └── director-terminal.spec.ts # Director terminal tests
├── package.json
├── vite.config.ts
├── tsconfig.json
└── playwright.config.ts
```

## Completed Features

The following tracer bullets have been implemented:

- **TB-O15**: Orchestrator Web Scaffold - Three-column layout with routing
- **TB-O16**: Agent List Page - View and manage agents with status badges
- **TB-O17**: Director Terminal Panel - Interactive xterm terminal for Director agent

## Future Work

The following tracer bullets will add functionality:

- **TB-O17a**: Terminal Multiplexer - Tmux-like interface for agent sessions
- **TB-O18**: Orchestrator Task List Page - Task management with orchestrator metadata
- **TB-O25**: Activity Feed - Real-time WebSocket event stream
- **TB-O43**: Metrics Dashboards - Performance charts

## Related Documentation

- [STAGE_2_PLAN.md](../../specs/STAGE_2_PLAN.md) - Full implementation plan
- [STAGE_2_WEB_UI.md](../../specs/STAGE_2_WEB_UI.md) - Detailed UI/UX specifications
- [Orchestrator API](../api/orchestrator-api.md) - SDK API documentation

<p align="center">
  <h1 align="center">Elemental</h1>
  <p align="center">
    <strong>A foundational platform for building multi-agent coordination systems</strong>
  </p>
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#packages">Packages</a> •
  <a href="#architecture">Architecture</a> •
  <a href="#documentation">Documentation</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT">
  <img src="https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg" alt="Node.js: >=18.0.0">
  <img src="https://img.shields.io/badge/bun-supported-orange.svg" alt="Bun: supported">
  <img src="https://img.shields.io/badge/TypeScript-5.0+-blue.svg" alt="TypeScript: 5.0+">
  <img src="https://img.shields.io/badge/React-19-61dafb.svg" alt="React: 19">
</p>

---

## What is Elemental?

Elemental is a **multi-agent orchestration platform** designed for developers building AI agent systems. It provides a complete foundation for coordinating autonomous agents, including task management, event sourcing, process spawning, and real-time communication.

**Key differentiators:**

- **Event-sourced data layer** with complete audit trail and time-travel reconstruction
- **Dual storage model**: SQLite for fast queries, JSONL for Git-friendly persistence and merge
- **Full orchestration system** for AI agents with automatic dispatch and worktree isolation
- **CLI-first design** with comprehensive command-line interface alongside web dashboards

---

## Features

| Feature | Description |
|---------|-------------|
| **Multi-Agent Orchestration** | Directors, workers (ephemeral & persistent), and stewards with automatic task dispatch |
| **Event Sourcing** | Complete audit trail for all changes with event history and time-travel |
| **Dual Storage Model** | SQLite cache for speed, JSONL source of truth for Git-friendly sync |
| **Type-Safe Core** | Branded IDs, comprehensive TypeScript types, and strict validation |
| **Dependency Management** | Blocking relationships, gates, parent-child hierarchies, priority propagation |
| **Semantic Search** | FTS5 keyword search + vector embeddings with hybrid ranking (RRF) |
| **Real-time Updates** | WebSocket and SSE streaming for live event feeds |
| **Rich UI Library** | React 19 components with design tokens, charts, and domain-specific cards |
| **Cryptographic Identity** | Ed25519 signing for secure multi-agent authentication |
| **CLI-First** | Full-featured `el` command for all operations |

---

## Quick Start

### Prerequisites

- **Node.js 18+** or **Bun** (any recent version)

### Installation

```bash
# Clone the repository
git clone https://github.com/notadamking/elemental.git
cd elemental

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Link the CLI globally (optional)
cd packages/sdk && pnpm link --global
```

### Initialize & Create Your First Task

```bash
# Initialize a workspace
el init

# Create a task
el create task --title "Implement user authentication"

# List tasks
el list task

# View ready tasks (no blockers)
el ready

# Update task status
el update el-abc123 --status in_progress

# Add a dependency
el dep add el-task1 blocks el-task2

# View dependency tree
el dep tree el-task1

# Export to JSONL for Git sync
el export
```

---

## Architecture

### Package Dependency Graph

```
┌─────────────────────────────────────────────────────────────┐
│                  @elemental/orchestrator-sdk                 │
│       Agent orchestration, spawning, sessions, prompts       │
└────────────────────────────┬────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────┐
│                       @elemental/sdk                         │
│        ElementalAPI, services, sync, CLI, identity           │
└────────────────────────────┬────────────────────────────────┘
                             │
          ┌──────────────────┼──────────────────┐
          │                  │                  │
┌─────────▼─────────┐  ┌─────▼─────┐  ┌────────▼────────┐
│  @elemental/core  │  │ @elemental │  │ @elemental/ui   │
│  Types & IDs      │  │  /storage  │  │ React components│
└───────────────────┘  └───────────┘  └─────────────────┘
```

### Dual Storage Model

```
┌─────────────────────────────────────────────────────────────┐
│                         SQLite                               │
│  • Fast queries with indexes                                 │
│  • Full-text search (FTS5)                                   │
│  • Materialized views (blocked cache)                        │
│  • Ephemeral — rebuilt from JSONL on sync                    │
└────────────────────────────┬────────────────────────────────┘
                             │ sync
┌────────────────────────────▼────────────────────────────────┐
│                         JSONL                                │
│  • Git-tracked, append-only                                  │
│  • Source of truth for all durable data                      │
│  • Human-readable, diff-friendly                             │
│  • Mergeable across branches                                 │
└─────────────────────────────────────────────────────────────┘
```

**Key Principle:** SQLite is the **cache**, JSONL is the **source of truth**.

---

## Packages

| Package | Description | Key Exports |
|---------|-------------|-------------|
| [`@elemental/core`](packages/core) | Shared types, errors, ID generation | `ElementType`, `Task`, `Entity`, `Document`, `ErrorCode` |
| [`@elemental/storage`](packages/storage) | SQLite backends (Bun, Node, Browser) | `createStorage`, `initializeSchema`, `StorageBackend` |
| [`@elemental/sdk`](packages/sdk) | Core API, services, sync, CLI | `ElementalAPI`, `SyncService`, `InboxService`, CLI commands |
| [`@elemental/orchestrator-sdk`](packages/orchestrator-sdk) | Agent orchestration | `OrchestratorAPI`, `SpawnerService`, `SessionManager` |
| [`@elemental/ui`](packages/ui) | React 19 component library | `Button`, `Card`, `TaskCard`, `EntityCard`, charts, hooks |
| [`@elemental/shared-routes`](packages/shared-routes) | HTTP route factories | `createElementsRoutes`, `createEntityRoutes`, etc. |

---

## Applications

| App | Default Port | Description |
|-----|--------------|-------------|
| [`server`](apps/server) | 3456 | Core Elemental API server |
| [`web`](apps/web) | 5173 | Element management dashboard |
| [`orchestrator-server`](apps/orchestrator-server) | 3457 | Agent orchestration API |
| [`orchestrator-web`](apps/orchestrator-web) | 5174 | Agent management dashboard |

---

## Agent Orchestration

Elemental provides a complete agent orchestration system with three agent types:

### Agent Roles

| Role | Session Type | Responsibilities |
|------|--------------|------------------|
| **Director** | Persistent | Creates tasks/plans, sets priorities, coordinates workers |
| **Worker (Ephemeral)** | Task-scoped | Executes assigned task in isolated worktree, shuts down on completion |
| **Worker (Persistent)** | Interactive | Works directly with human, responds in real-time |
| **Steward** | Workflow-scoped | Maintenance, merge review, health monitoring, cleanup |

### Dispatch Flow

```
┌──────────┐    creates    ┌──────────────────┐    dispatches    ┌─────────────┐
│ Director │───────────────│  Task (ready)    │─────────────────▶│   Worker    │
└──────────┘    tasks      └──────────────────┘    via daemon     └──────┬──────┘
                                                                         │
                                                           completes or hands off
                                                                         │
                                                                         ▼
                                                              ┌─────────────────┐
                                                              │    Steward      │
                                                              │  (merge review) │
                                                              └─────────────────┘
```

### Worktree Isolation

Workers operate in isolated Git worktrees:
- **Ephemeral workers:** `agent/{worker-name}/{task-id}-{slug}`
- **Persistent workers:** `agent/{worker-name}/session-{timestamp}`

See [Orchestration Architecture](docs/ORCHESTRATION_PLAN.md) for full details.

---

## API Usage

```typescript
import { ElementalAPI } from '@elemental/sdk';

// Create API instance
const api = await ElementalAPI.create({ rootDir: '.elemental' });

// Create a task
const task = await api.create({
  type: 'task',
  title: 'Implement feature X',
  priority: 2,
  createdBy: entityId,
});

// Query ready work (unblocked, open tasks)
const ready = await api.getReadyWork();

// Add a dependency
await api.addDependency({
  blockerId: prerequisiteTask.id,
  blockedId: task.id,
  type: 'blocks',
});

// Search documents with hybrid ranking
const results = await api.searchDocuments({
  query: 'authentication flow',
  mode: 'hybrid',
  limit: 10,
});
```

---

## CLI Reference

<details>
<summary><strong>Workspace Management</strong></summary>

```bash
el init              # Initialize workspace
el doctor            # Check system health
el migrate           # Run database migrations
el stats             # Show workspace statistics
```

</details>

<details>
<summary><strong>Element Operations</strong></summary>

```bash
el create <type>     # Create element (task, document, entity)
el list [type]       # List elements with filtering
el show <id>         # Show element details
el update <id>       # Update element fields
el delete <id>       # Soft-delete an element
```

</details>

<details>
<summary><strong>Task Commands</strong></summary>

```bash
el ready             # List ready tasks
el blocked           # List blocked tasks with reasons
el close <id>        # Close a task
el reopen <id>       # Reopen a closed task
el assign <id> <ent> # Assign task to entity
el defer <id>        # Defer a task
el undefer <id>      # Remove deferral
```

</details>

<details>
<summary><strong>Dependency Commands</strong></summary>

```bash
el dep add <src> <type> <tgt>    # Add dependency
el dep remove <src> <type> <tgt> # Remove dependency
el dep list <id>                 # List dependencies
el dep tree <id>                 # Show dependency tree
```

</details>

<details>
<summary><strong>Sync Commands</strong></summary>

```bash
el export            # Export to JSONL
el import            # Import from JSONL
el status            # Show sync status
```

</details>

<details>
<summary><strong>Search & Embeddings</strong></summary>

```bash
el search <query>           # Search elements
el embeddings index         # Index all documents
el embeddings reindex       # Rebuild embedding index
```

</details>

See [CLI Reference](docs/reference/cli.md) for complete documentation.

---

## Core Types

| Type | Description | Key Fields |
|------|-------------|------------|
| **Task** | Work item with status, priority, assignments | `status`, `priority`, `assignedTo`, `dueDate` |
| **Entity** | Actor in the system (human or agent) | `name`, `role`, `publicKey` |
| **Document** | Content with versioning | `title`, `content`, `contentType`, `version` |
| **Plan** | Collection of related tasks | `title`, `tasks[]`, `status` |
| **Workflow** | Multi-step process template | `steps[]`, `triggers` |
| **Channel** | Communication channel | `name`, `members[]`, `type` |
| **Message** | Communication in a channel | `content`, `sender`, `channelId` |

---

## Documentation

| Resource | Description |
|----------|-------------|
| [docs/README.md](docs/README.md) | LLM-optimized documentation index |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Architecture deep-dive |
| [docs/ORCHESTRATION_PLAN.md](docs/ORCHESTRATION_PLAN.md) | Agent orchestration system |
| [docs/reference/](docs/reference) | API and service reference |
| [docs/how-to/](docs/how-to) | Task-oriented guides |
| [docs/explanation/](docs/explanation) | Conceptual documentation |
| [docs/GOTCHAS.md](docs/GOTCHAS.md) | Common pitfalls and solutions |

---

## Development

### Setup

```bash
# Clone the repository
git clone https://github.com/notadamking/elemental.git
cd elemental

# Install dependencies (uses pnpm)
pnpm install

# Start all services in development mode
pnpm dev

# Or start just the platform (server + web)
pnpm dev:platform
```

### Commands

```bash
pnpm build      # Build all packages
pnpm test       # Run all tests
pnpm lint       # Lint all packages
pnpm typecheck  # Type-check all packages
pnpm clean      # Clean all build artifacts
```

### Monorepo Structure

```
elemental/
├── packages/
│   ├── core/              # @elemental/core
│   ├── storage/           # @elemental/storage
│   ├── sdk/               # @elemental/sdk
│   ├── orchestrator-sdk/  # @elemental/orchestrator-sdk
│   ├── ui/                # @elemental/ui
│   └── shared-routes/     # @elemental/shared-routes
├── apps/
│   ├── server/            # Core API server
│   ├── web/               # Element dashboard
│   ├── orchestrator-server/  # Orchestration API
│   └── orchestrator-web/     # Agent dashboard
├── docs/                  # Documentation
└── .elemental/            # Project data directory
```

---

## Contributing

Contributions are welcome. Please open an issue to discuss proposed changes before submitting a pull request.

---

## License

MIT

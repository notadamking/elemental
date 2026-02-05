# AGENTS.md

Context and instructions for AI coding agents working on the Elemental repository.

## Quick Start

**Start by reading `docs/README.md`** for file paths and navigation tables.

| I need...                  | Go to                                |
| -------------------------- | ------------------------------------ |
| File paths for any concept | `docs/README.md` (File Map tables)   |
| Core type details          | `docs/reference/core-types.md`       |
| API usage                  | `docs/reference/elemental-api.md`    |
| CLI commands               | `docs/reference/cli.md`              |
| Critical pitfalls          | `docs/GOTCHAS.md`                    |
| Architecture overview      | `docs/ARCHITECTURE.md`               |
| Agent orchestration        | `docs/reference/orchestrator-api.md` |

---

## Repository Structure

```
packages/
├── core/              # @elemental/core - types, errors, ID generation
├── storage/           # @elemental/storage - SQLite backends (Bun, Node, Browser)
├── sdk/               # @elemental/sdk - ElementalAPI, services, sync, CLI
├── ui/                # @elemental/ui - React components, hooks, design tokens
├── shared-routes/     # @elemental/shared-routes - HTTP route factories
└── orchestrator-sdk/  # @elemental/orchestrator-sdk - agent orchestration

apps/
├── server/            # Platform HTTP + WebSocket (port 3456)
├── web/               # Platform React SPA (port 5173)
├── orchestrator-server/  # Orchestrator API (port 3457)
└── orchestrator-web/     # Orchestrator dashboard (port 5174)

docs/                  # Diátaxis documentation (primary reference for agents)
.elemental/            # Project data (elements.db, elements.jsonl, config.yaml)
```

### Package Dependency Graph

```
@elemental/core        (shared types, no dependencies)
       ↓
@elemental/storage     (SQLite backends)
       ↓
@elemental/sdk         (API, services, sync, CLI)
       ↓
@elemental/orchestrator-sdk  (agent orchestration)
```

---

## Core Concepts

### Element Types

- **Core Types**: Task, Message, Document, Entity
- **Collection Types**: Plan, Workflow, Playbook, Channel, Library, Team
- **All inherit from Element** (id, type, timestamps, tags, metadata, createdBy)

### Dual Storage Model

- **SQLite**: Fast queries, indexes, FTS - the **cache**
- **JSONL**: Git-tracked, append-only - the **source of truth**

### Dependencies

- **Blocking types**: `blocks`, `awaits`, `parent-child` - affect task status
- **Non-blocking**: `relates-to`, `mentions`, `references` - informational only
- `blocked` status is **computed** from dependencies, never set directly

### Agent Roles (Orchestrator)

- **Director**: Owns task backlog, spawns workers, makes strategic decisions
- **Worker**: Executes assigned tasks (ephemeral or persistent)
- **Steward**: Handles code merges, health checks, maintenance

---

## Development Workflow

### Build & Test

```bash
bun install           # Install dependencies
bun run build         # Build all packages
bun test              # Run test suite
bun test --watch      # Watch mode
```

### CLI Usage

```bash
el ready              # List ready tasks
el blocked            # List blocked tasks
el show <id>          # Show element details
el create task --title "..." --priority 3 --type feature
el dep add --type=blocks <blocked-id> <blocker-id>
el close <id> --reason "..."
el stats              # View progress stats
```

### Running Apps

```bash
bun run --filter @elemental/server dev       # Platform server (port 3456)
bun run --filter @elemental/web dev          # Platform web (port 5173)
bun run --filter @elemental/orchestrator-server dev  # Orchestrator (port 3457)
bun run --filter @elemental/orchestrator-web dev     # Orchestrator UI (port 5174)
```

---

## Critical Gotchas

See `docs/GOTCHAS.md` for the complete list. **Top 10 for agents:**

1. **`blocked` is computed** - Never set `status: 'blocked'` directly; it's derived from dependencies
2. **`blocks` direction** - `el dep add --type=blocks A B` means A is blocked BY B (B completes first)
3. **Messages need `contentRef`** - `sendDirectMessage()` requires a `DocumentId`, not raw text
4. **`sortByEffectivePriority()` mutates** - Returns same array reference, modifies in place
5. **SQLite is cache** - JSONL is the source of truth; SQLite can be rebuilt
6. **No auto cycle detection** - `api.addDependency()` doesn't check cycles; use `DependencyService.detectCycle()`
7. **FTS not indexed on import** - After `el import`, run `el doc reindex` to rebuild search index
8. **`relates-to` is bidirectional** - Query both directions: `getDependencies()` AND `getDependents()`
9. **Closed/tombstone always wins** - In merge conflicts, these statuses take precedence
10. **Server ports** - Platform: 3456, Orchestrator: 3457 (not 3000)

---

## Navigation Quick Reference

| I want to...                   | Key Files                                                           |
| ------------------------------ | ------------------------------------------------------------------- |
| Add a new core type            | `packages/core/src/types/`, `docs/how-to/add-core-type.md`          |
| Add an API endpoint            | `apps/server/src/index.ts`, `docs/how-to/add-api-endpoint.md`       |
| Add a React component          | `packages/ui/src/components/`, `docs/how-to/add-react-component.md` |
| Work with dependencies         | `packages/sdk/src/services/dependency.ts`                           |
| Understand task status         | `packages/core/src/types/task.ts`                                   |
| Configure identity/signing     | `packages/sdk/src/systems/identity.ts`                              |
| Work with the Orchestrator API | `packages/orchestrator-sdk/src/api/orchestrator-api.ts`             |
| Customize agent prompts        | `.elemental/prompts/`, `docs/how-to/customize-agent-prompts.md`     |
| Debug sync issues              | `packages/sdk/src/sync/service.ts`                                  |
| Add a CLI command              | `packages/sdk/src/cli/commands/`                                    |

---

## Implementation Guidelines

### Type Safety

- Use branded types: `ElementId`, `TaskId`, `EntityId`, `DocumentId`
- Implement type guards: `isTask()`, `isElement()`, etc.
- Use `asEntityId()`, `asElementId()` casts only at trust boundaries

### Storage Operations

- All mutations through `ElementalAPI` - never modify SQLite directly
- Dirty tracking marks elements for incremental export
- Content hashing enables merge conflict detection

### Testing

- Tests colocated with source: `*.test.ts` next to `*.ts`
- Integration tests use real SQLite (`:memory:` or temp files)
- Run `bun test <path>` for specific tests

### Error Handling

- Use `ElementalError` with appropriate `ErrorCode`
- CLI formats errors based on output mode (standard, verbose, quiet)

---

## Agent Orchestration Overview

The orchestrator manages AI agent lifecycles for multi-agent task execution:

```
Director → creates tasks, assigns priorities → dispatches to Workers
Workers  → execute tasks in git worktrees → update status, handoff
Stewards → merge completed work, health checks, cleanup
```

**Key Services:**

- `OrchestratorAPI` - Agent registration and management
- `DispatchService` - Task assignment with inbox notifications
- `SpawnerService` - Process spawning (headless/interactive modes)
- `SessionManager` - Agent session lifecycle tracking

**Prompts:** Built-in prompts in `packages/orchestrator-sdk/src/prompts/`, override with `.elemental/prompts/`

---

## Commit Guidelines

- Create commits after completing features, refactors, or significant changes
- Only commit files you changed
- Use conventional commit format: `feat:`, `fix:`, `chore:`, `docs:`

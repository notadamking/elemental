# AGENTS.md

Context and instructions for AI coding agents working on the Elemental repository.

## Documentation

**IMPORTANT:** Start with `docs/README.md` for file paths and quick reference.

- **`docs/`** is the primary documentation for AI agents - concise, file-path-centric, optimized for minimal context usage
- **`specs/`** contains historical design rationale and detailed specifications for humans who want background

### Quick Reference

| I need... | Go to |
|-----------|-------|
| File paths for any concept | `docs/README.md` (File Map tables) |
| How to add a feature | `docs/platform/README.md` (Quick Tasks) |
| Core type details | `docs/core/types.md` |
| API usage | `docs/api/elemental-api.md` |
| CLI commands | `docs/api/cli.md` |
| Critical pitfalls | `docs/gotchas.md` |
| Design rationale | `specs/README.md` |

---

## Project Overview

Elemental is a TypeScript library providing primitive abstractions for organizing and orchestrating work. It serves as a complete memory system for teams of AI agents with humans in the loop.

### Core Concepts

- **Elements**: Base data type with shared properties (id, type, timestamps, tags, metadata, createdBy)
- **Core Types**: Task, Message, Document, Entity
- **Collection Types**: Plan, Workflow, Playbook, Channel, Library, Team
- **Dependencies**: Relationships between elements (blocking, associative, attribution, threading)
- **Dual Storage**: SQLite for fast queries, JSONL as git-tracked source of truth

### Key Design Principles

- Element-based architecture where everything inherits from Element
- Hash-based IDs for collision-resistant concurrent multi-agent creation
- Immutable messages that cannot be altered after creation
- Full version history for documents
- Hybrid identity (soft local identity by default, optional cryptographic signing)

---

## Repository Structure

```
src/
├── types/           # TypeScript type definitions (Task, Entity, Message, etc.)
├── api/             # ElementalAPI implementation (elemental-api.ts)
├── storage/         # SQLite backends (Bun, Node.js, Browser)
├── services/        # Business logic (dependency, blocked-cache, inbox, priority)
├── cli/             # CLI runner and formatting
│   └── commands/    # Individual command implementations (44 files)
├── id/              # Hash-based ID generation
├── sync/            # JSONL export/import/merge
├── systems/         # Identity system (Ed25519 signing)
├── config/          # Configuration loading and validation
├── errors/          # Error codes and factories
├── http/            # HTTP sync handlers
├── utils/           # Utilities (mentions parsing)
└── bin/             # CLI entry point (el.ts)

apps/
├── server/          # Hono HTTP server + WebSocket
│   └── src/
│       ├── index.ts # Server entry (all endpoints)
│       └── ws/      # WebSocket broadcaster, handler, types
└── web/             # React SPA
    └── src/
        ├── routes/  # Page components
        ├── components/ # UI components
        ├── api/hooks/  # TanStack Query hooks
        └── hooks/   # Custom React hooks

specs/               # Historical design specifications
```

---

## Workflow

### Quick Reference

| Action             | Command                                                               |
| ------------------ | --------------------------------------------------------------------- |
| List ready tasks   | `el ready`                                                            |
| List blocked tasks | `el blocked`                                                          |
| Show task          | `el show <id>`                                                        |
| Assign task        | `el assign <task-id> <entity-id>`                                     |
| Close task         | `el close <id> --reason "..."`                                        |
| Create task        | `el create task --title "..." --priority <1-5> --type <feature\|bug>` |
| Add dependency     | `el dep add --type=blocks <source> <target>`                          |
| View progress      | `el stats` or `el show <plan-id>`                                     |

### Running Tests

- Use `bun test` to run the test suite
- Tests are colocated with source files or in the `tests/` directory
- Integration tests use real SQLite databases

### Building

- Use `bun run build` to compile TypeScript
- CLI entry point: `dist/bin/el.js` (`el` is symlinked)

### Creating Tasks

When you discover work that needs to be done, create a task for it:

```bash
el create task --title "<description>" --priority <1-5> --type <feature|bug|task|chore> --tag <tag>
```

### Adding Dependencies

When a task depends on another:

```bash
el dep add --type=blocks <source-id> <target-id>
```

This means `source-id` is blocked by `target-id` (target must complete first).

### Notes

- Specs are in `specs/` — task notes reference them
- Priority: 1=critical, 2=high, 3=medium, 4=low, 5=minimal
- Claim tasks before starting to prevent conflicts
- Task tracking has moved from markdown checklists to elemental's task system
- The implementation checklist in `specs/PLAN.md` is now for historical reference only

### CLI Usage

- Primary command: `el` (alias: `elemental`)
- View ready tasks: `el ready`
- Common commands: `init`, `create`, `list`, `show`, `update`, `delete`
- Task operations: `ready`, `blocked`, `close`, `reopen`, `assign`, `defer`
- Dependencies: `dep add`, `dep remove`, `dep list`, `dep tree`
- Sync: `export`, `import`, `status`

---

## Implementation Guidelines

### When Adding New Features

1. Check if a spec exists in `specs/` for the feature
2. Follow the types and interfaces defined in the spec
3. Add validators and type guards following existing patterns
4. Include unit / property-based tests alongside the implementation
5. Update the spec's implementation checklist when complete

### Type Safety

- Use branded types for IDs (ElementId, TaskId, etc.)
- Implement type guards (`isTask`, `isElement`, etc.)
- Add validators that throw `ElementalError` with appropriate codes
- Follow the validation rules in `specs/api/errors.md`

### Storage Operations

- All mutations go through the ElementalAPI
- Dirty tracking marks elements for incremental export
- Content hashing enables merge conflict detection
- Blocked cache optimizes ready-work queries

### Error Handling

- Use `ElementalError` with appropriate `ErrorCode`
- Handle SQLite errors via `mapStorageError`
- CLI formats errors based on output mode (standard, verbose, quiet)

---

## Key Specifications Reference

| Topic        | Primary Spec                    | Description                                    |
| ------------ | ------------------------------- | ---------------------------------------------- |
| Base types   | `specs/types/element.md`        | Element interface, ID format, timestamps       |
| Tasks        | `specs/types/task.md`           | Task status, priority, complexity, hydration   |
| Dependencies | `specs/systems/dependencies.md` | Blocking types, cycle detection, blocked cache |
| Storage      | `specs/systems/storage.md`      | SQLite schema, backends, dirty tracking        |
| Identity     | `specs/systems/identity.md`     | Soft identity, Ed25519 signing                 |
| Query API    | `specs/api/query-api.md`        | CRUD operations, filters, hydration            |
| CLI          | `specs/api/cli.md`              | Commands, flags, output formatting             |
| Sync         | `specs/api/sync.md`             | JSONL format, merge strategy                   |
| Errors       | `specs/api/errors.md`           | Error codes, validation rules                  |

---

**IMPORTANT:**

- Always follow the Development Workflow
- Any time a feature, refactor, or significant code change has been completed you MUST create a commit
- Only commit the files you changed

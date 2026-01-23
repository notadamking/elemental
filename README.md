# Elemental

A foundational library for building agent coordination systems. Elemental provides a robust, SQLite-backed storage layer for managing tasks, documents, entities, and their relationships.

## Features

- **Multi-runtime support**: Works with both Node.js (18+) and Bun
- **Type-safe Elements**: Tasks, Documents, Plans, Entities, and Messages with branded IDs
- **Dependency Management**: Track blocking relationships, parent-child hierarchies, and gate conditions
- **Event Sourcing**: Complete audit trail with event history for all changes
- **JSONL Sync**: Export/import data in JSONL format for Git-based collaboration
- **CLI Tool**: Full-featured command-line interface for managing elements

## Installation

### Using npm (Node.js)

```bash
npm install -g @elemental/cli

# Or run directly with npx
npx @elemental/cli --help
```

### Using Bun

```bash
bun add -g @elemental/cli

# Or run directly with bunx
bunx @elemental/cli --help
```

## Quick Start

```bash
# Initialize a workspace
el init

# Create a task
el create task --title "Implement user authentication"

# List tasks
el list task

# Show task details
el show el-abc123

# Update task status
el update el-abc123 --status in_progress

# Add a dependency
el dep add el-task1 blocks el-task2

# View ready tasks (no blockers)
el ready

# Export to JSONL for sync
el export

# Check system health
el doctor
```

## CLI Commands

### Workspace Management
- `el init` - Initialize a new Elemental workspace
- `el doctor` - Check system health and diagnose issues
- `el migrate` - Run database migrations
- `el stats` - Show workspace statistics

### Element Operations
- `el create <type>` - Create a new element (task, document, entity)
- `el list [type]` - List elements with filtering
- `el show <id>` - Show element details
- `el update <id>` - Update element fields
- `el delete <id>` - Soft-delete an element

### Task Commands
- `el ready` - List tasks ready for work
- `el blocked` - List blocked tasks with reasons
- `el close <id>` - Close a task
- `el reopen <id>` - Reopen a closed task
- `el assign <id> <entity>` - Assign task to an entity
- `el defer <id>` - Defer a task
- `el undefer <id>` - Remove deferral

### Dependency Commands
- `el dep add <source> <type> <target>` - Add dependency
- `el dep remove <source> <type> <target>` - Remove dependency
- `el dep list <id>` - List dependencies
- `el dep tree <id>` - Show dependency tree

### Sync Commands
- `el export` - Export elements to JSONL
- `el import` - Import elements from JSONL
- `el status` - Show sync status

### Entity Commands
- `el entity register` - Register a new entity
- `el entity list` - List all entities

### History
- `el history <id>` - Show event history for an element

## API Usage

```typescript
import { createStorage, initializeSchema, createElementalAPI } from '@elemental/cli';

// Create storage backend (auto-detects Bun vs Node.js)
const storage = createStorage({ path: './data.db' });
initializeSchema(storage);

// Create API instance
const api = createElementalAPI(storage);

// Create a task
const task = await api.create({
  type: 'task',
  title: 'My Task',
  status: 'open',
  priority: 3,
  createdBy: 'user:alice',
});

// Query tasks
const readyTasks = await api.getReadyWork();
const blockedTasks = await api.getBlockedWork();

// Add dependencies
await api.addDependency(task.id, 'blocks', otherTask.id);
```

## Requirements

- **Node.js**: 18.0.0 or higher (for `crypto.subtle`)
- **Bun**: Any recent version (uses native SQLite)

## License

MIT

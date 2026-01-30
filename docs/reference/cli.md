# CLI Reference

**Entry point:** `packages/sdk/src/bin/el.ts`
**Commands:** `packages/sdk/src/cli/commands/`

## Installation

```bash
# From project root
bun link

# Or use directly
bun packages/sdk/src/bin/el.ts
```

## Global Flags

| Flag | Description |
|------|-------------|
| `--help, -h` | Show help |
| `--json` | Output as JSON |
| `--quiet, -q` | Minimal output |
| `--verbose, -v` | Verbose output |
| `--actor <name>` | Specify acting entity |
| `--db <path>` | Override database path |

## Basic Commands

| Command | Description |
|---------|-------------|
| `el init` | Initialize .elemental directory |
| `el help` | Show help |
| `el version` | Show version |
| `el stats` | Show statistics |
| `el whoami` | Show current actor |

## CRUD Commands

| Command | Description |
|---------|-------------|
| `el create <type>` | Create element |
| `el list <type>` | List elements |
| `el show <id>` | Show element details |
| `el update <id>` | Update element |
| `el delete <id>` | Delete element |

```bash
# Create task
el create task --title "Fix bug" --priority 2 --type bug

# List tasks
el list task --status open

# Show element
el show abc123

# Update element
el update abc123 --status closed

# Delete element
el delete abc123
```

## Task Commands

| Command | Description |
|---------|-------------|
| `el ready` | List ready (unblocked, open) tasks |
| `el blocked` | List blocked tasks |
| `el close <id>` | Close task |
| `el reopen <id>` | Reopen task |
| `el assign <task> <entity>` | Assign task |
| `el defer <id>` | Defer task |
| `el undefer <id>` | Remove deferral |

```bash
# List ready tasks
el ready

# Close with reason
el close abc123 --reason "Fixed in commit xyz"

# Assign task
el assign abc123 worker-1
```

## Dependency Commands

| Command | Description |
|---------|-------------|
| `el dep add` | Add dependency |
| `el dep remove` | Remove dependency |
| `el dep list <id>` | List dependencies |
| `el dep tree <id>` | Show dependency tree |

```bash
# Add blocking dependency
# A is blocked BY B (B must complete first)
el dep add --type=blocks A B

# Remove dependency
el dep remove A B --type=blocks

# List dependencies
el dep list abc123 --direction out    # Outgoing
el dep list abc123 --direction in     # Incoming
el dep list abc123 --direction both   # Both

# Show tree
el dep tree abc123
```

**Warning:** `el dep add --type=blocks A B` means A is blocked BY B.

## Entity Commands

| Command | Description |
|---------|-------------|
| `el entity register <name>` | Register new entity |
| `el entity list` | List entities |
| `el entity set-manager <entity> <manager>` | Set manager |
| `el entity clear-manager <entity>` | Clear manager |
| `el entity reports <manager>` | Get direct reports |
| `el entity chain <entity>` | Get management chain |

## Document Commands

| Command | Description |
|---------|-------------|
| `el doc create` | Create document |
| `el doc list` | List documents |
| `el doc show <id>` | Show document |
| `el doc history <id>` | Show version history |
| `el doc rollback <id> <version>` | Rollback to version |

## Plan Commands

| Command | Description |
|---------|-------------|
| `el plan create` | Create plan |
| `el plan list` | List plans |
| `el plan show <id>` | Show plan details |
| `el plan activate <id>` | Activate plan |
| `el plan complete <id>` | Mark completed |
| `el plan cancel <id>` | Cancel plan |
| `el plan add-task <id> <task>` | Add task to plan |
| `el plan remove-task <id> <task>` | Remove task |
| `el plan tasks <id>` | List tasks in plan |

## Workflow Commands

| Command | Description |
|---------|-------------|
| `el workflow pour <playbook>` | Instantiate from playbook |
| `el workflow list` | List workflows |
| `el workflow show <id>` | Show details |
| `el workflow tasks <id>` | List tasks |
| `el workflow progress <id>` | Show progress |
| `el workflow burn <id>` | Delete ephemeral |
| `el workflow squash <id>` | Promote to durable |
| `el workflow gc` | Garbage collect |

```bash
# Instantiate workflow
el workflow pour my-playbook --var name=value

# Garbage collect (default 7 days)
el workflow gc --days 14
```

## Inbox Commands

| Command | Description |
|---------|-------------|
| `el inbox list` | List inbox items |
| `el inbox read <id>` | Mark as read |
| `el inbox read-all` | Mark all as read |
| `el inbox unread <id>` | Mark as unread |
| `el inbox archive <id>` | Archive item |
| `el inbox count` | Count unread |

## Channel Commands

| Command | Description |
|---------|-------------|
| `el channel create` | Create channel |
| `el channel list` | List channels |
| `el channel join <id>` | Join channel |
| `el channel leave <id>` | Leave channel |
| `el channel members <id>` | List members |
| `el channel add <ch> <entity>` | Add member |
| `el channel remove <ch> <entity>` | Remove member |

## Message Commands

| Command | Description |
|---------|-------------|
| `el msg send` | Send message |
| `el msg thread <id>` | Reply in thread |
| `el msg list` | List messages |

## Team Commands

| Command | Description |
|---------|-------------|
| `el team create` | Create team |
| `el team list` | List teams |
| `el team add <team> <entity>` | Add member |
| `el team remove <team> <entity>` | Remove member |
| `el team members <id>` | List members |

## Playbook Commands

| Command | Description |
|---------|-------------|
| `el playbook list` | List playbooks |
| `el playbook show <name>` | Show details |
| `el playbook validate <file>` | Validate |
| `el playbook create <file>` | Create new |

## Sync Commands

| Command | Description |
|---------|-------------|
| `el export` | Export to JSONL |
| `el import <file>` | Import from JSONL |
| `el status` | Show sync status |

```bash
# Export dirty elements
el export

# Full export
el export --full

# Import
el import backup.jsonl

# Force import (remote always wins)
el import backup.jsonl --force
```

## Config Commands

| Command | Description |
|---------|-------------|
| `el config show [key]` | Show config |
| `el config set <path> <value>` | Set value |
| `el config unset <path>` | Remove key |
| `el config edit` | Open in editor |

```bash
el config show
el config show actor
el config set actor my-agent
el config unset actor
```

## Identity Commands

| Command | Description |
|---------|-------------|
| `el identity whoami` | Show current identity |
| `el identity keygen` | Generate keypair |
| `el identity sign <data>` | Sign data |
| `el identity verify <sig> <data>` | Verify signature |
| `el identity hash <data>` | Compute hash |
| `el identity mode [mode]` | Show/set mode |

## Admin Commands

| Command | Description |
|---------|-------------|
| `el doctor` | Database health check |
| `el migrate` | Run migrations |

```bash
# Health check
el doctor -v

# Dry run migrations
el migrate --dry-run
```

## History Command

```bash
el history <id> [options]

Options:
  --type <type>      Filter by event type
  --actor <name>     Filter by actor
  --after <date>     Events after date
  --before <date>    Events before date
  --format <fmt>     Output format (timeline/table)
```

## CLI Plugins

The CLI supports plugins to extend functionality. Plugins can register new commands and aliases.

### Plugin Discovery

Plugins are discovered from two sources:

1. **Known packages** - First-party packages like `@elemental/orchestrator-sdk` are auto-discovered if installed
2. **Config-based** - User-specified packages in `.elemental/config.yaml`

```yaml
# .elemental/config.yaml
plugins:
  packages:
    - my-custom-plugin
    - @company/internal-tools
```

### Creating a Plugin

A plugin must export a `cliPlugin` object:

```typescript
// my-plugin/src/index.ts
import type { CLIPlugin } from '@elemental/sdk/cli';

export const cliPlugin: CLIPlugin = {
  name: 'my-plugin',
  version: '1.0.0',
  commands: [myCommand],
  aliases: {
    'shortcut': 'my-command subcommand',
  },
};
```

### Plugin Precedence

- Built-in commands always take priority over plugin commands
- If multiple plugins define the same command, the first loaded wins
- Conflicts are logged as warnings in verbose mode

## Orchestrator Commands (Plugin)

These commands are provided by `@elemental/orchestrator-sdk`:

### Agent Commands

| Command | Description |
|---------|-------------|
| `el agent list` | List registered agents |
| `el agent show <id>` | Show agent details |
| `el agent register <name>` | Register a new agent |
| `el agent spawn <id>` | Spawn a Claude Code process for an agent |
| `el agent start <id>` | Start an agent session (metadata only) |
| `el agent stop <id>` | Stop an agent session (metadata only) |
| `el agent stream <id>` | Get agent channel for streaming |

```bash
# List all agents
el agent list

# List workers only
el agent list --role worker

# Register a worker agent
el agent register MyWorker --role worker --mode ephemeral

# Register a director
el agent register MainDirector --role director

# Register a steward
el agent register HealthChecker --role steward --focus health

# Spawn an agent (actually starts a Claude Code process)
el agent spawn el-abc123

# Spawn with interactive mode (PTY)
el agent spawn el-abc123 --mode interactive

# Spawn with initial prompt
el agent spawn el-abc123 --prompt "Start working on your assigned tasks"

# Resume a previous Claude session
el agent spawn el-abc123 --resume previous-session-id

# Start/stop session metadata (doesn't spawn process)
el agent start el-abc123
el agent stop el-abc123

# Get channel for agent messages
el agent stream el-abc123
```

### Dispatch Commands

| Command | Description |
|---------|-------------|
| `el dispatch <task> <agent>` | Dispatch task to specific agent |
| `el dispatch smart <task>` | Smart dispatch to best available agent |

```bash
# Dispatch task to specific agent
el dispatch el-task123 el-agent1

# Dispatch with branch assignment
el dispatch el-task123 el-agent1 --branch feature/my-task

# Smart dispatch (auto-select best agent)
el dispatch smart el-task123

# Smart dispatch with options
el dispatch smart el-task123 --branch feature/task
```

## Short IDs

The CLI supports short IDs (minimum unique prefix):

```bash
# Full ID
el show el-a1b2c3d4e5f6

# Short ID (if unique)
el show a1b2
```

## Priority Values

| Value | Level |
|-------|-------|
| 1 | Critical |
| 2 | High |
| 3 | Medium |
| 4 | Low |
| 5 | Minimal |

## JSON Output

Use `--json` for machine-readable output:

```bash
el list task --status open --json | jq '.[] | .title'
```

## Examples

```bash
# Create and assign a task
el create task --title "Implement auth" --priority 2 --type feature
el assign abc123 worker-1

# Add blocking dependency
el dep add --type=blocks task1 task2

# Check ready tasks
el ready

# Close with reason
el close abc123 --reason "Completed"

# Export changes
el export

# Show sync status
el status
```

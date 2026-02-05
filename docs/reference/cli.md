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
| `el task describe <id>` | Set or show task description |

```bash
# List ready tasks
el ready

# Close with reason
el close abc123 --reason "Fixed in commit xyz"

# Assign task
el assign abc123 worker-1

# Set task description
el task describe el-abc123 --content "Implement login feature"
el task describe el-abc123 --file description.md

# Show task description
el task describe el-abc123 --show
```

#### task describe

Set or show a task's description. Descriptions are stored as versioned documents.

| Option | Description |
|--------|-------------|
| `-c, --content <text>` | Description content (inline) |
| `-f, --file <path>` | Read description from file |
| `-s, --show` | Show current description instead of setting |
| `-a, --append` | Append to existing description instead of replacing |

```bash
# Set description inline
el task describe el-abc123 --content "Implement the login feature with OAuth support"

# Set description from file
el task describe el-abc123 --file specs/login.md

# Show current description
el task describe el-abc123 --show

# Append to existing description
el task describe el-abc123 --append --content "Additional implementation notes"
el task describe el-abc123 -a -f additional-notes.md
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

**Semantics:** `el dep add --type=blocks A B` means A (blocked) is blocked BY B (blocker).

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
| `el doc search <query>` | Full-text search documents |
| `el doc show <id>` | Show document |
| `el doc update <id>` | Update document content (creates new version) |
| `el doc history <id>` | Show version history |
| `el doc rollback <id> <version>` | Rollback to version |
| `el doc archive <id>` | Archive document |
| `el doc unarchive <id>` | Unarchive document |
| `el doc reindex` | Reindex documents for FTS5 search |

```bash
# Create document with category
el doc create --title "API Spec" --category spec

# List documents (active only by default)
el doc list
el doc list --category spec
el doc list --status archived
el doc list --all                    # Include archived

# Full-text search documents
el doc search "API authentication"
el doc search "migration" --category spec
el doc search "config" --limit 5

# Update document content (creates new version)
el doc update el-doc123 --content "Updated content"
el doc update el-doc123 --file updated-spec.md

# Archive / unarchive
el doc archive abc123
el doc unarchive abc123

# Reindex FTS5
el doc reindex
```

#### doc update

Update a document's content, creating a new version. Documents are versioned - each update preserves history.

| Option | Description |
|--------|-------------|
| `-c, --content <text>` | New content (inline) |
| `-f, --file <path>` | Read new content from file |

```bash
el doc update el-doc123 --content "New content here"
el doc update el-doc123 --file path/to/updated.md
```

## Embeddings Commands

| Command | Description |
|---------|-------------|
| `el embeddings install` | Install local embedding model |
| `el embeddings status` | Show embedding model status |
| `el embeddings reindex` | Rebuild document embeddings |
| `el embeddings search <query>` | Semantic search over documents |

```bash
# Install the local embedding model
el embeddings install

# Check status
el embeddings status

# Rebuild embeddings index
el embeddings reindex

# Search documents by semantic similarity
el embeddings search "authentication flow"
```

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
| `el channel create` | Create channel (`--description, -D` to set description) |
| `el channel list` | List channels |
| `el channel join <id>` | Join channel |
| `el channel leave <id>` | Leave channel |
| `el channel members <id>` | List members |
| `el channel add <ch> <entity>` | Add member |
| `el channel remove <ch> <entity>` | Remove member |
| `el channel merge` | Merge two channels |

#### channel create

| Option | Description |
|--------|-------------|
| `-D, --description <text>` | Plain string description for the channel |

```bash
el channel create --name general --description "General discussion"
```

#### channel merge

Merge all messages from a source channel into a target channel. Both channels must be group channels. The source channel is archived after the merge.

```bash
el channel merge --source <id> --target <id> [--name <new-name>]
```

| Option | Description |
|--------|-------------|
| `-s, --source <id>` | Source channel ID (required) |
| `-t, --target <id>` | Target channel ID (required) |
| `-n, --name <new-name>` | Optional new name for the merged channel |

```bash
# Merge source into target
el channel merge --source el-ch111 --target el-ch222

# Merge and rename the target channel
el channel merge -s el-ch111 -t el-ch222 --name "combined-channel"
```

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
| `el agent start <id>` | Start a Claude Code process for an agent |
| `el agent stop <id>` | Stop an agent session |
| `el agent stream <id>` | Get agent channel for streaming |

#### agent list

List registered agents with optional filters.

| Option | Description |
|--------|-------------|
| `-r, --role <role>` | Filter by role: director, worker, steward |
| `-s, --status <status>` | Filter by session status: idle, running, suspended, terminated |
| `-m, --workerMode <mode>` | Filter by worker mode: ephemeral, persistent |
| `-f, --focus <focus>` | Filter by steward focus: merge, health, reminder, ops |
| `--reportsTo <id>` | Filter by manager entity ID |
| `--hasSession` | Filter to agents with active sessions |

```bash
el agent list
el agent list --role worker
el agent list --role worker --workerMode ephemeral
el agent list --status running
el agent list --role steward --focus health
el agent list --hasSession
```

#### agent register

Register a new orchestrator agent.

| Option | Description |
|--------|-------------|
| `-r, --role <role>` | Agent role: director, worker, steward (required) |
| `-m, --mode <mode>` | Worker mode: ephemeral, persistent (default: ephemeral) |
| `-f, --focus <focus>` | Steward focus: merge, health, reminder, ops |
| `-t, --maxTasks <n>` | Maximum concurrent tasks (default: 1) |
| `--tags <tags>` | Comma-separated tags |
| `--reportsTo <id>` | Manager entity ID (for workers/stewards) |
| `--roleDef <id>` | Role definition document ID |
| `--trigger <cron>` | Steward cron trigger (e.g., "0 2 * * *") |

```bash
el agent register MyWorker --role worker --mode ephemeral
el agent register MainDirector --role director
el agent register HealthChecker --role steward --focus health
el agent register MyWorker --role worker --tags "frontend,urgent"
el agent register TeamWorker --role worker --reportsTo el-director123
el agent register DailyChecker --role steward --focus health --trigger "0 9 * * *"
```

#### agent start

Start a Claude Code process for an agent.

| Option | Description |
|--------|-------------|
| `-p, --prompt <text>` | Initial prompt to send to the agent |
| `-m, --mode <mode>` | Start mode: headless, interactive |
| `-r, --resume <id>` | Resume a previous Claude session |
| `-w, --workdir <path>` | Working directory for the agent |
| `--cols <n>` | Terminal columns for interactive mode (default: 120) |
| `--rows <n>` | Terminal rows for interactive mode (default: 30) |
| `--timeout <ms>` | Timeout in milliseconds (default: 120000) |
| `-e, --env <KEY=VALUE>` | Environment variable to set |
| `-t, --taskId <id>` | Task ID to assign to this agent |
| `--stream` | Stream agent output after starting |

```bash
el agent start el-abc123
el agent start el-abc123 --mode interactive
el agent start el-abc123 --mode interactive --cols 160 --rows 40
el agent start el-abc123 --prompt "Start working on your assigned tasks"
el agent start el-abc123 --resume previous-session-id
el agent start el-abc123 --workdir /path/to/project
el agent start el-abc123 --env MY_VAR=value
el agent start el-abc123 --taskId el-task456
el agent start el-abc123 --stream
```

#### agent stop

Stop an agent session.

| Option | Description |
|--------|-------------|
| `-g, --graceful` | Graceful shutdown (default: true) |
| `--no-graceful` | Force immediate shutdown |
| `-r, --reason <text>` | Reason for stopping the agent |

```bash
el agent stop el-abc123
el agent stop el-abc123 --reason "Task completed"
el agent stop el-abc123 --no-graceful
```

#### agent stream

Get the channel ID for an agent to stream messages.

```bash
el agent stream el-abc123
```

### Dispatch Commands

| Command | Description |
|---------|-------------|
| `el dispatch <task> <agent>` | Dispatch task to specific agent |
| `el dispatch smart <task>` | Smart dispatch to best available agent |

| Option | Description |
|--------|-------------|
| `-b, --branch <name>` | Git branch to assign |
| `-w, --worktree <path>` | Git worktree path |
| `-s, --session <id>` | Session ID (for dispatch) |
| `-m, --markAsStarted` | Mark the task as started after dispatch |

```bash
# Dispatch task to specific agent
el dispatch el-task123 el-agent1

# Dispatch with branch assignment
el dispatch el-task123 el-agent1 --branch feature/my-task

# Dispatch and mark as started
el dispatch el-task123 el-agent1 --markAsStarted

# Smart dispatch (auto-select best agent)
el dispatch smart el-task123

# Smart dispatch with options
el dispatch smart el-task123 --branch feature/task
```

### Orchestrator Task Commands

| Command | Description |
|---------|-------------|
| `el task handoff <id>` | Hand off task to another agent |
| `el task complete <id>` | Complete task and create merge request |
| `el task merge <id>` | Mark task as merged and close it |
| `el task reject <id>` | Mark merge as failed and reopen task |

#### task merge

Mark a task as merged and close it.

| Option | Description |
|--------|-------------|
| `-s, --summary <text>` | Summary of the merge |

```bash
el task merge el-abc123
el task merge el-abc123 --summary "All tests passing"
```

#### task reject

Mark a task merge as failed and reopen it.

| Option | Description |
|--------|-------------|
| `-r, --reason <text>` | Reason for rejection (required) |
| `-m, --message <text>` | Handoff message for next worker |

```bash
el task reject el-abc123 --reason "Tests failed"
el task reject el-abc123 --reason "Tests failed" --message "Fix flaky test in auth.test.ts"
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

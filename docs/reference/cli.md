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

| Flag                | Description            |
| ------------------- | ---------------------- |
| `--help, -h`        | Show help              |
| `--json`            | Output as JSON         |
| `--quiet, -q`       | Minimal output         |
| `--verbose, -v`     | Verbose output         |
| `--actor <name>`    | Specify acting entity  |
| `--from <name>`     | Alias for `--actor`    |
| `--db <path>`       | Override database path |

## Basic Commands

| Command      | Description                     |
| ------------ | ------------------------------- |
| `el init`    | Initialize .elemental directory |
| `el help`    | Show help                       |
| `el version` | Show version                    |
| `el stats`   | Show statistics                 |
| `el whoami`  | Show current actor              |

## CRUD Commands

| Command            | Description          |
| ------------------ | -------------------- |
| `el task create`   | Create task          |
| `el task list`     | List tasks           |
| `el show <id>`     | Show element details |
| `el update <id>`   | Update element       |
| `el delete <id>`   | Delete element       |

```bash
# Create task
el task create --title "Fix bug" --priority 2 --type bug

# Create task with description (creates a linked document)
el task create --title "Add login" -d "Implement OAuth login with Google and GitHub providers"

# List tasks
el task list --status open

# Show element
el show abc123

# Update element
el update abc123 --status closed

# Delete element
el delete abc123
```

## Task Commands

| Command                          | Description                        |
| -------------------------------- | ---------------------------------- |
| `el task ready`                  | List ready (unblocked, open) tasks |
| `el task blocked`                | List blocked tasks                 |
| `el task close <id>`             | Close task                         |
| `el task reopen <id>`            | Reopen task                        |
| `el task assign <task> <entity>` | Assign task                        |
| `el task defer <id>`             | Defer task                         |
| `el task undefer <id>`           | Remove deferral                    |
| `el task describe <id>`          | Set or show task description       |

```bash
# List ready tasks
el task ready

# Close with reason
el task close abc123 --reason "Fixed in commit xyz"

# Assign task
el task assign abc123 worker-1

# Set task description
el task describe el-abc123 --content "Implement login feature"
el task describe el-abc123 --file description.md

# Show task description
el task describe el-abc123 --show
```

#### task describe

Set or show a task's description. Descriptions are stored as versioned documents.

| Option                 | Description                                         |
| ---------------------- | --------------------------------------------------- |
| `-c, --content <text>` | Description content (inline)                        |
| `-f, --file <path>`    | Read description from file                          |
| `-s, --show`           | Show current description instead of setting         |
| `-a, --append`         | Append to existing description instead of replacing |

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

| Command                   | Description          |
| ------------------------- | -------------------- |
| `el dependency add`       | Add dependency       |
| `el dependency remove`    | Remove dependency    |
| `el dependency list <id>` | List dependencies    |
| `el dependency tree <id>` | Show dependency tree |

```bash
# Add blocking dependency
# A is blocked BY B (B must complete first)
el dependency add --type=blocks A B

# Remove dependency
el dependency remove A B --type=blocks

# List dependencies
el dependency list abc123 --direction out    # Outgoing
el dependency list abc123 --direction in     # Incoming
el dependency list abc123 --direction both   # Both

# Show tree
el dependency tree abc123
```

**Semantics:** `el dependency add --type=blocks A B` means A (blocked) is blocked BY B (blocker).

## Entity Commands

| Command                                    | Description          |
| ------------------------------------------ | -------------------- |
| `el entity register <name>`                | Register new entity  |
| `el entity list`                           | List entities        |
| `el entity set-manager <entity> <manager>` | Set manager          |
| `el entity clear-manager <entity>`         | Clear manager        |
| `el entity reports <manager>`              | Get direct reports   |
| `el entity chain <entity>`                 | Get management chain |

## Document Commands

| Command                               | Description                                   |
| ------------------------------------- | --------------------------------------------- |
| `el document create`                  | Create document                               |
| `el document list`                    | List documents                                |
| `el document search <query>`          | Full-text search documents                    |
| `el document show <id>`               | Show document                                 |
| `el document update <id>`             | Update document content (creates new version) |
| `el document history <id>`            | Show version history                          |
| `el document rollback <id> <version>` | Rollback to version                           |
| `el document archive <id>`            | Archive document                              |
| `el document unarchive <id>`          | Unarchive document                            |
| `el document reindex`                 | Reindex documents for FTS5 search             |

```bash
# Create document with category
el document create --title "API Spec" --category spec

# List documents (active only by default)
el document list
el document list --category spec
el document list --status archived
el document list --all                    # Include archived

# Full-text search documents
el document search "API authentication"
el document search "migration" --category spec
el document search "config" --limit 5

# Update document content (creates new version)
el document update el-doc123 --content "Updated content"
el document update el-doc123 --file updated-spec.md

# Archive / unarchive
el document archive abc123
el document unarchive abc123

# Reindex FTS5
el document reindex
```

#### document update

Update a document's content, creating a new version. Documents are versioned - each update preserves history.

| Option                 | Description                |
| ---------------------- | -------------------------- |
| `-c, --content <text>` | New content (inline)       |
| `-f, --file <path>`    | Read new content from file |

```bash
el document update el-doc123 --content "New content here"
el document update el-doc123 --file path/to/updated.md
```

## Embeddings Commands

| Command                        | Description                    |
| ------------------------------ | ------------------------------ |
| `el embeddings install`        | Install local embedding model  |
| `el embeddings status`         | Show embedding model status    |
| `el embeddings reindex`        | Rebuild document embeddings    |
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

| Command                           | Description                       |
| --------------------------------- | --------------------------------- |
| `el plan create`                  | Create plan (defaults to draft)   |
| `el plan list`                    | List plans                        |
| `el plan show <id>`               | Show plan details                 |
| `el plan activate <id>`           | Activate plan (enables dispatch)  |
| `el plan complete <id>`           | Mark completed                    |
| `el plan cancel <id>`             | Cancel plan                       |
| `el plan add-task <id> <task>`    | Add task to plan                  |
| `el plan remove-task <id> <task>` | Remove task                       |
| `el plan tasks <id>`              | List tasks in plan                |

### Draft Plan Workflow

Plans default to `draft` status. **Tasks in draft plans are NOT dispatchable** — the dispatch daemon will not assign them to workers. This prevents premature dispatch before dependencies are set.

```bash
# 1. Create plan (defaults to draft)
el plan create --title "Feature X"

# 2. Create tasks in the plan (not yet dispatchable)
el task create --title "Task 1" --plan "Feature X"
el task create --title "Task 2" --plan "Feature X"

# 3. Set dependencies between tasks
el dependency add el-task2 el-task1 --type blocks

# 4. Activate plan (tasks become dispatchable)
el plan activate <plan-id>
```

**Important:** Always use plans when creating tasks with dependencies to avoid race conditions with the dispatch daemon.

## Workflow Commands

| Command                         | Description               |
| ------------------------------- | ------------------------- |
| `el workflow create <playbook>` | Instantiate from playbook |
| `el workflow list`              | List workflows            |
| `el workflow show <id>`         | Show details              |
| `el workflow tasks <id>`        | List tasks                |
| `el workflow progress <id>`     | Show progress             |
| `el workflow delete <id>`       | Delete ephemeral          |
| `el workflow promote <id>`      | Promote to durable        |
| `el workflow gc`                | Garbage collect           |

```bash
# Instantiate workflow
el workflow create my-playbook --var name=value

# Garbage collect (default 7 days)
el workflow gc --age 14
```

## Inbox Commands

| Command                 | Description                          |
| ----------------------- | ------------------------------------ |
| `el inbox <agent-id>`   | List inbox items with message preview |
| `el inbox read <id>`    | Mark as read                         |
| `el inbox read-all`     | Mark all as read                     |
| `el inbox unread <id>`  | Mark as unread                       |
| `el inbox archive <id>` | Archive item                         |
| `el inbox count`        | Count unread                         |
| `el show <inbox-id>`    | Show inbox item with full content    |

#### inbox list

List inbox items with message content preview.

| Option                   | Description                                          |
| ------------------------ | ---------------------------------------------------- |
| `-a, --all`              | Include read and archived items (default: unread only) |
| `-s, --status <status>`  | Filter by status: unread, read, or archived          |
| `-n, --limit <n>`        | Maximum number of items to return                    |
| `-F, --full`             | Show complete message content instead of truncated   |

```bash
# List unread inbox items with message preview
el inbox alice

# Show full message content
el inbox alice --full

# Include all items (read, archived)
el inbox alice --all

# Show single inbox item with full content
el show inbox-abc123
```

## Channel Commands

| Command                           | Description                                             |
| --------------------------------- | ------------------------------------------------------- |
| `el channel create`               | Create channel (`--description, -D` to set description) |
| `el channel list`                 | List channels                                           |
| `el channel join <id>`            | Join channel                                            |
| `el channel leave <id>`           | Leave channel                                           |
| `el channel members <id>`         | List members                                            |
| `el channel add <ch> <entity>`    | Add member                                              |
| `el channel remove <ch> <entity>` | Remove member                                           |
| `el channel merge`                | Merge two channels                                      |

#### channel create

| Option                     | Description                              |
| -------------------------- | ---------------------------------------- |
| `-D, --description <text>` | Plain string description for the channel |

```bash
el channel create --name general --description "General discussion"
```

#### channel merge

Merge all messages from a source channel into a target channel. Both channels must be group channels. The source channel is archived after the merge.

```bash
el channel merge --source <id> --target <id> [--name <new-name>]
```

| Option                  | Description                              |
| ----------------------- | ---------------------------------------- |
| `-s, --source <id>`     | Source channel ID (required)             |
| `-t, --target <id>`     | Target channel ID (required)             |
| `-n, --name <new-name>` | Optional new name for the merged channel |

```bash
# Merge source into target
el channel merge --source el-ch111 --target el-ch222

# Merge and rename the target channel
el channel merge -s el-ch111 -t el-ch222 --name "combined-channel"
```

## Message Commands

| Command                  | Description                                        |
| ------------------------ | -------------------------------------------------- |
| `el message send`        | Send message to channel, entity, or as reply       |
| `el message reply <id>`  | Reply to a message (shorthand for send --reply-to) |
| `el message thread <id>` | View thread messages                               |
| `el message list`        | List messages                                      |

#### message send

| Option                  | Description                                                                      |
| ----------------------- | -------------------------------------------------------------------------------- |
| `-c, --channel <id>`    | Channel to send to                                                               |
| `-T, --to <entity>`     | Entity to send DM to (finds or creates DM channel)                               |
| `-r, --replyTo <msg>`   | Message ID to reply to (auto-sets channel, thread, swaps sender/recipient in DM) |
| `-m, --content <text>`  | Message content                                                                  |
| `--file <path>`         | Read content from file                                                           |
| `-t, --thread <id>`     | Reply to message (creates thread)                                                |
| `-a, --attachment <id>` | Attach document (can be repeated)                                                |
| `--tag <tag>`           | Add tag (can be repeated)                                                        |

```bash
# Send to channel
el message send --channel el-abc123 --content "Hello!"

# Send DM to entity (finds or creates DM channel)
el message send --to el-user456 -m "Direct message"

# Send DM with explicit sender
el --from agent-1 message send --to agent-2 -m "Message from agent-1"

# Reply to a message (auto-swaps sender/recipient in DM)
el message send --reply-to el-msg789 -m "Reply to your message"
```

#### message reply

Shorthand for `el message send --reply-to`. Automatically sets channel and thread from the replied-to message. In DM channels, sender/recipient are swapped unless `--from` is specified.

| Option                  | Description                       |
| ----------------------- | --------------------------------- |
| `-m, --content <text>`  | Message content                   |
| `--file <path>`         | Read content from file            |
| `-a, --attachment <id>` | Attach document (can be repeated) |
| `--tag <tag>`           | Add tag (can be repeated)         |

```bash
el message reply el-msg123 --content "Thanks for the update!"
el --from bot message reply el-msg123 -m "Automated response"
```

## Team Commands

| Command                          | Description   |
| -------------------------------- | ------------- |
| `el team create`                 | Create team   |
| `el team list`                   | List teams    |
| `el team add <team> <entity>`    | Add member    |
| `el team remove <team> <entity>` | Remove member |
| `el team members <id>`           | List members  |

## Playbook Commands

| Command                       | Description    |
| ----------------------------- | -------------- |
| `el playbook list`            | List playbooks |
| `el playbook show <name>`     | Show details   |
| `el playbook validate <file>` | Validate       |
| `el playbook create <file>`   | Create new     |

## Sync Commands

| Command            | Description       |
| ------------------ | ----------------- |
| `el export`        | Export to JSONL   |
| `el import <file>` | Import from JSONL |
| `el status`        | Show sync status  |

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

| Command                        | Description    |
| ------------------------------ | -------------- |
| `el config show [key]`         | Show config    |
| `el config set <path> <value>` | Set value      |
| `el config unset <path>`       | Remove key     |
| `el config edit`               | Open in editor |

```bash
el config show
el config show actor
el config set actor my-agent
el config unset actor
```

## Identity Commands

| Command                           | Description           |
| --------------------------------- | --------------------- |
| `el identity whoami`              | Show current identity |
| `el identity keygen`              | Generate keypair      |
| `el identity sign <data>`         | Sign data             |
| `el identity verify <sig> <data>` | Verify signature      |
| `el identity hash <data>`         | Compute hash          |
| `el identity mode [mode]`         | Show/set mode         |

## Admin Commands

| Command      | Description           |
| ------------ | --------------------- |
| `el doctor`  | Database health check |
| `el migrate` | Run migrations        |

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
import type { CLIPlugin } from "@elemental/sdk/cli";

export const cliPlugin: CLIPlugin = {
  name: "my-plugin",
  version: "1.0.0",
  commands: [myCommand],
  aliases: {
    shortcut: "my-command subcommand",
  },
};
```

### Plugin Precedence

- Built-in commands always take priority over plugin commands
- If multiple plugins define the same command, the first loaded wins
- **Subcommand merging**: When a plugin provides a command with the same name as an existing command, and both have subcommands, the subcommands are merged instead of skipping the entire plugin command. This allows plugins to extend built-in commands with additional subcommands.
- Subcommand conflicts (same subcommand name in both) are skipped with a warning
- Top-level command conflicts (no subcommands to merge) are logged as warnings

## Orchestrator Commands (Plugin)

These commands are provided by `@elemental/orchestrator-sdk`:

### Agent Commands

| Command                    | Description                              |
| -------------------------- | ---------------------------------------- |
| `el agent list`            | List registered agents                   |
| `el agent show <id>`       | Show agent details                       |
| `el agent register <name>` | Register a new agent                     |
| `el agent start <id>`      | Start a Claude Code process for an agent |
| `el agent stop <id>`       | Stop an agent session                    |
| `el agent stream <id>`     | Get agent channel for streaming          |

#### agent list

List registered agents with optional filters.

| Option                    | Description                                                    |
| ------------------------- | -------------------------------------------------------------- |
| `-r, --role <role>`       | Filter by role: director, worker, steward                      |
| `-s, --status <status>`   | Filter by session status: idle, running, suspended, terminated |
| `-m, --workerMode <mode>` | Filter by worker mode: ephemeral, persistent                   |
| `-f, --focus <focus>`     | Filter by steward focus: merge, health, reminder, ops          |
| `--reportsTo <id>`        | Filter by manager entity ID                                    |
| `--hasSession`            | Filter to agents with active sessions                          |

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

| Option                | Description                                             |
| --------------------- | ------------------------------------------------------- |
| `-r, --role <role>`   | Agent role: director, worker, steward (required)        |
| `-m, --mode <mode>`   | Worker mode: ephemeral, persistent (default: ephemeral) |
| `-f, --focus <focus>` | Steward focus: merge, health, reminder, ops             |
| `-t, --maxTasks <n>`  | Maximum concurrent tasks (default: 1)                   |
| `--tags <tags>`       | Comma-separated tags                                    |
| `--reportsTo <id>`    | Manager entity ID (for workers/stewards)                |
| `--roleDef <id>`      | Role definition document ID                             |
| `--trigger <cron>`    | Steward cron trigger (e.g., "0 2 \* \* \*")             |

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

| Option                  | Description                                          |
| ----------------------- | ---------------------------------------------------- |
| `-p, --prompt <text>`   | Initial prompt to send to the agent                  |
| `-m, --mode <mode>`     | Start mode: headless, interactive                    |
| `-r, --resume <id>`     | Resume a previous Claude session                     |
| `-w, --workdir <path>`  | Working directory for the agent                      |
| `--cols <n>`            | Terminal columns for interactive mode (default: 120) |
| `--rows <n>`            | Terminal rows for interactive mode (default: 30)     |
| `--timeout <ms>`        | Timeout in milliseconds (default: 120000)            |
| `-e, --env <KEY=VALUE>` | Environment variable to set                          |
| `-t, --taskId <id>`     | Task ID to assign to this agent                      |
| `--stream`              | Stream agent output after starting                   |

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

| Option                | Description                       |
| --------------------- | --------------------------------- |
| `-g, --graceful`      | Graceful shutdown (default: true) |
| `--no-graceful`       | Force immediate shutdown          |
| `-r, --reason <text>` | Reason for stopping the agent     |

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

| Command                      | Description                            |
| ---------------------------- | -------------------------------------- |
| `el dispatch <task> <agent>` | Dispatch task to specific agent        |
| `el dispatch smart <task>`   | Smart dispatch to best available agent |

| Option                  | Description                             |
| ----------------------- | --------------------------------------- |
| `-b, --branch <name>`   | Git branch to assign                    |
| `-w, --worktree <path>` | Git worktree path                       |
| `-s, --session <id>`    | Session ID (for dispatch)               |
| `-m, --markAsStarted`   | Mark the task as started after dispatch |

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

### Merge Command

| Command    | Description                                      |
| ---------- | ------------------------------------------------ |
| `el merge` | Squash-merge a branch into the default branch    |

Squash-merge a source branch into the default branch (master/main). Used by persistent workers and docs stewards to merge their work.

| Option                    | Description                                        |
| ------------------------- | -------------------------------------------------- |
| `-b, --branch <name>`     | Source branch to merge (default: current branch)   |
| `-i, --into <name>`       | Target branch (default: master/main auto-detected) |
| `-m, --message <text>`    | Commit message (default: "Merge \<branch\>")       |
| `--cleanup`               | Delete source branch and worktree after merge      |

```bash
# Squash-merge current branch into master
el merge

# With a descriptive commit message
el merge --message "feat: implement user authentication"

# Merge a specific branch
el merge --branch feature/xyz --into main

# Merge and clean up (used by docs steward)
el merge --cleanup --message "docs: automated documentation fixes"
```

### Orchestrator Task Commands

| Command                                    | Description                            |
| ------------------------------------------ | -------------------------------------- |
| `el task handoff <id>`                     | Hand off task to another agent         |
| `el task complete <id>`                    | Complete task and create merge request (OPEN/IN_PROGRESS only) |
| `el task merge <id>`                       | Squash-merge task branch and close it  |
| `el task reject <id>`                      | Mark merge as failed and reopen task   |
| `el task merge-status <id> <status>`       | Update the merge status of a task      |

#### task merge

Squash-merge a task's branch into the target branch and close it. The task must be in REVIEW status with an associated branch.

This command:
1. Validates the task is in REVIEW status with a branch
2. Squash-merges the branch into the target branch (auto-detected)
3. Pushes to remote
4. Atomically sets merge status to `merged` and closes the task
5. Cleans up the source branch (local + remote) and worktree

| Option                 | Description          |
| ---------------------- | -------------------- |
| `-s, --summary <text>` | Summary of the merge |

```bash
el task merge el-abc123
el task merge el-abc123 --summary "All tests passing"
```

#### task reject

Mark a task merge as failed and reopen it.

| Option                 | Description                     |
| ---------------------- | ------------------------------- |
| `-r, --reason <text>`  | Reason for rejection (required) |
| `-m, --message <text>` | Handoff message for next worker |

```bash
el task reject el-abc123 --reason "Tests failed"
el task reject el-abc123 --reason "Tests failed" --message "Fix flaky test in auth.test.ts"
```

#### task merge-status

Update the merge status of a task. Useful when the merge steward gets stuck or when a branch is manually merged outside the normal workflow.

| Argument   | Description                     |
| ---------- | ------------------------------- |
| `<id>`     | Task identifier                 |
| `<status>` | New merge status                |

Valid status values:
- `pending` - Task completed, awaiting merge
- `testing` - Steward is running tests on the branch
- `merging` - Tests passed, merge in progress
- `merged` - Successfully merged (**terminal** — also closes the task)
- `conflict` - Merge conflict detected
- `test_failed` - Tests failed, needs attention
- `failed` - Merge failed for other reason
- `not_applicable` - No merge needed, e.g. fix already on master (**terminal** — also closes the task)

Terminal statuses (`merged`, `not_applicable`) atomically set the task to CLOSED in a single API call.

```bash
el task merge-status el-abc123 merged
el task merge-status el-abc123 pending
el task merge-status el-abc123 not_applicable
```

## Short IDs

The CLI supports short IDs (minimum unique prefix):

```bash
# Full ID
el show el-a1b2c3d4e5f6

# Short ID (if unique)
el show a1b2
```

## Task Status Values

| Status        | Description                                  |
| ------------- | -------------------------------------------- |
| `open`        | Available for work                           |
| `in_progress` | Currently being worked on                    |
| `blocked`     | Waiting on a dependency                      |
| `deferred`    | Deliberately postponed                       |
| `backlog`     | Not ready for work, needs triage             |
| `review`      | Work complete, awaiting merge/review         |
| `closed`      | Completed and merged                         |
| `tombstone`   | Soft-deleted                                 |

## Priority Values

| Value | Level    |
| ----- | -------- |
| 1     | Critical |
| 2     | High     |
| 3     | Medium   |
| 4     | Low      |
| 5     | Minimal  |

## JSON Output

Use `--json` for machine-readable output:

```bash
el task list --status open --json | jq '.[] | .title'
```

## Examples

```bash
# Create and assign a task
el task create --title "Implement auth" --priority 2 --type feature
el task create --title "Fix bug" -d "Steps to reproduce: 1. Login 2. Click settings"
el task assign abc123 worker-1

# Add blocking dependency
el dependency add --type=blocks task1 task2

# Check ready tasks
el task ready

# Close with reason
el task close abc123 --reason "Completed"

# Export changes
el export

# Show sync status
el status
```

# CLI Specification

The Command Line Interface provides a terminal-based interface to Elemental, enabling all operations through shell commands. It supports multiple output formats and integrates with shell workflows.

## Purpose

The CLI provides:
- Terminal-based access to all features
- Scriptable operations
- Multiple output formats (human, JSON, quiet)
- Shell completion support
- Configuration management

## Command Structure

### Invocation

Primary: `elemental <command> [subcommand] [options]`
Alias: `el <command> [subcommand] [options]`

### Global Flags

| Flag | Short | Description |
|------|-------|-------------|
| `--db` | | Database path |
| `--actor` | | Actor name for operations |
| `--json` | | JSON output mode |
| `--quiet` | `-q` | Minimal output |
| `--verbose` | `-v` | Debug output |
| `--help` | `-h` | Show help |
| `--version` | `-V` | Show version |

## Command Groups

### Element Operations

General element commands:

| Command | Description |
|---------|-------------|
| `create <type>` | Create element of type |
| `list [type]` | List elements |
| `show <id>` | Show element details |
| `update <id>` | Update element |
| `delete <id>` | Delete element |
| `search <query>` | Search elements |

### Task Operations

Task-specific commands:

| Command | Description |
|---------|-------------|
| `ready` | List ready tasks |
| `blocked` | List blocked tasks |
| `close <id>` | Close task |
| `reopen <id>` | Reopen closed task |
| `assign <id>` | Assign task |
| `defer <id>` | Defer task |
| `undefer <id>` | Remove defer |

### Dependency Operations

| Command | Description |
|---------|-------------|
| `dep add <src> <tgt>` | Add dependency |
| `dep remove <src> <tgt>` | Remove dependency |
| `dep list <id>` | List dependencies |
| `dep tree <id>` | Show dependency tree |

### Message Operations

| Command | Description |
|---------|-------------|
| `send <channel>` | Send message |
| `thread <id>` | Reply to message |
| `messages <channel>` | List channel messages |

### Document Operations

| Command | Description |
|---------|-------------|
| `doc write` | Create/update document |
| `doc read <id>` | Read document |
| `doc history <id>` | Show version history |
| `doc versions <id>` | List all versions |

### Entity Operations

| Command | Description |
|---------|-------------|
| `entity register` | Register entity |
| `entity list` | List entities |
| `whoami` | Show current actor |

### Plan Operations

| Command | Description |
|---------|-------------|
| `plan create` | Create plan |
| `plan list` | List plans |
| `plan show <id>` | Show plan details |
| `plan close <id>` | Close plan |

### Workflow Operations

| Command | Description |
|---------|-------------|
| `workflow pour <playbook>` | Instantiate playbook |
| `workflow list` | List workflows |
| `workflow show <id>` | Show workflow |
| `workflow burn <id>` | Delete ephemeral |
| `workflow squash <id>` | Promote to durable |
| `workflow gc` | Garbage collect |

### Playbook Operations

| Command | Description |
|---------|-------------|
| `playbook list` | List playbooks |
| `playbook show <name>` | Show playbook |
| `playbook validate <name>` | Validate playbook |
| `playbook create` | Create playbook |

### Channel Operations

| Command | Description |
|---------|-------------|
| `channel create` | Create channel |
| `channel join <id>` | Join channel |
| `channel leave <id>` | Leave channel |
| `channel list` | List channels |
| `channel members <id>` | List members |

### Library Operations

| Command | Description |
|---------|-------------|
| `library create` | Create library |
| `library list` | List libraries |
| `library add <lib> <doc>` | Add document |
| `library remove <lib> <doc>` | Remove document |

### Team Operations

| Command | Description |
|---------|-------------|
| `team create` | Create team |
| `team add <team> <entity>` | Add member |
| `team remove <team> <entity>` | Remove member |
| `team list` | List teams |
| `team members <id>` | List members |

### Sync Operations

| Command | Description |
|---------|-------------|
| `sync` | Full sync cycle |
| `import` | Import from JSONL |
| `export` | Export to JSONL |
| `status` | Show sync status |

### Admin Operations

| Command | Description |
|---------|-------------|
| `init` | Initialize workspace |
| `config` | Manage configuration |
| `stats` | Show statistics |
| `doctor` | Check system health |
| `migrate` | Run migrations |

## Output Formats

### Human-Readable (Default)

Tables and formatted text:
- Columns aligned
- Colors for status
- Tree view for hierarchies
- Progress indicators

### JSON Mode

Structured JSON output:
- `--json` flag
- Machine-parseable
- Complete data
- Suitable for piping

### Quiet Mode

Minimal output:
- `-q` or `--quiet` flag
- IDs only
- Success/failure indication
- Suitable for scripts

## Input Methods

### Arguments

Positional arguments:
- `el show el-abc123`
- `el dep add el-src el-tgt`

### Flags

Named options:
- `el create task --title "Fix bug"`
- `el close el-abc --reason "Fixed"`

### Stdin

Pipe content:
- `echo "Content" | el doc write`
- `cat file.md | el send #channel`

### Interactive

Prompt for input:
- Multi-line content
- Confirmation prompts

## Command Details

### el init

Initialize new workspace:

| Flag | Description |
|------|-------------|
| `--name` | Workspace name |
| `--actor` | Default actor |

Creates `.elemental/` directory with:
- Empty database
- Default config
- gitignore

### el create task

Create new task:

| Flag | Description |
|------|-------------|
| `--title` | Task title (required) |
| `--priority` | Priority (1-5) |
| `--complexity` | Complexity (1-5) |
| `--type` | Task type |
| `--assignee` | Assignee entity |
| `--parent` | Parent plan ID |
| `--description` | Description text |
| `--description-file` | Description from file |

### el ready

List ready tasks:

| Flag | Description |
|------|-------------|
| `--assignee` | Filter by assignee |
| `--priority` | Filter by priority |
| `--type` | Filter by task type |
| `--limit` | Maximum results |

### el workflow pour

Instantiate playbook:

| Flag | Description |
|------|-------------|
| `--var` | Set variable (repeatable) |
| `--ephemeral` | Create ephemeral |
| `--title` | Override title |

Example: `el workflow pour deploy --var env=prod --var version=1.2`

### el sync

Synchronize with JSONL:

| Flag | Description |
|------|-------------|
| `--force` | Force overwrite conflicts |
| `--dry-run` | Show what would change |

## Configuration Commands

### el config show

Display current configuration.

### el config set

Set configuration value:
- `el config set actor myagent`
- `el config set sync.auto_export true`

### el config unset

Remove configuration value.

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | General error |
| 2 | Invalid arguments |
| 3 | Not found |
| 4 | Validation error |
| 5 | Permission error |

## Implementation Methodology

### CLI Framework

Use a CLI framework for:
- Argument parsing
- Help generation
- Completion generation
- Color output

Options: commander, yargs, cliffy (Deno)

### Command Structure

Each command:
1. Parse arguments
2. Validate inputs
3. Call API
4. Format output
5. Exit with code

### Output Formatting

Abstracted formatters:
- Table formatter
- Tree formatter
- JSON formatter
- Quiet formatter

Select based on flags.

### Error Handling

User-friendly errors:
- Clear message
- Suggested fix
- Exit code
- Optional verbose stack

## Implementation Checklist

### Phase 1: Framework Setup ✅
- [x] Select CLI framework (native Bun/Node arg parsing, no external deps)
- [x] Configure argument parsing (src/cli/parser.ts)
- [x] Setup output formatting (src/cli/formatter.ts - human, JSON, quiet modes)
- [x] Implement global flags (--db, --actor, --json, -q/--quiet, -v/--verbose, -h/--help, -V/--version)
- [x] Unit tests (155 tests)

### Phase 2: Core Commands ✅
- [x] Implement init (src/cli/commands/init.ts)
- [x] Implement create (tasks only - src/cli/commands/crud.ts, 27 tests)
- [x] Implement list (src/cli/commands/crud.ts)
- [x] Implement show (src/cli/commands/crud.ts)
- [x] Implement update (src/cli/commands/crud.ts - title, priority, complexity, status, assignee, tag operations)
- [x] Implement delete (src/cli/commands/crud.ts - soft-delete with reason, tombstone handling)

### Phase 3: Task Commands ✅
- [x] Implement ready (src/cli/commands/task.ts, filters: assignee, priority, type, limit)
- [x] Implement blocked (src/cli/commands/task.ts, filters: assignee, priority, limit)
- [x] Implement close (src/cli/commands/task.ts, with optional reason)
- [x] Implement reopen (src/cli/commands/task.ts)
- [x] Implement assign (src/cli/commands/task.ts, with --unassign flag)
- [x] Implement defer (src/cli/commands/task.ts, with optional --until date)
- [x] Implement undefer (src/cli/commands/task.ts)
- [x] Unit tests (src/cli/commands/task.test.ts - 58 tests)

### Phase 4: Dependency Commands ✅
- [x] Implement dep add (src/cli/commands/dep.ts, --type required, --metadata optional)
- [x] Implement dep remove (src/cli/commands/dep.ts, --type required)
- [x] Implement dep list (src/cli/commands/dep.ts, --type filter, --direction out/in/both)
- [x] Implement dep tree (src/cli/commands/dep.ts, --depth limit, ASCII tree output)
- [x] Unit tests (src/cli/commands/dep.test.ts - 44 tests)

### Phase 5: Collection Commands
- [ ] Implement plan commands
- [ ] Implement workflow commands
- [ ] Implement playbook commands
- [ ] Implement channel commands
- [ ] Implement library commands
- [ ] Implement team commands

### Phase 6: Sync Commands ✅
- [x] Implement export (src/cli/commands/sync.ts, --output, --full, --include-ephemeral)
- [x] Implement import (src/cli/commands/sync.ts, --input, --dry-run, --force)
- [x] Implement status (src/cli/commands/sync.ts, dirty count, total count, sync dir status)
- [x] Implement sync parent command (subcommands: export, import, status)
- [x] Unit tests (src/cli/commands/sync.test.ts - 46 tests)

### Phase 6.5: Identity Commands ✅
- [x] Implement whoami (src/cli/commands/identity.ts - shows actor, source, mode, verification)
- [x] Implement identity command (parent command with subcommands)
- [x] Implement identity mode subcommand (show/set identity mode)
- [x] Unit tests (src/cli/commands/identity.test.ts - 39 tests)

### Phase 7: Admin Commands (Partial)
- [x] Implement config (src/cli/commands/config.ts - show, set, unset subcommands)
- [x] Implement stats (src/cli/commands/stats.ts - workspace statistics, 11 tests)
- [ ] Implement doctor
- [ ] Implement migrate

### Phase 8: Polish
- [ ] Add shell completion
- [ ] Add aliases
- [x] Write help text (src/cli/commands/help.ts)
- [x] Test all implemented commands (400+ tests)

### Known Issues
- [x] **crud.test.ts:373** - "fails gracefully when no database exists" test fixed ✅ - Added database existence check in `resolveDatabasePath()` and `createAPI()`. Read operations (list, show, update, delete) now properly return GENERAL_ERROR when database doesn't exist. Write operations (create) still create the database if needed.

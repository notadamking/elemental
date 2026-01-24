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
| `plan show <id>` | Show plan details with progress |
| `plan activate <id>` | Activate a draft plan |
| `plan complete <id>` | Complete an active plan |
| `plan cancel <id>` | Cancel a plan |
| `plan add-task <plan> <task>` | Add task to plan |
| `plan remove-task <plan> <task>` | Remove task from plan |
| `plan tasks <id>` | List tasks in plan |

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

### Shell Completion & Aliases

| Command | Description |
|---------|-------------|
| `completion <shell>` | Generate shell completion script (bash, zsh, fish) |
| `alias` | Show command aliases |

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

### el plan create

Create a new plan:

| Flag | Description |
|------|-------------|
| `--title` | Plan title (required) |
| `--status` | Initial status: draft (default) or active |
| `--tag` | Add tag (repeatable) |

Example: `el plan create --title "Q1 Roadmap" --tag sprint`

### el plan list

List plans:

| Flag | Description |
|------|-------------|
| `--status` | Filter by status (draft, active, completed, cancelled) |
| `--tag` | Filter by tag (repeatable for AND) |
| `--limit` | Maximum results |

### el plan show

Show plan details with progress:

| Flag | Description |
|------|-------------|
| `--tasks` | Include list of tasks in the plan |

Example: `el plan show el-abc123 --tasks`

### el plan activate

Activate a draft plan (transition draft → active).

Example: `el plan activate el-abc123`

### el plan complete

Complete an active plan (transition active → completed).

Example: `el plan complete el-abc123`

### el plan cancel

Cancel a plan (draft or active → cancelled):

| Flag | Description |
|------|-------------|
| `--reason` | Cancellation reason |

Example: `el plan cancel el-abc123 --reason "Requirements changed"`

### el plan add-task

Add an existing task to a plan:

```
el plan add-task <plan-id> <task-id>
```

Example: `el plan add-task el-plan123 el-task456`

### el plan remove-task

Remove a task from a plan:

```
el plan remove-task <plan-id> <task-id>
```

### el plan tasks

List tasks in a plan:

| Flag | Description |
|------|-------------|
| `--status` | Filter by task status |
| `--limit` | Maximum results |

Example: `el plan tasks el-abc123 --status open`

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

## Shell Completion

### el completion

Generate shell completion scripts:

| Argument | Description |
|----------|-------------|
| `shell` | Shell type: bash, zsh, or fish |

Installation:

**Bash:**
```bash
# Add to ~/.bashrc or ~/.bash_profile:
source <(el completion bash)

# Or save to a file:
el completion bash > ~/.local/share/bash-completion/completions/el
```

**Zsh:**
```bash
# Add to ~/.zshrc:
source <(el completion zsh)

# Or save to a file in your fpath:
el completion zsh > ~/.zsh/completions/_el
```

**Fish:**
```bash
# Save to completions directory:
el completion fish > ~/.config/fish/completions/el.fish
```

### el alias

Display all available command aliases.

**Default Aliases:**

| Alias | Command | Description |
|-------|---------|-------------|
| `add`, `new` | `create` | Create a new element |
| `rm`, `remove` | `delete` | Delete an element |
| `ls` | `list` | List elements |
| `s`, `get` | `show` | Show element details |
| `todo`, `tasks` | `ready` | List ready tasks |
| `done`, `complete` | `close` | Close a task |
| `st` | `status` | Show sync status |

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

### Phase 5: Collection Commands ✅
- [x] Implement plan commands (src/cli/commands/plan.ts - create, list, show, activate, complete, cancel, add-task, remove-task, tasks)
- [x] Implement workflow commands (src/cli/commands/workflow.ts - pour, list, show, burn, squash, gc)
- [x] Implement playbook commands (src/cli/commands/playbook.ts - list, show, validate, create)
- [x] Implement channel commands (src/cli/commands/channel.ts - create, join, leave, list, members)
- [x] Implement library commands (src/cli/commands/library.ts - create, list, add, remove)
- [x] Implement team commands (src/cli/commands/team.ts - create, add, remove, list, members)

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

### Phase 6.6: Entity Commands ✅
- [x] Implement entity register (src/cli/commands/entity.ts - register agent/human/system entities, tags, public key)
- [x] Implement entity list (src/cli/commands/entity.ts - list with type filter, limit)
- [x] Implement entity command (parent command with subcommands)
- [x] Unit tests (src/cli/commands/entity.test.ts - 40 tests)

### Phase 7: Admin Commands ✅
- [x] Implement config (src/cli/commands/config.ts - show, set, unset subcommands)
- [x] Implement stats (src/cli/commands/stats.ts - workspace statistics, 11 tests)
- [x] Implement doctor (src/cli/commands/admin.ts - health checks, schema validation, integrity checks, 31 tests)
- [x] Implement migrate (src/cli/commands/admin.ts - schema migration with dry-run support)

### Phase 8: Polish ✅
- [x] Add shell completion (src/cli/completion.ts, src/cli/commands/completion.ts - bash, zsh, fish)
- [x] Add aliases (src/cli/commands/alias.ts, src/cli/runner.ts - 12 default aliases)
- [x] Write help text (src/cli/commands/help.ts)
- [x] Test all implemented commands (925+ tests)

### Known Issues
- [x] **crud.test.ts:373** - "fails gracefully when no database exists" test fixed ✅ - Added database existence check in `resolveDatabasePath()` and `createAPI()`. Read operations (list, show, update, delete) now properly return GENERAL_ERROR when database doesn't exist. Write operations (create) still create the database if needed.
- [ ] **el-59p3** - CLI parser overwrites repeated options instead of accumulating to array. In src/cli/parser.ts line 144, when a command option is parsed multiple times (e.g., `--step a:A --step b:B`), only the last value is kept. The parser should accumulate repeated options into an array. This breaks playbook create with multiple steps/variables, adding multiple tags, and any command using repeated options.
- [ ] **el-18ug** - CLI `workflow pour` handler does not use `pourWorkflow()` function. The handler in src/cli/commands/workflow.ts has a TODO comment and just creates an empty workflow with the playbook name as title. The `pourWorkflow()` function exists in src/types/workflow-pour.ts and is well-tested (59 tests) - the CLI handler just needs to call it and store results.
- [ ] **el-4kis** - CLI parser `isSubcommand()` treats entity names as subcommands. In src/cli/parser.ts lines 177-186, the function only checks if an argument starts with `el-`, contains `/`, or is all digits. Arguments like `test-agent` are incorrectly treated as subcommands, causing `el assign el-xxx test-agent` to fail. Workaround: use entity ID instead of name.

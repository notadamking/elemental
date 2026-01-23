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

### Phase 1: Framework Setup
- [ ] Select CLI framework
- [ ] Configure argument parsing
- [ ] Setup output formatting
- [ ] Implement global flags

### Phase 2: Core Commands
- [ ] Implement init
- [ ] Implement create (all types)
- [ ] Implement list
- [ ] Implement show
- [ ] Implement update
- [ ] Implement delete

### Phase 3: Task Commands
- [ ] Implement ready
- [ ] Implement blocked
- [ ] Implement close
- [ ] Implement reopen
- [ ] Implement assign
- [ ] Implement defer

### Phase 4: Dependency Commands
- [ ] Implement dep add
- [ ] Implement dep remove
- [ ] Implement dep list
- [ ] Implement dep tree

### Phase 5: Collection Commands
- [ ] Implement plan commands
- [ ] Implement workflow commands
- [ ] Implement playbook commands
- [ ] Implement channel commands
- [ ] Implement library commands
- [ ] Implement team commands

### Phase 6: Sync Commands
- [ ] Implement sync
- [ ] Implement import
- [ ] Implement export
- [ ] Implement status

### Phase 7: Admin Commands
- [ ] Implement config
- [ ] Implement stats
- [ ] Implement doctor
- [ ] Implement migrate

### Phase 8: Polish
- [ ] Add shell completion
- [ ] Add aliases
- [ ] Write help text
- [ ] Test all commands

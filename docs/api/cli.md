# CLI Commands

## Files
- **Runner**: `src/cli/runner.ts`
- **Commands**: `src/cli/commands/*.ts`
- **Tests**: `src/cli/commands/*.test.ts`
- **Spec (historical)**: `specs/api/cli.md`

## Command Reference

### Basic Commands

| Command | File | Description |
|---------|------|-------------|
| `el init` | `src/cli/commands/init.ts` | Initialize .elemental directory |
| `el help` | `src/cli/commands/help.ts` | Show help |
| `el version` | `src/cli/commands/help.ts` | Show version |
| `el stats` | `src/cli/commands/stats.ts` | Show statistics |
| `el whoami` | `src/cli/commands/identity.ts` | Show current actor (alias for `el identity whoami`) |

### CRUD Commands

| Command | File | Description |
|---------|------|-------------|
| `el create <type>` | `src/cli/commands/crud.ts` | Create element |
| `el list <type>` | `src/cli/commands/crud.ts` | List elements |
| `el show <id>` | `src/cli/commands/crud.ts` | Show element details |
| `el update <id>` | `src/cli/commands/crud.ts` | Update element |
| `el delete <id>` | `src/cli/commands/crud.ts` | Delete element |

### Task Commands

| Command | File | Description |
|---------|------|-------------|
| `el ready` | `src/cli/commands/task.ts` | List ready tasks |
| `el blocked` | `src/cli/commands/task.ts` | List blocked tasks |
| `el close <id>` | `src/cli/commands/task.ts` | Close task |
| `el reopen <id>` | `src/cli/commands/task.ts` | Reopen task |
| `el assign <task> <entity>` | `src/cli/commands/task.ts` | Assign task |
| `el defer <id>` | `src/cli/commands/task.ts` | Defer task |
| `el undefer <id>` | `src/cli/commands/task.ts` | Remove deferral |

### Dependency Commands

| Command | File | Description |
|---------|------|-------------|
| `el dep add` | `src/cli/commands/dep.ts` | Add dependency |
| `el dep remove` | `src/cli/commands/dep.ts` | Remove dependency |
| `el dep list <id> [--direction]` | `src/cli/commands/dep.ts` | List dependencies (out/in/both) |
| `el dep tree <id>` | `src/cli/commands/dep.ts` | Show dependency tree |

### Entity Commands

| Command | File | Description |
|---------|------|-------------|
| `el entity register <name>` | `src/cli/commands/entity.ts` | Register new entity |
| `el entity list` | `src/cli/commands/entity.ts` | List entities |
| `el entity set-manager <entity> <manager>` | `src/cli/commands/entity.ts` | Set manager |
| `el entity clear-manager <entity>` | `src/cli/commands/entity.ts` | Clear manager |
| `el entity reports <manager>` | `src/cli/commands/entity.ts` | Get direct reports |
| `el entity chain <entity>` | `src/cli/commands/entity.ts` | Get management chain |

### Document Commands

| Command | File | Description |
|---------|------|-------------|
| `el doc create` | `src/cli/commands/document.ts` | Create document |
| `el doc list` | `src/cli/commands/document.ts` | List documents |
| `el doc show <id>` | `src/cli/commands/document.ts` | Show document |
| `el doc history <id>` | `src/cli/commands/document.ts` | Show version history |
| `el doc rollback <id> <version>` | `src/cli/commands/document.ts` | Rollback to version |

### Inbox Commands

| Command | File | Description |
|---------|------|-------------|
| `el inbox list` | `src/cli/commands/inbox.ts` | List inbox items |
| `el inbox read <id>` | `src/cli/commands/inbox.ts` | Mark as read |
| `el inbox read-all` | `src/cli/commands/inbox.ts` | Mark all as read |
| `el inbox unread <id>` | `src/cli/commands/inbox.ts` | Mark as unread |
| `el inbox archive <id>` | `src/cli/commands/inbox.ts` | Archive item |
| `el inbox count` | `src/cli/commands/inbox.ts` | Count unread |

### Admin Commands

| Command | File | Description |
|---------|------|-------------|
| `el doctor [-v]` | `src/cli/commands/admin.ts` | Database health check |
| `el migrate [--dry-run]` | `src/cli/commands/admin.ts` | Run migrations |

### Identity Commands

| Command | File | Description |
|---------|------|-------------|
| `el identity whoami` | `src/cli/commands/identity.ts` | Show current identity |
| `el identity keygen` | `src/cli/commands/identity.ts` | Generate Ed25519 keypair |
| `el identity sign <data>` | `src/cli/commands/identity.ts` | Sign data |
| `el identity verify <sig> <data>` | `src/cli/commands/identity.ts` | Verify signature |
| `el identity hash <data>` | `src/cli/commands/identity.ts` | Compute SHA256 hash |
| `el identity mode [mode]` | `src/cli/commands/identity.ts` | Show/set identity mode |

### Config Commands

| Command | File | Description |
|---------|------|-------------|
| `el config show [key]` | `src/cli/commands/config.ts` | Show all or specific config |
| `el config set <path> <value>` | `src/cli/commands/config.ts` | Set config value |
| `el config unset <path>` | `src/cli/commands/config.ts` | Remove config key |
| `el config edit` | `src/cli/commands/config.ts` | Open config in editor |

### Plan Commands

| Command | File | Description |
|---------|------|-------------|
| `el plan create` | `src/cli/commands/plan.ts` | Create a plan |
| `el plan list` | `src/cli/commands/plan.ts` | List plans |
| `el plan show <id>` | `src/cli/commands/plan.ts` | Show plan details |
| `el plan activate <id>` | `src/cli/commands/plan.ts` | Activate a plan |
| `el plan complete <id>` | `src/cli/commands/plan.ts` | Mark plan completed |
| `el plan cancel <id>` | `src/cli/commands/plan.ts` | Cancel a plan |
| `el plan add-task <id> <task>` | `src/cli/commands/plan.ts` | Add task to plan |
| `el plan remove-task <id> <task>` | `src/cli/commands/plan.ts` | Remove task from plan |
| `el plan tasks <id>` | `src/cli/commands/plan.ts` | List tasks in plan |

### Workflow Commands

| Command | File | Description |
|---------|------|-------------|
| `el workflow pour <playbook>` | `src/cli/commands/workflow.ts` | Instantiate workflow from playbook |
| `el workflow list` | `src/cli/commands/workflow.ts` | List workflows |
| `el workflow show <id>` | `src/cli/commands/workflow.ts` | Show workflow details |
| `el workflow tasks <id>` | `src/cli/commands/workflow.ts` | List workflow tasks |
| `el workflow progress <id>` | `src/cli/commands/workflow.ts` | Show progress metrics |
| `el workflow burn <id>` | `src/cli/commands/workflow.ts` | Delete ephemeral workflow |
| `el workflow squash <id>` | `src/cli/commands/workflow.ts` | Promote to durable |
| `el workflow gc [--days N]` | `src/cli/commands/workflow.ts` | Garbage collect old workflows |

### Playbook Commands

| Command | File | Description |
|---------|------|-------------|
| `el playbook list` | `src/cli/commands/playbook.ts` | List available playbooks |
| `el playbook show <name>` | `src/cli/commands/playbook.ts` | Show playbook details |
| `el playbook validate <file>` | `src/cli/commands/playbook.ts` | Validate playbook structure |
| `el playbook create <file>` | `src/cli/commands/playbook.ts` | Create new playbook |

### Team Commands

| Command | File | Description |
|---------|------|-------------|
| `el team create` | `src/cli/commands/team.ts` | Create a team |
| `el team list` | `src/cli/commands/team.ts` | List teams |
| `el team add <team> <entity>` | `src/cli/commands/team.ts` | Add member to team |
| `el team remove <team> <entity>` | `src/cli/commands/team.ts` | Remove member from team |
| `el team members <id>` | `src/cli/commands/team.ts` | List team members |

### Channel Commands

| Command | File | Description |
|---------|------|-------------|
| `el channel create` | `src/cli/commands/channel.ts` | Create a channel |
| `el channel list` | `src/cli/commands/channel.ts` | List channels |
| `el channel join <id>` | `src/cli/commands/channel.ts` | Join a channel |
| `el channel leave <id>` | `src/cli/commands/channel.ts` | Leave a channel |
| `el channel members <id>` | `src/cli/commands/channel.ts` | List channel members |
| `el channel add <channel> <entity>` | `src/cli/commands/channel.ts` | Add member to channel |
| `el channel remove <channel> <entity>` | `src/cli/commands/channel.ts` | Remove member from channel |

### Message Commands

| Command | File | Description |
|---------|------|-------------|
| `el msg send` | `src/cli/commands/message.ts` | Send a message |
| `el msg thread <id>` | `src/cli/commands/message.ts` | Reply in thread |
| `el msg list` | `src/cli/commands/message.ts` | List messages |

### Library Commands

| Command | File | Description |
|---------|------|-------------|
| `el library create` | `src/cli/commands/library.ts` | Create a library |
| `el library list` | `src/cli/commands/library.ts` | List libraries |
| `el library add <lib> <doc>` | `src/cli/commands/library.ts` | Add document to library |
| `el library remove <lib> <doc>` | `src/cli/commands/library.ts` | Remove document from library |

### Sync Commands

| Command | File | Description |
|---------|------|-------------|
| `el export` | `src/cli/commands/sync.ts` | Export to JSONL |
| `el import <file>` | `src/cli/commands/sync.ts` | Import from JSONL |
| `el status` | `src/cli/commands/sync.ts` | Show sync status |

### History Command

| Command | File | Description |
|---------|------|-------------|
| `el history <id>` | `src/cli/commands/history.ts` | Show event history for element |

Flags: `--type`, `--actor`, `--after`, `--before`, `--format` (timeline/table)

### Utility Commands

| Command | File | Description |
|---------|------|-------------|
| `el alias` | `src/cli/commands/alias.ts` | Manage command aliases |
| `el completion` | `src/cli/commands/completion.ts` | Shell completion setup |

## Common Flags

- `--help, -h` - Show command help
- `--json` - Output as JSON
- `--quiet, -q` - Minimal output
- `--verbose, -v` - Verbose output
- `--actor <name>` - Specify acting entity (global)
- `--db <path>` - Override database path (global)

## Examples

```bash
# Create a task
el create task --title "Fix bug" --priority 2 --type bug

# List open tasks
el list task --status open

# Add blocking dependency
el dep add --type=blocks <source-id> <target-id>

# Close task with reason
el close <id> --reason "Fixed in commit abc123"

# Export changes
el export
```

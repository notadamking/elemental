# Configuration System Specification

The configuration system manages settings for Elemental, supporting file-based configuration, environment variables, and CLI overrides with a clear precedence hierarchy.

## Purpose

The configuration system provides:
- Persistent settings storage
- Environment-based overrides
- CLI flag overrides
- Default values
- Type-safe configuration access

## Configuration Sources

### Precedence (Highest to Lowest)

1. CLI flags (e.g., `--actor`)
2. Environment variables (e.g., `ELEMENTAL_ACTOR`)
3. Config file (`.elemental/config.yaml`)
4. Built-in defaults

Higher precedence overrides lower.

## Configuration File

### Location

Primary: `.elemental/config.yaml`
Fallback: `~/.elemental/config.yaml` (global)

### Format

YAML format for readability:
- Comments supported
- Hierarchical structure
- Type preservation

### Structure

| Section | Description |
|---------|-------------|
| `actor` | Default actor identity |
| `database` | Database settings |
| `sync` | Synchronization settings |
| `playbooks` | Playbook paths |
| `tombstone` | Soft delete settings |
| `identity` | Identity mode settings |

## Configuration Fields

### Identity

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `actor` | string | (none) | Default actor name |

### Database

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `database` | string | `elemental.db` | Database filename |

### Sync

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `sync.auto_export` | boolean | true | Auto-export on mutations |
| `sync.export_debounce` | duration | 500ms | Debounce interval |
| `sync.elements_file` | string | `elements.jsonl` | Elements file |
| `sync.dependencies_file` | string | `dependencies.jsonl` | Dependencies file |

### Playbooks

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `playbooks.paths` | string[] | (see below) | Playbook search paths |

Default paths:
1. `.elemental/playbooks`
2. `~/.elemental/playbooks`

### Tombstone

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `tombstone.ttl` | duration | 720h | Time-to-live (30 days) |
| `tombstone.min_ttl` | duration | 168h | Minimum TTL (7 days) |

### Identity Mode

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `identity.mode` | string | soft | soft, cryptographic, hybrid |
| `identity.time_tolerance` | duration | 5m | Signature time tolerance |

## Environment Variables

### Naming Convention

`ELEMENTAL_` prefix + uppercase snake_case:
- `actor` → `ELEMENTAL_ACTOR`
- `sync.auto_export` → `ELEMENTAL_SYNC_AUTO_EXPORT`

### Supported Variables

| Variable | Config Path | Type |
|----------|-------------|------|
| `ELEMENTAL_ACTOR` | actor | string |
| `ELEMENTAL_DB` | database | string |
| `ELEMENTAL_CONFIG` | (file path) | string |
| `ELEMENTAL_JSON` | (output mode) | boolean |
| `ELEMENTAL_VERBOSE` | (debug mode) | boolean |
| `ELEMENTAL_SYNC_AUTO_EXPORT` | sync.auto_export | boolean |
| `ELEMENTAL_IDENTITY_MODE` | identity.mode | string |

### Boolean Parsing

Environment booleans:
- True: `1`, `true`, `yes`, `on`
- False: `0`, `false`, `no`, `off`
- Case insensitive

### Duration Parsing

Duration format: `<number><unit>`
- Units: `ms`, `s`, `m`, `h`, `d`
- Examples: `500ms`, `5m`, `24h`, `30d`

## Default Values

Built-in defaults applied when no override:

| Field | Default |
|-------|---------|
| actor | (none, required for writes) |
| database | `elemental.db` |
| sync.auto_export | true |
| sync.export_debounce | 500ms |
| tombstone.ttl | 720h |
| tombstone.min_ttl | 168h |
| identity.mode | soft |
| identity.time_tolerance | 5m |

## Configuration Operations

### Read Configuration

1. Load defaults
2. Find config file
3. Parse YAML if exists
4. Apply environment variables
5. Return merged config

### Write Configuration

1. Load current file (or empty)
2. Merge changes
3. Serialize to YAML
4. Write to file

### Get Value

1. Check CLI flags (if in context)
2. Check environment variable
3. Check config file
4. Return default

### Set Value

1. Load config file
2. Set value at path
3. Write config file

### Unset Value

1. Load config file
2. Remove value at path
3. Write config file

## Configuration File Example

```yaml
# Elemental Configuration

# Default actor for operations
actor: agent-alpha

# Database settings
database: elemental.db

# Sync settings
sync:
  auto_export: true
  export_debounce: 500ms

# Playbook search paths
playbooks:
  paths:
    - .elemental/playbooks
    - ~/.elemental/playbooks
    - /shared/playbooks

# Tombstone settings
tombstone:
  ttl: 720h    # 30 days
  min_ttl: 168h  # 7 days

# Identity settings
identity:
  mode: hybrid
  time_tolerance: 5m
```

## CLI Config Commands

### Show All

`el config show`

Displays current effective configuration with source indicators.

### Show Value

`el config show <path>`

Example: `el config show sync.auto_export`

### Set Value

`el config set <path> <value>`

Example: `el config set actor myagent`

### Unset Value

`el config unset <path>`

Example: `el config unset actor`

### Edit

`el config edit`

Opens config file in default editor.

## Validation

### On Load

Configuration validated on load:
- Type checking
- Range validation
- Path existence (where applicable)
- Duration parsing

### On Set

Configuration validated on set:
- Same validations as load
- Reject invalid values
- Provide helpful error messages

### Validation Rules

| Field | Validation |
|-------|------------|
| actor | Valid identifier format |
| database | Valid filename |
| sync.export_debounce | >= 100ms |
| tombstone.ttl | >= min_ttl |
| identity.mode | Enum: soft, cryptographic, hybrid |

## Implementation Methodology

### Config Loading

Lazy load configuration:
1. First access triggers load
2. Cache result
3. Reload on explicit request

### Environment Parsing

For each known field:
1. Construct env var name
2. Check if set
3. Parse to appropriate type
4. Override config value

### Path Resolution

Config file discovery:
1. Check current directory for `.elemental/`
2. Walk up to find `.elemental/`
3. Fall back to home directory
4. Use default path if none found

### Change Notification

Optional: Watch config file:
- Detect external changes
- Reload configuration
- Notify listeners

## Implementation Checklist

### Phase 1: Type Definitions
- [ ] Define Configuration interface
- [ ] Define all sub-interfaces
- [ ] Define validation types

### Phase 2: Defaults
- [ ] Define default values
- [ ] Create defaults object
- [ ] Implement deep merge

### Phase 3: File Loading
- [ ] Implement YAML parsing
- [ ] Implement file discovery
- [ ] Implement merge logic
- [ ] Add validation on load

### Phase 4: Environment Variables
- [ ] Implement env var mapping
- [ ] Implement type parsing
- [ ] Implement boolean parsing
- [ ] Implement duration parsing

### Phase 5: Access API
- [ ] Implement getConfig
- [ ] Implement getValue
- [ ] Implement setValue
- [ ] Implement unsetValue

### Phase 6: CLI Commands
- [ ] Implement config show
- [ ] Implement config set
- [ ] Implement config unset
- [ ] Implement config edit

### Phase 7: Validation
- [ ] Implement type validation
- [ ] Implement range validation
- [ ] Implement cross-field validation
- [ ] Add helpful error messages

### Phase 8: Testing
- [ ] Unit tests for loading
- [ ] Unit tests for precedence
- [ ] Unit tests for validation
- [ ] Integration tests for CLI

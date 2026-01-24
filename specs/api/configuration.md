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

### Identity Configuration

Identity settings control how actors are verified and authenticated.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `identity.mode` | string | soft | Identity verification mode |
| `identity.time_tolerance` | duration | 5m | Signature expiry tolerance |

#### Identity Modes

| Mode | Description | Use Case |
|------|-------------|----------|
| `soft` | Name-based identity without verification | Trusted, single-system environments |
| `cryptographic` | Key-based identity with signature verification | Untrusted, multi-system environments |
| `hybrid` | Accepts both verified and unverified actors | Gradual migration to cryptographic |

**Soft Mode (Default)**
- Any actor name can be claimed
- No signature verification
- Impersonation is possible
- Federation not supported
- Suitable for trusted environments

**Cryptographic Mode**
- Requires Ed25519 public key registration
- All write operations require valid signatures
- Prevents impersonation
- Supports federation across systems
- Reject unsigned requests

**Hybrid Mode**
- Entities with keys are verified
- Entities without keys use soft identity
- System accepts both
- Queries can filter by verification status
- Useful for gradual adoption

#### Time Tolerance

Signatures include a timestamp (`signedAt`) that must be within the configured tolerance:
- Prevents replay attacks
- Allows for clock skew between systems
- Default: 5 minutes
- Minimum: 1 second
- Maximum: 24 hours

#### Validation Rules

| Field | Constraint |
|-------|------------|
| `identity.mode` | Must be: soft, cryptographic, or hybrid |
| `identity.time_tolerance` | 1s ≤ value ≤ 24h |

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
| `ELEMENTAL_SIGN_KEY` | (signing) | string |
| `ELEMENTAL_SIGN_KEY_FILE` | (signing) | string |

### Identity Environment Variables

For cryptographic mode, signing keys can be provided via environment:

| Variable | Description |
|----------|-------------|
| `ELEMENTAL_SIGN_KEY` | Base64-encoded Ed25519 private key (PKCS8 format) |
| `ELEMENTAL_SIGN_KEY_FILE` | Path to file containing private key |

Priority order (highest to lowest):
1. CLI `--sign-key` flag
2. CLI `--sign-key-file` flag
3. `ELEMENTAL_SIGN_KEY` environment variable
4. `ELEMENTAL_SIGN_KEY_FILE` environment variable

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

## Identity Configuration Examples

### Soft Mode (Default)

For trusted, single-system environments:

```yaml
identity:
  mode: soft
```

Usage:
```bash
# Any actor name is accepted
el task create "My task" --actor alice
el task create "Another task" --actor bob
```

### Cryptographic Mode

For untrusted, multi-system environments:

```yaml
identity:
  mode: cryptographic
  time_tolerance: 5m
```

Setup:
```bash
# Generate keypair
el identity keygen
# Output:
#   Public Key:  <base64-public-key>
#   Private Key: <base64-private-key>

# Register entity with public key
el entity register alice --type agent --public-key <base64-public-key>

# Set actor in config
el config set actor alice
```

Usage:
```bash
# Sign requests with private key
el --sign-key <private-key> task create "Secure task"

# Or use environment variable
export ELEMENTAL_SIGN_KEY=<base64-private-key>
el task create "Secure task"

# Or use key file
el --sign-key-file ~/.elemental/private.key task create "Secure task"
```

### Hybrid Mode

For gradual migration from soft to cryptographic:

```yaml
identity:
  mode: hybrid
  time_tolerance: 10m  # More lenient for distributed systems
```

In hybrid mode:
- Entities with public keys must sign requests
- Entities without keys use soft identity
- Both types can coexist

### Environment-Based Configuration

```bash
# Set identity mode via environment
export ELEMENTAL_IDENTITY_MODE=cryptographic

# Set signing key
export ELEMENTAL_SIGN_KEY=<base64-private-key>
# Or path to key file
export ELEMENTAL_SIGN_KEY_FILE=~/.elemental/private.key

# Set actor
export ELEMENTAL_ACTOR=alice

# Now all commands use cryptographic identity
el task create "Secure task"
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

## Identity CLI Commands

### Show Current Actor

`el whoami`

Displays the current actor identity and how it was determined.

Output includes:
- Actor name
- Source (CLI flag, environment, config file, default)
- Identity mode (soft, cryptographic, hybrid)
- Verification status

### Show/Set Identity Mode

`el identity mode`
`el identity mode <mode>`

Show or set the identity verification mode.

Examples:
```bash
el identity mode              # Show current mode
el identity mode soft         # Set to soft mode
el identity mode cryptographic  # Set to cryptographic mode
```

### Generate Keypair

`el identity keygen`

Generate a new Ed25519 keypair for cryptographic identity.

Output:
- Public Key: Register with `el entity register --public-key <key>`
- Private Key: Use with `--sign-key` to sign requests

### Sign Data

`el identity sign [options]`

Sign data using an Ed25519 private key.

| Option | Description |
|--------|-------------|
| `-d, --data <string>` | Data to sign (will be hashed) |
| `-f, --file <path>` | File containing data to sign |
| `--hash <hash>` | Pre-computed SHA256 hash (hex) |
| `--sign-key <key>` | Private key (base64 PKCS8) |
| `--sign-key-file <path>` | Path to private key file |

### Verify Signature

`el identity verify [options]`

Verify an Ed25519 signature against data.

| Option | Description |
|--------|-------------|
| `-s, --signature <sig>` | Signature to verify (base64) |
| `-k, --public-key <key>` | Public key (base64) |
| `--signed-at <time>` | Timestamp when signed (ISO 8601) |
| `-d, --data <string>` | Original data that was signed |
| `-f, --file <path>` | File containing original data |
| `--hash <hash>` | Request hash that was signed |

### Compute Hash

`el identity hash [options]`

Compute SHA256 hash of data for use in signing.

| Option | Description |
|--------|-------------|
| `-d, --data <string>` | Data to hash |
| `-f, --file <path>` | File to hash |

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
| sync.export_debounce | >= 100ms, <= 1h |
| tombstone.ttl | >= min_ttl, <= 365d |
| tombstone.min_ttl | >= 0, <= ttl |
| identity.mode | Enum: soft, cryptographic, hybrid |
| identity.time_tolerance | >= 1s, <= 24h |

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

### Phase 1: Type Definitions ✅
- [x] Define Configuration interface (src/config/types.ts)
- [x] Define all sub-interfaces (SyncConfig, PlaybookConfig, TombstoneConfig, IdentityConfigSection)
- [x] Define validation types (ConfigValidationResult, TrackedConfiguration)

### Phase 2: Defaults ✅
- [x] Define default values (src/config/defaults.ts)
- [x] Create defaults object (DEFAULT_CONFIG, getDefaultConfig)
- [x] Implement deep merge (src/config/merge.ts)

### Phase 3: File Loading ✅
- [x] Implement YAML parsing (parseYamlConfig, convertYamlToConfig)
- [x] Implement file discovery (discoverConfigFile, findElementalDir)
- [x] Implement merge logic (mergeConfiguration, mergeConfigurations)
- [x] Add validation on load (validateConfiguration)

### Phase 4: Environment Variables ✅
- [x] Implement env var mapping (EnvVars constants, loadEnvConfig)
- [x] Implement type parsing (parseEnvDuration)
- [x] Implement boolean parsing (parseEnvBoolean, isEnvBoolean)
- [x] Implement duration parsing (parseDuration, parseDurationValue, tryParseDuration)

### Phase 5: Access API ✅
- [x] Implement getConfig (src/config/config.ts)
- [x] Implement getValue (getValueFromConfig, getValue)
- [x] Implement setValue (setValue with file update)
- [x] Implement unsetValue (unsetValue)

### Phase 6: CLI Commands ✅
- [x] Implement config show (src/cli/commands/config.ts)
- [x] Implement config set (src/cli/commands/config.ts)
- [x] Implement config unset (src/cli/commands/config.ts)
- [x] Implement config edit ✅ (src/cli/commands/config.ts - opens $EDITOR/$VISUAL/platform default, creates file if needed, 8 tests)

### Phase 7: Validation ✅
- [x] Implement type validation (isValidActor, isValidDatabase, etc.)
- [x] Implement range validation (validateDurationRange)
- [x] Implement cross-field validation (tombstone.ttl >= tombstone.minTtl)
- [x] Add helpful error messages (detailed ValidationError with field info)

### Phase 8: Testing ✅
- [x] Unit tests for loading (115 tests in config.test.ts)
- [x] Unit tests for precedence (CLI > Environment > File > Defaults)
- [x] Unit tests for validation (field validation, configuration validation)
- [x] Integration tests for CLI (20 tests in src/cli/commands/config.test.ts)

### Known Issues
- [x] **config.test.ts:888** - "gets nested values" test fixed ✅ - Added `skipFile` option to `LoadConfigOptions` allowing tests to use defaults only without interference from project config files.

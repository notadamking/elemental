# Configuration Reference

**Directory:** `packages/sdk/src/config/`

Configuration loading, access, and modification.

## Overview

Configuration precedence (highest to lowest):
1. CLI flags (`--actor`, `--db`)
2. Environment variables (`ELEMENTAL_*`)
3. Config file (`.elemental/config.yaml`)
4. Built-in defaults

## Files

| File | Purpose |
|------|---------|
| `config.ts` | Main API: `loadConfig()`, `getConfig()`, `getValue()` |
| `types.ts` | Configuration types |
| `defaults.ts` | Default values |
| `validation.ts` | Configuration validation |
| `merge.ts` | Configuration merging |
| `file.ts` | File I/O: `readConfigFile()`, `writeConfigFile()` |
| `env.ts` | Environment variable loading |
| `duration.ts` | Duration string parsing |

## Configuration Structure

```typescript
interface Configuration {
  actor?: string;                    // Default actor for operations
  database: string;                  // Database path (default: 'db.sqlite')
  sync: {
    autoExport: boolean;             // Auto-export on mutation (default: true)
    exportDebounce: number;          // Debounce ms (default: 1000)
    elementsFile: string;            // JSONL path (default: 'elements.jsonl')
    dependenciesFile: string;        // Dependencies path
  };
  playbooks: {
    paths: string[];                 // Playbook search paths
  };
  tombstone: {
    ttl: number;                     // Tombstone TTL ms (default: 30 days)
    minTtl: number;                  // Minimum TTL ms
  };
  identity: {
    mode: IdentityMode;              // 'soft' | 'cryptographic' | 'hybrid'
    timeTolerance: number;           // Signature tolerance ms (default: 5 min)
  };
}
```

## Loading Configuration

```typescript
import { loadConfig, getConfig, reloadConfig } from '@elemental/sdk';

// Load with all sources
const config = loadConfig();

// Load with options
const config = loadConfig({
  configPath: '/custom/config.yaml',
  cliOverrides: { actor: 'cli-agent' },
  skipEnv: false,
  skipFile: false,
});

// Get cached config (loads if not cached)
const config = getConfig();

// Force reload
const config = reloadConfig();
```

### LoadConfigOptions

```typescript
interface LoadConfigOptions {
  configPath?: string;                   // Override config file path
  cliOverrides?: PartialConfiguration;   // CLI flag overrides
  skipEnv?: boolean;                     // Skip env vars
  skipFile?: boolean;                    // Skip config file
}
```

## Accessing Values

```typescript
import { getValue, getValueWithSource, getValueSource } from '@elemental/sdk';

// Get value
const actor = getValue('actor');
const autoExport = getValue('sync.autoExport');
const mode = getValue('identity.mode');

// Get value with source
const { value, source } = getValueWithSource('actor');
// source: 'default' | 'file' | 'environment' | 'cli'

// Get just the source
const source = getValueSource('sync.autoExport');
```

### Config Paths

```typescript
type ConfigPath =
  | 'actor'
  | 'database'
  | 'sync.autoExport'
  | 'sync.exportDebounce'
  | 'sync.elementsFile'
  | 'sync.dependenciesFile'
  | 'playbooks.paths'
  | 'tombstone.ttl'
  | 'tombstone.minTtl'
  | 'identity.mode'
  | 'identity.timeTolerance';
```

## Modifying Configuration

```typescript
import { setValue, unsetValue, saveConfig } from '@elemental/sdk';

// Set value (updates config file)
setValue('actor', 'new-agent');
setValue('sync.autoExport', false);
setValue('identity.mode', 'cryptographic');

// Remove value (falls back to default)
unsetValue('actor');

// Save entire config
saveConfig(config, '/path/to/config.yaml');
```

## Config File Management

```typescript
import {
  getConfigPath,
  configFileExists,
  discoverConfigFile,
} from '@elemental/sdk';

// Get active config path
const path = getConfigPath();

// Check existence
const exists = configFileExists();

// Discover config file
const discovery = discoverConfigFile('/project');
// { exists: boolean, path?: string }
```

## Environment Variables

| Variable | Config Path | Example |
|----------|-------------|---------|
| `ELEMENTAL_ACTOR` | `actor` | `agent-1` |
| `ELEMENTAL_DATABASE` | `database` | `db.sqlite` |
| `ELEMENTAL_SYNC_AUTO_EXPORT` | `sync.autoExport` | `true` |
| `ELEMENTAL_SYNC_EXPORT_DEBOUNCE` | `sync.exportDebounce` | `1000` |
| `ELEMENTAL_IDENTITY_MODE` | `identity.mode` | `cryptographic` |
| `ELEMENTAL_IDENTITY_TIME_TOLERANCE` | `identity.timeTolerance` | `300000` |
| `ELEMENTAL_CONFIG_PATH` | - | `/path/to/config.yaml` |

```typescript
import { loadEnvConfig, getEnvConfigPath } from '@elemental/sdk';

// Load config from env vars
const envConfig = loadEnvConfig();

// Get config path from ELEMENTAL_CONFIG_PATH
const path = getEnvConfigPath();
```

## Config File Format

`.elemental/config.yaml`:

```yaml
actor: default-agent

database: db.sqlite

sync:
  autoExport: true
  exportDebounce: 1000
  elementsFile: elements.jsonl
  dependenciesFile: dependencies.jsonl

playbooks:
  paths:
    - .elemental/playbooks
    - ~/.elemental/playbooks

tombstone:
  ttl: 2592000000  # 30 days in ms
  minTtl: 86400000 # 1 day in ms

identity:
  mode: soft
  timeTolerance: 300000  # 5 minutes in ms
```

## Duration Strings

Duration strings are supported for time values:

```typescript
import { parseDuration } from '@elemental/sdk';

parseDuration('5m');   // 300000 (5 minutes)
parseDuration('1h');   // 3600000 (1 hour)
parseDuration('7d');   // 604800000 (7 days)
parseDuration('30s');  // 30000 (30 seconds)
parseDuration('100');  // 100 (raw milliseconds)
```

**Supported units:**
- `ms` - milliseconds
- `s` - seconds
- `m` - minutes
- `h` - hours
- `d` - days
- `w` - weeks

## Validation

```typescript
import {
  validateConfiguration,
  validatePartialConfiguration,
} from '@elemental/sdk';

// Validate full config (throws on error)
validateConfiguration(config);

// Validate partial config
validatePartialConfiguration(partialConfig);
```

## Source Tracking

Track where each value came from:

```typescript
import { getTrackedConfig, type TrackedConfiguration } from '@elemental/sdk';

const tracked = getTrackedConfig();

// Each value includes source
console.log(tracked.actor);
// { value: 'agent-1', source: 'cli' }

console.log(tracked.sync.autoExport);
// { value: true, source: 'default' }
```

### ConfigSource

```typescript
type ConfigSource = 'default' | 'file' | 'environment' | 'cli';
```

## Default Values

```typescript
import { DEFAULT_CONFIG, getDefaultConfig } from '@elemental/sdk';

// Static default reference
console.log(DEFAULT_CONFIG.sync.autoExport);  // true

// Get fresh default copy
const defaults = getDefaultConfig();
```

## CLI Commands

```bash
# Show all config
el config show

# Show specific value
el config show actor
el config show sync.autoExport

# Set value
el config set actor my-agent
el config set sync.autoExport false

# Remove value
el config unset actor

# Open in editor
el config edit
```

## Integration Example

```typescript
import {
  loadConfig,
  getValue,
  setValue,
  IdentityMode,
} from '@elemental/sdk';

// Load with CLI overrides
const config = loadConfig({
  cliOverrides: {
    actor: process.env.ACTOR || 'default',
  },
});

// Access values
const actor = getValue('actor');
const mode = getValue('identity.mode');

// Modify config
if (process.env.SECURE_MODE) {
  setValue('identity.mode', IdentityMode.CRYPTOGRAPHIC);
  setValue('identity.timeTolerance', 60000);  // 1 minute
}
```

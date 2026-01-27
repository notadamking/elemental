/**
 * Configuration System Types
 *
 * Defines all configuration interfaces and types for the Elemental system.
 * Supports file-based configuration, environment variables, and CLI overrides
 * with a clear precedence hierarchy.
 */

import { IdentityMode } from '../systems/identity.js';

// ============================================================================
// Duration Type
// ============================================================================

/**
 * Duration in milliseconds
 * Can be specified as number (ms) or duration string (e.g., '5m', '500ms')
 */
export type Duration = number;

/**
 * Duration string format
 * Supported units: ms, s, m, h, d
 */
export type DurationString = `${number}${'ms' | 's' | 'm' | 'h' | 'd'}`;

// ============================================================================
// Configuration Interfaces
// ============================================================================

/**
 * Sync configuration settings
 */
export interface SyncConfig {
  /** Auto-export on mutations (default: true) */
  autoExport: boolean;
  /** Debounce interval for exports (default: 500ms) */
  exportDebounce: Duration;
  /** Elements JSONL file name (default: 'elements.jsonl') */
  elementsFile: string;
  /** Dependencies JSONL file name (default: 'dependencies.jsonl') */
  dependenciesFile: string;
}

/**
 * Playbook configuration settings
 */
export interface PlaybookConfig {
  /** Playbook search paths */
  paths: string[];
}

/**
 * Tombstone (soft delete) configuration
 */
export interface TombstoneConfig {
  /** Time-to-live for tombstones (default: 30 days = 2592000000ms) */
  ttl: Duration;
  /** Minimum TTL allowed (default: 7 days = 604800000ms) */
  minTtl: Duration;
}

/**
 * Identity system configuration
 */
export interface IdentityConfigSection {
  /** Identity verification mode (default: 'soft') */
  mode: IdentityMode;
  /** Time tolerance for signature expiry (default: 5 minutes) */
  timeTolerance: Duration;
}

/**
 * Complete Elemental configuration
 */
export interface Configuration {
  /** Default actor name for operations */
  actor?: string;
  /** Database filename (default: 'elemental.db') */
  database: string;
  /** Sync settings */
  sync: SyncConfig;
  /** Playbook settings */
  playbooks: PlaybookConfig;
  /** Tombstone settings */
  tombstone: TombstoneConfig;
  /** Identity settings */
  identity: IdentityConfigSection;
}

/**
 * Partial configuration for merging
 */
export type PartialConfiguration = {
  actor?: string;
  database?: string;
  sync?: Partial<SyncConfig>;
  playbooks?: Partial<PlaybookConfig>;
  tombstone?: Partial<TombstoneConfig>;
  identity?: Partial<IdentityConfigSection>;
};

// ============================================================================
// Configuration Source Tracking
// ============================================================================

/**
 * Source of a configuration value
 */
export const ConfigSource = {
  /** Built-in default value */
  DEFAULT: 'default',
  /** From config file */
  FILE: 'file',
  /** From environment variable */
  ENVIRONMENT: 'environment',
  /** From CLI flag */
  CLI: 'cli',
} as const;

export type ConfigSource = (typeof ConfigSource)[keyof typeof ConfigSource];

/**
 * Configuration value with source tracking
 */
export interface TrackedValue<T> {
  /** The configuration value */
  value: T;
  /** Where the value came from */
  source: ConfigSource;
}

/**
 * Configuration with source tracking for each value
 */
export interface TrackedConfiguration {
  actor?: TrackedValue<string>;
  database: TrackedValue<string>;
  sync: {
    autoExport: TrackedValue<boolean>;
    exportDebounce: TrackedValue<Duration>;
    elementsFile: TrackedValue<string>;
    dependenciesFile: TrackedValue<string>;
  };
  playbooks: {
    paths: TrackedValue<string[]>;
  };
  tombstone: {
    ttl: TrackedValue<Duration>;
    minTtl: TrackedValue<Duration>;
  };
  identity: {
    mode: TrackedValue<IdentityMode>;
    timeTolerance: TrackedValue<Duration>;
  };
}

// ============================================================================
// YAML File Format Types
// ============================================================================

/**
 * YAML configuration file structure
 * Uses snake_case to match YAML conventions
 */
export interface YamlConfigFile {
  actor?: string;
  database?: string;
  sync?: {
    auto_export?: boolean;
    export_debounce?: string | number;
    elements_file?: string;
    dependencies_file?: string;
  };
  playbooks?: {
    paths?: string[];
  };
  tombstone?: {
    ttl?: string | number;
    min_ttl?: string | number;
  };
  identity?: {
    mode?: string;
    time_tolerance?: string | number;
  };
}

// ============================================================================
// Environment Variable Mapping
// ============================================================================

/**
 * Environment variable names for configuration
 */
export const EnvVars = {
  /** Default actor name */
  ACTOR: 'ELEMENTAL_ACTOR',
  /** Database file path */
  DATABASE: 'ELEMENTAL_DB',
  /** Config file path override */
  CONFIG: 'ELEMENTAL_CONFIG',
  /** JSON output mode */
  JSON: 'ELEMENTAL_JSON',
  /** Verbose/debug mode */
  VERBOSE: 'ELEMENTAL_VERBOSE',
  /** Auto-export on mutations */
  SYNC_AUTO_EXPORT: 'ELEMENTAL_SYNC_AUTO_EXPORT',
  /** Identity mode */
  IDENTITY_MODE: 'ELEMENTAL_IDENTITY_MODE',
} as const;

export type EnvVar = (typeof EnvVars)[keyof typeof EnvVars];

// ============================================================================
// Configuration Operations
// ============================================================================

/**
 * Options for loading configuration
 */
export interface LoadConfigOptions {
  /** Override config file path */
  configPath?: string;
  /** Skip environment variables */
  skipEnv?: boolean;
  /** Skip config file loading (use defaults only) */
  skipFile?: boolean;
  /** CLI flag overrides */
  cliOverrides?: PartialConfiguration;
}

/**
 * Result of configuration file discovery
 */
export interface ConfigFileDiscovery {
  /** Path to found config file, if any */
  path?: string;
  /** Whether the file exists */
  exists: boolean;
  /** Directory containing .elemental */
  elementalDir?: string;
}

/**
 * Result of configuration validation
 */
export interface ConfigValidationResult {
  /** Whether validation passed */
  valid: boolean;
  /** Validation error messages */
  errors: string[];
  /** Warning messages (non-fatal) */
  warnings: string[];
}

// ============================================================================
// Configuration Path Types
// ============================================================================

/**
 * Valid configuration paths (as const array for runtime validation)
 */
export const VALID_CONFIG_PATHS = [
  'actor',
  'database',
  'sync.autoExport',
  'sync.exportDebounce',
  'sync.elementsFile',
  'sync.dependenciesFile',
  'playbooks.paths',
  'tombstone.ttl',
  'tombstone.minTtl',
  'identity.mode',
  'identity.timeTolerance',
] as const;

/**
 * Dot-notation paths for configuration values
 */
export type ConfigPath = (typeof VALID_CONFIG_PATHS)[number];

/**
 * Type guard to check if a string is a valid ConfigPath
 */
export function isValidConfigPath(value: string): value is ConfigPath {
  return (VALID_CONFIG_PATHS as readonly string[]).includes(value);
}

/**
 * Maps config paths to their value types
 */
export interface ConfigPathTypes {
  actor: string | undefined;
  database: string;
  'sync.autoExport': boolean;
  'sync.exportDebounce': Duration;
  'sync.elementsFile': string;
  'sync.dependenciesFile': string;
  'playbooks.paths': string[];
  'tombstone.ttl': Duration;
  'tombstone.minTtl': Duration;
  'identity.mode': IdentityMode;
  'identity.timeTolerance': Duration;
}

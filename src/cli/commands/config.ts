/**
 * config command - Manage configuration
 *
 * Subcommands:
 * - show: Display current configuration
 * - set: Set a configuration value
 * - unset: Remove a configuration value
 */

import type { Command, CommandResult, GlobalOptions } from '../types.js';
import { success, failure, ExitCode } from '../types.js';
import {
  getConfig,
  getValue,
  setValue,
  unsetValue,
  getConfigPath,
  getValueSource,
  type ConfigPath,
} from '../../config/index.js';

// ============================================================================
// Config Show
// ============================================================================

async function configShowHandler(
  args: string[],
  _options: GlobalOptions
): Promise<CommandResult> {
  try {
    const config = getConfig();
    const configPath = getConfigPath();

    if (args.length > 0) {
      // Show specific value
      const path = args[0] as ConfigPath;
      const value = getValue(path);
      const source = getValueSource(path);
      return success(
        { path, value, source },
        `${path} = ${JSON.stringify(value)} (from ${source})`
      );
    }

    // Show all config
    const lines: string[] = [
      `Configuration (from ${configPath ?? 'defaults'})`,
      '',
    ];

    for (const [section, values] of Object.entries(config)) {
      if (typeof values === 'object' && values !== null) {
        lines.push(`${section}:`);
        for (const [key, value] of Object.entries(values)) {
          lines.push(`  ${key}: ${JSON.stringify(value)}`);
        }
      } else {
        lines.push(`${section}: ${JSON.stringify(values)}`);
      }
    }

    return success(config, lines.join('\n'));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to read configuration: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

// ============================================================================
// Config Set
// ============================================================================

async function configSetHandler(
  args: string[],
  _options: GlobalOptions
): Promise<CommandResult> {
  if (args.length < 2) {
    return failure('Usage: el config set <path> <value>', ExitCode.INVALID_ARGUMENTS);
  }

  const [path, ...valueParts] = args;
  const valueStr = valueParts.join(' ');

  // Try to parse as JSON, fall back to string
  let value: unknown;
  try {
    value = JSON.parse(valueStr);
  } catch {
    value = valueStr;
  }

  try {
    setValue(path as ConfigPath, value as never);
    return success(
      { path, value },
      `Set ${path} = ${JSON.stringify(value)}`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to set configuration: ${message}`, ExitCode.VALIDATION);
  }
}

// ============================================================================
// Config Unset
// ============================================================================

async function configUnsetHandler(
  args: string[],
  _options: GlobalOptions
): Promise<CommandResult> {
  if (args.length < 1) {
    return failure('Usage: el config unset <path>', ExitCode.INVALID_ARGUMENTS);
  }

  const path = args[0];

  try {
    unsetValue(path as ConfigPath);
    return success(
      { path },
      `Unset ${path}`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to unset configuration: ${message}`, ExitCode.VALIDATION);
  }
}

// ============================================================================
// Command Definition
// ============================================================================

export const configCommand: Command = {
  name: 'config',
  description: 'Manage configuration',
  usage: 'el config <subcommand> [args]',
  help: `Manage Elemental configuration.

Configuration is loaded from (in order of precedence):
  1. CLI flags (--db, --actor)
  2. Environment variables (ELEMENTAL_*)
  3. Config file (.elemental/config.yaml)
  4. Built-in defaults`,
  handler: configShowHandler,
  subcommands: {
    show: {
      name: 'show',
      description: 'Display current configuration',
      usage: 'el config show [path]',
      help: `Display the current configuration.

If a path is specified, shows that specific value.
Otherwise, displays all configuration values.

Examples:
  el config show              Show all configuration
  el config show actor        Show actor setting
  el config show sync.autoExport  Show sync.autoExport setting`,
      handler: configShowHandler,
    },
    set: {
      name: 'set',
      description: 'Set a configuration value',
      usage: 'el config set <path> <value>',
      help: `Set a configuration value in the config file.

The value will be parsed as JSON if possible, otherwise stored as a string.

Examples:
  el config set actor myagent
  el config set sync.autoExport true
  el config set playbooks.paths '["playbooks", "templates"]'`,
      handler: configSetHandler,
    },
    unset: {
      name: 'unset',
      description: 'Remove a configuration value',
      usage: 'el config unset <path>',
      help: `Remove a configuration value from the config file.

The value will fall back to the default.

Examples:
  el config unset actor
  el config unset sync.autoExport`,
      handler: configUnsetHandler,
    },
  },
};

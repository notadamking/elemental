/**
 * Identity Commands - Identity management and whoami
 *
 * Provides CLI commands for identity operations:
 * - whoami: Show current actor context
 * - identity: Parent command for identity operations
 */

import type { Command, GlobalOptions, CommandResult } from '../types.js';
import { success, failure, ExitCode } from '../types.js';
import { getOutputMode } from '../formatter.js';
import { getValue, getValueSource, loadConfig } from '../../config/index.js';
import { IdentityMode, ActorSource } from '../../systems/identity.js';
import type { ConfigSource } from '../../config/types.js';

// ============================================================================
// Actor Resolution Helper
// ============================================================================

/**
 * Result of resolving the current actor
 */
interface ActorResolution {
  /** The resolved actor name */
  actor: string;
  /** Where the actor came from */
  source: ActorSource | ConfigSource;
  /** Whether the actor is verified (always false in soft mode) */
  verified: boolean;
  /** The identity mode */
  mode: IdentityMode;
  /** Additional details */
  details?: {
    /** Config file path if actor from config */
    configPath?: string;
    /** Environment variable name if from env */
    envVar?: string;
  };
}

/**
 * Resolves the current actor from various sources
 *
 * Priority order (highest to lowest):
 * 1. CLI --actor flag
 * 2. ELEMENTAL_ACTOR environment variable
 * 3. Config file actor setting
 * 4. Default fallback
 */
function resolveCurrentActor(options: GlobalOptions): ActorResolution {
  // Load config with CLI overrides
  const cliOverrides = options.actor ? { actor: options.actor } : undefined;
  loadConfig({ cliOverrides });

  // Get identity mode
  const mode = getValue('identity.mode');

  // Check CLI flag first
  if (options.actor) {
    return {
      actor: options.actor,
      source: ActorSource.CLI_FLAG,
      verified: false,
      mode,
    };
  }

  // Check configured actor
  const configuredActor = getValue('actor');
  if (configuredActor) {
    const source = getValueSource('actor');
    return {
      actor: configuredActor,
      source,
      verified: false,
      mode,
      details: source === 'environment' ? { envVar: 'ELEMENTAL_ACTOR' } : undefined,
    };
  }

  // No actor configured - return indication
  return {
    actor: '',
    source: ActorSource.SYSTEM,
    verified: false,
    mode,
  };
}

// ============================================================================
// Whoami Command
// ============================================================================

async function whoamiHandler(
  _args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  const resolution = resolveCurrentActor(options);
  const mode = getOutputMode(options);

  // Build data object for JSON output
  const data = {
    actor: resolution.actor || null,
    source: resolution.source,
    verified: resolution.verified,
    identityMode: resolution.mode,
    ...(resolution.details && { details: resolution.details }),
  };

  if (mode === 'json') {
    return success(data);
  }

  if (mode === 'quiet') {
    if (!resolution.actor) {
      return failure('No actor configured', ExitCode.NOT_FOUND);
    }
    return success(resolution.actor);
  }

  // Human-readable output
  if (!resolution.actor) {
    const lines = [
      'No actor configured.',
      '',
      'Set an actor using one of:',
      '  --actor <name>            CLI flag (highest priority)',
      '  ELEMENTAL_ACTOR=<name>    Environment variable',
      '  el config set actor <name>  Configuration file',
    ];
    return success(data, lines.join('\n'));
  }

  // Build formatted output
  const lines: string[] = [];
  lines.push(`Actor: ${resolution.actor}`);
  lines.push(`Source: ${formatSource(resolution.source)}`);
  lines.push(`Identity Mode: ${resolution.mode}`);
  lines.push(`Verified: ${resolution.verified ? 'yes' : 'no'}`);

  if (resolution.details?.envVar) {
    lines.push(`Environment Variable: ${resolution.details.envVar}`);
  }

  return success(data, lines.join('\n'));
}

/**
 * Formats a source value for human display
 */
function formatSource(source: ActorSource | ConfigSource): string {
  switch (source) {
    case ActorSource.CLI_FLAG:
    case 'cli':
      return 'CLI --actor flag';
    case ActorSource.CONFIG:
    case 'file':
      return 'configuration file';
    case 'environment':
      return 'environment variable';
    case ActorSource.EXPLICIT:
      return 'explicit';
    case ActorSource.ELEMENT:
      return 'element';
    case ActorSource.SYSTEM:
      return 'system';
    case 'default':
      return 'default';
    default:
      return String(source);
  }
}

export const whoamiCommand: Command = {
  name: 'whoami',
  description: 'Show current actor identity',
  usage: 'el whoami',
  help: `Display the current actor identity and how it was determined.

The actor is resolved from multiple sources in priority order:
  1. CLI --actor flag (highest priority)
  2. ELEMENTAL_ACTOR environment variable
  3. Configuration file (actor setting)
  4. No actor (operations will require explicit actor)

Output includes:
  - Actor name
  - Source of the actor identity
  - Identity mode (soft, cryptographic, hybrid)
  - Verification status

Examples:
  el whoami
  el whoami --json
  el --actor myagent whoami`,
  options: [],
  handler: whoamiHandler as Command['handler'],
};

// ============================================================================
// Identity Parent Command
// ============================================================================

async function identityHandler(
  args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  // If no subcommand, show current identity (same as whoami)
  return whoamiHandler(args, options);
}

export const identityCommand: Command = {
  name: 'identity',
  description: 'Manage identity settings',
  usage: 'el identity [subcommand]',
  help: `Manage identity settings and view current actor.

Without a subcommand, shows the current actor identity (same as 'el whoami').

Subcommands:
  whoami    Show current actor identity
  mode      Show or set identity mode

Examples:
  el identity              Show current identity
  el identity whoami       Same as above
  el identity mode         Show current identity mode
  el identity mode soft    Set identity mode to soft`,
  handler: identityHandler as Command['handler'],
  subcommands: {
    whoami: whoamiCommand,
    mode: {
      name: 'mode',
      description: 'Show or set identity mode',
      usage: 'el identity mode [mode]',
      help: `Show or set the identity verification mode.

Available modes:
  soft          Name-based identity without verification (default)
  cryptographic Key-based identity with signature verification
  hybrid        Accepts both verified and unverified actors

Examples:
  el identity mode              Show current mode
  el identity mode soft         Set to soft mode
  el identity mode cryptographic  Set to cryptographic mode`,
      options: [],
      handler: async (args: string[], options: GlobalOptions): Promise<CommandResult> => {
        const mode = getOutputMode(options);

        if (args.length === 0) {
          // Show current mode
          loadConfig();
          const currentMode = getValue('identity.mode');
          const source = getValueSource('identity.mode');

          const data = { mode: currentMode, source };

          if (mode === 'json') {
            return success(data);
          }

          if (mode === 'quiet') {
            return success(currentMode);
          }

          return success(data, `Identity mode: ${currentMode} (from ${source})`);
        }

        // Set mode
        const newMode = args[0].toLowerCase();
        const validModes = Object.values(IdentityMode);

        if (!validModes.includes(newMode as IdentityMode)) {
          return failure(
            `Invalid identity mode: ${newMode}. Must be one of: ${validModes.join(', ')}`,
            ExitCode.VALIDATION
          );
        }

        try {
          const { setValue } = await import('../../config/index.js');
          setValue('identity.mode', newMode as IdentityMode);

          const data = { mode: newMode, previous: getValue('identity.mode') };

          if (mode === 'json') {
            return success(data);
          }

          if (mode === 'quiet') {
            return success(newMode);
          }

          return success(data, `Identity mode set to: ${newMode}`);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return failure(`Failed to set identity mode: ${message}`, ExitCode.GENERAL_ERROR);
        }
      },
    },
  },
};

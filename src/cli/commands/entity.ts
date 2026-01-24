/**
 * Entity Commands - Entity registration and listing
 *
 * Provides CLI commands for entity operations:
 * - entity register: Register a new entity (agent, human, or system)
 * - entity list: List all registered entities
 */

import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Command, GlobalOptions, CommandResult, CommandOption } from '../types.js';
import { success, failure, ExitCode } from '../types.js';
import { getOutputMode } from '../formatter.js';
import { createStorage, initializeSchema } from '../../storage/index.js';
import { createElementalAPI } from '../../api/elemental-api.js';
import { createEntity, EntityTypeValue, type Entity, type CreateEntityInput } from '../../types/entity.js';
import type { Element, EntityId } from '../../types/element.js';
import type { ElementalAPI } from '../../api/types.js';
import { ValidationError, ConflictError } from '../../errors/error.js';
import { getValue, loadConfig } from '../../config/index.js';

// ============================================================================
// Constants
// ============================================================================

const ELEMENTAL_DIR = '.elemental';
const DEFAULT_DB_NAME = 'elemental.db';

// ============================================================================
// Database Helper
// ============================================================================

/**
 * Resolves database path from options or default location
 */
function resolveDatabasePath(options: GlobalOptions): string | null {
  if (options.db) {
    return options.db;
  }

  // Look for .elemental directory
  const elementalDir = join(process.cwd(), ELEMENTAL_DIR);
  if (existsSync(elementalDir)) {
    return join(elementalDir, DEFAULT_DB_NAME);
  }

  return null;
}

/**
 * Creates API instance with database connection
 */
async function createAPI(options: GlobalOptions): Promise<ElementalAPI | null> {
  const dbPath = resolveDatabasePath(options);
  if (!dbPath) {
    return null;
  }

  // Ensure directory exists
  const dir = dirname(dbPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const backend = createStorage({ path: dbPath, create: true });
  initializeSchema(backend);
  return createElementalAPI(backend);
}

/**
 * Get the current actor from options or config
 */
function getActor(options: GlobalOptions): string {
  if (options.actor) {
    return options.actor;
  }
  loadConfig();
  return getValue('actor') || 'anonymous';
}

// ============================================================================
// Entity Register Command
// ============================================================================

interface RegisterOptions extends GlobalOptions {
  type?: string;
  'public-key'?: string;
  tag?: string[];
}

async function entityRegisterHandler(
  args: string[],
  options: RegisterOptions
): Promise<CommandResult> {
  if (args.length === 0) {
    return failure('Usage: el entity register <name> [--type <type>]', ExitCode.INVALID_ARGUMENTS);
  }

  const name = args[0];
  const entityType = (options.type || 'agent') as EntityTypeValue;

  // Validate entity type
  const validTypes = Object.values(EntityTypeValue);
  if (!validTypes.includes(entityType)) {
    return failure(
      `Invalid entity type: ${entityType}. Must be one of: ${validTypes.join(', ')}`,
      ExitCode.VALIDATION
    );
  }

  try {
    const api = await createAPI(options);
    if (!api) {
      return failure(
        'No workspace found. Run "el init" to initialize a workspace.',
        ExitCode.NOT_FOUND
      );
    }

    const actor = getActor(options);
    const tags = options.tag || [];
    const publicKey = options['public-key'];

    const input: CreateEntityInput = {
      name,
      entityType,
      createdBy: actor as EntityId,
      ...(publicKey && { publicKey }),
      ...(tags.length > 0 && { tags }),
    };

    // Create the entity
    const entity = await createEntity(input);
    // Persist to database
    const created = await api.create(entity as unknown as Element & Record<string, unknown>);

    const mode = getOutputMode(options);

    if (mode === 'json') {
      return success(created);
    }

    if (mode === 'quiet') {
      return success(created.id);
    }

    return success(
      created,
      `Registered ${entityType} entity: ${name} (${created.id})`
    );
  } catch (err) {
    if (err instanceof ValidationError) {
      return failure(`Validation error: ${err.message}`, ExitCode.VALIDATION);
    }
    if (err instanceof ConflictError) {
      return failure(`Entity already exists: ${err.message}`, ExitCode.VALIDATION);
    }
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to register entity: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

const registerOptions: CommandOption[] = [
  {
    name: 'type',
    short: 't',
    description: 'Entity type: agent, human, or system (default: agent)',
    hasValue: true,
  },
  {
    name: 'public-key',
    description: 'Base64-encoded Ed25519 public key for cryptographic identity',
    hasValue: true,
  },
  {
    name: 'tag',
    description: 'Tag to add to entity (can be repeated)',
    hasValue: true,
    array: true,
  },
];

// ============================================================================
// Entity List Command
// ============================================================================

interface ListOptions extends GlobalOptions {
  type?: string;
  limit?: number;
}

async function entityListHandler(
  _args: string[],
  options: ListOptions
): Promise<CommandResult> {
  try {
    const api = await createAPI(options);
    if (!api) {
      return failure(
        'No workspace found. Run "el init" to initialize a workspace.',
        ExitCode.NOT_FOUND
      );
    }

    // Build filter
    const filter: Record<string, unknown> = {
      type: 'entity' as const,
    };

    if (options.limit) {
      filter.limit = options.limit;
    }

    // Get entities
    const entities = await api.list<Entity>(filter);

    // Filter by entity type if specified
    let filteredEntities = entities;
    if (options.type) {
      filteredEntities = entities.filter((e) => e.entityType === options.type);
    }

    const mode = getOutputMode(options);

    if (mode === 'json') {
      return success(filteredEntities);
    }

    if (mode === 'quiet') {
      return success(filteredEntities.map((e) => e.id).join('\n'));
    }

    if (filteredEntities.length === 0) {
      return success(filteredEntities, 'No entities found.');
    }

    // Human-readable output
    const lines: string[] = [];
    lines.push('Entities:');
    lines.push('');

    for (const entity of filteredEntities) {
      const typeIcon = getEntityTypeIcon(entity.entityType);
      const keyIndicator = entity.publicKey ? ' 🔑' : '';
      lines.push(`${typeIcon} ${entity.name} (${entity.id})${keyIndicator}`);
      lines.push(`   Type: ${entity.entityType}`);
      if (entity.tags.length > 0) {
        lines.push(`   Tags: ${entity.tags.join(', ')}`);
      }
    }

    lines.push('');
    lines.push(`Total: ${filteredEntities.length} entities`);

    return success(filteredEntities, lines.join('\n'));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to list entities: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

function getEntityTypeIcon(entityType: EntityTypeValue): string {
  switch (entityType) {
    case EntityTypeValue.AGENT:
      return '[A]';
    case EntityTypeValue.HUMAN:
      return '[H]';
    case EntityTypeValue.SYSTEM:
      return '[S]';
    default:
      return '[?]';
  }
}

const listOptions: CommandOption[] = [
  {
    name: 'type',
    short: 't',
    description: 'Filter by entity type: agent, human, or system',
    hasValue: true,
  },
  {
    name: 'limit',
    short: 'n',
    description: 'Maximum number of entities to return',
    hasValue: true,
  },
];

// ============================================================================
// Command Definitions
// ============================================================================

export const entityRegisterCommand: Command = {
  name: 'register',
  description: 'Register a new entity',
  usage: 'el entity register <name> [--type <type>]',
  help: `Register a new entity in the system.

Entities represent identities - AI agents, humans, or system processes.
They are the actors that create and interact with elements.

Options:
  --type, -t    Entity type: agent, human, or system (default: agent)
  --public-key  Base64-encoded Ed25519 public key for cryptographic identity
  --tag         Tag to add to entity (can be repeated)

Examples:
  el entity register claude --type agent
  el entity register bob --type human
  el entity register ci-system --type system
  el entity register alice --tag team-alpha --tag frontend`,
  options: registerOptions,
  handler: entityRegisterHandler as Command['handler'],
};

export const entityListCommand: Command = {
  name: 'list',
  description: 'List all registered entities',
  usage: 'el entity list [--type <type>]',
  help: `List all registered entities.

Options:
  --type, -t    Filter by entity type: agent, human, or system
  --limit, -n   Maximum number of entities to return

Examples:
  el entity list
  el entity list --type agent
  el entity list --type human --limit 10
  el entity list --json`,
  options: listOptions,
  handler: entityListHandler as Command['handler'],
};

export const entityCommand: Command = {
  name: 'entity',
  description: 'Manage entities (agents, humans, systems)',
  usage: 'el entity <subcommand>',
  help: `Manage entities in the system.

Entities represent identities - AI agents, humans, or system processes.
They are used for attribution, assignment, and access control.

Subcommands:
  register    Register a new entity
  list        List all registered entities

Examples:
  el entity register claude --type agent
  el entity list
  el entity list --type human`,
  handler: async (args: string[], options: GlobalOptions): Promise<CommandResult> => {
    // Default to list if no subcommand
    return entityListHandler(args, options as ListOptions);
  },
  subcommands: {
    register: entityRegisterCommand,
    list: entityListCommand,
  },
};

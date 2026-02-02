/**
 * init command - Initialize a new Elemental workspace
 *
 * Creates the .elemental/ directory with:
 * - Empty database with default operator entity
 * - Default configuration file
 * - gitignore file
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Command, GlobalOptions, CommandResult } from '../types.js';
import { success, failure, ExitCode } from '../types.js';
import { createStorage, initializeSchema } from '@elemental/storage';
import { createElementalAPI } from '../../api/elemental-api.js';
import {
  ElementType,
  createTimestamp,
  type Entity,
  type EntityId,
  type ElementId,
} from '@elemental/core';
import { EntityTypeValue } from '@elemental/core';

// ============================================================================
// Constants
// ============================================================================

const ELEMENTAL_DIR = '.elemental';
const CONFIG_FILENAME = 'config.yaml';
const GITIGNORE_FILENAME = '.gitignore';
const DEFAULT_DB_NAME = 'elemental.db';

/**
 * Default operator entity ID - used as the CLI user and default actor
 */
export const OPERATOR_ENTITY_ID = 'el-0000' as EntityId;

/**
 * Default operator entity name
 */
export const OPERATOR_ENTITY_NAME = 'operator';

// ============================================================================
// Default Content
// ============================================================================

const DEFAULT_CONFIG = `# Elemental Configuration
# See https://github.com/elemental/elemental for documentation

# Default actor for operations (optional)
# actor: my-agent

# Database path (relative to .elemental/)
database: elemental.db

# Sync settings
sync:
  auto_export: false
  elements_file: elements.jsonl
  dependencies_file: dependencies.jsonl

# Playbook search paths
playbooks:
  paths:
    - playbooks

# Identity settings
identity:
  mode: soft
`;

const DEFAULT_GITIGNORE = `# Elemental gitignore
*.db
*.db-journal
*.db-wal
*.db-shm
`;

// ============================================================================
// Command Options
// ============================================================================

interface InitOptions {
  name?: string;
  actor?: string;
}

// ============================================================================
// Handler
// ============================================================================

async function initHandler(
  _args: string[],
  options: GlobalOptions & InitOptions
): Promise<CommandResult> {
  const workDir = process.cwd();
  const elementalDir = join(workDir, ELEMENTAL_DIR);

  // Check if already initialized
  if (existsSync(elementalDir)) {
    return failure(
      `Workspace already initialized at ${elementalDir}`,
      ExitCode.VALIDATION
    );
  }

  try {
    // Create .elemental directory
    mkdirSync(elementalDir, { recursive: true });

    // Create config file
    let config = DEFAULT_CONFIG;
    if (options.actor) {
      config = config.replace('# actor: my-agent', `actor: ${options.actor}`);
    }
    writeFileSync(join(elementalDir, CONFIG_FILENAME), config);

    // Create gitignore
    writeFileSync(join(elementalDir, GITIGNORE_FILENAME), DEFAULT_GITIGNORE);

    // Create playbooks directory
    mkdirSync(join(elementalDir, 'playbooks'), { recursive: true });

    // Create the database and operator entity
    const dbPath = join(elementalDir, DEFAULT_DB_NAME);
    const backend = createStorage({ path: dbPath, create: true });
    initializeSchema(backend);
    const api = createElementalAPI(backend);

    // Create the default operator entity (el-0000)
    const now = createTimestamp();
    const operatorEntity: Entity = {
      id: OPERATOR_ENTITY_ID as unknown as ElementId,
      type: ElementType.ENTITY,
      createdAt: now,
      updatedAt: now,
      createdBy: OPERATOR_ENTITY_ID,
      tags: [],
      metadata: {},
      name: OPERATOR_ENTITY_NAME,
      entityType: EntityTypeValue.HUMAN,
    };

    await api.create(operatorEntity as unknown as Record<string, unknown> & { createdBy: EntityId });

    return success(
      { path: elementalDir, operatorId: OPERATOR_ENTITY_ID },
      `Initialized Elemental workspace at ${elementalDir}\nCreated default operator entity: ${OPERATOR_ENTITY_ID}`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to initialize workspace: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

// ============================================================================
// Command Definition
// ============================================================================

export const initCommand: Command = {
  name: 'init',
  description: 'Initialize a new Elemental workspace',
  usage: 'el init [--name <name>] [--actor <actor>]',
  help: `Initialize a new Elemental workspace in the current directory.

Creates a .elemental/ directory containing:
  - config.yaml     Default configuration file
  - elemental.db    SQLite database with default operator entity
  - .gitignore      Git ignore patterns for database files
  - playbooks/      Directory for playbook definitions

The database is created with a default "operator" entity (el-0000) that serves
as the default actor for CLI operations and web applications.`,
  options: [
    {
      name: 'name',
      description: 'Workspace name (optional)',
      hasValue: true,
    },
    {
      name: 'actor',
      description: 'Default actor for operations',
      hasValue: true,
    },
  ],
  handler: initHandler as Command['handler'],
};

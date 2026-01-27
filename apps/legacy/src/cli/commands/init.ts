/**
 * init command - Initialize a new Elemental workspace
 *
 * Creates the .elemental/ directory with:
 * - Empty database
 * - Default configuration file
 * - gitignore file
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Command, GlobalOptions, CommandResult } from '../types.js';
import { success, failure, ExitCode } from '../types.js';

// ============================================================================
// Constants
// ============================================================================

const ELEMENTAL_DIR = '.elemental';
const CONFIG_FILENAME = 'config.yaml';
const GITIGNORE_FILENAME = '.gitignore';

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

    // Note: Database will be created on first use by the storage backend

    return success(
      { path: elementalDir },
      `Initialized Elemental workspace at ${elementalDir}`
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
  - config.yaml   Default configuration file
  - .gitignore    Git ignore patterns for database files
  - playbooks/    Directory for playbook definitions

The database file will be created automatically on first use.`,
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

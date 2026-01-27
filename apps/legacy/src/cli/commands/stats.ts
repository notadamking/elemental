/**
 * Stats Command - Show system statistics
 *
 * Displays various statistics about the Elemental workspace.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Command, GlobalOptions, CommandResult } from '../types.js';
import { success, failure, ExitCode } from '../types.js';
import { createStorage, initializeSchema } from '../../storage/index.js';
import { createElementalAPI } from '../../api/elemental-api.js';
import type { ElementalAPI } from '../../api/types.js';

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
function resolveDatabasePath(options: GlobalOptions, requireExists: boolean = true): string | null {
  if (options.db) {
    if (requireExists && !existsSync(options.db)) {
      return null;
    }
    return options.db;
  }

  // Look for .elemental directory
  const elementalDir = join(process.cwd(), ELEMENTAL_DIR);
  if (existsSync(elementalDir)) {
    const dbPath = join(elementalDir, DEFAULT_DB_NAME);
    if (requireExists && !existsSync(dbPath)) {
      return null;
    }
    return dbPath;
  }

  return null;
}

/**
 * Creates an API instance from options
 */
function createAPI(options: GlobalOptions): { api: ElementalAPI; error?: string } {
  const dbPath = resolveDatabasePath(options);
  if (!dbPath) {
    return {
      api: null as unknown as ElementalAPI,
      error: 'No database found. Run "el init" to initialize a workspace, or specify --db path',
    };
  }

  try {
    const backend = createStorage({ path: dbPath, create: true });
    initializeSchema(backend);
    return { api: createElementalAPI(backend) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      api: null as unknown as ElementalAPI,
      error: `Failed to open database: ${message}`,
    };
  }
}

// ============================================================================
// Stats Handler
// ============================================================================

/**
 * Format bytes to human-readable size
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

async function statsHandler(
  _args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    const stats = await api.stats();

    // Build human-readable output
    const lines: string[] = [];

    lines.push('Workspace Statistics');
    lines.push('');

    // Element counts
    lines.push('Elements:');
    lines.push(`  Total: ${stats.totalElements}`);
    for (const [type, count] of Object.entries(stats.elementsByType)) {
      if (count > 0) {
        lines.push(`  ${type}: ${count}`);
      }
    }
    lines.push('');

    // Task status
    lines.push('Tasks:');
    lines.push(`  Ready: ${stats.readyTasks}`);
    lines.push(`  Blocked: ${stats.blockedTasks}`);
    lines.push('');

    // Dependencies and events
    lines.push('Relations:');
    lines.push(`  Dependencies: ${stats.totalDependencies}`);
    lines.push(`  Events: ${stats.totalEvents}`);
    lines.push('');

    // Database size
    lines.push('Storage:');
    lines.push(`  Database size: ${formatBytes(stats.databaseSize)}`);

    return success(stats, lines.join('\n'));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to get stats: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

// ============================================================================
// Command Definition
// ============================================================================

export const statsCommand: Command = {
  name: 'stats',
  description: 'Show workspace statistics',
  usage: 'el stats',
  help: `Show statistics about the Elemental workspace.

Displays:
- Total element counts by type
- Ready and blocked task counts
- Dependency and event counts
- Database size

Examples:
  el stats              Show all statistics
  el stats --json       Output as JSON`,
  handler: statsHandler,
};

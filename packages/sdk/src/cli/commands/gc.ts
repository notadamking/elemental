/**
 * Garbage Collection Commands - Clean up ephemeral data
 *
 * Provides commands for:
 * - gc tasks: Garbage collect old ephemeral tasks
 * - gc workflows: Garbage collect old ephemeral workflows
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Command, GlobalOptions, CommandResult, CommandOption } from '../types.js';
import { success, failure, ExitCode } from '../types.js';
import { getFormatter, getOutputMode } from '../formatter.js';
import { createStorage, initializeSchema } from '@elemental/storage';
import { createElementalAPI } from '../../api/elemental-api.js';
import type { ElementalAPI } from '../../api/types.js';
import type { Workflow } from '@elemental/core';

// ============================================================================
// Constants
// ============================================================================

const ELEMENTAL_DIR = '.elemental';
const DEFAULT_DB_NAME = 'elemental.db';
const DEFAULT_GC_AGE_DAYS = 1; // 24 hours
const MS_PER_DAY = 24 * 60 * 60 * 1000;

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
// GC Tasks Command
// ============================================================================

interface GcTasksOptions {
  age?: string;
  'dry-run'?: boolean;
  limit?: string;
}

const gcTasksOptions: CommandOption[] = [
  {
    name: 'age',
    short: 'a',
    description: `Maximum age in days (default: ${DEFAULT_GC_AGE_DAYS})`,
    hasValue: true,
  },
  {
    name: 'dry-run',
    description: 'Show what would be deleted without deleting',
    hasValue: false,
  },
  {
    name: 'limit',
    short: 'l',
    description: 'Maximum number of tasks to delete',
    hasValue: true,
  },
];

async function gcTasksHandler(
  _args: string[],
  options: GlobalOptions & GcTasksOptions
): Promise<CommandResult> {
  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    // Parse age option (in days)
    const ageDays = options.age ? parseFloat(options.age) : DEFAULT_GC_AGE_DAYS;
    if (isNaN(ageDays) || ageDays < 0) {
      return failure('Invalid age value. Must be a positive number.', ExitCode.INVALID_ARGUMENTS);
    }
    const maxAgeMs = ageDays * MS_PER_DAY;

    // Parse limit option
    const limit = options.limit ? parseInt(options.limit, 10) : undefined;
    if (options.limit && (isNaN(limit!) || limit! < 1)) {
      return failure('Invalid limit value. Must be a positive integer.', ExitCode.INVALID_ARGUMENTS);
    }

    const dryRun = !!options['dry-run'];

    // Task GC is now a no-op - tasks no longer have an ephemeral property.
    // Only workflows can be ephemeral, and their tasks are GC'd via garbageCollectWorkflows().
    const gcResult = await api.garbageCollectTasks({
      maxAgeMs,
      dryRun,
      limit,
    });

    if (gcResult.tasksDeleted === 0) {
      return success(
        { deleted: 0 },
        'No tasks eligible for garbage collection (tasks are now GC\'d via their parent workflows)'
      );
    }

    return success(
      gcResult,
      `Garbage collected ${gcResult.tasksDeleted} task(s), ${gcResult.dependenciesDeleted} dependency(ies)`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to garbage collect tasks: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

const gcTasksCommand: Command = {
  name: 'tasks',
  description: 'Garbage collect old tasks (deprecated - use "el gc workflows" instead)',
  usage: 'el gc tasks [options]',
  help: `Garbage collect old tasks.

NOTE: This command is now a no-op. Tasks no longer have an ephemeral property.
Only workflows can be ephemeral, and their child tasks are garbage collected
automatically when you run 'el gc workflows'.

Use 'el gc workflows' to garbage collect ephemeral workflows and their tasks.

Options:
  -a, --age <days>   Maximum age in days (default: ${DEFAULT_GC_AGE_DAYS})
  -l, --limit <n>    Maximum number of tasks to delete
      --dry-run      Show what would be deleted without deleting

Examples:
  el gc workflows          # Recommended: GC workflows and their tasks
  el gc tasks              # No-op, kept for backwards compatibility`,
  options: gcTasksOptions,
  handler: gcTasksHandler as Command['handler'],
};

// ============================================================================
// GC Workflows Command
// ============================================================================

interface GcWorkflowsOptions {
  age?: string;
  'dry-run'?: boolean;
  limit?: string;
}

const gcWorkflowsOptions: CommandOption[] = [
  {
    name: 'age',
    short: 'a',
    description: `Maximum age in days (default: ${DEFAULT_GC_AGE_DAYS})`,
    hasValue: true,
  },
  {
    name: 'dry-run',
    description: 'Show what would be deleted without deleting',
    hasValue: false,
  },
  {
    name: 'limit',
    short: 'l',
    description: 'Maximum number of workflows to delete',
    hasValue: true,
  },
];

async function gcWorkflowsHandler(
  _args: string[],
  options: GlobalOptions & GcWorkflowsOptions
): Promise<CommandResult> {
  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    const mode = getOutputMode(options);
    const formatter = getFormatter(mode);

    // Parse age option (in days)
    const ageDays = options.age ? parseFloat(options.age) : DEFAULT_GC_AGE_DAYS;
    if (isNaN(ageDays) || ageDays < 0) {
      return failure('Invalid age value. Must be a positive number.', ExitCode.INVALID_ARGUMENTS);
    }
    const maxAgeMs = ageDays * MS_PER_DAY;

    // Parse limit option
    const limit = options.limit ? parseInt(options.limit, 10) : undefined;
    if (options.limit && (isNaN(limit!) || limit! < 1)) {
      return failure('Invalid limit value. Must be a positive integer.', ExitCode.INVALID_ARGUMENTS);
    }

    const dryRun = !!options['dry-run'];

    // If dry run, show what would be deleted first
    if (dryRun) {
      // Get eligible workflows without deleting
      const allWorkflows = await api.list<Workflow>({ type: 'workflow' });
      const terminalStatuses = ['completed', 'failed', 'cancelled'];
      const now = Date.now();

      const eligibleWorkflows = allWorkflows.filter(workflow => {
        if (!workflow.ephemeral) return false;
        if (!terminalStatuses.includes(workflow.status)) return false;
        if (!workflow.finishedAt) return false;
        const finishedTime = new Date(workflow.finishedAt).getTime();
        return now - finishedTime >= maxAgeMs;
      });

      // Apply limit for display
      const toShow = limit ? eligibleWorkflows.slice(0, limit) : eligibleWorkflows;

      if (toShow.length === 0) {
        return success({ wouldDelete: [], count: 0 }, 'No workflows eligible for garbage collection');
      }

      if (mode === 'json') {
        return success({
          wouldDelete: toShow.map(w => w.id),
          count: toShow.length,
        });
      }

      if (mode === 'quiet') {
        return success(toShow.map(w => w.id).join('\n'));
      }

      const headers = ['ID', 'TITLE', 'STATUS', 'FINISHED'];
      const rows = toShow.map(w => [
        w.id,
        w.title.length > 40 ? w.title.substring(0, 37) + '...' : w.title,
        w.status,
        w.finishedAt ? w.finishedAt.split('T')[0] : '-',
      ]);

      const table = formatter.table(headers, rows);
      return success(
        { wouldDelete: toShow.map(w => w.id), count: toShow.length },
        `Would delete ${toShow.length} workflow(s):\n${table}`
      );
    }

    // Actually run garbage collection
    const gcResult = await api.garbageCollectWorkflows({
      maxAgeMs,
      dryRun: false,
      limit,
    });

    if (gcResult.workflowsDeleted === 0) {
      return success({ deleted: 0 }, 'No workflows eligible for garbage collection');
    }

    return success(
      gcResult,
      `Garbage collected ${gcResult.workflowsDeleted} workflow(s), ${gcResult.tasksDeleted} task(s), ${gcResult.dependenciesDeleted} dependency(ies)`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to garbage collect workflows: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

const gcWorkflowsCommand: Command = {
  name: 'workflows',
  description: 'Garbage collect old ephemeral workflows',
  usage: 'el gc workflows [options]',
  help: `Delete old ephemeral workflows that have reached a terminal state.

Workflows are eligible for garbage collection if they are:
- Ephemeral (not durable)
- In a terminal state (completed, failed, or cancelled)
- Older than the specified age

Note: Deleting a workflow also deletes all tasks that belong to it.

Options:
  -a, --age <days>   Maximum age in days (default: ${DEFAULT_GC_AGE_DAYS})
  -l, --limit <n>    Maximum number of workflows to delete
      --dry-run      Show what would be deleted without deleting

Examples:
  el gc workflows
  el gc workflows --age 7
  el gc workflows --dry-run`,
  options: gcWorkflowsOptions,
  handler: gcWorkflowsHandler as Command['handler'],
};

// ============================================================================
// GC Root Command
// ============================================================================

export const gcCommand: Command = {
  name: 'gc',
  description: 'Garbage collect old ephemeral data',
  usage: 'el gc <subcommand> [options]',
  help: `Garbage collect old ephemeral data.

Elemental supports ephemeral tasks and workflows that are not synced to permanent
storage. These can accumulate over time and should be periodically cleaned up.

Subcommands:
  tasks       Garbage collect old ephemeral tasks
  workflows   Garbage collect old ephemeral workflows

By default, items must be at least ${DEFAULT_GC_AGE_DAYS} day(s) old to be eligible for garbage collection.
Use --age to change this threshold.

Examples:
  el gc tasks                    Delete old ephemeral tasks
  el gc tasks --dry-run          Preview what would be deleted
  el gc workflows                Delete old ephemeral workflows
  el gc workflows --age 7        Delete workflows older than 7 days`,
  subcommands: {
    tasks: gcTasksCommand,
    workflows: gcWorkflowsCommand,
  },
  handler: async (args, options): Promise<CommandResult> => {
    if (args.length === 0) {
      return failure(
        `Missing subcommand. Use 'el gc tasks' or 'el gc workflows'. Run 'el gc --help' for more information.`,
        ExitCode.INVALID_ARGUMENTS
      );
    }
    return failure(
      `Unknown subcommand: ${args[0]}. Use 'el gc --help' for available subcommands.`,
      ExitCode.INVALID_ARGUMENTS
    );
  },
};

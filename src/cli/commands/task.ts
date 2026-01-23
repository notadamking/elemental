/**
 * Task Commands - Task-specific CLI operations
 *
 * Provides CLI commands for task management:
 * - ready: List tasks ready for work
 * - blocked: List blocked tasks with reasons
 * - close: Close a task
 * - reopen: Reopen a closed task
 * - assign: Assign a task to an entity
 * - defer: Defer a task
 * - undefer: Remove deferral from a task
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Command, GlobalOptions, CommandResult, CommandOption } from '../types.js';
import { success, failure, ExitCode } from '../types.js';
import { getFormatter, getOutputMode } from '../formatter.js';
import { BunStorageBackend } from '../../storage/bun-backend.js';
import { initializeSchema } from '../../storage/schema.js';
import { createElementalAPI } from '../../api/elemental-api.js';
import {
  TaskStatus,
  updateTaskStatus,
  isValidStatusTransition,
  type Task,
  type Priority,
} from '../../types/task.js';
import type { ElementId, EntityId } from '../../types/element.js';
import type { ElementalAPI, TaskFilter, BlockedTask } from '../../api/types.js';

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
    const backend = new BunStorageBackend({ path: dbPath, create: true });
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
// Ready Command
// ============================================================================

interface ReadyOptions {
  assignee?: string;
  priority?: string;
  type?: string;
  limit?: string;
}

const readyOptions: CommandOption[] = [
  {
    name: 'assignee',
    short: 'a',
    description: 'Filter by assignee',
    hasValue: true,
  },
  {
    name: 'priority',
    short: 'p',
    description: 'Filter by priority (1-5)',
    hasValue: true,
  },
  {
    name: 'type',
    short: 't',
    description: 'Filter by task type (bug, feature, task, chore)',
    hasValue: true,
  },
  {
    name: 'limit',
    short: 'l',
    description: 'Maximum number of results',
    hasValue: true,
  },
];

async function readyHandler(
  _args: string[],
  options: GlobalOptions & ReadyOptions
): Promise<CommandResult> {
  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    // Build filter from options
    const filter: TaskFilter = {};

    if (options.assignee) {
      filter.assignee = options.assignee as EntityId;
    }

    if (options.priority) {
      const priority = parseInt(options.priority, 10);
      if (isNaN(priority) || priority < 1 || priority > 5) {
        return failure('Priority must be a number from 1 to 5', ExitCode.VALIDATION);
      }
      filter.priority = priority as Priority;
    }

    if (options.type) {
      filter.taskType = options.type as TaskFilter['taskType'];
    }

    if (options.limit) {
      const limit = parseInt(options.limit, 10);
      if (isNaN(limit) || limit < 1) {
        return failure('Limit must be a positive number', ExitCode.VALIDATION);
      }
      filter.limit = limit;
    }

    // Get ready tasks
    const tasks = await api.ready(filter);

    // Format output based on mode
    const mode = getOutputMode(options);
    const formatter = getFormatter(mode);

    if (mode === 'json') {
      return success(tasks);
    }

    if (mode === 'quiet') {
      return success(tasks.map((t) => t.id).join('\n'));
    }

    // Human-readable output
    if (tasks.length === 0) {
      return success(null, 'No ready tasks found');
    }

    // Build table data
    const headers = ['ID', 'TITLE', 'PRIORITY', 'ASSIGNEE', 'TYPE'];
    const rows = tasks.map((task) => [
      task.id,
      task.title.length > 40 ? task.title.substring(0, 37) + '...' : task.title,
      `P${task.priority}`,
      task.assignee ?? '-',
      task.taskType,
    ]);

    const table = formatter.table(headers, rows);
    const summary = `\n${tasks.length} ready task(s)`;

    return success(tasks, table + summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to get ready tasks: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

export const readyCommand: Command = {
  name: 'ready',
  description: 'List tasks ready for work',
  usage: 'el ready [options]',
  help: `List tasks that are ready for work.

Ready tasks are:
- Status is 'open' or 'in_progress'
- Not blocked by any dependency
- scheduledFor is null or in the past

Options:
  -a, --assignee <id>    Filter by assignee entity ID
  -p, --priority <1-5>   Filter by priority
  -t, --type <type>      Filter by task type (bug, feature, task, chore)
  -l, --limit <n>        Maximum number of results

Examples:
  el ready
  el ready --assignee alice
  el ready --priority 1
  el ready -a alice -p 1 -l 10`,
  options: readyOptions,
  handler: readyHandler as Command['handler'],
};

// ============================================================================
// Blocked Command
// ============================================================================

interface BlockedOptions {
  assignee?: string;
  priority?: string;
  limit?: string;
}

const blockedOptions: CommandOption[] = [
  {
    name: 'assignee',
    short: 'a',
    description: 'Filter by assignee',
    hasValue: true,
  },
  {
    name: 'priority',
    short: 'p',
    description: 'Filter by priority (1-5)',
    hasValue: true,
  },
  {
    name: 'limit',
    short: 'l',
    description: 'Maximum number of results',
    hasValue: true,
  },
];

async function blockedHandler(
  _args: string[],
  options: GlobalOptions & BlockedOptions
): Promise<CommandResult> {
  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    // Build filter from options
    const filter: TaskFilter = {};

    if (options.assignee) {
      filter.assignee = options.assignee as EntityId;
    }

    if (options.priority) {
      const priority = parseInt(options.priority, 10);
      if (isNaN(priority) || priority < 1 || priority > 5) {
        return failure('Priority must be a number from 1 to 5', ExitCode.VALIDATION);
      }
      filter.priority = priority as Priority;
    }

    if (options.limit) {
      const limit = parseInt(options.limit, 10);
      if (isNaN(limit) || limit < 1) {
        return failure('Limit must be a positive number', ExitCode.VALIDATION);
      }
      filter.limit = limit;
    }

    // Get blocked tasks
    const tasks = await api.blocked(filter);

    // Format output based on mode
    const mode = getOutputMode(options);
    const formatter = getFormatter(mode);

    if (mode === 'json') {
      return success(tasks);
    }

    if (mode === 'quiet') {
      return success(tasks.map((t) => t.id).join('\n'));
    }

    // Human-readable output
    if (tasks.length === 0) {
      return success(null, 'No blocked tasks found');
    }

    // Build table data
    const headers = ['ID', 'TITLE', 'BLOCKED BY', 'REASON'];
    const rows = tasks.map((task: BlockedTask) => [
      task.id,
      task.title.length > 30 ? task.title.substring(0, 27) + '...' : task.title,
      task.blockedBy,
      task.blockReason.length > 30 ? task.blockReason.substring(0, 27) + '...' : task.blockReason,
    ]);

    const table = formatter.table(headers, rows);
    const summary = `\n${tasks.length} blocked task(s)`;

    return success(tasks, table + summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to get blocked tasks: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

export const blockedCommand: Command = {
  name: 'blocked',
  description: 'List blocked tasks with reasons',
  usage: 'el blocked [options]',
  help: `List tasks that are blocked with blocking details.

Options:
  -a, --assignee <id>    Filter by assignee entity ID
  -p, --priority <1-5>   Filter by priority
  -l, --limit <n>        Maximum number of results

Examples:
  el blocked
  el blocked --assignee alice
  el blocked --json`,
  options: blockedOptions,
  handler: blockedHandler as Command['handler'],
};

// ============================================================================
// Close Command
// ============================================================================

interface CloseOptions {
  reason?: string;
}

const closeOptions: CommandOption[] = [
  {
    name: 'reason',
    short: 'r',
    description: 'Close reason',
    hasValue: true,
  },
];

async function closeHandler(
  args: string[],
  options: GlobalOptions & CloseOptions
): Promise<CommandResult> {
  const [id] = args;

  if (!id) {
    return failure('Usage: el close <id> [--reason "reason"]', ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    // Get the task
    const task = await api.get<Task>(id as ElementId);
    if (!task) {
      return failure(`Task not found: ${id}`, ExitCode.NOT_FOUND);
    }

    if (task.type !== 'task') {
      return failure(`Element is not a task: ${id}`, ExitCode.VALIDATION);
    }

    // Check if already closed
    if (task.status === TaskStatus.CLOSED) {
      return failure(`Task is already closed: ${id}`, ExitCode.VALIDATION);
    }

    // Check if transition is valid
    if (!isValidStatusTransition(task.status, TaskStatus.CLOSED)) {
      return failure(
        `Cannot close task with status '${task.status}'`,
        ExitCode.VALIDATION
      );
    }

    // Update the task
    const updated = updateTaskStatus(task, {
      status: TaskStatus.CLOSED,
      closeReason: options.reason,
    });

    // Save the update
    await api.update<Task>(id as ElementId, updated);

    // Format output based on mode
    const mode = getOutputMode(options);

    if (mode === 'json') {
      return success(updated);
    }

    if (mode === 'quiet') {
      return success(updated.id);
    }

    return success(updated, `Closed task ${id}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to close task: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

export const closeCommand: Command = {
  name: 'close',
  description: 'Close a task',
  usage: 'el close <id> [options]',
  help: `Close a task, marking it as completed.

Arguments:
  id    Task identifier (e.g., el-abc123)

Options:
  -r, --reason <text>    Close reason

Examples:
  el close el-abc123
  el close el-abc123 --reason "Fixed in PR #42"`,
  options: closeOptions,
  handler: closeHandler as Command['handler'],
};

// ============================================================================
// Reopen Command
// ============================================================================

async function reopenHandler(
  args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  const [id] = args;

  if (!id) {
    return failure('Usage: el reopen <id>', ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    // Get the task
    const task = await api.get<Task>(id as ElementId);
    if (!task) {
      return failure(`Task not found: ${id}`, ExitCode.NOT_FOUND);
    }

    if (task.type !== 'task') {
      return failure(`Element is not a task: ${id}`, ExitCode.VALIDATION);
    }

    // Check if not closed
    if (task.status !== TaskStatus.CLOSED) {
      return failure(`Task is not closed (status: ${task.status})`, ExitCode.VALIDATION);
    }

    // Update the task
    const updated = updateTaskStatus(task, {
      status: TaskStatus.OPEN,
    });

    // Save the update
    await api.update<Task>(id as ElementId, updated);

    // Format output based on mode
    const mode = getOutputMode(options);

    if (mode === 'json') {
      return success(updated);
    }

    if (mode === 'quiet') {
      return success(updated.id);
    }

    return success(updated, `Reopened task ${id}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to reopen task: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

export const reopenCommand: Command = {
  name: 'reopen',
  description: 'Reopen a closed task',
  usage: 'el reopen <id>',
  help: `Reopen a previously closed task.

Arguments:
  id    Task identifier (e.g., el-abc123)

Examples:
  el reopen el-abc123`,
  options: [],
  handler: reopenHandler as Command['handler'],
};

// ============================================================================
// Assign Command
// ============================================================================

interface AssignOptions {
  unassign?: boolean;
}

const assignOptions: CommandOption[] = [
  {
    name: 'unassign',
    short: 'u',
    description: 'Remove assignment',
  },
];

async function assignHandler(
  args: string[],
  options: GlobalOptions & AssignOptions
): Promise<CommandResult> {
  const [id, assignee] = args;

  if (!id) {
    return failure('Usage: el assign <id> [assignee] [--unassign]', ExitCode.INVALID_ARGUMENTS);
  }

  if (!assignee && !options.unassign) {
    return failure('Specify an assignee or use --unassign to remove assignment', ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    // Get the task
    const task = await api.get<Task>(id as ElementId);
    if (!task) {
      return failure(`Task not found: ${id}`, ExitCode.NOT_FOUND);
    }

    if (task.type !== 'task') {
      return failure(`Element is not a task: ${id}`, ExitCode.VALIDATION);
    }

    // Update assignment
    const updates: Partial<Task> = {
      assignee: options.unassign ? undefined : (assignee as EntityId),
    };

    // Save the update
    const updated = await api.update<Task>(id as ElementId, updates);

    // Format output based on mode
    const mode = getOutputMode(options);

    if (mode === 'json') {
      return success(updated);
    }

    if (mode === 'quiet') {
      return success(updated.id);
    }

    const message = options.unassign
      ? `Unassigned task ${id}`
      : `Assigned task ${id} to ${assignee}`;
    return success(updated, message);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to assign task: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

export const assignCommand: Command = {
  name: 'assign',
  description: 'Assign a task to an entity',
  usage: 'el assign <id> [assignee]',
  help: `Assign a task to an entity.

Arguments:
  id        Task identifier (e.g., el-abc123)
  assignee  Entity to assign to

Options:
  -u, --unassign    Remove assignment

Examples:
  el assign el-abc123 alice
  el assign el-abc123 --unassign`,
  options: assignOptions,
  handler: assignHandler as Command['handler'],
};

// ============================================================================
// Defer Command
// ============================================================================

interface DeferOptions {
  until?: string;
}

const deferOptions: CommandOption[] = [
  {
    name: 'until',
    description: 'Schedule for date (ISO format)',
    hasValue: true,
  },
];

async function deferHandler(
  args: string[],
  options: GlobalOptions & DeferOptions
): Promise<CommandResult> {
  const [id] = args;

  if (!id) {
    return failure('Usage: el defer <id> [--until date]', ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    // Get the task
    const task = await api.get<Task>(id as ElementId);
    if (!task) {
      return failure(`Task not found: ${id}`, ExitCode.NOT_FOUND);
    }

    if (task.type !== 'task') {
      return failure(`Element is not a task: ${id}`, ExitCode.VALIDATION);
    }

    // Check if transition is valid
    if (!isValidStatusTransition(task.status, TaskStatus.DEFERRED)) {
      return failure(
        `Cannot defer task with status '${task.status}'`,
        ExitCode.VALIDATION
      );
    }

    // Parse until date if provided
    let scheduledFor: string | undefined;
    if (options.until) {
      const date = new Date(options.until);
      if (isNaN(date.getTime())) {
        return failure(`Invalid date format: ${options.until}`, ExitCode.VALIDATION);
      }
      scheduledFor = date.toISOString();
    }

    // Update the task
    const updated = updateTaskStatus(task, {
      status: TaskStatus.DEFERRED,
    });

    // Add scheduledFor if provided
    if (scheduledFor) {
      (updated as Task).scheduledFor = scheduledFor as Task['scheduledFor'];
    }

    // Save the update
    await api.update<Task>(id as ElementId, updated);

    // Format output based on mode
    const mode = getOutputMode(options);

    if (mode === 'json') {
      return success(updated);
    }

    if (mode === 'quiet') {
      return success(updated.id);
    }

    const message = scheduledFor
      ? `Deferred task ${id} until ${new Date(scheduledFor).toLocaleDateString()}`
      : `Deferred task ${id}`;
    return success(updated, message);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to defer task: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

export const deferCommand: Command = {
  name: 'defer',
  description: 'Defer a task',
  usage: 'el defer <id> [options]',
  help: `Defer a task, putting it on hold.

Arguments:
  id    Task identifier (e.g., el-abc123)

Options:
  --until <date>    Schedule for a specific date (ISO format)

Examples:
  el defer el-abc123
  el defer el-abc123 --until 2024-03-01`,
  options: deferOptions,
  handler: deferHandler as Command['handler'],
};

// ============================================================================
// Undefer Command
// ============================================================================

async function undeferHandler(
  args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  const [id] = args;

  if (!id) {
    return failure('Usage: el undefer <id>', ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    // Get the task
    const task = await api.get<Task>(id as ElementId);
    if (!task) {
      return failure(`Task not found: ${id}`, ExitCode.NOT_FOUND);
    }

    if (task.type !== 'task') {
      return failure(`Element is not a task: ${id}`, ExitCode.VALIDATION);
    }

    // Check if deferred
    if (task.status !== TaskStatus.DEFERRED) {
      return failure(`Task is not deferred (status: ${task.status})`, ExitCode.VALIDATION);
    }

    // Update the task - reopen it
    const updated = updateTaskStatus(task, {
      status: TaskStatus.OPEN,
    });

    // Clear scheduledFor
    (updated as Task).scheduledFor = undefined;

    // Save the update
    await api.update<Task>(id as ElementId, updated);

    // Format output based on mode
    const mode = getOutputMode(options);

    if (mode === 'json') {
      return success(updated);
    }

    if (mode === 'quiet') {
      return success(updated.id);
    }

    return success(updated, `Undeferred task ${id}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to undefer task: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

export const undeferCommand: Command = {
  name: 'undefer',
  description: 'Remove deferral from a task',
  usage: 'el undefer <id>',
  help: `Remove deferral from a task, making it ready for work again.

Arguments:
  id    Task identifier (e.g., el-abc123)

Examples:
  el undefer el-abc123`,
  options: [],
  handler: undeferHandler as Command['handler'],
};

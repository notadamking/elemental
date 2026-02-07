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
import { createStorage, initializeSchema } from '@elemental/storage';
import { createElementalAPI } from '../../api/elemental-api.js';
import {
  TaskStatus,
  TaskTypeValue,
  updateTaskStatus,
  isValidStatusTransition,
  createDocument,
  ContentType,
  type Task,
  type Priority,
  type Document,
  type DocumentId,
} from '@elemental/core';
import type { ElementId, EntityId } from '@elemental/core';
import { existsSync as fileExists, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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
      const validTypes: string[] = Object.values(TaskTypeValue);
      if (!validTypes.includes(options.type)) {
        return failure(
          `Invalid task type: ${options.type}. Must be one of: ${validTypes.join(', ')}`,
          ExitCode.VALIDATION
        );
      }
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
// Backlog Command
// ============================================================================

interface BacklogOptions {
  priority?: string;
  limit?: string;
}

const backlogOptions: CommandOption[] = [
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

async function backlogHandler(
  _args: string[],
  options: GlobalOptions & BacklogOptions
): Promise<CommandResult> {
  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    const filter: TaskFilter = {};

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

    const tasks = await api.backlog(filter);

    const mode = getOutputMode(options);
    const formatter = getFormatter(mode);

    if (mode === 'json') {
      return success(tasks);
    }

    if (mode === 'quiet') {
      return success(tasks.map((t) => t.id).join('\n'));
    }

    if (tasks.length === 0) {
      return success(null, 'No backlog tasks found');
    }

    const headers = ['ID', 'TITLE', 'PRIORITY', 'TYPE', 'CREATED'];
    const rows = tasks.map((task) => [
      task.id,
      task.title.length > 40 ? task.title.substring(0, 37) + '...' : task.title,
      `P${task.priority}`,
      task.taskType,
      new Date(task.createdAt).toLocaleDateString(),
    ]);

    const table = formatter.table(headers, rows);
    const summary = `\n${tasks.length} backlog task(s)`;

    return success(tasks, table + summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to get backlog tasks: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

export const backlogCommand: Command = {
  name: 'backlog',
  description: 'List tasks in backlog',
  usage: 'el backlog [options]',
  help: `List tasks in backlog (not ready for work, needs triage).

Backlog tasks are excluded from ready() and won't be auto-dispatched.

Options:
  -p, --priority <1-5>   Filter by priority
  -l, --limit <n>        Maximum number of results

Examples:
  el backlog
  el backlog --priority 1
  el backlog -l 10`,
  options: backlogOptions,
  handler: backlogHandler as Command['handler'],
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

    // Save the update with optimistic concurrency control
    await api.update<Task>(id as ElementId, updated, {
      expectedUpdatedAt: task.updatedAt,
    });

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

interface ReopenOptions {
  message?: string;
}

const reopenOptions: CommandOption[] = [
  {
    name: 'message',
    short: 'm',
    description: 'Message to append to the task description explaining why it was reopened',
    hasValue: true,
  },
];

async function reopenHandler(
  args: string[],
  options: GlobalOptions & ReopenOptions
): Promise<CommandResult> {
  const [id] = args;

  if (!id) {
    return failure('Usage: el reopen <id> [--message "reason"]', ExitCode.INVALID_ARGUMENTS);
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

    // Update status to OPEN (clears closedAt)
    const updated = updateTaskStatus(task, {
      status: TaskStatus.OPEN,
    });

    // Clear assignee and closeReason
    updated.assignee = undefined;
    updated.closeReason = undefined;

    // Clear orchestrator metadata fields while preserving branch/worktree/handoff info
    const orchestratorMeta = (updated.metadata as Record<string, unknown> | undefined)?.orchestrator as Record<string, unknown> | undefined;
    if (orchestratorMeta) {
      const reconciliationCount = (orchestratorMeta.reconciliationCount as number | undefined) ?? 0;
      const clearedMeta = {
        ...orchestratorMeta,
        mergeStatus: undefined,
        mergedAt: undefined,
        mergeFailureReason: undefined,
        assignedAgent: undefined,
        sessionId: undefined,
        startedAt: undefined,
        completedAt: undefined,
        completionSummary: undefined,
        lastCommitHash: undefined,
        testRunCount: undefined,
        lastTestResult: undefined,
        lastSyncResult: undefined,
        reconciliationCount: reconciliationCount + 1,
      };
      (updated as Task & { metadata: Record<string, unknown> }).metadata = {
        ...(updated.metadata as Record<string, unknown>),
        orchestrator: clearedMeta,
      };
    }

    // Save the update with optimistic concurrency control
    await api.update<Task>(id as ElementId, updated, {
      expectedUpdatedAt: task.updatedAt,
    });

    // If message provided, append to or create description document
    if (options.message) {
      const reopenLine = `**Re-opened** — Task was closed but incomplete. Message: ${options.message}`;
      if (task.descriptionRef) {
        try {
          const doc = await api.get<Document>(task.descriptionRef as unknown as ElementId);
          if (doc) {
            await api.update<Document>(task.descriptionRef as unknown as ElementId, {
              content: doc.content + '\n\n' + reopenLine,
            } as Partial<Document>);
          }
        } catch {
          // Non-fatal: message is still shown in output
        }
      } else {
        const actor = options.actor as EntityId | undefined;
        const newDoc = await createDocument({
          content: reopenLine,
          contentType: ContentType.MARKDOWN,
          createdBy: actor ?? ('operator' as EntityId),
        });
        const created = await api.create(newDoc as unknown as Document & Record<string, unknown>);
        await api.update<Task>(
          id as ElementId,
          { descriptionRef: created.id as DocumentId },
          { actor }
        );
      }
    }

    // Re-fetch task to get latest state (including any descriptionRef changes)
    const finalTask = await api.get<Task>(id as ElementId);

    // Format output based on mode
    const mode = getOutputMode(options);

    if (mode === 'json') {
      return success(finalTask ?? updated);
    }

    if (mode === 'quiet') {
      return success(updated.id);
    }

    return success(finalTask ?? updated, `Reopened task ${id}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to reopen task: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

export const reopenCommand: Command = {
  name: 'reopen',
  description: 'Reopen a closed task',
  usage: 'el reopen <id> [--message "reason"]',
  help: `Reopen a previously closed task, clearing assignment and merge metadata.

Arguments:
  id    Task identifier (e.g., el-abc123)

Options:
  -m, --message   Message to append to the task description

Examples:
  el reopen el-abc123
  el reopen el-abc123 --message "Work was incomplete, needs fixes"`,
  options: reopenOptions,
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

    // Save the update with optimistic concurrency control
    const updated = await api.update<Task>(id as ElementId, updates, {
      expectedUpdatedAt: task.updatedAt,
    });

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

    // Save the update with optimistic concurrency control
    await api.update<Task>(id as ElementId, updated, {
      expectedUpdatedAt: task.updatedAt,
    });

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

    // Save the update with optimistic concurrency control
    await api.update<Task>(id as ElementId, updated, {
      expectedUpdatedAt: task.updatedAt,
    });

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

// ============================================================================
// Describe Command
// ============================================================================

interface DescribeOptions {
  content?: string;
  file?: string;
  show?: boolean;
  append?: boolean;
}

const describeOptions: CommandOption[] = [
  {
    name: 'content',
    short: 'c',
    description: 'Description content (text)',
    hasValue: true,
  },
  {
    name: 'file',
    short: 'f',
    description: 'Read description from file',
    hasValue: true,
  },
  {
    name: 'show',
    short: 's',
    description: 'Show current description instead of setting it',
  },
  {
    name: 'append',
    short: 'a',
    description: 'Append to existing description instead of replacing',
  },
];

async function describeHandler(
  args: string[],
  options: GlobalOptions & DescribeOptions
): Promise<CommandResult> {
  const [id] = args;

  if (!id) {
    return failure('Usage: el task describe <id> --content <text> | --file <path> | --show', ExitCode.INVALID_ARGUMENTS);
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

    // Show mode - display current description
    if (options.show) {
      const mode = getOutputMode(options);

      if (!task.descriptionRef) {
        if (mode === 'json') {
          return success({ taskId: id, description: null });
        }
        return success(null, `Task ${id} has no description`);
      }

      // Get the description document
      const doc = await api.get<Document>(task.descriptionRef as ElementId);
      if (!doc) {
        return failure(`Description document not found: ${task.descriptionRef}`, ExitCode.NOT_FOUND);
      }

      if (mode === 'json') {
        return success({ taskId: id, descriptionRef: task.descriptionRef, content: doc.content });
      }

      if (mode === 'quiet') {
        return success(doc.content);
      }

      return success(doc, `Description for task ${id}:\n\n${doc.content}`);
    }

    // Set mode - must specify either --content or --file
    if (!options.content && !options.file) {
      return failure('Either --content, --file, or --show is required', ExitCode.INVALID_ARGUMENTS);
    }

    if (options.content && options.file) {
      return failure('Cannot specify both --content and --file', ExitCode.INVALID_ARGUMENTS);
    }

    // Get new content
    let content: string;
    if (options.content) {
      content = options.content;
    } else {
      const filePath = resolve(options.file!);
      if (!fileExists(filePath)) {
        return failure(`File not found: ${filePath}`, ExitCode.NOT_FOUND);
      }
      content = readFileSync(filePath, 'utf-8');
    }

    const actor = options.actor as EntityId | undefined;

    // Check if task already has a description document
    if (task.descriptionRef) {
      let finalContent = content;

      // If appending, fetch existing content and combine
      if (options.append) {
        const existingDoc = await api.get<Document>(task.descriptionRef as ElementId);
        if (existingDoc) {
          finalContent = existingDoc.content + '\n\n' + content;
        }
      }

      // Update existing document
      const updated = await api.update<Document>(
        task.descriptionRef as ElementId,
        { content: finalContent },
        { actor }
      );

      const mode = getOutputMode(options);
      if (mode === 'json') {
        return success({ taskId: id, descriptionRef: task.descriptionRef, document: updated, appended: options.append ?? false });
      }
      if (mode === 'quiet') {
        return success(task.descriptionRef);
      }

      const action = options.append ? 'Appended to' : 'Updated';
      return success(updated, `${action} description for task ${id} (document ${task.descriptionRef}, version ${updated.version})`);
    } else {
      // Create new description document
      const docInput = {
        content,
        contentType: ContentType.MARKDOWN,
        createdBy: actor ?? ('operator' as EntityId),
      };

      const newDoc = await createDocument(docInput);
      const created = await api.create(newDoc as unknown as Document & Record<string, unknown>);

      // Update task with description reference
      await api.update<Task>(
        id as ElementId,
        { descriptionRef: created.id as DocumentId },
        { actor, expectedUpdatedAt: task.updatedAt }
      );

      const mode = getOutputMode(options);
      if (mode === 'json') {
        return success({ taskId: id, descriptionRef: created.id, document: created });
      }
      if (mode === 'quiet') {
        return success(created.id);
      }

      return success(created, `Created description for task ${id} (document ${created.id})`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to update task description: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

export const describeCommand: Command = {
  name: 'describe',
  description: 'Set or show task description',
  usage: 'el task describe <id> --content <text> | --file <path> | --show',
  help: `Set or show the description for a task.

Task descriptions are stored as separate versioned documents. If the task
already has a description, it will be updated (creating a new version).
If not, a new document will be created and linked to the task.

Arguments:
  id    Task identifier (e.g., el-abc123)

Options:
  -c, --content <text>  Description content (inline)
  -f, --file <path>     Read description from file
  -s, --show            Show current description instead of setting it
  -a, --append          Append to existing description instead of replacing

Examples:
  el task describe el-abc123 --content "Implement the login feature"
  el task describe el-abc123 --file description.md
  el task describe el-abc123 --show
  el task describe el-abc123 --append --content "Additional notes"`,
  options: describeOptions,
  handler: describeHandler as Command['handler'],
};

// ============================================================================
// Activate Command
// ============================================================================

async function activateHandler(
  args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  const [id] = args;

  if (!id) {
    return failure('Usage: el task activate <id>', ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    const task = await api.get<Task>(id as ElementId);
    if (!task) {
      return failure(`Task not found: ${id}`, ExitCode.NOT_FOUND);
    }

    if (task.type !== 'task') {
      return failure(`Element is not a task: ${id}`, ExitCode.VALIDATION);
    }

    if (task.status !== TaskStatus.BACKLOG) {
      return failure(`Task is not in backlog (status: ${task.status})`, ExitCode.VALIDATION);
    }

    const updated = updateTaskStatus(task, {
      status: TaskStatus.OPEN,
    });

    await api.update<Task>(id as ElementId, updated, {
      expectedUpdatedAt: task.updatedAt,
    });

    const mode = getOutputMode(options);

    if (mode === 'json') {
      return success(updated);
    }

    if (mode === 'quiet') {
      return success(updated.id);
    }

    return success(updated, `Activated task ${id} (moved from backlog to open)`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to activate task: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

const activateCommand: Command = {
  name: 'activate',
  description: 'Move a task from backlog to open',
  usage: 'el task activate <id>',
  help: `Move a task from backlog status to open status.

Arguments:
  id    Task identifier

Examples:
  el task activate el-abc123`,
  options: [],
  handler: activateHandler as Command['handler'],
};

// ============================================================================
// Task Root Command
// ============================================================================

export const taskCommand: Command = {
  name: 'task',
  description: 'Task-specific operations',
  usage: 'el task <subcommand> [options]',
  help: `Task-specific operations.

Subcommands:
  describe    Set or show task description
  activate    Move a task from backlog to open

Note: Common task operations are available as top-level commands:
  el ready      List tasks ready for work
  el blocked    List blocked tasks
  el backlog    List backlog tasks
  el close      Close a task
  el reopen     Reopen a closed task
  el assign     Assign a task
  el defer      Defer a task
  el undefer    Remove deferral

Examples:
  el task describe el-abc123 --content "Description text"
  el task describe el-abc123 --show
  el task activate el-abc123`,
  subcommands: {
    describe: describeCommand,
    activate: activateCommand,
  },
  handler: async (_args, _options): Promise<CommandResult> => {
    return failure(
      'Usage: el task <subcommand>. Use "el task --help" for available subcommands.',
      ExitCode.INVALID_ARGUMENTS
    );
  },
};

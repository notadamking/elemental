/**
 * Workflow Commands - Collection command interface for workflows
 *
 * Provides CLI commands for workflow operations:
 * - workflow pour: Instantiate a playbook into a workflow
 * - workflow list: List workflows with filtering
 * - workflow show: Show workflow details
 * - workflow tasks: List tasks in a workflow
 * - workflow progress: Show workflow progress metrics
 * - workflow burn: Delete ephemeral workflow and tasks
 * - workflow squash: Promote ephemeral to durable
 * - workflow gc: Garbage collect old ephemeral workflows
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Command, GlobalOptions, CommandResult, CommandOption } from '../types.js';
import { success, failure, ExitCode } from '../types.js';
import { getFormatter, getOutputMode, getStatusIcon } from '../formatter.js';
import { createStorage, initializeSchema } from '@elemental/storage';
import { createElementalAPI } from '../../api/elemental-api.js';
import {
  createWorkflow,
  WorkflowStatus,
  squashWorkflow,
  filterGarbageCollectionByAge,
  type Workflow,
  type CreateWorkflowInput,
} from '@elemental/core';
import type { Element, ElementId, EntityId } from '@elemental/core';
import type { ElementalAPI } from '../../api/types.js';
import { OPERATOR_ENTITY_ID } from './init.js';

// ============================================================================
// Constants
// ============================================================================

const ELEMENTAL_DIR = '.elemental';
const DEFAULT_DB_NAME = 'elemental.db';
const DEFAULT_ACTOR = OPERATOR_ENTITY_ID;

// Default GC age: 7 days in milliseconds
const DEFAULT_GC_AGE_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// ============================================================================
// Database Helper
// ============================================================================

function resolveDatabasePath(options: GlobalOptions, requireExists: boolean = true): string | null {
  if (options.db) {
    if (requireExists && !existsSync(options.db)) {
      return null;
    }
    return options.db;
  }

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

function resolveActor(options: GlobalOptions): EntityId {
  return (options.actor ?? DEFAULT_ACTOR) as EntityId;
}

function createAPI(options: GlobalOptions, createDb: boolean = false): { api: ElementalAPI; error?: string } {
  const dbPath = resolveDatabasePath(options, !createDb);
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
// Workflow Pour Command
// ============================================================================

interface WorkflowPourOptions {
  var?: string | string[];
  ephemeral?: boolean;
  title?: string;
}

const workflowPourOptions: CommandOption[] = [
  {
    name: 'var',
    description: 'Set variable (name=value, can be repeated)',
    hasValue: true,
    array: true,
  },
  {
    name: 'ephemeral',
    short: 'e',
    description: 'Create as ephemeral (not synced)',
    hasValue: false,
  },
  {
    name: 'title',
    short: 't',
    description: 'Override workflow title',
    hasValue: true,
  },
];

async function workflowPourHandler(
  args: string[],
  options: GlobalOptions & WorkflowPourOptions
): Promise<CommandResult> {
  const [playbookNameOrId] = args;

  if (!playbookNameOrId) {
    return failure('Usage: el workflow pour <playbook> [options]', ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = createAPI(options, true);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    const actor = resolveActor(options);

    // Parse variables
    const variables: Record<string, unknown> = {};
    if (options.var) {
      const varArgs = Array.isArray(options.var) ? options.var : [options.var];
      for (const varArg of varArgs) {
        const eqIndex = varArg.indexOf('=');
        if (eqIndex === -1) {
          return failure(
            `Invalid variable format: ${varArg}. Use name=value`,
            ExitCode.VALIDATION
          );
        }
        const name = varArg.slice(0, eqIndex);
        const value = varArg.slice(eqIndex + 1);
        variables[name] = value;
      }
    }

    // For now, create a workflow directly
    // TODO: When playbook pouring is implemented, look up playbook and instantiate
    const title = options.title || `Workflow from ${playbookNameOrId}`;

    const input: CreateWorkflowInput = {
      title,
      createdBy: actor,
      ephemeral: options.ephemeral ?? false,
      variables,
      // playbookId would be set here when playbook lookup is implemented
    };

    const workflow = await createWorkflow(input);
    const created = await api.create(workflow as unknown as Element & Record<string, unknown>);

    const mode = getOutputMode(options);
    if (mode === 'quiet') {
      return success(created.id);
    }

    return success(created, `Created workflow ${created.id}${options.ephemeral ? ' (ephemeral)' : ''}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to pour workflow: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

const workflowPourCommand: Command = {
  name: 'pour',
  description: 'Instantiate a playbook into a workflow',
  usage: 'el workflow pour <playbook> [options]',
  help: `Create a workflow by instantiating a playbook template.

Arguments:
  playbook    Playbook name or ID to instantiate

Options:
      --var <name=value>  Set variable (can be repeated)
  -e, --ephemeral         Create as ephemeral (not synced to JSONL)
  -t, --title <text>      Override workflow title

Examples:
  el workflow pour deploy --var env=prod --var version=1.2
  el workflow pour sprint-setup --ephemeral
  el workflow pour deploy --title "Production Deploy v1.2"`,
  options: workflowPourOptions,
  handler: workflowPourHandler as Command['handler'],
};

// ============================================================================
// Workflow List Command
// ============================================================================

interface WorkflowListOptions {
  status?: string;
  ephemeral?: boolean;
  durable?: boolean;
  limit?: string;
}

const workflowListOptions: CommandOption[] = [
  {
    name: 'status',
    short: 's',
    description: 'Filter by status (pending, running, completed, failed, cancelled)',
    hasValue: true,
  },
  {
    name: 'ephemeral',
    short: 'e',
    description: 'Show only ephemeral workflows',
    hasValue: false,
  },
  {
    name: 'durable',
    short: 'd',
    description: 'Show only durable workflows',
    hasValue: false,
  },
  {
    name: 'limit',
    short: 'l',
    description: 'Maximum number of results',
    hasValue: true,
  },
];

async function workflowListHandler(
  _args: string[],
  options: GlobalOptions & WorkflowListOptions
): Promise<CommandResult> {
  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    // Build filter
    const filter: Record<string, unknown> = {
      type: 'workflow',
    };

    // Status filter
    if (options.status) {
      const validStatuses = Object.values(WorkflowStatus);
      if (!validStatuses.includes(options.status as WorkflowStatus)) {
        return failure(
          `Invalid status: ${options.status}. Must be one of: ${validStatuses.join(', ')}`,
          ExitCode.VALIDATION
        );
      }
    }

    // Limit
    if (options.limit) {
      const limit = parseInt(options.limit, 10);
      if (isNaN(limit) || limit < 1) {
        return failure('Limit must be a positive number', ExitCode.VALIDATION);
      }
      filter.limit = limit;
    }

    const result = await api.listPaginated<Workflow>(filter);

    // Post-filter
    let items = result.items;

    // Status filter
    if (options.status) {
      items = items.filter((w) => w.status === options.status);
    }

    // Ephemeral/durable filter
    if (options.ephemeral && !options.durable) {
      items = items.filter((w) => w.ephemeral);
    } else if (options.durable && !options.ephemeral) {
      items = items.filter((w) => !w.ephemeral);
    }

    const mode = getOutputMode(options);
    const formatter = getFormatter(mode);

    if (mode === 'json') {
      return success(items);
    }

    if (mode === 'quiet') {
      return success(items.map((w) => w.id).join('\n'));
    }

    if (items.length === 0) {
      return success(null, 'No workflows found');
    }

    // Build table
    const headers = ['ID', 'TITLE', 'STATUS', 'MODE', 'CREATED'];
    const rows = items.map((w) => [
      w.id,
      w.title.length > 40 ? w.title.substring(0, 37) + '...' : w.title,
      `${getStatusIcon(w.status)} ${w.status}`,
      w.ephemeral ? 'ephemeral' : 'durable',
      w.createdAt.split('T')[0],
    ]);

    const table = formatter.table(headers, rows);
    const summary = `\nShowing ${items.length} of ${result.total} workflows`;

    return success(items, table + summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to list workflows: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

const workflowListCommand: Command = {
  name: 'list',
  description: 'List workflows',
  usage: 'el workflow list [options]',
  help: `List workflows with optional filtering.

Options:
  -s, --status <status>  Filter by status: pending, running, completed, failed, cancelled
  -e, --ephemeral        Show only ephemeral workflows
  -d, --durable          Show only durable workflows
  -l, --limit <n>        Maximum results

Examples:
  el workflow list
  el workflow list --status running
  el workflow list --ephemeral`,
  options: workflowListOptions,
  handler: workflowListHandler as Command['handler'],
};

// ============================================================================
// Workflow Show Command
// ============================================================================

async function workflowShowHandler(
  args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  const [id] = args;

  if (!id) {
    return failure('Usage: el workflow show <id>', ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    const workflow = await api.get<Workflow>(id as ElementId);

    if (!workflow) {
      return failure(`Workflow not found: ${id}`, ExitCode.NOT_FOUND);
    }

    if (workflow.type !== 'workflow') {
      return failure(`Element ${id} is not a workflow (type: ${workflow.type})`, ExitCode.VALIDATION);
    }

    // Check if workflow is deleted (tombstone)
    const data = workflow as unknown as Record<string, unknown>;
    if (data.status === 'tombstone' || data.deletedAt) {
      return failure(`Workflow not found: ${id}`, ExitCode.NOT_FOUND);
    }

    const mode = getOutputMode(options);
    const formatter = getFormatter(mode);

    if (mode === 'json') {
      return success(workflow);
    }

    if (mode === 'quiet') {
      return success(workflow.id);
    }

    // Human-readable output
    let output = formatter.element(workflow as unknown as Record<string, unknown>);

    // Add workflow-specific info
    output += '\n\n--- Workflow Info ---\n';
    output += `Mode:      ${workflow.ephemeral ? 'ephemeral' : 'durable'}\n`;
    if (workflow.playbookId) {
      output += `Playbook:  ${workflow.playbookId}\n`;
    }
    if (workflow.startedAt) {
      output += `Started:   ${workflow.startedAt}\n`;
    }
    if (workflow.finishedAt) {
      output += `Finished:  ${workflow.finishedAt}\n`;
    }
    if (workflow.failureReason) {
      output += `Failure:   ${workflow.failureReason}\n`;
    }
    if (workflow.cancelReason) {
      output += `Cancelled: ${workflow.cancelReason}\n`;
    }

    // Show variables if any
    const varKeys = Object.keys(workflow.variables);
    if (varKeys.length > 0) {
      output += '\n--- Variables ---\n';
      for (const key of varKeys) {
        output += `${key}: ${JSON.stringify(workflow.variables[key])}\n`;
      }
    }

    return success(workflow, output);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to show workflow: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

const workflowShowCommand: Command = {
  name: 'show',
  description: 'Show workflow details',
  usage: 'el workflow show <id>',
  help: `Display detailed information about a workflow.

Arguments:
  id    Workflow identifier (e.g., el-abc123)

Examples:
  el workflow show el-abc123
  el workflow show el-abc123 --json`,
  handler: workflowShowHandler as Command['handler'],
};

// ============================================================================
// Workflow Tasks Command
// ============================================================================

interface WorkflowTasksOptions {
  ready?: boolean;
  status?: string;
  limit?: string;
}

const workflowTasksOptions: CommandOption[] = [
  {
    name: 'ready',
    short: 'r',
    description: 'Show only ready tasks (not blocked, not scheduled for future)',
    hasValue: false,
  },
  {
    name: 'status',
    short: 's',
    description: 'Filter by status (open, in_progress, blocked, closed, deferred)',
    hasValue: true,
  },
  {
    name: 'limit',
    short: 'l',
    description: 'Maximum number of results',
    hasValue: true,
  },
];

async function workflowTasksHandler(
  args: string[],
  options: GlobalOptions & WorkflowTasksOptions
): Promise<CommandResult> {
  const [id] = args;

  if (!id) {
    return failure('Usage: el workflow tasks <id>', ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    // Build filter
    const filter: Record<string, unknown> = {};

    // Status filter
    if (options.status) {
      const validStatuses = ['open', 'in_progress', 'blocked', 'closed', 'deferred', 'tombstone'];
      if (!validStatuses.includes(options.status)) {
        return failure(
          `Invalid status: ${options.status}. Must be one of: ${validStatuses.join(', ')}`,
          ExitCode.VALIDATION
        );
      }
      filter.status = options.status;
    }

    // Limit
    if (options.limit) {
      const limit = parseInt(options.limit, 10);
      if (isNaN(limit) || limit < 1) {
        return failure('Limit must be a positive number', ExitCode.VALIDATION);
      }
      filter.limit = limit;
    }

    // Get tasks based on --ready flag
    const tasks = options.ready
      ? await api.getReadyTasksInWorkflow(id as ElementId, filter)
      : await api.getTasksInWorkflow(id as ElementId, filter);

    const mode = getOutputMode(options);
    const formatter = getFormatter(mode);

    if (mode === 'json') {
      return success(tasks);
    }

    if (mode === 'quiet') {
      return success(tasks.map((t) => t.id).join('\n'));
    }

    if (tasks.length === 0) {
      return success(null, options.ready ? 'No ready tasks in workflow' : 'No tasks in workflow');
    }

    // Build table
    const headers = ['ID', 'TITLE', 'STATUS', 'PRIORITY', 'ASSIGNEE'];
    const rows = tasks.map((t) => [
      t.id,
      t.title.length > 40 ? t.title.substring(0, 37) + '...' : t.title,
      `${getStatusIcon(t.status)} ${t.status}`,
      `P${t.priority}`,
      t.assignee ?? '-',
    ]);

    const table = formatter.table(headers, rows);
    const summary = `\n${tasks.length} task(s)`;

    return success(tasks, table + summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to list workflow tasks: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

const workflowTasksCommand: Command = {
  name: 'tasks',
  description: 'List tasks in a workflow',
  usage: 'el workflow tasks <id> [options]',
  help: `List all tasks that belong to a workflow.

Arguments:
  id    Workflow identifier (e.g., el-abc123)

Options:
  -r, --ready          Show only ready tasks (not blocked, not scheduled for future)
  -s, --status <s>     Filter by status: open, in_progress, blocked, closed, deferred
  -l, --limit <n>      Maximum results

Examples:
  el workflow tasks el-abc123
  el workflow tasks el-abc123 --ready
  el workflow tasks el-abc123 --status open
  el workflow tasks el-abc123 --json`,
  options: workflowTasksOptions,
  handler: workflowTasksHandler as Command['handler'],
};

// ============================================================================
// Workflow Progress Command
// ============================================================================

async function workflowProgressHandler(
  args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  const [id] = args;

  if (!id) {
    return failure('Usage: el workflow progress <id>', ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    const progress = await api.getWorkflowProgress(id as ElementId);

    const mode = getOutputMode(options);

    if (mode === 'json') {
      return success(progress);
    }

    if (mode === 'quiet') {
      return success(`${progress.completionPercentage}%`);
    }

    // Human-readable output
    let output = `Workflow Progress: ${id}\n\n`;
    output += `Total Tasks:   ${progress.totalTasks}\n`;
    output += `Completion:    ${progress.completionPercentage}%\n`;
    output += `Ready Tasks:   ${progress.readyTasks}\n`;
    output += `Blocked Tasks: ${progress.blockedTasks}\n\n`;
    output += '--- Status Breakdown ---\n';

    const statusOrder = ['open', 'in_progress', 'blocked', 'closed', 'deferred'];
    for (const status of statusOrder) {
      const count = progress.statusCounts[status] ?? 0;
      if (count > 0) {
        output += `${getStatusIcon(status)} ${status}: ${count}\n`;
      }
    }

    // Visual progress bar
    const barWidth = 30;
    const filled = Math.round((progress.completionPercentage / 100) * barWidth);
    const empty = barWidth - filled;
    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    output += `\n[${bar}] ${progress.completionPercentage}%`;

    return success(progress, output);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to get workflow progress: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

const workflowProgressCommand: Command = {
  name: 'progress',
  description: 'Show workflow progress metrics',
  usage: 'el workflow progress <id>',
  help: `Display progress metrics for a workflow.

Shows task status counts, completion percentage, and ready/blocked task counts.

Arguments:
  id    Workflow identifier (e.g., el-abc123)

Examples:
  el workflow progress el-abc123
  el workflow progress el-abc123 --json`,
  handler: workflowProgressHandler as Command['handler'],
};

// ============================================================================
// Workflow Burn Command
// ============================================================================

interface WorkflowBurnOptions {
  force?: boolean;
}

const workflowBurnOptions: CommandOption[] = [
  {
    name: 'force',
    short: 'f',
    description: 'Force burn even for durable workflows',
    hasValue: false,
  },
];

async function workflowBurnHandler(
  args: string[],
  options: GlobalOptions & WorkflowBurnOptions
): Promise<CommandResult> {
  const [id] = args;

  if (!id) {
    return failure('Usage: el workflow burn <id>', ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    const workflow = await api.get<Workflow>(id as ElementId);

    if (!workflow) {
      return failure(`Workflow not found: ${id}`, ExitCode.NOT_FOUND);
    }

    if (workflow.type !== 'workflow') {
      return failure(`Element ${id} is not a workflow (type: ${workflow.type})`, ExitCode.VALIDATION);
    }

    // Check if workflow is deleted (tombstone)
    const data = workflow as unknown as Record<string, unknown>;
    if (data.status === 'tombstone' || data.deletedAt) {
      return failure(`Workflow not found: ${id}`, ExitCode.NOT_FOUND);
    }

    if (!workflow.ephemeral && !options.force) {
      return failure(
        `Workflow ${id} is durable. Use --force to burn anyway, or 'el delete ${id}' for soft delete.`,
        ExitCode.VALIDATION
      );
    }

    const actor = resolveActor(options);

    // Use burnWorkflow API to delete workflow and all its tasks
    const result = await api.burnWorkflow(id as ElementId, { actor });

    return success(
      result,
      `Burned workflow ${id}: ${result.tasksDeleted} task(s), ${result.dependenciesDeleted} dependency(ies) deleted`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to burn workflow: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

const workflowBurnCommand: Command = {
  name: 'burn',
  description: 'Delete workflow and all its tasks',
  usage: 'el workflow burn <id>',
  help: `Delete a workflow and all its tasks immediately (hard delete).

By default, only ephemeral workflows can be burned. Use --force to burn
durable workflows as well.

Arguments:
  id    Workflow identifier

Options:
  -f, --force    Force burn even for durable workflows

Examples:
  el workflow burn el-abc123
  el workflow burn el-abc123 --force`,
  options: workflowBurnOptions,
  handler: workflowBurnHandler as Command['handler'],
};

// ============================================================================
// Workflow Squash Command
// ============================================================================

async function workflowSquashHandler(
  args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  const [id] = args;

  if (!id) {
    return failure('Usage: el workflow squash <id>', ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    const workflow = await api.get<Workflow>(id as ElementId);

    if (!workflow) {
      return failure(`Workflow not found: ${id}`, ExitCode.NOT_FOUND);
    }

    if (workflow.type !== 'workflow') {
      return failure(`Element ${id} is not a workflow (type: ${workflow.type})`, ExitCode.VALIDATION);
    }

    // Check if workflow is deleted (tombstone)
    const data = workflow as unknown as Record<string, unknown>;
    if (data.status === 'tombstone' || data.deletedAt) {
      return failure(`Workflow not found: ${id}`, ExitCode.NOT_FOUND);
    }

    if (!workflow.ephemeral) {
      return success(workflow, `Workflow ${id} is already durable`);
    }

    const actor = resolveActor(options);

    // Use the squashWorkflow function to get updated values
    const squashed = squashWorkflow(workflow);

    // Update in database
    const updated = await api.update<Workflow>(
      id as ElementId,
      { ephemeral: squashed.ephemeral },
      { actor }
    );

    return success(updated, `Promoted workflow ${id} to durable`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to squash workflow: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

const workflowSquashCommand: Command = {
  name: 'squash',
  description: 'Promote ephemeral workflow to durable',
  usage: 'el workflow squash <id>',
  help: `Promote an ephemeral workflow to durable so it gets synced to JSONL.

After squashing, the workflow and its tasks will be included in exports
and git sync.

Arguments:
  id    Workflow identifier

Examples:
  el workflow squash el-abc123`,
  handler: workflowSquashHandler as Command['handler'],
};

// ============================================================================
// Workflow GC Command
// ============================================================================

interface WorkflowGcOptions {
  age?: string;
  dryRun?: boolean;
}

const workflowGcOptions: CommandOption[] = [
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
];

async function workflowGcHandler(
  _args: string[],
  options: GlobalOptions & WorkflowGcOptions
): Promise<CommandResult> {
  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    // Parse age
    let ageDays = DEFAULT_GC_AGE_DAYS;
    if (options.age) {
      ageDays = parseInt(options.age, 10);
      if (isNaN(ageDays) || ageDays < 0) {
        return failure('Age must be a non-negative number', ExitCode.VALIDATION);
      }
    }

    const maxAgeMs = ageDays * MS_PER_DAY;

    // Check if dry run by getting eligible workflows first
    if (options.dryRun) {
      // Get all workflows for preview
      const allWorkflows = await api.list<Workflow>({ type: 'workflow' });

      // Filter to those eligible for GC
      const eligible = filterGarbageCollectionByAge(allWorkflows, maxAgeMs);

      if (eligible.length === 0) {
        return success({ deleted: 0 }, 'No workflows eligible for garbage collection');
      }

      const mode = getOutputMode(options);
      const formatter = getFormatter(mode);

      if (mode === 'json') {
        return success({ wouldDelete: eligible.map((w) => w.id), count: eligible.length });
      }

      if (mode === 'quiet') {
        return success(eligible.map((w) => w.id).join('\n'));
      }

      const headers = ['ID', 'TITLE', 'STATUS', 'FINISHED'];
      const rows = eligible.map((w) => [
        w.id,
        w.title.length > 40 ? w.title.substring(0, 37) + '...' : w.title,
        w.status,
        w.finishedAt ? w.finishedAt.split('T')[0] : '-',
      ]);

      const table = formatter.table(headers, rows);
      return success(
        { wouldDelete: eligible.map((w) => w.id), count: eligible.length },
        `Would delete ${eligible.length} workflow(s):\n${table}`
      );
    }

    // Use garbageCollectWorkflows API
    const gcResult = await api.garbageCollectWorkflows({
      maxAgeMs,
      dryRun: false,
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
    return failure(`Failed to garbage collect: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

const workflowGcCommand: Command = {
  name: 'gc',
  description: 'Garbage collect old ephemeral workflows',
  usage: 'el workflow gc [options]',
  help: `Delete old ephemeral workflows that have reached a terminal state.

Workflows are eligible for garbage collection if they are:
- Ephemeral (not durable)
- In a terminal state (completed, failed, or cancelled)
- Older than the specified age

Options:
  -a, --age <days>   Maximum age in days (default: ${DEFAULT_GC_AGE_DAYS})
      --dry-run      Show what would be deleted without deleting

Examples:
  el workflow gc
  el workflow gc --age 30
  el workflow gc --dry-run`,
  options: workflowGcOptions,
  handler: workflowGcHandler as Command['handler'],
};

// ============================================================================
// Workflow Root Command
// ============================================================================

export const workflowCommand: Command = {
  name: 'workflow',
  description: 'Manage workflows (executable task sequences)',
  usage: 'el workflow <subcommand> [options]',
  help: `Manage workflows - executable sequences of tasks.

Workflows can be instantiated from playbook templates or created ad-hoc.
They support both durable (synced) and ephemeral (temporary) modes.

Subcommands:
  pour       Instantiate a playbook into a workflow
  list       List workflows
  show       Show workflow details
  tasks      List tasks in a workflow
  progress   Show workflow progress metrics
  burn       Delete ephemeral workflow and tasks
  squash     Promote ephemeral to durable
  gc         Garbage collect old ephemeral workflows

Examples:
  el workflow pour deploy --var env=prod
  el workflow list --status running
  el workflow show el-abc123
  el workflow tasks el-abc123
  el workflow tasks el-abc123 --ready
  el workflow progress el-abc123
  el workflow burn el-abc123
  el workflow squash el-abc123
  el workflow gc --age 30`,
  subcommands: {
    pour: workflowPourCommand,
    list: workflowListCommand,
    show: workflowShowCommand,
    tasks: workflowTasksCommand,
    progress: workflowProgressCommand,
    burn: workflowBurnCommand,
    squash: workflowSquashCommand,
    gc: workflowGcCommand,
  },
  handler: async (args, options): Promise<CommandResult> => {
    // Default to list if no subcommand
    if (args.length === 0) {
      return workflowListHandler(args, options);
    }
    return failure(
      `Unknown subcommand: ${args[0]}. Use 'el workflow --help' for available subcommands.`,
      ExitCode.INVALID_ARGUMENTS
    );
  },
};

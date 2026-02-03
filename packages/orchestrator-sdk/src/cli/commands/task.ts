/**
 * Task Commands - CLI operations for orchestrator task management
 *
 * Provides commands for task management:
 * - task handoff <task-id>: Hand off a task to another agent
 * - task complete <task-id>: Complete a task and optionally create a PR
 */

import type { Command, GlobalOptions, CommandResult, CommandOption } from '@elemental/sdk/cli';
import { success, failure, ExitCode, getOutputMode } from '@elemental/sdk/cli';
import type { ElementId } from '@elemental/core';

// ============================================================================
// Shared Helpers
// ============================================================================

/**
 * Creates task assignment service
 */
async function createTaskAssignmentService(options: GlobalOptions): Promise<{
  service: import('../../services/task-assignment-service.js').TaskAssignmentService | null;
  error?: string;
}> {
  try {
    const { createStorage, initializeSchema, findElementalDir } = await import('@elemental/sdk');
    const { createTaskAssignmentService: createService } = await import('../../services/task-assignment-service.js');
    const { ElementalAPIImpl } = await import('@elemental/sdk');

    const elementalDir = findElementalDir(process.cwd());
    if (!elementalDir) {
      return {
        service: null,
        error: 'No .elemental directory found. Run "el init" first.',
      };
    }

    const dbPath = options.db ?? `${elementalDir}/elemental.db`;
    const backend = createStorage({ path: dbPath, create: true });
    initializeSchema(backend);
    const api = new ElementalAPIImpl(backend);
    const service = createService(api);

    return { service };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { service: null, error: `Failed to initialize service: ${message}` };
  }
}

/**
 * Gets the current session ID from environment or generates a placeholder
 */
function getCurrentSessionId(): string {
  // Check for session ID in environment (set by spawner or agent)
  return process.env.ELEMENTAL_SESSION_ID || `cli-${Date.now()}`;
}

// ============================================================================
// Task Handoff Command
// ============================================================================

interface TaskHandoffOptions {
  message?: string;
  branch?: string;
  worktree?: string;
  sessionId?: string;
}

const taskHandoffOptions: CommandOption[] = [
  {
    name: 'message',
    short: 'm',
    description: 'Handoff message explaining context and reason',
    hasValue: true,
  },
  {
    name: 'branch',
    short: 'b',
    description: 'Override the branch to preserve (defaults to task branch)',
    hasValue: true,
  },
  {
    name: 'worktree',
    short: 'w',
    description: 'Override the worktree path to preserve (defaults to task worktree)',
    hasValue: true,
  },
  {
    name: 'sessionId',
    short: 's',
    description: 'Session ID of the agent handing off (defaults to current session)',
    hasValue: true,
  },
];

async function taskHandoffHandler(
  args: string[],
  options: GlobalOptions & TaskHandoffOptions
): Promise<CommandResult> {
  const [taskId] = args;

  if (!taskId) {
    return failure('Usage: el task handoff <task-id> [options]', ExitCode.INVALID_ARGUMENTS);
  }

  const { service, error } = await createTaskAssignmentService(options);
  if (error || !service) {
    return failure(error ?? 'Failed to create service', ExitCode.GENERAL_ERROR);
  }

  try {
    const sessionId = options.sessionId || getCurrentSessionId();

    const task = await service.handoffTask(taskId as ElementId, {
      sessionId,
      message: options.message,
      branch: options.branch,
      worktree: options.worktree,
    });

    const mode = getOutputMode(options);

    if (mode === 'json') {
      return success({
        taskId: task.id,
        sessionId,
        message: options.message,
        branch: options.branch,
        worktree: options.worktree,
        handedOff: true,
      });
    }

    if (mode === 'quiet') {
      return success(task.id);
    }

    const lines = [
      `Handed off task ${taskId}`,
      `  Session:   ${sessionId}`,
    ];
    if (options.message) {
      lines.push(`  Message:   ${options.message.slice(0, 50)}${options.message.length > 50 ? '...' : ''}`);
    }
    if (options.branch) {
      lines.push(`  Branch:    ${options.branch}`);
    }
    if (options.worktree) {
      lines.push(`  Worktree:  ${options.worktree}`);
    }
    lines.push('');
    lines.push('Task has been unassigned and is available for pickup by another agent.');

    return success(task, lines.join('\n'));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to hand off task: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

export const taskHandoffCommand: Command = {
  name: 'handoff',
  description: 'Hand off a task to another agent',
  usage: 'el task handoff <task-id> [options]',
  help: `Hand off a task to be picked up by another agent.

This command:
1. Preserves the branch and worktree references in task metadata
2. Appends a handoff note with context to the task description
3. Unassigns the task so it returns to the available pool

The next agent that picks up this task can continue from the
existing code state in the preserved branch/worktree.

Arguments:
  task-id    Task identifier to hand off

Options:
  -m, --message <text>     Handoff message with context and reason
  -b, --branch <name>      Override branch to preserve
  -w, --worktree <path>    Override worktree path to preserve
  -s, --sessionId <id>     Session ID (defaults to current session)

Examples:
  el task handoff el-abc123
  el task handoff el-abc123 --message "Completed API, need help with frontend"
  el task handoff el-abc123 -m "Blocked on database access" -b feature/my-branch`,
  options: taskHandoffOptions,
  handler: taskHandoffHandler as Command['handler'],
};

// ============================================================================
// Task Complete Command
// ============================================================================

interface TaskCompleteOptions {
  summary?: string;
  commitHash?: string;
  noMR?: boolean;
  mrTitle?: string;
  mrBody?: string;
  baseBranch?: string;
}

const taskCompleteOptions: CommandOption[] = [
  {
    name: 'summary',
    short: 's',
    description: 'Summary of what was accomplished',
    hasValue: true,
  },
  {
    name: 'commitHash',
    short: 'c',
    description: 'Commit hash for the final commit',
    hasValue: true,
  },
  {
    name: 'no-mr',
    description: 'Skip merge request creation',
  },
  {
    name: 'mr-title',
    description: 'Custom title for the merge request',
    hasValue: true,
  },
  {
    name: 'mr-body',
    description: 'Custom body for the merge request',
    hasValue: true,
  },
  {
    name: 'baseBranch',
    short: 'b',
    description: 'Base branch for the merge request (default: main)',
    hasValue: true,
  },
];

async function taskCompleteHandler(
  args: string[],
  options: GlobalOptions & TaskCompleteOptions & { 'no-mr'?: boolean; 'mr-title'?: string; 'mr-body'?: string }
): Promise<CommandResult> {
  const [taskId] = args;

  if (!taskId) {
    return failure('Usage: el task complete <task-id> [options]', ExitCode.INVALID_ARGUMENTS);
  }

  const { service, error } = await createTaskAssignmentService(options);
  if (error || !service) {
    return failure(error ?? 'Failed to create service', ExitCode.GENERAL_ERROR);
  }

  try {
    const result = await service.completeTask(taskId as ElementId, {
      summary: options.summary,
      commitHash: options.commitHash,
      createMergeRequest: options['no-mr'] !== true,
      mergeRequestTitle: options['mr-title'],
      mergeRequestBody: options['mr-body'],
      baseBranch: options.baseBranch,
    });

    const mode = getOutputMode(options);

    if (mode === 'json') {
      return success({
        taskId: result.task.id,
        status: result.task.status,
        mergeRequestUrl: result.mergeRequestUrl,
        mergeRequestId: result.mergeRequestId,
      });
    }

    if (mode === 'quiet') {
      return success(result.task.id);
    }

    const lines = [
      `Completed task ${taskId}`,
      `  Status: ${result.task.status}`,
    ];
    if (options.summary) {
      lines.push(`  Summary: ${options.summary.slice(0, 50)}${options.summary.length > 50 ? '...' : ''}`);
    }
    if (result.mergeRequestUrl) {
      lines.push(`  MR: ${result.mergeRequestUrl}`);
    }

    return success(result, lines.join('\n'));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to complete task: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

export const taskCompleteCommand: Command = {
  name: 'complete',
  description: 'Complete a task and optionally create a merge request',
  usage: 'el task complete <task-id> [options]',
  help: `Complete a task and optionally create a merge request.

This command:
1. Marks the task as closed
2. Records completion time and optional summary
3. Creates a merge request for the task branch (unless --no-mr)

Arguments:
  task-id    Task identifier to complete

Options:
  -s, --summary <text>      Summary of what was accomplished
  -c, --commitHash <hash>   Commit hash for the final commit
  --no-mr                   Skip merge request creation
  --mr-title <title>        Custom MR title (defaults to task title)
  --mr-body <body>          Custom MR body
  -b, --baseBranch <name>   Base branch for MR (default: main)

Examples:
  el task complete el-abc123
  el task complete el-abc123 --summary "Implemented login feature"
  el task complete el-abc123 --no-mr
  el task complete el-abc123 --baseBranch develop`,
  options: taskCompleteOptions,
  handler: taskCompleteHandler as Command['handler'],
};

// ============================================================================
// Main Task Command
// ============================================================================

export const taskCommand: Command = {
  name: 'task',
  description: 'Orchestrator task management',
  usage: 'el task <subcommand> [options]',
  help: `Orchestrator task management commands.

Subcommands:
  handoff   Hand off a task to another agent
  complete  Complete a task and optionally create a merge request

Examples:
  el task handoff el-abc123 --message "Need help with frontend"
  el task complete el-abc123 --summary "Implemented feature"`,
  subcommands: {
    handoff: taskHandoffCommand,
    complete: taskCompleteCommand,
  },
  handler: taskHandoffCommand.handler, // Default to handoff
  options: [],
};

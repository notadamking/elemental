/**
 * Dispatch Commands - CLI operations for task dispatch
 *
 * Provides commands for dispatching tasks to agents:
 * - dispatch <task-id> <agent-id>: Dispatch a task to a specific agent
 * - dispatch smart <task-id>: Smart dispatch to best available agent
 */

import type { Command, GlobalOptions, CommandResult, CommandOption } from '@elemental/sdk/cli';
import { success, failure, ExitCode, getOutputMode } from '@elemental/sdk/cli';
import type { ElementId, EntityId } from '@elemental/core';
import type { OrchestratorAPI } from '../../api/index.js';

// ============================================================================
// Shared Helpers
// ============================================================================

/**
 * Creates orchestrator API client
 */
async function createOrchestratorClient(options: GlobalOptions): Promise<{
  api: OrchestratorAPI | null;
  error?: string;
}> {
  try {
    const { createStorage, initializeSchema, findElementalDir } = await import('@elemental/sdk');
    const { createOrchestratorAPI } = await import('../../api/index.js');

    const elementalDir = findElementalDir(process.cwd());
    if (!elementalDir) {
      return {
        api: null,
        error: 'No .elemental directory found. Run "el init" first.',
      };
    }

    const dbPath = options.db ?? `${elementalDir}/elemental.db`;
    const backend = createStorage({ path: dbPath, create: true });
    initializeSchema(backend);
    const api = createOrchestratorAPI(backend);

    return { api };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { api: null, error: `Failed to initialize API: ${message}` };
  }
}

// ============================================================================
// Dispatch to Agent Command
// ============================================================================

interface DispatchOptions {
  branch?: string;
  worktree?: string;
  session?: string;
}

const dispatchOptions: CommandOption[] = [
  {
    name: 'branch',
    short: 'b',
    description: 'Git branch for the task',
    hasValue: true,
  },
  {
    name: 'worktree',
    short: 'w',
    description: 'Worktree path for the task',
    hasValue: true,
  },
  {
    name: 'session',
    short: 's',
    description: 'Session ID to associate',
    hasValue: true,
  },
];

async function dispatchHandler(
  args: string[],
  options: GlobalOptions & DispatchOptions
): Promise<CommandResult> {
  const [taskId, agentId] = args;

  if (!taskId || !agentId) {
    return failure('Usage: el dispatch <task-id> <agent-id> [options]', ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = await createOrchestratorClient(options);
  if (error || !api) {
    return failure(error ?? 'Failed to create API', ExitCode.GENERAL_ERROR);
  }

  try {
    // Assign the task to the agent
    const task = await api.assignTaskToAgent(
      taskId as ElementId,
      agentId as EntityId,
      {
        branch: options.branch,
        worktree: options.worktree,
        sessionId: options.session,
      }
    );

    const mode = getOutputMode(options);

    if (mode === 'json') {
      return success({
        taskId: task.id,
        agentId,
        branch: options.branch,
        worktree: options.worktree,
      });
    }

    if (mode === 'quiet') {
      return success(task.id);
    }

    return success(task, `Dispatched task ${taskId} to agent ${agentId}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to dispatch: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

// ============================================================================
// Smart Dispatch Command
// ============================================================================

interface SmartDispatchOptions {
  branch?: string;
  worktree?: string;
}

const smartDispatchOptions: CommandOption[] = [
  {
    name: 'branch',
    short: 'b',
    description: 'Git branch for the task',
    hasValue: true,
  },
  {
    name: 'worktree',
    short: 'w',
    description: 'Worktree path for the task',
    hasValue: true,
  },
];

async function smartDispatchHandler(
  args: string[],
  options: GlobalOptions & SmartDispatchOptions
): Promise<CommandResult> {
  const [taskId] = args;

  if (!taskId) {
    return failure('Usage: el dispatch smart <task-id> [options]', ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = await createOrchestratorClient(options);
  if (error || !api) {
    return failure(error ?? 'Failed to create API', ExitCode.GENERAL_ERROR);
  }

  try {
    // Get available workers
    const workers = await api.getAvailableWorkers();

    if (workers.length === 0) {
      return failure('No available agents found for this task', ExitCode.NOT_FOUND);
    }

    // Pick the first available worker
    const agent = workers[0];
    const agentId = agent.id as unknown as EntityId;

    // Assign the task to the agent
    const task = await api.assignTaskToAgent(
      taskId as ElementId,
      agentId,
      {
        branch: options.branch,
        worktree: options.worktree,
      }
    );

    const mode = getOutputMode(options);

    if (mode === 'json') {
      return success({
        taskId: task.id,
        agentId: agent.id,
        agentName: agent.name,
        branch: options.branch,
        worktree: options.worktree,
      });
    }

    if (mode === 'quiet') {
      return success(agent.id);
    }

    return success(
      { task, agent },
      `Smart dispatched task ${taskId} to agent ${agent.id} (${agent.name ?? 'unnamed'})`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to smart dispatch: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

export const smartDispatchCommand: Command = {
  name: 'smart',
  description: 'Smart dispatch to best available agent',
  usage: 'el dispatch smart <task-id> [options]',
  help: `Automatically dispatch a task to the best available agent.

Arguments:
  task-id    Task identifier

Options:
  -b, --branch <branch>      Git branch for the task
  -w, --worktree <path>      Worktree path for the task

Examples:
  el dispatch smart el-abc123
  el dispatch smart el-abc123 --branch feature/my-task`,
  options: smartDispatchOptions,
  handler: smartDispatchHandler as Command['handler'],
};

// ============================================================================
// Main Dispatch Command
// ============================================================================

export const dispatchCommand: Command = {
  name: 'dispatch',
  description: 'Dispatch a task to an agent',
  usage: 'el dispatch <task-id> <agent-id> [options]',
  help: `Dispatch a task to an agent for execution.

Arguments:
  task-id     Task identifier
  agent-id    Agent identifier

Options:
  -b, --branch <branch>      Git branch for the task
  -w, --worktree <path>      Worktree path for the task
  -s, --session <id>         Session ID to associate

Subcommands:
  smart    Smart dispatch to best available agent

Examples:
  el dispatch el-abc123 el-agent1
  el dispatch el-abc123 el-agent1 --branch feature/my-task
  el dispatch smart el-abc123`,
  subcommands: {
    smart: smartDispatchCommand,
  },
  options: dispatchOptions,
  handler: dispatchHandler as Command['handler'],
};

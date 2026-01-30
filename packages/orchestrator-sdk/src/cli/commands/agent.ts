/**
 * Agent Commands - CLI operations for orchestrator agents
 *
 * Provides commands for agent management:
 * - agent list: List all registered agents
 * - agent show <id>: Show agent details
 * - agent register <name>: Register a new agent
 * - agent start <id>: Start an agent session
 * - agent stop <id>: Stop an agent session
 * - agent stream <id>: Stream agent channel messages
 */

import type { Command, GlobalOptions, CommandResult, CommandOption } from '@elemental/sdk/cli';
import { success, failure, ExitCode, getFormatter, getOutputMode } from '@elemental/sdk/cli';
import type { EntityId } from '@elemental/core';
import type { AgentRole, WorkerMode, StewardFocus } from '../../types/index.js';
import type { OrchestratorAPI, AgentEntity } from '../../api/index.js';

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

/**
 * Gets agent metadata from agent entity
 */
function getAgentMeta(agent: AgentEntity): Record<string, unknown> {
  return (agent.metadata?.agent ?? {}) as unknown as Record<string, unknown>;
}

// ============================================================================
// Agent List Command
// ============================================================================

interface AgentListOptions {
  role?: string;
  status?: string;
}

const agentListOptions: CommandOption[] = [
  {
    name: 'role',
    short: 'r',
    description: 'Filter by role (director, worker, steward)',
    hasValue: true,
  },
  {
    name: 'status',
    short: 's',
    description: 'Filter by session status (idle, running, suspended, terminated)',
    hasValue: true,
  },
];

async function agentListHandler(
  _args: string[],
  options: GlobalOptions & AgentListOptions
): Promise<CommandResult> {
  const { api, error } = await createOrchestratorClient(options);
  if (error || !api) {
    return failure(error ?? 'Failed to create API', ExitCode.GENERAL_ERROR);
  }

  try {
    let agents: AgentEntity[];

    // Filter by role if specified
    if (options.role) {
      const validRoles = ['director', 'worker', 'steward'];
      if (!validRoles.includes(options.role)) {
        return failure(
          `Invalid role: ${options.role}. Must be one of: ${validRoles.join(', ')}`,
          ExitCode.VALIDATION
        );
      }
      agents = await api.getAgentsByRole(options.role as AgentRole);
    } else {
      agents = await api.listAgents();
    }

    // Additional filter by status
    if (options.status) {
      const validStatuses = ['idle', 'running', 'suspended', 'terminated'];
      if (!validStatuses.includes(options.status)) {
        return failure(
          `Invalid status: ${options.status}. Must be one of: ${validStatuses.join(', ')}`,
          ExitCode.VALIDATION
        );
      }
      agents = agents.filter((a) => {
        const meta = getAgentMeta(a);
        return meta.sessionStatus === options.status;
      });
    }

    const mode = getOutputMode(options);
    const formatter = getFormatter(mode);

    if (mode === 'json') {
      return success(agents);
    }

    if (mode === 'quiet') {
      return success(agents.map((a) => a.id).join('\n'));
    }

    if (agents.length === 0) {
      return success(null, 'No agents found');
    }

    const headers = ['ID', 'NAME', 'ROLE', 'STATUS', 'SESSION'];
    const rows = agents.map((agent) => {
      const meta = getAgentMeta(agent);
      return [
        agent.id,
        agent.name ?? '-',
        (meta.agentRole as string) ?? '-',
        (meta.sessionStatus as string) ?? 'idle',
        (meta.sessionId as string)?.slice(0, 8) ?? '-',
      ];
    });

    const table = formatter.table(headers, rows);
    return success(agents, `${table}\n${agents.length} agent(s)`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to list agents: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

export const agentListCommand: Command = {
  name: 'list',
  description: 'List registered agents',
  usage: 'el agent list [options]',
  help: `List all registered orchestrator agents.

Options:
  -r, --role <role>      Filter by role (director, worker, steward)
  -s, --status <status>  Filter by session status

Examples:
  el agent list
  el agent list --role worker
  el agent list --status running`,
  options: agentListOptions,
  handler: agentListHandler as Command['handler'],
};

// ============================================================================
// Agent Show Command
// ============================================================================

async function agentShowHandler(
  args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  const [id] = args;

  if (!id) {
    return failure('Usage: el agent show <id>', ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = await createOrchestratorClient(options);
  if (error || !api) {
    return failure(error ?? 'Failed to create API', ExitCode.GENERAL_ERROR);
  }

  try {
    const agent = await api.getAgent(id as EntityId);
    if (!agent) {
      return failure(`Agent not found: ${id}`, ExitCode.NOT_FOUND);
    }

    const mode = getOutputMode(options);

    if (mode === 'json') {
      return success(agent);
    }

    if (mode === 'quiet') {
      return success(agent.id);
    }

    const meta = getAgentMeta(agent);
    const lines = [
      `ID:       ${agent.id}`,
      `Name:     ${agent.name ?? '-'}`,
      `Role:     ${meta.agentRole ?? '-'}`,
      `Status:   ${meta.sessionStatus ?? 'idle'}`,
      `Session:  ${meta.sessionId ?? '-'}`,
      `Channel:  ${meta.channelId ?? '-'}`,
      `Created:  ${agent.createdAt}`,
    ];

    if (meta.workerMode) {
      lines.push(`Mode:     ${meta.workerMode}`);
    }
    if (meta.stewardFocus) {
      lines.push(`Focus:    ${meta.stewardFocus}`);
    }

    return success(agent, lines.join('\n'));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to show agent: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

export const agentShowCommand: Command = {
  name: 'show',
  description: 'Show agent details',
  usage: 'el agent show <id>',
  help: `Show detailed information about an agent.

Arguments:
  id    Agent identifier

Examples:
  el agent show el-abc123`,
  options: [],
  handler: agentShowHandler as Command['handler'],
};

// ============================================================================
// Agent Register Command
// ============================================================================

interface AgentRegisterOptions {
  role?: string;
  mode?: string;
  focus?: string;
  maxTasks?: string;
}

const agentRegisterOptions: CommandOption[] = [
  {
    name: 'role',
    short: 'r',
    description: 'Agent role (worker, director, steward)',
    hasValue: true,
    required: true,
  },
  {
    name: 'mode',
    short: 'm',
    description: 'Worker mode (ephemeral, persistent)',
    hasValue: true,
  },
  {
    name: 'focus',
    short: 'f',
    description: 'Steward focus (merge, health, dependency)',
    hasValue: true,
  },
  {
    name: 'maxTasks',
    short: 't',
    description: 'Maximum concurrent tasks (default: 1)',
    hasValue: true,
  },
];

async function agentRegisterHandler(
  args: string[],
  options: GlobalOptions & AgentRegisterOptions
): Promise<CommandResult> {
  const [name] = args;

  if (!name) {
    return failure('Usage: el agent register <name> --role <role> [options]', ExitCode.INVALID_ARGUMENTS);
  }

  if (!options.role) {
    return failure('--role is required', ExitCode.INVALID_ARGUMENTS);
  }

  const validRoles = ['director', 'worker', 'steward'];
  if (!validRoles.includes(options.role)) {
    return failure(
      `Invalid role: ${options.role}. Must be one of: ${validRoles.join(', ')}`,
      ExitCode.VALIDATION
    );
  }

  const { api, error } = await createOrchestratorClient(options);
  if (error || !api) {
    return failure(error ?? 'Failed to create API', ExitCode.GENERAL_ERROR);
  }

  try {
    const createdBy = (options.actor ?? 'cli') as EntityId;
    const maxConcurrentTasks = options.maxTasks ? parseInt(options.maxTasks, 10) : 1;

    let agent: AgentEntity;

    switch (options.role as AgentRole) {
      case 'director':
        agent = await api.registerDirector({
          name,
          createdBy,
          maxConcurrentTasks,
        });
        break;

      case 'worker': {
        const workerMode = (options.mode as WorkerMode) ?? 'ephemeral';
        const validModes = ['ephemeral', 'persistent'];
        if (!validModes.includes(workerMode)) {
          return failure(
            `Invalid mode: ${workerMode}. Must be one of: ${validModes.join(', ')}`,
            ExitCode.VALIDATION
          );
        }
        agent = await api.registerWorker({
          name,
          createdBy,
          workerMode,
          maxConcurrentTasks,
        });
        break;
      }

      case 'steward': {
        const stewardFocus = (options.focus as StewardFocus) ?? 'health';
        const validFocuses = ['merge', 'health', 'dependency'];
        if (!validFocuses.includes(stewardFocus)) {
          return failure(
            `Invalid focus: ${stewardFocus}. Must be one of: ${validFocuses.join(', ')}`,
            ExitCode.VALIDATION
          );
        }
        agent = await api.registerSteward({
          name,
          createdBy,
          stewardFocus,
          triggers: [],
        });
        break;
      }

      default:
        return failure(`Unknown role: ${options.role}`, ExitCode.VALIDATION);
    }

    const mode = getOutputMode(options);

    if (mode === 'json') {
      return success(agent);
    }

    if (mode === 'quiet') {
      return success(agent.id);
    }

    return success(agent, `Registered ${options.role} agent: ${agent.id}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to register agent: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

export const agentRegisterCommand: Command = {
  name: 'register',
  description: 'Register a new agent',
  usage: 'el agent register <name> --role <role> [options]',
  help: `Register a new orchestrator agent.

Arguments:
  name    Agent name

Options:
  -r, --role <role>       Agent role: director, worker, steward (required)
  -m, --mode <mode>       Worker mode: ephemeral, persistent (default: ephemeral)
  -f, --focus <focus>     Steward focus: merge, health, dependency
  -t, --maxTasks <n>      Maximum concurrent tasks (default: 1)

Examples:
  el agent register MyWorker --role worker --mode ephemeral
  el agent register MainDirector --role director
  el agent register HealthChecker --role steward --focus health`,
  options: agentRegisterOptions,
  handler: agentRegisterHandler as Command['handler'],
};

// ============================================================================
// Agent Start Command
// ============================================================================

interface AgentStartOptions {
  session?: string;
}

const agentStartOptions: CommandOption[] = [
  {
    name: 'session',
    short: 's',
    description: 'Session ID to associate',
    hasValue: true,
  },
];

async function agentStartHandler(
  args: string[],
  options: GlobalOptions & AgentStartOptions
): Promise<CommandResult> {
  const [id] = args;

  if (!id) {
    return failure('Usage: el agent start <id> [--session <session-id>]', ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = await createOrchestratorClient(options);
  if (error || !api) {
    return failure(error ?? 'Failed to create API', ExitCode.GENERAL_ERROR);
  }

  try {
    const sessionId = options.session ?? `session-${Date.now()}`;
    const agent = await api.updateAgentSession(
      id as EntityId,
      sessionId,
      'running'
    );

    const mode = getOutputMode(options);

    if (mode === 'json') {
      return success(agent);
    }

    if (mode === 'quiet') {
      return success(agent.id);
    }

    return success(agent, `Started agent ${id} with session ${sessionId}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to start agent: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

export const agentStartCommand: Command = {
  name: 'start',
  description: 'Start an agent session',
  usage: 'el agent start <id> [options]',
  help: `Start an agent session.

Arguments:
  id    Agent identifier

Options:
  -s, --session <id>    Session ID to associate

Examples:
  el agent start el-abc123
  el agent start el-abc123 --session my-session`,
  options: agentStartOptions,
  handler: agentStartHandler as Command['handler'],
};

// ============================================================================
// Agent Stop Command
// ============================================================================

async function agentStopHandler(
  args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  const [id] = args;

  if (!id) {
    return failure('Usage: el agent stop <id>', ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = await createOrchestratorClient(options);
  if (error || !api) {
    return failure(error ?? 'Failed to create API', ExitCode.GENERAL_ERROR);
  }

  try {
    const agent = await api.updateAgentSession(
      id as EntityId,
      undefined,
      'idle'
    );

    const mode = getOutputMode(options);

    if (mode === 'json') {
      return success(agent);
    }

    if (mode === 'quiet') {
      return success(agent.id);
    }

    return success(agent, `Stopped agent ${id}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to stop agent: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

export const agentStopCommand: Command = {
  name: 'stop',
  description: 'Stop an agent session',
  usage: 'el agent stop <id>',
  help: `Stop an agent session.

Arguments:
  id    Agent identifier

Examples:
  el agent stop el-abc123`,
  options: [],
  handler: agentStopHandler as Command['handler'],
};

// ============================================================================
// Agent Stream Command
// ============================================================================

async function agentStreamHandler(
  args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  const [id] = args;

  if (!id) {
    return failure('Usage: el agent stream <id>', ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = await createOrchestratorClient(options);
  if (error || !api) {
    return failure(error ?? 'Failed to create API', ExitCode.GENERAL_ERROR);
  }

  try {
    const channelId = await api.getAgentChannel(id as EntityId);
    if (!channelId) {
      return failure(`No channel found for agent: ${id}`, ExitCode.NOT_FOUND);
    }

    const mode = getOutputMode(options);

    if (mode === 'json') {
      return success({ channelId, agentId: id });
    }

    return success(
      { channelId },
      `Agent ${id} channel: ${channelId}\nUse "el channel stream ${channelId}" to watch messages`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to get agent stream: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

export const agentStreamCommand: Command = {
  name: 'stream',
  description: 'Get agent channel for streaming',
  usage: 'el agent stream <id>',
  help: `Get the channel ID for an agent to stream messages.

Arguments:
  id    Agent identifier

Examples:
  el agent stream el-abc123`,
  options: [],
  handler: agentStreamHandler as Command['handler'],
};

// ============================================================================
// Main Agent Command
// ============================================================================

export const agentCommand: Command = {
  name: 'agent',
  description: 'Manage orchestrator agents',
  usage: 'el agent <subcommand> [options]',
  help: `Manage orchestrator agents.

Subcommands:
  list      List all registered agents
  show      Show agent details
  register  Register a new agent
  start     Start an agent session
  stop      Stop an agent session
  stream    Get agent channel for streaming

Examples:
  el agent list
  el agent register MyWorker --role worker
  el agent start el-abc123`,
  subcommands: {
    list: agentListCommand,
    show: agentShowCommand,
    register: agentRegisterCommand,
    start: agentStartCommand,
    stop: agentStopCommand,
    stream: agentStreamCommand,
  },
  handler: agentListCommand.handler, // Default to list
  options: [],
};

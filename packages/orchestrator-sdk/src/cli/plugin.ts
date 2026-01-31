/**
 * Orchestrator CLI Plugin
 *
 * Exports the CLI plugin that registers orchestrator commands
 * with the main `el` CLI.
 */

import type { CLIPlugin } from '@elemental/sdk/cli';
import { agentCommand } from './commands/agent.js';
import { daemonCommand } from './commands/daemon.js';
import { dispatchCommand } from './commands/dispatch.js';
import { taskCommand } from './commands/task.js';

/**
 * The orchestrator CLI plugin.
 *
 * Provides commands for:
 * - `agent`: Manage orchestrator agents (list, show, register, start, stop, stream)
 * - `daemon`: Manage the dispatch daemon (start, stop, status)
 * - `dispatch`: Dispatch tasks to agents
 * - `task`: Task management (handoff, complete)
 */
export const cliPlugin: CLIPlugin = {
  name: 'orchestrator',
  version: '0.1.0',
  commands: [agentCommand, daemonCommand, dispatchCommand, taskCommand],
  aliases: {
    agents: 'agent list',
  },
};

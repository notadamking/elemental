/**
 * Orchestrator CLI Plugin
 *
 * Exports the CLI plugin that registers orchestrator commands
 * with the main `el` CLI.
 */

import type { CLIPlugin } from '@elemental/sdk/cli';
import { agentCommand } from './commands/agent.js';
import { dispatchCommand } from './commands/dispatch.js';

/**
 * The orchestrator CLI plugin.
 *
 * Provides commands for:
 * - `agent`: Manage orchestrator agents (list, show, register, start, stop, stream)
 * - `dispatch`: Dispatch tasks to agents
 */
export const cliPlugin: CLIPlugin = {
  name: 'orchestrator',
  version: '0.1.0',
  commands: [agentCommand, dispatchCommand],
  aliases: {
    agents: 'agent list',
  },
};

/**
 * Orchestrator CLI Module
 *
 * Exports CLI commands and plugin for the orchestrator.
 */

// Plugin export
export { cliPlugin } from './plugin.js';

// Command exports
export { agentCommand, agentListCommand, agentShowCommand, agentRegisterCommand, agentStartCommand, agentStopCommand, agentStreamCommand } from './commands/agent.js';
export { dispatchCommand, smartDispatchCommand } from './commands/dispatch.js';

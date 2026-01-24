/**
 * CLI Module - Command-line interface for Elemental
 */

// Types
export * from './types.js';

// Parser
export { parseArgs, validateRequiredOptions, getGlobalOptionsHelp, getCommandOptionsHelp } from './parser.js';

// Formatter
export { getFormatter, getOutputMode, getStatusIcon, type OutputFormatter, type TreeNode } from './formatter.js';

// Runner
export { registerCommand, getCommand, getAllCommands, run, main } from './runner.js';

// Commands
export { initCommand } from './commands/init.js';
export { configCommand } from './commands/config.js';
export { helpCommand, versionCommand, getCommandHelp } from './commands/help.js';
export { createCommand, listCommand, showCommand } from './commands/crud.js';
export { depCommand, depAddCommand, depRemoveCommand, depListCommand, depTreeCommand } from './commands/dep.js';
export { statsCommand } from './commands/stats.js';
export { planCommand } from './commands/plan.js';
export { workflowCommand } from './commands/workflow.js';
export { playbookCommand } from './commands/playbook.js';
export { channelCommand } from './commands/channel.js';
export { libraryCommand } from './commands/library.js';
export { teamCommand } from './commands/team.js';

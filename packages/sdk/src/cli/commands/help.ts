/**
 * help command - Display help information
 */

import type { Command, CommandResult } from '../types.js';
import { success } from '../types.js';
import { getGlobalOptionsHelp } from '../parser.js';
import { getAllCommands } from '../runner.js';

// ============================================================================
// Version Info
// ============================================================================

const VERSION = '0.1.0';

// ============================================================================
// Help Text
// ============================================================================

// Built-in command categories for display
const COMMAND_CATEGORIES: Record<string, string[]> = {
  'Element Operations': ['create', 'list', 'show', 'update', 'delete'],
  'Task Operations': ['ready', 'blocked', 'close', 'reopen', 'assign', 'defer', 'undefer'],
  'Dependency Operations': ['dep'],
  'Sync Operations': ['sync', 'export', 'import', 'status'],
  'Identity Operations': ['identity', 'whoami'],
  'Collection Operations': ['plan', 'workflow', 'playbook', 'channel', 'library', 'team', 'document', 'message', 'inbox'],
  'Entity Operations': ['entity'],
  'Admin Operations': ['init', 'config', 'stats', 'doctor', 'migrate', 'gc', 'history'],
  'Shell': ['completion', 'alias', 'help', 'version'],
};

// Commands that are built-in
const BUILTIN_COMMANDS = new Set(
  Object.values(COMMAND_CATEGORIES).flat()
);

/**
 * Generates the main help text dynamically
 */
function generateMainHelp(): string {
  const lines: string[] = [
    'Elemental - Agent coordination system',
    '',
    'Usage: elemental <command> [options]',
    '       el <command> [options]',
    '',
    'Commands:',
  ];

  const allCommands = getAllCommands();
  const commandMap = new Map(allCommands.map(cmd => [cmd.name, cmd]));

  // Add categorized built-in commands
  for (const [category, commands] of Object.entries(COMMAND_CATEGORIES)) {
    const availableCommands = commands.filter(cmd => commandMap.has(cmd));

    if (availableCommands.length === 0) continue;

    lines.push(`  ${category}:`);
    for (const cmdName of availableCommands) {
      const cmd = commandMap.get(cmdName);
      if (cmd) {
        lines.push(`    ${cmdName.padEnd(16)} ${cmd.description}`);
      }
    }
    lines.push('');
  }

  // Add plugin commands (commands not in built-in set)
  const pluginCommands = allCommands
    .filter(cmd => !BUILTIN_COMMANDS.has(cmd.name))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (pluginCommands.length > 0) {
    lines.push('  Plugin Commands:');
    for (const cmd of pluginCommands) {
      lines.push(`    ${cmd.name.padEnd(16)} ${cmd.description}`);
    }
    lines.push('');
  }

  lines.push(getGlobalOptionsHelp());
  lines.push('');
  lines.push('Use "el <command> --help" for more information about a command.');

  return lines.join('\n');
}

// ============================================================================
// Handler
// ============================================================================

function helpHandler(): CommandResult {
  return success(undefined, generateMainHelp());
}

function versionHandler(): CommandResult {
  return success({ version: VERSION }, `elemental v${VERSION}`);
}

// ============================================================================
// Command Definitions
// ============================================================================

export const helpCommand: Command = {
  name: 'help',
  description: 'Show help information',
  usage: 'el help [command]',
  handler: helpHandler,
};

export const versionCommand: Command = {
  name: 'version',
  description: 'Show version',
  usage: 'el version',
  handler: versionHandler,
};

/**
 * Gets help text for a specific command
 */
export function getCommandHelp(command: Command): string {
  const lines: string[] = [
    command.description,
    '',
    `Usage: ${command.usage}`,
  ];

  if (command.help) {
    lines.push('', command.help);
  }

  if (command.options && command.options.length > 0) {
    lines.push('', 'Options:');
    for (const opt of command.options) {
      const shortPart = opt.short ? `-${opt.short}, ` : '    ';
      const valuePart = opt.hasValue ? ` <${opt.name}>` : '';
      const requiredPart = opt.required ? ' (required)' : '';
      lines.push(`  ${shortPart}--${opt.name}${valuePart}${requiredPart}`);
      lines.push(`        ${opt.description}`);
    }
  }

  if (command.subcommands) {
    lines.push('', 'Subcommands:');
    for (const [name, sub] of Object.entries(command.subcommands)) {
      lines.push(`  ${name.padEnd(20)} ${sub.description}`);
    }
  }

  lines.push('', getGlobalOptionsHelp());

  return lines.join('\n');
}

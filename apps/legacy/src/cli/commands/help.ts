/**
 * help command - Display help information
 */

import type { Command, CommandResult } from '../types.js';
import { success } from '../types.js';
import { getGlobalOptionsHelp } from '../parser.js';

// ============================================================================
// Version Info
// ============================================================================

const VERSION = '0.1.0';

// ============================================================================
// Help Text
// ============================================================================

const MAIN_HELP = `Elemental - Agent coordination system

Usage: elemental <command> [options]
       el <command> [options]

Commands:
  Element Operations:
    create <type>       Create a new element
    list [type]         List elements
    show <id>           Show element details
    update <id>         Update an element
    delete <id>         Delete an element
    search <query>      Search elements

  Task Operations:
    ready               List ready tasks
    blocked             List blocked tasks
    close <id>          Close a task
    reopen <id>         Reopen a closed task
    assign <id>         Assign a task
    defer <id>          Defer a task
    undefer <id>        Remove defer

  Dependency Operations:
    dep add <src> <tgt> Add a dependency
    dep remove <src> <tgt> Remove a dependency
    dep list <id>       List dependencies
    dep tree <id>       Show dependency tree

  Admin Operations:
    init                Initialize workspace
    config              Manage configuration
    stats               Show statistics
    doctor              Check system health

${getGlobalOptionsHelp()}

Use "el <command> --help" for more information about a command.`;

// ============================================================================
// Handler
// ============================================================================

function helpHandler(): CommandResult {
  return success(undefined, MAIN_HELP);
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

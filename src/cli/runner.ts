/**
 * CLI Runner
 *
 * Main entry point for command execution.
 */

import type { Command, CommandResult, GlobalOptions } from './types.js';
import { failure, ExitCode } from './types.js';
import { parseArgs, validateRequiredOptions } from './parser.js';
import { getFormatter, getOutputMode } from './formatter.js';
import { getCommandHelp } from './commands/help.js';

// ============================================================================
// Command Registry
// ============================================================================

const commands: Map<string, Command> = new Map();

/**
 * Registers a command
 */
export function registerCommand(command: Command): void {
  commands.set(command.name, command);
}

/**
 * Gets a registered command
 */
export function getCommand(name: string): Command | undefined {
  return commands.get(name);
}

/**
 * Gets all registered commands
 */
export function getAllCommands(): Command[] {
  return Array.from(commands.values());
}

// ============================================================================
// Command Resolution
// ============================================================================

/**
 * Resolves a command path to a command definition
 */
function resolveCommand(commandPath: string[]): {
  command: Command | undefined;
  args: string[];
} {
  if (commandPath.length === 0) {
    return { command: undefined, args: [] };
  }

  const [first, ...rest] = commandPath;
  let command: Command | undefined = commands.get(first);

  if (!command) {
    return { command: undefined, args: commandPath };
  }

  // Resolve subcommands
  let args = rest;
  while (args.length > 0 && command && command.subcommands) {
    const subName = args[0];
    const subCommand: Command | undefined = command.subcommands[subName];
    if (subCommand) {
      command = subCommand;
      args = args.slice(1);
    } else {
      break;
    }
  }

  return { command, args };
}

// ============================================================================
// Runner
// ============================================================================

/**
 * Runs the CLI with the given arguments
 */
export async function run(argv: string[]): Promise<number> {
  // First pass: parse for global options and command path
  let parsed;
  try {
    parsed = parseArgs(argv);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Error: ${message}`);
    return ExitCode.INVALID_ARGUMENTS;
  }

  const { command: commandPath, args: parsedArgs, options } = parsed;

  // Handle version flag
  if (options.version) {
    const version = await import('./commands/help.js').then(m => m.versionCommand);
    const result = await version.handler([], { ...options });
    return outputResult(result, options);
  }

  // Handle help flag with no command
  if (options.help && commandPath.length === 0) {
    const help = await import('./commands/help.js').then(m => m.helpCommand);
    const result = await help.handler([], { ...options });
    return outputResult(result, options);
  }

  // No command specified
  if (commandPath.length === 0) {
    const help = await import('./commands/help.js').then(m => m.helpCommand);
    const result = await help.handler([], { ...options });
    return outputResult(result, options);
  }

  // Resolve command
  const { command, args: subcommandArgs } = resolveCommand(commandPath);
  // Combine any args from subcommand resolution with parsed positional args
  const resolvedArgs = [...subcommandArgs, ...parsedArgs];

  if (!command) {
    const result = failure(
      `Unknown command: ${commandPath.join(' ')}`,
      ExitCode.INVALID_ARGUMENTS
    );
    return outputResult(result, options);
  }

  // Handle help flag for specific command
  if (options.help) {
    const helpText = getCommandHelp(command);
    console.log(helpText);
    return ExitCode.SUCCESS;
  }

  // Re-parse with command-specific options
  try {
    const fullParsed = parseArgs(argv, command.options);

    // Validate required options
    if (command.options) {
      validateRequiredOptions(fullParsed.commandOptions, command.options);
    }

    // Execute command
    const result = await command.handler(
      resolvedArgs,
      { ...fullParsed.options, ...fullParsed.commandOptions }
    );

    return outputResult(result, fullParsed.options);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const result = failure(message, ExitCode.GENERAL_ERROR);
    return outputResult(result, options);
  }
}

// ============================================================================
// Output
// ============================================================================

/**
 * Outputs a command result and returns the exit code
 */
function outputResult(result: CommandResult, options: GlobalOptions): number {
  const mode = getOutputMode(options);
  const formatter = getFormatter(mode);

  if (result.error) {
    const output = formatter.error(result);
    if (output) {
      console.error(output);
    }
  } else {
    const output = formatter.success(result);
    if (output) {
      console.log(output);
    }
  }

  return result.exitCode;
}

// ============================================================================
// CLI Entry Point
// ============================================================================

/**
 * Main CLI entry point
 */
export async function main(argv: string[] = process.argv.slice(2)): Promise<never> {
  // Register all commands
  const { initCommand } = await import('./commands/init.js');
  const { configCommand } = await import('./commands/config.js');
  const { helpCommand, versionCommand } = await import('./commands/help.js');
  const { createCommand, listCommand, showCommand } = await import('./commands/crud.js');

  registerCommand(initCommand);
  registerCommand(configCommand);
  registerCommand(helpCommand);
  registerCommand(versionCommand);
  registerCommand(createCommand);
  registerCommand(listCommand);
  registerCommand(showCommand);

  const exitCode = await run(argv);
  process.exit(exitCode);
}

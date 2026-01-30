/**
 * CLI Plugin Registry Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import {
  registerPluginCommands,
  registerAllPlugins,
  logConflictWarnings,
  getPluginCommandSummary,
} from './plugin-registry.js';
import { registerCommand, getCommand } from './runner.js';
import { success } from './types.js';
import type { CLIPlugin } from './plugin-types.js';
import type { Command } from './types.js';

// Track console output for tests
let consoleErrors: string[] = [];
const originalError = console.error;

beforeEach(() => {
  consoleErrors = [];
  console.error = (...args: unknown[]) => consoleErrors.push(args.map(String).join(' '));
});

afterEach(() => {
  console.error = originalError;
});

// Helper to create unique test command names to avoid conflicts
let testCommandCounter = 0;
function uniqueCommandName(prefix: string): string {
  return `${prefix}-${Date.now()}-${testCommandCounter++}`;
}

describe('registerPluginCommands', () => {
  it('should register plugin commands', () => {
    const commandName = uniqueCommandName('reg-test');
    const plugin: CLIPlugin = {
      name: 'test-plugin',
      version: '1.0.0',
      commands: [
        {
          name: commandName,
          description: 'Test command',
          usage: `el ${commandName}`,
          handler: () => success(),
        },
      ],
    };

    const result = registerPluginCommands(plugin);

    expect(result.pluginName).toBe('test-plugin');
    expect(result.registeredCommands).toContain(commandName);
    expect(result.skippedCommands).toHaveLength(0);
    expect(getCommand(commandName)).toBeDefined();
  });

  it('should skip commands that conflict with existing commands', () => {
    // First register a command directly
    const commandName = uniqueCommandName('conflict-test');
    const existingCommand: Command = {
      name: commandName,
      description: 'Existing command',
      usage: `el ${commandName}`,
      handler: () => success(),
    };
    registerCommand(existingCommand);

    // Now try to register a plugin with the same command name
    const plugin: CLIPlugin = {
      name: 'conflict-plugin',
      version: '1.0.0',
      commands: [
        {
          name: commandName,
          description: 'Conflicting command',
          usage: `el ${commandName}`,
          handler: () => success(),
        },
      ],
    };

    const result = registerPluginCommands(plugin);

    expect(result.registeredCommands).not.toContain(commandName);
    expect(result.skippedCommands.length).toBe(1);
    expect(result.skippedCommands[0].commandName).toBe(commandName);
    expect(result.skippedCommands[0].success).toBe(false);
    expect(result.skippedCommands[0].conflictReason).toContain('already registered');
  });

  it('should register plugin aliases', () => {
    const commandName = uniqueCommandName('alias-test');
    const aliasName = uniqueCommandName('alias-shortcut');
    const plugin: CLIPlugin = {
      name: 'alias-plugin',
      version: '1.0.0',
      commands: [
        {
          name: commandName,
          description: 'Test command',
          usage: `el ${commandName}`,
          handler: () => success(),
        },
      ],
      aliases: {
        [aliasName]: commandName,
      },
    };

    const result = registerPluginCommands(plugin);

    expect(result.registeredAliases).toContain(aliasName);
    expect(result.skippedAliases).toHaveLength(0);
  });

  it('should skip aliases that conflict with existing commands', () => {
    // First register a command
    const commandName = uniqueCommandName('alias-conflict-cmd');
    const existingCommand: Command = {
      name: commandName,
      description: 'Existing command',
      usage: `el ${commandName}`,
      handler: () => success(),
    };
    registerCommand(existingCommand);

    // Try to create an alias with the same name
    const otherCommandName = uniqueCommandName('alias-conflict-target');
    const plugin: CLIPlugin = {
      name: 'alias-conflict-plugin',
      version: '1.0.0',
      commands: [
        {
          name: otherCommandName,
          description: 'Other command',
          usage: `el ${otherCommandName}`,
          handler: () => success(),
        },
      ],
      aliases: {
        [commandName]: otherCommandName, // Alias conflicts with existing command
      },
    };

    const result = registerPluginCommands(plugin);

    expect(result.registeredAliases).not.toContain(commandName);
    expect(result.skippedAliases).toContain(commandName);
  });

  it('should log verbose output when enabled', () => {
    const commandName = uniqueCommandName('verbose-test');
    const plugin: CLIPlugin = {
      name: 'verbose-plugin',
      version: '1.0.0',
      commands: [
        {
          name: commandName,
          description: 'Test command',
          usage: `el ${commandName}`,
          handler: () => success(),
        },
      ],
    };

    registerPluginCommands(plugin, { verbose: true });

    expect(consoleErrors.some(e => e.includes('[plugin:verbose-plugin]'))).toBe(true);
    expect(consoleErrors.some(e => e.includes(`Registered command '${commandName}'`))).toBe(true);
  });
});

describe('registerAllPlugins', () => {
  it('should register multiple plugins', async () => {
    const cmd1Name = uniqueCommandName('multi-plugin-1');
    const cmd2Name = uniqueCommandName('multi-plugin-2');

    const plugins: CLIPlugin[] = [
      {
        name: 'plugin-1',
        version: '1.0.0',
        commands: [
          {
            name: cmd1Name,
            description: 'Command 1',
            usage: `el ${cmd1Name}`,
            handler: () => success(),
          },
        ],
      },
      {
        name: 'plugin-2',
        version: '1.0.0',
        commands: [
          {
            name: cmd2Name,
            description: 'Command 2',
            usage: `el ${cmd2Name}`,
            handler: () => success(),
          },
        ],
      },
    ];

    const results = await registerAllPlugins(plugins);

    expect(results).toHaveLength(2);
    expect(results[0].pluginName).toBe('plugin-1');
    expect(results[1].pluginName).toBe('plugin-2');
    expect(getCommand(cmd1Name)).toBeDefined();
    expect(getCommand(cmd2Name)).toBeDefined();
  });

  it('should call plugin init function', async () => {
    let initCalled = false;
    const cmdName = uniqueCommandName('init-test');

    const plugins: CLIPlugin[] = [
      {
        name: 'init-plugin',
        version: '1.0.0',
        commands: [
          {
            name: cmdName,
            description: 'Test',
            usage: `el ${cmdName}`,
            handler: () => success(),
          },
        ],
        init: async () => {
          initCalled = true;
        },
      },
    ];

    await registerAllPlugins(plugins);

    expect(initCalled).toBe(true);
  });

  it('should continue registration if init fails', async () => {
    const cmdName = uniqueCommandName('init-fail-test');

    const plugins: CLIPlugin[] = [
      {
        name: 'failing-init-plugin',
        version: '1.0.0',
        commands: [
          {
            name: cmdName,
            description: 'Test',
            usage: `el ${cmdName}`,
            handler: () => success(),
          },
        ],
        init: async () => {
          throw new Error('Init failed');
        },
      },
    ];

    const results = await registerAllPlugins(plugins);

    expect(results).toHaveLength(1);
    expect(results[0].registeredCommands).toContain(cmdName);
    expect(consoleErrors.some(e => e.includes('Init failed'))).toBe(true);
  });

  it('should give precedence to earlier plugins', async () => {
    const sharedName = uniqueCommandName('precedence-test');

    const plugins: CLIPlugin[] = [
      {
        name: 'first-plugin',
        version: '1.0.0',
        commands: [
          {
            name: sharedName,
            description: 'First plugin command',
            usage: `el ${sharedName}`,
            handler: () => success({ from: 'first' }),
          },
        ],
      },
      {
        name: 'second-plugin',
        version: '1.0.0',
        commands: [
          {
            name: sharedName,
            description: 'Second plugin command',
            usage: `el ${sharedName}`,
            handler: () => success({ from: 'second' }),
          },
        ],
      },
    ];

    const results = await registerAllPlugins(plugins);

    // First plugin should have registered the command
    expect(results[0].registeredCommands).toContain(sharedName);
    // Second plugin should have skipped it
    expect(results[1].skippedCommands.some(s => s.commandName === sharedName)).toBe(true);
  });
});

describe('logConflictWarnings', () => {
  it('should log warnings for skipped commands', () => {
    const results = [
      {
        pluginName: 'test-plugin',
        registeredCommands: [],
        skippedCommands: [
          {
            commandName: 'skipped-cmd',
            success: false,
            conflictReason: 'Command already registered',
          },
        ],
        registeredAliases: [],
        skippedAliases: [],
      },
    ];

    logConflictWarnings(results);

    expect(consoleErrors.some(e => e.includes('[plugin:test-plugin]'))).toBe(true);
    expect(consoleErrors.some(e => e.includes('Command already registered'))).toBe(true);
  });

  it('should log warnings for skipped aliases', () => {
    const results = [
      {
        pluginName: 'alias-plugin',
        registeredCommands: [],
        skippedCommands: [],
        registeredAliases: [],
        skippedAliases: ['alias1', 'alias2'],
      },
    ];

    logConflictWarnings(results);

    expect(consoleErrors.some(e => e.includes('[plugin:alias-plugin]'))).toBe(true);
    expect(consoleErrors.some(e => e.includes('Skipped 2 alias'))).toBe(true);
  });

  it('should not log anything when no conflicts', () => {
    const results = [
      {
        pluginName: 'clean-plugin',
        registeredCommands: ['cmd1', 'cmd2'],
        skippedCommands: [],
        registeredAliases: ['alias1'],
        skippedAliases: [],
      },
    ];

    logConflictWarnings(results);

    expect(consoleErrors).toHaveLength(0);
  });
});

describe('getPluginCommandSummary', () => {
  it('should return summary of registered commands', () => {
    const results = [
      {
        pluginName: 'plugin-1',
        registeredCommands: ['cmd1', 'cmd2'],
        skippedCommands: [],
        registeredAliases: [],
        skippedAliases: [],
      },
      {
        pluginName: 'plugin-2',
        registeredCommands: ['cmd3'],
        skippedCommands: [],
        registeredAliases: [],
        skippedAliases: [],
      },
    ];

    const summary = getPluginCommandSummary(results);

    expect(summary.get('plugin-1')).toEqual(['cmd1', 'cmd2']);
    expect(summary.get('plugin-2')).toEqual(['cmd3']);
  });

  it('should exclude plugins with no registered commands', () => {
    const results = [
      {
        pluginName: 'empty-plugin',
        registeredCommands: [],
        skippedCommands: [],
        registeredAliases: [],
        skippedAliases: [],
      },
    ];

    const summary = getPluginCommandSummary(results);

    expect(summary.has('empty-plugin')).toBe(false);
    expect(summary.size).toBe(0);
  });
});

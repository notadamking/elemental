/**
 * Shell Completion Tests
 */

import { describe, test, expect } from 'bun:test';
import {
  generateBashCompletion,
  generateZshCompletion,
  generateFishCompletion,
  generateCompletion,
  getInstallInstructions,
  type ShellType,
} from './completion.js';
import type { Command } from './types.js';

// ============================================================================
// Test Data
// ============================================================================

const mockCommands: Command[] = [
  {
    name: 'create',
    description: 'Create a new element',
    usage: 'el create <type>',
    handler: async () => ({ exitCode: 0 }),
    options: [
      { name: 'title', short: 't', description: 'Title', hasValue: true, required: true },
      { name: 'priority', short: 'p', description: 'Priority', hasValue: true },
    ],
  },
  {
    name: 'list',
    description: 'List elements',
    usage: 'el list [type]',
    handler: async () => ({ exitCode: 0 }),
    options: [
      { name: 'limit', short: 'l', description: 'Maximum results', hasValue: true },
    ],
  },
  {
    name: 'config',
    description: 'Manage configuration',
    usage: 'el config <subcommand>',
    handler: async () => ({ exitCode: 0 }),
    subcommands: {
      show: {
        name: 'show',
        description: 'Show configuration',
        usage: 'el config show',
        handler: async () => ({ exitCode: 0 }),
      },
      set: {
        name: 'set',
        description: 'Set configuration value',
        usage: 'el config set <key> <value>',
        handler: async () => ({ exitCode: 0 }),
      },
    },
  },
];

// ============================================================================
// Bash Completion Tests
// ============================================================================

describe('generateBashCompletion', () => {
  test('generates valid bash script header', () => {
    const script = generateBashCompletion(mockCommands);

    expect(script).toContain('# Bash completion for elemental (el)');
    expect(script).toContain('_elemental_completion()');
    expect(script).toContain('complete -F _elemental_completion el');
    expect(script).toContain('complete -F _elemental_completion elemental');
  });

  test('includes command names', () => {
    const script = generateBashCompletion(mockCommands);

    expect(script).toContain('create');
    expect(script).toContain('list');
    expect(script).toContain('config');
  });

  test('includes global options', () => {
    const script = generateBashCompletion(mockCommands);

    expect(script).toContain('--db');
    expect(script).toContain('--actor');
    expect(script).toContain('--json');
    expect(script).toContain('--quiet');
    expect(script).toContain('-q');
    expect(script).toContain('--verbose');
    expect(script).toContain('-v');
    expect(script).toContain('--help');
    expect(script).toContain('-h');
  });

  test('includes subcommand completion', () => {
    const script = generateBashCompletion(mockCommands);

    expect(script).toContain('config)');
    expect(script).toContain('show set');
  });

  test('includes command-specific options', () => {
    const script = generateBashCompletion(mockCommands);

    expect(script).toContain('--title');
    expect(script).toContain('-t');
    expect(script).toContain('--priority');
    expect(script).toContain('--limit');
  });
});

// ============================================================================
// Zsh Completion Tests
// ============================================================================

describe('generateZshCompletion', () => {
  test('generates valid zsh script header', () => {
    const script = generateZshCompletion(mockCommands);

    expect(script).toContain('#compdef el elemental');
    expect(script).toContain('_el()');
    expect(script).toContain('_el "$@"');
  });

  test('includes command descriptions', () => {
    const script = generateZshCompletion(mockCommands);

    expect(script).toContain('create:Create a new element');
    expect(script).toContain('list:List elements');
    expect(script).toContain('config:Manage configuration');
  });

  test('includes global options with descriptions', () => {
    const script = generateZshCompletion(mockCommands);

    expect(script).toContain("'--db[Database file path]");
    expect(script).toContain("'--json[Output in JSON format]");
  });

  test('generates subcommand functions', () => {
    const script = generateZshCompletion(mockCommands);

    expect(script).toContain('_el_config()');
    expect(script).toContain('show:Show configuration');
    expect(script).toContain('set:Set configuration value');
  });

  test('generates option functions for commands with options', () => {
    const script = generateZshCompletion(mockCommands);

    expect(script).toContain('_el_create_options()');
    expect(script).toContain('_el_list_options()');
  });
});

// ============================================================================
// Fish Completion Tests
// ============================================================================

describe('generateFishCompletion', () => {
  test('generates valid fish script header', () => {
    const script = generateFishCompletion(mockCommands);

    expect(script).toContain('# Fish completion for elemental (el)');
    expect(script).toContain('complete -c el -f');
    expect(script).toContain('complete -c elemental -f');
  });

  test('includes command completions', () => {
    const script = generateFishCompletion(mockCommands);

    expect(script).toContain("-a create -d 'Create a new element'");
    expect(script).toContain("-a list -d 'List elements'");
    expect(script).toContain("-a config -d 'Manage configuration'");
  });

  test('includes global options', () => {
    const script = generateFishCompletion(mockCommands);

    expect(script).toContain("-l db -r -d 'Database file path'");
    expect(script).toContain("-l json -d 'Output in JSON format'");
    expect(script).toContain("-s q -l quiet");
    expect(script).toContain("-s v -l verbose");
  });

  test('includes subcommand completions', () => {
    const script = generateFishCompletion(mockCommands);

    expect(script).toContain("__fish_seen_subcommand_from config");
    expect(script).toContain("-a show -d 'Show configuration'");
    expect(script).toContain("-a set -d 'Set configuration value'");
  });

  test('includes command-specific options', () => {
    const script = generateFishCompletion(mockCommands);

    expect(script).toContain("__fish_seen_subcommand_from create");
    expect(script).toContain("-s t -l title");
    expect(script).toContain("-s l -l limit");
  });
});

// ============================================================================
// generateCompletion Tests
// ============================================================================

describe('generateCompletion', () => {
  test('generates bash completion', () => {
    const script = generateCompletion('bash', mockCommands);

    expect(script).toContain('_elemental_completion()');
  });

  test('generates zsh completion', () => {
    const script = generateCompletion('zsh', mockCommands);

    expect(script).toContain('#compdef el elemental');
  });

  test('generates fish completion', () => {
    const script = generateCompletion('fish', mockCommands);

    expect(script).toContain('complete -c el -f');
  });

  test('throws for unsupported shell', () => {
    expect(() => generateCompletion('powershell' as ShellType, mockCommands)).toThrow(
      'Unsupported shell: powershell'
    );
  });
});

// ============================================================================
// getInstallInstructions Tests
// ============================================================================

describe('getInstallInstructions', () => {
  test('returns bash install instructions', () => {
    const instructions = getInstallInstructions('bash');

    expect(instructions).toContain('~/.bashrc');
    expect(instructions).toContain('source <(el completion bash)');
    expect(instructions).toContain('bash-completion/completions/el');
  });

  test('returns zsh install instructions', () => {
    const instructions = getInstallInstructions('zsh');

    expect(instructions).toContain('~/.zshrc');
    expect(instructions).toContain('source <(el completion zsh)');
    expect(instructions).toContain('fpath');
  });

  test('returns fish install instructions', () => {
    const instructions = getInstallInstructions('fish');

    expect(instructions).toContain('~/.config/fish/completions/el.fish');
  });

  test('throws for unsupported shell', () => {
    expect(() => getInstallInstructions('powershell' as ShellType)).toThrow(
      'Unsupported shell: powershell'
    );
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe('edge cases', () => {
  test('handles commands with no options', () => {
    const commands: Command[] = [
      {
        name: 'help',
        description: 'Show help',
        usage: 'el help',
        handler: async () => ({ exitCode: 0 }),
      },
    ];

    expect(() => generateBashCompletion(commands)).not.toThrow();
    expect(() => generateZshCompletion(commands)).not.toThrow();
    expect(() => generateFishCompletion(commands)).not.toThrow();
  });

  test('handles empty command list', () => {
    expect(() => generateBashCompletion([])).not.toThrow();
    expect(() => generateZshCompletion([])).not.toThrow();
    expect(() => generateFishCompletion([])).not.toThrow();
  });

  test('escapes special characters in descriptions', () => {
    const commands: Command[] = [
      {
        name: 'test',
        description: "Don't break [the] completion",
        usage: 'el test',
        handler: async () => ({ exitCode: 0 }),
      },
    ];

    const zshScript = generateZshCompletion(commands);
    const fishScript = generateFishCompletion(commands);

    // Should not throw and should handle quotes/brackets
    expect(zshScript).toBeDefined();
    expect(fishScript).toBeDefined();
  });
});

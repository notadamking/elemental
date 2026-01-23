/**
 * CLI Parser Tests
 */

import { describe, it, expect } from 'bun:test';
import {
  parseArgs,
  validateRequiredOptions,
  getGlobalOptionsHelp,
  getCommandOptionsHelp,
} from './parser.js';
import type { CommandOption } from './types.js';

describe('parseArgs', () => {
  describe('basic parsing', () => {
    it('should parse empty args', () => {
      const result = parseArgs([]);
      expect(result.command).toEqual([]);
      expect(result.args).toEqual([]);
      expect(result.options.json).toBe(false);
      expect(result.options.quiet).toBe(false);
    });

    it('should parse single command', () => {
      const result = parseArgs(['init']);
      expect(result.command).toEqual(['init']);
      expect(result.args).toEqual([]);
    });

    it('should parse command with subcommand', () => {
      const result = parseArgs(['config', 'show']);
      expect(result.command).toEqual(['config', 'show']);
      expect(result.args).toEqual([]);
    });

    it('should parse command with arguments', () => {
      const result = parseArgs(['show', 'el-abc123']);
      expect(result.command).toEqual(['show']);
      expect(result.args).toEqual(['el-abc123']);
    });

    it('should parse command with multiple arguments', () => {
      const result = parseArgs(['dep', 'add', 'el-abc', 'el-xyz']);
      expect(result.command).toEqual(['dep', 'add']);
      expect(result.args).toEqual(['el-abc', 'el-xyz']);
    });
  });

  describe('global options', () => {
    it('should parse --json flag', () => {
      const result = parseArgs(['--json', 'list']);
      expect(result.options.json).toBe(true);
    });

    it('should parse --quiet flag', () => {
      const result = parseArgs(['--quiet', 'list']);
      expect(result.options.quiet).toBe(true);
    });

    it('should parse -q short flag', () => {
      const result = parseArgs(['-q', 'list']);
      expect(result.options.quiet).toBe(true);
    });

    it('should parse --verbose flag', () => {
      const result = parseArgs(['--verbose', 'list']);
      expect(result.options.verbose).toBe(true);
    });

    it('should parse -v short flag', () => {
      const result = parseArgs(['-v', 'list']);
      expect(result.options.verbose).toBe(true);
    });

    it('should parse --help flag', () => {
      const result = parseArgs(['--help']);
      expect(result.options.help).toBe(true);
    });

    it('should parse -h short flag', () => {
      const result = parseArgs(['-h']);
      expect(result.options.help).toBe(true);
    });

    it('should parse --version flag', () => {
      const result = parseArgs(['--version']);
      expect(result.options.version).toBe(true);
    });

    it('should parse -V short flag', () => {
      const result = parseArgs(['-V']);
      expect(result.options.version).toBe(true);
    });

    it('should parse --db with value', () => {
      const result = parseArgs(['--db', '/path/to/db.sqlite', 'list']);
      expect(result.options.db).toBe('/path/to/db.sqlite');
    });

    it('should parse --db=value syntax', () => {
      const result = parseArgs(['--db=/path/to/db.sqlite', 'list']);
      expect(result.options.db).toBe('/path/to/db.sqlite');
    });

    it('should parse --actor with value', () => {
      const result = parseArgs(['--actor', 'myagent', 'list']);
      expect(result.options.actor).toBe('myagent');
    });

    it('should parse --actor=value syntax', () => {
      const result = parseArgs(['--actor=myagent', 'list']);
      expect(result.options.actor).toBe('myagent');
    });

    it('should parse multiple global options', () => {
      const result = parseArgs(['--json', '--verbose', '--db', 'test.db', 'list']);
      expect(result.options.json).toBe(true);
      expect(result.options.verbose).toBe(true);
      expect(result.options.db).toBe('test.db');
    });

    it('should parse combined short options', () => {
      const result = parseArgs(['-qv', 'list']);
      expect(result.options.quiet).toBe(true);
      expect(result.options.verbose).toBe(true);
    });
  });

  describe('option position', () => {
    it('should parse options before command', () => {
      const result = parseArgs(['--json', 'list']);
      expect(result.options.json).toBe(true);
      expect(result.command).toEqual(['list']);
    });

    it('should parse options after command', () => {
      const result = parseArgs(['list', '--json']);
      expect(result.options.json).toBe(true);
      expect(result.command).toEqual(['list']);
    });

    it('should parse options mixed with command', () => {
      const result = parseArgs(['--json', 'list', '--verbose']);
      expect(result.options.json).toBe(true);
      expect(result.options.verbose).toBe(true);
      expect(result.command).toEqual(['list']);
    });
  });

  describe('-- separator', () => {
    it('should stop option parsing at --', () => {
      const result = parseArgs(['list', '--', '--json']);
      expect(result.options.json).toBe(false);
      expect(result.args).toContain('--json');
    });

    it('should treat remaining args as positional after --', () => {
      const result = parseArgs(['search', '--', '-v', '--term']);
      expect(result.options.verbose).toBe(false);
      expect(result.args).toEqual(['-v', '--term']);
    });
  });

  describe('command-specific options', () => {
    const cmdOptions: CommandOption[] = [
      { name: 'title', short: 't', description: 'Title', hasValue: true },
      { name: 'priority', short: 'p', description: 'Priority', hasValue: true },
      { name: 'force', short: 'f', description: 'Force', hasValue: false },
    ];

    it('should parse command-specific long options', () => {
      const result = parseArgs(['create', '--title', 'My Task'], cmdOptions);
      expect(result.commandOptions.title).toBe('My Task');
    });

    it('should parse command-specific short options', () => {
      const result = parseArgs(['create', '-t', 'My Task'], cmdOptions);
      expect(result.commandOptions.title).toBe('My Task');
    });

    it('should parse command-specific boolean options', () => {
      const result = parseArgs(['create', '--force'], cmdOptions);
      expect(result.commandOptions.force).toBe(true);
    });

    it('should parse command-specific --option=value', () => {
      const result = parseArgs(['create', '--title=My Task'], cmdOptions);
      expect(result.commandOptions.title).toBe('My Task');
    });

    it('should use default values', () => {
      const optsWithDefault: CommandOption[] = [
        { name: 'priority', description: 'Priority', hasValue: true, defaultValue: 3 },
      ];
      const result = parseArgs(['create'], optsWithDefault);
      expect(result.commandOptions.priority).toBe(3);
    });

    it('should override default with provided value', () => {
      const optsWithDefault: CommandOption[] = [
        { name: 'priority', description: 'Priority', hasValue: true, defaultValue: 3 },
      ];
      const result = parseArgs(['create', '--priority', '1'], optsWithDefault);
      expect(result.commandOptions.priority).toBe('1');
    });
  });

  describe('error handling', () => {
    it('should throw on unknown option', () => {
      expect(() => parseArgs(['--unknown'])).toThrow('Unknown option: --unknown');
    });

    it('should throw when value option missing value', () => {
      expect(() => parseArgs(['--db'])).toThrow('Option --db requires a value');
    });

    it('should throw when value option followed by another flag', () => {
      expect(() => parseArgs(['--db', '--json'])).toThrow('Option --db requires a value');
    });
  });

  describe('element ID recognition', () => {
    it('should treat el- prefixed strings as arguments not commands', () => {
      const result = parseArgs(['show', 'el-abc123']);
      expect(result.command).toEqual(['show']);
      expect(result.args).toEqual(['el-abc123']);
    });

    it('should treat paths as arguments not commands', () => {
      const result = parseArgs(['import', '/path/to/file.jsonl']);
      expect(result.command).toEqual(['import']);
      expect(result.args).toEqual(['/path/to/file.jsonl']);
    });
  });
});

describe('validateRequiredOptions', () => {
  const options: CommandOption[] = [
    { name: 'title', description: 'Title', hasValue: true, required: true },
    { name: 'priority', description: 'Priority', hasValue: true, required: false },
  ];

  it('should pass when required options are present', () => {
    expect(() => validateRequiredOptions({ title: 'Test' }, options)).not.toThrow();
  });

  it('should throw when required option is missing', () => {
    expect(() => validateRequiredOptions({}, options)).toThrow(
      'Required option --title is missing'
    );
  });

  it('should pass when only optional options are missing', () => {
    expect(() => validateRequiredOptions({ title: 'Test' }, options)).not.toThrow();
  });
});

describe('getGlobalOptionsHelp', () => {
  it('should return help text', () => {
    const help = getGlobalOptionsHelp();
    expect(help).toContain('--db');
    expect(help).toContain('--actor');
    expect(help).toContain('--json');
    expect(help).toContain('--quiet');
    expect(help).toContain('--verbose');
    expect(help).toContain('--help');
    expect(help).toContain('--version');
  });

  it('should include short options', () => {
    const help = getGlobalOptionsHelp();
    expect(help).toContain('-q');
    expect(help).toContain('-v');
    expect(help).toContain('-h');
    expect(help).toContain('-V');
  });
});

describe('getCommandOptionsHelp', () => {
  it('should return empty string for no options', () => {
    const help = getCommandOptionsHelp([]);
    expect(help).toBe('');
  });

  it('should format options', () => {
    const options: CommandOption[] = [
      { name: 'title', short: 't', description: 'Task title', hasValue: true, required: true },
      { name: 'force', short: 'f', description: 'Force operation' },
    ];
    const help = getCommandOptionsHelp(options);
    expect(help).toContain('--title');
    expect(help).toContain('-t');
    expect(help).toContain('(required)');
    expect(help).toContain('--force');
    expect(help).toContain('-f');
  });
});

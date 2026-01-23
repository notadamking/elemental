/**
 * Identity Command Tests
 *
 * Tests for the identity CLI commands including whoami and identity mode management.
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { rmSync, mkdirSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { identityCommand, whoamiCommand } from './identity.js';
import { ExitCode, DEFAULT_GLOBAL_OPTIONS } from '../types.js';
import { clearConfigCache } from '../../config/index.js';

describe('identityCommand', () => {
  describe('command definition', () => {
    it('should have correct name', () => {
      expect(identityCommand.name).toBe('identity');
    });

    it('should have description', () => {
      expect(identityCommand.description).toBeTruthy();
    });

    it('should have usage', () => {
      expect(identityCommand.usage).toContain('identity');
    });

    it('should have help text', () => {
      expect(identityCommand.help).toBeTruthy();
    });

    it('should have subcommands', () => {
      expect(identityCommand.subcommands).toBeDefined();
      expect(identityCommand.subcommands?.whoami).toBeDefined();
      expect(identityCommand.subcommands?.mode).toBeDefined();
    });
  });

  describe('default handler', () => {
    let testDir: string;
    let originalCwd: string;
    let originalEnv: NodeJS.ProcessEnv;

    beforeEach(() => {
      testDir = mkdtempSync(join(tmpdir(), 'elemental-test-'));
      originalCwd = process.cwd();
      originalEnv = { ...process.env };
      process.chdir(testDir);
      // Clear any cached config
      clearConfigCache();
      // Remove any env variables that might affect the test
      delete process.env.ELEMENTAL_ACTOR;
      delete process.env.ELEMENTAL_CONFIG;
    });

    afterEach(() => {
      process.chdir(originalCwd);
      process.env = originalEnv;
      clearConfigCache();
      try {
        rmSync(testDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    });

    it('should show no actor message when none configured', async () => {
      const result = await identityCommand.handler([], { ...DEFAULT_GLOBAL_OPTIONS });
      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      expect(result.message).toContain('No actor configured');
    });

    it('should show actor from CLI flag', async () => {
      const result = await identityCommand.handler([], {
        ...DEFAULT_GLOBAL_OPTIONS,
        actor: 'cli-actor',
      });
      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      expect(result.message).toContain('Actor: cli-actor');
      expect(result.message).toContain('CLI');
    });
  });
});

describe('whoamiCommand', () => {
  let testDir: string;
  let originalCwd: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'elemental-test-'));
    originalCwd = process.cwd();
    originalEnv = { ...process.env };
    process.chdir(testDir);
    clearConfigCache();
    delete process.env.ELEMENTAL_ACTOR;
    delete process.env.ELEMENTAL_CONFIG;
  });

  afterEach(() => {
    process.chdir(originalCwd);
    process.env = originalEnv;
    clearConfigCache();
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('command definition', () => {
    it('should have correct name', () => {
      expect(whoamiCommand.name).toBe('whoami');
    });

    it('should have description', () => {
      expect(whoamiCommand.description).toBeTruthy();
      expect(whoamiCommand.description).toContain('identity');
    });

    it('should have usage', () => {
      expect(whoamiCommand.usage).toContain('whoami');
    });

    it('should have help text', () => {
      expect(whoamiCommand.help).toBeTruthy();
      expect(whoamiCommand.help).toContain('actor');
    });
  });

  describe('no actor configured', () => {
    it('should indicate no actor in human mode', async () => {
      const result = await whoamiCommand.handler([], { ...DEFAULT_GLOBAL_OPTIONS });
      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      expect(result.message).toContain('No actor configured');
      expect(result.message).toContain('--actor');
      expect(result.message).toContain('ELEMENTAL_ACTOR');
    });

    it('should return null actor in JSON mode', async () => {
      const result = await whoamiCommand.handler([], {
        ...DEFAULT_GLOBAL_OPTIONS,
        json: true,
      });
      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      const data = result.data as { actor: string | null };
      expect(data.actor).toBeNull();
    });

    it('should return error in quiet mode', async () => {
      const result = await whoamiCommand.handler([], {
        ...DEFAULT_GLOBAL_OPTIONS,
        quiet: true,
      });
      expect(result.exitCode).toBe(ExitCode.NOT_FOUND);
      expect(result.error).toContain('No actor configured');
    });
  });

  describe('actor from CLI flag', () => {
    it('should show actor from --actor flag', async () => {
      const result = await whoamiCommand.handler([], {
        ...DEFAULT_GLOBAL_OPTIONS,
        actor: 'test-agent',
      });
      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      expect(result.message).toContain('Actor: test-agent');
      expect(result.message).toContain('CLI');
    });

    it('should indicate source is CLI flag in JSON', async () => {
      const result = await whoamiCommand.handler([], {
        ...DEFAULT_GLOBAL_OPTIONS,
        actor: 'test-agent',
        json: true,
      });
      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      const data = result.data as { actor: string; source: string };
      expect(data.actor).toBe('test-agent');
      expect(data.source).toBe('cli_flag');
    });

    it('should return just actor name in quiet mode', async () => {
      const result = await whoamiCommand.handler([], {
        ...DEFAULT_GLOBAL_OPTIONS,
        actor: 'test-agent',
        quiet: true,
      });
      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      expect(result.data).toBe('test-agent');
    });
  });

  describe('actor from environment variable', () => {
    it('should show actor from ELEMENTAL_ACTOR', async () => {
      process.env.ELEMENTAL_ACTOR = 'env-actor';
      clearConfigCache();

      const result = await whoamiCommand.handler([], { ...DEFAULT_GLOBAL_OPTIONS });
      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      expect(result.message).toContain('Actor: env-actor');
      expect(result.message).toContain('environment');
    });

    it('should indicate environment source in JSON', async () => {
      process.env.ELEMENTAL_ACTOR = 'env-actor';
      clearConfigCache();

      const result = await whoamiCommand.handler([], {
        ...DEFAULT_GLOBAL_OPTIONS,
        json: true,
      });
      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      const data = result.data as { actor: string; source: string };
      expect(data.actor).toBe('env-actor');
      expect(data.source).toBe('environment');
    });

    it('should prefer CLI flag over environment', async () => {
      process.env.ELEMENTAL_ACTOR = 'env-actor';
      clearConfigCache();

      const result = await whoamiCommand.handler([], {
        ...DEFAULT_GLOBAL_OPTIONS,
        actor: 'cli-actor',
      });
      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      expect(result.message).toContain('Actor: cli-actor');
      expect(result.message).toContain('CLI');
    });
  });

  describe('actor from config file', () => {
    it('should show actor from config file', async () => {
      // Create .elemental directory with config
      const elementalDir = join(testDir, '.elemental');
      mkdirSync(elementalDir, { recursive: true });
      writeFileSync(
        join(elementalDir, 'config.yaml'),
        'actor: config-actor\ndatabase: elemental.db\n'
      );
      clearConfigCache();

      const result = await whoamiCommand.handler([], { ...DEFAULT_GLOBAL_OPTIONS });
      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      expect(result.message).toContain('Actor: config-actor');
      expect(result.message).toContain('configuration file');
    });

    it('should indicate file source in JSON', async () => {
      const elementalDir = join(testDir, '.elemental');
      mkdirSync(elementalDir, { recursive: true });
      writeFileSync(
        join(elementalDir, 'config.yaml'),
        'actor: config-actor\ndatabase: elemental.db\n'
      );
      clearConfigCache();

      const result = await whoamiCommand.handler([], {
        ...DEFAULT_GLOBAL_OPTIONS,
        json: true,
      });
      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      const data = result.data as { actor: string; source: string };
      expect(data.actor).toBe('config-actor');
      expect(data.source).toBe('file');
    });

    it('should prefer environment over config file', async () => {
      const elementalDir = join(testDir, '.elemental');
      mkdirSync(elementalDir, { recursive: true });
      writeFileSync(
        join(elementalDir, 'config.yaml'),
        'actor: config-actor\ndatabase: elemental.db\n'
      );
      process.env.ELEMENTAL_ACTOR = 'env-actor';
      clearConfigCache();

      const result = await whoamiCommand.handler([], { ...DEFAULT_GLOBAL_OPTIONS });
      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      expect(result.message).toContain('Actor: env-actor');
    });
  });

  describe('identity mode', () => {
    it('should show identity mode', async () => {
      const result = await whoamiCommand.handler([], {
        ...DEFAULT_GLOBAL_OPTIONS,
        actor: 'test-actor',
      });
      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      expect(result.message).toContain('Identity Mode: soft');
    });

    it('should include identity mode in JSON', async () => {
      const result = await whoamiCommand.handler([], {
        ...DEFAULT_GLOBAL_OPTIONS,
        actor: 'test-actor',
        json: true,
      });
      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      const data = result.data as { identityMode: string };
      expect(data.identityMode).toBe('soft');
    });
  });

  describe('verification status', () => {
    it('should show verified: no in soft mode', async () => {
      const result = await whoamiCommand.handler([], {
        ...DEFAULT_GLOBAL_OPTIONS,
        actor: 'test-actor',
      });
      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      expect(result.message).toContain('Verified: no');
    });

    it('should include verified: false in JSON', async () => {
      const result = await whoamiCommand.handler([], {
        ...DEFAULT_GLOBAL_OPTIONS,
        actor: 'test-actor',
        json: true,
      });
      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      const data = result.data as { verified: boolean };
      expect(data.verified).toBe(false);
    });
  });
});

describe('identity mode subcommand', () => {
  let testDir: string;
  let originalCwd: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'elemental-test-'));
    originalCwd = process.cwd();
    originalEnv = { ...process.env };
    process.chdir(testDir);
    clearConfigCache();
    delete process.env.ELEMENTAL_ACTOR;
    delete process.env.ELEMENTAL_CONFIG;
    delete process.env.ELEMENTAL_IDENTITY_MODE;
  });

  afterEach(() => {
    process.chdir(originalCwd);
    process.env = originalEnv;
    clearConfigCache();
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should have correct definition', () => {
    const modeCommand = identityCommand.subcommands?.mode;
    expect(modeCommand).toBeDefined();
    expect(modeCommand?.name).toBe('mode');
    expect(modeCommand?.description).toContain('identity mode');
  });

  it('should show current mode with no args', async () => {
    const modeCommand = identityCommand.subcommands!.mode;
    const result = await modeCommand.handler([], { ...DEFAULT_GLOBAL_OPTIONS });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.message).toContain('soft');
  });

  it('should return mode in JSON format', async () => {
    const modeCommand = identityCommand.subcommands!.mode;
    const result = await modeCommand.handler([], {
      ...DEFAULT_GLOBAL_OPTIONS,
      json: true,
    });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const data = result.data as { mode: string };
    expect(data.mode).toBe('soft');
  });

  it('should return just mode in quiet mode', async () => {
    const modeCommand = identityCommand.subcommands!.mode;
    const result = await modeCommand.handler([], {
      ...DEFAULT_GLOBAL_OPTIONS,
      quiet: true,
    });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toBe('soft');
  });

  describe('setting mode', () => {
    beforeEach(() => {
      // Create .elemental directory with config for setting
      const elementalDir = join(testDir, '.elemental');
      mkdirSync(elementalDir, { recursive: true });
      writeFileSync(
        join(elementalDir, 'config.yaml'),
        'database: elemental.db\nidentity:\n  mode: soft\n'
      );
      clearConfigCache();
    });

    it('should reject invalid mode', async () => {
      const modeCommand = identityCommand.subcommands!.mode;
      const result = await modeCommand.handler(['invalid'], { ...DEFAULT_GLOBAL_OPTIONS });
      expect(result.exitCode).toBe(ExitCode.VALIDATION);
      expect(result.error).toContain('Invalid identity mode');
      expect(result.error).toContain('soft');
      expect(result.error).toContain('cryptographic');
      expect(result.error).toContain('hybrid');
    });

    it('should accept soft mode', async () => {
      const modeCommand = identityCommand.subcommands!.mode;
      const result = await modeCommand.handler(['soft'], { ...DEFAULT_GLOBAL_OPTIONS });
      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      expect(result.message).toContain('soft');
    });

    it('should accept cryptographic mode', async () => {
      const modeCommand = identityCommand.subcommands!.mode;
      const result = await modeCommand.handler(['cryptographic'], { ...DEFAULT_GLOBAL_OPTIONS });
      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      expect(result.message).toContain('cryptographic');
    });

    it('should accept hybrid mode', async () => {
      const modeCommand = identityCommand.subcommands!.mode;
      const result = await modeCommand.handler(['hybrid'], { ...DEFAULT_GLOBAL_OPTIONS });
      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      expect(result.message).toContain('hybrid');
    });

    it('should be case insensitive', async () => {
      const modeCommand = identityCommand.subcommands!.mode;
      const result = await modeCommand.handler(['SOFT'], { ...DEFAULT_GLOBAL_OPTIONS });
      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      expect(result.message).toContain('soft');
    });
  });
});

describe('actor priority', () => {
  let testDir: string;
  let originalCwd: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'elemental-test-'));
    originalCwd = process.cwd();
    originalEnv = { ...process.env };
    process.chdir(testDir);
    clearConfigCache();
    delete process.env.ELEMENTAL_ACTOR;
    delete process.env.ELEMENTAL_CONFIG;
  });

  afterEach(() => {
    process.chdir(originalCwd);
    process.env = originalEnv;
    clearConfigCache();
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should use CLI over environment over config', async () => {
    // Setup config file
    const elementalDir = join(testDir, '.elemental');
    mkdirSync(elementalDir, { recursive: true });
    writeFileSync(
      join(elementalDir, 'config.yaml'),
      'actor: config-actor\ndatabase: elemental.db\n'
    );

    // Setup environment
    process.env.ELEMENTAL_ACTOR = 'env-actor';
    clearConfigCache();

    // CLI should win
    const result = await whoamiCommand.handler([], {
      ...DEFAULT_GLOBAL_OPTIONS,
      actor: 'cli-actor',
      json: true,
    });
    const data = result.data as { actor: string; source: string };
    expect(data.actor).toBe('cli-actor');
    expect(data.source).toBe('cli_flag');
  });

  it('should use environment over config when no CLI', async () => {
    // Setup config file
    const elementalDir = join(testDir, '.elemental');
    mkdirSync(elementalDir, { recursive: true });
    writeFileSync(
      join(elementalDir, 'config.yaml'),
      'actor: config-actor\ndatabase: elemental.db\n'
    );

    // Setup environment
    process.env.ELEMENTAL_ACTOR = 'env-actor';
    clearConfigCache();

    const result = await whoamiCommand.handler([], {
      ...DEFAULT_GLOBAL_OPTIONS,
      json: true,
    });
    const data = result.data as { actor: string; source: string };
    expect(data.actor).toBe('env-actor');
    expect(data.source).toBe('environment');
  });

  it('should use config when no CLI or environment', async () => {
    // Setup config file
    const elementalDir = join(testDir, '.elemental');
    mkdirSync(elementalDir, { recursive: true });
    writeFileSync(
      join(elementalDir, 'config.yaml'),
      'actor: config-actor\ndatabase: elemental.db\n'
    );
    clearConfigCache();

    const result = await whoamiCommand.handler([], {
      ...DEFAULT_GLOBAL_OPTIONS,
      json: true,
    });
    const data = result.data as { actor: string; source: string };
    expect(data.actor).toBe('config-actor');
    expect(data.source).toBe('file');
  });
});

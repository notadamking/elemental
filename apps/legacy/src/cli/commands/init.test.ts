/**
 * init Command Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { existsSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { initCommand } from './init.js';
import { ExitCode, DEFAULT_GLOBAL_OPTIONS } from '../types.js';

describe('initCommand', () => {
  let testDir: string;
  let originalCwd: string;

  beforeEach(() => {
    // Create a temporary directory for tests
    testDir = mkdtempSync(join(tmpdir(), 'elemental-test-'));
    originalCwd = process.cwd();
    process.chdir(testDir);
  });

  afterEach(() => {
    // Restore original directory and clean up
    process.chdir(originalCwd);
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('command definition', () => {
    it('should have correct name', () => {
      expect(initCommand.name).toBe('init');
    });

    it('should have description', () => {
      expect(initCommand.description).toBeTruthy();
    });

    it('should have usage', () => {
      expect(initCommand.usage).toContain('init');
    });

    it('should have help text', () => {
      expect(initCommand.help).toBeTruthy();
    });

    it('should have name and actor options', () => {
      expect(initCommand.options).toBeDefined();
      expect(initCommand.options?.some(o => o.name === 'name')).toBe(true);
      expect(initCommand.options?.some(o => o.name === 'actor')).toBe(true);
    });
  });

  describe('initialization', () => {
    it('should create .elemental directory', async () => {
      const result = await initCommand.handler([], { ...DEFAULT_GLOBAL_OPTIONS });
      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      expect(existsSync(join(testDir, '.elemental'))).toBe(true);
    });

    it('should create config.yaml', async () => {
      await initCommand.handler([], { ...DEFAULT_GLOBAL_OPTIONS });
      const configPath = join(testDir, '.elemental', 'config.yaml');
      expect(existsSync(configPath)).toBe(true);

      const content = readFileSync(configPath, 'utf-8');
      expect(content).toContain('Elemental Configuration');
      expect(content).toContain('database: elemental.db');
      expect(content).toContain('sync:');
    });

    it('should create .gitignore', async () => {
      await initCommand.handler([], { ...DEFAULT_GLOBAL_OPTIONS });
      const gitignorePath = join(testDir, '.elemental', '.gitignore');
      expect(existsSync(gitignorePath)).toBe(true);

      const content = readFileSync(gitignorePath, 'utf-8');
      expect(content).toContain('*.db');
      expect(content).toContain('*.db-journal');
    });

    it('should create playbooks directory', async () => {
      await initCommand.handler([], { ...DEFAULT_GLOBAL_OPTIONS });
      expect(existsSync(join(testDir, '.elemental', 'playbooks'))).toBe(true);
    });

    it('should return success message', async () => {
      const result = await initCommand.handler([], { ...DEFAULT_GLOBAL_OPTIONS });
      expect(result.message).toContain('Initialized');
      expect(result.message).toContain('.elemental');
    });

    it('should return path in data', async () => {
      const result = await initCommand.handler([], { ...DEFAULT_GLOBAL_OPTIONS });
      const data = result.data as { path: string };
      // Check that it ends with .elemental (handles symlink paths like /var vs /private/var)
      expect(data.path).toMatch(/\.elemental$/);
    });
  });

  describe('actor option', () => {
    it('should include actor in config when provided', async () => {
      await initCommand.handler([], {
        ...DEFAULT_GLOBAL_OPTIONS,
        actor: 'myagent',
      });

      const configPath = join(testDir, '.elemental', 'config.yaml');
      const content = readFileSync(configPath, 'utf-8');
      expect(content).toContain('actor: myagent');
    });

    it('should leave actor commented when not provided', async () => {
      await initCommand.handler([], { ...DEFAULT_GLOBAL_OPTIONS });

      const configPath = join(testDir, '.elemental', 'config.yaml');
      const content = readFileSync(configPath, 'utf-8');
      expect(content).toContain('# actor: my-agent');
    });
  });

  describe('error handling', () => {
    it('should fail if already initialized', async () => {
      // First init should succeed
      const first = await initCommand.handler([], { ...DEFAULT_GLOBAL_OPTIONS });
      expect(first.exitCode).toBe(ExitCode.SUCCESS);

      // Second init should fail
      const second = await initCommand.handler([], { ...DEFAULT_GLOBAL_OPTIONS });
      expect(second.exitCode).toBe(ExitCode.VALIDATION);
      expect(second.error).toContain('already initialized');
    });
  });

  describe('config file content', () => {
    it('should have correct database setting', async () => {
      await initCommand.handler([], { ...DEFAULT_GLOBAL_OPTIONS });

      const configPath = join(testDir, '.elemental', 'config.yaml');
      const content = readFileSync(configPath, 'utf-8');
      expect(content).toContain('database: elemental.db');
    });

    it('should have sync settings', async () => {
      await initCommand.handler([], { ...DEFAULT_GLOBAL_OPTIONS });

      const configPath = join(testDir, '.elemental', 'config.yaml');
      const content = readFileSync(configPath, 'utf-8');
      expect(content).toContain('sync:');
      expect(content).toContain('auto_export: false');
      expect(content).toContain('elements_file: elements.jsonl');
      expect(content).toContain('dependencies_file: dependencies.jsonl');
    });

    it('should have playbook settings', async () => {
      await initCommand.handler([], { ...DEFAULT_GLOBAL_OPTIONS });

      const configPath = join(testDir, '.elemental', 'config.yaml');
      const content = readFileSync(configPath, 'utf-8');
      expect(content).toContain('playbooks:');
      expect(content).toContain('paths:');
      expect(content).toContain('- playbooks');
    });

    it('should have identity settings', async () => {
      await initCommand.handler([], { ...DEFAULT_GLOBAL_OPTIONS });

      const configPath = join(testDir, '.elemental', 'config.yaml');
      const content = readFileSync(configPath, 'utf-8');
      expect(content).toContain('identity:');
      expect(content).toContain('mode: soft');
    });
  });
});

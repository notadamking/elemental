/**
 * Config Command Tests
 *
 * Tests for the config CLI commands (show, set, unset).
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { configCommand } from './config.js';
import type { GlobalOptions } from '../types.js';
import { ExitCode } from '../types.js';
import { clearConfigCache, loadConfig } from '../../config/index.js';

// ============================================================================
// Test Utilities
// ============================================================================

const TEST_DIR = join(import.meta.dir, '__test_config_workspace__');
const ELEMENTAL_DIR = join(TEST_DIR, '.elemental');
const CONFIG_PATH = join(ELEMENTAL_DIR, 'config.yaml');

function createTestOptions(overrides: Partial<GlobalOptions> = {}): GlobalOptions {
  return {
    json: false,
    quiet: false,
    verbose: false,
    help: false,
    version: false,
    ...overrides,
  };
}

function writeTestConfig(content: string): void {
  writeFileSync(CONFIG_PATH, content);
}

// ============================================================================
// Setup / Teardown
// ============================================================================

beforeEach(() => {
  // Create test workspace
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true });
  }
  mkdirSync(ELEMENTAL_DIR, { recursive: true });

  // Create a minimal config file
  writeTestConfig(`# Test configuration
actor: test-user
database: test.db
sync:
  auto_export: false
`);

  // Clear config cache and reload from test directory
  clearConfigCache();
  // Change to test directory temporarily for config discovery
  const originalCwd = process.cwd();
  process.chdir(TEST_DIR);
  loadConfig({ skipEnv: true });
  process.chdir(originalCwd);
});

afterEach(() => {
  // Cleanup test workspace
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true });
  }
  clearConfigCache();
});

// ============================================================================
// Config Show Tests
// ============================================================================

describe('config show command', () => {
  test('shows all configuration', async () => {
    const options = createTestOptions();
    const result = await configCommand.handler!([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toBeDefined();
    expect(typeof result.data).toBe('object');
  });

  test('shows specific value by path', async () => {
    // Load config from test directory
    const originalCwd = process.cwd();
    process.chdir(TEST_DIR);
    clearConfigCache();
    loadConfig({ skipEnv: true });

    const options = createTestOptions();
    const result = await configCommand.subcommands!.show.handler!(['actor'], options);

    process.chdir(originalCwd);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toEqual({
      path: 'actor',
      value: 'test-user',
      source: expect.any(String),
    });
  });

  test('shows nested value by path', async () => {
    const originalCwd = process.cwd();
    process.chdir(TEST_DIR);
    clearConfigCache();
    loadConfig({ skipEnv: true });

    const options = createTestOptions();
    const result = await configCommand.subcommands!.show.handler!(['sync.autoExport'], options);

    process.chdir(originalCwd);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toEqual({
      path: 'sync.autoExport',
      value: false,
      source: expect.any(String),
    });
  });

  test('returns JSON in JSON mode', async () => {
    const options = createTestOptions({ json: true });
    const result = await configCommand.handler!([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toBeDefined();
  });
});

// ============================================================================
// Config Set Tests
// ============================================================================

describe('config set command', () => {
  test('fails without path and value arguments', async () => {
    const options = createTestOptions();
    const result = await configCommand.subcommands!.set.handler!([], options);

    expect(result.exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
    expect(result.error).toContain('Usage');
  });

  test('fails with only path argument', async () => {
    const options = createTestOptions();
    const result = await configCommand.subcommands!.set.handler!(['actor'], options);

    expect(result.exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
    expect(result.error).toContain('Usage');
  });

  test('sets a string value', async () => {
    const originalCwd = process.cwd();
    process.chdir(TEST_DIR);
    clearConfigCache();
    loadConfig({ skipEnv: true });

    const options = createTestOptions();
    const result = await configCommand.subcommands!.set.handler!(['actor', 'new-agent'], options);

    process.chdir(originalCwd);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toEqual({
      path: 'actor',
      value: 'new-agent',
    });
  });

  test('sets a boolean value', async () => {
    const originalCwd = process.cwd();
    process.chdir(TEST_DIR);
    clearConfigCache();
    loadConfig({ skipEnv: true });

    const options = createTestOptions();
    const result = await configCommand.subcommands!.set.handler!(['sync.autoExport', 'true'], options);

    process.chdir(originalCwd);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toEqual({
      path: 'sync.autoExport',
      value: true,
    });
  });

  test('sets a number value', async () => {
    const originalCwd = process.cwd();
    process.chdir(TEST_DIR);
    clearConfigCache();
    loadConfig({ skipEnv: true });

    const options = createTestOptions();
    const result = await configCommand.subcommands!.set.handler!(['sync.exportDebounce', '1000'], options);

    process.chdir(originalCwd);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toEqual({
      path: 'sync.exportDebounce',
      value: 1000,
    });
  });
});

// ============================================================================
// Config Unset Tests
// ============================================================================

describe('config unset command', () => {
  test('fails without path argument', async () => {
    const options = createTestOptions();
    const result = await configCommand.subcommands!.unset.handler!([], options);

    expect(result.exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
    expect(result.error).toContain('Usage');
  });

  test('unsets a value', async () => {
    const originalCwd = process.cwd();
    process.chdir(TEST_DIR);
    clearConfigCache();
    loadConfig({ skipEnv: true });

    const options = createTestOptions();
    const result = await configCommand.subcommands!.unset.handler!(['actor'], options);

    process.chdir(originalCwd);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toEqual({
      path: 'actor',
    });
  });
});

// ============================================================================
// Subcommand Registration Tests
// ============================================================================

describe('config command structure', () => {
  test('has show subcommand', () => {
    expect(configCommand.subcommands).toBeDefined();
    expect(configCommand.subcommands!.show).toBeDefined();
    expect(configCommand.subcommands!.show.name).toBe('show');
  });

  test('has set subcommand', () => {
    expect(configCommand.subcommands).toBeDefined();
    expect(configCommand.subcommands!.set).toBeDefined();
    expect(configCommand.subcommands!.set.name).toBe('set');
  });

  test('has unset subcommand', () => {
    expect(configCommand.subcommands).toBeDefined();
    expect(configCommand.subcommands!.unset).toBeDefined();
    expect(configCommand.subcommands!.unset.name).toBe('unset');
  });

  test('default handler shows config', async () => {
    // The main config command handler should behave like config show
    const options = createTestOptions();
    const result = await configCommand.handler!([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toBeDefined();
  });
});

// ============================================================================
// Help Text Tests
// ============================================================================

describe('config command help', () => {
  test('has help text for main command', () => {
    expect(configCommand.help).toBeDefined();
    expect(configCommand.help).toContain('Manage');
  });

  test('has help text for show subcommand', () => {
    expect(configCommand.subcommands!.show.help).toBeDefined();
    expect(configCommand.subcommands!.show.help).toContain('Display');
  });

  test('has help text for set subcommand', () => {
    expect(configCommand.subcommands!.set.help).toBeDefined();
    expect(configCommand.subcommands!.set.help).toContain('Set');
  });

  test('has help text for unset subcommand', () => {
    expect(configCommand.subcommands!.unset.help).toBeDefined();
    expect(configCommand.subcommands!.unset.help).toContain('Remove');
  });

  test('has usage text for all commands', () => {
    expect(configCommand.usage).toBeDefined();
    expect(configCommand.subcommands!.show.usage).toBeDefined();
    expect(configCommand.subcommands!.set.usage).toBeDefined();
    expect(configCommand.subcommands!.unset.usage).toBeDefined();
  });
});

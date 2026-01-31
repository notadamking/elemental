/**
 * File Configuration Tests
 *
 * Tests for file discovery, YAML parsing, and worktree root-finding.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

import {
  findElementalDir,
  discoverConfigFile,
  ELEMENTAL_DIR,
  CONFIG_FILE_NAME,
  getGlobalConfigDir,
  getGlobalConfigPath,
} from './file.js';

// ============================================================================
// Test Helpers
// ============================================================================

function createTempDir(): string {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'elemental-test-'));
  return tempDir;
}

function cleanup(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

// ============================================================================
// findElementalDir Tests
// ============================================================================

describe('findElementalDir', () => {
  let tempDir: string;
  const originalEnv = process.env.ELEMENTAL_ROOT;

  beforeEach(() => {
    tempDir = createTempDir();
    delete process.env.ELEMENTAL_ROOT;
  });

  afterEach(() => {
    cleanup(tempDir);
    if (originalEnv === undefined) {
      delete process.env.ELEMENTAL_ROOT;
    } else {
      process.env.ELEMENTAL_ROOT = originalEnv;
    }
  });

  test('finds .elemental in current directory', () => {
    const elementalPath = path.join(tempDir, ELEMENTAL_DIR);
    fs.mkdirSync(elementalPath);

    const result = findElementalDir(tempDir);
    expect(result).toBe(elementalPath);
  });

  test('finds .elemental in parent directory', () => {
    const subDir = path.join(tempDir, 'subdir');
    fs.mkdirSync(subDir);
    const elementalPath = path.join(tempDir, ELEMENTAL_DIR);
    fs.mkdirSync(elementalPath);

    const result = findElementalDir(subDir);
    expect(result).toBe(elementalPath);
  });

  test('finds .elemental in ancestor directory', () => {
    const subDir = path.join(tempDir, 'a', 'b', 'c');
    fs.mkdirSync(subDir, { recursive: true });
    const elementalPath = path.join(tempDir, ELEMENTAL_DIR);
    fs.mkdirSync(elementalPath);

    const result = findElementalDir(subDir);
    expect(result).toBe(elementalPath);
  });

  test('returns undefined when not found', () => {
    const result = findElementalDir(tempDir);
    expect(result).toBeUndefined();
  });

  test('prioritizes ELEMENTAL_ROOT environment variable', () => {
    // Create .elemental in temp dir (walk-up search would find this)
    const localElementalPath = path.join(tempDir, ELEMENTAL_DIR);
    fs.mkdirSync(localElementalPath);

    // Create separate root location
    const rootDir = createTempDir();
    const rootElementalPath = path.join(rootDir, ELEMENTAL_DIR);
    fs.mkdirSync(rootElementalPath);

    try {
      // Set ELEMENTAL_ROOT to point to separate location
      process.env.ELEMENTAL_ROOT = rootDir;

      // Should find the root location, not the local one
      const result = findElementalDir(tempDir);
      expect(result).toBe(rootElementalPath);
    } finally {
      cleanup(rootDir);
    }
  });

  test('falls back to walk-up search when ELEMENTAL_ROOT is set but .elemental does not exist', () => {
    // Create .elemental in temp dir (walk-up search finds this)
    const localElementalPath = path.join(tempDir, ELEMENTAL_DIR);
    fs.mkdirSync(localElementalPath);

    // Create a directory without .elemental
    const rootDir = createTempDir();

    try {
      // Set ELEMENTAL_ROOT to point to directory without .elemental
      process.env.ELEMENTAL_ROOT = rootDir;

      // Should fall back and find the local one
      const result = findElementalDir(tempDir);
      expect(result).toBe(localElementalPath);
    } finally {
      cleanup(rootDir);
    }
  });

  test('ignores ELEMENTAL_ROOT if .elemental path is a file not directory', () => {
    // Create .elemental in temp dir (walk-up search finds this)
    const localElementalPath = path.join(tempDir, ELEMENTAL_DIR);
    fs.mkdirSync(localElementalPath);

    // Create a root with .elemental as a file (not directory)
    const rootDir = createTempDir();
    const rootElementalPath = path.join(rootDir, ELEMENTAL_DIR);
    fs.writeFileSync(rootElementalPath, 'not a directory');

    try {
      // Set ELEMENTAL_ROOT to point to directory with .elemental file
      process.env.ELEMENTAL_ROOT = rootDir;

      // Should fall back and find the local one since root's .elemental is not a directory
      const result = findElementalDir(tempDir);
      expect(result).toBe(localElementalPath);
    } finally {
      cleanup(rootDir);
    }
  });

  test('ELEMENTAL_ROOT works with worktree simulation', () => {
    // Simulate workspace root with .elemental
    const workspaceRoot = createTempDir();
    const workspaceElemental = path.join(workspaceRoot, ELEMENTAL_DIR);
    fs.mkdirSync(workspaceElemental);

    // Simulate worktree inside .elemental directory (no separate .elemental folder in worktree)
    const worktree = path.join(tempDir, '.elemental', '.worktrees', 'worker-alice-task-123');
    fs.mkdirSync(worktree, { recursive: true });

    try {
      // Set ELEMENTAL_ROOT to workspace (as spawner would)
      process.env.ELEMENTAL_ROOT = workspaceRoot;

      // When running from worktree, should find workspace's .elemental
      const result = findElementalDir(worktree);
      expect(result).toBe(workspaceElemental);
    } finally {
      cleanup(workspaceRoot);
    }
  });
});

// ============================================================================
// discoverConfigFile Tests
// ============================================================================

describe('discoverConfigFile', () => {
  let tempDir: string;
  const originalEnv = process.env.ELEMENTAL_ROOT;

  beforeEach(() => {
    tempDir = createTempDir();
    delete process.env.ELEMENTAL_ROOT;
  });

  afterEach(() => {
    cleanup(tempDir);
    if (originalEnv === undefined) {
      delete process.env.ELEMENTAL_ROOT;
    } else {
      process.env.ELEMENTAL_ROOT = originalEnv;
    }
  });

  test('returns override path when provided', () => {
    const overridePath = path.join(tempDir, 'custom', 'config.yaml');
    const result = discoverConfigFile(overridePath, tempDir);

    expect(result.path).toBe(overridePath);
    expect(result.exists).toBe(false);
  });

  test('discovers config in .elemental directory', () => {
    const elementalDir = path.join(tempDir, ELEMENTAL_DIR);
    fs.mkdirSync(elementalDir);
    const configPath = path.join(elementalDir, CONFIG_FILE_NAME);
    fs.writeFileSync(configPath, 'actor: test');

    const result = discoverConfigFile(undefined, tempDir);
    expect(result.path).toBe(configPath);
    expect(result.exists).toBe(true);
    expect(result.elementalDir).toBe(elementalDir);
  });

  test('returns expected path even when config does not exist', () => {
    const elementalDir = path.join(tempDir, ELEMENTAL_DIR);
    fs.mkdirSync(elementalDir);

    const result = discoverConfigFile(undefined, tempDir);
    expect(result.path).toBe(path.join(elementalDir, CONFIG_FILE_NAME));
    expect(result.exists).toBe(false);
    expect(result.elementalDir).toBe(elementalDir);
  });

  test('respects ELEMENTAL_ROOT for config discovery', () => {
    // Create .elemental in local dir
    const localElementalDir = path.join(tempDir, ELEMENTAL_DIR);
    fs.mkdirSync(localElementalDir);
    fs.writeFileSync(path.join(localElementalDir, CONFIG_FILE_NAME), 'actor: local');

    // Create .elemental in root dir
    const rootDir = createTempDir();
    const rootElementalDir = path.join(rootDir, ELEMENTAL_DIR);
    fs.mkdirSync(rootElementalDir);
    const rootConfigPath = path.join(rootElementalDir, CONFIG_FILE_NAME);
    fs.writeFileSync(rootConfigPath, 'actor: root');

    try {
      process.env.ELEMENTAL_ROOT = rootDir;

      const result = discoverConfigFile(undefined, tempDir);
      expect(result.path).toBe(rootConfigPath);
      expect(result.exists).toBe(true);
      expect(result.elementalDir).toBe(rootElementalDir);
    } finally {
      cleanup(rootDir);
    }
  });
});

// ============================================================================
// Global Config Path Tests
// ============================================================================

describe('Global Config Paths', () => {
  test('getGlobalConfigDir returns path in home directory', () => {
    const result = getGlobalConfigDir();
    expect(result).toBe(path.join(os.homedir(), ELEMENTAL_DIR));
  });

  test('getGlobalConfigPath returns config.yaml in global dir', () => {
    const result = getGlobalConfigPath();
    expect(result).toBe(path.join(os.homedir(), ELEMENTAL_DIR, CONFIG_FILE_NAME));
  });
});

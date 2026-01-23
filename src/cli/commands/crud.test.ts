/**
 * CRUD Commands Integration Tests
 *
 * Tests for the create, list, and show CLI commands.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createCommand, listCommand, showCommand } from './crud.js';
import type { GlobalOptions } from '../types.js';
import { ExitCode } from '../types.js';

// ============================================================================
// Test Utilities
// ============================================================================

const TEST_DIR = join(import.meta.dir, '__test_workspace__');
const ELEMENTAL_DIR = join(TEST_DIR, '.elemental');
const DB_PATH = join(ELEMENTAL_DIR, 'elemental.db');

function createTestOptions(overrides: Partial<GlobalOptions> = {}): GlobalOptions {
  return {
    db: DB_PATH,
    actor: 'test-user',
    json: false,
    quiet: false,
    verbose: false,
    help: false,
    version: false,
    ...overrides,
  };
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
});

afterEach(() => {
  // Cleanup test workspace
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true });
  }
});

// ============================================================================
// Create Command Tests
// ============================================================================

describe('create command', () => {
  test('creates a task with title', async () => {
    const options = createTestOptions({ title: 'Test Task' } as GlobalOptions & { title: string });
    const result = await createCommand.handler(['task'], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toBeDefined();
    expect((result.data as { id: string }).id).toMatch(/^el-/);
    expect((result.data as { title: string }).title).toBe('Test Task');
    expect((result.data as { type: string }).type).toBe('task');
    expect((result.data as { status: string }).status).toBe('open');
  });

  test('creates a task with all options', async () => {
    const options = createTestOptions({
      title: 'Full Task',
      priority: '1',
      complexity: '2',
      type: 'bug',
      assignee: 'dev-1',
      tag: ['urgent', 'frontend'],
    } as GlobalOptions & Record<string, unknown>);
    const result = await createCommand.handler(['task'], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const data = result.data as Record<string, unknown>;
    expect(data.title).toBe('Full Task');
    expect(data.priority).toBe(1);
    expect(data.complexity).toBe(2);
    expect(data.taskType).toBe('bug');
    expect(data.assignee).toBe('dev-1');
    expect(data.tags).toEqual(['urgent', 'frontend']);
  });

  test('fails without element type', async () => {
    const options = createTestOptions();
    const result = await createCommand.handler([], options);

    expect(result.exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
    expect(result.error).toContain('Usage');
  });

  test('fails with unsupported element type', async () => {
    const options = createTestOptions({ title: 'Test' } as GlobalOptions & { title: string });
    const result = await createCommand.handler(['entity'], options);

    expect(result.exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
    expect(result.error).toContain('Unsupported element type');
  });

  test('fails without title for task', async () => {
    const options = createTestOptions();
    const result = await createCommand.handler(['task'], options);

    expect(result.exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
    expect(result.error).toContain('--title is required');
  });

  test('fails with invalid priority', async () => {
    const options = createTestOptions({
      title: 'Test',
      priority: '6',
    } as GlobalOptions & { title: string; priority: string });
    const result = await createCommand.handler(['task'], options);

    expect(result.exitCode).toBe(ExitCode.VALIDATION);
    expect(result.error).toContain('Priority must be a number from 1 to 5');
  });

  test('fails with invalid complexity', async () => {
    const options = createTestOptions({
      title: 'Test',
      complexity: '0',
    } as GlobalOptions & { title: string; complexity: string });
    const result = await createCommand.handler(['task'], options);

    expect(result.exitCode).toBe(ExitCode.VALIDATION);
    expect(result.error).toContain('Complexity must be a number from 1 to 5');
  });

  test('fails with invalid task type', async () => {
    const options = createTestOptions({
      title: 'Test',
      type: 'invalid',
    } as GlobalOptions & { title: string; type: string });
    const result = await createCommand.handler(['task'], options);

    expect(result.exitCode).toBe(ExitCode.VALIDATION);
    expect(result.error).toContain('Invalid task type');
  });
});

// ============================================================================
// List Command Tests
// ============================================================================

describe('list command', () => {
  test('lists tasks', async () => {
    // Create some tasks first
    const createOpts = createTestOptions({ title: 'Task 1' } as GlobalOptions & { title: string });
    await createCommand.handler(['task'], createOpts);

    const createOpts2 = createTestOptions({ title: 'Task 2' } as GlobalOptions & { title: string });
    await createCommand.handler(['task'], createOpts2);

    // List tasks
    const options = createTestOptions();
    const result = await listCommand.handler(['task'], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toBeDefined();
    expect(Array.isArray(result.data)).toBe(true);
    expect((result.data as unknown[]).length).toBe(2);
  });

  test('lists tasks with status filter', async () => {
    // Create tasks with different statuses
    const createOpts = createTestOptions({ title: 'Open Task' } as GlobalOptions & { title: string });
    await createCommand.handler(['task'], createOpts);

    // List only open tasks
    const options = createTestOptions({ status: 'open' } as GlobalOptions & { status: string });
    const result = await listCommand.handler(['task'], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const items = result.data as { status: string }[];
    expect(items.length).toBeGreaterThan(0);
    items.forEach((item) => expect(item.status).toBe('open'));
  });

  test('lists tasks with priority filter', async () => {
    // Create tasks with different priorities
    const createOpts1 = createTestOptions({
      title: 'High Priority',
      priority: '1',
    } as GlobalOptions & { title: string; priority: string });
    await createCommand.handler(['task'], createOpts1);

    const createOpts2 = createTestOptions({
      title: 'Low Priority',
      priority: '5',
    } as GlobalOptions & { title: string; priority: string });
    await createCommand.handler(['task'], createOpts2);

    // List only priority 1 tasks
    const options = createTestOptions({ priority: '1' } as GlobalOptions & { priority: string });
    const result = await listCommand.handler(['task'], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const items = result.data as { priority: number }[];
    expect(items.length).toBe(1);
    expect(items[0].priority).toBe(1);
  });

  test('lists tasks with tag filter', async () => {
    // Create task with tag
    const createOpts = createTestOptions({
      title: 'Tagged Task',
      tag: ['important'],
    } as GlobalOptions & { title: string; tag: string[] });
    await createCommand.handler(['task'], createOpts);

    const createOpts2 = createTestOptions({ title: 'Untagged Task' } as GlobalOptions & { title: string });
    await createCommand.handler(['task'], createOpts2);

    // List tasks with tag
    const options = createTestOptions({ tag: ['important'] } as GlobalOptions & { tag: string[] });
    const result = await listCommand.handler(['task'], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const items = result.data as { tags: string[] }[];
    expect(items.length).toBe(1);
    expect(items[0].tags).toContain('important');
  });

  test('returns empty list when no tasks exist', async () => {
    const options = createTestOptions();
    const result = await listCommand.handler(['task'], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
  });

  test('respects limit option', async () => {
    // Create 3 tasks
    for (let i = 1; i <= 3; i++) {
      const createOpts = createTestOptions({ title: `Task ${i}` } as GlobalOptions & { title: string });
      await createCommand.handler(['task'], createOpts);
    }

    // List with limit
    const options = createTestOptions({ limit: '2' } as GlobalOptions & { limit: string });
    const result = await listCommand.handler(['task'], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect((result.data as unknown[]).length).toBe(2);
  });

  test('fails with invalid status', async () => {
    const options = createTestOptions({ status: 'invalid' } as GlobalOptions & { status: string });
    const result = await listCommand.handler(['task'], options);

    expect(result.exitCode).toBe(ExitCode.VALIDATION);
    expect(result.error).toContain('Invalid status');
  });

  test('fails with invalid priority', async () => {
    const options = createTestOptions({ priority: 'abc' } as GlobalOptions & { priority: string });
    const result = await listCommand.handler(['task'], options);

    expect(result.exitCode).toBe(ExitCode.VALIDATION);
    expect(result.error).toContain('Priority must be a number');
  });

  test('fails with invalid limit', async () => {
    const options = createTestOptions({ limit: '-1' } as GlobalOptions & { limit: string });
    const result = await listCommand.handler(['task'], options);

    expect(result.exitCode).toBe(ExitCode.VALIDATION);
    expect(result.error).toContain('Limit must be a positive number');
  });
});

// ============================================================================
// Show Command Tests
// ============================================================================

describe('show command', () => {
  test('shows task details', async () => {
    // Create a task first
    const createOpts = createTestOptions({
      title: 'Test Task',
      priority: '2',
      tag: ['test'],
    } as GlobalOptions & { title: string; priority: string; tag: string[] });
    const createResult = await createCommand.handler(['task'], createOpts);
    const taskId = (createResult.data as { id: string }).id;

    // Show the task
    const options = createTestOptions();
    const result = await showCommand.handler([taskId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toBeDefined();
    const data = result.data as Record<string, unknown>;
    expect(data.id).toBe(taskId);
    expect(data.title).toBe('Test Task');
    expect(data.priority).toBe(2);
    expect(data.tags).toContain('test');
  });

  test('fails without id argument', async () => {
    const options = createTestOptions();
    const result = await showCommand.handler([], options);

    expect(result.exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
    expect(result.error).toContain('Usage');
  });

  test('fails for non-existent element', async () => {
    const options = createTestOptions();
    const result = await showCommand.handler(['el-nonexistent'], options);

    expect(result.exitCode).toBe(ExitCode.NOT_FOUND);
    expect(result.error).toContain('Element not found');
  });

  test('returns JSON in JSON mode', async () => {
    // Create a task first
    const createOpts = createTestOptions({ title: 'JSON Test' } as GlobalOptions & { title: string });
    const createResult = await createCommand.handler(['task'], createOpts);
    const taskId = (createResult.data as { id: string }).id;

    // Show with JSON mode
    const options = createTestOptions({ json: true });
    const result = await showCommand.handler([taskId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toBeDefined();
    expect((result.data as { id: string }).id).toBe(taskId);
  });

  test('returns ID only in quiet mode', async () => {
    // Create a task first
    const createOpts = createTestOptions({ title: 'Quiet Test' } as GlobalOptions & { title: string });
    const createResult = await createCommand.handler(['task'], createOpts);
    const taskId = (createResult.data as { id: string }).id;

    // Show with quiet mode - returns just the ID as data
    const options = createTestOptions({ quiet: true });
    const result = await showCommand.handler([taskId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    // In quiet mode, data is the ID string directly
    expect(result.data).toBe(taskId);
  });
});

// ============================================================================
// Database Path Resolution Tests
// ============================================================================

describe('database path resolution', () => {
  test('fails gracefully when no database exists', async () => {
    // Remove the test directory to simulate no workspace
    rmSync(TEST_DIR, { recursive: true });

    const options: GlobalOptions = {
      json: false,
      quiet: false,
      verbose: false,
      help: false,
      version: false,
    };

    const result = await listCommand.handler([], options);
    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect(result.error).toContain('No database found');
  });

  test('uses explicit db path from options', async () => {
    const customDbPath = join(TEST_DIR, 'custom.db');
    const options = createTestOptions({ db: customDbPath, title: 'Custom DB Task' } as GlobalOptions & { db: string; title: string });

    const result = await createCommand.handler(['task'], options);
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(existsSync(customDbPath)).toBe(true);
  });
});

// ============================================================================
// Output Format Tests
// ============================================================================

describe('output formats', () => {
  test('list command produces human readable output', async () => {
    // Create a task
    const createOpts = createTestOptions({ title: 'Human Readable' } as GlobalOptions & { title: string });
    await createCommand.handler(['task'], createOpts);

    const options = createTestOptions();
    const result = await listCommand.handler(['task'], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.message).toContain('ID');
    expect(result.message).toContain('TYPE');
  });

  test('list command produces JSON output', async () => {
    // Create a task
    const createOpts = createTestOptions({ title: 'JSON Output' } as GlobalOptions & { title: string });
    await createCommand.handler(['task'], createOpts);

    const options = createTestOptions({ json: true });
    const result = await listCommand.handler(['task'], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(Array.isArray(result.data)).toBe(true);
  });

  test('list command produces quiet output', async () => {
    // Create a task
    const createOpts = createTestOptions({ title: 'Quiet Output' } as GlobalOptions & { title: string });
    const createResult = await createCommand.handler(['task'], createOpts);
    const taskId = (createResult.data as { id: string }).id;

    const options = createTestOptions({ quiet: true });
    const result = await listCommand.handler(['task'], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(typeof result.data).toBe('string');
    expect((result.data as string)).toContain(taskId);
  });
});

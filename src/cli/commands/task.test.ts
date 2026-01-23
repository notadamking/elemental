/**
 * Task Commands Integration Tests
 *
 * Tests for the task-specific CLI commands:
 * - ready: List tasks ready for work
 * - blocked: List blocked tasks
 * - close: Close a task
 * - reopen: Reopen a closed task
 * - assign: Assign a task
 * - defer: Defer a task
 * - undefer: Remove deferral
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  readyCommand,
  blockedCommand,
  closeCommand,
  reopenCommand,
  assignCommand,
  deferCommand,
  undeferCommand,
} from './task.js';
import { createCommand, showCommand } from './crud.js';
import type { GlobalOptions } from '../types.js';
import { ExitCode } from '../types.js';
import { createStorage, initializeSchema } from '../../storage/index.js';
import { createElementalAPI } from '../../api/elemental-api.js';
import { DependencyType } from '../../types/dependency.js';
import type { ElementId, EntityId } from '../../types/element.js';

// ============================================================================
// Test Utilities
// ============================================================================

const TEST_DIR = join(import.meta.dir, '__test_task_workspace__');
const ELEMENTAL_DIR = join(TEST_DIR, '.elemental');
const DB_PATH = join(ELEMENTAL_DIR, 'elemental.db');

function createTestOptions<T extends Record<string, unknown> = Record<string, unknown>>(
  overrides: T = {} as T
): GlobalOptions & T {
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

// Helper to create a task and return its ID
async function createTestTask(
  title: string,
  extra: Record<string, unknown> = {}
): Promise<string> {
  const options = createTestOptions({ title, ...extra });
  const result = await createCommand.handler(['task'], options);
  return (result.data as { id: string }).id;
}

// Helper to create API instance for direct manipulation
function createTestAPI() {
  const backend = createStorage({ path: DB_PATH, create: true });
  initializeSchema(backend);
  return { api: createElementalAPI(backend), backend };
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
// Ready Command Tests
// ============================================================================

describe('ready command', () => {
  test('lists open tasks as ready', async () => {
    // Create open tasks
    await createTestTask('Ready Task 1');
    await createTestTask('Ready Task 2');

    const options = createTestOptions();
    const result = await readyCommand.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toBeDefined();
    expect(Array.isArray(result.data)).toBe(true);
    expect((result.data as unknown[]).length).toBe(2);
  });

  test('filters by assignee', async () => {
    await createTestTask('Task for Alice', { assignee: 'alice' });
    await createTestTask('Task for Bob', { assignee: 'bob' });
    await createTestTask('Unassigned Task');

    const options = createTestOptions({ assignee: 'alice' });
    const result = await readyCommand.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const tasks = result.data as { assignee: string }[];
    expect(tasks.length).toBe(1);
    expect(tasks[0].assignee).toBe('alice');
  });

  test('filters by priority', async () => {
    await createTestTask('Critical Task', { priority: '1' });
    await createTestTask('Low Priority Task', { priority: '5' });

    const options = createTestOptions({ priority: '1' });
    const result = await readyCommand.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const tasks = result.data as { priority: number }[];
    expect(tasks.length).toBe(1);
    expect(tasks[0].priority).toBe(1);
  });

  test('filters by task type', async () => {
    await createTestTask('Bug Fix', { type: 'bug' });
    await createTestTask('New Feature', { type: 'feature' });

    const options = createTestOptions({ type: 'bug' });
    const result = await readyCommand.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const tasks = result.data as { taskType: string }[];
    expect(tasks.length).toBe(1);
    expect(tasks[0].taskType).toBe('bug');
  });

  test('respects limit option', async () => {
    await createTestTask('Task 1');
    await createTestTask('Task 2');
    await createTestTask('Task 3');

    const options = createTestOptions({ limit: '2' });
    const result = await readyCommand.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect((result.data as unknown[]).length).toBe(2);
  });

  test('excludes blocked tasks', async () => {
    const taskId = await createTestTask('Blocked Task');
    const blockerTaskId = await createTestTask('Blocker Task');

    // Add a blocking dependency
    const { api } = createTestAPI();
    await api.addDependency({
      sourceId: taskId as ElementId,
      targetId: blockerTaskId as ElementId,
      type: DependencyType.BLOCKS,
    });

    const options = createTestOptions();
    const result = await readyCommand.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const tasks = result.data as { id: string }[];
    // The blocked task should not appear
    expect(tasks.some((t) => t.id === taskId)).toBe(false);
    // The blocker task should appear (it's not blocked)
    expect(tasks.some((t) => t.id === blockerTaskId)).toBe(true);
  });

  test('returns empty list when no ready tasks', async () => {
    const options = createTestOptions();
    const result = await readyCommand.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.message).toContain('No ready tasks');
  });

  test('returns JSON in JSON mode', async () => {
    await createTestTask('JSON Test Task');

    const options = createTestOptions({ json: true });
    const result = await readyCommand.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(Array.isArray(result.data)).toBe(true);
  });

  test('returns IDs only in quiet mode', async () => {
    const taskId = await createTestTask('Quiet Test Task');

    const options = createTestOptions({ quiet: true });
    const result = await readyCommand.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(typeof result.data).toBe('string');
    expect(result.data).toContain(taskId);
  });

  test('fails with invalid priority', async () => {
    const options = createTestOptions({ priority: 'invalid' });
    const result = await readyCommand.handler([], options);

    expect(result.exitCode).toBe(ExitCode.VALIDATION);
    expect(result.error).toContain('Priority must be a number');
  });

  test('fails with invalid limit', async () => {
    const options = createTestOptions({ limit: '-5' });
    const result = await readyCommand.handler([], options);

    expect(result.exitCode).toBe(ExitCode.VALIDATION);
    expect(result.error).toContain('Limit must be a positive number');
  });
});

// ============================================================================
// Blocked Command Tests
// ============================================================================

describe('blocked command', () => {
  test('lists blocked tasks with details', async () => {
    const taskId = await createTestTask('Blocked Task');
    const blockerTaskId = await createTestTask('Blocker Task');

    // Add a blocking dependency
    const { api } = createTestAPI();
    await api.addDependency({
      sourceId: taskId as ElementId,
      targetId: blockerTaskId as ElementId,
      type: DependencyType.BLOCKS,
    });

    const options = createTestOptions();
    const result = await blockedCommand.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const tasks = result.data as { id: string; blockedBy: string }[];
    expect(tasks.length).toBe(1);
    expect(tasks[0].id).toBe(taskId);
    expect(tasks[0].blockedBy).toBe(blockerTaskId);
  });

  test('returns empty list when no blocked tasks', async () => {
    await createTestTask('Unblocked Task');

    const options = createTestOptions();
    const result = await blockedCommand.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.message).toContain('No blocked tasks');
  });

  test('filters by assignee', async () => {
    const aliceTask = await createTestTask('Alice Task', { assignee: 'alice' });
    const bobTask = await createTestTask('Bob Task', { assignee: 'bob' });
    const blockerTaskId = await createTestTask('Blocker');

    // Block both tasks
    const { api } = createTestAPI();
    await api.addDependency({
      sourceId: aliceTask as ElementId,
      targetId: blockerTaskId as ElementId,
      type: DependencyType.BLOCKS,
    });
    await api.addDependency({
      sourceId: bobTask as ElementId,
      targetId: blockerTaskId as ElementId,
      type: DependencyType.BLOCKS,
    });

    const options = createTestOptions({ assignee: 'alice' });
    const result = await blockedCommand.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const tasks = result.data as { assignee: string }[];
    expect(tasks.length).toBe(1);
    expect(tasks[0].assignee).toBe('alice');
  });

  test('returns JSON in JSON mode', async () => {
    const taskId = await createTestTask('JSON Blocked Task');
    const blockerTaskId = await createTestTask('Blocker');

    const { api } = createTestAPI();
    await api.addDependency({
      sourceId: taskId as ElementId,
      targetId: blockerTaskId as ElementId,
      type: DependencyType.BLOCKS,
    });

    const options = createTestOptions({ json: true });
    const result = await blockedCommand.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(Array.isArray(result.data)).toBe(true);
  });

  test('returns IDs only in quiet mode', async () => {
    const taskId = await createTestTask('Quiet Blocked Task');
    const blockerTaskId = await createTestTask('Blocker');

    const { api } = createTestAPI();
    await api.addDependency({
      sourceId: taskId as ElementId,
      targetId: blockerTaskId as ElementId,
      type: DependencyType.BLOCKS,
    });

    const options = createTestOptions({ quiet: true });
    const result = await blockedCommand.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(typeof result.data).toBe('string');
    expect(result.data).toContain(taskId);
  });
});

// ============================================================================
// Close Command Tests
// ============================================================================

describe('close command', () => {
  test('closes an open task', async () => {
    const taskId = await createTestTask('Task to Close');

    const options = createTestOptions();
    const result = await closeCommand.handler([taskId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.message).toContain('Closed task');

    // Verify task is closed
    const showResult = await showCommand.handler([taskId], createTestOptions({ json: true }));
    expect((showResult.data as { status: string }).status).toBe('closed');
  });

  test('closes task with reason', async () => {
    const taskId = await createTestTask('Task with Reason');

    const options = createTestOptions({ reason: 'Fixed in PR #42' });
    const result = await closeCommand.handler([taskId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);

    // Verify close reason
    const showResult = await showCommand.handler([taskId], createTestOptions({ json: true }));
    expect((showResult.data as { closeReason: string }).closeReason).toBe('Fixed in PR #42');
  });

  test('closes in_progress task', async () => {
    const taskId = await createTestTask('In Progress Task');

    // Change to in_progress first
    const { api } = createTestAPI();
    await api.update(taskId as ElementId, { status: 'in_progress' });

    const options = createTestOptions();
    const result = await closeCommand.handler([taskId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);

    const showResult = await showCommand.handler([taskId], createTestOptions({ json: true }));
    expect((showResult.data as { status: string }).status).toBe('closed');
  });

  test('fails without task id', async () => {
    const options = createTestOptions();
    const result = await closeCommand.handler([], options);

    expect(result.exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
    expect(result.error).toContain('Usage');
  });

  test('fails for non-existent task', async () => {
    const options = createTestOptions();
    const result = await closeCommand.handler(['el-nonexistent'], options);

    expect(result.exitCode).toBe(ExitCode.NOT_FOUND);
    expect(result.error).toContain('Task not found');
  });

  test('fails for already closed task', async () => {
    const taskId = await createTestTask('Already Closed');

    // Close it first
    await closeCommand.handler([taskId], createTestOptions());

    // Try to close again
    const options = createTestOptions();
    const result = await closeCommand.handler([taskId], options);

    expect(result.exitCode).toBe(ExitCode.VALIDATION);
    expect(result.error).toContain('already closed');
  });

  test('fails for tombstone task', async () => {
    const taskId = await createTestTask('Deleted Task');

    // Delete it
    const { api } = createTestAPI();
    await api.delete(taskId as ElementId);

    const options = createTestOptions();
    const result = await closeCommand.handler([taskId], options);

    // Should fail because tombstone cannot transition to closed
    expect(result.exitCode).toBe(ExitCode.VALIDATION);
    expect(result.error).toContain('Cannot close');
  });

  test('returns JSON in JSON mode', async () => {
    const taskId = await createTestTask('JSON Close Task');

    const options = createTestOptions({ json: true });
    const result = await closeCommand.handler([taskId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect((result.data as { status: string }).status).toBe('closed');
  });

  test('returns ID only in quiet mode', async () => {
    const taskId = await createTestTask('Quiet Close Task');

    const options = createTestOptions({ quiet: true });
    const result = await closeCommand.handler([taskId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toBe(taskId);
  });
});

// ============================================================================
// Reopen Command Tests
// ============================================================================

describe('reopen command', () => {
  test('reopens a closed task', async () => {
    const taskId = await createTestTask('Task to Reopen');

    // Close it first
    await closeCommand.handler([taskId], createTestOptions());

    // Reopen it
    const options = createTestOptions();
    const result = await reopenCommand.handler([taskId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.message).toContain('Reopened task');

    // Verify task is open
    const showResult = await showCommand.handler([taskId], createTestOptions({ json: true }));
    expect((showResult.data as { status: string }).status).toBe('open');
  });

  test('fails without task id', async () => {
    const options = createTestOptions();
    const result = await reopenCommand.handler([], options);

    expect(result.exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
    expect(result.error).toContain('Usage');
  });

  test('fails for non-existent task', async () => {
    const options = createTestOptions();
    const result = await reopenCommand.handler(['el-nonexistent'], options);

    expect(result.exitCode).toBe(ExitCode.NOT_FOUND);
    expect(result.error).toContain('Task not found');
  });

  test('fails for task that is not closed', async () => {
    const taskId = await createTestTask('Not Closed Task');

    const options = createTestOptions();
    const result = await reopenCommand.handler([taskId], options);

    expect(result.exitCode).toBe(ExitCode.VALIDATION);
    expect(result.error).toContain('not closed');
  });

  test('returns JSON in JSON mode', async () => {
    const taskId = await createTestTask('JSON Reopen Task');
    await closeCommand.handler([taskId], createTestOptions());

    const options = createTestOptions({ json: true });
    const result = await reopenCommand.handler([taskId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect((result.data as { status: string }).status).toBe('open');
  });

  test('returns ID only in quiet mode', async () => {
    const taskId = await createTestTask('Quiet Reopen Task');
    await closeCommand.handler([taskId], createTestOptions());

    const options = createTestOptions({ quiet: true });
    const result = await reopenCommand.handler([taskId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toBe(taskId);
  });
});

// ============================================================================
// Assign Command Tests
// ============================================================================

describe('assign command', () => {
  test('assigns task to an entity', async () => {
    const taskId = await createTestTask('Task to Assign');

    const options = createTestOptions();
    const result = await assignCommand.handler([taskId, 'alice'], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.message).toContain('Assigned task');
    expect(result.message).toContain('alice');

    // Verify assignment
    const showResult = await showCommand.handler([taskId], createTestOptions({ json: true }));
    expect((showResult.data as { assignee: string }).assignee).toBe('alice');
  });

  test('reassigns task to different entity', async () => {
    const taskId = await createTestTask('Task to Reassign', { assignee: 'bob' });

    const options = createTestOptions();
    const result = await assignCommand.handler([taskId, 'alice'], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);

    const showResult = await showCommand.handler([taskId], createTestOptions({ json: true }));
    expect((showResult.data as { assignee: string }).assignee).toBe('alice');
  });

  test('unassigns task with --unassign flag', async () => {
    const taskId = await createTestTask('Task to Unassign', { assignee: 'bob' });

    const options = createTestOptions({ unassign: true });
    const result = await assignCommand.handler([taskId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.message).toContain('Unassigned');

    // Verify unassignment
    const showResult = await showCommand.handler([taskId], createTestOptions({ json: true }));
    expect((showResult.data as { assignee?: string }).assignee).toBeUndefined();
  });

  test('fails without task id', async () => {
    const options = createTestOptions();
    const result = await assignCommand.handler([], options);

    expect(result.exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
    expect(result.error).toContain('Usage');
  });

  test('fails without assignee and no --unassign', async () => {
    const taskId = await createTestTask('Task without Assignee');

    const options = createTestOptions();
    const result = await assignCommand.handler([taskId], options);

    expect(result.exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
    expect(result.error).toContain('Specify an assignee');
  });

  test('fails for non-existent task', async () => {
    const options = createTestOptions();
    const result = await assignCommand.handler(['el-nonexistent', 'alice'], options);

    expect(result.exitCode).toBe(ExitCode.NOT_FOUND);
    expect(result.error).toContain('Task not found');
  });

  test('returns JSON in JSON mode', async () => {
    const taskId = await createTestTask('JSON Assign Task');

    const options = createTestOptions({ json: true });
    const result = await assignCommand.handler([taskId, 'alice'], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect((result.data as { assignee: string }).assignee).toBe('alice');
  });

  test('returns ID only in quiet mode', async () => {
    const taskId = await createTestTask('Quiet Assign Task');

    const options = createTestOptions({ quiet: true });
    const result = await assignCommand.handler([taskId, 'alice'], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toBe(taskId);
  });
});

// ============================================================================
// Defer Command Tests
// ============================================================================

describe('defer command', () => {
  test('defers an open task', async () => {
    const taskId = await createTestTask('Task to Defer');

    const options = createTestOptions();
    const result = await deferCommand.handler([taskId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.message).toContain('Deferred task');

    // Verify task is deferred
    const showResult = await showCommand.handler([taskId], createTestOptions({ json: true }));
    expect((showResult.data as { status: string }).status).toBe('deferred');
  });

  test('defers task with until date', async () => {
    const taskId = await createTestTask('Task with Until');
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 7);

    const options = createTestOptions({ until: futureDate.toISOString() });
    const result = await deferCommand.handler([taskId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.message).toContain('until');

    // Verify scheduledFor is set
    const showResult = await showCommand.handler([taskId], createTestOptions({ json: true }));
    expect((showResult.data as { scheduledFor: string }).scheduledFor).toBeDefined();
  });

  test('defers in_progress task', async () => {
    const taskId = await createTestTask('In Progress to Defer');

    // Change to in_progress first
    const { api } = createTestAPI();
    await api.update(taskId as ElementId, { status: 'in_progress' });

    const options = createTestOptions();
    const result = await deferCommand.handler([taskId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);

    const showResult = await showCommand.handler([taskId], createTestOptions({ json: true }));
    expect((showResult.data as { status: string }).status).toBe('deferred');
  });

  test('fails without task id', async () => {
    const options = createTestOptions();
    const result = await deferCommand.handler([], options);

    expect(result.exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
    expect(result.error).toContain('Usage');
  });

  test('fails for non-existent task', async () => {
    const options = createTestOptions();
    const result = await deferCommand.handler(['el-nonexistent'], options);

    expect(result.exitCode).toBe(ExitCode.NOT_FOUND);
    expect(result.error).toContain('Task not found');
  });

  test('fails for closed task', async () => {
    const taskId = await createTestTask('Closed Task to Defer');
    await closeCommand.handler([taskId], createTestOptions());

    const options = createTestOptions();
    const result = await deferCommand.handler([taskId], options);

    expect(result.exitCode).toBe(ExitCode.VALIDATION);
    expect(result.error).toContain('Cannot defer');
  });

  test('fails with invalid date format', async () => {
    const taskId = await createTestTask('Task with Invalid Date');

    const options = createTestOptions({ until: 'not-a-date' });
    const result = await deferCommand.handler([taskId], options);

    expect(result.exitCode).toBe(ExitCode.VALIDATION);
    expect(result.error).toContain('Invalid date format');
  });

  test('returns JSON in JSON mode', async () => {
    const taskId = await createTestTask('JSON Defer Task');

    const options = createTestOptions({ json: true });
    const result = await deferCommand.handler([taskId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect((result.data as { status: string }).status).toBe('deferred');
  });

  test('returns ID only in quiet mode', async () => {
    const taskId = await createTestTask('Quiet Defer Task');

    const options = createTestOptions({ quiet: true });
    const result = await deferCommand.handler([taskId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toBe(taskId);
  });
});

// ============================================================================
// Undefer Command Tests
// ============================================================================

describe('undefer command', () => {
  test('undefers a deferred task', async () => {
    const taskId = await createTestTask('Task to Undefer');
    await deferCommand.handler([taskId], createTestOptions());

    const options = createTestOptions();
    const result = await undeferCommand.handler([taskId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.message).toContain('Undeferred task');

    // Verify task is open again
    const showResult = await showCommand.handler([taskId], createTestOptions({ json: true }));
    expect((showResult.data as { status: string }).status).toBe('open');
  });

  test('clears scheduledFor when undefering', async () => {
    const taskId = await createTestTask('Task with ScheduledFor');
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 7);
    await deferCommand.handler([taskId], createTestOptions({ until: futureDate.toISOString() }));

    const options = createTestOptions();
    const result = await undeferCommand.handler([taskId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);

    // Verify scheduledFor is cleared
    const showResult = await showCommand.handler([taskId], createTestOptions({ json: true }));
    expect((showResult.data as { scheduledFor?: string }).scheduledFor).toBeUndefined();
  });

  test('fails without task id', async () => {
    const options = createTestOptions();
    const result = await undeferCommand.handler([], options);

    expect(result.exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
    expect(result.error).toContain('Usage');
  });

  test('fails for non-existent task', async () => {
    const options = createTestOptions();
    const result = await undeferCommand.handler(['el-nonexistent'], options);

    expect(result.exitCode).toBe(ExitCode.NOT_FOUND);
    expect(result.error).toContain('Task not found');
  });

  test('fails for task that is not deferred', async () => {
    const taskId = await createTestTask('Not Deferred Task');

    const options = createTestOptions();
    const result = await undeferCommand.handler([taskId], options);

    expect(result.exitCode).toBe(ExitCode.VALIDATION);
    expect(result.error).toContain('not deferred');
  });

  test('returns JSON in JSON mode', async () => {
    const taskId = await createTestTask('JSON Undefer Task');
    await deferCommand.handler([taskId], createTestOptions());

    const options = createTestOptions({ json: true });
    const result = await undeferCommand.handler([taskId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect((result.data as { status: string }).status).toBe('open');
  });

  test('returns ID only in quiet mode', async () => {
    const taskId = await createTestTask('Quiet Undefer Task');
    await deferCommand.handler([taskId], createTestOptions());

    const options = createTestOptions({ quiet: true });
    const result = await undeferCommand.handler([taskId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toBe(taskId);
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe('task command integration', () => {
  test('full task lifecycle: create -> assign -> close -> reopen', async () => {
    // Create task
    const taskId = await createTestTask('Lifecycle Task');

    // Assign
    await assignCommand.handler([taskId, 'developer'], createTestOptions());

    // Close
    await closeCommand.handler([taskId], createTestOptions({ reason: 'Done' }));

    // Verify closed
    let showResult = await showCommand.handler([taskId], createTestOptions({ json: true }));
    expect((showResult.data as { status: string }).status).toBe('closed');

    // Reopen
    await reopenCommand.handler([taskId], createTestOptions());

    // Verify reopened
    showResult = await showCommand.handler([taskId], createTestOptions({ json: true }));
    expect((showResult.data as { status: string }).status).toBe('open');
  });

  test('defer workflow: create -> defer with date -> undefer', async () => {
    const taskId = await createTestTask('Defer Lifecycle Task');
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 30);

    // Defer with date
    await deferCommand.handler([taskId], createTestOptions({ until: futureDate.toISOString() }));

    // Verify deferred
    let showResult = await showCommand.handler([taskId], createTestOptions({ json: true }));
    expect((showResult.data as { status: string }).status).toBe('deferred');
    expect((showResult.data as { scheduledFor: string }).scheduledFor).toBeDefined();

    // Undefer
    await undeferCommand.handler([taskId], createTestOptions());

    // Verify open and scheduledFor cleared
    showResult = await showCommand.handler([taskId], createTestOptions({ json: true }));
    expect((showResult.data as { status: string }).status).toBe('open');
    expect((showResult.data as { scheduledFor?: string }).scheduledFor).toBeUndefined();
  });

  test('blocked task workflow: create tasks -> add dependency -> verify blocked', async () => {
    const blockedTaskId = await createTestTask('Blocked Task');
    const blockerTaskId = await createTestTask('Blocker Task');

    // Add dependency
    const { api } = createTestAPI();
    await api.addDependency({
      sourceId: blockedTaskId as ElementId,
      targetId: blockerTaskId as ElementId,
      type: DependencyType.BLOCKS,
    });

    // Verify blocked shows blocked task
    const blockedResult = await blockedCommand.handler([], createTestOptions());
    expect((blockedResult.data as { id: string }[]).some((t) => t.id === blockedTaskId)).toBe(true);

    // Verify ready shows only non-blocked task
    const readyResult = await readyCommand.handler([], createTestOptions());
    const readyTasks = readyResult.data as { id: string }[];
    expect(readyTasks.some((t) => t.id === blockedTaskId)).toBe(false);
    expect(readyTasks.some((t) => t.id === blockerTaskId)).toBe(true);
  });
});

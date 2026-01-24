/**
 * Plan Commands Integration Tests
 *
 * Tests for the plan-specific CLI commands:
 * - plan create: Create a new plan
 * - plan list: List plans with filtering
 * - plan show: Show plan details with progress
 * - plan activate: Activate a draft plan
 * - plan complete: Complete an active plan
 * - plan cancel: Cancel a plan
 * - plan add-task: Add a task to a plan
 * - plan remove-task: Remove a task from a plan
 * - plan tasks: List tasks in a plan
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { planCommand } from './plan.js';
import { createCommand } from './crud.js';
import type { GlobalOptions } from '../types.js';
import { ExitCode } from '../types.js';
import type { Plan } from '../../types/plan.js';
import { PlanStatus } from '../../types/plan.js';
import type { Task } from '../../types/task.js';

// ============================================================================
// Test Utilities
// ============================================================================

const TEST_DIR = join(import.meta.dir, '__test_plan_workspace__');
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

// Helper to create a plan and return its ID
async function createTestPlan(
  title: string,
  extra: Record<string, unknown> = {}
): Promise<string> {
  const options = createTestOptions({ title, ...extra });
  const createSubCmd = planCommand.subcommands!['create'];
  const result = await createSubCmd.handler([], options);
  return (result.data as { id: string }).id;
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
// Plan Create Command Tests
// ============================================================================

describe('plan create command', () => {
  const createSubCmd = planCommand.subcommands!['create'];

  test('creates a plan with required title', async () => {
    const options = createTestOptions({ title: 'Test Plan' });
    const result = await createSubCmd.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toBeDefined();

    const plan = result.data as Plan;
    expect(plan.id).toMatch(/^el-/);
    expect(plan.title).toBe('Test Plan');
    expect(plan.status).toBe(PlanStatus.DRAFT);
    expect(plan.type).toBe('plan');
  });

  test('creates plan with active status', async () => {
    const options = createTestOptions({ title: 'Active Plan', status: 'active' });
    const result = await createSubCmd.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const plan = result.data as Plan;
    expect(plan.status).toBe(PlanStatus.ACTIVE);
  });

  test('creates plan with tags', async () => {
    const options = createTestOptions({ title: 'Tagged Plan', tag: ['sprint', 'q1'] });
    const result = await createSubCmd.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const plan = result.data as Plan;
    expect(plan.tags).toContain('sprint');
    expect(plan.tags).toContain('q1');
  });

  test('fails without title', async () => {
    const options = createTestOptions();
    const result = await createSubCmd.handler([], options);

    expect(result.exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
    expect(result.error).toContain('--title is required');
  });

  test('fails with invalid initial status', async () => {
    const options = createTestOptions({ title: 'Bad Status', status: 'completed' });
    const result = await createSubCmd.handler([], options);

    expect(result.exitCode).toBe(ExitCode.VALIDATION);
    expect(result.error).toContain('Invalid initial status');
  });
});

// ============================================================================
// Plan List Command Tests
// ============================================================================

describe('plan list command', () => {
  const listSubCmd = planCommand.subcommands!['list'];

  test('lists all plans', async () => {
    await createTestPlan('Plan 1');
    await createTestPlan('Plan 2');

    const options = createTestOptions();
    const result = await listSubCmd.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toBeDefined();
    expect(Array.isArray(result.data)).toBe(true);
    expect((result.data as Plan[]).length).toBe(2);
  });

  test('filters by status', async () => {
    await createTestPlan('Draft Plan');
    await createTestPlan('Active Plan', { status: 'active' });

    const options = createTestOptions({ status: 'draft' });
    const result = await listSubCmd.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const plans = result.data as Plan[];
    expect(plans.length).toBe(1);
    expect(plans[0].status).toBe(PlanStatus.DRAFT);
  });

  test('filters by tags', async () => {
    await createTestPlan('Tagged Plan', { tag: ['priority'] });
    await createTestPlan('Other Plan');

    const options = createTestOptions({ tag: 'priority' });
    const result = await listSubCmd.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const plans = result.data as Plan[];
    expect(plans.length).toBe(1);
    expect(plans[0].tags).toContain('priority');
  });

  test('respects limit option', async () => {
    await createTestPlan('Plan 1');
    await createTestPlan('Plan 2');
    await createTestPlan('Plan 3');

    const options = createTestOptions({ limit: '2' });
    const result = await listSubCmd.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect((result.data as Plan[]).length).toBe(2);
  });

  test('returns empty message when no plans match filter', async () => {
    // Create a plan so database exists, then filter to find none
    await createTestPlan('Test Plan', { tag: ['test'] });

    // Filter by a tag that doesn't exist
    const options = createTestOptions({ tag: 'nonexistent' });
    const result = await listSubCmd.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.message).toContain('No plans found');
  });

  test('returns JSON in JSON mode', async () => {
    await createTestPlan('JSON Test');

    const options = createTestOptions({ json: true });
    const result = await listSubCmd.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const plans = result.data as Plan[];
    expect(Array.isArray(plans)).toBe(true);
    expect(plans.length).toBe(1);
  });

  test('fails with invalid status', async () => {
    // Create a plan first so the database exists
    await createTestPlan('Test Plan');

    const options = createTestOptions({ status: 'invalid' });
    const result = await listSubCmd.handler([], options);

    expect(result.exitCode).toBe(ExitCode.VALIDATION);
    expect(result.error).toContain('Invalid status');
  });
});

// ============================================================================
// Plan Show Command Tests
// ============================================================================

describe('plan show command', () => {
  const showSubCmd = planCommand.subcommands!['show'];

  test('shows plan details with progress', async () => {
    const planId = await createTestPlan('Detailed Plan');

    const options = createTestOptions();
    const result = await showSubCmd.handler([planId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toBeDefined();

    // Should have plan and progress
    const data = result.data as { plan: Plan; progress: { totalTasks: number } };
    expect(data.plan.id).toBe(planId);
    expect(data.progress).toBeDefined();
    expect(data.progress.totalTasks).toBe(0);
  });

  test('includes tasks when requested', async () => {
    const planId = await createTestPlan('Plan with Tasks');

    // Add tasks to plan
    const addTaskSubCmd = planCommand.subcommands!['add-task'];
    const task1Id = await createTestTask('Task 1');
    const task2Id = await createTestTask('Task 2');

    await addTaskSubCmd.handler([planId, task1Id], createTestOptions());
    await addTaskSubCmd.handler([planId, task2Id], createTestOptions());

    const options = createTestOptions({ tasks: true, json: true });
    const result = await showSubCmd.handler([planId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const data = result.data as { plan: Plan; tasks: Task[] };
    expect(data.tasks).toBeDefined();
    expect(data.tasks.length).toBe(2);
  });

  test('fails without id', async () => {
    const options = createTestOptions();
    const result = await showSubCmd.handler([], options);

    expect(result.exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
    expect(result.error).toContain('Usage');
  });

  test('fails for non-existent plan', async () => {
    // Create a plan first so the database exists
    await createTestPlan('Existing Plan');

    const options = createTestOptions();
    const result = await showSubCmd.handler(['el-nonexistent'], options);

    expect(result.exitCode).toBe(ExitCode.NOT_FOUND);
    expect(result.error).toContain('not found');
  });

  test('fails when element is not a plan', async () => {
    const taskId = await createTestTask('Not a plan');

    const options = createTestOptions();
    const result = await showSubCmd.handler([taskId], options);

    expect(result.exitCode).toBe(ExitCode.VALIDATION);
    expect(result.error).toContain('is not a plan');
  });
});

// ============================================================================
// Plan Activate Command Tests
// ============================================================================

describe('plan activate command', () => {
  const activateSubCmd = planCommand.subcommands!['activate'];
  const showSubCmd = planCommand.subcommands!['show'];

  test('activates a draft plan', async () => {
    const planId = await createTestPlan('Draft Plan');

    const options = createTestOptions();
    const result = await activateSubCmd.handler([planId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.message).toContain('Activated');

    // Verify status change
    const showResult = await showSubCmd.handler([planId], createTestOptions({ json: true }));
    const data = showResult.data as { plan: Plan };
    expect(data.plan.status).toBe(PlanStatus.ACTIVE);
  });

  test('returns success message for already active plan', async () => {
    const planId = await createTestPlan('Active Plan', { status: 'active' });

    const options = createTestOptions();
    const result = await activateSubCmd.handler([planId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.message).toContain('already active');
  });

  test('fails for completed plan', async () => {
    const planId = await createTestPlan('Test Plan', { status: 'active' });

    // Complete the plan first
    const completeSubCmd = planCommand.subcommands!['complete'];
    await completeSubCmd.handler([planId], createTestOptions());

    const options = createTestOptions();
    const result = await activateSubCmd.handler([planId], options);

    expect(result.exitCode).toBe(ExitCode.VALIDATION);
    expect(result.error).toContain('Cannot activate');
  });

  test('fails without id', async () => {
    const options = createTestOptions();
    const result = await activateSubCmd.handler([], options);

    expect(result.exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
  });
});

// ============================================================================
// Plan Complete Command Tests
// ============================================================================

describe('plan complete command', () => {
  const completeSubCmd = planCommand.subcommands!['complete'];
  const showSubCmd = planCommand.subcommands!['show'];

  test('completes an active plan', async () => {
    const planId = await createTestPlan('Active Plan', { status: 'active' });

    const options = createTestOptions();
    const result = await completeSubCmd.handler([planId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.message).toContain('Completed');

    // Verify status change
    const showResult = await showSubCmd.handler([planId], createTestOptions({ json: true }));
    const data = showResult.data as { plan: Plan };
    expect(data.plan.status).toBe(PlanStatus.COMPLETED);
    expect(data.plan.completedAt).toBeDefined();
  });

  test('returns success for already completed plan', async () => {
    const planId = await createTestPlan('Active Plan', { status: 'active' });
    await completeSubCmd.handler([planId], createTestOptions());

    const result = await completeSubCmd.handler([planId], createTestOptions());

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.message).toContain('already completed');
  });

  test('fails for draft plan', async () => {
    const planId = await createTestPlan('Draft Plan');

    const options = createTestOptions();
    const result = await completeSubCmd.handler([planId], options);

    expect(result.exitCode).toBe(ExitCode.VALIDATION);
    expect(result.error).toContain('Cannot complete');
  });
});

// ============================================================================
// Plan Cancel Command Tests
// ============================================================================

describe('plan cancel command', () => {
  const cancelSubCmd = planCommand.subcommands!['cancel'];
  const showSubCmd = planCommand.subcommands!['show'];

  test('cancels a draft plan', async () => {
    const planId = await createTestPlan('Draft Plan');

    const options = createTestOptions({ reason: 'Requirements changed' });
    const result = await cancelSubCmd.handler([planId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.message).toContain('Cancelled');

    // Verify status change
    const showResult = await showSubCmd.handler([planId], createTestOptions({ json: true }));
    const data = showResult.data as { plan: Plan };
    expect(data.plan.status).toBe(PlanStatus.CANCELLED);
    expect(data.plan.cancelledAt).toBeDefined();
    expect(data.plan.cancelReason).toBe('Requirements changed');
  });

  test('cancels an active plan', async () => {
    const planId = await createTestPlan('Active Plan', { status: 'active' });

    const options = createTestOptions();
    const result = await cancelSubCmd.handler([planId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.message).toContain('Cancelled');
  });

  test('returns success for already cancelled plan', async () => {
    const planId = await createTestPlan('Draft Plan');
    await cancelSubCmd.handler([planId], createTestOptions());

    const result = await cancelSubCmd.handler([planId], createTestOptions());

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.message).toContain('already cancelled');
  });

  test('fails for completed plan', async () => {
    const planId = await createTestPlan('Active Plan', { status: 'active' });
    const completeSubCmd = planCommand.subcommands!['complete'];
    await completeSubCmd.handler([planId], createTestOptions());

    const result = await cancelSubCmd.handler([planId], createTestOptions());

    expect(result.exitCode).toBe(ExitCode.VALIDATION);
    expect(result.error).toContain('Cannot cancel');
  });
});

// ============================================================================
// Plan Add Task Command Tests
// ============================================================================

describe('plan add-task command', () => {
  const addTaskSubCmd = planCommand.subcommands!['add-task'];
  const tasksSubCmd = planCommand.subcommands!['tasks'];

  test('adds a task to a plan', async () => {
    const planId = await createTestPlan('Test Plan');
    const taskId = await createTestTask('Test Task');

    const options = createTestOptions();
    const result = await addTaskSubCmd.handler([planId, taskId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.message).toContain('Added task');

    // Verify task is in plan
    const tasksResult = await tasksSubCmd.handler([planId], createTestOptions({ json: true }));
    const tasks = tasksResult.data as Task[];
    expect(tasks.length).toBe(1);
    expect(tasks[0].id).toBe(taskId);
  });

  test('fails without plan id and task id', async () => {
    const options = createTestOptions();
    const result = await addTaskSubCmd.handler([], options);

    expect(result.exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
    expect(result.error ?? '').toContain('Usage');
  });

  test('fails for non-existent plan', async () => {
    const taskId = await createTestTask('Test Task');

    const options = createTestOptions();
    const result = await addTaskSubCmd.handler(['el-nonexistent', taskId], options);

    expect(result.exitCode).toBe(ExitCode.NOT_FOUND);
    expect(result.error ?? '').toContain('Plan not found');
  });

  test('fails for non-existent task', async () => {
    const planId = await createTestPlan('Test Plan');

    const options = createTestOptions();
    const result = await addTaskSubCmd.handler([planId, 'el-nonexistent'], options);

    expect(result.exitCode).toBe(ExitCode.NOT_FOUND);
    expect(result.error ?? '').toContain('Task not found');
  });
});

// ============================================================================
// Plan Remove Task Command Tests
// ============================================================================

describe('plan remove-task command', () => {
  const addTaskSubCmd = planCommand.subcommands!['add-task'];
  const removeTaskSubCmd = planCommand.subcommands!['remove-task'];
  const tasksSubCmd = planCommand.subcommands!['tasks'];

  test('removes a task from a plan', async () => {
    const planId = await createTestPlan('Test Plan');
    const taskId = await createTestTask('Test Task');

    // Add task first
    await addTaskSubCmd.handler([planId, taskId], createTestOptions());

    // Remove task
    const options = createTestOptions();
    const result = await removeTaskSubCmd.handler([planId, taskId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.message).toContain('Removed task');

    // Verify task is removed
    const tasksResult = await tasksSubCmd.handler([planId], createTestOptions({ json: true }));
    const tasks = tasksResult.data as Task[];
    expect(tasks.length).toBe(0);
  });

  test('fails without plan id and task id', async () => {
    const options = createTestOptions();
    const result = await removeTaskSubCmd.handler([], options);

    expect(result.exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
  });
});

// ============================================================================
// Plan Tasks Command Tests
// ============================================================================

describe('plan tasks command', () => {
  const addTaskSubCmd = planCommand.subcommands!['add-task'];
  const tasksSubCmd = planCommand.subcommands!['tasks'];

  test('lists tasks in a plan', async () => {
    const planId = await createTestPlan('Test Plan');
    const task1Id = await createTestTask('Task 1');
    const task2Id = await createTestTask('Task 2');

    await addTaskSubCmd.handler([planId, task1Id], createTestOptions());
    await addTaskSubCmd.handler([planId, task2Id], createTestOptions());

    const options = createTestOptions();
    const result = await tasksSubCmd.handler([planId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const tasks = result.data as Task[];
    expect(tasks.length).toBe(2);
  });

  test('respects limit option', async () => {
    const planId = await createTestPlan('Test Plan');
    await addTaskSubCmd.handler([planId, await createTestTask('Task 1')], createTestOptions());
    await addTaskSubCmd.handler([planId, await createTestTask('Task 2')], createTestOptions());
    await addTaskSubCmd.handler([planId, await createTestTask('Task 3')], createTestOptions());

    const options = createTestOptions({ limit: '2' });
    const result = await tasksSubCmd.handler([planId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect((result.data as Task[]).length).toBe(2);
  });

  test('returns empty message when no tasks', async () => {
    const planId = await createTestPlan('Empty Plan');

    const options = createTestOptions();
    const result = await tasksSubCmd.handler([planId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.message).toContain('No tasks');
  });

  test('fails without plan id', async () => {
    const options = createTestOptions();
    const result = await tasksSubCmd.handler([], options);

    expect(result.exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
  });
});

// ============================================================================
// Plan Root Command Tests
// ============================================================================

describe('plan root command', () => {
  test('defaults to list when no subcommand', async () => {
    await createTestPlan('Test Plan');

    const options = createTestOptions();
    const result = await planCommand.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toBeDefined();
    expect(Array.isArray(result.data)).toBe(true);
  });

  test('returns error for unknown subcommand', async () => {
    const options = createTestOptions();
    const result = await planCommand.handler(['unknown'], options);

    expect(result.exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
    expect(result.error ?? '').toContain('Unknown subcommand');
  });
});

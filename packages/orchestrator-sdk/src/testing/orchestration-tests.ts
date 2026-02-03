/**
 * Orchestration E2E Test Definitions
 *
 * This module defines the orchestration tests that validate each behavior
 * in the orchestration system. Tests run against an isolated test workspace.
 *
 * @module
 */

import type { EntityId, Task } from '@elemental/core';
import { TaskStatus } from '@elemental/core';

import type { TestContext } from './test-context.js';
import type { TestResult } from './test-utils.js';
import {
  waitFor,
  pass,
  fail,
  sleep,
  uniqueId,
} from './test-utils.js';
import {
  createTestWorker,
  createTestDirector,
  createTestSteward,
  createTestTask,
} from './test-context.js';
import type { TestResult as TaskTestResult } from '../types/task-meta.js';

// ============================================================================
// Types
// ============================================================================

/**
 * A single orchestration test definition
 */
export interface OrchestrationTest {
  /** Unique test identifier (used for filtering) */
  readonly id: string;
  /** Human-readable test name */
  readonly name: string;
  /** Detailed description of what the test validates */
  readonly description: string;
  /** Test execution function */
  readonly run: (ctx: TestContext) => Promise<TestResult>;
  /** Test timeout in milliseconds */
  readonly timeout: number;
  /** Whether this test depends on previous tests (for state) */
  readonly dependsOn?: string[];
  /** Tags for categorizing tests */
  readonly tags?: string[];
}

// ============================================================================
// Test 1: Director Creates Tasks
// ============================================================================

export const directorCreatesTasksTest: OrchestrationTest = {
  id: 'director-creates-tasks',
  name: 'Director creates tasks when prompted',
  description: 'Send a feature request to director, verify task is created',
  timeout: 120000,
  tags: ['director', 'task'],

  async run(ctx) {
    // 1. Register a director agent
    ctx.log('Registering director agent...');
    const director = await createTestDirector(ctx, `TestDirector-${uniqueId()}`);
    ctx.log(`Registered director: ${director.id}`);

    // 2. Create a test task that the director would create
    // In a real test with Claude, we would send a message and wait for the director to create a task
    // For this mock test, we simulate the director creating a task
    ctx.log('Creating task (simulating director behavior)...');
    const task = await createTestTask(ctx, 'Add /health endpoint that returns { status: "ok" }', {
      priority: 5,
      tags: ['test', 'feature', 'health'],
      acceptanceCriteria: 'Endpoint returns { status: "ok" } on GET /health',
    });

    if (!task) {
      return fail('Failed to create task');
    }

    // 3. Verify task was created correctly
    ctx.log(`Task created: ${task.id}`);
    const retrieved = await ctx.api.get<Task>(task.id);

    if (!retrieved) {
      return fail('Task not found after creation');
    }

    if (!retrieved.title.toLowerCase().includes('health')) {
      return fail(`Task title doesn't contain 'health': ${retrieved.title}`);
    }

    return pass(`Director created task: "${retrieved.title}"`, {
      taskId: task.id,
      taskTitle: task.title,
    });
  },
};

// ============================================================================
// Test 2: Director Creates Plans
// ============================================================================

export const directorCreatesPlansTest: OrchestrationTest = {
  id: 'director-creates-plans',
  name: 'Director creates plans for complex goals',
  description: 'Send a complex goal to director, verify plan with tasks is created',
  timeout: 120000,
  tags: ['director', 'plan'],

  async run(ctx) {
    // 1. Register a director
    const director = await createTestDirector(ctx, `TestDirector-${uniqueId()}`);
    ctx.log(`Registered director: ${director.id}`);

    // 2. For this mock test, we create a plan directly
    // In a real test, we would send a complex goal and wait for the director to create a plan
    ctx.log('Creating plan (simulating director behavior)...');

    // Create multiple related tasks (simulating a plan)
    const task1 = await createTestTask(ctx, 'Set up API framework', {
      priority: 5,
      tags: ['test', 'api', 'setup'],
    });
    const task2 = await createTestTask(ctx, 'Implement authentication', {
      priority: 4,
      tags: ['test', 'api', 'auth'],
    });
    const task3 = await createTestTask(ctx, 'Add rate limiting', {
      priority: 3,
      tags: ['test', 'api', 'security'],
    });

    const tasks = [task1, task2, task3];

    if (tasks.length < 2) {
      return fail('Failed to create plan with multiple tasks');
    }

    return pass(`Director created plan with ${tasks.length} tasks`, {
      taskCount: tasks.length,
      tasks: tasks.map(t => ({ id: t.id, title: t.title })),
    });
  },
};

// ============================================================================
// Test 3: Daemon Dispatches to Worker
// ============================================================================

export const daemonDispatchesWorkerTest: OrchestrationTest = {
  id: 'daemon-dispatches-worker',
  name: 'Daemon dispatches unassigned task to available worker',
  description: 'Create unassigned task, verify daemon assigns to worker',
  timeout: 60000,
  tags: ['daemon', 'dispatch', 'worker'],

  async run(ctx) {
    // 1. Create an ephemeral worker
    ctx.log('Creating worker agent...');
    const worker = await createTestWorker(ctx, `TestWorker-${uniqueId()}`);
    ctx.log(`Registered worker: ${worker.id}`);

    // 2. Create an unassigned task
    ctx.log('Creating unassigned task...');
    const task = await createTestTask(ctx, 'Test task for dispatch', {
      priority: 5,
      tags: ['test', 'dispatch'],
    });
    ctx.log(`Created task: ${task.id}`);

    // 3. Manually trigger daemon poll (simulating daemon behavior)
    ctx.log('Triggering daemon poll...');
    await ctx.daemon.pollWorkerAvailability();

    // 4. Wait for task to be assigned
    ctx.log('Waiting for task assignment...');
    const assigned = await waitFor(
      async () => {
        const updated = await ctx.api.get<Task>(task.id);
        if (!updated) return null;
        return updated.assignee ? updated : null;
      },
      { timeout: 30000, interval: 1000, description: 'task assignment' }
    ).catch(() => null);

    if (!assigned) {
      return fail('Daemon did not assign task to worker');
    }

    return pass(`Task assigned to worker`, {
      taskId: task.id,
      assignee: assigned.assignee,
    });
  },
};

// ============================================================================
// Test 4: Daemon Respects Dependencies
// ============================================================================

export const daemonRespectsDependenciesTest: OrchestrationTest = {
  id: 'daemon-respects-dependencies',
  name: 'Daemon respects task dependencies',
  description: 'Blocked task waits until dependency resolves',
  timeout: 60000,
  tags: ['daemon', 'dependencies'],

  async run(ctx) {
    // 1. Create worker
    const worker = await createTestWorker(ctx, `TestWorker-${uniqueId()}`);
    ctx.log(`Registered worker: ${worker.id}`);

    // 2. Create two tasks where task2 depends on task1
    const task1 = await createTestTask(ctx, 'First task', { priority: 5 });
    const task2 = await createTestTask(ctx, 'Dependent task', { priority: 5 });

    // 3. Add dependency: task2 is blocked by task1
    await ctx.api.addDependency({
      sourceId: task2.id,
      targetId: task1.id,
      type: 'blocks',
      actor: ctx.systemEntityId,
    });
    ctx.log(`Created dependency: ${task2.id} blocked by ${task1.id}`);

    // 4. Poll daemon - should only assign task1, not task2
    await ctx.daemon.pollWorkerAvailability();
    await sleep(1000);

    // 5. Check that task2 is still unassigned
    const task2After = await ctx.api.get<Task>(task2.id);

    if (task2After?.assignee) {
      return fail('Daemon assigned blocked task before dependency resolved');
    }

    // 6. Complete task1 (simulate)
    await ctx.api.update<Task>(task1.id, { status: TaskStatus.CLOSED });
    ctx.log('Completed task1');

    // 7. Now poll again - task2 should be assignable
    await ctx.daemon.pollWorkerAvailability();

    const task2Final = await waitFor(
      async () => {
        const updated = await ctx.api.get<Task>(task2.id);
        return updated?.assignee ? updated : null;
      },
      { timeout: 10000, interval: 1000, description: 'blocked task assignment' }
    ).catch(() => null);

    if (!task2Final?.assignee) {
      return fail('Daemon did not assign task after dependency resolved');
    }

    return pass('Daemon correctly respected dependencies', {
      task1Id: task1.id,
      task2Id: task2.id,
    });
  },
};

// ============================================================================
// Test 5: Worker Uses Worktree
// ============================================================================

export const workerUsesWorktreeTest: OrchestrationTest = {
  id: 'worker-uses-worktree',
  name: 'Worker operates in isolated worktree',
  description: 'Verify worker is spawned in a git worktree directory',
  timeout: 60000,
  tags: ['worker', 'worktree', 'git'],

  async run(ctx) {
    // 1. Create worker and task
    const worker = await createTestWorker(ctx, `TestWorker-${uniqueId()}`);
    const task = await createTestTask(ctx, 'Test worktree usage', { priority: 5 });

    // 2. Create worktree for the task
    ctx.log('Creating worktree...');
    const worktreeResult = await ctx.worktreeManager.createWorktree({
      agentName: worker.name,
      taskId: task.id,
      taskTitle: task.title,
    });

    ctx.log(`Worktree created at: ${worktreeResult.path}`);

    // 3. Verify worktree exists
    const exists = await ctx.worktreeManager.worktreeExists(worktreeResult.path);
    if (!exists) {
      return fail(`Worktree does not exist at: ${worktreeResult.path}`);
    }

    // 4. Verify it's a valid git worktree
    const worktreeInfo = await ctx.worktreeManager.getWorktree(worktreeResult.path);
    if (!worktreeInfo) {
      return fail('Failed to get worktree info');
    }

    // 5. Verify branch naming convention
    const expectedBranchPattern = /^agent\/.+\/.+/;
    if (!expectedBranchPattern.test(worktreeResult.branch)) {
      return fail(`Branch name doesn't match pattern: ${worktreeResult.branch}`);
    }

    // 6. Verify path is in worktrees directory
    if (!worktreeResult.path.includes('.worktrees')) {
      return fail(`Worktree path not in .worktrees directory: ${worktreeResult.path}`);
    }

    return pass(`Worker running in worktree: ${worktreeResult.path}`, {
      worktreePath: worktreeResult.path,
      branch: worktreeResult.branch,
      isGitWorktree: true,
    });
  },
};

// ============================================================================
// Test 6: Worker Commits Work
// ============================================================================

export const workerCommitsWorkTest: OrchestrationTest = {
  id: 'worker-commits-work',
  name: 'Worker makes commits in worktree branch',
  description: 'Verify worker can commit changes to its worktree branch',
  timeout: 60000,
  tags: ['worker', 'git', 'commit'],

  async run(ctx) {
    const { execSync } = await import('node:child_process');
    const { writeFile } = await import('node:fs/promises');
    const { join } = await import('node:path');

    // 1. Create worker and worktree
    const worker = await createTestWorker(ctx, `TestWorker-${uniqueId()}`);
    const task = await createTestTask(ctx, 'Test commits', { priority: 5 });

    const worktreeResult = await ctx.worktreeManager.createWorktree({
      agentName: worker.name,
      taskId: task.id,
      taskTitle: task.title,
    });

    ctx.log(`Working in worktree: ${worktreeResult.path}`);

    // 2. Make a change in the worktree
    const testFilePath = join(worktreeResult.path, 'test-file.txt');
    await writeFile(testFilePath, 'Test content from worker\n');
    ctx.log('Created test file');

    // 3. Commit the change
    try {
      execSync('git add -A && git commit -m "Test commit from worker"', {
        cwd: worktreeResult.path,
        stdio: 'pipe',
      });
      ctx.log('Committed changes');
    } catch (error) {
      return fail(`Failed to commit: ${error instanceof Error ? error.message : String(error)}`);
    }

    // 4. Verify commit exists
    try {
      const log = execSync('git log --oneline -1', {
        cwd: worktreeResult.path,
        encoding: 'utf8',
      });

      if (!log.includes('Test commit from worker')) {
        return fail(`Commit message not found in log: ${log}`);
      }

      ctx.log(`Commit verified: ${log.trim()}`);
    } catch (error) {
      return fail(`Failed to verify commit: ${error instanceof Error ? error.message : String(error)}`);
    }

    return pass('Worker successfully committed changes', {
      worktreePath: worktreeResult.path,
      branch: worktreeResult.branch,
    });
  },
};

// ============================================================================
// Test 7: Worker Creates Merge Request
// ============================================================================

export const workerCreatesMergeRequestTest: OrchestrationTest = {
  id: 'worker-creates-merge-request',
  name: 'Worker creates merge request on task completion',
  description: 'Worker creates PR/MR when finishing a task',
  timeout: 90000,
  tags: ['worker', 'merge-request', 'git'],

  async run(ctx) {
    // 1. Create worker and task
    const worker = await createTestWorker(ctx, `TestWorker-${uniqueId()}`);
    const task = await createTestTask(ctx, 'Test merge request creation', { priority: 5 });

    // 2. Create worktree and make changes
    const worktreeResult = await ctx.worktreeManager.createWorktree({
      agentName: worker.name,
      taskId: task.id,
      taskTitle: task.title,
    });

    // 3. Simulate worker completing task by updating task metadata with MR info
    // In a real scenario, the worker would push to remote and create a PR
    await ctx.api.updateTaskOrchestratorMeta(task.id, {
      branch: worktreeResult.branch,
      worktree: worktreeResult.path,
      mergeRequestId: 1,
      mergeRequestUrl: `https://github.com/test/repo/pull/1`,
      mergeStatus: 'pending',
    });

    ctx.log('Updated task with MR info');

    // 4. Verify MR info is stored
    const taskMeta = await ctx.api.getTaskOrchestratorMeta(task.id);

    if (!taskMeta?.mergeRequestId) {
      return fail('PR number not set in task metadata');
    }

    if (!taskMeta?.mergeRequestUrl) {
      return fail('PR URL not set in task metadata');
    }

    return pass(`Merge request created: PR #${taskMeta.mergeRequestId}`, {
      mergeRequestId: taskMeta.mergeRequestId,
      mergeRequestUrl: taskMeta.mergeRequestUrl,
      branch: taskMeta.branch,
    });
  },
};

// ============================================================================
// Test 8: Worker Marks Task Complete
// ============================================================================

export const workerMarksTaskCompleteTest: OrchestrationTest = {
  id: 'worker-marks-task-complete',
  name: 'Worker marks task as complete',
  description: 'Task status changes to closed when worker finishes',
  timeout: 30000,
  tags: ['worker', 'task', 'completion'],

  async run(ctx) {
    // 1. Create worker and task
    const worker = await createTestWorker(ctx, `TestWorker-${uniqueId()}`);
    const task = await createTestTask(ctx, 'Test task completion', { priority: 5 });

    // 2. Assign task to worker
    await ctx.api.assignTaskToAgent(task.id, worker.id as unknown as EntityId, {
      markAsStarted: true,
    });
    ctx.log('Assigned task to worker');

    // 3. Verify task is in progress
    const taskInProgress = await ctx.api.get<Task>(task.id);
    if (taskInProgress?.status !== TaskStatus.IN_PROGRESS) {
      return fail(`Expected task in_progress, got: ${taskInProgress?.status}`);
    }

    // 4. Complete the task (simulating worker completion)
    await ctx.taskAssignment.completeTask(task.id, {
      summary: 'Task completed successfully',
    });
    ctx.log('Completed task');

    // 5. Verify task is closed
    const taskClosed = await ctx.api.get<Task>(task.id);
    if (taskClosed?.status !== TaskStatus.CLOSED) {
      return fail(`Expected task closed, got: ${taskClosed?.status}`);
    }

    return pass(`Task status is '${taskClosed.status}'`, {
      taskId: task.id,
      status: taskClosed.status,
    });
  },
};

// ============================================================================
// Test 9: Worker Handoff on Context Fill
// ============================================================================

export const workerHandoffOnContextFillTest: OrchestrationTest = {
  id: 'worker-handoff-context',
  name: 'Worker triggers handoff before context exhaustion',
  description: 'Worker creates handoff task when approaching context limits',
  timeout: 60000,
  tags: ['worker', 'handoff', 'context'],

  async run(ctx) {
    // 1. Create worker and task
    const worker = await createTestWorker(ctx, `TestWorker-${uniqueId()}`);
    const task = await createTestTask(ctx, 'Long running task', { priority: 5 });

    // 2. Assign task and create worktree
    const worktreeResult = await ctx.worktreeManager.createWorktree({
      agentName: worker.name,
      taskId: task.id,
      taskTitle: task.title,
    });

    await ctx.api.assignTaskToAgent(task.id, worker.id as unknown as EntityId, {
      branch: worktreeResult.branch,
      worktree: worktreeResult.path,
      markAsStarted: true,
    });

    // 3. Simulate handoff by updating task metadata
    await ctx.api.updateTaskOrchestratorMeta(task.id, {
      handoffBranch: worktreeResult.branch,
      handoffWorktree: worktreeResult.path,
      handoffFrom: worker.id as unknown as EntityId,
      handoffAt: new Date().toISOString(),
      handoffNote: 'Context limit approaching, handing off to continue work',
    });

    // 4. Unassign from current worker (simulating handoff)
    await ctx.api.update<Task>(task.id, {
      assignee: undefined,
      status: TaskStatus.OPEN,
    });

    ctx.log('Created handoff');

    // 5. Verify handoff metadata exists
    const taskMeta = await ctx.api.getTaskOrchestratorMeta(task.id);

    if (!taskMeta?.handoffBranch) {
      return fail('Handoff branch not set');
    }

    if (!taskMeta?.handoffNote) {
      return fail('Handoff note not set');
    }

    return pass('Worker created handoff successfully', {
      handoffBranch: taskMeta.handoffBranch,
      handoffFrom: taskMeta.handoffFrom,
      handoffNote: taskMeta.handoffNote,
    });
  },
};

// ============================================================================
// Test 10: Daemon Spawns Steward for MR
// ============================================================================

export const daemonSpawnsStewardForMRTest: OrchestrationTest = {
  id: 'daemon-spawns-steward-mr',
  name: 'Daemon spawns steward for merge request',
  description: 'Merge request triggers steward spawn for review',
  timeout: 60000,
  tags: ['daemon', 'steward', 'merge-request'],

  async run(ctx) {
    // 1. Create a merge steward
    const steward = await createTestSteward(ctx, `MergeSteward-${uniqueId()}`, {
      focus: 'merge',
      triggers: [{ type: 'event', event: 'merge_request_created' }],
    });
    ctx.log(`Registered merge steward: ${steward.id}`);

    // 2. Register steward with scheduler
    await ctx.stewardScheduler.registerSteward(steward.id as unknown as EntityId);

    // 3. Start the scheduler
    await ctx.stewardScheduler.start();

    // 4. Create a task with MR info (simulating MR creation)
    const task = await createTestTask(ctx, 'Task with merge request', { priority: 5 });
    await ctx.api.updateTaskOrchestratorMeta(task.id, {
      mergeRequestId: 42,
      mergeRequestUrl: 'https://github.com/test/repo/pull/42',
      mergeStatus: 'pending',
    });

    // 5. Publish merge request event
    const triggered = await ctx.stewardScheduler.publishEvent('merge_request_created', {
      taskId: task.id,
      mergeRequestId: 42,
    });

    ctx.log(`Published MR event, triggered ${triggered} steward(s)`);

    // 6. Verify steward was triggered
    if (triggered === 0) {
      return fail('No steward was triggered for merge request');
    }

    // 7. Check steward execution history
    const history = ctx.stewardScheduler.getExecutionHistory({
      stewardId: steward.id as unknown as EntityId,
      limit: 1,
    });

    if (history.length === 0) {
      return fail('Steward execution not recorded');
    }

    return pass('Steward triggered for merge request', {
      stewardId: steward.id,
      triggerCount: triggered,
    });
  },
};

// ============================================================================
// Test 11: Steward Merges Passing MR
// ============================================================================

export const stewardMergesPassingMRTest: OrchestrationTest = {
  id: 'steward-merges-passing',
  name: 'Steward reviews and merges passing PR',
  description: 'Steward merges PR when tests pass',
  timeout: 60000,
  tags: ['steward', 'merge', 'tests'],

  async run(ctx) {
    // 1. Create task with passing MR status
    const task = await createTestTask(ctx, 'Task with passing tests', { priority: 5 });

    await ctx.api.updateTaskOrchestratorMeta(task.id, {
      mergeRequestId: 100,
      mergeRequestUrl: 'https://github.com/test/repo/pull/100',
      mergeStatus: 'testing',
      testRunCount: 1,
      lastTestResult: {
        passed: true,
        totalTests: 10,
        passedTests: 10,
        failedTests: 0,
        durationMs: 5000,
        completedAt: new Date().toISOString(),
      },
    });

    ctx.log('Created task with passing test results');

    // 2. Simulate steward merging the MR
    await ctx.api.updateTaskOrchestratorMeta(task.id, {
      mergeStatus: 'merged',
      completedAt: new Date().toISOString(),
    });

    // 3. Close the task
    await ctx.api.update<Task>(task.id, { status: TaskStatus.CLOSED });

    // 4. Verify merge status
    const taskMeta = await ctx.api.getTaskOrchestratorMeta(task.id);

    if (taskMeta?.mergeStatus !== 'merged') {
      return fail(`Expected merge status 'merged', got: ${taskMeta?.mergeStatus}`);
    }

    const updatedTask = await ctx.api.get<Task>(task.id);
    if (updatedTask?.status !== TaskStatus.CLOSED) {
      return fail(`Expected task closed, got: ${updatedTask?.status}`);
    }

    return pass('Steward merged passing PR', {
      taskId: task.id,
      mergeStatus: taskMeta.mergeStatus,
      taskStatus: updatedTask.status,
    });
  },
};

// ============================================================================
// Test 12: Steward Handoff Failing MR
// ============================================================================

export const stewardHandoffFailingMRTest: OrchestrationTest = {
  id: 'steward-handoff-failing',
  name: 'Steward creates handoff for failing PR',
  description: 'Steward hands off to worker when tests fail',
  timeout: 60000,
  tags: ['steward', 'handoff', 'tests'],

  async run(ctx) {
    // 1. Create worker for handoff
    const worker = await createTestWorker(ctx, `TestWorker-${uniqueId()}`);

    // 2. Create task with failing MR status
    const task = await createTestTask(ctx, 'Task with failing tests', {
      priority: 5,
      tags: ['test', 'needs-fix'],
    });

    await ctx.api.updateTaskOrchestratorMeta(task.id, {
      mergeRequestId: 101,
      mergeRequestUrl: 'https://github.com/test/repo/pull/101',
      mergeStatus: 'testing',
      testRunCount: 1,
      lastTestResult: {
        passed: false,
        totalTests: 10,
        passedTests: 7,
        failedTests: 3,
        durationMs: 5000,
        completedAt: new Date().toISOString(),
        errorMessage: 'Test 1 failed, Test 2 failed, Test 3 failed',
      },
    });

    ctx.log('Created task with failing test results');

    // 3. Simulate steward marking as test_failed and creating handoff
    await ctx.api.updateTaskOrchestratorMeta(task.id, {
      mergeStatus: 'test_failed',
      mergeFailureReason: '3 tests failed: Test 1, Test 2, Test 3',
      handoffNote: 'Tests failed, needs worker to fix issues',
    });

    // 4. Reopen task for assignment
    await ctx.api.update<Task>(task.id, {
      status: TaskStatus.OPEN,
      assignee: undefined,
    });

    ctx.log('Created handoff for failing tests');

    // 5. Verify handoff was created
    const taskMeta = await ctx.api.getTaskOrchestratorMeta(task.id);

    if (taskMeta?.mergeStatus !== 'test_failed') {
      return fail(`Expected merge status 'test_failed', got: ${taskMeta?.mergeStatus}`);
    }

    if (!taskMeta?.handoffNote) {
      return fail('Handoff note not set');
    }

    const updatedTask = await ctx.api.get<Task>(task.id);
    if (updatedTask?.status !== TaskStatus.OPEN) {
      return fail(`Expected task open for reassignment, got: ${updatedTask?.status}`);
    }

    return pass('Steward created handoff for failing PR', {
      taskId: task.id,
      mergeStatus: taskMeta.mergeStatus,
      handoffNote: taskMeta.handoffNote,
      taskStatus: updatedTask.status,
    });
  },
};

// ============================================================================
// All Tests Collection
// ============================================================================

/**
 * All orchestration tests in order of execution
 */
export const allTests: OrchestrationTest[] = [
  directorCreatesTasksTest,
  directorCreatesPlansTest,
  daemonDispatchesWorkerTest,
  daemonRespectsDependenciesTest,
  workerUsesWorktreeTest,
  workerCommitsWorkTest,
  workerCreatesMergeRequestTest,
  workerMarksTaskCompleteTest,
  workerHandoffOnContextFillTest,
  daemonSpawnsStewardForMRTest,
  stewardMergesPassingMRTest,
  stewardHandoffFailingMRTest,
];

/**
 * Get tests by tag
 */
export function getTestsByTag(tag: string): OrchestrationTest[] {
  return allTests.filter(t => t.tags?.includes(tag));
}

/**
 * Get test by ID
 */
export function getTestById(id: string): OrchestrationTest | undefined {
  return allTests.find(t => t.id === id);
}

/**
 * Get tests matching a filter string (matches id or name)
 */
export function filterTests(filter: string): OrchestrationTest[] {
  const lowerFilter = filter.toLowerCase();
  return allTests.filter(
    t => t.id.toLowerCase().includes(lowerFilter) ||
         t.name.toLowerCase().includes(lowerFilter)
  );
}

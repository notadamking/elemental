/**
 * Workflow Query Integration Tests
 *
 * Tests for workflow-related query operations:
 * - getTasksInWorkflow: List all tasks in a workflow
 * - getReadyTasksInWorkflow: List ready tasks in a workflow
 * - getWorkflowProgress: Get progress metrics for a workflow
 * - Ephemeral filtering in ready() queries
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { ElementalAPIImpl } from './elemental-api.js';
import { createStorage, initializeSchema } from '../storage/index.js';
import type { StorageBackend } from '../storage/backend.js';
import type { Element, ElementId, EntityId } from '../types/element.js';
import type { Task } from '../types/task.js';
import { createTask, Priority, TaskStatus } from '../types/task.js';
import { createWorkflow, WorkflowStatus, type Workflow } from '../types/workflow.js';
import { DependencyType } from '../types/dependency.js';
import { createPlaybook, VariableType, type Playbook } from '../types/playbook.js';
import { pourWorkflow, computeWorkflowStatus } from '../types/workflow-pour.js';

// ============================================================================
// Test Helpers
// ============================================================================

const mockEntityId = 'user:test-user' as EntityId;

/**
 * Helper to cast element for api.create()
 */
function toCreateInput<T extends Element>(element: T): Parameters<ElementalAPIImpl['create']>[0] {
  return element as unknown as Parameters<ElementalAPIImpl['create']>[0];
}

/**
 * Create a test task element
 */
async function createTestTask(overrides: Partial<Parameters<typeof createTask>[0]> = {}): Promise<Task> {
  return createTask({
    title: 'Test Task',
    createdBy: mockEntityId,
    ...overrides,
  });
}

/**
 * Create a test workflow element
 */
async function createTestWorkflow(overrides: Partial<Parameters<typeof createWorkflow>[0]> = {}): Promise<Workflow> {
  return createWorkflow({
    title: 'Test Workflow',
    createdBy: mockEntityId,
    ...overrides,
  });
}

// ============================================================================
// Integration Tests
// ============================================================================

describe('Workflow Query Integration', () => {
  let backend: StorageBackend;
  let api: ElementalAPIImpl;

  beforeEach(() => {
    backend = createStorage({ path: ':memory:' });
    initializeSchema(backend);
    api = new ElementalAPIImpl(backend);
  });

  afterEach(() => {
    if (backend.isOpen) {
      backend.close();
    }
  });

  // ==========================================================================
  // getTasksInWorkflow Tests
  // ==========================================================================

  describe('getTasksInWorkflow', () => {
    it('should return empty array for workflow with no tasks', async () => {
      const workflow = await createTestWorkflow();
      await api.create(toCreateInput(workflow));

      const tasks = await api.getTasksInWorkflow(workflow.id);
      expect(tasks).toHaveLength(0);
    });

    it('should return tasks linked to workflow via parent-child dependency', async () => {
      const workflow = await createTestWorkflow();
      await api.create(toCreateInput(workflow));

      const task1 = await createTestTask({ title: 'Task 1' });
      const task2 = await createTestTask({ title: 'Task 2' });
      await api.create(toCreateInput(task1));
      await api.create(toCreateInput(task2));

      // Link tasks to workflow
      await api.addDependency({
        sourceId: task1.id,
        targetId: workflow.id,
        type: DependencyType.PARENT_CHILD,
      });
      await api.addDependency({
        sourceId: task2.id,
        targetId: workflow.id,
        type: DependencyType.PARENT_CHILD,
      });

      const tasks = await api.getTasksInWorkflow(workflow.id);
      expect(tasks).toHaveLength(2);
      expect(tasks.map((t) => t.id)).toContain(task1.id);
      expect(tasks.map((t) => t.id)).toContain(task2.id);
    });

    it('should filter tasks by status', async () => {
      // Use a completed workflow so tasks aren't blocked by parent
      const workflow = await createTestWorkflow({ status: WorkflowStatus.COMPLETED });
      const createdWorkflow = await api.create(toCreateInput(workflow));

      const openTask = await createTestTask({ title: 'Open Task', status: TaskStatus.OPEN });
      const closedTask = await createTestTask({ title: 'Closed Task', status: TaskStatus.CLOSED });
      const createdOpenTask = await api.create(toCreateInput(openTask));
      const createdClosedTask = await api.create(toCreateInput(closedTask));

      await api.addDependency({
        sourceId: createdOpenTask.id,
        targetId: createdWorkflow.id,
        type: DependencyType.PARENT_CHILD,
      });
      await api.addDependency({
        sourceId: createdClosedTask.id,
        targetId: createdWorkflow.id,
        type: DependencyType.PARENT_CHILD,
      });

      const openTasks = await api.getTasksInWorkflow(createdWorkflow.id, { status: TaskStatus.OPEN });
      expect(openTasks).toHaveLength(1);
      expect(openTasks[0].id).toBe(createdOpenTask.id);

      const closedTasks = await api.getTasksInWorkflow(createdWorkflow.id, { status: TaskStatus.CLOSED });
      expect(closedTasks).toHaveLength(1);
      expect(closedTasks[0].id).toBe(createdClosedTask.id);
    });

    it('should filter tasks by priority', async () => {
      const workflow = await createTestWorkflow();
      await api.create(toCreateInput(workflow));

      const highPriorityTask = await createTestTask({ title: 'High Priority', priority: Priority.CRITICAL });
      const lowPriorityTask = await createTestTask({ title: 'Low Priority', priority: Priority.MINIMAL });
      await api.create(toCreateInput(highPriorityTask));
      await api.create(toCreateInput(lowPriorityTask));

      await api.addDependency({
        sourceId: highPriorityTask.id,
        targetId: workflow.id,
        type: DependencyType.PARENT_CHILD,
      });
      await api.addDependency({
        sourceId: lowPriorityTask.id,
        targetId: workflow.id,
        type: DependencyType.PARENT_CHILD,
      });

      const criticalTasks = await api.getTasksInWorkflow(workflow.id, { priority: Priority.CRITICAL });
      expect(criticalTasks).toHaveLength(1);
      expect(criticalTasks[0].id).toBe(highPriorityTask.id);
    });

    it('should filter tasks by assignee', async () => {
      const workflow = await createTestWorkflow();
      await api.create(toCreateInput(workflow));

      const assignedTask = await createTestTask({ title: 'Assigned', assignee: 'user:alice' as EntityId });
      const unassignedTask = await createTestTask({ title: 'Unassigned' });
      await api.create(toCreateInput(assignedTask));
      await api.create(toCreateInput(unassignedTask));

      await api.addDependency({
        sourceId: assignedTask.id,
        targetId: workflow.id,
        type: DependencyType.PARENT_CHILD,
      });
      await api.addDependency({
        sourceId: unassignedTask.id,
        targetId: workflow.id,
        type: DependencyType.PARENT_CHILD,
      });

      const aliceTasks = await api.getTasksInWorkflow(workflow.id, { assignee: 'user:alice' as EntityId });
      expect(aliceTasks).toHaveLength(1);
      expect(aliceTasks[0].id).toBe(assignedTask.id);
    });

    it('should throw NotFoundError for non-existent workflow', async () => {
      await expect(api.getTasksInWorkflow('el-nonexistent' as ElementId)).rejects.toThrow('Workflow not found');
    });

    it('should throw ConstraintError for non-workflow element', async () => {
      const task = await createTestTask();
      await api.create(toCreateInput(task));

      await expect(api.getTasksInWorkflow(task.id)).rejects.toThrow('is not a workflow');
    });

    it('should exclude tombstone tasks by default', async () => {
      const workflow = await createTestWorkflow();
      await api.create(toCreateInput(workflow));

      const activeTask = await createTestTask({ title: 'Active Task' });
      const tombstoneTask = await createTestTask({ title: 'Tombstone Task', status: TaskStatus.TOMBSTONE });
      await api.create(toCreateInput(activeTask));
      await api.create(toCreateInput(tombstoneTask));

      await api.addDependency({
        sourceId: activeTask.id,
        targetId: workflow.id,
        type: DependencyType.PARENT_CHILD,
      });
      await api.addDependency({
        sourceId: tombstoneTask.id,
        targetId: workflow.id,
        type: DependencyType.PARENT_CHILD,
      });

      const tasks = await api.getTasksInWorkflow(workflow.id);
      expect(tasks).toHaveLength(1);
      expect(tasks[0].id).toBe(activeTask.id);
    });

    it('should include tombstone tasks when includeDeleted is true', async () => {
      const workflow = await createTestWorkflow();
      await api.create(toCreateInput(workflow));

      const activeTask = await createTestTask({ title: 'Active Task' });
      const tombstoneTask = await createTestTask({ title: 'Tombstone Task', status: TaskStatus.TOMBSTONE });
      await api.create(toCreateInput(activeTask));
      await api.create(toCreateInput(tombstoneTask));

      await api.addDependency({
        sourceId: activeTask.id,
        targetId: workflow.id,
        type: DependencyType.PARENT_CHILD,
      });
      await api.addDependency({
        sourceId: tombstoneTask.id,
        targetId: workflow.id,
        type: DependencyType.PARENT_CHILD,
      });

      const tasks = await api.getTasksInWorkflow(workflow.id, { includeDeleted: true });
      expect(tasks).toHaveLength(2);
    });
  });

  // ==========================================================================
  // getReadyTasksInWorkflow Tests
  // ==========================================================================

  describe('getReadyTasksInWorkflow', () => {
    it('should return only open/in_progress tasks that are not blocked', async () => {
      // Use a completed workflow so tasks aren't blocked by parent status
      const workflow = await createTestWorkflow({ status: WorkflowStatus.COMPLETED });
      await api.create(toCreateInput(workflow));

      const readyTask = await createTestTask({ title: 'Ready Task', status: TaskStatus.OPEN });
      const blockerTask = await createTestTask({ title: 'Blocker Task', status: TaskStatus.OPEN });
      const blockedTask = await createTestTask({ title: 'Blocked Task', status: TaskStatus.OPEN });
      const closedTask = await createTestTask({ title: 'Closed Task', status: TaskStatus.CLOSED });

      await api.create(toCreateInput(readyTask));
      await api.create(toCreateInput(blockerTask));
      await api.create(toCreateInput(blockedTask));
      await api.create(toCreateInput(closedTask));

      // Link all tasks to workflow
      for (const task of [readyTask, blockerTask, blockedTask, closedTask]) {
        await api.addDependency({
          sourceId: task.id,
          targetId: workflow.id,
          type: DependencyType.PARENT_CHILD,
        });
      }

      // Add blocking dependency: blockedTask is blocked by blockerTask
      await api.addDependency({
        sourceId: blockedTask.id,
        targetId: blockerTask.id,
        type: DependencyType.BLOCKS,
      });

      const readyTasks = await api.getReadyTasksInWorkflow(workflow.id);
      expect(readyTasks).toHaveLength(2);
      expect(readyTasks.map((t) => t.id)).toContain(readyTask.id);
      expect(readyTasks.map((t) => t.id)).toContain(blockerTask.id);
      expect(readyTasks.map((t) => t.id)).not.toContain(blockedTask.id);
      expect(readyTasks.map((t) => t.id)).not.toContain(closedTask.id);
    });

    it('should filter out tasks scheduled for the future', async () => {
      const workflow = await createTestWorkflow({ status: WorkflowStatus.COMPLETED });
      await api.create(toCreateInput(workflow));

      const nowTask = await createTestTask({ title: 'Now Task' });
      const futureTask = await createTestTask({
        title: 'Future Task',
        scheduledFor: new Date(Date.now() + 86400000).toISOString(), // 1 day from now
      });

      await api.create(toCreateInput(nowTask));
      await api.create(toCreateInput(futureTask));

      await api.addDependency({
        sourceId: nowTask.id,
        targetId: workflow.id,
        type: DependencyType.PARENT_CHILD,
      });
      await api.addDependency({
        sourceId: futureTask.id,
        targetId: workflow.id,
        type: DependencyType.PARENT_CHILD,
      });

      const readyTasks = await api.getReadyTasksInWorkflow(workflow.id);
      expect(readyTasks).toHaveLength(1);
      expect(readyTasks[0].id).toBe(nowTask.id);
    });

    it('should respect limit filter', async () => {
      const workflow = await createTestWorkflow({ status: WorkflowStatus.COMPLETED });
      await api.create(toCreateInput(workflow));

      // Create 5 tasks
      for (let i = 0; i < 5; i++) {
        const task = await createTestTask({ title: `Task ${i}`, priority: Priority.MEDIUM });
        await api.create(toCreateInput(task));
        await api.addDependency({
          sourceId: task.id,
          targetId: workflow.id,
          type: DependencyType.PARENT_CHILD,
        });
      }

      const readyTasks = await api.getReadyTasksInWorkflow(workflow.id, { limit: 2 });
      expect(readyTasks).toHaveLength(2);
    });

    it('should sort by priority', async () => {
      const workflow = await createTestWorkflow({ status: WorkflowStatus.COMPLETED });
      await api.create(toCreateInput(workflow));

      const lowTask = await createTestTask({ title: 'Low Priority', priority: Priority.MINIMAL });
      const highTask = await createTestTask({ title: 'High Priority', priority: Priority.CRITICAL });

      await api.create(toCreateInput(lowTask));
      await api.create(toCreateInput(highTask));

      await api.addDependency({
        sourceId: lowTask.id,
        targetId: workflow.id,
        type: DependencyType.PARENT_CHILD,
      });
      await api.addDependency({
        sourceId: highTask.id,
        targetId: workflow.id,
        type: DependencyType.PARENT_CHILD,
      });

      const readyTasks = await api.getReadyTasksInWorkflow(workflow.id);
      // Higher priority should come first (lower number = higher priority)
      expect(readyTasks).toHaveLength(2);
      expect(readyTasks[0].priority).toBeLessThanOrEqual(readyTasks[1].priority);
    });
  });

  // ==========================================================================
  // getWorkflowProgress Tests
  // ==========================================================================

  describe('getWorkflowProgress', () => {
    it('should return correct progress for empty workflow', async () => {
      const workflow = await createTestWorkflow();
      await api.create(toCreateInput(workflow));

      const progress = await api.getWorkflowProgress(workflow.id);
      expect(progress.workflowId).toBe(workflow.id);
      expect(progress.totalTasks).toBe(0);
      expect(progress.completionPercentage).toBe(0);
      expect(progress.readyTasks).toBe(0);
      expect(progress.blockedTasks).toBe(0);
    });

    it('should calculate correct completion percentage', async () => {
      // Use completed workflow so tasks statuses are preserved
      const workflow = await createTestWorkflow({ status: WorkflowStatus.COMPLETED });
      await api.create(toCreateInput(workflow));

      // Create 4 tasks: 2 closed, 2 open
      const closedTask1 = await createTestTask({ title: 'Closed 1', status: TaskStatus.CLOSED });
      const closedTask2 = await createTestTask({ title: 'Closed 2', status: TaskStatus.CLOSED });
      const openTask1 = await createTestTask({ title: 'Open 1', status: TaskStatus.OPEN });
      const openTask2 = await createTestTask({ title: 'Open 2', status: TaskStatus.OPEN });

      for (const task of [closedTask1, closedTask2, openTask1, openTask2]) {
        await api.create(toCreateInput(task));
        await api.addDependency({
          sourceId: task.id,
          targetId: workflow.id,
          type: DependencyType.PARENT_CHILD,
        });
      }

      const progress = await api.getWorkflowProgress(workflow.id);
      expect(progress.totalTasks).toBe(4);
      expect(progress.completionPercentage).toBe(50); // 2/4 = 50%
      expect(progress.statusCounts.closed).toBe(2);
      expect(progress.statusCounts.open).toBe(2);
    });

    it('should count ready and blocked tasks correctly', async () => {
      // Use completed workflow
      const workflow = await createTestWorkflow({ status: WorkflowStatus.COMPLETED });
      await api.create(toCreateInput(workflow));

      const readyTask = await createTestTask({ title: 'Ready Task', status: TaskStatus.OPEN });
      const blockerTask = await createTestTask({ title: 'Blocker Task', status: TaskStatus.OPEN });
      const blockedTask = await createTestTask({ title: 'Blocked Task', status: TaskStatus.OPEN });

      await api.create(toCreateInput(readyTask));
      await api.create(toCreateInput(blockerTask));
      await api.create(toCreateInput(blockedTask));

      for (const task of [readyTask, blockerTask, blockedTask]) {
        await api.addDependency({
          sourceId: task.id,
          targetId: workflow.id,
          type: DependencyType.PARENT_CHILD,
        });
      }

      // Add blocking dependency
      await api.addDependency({
        sourceId: blockedTask.id,
        targetId: blockerTask.id,
        type: DependencyType.BLOCKS,
      });

      const progress = await api.getWorkflowProgress(workflow.id);
      expect(progress.totalTasks).toBe(3);
      expect(progress.readyTasks).toBe(2); // readyTask and blockerTask
      expect(progress.blockedTasks).toBe(1); // blockedTask
    });

    it('should throw NotFoundError for non-existent workflow', async () => {
      await expect(api.getWorkflowProgress('el-nonexistent' as ElementId)).rejects.toThrow('Workflow not found');
    });
  });

  // ==========================================================================
  // Ephemeral Filtering Tests
  // ==========================================================================

  describe('Ephemeral Filtering', () => {
    it('should exclude ephemeral workflow tasks from ready() by default', async () => {
      // Create an ephemeral workflow
      const ephemeralWorkflow = await createTestWorkflow({
        title: 'Ephemeral Workflow',
        ephemeral: true,
        status: WorkflowStatus.COMPLETED, // Completed so tasks aren't blocked
      });
      await api.create(toCreateInput(ephemeralWorkflow));

      // Create a durable workflow
      const durableWorkflow = await createTestWorkflow({
        title: 'Durable Workflow',
        ephemeral: false,
        status: WorkflowStatus.COMPLETED,
      });
      await api.create(toCreateInput(durableWorkflow));

      // Create tasks for each workflow
      const ephemeralTask = await createTestTask({ title: 'Ephemeral Task' });
      const durableTask = await createTestTask({ title: 'Durable Task' });
      const standaloneTask = await createTestTask({ title: 'Standalone Task' });

      await api.create(toCreateInput(ephemeralTask));
      await api.create(toCreateInput(durableTask));
      await api.create(toCreateInput(standaloneTask));

      // Link tasks to workflows
      await api.addDependency({
        sourceId: ephemeralTask.id,
        targetId: ephemeralWorkflow.id,
        type: DependencyType.PARENT_CHILD,
      });
      await api.addDependency({
        sourceId: durableTask.id,
        targetId: durableWorkflow.id,
        type: DependencyType.PARENT_CHILD,
      });

      // Check ready() without includeEphemeral
      const readyTasks = await api.ready();
      expect(readyTasks.map((t) => t.id)).not.toContain(ephemeralTask.id);
      expect(readyTasks.map((t) => t.id)).toContain(durableTask.id);
      expect(readyTasks.map((t) => t.id)).toContain(standaloneTask.id);
    });

    it('should include ephemeral workflow tasks when includeEphemeral is true', async () => {
      // Create an ephemeral workflow
      const ephemeralWorkflow = await createTestWorkflow({
        title: 'Ephemeral Workflow',
        ephemeral: true,
        status: WorkflowStatus.COMPLETED, // Completed so tasks aren't blocked
      });
      await api.create(toCreateInput(ephemeralWorkflow));

      // Create a task for the ephemeral workflow
      const ephemeralTask = await createTestTask({ title: 'Ephemeral Task' });
      await api.create(toCreateInput(ephemeralTask));

      await api.addDependency({
        sourceId: ephemeralTask.id,
        targetId: ephemeralWorkflow.id,
        type: DependencyType.PARENT_CHILD,
      });

      // Check ready() with includeEphemeral
      const readyTasks = await api.ready({ includeEphemeral: true });
      expect(readyTasks.map((t) => t.id)).toContain(ephemeralTask.id);
    });
  });

  // ==========================================================================
  // Full Pour Flow Integration Tests
  // ==========================================================================

  describe('Full Pour Flow Integration', () => {
    /**
     * Helper to create a test playbook
     */
    async function createTestPlaybook(
      overrides: Partial<Parameters<typeof createPlaybook>[0]> = {}
    ): Promise<Playbook> {
      return createPlaybook({
        name: 'test_playbook',
        title: 'Test Playbook',
        createdBy: mockEntityId,
        steps: [],
        variables: [],
        ...overrides,
      });
    }

    /**
     * Helper to persist pour result to database
     */
    async function persistPourResult(
      pourResult: Awaited<ReturnType<typeof pourWorkflow>>
    ): Promise<void> {
      // Create workflow
      await api.create(toCreateInput(pourResult.workflow));

      // Create tasks
      for (const { task } of pourResult.tasks) {
        await api.create(toCreateInput(task));
      }

      // Create parent-child dependencies
      for (const dep of pourResult.parentChildDependencies) {
        await api.addDependency({
          sourceId: dep.sourceId,
          targetId: dep.targetId,
          type: dep.type,
        });
      }

      // Create blocks dependencies - SWAP source/target because pourWorkflow
      // uses opposite semantics (sourceId=blocker, targetId=blocked) vs
      // the system (sourceId=blocked, targetId=blocker)
      for (const dep of pourResult.blocksDependencies) {
        await api.addDependency({
          sourceId: dep.targetId,  // blocked task (was targetId in pourWorkflow)
          targetId: dep.sourceId,  // blocker task (was sourceId in pourWorkflow)
          type: dep.type,
        });
      }
    }

    it('should pour workflow with steps and persist to database', async () => {
      const playbook = await createTestPlaybook({
        title: 'Deployment Pipeline',
        steps: [
          { id: 'setup', title: 'Setup Environment' },
          { id: 'build', title: 'Build Application' },
          { id: 'test', title: 'Run Tests' },
        ],
      });

      const pourResult = await pourWorkflow({
        playbook,
        variables: {},
        createdBy: mockEntityId,
      });

      await persistPourResult(pourResult);

      // Verify workflow was created
      const workflow = await api.get(pourResult.workflow.id);
      expect(workflow.type).toBe('workflow');
      expect(workflow.title).toBe('Deployment Pipeline');

      // Verify all tasks were created
      const tasks = await api.getTasksInWorkflow(pourResult.workflow.id);
      expect(tasks).toHaveLength(3);
      expect(tasks.map((t) => t.title)).toContain('Setup Environment');
      expect(tasks.map((t) => t.title)).toContain('Build Application');
      expect(tasks.map((t) => t.title)).toContain('Run Tests');
    });

    it('should pour workflow with dependencies and verify blocked/ready tasks', async () => {
      const playbook = await createTestPlaybook({
        title: 'Sequential Pipeline',
        steps: [
          { id: 'setup', title: 'Setup' },
          { id: 'build', title: 'Build', dependsOn: ['setup'] },
          { id: 'test', title: 'Test', dependsOn: ['build'] },
          { id: 'deploy', title: 'Deploy', dependsOn: ['test'] },
        ],
      });

      const pourResult = await pourWorkflow({
        playbook,
        variables: {},
        createdBy: mockEntityId,
      });

      await persistPourResult(pourResult);

      // Verify dependency chain
      expect(pourResult.blocksDependencies).toHaveLength(3);

      // Update workflow to COMPLETED so tasks aren't blocked by parent-child dependency
      await api.update(pourResult.workflow.id, { status: WorkflowStatus.COMPLETED } as Partial<Workflow>);

      // Get ready tasks - only 'setup' should be ready (others blocked by step dependencies)
      const readyTasks = await api.getReadyTasksInWorkflow(pourResult.workflow.id);
      expect(readyTasks).toHaveLength(1);
      expect(readyTasks[0].title).toBe('Setup');

      // Get progress
      const progress = await api.getWorkflowProgress(pourResult.workflow.id);
      expect(progress.totalTasks).toBe(4);
      expect(progress.readyTasks).toBe(1);
      expect(progress.blockedTasks).toBe(3);
    });

    it('should pour workflow with variables and verify substitution in persisted data', async () => {
      const playbook = await createTestPlaybook({
        title: 'Deploy {{environment}}',
        variables: [
          { name: 'environment', type: VariableType.STRING, required: true },
          { name: 'version', type: VariableType.STRING, required: false, default: '1.0.0' },
        ],
        steps: [
          { id: 'deploy', title: 'Deploy {{version}} to {{environment}}' },
        ],
      });

      const pourResult = await pourWorkflow({
        playbook,
        variables: { environment: 'production', version: '2.0.0' },
        createdBy: mockEntityId,
      });

      await persistPourResult(pourResult);

      // Verify workflow title has substitution
      const workflow = await api.get(pourResult.workflow.id);
      expect(workflow.title).toBe('Deploy production');

      // Verify task title has substitution
      const tasks = await api.getTasksInWorkflow(pourResult.workflow.id);
      expect(tasks[0].title).toBe('Deploy 2.0.0 to production');

      // Verify variables stored in workflow
      expect((workflow as Workflow).variables).toEqual({ environment: 'production', version: '2.0.0' });
    });

    it('should pour workflow with conditions and verify filtered steps are not persisted', async () => {
      const playbook = await createTestPlaybook({
        title: 'Conditional Pipeline',
        variables: [
          { name: 'runTests', type: VariableType.BOOLEAN, required: false, default: true },
          { name: 'runLint', type: VariableType.BOOLEAN, required: false, default: false },
        ],
        steps: [
          { id: 'build', title: 'Build' },
          { id: 'test', title: 'Run Tests', condition: '{{runTests}}' },
          { id: 'lint', title: 'Run Linting', condition: '{{runLint}}' },
          { id: 'deploy', title: 'Deploy' },
        ],
      });

      const pourResult = await pourWorkflow({
        playbook,
        variables: { runTests: true, runLint: false },
        createdBy: mockEntityId,
      });

      await persistPourResult(pourResult);

      // Verify skipped steps
      expect(pourResult.skippedSteps).toEqual(['lint']);

      // Verify only non-skipped tasks were created
      const tasks = await api.getTasksInWorkflow(pourResult.workflow.id);
      expect(tasks).toHaveLength(3);
      expect(tasks.map((t) => t.title)).toContain('Build');
      expect(tasks.map((t) => t.title)).toContain('Run Tests');
      expect(tasks.map((t) => t.title)).toContain('Deploy');
      expect(tasks.map((t) => t.title)).not.toContain('Run Linting');
    });

    it('should pour ephemeral workflow and verify ephemeral filtering', async () => {
      const playbook = await createTestPlaybook({
        title: 'Ephemeral Test',
        steps: [{ id: 'step1', title: 'Ephemeral Task' }],
      });

      const pourResult = await pourWorkflow({
        playbook,
        variables: {},
        createdBy: mockEntityId,
        ephemeral: true,
      });

      await persistPourResult(pourResult);

      // Verify workflow is ephemeral
      const workflow = await api.get(pourResult.workflow.id) as Workflow;
      expect(workflow.ephemeral).toBe(true);

      // Update workflow status to COMPLETED so tasks aren't blocked by parent-child
      await api.update(pourResult.workflow.id, { status: WorkflowStatus.COMPLETED } as Partial<Workflow>);

      // Ephemeral tasks should not appear in regular ready() query
      const readyTasks = await api.ready();
      expect(readyTasks.map((t) => t.id)).not.toContain(pourResult.tasks[0].task.id);

      // But should appear with includeEphemeral flag
      const allReadyTasks = await api.ready({ includeEphemeral: true });
      expect(allReadyTasks.map((t) => t.id)).toContain(pourResult.tasks[0].task.id);
    });

    it('should pour workflow and verify hierarchical task IDs', async () => {
      const playbook = await createTestPlaybook({
        title: 'Hierarchical IDs Test',
        steps: [
          { id: 'step1', title: 'First Step' },
          { id: 'step2', title: 'Second Step' },
          { id: 'step3', title: 'Third Step' },
        ],
      });

      const pourResult = await pourWorkflow({
        playbook,
        variables: {},
        createdBy: mockEntityId,
      });

      await persistPourResult(pourResult);

      // Verify hierarchical IDs
      const workflowId = pourResult.workflow.id;
      expect(pourResult.tasks[0].task.id).toBe(`${workflowId}.1`);
      expect(pourResult.tasks[1].task.id).toBe(`${workflowId}.2`);
      expect(pourResult.tasks[2].task.id).toBe(`${workflowId}.3`);

      // Verify tasks are queryable by their hierarchical IDs
      for (const { task } of pourResult.tasks) {
        const retrieved = await api.get(task.id);
        expect(retrieved).toBeDefined();
        expect(retrieved.id).toBe(task.id);
      }
    });

    it('should pour workflow with task priority and complexity from steps', async () => {
      const playbook = await createTestPlaybook({
        title: 'Priority Test',
        steps: [
          { id: 'critical', title: 'Critical Task', priority: 1, complexity: 5 },
          { id: 'normal', title: 'Normal Task', priority: 3, complexity: 2 },
          { id: 'minimal', title: 'Minimal Task', priority: 5, complexity: 1 },
        ],
      });

      const pourResult = await pourWorkflow({
        playbook,
        variables: {},
        createdBy: mockEntityId,
      });

      await persistPourResult(pourResult);

      // Update workflow status to COMPLETED so tasks aren't blocked by parent-child
      await api.update(pourResult.workflow.id, { status: WorkflowStatus.COMPLETED } as Partial<Workflow>);

      // Verify priority and complexity were set
      const tasks = await api.getTasksInWorkflow(pourResult.workflow.id);

      const criticalTask = tasks.find((t) => t.title === 'Critical Task');
      expect(criticalTask?.priority).toBe(1);
      expect(criticalTask?.complexity).toBe(5);

      const normalTask = tasks.find((t) => t.title === 'Normal Task');
      expect(normalTask?.priority).toBe(3);
      expect(normalTask?.complexity).toBe(2);

      const minimalTask = tasks.find((t) => t.title === 'Minimal Task');
      expect(minimalTask?.priority).toBe(5);
      expect(minimalTask?.complexity).toBe(1);

      // Verify priority ordering in ready tasks
      const readyTasks = await api.getReadyTasksInWorkflow(pourResult.workflow.id);
      // Should be sorted by priority (lower number = higher priority)
      expect(readyTasks[0].title).toBe('Critical Task');
    });

    it('should pour workflow and track workflow status through task completion', async () => {
      const playbook = await createTestPlaybook({
        title: 'Status Tracking Test',
        steps: [
          { id: 'step1', title: 'First Task' },
          { id: 'step2', title: 'Second Task' },
        ],
      });

      const pourResult = await pourWorkflow({
        playbook,
        variables: {},
        createdBy: mockEntityId,
      });

      await persistPourResult(pourResult);

      // Initial status should be pending
      let workflow = (await api.get(pourResult.workflow.id)) as Workflow;
      expect(workflow.status).toBe(WorkflowStatus.PENDING);

      // Get task IDs
      const tasks = await api.getTasksInWorkflow(pourResult.workflow.id);

      // Start first task (in_progress)
      await api.update(tasks[0].id, { status: TaskStatus.IN_PROGRESS });

      // Compute workflow status - should be RUNNING
      const tasksAfterStart = await api.getTasksInWorkflow(pourResult.workflow.id);
      let computedStatus = computeWorkflowStatus(workflow, tasksAfterStart);
      expect(computedStatus).toBe(WorkflowStatus.RUNNING);

      // Close first task
      await api.update(tasks[0].id, { status: TaskStatus.CLOSED });

      // Update workflow to running status
      await api.update(pourResult.workflow.id, { status: WorkflowStatus.RUNNING });
      workflow = (await api.get(pourResult.workflow.id)) as Workflow;

      // Close second task
      await api.update(tasks[1].id, { status: TaskStatus.CLOSED });

      // Compute workflow status - should now be COMPLETED
      const tasksAfterComplete = await api.getTasksInWorkflow(pourResult.workflow.id);
      computedStatus = computeWorkflowStatus(workflow, tasksAfterComplete);
      expect(computedStatus).toBe(WorkflowStatus.COMPLETED);
    });

    it('should pour workflow with parallel tasks (diamond dependency pattern)', async () => {
      // Diamond pattern: start -> parallel1, parallel2 -> end
      const playbook = await createTestPlaybook({
        title: 'Diamond Pattern',
        steps: [
          { id: 'start', title: 'Start' },
          { id: 'parallel1', title: 'Parallel Task 1', dependsOn: ['start'] },
          { id: 'parallel2', title: 'Parallel Task 2', dependsOn: ['start'] },
          { id: 'end', title: 'End', dependsOn: ['parallel1', 'parallel2'] },
        ],
      });

      const pourResult = await pourWorkflow({
        playbook,
        variables: {},
        createdBy: mockEntityId,
      });

      await persistPourResult(pourResult);

      // Verify dependencies (should have 4: start->p1, start->p2, p1->end, p2->end)
      expect(pourResult.blocksDependencies).toHaveLength(4);

      // Update workflow to COMPLETED so tasks aren't blocked by parent-child
      await api.update(pourResult.workflow.id, { status: WorkflowStatus.COMPLETED } as Partial<Workflow>);

      // Initially only 'start' should be ready
      let readyTasks = await api.getReadyTasksInWorkflow(pourResult.workflow.id);
      expect(readyTasks).toHaveLength(1);
      expect(readyTasks[0].title).toBe('Start');

      // Close 'start' task
      const startTask = pourResult.tasks.find((t) => t.stepId === 'start')!;
      await api.update(startTask.task.id, { status: TaskStatus.CLOSED } as Partial<Task>);

      // Now both parallel tasks should be ready
      readyTasks = await api.getReadyTasksInWorkflow(pourResult.workflow.id);
      expect(readyTasks).toHaveLength(2);
      expect(readyTasks.map((t) => t.title)).toContain('Parallel Task 1');
      expect(readyTasks.map((t) => t.title)).toContain('Parallel Task 2');

      // Close one parallel task
      const parallel1 = pourResult.tasks.find((t) => t.stepId === 'parallel1')!;
      await api.update(parallel1.task.id, { status: TaskStatus.CLOSED } as Partial<Task>);

      // 'end' should still be blocked
      readyTasks = await api.getReadyTasksInWorkflow(pourResult.workflow.id);
      expect(readyTasks).toHaveLength(1);
      expect(readyTasks[0].title).toBe('Parallel Task 2');

      // Close other parallel task
      const parallel2 = pourResult.tasks.find((t) => t.stepId === 'parallel2')!;
      await api.update(parallel2.task.id, { status: TaskStatus.CLOSED } as Partial<Task>);

      // Now 'end' should be ready
      readyTasks = await api.getReadyTasksInWorkflow(pourResult.workflow.id);
      expect(readyTasks).toHaveLength(1);
      expect(readyTasks[0].title).toBe('End');
    });

    it('should pour workflow with assignee from step', async () => {
      const playbook = await createTestPlaybook({
        title: 'Assigned Tasks',
        variables: [
          { name: 'reviewer', type: VariableType.STRING, required: true },
        ],
        steps: [
          { id: 'dev', title: 'Development', assignee: 'user:developer' },
          { id: 'review', title: 'Review', assignee: '{{reviewer}}' },
        ],
      });

      const pourResult = await pourWorkflow({
        playbook,
        variables: { reviewer: 'user:senior-dev' },
        createdBy: mockEntityId,
      });

      await persistPourResult(pourResult);

      const tasks = await api.getTasksInWorkflow(pourResult.workflow.id);

      const devTask = tasks.find((t) => t.title === 'Development');
      expect(devTask?.assignee).toBe('user:developer');

      const reviewTask = tasks.find((t) => t.title === 'Review');
      expect(reviewTask?.assignee).toBe('user:senior-dev');
    });

    it('should pour workflow with tags and metadata', async () => {
      const playbook = await createTestPlaybook({
        title: 'Tagged Workflow',
        steps: [{ id: 'step1', title: 'Task' }],
      });

      const pourResult = await pourWorkflow({
        playbook,
        variables: {},
        createdBy: mockEntityId,
        tags: ['deployment', 'production', 'v2-release'],
        metadata: { region: 'us-east-1', team: 'platform' },
      });

      await persistPourResult(pourResult);

      const workflow = (await api.get(pourResult.workflow.id)) as Workflow;
      expect(workflow.tags).toEqual(['deployment', 'production', 'v2-release']);
      expect(workflow.metadata).toEqual({ region: 'us-east-1', team: 'platform' });
    });

    it('should handle workflow progress with mixed task statuses', async () => {
      const playbook = await createTestPlaybook({
        title: 'Progress Tracking',
        steps: [
          { id: 'step1', title: 'Task 1' },
          { id: 'step2', title: 'Task 2' },
          { id: 'step3', title: 'Task 3' },
          { id: 'step4', title: 'Task 4' },
        ],
      });

      const pourResult = await pourWorkflow({
        playbook,
        variables: {},
        createdBy: mockEntityId,
      });

      await persistPourResult(pourResult);

      // Update workflow to COMPLETED so we can modify task statuses freely
      await api.update(pourResult.workflow.id, { status: WorkflowStatus.COMPLETED } as Partial<Workflow>);

      // Set different statuses: 2 closed, 1 open, 1 in_progress
      await api.update(pourResult.tasks[0].task.id, { status: TaskStatus.CLOSED } as Partial<Task>);
      await api.update(pourResult.tasks[1].task.id, { status: TaskStatus.CLOSED } as Partial<Task>);
      await api.update(pourResult.tasks[2].task.id, { status: TaskStatus.IN_PROGRESS } as Partial<Task>);
      // Task 4 stays open

      const progress = await api.getWorkflowProgress(pourResult.workflow.id);
      expect(progress.totalTasks).toBe(4);
      expect(progress.completionPercentage).toBe(50); // 2/4
      expect(progress.statusCounts.closed).toBe(2);
      expect(progress.statusCounts.open).toBe(1);
      expect(progress.statusCounts.in_progress).toBe(1);
    });
  });
});

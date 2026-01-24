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
});

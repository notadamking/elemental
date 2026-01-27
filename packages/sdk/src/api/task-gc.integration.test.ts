/**
 * Task Garbage Collection Integration Tests
 *
 * Tests for the garbageCollectTasks() API method:
 * - Deleting ephemeral tasks in terminal state
 * - Age-based filtering
 * - Excluding tasks that belong to workflows
 * - Dry-run mode
 * - Dependency cleanup
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { ElementalAPIImpl } from './elemental-api.js';
import { createStorage, initializeSchema } from '@elemental/storage';
import type { StorageBackend } from '@elemental/storage';
import type { Element, ElementId, EntityId, Timestamp, Task, Workflow } from '@elemental/core';
import { createTask, TaskStatus, updateTaskStatus, createWorkflow, DependencyType } from '@elemental/core';

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

/**
 * Create an ephemeral task in closed state with a specific closedAt time
 */
async function createClosedEphemeralTask(
  id: string,
  closedAtDate: Date,
  title?: string
): Promise<Task> {
  const task = await createTestTask({
    id: id as ElementId,
    title: title ?? `Ephemeral Task ${id}`,
    ephemeral: true,
  });

  // Close the task
  const closedTask = updateTaskStatus(task, {
    status: TaskStatus.CLOSED,
  });

  // Override closedAt with specific time
  return {
    ...closedTask,
    closedAt: closedAtDate.toISOString() as Timestamp,
  };
}

/**
 * Create a durable (non-ephemeral) task in closed state
 */
async function createClosedDurableTask(id: string, closedAtDate: Date): Promise<Task> {
  const task = await createTestTask({
    id: id as ElementId,
    title: `Durable Task ${id}`,
    ephemeral: false,
  });

  const closedTask = updateTaskStatus(task, {
    status: TaskStatus.CLOSED,
  });

  return {
    ...closedTask,
    closedAt: closedAtDate.toISOString() as Timestamp,
  };
}

/**
 * Create an ephemeral tombstoned task
 */
async function createTombstonedEphemeralTask(
  id: string,
  deletedAtDate: Date
): Promise<Task> {
  const task = await createTestTask({
    id: id as ElementId,
    title: `Tombstoned Task ${id}`,
    ephemeral: true,
  });

  // Override to tombstone state with specific deletedAt
  return {
    ...task,
    status: TaskStatus.TOMBSTONE,
    deletedAt: deletedAtDate.toISOString() as Timestamp,
    deletedBy: mockEntityId,
  };
}

// ============================================================================
// Integration Tests
// ============================================================================

describe('Task Garbage Collection Integration', () => {
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
  // Basic GC Tests
  // ==========================================================================

  describe('basic garbage collection', () => {
    it('should return zero counts when no tasks exist', async () => {
      const result = await api.garbageCollectTasks({
        maxAgeMs: 0,
      });

      expect(result.tasksDeleted).toBe(0);
      expect(result.dependenciesDeleted).toBe(0);
      expect(result.deletedTaskIds).toHaveLength(0);
    });

    it('should not delete open ephemeral tasks', async () => {
      const task = await createTestTask({
        ephemeral: true,
        status: TaskStatus.OPEN,
      });
      await api.create(toCreateInput(task));

      const result = await api.garbageCollectTasks({
        maxAgeMs: 0,
      });

      expect(result.tasksDeleted).toBe(0);

      // Verify task still exists
      const stillExists = await api.get(task.id);
      expect(stillExists).not.toBeNull();
    });

    it('should not delete in-progress ephemeral tasks', async () => {
      const task = await createTestTask({
        ephemeral: true,
        status: TaskStatus.IN_PROGRESS,
      });
      await api.create(toCreateInput(task));

      const result = await api.garbageCollectTasks({
        maxAgeMs: 0,
      });

      expect(result.tasksDeleted).toBe(0);
    });

    it('should delete closed ephemeral tasks old enough', async () => {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const task = await createClosedEphemeralTask('el-old1', oneHourAgo);
      await api.create(toCreateInput(task));

      // GC with 30 minute threshold
      const result = await api.garbageCollectTasks({
        maxAgeMs: 30 * 60 * 1000,
      });

      expect(result.tasksDeleted).toBe(1);
      expect(result.deletedTaskIds).toContain(task.id);

      // Verify task is deleted
      const deleted = await api.get(task.id);
      expect(deleted).toBeNull();
    });

    it('should not delete closed ephemeral tasks that are too new', async () => {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      const task = await createClosedEphemeralTask('el-new1', fiveMinutesAgo);
      await api.create(toCreateInput(task));

      // GC with 1 hour threshold
      const result = await api.garbageCollectTasks({
        maxAgeMs: 60 * 60 * 1000,
      });

      expect(result.tasksDeleted).toBe(0);

      // Verify task still exists
      const stillExists = await api.get(task.id);
      expect(stillExists).not.toBeNull();
    });

    it('should not delete closed durable tasks', async () => {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const task = await createClosedDurableTask('el-durable1', oneHourAgo);
      await api.create(toCreateInput(task));

      // GC with 0 threshold (should delete anything old enough)
      const result = await api.garbageCollectTasks({
        maxAgeMs: 0,
      });

      expect(result.tasksDeleted).toBe(0);

      // Verify task still exists
      const stillExists = await api.get(task.id);
      expect(stillExists).not.toBeNull();
    });
  });

  // ==========================================================================
  // Workflow Exclusion Tests
  // ==========================================================================

  describe('workflow task exclusion', () => {
    it('should not delete ephemeral tasks that belong to a workflow', async () => {
      // Create a workflow
      const workflow = await createTestWorkflow({ ephemeral: true });
      await api.create(toCreateInput(workflow));

      // Create a task
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const task = await createClosedEphemeralTask('el-wftask1', oneHourAgo);
      await api.create(toCreateInput(task));

      // Link task to workflow via parent-child dependency
      await api.addDependency({
        sourceId: task.id,
        targetId: workflow.id,
        type: DependencyType.PARENT_CHILD,
      });

      // GC with 0 threshold
      const result = await api.garbageCollectTasks({
        maxAgeMs: 0,
      });

      expect(result.tasksDeleted).toBe(0);

      // Verify task still exists
      const stillExists = await api.get(task.id);
      expect(stillExists).not.toBeNull();
    });

    it('should delete standalone ephemeral tasks while preserving workflow tasks', async () => {
      // Create a workflow
      const workflow = await createTestWorkflow({ ephemeral: true });
      await api.create(toCreateInput(workflow));

      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

      // Create a task linked to workflow
      const workflowTask = await createClosedEphemeralTask('el-wftask2', oneHourAgo, 'Workflow Task');
      await api.create(toCreateInput(workflowTask));
      await api.addDependency({
        sourceId: workflowTask.id,
        targetId: workflow.id,
        type: DependencyType.PARENT_CHILD,
      });

      // Create a standalone task
      const standaloneTask = await createClosedEphemeralTask('el-standalone1', oneHourAgo, 'Standalone Task');
      await api.create(toCreateInput(standaloneTask));

      // GC with 0 threshold
      const result = await api.garbageCollectTasks({
        maxAgeMs: 0,
      });

      expect(result.tasksDeleted).toBe(1);
      expect(result.deletedTaskIds).toContain(standaloneTask.id);
      expect(result.deletedTaskIds).not.toContain(workflowTask.id);

      // Verify standalone task is deleted
      const deletedStandalone = await api.get(standaloneTask.id);
      expect(deletedStandalone).toBeNull();

      // Verify workflow task still exists
      const stillExistsWorkflow = await api.get(workflowTask.id);
      expect(stillExistsWorkflow).not.toBeNull();
    });
  });

  // ==========================================================================
  // Dry-Run Mode Tests
  // ==========================================================================

  describe('dry-run mode', () => {
    it('should not actually delete tasks in dry-run mode', async () => {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const task = await createClosedEphemeralTask('el-dryrun1', oneHourAgo);
      await api.create(toCreateInput(task));

      // GC with dry-run
      const result = await api.garbageCollectTasks({
        maxAgeMs: 0,
        dryRun: true,
      });

      expect(result.tasksDeleted).toBe(1);
      expect(result.deletedTaskIds).toContain(task.id);

      // Verify task still exists (dry-run)
      const stillExists = await api.get(task.id);
      expect(stillExists).not.toBeNull();
    });

    it('should correctly report what would be deleted in dry-run', async () => {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

      // Create multiple tasks
      const task1 = await createClosedEphemeralTask('el-dry1', oneHourAgo);
      const task2 = await createClosedEphemeralTask('el-dry2', oneHourAgo);
      const task3 = await createTestTask({ ephemeral: true, status: TaskStatus.OPEN }); // Not eligible

      await api.create(toCreateInput(task1));
      await api.create(toCreateInput(task2));
      await api.create(toCreateInput(task3));

      // Add a dependency between task1 and task2
      await api.addDependency({
        sourceId: task1.id,
        targetId: task2.id,
        type: DependencyType.BLOCKS,
      });

      const result = await api.garbageCollectTasks({
        maxAgeMs: 0,
        dryRun: true,
      });

      expect(result.tasksDeleted).toBe(2);
      expect(result.deletedTaskIds).toContain(task1.id);
      expect(result.deletedTaskIds).toContain(task2.id);
      // Dependencies are counted per task (both directions)
      expect(result.dependenciesDeleted).toBeGreaterThanOrEqual(2);
    });
  });

  // ==========================================================================
  // Limit Tests
  // ==========================================================================

  describe('limit option', () => {
    it('should respect the limit option', async () => {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

      // Create 5 eligible tasks
      for (let i = 0; i < 5; i++) {
        const task = await createClosedEphemeralTask(`el-limit${i}`, oneHourAgo);
        await api.create(toCreateInput(task));
      }

      // GC with limit of 2
      const result = await api.garbageCollectTasks({
        maxAgeMs: 0,
        limit: 2,
      });

      expect(result.tasksDeleted).toBe(2);
      expect(result.deletedTaskIds).toHaveLength(2);

      // Verify only 3 tasks remain
      const remaining = await api.list<Task>({ type: 'task' });
      expect(remaining).toHaveLength(3);
    });

    it('should respect limit in dry-run mode', async () => {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

      // Create 5 eligible tasks
      for (let i = 0; i < 5; i++) {
        const task = await createClosedEphemeralTask(`el-drylimit${i}`, oneHourAgo);
        await api.create(toCreateInput(task));
      }

      // Dry-run GC with limit of 3
      const result = await api.garbageCollectTasks({
        maxAgeMs: 0,
        limit: 3,
        dryRun: true,
      });

      expect(result.tasksDeleted).toBe(3);
      expect(result.deletedTaskIds).toHaveLength(3);

      // Verify all 5 tasks still exist (dry-run)
      const remaining = await api.list<Task>({ type: 'task' });
      expect(remaining).toHaveLength(5);
    });
  });

  // ==========================================================================
  // Dependency Cleanup Tests
  // ==========================================================================

  describe('dependency cleanup', () => {
    it('should delete dependencies when deleting tasks', async () => {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

      const task1 = await createClosedEphemeralTask('el-dep1', oneHourAgo);
      const task2 = await createClosedEphemeralTask('el-dep2', oneHourAgo);
      await api.create(toCreateInput(task1));
      await api.create(toCreateInput(task2));

      // Create dependency between tasks
      await api.addDependency({
        sourceId: task1.id,
        targetId: task2.id,
        type: DependencyType.BLOCKS,
      });

      // Verify dependency exists
      const depsBefore = await api.getDependencies(task1.id);
      expect(depsBefore.some(d => d.targetId === task2.id)).toBe(true);

      // GC
      const result = await api.garbageCollectTasks({
        maxAgeMs: 0,
      });

      expect(result.tasksDeleted).toBe(2);
      expect(result.dependenciesDeleted).toBeGreaterThan(0);
    });

    it('should handle tasks with dependencies to non-ephemeral tasks', async () => {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

      // Create an ephemeral closed task
      const ephemeralTask = await createClosedEphemeralTask('el-eph1', oneHourAgo);
      await api.create(toCreateInput(ephemeralTask));

      // Create a durable task
      const durableTask = await createTestTask({
        id: 'el-dur1' as ElementId,
        ephemeral: false,
      });
      await api.create(toCreateInput(durableTask));

      // Create dependency from ephemeral to durable
      await api.addDependency({
        sourceId: ephemeralTask.id,
        targetId: durableTask.id,
        type: DependencyType.BLOCKS,
      });

      // GC
      const result = await api.garbageCollectTasks({
        maxAgeMs: 0,
      });

      expect(result.tasksDeleted).toBe(1);
      expect(result.deletedTaskIds).toContain(ephemeralTask.id);

      // Verify durable task still exists
      const durableStillExists = await api.get(durableTask.id);
      expect(durableStillExists).not.toBeNull();
    });
  });

  // ==========================================================================
  // Tombstone Task Tests
  // ==========================================================================

  describe('tombstone tasks', () => {
    it('should delete tombstoned ephemeral tasks using deletedAt for age', async () => {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

      const task = await createTombstonedEphemeralTask('el-tomb1', oneHourAgo);
      await api.create(toCreateInput(task));

      // GC with 30 minute threshold
      const result = await api.garbageCollectTasks({
        maxAgeMs: 30 * 60 * 1000,
      });

      expect(result.tasksDeleted).toBe(1);
      expect(result.deletedTaskIds).toContain(task.id);
    });

    it('should not delete tombstoned ephemeral tasks that are too new', async () => {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

      const task = await createTombstonedEphemeralTask('el-tomb2', fiveMinutesAgo);
      await api.create(toCreateInput(task));

      // GC with 1 hour threshold
      const result = await api.garbageCollectTasks({
        maxAgeMs: 60 * 60 * 1000,
      });

      expect(result.tasksDeleted).toBe(0);

      // Verify task still exists
      const stillExists = await api.get(task.id);
      expect(stillExists).not.toBeNull();
    });
  });
});

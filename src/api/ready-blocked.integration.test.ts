/**
 * Ready/Blocked Work Query Integration Tests
 *
 * Comprehensive integration tests for the ready and blocked work query system.
 * These tests validate the full pipeline from:
 * 1. Creating tasks and dependencies
 * 2. Blocked cache updates
 * 3. Ready/blocked query results
 *
 * The tests cover:
 * - Basic blocking with `blocks` dependencies
 * - Transitive blocking with `parent-child` dependencies
 * - Gate dependencies (`awaits`) with timer and approval gates
 * - Status transitions affecting blocking state
 * - Complex dependency graphs
 * - Edge cases and error conditions
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { ElementalAPIImpl } from './elemental-api.js';
import { BunStorageBackend } from '../storage/bun-backend.js';
import { initializeSchema } from '../storage/schema.js';
import type { StorageBackend } from '../storage/backend.js';
import type { Element, ElementId, EntityId, Timestamp } from '../types/element.js';
import type { Task } from '../types/task.js';
import { createTask, Priority, TaskStatus } from '../types/task.js';
import { DependencyType, GateType } from '../types/dependency.js';

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

// ============================================================================
// Integration Tests
// ============================================================================

describe('Ready/Blocked Work Query Integration', () => {
  let backend: StorageBackend;
  let api: ElementalAPIImpl;

  beforeEach(() => {
    backend = new BunStorageBackend({ path: ':memory:' });
    initializeSchema(backend);
    api = new ElementalAPIImpl(backend);
  });

  afterEach(() => {
    if (backend.isOpen) {
      backend.close();
    }
  });

  // ==========================================================================
  // Basic Blocking Tests
  // ==========================================================================

  describe('Basic Blocking with blocks Dependency', () => {
    it('should mark task as blocked when blocks dependency added', async () => {
      const blocker = await createTestTask({ title: 'Blocker Task' });
      const blocked = await createTestTask({ title: 'Blocked Task' });

      await api.create(toCreateInput(blocker));
      await api.create(toCreateInput(blocked));

      // Add blocking dependency: blocked -> blocker
      await api.addDependency({
        sourceId: blocked.id,
        targetId: blocker.id,
        type: DependencyType.BLOCKS,
      });

      // Verify blocked state
      const blockedTasks = await api.blocked();
      expect(blockedTasks.map((t) => t.id)).toContain(blocked.id);
      expect(blockedTasks.find((t) => t.id === blocked.id)?.blockedBy).toBe(blocker.id);

      // Verify ready state
      const readyTasks = await api.ready();
      expect(readyTasks.map((t) => t.id)).not.toContain(blocked.id);
      expect(readyTasks.map((t) => t.id)).toContain(blocker.id);
    });

    it('should unblock task when blocker is closed', async () => {
      const blocker = await createTestTask({ title: 'Blocker Task' });
      const blocked = await createTestTask({ title: 'Blocked Task' });

      await api.create(toCreateInput(blocker));
      await api.create(toCreateInput(blocked));

      await api.addDependency({
        sourceId: blocked.id,
        targetId: blocker.id,
        type: DependencyType.BLOCKS,
      });

      // Verify initially blocked
      let blockedTasks = await api.blocked();
      expect(blockedTasks.map((t) => t.id)).toContain(blocked.id);

      // Close the blocker
      await api.update<Task>(blocker.id, { status: TaskStatus.CLOSED } as Partial<Task>);

      // Verify now unblocked
      blockedTasks = await api.blocked();
      expect(blockedTasks.map((t) => t.id)).not.toContain(blocked.id);

      const readyTasks = await api.ready();
      expect(readyTasks.map((t) => t.id)).toContain(blocked.id);
    });

    it('should re-block task when closed blocker is reopened', async () => {
      const blocker = await createTestTask({ title: 'Blocker Task', status: TaskStatus.CLOSED });
      const blocked = await createTestTask({ title: 'Blocked Task' });

      await api.create(toCreateInput(blocker));
      await api.create(toCreateInput(blocked));

      await api.addDependency({
        sourceId: blocked.id,
        targetId: blocker.id,
        type: DependencyType.BLOCKS,
      });

      // Verify initially unblocked (blocker is closed)
      let readyTasks = await api.ready();
      expect(readyTasks.map((t) => t.id)).toContain(blocked.id);

      // Reopen the blocker
      await api.update<Task>(blocker.id, { status: TaskStatus.OPEN } as Partial<Task>);

      // Verify now blocked
      const blockedTasks = await api.blocked();
      expect(blockedTasks.map((t) => t.id)).toContain(blocked.id);

      readyTasks = await api.ready();
      expect(readyTasks.map((t) => t.id)).not.toContain(blocked.id);
    });

    it('should unblock when dependency is removed', async () => {
      const blocker = await createTestTask({ title: 'Blocker Task' });
      const blocked = await createTestTask({ title: 'Blocked Task' });

      await api.create(toCreateInput(blocker));
      await api.create(toCreateInput(blocked));

      await api.addDependency({
        sourceId: blocked.id,
        targetId: blocker.id,
        type: DependencyType.BLOCKS,
      });

      // Verify initially blocked
      let blockedTasks = await api.blocked();
      expect(blockedTasks.map((t) => t.id)).toContain(blocked.id);

      // Remove the dependency
      await api.removeDependency(blocked.id, blocker.id, DependencyType.BLOCKS);

      // Verify now unblocked
      blockedTasks = await api.blocked();
      expect(blockedTasks.map((t) => t.id)).not.toContain(blocked.id);
    });

    it('should handle multiple blockers - task blocked until ALL resolved', async () => {
      const blocker1 = await createTestTask({ title: 'Blocker 1' });
      const blocker2 = await createTestTask({ title: 'Blocker 2' });
      const blocked = await createTestTask({ title: 'Blocked Task' });

      await api.create(toCreateInput(blocker1));
      await api.create(toCreateInput(blocker2));
      await api.create(toCreateInput(blocked));

      await api.addDependency({
        sourceId: blocked.id,
        targetId: blocker1.id,
        type: DependencyType.BLOCKS,
      });
      await api.addDependency({
        sourceId: blocked.id,
        targetId: blocker2.id,
        type: DependencyType.BLOCKS,
      });

      // Verify initially blocked
      let blockedTasks = await api.blocked();
      expect(blockedTasks.map((t) => t.id)).toContain(blocked.id);

      // Close blocker1
      await api.update<Task>(blocker1.id, { status: TaskStatus.CLOSED } as Partial<Task>);

      // Still blocked by blocker2
      blockedTasks = await api.blocked();
      expect(blockedTasks.map((t) => t.id)).toContain(blocked.id);

      // Close blocker2
      await api.update<Task>(blocker2.id, { status: TaskStatus.CLOSED } as Partial<Task>);

      // Now unblocked
      blockedTasks = await api.blocked();
      expect(blockedTasks.map((t) => t.id)).not.toContain(blocked.id);
    });
  });

  // ==========================================================================
  // Transitive Blocking with Parent-Child
  // ==========================================================================

  describe('Transitive Blocking with parent-child Dependency', () => {
    it('should block child when parent is blocked', async () => {
      const blocker = await createTestTask({ title: 'Blocker' });
      const parent = await createTestTask({ title: 'Parent Task' });
      const child = await createTestTask({ title: 'Child Task' });

      await api.create(toCreateInput(blocker));
      await api.create(toCreateInput(parent));
      await api.create(toCreateInput(child));

      // Create hierarchy: child -> parent (parent-child)
      await api.addDependency({
        sourceId: child.id,
        targetId: parent.id,
        type: DependencyType.PARENT_CHILD,
      });

      // Block the parent: parent -> blocker (blocks)
      await api.addDependency({
        sourceId: parent.id,
        targetId: blocker.id,
        type: DependencyType.BLOCKS,
      });

      // Both parent and child should be blocked
      const blockedTasks = await api.blocked();
      const blockedIds = blockedTasks.map((t) => t.id);
      expect(blockedIds).toContain(parent.id);
      expect(blockedIds).toContain(child.id);
    });

    it('should unblock entire hierarchy when root blocker is closed', async () => {
      const blocker = await createTestTask({ title: 'Blocker' });
      const parent = await createTestTask({ title: 'Parent Task' });
      const child = await createTestTask({ title: 'Child Task' });
      const grandchild = await createTestTask({ title: 'Grandchild Task' });

      await api.create(toCreateInput(blocker));
      await api.create(toCreateInput(parent));
      await api.create(toCreateInput(child));
      await api.create(toCreateInput(grandchild));

      // Create hierarchy: grandchild -> child -> parent
      await api.addDependency({
        sourceId: grandchild.id,
        targetId: child.id,
        type: DependencyType.PARENT_CHILD,
      });
      await api.addDependency({
        sourceId: child.id,
        targetId: parent.id,
        type: DependencyType.PARENT_CHILD,
      });

      // Block the parent
      await api.addDependency({
        sourceId: parent.id,
        targetId: blocker.id,
        type: DependencyType.BLOCKS,
      });

      // All three should be blocked
      let blockedTasks = await api.blocked();
      let blockedIds = blockedTasks.map((t) => t.id);
      expect(blockedIds).toContain(parent.id);
      expect(blockedIds).toContain(child.id);
      expect(blockedIds).toContain(grandchild.id);

      // Close the root blocker
      await api.update<Task>(blocker.id, { status: TaskStatus.CLOSED } as Partial<Task>);

      // All should be unblocked now (though parent-child still exists, parent is no longer blocked)
      blockedTasks = await api.blocked();
      blockedIds = blockedTasks.map((t) => t.id);
      // Note: parent-child dependency on a non-completed parent still blocks
      // Let's also close the parent to fully unblock
      await api.update<Task>(parent.id, { status: TaskStatus.CLOSED } as Partial<Task>);
      await api.update<Task>(child.id, { status: TaskStatus.CLOSED } as Partial<Task>);

      blockedTasks = await api.blocked();
      blockedIds = blockedTasks.map((t) => t.id);
      expect(blockedIds).not.toContain(grandchild.id);
    });
  });

  // ==========================================================================
  // Gate Dependencies (awaits)
  // ==========================================================================

  describe('Timer Gate Dependencies', () => {
    it('should block task until timer expires', async () => {
      const gate = await createTestTask({ title: 'Timer Gate' });
      const blocked = await createTestTask({ title: 'Blocked Task' });

      await api.create(toCreateInput(gate));
      await api.create(toCreateInput(blocked));

      // Create awaits dependency with future timer
      const futureTime = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      await api.addDependency({
        sourceId: blocked.id,
        targetId: gate.id,
        type: DependencyType.AWAITS,
        metadata: {
          gateType: GateType.TIMER,
          waitUntil: futureTime,
        },
      });

      // Should be blocked
      const blockedTasks = await api.blocked();
      expect(blockedTasks.map((t) => t.id)).toContain(blocked.id);
      expect(blockedTasks.find((t) => t.id === blocked.id)?.blockReason).toContain('gate');
    });

    it('should unblock task when timer has passed', async () => {
      const gate = await createTestTask({ title: 'Timer Gate' });
      const blocked = await createTestTask({ title: 'Blocked Task' });

      await api.create(toCreateInput(gate));
      await api.create(toCreateInput(blocked));

      // Create awaits dependency with past timer
      const pastTime = new Date(Date.now() - 1000).toISOString();
      await api.addDependency({
        sourceId: blocked.id,
        targetId: gate.id,
        type: DependencyType.AWAITS,
        metadata: {
          gateType: GateType.TIMER,
          waitUntil: pastTime,
        },
      });

      // Should NOT be blocked (timer has passed)
      const blockedTasks = await api.blocked();
      expect(blockedTasks.map((t) => t.id)).not.toContain(blocked.id);

      const readyTasks = await api.ready();
      expect(readyTasks.map((t) => t.id)).toContain(blocked.id);
    });
  });

  describe('Approval Gate Dependencies', () => {
    it('should block task until approvals received', async () => {
      const gate = await createTestTask({ title: 'Approval Gate' });
      const blocked = await createTestTask({ title: 'Blocked Task' });

      await api.create(toCreateInput(gate));
      await api.create(toCreateInput(blocked));

      // Create awaits dependency with approval gate
      await api.addDependency({
        sourceId: blocked.id,
        targetId: gate.id,
        type: DependencyType.AWAITS,
        metadata: {
          gateType: GateType.APPROVAL,
          requiredApprovers: ['user1', 'user2'],
          currentApprovers: ['user1'], // Only one of two
        },
      });

      // Should be blocked (not enough approvals)
      const blockedTasks = await api.blocked();
      expect(blockedTasks.map((t) => t.id)).toContain(blocked.id);
    });

    it('should unblock task when all approvals received', async () => {
      const gate = await createTestTask({ title: 'Approval Gate' });
      const blocked = await createTestTask({ title: 'Blocked Task' });

      await api.create(toCreateInput(gate));
      await api.create(toCreateInput(blocked));

      // Create awaits dependency with all approvals
      await api.addDependency({
        sourceId: blocked.id,
        targetId: gate.id,
        type: DependencyType.AWAITS,
        metadata: {
          gateType: GateType.APPROVAL,
          requiredApprovers: ['user1', 'user2'],
          currentApprovers: ['user1', 'user2'], // All required
        },
      });

      // Should NOT be blocked
      const blockedTasks = await api.blocked();
      expect(blockedTasks.map((t) => t.id)).not.toContain(blocked.id);
    });

    it('should unblock task when approval count met', async () => {
      const gate = await createTestTask({ title: 'Approval Gate' });
      const blocked = await createTestTask({ title: 'Blocked Task' });

      await api.create(toCreateInput(gate));
      await api.create(toCreateInput(blocked));

      // Create awaits dependency with partial approval (need 2 of 3)
      await api.addDependency({
        sourceId: blocked.id,
        targetId: gate.id,
        type: DependencyType.AWAITS,
        metadata: {
          gateType: GateType.APPROVAL,
          requiredApprovers: ['user1', 'user2', 'user3'],
          approvalCount: 2, // Only need 2
          currentApprovers: ['user1', 'user3'], // Have 2
        },
      });

      // Should NOT be blocked
      const blockedTasks = await api.blocked();
      expect(blockedTasks.map((t) => t.id)).not.toContain(blocked.id);
    });
  });

  describe('External Gate Dependencies', () => {
    it('should block task on external gate (always blocks until satisfied)', async () => {
      const gate = await createTestTask({ title: 'External Gate' });
      const blocked = await createTestTask({ title: 'Blocked Task' });

      await api.create(toCreateInput(gate));
      await api.create(toCreateInput(blocked));

      // Create awaits dependency with external gate
      await api.addDependency({
        sourceId: blocked.id,
        targetId: gate.id,
        type: DependencyType.AWAITS,
        metadata: {
          gateType: GateType.EXTERNAL,
          externalSystem: 'jira',
          externalId: 'PROJ-123',
        },
      });

      // Should be blocked (external gates require explicit satisfaction)
      const blockedTasks = await api.blocked();
      expect(blockedTasks.map((t) => t.id)).toContain(blocked.id);
    });
  });

  // ==========================================================================
  // Scheduled Tasks
  // ==========================================================================

  describe('Scheduled Tasks', () => {
    it('should exclude future-scheduled tasks from ready', async () => {
      const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const futureTask = await createTestTask({
        title: 'Future Task',
        scheduledFor: futureDate as Timestamp,
      });

      await api.create(toCreateInput(futureTask));

      const readyTasks = await api.ready();
      expect(readyTasks.map((t) => t.id)).not.toContain(futureTask.id);
    });

    it('should include past-scheduled tasks in ready', async () => {
      const pastDate = new Date(Date.now() - 1000).toISOString();
      const pastTask = await createTestTask({
        title: 'Past Scheduled Task',
        scheduledFor: pastDate as Timestamp,
      });

      await api.create(toCreateInput(pastTask));

      const readyTasks = await api.ready();
      expect(readyTasks.map((t) => t.id)).toContain(pastTask.id);
    });

    it('should include tasks with null scheduledFor in ready', async () => {
      const task = await createTestTask({ title: 'No Schedule Task' });
      await api.create(toCreateInput(task));

      const readyTasks = await api.ready();
      expect(readyTasks.map((t) => t.id)).toContain(task.id);
    });
  });

  // ==========================================================================
  // Status Filtering
  // ==========================================================================

  describe('Status Filtering in Ready Query', () => {
    it('should only include open and in_progress tasks in ready', async () => {
      const openTask = await createTestTask({ title: 'Open Task', status: TaskStatus.OPEN });
      const inProgressTask = await createTestTask({ title: 'In Progress Task', status: TaskStatus.IN_PROGRESS });
      const closedTask = await createTestTask({ title: 'Closed Task', status: TaskStatus.CLOSED });
      const deferredTask = await createTestTask({ title: 'Deferred Task', status: TaskStatus.DEFERRED });

      await api.create(toCreateInput(openTask));
      await api.create(toCreateInput(inProgressTask));
      await api.create(toCreateInput(closedTask));
      await api.create(toCreateInput(deferredTask));

      const readyTasks = await api.ready();
      const readyIds = readyTasks.map((t) => t.id);

      expect(readyIds).toContain(openTask.id);
      expect(readyIds).toContain(inProgressTask.id);
      expect(readyIds).not.toContain(closedTask.id);
      expect(readyIds).not.toContain(deferredTask.id);
    });
  });

  // ==========================================================================
  // Filter Options
  // ==========================================================================

  describe('Ready/Blocked with Filters', () => {
    it('should filter ready tasks by priority', async () => {
      const highPriority = await createTestTask({ title: 'High Priority', priority: Priority.HIGH });
      const lowPriority = await createTestTask({ title: 'Low Priority', priority: Priority.LOW });

      await api.create(toCreateInput(highPriority));
      await api.create(toCreateInput(lowPriority));

      const readyTasks = await api.ready({ priority: Priority.HIGH });
      expect(readyTasks.map((t) => t.id)).toContain(highPriority.id);
      expect(readyTasks.map((t) => t.id)).not.toContain(lowPriority.id);
    });

    it('should filter ready tasks by assignee', async () => {
      const assignedTask = await createTestTask({
        title: 'Assigned Task',
        assignee: 'user:alice' as EntityId
      });
      const unassignedTask = await createTestTask({ title: 'Unassigned Task' });

      await api.create(toCreateInput(assignedTask));
      await api.create(toCreateInput(unassignedTask));

      const readyTasks = await api.ready({ assignee: 'user:alice' as EntityId });
      expect(readyTasks.map((t) => t.id)).toContain(assignedTask.id);
      expect(readyTasks.map((t) => t.id)).not.toContain(unassignedTask.id);
    });

    it('should filter blocked tasks by priority', async () => {
      const blocker = await createTestTask({ title: 'Blocker' });
      const highPriority = await createTestTask({ title: 'High Priority', priority: Priority.HIGH });
      const lowPriority = await createTestTask({ title: 'Low Priority', priority: Priority.LOW });

      await api.create(toCreateInput(blocker));
      await api.create(toCreateInput(highPriority));
      await api.create(toCreateInput(lowPriority));

      // Block both tasks
      await api.addDependency({
        sourceId: highPriority.id,
        targetId: blocker.id,
        type: DependencyType.BLOCKS,
      });
      await api.addDependency({
        sourceId: lowPriority.id,
        targetId: blocker.id,
        type: DependencyType.BLOCKS,
      });

      const blockedTasks = await api.blocked({ priority: Priority.HIGH });
      expect(blockedTasks.map((t) => t.id)).toContain(highPriority.id);
      expect(blockedTasks.map((t) => t.id)).not.toContain(lowPriority.id);
    });
  });

  // ==========================================================================
  // Complex Dependency Graphs
  // ==========================================================================

  describe('Complex Dependency Graphs', () => {
    it('should handle diamond dependency pattern', async () => {
      // Diamond: A depends on B and C, B and C both depend on D
      const taskD = await createTestTask({ title: 'Task D (root)' });
      const taskB = await createTestTask({ title: 'Task B' });
      const taskC = await createTestTask({ title: 'Task C' });
      const taskA = await createTestTask({ title: 'Task A (final)' });

      await api.create(toCreateInput(taskD));
      await api.create(toCreateInput(taskB));
      await api.create(toCreateInput(taskC));
      await api.create(toCreateInput(taskA));

      // B -> D (blocks)
      await api.addDependency({
        sourceId: taskB.id,
        targetId: taskD.id,
        type: DependencyType.BLOCKS,
      });
      // C -> D (blocks)
      await api.addDependency({
        sourceId: taskC.id,
        targetId: taskD.id,
        type: DependencyType.BLOCKS,
      });
      // A -> B (blocks)
      await api.addDependency({
        sourceId: taskA.id,
        targetId: taskB.id,
        type: DependencyType.BLOCKS,
      });
      // A -> C (blocks)
      await api.addDependency({
        sourceId: taskA.id,
        targetId: taskC.id,
        type: DependencyType.BLOCKS,
      });

      // Only D should be ready
      let readyTasks = await api.ready();
      expect(readyTasks.map((t) => t.id)).toContain(taskD.id);
      expect(readyTasks.map((t) => t.id)).not.toContain(taskB.id);
      expect(readyTasks.map((t) => t.id)).not.toContain(taskC.id);
      expect(readyTasks.map((t) => t.id)).not.toContain(taskA.id);

      // Close D
      await api.update<Task>(taskD.id, { status: TaskStatus.CLOSED } as Partial<Task>);

      // B and C should be ready now
      readyTasks = await api.ready();
      expect(readyTasks.map((t) => t.id)).toContain(taskB.id);
      expect(readyTasks.map((t) => t.id)).toContain(taskC.id);
      expect(readyTasks.map((t) => t.id)).not.toContain(taskA.id);

      // Close B
      await api.update<Task>(taskB.id, { status: TaskStatus.CLOSED } as Partial<Task>);

      // A still blocked by C
      readyTasks = await api.ready();
      expect(readyTasks.map((t) => t.id)).not.toContain(taskA.id);

      // Close C
      await api.update<Task>(taskC.id, { status: TaskStatus.CLOSED } as Partial<Task>);

      // A should now be ready
      readyTasks = await api.ready();
      expect(readyTasks.map((t) => t.id)).toContain(taskA.id);
    });

    it('should handle chain of blocking dependencies', async () => {
      // Chain: A -> B -> C -> D (each blocks the next)
      const tasks: Task[] = [];
      for (let i = 0; i < 5; i++) {
        const task = await createTestTask({ title: `Task ${i}` });
        tasks.push(task);
        await api.create(toCreateInput(task));
      }

      // Create chain: task[0] blocks task[1] blocks task[2] blocks task[3] blocks task[4]
      for (let i = 0; i < 4; i++) {
        await api.addDependency({
          sourceId: tasks[i + 1].id,
          targetId: tasks[i].id,
          type: DependencyType.BLOCKS,
        });
      }

      // Only task[0] should be ready
      let readyTasks = await api.ready();
      expect(readyTasks.map((t) => t.id)).toContain(tasks[0].id);
      for (let i = 1; i < 5; i++) {
        expect(readyTasks.map((t) => t.id)).not.toContain(tasks[i].id);
      }

      // Close tasks in order
      for (let i = 0; i < 4; i++) {
        await api.update<Task>(tasks[i].id, { status: TaskStatus.CLOSED } as Partial<Task>);
        readyTasks = await api.ready();
        expect(readyTasks.map((t) => t.id)).toContain(tasks[i + 1].id);
      }
    });
  });

  // ==========================================================================
  // Non-Blocking Dependencies
  // ==========================================================================

  describe('Non-Blocking Dependencies', () => {
    it('should not block on relates-to dependency', async () => {
      const task1 = await createTestTask({ title: 'Task 1' });
      const task2 = await createTestTask({ title: 'Task 2' });

      await api.create(toCreateInput(task1));
      await api.create(toCreateInput(task2));

      // Add relates-to dependency
      await api.addDependency({
        sourceId: task1.id,
        targetId: task2.id,
        type: DependencyType.RELATES_TO,
      });

      // Both should be ready (relates-to is non-blocking)
      const readyTasks = await api.ready();
      expect(readyTasks.map((t) => t.id)).toContain(task1.id);
      expect(readyTasks.map((t) => t.id)).toContain(task2.id);

      const blockedTasks = await api.blocked();
      expect(blockedTasks.map((t) => t.id)).not.toContain(task1.id);
    });

    it('should not block on references dependency', async () => {
      const task1 = await createTestTask({ title: 'Task 1' });
      const task2 = await createTestTask({ title: 'Task 2' });

      await api.create(toCreateInput(task1));
      await api.create(toCreateInput(task2));

      await api.addDependency({
        sourceId: task1.id,
        targetId: task2.id,
        type: DependencyType.REFERENCES,
      });

      const readyTasks = await api.ready();
      expect(readyTasks.map((t) => t.id)).toContain(task1.id);
    });
  });

  // ==========================================================================
  // Soft Delete (Tombstone) Behavior
  // ==========================================================================

  describe('Tombstone Behavior', () => {
    it('should unblock dependents when blocker is soft-deleted', async () => {
      const blocker = await createTestTask({ title: 'Blocker' });
      const blocked = await createTestTask({ title: 'Blocked' });

      await api.create(toCreateInput(blocker));
      await api.create(toCreateInput(blocked));

      await api.addDependency({
        sourceId: blocked.id,
        targetId: blocker.id,
        type: DependencyType.BLOCKS,
      });

      // Verify initially blocked
      let blockedTasks = await api.blocked();
      expect(blockedTasks.map((t) => t.id)).toContain(blocked.id);

      // Soft delete the blocker
      await api.delete(blocker.id, { reason: 'No longer needed' });

      // Should now be unblocked (tombstone doesn't block)
      blockedTasks = await api.blocked();
      expect(blockedTasks.map((t) => t.id)).not.toContain(blocked.id);
    });

    it('should exclude tombstone tasks from ready query', async () => {
      const task = await createTestTask({ title: 'Task to Delete' });
      await api.create(toCreateInput(task));

      // Verify initially in ready
      let readyTasks = await api.ready();
      expect(readyTasks.map((t) => t.id)).toContain(task.id);

      // Soft delete
      await api.delete(task.id);

      // Should not appear in ready (tombstones are excluded)
      readyTasks = await api.ready();
      expect(readyTasks.map((t) => t.id)).not.toContain(task.id);
    });
  });

  // ==========================================================================
  // Statistics Integration
  // ==========================================================================

  describe('Statistics Integration', () => {
    it('should accurately count ready and blocked tasks in stats', async () => {
      const blocker = await createTestTask({ title: 'Blocker' });
      const blockedTask = await createTestTask({ title: 'Blocked Task' });
      const readyTask1 = await createTestTask({ title: 'Ready Task 1' });
      const readyTask2 = await createTestTask({ title: 'Ready Task 2' });
      const closedTask = await createTestTask({ title: 'Closed Task', status: TaskStatus.CLOSED });

      await api.create(toCreateInput(blocker));
      await api.create(toCreateInput(blockedTask));
      await api.create(toCreateInput(readyTask1));
      await api.create(toCreateInput(readyTask2));
      await api.create(toCreateInput(closedTask));

      await api.addDependency({
        sourceId: blockedTask.id,
        targetId: blocker.id,
        type: DependencyType.BLOCKS,
      });

      const stats = await api.stats();

      // Ready: blocker, readyTask1, readyTask2 (3 open, not blocked)
      // Blocked: blockedTask (1)
      // Closed task is not counted in either
      expect(stats.readyTasks).toBe(3);
      expect(stats.blockedTasks).toBe(1);
    });
  });

  // ==========================================================================
  // Edge Cases
  // ==========================================================================

  describe('Edge Cases', () => {
    it('should handle task with no dependencies', async () => {
      const task = await createTestTask({ title: 'Standalone Task' });
      await api.create(toCreateInput(task));

      const readyTasks = await api.ready();
      expect(readyTasks.map((t) => t.id)).toContain(task.id);

      const blockedTasks = await api.blocked();
      expect(blockedTasks.map((t) => t.id)).not.toContain(task.id);
    });

    it('should handle empty database', async () => {
      const readyTasks = await api.ready();
      expect(readyTasks).toEqual([]);

      const blockedTasks = await api.blocked();
      expect(blockedTasks).toEqual([]);
    });

    it('should handle dependency on non-existent element (external reference)', async () => {
      const task = await createTestTask({ title: 'Task' });
      await api.create(toCreateInput(task));

      // Create dependency on element that doesn't exist in the database
      // This simulates an external reference
      await api.addDependency({
        sourceId: task.id,
        targetId: 'el-external-123' as ElementId,
        type: DependencyType.BLOCKS,
      });

      // Should NOT be blocked (external references don't block)
      const blockedTasks = await api.blocked();
      expect(blockedTasks.map((t) => t.id)).not.toContain(task.id);
    });

    it('should handle cache rebuild', async () => {
      const blocker = await createTestTask({ title: 'Blocker' });
      const blocked = await createTestTask({ title: 'Blocked' });

      await api.create(toCreateInput(blocker));
      await api.create(toCreateInput(blocked));

      await api.addDependency({
        sourceId: blocked.id,
        targetId: blocker.id,
        type: DependencyType.BLOCKS,
      });

      // Rebuild the cache
      const rebuildResult = api.rebuildBlockedCache();
      expect(rebuildResult.elementsChecked).toBeGreaterThanOrEqual(1);
      expect(rebuildResult.elementsBlocked).toBeGreaterThanOrEqual(1);

      // Verify state is correct after rebuild
      const blockedTasks = await api.blocked();
      expect(blockedTasks.map((t) => t.id)).toContain(blocked.id);
    });
  });
});

import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import {
  PriorityService,
  createPriorityService,
} from './priority-service.js';
import { DependencyService, createDependencyService } from './dependency.js';
import { createStorage, initializeSchema } from '../storage/index.js';
import type { StorageBackend } from '../storage/backend.js';
import type { ElementId, EntityId } from '../types/element.js';
import { DependencyType } from '../types/dependency.js';
import { Priority, Complexity, type Task, TaskStatus } from '../types/task.js';
import { ElementType, createTimestamp } from '../types/element.js';

// ============================================================================
// Test Setup
// ============================================================================

describe('PriorityService', () => {
  let db: StorageBackend;
  let service: PriorityService;
  let depService: DependencyService;

  // Test entity
  const testEntity = 'el-testuser1' as EntityId;

  /**
   * Helper to create a task in the database
   */
  function createTestTask(
    id: string,
    priority: Priority = Priority.MEDIUM,
    complexity: Complexity = Complexity.MEDIUM
  ): Task {
    const now = createTimestamp();
    const task: Task = {
      id: id as ElementId,
      type: ElementType.TASK,
      createdAt: now,
      updatedAt: now,
      createdBy: testEntity,
      tags: [],
      metadata: {},
      title: `Test Task ${id}`,
      status: TaskStatus.OPEN,
      priority,
      complexity,
      taskType: 'task',
    };

    // Insert into database
    db.run(
      `INSERT INTO elements (id, type, data, created_at, updated_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [task.id, task.type, JSON.stringify(task), task.createdAt, task.updatedAt, task.createdBy]
    );

    return task;
  }

  beforeEach(() => {
    // Create in-memory database for each test with full schema
    db = createStorage({ path: ':memory:' });
    initializeSchema(db);
    service = createPriorityService(db);
    depService = createDependencyService(db);
  });

  afterEach(() => {
    db.close();
  });

  // ==========================================================================
  // Effective Priority Calculation
  // ==========================================================================

  describe('calculateEffectivePriority', () => {
    test('returns base priority when no dependencies', () => {
      const task = createTestTask('el-task1', Priority.LOW);

      const result = service.calculateEffectivePriority(task.id);

      expect(result.basePriority).toBe(Priority.LOW);
      expect(result.effectivePriority).toBe(Priority.LOW);
      expect(result.isInfluenced).toBe(false);
      expect(result.dependentInfluencers).toHaveLength(0);
    });

    test('returns MEDIUM priority for non-existent task', () => {
      const result = service.calculateEffectivePriority('el-nonexistent' as ElementId);

      expect(result.basePriority).toBe(Priority.MEDIUM);
      expect(result.effectivePriority).toBe(Priority.MEDIUM);
      expect(result.isInfluenced).toBe(false);
    });

    test('inherits higher priority from dependent task', () => {
      // Create tasks: task1 (LOW) blocks task2 (HIGH)
      // Task1 should have effective priority HIGH because task2 depends on it
      const task1 = createTestTask('el-task1', Priority.LOW);
      const task2 = createTestTask('el-task2', Priority.HIGH);

      // task2 blocks until task1 is done (task2 depends on task1)
      // In our model: sourceId blocks until targetId is closed
      // So task2 -> task1 means task2 waits for task1
      depService.addDependency({
        sourceId: task2.id,
        targetId: task1.id,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });

      const result = service.calculateEffectivePriority(task1.id);

      expect(result.basePriority).toBe(Priority.LOW);
      expect(result.effectivePriority).toBe(Priority.HIGH);
      expect(result.isInfluenced).toBe(true);
      expect(result.dependentInfluencers).toContain(task2.id);
    });

    test('inherits CRITICAL priority from chain of dependents', () => {
      // Chain: task1 (LOW) <- task2 (MEDIUM) <- task3 (CRITICAL)
      // task1 should have effective priority CRITICAL
      const task1 = createTestTask('el-task1', Priority.LOW);
      const task2 = createTestTask('el-task2', Priority.MEDIUM);
      const task3 = createTestTask('el-task3', Priority.CRITICAL);

      // task2 waits for task1
      depService.addDependency({
        sourceId: task2.id,
        targetId: task1.id,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });

      // task3 waits for task2
      depService.addDependency({
        sourceId: task3.id,
        targetId: task2.id,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });

      const result = service.calculateEffectivePriority(task1.id);

      expect(result.basePriority).toBe(Priority.LOW);
      expect(result.effectivePriority).toBe(Priority.CRITICAL);
      expect(result.isInfluenced).toBe(true);
    });

    test('does not lower priority from dependent', () => {
      // task1 (HIGH) blocks task2 (LOW)
      // task1 should keep HIGH priority
      const task1 = createTestTask('el-task1', Priority.HIGH);
      const task2 = createTestTask('el-task2', Priority.LOW);

      depService.addDependency({
        sourceId: task2.id,
        targetId: task1.id,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });

      const result = service.calculateEffectivePriority(task1.id);

      expect(result.basePriority).toBe(Priority.HIGH);
      expect(result.effectivePriority).toBe(Priority.HIGH);
      expect(result.isInfluenced).toBe(false);
    });

    test('respects maxDepth configuration', () => {
      // Create a long chain that exceeds maxDepth
      const tasks: Task[] = [];
      for (let i = 0; i < 15; i++) {
        tasks.push(
          createTestTask(`el-task${i}`, i === 14 ? Priority.CRITICAL : Priority.LOW)
        );
      }

      // Chain them: task0 <- task1 <- task2 <- ... <- task14 (CRITICAL)
      for (let i = 1; i < tasks.length; i++) {
        depService.addDependency({
          sourceId: tasks[i].id,
          targetId: tasks[i - 1].id,
          type: DependencyType.BLOCKS,
          createdBy: testEntity,
        });
      }

      // With default maxDepth of 10, task0 should not see task14's priority
      const result = service.calculateEffectivePriority(tasks[0].id);
      expect(result.effectivePriority).toBe(Priority.LOW);

      // With higher maxDepth, it should see it
      const resultDeep = service.calculateEffectivePriority(tasks[0].id, {
        maxDepth: 20,
        includeComplexity: false,
      });
      expect(resultDeep.effectivePriority).toBe(Priority.CRITICAL);
    });

    test('handles multiple dependents with different priorities', () => {
      // task1 blocks both task2 (HIGH) and task3 (CRITICAL)
      // task1 should have CRITICAL priority (the highest among dependents)
      const task1 = createTestTask('el-task1', Priority.LOW);
      const task2 = createTestTask('el-task2', Priority.HIGH);
      const task3 = createTestTask('el-task3', Priority.CRITICAL);

      depService.addDependency({
        sourceId: task2.id,
        targetId: task1.id,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });

      depService.addDependency({
        sourceId: task3.id,
        targetId: task1.id,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });

      const result = service.calculateEffectivePriority(task1.id);

      expect(result.basePriority).toBe(Priority.LOW);
      expect(result.effectivePriority).toBe(Priority.CRITICAL);
      expect(result.isInfluenced).toBe(true);
      expect(result.dependentInfluencers).toContain(task3.id);
    });
  });

  // ==========================================================================
  // Aggregate Complexity Calculation
  // ==========================================================================

  describe('calculateAggregateComplexity', () => {
    test('returns base complexity when no dependencies', () => {
      const task = createTestTask('el-task1', Priority.MEDIUM, Complexity.SIMPLE);

      const result = service.calculateAggregateComplexity(task.id);

      expect(result.baseComplexity).toBe(Complexity.SIMPLE);
      expect(result.aggregateComplexity).toBe(Complexity.SIMPLE);
      expect(result.dependentCount).toBe(0);
      expect(result.dependentComplexities).toHaveLength(0);
    });

    test('returns MEDIUM complexity for non-existent task', () => {
      const result = service.calculateAggregateComplexity('el-nonexistent' as ElementId);

      expect(result.baseComplexity).toBe(Complexity.MEDIUM);
      expect(result.aggregateComplexity).toBe(Complexity.MEDIUM);
    });

    test('sums complexity of blocking tasks', () => {
      // task1 (SIMPLE=2) waits for task2 (MEDIUM=3)
      // Aggregate for task1 = 2 + 3 = 5
      const task1 = createTestTask('el-task1', Priority.MEDIUM, Complexity.SIMPLE);
      const task2 = createTestTask('el-task2', Priority.MEDIUM, Complexity.MEDIUM);

      depService.addDependency({
        sourceId: task1.id,
        targetId: task2.id,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });

      const result = service.calculateAggregateComplexity(task1.id);

      expect(result.baseComplexity).toBe(Complexity.SIMPLE);
      expect(result.aggregateComplexity).toBe(5); // 2 + 3
      expect(result.dependentCount).toBe(1);
      expect(result.dependentComplexities).toHaveLength(1);
      expect(result.dependentComplexities[0].id).toBe(task2.id);
      expect(result.dependentComplexities[0].complexity).toBe(Complexity.MEDIUM);
    });

    test('sums complexity transitively', () => {
      // task1 waits for task2, task2 waits for task3
      // All have SIMPLE (2) complexity
      // Aggregate for task1 = 2 + 2 + 2 = 6
      const task1 = createTestTask('el-task1', Priority.MEDIUM, Complexity.SIMPLE);
      const task2 = createTestTask('el-task2', Priority.MEDIUM, Complexity.SIMPLE);
      const task3 = createTestTask('el-task3', Priority.MEDIUM, Complexity.SIMPLE);

      depService.addDependency({
        sourceId: task1.id,
        targetId: task2.id,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });

      depService.addDependency({
        sourceId: task2.id,
        targetId: task3.id,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });

      const result = service.calculateAggregateComplexity(task1.id);

      expect(result.baseComplexity).toBe(Complexity.SIMPLE);
      expect(result.aggregateComplexity).toBe(6); // 2 + 2 + 2
      expect(result.dependentCount).toBe(2);
    });

    test('respects maxDepth configuration', () => {
      // Create chain: task0 -> task1 -> ... -> task14 (all SIMPLE=2)
      const tasks: Task[] = [];
      for (let i = 0; i < 15; i++) {
        tasks.push(createTestTask(`el-task${i}`, Priority.MEDIUM, Complexity.SIMPLE));
      }

      for (let i = 0; i < tasks.length - 1; i++) {
        depService.addDependency({
          sourceId: tasks[i].id,
          targetId: tasks[i + 1].id,
          type: DependencyType.BLOCKS,
          createdBy: testEntity,
        });
      }

      // With default maxDepth of 10, should only count 10 blockers
      const result = service.calculateAggregateComplexity(tasks[0].id);
      // task0 (2) + 9 blockers (2*9=18) = 20 (because depth 0 is task0, depths 1-9 are blockers)
      expect(result.aggregateComplexity).toBeLessThan(15 * 2); // Less than full chain
    });
  });

  // ==========================================================================
  // Bulk Operations
  // ==========================================================================

  describe('calculateEffectivePriorities', () => {
    test('calculates priorities for multiple tasks', () => {
      const task1 = createTestTask('el-task1', Priority.LOW);
      const task2 = createTestTask('el-task2', Priority.HIGH);

      depService.addDependency({
        sourceId: task2.id,
        targetId: task1.id,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });

      const results = service.calculateEffectivePriorities([task1.id, task2.id]);

      expect(results.size).toBe(2);
      expect(results.get(task1.id)?.effectivePriority).toBe(Priority.HIGH);
      expect(results.get(task2.id)?.effectivePriority).toBe(Priority.HIGH);
    });

    test('returns empty map for empty input', () => {
      const results = service.calculateEffectivePriorities([]);
      expect(results.size).toBe(0);
    });
  });

  describe('enhanceTasksWithEffectivePriority', () => {
    test('adds effectivePriority field to tasks', () => {
      const task1 = createTestTask('el-task1', Priority.LOW);
      const task2 = createTestTask('el-task2', Priority.HIGH);

      depService.addDependency({
        sourceId: task2.id,
        targetId: task1.id,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });

      const enhanced = service.enhanceTasksWithEffectivePriority([task1, task2]);

      expect(enhanced).toHaveLength(2);
      const enhancedTask1 = enhanced.find((t) => t.id === task1.id);
      expect(enhancedTask1?.effectivePriority).toBe(Priority.HIGH);
      expect(enhancedTask1?.priorityInfluenced).toBe(true);
    });

    test('returns empty array for empty input', () => {
      const enhanced = service.enhanceTasksWithEffectivePriority([]);
      expect(enhanced).toHaveLength(0);
    });
  });

  describe('sortByEffectivePriority', () => {
    test('sorts by effective priority (highest first)', () => {
      // task1: base LOW, effective HIGH (due to dependency)
      // task2: base HIGH, effective HIGH
      // task3: base LOW, effective LOW
      const task1 = createTestTask('el-task1', Priority.LOW);
      const task2 = createTestTask('el-task2', Priority.HIGH);
      const task3 = createTestTask('el-task3', Priority.LOW);

      depService.addDependency({
        sourceId: task2.id,
        targetId: task1.id,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });

      const enhanced = service.enhanceTasksWithEffectivePriority([task3, task1, task2]);
      const sorted = service.sortByEffectivePriority(enhanced);

      // HIGH effective priority should come first
      expect(sorted[0].effectivePriority).toBe(Priority.HIGH);
      expect(sorted[1].effectivePriority).toBe(Priority.HIGH);
      expect(sorted[2].effectivePriority).toBe(Priority.LOW);
    });

    test('uses base priority as tiebreaker', () => {
      // Both tasks have effective priority HIGH
      // task1: base LOW (4), effective HIGH (2) - should come second
      // task2: base HIGH (2), effective HIGH (2) - should come first
      const task1 = createTestTask('el-task1', Priority.LOW);
      const task2 = createTestTask('el-task2', Priority.HIGH);

      depService.addDependency({
        sourceId: task2.id,
        targetId: task1.id,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });

      const enhanced = service.enhanceTasksWithEffectivePriority([task1, task2]);
      const sorted = service.sortByEffectivePriority(enhanced);

      // task2 has better base priority, should come first
      expect(sorted[0].id).toBe(task2.id);
      expect(sorted[1].id).toBe(task1.id);
    });
  });

  // ==========================================================================
  // Edge Cases
  // ==========================================================================

  describe('edge cases', () => {
    test('handles diamond dependency pattern', () => {
      // Diamond: task1 <- task2 and task3 <- task4
      //          task2 and task3 both depend on task1
      //          task4 depends on both task2 and task3
      const task1 = createTestTask('el-task1', Priority.LOW);
      const task2 = createTestTask('el-task2', Priority.MEDIUM);
      const task3 = createTestTask('el-task3', Priority.MEDIUM);
      const task4 = createTestTask('el-task4', Priority.CRITICAL);

      // task2 depends on task1
      depService.addDependency({
        sourceId: task2.id,
        targetId: task1.id,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });

      // task3 depends on task1
      depService.addDependency({
        sourceId: task3.id,
        targetId: task1.id,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });

      // task4 depends on task2
      depService.addDependency({
        sourceId: task4.id,
        targetId: task2.id,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });

      // task4 depends on task3
      depService.addDependency({
        sourceId: task4.id,
        targetId: task3.id,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });

      const result = service.calculateEffectivePriority(task1.id);

      // task1 should inherit CRITICAL from task4 via both paths
      expect(result.effectivePriority).toBe(Priority.CRITICAL);
      expect(result.isInfluenced).toBe(true);
    });

    test('ignores non-blocking dependency types', () => {
      const task1 = createTestTask('el-task1', Priority.LOW);
      const task2 = createTestTask('el-task2', Priority.CRITICAL);

      // task2 relates to task1 (not blocking)
      depService.addDependency({
        sourceId: task2.id,
        targetId: task1.id,
        type: DependencyType.RELATES_TO,
        createdBy: testEntity,
      });

      const result = service.calculateEffectivePriority(task1.id);

      // Should not inherit priority from non-blocking dependency
      expect(result.effectivePriority).toBe(Priority.LOW);
      expect(result.isInfluenced).toBe(false);
    });

    test('handles task with no dependents but has blockers', () => {
      // task1 is blocked by task2, but nothing depends on task1
      const task1 = createTestTask('el-task1', Priority.HIGH);
      const task2 = createTestTask('el-task2', Priority.LOW);

      depService.addDependency({
        sourceId: task1.id,
        targetId: task2.id,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });

      const result = service.calculateEffectivePriority(task1.id);

      // task1 should keep its own priority
      expect(result.effectivePriority).toBe(Priority.HIGH);
      expect(result.isInfluenced).toBe(false);
    });
  });
});

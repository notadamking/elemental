import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { BlockedCacheService, createBlockedCacheService } from './blocked-cache.js';
import { createStorage, initializeSchema } from '../storage/index.js';
import type { StorageBackend } from '../storage/backend.js';
import type { ElementId, EntityId } from '../types/element.js';
import { DependencyType, GateType } from '../types/dependency.js';

// ============================================================================
// Test Setup
// ============================================================================

describe('BlockedCacheService', () => {
  let db: StorageBackend;
  let service: BlockedCacheService;

  // Test data
  const testEntity = 'en-testuser1' as EntityId;
  const task1 = 'el-task001' as ElementId;
  const task2 = 'el-task002' as ElementId;
  const task3 = 'el-task003' as ElementId;
  const task4 = 'el-task004' as ElementId;
  const plan1 = 'el-plan001' as ElementId;
  const externalTarget = 'el-external1' as ElementId;

  // Helper to create an element in the database
  function createTestElement(
    id: string,
    type: string,
    status: string,
    deleted = false
  ): void {
    const now = new Date().toISOString();
    const data = JSON.stringify({ status, title: `Test ${id}` });
    db.run(
      `INSERT INTO elements (id, type, data, created_at, updated_at, created_by, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, type, data, now, now, testEntity, deleted ? now : null]
    );
  }

  // Helper to create a dependency
  function createTestDependency(
    sourceId: string,
    targetId: string,
    type: string,
    metadata?: Record<string, unknown>
  ): void {
    const now = new Date().toISOString();
    db.run(
      `INSERT INTO dependencies (source_id, target_id, type, created_at, created_by, metadata)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [sourceId, targetId, type, now, testEntity, metadata ? JSON.stringify(metadata) : null]
    );
  }

  // Helper to update element status
  function updateElementStatus(id: string, status: string): void {
    const now = new Date().toISOString();
    const row = db.queryOne<{ data: string }>('SELECT data FROM elements WHERE id = ?', [id]);
    const data = row ? JSON.parse(row.data) : {};
    data.status = status;
    db.run(
      'UPDATE elements SET data = ?, updated_at = ? WHERE id = ?',
      [JSON.stringify(data), now, id]
    );
  }

  beforeEach(() => {
    // Create in-memory database for each test
    db = createStorage({ path: ':memory:' });
    // Initialize full schema (includes blocked_cache table)
    initializeSchema(db);
    service = createBlockedCacheService(db);
  });

  afterEach(() => {
    db.close();
  });

  // ==========================================================================
  // Basic Query Operations
  // ==========================================================================

  describe('isBlocked', () => {
    test('returns null for non-blocked element', () => {
      createTestElement(task1, 'task', 'open');
      const result = service.isBlocked(task1);
      expect(result).toBeNull();
    });

    test('returns blocking info for blocked element', () => {
      createTestElement(task1, 'task', 'open');
      service.addBlocked(task1, task2, 'Test block reason');

      const result = service.isBlocked(task1);
      expect(result).not.toBeNull();
      expect(result?.elementId).toBe(task1);
      expect(result?.blockedBy).toBe(task2);
      expect(result?.reason).toBe('Test block reason');
    });

    test('returns null for element not in database', () => {
      const result = service.isBlocked('el-nonexistent' as ElementId);
      expect(result).toBeNull();
    });
  });

  describe('getAllBlocked', () => {
    test('returns empty array when no elements blocked', () => {
      const result = service.getAllBlocked();
      expect(result).toEqual([]);
    });

    test('returns all blocked elements', () => {
      // Create elements first (foreign key constraint)
      createTestElement(task1, 'task', 'open');
      createTestElement(task3, 'task', 'open');

      service.addBlocked(task1, task2, 'Reason 1');
      service.addBlocked(task3, task4, 'Reason 2');

      const result = service.getAllBlocked();
      expect(result).toHaveLength(2);

      const ids = result.map((r) => r.elementId);
      expect(ids).toContain(task1);
      expect(ids).toContain(task3);
    });
  });

  describe('getBlockedBy', () => {
    test('returns empty array when nothing blocked by element', () => {
      const result = service.getBlockedBy(task1);
      expect(result).toEqual([]);
    });

    test('returns all elements blocked by a specific element', () => {
      // Create elements first (foreign key constraint)
      createTestElement(task1, 'task', 'open');
      createTestElement(task2, 'task', 'open');
      createTestElement(task3, 'task', 'open');

      service.addBlocked(task1, plan1, 'Blocked by plan');
      service.addBlocked(task2, plan1, 'Blocked by plan');
      service.addBlocked(task3, task4, 'Different blocker');

      const result = service.getBlockedBy(plan1);
      expect(result).toHaveLength(2);
      expect(result).toContain(task1);
      expect(result).toContain(task2);
    });
  });

  describe('count', () => {
    test('returns 0 when cache is empty', () => {
      expect(service.count()).toBe(0);
    });

    test('returns correct count', () => {
      // Create elements first (foreign key constraint)
      createTestElement(task1, 'task', 'open');
      createTestElement(task3, 'task', 'open');

      service.addBlocked(task1, task2, 'Reason');
      service.addBlocked(task3, task4, 'Reason');
      expect(service.count()).toBe(2);
    });
  });

  // ==========================================================================
  // Cache Maintenance
  // ==========================================================================

  describe('addBlocked', () => {
    test('adds blocking entry to cache', () => {
      // Create element first (foreign key constraint)
      createTestElement(task1, 'task', 'open');

      service.addBlocked(task1, task2, 'Test reason');

      const result = service.isBlocked(task1);
      expect(result).not.toBeNull();
      expect(result?.blockedBy).toBe(task2);
    });

    test('replaces existing entry (upsert)', () => {
      // Create element first (foreign key constraint)
      createTestElement(task1, 'task', 'open');

      service.addBlocked(task1, task2, 'First reason');
      service.addBlocked(task1, task3, 'Second reason');

      const result = service.isBlocked(task1);
      expect(result?.blockedBy).toBe(task3);
      expect(result?.reason).toBe('Second reason');
    });
  });

  describe('removeBlocked', () => {
    test('removes blocking entry from cache', () => {
      // Create element first (foreign key constraint)
      createTestElement(task1, 'task', 'open');

      service.addBlocked(task1, task2, 'Reason');
      expect(service.isBlocked(task1)).not.toBeNull();

      service.removeBlocked(task1);
      expect(service.isBlocked(task1)).toBeNull();
    });

    test('does nothing for non-existent entry', () => {
      // Should not throw
      expect(() => service.removeBlocked(task1)).not.toThrow();
    });
  });

  describe('clear', () => {
    test('removes all entries from cache', () => {
      // Create elements first (foreign key constraint)
      createTestElement(task1, 'task', 'open');
      createTestElement(task3, 'task', 'open');

      service.addBlocked(task1, task2, 'Reason');
      service.addBlocked(task3, task4, 'Reason');
      expect(service.count()).toBe(2);

      service.clear();
      expect(service.count()).toBe(0);
    });
  });

  // ==========================================================================
  // Blocking State Computation
  // ==========================================================================

  describe('isTargetCompleted', () => {
    test('returns true for non-existent target (external reference)', () => {
      expect(service.isTargetCompleted(externalTarget)).toBe(true);
    });

    test('returns true for deleted element', () => {
      createTestElement(task1, 'task', 'open', true);
      expect(service.isTargetCompleted(task1)).toBe(true);
    });

    test('returns true for closed status', () => {
      createTestElement(task1, 'task', 'closed');
      expect(service.isTargetCompleted(task1)).toBe(true);
    });

    test('returns true for completed status', () => {
      createTestElement(task1, 'task', 'completed');
      expect(service.isTargetCompleted(task1)).toBe(true);
    });

    test('returns true for tombstone status', () => {
      createTestElement(task1, 'task', 'tombstone');
      expect(service.isTargetCompleted(task1)).toBe(true);
    });

    test('returns false for open status', () => {
      createTestElement(task1, 'task', 'open');
      expect(service.isTargetCompleted(task1)).toBe(false);
    });

    test('returns false for in_progress status', () => {
      createTestElement(task1, 'task', 'in_progress');
      expect(service.isTargetCompleted(task1)).toBe(false);
    });
  });

  describe('isGateSatisfied', () => {
    describe('timer gate', () => {
      test('returns true when time has passed', () => {
        const metadata = {
          gateType: GateType.TIMER,
          waitUntil: '2020-01-01T00:00:00.000Z',
        } as const;

        const result = service.isGateSatisfied(metadata, { currentTime: new Date() });
        expect(result).toBe(true);
      });

      test('returns false when time has not passed', () => {
        const futureTime = new Date('2099-12-31');
        const metadata = {
          gateType: GateType.TIMER,
          waitUntil: futureTime.toISOString(),
        } as const;

        const result = service.isGateSatisfied(metadata, { currentTime: new Date() });
        expect(result).toBe(false);
      });
    });

    describe('approval gate', () => {
      test('returns true when all approvals received', () => {
        const metadata = {
          gateType: GateType.APPROVAL,
          requiredApprovers: ['user1', 'user2'] as EntityId[],
          currentApprovers: ['user1', 'user2'] as EntityId[],
        } as const;

        expect(service.isGateSatisfied(metadata)).toBe(true);
      });

      test('returns true when enough approvals received (partial)', () => {
        const metadata = {
          gateType: GateType.APPROVAL,
          requiredApprovers: ['user1', 'user2', 'user3'] as EntityId[],
          approvalCount: 2,
          currentApprovers: ['user1', 'user3'] as EntityId[],
        } as const;

        expect(service.isGateSatisfied(metadata)).toBe(true);
      });

      test('returns false when not enough approvals', () => {
        const metadata = {
          gateType: GateType.APPROVAL,
          requiredApprovers: ['user1', 'user2'] as EntityId[],
          currentApprovers: ['user1'] as EntityId[],
        } as const;

        expect(service.isGateSatisfied(metadata)).toBe(false);
      });

      test('returns false when no approvals', () => {
        const metadata = {
          gateType: GateType.APPROVAL,
          requiredApprovers: ['user1', 'user2'] as EntityId[],
        } as const;

        expect(service.isGateSatisfied(metadata)).toBe(false);
      });
    });

    describe('external gate', () => {
      test('returns false when not satisfied', () => {
        const metadata = {
          gateType: GateType.EXTERNAL,
          externalSystem: 'jira',
          externalId: 'PROJ-123',
        } as const;

        expect(service.isGateSatisfied(metadata)).toBe(false);
      });

      test('returns true when satisfied flag is set', () => {
        const metadata = {
          gateType: GateType.EXTERNAL,
          externalSystem: 'jira',
          externalId: 'PROJ-123',
          satisfied: true,
          satisfiedAt: new Date().toISOString(),
          satisfiedBy: 'en-admin1' as EntityId,
        };

        expect(service.isGateSatisfied(metadata)).toBe(true);
      });
    });

    describe('webhook gate', () => {
      test('returns false when not satisfied', () => {
        const metadata = {
          gateType: GateType.WEBHOOK,
          webhookUrl: 'https://example.com/callback',
          callbackId: 'cb-123',
        } as const;

        expect(service.isGateSatisfied(metadata)).toBe(false);
      });

      test('returns true when satisfied flag is set', () => {
        const metadata = {
          gateType: GateType.WEBHOOK,
          webhookUrl: 'https://example.com/callback',
          callbackId: 'cb-123',
          satisfied: true,
          satisfiedAt: new Date().toISOString(),
          satisfiedBy: 'en-webhook-handler' as EntityId,
        };

        expect(service.isGateSatisfied(metadata)).toBe(true);
      });
    });
  });

  describe('computeBlockingState', () => {
    test('returns null when element has no blocking dependencies', () => {
      createTestElement(task1, 'task', 'open');
      const result = service.computeBlockingState(task1);
      expect(result).toBeNull();
    });

    describe('blocks dependency', () => {
      test('returns blocked when target is not completed', () => {
        createTestElement(task1, 'task', 'open');
        createTestElement(task2, 'task', 'open');
        createTestDependency(task1, task2, DependencyType.BLOCKS);

        const result = service.computeBlockingState(task1);
        expect(result).not.toBeNull();
        expect(result?.blockedBy).toBe(task2);
        expect(result?.reason).toContain('blocks dependency');
      });

      test('returns null when target is closed', () => {
        createTestElement(task1, 'task', 'open');
        createTestElement(task2, 'task', 'closed');
        createTestDependency(task1, task2, DependencyType.BLOCKS);

        const result = service.computeBlockingState(task1);
        expect(result).toBeNull();
      });

      test('returns null when target does not exist (external reference)', () => {
        createTestElement(task1, 'task', 'open');
        createTestDependency(task1, externalTarget, DependencyType.BLOCKS);

        const result = service.computeBlockingState(task1);
        expect(result).toBeNull();
      });
    });

    describe('parent-child dependency', () => {
      test('returns blocked when parent is blocked', () => {
        createTestElement(task1, 'task', 'open');
        createTestElement(plan1, 'plan', 'active');
        createTestDependency(task1, plan1, DependencyType.PARENT_CHILD);

        // Block the parent first
        service.addBlocked(plan1, task2, 'Parent blocked');

        const result = service.computeBlockingState(task1);
        expect(result).not.toBeNull();
        expect(result?.reason).toContain('parent is blocked');
      });

      test('returns blocked when parent task is not completed', () => {
        // Parent-child between tasks: child blocked until parent completes
        const parentTask = 'el-parent-task' as ElementId;
        createTestElement(parentTask, 'task', 'open');
        createTestElement(task1, 'task', 'open');
        createTestDependency(task1, parentTask, DependencyType.PARENT_CHILD);

        const result = service.computeBlockingState(task1);
        expect(result).not.toBeNull();
        expect(result?.reason).toContain('parent not completed');
      });

      test('returns null when parent task is completed', () => {
        // Parent-child between tasks: child unblocked when parent completes
        const parentTask = 'el-parent-task' as ElementId;
        createTestElement(parentTask, 'task', 'closed');
        createTestElement(task1, 'task', 'open');
        createTestDependency(task1, parentTask, DependencyType.PARENT_CHILD);

        const result = service.computeBlockingState(task1);
        expect(result).toBeNull();
      });

      test('returns null when parent is a plan (plans are collections, not blockers)', () => {
        // Parent-child between task and plan: task NOT blocked by plan status
        // Plans are collections of tasks, not blocking parents
        createTestElement(task1, 'task', 'open');
        createTestElement(plan1, 'plan', 'active');
        createTestDependency(task1, plan1, DependencyType.PARENT_CHILD);

        const result = service.computeBlockingState(task1);
        expect(result).toBeNull();
      });
    });

    describe('awaits dependency', () => {
      test('returns blocked when timer gate not satisfied', () => {
        createTestElement(task1, 'task', 'open');
        createTestElement(task2, 'task', 'open');
        createTestDependency(task1, task2, DependencyType.AWAITS, {
          gateType: GateType.TIMER,
          waitUntil: '2099-12-31T00:00:00.000Z',
        });

        const result = service.computeBlockingState(task1);
        expect(result).not.toBeNull();
        expect(result?.reason).toContain('gate');
        expect(result?.reason).toContain('timer');
      });

      test('returns null when timer gate satisfied', () => {
        createTestElement(task1, 'task', 'open');
        createTestElement(task2, 'task', 'open');
        createTestDependency(task1, task2, DependencyType.AWAITS, {
          gateType: GateType.TIMER,
          waitUntil: '2020-01-01T00:00:00.000Z',
        });

        const result = service.computeBlockingState(task1);
        expect(result).toBeNull();
      });

      test('returns blocked when approval gate not satisfied', () => {
        createTestElement(task1, 'task', 'open');
        createTestElement(task2, 'task', 'open');
        createTestDependency(task1, task2, DependencyType.AWAITS, {
          gateType: GateType.APPROVAL,
          requiredApprovers: ['user1', 'user2'],
          currentApprovers: ['user1'],
        });

        const result = service.computeBlockingState(task1);
        expect(result).not.toBeNull();
        expect(result?.reason).toContain('gate');
        expect(result?.reason).toContain('approval');
      });
    });

    describe('non-blocking dependencies', () => {
      test('ignores relates-to dependencies', () => {
        createTestElement(task1, 'task', 'open');
        createTestElement(task2, 'task', 'open');
        createTestDependency(task1, task2, DependencyType.RELATES_TO);

        const result = service.computeBlockingState(task1);
        expect(result).toBeNull();
      });

      test('ignores references dependencies', () => {
        createTestElement(task1, 'task', 'open');
        createTestElement(task2, 'task', 'open');
        createTestDependency(task1, task2, DependencyType.REFERENCES);

        const result = service.computeBlockingState(task1);
        expect(result).toBeNull();
      });
    });
  });

  // ==========================================================================
  // Invalidation
  // ==========================================================================

  describe('invalidateElement', () => {
    test('adds to cache when element becomes blocked', () => {
      createTestElement(task1, 'task', 'open');
      createTestElement(task2, 'task', 'open');
      createTestDependency(task1, task2, DependencyType.BLOCKS);

      service.invalidateElement(task1);

      expect(service.isBlocked(task1)).not.toBeNull();
    });

    test('removes from cache when element becomes unblocked', () => {
      createTestElement(task1, 'task', 'open');
      createTestElement(task2, 'task', 'closed');
      createTestDependency(task1, task2, DependencyType.BLOCKS);

      // First, manually add to cache
      service.addBlocked(task1, task2, 'Was blocked');

      // Now invalidate - should remove since target is closed
      service.invalidateElement(task1);

      expect(service.isBlocked(task1)).toBeNull();
    });
  });

  describe('invalidateDependents', () => {
    test('updates all elements that depend on target', () => {
      // Create elements
      createTestElement(task1, 'task', 'open');
      createTestElement(task2, 'task', 'open');
      createTestElement(task3, 'task', 'open'); // Blocker

      // task1 and task2 both blocked by task3
      createTestDependency(task1, task3, DependencyType.BLOCKS);
      createTestDependency(task2, task3, DependencyType.BLOCKS);

      // Initially populate cache
      service.invalidateElement(task1);
      service.invalidateElement(task2);

      expect(service.isBlocked(task1)).not.toBeNull();
      expect(service.isBlocked(task2)).not.toBeNull();

      // Now close task3
      updateElementStatus(task3, 'closed');

      // Invalidate dependents of task3
      service.invalidateDependents(task3);

      // Both should now be unblocked
      expect(service.isBlocked(task1)).toBeNull();
      expect(service.isBlocked(task2)).toBeNull();
    });
  });

  // ==========================================================================
  // Full Rebuild
  // ==========================================================================

  describe('rebuild', () => {
    test('clears existing cache before rebuild', () => {
      // Create element first so we can add to cache
      createTestElement(task1, 'task', 'open');
      service.addBlocked(task1, task2, 'Old entry');

      service.rebuild();

      // Old entry should be gone if task1 has no blocking deps
      expect(service.isBlocked(task1)).toBeNull();
    });

    test('rebuilds cache correctly for blocks dependencies', () => {
      createTestElement(task1, 'task', 'open');
      createTestElement(task2, 'task', 'open');
      createTestElement(task3, 'task', 'closed');
      createTestDependency(task1, task2, DependencyType.BLOCKS);
      createTestDependency(task3, task2, DependencyType.BLOCKS);

      const result = service.rebuild();

      // task1 should be blocked (task2 is open)
      expect(service.isBlocked(task1)).not.toBeNull();
      // task3 should also be blocked (even though it's closed, it has a blocking dep)
      expect(service.isBlocked(task3)).not.toBeNull();

      expect(result.elementsChecked).toBeGreaterThan(0);
      expect(result.elementsBlocked).toBe(2);
    });

    test('handles transitive parent-child blocking', () => {
      // Create hierarchy: plan1 -> task1 -> task2 (task2 is child of task1)
      createTestElement(plan1, 'plan', 'active');
      createTestElement(task1, 'task', 'open');
      createTestElement(task2, 'task', 'open');
      createTestElement(task3, 'task', 'open'); // External blocker

      // task1 is child of plan1
      createTestDependency(task1, plan1, DependencyType.PARENT_CHILD);
      // task2 is child of task1
      createTestDependency(task2, task1, DependencyType.PARENT_CHILD);
      // plan1 is blocked by task3
      createTestDependency(plan1, task3, DependencyType.BLOCKS);

      const result = service.rebuild();

      // plan1 should be blocked by task3
      expect(service.isBlocked(plan1)).not.toBeNull();
      // task1 should be blocked because parent (plan1) is blocked
      expect(service.isBlocked(task1)).not.toBeNull();
      // task2 should be blocked because parent (task1) is blocked
      expect(service.isBlocked(task2)).not.toBeNull();

      expect(result.elementsBlocked).toBe(3);
    });

    test('returns correct statistics', () => {
      createTestElement(task1, 'task', 'open');
      createTestElement(task2, 'task', 'open');
      createTestElement(task3, 'task', 'closed');
      createTestDependency(task1, task2, DependencyType.BLOCKS);
      createTestDependency(task2, task3, DependencyType.BLOCKS);

      const result = service.rebuild();

      expect(result.elementsChecked).toBe(2);
      expect(result.elementsBlocked).toBe(1); // Only task1 is blocked
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  // ==========================================================================
  // Dependency Event Handlers
  // ==========================================================================

  describe('onDependencyAdded', () => {
    test('updates cache when blocking dependency added', () => {
      createTestElement(task1, 'task', 'open');
      createTestElement(task2, 'task', 'open');
      createTestDependency(task1, task2, DependencyType.BLOCKS);

      service.onDependencyAdded(task1, task2, DependencyType.BLOCKS);

      expect(service.isBlocked(task1)).not.toBeNull();
    });

    test('ignores non-blocking dependency types', () => {
      createTestElement(task1, 'task', 'open');
      createTestElement(task2, 'task', 'open');
      createTestDependency(task1, task2, DependencyType.REFERENCES);

      service.onDependencyAdded(task1, task2, DependencyType.REFERENCES);

      expect(service.isBlocked(task1)).toBeNull();
    });

    test('updates children for parent-child dependency', () => {
      createTestElement(task1, 'task', 'open');
      createTestElement(task2, 'task', 'open');
      createTestElement(task3, 'task', 'open');
      createTestDependency(task1, task2, DependencyType.BLOCKS);
      createTestDependency(task2, task3, DependencyType.PARENT_CHILD);

      // Rebuild to establish baseline
      service.rebuild();

      // task1 blocked by task2 which is not completed
      expect(service.isBlocked(task1)).not.toBeNull();
      // task2 blocked because parent (task3) not completed
      expect(service.isBlocked(task2)).not.toBeNull();
    });
  });

  describe('onDependencyRemoved', () => {
    test('updates cache when blocking dependency removed', () => {
      createTestElement(task1, 'task', 'open');
      createTestElement(task2, 'task', 'open');

      // Add and establish blocked state
      createTestDependency(task1, task2, DependencyType.BLOCKS);
      service.rebuild();
      expect(service.isBlocked(task1)).not.toBeNull();

      // Remove dependency from DB
      db.run(
        'DELETE FROM dependencies WHERE source_id = ? AND target_id = ? AND type = ?',
        [task1, task2, DependencyType.BLOCKS]
      );

      // Notify service
      service.onDependencyRemoved(task1, task2, DependencyType.BLOCKS);

      expect(service.isBlocked(task1)).toBeNull();
    });
  });

  describe('onStatusChanged', () => {
    test('updates dependents when element becomes closed', () => {
      createTestElement(task1, 'task', 'open');
      createTestElement(task2, 'task', 'open');
      createTestDependency(task1, task2, DependencyType.BLOCKS);

      // Establish blocked state
      service.rebuild();
      expect(service.isBlocked(task1)).not.toBeNull();

      // Close task2
      updateElementStatus(task2, 'closed');

      // Notify of status change
      service.onStatusChanged(task2, 'open', 'closed');

      // task1 should now be unblocked
      expect(service.isBlocked(task1)).toBeNull();
    });

    test('updates dependents when element is reopened', () => {
      createTestElement(task1, 'task', 'open');
      createTestElement(task2, 'task', 'closed');
      createTestDependency(task1, task2, DependencyType.BLOCKS);

      // Initially not blocked
      service.rebuild();
      expect(service.isBlocked(task1)).toBeNull();

      // Reopen task2
      updateElementStatus(task2, 'open');

      // Notify of status change
      service.onStatusChanged(task2, 'closed', 'open');

      // task1 should now be blocked
      expect(service.isBlocked(task1)).not.toBeNull();
    });

    test('does nothing when status change does not affect completion', () => {
      createTestElement(task1, 'task', 'open');
      createTestElement(task2, 'task', 'open');
      createTestDependency(task1, task2, DependencyType.BLOCKS);

      service.rebuild();
      const beforeCount = service.count();

      // Change from open to in_progress (both non-complete)
      updateElementStatus(task2, 'in_progress');
      service.onStatusChanged(task2, 'open', 'in_progress');

      // Cache should be unchanged
      expect(service.count()).toBe(beforeCount);
    });
  });

  describe('onElementDeleted', () => {
    test('removes deleted element from cache', () => {
      createTestElement(task1, 'task', 'open');
      service.addBlocked(task1, task2, 'Blocked');

      service.onElementDeleted(task1);

      expect(service.isBlocked(task1)).toBeNull();
    });

    test('unblocks dependents when element deleted', () => {
      createTestElement(task1, 'task', 'open');
      createTestElement(task2, 'task', 'open');
      createTestDependency(task1, task2, DependencyType.BLOCKS);

      service.rebuild();
      expect(service.isBlocked(task1)).not.toBeNull();

      // Mark task2 as deleted
      db.run('UPDATE elements SET deleted_at = ? WHERE id = ?', [new Date().toISOString(), task2]);

      service.onElementDeleted(task2);

      // task1 should be unblocked (deleted elements don't block)
      expect(service.isBlocked(task1)).toBeNull();
    });
  });

  // ==========================================================================
  // Gate Satisfaction
  // ==========================================================================

  describe('satisfyGate', () => {
    test('satisfies external gate and unblocks element', () => {
      createTestElement(task1, 'task', 'open');
      createTestElement(task2, 'task', 'open');
      createTestDependency(task1, task2, DependencyType.AWAITS, {
        gateType: GateType.EXTERNAL,
        externalSystem: 'jira',
        externalId: 'PROJ-123',
      });

      // Rebuild to establish blocked state
      service.rebuild();
      expect(service.isBlocked(task1)).not.toBeNull();

      // Satisfy the gate
      const result = service.satisfyGate(task1, task2, testEntity);

      expect(result).toBe(true);
      // Element should now be unblocked
      expect(service.isBlocked(task1)).toBeNull();
    });

    test('satisfies webhook gate and unblocks element', () => {
      createTestElement(task1, 'task', 'open');
      createTestElement(task2, 'task', 'open');
      createTestDependency(task1, task2, DependencyType.AWAITS, {
        gateType: GateType.WEBHOOK,
        webhookUrl: 'https://example.com/callback',
        callbackId: 'cb-123',
      });

      // Rebuild to establish blocked state
      service.rebuild();
      expect(service.isBlocked(task1)).not.toBeNull();

      // Satisfy the gate
      const result = service.satisfyGate(task1, task2, testEntity);

      expect(result).toBe(true);
      expect(service.isBlocked(task1)).toBeNull();
    });

    test('returns false for non-existent dependency', () => {
      createTestElement(task1, 'task', 'open');

      const result = service.satisfyGate(task1, task2, testEntity);

      expect(result).toBe(false);
    });

    test('returns false for non-external/webhook gate types', () => {
      createTestElement(task1, 'task', 'open');
      createTestElement(task2, 'task', 'open');
      createTestDependency(task1, task2, DependencyType.AWAITS, {
        gateType: GateType.TIMER,
        waitUntil: '2099-12-31T00:00:00.000Z',
      });

      const result = service.satisfyGate(task1, task2, testEntity);

      expect(result).toBe(false);
    });

    test('returns true if gate already satisfied', () => {
      createTestElement(task1, 'task', 'open');
      createTestElement(task2, 'task', 'open');
      createTestDependency(task1, task2, DependencyType.AWAITS, {
        gateType: GateType.EXTERNAL,
        externalSystem: 'jira',
        externalId: 'PROJ-123',
        satisfied: true,
        satisfiedAt: new Date().toISOString(),
        satisfiedBy: testEntity,
      });

      const result = service.satisfyGate(task1, task2, testEntity);

      expect(result).toBe(true);
    });

    test('stores satisfaction metadata', () => {
      createTestElement(task1, 'task', 'open');
      createTestElement(task2, 'task', 'open');
      createTestDependency(task1, task2, DependencyType.AWAITS, {
        gateType: GateType.EXTERNAL,
        externalSystem: 'jira',
        externalId: 'PROJ-123',
      });

      service.satisfyGate(task1, task2, testEntity);

      // Check that metadata was updated
      const dep = db.queryOne<{ metadata: string }>(
        'SELECT metadata FROM dependencies WHERE source_id = ? AND target_id = ? AND type = ?',
        [task1, task2, DependencyType.AWAITS]
      );

      const metadata = JSON.parse(dep!.metadata);
      expect(metadata.satisfied).toBe(true);
      expect(metadata.satisfiedAt).toBeDefined();
      expect(metadata.satisfiedBy).toBe(testEntity);
    });
  });

  describe('recordApproval', () => {
    test('records approval and returns updated status', () => {
      const approver1 = 'en-approver1' as EntityId;
      const approver2 = 'en-approver2' as EntityId;

      createTestElement(task1, 'task', 'open');
      createTestElement(task2, 'task', 'open');
      createTestDependency(task1, task2, DependencyType.AWAITS, {
        gateType: GateType.APPROVAL,
        requiredApprovers: [approver1, approver2],
      });

      const result = service.recordApproval(task1, task2, approver1);

      expect(result.success).toBe(true);
      expect(result.currentCount).toBe(1);
      expect(result.requiredCount).toBe(2);
      expect(result.satisfied).toBe(false);
    });

    test('satisfies gate when all approvals received', () => {
      const approver1 = 'en-approver1' as EntityId;
      const approver2 = 'en-approver2' as EntityId;

      createTestElement(task1, 'task', 'open');
      createTestElement(task2, 'task', 'open');
      createTestDependency(task1, task2, DependencyType.AWAITS, {
        gateType: GateType.APPROVAL,
        requiredApprovers: [approver1, approver2],
      });

      // Rebuild to establish blocked state
      service.rebuild();
      expect(service.isBlocked(task1)).not.toBeNull();

      // Record first approval
      service.recordApproval(task1, task2, approver1);
      expect(service.isBlocked(task1)).not.toBeNull();

      // Record second approval
      const result = service.recordApproval(task1, task2, approver2);

      expect(result.success).toBe(true);
      expect(result.currentCount).toBe(2);
      expect(result.satisfied).toBe(true);
      expect(service.isBlocked(task1)).toBeNull();
    });

    test('respects approvalCount for partial approval', () => {
      const approver1 = 'en-approver1' as EntityId;
      const approver2 = 'en-approver2' as EntityId;
      const approver3 = 'en-approver3' as EntityId;

      createTestElement(task1, 'task', 'open');
      createTestElement(task2, 'task', 'open');
      createTestDependency(task1, task2, DependencyType.AWAITS, {
        gateType: GateType.APPROVAL,
        requiredApprovers: [approver1, approver2, approver3],
        approvalCount: 2, // Only need 2 of 3
      });

      service.rebuild();
      expect(service.isBlocked(task1)).not.toBeNull();

      service.recordApproval(task1, task2, approver1);
      const result = service.recordApproval(task1, task2, approver3);

      expect(result.satisfied).toBe(true);
      expect(service.isBlocked(task1)).toBeNull();
    });

    test('rejects non-listed approver', () => {
      const approver1 = 'en-approver1' as EntityId;
      const unauthorized = 'en-unauthorized' as EntityId;

      createTestElement(task1, 'task', 'open');
      createTestElement(task2, 'task', 'open');
      createTestDependency(task1, task2, DependencyType.AWAITS, {
        gateType: GateType.APPROVAL,
        requiredApprovers: [approver1],
      });

      const result = service.recordApproval(task1, task2, unauthorized);

      expect(result.success).toBe(false);
    });

    test('handles duplicate approval gracefully', () => {
      const approver1 = 'en-approver1' as EntityId;

      createTestElement(task1, 'task', 'open');
      createTestElement(task2, 'task', 'open');
      createTestDependency(task1, task2, DependencyType.AWAITS, {
        gateType: GateType.APPROVAL,
        requiredApprovers: [approver1],
      });

      service.recordApproval(task1, task2, approver1);
      const result = service.recordApproval(task1, task2, approver1);

      expect(result.success).toBe(true);
      expect(result.currentCount).toBe(1); // Should not increment again
    });

    test('returns failure for non-approval gate', () => {
      createTestElement(task1, 'task', 'open');
      createTestElement(task2, 'task', 'open');
      createTestDependency(task1, task2, DependencyType.AWAITS, {
        gateType: GateType.EXTERNAL,
        externalSystem: 'jira',
        externalId: 'PROJ-123',
      });

      const result = service.recordApproval(task1, task2, testEntity);

      expect(result.success).toBe(false);
    });
  });

  describe('removeApproval', () => {
    test('removes approval and updates status', () => {
      const approver1 = 'en-approver1' as EntityId;
      const approver2 = 'en-approver2' as EntityId;

      createTestElement(task1, 'task', 'open');
      createTestElement(task2, 'task', 'open');
      createTestDependency(task1, task2, DependencyType.AWAITS, {
        gateType: GateType.APPROVAL,
        requiredApprovers: [approver1, approver2],
        currentApprovers: [approver1, approver2],
      });

      // Initially satisfied
      expect(service.isGateSatisfied({
        gateType: GateType.APPROVAL,
        requiredApprovers: [approver1, approver2],
        currentApprovers: [approver1, approver2],
      })).toBe(true);

      // Remove one approval
      const result = service.removeApproval(task1, task2, approver1);

      expect(result.success).toBe(true);
      expect(result.currentCount).toBe(1);
      expect(result.satisfied).toBe(false);
    });

    test('re-blocks element when approval removed', () => {
      const approver1 = 'en-approver1' as EntityId;

      createTestElement(task1, 'task', 'open');
      createTestElement(task2, 'task', 'open');
      createTestDependency(task1, task2, DependencyType.AWAITS, {
        gateType: GateType.APPROVAL,
        requiredApprovers: [approver1],
        currentApprovers: [approver1],
      });

      // Initially unblocked
      service.rebuild();
      expect(service.isBlocked(task1)).toBeNull();

      // Remove approval
      service.removeApproval(task1, task2, approver1);

      // Now blocked
      expect(service.isBlocked(task1)).not.toBeNull();
    });

    test('handles removal of non-existing approval gracefully', () => {
      const approver1 = 'en-approver1' as EntityId;
      const approver2 = 'en-approver2' as EntityId;

      createTestElement(task1, 'task', 'open');
      createTestElement(task2, 'task', 'open');
      createTestDependency(task1, task2, DependencyType.AWAITS, {
        gateType: GateType.APPROVAL,
        requiredApprovers: [approver1, approver2],
        currentApprovers: [approver1],
      });

      // Try to remove approver2 who hasn't approved
      const result = service.removeApproval(task1, task2, approver2);

      expect(result.success).toBe(true);
      expect(result.currentCount).toBe(1); // Unchanged
    });
  });

  // ==========================================================================
  // Edge Cases
  // ==========================================================================

  describe('edge cases', () => {
    test('handles circular parent-child references gracefully', () => {
      createTestElement(task1, 'task', 'open');
      createTestElement(task2, 'task', 'open');

      // Create circular reference (shouldn't happen in practice, but should handle)
      createTestDependency(task1, task2, DependencyType.PARENT_CHILD);
      createTestDependency(task2, task1, DependencyType.PARENT_CHILD);

      // Should not infinite loop
      expect(() => service.rebuild()).not.toThrow();
    });

    test('handles deep parent-child hierarchies', () => {
      // Create a chain of 5 tasks
      const tasks: ElementId[] = [];
      for (let i = 0; i < 5; i++) {
        const id = `el-chain${i}` as ElementId;
        tasks.push(id);
        createTestElement(id, 'task', i === 0 ? 'open' : 'open');
      }

      // Create parent-child chain: task0 <- task1 <- task2 <- task3 <- task4
      for (let i = 1; i < tasks.length; i++) {
        createTestDependency(tasks[i], tasks[i - 1], DependencyType.PARENT_CHILD);
      }

      // Block the first task
      const blocker = 'el-blocker' as ElementId;
      createTestElement(blocker, 'task', 'open');
      createTestDependency(tasks[0], blocker, DependencyType.BLOCKS);

      const result = service.rebuild();

      // All tasks should be blocked
      for (const task of tasks) {
        expect(service.isBlocked(task)).not.toBeNull();
      }

      expect(result.elementsBlocked).toBe(5);
    });

    test('handles multiple blocking reasons (first one wins)', () => {
      createTestElement(task1, 'task', 'open');
      createTestElement(task2, 'task', 'open');
      createTestElement(task3, 'task', 'open');
      createTestDependency(task1, task2, DependencyType.BLOCKS);
      createTestDependency(task1, task3, DependencyType.BLOCKS);

      service.rebuild();

      const result = service.isBlocked(task1);
      expect(result).not.toBeNull();
      // Should be blocked by one of them
      expect([task2, task3]).toContain(result!.blockedBy);
    });
  });
});

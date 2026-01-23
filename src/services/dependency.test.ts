import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import {
  DependencyService,
  createDependencyService,
  createDependencyAddedEvent,
  createDependencyRemovedEvent,
} from './dependency.js';
import { createBunStorage, BunStorageBackend } from '../storage/bun-backend.js';
import type { ElementId, EntityId } from '../types/element.js';
import {
  DependencyType,
  GateType,
  TestType,
  TestResult,
} from '../types/dependency.js';
import { EventType } from '../types/event.js';
import { NotFoundError, ConflictError } from '../errors/error.js';

// ============================================================================
// Test Setup
// ============================================================================

describe('DependencyService', () => {
  let db: BunStorageBackend;
  let service: DependencyService;

  // Test data
  const testEntity = 'el-testuser1' as EntityId;
  const sourceId1 = 'el-source123' as ElementId;
  const sourceId2 = 'el-source456' as ElementId;
  const targetId1 = 'el-target123' as ElementId;
  const targetId2 = 'el-target456' as ElementId;
  const targetId3 = 'el-target789' as ElementId;

  beforeEach(() => {
    // Create in-memory database for each test
    db = createBunStorage({ path: ':memory:' }) as BunStorageBackend;
    service = createDependencyService(db);
    service.initSchema();
  });

  afterEach(() => {
    db.close();
  });

  // ==========================================================================
  // Schema Initialization
  // ==========================================================================

  describe('initSchema', () => {
    test('creates dependencies table', () => {
      // Table should already exist from beforeEach
      const tables = db.query<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='dependencies'"
      );
      expect(tables).toHaveLength(1);
      expect(tables[0].name).toBe('dependencies');
    });

    test('creates indexes', () => {
      const indexes = db.query<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_dependencies%'"
      );
      expect(indexes.length).toBeGreaterThanOrEqual(3);
      const indexNames = indexes.map((i) => i.name);
      expect(indexNames).toContain('idx_dependencies_target');
      expect(indexNames).toContain('idx_dependencies_type');
      expect(indexNames).toContain('idx_dependencies_source_type');
    });

    test('is idempotent', () => {
      // Should not throw when called again
      expect(() => service.initSchema()).not.toThrow();
    });
  });

  // ==========================================================================
  // Add Dependency
  // ==========================================================================

  describe('addDependency', () => {
    test('adds a basic dependency', () => {
      const dep = service.addDependency({
        sourceId: sourceId1,
        targetId: targetId1,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });

      expect(dep.sourceId).toBe(sourceId1);
      expect(dep.targetId).toBe(targetId1);
      expect(dep.type).toBe(DependencyType.BLOCKS);
      expect(dep.createdBy).toBe(testEntity);
      expect(dep.createdAt).toBeDefined();
      expect(dep.metadata).toEqual({});
    });

    test('adds dependency with metadata', () => {
      const dep = service.addDependency({
        sourceId: sourceId1,
        targetId: targetId1,
        type: DependencyType.AWAITS,
        createdBy: testEntity,
        metadata: {
          gateType: GateType.TIMER,
          waitUntil: '2025-01-25T10:00:00.000Z',
        },
      });

      expect(dep.metadata).toEqual({
        gateType: GateType.TIMER,
        waitUntil: '2025-01-25T10:00:00.000Z',
      });
    });

    test('throws ConflictError for duplicate dependency', () => {
      service.addDependency({
        sourceId: sourceId1,
        targetId: targetId1,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });

      expect(() =>
        service.addDependency({
          sourceId: sourceId1,
          targetId: targetId1,
          type: DependencyType.BLOCKS,
          createdBy: testEntity,
        })
      ).toThrow(ConflictError);
    });

    test('allows different types between same elements', () => {
      service.addDependency({
        sourceId: sourceId1,
        targetId: targetId1,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });

      // Should not throw - different type
      const dep = service.addDependency({
        sourceId: sourceId1,
        targetId: targetId1,
        type: DependencyType.REFERENCES,
        createdBy: testEntity,
      });

      expect(dep.type).toBe(DependencyType.REFERENCES);
    });

    test('normalizes relates-to dependencies', () => {
      // Add with larger ID as source
      const dep = service.addDependency({
        sourceId: 'el-zzz' as ElementId,
        targetId: 'el-aaa' as ElementId,
        type: DependencyType.RELATES_TO,
        createdBy: testEntity,
      });

      // Should be normalized: smaller ID as source
      expect(dep.sourceId).toBe('el-aaa');
      expect(dep.targetId).toBe('el-zzz');
    });

    test('prevents duplicate relates-to in either direction', () => {
      service.addDependency({
        sourceId: 'el-aaa' as ElementId,
        targetId: 'el-zzz' as ElementId,
        type: DependencyType.RELATES_TO,
        createdBy: testEntity,
      });

      // Try adding in reverse direction - should fail as duplicate
      expect(() =>
        service.addDependency({
          sourceId: 'el-zzz' as ElementId,
          targetId: 'el-aaa' as ElementId,
          type: DependencyType.RELATES_TO,
          createdBy: testEntity,
        })
      ).toThrow(ConflictError);
    });

    test('validates required fields', () => {
      expect(() =>
        service.addDependency({
          sourceId: '' as ElementId,
          targetId: targetId1,
          type: DependencyType.BLOCKS,
          createdBy: testEntity,
        })
      ).toThrow();

      expect(() =>
        service.addDependency({
          sourceId: sourceId1,
          targetId: '' as ElementId,
          type: DependencyType.BLOCKS,
          createdBy: testEntity,
        })
      ).toThrow();

      expect(() =>
        service.addDependency({
          sourceId: sourceId1,
          targetId: targetId1,
          type: 'invalid' as DependencyType,
          createdBy: testEntity,
        })
      ).toThrow();
    });

    test('prevents self-reference', () => {
      expect(() =>
        service.addDependency({
          sourceId: sourceId1,
          targetId: sourceId1,
          type: DependencyType.BLOCKS,
          createdBy: testEntity,
        })
      ).toThrow();
    });
  });

  // ==========================================================================
  // Remove Dependency
  // ==========================================================================

  describe('removeDependency', () => {
    test('removes existing dependency', () => {
      service.addDependency({
        sourceId: sourceId1,
        targetId: targetId1,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });

      const result = service.removeDependency(
        sourceId1,
        targetId1,
        DependencyType.BLOCKS,
        testEntity
      );

      expect(result).toBe(true);
      expect(service.exists(sourceId1, targetId1, DependencyType.BLOCKS)).toBe(false);
    });

    test('throws NotFoundError for non-existent dependency', () => {
      expect(() =>
        service.removeDependency(
          sourceId1,
          targetId1,
          DependencyType.BLOCKS,
          testEntity
        )
      ).toThrow(NotFoundError);
    });

    test('handles relates-to normalization for removal', () => {
      // Add with normalization
      service.addDependency({
        sourceId: 'el-zzz' as ElementId,
        targetId: 'el-aaa' as ElementId,
        type: DependencyType.RELATES_TO,
        createdBy: testEntity,
      });

      // Remove with original (non-normalized) order
      const result = service.removeDependency(
        'el-zzz' as ElementId,
        'el-aaa' as ElementId,
        DependencyType.RELATES_TO,
        testEntity
      );

      expect(result).toBe(true);
    });

    test('validates inputs', () => {
      expect(() =>
        service.removeDependency(
          '' as ElementId,
          targetId1,
          DependencyType.BLOCKS,
          testEntity
        )
      ).toThrow();

      expect(() =>
        service.removeDependency(
          sourceId1,
          '' as ElementId,
          DependencyType.BLOCKS,
          testEntity
        )
      ).toThrow();
    });
  });

  // ==========================================================================
  // Get Dependencies
  // ==========================================================================

  describe('getDependencies', () => {
    beforeEach(() => {
      // Set up test dependencies
      service.addDependency({
        sourceId: sourceId1,
        targetId: targetId1,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });
      service.addDependency({
        sourceId: sourceId1,
        targetId: targetId2,
        type: DependencyType.REFERENCES,
        createdBy: testEntity,
      });
      service.addDependency({
        sourceId: sourceId1,
        targetId: targetId3,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });
      service.addDependency({
        sourceId: sourceId2,
        targetId: targetId1,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });
    });

    test('gets all dependencies from source', () => {
      const deps = service.getDependencies(sourceId1);
      expect(deps).toHaveLength(3);
    });

    test('filters by type', () => {
      const blockingDeps = service.getDependencies(sourceId1, DependencyType.BLOCKS);
      expect(blockingDeps).toHaveLength(2);
      blockingDeps.forEach((d) => {
        expect(d.type).toBe(DependencyType.BLOCKS);
      });

      const refDeps = service.getDependencies(sourceId1, DependencyType.REFERENCES);
      expect(refDeps).toHaveLength(1);
      expect(refDeps[0].targetId).toBe(targetId2);
    });

    test('returns empty array for source with no dependencies', () => {
      const deps = service.getDependencies('el-nonexistent' as ElementId);
      expect(deps).toEqual([]);
    });

    test('validates sourceId', () => {
      expect(() => service.getDependencies('' as ElementId)).toThrow();
    });
  });

  // ==========================================================================
  // Get Dependents
  // ==========================================================================

  describe('getDependents', () => {
    beforeEach(() => {
      // Multiple sources depending on same target
      service.addDependency({
        sourceId: sourceId1,
        targetId: targetId1,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });
      service.addDependency({
        sourceId: sourceId2,
        targetId: targetId1,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });
      service.addDependency({
        sourceId: sourceId1,
        targetId: targetId1,
        type: DependencyType.REFERENCES,
        createdBy: testEntity,
      });
    });

    test('gets all dependents of target', () => {
      const deps = service.getDependents(targetId1);
      expect(deps).toHaveLength(3);
    });

    test('filters by type', () => {
      const blockingDeps = service.getDependents(targetId1, DependencyType.BLOCKS);
      expect(blockingDeps).toHaveLength(2);
    });

    test('returns empty array for target with no dependents', () => {
      const deps = service.getDependents('el-nodeps' as ElementId);
      expect(deps).toEqual([]);
    });
  });

  // ==========================================================================
  // Get Related To
  // ==========================================================================

  describe('getRelatedTo', () => {
    test('finds relates-to dependencies where element is source', () => {
      service.addDependency({
        sourceId: 'el-aaa' as ElementId,
        targetId: 'el-bbb' as ElementId,
        type: DependencyType.RELATES_TO,
        createdBy: testEntity,
      });

      const related = service.getRelatedTo('el-aaa' as ElementId);
      expect(related).toHaveLength(1);
    });

    test('finds relates-to dependencies where element is target', () => {
      service.addDependency({
        sourceId: 'el-aaa' as ElementId,
        targetId: 'el-bbb' as ElementId,
        type: DependencyType.RELATES_TO,
        createdBy: testEntity,
      });

      const related = service.getRelatedTo('el-bbb' as ElementId);
      expect(related).toHaveLength(1);
    });

    test('finds multiple relates-to dependencies', () => {
      service.addDependency({
        sourceId: 'el-aaa' as ElementId,
        targetId: 'el-bbb' as ElementId,
        type: DependencyType.RELATES_TO,
        createdBy: testEntity,
      });
      service.addDependency({
        sourceId: 'el-aaa' as ElementId,
        targetId: 'el-ccc' as ElementId,
        type: DependencyType.RELATES_TO,
        createdBy: testEntity,
      });

      const related = service.getRelatedTo('el-aaa' as ElementId);
      expect(related).toHaveLength(2);
    });
  });

  // ==========================================================================
  // Exists
  // ==========================================================================

  describe('exists', () => {
    test('returns true for existing dependency', () => {
      service.addDependency({
        sourceId: sourceId1,
        targetId: targetId1,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });

      expect(service.exists(sourceId1, targetId1, DependencyType.BLOCKS)).toBe(true);
    });

    test('returns false for non-existing dependency', () => {
      expect(service.exists(sourceId1, targetId1, DependencyType.BLOCKS)).toBe(false);
    });

    test('handles relates-to normalization', () => {
      service.addDependency({
        sourceId: 'el-zzz' as ElementId,
        targetId: 'el-aaa' as ElementId,
        type: DependencyType.RELATES_TO,
        createdBy: testEntity,
      });

      // Check with original order
      expect(
        service.exists(
          'el-zzz' as ElementId,
          'el-aaa' as ElementId,
          DependencyType.RELATES_TO
        )
      ).toBe(true);

      // Check with reversed order
      expect(
        service.exists(
          'el-aaa' as ElementId,
          'el-zzz' as ElementId,
          DependencyType.RELATES_TO
        )
      ).toBe(true);
    });
  });

  // ==========================================================================
  // Get Single Dependency
  // ==========================================================================

  describe('getDependency', () => {
    test('returns dependency when exists', () => {
      service.addDependency({
        sourceId: sourceId1,
        targetId: targetId1,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });

      const dep = service.getDependency(sourceId1, targetId1, DependencyType.BLOCKS);
      expect(dep).toBeDefined();
      expect(dep!.sourceId).toBe(sourceId1);
      expect(dep!.targetId).toBe(targetId1);
      expect(dep!.type).toBe(DependencyType.BLOCKS);
    });

    test('returns undefined when not exists', () => {
      const dep = service.getDependency(sourceId1, targetId1, DependencyType.BLOCKS);
      expect(dep).toBeUndefined();
    });

    test('handles relates-to normalization', () => {
      service.addDependency({
        sourceId: 'el-zzz' as ElementId,
        targetId: 'el-aaa' as ElementId,
        type: DependencyType.RELATES_TO,
        createdBy: testEntity,
      });

      // Fetch with reversed order
      const dep = service.getDependency(
        'el-zzz' as ElementId,
        'el-aaa' as ElementId,
        DependencyType.RELATES_TO
      );

      expect(dep).toBeDefined();
      // The returned dependency should have normalized order
      expect(dep!.sourceId).toBe('el-aaa');
      expect(dep!.targetId).toBe('el-zzz');
    });
  });

  // ==========================================================================
  // Bulk Operations
  // ==========================================================================

  describe('getDependenciesForMany', () => {
    beforeEach(() => {
      service.addDependency({
        sourceId: sourceId1,
        targetId: targetId1,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });
      service.addDependency({
        sourceId: sourceId1,
        targetId: targetId2,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });
      service.addDependency({
        sourceId: sourceId2,
        targetId: targetId1,
        type: DependencyType.REFERENCES,
        createdBy: testEntity,
      });
    });

    test('gets dependencies for multiple sources', () => {
      const deps = service.getDependenciesForMany([sourceId1, sourceId2]);
      expect(deps).toHaveLength(3);
    });

    test('filters by type', () => {
      const deps = service.getDependenciesForMany(
        [sourceId1, sourceId2],
        DependencyType.BLOCKS
      );
      expect(deps).toHaveLength(2);
    });

    test('returns empty array for empty input', () => {
      const deps = service.getDependenciesForMany([]);
      expect(deps).toEqual([]);
    });
  });

  describe('removeAllDependencies', () => {
    beforeEach(() => {
      service.addDependency({
        sourceId: sourceId1,
        targetId: targetId1,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });
      service.addDependency({
        sourceId: sourceId1,
        targetId: targetId2,
        type: DependencyType.REFERENCES,
        createdBy: testEntity,
      });
    });

    test('removes all dependencies from source', () => {
      const count = service.removeAllDependencies(sourceId1);
      expect(count).toBe(2);
      expect(service.getDependencies(sourceId1)).toHaveLength(0);
    });

    test('removes only specified type', () => {
      const count = service.removeAllDependencies(sourceId1, DependencyType.BLOCKS);
      expect(count).toBe(1);
      expect(service.getDependencies(sourceId1)).toHaveLength(1);
    });

    test('returns 0 for source with no dependencies', () => {
      const count = service.removeAllDependencies('el-none' as ElementId);
      expect(count).toBe(0);
    });
  });

  describe('removeAllDependents', () => {
    beforeEach(() => {
      service.addDependency({
        sourceId: sourceId1,
        targetId: targetId1,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });
      service.addDependency({
        sourceId: sourceId2,
        targetId: targetId1,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });
    });

    test('removes all dependencies to target', () => {
      const count = service.removeAllDependents(targetId1);
      expect(count).toBe(2);
      expect(service.getDependents(targetId1)).toHaveLength(0);
    });

    test('returns 0 for target with no dependents', () => {
      const count = service.removeAllDependents('el-none' as ElementId);
      expect(count).toBe(0);
    });
  });

  // ==========================================================================
  // Count Operations
  // ==========================================================================

  describe('countDependencies', () => {
    test('counts dependencies from source', () => {
      service.addDependency({
        sourceId: sourceId1,
        targetId: targetId1,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });
      service.addDependency({
        sourceId: sourceId1,
        targetId: targetId2,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });

      expect(service.countDependencies(sourceId1)).toBe(2);
    });

    test('counts by type', () => {
      service.addDependency({
        sourceId: sourceId1,
        targetId: targetId1,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });
      service.addDependency({
        sourceId: sourceId1,
        targetId: targetId2,
        type: DependencyType.REFERENCES,
        createdBy: testEntity,
      });

      expect(service.countDependencies(sourceId1, DependencyType.BLOCKS)).toBe(1);
    });

    test('returns 0 for no dependencies', () => {
      expect(service.countDependencies(sourceId1)).toBe(0);
    });
  });

  describe('countDependents', () => {
    test('counts dependents of target', () => {
      service.addDependency({
        sourceId: sourceId1,
        targetId: targetId1,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });
      service.addDependency({
        sourceId: sourceId2,
        targetId: targetId1,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });

      expect(service.countDependents(targetId1)).toBe(2);
    });

    test('counts by type', () => {
      service.addDependency({
        sourceId: sourceId1,
        targetId: targetId1,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });
      service.addDependency({
        sourceId: sourceId2,
        targetId: targetId1,
        type: DependencyType.REFERENCES,
        createdBy: testEntity,
      });

      expect(service.countDependents(targetId1, DependencyType.BLOCKS)).toBe(1);
    });

    test('returns 0 for no dependents', () => {
      expect(service.countDependents(targetId1)).toBe(0);
    });
  });

  // ==========================================================================
  // All Dependency Types
  // ==========================================================================

  describe('all dependency types', () => {
    const allTypes = [
      // Blocking
      DependencyType.BLOCKS,
      DependencyType.PARENT_CHILD,
      DependencyType.AWAITS,
      // Associative
      DependencyType.RELATES_TO,
      DependencyType.REFERENCES,
      DependencyType.SUPERSEDES,
      DependencyType.DUPLICATES,
      DependencyType.CAUSED_BY,
      DependencyType.VALIDATES,
      // Attribution
      DependencyType.AUTHORED_BY,
      DependencyType.ASSIGNED_TO,
      DependencyType.APPROVED_BY,
      // Threading
      DependencyType.REPLIES_TO,
    ];

    test.each(allTypes)('supports %s dependency type', (type) => {
      // Use different source/target for relates-to to avoid normalization issues
      const src = type === DependencyType.RELATES_TO ? 'el-aaa' as ElementId : sourceId1;
      const tgt = type === DependencyType.RELATES_TO ? 'el-bbb' as ElementId : targetId1;

      // Awaits and validates require specific metadata
      let metadata: Record<string, unknown> | undefined;
      if (type === DependencyType.AWAITS) {
        metadata = {
          gateType: GateType.TIMER,
          waitUntil: '2025-01-25T10:00:00.000Z',
        };
      } else if (type === DependencyType.VALIDATES) {
        metadata = {
          testType: TestType.UNIT,
          result: TestResult.PASS,
        };
      }

      const dep = service.addDependency({
        sourceId: src,
        targetId: tgt,
        type,
        createdBy: testEntity,
        metadata,
      });

      expect(dep.type).toBe(type);
      expect(service.exists(src, tgt, type)).toBe(true);
    });
  });

  // ==========================================================================
  // Metadata Handling
  // ==========================================================================

  describe('metadata handling', () => {
    test('stores and retrieves awaits timer metadata', () => {
      service.addDependency({
        sourceId: sourceId1,
        targetId: targetId1,
        type: DependencyType.AWAITS,
        createdBy: testEntity,
        metadata: {
          gateType: GateType.TIMER,
          waitUntil: '2025-01-25T10:00:00.000Z',
        },
      });

      const dep = service.getDependency(sourceId1, targetId1, DependencyType.AWAITS);
      expect(dep?.metadata).toEqual({
        gateType: GateType.TIMER,
        waitUntil: '2025-01-25T10:00:00.000Z',
      });
    });

    test('stores and retrieves awaits approval metadata', () => {
      service.addDependency({
        sourceId: sourceId1,
        targetId: targetId1,
        type: DependencyType.AWAITS,
        createdBy: testEntity,
        metadata: {
          gateType: GateType.APPROVAL,
          requiredApprovers: ['el-user1', 'el-user2'],
          approvalCount: 1,
        },
      });

      const dep = service.getDependency(sourceId1, targetId1, DependencyType.AWAITS);
      expect(dep?.metadata.gateType).toBe(GateType.APPROVAL);
      expect(dep?.metadata.requiredApprovers).toEqual(['el-user1', 'el-user2']);
    });

    test('stores and retrieves validates metadata', () => {
      service.addDependency({
        sourceId: sourceId1,
        targetId: targetId1,
        type: DependencyType.VALIDATES,
        createdBy: testEntity,
        metadata: {
          testType: TestType.UNIT,
          result: TestResult.PASS,
          details: 'All tests passed',
        },
      });

      const dep = service.getDependency(sourceId1, targetId1, DependencyType.VALIDATES);
      expect(dep?.metadata).toEqual({
        testType: TestType.UNIT,
        result: TestResult.PASS,
        details: 'All tests passed',
      });
    });

    test('handles empty metadata', () => {
      service.addDependency({
        sourceId: sourceId1,
        targetId: targetId1,
        type: DependencyType.BLOCKS,
        createdBy: testEntity,
      });

      const dep = service.getDependency(sourceId1, targetId1, DependencyType.BLOCKS);
      expect(dep?.metadata).toEqual({});
    });
  });

  // ==========================================================================
  // Factory Function
  // ==========================================================================

  describe('createDependencyService', () => {
    test('creates service instance', () => {
      const newService = createDependencyService(db);
      expect(newService).toBeInstanceOf(DependencyService);
    });
  });
});

// ============================================================================
// Event Creation Helpers Tests
// ============================================================================

describe('Dependency Event Helpers', () => {
  const testEntity = 'el-testuser1' as EntityId;
  const sourceId = 'el-source123' as ElementId;
  const targetId = 'el-target456' as ElementId;

  describe('createDependencyAddedEvent', () => {
    test('creates event with correct type', () => {
      const dependency = {
        sourceId,
        targetId,
        type: DependencyType.BLOCKS,
        createdAt: '2025-01-22T10:00:00.000Z',
        createdBy: testEntity,
        metadata: {},
      };

      const event = createDependencyAddedEvent(dependency);

      expect(event.eventType).toBe(EventType.DEPENDENCY_ADDED);
      expect(event.elementId).toBe(sourceId);
      expect(event.actor).toBe(testEntity);
      expect(event.oldValue).toBeNull();
      expect(event.newValue).toEqual({
        sourceId,
        targetId,
        type: DependencyType.BLOCKS,
        metadata: {},
      });
      expect(event.createdAt).toBeDefined();
    });

    test('includes metadata in event', () => {
      const metadata = {
        gateType: GateType.TIMER,
        waitUntil: '2025-01-25T10:00:00.000Z',
      };

      const dependency = {
        sourceId,
        targetId,
        type: DependencyType.AWAITS,
        createdAt: '2025-01-22T10:00:00.000Z',
        createdBy: testEntity,
        metadata,
      };

      const event = createDependencyAddedEvent(dependency);

      expect(event.newValue).toEqual({
        sourceId,
        targetId,
        type: DependencyType.AWAITS,
        metadata,
      });
    });
  });

  describe('createDependencyRemovedEvent', () => {
    test('creates event with correct type', () => {
      const dependency = {
        sourceId,
        targetId,
        type: DependencyType.BLOCKS,
        createdAt: '2025-01-22T10:00:00.000Z',
        createdBy: testEntity,
        metadata: {},
      };

      const actor = 'el-remover1' as EntityId;
      const event = createDependencyRemovedEvent(dependency, actor);

      expect(event.eventType).toBe(EventType.DEPENDENCY_REMOVED);
      expect(event.elementId).toBe(sourceId);
      expect(event.actor).toBe(actor);
      expect(event.oldValue).toEqual({
        sourceId,
        targetId,
        type: DependencyType.BLOCKS,
        metadata: {},
      });
      expect(event.newValue).toBeNull();
      expect(event.createdAt).toBeDefined();
    });

    test('uses different actor than creator', () => {
      const dependency = {
        sourceId,
        targetId,
        type: DependencyType.REFERENCES,
        createdAt: '2025-01-22T10:00:00.000Z',
        createdBy: testEntity,
        metadata: {},
      };

      const differentActor = 'el-admin1' as EntityId;
      const event = createDependencyRemovedEvent(dependency, differentActor);

      expect(event.actor).toBe(differentActor);
      expect(event.actor).not.toBe(dependency.createdBy);
    });
  });
});

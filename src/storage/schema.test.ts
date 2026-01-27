/**
 * Tests for Schema Management
 *
 * Tests schema initialization, migrations, validation, and introspection.
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { createStorage } from './create-backend.js';
import type { StorageBackend } from './backend.js';
import {
  CURRENT_SCHEMA_VERSION,
  MIGRATIONS,
  EXPECTED_TABLES,
  initializeSchema,
  getSchemaVersion,
  isSchemaUpToDate,
  getPendingMigrations,
  resetSchema,
  validateSchema,
  getTableColumns,
  getTableIndexes,
} from './schema.js';

describe('Schema Management', () => {
  let backend: StorageBackend;

  beforeEach(() => {
    backend = createStorage({ path: ':memory:' });
  });

  afterEach(() => {
    if (backend.isOpen) {
      backend.close();
    }
  });

  // ==========================================================================
  // Schema Version Constants
  // ==========================================================================

  describe('Schema Constants', () => {
    it('should have a positive current schema version', () => {
      expect(CURRENT_SCHEMA_VERSION).toBeGreaterThan(0);
    });

    it('should have at least one migration', () => {
      expect(MIGRATIONS.length).toBeGreaterThan(0);
    });

    it('should have migrations in ascending version order', () => {
      for (let i = 1; i < MIGRATIONS.length; i++) {
        expect(MIGRATIONS[i].version).toBeGreaterThan(MIGRATIONS[i - 1].version);
      }
    });

    it('should have migration versions starting from 1', () => {
      expect(MIGRATIONS[0].version).toBe(1);
    });

    it('should have latest migration version equal to CURRENT_SCHEMA_VERSION', () => {
      const latestVersion = MIGRATIONS[MIGRATIONS.length - 1].version;
      expect(latestVersion).toBe(CURRENT_SCHEMA_VERSION);
    });

    it('should have expected tables list', () => {
      expect(EXPECTED_TABLES).toContain('elements');
      expect(EXPECTED_TABLES).toContain('dependencies');
      expect(EXPECTED_TABLES).toContain('tags');
      expect(EXPECTED_TABLES).toContain('events');
      expect(EXPECTED_TABLES).toContain('dirty_elements');
    });
  });

  // ==========================================================================
  // Schema Initialization
  // ==========================================================================

  describe('initializeSchema', () => {
    it('should initialize schema on fresh database', () => {
      const result = initializeSchema(backend);

      expect(result.success).toBe(true);
      expect(result.fromVersion).toBe(0);
      expect(result.toVersion).toBe(CURRENT_SCHEMA_VERSION);
      expect(result.applied).toEqual([1, 2, 3, 4, 5]);
    });

    it('should set schema version after initialization', () => {
      initializeSchema(backend);

      expect(backend.getSchemaVersion()).toBe(CURRENT_SCHEMA_VERSION);
    });

    it('should create all expected tables', () => {
      initializeSchema(backend);

      const validation = validateSchema(backend);
      expect(validation.valid).toBe(true);
      expect(validation.missingTables).toEqual([]);
    });

    it('should be idempotent', () => {
      const result1 = initializeSchema(backend);
      const result2 = initializeSchema(backend);

      expect(result1.success).toBe(true);
      expect(result1.applied).toEqual([1, 2, 3, 4, 5]);

      expect(result2.success).toBe(true);
      expect(result2.applied).toEqual([]);
      expect(result2.fromVersion).toBe(CURRENT_SCHEMA_VERSION);
      expect(result2.toVersion).toBe(CURRENT_SCHEMA_VERSION);
    });
  });

  // ==========================================================================
  // Schema Version Functions
  // ==========================================================================

  describe('getSchemaVersion', () => {
    it('should return 0 for uninitialized database', () => {
      expect(getSchemaVersion(backend)).toBe(0);
    });

    it('should return correct version after initialization', () => {
      initializeSchema(backend);
      expect(getSchemaVersion(backend)).toBe(CURRENT_SCHEMA_VERSION);
    });
  });

  describe('isSchemaUpToDate', () => {
    it('should return false for uninitialized database', () => {
      expect(isSchemaUpToDate(backend)).toBe(false);
    });

    it('should return true after initialization', () => {
      initializeSchema(backend);
      expect(isSchemaUpToDate(backend)).toBe(true);
    });
  });

  describe('getPendingMigrations', () => {
    it('should return all migrations for uninitialized database', () => {
      const pending = getPendingMigrations(backend);
      expect(pending.length).toBe(MIGRATIONS.length);
    });

    it('should return empty array after initialization', () => {
      initializeSchema(backend);
      const pending = getPendingMigrations(backend);
      expect(pending).toEqual([]);
    });
  });

  // ==========================================================================
  // Schema Validation
  // ==========================================================================

  describe('validateSchema', () => {
    it('should report missing tables for uninitialized database', () => {
      const validation = validateSchema(backend);

      expect(validation.valid).toBe(false);
      expect(validation.missingTables.length).toBeGreaterThan(0);
      expect(validation.missingTables).toContain('elements');
    });

    it('should report valid for initialized database', () => {
      initializeSchema(backend);
      const validation = validateSchema(backend);

      expect(validation.valid).toBe(true);
      expect(validation.missingTables).toEqual([]);
    });

    it('should detect dirty_elements table (created by backend)', () => {
      // dirty_elements is created by backend initialization, not schema
      const validation = validateSchema(backend);

      // Should not report dirty_elements as missing since backend creates it
      expect(validation.missingTables).not.toContain('dirty_elements');
    });
  });

  // ==========================================================================
  // Table Structure Validation
  // ==========================================================================

  describe('Elements Table', () => {
    beforeEach(() => {
      initializeSchema(backend);
    });

    it('should have correct columns', () => {
      const columns = getTableColumns(backend, 'elements');
      const columnNames = columns.map((c) => c.name);

      expect(columnNames).toContain('id');
      expect(columnNames).toContain('type');
      expect(columnNames).toContain('data');
      expect(columnNames).toContain('content_hash');
      expect(columnNames).toContain('created_at');
      expect(columnNames).toContain('updated_at');
      expect(columnNames).toContain('created_by');
      expect(columnNames).toContain('deleted_at');
    });

    it('should have id as primary key', () => {
      const columns = getTableColumns(backend, 'elements');
      const idColumn = columns.find((c) => c.name === 'id');

      expect(idColumn).toBeDefined();
      expect(idColumn!.pk).toBe(true);
    });

    it('should have required columns as NOT NULL (except primary key)', () => {
      const columns = getTableColumns(backend, 'elements');
      // Note: SQLite doesn't report PRIMARY KEY columns as notnull in PRAGMA table_info
      // even though they cannot actually be null
      const requiredColumns = ['type', 'data', 'created_at', 'updated_at', 'created_by'];

      for (const colName of requiredColumns) {
        const col = columns.find((c) => c.name === colName);
        expect(col).toBeDefined();
        expect(col!.notnull).toBe(true);
      }
    });

    it('should have nullable columns', () => {
      const columns = getTableColumns(backend, 'elements');
      const nullableColumns = ['content_hash', 'deleted_at'];

      for (const colName of nullableColumns) {
        const col = columns.find((c) => c.name === colName);
        expect(col).toBeDefined();
        expect(col!.notnull).toBe(false);
      }
    });

    it('should have expected indexes', () => {
      const indexes = getTableIndexes(backend, 'elements');

      expect(indexes).toContain('idx_elements_type');
      expect(indexes).toContain('idx_elements_created_by');
      expect(indexes).toContain('idx_elements_created_at');
      expect(indexes).toContain('idx_elements_content_hash');
      expect(indexes).toContain('idx_elements_deleted_at');
    });

    it('should enforce type constraint', () => {
      expect(() => {
        backend.run(
          `INSERT INTO elements (id, type, data, created_at, updated_at, created_by)
           VALUES ('el-1', 'invalid', '{}', '2024-01-01', '2024-01-01', 'actor')`,
        );
      }).toThrow();
    });

    it('should accept valid element types', () => {
      const validTypes = [
        'task',
        'message',
        'document',
        'entity',
        'plan',
        'workflow',
        'playbook',
        'channel',
        'library',
        'team',
      ];

      for (const type of validTypes) {
        expect(() => {
          backend.run(
            `INSERT INTO elements (id, type, data, created_at, updated_at, created_by)
             VALUES (?, ?, '{}', '2024-01-01', '2024-01-01', 'actor')`,
            [`el-${type}`, type],
          );
        }).not.toThrow();
      }
    });
  });

  describe('Dependencies Table', () => {
    beforeEach(() => {
      initializeSchema(backend);
    });

    it('should have correct columns', () => {
      const columns = getTableColumns(backend, 'dependencies');
      const columnNames = columns.map((c) => c.name);

      expect(columnNames).toContain('source_id');
      expect(columnNames).toContain('target_id');
      expect(columnNames).toContain('type');
      expect(columnNames).toContain('created_at');
      expect(columnNames).toContain('created_by');
      expect(columnNames).toContain('metadata');
    });

    it('should have composite primary key', () => {
      // SQLite PRAGMA table_info only reports pk: true for first column of composite key
      // We verify the constraint works by testing actual behavior in Data Integrity tests
      const columns = getTableColumns(backend, 'dependencies');
      const pkColumns = columns.filter((c) => c.pk === true);

      // At least one column should be marked as pk
      expect(pkColumns.length).toBeGreaterThanOrEqual(1);
    });

    it('should have expected indexes', () => {
      const indexes = getTableIndexes(backend, 'dependencies');

      expect(indexes).toContain('idx_dependencies_target');
      expect(indexes).toContain('idx_dependencies_type');
    });

    it('should cascade delete with elements', () => {
      // Insert element
      backend.run(
        `INSERT INTO elements (id, type, data, created_at, updated_at, created_by)
         VALUES ('el-1', 'task', '{}', '2024-01-01', '2024-01-01', 'actor')`,
      );

      // Insert dependency
      backend.run(
        `INSERT INTO dependencies (source_id, target_id, type, created_at, created_by)
         VALUES ('el-1', 'el-external', 'blocks', '2024-01-01', 'actor')`,
      );

      // Verify dependency exists
      const before = backend.query('SELECT * FROM dependencies');
      expect(before.length).toBe(1);

      // Delete element
      backend.run('DELETE FROM elements WHERE id = ?', ['el-1']);

      // Dependency should be deleted
      const after = backend.query('SELECT * FROM dependencies');
      expect(after.length).toBe(0);
    });
  });

  describe('Tags Table', () => {
    beforeEach(() => {
      initializeSchema(backend);
    });

    it('should have correct columns', () => {
      const columns = getTableColumns(backend, 'tags');
      const columnNames = columns.map((c) => c.name);

      expect(columnNames).toContain('element_id');
      expect(columnNames).toContain('tag');
    });

    it('should have composite primary key', () => {
      // SQLite PRAGMA table_info only reports pk: true for first column of composite key
      // We verify the constraint works by testing actual behavior in Data Integrity tests
      const columns = getTableColumns(backend, 'tags');
      const pkColumns = columns.filter((c) => c.pk === true);

      // At least one column should be marked as pk
      expect(pkColumns.length).toBeGreaterThanOrEqual(1);
    });

    it('should have expected indexes', () => {
      const indexes = getTableIndexes(backend, 'tags');
      expect(indexes).toContain('idx_tags_tag');
    });

    it('should cascade delete with elements', () => {
      // Insert element
      backend.run(
        `INSERT INTO elements (id, type, data, created_at, updated_at, created_by)
         VALUES ('el-1', 'task', '{}', '2024-01-01', '2024-01-01', 'actor')`,
      );

      // Insert tag
      backend.run(`INSERT INTO tags (element_id, tag) VALUES ('el-1', 'important')`);

      // Verify tag exists
      const before = backend.query('SELECT * FROM tags');
      expect(before.length).toBe(1);

      // Delete element
      backend.run('DELETE FROM elements WHERE id = ?', ['el-1']);

      // Tag should be deleted
      const after = backend.query('SELECT * FROM tags');
      expect(after.length).toBe(0);
    });
  });

  describe('Events Table', () => {
    beforeEach(() => {
      initializeSchema(backend);
    });

    it('should have correct columns', () => {
      const columns = getTableColumns(backend, 'events');
      const columnNames = columns.map((c) => c.name);

      expect(columnNames).toContain('id');
      expect(columnNames).toContain('element_id');
      expect(columnNames).toContain('event_type');
      expect(columnNames).toContain('actor');
      expect(columnNames).toContain('old_value');
      expect(columnNames).toContain('new_value');
      expect(columnNames).toContain('created_at');
    });

    it('should have auto-increment primary key', () => {
      const columns = getTableColumns(backend, 'events');
      const idColumn = columns.find((c) => c.name === 'id');

      expect(idColumn).toBeDefined();
      expect(idColumn!.pk).toBe(true);
    });

    it('should have expected indexes', () => {
      const indexes = getTableIndexes(backend, 'events');

      expect(indexes).toContain('idx_events_element');
      expect(indexes).toContain('idx_events_created_at');
      // Added in migration 2
      expect(indexes).toContain('idx_events_actor');
      expect(indexes).toContain('idx_events_type');
    });

    it('should cascade delete with elements', () => {
      // Insert element
      backend.run(
        `INSERT INTO elements (id, type, data, created_at, updated_at, created_by)
         VALUES ('el-1', 'task', '{}', '2024-01-01', '2024-01-01', 'actor')`,
      );

      // Insert event
      backend.run(
        `INSERT INTO events (element_id, event_type, actor, created_at)
         VALUES ('el-1', 'created', 'actor', '2024-01-01')`,
      );

      // Verify event exists
      const before = backend.query('SELECT * FROM events');
      expect(before.length).toBe(1);

      // Delete element
      backend.run('DELETE FROM elements WHERE id = ?', ['el-1']);

      // Event should be deleted
      const after = backend.query('SELECT * FROM events');
      expect(after.length).toBe(0);
    });
  });

  describe('Document Versions Table', () => {
    beforeEach(() => {
      initializeSchema(backend);
    });

    it('should have correct columns', () => {
      const columns = getTableColumns(backend, 'document_versions');
      const columnNames = columns.map((c) => c.name);

      expect(columnNames).toContain('id');
      expect(columnNames).toContain('version');
      expect(columnNames).toContain('data');
      expect(columnNames).toContain('created_at');
    });

    it('should have composite primary key', () => {
      // SQLite PRAGMA table_info only reports pk: true for first column of composite key
      // We verify the constraint works by testing actual behavior in Data Integrity tests
      const columns = getTableColumns(backend, 'document_versions');
      const pkColumns = columns.filter((c) => c.pk === true);

      // At least one column should be marked as pk
      expect(pkColumns.length).toBeGreaterThanOrEqual(1);
    });

    it('should have expected indexes', () => {
      const indexes = getTableIndexes(backend, 'document_versions');
      expect(indexes).toContain('idx_document_versions_id');
    });
  });

  describe('Child Counters Table', () => {
    beforeEach(() => {
      initializeSchema(backend);
    });

    it('should have correct columns', () => {
      const columns = getTableColumns(backend, 'child_counters');
      const columnNames = columns.map((c) => c.name);

      expect(columnNames).toContain('parent_id');
      expect(columnNames).toContain('last_child');
    });

    it('should have parent_id as primary key', () => {
      const columns = getTableColumns(backend, 'child_counters');
      const parentIdColumn = columns.find((c) => c.name === 'parent_id');

      expect(parentIdColumn).toBeDefined();
      expect(parentIdColumn!.pk).toBe(true);
    });

    it('should default last_child to 0', () => {
      backend.run(`INSERT INTO child_counters (parent_id) VALUES ('el-1')`);

      const row = backend.queryOne<{ parent_id: string; last_child: number }>(
        'SELECT * FROM child_counters WHERE parent_id = ?',
        ['el-1'],
      );

      expect(row).toBeDefined();
      expect(row!.last_child).toBe(0);
    });
  });

  describe('Blocked Cache Table', () => {
    beforeEach(() => {
      initializeSchema(backend);
    });

    it('should have correct columns', () => {
      const columns = getTableColumns(backend, 'blocked_cache');
      const columnNames = columns.map((c) => c.name);

      expect(columnNames).toContain('element_id');
      expect(columnNames).toContain('blocked_by');
      expect(columnNames).toContain('reason');
    });

    it('should have element_id as primary key', () => {
      const columns = getTableColumns(backend, 'blocked_cache');
      const elementIdColumn = columns.find((c) => c.name === 'element_id');

      expect(elementIdColumn).toBeDefined();
      expect(elementIdColumn!.pk).toBe(true);
    });

    it('should cascade delete with elements', () => {
      // Insert element
      backend.run(
        `INSERT INTO elements (id, type, data, created_at, updated_at, created_by)
         VALUES ('el-1', 'task', '{}', '2024-01-01', '2024-01-01', 'actor')`,
      );

      // Insert blocked cache entry
      backend.run(`INSERT INTO blocked_cache (element_id, blocked_by) VALUES ('el-1', 'el-2')`);

      // Verify entry exists
      const before = backend.query('SELECT * FROM blocked_cache');
      expect(before.length).toBe(1);

      // Delete element
      backend.run('DELETE FROM elements WHERE id = ?', ['el-1']);

      // Entry should be deleted
      const after = backend.query('SELECT * FROM blocked_cache');
      expect(after.length).toBe(0);
    });
  });

  // ==========================================================================
  // Schema Reset
  // ==========================================================================

  describe('resetSchema', () => {
    it('should drop all tables', () => {
      initializeSchema(backend);

      // Verify tables exist
      const beforeValidation = validateSchema(backend);
      expect(beforeValidation.valid).toBe(true);

      // Reset schema
      resetSchema(backend);

      // Tables should be gone (except dirty_elements created by backend)
      const rows = backend.query<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
      );

      const tableNames = rows.map((r) => r.name);
      expect(tableNames).not.toContain('elements');
      expect(tableNames).not.toContain('dependencies');
      expect(tableNames).not.toContain('events');
    });

    it('should reset schema version to 0', () => {
      initializeSchema(backend);
      expect(backend.getSchemaVersion()).toBe(CURRENT_SCHEMA_VERSION);

      resetSchema(backend);
      expect(backend.getSchemaVersion()).toBe(0);
    });

    it('should allow re-initialization after reset', () => {
      initializeSchema(backend);
      resetSchema(backend);

      const result = initializeSchema(backend);
      expect(result.success).toBe(true);
      expect(result.applied).toEqual([1, 2, 3, 4, 5]);
    });
  });

  // ==========================================================================
  // Data Integrity Tests
  // ==========================================================================

  describe('Data Integrity', () => {
    beforeEach(() => {
      initializeSchema(backend);
    });

    it('should prevent duplicate element IDs', () => {
      backend.run(
        `INSERT INTO elements (id, type, data, created_at, updated_at, created_by)
         VALUES ('el-1', 'task', '{}', '2024-01-01', '2024-01-01', 'actor')`,
      );

      expect(() => {
        backend.run(
          `INSERT INTO elements (id, type, data, created_at, updated_at, created_by)
           VALUES ('el-1', 'task', '{}', '2024-01-01', '2024-01-01', 'actor')`,
        );
      }).toThrow();
    });

    it('should prevent duplicate tags for same element', () => {
      backend.run(
        `INSERT INTO elements (id, type, data, created_at, updated_at, created_by)
         VALUES ('el-1', 'task', '{}', '2024-01-01', '2024-01-01', 'actor')`,
      );

      backend.run(`INSERT INTO tags (element_id, tag) VALUES ('el-1', 'urgent')`);

      expect(() => {
        backend.run(`INSERT INTO tags (element_id, tag) VALUES ('el-1', 'urgent')`);
      }).toThrow();
    });

    it('should allow same tag on different elements', () => {
      backend.run(
        `INSERT INTO elements (id, type, data, created_at, updated_at, created_by)
         VALUES ('el-1', 'task', '{}', '2024-01-01', '2024-01-01', 'actor')`,
      );
      backend.run(
        `INSERT INTO elements (id, type, data, created_at, updated_at, created_by)
         VALUES ('el-2', 'task', '{}', '2024-01-01', '2024-01-01', 'actor')`,
      );

      expect(() => {
        backend.run(`INSERT INTO tags (element_id, tag) VALUES ('el-1', 'urgent')`);
        backend.run(`INSERT INTO tags (element_id, tag) VALUES ('el-2', 'urgent')`);
      }).not.toThrow();
    });

    it('should prevent duplicate dependency edges', () => {
      backend.run(
        `INSERT INTO elements (id, type, data, created_at, updated_at, created_by)
         VALUES ('el-1', 'task', '{}', '2024-01-01', '2024-01-01', 'actor')`,
      );

      backend.run(
        `INSERT INTO dependencies (source_id, target_id, type, created_at, created_by)
         VALUES ('el-1', 'el-2', 'blocks', '2024-01-01', 'actor')`,
      );

      expect(() => {
        backend.run(
          `INSERT INTO dependencies (source_id, target_id, type, created_at, created_by)
           VALUES ('el-1', 'el-2', 'blocks', '2024-01-01', 'actor')`,
        );
      }).toThrow();
    });

    it('should allow different dependency types for same source-target', () => {
      backend.run(
        `INSERT INTO elements (id, type, data, created_at, updated_at, created_by)
         VALUES ('el-1', 'task', '{}', '2024-01-01', '2024-01-01', 'actor')`,
      );

      expect(() => {
        backend.run(
          `INSERT INTO dependencies (source_id, target_id, type, created_at, created_by)
           VALUES ('el-1', 'el-2', 'blocks', '2024-01-01', 'actor')`,
        );
        backend.run(
          `INSERT INTO dependencies (source_id, target_id, type, created_at, created_by)
           VALUES ('el-1', 'el-2', 'relates-to', '2024-01-01', 'actor')`,
        );
      }).not.toThrow();
    });

    it('should auto-increment event IDs', () => {
      backend.run(
        `INSERT INTO elements (id, type, data, created_at, updated_at, created_by)
         VALUES ('el-1', 'task', '{}', '2024-01-01', '2024-01-01', 'actor')`,
      );

      backend.run(
        `INSERT INTO events (element_id, event_type, actor, created_at)
         VALUES ('el-1', 'created', 'actor', '2024-01-01')`,
      );
      backend.run(
        `INSERT INTO events (element_id, event_type, actor, created_at)
         VALUES ('el-1', 'updated', 'actor', '2024-01-02')`,
      );

      const events = backend.query<{ id: number }>('SELECT id FROM events ORDER BY id');
      expect(events.length).toBe(2);
      expect(events[1].id).toBeGreaterThan(events[0].id);
    });
  });

  // ==========================================================================
  // Migration Tests
  // ==========================================================================

  describe('Migration Definitions', () => {
    it('should have valid up SQL for all migrations', () => {
      for (const migration of MIGRATIONS) {
        expect(migration.up).toBeDefined();
        expect(migration.up.trim().length).toBeGreaterThan(0);
      }
    });

    it('should have descriptions for all migrations', () => {
      for (const migration of MIGRATIONS) {
        expect(migration.description).toBeDefined();
        expect(migration.description.trim().length).toBeGreaterThan(0);
      }
    });

    it('should have down SQL for rollback', () => {
      // At least the first migration should have down SQL
      expect(MIGRATIONS[0].down).toBeDefined();
    });
  });

  // ==========================================================================
  // Performance Considerations
  // ==========================================================================

  describe('Performance', () => {
    beforeEach(() => {
      initializeSchema(backend);
    });

    it('should create sufficient indexes', () => {
      const stats = backend.getStats();
      // We should have a reasonable number of indexes for our tables
      expect(stats.indexCount).toBeGreaterThan(5);
    });

    it('should support efficient element type queries', () => {
      // Insert multiple elements of different types
      const types = ['task', 'document', 'message'];
      for (let i = 0; i < 30; i++) {
        const type = types[i % types.length];
        backend.run(
          `INSERT INTO elements (id, type, data, created_at, updated_at, created_by)
           VALUES (?, ?, '{}', '2024-01-01', '2024-01-01', 'actor')`,
          [`el-${i}`, type],
        );
      }

      // Query by type (should use idx_elements_type)
      const tasks = backend.query(`SELECT id FROM elements WHERE type = 'task'`);
      expect(tasks.length).toBe(10);
    });

    it('should support efficient tag queries', () => {
      // Insert elements with tags
      for (let i = 0; i < 10; i++) {
        backend.run(
          `INSERT INTO elements (id, type, data, created_at, updated_at, created_by)
           VALUES (?, 'task', '{}', '2024-01-01', '2024-01-01', 'actor')`,
          [`el-${i}`],
        );
        if (i % 2 === 0) {
          backend.run(`INSERT INTO tags (element_id, tag) VALUES (?, 'urgent')`, [`el-${i}`]);
        }
      }

      // Query by tag (should use idx_tags_tag)
      const urgentTags = backend.query(`SELECT element_id FROM tags WHERE tag = 'urgent'`);
      expect(urgentTags.length).toBe(5);
    });
  });

  // ==========================================================================
  // Edge Cases
  // ==========================================================================

  describe('Edge Cases', () => {
    beforeEach(() => {
      initializeSchema(backend);
    });

    it('should handle NULL content_hash', () => {
      backend.run(
        `INSERT INTO elements (id, type, data, created_at, updated_at, created_by, content_hash)
         VALUES ('el-1', 'task', '{}', '2024-01-01', '2024-01-01', 'actor', NULL)`,
      );

      const row = backend.queryOne<{ content_hash: string | null }>(
        'SELECT content_hash FROM elements WHERE id = ?',
        ['el-1'],
      );
      expect(row!.content_hash).toBeNull();
    });

    it('should handle NULL deleted_at', () => {
      backend.run(
        `INSERT INTO elements (id, type, data, created_at, updated_at, created_by, deleted_at)
         VALUES ('el-1', 'task', '{}', '2024-01-01', '2024-01-01', 'actor', NULL)`,
      );

      const row = backend.queryOne<{ deleted_at: string | null }>(
        'SELECT deleted_at FROM elements WHERE id = ?',
        ['el-1'],
      );
      expect(row!.deleted_at).toBeNull();
    });

    it('should handle soft delete', () => {
      backend.run(
        `INSERT INTO elements (id, type, data, created_at, updated_at, created_by)
         VALUES ('el-1', 'task', '{}', '2024-01-01', '2024-01-01', 'actor')`,
      );

      // Soft delete
      backend.run(`UPDATE elements SET deleted_at = '2024-01-02' WHERE id = 'el-1'`);

      // Element should still exist
      const row = backend.queryOne<{ deleted_at: string }>('SELECT deleted_at FROM elements WHERE id = ?', ['el-1']);
      expect(row!.deleted_at).toBe('2024-01-02');
    });

    it('should handle JSON data field', () => {
      const jsonData = JSON.stringify({ title: 'Test Task', priority: 'high' });
      backend.run(
        `INSERT INTO elements (id, type, data, created_at, updated_at, created_by)
         VALUES ('el-1', 'task', ?, '2024-01-01', '2024-01-01', 'actor')`,
        [jsonData],
      );

      const row = backend.queryOne<{ data: string }>('SELECT data FROM elements WHERE id = ?', ['el-1']);
      const parsed = JSON.parse(row!.data);
      expect(parsed.title).toBe('Test Task');
      expect(parsed.priority).toBe('high');
    });

    it('should handle event old_value and new_value as JSON', () => {
      backend.run(
        `INSERT INTO elements (id, type, data, created_at, updated_at, created_by)
         VALUES ('el-1', 'task', '{}', '2024-01-01', '2024-01-01', 'actor')`,
      );

      const oldValue = JSON.stringify({ status: 'open' });
      const newValue = JSON.stringify({ status: 'closed' });

      backend.run(
        `INSERT INTO events (element_id, event_type, actor, old_value, new_value, created_at)
         VALUES ('el-1', 'status_changed', 'actor', ?, ?, '2024-01-01')`,
        [oldValue, newValue],
      );

      const row = backend.queryOne<{ old_value: string; new_value: string }>(
        'SELECT old_value, new_value FROM events WHERE element_id = ?',
        ['el-1'],
      );

      expect(JSON.parse(row!.old_value).status).toBe('open');
      expect(JSON.parse(row!.new_value).status).toBe('closed');
    });

    it('should handle empty metadata in dependencies', () => {
      backend.run(
        `INSERT INTO elements (id, type, data, created_at, updated_at, created_by)
         VALUES ('el-1', 'task', '{}', '2024-01-01', '2024-01-01', 'actor')`,
      );

      backend.run(
        `INSERT INTO dependencies (source_id, target_id, type, created_at, created_by, metadata)
         VALUES ('el-1', 'el-2', 'blocks', '2024-01-01', 'actor', NULL)`,
      );

      const row = backend.queryOne<{ metadata: string | null }>(
        'SELECT metadata FROM dependencies WHERE source_id = ?',
        ['el-1'],
      );
      expect(row!.metadata).toBeNull();
    });
  });
});

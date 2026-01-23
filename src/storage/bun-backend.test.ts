/**
 * Integration Tests for Bun SQLite Backend
 *
 * These tests validate the actual implementation against real SQLite databases.
 * Tests use both in-memory and file-based databases to ensure complete coverage.
 */

import { describe, it, expect, beforeEach, afterEach, afterAll } from 'bun:test';
import { existsSync, unlinkSync } from 'fs';
import { BunStorageBackend, createBunStorage } from './bun-backend.js';
import type { StorageBackend } from './backend.js';
import type { Migration } from './types.js';

// Test database paths
const TEST_DB_PATH = '/tmp/elemental-test.db';
const TEST_DB_WAL = '/tmp/elemental-test.db-wal';
const TEST_DB_SHM = '/tmp/elemental-test.db-shm';

// Helper to clean up test files
function cleanupTestFiles(): void {
  for (const file of [TEST_DB_PATH, TEST_DB_WAL, TEST_DB_SHM]) {
    if (existsSync(file)) {
      try {
        unlinkSync(file);
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}

describe('BunStorageBackend', () => {
  describe('In-Memory Database', () => {
    let backend: StorageBackend;

    beforeEach(() => {
      backend = new BunStorageBackend({ path: ':memory:' });
    });

    afterEach(() => {
      if (backend.isOpen) {
        backend.close();
      }
    });

    describe('Connection Management', () => {
      it('should open in-memory database', () => {
        expect(backend.isOpen).toBe(true);
        expect(backend.path).toBe(':memory:');
      });

      it('should close connection', () => {
        backend.close();
        expect(backend.isOpen).toBe(false);
      });

      it('should throw after close', () => {
        backend.close();
        expect(() => backend.exec('SELECT 1')).toThrow('Database is closed');
      });

      it('should report transaction status', () => {
        expect(backend.inTransaction).toBe(false);
      });
    });

    describe('SQL Execution', () => {
      it('should execute DDL statements', () => {
        expect(() => backend.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)')).not.toThrow();
      });

      it('should query empty results', () => {
        backend.exec('CREATE TABLE test (id INTEGER PRIMARY KEY)');
        const rows = backend.query('SELECT * FROM test');
        expect(rows).toEqual([]);
      });

      it('should query with results', () => {
        backend.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)');
        backend.run('INSERT INTO test (id, name) VALUES (?, ?)', [1, 'Alice']);
        backend.run('INSERT INTO test (id, name) VALUES (?, ?)', [2, 'Bob']);

        const rows = backend.query<{ id: number; name: string }>('SELECT * FROM test ORDER BY id');
        expect(rows).toEqual([
          { id: 1, name: 'Alice' },
          { id: 2, name: 'Bob' },
        ]);
      });

      it('should query with parameters', () => {
        backend.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)');
        backend.run('INSERT INTO test (id, name) VALUES (?, ?)', [1, 'Alice']);
        backend.run('INSERT INTO test (id, name) VALUES (?, ?)', [2, 'Bob']);

        const rows = backend.query<{ id: number; name: string }>('SELECT * FROM test WHERE name = ?', ['Alice']);
        expect(rows).toEqual([{ id: 1, name: 'Alice' }]);
      });

      it('should queryOne with result', () => {
        backend.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)');
        backend.run('INSERT INTO test (id, name) VALUES (?, ?)', [1, 'Alice']);

        const row = backend.queryOne<{ id: number; name: string }>('SELECT * FROM test WHERE id = ?', [1]);
        expect(row).toEqual({ id: 1, name: 'Alice' });
      });

      it('should queryOne with no result', () => {
        backend.exec('CREATE TABLE test (id INTEGER PRIMARY KEY)');
        const row = backend.queryOne('SELECT * FROM test WHERE id = ?', [999]);
        // Bun SQLite returns null for no result
        expect(row).toBeFalsy();
      });

      it('should run INSERT and return changes', () => {
        backend.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)');
        const result = backend.run('INSERT INTO test (id, name) VALUES (?, ?)', [1, 'Alice']);
        expect(result.changes).toBe(1);
        expect(result.lastInsertRowid).toBe(1);
      });

      it('should run UPDATE and return changes', () => {
        backend.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)');
        backend.run('INSERT INTO test (id, name) VALUES (?, ?)', [1, 'Alice']);
        backend.run('INSERT INTO test (id, name) VALUES (?, ?)', [2, 'Bob']);

        const result = backend.run('UPDATE test SET name = ? WHERE id > 0', ['Updated']);
        expect(result.changes).toBe(2);
      });

      it('should run DELETE and return changes', () => {
        backend.exec('CREATE TABLE test (id INTEGER PRIMARY KEY)');
        backend.run('INSERT INTO test (id) VALUES (?)', [1]);
        backend.run('INSERT INTO test (id) VALUES (?)', [2]);

        const result = backend.run('DELETE FROM test WHERE id = ?', [1]);
        expect(result.changes).toBe(1);
      });

      it('should throw on invalid SQL', () => {
        expect(() => backend.exec('INVALID SQL')).toThrow();
      });
    });

    describe('Prepared Statements', () => {
      beforeEach(() => {
        backend.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)');
        backend.run('INSERT INTO test (id, name) VALUES (?, ?)', [1, 'Alice']);
        backend.run('INSERT INTO test (id, name) VALUES (?, ?)', [2, 'Bob']);
      });

      it('should create and use prepared statement', () => {
        const stmt = backend.prepare<{ id: number; name: string }>('SELECT * FROM test WHERE id = ?');

        const result1 = stmt.get(1);
        expect(result1).toEqual({ id: 1, name: 'Alice' });

        const result2 = stmt.get(2);
        expect(result2).toEqual({ id: 2, name: 'Bob' });

        stmt.finalize();
      });

      it('should get all rows with prepared statement', () => {
        const stmt = backend.prepare<{ id: number; name: string }>('SELECT * FROM test ORDER BY id');
        const results = stmt.all();
        expect(results).toHaveLength(2);
        stmt.finalize();
      });

      it('should run mutations with prepared statement', () => {
        const stmt = backend.prepare('INSERT INTO test (id, name) VALUES (?, ?)');
        const result = stmt.run(3, 'Charlie');
        expect(result.changes).toBe(1);
        stmt.finalize();
      });
    });

    describe('Transactions', () => {
      beforeEach(() => {
        backend.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)');
      });

      it('should execute transaction successfully', () => {
        const result = backend.transaction((tx) => {
          tx.run('INSERT INTO test (id, name) VALUES (?, ?)', [1, 'Alice']);
          tx.run('INSERT INTO test (id, name) VALUES (?, ?)', [2, 'Bob']);
          return 'success';
        });

        expect(result).toBe('success');
        const rows = backend.query('SELECT * FROM test');
        expect(rows).toHaveLength(2);
      });

      it('should rollback on error', () => {
        expect(() => {
          backend.transaction((tx) => {
            tx.run('INSERT INTO test (id, name) VALUES (?, ?)', [1, 'Alice']);
            throw new Error('Test error');
          });
        }).toThrow();

        const rows = backend.query('SELECT * FROM test');
        expect(rows).toHaveLength(0);
      });

      it('should support savepoints', () => {
        backend.transaction((tx) => {
          tx.run('INSERT INTO test (id, name) VALUES (?, ?)', [1, 'Alice']);

          tx.savepoint('sp1');
          tx.run('INSERT INTO test (id, name) VALUES (?, ?)', [2, 'Bob']);
          tx.rollbackTo('sp1');

          const rows = tx.query('SELECT * FROM test');
          expect(rows).toHaveLength(1);
        });
      });

      it('should support immediate isolation', () => {
        const result = backend.transaction(
          (tx) => {
            tx.run('INSERT INTO test (id, name) VALUES (?, ?)', [1, 'Alice']);
            return tx.query('SELECT * FROM test');
          },
          { isolation: 'immediate' }
        );
        expect(result).toHaveLength(1);
      });

      it('should support exclusive isolation', () => {
        const result = backend.transaction(
          (tx) => {
            tx.run('INSERT INTO test (id, name) VALUES (?, ?)', [1, 'Alice']);
            return tx.query('SELECT * FROM test');
          },
          { isolation: 'exclusive' }
        );
        expect(result).toHaveLength(1);
      });

      it('should track transaction status', () => {
        expect(backend.inTransaction).toBe(false);
        backend.transaction((tx) => {
          // Note: We can't check inTransaction inside without direct backend access
          tx.exec('SELECT 1');
        });
        expect(backend.inTransaction).toBe(false);
      });

      it('should allow nested queries in transaction', () => {
        backend.transaction((tx) => {
          tx.run('INSERT INTO test (id, name) VALUES (?, ?)', [1, 'Alice']);
          const row = tx.queryOne<{ id: number; name: string }>('SELECT * FROM test WHERE id = ?', [1]);
          expect(row?.name).toBe('Alice');
        });
      });
    });

    describe('Schema Management', () => {
      it('should get initial schema version', () => {
        expect(backend.getSchemaVersion()).toBe(0);
      });

      it('should set schema version', () => {
        backend.setSchemaVersion(5);
        expect(backend.getSchemaVersion()).toBe(5);
      });

      it('should run migrations', () => {
        const migrations: Migration[] = [
          { version: 1, description: 'Create users table', up: 'CREATE TABLE users (id TEXT PRIMARY KEY)' },
          { version: 2, description: 'Add name column', up: 'ALTER TABLE users ADD COLUMN name TEXT' },
        ];

        const result = backend.migrate(migrations);

        expect(result.fromVersion).toBe(0);
        expect(result.toVersion).toBe(2);
        expect(result.applied).toEqual([1, 2]);
        expect(result.success).toBe(true);
        expect(backend.getSchemaVersion()).toBe(2);
      });

      it('should skip already applied migrations', () => {
        backend.setSchemaVersion(1);

        const migrations: Migration[] = [
          { version: 1, description: 'Already applied', up: 'SELECT 1' },
          { version: 2, description: 'New migration', up: 'CREATE TABLE test (id TEXT)' },
        ];

        const result = backend.migrate(migrations);

        expect(result.fromVersion).toBe(1);
        expect(result.applied).toEqual([2]);
      });

      it('should return empty result when no migrations needed', () => {
        backend.setSchemaVersion(5);

        const migrations: Migration[] = [
          { version: 1, description: 'Old', up: 'SELECT 1' },
          { version: 2, description: 'Old', up: 'SELECT 2' },
        ];

        const result = backend.migrate(migrations);

        expect(result.fromVersion).toBe(5);
        expect(result.toVersion).toBe(5);
        expect(result.applied).toEqual([]);
      });

      it('should throw on migration failure', () => {
        const migrations: Migration[] = [
          { version: 1, description: 'Bad migration', up: 'INVALID SQL SYNTAX' },
        ];

        expect(() => backend.migrate(migrations)).toThrow();
      });
    });

    describe('Dirty Tracking', () => {
      it('should mark elements dirty', () => {
        backend.markDirty('el-abc123');
        const dirty = backend.getDirtyElements();
        expect(dirty).toHaveLength(1);
        expect(String(dirty[0].elementId)).toBe('el-abc123');
      });

      it('should include timestamp when marking dirty', () => {
        const before = new Date().toISOString();
        backend.markDirty('el-abc123');
        const after = new Date().toISOString();

        const dirty = backend.getDirtyElements();
        expect(dirty[0].markedAt).toBeTruthy();
        expect(dirty[0].markedAt >= before).toBe(true);
        expect(dirty[0].markedAt <= after).toBe(true);
      });

      it('should update timestamp on re-mark', () => {
        backend.markDirty('el-abc123');
        const first = backend.getDirtyElements()[0].markedAt;

        // Small delay to ensure different timestamp
        backend.markDirty('el-abc123');
        const second = backend.getDirtyElements()[0].markedAt;

        expect(second >= first).toBe(true);
      });

      it('should track multiple dirty elements', () => {
        backend.markDirty('el-abc');
        backend.markDirty('el-def');
        backend.markDirty('el-ghi');

        const dirty = backend.getDirtyElements();
        expect(dirty).toHaveLength(3);
      });

      it('should clear all dirty elements', () => {
        backend.markDirty('el-abc');
        backend.markDirty('el-def');
        backend.clearDirty();

        expect(backend.getDirtyElements()).toHaveLength(0);
      });

      it('should clear specific dirty elements', () => {
        backend.markDirty('el-abc');
        backend.markDirty('el-def');
        backend.markDirty('el-ghi');

        backend.clearDirtyElements(['el-abc', 'el-ghi']);

        const dirty = backend.getDirtyElements();
        expect(dirty).toHaveLength(1);
        expect(String(dirty[0].elementId)).toBe('el-def');
      });

      it('should handle clearing empty element list', () => {
        backend.markDirty('el-abc');
        backend.clearDirtyElements([]);
        expect(backend.getDirtyElements()).toHaveLength(1);
      });

      it('should handle clearing non-existent elements', () => {
        backend.markDirty('el-abc');
        backend.clearDirtyElements(['el-nonexistent']);
        expect(backend.getDirtyElements()).toHaveLength(1);
      });
    });

    describe('Utilities', () => {
      it('should pass integrity check', () => {
        expect(backend.checkIntegrity()).toBe(true);
      });

      it('should optimize without error', () => {
        backend.exec('CREATE TABLE test (id INTEGER, name TEXT)');
        for (let i = 0; i < 100; i++) {
          backend.run('INSERT INTO test VALUES (?, ?)', [i, `name${i}`]);
        }
        backend.run('DELETE FROM test WHERE id < 50');

        expect(() => backend.optimize()).not.toThrow();
      });

      it('should return stats', () => {
        const stats = backend.getStats();

        expect(stats).toHaveProperty('fileSize');
        expect(stats).toHaveProperty('tableCount');
        expect(stats).toHaveProperty('indexCount');
        expect(stats).toHaveProperty('schemaVersion');
        expect(stats).toHaveProperty('dirtyCount');
        expect(stats).toHaveProperty('elementCount');
        expect(stats).toHaveProperty('walMode');
      });

      it('should track dirty count in stats', () => {
        backend.markDirty('el-abc');
        backend.markDirty('el-def');
        const stats = backend.getStats();
        expect(stats.dirtyCount).toBe(2);
      });

      it('should report WAL mode in stats', () => {
        const stats = backend.getStats();
        // WAL mode may not be enabled for in-memory databases
        expect(typeof stats.walMode).toBe('boolean');
      });

      it('should have zero file size for in-memory', () => {
        const stats = backend.getStats();
        expect(stats.fileSize).toBe(0);
      });
    });
  });

  describe('File-Based Database', () => {
    let backend: StorageBackend;

    beforeEach(() => {
      cleanupTestFiles();
      backend = new BunStorageBackend({ path: TEST_DB_PATH });
    });

    afterEach(() => {
      if (backend.isOpen) {
        backend.close();
      }
      cleanupTestFiles();
    });

    it('should create database file', () => {
      expect(existsSync(TEST_DB_PATH)).toBe(true);
    });

    it('should persist data across connections', () => {
      backend.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT)');
      backend.run('INSERT INTO test (id, value) VALUES (?, ?)', [1, 'test']);
      backend.close();

      // Reopen
      backend = new BunStorageBackend({ path: TEST_DB_PATH });
      const rows = backend.query<{ id: number; value: string }>('SELECT * FROM test');
      expect(rows).toEqual([{ id: 1, value: 'test' }]);
    });

    it('should report file size in stats', () => {
      backend.exec('CREATE TABLE test (id INTEGER, data TEXT)');
      for (let i = 0; i < 100; i++) {
        backend.run('INSERT INTO test VALUES (?, ?)', [i, 'x'.repeat(1000)]);
      }

      const stats = backend.getStats();
      expect(stats.fileSize).toBeGreaterThan(0);
    });

    it('should enable WAL mode for file-based database', () => {
      const stats = backend.getStats();
      expect(stats.walMode).toBe(true);
    });
  });

  describe('Configuration Options', () => {
    let backend: StorageBackend;

    afterEach(() => {
      if (backend?.isOpen) {
        backend.close();
      }
    });

    it('should apply custom pragmas', () => {
      backend = new BunStorageBackend({
        path: ':memory:',
        pragmas: {
          synchronous: 'full',
          cache_size: -4000,
        },
      });

      // Verify synchronous setting
      const syncResult = backend.queryOne<{ synchronous: number }>('PRAGMA synchronous');
      expect(syncResult?.synchronous).toBe(2); // 2 = FULL

      // Verify cache size
      const cacheResult = backend.queryOne<{ cache_size: number }>('PRAGMA cache_size');
      expect(cacheResult?.cache_size).toBe(-4000);
    });

    it('should disable foreign keys when configured', () => {
      backend = new BunStorageBackend({
        path: ':memory:',
        pragmas: { foreign_keys: false },
      });

      const result = backend.queryOne<{ foreign_keys: number }>('PRAGMA foreign_keys');
      expect(result?.foreign_keys).toBe(0);
    });

    it('should fail to open non-existent database with create=false', () => {
      cleanupTestFiles();
      expect(
        () =>
          new BunStorageBackend({
            path: TEST_DB_PATH,
            create: false,
          })
      ).toThrow();
    });
  });

  describe('Error Handling', () => {
    let backend: StorageBackend;

    beforeEach(() => {
      backend = new BunStorageBackend({ path: ':memory:' });
    });

    afterEach(() => {
      if (backend.isOpen) {
        backend.close();
      }
    });

    it('should throw StorageError on constraint violation', () => {
      backend.exec('CREATE TABLE test (id INTEGER PRIMARY KEY)');
      backend.run('INSERT INTO test (id) VALUES (?)', [1]);

      expect(() => backend.run('INSERT INTO test (id) VALUES (?)', [1])).toThrow();
    });

    it('should throw on SQL syntax error', () => {
      expect(() => backend.exec('SELECTT * FROM nowhere')).toThrow();
    });

    it('should throw on query against non-existent table', () => {
      expect(() => backend.query('SELECT * FROM nonexistent')).toThrow();
    });
  });

  describe('Factory Function', () => {
    it('should create backend via factory', () => {
      const backend = createBunStorage({ path: ':memory:' });
      expect(backend.isOpen).toBe(true);
      expect(backend.path).toBe(':memory:');
      backend.close();
    });
  });
});

describe('Transaction Edge Cases', () => {
  let backend: StorageBackend;

  beforeEach(() => {
    backend = new BunStorageBackend({ path: ':memory:' });
    backend.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, value INTEGER)');
  });

  afterEach(() => {
    if (backend.isOpen) {
      backend.close();
    }
  });

  it('should handle multiple savepoints', () => {
    backend.transaction((tx) => {
      tx.run('INSERT INTO test VALUES (?, ?)', [1, 100]);

      tx.savepoint('sp1');
      tx.run('INSERT INTO test VALUES (?, ?)', [2, 200]);

      tx.savepoint('sp2');
      tx.run('INSERT INTO test VALUES (?, ?)', [3, 300]);

      tx.rollbackTo('sp2');
      // Only sp2's insert should be rolled back
      tx.release('sp1');

      const count = tx.queryOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM test');
      expect(count?.cnt).toBe(2);
    });
  });

  it('should properly release savepoints', () => {
    backend.transaction((tx) => {
      tx.savepoint('sp1');
      tx.run('INSERT INTO test VALUES (?, ?)', [1, 100]);
      tx.release('sp1');

      // After release, the changes should be committed to the transaction
      const count = tx.queryOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM test');
      expect(count?.cnt).toBe(1);
    });
  });
});

describe('Migration Edge Cases', () => {
  let backend: StorageBackend;

  beforeEach(() => {
    backend = new BunStorageBackend({ path: ':memory:' });
  });

  afterEach(() => {
    if (backend.isOpen) {
      backend.close();
    }
  });

  it('should run migrations in order', () => {
    // Define migrations out of order
    const migrations: Migration[] = [
      {
        version: 3,
        description: 'Third',
        up: 'CREATE TABLE t3 (id TEXT)',
      },
      {
        version: 1,
        description: 'First',
        up: 'CREATE TABLE t1 (id TEXT)',
      },
      {
        version: 2,
        description: 'Second',
        up: 'CREATE TABLE t2 (id TEXT)',
      },
    ];

    const result = backend.migrate(migrations);

    // Should apply in numerical order
    expect(result.applied).toEqual([1, 2, 3]);
  });

  it('should rollback failed migration atomically', () => {
    const migrations: Migration[] = [
      {
        version: 1,
        description: 'Create table',
        up: 'CREATE TABLE test (id TEXT PRIMARY KEY)',
      },
      {
        version: 2,
        description: 'This will fail',
        up: 'INVALID SQL',
      },
    ];

    try {
      backend.migrate(migrations);
    } catch {
      // Expected
    }

    // First migration should have succeeded
    expect(backend.getSchemaVersion()).toBe(1);

    // Table from first migration should exist
    expect(() => backend.query('SELECT * FROM test')).not.toThrow();
  });
});

// Cleanup after all tests
afterAll(() => {
  cleanupTestFiles();
});

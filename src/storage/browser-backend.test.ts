/**
 * Browser Storage Backend Tests
 *
 * Tests for the sql.js-based browser storage backend.
 * These tests run in Bun but test the sql.js implementation
 * (OPFS persistence is mocked since it requires a browser environment).
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { BrowserStorageBackend } from './browser-backend.js';
import type { StorageConfig, Migration } from './types.js';

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Create a test storage backend with in-memory database
 */
async function createTestStorage(
  config?: Partial<StorageConfig>
): Promise<BrowserStorageBackend> {
  return BrowserStorageBackend.create({
    path: ':memory:',
    ...config,
  });
}

// ============================================================================
// Connection Management Tests
// ============================================================================

describe('BrowserStorageBackend', () => {
  describe('connection management', () => {
    let storage: BrowserStorageBackend;

    afterEach(() => {
      if (storage?.isOpen) {
        storage.close();
      }
    });

    it('should create an in-memory database', async () => {
      storage = await createTestStorage();
      expect(storage.isOpen).toBe(true);
      expect(storage.path).toBe(':memory:');
    });

    it('should close the database', async () => {
      storage = await createTestStorage();
      expect(storage.isOpen).toBe(true);
      storage.close();
      expect(storage.isOpen).toBe(false);
    });

    it('should throw when accessing closed database', async () => {
      storage = await createTestStorage();
      storage.close();
      expect(() => storage.exec('SELECT 1')).toThrow('Database is closed');
    });
  });

  // ==========================================================================
  // SQL Execution Tests
  // ==========================================================================

  describe('SQL execution', () => {
    let storage: BrowserStorageBackend;

    beforeEach(async () => {
      storage = await createTestStorage();
      storage.exec(`
        CREATE TABLE test (
          id INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          value INTEGER
        )
      `);
    });

    afterEach(() => {
      if (storage?.isOpen) {
        storage.close();
      }
    });

    it('should execute DDL statements', async () => {
      storage.exec('CREATE TABLE other (id INTEGER PRIMARY KEY)');
      const result = storage.query<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'other'"
      );
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('other');
    });

    it('should run parameterized inserts', async () => {
      const result = storage.run(
        'INSERT INTO test (name, value) VALUES (?, ?)',
        ['test1', 42]
      );
      expect(result.changes).toBe(1);
      expect(result.lastInsertRowid).toBe(1);
    });

    it('should query with parameters', async () => {
      storage.run('INSERT INTO test (name, value) VALUES (?, ?)', ['a', 1]);
      storage.run('INSERT INTO test (name, value) VALUES (?, ?)', ['b', 2]);
      storage.run('INSERT INTO test (name, value) VALUES (?, ?)', ['c', 3]);

      const results = storage.query<{ id: number; name: string; value: number }>(
        'SELECT * FROM test WHERE value > ?',
        [1]
      );
      expect(results).toHaveLength(2);
      expect(results.map(r => r.name).sort()).toEqual(['b', 'c']);
    });

    it('should queryOne with parameters', async () => {
      storage.run('INSERT INTO test (name, value) VALUES (?, ?)', ['unique', 100]);

      const result = storage.queryOne<{ name: string; value: number }>(
        'SELECT name, value FROM test WHERE value = ?',
        [100]
      );
      expect(result).toBeDefined();
      expect(result?.name).toBe('unique');
      expect(result?.value).toBe(100);
    });

    it('should return undefined for queryOne with no match', async () => {
      const result = storage.queryOne('SELECT * FROM test WHERE id = ?', [999]);
      expect(result).toBeUndefined();
    });
  });

  // ==========================================================================
  // Prepared Statement Tests
  // ==========================================================================

  describe('prepared statements', () => {
    let storage: BrowserStorageBackend;

    beforeEach(async () => {
      storage = await createTestStorage();
      storage.exec(`
        CREATE TABLE items (
          id INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          count INTEGER DEFAULT 0
        )
      `);
    });

    afterEach(() => {
      if (storage?.isOpen) {
        storage.close();
      }
    });

    it('should prepare and execute statements', async () => {
      const insertStmt = storage.prepare('INSERT INTO items (name, count) VALUES (?, ?)');
      insertStmt.run('item1', 10);
      insertStmt.run('item2', 20);
      insertStmt.finalize();

      const results = storage.query<{ name: string; count: number }>('SELECT * FROM items');
      expect(results).toHaveLength(2);
    });

    it('should get single row from prepared statement', async () => {
      storage.run('INSERT INTO items (name, count) VALUES (?, ?)', ['test', 42]);

      const stmt = storage.prepare<{ name: string; count: number }>(
        'SELECT * FROM items WHERE name = ?'
      );
      const result = stmt.get('test');
      expect(result?.count).toBe(42);
      stmt.finalize();
    });

    it('should get all rows from prepared statement', async () => {
      storage.run('INSERT INTO items (name, count) VALUES (?, ?)', ['a', 1]);
      storage.run('INSERT INTO items (name, count) VALUES (?, ?)', ['b', 2]);

      const stmt = storage.prepare<{ name: string }>('SELECT name FROM items ORDER BY name');
      const results = stmt.all();
      expect(results.map(r => r.name)).toEqual(['a', 'b']);
      stmt.finalize();
    });
  });

  // ==========================================================================
  // Transaction Tests
  // ==========================================================================

  describe('transactions', () => {
    let storage: BrowserStorageBackend;

    beforeEach(async () => {
      storage = await createTestStorage();
      storage.exec('CREATE TABLE accounts (id INTEGER PRIMARY KEY, balance INTEGER)');
      storage.run('INSERT INTO accounts (balance) VALUES (?)', [100]);
    });

    afterEach(() => {
      if (storage?.isOpen) {
        storage.close();
      }
    });

    it('should commit successful transactions', async () => {
      storage.transaction(tx => {
        tx.run('UPDATE accounts SET balance = balance - 50 WHERE id = 1');
        tx.run('INSERT INTO accounts (balance) VALUES (50)');
      });

      const results = storage.query<{ balance: number }>('SELECT balance FROM accounts');
      expect(results).toHaveLength(2);
      expect(results.map(r => r.balance).sort((a, b) => a - b)).toEqual([50, 50]);
    });

    it('should rollback failed transactions', async () => {
      expect(() => {
        storage.transaction(() => {
          storage.run('UPDATE accounts SET balance = 0 WHERE id = 1');
          throw new Error('Simulated failure');
        });
      }).toThrow('Simulated failure');

      const result = storage.queryOne<{ balance: number }>('SELECT balance FROM accounts');
      expect(result?.balance).toBe(100);
    });

    it('should return value from transaction', async () => {
      const result = storage.transaction(tx => {
        tx.run('UPDATE accounts SET balance = 200 WHERE id = 1');
        const row = tx.queryOne<{ balance: number }>('SELECT balance FROM accounts');
        return row?.balance;
      });

      expect(result).toBe(200);
    });

    it('should support savepoints', async () => {
      storage.transaction(tx => {
        tx.run('UPDATE accounts SET balance = 50 WHERE id = 1');
        tx.savepoint('sp1');
        tx.run('UPDATE accounts SET balance = 0 WHERE id = 1');
        tx.rollbackTo('sp1');
        tx.release('sp1');
      });

      const result = storage.queryOne<{ balance: number }>('SELECT balance FROM accounts');
      expect(result?.balance).toBe(50);
    });

    it('should track inTransaction state', async () => {
      expect(storage.inTransaction).toBe(false);

      let wasInTransaction = false;
      storage.transaction(() => {
        wasInTransaction = storage.inTransaction;
      });

      expect(wasInTransaction).toBe(true);
      expect(storage.inTransaction).toBe(false);
    });
  });

  // ==========================================================================
  // Schema Management Tests
  // ==========================================================================

  describe('schema management', () => {
    let storage: BrowserStorageBackend;

    beforeEach(async () => {
      storage = await createTestStorage();
    });

    afterEach(() => {
      if (storage?.isOpen) {
        storage.close();
      }
    });

    it('should get and set schema version', async () => {
      expect(storage.getSchemaVersion()).toBe(0);
      storage.setSchemaVersion(5);
      expect(storage.getSchemaVersion()).toBe(5);
    });

    it('should run migrations', async () => {
      const migrations: Migration[] = [
        {
          version: 1,
          description: 'Create users table',
          up: 'CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)',
        },
        {
          version: 2,
          description: 'Add email column',
          up: 'ALTER TABLE users ADD COLUMN email TEXT',
        },
      ];

      const result = storage.migrate(migrations);

      expect(result.fromVersion).toBe(0);
      expect(result.toVersion).toBe(2);
      expect(result.applied).toEqual([1, 2]);
      expect(result.success).toBe(true);
    });

    it('should skip already applied migrations', async () => {
      storage.setSchemaVersion(1);

      const migrations: Migration[] = [
        { version: 1, description: 'Already done', up: 'CREATE TABLE old (id INT)' },
        { version: 2, description: 'New one', up: 'CREATE TABLE new_table (id INT)' },
      ];

      const result = storage.migrate(migrations);

      expect(result.fromVersion).toBe(1);
      expect(result.toVersion).toBe(2);
      expect(result.applied).toEqual([2]);
    });

    it('should handle empty migrations array', async () => {
      const result = storage.migrate([]);

      expect(result.fromVersion).toBe(0);
      expect(result.toVersion).toBe(0);
      expect(result.applied).toEqual([]);
      expect(result.success).toBe(true);
    });
  });

  // ==========================================================================
  // Dirty Tracking Tests
  // ==========================================================================

  describe('dirty tracking', () => {
    let storage: BrowserStorageBackend;

    beforeEach(async () => {
      storage = await createTestStorage();
    });

    afterEach(() => {
      if (storage?.isOpen) {
        storage.close();
      }
    });

    it('should mark elements as dirty', async () => {
      storage.markDirty('elem-1');
      storage.markDirty('elem-2');

      const dirty = storage.getDirtyElements();
      expect(dirty).toHaveLength(2);
      expect(dirty.map(d => String(d.elementId)).sort()).toEqual(['elem-1', 'elem-2']);
    });

    it('should update timestamp on re-marking', async () => {
      storage.markDirty('elem-1');
      const first = storage.getDirtyElements()[0].markedAt;

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 10));

      storage.markDirty('elem-1');
      const second = storage.getDirtyElements()[0].markedAt;

      expect(second).not.toBe(first);
    });

    it('should clear all dirty elements', async () => {
      storage.markDirty('elem-1');
      storage.markDirty('elem-2');
      storage.clearDirty();

      expect(storage.getDirtyElements()).toHaveLength(0);
    });

    it('should clear specific dirty elements', async () => {
      storage.markDirty('elem-1');
      storage.markDirty('elem-2');
      storage.markDirty('elem-3');
      storage.clearDirtyElements(['elem-1', 'elem-3']);

      const remaining = storage.getDirtyElements();
      expect(remaining).toHaveLength(1);
      expect(String(remaining[0].elementId)).toBe('elem-2');
    });

    it('should handle clearing empty array', async () => {
      storage.markDirty('elem-1');
      storage.clearDirtyElements([]);
      expect(storage.getDirtyElements()).toHaveLength(1);
    });
  });

  // ==========================================================================
  // Hierarchical ID Tests
  // ==========================================================================

  describe('hierarchical ID support', () => {
    let storage: BrowserStorageBackend;

    beforeEach(async () => {
      storage = await createTestStorage();
      // Create the child_counters table (normally done by schema migration)
      storage.exec(`
        CREATE TABLE child_counters (
          parent_id TEXT PRIMARY KEY,
          last_child INTEGER NOT NULL DEFAULT 0
        )
      `);
    });

    afterEach(() => {
      if (storage?.isOpen) {
        storage.close();
      }
    });

    it('should get next child number', async () => {
      expect(storage.getNextChildNumber('parent-1')).toBe(1);
      expect(storage.getNextChildNumber('parent-1')).toBe(2);
      expect(storage.getNextChildNumber('parent-1')).toBe(3);
    });

    it('should track child counters per parent', async () => {
      expect(storage.getNextChildNumber('parent-a')).toBe(1);
      expect(storage.getNextChildNumber('parent-b')).toBe(1);
      expect(storage.getNextChildNumber('parent-a')).toBe(2);
      expect(storage.getNextChildNumber('parent-b')).toBe(2);
    });

    it('should get child counter without incrementing', async () => {
      expect(storage.getChildCounter('parent-x')).toBe(0);
      storage.getNextChildNumber('parent-x');
      storage.getNextChildNumber('parent-x');
      expect(storage.getChildCounter('parent-x')).toBe(2);
    });

    it('should reset child counter', async () => {
      storage.getNextChildNumber('parent-1');
      storage.getNextChildNumber('parent-1');
      storage.resetChildCounter('parent-1');
      expect(storage.getChildCounter('parent-1')).toBe(0);
      expect(storage.getNextChildNumber('parent-1')).toBe(1);
    });
  });

  // ==========================================================================
  // Utility Tests
  // ==========================================================================

  describe('utilities', () => {
    let storage: BrowserStorageBackend;

    beforeEach(async () => {
      storage = await createTestStorage();
    });

    afterEach(() => {
      if (storage?.isOpen) {
        storage.close();
      }
    });

    it('should check integrity', async () => {
      expect(storage.checkIntegrity()).toBe(true);
    });

    it('should optimize database', async () => {
      storage.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, data TEXT)');
      for (let i = 0; i < 100; i++) {
        storage.run('INSERT INTO test (data) VALUES (?)', [`data-${i}`]);
      }
      storage.run('DELETE FROM test WHERE id < 50');

      // Should not throw
      storage.optimize();
    });

    it('should get statistics', async () => {
      storage.exec('CREATE TABLE test (id INTEGER PRIMARY KEY)');
      storage.run('INSERT INTO test DEFAULT VALUES');
      storage.run('INSERT INTO test DEFAULT VALUES');

      const stats = storage.getStats();

      expect(stats.tableCount).toBeGreaterThan(0);
      expect(stats.schemaVersion).toBe(0);
      expect(stats.walMode).toBe(false); // sql.js doesn't support WAL
      expect(stats.fileSize).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // Export/Import Tests
  // ==========================================================================

  describe('export/import', () => {
    it('should export database to Uint8Array', async () => {
      const storage = await createTestStorage();
      storage.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT)');
      storage.run('INSERT INTO test (value) VALUES (?)', ['test-data']);

      const exported = storage.export();
      expect(exported).toBeInstanceOf(Uint8Array);
      expect(exported.length).toBeGreaterThan(0);

      storage.close();
    });

    it('should import database from Uint8Array', async () => {
      // Create and populate first storage
      const storage1 = await createTestStorage();
      storage1.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT)');
      storage1.run('INSERT INTO test (value) VALUES (?)', ['original']);
      const exported = storage1.export();
      storage1.close();

      // Create new storage and import
      const storage2 = await createTestStorage();
      await storage2.import(exported);

      const result = storage2.queryOne<{ value: string }>('SELECT value FROM test');
      expect(result?.value).toBe('original');

      storage2.close();
    });
  });

  // ==========================================================================
  // Auto-save Configuration Tests
  // ==========================================================================

  describe('auto-save configuration', () => {
    it('should allow configuring auto-save', async () => {
      const storage = await createTestStorage();

      // Should not throw
      storage.setAutoSave(false);
      storage.setAutoSave(true, 5000);

      storage.close();
    });
  });
});

/**
 * Tests for Storage Backend Interface
 *
 * These tests validate the interface contract by creating a mock implementation.
 * Actual backend tests will be in separate files for each runtime.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import type {
  StorageBackend,
  StorageStats,
  StorageFactory,
  AsyncStorageFactory,
} from './backend.js';
import type {
  Row,
  MutationResult,
  PreparedStatement,
  Transaction,
  TransactionOptions,
  StorageConfig,
  Migration,
  MigrationResult,
  DirtyElement,
} from './types.js';

/**
 * Mock implementation of StorageBackend for testing interface contracts
 */
class MockStorageBackend implements StorageBackend {
  private _isOpen: boolean = true;
  private _path: string;
  private _schemaVersion: number = 0;
  private _dirty: Map<string, DirtyElement> = new Map();
  private _inTransaction: boolean = false;

  constructor(config: StorageConfig) {
    this._path = config.path;
  }

  get isOpen(): boolean {
    return this._isOpen;
  }

  get path(): string {
    return this._path;
  }

  get inTransaction(): boolean {
    return this._inTransaction;
  }

  close(): void {
    this._isOpen = false;
  }

  exec(_sql: string): void {
    if (!this._isOpen) throw new Error('Database is closed');
  }

  query<T extends Row = Row>(_sql: string, _params?: unknown[]): T[] {
    if (!this._isOpen) throw new Error('Database is closed');
    return [];
  }

  queryOne<T extends Row = Row>(_sql: string, _params?: unknown[]): T | undefined {
    if (!this._isOpen) throw new Error('Database is closed');
    return undefined;
  }

  run(_sql: string, _params?: unknown[]): MutationResult {
    if (!this._isOpen) throw new Error('Database is closed');
    return { changes: 0 };
  }

  prepare<T extends Row = Row>(_sql: string): PreparedStatement<T> {
    if (!this._isOpen) throw new Error('Database is closed');
    return {
      all: () => [],
      get: () => undefined,
      run: () => ({ changes: 0 }),
      finalize: () => {},
    };
  }

  transaction<T>(fn: (tx: Transaction) => T, _options?: TransactionOptions): T {
    if (!this._isOpen) throw new Error('Database is closed');
    this._inTransaction = true;
    try {
      const tx: Transaction = {
        exec: () => {},
        query: () => [],
        queryOne: () => undefined,
        run: () => ({ changes: 0 }),
        savepoint: () => {},
        release: () => {},
        rollbackTo: () => {},
      };
      return fn(tx);
    } finally {
      this._inTransaction = false;
    }
  }

  getSchemaVersion(): number {
    return this._schemaVersion;
  }

  setSchemaVersion(version: number): void {
    this._schemaVersion = version;
  }

  migrate(migrations: Migration[]): MigrationResult {
    const fromVersion = this._schemaVersion;
    const pending = migrations.filter(m => m.version > fromVersion);
    const applied = pending.map(m => m.version);
    this._schemaVersion = Math.max(fromVersion, ...migrations.map(m => m.version));
    return {
      fromVersion,
      toVersion: this._schemaVersion,
      applied,
      success: true,
    };
  }

  markDirty(elementId: string): void {
    this._dirty.set(elementId, {
      elementId: elementId as any,
      markedAt: new Date().toISOString(),
    });
  }

  getDirtyElements(): DirtyElement[] {
    return Array.from(this._dirty.values());
  }

  clearDirty(): void {
    this._dirty.clear();
  }

  clearDirtyElements(elementIds: string[]): void {
    for (const id of elementIds) {
      this._dirty.delete(id);
    }
  }

  // Child counter methods (mock implementation)
  private _childCounters: Map<string, number> = new Map();

  getNextChildNumber(parentId: string): number {
    const current = this._childCounters.get(parentId) ?? 0;
    const next = current + 1;
    this._childCounters.set(parentId, next);
    return next;
  }

  getChildCounter(parentId: string): number {
    return this._childCounters.get(parentId) ?? 0;
  }

  resetChildCounter(parentId: string): void {
    this._childCounters.delete(parentId);
  }

  // Element count for ID generation
  private _elementCount: number = 0;

  getElementCount(): number {
    return this._elementCount;
  }

  // Test helper to set element count
  setElementCount(count: number): void {
    this._elementCount = count;
  }

  checkIntegrity(): boolean {
    return this._isOpen;
  }

  optimize(): void {
    if (!this._isOpen) throw new Error('Database is closed');
  }

  getStats(): StorageStats {
    return {
      fileSize: 0,
      tableCount: 0,
      indexCount: 0,
      schemaVersion: this._schemaVersion,
      dirtyCount: this._dirty.size,
      elementCount: 0,
      walMode: true,
    };
  }
}

describe('StorageBackend Interface', () => {
  let backend: StorageBackend;

  beforeEach(() => {
    backend = new MockStorageBackend({ path: ':memory:' });
  });

  describe('Connection Management', () => {
    it('should report open status', () => {
      expect(backend.isOpen).toBe(true);
    });

    it('should report path', () => {
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
  });

  describe('SQL Execution', () => {
    it('should execute SQL without error', () => {
      expect(() => backend.exec('CREATE TABLE test (id TEXT)')).not.toThrow();
    });

    it('should query and return rows', () => {
      const rows = backend.query('SELECT * FROM test');
      expect(Array.isArray(rows)).toBe(true);
    });

    it('should queryOne and return single row', () => {
      const row = backend.queryOne('SELECT * FROM test LIMIT 1');
      expect(row === undefined || typeof row === 'object').toBe(true);
    });

    it('should run mutations and return result', () => {
      const result = backend.run('INSERT INTO test VALUES (?)', ['test']);
      expect(result).toHaveProperty('changes');
      expect(typeof result.changes).toBe('number');
    });
  });

  describe('Prepared Statements', () => {
    it('should create prepared statement', () => {
      const stmt = backend.prepare('SELECT * FROM test WHERE id = ?');
      expect(stmt).toHaveProperty('all');
      expect(stmt).toHaveProperty('get');
      expect(stmt).toHaveProperty('run');
      expect(stmt).toHaveProperty('finalize');
    });

    it('should execute prepared statement', () => {
      const stmt = backend.prepare('SELECT * FROM test');
      expect(() => stmt.all()).not.toThrow();
      expect(() => stmt.get()).not.toThrow();
      expect(() => stmt.run()).not.toThrow();
      expect(() => stmt.finalize()).not.toThrow();
    });
  });

  describe('Transactions', () => {
    it('should execute transaction', () => {
      const result = backend.transaction((tx) => {
        tx.exec('INSERT INTO test VALUES (1)');
        return 'success';
      });
      expect(result).toBe('success');
    });

    it('should report transaction status', () => {
      expect(backend.inTransaction).toBe(false);
      backend.transaction((tx) => {
        // Inside transaction - would need access to check inTransaction
        tx.exec('SELECT 1');
      });
      expect(backend.inTransaction).toBe(false);
    });

    it('should support savepoints in transaction', () => {
      backend.transaction((tx) => {
        expect(() => tx.savepoint('sp1')).not.toThrow();
        expect(() => tx.release('sp1')).not.toThrow();
      });
    });

    it('should support rollback to savepoint', () => {
      backend.transaction((tx) => {
        tx.savepoint('sp1');
        expect(() => tx.rollbackTo('sp1')).not.toThrow();
      });
    });
  });

  describe('Schema Management', () => {
    it('should get schema version', () => {
      expect(backend.getSchemaVersion()).toBe(0);
    });

    it('should set schema version', () => {
      backend.setSchemaVersion(5);
      expect(backend.getSchemaVersion()).toBe(5);
    });

    it('should run migrations', () => {
      const migrations: Migration[] = [
        { version: 1, description: 'Create test table', up: 'CREATE TABLE test (id TEXT)' },
        { version: 2, description: 'Add column', up: 'ALTER TABLE test ADD COLUMN name TEXT' },
      ];

      const result = backend.migrate(migrations);

      expect(result.fromVersion).toBe(0);
      expect(result.toVersion).toBe(2);
      expect(result.applied).toEqual([1, 2]);
      expect(result.success).toBe(true);
    });

    it('should skip already applied migrations', () => {
      backend.setSchemaVersion(1);

      const migrations: Migration[] = [
        { version: 1, description: 'Already applied', up: 'SELECT 1' },
        { version: 2, description: 'New migration', up: 'SELECT 2' },
      ];

      const result = backend.migrate(migrations);

      expect(result.fromVersion).toBe(1);
      expect(result.applied).toEqual([2]);
    });
  });

  describe('Dirty Tracking', () => {
    it('should mark elements dirty', () => {
      backend.markDirty('el-abc');
      const dirty = backend.getDirtyElements();
      expect(dirty).toHaveLength(1);
      expect(String(dirty[0].elementId)).toBe('el-abc');
    });

    it('should include timestamp when marking dirty', () => {
      backend.markDirty('el-abc');
      const dirty = backend.getDirtyElements();
      expect(dirty[0].markedAt).toBeTruthy();
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
  });

  describe('Utilities', () => {
    it('should check integrity', () => {
      expect(backend.checkIntegrity()).toBe(true);
    });

    it('should optimize without error', () => {
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
  });
});

describe('Factory Types', () => {
  it('should accept sync factory function', () => {
    const factory: StorageFactory = (config: StorageConfig) => {
      return new MockStorageBackend(config);
    };

    const backend = factory({ path: ':memory:' });
    expect(backend.isOpen).toBe(true);
  });

  it('should accept async factory function', async () => {
    const factory: AsyncStorageFactory = async (config: StorageConfig) => {
      return new MockStorageBackend(config);
    };

    const backend = await factory({ path: ':memory:' });
    expect(backend.isOpen).toBe(true);
  });
});

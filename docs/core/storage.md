# Storage Architecture

## Files
- **Entry point**: `src/storage/index.ts` - Re-exports types (not runtime backends)
- **Backend interface**: `src/storage/backend.ts`
- **Factory**: `src/storage/create-backend.ts` - Runtime detection, `createStorage()`, `createStorageAsync()`
- **Bun backend**: `src/storage/bun-backend.ts`
- **Node backend**: `src/storage/node-backend.ts`
- **Browser backend**: `src/storage/browser-backend.ts` - WASM + OPFS support
- **Schema**: `src/storage/schema.ts` - SQLite schema and migrations
- **Types**: `src/storage/types.ts` - Transaction, QueryResult, PreparedStatement
- **Errors**: `src/storage/errors.ts` - `mapStorageError()`, constraint detection

## Dual Storage Model

```
┌─────────────────────────────────────────────┐
│                   SQLite                     │
│  Fast queries, indexes, full-text search    │
│            (cache, ephemeral)               │
└─────────────────────────────────────────────┘
                      ↕ sync
┌─────────────────────────────────────────────┐
│                   JSONL                      │
│   Git-tracked, append-only, mergeable       │
│           (source of truth)                 │
└─────────────────────────────────────────────┘
```

**SQLite is the cache. JSONL is the source of truth.**

## Database Location

Default: `.elemental/` directory in project root
- `elements.db` - SQLite database
- `elements.jsonl` - JSONL export
- `config.json` - Project configuration

## StorageBackend Interface

The backend is a **low-level SQL interface**, not a domain CRUD layer. All methods are **synchronous**.

```typescript
interface StorageBackend {
  // Connection
  readonly isOpen: boolean;
  readonly path: string;
  readonly inTransaction: boolean;
  close(): void;

  // SQL Execution
  exec(sql: string): void;
  query<T>(sql: string, params?: unknown[]): T[];
  queryOne<T>(sql: string, params?: unknown[]): T | undefined;
  run(sql: string, params?: unknown[]): MutationResult;
  prepare<T>(sql: string): PreparedStatement<T>;

  // Transactions
  transaction<T>(fn: (tx: Transaction) => T, options?: TransactionOptions): T;

  // Schema
  getSchemaVersion(): number;
  setSchemaVersion(version: number): void;
  migrate(migrations: Migration[]): MigrationResult;

  // Dirty Tracking
  markDirty(elementId: string): void;
  getDirtyElements(options?: DirtyTrackingOptions): DirtyElement[];
  clearDirty(): void;
  clearDirtyElements(elementIds: string[]): void;

  // Hierarchical IDs
  getNextChildNumber(parentId: string): number;
  getChildCounter(parentId: string): number;     // Read without incrementing
  resetChildCounter(parentId: string): void;
  getElementCount(): number;

  // Utilities
  checkIntegrity(): boolean;
  optimize(): void;  // VACUUM + ANALYZE
  getStats(): StorageStats;
}
```

## Dirty Tracking

Elements modified since last export are marked "dirty":

```typescript
backend.markDirty(elementId);
const dirty = backend.getDirtyElements();     // Returns { elementId, markedAt }[]
backend.clearDirtyElements(elementIds);       // Clear specific elements
backend.clearDirty();                         // Clear all
```

**Note:** `getDirtyElements()` returns `DirtyElement` records with `elementId` and `markedAt` timestamp, not full Element objects.

## Content Hashing

Each element has a content hash for merge conflict detection:
- Computed from element data (excludes timestamps)
- Used to detect concurrent modifications
- See `src/sync/` for merge logic

## Schema

See `src/storage/schema.ts` for full SQLite schema. Current version: 4.

Key tables:
- `elements` - All elements with JSON data column
- `dependencies` - Relationship records
- `dirty_elements` - Dirty tracking (auto-created in constructor, not migrations)
- `blocked_cache` - Materialized blocked status
- `child_counters` - Hierarchical ID counters
- `document_versions` - Version history for documents
- `tags` - Tag index for fast filtering
- `events` - System events for audit/history
- `inbox_items` - Notification items per entity (v4 migration)

## Sync System

**Files**: `src/sync/service.ts`, `src/sync/serialization.ts`, `src/sync/merge.ts`, `src/sync/hash.ts`

### JSONL Format

```typescript
// Elements serialized as JSON lines
{"id":"abc123","type":"task","title":"...","createdAt":"..."}
{"id":"def456","type":"entity","name":"...","createdAt":"..."}
```

### Key Operations

```typescript
// Export dirty elements to JSONL
await api.export();                    // Incremental (dirty only)
await api.export({ full: true });      // Full export

// Import from JSONL
await api.import(jsonlPath);
```

### Content Hashing

Content hash excludes: `id`, `createdAt`, `updatedAt`, `createdBy`, `contentHash`. Used for merge conflict detection.

### Merge Strategy

- Newer timestamp wins by default
- Tombstoned elements have TTL-based expiration
- Tags are merged (union of both sets)
- Conflicts tracked in `ImportResult.conflicts`

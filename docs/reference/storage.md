# Storage Reference

**Package:** `@elemental/storage` (`packages/storage/src/`)

SQLite storage layer with multiple backend implementations.

## Overview

```
┌─────────────────────────────────────────────────┐
│                    SQLite                        │
│  Fast queries, indexes, full-text search        │
│            (cache, ephemeral)                   │
└─────────────────────────────────────────────────┘
                      ↕ sync
┌─────────────────────────────────────────────────┐
│                    JSONL                         │
│   Git-tracked, append-only, mergeable           │
│           (source of truth)                     │
└─────────────────────────────────────────────────┘
```

**Key Principle:** SQLite is the **cache**, JSONL is the **source of truth**.

## Files

| File | Purpose |
|------|---------|
| `index.ts` | Type exports |
| `backend.ts` | StorageBackend interface |
| `create-backend.ts` | Factory: `createStorage()`, `createStorageAsync()` |
| `bun-backend.ts` | Bun native implementation |
| `node-backend.ts` | Node.js (better-sqlite3) implementation |
| `browser-backend.ts` | Browser (WASM + OPFS) implementation |
| `schema.ts` | SQLite schema and migrations |
| `types.ts` | Transaction, QueryResult, PreparedStatement |
| `errors.ts` | `mapStorageError()`, constraint detection |

## Creating Storage

```typescript
import { createStorage, initializeSchema } from '@elemental/storage';

// Auto-detects runtime (Bun, Node, Browser)
const storage = createStorage('./project/.elemental/db.sqlite');

// Initialize schema
initializeSchema(storage);

// Async variant (for browser WASM)
const storage = await createStorageAsync('./db.sqlite');
```

## StorageBackend Interface

**All methods are synchronous** (not async/Promise).

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
  getChildCounter(parentId: string): number;
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
storage.markDirty(elementId);
const dirty = storage.getDirtyElements();
// Returns: { elementId: string, markedAt: string }[]

storage.clearDirtyElements(elementIds);  // Clear specific
storage.clearDirty();                     // Clear all
```

**Note:** `getDirtyElements()` returns `DirtyElement` records, not full Element objects.

## Transactions

```typescript
const result = storage.transaction((tx) => {
  tx.run('INSERT INTO elements ...');
  tx.run('INSERT INTO dependencies ...');
  return 'success';
}, {
  mode: 'immediate',  // 'deferred' | 'immediate' | 'exclusive'
});
```

## Database Location

Default: `.elemental/` directory in project root

```
.elemental/
├── elements.db     # SQLite database
├── elements.jsonl  # JSONL export
└── config.yaml     # Project configuration
```

## Schema

Current version: 4

### Key Tables

| Table | Purpose |
|-------|---------|
| `elements` | All elements with JSON data column |
| `dependencies` | Relationship records |
| `dirty_elements` | Dirty tracking (auto-created in constructor) |
| `blocked_cache` | Materialized blocked status |
| `child_counters` | Hierarchical ID counters |
| `document_versions` | Version history for documents |
| `tags` | Tag index for fast filtering |
| `events` | System events for audit/history |
| `inbox_items` | Notification items per entity |

### Elements Table

```sql
CREATE TABLE elements (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  data TEXT NOT NULL,  -- JSON blob
  content_hash TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

### Dependencies Table

```sql
CREATE TABLE dependencies (
  blocked_id TEXT NOT NULL,
  blocker_id TEXT NOT NULL,
  type TEXT NOT NULL,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  metadata TEXT,  -- JSON blob
  PRIMARY KEY (blocked_id, blocker_id, type),
  FOREIGN KEY (blocked_id) REFERENCES elements(id) ON DELETE CASCADE,
  FOREIGN KEY (blocker_id) REFERENCES elements(id) ON DELETE CASCADE
);
```

**Note:** Deleting elements CASCADE deletes dependencies (FK constraint).

---

## Sync System

**Files:** `packages/sdk/src/sync/`

| File | Purpose |
|------|---------|
| `service.ts` | SyncService: export/import operations |
| `serialization.ts` | Element serialization/deserialization |
| `merge.ts` | Merge resolution logic |
| `hash.ts` | Content hash computation |
| `types.ts` | Sync-related types |

### JSONL Format

```jsonl
{"id":"abc123","type":"task","title":"...","createdAt":"...","createdBy":"..."}
{"id":"def456","type":"entity","name":"...","createdAt":"...","createdBy":"..."}
```

Each line is a complete, self-contained JSON object.

### Export

```typescript
import { createSyncService } from '@elemental/sdk';

const syncService = createSyncService(storage, config);

// Incremental (dirty only)
await syncService.export();

// Full export
await syncService.export({ full: true });

// Custom path
await syncService.export({ outputPath: '/path/to/export.jsonl' });
```

### Import

```typescript
// Standard import (merge)
const result = await syncService.import(jsonlPath);
// result.imported, result.skipped, result.conflicts

// Force import (remote always wins)
await syncService.import(jsonlPath, { force: true });
```

### Serialization

```typescript
import {
  serializeElement,
  deserializeElement,
  serializeDependency,
  deserializeDependency,
} from '@elemental/sdk';

// Element → JSON string
const json = serializeElement(element);

// JSON string → Element
const element = deserializeElement(json);
```

### SerializedElement

```typescript
interface SerializedElement {
  id: string;
  type: ElementType;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  tags: string[];
  metadata: Record<string, unknown>;
  // ... type-specific fields
}
```

### Content Hashing

Content hash is computed for merge conflict detection:

```typescript
import { computeContentHash } from '@elemental/sdk';

const hash = computeContentHash(element);
```

**Excluded from hash:**
- `id`
- `createdAt`
- `updatedAt`
- `createdBy`
- `contentHash`

### Merge Strategy

```typescript
import { mergeElements } from '@elemental/sdk';

const merged = mergeElements(local, remote, options);
```

**Rules:**
1. Newer `updatedAt` wins by default
2. `closed` and `tombstone` statuses **always win**
3. Tags are merged as union (cannot remove via sync)
4. Conflicts tracked in `ImportResult.conflicts`

### Merge Resolution

| Scenario | Winner |
|----------|--------|
| Same hash | Skip (identical) |
| Remote newer | Remote |
| Local newer | Local |
| Either `closed` | `closed` wins |
| Either `tombstone` | `tombstone` wins |
| `force: true` | Remote always |

---

## Backend Differences

| Feature | Bun | Node | Browser |
|---------|-----|------|---------|
| Native | Yes | No (FFI) | No (WASM) |
| Async required | No | No | Yes (OPFS) |
| Performance | Best | Good | Good |
| Memory | Low | Medium | Higher |

### Bun Backend

```typescript
import { BunBackend } from '@elemental/storage/bun-backend';

const backend = new BunBackend('./db.sqlite');
```

### Node Backend

```typescript
import { NodeBackend } from '@elemental/storage/node-backend';

const backend = new NodeBackend('./db.sqlite');
```

### Browser Backend

```typescript
import { BrowserBackend } from '@elemental/storage/browser-backend';

// Uses OPFS (Origin Private File System)
const backend = await BrowserBackend.create('./db.sqlite');
```

---

## Error Handling

```typescript
import { mapStorageError, isConstraintError } from '@elemental/storage';

try {
  storage.run('INSERT ...');
} catch (err) {
  const mapped = mapStorageError(err);
  if (isConstraintError(mapped)) {
    // Handle constraint violation
  }
}
```

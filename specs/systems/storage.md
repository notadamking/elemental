# Storage System Specification

The storage system manages persistence using a dual-storage model: SQLite for fast local queries and JSONL for git-friendly synchronization. It supports multiple runtime environments (Bun, Node, Deno, Browser) with a unified interface.

## Purpose

The storage system provides:
- Fast local queries via SQLite
- Git-compatible sync via JSONL
- Cross-runtime compatibility
- Schema migration support
- Dirty tracking for incremental export

## Architecture Overview

### Dual Storage Model

```
Application Layer (TypeScript API)
           │
     ┌─────┴─────┐
     ▼           ▼
  SQLite      JSONL
  (fast)      (git)
     │           │
     └─────┬─────┘
           ▼
      Sync Engine
```

### Data Flow

| Operation | Path |
|-----------|------|
| Write | API → SQLite → Mark Dirty → Debounced Export → JSONL |
| Read | SQLite → API (JSONL only on import) |
| Sync | JSONL Import → Merge → SQLite → Export → JSONL |

### Source of Truth

JSONL is the authoritative source:
- Git-tracked for version control
- Mergeable for collaboration
- Human-readable for debugging
- SQLite rebuilt from JSONL on mismatch

## Directory Structure

```
.elemental/
├── elemental.db          # SQLite database
├── elemental.db-wal      # WAL file
├── elemental.db-shm      # Shared memory
├── elements.jsonl        # Elements data
├── dependencies.jsonl    # Dependencies data
├── config.yaml           # Configuration
├── playbooks/            # Playbook files
└── .gitignore            # Ignores db files
```

### Gitignore Contents

```
elemental.db
elemental.db-wal
elemental.db-shm
```

## SQLite Configuration

### Pragmas

| Pragma | Value | Purpose |
|--------|-------|---------|
| `journal_mode` | WAL | Concurrent reads |
| `synchronous` | NORMAL | Balance safety/speed |
| `foreign_keys` | ON | Referential integrity |
| `busy_timeout` | 5000 | Wait on locks |

### Schema

See PLAN.md Section 6.5 for complete schema.

Key tables:
- `elements`: All element types
- `dependencies`: Relationships
- `tags`: Element tags (many-to-many)
- `events`: Audit trail
- `document_versions`: Version history
- `dirty_elements`: Export tracking
- `child_counters`: Hierarchical IDs
- `blocked_cache`: Ready work optimization

## Runtime Backends

### Backend Selection

| Runtime | Package | Notes |
|---------|---------|-------|
| Bun | `bun:sqlite` | Native, fastest |
| Node.js | `better-sqlite3` | Synchronous API |
| Deno | `@db/sqlite` | FFI-based |
| Browser | `sql.js` | WASM, OPFS storage |

### Unified Interface

All backends implement common interface:

| Method | Description |
|--------|-------------|
| `exec(sql)` | Execute SQL statement |
| `query(sql, params)` | Query with results |
| `prepare(sql)` | Create prepared statement |
| `transaction(fn)` | Execute in transaction |
| `close()` | Close connection |

### Browser Storage

Browser uses OPFS (Origin Private File System):
- Persistent file-like storage
- SQLite WASM writes to OPFS
- Survives page refresh
- Per-origin isolation

## Dirty Tracking

### Purpose

Track elements modified since last export for incremental sync.

### Mechanism

1. On any element mutation, insert into `dirty_elements`
2. Export queries dirty elements only
3. After successful export, clear dirty set
4. Full export: ignore dirty tracking

### Dirty Table

| Column | Type | Description |
|--------|------|-------------|
| `element_id` | TEXT | Modified element |
| `marked_at` | TEXT | When marked dirty |

### Marking Dirty

Triggers on:
- Element create
- Element update
- Element delete (tombstone)
- Dependency add/remove
- Tag add/remove

## Content Hashing

### Purpose

Detect content changes for merge conflict resolution.

### Computation

```
contentHash = SHA256(type + "|" + JSON.stringify(sortedContentFields))
```

### Included Fields

- All type-specific content (title, content, status, etc.)
- Tags array (sorted alphabetically)

### Excluded Fields

- `id` (identity, not content)
- `contentHash` (self-reference)
- All timestamps
- `createdBy` (attribution)

## Schema Migrations

### Version Tracking

Schema version stored in user_version pragma:
- Query: `PRAGMA user_version`
- Set: `PRAGMA user_version = N`

### Migration Process

1. Read current version
2. Compare to expected version
3. Apply migrations sequentially
4. Update version pragma

### Migration Structure

Each migration has:
- Version number
- Up script (apply)
- Down script (rollback, optional)
- Description

### Migration Safety

- Run in transaction
- Rollback on failure
- Backup before major migrations

## Initialization

### New Database

1. Check if database file exists
2. If not, create with full schema
3. Set schema version
4. Initialize counters

### Existing Database

1. Open database
2. Check schema version
3. Run pending migrations
4. Verify integrity (optional)

### Import from JSONL

1. Read elements.jsonl line by line
2. Parse each line as JSON
3. Upsert into elements table
4. Read dependencies.jsonl
5. Upsert into dependencies table
6. Rebuild caches

## Query Patterns

### Element Queries

- By ID: Primary key lookup
- By type: Indexed type column
- By creator: Indexed createdBy column
- By date range: Indexed timestamp columns

### Tag Queries

- Elements with tag: Join with tags table
- Elements with all tags: Intersect
- Elements with any tags: Union

### Full-Text Search

Options:
1. LIKE queries (simple, slow)
2. FTS5 extension (fast, complex)
3. Application-level search (flexible)

Initial: LIKE queries with JSON extract.

## Transaction Management

### Write Transactions

All mutations in transactions:
- Element create/update/delete
- Dependency add/remove
- Tag add/remove
- Event recording

### Read Transactions

Optional for consistency:
- Snapshot isolation
- Repeatable reads
- Use for complex queries

### Nested Transactions

SQLite uses savepoints:
- `SAVEPOINT name`
- `RELEASE name` (commit)
- `ROLLBACK TO name` (rollback)

## Implementation Methodology

### Backend Abstraction

Create `StorageBackend` interface:
- Abstract away runtime differences
- Lazy loading of backend module
- Runtime detection for auto-selection

### Connection Pooling

Not needed for SQLite:
- Single writer, multiple readers
- WAL mode handles concurrency
- One connection per process sufficient

### Error Handling

Convert SQLite errors to Elemental errors:
- Constraint violations → specific error codes
- Busy timeout → retry or BUSY error
- Integrity errors → DATABASE_ERROR

## Implementation Checklist

### Phase 1: Interface Definition ✅
- [x] Define StorageBackend interface (src/storage/backend.ts)
- [x] Define transaction interface (src/storage/types.ts)
- [x] Define query result types (src/storage/types.ts)
- [x] Create error type mapping (src/storage/errors.ts, DATABASE_BUSY code added)

### Phase 2: Bun Backend ✅
- [x] Implement Bun SQLite adapter (src/storage/bun-backend.ts)
- [x] Test all operations (src/storage/bun-backend.test.ts)
- [x] Optimize for performance (using native Bun SQLite bindings)

### Phase 3: Node Backend ✅
- [x] Implement better-sqlite3 adapter (src/storage/node-backend.ts - NodeStorageBackend class, createNodeStorage factory)
- [x] Test compatibility (tests/node/node-backend.test.ts - 33 tests using vitest for Node.js runtime)
- [x] Handle sync vs async differences (both backends use synchronous API; async factory available via createStorageAsync)

### Phase 4: Browser Backend
- [ ] Implement sql.js adapter
- [ ] Implement OPFS integration
- [ ] Handle WASM loading
- [ ] Test persistence

### Phase 5: Schema Management ✅
- [x] Implement schema creation (src/storage/schema.ts - initializeSchema)
- [x] Implement version tracking (src/storage/schema.ts - getSchemaVersion, isSchemaUpToDate)
- [x] Implement migration runner (src/storage/bun-backend.ts - migrate)
- [x] Create initial migrations (src/storage/schema.ts - MIGRATIONS with full schema)

### Phase 6: Dirty Tracking ✅
- [x] Implement dirty marking (src/storage/bun-backend.ts - markDirty)
- [x] Implement dirty queries (src/storage/bun-backend.ts - getDirtyElements)
- [x] Implement dirty clearing (src/storage/bun-backend.ts - clearDirty, clearDirtyElements)
- [x] Integrate with mutations (src/api/elemental-api.ts - marks dirty on create/update/delete)

### Phase 7: Content Hashing ✅
- [x] Implement hash computation (src/sync/hash.ts - computeContentHashSync)
- [x] Integrate with create/update (src/api/elemental-api.ts - serializeElement)
- [x] Add hash column to schema (content_hash column with index in migration 1)

### Phase 8: Testing
- [x] Unit tests per backend (src/storage/bun-backend.test.ts, tests/node/node-backend.test.ts)
- [x] Integration tests for transactions (src/storage/bun-backend.test.ts, tests/node/node-backend.test.ts)
- [x] Migration tests (src/storage/schema.test.ts - 68 tests)
- [x] Node.js backend tests (tests/node/node-backend.test.ts - 33 tests using vitest)
- [ ] Cross-runtime compatibility tests (pending Browser backend)

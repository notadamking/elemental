# Sync System Specification

The sync system manages bidirectional synchronization between SQLite (fast local storage) and JSONL (git-friendly format), enabling collaboration through version control and conflict resolution.

## Purpose

The sync system provides:
- JSONL export for git tracking
- JSONL import for sync
- Conflict resolution for merges
- Incremental export via dirty tracking
- Browser-to-backend sync support

## JSONL Format

### File Structure

Two JSONL files:
- `elements.jsonl`: All elements
- `dependencies.jsonl`: All dependencies

### Element Line Format

Each line is complete JSON:
- All element fields inline
- ISO 8601 timestamps
- Tags as array
- Metadata as object

### Dependency Line Format

Each line is dependency JSON:
- sourceId, targetId, type
- createdAt, createdBy
- metadata (optional)

### Ordering

Lines ordered by:
1. Type (entities first for references)
2. Creation time
3. ID (for stability)

## Export Process

### Full Export

Export all elements:

1. Query all elements (excluding ephemeral)
2. Serialize each to JSON
3. Write to elements.jsonl
4. Query all dependencies
5. Serialize each to JSON
6. Write to dependencies.jsonl
7. Clear dirty tracking

### Incremental Export

Export only changed elements:

1. Query dirty_elements table
2. For each dirty element:
   - Serialize to JSON
   - Append or update in file
3. Handle deletions (tombstones)
4. Clear dirty tracking
5. Optionally compact file

### Ephemeral Filtering

Exclude ephemeral content:
- Workflows with `ephemeral: true`
- Tasks belonging to ephemeral workflows
- Determined by checking workflow parent

### Tombstone Export

Tombstones are exported:
- Enable deletion sync
- Include TTL information
- Removed after expiration

## Import Process

### Full Import

1. Read elements.jsonl line by line
2. Parse each line as JSON
3. Upsert into elements table
4. Read dependencies.jsonl
5. Upsert into dependencies table
6. Rebuild caches (blocked_cache)
7. Do not mark imported as dirty

### Upsert Logic

For each element:
1. Check if ID exists
2. If not exists: INSERT
3. If exists: Compare content hash
4. If same hash: Skip
5. If different: Apply merge strategy

### Import Order

Critical order for referential integrity:
1. Entities (referenced by createdBy)
2. Documents (referenced by *Ref fields)
3. Other elements
4. Dependencies last

## Merge Strategy

### Same ID, Same Hash

No conflict:
- Skip (already identical)
- No action needed

### Same ID, Different Hash

Conflict resolution:
1. Compare `updatedAt` timestamps
2. Later timestamp wins (Last-Write-Wins)
3. Record conflict in import result

### Tombstone Handling

| Local | Remote | Result |
|-------|--------|--------|
| Live | Live (different) | LWW by updatedAt |
| Live | Tombstone (fresh) | Tombstone wins |
| Live | Tombstone (expired) | Live wins |
| Tombstone (fresh) | Live | Tombstone wins |
| Tombstone (expired) | Live | Live wins |
| Tombstone | Tombstone | Later deletedAt wins |

Fresh = within TTL (default 30 days)

### Status Merge

Special handling for status:
- `closed` always wins over open states
- Prevents accidental reopening
- Explicit reopen creates new event

### Tags Merge

Set union strategy:
- Combine tags from both sides
- Never lose a tag in merge
- Duplicates deduplicated

### Dependencies Merge

Removal is authoritative:
- If one side removed dependency, it's removed
- Additions from both sides kept
- No duplicate dependencies

## Dirty Tracking

### Purpose

Track local changes for incremental export.

### Mechanism

`dirty_elements` table:
- element_id: Modified element
- marked_at: When marked

### Triggers

Mark dirty on:
- Element create
- Element update
- Element delete
- Tag add/remove (marks element)
- Dependency add/remove (marks source)

### Clearing

Clear after successful export:
- Remove from dirty_elements
- Export must fully succeed
- Transactional consistency

## Content Hashing

### Purpose

Detect content changes efficiently.

### Computation

1. Collect content fields (type-specific)
2. Sort object keys
3. JSON stringify
4. Prepend type
5. SHA256 hash
6. Store in content_hash column

### Excluded Fields

- id (identity)
- createdAt, updatedAt, etc. (timestamps)
- createdBy (attribution)
- contentHash (self)

### Usage

- Compare before merge
- Skip unchanged elements
- Detect actual conflicts

## Browser Sync

### Architecture

```
Browser                    Server
   │                          │
SQLite (WASM)             SQLite
   │                          │
   ▼                          ▼
Export JSONL ──────────► Import/Merge
   │                          │
   │◄─────────────────── Export JSONL
   ▼                          │
Import/Merge              Broadcast
```

### Sync Protocol

1. Browser exports local changes
2. HTTP POST to server with JSONL
3. Server merges with its state
4. Server exports current state
5. HTTP response with JSONL
6. Browser imports and merges
7. Both now synchronized

### Real-time Updates (Future)

WebSocket for live sync:
- Subscribe to changes
- Push updates immediately
- Reduce polling

## Conflict Reporting

### ImportResult

Import returns result with:
- `elementsImported`: Count
- `dependenciesImported`: Count
- `conflicts`: Array of conflicts
- `errors`: Array of errors

### Conflict Record

| Field | Description |
|-------|-------------|
| `elementId` | Conflicting element |
| `localValue` | Local content hash |
| `remoteValue` | Remote content hash |
| `resolution` | Which won |
| `timestamp` | When resolved |

## Sync Commands

### el sync

Full sync cycle:
1. Export local changes
2. Send to remote (if configured)
3. Receive remote changes
4. Import and merge
5. Report results

### el export

Export only:
- `--output <file>`: Output path
- `--full`: Full export (ignore dirty)
- `--format`: jsonl (default)

### el import

Import only:
- `--input <file>`: Input path
- `--dry-run`: Show what would change
- `--force`: Override conflicts

### el status

Show sync status:
- Dirty element count
- Last export time
- Last import time
- Pending conflicts

## Implementation Methodology

### Export Pipeline

1. Query elements with filters
2. Stream through serializer
3. Write to file (buffered)
4. Handle large datasets efficiently

### Import Pipeline

1. Stream read file
2. Parse line by line
3. Batch upserts (50 at a time)
4. Progress reporting

### Conflict Resolution

Pluggable resolver:
- Default: LWW strategy
- Custom: User-defined function
- Interactive: CLI prompt

### Atomicity

Import in transaction:
- All-or-nothing import
- Rollback on error
- No partial state

## Implementation Checklist

### Phase 1: JSONL Format
- [x] Define serialization format ✅ (SerializedElement, SerializedDependency types)
- [x] Implement element serializer ✅ (serializeElement, serializeElements)
- [x] Implement dependency serializer ✅ (serializeDependency, serializeDependencies)
- [x] Implement line parser ✅ (parseElement, parseDependency, tryParse variants, batch parsing)

### Phase 2: Export
- [x] Implement full export ✅ (SyncService.export with full option)
- [x] Implement incremental export ✅ (SyncService.export uses dirty tracking)
- [x] Implement ephemeral filtering ✅ (includeEphemeral option in export)
- [x] Implement file writing ✅ (async/sync file writing with JSONL format)

### Phase 3: Import
- [x] Implement file reading ✅ (SyncService.import reads from inputDir)
- [x] Implement parsing ✅ (uses parseElements/parseDependencies with error collection)
- [x] Implement upsert logic ✅ (merge strategy applied per element)
- [x] Implement import ordering ✅ (sortElementsForExport ensures entities first)

### Phase 4: Merge Strategy
- [x] Implement LWW resolution ✅ (mergeElements with updatedAt comparison)
- [x] Implement tombstone handling ✅ (getTombstoneStatus, fresh vs expired handling)
- [x] Implement status merge ✅ (closed status wins over open)
- [x] Implement tags merge ✅ (mergeTags with set union)
- [x] Implement dependencies merge ✅ (mergeDependencies with removal authority)

### Phase 5: Dirty Tracking
- [x] Implement dirty marking ✅ (StorageBackend.markDirty)
- [x] Implement dirty clearing ✅ (StorageBackend.clearDirty, clearDirtyElements)
- [x] Integrate with mutations ✅ (API marks elements dirty on create/update/delete)

### Phase 6: Content Hashing
- [x] Implement hash computation ✅ (computeContentHash, computeContentHashSync with SHA256)
- [x] Implement comparison ✅ (hasSameContentHash, matchesContentHash)
- [x] Integrate with merge ✅ (used in mergeElements for conflict detection)

### Phase 7: CLI Commands
- [x] Implement export ✅ (el export with --output, --full, --include-ephemeral options)
- [x] Implement import ✅ (el import with --input, --dry-run, --force options)
- [x] Implement status ✅ (el status showing dirty count, total count, sync dir status)
- [x] Unit tests ✅ (46 tests in sync.test.ts)

### Phase 8: Browser Sync
- [ ] Implement HTTP endpoints
- [ ] Implement browser export
- [ ] Implement browser import
- [ ] Test cross-platform

### Phase 9: Testing
- [x] Unit tests for serialization ✅ (87 tests covering all serialization functions)
- [x] Unit tests for merge ✅ (LWW, tombstones, status merge, tags merge, dependency merge)
- [x] Integration tests for sync ✅ (24 tests in service.test.ts covering export/import/round-trip)
- [x] Conflict resolution tests ✅ (ConflictRecord generation, resolution scenarios)

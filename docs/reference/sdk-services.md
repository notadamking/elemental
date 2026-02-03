# SDK Services Reference

Services from `@elemental/sdk` (`packages/sdk/src/services/`).

## DependencyService

**File:** `services/dependency.ts`

Manages relationships between elements.

```typescript
import { createDependencyService } from '@elemental/sdk';

const depService = createDependencyService(storage);
```

### Methods

```typescript
// Add dependency
depService.add({
  blockedId,
  blockerId,
  type: 'blocks',
  createdBy: actorId,
  metadata?: { /* gate config */ },
});

// Remove dependency
depService.remove(blockedId, blockerId, type);

// Check existence
const exists = depService.exists(blockedId, blockerId, type);

// Get single dependency
const dep = depService.getDependency(blockedId, blockerId, type);

// Get outgoing dependencies
const deps = depService.getDependencies(blockedId, types?);

// Get incoming dependencies (what depends on this)
const dependents = depService.getDependents(blockerId, types?);

// Bulk get for multiple sources
const deps = depService.getDependenciesForMany(blockedIds, type?);

// Remove all from/to element
depService.removeAllDependencies(blockedId, type?);
depService.removeAllDependents(blockerId);

// Count without fetching
const count = depService.countDependencies(blockedId, type?);

// Cycle detection
const hasCycle = depService.detectCycle(blockedId, blockerId, type);
```

### Cycle Detection

- BFS traversal from blocked to blocker
- Depth limit: 100 levels
- Only checked for blocking types (`blocks`, `awaits`)
- Self-referential rejected immediately with `CYCLE_DETECTED`

**Warning:** `api.addDependency()` does NOT check cycles automatically. Call `detectCycle()` manually.

---

## BlockedCacheService

**File:** `services/blocked-cache.ts`

Materialized view of blocked status. Import directly (not exported from index):

```typescript
import { createBlockedCacheService } from '@elemental/sdk/services/blocked-cache';

const blockedCache = createBlockedCacheService(storage);
```

### Query Methods

```typescript
// Check if element is blocked
const isBlocked = blockedCache.isBlocked(elementId);

// Get all blocked elements
const allBlocked = blockedCache.getAllBlocked();

// Get elements blocked by a specific element
const blockedBy = blockedCache.getBlockedBy(blockerId);
```

### Event Handlers (call after mutations)

```typescript
blockedCache.onDependencyAdded(blockedId, blockerId, type, metadata?, options?);
blockedCache.onDependencyRemoved(blockedId, blockerId, type, options?);
blockedCache.onStatusChanged(elementId, oldStatus, newStatus, options?);
blockedCache.onElementDeleted(elementId, options?);
```

### Gate Satisfaction

```typescript
// Satisfy external/webhook gate
blockedCache.satisfyGate(blockedId, blockerId, actor, options?);

// Approval gates
blockedCache.recordApproval(blockedId, blockerId, approver, options?);
blockedCache.removeApproval(blockedId, blockerId, approver, options?);
```

### Auto-Transitions

For automatic status changes to/from `blocked`:

```typescript
blockedCache.setStatusTransitionCallback((elementId, newStatus, reason) => {
  // Called when element should transition to blocked/unblocked
  return api.update(elementId, { status: newStatus });
});
```

Events generated: `auto_blocked`, `auto_unblocked` with actor `'system:blocked-cache'`

### Rebuild

```typescript
const result = blockedCache.rebuild(options?);
// Performs full cache rebuild with topological ordering
```

---

## PriorityService

**File:** `services/priority-service.ts`

Calculates effective priority based on dependency graph.

```typescript
import { createPriorityService } from '@elemental/sdk';

const priorityService = createPriorityService(storage, depService);
```

### Methods

```typescript
// Single task effective priority
const result = await priorityService.calculateEffectivePriority(taskId);
// result.effectivePriority - highest priority from dependents
// result.influencers - tasks that influenced the priority

// Batch calculation
const results = await priorityService.calculateEffectivePriorities(taskIds);

// Aggregate complexity (opposite direction!)
const complexity = await priorityService.calculateAggregateComplexity(taskId);

// Enhance tasks with effective priority
const enhanced = await priorityService.enhanceTasksWithEffectivePriority(tasks);

// Sort by effective priority
priorityService.sortByEffectivePriority(tasks);  // WARNING: mutates array in place!
```

### Direction Semantics

| Metric | Direction | Description |
|--------|-----------|-------------|
| Effective priority | **Upstream** | Tasks that depend on this task |
| Aggregate complexity | **Downstream** | Tasks this task depends on |

---

## InboxService

**File:** `services/inbox.ts`

Manages entity notification items.

```typescript
import { createInboxService } from '@elemental/sdk';

const inboxService = createInboxService(storage);
```

### Methods

```typescript
// Get inbox items
const items = inboxService.getInbox(recipientId, filter?);
const paginated = inboxService.getInboxPaginated(recipientId, { limit, offset, filter });

// Count
const count = inboxService.getUnreadCount(recipientId);

// Status changes
inboxService.markAsRead(itemId);
inboxService.markAsUnread(itemId);
inboxService.markAllAsRead(recipientId);
inboxService.archive(itemId);

// Create item (usually done automatically on message send)
inboxService.createInboxItem({
  recipientId,
  messageId,
  sourceType: 'direct' | 'mention',
});
```

### Filter Options

```typescript
interface InboxFilter {
  status?: InboxStatus | InboxStatus[];
  sourceType?: InboxSourceType;
  after?: Timestamp;
  before?: Timestamp;
}
```

**Note:** `readAt` is null if archived without reading. Mark operations are idempotent.

---

## IdLengthCache

**File:** `services/id-length-cache.ts`

Calculates minimum unique ID prefix length.

```typescript
import { createIdLengthCache } from '@elemental/sdk';

const idLengthCache = createIdLengthCache(storage, {
  refreshIntervalMs: 60000,  // Default: 60 seconds
});
```

### Methods

```typescript
// Get minimum ID length for unique prefix
const minLength = idLengthCache.getMinIdLength();

// Force refresh
idLengthCache.refresh();

// Check if stale
const isStale = idLengthCache.isStale();
```

Refreshes automatically on access if stale. Used by CLI for short ID support.

---

## SyncService

**File:** `sync/service.ts`

Manages JSONL export/import.

```typescript
import { createSyncService } from '@elemental/sdk';

const syncService = createSyncService(storage, config);
```

### Export

```typescript
// Incremental (dirty elements only)
await syncService.export();

// Full export
await syncService.export({ full: true });

// Export to specific path
await syncService.export({ outputPath: '/path/to/elements.jsonl' });
```

### Import

```typescript
// Standard import (merge)
const result = await syncService.import(jsonlPath);
// result.imported, result.skipped, result.conflicts

// Force import (remote always wins)
await syncService.import(jsonlPath, { force: true });
```

### Related Files

| File | Purpose |
|------|---------|
| `sync/serialization.ts` | Element serialization/deserialization |
| `sync/merge.ts` | Merge resolution logic |
| `sync/hash.ts` | Content hash computation |
| `sync/types.ts` | Sync-related types |

### Merge Strategy

- Newer `updatedAt` wins by default
- `closed` and `tombstone` statuses **always win**
- Tags merged as union (cannot remove via sync)
- Content hash excludes timestamps for conflict detection

---

## Service Integration Pattern

Services are typically created together:

```typescript
import {
  createDependencyService,
  createPriorityService,
  createInboxService,
  createIdLengthCache,
} from '@elemental/sdk';
import { createBlockedCacheService } from '@elemental/sdk/services/blocked-cache';

// Create services
const depService = createDependencyService(storage);
const blockedCache = createBlockedCacheService(storage);
const priorityService = createPriorityService(storage, depService);
const inboxService = createInboxService(storage);
const idLengthCache = createIdLengthCache(storage);

// Wire up auto-transitions
blockedCache.setStatusTransitionCallback((elementId, newStatus, reason) => {
  return storage.run(
    'UPDATE elements SET data = json_set(data, "$.status", ?) WHERE id = ?',
    [newStatus, elementId]
  );
});
```

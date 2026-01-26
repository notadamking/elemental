# Dependency System

## Files
- **Type**: `src/types/dependency.ts`
- **Service**: `src/services/dependency.ts`
- **Blocked Cache**: `src/services/blocked-cache.ts`
- **Priority Service**: `src/services/priority-service.ts` - Effective priority calculation
- **ID Length Cache**: `src/services/id-length-cache.ts` - Short ID prefix optimization
- **Inbox Service**: `src/services/inbox.ts` - Entity notification management
- **Tests**: `src/services/*.test.ts`

## Dependency Types

| Type | Effect | Use Case |
|------|--------|----------|
| `blocks` | Blocking | Task A must complete before Task B |
| `parent-child` | Hierarchical | Plan contains Tasks |
| `awaits` | Gate | Wait for approval/timer/external |
| `relates-to` | Associative | Semantic link (bidirectional) |
| `references` | Associative | Citation |
| `reply-to` | Threading | Message reply chain |
| `mentions` | Attribution | @mention reference |

## Key Operations

### Add dependency
```typescript
await api.addDependency({ sourceId, targetId, type: 'blocks' });
```

### Remove dependency
```typescript
await api.removeDependency(sourceId, targetId, 'blocks');
```

### Check if blocked
```typescript
const blockedTasks = await api.blocked();  // Returns tasks with block reasons
```

### Get dependency tree
```typescript
const tree = await api.getDependencyTree(elementId);
```

### Get dependencies
```typescript
// Outgoing (what this element depends on)
const deps = await api.getDependencies(elementId, types?);

// Incoming (what depends on this element)
const dependents = await api.getDependents(elementId, types?);

// For bidirectional relates-to, query both directions
const outgoing = await api.getDependencies(elementId, ['relates-to']);
const incoming = await api.getDependents(elementId, ['relates-to']);
```

### Additional service methods (via DependencyService)

```typescript
// Check if specific dependency exists
const exists = service.exists(sourceId, targetId, type);

// Get single dependency by composite key
const dep = service.getDependency(sourceId, targetId, type);

// Bulk get dependencies for multiple sources
const deps = service.getDependenciesForMany(sourceIds, type?);

// Remove all dependencies from/to element
service.removeAllDependencies(sourceId, type?);
service.removeAllDependents(targetId);

// Count without fetching
const count = service.countDependencies(sourceId, type?);
```

## Blocked Cache

The `BlockedCacheService` (`src/services/blocked-cache.ts`) maintains a materialized view of which tasks are blocked.

**Query methods:**
- `isBlocked(elementId)` - Check if blocked
- `getAllBlocked()` - Get all blocked elements
- `getBlockedBy(blockerId)` - Get elements blocked by X

**Event handlers (call after mutations):**
- `onDependencyAdded(sourceId, targetId, type, metadata?, options?)`
- `onDependencyRemoved(sourceId, targetId, type, options?)`
- `onStatusChanged(elementId, oldStatus, newStatus, options?)`
- `onElementDeleted(elementId, options?)`

**Gate satisfaction:**
- `satisfyGate(sourceId, targetId, actor, options?)`
- `recordApproval(sourceId, targetId, approver, options?)`
- `removeApproval(sourceId, targetId, approver, options?)`

**Rebuild:**
- `rebuild(options?)` - Full cache rebuild with topological ordering

**Setup for auto-transitions:**
- `setStatusTransitionCallback(callback)` - Required for automatic status changes

## Cycle Detection

- BFS traversal from source to target
- Depth limit: 100 levels
- Only checked for blocking dependency types (`blocks`, `awaits`)
- Self-referential dependencies rejected immediately with `CYCLE_DETECTED`

## Bidirectional Dependencies

- `relates-to` is stored normalized (lexicographically smaller ID is source)
- Query either direction to find the relationship

## Priority Service

Calculates effective priority based on dependency graph:

```typescript
// Single task
const result = await priorityService.calculateEffectivePriority(taskId);
// result.effectivePriority - highest priority from dependents
// result.influencers - tasks that influenced the priority

// Batch calculation
const results = await priorityService.calculateEffectivePriorities(taskIds);

// Aggregate complexity (walks opposite direction!)
const complexity = await priorityService.calculateAggregateComplexity(taskId);

// Enhance tasks with effective priority
const enhanced = await priorityService.enhanceTasksWithEffectivePriority(tasks);

// Sort by effective priority (WARNING: mutates array in place!)
priorityService.sortByEffectivePriority(tasks);
```

**Direction semantics:**
- Effective priority walks **upstream** (tasks that depend on this task)
- Aggregate complexity walks **downstream** (tasks this task depends on)

## Awaits Gate Types

| Gate | Satisfied When |
|------|----------------|
| `timer` | Current time >= `waitUntil` timestamp |
| `approval` | `currentApprovers.length >= requiredCount` |
| `external` | `metadata.satisfied === true` (via `satisfyGate()`) |
| `webhook` | `metadata.satisfied === true` (via webhook callback) |

```typescript
// Satisfy external gate
await api.satisfyGate(sourceId, targetId, actor);

// Record approval
await api.recordApproval(sourceId, targetId, approverId);
```

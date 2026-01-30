# Understanding the Dependency System

How elements relate to each other and why blocking semantics matter.

## The Dependency Model

Dependencies connect elements in a directed graph. Each dependency has:
- **sourceId** - The element that has the dependency
- **targetId** - The element being depended on
- **type** - The nature of the relationship

The composite key is `(sourceId, targetId, type)`, allowing multiple relationship types between the same pair of elements.

## Dependency Categories

### Blocking Dependencies

These affect whether work can proceed:

| Type | Who Waits | Use Case |
|------|-----------|----------|
| `blocks` | Target waits for source | Task A must finish before Task B |
| `parent-child` | Source waits for target | Plan contains tasks |
| `awaits` | Source waits for target | Approval gates, timers |

**Critical distinction:** `blocks` has **opposite** direction semantics from `parent-child` and `awaits`:

```
blocks:       Source (blocker) → Target (blocked)
              Target waits for Source to close

parent-child: Source (child) → Target (parent)
              Parent waits for all children to close

awaits:       Source (waiter) → Target (gate)
              Source waits for gate condition
```

### Associative Dependencies

Non-blocking knowledge graph connections:

| Type | Meaning | Directionality |
|------|---------|----------------|
| `relates-to` | Semantic link | Bidirectional |
| `references` | Citation | Unidirectional |
| `supersedes` | Version chain | Unidirectional |
| `duplicates` | Deduplication marker | Bidirectional |
| `caused-by` | Audit trail causation | Unidirectional |
| `validates` | Test verification | Unidirectional |
| `mentions` | @mention reference | Unidirectional |

### Attribution Dependencies

Link elements to entities:

| Type | Meaning |
|------|---------|
| `authored-by` | Creator attribution |
| `assigned-to` | Responsibility assignment |
| `approved-by` | Sign-off approval |

### Threading Dependencies

Message conversations:

| Type | Meaning |
|------|---------|
| `replies-to` | Thread parent reference |

## The `blocked` Status

The `blocked` status is **computed, never set directly**. An element is blocked when:

1. It has unresolved `blocks` dependencies (something blocking it hasn't closed)
2. Its parent hasn't closed (for `parent-child`)
3. A gate condition isn't satisfied (for `awaits`)

### BlockedCacheService

The `BlockedCacheService` maintains O(1) lookup for blocked status:

```typescript
const blockedCache = createBlockedCacheService(storage);

// Check if blocked
blockedCache.isBlocked(taskId);  // O(1)

// Get all blocked elements
blockedCache.getAllBlocked();  // Returns Set<ElementId>

// Get what's blocked by a specific element
blockedCache.getBlockedBy(blockerId);
```

### Auto-Transitions

When blockers resolve, the cache triggers automatic status transitions:

```typescript
// Enable auto-transitions
blockedCache.setStatusTransitionCallback((elementId, newStatus, reason) => {
  return api.update(elementId, { status: newStatus });
});

// When all blockers close, this fires:
// elementId: the unblocked task
// newStatus: 'open'
// reason: 'All blocking dependencies resolved'
```

These generate `auto_blocked` and `auto_unblocked` events with actor `'system:blocked-cache'`.

## Direction Semantics Deep Dive

### `blocks` - Target Waits

"Task B is blocked by Task A" means:
- Task B cannot proceed until Task A closes
- Source: Task A (the blocker)
- Target: Task B (the blocked one)

```typescript
// Task B waits for Task A
await api.addDependency({
  sourceId: taskA.id,  // The blocker
  targetId: taskB.id,  // The one being blocked
  type: 'blocks',
  createdBy: actorId,
});
```

### `parent-child` - Source Waits (Aggregated)

A plan contains tasks. The plan's `blocked` status depends on its children:

```typescript
// Create task as child of plan
await api.addDependency({
  sourceId: taskId,    // The child
  targetId: planId,    // The parent
  type: 'parent-child',
  createdBy: actorId,
});
```

**Important:** Parent-child doesn't actually block the parent. Instead, plans track completion through their children's status.

### `awaits` - Gate Dependencies

For time-based, approval-based, or external conditions:

```typescript
// Timer gate - wait until a specific time
await api.addDependency({
  sourceId: taskId,
  targetId: gateId,
  type: 'awaits',
  metadata: {
    gateType: 'timer',
    waitUntil: '2024-01-20T09:00:00.000Z',
  },
  createdBy: actorId,
});

// Approval gate - wait for approvers
await api.addDependency({
  sourceId: taskId,
  targetId: gateId,
  type: 'awaits',
  metadata: {
    gateType: 'approval',
    requiredApprovers: ['manager-1', 'lead-1'],
    requiredCount: 1,  // Need 1 of 2
    currentApprovers: [],
  },
  createdBy: actorId,
});

// External gate - wait for external system
await api.addDependency({
  sourceId: taskId,
  targetId: gateId,
  type: 'awaits',
  metadata: {
    gateType: 'external',
    externalSystem: 'ci',
    externalId: 'build-123',
    satisfied: false,
  },
  createdBy: actorId,
});
```

## Cycle Detection

Cycles in blocking dependencies create deadlocks. The system detects them:

```typescript
import { createDependencyService } from '@elemental/sdk';

const depService = createDependencyService(storage);

// Check BEFORE adding
const wouldCycle = depService.detectCycle(taskA.id, taskB.id, 'blocks');
if (wouldCycle) {
  throw new Error('Would create circular dependency');
}
```

**Important:** `api.addDependency()` does NOT auto-check cycles. You must check manually.

Cycle detection:
- Only applies to blocking dependency types
- Has a depth limit of 100 levels
- Self-references are rejected immediately with `CYCLE_DETECTED`

## Bidirectional `relates-to`

The `relates-to` type is bidirectional but stored normalized (smaller ID is always source):

```typescript
// Either of these creates the same dependency:
await api.addDependency({ sourceId: 'a', targetId: 'b', type: 'relates-to' });
await api.addDependency({ sourceId: 'b', targetId: 'a', type: 'relates-to' });

// To find all related elements, query both directions:
const outgoing = await api.getDependencies(id, ['relates-to']);
const incoming = await api.getDependents(id, ['relates-to']);
const allRelated = [...new Set([
  ...outgoing.map(d => d.targetId),
  ...incoming.map(d => d.sourceId),
])];
```

Helper function:

```typescript
import { normalizeRelatesToDependency, areRelated } from '@elemental/core';

// Normalize for consistent storage
const { sourceId, targetId } = normalizeRelatesToDependency(elementA, elementB);

// Check if related
const related = areRelated(dependencies, elementA, elementB);
```

## Querying Dependencies

### Outgoing (what this element depends on)

```typescript
const deps = await api.getDependencies(elementId);
// With type filter
const blockingDeps = await api.getDependencies(elementId, ['blocks', 'awaits']);
```

### Incoming (what depends on this element)

```typescript
const dependents = await api.getDependents(elementId);
const blockedByThis = await api.getDependents(elementId, ['blocks']);
```

### Dependency Tree

```typescript
const tree = await api.getDependencyTree(elementId);
```

## Common Patterns

### Task Sequencing

```typescript
// Task 2 waits for Task 1
await api.addDependency({
  sourceId: task1.id,
  targetId: task2.id,
  type: 'blocks',
  createdBy: actorId,
});

// Task 3 waits for Task 2
await api.addDependency({
  sourceId: task2.id,
  targetId: task3.id,
  type: 'blocks',
  createdBy: actorId,
});
```

### Approval Workflow

```typescript
// Create gate
const gate = await api.create({
  type: 'task',
  title: 'Approval Gate',
  ...
});

// Deploy waits for approval
await api.addDependency({
  sourceId: deployTask.id,
  targetId: gate.id,
  type: 'awaits',
  metadata: {
    gateType: 'approval',
    requiredApprovers: ['security-team', 'ops-team'],
    requiredCount: 2,
    currentApprovers: [],
  },
  createdBy: actorId,
});

// When approved:
await api.recordApproval(deployTask.id, gate.id, 'security-team');
await api.recordApproval(deployTask.id, gate.id, 'ops-team');
// deployTask automatically unblocked
```

### Document References

```typescript
// Task references a spec document
await api.addDependency({
  sourceId: task.id,
  targetId: specDoc.id,
  type: 'references',
  createdBy: actorId,
});

// Link related documents
await api.addDependency({
  sourceId: doc1.id,
  targetId: doc2.id,
  type: 'relates-to',
  createdBy: actorId,
});
```

## Gotchas

1. **`blocked` is computed** - Never set `status: 'blocked'` directly. The system computes it from dependencies.

2. **Direction matters** - `blocks` direction is opposite to `parent-child` and `awaits`. Get it wrong and nothing blocks.

3. **Cycles not auto-checked** - Call `detectCycle()` before adding blocking dependencies.

4. **`relates-to` is normalized** - Always query both directions to find all related elements.

5. **Parent-child doesn't block plans** - Plans don't become "blocked" based on children. Use task blocking for sequencing.

6. **Cascade delete** - Deleting an element removes all its dependencies (both directions).

7. **No transitive blocking** - If A blocks B and B blocks C, closing A doesn't unblock C. Each must resolve independently.

## Related Documentation

- [How to Work with Dependencies](../how-to/work-with-dependencies.md) - Practical guide
- [Core Types Reference](../reference/core-types.md) - Dependency type details
- [SDK Services Reference](../reference/sdk-services.md) - BlockedCacheService API

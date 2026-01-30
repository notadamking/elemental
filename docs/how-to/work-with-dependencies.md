# How to Work with Dependencies

Guide for managing relationships between elements.

## Dependency Types

| Type | Blocking? | Direction | Use Case |
|------|-----------|-----------|----------|
| `blocks` | Yes | Target waits for source | Task A must complete before B |
| `parent-child` | Yes | Source waits for target | Plan contains tasks |
| `awaits` | Yes | Source waits for target | Approval gates, timers |
| `relates-to` | No | Bidirectional | Semantic links |
| `references` | No | Source → Target | Citations |
| `reply-to` | No | Source → Target | Message threading |
| `mentions` | No | Source → Target | @mention reference |

## Adding Dependencies

### Using the API

```typescript
import { createElementalAPI } from '@elemental/sdk';

const api = await createElementalAPI();

// Add blocking dependency
// "taskA is blocked BY taskB" (taskB must complete first)
await api.addDependency({
  sourceId: taskA.id,
  targetId: taskB.id,
  type: 'blocks',
  createdBy: actorId,
});

// Add parent-child (plan contains task)
await api.addDependency({
  sourceId: taskId,
  targetId: planId,
  type: 'parent-child',
  createdBy: actorId,
});

// Add with metadata (for awaits gates)
await api.addDependency({
  sourceId: taskId,
  targetId: approvalGateId,
  type: 'awaits',
  createdBy: actorId,
  metadata: {
    gate: 'approval',
    requiredApprovers: ['manager-1', 'lead-1'],
    requiredCount: 1,
    currentApprovers: [],
  },
});
```

### Using the CLI

```bash
# Add blocking dependency
# A is blocked BY B (B must complete first)
el dep add --type=blocks A B

# Add parent-child
el dep add --type=parent-child task-1 plan-1

# Add relates-to
el dep add --type=relates-to doc-1 doc-2
```

## Removing Dependencies

### API

```typescript
await api.removeDependency(sourceId, targetId, 'blocks');
```

### CLI

```bash
el dep remove A B --type=blocks
```

## Querying Dependencies

### Get Outgoing (what this depends on)

```typescript
const deps = await api.getDependencies(elementId);
// With type filter
const blockingDeps = await api.getDependencies(elementId, ['blocks']);
```

### Get Incoming (what depends on this)

```typescript
const dependents = await api.getDependents(elementId);
const blockedBy = await api.getDependents(elementId, ['blocks']);
```

### CLI

```bash
# Outgoing
el dep list task-1 --direction out

# Incoming
el dep list task-1 --direction in

# Both
el dep list task-1 --direction both

# With type filter
el dep list task-1 --type blocks
```

### Dependency Tree

```typescript
const tree = await api.getDependencyTree(elementId);
```

```bash
el dep tree task-1
```

## Understanding Blocking

### Direction Semantics

**Critical:** `blocks` direction is **opposite** to `parent-child` and `awaits`:

| Type | Source | Target | Who waits? |
|------|--------|--------|------------|
| `blocks` | blocker | blocked | **Target** waits |
| `parent-child` | child | parent | **Source** waits |
| `awaits` | waiter | gate | **Source** waits |

Example:
```typescript
// "Task B is blocked by Task A"
// Source: A (the blocker), Target: B (the blocked)
await api.addDependency({
  sourceId: taskA.id,  // The blocker
  targetId: taskB.id,  // The one being blocked
  type: 'blocks',
});
```

### Checking Blocked Status

```typescript
// Get all blocked tasks
const blocked = await api.blocked();

// Check specific task
const blockedTasks = await api.blocked();
const isBlocked = blockedTasks.some(t => t.id === taskId);

// Using BlockedCacheService directly
import { createBlockedCacheService } from '@elemental/sdk/services/blocked-cache';

const blockedCache = createBlockedCacheService(storage);
const isBlocked = blockedCache.isBlocked(taskId);
const allBlocked = blockedCache.getAllBlocked();
const blockedByThis = blockedCache.getBlockedBy(blockerId);
```

### Auto-Transitions

The BlockedCacheService automatically transitions tasks:
- When all blockers complete → task becomes `open`
- When a blocker is added → task becomes `blocked`

```typescript
// Enable auto-transitions
blockedCache.setStatusTransitionCallback((elementId, newStatus, reason) => {
  return api.update(elementId, { status: newStatus });
});
```

Events generated: `auto_blocked`, `auto_unblocked` with actor `'system:blocked-cache'`

## Gate Dependencies (awaits)

### Timer Gate

```typescript
await api.addDependency({
  sourceId: taskId,
  targetId: gateId,
  type: 'awaits',
  createdBy: actorId,
  metadata: {
    gate: 'timer',
    waitUntil: '2024-01-15T10:00:00.000Z',
  },
});
```

Satisfied when: Current time >= `waitUntil`

### Approval Gate

```typescript
await api.addDependency({
  sourceId: taskId,
  targetId: gateId,
  type: 'awaits',
  createdBy: actorId,
  metadata: {
    gate: 'approval',
    requiredApprovers: ['manager-1', 'lead-1'],
    requiredCount: 1,  // Need 1 of the 2
    currentApprovers: [],
  },
});

// Record approval
await api.recordApproval(sourceId, targetId, 'manager-1');

// Remove approval
await api.removeApproval(sourceId, targetId, 'manager-1');
```

Satisfied when: `currentApprovers.length >= requiredCount`

### External Gate

```typescript
await api.addDependency({
  sourceId: taskId,
  targetId: gateId,
  type: 'awaits',
  createdBy: actorId,
  metadata: {
    gate: 'external',
    satisfied: false,
  },
});

// Satisfy the gate
await api.satisfyGate(sourceId, targetId, actorId);
```

Satisfied when: `metadata.satisfied === true`

### Webhook Gate

Same as external, but triggered by webhook callback.

## Bidirectional Dependencies

`relates-to` is stored normalized (smaller ID is always source):

```typescript
// Either of these creates the same dependency:
await api.addDependency({ sourceId: 'a', targetId: 'b', type: 'relates-to' });
await api.addDependency({ sourceId: 'b', targetId: 'a', type: 'relates-to' });

// Query both directions to find all related:
const outgoing = await api.getDependencies(id, ['relates-to']);
const incoming = await api.getDependents(id, ['relates-to']);
const allRelated = [...outgoing, ...incoming];
```

## Cycle Detection

```typescript
import { createDependencyService } from '@elemental/sdk';

const depService = createDependencyService(storage);

// Check before adding
const hasCycle = depService.detectCycle(sourceId, targetId, 'blocks');
if (hasCycle) {
  throw new Error('Would create a cycle');
}

await api.addDependency({ sourceId, targetId, type: 'blocks' });
```

**Warning:** `api.addDependency()` does NOT check cycles automatically. Check manually!

- Depth limit: 100 levels
- Only checked for blocking types
- Self-referential rejected immediately with `CYCLE_DETECTED`

## Common Patterns

### Task Hierarchy

```typescript
// Create plan
const plan = await api.create({ type: 'plan', title: 'Sprint 1', ... });

// Create tasks in plan
const task1 = await api.createTaskInPlan(plan.id, { title: 'Task 1', ... });
const task2 = await api.createTaskInPlan(plan.id, { title: 'Task 2', ... });

// Add blocking between tasks
await api.addDependency({
  sourceId: task1.id,
  targetId: task2.id,
  type: 'blocks',  // task2 waits for task1
});
```

### Approval Workflow

```typescript
// Create review task
const reviewTask = await api.create({
  type: 'task',
  title: 'Review PR',
  ...
});

// Create deploy task that awaits approval
const deployTask = await api.create({
  type: 'task',
  title: 'Deploy to production',
  ...
});

await api.addDependency({
  sourceId: deployTask.id,
  targetId: reviewTask.id,
  type: 'awaits',
  metadata: {
    gate: 'approval',
    requiredApprovers: ['tech-lead', 'product-owner'],
    requiredCount: 2,
    currentApprovers: [],
  },
});

// Later, approvers approve
await api.recordApproval(deployTask.id, reviewTask.id, 'tech-lead');
await api.recordApproval(deployTask.id, reviewTask.id, 'product-owner');
// deployTask is now unblocked
```

### Linking Related Items

```typescript
// Link related documents
await api.addDependency({
  sourceId: specDoc.id,
  targetId: designDoc.id,
  type: 'relates-to',
});

// Link task to documentation
await api.addDependency({
  sourceId: task.id,
  targetId: specDoc.id,
  type: 'references',
});
```

## Gotchas

1. **`blocked` is computed** - Never set `status: 'blocked'` directly
2. **Direction matters** - `blocks` is opposite to others
3. **Cycles not auto-checked** - Call `detectCycle()` manually
4. **`relates-to` is normalized** - Query both directions
5. **Parent-child doesn't block plans** - Tasks in plan don't wait for plan status
6. **Cascade delete** - Deleting element removes its dependencies

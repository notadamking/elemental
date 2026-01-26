# ElementalAPI

## Files
- **Main API**: `src/api/elemental-api.ts`
- **Types**: `src/api/types.ts`
- **Tests**: `src/api/*.integration.test.ts`
- **Spec (historical)**: `specs/api/query-api.md`

## Initialization

```typescript
import { ElementalAPI } from '@elemental/core';

const api = await ElementalAPI.create({
  rootDir: '.elemental',  // Optional, defaults to .elemental
});
```

## CRUD Operations

### Create
```typescript
const task = await api.create({
  type: 'task',
  createdBy: entityId,
  title: 'Implement feature',
  priority: 2,
  taskType: 'feature',
});
```

**Note:** `type` and `createdBy` are required. Use factory functions (`createTask`, `createEntity`, etc.) for validation.

### Read
```typescript
const task = await api.get(taskId);
const hydratedTask = await api.get(taskId, { hydrate: { description: true, content: true } });
```

**HydrationOptions:** `{ description?: boolean, design?: boolean, content?: boolean, attachments?: boolean }`

### Update
```typescript
const updated = await api.update(taskId, {
  status: 'in_progress',
  assigneeId: entityId,
});
```

### Delete
```typescript
await api.delete(taskId);
```

## Query Operations

### List with filters
```typescript
const tasks = await api.list({
  type: 'task',
  status: 'open',
  priority: { lte: 2 },
  tags: ['urgent'],        // AND logic (all tags required)
  tagsAny: ['a', 'b'],     // OR logic (any tag matches)
});
```

**Note:** Pass `type` inside the filter object, not as a separate parameter.

### List with pagination
```typescript
const result = await api.listPaginated({
  type: 'task',
  status: 'open',
  limit: 20,
  offset: 0,
});
// result.items, result.total, result.hasMore
```

### Search
```typescript
const results = await api.search('keyword', {
  types: ['task', 'document'],
});

// Search channels specifically
const channels = await api.searchChannels('channel-name');
```

**Note:** Search has a **100 result hard limit**. Searches title, content, and tags fields only.

## Task-Specific Operations

### Ready tasks (unblocked, open)
```typescript
const ready = await api.ready();
const readyIncludingEphemeral = await api.ready({ includeEphemeral: true });
```

### Blocked tasks
```typescript
const blocked = await api.blocked();
```

### Close/Assign/Defer tasks
Use `update()` - there are no dedicated `close()`, `assign()`, or `defer()` methods:
```typescript
await api.update(taskId, { status: 'closed' });
await api.update(taskId, { assignee: entityId });
await api.update(taskId, { scheduledFor: '2024-01-15' });
```

## Dependency Operations

### Add dependency
```typescript
await api.addDependency({
  sourceId: taskA,
  targetId: taskB,
  type: 'blocks',
});
```

### Remove dependency
```typescript
await api.removeDependency(taskA, taskB, 'blocks');
```

### Get dependencies
```typescript
// Outgoing dependencies (what this element depends on)
const deps = await api.getDependencies(elementId, types?);

// Incoming dependencies (what depends on this element)
const dependents = await api.getDependents(elementId, types?);
```

### Dependency tree
```typescript
const tree = await api.getDependencyTree(elementId);
```

## Plan Operations

```typescript
await api.addTaskToPlan(taskId, planId, options?);  // Note: taskId first
await api.removeTaskFromPlan(taskId, planId, actor?);  // Note: taskId first (same as addTaskToPlan)
await api.createTaskInPlan(planId, { title: 'Task', priority: 2 });
const tasks = await api.getTasksInPlan(planId);
const progress = await api.getPlanProgress(planId);

// Bulk operations
await api.bulkClosePlanTasks(planId, { closeReason: 'Done' });
await api.bulkDeferPlanTasks(planId, { filter: { status: 'open' } });
await api.bulkReassignPlanTasks(planId, newAssigneeId);
await api.bulkTagPlanTasks(planId, { addTags: ['tag1'], removeTags: ['tag2'] });
```

## Workflow Operations

```typescript
const tasks = await api.getTasksInWorkflow(workflowId);
const ready = await api.getReadyTasksInWorkflow(workflowId);
const ordered = await api.getOrderedTasksInWorkflow(workflowId); // Topological sort
const progress = await api.getWorkflowProgress(workflowId);
await api.burnWorkflow(workflowId);  // Hard delete workflow + tasks
await api.garbageCollectWorkflows({ maxAgeMs: 7 * 24 * 60 * 60 * 1000 });  // 7 days
```

## Channel Operations

```typescript
const { channel, created } = await api.findOrCreateDirectChannel(entityA, entityB, actor);
await api.addChannelMember(channelId, entityId, options?);
await api.removeChannelMember(channelId, entityId, options?);
await api.leaveChannel(channelId, actor);

// Send direct message (content must be a Document)
const contentDoc = await api.create('document', { content: 'message text' });
const result = await api.sendDirectMessage(sender, {
  recipient: entityB,       // Note: 'recipient' not 'recipientId'
  contentRef: contentDoc.id // Note: DocumentId, not raw text
});
```

## Team Operations

```typescript
await api.addTeamMember(teamId, entityId);
await api.removeTeamMember(teamId, entityId);
const tasks = await api.getTasksForTeam(teamId);
await api.claimTaskFromTeam(taskId, entityId, options?);
const metrics = await api.getTeamMetrics(teamId);
```

## Entity Operations

```typescript
const entity = await api.lookupEntityByName('agent-name');
await api.setEntityManager(entityId, managerId, actor);  // actor required
await api.clearEntityManager(entityId, actor);           // actor required
const reports = await api.getDirectReports(managerId);
const chain = await api.getManagementChain(entityId);
const chart = await api.getOrgChart();
```

## Gate Satisfaction (Awaits Dependencies)

```typescript
const satisfied = await api.satisfyGate(sourceId, targetId, actor);  // Returns boolean
await api.recordApproval(sourceId, targetId, approverId);
await api.removeApproval(sourceId, targetId, approverId);
```

## History/Timeline

```typescript
const events = await api.getEvents(elementId);
const allEvents = await api.listEvents({ type: 'created' });
const version = await api.getDocumentVersion(docId, versionNum);
const history = await api.getDocumentHistory(docId);
const snapshot = await api.reconstructAtTime(elementId, timestamp);
const timeline = await api.getElementTimeline(elementId);
```

## Sync Operations

```typescript
await api.export();                    // Export dirty elements
await api.export({ full: true });      // Full export
await api.import(jsonlPath);
```

**Note:** `syncStatus()` is not exposed on the public API. Use `el status` CLI command instead.

## System

```typescript
const stats = await api.stats();

// Rebuild blocked cache from scratch
const result = await api.rebuildBlockedCache();
// result: { elementsChecked: number, elementsBlocked: number, durationMs: number }
```

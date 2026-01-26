# Server Patterns

## Files
- **Entry**: `apps/server/src/index.ts`
- **WebSocket**: `apps/server/src/ws/`

## Adding an API Endpoint

All routes are defined in `apps/server/src/index.ts`. Add new routes following existing patterns:

```typescript
// GET endpoint
app.get('/api/elements/:id', async (c) => {
  const id = c.req.param('id');
  const element = await api.get(id);
  if (!element) {
    return c.json({ error: 'Not found' }, 404);
  }
  return c.json(element);
});

// POST endpoint
app.post('/api/elements', async (c) => {
  const body = await c.req.json();
  const element = await api.create(body.type, body);
  return c.json(element, 201);
});

// PATCH endpoint
app.patch('/api/elements/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const element = await api.update(id, body);
  return c.json(element);
});

// DELETE endpoint
app.delete('/api/elements/:id', async (c) => {
  const id = c.req.param('id');
  await api.delete(id);
  return c.json({ success: true });
});
```

## Query Parameters

```typescript
app.get('/api/tasks', async (c) => {
  const status = c.req.query('status');
  const limit = parseInt(c.req.query('limit') || '50');
  const offset = parseInt(c.req.query('offset') || '0');

  const tasks = await api.list('task', {
    status,
    limit,
    offset,
  });
  return c.json(tasks);
});
```

## Sub-Resource Endpoints

For nested resources (e.g., plan tasks, entity inbox):

```typescript
// GET /api/plans/:id/tasks
app.get('/api/plans/:id/tasks', async (c) => {
  const planId = c.req.param('id');
  const tasks = await api.getTasksInPlan(planId);
  return c.json(tasks);
});

// POST /api/plans/:id/tasks (add task to plan)
app.post('/api/plans/:id/tasks', async (c) => {
  const planId = c.req.param('id');
  const { taskId } = await c.req.json();
  await api.addTaskToPlan(taskId, planId);
  return c.json({ success: true }, 201);
});
```

## Bulk Operations

```typescript
// PATCH /api/tasks/bulk
app.patch('/api/tasks/bulk', async (c) => {
  const { ids, updates } = await c.req.json();
  const results = await Promise.all(
    ids.map(id => api.update(id, updates))
  );
  return c.json({ updated: results.length });
});
```

## Error Handling

```typescript
import { ElementalError } from '@elemental/core';

app.onError((err, c) => {
  if (err instanceof ElementalError) {
    return c.json({
      error: err.message,
      code: err.code
    }, 400);
  }
  console.error(err);
  return c.json({ error: 'Internal error' }, 500);
});
```

## Broadcasting Events

After mutations, broadcast to WebSocket clients:

```typescript
import { broadcaster } from './ws/broadcaster';

app.post('/api/tasks', async (c) => {
  const body = await c.req.json();
  const task = await api.create('task', body);

  // Broadcast to connected clients
  broadcaster.broadcast({
    type: 'element:created',
    payload: task,
  });

  return c.json(task, 201);
});
```

## CORS

CORS is configured in the server entry. Adjust origins as needed:

```typescript
import { cors } from 'hono/cors';

app.use('*', cors({
  origin: ['http://localhost:5173'],  // Vite dev server
  credentials: true,
}));
```

## Running the Server

```bash
cd apps/server
bun run dev    # Development with hot reload
bun run start  # Production
```

Default port: `3456`

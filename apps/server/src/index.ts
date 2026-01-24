/**
 * Elemental Platform Server
 *
 * HTTP + WebSocket server for the Elemental web platform.
 * Built with Hono for fast, minimal overhead.
 */

import { resolve, dirname } from 'node:path';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { createStorage, createElementalAPI, initializeSchema } from '@elemental/cli';
import type { ElementalAPI, ElementId } from '@elemental/cli';
import type { ServerWebSocket } from 'bun';
import { initializeBroadcaster } from './ws/broadcaster.js';
import { handleOpen, handleMessage, handleClose, handleError, getClientCount, type ClientData } from './ws/handler.js';

// ============================================================================
// Server Configuration
// ============================================================================

const PORT = parseInt(process.env.PORT || '3456', 10);
const HOST = process.env.HOST || 'localhost';

// Database path - defaults to .elemental/elemental.db in project root
// Resolve relative paths from the project root (two levels up from apps/server/src)
const PROJECT_ROOT = resolve(dirname(import.meta.path), '../../..');
const DEFAULT_DB_PATH = resolve(PROJECT_ROOT, '.elemental/elemental.db');
const DB_PATH = process.env.ELEMENTAL_DB_PATH || DEFAULT_DB_PATH;

// ============================================================================
// Initialize API
// ============================================================================

let api: ElementalAPI;

try {
  const backend = createStorage({ path: DB_PATH });
  initializeSchema(backend);
  api = createElementalAPI(backend);
  console.log(`[elemental] Connected to database: ${DB_PATH}`);
} catch (error) {
  console.error('[elemental] Failed to initialize database:', error);
  process.exit(1);
}

// ============================================================================
// Initialize Event Broadcaster
// ============================================================================

const broadcaster = initializeBroadcaster(api);
broadcaster.start().catch((err) => {
  console.error('[elemental] Failed to start event broadcaster:', err);
});

// ============================================================================
// Create Hono App
// ============================================================================

const app = new Hono();

// CORS middleware - allow web app to connect
app.use(
  '*',
  cors({
    origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  })
);

// ============================================================================
// Health Check Endpoint
// ============================================================================

app.get('/api/health', (c) => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    database: DB_PATH,
    websocket: {
      clients: getClientCount(),
      broadcasting: broadcaster.listenerCount > 0,
    },
  });
});

// ============================================================================
// Stats Endpoint
// ============================================================================

app.get('/api/stats', async (c) => {
  try {
    const stats = await api.stats();
    return c.json(stats);
  } catch (error) {
    console.error('[elemental] Failed to get stats:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get stats' } }, 500);
  }
});

// ============================================================================
// Tasks Endpoints
// ============================================================================

app.get('/api/tasks/ready', async (c) => {
  try {
    const tasks = await api.ready();
    return c.json(tasks);
  } catch (error) {
    console.error('[elemental] Failed to get ready tasks:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get ready tasks' } }, 500);
  }
});

app.get('/api/tasks/blocked', async (c) => {
  try {
    const tasks = await api.blocked();
    return c.json(tasks);
  } catch (error) {
    console.error('[elemental] Failed to get blocked tasks:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get blocked tasks' } }, 500);
  }
});

app.get('/api/tasks/completed', async (c) => {
  try {
    // Get tasks with completed or cancelled status, sorted by updated_at desc
    // The API accepts TaskFilter when type is 'task', but TypeScript signature is ElementFilter
    const tasks = await api.list({
      type: 'task',
      status: ['completed', 'cancelled'],
      orderBy: 'updated_at',
      orderDir: 'desc',
      limit: 20,
    } as Parameters<typeof api.list>[0]);
    return c.json(tasks);
  } catch (error) {
    console.error('[elemental] Failed to get completed tasks:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get completed tasks' } }, 500);
  }
});

app.get('/api/tasks/:id', async (c) => {
  try {
    const id = c.req.param('id') as ElementId;
    const url = new URL(c.req.url);

    // Parse hydration options from query params
    const hydrateDescription = url.searchParams.get('hydrate.description') === 'true';
    const hydrateDesign = url.searchParams.get('hydrate.design') === 'true';

    const hydrate = (hydrateDescription || hydrateDesign)
      ? { description: hydrateDescription, design: hydrateDesign }
      : undefined;

    const task = await api.get(id, hydrate ? { hydrate } : undefined);

    if (!task) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Task not found' } }, 404);
    }

    // Verify it's actually a task
    if (task.type !== 'task') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Task not found' } }, 404);
    }

    // Fetch dependencies and dependents for the task detail view
    const [dependencies, dependents] = await Promise.all([
      api.getDependencies(id),
      api.getDependents(id),
    ]);

    return c.json({
      ...task,
      _dependencies: dependencies,
      _dependents: dependents,
    });
  } catch (error) {
    console.error('[elemental] Failed to get task:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get task' } }, 500);
  }
});

app.patch('/api/tasks/:id', async (c) => {
  try {
    const id = c.req.param('id') as ElementId;
    const body = await c.req.json();

    // First verify it's a task
    const existing = await api.get(id);
    if (!existing) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Task not found' } }, 404);
    }
    if (existing.type !== 'task') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Task not found' } }, 404);
    }

    // Extract allowed updates (prevent changing immutable fields)
    const updates: Record<string, unknown> = {};
    const allowedFields = [
      'title', 'status', 'priority', 'complexity', 'taskType',
      'assignee', 'owner', 'deadline', 'scheduledFor', 'tags', 'metadata'
    ];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates[field] = body[field];
      }
    }

    // Update the task
    const updated = await api.update(id, updates);

    return c.json(updated);
  } catch (error) {
    if ((error as { code?: string }).code === 'NOT_FOUND') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Task not found' } }, 404);
    }
    if ((error as { code?: string }).code === 'CONCURRENT_MODIFICATION') {
      return c.json({ error: { code: 'CONFLICT', message: 'Task was modified by another process' } }, 409);
    }
    if ((error as { code?: string }).code === 'VALIDATION_ERROR') {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: (error as Error).message } }, 400);
    }
    console.error('[elemental] Failed to update task:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to update task' } }, 500);
  }
});

// ============================================================================
// Entities Endpoints
// ============================================================================

app.get('/api/entities', async (c) => {
  try {
    const entities = await api.list({
      type: 'entity',
    });
    return c.json(entities);
  } catch (error) {
    console.error('[elemental] Failed to get entities:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get entities' } }, 500);
  }
});

app.get('/api/entities/:id', async (c) => {
  try {
    const id = c.req.param('id') as ElementId;
    const entity = await api.get(id);
    if (!entity) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Entity not found' } }, 404);
    }
    return c.json(entity);
  } catch (error) {
    console.error('[elemental] Failed to get entity:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get entity' } }, 500);
  }
});

app.get('/api/entities/:id/tasks', async (c) => {
  try {
    const id = c.req.param('id') as ElementId;
    // Get tasks assigned to this entity
    const tasks = await api.list({
      type: 'task',
      assignee: id,
    } as Parameters<typeof api.list>[0]);
    return c.json(tasks);
  } catch (error) {
    console.error('[elemental] Failed to get entity tasks:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get entity tasks' } }, 500);
  }
});

// ============================================================================
// Dependencies Endpoints
// ============================================================================

app.get('/api/dependencies/:id/tree', async (c) => {
  try {
    const id = c.req.param('id') as ElementId;
    const tree = await api.getDependencyTree(id);
    return c.json(tree);
  } catch (error) {
    if ((error as { code?: string }).code === 'NOT_FOUND') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Element not found' } }, 404);
    }
    console.error('[elemental] Failed to get dependency tree:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get dependency tree' } }, 500);
  }
});

app.get('/api/dependencies/:id', async (c) => {
  try {
    const id = c.req.param('id') as ElementId;
    const dependencies = await api.getDependencies(id);
    const dependents = await api.getDependents(id);
    return c.json({ dependencies, dependents });
  } catch (error) {
    console.error('[elemental] Failed to get dependencies:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get dependencies' } }, 500);
  }
});

// ============================================================================
// Events Endpoints
// ============================================================================

app.get('/api/events', async (c) => {
  try {
    // Parse query parameters for filtering
    const url = new URL(c.req.url);
    const eventType = url.searchParams.get('eventType');
    const actor = url.searchParams.get('actor');
    const elementId = url.searchParams.get('elementId');
    const after = url.searchParams.get('after');
    const before = url.searchParams.get('before');
    const limitParam = url.searchParams.get('limit');
    const offsetParam = url.searchParams.get('offset');

    // Build filter object - cast to EventFilter type
    const filter: Record<string, unknown> = {};

    if (eventType) {
      // Support comma-separated event types
      filter.eventType = eventType.includes(',') ? eventType.split(',') : eventType;
    }
    if (actor) {
      filter.actor = actor;
    }
    if (elementId) {
      filter.elementId = elementId;
    }
    if (after) {
      filter.after = after;
    }
    if (before) {
      filter.before = before;
    }
    if (limitParam) {
      filter.limit = parseInt(limitParam, 10);
    }
    if (offsetParam) {
      filter.offset = parseInt(offsetParam, 10);
    }

    // Default limit if not specified
    if (!filter.limit) {
      filter.limit = 100;
    }

    const events = await api.listEvents(filter as Parameters<typeof api.listEvents>[0]);
    return c.json(events);
  } catch (error) {
    console.error('[elemental] Failed to get events:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get events' } }, 500);
  }
});

// ============================================================================
// Start Server with WebSocket Support
// ============================================================================

console.log(`[elemental] Starting server on http://${HOST}:${PORT}`);

export default {
  port: PORT,
  hostname: HOST,
  fetch(request: Request, server: { upgrade: (request: Request, options?: { data?: ClientData }) => boolean }) {
    // Handle WebSocket upgrade at the Bun level
    const url = new URL(request.url);
    if (url.pathname === '/ws') {
      const upgradeHeader = request.headers.get('Upgrade');
      if (upgradeHeader?.toLowerCase() === 'websocket') {
        const success = server.upgrade(request, {
          data: {} as ClientData,
        });
        if (success) {
          // Bun handles the upgrade, return undefined
          return undefined;
        }
        return new Response('WebSocket upgrade failed', { status: 500 });
      }
      return new Response('Expected WebSocket Upgrade request', { status: 426 });
    }

    // Handle regular HTTP requests with Hono
    return app.fetch(request);
  },
  websocket: {
    open(ws: ServerWebSocket<ClientData>) {
      handleOpen(ws);
    },
    message(ws: ServerWebSocket<ClientData>, message: string | Buffer) {
      handleMessage(ws, message);
    },
    close(ws: ServerWebSocket<ClientData>) {
      handleClose(ws);
    },
    error(ws: ServerWebSocket<ClientData>, error: Error) {
      handleError(ws, error);
    },
  },
};

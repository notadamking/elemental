/**
 * Elemental Platform Server
 *
 * HTTP + WebSocket server for the Elemental web platform.
 * Built with Hono for fast, minimal overhead.
 */

import { resolve, dirname } from 'node:path';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { createStorage, createElementalAPI, initializeSchema, createTask, createDocument, createMessage, createPlan, pourWorkflow, createWorkflow, discoverPlaybookFiles, loadPlaybookFromFile, createPlaybook, createLibrary, createGroupChannel, createDirectChannel, createEntity } from '@elemental/cli';
import type { ElementalAPI, ElementId, CreateTaskInput, Element, EntityId, CreateDocumentInput, CreateMessageInput, Document, Message, CreatePlanInput, PlanStatus, WorkflowStatus, CreateWorkflowInput, PourWorkflowInput, Playbook, DiscoveredPlaybook, CreatePlaybookInput, CreateLibraryInput, Library, CreateGroupChannelInput, CreateDirectChannelInput, Visibility, JoinPolicy } from '@elemental/cli';
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

app.get('/api/tasks', async (c) => {
  try {
    const url = new URL(c.req.url);

    // Parse query parameters
    const statusParam = url.searchParams.get('status');
    const priorityParam = url.searchParams.get('priority');
    const assigneeParam = url.searchParams.get('assignee');
    const tagsParam = url.searchParams.get('tags');
    const limitParam = url.searchParams.get('limit');
    const offsetParam = url.searchParams.get('offset');
    const orderByParam = url.searchParams.get('orderBy');
    const orderDirParam = url.searchParams.get('orderDir');

    // Build filter
    const filter: Record<string, unknown> = {
      type: 'task',
    };

    if (statusParam) {
      // Support comma-separated statuses
      filter.status = statusParam.includes(',') ? statusParam.split(',') : statusParam;
    }
    if (priorityParam) {
      const priorities = priorityParam.split(',').map(p => parseInt(p, 10)).filter(p => !isNaN(p));
      filter.priority = priorities.length === 1 ? priorities[0] : priorities;
    }
    if (assigneeParam) {
      filter.assignee = assigneeParam;
    }
    if (tagsParam) {
      filter.tags = tagsParam.split(',');
    }
    if (limitParam) {
      filter.limit = parseInt(limitParam, 10);
    } else {
      filter.limit = 50; // Default page size
    }
    if (offsetParam) {
      filter.offset = parseInt(offsetParam, 10);
    }
    if (orderByParam) {
      filter.orderBy = orderByParam;
    } else {
      filter.orderBy = 'updated_at';
    }
    if (orderDirParam) {
      filter.orderDir = orderDirParam;
    } else {
      filter.orderDir = 'desc';
    }

    const result = await api.listPaginated(filter as Parameters<typeof api.listPaginated>[0]);
    return c.json(result);
  } catch (error) {
    console.error('[elemental] Failed to get tasks:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get tasks' } }, 500);
  }
});

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

app.get('/api/tasks/in-progress', async (c) => {
  try {
    // Get tasks with in_progress status, sorted by updated_at desc
    const tasks = await api.list({
      type: 'task',
      status: 'in_progress',
      orderBy: 'updated_at',
      orderDir: 'desc',
      limit: 50,
    } as Parameters<typeof api.list>[0]);
    return c.json(tasks);
  } catch (error) {
    console.error('[elemental] Failed to get in-progress tasks:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get in-progress tasks' } }, 500);
  }
});

app.get('/api/tasks/completed', async (c) => {
  try {
    const url = new URL(c.req.url);
    const limitParam = url.searchParams.get('limit');
    const offsetParam = url.searchParams.get('offset');
    const afterParam = url.searchParams.get('after'); // ISO date string for date filtering

    // Get tasks with closed status, sorted by updated_at desc
    // The API accepts TaskFilter when type is 'task', but TypeScript signature is ElementFilter
    // Note: The actual status value is 'closed' (not 'completed') per src/types/task.ts
    const filter: Record<string, unknown> = {
      type: 'task',
      status: ['closed'],
      orderBy: 'updated_at',
      orderDir: 'desc',
      limit: limitParam ? parseInt(limitParam, 10) : 20,
    };

    if (offsetParam) {
      filter.offset = parseInt(offsetParam, 10);
    }

    // Note: 'after' date filtering needs to be done post-query since the API
    // may not support date filtering directly on updated_at
    let tasks = await api.list(filter as Parameters<typeof api.list>[0]);

    // Save the fetched count before filtering to determine if there are more pages
    const fetchedCount = tasks.length;

    // Apply date filter if provided
    if (afterParam) {
      const afterDate = new Date(afterParam);
      tasks = tasks.filter((task) => new Date(task.updatedAt) >= afterDate);
    }

    // Return with total count for pagination info
    // hasMore is based on whether we got a full page from the DB (before date filtering)
    return c.json({
      items: tasks,
      hasMore: fetchedCount === (filter.limit as number),
    });
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

app.post('/api/tasks', async (c) => {
  try {
    const body = await c.req.json();

    // Validate required fields
    if (!body.title || typeof body.title !== 'string') {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'title is required' } }, 400);
    }
    if (!body.createdBy || typeof body.createdBy !== 'string') {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'createdBy is required' } }, 400);
    }

    // Build CreateTaskInput from request body
    const taskInput: CreateTaskInput = {
      title: body.title,
      createdBy: body.createdBy,
      ...(body.status !== undefined && { status: body.status }),
      ...(body.priority !== undefined && { priority: body.priority }),
      ...(body.complexity !== undefined && { complexity: body.complexity }),
      ...(body.taskType !== undefined && { taskType: body.taskType }),
      ...(body.assignee !== undefined && { assignee: body.assignee }),
      ...(body.owner !== undefined && { owner: body.owner }),
      ...(body.deadline !== undefined && { deadline: body.deadline }),
      ...(body.scheduledFor !== undefined && { scheduledFor: body.scheduledFor }),
      ...(body.tags !== undefined && { tags: body.tags }),
      ...(body.descriptionRef !== undefined && { descriptionRef: body.descriptionRef }),
      ...(body.designRef !== undefined && { designRef: body.designRef }),
      ...(body.acceptanceCriteria !== undefined && { acceptanceCriteria: body.acceptanceCriteria }),
      ...(body.notes !== undefined && { notes: body.notes }),
    };
    const task = await createTask(taskInput);
    const created = await api.create(task as unknown as Element & Record<string, unknown>);

    return c.json(created);
  } catch (error) {
    if ((error as { code?: string }).code === 'VALIDATION_ERROR') {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: (error as Error).message } }, 400);
    }
    console.error('[elemental] Failed to create task:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to create task' } }, 500);
  }
});

// Bulk update tasks - MUST be before /:id route to avoid matching "bulk" as an id
app.patch('/api/tasks/bulk', async (c) => {
  try {
    const body = await c.req.json();

    // Validate request structure
    if (!body.ids || !Array.isArray(body.ids) || body.ids.length === 0) {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'ids must be a non-empty array' } }, 400);
    }
    if (!body.updates || typeof body.updates !== 'object') {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'updates must be an object' } }, 400);
    }

    const ids = body.ids as string[];

    // Extract allowed updates
    const updates: Record<string, unknown> = {};
    const allowedFields = [
      'status', 'priority', 'complexity', 'taskType',
      'assignee', 'owner', 'deadline', 'scheduledFor', 'tags'
    ];

    for (const field of allowedFields) {
      if (body.updates[field] !== undefined) {
        updates[field] = body.updates[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'No valid fields to update' } }, 400);
    }

    // Update each task
    const results: { id: string; success: boolean; error?: string }[] = [];

    for (const id of ids) {
      try {
        const existing = await api.get(id as ElementId);
        if (!existing || existing.type !== 'task') {
          results.push({ id, success: false, error: 'Task not found' });
          continue;
        }

        await api.update(id as ElementId, updates);
        results.push({ id, success: true });
      } catch (error) {
        results.push({ id, success: false, error: (error as Error).message });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;

    return c.json({
      updated: successCount,
      failed: failureCount,
      results,
    });
  } catch (error) {
    console.error('[elemental] Failed to bulk update tasks:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to bulk update tasks' } }, 500);
  }
});

// Bulk delete tasks - Uses POST with action parameter for better proxy compatibility
app.post('/api/tasks/bulk-delete', async (c) => {
  console.log('[elemental] Bulk delete request received');
  try {
    const body = await c.req.json();
    console.log('[elemental] Bulk delete body:', JSON.stringify(body));

    // Validate request structure
    if (!body.ids || !Array.isArray(body.ids) || body.ids.length === 0) {
      console.log('[elemental] Bulk delete validation failed: ids must be a non-empty array');
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'ids must be a non-empty array' } }, 400);
    }

    const ids = body.ids as string[];
    console.log('[elemental] Deleting tasks:', ids);

    // Delete each task
    const results: { id: string; success: boolean; error?: string }[] = [];

    for (const id of ids) {
      try {
        const existing = await api.get(id as ElementId);
        if (!existing || existing.type !== 'task') {
          console.log(`[elemental] Task not found: ${id}`);
          results.push({ id, success: false, error: 'Task not found' });
          continue;
        }

        console.log(`[elemental] Deleting task: ${id}`);
        await api.delete(id as ElementId);
        console.log(`[elemental] Successfully deleted task: ${id}`);
        results.push({ id, success: true });
      } catch (error) {
        console.error(`[elemental] Error deleting task ${id}:`, error);
        results.push({ id, success: false, error: (error as Error).message });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;

    console.log(`[elemental] Bulk delete complete: ${successCount} deleted, ${failureCount} failed`);
    return c.json({
      deleted: successCount,
      failed: failureCount,
      results,
    });
  } catch (error) {
    console.error('[elemental] Failed to bulk delete tasks:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to bulk delete tasks' } }, 500);
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

app.delete('/api/tasks/:id', async (c) => {
  try {
    const id = c.req.param('id') as ElementId;

    // First verify it's a task
    const existing = await api.get(id);
    if (!existing) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Task not found' } }, 404);
    }
    if (existing.type !== 'task') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Task not found' } }, 404);
    }

    // Soft-delete the task
    await api.delete(id);

    return c.json({ success: true, id });
  } catch (error) {
    if ((error as { code?: string }).code === 'NOT_FOUND') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Task not found' } }, 404);
    }
    console.error('[elemental] Failed to delete task:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to delete task' } }, 500);
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

app.post('/api/entities', async (c) => {
  try {
    const body = await c.req.json();
    const { name, entityType, publicKey, tags, metadata, createdBy } = body;

    // Validation
    if (!name || typeof name !== 'string') {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Name is required' } }, 400);
    }
    if (!entityType || !['agent', 'human', 'system'].includes(entityType)) {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Valid entity type (agent, human, system) is required' } }, 400);
    }

    // Check for duplicate name
    const existingEntities = await api.list({ type: 'entity' });
    const duplicateName = existingEntities.some((e) => {
      const entity = e as unknown as { name: string };
      return entity.name.toLowerCase() === name.toLowerCase();
    });
    if (duplicateName) {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Entity with this name already exists' } }, 400);
    }

    const entityInput = {
      name,
      entityType,
      publicKey,
      tags: tags || [],
      metadata: metadata || {},
      createdBy: (createdBy || 'el-0000') as EntityId,
    };

    const entity = await createEntity(entityInput);
    const created = await api.create(entity as unknown as Element & Record<string, unknown>);

    return c.json(created, 201);
  } catch (error) {
    console.error('[elemental] Failed to create entity:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to create entity';
    return c.json({ error: { code: 'INTERNAL_ERROR', message: errorMessage } }, 500);
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

app.patch('/api/entities/:id', async (c) => {
  try {
    const id = c.req.param('id') as ElementId;
    const body = await c.req.json();
    const { name, tags, metadata, active } = body;

    // Verify entity exists
    const existing = await api.get(id);
    if (!existing || existing.type !== 'entity') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Entity not found' } }, 404);
    }

    // Build updates object
    const updates: Record<string, unknown> = {};

    if (name !== undefined) {
      // Validate name format
      if (typeof name !== 'string' || name.trim().length === 0) {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Name must be a non-empty string' } }, 400);
      }
      // Check for duplicate name (if changing)
      const existingEntity = existing as unknown as { name: string };
      if (name !== existingEntity.name) {
        const existingEntities = await api.list({ type: 'entity' });
        const duplicateName = existingEntities.some((e) => {
          const entity = e as unknown as { name: string; id: string };
          return entity.name.toLowerCase() === name.toLowerCase() && entity.id !== id;
        });
        if (duplicateName) {
          return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Entity with this name already exists' } }, 400);
        }
      }
      updates.name = name.trim();
    }

    if (tags !== undefined) {
      if (!Array.isArray(tags)) {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Tags must be an array' } }, 400);
      }
      updates.tags = tags;
    }

    if (metadata !== undefined) {
      if (typeof metadata !== 'object' || metadata === null) {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Metadata must be an object' } }, 400);
      }
      updates.metadata = metadata;
    }

    if (active !== undefined) {
      if (typeof active !== 'boolean') {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Active must be a boolean' } }, 400);
      }
      updates.active = active;
    }

    if (Object.keys(updates).length === 0) {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'No valid fields to update' } }, 400);
    }

    const updated = await api.update(id, updates);
    return c.json(updated);
  } catch (error) {
    console.error('[elemental] Failed to update entity:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to update entity';
    return c.json({ error: { code: 'INTERNAL_ERROR', message: errorMessage } }, 500);
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

app.get('/api/entities/:id/stats', async (c) => {
  try {
    const id = c.req.param('id') as ElementId;

    // Verify entity exists
    const entity = await api.get(id);
    if (!entity || entity.type !== 'entity') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Entity not found' } }, 404);
    }

    // Get tasks assigned to this entity
    const assignedTasks = await api.list({
      type: 'task',
      assignee: id,
    } as Parameters<typeof api.list>[0]);

    // Get tasks created by this entity (filter post-query since createdBy needs EntityId)
    const allTasks = await api.list({
      type: 'task',
    } as Parameters<typeof api.list>[0]);
    const createdTasks = allTasks.filter((t) => String(t.createdBy) === String(id));

    // Get messages sent by this entity
    const messages = await api.list({
      type: 'message',
    } as Parameters<typeof api.list>[0]);
    const sentMessages = messages.filter((m) => {
      const msg = m as unknown as { sender?: string };
      return msg.sender === id;
    });

    // Get documents created by this entity (filter post-query)
    const allDocuments = await api.list({
      type: 'document',
    } as Parameters<typeof api.list>[0]);
    const documents = allDocuments.filter((d) => String(d.createdBy) === String(id));

    // Calculate task stats
    const activeTasks = assignedTasks.filter(
      (t) => {
        const task = t as unknown as { status: string };
        return task.status !== 'closed' && task.status !== 'cancelled';
      }
    );
    const completedTasks = assignedTasks.filter(
      (t) => {
        const task = t as unknown as { status: string };
        return task.status === 'closed';
      }
    );

    return c.json({
      assignedTaskCount: assignedTasks.length,
      activeTaskCount: activeTasks.length,
      completedTaskCount: completedTasks.length,
      createdTaskCount: createdTasks.length,
      messageCount: sentMessages.length,
      documentCount: documents.length,
    });
  } catch (error) {
    console.error('[elemental] Failed to get entity stats:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get entity stats' } }, 500);
  }
});

app.get('/api/entities/:id/events', async (c) => {
  try {
    const id = c.req.param('id') as ElementId;
    const url = new URL(c.req.url);
    const limitParam = url.searchParams.get('limit');

    // Verify entity exists
    const entity = await api.get(id);
    if (!entity || entity.type !== 'entity') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Entity not found' } }, 404);
    }

    // Get events by this actor
    const events = await api.listEvents({
      actor: id as unknown as EntityId,
      limit: limitParam ? parseInt(limitParam, 10) : 20,
    });

    return c.json(events);
  } catch (error) {
    console.error('[elemental] Failed to get entity events:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get entity events' } }, 500);
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
// Channels Endpoints
// ============================================================================

app.get('/api/channels', async (c) => {
  try {
    const channels = await api.list({
      type: 'channel',
    });
    return c.json(channels);
  } catch (error) {
    console.error('[elemental] Failed to get channels:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get channels' } }, 500);
  }
});

app.get('/api/channels/:id', async (c) => {
  try {
    const id = c.req.param('id') as ElementId;
    const channel = await api.get(id);
    if (!channel) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Channel not found' } }, 404);
    }
    if (channel.type !== 'channel') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Channel not found' } }, 404);
    }
    return c.json(channel);
  } catch (error) {
    console.error('[elemental] Failed to get channel:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get channel' } }, 500);
  }
});

app.post('/api/channels', async (c) => {
  try {
    const body = await c.req.json() as {
      channelType: 'group' | 'direct';
      name?: string;
      createdBy: string;
      members?: string[];
      visibility?: Visibility;
      joinPolicy?: JoinPolicy;
      entityA?: string;
      entityB?: string;
      tags?: string[];
      metadata?: Record<string, unknown>;
    };

    // Validate channelType
    if (!body.channelType || !['group', 'direct'].includes(body.channelType)) {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'channelType is required and must be "group" or "direct"' } }, 400);
    }

    // Validate createdBy
    if (!body.createdBy || typeof body.createdBy !== 'string') {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'createdBy is required and must be a string' } }, 400);
    }

    let channel;

    if (body.channelType === 'group') {
      // Validate name for group channels
      if (!body.name || typeof body.name !== 'string') {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: 'name is required for group channels' } }, 400);
      }

      const groupInput: CreateGroupChannelInput = {
        name: body.name,
        createdBy: body.createdBy as EntityId,
        members: body.members as EntityId[] | undefined,
        visibility: body.visibility,
        joinPolicy: body.joinPolicy,
        tags: body.tags,
        metadata: body.metadata,
      };

      channel = await createGroupChannel(groupInput);
    } else {
      // Direct channel
      if (!body.entityA || typeof body.entityA !== 'string') {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: 'entityA is required for direct channels' } }, 400);
      }
      if (!body.entityB || typeof body.entityB !== 'string') {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: 'entityB is required for direct channels' } }, 400);
      }

      const directInput: CreateDirectChannelInput = {
        entityA: body.entityA as EntityId,
        entityB: body.entityB as EntityId,
        createdBy: body.createdBy as EntityId,
        tags: body.tags,
        metadata: body.metadata,
      };

      channel = await createDirectChannel(directInput);
    }

    // Create the channel in database
    const created = await api.create(channel as unknown as Element & Record<string, unknown>);

    return c.json(created, 201);
  } catch (error) {
    if ((error as { code?: string }).code === 'VALIDATION_ERROR') {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: (error as Error).message } }, 400);
    }
    console.error('[elemental] Failed to create channel:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to create channel' } }, 500);
  }
});

app.get('/api/channels/:id/messages', async (c) => {
  try {
    const id = c.req.param('id') as ElementId;
    const url = new URL(c.req.url);

    // Parse query params
    const limitParam = url.searchParams.get('limit');
    const offsetParam = url.searchParams.get('offset');
    const hydrateContent = url.searchParams.get('hydrate.content') === 'true';

    // First verify channel exists
    const channel = await api.get(id);
    if (!channel) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Channel not found' } }, 404);
    }
    if (channel.type !== 'channel') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Channel not found' } }, 404);
    }

    // Get messages for this channel
    const filter: Record<string, unknown> = {
      type: 'message',
      channelId: id,
      orderBy: 'created_at',
      orderDir: 'asc',
    };

    if (limitParam) {
      filter.limit = parseInt(limitParam, 10);
    }
    if (offsetParam) {
      filter.offset = parseInt(offsetParam, 10);
    }

    const messages = await api.list(filter as Parameters<typeof api.list>[0]);

    // Optionally hydrate content
    if (hydrateContent) {
      const hydratedMessages = await Promise.all(
        messages.map(async (msg) => {
          const message = msg as { contentRef?: string };
          if (message.contentRef) {
            const content = await api.get(message.contentRef as ElementId);
            if (content && content.type === 'document') {
              return { ...msg, _content: (content as { content?: string }).content };
            }
          }
          return msg;
        })
      );
      return c.json(hydratedMessages);
    }

    return c.json(messages);
  } catch (error) {
    console.error('[elemental] Failed to get channel messages:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get channel messages' } }, 500);
  }
});

// ============================================================================
// Messages Endpoints
// ============================================================================

app.post('/api/messages', async (c) => {
  try {
    const body = await c.req.json();

    // Validate required fields
    if (!body.channelId || typeof body.channelId !== 'string') {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'channelId is required' } }, 400);
    }
    if (!body.sender || typeof body.sender !== 'string') {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'sender is required' } }, 400);
    }
    if (!body.content || typeof body.content !== 'string') {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'content is required' } }, 400);
    }

    // Verify channel exists
    const channel = await api.get(body.channelId as ElementId);
    if (!channel || channel.type !== 'channel') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Channel not found' } }, 404);
    }

    // Create a document for the message content
    const contentDoc = await createDocument({
      contentType: 'text',
      content: body.content,
      createdBy: body.sender as EntityId,
    });
    const createdDoc = await api.create(contentDoc as unknown as Element & Record<string, unknown>);

    // Create the message with the content document reference
    const messageInput = {
      channelId: body.channelId,
      sender: body.sender,
      contentRef: createdDoc.id,
      ...(body.threadId && { threadId: body.threadId }),
      ...(body.tags && { tags: body.tags }),
    };
    const message = await createMessage(messageInput as unknown as CreateMessageInput);
    const createdMessage = await api.create(message as unknown as Element & Record<string, unknown>);

    // Return the message with content hydrated
    return c.json({
      ...createdMessage,
      _content: body.content,
    });
  } catch (error) {
    if ((error as { code?: string }).code === 'VALIDATION_ERROR') {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: (error as Error).message } }, 400);
    }
    if ((error as { code?: string }).code === 'NOT_FOUND') {
      return c.json({ error: { code: 'NOT_FOUND', message: (error as Error).message } }, 404);
    }
    if ((error as { code?: string }).code === 'MEMBER_REQUIRED') {
      return c.json({ error: { code: 'FORBIDDEN', message: 'Sender must be a channel member' } }, 403);
    }
    console.error('[elemental] Failed to create message:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to create message' } }, 500);
  }
});

app.get('/api/messages/:id/replies', async (c) => {
  try {
    const id = c.req.param('id') as ElementId;
    const url = new URL(c.req.url);
    const hydrateContent = url.searchParams.get('hydrate.content') === 'true';

    // Verify the parent message exists
    const parentMessage = await api.get(id);
    if (!parentMessage || parentMessage.type !== 'message') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Message not found' } }, 404);
    }

    // Get all messages that have this message as their threadId
    const filter: Record<string, unknown> = {
      type: 'message',
      orderBy: 'created_at',
      orderDir: 'asc',
    };

    const allMessages = await api.list(filter as Parameters<typeof api.list>[0]);

    // Filter for messages with this threadId
    const replies = allMessages.filter((msg) => {
      const message = msg as { threadId?: string };
      return message.threadId === id;
    });

    // Optionally hydrate content
    if (hydrateContent) {
      const hydratedReplies = await Promise.all(
        replies.map(async (msg) => {
          const message = msg as { contentRef?: string };
          if (message.contentRef) {
            const content = await api.get(message.contentRef as ElementId);
            if (content && content.type === 'document') {
              return { ...msg, _content: (content as { content?: string }).content };
            }
          }
          return msg;
        })
      );
      return c.json(hydratedReplies);
    }

    return c.json(replies);
  } catch (error) {
    console.error('[elemental] Failed to get thread replies:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get thread replies' } }, 500);
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
// Libraries Endpoints
// ============================================================================

app.get('/api/libraries', async (c) => {
  try {
    const url = new URL(c.req.url);
    const hydrateDescription = url.searchParams.get('hydrate.description') === 'true';

    const libraries = await api.list({
      type: 'library',
      ...(hydrateDescription && { hydrate: { description: true } }),
    } as Parameters<typeof api.list>[0]);

    // Get parent relationships for all libraries
    // Parent-child dependencies have: sourceId = child, targetId = parent
    const librariesWithParent = await Promise.all(
      libraries.map(async (library) => {
        // Find if this library has a parent (it would be the source in a parent-child dependency)
        const dependencies = await api.getDependencies(library.id, ['parent-child']);
        const parentDep = dependencies.find(d => d.type === 'parent-child');
        return {
          ...library,
          parentId: parentDep?.targetId || null,
        };
      })
    );

    return c.json(librariesWithParent);
  } catch (error) {
    console.error('[elemental] Failed to get libraries:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get libraries' } }, 500);
  }
});

app.get('/api/libraries/:id', async (c) => {
  try {
    const id = c.req.param('id') as ElementId;
    const url = new URL(c.req.url);
    const hydrateDescription = url.searchParams.get('hydrate.description') === 'true';

    const library = await api.get(id, hydrateDescription ? { hydrate: { description: true } } : undefined);

    if (!library) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Library not found' } }, 404);
    }

    if (library.type !== 'library') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Library not found' } }, 404);
    }

    // Get sub-libraries and documents (children via parent-child dependency)
    const dependents = await api.getDependents(id, ['parent-child']);

    // Separate into sub-libraries and documents
    const childIds = dependents.map(d => d.sourceId);
    const children: Element[] = [];
    for (const childId of childIds) {
      const child = await api.get(childId as ElementId);
      if (child) {
        children.push(child);
      }
    }

    const subLibraries = children.filter(c => c.type === 'library');
    const documents = children.filter(c => c.type === 'document');

    return c.json({
      ...library,
      _subLibraries: subLibraries,
      _documents: documents,
    });
  } catch (error) {
    console.error('[elemental] Failed to get library:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get library' } }, 500);
  }
});

app.get('/api/libraries/:id/documents', async (c) => {
  try {
    const id = c.req.param('id') as ElementId;
    const url = new URL(c.req.url);
    const limitParam = url.searchParams.get('limit');
    const offsetParam = url.searchParams.get('offset');

    // First verify library exists
    const library = await api.get(id);
    if (!library) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Library not found' } }, 404);
    }
    if (library.type !== 'library') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Library not found' } }, 404);
    }

    // Get documents via parent-child dependency
    const dependents = await api.getDependents(id, ['parent-child']);

    // Filter to only documents and fetch full data
    const documentIds = dependents.map(d => d.sourceId);
    const documents: Element[] = [];

    for (const docId of documentIds) {
      const doc = await api.get(docId as ElementId);
      if (doc && doc.type === 'document') {
        documents.push(doc);
      }
    }

    // Apply pagination if requested
    let result = documents;
    const offset = offsetParam ? parseInt(offsetParam, 10) : 0;
    const limit = limitParam ? parseInt(limitParam, 10) : undefined;

    if (offset > 0) {
      result = result.slice(offset);
    }
    if (limit !== undefined) {
      result = result.slice(0, limit);
    }

    return c.json(result);
  } catch (error) {
    console.error('[elemental] Failed to get library documents:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get library documents' } }, 500);
  }
});

app.post('/api/libraries', async (c) => {
  try {
    const body = await c.req.json() as { name: string; createdBy: string; parentId?: string; tags?: string[]; metadata?: Record<string, unknown> };

    // Validate required fields
    if (!body.name || typeof body.name !== 'string') {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'name is required and must be a string' } }, 400);
    }
    if (!body.createdBy || typeof body.createdBy !== 'string') {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'createdBy is required and must be a string' } }, 400);
    }

    // Create the library input
    const libraryInput: CreateLibraryInput = {
      name: body.name.trim(),
      createdBy: body.createdBy as EntityId,
      ...(body.tags && { tags: body.tags }),
      ...(body.metadata && { metadata: body.metadata }),
    };

    // Create the library using the factory function
    const library = await createLibrary(libraryInput);

    // Persist to database
    const created = await api.create(library as unknown as Element & Record<string, unknown>);

    // If parentId is provided, establish parent-child relationship
    if (body.parentId) {
      // Verify parent library exists
      const parent = await api.get(body.parentId as ElementId);
      if (!parent) {
        // Library was created but parent doesn't exist - delete and return error
        await api.delete(created.id);
        return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Parent library not found' } }, 400);
      }
      if (parent.type !== 'library') {
        await api.delete(created.id);
        return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Parent must be a library' } }, 400);
      }

      // Add parent-child dependency (child is source, parent is target)
      await api.addDependency({
        sourceId: created.id,
        targetId: body.parentId as ElementId,
        type: 'parent-child',
        actor: body.createdBy as EntityId,
      });
    }

    return c.json(created, 201);
  } catch (error) {
    if ((error as { code?: string }).code === 'VALIDATION_ERROR') {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: (error as Error).message } }, 400);
    }
    console.error('[elemental] Failed to create library:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to create library' } }, 500);
  }
});

// ============================================================================
// Documents Endpoints
// ============================================================================

app.get('/api/documents', async (c) => {
  try {
    const url = new URL(c.req.url);
    const limitParam = url.searchParams.get('limit');
    const offsetParam = url.searchParams.get('offset');

    const filter: Record<string, unknown> = {
      type: 'document',
      orderBy: 'updated_at',
      orderDir: 'desc',
    };

    if (limitParam) {
      filter.limit = parseInt(limitParam, 10);
    }
    if (offsetParam) {
      filter.offset = parseInt(offsetParam, 10);
    }

    const documents = await api.list(filter as Parameters<typeof api.list>[0]);
    return c.json(documents);
  } catch (error) {
    console.error('[elemental] Failed to get documents:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get documents' } }, 500);
  }
});

app.get('/api/documents/:id', async (c) => {
  try {
    const id = c.req.param('id') as ElementId;
    const document = await api.get(id);

    if (!document) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Document not found' } }, 404);
    }

    if (document.type !== 'document') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Document not found' } }, 404);
    }

    return c.json(document);
  } catch (error) {
    console.error('[elemental] Failed to get document:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get document' } }, 500);
  }
});

app.post('/api/documents', async (c) => {
  try {
    const body = await c.req.json();

    // Validate required fields
    if (!body.createdBy || typeof body.createdBy !== 'string') {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'createdBy is required' } }, 400);
    }

    // Default content type to 'text' if not provided
    const contentType = body.contentType || 'text';

    // Validate contentType
    const validContentTypes = ['text', 'markdown', 'json'];
    if (!validContentTypes.includes(contentType)) {
      return c.json({
        error: {
          code: 'VALIDATION_ERROR',
          message: `Invalid contentType. Must be one of: ${validContentTypes.join(', ')}`,
        },
      }, 400);
    }

    // Default content to empty string if not provided
    const content = body.content || '';

    // Validate JSON content if contentType is json
    if (contentType === 'json' && content) {
      try {
        JSON.parse(content);
      } catch {
        return c.json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid JSON content',
          },
        }, 400);
      }
    }

    // Build CreateDocumentInput
    const docInput: CreateDocumentInput = {
      contentType,
      content,
      createdBy: body.createdBy as EntityId,
      ...(body.tags !== undefined && { tags: body.tags }),
      ...(body.metadata !== undefined && { metadata: body.metadata }),
    };

    // Create the document using the factory function
    const document = await createDocument(docInput);

    // If title is provided, add it to the document data
    const documentWithTitle = body.title
      ? { ...document, title: body.title }
      : document;

    // Create in database
    const created = await api.create(documentWithTitle as unknown as Element & Record<string, unknown>);

    // If libraryId is provided, add document to library via parent-child dependency
    if (body.libraryId) {
      // Verify library exists
      const library = await api.get(body.libraryId as ElementId);
      if (library && library.type === 'library') {
        await api.addDependency({
          sourceId: created.id,
          targetId: body.libraryId as ElementId,
          type: 'parent-child',
        });
      }
    }

    return c.json(created, 201);
  } catch (error) {
    if ((error as { code?: string }).code === 'VALIDATION_ERROR') {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: (error as Error).message } }, 400);
    }
    console.error('[elemental] Failed to create document:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to create document' } }, 500);
  }
});

app.patch('/api/documents/:id', async (c) => {
  try {
    const id = c.req.param('id') as ElementId;
    const body = await c.req.json();

    // First verify it's a document
    const existing = await api.get(id);
    if (!existing) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Document not found' } }, 404);
    }
    if (existing.type !== 'document') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Document not found' } }, 404);
    }

    // Extract allowed updates (prevent changing immutable fields)
    const updates: Record<string, unknown> = {};
    const allowedFields = ['title', 'content', 'contentType', 'tags', 'metadata'];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates[field] = body[field];
      }
    }

    // Validate contentType if provided
    if (updates.contentType) {
      const validContentTypes = ['text', 'markdown', 'json'];
      if (!validContentTypes.includes(updates.contentType as string)) {
        return c.json({
          error: {
            code: 'VALIDATION_ERROR',
            message: `Invalid contentType. Must be one of: ${validContentTypes.join(', ')}`,
          },
        }, 400);
      }
    }

    // Validate JSON content if contentType is json
    const contentType = (updates.contentType || (existing as unknown as { contentType: string }).contentType) as string;
    if (contentType === 'json' && updates.content !== undefined) {
      try {
        JSON.parse(updates.content as string);
      } catch {
        return c.json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid JSON content',
          },
        }, 400);
      }
    }

    // Update the document
    const updated = await api.update(id, updates);

    return c.json(updated);
  } catch (error) {
    if ((error as { code?: string }).code === 'NOT_FOUND') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Document not found' } }, 404);
    }
    if ((error as { code?: string }).code === 'CONCURRENT_MODIFICATION') {
      return c.json({ error: { code: 'CONFLICT', message: 'Document was modified by another process' } }, 409);
    }
    if ((error as { code?: string }).code === 'VALIDATION_ERROR') {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: (error as Error).message } }, 400);
    }
    console.error('[elemental] Failed to update document:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to update document' } }, 500);
  }
});

// Document Versions Endpoints (TB23)
// ============================================================================

app.get('/api/documents/:id/versions', async (c) => {
  try {
    const id = c.req.param('id') as ElementId;

    // First verify it's a document
    const existing = await api.get(id);
    if (!existing) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Document not found' } }, 404);
    }
    if (existing.type !== 'document') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Document not found' } }, 404);
    }

    // Get version history using the API method
    const versions = await api.getDocumentHistory(id as unknown as import('@elemental/cli').DocumentId);

    return c.json(versions);
  } catch (error) {
    console.error('[elemental] Failed to get document versions:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get document versions' } }, 500);
  }
});

app.get('/api/documents/:id/versions/:version', async (c) => {
  try {
    const id = c.req.param('id') as ElementId;
    const versionParam = c.req.param('version');
    const version = parseInt(versionParam, 10);

    if (isNaN(version) || version < 1) {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid version number' } }, 400);
    }

    // Get the specific version
    const document = await api.getDocumentVersion(id as unknown as import('@elemental/cli').DocumentId, version);

    if (!document) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Document version not found' } }, 404);
    }

    return c.json(document);
  } catch (error) {
    console.error('[elemental] Failed to get document version:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get document version' } }, 500);
  }
});

app.post('/api/documents/:id/restore', async (c) => {
  try {
    const id = c.req.param('id') as ElementId;
    const body = await c.req.json();
    const version = body.version;

    if (typeof version !== 'number' || version < 1) {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid version number' } }, 400);
    }

    // First verify it's a document
    const existing = await api.get(id);
    if (!existing) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Document not found' } }, 404);
    }
    if (existing.type !== 'document') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Document not found' } }, 404);
    }

    // Get the version to restore
    const versionToRestore = await api.getDocumentVersion(id as unknown as import('@elemental/cli').DocumentId, version);
    if (!versionToRestore) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Document version not found' } }, 404);
    }

    // Update the document with the restored content
    // Use type assertion since we're passing document-specific fields
    const restored = await api.update(id, {
      content: versionToRestore.content,
      contentType: versionToRestore.contentType,
      // Note: This creates a new version with the restored content
    } as unknown as Partial<Document>);

    return c.json(restored);
  } catch (error) {
    if ((error as { code?: string }).code === 'NOT_FOUND') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Document not found' } }, 404);
    }
    console.error('[elemental] Failed to restore document version:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to restore document version' } }, 500);
  }
});

app.post('/api/documents/:id/clone', async (c) => {
  try {
    const id = c.req.param('id') as ElementId;
    const body = await c.req.json();

    // Get the source document
    const sourceDoc = await api.get(id);
    if (!sourceDoc) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Document not found' } }, 404);
    }
    if (sourceDoc.type !== 'document') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Document not found' } }, 404);
    }

    // Cast to document type with title field (title is a runtime-added field)
    const sourceDocument = sourceDoc as Document & { title?: string };

    // Validate createdBy
    if (!body.createdBy || typeof body.createdBy !== 'string') {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'createdBy is required' } }, 400);
    }

    // Create a new document with the same content
    const docInput: CreateDocumentInput = {
      contentType: sourceDocument.contentType,
      content: sourceDocument.content || '',
      createdBy: body.createdBy as EntityId,
      tags: sourceDocument.tags || [],
    };

    const newDoc = await createDocument(docInput);

    // Use the new title or generate one from the original
    const originalTitle = (sourceDocument.title as string | undefined) || `Document ${sourceDocument.id}`;
    const newTitle = body.title || `${originalTitle} (Copy)`;

    const documentWithTitle = { ...newDoc, title: newTitle };

    // Create in database
    const created = await api.create(documentWithTitle as unknown as Element & Record<string, unknown>);

    // If libraryId is provided, add document to library via parent-child dependency
    if (body.libraryId) {
      const library = await api.get(body.libraryId as ElementId);
      if (library && library.type === 'library') {
        await api.addDependency({
          sourceId: created.id,
          targetId: body.libraryId as ElementId,
          type: 'parent-child',
        });
      }
    }

    return c.json(created, 201);
  } catch (error) {
    if ((error as { code?: string }).code === 'NOT_FOUND') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Document not found' } }, 404);
    }
    console.error('[elemental] Failed to clone document:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to clone document' } }, 500);
  }
});

// ============================================================================
// Plans Endpoints (TB24)
// ============================================================================

app.get('/api/plans', async (c) => {
  try {
    const url = new URL(c.req.url);
    const statusParam = url.searchParams.get('status');
    const limitParam = url.searchParams.get('limit');
    const offsetParam = url.searchParams.get('offset');

    const filter: Record<string, unknown> = {
      type: 'plan',
      orderBy: 'updated_at',
      orderDir: 'desc',
    };

    if (statusParam) {
      filter.status = statusParam;
    }
    if (limitParam) {
      filter.limit = parseInt(limitParam, 10);
    }
    if (offsetParam) {
      filter.offset = parseInt(offsetParam, 10);
    }

    const plans = await api.list(filter as Parameters<typeof api.list>[0]);
    return c.json(plans);
  } catch (error) {
    console.error('[elemental] Failed to get plans:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get plans' } }, 500);
  }
});

app.get('/api/plans/:id', async (c) => {
  try {
    const id = c.req.param('id') as ElementId;
    const url = new URL(c.req.url);
    const hydrateProgress = url.searchParams.get('hydrate.progress') === 'true';

    const plan = await api.get(id);

    if (!plan) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Plan not found' } }, 404);
    }

    if (plan.type !== 'plan') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Plan not found' } }, 404);
    }

    // Optionally hydrate progress
    if (hydrateProgress) {
      const progress = await api.getPlanProgress(id);
      return c.json({ ...plan, _progress: progress });
    }

    return c.json(plan);
  } catch (error) {
    console.error('[elemental] Failed to get plan:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get plan' } }, 500);
  }
});

app.get('/api/plans/:id/tasks', async (c) => {
  try {
    const id = c.req.param('id') as ElementId;
    const url = new URL(c.req.url);
    const statusParam = url.searchParams.get('status');
    const limitParam = url.searchParams.get('limit');
    const offsetParam = url.searchParams.get('offset');

    // First verify plan exists
    const plan = await api.get(id);
    if (!plan) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Plan not found' } }, 404);
    }
    if (plan.type !== 'plan') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Plan not found' } }, 404);
    }

    // Build filter for getTasksInPlan
    const filter: Record<string, unknown> = {};

    if (statusParam) {
      filter.status = statusParam;
    }
    if (limitParam) {
      filter.limit = parseInt(limitParam, 10);
    }
    if (offsetParam) {
      filter.offset = parseInt(offsetParam, 10);
    }

    const tasks = await api.getTasksInPlan(id, filter as Parameters<typeof api.getTasksInPlan>[1]);
    return c.json(tasks);
  } catch (error) {
    console.error('[elemental] Failed to get plan tasks:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get plan tasks' } }, 500);
  }
});

app.get('/api/plans/:id/progress', async (c) => {
  try {
    const id = c.req.param('id') as ElementId;

    // First verify plan exists
    const plan = await api.get(id);
    if (!plan) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Plan not found' } }, 404);
    }
    if (plan.type !== 'plan') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Plan not found' } }, 404);
    }

    const progress = await api.getPlanProgress(id);
    return c.json(progress);
  } catch (error) {
    console.error('[elemental] Failed to get plan progress:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get plan progress' } }, 500);
  }
});

app.post('/api/plans', async (c) => {
  try {
    const body = await c.req.json();

    // Validate required fields
    if (!body.title || typeof body.title !== 'string') {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'title is required and must be a string' } }, 400);
    }

    if (!body.createdBy || typeof body.createdBy !== 'string') {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'createdBy is required and must be a string' } }, 400);
    }

    // Validate title length
    if (body.title.length < 1 || body.title.length > 500) {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'title must be between 1 and 500 characters' } }, 400);
    }

    // Create the plan using the factory function
    const planInput: CreatePlanInput = {
      title: body.title,
      createdBy: body.createdBy as EntityId,
      status: (body.status as PlanStatus) || ('draft' as PlanStatus),
      tags: body.tags || [],
      descriptionRef: body.descriptionRef,
    };

    const plan = await createPlan(planInput);
    const created = await api.create(plan as unknown as Element & Record<string, unknown>);
    return c.json(created, 201);
  } catch (error) {
    if ((error as { code?: string }).code === 'VALIDATION_ERROR') {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: (error as Error).message } }, 400);
    }
    console.error('[elemental] Failed to create plan:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to create plan' } }, 500);
  }
});

app.patch('/api/plans/:id', async (c) => {
  try {
    const id = c.req.param('id') as ElementId;
    const body = await c.req.json();

    // First verify plan exists
    const existing = await api.get(id);
    if (!existing) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Plan not found' } }, 404);
    }
    if (existing.type !== 'plan') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Plan not found' } }, 404);
    }

    // Extract allowed updates
    const updates: Record<string, unknown> = {};
    const allowedFields = ['title', 'status', 'tags', 'metadata', 'descriptionRef', 'cancelReason'];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates[field] = body[field];
      }
    }

    // Validate title if provided
    if (updates.title !== undefined) {
      if (typeof updates.title !== 'string' || updates.title.length < 1 || updates.title.length > 500) {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: 'title must be between 1 and 500 characters' } }, 400);
      }
    }

    // Validate status if provided
    if (updates.status !== undefined) {
      const validStatuses = ['draft', 'active', 'completed', 'cancelled'];
      if (!validStatuses.includes(updates.status as string)) {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: `Invalid status. Must be one of: ${validStatuses.join(', ')}` } }, 400);
      }
    }

    const updated = await api.update(id, updates);
    return c.json(updated);
  } catch (error) {
    if ((error as { code?: string }).code === 'NOT_FOUND') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Plan not found' } }, 404);
    }
    if ((error as { code?: string }).code === 'VALIDATION_ERROR') {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: (error as Error).message } }, 400);
    }
    console.error('[elemental] Failed to update plan:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to update plan' } }, 500);
  }
});

// ============================================================================
// Workflows Endpoints (TB25)
// ============================================================================

app.get('/api/workflows', async (c) => {
  try {
    const url = new URL(c.req.url);
    const statusParam = url.searchParams.get('status');
    const ephemeralParam = url.searchParams.get('ephemeral');
    const limitParam = url.searchParams.get('limit');
    const offsetParam = url.searchParams.get('offset');

    const filter: Record<string, unknown> = {
      type: 'workflow',
      orderBy: 'updated_at',
      orderDir: 'desc',
    };

    if (statusParam) {
      filter.status = statusParam;
    }
    if (ephemeralParam !== null) {
      filter.ephemeral = ephemeralParam === 'true';
    }
    if (limitParam) {
      filter.limit = parseInt(limitParam, 10);
    }
    if (offsetParam) {
      filter.offset = parseInt(offsetParam, 10);
    }

    const workflows = await api.list(filter as Parameters<typeof api.list>[0]);
    return c.json(workflows);
  } catch (error) {
    console.error('[elemental] Failed to get workflows:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get workflows' } }, 500);
  }
});

app.get('/api/workflows/:id', async (c) => {
  try {
    const id = c.req.param('id') as ElementId;
    const url = new URL(c.req.url);
    const hydrateProgress = url.searchParams.get('hydrate.progress') === 'true';

    const workflow = await api.get(id);

    if (!workflow) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Workflow not found' } }, 404);
    }

    if (workflow.type !== 'workflow') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Workflow not found' } }, 404);
    }

    // Optionally hydrate progress
    if (hydrateProgress) {
      const progress = await api.getWorkflowProgress(id);
      return c.json({ ...workflow, _progress: progress });
    }

    return c.json(workflow);
  } catch (error) {
    console.error('[elemental] Failed to get workflow:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get workflow' } }, 500);
  }
});

app.get('/api/workflows/:id/tasks', async (c) => {
  try {
    const id = c.req.param('id') as ElementId;
    const url = new URL(c.req.url);
    const statusParam = url.searchParams.get('status');
    const limitParam = url.searchParams.get('limit');
    const offsetParam = url.searchParams.get('offset');

    // First verify workflow exists
    const workflow = await api.get(id);
    if (!workflow) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Workflow not found' } }, 404);
    }
    if (workflow.type !== 'workflow') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Workflow not found' } }, 404);
    }

    // Build filter for getTasksInWorkflow
    const filter: Record<string, unknown> = {};

    if (statusParam) {
      filter.status = statusParam;
    }
    if (limitParam) {
      filter.limit = parseInt(limitParam, 10);
    }
    if (offsetParam) {
      filter.offset = parseInt(offsetParam, 10);
    }

    const tasks = await api.getTasksInWorkflow(id, filter as Parameters<typeof api.getTasksInWorkflow>[1]);
    return c.json(tasks);
  } catch (error) {
    console.error('[elemental] Failed to get workflow tasks:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get workflow tasks' } }, 500);
  }
});

app.get('/api/workflows/:id/progress', async (c) => {
  try {
    const id = c.req.param('id') as ElementId;

    // First verify workflow exists
    const workflow = await api.get(id);
    if (!workflow) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Workflow not found' } }, 404);
    }
    if (workflow.type !== 'workflow') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Workflow not found' } }, 404);
    }

    const progress = await api.getWorkflowProgress(id);
    return c.json(progress);
  } catch (error) {
    console.error('[elemental] Failed to get workflow progress:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get workflow progress' } }, 500);
  }
});

app.post('/api/workflows', async (c) => {
  try {
    const body = await c.req.json();

    // Validate required fields
    if (!body.title || typeof body.title !== 'string') {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'title is required and must be a string' } }, 400);
    }

    if (!body.createdBy || typeof body.createdBy !== 'string') {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'createdBy is required and must be a string' } }, 400);
    }

    // Validate title length
    if (body.title.length < 1 || body.title.length > 500) {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'title must be between 1 and 500 characters' } }, 400);
    }

    // Create the workflow using the factory function
    const workflowInput: CreateWorkflowInput = {
      title: body.title,
      createdBy: body.createdBy as EntityId,
      status: (body.status as WorkflowStatus) || ('pending' as WorkflowStatus),
      ephemeral: body.ephemeral ?? false,
      tags: body.tags || [],
      variables: body.variables || {},
      descriptionRef: body.descriptionRef,
      playbookId: body.playbookId,
    };

    const workflow = await createWorkflow(workflowInput);
    const created = await api.create(workflow as unknown as Element & Record<string, unknown>);
    return c.json(created, 201);
  } catch (error) {
    if ((error as { code?: string }).code === 'VALIDATION_ERROR') {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: (error as Error).message } }, 400);
    }
    console.error('[elemental] Failed to create workflow:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to create workflow' } }, 500);
  }
});

app.post('/api/workflows/pour', async (c) => {
  try {
    const body = await c.req.json();

    // Validate required fields
    if (!body.playbook || typeof body.playbook !== 'object') {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'playbook is required and must be an object' } }, 400);
    }

    if (!body.createdBy || typeof body.createdBy !== 'string') {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'createdBy is required and must be a string' } }, 400);
    }

    // Build pour input
    const pourInput: PourWorkflowInput = {
      playbook: body.playbook as Playbook,
      variables: body.variables || {},
      createdBy: body.createdBy as EntityId,
      title: body.title,
      ephemeral: body.ephemeral ?? false,
      tags: body.tags || [],
      metadata: body.metadata || {},
    };

    // Pour the workflow
    const result = await pourWorkflow(pourInput);

    // Create the workflow and all tasks in the database
    const createdWorkflow = await api.create(result.workflow as unknown as Element & Record<string, unknown>);

    // Create all tasks
    const createdTasks = [];
    for (const task of result.tasks) {
      const createdTask = await api.create(task.task as unknown as Element & Record<string, unknown>);
      createdTasks.push(createdTask);
    }

    // Create all dependencies
    for (const dep of [...result.blocksDependencies, ...result.parentChildDependencies]) {
      await api.addDependency(dep);
    }

    return c.json({
      workflow: createdWorkflow,
      tasks: createdTasks,
      skippedSteps: result.skippedSteps,
      resolvedVariables: result.resolvedVariables,
    }, 201);
  } catch (error) {
    if ((error as { code?: string }).code === 'VALIDATION_ERROR') {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: (error as Error).message } }, 400);
    }
    console.error('[elemental] Failed to pour workflow:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to pour workflow' } }, 500);
  }
});

app.patch('/api/workflows/:id', async (c) => {
  try {
    const id = c.req.param('id') as ElementId;
    const body = await c.req.json();

    // First verify workflow exists
    const existing = await api.get(id);
    if (!existing) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Workflow not found' } }, 404);
    }
    if (existing.type !== 'workflow') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Workflow not found' } }, 404);
    }

    // Extract allowed updates
    const updates: Record<string, unknown> = {};
    const allowedFields = ['title', 'status', 'tags', 'metadata', 'descriptionRef', 'failureReason', 'cancelReason'];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates[field] = body[field];
      }
    }

    // Validate title if provided
    if (updates.title !== undefined) {
      if (typeof updates.title !== 'string' || updates.title.length < 1 || updates.title.length > 500) {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: 'title must be between 1 and 500 characters' } }, 400);
      }
    }

    // Validate status if provided
    if (updates.status !== undefined) {
      const validStatuses = ['pending', 'running', 'completed', 'failed', 'cancelled'];
      if (!validStatuses.includes(updates.status as string)) {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: `Invalid status. Must be one of: ${validStatuses.join(', ')}` } }, 400);
      }
    }

    const updated = await api.update(id, updates);
    return c.json(updated);
  } catch (error) {
    if ((error as { code?: string }).code === 'NOT_FOUND') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Workflow not found' } }, 404);
    }
    if ((error as { code?: string }).code === 'VALIDATION_ERROR') {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: (error as Error).message } }, 400);
    }
    console.error('[elemental] Failed to update workflow:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to update workflow' } }, 500);
  }
});

// ============================================================================
// Playbook Endpoints
// ============================================================================

// Default playbook search paths
const PLAYBOOK_SEARCH_PATHS = [
  resolve(PROJECT_ROOT, '.elemental/playbooks'),
  resolve(PROJECT_ROOT, 'playbooks'),
];

app.get('/api/playbooks', async (c) => {
  try {
    const discovered = discoverPlaybookFiles(PLAYBOOK_SEARCH_PATHS, { recursive: true });

    // Return basic info about discovered playbooks
    const playbooks = discovered.map((p: DiscoveredPlaybook) => ({
      name: p.name,
      path: p.path,
      directory: p.directory,
    }));

    return c.json(playbooks);
  } catch (error) {
    console.error('[elemental] Failed to list playbooks:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to list playbooks' } }, 500);
  }
});

app.get('/api/playbooks/:name', async (c) => {
  try {
    const name = c.req.param('name');
    const discovered = discoverPlaybookFiles(PLAYBOOK_SEARCH_PATHS, { recursive: true });

    // Find the playbook by name
    const found = discovered.find((p: DiscoveredPlaybook) => p.name.toLowerCase() === name.toLowerCase());

    if (!found) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Playbook not found' } }, 404);
    }

    // Load the full playbook
    const playbookInput = loadPlaybookFromFile(found.path, 'system' as EntityId);

    // Create a Playbook object to return (without actually storing it)
    const playbook = createPlaybook(playbookInput);

    return c.json({
      ...playbook,
      filePath: found.path,
      directory: found.directory,
    });
  } catch (error) {
    console.error('[elemental] Failed to get playbook:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get playbook' } }, 500);
  }
});

// ============================================================================
// Teams Endpoints
// ============================================================================

app.get('/api/teams', async (c) => {
  try {
    const teams = await api.list({
      type: 'team',
    });
    return c.json(teams);
  } catch (error) {
    console.error('[elemental] Failed to get teams:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get teams' } }, 500);
  }
});

app.get('/api/teams/:id', async (c) => {
  try {
    const id = c.req.param('id') as ElementId;
    const team = await api.get(id);

    if (!team || team.type !== 'team') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Team not found' } }, 404);
    }

    return c.json(team);
  } catch (error) {
    console.error('[elemental] Failed to get team:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get team' } }, 500);
  }
});

app.get('/api/teams/:id/members', async (c) => {
  try {
    const id = c.req.param('id') as ElementId;
    const team = await api.get(id);

    if (!team || team.type !== 'team') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Team not found' } }, 404);
    }

    // Get member IDs from the team
    const teamData = team as unknown as { members: EntityId[] };
    const memberIds = teamData.members || [];

    // Fetch each member entity
    const members: Element[] = [];
    for (const memberId of memberIds) {
      try {
        const member = await api.get(memberId as unknown as ElementId);
        if (member && member.type === 'entity') {
          members.push(member);
        }
      } catch {
        // Skip members that can't be fetched
      }
    }

    return c.json(members);
  } catch (error) {
    console.error('[elemental] Failed to get team members:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get team members' } }, 500);
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

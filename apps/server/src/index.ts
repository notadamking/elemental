/**
 * Elemental Platform Server
 *
 * HTTP + WebSocket server for the Elemental web platform.
 * Built with Hono for fast, minimal overhead.
 */

import { resolve, dirname, extname } from 'node:path';
import { mkdir, readdir, unlink, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { createStorage, createElementalAPI, initializeSchema, createTask, createDocument, createMessage, createPlan, pourWorkflow, createWorkflow, discoverPlaybookFiles, loadPlaybookFromFile, createPlaybook, createLibrary, createGroupChannel, createDirectChannel, createEntity, createTeam, createSyncService, createInboxService, getDirectReports, getManagementChain, validateManager, detectReportingCycle } from '@elemental/cli';
import type { SyncService, InboxService } from '@elemental/cli';
import type { ElementalAPI, ElementId, CreateTaskInput, Element, EntityId, CreateDocumentInput, CreateMessageInput, Document, Message, CreatePlanInput, PlanStatus, WorkflowStatus, CreateWorkflowInput, PourWorkflowInput, Playbook, DiscoveredPlaybook, CreateLibraryInput, CreateGroupChannelInput, CreateDirectChannelInput, Visibility, JoinPolicy, CreateTeamInput, Channel, Workflow, InboxFilter, InboxStatus, Entity, EventType } from '@elemental/cli';
import type { ServerWebSocket } from 'bun';
import { initializeBroadcaster } from './ws/broadcaster.js';
import { handleOpen, handleMessage, handleClose, handleError, getClientCount, broadcastInboxEvent, type ClientData } from './ws/handler.js';

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

// Uploads directory - for storing image files (TB94e)
const UPLOADS_DIR = resolve(PROJECT_ROOT, '.elemental/uploads');
const MAX_UPLOAD_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
];
const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
};

// ============================================================================
// Initialize API
// ============================================================================

let api: ElementalAPI;
let syncService: SyncService;
let inboxService: InboxService;
let storageBackend: ReturnType<typeof createStorage>;

try {
  storageBackend = createStorage({ path: DB_PATH });
  initializeSchema(storageBackend);
  api = createElementalAPI(storageBackend);
  syncService = createSyncService(storageBackend);
  inboxService = createInboxService(storageBackend);
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
// Task Enrichment Helper (TB83)
// ============================================================================

/**
 * Enriches tasks with dependency and attachment counts.
 * Used by multiple endpoints for TB83 rich task display.
 */
function enrichTasksWithCounts(tasks: Record<string, unknown>[]): Record<string, unknown>[] {
  if (tasks.length === 0) return tasks;

  // Get all dependencies efficiently using a single query
  const allDependencies = storageBackend.query<{
    source_id: string;
    target_id: string;
    type: string;
  }>('SELECT source_id, target_id, type FROM dependencies');

  // Build maps for quick lookup
  const blocksCountMap = new Map<string, number>();
  const blockedByCountMap = new Map<string, number>();
  const attachmentCountMap = new Map<string, number>();

  for (const dep of allDependencies) {
    const depType = dep.type;
    const sourceId = dep.source_id;
    const targetId = dep.target_id;

    if (depType === 'blocks' || depType === 'awaits') {
      blocksCountMap.set(sourceId, (blocksCountMap.get(sourceId) || 0) + 1);
      blockedByCountMap.set(targetId, (blockedByCountMap.get(targetId) || 0) + 1);
    } else if (depType === 'references') {
      attachmentCountMap.set(sourceId, (attachmentCountMap.get(sourceId) || 0) + 1);
    }
  }

  // Enrich tasks with counts
  return tasks.map((task) => {
    const taskId = task.id as string;
    return {
      ...task,
      _attachmentCount: attachmentCountMap.get(taskId) || 0,
      _blocksCount: blocksCountMap.get(taskId) || 0,
      _blockedByCount: blockedByCountMap.get(taskId) || 0,
    };
  });
}

// ============================================================================
// Elements Endpoint - Bulk Data Loading (TB67)
// ============================================================================

/**
 * GET /api/elements/all
 * Returns all elements in a single response, grouped by type.
 * Used for upfront data loading strategy (TB67).
 *
 * Query params:
 * - types: Comma-separated list of types to include (default: all types)
 * - includeDeleted: Include soft-deleted elements (default: false)
 * - includeTaskCounts: Include attachment, blocksCount, blockedByCount for tasks (TB83)
 */
app.get('/api/elements/all', async (c) => {
  try {
    const url = new URL(c.req.url);
    const typesParam = url.searchParams.get('types');
    const includeDeleted = url.searchParams.get('includeDeleted') === 'true';
    const includeTaskCounts = url.searchParams.get('includeTaskCounts') === 'true';

    // Define all element types we want to load
    const allTypes = ['task', 'plan', 'workflow', 'entity', 'document', 'channel', 'message', 'team', 'library'] as const;
    const requestedTypes = typesParam ? typesParam.split(',').filter(t => allTypes.includes(t as typeof allTypes[number])) : [...allTypes];

    // Load each type in parallel for performance
    const results = await Promise.all(
      requestedTypes.map(async (type) => {
        const filter: Record<string, unknown> = {
          type,
          limit: 10000, // High limit to get all elements
          orderBy: 'updated_at',
          orderDir: 'desc',
        };

        if (!includeDeleted) {
          // Only include non-deleted elements
          filter.deleted = false;
        }

        try {
          const result = await api.listPaginated(filter as Parameters<typeof api.listPaginated>[0]);
          return { type, items: result.items, total: result.total };
        } catch (err) {
          console.error(`[elemental] Failed to load ${type} elements:`, err);
          return { type, items: [], total: 0 };
        }
      })
    );

    // Organize results by type
    const data: Record<string, { items: unknown[]; total: number }> = {};
    let totalElements = 0;

    for (const result of results) {
      data[result.type] = { items: result.items, total: result.total };
      totalElements += result.total;
    }

    // TB83: Enrich tasks with dependency and attachment counts
    if (includeTaskCounts && data.task && data.task.items.length > 0) {
      data.task.items = enrichTasksWithCounts(data.task.items as Record<string, unknown>[]);
    }

    return c.json({
      data,
      totalElements,
      types: requestedTypes,
      loadedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[elemental] Failed to get all elements:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get all elements' } }, 500);
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
    const searchParam = url.searchParams.get('search');

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

    // If search param is provided, use the search API
    if (searchParam && searchParam.trim()) {
      const searchResults = await api.search(searchParam.trim(), filter as Parameters<typeof api.search>[1]);
      const limit = filter.limit as number || 50;
      const offset = (filter.offset as number) || 0;
      const slicedResults = searchResults.slice(offset, offset + limit);
      return c.json({
        data: slicedResults,
        total: searchResults.length,
        limit,
        offset,
      });
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
    // TB83: Enrich ready tasks with counts for rich display
    const enrichedTasks = enrichTasksWithCounts(tasks as unknown as Record<string, unknown>[]);
    return c.json(enrichedTasks);
  } catch (error) {
    console.error('[elemental] Failed to get ready tasks:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get ready tasks' } }, 500);
  }
});

app.get('/api/tasks/blocked', async (c) => {
  try {
    const tasks = await api.blocked();
    // TB83: Enrich blocked tasks with counts for rich display
    const enrichedTasks = enrichTasksWithCounts(tasks as unknown as Record<string, unknown>[]);
    return c.json(enrichedTasks);
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

    // Handle description field - creates linked Document (TB124)
    let descriptionRef = body.descriptionRef;
    if (body.description !== undefined && body.description.trim().length > 0 && !descriptionRef) {
      const docInput: CreateDocumentInput = {
        contentType: 'markdown',
        content: body.description,
        createdBy: body.createdBy as EntityId,
        tags: ['task-description'],
      };
      const newDoc = await createDocument(docInput);
      const docWithTitle = { ...newDoc, title: `Description for task ${body.title}` };
      const createdDoc = await api.create(docWithTitle as unknown as Element & Record<string, unknown>);
      descriptionRef = createdDoc.id;
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
      ...(descriptionRef !== undefined && { descriptionRef }),
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
      'assignee', 'owner', 'deadline', 'scheduledFor', 'tags', 'metadata', 'notes'
    ];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates[field] = body[field];
      }
    }

    // Handle description field - creates or updates linked Document (TB124)
    if (body.description !== undefined) {
      const task = existing as { descriptionRef?: string; createdBy: string };

      if (task.descriptionRef) {
        // Update existing description document
        const descDoc = await api.get(task.descriptionRef as ElementId);
        if (descDoc && descDoc.type === 'document') {
          await api.update(task.descriptionRef as ElementId, {
            content: body.description,
          } as unknown as Partial<Document>);
        }
      } else if (body.description.trim().length > 0) {
        // Create new description document and link it
        const docInput: CreateDocumentInput = {
          contentType: 'markdown',
          content: body.description,
          createdBy: task.createdBy as EntityId,
          tags: ['task-description'],
        };
        const newDoc = await createDocument(docInput);
        const docWithTitle = { ...newDoc, title: `Description for task ${id}` };
        const createdDoc = await api.create(docWithTitle as unknown as Element & Record<string, unknown>);
        updates.descriptionRef = createdDoc.id;
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

    // TB121/TB122: Check if task is in a plan or workflow and would be the last one
    const parentDeps = await api.getDependencies(id, ['parent-child']);
    for (const dep of parentDeps) {
      const parent = await api.get(dep.targetId);
      if (parent) {
        if (parent.type === 'plan') {
          // Check if this is the last task in the plan
          const planTasks = await api.getTasksInPlan(dep.targetId);
          if (planTasks.length === 1 && planTasks[0].id === id) {
            return c.json({
              error: {
                code: 'LAST_TASK',
                message: 'Cannot delete the last task in a plan. Plans must have at least one task.'
              }
            }, 400);
          }
        } else if (parent.type === 'workflow') {
          // Check if this is the last task in the workflow
          const workflowTasks = await api.getTasksInWorkflow(dep.targetId);
          if (workflowTasks.length === 1 && workflowTasks[0].id === id) {
            return c.json({
              error: {
                code: 'LAST_TASK',
                message: "Cannot delete the last task in a workflow. Workflows must have at least one task. Use 'Burn' to delete the entire workflow."
              }
            }, 400);
          }
        }
      }
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
// Task Attachments Endpoints
// ============================================================================

/**
 * GET /api/tasks/:id/attachments
 * Returns all documents attached to a task via 'references' dependencies
 */
app.get('/api/tasks/:id/attachments', async (c) => {
  try {
    const taskId = c.req.param('id') as ElementId;

    // Verify task exists
    const task = await api.get(taskId);
    if (!task) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Task not found' } }, 404);
    }
    if (task.type !== 'task') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Task not found' } }, 404);
    }

    // Get all dependencies where this task references a document
    const dependencies = await api.getDependencies(taskId);
    const attachmentDeps = dependencies.filter(
      (dep) => dep.sourceId === taskId && dep.type === 'references'
    );

    // Get the document details for each attachment
    const attachments = await Promise.all(
      attachmentDeps.map(async (dep) => {
        const doc = await api.get(dep.targetId as ElementId);
        if (doc && doc.type === 'document') {
          return doc;
        }
        return null;
      })
    );

    // Filter out nulls (in case documents were deleted)
    return c.json(attachments.filter(Boolean));
  } catch (error) {
    console.error('[elemental] Failed to get task attachments:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get task attachments' } }, 500);
  }
});

/**
 * POST /api/tasks/:id/attachments
 * Attaches a document to a task via 'references' dependency
 */
app.post('/api/tasks/:id/attachments', async (c) => {
  try {
    const taskId = c.req.param('id') as ElementId;
    const body = await c.req.json();

    // Validate document ID
    if (!body.documentId || typeof body.documentId !== 'string') {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'documentId is required' } }, 400);
    }

    // Verify task exists
    const task = await api.get(taskId);
    if (!task) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Task not found' } }, 404);
    }
    if (task.type !== 'task') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Task not found' } }, 404);
    }

    // Verify document exists
    const doc = await api.get(body.documentId as ElementId);
    if (!doc) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Document not found' } }, 404);
    }
    if (doc.type !== 'document') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Document not found' } }, 404);
    }

    // Check if already attached
    const existingDeps = await api.getDependencies(taskId);
    const alreadyAttached = existingDeps.some(
      (dep) => dep.sourceId === taskId && dep.targetId === body.documentId && dep.type === 'references'
    );
    if (alreadyAttached) {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Document is already attached to this task' } }, 400);
    }

    // Create the references dependency (task references document)
    await api.addDependency({
      sourceId: taskId,
      targetId: body.documentId as ElementId,
      type: 'references',
      actor: (body.actor as EntityId) || ('el-0000' as EntityId),
    });

    return c.json(doc, 201);
  } catch (error) {
    console.error('[elemental] Failed to attach document to task:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to attach document' } }, 500);
  }
});

/**
 * DELETE /api/tasks/:id/attachments/:docId
 * Removes a document attachment from a task
 */
app.delete('/api/tasks/:id/attachments/:docId', async (c) => {
  try {
    const taskId = c.req.param('id') as ElementId;
    const docId = c.req.param('docId') as ElementId;

    // Verify task exists
    const task = await api.get(taskId);
    if (!task) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Task not found' } }, 404);
    }
    if (task.type !== 'task') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Task not found' } }, 404);
    }

    // Find the attachment dependency
    const dependencies = await api.getDependencies(taskId);
    const attachmentDep = dependencies.find(
      (dep) => dep.sourceId === taskId && dep.targetId === docId && dep.type === 'references'
    );

    if (!attachmentDep) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Document is not attached to this task' } }, 404);
    }

    // Remove the dependency
    await api.removeDependency(taskId, docId, 'references');

    return c.json({ success: true, taskId, documentId: docId });
  } catch (error) {
    console.error('[elemental] Failed to remove task attachment:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to remove attachment' } }, 500);
  }
});

/**
 * GET /api/tasks/:id/dependency-tasks
 * Returns hydrated task details for dependencies (blocks/blocked-by)
 * Used for displaying dependencies as sub-issues in TaskDetailPanel (TB84)
 */
app.get('/api/tasks/:id/dependency-tasks', async (c) => {
  try {
    const taskId = c.req.param('id') as ElementId;

    // Verify task exists
    const task = await api.get(taskId);
    if (!task) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Task not found' } }, 404);
    }
    if (task.type !== 'task') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Task not found' } }, 404);
    }

    // getDependencies(taskId) = rows where taskId is SOURCE (this task blocks others)
    // getDependents(taskId) = rows where taskId is TARGET (other tasks block this task)
    const [outgoingDeps, incomingDeps] = await Promise.all([
      api.getDependencies(taskId),  // This task is source -> this task BLOCKS others
      api.getDependents(taskId),    // This task is target -> other tasks BLOCK this task
    ]);

    // Filter to only include blocks/awaits dependency types (not references)
    // blockedByDeps: dependencies where THIS task is blocked BY other tasks (incoming)
    const blockedByDeps = incomingDeps.filter(d => d.type === 'blocks' || d.type === 'awaits');
    // blocksDeps: dependencies where THIS task blocks other tasks (outgoing)
    const blocksDeps = outgoingDeps.filter(d => d.type === 'blocks' || d.type === 'awaits');

    // Collect all unique task IDs we need to fetch
    // For blockedBy: this task is the target, so fetch the source (the blocker)
    // For blocks: this task is the source, so fetch the target (the blocked task)
    const blockerTaskIds = blockedByDeps.map(d => d.sourceId);
    const blockedTaskIds = blocksDeps.map(d => d.targetId);
    const allTaskIds = [...new Set([...blockerTaskIds, ...blockedTaskIds])];

    // Fetch all related tasks in parallel
    const tasksMap = new Map<string, { id: string; title: string; status: string; priority: number }>();

    if (allTaskIds.length > 0) {
      const taskPromises = allTaskIds.map(async (id) => {
        try {
          const t = await api.get(id as ElementId);
          if (t && t.type === 'task') {
            return {
              id: t.id,
              title: (t as unknown as { title: string }).title,
              status: (t as unknown as { status: string }).status,
              priority: (t as unknown as { priority: number }).priority,
            };
          }
          return null;
        } catch {
          return null;
        }
      });

      const tasks = await Promise.all(taskPromises);
      tasks.forEach((t) => {
        if (t) tasksMap.set(t.id, t);
      });
    }

    // Build hydrated blocker list (tasks that block this task)
    const blockedBy = blockedByDeps.map((dep) => {
      const blockerTask = tasksMap.get(dep.sourceId);
      return {
        dependencyType: dep.type,
        task: blockerTask || { id: dep.sourceId, title: `Unknown (${dep.sourceId})`, status: 'unknown', priority: 3 },
      };
    });

    // Build hydrated blocking list (tasks blocked by this task)
    const blocks = blocksDeps.map((dep) => {
      const blockedTask = tasksMap.get(dep.targetId);
      return {
        dependencyType: dep.type,
        task: blockedTask || { id: dep.targetId, title: `Unknown (${dep.targetId})`, status: 'unknown', priority: 3 },
      };
    });

    // Calculate progress stats
    const blockedByResolved = blockedBy.filter(b =>
      b.task.status === 'completed' || b.task.status === 'cancelled'
    ).length;
    const blockedByTotal = blockedBy.length;

    return c.json({
      blockedBy,
      blocks,
      progress: {
        resolved: blockedByResolved,
        total: blockedByTotal,
      },
    });
  } catch (error) {
    console.error('[elemental] Failed to get dependency tasks:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get dependency tasks' } }, 500);
  }
});

// ============================================================================
// Entities Endpoints
// ============================================================================

app.get('/api/entities', async (c) => {
  try {
    const url = new URL(c.req.url);

    // Parse pagination and filter parameters
    const limitParam = url.searchParams.get('limit');
    const offsetParam = url.searchParams.get('offset');
    const orderByParam = url.searchParams.get('orderBy');
    const orderDirParam = url.searchParams.get('orderDir');
    const entityTypeParam = url.searchParams.get('entityType');
    const searchParam = url.searchParams.get('search');

    // Build filter
    const filter: Record<string, unknown> = {
      type: 'entity',
    };

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

    // Get paginated results
    const result = await api.listPaginated(filter as Parameters<typeof api.listPaginated>[0]);

    // Apply client-side filtering for entityType and search (not supported in base filter)
    let filteredItems = result.items;

    if (entityTypeParam && entityTypeParam !== 'all') {
      filteredItems = filteredItems.filter((e) => {
        const entity = e as unknown as { entityType: string };
        return entity.entityType === entityTypeParam;
      });
    }

    if (searchParam) {
      const query = searchParam.toLowerCase();
      filteredItems = filteredItems.filter((e) => {
        const entity = e as unknown as { name: string; id: string; tags?: string[] };
        return (
          entity.name.toLowerCase().includes(query) ||
          entity.id.toLowerCase().includes(query) ||
          (entity.tags || []).some((tag) => tag.toLowerCase().includes(query))
        );
      });
    }

    // Return paginated response format
    return c.json({
      items: filteredItems,
      total: result.total,
      offset: result.offset,
      limit: result.limit,
      hasMore: result.hasMore,
    });
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

    // Calculate tasks completed today
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const completedTodayTasks = completedTasks.filter(
      (t) => {
        const task = t as unknown as { updatedAt: string };
        return new Date(task.updatedAt) >= startOfToday;
      }
    );

    // Calculate blocked tasks
    const blockedTasks = assignedTasks.filter(
      (t) => {
        const task = t as unknown as { status: string };
        return task.status === 'blocked';
      }
    );

    // Calculate in-progress tasks
    const inProgressTasks = assignedTasks.filter(
      (t) => {
        const task = t as unknown as { status: string };
        return task.status === 'in_progress';
      }
    );

    return c.json({
      assignedTaskCount: assignedTasks.length,
      activeTaskCount: activeTasks.length,
      completedTaskCount: completedTasks.length,
      completedTodayCount: completedTodayTasks.length,
      blockedTaskCount: blockedTasks.length,
      inProgressTaskCount: inProgressTasks.length,
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
    const offsetParam = url.searchParams.get('offset');
    const eventTypeParam = url.searchParams.get('eventType');

    // Verify entity exists
    const entity = await api.get(id);
    if (!entity || entity.type !== 'entity') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Entity not found' } }, 404);
    }

    // Parse event type filter if provided
    let eventTypeFilter: EventType | EventType[] | undefined;
    if (eventTypeParam) {
      const types = eventTypeParam.split(',').map(t => t.trim()).filter(Boolean) as EventType[];
      eventTypeFilter = types.length === 1 ? types[0] : types;
    }

    // Get events by this actor
    const events = await api.listEvents({
      actor: id as unknown as EntityId,
      limit: limitParam ? parseInt(limitParam, 10) : 20,
      offset: offsetParam ? parseInt(offsetParam, 10) : undefined,
      eventType: eventTypeFilter,
    });

    return c.json(events);
  } catch (error) {
    console.error('[elemental] Failed to get entity events:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get entity events' } }, 500);
  }
});

// GET /api/entities/:id/history - Get entity's full event history with pagination
// TB110: Entity Event History (Commit History Style)
app.get('/api/entities/:id/history', async (c) => {
  try {
    const id = c.req.param('id') as ElementId;
    const url = new URL(c.req.url);
    const limitParam = url.searchParams.get('limit');
    const offsetParam = url.searchParams.get('offset');
    const eventTypeParam = url.searchParams.get('eventType');

    // Verify entity exists
    const entity = await api.get(id);
    if (!entity || entity.type !== 'entity') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Entity not found' } }, 404);
    }

    const limit = limitParam ? parseInt(limitParam, 10) : 50;
    const offset = offsetParam ? parseInt(offsetParam, 10) : 0;

    // Parse event type filter if provided
    let eventTypeFilter: EventType | EventType[] | undefined;
    if (eventTypeParam) {
      const types = eventTypeParam.split(',').map(t => t.trim()).filter(Boolean) as EventType[];
      eventTypeFilter = types.length === 1 ? types[0] : types;
    }

    // Get total count (events without pagination)
    const allEvents = await api.listEvents({
      actor: id as unknown as EntityId,
      limit: 100000, // High limit to get total count
      eventType: eventTypeFilter,
    });
    const total = allEvents.length;

    // Get paginated events
    const events = await api.listEvents({
      actor: id as unknown as EntityId,
      limit,
      offset,
      eventType: eventTypeFilter,
    });

    return c.json({
      items: events,
      total,
      offset,
      limit,
      hasMore: offset + events.length < total,
    });
  } catch (error) {
    console.error('[elemental] Failed to get entity history:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get entity history' } }, 500);
  }
});

// GET /api/entities/:id/activity - Get daily activity counts for contribution chart
// TB108: Entity Contribution Chart - GitHub-style activity grid
app.get('/api/entities/:id/activity', async (c) => {
  try {
    const id = c.req.param('id') as ElementId;
    const url = new URL(c.req.url);
    const daysParam = url.searchParams.get('days');
    const days = daysParam ? parseInt(daysParam, 10) : 365;

    // Verify entity exists
    const entity = await api.get(id);
    if (!entity || entity.type !== 'entity') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Entity not found' } }, 404);
    }

    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get all events by this actor in the date range
    const events = await api.listEvents({
      actor: id as unknown as EntityId,
      after: startDate.toISOString(),
      before: endDate.toISOString(),
      limit: 10000, // Get all events in range
    });

    // Aggregate by date (YYYY-MM-DD)
    const activityByDate: Record<string, number> = {};
    for (const event of events) {
      const date = event.createdAt.split('T')[0]; // Extract YYYY-MM-DD
      activityByDate[date] = (activityByDate[date] || 0) + 1;
    }

    // Convert to array format for frontend
    const activity = Object.entries(activityByDate).map(([date, count]) => ({
      date,
      count,
    }));

    // Sort by date ascending
    activity.sort((a, b) => a.date.localeCompare(b.date));

    return c.json({
      entityId: id,
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0],
      totalEvents: events.length,
      activity,
    });
  } catch (error) {
    console.error('[elemental] Failed to get entity activity:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get entity activity' } }, 500);
  }
});

// GET /api/entities/:id/mentions - Get documents and tasks that mention this entity
// TB113: Entity Tags Display - Shows where this entity is @mentioned
app.get('/api/entities/:id/mentions', async (c) => {
  try {
    const id = c.req.param('id') as ElementId;
    const url = new URL(c.req.url);
    const limitParam = url.searchParams.get('limit');
    const limit = limitParam ? parseInt(limitParam, 10) : 50;

    // Verify entity exists and get their name
    const entity = await api.get(id);
    if (!entity || entity.type !== 'entity') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Entity not found' } }, 404);
    }
    const entityTyped = entity as unknown as { name: string };
    const entityName = entityTyped.name;

    // Create search pattern for @mentions (stored as @name in Markdown)
    const mentionPattern = `@${entityName}`;

    // Search for documents containing the mention
    const allDocuments = await api.list({
      type: 'document',
    } as Parameters<typeof api.list>[0]);

    const mentioningDocuments: Array<{
      id: string;
      title: string;
      contentType: string;
      updatedAt: string;
      type: 'document';
    }> = [];

    for (const doc of allDocuments) {
      const docTyped = doc as unknown as { id: string; title?: string; content?: string; contentType: string; updatedAt: string };
      const content = docTyped.content || '';

      // Check if content contains the @mention
      if (content.includes(mentionPattern)) {
        mentioningDocuments.push({
          id: docTyped.id,
          title: docTyped.title || `Document ${docTyped.id}`,
          contentType: docTyped.contentType,
          updatedAt: docTyped.updatedAt,
          type: 'document',
        });

        if (mentioningDocuments.length >= limit) break;
      }
    }

    // Search for tasks containing the mention (in notes field)
    const allTasks = await api.list({
      type: 'task',
    } as Parameters<typeof api.list>[0]);

    const mentioningTasks: Array<{
      id: string;
      title: string;
      status: string;
      updatedAt: string;
      type: 'task';
    }> = [];

    for (const task of allTasks) {
      const taskTyped = task as unknown as { id: string; title?: string; notes?: string; status: string; updatedAt: string };
      const notes = taskTyped.notes || '';

      // Check if notes contain the @mention
      if (notes.includes(mentionPattern)) {
        mentioningTasks.push({
          id: taskTyped.id,
          title: taskTyped.title || `Task ${taskTyped.id}`,
          status: taskTyped.status,
          updatedAt: taskTyped.updatedAt,
          type: 'task',
        });

        if (mentioningTasks.length >= limit) break;
      }
    }

    // Combine and sort by updatedAt (most recent first)
    const allMentions = [...mentioningDocuments, ...mentioningTasks]
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, limit);

    return c.json({
      entityId: id,
      entityName,
      mentions: allMentions,
      documentCount: mentioningDocuments.length,
      taskCount: mentioningTasks.length,
      totalCount: mentioningDocuments.length + mentioningTasks.length,
    });
  } catch (error) {
    console.error('[elemental] Failed to get entity mentions:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get entity mentions' } }, 500);
  }
});

// ============================================================================
// Inbox Endpoints
// ============================================================================

// GET /api/entities/:id/inbox - Get entity's inbox with pagination and optional hydration
app.get('/api/entities/:id/inbox', async (c) => {
  try {
    const id = c.req.param('id') as EntityId;
    const url = new URL(c.req.url);

    // Parse pagination params
    const limitParam = url.searchParams.get('limit');
    const offsetParam = url.searchParams.get('offset');
    const statusParam = url.searchParams.get('status');
    const sourceTypeParam = url.searchParams.get('sourceType');
    const hydrateParam = url.searchParams.get('hydrate');

    // Verify entity exists
    const entity = await api.get(id as unknown as ElementId);
    if (!entity || entity.type !== 'entity') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Entity not found' } }, 404);
    }

    // Build filter
    const filter: InboxFilter = {
      limit: limitParam ? parseInt(limitParam, 10) : 25,
      offset: offsetParam ? parseInt(offsetParam, 10) : 0,
    };

    // Handle status filter (can be comma-separated for multiple values)
    if (statusParam) {
      const statuses = statusParam.split(',') as InboxStatus[];
      filter.status = statuses.length === 1 ? statuses[0] : statuses;
    }

    // Handle source type filter
    if (sourceTypeParam) {
      filter.sourceType = sourceTypeParam as 'direct' | 'mention';
    }

    // Get paginated inbox items
    const result = inboxService.getInboxPaginated(id, filter);

    // Hydrate items if requested
    let items = result.items;
    if (hydrateParam === 'true') {
      // Hydrate each inbox item with message, channel, sender, and TB92 enhancements
      items = await Promise.all(result.items.map(async (item) => {
        try {
          // Get message
          const message = await api.get(item.messageId as unknown as ElementId) as Message | null;

          // Get channel
          const channel = await api.get(item.channelId as unknown as ElementId) as Channel | null;

          // Get sender from message
          let sender = null;
          if (message?.sender) {
            sender = await api.get(message.sender as unknown as ElementId);
          }

          // Get message content - both preview and full content (TB92)
          let messagePreview = '';
          let fullContent = '';
          let contentType = 'text';
          if (message?.contentRef) {
            const contentDoc = await api.get(message.contentRef as unknown as ElementId) as Document | null;
            if (contentDoc?.content) {
              fullContent = contentDoc.content;
              contentType = contentDoc.contentType ?? 'text';
              // Truncate content for preview
              messagePreview = contentDoc.content.substring(0, 150);
              if (contentDoc.content.length > 150) {
                messagePreview += '...';
              }
            }
          }

          // TB92: Hydrate attachments (document embeds)
          let hydratedAttachments: { id: string; title: string; content?: string; contentType?: string }[] = [];
          if (message?.attachments && message.attachments.length > 0) {
            hydratedAttachments = await Promise.all(
              message.attachments.map(async (attachmentId) => {
                try {
                  const attachmentDoc = await api.get(attachmentId as unknown as ElementId) as Document | null;
                  if (attachmentDoc) {
                    // Derive title from first line of content or use ID
                    const firstLine = attachmentDoc.content?.split('\n')[0]?.substring(0, 50) ?? '';
                    const title = firstLine.replace(/^#+\s*/, '') || `Document ${attachmentDoc.id}`;
                    return {
                      id: attachmentDoc.id,
                      title: title,
                      content: attachmentDoc.content,
                      contentType: attachmentDoc.contentType ?? 'text',
                    };
                  }
                  return { id: attachmentId, title: 'Unknown Document' };
                } catch {
                  return { id: attachmentId, title: 'Unknown Document' };
                }
              })
            );
          }

          // TB92: Get thread parent message if this is a reply
          let threadParent = null;
          if (message?.threadId) {
            try {
              const parentMessage = await api.get(message.threadId as unknown as ElementId) as Message | null;
              if (parentMessage) {
                // Get parent sender
                let parentSender = null;
                if (parentMessage.sender) {
                  parentSender = await api.get(parentMessage.sender as unknown as ElementId);
                }
                // Get parent content preview
                let parentPreview = '';
                if (parentMessage.contentRef) {
                  const parentContentDoc = await api.get(parentMessage.contentRef as unknown as ElementId) as Document | null;
                  if (parentContentDoc?.content) {
                    parentPreview = parentContentDoc.content.substring(0, 100);
                    if (parentContentDoc.content.length > 100) {
                      parentPreview += '...';
                    }
                  }
                }
                threadParent = {
                  id: parentMessage.id,
                  sender: parentSender,
                  contentPreview: parentPreview,
                  createdAt: parentMessage.createdAt,
                };
              }
            } catch {
              // Thread parent fetch failed, continue without it
            }
          }

          return {
            ...item,
            message: message ? {
              ...message,
              contentPreview: messagePreview,
              fullContent: fullContent,
              contentType: contentType,
            } : null,
            channel: channel,
            sender: sender,
            attachments: hydratedAttachments,
            threadParent: threadParent,
          };
        } catch (err) {
          // If hydration fails for an item, return it without hydration
          console.warn(`[elemental] Failed to hydrate inbox item ${item.id}:`, err);
          return item;
        }
      }));
    }

    return c.json({
      items,
      total: result.total,
      offset: filter.offset ?? 0,
      limit: filter.limit ?? 25,
      hasMore: (filter.offset ?? 0) + result.items.length < result.total,
    });
  } catch (error) {
    console.error('[elemental] Failed to get entity inbox:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get entity inbox' } }, 500);
  }
});

// GET /api/entities/:id/inbox/count - Get unread inbox count
app.get('/api/entities/:id/inbox/count', async (c) => {
  try {
    const id = c.req.param('id') as EntityId;

    // Verify entity exists
    const entity = await api.get(id as unknown as ElementId);
    if (!entity || entity.type !== 'entity') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Entity not found' } }, 404);
    }

    const count = inboxService.getUnreadCount(id);
    return c.json({ count });
  } catch (error) {
    console.error('[elemental] Failed to get inbox count:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get inbox count' } }, 500);
  }
});

// POST /api/entities/:id/inbox/mark-all-read - Mark all inbox items as read
app.post('/api/entities/:id/inbox/mark-all-read', async (c) => {
  try {
    const id = c.req.param('id') as EntityId;

    // Verify entity exists
    const entity = await api.get(id as unknown as ElementId);
    if (!entity || entity.type !== 'entity') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Entity not found' } }, 404);
    }

    const count = inboxService.markAllAsRead(id);

    // Broadcast bulk update event for real-time updates
    // Since this is a bulk operation, broadcast a single event with count info
    if (count > 0) {
      broadcastInboxEvent(
        `bulk-${id}`, // Pseudo ID for bulk operation
        id,
        'updated',
        null,
        { bulkMarkRead: true, count }
      );
    }

    return c.json({ markedCount: count });
  } catch (error) {
    console.error('[elemental] Failed to mark all as read:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to mark all as read' } }, 500);
  }
});

// PATCH /api/inbox/:itemId - Update inbox item status
app.patch('/api/inbox/:itemId', async (c) => {
  try {
    const itemId = c.req.param('itemId');
    const body = await c.req.json<{
      status: 'read' | 'unread' | 'archived';
    }>();

    if (!body.status) {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'status is required' } }, 400);
    }

    // Get old item state for event broadcasting
    const oldItem = inboxService.getInboxItem(itemId);
    if (!oldItem) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Inbox item not found' } }, 404);
    }

    let item;
    switch (body.status) {
      case 'read':
        item = inboxService.markAsRead(itemId);
        break;
      case 'unread':
        item = inboxService.markAsUnread(itemId);
        break;
      case 'archived':
        item = inboxService.archive(itemId);
        break;
      default:
        return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid status. Must be read, unread, or archived' } }, 400);
    }

    // Broadcast inbox event for real-time updates
    broadcastInboxEvent(
      itemId,
      item.recipientId,
      'updated',
      { status: oldItem.status, readAt: oldItem.readAt },
      { status: item.status, readAt: item.readAt }
    );

    return c.json(item);
  } catch (error) {
    const errorObj = error as { code?: string };
    if (errorObj.code === 'NOT_FOUND') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Inbox item not found' } }, 404);
    }
    console.error('[elemental] Failed to update inbox item:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to update inbox item' } }, 500);
  }
});

// GET /api/inbox/all - Global inbox view across all entities (TB89)
// NOTE: This route MUST be defined before /api/inbox/:itemId to prevent "all" being matched as itemId
app.get('/api/inbox/all', async (c) => {
  try {
    const url = new URL(c.req.url);

    // Parse query parameters
    const limitParam = url.searchParams.get('limit');
    const offsetParam = url.searchParams.get('offset');
    const statusParam = url.searchParams.get('status');
    const hydrateParam = url.searchParams.get('hydrate');

    const limit = limitParam ? parseInt(limitParam, 10) : 50;
    const offset = offsetParam ? parseInt(offsetParam, 10) : 0;

    // Build filter for status
    const filter: InboxFilter = {
      limit,
      offset,
    };
    if (statusParam) {
      filter.status = statusParam as InboxStatus;
    }

    // Get all inbox items across all entities by querying the database directly
    // This requires a raw query since InboxService only supports per-entity queries
    const statusCondition = statusParam ? `AND status = '${statusParam}'` : '';
    const countResult = storageBackend.queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM inbox_items WHERE 1=1 ${statusCondition}`,
      []
    );
    const total = countResult?.count ?? 0;

    type InboxItemRow = {
      id: string;
      recipient_id: string;
      message_id: string;
      channel_id: string;
      source_type: string;
      status: string;
      read_at: string | null;
      created_at: string;
    };

    const rows = storageBackend.query<InboxItemRow>(
      `SELECT id, recipient_id, message_id, channel_id, source_type, status, read_at, created_at
       FROM inbox_items
       WHERE 1=1 ${statusCondition}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [limit, offset]
    );

    // Map rows to inbox items
    let items: Record<string, unknown>[] = rows.map(row => ({
      id: row.id,
      recipientId: row.recipient_id as EntityId,
      messageId: row.message_id,
      channelId: row.channel_id,
      sourceType: row.source_type as 'direct' | 'mention',
      status: row.status as InboxStatus,
      readAt: row.read_at,
      createdAt: row.created_at,
    }));

    // Hydrate items if requested
    if (hydrateParam === 'true') {
      items = await Promise.all(items.map(async (item) => {
        const hydratedItem: Record<string, unknown> = { ...item };

        // Hydrate message
        try {
          const message = await api.get(item.messageId as unknown as ElementId);
          if (message && message.type === 'message') {
            const typedMessage = message as Message;
            // Get content preview
            let contentPreview = '';
            if (typedMessage.contentRef) {
              const contentDoc = await api.get(typedMessage.contentRef as unknown as ElementId);
              if (contentDoc && contentDoc.type === 'document') {
                const typedDoc = contentDoc as Document;
                contentPreview = typeof typedDoc.content === 'string'
                  ? typedDoc.content.substring(0, 100)
                  : '';
              }
            }
            hydratedItem.message = {
              id: message.id,
              sender: typedMessage.sender,
              contentRef: typedMessage.contentRef,
              contentPreview,
              createdAt: message.createdAt,
            };
          }
        } catch {
          // Message might be deleted
        }

        // Hydrate channel
        try {
          const channel = await api.get(item.channelId as unknown as ElementId);
          if (channel && channel.type === 'channel') {
            const typedChannel = channel as Channel;
            hydratedItem.channel = {
              id: channel.id,
              name: typedChannel.name,
              channelType: typedChannel.channelType,
            };
          }
        } catch {
          // Channel might be deleted
        }

        // Hydrate recipient entity
        try {
          const recipient = await api.get(item.recipientId as unknown as ElementId);
          if (recipient && recipient.type === 'entity') {
            hydratedItem.recipient = recipient;
          }
        } catch {
          // Recipient might be deleted
        }

        // Hydrate sender entity (from message)
        if (hydratedItem.message && (hydratedItem.message as { sender?: string }).sender) {
          try {
            const sender = await api.get((hydratedItem.message as { sender: string }).sender as unknown as ElementId);
            if (sender && sender.type === 'entity') {
              hydratedItem.sender = sender;
            }
          } catch {
            // Sender might be deleted
          }
        }

        return hydratedItem;
      }));
    }

    return c.json({
      items,
      total,
      offset,
      limit,
      hasMore: offset + items.length < total,
    });
  } catch (error) {
    console.error('[elemental] Failed to get global inbox:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get global inbox' } }, 500);
  }
});

// GET /api/inbox/:itemId - Get single inbox item
app.get('/api/inbox/:itemId', async (c) => {
  try {
    const itemId = c.req.param('itemId');
    const item = inboxService.getInboxItem(itemId);

    if (!item) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Inbox item not found' } }, 404);
    }

    return c.json(item);
  } catch (error) {
    console.error('[elemental] Failed to get inbox item:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get inbox item' } }, 500);
  }
});

// ============================================================================
// Entity Hierarchy Endpoints
// ============================================================================

// GET /api/entities/:id/reports - Get direct reports for an entity
app.get('/api/entities/:id/reports', async (c) => {
  try {
    const id = c.req.param('id') as EntityId;

    // Verify entity exists
    const entity = await api.get(id as unknown as ElementId);
    if (!entity || entity.type !== 'entity') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Entity not found' } }, 404);
    }

    // Get all entities and filter for direct reports
    const allEntities = await api.list({ type: 'entity' }) as Entity[];
    const reports = getDirectReports(allEntities, id);

    return c.json(reports);
  } catch (error) {
    console.error('[elemental] Failed to get entity reports:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get entity reports' } }, 500);
  }
});

// GET /api/entities/:id/chain - Get management chain for an entity
app.get('/api/entities/:id/chain', async (c) => {
  try {
    const id = c.req.param('id') as EntityId;

    // Verify entity exists
    const entity = await api.get(id as unknown as ElementId);
    if (!entity || entity.type !== 'entity') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Entity not found' } }, 404);
    }

    // Load all entities for chain lookup
    const allEntities = await api.list({ type: 'entity' }) as Entity[];

    // Create a sync getEntity function for chain lookup
    const getEntityById = (entityId: EntityId): Entity | null => {
      return allEntities.find(e => (e.id as string) === (entityId as string)) || null;
    };

    // Get the management chain
    const chain = getManagementChain(entity as Entity, getEntityById);

    return c.json(chain);
  } catch (error) {
    console.error('[elemental] Failed to get management chain:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get management chain' } }, 500);
  }
});

// PATCH /api/entities/:id/manager - Set or clear manager for an entity
app.patch('/api/entities/:id/manager', async (c) => {
  try {
    const id = c.req.param('id') as EntityId;
    const body = await c.req.json<{
      managerId: string | null;
    }>();

    // Verify entity exists
    const entity = await api.get(id as unknown as ElementId);
    if (!entity || entity.type !== 'entity') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Entity not found' } }, 404);
    }

    // If setting a manager (not clearing)
    if (body.managerId !== null) {
      // Verify manager exists
      const manager = await api.get(body.managerId as unknown as ElementId);
      if (!manager || manager.type !== 'entity') {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Manager entity not found' } }, 404);
      }

      // Check for self-assignment
      if (body.managerId === id) {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Entity cannot be its own manager' } }, 400);
      }

      // Check for cycles using detectReportingCycle
      const allEntities = await api.list({ type: 'entity' }) as Entity[];

      // Create a getEntity function for cycle detection
      const getEntityForCycle = (entityId: EntityId): Entity | null => {
        return allEntities.find(e => (e.id as string) === (entityId as string)) || null;
      };

      // Check if setting this manager would create a cycle
      const cycleResult = detectReportingCycle(id, body.managerId as EntityId, getEntityForCycle);
      if (cycleResult.hasCycle) {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Setting this manager would create a reporting cycle' } }, 400);
      }
    }

    // Update the entity with new reportsTo value
    const updates: Record<string, unknown> = {
      reportsTo: body.managerId as EntityId | null,
    };

    const updated = await api.update(id as unknown as ElementId, updates);
    return c.json(updated);
  } catch (error) {
    console.error('[elemental] Failed to set entity manager:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to set entity manager';
    return c.json({ error: { code: 'INTERNAL_ERROR', message: errorMessage } }, 500);
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

// POST /api/dependencies - Create a dependency
app.post('/api/dependencies', async (c) => {
  try {
    const body = await c.req.json<{
      sourceId: string;
      targetId: string;
      type: string;
      metadata?: Record<string, unknown>;
      actor?: string;
    }>();

    // Validate required fields
    if (!body.sourceId || !body.targetId || !body.type) {
      return c.json(
        { error: { code: 'VALIDATION_ERROR', message: 'sourceId, targetId, and type are required' } },
        400
      );
    }

    const dependency = await api.addDependency({
      sourceId: body.sourceId as ElementId,
      targetId: body.targetId as ElementId,
      type: body.type as 'blocks' | 'parent-child' | 'awaits' | 'relates-to' | 'references' | 'supersedes' | 'duplicates' | 'caused-by' | 'validates' | 'authored-by' | 'assigned-to' | 'approved-by' | 'replies-to',
      metadata: body.metadata,
      actor: body.actor as EntityId | undefined,
    });

    // Events are automatically recorded in the database by addDependency
    // and will be picked up by the event broadcaster's polling mechanism

    return c.json(dependency, 201);
  } catch (error) {
    const errorObj = error as { code?: string; message?: string; name?: string };
    // Handle cycle detection
    if (errorObj.code === 'CYCLE_DETECTED') {
      return c.json(
        { error: { code: 'CYCLE_DETECTED', message: errorObj.message || 'Adding this dependency would create a cycle' } },
        400
      );
    }
    // Handle duplicate dependency
    if (errorObj.code === 'DUPLICATE_DEPENDENCY' || errorObj.name === 'ConflictError') {
      return c.json(
        { error: { code: 'CONFLICT', message: errorObj.message || 'Dependency already exists' } },
        409
      );
    }
    // Handle not found
    if (errorObj.code === 'NOT_FOUND' || errorObj.name === 'NotFoundError') {
      return c.json(
        { error: { code: 'NOT_FOUND', message: errorObj.message || 'Source or target element not found' } },
        404
      );
    }
    // Handle validation errors
    if (errorObj.code === 'VALIDATION_ERROR' || errorObj.code === 'INVALID_DEPENDENCY_TYPE' || errorObj.name === 'ValidationError') {
      return c.json(
        { error: { code: 'VALIDATION_ERROR', message: errorObj.message || 'Invalid dependency type' } },
        400
      );
    }
    console.error('[elemental] Failed to create dependency:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to create dependency' } }, 500);
  }
});

// DELETE /api/dependencies/:sourceId/:targetId/:type - Remove a dependency
app.delete('/api/dependencies/:sourceId/:targetId/:type', async (c) => {
  try {
    const sourceId = c.req.param('sourceId') as ElementId;
    const targetId = c.req.param('targetId') as ElementId;
    const type = c.req.param('type') as 'blocks' | 'parent-child' | 'awaits' | 'relates-to' | 'references' | 'supersedes' | 'duplicates' | 'caused-by' | 'validates' | 'authored-by' | 'assigned-to' | 'approved-by' | 'replies-to';
    const actor = c.req.query('actor') as EntityId | undefined;

    await api.removeDependency(sourceId, targetId, type, actor);

    // Events are automatically recorded in the database by removeDependency
    // and will be picked up by the event broadcaster's polling mechanism

    return c.json({ success: true, message: 'Dependency removed' });
  } catch (error) {
    const errorObj = error as { code?: string; message?: string; name?: string };
    if (errorObj.code === 'NOT_FOUND' || errorObj.name === 'NotFoundError') {
      return c.json(
        { error: { code: 'NOT_FOUND', message: errorObj.message || 'Dependency not found' } },
        404
      );
    }
    console.error('[elemental] Failed to remove dependency:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to remove dependency' } }, 500);
  }
});

// ============================================================================
// Channels Endpoints
// ============================================================================

app.get('/api/channels', async (c) => {
  try {
    const url = new URL(c.req.url);

    // Parse pagination and filter parameters
    const limitParam = url.searchParams.get('limit');
    const offsetParam = url.searchParams.get('offset');
    const orderByParam = url.searchParams.get('orderBy');
    const orderDirParam = url.searchParams.get('orderDir');
    const searchParam = url.searchParams.get('search');
    const channelTypeParam = url.searchParams.get('channelType');

    // Build filter
    const filter: Record<string, unknown> = {
      type: 'channel',
    };

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

    // Get paginated results
    const result = await api.listPaginated(filter as Parameters<typeof api.listPaginated>[0]);

    // Apply client-side filtering for search and channel type
    let filteredItems = result.items;

    if (channelTypeParam && channelTypeParam !== 'all') {
      filteredItems = filteredItems.filter((ch) => {
        const channel = ch as unknown as { channelType: string };
        return channel.channelType === channelTypeParam;
      });
    }

    if (searchParam) {
      const query = searchParam.toLowerCase();
      filteredItems = filteredItems.filter((ch) => {
        const channel = ch as unknown as { name: string; id: string; tags?: string[] };
        return (
          channel.name.toLowerCase().includes(query) ||
          channel.id.toLowerCase().includes(query) ||
          (channel.tags || []).some((tag) => tag.toLowerCase().includes(query))
        );
      });
    }

    // Return paginated response format
    return c.json({
      items: filteredItems,
      total: result.total,
      offset: result.offset,
      limit: result.limit,
      hasMore: result.hasMore,
    });
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

    // Optionally hydrate content and attachments
    if (hydrateContent) {
      const hydratedMessages = await Promise.all(
        messages.map(async (msg) => {
          const message = msg as { id: ElementId; contentRef?: string };
          let result = { ...msg } as Record<string, unknown>;

          // Hydrate content
          if (message.contentRef) {
            const content = await api.get(message.contentRef as ElementId);
            if (content && content.type === 'document') {
              result._content = (content as { content?: string }).content;
            }
          }

          // Hydrate attachments (documents referenced by this message)
          const dependencies = await api.getDependencies(message.id);
          const attachmentDeps = dependencies.filter(
            (dep) => dep.sourceId === message.id && dep.type === 'references'
          );
          if (attachmentDeps.length > 0) {
            const attachments = await Promise.all(
              attachmentDeps.map(async (dep) => {
                const doc = await api.get(dep.targetId as ElementId);
                if (doc && doc.type === 'document') {
                  return doc;
                }
                return null;
              })
            );
            result._attachments = attachments.filter(Boolean);
          }

          return result;
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

// Get channel members (with optional hydration)
app.get('/api/channels/:id/members', async (c) => {
  try {
    const id = c.req.param('id') as ElementId;
    const url = new URL(c.req.url);
    const hydrate = url.searchParams.get('hydrate') === 'true';

    // Verify channel exists
    const channel = await api.get(id);
    if (!channel || channel.type !== 'channel') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Channel not found' } }, 404);
    }

    const channelData = channel as Channel;
    const memberIds = channelData.members || [];

    // Optionally hydrate member entities
    if (hydrate) {
      const hydratedMembers = await Promise.all(
        memberIds.map(async (memberId: string) => {
          const entity = await api.get(memberId as unknown as ElementId);
          return entity || { id: memberId, name: memberId, notFound: true };
        })
      );
      return c.json({
        members: hydratedMembers,
        permissions: channelData.permissions,
        channelType: channelData.channelType,
      });
    }

    return c.json({
      members: memberIds,
      permissions: channelData.permissions,
      channelType: channelData.channelType,
    });
  } catch (error) {
    console.error('[elemental] Failed to get channel members:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get channel members' } }, 500);
  }
});

// Add member to channel
app.post('/api/channels/:id/members', async (c) => {
  try {
    const id = c.req.param('id') as ElementId;
    const body = await c.req.json() as {
      entityId: string;
      actor: string;
    };

    // Validate required fields
    if (!body.entityId || typeof body.entityId !== 'string') {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'entityId is required' } }, 400);
    }
    if (!body.actor || typeof body.actor !== 'string') {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'actor is required' } }, 400);
    }

    const result = await api.addChannelMember(
      id,
      body.entityId as EntityId,
      { actor: body.actor as EntityId }
    );

    return c.json(result);
  } catch (error) {
    const err = error as { code?: string; message?: string };
    if (err.code === 'NOT_FOUND') {
      return c.json({ error: { code: 'NOT_FOUND', message: err.message || 'Channel or entity not found' } }, 404);
    }
    if (err.code === 'IMMUTABLE') {
      return c.json({ error: { code: 'FORBIDDEN', message: err.message || 'Cannot modify direct channel membership' } }, 403);
    }
    if (err.code === 'MEMBER_REQUIRED') {
      return c.json({ error: { code: 'FORBIDDEN', message: err.message || 'No permission to modify members' } }, 403);
    }
    console.error('[elemental] Failed to add channel member:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to add channel member' } }, 500);
  }
});

// Remove member from channel
app.delete('/api/channels/:id/members/:entityId', async (c) => {
  try {
    const id = c.req.param('id') as ElementId;
    const entityId = c.req.param('entityId') as EntityId;
    const url = new URL(c.req.url);
    const actor = url.searchParams.get('actor');

    // Validate actor
    if (!actor) {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'actor query parameter is required' } }, 400);
    }

    const result = await api.removeChannelMember(
      id,
      entityId,
      { actor: actor as EntityId }
    );

    return c.json(result);
  } catch (error) {
    const err = error as { code?: string; message?: string };
    if (err.code === 'NOT_FOUND') {
      return c.json({ error: { code: 'NOT_FOUND', message: err.message || 'Channel not found' } }, 404);
    }
    if (err.code === 'IMMUTABLE') {
      return c.json({ error: { code: 'FORBIDDEN', message: err.message || 'Cannot modify direct channel membership' } }, 403);
    }
    if (err.code === 'MEMBER_REQUIRED') {
      return c.json({ error: { code: 'FORBIDDEN', message: err.message || 'No permission to modify members' } }, 403);
    }
    console.error('[elemental] Failed to remove channel member:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to remove channel member' } }, 500);
  }
});

// Leave channel (self-removal)
app.post('/api/channels/:id/leave', async (c) => {
  try {
    const id = c.req.param('id') as ElementId;
    const body = await c.req.json() as {
      actor: string;
    };

    // Validate actor
    if (!body.actor || typeof body.actor !== 'string') {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'actor is required' } }, 400);
    }

    const result = await api.leaveChannel(id, body.actor as EntityId);

    return c.json(result);
  } catch (error) {
    const err = error as { code?: string; message?: string };
    if (err.code === 'NOT_FOUND') {
      return c.json({ error: { code: 'NOT_FOUND', message: err.message || 'Channel not found' } }, 404);
    }
    if (err.code === 'IMMUTABLE') {
      return c.json({ error: { code: 'FORBIDDEN', message: err.message || 'Cannot leave direct channel' } }, 403);
    }
    if (err.code === 'MEMBER_REQUIRED') {
      return c.json({ error: { code: 'FORBIDDEN', message: err.message || 'Not a member of this channel' } }, 403);
    }
    console.error('[elemental] Failed to leave channel:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to leave channel' } }, 500);
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

    // Handle attachments if provided
    const attachments: Element[] = [];
    if (body.attachmentIds && Array.isArray(body.attachmentIds)) {
      for (const docId of body.attachmentIds) {
        // Verify document exists
        const doc = await api.get(docId as ElementId);
        if (!doc || doc.type !== 'document') {
          return c.json({ error: { code: 'NOT_FOUND', message: `Document ${docId} not found` } }, 404);
        }
        // Create references dependency from message to document
        await api.addDependency({
          sourceId: createdMessage.id as ElementId,
          targetId: docId as ElementId,
          type: 'references',
          actor: body.sender as EntityId,
        });
        attachments.push(doc);
      }
    }

    // TB89: Add inbox items for channel members (except sender)
    // For direct channels, all members get a 'direct' notification
    // For group channels, only @mentioned users get notifications
    const typedChannel = channel as Channel;
    const senderId = body.sender as EntityId;
    const messageId = createdMessage.id as string;
    const channelIdStr = body.channelId as string;

    // Track entities that have already received inbox items (to avoid duplicates)
    const notifiedEntities = new Set<string>();

    // For direct channels: notify all members except sender
    if (typedChannel.channelType === 'direct') {
      for (const memberId of typedChannel.members) {
        if (memberId !== senderId && !notifiedEntities.has(memberId)) {
          try {
            inboxService.addToInbox({
              recipientId: memberId,
              messageId: messageId as any,
              channelId: channelIdStr as any,
              sourceType: 'direct',
              createdBy: senderId,
            });
            notifiedEntities.add(memberId);

            // Broadcast inbox event for real-time updates
            broadcastInboxEvent(
              `inbox-${memberId}-${messageId}`,
              memberId,
              'created',
              null,
              { recipientId: memberId, messageId, channelId: channelIdStr, sourceType: 'direct' },
              senderId
            );
          } catch (error) {
            // Ignore duplicate inbox errors (e.g., if item already exists)
            if ((error as { code?: string }).code !== 'ALREADY_EXISTS') {
              console.error(`[elemental] Failed to create inbox item for ${memberId}:`, error);
            }
          }
        }
      }
    }

    // Parse @mentions from message content and add inbox items
    // Match patterns like @el-abc123 or @entity-name (entity names in the system)
    const mentionPattern = /@(el-[a-z0-9]+)/gi;
    const mentions = body.content.match(mentionPattern) || [];

    for (const mention of mentions) {
      // Extract the entity ID from the mention (remove the @ prefix)
      const mentionedId = mention.substring(1) as EntityId;

      // Skip if it's the sender mentioning themselves or already notified
      if (mentionedId === senderId || notifiedEntities.has(mentionedId)) {
        continue;
      }

      // Verify the mentioned entity exists
      try {
        const mentionedEntity = await api.get(mentionedId as unknown as ElementId);
        if (mentionedEntity && mentionedEntity.type === 'entity') {
          inboxService.addToInbox({
            recipientId: mentionedId,
            messageId: messageId as any,
            channelId: channelIdStr as any,
            sourceType: 'mention',
            createdBy: senderId,
          });
          notifiedEntities.add(mentionedId);

          // Broadcast inbox event for real-time updates
          broadcastInboxEvent(
            `inbox-${mentionedId}-${messageId}`,
            mentionedId,
            'created',
            null,
            { recipientId: mentionedId, messageId, channelId: channelIdStr, sourceType: 'mention' },
            senderId
          );
        }
      } catch (error) {
        // Ignore errors for mentions (entity might not exist or duplicate inbox)
        if ((error as { code?: string }).code !== 'ALREADY_EXISTS') {
          console.error(`[elemental] Failed to process mention ${mentionedId}:`, error);
        }
      }
    }

    // Return the message with content and attachments hydrated
    return c.json({
      ...createdMessage,
      _content: body.content,
      _attachments: attachments,
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

/**
 * GET /api/messages/search
 * Search messages by content across all channels or within a specific channel (TB103)
 *
 * Query params:
 * - q: Search query (required)
 * - channelId: Optional channel ID to limit search to
 * - limit: Max number of results (default: 20)
 *
 * NOTE: This route must come BEFORE /api/messages/:id/replies to avoid route matching issues
 */
app.get('/api/messages/search', async (c) => {
  try {
    const url = new URL(c.req.url);
    const query = url.searchParams.get('q');
    const channelId = url.searchParams.get('channelId');
    const limitParam = url.searchParams.get('limit');
    const limit = limitParam ? parseInt(limitParam, 10) : 20;

    if (!query || query.trim().length === 0) {
      return c.json({ results: [], query: '' });
    }

    const searchQuery = query.trim().toLowerCase();

    // Get all messages (with reasonable limit to avoid performance issues)
    const filter: Record<string, unknown> = {
      type: 'message',
      limit: 1000,
      orderBy: 'created_at',
      orderDir: 'desc',
    };

    if (channelId) {
      filter.channelId = channelId;
    }

    const allMessages = await api.list(filter as Parameters<typeof api.list>[0]);

    // Filter messages with matching channelId if specified
    let filteredMessages = allMessages;
    if (channelId) {
      filteredMessages = allMessages.filter((msg) => {
        const message = msg as { channelId?: string };
        return message.channelId === channelId;
      });
    }

    // Hydrate content and search
    interface MessageSearchResult {
      id: string;
      channelId: string;
      sender: string;
      content: string;
      snippet: string;
      createdAt: string;
      threadId: string | null;
    }

    const results: MessageSearchResult[] = [];

    for (const msg of filteredMessages) {
      const message = msg as {
        id: string;
        channelId?: string;
        sender?: string;
        contentRef?: string;
        createdAt: string;
        threadId?: string;
      };

      // Hydrate content
      let content = '';
      if (message.contentRef) {
        const contentDoc = await api.get(message.contentRef as ElementId);
        if (contentDoc && contentDoc.type === 'document') {
          content = (contentDoc as { content?: string }).content || '';
        }
      }

      const contentLower = content.toLowerCase();

      if (contentLower.includes(searchQuery)) {
        // Generate snippet with surrounding context
        const matchIndex = contentLower.indexOf(searchQuery);
        const snippetStart = Math.max(0, matchIndex - 50);
        const snippetEnd = Math.min(content.length, matchIndex + searchQuery.length + 50);
        let snippetText = content.slice(snippetStart, snippetEnd);

        // Add ellipsis if truncated
        if (snippetStart > 0) snippetText = '...' + snippetText;
        if (snippetEnd < content.length) snippetText = snippetText + '...';

        // Clean up markdown/HTML for display
        snippetText = snippetText
          .replace(/#{1,6}\s*/g, '') // Remove heading markers
          .replace(/\*\*/g, '') // Remove bold markers
          .replace(/\*/g, '') // Remove italic markers
          .replace(/`/g, '') // Remove code markers
          .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Remove link syntax
          .replace(/<[^>]+>/g, '') // Remove HTML tags
          .replace(/!\[([^\]]*)\]\([^)]+\)/g, '') // Remove image syntax
          .replace(/\n+/g, ' ') // Replace newlines with spaces
          .trim();

        results.push({
          id: message.id,
          channelId: message.channelId || '',
          sender: message.sender || '',
          content,
          snippet: snippetText,
          createdAt: message.createdAt,
          threadId: message.threadId || null,
        });

        // Stop when we have enough results
        if (results.length >= limit) break;
      }
    }

    return c.json({ results, query: query.trim() });
  } catch (error) {
    console.error('[elemental] Failed to search messages:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to search messages' } }, 500);
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
    const paginatedParam = url.searchParams.get('paginated');

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

    const limit = limitParam ? parseInt(limitParam, 10) : 100;
    const offset = offsetParam ? parseInt(offsetParam, 10) : 0;

    filter.limit = limit;
    filter.offset = offset;

    const events = await api.listEvents(filter as Parameters<typeof api.listEvents>[0]);

    // If paginated=true, return paginated response format with accurate total count
    if (paginatedParam === 'true') {
      // Get accurate total count (excluding limit/offset for count query)
      const countFilter = { ...filter };
      delete countFilter.limit;
      delete countFilter.offset;
      const total = await api.countEvents(countFilter as Parameters<typeof api.countEvents>[0]);
      const hasMore = offset + events.length < total;
      return c.json({
        items: events,
        total: total,
        offset: offset,
        limit: limit,
        hasMore: hasMore,
      });
    }

    return c.json(events);
  } catch (error) {
    console.error('[elemental] Failed to get events:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get events' } }, 500);
  }
});

// Get count of events matching filter (for eager loading pagination)
app.get('/api/events/count', async (c) => {
  try {
    const url = new URL(c.req.url);
    const eventType = url.searchParams.get('eventType');
    const actor = url.searchParams.get('actor');
    const elementId = url.searchParams.get('elementId');
    const after = url.searchParams.get('after');
    const before = url.searchParams.get('before');

    const filter: Record<string, unknown> = {};

    if (eventType) {
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

    const count = await api.countEvents(filter as Parameters<typeof api.countEvents>[0]);
    return c.json({ count });
  } catch (error) {
    console.error('[elemental] Failed to count events:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to count events' } }, 500);
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

    // Parse pagination and filter parameters
    const limitParam = url.searchParams.get('limit');
    const offsetParam = url.searchParams.get('offset');
    const orderByParam = url.searchParams.get('orderBy');
    const orderDirParam = url.searchParams.get('orderDir');
    const searchParam = url.searchParams.get('search');

    // Build filter
    const filter: Record<string, unknown> = {
      type: 'document',
    };

    const requestedLimit = limitParam ? parseInt(limitParam, 10) : 50;
    const requestedOffset = offsetParam ? parseInt(offsetParam, 10) : 0;

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

    // If search param is provided, use the search API for better results
    if (searchParam && searchParam.trim()) {
      const searchResults = await api.search(searchParam.trim(), filter as Parameters<typeof api.search>[1]);
      const slicedResults = searchResults.slice(requestedOffset, requestedOffset + requestedLimit);
      return c.json({
        items: slicedResults,
        total: searchResults.length,
        offset: requestedOffset,
        limit: requestedLimit,
        hasMore: requestedOffset + requestedLimit < searchResults.length,
      });
    }

    // Standard paginated query when no search
    filter.limit = requestedLimit;
    filter.offset = requestedOffset;

    const result = await api.listPaginated(filter as Parameters<typeof api.listPaginated>[0]);

    // Return paginated response format
    return c.json({
      items: result.items,
      total: result.total,
      offset: result.offset,
      limit: result.limit,
      hasMore: result.hasMore,
    });
  } catch (error) {
    console.error('[elemental] Failed to get documents:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get documents' } }, 500);
  }
});

/**
 * GET /api/documents/search
 * Search documents by title and content with highlighted snippets (TB95)
 *
 * Query params:
 * - q: Search query (required)
 * - limit: Max number of results (default: 20)
 */
app.get('/api/documents/search', async (c) => {
  try {
    const url = new URL(c.req.url);
    const query = url.searchParams.get('q');
    const limitParam = url.searchParams.get('limit');
    const limit = limitParam ? parseInt(limitParam, 10) : 20;

    if (!query || query.trim().length === 0) {
      return c.json({ results: [] });
    }

    const searchQuery = query.trim().toLowerCase();

    // Get all documents (with reasonable limit to avoid performance issues)
    const result = await api.listPaginated({
      type: 'document',
      limit: 1000,
      orderBy: 'updated_at',
      orderDir: 'desc',
    } as Parameters<typeof api.listPaginated>[0]);

    // Search through documents
    interface SearchResult {
      id: string;
      title: string;
      contentType: string;
      matchType: 'title' | 'content' | 'both';
      snippet?: string;
      updatedAt: string;
    }

    const results: SearchResult[] = [];

    for (const item of result.items) {
      const doc = item as unknown as { id: string; title: string; content?: string; contentType: string; updatedAt: string };
      const titleLower = (doc.title || '').toLowerCase();
      const contentLower = (doc.content || '').toLowerCase();

      const titleMatch = titleLower.includes(searchQuery);
      const contentMatch = contentLower.includes(searchQuery);

      if (titleMatch || contentMatch) {
        let snippet: string | undefined;

        // Generate content snippet if there's a content match
        if (contentMatch && doc.content) {
          const matchIndex = contentLower.indexOf(searchQuery);
          // Get surrounding context (50 chars before and after)
          const snippetStart = Math.max(0, matchIndex - 50);
          const snippetEnd = Math.min(doc.content.length, matchIndex + searchQuery.length + 50);
          let snippetText = doc.content.slice(snippetStart, snippetEnd);

          // Add ellipsis if truncated
          if (snippetStart > 0) snippetText = '...' + snippetText;
          if (snippetEnd < doc.content.length) snippetText = snippetText + '...';

          // Clean up markdown/HTML for display
          snippetText = snippetText
            .replace(/#{1,6}\s*/g, '') // Remove heading markers
            .replace(/\*\*/g, '') // Remove bold markers
            .replace(/\*/g, '') // Remove italic markers
            .replace(/`/g, '') // Remove code markers
            .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Remove link syntax
            .replace(/<[^>]+>/g, '') // Remove HTML tags
            .replace(/\n+/g, ' ') // Replace newlines with spaces
            .trim();

          snippet = snippetText;
        }

        results.push({
          id: doc.id,
          title: doc.title || `Document ${doc.id}`,
          contentType: doc.contentType,
          matchType: titleMatch && contentMatch ? 'both' : (titleMatch ? 'title' : 'content'),
          snippet,
          updatedAt: doc.updatedAt,
        });

        // Stop when we have enough results
        if (results.length >= limit) break;
      }
    }

    return c.json({ results, query: query.trim() });
  } catch (error) {
    console.error('[elemental] Failed to search documents:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to search documents' } }, 500);
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
// Document Links Endpoints (TB53)
// ============================================================================

/**
 * GET /api/documents/:id/links
 * Returns documents linked from this document (outgoing) and documents linking to it (incoming)
 * Query params:
 *   - direction: 'outgoing' | 'incoming' | 'both' (default: 'both')
 */
app.get('/api/documents/:id/links', async (c) => {
  try {
    const documentId = c.req.param('id') as ElementId;
    const url = new URL(c.req.url);
    const direction = url.searchParams.get('direction') || 'both';

    // Verify document exists
    const doc = await api.get(documentId);
    if (!doc) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Document not found' } }, 404);
    }
    if (doc.type !== 'document') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Document not found' } }, 404);
    }

    // Fetch document details based on direction
    let outgoing: (typeof doc)[] = [];
    let incoming: (typeof doc)[] = [];

    if (direction === 'outgoing' || direction === 'both') {
      // Outgoing links: documents this document references (sourceId = this document)
      const outgoingDeps = await api.getDependencies(documentId, ['references']);
      const outgoingDocs = await Promise.all(
        outgoingDeps.map(async (dep) => {
          const linkedDoc = await api.get(dep.targetId as ElementId);
          if (linkedDoc && linkedDoc.type === 'document') {
            return linkedDoc;
          }
          return null;
        })
      );
      outgoing = outgoingDocs.filter(Boolean) as (typeof doc)[];
    }

    if (direction === 'incoming' || direction === 'both') {
      // Incoming links: documents that reference this document (targetId = this document)
      // Use getDependents to query by target_id
      const incomingDeps = await api.getDependents(documentId, ['references']);
      const incomingDocs = await Promise.all(
        incomingDeps.map(async (dep) => {
          const linkedDoc = await api.get(dep.sourceId as ElementId);
          if (linkedDoc && linkedDoc.type === 'document') {
            return linkedDoc;
          }
          return null;
        })
      );
      incoming = incomingDocs.filter(Boolean) as (typeof doc)[];
    }

    return c.json({ outgoing, incoming });
  } catch (error) {
    console.error('[elemental] Failed to get document links:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get document links' } }, 500);
  }
});

/**
 * POST /api/documents/:id/links
 * Creates a link from this document to another document
 * Body: { targetDocumentId: string, actor?: string }
 */
app.post('/api/documents/:id/links', async (c) => {
  try {
    const sourceId = c.req.param('id') as ElementId;
    const body = await c.req.json();

    // Validate target document ID
    if (!body.targetDocumentId || typeof body.targetDocumentId !== 'string') {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'targetDocumentId is required' } }, 400);
    }

    const targetId = body.targetDocumentId as ElementId;

    // Prevent self-reference
    if (sourceId === targetId) {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Cannot link a document to itself' } }, 400);
    }

    // Verify source document exists
    const sourceDoc = await api.get(sourceId);
    if (!sourceDoc) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Source document not found' } }, 404);
    }
    if (sourceDoc.type !== 'document') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Source document not found' } }, 404);
    }

    // Verify target document exists
    const targetDoc = await api.get(targetId);
    if (!targetDoc) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Target document not found' } }, 404);
    }
    if (targetDoc.type !== 'document') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Target document not found' } }, 404);
    }

    // Check if link already exists
    const existingDeps = await api.getDependencies(sourceId);
    const alreadyLinked = existingDeps.some(
      (dep) => dep.sourceId === sourceId && dep.targetId === targetId && dep.type === 'references'
    );
    if (alreadyLinked) {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Link already exists between these documents' } }, 400);
    }

    // Create the references dependency (source document references target document)
    await api.addDependency({
      sourceId,
      targetId,
      type: 'references',
      actor: (body.actor as EntityId) || ('el-0000' as EntityId),
    });

    return c.json({ sourceId, targetId, targetDocument: targetDoc }, 201);
  } catch (error) {
    console.error('[elemental] Failed to link documents:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to link documents' } }, 500);
  }
});

/**
 * DELETE /api/documents/:sourceId/links/:targetId
 * Removes a link between two documents
 */
app.delete('/api/documents/:sourceId/links/:targetId', async (c) => {
  try {
    const sourceId = c.req.param('sourceId') as ElementId;
    const targetId = c.req.param('targetId') as ElementId;

    // Verify source document exists
    const sourceDoc = await api.get(sourceId);
    if (!sourceDoc) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Source document not found' } }, 404);
    }
    if (sourceDoc.type !== 'document') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Source document not found' } }, 404);
    }

    // Find the link dependency
    const dependencies = await api.getDependencies(sourceId);
    const linkDep = dependencies.find(
      (dep) => dep.sourceId === sourceId && dep.targetId === targetId && dep.type === 'references'
    );

    if (!linkDep) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Link not found between these documents' } }, 404);
    }

    // Remove the dependency
    await api.removeDependency(sourceId, targetId, 'references');

    return c.json({ success: true, sourceId, targetId });
  } catch (error) {
    console.error('[elemental] Failed to remove document link:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to remove document link' } }, 500);
  }
});

// ============================================================================
// Document Comments Endpoints (TB98)
// ============================================================================

// Comment type for the comments table
interface CommentRow {
  [key: string]: unknown;  // Index signature for Row compatibility
  id: string;
  document_id: string;
  author_id: string;
  content: string;
  anchor: string;
  start_offset: number | null;
  end_offset: number | null;
  resolved: number;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/**
 * GET /api/documents/:id/comments
 * Returns all comments for a document
 * Query params:
 *   - includeResolved: 'true' to include resolved comments (default: false)
 */
app.get('/api/documents/:id/comments', async (c) => {
  try {
    const documentId = c.req.param('id') as ElementId;
    const url = new URL(c.req.url);
    const includeResolved = url.searchParams.get('includeResolved') === 'true';

    // Verify document exists
    const doc = await api.get(documentId);
    if (!doc) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Document not found' } }, 404);
    }
    if (doc.type !== 'document') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Document not found' } }, 404);
    }

    // Query comments from the database
    let query = `
      SELECT * FROM comments
      WHERE document_id = ? AND deleted_at IS NULL
    `;
    if (!includeResolved) {
      query += ' AND resolved = 0';
    }
    query += ' ORDER BY created_at ASC';

    const comments = storageBackend.query<CommentRow>(query, [documentId]);

    // Hydrate with author info
    const hydratedComments = await Promise.all(
      comments.map(async (comment) => {
        const author = await api.get(comment.author_id as ElementId);
        let resolvedByEntity = null;
        if (comment.resolved_by) {
          resolvedByEntity = await api.get(comment.resolved_by as ElementId);
        }

        return {
          id: comment.id,
          documentId: comment.document_id,
          author: author ? {
            id: author.id,
            name: (author as unknown as { name: string }).name,
            entityType: (author as unknown as { entityType: string }).entityType,
          } : { id: comment.author_id, name: 'Unknown', entityType: 'unknown' },
          content: comment.content,
          anchor: JSON.parse(comment.anchor),
          startOffset: comment.start_offset,
          endOffset: comment.end_offset,
          resolved: comment.resolved === 1,
          resolvedBy: resolvedByEntity ? {
            id: resolvedByEntity.id,
            name: (resolvedByEntity as unknown as { name: string }).name,
          } : null,
          resolvedAt: comment.resolved_at,
          createdAt: comment.created_at,
          updatedAt: comment.updated_at,
        };
      })
    );

    return c.json({
      comments: hydratedComments,
      total: hydratedComments.length,
    });
  } catch (error) {
    console.error('[elemental] Failed to get document comments:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get document comments' } }, 500);
  }
});

/**
 * POST /api/documents/:id/comments
 * Creates a new comment on a document
 * Body: {
 *   authorId: string,
 *   content: string,
 *   anchor: { hash: string, prefix: string, text: string, suffix: string },
 *   startOffset?: number,
 *   endOffset?: number
 * }
 */
app.post('/api/documents/:id/comments', async (c) => {
  try {
    const documentId = c.req.param('id') as ElementId;
    const body = await c.req.json();

    // Validate required fields
    if (!body.authorId || typeof body.authorId !== 'string') {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'authorId is required' } }, 400);
    }
    if (!body.content || typeof body.content !== 'string' || body.content.trim().length === 0) {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'content is required' } }, 400);
    }
    if (!body.anchor || typeof body.anchor !== 'object') {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'anchor is required' } }, 400);
    }
    if (!body.anchor.hash || !body.anchor.text) {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'anchor must include hash and text' } }, 400);
    }

    // Verify document exists
    const doc = await api.get(documentId);
    if (!doc) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Document not found' } }, 404);
    }
    if (doc.type !== 'document') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Document not found' } }, 404);
    }

    // Verify author exists
    const author = await api.get(body.authorId as ElementId);
    if (!author) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Author not found' } }, 404);
    }
    if (author.type !== 'entity') {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'authorId must be an entity' } }, 400);
    }

    // Generate comment ID
    const commentId = `cmt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();

    // Insert comment
    storageBackend.run(`
      INSERT INTO comments (id, document_id, author_id, content, anchor, start_offset, end_offset, resolved, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
    `, [
      commentId,
      documentId,
      body.authorId,
      body.content.trim(),
      JSON.stringify(body.anchor),
      body.startOffset ?? null,
      body.endOffset ?? null,
      now,
      now,
    ]);

    return c.json({
      id: commentId,
      documentId,
      author: {
        id: author.id,
        name: (author as unknown as { name: string }).name,
        entityType: (author as unknown as { entityType: string }).entityType,
      },
      content: body.content.trim(),
      anchor: body.anchor,
      startOffset: body.startOffset ?? null,
      endOffset: body.endOffset ?? null,
      resolved: false,
      resolvedBy: null,
      resolvedAt: null,
      createdAt: now,
      updatedAt: now,
    }, 201);
  } catch (error) {
    console.error('[elemental] Failed to create comment:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to create comment' } }, 500);
  }
});

/**
 * PATCH /api/comments/:id
 * Updates a comment (content, resolved status)
 * Body: {
 *   content?: string,
 *   resolved?: boolean,
 *   resolvedBy?: string
 * }
 */
app.patch('/api/comments/:id', async (c) => {
  try {
    const commentId = c.req.param('id');
    const body = await c.req.json();

    // Find existing comment
    const existing = storageBackend.query<CommentRow>(
      'SELECT * FROM comments WHERE id = ? AND deleted_at IS NULL',
      [commentId]
    );

    if (existing.length === 0) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Comment not found' } }, 404);
    }

    const now = new Date().toISOString();

    // Build update query
    const updates: string[] = [];
    const values: (string | number | null)[] = [];

    if (body.content !== undefined) {
      if (typeof body.content !== 'string' || body.content.trim().length === 0) {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: 'content cannot be empty' } }, 400);
      }
      updates.push('content = ?');
      values.push(body.content.trim());
    }

    if (body.resolved !== undefined) {
      updates.push('resolved = ?');
      values.push(body.resolved ? 1 : 0);

      if (body.resolved) {
        // Verify resolver exists
        if (body.resolvedBy) {
          const resolver = await api.get(body.resolvedBy as ElementId);
          if (!resolver || resolver.type !== 'entity') {
            return c.json({ error: { code: 'NOT_FOUND', message: 'Resolver entity not found' } }, 404);
          }
          updates.push('resolved_by = ?');
          values.push(body.resolvedBy);
        }
        updates.push('resolved_at = ?');
        values.push(now);
      } else {
        // Unresolving
        updates.push('resolved_by = NULL');
        updates.push('resolved_at = NULL');
      }
    }

    if (updates.length === 0) {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'No valid fields to update' } }, 400);
    }

    updates.push('updated_at = ?');
    values.push(now);
    values.push(commentId);

    storageBackend.run(
      `UPDATE comments SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    // Fetch updated comment
    const updated = storageBackend.query<CommentRow>(
      'SELECT * FROM comments WHERE id = ?',
      [commentId]
    )[0];

    // Hydrate with author info
    const author = await api.get(updated.author_id as ElementId);
    let resolvedByEntity = null;
    if (updated.resolved_by) {
      resolvedByEntity = await api.get(updated.resolved_by as ElementId);
    }

    return c.json({
      id: updated.id,
      documentId: updated.document_id,
      author: author ? {
        id: author.id,
        name: (author as unknown as { name: string }).name,
        entityType: (author as unknown as { entityType: string }).entityType,
      } : { id: updated.author_id, name: 'Unknown', entityType: 'unknown' },
      content: updated.content,
      anchor: JSON.parse(updated.anchor),
      startOffset: updated.start_offset,
      endOffset: updated.end_offset,
      resolved: updated.resolved === 1,
      resolvedBy: resolvedByEntity ? {
        id: resolvedByEntity.id,
        name: (resolvedByEntity as unknown as { name: string }).name,
      } : null,
      resolvedAt: updated.resolved_at,
      createdAt: updated.created_at,
      updatedAt: updated.updated_at,
    });
  } catch (error) {
    console.error('[elemental] Failed to update comment:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to update comment' } }, 500);
  }
});

/**
 * DELETE /api/comments/:id
 * Soft-deletes a comment
 */
app.delete('/api/comments/:id', async (c) => {
  try {
    const commentId = c.req.param('id');

    // Find existing comment
    const existing = storageBackend.query<CommentRow>(
      'SELECT * FROM comments WHERE id = ? AND deleted_at IS NULL',
      [commentId]
    );

    if (existing.length === 0) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Comment not found' } }, 404);
    }

    const now = new Date().toISOString();

    // Soft delete
    storageBackend.run(
      'UPDATE comments SET deleted_at = ?, updated_at = ? WHERE id = ?',
      [now, now, commentId]
    );

    return c.json({ success: true, id: commentId });
  } catch (error) {
    console.error('[elemental] Failed to delete comment:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to delete comment' } }, 500);
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
    const hydrateProgress = url.searchParams.get('hydrate.progress') === 'true';

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

    // Optionally hydrate progress for all plans (TB86)
    if (hydrateProgress) {
      const plansWithProgress = await Promise.all(
        plans.map(async (plan) => {
          const progress = await api.getPlanProgress(plan.id as ElementId);
          return { ...plan, _progress: progress };
        })
      );
      return c.json(plansWithProgress);
    }

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

// Add task to plan
app.post('/api/plans/:id/tasks', async (c) => {
  try {
    const planId = c.req.param('id') as ElementId;
    const body = await c.req.json();

    // Validate required fields
    if (!body.taskId || typeof body.taskId !== 'string') {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'taskId is required and must be a string' } }, 400);
    }

    // Verify plan exists
    const plan = await api.get(planId);
    if (!plan) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Plan not found' } }, 404);
    }
    if (plan.type !== 'plan') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Plan not found' } }, 404);
    }

    // Verify task exists
    const task = await api.get(body.taskId as ElementId);
    if (!task) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Task not found' } }, 404);
    }
    if (task.type !== 'task') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Task not found' } }, 404);
    }

    // Add the task to the plan
    const dependency = await api.addTaskToPlan(
      body.taskId as ElementId,
      planId,
      { actor: body.actor as EntityId | undefined }
    );

    return c.json(dependency, 201);
  } catch (error) {
    if ((error as { code?: string }).code === 'ALREADY_EXISTS') {
      return c.json({ error: { code: 'ALREADY_EXISTS', message: 'Task is already in this plan' } }, 409);
    }
    if ((error as { code?: string }).code === 'VALIDATION_ERROR') {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: (error as Error).message } }, 400);
    }
    console.error('[elemental] Failed to add task to plan:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to add task to plan' } }, 500);
  }
});

// Check if task can be deleted from plan (TB121 - Plans must have at least one task)
app.get('/api/plans/:id/can-delete-task/:taskId', async (c) => {
  try {
    const planId = c.req.param('id') as ElementId;
    const taskId = c.req.param('taskId') as ElementId;

    // Verify plan exists
    const plan = await api.get(planId);
    if (!plan) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Plan not found' } }, 404);
    }
    if (plan.type !== 'plan') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Plan not found' } }, 404);
    }

    // Get tasks in plan
    const tasks = await api.getTasksInPlan(planId);

    // Check if this task is in the plan
    const taskInPlan = tasks.some(t => t.id === taskId);
    if (!taskInPlan) {
      return c.json({ canDelete: false, reason: 'Task is not in this plan' });
    }

    // Check if this is the last task
    const isLastTask = tasks.length === 1;
    if (isLastTask) {
      return c.json({ canDelete: false, reason: 'Cannot remove the last task from a plan. Plans must have at least one task.' });
    }

    return c.json({ canDelete: true });
  } catch (error) {
    console.error('[elemental] Failed to check if task can be deleted:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to check if task can be deleted' } }, 500);
  }
});

// Remove task from plan
app.delete('/api/plans/:id/tasks/:taskId', async (c) => {
  try {
    const planId = c.req.param('id') as ElementId;
    const taskId = c.req.param('taskId') as ElementId;

    // Verify plan exists
    const plan = await api.get(planId);
    if (!plan) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Plan not found' } }, 404);
    }
    if (plan.type !== 'plan') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Plan not found' } }, 404);
    }

    // TB121: Check if this is the last task - plans must have at least one task
    const tasks = await api.getTasksInPlan(planId);
    const taskInPlan = tasks.some(t => t.id === taskId);
    if (taskInPlan && tasks.length === 1) {
      return c.json({
        error: {
          code: 'LAST_TASK',
          message: 'Cannot remove the last task from a plan. Plans must have at least one task.'
        }
      }, 400);
    }

    // Remove the task from the plan
    await api.removeTaskFromPlan(taskId, planId);

    return c.json({ success: true });
  } catch (error) {
    const errorCode = (error as { code?: string }).code;
    if (errorCode === 'NOT_FOUND' || errorCode === 'DEPENDENCY_NOT_FOUND') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Task is not in this plan' } }, 404);
    }
    console.error('[elemental] Failed to remove task from plan:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to remove task from plan' } }, 500);
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

    // TB121: Plans must have at least one task
    // Accept either:
    // 1. initialTaskId - existing task to add to the plan
    // 2. initialTask - object with task details to create and add
    const hasInitialTaskId = body.initialTaskId && typeof body.initialTaskId === 'string';
    const hasInitialTask = body.initialTask && typeof body.initialTask === 'object' && body.initialTask.title;

    if (!hasInitialTaskId && !hasInitialTask) {
      return c.json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Plans must have at least one task. Provide either initialTaskId (existing task ID) or initialTask (object with title to create new task).'
        }
      }, 400);
    }

    // Validate initialTaskId exists if provided
    if (hasInitialTaskId) {
      const existingTask = await api.get(body.initialTaskId as ElementId);
      if (!existingTask) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Initial task not found' } }, 404);
      }
      if (existingTask.type !== 'task') {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: 'initialTaskId must reference a task' } }, 400);
      }
    }

    // Validate initialTask title if provided
    if (hasInitialTask) {
      if (typeof body.initialTask.title !== 'string' || body.initialTask.title.length < 1 || body.initialTask.title.length > 500) {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: 'initialTask.title must be between 1 and 500 characters' } }, 400);
      }
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

    // Now add or create the initial task
    let taskId: ElementId;
    let createdTask = null;

    if (hasInitialTaskId) {
      taskId = body.initialTaskId as ElementId;
    } else {
      // Create a new task using the proper factory function
      const taskInput = {
        title: body.initialTask.title,
        status: (body.initialTask.status || 'open') as 'open',
        priority: body.initialTask.priority || 3,
        complexity: body.initialTask.complexity || 3,
        tags: body.initialTask.tags || [],
        createdBy: body.createdBy as EntityId,
      };
      const task = await createTask(taskInput);
      createdTask = await api.create(task as unknown as Element & Record<string, unknown>);
      taskId = createdTask.id as ElementId;
    }

    // Add the task to the plan
    await api.addTaskToPlan(taskId, created.id as ElementId, { actor: body.createdBy as EntityId });

    // Return the plan along with the initial task info
    return c.json({
      ...created,
      initialTask: createdTask || { id: taskId }
    }, 201);
  } catch (error) {
    if ((error as { code?: string }).code === 'VALIDATION_ERROR') {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: (error as Error).message } }, 400);
    }
    if ((error as { code?: string }).code === 'ALREADY_EXISTS') {
      return c.json({ error: { code: 'ALREADY_EXISTS', message: 'Task is already in another plan' } }, 409);
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

// TB122: Check if a task can be deleted from a workflow
app.get('/api/workflows/:id/can-delete-task/:taskId', async (c) => {
  try {
    const workflowId = c.req.param('id') as ElementId;
    const taskId = c.req.param('taskId') as ElementId;

    // Verify workflow exists
    const workflow = await api.get(workflowId);
    if (!workflow) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Workflow not found' } }, 404);
    }
    if (workflow.type !== 'workflow') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Workflow not found' } }, 404);
    }

    // Get tasks in workflow
    const tasks = await api.getTasksInWorkflow(workflowId);

    // Check if this task is in the workflow
    const taskInWorkflow = tasks.some(t => t.id === taskId);
    if (!taskInWorkflow) {
      return c.json({ canDelete: false, reason: 'Task is not in this workflow' });
    }

    // Check if this is the last task
    const isLastTask = tasks.length === 1;
    if (isLastTask) {
      return c.json({
        canDelete: false,
        reason: "Cannot delete the last task in a workflow. Workflows must have at least one task. Use 'Burn' to delete the entire workflow.",
        isLastTask: true
      });
    }

    return c.json({ canDelete: true });
  } catch (error) {
    console.error('[elemental] Failed to check if task can be deleted:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to check if task can be deleted' } }, 500);
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

    // TB122: Workflows must have at least one task
    // Accept either:
    // 1. initialTaskId - existing task to add to the workflow
    // 2. initialTask - object with task details to create and add
    const hasInitialTaskId = body.initialTaskId && typeof body.initialTaskId === 'string';
    const hasInitialTask = body.initialTask && typeof body.initialTask === 'object' && body.initialTask.title;

    if (!hasInitialTaskId && !hasInitialTask) {
      return c.json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Workflows must have at least one task. Provide either initialTaskId (existing task ID) or initialTask (object with title to create new task).'
        }
      }, 400);
    }

    // Validate initialTaskId exists if provided
    if (hasInitialTaskId) {
      const existingTask = await api.get(body.initialTaskId as ElementId);
      if (!existingTask) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Initial task not found' } }, 404);
      }
      if (existingTask.type !== 'task') {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: 'initialTaskId must reference a task' } }, 400);
      }
    }

    // Validate initialTask title if provided
    if (hasInitialTask) {
      if (typeof body.initialTask.title !== 'string' || body.initialTask.title.length < 1 || body.initialTask.title.length > 500) {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: 'initialTask.title must be between 1 and 500 characters' } }, 400);
      }
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

    // Now add or create the initial task
    let taskId: ElementId;
    let createdTask = null;

    if (hasInitialTaskId) {
      taskId = body.initialTaskId as ElementId;
    } else {
      // Create a new task using the proper factory function
      const taskInput = {
        title: body.initialTask.title,
        status: (body.initialTask.status || 'open') as 'open',
        priority: body.initialTask.priority || 3,
        complexity: body.initialTask.complexity || 3,
        tags: body.initialTask.tags || [],
        createdBy: body.createdBy as EntityId,
      };
      const task = await createTask(taskInput);
      createdTask = await api.create(task as unknown as Element & Record<string, unknown>);
      taskId = createdTask.id as ElementId;
    }

    // Add parent-child dependency from task to workflow
    await api.addDependency({
      sourceId: taskId,
      targetId: created.id as ElementId,
      type: 'parent-child',
      actor: body.createdBy as EntityId,
    });

    // Return the workflow along with the initial task info
    return c.json({
      ...created,
      initialTask: createdTask || { id: taskId }
    }, 201);
  } catch (error) {
    if ((error as { code?: string }).code === 'VALIDATION_ERROR') {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: (error as Error).message } }, 400);
    }
    if ((error as { code?: string }).code === 'ALREADY_EXISTS') {
      return c.json({ error: { code: 'ALREADY_EXISTS', message: 'Task is already in another collection' } }, 409);
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

    // TB122: Validate playbook has at least one step
    const playbook = body.playbook as Playbook;
    if (!playbook.steps || !Array.isArray(playbook.steps) || playbook.steps.length === 0) {
      return c.json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Cannot pour workflow: playbook has no steps defined. Workflows must have at least one task.'
        }
      }, 400);
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

    // TB122: Verify at least one task was created (steps may have been filtered by conditions)
    if (result.tasks.length === 0) {
      return c.json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Cannot pour workflow: all playbook steps were filtered by conditions. At least one task must be created.'
        }
      }, 400);
    }

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

// Burn workflow (delete ephemeral workflow and all its tasks)
app.delete('/api/workflows/:id/burn', async (c) => {
  try {
    const id = c.req.param('id') as ElementId;
    const url = new URL(c.req.url);
    const force = url.searchParams.get('force') === 'true';

    // Verify workflow exists
    const workflow = await api.get(id);
    if (!workflow) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Workflow not found' } }, 404);
    }
    if (workflow.type !== 'workflow') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Workflow not found' } }, 404);
    }

    // Check if workflow is ephemeral (unless force is specified)
    if (!(workflow as Workflow).ephemeral && !force) {
      return c.json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Cannot burn durable workflow. Use force=true to override.',
        },
      }, 400);
    }

    // Burn the workflow
    const result = await api.burnWorkflow(id);

    return c.json(result);
  } catch (error) {
    if ((error as { code?: string }).code === 'NOT_FOUND') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Workflow not found' } }, 404);
    }
    console.error('[elemental] Failed to burn workflow:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to burn workflow' } }, 500);
  }
});

// Squash workflow (promote ephemeral to durable)
app.post('/api/workflows/:id/squash', async (c) => {
  try {
    const id = c.req.param('id') as ElementId;

    // Verify workflow exists
    const workflow = await api.get(id);
    if (!workflow) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Workflow not found' } }, 404);
    }
    if (workflow.type !== 'workflow') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Workflow not found' } }, 404);
    }

    // Check if workflow is ephemeral
    if (!(workflow as Workflow).ephemeral) {
      return c.json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Workflow is already durable',
        },
      }, 400);
    }

    // Squash (promote to durable) by setting ephemeral to false
    const updated = await api.update(id, { ephemeral: false } as unknown as Partial<Element>);

    return c.json(updated);
  } catch (error) {
    if ((error as { code?: string }).code === 'NOT_FOUND') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Workflow not found' } }, 404);
    }
    if ((error as { code?: string }).code === 'VALIDATION_ERROR') {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: (error as Error).message } }, 400);
    }
    console.error('[elemental] Failed to squash workflow:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to squash workflow' } }, 500);
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
    const url = new URL(c.req.url);

    // Parse pagination and filter parameters
    const limitParam = url.searchParams.get('limit');
    const offsetParam = url.searchParams.get('offset');
    const orderByParam = url.searchParams.get('orderBy');
    const orderDirParam = url.searchParams.get('orderDir');
    const searchParam = url.searchParams.get('search');

    // Build filter
    const filter: Record<string, unknown> = {
      type: 'team',
    };

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

    // Get paginated results
    const result = await api.listPaginated(filter as Parameters<typeof api.listPaginated>[0]);

    // Apply client-side filtering for search (not supported in base filter)
    let filteredItems = result.items;

    if (searchParam) {
      const query = searchParam.toLowerCase();
      filteredItems = filteredItems.filter((t) => {
        const team = t as unknown as { name: string; id: string; tags?: string[] };
        return (
          team.name.toLowerCase().includes(query) ||
          team.id.toLowerCase().includes(query) ||
          (team.tags || []).some((tag) => tag.toLowerCase().includes(query))
        );
      });
    }

    // Return paginated response format
    return c.json({
      items: filteredItems,
      total: result.total,
      offset: result.offset,
      limit: result.limit,
      hasMore: result.hasMore,
    });
  } catch (error) {
    console.error('[elemental] Failed to get teams:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get teams' } }, 500);
  }
});

app.post('/api/teams', async (c) => {
  try {
    const body = await c.req.json();
    const { name, members, createdBy, tags, metadata, descriptionRef } = body;

    // Validation
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Name is required' } }, 400);
    }

    // Validate members array - TB123: Teams must have at least one member
    if (!members || !Array.isArray(members) || members.length === 0) {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Teams must have at least one member' } }, 400);
    }
    // Check each member is a valid string
    for (const member of members) {
      if (typeof member !== 'string' || member.length === 0) {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Each member must be a valid entity ID' } }, 400);
      }
    }
    // Check for duplicate members
    const uniqueMembers = new Set(members);
    if (uniqueMembers.size !== members.length) {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Duplicate members are not allowed' } }, 400);
    }

    // Check for duplicate team name
    const existingTeams = await api.list({ type: 'team' });
    const duplicateName = existingTeams.some((t) => {
      const team = t as unknown as { name: string };
      return team.name.toLowerCase() === name.toLowerCase().trim();
    });
    if (duplicateName) {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Team with this name already exists' } }, 400);
    }

    const teamInput: CreateTeamInput = {
      name: name.trim(),
      members: members || [],
      createdBy: (createdBy || 'el-0000') as EntityId,
      tags: tags || [],
      metadata: metadata || {},
      ...(descriptionRef !== undefined && { descriptionRef }),
    };

    const team = await createTeam(teamInput);
    const created = await api.create(team as unknown as Element & Record<string, unknown>);

    return c.json(created, 201);
  } catch (error) {
    console.error('[elemental] Failed to create team:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to create team';
    return c.json({ error: { code: 'INTERNAL_ERROR', message: errorMessage } }, 500);
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

app.patch('/api/teams/:id', async (c) => {
  try {
    const id = c.req.param('id') as ElementId;
    const body = await c.req.json();
    const { name, tags, addMembers, removeMembers } = body;

    // Verify team exists
    const existing = await api.get(id);
    if (!existing || existing.type !== 'team') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Team not found' } }, 404);
    }

    const existingTeam = existing as unknown as { name: string; members: EntityId[]; tags: string[] };

    // Build updates object
    const updates: Record<string, unknown> = {};

    if (name !== undefined) {
      // Validate name format
      if (typeof name !== 'string' || name.trim().length === 0) {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Name must be a non-empty string' } }, 400);
      }
      // Check for duplicate name (if changing)
      if (name.trim() !== existingTeam.name) {
        const existingTeams = await api.list({ type: 'team' });
        const duplicateName = existingTeams.some((t) => {
          const team = t as unknown as { name: string; id: string };
          return team.name.toLowerCase() === name.toLowerCase().trim() && team.id !== id;
        });
        if (duplicateName) {
          return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Team with this name already exists' } }, 400);
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

    // Handle member additions/removals
    let currentMembers = [...existingTeam.members];

    if (addMembers !== undefined) {
      if (!Array.isArray(addMembers)) {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: 'addMembers must be an array' } }, 400);
      }
      for (const memberId of addMembers) {
        if (typeof memberId !== 'string' || memberId.length === 0) {
          return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Each member ID must be a non-empty string' } }, 400);
        }
        if (!currentMembers.includes(memberId as EntityId)) {
          currentMembers.push(memberId as EntityId);
        }
      }
    }

    if (removeMembers !== undefined) {
      if (!Array.isArray(removeMembers)) {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: 'removeMembers must be an array' } }, 400);
      }
      for (const memberId of removeMembers) {
        if (typeof memberId !== 'string' || memberId.length === 0) {
          return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Each member ID must be a non-empty string' } }, 400);
        }
        currentMembers = currentMembers.filter((m) => m !== memberId);
      }
    }

    // TB123: Prevent removing the last member - teams must have at least one member
    if (addMembers !== undefined || removeMembers !== undefined) {
      if (currentMembers.length === 0) {
        return c.json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Cannot remove the last member from a team. Teams must have at least one member.'
          }
        }, 400);
      }
      updates.members = currentMembers;
    }

    if (Object.keys(updates).length === 0) {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'No valid updates provided' } }, 400);
    }

    const updated = await api.update(id, updates);
    return c.json(updated);
  } catch (error) {
    console.error('[elemental] Failed to update team:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to update team';
    return c.json({ error: { code: 'INTERNAL_ERROR', message: errorMessage } }, 500);
  }
});

app.delete('/api/teams/:id', async (c) => {
  try {
    const id = c.req.param('id') as ElementId;

    // Verify team exists
    const existing = await api.get(id);
    if (!existing || existing.type !== 'team') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Team not found' } }, 404);
    }

    // Soft-delete the team
    await api.delete(id);

    return c.json({ success: true, id });
  } catch (error) {
    if ((error as { code?: string }).code === 'NOT_FOUND') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Team not found' } }, 404);
    }
    console.error('[elemental] Failed to delete team:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to delete team' } }, 500);
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

app.get('/api/teams/:id/stats', async (c) => {
  try {
    const id = c.req.param('id') as ElementId;
    const team = await api.get(id);

    if (!team || team.type !== 'team') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Team not found' } }, 404);
    }

    const teamData = team as unknown as { members: EntityId[] };
    const memberIds = teamData.members || [];

    // Get all tasks to calculate team stats
    const allTasks = await api.list({ type: 'task' });

    // Calculate stats for the team
    let totalTasksAssigned = 0;
    let activeTasksAssigned = 0;
    let completedTasksAssigned = 0;
    let createdByTeamMembers = 0;
    const tasksByMember: Record<string, { assigned: number; active: number; completed: number }> = {};

    // Initialize member stats
    for (const memberId of memberIds) {
      tasksByMember[memberId as unknown as string] = { assigned: 0, active: 0, completed: 0 };
    }

    for (const task of allTasks) {
      const taskData = task as unknown as {
        assignee?: EntityId;
        createdBy?: EntityId;
        status?: string;
      };

      // Check if task is assigned to a team member
      if (taskData.assignee && memberIds.includes(taskData.assignee)) {
        totalTasksAssigned++;
        const memberKey = taskData.assignee as unknown as string;
        if (tasksByMember[memberKey]) {
          tasksByMember[memberKey].assigned++;
        }

        const status = taskData.status || 'open';
        if (status === 'closed' || status === 'completed' || status === 'done') {
          completedTasksAssigned++;
          if (tasksByMember[memberKey]) {
            tasksByMember[memberKey].completed++;
          }
        } else if (status !== 'cancelled') {
          activeTasksAssigned++;
          if (tasksByMember[memberKey]) {
            tasksByMember[memberKey].active++;
          }
        }
      }

      // Check if task was created by a team member
      if (taskData.createdBy && memberIds.includes(taskData.createdBy)) {
        createdByTeamMembers++;
      }
    }

    // Calculate workload distribution (tasks per member as percentages)
    const workloadDistribution: { memberId: string; taskCount: number; percentage: number }[] = [];
    for (const memberId of memberIds) {
      const memberStats = tasksByMember[memberId as unknown as string];
      if (memberStats) {
        const percentage = totalTasksAssigned > 0
          ? Math.round((memberStats.assigned / totalTasksAssigned) * 100)
          : 0;
        workloadDistribution.push({
          memberId: memberId as unknown as string,
          taskCount: memberStats.assigned,
          percentage,
        });
      }
    }

    return c.json({
      memberCount: memberIds.length,
      totalTasksAssigned,
      activeTasksAssigned,
      completedTasksAssigned,
      createdByTeamMembers,
      tasksByMember,
      workloadDistribution,
    });
  } catch (error) {
    console.error('[elemental] Failed to get team stats:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get team stats' } }, 500);
  }
});

// TB123: Check if a member can be removed from a team
app.get('/api/teams/:id/can-remove-member/:entityId', async (c) => {
  try {
    const id = c.req.param('id') as ElementId;
    const entityId = c.req.param('entityId') as EntityId;
    const team = await api.get(id);

    if (!team || team.type !== 'team') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Team not found' } }, 404);
    }

    const teamData = team as unknown as { members: EntityId[] };
    const memberIds = teamData.members || [];

    // Check if entity is a member
    if (!memberIds.includes(entityId)) {
      return c.json({
        canRemove: false,
        reason: 'Entity is not a member of this team',
      });
    }

    // Check if this is the last member
    if (memberIds.length <= 1) {
      return c.json({
        canRemove: false,
        reason: 'Cannot remove the last member from a team. Teams must have at least one member.',
      });
    }

    return c.json({
      canRemove: true,
      reason: null,
    });
  } catch (error) {
    console.error('[elemental] Failed to check can-remove-member:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to check member removal' } }, 500);
  }
});

// ============================================================================
// Sync Endpoints
// ============================================================================

app.get('/api/sync/status', async (c) => {
  try {
    const dirtyElements = storageBackend.getDirtyElements();
    return c.json({
      dirtyElementCount: dirtyElements.length,
      dirtyDependencyCount: 0, // Not tracked separately currently
      hasPendingChanges: dirtyElements.length > 0,
      exportPath: resolve(PROJECT_ROOT, '.elemental'),
    });
  } catch (error) {
    console.error('[elemental] Failed to get sync status:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get sync status' } }, 500);
  }
});

app.post('/api/sync/export', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const includeEphemeral = body.includeEphemeral ?? false;

    // Export to JSONL files in .elemental directory
    const result = await syncService.export({
      outputDir: resolve(PROJECT_ROOT, '.elemental'),
      full: true,
      includeEphemeral,
    });

    return c.json({
      success: true,
      elementsExported: result.elementsExported,
      dependenciesExported: result.dependenciesExported,
      elementsFile: result.elementsFile,
      dependenciesFile: result.dependenciesFile,
      exportedAt: result.exportedAt,
    });
  } catch (error) {
    console.error('[elemental] Failed to export:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to export data' } }, 500);
  }
});

app.post('/api/sync/import', async (c) => {
  try {
    const body = await c.req.json();

    // Validate request
    if (!body.elements || typeof body.elements !== 'string') {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'elements field is required and must be a JSONL string' } }, 400);
    }

    const result = syncService.importFromStrings(
      body.elements,
      body.dependencies ?? '',
      {
        dryRun: body.dryRun ?? false,
        force: body.force ?? false,
      }
    );

    return c.json({
      success: true,
      elementsImported: result.elementsImported,
      elementsSkipped: result.elementsSkipped,
      dependenciesImported: result.dependenciesImported,
      dependenciesSkipped: result.dependenciesSkipped,
      conflicts: result.conflicts,
      errors: result.errors,
      importedAt: result.importedAt,
    });
  } catch (error) {
    console.error('[elemental] Failed to import:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to import data' } }, 500);
  }
});

// ============================================================================
// Uploads Endpoints (TB94e - Image Support)
// ============================================================================

/**
 * Ensure uploads directory exists
 */
async function ensureUploadsDir(): Promise<void> {
  try {
    await mkdir(UPLOADS_DIR, { recursive: true });
  } catch {
    // Directory may already exist, which is fine
  }
}

/**
 * POST /api/uploads
 * Upload an image file. Returns the URL to access the uploaded file.
 *
 * Accepts multipart/form-data with:
 * - file: The image file (required)
 *
 * Returns:
 * - { url: string, filename: string, size: number, mimeType: string }
 */
app.post('/api/uploads', async (c) => {
  try {
    await ensureUploadsDir();

    // Parse form data
    const formData = await c.req.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof File)) {
      return c.json({
        error: { code: 'VALIDATION_ERROR', message: 'No file provided. Use multipart/form-data with a "file" field.' }
      }, 400);
    }

    // Validate file type
    const mimeType = file.type;
    if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
      return c.json({
        error: {
          code: 'VALIDATION_ERROR',
          message: `Invalid file type: ${mimeType}. Allowed types: ${ALLOWED_MIME_TYPES.join(', ')}`
        }
      }, 400);
    }

    // Validate file size
    if (file.size > MAX_UPLOAD_SIZE) {
      return c.json({
        error: {
          code: 'VALIDATION_ERROR',
          message: `File too large: ${(file.size / (1024 * 1024)).toFixed(2)}MB. Maximum size: 10MB`
        }
      }, 400);
    }

    // Read file content
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Generate hash-based filename for deduplication
    const hash = createHash('sha256').update(buffer).digest('hex').slice(0, 16);
    const ext = MIME_TO_EXT[mimeType] || extname(file.name) || '.bin';
    const filename = `${hash}${ext}`;
    const filepath = resolve(UPLOADS_DIR, filename);

    // Write file to disk
    await Bun.write(filepath, buffer);

    console.log(`[elemental] Uploaded image: ${filename} (${file.size} bytes)`);

    return c.json({
      url: `/api/uploads/${filename}`,
      filename,
      size: file.size,
      mimeType,
    }, 201);
  } catch (error) {
    console.error('[elemental] Failed to upload file:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to upload file' } }, 500);
  }
});

/**
 * GET /api/uploads/:filename/usage
 * Track which documents reference a specific image.
 * Scans all documents for image URLs containing the filename.
 * NOTE: This route MUST be defined before /api/uploads/:filename to take precedence.
 */
app.get('/api/uploads/:filename/usage', async (c) => {
  try {
    const filename = c.req.param('filename');

    // Security: prevent directory traversal
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid filename' } }, 400);
    }

    // Check if file exists
    const filepath = resolve(UPLOADS_DIR, filename);
    const file = Bun.file(filepath);
    const exists = await file.exists();

    if (!exists) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'File not found' } }, 404);
    }

    // Search for documents that reference this image
    // Look for the filename in document content (images are stored as Markdown ![alt](url))
    const documents = await api.list({ type: 'document' });
    const usedIn: Array<{ id: string; title: string }> = [];

    for (const element of documents) {
      // Check if document content contains the filename
      // Images can be referenced as /api/uploads/filename or http://localhost:3456/api/uploads/filename
      const doc = element as unknown as { id: string; title?: string; content?: string };
      if (doc.content && typeof doc.content === 'string') {
        if (doc.content.includes(`/api/uploads/${filename}`) || doc.content.includes(filename)) {
          usedIn.push({
            id: doc.id,
            title: doc.title || 'Untitled',
          });
        }
      }
    }

    return c.json({
      filename,
      count: usedIn.length,
      documents: usedIn,
    });
  } catch (error) {
    console.error('[elemental] Failed to get upload usage:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get upload usage' } }, 500);
  }
});

/**
 * GET /api/uploads/:filename
 * Serve an uploaded file.
 */
app.get('/api/uploads/:filename', async (c) => {
  try {
    const filename = c.req.param('filename');

    // Security: prevent directory traversal
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid filename' } }, 400);
    }

    const filepath = resolve(UPLOADS_DIR, filename);

    // Check if file exists
    const file = Bun.file(filepath);
    const exists = await file.exists();

    if (!exists) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'File not found' } }, 404);
    }

    // Determine content type from extension
    const ext = extname(filename).toLowerCase();
    const contentTypeMap: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml',
    };
    const contentType = contentTypeMap[ext] || 'application/octet-stream';

    // Read and return file
    const arrayBuffer = await file.arrayBuffer();

    return new Response(arrayBuffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable', // Cache for 1 year (immutable since hash-named)
      },
    });
  } catch (error) {
    console.error('[elemental] Failed to serve file:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to serve file' } }, 500);
  }
});

/**
 * GET /api/uploads
 * List all uploaded files with metadata.
 */
app.get('/api/uploads', async (c) => {
  try {
    await ensureUploadsDir();

    const files = await readdir(UPLOADS_DIR);

    // Get file info for each file
    const fileInfos = await Promise.all(
      files.map(async (filename) => {
        try {
          const filepath = resolve(UPLOADS_DIR, filename);
          const stats = await stat(filepath);
          const ext = extname(filename).toLowerCase();
          const contentTypeMap: Record<string, string> = {
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.webp': 'image/webp',
            '.svg': 'image/svg+xml',
          };

          return {
            filename,
            url: `/api/uploads/${filename}`,
            size: stats.size,
            mimeType: contentTypeMap[ext] || 'application/octet-stream',
            createdAt: stats.birthtime.toISOString(),
            modifiedAt: stats.mtime.toISOString(),
          };
        } catch {
          return null;
        }
      })
    );

    // Filter out any failed reads and sort by creation time (newest first)
    const validFiles = fileInfos
      .filter((f): f is NonNullable<typeof f> => f !== null)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return c.json({
      files: validFiles,
      total: validFiles.length,
    });
  } catch (error) {
    console.error('[elemental] Failed to list uploads:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to list uploads' } }, 500);
  }
});

/**
 * DELETE /api/uploads/:filename
 * Delete an uploaded file.
 */
app.delete('/api/uploads/:filename', async (c) => {
  try {
    const filename = c.req.param('filename');

    // Security: prevent directory traversal
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid filename' } }, 400);
    }

    const filepath = resolve(UPLOADS_DIR, filename);

    // Check if file exists
    const file = Bun.file(filepath);
    const exists = await file.exists();

    if (!exists) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'File not found' } }, 404);
    }

    // Delete the file
    await unlink(filepath);

    console.log(`[elemental] Deleted upload: ${filename}`);

    return c.json({ success: true, filename });
  } catch (error) {
    console.error('[elemental] Failed to delete upload:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to delete upload' } }, 500);
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

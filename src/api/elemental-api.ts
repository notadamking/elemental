/**
 * Elemental API Implementation
 *
 * This module provides the concrete implementation of the ElementalAPI interface,
 * connecting the type system to the storage layer with full CRUD operations.
 */

import type { StorageBackend } from '../storage/backend.js';
import type { Element, ElementId, EntityId, ElementType, Timestamp } from '../types/element.js';
import type { Task, HydratedTask } from '../types/task.js';
import type { Document, DocumentId } from '../types/document.js';
import type { Dependency, DependencyType } from '../types/dependency.js';
import type { Event, EventFilter, EventType } from '../types/event.js';
import { createTimestamp } from '../types/element.js';
import { isTask, TaskStatus as TaskStatusEnum } from '../types/task.js';
import { createEvent } from '../types/event.js';
import { NotFoundError, ConflictError, ConstraintError } from '../errors/error.js';
import { ErrorCode } from '../errors/codes.js';
import { BlockedCacheService, createBlockedCacheService } from '../services/blocked-cache.js';
import { SyncService } from '../sync/service.js';
import type {
  ElementalAPI,
  ElementFilter,
  TaskFilter,
  GetOptions,
  HydrationOptions,
  BlockedTask,
  DependencyTree,
  DependencyTreeNode,
  DependencyInput,
  ListResult,
  ImportResult,
  ImportOptions,
  ExportOptions,
  SystemStats,
  ElementCountByType,
  UpdateOptions,
  DeleteOptions,
} from './types.js';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './types.js';

// ============================================================================
// Database Row Types
// ============================================================================

interface ElementRow {
  id: string;
  type: string;
  data: string;
  content_hash: string | null;
  created_at: string;
  updated_at: string;
  created_by: string;
  deleted_at: string | null;
  [key: string]: unknown;
}

interface TagRow {
  element_id: string;
  tag: string;
  [key: string]: unknown;
}

interface DependencyRow {
  source_id: string;
  target_id: string;
  type: string;
  created_at: string;
  created_by: string;
  metadata: string | null;
  [key: string]: unknown;
}

interface EventRow {
  id: number;
  element_id: string;
  event_type: string;
  actor: string;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
  [key: string]: unknown;
}

interface BlockedCacheRow {
  element_id: string;
  blocked_by: string;
  reason: string | null;
  [key: string]: unknown;
}

interface CountRow {
  count: number;
  [key: string]: unknown;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Serialize an element to database format
 */
function serializeElement(element: Element): {
  id: string;
  type: string;
  data: string;
  created_at: string;
  updated_at: string;
  created_by: string;
  deleted_at: string | null;
} {
  // Extract base element fields and type-specific data
  const { id, type, createdAt, updatedAt, createdBy, tags, metadata, ...typeData } = element;

  // Store type-specific fields in data JSON
  const data = JSON.stringify({
    ...typeData,
    tags,
    metadata,
  });

  // Check for deletedAt (tombstone status)
  const deletedAt = 'deletedAt' in element ? (element as { deletedAt?: string }).deletedAt : null;

  return {
    id,
    type,
    data,
    created_at: createdAt,
    updated_at: updatedAt,
    created_by: createdBy,
    deleted_at: deletedAt ?? null,
  };
}

/**
 * Deserialize a database row to an element
 */
function deserializeElement<T extends Element>(row: ElementRow, tags: string[]): T {
  const data = JSON.parse(row.data);

  return {
    id: row.id as ElementId,
    type: row.type as ElementType,
    createdAt: row.created_at as Timestamp,
    updatedAt: row.updated_at as Timestamp,
    createdBy: row.created_by as EntityId,
    tags,
    metadata: data.metadata ?? {},
    ...data,
  } as T;
}

/**
 * Build WHERE clause from ElementFilter
 */
function buildWhereClause(
  filter: ElementFilter,
  params: unknown[]
): { where: string; params: unknown[] } {
  const conditions: string[] = [];

  // Type filter
  if (filter.type !== undefined) {
    const types = Array.isArray(filter.type) ? filter.type : [filter.type];
    const placeholders = types.map(() => '?').join(', ');
    conditions.push(`e.type IN (${placeholders})`);
    params.push(...types);
  }

  // Creator filter
  if (filter.createdBy !== undefined) {
    conditions.push('e.created_by = ?');
    params.push(filter.createdBy);
  }

  // Created date filters
  if (filter.createdAfter !== undefined) {
    conditions.push('e.created_at >= ?');
    params.push(filter.createdAfter);
  }
  if (filter.createdBefore !== undefined) {
    conditions.push('e.created_at < ?');
    params.push(filter.createdBefore);
  }

  // Updated date filters
  if (filter.updatedAfter !== undefined) {
    conditions.push('e.updated_at >= ?');
    params.push(filter.updatedAfter);
  }
  if (filter.updatedBefore !== undefined) {
    conditions.push('e.updated_at < ?');
    params.push(filter.updatedBefore);
  }

  // Include deleted filter
  if (!filter.includeDeleted) {
    conditions.push('e.deleted_at IS NULL');
  }

  const where = conditions.length > 0 ? conditions.join(' AND ') : '1=1';
  return { where, params };
}

/**
 * Build task-specific WHERE clause additions
 */
function buildTaskWhereClause(
  filter: TaskFilter,
  params: unknown[]
): { where: string; params: unknown[] } {
  const conditions: string[] = [];

  // Status filter
  if (filter.status !== undefined) {
    const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
    // Status is stored in data JSON, use JSON_EXTRACT
    const statusConditions = statuses.map(() => "JSON_EXTRACT(e.data, '$.status') = ?").join(' OR ');
    conditions.push(`(${statusConditions})`);
    params.push(...statuses);
  }

  // Priority filter
  if (filter.priority !== undefined) {
    const priorities = Array.isArray(filter.priority) ? filter.priority : [filter.priority];
    const priorityConditions = priorities.map(() => "JSON_EXTRACT(e.data, '$.priority') = ?").join(' OR ');
    conditions.push(`(${priorityConditions})`);
    params.push(...priorities);
  }

  // Complexity filter
  if (filter.complexity !== undefined) {
    const complexities = Array.isArray(filter.complexity) ? filter.complexity : [filter.complexity];
    const complexityConditions = complexities.map(() => "JSON_EXTRACT(e.data, '$.complexity') = ?").join(' OR ');
    conditions.push(`(${complexityConditions})`);
    params.push(...complexities);
  }

  // Assignee filter
  if (filter.assignee !== undefined) {
    conditions.push("JSON_EXTRACT(e.data, '$.assignee') = ?");
    params.push(filter.assignee);
  }

  // Owner filter
  if (filter.owner !== undefined) {
    conditions.push("JSON_EXTRACT(e.data, '$.owner') = ?");
    params.push(filter.owner);
  }

  // Task type filter
  if (filter.taskType !== undefined) {
    const taskTypes = Array.isArray(filter.taskType) ? filter.taskType : [filter.taskType];
    const typeConditions = taskTypes.map(() => "JSON_EXTRACT(e.data, '$.taskType') = ?").join(' OR ');
    conditions.push(`(${typeConditions})`);
    params.push(...taskTypes);
  }

  // Deadline filters
  if (filter.hasDeadline !== undefined) {
    if (filter.hasDeadline) {
      conditions.push("JSON_EXTRACT(e.data, '$.deadline') IS NOT NULL");
    } else {
      conditions.push("JSON_EXTRACT(e.data, '$.deadline') IS NULL");
    }
  }
  if (filter.deadlineBefore !== undefined) {
    conditions.push("JSON_EXTRACT(e.data, '$.deadline') < ?");
    params.push(filter.deadlineBefore);
  }

  const where = conditions.length > 0 ? conditions.join(' AND ') : '';
  return { where, params };
}

// ============================================================================
// ElementalAPI Implementation
// ============================================================================

/**
 * Implementation of the ElementalAPI interface
 */
export class ElementalAPIImpl implements ElementalAPI {
  private blockedCache: BlockedCacheService;
  private syncService: SyncService;

  constructor(private backend: StorageBackend) {
    this.blockedCache = createBlockedCacheService(backend);
    this.syncService = new SyncService(backend);
  }

  // --------------------------------------------------------------------------
  // CRUD Operations
  // --------------------------------------------------------------------------

  async get<T extends Element>(id: ElementId, options?: GetOptions): Promise<T | null> {
    // Query the element
    const row = this.backend.queryOne<ElementRow>(
      'SELECT * FROM elements WHERE id = ?',
      [id]
    );

    if (!row) {
      return null;
    }

    // Get tags for this element
    const tagRows = this.backend.query<TagRow>(
      'SELECT tag FROM tags WHERE element_id = ?',
      [id]
    );
    const tags = tagRows.map((r) => r.tag);

    // Deserialize the element
    let element = deserializeElement<T>(row, tags);

    // Handle hydration if requested
    if (options?.hydrate && isTask(element)) {
      element = await this.hydrateTask(element as unknown as Task, options.hydrate) as unknown as T;
    }

    return element;
  }

  async list<T extends Element>(filter?: ElementFilter): Promise<T[]> {
    const result = await this.listPaginated<T>(filter);
    return result.items;
  }

  async listPaginated<T extends Element>(filter?: ElementFilter): Promise<ListResult<T>> {
    const effectiveFilter = filter ?? {};

    // Build base WHERE clause (params will be accumulated here)
    const params: unknown[] = [];
    const { where: baseWhere } = buildWhereClause(effectiveFilter, params);

    // Build task-specific WHERE clause if filtering tasks
    let taskWhere = '';
    if (effectiveFilter.type === 'task' || (Array.isArray(effectiveFilter.type) && effectiveFilter.type.includes('task'))) {
      const taskFilter = effectiveFilter as TaskFilter;
      const { where: tw } = buildTaskWhereClause(taskFilter, params);
      if (tw) {
        taskWhere = ` AND ${tw}`;
      }
    }

    // Handle tag filtering
    let tagJoin = '';
    let tagWhere = '';
    if (effectiveFilter.tags && effectiveFilter.tags.length > 0) {
      // Must have ALL tags - use GROUP BY with HAVING COUNT
      tagJoin = ' JOIN tags t ON e.id = t.element_id';
      const placeholders = effectiveFilter.tags.map(() => '?').join(', ');
      tagWhere = ` AND t.tag IN (${placeholders})`;
      params.push(...effectiveFilter.tags);
    }
    if (effectiveFilter.tagsAny && effectiveFilter.tagsAny.length > 0) {
      // Must have ANY tag
      if (!tagJoin) {
        tagJoin = ' JOIN tags t ON e.id = t.element_id';
      }
      const placeholders = effectiveFilter.tagsAny.map(() => '?').join(', ');
      tagWhere += ` AND t.tag IN (${placeholders})`;
      params.push(...effectiveFilter.tagsAny);
    }

    // Count total matching elements
    const countSql = `
      SELECT COUNT(DISTINCT e.id) as count
      FROM elements e${tagJoin}
      WHERE ${baseWhere}${taskWhere}${tagWhere}
    `;
    const countRow = this.backend.queryOne<CountRow>(countSql, params);
    const total = countRow?.count ?? 0;

    // Build ORDER BY
    const orderBy = effectiveFilter.orderBy ?? 'created_at';
    const orderDir = effectiveFilter.orderDir ?? 'desc';
    const orderClause = `ORDER BY e.${orderBy} ${orderDir.toUpperCase()}`;

    // Apply pagination
    const limit = Math.min(effectiveFilter.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const offset = effectiveFilter.offset ?? 0;

    // Query elements
    const sql = `
      SELECT DISTINCT e.*
      FROM elements e${tagJoin}
      WHERE ${baseWhere}${taskWhere}${tagWhere}
      ${orderClause}
      LIMIT ? OFFSET ?
    `;

    const rows = this.backend.query<ElementRow>(sql, [...params, limit, offset]);

    // Fetch tags for all returned elements
    const items: T[] = [];
    for (const row of rows) {
      const tagRows = this.backend.query<TagRow>(
        'SELECT tag FROM tags WHERE element_id = ?',
        [row.id]
      );
      const tags = tagRows.map((r) => r.tag);
      items.push(deserializeElement<T>(row, tags));
    }

    // Check if tags filter requires all tags
    let filteredItems = items;
    if (effectiveFilter.tags && effectiveFilter.tags.length > 1) {
      // Filter to elements that have ALL tags
      filteredItems = items.filter((item) =>
        effectiveFilter.tags!.every((tag) => item.tags.includes(tag))
      );
    }

    return {
      items: filteredItems,
      total,
      offset,
      limit,
      hasMore: offset + filteredItems.length < total,
    };
  }

  async create<T extends Element>(input: Record<string, unknown> & { type: ElementType; createdBy: EntityId }): Promise<T> {
    // The input should already be a validated element from the factory functions
    // We just need to persist it
    const element = input as unknown as T;

    // Serialize for storage
    const serialized = serializeElement(element);

    // Insert in a transaction
    this.backend.transaction((tx) => {
      // Insert the element
      tx.run(
        `INSERT INTO elements (id, type, data, created_at, updated_at, created_by, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          serialized.id,
          serialized.type,
          serialized.data,
          serialized.created_at,
          serialized.updated_at,
          serialized.created_by,
          serialized.deleted_at,
        ]
      );

      // Insert tags
      if (element.tags.length > 0) {
        for (const tag of element.tags) {
          tx.run(
            'INSERT INTO tags (element_id, tag) VALUES (?, ?)',
            [element.id, tag]
          );
        }
      }

      // Record creation event
      const event = createEvent({
        elementId: element.id,
        eventType: 'created' as EventType,
        actor: element.createdBy,
        oldValue: null,
        newValue: element as unknown as Record<string, unknown>,
      });
      tx.run(
        `INSERT INTO events (element_id, event_type, actor, old_value, new_value, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          event.elementId,
          event.eventType,
          event.actor,
          null,
          JSON.stringify(event.newValue),
          event.createdAt,
        ]
      );
    });

    // Mark as dirty for sync
    this.backend.markDirty(element.id);

    return element;
  }

  async update<T extends Element>(id: ElementId, updates: Partial<T>, options?: UpdateOptions): Promise<T> {
    // Get the existing element
    const existing = await this.get<T>(id);
    if (!existing) {
      throw new NotFoundError(
        `Element not found: ${id}`,
        ErrorCode.NOT_FOUND,
        { elementId: id }
      );
    }

    // Check if element is immutable (Messages cannot be updated)
    if (existing.type === 'message') {
      throw new ConstraintError(
        'Messages are immutable and cannot be updated',
        ErrorCode.IMMUTABLE,
        { elementId: id, type: 'message' }
      );
    }

    // Resolve actor - use provided actor or fall back to element's creator
    const actor = options?.actor ?? existing.createdBy;

    // Apply updates
    const now = createTimestamp();
    const updated: T = {
      ...existing,
      ...updates,
      id: existing.id, // Cannot change ID
      type: existing.type, // Cannot change type
      createdAt: existing.createdAt, // Cannot change creation time
      createdBy: existing.createdBy, // Cannot change creator
      updatedAt: now,
    };

    // Serialize for storage
    const serialized = serializeElement(updated);

    // Update in a transaction
    this.backend.transaction((tx) => {
      // Update the element
      tx.run(
        `UPDATE elements SET data = ?, updated_at = ?, deleted_at = ?
         WHERE id = ?`,
        [serialized.data, serialized.updated_at, serialized.deleted_at, id]
      );

      // Update tags if they changed
      if (updates.tags !== undefined) {
        // Remove old tags
        tx.run('DELETE FROM tags WHERE element_id = ?', [id]);
        // Insert new tags
        for (const tag of updated.tags) {
          tx.run('INSERT INTO tags (element_id, tag) VALUES (?, ?)', [id, tag]);
        }
      }

      // Record update event with the resolved actor
      const event = createEvent({
        elementId: id,
        eventType: 'updated' as EventType,
        actor,
        oldValue: existing as unknown as Record<string, unknown>,
        newValue: updated as unknown as Record<string, unknown>,
      });
      tx.run(
        `INSERT INTO events (element_id, event_type, actor, old_value, new_value, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          event.elementId,
          event.eventType,
          event.actor,
          JSON.stringify(event.oldValue),
          JSON.stringify(event.newValue),
          event.createdAt,
        ]
      );
    });

    // Mark as dirty for sync
    this.backend.markDirty(id);

    // Check if status changed and update blocked cache
    const existingData = existing as Record<string, unknown>;
    const updatedData = updated as unknown as Record<string, unknown>;
    const oldStatus = existingData.status as string | undefined;
    const newStatus = updatedData.status as string | undefined;
    if (oldStatus !== newStatus && newStatus !== undefined) {
      this.blockedCache.onStatusChanged(id, oldStatus ?? null, newStatus);
    }

    return updated;
  }

  async delete(id: ElementId, options?: DeleteOptions): Promise<void> {
    // Get the existing element
    const existing = await this.get<Element>(id);
    if (!existing) {
      throw new NotFoundError(
        `Element not found: ${id}`,
        ErrorCode.NOT_FOUND,
        { elementId: id }
      );
    }

    // Check if element is immutable (Messages cannot be deleted)
    if (existing.type === 'message') {
      throw new ConstraintError(
        'Messages are immutable and cannot be deleted',
        ErrorCode.IMMUTABLE,
        { elementId: id, type: 'message' }
      );
    }

    // Resolve actor - use provided actor or fall back to element's creator
    const actor = options?.actor ?? existing.createdBy;
    const reason = options?.reason;

    const now = createTimestamp();

    // Soft delete by setting deleted_at and updating status to tombstone
    this.backend.transaction((tx) => {
      // Get current data and update status
      const data = JSON.parse(
        (this.backend.queryOne<{ data: string }>('SELECT data FROM elements WHERE id = ?', [id]))?.data ?? '{}'
      );
      data.status = 'tombstone';
      data.deletedAt = now;
      data.deleteReason = reason;

      tx.run(
        `UPDATE elements SET data = ?, updated_at = ?, deleted_at = ?
         WHERE id = ?`,
        [JSON.stringify(data), now, now, id]
      );

      // Record delete event with the resolved actor
      const event = createEvent({
        elementId: id,
        eventType: 'deleted' as EventType,
        actor,
        oldValue: existing as unknown as Record<string, unknown>,
        newValue: null,
      });
      tx.run(
        `INSERT INTO events (element_id, event_type, actor, old_value, new_value, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          event.elementId,
          event.eventType,
          event.actor,
          JSON.stringify(event.oldValue),
          reason ? JSON.stringify({ reason }) : null,
          event.createdAt,
        ]
      );
    });

    // Mark as dirty for sync
    this.backend.markDirty(id);

    // Update blocked cache - deletion unblocks dependents
    this.blockedCache.onElementDeleted(id);
  }

  // --------------------------------------------------------------------------
  // Entity Operations
  // --------------------------------------------------------------------------

  async lookupEntityByName(name: string): Promise<Element | null> {
    // Query for entity with matching name in data JSON
    const row = this.backend.queryOne<ElementRow>(
      `SELECT * FROM elements
       WHERE type = 'entity'
       AND JSON_EXTRACT(data, '$.name') = ?
       AND deleted_at IS NULL`,
      [name]
    );

    if (!row) {
      return null;
    }

    // Get tags for this element
    const tagRows = this.backend.query<TagRow>(
      'SELECT tag FROM tags WHERE element_id = ?',
      [row.id]
    );
    const tags = tagRows.map((r) => r.tag);

    return deserializeElement<Element>(row, tags);
  }

  // --------------------------------------------------------------------------
  // Task Operations
  // --------------------------------------------------------------------------

  async ready(filter?: TaskFilter): Promise<Task[]> {
    const effectiveFilter: TaskFilter = {
      ...filter,
      type: 'task',
      status: [TaskStatusEnum.OPEN, TaskStatusEnum.IN_PROGRESS],
    };

    // Get tasks matching filter
    const tasks = await this.list<Task>(effectiveFilter);

    // Filter out blocked tasks
    const blockedIds = new Set(
      this.backend.query<{ element_id: string }>(
        'SELECT element_id FROM blocked_cache'
      ).map((r) => r.element_id)
    );

    // Filter out scheduled-for-future tasks
    const now = new Date();
    const readyTasks = tasks.filter((task) => {
      // Not blocked
      if (blockedIds.has(task.id)) {
        return false;
      }
      // Not scheduled for future
      if (task.scheduledFor && new Date(task.scheduledFor) > now) {
        return false;
      }
      return true;
    });

    return readyTasks;
  }

  async blocked(filter?: TaskFilter): Promise<BlockedTask[]> {
    const effectiveFilter: TaskFilter = {
      ...filter,
      type: 'task',
    };

    // Get tasks matching filter
    const tasks = await this.list<Task>(effectiveFilter);

    // Get blocked cache entries
    const blockedRows = this.backend.query<BlockedCacheRow>(
      'SELECT * FROM blocked_cache'
    );
    const blockedMap = new Map(blockedRows.map((r) => [r.element_id, r]));

    // Filter to blocked tasks and add blocking info
    const blockedTasks: BlockedTask[] = [];
    for (const task of tasks) {
      const blockInfo = blockedMap.get(task.id);
      if (blockInfo) {
        blockedTasks.push({
          ...task,
          blockedBy: blockInfo.blocked_by as ElementId,
          blockReason: blockInfo.reason ?? 'Blocked by dependency',
        });
      }
    }

    return blockedTasks;
  }

  // --------------------------------------------------------------------------
  // Dependency Operations
  // --------------------------------------------------------------------------

  async addDependency(dep: DependencyInput): Promise<Dependency> {
    // Verify source element exists
    const source = await this.get<Element>(dep.sourceId);
    if (!source) {
      throw new NotFoundError(
        `Source element not found: ${dep.sourceId}`,
        ErrorCode.NOT_FOUND,
        { elementId: dep.sourceId }
      );
    }

    // Check for existing dependency
    const existing = this.backend.queryOne<DependencyRow>(
      'SELECT * FROM dependencies WHERE source_id = ? AND target_id = ? AND type = ?',
      [dep.sourceId, dep.targetId, dep.type]
    );
    if (existing) {
      throw new ConflictError(
        'Dependency already exists',
        ErrorCode.DUPLICATE_DEPENDENCY,
        {
          sourceId: dep.sourceId,
          targetId: dep.targetId,
          dependencyType: dep.type,
        }
      );
    }

    // TODO: Check for cycles (for blocking dependency types)

    // Resolve actor - use provided actor or fall back to source element's creator
    const actor = dep.actor ?? source.createdBy;

    const now = createTimestamp();
    const dependency: Dependency = {
      sourceId: dep.sourceId,
      targetId: dep.targetId,
      type: dep.type,
      createdAt: now,
      createdBy: actor,
      metadata: dep.metadata ?? {},
    };

    // Insert dependency and record event in a transaction
    this.backend.transaction((tx) => {
      // Insert dependency
      tx.run(
        `INSERT INTO dependencies (source_id, target_id, type, created_at, created_by, metadata)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          dependency.sourceId,
          dependency.targetId,
          dependency.type,
          dependency.createdAt,
          dependency.createdBy,
          dependency.metadata ? JSON.stringify(dependency.metadata) : null,
        ]
      );

      // Record dependency_added event
      const event = createEvent({
        elementId: dependency.sourceId,
        eventType: 'dependency_added' as EventType,
        actor: dependency.createdBy,
        oldValue: null,
        newValue: {
          sourceId: dependency.sourceId,
          targetId: dependency.targetId,
          type: dependency.type,
          metadata: dependency.metadata,
        },
      });
      tx.run(
        `INSERT INTO events (element_id, event_type, actor, old_value, new_value, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          event.elementId,
          event.eventType,
          event.actor,
          null,
          JSON.stringify(event.newValue),
          event.createdAt,
        ]
      );
    });

    // Update blocked cache using the service (handles transitive blocking, gate satisfaction, etc.)
    this.blockedCache.onDependencyAdded(
      dep.sourceId,
      dep.targetId,
      dep.type,
      dep.metadata
    );

    // Mark source as dirty
    this.backend.markDirty(dep.sourceId);

    return dependency;
  }

  async removeDependency(
    sourceId: ElementId,
    targetId: ElementId,
    type: DependencyType,
    actor?: EntityId
  ): Promise<void> {
    // Check dependency exists and capture for event
    const existing = this.backend.queryOne<DependencyRow>(
      'SELECT * FROM dependencies WHERE source_id = ? AND target_id = ? AND type = ?',
      [sourceId, targetId, type]
    );
    if (!existing) {
      throw new NotFoundError(
        'Dependency not found',
        ErrorCode.DEPENDENCY_NOT_FOUND,
        { sourceId, targetId, dependencyType: type }
      );
    }

    // Get actor for event - use provided actor or fall back to the dependency creator
    const eventActor = actor ?? (existing.created_by as EntityId);

    // Remove dependency and record event in a transaction
    this.backend.transaction((tx) => {
      // Remove dependency
      tx.run(
        'DELETE FROM dependencies WHERE source_id = ? AND target_id = ? AND type = ?',
        [sourceId, targetId, type]
      );

      // Record dependency_removed event
      const event = createEvent({
        elementId: sourceId,
        eventType: 'dependency_removed' as EventType,
        actor: eventActor,
        oldValue: {
          sourceId: existing.source_id,
          targetId: existing.target_id,
          type: existing.type,
          metadata: existing.metadata ? JSON.parse(existing.metadata) : {},
        },
        newValue: null,
      });
      tx.run(
        `INSERT INTO events (element_id, event_type, actor, old_value, new_value, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          event.elementId,
          event.eventType,
          event.actor,
          JSON.stringify(event.oldValue),
          null,
          event.createdAt,
        ]
      );
    });

    // Update blocked cache using the service (recomputes blocking state)
    this.blockedCache.onDependencyRemoved(sourceId, targetId, type);

    // Mark source as dirty
    this.backend.markDirty(sourceId);
  }

  async getDependencies(id: ElementId, types?: DependencyType[]): Promise<Dependency[]> {
    let sql = 'SELECT * FROM dependencies WHERE source_id = ?';
    const params: unknown[] = [id];

    if (types && types.length > 0) {
      const placeholders = types.map(() => '?').join(', ');
      sql += ` AND type IN (${placeholders})`;
      params.push(...types);
    }

    const rows = this.backend.query<DependencyRow>(sql, params);

    return rows.map((row) => ({
      sourceId: row.source_id as ElementId,
      targetId: row.target_id as ElementId,
      type: row.type as DependencyType,
      createdAt: row.created_at as Timestamp,
      createdBy: row.created_by as EntityId,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    }));
  }

  async getDependents(id: ElementId, types?: DependencyType[]): Promise<Dependency[]> {
    let sql = 'SELECT * FROM dependencies WHERE target_id = ?';
    const params: unknown[] = [id];

    if (types && types.length > 0) {
      const placeholders = types.map(() => '?').join(', ');
      sql += ` AND type IN (${placeholders})`;
      params.push(...types);
    }

    const rows = this.backend.query<DependencyRow>(sql, params);

    return rows.map((row) => ({
      sourceId: row.source_id as ElementId,
      targetId: row.target_id as ElementId,
      type: row.type as DependencyType,
      createdAt: row.created_at as Timestamp,
      createdBy: row.created_by as EntityId,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    }));
  }

  async getDependencyTree(id: ElementId): Promise<DependencyTree> {
    const element = await this.get<Element>(id);
    if (!element) {
      throw new NotFoundError(
        `Element not found: ${id}`,
        ErrorCode.NOT_FOUND,
        { elementId: id }
      );
    }

    // Build tree recursively (with depth limit to prevent infinite loops)
    const maxDepth = 10;
    const visited = new Set<string>();

    const buildNode = async (
      elem: Element,
      depth: number,
      direction: 'deps' | 'dependents'
    ): Promise<DependencyTreeNode> => {
      const node: DependencyTreeNode = {
        element: elem,
        dependencies: [],
        dependents: [],
      };

      if (depth >= maxDepth || visited.has(elem.id)) {
        return node;
      }
      visited.add(elem.id);

      if (direction === 'deps' || depth === 0) {
        const deps = await this.getDependencies(elem.id);
        for (const dep of deps) {
          const targetElem = await this.get<Element>(dep.targetId);
          if (targetElem) {
            const childNode = await buildNode(targetElem, depth + 1, 'deps');
            node.dependencies.push(childNode);
          }
        }
      }

      if (direction === 'dependents' || depth === 0) {
        const dependents = await this.getDependents(elem.id);
        for (const dep of dependents) {
          const sourceElem = await this.get<Element>(dep.sourceId);
          if (sourceElem) {
            const parentNode = await buildNode(sourceElem, depth + 1, 'dependents');
            node.dependents.push(parentNode);
          }
        }
      }

      return node;
    };

    const root = await buildNode(element, 0, 'deps');

    // Calculate depths
    const countDepth = (node: DependencyTreeNode, direction: 'deps' | 'dependents'): number => {
      const children = direction === 'deps' ? node.dependencies : node.dependents;
      if (children.length === 0) return 0;
      return 1 + Math.max(...children.map((c) => countDepth(c, direction)));
    };

    const countNodes = (node: DependencyTreeNode, visited: Set<string>): number => {
      if (visited.has(node.element.id)) return 0;
      visited.add(node.element.id);
      let count = 1;
      for (const child of node.dependencies) {
        count += countNodes(child, visited);
      }
      for (const child of node.dependents) {
        count += countNodes(child, visited);
      }
      return count;
    };

    return {
      root,
      dependencyDepth: countDepth(root, 'deps'),
      dependentDepth: countDepth(root, 'dependents'),
      nodeCount: countNodes(root, new Set()),
    };
  }

  // --------------------------------------------------------------------------
  // Search
  // --------------------------------------------------------------------------

  async search(query: string, filter?: ElementFilter): Promise<Element[]> {
    // Simple LIKE-based search for now
    const searchPattern = `%${query}%`;
    const params: unknown[] = [];

    // Build base WHERE clause from filter (params accumulates in place)
    const { where: filterWhere } = buildWhereClause(filter ?? {}, params);

    // Search in title (stored in data JSON)
    const sql = `
      SELECT DISTINCT e.*
      FROM elements e
      LEFT JOIN tags t ON e.id = t.element_id
      WHERE ${filterWhere}
        AND (
          JSON_EXTRACT(e.data, '$.title') LIKE ?
          OR JSON_EXTRACT(e.data, '$.content') LIKE ?
          OR t.tag LIKE ?
        )
      ORDER BY e.updated_at DESC
      LIMIT 100
    `;
    params.push(searchPattern, searchPattern, searchPattern);

    const rows = this.backend.query<ElementRow>(sql, params);

    // Fetch tags and deserialize
    const results: Element[] = [];
    for (const row of rows) {
      const tagRows = this.backend.query<TagRow>(
        'SELECT tag FROM tags WHERE element_id = ?',
        [row.id]
      );
      const tags = tagRows.map((r) => r.tag);
      results.push(deserializeElement<Element>(row, tags));
    }

    return results;
  }

  // --------------------------------------------------------------------------
  // History Operations
  // --------------------------------------------------------------------------

  async getEvents(id: ElementId, filter?: EventFilter): Promise<Event[]> {
    let sql = 'SELECT * FROM events WHERE element_id = ?';
    const params: unknown[] = [id];

    if (filter?.eventType) {
      const types = Array.isArray(filter.eventType) ? filter.eventType : [filter.eventType];
      const placeholders = types.map(() => '?').join(', ');
      sql += ` AND event_type IN (${placeholders})`;
      params.push(...types);
    }

    if (filter?.actor) {
      sql += ' AND actor = ?';
      params.push(filter.actor);
    }

    if (filter?.after) {
      sql += ' AND created_at > ?';
      params.push(filter.after);
    }

    if (filter?.before) {
      sql += ' AND created_at < ?';
      params.push(filter.before);
    }

    sql += ' ORDER BY created_at DESC';

    if (filter?.limit) {
      sql += ' LIMIT ?';
      params.push(filter.limit);
    }

    const rows = this.backend.query<EventRow>(sql, params);

    return rows.map((row) => ({
      id: row.id,
      elementId: row.element_id as ElementId,
      eventType: row.event_type as EventType,
      actor: row.actor as EntityId,
      oldValue: row.old_value ? JSON.parse(row.old_value) : null,
      newValue: row.new_value ? JSON.parse(row.new_value) : null,
      createdAt: row.created_at as Timestamp,
    }));
  }

  async getDocumentVersion(id: DocumentId, version: number): Promise<Document | null> {
    // First check if it's the current version
    const current = await this.get<Document>(id as unknown as ElementId);
    if (current && current.version === version) {
      return current;
    }

    // Look in version history
    const row = this.backend.queryOne<{ data: string; created_at: string }>(
      'SELECT data, created_at FROM document_versions WHERE id = ? AND version = ?',
      [id, version]
    );

    if (!row) {
      return null;
    }

    const data = JSON.parse(row.data);
    return {
      id: id as unknown as ElementId,
      type: 'document',
      createdAt: row.created_at,
      updatedAt: row.created_at,
      createdBy: data.createdBy,
      tags: data.tags ?? [],
      metadata: data.metadata ?? {},
      ...data,
    } as Document;
  }

  async getDocumentHistory(id: DocumentId): Promise<Document[]> {
    // Get current version
    const current = await this.get<Document>(id as unknown as ElementId);
    const results: Document[] = [];

    if (current) {
      results.push(current);
    }

    // Get historical versions
    const rows = this.backend.query<{ version: number; data: string; created_at: string }>(
      'SELECT version, data, created_at FROM document_versions WHERE id = ? ORDER BY version DESC',
      [id]
    );

    for (const row of rows) {
      const data = JSON.parse(row.data);
      results.push({
        id: id as unknown as ElementId,
        type: 'document',
        createdAt: row.created_at,
        updatedAt: row.created_at,
        createdBy: data.createdBy,
        tags: data.tags ?? [],
        metadata: data.metadata ?? {},
        ...data,
        version: row.version,
      } as Document);
    }

    return results;
  }

  // --------------------------------------------------------------------------
  // Sync Operations
  // --------------------------------------------------------------------------

  async export(options?: ExportOptions): Promise<string | void> {
    // Use SyncService for export functionality
    const { elements, dependencies } = this.syncService.exportToString({
      includeEphemeral: false, // API export excludes ephemeral by default
      includeDependencies: options?.includeDependencies ?? true,
    });

    // Build combined JSONL string
    let jsonl = elements;
    if (options?.includeDependencies !== false && dependencies) {
      jsonl = jsonl + (jsonl && dependencies ? '\n' : '') + dependencies;
    }

    if (options?.outputPath) {
      // Write to file using SyncService's file-based export
      const result = await this.syncService.export({
        outputDir: options.outputPath,
        full: true,
        includeEphemeral: false,
      });
      // Return void for file-based export
      return;
    }

    return jsonl;
  }

  async import(options: ImportOptions): Promise<ImportResult> {
    // Use SyncService for import functionality
    let elementsContent = '';
    let dependenciesContent = '';

    // Handle input data - either from file path or raw data string
    if (options.data) {
      // Parse raw JSONL data - separate elements from dependencies
      // Elements have `id` and `type`, dependencies have `sourceId` and `targetId`
      const lines = options.data.split('\n').filter((line) => line.trim());
      const elementLines: string[] = [];
      const dependencyLines: string[] = [];

      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          if (parsed.sourceId && parsed.targetId) {
            // This is a dependency
            dependencyLines.push(line);
          } else if (parsed.id) {
            // This is an element
            elementLines.push(line);
          }
        } catch {
          // Invalid JSON - add to elements to let SyncService report the error
          elementLines.push(line);
        }
      }

      elementsContent = elementLines.join('\n');
      dependenciesContent = dependencyLines.join('\n');
    } else if (options.inputPath) {
      // Use file-based import via SyncService
      const syncResult = await this.syncService.import({
        inputDir: options.inputPath,
        dryRun: options.dryRun ?? false,
        force: options.conflictStrategy === 'overwrite',
      });

      // Convert SyncService result to API ImportResult format
      return this.convertSyncImportResult(syncResult, options.dryRun ?? false);
    }

    // For raw data import, use SyncService's string-based import
    const syncResult = this.syncService.importFromStrings(
      elementsContent,
      dependenciesContent,
      {
        dryRun: options.dryRun ?? false,
        force: options.conflictStrategy === 'overwrite',
      }
    );

    return this.convertSyncImportResult(syncResult, options.dryRun ?? false);
  }

  /**
   * Convert SyncService ImportResult to API ImportResult format
   */
  private convertSyncImportResult(
    syncResult: {
      elementsImported: number;
      elementsSkipped?: number;
      dependenciesImported: number;
      dependenciesSkipped?: number;
      conflicts: Array<{
        elementId: ElementId;
        resolution: string;
        localHash?: string;
        remoteHash?: string;
      }>;
      errors: Array<{
        line: number;
        file: string;
        message: string;
        content?: string;
      }>;
    },
    dryRun: boolean
  ): ImportResult {
    // Convert conflicts to API format
    const conflicts = syncResult.conflicts.map((c) => ({
      elementId: c.elementId,
      conflictType: 'exists' as const,
      details: `Resolved via ${c.resolution}`,
    }));

    // Convert errors to string format
    const errors = syncResult.errors.map((e) =>
      `${e.file}:${e.line}: ${e.message}${e.content ? ` (${e.content.substring(0, 50)}...)` : ''}`
    );

    return {
      success: syncResult.errors.length === 0,
      elementsImported: syncResult.elementsImported,
      dependenciesImported: syncResult.dependenciesImported,
      eventsImported: 0, // Events are not imported via sync
      conflicts,
      errors,
      dryRun,
    };
  }

  // --------------------------------------------------------------------------
  // Statistics
  // --------------------------------------------------------------------------

  async stats(): Promise<SystemStats> {
    const now = createTimestamp();

    // Count elements by type
    const typeCounts = this.backend.query<{ type: string; count: number }>(
      "SELECT type, COUNT(*) as count FROM elements WHERE deleted_at IS NULL GROUP BY type"
    );
    const elementsByType: ElementCountByType = {};
    let totalElements = 0;
    for (const row of typeCounts) {
      elementsByType[row.type as ElementType] = row.count;
      totalElements += row.count;
    }

    // Count dependencies
    const depCount = this.backend.queryOne<CountRow>(
      'SELECT COUNT(*) as count FROM dependencies'
    );
    const totalDependencies = depCount?.count ?? 0;

    // Count events
    const eventCount = this.backend.queryOne<CountRow>(
      'SELECT COUNT(*) as count FROM events'
    );
    const totalEvents = eventCount?.count ?? 0;

    // Count ready tasks
    const readyTasks = await this.ready();

    // Count blocked tasks
    const blockedCount = this.backend.queryOne<CountRow>(
      'SELECT COUNT(*) as count FROM blocked_cache'
    );
    const blockedTasks = blockedCount?.count ?? 0;

    // Get database size
    const stats = this.backend.getStats();

    return {
      totalElements,
      elementsByType,
      totalDependencies,
      totalEvents,
      readyTasks: readyTasks.length,
      blockedTasks,
      databaseSize: stats.fileSize,
      computedAt: now,
    };
  }

  // --------------------------------------------------------------------------
  // Hydration Helpers
  // --------------------------------------------------------------------------

  private async hydrateTask(task: Task, options: HydrationOptions): Promise<HydratedTask> {
    const hydrated: HydratedTask = { ...task };

    if (options.description && task.descriptionRef) {
      const doc = await this.get<Document>(task.descriptionRef as unknown as ElementId);
      if (doc) {
        hydrated.description = doc.content;
      }
    }

    if (options.design && task.designRef) {
      const doc = await this.get<Document>(task.designRef as unknown as ElementId);
      if (doc) {
        hydrated.design = doc.content;
      }
    }

    return hydrated;
  }

  // --------------------------------------------------------------------------
  // Cache Management (Internal)
  // --------------------------------------------------------------------------

  /**
   * Rebuild the blocked cache from scratch.
   *
   * Use this for:
   * - Initial population after migration
   * - Recovery from cache corruption
   * - Periodic consistency checks
   *
   * @returns Statistics about the rebuild
   */
  rebuildBlockedCache(): { elementsChecked: number; elementsBlocked: number; durationMs: number } {
    return this.blockedCache.rebuild();
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new ElementalAPI instance
 *
 * @param backend - The storage backend to use
 * @returns A new ElementalAPI instance
 */
export function createElementalAPI(backend: StorageBackend): ElementalAPI {
  return new ElementalAPIImpl(backend);
}

/**
 * Elemental API Implementation
 *
 * This module provides the concrete implementation of the ElementalAPI interface,
 * connecting the type system to the storage layer with full CRUD operations.
 */

import type { StorageBackend } from '../storage/backend.js';
import type { Element, ElementId, EntityId, ElementType, Timestamp } from '../types/element.js';
import type { Task, HydratedTask, TaskStatus } from '../types/task.js';
import type { Document, DocumentId } from '../types/document.js';
import { isDocument } from '../types/document.js';
import type { Dependency, DependencyType } from '../types/dependency.js';
import type { Event, EventFilter, EventType } from '../types/event.js';
import { createTimestamp } from '../types/element.js';
import { isTask, TaskStatus as TaskStatusEnum } from '../types/task.js';
import { isPlan, PlanStatus as PlanStatusEnum, calculatePlanProgress, type PlanProgress } from '../types/plan.js';
import { createEvent, LifecycleEventType, MembershipEventType } from '../types/event.js';
import { NotFoundError, ConflictError, ConstraintError, ValidationError } from '../errors/error.js';
import { ErrorCode } from '../errors/codes.js';
import type { Channel } from '../types/channel.js';
import {
  ChannelTypeValue,
  generateDirectChannelName,
  createDirectChannel,
  isMember,
  canModifyMembers,
  DirectChannelMembershipError,
  NotAMemberError,
  CannotModifyMembersError,
} from '../types/channel.js';
import { createMessage } from '../types/message.js';
import type { Message } from '../types/message.js';
import { BlockedCacheService, createBlockedCacheService } from '../services/blocked-cache.js';
import { SyncService } from '../sync/service.js';
import { computeContentHashSync } from '../sync/hash.js';
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
  AddTaskToPlanOptions,
  CreateTaskInPlanOptions,
  BulkCloseOptions,
  BulkDeferOptions,
  BulkReassignOptions,
  BulkTagOptions,
  BulkOperationResult,
} from './types.js';
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  type ApprovalResult,
  type AddMemberOptions,
  type RemoveMemberOptions,
  type MembershipResult,
  type FindOrCreateDirectChannelResult,
  type SendDirectMessageInput,
  type SendDirectMessageResult,
} from './types.js';
import type { Plan } from '../types/plan.js';
import { generateChildId } from '../id/generator.js';
import type { CreateTaskInput } from '../types/task.js';
import { createTask } from '../types/task.js';

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
  content_hash: string;
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

  // Compute content hash for conflict detection
  const { hash: contentHash } = computeContentHashSync(element);

  return {
    id,
    type,
    data,
    content_hash: contentHash,
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

    // Set up automatic status transitions for blocked/unblocked states
    this.blockedCache.setStatusTransitionCallback({
      onBlock: (elementId: ElementId, previousStatus: string) => {
        this.updateTaskStatusInternal(elementId, TaskStatusEnum.BLOCKED, previousStatus);
      },
      onUnblock: (elementId: ElementId, statusToRestore: string) => {
        this.updateTaskStatusInternal(elementId, statusToRestore as TaskStatus, null);
      },
    });
  }

  /**
   * Internal method to update task status without triggering additional blocked cache updates.
   * Used for automatic blocked/unblocked status transitions.
   */
  private updateTaskStatusInternal(
    elementId: ElementId,
    newStatus: TaskStatus,
    _previousStatus: string | null
  ): void {
    // Get current element
    const row = this.backend.queryOne<ElementRow>(
      'SELECT * FROM elements WHERE id = ?',
      [elementId]
    );

    if (!row || row.type !== 'task') {
      return;
    }

    // Parse current data
    const data = JSON.parse(row.data);
    const oldStatus = data.status;

    // Don't update if already at target status
    if (oldStatus === newStatus) {
      return;
    }

    // Update status in data
    data.status = newStatus;

    // Update timestamps based on transition
    const now = createTimestamp();
    if (newStatus === TaskStatusEnum.CLOSED && !data.closedAt) {
      data.closedAt = now;
    } else if (newStatus !== TaskStatusEnum.CLOSED && data.closedAt) {
      data.closedAt = null;
    }

    // Update in database
    this.backend.run(
      `UPDATE elements SET data = ?, updated_at = ? WHERE id = ?`,
      [JSON.stringify(data), now, elementId]
    );

    // Record event for automatic status transition
    const eventType = newStatus === TaskStatusEnum.BLOCKED
      ? 'auto_blocked' as EventType
      : 'auto_unblocked' as EventType;
    const event = createEvent({
      elementId,
      eventType,
      actor: 'system:blocked-cache' as EntityId,
      oldValue: { status: oldStatus },
      newValue: { status: newStatus },
    });
    this.backend.run(
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

    // Mark as dirty for sync
    this.backend.markDirty(elementId);
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

    // Apply hydration if requested and items are tasks
    let finalItems: T[] = filteredItems;
    if (effectiveFilter.hydrate) {
      const tasks = filteredItems.filter((item): item is Task & T => isTask(item));
      if (tasks.length > 0) {
        const hydratedTasks = this.hydrateTasks(tasks, effectiveFilter.hydrate);
        // Create a map for efficient lookup
        const hydratedMap = new Map(hydratedTasks.map((t) => [t.id, t]));
        // Replace tasks with hydrated versions, keeping non-tasks as-is
        finalItems = filteredItems.map((item) => {
          const hydrated = hydratedMap.get(item.id);
          return hydrated ? (hydrated as unknown as T) : item;
        });
      }
    }

    return {
      items: finalItems,
      total,
      offset,
      limit,
      hasMore: offset + finalItems.length < total,
    };
  }

  async create<T extends Element>(input: Record<string, unknown> & { type: ElementType; createdBy: EntityId }): Promise<T> {
    // The input should already be a validated element from the factory functions
    // We just need to persist it
    const element = input as unknown as T;

    // Entity name uniqueness validation
    if (element.type === 'entity') {
      const entityData = element as unknown as { name?: string };
      if (entityData.name) {
        const existing = await this.lookupEntityByName(entityData.name);
        if (existing) {
          throw new ConflictError(
            `Entity with name "${entityData.name}" already exists`,
            ErrorCode.DUPLICATE_NAME,
            { name: entityData.name, existingId: existing.id }
          );
        }
      }
    }

    // Channel name uniqueness validation (group channels only)
    if (element.type === 'channel') {
      const channelData = element as unknown as {
        name?: string;
        channelType?: string;
        permissions?: { visibility?: string };
      };
      // Only validate group channels (direct channels have deterministic names)
      if (channelData.channelType === ChannelTypeValue.GROUP && channelData.name) {
        const visibility = channelData.permissions?.visibility ?? 'private';
        // Check for existing channel with same name and visibility scope
        const existingRow = this.backend.queryOne<ElementRow>(
          `SELECT * FROM elements
           WHERE type = 'channel'
           AND JSON_EXTRACT(data, '$.channelType') = 'group'
           AND JSON_EXTRACT(data, '$.name') = ?
           AND JSON_EXTRACT(data, '$.permissions.visibility') = ?
           AND deleted_at IS NULL`,
          [channelData.name, visibility]
        );
        if (existingRow) {
          throw new ConflictError(
            `Channel with name "${channelData.name}" already exists in ${visibility} scope`,
            ErrorCode.DUPLICATE_NAME,
            { name: channelData.name, visibility, existingId: existingRow.id }
          );
        }
      }
    }

    // Message sender membership validation
    if (element.type === 'message') {
      const messageData = element as unknown as Message;
      // Get the channel
      const channelRow = this.backend.queryOne<ElementRow>(
        `SELECT * FROM elements WHERE id = ? AND deleted_at IS NULL`,
        [messageData.channelId]
      );
      if (!channelRow) {
        throw new NotFoundError(
          `Channel not found: ${messageData.channelId}`,
          ErrorCode.NOT_FOUND,
          { elementId: messageData.channelId }
        );
      }
      const tagRows = this.backend.query<TagRow>(
        'SELECT tag FROM tags WHERE element_id = ?',
        [channelRow.id]
      );
      const tags = tagRows.map((r) => r.tag);
      const channel = deserializeElement<Channel>(channelRow, tags);
      // Validate sender is a channel member
      if (!isMember(channel, messageData.sender)) {
        throw new NotAMemberError(channel.id, messageData.sender);
      }
    }

    // Serialize for storage
    const serialized = serializeElement(element);

    // Insert in a transaction
    this.backend.transaction((tx) => {
      // Insert the element
      tx.run(
        `INSERT INTO elements (id, type, data, content_hash, created_at, updated_at, created_by, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          serialized.id,
          serialized.type,
          serialized.data,
          serialized.content_hash,
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
    let updated: T = {
      ...existing,
      ...updates,
      id: existing.id, // Cannot change ID
      type: existing.type, // Cannot change type
      createdAt: existing.createdAt, // Cannot change creation time
      createdBy: existing.createdBy, // Cannot change creator
      updatedAt: now,
    };

    // For documents, auto-increment version and link to previous version
    if (isDocument(existing)) {
      const doc = existing as Document;
      updated = {
        ...updated,
        version: doc.version + 1,
        previousVersionId: doc.id as unknown as DocumentId,
      } as T;
    }

    // Serialize for storage
    const serialized = serializeElement(updated);

    // Update in a transaction
    this.backend.transaction((tx) => {
      // For documents, save current version to version history before updating
      if (isDocument(existing)) {
        const doc = existing as Document;
        // Serialize the current document data for version storage
        const versionData = JSON.stringify({
          contentType: doc.contentType,
          content: doc.content,
          version: doc.version,
          previousVersionId: doc.previousVersionId,
          createdBy: doc.createdBy,
          tags: doc.tags,
          metadata: doc.metadata,
        });
        tx.run(
          `INSERT INTO document_versions (id, version, data, created_at) VALUES (?, ?, ?, ?)`,
          [doc.id, doc.version, versionData, doc.updatedAt]
        );
      }

      // Update the element
      tx.run(
        `UPDATE elements SET data = ?, content_hash = ?, updated_at = ?, deleted_at = ?
         WHERE id = ?`,
        [serialized.data, serialized.content_hash, serialized.updated_at, serialized.deleted_at, id]
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

      // Determine the appropriate event type based on status changes
      const existingData = existing as Record<string, unknown>;
      const updatedData = updated as unknown as Record<string, unknown>;
      const oldStatus = existingData.status as string | undefined;
      const newStatus = updatedData.status as string | undefined;

      let eventType: EventType = LifecycleEventType.UPDATED;
      if (oldStatus !== newStatus && newStatus !== undefined) {
        // Handle Task status changes
        if (isTask(existing)) {
          if (newStatus === TaskStatusEnum.CLOSED) {
            // Transitioning TO closed status
            eventType = LifecycleEventType.CLOSED;
          } else if (oldStatus === TaskStatusEnum.CLOSED) {
            // Transitioning FROM closed status (reopening)
            eventType = LifecycleEventType.REOPENED;
          }
        }
        // Handle Plan status changes
        else if (isPlan(existing)) {
          if (newStatus === PlanStatusEnum.COMPLETED || newStatus === PlanStatusEnum.CANCELLED) {
            // Transitioning TO completed or cancelled status (terminal states)
            eventType = LifecycleEventType.CLOSED;
          } else if (oldStatus === PlanStatusEnum.COMPLETED || oldStatus === PlanStatusEnum.CANCELLED) {
            // Transitioning FROM completed/cancelled status (reopening/restarting)
            eventType = LifecycleEventType.REOPENED;
          }
        }
      }

      // Record the event with the determined type
      const event = createEvent({
        elementId: id,
        eventType,
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
    const existingDataPost = existing as Record<string, unknown>;
    const updatedDataPost = updated as unknown as Record<string, unknown>;
    const oldStatusPost = existingDataPost.status as string | undefined;
    const newStatusPost = updatedDataPost.status as string | undefined;
    if (oldStatusPost !== newStatusPost && newStatusPost !== undefined) {
      this.blockedCache.onStatusChanged(id, oldStatusPost ?? null, newStatusPost);
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
  // Plan Operations
  // --------------------------------------------------------------------------

  async addTaskToPlan(
    taskId: ElementId,
    planId: ElementId,
    options?: AddTaskToPlanOptions
  ): Promise<Dependency> {
    // Verify task exists and is a task
    const task = await this.get<Task>(taskId);
    if (!task) {
      throw new NotFoundError(
        `Task not found: ${taskId}`,
        ErrorCode.NOT_FOUND,
        { elementId: taskId }
      );
    }
    if (task.type !== 'task') {
      throw new ConstraintError(
        `Element is not a task: ${taskId}`,
        ErrorCode.TYPE_MISMATCH,
        { elementId: taskId, actualType: task.type, expectedType: 'task' }
      );
    }

    // Verify plan exists and is a plan
    const plan = await this.get<Plan>(planId);
    if (!plan) {
      throw new NotFoundError(
        `Plan not found: ${planId}`,
        ErrorCode.NOT_FOUND,
        { elementId: planId }
      );
    }
    if (plan.type !== 'plan') {
      throw new ConstraintError(
        `Element is not a plan: ${planId}`,
        ErrorCode.TYPE_MISMATCH,
        { elementId: planId, actualType: plan.type, expectedType: 'plan' }
      );
    }

    // Check if task is already in any plan
    const existingParentDeps = await this.getDependencies(taskId, ['parent-child']);
    if (existingParentDeps.length > 0) {
      const existingPlanId = existingParentDeps[0].targetId;
      throw new ConstraintError(
        `Task is already in plan: ${existingPlanId}`,
        ErrorCode.ALREADY_IN_PLAN,
        { taskId, existingPlanId }
      );
    }

    // Resolve actor
    const actor = options?.actor ?? task.createdBy;

    // Create parent-child dependency from task to plan
    const dependency = await this.addDependency({
      sourceId: taskId,
      targetId: planId,
      type: 'parent-child',
      actor,
    });

    return dependency;
  }

  async removeTaskFromPlan(
    taskId: ElementId,
    planId: ElementId,
    actor?: EntityId
  ): Promise<void> {
    // Check if the task-plan relationship exists
    const existingDeps = await this.getDependencies(taskId, ['parent-child']);
    const hasRelation = existingDeps.some((d) => d.targetId === planId);

    if (!hasRelation) {
      throw new NotFoundError(
        `Task ${taskId} is not in plan ${planId}`,
        ErrorCode.DEPENDENCY_NOT_FOUND,
        { taskId, planId }
      );
    }

    // Remove the parent-child dependency
    await this.removeDependency(taskId, planId, 'parent-child', actor);
  }

  async getTasksInPlan(planId: ElementId, filter?: TaskFilter): Promise<Task[]> {
    // Verify plan exists
    const plan = await this.get<Plan>(planId);
    if (!plan) {
      throw new NotFoundError(
        `Plan not found: ${planId}`,
        ErrorCode.NOT_FOUND,
        { elementId: planId }
      );
    }
    if (plan.type !== 'plan') {
      throw new ConstraintError(
        `Element is not a plan: ${planId}`,
        ErrorCode.TYPE_MISMATCH,
        { elementId: planId, actualType: plan.type, expectedType: 'plan' }
      );
    }

    // Get all elements that have parent-child dependency to this plan
    const dependents = await this.getDependents(planId, ['parent-child']);

    // If no dependents, return empty array
    if (dependents.length === 0) {
      return [];
    }

    // Fetch tasks by their IDs
    const taskIds = dependents.map((d) => d.sourceId);
    const tasks: Task[] = [];

    for (const taskId of taskIds) {
      const task = await this.get<Task>(taskId);
      if (task && task.type === 'task') {
        tasks.push(task);
      }
    }

    // Apply filters if provided
    let filteredTasks = tasks;

    if (filter?.status) {
      const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
      filteredTasks = filteredTasks.filter((t) => statuses.includes(t.status));
    }

    if (filter?.priority) {
      const priorities = Array.isArray(filter.priority) ? filter.priority : [filter.priority];
      filteredTasks = filteredTasks.filter((t) => priorities.includes(t.priority));
    }

    if (filter?.assignee) {
      filteredTasks = filteredTasks.filter((t) => t.assignee === filter.assignee);
    }

    if (filter?.owner) {
      filteredTasks = filteredTasks.filter((t) => t.owner === filter.owner);
    }

    if (filter?.tags && filter.tags.length > 0) {
      filteredTasks = filteredTasks.filter((t) =>
        filter.tags!.every((tag) => t.tags.includes(tag))
      );
    }

    if (filter?.includeDeleted !== true) {
      filteredTasks = filteredTasks.filter((t) => t.status !== 'tombstone');
    }

    return filteredTasks;
  }

  async getPlanProgress(planId: ElementId): Promise<PlanProgress> {
    // Verify plan exists
    const plan = await this.get<Plan>(planId);
    if (!plan) {
      throw new NotFoundError(
        `Plan not found: ${planId}`,
        ErrorCode.NOT_FOUND,
        { elementId: planId }
      );
    }
    if (plan.type !== 'plan') {
      throw new ConstraintError(
        `Element is not a plan: ${planId}`,
        ErrorCode.TYPE_MISMATCH,
        { elementId: planId, actualType: plan.type, expectedType: 'plan' }
      );
    }

    // Get all tasks in the plan (excluding tombstones)
    const tasks = await this.getTasksInPlan(planId, { includeDeleted: false });

    // Count tasks by status
    const statusCounts: Record<string, number> = {
      open: 0,
      in_progress: 0,
      blocked: 0,
      closed: 0,
      deferred: 0,
      tombstone: 0,
    };

    for (const task of tasks) {
      if (task.status in statusCounts) {
        statusCounts[task.status]++;
      }
    }

    // Use the calculatePlanProgress utility
    return calculatePlanProgress(statusCounts as Record<import('../types/task.js').TaskStatus, number>);
  }

  async createTaskInPlan<T extends Task = Task>(
    planId: ElementId,
    taskInput: Omit<CreateTaskInput, 'id'>,
    options?: CreateTaskInPlanOptions
  ): Promise<T> {
    // Verify plan exists
    const plan = await this.get<Plan>(planId);
    if (!plan) {
      throw new NotFoundError(
        `Plan not found: ${planId}`,
        ErrorCode.NOT_FOUND,
        { elementId: planId }
      );
    }
    if (plan.type !== 'plan') {
      throw new ConstraintError(
        `Element is not a plan: ${planId}`,
        ErrorCode.TYPE_MISMATCH,
        { elementId: planId, actualType: plan.type, expectedType: 'plan' }
      );
    }

    // Check plan is in valid status for adding tasks
    if (plan.status !== PlanStatusEnum.DRAFT && plan.status !== PlanStatusEnum.ACTIVE) {
      throw new ValidationError(
        `Cannot add tasks to plan in status: ${plan.status}`,
        ErrorCode.INVALID_STATUS,
        { planId, status: plan.status, allowedStatuses: ['draft', 'active'] }
      );
    }

    // Generate hierarchical ID if requested (default: true)
    const useHierarchical = options?.useHierarchicalId !== false;
    let taskId: ElementId | undefined;

    if (useHierarchical) {
      // Get next child number atomically
      const childNumber = this.backend.getNextChildNumber(planId);
      taskId = generateChildId(planId, childNumber);
    }

    // Create a properly-formed task using the createTask factory
    const taskElement = await createTask({
      ...taskInput,
      id: taskId,
    });

    const task = await this.create<T>(taskElement as unknown as Record<string, unknown> & { type: ElementType; createdBy: EntityId });

    // Create parent-child dependency
    const actor = options?.actor ?? taskInput.createdBy;
    await this.addDependency({
      sourceId: task.id,
      targetId: planId,
      type: 'parent-child',
      actor,
    });

    return task;
  }

  // --------------------------------------------------------------------------
  // Plan Bulk Operations
  // --------------------------------------------------------------------------

  async bulkClosePlanTasks(
    planId: ElementId,
    options?: BulkCloseOptions
  ): Promise<BulkOperationResult> {
    // Verify plan exists
    const plan = await this.get<Plan>(planId);
    if (!plan) {
      throw new NotFoundError(
        `Plan not found: ${planId}`,
        ErrorCode.NOT_FOUND,
        { elementId: planId }
      );
    }
    if (plan.type !== 'plan') {
      throw new ConstraintError(
        `Element is not a plan: ${planId}`,
        ErrorCode.TYPE_MISMATCH,
        { elementId: planId, actualType: plan.type, expectedType: 'plan' }
      );
    }

    // Get all tasks in the plan
    const tasks = await this.getTasksInPlan(planId, options?.filter);

    const result: BulkOperationResult = {
      updated: 0,
      skipped: 0,
      updatedIds: [],
      skippedIds: [],
      errors: [],
    };

    const actor = options?.actor ?? plan.createdBy;
    const closeReason = options?.closeReason;

    for (const task of tasks) {
      // Skip tasks that are already closed or tombstoned
      if (task.status === TaskStatusEnum.CLOSED || task.status === TaskStatusEnum.TOMBSTONE) {
        result.skipped++;
        result.skippedIds.push(task.id);
        continue;
      }

      try {
        // Update task status to closed
        const updates: Partial<Task> = {
          status: TaskStatusEnum.CLOSED,
          closedAt: createTimestamp(),
        };
        if (closeReason) {
          updates.closeReason = closeReason;
        }

        await this.update<Task>(task.id, updates, { actor });
        result.updated++;
        result.updatedIds.push(task.id);
      } catch (error) {
        result.errors.push({
          taskId: task.id,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return result;
  }

  async bulkDeferPlanTasks(
    planId: ElementId,
    options?: BulkDeferOptions
  ): Promise<BulkOperationResult> {
    // Verify plan exists
    const plan = await this.get<Plan>(planId);
    if (!plan) {
      throw new NotFoundError(
        `Plan not found: ${planId}`,
        ErrorCode.NOT_FOUND,
        { elementId: planId }
      );
    }
    if (plan.type !== 'plan') {
      throw new ConstraintError(
        `Element is not a plan: ${planId}`,
        ErrorCode.TYPE_MISMATCH,
        { elementId: planId, actualType: plan.type, expectedType: 'plan' }
      );
    }

    // Get all tasks in the plan
    const tasks = await this.getTasksInPlan(planId, options?.filter);

    const result: BulkOperationResult = {
      updated: 0,
      skipped: 0,
      updatedIds: [],
      skippedIds: [],
      errors: [],
    };

    const actor = options?.actor ?? plan.createdBy;

    // Valid statuses for defer transition
    const deferableStatuses: TaskStatus[] = [TaskStatusEnum.OPEN, TaskStatusEnum.IN_PROGRESS, TaskStatusEnum.BLOCKED];

    for (const task of tasks) {
      // Skip tasks that can't be deferred
      if (!deferableStatuses.includes(task.status)) {
        result.skipped++;
        result.skippedIds.push(task.id);
        continue;
      }

      try {
        await this.update<Task>(task.id, { status: TaskStatusEnum.DEFERRED }, { actor });
        result.updated++;
        result.updatedIds.push(task.id);
      } catch (error) {
        result.errors.push({
          taskId: task.id,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return result;
  }

  async bulkReassignPlanTasks(
    planId: ElementId,
    newAssignee: EntityId | undefined,
    options?: BulkReassignOptions
  ): Promise<BulkOperationResult> {
    // Verify plan exists
    const plan = await this.get<Plan>(planId);
    if (!plan) {
      throw new NotFoundError(
        `Plan not found: ${planId}`,
        ErrorCode.NOT_FOUND,
        { elementId: planId }
      );
    }
    if (plan.type !== 'plan') {
      throw new ConstraintError(
        `Element is not a plan: ${planId}`,
        ErrorCode.TYPE_MISMATCH,
        { elementId: planId, actualType: plan.type, expectedType: 'plan' }
      );
    }

    // Get all tasks in the plan
    const tasks = await this.getTasksInPlan(planId, options?.filter);

    const result: BulkOperationResult = {
      updated: 0,
      skipped: 0,
      updatedIds: [],
      skippedIds: [],
      errors: [],
    };

    const actor = options?.actor ?? plan.createdBy;

    for (const task of tasks) {
      // Skip tasks that already have the same assignee
      if (task.assignee === newAssignee) {
        result.skipped++;
        result.skippedIds.push(task.id);
        continue;
      }

      // Skip tombstone tasks
      if (task.status === TaskStatusEnum.TOMBSTONE) {
        result.skipped++;
        result.skippedIds.push(task.id);
        continue;
      }

      try {
        await this.update<Task>(task.id, { assignee: newAssignee }, { actor });
        result.updated++;
        result.updatedIds.push(task.id);
      } catch (error) {
        result.errors.push({
          taskId: task.id,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return result;
  }

  async bulkTagPlanTasks(
    planId: ElementId,
    options: BulkTagOptions
  ): Promise<BulkOperationResult> {
    // Verify plan exists
    const plan = await this.get<Plan>(planId);
    if (!plan) {
      throw new NotFoundError(
        `Plan not found: ${planId}`,
        ErrorCode.NOT_FOUND,
        { elementId: planId }
      );
    }
    if (plan.type !== 'plan') {
      throw new ConstraintError(
        `Element is not a plan: ${planId}`,
        ErrorCode.TYPE_MISMATCH,
        { elementId: planId, actualType: plan.type, expectedType: 'plan' }
      );
    }

    // Validate that at least one tag operation is specified
    if ((!options.addTags || options.addTags.length === 0) &&
        (!options.removeTags || options.removeTags.length === 0)) {
      throw new ValidationError(
        'At least one of addTags or removeTags must be specified',
        ErrorCode.INVALID_INPUT,
        { addTags: options.addTags, removeTags: options.removeTags }
      );
    }

    // Get all tasks in the plan
    const tasks = await this.getTasksInPlan(planId, options?.filter);

    const result: BulkOperationResult = {
      updated: 0,
      skipped: 0,
      updatedIds: [],
      skippedIds: [],
      errors: [],
    };

    const actor = options?.actor ?? plan.createdBy;
    const tagsToAdd = options.addTags ?? [];
    const tagsToRemove = new Set(options.removeTags ?? []);

    for (const task of tasks) {
      // Skip tombstone tasks
      if (task.status === TaskStatusEnum.TOMBSTONE) {
        result.skipped++;
        result.skippedIds.push(task.id);
        continue;
      }

      // Calculate new tags
      const existingTags = new Set(task.tags);

      // Remove tags first
      for (const tag of tagsToRemove) {
        existingTags.delete(tag);
      }

      // Then add tags
      for (const tag of tagsToAdd) {
        existingTags.add(tag);
      }

      const newTags = Array.from(existingTags).sort();
      const oldTags = [...task.tags].sort();

      // Skip if tags haven't changed
      if (newTags.length === oldTags.length && newTags.every((t, i) => t === oldTags[i])) {
        result.skipped++;
        result.skippedIds.push(task.id);
        continue;
      }

      try {
        await this.update<Task>(task.id, { tags: newTags }, { actor });
        result.updated++;
        result.updatedIds.push(task.id);
      } catch (error) {
        result.errors.push({
          taskId: task.id,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return result;
  }

  // --------------------------------------------------------------------------
  // Task Operations
  // --------------------------------------------------------------------------

  async ready(filter?: TaskFilter): Promise<Task[]> {
    // Extract limit to apply after sorting
    const limit = filter?.limit;
    const effectiveFilter: TaskFilter = {
      ...filter,
      type: 'task',
      status: [TaskStatusEnum.OPEN, TaskStatusEnum.IN_PROGRESS],
      limit: undefined, // Don't limit at DB level - we'll apply after sorting
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

    // Sort by priority ascending (1 = highest/critical, 5 = lowest/minimal)
    readyTasks.sort((a, b) => a.priority - b.priority);

    // Apply limit after sorting
    if (limit !== undefined) {
      return readyTasks.slice(0, limit);
    }

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
  // Gate Satisfaction
  // --------------------------------------------------------------------------

  async satisfyGate(
    sourceId: ElementId,
    targetId: ElementId,
    actor: EntityId
  ): Promise<boolean> {
    return this.blockedCache.satisfyGate(sourceId, targetId, actor);
  }

  async recordApproval(
    sourceId: ElementId,
    targetId: ElementId,
    approver: EntityId
  ): Promise<ApprovalResult> {
    return this.blockedCache.recordApproval(sourceId, targetId, approver);
  }

  async removeApproval(
    sourceId: ElementId,
    targetId: ElementId,
    approver: EntityId
  ): Promise<ApprovalResult> {
    return this.blockedCache.removeApproval(sourceId, targetId, approver);
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
  // Channel Operations
  // --------------------------------------------------------------------------

  async findOrCreateDirectChannel(
    entityA: EntityId,
    entityB: EntityId,
    actor: EntityId
  ): Promise<FindOrCreateDirectChannelResult> {
    // Validate actor is one of the entities
    if (actor !== entityA && actor !== entityB) {
      throw new ValidationError(
        'Actor must be one of the channel entities',
        ErrorCode.INVALID_INPUT,
        { field: 'actor', value: actor, expected: 'entityA or entityB' }
      );
    }

    // Generate deterministic name for the direct channel
    const channelName = generateDirectChannelName(entityA, entityB);

    // Try to find existing channel
    const existingRow = this.backend.queryOne<ElementRow>(
      `SELECT * FROM elements
       WHERE type = 'channel'
       AND JSON_EXTRACT(data, '$.channelType') = 'direct'
       AND JSON_EXTRACT(data, '$.name') = ?
       AND deleted_at IS NULL`,
      [channelName]
    );

    if (existingRow) {
      // Found existing channel, return it
      const tagRows = this.backend.query<TagRow>(
        'SELECT tag FROM tags WHERE element_id = ?',
        [existingRow.id]
      );
      const tags = tagRows.map((r) => r.tag);
      const channel = deserializeElement<Channel>(existingRow, tags);
      return { channel, created: false };
    }

    // No existing channel, create a new one
    const newChannel = await createDirectChannel({
      entityA,
      entityB,
      createdBy: actor,
    });

    const createdChannel = await this.create<Channel>(
      newChannel as unknown as Element & Record<string, unknown>
    );

    return { channel: createdChannel, created: true };
  }

  async addChannelMember(
    channelId: ElementId,
    entityId: EntityId,
    options?: AddMemberOptions
  ): Promise<MembershipResult> {
    // Get the channel
    const channel = await this.get<Channel>(channelId);
    if (!channel) {
      throw new NotFoundError(
        `Channel not found: ${channelId}`,
        ErrorCode.NOT_FOUND,
        { elementId: channelId }
      );
    }

    // Verify it's a channel
    if (channel.type !== 'channel') {
      throw new ConstraintError(
        `Element is not a channel: ${channelId}`,
        ErrorCode.TYPE_MISMATCH,
        { elementId: channelId, actualType: channel.type, expectedType: 'channel' }
      );
    }

    // Cast to Channel type (type guard validated above)
    const typedChannel = channel as Channel;

    // Direct channels cannot have membership modified
    if (typedChannel.channelType === ChannelTypeValue.DIRECT) {
      throw new DirectChannelMembershipError(channelId, 'add');
    }

    // Get actor
    const actor = options?.actor ?? typedChannel.createdBy;

    // Check actor has permission to modify members
    if (!canModifyMembers(typedChannel, actor)) {
      throw new CannotModifyMembersError(channelId, actor);
    }

    // Check if entity is already a member
    if (isMember(typedChannel, entityId)) {
      // Already a member, return success without change
      return { success: true, channel: typedChannel, entityId };
    }

    // Add member
    const newMembers = [...typedChannel.members, entityId];
    const now = createTimestamp();

    // Update channel and record event in transaction
    this.backend.transaction((tx) => {
      // Get current data
      const row = this.backend.queryOne<ElementRow>(
        'SELECT data FROM elements WHERE id = ?',
        [channelId]
      );
      if (!row) return;

      const data = JSON.parse(row.data);
      data.members = newMembers;

      // Recompute content hash
      const updatedChannel = { ...typedChannel, members: newMembers, updatedAt: now };
      const { hash: contentHash } = computeContentHashSync(updatedChannel as unknown as Element);

      // Update element
      tx.run(
        `UPDATE elements SET data = ?, content_hash = ?, updated_at = ? WHERE id = ?`,
        [JSON.stringify(data), contentHash, now, channelId]
      );

      // Record membership event
      const event = createEvent({
        elementId: channelId,
        eventType: MembershipEventType.MEMBER_ADDED,
        actor,
        oldValue: { members: typedChannel.members },
        newValue: { members: newMembers, addedMember: entityId },
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

    // Mark as dirty
    this.backend.markDirty(channelId);

    // Return updated channel
    const updatedChannel = await this.get<Channel>(channelId);
    return {
      success: true,
      channel: updatedChannel!,
      entityId,
    };
  }

  async removeChannelMember(
    channelId: ElementId,
    entityId: EntityId,
    options?: RemoveMemberOptions
  ): Promise<MembershipResult> {
    // Get the channel
    const channel = await this.get<Channel>(channelId);
    if (!channel) {
      throw new NotFoundError(
        `Channel not found: ${channelId}`,
        ErrorCode.NOT_FOUND,
        { elementId: channelId }
      );
    }

    // Verify it's a channel
    if (channel.type !== 'channel') {
      throw new ConstraintError(
        `Element is not a channel: ${channelId}`,
        ErrorCode.TYPE_MISMATCH,
        { elementId: channelId, actualType: channel.type, expectedType: 'channel' }
      );
    }

    // Cast to Channel type (type guard validated above)
    const typedChannel = channel as Channel;

    // Direct channels cannot have membership modified
    if (typedChannel.channelType === ChannelTypeValue.DIRECT) {
      throw new DirectChannelMembershipError(channelId, 'remove');
    }

    // Get actor
    const actor = options?.actor ?? typedChannel.createdBy;

    // Check actor has permission to modify members
    if (!canModifyMembers(typedChannel, actor)) {
      throw new CannotModifyMembersError(channelId, actor);
    }

    // Check if entity is a member
    if (!isMember(typedChannel, entityId)) {
      throw new NotAMemberError(channelId, entityId);
    }

    // Remove member
    const newMembers = typedChannel.members.filter((m) => m !== entityId);
    // Also remove from modifyMembers if present
    const newModifyMembers = typedChannel.permissions.modifyMembers.filter((m) => m !== entityId);
    const now = createTimestamp();

    // Update channel and record event in transaction
    this.backend.transaction((tx) => {
      // Get current data
      const row = this.backend.queryOne<ElementRow>(
        'SELECT data FROM elements WHERE id = ?',
        [channelId]
      );
      if (!row) return;

      const data = JSON.parse(row.data);
      data.members = newMembers;
      data.permissions = {
        ...data.permissions,
        modifyMembers: newModifyMembers,
      };

      // Recompute content hash
      const updatedChannel = {
        ...typedChannel,
        members: newMembers,
        permissions: { ...typedChannel.permissions, modifyMembers: newModifyMembers },
        updatedAt: now,
      };
      const { hash: contentHash } = computeContentHashSync(updatedChannel as unknown as Element);

      // Update element
      tx.run(
        `UPDATE elements SET data = ?, content_hash = ?, updated_at = ? WHERE id = ?`,
        [JSON.stringify(data), contentHash, now, channelId]
      );

      // Record membership event
      const event = createEvent({
        elementId: channelId,
        eventType: MembershipEventType.MEMBER_REMOVED,
        actor,
        oldValue: { members: typedChannel.members },
        newValue: {
          members: newMembers,
          removedMember: entityId,
          ...(options?.reason && { reason: options.reason }),
        },
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

    // Mark as dirty
    this.backend.markDirty(channelId);

    // Return updated channel
    const updatedChannel = await this.get<Channel>(channelId);
    return {
      success: true,
      channel: updatedChannel!,
      entityId,
    };
  }

  async leaveChannel(channelId: ElementId, actor: EntityId): Promise<MembershipResult> {
    // Get the channel
    const channel = await this.get<Channel>(channelId);
    if (!channel) {
      throw new NotFoundError(
        `Channel not found: ${channelId}`,
        ErrorCode.NOT_FOUND,
        { elementId: channelId }
      );
    }

    // Verify it's a channel
    if (channel.type !== 'channel') {
      throw new ConstraintError(
        `Element is not a channel: ${channelId}`,
        ErrorCode.TYPE_MISMATCH,
        { elementId: channelId, actualType: channel.type, expectedType: 'channel' }
      );
    }

    // Cast to Channel type (type guard validated above)
    const typedChannel = channel as Channel;

    // Direct channels cannot be left
    if (typedChannel.channelType === ChannelTypeValue.DIRECT) {
      throw new ConstraintError(
        'Cannot leave a direct channel',
        ErrorCode.IMMUTABLE,
        { channelId, channelType: 'direct' }
      );
    }

    // Check if actor is a member
    if (!isMember(typedChannel, actor)) {
      throw new NotAMemberError(channelId, actor);
    }

    // Remove actor from members
    const newMembers = typedChannel.members.filter((m) => m !== actor);
    // Also remove from modifyMembers if present
    const newModifyMembers = typedChannel.permissions.modifyMembers.filter((m) => m !== actor);
    const now = createTimestamp();

    // Update channel and record event in transaction
    this.backend.transaction((tx) => {
      // Get current data
      const row = this.backend.queryOne<ElementRow>(
        'SELECT data FROM elements WHERE id = ?',
        [channelId]
      );
      if (!row) return;

      const data = JSON.parse(row.data);
      data.members = newMembers;
      data.permissions = {
        ...data.permissions,
        modifyMembers: newModifyMembers,
      };

      // Recompute content hash
      const updatedChannelData = {
        ...typedChannel,
        members: newMembers,
        permissions: { ...typedChannel.permissions, modifyMembers: newModifyMembers },
        updatedAt: now,
      };
      const { hash: contentHash } = computeContentHashSync(updatedChannelData as unknown as Element);

      // Update element
      tx.run(
        `UPDATE elements SET data = ?, content_hash = ?, updated_at = ? WHERE id = ?`,
        [JSON.stringify(data), contentHash, now, channelId]
      );

      // Record membership event (leaving is a special form of member_removed)
      const event = createEvent({
        elementId: channelId,
        eventType: MembershipEventType.MEMBER_REMOVED,
        actor,
        oldValue: { members: typedChannel.members },
        newValue: { members: newMembers, removedMember: actor, selfRemoval: true },
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

    // Mark as dirty
    this.backend.markDirty(channelId);

    // Return updated channel
    const updatedChannel = await this.get<Channel>(channelId);
    return {
      success: true,
      channel: updatedChannel!,
      entityId: actor,
    };
  }

  /**
   * Send a direct message to another entity
   *
   * This is a convenience method that:
   * 1. Finds or creates the direct channel between sender and recipient
   * 2. Creates and sends the message in that channel
   *
   * @param sender - The entity sending the message
   * @param input - The message input including recipient, contentRef, etc.
   * @returns The created message and channel information
   */
  async sendDirectMessage(
    sender: EntityId,
    input: SendDirectMessageInput
  ): Promise<SendDirectMessageResult> {
    // Find or create the direct channel
    const { channel, created: channelCreated } = await this.findOrCreateDirectChannel(
      sender,
      input.recipient,
      sender
    );

    // Create the message
    const message = await createMessage({
      channelId: channel.id as unknown as import('../types/message.js').ChannelId,
      sender,
      contentRef: input.contentRef,
      attachments: input.attachments,
      tags: input.tags,
      metadata: input.metadata,
    });

    // Persist the message (membership validation happens in create)
    const createdMessage = await this.create<Message>(
      message as unknown as Message & Record<string, unknown>
    );

    return {
      message: createdMessage,
      channel,
      channelCreated,
    };
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

  /**
   * Batch fetch documents by their IDs.
   * Returns a map of document ID to document for efficient lookup.
   */
  private batchFetchDocuments(documentIds: ElementId[]): Map<ElementId, Document> {
    if (documentIds.length === 0) {
      return new Map();
    }

    // Deduplicate IDs
    const uniqueIds = [...new Set(documentIds)];

    // Build query with placeholders
    const placeholders = uniqueIds.map(() => '?').join(', ');
    const sql = `SELECT * FROM elements WHERE id IN (${placeholders}) AND type = 'document'`;

    const rows = this.backend.query<ElementRow>(sql, uniqueIds);

    // Convert to map
    const documentMap = new Map<ElementId, Document>();
    for (const row of rows) {
      const tagRows = this.backend.query<TagRow>(
        'SELECT tag FROM tags WHERE element_id = ?',
        [row.id]
      );
      const tags = tagRows.map((r) => r.tag);
      const doc = deserializeElement<Document>(row, tags);
      documentMap.set(doc.id, doc);
    }

    return documentMap;
  }

  /**
   * Batch hydrate tasks with their document references.
   * Collects all document IDs, fetches them in a single query, then populates.
   */
  private hydrateTasks(tasks: Task[], options: HydrationOptions): HydratedTask[] {
    if (tasks.length === 0) {
      return [];
    }

    // Collect all document IDs to fetch
    const documentIds: ElementId[] = [];
    for (const task of tasks) {
      if (options.description && task.descriptionRef) {
        documentIds.push(task.descriptionRef as unknown as ElementId);
      }
      if (options.design && task.designRef) {
        documentIds.push(task.designRef as unknown as ElementId);
      }
    }

    // Batch fetch all documents
    const documentMap = this.batchFetchDocuments(documentIds);

    // Hydrate each task
    const hydrated: HydratedTask[] = tasks.map((task) => {
      const result: HydratedTask = { ...task };

      if (options.description && task.descriptionRef) {
        const doc = documentMap.get(task.descriptionRef as unknown as ElementId);
        if (doc) {
          result.description = doc.content;
        }
      }

      if (options.design && task.designRef) {
        const doc = documentMap.get(task.designRef as unknown as ElementId);
        if (doc) {
          result.design = doc.content;
        }
      }

      return result;
    });

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

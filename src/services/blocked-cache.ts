/**
 * Blocked Cache Service
 *
 * Maintains a materialized view of blocked elements for efficient ready-work queries.
 * The blocked_cache table provides ~25x speedup for large datasets by avoiding
 * recursive dependency checks on every query.
 *
 * Blocking Rules:
 * - `blocks` dependency: Source is blocked if target is not closed/tombstone
 * - `parent-child` dependency: Source inherits blocked state from parent (transitive)
 * - `awaits` dependency: Source is blocked until gate is satisfied (timer, approval, etc.)
 *
 * Cache Invalidation Triggers:
 * - Blocking dependency added/removed
 * - Element status changes (especially closing)
 * - Gate satisfaction changes
 * - Parent blocking state changes
 */

import type { StorageBackend } from '../storage/backend.js';
import type { Row } from '../storage/types.js';
import type { ElementId } from '../types/element.js';
import {
  type DependencyType,
  type AwaitsMetadata,
  DependencyType as DT,
  GateType,
  isValidAwaitsMetadata,
} from '../types/dependency.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Status values that indicate an element is "done" and doesn't block others
 */
const COMPLETED_STATUSES = ['closed', 'completed', 'tombstone'] as const;

/**
 * Row type for blocked_cache table
 */
interface BlockedCacheRow extends Row {
  element_id: string;
  blocked_by: string;
  reason: string | null;
}

/**
 * Row type for element queries
 */
interface ElementRow extends Row {
  id: string;
  type: string;
  data: string;
  deleted_at: string | null;
}

/**
 * Row type for dependency queries
 */
interface DependencyRow extends Row {
  source_id: string;
  target_id: string;
  type: string;
  created_at: string;
  created_by: string;
  metadata: string | null;
}

/**
 * Blocking information for an element
 */
export interface BlockingInfo {
  /** The element that is blocked */
  elementId: ElementId;
  /** The element causing the block */
  blockedBy: ElementId;
  /** Human-readable reason */
  reason: string;
}

/**
 * Result of a cache rebuild operation
 */
export interface CacheRebuildResult {
  /** Number of elements checked */
  elementsChecked: number;
  /** Number of elements added to blocked cache */
  elementsBlocked: number;
  /** Time taken in milliseconds */
  durationMs: number;
}

/**
 * Options for gate checking
 */
export interface GateCheckOptions {
  /** Current time for timer gate checks (defaults to now) */
  currentTime?: Date;
}

// ============================================================================
// BlockedCacheService Class
// ============================================================================

/**
 * Service for managing the blocked elements cache
 */
export class BlockedCacheService {
  constructor(private readonly db: StorageBackend) {}

  // --------------------------------------------------------------------------
  // Query Operations
  // --------------------------------------------------------------------------

  /**
   * Check if an element is blocked
   *
   * @param elementId - Element to check
   * @returns Blocking info if blocked, null if not blocked
   */
  isBlocked(elementId: ElementId): BlockingInfo | null {
    const row = this.db.queryOne<BlockedCacheRow>(
      'SELECT * FROM blocked_cache WHERE element_id = ?',
      [elementId]
    );

    if (!row) {
      return null;
    }

    return {
      elementId: row.element_id as ElementId,
      blockedBy: row.blocked_by as ElementId,
      reason: row.reason ?? 'Blocked by dependency',
    };
  }

  /**
   * Get all blocked elements
   *
   * @returns Array of blocking info for all blocked elements
   */
  getAllBlocked(): BlockingInfo[] {
    const rows = this.db.query<BlockedCacheRow>('SELECT * FROM blocked_cache');

    return rows.map((row) => ({
      elementId: row.element_id as ElementId,
      blockedBy: row.blocked_by as ElementId,
      reason: row.reason ?? 'Blocked by dependency',
    }));
  }

  /**
   * Get all elements blocked by a specific element
   *
   * @param blockerId - The element causing blocks
   * @returns Array of element IDs blocked by this element
   */
  getBlockedBy(blockerId: ElementId): ElementId[] {
    const rows = this.db.query<{ element_id: string }>(
      'SELECT element_id FROM blocked_cache WHERE blocked_by = ?',
      [blockerId]
    );

    return rows.map((row) => row.element_id as ElementId);
  }

  /**
   * Count blocked elements
   */
  count(): number {
    const row = this.db.queryOne<{ count: number }>(
      'SELECT COUNT(*) as count FROM blocked_cache'
    );
    return row?.count ?? 0;
  }

  // --------------------------------------------------------------------------
  // Cache Maintenance
  // --------------------------------------------------------------------------

  /**
   * Add a blocking entry to the cache
   *
   * @param elementId - Element being blocked
   * @param blockedBy - Element causing the block
   * @param reason - Human-readable reason
   */
  addBlocked(elementId: ElementId, blockedBy: ElementId, reason: string): void {
    this.db.run(
      `INSERT OR REPLACE INTO blocked_cache (element_id, blocked_by, reason)
       VALUES (?, ?, ?)`,
      [elementId, blockedBy, reason]
    );
  }

  /**
   * Remove a blocking entry from the cache
   *
   * @param elementId - Element to unblock
   */
  removeBlocked(elementId: ElementId): void {
    this.db.run('DELETE FROM blocked_cache WHERE element_id = ?', [elementId]);
  }

  /**
   * Clear all entries from the cache
   */
  clear(): void {
    this.db.run('DELETE FROM blocked_cache');
  }

  // --------------------------------------------------------------------------
  // Blocking State Computation
  // --------------------------------------------------------------------------

  /**
   * Check if a target element is in a completed state (doesn't block others)
   *
   * @param targetId - Element to check
   * @returns true if target is completed/closed/tombstone
   */
  isTargetCompleted(targetId: ElementId): boolean {
    const row = this.db.queryOne<ElementRow>(
      'SELECT id, data, deleted_at FROM elements WHERE id = ?',
      [targetId]
    );

    // Target doesn't exist - treat as non-blocking (external reference)
    if (!row) {
      return true;
    }

    // Deleted (tombstone)
    if (row.deleted_at) {
      return true;
    }

    // Check status in data
    try {
      const data = JSON.parse(row.data);
      const status = data.status;
      return COMPLETED_STATUSES.includes(status);
    } catch {
      return false;
    }
  }

  /**
   * Check if an awaits gate is satisfied
   *
   * @param metadata - The awaits dependency metadata
   * @param options - Gate check options
   * @returns true if gate is satisfied (not blocking)
   */
  isGateSatisfied(
    metadata: AwaitsMetadata,
    options: GateCheckOptions = {}
  ): boolean {
    const now = options.currentTime ?? new Date();

    switch (metadata.gateType) {
      case GateType.TIMER:
        // Timer gate: satisfied when current time >= waitUntil
        const waitUntil = new Date(metadata.waitUntil);
        return now >= waitUntil;

      case GateType.APPROVAL:
        // Approval gate: satisfied when enough approvers have approved
        const required = metadata.approvalCount ?? metadata.requiredApprovers.length;
        const current = metadata.currentApprovers?.length ?? 0;
        return current >= required;

      case GateType.EXTERNAL:
        // External gates are never satisfied via metadata alone
        // They require explicit API calls to mark as satisfied
        return false;

      case GateType.WEBHOOK:
        // Webhook gates are never satisfied via metadata alone
        // They require callback to mark as satisfied
        return false;

      default:
        return false;
    }
  }

  /**
   * Compute the blocking state for a single element
   *
   * @param elementId - Element to check
   * @param options - Gate check options
   * @returns Blocking info if blocked, null if not blocked
   */
  computeBlockingState(
    elementId: ElementId,
    options: GateCheckOptions = {}
  ): BlockingInfo | null {
    // Get all blocking dependencies for this element
    const deps = this.db.query<DependencyRow>(
      `SELECT * FROM dependencies
       WHERE source_id = ? AND type IN (?, ?, ?)`,
      [elementId, DT.BLOCKS, DT.PARENT_CHILD, DT.AWAITS]
    );

    for (const dep of deps) {
      const targetId = dep.target_id as ElementId;
      const type = dep.type as DependencyType;

      switch (type) {
        case DT.BLOCKS:
          // Check if target is completed
          if (!this.isTargetCompleted(targetId)) {
            return {
              elementId,
              blockedBy: targetId,
              reason: `Blocked by ${targetId} (blocks dependency)`,
            };
          }
          break;

        case DT.PARENT_CHILD:
          // Check if parent is blocked (transitive)
          const parentBlocked = this.isBlocked(targetId);
          if (parentBlocked) {
            return {
              elementId,
              blockedBy: targetId,
              reason: `Blocked by parent ${targetId} (parent is blocked)`,
            };
          }
          // Also check if parent itself is not completed (hierarchy blocking)
          if (!this.isTargetCompleted(targetId)) {
            return {
              elementId,
              blockedBy: targetId,
              reason: `Blocked by parent ${targetId} (parent not completed)`,
            };
          }
          break;

        case DT.AWAITS:
          // Check if gate is satisfied
          if (dep.metadata) {
            try {
              const metadata = JSON.parse(dep.metadata);
              if (isValidAwaitsMetadata(metadata)) {
                if (!this.isGateSatisfied(metadata, options)) {
                  return {
                    elementId,
                    blockedBy: targetId,
                    reason: `Blocked by gate (${metadata.gateType})`,
                  };
                }
              }
            } catch {
              // Invalid metadata, treat as blocking
              return {
                elementId,
                blockedBy: targetId,
                reason: 'Blocked by gate (invalid metadata)',
              };
            }
          }
          break;
      }
    }

    return null;
  }

  // --------------------------------------------------------------------------
  // Invalidation
  // --------------------------------------------------------------------------

  /**
   * Update blocking state for an element after a dependency change
   *
   * @param elementId - Element whose dependencies changed
   * @param options - Gate check options
   */
  invalidateElement(elementId: ElementId, options: GateCheckOptions = {}): void {
    const blocking = this.computeBlockingState(elementId, options);

    if (blocking) {
      this.addBlocked(blocking.elementId, blocking.blockedBy, blocking.reason);
    } else {
      this.removeBlocked(elementId);
    }
  }

  /**
   * Update blocking state for all elements that depend on a target
   * Called when target's status changes
   *
   * @param targetId - Element whose status changed
   * @param options - Gate check options
   */
  invalidateDependents(targetId: ElementId, options: GateCheckOptions = {}): void {
    // Find all elements that have blocking dependencies on this target
    const deps = this.db.query<DependencyRow>(
      `SELECT DISTINCT source_id FROM dependencies
       WHERE target_id = ? AND type IN (?, ?, ?)`,
      [targetId, DT.BLOCKS, DT.PARENT_CHILD, DT.AWAITS]
    );

    for (const dep of deps) {
      const sourceId = dep.source_id as ElementId;
      this.invalidateElement(sourceId, options);

      // For parent-child, also invalidate children (transitive)
      if (dep.type === DT.PARENT_CHILD) {
        this.invalidateChildren(sourceId, options);
      }
    }
  }

  /**
   * Recursively invalidate children of an element
   * Used for transitive parent-child blocking
   *
   * @param parentId - Parent element
   * @param options - Gate check options
   * @param visited - Set of already visited elements (cycle prevention)
   */
  private invalidateChildren(
    parentId: ElementId,
    options: GateCheckOptions = {},
    visited: Set<string> = new Set()
  ): void {
    if (visited.has(parentId)) {
      return;
    }
    visited.add(parentId);

    // Find all elements that have this as a parent
    const children = this.db.query<DependencyRow>(
      `SELECT source_id FROM dependencies
       WHERE target_id = ? AND type = ?`,
      [parentId, DT.PARENT_CHILD]
    );

    for (const child of children) {
      const childId = child.source_id as ElementId;
      this.invalidateElement(childId, options);
      this.invalidateChildren(childId, options, visited);
    }
  }

  // --------------------------------------------------------------------------
  // Full Rebuild
  // --------------------------------------------------------------------------

  /**
   * Rebuild the entire blocked cache from scratch
   *
   * This is useful for:
   * - Initial population after migration
   * - Recovery from cache corruption
   * - Periodic consistency checks
   *
   * The rebuild processes elements in topological order (parents before children)
   * to ensure transitive blocking is computed correctly.
   *
   * @param options - Gate check options
   * @returns Rebuild statistics
   */
  rebuild(options: GateCheckOptions = {}): CacheRebuildResult {
    const startTime = Date.now();

    // Clear existing cache
    this.clear();

    // Get all elements with blocking dependencies
    const elementsWithBlockingDeps = this.db.query<{ source_id: string }>(
      `SELECT DISTINCT source_id FROM dependencies
       WHERE type IN (?, ?, ?)`,
      [DT.BLOCKS, DT.PARENT_CHILD, DT.AWAITS]
    );

    let elementsChecked = 0;
    let elementsBlocked = 0;

    // Process elements in dependency order (BFS from roots)
    // This ensures parents are processed before children for transitive blocking
    const processed = new Set<string>();
    const queue: ElementId[] = [];

    // First pass: Find all elements and compute which have no unprocessed parents
    const elementSet = new Set(elementsWithBlockingDeps.map((e) => e.source_id));
    const parentOf = new Map<string, string[]>(); // child -> parents

    for (const elem of elementsWithBlockingDeps) {
      const sourceId = elem.source_id;
      const parents = this.db.query<DependencyRow>(
        `SELECT target_id FROM dependencies
         WHERE source_id = ? AND type = ?`,
        [sourceId, DT.PARENT_CHILD]
      );
      parentOf.set(
        sourceId,
        parents.map((p) => p.target_id).filter((p) => elementSet.has(p))
      );
    }

    // Start with elements that have no parents in our set
    for (const elem of elementsWithBlockingDeps) {
      const parents = parentOf.get(elem.source_id) ?? [];
      if (parents.length === 0) {
        queue.push(elem.source_id as ElementId);
      }
    }

    // Process in order
    while (queue.length > 0) {
      const elementId = queue.shift()!;

      if (processed.has(elementId)) {
        continue;
      }

      // Check if all parents are processed
      const parents = parentOf.get(elementId) ?? [];
      const allParentsProcessed = parents.every((p) => processed.has(p));

      if (!allParentsProcessed) {
        // Put back in queue for later
        queue.push(elementId);
        continue;
      }

      processed.add(elementId);
      elementsChecked++;

      // Compute blocking state
      const blocking = this.computeBlockingState(elementId, options);
      if (blocking) {
        this.addBlocked(blocking.elementId, blocking.blockedBy, blocking.reason);
        elementsBlocked++;
      }

      // Add children to queue
      const children = this.db.query<DependencyRow>(
        `SELECT source_id FROM dependencies
         WHERE target_id = ? AND type = ?`,
        [elementId, DT.PARENT_CHILD]
      );
      for (const child of children) {
        if (!processed.has(child.source_id)) {
          queue.push(child.source_id as ElementId);
        }
      }
    }

    // Handle any remaining elements (shouldn't happen if graph is consistent)
    for (const elem of elementsWithBlockingDeps) {
      if (!processed.has(elem.source_id)) {
        elementsChecked++;
        const blocking = this.computeBlockingState(elem.source_id as ElementId, options);
        if (blocking) {
          this.addBlocked(blocking.elementId, blocking.blockedBy, blocking.reason);
          elementsBlocked++;
        }
      }
    }

    const durationMs = Date.now() - startTime;

    return {
      elementsChecked,
      elementsBlocked,
      durationMs,
    };
  }

  // --------------------------------------------------------------------------
  // Dependency Event Handlers
  // --------------------------------------------------------------------------

  /**
   * Handle a blocking dependency being added
   *
   * @param sourceId - Element that now has a new blocking dependency
   * @param targetId - Element being depended on
   * @param type - Type of dependency
   * @param metadata - Dependency metadata (for awaits)
   * @param options - Gate check options
   */
  onDependencyAdded(
    sourceId: ElementId,
    _targetId: ElementId,
    type: DependencyType,
    _metadata?: Record<string, unknown>,
    options: GateCheckOptions = {}
  ): void {
    // Only handle blocking dependency types
    if (type !== DT.BLOCKS && type !== DT.PARENT_CHILD && type !== DT.AWAITS) {
      return;
    }

    // Recompute blocking state for the source element
    this.invalidateElement(sourceId, options);

    // For parent-child, also invalidate all children (transitive)
    if (type === DT.PARENT_CHILD) {
      this.invalidateChildren(sourceId, options);
    }
  }

  /**
   * Handle a blocking dependency being removed
   *
   * @param sourceId - Element that had a blocking dependency removed
   * @param targetId - Element that was being depended on
   * @param type - Type of dependency that was removed
   * @param options - Gate check options
   */
  onDependencyRemoved(
    sourceId: ElementId,
    _targetId: ElementId,
    type: DependencyType,
    options: GateCheckOptions = {}
  ): void {
    // Only handle blocking dependency types
    if (type !== DT.BLOCKS && type !== DT.PARENT_CHILD && type !== DT.AWAITS) {
      return;
    }

    // Recompute blocking state for the source element
    this.invalidateElement(sourceId, options);

    // For parent-child, also invalidate all children
    if (type === DT.PARENT_CHILD) {
      this.invalidateChildren(sourceId, options);
    }
  }

  /**
   * Handle an element's status changing
   *
   * @param elementId - Element whose status changed
   * @param oldStatus - Previous status
   * @param newStatus - New status
   * @param options - Gate check options
   */
  onStatusChanged(
    elementId: ElementId,
    oldStatus: string | null,
    newStatus: string,
    options: GateCheckOptions = {}
  ): void {
    const wasCompleted = COMPLETED_STATUSES.includes(oldStatus as typeof COMPLETED_STATUSES[number]);
    const isNowCompleted = COMPLETED_STATUSES.includes(newStatus as typeof COMPLETED_STATUSES[number]);

    // If completion status changed, invalidate all dependents
    if (wasCompleted !== isNowCompleted) {
      this.invalidateDependents(elementId, options);
    }
  }

  /**
   * Handle an element being deleted
   *
   * @param elementId - Element that was deleted
   * @param options - Gate check options
   */
  onElementDeleted(elementId: ElementId, options: GateCheckOptions = {}): void {
    // Remove from cache if blocked
    this.removeBlocked(elementId);

    // Invalidate dependents (deletion is like completion)
    this.invalidateDependents(elementId, options);
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new BlockedCacheService instance
 */
export function createBlockedCacheService(db: StorageBackend): BlockedCacheService {
  return new BlockedCacheService(db);
}

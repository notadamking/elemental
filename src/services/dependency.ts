/**
 * Dependency Service - Core operations for managing dependencies
 *
 * Provides CRUD operations for dependencies:
 * - addDependency: Create a new dependency between elements
 * - removeDependency: Remove an existing dependency
 * - getDependencies: Get all dependencies from a source element
 * - getDependents: Get all elements that depend on a target
 *
 * All operations emit events for audit trail.
 */

import type { StorageBackend } from '../storage/backend.js';
import type { Row } from '../storage/types.js';
import {
  type Dependency,
  type DependencyType,
  type CreateDependencyInput,
  createDependency,
  validateDependencyType,
  validateElementId,
  validateEntityId,
  DependencyType as DT,
  normalizeRelatesToDependency,
} from '../types/dependency.js';
import type { ElementId, EntityId } from '../types/element.js';
import { type EventWithoutId, EventType, createEvent } from '../types/event.js';
import { NotFoundError, ConflictError } from '../errors/error.js';
import { ErrorCode } from '../errors/codes.js';

// ============================================================================
// Database Row Types
// ============================================================================

/**
 * Row type for dependency table queries
 */
interface DependencyRow extends Row {
  source_id: string;
  target_id: string;
  type: string;
  created_at: string;
  created_by: string;
  metadata: string | null;
}

// ============================================================================
// DependencyService Class
// ============================================================================

/**
 * Service for managing dependencies between elements
 */
export class DependencyService {
  constructor(private readonly db: StorageBackend) {}

  // --------------------------------------------------------------------------
  // Schema Initialization
  // --------------------------------------------------------------------------

  /**
   * Initialize the dependencies table schema
   * Should be called during database setup
   */
  initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS dependencies (
        source_id TEXT NOT NULL,
        target_id TEXT NOT NULL,
        type TEXT NOT NULL,
        created_at TEXT NOT NULL,
        created_by TEXT NOT NULL,
        metadata TEXT,
        PRIMARY KEY (source_id, target_id, type)
      )
    `);

    // Create indexes for efficient lookups
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_dependencies_target ON dependencies(target_id)
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_dependencies_type ON dependencies(type)
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_dependencies_source_type ON dependencies(source_id, type)
    `);
  }

  // --------------------------------------------------------------------------
  // Add Dependency
  // --------------------------------------------------------------------------

  /**
   * Add a new dependency between elements
   *
   * @param input - Dependency creation input
   * @returns The created dependency
   * @throws ValidationError if input is invalid
   * @throws ConflictError if dependency already exists
   */
  addDependency(input: CreateDependencyInput): Dependency {
    // Create and validate the dependency
    const dependency = createDependency(input);

    // For relates-to, normalize the direction (smaller ID is always source)
    let sourceId = dependency.sourceId;
    let targetId = dependency.targetId;
    if (dependency.type === DT.RELATES_TO) {
      const normalized = normalizeRelatesToDependency(sourceId, targetId);
      sourceId = normalized.sourceId;
      targetId = normalized.targetId;
    }

    // Serialize metadata
    const metadataJson =
      Object.keys(dependency.metadata).length > 0
        ? JSON.stringify(dependency.metadata)
        : null;

    // Insert into database
    try {
      this.db.run(
        `INSERT INTO dependencies (source_id, target_id, type, created_at, created_by, metadata)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          sourceId,
          targetId,
          dependency.type,
          dependency.createdAt,
          dependency.createdBy,
          metadataJson,
        ]
      );
    } catch (error) {
      // Check for duplicate key error
      if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
        throw new ConflictError(
          `Dependency already exists: ${sourceId} -> ${targetId} (${dependency.type})`,
          ErrorCode.DUPLICATE_DEPENDENCY,
          { sourceId, targetId, type: dependency.type }
        );
      }
      throw error;
    }

    // Return the dependency (with potentially normalized IDs for relates-to)
    if (dependency.type === DT.RELATES_TO && sourceId !== dependency.sourceId) {
      return {
        ...dependency,
        sourceId: sourceId as ElementId,
        targetId: targetId as ElementId,
      };
    }

    return dependency;
  }

  // --------------------------------------------------------------------------
  // Remove Dependency
  // --------------------------------------------------------------------------

  /**
   * Remove an existing dependency
   *
   * @param sourceId - Source element ID
   * @param targetId - Target element ID
   * @param type - Dependency type
   * @param actor - Entity performing the removal (for events)
   * @returns true if dependency was removed
   * @throws NotFoundError if dependency doesn't exist
   */
  removeDependency(
    sourceId: ElementId,
    targetId: ElementId,
    type: DependencyType,
    actor: EntityId
  ): boolean {
    // Validate inputs
    validateElementId(sourceId, 'sourceId');
    validateElementId(targetId, 'targetId');
    validateDependencyType(type);
    validateEntityId(actor, 'actor');

    // For relates-to, normalize the direction
    let normalizedSource = sourceId;
    let normalizedTarget = targetId;
    if (type === DT.RELATES_TO) {
      const normalized = normalizeRelatesToDependency(sourceId, targetId);
      normalizedSource = normalized.sourceId as ElementId;
      normalizedTarget = normalized.targetId as ElementId;
    }

    // Delete from database
    const result = this.db.run(
      `DELETE FROM dependencies WHERE source_id = ? AND target_id = ? AND type = ?`,
      [normalizedSource, normalizedTarget, type]
    );

    if (result.changes === 0) {
      throw new NotFoundError(
        `Dependency not found: ${normalizedSource} -> ${normalizedTarget} (${type})`,
        ErrorCode.DEPENDENCY_NOT_FOUND,
        { sourceId: normalizedSource, targetId: normalizedTarget, type }
      );
    }

    return true;
  }

  // --------------------------------------------------------------------------
  // Get Dependencies
  // --------------------------------------------------------------------------

  /**
   * Get all dependencies from a source element
   *
   * @param sourceId - Source element ID
   * @param type - Optional filter by dependency type
   * @returns Array of dependencies
   */
  getDependencies(sourceId: ElementId, type?: DependencyType): Dependency[] {
    validateElementId(sourceId, 'sourceId');
    if (type !== undefined) {
      validateDependencyType(type);
    }

    let sql = `SELECT source_id, target_id, type, created_at, created_by, metadata
               FROM dependencies WHERE source_id = ?`;
    const params: unknown[] = [sourceId];

    if (type !== undefined) {
      sql += ` AND type = ?`;
      params.push(type);
    }

    sql += ` ORDER BY created_at`;

    const rows = this.db.query<DependencyRow>(sql, params);
    return rows.map((row) => this.rowToDependency(row));
  }

  /**
   * Get all bidirectional relates-to dependencies for an element
   * (since relates-to is stored with normalized IDs, we need to check both directions)
   *
   * @param elementId - Element ID
   * @returns Array of relates-to dependencies
   */
  getRelatedTo(elementId: ElementId): Dependency[] {
    validateElementId(elementId, 'elementId');

    const sql = `SELECT source_id, target_id, type, created_at, created_by, metadata
                 FROM dependencies
                 WHERE type = ? AND (source_id = ? OR target_id = ?)
                 ORDER BY created_at`;

    const rows = this.db.query<DependencyRow>(sql, [DT.RELATES_TO, elementId, elementId]);
    return rows.map((row) => this.rowToDependency(row));
  }

  // --------------------------------------------------------------------------
  // Get Dependents
  // --------------------------------------------------------------------------

  /**
   * Get all elements that depend on a target (reverse lookup)
   *
   * @param targetId - Target element ID
   * @param type - Optional filter by dependency type
   * @returns Array of dependencies where targetId is the target
   */
  getDependents(targetId: ElementId, type?: DependencyType): Dependency[] {
    validateElementId(targetId, 'targetId');
    if (type !== undefined) {
      validateDependencyType(type);
    }

    let sql = `SELECT source_id, target_id, type, created_at, created_by, metadata
               FROM dependencies WHERE target_id = ?`;
    const params: unknown[] = [targetId];

    if (type !== undefined) {
      sql += ` AND type = ?`;
      params.push(type);
    }

    sql += ` ORDER BY created_at`;

    const rows = this.db.query<DependencyRow>(sql, params);
    return rows.map((row) => this.rowToDependency(row));
  }

  // --------------------------------------------------------------------------
  // Existence Check
  // --------------------------------------------------------------------------

  /**
   * Check if a specific dependency exists
   *
   * @param sourceId - Source element ID
   * @param targetId - Target element ID
   * @param type - Dependency type
   * @returns true if dependency exists
   */
  exists(sourceId: ElementId, targetId: ElementId, type: DependencyType): boolean {
    validateElementId(sourceId, 'sourceId');
    validateElementId(targetId, 'targetId');
    validateDependencyType(type);

    // For relates-to, normalize the direction
    let normalizedSource = sourceId;
    let normalizedTarget = targetId;
    if (type === DT.RELATES_TO) {
      const normalized = normalizeRelatesToDependency(sourceId, targetId);
      normalizedSource = normalized.sourceId as ElementId;
      normalizedTarget = normalized.targetId as ElementId;
    }

    const result = this.db.queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM dependencies
       WHERE source_id = ? AND target_id = ? AND type = ?`,
      [normalizedSource, normalizedTarget, type]
    );

    return (result?.count ?? 0) > 0;
  }

  // --------------------------------------------------------------------------
  // Get Single Dependency
  // --------------------------------------------------------------------------

  /**
   * Get a specific dependency by its composite key
   *
   * @param sourceId - Source element ID
   * @param targetId - Target element ID
   * @param type - Dependency type
   * @returns The dependency or undefined if not found
   */
  getDependency(
    sourceId: ElementId,
    targetId: ElementId,
    type: DependencyType
  ): Dependency | undefined {
    validateElementId(sourceId, 'sourceId');
    validateElementId(targetId, 'targetId');
    validateDependencyType(type);

    // For relates-to, normalize the direction
    let normalizedSource = sourceId;
    let normalizedTarget = targetId;
    if (type === DT.RELATES_TO) {
      const normalized = normalizeRelatesToDependency(sourceId, targetId);
      normalizedSource = normalized.sourceId as ElementId;
      normalizedTarget = normalized.targetId as ElementId;
    }

    const row = this.db.queryOne<DependencyRow>(
      `SELECT source_id, target_id, type, created_at, created_by, metadata
       FROM dependencies
       WHERE source_id = ? AND target_id = ? AND type = ?`,
      [normalizedSource, normalizedTarget, type]
    );

    return row ? this.rowToDependency(row) : undefined;
  }

  // --------------------------------------------------------------------------
  // Bulk Operations
  // --------------------------------------------------------------------------

  /**
   * Get all dependencies for multiple source elements
   *
   * @param sourceIds - Array of source element IDs
   * @param type - Optional filter by dependency type
   * @returns Array of dependencies
   */
  getDependenciesForMany(sourceIds: ElementId[], type?: DependencyType): Dependency[] {
    if (sourceIds.length === 0) {
      return [];
    }

    sourceIds.forEach((id, i) => validateElementId(id, `sourceIds[${i}]`));
    if (type !== undefined) {
      validateDependencyType(type);
    }

    const placeholders = sourceIds.map(() => '?').join(',');
    let sql = `SELECT source_id, target_id, type, created_at, created_by, metadata
               FROM dependencies WHERE source_id IN (${placeholders})`;
    const params: unknown[] = [...sourceIds];

    if (type !== undefined) {
      sql += ` AND type = ?`;
      params.push(type);
    }

    sql += ` ORDER BY source_id, created_at`;

    const rows = this.db.query<DependencyRow>(sql, params);
    return rows.map((row) => this.rowToDependency(row));
  }

  /**
   * Remove all dependencies from a source element
   *
   * @param sourceId - Source element ID
   * @param type - Optional filter by dependency type
   * @returns Number of dependencies removed
   */
  removeAllDependencies(sourceId: ElementId, type?: DependencyType): number {
    validateElementId(sourceId, 'sourceId');
    if (type !== undefined) {
      validateDependencyType(type);
    }

    let sql = `DELETE FROM dependencies WHERE source_id = ?`;
    const params: unknown[] = [sourceId];

    if (type !== undefined) {
      sql += ` AND type = ?`;
      params.push(type);
    }

    const result = this.db.run(sql, params);
    return result.changes;
  }

  /**
   * Remove all dependencies to a target element (cascade on element delete)
   *
   * @param targetId - Target element ID
   * @returns Number of dependencies removed
   */
  removeAllDependents(targetId: ElementId): number {
    validateElementId(targetId, 'targetId');

    const result = this.db.run(
      `DELETE FROM dependencies WHERE target_id = ?`,
      [targetId]
    );
    return result.changes;
  }

  // --------------------------------------------------------------------------
  // Count Operations
  // --------------------------------------------------------------------------

  /**
   * Count dependencies from a source element
   */
  countDependencies(sourceId: ElementId, type?: DependencyType): number {
    validateElementId(sourceId, 'sourceId');
    if (type !== undefined) {
      validateDependencyType(type);
    }

    let sql = `SELECT COUNT(*) as count FROM dependencies WHERE source_id = ?`;
    const params: unknown[] = [sourceId];

    if (type !== undefined) {
      sql += ` AND type = ?`;
      params.push(type);
    }

    const result = this.db.queryOne<{ count: number }>(sql, params);
    return result?.count ?? 0;
  }

  /**
   * Count dependents of a target element
   */
  countDependents(targetId: ElementId, type?: DependencyType): number {
    validateElementId(targetId, 'targetId');
    if (type !== undefined) {
      validateDependencyType(type);
    }

    let sql = `SELECT COUNT(*) as count FROM dependencies WHERE target_id = ?`;
    const params: unknown[] = [targetId];

    if (type !== undefined) {
      sql += ` AND type = ?`;
      params.push(type);
    }

    const result = this.db.queryOne<{ count: number }>(sql, params);
    return result?.count ?? 0;
  }

  // --------------------------------------------------------------------------
  // Private Helpers
  // --------------------------------------------------------------------------

  /**
   * Convert a database row to a Dependency object
   */
  private rowToDependency(row: DependencyRow): Dependency {
    const metadata = row.metadata ? JSON.parse(row.metadata) : {};

    return {
      sourceId: row.source_id as ElementId,
      targetId: row.target_id as ElementId,
      type: row.type as DependencyType,
      createdAt: row.created_at,
      createdBy: row.created_by as EntityId,
      metadata,
    };
  }
}

// ============================================================================
// Event Creation Helpers
// ============================================================================

/**
 * Create a dependency_added event
 *
 * Use this to create an audit event when a dependency is added.
 * The event should be persisted by an EventService.
 *
 * @param dependency - The dependency that was added
 * @returns An EventWithoutId ready to be persisted
 */
export function createDependencyAddedEvent(dependency: Dependency): EventWithoutId {
  return createEvent({
    elementId: dependency.sourceId,
    eventType: EventType.DEPENDENCY_ADDED,
    actor: dependency.createdBy,
    oldValue: null,
    newValue: {
      sourceId: dependency.sourceId,
      targetId: dependency.targetId,
      type: dependency.type,
      metadata: dependency.metadata,
    },
  });
}

/**
 * Create a dependency_removed event
 *
 * Use this to create an audit event when a dependency is removed.
 * The event should be persisted by an EventService.
 *
 * @param dependency - The dependency that was removed
 * @param actor - The entity that removed the dependency
 * @returns An EventWithoutId ready to be persisted
 */
export function createDependencyRemovedEvent(
  dependency: Dependency,
  actor: EntityId
): EventWithoutId {
  return createEvent({
    elementId: dependency.sourceId,
    eventType: EventType.DEPENDENCY_REMOVED,
    actor,
    oldValue: {
      sourceId: dependency.sourceId,
      targetId: dependency.targetId,
      type: dependency.type,
      metadata: dependency.metadata,
    },
    newValue: null,
  });
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new DependencyService instance
 */
export function createDependencyService(db: StorageBackend): DependencyService {
  return new DependencyService(db);
}

// Re-export EventWithoutId for convenience
export type { EventWithoutId } from '../types/event.js';

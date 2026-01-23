/**
 * Query API Type Definitions
 *
 * This module defines all types, interfaces, and filters for the Elemental Query API.
 * The Query API provides the primary programmatic interface to Elemental, enabling
 * CRUD operations, queries, dependency management, and system administration.
 */

import type { Element, ElementId, ElementType, EntityId, Timestamp } from '../types/element.js';
import type { Task, TaskStatus, Priority, Complexity, TaskTypeValue } from '../types/task.js';
import type { Document, DocumentId } from '../types/document.js';
import type { Dependency, DependencyType } from '../types/dependency.js';
import type { Event, EventFilter } from '../types/event.js';

// ============================================================================
// Pagination and Sorting
// ============================================================================

/**
 * Sort direction for query results
 */
export type SortDirection = 'asc' | 'desc';

/**
 * Base pagination options for list queries
 */
export interface PaginationOptions {
  /** Maximum number of results to return */
  limit?: number;
  /** Number of results to skip */
  offset?: number;
}

/**
 * Base sorting options for list queries
 */
export interface SortOptions {
  /** Field to sort by */
  orderBy?: string;
  /** Sort direction */
  orderDir?: SortDirection;
}

// ============================================================================
// Element Filters
// ============================================================================

/**
 * Base filter for all element queries.
 * All filters are optional and are combined with AND logic.
 */
export interface ElementFilter extends PaginationOptions, SortOptions {
  /** Filter by element type(s) */
  type?: ElementType | ElementType[];
  /** Must have ALL specified tags */
  tags?: string[];
  /** Must have ANY of the specified tags */
  tagsAny?: string[];
  /** Filter by creator */
  createdBy?: EntityId;
  /** Created after this timestamp (inclusive) */
  createdAfter?: Timestamp;
  /** Created before this timestamp (exclusive) */
  createdBefore?: Timestamp;
  /** Updated after this timestamp (inclusive) */
  updatedAfter?: Timestamp;
  /** Updated before this timestamp (exclusive) */
  updatedBefore?: Timestamp;
  /** Include soft-deleted elements (tombstones) */
  includeDeleted?: boolean;
}

/**
 * Extended filter for task queries.
 * Includes all ElementFilter options plus task-specific filters.
 */
export interface TaskFilter extends ElementFilter {
  /** Filter by status(es) */
  status?: TaskStatus | TaskStatus[];
  /** Filter by priority level(s) */
  priority?: Priority | Priority[];
  /** Filter by complexity level(s) */
  complexity?: Complexity | Complexity[];
  /** Filter by assignee */
  assignee?: EntityId;
  /** Filter by owner */
  owner?: EntityId;
  /** Filter by task type classification(s) */
  taskType?: TaskTypeValue | TaskTypeValue[];
  /** Filter tasks that have a deadline set */
  hasDeadline?: boolean;
  /** Filter tasks with deadline before this timestamp */
  deadlineBefore?: Timestamp;
  /** Include ephemeral tasks (workflow tasks) */
  includeEphemeral?: boolean;
}

// ============================================================================
// Hydration Options
// ============================================================================

/**
 * Options for hydrating document references on elements.
 * When enabled, the corresponding Ref field will be resolved
 * and its content will be included in the hydrated result.
 */
export interface HydrationOptions {
  /** Hydrate descriptionRef -> description */
  description?: boolean;
  /** Hydrate designRef -> design */
  design?: boolean;
  /** Hydrate contentRef -> content */
  content?: boolean;
  /** Hydrate attachment references */
  attachments?: boolean;
}

/**
 * Options for get operations
 */
export interface GetOptions {
  /** References to hydrate */
  hydrate?: HydrationOptions;
}

// ============================================================================
// Blocked Task Result
// ============================================================================

/**
 * A task that is blocked with details about why.
 * Extends Task with blocking information.
 */
export interface BlockedTask extends Task {
  /** ID of the element blocking this task */
  blockedBy: ElementId;
  /** Human-readable explanation of why this task is blocked */
  blockReason: string;
}

// ============================================================================
// Dependency Tree
// ============================================================================

/**
 * A node in the dependency tree.
 * Represents an element with its incoming and outgoing dependencies.
 */
export interface DependencyTreeNode<T extends Element = Element> {
  /** The element at this node */
  element: T;
  /** Outgoing dependencies (elements this element depends on) */
  dependencies: DependencyTreeNode[];
  /** Incoming dependencies (elements that depend on this element) */
  dependents: DependencyTreeNode[];
}

/**
 * Complete dependency tree for an element.
 * Contains the full graph of dependencies in both directions.
 */
export interface DependencyTree<T extends Element = Element> {
  /** Root element of the tree */
  root: DependencyTreeNode<T>;
  /** Maximum depth traversed in dependencies direction */
  dependencyDepth: number;
  /** Maximum depth traversed in dependents direction */
  dependentDepth: number;
  /** Total number of nodes in the tree */
  nodeCount: number;
}

// ============================================================================
// Dependency Input
// ============================================================================

/**
 * Input for creating a new dependency via the API.
 */
export interface DependencyInput {
  /** Element that has the dependency */
  sourceId: ElementId;
  /** Element being depended on */
  targetId: ElementId;
  /** Type of dependency relationship */
  type: DependencyType;
  /** Type-specific metadata */
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Sync Types
// ============================================================================

/**
 * Export format options
 */
export type ExportFormat = 'jsonl';

/**
 * Options for exporting elements
 */
export interface ExportOptions {
  /** Export format (default: jsonl) */
  format?: ExportFormat;
  /** Element types to export (default: all) */
  types?: ElementType[];
  /** Export only elements modified after this timestamp */
  modifiedAfter?: Timestamp;
  /** Include soft-deleted elements */
  includeDeleted?: boolean;
  /** Export dependencies */
  includeDependencies?: boolean;
  /** Export events */
  includeEvents?: boolean;
  /** Output file path (if not provided, returns string) */
  outputPath?: string;
}

/**
 * Options for importing elements
 */
export interface ImportOptions {
  /** Input file path */
  inputPath?: string;
  /** Raw JSONL data (alternative to inputPath) */
  data?: string;
  /** How to handle conflicts */
  conflictStrategy?: ConflictStrategy;
  /** Whether to validate all data before importing */
  validateFirst?: boolean;
  /** Whether to run in dry-run mode (validate but don't import) */
  dryRun?: boolean;
}

/**
 * Strategy for handling import conflicts
 */
export type ConflictStrategy =
  | 'skip'      // Skip conflicting elements
  | 'overwrite' // Overwrite existing with imported
  | 'error';    // Throw error on conflict

/**
 * A conflict encountered during import
 */
export interface ImportConflict {
  /** ID of the conflicting element */
  elementId: ElementId;
  /** Type of conflict */
  conflictType: 'exists' | 'type_mismatch' | 'validation_failed';
  /** Additional details about the conflict */
  details: string;
}

/**
 * Result of an import operation
 */
export interface ImportResult {
  /** Whether the import succeeded */
  success: boolean;
  /** Number of elements imported */
  elementsImported: number;
  /** Number of dependencies imported */
  dependenciesImported: number;
  /** Number of events imported */
  eventsImported: number;
  /** Conflicts encountered */
  conflicts: ImportConflict[];
  /** Errors that occurred */
  errors: string[];
  /** Whether this was a dry run */
  dryRun: boolean;
}

// ============================================================================
// System Statistics
// ============================================================================

/**
 * Count of elements by type
 */
export type ElementCountByType = {
  [K in ElementType]?: number;
};

/**
 * System-wide statistics
 */
export interface SystemStats {
  /** Total number of elements */
  totalElements: number;
  /** Element count broken down by type */
  elementsByType: ElementCountByType;
  /** Total number of dependencies */
  totalDependencies: number;
  /** Total number of events */
  totalEvents: number;
  /** Number of tasks in ready state (open/in_progress, not blocked) */
  readyTasks: number;
  /** Number of blocked tasks */
  blockedTasks: number;
  /** Database file size in bytes */
  databaseSize: number;
  /** When stats were computed */
  computedAt: Timestamp;
}

// ============================================================================
// API Result Types
// ============================================================================

/**
 * Paginated list result
 */
export interface ListResult<T> {
  /** Items in this page */
  items: T[];
  /** Total count of matching items (before pagination) */
  total: number;
  /** Offset used for this page */
  offset: number;
  /** Limit used for this page */
  limit: number;
  /** Whether there are more results */
  hasMore: boolean;
}

// ============================================================================
// Element Input Types
// ============================================================================

/**
 * Base input for creating any element.
 * Type-specific create functions will extend this.
 */
export interface ElementInput {
  /** Optional: Specific ID (if not provided, one will be generated) */
  id?: ElementId;
  /** Entity creating the element */
  createdBy: EntityId;
  /** Initial tags */
  tags?: string[];
  /** Initial metadata */
  metadata?: Record<string, unknown>;
}

// ============================================================================
// ElementalAPI Interface
// ============================================================================

/**
 * The main Elemental API interface.
 *
 * Provides type-safe CRUD operations, queries, dependency management,
 * and system administration capabilities.
 *
 * @example
 * ```typescript
 * const api = createElementalAPI(storage);
 *
 * // Get a task by ID
 * const task = await api.get<Task>(taskId);
 *
 * // List open tasks
 * const tasks = await api.list<Task>({ type: 'task', status: 'open' });
 *
 * // Get ready tasks
 * const ready = await api.ready({ assignee: myEntityId });
 * ```
 */
export interface ElementalAPI {
  // --------------------------------------------------------------------------
  // CRUD Operations
  // --------------------------------------------------------------------------

  /**
   * Retrieve a single element by ID.
   *
   * @param id - Element identifier
   * @param options - Hydration options
   * @returns The element or null if not found
   */
  get<T extends Element>(id: ElementId, options?: GetOptions): Promise<T | null>;

  /**
   * Retrieve multiple elements matching a filter.
   *
   * @param filter - Query constraints
   * @returns Array of matching elements
   */
  list<T extends Element>(filter?: ElementFilter): Promise<T[]>;

  /**
   * Retrieve multiple elements with pagination info.
   *
   * @param filter - Query constraints
   * @returns Paginated result with items and metadata
   */
  listPaginated<T extends Element>(filter?: ElementFilter): Promise<ListResult<T>>;

  /**
   * Create a new element.
   *
   * @param input - Element data (type-specific)
   * @returns The created element
   */
  create<T extends Element>(input: ElementInput & Record<string, unknown>): Promise<T>;

  /**
   * Update an existing element.
   *
   * @param id - Element identifier
   * @param updates - Fields to update
   * @returns The updated element
   * @throws NotFoundError if element doesn't exist
   * @throws ConstraintError if element is immutable (e.g., Message)
   */
  update<T extends Element>(id: ElementId, updates: Partial<T>): Promise<T>;

  /**
   * Soft-delete an element.
   *
   * @param id - Element identifier
   * @param reason - Optional deletion reason
   * @throws NotFoundError if element doesn't exist
   * @throws ConstraintError if element is immutable
   */
  delete(id: ElementId, reason?: string): Promise<void>;

  // --------------------------------------------------------------------------
  // Task Operations
  // --------------------------------------------------------------------------

  /**
   * Get tasks that are ready for work.
   *
   * Ready criteria:
   * - Status is 'open' or 'in_progress'
   * - Not blocked by any dependency
   * - scheduledFor is null or in the past
   * - Not ephemeral (unless includeEphemeral is true)
   *
   * @param filter - Optional task filter constraints
   * @returns Array of ready tasks
   */
  ready(filter?: TaskFilter): Promise<Task[]>;

  /**
   * Get blocked tasks with blocking details.
   *
   * @param filter - Optional task filter constraints
   * @returns Array of blocked tasks with block reasons
   */
  blocked(filter?: TaskFilter): Promise<BlockedTask[]>;

  // --------------------------------------------------------------------------
  // Dependency Operations
  // --------------------------------------------------------------------------

  /**
   * Create a new dependency between elements.
   *
   * @param dep - Dependency data
   * @returns The created dependency
   * @throws NotFoundError if source element doesn't exist
   * @throws ConflictError if dependency would create a cycle
   * @throws ConflictError if dependency already exists
   */
  addDependency(dep: DependencyInput): Promise<Dependency>;

  /**
   * Remove a dependency.
   *
   * @param sourceId - Source element
   * @param targetId - Target element
   * @param type - Dependency type
   * @throws NotFoundError if dependency doesn't exist
   */
  removeDependency(
    sourceId: ElementId,
    targetId: ElementId,
    type: DependencyType
  ): Promise<void>;

  /**
   * Get dependencies of an element (outgoing edges).
   *
   * @param id - Element ID
   * @param types - Optional filter by dependency type(s)
   * @returns Array of dependencies
   */
  getDependencies(id: ElementId, types?: DependencyType[]): Promise<Dependency[]>;

  /**
   * Get dependents of an element (incoming edges).
   *
   * @param id - Element ID
   * @param types - Optional filter by dependency type(s)
   * @returns Array of dependencies where this element is the target
   */
  getDependents(id: ElementId, types?: DependencyType[]): Promise<Dependency[]>;

  /**
   * Get the full dependency tree for an element.
   *
   * @param id - Root element ID
   * @returns Complete dependency tree in both directions
   */
  getDependencyTree(id: ElementId): Promise<DependencyTree>;

  // --------------------------------------------------------------------------
  // Search
  // --------------------------------------------------------------------------

  /**
   * Full-text search across elements.
   *
   * Searches:
   * - Element titles (Tasks, Plans, etc.)
   * - Element content (via Documents)
   * - Tags
   *
   * @param query - Search text
   * @param filter - Additional filter constraints
   * @returns Array of matching elements
   */
  search(query: string, filter?: ElementFilter): Promise<Element[]>;

  // --------------------------------------------------------------------------
  // History Operations
  // --------------------------------------------------------------------------

  /**
   * Get audit events for an element.
   *
   * @param id - Element ID
   * @param filter - Optional event filter
   * @returns Array of events (newest first)
   */
  getEvents(id: ElementId, filter?: EventFilter): Promise<Event[]>;

  /**
   * Get a specific version of a document.
   *
   * @param id - Document ID
   * @param version - Version number
   * @returns The document at that version, or null if not found
   */
  getDocumentVersion(id: DocumentId, version: number): Promise<Document | null>;

  /**
   * Get the full version history of a document.
   *
   * @param id - Document ID
   * @returns Array of document versions (newest first)
   */
  getDocumentHistory(id: DocumentId): Promise<Document[]>;

  // --------------------------------------------------------------------------
  // Sync Operations
  // --------------------------------------------------------------------------

  /**
   * Export elements to JSONL format.
   *
   * @param options - Export configuration
   * @returns JSONL string if no outputPath specified
   */
  export(options?: ExportOptions): Promise<string | void>;

  /**
   * Import elements from JSONL format.
   *
   * @param options - Import configuration
   * @returns Import result with counts and any errors
   */
  import(options: ImportOptions): Promise<ImportResult>;

  // --------------------------------------------------------------------------
  // Statistics
  // --------------------------------------------------------------------------

  /**
   * Get system statistics.
   *
   * @returns Current system statistics
   */
  stats(): Promise<SystemStats>;
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Check if a value is a valid SortDirection
 */
export function isSortDirection(value: unknown): value is SortDirection {
  return value === 'asc' || value === 'desc';
}

/**
 * Check if a value is a valid ConflictStrategy
 */
export function isConflictStrategy(value: unknown): value is ConflictStrategy {
  return value === 'skip' || value === 'overwrite' || value === 'error';
}

/**
 * Check if a value is a valid ExportFormat
 */
export function isExportFormat(value: unknown): value is ExportFormat {
  return value === 'jsonl';
}

// ============================================================================
// Validation Helpers
// ============================================================================

/**
 * Validate an ElementFilter object
 */
export function isValidElementFilter(value: unknown): value is ElementFilter {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const obj = value as Record<string, unknown>;

  // Check limit is positive number if present
  if (obj.limit !== undefined) {
    if (typeof obj.limit !== 'number' || obj.limit < 0 || !Number.isInteger(obj.limit)) {
      return false;
    }
  }

  // Check offset is non-negative number if present
  if (obj.offset !== undefined) {
    if (typeof obj.offset !== 'number' || obj.offset < 0 || !Number.isInteger(obj.offset)) {
      return false;
    }
  }

  // Check orderDir is valid if present
  if (obj.orderDir !== undefined && !isSortDirection(obj.orderDir)) {
    return false;
  }

  // Check tags is array of strings if present
  if (obj.tags !== undefined) {
    if (!Array.isArray(obj.tags) || !obj.tags.every(t => typeof t === 'string')) {
      return false;
    }
  }

  // Check tagsAny is array of strings if present
  if (obj.tagsAny !== undefined) {
    if (!Array.isArray(obj.tagsAny) || !obj.tagsAny.every(t => typeof t === 'string')) {
      return false;
    }
  }

  // Check includeDeleted is boolean if present
  if (obj.includeDeleted !== undefined && typeof obj.includeDeleted !== 'boolean') {
    return false;
  }

  return true;
}

/**
 * Validate a TaskFilter object
 */
export function isValidTaskFilter(value: unknown): value is TaskFilter {
  if (!isValidElementFilter(value)) {
    return false;
  }

  const obj = value as Record<string, unknown>;

  // Check hasDeadline is boolean if present
  if (obj.hasDeadline !== undefined && typeof obj.hasDeadline !== 'boolean') {
    return false;
  }

  // Check includeEphemeral is boolean if present
  if (obj.includeEphemeral !== undefined && typeof obj.includeEphemeral !== 'boolean') {
    return false;
  }

  return true;
}

/**
 * Validate a GetOptions object
 */
export function isValidGetOptions(value: unknown): value is GetOptions {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const obj = value as Record<string, unknown>;

  if (obj.hydrate !== undefined) {
    if (typeof obj.hydrate !== 'object' || obj.hydrate === null) {
      return false;
    }

    const hydrate = obj.hydrate as Record<string, unknown>;

    // All hydration options should be boolean if present
    for (const key of ['description', 'design', 'content', 'attachments']) {
      if (hydrate[key] !== undefined && typeof hydrate[key] !== 'boolean') {
        return false;
      }
    }
  }

  return true;
}

/**
 * Validate ExportOptions
 */
export function isValidExportOptions(value: unknown): value is ExportOptions {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const obj = value as Record<string, unknown>;

  if (obj.format !== undefined && !isExportFormat(obj.format)) {
    return false;
  }

  if (obj.includeDeleted !== undefined && typeof obj.includeDeleted !== 'boolean') {
    return false;
  }

  if (obj.includeDependencies !== undefined && typeof obj.includeDependencies !== 'boolean') {
    return false;
  }

  if (obj.includeEvents !== undefined && typeof obj.includeEvents !== 'boolean') {
    return false;
  }

  return true;
}

/**
 * Validate ImportOptions
 */
export function isValidImportOptions(value: unknown): value is ImportOptions {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const obj = value as Record<string, unknown>;

  // Must have either inputPath or data
  if (obj.inputPath === undefined && obj.data === undefined) {
    return false;
  }

  if (obj.inputPath !== undefined && typeof obj.inputPath !== 'string') {
    return false;
  }

  if (obj.data !== undefined && typeof obj.data !== 'string') {
    return false;
  }

  if (obj.conflictStrategy !== undefined && !isConflictStrategy(obj.conflictStrategy)) {
    return false;
  }

  if (obj.validateFirst !== undefined && typeof obj.validateFirst !== 'boolean') {
    return false;
  }

  if (obj.dryRun !== undefined && typeof obj.dryRun !== 'boolean') {
    return false;
  }

  return true;
}

// ============================================================================
// Default Values
// ============================================================================

/** Default page size for list queries */
export const DEFAULT_PAGE_SIZE = 50;

/** Maximum page size for list queries */
export const MAX_PAGE_SIZE = 1000;

/** Default conflict strategy for imports */
export const DEFAULT_CONFLICT_STRATEGY: ConflictStrategy = 'error';

/** Default export format */
export const DEFAULT_EXPORT_FORMAT: ExportFormat = 'jsonl';

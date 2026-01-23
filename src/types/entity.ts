/**
 * Entity Type - Identity for agents, humans, and system processes
 *
 * Entities represent identities within Elemental - AI agents, humans, or system processes.
 * They are the actors that create, modify, and interact with all other elements.
 * Entities support both soft (name-based) and cryptographic (key-based) identity models.
 */

import { ValidationError } from '../errors/error.js';
import { ErrorCode } from '../errors/codes.js';
import { Element, EntityId, ElementType, createTimestamp } from './element.js';
import { generateId, type IdGeneratorConfig } from '../id/generator.js';

// ============================================================================
// Entity Types
// ============================================================================

/**
 * Classification of entity types
 */
export const EntityTypeValue = {
  /** AI agent - automated actors performing work */
  AGENT: 'agent',
  /** Human user - manual actors in the system */
  HUMAN: 'human',
  /** System process - automated infrastructure */
  SYSTEM: 'system',
} as const;

export type EntityTypeValue = (typeof EntityTypeValue)[keyof typeof EntityTypeValue];

// ============================================================================
// Name Validation Constants
// ============================================================================

/** Minimum name length */
export const MIN_NAME_LENGTH = 1;

/** Maximum name length */
export const MAX_NAME_LENGTH = 100;

/**
 * Valid name pattern: must start with letter, then alphanumeric, hyphen, or underscore
 */
const NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]*$/;

/**
 * Reserved entity names that cannot be used
 */
export const RESERVED_NAMES = ['system', 'anonymous', 'unknown'] as const;

export type ReservedName = (typeof RESERVED_NAMES)[number];

// ============================================================================
// Entity Interface
// ============================================================================

/**
 * Entity interface - extends Element with identity-specific properties
 */
export interface Entity extends Element {
  /** Entity type is always 'entity' */
  readonly type: typeof ElementType.ENTITY;
  /** System-wide unique identifier name */
  readonly name: string;
  /** Classification of the entity */
  readonly entityType: EntityTypeValue;
  /** Optional Ed25519 public key, base64 encoded (for cryptographic identity) */
  readonly publicKey?: string;
}

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validates an entity type value
 */
export function isValidEntityType(value: unknown): value is EntityTypeValue {
  return (
    typeof value === 'string' &&
    Object.values(EntityTypeValue).includes(value as EntityTypeValue)
  );
}

/**
 * Validates entity type and throws if invalid
 */
export function validateEntityType(value: unknown): EntityTypeValue {
  if (!isValidEntityType(value)) {
    throw new ValidationError(
      `Invalid entity type: ${value}. Must be one of: ${Object.values(EntityTypeValue).join(', ')}`,
      ErrorCode.INVALID_INPUT,
      { field: 'entityType', value, expected: Object.values(EntityTypeValue) }
    );
  }
  return value;
}

/**
 * Checks if a name is reserved
 */
export function isReservedName(name: string): name is ReservedName {
  return RESERVED_NAMES.includes(name.toLowerCase() as ReservedName);
}

/**
 * Validates an entity name format (does not check uniqueness)
 */
export function isValidEntityName(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  if (value.length < MIN_NAME_LENGTH || value.length > MAX_NAME_LENGTH) {
    return false;
  }
  if (!NAME_PATTERN.test(value)) {
    return false;
  }
  if (isReservedName(value)) {
    return false;
  }
  return true;
}

/**
 * Validates an entity name and throws detailed error if invalid
 */
export function validateEntityName(value: unknown): string {
  if (typeof value !== 'string') {
    throw new ValidationError(
      'Entity name must be a string',
      ErrorCode.INVALID_INPUT,
      { field: 'name', value, expected: 'string' }
    );
  }

  if (value.length === 0) {
    throw new ValidationError(
      'Entity name cannot be empty',
      ErrorCode.MISSING_REQUIRED_FIELD,
      { field: 'name', value }
    );
  }

  if (value.length > MAX_NAME_LENGTH) {
    throw new ValidationError(
      `Entity name exceeds maximum length of ${MAX_NAME_LENGTH} characters`,
      ErrorCode.INVALID_INPUT,
      { field: 'name', value, expected: `<= ${MAX_NAME_LENGTH} characters`, actual: value.length }
    );
  }

  if (!NAME_PATTERN.test(value)) {
    if (!/^[a-zA-Z]/.test(value)) {
      throw new ValidationError(
        'Entity name must start with a letter',
        ErrorCode.INVALID_INPUT,
        { field: 'name', value, expected: 'starts with [a-zA-Z]' }
      );
    }
    throw new ValidationError(
      'Entity name contains invalid characters. Only letters, numbers, hyphens, and underscores allowed after first character',
      ErrorCode.INVALID_INPUT,
      { field: 'name', value, expected: 'pattern: ^[a-zA-Z][a-zA-Z0-9_-]*$' }
    );
  }

  if (isReservedName(value)) {
    throw new ValidationError(
      `Entity name '${value}' is reserved and cannot be used`,
      ErrorCode.INVALID_INPUT,
      { field: 'name', value, expected: `not one of: ${RESERVED_NAMES.join(', ')}` }
    );
  }

  return value;
}

/**
 * Base64 pattern for Ed25519 public keys (44 characters for 32 bytes)
 */
const BASE64_PATTERN = /^[A-Za-z0-9+/]{43}=$/;

/**
 * Validates a base64-encoded Ed25519 public key format
 */
export function isValidPublicKey(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  // Ed25519 public keys are 32 bytes, which encodes to 44 base64 characters with padding
  return BASE64_PATTERN.test(value);
}

/**
 * Validates a public key and throws if invalid format
 */
export function validatePublicKey(value: unknown): string {
  if (typeof value !== 'string') {
    throw new ValidationError(
      'Public key must be a string',
      ErrorCode.INVALID_INPUT,
      { field: 'publicKey', value, expected: 'string' }
    );
  }

  if (!BASE64_PATTERN.test(value)) {
    throw new ValidationError(
      'Invalid public key format. Expected base64-encoded Ed25519 public key (44 characters)',
      ErrorCode.INVALID_INPUT,
      { field: 'publicKey', value, expected: '44-character base64 string' }
    );
  }

  return value;
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard to check if a value is a valid Entity
 */
export function isEntity(value: unknown): value is Entity {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const obj = value as Record<string, unknown>;

  // Check it has element base properties
  if (typeof obj.id !== 'string') return false;
  if (obj.type !== ElementType.ENTITY) return false;
  if (typeof obj.createdAt !== 'string') return false;
  if (typeof obj.updatedAt !== 'string') return false;
  if (typeof obj.createdBy !== 'string') return false;
  if (!Array.isArray(obj.tags)) return false;
  if (typeof obj.metadata !== 'object' || obj.metadata === null) return false;

  // Check entity-specific properties
  if (!isValidEntityName(obj.name)) return false;
  if (!isValidEntityType(obj.entityType)) return false;
  if (obj.publicKey !== undefined && !isValidPublicKey(obj.publicKey)) return false;

  return true;
}

/**
 * Comprehensive validation of an entity with detailed errors
 */
export function validateEntity(value: unknown): Entity {
  if (typeof value !== 'object' || value === null) {
    throw new ValidationError(
      'Entity must be an object',
      ErrorCode.INVALID_INPUT,
      { value }
    );
  }

  const obj = value as Record<string, unknown>;

  // Validate element base fields
  if (typeof obj.id !== 'string' || obj.id.length === 0) {
    throw new ValidationError(
      'Entity id is required and must be a non-empty string',
      ErrorCode.MISSING_REQUIRED_FIELD,
      { field: 'id', value: obj.id }
    );
  }

  if (obj.type !== ElementType.ENTITY) {
    throw new ValidationError(
      `Entity type must be '${ElementType.ENTITY}'`,
      ErrorCode.INVALID_INPUT,
      { field: 'type', value: obj.type, expected: ElementType.ENTITY }
    );
  }

  if (typeof obj.createdAt !== 'string') {
    throw new ValidationError(
      'Entity createdAt is required',
      ErrorCode.MISSING_REQUIRED_FIELD,
      { field: 'createdAt', value: obj.createdAt }
    );
  }

  if (typeof obj.updatedAt !== 'string') {
    throw new ValidationError(
      'Entity updatedAt is required',
      ErrorCode.MISSING_REQUIRED_FIELD,
      { field: 'updatedAt', value: obj.updatedAt }
    );
  }

  if (typeof obj.createdBy !== 'string' || obj.createdBy.length === 0) {
    throw new ValidationError(
      'Entity createdBy is required and must be a non-empty string',
      ErrorCode.MISSING_REQUIRED_FIELD,
      { field: 'createdBy', value: obj.createdBy }
    );
  }

  if (!Array.isArray(obj.tags)) {
    throw new ValidationError(
      'Entity tags must be an array',
      ErrorCode.INVALID_INPUT,
      { field: 'tags', value: obj.tags, expected: 'array' }
    );
  }

  if (typeof obj.metadata !== 'object' || obj.metadata === null || Array.isArray(obj.metadata)) {
    throw new ValidationError(
      'Entity metadata must be an object',
      ErrorCode.INVALID_INPUT,
      { field: 'metadata', value: obj.metadata, expected: 'object' }
    );
  }

  // Validate entity-specific fields
  validateEntityName(obj.name);
  validateEntityType(obj.entityType);

  if (obj.publicKey !== undefined) {
    validatePublicKey(obj.publicKey);
  }

  return value as Entity;
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Input for creating a new entity
 */
export interface CreateEntityInput {
  /** System-wide unique identifier name */
  name: string;
  /** Classification of the entity */
  entityType: EntityTypeValue;
  /** Reference to the entity that created this entity */
  createdBy: EntityId;
  /** Optional Ed25519 public key, base64 encoded */
  publicKey?: string;
  /** Optional tags */
  tags?: string[];
  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Creates a new Entity with validated inputs
 *
 * @param input - Entity creation input
 * @param config - Optional ID generator configuration
 * @returns Promise resolving to the created Entity
 */
export async function createEntity(
  input: CreateEntityInput,
  config?: IdGeneratorConfig
): Promise<Entity> {
  // Validate inputs
  const name = validateEntityName(input.name);
  const entityType = validateEntityType(input.entityType);

  if (input.publicKey !== undefined) {
    validatePublicKey(input.publicKey);
  }

  const now = createTimestamp();
  const id = await generateId(
    { identifier: name, createdBy: input.createdBy },
    config
  );

  const entity: Entity = {
    id,
    type: ElementType.ENTITY,
    createdAt: now,
    updatedAt: now,
    createdBy: input.createdBy,
    tags: input.tags ?? [],
    metadata: input.metadata ?? {},
    name,
    entityType,
    ...(input.publicKey !== undefined && { publicKey: input.publicKey }),
  };

  return entity;
}

/**
 * Input for updating an existing entity
 * Note: name cannot be updated as it's the unique identifier
 */
export interface UpdateEntityInput {
  /** Optional new Ed25519 public key, base64 encoded */
  publicKey?: string;
  /** Optional tags to merge or replace */
  tags?: string[];
  /** Optional metadata to merge */
  metadata?: Record<string, unknown>;
}

/**
 * Updates an existing Entity with new metadata
 *
 * Can update:
 * - publicKey: Add or update cryptographic identity
 * - tags: Replace tags
 * - metadata: Merge with existing metadata
 *
 * Cannot update:
 * - name: Unique identifier (immutable)
 * - entityType: Classification (immutable after creation)
 *
 * @param entity - The existing entity to update
 * @param input - Update input
 * @returns The updated Entity
 */
export function updateEntity(entity: Entity, input: UpdateEntityInput): Entity {
  // Validate public key if provided
  if (input.publicKey !== undefined) {
    validatePublicKey(input.publicKey);
  }

  const now = createTimestamp();

  // Build the updated entity
  const updated: Entity = {
    ...entity,
    updatedAt: now,
    tags: input.tags !== undefined ? input.tags : entity.tags,
    metadata: input.metadata !== undefined
      ? { ...entity.metadata, ...input.metadata }
      : entity.metadata,
    ...(input.publicKey !== undefined && { publicKey: input.publicKey }),
    // If publicKey is explicitly undefined, keep existing
    // If publicKey is explicitly null, we would need to handle key removal
  };

  return updated;
}

// ============================================================================
// Entity Deactivation
// ============================================================================

/**
 * Input for deactivating an entity
 */
export interface DeactivateEntityInput {
  /** Reason for deactivation */
  reason?: string;
  /** Entity performing the deactivation */
  deactivatedBy: EntityId;
}

/**
 * Deactivates an entity by marking it as inactive in metadata
 *
 * Deactivated entities:
 * - Have metadata.active = false
 * - Have metadata.deactivatedAt timestamp
 * - Have metadata.deactivatedBy reference
 * - Have optional metadata.deactivationReason
 * - Are preserved in the system for historical references
 * - Should be filtered from active entity listings
 *
 * @param entity - The entity to deactivate
 * @param input - Deactivation input
 * @returns The deactivated entity
 */
export function deactivateEntity(entity: Entity, input: DeactivateEntityInput): Entity {
  const now = createTimestamp();

  return {
    ...entity,
    updatedAt: now,
    metadata: {
      ...entity.metadata,
      active: false,
      deactivatedAt: now,
      deactivatedBy: input.deactivatedBy,
      ...(input.reason && { deactivationReason: input.reason }),
    },
  };
}

/**
 * Reactivates a previously deactivated entity
 *
 * @param entity - The entity to reactivate
 * @param reactivatedBy - Entity performing the reactivation
 * @returns The reactivated entity
 */
export function reactivateEntity(entity: Entity, reactivatedBy: EntityId): Entity {
  const now = createTimestamp();

  // Remove deactivation metadata
  const { active, deactivatedAt, deactivatedBy, deactivationReason, ...restMetadata } = entity.metadata as {
    active?: boolean;
    deactivatedAt?: string;
    deactivatedBy?: string;
    deactivationReason?: string;
    [key: string]: unknown;
  };

  return {
    ...entity,
    updatedAt: now,
    metadata: {
      ...restMetadata,
      active: true,
      reactivatedAt: now,
      reactivatedBy,
    },
  };
}

/**
 * Checks if an entity is active (not deactivated)
 */
export function isEntityActive(entity: Entity): boolean {
  // Entity is active if metadata.active is not explicitly false
  if (entity.metadata && typeof entity.metadata.active === 'boolean') {
    return entity.metadata.active;
  }
  // Default to active if not explicitly deactivated
  return true;
}

/**
 * Checks if an entity is deactivated
 */
export function isEntityDeactivated(entity: Entity): boolean {
  return !isEntityActive(entity);
}

/**
 * Gets deactivation details from an entity
 */
export function getDeactivationDetails(entity: Entity): {
  deactivatedAt?: string;
  deactivatedBy?: string;
  reason?: string;
} | null {
  if (isEntityActive(entity)) {
    return null;
  }

  const metadata = entity.metadata as {
    deactivatedAt?: string;
    deactivatedBy?: string;
    deactivationReason?: string;
  };

  return {
    deactivatedAt: metadata.deactivatedAt,
    deactivatedBy: metadata.deactivatedBy,
    reason: metadata.deactivationReason,
  };
}

/**
 * Filter active entities from a list
 */
export function filterActiveEntities<T extends Entity>(entities: T[]): T[] {
  return entities.filter(isEntityActive);
}

/**
 * Filter deactivated entities from a list
 */
export function filterDeactivatedEntities<T extends Entity>(entities: T[]): T[] {
  return entities.filter(isEntityDeactivated);
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Checks if an entity has cryptographic identity (public key)
 */
export function hasCryptographicIdentity(entity: Entity): boolean {
  return entity.publicKey !== undefined;
}

/**
 * Gets a display name for an entity from metadata or falls back to name
 */
export function getEntityDisplayName(entity: Entity): string {
  if (entity.metadata && typeof entity.metadata.displayName === 'string') {
    return entity.metadata.displayName;
  }
  return entity.name;
}

/**
 * Checks if two entities represent the same identity (by name)
 */
export function entitiesHaveSameName(a: Entity, b: Entity): boolean {
  return a.name === b.name;
}

/**
 * Filter type for querying entities by their entity type
 */
export function filterByEntityType<T extends Entity>(
  entities: T[],
  entityType: EntityTypeValue
): T[] {
  return entities.filter((e) => e.entityType === entityType);
}

// ============================================================================
// Search and Filter Functions
// ============================================================================

/**
 * Filter entities by creator
 */
export function filterByCreator<T extends Entity>(entities: T[], createdBy: EntityId): T[] {
  return entities.filter((e) => e.createdBy === createdBy);
}

/**
 * Filter entities that have a public key (cryptographic identity)
 */
export function filterWithPublicKey<T extends Entity>(entities: T[]): T[] {
  return entities.filter(hasCryptographicIdentity);
}

/**
 * Filter entities that do not have a public key (soft identity only)
 */
export function filterWithoutPublicKey<T extends Entity>(entities: T[]): T[] {
  return entities.filter((e) => !hasCryptographicIdentity(e));
}

/**
 * Filter entities by tag (must have the tag)
 */
export function filterByTag<T extends Entity>(entities: T[], tag: string): T[] {
  return entities.filter((e) => e.tags.includes(tag));
}

/**
 * Filter entities by any of the specified tags
 */
export function filterByAnyTag<T extends Entity>(entities: T[], tags: string[]): T[] {
  return entities.filter((e) => tags.some((tag) => e.tags.includes(tag)));
}

/**
 * Filter entities by all specified tags
 */
export function filterByAllTags<T extends Entity>(entities: T[], tags: string[]): T[] {
  return entities.filter((e) => tags.every((tag) => e.tags.includes(tag)));
}

// ============================================================================
// Sort Functions
// ============================================================================

/**
 * Sort entities by name alphabetically
 */
export function sortByName<T extends Entity>(entities: T[], ascending = true): T[] {
  const sorted = [...entities].sort((a, b) => a.name.localeCompare(b.name));
  return ascending ? sorted : sorted.reverse();
}

/**
 * Sort entities by creation date
 */
export function sortByCreationDate<T extends Entity>(entities: T[], ascending = false): T[] {
  const sorted = [...entities].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return ascending ? sorted : sorted.reverse();
}

/**
 * Sort entities by update date
 */
export function sortByUpdateDate<T extends Entity>(entities: T[], ascending = false): T[] {
  const sorted = [...entities].sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
  return ascending ? sorted : sorted.reverse();
}

/**
 * Sort entities by entity type
 */
export function sortByEntityType<T extends Entity>(entities: T[]): T[] {
  const typeOrder = { agent: 0, human: 1, system: 2 };
  return [...entities].sort((a, b) =>
    (typeOrder[a.entityType as keyof typeof typeOrder] ?? 3) -
    (typeOrder[b.entityType as keyof typeof typeOrder] ?? 3)
  );
}

// ============================================================================
// Group Functions
// ============================================================================

/**
 * Group entities by their entity type
 */
export function groupByEntityType<T extends Entity>(entities: T[]): Map<EntityTypeValue, T[]> {
  const groups = new Map<EntityTypeValue, T[]>();
  for (const entity of entities) {
    const existing = groups.get(entity.entityType) ?? [];
    groups.set(entity.entityType, [...existing, entity]);
  }
  return groups;
}

/**
 * Group entities by creator
 */
export function groupByCreator<T extends Entity>(entities: T[]): Map<EntityId, T[]> {
  const groups = new Map<EntityId, T[]>();
  for (const entity of entities) {
    const existing = groups.get(entity.createdBy) ?? [];
    groups.set(entity.createdBy, [...existing, entity]);
  }
  return groups;
}

// ============================================================================
// Search Functions
// ============================================================================

/**
 * Search entities by name (case-insensitive substring match)
 */
export function searchByName<T extends Entity>(entities: T[], query: string): T[] {
  const lowerQuery = query.toLowerCase();
  return entities.filter((e) => e.name.toLowerCase().includes(lowerQuery));
}

/**
 * Find entity by exact name
 */
export function findByName<T extends Entity>(entities: T[], name: string): T | undefined {
  return entities.find((e) => e.name === name);
}

/**
 * Find entity by ID
 */
export function findById<T extends Entity>(entities: T[], id: EntityId | string): T | undefined {
  return entities.find((e) => e.id === id);
}

/**
 * Check if a name is unique among entities
 */
export function isNameUnique(entities: Entity[], name: string, excludeId?: EntityId | string): boolean {
  return !entities.some((e) => e.name === name && e.id !== excludeId);
}

/**
 * Get unique tags from a list of entities
 */
export function getUniqueTags(entities: Entity[]): string[] {
  const tagSet = new Set<string>();
  for (const entity of entities) {
    for (const tag of entity.tags) {
      tagSet.add(tag);
    }
  }
  return Array.from(tagSet).sort();
}

/**
 * Count entities by type
 */
export function countByEntityType(entities: Entity[]): Record<EntityTypeValue, number> {
  const counts: Record<EntityTypeValue, number> = {
    agent: 0,
    human: 0,
    system: 0,
  };
  for (const entity of entities) {
    counts[entity.entityType]++;
  }
  return counts;
}

// ============================================================================
// Entity Assignment Query Utilities
// ============================================================================

/**
 * Interface for elements that can have an assignee (like Task)
 */
export interface Assignable {
  id: string;
  assignee?: string;
  createdBy: string;
}

/**
 * Get all items assigned to an entity
 *
 * @param items - Array of assignable items
 * @param entityId - Entity ID to filter by
 * @returns Items assigned to the specified entity
 */
export function getAssignedTo<T extends Assignable>(items: T[], entityId: string): T[] {
  return items.filter((item) => item.assignee === entityId);
}

/**
 * Get all items created by an entity
 *
 * @param items - Array of items with createdBy
 * @param entityId - Entity ID to filter by
 * @returns Items created by the specified entity
 */
export function getCreatedBy<T extends Assignable>(items: T[], entityId: string): T[] {
  return items.filter((item) => item.createdBy === entityId);
}

/**
 * Get all items where entity is either assignee or creator
 *
 * @param items - Array of assignable items
 * @param entityId - Entity ID to filter by
 * @returns Items where entity is assignee or creator
 */
export function getRelatedTo<T extends Assignable>(items: T[], entityId: string): T[] {
  return items.filter((item) => item.assignee === entityId || item.createdBy === entityId);
}

/**
 * Count items assigned to each entity
 *
 * @param items - Array of assignable items
 * @returns Map of entity ID to count of assigned items
 */
export function countAssignmentsByEntity<T extends Assignable>(items: T[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    if (item.assignee) {
      counts.set(item.assignee, (counts.get(item.assignee) ?? 0) + 1);
    }
  }
  return counts;
}

/**
 * Get entities with the most assignments
 *
 * @param items - Array of assignable items
 * @param limit - Maximum number of entities to return
 * @returns Array of [entityId, count] sorted by count descending
 */
export function getTopAssignees<T extends Assignable>(
  items: T[],
  limit?: number
): Array<[string, number]> {
  const counts = countAssignmentsByEntity(items);
  const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  return limit !== undefined ? sorted.slice(0, limit) : sorted;
}

/**
 * Check if an entity has any assignments
 *
 * @param items - Array of assignable items
 * @param entityId - Entity ID to check
 * @returns True if entity has at least one assignment
 */
export function hasAssignments<T extends Assignable>(items: T[], entityId: string): boolean {
  return items.some((item) => item.assignee === entityId);
}

/**
 * Get unassigned items (items with no assignee)
 *
 * @param items - Array of assignable items
 * @returns Items with no assignee
 */
export function getUnassigned<T extends Assignable>(items: T[]): T[] {
  return items.filter((item) => item.assignee === undefined);
}

/**
 * Get assignment statistics for an entity
 *
 * @param items - Array of assignable items
 * @param entityId - Entity ID to get stats for
 * @returns Statistics object with counts
 */
export function getEntityAssignmentStats<T extends Assignable>(
  items: T[],
  entityId: string
): {
  assignedCount: number;
  createdCount: number;
  totalRelated: number;
} {
  let assignedCount = 0;
  let createdCount = 0;
  const relatedIds = new Set<string>();

  for (const item of items) {
    if (item.assignee === entityId) {
      assignedCount++;
      relatedIds.add(item.id);
    }
    if (item.createdBy === entityId) {
      createdCount++;
      relatedIds.add(item.id);
    }
  }

  return {
    assignedCount,
    createdCount,
    totalRelated: relatedIds.size,
  };
}

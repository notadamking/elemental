/**
 * Entity Type - Identity for agents, humans, and system processes
 *
 * Entities represent identities within Elemental - AI agents, humans, or system processes.
 * They are the actors that create, modify, and interact with all other elements.
 * Entities support both soft (name-based) and cryptographic (key-based) identity models.
 */

import { ValidationError } from '../errors/error.js';
import { ErrorCode } from '../errors/codes.js';
import { Element, ElementId, EntityId, ElementType, createTimestamp } from './element.js';
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

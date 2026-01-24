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
// Key Rotation (Cryptographic Identity)
// ============================================================================

/**
 * Input for rotating an entity's public key
 *
 * Key rotation requires proof of ownership of the current key
 * by signing the rotation request.
 */
export interface KeyRotationInput {
  /** The new public key (base64-encoded Ed25519) */
  newPublicKey: string;
  /** Signature of the rotation request using the CURRENT private key */
  signature: string;
  /** Timestamp when the rotation was signed (ISO 8601) */
  signedAt: string;
}

/**
 * Result of a key rotation operation
 */
export interface KeyRotationResult {
  /** Whether the rotation was successful */
  success: boolean;
  /** The updated entity (if successful) */
  entity?: Entity;
  /** Error message (if failed) */
  error?: string;
  /** Error code for programmatic handling */
  errorCode?: 'NO_CURRENT_KEY' | 'INVALID_NEW_KEY' | 'INVALID_SIGNATURE' | 'SIGNATURE_EXPIRED';
}

/**
 * Constructs the message to be signed for key rotation
 *
 * The message format is: "rotate-key:{entityId}:{newPublicKey}:{timestamp}"
 *
 * @param entityId - The entity whose key is being rotated
 * @param newPublicKey - The new public key being registered
 * @param timestamp - ISO 8601 timestamp of the rotation
 * @returns The string to be signed
 */
export function constructKeyRotationMessage(
  entityId: ElementId,
  newPublicKey: string,
  timestamp: string
): string {
  return `rotate-key:${entityId}:${newPublicKey}:${timestamp}`;
}

/**
 * Options for key rotation validation
 */
export interface KeyRotationOptions {
  /** Maximum age of signature in milliseconds (default: 5 minutes) */
  maxSignatureAge?: number;
  /** Whether to skip signature age validation (for testing) */
  skipTimestampValidation?: boolean;
}

/**
 * Default maximum signature age: 5 minutes
 */
export const DEFAULT_MAX_SIGNATURE_AGE = 5 * 60 * 1000;

/**
 * Validates key rotation input fields
 *
 * @param input - Key rotation input to validate
 * @throws ValidationError if input is invalid
 */
export function validateKeyRotationInput(input: unknown): KeyRotationInput {
  if (typeof input !== 'object' || input === null) {
    throw new ValidationError(
      'Key rotation input must be an object',
      ErrorCode.INVALID_INPUT,
      { value: input }
    );
  }

  const obj = input as Record<string, unknown>;

  if (typeof obj.newPublicKey !== 'string') {
    throw new ValidationError(
      'newPublicKey is required',
      ErrorCode.MISSING_REQUIRED_FIELD,
      { field: 'newPublicKey' }
    );
  }

  validatePublicKey(obj.newPublicKey);

  if (typeof obj.signature !== 'string' || obj.signature.length === 0) {
    throw new ValidationError(
      'signature is required',
      ErrorCode.MISSING_REQUIRED_FIELD,
      { field: 'signature' }
    );
  }

  if (typeof obj.signedAt !== 'string' || obj.signedAt.length === 0) {
    throw new ValidationError(
      'signedAt is required',
      ErrorCode.MISSING_REQUIRED_FIELD,
      { field: 'signedAt' }
    );
  }

  // Validate timestamp format
  const timestamp = new Date(obj.signedAt);
  if (isNaN(timestamp.getTime())) {
    throw new ValidationError(
      'signedAt must be a valid ISO 8601 timestamp',
      ErrorCode.INVALID_INPUT,
      { field: 'signedAt', value: obj.signedAt }
    );
  }

  return input as KeyRotationInput;
}

/**
 * Rotates an entity's public key with cryptographic verification
 *
 * This function requires:
 * 1. The entity to have an existing public key
 * 2. A valid signature of the rotation request using the CURRENT private key
 * 3. The new public key to be valid
 * 4. The signature timestamp to be within the allowed window
 *
 * This proves that the requester owns the current key and can authorize the transition.
 *
 * @param entity - The entity whose key is being rotated
 * @param input - Key rotation input with new key and signature
 * @param verifySignature - Function to verify Ed25519 signatures
 * @param options - Optional validation options
 * @returns Key rotation result
 */
export async function rotateEntityKey(
  entity: Entity,
  input: KeyRotationInput,
  verifySignature: (message: string, signature: string, publicKey: string) => Promise<boolean>,
  options: KeyRotationOptions = {}
): Promise<KeyRotationResult> {
  const maxAge = options.maxSignatureAge ?? DEFAULT_MAX_SIGNATURE_AGE;

  // Check if entity has a current public key
  if (!entity.publicKey) {
    return {
      success: false,
      error: 'Entity does not have a public key to rotate',
      errorCode: 'NO_CURRENT_KEY',
    };
  }

  // Validate the new public key
  try {
    validatePublicKey(input.newPublicKey);
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Invalid new public key',
      errorCode: 'INVALID_NEW_KEY',
    };
  }

  // Check signature timestamp if not skipped
  if (!options.skipTimestampValidation) {
    const signedTime = new Date(input.signedAt).getTime();
    const now = Date.now();
    if (now - signedTime > maxAge) {
      return {
        success: false,
        error: `Signature has expired (signed ${Math.round((now - signedTime) / 1000)}s ago, max ${maxAge / 1000}s)`,
        errorCode: 'SIGNATURE_EXPIRED',
      };
    }
    if (signedTime > now + 60000) { // Allow 1 minute clock skew
      return {
        success: false,
        error: 'Signature timestamp is in the future',
        errorCode: 'INVALID_SIGNATURE',
      };
    }
  }

  // Construct the message that should have been signed
  const message = constructKeyRotationMessage(entity.id, input.newPublicKey, input.signedAt);

  // Verify the signature using the CURRENT public key
  let isValid: boolean;
  try {
    isValid = await verifySignature(message, input.signature, entity.publicKey);
  } catch (err) {
    return {
      success: false,
      error: `Signature verification failed: ${err instanceof Error ? err.message : String(err)}`,
      errorCode: 'INVALID_SIGNATURE',
    };
  }

  if (!isValid) {
    return {
      success: false,
      error: 'Signature verification failed - not signed by current key holder',
      errorCode: 'INVALID_SIGNATURE',
    };
  }

  // All checks passed - perform the key rotation
  const now = createTimestamp();
  const updatedEntity: Entity = {
    ...entity,
    publicKey: input.newPublicKey,
    updatedAt: now,
    metadata: {
      ...entity.metadata,
      keyRotatedAt: now,
      previousKeyHash: hashPublicKey(entity.publicKey),
    },
  };

  return {
    success: true,
    entity: updatedEntity,
  };
}

/**
 * Creates a simple hash of a public key for audit trail
 * Uses first 8 characters of base64 to identify the key
 */
function hashPublicKey(publicKey: string): string {
  return publicKey.substring(0, 8) + '...';
}

/**
 * Prepares a key rotation request for signing
 *
 * This is a convenience function that creates the data structure
 * needed to sign a key rotation request.
 *
 * @param entity - The entity whose key is being rotated
 * @param newPublicKey - The new public key
 * @returns Object with message to sign and timestamp to use
 */
export function prepareKeyRotation(
  entity: Entity,
  newPublicKey: string
): { message: string; timestamp: string } {
  const timestamp = createTimestamp();
  const message = constructKeyRotationMessage(entity.id, newPublicKey, timestamp);
  return { message, timestamp };
}

// ============================================================================
// Key Revocation (Cryptographic Identity)
// ============================================================================

/**
 * Input for revoking an entity's public key
 *
 * Key revocation removes the public key from an entity, converting it
 * to a soft-identity entity. This requires proof of ownership via signature.
 */
export interface KeyRevocationInput {
  /** Reason for revoking the key */
  reason?: string;
  /** Signature of the revocation request using the CURRENT private key */
  signature: string;
  /** Timestamp when the revocation was signed (ISO 8601) */
  signedAt: string;
}

/**
 * Result of a key revocation operation
 */
export interface KeyRevocationResult {
  /** Whether the revocation was successful */
  success: boolean;
  /** The updated entity (if successful) */
  entity?: Entity;
  /** Error message (if failed) */
  error?: string;
  /** Error code for programmatic handling */
  errorCode?: 'NO_CURRENT_KEY' | 'INVALID_SIGNATURE' | 'SIGNATURE_EXPIRED' | 'ALREADY_REVOKED';
}

/**
 * Constructs the message to be signed for key revocation
 *
 * The message format is: "revoke-key:{entityId}:{timestamp}"
 *
 * @param entityId - The entity whose key is being revoked
 * @param timestamp - ISO 8601 timestamp of the revocation
 * @returns The string to be signed
 */
export function constructKeyRevocationMessage(
  entityId: ElementId,
  timestamp: string
): string {
  return `revoke-key:${entityId}:${timestamp}`;
}

/**
 * Options for key revocation validation
 */
export interface KeyRevocationOptions {
  /** Maximum age of signature in milliseconds (default: 5 minutes) */
  maxSignatureAge?: number;
  /** Whether to skip signature age validation (for testing) */
  skipTimestampValidation?: boolean;
}

/**
 * Validates key revocation input fields
 *
 * @param input - Key revocation input to validate
 * @throws ValidationError if input is invalid
 */
export function validateKeyRevocationInput(input: unknown): KeyRevocationInput {
  if (typeof input !== 'object' || input === null) {
    throw new ValidationError(
      'Key revocation input must be an object',
      ErrorCode.INVALID_INPUT,
      { value: input }
    );
  }

  const obj = input as Record<string, unknown>;

  if (typeof obj.signature !== 'string' || obj.signature.length === 0) {
    throw new ValidationError(
      'signature is required',
      ErrorCode.MISSING_REQUIRED_FIELD,
      { field: 'signature' }
    );
  }

  if (typeof obj.signedAt !== 'string' || obj.signedAt.length === 0) {
    throw new ValidationError(
      'signedAt is required',
      ErrorCode.MISSING_REQUIRED_FIELD,
      { field: 'signedAt' }
    );
  }

  // Validate timestamp format
  const timestamp = new Date(obj.signedAt);
  if (isNaN(timestamp.getTime())) {
    throw new ValidationError(
      'signedAt must be a valid ISO 8601 timestamp',
      ErrorCode.INVALID_INPUT,
      { field: 'signedAt', value: obj.signedAt }
    );
  }

  return input as KeyRevocationInput;
}

/**
 * Revokes an entity's public key with cryptographic verification
 *
 * This function requires:
 * 1. The entity to have an existing public key
 * 2. A valid signature of the revocation request using the CURRENT private key
 * 3. The signature timestamp to be within the allowed window
 *
 * After revocation:
 * - The entity's publicKey is removed
 * - The entity becomes a soft-identity entity
 * - Revocation details are stored in metadata for audit
 * - Previous key hash is preserved for reference
 *
 * @param entity - The entity whose key is being revoked
 * @param input - Key revocation input with signature
 * @param verifySignature - Function to verify Ed25519 signatures
 * @param options - Optional validation options
 * @returns Key revocation result
 */
export async function revokeEntityKey(
  entity: Entity,
  input: KeyRevocationInput,
  verifySignature: (message: string, signature: string, publicKey: string) => Promise<boolean>,
  options: KeyRevocationOptions = {}
): Promise<KeyRevocationResult> {
  const maxAge = options.maxSignatureAge ?? DEFAULT_MAX_SIGNATURE_AGE;

  // Check if entity has a current public key
  if (!entity.publicKey) {
    // Check if key was previously revoked
    if (entity.metadata?.keyRevokedAt) {
      return {
        success: false,
        error: 'Entity key has already been revoked',
        errorCode: 'ALREADY_REVOKED',
      };
    }
    return {
      success: false,
      error: 'Entity does not have a public key to revoke',
      errorCode: 'NO_CURRENT_KEY',
    };
  }

  // Check signature timestamp if not skipped
  if (!options.skipTimestampValidation) {
    const signedTime = new Date(input.signedAt).getTime();
    const now = Date.now();
    if (now - signedTime > maxAge) {
      return {
        success: false,
        error: `Signature has expired (signed ${Math.round((now - signedTime) / 1000)}s ago, max ${maxAge / 1000}s)`,
        errorCode: 'SIGNATURE_EXPIRED',
      };
    }
    if (signedTime > now + 60000) { // Allow 1 minute clock skew
      return {
        success: false,
        error: 'Signature timestamp is in the future',
        errorCode: 'INVALID_SIGNATURE',
      };
    }
  }

  // Construct the message that should have been signed
  const message = constructKeyRevocationMessage(entity.id, input.signedAt);

  // Verify the signature using the CURRENT public key
  let isValid: boolean;
  try {
    isValid = await verifySignature(message, input.signature, entity.publicKey);
  } catch (err) {
    return {
      success: false,
      error: `Signature verification failed: ${err instanceof Error ? err.message : String(err)}`,
      errorCode: 'INVALID_SIGNATURE',
    };
  }

  if (!isValid) {
    return {
      success: false,
      error: 'Signature verification failed - not signed by current key holder',
      errorCode: 'INVALID_SIGNATURE',
    };
  }

  // All checks passed - perform the key revocation
  const now = createTimestamp();

  // Remove publicKey and add revocation metadata
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { publicKey: _removedKey, ...entityWithoutKey } = entity;

  const updatedEntity: Entity = {
    ...entityWithoutKey,
    updatedAt: now,
    metadata: {
      ...entity.metadata,
      keyRevokedAt: now,
      revokedKeyHash: hashPublicKey(entity.publicKey),
      ...(input.reason && { keyRevocationReason: input.reason }),
    },
  };

  return {
    success: true,
    entity: updatedEntity,
  };
}

/**
 * Prepares a key revocation request for signing
 *
 * This is a convenience function that creates the data structure
 * needed to sign a key revocation request.
 *
 * @param entity - The entity whose key is being revoked
 * @returns Object with message to sign and timestamp to use
 */
export function prepareKeyRevocation(
  entity: Entity
): { message: string; timestamp: string } {
  const timestamp = createTimestamp();
  const message = constructKeyRevocationMessage(entity.id, timestamp);
  return { message, timestamp };
}

/**
 * Checks if an entity's key has been revoked
 *
 * @param entity - The entity to check
 * @returns True if the entity's key has been revoked
 */
export function isKeyRevoked(entity: Entity): boolean {
  return entity.metadata?.keyRevokedAt !== undefined && !entity.publicKey;
}

/**
 * Gets key revocation details from an entity
 *
 * @param entity - The entity to get revocation details from
 * @returns Revocation details or null if not revoked
 */
export function getKeyRevocationDetails(entity: Entity): {
  revokedAt: string;
  revokedKeyHash: string;
  reason?: string;
} | null {
  if (!isKeyRevoked(entity)) {
    return null;
  }

  const metadata = entity.metadata as {
    keyRevokedAt?: string;
    revokedKeyHash?: string;
    keyRevocationReason?: string;
  };

  if (!metadata.keyRevokedAt || !metadata.revokedKeyHash) {
    return null;
  }

  return {
    revokedAt: metadata.keyRevokedAt,
    revokedKeyHash: metadata.revokedKeyHash,
    reason: metadata.keyRevocationReason,
  };
}

/**
 * Filter entities whose keys have been revoked
 */
export function filterRevokedKeyEntities<T extends Entity>(entities: T[]): T[] {
  return entities.filter(isKeyRevoked);
}

/**
 * Filter entities whose keys have NOT been revoked
 * (includes entities that never had keys and those with active keys)
 */
export function filterNonRevokedKeyEntities<T extends Entity>(entities: T[]): T[] {
  return entities.filter((e) => !isKeyRevoked(e));
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

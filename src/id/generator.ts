/**
 * ID Generation Implementation
 *
 * Generates unique, collision-resistant identifiers using:
 * - SHA256 for hashing
 * - Base36 encoding for human-readable output
 * - Adaptive length based on database size
 * - Hierarchical ID support for parent-child relationships
 */

import { ValidationError, ConstraintError, ConflictError } from '../errors/error.js';
import { ErrorCode } from '../errors/codes.js';
import type { ElementId, EntityId } from '../types/element.js';

// ============================================================================
// Constants
// ============================================================================

/** Prefix for all element IDs */
export const ID_PREFIX = 'el';

/** Base36 character set (0-9, a-z) */
export const BASE36_CHARS = '0123456789abcdefghijklmnopqrstuvwxyz';

/** Minimum hash length */
export const MIN_HASH_LENGTH = 3;

/** Maximum hash length */
export const MAX_HASH_LENGTH = 8;

/** Maximum hierarchy depth (root + 3 child levels) */
export const MAX_HIERARCHY_DEPTH = 3;

/** Maximum nonce value for collision resolution */
export const MAX_NONCE = 9;

/** Root ID pattern: el-{3-8 base36 chars} */
export const ROOT_ID_PATTERN = /^el-[0-9a-z]{3,8}$/;

/** Hierarchical ID pattern: el-{hash}.{n}(.{n}){0,2} */
export const HIERARCHICAL_ID_PATTERN = /^el-[0-9a-z]{3,8}(\.[0-9]+){1,3}$/;

// ============================================================================
// Types
// ============================================================================

/**
 * Components used to generate an ID hash
 */
export interface IdComponents {
  /** Primary identifier (title, name, or content) */
  identifier: string;
  /** Entity creating the element */
  createdBy: EntityId;
  /** Nanosecond timestamp */
  timestampNs: bigint;
  /** Nonce for collision resolution (0-9) */
  nonce: number;
}

/**
 * Parsed ID structure
 */
export interface ParsedId {
  /** Full ID string */
  full: string;
  /** The el- prefix */
  prefix: string;
  /** The hash portion */
  hash: string;
  /** Child segments (e.g., [1, 2] for el-abc.1.2) */
  segments: number[];
  /** Hierarchy depth (0 for root) */
  depth: number;
  /** Whether this is a root ID */
  isRoot: boolean;
}

/**
 * Input for ID generation
 */
export interface IdGeneratorInput {
  /** Primary identifier (title, name, content) */
  identifier: string;
  /** Entity creating the element */
  createdBy: EntityId;
  /** Optional timestamp override (for testing) */
  timestamp?: Date;
}

/**
 * Configuration for ID generation
 */
export interface IdGeneratorConfig {
  /** Hash length to use (3-8, default based on count) */
  hashLength?: number;
  /** Function to check for collisions */
  checkCollision?: (id: ElementId) => boolean | Promise<boolean>;
  /** Current element count (for adaptive length) */
  elementCount?: number;
}

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Checks if a string is a valid ID format (root or hierarchical)
 */
export function isValidIdFormat(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  return ROOT_ID_PATTERN.test(value) || HIERARCHICAL_ID_PATTERN.test(value);
}

/**
 * Checks if a string is a valid root ID
 */
export function isValidRootId(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  return ROOT_ID_PATTERN.test(value);
}

/**
 * Checks if a string is a valid hierarchical ID
 */
export function isValidHierarchicalId(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  return HIERARCHICAL_ID_PATTERN.test(value);
}

/**
 * Validates an ID format and throws if invalid
 */
export function validateIdFormat(value: unknown): string {
  if (!isValidIdFormat(value)) {
    throw new ValidationError(
      `Invalid ID format: ${value}. Expected format: el-{hash} or el-{hash}.{n}`,
      ErrorCode.INVALID_ID,
      {
        value,
        expected: 'el-{3-8 base36 chars} or el-{hash}.{segments}',
      }
    );
  }
  return value;
}

// ============================================================================
// Parsing Functions
// ============================================================================

/**
 * Parses an ID into its components
 */
export function parseId(id: string): ParsedId {
  validateIdFormat(id);

  // Split on hyphen to get prefix and rest
  const hyphenIndex = id.indexOf('-');
  const prefix = id.substring(0, hyphenIndex);
  const rest = id.substring(hyphenIndex + 1);

  // Split rest on dots to get hash and segments
  const parts = rest.split('.');
  const hash = parts[0];
  const segments = parts.slice(1).map((s) => parseInt(s, 10));

  return {
    full: id,
    prefix,
    hash,
    segments,
    depth: segments.length,
    isRoot: segments.length === 0,
  };
}

/**
 * Gets the root ID from any ID (removes all child segments)
 */
export function getIdRoot(id: string): string {
  const parsed = parseId(id);
  return `${parsed.prefix}-${parsed.hash}`;
}

/**
 * Gets the parent ID (removes last segment)
 * Returns null for root IDs
 */
export function getIdParent(id: string): string | null {
  const parsed = parseId(id);
  if (parsed.isRoot) {
    return null;
  }
  if (parsed.segments.length === 1) {
    return getIdRoot(id);
  }
  const parentSegments = parsed.segments.slice(0, -1);
  return `${parsed.prefix}-${parsed.hash}.${parentSegments.join('.')}`;
}

/**
 * Gets the hierarchy depth of an ID (0 for root)
 */
export function getIdDepth(id: string): number {
  return parseId(id).depth;
}

// ============================================================================
// Hash Utilities
// ============================================================================

/**
 * Computes SHA256 hash of input string
 * Uses platform-native implementation for performance
 */
export async function sha256(input: string): Promise<Uint8Array> {
  // Use Web Crypto API (works in Node, Bun, and browsers)
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return new Uint8Array(hashBuffer);
}

/**
 * Converts a byte array to Base36 string
 */
export function toBase36(bytes: Uint8Array): string {
  // Convert bytes to a BigInt
  let num = BigInt(0);
  for (const byte of bytes) {
    num = (num << BigInt(8)) | BigInt(byte);
  }

  // Convert to base36
  if (num === BigInt(0)) {
    return '0';
  }

  let result = '';
  const base = BigInt(36);
  while (num > BigInt(0)) {
    const remainder = Number(num % base);
    result = BASE36_CHARS[remainder] + result;
    num = num / base;
  }

  return result;
}

/**
 * Truncates a hash string to specified length
 */
export function truncateHash(hash: string, length: number): string {
  const clampedLength = Math.max(MIN_HASH_LENGTH, Math.min(MAX_HASH_LENGTH, length));
  return hash.substring(0, clampedLength);
}

// ============================================================================
// Adaptive Length Calculation
// ============================================================================

/**
 * Birthday paradox thresholds for ~1% collision probability
 * These are more conservative than 50% collision thresholds
 */
const LENGTH_THRESHOLDS: [number, number][] = [
  [3, 100], // Length 3 for 0-100 elements
  [4, 500], // Length 4 for 100-500 elements
  [5, 3000], // Length 5 for 500-3000 elements
  [6, 20000], // Length 6 for 3000-20000 elements
  [7, 100000], // Length 7 for 20000-100000 elements
  [8, Infinity], // Length 8 for 100000+ elements
];

/**
 * Calculates the appropriate ID length based on element count
 */
export function calculateIdLength(elementCount: number): number {
  for (const [length, threshold] of LENGTH_THRESHOLDS) {
    if (elementCount < threshold) {
      return length;
    }
  }
  return MAX_HASH_LENGTH;
}

// ============================================================================
// ID Generation
// ============================================================================

/**
 * Generates a hash from ID components
 */
export async function generateIdHash(components: IdComponents): Promise<string> {
  // Concatenate components with separator
  const input = [
    components.identifier,
    components.createdBy,
    components.timestampNs.toString(),
    components.nonce.toString(),
  ].join('|');

  // Hash and encode
  const hashBytes = await sha256(input);
  return toBase36(hashBytes);
}

/**
 * Gets current timestamp in nanoseconds
 */
function getTimestampNs(date?: Date): bigint {
  const ms = date ? date.getTime() : Date.now();
  // Convert to nanoseconds and add high-resolution timer for uniqueness
  const hrTime = typeof performance !== 'undefined' ? performance.now() : 0;
  const nanos = BigInt(Math.floor(hrTime * 1000000) % 1000000);
  return BigInt(ms) * BigInt(1000000) + nanos;
}

/**
 * Generates a new element ID
 *
 * Algorithm:
 * 1. Concatenate identifier, createdBy, timestamp, nonce
 * 2. Compute SHA256 hash
 * 3. Encode as Base36
 * 4. Truncate to adaptive length
 * 5. Check for collision
 * 6. If collision, increment nonce and retry
 * 7. If nonce exhausted, increase length and retry
 */
export async function generateId(
  input: IdGeneratorInput,
  config: IdGeneratorConfig = {}
): Promise<ElementId> {
  const {
    hashLength = config.elementCount !== undefined
      ? calculateIdLength(config.elementCount)
      : MIN_HASH_LENGTH + 1, // Default to 4 for reasonable collision resistance
    checkCollision,
  } = config;

  const timestampNs = getTimestampNs(input.timestamp);
  let currentLength = hashLength;
  let nonce = 0;

  while (currentLength <= MAX_HASH_LENGTH) {
    while (nonce <= MAX_NONCE) {
      const components: IdComponents = {
        identifier: input.identifier,
        createdBy: input.createdBy,
        timestampNs,
        nonce,
      };

      const fullHash = await generateIdHash(components);
      const truncatedHash = truncateHash(fullHash, currentLength);
      const id = `${ID_PREFIX}-${truncatedHash}` as ElementId;

      // If no collision checker provided, assume no collision
      if (!checkCollision) {
        return id;
      }

      // Check for collision
      const hasCollision = await checkCollision(id);
      if (!hasCollision) {
        return id;
      }

      nonce++;
    }

    // All nonces exhausted, increase length
    currentLength++;
    nonce = 0;
  }

  // This should be extremely rare - max length with all nonces exhausted
  throw new ConflictError(
    'Unable to generate unique ID after exhausting all collision resolution attempts',
    ErrorCode.ALREADY_EXISTS,
    {
      identifier: input.identifier,
      createdBy: input.createdBy,
    }
  );
}

/**
 * Generates a child ID from a parent ID
 *
 * @param parentId - The parent element ID
 * @param childNumber - The child number to append
 * @returns The new child ID
 */
export function generateChildId(parentId: string, childNumber: number): ElementId {
  validateIdFormat(parentId);

  const parsed = parseId(parentId);

  // Check depth limit
  if (parsed.depth >= MAX_HIERARCHY_DEPTH) {
    throw new ConstraintError(
      `Cannot create child ID: maximum hierarchy depth of ${MAX_HIERARCHY_DEPTH} exceeded`,
      ErrorCode.MAX_DEPTH_EXCEEDED,
      {
        parentId,
        currentDepth: parsed.depth,
        maxDepth: MAX_HIERARCHY_DEPTH,
      }
    );
  }

  // Validate child number
  if (!Number.isInteger(childNumber) || childNumber < 1) {
    throw new ValidationError(
      'Child number must be a positive integer',
      ErrorCode.INVALID_INPUT,
      {
        field: 'childNumber',
        value: childNumber,
        expected: 'positive integer',
      }
    );
  }

  return `${parentId}.${childNumber}` as ElementId;
}

/**
 * Error codes for the Elemental system.
 * Categorized by error type for consistent handling.
 */

/**
 * Validation error codes - Input validation failures
 */
export const ValidationErrorCode = {
  /** General validation failure */
  INVALID_INPUT: 'INVALID_INPUT',
  /** ID format invalid */
  INVALID_ID: 'INVALID_ID',
  /** Invalid status transition */
  INVALID_STATUS: 'INVALID_STATUS',
  /** Title exceeds 500 characters */
  TITLE_TOO_LONG: 'TITLE_TOO_LONG',
  /** Unknown content type */
  INVALID_CONTENT_TYPE: 'INVALID_CONTENT_TYPE',
  /** JSON content invalid */
  INVALID_JSON: 'INVALID_JSON',
  /** Required field missing */
  MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',
  /** Tag validation failed */
  INVALID_TAG: 'INVALID_TAG',
  /** Timestamp format invalid */
  INVALID_TIMESTAMP: 'INVALID_TIMESTAMP',
  /** Metadata validation failed */
  INVALID_METADATA: 'INVALID_METADATA',
} as const;

export type ValidationErrorCode = typeof ValidationErrorCode[keyof typeof ValidationErrorCode];

/**
 * Not Found error codes - Resource not found
 */
export const NotFoundErrorCode = {
  /** Generic element not found */
  NOT_FOUND: 'NOT_FOUND',
  /** Referenced entity missing */
  ENTITY_NOT_FOUND: 'ENTITY_NOT_FOUND',
  /** Referenced document missing */
  DOCUMENT_NOT_FOUND: 'DOCUMENT_NOT_FOUND',
  /** Channel not found */
  CHANNEL_NOT_FOUND: 'CHANNEL_NOT_FOUND',
  /** Playbook not found */
  PLAYBOOK_NOT_FOUND: 'PLAYBOOK_NOT_FOUND',
} as const;

export type NotFoundErrorCode = typeof NotFoundErrorCode[keyof typeof NotFoundErrorCode];

/**
 * Conflict error codes - State conflicts
 */
export const ConflictErrorCode = {
  /** Element with ID already exists */
  ALREADY_EXISTS: 'ALREADY_EXISTS',
  /** Name already taken */
  DUPLICATE_NAME: 'DUPLICATE_NAME',
  /** Adding dependency would create cycle */
  CYCLE_DETECTED: 'CYCLE_DETECTED',
  /** Merge conflict during sync */
  SYNC_CONFLICT: 'SYNC_CONFLICT',
} as const;

export type ConflictErrorCode = typeof ConflictErrorCode[keyof typeof ConflictErrorCode];

/**
 * Constraint error codes - Business rule violations
 */
export const ConstraintErrorCode = {
  /** Cannot modify immutable element */
  IMMUTABLE: 'IMMUTABLE',
  /** Cannot delete element with dependents */
  HAS_DEPENDENTS: 'HAS_DEPENDENTS',
  /** Invalid parent for hierarchy */
  INVALID_PARENT: 'INVALID_PARENT',
  /** Hierarchy too deep */
  MAX_DEPTH_EXCEEDED: 'MAX_DEPTH_EXCEEDED',
  /** Must be channel member */
  MEMBER_REQUIRED: 'MEMBER_REQUIRED',
} as const;

export type ConstraintErrorCode = typeof ConstraintErrorCode[keyof typeof ConstraintErrorCode];

/**
 * Storage error codes - Database and persistence errors
 */
export const StorageErrorCode = {
  /** SQLite error */
  DATABASE_ERROR: 'DATABASE_ERROR',
  /** JSONL export failed */
  EXPORT_FAILED: 'EXPORT_FAILED',
  /** JSONL import failed */
  IMPORT_FAILED: 'IMPORT_FAILED',
  /** Schema migration failed */
  MIGRATION_FAILED: 'MIGRATION_FAILED',
} as const;

export type StorageErrorCode = typeof StorageErrorCode[keyof typeof StorageErrorCode];

/**
 * All error codes combined
 */
export const ErrorCode = {
  ...ValidationErrorCode,
  ...NotFoundErrorCode,
  ...ConflictErrorCode,
  ...ConstraintErrorCode,
  ...StorageErrorCode,
} as const;

export type ErrorCode = typeof ErrorCode[keyof typeof ErrorCode];

/**
 * Maps error codes to HTTP status codes for API responses
 */
export const ErrorHttpStatus: Record<ErrorCode, number> = {
  // Validation errors -> 400
  [ErrorCode.INVALID_INPUT]: 400,
  [ErrorCode.INVALID_ID]: 400,
  [ErrorCode.INVALID_STATUS]: 400,
  [ErrorCode.TITLE_TOO_LONG]: 400,
  [ErrorCode.INVALID_CONTENT_TYPE]: 400,
  [ErrorCode.INVALID_JSON]: 400,
  [ErrorCode.MISSING_REQUIRED_FIELD]: 400,
  [ErrorCode.INVALID_TAG]: 400,
  [ErrorCode.INVALID_TIMESTAMP]: 400,
  [ErrorCode.INVALID_METADATA]: 400,

  // Not Found errors -> 404
  [ErrorCode.NOT_FOUND]: 404,
  [ErrorCode.ENTITY_NOT_FOUND]: 404,
  [ErrorCode.DOCUMENT_NOT_FOUND]: 404,
  [ErrorCode.CHANNEL_NOT_FOUND]: 404,
  [ErrorCode.PLAYBOOK_NOT_FOUND]: 404,

  // Conflict errors -> 409
  [ErrorCode.ALREADY_EXISTS]: 409,
  [ErrorCode.DUPLICATE_NAME]: 409,
  [ErrorCode.CYCLE_DETECTED]: 409,
  [ErrorCode.SYNC_CONFLICT]: 409,

  // Constraint errors -> 400/403/409
  [ErrorCode.IMMUTABLE]: 403,
  [ErrorCode.HAS_DEPENDENTS]: 409,
  [ErrorCode.INVALID_PARENT]: 400,
  [ErrorCode.MAX_DEPTH_EXCEEDED]: 400,
  [ErrorCode.MEMBER_REQUIRED]: 403,

  // Storage errors -> 500
  [ErrorCode.DATABASE_ERROR]: 500,
  [ErrorCode.EXPORT_FAILED]: 500,
  [ErrorCode.IMPORT_FAILED]: 500,
  [ErrorCode.MIGRATION_FAILED]: 500,
};

/**
 * CLI exit codes based on error category
 */
export const ErrorExitCode = {
  SUCCESS: 0,
  GENERAL_ERROR: 1,
  INVALID_ARGUMENTS: 2,
  NOT_FOUND: 3,
  VALIDATION: 4,
  PERMISSION: 5,
} as const;

export type ErrorExitCode = typeof ErrorExitCode[keyof typeof ErrorExitCode];

/**
 * Maps error codes to CLI exit codes
 */
export function getExitCode(code: ErrorCode): ErrorExitCode {
  // Validation errors
  if (code in ValidationErrorCode) {
    return ErrorExitCode.VALIDATION;
  }

  // Not Found errors
  if (code in NotFoundErrorCode) {
    return ErrorExitCode.NOT_FOUND;
  }

  // Constraint/permission errors
  if (code === ErrorCode.IMMUTABLE || code === ErrorCode.MEMBER_REQUIRED) {
    return ErrorExitCode.PERMISSION;
  }

  // Storage errors
  if (code in StorageErrorCode) {
    return ErrorExitCode.GENERAL_ERROR;
  }

  // Everything else
  return ErrorExitCode.GENERAL_ERROR;
}

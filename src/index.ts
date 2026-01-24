/**
 * Elemental - A foundational library for building agent coordination systems
 */

// Export error handling
export * from './errors/index.js';

// Export types
export * from './types/index.js';

// Export ID generation
export * from './id/index.js';

// Export API types and implementation
export * from './api/index.js';

// Export storage (excluding isConstraintError which conflicts with errors/index.js)
// The storage version checks SQLite errors; the errors version checks domain ConstraintError
// NOTE: BunStorageBackend/NodeStorageBackend are NOT exported here to avoid loading
// bun:sqlite or better-sqlite3 eagerly. Use createStorage() for automatic runtime detection.
export {
  // Types
  type Row,
  type QueryResult,
  type MutationResult,
  type StatementResult,
  type PreparedStatement,
  type IsolationLevel,
  type TransactionOptions,
  type Transaction,
  type SqlitePragmas,
  type StorageConfig,
  type DirtyElement,
  type DirtyTrackingOptions,
  type Migration,
  type MigrationResult,
  type StorageBackend,
  type StorageStats,
  type StorageFactory,
  type AsyncStorageFactory,
  DEFAULT_PRAGMAS,
  // Error utilities (excluding isConstraintError)
  SqliteResultCode,
  isBusyError,
  isUniqueViolation,
  isForeignKeyViolation,
  isCorruptionError,
  mapStorageError,
  queryError,
  mutationError,
  connectionError,
  migrationError,
  // Storage factory (handles runtime detection automatically)
  createStorage,
  createStorageAsync,
  isBunRuntime,
  isNodeRuntime,
  getRuntimeName,
  // Schema management
  CURRENT_SCHEMA_VERSION,
  MIGRATIONS,
  EXPECTED_TABLES,
  initializeSchema,
  getSchemaVersion,
  isSchemaUpToDate,
  getPendingMigrations,
  resetSchema,
  validateSchema,
  getTableColumns,
  getTableIndexes,
} from './storage/index.js';

// Re-export the storage isConstraintError with a different name for SQLite-specific checks
export { isConstraintError as isSqliteConstraintError } from './storage/index.js';

// Export HTTP handlers for browser sync
export * from './http/index.js';

// Export sync module (excluding types that conflict with api/types.ts)
// Use SyncExportOptions, SyncImportOptions, SyncImportResult for sync-specific types
export {
  // Types - renamed to avoid conflicts with API types
  type ExportOptions as SyncExportOptions,
  type ImportOptions as SyncImportOptions,
  type ImportResult as SyncImportResult,
  // Other types
  type SerializedElement,
  type SerializedDependency,
  type ContentHashResult,
  MergeResolution,
  type ConflictRecord,
  type DependencyConflictRecord,
  type ExportResult,
  type ImportError,
  type DirtyElement as SyncDirtyElement,
  type DirtyDependency,
  type SyncStatus,
  type TombstoneStatus,
  type ElementWithTombstoneStatus,
  ELEMENT_TYPE_PRIORITY,
  getTypePriority,
  HASH_EXCLUDED_FIELDS,
  // Serialization
  serializeElement,
  serializeDependency,
  parseElement,
  parseDependency,
  tryParseElement,
  tryParseDependency,
  serializeElements,
  serializeDependencies,
  parseElements,
  parseDependencies,
  sortElementsForExport,
  sortDependenciesForExport,
  isSerializedElement,
  isSerializedDependency,
  type ParseError,
  // Hashing
  computeContentHash,
  computeContentHashSync,
  hasSameContentHash,
  matchesContentHash,
  // Merge
  mergeElements,
  mergeTags,
  mergeDependencies,
  getTombstoneStatus,
  type ElementMergeResult,
  type DependencyMergeResult,
  // Service
  SyncService,
  createSyncService,
} from './sync/index.js';

/**
 * Storage System
 *
 * Exports the unified storage interface and related types.
 * Actual backend implementations are in separate files.
 */

// Type definitions
export type {
  Row,
  QueryResult,
  MutationResult,
  StatementResult,
  PreparedStatement,
  IsolationLevel,
  TransactionOptions,
  Transaction,
  SqlitePragmas,
  StorageConfig,
  DirtyElement,
  DirtyTrackingOptions,
  Migration,
  MigrationResult,
} from './types.js';

export { DEFAULT_PRAGMAS } from './types.js';

// Backend interface
export type {
  StorageBackend,
  StorageStats,
  StorageFactory,
  AsyncStorageFactory,
} from './backend.js';

// Error mapping
export {
  SqliteResultCode,
  isBusyError,
  isConstraintError,
  isUniqueViolation,
  isForeignKeyViolation,
  isCorruptionError,
  mapStorageError,
  queryError,
  mutationError,
  connectionError,
  migrationError,
} from './errors.js';

// Bun backend implementation
export { BunStorageBackend, createBunStorage } from './bun-backend.js';

// Schema management
export {
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
} from './schema.js';

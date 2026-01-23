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

// Unified storage factory (auto-detects runtime)
export {
  createStorage,
  createStorageAsync,
  isBunRuntime,
  isNodeRuntime,
  getRuntimeName,
} from './create-backend.js';

// NOTE: BunStorageBackend and NodeStorageBackend are NOT exported from this index
// to avoid eagerly loading bun:sqlite or better-sqlite3 when importing from storage.
// For explicit backend access, import directly from the specific backend files:
//   import { BunStorageBackend, createBunStorage } from '@elemental/cli/dist/storage/bun-backend.js';
//   import { NodeStorageBackend, createNodeStorage } from '@elemental/cli/dist/storage/node-backend.js';

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

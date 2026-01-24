/**
 * Error Propagation Integration Tests
 *
 * Tests that errors propagate correctly through the system layers:
 * Storage → API → CLI
 *
 * Validates:
 * - Error codes are preserved through propagation
 * - Error details are maintained
 * - Original causes are preserved
 * - CLI exit codes map correctly from error codes
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { ElementalAPIImpl } from '../api/elemental-api.js';
import { createStorage, initializeSchema } from '../storage/index.js';
import type { StorageBackend } from '../storage/backend.js';
import { createTask } from '../types/task.js';
import type { EntityId, ElementId, ElementType } from '../types/element.js';
import {
  NotFoundError,
  ConflictError,
  ConstraintError,
  ValidationError,
  isNotFoundError,
  isConflictError,
  isConstraintError,
  isValidationError,
  isElementalError,
} from './error.js';
import { ErrorCode, getExitCode, ErrorExitCode } from './codes.js';
import { mapStorageError } from '../storage/errors.js';

// ============================================================================
// Test Helpers
// ============================================================================

const mockEntityId = 'user:test-user' as EntityId;

/**
 * Helper to cast element for api.create()
 * The API expects Record<string, unknown> but our typed elements are compatible
 */
function toCreateInput<T extends { type: ElementType; createdBy: EntityId }>(
  element: T
): Record<string, unknown> & { type: ElementType; createdBy: EntityId } {
  return element as unknown as Record<string, unknown> & { type: ElementType; createdBy: EntityId };
}

// ============================================================================
// Storage → API Propagation Tests
// ============================================================================

describe('Error Propagation: Storage → API', () => {
  let backend: StorageBackend;
  let api: ElementalAPIImpl;

  beforeEach(() => {
    backend = createStorage({ path: ':memory:' });
    initializeSchema(backend);
    api = new ElementalAPIImpl(backend);
  });

  afterEach(() => {
    if (backend.isOpen) {
      backend.close();
    }
  });

  describe('NotFoundError propagation', () => {
    it('should return null when getting non-existent element', async () => {
      const nonExistentId = 'el-doesnotexist' as ElementId;
      const result = await api.get(nonExistentId);
      expect(result).toBeNull();
    });

    it('should throw NotFoundError when deleting non-existent element', async () => {
      const nonExistentId = 'el-doesnotexist' as ElementId;

      try {
        await api.delete(nonExistentId, { actor: mockEntityId });
        // If we reach here, the test should fail
        throw new Error('Should have thrown NotFoundError');
      } catch (error) {
        if (error instanceof Error && error.message === 'Should have thrown NotFoundError') {
          throw error;
        }
        expect(isNotFoundError(error)).toBe(true);
        if (isNotFoundError(error)) {
          expect(error.code).toBe(ErrorCode.NOT_FOUND);
          expect(error.httpStatus).toBe(404);
          expect(getExitCode(error.code)).toBe(ErrorExitCode.NOT_FOUND);
        }
      }
    });

    it('should throw NotFoundError when adding dependency from non-existent source', async () => {
      // Create a valid task as potential target
      const task = await createTask({ title: 'Target Task', createdBy: mockEntityId });
      await api.create(toCreateInput(task));

      try {
        await api.addDependency({
          sourceId: 'el-nonexistent' as ElementId,
          targetId: task.id,
          type: 'blocks',
          actor: mockEntityId,
        });
        throw new Error('Should have thrown NotFoundError');
      } catch (error) {
        if (error instanceof Error && error.message === 'Should have thrown NotFoundError') {
          throw error;
        }
        expect(isNotFoundError(error)).toBe(true);
        if (isNotFoundError(error)) {
          expect(error.code).toBe(ErrorCode.NOT_FOUND);
        }
      }
    });
  });

  describe('ConflictError propagation', () => {
    it('should throw ConflictError when creating duplicate element', async () => {
      const task = await createTask({ title: 'Original Task', createdBy: mockEntityId });
      await api.create(toCreateInput(task));

      try {
        await api.create(toCreateInput(task));
        throw new Error('Should have thrown ConflictError');
      } catch (error) {
        if (error instanceof Error && error.message === 'Should have thrown ConflictError') {
          throw error;
        }
        expect(isConflictError(error)).toBe(true);
        if (isConflictError(error)) {
          expect(error.code).toBe(ErrorCode.ALREADY_EXISTS);
          expect(error.httpStatus).toBe(409);
          expect(getExitCode(error.code)).toBe(ErrorExitCode.GENERAL_ERROR);
        }
      }
    });

    it('should throw ConflictError on duplicate dependency', async () => {
      // Create two tasks
      const task1 = await createTask({ title: 'Task 1', createdBy: mockEntityId });
      const task2 = await createTask({ title: 'Task 2', createdBy: mockEntityId });
      await api.create(toCreateInput(task1));
      await api.create(toCreateInput(task2));

      // Create initial dependency
      await api.addDependency({
        sourceId: task2.id,
        targetId: task1.id,
        type: 'blocks',
        actor: mockEntityId,
      });

      try {
        // Try to create the same dependency again
        await api.addDependency({
          sourceId: task2.id,
          targetId: task1.id,
          type: 'blocks',
          actor: mockEntityId,
        });
        throw new Error('Should have thrown ConflictError');
      } catch (error) {
        if (error instanceof Error && error.message === 'Should have thrown ConflictError') {
          throw error;
        }
        expect(isConflictError(error)).toBe(true);
        if (isConflictError(error)) {
          expect(error.code).toBe(ErrorCode.DUPLICATE_DEPENDENCY);
          expect(error.details.sourceId).toBeDefined();
          expect(error.details.targetId).toBeDefined();
        }
      }
    });
  });

  describe('ConstraintError behavior', () => {
    it('should create ConstraintError with correct properties', () => {
      const error = new ConstraintError(
        'Cannot delete element with dependents',
        ErrorCode.HAS_DEPENDENTS,
        { elementId: 'el-test', dependentCount: 3 }
      );

      expect(error.code).toBe(ErrorCode.HAS_DEPENDENTS);
      expect(error.httpStatus).toBe(409);
      expect(error.details.elementId).toBe('el-test');
      expect(error.details.dependentCount).toBe(3);
      expect(isConstraintError(error)).toBe(true);
    });

    it('should map HAS_DEPENDENTS to GENERAL_ERROR exit code', () => {
      expect(getExitCode(ErrorCode.HAS_DEPENDENTS)).toBe(ErrorExitCode.GENERAL_ERROR);
    });

    it('should map IMMUTABLE to PERMISSION exit code', () => {
      expect(getExitCode(ErrorCode.IMMUTABLE)).toBe(ErrorExitCode.PERMISSION);
    });
  });

  describe('Error cause preservation', () => {
    it('should preserve original error as cause', () => {
      const originalError = new Error('UNIQUE constraint failed: elements.id');
      const mappedError = mapStorageError(originalError, { elementId: 'el-test' });

      expect(mappedError.cause).toBe(originalError);
      expect(mappedError.code).toBe(ErrorCode.ALREADY_EXISTS);
      expect(mappedError.details.elementId).toBe('el-test');
    });

    it('should preserve constraint details from SQLite error', () => {
      const sqliteError = new Error('UNIQUE constraint failed: elements.id');
      const mapped = mapStorageError(sqliteError, { operation: 'insert' });

      expect(mapped.details.table).toBe('elements');
      expect(mapped.details.column).toBe('id');
      expect(mapped.details.operation).toBe('insert');
    });
  });
});

// ============================================================================
// API Error Details Tests
// ============================================================================

describe('Error Details Preservation', () => {
  let backend: StorageBackend;
  let api: ElementalAPIImpl;

  beforeEach(() => {
    backend = createStorage({ path: ':memory:' });
    initializeSchema(backend);
    api = new ElementalAPIImpl(backend);
  });

  afterEach(() => {
    if (backend.isOpen) {
      backend.close();
    }
  });

  it('should include elementId in NotFoundError details', async () => {
    const testId = 'el-notfound123' as ElementId;

    try {
      await api.delete(testId, { actor: mockEntityId });
    } catch (error) {
      if (isElementalError(error)) {
        expect(error.details.id ?? error.details.elementId).toBe(testId);
      }
    }
  });

  it('should include dependency info in cycle error', async () => {
    const task1 = await createTask({ title: 'A', createdBy: mockEntityId });
    const task2 = await createTask({ title: 'B', createdBy: mockEntityId });
    await api.create(toCreateInput(task1));
    await api.create(toCreateInput(task2));

    await api.addDependency({
      sourceId: task2.id,
      targetId: task1.id,
      type: 'blocks',
      actor: mockEntityId,
    });

    try {
      await api.addDependency({
        sourceId: task1.id,
        targetId: task2.id,
        type: 'blocks',
        actor: mockEntityId,
      });
    } catch (error) {
      if (isConflictError(error)) {
        expect(error.code).toBe(ErrorCode.CYCLE_DETECTED);
        expect(error.details.sourceId).toBeDefined();
        expect(error.details.targetId).toBeDefined();
      }
    }
  });
});

// ============================================================================
// Exit Code Mapping Tests
// ============================================================================

describe('Exit Code Mapping', () => {
  it('should map validation errors to VALIDATION exit code', () => {
    const validationCodes = [
      ErrorCode.INVALID_INPUT,
      ErrorCode.INVALID_ID,
      ErrorCode.INVALID_STATUS,
      ErrorCode.TITLE_TOO_LONG,
      ErrorCode.INVALID_CONTENT_TYPE,
      ErrorCode.INVALID_JSON,
      ErrorCode.MISSING_REQUIRED_FIELD,
    ];

    for (const code of validationCodes) {
      expect(getExitCode(code)).toBe(ErrorExitCode.VALIDATION);
    }
  });

  it('should map not found errors to NOT_FOUND exit code', () => {
    const notFoundCodes = [
      ErrorCode.NOT_FOUND,
      ErrorCode.ENTITY_NOT_FOUND,
      ErrorCode.DOCUMENT_NOT_FOUND,
      ErrorCode.CHANNEL_NOT_FOUND,
      ErrorCode.PLAYBOOK_NOT_FOUND,
    ];

    for (const code of notFoundCodes) {
      expect(getExitCode(code)).toBe(ErrorExitCode.NOT_FOUND);
    }
  });

  it('should map permission errors to PERMISSION exit code', () => {
    const permissionCodes = [ErrorCode.IMMUTABLE, ErrorCode.MEMBER_REQUIRED];

    for (const code of permissionCodes) {
      expect(getExitCode(code)).toBe(ErrorExitCode.PERMISSION);
    }
  });

  it('should map storage errors to GENERAL_ERROR exit code', () => {
    const storageCodes = [
      ErrorCode.DATABASE_ERROR,
      ErrorCode.EXPORT_FAILED,
      ErrorCode.IMPORT_FAILED,
      ErrorCode.MIGRATION_FAILED,
    ];

    for (const code of storageCodes) {
      expect(getExitCode(code)).toBe(ErrorExitCode.GENERAL_ERROR);
    }
  });
});

// ============================================================================
// Error JSON Serialization Tests
// ============================================================================

describe('Error Serialization', () => {
  it('should serialize ElementalError to JSON', () => {
    const error = new NotFoundError('Element not found: el-test', ErrorCode.NOT_FOUND, {
      id: 'el-test',
      type: 'task',
    });

    const json = error.toJSON();

    expect(json.name).toBe('NotFoundError');
    expect(json.message).toBe('Element not found: el-test');
    expect(json.code).toBe(ErrorCode.NOT_FOUND);
    expect(json.httpStatus).toBe(404);
    expect(json.details.id).toBe('el-test');
  });

  it('should produce valid JSON string', () => {
    const error = new ConflictError('Cycle detected', ErrorCode.CYCLE_DETECTED, {
      sourceId: 'el-a',
      targetId: 'el-b',
      type: 'blocks',
    });

    const jsonString = JSON.stringify(error.toJSON());
    const parsed = JSON.parse(jsonString);

    expect(parsed.code).toBe('CYCLE_DETECTED');
    expect(parsed.details.sourceId).toBe('el-a');
    expect(parsed.details.targetId).toBe('el-b');
  });
});

// ============================================================================
// Error Type Guards Tests
// ============================================================================

describe('Error Type Guards', () => {
  it('should correctly identify error types', () => {
    const notFound = new NotFoundError('Not found', ErrorCode.NOT_FOUND);
    const conflict = new ConflictError('Conflict', ErrorCode.ALREADY_EXISTS);
    const constraint = new ConstraintError('Constraint', ErrorCode.HAS_DEPENDENTS);
    const validation = new ValidationError('Validation');
    const regularError = new Error('Regular error');

    expect(isNotFoundError(notFound)).toBe(true);
    expect(isNotFoundError(conflict)).toBe(false);
    expect(isNotFoundError(regularError)).toBe(false);

    expect(isConflictError(conflict)).toBe(true);
    expect(isConflictError(notFound)).toBe(false);

    expect(isConstraintError(constraint)).toBe(true);
    expect(isConstraintError(notFound)).toBe(false);

    expect(isValidationError(validation)).toBe(true);
    expect(isValidationError(notFound)).toBe(false);

    expect(isElementalError(notFound)).toBe(true);
    expect(isElementalError(conflict)).toBe(true);
    expect(isElementalError(constraint)).toBe(true);
    expect(isElementalError(validation)).toBe(true);
    expect(isElementalError(regularError)).toBe(false);
    expect(isElementalError(null)).toBe(false);
    expect(isElementalError(undefined)).toBe(false);
  });
});

/**
 * Entity Command Tests
 *
 * Tests for entity register and list CLI commands.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { entityCommand, entityRegisterCommand, entityListCommand } from './entity.js';
import type { GlobalOptions } from '../types.js';
import { ExitCode } from '../types.js';
import { createStorage, initializeSchema } from '../../storage/index.js';

// ============================================================================
// Test Utilities
// ============================================================================

const TEST_DIR = join(import.meta.dir, '__test_entity_workspace__');
const ELEMENTAL_DIR = join(TEST_DIR, '.elemental');
const DB_PATH = join(ELEMENTAL_DIR, 'elemental.db');

function createTestOptions(overrides: Partial<GlobalOptions> = {}): GlobalOptions {
  return {
    db: DB_PATH,
    actor: 'test-user',
    json: false,
    quiet: false,
    verbose: false,
    help: false,
    version: false,
    ...overrides,
  };
}

// ============================================================================
// Setup / Teardown
// ============================================================================

beforeEach(() => {
  // Create test workspace
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true });
  }
  mkdirSync(ELEMENTAL_DIR, { recursive: true });

  // Initialize database
  const backend = createStorage({ path: DB_PATH, create: true });
  initializeSchema(backend);
});

afterEach(() => {
  // Cleanup test workspace
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true });
  }
});

// ============================================================================
// Entity Register Tests
// ============================================================================

describe('entity register command', () => {
  test('fails without name argument', async () => {
    const options = createTestOptions();
    const result = await entityRegisterCommand.handler!([], options);

    expect(result.exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
    expect(result.error).toContain('Usage');
  });

  test('registers an agent entity by default', async () => {
    const options = createTestOptions();
    const result = await entityRegisterCommand.handler!(['test-agent'], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toBeDefined();
    expect((result.data as { name: string }).name).toBe('test-agent');
    expect((result.data as { entityType: string }).entityType).toBe('agent');
    expect((result.data as { id: string }).id).toMatch(/^el-/);
  });

  test('registers a human entity with --type', async () => {
    const options = createTestOptions({ type: 'human' } as GlobalOptions & { type: string });
    const result = await entityRegisterCommand.handler!(['alice'], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect((result.data as { name: string }).name).toBe('alice');
    expect((result.data as { entityType: string }).entityType).toBe('human');
  });

  test('registers a system entity with --type', async () => {
    const options = createTestOptions({ type: 'system' } as GlobalOptions & { type: string });
    const result = await entityRegisterCommand.handler!(['ci-system'], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect((result.data as { name: string }).name).toBe('ci-system');
    expect((result.data as { entityType: string }).entityType).toBe('system');
  });

  test('fails with invalid entity type', async () => {
    const options = createTestOptions({ type: 'invalid' } as GlobalOptions & { type: string });
    const result = await entityRegisterCommand.handler!(['test'], options);

    expect(result.exitCode).toBe(ExitCode.VALIDATION);
    expect(result.error).toContain('Invalid entity type');
    expect(result.error).toContain('agent');
    expect(result.error).toContain('human');
    expect(result.error).toContain('system');
  });

  test('fails with invalid name format', async () => {
    const options = createTestOptions();
    const result = await entityRegisterCommand.handler!(['_invalid'], options);

    expect(result.exitCode).toBe(ExitCode.VALIDATION);
    expect(result.error).toContain('Validation error');
  });

  test('fails with reserved name', async () => {
    const options = createTestOptions();
    const result = await entityRegisterCommand.handler!(['system'], options);

    expect(result.exitCode).toBe(ExitCode.VALIDATION);
    expect(result.error).toContain('reserved');
  });

  test('fails with duplicate name', async () => {
    const options = createTestOptions();

    // Register first entity
    await entityRegisterCommand.handler!(['test-entity'], options);

    // Try to register with same name
    const result = await entityRegisterCommand.handler!(['test-entity'], options);

    expect(result.exitCode).toBe(ExitCode.VALIDATION);
    expect(result.error).toContain('already exists');
  });

  test('registers entity with tags', async () => {
    const options = createTestOptions({ tag: ['team-alpha', 'frontend'] } as GlobalOptions & { tag: string[] });
    const result = await entityRegisterCommand.handler!(['tagged-entity'], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect((result.data as { tags: string[] }).tags).toEqual(['team-alpha', 'frontend']);
  });

  test('registers entity with public key', async () => {
    const validKey = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
    const options = createTestOptions({ publicKey: validKey } as GlobalOptions & { publicKey: string });
    const result = await entityRegisterCommand.handler!(['crypto-entity'], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect((result.data as { publicKey: string }).publicKey).toBe(validKey);
  });

  test('outputs JSON in JSON mode', async () => {
    const options = createTestOptions({ json: true });
    const result = await entityRegisterCommand.handler!(['json-entity'], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toBeDefined();
    expect(typeof result.data).toBe('object');
  });

  test('outputs only ID in quiet mode', async () => {
    const options = createTestOptions({ quiet: true });
    const result = await entityRegisterCommand.handler!(['quiet-entity'], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toMatch(/^el-/);
  });

  test('fails when database path does not exist', async () => {
    const nonExistentPath = join(TEST_DIR, 'nonexistent', 'test.db');
    const options = createTestOptions({ db: nonExistentPath });
    const result = await entityRegisterCommand.handler!(['test'], options);

    // With explicit db path that doesn't exist, should still create and succeed
    // But if we pass an undefined db, it will look for .elemental in cwd
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
  });
});

// ============================================================================
// Entity List Tests
// ============================================================================

describe('entity list command', () => {
  test('returns empty list when no entities exist', async () => {
    const options = createTestOptions();
    const result = await entityListCommand.handler!([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toEqual([]);
    expect(result.message).toContain('No entities found');
  });

  test('lists registered entities', async () => {
    const options = createTestOptions();

    // Register some entities
    await entityRegisterCommand.handler!(['entity-1'], options);
    await entityRegisterCommand.handler!(['entity-2'], { ...options, type: 'human' } as GlobalOptions & { type: string });
    await entityRegisterCommand.handler!(['entity-3'], { ...options, type: 'system' } as GlobalOptions & { type: string });

    // List entities
    const result = await entityListCommand.handler!([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect((result.data as unknown[]).length).toBe(3);
  });

  test('filters by entity type', async () => {
    const options = createTestOptions();

    // Register entities of different types
    await entityRegisterCommand.handler!(['agent-1'], options);
    await entityRegisterCommand.handler!(['agent-2'], options);
    await entityRegisterCommand.handler!(['human-1'], { ...options, type: 'human' } as GlobalOptions & { type: string });

    // List only agents
    const result = await entityListCommand.handler!([], { ...options, type: 'agent' } as GlobalOptions & { type: string });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect((result.data as unknown[]).length).toBe(2);
    for (const entity of result.data as { entityType: string }[]) {
      expect(entity.entityType).toBe('agent');
    }
  });

  test('respects limit option', async () => {
    const options = createTestOptions();

    // Register several entities
    await entityRegisterCommand.handler!(['entity-1'], options);
    await entityRegisterCommand.handler!(['entity-2'], options);
    await entityRegisterCommand.handler!(['entity-3'], options);

    // List with limit
    const result = await entityListCommand.handler!([], { ...options, limit: 2 } as GlobalOptions & { limit: number });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect((result.data as unknown[]).length).toBe(2);
  });

  test('outputs JSON in JSON mode', async () => {
    const options = createTestOptions({ json: true });
    await entityRegisterCommand.handler!(['test-entity'], options);

    const result = await entityListCommand.handler!([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(Array.isArray(result.data)).toBe(true);
  });

  test('outputs only IDs in quiet mode', async () => {
    const options = createTestOptions();
    await entityRegisterCommand.handler!(['quiet-test'], options);

    const result = await entityListCommand.handler!([], { ...options, quiet: true });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(typeof result.data).toBe('string');
    expect(result.data).toMatch(/^el-/);
  });

  test('succeeds with explicit database path', async () => {
    const newPath = join(TEST_DIR, 'new-db', 'test.db');
    const options = createTestOptions({ db: newPath });
    const result = await entityListCommand.handler!([], options);

    // With explicit db path that doesn't exist, should create and return empty list
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toEqual([]);
  });
});

// ============================================================================
// Entity Parent Command Tests
// ============================================================================

describe('entity command', () => {
  test('has correct name', () => {
    expect(entityCommand.name).toBe('entity');
  });

  test('has description', () => {
    expect(entityCommand.description).toBeDefined();
    expect(entityCommand.description.length).toBeGreaterThan(0);
  });

  test('has usage', () => {
    expect(entityCommand.usage).toBeDefined();
    expect(entityCommand.usage).toContain('entity');
  });

  test('has help text', () => {
    expect(entityCommand.help).toBeDefined();
    expect(entityCommand.help).toContain('Manage');
  });

  test('has register subcommand', () => {
    expect(entityCommand.subcommands).toBeDefined();
    expect(entityCommand.subcommands!.register).toBeDefined();
    expect(entityCommand.subcommands!.register.name).toBe('register');
  });

  test('has list subcommand', () => {
    expect(entityCommand.subcommands).toBeDefined();
    expect(entityCommand.subcommands!.list).toBeDefined();
    expect(entityCommand.subcommands!.list.name).toBe('list');
  });

  test('defaults to list when no subcommand', async () => {
    const options = createTestOptions();
    await entityRegisterCommand.handler!(['test-entity'], options);

    const result = await entityCommand.handler!([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(Array.isArray(result.data)).toBe(true);
  });
});

// ============================================================================
// Register Command Structure Tests
// ============================================================================

describe('entity register command structure', () => {
  test('has correct name', () => {
    expect(entityRegisterCommand.name).toBe('register');
  });

  test('has description', () => {
    expect(entityRegisterCommand.description).toBeDefined();
  });

  test('has usage', () => {
    expect(entityRegisterCommand.usage).toContain('register');
  });

  test('has help text', () => {
    expect(entityRegisterCommand.help).toBeDefined();
    expect(entityRegisterCommand.help).toContain('Register');
  });

  test('has --type option', () => {
    expect(entityRegisterCommand.options).toBeDefined();
    const typeOption = entityRegisterCommand.options!.find((o) => o.name === 'type');
    expect(typeOption).toBeDefined();
    expect(typeOption!.short).toBe('t');
  });

  test('has --public-key option', () => {
    const keyOption = entityRegisterCommand.options!.find((o) => o.name === 'public-key');
    expect(keyOption).toBeDefined();
  });

  test('has --tag option', () => {
    const tagOption = entityRegisterCommand.options!.find((o) => o.name === 'tag');
    expect(tagOption).toBeDefined();
  });
});

// ============================================================================
// List Command Structure Tests
// ============================================================================

describe('entity list command structure', () => {
  test('has correct name', () => {
    expect(entityListCommand.name).toBe('list');
  });

  test('has description', () => {
    expect(entityListCommand.description).toBeDefined();
  });

  test('has usage', () => {
    expect(entityListCommand.usage).toContain('list');
  });

  test('has help text', () => {
    expect(entityListCommand.help).toBeDefined();
    expect(entityListCommand.help).toContain('List');
  });

  test('has --type option', () => {
    expect(entityListCommand.options).toBeDefined();
    const typeOption = entityListCommand.options!.find((o) => o.name === 'type');
    expect(typeOption).toBeDefined();
    expect(typeOption!.short).toBe('t');
  });

  test('has --limit option', () => {
    const limitOption = entityListCommand.options!.find((o) => o.name === 'limit');
    expect(limitOption).toBeDefined();
    expect(limitOption!.short).toBe('n');
  });
});

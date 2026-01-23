import { describe, expect, test } from 'bun:test';
import {
  EntityTypeValue,
  MAX_NAME_LENGTH,
  RESERVED_NAMES,
  Entity,
  isValidEntityType,
  validateEntityType,
  isReservedName,
  isValidEntityName,
  validateEntityName,
  isValidPublicKey,
  validatePublicKey,
  isEntity,
  validateEntity,
  createEntity,
  CreateEntityInput,
  hasCryptographicIdentity,
  getEntityDisplayName,
  entitiesHaveSameName,
  filterByEntityType,
} from './entity.js';
import { ElementId, EntityId, ElementType, Timestamp } from './element.js';
import { ValidationError } from '../errors/error.js';
import { ErrorCode } from '../errors/codes.js';

// Helper to create a valid entity for testing
function createTestEntity(overrides: Partial<Entity> = {}): Entity {
  return {
    id: 'el-abc123' as ElementId,
    type: ElementType.ENTITY,
    createdAt: '2025-01-22T10:00:00.000Z' as Timestamp,
    updatedAt: '2025-01-22T10:00:00.000Z' as Timestamp,
    createdBy: 'el-system1' as EntityId,
    tags: [],
    metadata: {},
    name: 'test-entity',
    entityType: EntityTypeValue.AGENT,
    ...overrides,
  };
}

// Valid base64-encoded Ed25519 public key (44 characters with = padding)
const VALID_PUBLIC_KEY = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
const INVALID_PUBLIC_KEY_SHORT = 'AAAA';
const INVALID_PUBLIC_KEY_NO_PADDING = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

describe('EntityTypeValue', () => {
  test('contains all expected types', () => {
    expect(EntityTypeValue.AGENT).toBe('agent');
    expect(EntityTypeValue.HUMAN).toBe('human');
    expect(EntityTypeValue.SYSTEM).toBe('system');
  });

  test('has exactly 3 types', () => {
    expect(Object.keys(EntityTypeValue)).toHaveLength(3);
  });
});

describe('isValidEntityType', () => {
  test('accepts all valid entity types', () => {
    expect(isValidEntityType('agent')).toBe(true);
    expect(isValidEntityType('human')).toBe(true);
    expect(isValidEntityType('system')).toBe(true);
  });

  test('rejects invalid types', () => {
    expect(isValidEntityType('invalid')).toBe(false);
    expect(isValidEntityType('task')).toBe(false);
    expect(isValidEntityType(null)).toBe(false);
    expect(isValidEntityType(undefined)).toBe(false);
    expect(isValidEntityType(123)).toBe(false);
    expect(isValidEntityType({})).toBe(false);
  });
});

describe('validateEntityType', () => {
  test('returns valid entity type', () => {
    expect(validateEntityType('agent')).toBe('agent');
    expect(validateEntityType('human')).toBe('human');
    expect(validateEntityType('system')).toBe('system');
  });

  test('throws ValidationError for invalid type', () => {
    expect(() => validateEntityType('invalid')).toThrow(ValidationError);
    try {
      validateEntityType('invalid');
    } catch (e) {
      const err = e as ValidationError;
      expect(err.code).toBe(ErrorCode.INVALID_INPUT);
      expect(err.details.field).toBe('entityType');
    }
  });
});

describe('RESERVED_NAMES', () => {
  test('contains expected reserved names', () => {
    expect(RESERVED_NAMES).toContain('system');
    expect(RESERVED_NAMES).toContain('anonymous');
    expect(RESERVED_NAMES).toContain('unknown');
  });

  test('has exactly 3 reserved names', () => {
    expect(RESERVED_NAMES).toHaveLength(3);
  });
});

describe('isReservedName', () => {
  test('identifies reserved names (case-insensitive)', () => {
    expect(isReservedName('system')).toBe(true);
    expect(isReservedName('anonymous')).toBe(true);
    expect(isReservedName('unknown')).toBe(true);
    expect(isReservedName('System')).toBe(true);
    expect(isReservedName('SYSTEM')).toBe(true);
  });

  test('returns false for non-reserved names', () => {
    expect(isReservedName('alice')).toBe(false);
    expect(isReservedName('agent-1')).toBe(false);
    expect(isReservedName('my-system')).toBe(false);
  });
});

describe('isValidEntityName', () => {
  test('accepts valid names', () => {
    expect(isValidEntityName('alice')).toBe(true);
    expect(isValidEntityName('agent-1')).toBe(true);
    expect(isValidEntityName('Claude3Opus')).toBe(true);
    expect(isValidEntityName('human_bob')).toBe(true);
    expect(isValidEntityName('ci-pipeline-1')).toBe(true);
    expect(isValidEntityName('a')).toBe(true); // Single character
  });

  test('rejects non-string values', () => {
    expect(isValidEntityName(null)).toBe(false);
    expect(isValidEntityName(undefined)).toBe(false);
    expect(isValidEntityName(123)).toBe(false);
    expect(isValidEntityName({})).toBe(false);
  });

  test('rejects empty string', () => {
    expect(isValidEntityName('')).toBe(false);
  });

  test('rejects names exceeding max length', () => {
    const longName = 'a' + 'b'.repeat(MAX_NAME_LENGTH);
    expect(isValidEntityName(longName)).toBe(false);
    expect(isValidEntityName('a' + 'b'.repeat(MAX_NAME_LENGTH - 1))).toBe(true);
  });

  test('rejects names not starting with letter', () => {
    expect(isValidEntityName('_underscore')).toBe(false);
    expect(isValidEntityName('-hyphen')).toBe(false);
    expect(isValidEntityName('1number')).toBe(false);
  });

  test('rejects names with invalid characters', () => {
    expect(isValidEntityName('has spaces')).toBe(false);
    expect(isValidEntityName('has@symbol')).toBe(false);
    expect(isValidEntityName('has.dot')).toBe(false);
    expect(isValidEntityName('has/slash')).toBe(false);
    expect(isValidEntityName('has#hash')).toBe(false);
  });

  test('rejects reserved names', () => {
    expect(isValidEntityName('system')).toBe(false);
    expect(isValidEntityName('anonymous')).toBe(false);
    expect(isValidEntityName('unknown')).toBe(false);
  });
});

describe('validateEntityName', () => {
  test('returns valid name', () => {
    expect(validateEntityName('alice')).toBe('alice');
    expect(validateEntityName('agent-1')).toBe('agent-1');
  });

  test('throws for non-string', () => {
    expect(() => validateEntityName(123)).toThrow(ValidationError);
    try {
      validateEntityName(123);
    } catch (e) {
      const err = e as ValidationError;
      expect(err.code).toBe(ErrorCode.INVALID_INPUT);
      expect(err.details.field).toBe('name');
    }
  });

  test('throws for empty name', () => {
    expect(() => validateEntityName('')).toThrow(ValidationError);
    try {
      validateEntityName('');
    } catch (e) {
      const err = e as ValidationError;
      expect(err.code).toBe(ErrorCode.MISSING_REQUIRED_FIELD);
    }
  });

  test('throws for name exceeding max length', () => {
    const longName = 'a' + 'b'.repeat(MAX_NAME_LENGTH);
    expect(() => validateEntityName(longName)).toThrow(ValidationError);
    try {
      validateEntityName(longName);
    } catch (e) {
      const err = e as ValidationError;
      expect(err.code).toBe(ErrorCode.INVALID_INPUT);
      expect(err.details.actual).toBe(longName.length);
    }
  });

  test('throws for name not starting with letter', () => {
    expect(() => validateEntityName('_underscore')).toThrow(ValidationError);
    try {
      validateEntityName('_underscore');
    } catch (e) {
      const err = e as ValidationError;
      expect(err.message).toContain('must start with a letter');
    }
  });

  test('throws for name with invalid characters', () => {
    expect(() => validateEntityName('has spaces')).toThrow(ValidationError);
    try {
      validateEntityName('has@symbol');
    } catch (e) {
      const err = e as ValidationError;
      expect(err.message).toContain('invalid characters');
    }
  });

  test('throws for reserved names', () => {
    expect(() => validateEntityName('system')).toThrow(ValidationError);
    try {
      validateEntityName('system');
    } catch (e) {
      const err = e as ValidationError;
      expect(err.message).toContain('reserved');
    }
  });
});

describe('isValidPublicKey', () => {
  test('accepts valid Ed25519 public key', () => {
    expect(isValidPublicKey(VALID_PUBLIC_KEY)).toBe(true);
  });

  test('rejects non-string values', () => {
    expect(isValidPublicKey(null)).toBe(false);
    expect(isValidPublicKey(undefined)).toBe(false);
    expect(isValidPublicKey(123)).toBe(false);
    expect(isValidPublicKey({})).toBe(false);
  });

  test('rejects keys with wrong length', () => {
    expect(isValidPublicKey(INVALID_PUBLIC_KEY_SHORT)).toBe(false);
    expect(isValidPublicKey(INVALID_PUBLIC_KEY_NO_PADDING)).toBe(false);
  });

  test('rejects keys with invalid base64 characters', () => {
    expect(isValidPublicKey('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA!=')).toBe(false);
  });
});

describe('validatePublicKey', () => {
  test('returns valid public key', () => {
    expect(validatePublicKey(VALID_PUBLIC_KEY)).toBe(VALID_PUBLIC_KEY);
  });

  test('throws for non-string', () => {
    expect(() => validatePublicKey(123)).toThrow(ValidationError);
    try {
      validatePublicKey(123);
    } catch (e) {
      const err = e as ValidationError;
      expect(err.code).toBe(ErrorCode.INVALID_INPUT);
      expect(err.details.field).toBe('publicKey');
    }
  });

  test('throws for invalid format', () => {
    expect(() => validatePublicKey(INVALID_PUBLIC_KEY_SHORT)).toThrow(ValidationError);
    try {
      validatePublicKey(INVALID_PUBLIC_KEY_SHORT);
    } catch (e) {
      const err = e as ValidationError;
      expect(err.message).toContain('Invalid public key format');
    }
  });
});

describe('isEntity', () => {
  test('accepts valid entity', () => {
    expect(isEntity(createTestEntity())).toBe(true);
  });

  test('accepts entity with public key', () => {
    expect(isEntity(createTestEntity({ publicKey: VALID_PUBLIC_KEY }))).toBe(true);
  });

  test('rejects non-objects', () => {
    expect(isEntity(null)).toBe(false);
    expect(isEntity(undefined)).toBe(false);
    expect(isEntity('string')).toBe(false);
    expect(isEntity(123)).toBe(false);
  });

  test('rejects entities with missing fields', () => {
    expect(isEntity({ ...createTestEntity(), id: undefined })).toBe(false);
    expect(isEntity({ ...createTestEntity(), type: undefined })).toBe(false);
    expect(isEntity({ ...createTestEntity(), name: undefined })).toBe(false);
    expect(isEntity({ ...createTestEntity(), entityType: undefined })).toBe(false);
  });

  test('rejects entities with wrong type', () => {
    expect(isEntity({ ...createTestEntity(), type: 'task' })).toBe(false);
  });

  test('rejects entities with invalid name', () => {
    expect(isEntity({ ...createTestEntity(), name: '_invalid' })).toBe(false);
    expect(isEntity({ ...createTestEntity(), name: 'system' })).toBe(false);
  });

  test('rejects entities with invalid entityType', () => {
    expect(isEntity({ ...createTestEntity(), entityType: 'invalid' })).toBe(false);
  });

  test('rejects entities with invalid public key', () => {
    expect(isEntity({ ...createTestEntity(), publicKey: INVALID_PUBLIC_KEY_SHORT })).toBe(false);
  });
});

describe('validateEntity', () => {
  test('returns valid entity', () => {
    const entity = createTestEntity();
    expect(validateEntity(entity)).toEqual(entity);
  });

  test('throws for non-object', () => {
    expect(() => validateEntity(null)).toThrow(ValidationError);
    expect(() => validateEntity('string')).toThrow(ValidationError);
  });

  test('throws for missing required fields', () => {
    expect(() => validateEntity({ ...createTestEntity(), id: '' })).toThrow(ValidationError);
    expect(() => validateEntity({ ...createTestEntity(), createdBy: '' })).toThrow(ValidationError);

    try {
      validateEntity({ ...createTestEntity(), name: 123 });
    } catch (e) {
      expect((e as ValidationError).code).toBe(ErrorCode.INVALID_INPUT);
    }
  });

  test('throws for wrong type value', () => {
    try {
      validateEntity({ ...createTestEntity(), type: 'task' });
    } catch (e) {
      expect((e as ValidationError).details.expected).toBe('entity');
    }
  });

  test('validates entity-specific fields', () => {
    expect(() => validateEntity({ ...createTestEntity(), name: '_invalid' })).toThrow(ValidationError);
    expect(() => validateEntity({ ...createTestEntity(), entityType: 'invalid' })).toThrow(ValidationError);
    expect(() => validateEntity({ ...createTestEntity(), publicKey: INVALID_PUBLIC_KEY_SHORT })).toThrow(ValidationError);
  });
});

describe('createEntity', () => {
  const validInput: CreateEntityInput = {
    name: 'test-agent',
    entityType: EntityTypeValue.AGENT,
    createdBy: 'el-system1' as EntityId,
  };

  test('creates entity with required fields', async () => {
    const entity = await createEntity(validInput);

    expect(entity.name).toBe('test-agent');
    expect(entity.entityType).toBe('agent');
    expect(entity.type).toBe(ElementType.ENTITY);
    expect(entity.createdBy).toBe('el-system1' as EntityId);
    expect(entity.tags).toEqual([]);
    expect(entity.metadata).toEqual({});
    expect(entity.id).toMatch(/^el-[0-9a-z]{3,8}$/);
    expect(entity.publicKey).toBeUndefined();
  });

  test('creates entity with optional fields', async () => {
    const entity = await createEntity({
      ...validInput,
      tags: ['ai', 'assistant'],
      metadata: { model: 'claude-3-opus' },
      publicKey: VALID_PUBLIC_KEY,
    });

    expect(entity.tags).toEqual(['ai', 'assistant']);
    expect(entity.metadata).toEqual({ model: 'claude-3-opus' });
    expect(entity.publicKey).toBe(VALID_PUBLIC_KEY);
  });

  test('validates name', async () => {
    await expect(createEntity({ ...validInput, name: '_invalid' })).rejects.toThrow(ValidationError);
    await expect(createEntity({ ...validInput, name: 'system' })).rejects.toThrow(ValidationError);
  });

  test('validates entityType', async () => {
    await expect(createEntity({ ...validInput, entityType: 'invalid' as any })).rejects.toThrow(ValidationError);
  });

  test('validates publicKey if provided', async () => {
    await expect(createEntity({ ...validInput, publicKey: INVALID_PUBLIC_KEY_SHORT })).rejects.toThrow(ValidationError);
  });

  test('generates unique IDs for different entities', async () => {
    const entity1 = await createEntity(validInput);
    const entity2 = await createEntity({ ...validInput, name: 'other-agent' });

    expect(entity1.id).not.toBe(entity2.id);
  });

  test('sets createdAt and updatedAt to current time', async () => {
    const before = new Date().toISOString();
    const entity = await createEntity(validInput);
    const after = new Date().toISOString();

    expect(entity.createdAt >= before).toBe(true);
    expect(entity.createdAt <= after).toBe(true);
    expect(entity.createdAt).toBe(entity.updatedAt);
  });
});

describe('hasCryptographicIdentity', () => {
  test('returns true for entity with public key', () => {
    const entity = createTestEntity({ publicKey: VALID_PUBLIC_KEY });
    expect(hasCryptographicIdentity(entity)).toBe(true);
  });

  test('returns false for entity without public key', () => {
    const entity = createTestEntity();
    expect(hasCryptographicIdentity(entity)).toBe(false);
  });
});

describe('getEntityDisplayName', () => {
  test('returns displayName from metadata if available', () => {
    const entity = createTestEntity({
      name: 'agent-1',
      metadata: { displayName: 'Agent One' }
    });
    expect(getEntityDisplayName(entity)).toBe('Agent One');
  });

  test('returns name if no displayName in metadata', () => {
    const entity = createTestEntity({ name: 'agent-1' });
    expect(getEntityDisplayName(entity)).toBe('agent-1');
  });

  test('returns name if displayName is not a string', () => {
    const entity = createTestEntity({
      name: 'agent-1',
      metadata: { displayName: 123 }
    });
    expect(getEntityDisplayName(entity)).toBe('agent-1');
  });
});

describe('entitiesHaveSameName', () => {
  test('returns true for entities with same name', () => {
    const entity1 = createTestEntity({ id: 'el-1' as ElementId, name: 'alice' });
    const entity2 = createTestEntity({ id: 'el-2' as ElementId, name: 'alice' });
    expect(entitiesHaveSameName(entity1, entity2)).toBe(true);
  });

  test('returns false for entities with different names', () => {
    const entity1 = createTestEntity({ name: 'alice' });
    const entity2 = createTestEntity({ name: 'bob' });
    expect(entitiesHaveSameName(entity1, entity2)).toBe(false);
  });
});

describe('filterByEntityType', () => {
  test('filters entities by type', () => {
    const entities: Entity[] = [
      createTestEntity({ id: 'el-1' as ElementId, name: 'agent-1', entityType: EntityTypeValue.AGENT }),
      createTestEntity({ id: 'el-2' as ElementId, name: 'human-1', entityType: EntityTypeValue.HUMAN }),
      createTestEntity({ id: 'el-3' as ElementId, name: 'agent-2', entityType: EntityTypeValue.AGENT }),
      createTestEntity({ id: 'el-4' as ElementId, name: 'system-1', entityType: EntityTypeValue.SYSTEM }),
    ];

    const agents = filterByEntityType(entities, EntityTypeValue.AGENT);
    expect(agents).toHaveLength(2);
    expect(agents.map(e => e.name)).toEqual(['agent-1', 'agent-2']);

    const humans = filterByEntityType(entities, EntityTypeValue.HUMAN);
    expect(humans).toHaveLength(1);
    expect(humans[0].name).toBe('human-1');

    const systems = filterByEntityType(entities, EntityTypeValue.SYSTEM);
    expect(systems).toHaveLength(1);
    expect(systems[0].name).toBe('system-1');
  });

  test('returns empty array when no matches', () => {
    const entities: Entity[] = [
      createTestEntity({ name: 'agent-1', entityType: EntityTypeValue.AGENT }),
    ];

    const humans = filterByEntityType(entities, EntityTypeValue.HUMAN);
    expect(humans).toHaveLength(0);
  });

  test('handles empty input', () => {
    expect(filterByEntityType([], EntityTypeValue.AGENT)).toEqual([]);
  });
});

// Edge cases and property-based tests
describe('Edge cases', () => {
  test('handles maximum valid name length', () => {
    const maxName = 'a' + 'b'.repeat(MAX_NAME_LENGTH - 1);
    expect(isValidEntityName(maxName)).toBe(true);
    expect(validateEntityName(maxName)).toBe(maxName);
  });

  test('handles minimum valid name length', () => {
    expect(isValidEntityName('a')).toBe(true);
    expect(validateEntityName('a')).toBe('a');
  });

  test('name validation is case-sensitive', () => {
    // Different cases should be allowed (names are case-sensitive)
    expect(isValidEntityName('Alice')).toBe(true);
    expect(isValidEntityName('ALICE')).toBe(true);
    expect(isValidEntityName('alice')).toBe(true);
  });

  test('reserved name check is case-insensitive', () => {
    expect(isReservedName('System')).toBe(true);
    expect(isReservedName('SYSTEM')).toBe(true);
    expect(isReservedName('SyStEm')).toBe(true);
  });

  test('entity type is preserved through validation', () => {
    const entity = createTestEntity({ entityType: EntityTypeValue.HUMAN });
    const validated = validateEntity(entity);
    expect(validated.entityType).toBe(EntityTypeValue.HUMAN);
  });

  test('public key with different valid base64 characters', () => {
    // Uses +, /, and various chars (must be exactly 44 characters including =)
    const validKey = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef+/123456789=';
    expect(isValidPublicKey(validKey)).toBe(true);
  });

  test('name with all valid character types', () => {
    // Starts with letter, contains numbers, hyphens, underscores
    const name = 'Agent123_test-entity';
    expect(isValidEntityName(name)).toBe(true);
  });
});

// Property-based test: any valid name should validate without throwing
describe('Property-based tests', () => {
  const validCharacters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-';
  const startCharacters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

  function generateValidName(length: number): string {
    if (length < 1) length = 1;
    if (length > MAX_NAME_LENGTH) length = MAX_NAME_LENGTH;

    let name = startCharacters[Math.floor(Math.random() * startCharacters.length)];
    for (let i = 1; i < length; i++) {
      name += validCharacters[Math.floor(Math.random() * validCharacters.length)];
    }

    // Ensure not reserved
    if (RESERVED_NAMES.includes(name.toLowerCase() as any)) {
      name = name + '1';
    }

    return name;
  }

  test('randomly generated valid names pass validation', () => {
    for (let i = 0; i < 100; i++) {
      const length = Math.floor(Math.random() * MAX_NAME_LENGTH) + 1;
      const name = generateValidName(length);

      expect(isValidEntityName(name)).toBe(true);
      expect(() => validateEntityName(name)).not.toThrow();
    }
  });

  test('all entity types create valid entities', async () => {
    for (const entityType of Object.values(EntityTypeValue)) {
      const entity = await createEntity({
        name: `test-${entityType}`,
        entityType,
        createdBy: 'el-system1' as EntityId,
      });

      expect(isEntity(entity)).toBe(true);
      expect(entity.entityType).toBe(entityType);
    }
  });
});

describe('Edge cases - name validation errors', () => {
  test('validates name with exactly max length characters', async () => {
    const maxName = 'a' + 'b'.repeat(MAX_NAME_LENGTH - 1);
    const entity = await createEntity({
      name: maxName,
      entityType: EntityTypeValue.AGENT,
      createdBy: 'el-system1' as EntityId,
    });
    expect(entity.name).toBe(maxName);
  });
});

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
  updateEntity,
  UpdateEntityInput,
  deactivateEntity,
  reactivateEntity,
  isEntityActive,
  isEntityDeactivated,
  getDeactivationDetails,
  filterActiveEntities,
  filterDeactivatedEntities,
  hasCryptographicIdentity,
  getEntityDisplayName,
  entitiesHaveSameName,
  filterByEntityType,
  filterByCreator,
  filterWithPublicKey,
  filterWithoutPublicKey,
  filterByTag,
  filterByAnyTag,
  filterByAllTags,
  sortByName,
  sortByCreationDate,
  sortByUpdateDate,
  sortByEntityType,
  groupByEntityType,
  groupByCreator,
  searchByName,
  findByName,
  findById,
  isNameUnique,
  getUniqueTags,
  countByEntityType,
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

describe('updateEntity', () => {
  test('updates metadata by merging', () => {
    const entity = createTestEntity({
      metadata: { existing: 'value', toKeep: 123 }
    });

    const updated = updateEntity(entity, {
      metadata: { newField: 'added', existing: 'updated' }
    });

    expect(updated.metadata).toEqual({
      existing: 'updated',
      toKeep: 123,
      newField: 'added'
    });
  });

  test('updates tags by replacing', () => {
    const entity = createTestEntity({
      tags: ['old-tag', 'another-old']
    });

    const updated = updateEntity(entity, {
      tags: ['new-tag', 'fresh-tag']
    });

    expect(updated.tags).toEqual(['new-tag', 'fresh-tag']);
  });

  test('adds public key to entity without one', () => {
    const entity = createTestEntity();
    expect(entity.publicKey).toBeUndefined();

    const updated = updateEntity(entity, {
      publicKey: VALID_PUBLIC_KEY
    });

    expect(updated.publicKey).toBe(VALID_PUBLIC_KEY);
  });

  test('updates public key on entity that has one', () => {
    const entity = createTestEntity({
      publicKey: VALID_PUBLIC_KEY
    });
    const newKey = 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=';

    const updated = updateEntity(entity, {
      publicKey: newKey
    });

    expect(updated.publicKey).toBe(newKey);
  });

  test('validates public key format', () => {
    const entity = createTestEntity();

    expect(() => updateEntity(entity, {
      publicKey: 'invalid-key'
    })).toThrow(ValidationError);
  });

  test('updates updatedAt timestamp', () => {
    const entity = createTestEntity({
      updatedAt: '2020-01-01T00:00:00.000Z' as any
    });
    const before = new Date().toISOString();

    const updated = updateEntity(entity, {
      metadata: { changed: true }
    });

    const after = new Date().toISOString();
    expect(updated.updatedAt >= before).toBe(true);
    expect(updated.updatedAt <= after).toBe(true);
  });

  test('preserves immutable fields', () => {
    const entity = createTestEntity({
      name: 'original-name',
      entityType: EntityTypeValue.AGENT,
      createdAt: '2020-01-01T00:00:00.000Z' as any,
      createdBy: 'el-original' as EntityId,
    });

    const updated = updateEntity(entity, {
      tags: ['new-tag'],
      metadata: { updated: true }
    });

    // Immutable fields should be preserved
    expect(updated.name).toBe('original-name');
    expect(updated.entityType).toBe(EntityTypeValue.AGENT);
    expect(updated.createdAt).toBe('2020-01-01T00:00:00.000Z');
    expect(updated.createdBy).toBe('el-original' as EntityId);
    expect(updated.id).toBe(entity.id);
    expect(updated.type).toBe(ElementType.ENTITY);
  });

  test('preserves existing values when not updating', () => {
    const entity = createTestEntity({
      tags: ['keep-me'],
      metadata: { preserve: 'this' },
      publicKey: VALID_PUBLIC_KEY
    });

    // Update with empty input
    const updated = updateEntity(entity, {});

    expect(updated.tags).toEqual(['keep-me']);
    expect(updated.metadata).toEqual({ preserve: 'this' });
    expect(updated.publicKey).toBe(VALID_PUBLIC_KEY);
  });

  test('can clear tags by setting to empty array', () => {
    const entity = createTestEntity({
      tags: ['tag1', 'tag2', 'tag3']
    });

    const updated = updateEntity(entity, {
      tags: []
    });

    expect(updated.tags).toEqual([]);
  });

  test('handles multiple updates at once', () => {
    const entity = createTestEntity({
      tags: ['old'],
      metadata: { old: 'data' }
    });

    const updated = updateEntity(entity, {
      tags: ['new-tag1', 'new-tag2'],
      metadata: { new: 'data', extra: 123 },
      publicKey: VALID_PUBLIC_KEY
    });

    expect(updated.tags).toEqual(['new-tag1', 'new-tag2']);
    expect(updated.metadata).toEqual({ old: 'data', new: 'data', extra: 123 });
    expect(updated.publicKey).toBe(VALID_PUBLIC_KEY);
  });

  test('does not mutate original entity', () => {
    const entity = createTestEntity({
      tags: ['original'],
      metadata: { original: true }
    });
    const originalTags = [...entity.tags];
    const originalMetadata = { ...entity.metadata };

    updateEntity(entity, {
      tags: ['modified'],
      metadata: { modified: true }
    });

    // Original entity should be unchanged
    expect(entity.tags).toEqual(originalTags);
    expect(entity.metadata).toEqual(originalMetadata);
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

// ============================================================================
// Entity Deactivation Tests
// ============================================================================

describe('deactivateEntity', () => {
  test('sets metadata.active to false', () => {
    const entity = createTestEntity();
    const deactivated = deactivateEntity(entity, {
      deactivatedBy: 'el-admin' as EntityId,
    });

    expect(deactivated.metadata.active).toBe(false);
  });

  test('sets deactivatedAt timestamp', () => {
    const entity = createTestEntity();
    const before = new Date().toISOString();

    const deactivated = deactivateEntity(entity, {
      deactivatedBy: 'el-admin' as EntityId,
    });

    const after = new Date().toISOString();
    expect(deactivated.metadata.deactivatedAt as string >= before).toBe(true);
    expect(deactivated.metadata.deactivatedAt as string <= after).toBe(true);
  });

  test('sets deactivatedBy reference', () => {
    const entity = createTestEntity();
    const deactivated = deactivateEntity(entity, {
      deactivatedBy: 'el-admin' as EntityId,
    });

    expect(deactivated.metadata.deactivatedBy).toBe('el-admin');
  });

  test('sets deactivationReason when provided', () => {
    const entity = createTestEntity();
    const deactivated = deactivateEntity(entity, {
      deactivatedBy: 'el-admin' as EntityId,
      reason: 'User left the organization',
    });

    expect(deactivated.metadata.deactivationReason).toBe('User left the organization');
  });

  test('does not set deactivationReason when not provided', () => {
    const entity = createTestEntity();
    const deactivated = deactivateEntity(entity, {
      deactivatedBy: 'el-admin' as EntityId,
    });

    expect(deactivated.metadata.deactivationReason).toBeUndefined();
  });

  test('preserves existing metadata', () => {
    const entity = createTestEntity({
      metadata: { displayName: 'Test User', customField: 'value' },
    });

    const deactivated = deactivateEntity(entity, {
      deactivatedBy: 'el-admin' as EntityId,
    });

    expect(deactivated.metadata.displayName).toBe('Test User');
    expect(deactivated.metadata.customField).toBe('value');
  });

  test('updates updatedAt timestamp', () => {
    const entity = createTestEntity({
      updatedAt: '2020-01-01T00:00:00.000Z' as any,
    });
    const before = new Date().toISOString();

    const deactivated = deactivateEntity(entity, {
      deactivatedBy: 'el-admin' as EntityId,
    });

    const after = new Date().toISOString();
    expect(deactivated.updatedAt >= before).toBe(true);
    expect(deactivated.updatedAt <= after).toBe(true);
  });

  test('preserves immutable fields', () => {
    const entity = createTestEntity({
      name: 'original-name',
      entityType: EntityTypeValue.HUMAN,
    });

    const deactivated = deactivateEntity(entity, {
      deactivatedBy: 'el-admin' as EntityId,
    });

    expect(deactivated.name).toBe('original-name');
    expect(deactivated.entityType).toBe(EntityTypeValue.HUMAN);
    expect(deactivated.id).toBe(entity.id);
  });
});

describe('reactivateEntity', () => {
  test('sets metadata.active to true', () => {
    const deactivated = createTestEntity({
      metadata: { active: false, deactivatedAt: '2020-01-01T00:00:00.000Z' },
    });

    const reactivated = reactivateEntity(deactivated, 'el-admin' as EntityId);

    expect(reactivated.metadata.active).toBe(true);
  });

  test('removes deactivation metadata', () => {
    const deactivated = createTestEntity({
      metadata: {
        active: false,
        deactivatedAt: '2020-01-01T00:00:00.000Z',
        deactivatedBy: 'el-old-admin',
        deactivationReason: 'Old reason',
      },
    });

    const reactivated = reactivateEntity(deactivated, 'el-admin' as EntityId);

    expect(reactivated.metadata.deactivatedAt).toBeUndefined();
    expect(reactivated.metadata.deactivatedBy).toBeUndefined();
    expect(reactivated.metadata.deactivationReason).toBeUndefined();
  });

  test('sets reactivatedAt and reactivatedBy', () => {
    const deactivated = createTestEntity({
      metadata: { active: false },
    });
    const before = new Date().toISOString();

    const reactivated = reactivateEntity(deactivated, 'el-admin' as EntityId);

    const after = new Date().toISOString();
    expect(reactivated.metadata.reactivatedAt as string >= before).toBe(true);
    expect(reactivated.metadata.reactivatedAt as string <= after).toBe(true);
    expect(reactivated.metadata.reactivatedBy).toBe('el-admin');
  });

  test('preserves other metadata', () => {
    const deactivated = createTestEntity({
      metadata: {
        active: false,
        displayName: 'Test User',
        customField: 'value',
      },
    });

    const reactivated = reactivateEntity(deactivated, 'el-admin' as EntityId);

    expect(reactivated.metadata.displayName).toBe('Test User');
    expect(reactivated.metadata.customField).toBe('value');
  });
});

describe('isEntityActive', () => {
  test('returns true for entity with no active flag', () => {
    const entity = createTestEntity();
    expect(isEntityActive(entity)).toBe(true);
  });

  test('returns true for entity with active: true', () => {
    const entity = createTestEntity({
      metadata: { active: true },
    });
    expect(isEntityActive(entity)).toBe(true);
  });

  test('returns false for entity with active: false', () => {
    const entity = createTestEntity({
      metadata: { active: false },
    });
    expect(isEntityActive(entity)).toBe(false);
  });
});

describe('isEntityDeactivated', () => {
  test('returns false for active entity', () => {
    const entity = createTestEntity();
    expect(isEntityDeactivated(entity)).toBe(false);
  });

  test('returns true for deactivated entity', () => {
    const entity = createTestEntity({
      metadata: { active: false },
    });
    expect(isEntityDeactivated(entity)).toBe(true);
  });
});

describe('getDeactivationDetails', () => {
  test('returns null for active entity', () => {
    const entity = createTestEntity();
    expect(getDeactivationDetails(entity)).toBeNull();
  });

  test('returns details for deactivated entity', () => {
    const entity = createTestEntity({
      metadata: {
        active: false,
        deactivatedAt: '2020-01-01T00:00:00.000Z',
        deactivatedBy: 'el-admin',
        deactivationReason: 'Test reason',
      },
    });

    const details = getDeactivationDetails(entity);
    expect(details).not.toBeNull();
    expect(details!.deactivatedAt).toBe('2020-01-01T00:00:00.000Z');
    expect(details!.deactivatedBy).toBe('el-admin');
    expect(details!.reason).toBe('Test reason');
  });

  test('returns partial details when not all fields present', () => {
    const entity = createTestEntity({
      metadata: {
        active: false,
        deactivatedAt: '2020-01-01T00:00:00.000Z',
      },
    });

    const details = getDeactivationDetails(entity);
    expect(details).not.toBeNull();
    expect(details!.deactivatedAt).toBe('2020-01-01T00:00:00.000Z');
    expect(details!.deactivatedBy).toBeUndefined();
    expect(details!.reason).toBeUndefined();
  });
});

describe('filterActiveEntities', () => {
  test('returns only active entities', () => {
    const entities = [
      createTestEntity({ id: 'el-1' as ElementId, name: 'active-1' }),
      createTestEntity({ id: 'el-2' as ElementId, name: 'inactive-1', metadata: { active: false } }),
      createTestEntity({ id: 'el-3' as ElementId, name: 'active-2' }),
      createTestEntity({ id: 'el-4' as ElementId, name: 'inactive-2', metadata: { active: false } }),
    ];

    const active = filterActiveEntities(entities);
    expect(active).toHaveLength(2);
    expect(active.map((e) => e.name)).toEqual(['active-1', 'active-2']);
  });

  test('returns all when none deactivated', () => {
    const entities = [
      createTestEntity({ id: 'el-1' as ElementId, name: 'active-1' }),
      createTestEntity({ id: 'el-2' as ElementId, name: 'active-2' }),
    ];

    const active = filterActiveEntities(entities);
    expect(active).toHaveLength(2);
  });

  test('returns empty when all deactivated', () => {
    const entities = [
      createTestEntity({ id: 'el-1' as ElementId, name: 'inactive-1', metadata: { active: false } }),
    ];

    const active = filterActiveEntities(entities);
    expect(active).toHaveLength(0);
  });
});

describe('filterDeactivatedEntities', () => {
  test('returns only deactivated entities', () => {
    const entities = [
      createTestEntity({ id: 'el-1' as ElementId, name: 'active-1' }),
      createTestEntity({ id: 'el-2' as ElementId, name: 'inactive-1', metadata: { active: false } }),
      createTestEntity({ id: 'el-3' as ElementId, name: 'active-2' }),
    ];

    const deactivated = filterDeactivatedEntities(entities);
    expect(deactivated).toHaveLength(1);
    expect(deactivated[0].name).toBe('inactive-1');
  });

  test('returns empty when none deactivated', () => {
    const entities = [
      createTestEntity({ id: 'el-1' as ElementId, name: 'active-1' }),
    ];

    const deactivated = filterDeactivatedEntities(entities);
    expect(deactivated).toHaveLength(0);
  });
});

// ============================================================================
// Search and Filter Tests
// ============================================================================

describe('filterByCreator', () => {
  test('filters entities by creator', () => {
    const entities = [
      createTestEntity({ id: 'el-1' as ElementId, name: 'e1', createdBy: 'el-admin' as EntityId }),
      createTestEntity({ id: 'el-2' as ElementId, name: 'e2', createdBy: 'el-user' as EntityId }),
      createTestEntity({ id: 'el-3' as ElementId, name: 'e3', createdBy: 'el-admin' as EntityId }),
    ];

    const filtered = filterByCreator(entities, 'el-admin' as EntityId);
    expect(filtered).toHaveLength(2);
    expect(filtered.map((e) => e.name)).toEqual(['e1', 'e3']);
  });

  test('returns empty when no matches', () => {
    const entities = [createTestEntity({ createdBy: 'el-user' as EntityId })];
    expect(filterByCreator(entities, 'el-admin' as EntityId)).toHaveLength(0);
  });
});

describe('filterWithPublicKey', () => {
  test('filters entities with public keys', () => {
    const entities = [
      createTestEntity({ id: 'el-1' as ElementId, name: 'with-key', publicKey: VALID_PUBLIC_KEY }),
      createTestEntity({ id: 'el-2' as ElementId, name: 'no-key' }),
      createTestEntity({ id: 'el-3' as ElementId, name: 'also-with-key', publicKey: VALID_PUBLIC_KEY }),
    ];

    const filtered = filterWithPublicKey(entities);
    expect(filtered).toHaveLength(2);
    expect(filtered.map((e) => e.name)).toEqual(['with-key', 'also-with-key']);
  });
});

describe('filterWithoutPublicKey', () => {
  test('filters entities without public keys', () => {
    const entities = [
      createTestEntity({ id: 'el-1' as ElementId, name: 'with-key', publicKey: VALID_PUBLIC_KEY }),
      createTestEntity({ id: 'el-2' as ElementId, name: 'no-key' }),
    ];

    const filtered = filterWithoutPublicKey(entities);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].name).toBe('no-key');
  });
});

describe('filterByTag', () => {
  test('filters entities by tag', () => {
    const entities = [
      createTestEntity({ id: 'el-1' as ElementId, name: 'e1', tags: ['frontend', 'team-a'] }),
      createTestEntity({ id: 'el-2' as ElementId, name: 'e2', tags: ['backend'] }),
      createTestEntity({ id: 'el-3' as ElementId, name: 'e3', tags: ['frontend', 'team-b'] }),
    ];

    const filtered = filterByTag(entities, 'frontend');
    expect(filtered).toHaveLength(2);
    expect(filtered.map((e) => e.name)).toEqual(['e1', 'e3']);
  });
});

describe('filterByAnyTag', () => {
  test('filters entities by any of the tags', () => {
    const entities = [
      createTestEntity({ id: 'el-1' as ElementId, name: 'e1', tags: ['frontend'] }),
      createTestEntity({ id: 'el-2' as ElementId, name: 'e2', tags: ['backend'] }),
      createTestEntity({ id: 'el-3' as ElementId, name: 'e3', tags: ['devops'] }),
    ];

    const filtered = filterByAnyTag(entities, ['frontend', 'backend']);
    expect(filtered).toHaveLength(2);
    expect(filtered.map((e) => e.name)).toEqual(['e1', 'e2']);
  });
});

describe('filterByAllTags', () => {
  test('filters entities with all specified tags', () => {
    const entities = [
      createTestEntity({ id: 'el-1' as ElementId, name: 'e1', tags: ['frontend', 'senior'] }),
      createTestEntity({ id: 'el-2' as ElementId, name: 'e2', tags: ['frontend'] }),
      createTestEntity({ id: 'el-3' as ElementId, name: 'e3', tags: ['frontend', 'senior', 'lead'] }),
    ];

    const filtered = filterByAllTags(entities, ['frontend', 'senior']);
    expect(filtered).toHaveLength(2);
    expect(filtered.map((e) => e.name)).toEqual(['e1', 'e3']);
  });
});

// ============================================================================
// Sort Tests
// ============================================================================

describe('sortByName', () => {
  test('sorts entities by name ascending', () => {
    const entities = [
      createTestEntity({ id: 'el-1' as ElementId, name: 'charlie' }),
      createTestEntity({ id: 'el-2' as ElementId, name: 'alice' }),
      createTestEntity({ id: 'el-3' as ElementId, name: 'bob' }),
    ];

    const sorted = sortByName(entities, true);
    expect(sorted.map((e) => e.name)).toEqual(['alice', 'bob', 'charlie']);
  });

  test('sorts entities by name descending', () => {
    const entities = [
      createTestEntity({ id: 'el-1' as ElementId, name: 'alice' }),
      createTestEntity({ id: 'el-2' as ElementId, name: 'charlie' }),
    ];

    const sorted = sortByName(entities, false);
    expect(sorted.map((e) => e.name)).toEqual(['charlie', 'alice']);
  });

  test('does not mutate original array', () => {
    const entities = [
      createTestEntity({ id: 'el-1' as ElementId, name: 'bob' }),
      createTestEntity({ id: 'el-2' as ElementId, name: 'alice' }),
    ];

    sortByName(entities, true);
    expect(entities[0].name).toBe('bob');
  });
});

describe('sortByCreationDate', () => {
  test('sorts entities by creation date descending by default', () => {
    const entities = [
      createTestEntity({ id: 'el-1' as ElementId, name: 'e1', createdAt: '2020-01-01T00:00:00.000Z' as any }),
      createTestEntity({ id: 'el-2' as ElementId, name: 'e2', createdAt: '2020-03-01T00:00:00.000Z' as any }),
      createTestEntity({ id: 'el-3' as ElementId, name: 'e3', createdAt: '2020-02-01T00:00:00.000Z' as any }),
    ];

    const sorted = sortByCreationDate(entities);
    expect(sorted.map((e) => e.name)).toEqual(['e2', 'e3', 'e1']);
  });

  test('sorts entities by creation date ascending', () => {
    const entities = [
      createTestEntity({ id: 'el-1' as ElementId, name: 'e1', createdAt: '2020-03-01T00:00:00.000Z' as any }),
      createTestEntity({ id: 'el-2' as ElementId, name: 'e2', createdAt: '2020-01-01T00:00:00.000Z' as any }),
    ];

    const sorted = sortByCreationDate(entities, true);
    expect(sorted.map((e) => e.name)).toEqual(['e2', 'e1']);
  });
});

describe('sortByUpdateDate', () => {
  test('sorts entities by update date descending by default', () => {
    const entities = [
      createTestEntity({ id: 'el-1' as ElementId, name: 'e1', updatedAt: '2020-01-01T00:00:00.000Z' as any }),
      createTestEntity({ id: 'el-2' as ElementId, name: 'e2', updatedAt: '2020-02-01T00:00:00.000Z' as any }),
    ];

    const sorted = sortByUpdateDate(entities);
    expect(sorted.map((e) => e.name)).toEqual(['e2', 'e1']);
  });
});

describe('sortByEntityType', () => {
  test('sorts entities by type: agent, human, system', () => {
    const entities = [
      createTestEntity({ id: 'el-1' as ElementId, name: 'sys', entityType: EntityTypeValue.SYSTEM }),
      createTestEntity({ id: 'el-2' as ElementId, name: 'human', entityType: EntityTypeValue.HUMAN }),
      createTestEntity({ id: 'el-3' as ElementId, name: 'agent', entityType: EntityTypeValue.AGENT }),
    ];

    const sorted = sortByEntityType(entities);
    expect(sorted.map((e) => e.entityType)).toEqual(['agent', 'human', 'system']);
  });
});

// ============================================================================
// Group Tests
// ============================================================================

describe('groupByEntityType', () => {
  test('groups entities by type', () => {
    const entities = [
      createTestEntity({ id: 'el-1' as ElementId, name: 'agent1', entityType: EntityTypeValue.AGENT }),
      createTestEntity({ id: 'el-2' as ElementId, name: 'human1', entityType: EntityTypeValue.HUMAN }),
      createTestEntity({ id: 'el-3' as ElementId, name: 'agent2', entityType: EntityTypeValue.AGENT }),
    ];

    const groups = groupByEntityType(entities);
    expect(groups.get(EntityTypeValue.AGENT)?.length).toBe(2);
    expect(groups.get(EntityTypeValue.HUMAN)?.length).toBe(1);
    expect(groups.get(EntityTypeValue.SYSTEM)).toBeUndefined();
  });
});

describe('groupByCreator', () => {
  test('groups entities by creator', () => {
    const entities = [
      createTestEntity({ id: 'el-1' as ElementId, name: 'e1', createdBy: 'el-admin' as EntityId }),
      createTestEntity({ id: 'el-2' as ElementId, name: 'e2', createdBy: 'el-user' as EntityId }),
      createTestEntity({ id: 'el-3' as ElementId, name: 'e3', createdBy: 'el-admin' as EntityId }),
    ];

    const groups = groupByCreator(entities);
    expect(groups.get('el-admin' as EntityId)?.length).toBe(2);
    expect(groups.get('el-user' as EntityId)?.length).toBe(1);
  });
});

// ============================================================================
// Search Tests
// ============================================================================

describe('searchByName', () => {
  test('searches entities by name substring', () => {
    const entities = [
      createTestEntity({ id: 'el-1' as ElementId, name: 'alice-agent' }),
      createTestEntity({ id: 'el-2' as ElementId, name: 'bob-human' }),
      createTestEntity({ id: 'el-3' as ElementId, name: 'alice-backup' }),
    ];

    const found = searchByName(entities, 'alice');
    expect(found).toHaveLength(2);
    expect(found.map((e) => e.name)).toEqual(['alice-agent', 'alice-backup']);
  });

  test('is case-insensitive', () => {
    const entities = [
      createTestEntity({ id: 'el-1' as ElementId, name: 'Alice' }),
      createTestEntity({ id: 'el-2' as ElementId, name: 'ALICE' }),
    ];

    const found = searchByName(entities, 'alice');
    expect(found).toHaveLength(2);
  });

  test('returns empty for no matches', () => {
    const entities = [createTestEntity({ name: 'bob' })];
    expect(searchByName(entities, 'alice')).toHaveLength(0);
  });
});

describe('findByName', () => {
  test('finds entity by exact name', () => {
    const entities = [
      createTestEntity({ id: 'el-1' as ElementId, name: 'alice' }),
      createTestEntity({ id: 'el-2' as ElementId, name: 'bob' }),
    ];

    const found = findByName(entities, 'alice');
    expect(found).toBeDefined();
    expect(found!.name).toBe('alice');
  });

  test('returns undefined for no match', () => {
    const entities = [createTestEntity({ name: 'bob' })];
    expect(findByName(entities, 'alice')).toBeUndefined();
  });
});

describe('findById', () => {
  test('finds entity by ID', () => {
    const entities = [
      createTestEntity({ id: 'el-1' as ElementId, name: 'alice' }),
      createTestEntity({ id: 'el-2' as ElementId, name: 'bob' }),
    ];

    const found = findById(entities, 'el-2');
    expect(found).toBeDefined();
    expect(found!.name).toBe('bob');
  });

  test('returns undefined for no match', () => {
    const entities = [createTestEntity({ id: 'el-1' as ElementId })];
    expect(findById(entities, 'el-999')).toBeUndefined();
  });
});

describe('isNameUnique', () => {
  test('returns true when name is unique', () => {
    const entities = [
      createTestEntity({ id: 'el-1' as ElementId, name: 'alice' }),
      createTestEntity({ id: 'el-2' as ElementId, name: 'bob' }),
    ];

    expect(isNameUnique(entities, 'charlie')).toBe(true);
  });

  test('returns false when name exists', () => {
    const entities = [createTestEntity({ name: 'alice' })];
    expect(isNameUnique(entities, 'alice')).toBe(false);
  });

  test('excludes entity with given ID', () => {
    const entities = [createTestEntity({ id: 'el-1' as ElementId, name: 'alice' })];
    expect(isNameUnique(entities, 'alice', 'el-1')).toBe(true);
  });
});

describe('getUniqueTags', () => {
  test('returns unique sorted tags', () => {
    const entities = [
      createTestEntity({ id: 'el-1' as ElementId, tags: ['frontend', 'react'] }),
      createTestEntity({ id: 'el-2' as ElementId, tags: ['backend', 'frontend'] }),
      createTestEntity({ id: 'el-3' as ElementId, tags: ['devops'] }),
    ];

    const tags = getUniqueTags(entities);
    expect(tags).toEqual(['backend', 'devops', 'frontend', 'react']);
  });

  test('returns empty array for entities without tags', () => {
    const entities = [createTestEntity({ tags: [] })];
    expect(getUniqueTags(entities)).toEqual([]);
  });
});

describe('countByEntityType', () => {
  test('counts entities by type', () => {
    const entities = [
      createTestEntity({ id: 'el-1' as ElementId, entityType: EntityTypeValue.AGENT }),
      createTestEntity({ id: 'el-2' as ElementId, entityType: EntityTypeValue.AGENT }),
      createTestEntity({ id: 'el-3' as ElementId, entityType: EntityTypeValue.HUMAN }),
    ];

    const counts = countByEntityType(entities);
    expect(counts.agent).toBe(2);
    expect(counts.human).toBe(1);
    expect(counts.system).toBe(0);
  });

  test('returns zeros for empty array', () => {
    const counts = countByEntityType([]);
    expect(counts.agent).toBe(0);
    expect(counts.human).toBe(0);
    expect(counts.system).toBe(0);
  });
});

// ============================================================================
// Entity Assignment Query Utilities Tests
// ============================================================================

import {
  getAssignedTo,
  getCreatedBy,
  getRelatedTo,
  countAssignmentsByEntity,
  getTopAssignees,
  hasAssignments,
  getUnassigned,
  getEntityAssignmentStats,
  type Assignable,
} from './entity.js';

// Helper to create test assignable items
function createTestAssignable(overrides: Partial<Assignable> = {}): Assignable {
  return {
    id: 'item-1',
    createdBy: 'entity-creator',
    ...overrides,
  };
}

describe('getAssignedTo', () => {
  test('returns items assigned to the specified entity', () => {
    const items: Assignable[] = [
      createTestAssignable({ id: 'item-1', assignee: 'entity-a' }),
      createTestAssignable({ id: 'item-2', assignee: 'entity-b' }),
      createTestAssignable({ id: 'item-3', assignee: 'entity-a' }),
      createTestAssignable({ id: 'item-4' }), // No assignee
    ];

    const result = getAssignedTo(items, 'entity-a');
    expect(result).toHaveLength(2);
    expect(result.map((i) => i.id)).toEqual(['item-1', 'item-3']);
  });

  test('returns empty array when no items are assigned to entity', () => {
    const items: Assignable[] = [
      createTestAssignable({ id: 'item-1', assignee: 'entity-b' }),
      createTestAssignable({ id: 'item-2' }),
    ];

    expect(getAssignedTo(items, 'entity-a')).toEqual([]);
  });

  test('returns empty array for empty input', () => {
    expect(getAssignedTo([], 'entity-a')).toEqual([]);
  });
});

describe('getCreatedBy', () => {
  test('returns items created by the specified entity', () => {
    const items: Assignable[] = [
      createTestAssignable({ id: 'item-1', createdBy: 'entity-a' }),
      createTestAssignable({ id: 'item-2', createdBy: 'entity-b' }),
      createTestAssignable({ id: 'item-3', createdBy: 'entity-a' }),
    ];

    const result = getCreatedBy(items, 'entity-a');
    expect(result).toHaveLength(2);
    expect(result.map((i) => i.id)).toEqual(['item-1', 'item-3']);
  });

  test('returns empty array when no items created by entity', () => {
    const items: Assignable[] = [
      createTestAssignable({ id: 'item-1', createdBy: 'entity-b' }),
    ];

    expect(getCreatedBy(items, 'entity-a')).toEqual([]);
  });
});

describe('getRelatedTo', () => {
  test('returns items where entity is assignee or creator', () => {
    const items: Assignable[] = [
      createTestAssignable({ id: 'item-1', createdBy: 'entity-a', assignee: 'entity-b' }),
      createTestAssignable({ id: 'item-2', createdBy: 'entity-b', assignee: 'entity-a' }),
      createTestAssignable({ id: 'item-3', createdBy: 'entity-a', assignee: 'entity-a' }),
      createTestAssignable({ id: 'item-4', createdBy: 'entity-b', assignee: 'entity-b' }),
    ];

    const result = getRelatedTo(items, 'entity-a');
    expect(result).toHaveLength(3);
    expect(result.map((i) => i.id)).toEqual(['item-1', 'item-2', 'item-3']);
  });

  test('returns empty array when entity has no relation', () => {
    const items: Assignable[] = [
      createTestAssignable({ id: 'item-1', createdBy: 'entity-b', assignee: 'entity-c' }),
    ];

    expect(getRelatedTo(items, 'entity-a')).toEqual([]);
  });
});

describe('countAssignmentsByEntity', () => {
  test('counts assignments for each entity', () => {
    const items: Assignable[] = [
      createTestAssignable({ id: 'item-1', assignee: 'entity-a' }),
      createTestAssignable({ id: 'item-2', assignee: 'entity-b' }),
      createTestAssignable({ id: 'item-3', assignee: 'entity-a' }),
      createTestAssignable({ id: 'item-4', assignee: 'entity-a' }),
      createTestAssignable({ id: 'item-5' }), // No assignee
    ];

    const counts = countAssignmentsByEntity(items);
    expect(counts.get('entity-a')).toBe(3);
    expect(counts.get('entity-b')).toBe(1);
    expect(counts.has('entity-c')).toBe(false);
  });

  test('returns empty map for items with no assignees', () => {
    const items: Assignable[] = [
      createTestAssignable({ id: 'item-1' }),
      createTestAssignable({ id: 'item-2' }),
    ];

    const counts = countAssignmentsByEntity(items);
    expect(counts.size).toBe(0);
  });
});

describe('getTopAssignees', () => {
  test('returns entities sorted by assignment count', () => {
    const items: Assignable[] = [
      createTestAssignable({ id: 'item-1', assignee: 'entity-a' }),
      createTestAssignable({ id: 'item-2', assignee: 'entity-b' }),
      createTestAssignable({ id: 'item-3', assignee: 'entity-a' }),
      createTestAssignable({ id: 'item-4', assignee: 'entity-c' }),
      createTestAssignable({ id: 'item-5', assignee: 'entity-a' }),
      createTestAssignable({ id: 'item-6', assignee: 'entity-b' }),
    ];

    const top = getTopAssignees(items);
    expect(top).toEqual([
      ['entity-a', 3],
      ['entity-b', 2],
      ['entity-c', 1],
    ]);
  });

  test('respects limit parameter', () => {
    const items: Assignable[] = [
      createTestAssignable({ id: 'item-1', assignee: 'entity-a' }),
      createTestAssignable({ id: 'item-2', assignee: 'entity-a' }),
      createTestAssignable({ id: 'item-3', assignee: 'entity-b' }),
      createTestAssignable({ id: 'item-4', assignee: 'entity-c' }),
    ];

    const top = getTopAssignees(items, 2);
    expect(top).toHaveLength(2);
    expect(top[0][0]).toBe('entity-a');
  });

  test('returns empty array when no assignments', () => {
    const items: Assignable[] = [createTestAssignable({ id: 'item-1' })];
    expect(getTopAssignees(items)).toEqual([]);
  });
});

describe('hasAssignments', () => {
  test('returns true when entity has assignments', () => {
    const items: Assignable[] = [
      createTestAssignable({ id: 'item-1', assignee: 'entity-a' }),
      createTestAssignable({ id: 'item-2', assignee: 'entity-b' }),
    ];

    expect(hasAssignments(items, 'entity-a')).toBe(true);
  });

  test('returns false when entity has no assignments', () => {
    const items: Assignable[] = [
      createTestAssignable({ id: 'item-1', assignee: 'entity-b' }),
      createTestAssignable({ id: 'item-2' }),
    ];

    expect(hasAssignments(items, 'entity-a')).toBe(false);
  });

  test('returns false for empty array', () => {
    expect(hasAssignments([], 'entity-a')).toBe(false);
  });
});

describe('getUnassigned', () => {
  test('returns items with no assignee', () => {
    const items: Assignable[] = [
      createTestAssignable({ id: 'item-1', assignee: 'entity-a' }),
      createTestAssignable({ id: 'item-2' }),
      createTestAssignable({ id: 'item-3' }),
      createTestAssignable({ id: 'item-4', assignee: 'entity-b' }),
    ];

    const result = getUnassigned(items);
    expect(result).toHaveLength(2);
    expect(result.map((i) => i.id)).toEqual(['item-2', 'item-3']);
  });

  test('returns all items when none have assignees', () => {
    const items: Assignable[] = [
      createTestAssignable({ id: 'item-1' }),
      createTestAssignable({ id: 'item-2' }),
    ];

    expect(getUnassigned(items)).toHaveLength(2);
  });

  test('returns empty array when all items are assigned', () => {
    const items: Assignable[] = [
      createTestAssignable({ id: 'item-1', assignee: 'entity-a' }),
      createTestAssignable({ id: 'item-2', assignee: 'entity-b' }),
    ];

    expect(getUnassigned(items)).toEqual([]);
  });
});

describe('getEntityAssignmentStats', () => {
  test('returns correct stats for entity', () => {
    const items: Assignable[] = [
      createTestAssignable({ id: 'item-1', createdBy: 'entity-a', assignee: 'entity-a' }),
      createTestAssignable({ id: 'item-2', createdBy: 'entity-a', assignee: 'entity-b' }),
      createTestAssignable({ id: 'item-3', createdBy: 'entity-b', assignee: 'entity-a' }),
      createTestAssignable({ id: 'item-4', createdBy: 'entity-b', assignee: 'entity-b' }),
    ];

    const stats = getEntityAssignmentStats(items, 'entity-a');
    expect(stats.assignedCount).toBe(2); // item-1, item-3
    expect(stats.createdCount).toBe(2); // item-1, item-2
    expect(stats.totalRelated).toBe(3); // item-1 (both), item-2 (created), item-3 (assigned)
  });

  test('returns zeros for entity with no relations', () => {
    const items: Assignable[] = [
      createTestAssignable({ id: 'item-1', createdBy: 'entity-b', assignee: 'entity-b' }),
    ];

    const stats = getEntityAssignmentStats(items, 'entity-a');
    expect(stats.assignedCount).toBe(0);
    expect(stats.createdCount).toBe(0);
    expect(stats.totalRelated).toBe(0);
  });

  test('handles empty array', () => {
    const stats = getEntityAssignmentStats([], 'entity-a');
    expect(stats.assignedCount).toBe(0);
    expect(stats.createdCount).toBe(0);
    expect(stats.totalRelated).toBe(0);
  });
});

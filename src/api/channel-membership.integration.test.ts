/**
 * Channel Membership Integration Tests
 *
 * Tests for channel membership operations:
 * - findOrCreateDirectChannel
 * - addChannelMember
 * - removeChannelMember
 * - leaveChannel
 * - Group channel name uniqueness
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { ElementalAPIImpl } from './elemental-api.js';
import { createStorage, initializeSchema } from '../storage/index.js';
import type { StorageBackend } from '../storage/backend.js';
import type { Element, ElementId, EntityId } from '../types/element.js';
import type { Channel } from '../types/channel.js';
import {
  createGroupChannel,
  createDirectChannel,
  generateDirectChannelName,
  ChannelTypeValue,
  VisibilityValue,
  JoinPolicyValue,
} from '../types/channel.js';
import { NotFoundError, ConstraintError, ConflictError, ValidationError } from '../errors/error.js';

// ============================================================================
// Test Helpers
// ============================================================================

const mockEntityA = 'el-user1' as EntityId;
const mockEntityB = 'el-user2' as EntityId;
const mockEntityC = 'el-user3' as EntityId;

/**
 * Helper to cast element for api.create()
 */
function toCreateInput<T extends Element>(element: T): Parameters<ElementalAPIImpl['create']>[0] {
  return element as unknown as Parameters<ElementalAPIImpl['create']>[0];
}

/**
 * Create a test group channel
 */
async function createTestGroupChannel(
  overrides: Partial<Parameters<typeof createGroupChannel>[0]> = {}
): Promise<Channel> {
  return createGroupChannel({
    name: 'test-channel',
    createdBy: mockEntityA,
    members: [mockEntityB],
    visibility: VisibilityValue.PRIVATE,
    joinPolicy: JoinPolicyValue.INVITE_ONLY,
    ...overrides,
  });
}

// ============================================================================
// Integration Tests
// ============================================================================

describe('Channel Membership Operations', () => {
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

  // --------------------------------------------------------------------------
  // findOrCreateDirectChannel Tests
  // --------------------------------------------------------------------------

  describe('findOrCreateDirectChannel()', () => {
    it('should create a new direct channel when one does not exist', async () => {
      const result = await api.findOrCreateDirectChannel(mockEntityA, mockEntityB, mockEntityA);

      expect(result.created).toBe(true);
      expect(result.channel).toBeDefined();
      expect(result.channel.channelType).toBe(ChannelTypeValue.DIRECT);
      expect(result.channel.members).toContain(mockEntityA);
      expect(result.channel.members).toContain(mockEntityB);
      expect(result.channel.name).toBe(generateDirectChannelName(mockEntityA, mockEntityB));
    });

    it('should return existing direct channel when one exists', async () => {
      // Create initial channel
      const first = await api.findOrCreateDirectChannel(mockEntityA, mockEntityB, mockEntityA);
      expect(first.created).toBe(true);

      // Second call should find existing
      const second = await api.findOrCreateDirectChannel(mockEntityA, mockEntityB, mockEntityB);
      expect(second.created).toBe(false);
      expect(second.channel.id).toBe(first.channel.id);
    });

    it('should return same channel regardless of entity order', async () => {
      const result1 = await api.findOrCreateDirectChannel(mockEntityA, mockEntityB, mockEntityA);
      const result2 = await api.findOrCreateDirectChannel(mockEntityB, mockEntityA, mockEntityB);

      expect(result2.created).toBe(false);
      expect(result2.channel.id).toBe(result1.channel.id);
    });

    it('should throw ValidationError if actor is not one of the entities', async () => {
      await expect(
        api.findOrCreateDirectChannel(mockEntityA, mockEntityB, mockEntityC)
      ).rejects.toThrow(ValidationError);
    });
  });

  // --------------------------------------------------------------------------
  // addChannelMember Tests
  // --------------------------------------------------------------------------

  describe('addChannelMember()', () => {
    it('should add a new member to a group channel', async () => {
      const channel = await createTestGroupChannel();
      await api.create(toCreateInput(channel));

      const result = await api.addChannelMember(channel.id, mockEntityC, { actor: mockEntityA });

      expect(result.success).toBe(true);
      expect(result.channel.members).toContain(mockEntityC);
      expect(result.entityId).toBe(mockEntityC);
    });

    it('should return success without change if entity is already a member', async () => {
      const channel = await createTestGroupChannel();
      await api.create(toCreateInput(channel));

      const result = await api.addChannelMember(channel.id, mockEntityB, { actor: mockEntityA });

      expect(result.success).toBe(true);
      // Should still have same number of members (no duplicate)
      expect(result.channel.members.filter((m) => m === mockEntityB).length).toBe(1);
    });

    it('should throw NotFoundError for non-existent channel', async () => {
      await expect(
        api.addChannelMember('el-nonexistent' as ElementId, mockEntityC, { actor: mockEntityA })
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw DirectChannelMembershipError for direct channels', async () => {
      const channel = await createDirectChannel({
        entityA: mockEntityA,
        entityB: mockEntityB,
        createdBy: mockEntityA,
      });
      await api.create(toCreateInput(channel));

      await expect(
        api.addChannelMember(channel.id, mockEntityC, { actor: mockEntityA })
      ).rejects.toThrow(ConstraintError);
    });

    it('should throw CannotModifyMembersError if actor lacks permission', async () => {
      const channel = await createTestGroupChannel();
      await api.create(toCreateInput(channel));

      // mockEntityB is a member but not in modifyMembers
      await expect(
        api.addChannelMember(channel.id, mockEntityC, { actor: mockEntityB })
      ).rejects.toThrow(ConstraintError);
    });

    it('should record member_added event', async () => {
      const channel = await createTestGroupChannel();
      await api.create(toCreateInput(channel));

      await api.addChannelMember(channel.id, mockEntityC, { actor: mockEntityA });

      const events = await api.getEvents(channel.id);
      const memberAddedEvent = events.find((e) => e.eventType === 'member_added');
      expect(memberAddedEvent).toBeDefined();
      expect(memberAddedEvent?.newValue).toMatchObject({ addedMember: mockEntityC });
    });
  });

  // --------------------------------------------------------------------------
  // removeChannelMember Tests
  // --------------------------------------------------------------------------

  describe('removeChannelMember()', () => {
    it('should remove a member from a group channel', async () => {
      const channel = await createTestGroupChannel();
      await api.create(toCreateInput(channel));

      const result = await api.removeChannelMember(channel.id, mockEntityB, { actor: mockEntityA });

      expect(result.success).toBe(true);
      expect(result.channel.members).not.toContain(mockEntityB);
      expect(result.entityId).toBe(mockEntityB);
    });

    it('should throw NotFoundError for non-existent channel', async () => {
      await expect(
        api.removeChannelMember('el-nonexistent' as ElementId, mockEntityB, { actor: mockEntityA })
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw DirectChannelMembershipError for direct channels', async () => {
      const channel = await createDirectChannel({
        entityA: mockEntityA,
        entityB: mockEntityB,
        createdBy: mockEntityA,
      });
      await api.create(toCreateInput(channel));

      await expect(
        api.removeChannelMember(channel.id, mockEntityB, { actor: mockEntityA })
      ).rejects.toThrow(ConstraintError);
    });

    it('should throw NotAMemberError if entity is not a member', async () => {
      const channel = await createTestGroupChannel();
      await api.create(toCreateInput(channel));

      await expect(
        api.removeChannelMember(channel.id, mockEntityC, { actor: mockEntityA })
      ).rejects.toThrow(ConstraintError);
    });

    it('should throw CannotModifyMembersError if actor lacks permission', async () => {
      const channel = await createTestGroupChannel();
      await api.create(toCreateInput(channel));

      // First add mockEntityC so we can try to remove them
      await api.addChannelMember(channel.id, mockEntityC, { actor: mockEntityA });

      // mockEntityB is a member but not in modifyMembers
      await expect(
        api.removeChannelMember(channel.id, mockEntityC, { actor: mockEntityB })
      ).rejects.toThrow(ConstraintError);
    });

    it('should remove entity from modifyMembers as well', async () => {
      // Create channel where mockEntityB is also a moderator
      const channel = await createGroupChannel({
        name: 'test-channel',
        createdBy: mockEntityA,
        members: [mockEntityB],
        modifyMembers: [mockEntityB],
      });
      await api.create(toCreateInput(channel));

      const result = await api.removeChannelMember(channel.id, mockEntityB, { actor: mockEntityA });

      expect(result.channel.permissions.modifyMembers).not.toContain(mockEntityB);
    });

    it('should record member_removed event', async () => {
      const channel = await createTestGroupChannel();
      await api.create(toCreateInput(channel));

      await api.removeChannelMember(channel.id, mockEntityB, {
        actor: mockEntityA,
        reason: 'Test removal',
      });

      const events = await api.getEvents(channel.id);
      const memberRemovedEvent = events.find((e) => e.eventType === 'member_removed');
      expect(memberRemovedEvent).toBeDefined();
      expect(memberRemovedEvent?.newValue).toMatchObject({
        removedMember: mockEntityB,
        reason: 'Test removal',
      });
    });
  });

  // --------------------------------------------------------------------------
  // leaveChannel Tests
  // --------------------------------------------------------------------------

  describe('leaveChannel()', () => {
    it('should allow a member to leave a group channel', async () => {
      const channel = await createTestGroupChannel();
      await api.create(toCreateInput(channel));

      // mockEntityB is a member
      const result = await api.leaveChannel(channel.id, mockEntityB);

      expect(result.success).toBe(true);
      expect(result.channel.members).not.toContain(mockEntityB);
      expect(result.entityId).toBe(mockEntityB);
    });

    it('should throw NotFoundError for non-existent channel', async () => {
      await expect(api.leaveChannel('el-nonexistent' as ElementId, mockEntityA)).rejects.toThrow(
        NotFoundError
      );
    });

    it('should throw ConstraintError for direct channels', async () => {
      const channel = await createDirectChannel({
        entityA: mockEntityA,
        entityB: mockEntityB,
        createdBy: mockEntityA,
      });
      await api.create(toCreateInput(channel));

      await expect(api.leaveChannel(channel.id, mockEntityA)).rejects.toThrow(ConstraintError);
    });

    it('should throw NotAMemberError if not a member', async () => {
      const channel = await createTestGroupChannel();
      await api.create(toCreateInput(channel));

      await expect(api.leaveChannel(channel.id, mockEntityC)).rejects.toThrow(ConstraintError);
    });

    it('should remove from modifyMembers when leaving', async () => {
      const channel = await createGroupChannel({
        name: 'test-channel',
        createdBy: mockEntityA,
        members: [mockEntityB],
        modifyMembers: [mockEntityB],
      });
      await api.create(toCreateInput(channel));

      const result = await api.leaveChannel(channel.id, mockEntityB);

      expect(result.channel.permissions.modifyMembers).not.toContain(mockEntityB);
    });

    it('should record member_removed event with selfRemoval flag', async () => {
      const channel = await createTestGroupChannel();
      await api.create(toCreateInput(channel));

      await api.leaveChannel(channel.id, mockEntityB);

      const events = await api.getEvents(channel.id);
      const memberRemovedEvent = events.find((e) => e.eventType === 'member_removed');
      expect(memberRemovedEvent).toBeDefined();
      expect(memberRemovedEvent?.newValue).toMatchObject({
        removedMember: mockEntityB,
        selfRemoval: true,
      });
    });
  });

  // --------------------------------------------------------------------------
  // Group Channel Name Uniqueness Tests
  // --------------------------------------------------------------------------

  describe('Group Channel Name Uniqueness', () => {
    it('should allow creating a group channel with unique name', async () => {
      const channel = await createTestGroupChannel({ name: 'unique-channel' });
      const created = await api.create(toCreateInput(channel));

      expect(created.id).toBeDefined();
    });

    it('should throw ConflictError when creating channel with duplicate name in same visibility scope', async () => {
      const channel1 = await createTestGroupChannel({ name: 'duplicate-name' });
      await api.create(toCreateInput(channel1));

      const channel2 = await createTestGroupChannel({ name: 'duplicate-name' });
      await expect(api.create(toCreateInput(channel2))).rejects.toThrow(ConflictError);
    });

    it('should allow same name in different visibility scopes', async () => {
      const privateChannel = await createGroupChannel({
        name: 'shared-name',
        createdBy: mockEntityA,
        members: [mockEntityB],
        visibility: VisibilityValue.PRIVATE,
      });
      await api.create(toCreateInput(privateChannel));

      const publicChannel = await createGroupChannel({
        name: 'shared-name',
        createdBy: mockEntityA,
        members: [mockEntityB],
        visibility: VisibilityValue.PUBLIC,
      });
      const created = await api.create(toCreateInput(publicChannel));

      expect(created.id).toBeDefined();
      expect(created.id).not.toBe(privateChannel.id);
    });

    it('should not apply uniqueness constraint to direct channels', async () => {
      // Direct channels can have the same deterministic name (but represent different pairs)
      // This test ensures we don't accidentally validate direct channels
      const direct1 = await createDirectChannel({
        entityA: mockEntityA,
        entityB: mockEntityB,
        createdBy: mockEntityA,
      });
      const created1 = await api.create(toCreateInput(direct1));

      // Direct channel names are unique by entity pair anyway
      expect(created1.id).toBeDefined();
    });
  });
});

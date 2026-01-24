/**
 * Message Integration Tests
 *
 * Tests for message integration with channels:
 * - Sender membership validation
 * - sendDirectMessage helper
 * - Auto-create direct channels
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { ElementalAPIImpl } from './elemental-api.js';
import { createStorage, initializeSchema } from '../storage/index.js';
import type { StorageBackend } from '../storage/backend.js';
import type { Element, EntityId } from '../types/element.js';
import type { Channel } from '../types/channel.js';
import type { Message } from '../types/message.js';
import type { Document } from '../types/document.js';
import {
  createGroupChannel,
  createDirectChannel,
  ChannelTypeValue,
  VisibilityValue,
  JoinPolicyValue,
  NotAMemberError,
} from '../types/channel.js';
import { createMessage } from '../types/message.js';
import { createDocument } from '../types/document.js';
import { NotFoundError } from '../errors/error.js';

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

/**
 * Create a test document for message content
 */
async function createTestDocument(
  createdBy: EntityId = mockEntityA,
  content: string = 'Test message content'
): Promise<Document> {
  return createDocument({
    content,
    contentType: 'text',
    createdBy,
  });
}

// ============================================================================
// Integration Tests
// ============================================================================

describe('Message Integration', () => {
  let backend: StorageBackend;
  let api: ElementalAPIImpl;

  beforeEach(async () => {
    // Create in-memory storage
    backend = createStorage({ path: ':memory:' });
    initializeSchema(backend);
    api = new ElementalAPIImpl(backend);
  });

  afterEach(() => {
    backend.close();
  });

  // --------------------------------------------------------------------------
  // Sender Membership Validation
  // --------------------------------------------------------------------------

  describe('Sender Membership Validation', () => {
    it('should allow message creation when sender is a channel member', async () => {
      // Create a group channel with A as creator and B as member
      const channel = await createTestGroupChannel({
        createdBy: mockEntityA,
        members: [mockEntityB],
      });
      const createdChannel = await api.create<Channel>(toCreateInput(channel));

      // Create a document for the message content
      const doc = await createTestDocument(mockEntityA);
      const createdDoc = await api.create<Document>(toCreateInput(doc));

      // Create a message from member A (creator is automatically a member)
      const message = await createMessage({
        channelId: createdChannel.id as unknown as import('../types/message.js').ChannelId,
        sender: mockEntityA,
        contentRef: createdDoc.id as unknown as import('../types/document.js').DocumentId,
      });

      // Should succeed
      const createdMessage = await api.create<Message>(toCreateInput(message));
      expect(createdMessage).toBeDefined();
      expect(createdMessage.channelId).toBe(createdChannel.id);
      expect(createdMessage.sender).toBe(mockEntityA);
    });

    it('should reject message creation when sender is not a channel member', async () => {
      // Create a group channel with A as creator and B as member (C is NOT a member)
      const channel = await createTestGroupChannel({
        createdBy: mockEntityA,
        members: [mockEntityB],
      });
      const createdChannel = await api.create<Channel>(toCreateInput(channel));

      // Create a document for the message content
      const doc = await createTestDocument(mockEntityC);
      const createdDoc = await api.create<Document>(toCreateInput(doc));

      // Try to create a message from non-member C
      const message = await createMessage({
        channelId: createdChannel.id as unknown as import('../types/message.js').ChannelId,
        sender: mockEntityC,
        contentRef: createdDoc.id as unknown as import('../types/document.js').DocumentId,
      });

      // Should throw NotAMemberError
      await expect(api.create<Message>(toCreateInput(message))).rejects.toThrow(NotAMemberError);
    });

    it('should reject message creation when channel does not exist', async () => {
      // Create a document for the message content
      const doc = await createTestDocument(mockEntityA);
      const createdDoc = await api.create<Document>(toCreateInput(doc));

      // Try to create a message for a non-existent channel
      const message = await createMessage({
        channelId: 'el-xyz123' as unknown as import('../types/message.js').ChannelId,
        sender: mockEntityA,
        contentRef: createdDoc.id as unknown as import('../types/document.js').DocumentId,
      });

      // Should throw NotFoundError
      await expect(api.create<Message>(toCreateInput(message))).rejects.toThrow(NotFoundError);
    });

    it('should allow message from any member in direct channel', async () => {
      // Create a direct channel between A and B
      const channel = await createDirectChannel({
        entityA: mockEntityA,
        entityB: mockEntityB,
        createdBy: mockEntityA,
      });
      const createdChannel = await api.create<Channel>(toCreateInput(channel));

      // Create a document for the message content
      const doc = await createTestDocument(mockEntityB);
      const createdDoc = await api.create<Document>(toCreateInput(doc));

      // Create a message from member B (the other party in direct channel)
      const message = await createMessage({
        channelId: createdChannel.id as unknown as import('../types/message.js').ChannelId,
        sender: mockEntityB,
        contentRef: createdDoc.id as unknown as import('../types/document.js').DocumentId,
      });

      // Should succeed
      const createdMessage = await api.create<Message>(toCreateInput(message));
      expect(createdMessage).toBeDefined();
      expect(createdMessage.sender).toBe(mockEntityB);
    });
  });

  // --------------------------------------------------------------------------
  // sendDirectMessage Helper
  // --------------------------------------------------------------------------

  describe('sendDirectMessage', () => {
    it('should create channel and message for first direct message', async () => {
      // Create a document for the message content
      const doc = await createTestDocument(mockEntityA);
      const createdDoc = await api.create<Document>(toCreateInput(doc));

      // Send a direct message from A to B
      const result = await api.sendDirectMessage(mockEntityA, {
        recipient: mockEntityB,
        contentRef: createdDoc.id as unknown as import('../types/document.js').DocumentId,
      });

      // Should create a new channel
      expect(result.channelCreated).toBe(true);
      expect(result.channel).toBeDefined();
      expect(result.channel.channelType).toBe(ChannelTypeValue.DIRECT);
      expect(result.channel.members).toContain(mockEntityA);
      expect(result.channel.members).toContain(mockEntityB);

      // Should create the message
      expect(result.message).toBeDefined();
      expect(result.message.sender).toBe(mockEntityA);
      expect(result.message.channelId).toBe(result.channel.id);
    });

    it('should reuse existing channel for subsequent direct messages', async () => {
      // Create first document
      const doc1 = await createTestDocument(mockEntityA, 'First message');
      const createdDoc1 = await api.create<Document>(toCreateInput(doc1));

      // Send first direct message
      const result1 = await api.sendDirectMessage(mockEntityA, {
        recipient: mockEntityB,
        contentRef: createdDoc1.id as unknown as import('../types/document.js').DocumentId,
      });
      expect(result1.channelCreated).toBe(true);

      // Create second document
      const doc2 = await createTestDocument(mockEntityA, 'Second message');
      const createdDoc2 = await api.create<Document>(toCreateInput(doc2));

      // Send second direct message
      const result2 = await api.sendDirectMessage(mockEntityA, {
        recipient: mockEntityB,
        contentRef: createdDoc2.id as unknown as import('../types/document.js').DocumentId,
      });

      // Should reuse existing channel
      expect(result2.channelCreated).toBe(false);
      expect(result2.channel.id).toBe(result1.channel.id);
    });

    it('should allow recipient to reply using sendDirectMessage', async () => {
      // A sends message to B
      const doc1 = await createTestDocument(mockEntityA);
      const createdDoc1 = await api.create<Document>(toCreateInput(doc1));
      const result1 = await api.sendDirectMessage(mockEntityA, {
        recipient: mockEntityB,
        contentRef: createdDoc1.id as unknown as import('../types/document.js').DocumentId,
      });

      // B replies to A (recipient is now A)
      const doc2 = await createTestDocument(mockEntityB);
      const createdDoc2 = await api.create<Document>(toCreateInput(doc2));
      const result2 = await api.sendDirectMessage(mockEntityB, {
        recipient: mockEntityA,
        contentRef: createdDoc2.id as unknown as import('../types/document.js').DocumentId,
      });

      // Should use same channel (deterministic naming)
      expect(result2.channel.id).toBe(result1.channel.id);
      expect(result2.channelCreated).toBe(false);
      expect(result2.message.sender).toBe(mockEntityB);
    });

    it('should include attachments in direct message', async () => {
      // Create content and attachment documents
      const contentDoc = await createTestDocument(mockEntityA, 'Message with attachment');
      const createdContentDoc = await api.create<Document>(toCreateInput(contentDoc));

      const attachmentDoc = await createTestDocument(mockEntityA, 'Attachment content');
      const createdAttachmentDoc = await api.create<Document>(toCreateInput(attachmentDoc));

      // Send direct message with attachment
      const result = await api.sendDirectMessage(mockEntityA, {
        recipient: mockEntityB,
        contentRef: createdContentDoc.id as unknown as import('../types/document.js').DocumentId,
        attachments: [createdAttachmentDoc.id as unknown as import('../types/document.js').DocumentId],
      });

      expect(result.message.attachments).toHaveLength(1);
      expect(result.message.attachments[0]).toBe(createdAttachmentDoc.id);
    });

    it('should include tags and metadata in direct message', async () => {
      const doc = await createTestDocument(mockEntityA);
      const createdDoc = await api.create<Document>(toCreateInput(doc));

      const result = await api.sendDirectMessage(mockEntityA, {
        recipient: mockEntityB,
        contentRef: createdDoc.id as unknown as import('../types/document.js').DocumentId,
        tags: ['important', 'urgent'],
        metadata: { priority: 'high' },
      });

      expect(result.message.tags).toEqual(['important', 'urgent']);
      expect(result.message.metadata).toEqual({ priority: 'high' });
    });
  });

  // --------------------------------------------------------------------------
  // Auto-create Direct Channels
  // --------------------------------------------------------------------------

  describe('Auto-create Direct Channels', () => {
    it('should auto-create channel with correct permissions', async () => {
      const doc = await createTestDocument(mockEntityA);
      const createdDoc = await api.create<Document>(toCreateInput(doc));

      const result = await api.sendDirectMessage(mockEntityA, {
        recipient: mockEntityB,
        contentRef: createdDoc.id as unknown as import('../types/document.js').DocumentId,
      });

      // Direct channels should be private and invite-only
      expect(result.channel.permissions.visibility).toBe(VisibilityValue.PRIVATE);
      expect(result.channel.permissions.joinPolicy).toBe(JoinPolicyValue.INVITE_ONLY);
      expect(result.channel.permissions.modifyMembers).toHaveLength(0);
    });

    it('should generate deterministic channel name', async () => {
      const doc = await createTestDocument(mockEntityA);
      const createdDoc = await api.create<Document>(toCreateInput(doc));

      const result = await api.sendDirectMessage(mockEntityA, {
        recipient: mockEntityB,
        contentRef: createdDoc.id as unknown as import('../types/document.js').DocumentId,
      });

      // Channel name should be sorted entity IDs joined by colon
      const expectedName = [mockEntityA, mockEntityB].sort().join(':');
      expect(result.channel.name).toBe(expectedName);
    });

    it('should work regardless of sender/recipient order', async () => {
      // A messages B
      const doc1 = await createTestDocument(mockEntityA);
      const createdDoc1 = await api.create<Document>(toCreateInput(doc1));
      const result1 = await api.sendDirectMessage(mockEntityA, {
        recipient: mockEntityB,
        contentRef: createdDoc1.id as unknown as import('../types/document.js').DocumentId,
      });

      // Later, B messages A (same pair, different order)
      const doc2 = await createTestDocument(mockEntityB);
      const createdDoc2 = await api.create<Document>(toCreateInput(doc2));
      const result2 = await api.sendDirectMessage(mockEntityB, {
        recipient: mockEntityA,
        contentRef: createdDoc2.id as unknown as import('../types/document.js').DocumentId,
      });

      // Both should use the same channel
      expect(result1.channel.name).toBe(result2.channel.name);
      expect(result1.channel.id).toBe(result2.channel.id);
    });
  });
});

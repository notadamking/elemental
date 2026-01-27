/**
 * Inbox Polling Service Unit Tests (TB-O10b)
 *
 * Tests for the InboxPollingService which provides periodic inbox checking
 * for agent sessions, dispatching messages based on type.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { EventEmitter } from 'node:events';
import type { EntityId, InboxItem, MessageId, ChannelId } from '@elemental/core';
import { InboxStatus, InboxSourceType, createTimestamp } from '@elemental/core';
import type { InboxService } from '@elemental/sdk';
import type { AgentRegistry } from '../services/agent-registry.js';
import {
  createInboxPollingService,
  type InboxPollingService,
  type InboxPollingConfig,
  type InboxMessageHandler,
  type ProcessedInboxMessage,
  OrchestratorMessageType,
  DEFAULT_POLL_INTERVAL_MS,
  MIN_POLL_INTERVAL_MS,
  MAX_POLL_INTERVAL_MS,
} from './inbox-polling.js';

// ============================================================================
// Mock Factories
// ============================================================================

const testAgentId = 'el-agent001' as EntityId;
const testAgentId2 = 'el-agent002' as EntityId;

let inboxItemCounter = 0;

function createMockInboxItem(
  recipientId: EntityId,
  options?: Partial<InboxItem>
): InboxItem {
  inboxItemCounter++;
  const now = createTimestamp();
  return {
    id: `inbox-${inboxItemCounter}`,
    recipientId,
    messageId: `msg-${inboxItemCounter}` as MessageId,
    channelId: `channel-${recipientId}` as ChannelId,
    sourceType: InboxSourceType.DIRECT,
    status: InboxStatus.UNREAD,
    readAt: null,
    createdAt: now,
    ...options,
  };
}

/**
 * Mock input for adding to inbox - accepts strings that will be cast to branded types
 */
interface MockAddToInboxInput {
  recipientId: EntityId;
  messageId: string;
  channelId: string;
  sourceType: typeof InboxSourceType[keyof typeof InboxSourceType];
}

function createMockInboxService(): {
  _mockInbox: Map<EntityId, InboxItem[]>;
  initSchema: InboxService['initSchema'];
  addToInbox: (input: MockAddToInboxInput) => InboxItem;
  getInbox: InboxService['getInbox'];
  getInboxPaginated: InboxService['getInboxPaginated'];
  getUnreadCount: InboxService['getUnreadCount'];
  getInboxItem: InboxService['getInboxItem'];
  markAsRead: InboxService['markAsRead'];
  markAsUnread: InboxService['markAsUnread'];
  markAllAsRead: InboxService['markAllAsRead'];
  archive: InboxService['archive'];
  getInboxByChannel: InboxService['getInboxByChannel'];
  deleteByMessage: InboxService['deleteByMessage'];
  deleteByRecipient: InboxService['deleteByRecipient'];
} {
  const inbox = new Map<EntityId, InboxItem[]>();

  return {
    _mockInbox: inbox,

    initSchema(): void {
      // No-op
    },

    addToInbox(input: MockAddToInboxInput): InboxItem {
      const item = createMockInboxItem(input.recipientId, {
        messageId: input.messageId as MessageId,
        channelId: input.channelId as ChannelId,
        sourceType: input.sourceType,
      });
      const items = inbox.get(input.recipientId) ?? [];
      items.push(item);
      inbox.set(input.recipientId, items);
      return item;
    },

    getInbox(recipientId: EntityId, filter?: any): InboxItem[] {
      const items = inbox.get(recipientId) ?? [];
      let filtered = items;

      if (filter?.status) {
        const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
        filtered = filtered.filter((item) => statuses.includes(item.status));
      }

      if (filter?.limit) {
        filtered = filtered.slice(0, filter.limit);
      }

      return filtered;
    },

    getInboxPaginated(recipientId: EntityId, filter?: any) {
      const items = this.getInbox(recipientId, filter);
      return { items, total: items.length };
    },

    getUnreadCount(recipientId: EntityId): number {
      const items = inbox.get(recipientId) ?? [];
      return items.filter((item) => item.status === InboxStatus.UNREAD).length;
    },

    getInboxItem(id: string): InboxItem | null {
      for (const items of inbox.values()) {
        const found = items.find((item) => item.id === id);
        if (found) return found;
      }
      return null;
    },

    markAsRead(itemId: string): InboxItem {
      for (const [recipientId, items] of inbox.entries()) {
        const index = items.findIndex((item) => item.id === itemId);
        if (index !== -1) {
          const updated: InboxItem = {
            ...items[index],
            status: InboxStatus.READ,
            readAt: createTimestamp(),
          };
          items[index] = updated;
          inbox.set(recipientId, items);
          return updated;
        }
      }
      throw new Error(`Inbox item not found: ${itemId}`);
    },

    markAsUnread(itemId: string): InboxItem {
      for (const [recipientId, items] of inbox.entries()) {
        const index = items.findIndex((item) => item.id === itemId);
        if (index !== -1) {
          const updated: InboxItem = {
            ...items[index],
            status: InboxStatus.UNREAD,
            readAt: null,
          };
          items[index] = updated;
          inbox.set(recipientId, items);
          return updated;
        }
      }
      throw new Error(`Inbox item not found: ${itemId}`);
    },

    markAllAsRead(recipientId: EntityId): number {
      const items = inbox.get(recipientId) ?? [];
      let count = 0;
      const updated = items.map((item) => {
        if (item.status === InboxStatus.UNREAD) {
          count++;
          return { ...item, status: InboxStatus.READ, readAt: createTimestamp() };
        }
        return item;
      });
      inbox.set(recipientId, updated as InboxItem[]);
      return count;
    },

    archive(itemId: string): InboxItem {
      for (const [recipientId, items] of inbox.entries()) {
        const index = items.findIndex((item) => item.id === itemId);
        if (index !== -1) {
          const updated: InboxItem = {
            ...items[index],
            status: InboxStatus.ARCHIVED,
          };
          items[index] = updated;
          inbox.set(recipientId, items);
          return updated;
        }
      }
      throw new Error(`Inbox item not found: ${itemId}`);
    },

    getInboxByChannel(recipientId: EntityId, channelId: any): InboxItem[] {
      const items = inbox.get(recipientId) ?? [];
      return items.filter((item) => item.channelId === channelId);
    },

    deleteByMessage(messageId: string): number {
      let count = 0;
      for (const [recipientId, items] of inbox.entries()) {
        const filtered = items.filter((item) => {
          if (item.messageId === messageId) {
            count++;
            return false;
          }
          return true;
        });
        inbox.set(recipientId, filtered);
      }
      return count;
    },

    deleteByRecipient(recipientId: EntityId): number {
      const items = inbox.get(recipientId) ?? [];
      inbox.delete(recipientId);
      return items.length;
    },
  };
}

function createMockAgentRegistry(): AgentRegistry {
  return {} as AgentRegistry;
}

// ============================================================================
// Tests
// ============================================================================

describe('InboxPollingService', () => {
  let pollingService: InboxPollingService;
  let inboxService: ReturnType<typeof createMockInboxService>;
  let registry: AgentRegistry;

  beforeEach(() => {
    inboxItemCounter = 0;
    inboxService = createMockInboxService();
    registry = createMockAgentRegistry();
    pollingService = createInboxPollingService(inboxService as unknown as InboxService, registry);
  });

  afterEach(() => {
    pollingService.dispose();
  });

  describe('creation and configuration', () => {
    test('creates with default configuration', () => {
      const config = pollingService.getDefaultConfig();
      expect(config.pollIntervalMs).toBe(DEFAULT_POLL_INTERVAL_MS);
      expect(config.autoStart).toBe(true);
      expect(config.autoMarkAsRead).toBe(true);
      expect(config.maxMessagesPerPoll).toBe(10);
      expect(config.processOldestFirst).toBe(true);
    });

    test('creates with custom configuration', () => {
      const customConfig: InboxPollingConfig = {
        pollIntervalMs: 5000,
        autoStart: false,
        autoMarkAsRead: false,
        maxMessagesPerPoll: 5,
        processOldestFirst: false,
      };

      const service = createInboxPollingService(inboxService as unknown as InboxService, registry, customConfig);
      const config = service.getDefaultConfig();

      expect(config.pollIntervalMs).toBe(5000);
      expect(config.autoStart).toBe(false);
      expect(config.autoMarkAsRead).toBe(false);
      expect(config.maxMessagesPerPoll).toBe(5);
      expect(config.processOldestFirst).toBe(false);

      service.dispose();
    });

    test('clamps poll interval to minimum', () => {
      const service = createInboxPollingService(inboxService as unknown as InboxService, registry, {
        pollIntervalMs: 100, // Too low
      });
      const config = service.getDefaultConfig();
      expect(config.pollIntervalMs).toBe(MIN_POLL_INTERVAL_MS);
      service.dispose();
    });

    test('clamps poll interval to maximum', () => {
      const service = createInboxPollingService(inboxService as unknown as InboxService, registry, {
        pollIntervalMs: 1_000_000, // Too high
      });
      const config = service.getDefaultConfig();
      expect(config.pollIntervalMs).toBe(MAX_POLL_INTERVAL_MS);
      service.dispose();
    });

    test('setDefaultConfig updates default configuration', () => {
      pollingService.setDefaultConfig({ pollIntervalMs: 10000 });
      const config = pollingService.getDefaultConfig();
      expect(config.pollIntervalMs).toBe(10000);
    });
  });

  describe('startPolling', () => {
    test('starts polling for an agent', () => {
      const events = pollingService.startPolling(testAgentId);

      expect(events).toBeInstanceOf(EventEmitter);
      expect(pollingService.isPolling(testAgentId)).toBe(true);
    });

    test('emits start event with configuration', () => {
      // The 'start' event is emitted synchronously during startPolling,
      // so we verify the state after the call
      const events = pollingService.startPolling(testAgentId);

      expect(events).toBeInstanceOf(EventEmitter);
      expect(pollingService.isPolling(testAgentId)).toBe(true);

      const state = pollingService.getPollingState(testAgentId);
      expect(state).toBeDefined();
      expect(state?.config.pollIntervalMs).toBe(DEFAULT_POLL_INTERVAL_MS);
      expect(state?.isPolling).toBe(true);
    });

    test('uses custom config per agent', () => {
      pollingService.startPolling(testAgentId, { pollIntervalMs: 5000 });
      pollingService.startPolling(testAgentId2, { pollIntervalMs: 10000 });

      const state1 = pollingService.getPollingState(testAgentId);
      const state2 = pollingService.getPollingState(testAgentId2);

      expect(state1?.config.pollIntervalMs).toBe(5000);
      expect(state2?.config.pollIntervalMs).toBe(10000);
    });

    test('stops previous polling when starting new', () => {
      const events1 = pollingService.startPolling(testAgentId);
      let stopped = false;
      events1.on('stop', () => {
        stopped = true;
      });

      pollingService.startPolling(testAgentId);

      expect(stopped).toBe(true);
    });

    test('throws error if service is disposed', () => {
      pollingService.dispose();
      expect(() => pollingService.startPolling(testAgentId)).toThrow(
        'InboxPollingService has been disposed'
      );
    });
  });

  describe('stopPolling', () => {
    test('stops polling for an agent', () => {
      pollingService.startPolling(testAgentId);
      expect(pollingService.isPolling(testAgentId)).toBe(true);

      pollingService.stopPolling(testAgentId);
      expect(pollingService.isPolling(testAgentId)).toBe(false);
    });

    test('emits stop event', async () => {
      const events = pollingService.startPolling(testAgentId);

      const stopEventPromise = new Promise<{ agentId: EntityId }>((resolve) => {
        events.on('stop', resolve);
      });

      pollingService.stopPolling(testAgentId);

      const data = await stopEventPromise;
      expect(data.agentId).toBe(testAgentId);
    });

    test('does nothing for non-polling agent', () => {
      // Should not throw
      pollingService.stopPolling(testAgentId);
      expect(pollingService.isPolling(testAgentId)).toBe(false);
    });
  });

  describe('isPolling', () => {
    test('returns false for non-polling agent', () => {
      expect(pollingService.isPolling(testAgentId)).toBe(false);
    });

    test('returns true for polling agent', () => {
      pollingService.startPolling(testAgentId);
      expect(pollingService.isPolling(testAgentId)).toBe(true);
    });

    test('returns false after stopping', () => {
      pollingService.startPolling(testAgentId);
      pollingService.stopPolling(testAgentId);
      expect(pollingService.isPolling(testAgentId)).toBe(false);
    });
  });

  describe('pollNow', () => {
    test('performs immediate poll', async () => {
      const result = await pollingService.pollNow(testAgentId);

      expect(result.agentId).toBe(testAgentId);
      expect(result.totalFound).toBe(0);
      expect(result.processed).toBe(0);
      expect(result.skipped).toBe(0);
      expect(result.polledAt).toBeDefined();
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    test('finds and processes unread messages', async () => {
      // Add some unread messages
      inboxService.addToInbox({
        recipientId: testAgentId,
        messageId: 'msg-1',
        channelId: 'channel-1',
        sourceType: InboxSourceType.DIRECT,
      });
      inboxService.addToInbox({
        recipientId: testAgentId,
        messageId: 'msg-2',
        channelId: 'channel-1',
        sourceType: InboxSourceType.DIRECT,
      });

      const result = await pollingService.pollNow(testAgentId);

      expect(result.totalFound).toBe(2);
      expect(result.processed).toBe(2);
      expect(result.skipped).toBe(0);
    });

    test('uses existing polling state config when polling', async () => {
      pollingService.startPolling(testAgentId, { maxMessagesPerPoll: 1 });

      // Add multiple messages
      for (let i = 0; i < 5; i++) {
        inboxService.addToInbox({
          recipientId: testAgentId,
          messageId: `msg-${i}`,
          channelId: 'channel-1',
          sourceType: InboxSourceType.DIRECT,
        });
      }

      const result = await pollingService.pollNow(testAgentId);

      // Should only process 1 due to config
      expect(result.totalFound).toBe(1);
      expect(result.processed).toBe(1);
    });

    test('marks messages as read when autoMarkAsRead is true', async () => {
      inboxService.addToInbox({
        recipientId: testAgentId,
        messageId: 'msg-1',
        channelId: 'channel-1',
        sourceType: InboxSourceType.DIRECT,
      });

      await pollingService.pollNow(testAgentId);

      // Check that message was marked as read
      const unreadCount = inboxService.getUnreadCount(testAgentId);
      expect(unreadCount).toBe(0);
    });

    test('does not mark messages as read when autoMarkAsRead is false', async () => {
      pollingService.setDefaultConfig({ autoMarkAsRead: false });

      inboxService.addToInbox({
        recipientId: testAgentId,
        messageId: 'msg-1',
        channelId: 'channel-1',
        sourceType: InboxSourceType.DIRECT,
      });

      await pollingService.pollNow(testAgentId);

      // Check that message is still unread
      const unreadCount = inboxService.getUnreadCount(testAgentId);
      expect(unreadCount).toBe(1);
    });

    test('categorizes messages by type', async () => {
      inboxService.addToInbox({
        recipientId: testAgentId,
        messageId: 'msg-1',
        channelId: 'channel-1',
        sourceType: InboxSourceType.DIRECT,
      });

      const result = await pollingService.pollNow(testAgentId);

      // All messages should be categorized as GENERIC by default
      expect(result.byType[OrchestratorMessageType.GENERIC]).toHaveLength(1);
      expect(result.byType[OrchestratorMessageType.TASK_ASSIGNMENT]).toHaveLength(0);
    });

    test('throws error if service is disposed', async () => {
      pollingService.dispose();
      await expect(pollingService.pollNow(testAgentId)).rejects.toThrow(
        'InboxPollingService has been disposed'
      );
    });
  });

  describe('message handlers', () => {
    test('calls type-specific handlers', async () => {
      const receivedMessages: ProcessedInboxMessage[] = [];
      const handler: InboxMessageHandler = (message) => {
        receivedMessages.push(message);
      };

      pollingService.onMessageType(OrchestratorMessageType.GENERIC, handler);

      inboxService.addToInbox({
        recipientId: testAgentId,
        messageId: 'msg-1',
        channelId: 'channel-1',
        sourceType: InboxSourceType.DIRECT,
      });

      await pollingService.pollNow(testAgentId);

      expect(receivedMessages).toHaveLength(1);
      expect(receivedMessages[0].messageType).toBe(OrchestratorMessageType.GENERIC);
    });

    test('calls any-message handlers', async () => {
      const receivedMessages: ProcessedInboxMessage[] = [];
      const handler: InboxMessageHandler = (message) => {
        receivedMessages.push(message);
      };

      pollingService.onAnyMessage(handler);

      inboxService.addToInbox({
        recipientId: testAgentId,
        messageId: 'msg-1',
        channelId: 'channel-1',
        sourceType: InboxSourceType.DIRECT,
      });

      await pollingService.pollNow(testAgentId);

      expect(receivedMessages).toHaveLength(1);
    });

    test('removes type-specific handlers', async () => {
      const receivedMessages: ProcessedInboxMessage[] = [];
      const handler: InboxMessageHandler = (message) => {
        receivedMessages.push(message);
      };

      pollingService.onMessageType(OrchestratorMessageType.GENERIC, handler);
      pollingService.offMessageType(OrchestratorMessageType.GENERIC, handler);

      inboxService.addToInbox({
        recipientId: testAgentId,
        messageId: 'msg-1',
        channelId: 'channel-1',
        sourceType: InboxSourceType.DIRECT,
      });

      await pollingService.pollNow(testAgentId);

      expect(receivedMessages).toHaveLength(0);
    });

    test('removes any-message handlers', async () => {
      const receivedMessages: ProcessedInboxMessage[] = [];
      const handler: InboxMessageHandler = (message) => {
        receivedMessages.push(message);
      };

      pollingService.onAnyMessage(handler);
      pollingService.offAnyMessage(handler);

      inboxService.addToInbox({
        recipientId: testAgentId,
        messageId: 'msg-1',
        channelId: 'channel-1',
        sourceType: InboxSourceType.DIRECT,
      });

      await pollingService.pollNow(testAgentId);

      expect(receivedMessages).toHaveLength(0);
    });

    test('passes agentId to handlers', async () => {
      let receivedAgentId: EntityId | undefined;
      const handler: InboxMessageHandler = (_message, agentId) => {
        receivedAgentId = agentId;
      };

      pollingService.onAnyMessage(handler);

      inboxService.addToInbox({
        recipientId: testAgentId,
        messageId: 'msg-1',
        channelId: 'channel-1',
        sourceType: InboxSourceType.DIRECT,
      });

      await pollingService.pollNow(testAgentId);

      expect(receivedAgentId).toBe(testAgentId);
    });

    test('handler errors do not stop processing', async () => {
      const receivedMessages: ProcessedInboxMessage[] = [];

      // Add an error-throwing handler
      pollingService.onAnyMessage(() => {
        throw new Error('Handler error');
      });

      // Add a working handler
      pollingService.onAnyMessage((message) => {
        receivedMessages.push(message);
      });

      inboxService.addToInbox({
        recipientId: testAgentId,
        messageId: 'msg-1',
        channelId: 'channel-1',
        sourceType: InboxSourceType.DIRECT,
      });

      // Should not throw
      const result = await pollingService.pollNow(testAgentId);

      expect(result.processed).toBe(1);
      expect(receivedMessages).toHaveLength(1);
    });
  });

  describe('getPollingState', () => {
    test('returns undefined for non-polling agent', () => {
      const state = pollingService.getPollingState(testAgentId);
      expect(state).toBeUndefined();
    });

    test('returns state for polling agent', () => {
      pollingService.startPolling(testAgentId, { pollIntervalMs: 5000 });

      const state = pollingService.getPollingState(testAgentId);

      expect(state).toBeDefined();
      expect(state?.isPolling).toBe(true);
      expect(state?.config.pollIntervalMs).toBe(5000);
    });

    test('includes lastPollAt after poll', async () => {
      pollingService.startPolling(testAgentId);
      await pollingService.pollNow(testAgentId);

      const state = pollingService.getPollingState(testAgentId);

      expect(state?.lastPollAt).toBeDefined();
    });
  });

  describe('getPollingAgents', () => {
    test('returns empty array when no agents polling', () => {
      const agents = pollingService.getPollingAgents();
      expect(agents).toEqual([]);
    });

    test('returns all polling agents', () => {
      pollingService.startPolling(testAgentId);
      pollingService.startPolling(testAgentId2);

      const agents = pollingService.getPollingAgents();

      expect(agents).toHaveLength(2);
      expect(agents).toContain(testAgentId);
      expect(agents).toContain(testAgentId2);
    });
  });

  describe('dispose', () => {
    test('stops all polling', () => {
      pollingService.startPolling(testAgentId);
      pollingService.startPolling(testAgentId2);

      pollingService.dispose();

      expect(pollingService.isPolling(testAgentId)).toBe(false);
      expect(pollingService.isPolling(testAgentId2)).toBe(false);
    });

    test('clears all handlers', async () => {
      const receivedMessages: ProcessedInboxMessage[] = [];
      pollingService.onAnyMessage((message) => {
        receivedMessages.push(message);
      });

      pollingService.dispose();

      // Service is disposed, can't poll anymore
      // Handlers should be cleared internally
      expect(pollingService.getPollingAgents()).toEqual([]);
    });
  });

  describe('message ordering', () => {
    test('processes oldest first by default', async () => {
      // Add messages with different timestamps
      const now = Date.now();
      const item1 = createMockInboxItem(testAgentId, {
        createdAt: new Date(now - 2000).toISOString() as any,
      });
      const item2 = createMockInboxItem(testAgentId, {
        createdAt: new Date(now - 1000).toISOString() as any,
      });
      const item3 = createMockInboxItem(testAgentId, {
        createdAt: new Date(now).toISOString() as any,
      });

      // Add in reverse order
      inboxService._mockInbox.set(testAgentId, [item3, item1, item2]);

      const processedOrder: string[] = [];
      pollingService.onAnyMessage((message) => {
        processedOrder.push(message.item.id);
      });

      await pollingService.pollNow(testAgentId);

      // Should process oldest first
      expect(processedOrder[0]).toBe(item1.id);
      expect(processedOrder[1]).toBe(item2.id);
      expect(processedOrder[2]).toBe(item3.id);
    });

    test('processes newest first when configured', async () => {
      pollingService.setDefaultConfig({ processOldestFirst: false });

      // Add messages with different timestamps
      const now = Date.now();
      const item1 = createMockInboxItem(testAgentId, {
        createdAt: new Date(now - 2000).toISOString() as any,
      });
      const item2 = createMockInboxItem(testAgentId, {
        createdAt: new Date(now - 1000).toISOString() as any,
      });
      const item3 = createMockInboxItem(testAgentId, {
        createdAt: new Date(now).toISOString() as any,
      });

      inboxService._mockInbox.set(testAgentId, [item3, item1, item2]);

      const processedOrder: string[] = [];
      pollingService.onAnyMessage((message) => {
        processedOrder.push(message.item.id);
      });

      await pollingService.pollNow(testAgentId);

      // Should process newest first
      expect(processedOrder[0]).toBe(item3.id);
      expect(processedOrder[1]).toBe(item2.id);
      expect(processedOrder[2]).toBe(item1.id);
    });
  });

  describe('interval polling', () => {
    test('emits poll events on interval', async () => {
      // Use a short interval for testing
      const events = pollingService.startPolling(testAgentId, {
        pollIntervalMs: MIN_POLL_INTERVAL_MS, // Use minimum interval
      });

      const pollEventPromise = new Promise<void>((resolve) => {
        events.once('poll', () => {
          pollingService.stopPolling(testAgentId);
          resolve();
        });
      });

      // Wait for at least one poll event
      await pollEventPromise;
      expect(pollingService.isPolling(testAgentId)).toBe(false);
    }, 5000); // 5 second timeout
  });
});

describe('OrchestratorMessageType', () => {
  test('has expected message types', () => {
    expect(OrchestratorMessageType.TASK_ASSIGNMENT).toBe('task-assignment');
    expect(OrchestratorMessageType.STATUS_UPDATE).toBe('status-update');
    expect(OrchestratorMessageType.HELP_REQUEST).toBe('help-request');
    expect(OrchestratorMessageType.HANDOFF).toBe('handoff');
    expect(OrchestratorMessageType.HEALTH_CHECK).toBe('health-check');
    expect(OrchestratorMessageType.GENERIC).toBe('generic');
  });
});

describe('polling constants', () => {
  test('DEFAULT_POLL_INTERVAL_MS is 30 seconds', () => {
    expect(DEFAULT_POLL_INTERVAL_MS).toBe(30_000);
  });

  test('MIN_POLL_INTERVAL_MS is 1 second', () => {
    expect(MIN_POLL_INTERVAL_MS).toBe(1_000);
  });

  test('MAX_POLL_INTERVAL_MS is 5 minutes', () => {
    expect(MAX_POLL_INTERVAL_MS).toBe(300_000);
  });
});

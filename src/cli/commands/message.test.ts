/**
 * Message Command Tests
 *
 * Tests for message send, list, and thread CLI commands.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { messageCommand } from './message.js';
import type { GlobalOptions } from '../types.js';
import { ExitCode } from '../types.js';
import { createStorage, initializeSchema } from '../../storage/index.js';
import { createElementalAPI } from '../../api/elemental-api.js';
import { createGroupChannel } from '../../types/channel.js';
import { createDocument, ContentType } from '../../types/document.js';
import type { Element, EntityId } from '../../types/element.js';
import type { Message } from '../../types/message.js';

// ============================================================================
// Test Utilities
// ============================================================================

const TEST_DIR = join(import.meta.dir, '__test_message_workspace__');
const ELEMENTAL_DIR = join(TEST_DIR, '.elemental');
const DB_PATH = join(ELEMENTAL_DIR, 'elemental.db');

// Use proper entity ID format for test users
const TEST_USER = 'el-user1' as EntityId;
const OTHER_USER = 'el-user2' as EntityId;
const NON_MEMBER = 'el-user3' as EntityId;

function createTestOptions(overrides: Partial<GlobalOptions> = {}): GlobalOptions {
  return {
    db: DB_PATH,
    actor: TEST_USER,
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

let testChannelId: string;

beforeEach(async () => {
  // Create test workspace
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true });
  }
  mkdirSync(ELEMENTAL_DIR, { recursive: true });

  // Initialize database
  const backend = createStorage({ path: DB_PATH, create: true });
  initializeSchema(backend);

  // Create a test channel for message tests
  const api = createElementalAPI(backend);
  const channel = await createGroupChannel({
    name: 'test-channel',
    createdBy: TEST_USER,
    members: [OTHER_USER],
  });
  const created = await api.create(channel as unknown as Element & Record<string, unknown>);
  testChannelId = created.id;
});

afterEach(() => {
  // Cleanup test workspace
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true });
  }
});

// ============================================================================
// Message Send Tests
// ============================================================================

describe('msg send command', () => {
  test('fails without channel option', async () => {
    const options = createTestOptions({ content: 'Hello' } as GlobalOptions & { content: string });
    const result = await messageCommand.subcommands!.send.handler!([], options);

    expect(result.exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
    expect(result.error).toContain('--channel');
  });

  test('fails without content or file', async () => {
    const options = createTestOptions({ channel: testChannelId } as GlobalOptions & { channel: string });
    const result = await messageCommand.subcommands!.send.handler!([], options);

    expect(result.exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
    expect(result.error).toContain('content');
  });

  test('fails with both content and file', async () => {
    const options = createTestOptions({
      channel: testChannelId,
      content: 'Hello',
      file: 'test.txt',
    } as GlobalOptions & { channel: string; content: string; file: string });
    const result = await messageCommand.subcommands!.send.handler!([], options);

    expect(result.exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
    expect(result.error).toContain('Cannot specify both');
  });

  test('sends a message to a channel', async () => {
    const options = createTestOptions({
      channel: testChannelId,
      content: 'Hello, World!',
    } as GlobalOptions & { channel: string; content: string });
    const result = await messageCommand.subcommands!.send.handler!([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toBeDefined();
    expect((result.data as Message).id).toMatch(/^el-/);
    expect(result.message).toContain('Sent message');
    expect(result.message).toContain(testChannelId);
  });

  test('sends a message from file content', async () => {
    const testFilePath = join(TEST_DIR, 'message.txt');
    writeFileSync(testFilePath, 'Message from file');

    const options = createTestOptions({
      channel: testChannelId,
      file: testFilePath,
    } as GlobalOptions & { channel: string; file: string });
    const result = await messageCommand.subcommands!.send.handler!([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toBeDefined();
  });

  test('fails with non-existent channel', async () => {
    const options = createTestOptions({
      channel: 'el-nonexistent',
      content: 'Hello',
    } as GlobalOptions & { channel: string; content: string });
    const result = await messageCommand.subcommands!.send.handler!([], options);

    expect(result.exitCode).toBe(ExitCode.NOT_FOUND);
    expect(result.error).toContain('not found');
  });

  test('fails when not a member of channel', async () => {
    const options = createTestOptions({
      channel: testChannelId,
      content: 'Hello',
      actor: NON_MEMBER,
    } as GlobalOptions & { channel: string; content: string });
    const result = await messageCommand.subcommands!.send.handler!([], options);

    expect(result.exitCode).toBe(ExitCode.PERMISSION);
    expect(result.error).toContain('not a member');
  });

  test('sends a threaded reply', async () => {
    // First send a root message
    const sendOptions = createTestOptions({
      channel: testChannelId,
      content: 'Root message',
    } as GlobalOptions & { channel: string; content: string });
    const rootResult = await messageCommand.subcommands!.send.handler!([], sendOptions);
    expect(rootResult.exitCode).toBe(ExitCode.SUCCESS);
    const rootMessageId = (rootResult.data as Message).id;

    // Send a reply
    const replyOptions = createTestOptions({
      channel: testChannelId,
      content: 'Reply message',
      thread: rootMessageId,
    } as GlobalOptions & { channel: string; content: string; thread: string });
    const replyResult = await messageCommand.subcommands!.send.handler!([], replyOptions);

    expect(replyResult.exitCode).toBe(ExitCode.SUCCESS);
    expect((replyResult.data as Message).threadId).toBe(rootMessageId);
    expect(replyResult.message).toContain('reply to');
  });

  test('fails with thread parent in different channel', async () => {
    // Create another channel
    const backend = createStorage({ path: DB_PATH, create: true });
    initializeSchema(backend);
    const api = createElementalAPI(backend);

    const otherChannel = await createGroupChannel({
      name: 'other-channel',
      createdBy: TEST_USER,
      members: [OTHER_USER],  // creator + 1 member = 2 members
    });
    const createdChannel = await api.create(otherChannel as unknown as Element & Record<string, unknown>);

    // Send message in other channel
    const otherDoc = await createDocument({
      content: 'Other channel message',
      contentType: ContentType.TEXT,
      createdBy: TEST_USER,
    });
    const createdDoc = await api.create(otherDoc as unknown as Element & Record<string, unknown>);

    const { createMessage } = await import('../../types/message.js');
    const otherMessage = await createMessage({
      channelId: createdChannel.id as unknown as import('../../types/message.js').ChannelId,
      sender: TEST_USER,
      contentRef: createdDoc.id as unknown as import('../../types/document.js').DocumentId,
    });
    const createdMessage = await api.create(otherMessage as unknown as Element & Record<string, unknown>);

    // Try to reply in test channel to message in other channel
    const options = createTestOptions({
      channel: testChannelId,
      content: 'Reply',
      thread: createdMessage.id,
    } as GlobalOptions & { channel: string; content: string; thread: string });
    const result = await messageCommand.subcommands!.send.handler!([], options);

    expect(result.exitCode).toBe(ExitCode.VALIDATION);
    expect(result.error).toContain('different channel');
  });

  test('sends message with tags', async () => {
    const options = createTestOptions({
      channel: testChannelId,
      content: 'Tagged message',
      tag: ['important', 'urgent'],
    } as GlobalOptions & { channel: string; content: string; tag: string[] });
    const result = await messageCommand.subcommands!.send.handler!([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect((result.data as Message).tags).toEqual(['important', 'urgent']);
  });

  test('outputs only ID in quiet mode', async () => {
    const options = createTestOptions({
      channel: testChannelId,
      content: 'Quiet message',
      quiet: true,
    } as GlobalOptions & { channel: string; content: string });
    const result = await messageCommand.subcommands!.send.handler!([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toMatch(/^el-/);
  });
});

// ============================================================================
// Message List Tests
// ============================================================================

describe('msg list command', () => {
  test('fails without channel option', async () => {
    const options = createTestOptions();
    const result = await messageCommand.subcommands!.list.handler!([], options);

    expect(result.exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
    expect(result.error).toContain('--channel');
  });

  test('returns empty list when no messages', async () => {
    const options = createTestOptions({
      channel: testChannelId,
    } as GlobalOptions & { channel: string });
    const result = await messageCommand.subcommands!.list.handler!([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.message).toContain('No messages found');
  });

  test('lists messages in channel', async () => {
    // Send some messages
    const sendOptions = createTestOptions({
      channel: testChannelId,
      content: 'Message 1',
    } as GlobalOptions & { channel: string; content: string });
    await messageCommand.subcommands!.send.handler!([], sendOptions);
    await messageCommand.subcommands!.send.handler!([], { ...sendOptions, content: 'Message 2' });

    // List messages
    const listOptions = createTestOptions({
      channel: testChannelId,
    } as GlobalOptions & { channel: string });
    const result = await messageCommand.subcommands!.list.handler!([], listOptions);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect((result.data as Message[]).length).toBe(2);
  });

  test('filters by sender', async () => {
    // Send message as test-user
    const sendOptions = createTestOptions({
      channel: testChannelId,
      content: 'Test user message',
    } as GlobalOptions & { channel: string; content: string });
    await messageCommand.subcommands!.send.handler!([], sendOptions);

    // Send message as other-user
    const otherOptions = createTestOptions({
      channel: testChannelId,
      content: 'Other user message',
      actor: OTHER_USER as EntityId,
    } as GlobalOptions & { channel: string; content: string });
    await messageCommand.subcommands!.send.handler!([], otherOptions);

    // List only test-user messages
    const listOptions = createTestOptions({
      channel: testChannelId,
      sender: TEST_USER,
    } as GlobalOptions & { channel: string; sender: string });
    const result = await messageCommand.subcommands!.list.handler!([], listOptions);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect((result.data as Message[]).length).toBe(1);
    expect((result.data as Message[])[0].sender).toBe(TEST_USER);
  });

  test('filters root-only messages', async () => {
    // Send root message
    const sendOptions = createTestOptions({
      channel: testChannelId,
      content: 'Root message',
    } as GlobalOptions & { channel: string; content: string });
    const rootResult = await messageCommand.subcommands!.send.handler!([], sendOptions);
    const rootId = (rootResult.data as Message).id;

    // Send reply
    const replyOptions = createTestOptions({
      channel: testChannelId,
      content: 'Reply',
      thread: rootId,
    } as GlobalOptions & { channel: string; content: string; thread: string });
    await messageCommand.subcommands!.send.handler!([], replyOptions);

    // List only root messages
    const listOptions = createTestOptions({
      channel: testChannelId,
      rootOnly: true,
    } as GlobalOptions & { channel: string; rootOnly: boolean });
    const result = await messageCommand.subcommands!.list.handler!([], listOptions);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect((result.data as Message[]).length).toBe(1);
    expect((result.data as Message[])[0].threadId).toBeNull();
  });

  test('respects limit option', async () => {
    // Send 5 messages
    const sendOptions = createTestOptions({
      channel: testChannelId,
      content: 'Message',
    } as GlobalOptions & { channel: string; content: string });
    for (let i = 0; i < 5; i++) {
      await messageCommand.subcommands!.send.handler!([], { ...sendOptions, content: `Message ${i}` });
    }

    // List with limit
    const listOptions = createTestOptions({
      channel: testChannelId,
      limit: '3',
    } as GlobalOptions & { channel: string; limit: string });
    const result = await messageCommand.subcommands!.list.handler!([], listOptions);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect((result.data as Message[]).length).toBe(3);
  });

  test('fails with non-existent channel', async () => {
    const options = createTestOptions({
      channel: 'el-nonexistent',
    } as GlobalOptions & { channel: string });
    const result = await messageCommand.subcommands!.list.handler!([], options);

    expect(result.exitCode).toBe(ExitCode.NOT_FOUND);
  });

  test('outputs JSON in JSON mode', async () => {
    const sendOptions = createTestOptions({
      channel: testChannelId,
      content: 'JSON test',
    } as GlobalOptions & { channel: string; content: string });
    await messageCommand.subcommands!.send.handler!([], sendOptions);

    const listOptions = createTestOptions({
      channel: testChannelId,
      json: true,
    } as GlobalOptions & { channel: string });
    const result = await messageCommand.subcommands!.list.handler!([], listOptions);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(Array.isArray(result.data)).toBe(true);
  });

  test('outputs only IDs in quiet mode', async () => {
    const sendOptions = createTestOptions({
      channel: testChannelId,
      content: 'Quiet test',
    } as GlobalOptions & { channel: string; content: string });
    await messageCommand.subcommands!.send.handler!([], sendOptions);

    const listOptions = createTestOptions({
      channel: testChannelId,
      quiet: true,
    } as GlobalOptions & { channel: string });
    const result = await messageCommand.subcommands!.list.handler!([], listOptions);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(typeof result.data).toBe('string');
    expect(result.data).toMatch(/^el-/);
  });
});

// ============================================================================
// Message Thread Tests
// ============================================================================

describe('msg thread command', () => {
  test('fails without message ID argument', async () => {
    const options = createTestOptions();
    const result = await messageCommand.subcommands!.thread.handler!([], options);

    expect(result.exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
    expect(result.error).toContain('Usage');
  });

  test('fails with non-existent message', async () => {
    const options = createTestOptions();
    const result = await messageCommand.subcommands!.thread.handler!(['el-nonexistent'], options);

    expect(result.exitCode).toBe(ExitCode.NOT_FOUND);
    expect(result.error).toContain('not found');
  });

  test('shows thread with root and replies', async () => {
    // Send root message
    const sendOptions = createTestOptions({
      channel: testChannelId,
      content: 'Root message',
    } as GlobalOptions & { channel: string; content: string });
    const rootResult = await messageCommand.subcommands!.send.handler!([], sendOptions);
    const rootId = (rootResult.data as Message).id;

    // Send replies
    for (let i = 1; i <= 3; i++) {
      const replyOptions = createTestOptions({
        channel: testChannelId,
        content: `Reply ${i}`,
        thread: rootId,
      } as GlobalOptions & { channel: string; content: string; thread: string });
      await messageCommand.subcommands!.send.handler!([], replyOptions);
    }

    // Get thread
    const threadOptions = createTestOptions();
    const result = await messageCommand.subcommands!.thread.handler!([rootId], threadOptions);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect((result.data as Message[]).length).toBe(4); // root + 3 replies
    expect(result.message).toContain('3 replies');
  });

  test('respects limit option', async () => {
    // Send root and replies
    const sendOptions = createTestOptions({
      channel: testChannelId,
      content: 'Root',
    } as GlobalOptions & { channel: string; content: string });
    const rootResult = await messageCommand.subcommands!.send.handler!([], sendOptions);
    const rootId = (rootResult.data as Message).id;

    for (let i = 1; i <= 5; i++) {
      const replyOptions = createTestOptions({
        channel: testChannelId,
        content: `Reply ${i}`,
        thread: rootId,
      } as GlobalOptions & { channel: string; content: string; thread: string });
      await messageCommand.subcommands!.send.handler!([], replyOptions);
    }

    // Get thread with limit
    const threadOptions = createTestOptions({ limit: '3' } as GlobalOptions & { limit: string });
    const result = await messageCommand.subcommands!.thread.handler!([rootId], threadOptions);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect((result.data as Message[]).length).toBe(3);
  });

  test('outputs JSON in JSON mode', async () => {
    const sendOptions = createTestOptions({
      channel: testChannelId,
      content: 'JSON thread test',
    } as GlobalOptions & { channel: string; content: string });
    const rootResult = await messageCommand.subcommands!.send.handler!([], sendOptions);
    const rootId = (rootResult.data as Message).id;

    const threadOptions = createTestOptions({ json: true });
    const result = await messageCommand.subcommands!.thread.handler!([rootId], threadOptions);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(Array.isArray(result.data)).toBe(true);
  });

  test('outputs only IDs in quiet mode', async () => {
    const sendOptions = createTestOptions({
      channel: testChannelId,
      content: 'Quiet thread test',
    } as GlobalOptions & { channel: string; content: string });
    const rootResult = await messageCommand.subcommands!.send.handler!([], sendOptions);
    const rootId = (rootResult.data as Message).id;

    const threadOptions = createTestOptions({ quiet: true });
    const result = await messageCommand.subcommands!.thread.handler!([rootId], threadOptions);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(typeof result.data).toBe('string');
    expect(result.data).toMatch(/^el-/);
  });
});

// ============================================================================
// Message Command Structure Tests
// ============================================================================

describe('msg command structure', () => {
  test('has correct name', () => {
    expect(messageCommand.name).toBe('msg');
  });

  test('has description', () => {
    expect(messageCommand.description).toBeDefined();
    expect(messageCommand.description.length).toBeGreaterThan(0);
  });

  test('has usage', () => {
    expect(messageCommand.usage).toBeDefined();
    expect(messageCommand.usage).toContain('msg');
  });

  test('has help text', () => {
    expect(messageCommand.help).toBeDefined();
    expect(messageCommand.help).toContain('immutable');
  });

  test('has send subcommand', () => {
    expect(messageCommand.subcommands).toBeDefined();
    expect(messageCommand.subcommands!.send).toBeDefined();
    expect(messageCommand.subcommands!.send.name).toBe('send');
  });

  test('has list subcommand', () => {
    expect(messageCommand.subcommands).toBeDefined();
    expect(messageCommand.subcommands!.list).toBeDefined();
    expect(messageCommand.subcommands!.list.name).toBe('list');
  });

  test('has thread subcommand', () => {
    expect(messageCommand.subcommands).toBeDefined();
    expect(messageCommand.subcommands!.thread).toBeDefined();
    expect(messageCommand.subcommands!.thread.name).toBe('thread');
  });

  test('returns error for unknown subcommand', async () => {
    const options = createTestOptions();
    const result = await messageCommand.handler!(['unknown'], options);

    expect(result.exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
    expect(result.error).toContain('Unknown subcommand');
  });

  test('returns error when no subcommand provided', async () => {
    const options = createTestOptions();
    const result = await messageCommand.handler!([], options);

    expect(result.exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
    expect(result.error).toContain('Usage');
  });
});

// ============================================================================
// Send Command Options Tests
// ============================================================================

describe('msg send command options', () => {
  test('has --channel option', () => {
    const channelOption = messageCommand.subcommands!.send.options?.find((o) => o.name === 'channel');
    expect(channelOption).toBeDefined();
    expect(channelOption!.short).toBe('c');
    expect(channelOption!.required).toBe(true);
  });

  test('has --content option', () => {
    const contentOption = messageCommand.subcommands!.send.options?.find((o) => o.name === 'content');
    expect(contentOption).toBeDefined();
    expect(contentOption!.short).toBe('m');
  });

  test('has --file option', () => {
    const fileOption = messageCommand.subcommands!.send.options?.find((o) => o.name === 'file');
    expect(fileOption).toBeDefined();
    expect(fileOption!.short).toBe('f');
  });

  test('has --thread option', () => {
    const threadOption = messageCommand.subcommands!.send.options?.find((o) => o.name === 'thread');
    expect(threadOption).toBeDefined();
    expect(threadOption!.short).toBe('t');
  });

  test('has --attachment option', () => {
    const attachmentOption = messageCommand.subcommands!.send.options?.find((o) => o.name === 'attachment');
    expect(attachmentOption).toBeDefined();
    expect(attachmentOption!.short).toBe('a');
  });

  test('has --tag option', () => {
    const tagOption = messageCommand.subcommands!.send.options?.find((o) => o.name === 'tag');
    expect(tagOption).toBeDefined();
  });
});

// ============================================================================
// List Command Options Tests
// ============================================================================

describe('msg list command options', () => {
  test('has --channel option', () => {
    const channelOption = messageCommand.subcommands!.list.options?.find((o) => o.name === 'channel');
    expect(channelOption).toBeDefined();
    expect(channelOption!.short).toBe('c');
    expect(channelOption!.required).toBe(true);
  });

  test('has --sender option', () => {
    const senderOption = messageCommand.subcommands!.list.options?.find((o) => o.name === 'sender');
    expect(senderOption).toBeDefined();
    expect(senderOption!.short).toBe('s');
  });

  test('has --limit option', () => {
    const limitOption = messageCommand.subcommands!.list.options?.find((o) => o.name === 'limit');
    expect(limitOption).toBeDefined();
    expect(limitOption!.short).toBe('l');
  });

  test('has --rootOnly option', () => {
    const rootOnlyOption = messageCommand.subcommands!.list.options?.find((o) => o.name === 'rootOnly');
    expect(rootOnlyOption).toBeDefined();
    expect(rootOnlyOption!.short).toBe('r');
  });
});

// ============================================================================
// Thread Command Options Tests
// ============================================================================

describe('msg thread command options', () => {
  test('has --limit option', () => {
    const limitOption = messageCommand.subcommands!.thread.options?.find((o) => o.name === 'limit');
    expect(limitOption).toBeDefined();
    expect(limitOption!.short).toBe('l');
  });
});

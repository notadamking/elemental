/**
 * Message Commands - Message sending and threading CLI interface
 *
 * Provides CLI commands for message operations:
 * - msg send: Send a message to a channel
 * - msg thread: View thread replies
 * - msg list: List messages in a channel
 */

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Command, GlobalOptions, CommandResult, CommandOption } from '../types.js';
import { success, failure, ExitCode } from '../types.js';
import { getFormatter, getOutputMode } from '../formatter.js';
import { createStorage, initializeSchema } from '../../storage/index.js';
import { createElementalAPI } from '../../api/elemental-api.js';
import {
  createMessage,
  type Message,
  type HydratedMessage,
  type ChannelId,
  type MessageId,
  filterByChannel,
  getThreadMessages,
  sortByCreatedAt,
  isRootMessage,
} from '../../types/message.js';
import {
  createDocument,
  ContentType,
  type DocumentId,
} from '../../types/document.js';
import type { Channel } from '../../types/channel.js';
import { isMember } from '../../types/channel.js';
import type { Element, ElementId, EntityId } from '../../types/element.js';
import type { ElementalAPI } from '../../api/types.js';

// ============================================================================
// Constants
// ============================================================================

const ELEMENTAL_DIR = '.elemental';
const DEFAULT_DB_NAME = 'elemental.db';
const DEFAULT_ACTOR = 'cli-user';

// ============================================================================
// Database Helper
// ============================================================================

function resolveDatabasePath(options: GlobalOptions, requireExists: boolean = true): string | null {
  if (options.db) {
    if (requireExists && !existsSync(options.db)) {
      return null;
    }
    return options.db;
  }

  const elementalDir = join(process.cwd(), ELEMENTAL_DIR);
  if (existsSync(elementalDir)) {
    const dbPath = join(elementalDir, DEFAULT_DB_NAME);
    if (requireExists && !existsSync(dbPath)) {
      return null;
    }
    return dbPath;
  }

  return null;
}

function resolveActor(options: GlobalOptions): EntityId {
  return (options.actor ?? DEFAULT_ACTOR) as EntityId;
}

function createAPI(options: GlobalOptions, createDb: boolean = false): { api: ElementalAPI; error?: string } {
  const dbPath = resolveDatabasePath(options, !createDb);
  if (!dbPath) {
    return {
      api: null as unknown as ElementalAPI,
      error: 'No database found. Run "el init" to initialize a workspace, or specify --db path',
    };
  }

  try {
    const backend = createStorage({ path: dbPath, create: true });
    initializeSchema(backend);
    return { api: createElementalAPI(backend) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      api: null as unknown as ElementalAPI,
      error: `Failed to open database: ${message}`,
    };
  }
}

// ============================================================================
// Message Send Command
// ============================================================================

interface MsgSendOptions {
  channel: string;
  content?: string;
  file?: string;
  thread?: string;
  attachment?: string | string[];
  tag?: string[];
}

const msgSendOptions: CommandOption[] = [
  {
    name: 'channel',
    short: 'c',
    description: 'Channel ID to send to (required)',
    hasValue: true,
    required: true,
  },
  {
    name: 'content',
    short: 'm',
    description: 'Message content (text)',
    hasValue: true,
  },
  {
    name: 'file',
    short: 'f',
    description: 'Read content from file',
    hasValue: true,
  },
  {
    name: 'thread',
    short: 't',
    description: 'Reply to message (thread ID)',
    hasValue: true,
  },
  {
    name: 'attachment',
    short: 'a',
    description: 'Attach document ID (can be repeated)',
    hasValue: true,
  },
  {
    name: 'tag',
    description: 'Add tag (can be repeated)',
    hasValue: true,
  },
];

async function msgSendHandler(
  _args: string[],
  options: GlobalOptions & MsgSendOptions
): Promise<CommandResult> {
  // Must have channel
  if (!options.channel) {
    return failure('--channel is required', ExitCode.INVALID_ARGUMENTS);
  }

  // Must specify either --content or --file
  if (!options.content && !options.file) {
    return failure('Either --content or --file is required', ExitCode.INVALID_ARGUMENTS);
  }

  if (options.content && options.file) {
    return failure('Cannot specify both --content and --file', ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = createAPI(options, true);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    const actor = resolveActor(options);
    const channelId = options.channel as ChannelId;

    // Validate channel exists and sender is a member
    const channel = await api.get<Channel>(channelId as unknown as ElementId);
    if (!channel) {
      return failure(`Channel not found: ${channelId}`, ExitCode.NOT_FOUND);
    }
    if (channel.type !== 'channel') {
      return failure(`Element ${channelId} is not a channel (type: ${channel.type})`, ExitCode.VALIDATION);
    }
    if (!isMember(channel, actor)) {
      return failure(`You are not a member of channel ${channelId}`, ExitCode.PERMISSION);
    }

    // Get content
    let content: string;
    if (options.content) {
      content = options.content;
    } else {
      const filePath = resolve(options.file!);
      if (!existsSync(filePath)) {
        return failure(`File not found: ${filePath}`, ExitCode.NOT_FOUND);
      }
      content = readFileSync(filePath, 'utf-8');
    }

    // Create content document
    const contentDoc = await createDocument({
      content,
      contentType: ContentType.TEXT,
      createdBy: actor,
    });
    const createdContentDoc = await api.create(contentDoc as unknown as Element & Record<string, unknown>);

    // Validate thread parent if specified
    let threadId: MessageId | null = null;
    if (options.thread) {
      const threadParent = await api.get<Message>(options.thread as unknown as ElementId);
      if (!threadParent) {
        return failure(`Thread parent message not found: ${options.thread}`, ExitCode.NOT_FOUND);
      }
      if (threadParent.type !== 'message') {
        return failure(`Element ${options.thread} is not a message (type: ${threadParent.type})`, ExitCode.VALIDATION);
      }
      if (threadParent.channelId !== channelId) {
        return failure(`Thread parent message is in a different channel`, ExitCode.VALIDATION);
      }
      threadId = options.thread as MessageId;
    }

    // Handle attachments
    let attachments: DocumentId[] | undefined;
    if (options.attachment) {
      const attachmentIds = Array.isArray(options.attachment)
        ? options.attachment
        : [options.attachment];
      attachments = [];
      for (const attachmentId of attachmentIds) {
        const attachmentDoc = await api.get(attachmentId as ElementId);
        if (!attachmentDoc) {
          return failure(`Attachment document not found: ${attachmentId}`, ExitCode.NOT_FOUND);
        }
        if (attachmentDoc.type !== 'document') {
          return failure(`Attachment ${attachmentId} is not a document (type: ${attachmentDoc.type})`, ExitCode.VALIDATION);
        }
        attachments.push(attachmentId as DocumentId);
      }
    }

    // Handle tags
    let tags: string[] | undefined;
    if (options.tag) {
      tags = Array.isArray(options.tag) ? options.tag : [options.tag];
    }

    // Create the message
    const message = await createMessage({
      channelId,
      sender: actor,
      contentRef: createdContentDoc.id as unknown as DocumentId,
      attachments,
      threadId,
      tags,
    });

    const createdMessage = await api.create<Message>(
      message as unknown as Message & Record<string, unknown>
    );

    const mode = getOutputMode(options);
    if (mode === 'quiet') {
      return success(createdMessage.id);
    }

    const replyInfo = threadId ? ` (reply to ${threadId})` : '';
    return success(createdMessage, `Sent message ${createdMessage.id} to ${channelId}${replyInfo}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to send message: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

const msgSendCommand: Command = {
  name: 'send',
  description: 'Send a message to a channel',
  usage: 'el msg send --channel <id> --content <text> | --file <path> [options]',
  help: `Send a message to a channel.

Options:
  -c, --channel <id>     Channel to send to (required)
  -m, --content <text>   Message content
  -f, --file <path>      Read content from file
  -t, --thread <id>      Reply to message (creates thread)
  -a, --attachment <id>  Attach document (can be repeated)
      --tag <tag>        Add tag (can be repeated)

Examples:
  el msg send --channel el-abc123 --content "Hello!"
  el msg send -c el-abc123 -m "My message" --tag important
  el msg send -c el-abc123 --file message.txt
  el msg send -c el-abc123 -m "Reply" --thread el-msg456`,
  options: msgSendOptions,
  handler: msgSendHandler as Command['handler'],
};

// ============================================================================
// Message Thread Command
// ============================================================================

interface MsgThreadOptions {
  limit?: string;
}

const msgThreadOptions: CommandOption[] = [
  {
    name: 'limit',
    short: 'l',
    description: 'Maximum number of messages to show',
    hasValue: true,
  },
];

async function msgThreadHandler(
  args: string[],
  options: GlobalOptions & MsgThreadOptions
): Promise<CommandResult> {
  const [messageId] = args;

  if (!messageId) {
    return failure('Usage: el msg thread <message-id>', ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    // Get the root message
    const rootMessage = await api.get<Message>(messageId as ElementId, { hydrate: { content: true } });
    if (!rootMessage) {
      return failure(`Message not found: ${messageId}`, ExitCode.NOT_FOUND);
    }
    if (rootMessage.type !== 'message') {
      return failure(`Element ${messageId} is not a message (type: ${rootMessage.type})`, ExitCode.VALIDATION);
    }

    // Get all messages in the channel
    const allMessages = await api.list<Message>({ type: 'message' });
    const channelMessages = filterByChannel(allMessages, rootMessage.channelId);

    // Get thread messages (root + replies)
    const threadMessages = getThreadMessages(channelMessages, messageId as MessageId);

    // Apply limit
    let messages = threadMessages;
    if (options.limit) {
      const limit = parseInt(options.limit, 10);
      if (isNaN(limit) || limit < 1) {
        return failure('Limit must be a positive number', ExitCode.VALIDATION);
      }
      messages = threadMessages.slice(0, limit);
    }

    // Hydrate content for display
    const hydratedMessages: HydratedMessage[] = [];
    for (const msg of messages) {
      const hydrated = await api.get<HydratedMessage>(msg.id, { hydrate: { content: true } });
      if (hydrated) {
        hydratedMessages.push(hydrated);
      }
    }

    const mode = getOutputMode(options);
    const formatter = getFormatter(mode);

    if (mode === 'json') {
      return success(hydratedMessages);
    }

    if (mode === 'quiet') {
      return success(hydratedMessages.map((m) => m.id).join('\n'));
    }

    if (hydratedMessages.length === 0) {
      return success(null, 'No messages in thread');
    }

    // Build table
    const headers = ['ID', 'SENDER', 'CONTENT', 'CREATED'];
    const rows = hydratedMessages.map((m) => {
      const contentPreview = (m.content ?? '').substring(0, 40);
      const truncated = contentPreview.length < (m.content?.length ?? 0) ? '...' : '';
      return [
        m.id,
        m.sender,
        contentPreview + truncated,
        m.createdAt.split('T')[0],
      ];
    });

    const table = formatter.table(headers, rows);
    const threadInfo = isRootMessage(rootMessage)
      ? 'Root message with'
      : 'Reply to ' + rootMessage.threadId + ' with';
    const summary = `\n${threadInfo} ${hydratedMessages.length - 1} replies`;

    return success(hydratedMessages, table + summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to get thread: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

const msgThreadCommand: Command = {
  name: 'thread',
  description: 'View thread messages',
  usage: 'el msg thread <message-id> [options]',
  help: `View a message thread (root message and all replies).

Arguments:
  message-id   Message identifier (root or any reply)

Options:
  -l, --limit <n>   Maximum messages to show

Examples:
  el msg thread el-msg123
  el msg thread el-msg123 --limit 10`,
  options: msgThreadOptions,
  handler: msgThreadHandler as Command['handler'],
};

// ============================================================================
// Message List Command
// ============================================================================

interface MsgListOptions {
  channel: string;
  sender?: string;
  limit?: string;
  rootOnly?: boolean;
}

const msgListOptions: CommandOption[] = [
  {
    name: 'channel',
    short: 'c',
    description: 'Channel ID to list messages from (required)',
    hasValue: true,
    required: true,
  },
  {
    name: 'sender',
    short: 's',
    description: 'Filter by sender entity ID',
    hasValue: true,
  },
  {
    name: 'limit',
    short: 'l',
    description: 'Maximum number of messages',
    hasValue: true,
  },
  {
    name: 'rootOnly',
    short: 'r',
    description: 'Show only root messages (no replies)',
    hasValue: false,
  },
];

async function msgListHandler(
  _args: string[],
  options: GlobalOptions & MsgListOptions
): Promise<CommandResult> {
  if (!options.channel) {
    return failure('--channel is required', ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    const channelId = options.channel as ChannelId;

    // Validate channel exists
    const channel = await api.get<Channel>(channelId as unknown as ElementId);
    if (!channel) {
      return failure(`Channel not found: ${channelId}`, ExitCode.NOT_FOUND);
    }
    if (channel.type !== 'channel') {
      return failure(`Element ${channelId} is not a channel (type: ${channel.type})`, ExitCode.VALIDATION);
    }

    // Get all messages
    const allMessages = await api.list<Message>({ type: 'message' });

    // Filter by channel
    let messages = filterByChannel(allMessages, channelId);

    // Filter by sender if specified
    if (options.sender) {
      messages = messages.filter((m) => m.sender === options.sender);
    }

    // Filter root-only if specified
    if (options.rootOnly) {
      messages = messages.filter(isRootMessage);
    }

    // Sort by creation time
    messages = sortByCreatedAt(messages);

    // Apply limit
    if (options.limit) {
      const limit = parseInt(options.limit, 10);
      if (isNaN(limit) || limit < 1) {
        return failure('Limit must be a positive number', ExitCode.VALIDATION);
      }
      messages = messages.slice(0, limit);
    }

    // Hydrate content for display
    const hydratedMessages: HydratedMessage[] = [];
    for (const msg of messages) {
      const hydrated = await api.get<HydratedMessage>(msg.id, { hydrate: { content: true } });
      if (hydrated) {
        hydratedMessages.push(hydrated);
      }
    }

    const mode = getOutputMode(options);
    const formatter = getFormatter(mode);

    if (mode === 'json') {
      return success(hydratedMessages);
    }

    if (mode === 'quiet') {
      return success(hydratedMessages.map((m) => m.id).join('\n'));
    }

    if (hydratedMessages.length === 0) {
      return success(null, 'No messages found');
    }

    // Build table
    const headers = ['ID', 'SENDER', 'THREAD', 'CONTENT', 'CREATED'];
    const rows = hydratedMessages.map((m) => {
      const contentPreview = (m.content ?? '').substring(0, 35);
      const truncated = contentPreview.length < (m.content?.length ?? 0) ? '...' : '';
      return [
        m.id,
        m.sender,
        m.threadId ? `→${m.threadId.substring(0, 8)}` : '-',
        contentPreview + truncated,
        m.createdAt.split('T')[0],
      ];
    });

    const table = formatter.table(headers, rows);
    const summary = `\n${hydratedMessages.length} message(s) in channel ${channelId}`;

    return success(hydratedMessages, table + summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to list messages: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

const msgListCommand: Command = {
  name: 'list',
  description: 'List messages in a channel',
  usage: 'el msg list --channel <id> [options]',
  help: `List messages in a channel.

Options:
  -c, --channel <id>   Channel to list messages from (required)
  -s, --sender <id>    Filter by sender entity
  -l, --limit <n>      Maximum messages to show
  -r, --rootOnly       Show only root messages (no replies)

Examples:
  el msg list --channel el-abc123
  el msg list -c el-abc123 --sender el-user456
  el msg list -c el-abc123 --rootOnly --limit 20`,
  options: msgListOptions,
  handler: msgListHandler as Command['handler'],
};

// ============================================================================
// Message Root Command
// ============================================================================

export const messageCommand: Command = {
  name: 'msg',
  description: 'Send and manage messages',
  usage: 'el msg <subcommand> [options]',
  help: `Send and manage messages in channels.

Messages are immutable - once sent, they cannot be edited or deleted.
This ensures a reliable audit trail of all communication.

Subcommands:
  send     Send a message to a channel
  list     List messages in a channel
  thread   View a message thread

Examples:
  el msg send --channel el-abc123 --content "Hello!"
  el msg list --channel el-abc123
  el msg thread el-msg456`,
  subcommands: {
    send: msgSendCommand,
    list: msgListCommand,
    thread: msgThreadCommand,
  },
  handler: async (args, _options): Promise<CommandResult> => {
    if (args.length === 0) {
      return failure(
        `Usage: el msg <subcommand>. Use 'el msg --help' for available subcommands.`,
        ExitCode.INVALID_ARGUMENTS
      );
    }
    return failure(
      `Unknown subcommand: ${args[0]}. Use 'el msg --help' for available subcommands.`,
      ExitCode.INVALID_ARGUMENTS
    );
  },
};

/**
 * Channel Commands - Collection command interface for channels
 *
 * Provides CLI commands for channel operations:
 * - channel create: Create a new channel
 * - channel join: Join a channel
 * - channel leave: Leave a channel
 * - channel list: List channels
 * - channel members: List channel members
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Command, GlobalOptions, CommandResult, CommandOption } from '../types.js';
import { success, failure, ExitCode } from '../types.js';
import { getFormatter, getOutputMode } from '../formatter.js';
import { createStorage, initializeSchema } from '@elemental/storage';
import { createElementalAPI } from '../../api/elemental-api.js';
import {
  createGroupChannel,
  createDirectChannel,
  type Channel,
  type CreateGroupChannelInput,
  type CreateDirectChannelInput,
  ChannelTypeValue,
  VisibilityValue,
  JoinPolicyValue,
  isMember,
} from '@elemental/core';
import type { Element, ElementId, EntityId } from '@elemental/core';
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
// Channel Create Command
// ============================================================================

interface ChannelCreateOptions {
  name?: string;
  type?: string;
  visibility?: string;
  policy?: string;
  member?: string | string[];
  direct?: string;
  tag?: string[];
}

const channelCreateOptions: CommandOption[] = [
  {
    name: 'name',
    short: 'n',
    description: 'Channel name (required for group channels)',
    hasValue: true,
  },
  {
    name: 'type',
    short: 't',
    description: 'Channel type: group (default) or direct',
    hasValue: true,
  },
  {
    name: 'visibility',
    short: 'V',
    description: 'Visibility: public or private (default)',
    hasValue: true,
  },
  {
    name: 'policy',
    short: 'p',
    description: 'Join policy: open, invite-only (default), or request',
    hasValue: true,
  },
  {
    name: 'member',
    short: 'm',
    description: 'Add member (can be repeated)',
    hasValue: true,
    array: true,
  },
  {
    name: 'direct',
    short: 'd',
    description: 'Create direct channel with entity (for --type direct)',
    hasValue: true,
  },
  {
    name: 'tag',
    description: 'Add tag (can be repeated)',
    hasValue: true,
    array: true,
  },
];

async function channelCreateHandler(
  _args: string[],
  options: GlobalOptions & ChannelCreateOptions
): Promise<CommandResult> {
  const channelType = (options.type || 'group') as 'group' | 'direct';

  if (channelType !== 'group' && channelType !== 'direct') {
    return failure(`Invalid channel type: ${channelType}. Must be 'group' or 'direct'`, ExitCode.VALIDATION);
  }

  const { api, error } = createAPI(options, true);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    const actor = resolveActor(options);

    // Handle tags
    let tags: string[] | undefined;
    if (options.tag) {
      tags = Array.isArray(options.tag) ? options.tag : [options.tag];
    }

    let channel: Channel;

    if (channelType === 'direct') {
      if (!options.direct) {
        return failure('--direct <entity-id> is required for direct channels', ExitCode.INVALID_ARGUMENTS);
      }

      const input: CreateDirectChannelInput = {
        entityA: actor,
        entityB: options.direct as EntityId,
        createdBy: actor,
        ...(tags && { tags }),
      };

      channel = await createDirectChannel(input);
    } else {
      if (!options.name) {
        return failure('--name is required for group channels', ExitCode.INVALID_ARGUMENTS);
      }

      // Validate visibility
      const visibility = (options.visibility || 'private') as 'public' | 'private';
      if (!Object.values(VisibilityValue).includes(visibility)) {
        return failure(
          `Invalid visibility: ${visibility}. Must be 'public' or 'private'`,
          ExitCode.VALIDATION
        );
      }

      // Validate join policy
      const joinPolicy = (options.policy || 'invite-only') as 'open' | 'invite-only' | 'request';
      if (!Object.values(JoinPolicyValue).includes(joinPolicy)) {
        return failure(
          `Invalid join policy: ${joinPolicy}. Must be 'open', 'invite-only', or 'request'`,
          ExitCode.VALIDATION
        );
      }

      // Parse members
      let members: EntityId[] | undefined;
      if (options.member) {
        members = (Array.isArray(options.member) ? options.member : [options.member]) as EntityId[];
      }

      const input: CreateGroupChannelInput = {
        name: options.name,
        createdBy: actor,
        visibility,
        joinPolicy,
        ...(members && { members }),
        ...(tags && { tags }),
      };

      channel = await createGroupChannel(input);
    }

    const created = await api.create(channel as unknown as Element & Record<string, unknown>);

    const mode = getOutputMode(options);
    if (mode === 'quiet') {
      return success(created.id);
    }

    return success(created, `Created ${channelType} channel ${created.id}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to create channel: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

const channelCreateCommand: Command = {
  name: 'create',
  description: 'Create a new channel',
  usage: 'el channel create [options]',
  help: `Create a new channel for communication.

Options:
  -n, --name <name>         Channel name (required for group)
  -t, --type <type>         Type: group (default) or direct
  -V, --visibility <vis>    Visibility: public or private (default)
  -p, --policy <policy>     Join policy: open, invite-only (default), request
  -m, --member <entity>     Add member (can be repeated)
  -d, --direct <entity>     Create direct channel with entity
      --tag <tag>           Add tag (can be repeated)

Examples:
  el channel create --name general
  el channel create -n announcements -V public -p open
  el channel create --type direct --direct el-user123
  el channel create -n team -m el-user1 -m el-user2`,
  options: channelCreateOptions,
  handler: channelCreateHandler as Command['handler'],
};

// ============================================================================
// Channel Join Command
// ============================================================================

async function channelJoinHandler(
  args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  const [id] = args;

  if (!id) {
    return failure('Usage: el channel join <id>', ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    const actor = resolveActor(options);
    const channel = await api.get<Channel>(id as ElementId);

    if (!channel) {
      return failure(`Channel not found: ${id}`, ExitCode.NOT_FOUND);
    }

    if (channel.type !== 'channel') {
      return failure(`Element ${id} is not a channel (type: ${channel.type})`, ExitCode.VALIDATION);
    }

    if (channel.channelType === ChannelTypeValue.DIRECT) {
      return failure('Cannot join a direct channel', ExitCode.VALIDATION);
    }

    if (isMember(channel, actor)) {
      return success(channel, `Already a member of channel ${id}`);
    }

    // Check join policy
    if (channel.permissions.joinPolicy === JoinPolicyValue.INVITE_ONLY) {
      return failure('Channel is invite-only. Ask a moderator to add you.', ExitCode.VALIDATION);
    }

    if (channel.permissions.joinPolicy === JoinPolicyValue.OPEN &&
        channel.permissions.visibility !== VisibilityValue.PUBLIC) {
      return failure('Channel is private. Cannot join without invitation.', ExitCode.VALIDATION);
    }

    // Add actor to members
    const newMembers = [...channel.members, actor];
    const updated = await api.update<Channel>(
      id as ElementId,
      { members: newMembers },
      { actor }
    );

    return success(updated, `Joined channel ${id}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to join channel: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

const channelJoinCommand: Command = {
  name: 'join',
  description: 'Join a channel',
  usage: 'el channel join <id>',
  help: `Join a channel.

Only works for group channels with open or request join policy.
Direct channels and invite-only channels cannot be joined directly.

Arguments:
  id    Channel identifier

Examples:
  el channel join el-abc123`,
  handler: channelJoinHandler as Command['handler'],
};

// ============================================================================
// Channel Leave Command
// ============================================================================

async function channelLeaveHandler(
  args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  const [id] = args;

  if (!id) {
    return failure('Usage: el channel leave <id>', ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    const actor = resolveActor(options);
    const result = await api.leaveChannel(id as ElementId, actor);
    return success(result.channel, `Left channel ${id}`);
  } catch (err) {
    // Handle specific error cases with user-friendly messages
    if (err instanceof Error) {
      if (err.message.includes('not found')) {
        return failure(`Channel not found: ${id}`, ExitCode.NOT_FOUND);
      }
      if (err.message.includes('not a channel')) {
        return failure(`Element ${id} is not a channel`, ExitCode.VALIDATION);
      }
      if (err.message.includes('Cannot leave a direct channel')) {
        return failure('Cannot leave a direct channel', ExitCode.VALIDATION);
      }
      if (err.message.includes('not a member')) {
        // Not an error - just inform the user
        const channel = await api.get<Channel>(id as ElementId);
        return success(channel, `Not a member of channel ${id}`);
      }
    }
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to leave channel: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

const channelLeaveCommand: Command = {
  name: 'leave',
  description: 'Leave a channel',
  usage: 'el channel leave <id>',
  help: `Leave a channel.

Only works for group channels. Direct channels cannot be left.

Arguments:
  id    Channel identifier

Examples:
  el channel leave el-abc123`,
  handler: channelLeaveHandler as Command['handler'],
};

// ============================================================================
// Channel List Command
// ============================================================================

interface ChannelListOptions {
  type?: string;
  member?: string;
  limit?: string;
}

const channelListOptions: CommandOption[] = [
  {
    name: 'type',
    short: 't',
    description: 'Filter by type: group or direct',
    hasValue: true,
  },
  {
    name: 'member',
    short: 'm',
    description: 'Filter by member entity',
    hasValue: true,
  },
  {
    name: 'limit',
    short: 'l',
    description: 'Maximum number of results',
    hasValue: true,
  },
];

async function channelListHandler(
  _args: string[],
  options: GlobalOptions & ChannelListOptions
): Promise<CommandResult> {
  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    // Build filter
    const filter: Record<string, unknown> = {
      type: 'channel',
    };

    // Limit
    if (options.limit) {
      const limit = parseInt(options.limit, 10);
      if (isNaN(limit) || limit < 1) {
        return failure('Limit must be a positive number', ExitCode.VALIDATION);
      }
      filter.limit = limit;
    }

    const result = await api.listPaginated<Channel>(filter);

    // Post-filter
    let items = result.items;

    // Type filter
    if (options.type) {
      if (options.type !== 'group' && options.type !== 'direct') {
        return failure(
          `Invalid type: ${options.type}. Must be 'group' or 'direct'`,
          ExitCode.VALIDATION
        );
      }
      items = items.filter((c) => c.channelType === options.type);
    }

    // Member filter
    if (options.member) {
      items = items.filter((c) => c.members.includes(options.member as EntityId));
    }

    const mode = getOutputMode(options);
    const formatter = getFormatter(mode);

    if (mode === 'json') {
      return success(items);
    }

    if (mode === 'quiet') {
      return success(items.map((c) => c.id).join('\n'));
    }

    if (items.length === 0) {
      return success(null, 'No channels found');
    }

    // Build table
    const headers = ['ID', 'NAME', 'TYPE', 'MEMBERS', 'VISIBILITY', 'CREATED'];
    const rows = items.map((c) => [
      c.id,
      c.name.length > 25 ? c.name.substring(0, 22) + '...' : c.name,
      c.channelType,
      String(c.members.length),
      c.permissions.visibility,
      c.createdAt.split('T')[0],
    ]);

    const table = formatter.table(headers, rows);
    const summary = `\nShowing ${items.length} of ${result.total} channels`;

    return success(items, table + summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to list channels: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

const channelListCommand: Command = {
  name: 'list',
  description: 'List channels',
  usage: 'el channel list [options]',
  help: `List channels with optional filtering.

Options:
  -t, --type <type>      Filter by type: group or direct
  -m, --member <entity>  Filter by member entity
  -l, --limit <n>        Maximum results

Examples:
  el channel list
  el channel list --type group
  el channel list --member el-user123`,
  options: channelListOptions,
  handler: channelListHandler as Command['handler'],
};

// ============================================================================
// Channel Members Command
// ============================================================================

async function channelMembersHandler(
  args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  const [id] = args;

  if (!id) {
    return failure('Usage: el channel members <id>', ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    const channel = await api.get<Channel>(id as ElementId);

    if (!channel) {
      return failure(`Channel not found: ${id}`, ExitCode.NOT_FOUND);
    }

    if (channel.type !== 'channel') {
      return failure(`Element ${id} is not a channel (type: ${channel.type})`, ExitCode.VALIDATION);
    }

    const members = channel.members;
    const modifiers = channel.permissions.modifyMembers;

    const mode = getOutputMode(options);
    const formatter = getFormatter(mode);

    if (mode === 'json') {
      return success({ members, modifiers, count: members.length });
    }

    if (mode === 'quiet') {
      return success(members.join('\n'));
    }

    if (members.length === 0) {
      return success({ members: [], count: 0 }, 'No members');
    }

    // Build table
    const headers = ['MEMBER', 'ROLE'];
    const rows = members.map((m) => [
      m,
      modifiers.includes(m) ? 'moderator' : 'member',
    ]);

    const table = formatter.table(headers, rows);
    return success(
      { members, modifiers, count: members.length },
      table + `\n${members.length} member(s)`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to list members: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

const channelMembersCommand: Command = {
  name: 'members',
  description: 'List channel members',
  usage: 'el channel members <id>',
  help: `List members of a channel.

Arguments:
  id    Channel identifier

Examples:
  el channel members el-abc123`,
  handler: channelMembersHandler as Command['handler'],
};

// ============================================================================
// Channel Add Command
// ============================================================================

async function channelAddHandler(
  args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  const [id, entityId] = args;

  if (!id || !entityId) {
    return failure('Usage: el channel add <channel-id> <entity-id>', ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    const actor = resolveActor(options);
    const result = await api.addChannelMember(id as ElementId, entityId as EntityId, { actor });

    if (result.success) {
      return success(result.channel, `Added ${entityId} to channel ${id}`);
    }
    return failure(`Failed to add member`, ExitCode.GENERAL_ERROR);
  } catch (err) {
    // Handle specific error cases with user-friendly messages
    if (err instanceof Error) {
      if (err.message.includes('not found')) {
        return failure(`Channel not found: ${id}`, ExitCode.NOT_FOUND);
      }
      if (err.message.includes('not a channel')) {
        return failure(`Element ${id} is not a channel`, ExitCode.VALIDATION);
      }
      if (err.message.includes('direct channel')) {
        return failure('Cannot modify members of a direct channel', ExitCode.VALIDATION);
      }
      if (err.message.includes('Cannot modify members')) {
        return failure('You do not have permission to add members to this channel', ExitCode.PERMISSION);
      }
    }
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to add member: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

const channelAddCommand: Command = {
  name: 'add',
  description: 'Add a member to a channel',
  usage: 'el channel add <channel-id> <entity-id>',
  help: `Add a member to a group channel.

Only group channels support adding members. Direct channels have fixed membership.
You must have permission to modify members (be in the modifyMembers list).

Arguments:
  channel-id    Channel identifier
  entity-id     Entity to add as member

Examples:
  el channel add el-abc123 el-user456`,
  handler: channelAddHandler as Command['handler'],
};

// ============================================================================
// Channel Remove Command
// ============================================================================

async function channelRemoveHandler(
  args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  const [id, entityId] = args;

  if (!id || !entityId) {
    return failure('Usage: el channel remove <channel-id> <entity-id>', ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    const actor = resolveActor(options);
    const result = await api.removeChannelMember(id as ElementId, entityId as EntityId, { actor });

    if (result.success) {
      return success(result.channel, `Removed ${entityId} from channel ${id}`);
    }
    return failure(`Failed to remove member`, ExitCode.GENERAL_ERROR);
  } catch (err) {
    // Handle specific error cases with user-friendly messages
    if (err instanceof Error) {
      if (err.message.includes('not found')) {
        return failure(`Channel not found: ${id}`, ExitCode.NOT_FOUND);
      }
      if (err.message.includes('not a channel')) {
        return failure(`Element ${id} is not a channel`, ExitCode.VALIDATION);
      }
      if (err.message.includes('direct channel')) {
        return failure('Cannot modify members of a direct channel', ExitCode.VALIDATION);
      }
      if (err.message.includes('not a member')) {
        return failure(`${entityId} is not a member of this channel`, ExitCode.VALIDATION);
      }
      if (err.message.includes('Cannot modify members')) {
        return failure('You do not have permission to remove members from this channel', ExitCode.PERMISSION);
      }
    }
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to remove member: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

const channelRemoveCommand: Command = {
  name: 'remove',
  description: 'Remove a member from a channel',
  usage: 'el channel remove <channel-id> <entity-id>',
  help: `Remove a member from a group channel.

Only group channels support removing members. Direct channels have fixed membership.
You must have permission to modify members (be in the modifyMembers list).

Arguments:
  channel-id    Channel identifier
  entity-id     Entity to remove

Examples:
  el channel remove el-abc123 el-user456`,
  handler: channelRemoveHandler as Command['handler'],
};

// ============================================================================
// Channel Root Command
// ============================================================================

export const channelCommand: Command = {
  name: 'channel',
  description: 'Manage channels (message containers)',
  usage: 'el channel <subcommand> [options]',
  help: `Manage channels - containers for messages between entities.

Channels support both direct messaging (1:1) and group conversations.
Group channels have configurable visibility and join policies.

Subcommands:
  create    Create a new channel
  join      Join a channel
  leave     Leave a channel
  list      List channels
  members   List channel members
  add       Add a member to a channel
  remove    Remove a member from a channel

Examples:
  el channel create --name general
  el channel list --member el-user123
  el channel join el-abc123
  el channel members el-abc123
  el channel add el-abc123 el-user456
  el channel remove el-abc123 el-user456`,
  subcommands: {
    create: channelCreateCommand,
    join: channelJoinCommand,
    leave: channelLeaveCommand,
    list: channelListCommand,
    members: channelMembersCommand,
    add: channelAddCommand,
    remove: channelRemoveCommand,
  },
  handler: async (args, options): Promise<CommandResult> => {
    // Default to list if no subcommand
    if (args.length === 0) {
      return channelListHandler(args, options);
    }
    return failure(
      `Unknown subcommand: ${args[0]}. Use 'el channel --help' for available subcommands.`,
      ExitCode.INVALID_ARGUMENTS
    );
  },
};

# Channel Type Specification

Channels are containers for messages between entities, organizing communication into logical groups. They support both direct messaging (1:1) and group conversations with configurable membership and permissions.

## Purpose

Channels provide:
- Message organization and grouping
- Direct messaging between two entities
- Group conversations for multiple entities
- Membership management with permissions
- Visibility and access control

## Properties

### Content

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `name` | `string` | Yes | Channel name (unique constraints vary) |
| `descriptionRef` | `DocumentId` | No | Reference to description Document |

### Channel Type

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `channelType` | `ChannelType` | Yes | `direct` or `group` |

### Membership

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `members` | `EntityId[]` | Yes | Current channel members |

### Permissions

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `permissions` | `ChannelPermissions` | Yes | Access control settings |

## Channel Types

### Direct Channels

One-on-one communication between exactly two entities:

| Aspect | Behavior |
|--------|----------|
| Members | Exactly 2, immutable |
| Name | Deterministic: sorted names joined |
| Creation | Automatic on first message |
| Visibility | Always private |
| Join Policy | Always invite-only |

### Group Channels

Multi-entity conversations:

| Aspect | Behavior |
|--------|----------|
| Members | 2 or more, dynamic |
| Name | User-defined, unique per visibility scope |
| Creation | Explicit via API |
| Visibility | Configurable |
| Join Policy | Configurable |

## Permissions

### ChannelPermissions Structure

| Property | Type | Description |
|----------|------|-------------|
| `visibility` | `Visibility` | Who can discover the channel |
| `joinPolicy` | `JoinPolicy` | How entities join |
| `modifyMembers` | `EntityId[]` | Who can add/remove members |

### Visibility

| Value | Description |
|-------|-------------|
| `public` | Discoverable by all entities |
| `private` | Only visible to members |

### Join Policy

| Value | Description |
|-------|-------------|
| `open` | Anyone can join (if public) |
| `invite-only` | Must be added by modifier |
| `request` | Can request, modifier approves |

## Direct Channel Naming

Direct channels have deterministic names:

### Algorithm

1. Take both entity names
2. Sort alphabetically
3. Join with colon separator

### Examples

- Alice and Bob: `alice:bob`
- Agent-1 and Human-Bob: `agent-1:human-bob`

### Uniqueness

The deterministic name ensures:
- Only one direct channel per entity pair
- Idempotent creation (find or create)
- Easy lookup by participant names

## Membership Operations

### Add Member

1. Verify actor has permission (in `modifyMembers`)
2. Verify entity exists
3. Add entity to `members` array
4. Emit `member_added` event

### Remove Member

1. Verify actor has permission
2. Verify entity is current member
3. Remove entity from `members` array
4. Emit `member_removed` event
5. Note: Cannot remove from direct channels

### Join (Open/Request)

For open channels:
1. Verify channel is public
2. Verify join policy is `open`
3. Add self to members

For request channels:
1. Verify channel allows requests
2. Create join request (via separate mechanism)
3. Wait for approval from modifier

### Leave

1. Verify entity is member
2. Remove self from members
3. Note: Cannot leave direct channels

## Message Sending

To send a message to a channel:

1. Verify sender is channel member
2. Create message with channel ID
3. Message inherits channel visibility

### Non-member Sending

Non-members cannot send to a channel:
- API rejects with permission error
- Even for public channels (must join first)

## Channel Queries

### List Channels

- All channels (with access)
- Channels by member
- Channels by visibility
- Direct channels for entity

### Get Messages

- Messages in channel, ordered by time
- Threads in channel
- Messages from specific sender

### Search

- Search channels by name
- Search messages in channel

## Direct Channel Auto-Creation

When entity A messages entity B for the first time:

1. Check if direct channel exists
2. If not, create channel:
   - Name: sorted names joined
   - Type: direct
   - Members: [A, B]
   - Permissions: private, invite-only
3. Send message to channel

This makes direct messaging simple:
- Just specify recipient
- Channel created automatically
- Subsequent messages use same channel

## Implementation Methodology

### Storage

Channels stored in `elements` table:
- `type = 'channel'`
- Type-specific fields in JSON `data`
- Members stored as JSON array
- Permissions stored as JSON object

### Member Indexing

For efficient membership queries:
- Option 1: Query JSON array (simple, slower)
- Option 2: Separate membership table (complex, faster)

Initial implementation: JSON array with application-level indexing.

### Direct Channel Lookup

Finding existing direct channel:
1. Compute deterministic name
2. Query by name and type='channel' and channelType='direct'
3. Return if exists, null otherwise

### Permission Checking

Before channel operations:
1. Load channel
2. Check operation against permissions
3. Verify actor eligibility
4. Proceed or reject

## Implementation Checklist

### Phase 1: Type Definitions
- [x] Define `Channel` interface extending `Element`
- [x] Define `ChannelType` union (`direct`, `group`)
- [x] Define `ChannelPermissions` interface
- [x] Define `Visibility` (`public`, `private`) and `JoinPolicy` (`open`, `invite-only`, `request`) unions
- [x] Create type guards (`isChannel`, `isDirectChannel`, `isGroupChannel`, `validateChannel`)
- [x] Create validation functions for all field types
- [x] Implement `createGroupChannel` factory function
- [x] Implement `createDirectChannel` factory function with deterministic naming
- [x] Implement utility functions (membership checks, filters, sorting, grouping)
- [x] Implement error classes (`DirectChannelMembershipError`, `NotAMemberError`, `CannotModifyMembersError`)
- [x] Unit tests - 153 tests covering all Phase 1 functionality

### Phase 2: Direct Channels
- [x] Implement deterministic naming (`generateDirectChannelName`, `parseDirectChannelName`)
- [x] Implement find-or-create logic (`api.findOrCreateDirectChannel`)
- [x] Implement immutable membership (direct channels have empty `modifyMembers`)
- [x] Add direct channel queries (`findDirectChannel`, `getDirectChannelsForEntity`, `filterDirectChannels`)

### Phase 3: Group Channels
- [x] Implement channel creation (`createGroupChannel`)
- [x] Implement name uniqueness (scoped by visibility in `ElementalAPI.create`)
- [x] Implement permission configuration (visibility, joinPolicy, modifyMembers)

### Phase 4: Membership
- [x] Implement add member (`api.addChannelMember`)
- [x] Implement remove member (`api.removeChannelMember`)
- [x] Implement join policy checking (`canJoin` utility)
- [x] Implement leave (`api.leaveChannel`)
- [x] Add membership events (`member_added`, `member_removed`)

### Phase 5: Permissions
- [x] Implement visibility checking (`isPublicChannel`, `isPrivateChannel`)
- [x] Implement join policy enforcement (`canJoin`)
- [x] Implement modifier validation (`canModifyMembers`)

### Phase 6: Message Integration
- [x] Validate sender membership (`api.create` validates sender is channel member before creating message)
- [x] Implement direct message helper (`api.sendDirectMessage(sender, input)` convenience method)
- [x] Auto-create direct channels (sendDirectMessage uses findOrCreateDirectChannel)

### Phase 7: Queries
- [x] Implement channel listing utilities (filters, sorting)
- [x] Implement member-based queries (`filterByMember`, `getDirectChannelsForEntity`)
- [x] Implement channel search (`api.searchChannels` with storage layer support)

### Phase 8: CLI Commands
- [x] channel create
- [x] channel join
- [x] channel leave
- [x] channel list
- [x] channel members
- [x] channel add (add member)
- [x] channel remove (remove member)

### Phase 9: Testing
- [x] Unit tests for direct naming
- [x] Unit tests for permissions
- [x] Integration tests for membership (`channel-membership.integration.test.ts`)
- [x] E2E tests for messaging flow (`message.test.ts` - E2E sections)

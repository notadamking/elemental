# Message Type Specification

Messages represent persistent, immutable communication between entities within Elemental. They function similarly to email - once sent, they cannot be edited or deleted, providing a reliable audit trail of all communication.

## Purpose

Messages provide:
- Persistent communication between agents and humans
- Immutable record of all exchanges
- Threading for conversation organization
- Attachment support via Document references
- Channel-based organization

## Properties

### Location

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `channelId` | `ChannelId` | Yes | Channel containing this message |

### Sender

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `sender` | `EntityId` | Yes | Entity that sent the message |

### Content

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `contentRef` | `DocumentId` | Yes | Reference to content Document |
| `attachments` | `DocumentId[]` | Yes | References to attachment Documents |

### Threading

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `threadId` | `MessageId` | No | Parent message for threading |

## Immutability

Messages are immutable once created:

1. **No Updates**: API rejects all update operations on messages
2. **No Deletes**: API rejects all delete operations on messages
3. **Timestamp Equality**: `updatedAt` always equals `createdAt`
4. **Corrections**: To correct a message, send a new message referencing the original

### Rationale

Immutability ensures:
- Complete audit trail of all communication
- No retroactive modification of context
- Trust in message authenticity
- Reliable threading (parent messages never disappear)

## Threading Model

Messages support threading via `threadId`:

- **Root Message**: `threadId` is null
- **Reply**: `threadId` points to any message in the same channel
- **Thread Depth**: Unlimited (but UI may flatten)
- **Thread Reference**: Via `replies-to` dependency type

### Thread Integrity

- Cannot reply to a message in a different channel
- Cannot change `threadId` after creation
- Thread parent always exists (referential integrity)

## Content Model

Message content is stored separately as a Document:

- **contentRef**: Required, points to a Document
- **Content Types**: text, markdown, or json
- **Versioning**: Content Documents are versioned, but Message reference is immutable

This separation allows:
- Efficient message listing without loading content
- Content hydration on demand
- Consistent handling with other Document usages

## Attachments

Attachments are additional Documents associated with the message:

- Stored as array of DocumentIds
- Can reference any Document (existing or newly created)
- Attachment Documents are versioned independently
- No limit on attachment count (practical limits via validation)

### Attachment Patterns

- **Inline Documents**: Create new Documents specifically for the message
- **Reference Documents**: Attach existing Documents from Libraries
- **Mixed**: Combination of new and existing Documents

## Entity Mentions

Messages support `@entity-name` mentions to tag entities within message content.

### Mention Format

**Pattern**: `@entity-name` where name matches `/^[a-zA-Z][a-zA-Z0-9_-]*$/`

Mentions are parsed from the message content document and create `mentions` dependencies.

### Mention Processing

When a message is created:
1. Fetch content document by `contentRef`
2. Parse content for `@entity-name` patterns
3. Look up each mentioned name → EntityId
4. For valid mentions:
   - Create `mentions` dependency: message → entity
   - Create inbox item for that entity (source: `mention`)
5. Invalid mentions (non-existent entities) are silently ignored

### Message Extension

```typescript
interface Message extends Element {
  // ... existing fields
  readonly mentions?: readonly EntityId[];  // Denormalized for quick access
}
```

The `mentions` array is populated during message creation for efficient queries.

### Mention Queries

- `getMessagesTagging(entityId)` - Messages that mention an entity
- `getMentionedEntities(messageId)` - Entities mentioned in a message

## Hydration

Messages support hydration of Document references:

| Reference | Hydrated Field |
|-----------|----------------|
| `contentRef` | `content` |
| `attachments` | `attachmentContents` |

Hydration is opt-in per query.

## Channel Association

Every message belongs to exactly one channel:

- Message cannot exist without a channel
- Channel must exist before message creation
- Sender must be a member of the channel
- Message inherits channel visibility

## Sender Validation

The `sender` field is validated:

- Must reference a valid Entity
- Entity must be a member of the channel
- In soft identity mode: any entity name accepted
- In cryptographic mode: signature verified against sender's public key

## Query Patterns

Common message queries:

1. **Channel Messages**: All messages in a channel, ordered by creation
2. **Thread Messages**: All messages in a thread, ordered by creation
3. **Entity Messages**: All messages from a specific sender
4. **Recent Messages**: Latest messages across channels
5. **Search**: Full-text search within message content

## Implementation Methodology

### Storage

Messages stored in `elements` table with:
- `type = 'message'`
- Type-specific fields in JSON `data` column
- Indexed fields: channelId, sender, threadId, createdAt

### Immutability Enforcement

At API layer:
1. `update()` rejects with `IMMUTABLE` error for messages
2. `delete()` rejects with `IMMUTABLE` error for messages
3. Direct SQL updates blocked via triggers (optional)

### Creation Flow

1. Validate channel exists
2. Validate sender is channel member
3. Validate contentRef points to valid Document
4. Validate all attachments point to valid Documents
5. Validate threadId (if present) points to message in same channel
6. Generate message ID
7. Create message record
8. Emit `created` event

### Thread Query

To fetch a thread:
1. Start with thread root message
2. Query all messages with matching threadId
3. Recursively include messages replying to those messages
4. Order by createdAt

## Implementation Checklist

### Phase 1: Type Definitions
- [x] Define `Message` interface extending `Element`
- [x] Define `HydratedMessage` interface
- [x] Create type guards for Message validation
- [x] Define MessageId, ChannelId branded types
- [x] Implement createMessage factory function
- [x] Implement validation functions (isValidChannelId, validateChannelId, isValidMessageId, validateMessageId, isValidThreadId, validateThreadId, isValidAttachments, validateAttachments)
- [x] Implement utility functions (isRootMessage, isReply, hasAttachments, getAttachmentCount, isSentBy, isInChannel, isInThread)
- [x] Implement filter functions (filterByChannel, filterBySender, filterByThread, filterRootMessages, filterReplies)
- [x] Implement sort functions (sortByCreatedAt, sortByCreatedAtDesc)
- [x] Implement grouping functions (groupByChannel, groupBySender, getThreadMessages)
- [x] Unit tests - 109 tests covering all Phase 1 functionality

### Phase 2: Immutability
- [x] Implement update rejection for messages (rejectMessageUpdate)
- [x] Implement delete rejection for messages (rejectMessageDelete)
- [x] Implement MessageImmutableError class
- [x] Implement verifyImmutabilityConstraint function
- [x] Add immutability tests

### Phase 3: Validation
- [x] Validate channel membership on send
- [x] Validate Document references (contentRef, attachments)
- [x] Validate thread parent in same channel

### Phase 4: Threading
- [x] Implement thread query (getThreadMessages utility)
- [x] Implement `replies-to` dependency creation (integrated in ElementalAPI.create())
- [x] Add thread integrity constraints

### Phase 5: Hydration
- [x] Implement content hydration
- [x] Implement attachments hydration
- [x] Add batch hydration for message lists

### Phase 6: Queries
- [x] Implement channel message listing (filterByChannel utility)
- [x] Implement thread listing (filterByThread, getThreadMessages utilities)
- [x] Implement sender-based queries (filterBySender utility)
- [x] Add pagination support (MessageFilter interface with channelId, sender, threadId, hasAttachments filters)

### Phase 7: Integration
- [x] Integrate with Channel system (channel existence validation, sender membership validation, sendDirectMessage helper, findOrCreateDirectChannel - 26 integration tests in message-integration.test.ts)
- [x] Integrate with event system (created events on message creation, dependency_added events for thread replies)
- [x] Add CLI commands (send, list, thread)

### Phase 8: Testing
- [x] Unit tests for immutability enforcement
- [x] Unit tests for validation
- [x] Integration tests for threading
- [x] E2E tests for message flows (CLI tests: Direct Messaging Flow, Group Channel Messaging Flow, Threaded Conversation Flow, Channel Lifecycle with Messaging, Messaging Output Formats)

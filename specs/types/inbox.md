# Inbox Type Specification

The inbox system tracks messages sent to entities, providing a centralized view of communications directed at or mentioning an entity.

## Purpose

The inbox provides:
- Centralized message tracking for each entity
- Read/unread status management
- Message source tracking (direct vs mention)
- Quick access to relevant communications
- Unread count for notifications

## Inbox Item Structure

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `string` | Yes | Unique inbox item identifier |
| `recipientId` | `EntityId` | Yes | Entity receiving the message |
| `messageId` | `MessageId` | Yes | Reference to the message |
| `channelId` | `ChannelId` | Yes | Channel containing the message |
| `sourceType` | `InboxSourceType` | Yes | How message arrived (direct/mention) |
| `status` | `InboxStatus` | Yes | Read status |
| `readAt` | `Timestamp` | No | When item was marked read |
| `createdAt` | `Timestamp` | Yes | When inbox item was created |

### Source Types

| Type | Description |
|------|-------------|
| `direct` | Message in a direct (1:1) channel where entity is a member |
| `mention` | Message explicitly tagged the entity with @name |

### Status Values

| Status | Description |
|--------|-------------|
| `unread` | Item has not been read |
| `read` | Item has been marked as read |
| `archived` | Item has been archived (hidden from default view) |

## Inbox Creation Rules

| Scenario | Recipient | Source Type |
|----------|-----------|-------------|
| Direct message | Other member of direct channel | `direct` |
| @mention in any channel | Mentioned entity | `mention` |
| Group message (no mention) | No inbox item | - |

**Note**: Group channel messages only create inbox items when the message explicitly @mentions an entity.

## Hydrated Inbox Item

```typescript
interface HydratedInboxItem extends InboxItem {
  message?: Message;       // Full message details
  channel?: Channel;       // Channel information
  sender?: Entity;         // Message sender
}
```

## Database Schema

```sql
CREATE TABLE inbox_items (
    id TEXT PRIMARY KEY,
    recipient_id TEXT NOT NULL,
    message_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    source_type TEXT NOT NULL CHECK (source_type IN ('direct', 'mention')),
    status TEXT NOT NULL DEFAULT 'unread' CHECK (status IN ('unread', 'read', 'archived')),
    read_at TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (message_id) REFERENCES elements(id) ON DELETE CASCADE,
    UNIQUE(recipient_id, message_id)
);

CREATE INDEX idx_inbox_recipient_status ON inbox_items(recipient_id, status);
CREATE INDEX idx_inbox_recipient_created ON inbox_items(recipient_id, created_at DESC);
CREATE INDEX idx_inbox_message ON inbox_items(message_id);
```

## InboxService API

### Create

```typescript
addToInbox(input: CreateInboxItemInput): InboxItem
```

### Read

```typescript
getInbox(recipientId: EntityId, filter?: InboxFilter): InboxItem[]
getInboxPaginated(recipientId: EntityId, filter?: InboxFilter): ListResult<InboxItem>
getUnreadCount(recipientId: EntityId): number
getInboxItem(id: string): InboxItem | null
```

### Update

```typescript
markAsRead(itemId: string, actor: EntityId): InboxItem
markAsUnread(itemId: string, actor: EntityId): InboxItem
markAllAsRead(recipientId: EntityId, actor: EntityId): number
archive(itemId: string, actor: EntityId): InboxItem
```

### Query

```typescript
getInboxByChannel(recipientId: EntityId, channelId: ChannelId): InboxItem[]
```

### Filter Options

```typescript
interface InboxFilter {
  status?: InboxStatus | InboxStatus[];
  sourceType?: InboxSourceType | InboxSourceType[];
  channelId?: ChannelId;
  after?: Timestamp;
  before?: Timestamp;
  limit?: number;
  offset?: number;
}
```

## CLI Commands

```bash
# List inbox (entity required, unread by default)
el inbox <entity-id|entity-name> [--all] [--status unread|read|archived] [--limit N]

# Mark item as read
el inbox read <item-id>

# Mark all as read for an entity
el inbox read-all <entity-id|entity-name>

# Mark item as unread
el inbox unread <item-id>

# Archive item
el inbox archive <item-id>

# Count unread for an entity
el inbox count <entity-id|entity-name>
```

**Note**: Entity can be specified by ID (`el-abc123`) or by name (`alice`).

## Web Platform Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/entities/:id/inbox` | Get entity's inbox |
| GET | `/api/entities/:id/inbox/count` | Get unread count |
| PATCH | `/api/inbox/:itemId` | Update status (read/unread/archive) |
| POST | `/api/inbox/mark-all-read` | Mark all as read |

## Implementation Checklist

### Phase 1: Type Definitions
- [ ] Define `InboxItem` interface
- [ ] Define `InboxSourceType` and `InboxStatus` enums
- [ ] Define `InboxFilter` interface
- [ ] Define `HydratedInboxItem` interface
- [ ] Create type guards (isInboxItem, isValidInboxStatus, etc.)
- [ ] Create validators
- [ ] Unit tests

### Phase 2: Database Schema
- [ ] Add migration for `inbox_items` table
- [ ] Add indexes for efficient queries
- [ ] Migration tests

### Phase 3: InboxService
- [ ] Implement CRUD operations
- [ ] Implement query methods
- [ ] Implement status updates
- [ ] Integration tests

### Phase 4: Message Integration
- [ ] Hook into message creation
- [ ] Parse @mentions and create inbox items
- [ ] Create direct message inbox items
- [ ] Integration tests

### Phase 5: CLI Commands
- [ ] Implement `el inbox` commands
- [ ] Support entity lookup by name or ID
- [ ] CLI tests

### Phase 6: Web Platform
- [ ] Add API endpoints
- [ ] Add WebSocket events for real-time updates
- [ ] Create inbox UI components
- [ ] Playwright tests

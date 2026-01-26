# Collection Types

Collections organize and contain other elements.

---

## Plan
**File**: `src/types/plan.ts`

Key interfaces:
- `Plan` - Collection of tasks toward a goal
- `PlanStatus` - `'draft' | 'active' | 'completed' | 'cancelled'`

Key functions:
- `createPlan(input)` - Factory function
- `isPlan(element)` - Type guard

**Usage:**
- Contains tasks via `parent-child` dependencies
- Tracks overall progress via child task statuses

**Canonical example**: `src/types/plan.test.ts`

---

## Workflow
**File**: `src/types/workflow.ts`

Key interfaces:
- `Workflow` - Executable task sequence
- `WorkflowStatus` - `'pending' | 'running' | 'completed' | 'failed' | 'cancelled'`

Key functions:
- `createWorkflow(input)` - Factory function
- `isWorkflow(element)` - Type guard
- `squashWorkflow(workflow)` - Merge into parent

**Related files:**
- `src/types/workflow-ops.ts` - Ephemeral workflow operations, garbage collection
- `src/types/workflow-pour.ts` - Instantiate workflow from playbook

**Canonical example**: `src/types/workflow.test.ts`

---

## Channel
**File**: `src/types/channel.ts`

Key interfaces:
- `Channel` - Communication channel
- `ChannelType` - `'direct' | 'group'`

Key functions:
- `createChannel(input)` - Factory function
- `isChannel(element)` - Type guard

**Usage:**
- Contains messages via `channelId` reference
- Members tracked via `memberIds` array

**Canonical example**: `src/types/channel.test.ts`

---

## Library
**File**: `src/types/library.ts`

Key interfaces:
- `Library` - Collection of documents

Key functions:
- `createLibrary(input)` - Factory function
- `isLibrary(element)` - Type guard

**Usage:**
- Contains documents via `parent-child` dependencies
- Organizes knowledge base content

**Canonical example**: `src/types/library.test.ts`

---

## Team
**File**: `src/types/team.ts`

Key interfaces:
- `Team` - Group of entities
- `TeamId` - Branded ID type
- `TeamStatus` - `'active' | 'tombstone'`

Key functions:
- `createTeam(input)` - Factory function
- `isTeam(element)` - Type guard

**Usage:**
- Contains entities via `memberIds` array (mutable)
- Supports soft delete (`status: 'tombstone'`, `deletedAt`, `deletedBy`, `deleteReason`)

**Canonical example**: `src/types/team.test.ts`

---

## Playbook
**File**: `src/types/playbook.ts`

Key interfaces:
- `Playbook` - Executable instruction set
- `PlaybookStep` - Individual instruction

Key functions:
- `createPlaybook(input)` - Factory function
- `isPlaybook(element)` - Type guard

**Related files:**
- `src/types/playbook-yaml.ts` - YAML parsing

**Canonical example**: `src/types/playbook.test.ts`

---

## Inbox
**File**: `src/types/inbox.ts`

Key interfaces:
- `InboxItem` - Notification item (`id`, `recipientId`, `messageId`, `status`, `readAt`)
- `InboxStatus` - `'unread' | 'read' | 'archived'`
- `InboxSourceType` - `'direct' | 'mention'`

**Service**: `src/services/inbox.ts`

Key methods:
- `getInbox(recipientId, filter?)`, `getInboxPaginated()`
- `getUnreadCount(recipientId)`
- `markAsRead(itemId)`, `markAsUnread(itemId)`, `markAllAsRead(recipientId)`
- `archive(itemId)`

**Note:** `readAt` is null if archived without reading. Mark operations are idempotent.

---

## Event
**File**: `src/types/event.ts`

Key interfaces:
- `Event` - System event record
- `EventType` - Event type discriminator

**Usage:**
- Tracks system events for audit
- WebSocket broadcasts events to clients

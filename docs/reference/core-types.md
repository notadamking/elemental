# Core Types Reference

All types exported from `@elemental/core` (`packages/core/src/types/`).

## Element (Base Type)

**File:** `types/element.ts`

All elements share these properties:

```typescript
interface Element {
  id: ElementId;           // Hash-based unique identifier
  type: ElementType;       // Discriminator: 'task', 'entity', 'document', etc.
  createdAt: Timestamp;    // ISO 8601
  updatedAt: Timestamp;    // ISO 8601
  createdBy: EntityId;     // Reference to creator entity
  tags: string[];          // Categorization
  metadata: Record<string, unknown>;  // Arbitrary JSON (64KB limit)
}
```

**Key functions:**
- `isElement(value)` - Type guard
- `createElementId(content)` - Generate hash-based ID

---

## Task

**File:** `types/task.ts`

```typescript
interface Task extends Element {
  type: 'task';
  title: string;
  status: TaskStatus;
  priority: TaskPriority;    // 1 (critical) to 5 (minimal)
  taskType: TaskType;
  ephemeral?: boolean;       // If true, not synced to JSONL
  assigneeId?: EntityId;
  descriptionRef?: DocumentId;
  designRef?: DocumentId;
  scheduledFor?: string;     // ISO 8601 date
  closedAt?: Timestamp;
  closeReason?: string;
}

type TaskStatus = 'open' | 'in_progress' | 'blocked' | 'deferred' | 'closed' | 'tombstone';
type TaskType = 'feature' | 'bug' | 'chore' | 'task';
type TaskPriority = 1 | 2 | 3 | 4 | 5;
```

**Key functions:**
- `createTask(input)` - Factory (accepts optional `ephemeral` flag)
- `updateTaskStatus(task, newStatus)` - Validated status transition
- `promoteTask(task)` - Convert ephemeral to durable
- `isTask(element)` - Type guard

**Status transitions:**
- `open` → `in_progress`, `blocked`, `deferred`, `closed`
- `blocked` is **computed** from dependencies, never set directly
- `closed` → only `open` (cannot go to in_progress, blocked, or deferred)
- `tombstone` is terminal

**Ephemeral tasks:**
- Created with `ephemeral: true`
- Not included in JSONL export
- Not returned by `ready()` unless `includeEphemeral: true`
- Use `promoteTask()` to make durable

---

## Entity

**File:** `types/entity.ts`

```typescript
interface Entity extends Element {
  type: 'entity';
  name: string;              // Unique, case-sensitive
  entityType: EntityType;
  managerId?: EntityId;      // Reports to
  publicKey?: string;        // Ed25519 public key (for crypto mode)
}

type EntityType = 'agent' | 'human' | 'system';
```

**Key functions:**
- `createEntity(input)` - Factory
- `isEntity(element)` - Type guard
- `validateEntity(entity)` - Validation

**Constraints:**
- Names must start with letter: `/^[a-zA-Z][a-zA-Z0-9_-]*$/`
- Reserved names (case-insensitive): `system`, `anonymous`, `unknown`

---

## Message

**File:** `types/message.ts`

```typescript
interface Message extends Element {
  type: 'message';
  senderId: EntityId;
  channelId?: ChannelId;     // Must have channelId or threadId
  threadId?: MessageId;
  contentRef: DocumentId;    // Reference to content Document
}
```

**Key functions:**
- `createMessage(input)` - Factory
- `isMessage(element)` - Type guard

**Constraints:**
- Messages are **immutable** after creation
- Content is stored as Document reference, not inline text
- Must have either `channelId` or `threadId`

---

## Document

**File:** `types/document.ts`

```typescript
interface Document extends Element {
  type: 'document';
  title?: string;
  content: string;           // Current version content
  contentType: ContentType;
  version: number;           // Starts at 1
  attachmentRefs?: DocumentId[];
}

type ContentType = 'text' | 'markdown' | 'json' | 'yaml' | 'html' | 'code';
```

**Key functions:**
- `createDocument(input)` - Factory
- `isDocument(element)` - Type guard
- `validateJsonContent(content)` - JSON validation

**Constraints:**
- Content size limited to 10MB (UTF-8 bytes)
- Version history preserved in `document_versions` table

---

## Dependency

**File:** `types/dependency.ts`

```typescript
interface Dependency {
  sourceId: ElementId;
  targetId: ElementId;
  type: DependencyType;
  createdAt: Timestamp;
  createdBy: EntityId;
  metadata?: DependencyMetadata;
}

type DependencyType =
  | 'blocks'       // Target waits for source (OPPOSITE direction!)
  | 'parent-child' // Source waits for target
  | 'awaits'       // Source waits for target (gate)
  | 'relates-to'   // Bidirectional association
  | 'references'   // Citation
  | 'reply-to'     // Message threading
  | 'mentions';    // @mention reference
```

**Blocking types:** `blocks`, `awaits`, `parent-child`
- Only these trigger `blocked` status

**Direction semantics:**
| Type | Who waits |
|------|-----------|
| `blocks` | **Target** waits for source |
| `parent-child` | **Source** waits for target |
| `awaits` | **Source** waits for target |
| `relates-to` | Neither (associative) |

**Gate metadata (for `awaits`):**
```typescript
interface AwaitsDependencyMetadata {
  gate?: 'timer' | 'approval' | 'external' | 'webhook';
  waitUntil?: Timestamp;        // For timer
  requiredApprovers?: string[]; // For approval
  currentApprovers?: string[];
  requiredCount?: number;
  satisfied?: boolean;          // For external/webhook
}
```

---

## Collections

### Plan

**File:** `types/plan.ts`

```typescript
interface Plan extends Element {
  type: 'plan';
  title: string;
  status: PlanStatus;
  descriptionRef?: DocumentId;
  designRef?: DocumentId;
}

type PlanStatus = 'draft' | 'active' | 'completed' | 'cancelled';
```

Contains tasks via `parent-child` dependencies. **Tasks in a plan are NOT blocked by plan status.**

### Workflow

**File:** `types/workflow.ts`

```typescript
interface Workflow extends Element {
  type: 'workflow';
  title: string;
  status: WorkflowStatus;
  ephemeral?: boolean;       // If true, not synced
  parentWorkflowId?: ElementId;
}

type WorkflowStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
```

**Related files:**
- `types/workflow-ops.ts` - Ephemeral workflow operations
- `types/workflow-pour.ts` - Instantiate from playbook

### Channel

**File:** `types/channel.ts`

```typescript
interface Channel extends Element {
  type: 'channel';
  name: string;
  channelType: ChannelType;
  memberIds: EntityId[];
  visibility?: 'public' | 'private';
  joinPolicy?: 'open' | 'invite-only';
}

type ChannelType = 'direct' | 'group';
```

**Direct channels:** Names are deterministic `[entityA:entityB]` (sorted alphabetically).

### Library

**File:** `types/library.ts`

```typescript
interface Library extends Element {
  type: 'library';
  title: string;
  descriptionRef?: DocumentId;
}
```

Contains documents via `parent-child` dependencies.

### Team

**File:** `types/team.ts`

```typescript
interface Team extends Element {
  type: 'team';
  name: string;
  memberIds: EntityId[];
  status: TeamStatus;
  deletedAt?: Timestamp;
  deletedBy?: EntityId;
  deleteReason?: string;
}

type TeamStatus = 'active' | 'tombstone';
```

### Playbook

**File:** `types/playbook.ts`

```typescript
interface Playbook extends Element {
  type: 'playbook';
  name: string;
  title: string;
  steps: PlaybookStep[];
  variables?: PlaybookVariable[];
  inherits?: string;         // Parent playbook name
}
```

**Variable substitution:** `{{varName}}` pattern.

---

## Inbox

**File:** `types/inbox.ts`

```typescript
interface InboxItem {
  id: string;
  recipientId: EntityId;
  messageId: MessageId;
  status: InboxStatus;
  sourceType: InboxSourceType;
  readAt?: Timestamp;
  createdAt: Timestamp;
}

type InboxStatus = 'unread' | 'read' | 'archived';
type InboxSourceType = 'direct' | 'mention';
```

**Note:** `readAt` is null if archived without reading.

---

## Event

**File:** `types/event.ts`

```typescript
interface Event {
  id: string;
  type: EventType;
  elementId: ElementId;
  elementType: ElementType;
  actor: string;
  timestamp: Timestamp;
  data?: Record<string, unknown>;
}

type EventType =
  | 'created' | 'updated' | 'deleted'
  | 'status_changed' | 'assigned' | 'unassigned'
  | 'dependency_added' | 'dependency_removed'
  | 'auto_blocked' | 'auto_unblocked'
  | 'gate_satisfied' | 'approval_recorded' | 'approval_removed'
  | 'member_added' | 'member_removed'
  | 'message_sent' | 'inbox_read' | 'inbox_archived';
```

Events are stored for audit trail. Auto-generated events use actor `'system:blocked-cache'`.

---

## ID Types (Branded)

```typescript
type ElementId = string & { readonly __brand: 'ElementId' };
type TaskId = ElementId & { readonly __taskBrand: 'TaskId' };
type EntityId = ElementId & { readonly __entityBrand: 'EntityId' };
type DocumentId = ElementId & { readonly __documentBrand: 'DocumentId' };
type MessageId = ElementId & { readonly __messageBrand: 'MessageId' };
type ChannelId = ElementId & { readonly __channelBrand: 'ChannelId' };
type PlanId = ElementId & { readonly __planBrand: 'PlanId' };
type WorkflowId = ElementId & { readonly __workflowBrand: 'WorkflowId' };
type TeamId = ElementId & { readonly __teamBrand: 'TeamId' };
type LibraryId = ElementId & { readonly __libraryBrand: 'LibraryId' };
type PlaybookId = ElementId & { readonly __playbookBrand: 'PlaybookId' };
```

**Warning:** Using wrong ID type may cause runtime issues even though TypeScript allows it.

---

## Error Types

**File:** `errors/codes.ts`

```typescript
enum ErrorCode {
  // Validation
  INVALID_INPUT = 'INVALID_INPUT',
  MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',
  INVALID_TIMESTAMP = 'INVALID_TIMESTAMP',

  // Operations
  NOT_FOUND = 'NOT_FOUND',
  ALREADY_EXISTS = 'ALREADY_EXISTS',
  CYCLE_DETECTED = 'CYCLE_DETECTED',
  INVALID_TRANSITION = 'INVALID_TRANSITION',

  // Identity
  INVALID_PUBLIC_KEY = 'INVALID_PUBLIC_KEY',
  INVALID_SIGNATURE = 'INVALID_SIGNATURE',
  SIGNATURE_EXPIRED = 'SIGNATURE_EXPIRED',

  // Storage
  STORAGE_ERROR = 'STORAGE_ERROR',
  CONSTRAINT_VIOLATION = 'CONSTRAINT_VIOLATION',
}
```

**Error classes:**
- `ElementalError` - Base class
- `ValidationError` - Input validation failures
- `IdentityError` - Authentication/signature errors
- `StorageError` - Database errors

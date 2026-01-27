# Core Types

## Task
**File**: `src/types/task.ts`

Key interfaces:
- `Task` - Main task interface
- `HydratedTask` - Task with resolved document references
- `TaskStatus` - `'open' | 'in_progress' | 'blocked' | 'deferred' | 'closed' | 'tombstone'`
- `TaskType` - `'feature' | 'bug' | 'chore' | 'task'`
- `TaskPriority` - 1 (critical) to 5 (minimal)

Key properties:
- `ephemeral: boolean` - If true, task is not synced to JSONL export. Defaults to false.

Key functions:
- `createTask(input)` - Factory function (accepts optional `ephemeral` flag)
- `updateTaskStatus(task, newStatus)` - Status transitions
- `promoteTask(task)` - Promote ephemeral task to durable
- `isTask(element)` - Type guard
- `validateTask(task)` - Validation

**Ephemeral tasks:**
- Created with `ephemeral: true` option
- Not included in JSONL export by default
- Not returned by `ready()` unless `includeEphemeral: true` is passed
- Use `promoteTask()` to convert to durable (begin syncing)
- Eligible for garbage collection when closed/tombstoned

**Status transitions:**
- `open` → `in_progress`, `blocked`, `deferred`, `closed`
- `blocked` is computed from dependencies, not set directly (see [gotchas.md](../gotchas.md))

**Canonical example**: `src/types/task.test.ts`

---

## Entity
**File**: `src/types/entity.ts`

Key interfaces:
- `Entity` - Identity type (agent, human, system)
- `EntityType` - `'agent' | 'human' | 'system'`

Key functions:
- `createEntity(input)` - Factory function
- `isEntity(element)` - Type guard
- `validateEntity(entity)` - Validation

**Constraints:**
- Names must be unique, case-sensitive
- Reserved: `system`, `anonymous`, `unknown`

**Canonical example**: `src/types/entity.test.ts`

---

## Message
**File**: `src/types/message.ts`

Key interfaces:
- `Message` - Immutable message type
- `MessageId`, `ChannelId` - Branded ID types
- `HydratedMessage` - Message with resolved references

Key functions:
- `createMessage(input)` - Factory function
- `isMessage(element)` - Type guard
- `validateMessage(message)` - Validation

**Constraints:**
- Messages are **immutable** after creation (`updatedAt === createdAt` always)
- Must have a `channelId` or `threadId`
- Content stored as `DocumentId` reference (`contentRef`), not inline text
- `senderId` references an Entity

**Canonical example**: `src/types/message.test.ts`

---

## Document
**File**: `src/types/document.ts`

Key interfaces:
- `Document` - Versioned document type
- `DocumentId` - Branded ID type
- `ContentType` - Content format type
- `HydratedDocument` - Document with resolved references

Key functions:
- `createDocument(input)` - Factory function
- `isDocument(element)` - Type guard
- `validateDocument(document)` - Validation
- `validateJsonContent(content)` - JSON content validation

**Constraints:**
- Full version history preserved
- `content` is the current version
- Content size limited to 10MB (checked in UTF-8 bytes)
- Version starts at 1 (`MIN_VERSION`)

**Canonical example**: `src/types/document.test.ts`

---

## Element (Base Type)
**File**: `src/types/element.ts`

Key interfaces:
- `Element` - Base interface for all types
- `ElementId` - Branded string type for IDs
- `ElementType` - Union of all element types

Common properties:
- `id` - Hash-based unique identifier
- `type` - Element type discriminator
- `createdAt`, `updatedAt` - Timestamps
- `createdBy` - Entity ID reference
- `tags` - String array for categorization
- `metadata` - Arbitrary JSON object

Key functions:
- `isElement(value)` - Type guard
- `createElementId(content)` - ID generation

**Canonical example**: `src/types/element.test.ts`

---

## Dependency
**File**: `src/types/dependency.ts`

Key interfaces:
- `Dependency` - Relationship between elements
- `DependencyType` - Relationship type

See [dependencies.md](dependencies.md) for detailed documentation.

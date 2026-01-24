# Elemental - Technical Specification

A TypeScript library providing primitive abstractions for organizing and orchestrating work, designed as a complete memory system for teams of AI agents with humans in the loop.

**Version:** 0.1.0 (Draft)
**Last Updated:** 2025-01-22

## 1. Overview

### 1.1 Purpose

Elemental provides the foundational data structures and storage layer for:

- Tracking and coordinating tasks across autonomous agents
- Persistent communication between entities (agents and humans)
- Versioned knowledge storage and retrieval
- Workflow definition and instantiation
- Attribution and audit trails for all actions

### 1.2 Design Principles

- **Element-based**: Everything is an Element with shared base properties
- **Persistence-first**: All data persisted to SQLite with JSONL as source of truth
- **Cross-runtime**: Works in Bun, Node.js, Deno, and browsers
- **Hash-based identity**: Collision-resistant IDs for concurrent multi-agent creation
- **Immutable messages**: Communication records cannot be altered after creation
- **Full history**: Documents maintain complete version history
- **Hybrid identity**: Soft local identity by default, optional cryptographic signing

### 1.3 Relationship to Beads

Elemental is a clean-room TypeScript implementation inspired by the [Beads](./BEADS_SPEC.md) system. It shares similar concepts (hash-based IDs, JSONL sync, dependency graphs) but with different primitives and naming conventions. There is no data compatibility between the systems.

---

## 2. Element Hierarchy

### 2.1 Core Elements

```
Element (base)
├── Task (work to be done)
├── Message (communication between entities)
├── Document (content/knowledge)
└── Entity (identity - agent or human)
```

### 2.2 Collections

```
├── Plan (collection of related Tasks)
├── Workflow (ordered Tasks to execute, ephemeral or durable)
├── Playbook (uninstantiated Workflow template)
├── Channel (Messages between Entities)
├── Library (collection of Documents)
└── Team (collection of Entities)
```

---

## 3. Data Model

### 3.1 Type Aliases

```typescript
// Branded types for type safety
type ElementId = string; // Any element ID (el-abc, el-abc.1)
type TaskId = ElementId;
type MessageId = ElementId;
type DocumentId = ElementId;
type EntityId = ElementId;
type PlanId = ElementId;
type WorkflowId = ElementId;
type PlaybookId = ElementId;
type ChannelId = ElementId;
type LibraryId = ElementId;
type TeamId = ElementId;

// Timestamp format: ISO 8601 / RFC 3339 with timezone
// Example: "2025-01-22T10:00:00.000Z"
type Timestamp = string;
```

### 3.2 Base Element

All elements share these properties:

```typescript
interface Element {
  id: ElementId; // Hash-based, supports hierarchy (el-abc, el-abc.1)
  type: ElementType; // task, message, document, entity, plan, etc.
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: EntityId; // Attribution to creator
  tags: string[]; // User-defined tags
  metadata: Record<string, unknown>; // Extensible key-value data
}

type ElementType =
  | "task"
  | "message"
  | "document"
  | "entity"
  | "plan"
  | "workflow"
  | "playbook"
  | "channel"
  | "library"
  | "team";
```

### 3.3 Task

Represents work to be tracked and completed.

```typescript
interface Task extends Element {
  type: "task";

  // Content
  title: string; // Max 500 characters
  descriptionRef?: DocumentId; // Reference to Document (hydratable)
  designRef?: DocumentId; // Technical design notes (hydratable)
  acceptanceCriteria?: string; // What defines "done" for this task
  notes?: string; // Additional context, scratchpad

  // Workflow
  status: TaskStatus;
  priority: Priority; // 1-5, where 1 is highest
  complexity: Complexity; // 1-5, where 1 is simplest
  taskType: string; // bug, feature, task, chore (extensible)
  closeReason?: string;

  // Assignment
  assignee?: EntityId; // Who is working on this
  owner?: EntityId; // Who is responsible (for attribution/escalation)

  // Scheduling
  deadline?: Timestamp; // External constraint (set by humans, not agents)
  scheduledFor?: Timestamp; // When task becomes actionable (hidden until then)
  closedAt?: Timestamp;

  // Soft Delete (Tombstone)
  deletedAt?: Timestamp;
  deletedBy?: EntityId;
  deleteReason?: string;

  // External Integration
  externalRef?: string; // URL/ID to external system (GitHub, Jira, etc.)
}

// Hydrated version includes resolved Document content
interface HydratedTask extends Task {
  description?: string; // Hydrated from descriptionRef
  design?: string; // Hydrated from designRef
}

type TaskStatus =
  | "open" // Available for work
  | "in_progress" // Currently being worked on
  | "blocked" // Cannot proceed (waiting on dependency)
  | "deferred" // Deliberately postponed
  | "closed" // Completed
  | "tombstone"; // Soft-deleted

type Priority = 1 | 2 | 3 | 4 | 5; // 1 = highest priority
type Complexity = 1 | 2 | 3 | 4 | 5; // 1 = simplest
```

### 3.4 Message

Represents persistent, immutable communication between entities.

```typescript
interface Message extends Element {
  type: "message";

  // Location
  channelId: ChannelId;

  // Sender
  sender: EntityId;

  // Content
  contentRef: DocumentId; // Reference to Document (hydratable)
  attachments: DocumentId[]; // Additional Documents (hydratable)

  // Threading
  threadId?: MessageId; // Parent message for threading (replies-to)
}

// Hydrated version includes resolved Document content
interface HydratedMessage extends Message {
  content?: string; // Hydrated from contentRef
  attachmentContents?: Document[]; // Hydrated from attachments
}
```

**Immutability Rules:**

- Messages cannot be updated after creation (API rejects update calls)
- Messages cannot be deleted (API rejects delete calls)
- The `updatedAt` field will always equal `createdAt`
- To correct a message, send a new message referencing the original

### 3.5 Document

Represents versioned content (task descriptions, message content, knowledge base entries).

```typescript
interface Document extends Element {
  type: "document";

  // Content
  contentType: ContentType;
  content: string; // The actual content

  // Versioning
  version: number; // Starts at 1, increments on each update
  previousVersionId?: DocumentId; // Link to previous version (full history chain)
}

type ContentType = "text" | "markdown" | "json";
```

**Versioning Mechanism:**

When a Document is updated:

1. The existing Document is preserved as-is (becomes a historical version)
2. A new Document is created with:
   - Same `id` as the original
   - `version` incremented by 1
   - `previousVersionId` pointing to the previous version's snapshot
   - New `content` and `updatedAt`
3. The previous version is stored in a `document_versions` table

This provides:

- Full history traversal via `previousVersionId` chain
- Ability to fetch any historical version by (id, version)
- Current version is always the Document with matching `id` in the main table

**Content Validation:**

- `text`: No validation, stored as-is
- `markdown`: No validation, stored as-is (rendering is client responsibility)
- `json`: Must be valid JSON (validated on create/update), stored as string

### 3.6 Entity

Represents an identity within the system (AI agent, human, or system).

```typescript
interface Entity extends Element {
  type: "entity";

  // Identity
  name: string; // System-wide unique identifier
  entityType: EntityType;

  // Cryptographic Identity (optional)
  publicKey?: string; // Ed25519 public key, base64 encoded

  // Metadata can store:
  // - Agent: model, capabilities, system prompt hash, etc.
  // - Human: email, display name, etc.
  // - System: service name, version, etc.
}

type EntityType = "agent" | "human" | "system";
```

**Name Uniqueness:**

- Entity names must be unique across the entire system
- Names are case-sensitive
- Valid characters: alphanumeric, hyphen, underscore (regex: `^[a-zA-Z][a-zA-Z0-9_-]*$`)
- Reserved names: `system`, `anonymous`, `unknown`

### 3.7 Plan

A collection of related tasks (similar to an Epic in agile).

```typescript
interface Plan extends Element {
  type: "plan";

  title: string;
  descriptionRef?: DocumentId;
  status: PlanStatus;

  // Tasks are linked via parent-child dependencies
  // Plan is the parent, tasks are children
}

type PlanStatus = "draft" | "active" | "completed" | "cancelled";
```

**Plan Lifecycle:**

- `draft`: Planning phase, tasks can be added/removed freely
- `active`: Execution phase, work is in progress
- `completed`: All child tasks are closed
- `cancelled`: Plan abandoned, child tasks may be orphaned or cancelled

### 3.8 Workflow

An instance of tasks to be executed in a specific order (ephemeral or durable).

```typescript
interface Workflow extends Element {
  type: "workflow";

  title: string;
  descriptionRef?: DocumentId;
  status: WorkflowStatus;

  // Source template
  playbookId?: PlaybookId; // The playbook this was instantiated from

  // Execution state
  ephemeral: boolean; // If true, not synced to JSONL

  // Variables resolved at instantiation
  variables: Record<string, unknown>;
}

type WorkflowStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";
```

**Ephemeral vs Durable Workflows:**

| Aspect   | Durable (`ephemeral: false`)             | Ephemeral (`ephemeral: true`)         |
| -------- | ---------------------------------------- | ------------------------------------- |
| Storage  | SQLite + JSONL                           | SQLite only                           |
| Git sync | Yes                                      | No                                    |
| Use case | Important workflows, auditable processes | Temporary tasks, experiments, patrols |
| Cleanup  | Manual deletion                          | Auto-cleanup via `workflow gc`        |

**Ephemeral Workflow Operations:**

- `workflow burn <id>`: Delete ephemeral workflow and all its tasks immediately
- `workflow squash <id>`: Promote ephemeral workflow to durable (begins syncing)
- `workflow gc --age <duration>`: Garbage collect old ephemeral workflows

### 3.9 Playbook

A template for creating Workflows (similar to beads Formulas).

```typescript
interface Playbook extends Element {
  type: "playbook";

  // Identity
  name: string; // Unique name for referencing
  title: string; // Display title
  descriptionRef?: DocumentId;
  version: number;

  // Template definition
  steps: PlaybookStep[];
  variables: PlaybookVariable[];

  // Composition
  extends?: string[]; // Parent playbooks to inherit from
}

interface PlaybookStep {
  id: string; // Step identifier (unique within playbook)
  title: string; // Supports {{variable}} substitution
  description?: string; // Supports {{variable}} substitution
  taskType?: string;
  priority?: Priority;
  complexity?: Complexity;
  assignee?: string; // Can be {{variable}}
  dependsOn?: string[]; // Step IDs this step depends on
  condition?: string; // Conditional execution: "{{var}}", "!{{var}}", "{{var}} == value"
}

interface PlaybookVariable {
  name: string;
  description?: string;
  type: "string" | "number" | "boolean";
  required: boolean;
  default?: unknown;
  enum?: unknown[]; // Allowed values
}
```

**Playbook Instantiation ("Pouring"):**

When a Playbook is instantiated into a Workflow:

1. **Resolve inheritance**: Merge steps/variables from `extends` chain
2. **Validate variables**: Ensure all required variables are provided
3. **Evaluate conditions**: Filter steps where `condition` evaluates to false
4. **Substitute variables**: Replace all `{{variable}}` placeholders with values
5. **Create Workflow**: Generate Workflow element with resolved variables
6. **Create Tasks**: Generate Task elements for each step
7. **Wire dependencies**: Create `blocks` dependencies based on `dependsOn`

**Variable Pattern:** `{{variableName}}` - matches `[a-zA-Z_][a-zA-Z0-9_]*`

**Condition Evaluation:**

- Truthy: Any value except empty string, `"false"`, `"0"`, `"no"`, `"off"` (case-insensitive)
- Falsy: Empty string, `"false"`, `"0"`, `"no"`, `"off"`
- Missing variable: Treated as empty string (falsy)

### 3.10 Channel

A container for messages between entities.

```typescript
interface Channel extends Element {
  type: "channel";

  name: string;
  descriptionRef?: DocumentId;

  // Channel type
  channelType: ChannelType;

  // Membership
  members: EntityId[]; // Current members

  // Permissions
  permissions: ChannelPermissions;
}

type ChannelType = "direct" | "group";

interface ChannelPermissions {
  visibility: "public" | "private"; // Can entities discover this channel?
  joinPolicy: "open" | "invite-only" | "request"; // How do new entities join?
  modifyMembers: EntityId[]; // Who can add/remove members
}
```

**Channel Types:**

| Type     | Description                                     | Membership               |
| -------- | ----------------------------------------------- | ------------------------ |
| `direct` | Private conversation between exactly 2 entities | Static (cannot change)   |
| `group`  | Multi-entity channel                            | Dynamic (can join/leave) |

**Direct Channels:**

- Automatically created when an entity messages another for the first time
- Name is deterministic: sorted entity names joined (e.g., `alice:bob`)
- Cannot add/remove members after creation
- Always private visibility, invite-only join policy

**Group Channels:**

- Explicitly created with initial members
- Supports all permission configurations
- Members can be added/removed based on permissions

### 3.11 Library

A collection of related documents (knowledge base, documentation, etc.).

```typescript
interface Library extends Element {
  type: "library";

  name: string;
  descriptionRef?: DocumentId;

  // Documents are linked via parent-child dependencies
  // Library is the parent, documents are children
}
```

**Library Organization:**

- Documents belong to a Library via `parent-child` dependency
- A Document can belong to multiple Libraries
- Libraries can be nested (Library as child of another Library)

### 3.12 Team

A collection of related entities.

```typescript
interface Team extends Element {
  type: "team";

  name: string;
  descriptionRef?: DocumentId;

  // Members
  members: EntityId[];

  // Metadata can store team-specific configuration
}
```

**Team Usage:**

- Group agents working together on related tasks
- Assign tasks to a Team (any member can pick up)
- Track metrics/attribution at team level
- Teams can overlap (an Entity can be in multiple Teams)

---

## 4. Dependency System

### 4.1 Dependency Types

Dependencies create relationships between elements. They are categorized by their effect on the system:

#### Blocking Dependencies (affect work readiness)

| Type           | Semantics                                                         |
| -------------- | ----------------------------------------------------------------- |
| `blocks`       | Target cannot start until source closes successfully              |
| `parent-child` | Hierarchical containment with transitive blocking                 |
| `awaits`       | Target waits for external gate (timer, approval, external system) |

#### Associative Dependencies (non-blocking, knowledge graph)

| Type         | Semantics                                                                       |
| ------------ | ------------------------------------------------------------------------------- |
| `relates-to` | Bidirectional semantic link                                                     |
| `references` | Unidirectional citation (source mentions target)                                |
| `supersedes` | Version chain (source replaces target)                                          |
| `duplicates` | Deduplication marker                                                            |
| `caused-by`  | Audit trail (source was created because of target)                              |
| `validates`  | Test verification (source test/check confirmed target task is correct/complete) |

#### Attribution Dependencies (entity relationships)

| Type          | Semantics                       |
| ------------- | ------------------------------- |
| `authored-by` | Creator link (Element → Entity) |
| `assigned-to` | Responsibility (Task → Entity)  |
| `approved-by` | Sign-off (Element → Entity)     |

#### Threading Dependencies

| Type         | Semantics                         |
| ------------ | --------------------------------- |
| `replies-to` | Message threading within channels |

### 4.2 Dependency Schema

```typescript
interface Dependency {
  sourceId: ElementId; // The element that has the dependency
  targetId: ElementId; // The element being depended on
  type: DependencyType;
  createdAt: Timestamp;
  createdBy: EntityId;
  metadata?: DependencyMetadata; // Type-specific data
}

type DependencyType =
  // Blocking
  | "blocks"
  | "parent-child"
  | "awaits"
  // Associative
  | "relates-to"
  | "references"
  | "supersedes"
  | "duplicates"
  | "caused-by"
  | "validates"
  // Attribution
  | "authored-by"
  | "assigned-to"
  | "approved-by"
  // Threading
  | "replies-to";

// Type-specific metadata
type DependencyMetadata =
  | AwaitsMetadata
  | ValidatesMetadata
  | Record<string, unknown>;

interface AwaitsMetadata {
  gateType: "timer" | "approval" | "external" | "webhook";
  // For timer gates
  waitUntil?: Timestamp;
  // For external gates
  externalSystem?: string; // e.g., "github", "ci-pipeline"
  externalId?: string; // e.g., PR number, build ID
  // For approval gates
  requiredApprovers?: EntityId[];
  approvalCount?: number; // How many approvals needed
}

interface ValidatesMetadata {
  testType?: string; // e.g., "unit", "integration", "manual"
  result?: "pass" | "fail";
  details?: string; // Test output or notes
}
```

### 4.3 Blocking Semantics

An element is **blocked** if any of the following are true:

- It has a `blocks` dependency on an element that is not `closed` or `tombstone`
- It has a `parent-child` dependency on a blocked parent (transitive)
- It has an `awaits` dependency on an unsatisfied gate

**Ready work** consists of tasks that are:

- Status is `open` or `in_progress`
- Not blocked by any dependency
- `scheduledFor` is null or in the past
- Not ephemeral (unless specifically querying ephemeral tasks)

### 4.4 Tombstone Behavior

Soft-deleted elements (status = `tombstone`) have special handling:

**TTL (Time-To-Live):**

- Default TTL: 30 days
- Minimum TTL: 7 days
- After TTL expires, tombstones may be permanently removed during cleanup

**Tombstone Fields:**

- `deletedAt`: When the element was deleted (required for tombstones)
- `deletedBy`: Entity that performed the deletion
- `deleteReason`: Optional explanation

**Merge Behavior:**

- Fresh tombstone (within TTL) wins over live element
- Expired tombstone loses to live element (resurrection)
- Two tombstones: later `deletedAt` wins

### 4.5 Cycle Detection

Before adding a blocking dependency, the system must verify it would not create a cycle. Uses depth-limited recursive traversal (max depth: 100).

`relates-to` dependencies are excluded from cycle detection as they are bidirectional by design.

**Algorithm:**

```
detectCycle(source, target, type):
  if type not in ['blocks', 'parent-child', 'awaits']:
    return false  // Non-blocking types don't create cycles

  visited = set()
  queue = [target]

  while queue not empty:
    current = queue.pop()
    if current == source:
      return true  // Cycle detected
    if current in visited:
      continue
    visited.add(current)

    for dep in getBlockingDependencies(current):
      queue.add(dep.targetId)

  return false
```

---

## 5. ID Generation

### 5.1 Hash-Based IDs

IDs are generated using content hashing to prevent collisions in concurrent multi-agent scenarios.

**Format:** `{prefix}-{hash}` (e.g., `el-a3f8e9`)

**Algorithm:**

```
1. Compute SHA256 of: title + "|" + createdBy + "|" + timestamp_ns + "|" + nonce
2. Encode as Base36 (0-9, a-z)
3. Truncate to adaptive length (3-8 chars based on database size)
4. Prefix with "el-"
5. Check for collision; if exists, increment nonce (0-9) and retry
6. If still colliding, increase length and retry (up to length 8)
```

### 5.2 Hierarchical IDs

For parent-child relationships, child IDs extend the parent ID:

- Parent: `el-abc`
- First child: `el-abc.1`
- Second child: `el-abc.2`
- Grandchild: `el-abc.1.1`

Maximum hierarchy depth: 3 levels

### 5.3 Adaptive Length

Uses birthday paradox to determine minimum safe length:

- 3 chars: ~160 elements
- 4 chars: ~980 elements
- 5 chars: ~5,900 elements
- 6 chars: ~35,000 elements
- 7 chars: ~212,000 elements
- 8 chars: ~1,000,000+ elements

---

## 6. Storage Architecture

### 6.1 Directory Structure

```
.elemental/
├── elemental.db              # SQLite database (gitignored)
├── elemental.db-wal          # WAL file (gitignored)
├── elemental.db-shm          # Shared memory file (gitignored)
├── elements.jsonl            # Git-tracked source of truth
├── dependencies.jsonl        # Git-tracked dependencies
├── config.yaml               # User configuration
├── playbooks/                # Playbook templates (.playbook.yaml)
└── .gitignore                # Ignores db, wal, shm files
```

### 6.2 Dual Storage Model

```
┌─────────────────────────────────────────┐
│            Application Layer            │
│     TypeScript API (@elemental/core)    │
└─────────────────┬───────────────────────┘
                  │
        ┌─────────┴─────────┐
        ▼                   ▼
   ┌─────────┐        ┌──────────┐
   │ SQLite  │◄──────►│  JSONL   │
   │ (fast)  │  sync  │  (git)   │
   └─────────┘        └──────────┘
```

**Data Flow:**

- **Write Path:** API → SQLite → mark dirty → debounced JSONL export
- **Read Path:** JSONL import → SQLite → API query
- **JSONL is source of truth** - SQLite is a fast local cache

### 6.3 Runtime Backends

| Runtime | SQLite Implementation     |
| ------- | ------------------------- |
| Bun     | `bun:sqlite` (native)     |
| Node.js | `better-sqlite3`          |
| Deno    | `@db/sqlite`              |
| Browser | `sql.js` (WASM) with OPFS |

All backends expose the same query interface.

### 6.4 Sync Mechanism

**Hybrid approach:**

1. JSONL as durable source of truth (git-friendly, mergeable)
2. Real-time notifications for connected clients (WebSocket/SSE)

**Browser ↔ Backend sync:**

- Browser exports local changes to JSONL
- Syncs via HTTP to server
- Server performs 3-way merge
- Changes pushed to connected clients

### 6.5 Database Schema

```sql
-- Core element storage
CREATE TABLE elements (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    data TEXT NOT NULL,           -- JSON blob of type-specific fields
    content_hash TEXT,            -- SHA256 of content fields (for dedup/merge)
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    created_by TEXT NOT NULL,
    deleted_at TEXT,              -- Soft delete timestamp

    CHECK (type IN ('task', 'message', 'document', 'entity',
                    'plan', 'workflow', 'playbook',
                    'channel', 'library', 'team'))
);

-- Document version history
CREATE TABLE document_versions (
    id TEXT NOT NULL,             -- Document ID
    version INTEGER NOT NULL,
    data TEXT NOT NULL,           -- JSON blob of version content
    created_at TEXT NOT NULL,
    PRIMARY KEY (id, version)
);

-- Dependencies
CREATE TABLE dependencies (
    source_id TEXT NOT NULL REFERENCES elements(id) ON DELETE CASCADE,
    target_id TEXT NOT NULL,      -- No FK constraint (allows external refs)
    type TEXT NOT NULL,
    created_at TEXT NOT NULL,
    created_by TEXT NOT NULL,
    metadata TEXT,                -- JSON
    PRIMARY KEY (source_id, target_id, type)
);

-- Tags (many-to-many)
CREATE TABLE tags (
    element_id TEXT NOT NULL REFERENCES elements(id) ON DELETE CASCADE,
    tag TEXT NOT NULL,
    PRIMARY KEY (element_id, tag)
);

-- Events (audit trail)
CREATE TABLE events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    element_id TEXT NOT NULL REFERENCES elements(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    actor TEXT NOT NULL,
    old_value TEXT,               -- JSON
    new_value TEXT,               -- JSON
    created_at TEXT NOT NULL
);

-- Dirty tracking for incremental export
CREATE TABLE dirty_elements (
    element_id TEXT PRIMARY KEY REFERENCES elements(id) ON DELETE CASCADE,
    marked_at TEXT NOT NULL
);

-- Hierarchical ID counters
CREATE TABLE child_counters (
    parent_id TEXT PRIMARY KEY,
    last_child INTEGER NOT NULL DEFAULT 0
);

-- Blocked elements cache (optimization for ready work queries)
CREATE TABLE blocked_cache (
    element_id TEXT PRIMARY KEY,
    blocked_by TEXT NOT NULL,     -- ID of blocking element
    reason TEXT,                  -- Human-readable reason
    FOREIGN KEY (element_id) REFERENCES elements(id) ON DELETE CASCADE
);

-- Key indexes
CREATE INDEX idx_elements_type ON elements(type);
CREATE INDEX idx_elements_created_by ON elements(created_by);
CREATE INDEX idx_elements_created_at ON elements(created_at);
CREATE INDEX idx_elements_content_hash ON elements(content_hash);
CREATE INDEX idx_dependencies_target ON dependencies(target_id);
CREATE INDEX idx_dependencies_type ON dependencies(type);
CREATE INDEX idx_tags_tag ON tags(tag);
CREATE INDEX idx_events_element ON events(element_id);
CREATE INDEX idx_events_created_at ON events(created_at);
CREATE INDEX idx_document_versions_id ON document_versions(id);
```

### 6.6 Content Hashing

Content hash is computed for merge conflict detection and deduplication:

```
contentHash = SHA256(
  type + "|" +
  JSON.stringify(sortedContentFields)
)
```

**Included in hash:**

- All type-specific content fields (title, content, status, priority, etc.)
- Tags array (sorted)

**Excluded from hash:**

- `id` (identity, not content)
- `contentHash` itself
- All timestamps (`createdAt`, `updatedAt`, `closedAt`, `deletedAt`)
- `createdBy` (attribution, not content)

### 6.7 Blocked Cache

The `blocked_cache` table is a materialized view for fast ready-work queries.

**Invalidation triggers:**

- Adding/removing blocking dependencies (`blocks`, `parent-child`, `awaits`)
- Element status changes
- Gate satisfaction changes

**Rebuild algorithm:**

1. Clear cache
2. For each element with blocking dependencies, check if blocked
3. Recursively propagate blocking through `parent-child` relationships
4. Insert blocked elements with reason

This optimization provides ~25x speedup for ready-work queries on large datasets.

---

## 7. Events & Audit Trail

### 7.1 Event Types

Every mutation to an element generates an event:

```typescript
interface Event {
  id: number; // Auto-incremented
  elementId: ElementId;
  eventType: EventType;
  actor: EntityId; // Who performed the action
  oldValue?: unknown; // Previous state (JSON)
  newValue?: unknown; // New state (JSON)
  createdAt: Date;
}

type EventType =
  | "created"
  | "updated"
  | "closed"
  | "reopened"
  | "deleted"
  | "dependency_added"
  | "dependency_removed"
  | "tag_added"
  | "tag_removed"
  | "member_added"
  | "member_removed";
```

### 7.2 Immutability

Events are append-only and immutable. They provide a complete audit trail of all changes to all elements.

---

## 8. Entity Identity

### 8.1 Soft Identity (Default)

By default, entities are identified by their unique `name` field. Any actor can claim any identity. Suitable for:

- Local development
- Single-system deployments
- Trusted environments

### 8.2 Cryptographic Identity (Optional)

Entities can optionally have a `publicKey` for:

- Signed actions (prove an action came from an entity)
- Federation (cross-system trust)
- Tamper-evident audit trails

**Key format:** Ed25519 public key, base64 encoded

**Signature verification:** Actions can include a signature field that is verified against the entity's public key.

---

## 9. Query API

### 9.1 Core Queries

```typescript
interface ElementalAPI {
  // Element CRUD
  get<T extends Element>(
    id: ElementId,
    options?: GetOptions,
  ): Promise<T | null>;
  list<T extends Element>(filter: ElementFilter): Promise<T[]>;
  create<T extends Element>(input: ElementInput<T>): Promise<T>;
  update<T extends Element>(id: ElementId, updates: Partial<T>): Promise<T>;
  delete(id: ElementId, reason?: string): Promise<void>;

  // Task-specific
  ready(filter?: TaskFilter): Promise<Task[]>; // Unblocked, actionable tasks
  blocked(filter?: TaskFilter): Promise<BlockedTask[]>; // Blocked tasks with reasons

  // Dependencies
  addDependency(dep: DependencyInput): Promise<Dependency>;
  removeDependency(
    sourceId: ElementId,
    targetId: ElementId,
    type: DependencyType,
  ): Promise<void>;
  getDependencies(
    id: ElementId,
    types?: DependencyType[],
  ): Promise<Dependency[]>;
  getDependents(id: ElementId, types?: DependencyType[]): Promise<Dependency[]>;
  getDependencyTree(id: ElementId): Promise<DependencyTree>;

  // Search
  search(query: string, filter?: ElementFilter): Promise<Element[]>;

  // History
  getEvents(id: ElementId, filter?: EventFilter): Promise<Event[]>;
  getDocumentVersion(
    documentId: DocumentId,
    version: number,
  ): Promise<Document | null>;
  getDocumentHistory(documentId: DocumentId): Promise<Document[]>;

  // Sync
  export(options?: ExportOptions): Promise<void>;
  import(options?: ImportOptions): Promise<ImportResult>;

  // Stats
  stats(): Promise<SystemStats>;
}
```

### 9.2 Filter Types

```typescript
interface ElementFilter {
  type?: ElementType | ElementType[];
  tags?: string[]; // Elements with ALL of these tags
  tagsAny?: string[]; // Elements with ANY of these tags
  createdBy?: EntityId;
  createdAfter?: Timestamp;
  createdBefore?: Timestamp;
  updatedAfter?: Timestamp;
  updatedBefore?: Timestamp;
  includeDeleted?: boolean; // Include tombstones (default: false)
  limit?: number;
  offset?: number;
  orderBy?: "createdAt" | "updatedAt" | "priority";
  orderDir?: "asc" | "desc";
}

interface TaskFilter extends ElementFilter {
  type?: "task";
  status?: TaskStatus | TaskStatus[];
  priority?: Priority | Priority[];
  complexity?: Complexity | Complexity[];
  assignee?: EntityId;
  owner?: EntityId;
  taskType?: string | string[];
  hasDeadline?: boolean;
  deadlineBefore?: Timestamp;
  includeEphemeral?: boolean; // Include ephemeral workflow tasks
}

interface EventFilter {
  eventType?: EventType | EventType[];
  actor?: EntityId;
  after?: Timestamp;
  before?: Timestamp;
  limit?: number;
}

interface BlockedTask extends Task {
  blockedBy: ElementId; // ID of blocking element
  blockReason: string; // Human-readable reason
}

interface DependencyTree {
  element: Element;
  dependencies: DependencyTree[];
  dependents: DependencyTree[];
}

interface SystemStats {
  totalElements: number;
  byType: Record<ElementType, number>;
  totalDependencies: number;
  totalEvents: number;
  readyTasks: number;
  blockedTasks: number;
}
```

### 9.3 Hydration

References to Documents (e.g., `task.descriptionRef`) can be hydrated on fetch:

```typescript
interface GetOptions {
  hydrate?: HydrationOptions;
}

interface HydrationOptions {
  description?: boolean; // Fetch descriptionRef as description
  design?: boolean; // Fetch designRef as design
  content?: boolean; // Fetch contentRef as content
  attachments?: boolean; // Fetch attachment Documents
}

// Example
const task = await api.get<HydratedTask>(taskId, {
  hydrate: { description: true, design: true },
});
// task.description and task.design are now populated with Document content
```

---

## 10. CLI

### 10.1 Command Structure

Primary command: `elemental` (alias: `el`)

```
elemental <command> [options]
el <command> [options]
```

### 10.2 Command Groups

```
Elements:     create, list, show, update, delete, search
Tasks:        ready, blocked, close, reopen, assign, defer, undefer
Dependencies: dep add, dep remove, dep list, dep tree
Messages:     send, thread, channel messages
Documents:    write, read, history, versions
Entities:     register, list, whoami
Plans:        plan create, plan list, plan show, plan close
Workflows:    workflow pour, workflow list, workflow show, workflow burn, workflow squash, workflow gc
Playbooks:    playbook list, playbook show, playbook validate, playbook create
Channels:     channel create, channel join, channel leave, channel list, channel members
Libraries:    library create, library list, library add, library remove
Teams:        team create, team add, team remove, team list, team members
Sync:         sync, import, export, status
Admin:        init, config, stats, doctor, migrate
```

### 10.3 Key Commands

```bash
# Initialize a new elemental workspace
el init

# Create elements
el create task "Fix memory leak" --priority 1 --type bug
el create document --content-type markdown < description.md
el create plan "Q1 Roadmap" --description-ref el-abc123

# Task operations
el ready                                    # List actionable tasks
el blocked                                  # List blocked tasks with reasons
el close el-abc123 --reason "Fixed in PR #42"
el assign el-abc123 --to agent-alice

# Dependencies
el dep add el-child el-parent --type parent-child
el dep add el-task el-blocker --type blocks
el dep tree el-plan                         # Show dependency tree

# Workflows
el workflow pour my-playbook --var env=prod  # Instantiate playbook
el workflow pour my-playbook --ephemeral     # Create ephemeral workflow
el workflow burn el-workflow-123             # Delete ephemeral workflow
el workflow squash el-workflow-123           # Promote to durable
el workflow gc --age 24h                     # Clean up old ephemeral workflows

# Sync
el sync                                      # Export + sync with remote
el export --output elements.jsonl
el import --input elements.jsonl
```

### 10.4 Output Formats

- Default: Human-readable table/tree format
- `--json`: JSON output for programmatic use
- `--quiet`: Minimal output (IDs only)

### 10.5 Global Flags

```
--db PATH          Database path (auto-discovers .elemental/*.db)
--actor NAME       Actor name for audit trail (default: from config)
--json             JSON output mode
--quiet, -q        Suppress non-essential output
--verbose, -v      Debug output
--help, -h         Show help
```

---

## 11. Configuration

### 11.1 Configuration File

Location: `.elemental/config.yaml`

```yaml
# Identity
actor: "agent-name" # Default actor for operations

# Storage
database: "elemental.db" # Database filename

# Sync
sync:
  auto_export: true # Auto-export on mutations
  export_debounce: 500ms # Debounce interval for export

# Playbooks
playbooks:
  paths: # Search paths for playbooks
    - ".elemental/playbooks"
    - "~/.elemental/playbooks"

# Tombstone
tombstone:
  ttl: 720h # 30 days default
  min_ttl: 168h # 7 days minimum
```

### 11.2 Environment Variables

```bash
ELEMENTAL_ACTOR              # Default actor name
ELEMENTAL_DB                 # Database path
ELEMENTAL_CONFIG             # Config file path
ELEMENTAL_JSON               # JSON output mode (bool)
ELEMENTAL_VERBOSE            # Debug output (bool)
```

### 11.3 Precedence

Configuration is resolved in order (later overrides earlier):

1. Built-in defaults
2. Config file (`.elemental/config.yaml`)
3. Environment variables
4. CLI flags

---

## 12. JSONL Format

### 12.1 Structure

Each line is a complete JSON object representing an element:

```json
{"id":"el-a3f8e9","type":"task","title":"Fix memory leak","status":"open","priority":1,"complexity":3,"createdAt":"2025-01-22T10:00:00Z","updatedAt":"2025-01-22T10:00:00Z","createdBy":"agent-1","tags":["backend","urgent"]}
{"id":"el-b2c3d4","type":"document","contentType":"markdown","content":"# Description\n\nThis task involves...","version":1,"createdAt":"2025-01-22T10:00:00Z","updatedAt":"2025-01-22T10:00:00Z","createdBy":"agent-1","tags":[]}
```

### 12.2 Export Rules

**Exported:**

- All elements except ephemeral workflows
- All dependencies
- Tombstones (for sync of deletions)

**Not Exported:**

- Ephemeral workflows (`ephemeral: true`)
- Events (audit trail is local-only by default)

### 12.3 Merge Strategy

When syncing diverged JSONL files:

1. **Same ID + same content hash:** Skip (already synced)
2. **Same ID + different content:** Last-Write-Wins by `updatedAt`
3. **Tombstone vs live:** Fresh tombstone wins; expired tombstone allows resurrection
4. **Status merge:** Closed always wins
5. **Tags:** Set union (merge both sides)
6. **Dependencies:** Removals are authoritative

---

## 13. Package Structure

```
@elemental/core/
├── src/
│   ├── index.ts              # Public API exports
│   ├── types/                # TypeScript type definitions
│   │   ├── index.ts          # Re-exports all types
│   │   ├── element.ts        # Base Element, ElementId, etc.
│   │   ├── task.ts           # Task, TaskStatus, Priority, etc.
│   │   ├── message.ts        # Message, HydratedMessage
│   │   ├── document.ts       # Document, ContentType
│   │   ├── entity.ts         # Entity, EntityType
│   │   ├── collections.ts    # Plan, Workflow, Playbook, Channel, Library, Team
│   │   ├── dependency.ts     # Dependency, DependencyType, metadata types
│   │   ├── event.ts          # Event, EventType
│   │   ├── filter.ts         # ElementFilter, TaskFilter, etc.
│   │   └── errors.ts         # ElementalError, ErrorCode
│   ├── storage/              # Storage abstraction
│   │   ├── index.ts          # Storage interface
│   │   ├── sqlite/           # SQLite implementation
│   │   │   ├── index.ts      # Common SQLite logic
│   │   │   ├── schema.ts     # Schema definitions & migrations
│   │   │   ├── bun.ts        # Bun adapter (bun:sqlite)
│   │   │   ├── node.ts       # Node adapter (better-sqlite3)
│   │   │   └── browser.ts    # Browser adapter (sql.js + OPFS)
│   │   └── cache.ts          # Blocked cache management
│   ├── id/                   # ID generation
│   │   ├── index.ts
│   │   ├── hash.ts           # Hash-based ID generation
│   │   └── hierarchy.ts      # Hierarchical ID handling
│   ├── sync/                 # JSONL sync
│   │   ├── index.ts
│   │   ├── export.ts         # SQLite → JSONL
│   │   ├── import.ts         # JSONL → SQLite
│   │   ├── merge.ts          # 3-way merge logic
│   │   └── dirty.ts          # Dirty tracking
│   ├── query/                # Query builders & execution
│   │   ├── index.ts
│   │   ├── ready.ts          # Ready work calculation
│   │   ├── blocked.ts        # Blocked analysis
│   │   ├── search.ts         # Full-text search
│   │   └── tree.ts           # Dependency tree traversal
│   ├── validation/           # Input validation
│   │   ├── index.ts
│   │   └── schema.ts         # Validation schemas
│   ├── api.ts                # Main ElementalAPI implementation
│   └── utils/                # Shared utilities
│       ├── hash.ts           # SHA256, content hashing
│       └── timestamp.ts      # Timestamp formatting
├── cli/                      # CLI (separate entry point)
│   ├── index.ts              # CLI entry point
│   ├── commands/             # Command implementations
│   └── output.ts             # Output formatting
├── package.json
├── tsconfig.json
├── tsconfig.cli.json         # CLI-specific config
└── README.md
```

### 13.1 Entry Points

```json
{
  "name": "@elemental/core",
  "exports": {
    ".": "./dist/index.js",
    "./types": "./dist/types/index.js"
  },
  "bin": {
    "elemental": "./dist/cli/index.js",
    "el": "./dist/cli/index.js"
  }
}
```

---

## 14. Error Handling

### 14.1 Error Types

```typescript
// Base error class
class ElementalError extends Error {
  code: ErrorCode;
  details?: Record<string, unknown>;
}

type ErrorCode =
  // Validation errors
  | "INVALID_INPUT" // Input validation failed
  | "INVALID_ID" // ID format invalid
  | "INVALID_STATUS" // Invalid status transition
  | "TITLE_TOO_LONG" // Title exceeds 500 chars
  // Not found errors
  | "NOT_FOUND" // Element not found
  | "ENTITY_NOT_FOUND" // Referenced entity not found
  | "DOCUMENT_NOT_FOUND" // Referenced document not found
  // Conflict errors
  | "ALREADY_EXISTS" // Element with ID already exists
  | "DUPLICATE_NAME" // Entity/channel name already taken
  | "CYCLE_DETECTED" // Dependency would create cycle
  // Constraint errors
  | "IMMUTABLE" // Cannot modify immutable element (Message)
  | "HAS_DEPENDENTS" // Cannot delete element with dependents
  | "INVALID_PARENT" // Invalid parent for hierarchical ID
  // Storage errors
  | "DATABASE_ERROR" // SQLite error
  | "SYNC_CONFLICT" // Merge conflict during sync
  | "EXPORT_FAILED" // JSONL export failed
  | "IMPORT_FAILED"; // JSONL import failed
```

### 14.2 Validation Rules

| Field            | Rule                                                       |
| ---------------- | ---------------------------------------------------------- |
| `title`          | 1-500 characters, required for Task/Plan/Workflow          |
| `name`           | 1-100 characters, alphanumeric + hyphen/underscore, unique |
| `priority`       | 1-5 inclusive                                              |
| `complexity`     | 1-5 inclusive                                              |
| `contentType`    | Must be 'text', 'markdown', or 'json'                      |
| `content` (json) | Must be valid JSON                                         |
| `entityType`     | Must be 'agent', 'human', or 'system'                      |
| `channelType`    | Must be 'direct' or 'group'                                |

### 14.3 Status Transition Rules

**Task:**

- `open` → `in_progress`, `blocked`, `deferred`, `closed`
- `in_progress` → `open`, `blocked`, `deferred`, `closed`
- `blocked` → `open`, `in_progress`, `deferred`, `closed`
- `deferred` → `open`, `in_progress`
- `closed` → `open` (reopen)
- `tombstone` → (terminal, no transitions)

**Workflow:**

- `pending` → `running`, `cancelled`
- `running` → `completed`, `failed`, `cancelled`
- `completed`, `failed`, `cancelled` → (terminal)

---

## 15. Future Considerations

These features are explicitly deferred for future versions:

### 15.1 Compaction

If storage or sync performance becomes an issue, implement compaction to:

- Archive old versions of Documents
- Compress closed/old elements
- Reduce JSONL size for faster git operations

### 15.2 Workflow Executor

This specification defines data structures only. A workflow execution engine that:

- Interprets Playbooks
- Manages Workflow state transitions
- Handles gates and async coordination

...would be a separate package (`@elemental/executor`).

### 15.3 Federation

Cross-system sync with:

- Peer discovery
- Conflict resolution across trust boundaries
- Cryptographic verification of remote claims

### 15.4 Real-time Collaboration

WebSocket/SSE infrastructure for:

- Live updates to connected clients
- Presence awareness
- Collaborative editing (where applicable)

---

## Appendix A: Status State Machines

### Task Status

```
     ┌──────────────────────────────────────┐
     │                                      │
     ▼                                      │
  [open] ──────► [in_progress] ─────────────┤
     │                │                     │
     │                ▼                     │
     │           [blocked] ◄────────────────┤
     │                │                     │
     │                ▼                     │
     ├───────► [deferred] ──────────────────┤
     │                                      │
     ▼                                      │
 [closed] ◄─────────────────────────────────┘
     │
     ▼
[tombstone] ──► (TTL expiration)
```

### Workflow Status

```
[pending] ──► [running] ──► [completed]
                 │
                 ├──► [failed]
                 │
                 └──► [cancelled]
```

### Plan Status

```
[draft] ──► [active] ──► [completed]
               │
               └──► [cancelled]
```

---

## Appendix B: Example JSONL

```jsonl
{"id":"el-a1b2c3","type":"entity","name":"agent-alice","entityType":"agent","createdAt":"2025-01-22T10:00:00Z","updatedAt":"2025-01-22T10:00:00Z","createdBy":"system","tags":[],"metadata":{"model":"claude-3-opus"}}
{"id":"el-d4e5f6","type":"entity","name":"human-bob","entityType":"human","createdAt":"2025-01-22T10:00:00Z","updatedAt":"2025-01-22T10:00:00Z","createdBy":"system","tags":[],"metadata":{"email":"bob@example.com"}}
{"id":"el-g7h8i9","type":"document","contentType":"markdown","content":"# Auth System\n\nImplement user authentication with OAuth2.","version":1,"createdAt":"2025-01-22T10:01:00Z","updatedAt":"2025-01-22T10:01:00Z","createdBy":"el-d4e5f6","tags":["documentation"]}
{"id":"el-j0k1l2","type":"plan","title":"Auth System Implementation","descriptionRef":"el-g7h8i9","status":"active","createdAt":"2025-01-22T10:02:00Z","updatedAt":"2025-01-22T10:02:00Z","createdBy":"el-d4e5f6","tags":["q1-2025"]}
{"id":"el-j0k1l2.1","type":"task","title":"Design OAuth2 flow","descriptionRef":"el-m3n4o5","status":"closed","priority":1,"complexity":2,"taskType":"task","closedAt":"2025-01-22T14:00:00Z","createdAt":"2025-01-22T10:03:00Z","updatedAt":"2025-01-22T14:00:00Z","createdBy":"el-d4e5f6","tags":[]}
{"id":"el-j0k1l2.2","type":"task","title":"Implement login endpoint","descriptionRef":"el-p6q7r8","status":"in_progress","priority":1,"complexity":3,"taskType":"task","assignee":"el-a1b2c3","createdAt":"2025-01-22T10:04:00Z","updatedAt":"2025-01-22T15:00:00Z","createdBy":"el-d4e5f6","tags":["backend"]}
```

---

## Appendix C: Dependency Examples

```jsonl
{"sourceId":"el-j0k1l2.1","targetId":"el-j0k1l2","type":"parent-child","createdAt":"2025-01-22T10:03:00Z","createdBy":"el-d4e5f6"}
{"sourceId":"el-j0k1l2.2","targetId":"el-j0k1l2","type":"parent-child","createdAt":"2025-01-22T10:04:00Z","createdBy":"el-d4e5f6"}
{"sourceId":"el-j0k1l2.2","targetId":"el-j0k1l2.1","type":"blocks","createdAt":"2025-01-22T10:04:00Z","createdBy":"el-d4e5f6"}
{"sourceId":"el-j0k1l2.2","targetId":"el-a1b2c3","type":"assigned-to","createdAt":"2025-01-22T15:00:00Z","createdBy":"el-d4e5f6"}
{"sourceId":"el-j0k1l2.1","targetId":"el-d4e5f6","type":"authored-by","createdAt":"2025-01-22T10:03:00Z","createdBy":"system"}
```

---

## Implementation Checklist

> **Note:** Active task tracking has moved to elemental's task system.
> Run `bun ./dist/bin/el.js ready` to see current tasks.
> This checklist is preserved for historical reference and as a guide for what has been completed.

Recommended implementation sequence:

### Phase 1: Foundation

- [x] types/element.md ✅ (Element type, validation, type guards, utilities, unit tests)
- [x] systems/id-generation.md ✅ (ID validation, parsing, SHA256/Base36 hashing, adaptive length, collision resolution, hierarchical IDs, unit tests)
- [x] systems/storage.md ✅ (Phase 1: Interface definitions; Phase 2: Bun backend with integration tests; Phase 3: Node.js backend with 33 vitest tests; Phase 5: Schema management - migrations, version tracking, validation; Phase 8: Unit tests, integration tests, migration tests - 251+ tests)
- [x] api/errors.md ✅ (core error types, codes, factories, type guards, unit tests)

### Phase 2: Core Types

- [x] types/entity.md ✅ (Phase 1: Entity interface, EntityTypeValue, type guards, validators, createEntity factory, unit tests)
- [x] types/document.md ✅ (Phase 1: Document interface, ContentType, type guards, validators, createDocument factory, updateDocumentContent, unit tests)
- [x] types/task.md ✅ (Phase 1: Task interface, HydratedTask, TaskStatus, Priority, Complexity, TaskTypeValue, type guards, validators, createTask factory, updateTaskStatus, softDeleteTask, status transition validation, utility functions, unit tests - 135 tests)
- [x] systems/events.md ✅ (Phase 1: Event interface, EventType unions, EventFilter, type guards, validators, createEvent factory, utility functions, unit tests - 129 tests; Phase 2-5,8: Schema with indexes (actor, event_type), CRUD event recording, value capture, queries by element/actor/time/type, integration tests - 40 tests)

### Phase 3: Dependencies

- [x] systems/dependencies.md ✅ (Phase 1-8 complete: Type definitions, validators, factories - 175 tests; DependencyService CRUD - 67 tests; Cycle detection with BFS - 33 tests; Blocked cache with invalidation - 60 tests; Gate dependencies (timer/approval/external) - tested in blocked-cache.test.ts; Ready/blocked queries with filtering - tested in API; CLI commands (dep add/remove/list/tree) - 308 CLI tests; Integration tests for ready/blocked work queries - 31 tests. Total: 366+ tests)

### Phase 4: Collections

- [x] types/plan.md ✅ (Phase 1: Plan interface, PlanStatus, type guards, validators, createPlan factory, updatePlanStatus, status transitions, progress calculation, canAutoComplete, filter/sort utilities, unit tests - 103 tests)
- [x] types/message.md ✅ (Phase 1: Message interface, HydratedMessage, MessageId/ChannelId branded types, type guards, validators, createMessage factory, immutability enforcement, threading utilities, filter/sort/grouping utilities, unit tests - 109 tests; Phase 2: Immutability enforcement complete)
- [x] types/channel.md ✅ (Phase 1: Channel interface, ChannelType, ChannelPermissions, Visibility, JoinPolicy, type guards, validators, createGroupChannel/createDirectChannel factories, deterministic naming, membership utilities, filter/sort/grouping utilities, unit tests - 153 tests)

### Phase 5: Advanced Features

- [x] types/workflow.md ✅ (Phase 1: Workflow interface, WorkflowStatus, WorkflowId/PlaybookId branded types, type guards, validators, createWorkflow factory, updateWorkflowStatus, squashWorkflow, status transitions, utility functions (filters, sorts, groups), GC helpers, unit tests - 121 tests)
- [x] types/playbook.md ✅ (Phase 1-4: Playbook interface, PlaybookStep, PlaybookVariable, VariableType, PlaybookId branded type, type guards, validators, createPlaybook/updatePlaybook factories, variable resolution system (resolveVariables, getVariableNames), condition system (parseCondition, evaluateCondition, isTruthy), substitution system (substituteVariables, extractVariableNames, hasVariables, filterStepsByConditions), utility functions (filters, sorts, grouping), unit tests - 230 tests)
- [x] types/library.md ✅ (Phase 1-2: Library interface, HydratedLibrary, LibraryId branded type, type guards, validators, createLibrary factory, updateLibrary, utility functions (filters, sorts, grouping, search, uniqueness), unit tests - 94 tests)
- [x] types/team.md ✅ (Phase 1-4: Team interface, HydratedTeam, TeamId branded type, type guards, validators, createTeam/updateTeam factories, membership operations (addMember, removeMember, isMember), utility functions (filters, sorts, grouping, search, uniqueness, team comparison), unit tests - 141 tests)

### Phase 6: Interfaces

- [x] api/query-api.md ✅ (Phase 1: Interface definitions, filter types, return types, type guards, validation helpers, unit tests - 110 tests; Phase 2-7: Full CRUD operations implementation - get/list/create/update/delete, task queries (ready/blocked), dependency operations, search/hydration, history operations, stats, export/import via SyncService - 70 integration tests)
- [x] api/configuration.md ✅ (Phase 1-5,7-8: Configuration interface, SyncConfig, PlaybookConfig, TombstoneConfig, IdentityConfigSection, defaults, YAML file loading/parsing, environment variable support, access API (getConfig, getValue, setValue, unsetValue), validation with helpful errors, unit tests - 115 tests)
- [x] api/sync.md ✅ (Phase 1: JSONL serialization/parsing; Phase 2: Full/incremental export; Phase 3: Import with merge; Phase 4: Merge strategy with LWW, tombstones, status, tags, dependencies; Phase 5: Dirty tracking integration; Phase 6: Content hashing with SHA256; Phase 7: CLI commands - export, import, status with options; Phase 9: Unit tests - 157 tests)
- [x] api/cli.md ✅ (Phase 1: Framework setup - native arg parsing, output formatting (human/JSON/quiet modes), global flags; Phase 2: Core commands - init, create (tasks), list, show, update, delete (src/cli/commands/crud.ts); Phase 3: Task commands - ready, blocked, close, reopen, assign, defer, undefer (src/cli/commands/task.ts); Phase 4: Dependency commands - dep add, dep remove, dep list, dep tree (src/cli/commands/dep.ts); Phase 6: Sync commands - export, import, status (src/cli/commands/sync.ts); Phase 6.5: Identity commands - whoami, identity mode (src/cli/commands/identity.ts); Phase 7: Admin commands - config (show/set/unset), stats, doctor (health checks, schema validation, 31 tests), migrate (schema migration with dry-run); Phase 8 partial: help text, database existence checking for read operations; Unit tests - 431+ tests)

### Phase 7: Identity

- [x] systems/identity.md ✅ (Phase 1: Type definitions - IdentityMode, Signature, PublicKey, SignedRequestFields, VerificationStatus, VerificationResult, IdentityConfig; Phase 2: Soft identity - ActorContext, ActorSource, resolveActor, validateSoftActor, lookupEntityByName, actor param on update/delete/addDependency - 18 integration tests; Phase 3-4: Ed25519 crypto - key validation, signature verification, signed data construction, time tolerance, full verification pipeline, shouldAllowRequest; Phase 7: CLI support - whoami command, identity mode command, --actor global flag; Phase 8: Unit tests - 176 tests)

---

## Remaining Implementation Items

### Storage & Infrastructure (Priority: High)

- [x] **systems/storage.md Phase 3**: Node.js backend ✅ (better-sqlite3 adapter in src/storage/node-backend.ts, 33 vitest tests in tests/node/node-backend.test.ts)
- [x] **systems/storage.md Phase 4**: Browser backend ✅ (sql.js adapter in src/storage/browser-backend.ts, OPFS integration via OpfsStorageManager, WASM loading, 35 tests)
- [x] **systems/storage.md Phase 6**: Dirty tracking ✅ (markDirty, getDirtyElements, clearDirty, clearDirtyElements in BunStorageBackend)
- [x] **systems/storage.md Phase 7**: Content hashing ✅ (computeContentHashSync in sync/hash.ts, integrated with create/update in elemental-api.ts, hash column in schema)
- [x] **systems/id-generation.md Phase 3**: Storage integration ✅ (element count query via StorageBackend.getElementCount(), IdLengthCache service with TTL and growth threshold)
- [x] **systems/id-generation.md Phase 5**: Hierarchical ID storage ✅ (child counter table, atomic counter increment via getNextChildNumber - 13+8 tests)

### Sync System (Priority: High)

- [x] **api/sync.md Phase 2**: Full export ✅ (SyncService.export with full/incremental modes, ephemeral filtering, file writing)
- [x] **api/sync.md Phase 3**: Import ✅ (SyncService.import with file reading, parsing, merge strategy, import ordering)
- [x] **api/sync.md Phase 5**: Dirty tracking integration ✅ (markDirty on mutations, clearDirty after export)
- [x] **api/sync.md Phase 7**: CLI commands ✅ (el export, el import, el status with full option support)
- [x] **api/sync.md Phase 8**: Browser sync ✅ (SyncHttpHandlers with pull/push/exchange endpoints, 24 tests in sync-handlers.test.ts)
- [x] **api/query-api.md Phase 7**: Update ElementalAPI export/import to use SyncService ✅ (export via SyncService.exportToString, import via SyncService.importFromStrings with element/dependency separation, merge strategy, dry-run, force, round-trip tests)

### Identity & Security (Priority: High)

- [x] **systems/identity.md Phase 2**: Soft identity (actor context management, name-based lookup, add actor to all operations) ✅ (ActorContext, resolveActor, validateSoftActor, lookupEntityByName, actor param)
- [x] **systems/identity.md Phase 4**: Verification middleware integration ✅ (createVerificationMiddleware - 11 tests)
- [x] **systems/identity.md Phase 5**: Key management ✅ (registration via createEntity, signed key rotation via rotateEntityKey with verification - 20 tests)
- [x] **systems/identity.md Phase 5**: Key revocation ✅ (revokeEntityKey with signature verification, constructKeyRevocationMessage, validateKeyRevocationInput, prepareKeyRevocation, isKeyRevoked, getKeyRevocationDetails, filterRevokedKeyEntities, filterNonRevokedKeyEntities - 35 tests)
- [x] **systems/identity.md Phase 6**: Document configuration ✅ (specs/api/configuration.md - identity modes, environment variables, CLI commands, examples)
- [x] **systems/identity.md Phase 7**: CLI support ✅ (--actor global flag, identity mode config via el identity mode, whoami command showing actor/source/mode/verification - 39 tests)
- [x] **systems/identity.md Phase 7**: Add signature for cryptographic mode ✅ (--sign-key, --sign-key-file global flags; el identity sign/verify/keygen/hash commands - 92 tests)

### Type Integration (Priority: Medium)

- [ ] **types/message.md Phase 4**: Implement `replies-to` dependency creation (requires DependencyService integration)
- [ ] **types/entity.md Phase 6**: Integrate with Task assignment
- [ ] **types/entity.md Phase 6**: Integrate with Message sender validation
- [ ] **types/entity.md Phase 6**: Integrate with Channel membership
- [ ] **types/entity.md Phase 6**: Integrate with Team membership
- [x] **types/task.md Phase 2**: Automatic blocked status computation ✅ (BlockedCacheService triggers auto_blocked/auto_unblocked events, stores previous_status in blocked_cache for restoration - 20 tests)
- [x] **types/task.md Phase 2**: Status change event emission ✅ (closed/reopened/updated events - 9 tests)
- [x] **types/task.md Phase 3**: Ready/blocked work queries ✅ (api.ready(), api.blocked() - 31 tests), assignment/deadline queries ✅ (TaskFilter.assignee, TaskFilter.owner, TaskFilter.hasDeadline, TaskFilter.deadlineBefore - 16 integration tests)
- [x] **types/task.md Phase 4**: Hydration ✅ (Document reference resolution, batch hydration for lists, hydrate option in ElementFilter - 18 tests)
- [x] **types/task.md Phase 5** (partial): Integration with blocked cache ✅ (automatic status transitions via BlockedCacheService callback, auto_blocked/auto_unblocked events)
- [x] **types/task.md Phase 5**: Further dependency system integration ✅ (PriorityService for dependency-based priority calculation, aggregateComplexity, ready query sorting by effective priority - 21 tests)
- [x] **types/entity.md Phase 2**: Name uniqueness validation ✅ (storage-level check in create(), DUPLICATE_NAME error)
- [x] **types/entity.md Phase 3**: Entity listing queries ✅ (name-based lookup, whoami, api.list({ type: 'entity' }))
- [x] **types/entity.md Phase 4**: Ed25519 signature verification integration, signature validation to API ✅ (systems/identity.ts)
- [x] **types/entity.md Phase 5** (partial): Entity update ✅ (updateEntity in src/types/entity.ts - publicKey, tags, metadata; 11 tests)
- [x] **types/entity.md Phase 5** (partial): Entity deactivation ✅ (deactivateEntity, reactivateEntity, isEntityActive, filterActiveEntities - 25 tests)
- [x] **types/entity.md Phase 5** (partial): Entity search/filter ✅ (filterByCreator, filterWithPublicKey, filterByTag, sortByName, groupByEntityType, searchByName, findByName, countByEntityType - 30 tests)
- [x] **types/entity.md Phase 5**: Entity assignment queries ✅ (getAssignedTo, getCreatedBy, getRelatedTo, countAssignmentsByEntity, getTopAssignees, hasAssignments, getUnassigned, getEntityAssignmentStats - 21 tests)
- [x] **types/document.md Phase 3-4**: Version table schema integration ✅ (schema migration 1), getDocumentVersion/getDocumentHistory ✅ (API implementation - 19 integration tests)
- [ ] **types/document.md Phase 4**: Add version filtering to list queries
- [ ] **types/document.md Phase 5**: Implement content type migration (optional)
- [x] **types/document.md Phase 6**: Integration with Task (description, design), Message (content, attachments), Library (parent-child) ✅ (hydration support in API, Document reference validation in message creation, library document association via parent-child dependencies)

### Collection Type Integration (Priority: Medium)

- [x] **types/plan.md Phase 2** (partial): Status change events ✅ (closed/reopened events for completed/cancelled transitions - 12 tests)
- [x] **types/plan.md Phase 3**: Task-to-plan linking ✅ (addTaskToPlan, removeTaskFromPlan, getTasksInPlan, createTaskInPlan API methods, hierarchical ID generation - 31 integration tests)
- [x] **types/plan.md Phase 4** (partial): Progress calculation ✅ (`getPlanProgress` API method, `calculatePlanProgress` utility - 12 integration tests); remaining: progress caching (optional), weighted progress (optional)
- [x] **types/plan.md Phase 5**: Bulk operations ✅ (`bulkClosePlanTasks`, `bulkDeferPlanTasks`, `bulkReassignPlanTasks`, `bulkTagPlanTasks` API methods with filter support - 39 integration tests)
- [x] **types/plan.md Phase 6**: Plan listing, tasks-in-plan query, progress in results ✅ (plan list/show/tasks CLI commands with progress display - 57 tests)
- [x] **types/plan.md Phase 7**: Integration ✅ (createTaskInPlan API, hierarchical IDs el-planid.n format, CLI commands for plan create/list/show/activate/complete/cancel/add-task/remove-task/tasks)
- [x] **types/workflow.md Phase 2-3**: Auto-completion/failure detection, pouring ✅ (shouldAutoComplete/shouldAutoFail/shouldAutoStart detection, pourWorkflow with playbook loading, variable resolution, condition evaluation, task creation, dependency wiring - 59 tests)
- [x] **types/workflow.md Phase 4-5**: Ephemeral support ✅ (filterOutEphemeralTasks in export, burnWorkflow, garbageCollectWorkflows, squashWorkflow, CLI commands - 14 tests)
- [x] **types/workflow.md Phase 6**: Workflow queries ✅ (getTasksInWorkflow, getReadyTasksInWorkflow, getWorkflowProgress, CLI commands for list/tasks/progress - integration tests)
- [ ] **types/workflow.md Phase 2 (remaining)**: Status change event emission (requires event service integration)
- [ ] **types/workflow.md Phase 5 (remaining)**: Task ordering queries
- [x] **types/playbook.md Phase 5**: Inheritance ✅ (resolveInheritanceChain, mergeVariables, mergeSteps, createPlaybookLoader - 42 tests)
- [x] **types/playbook.md Phase 6**: YAML support ✅ (parseYamlPlaybook, validateYamlPlaybook, discoverPlaybookFiles, loadPlaybookFromFile)
- [x] **types/playbook.md Phase 7**: Pour-time validation, validation CLI command ✅ (validatePour, el playbook validate with --var and --pour options)
- [x] **types/playbook.md Phase 8**: Integration ✅ (workflow creation integration, CLI commands - list, show, validate, create)
- [x] **types/channel.md Phase 2-4**: Find-or-create logic, name uniqueness, membership operations ✅ (findOrCreateDirectChannel, addChannelMember, removeChannelMember, leaveChannel, membership events - 27 integration tests)
- [x] **types/channel.md Phase 5**: Permissions ✅ (visibility checking, join policy enforcement, modifier validation)
- [x] **types/channel.md Phase 6**: Message integration ✅ (sender membership validation in create, sendDirectMessage helper, auto-create direct channels)
- [x] **types/channel.md Phase 7**: Channel search ✅ (searchChannels method with storage layer, filters by channelType/visibility/joinPolicy/member - 14 integration tests)
- [x] **types/message.md Phase 3-5**: Channel membership validation, Document reference validation, thread integrity, content/attachments hydration ✅ (validation in API create, hydration support)
- [ ] **types/message.md Phase 6**: Add pagination support (requires storage layer)
- [ ] **types/message.md Phase 7**: Integrate with Channel system
- [ ] **types/message.md Phase 7**: Integrate with event system
- [x] **types/library.md Phase 2-5**: Library deletion, document association, hierarchy ✅ (orphan handling on delete, add/remove document, multi-membership, nesting, cycle detection via dependency system, root listing, stats - 36 E2E tests)
- [x] **types/team.md Phase 2-6**: Team deletion, membership events, task integration, metrics ✅ (soft delete, member_added/removed events, team as assignee, getTasksForTeam, claimTaskFromTeam, getTeamMetrics - 26 integration tests)

### Events & Audit (Priority: Medium)

- [x] **systems/events.md Phase 3 (partial)**: Tag operations integration ✅ (tracked via update events)
- [x] **systems/events.md Phase 3**: Membership operations integration ✅ (member_added/member_removed events for Channel and Team - 27+26 integration tests)
- [x] **systems/events.md Phase 6**: Reconstruction ✅ (reconstructStateAtTime, generateTimelineSnapshots, reconstructAtTime/getElementTimeline API methods - 36 unit tests, 10 integration tests)
- [x] **systems/events.md Phase 7**: CLI integration ✅ (--events flag on show, history command with filtering, timeline/table formatting - 19 tests)
- [x] **systems/dependencies.md Phase 5**: Gate satisfaction API ✅ (satisfyGate, recordApproval, removeApproval - updates dependency metadata and recomputes blocking state - 23 tests)

### CLI Commands (Priority: Medium)

- [x] **api/cli.md Phase 5**: Collection commands ✅ (plan create/list/show/activate/complete/cancel/add-task/remove-task/tasks, workflow pour/list/show/burn/squash/gc/tasks/progress, playbook list/show/validate/create, channel create/join/leave/list/members/add/remove, library create/list/add/remove/docs/nest/roots/stats/delete, team create/add/remove/list/members/delete)
- [x] **api/cli.md Phase 6**: Sync commands ✅ (export, import, status - 46 tests)
- [x] **api/cli.md Phase 7**: Admin commands ✅ (config show/set/unset, stats - 11 tests, doctor - health checks, schema validation, integrity checks, 31 tests, migrate - schema migration with dry-run)
- [x] **api/cli.md Phase 8**: Shell completion, command aliases ✅ (bash/zsh/fish completion via el completion, 12 default aliases via el alias - 925+ tests)
- [x] **api/configuration.md Phase 6**: CLI commands ✅ (config show, set, unset, edit implemented in src/cli/commands/config.ts - 28 tests)
- [x] **types/task.md Phase 5 (partial)**: CLI commands for task operations ✅ (ready, blocked, close, reopen, assign, defer, undefer - 58 tests)
- [x] **types/task.md Phase 5 (partial)**: Integration with blocked cache ✅ (automatic status transitions via BlockedCacheService callback, auto_blocked/auto_unblocked events - 20 tests)
- [x] **types/entity.md Phase 6**: CLI commands ✅ (entity register, entity list - 40 tests; whoami - 39 tests)
- [x] **types/message.md Phase 7**: CLI commands ✅ (send, list, thread - channel-based messaging with thread support)

### Error Handling & Validation (Priority: Low)

- [x] **api/errors.md Phase 3**: Field validation integration, status validation integration ✅ (types have validators)
- [x] **api/errors.md Phase 4**: SQLite error mapping ✅ (mapStorageError handles unique, FK, busy, corruption errors)
- [x] **api/errors.md Phase 5**: CLI formatting ✅ (standard, verbose, quiet modes in src/cli/formatter.ts)
- [x] **api/errors.md Phase 6**: Documentation ✅ (common causes, resolutions, examples documented in Error Reference Guide section of errors.md)

### Testing & Performance (Priority: Low)

- [x] **systems/storage.md Phase 8**: Cross-runtime compatibility tests ✅ (cross-runtime.test.ts - 119 tests for Bun/Browser, tests/node/cross-runtime.test.ts - 57 tests for Node.js, covering connection management, SQL operations, transactions, schema, dirty tracking, hierarchical IDs)
- [x] **systems/dependencies.md Phase 8**: Performance tests for large dependency graphs ✅ (22 tests in dependency.perf.test.ts - cycle detection, cache rebuild, query benchmarks)
- [x] **api/query-api.md Phase 5**: Optimize batch fetching ✅ (batchFetchTags eliminates N+1 queries for list operations and hydration)
- [x] **api/query-api.md Phase 8**: Performance tests for queries ✅ (33 tests in src/api/query-performance.test.ts)
- [x] **types/task.md Phase 6**: Unit tests for status transitions, unit tests for ready/blocked computation with dependencies ✅ (priority-service.test.ts - 21 tests), E2E tests for task lifecycle ✅ (task.test.ts - 12 E2E lifecycle tests), integration tests for dependency-based priority ✅ (ready-blocked.integration.test.ts - 5 tests)
- [x] **types/task.md Phase 6**: Integration tests for hydration ✅ (task-hydration.integration.test.ts - 18 tests)
- [x] **types/message.md Phase 8**: Integration tests for threading, E2E tests for message flows ✅ (CLI tests: Direct Messaging Flow, Group Channel Messaging Flow, Threaded Conversation Flow, Channel Lifecycle with Messaging, Messaging Output Formats)
- [x] **types/document.md Phase 7** (partial): Integration tests for history queries ✅ (document-version.integration.test.ts - 19 tests)
- [ ] **types/document.md Phase 7**: E2E tests for Document lifecycle
- [x] **types/entity.md Phase 7** (partial): Integration tests for uniqueness ✅ (6 tests), signature verification tests ✅ (148 tests)
- [ ] **types/entity.md Phase 7**: E2E tests for entity lifecycle (deactivation, reactivation, assignment, membership)
- [x] **types/plan.md Phase 8**: Unit tests for status transitions, progress calculation; integration tests; E2E tests ✅ (103 unit tests, 31 integration tests, 17 E2E tests)
- [x] **types/workflow.md Phase 8**: Unit tests for pouring logic; integration tests for full pour flow; E2E tests ✅ (121 unit tests, 59 pour tests, 31 integration tests, 11 E2E tests)
- [x] **types/playbook.md Phase 9**: Unit tests for inheritance; integration tests for full pour; E2E tests ✅ (230 unit tests, 42 inheritance tests, integration tests in workflow-queries.integration.test.ts, E2E tests in playbook.test.ts)
- [x] **types/channel.md Phase 9**: Integration tests for membership ✅ (channel-membership.integration.test.ts - 27 tests); E2E tests for messaging flow ✅ (message.test.ts)
- [x] **types/library.md Phase 7**: Unit tests for association/hierarchy; integration tests; E2E tests ✅ (94 unit tests, 26 hierarchy tests, 13 multi-membership tests, 36 E2E tests)
- [x] **types/team.md Phase 8**: Integration tests for task assignment; E2E tests for team workflows ✅ (141 unit tests, 26 integration tests)
- [x] **api/sync.md Phase 9**: Integration tests for sync ✅ (24 tests in service.test.ts)
- [x] **api/configuration.md Phase 8**: Integration tests for CLI ✅ (20 tests in src/cli/commands/config.test.ts)
- [x] **api/errors.md Phase 7**: Integration tests for propagation, CLI output tests ✅ (propagation.integration.test.ts, errors-output.test.ts)

### Deferred/Optional Items (Priority: Low)

- [ ] **systems/id-generation.md Phase 4**: Add collision metrics/logging (deferred)
- [ ] **types/playbook.md Phase 6**: Add file watching for automatic playbook reload on change (optional, deferred)

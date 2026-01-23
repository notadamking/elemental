# Document Type Specification

Documents represent versioned content within Elemental. They store task descriptions, message content, knowledge base entries, and any other textual or structured data. Documents maintain full version history, enabling audit trails and rollback capabilities.

## Purpose

Documents provide:
- Versioned content storage
- Multiple content type support (text, markdown, JSON)
- Full history preservation
- Reusable content references
- Knowledge base foundation

## Properties

### Content

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `contentType` | `ContentType` | Yes | Format of the content |
| `content` | `string` | Yes | The actual content data |

### Versioning

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `version` | `number` | Yes | Version number, starts at 1 |
| `previousVersionId` | `DocumentId` | No | Reference to previous version |

## Content Types

### text

Plain text content:
- No validation beyond string type
- No formatting interpretation
- Used for simple notes, short descriptions

### markdown

Markdown-formatted content:
- Stored as raw markdown string
- No server-side validation of markdown syntax
- Client responsible for rendering
- Supports CommonMark specification

### json

Structured JSON content:
- Must be valid JSON (validated on create/update)
- Stored as JSON string (not parsed object)
- Enables structured data storage
- Schema validation is application-specific (not enforced by Elemental)

## Versioning Model

Documents use a versioned update model:

### Version Creation

When a Document is updated:
1. Current version is preserved in `document_versions` table
2. Main record is updated with new content
3. `version` is incremented
4. `previousVersionId` points to the snapshot
5. `updatedAt` is set to current time

### Version Chain

- `version` starts at 1 for new Documents
- Each update increments version by 1
- `previousVersionId` creates a linked list of versions
- Full history is traversable via the chain

### History Storage

| Table | Purpose |
|-------|---------|
| `elements` | Current (latest) version |
| `document_versions` | All previous versions |

This separation optimizes:
- Fast reads of current version
- History queries when needed
- Storage efficiency for current data

## Content Constraints

| Constraint | Value |
|------------|-------|
| Maximum content size | 10 MB |
| Maximum version count | Unlimited |
| Maximum metadata size | 64 KB |

## Usage Patterns

### Task Descriptions

- Referenced via `descriptionRef` in Task
- Typically markdown content
- Updated when task details change

### Technical Design

- Referenced via `designRef` in Task
- Markdown or JSON for structured specs
- Versioned as design evolves

### Message Content

- Referenced via `contentRef` in Message
- Immutable (message immutability)
- Various content types depending on message

### Message Attachments

- Referenced in `attachments` array
- Can be any content type
- Often files, images (as base64), or data

### Knowledge Base

- Organized in Libraries
- Standalone Documents for reference
- Versioned as knowledge evolves

## Library Membership

Documents can belong to Libraries:
- Via `parent-child` dependency
- A Document can be in multiple Libraries
- Library membership doesn't affect versioning

## Validation Rules

### All Content Types

- Content must be a string
- Content cannot be null or undefined
- Empty string is valid

### JSON Content Type

- Must parse as valid JSON
- `JSON.parse()` must not throw
- Validated on create and update
- Invalid JSON triggers `INVALID_INPUT` error

## Query Operations

### Get Current Version

Standard `get()` returns the current (latest) version.

### Get Specific Version

`getDocumentVersion(id, version)` returns a specific historical version.

### Get Version History

`getDocumentHistory(id)` returns all versions, newest first.

### List by Content Type

Filter Documents by `contentType` for type-specific queries.

## Implementation Methodology

### Storage Schema

Main `elements` table stores current version.
Separate `document_versions` table stores history:
- `id`: Document ID
- `version`: Version number
- `data`: JSON blob of content and metadata
- `created_at`: When this version was created

### Update Flow

1. Validate new content (especially for JSON type)
2. Copy current record to `document_versions`
3. Update main record with new content
4. Increment version number
5. Set `previousVersionId` to the snapshot
6. Update `updatedAt` timestamp
7. Emit `updated` event

### Version Retrieval

For specific version:
1. Check if requested version equals current version
2. If yes, return from `elements` table
3. If no, query `document_versions` table
4. Return null if version doesn't exist

### History Traversal

Two approaches:
1. **Forward**: Query `document_versions` by id, order by version
2. **Backward**: Follow `previousVersionId` chain from current

Forward query is more efficient for full history.

## Implementation Checklist

### Phase 1: Type Definitions
- [ ] Define `Document` interface extending `Element`
- [ ] Define `ContentType` union type
- [ ] Create type guards for Document validation

### Phase 2: Content Validation
- [ ] Implement text validation (passthrough)
- [ ] Implement markdown validation (passthrough)
- [ ] Implement JSON validation
- [ ] Add content size validation

### Phase 3: Versioning
- [ ] Implement version table schema
- [ ] Implement version creation on update
- [ ] Implement version number increment
- [ ] Implement previousVersionId linking

### Phase 4: History Queries
- [ ] Implement getDocumentVersion
- [ ] Implement getDocumentHistory
- [ ] Add version filtering to list queries

### Phase 5: Content Type Operations
- [ ] Add content type filtering
- [ ] Implement content type migration (optional)
- [ ] Add content type constraints

### Phase 6: Integration
- [ ] Integrate with Task (description, design)
- [ ] Integrate with Message (content, attachments)
- [ ] Integrate with Library (parent-child)
- [ ] Add CLI commands for Document operations

### Phase 7: Testing
- [ ] Unit tests for content validation
- [ ] Unit tests for versioning logic
- [ ] Integration tests for history queries
- [ ] E2E tests for Document lifecycle

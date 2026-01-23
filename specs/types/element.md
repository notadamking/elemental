# Element Base Type Specification

The base `Element` type is the foundational abstraction upon which all other types in Elemental are built. Every Task, Message, Document, Entity, and collection type extends Element and inherits its core properties.

## Purpose

The Element base type provides:
- Unified identity system across all types
- Consistent timestamp tracking
- Universal tagging and metadata capabilities
- Attribution to creating entity
- Foundation for polymorphic queries and operations

## Properties

### Identity

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | `ElementId` | Yes | Hash-based identifier, supports hierarchical format |
| `type` | `ElementType` | Yes | Discriminator for element subtype |

### Timestamps

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `createdAt` | `Timestamp` | Yes | ISO 8601 datetime when element was created |
| `updatedAt` | `Timestamp` | Yes | ISO 8601 datetime of last modification |

### Attribution

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `createdBy` | `EntityId` | Yes | Reference to the entity that created this element |

### Extensibility

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `tags` | `string[]` | Yes | User-defined tags for categorization (can be empty array) |
| `metadata` | `object` | Yes | Arbitrary key-value data (can be empty object) |

## Element Types

The `type` field discriminates between element subtypes:

- `task` - Work item to be tracked and completed
- `message` - Communication between entities
- `document` - Versioned content
- `entity` - Identity (agent, human, or system)
- `plan` - Collection of related tasks
- `workflow` - Executable task sequence
- `playbook` - Workflow template
- `channel` - Message container
- `library` - Document collection
- `team` - Entity collection

## Timestamp Format

All timestamps use ISO 8601 / RFC 3339 format with UTC timezone:
- Format: `YYYY-MM-DDTHH:mm:ss.sssZ`
- Example: `2025-01-22T10:00:00.000Z`
- Precision: Milliseconds
- Timezone: Always UTC (Z suffix)

## Tag Constraints

- Tags are case-sensitive strings
- Maximum 50 tags per element
- Maximum 100 characters per tag
- Valid characters: alphanumeric, hyphen, underscore, colon
- No leading/trailing whitespace
- No duplicate tags (set semantics)

## Metadata Constraints

- Keys must be valid JSON property names
- Values must be JSON-serializable
- Maximum 64KB total metadata size per element
- Reserved keys (prefixed with `_el_`) are for system use

## Inheritance Model

All element subtypes extend the base Element:

1. **Direct extensions**: Task, Message, Document, Entity
2. **Collection extensions**: Plan, Workflow, Playbook, Channel, Library, Team

Subtypes add their own required and optional fields while inheriting all base properties.

## Polymorphic Operations

The base Element type enables:
- Unified CRUD operations across all types
- Cross-type queries (e.g., "all elements by creator")
- Universal tagging and search
- Consistent event/audit trail structure

## Implementation Methodology

### Storage Representation

Elements are stored in a single `elements` table with:
- Common columns for base properties (`id`, `type`, `created_at`, etc.)
- JSON `data` column for type-specific fields
- Separate `tags` table for many-to-many tag relationships

### Type Safety

Runtime type guards must validate:
1. `type` field matches expected discriminator
2. Required base properties are present
3. Timestamps are valid ISO 8601
4. `createdBy` references a valid entity (if referential integrity enabled)

### Serialization

JSON serialization must:
- Preserve all base properties
- Include type-specific fields in the same object
- Serialize dates as ISO 8601 strings
- Maintain tag array order (for deterministic hashing)

## Implementation Checklist

### Phase 1: Type Definitions
- [x] Define `ElementId` branded type
- [x] Define `Timestamp` type alias
- [x] Define `ElementType` union type
- [x] Define `Element` interface with all base properties
- [x] Create type guards for Element validation

### Phase 2: Validation
- [x] Implement timestamp format validation
- [x] Implement tag constraint validation
- [x] Implement metadata size validation
- [x] Create comprehensive validation function

### Phase 3: Utilities
- [x] Implement timestamp formatting utilities
- [x] Implement tag normalization utilities
- [x] Create element factory functions (CreateElementInput type)
- [x] Implement deep equality comparison for elements

### Phase 4: Testing
- [x] Unit tests for type guards
- [x] Unit tests for validation functions
- [x] Unit tests for serialization/deserialization
- [x] Property-based tests for edge cases

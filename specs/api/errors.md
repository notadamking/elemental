# Error Handling Specification

The error handling system provides structured, actionable errors throughout Elemental, enabling consistent error handling across API, CLI, and storage layers.

## Purpose

The error handling system provides:
- Structured error types
- Consistent error codes
- Actionable error messages
- Error context preservation
- Cross-layer error propagation

## Error Structure

### ElementalError

Base error class for all Elemental errors:

| Field | Type | Description |
|-------|------|-------------|
| `message` | string | Human-readable description |
| `code` | ErrorCode | Machine-readable code |
| `details` | object | Additional context |
| `cause` | Error | Original error (if wrapped) |

### ErrorCode

Categorized error codes:

| Category | Prefix | Description |
|----------|--------|-------------|
| Validation | INVALID_* | Input validation failures |
| Not Found | *_NOT_FOUND | Resource not found |
| Conflict | * | State conflicts |
| Constraint | * | Constraint violations |
| Storage | * | Database errors |

## Error Codes

### Validation Errors

| Code | Description | HTTP Status |
|------|-------------|-------------|
| `INVALID_INPUT` | General validation failure | 400 |
| `INVALID_ID` | ID format invalid | 400 |
| `INVALID_STATUS` | Invalid status transition | 400 |
| `TITLE_TOO_LONG` | Title exceeds 500 chars | 400 |
| `INVALID_CONTENT_TYPE` | Unknown content type | 400 |
| `INVALID_JSON` | JSON content invalid | 400 |
| `MISSING_REQUIRED_FIELD` | Required field missing | 400 |

### Not Found Errors

| Code | Description | HTTP Status |
|------|-------------|-------------|
| `NOT_FOUND` | Element not found | 404 |
| `ENTITY_NOT_FOUND` | Referenced entity missing | 404 |
| `DOCUMENT_NOT_FOUND` | Referenced document missing | 404 |
| `CHANNEL_NOT_FOUND` | Channel not found | 404 |
| `PLAYBOOK_NOT_FOUND` | Playbook not found | 404 |

### Conflict Errors

| Code | Description | HTTP Status |
|------|-------------|-------------|
| `ALREADY_EXISTS` | Element with ID exists | 409 |
| `DUPLICATE_NAME` | Name already taken | 409 |
| `CYCLE_DETECTED` | Dependency cycle | 409 |
| `SYNC_CONFLICT` | Merge conflict | 409 |

### Constraint Errors

| Code | Description | HTTP Status |
|------|-------------|-------------|
| `IMMUTABLE` | Cannot modify immutable | 403 |
| `HAS_DEPENDENTS` | Cannot delete with deps | 409 |
| `INVALID_PARENT` | Invalid parent for hierarchy | 400 |
| `MAX_DEPTH_EXCEEDED` | Hierarchy too deep | 400 |
| `MEMBER_REQUIRED` | Must be channel member | 403 |

### Storage Errors

| Code | Description | HTTP Status |
|------|-------------|-------------|
| `DATABASE_ERROR` | SQLite error | 500 |
| `EXPORT_FAILED` | JSONL export failed | 500 |
| `IMPORT_FAILED` | JSONL import failed | 500 |
| `MIGRATION_FAILED` | Schema migration failed | 500 |

## Error Details

### Structure

Details provide additional context:

| Field | Type | When Present |
|-------|------|--------------|
| `field` | string | Field-specific errors |
| `value` | any | Invalid value |
| `expected` | any | Expected format/value |
| `actual` | any | Actual value received |
| `elementId` | string | Related element |
| `dependencyType` | string | Dependency errors |

### Examples

Invalid ID:
```
code: INVALID_ID
message: "Invalid element ID format"
details: { value: "abc", expected: "el-[a-z0-9]{3,8}" }
```

Cycle detected:
```
code: CYCLE_DETECTED
message: "Adding dependency would create cycle"
details: { sourceId: "el-abc", targetId: "el-xyz", type: "blocks" }
```

## Validation Rules

### Field Validation

| Field | Rule | Error Code |
|-------|------|------------|
| title | 1-500 characters | TITLE_TOO_LONG |
| name | 1-100 chars, alphanumeric | INVALID_INPUT |
| priority | 1-5 inclusive | INVALID_INPUT |
| complexity | 1-5 inclusive | INVALID_INPUT |
| contentType | text, markdown, json | INVALID_CONTENT_TYPE |
| content (json) | Valid JSON | INVALID_JSON |
| entityType | agent, human, system | INVALID_INPUT |
| channelType | direct, group | INVALID_INPUT |

### Status Transitions

Invalid transitions return `INVALID_STATUS`:

Task invalid transitions:
- `closed` → `blocked`, `deferred`
- `tombstone` → any

Workflow invalid transitions:
- `completed` → any (terminal)
- `failed` → any (terminal)
- `cancelled` → any (terminal)

## Error Handling Patterns

### API Layer

1. Catch storage errors
2. Map to ElementalError
3. Preserve original cause
4. Return structured error

### CLI Layer

1. Catch ElementalError
2. Format for terminal
3. Show code and message
4. Exit with appropriate code

### Storage Layer

1. Catch SQLite errors
2. Map to DATABASE_ERROR
3. Include SQL details (debug)
4. Preserve stack trace

## Error Messages

### Guidelines

Messages should be:
- Human-readable
- Actionable
- Specific
- Consistent

### Format

Pattern: `{Subject} {problem}: {details}`

Examples:
- "Element not found: el-abc123"
- "Invalid status transition: cannot move from closed to blocked"
- "Title too long: 543 characters (max 500)"

### Localization (Future)

Support for localized messages:
- Code used as key
- Details as interpolation values
- English default

## CLI Error Display

### Standard Error

```
Error: Element not found: el-abc123

  Code: NOT_FOUND

Try 'el list' to see available elements.
```

### Verbose Error

With `--verbose`:
```
Error: Element not found: el-abc123

  Code: NOT_FOUND
  Details: { id: "el-abc123", type: "task" }

Stack trace:
  at get (/src/api.ts:42)
  at main (/src/cli/show.ts:15)
  ...
```

### Quiet Error

With `--quiet`:
```
NOT_FOUND: el-abc123
```

## Exit Codes

| Code | Category | Codes |
|------|----------|-------|
| 0 | Success | - |
| 1 | General error | DATABASE_ERROR, etc. |
| 2 | Invalid arguments | INVALID_INPUT, etc. |
| 3 | Not found | NOT_FOUND, etc. |
| 4 | Validation | INVALID_STATUS, etc. |
| 5 | Permission | IMMUTABLE, etc. |

## Implementation Methodology

### Error Class Hierarchy

```
Error
└── ElementalError
    ├── ValidationError
    ├── NotFoundError
    ├── ConflictError
    ├── ConstraintError
    └── StorageError
```

### Error Creation

Factory functions for common errors:
- `notFound(type, id)`
- `invalidInput(field, value, expected)`
- `cycleDetected(source, target, type)`

### Error Mapping

SQLite to Elemental:
- UNIQUE constraint → ALREADY_EXISTS or DUPLICATE_NAME
- FOREIGN KEY → NOT_FOUND or ENTITY_NOT_FOUND
- CHECK constraint → INVALID_INPUT
- Other → DATABASE_ERROR

### Error Propagation

Preserve context through layers:
1. Original error as cause
2. Add details at each layer
3. Final error has full context

## Implementation Checklist

### Phase 1: Error Types ✅
- [x] Define ElementalError class
- [x] Define ErrorCode enum
- [x] Define error categories
- [x] Create type guards

### Phase 2: Factory Functions ✅
- [x] Create notFound factory
- [x] Create invalidInput factory
- [x] Create conflict factories
- [x] Create storage factories

### Phase 3: Validation Errors (Partial)
- [ ] Implement field validation (validation logic that uses errors)
- [ ] Implement status validation (validation logic that uses errors)
- [x] Create validation error factory

### Phase 4: Storage Mapping
- [ ] Map SQLite errors
- [x] Preserve original errors (via cause property)
- [x] Add context details (via details property)

### Phase 5: CLI Formatting
- [ ] Implement standard format
- [ ] Implement verbose format
- [ ] Implement quiet format
- [x] Map to exit codes (getExitCode function)

### Phase 6: Documentation
- [x] Document all error codes (in spec and code)
- [ ] Document common causes
- [ ] Document resolutions
- [ ] Add examples

### Phase 7: Testing ✅
- [x] Unit tests for each code
- [x] Unit tests for mapping
- [ ] Integration tests for propagation
- [ ] CLI output tests

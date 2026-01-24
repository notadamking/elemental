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
| `DUPLICATE_DEPENDENCY` | Dependency already exists | 409 |
| `CONCURRENT_MODIFICATION` | Element modified by another process (optimistic locking failure) | 409 |

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
| `DATABASE_BUSY` | Database locked/busy | 503 |
| `EXPORT_FAILED` | JSONL export failed | 500 |
| `IMPORT_FAILED` | JSONL import failed | 500 |
| `MIGRATION_FAILED` | Schema migration failed | 500 |

### Identity Errors

| Code | Description | HTTP Status |
|------|-------------|-------------|
| `INVALID_SIGNATURE` | Invalid signature format | 400 |
| `SIGNATURE_VERIFICATION_FAILED` | Signature verification failed | 401 |
| `SIGNATURE_EXPIRED` | Signature timestamp expired | 401 |
| `INVALID_PUBLIC_KEY` | Invalid public key format | 400 |
| `ACTOR_NOT_FOUND` | Actor not found for verification | 404 |
| `SIGNATURE_REQUIRED` | Request missing required signature | 401 |
| `NO_PUBLIC_KEY` | Entity has no public key | 400 |

---

## Error Reference Guide

This section provides detailed documentation for each error code, including common causes, resolution steps, and examples.

### Validation Errors Reference

#### INVALID_INPUT

**Description**: General validation failure when input doesn't meet expected criteria.

**Common Causes**:
- Priority value outside 1-5 range
- Complexity value outside 1-5 range
- Invalid entity type (must be: agent, human, system)
- Invalid channel type (must be: direct, group)
- Name exceeds 100 characters or contains invalid characters

**Resolution**:
1. Check the `details.field` property to identify which field failed validation
2. Review the `details.expected` property for valid values
3. Correct the input and retry

**Example**:
```
el create task --title "My Task" --priority 10

Error: Invalid priority: 10
  Code: INVALID_INPUT
  Details: { field: "priority", value: 10, expected: "1-5" }

Resolution: Use a priority value between 1 and 5.
```

#### INVALID_ID

**Description**: The provided element ID doesn't match the expected format.

**Common Causes**:
- ID missing the `el-` prefix
- ID contains invalid characters (must be lowercase alphanumeric)
- ID suffix too short (minimum 3 characters) or too long (maximum 8 characters)
- Invalid hierarchical ID format (e.g., `el-abc.x` instead of `el-abc.1`)

**Resolution**:
1. Verify the ID starts with `el-`
2. Ensure the suffix uses only lowercase letters and digits
3. For hierarchical IDs, use numeric segments separated by dots (e.g., `el-abc.1.2`)
4. Use `el list` to find valid element IDs

**Example**:
```
el show ABC123

Error: Invalid element ID format: ABC123
  Code: INVALID_ID
  Details: { value: "ABC123", expected: "el-[a-z0-9]{3,8}" }

Resolution: Use a valid ID format like 'el-abc123'.
```

#### INVALID_STATUS

**Description**: Attempted an invalid status transition for an element.

**Common Causes**:
- Trying to change a closed task to blocked or deferred
- Attempting to modify a tombstoned element
- Changing a completed/failed/cancelled workflow to any other status
- Skipping required intermediate status transitions

**Resolution**:
1. Check the current status with `el show <id>`
2. Review valid status transitions for the element type
3. For tasks: use `el reopen` before making other status changes
4. For workflows: terminal states cannot be changed

**Example**:
```
el update el-abc --status blocked
# (where el-abc is already closed)

Error: Invalid status transition: cannot move from closed to blocked
  Code: INVALID_STATUS
  Details: { actual: "closed", expected: "blocked" }

Resolution: Reopen the task first with 'el reopen el-abc'.
```

#### TITLE_TOO_LONG

**Description**: The provided title exceeds the maximum length of 500 characters.

**Common Causes**:
- Pasting content that includes a full description into the title field
- Including unnecessary details in the title

**Resolution**:
1. Shorten the title to 500 characters or fewer
2. Move detailed information to the notes field or description
3. Use a concise, descriptive title

**Example**:
```
el create task --title "$(cat long_text.txt)"

Error: Title too long: 543 characters (max 500)
  Code: TITLE_TOO_LONG
  Details: { actual: 543, expected: "<= 500" }

Resolution: Shorten the title and use --notes for additional details.
```

#### INVALID_CONTENT_TYPE

**Description**: The specified content type is not supported.

**Common Causes**:
- Typo in content type name
- Using an unsupported content format

**Resolution**:
1. Use one of the supported content types: `text`, `markdown`, `json`
2. Check for typos in the content type parameter

**Example**:
```
el create document --content-type html --content "<p>Hello</p>"

Error: Invalid content type: html
  Code: INVALID_CONTENT_TYPE
  Details: { value: "html", expected: ["text", "markdown", "json"] }

Resolution: Use 'text', 'markdown', or 'json' as the content type.
```

#### INVALID_JSON

**Description**: The provided JSON content is malformed or invalid.

**Common Causes**:
- Missing quotes around strings
- Trailing commas in arrays or objects
- Unescaped special characters
- Single quotes instead of double quotes

**Resolution**:
1. Validate JSON syntax using a JSON validator
2. Check for common JSON syntax errors
3. Ensure special characters are properly escaped

**Example**:
```
el create document --content-type json --content "{ name: 'test' }"

Error: Invalid JSON content: Unexpected token 'n'
  Code: INVALID_JSON
  Details: { value: "{ name: 'test' }" }

Resolution: Use valid JSON with double quotes: '{"name": "test"}'
```

#### MISSING_REQUIRED_FIELD

**Description**: A required field was not provided.

**Common Causes**:
- Omitting required parameters in CLI commands
- Missing required fields in API requests
- Empty or null values for required fields

**Resolution**:
1. Check the `details.field` property to identify the missing field
2. Provide the required field value
3. Use `el <command> --help` to see required parameters

**Example**:
```
el create task

Error: Missing required field: title
  Code: MISSING_REQUIRED_FIELD
  Details: { field: "title" }

Resolution: Provide a title: 'el create task --title "My Task"'
```

#### INVALID_TAG

**Description**: A tag value doesn't meet validation requirements.

**Common Causes**:
- Tag contains spaces or special characters
- Tag exceeds maximum length
- Empty tag value

**Resolution**:
1. Use lowercase alphanumeric characters and hyphens
2. Keep tags concise (under 50 characters)
3. Remove spaces from tags

**Example**:
```
el update el-abc --tags "my tag, another tag"

Error: Invalid tag "my tag": spaces not allowed
  Code: INVALID_TAG
  Details: { value: "my tag" }

Resolution: Use hyphenated tags: 'el update el-abc --tags "my-tag,another-tag"'
```

#### INVALID_TIMESTAMP

**Description**: A timestamp doesn't match the expected ISO 8601 format.

**Common Causes**:
- Using local time format instead of ISO 8601
- Missing timezone information
- Invalid date values (e.g., month 13)

**Resolution**:
1. Use ISO 8601 format: `YYYY-MM-DDTHH:mm:ss.sssZ`
2. Include timezone or use UTC with `Z` suffix
3. Validate date/time values are within valid ranges

**Example**:
```
el update el-abc --deadline "2024-13-01"

Error: Invalid timestamp format: 2024-13-01
  Code: INVALID_TIMESTAMP
  Details: { value: "2024-13-01", expected: "ISO 8601 format" }

Resolution: Use ISO 8601 format: '2024-12-01T00:00:00.000Z'
```

#### INVALID_METADATA

**Description**: The metadata object doesn't meet validation requirements.

**Common Causes**:
- Metadata is not a valid object
- Metadata contains circular references
- Metadata exceeds size limits

**Resolution**:
1. Ensure metadata is a valid JSON object
2. Remove circular references
3. Keep metadata concise

**Example**:
```
el update el-abc --metadata "not-an-object"

Error: Invalid metadata: must be an object
  Code: INVALID_METADATA

Resolution: Provide valid JSON object: --metadata '{"key": "value"}'
```

### Not Found Errors Reference

#### NOT_FOUND

**Description**: The requested element doesn't exist in the database.

**Common Causes**:
- Typo in element ID
- Element was deleted
- Element exists in a different database
- Using an ID from a different environment

**Resolution**:
1. Verify the element ID with `el list`
2. Check if the element was deleted with `el list --include-deleted`
3. Verify you're using the correct database (check `--db` flag)

**Example**:
```
el show el-xyz123

Error: Element not found: el-xyz123
  Code: NOT_FOUND
  Details: { elementId: "el-xyz123" }

Resolution: Use 'el list' to see available elements.
```

#### ENTITY_NOT_FOUND

**Description**: A referenced entity (user, agent, system) doesn't exist.

**Common Causes**:
- Assigning a task to a non-existent entity
- Referencing an entity that was deleted
- Typo in entity ID or name

**Resolution**:
1. Verify the entity exists with `el list entity`
2. Create the entity first if it doesn't exist
3. Check for typos in the entity reference

**Example**:
```
el assign el-abc el-unknown

Error: Entity not found: el-unknown
  Code: ENTITY_NOT_FOUND
  Details: { elementId: "el-unknown" }

Resolution: Create the entity first or use 'el list entity' to find valid entities.
```

#### DOCUMENT_NOT_FOUND

**Description**: A referenced document doesn't exist.

**Common Causes**:
- Document ID is incorrect
- Document was deleted
- Attaching a non-existent document to a message

**Resolution**:
1. Verify the document exists with `el list document`
2. Create the document first if needed
3. Check the document ID for typos

**Example**:
```
el message send --channel el-ch1 --attachments el-doc-missing

Error: Document not found: el-doc-missing
  Code: DOCUMENT_NOT_FOUND
  Details: { elementId: "el-doc-missing" }

Resolution: Create the document first or verify the ID with 'el list document'.
```

#### CHANNEL_NOT_FOUND

**Description**: The specified channel doesn't exist.

**Common Causes**:
- Channel ID is incorrect
- Channel was deleted
- Attempting to send a message to a non-existent channel

**Resolution**:
1. Verify the channel exists with `el list channel`
2. Create the channel first if needed
3. For direct messages, the channel may need to be created automatically

**Example**:
```
el message send --channel el-ch-unknown --content "Hello"

Error: Channel not found: el-ch-unknown
  Code: CHANNEL_NOT_FOUND
  Details: { elementId: "el-ch-unknown" }

Resolution: Create the channel first with 'el channel create'.
```

#### PLAYBOOK_NOT_FOUND

**Description**: The specified playbook doesn't exist or cannot be loaded.

**Common Causes**:
- Playbook file doesn't exist in the playbooks directory
- Playbook name has a typo
- Playbook YAML file has syntax errors

**Resolution**:
1. Check the playbooks directory for available playbooks
2. Verify the playbook filename matches the name used
3. Validate playbook YAML syntax

**Example**:
```
el workflow pour my-playbook

Error: Playbook not found: my-playbook
  Code: PLAYBOOK_NOT_FOUND
  Details: { elementId: "my-playbook" }

Resolution: Check .elemental/playbooks/ for available playbooks.
```

#### DEPENDENCY_NOT_FOUND

**Description**: The specified dependency relationship doesn't exist.

**Common Causes**:
- Attempting to remove a non-existent dependency
- Dependency was already removed
- Typo in source or target ID

**Resolution**:
1. List current dependencies with `el dep list <id>`
2. Verify both element IDs are correct
3. Check if the dependency was already removed

**Example**:
```
el dep remove el-abc el-xyz

Error: Dependency not found between el-abc and el-xyz
  Code: DEPENDENCY_NOT_FOUND
  Details: { sourceId: "el-abc", targetId: "el-xyz" }

Resolution: Use 'el dep list el-abc' to see existing dependencies.
```

### Conflict Errors Reference

#### ALREADY_EXISTS

**Description**: An element with the specified ID already exists.

**Common Causes**:
- Providing a custom ID that's already in use
- ID collision (rare with generated IDs)
- Re-running a creation command

**Resolution**:
1. Let the system generate a unique ID
2. Use a different custom ID
3. Update the existing element instead of creating

**Example**:
```
el create task --id el-abc --title "New Task"

Error: Task already exists: el-abc
  Code: ALREADY_EXISTS
  Details: { elementId: "el-abc" }

Resolution: Use a different ID or update the existing element.
```

#### DUPLICATE_NAME

**Description**: An element with the same name already exists (for types requiring unique names).

**Common Causes**:
- Creating a channel with an existing name
- Creating an entity with a duplicate name
- Creating a playbook with an existing name

**Resolution**:
1. Use a different name
2. Update the existing element if appropriate
3. Use `el list` to see existing names

**Example**:
```
el channel create --name "general"

Error: Channel with name "general" already exists
  Code: DUPLICATE_NAME
  Details: { value: "general" }

Resolution: Use a different channel name or use the existing channel.
```

#### CYCLE_DETECTED

**Description**: Adding the dependency would create a circular dependency.

**Common Causes**:
- Task A blocks Task B, and adding Task B blocks Task A
- Complex chains of dependencies that loop back
- Parent-child relationships that create cycles

**Resolution**:
1. Review the dependency structure with `el dep tree <id>`
2. Identify the cycle path
3. Restructure dependencies to avoid the cycle
4. Consider if the dependency relationship is correct

**Example**:
```
el dep add el-task1 el-task2 --type blocks
# where el-task2 already blocks el-task1

Error: Adding dependency would create cycle: el-task1 -> el-task2
  Code: CYCLE_DETECTED
  Details: { sourceId: "el-task1", targetId: "el-task2", dependencyType: "blocks" }

Resolution: Use 'el dep tree el-task1' to visualize dependencies and restructure.
```

#### SYNC_CONFLICT

**Description**: A merge conflict occurred during sync operation.

**Common Causes**:
- Same element modified in multiple locations
- Concurrent edits during sync
- Conflicting changes in JSONL import

**Resolution**:
1. Review the conflicting changes
2. Manually resolve the conflict
3. Re-run the sync with conflict resolution strategy

**Example**:
```
el sync import changes.jsonl

Error: Sync conflict for element: el-abc
  Code: SYNC_CONFLICT
  Details: { elementId: "el-abc", localVersion: 3, remoteVersion: 4 }

Resolution: Resolve the conflict manually or use --force to overwrite.
```

#### DUPLICATE_DEPENDENCY

**Description**: The dependency relationship already exists.

**Common Causes**:
- Adding a dependency that was already added
- Running the same dependency command twice

**Resolution**:
1. The dependency is already in place, no action needed
2. Use `el dep list` to verify existing dependencies

**Example**:
```
el dep add el-task1 el-task2 --type blocks

Error: Dependency already exists between el-task1 and el-task2
  Code: DUPLICATE_DEPENDENCY
  Details: { sourceId: "el-task1", targetId: "el-task2" }

Resolution: Dependency already exists. Use 'el dep list el-task1' to verify.
```

### Constraint Errors Reference

#### IMMUTABLE

**Description**: Attempted to modify an immutable element.

**Common Causes**:
- Editing a message (messages are immutable after creation)
- Modifying a tombstoned element
- Changing audit trail events

**Resolution**:
1. Messages cannot be edited; create a new message instead
2. For other elements, check if they're marked as immutable
3. Some operations may require creating new versions instead

**Example**:
```
el update el-msg1 --content "New content"

Error: Cannot modify immutable message: el-msg1
  Code: IMMUTABLE
  Details: { elementId: "el-msg1" }

Resolution: Messages are immutable. Send a new message instead.
```

#### HAS_DEPENDENTS

**Description**: Cannot delete an element that has dependent elements.

**Common Causes**:
- Deleting a task that blocks other tasks
- Removing a parent element with children
- Deleting a library with documents

**Resolution**:
1. Remove or reassign dependent elements first
2. Use `el dep list <id>` to see dependents
3. Consider using cascade delete if available

**Example**:
```
el delete el-task1

Error: Cannot delete element with 3 dependent(s): el-task1
  Code: HAS_DEPENDENTS
  Details: { elementId: "el-task1", actual: 3 }

Resolution: Remove dependencies first with 'el dep remove' or delete dependents.
```

#### INVALID_PARENT

**Description**: The specified parent element is invalid for the hierarchy.

**Common Causes**:
- Setting a document as parent of a task
- Creating circular parent relationships
- Parent doesn't exist or is wrong type

**Resolution**:
1. Verify the parent element type is compatible
2. Check that the parent exists
3. Ensure no circular relationships would be created

**Example**:
```
el library add-to el-lib1 --parent el-doc1

Error: Invalid parent el-doc1: must be a library
  Code: INVALID_PARENT
  Details: { elementId: "el-doc1" }

Resolution: Use a library element as parent, not a document.
```

#### MAX_DEPTH_EXCEEDED

**Description**: The operation would exceed the maximum allowed hierarchy depth.

**Common Causes**:
- Nesting libraries or categories too deeply
- Exceeding maximum 3-level ID hierarchy
- Creating overly complex organizational structures

**Resolution**:
1. Flatten the hierarchy structure
2. Reorganize elements to reduce nesting
3. Consider using tags or metadata instead of deep hierarchies

**Example**:
```
el library create --parent el-lib.1.2.3

Error: Maximum hierarchy depth exceeded: 4 (max 3)
  Code: MAX_DEPTH_EXCEEDED
  Details: { actual: 4, expected: "<= 3" }

Resolution: Restructure to use fewer nesting levels.
```

#### MEMBER_REQUIRED

**Description**: The operation requires channel membership.

**Common Causes**:
- Sending a message to a channel you're not a member of
- Accessing channel content without membership
- Performing member-only operations

**Resolution**:
1. Join the channel first
2. Have a channel admin add you as a member
3. Create a new channel where you are a member

**Example**:
```
el message send --channel el-ch1 --sender el-user1 --content "Hello"

Error: Entity el-user1 must be a member of channel el-ch1
  Code: MEMBER_REQUIRED
  Details: { elementId: "el-ch1" }

Resolution: Add the entity to the channel first with 'el channel add-member'.
```

#### TYPE_MISMATCH

**Description**: The element type doesn't match what was expected.

**Common Causes**:
- Using task commands on non-task elements
- Adding wrong element type to a collection
- Type confusion in API calls

**Resolution**:
1. Verify the element type with `el show <id>`
2. Use the appropriate command for the element type
3. Check the element ID is correct

**Example**:
```
el close el-doc1

Error: Element type mismatch: expected task, got document
  Code: TYPE_MISMATCH
  Details: { expected: "task", actual: "document" }

Resolution: Use 'el close' only for tasks. For documents, use appropriate commands.
```

#### ALREADY_IN_PLAN

**Description**: The task is already part of a plan.

**Common Causes**:
- Adding a task to a second plan
- Task was previously added to a plan

**Resolution**:
1. Remove the task from its current plan first
2. Use a different task
3. Check which plan contains the task with `el show <task-id>`

**Example**:
```
el plan add-task el-plan1 el-task1

Error: Task el-task1 is already in a plan
  Code: ALREADY_IN_PLAN
  Details: { elementId: "el-task1" }

Resolution: Remove the task from its current plan first, or use a different task.
```

### Storage Errors Reference

#### DATABASE_ERROR

**Description**: A general database error occurred.

**Common Causes**:
- Database file corruption
- Disk space issues
- Invalid SQL operations
- Connection problems

**Resolution**:
1. Check disk space availability
2. Verify database file permissions
3. Run `el doctor` to check database health
4. Consider restoring from backup if corrupted

**Example**:
```
el list

Error: Database error: SQLITE_CORRUPT
  Code: DATABASE_ERROR

Resolution: Run 'el doctor' to diagnose. May need to restore from backup.
```

#### DATABASE_BUSY

**Description**: The database is locked by another process.

**Common Causes**:
- Multiple processes accessing the database simultaneously
- Long-running transaction holding a lock
- Crashed process left lock in place

**Resolution**:
1. Wait and retry the operation
2. Close other applications using the database
3. Check for crashed processes and clean up locks

**Example**:
```
el create task --title "Test"

Error: Database busy: locked by another process
  Code: DATABASE_BUSY

Resolution: Wait for other operations to complete, or check for stale locks.
```

#### EXPORT_FAILED

**Description**: Failed to export data to JSONL format.

**Common Causes**:
- Insufficient disk space
- Permission denied on output file
- Invalid export path
- Data serialization errors

**Resolution**:
1. Check disk space
2. Verify write permissions on the output directory
3. Use a valid output path
4. Check for data that cannot be serialized

**Example**:
```
el sync export /readonly/path/export.jsonl

Error: Export failed: permission denied
  Code: EXPORT_FAILED

Resolution: Use a writable directory for the export file.
```

#### IMPORT_FAILED

**Description**: Failed to import data from JSONL format.

**Common Causes**:
- Malformed JSONL file
- Missing required fields in import data
- Incompatible schema version
- File not found

**Resolution**:
1. Validate the JSONL file format
2. Ensure all required fields are present
3. Check schema version compatibility
4. Verify the import file exists

**Example**:
```
el sync import corrupted.jsonl

Error: Import failed: invalid JSON on line 42
  Code: IMPORT_FAILED

Resolution: Fix the JSON syntax error on line 42 of the import file.
```

#### MIGRATION_FAILED

**Description**: Database schema migration failed.

**Common Causes**:
- Incompatible database version
- Missing migration script
- Data incompatible with new schema
- Interrupted migration

**Resolution**:
1. Check the migration logs for details
2. Backup data before retrying
3. May need to restore from backup
4. Contact support for complex migrations

**Example**:
```
el init

Error: Migration to version 3 failed: constraint violation
  Code: MIGRATION_FAILED
  Details: { version: 3 }

Resolution: Backup current database and check migration logs for details.
```

### Identity Errors Reference

#### INVALID_SIGNATURE

**Description**: The signature format is invalid.

**Common Causes**:
- Corrupted signature data
- Wrong encoding (expected base64)
- Truncated signature

**Resolution**:
1. Regenerate the signature
2. Verify signature encoding is correct
3. Check for data corruption in transit

**Example**:
```
Error: Invalid signature format
  Code: INVALID_SIGNATURE
  Details: { expected: "base64-encoded Ed25519 signature" }

Resolution: Regenerate the signature using the correct format.
```

#### SIGNATURE_VERIFICATION_FAILED

**Description**: The signature doesn't match the content.

**Common Causes**:
- Content was modified after signing
- Wrong public key used for verification
- Signature is for different content

**Resolution**:
1. Verify the content hasn't been modified
2. Check the correct public key is being used
3. Re-sign the content if needed

**Example**:
```
Error: Signature verification failed
  Code: SIGNATURE_VERIFICATION_FAILED

Resolution: Content may have been modified. Re-sign with the correct key.
```

#### SIGNATURE_EXPIRED

**Description**: The signature timestamp has expired.

**Common Causes**:
- Signature was created too long ago
- System clock skew between signer and verifier
- Replay of old signed request

**Resolution**:
1. Generate a new signature with current timestamp
2. Check system clock synchronization
3. Increase signature validity window if appropriate

**Example**:
```
Error: Signature timestamp expired
  Code: SIGNATURE_EXPIRED
  Details: { signedAt: "2024-01-01T00:00:00Z", expiredAt: "2024-01-01T00:05:00Z" }

Resolution: Generate a fresh signature with current timestamp.
```

#### INVALID_PUBLIC_KEY

**Description**: The public key format is invalid.

**Common Causes**:
- Wrong key format (expected Ed25519)
- Corrupted key data
- Private key provided instead of public

**Resolution**:
1. Verify the key is a valid Ed25519 public key
2. Check key encoding (expected base64)
3. Ensure you're using the public key, not private

**Example**:
```
el entity create --name "Agent" --public-key "invalid"

Error: Invalid public key format
  Code: INVALID_PUBLIC_KEY
  Details: { expected: "base64-encoded Ed25519 public key" }

Resolution: Provide a valid Ed25519 public key in base64 format.
```

#### ACTOR_NOT_FOUND

**Description**: The actor entity for signature verification doesn't exist.

**Common Causes**:
- Entity was deleted
- Wrong actor ID in request
- Entity not yet created

**Resolution**:
1. Create the entity first
2. Verify the actor ID is correct
3. Check if the entity was deleted

**Example**:
```
Error: Actor not found for verification: el-agent1
  Code: ACTOR_NOT_FOUND
  Details: { elementId: "el-agent1" }

Resolution: Create the entity first with 'el create entity'.
```

#### SIGNATURE_REQUIRED

**Description**: The operation requires a signature but none was provided.

**Common Causes**:
- Missing signature in authenticated request
- Signature header omitted
- Authentication not configured

**Resolution**:
1. Sign the request with the actor's private key
2. Include the signature in the request
3. Check authentication configuration

**Example**:
```
Error: Request missing required signature
  Code: SIGNATURE_REQUIRED

Resolution: Sign the request with the actor's private key.
```

#### NO_PUBLIC_KEY

**Description**: The entity has no public key for signature verification.

**Common Causes**:
- Entity created without a public key
- Soft identity mode (no cryptographic identity)
- Public key was removed

**Resolution**:
1. Update the entity to add a public key
2. Use soft identity mode if cryptographic verification isn't needed
3. Generate and register a key pair for the entity

**Example**:
```
Error: Entity el-agent1 has no public key for verification
  Code: NO_PUBLIC_KEY
  Details: { elementId: "el-agent1" }

Resolution: Update the entity to add a public key, or use soft identity mode.
```

---

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

### Phase 3: Validation Errors ✅
- [x] Implement field validation ✅ (validateTitle, validatePriority, validateComplexity, etc. in types/*.ts)
- [x] Implement status validation ✅ (validateStatusTransition, validateTaskStatus, etc. in types/*.ts)
- [x] Create validation error factory

### Phase 4: Storage Mapping ✅
- [x] Map SQLite errors (mapStorageError in src/storage/errors.ts - unique, FK, busy, corruption)
- [x] Preserve original errors (via cause property)
- [x] Add context details (via details property)

### Phase 5: CLI Formatting ✅
- [x] Implement standard format (HumanFormatter in src/cli/formatter.ts)
- [x] Implement verbose format (VerboseFormatter with details and exit codes)
- [x] Implement quiet format (QuietFormatter in src/cli/formatter.ts)
- [x] Map to exit codes (getExitCode function)

### Phase 6: Documentation ✅
- [x] Document all error codes (in spec and code)
- [x] Document common causes
- [x] Document resolutions
- [x] Add examples

### Phase 7: Testing ✅
- [x] Unit tests for each code
- [x] Unit tests for mapping
- [x] Integration tests for propagation (src/errors/propagation.integration.test.ts)
- [x] CLI output tests (src/cli/errors-output.test.ts)

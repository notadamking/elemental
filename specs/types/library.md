# Library Type Specification

Libraries are collections of related Documents, providing organization for knowledge bases, documentation, and content management. Documents can belong to multiple Libraries and Libraries can be nested hierarchically.

## Purpose

Libraries provide:
- Document organization and grouping
- Knowledge base structure
- Hierarchical content organization
- Multi-membership for Documents
- Content discovery and browsing

## Properties

### Content

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `name` | `string` | Yes | Library name, 1-100 characters |
| `descriptionRef` | `DocumentId` | No | Reference to description Document |

## Document Association

Documents belong to Libraries via `parent-child` dependency:

### Relationship

- Library is the parent
- Documents are children
- Documents can have multiple parents (multiple libraries)
- Libraries can be children of other Libraries (nesting)

### Adding Documents

1. Create `parent-child` dependency from document to library
2. Document now appears in library listings
3. Multiple libraries: create multiple dependencies

### Removing Documents

1. Remove `parent-child` dependency
2. Document still exists but no longer in library
3. Does not affect other library memberships

## Library Hierarchy

Libraries can be nested:

### Structure

- Root libraries: No parent
- Sub-libraries: Have library as parent
- Depth: Unlimited (practical limits apply)

### Querying

- Root libraries: Libraries with no library parent
- Children: Direct children of a library
- Descendants: All nested content recursively
- Ancestors: All parent libraries recursively

### Example

```
Technical Docs (library)
├── API Reference (library)
│   ├── auth.md (document)
│   └── users.md (document)
├── Guides (library)
│   ├── Getting Started (library)
│   │   └── intro.md (document)
│   └── Advanced (library)
│       └── custom.md (document)
└── overview.md (document)
```

## Multi-Membership

A Document can belong to multiple Libraries:

### Use Cases

- Cross-referencing (API doc in both "API" and "Security")
- Curated collections (Best practices from multiple sources)
- Views (same content, different organization)

### Behavior

- Document appears in all parent library listings
- Deleting from one library doesn't affect others
- No duplicate entries in same library

## Library Operations

### Create Library

1. Validate name uniqueness (optional: within parent scope)
2. Create library element
3. Optionally create as child of parent library

### Add Document

1. Verify document exists
2. Verify library exists
3. Create `parent-child` dependency
4. Emit event

### Remove Document

1. Verify dependency exists
2. Remove `parent-child` dependency
3. Emit event
4. Document remains (not deleted)

### Nest Library

1. Verify both libraries exist
2. Create `parent-child` dependency from child to parent
3. Check for cycles
4. Emit event

### Delete Library

Options for handling contents:
1. **Orphan**: Remove dependencies, documents remain
2. **Cascade**: Delete all child documents (careful!)
3. **Prevent**: Reject if library has contents

Default: Orphan (safest)

## Query Patterns

### Library Queries

- List all root libraries
- List libraries by creator
- List children of library
- Get library by name

### Document Queries

- List documents in library
- List documents in library and descendants
- List documents not in any library
- Search documents within library

### Ancestry Queries

- Get parent libraries of document
- Get all ancestor libraries
- Get path from root to document

## Content Statistics

Libraries track aggregate information:

| Metric | Description |
|--------|-------------|
| Document Count | Direct children documents |
| Total Documents | Including descendants |
| Sub-library Count | Direct children libraries |
| Total Sub-libraries | Including nested |

Computed on demand or cached.

## Versioning Context

Documents in Libraries are versioned:
- Library contains references to documents
- References always point to current version
- Version history accessible via document API
- Library membership doesn't affect versioning

## Implementation Methodology

### Storage

Libraries stored in `elements` table:
- `type = 'library'`
- Type-specific fields in JSON `data`

### Document Association

Via dependency system:
- `parent-child` dependency from document to library
- Query: `getDependents(libraryId, ['parent-child'])`

### Hierarchy Traversal

Recursive queries for descendants:
- Use recursive CTE in SQL
- Or application-level recursion with caching

### Multi-Membership

Multiple `parent-child` dependencies:
- One per library membership
- Query all parents of a document
- No special handling needed

## Implementation Checklist

### Phase 1: Type Definitions
- [x] Define `Library` interface extending `Element`
- [x] Create type guards for Library validation (isLibrary, validateLibrary)
- [x] Define `HydratedLibrary` interface with hydrated fields
- [x] Define `LibraryId` branded type
- [x] Define validation constants (MIN/MAX_LIBRARY_NAME_LENGTH)
- [x] Implement name validation (isValidLibraryName, validateLibraryName)
- [x] Implement ID validation (isValidLibraryId, validateLibraryId)

### Phase 2: Basic Operations
- [x] Implement library creation (createLibrary factory)
- [x] Implement library update (updateLibrary with name, descriptionRef)
- [x] Implement utility functions (hasDescription, getLibraryDisplayName)
- [x] Implement filter functions (filterByCreator, filterWithDescription, filterWithoutDescription)
- [x] Implement sort functions (sortByName, sortByCreationDate, sortByUpdateDate)
- [x] Implement grouping functions (groupByCreator)
- [x] Implement search functions (searchByName, findByName, findById)
- [x] Implement uniqueness check (isNameUnique)
- [ ] Implement library deletion (with orphan handling)

### Phase 3: Document Association
- [ ] Implement add document to library (via dependency system)
- [ ] Implement remove document from library (via dependency system)
- [ ] Implement multi-membership (via multiple parent-child dependencies)
- [ ] Implement document listing

### Phase 4: Hierarchy
- [ ] Implement library nesting (via parent-child dependency)
- [ ] Implement cycle detection (leverage existing dependency cycle detection)
- [ ] Implement descendant queries
- [ ] Implement ancestor queries

### Phase 5: Queries
- [ ] Implement root library listing
- [ ] Implement library search within hierarchy
- [ ] Implement document search within library
- [ ] Implement statistics calculation (document count, sub-library count)

### Phase 6: CLI Commands
- [ ] library create
- [ ] library list
- [ ] library add (document)
- [ ] library remove (document)

### Phase 7: Testing
- [x] Unit tests for type definitions (94 tests)
- [x] Unit tests for validation functions
- [x] Unit tests for factory functions
- [x] Unit tests for utility functions
- [ ] Unit tests for association (Phase 3)
- [ ] Unit tests for hierarchy (Phase 4)
- [ ] Integration tests for multi-membership (Phase 3)
- [ ] E2E tests for library organization

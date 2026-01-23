# ID Generation System Specification

The ID generation system creates unique, collision-resistant identifiers for all elements. It uses content-based hashing to prevent collisions in concurrent multi-agent scenarios and supports hierarchical IDs for parent-child relationships.

## Purpose

The ID generation system provides:
- Unique identifiers across distributed systems
- Collision resistance for concurrent creation
- Hierarchical IDs for parent-child relationships
- Adaptive length for storage efficiency
- Human-readable format

## ID Format

### Structure

IDs follow the format: `{prefix}-{hash}`

| Component | Description | Example |
|-----------|-------------|---------|
| Prefix | Fixed identifier | `el` |
| Separator | Hyphen | `-` |
| Hash | Base36 encoded hash | `a3f8e9` |

### Hierarchical Extension

Child elements extend parent ID: `{parentId}.{childNumber}`

| Level | Format | Example |
|-------|--------|---------|
| Root | `el-{hash}` | `el-a3f8e9` |
| Child | `el-{hash}.{n}` | `el-a3f8e9.1` |
| Grandchild | `el-{hash}.{n}.{m}` | `el-a3f8e9.1.2` |

Maximum depth: 3 levels

## Hash Generation

### Input Components

The hash is computed from:

| Component | Description |
|-----------|-------------|
| Title/Name | Primary identifier of element |
| CreatedBy | Entity creating the element |
| Timestamp | Nanosecond-precision creation time |
| Nonce | Collision resolution counter (0-9) |

### Algorithm

1. Concatenate: `title|createdBy|timestamp_ns|nonce`
2. Compute SHA256 hash
3. Encode result as Base36 (0-9, a-z)
4. Truncate to adaptive length
5. Prefix with `el-`
6. Check for collision
7. If collision, increment nonce and retry
8. If nonce exhausted, increase length and retry

### Base36 Encoding

Characters: `0123456789abcdefghijklmnopqrstuvwxyz`

Benefits:
- URL-safe (no special characters)
- Case-insensitive comparison possible
- Compact representation
- Human-readable

## Adaptive Length

ID length adapts based on database size to balance:
- Collision probability
- Storage efficiency
- Human usability

### Birthday Paradox Thresholds

| Length | ~50% Collision at | Recommended Range |
|--------|-------------------|-------------------|
| 3 | ~160 elements | 0-100 |
| 4 | ~980 elements | 100-500 |
| 5 | ~5,900 elements | 500-3,000 |
| 6 | ~35,000 elements | 3,000-20,000 |
| 7 | ~212,000 elements | 20,000-100,000 |
| 8 | ~1,000,000+ | 100,000+ |

### Length Selection

1. Query current element count
2. Find smallest length with <1% collision probability
3. Use that length for new IDs
4. Periodically recalculate as database grows

### Minimum Length

- Default minimum: 4 characters
- Ensures some collision resistance even at start
- Configurable via settings

## Collision Resolution

### Detection

Before ID is accepted:
1. Check if ID exists in database
2. If exists, collision occurred
3. Attempt resolution

### Resolution Steps

1. **Nonce increment**: Try nonces 0-9
2. **Length increase**: If all nonces fail, increase length
3. **Final fallback**: At max length (8), keep trying nonces

### Concurrent Safety

Multiple agents creating simultaneously:
- Each uses current timestamp (nanosecond precision)
- Different timestamps produce different hashes
- Nonce handles rare same-nanosecond creation
- Database constraint enforces uniqueness

## Hierarchical IDs

### Child Counter

Each element tracks its last child number:

| Table | Columns |
|-------|---------|
| `child_counters` | parent_id, last_child |

### Child ID Generation

1. Get parent ID (e.g., `el-abc`)
2. Query/create child counter for parent
3. Increment counter atomically
4. Generate child ID: `{parentId}.{counter}`
5. Example: `el-abc.1`, `el-abc.2`, etc.

### Depth Limit

Maximum 3 levels of hierarchy:
- Level 0: `el-abc`
- Level 1: `el-abc.1`
- Level 2: `el-abc.1.1`
- Level 3: `el-abc.1.1.1` (maximum)

Deeper nesting rejected with error.

### Hierarchy Parsing

Given ID `el-abc.1.2`:
- Root: `el-abc`
- Parent: `el-abc.1`
- Self: `el-abc.1.2`
- Depth: 2

## ID Validation

### Format Validation

Valid ID patterns:
- Root: `^el-[0-9a-z]{3,8}$`
- Hierarchical: `^el-[0-9a-z]{3,8}(\.[0-9]+){1,3}$`

### Validation Checks

1. Starts with `el-`
2. Hash portion is 3-8 Base36 characters
3. Child segments (if any) are positive integers
4. Maximum 3 child segments

## Type-Specific Considerations

### Elements with Title

Tasks, Plans, Workflows, Playbooks:
- Use title in hash input
- Provides semantic connection

### Elements with Name

Entities, Channels, Libraries, Teams:
- Use name in hash input
- Names are unique, so collision unlikely

### Documents and Messages

Content-based elements:
- Use content hash or first N characters
- Or use generic timestamp-based generation

## Implementation Methodology

### Hash Function

Use platform-native SHA256:
- Bun: `Bun.CryptoHasher`
- Node: `crypto.createHash`
- Browser: `crypto.subtle.digest`

### Atomic Operations

Child counter increment must be atomic:
- SQLite: Use transaction with immediate lock
- Increment and read in single statement

### Caching

Cache current length threshold:
- Query count periodically (not per-ID)
- Cache length for batch operations
- Invalidate on significant growth

## Implementation Checklist

### Phase 1: Core Types ✅
- [x] Define ID type aliases (IdComponents, ParsedId, IdGeneratorInput, IdGeneratorConfig)
- [x] Define validation regex patterns (ROOT_ID_PATTERN, HIERARCHICAL_ID_PATTERN)
- [x] Create ID validation function (isValidIdFormat, isValidRootId, isValidHierarchicalId, validateIdFormat)
- [x] Create ID parsing function (parseId, getIdRoot, getIdParent, getIdDepth)

### Phase 2: Hash Generation ✅
- [x] Implement SHA256 wrapper (Web Crypto API - cross-platform)
- [x] Implement Base36 encoding (toBase36)
- [x] Implement hash truncation (truncateHash)
- [x] Implement full hash generation (generateIdHash, generateId)

### Phase 3: Adaptive Length (partial - storage integration pending)
- [ ] Implement element count query (requires storage)
- [x] Implement length calculation (calculateIdLength)
- [ ] Implement length caching (requires storage)
- [x] Add length configuration (IdGeneratorConfig.hashLength, elementCount)

### Phase 4: Collision Resolution ✅
- [x] Implement collision check (via checkCollision callback)
- [x] Implement nonce iteration (MAX_NONCE = 9)
- [x] Implement length increase fallback
- [ ] Add collision metrics/logging (deferred)

### Phase 5: Hierarchical IDs ✅
- [x] Implement child counter table ✅ (src/storage/schema.ts migration001)
- [x] Implement atomic counter increment ✅ (getNextChildNumber, getChildCounter, resetChildCounter in storage backends - 13+8 tests)
- [x] Implement child ID generation (generateChildId)
- [x] Implement depth limit check (MAX_HIERARCHY_DEPTH = 3)

### Phase 6: Validation ✅
- [x] Implement format validation
- [x] Implement hierarchy parsing
- [x] Add validation to all ID inputs
- [x] Create helpful error messages

### Phase 7: Testing ✅
- [x] Unit tests for hash generation (88 tests)
- [x] Unit tests for Base36 encoding
- [x] Unit tests for collision resolution
- [x] Unit tests for hierarchical IDs
- [x] Stress tests for concurrent generation
- [x] Property-based tests for uniqueness

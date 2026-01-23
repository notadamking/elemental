# Entity Type Specification

Entities represent identities within Elemental - AI agents, humans, or system processes. They are the actors that create, modify, and interact with all other elements. Entities support both soft (name-based) and cryptographic (key-based) identity models.

## Purpose

Entities provide:
- Identity management for all actors
- Attribution for all actions
- Assignment targets for tasks
- Membership in channels and teams
- Optional cryptographic verification

## Properties

### Identity

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `name` | `string` | Yes | System-wide unique identifier |
| `entityType` | `EntityType` | Yes | Classification of the entity |

### Cryptographic Identity

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `publicKey` | `string` | No | Ed25519 public key, base64 encoded |

## Entity Types

### agent

Represents an AI agent:
- Automated actors performing work
- May have capabilities defined in metadata
- Often assigned to tasks automatically
- Can operate autonomously

Metadata examples:
- `model`: AI model identifier
- `capabilities`: Array of capability strings
- `systemPromptHash`: Hash of system prompt for verification

### human

Represents a human user:
- Manual actors in the system
- Typically set deadlines and priorities
- May approve or review agent work
- Can override agent decisions

Metadata examples:
- `email`: Contact email
- `displayName`: Human-readable name
- `timezone`: Preferred timezone

### system

Represents system processes:
- Automated infrastructure
- Background jobs
- Integration services
- Not assigned to work tasks

Metadata examples:
- `serviceName`: Name of the service
- `version`: Service version
- `endpoint`: API endpoint if applicable

## Name Constraints

Entity names must be unique and follow these rules:

| Constraint | Rule |
|------------|------|
| Uniqueness | System-wide unique |
| Case sensitivity | Case-sensitive |
| Pattern | `^[a-zA-Z][a-zA-Z0-9_-]*$` |
| Length | 1-100 characters |
| Reserved | `system`, `anonymous`, `unknown` |

### Valid Examples
- `agent-alice`
- `human_bob`
- `Claude3Opus`
- `ci-pipeline-1`

### Invalid Examples
- `_starts-with-underscore` (must start with letter)
- `has spaces` (no spaces allowed)
- `system` (reserved)
- `` (empty string)

## Soft Identity Mode

Default mode where identity is name-based:

- Any actor can claim any entity name
- No cryptographic verification
- Suitable for trusted environments
- Simple setup, no key management

### Trust Model

In soft mode:
- Trust is implicit
- Impersonation is possible
- Audit trail records claimed identity
- No federation support

### Use Cases

- Local development
- Single-system deployments
- Trusted team environments
- Prototyping and testing

## Cryptographic Identity Mode

Optional mode with key-based verification:

- Entity has Ed25519 public key
- Actions include signature
- Signatures verified against public key
- Enables cross-system trust

### Key Format

- Algorithm: Ed25519
- Encoding: Base64
- Storage: `publicKey` field
- Private key: Managed externally

### Signature Format

When enabled, actions include:
- `signature`: Base64-encoded Ed25519 signature
- `signedAt`: Timestamp of signing
- `signedData`: Hash of signed content

### Verification

1. Extract signature from action
2. Retrieve entity's public key
3. Verify signature against action data
4. Reject if verification fails

### Trust Model

In cryptographic mode:
- Identity cryptographically verified
- Impersonation prevented
- Audit trail is tamper-evident
- Federation possible

### Use Cases

- Multi-system deployments
- Untrusted environments
- Compliance requirements
- Federation scenarios

## Hybrid Mode

Systems can operate in hybrid mode:

- Some entities have public keys (verified)
- Some entities use soft identity (unverified)
- Queries can filter by verification status
- Gradual migration path

## Entity Lifecycle

### Registration

1. Choose unique name
2. Specify entity type
3. Optionally provide public key
4. Create entity record

### Operations

Entities can:
- Create elements (attribution)
- Be assigned to tasks
- Send messages
- Join channels and teams
- Approve/sign-off on work

### Deactivation

Entities are not deleted but can be deactivated:
- Mark as inactive in metadata
- Remove from teams/channels
- Reassign owned tasks
- Historical references preserved

## Attribution

All elements track their creator via `createdBy`:
- References Entity by ID
- Immutable after creation
- Enables audit queries
- Supports access control patterns

## Implementation Methodology

### Storage

Entities stored in `elements` table with:
- `type = 'entity'`
- Type-specific fields in JSON `data` column
- Unique index on `name` (via separate validation)

### Name Uniqueness

Enforced via:
1. Application-level validation on create
2. Database constraint (name + type='entity')
3. Conflict error if duplicate

### Key Management

For cryptographic mode:
1. Entity generates keypair externally
2. Public key provided during registration
3. Private key never stored in Elemental
4. Signatures computed externally

### Signature Verification

When enabled:
1. Extract signature from request
2. Reconstruct signed data
3. Fetch entity's public key
4. Verify using Ed25519
5. Reject if invalid

## Implementation Checklist

### Phase 1: Type Definitions ✅
- [x] Define `Entity` interface extending `Element`
- [x] Define `EntityType` union type (`EntityTypeValue`)
- [x] Create type guards for Entity validation (`isEntity`, `validateEntity`)
- [x] Factory function (`createEntity`)
- [x] Unit tests for type definitions

### Phase 2: Name Management ✅
- [x] Implement name uniqueness validation ✅ (src/api/elemental-api.ts - checks for existing entity with same name)
- [x] Implement name format validation (`isValidEntityName`, `validateEntityName`)
- [x] Add reserved name checking (`isReservedName`, `RESERVED_NAMES`)
- [x] Create name conflict error handling ✅ (throws ConflictError with DUPLICATE_NAME code)
- [x] Unit tests for name validation ✅ (6 new tests in soft-identity.integration.test.ts)

### Phase 3: Soft Identity ✅
- [x] Implement entity registration (`createEntity`)
- [x] Implement name-based lookup ✅ (src/api/elemental-api.ts - lookupEntityByName)
- [x] Add entity listing queries ✅ (api.list({ type: 'entity' }) - 3 tests in soft-identity.integration.test.ts)
- [x] Implement `whoami` functionality ✅ (src/cli/commands/identity.ts - whoamiCommand)

### Phase 4: Cryptographic Identity (Partial ✅)
- [x] Add public key storage (field defined, validation implemented)
- [ ] Implement Ed25519 signature verification (systems/identity.md)
- [ ] Add signature validation to API
- [x] Create key format validation (`isValidPublicKey`, `validatePublicKey`)
- [x] Unit tests for public key validation

### Phase 5: Entity Operations
- [ ] Implement entity update (metadata only)
- [ ] Implement entity deactivation
- [ ] Add entity search/filter
- [ ] Implement entity assignment queries

### Phase 6: Integration
- [ ] Integrate with Task assignment
- [ ] Integrate with Message sender validation
- [ ] Integrate with Channel membership
- [ ] Integrate with Team membership
- [ ] Add CLI commands (register, list pending; whoami ✅ in src/cli/commands/identity.ts)

### Phase 7: Testing (Partial ✅)
- [x] Unit tests for name validation
- [ ] Unit tests for signature verification
- [x] Integration tests for uniqueness ✅ (6 tests in soft-identity.integration.test.ts)
- [ ] E2E tests for entity lifecycle
- [x] Property-based tests for name generation

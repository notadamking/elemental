# Identity System Specification

The identity system manages entity authentication and verification, supporting both soft (name-based) and cryptographic (key-based) identity models. It enables trust establishment for single-system and federated deployments.

## Purpose

The identity system provides:
- Entity identity management
- Soft identity for trusted environments
- Cryptographic identity for verification
- Signature generation and verification
- Hybrid mode for gradual adoption

## Identity Modes

### Soft Identity (Default)

Name-based identity without verification:

| Aspect | Behavior |
|--------|----------|
| Registration | Any name can be claimed |
| Verification | None (trust-based) |
| Impersonation | Possible |
| Federation | Not supported |
| Use Case | Trusted, single-system |

### Cryptographic Identity

Key-based identity with verification:

| Aspect | Behavior |
|--------|----------|
| Registration | Requires public key |
| Verification | Signature checked |
| Impersonation | Prevented |
| Federation | Supported |
| Use Case | Untrusted, multi-system |

### Hybrid Mode

Mix of soft and cryptographic:
- Some entities have keys (verified)
- Some entities use soft identity (unverified)
- System accepts both
- Queries can filter by verification status

## Key Format

### Algorithm

Ed25519 (EdDSA over Curve25519):
- Fast signing and verification
- Small keys (32 bytes)
- Small signatures (64 bytes)
- Widely supported

### Encoding

| Component | Format |
|-----------|--------|
| Public Key | Base64 (44 chars) |
| Private Key | Base64 (44 chars, never stored) |
| Signature | Base64 (88 chars) |

### Key Generation

Keys generated externally:
- Entity generates keypair
- Public key registered with Elemental
- Private key managed by entity
- Elemental never sees private keys

## Signature Verification

### Signed Request Structure

Cryptographic requests include:

| Field | Description |
|-------|-------------|
| `signature` | Base64 Ed25519 signature |
| `signedAt` | Timestamp of signing |
| `actor` | Entity name making request |

### Signed Data Construction

Data to sign:
```
actor + "|" + signedAt + "|" + requestHash
```

Where `requestHash` is SHA256 of request body.

### Verification Process

1. Extract signature fields from request
2. Construct signed data string
3. Look up entity's public key
4. Verify signature against signed data
5. Check signedAt is recent (within tolerance)
6. Reject if verification fails

### Time Tolerance

`signedAt` must be within tolerance:
- Default: 5 minutes
- Prevents replay attacks
- Allows clock skew
- Configurable

## Entity Registration

### Soft Registration

1. Choose unique name
2. Specify entity type
3. Create entity element
4. No key required

### Cryptographic Registration

1. Generate keypair externally
2. Choose unique name
3. Specify entity type
4. Provide public key
5. Optionally sign registration request
6. Create entity element

### Key Update

Entities can update their public key:
1. Sign update request with current key
2. Include new public key
3. Verify signature with old key
4. Update stored public key

## Actor Context

### Request Context

Every API call has actor context:
- From CLI: `--actor` flag or config
- From SDK: explicitly provided
- From HTTP: header or auth token
- System calls: `system` actor

### Actor Resolution

1. Check for explicit actor in request
2. Fall back to authenticated user
3. Fall back to configured default
4. Error if no actor determinable

### Actor Validation

For soft mode:
- Verify entity exists (optional)
- Accept any name (relaxed)

For cryptographic mode:
- Verify entity exists
- Verify signature
- Reject unsigned requests

## Attribution

### createdBy Field

All elements have `createdBy`:
- Set to actor at creation
- Immutable after creation
- Links element to creator

### Event Actor

All events have `actor`:
- Set to actor making change
- Records responsibility
- Enables attribution queries

## Federated Identity (Future)

### Cross-System Trust

With cryptographic identity:
- Entities have global identity (key-based)
- Systems verify signatures independently
- No central authority needed
- Trust by key verification

### Entity Resolution

Across systems:
1. Entity provides public key
2. Remote system verifies signature
3. Actions attributed to key-holder
4. Name may differ per system

## Configuration

### Identity Mode

Configure in `config.yaml`:
- `identity_mode: soft` (default)
- `identity_mode: cryptographic`
- `identity_mode: hybrid`

### Soft Mode Relaxations

- Skip signature verification
- Allow unregistered actors
- Trust claimed identity

### Cryptographic Mode Strictness

- Require signatures on all writes
- Require registered entities
- Verify all claims

## Implementation Methodology

### Key Management

Public keys stored in Entity element:
- `publicKey` field
- Null for soft-identity entities
- Validated on store

### Signature Library

Use platform-native Ed25519:
- Bun: TBD (may need noble-ed25519)
- Node: `crypto.sign`/`crypto.verify`
- Browser: `noble-ed25519` or `tweetnacl`

### Verification Middleware

For cryptographic mode:
1. Intercept incoming requests
2. Extract signature fields
3. Perform verification
4. Reject if invalid
5. Set actor context if valid

### Mode Switching

Allow runtime mode switching:
- Read mode from config
- Check mode on each request
- Mode affects validation strictness

## Implementation Checklist

### Phase 1: Type Definitions
- [x] Define identity mode types (IdentityMode: soft, cryptographic, hybrid)
- [x] Define signature types (Signature, PublicKey branded types, SignedRequestFields, SignedData)
- [x] Define verification result types (VerificationStatus, VerificationResult)
- [x] Create configuration types (IdentityConfig, DEFAULT_IDENTITY_CONFIG)

### Phase 2: Soft Identity
- [x] Implement actor context management (ActorContext, ActorSource, resolveActor, validateSoftActor)
- [x] Implement name-based lookup (lookupEntityByName in ElementalAPI)
- [x] Add actor to all operations (update, delete, addDependency via options parameter)
- [x] Test soft mode flows (18 integration tests)

### Phase 3: Cryptographic Infrastructure
- [x] Select Ed25519 library per platform (Web Crypto API with Bun)
- [x] Implement key validation (isValidPublicKey, validatePublicKey, isValidSignature, validateSignature)
- [x] Implement signature generation helpers (signEd25519, generateEd25519Keypair)
- [x] Implement signature verification (verifyEd25519Signature)

### Phase 4: Verification Flow ✅
- [x] Implement signed data construction (constructSignedData, parseSignedData)
- [x] Implement time tolerance checking (checkTimeTolerance, validateTimeTolerance2)
- [x] Implement full verification pipeline (verifySignature, shouldAllowRequest)
- [x] Add verification middleware ✅ (createVerificationMiddleware in src/systems/identity.ts - 11 tests)

### Phase 5: Key Management ✅
- [x] Implement key registration ✅ (createEntity with publicKey validation, entity register --public-key CLI)
- [x] Implement key update (signed) ✅ (rotateEntityKey with signature verification, constructKeyRotationMessage, validateKeyRotationInput, prepareKeyRotation - 20 tests)
- [ ] Implement key revocation (future/optional)

### Phase 6: Configuration
- [x] Add identity mode config (IdentityConfig type)
- [x] Implement mode switching (shouldAllowRequest)
- [x] Add tolerance settings (timeTolerance, DEFAULT_TIME_TOLERANCE)
- [ ] Document configuration

### Phase 7: CLI Support
- [x] Add --actor flag globally (src/cli/parser.ts - global flag definition)
- [x] Add identity mode to config (el identity mode, el identity mode <mode>)
- [ ] Add signature for cryptographic mode
- [x] Add whoami command (el whoami - shows actor, source, mode, verification status)
- [x] Unit tests for CLI identity commands (39 tests)

### Phase 8: Testing
- [x] Unit tests for signature verification (106 tests)
- [x] Unit tests for time tolerance
- [x] Integration tests for modes
- [x] Security tests for impersonation (tampered request detection)

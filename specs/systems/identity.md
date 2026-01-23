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
- [ ] Define identity mode types
- [ ] Define signature types
- [ ] Define verification result types
- [ ] Create configuration types

### Phase 2: Soft Identity
- [ ] Implement actor context management
- [ ] Implement name-based lookup
- [ ] Add actor to all operations
- [ ] Test soft mode flows

### Phase 3: Cryptographic Infrastructure
- [ ] Select Ed25519 library per platform
- [ ] Implement key validation
- [ ] Implement signature generation helpers
- [ ] Implement signature verification

### Phase 4: Verification Flow
- [ ] Implement signed data construction
- [ ] Implement time tolerance checking
- [ ] Implement full verification pipeline
- [ ] Add verification middleware

### Phase 5: Key Management
- [ ] Implement key registration
- [ ] Implement key update (signed)
- [ ] Implement key revocation (future)

### Phase 6: Configuration
- [ ] Add identity mode config
- [ ] Implement mode switching
- [ ] Add tolerance settings
- [ ] Document configuration

### Phase 7: CLI Support
- [ ] Add --actor flag globally
- [ ] Add identity mode to config
- [ ] Add signature for cryptographic mode
- [ ] Add whoami command

### Phase 8: Testing
- [ ] Unit tests for signature verification
- [ ] Unit tests for time tolerance
- [ ] Integration tests for modes
- [ ] Security tests for impersonation

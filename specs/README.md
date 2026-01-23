# Elemental Specifications Index

This directory contains all technical specifications for the Elemental library. Specifications document design decisions, implementation details, and serve as the source of truth for how the system should work.

## How to Use This Index

1. **Finding specs**: Use the search keywords in the tables below
2. **Adding specs**: Create spec file, then add entry to appropriate table
3. **Updating specs**: Keep specs synchronized with implementation
4. **Implementing**: Follow the implementation checklists in each spec

---

## Master Specification

| Path | Description | Keywords |
|------|-------------|----------|
| [PLAN.md](./PLAN.md) | Complete technical specification for Elemental | overview, architecture, design, types, storage, api, cli |

---

## Type Specifications

Specifications for all element types in the system.

### Core Elements

| Path | Description | Keywords |
|------|-------------|----------|
| [types/element.md](./types/element.md) | Base Element type specification | element, base, id, timestamps, tags, metadata, createdBy |
| [types/task.md](./types/task.md) | Task type for work tracking | task, status, priority, complexity, assignee, deadline, blocked, ready |
| [types/message.md](./types/message.md) | Immutable message type | message, immutable, channel, sender, threading, attachments |
| [types/document.md](./types/document.md) | Versioned content type | document, content, versioning, markdown, json, history |
| [types/entity.md](./types/entity.md) | Identity type for agents/humans | entity, identity, agent, human, system, name, publicKey |

### Collection Types

| Path | Description | Keywords |
|------|-------------|----------|
| [types/plan.md](./types/plan.md) | Task collection type (Epic) | plan, epic, collection, progress, draft, active, completed |
| [types/workflow.md](./types/workflow.md) | Executable task sequences | workflow, execution, ephemeral, durable, pour, burn, squash |
| [types/playbook.md](./types/playbook.md) | Workflow templates | playbook, template, variables, steps, conditions, inheritance |
| [types/channel.md](./types/channel.md) | Message containers | channel, direct, group, membership, permissions, visibility |
| [types/library.md](./types/library.md) | Document collections | library, knowledge, hierarchy, organization, nested |
| [types/team.md](./types/team.md) | Entity collections | team, members, group, assignment, pool |

---

## System Specifications

Specifications for core system components.

| Path | Description | Keywords |
|------|-------------|----------|
| [systems/dependencies.md](./systems/dependencies.md) | Dependency system | dependency, blocks, parent-child, awaits, relates-to, cycle, blocked-cache |
| [systems/id-generation.md](./systems/id-generation.md) | ID generation system | id, hash, sha256, base36, collision, hierarchical, adaptive |
| [systems/storage.md](./systems/storage.md) | Storage architecture | storage, sqlite, jsonl, dual, bun, node, browser, wasm, schema |
| [systems/events.md](./systems/events.md) | Audit trail system | events, audit, trail, history, actor, changes, immutable |
| [systems/identity.md](./systems/identity.md) | Identity system | identity, soft, cryptographic, ed25519, signature, verification |

---

## API Specifications

Specifications for interfaces and APIs.

| Path | Description | Keywords |
|------|-------------|----------|
| [api/query-api.md](./api/query-api.md) | Query API specification | api, query, crud, filter, hydration, search, ready, blocked |
| [api/cli.md](./api/cli.md) | Command-line interface | cli, commands, flags, output, json, quiet, terminal |
| [api/configuration.md](./api/configuration.md) | Configuration system | config, yaml, environment, precedence, settings |
| [api/sync.md](./api/sync.md) | Sync system | sync, jsonl, export, import, merge, conflict, dirty |
| [api/errors.md](./api/errors.md) | Error handling | errors, codes, validation, not-found, conflict, messages |

---

## Specification Template

When creating new specifications, include these sections:

```markdown
# [Feature] Specification

## Purpose
What this feature/system provides.

## Properties / Structure
Tables defining the data model.

## Behavior
How the system behaves in various scenarios.

## Implementation Methodology
How to implement this feature.

## Implementation Checklist
- [ ] Phase 1 tasks
- [ ] Phase 2 tasks
- [ ] Testing tasks
```

---

## Status Legend

Specifications may include status indicators:

| Status | Meaning |
|--------|---------|
| Draft | Initial design, may change |
| Review | Ready for review |
| Approved | Finalized, ready for implementation |
| Implemented | Code complete |
| Tested | Tests complete |

---

## Quick Reference

### Finding Information

| Topic | Primary Spec | Related Specs |
|-------|--------------|---------------|
| Creating tasks | types/task.md | systems/dependencies.md, api/query-api.md |
| Sending messages | types/message.md | types/channel.md, types/document.md |
| Workflow templates | types/playbook.md | types/workflow.md |
| Ready work queries | systems/dependencies.md | types/task.md, api/query-api.md |
| Data persistence | systems/storage.md | api/sync.md |
| Identity/auth | systems/identity.md | types/entity.md |
| Error handling | api/errors.md | All API specs |

### Implementation Checklist

Recommended implementation sequence:

#### Phase 1: Foundation
- [x] types/element.md ✅ (Element type, validation, type guards, utilities, unit tests)
- [x] systems/id-generation.md ✅ (ID validation, parsing, SHA256/Base36 hashing, adaptive length, collision resolution, hierarchical IDs, unit tests)
- [x] systems/storage.md ✅ (Phase 1: Interface definitions; Phase 2: Bun backend with integration tests; Phase 5: Schema management - migrations, version tracking, validation; Phase 8: Unit tests, integration tests, migration tests - 218 tests)
- [x] api/errors.md ✅ (core error types, codes, factories, type guards, unit tests)

#### Phase 2: Core Types
- [x] types/entity.md ✅ (Phase 1: Entity interface, EntityTypeValue, type guards, validators, createEntity factory, unit tests)
- [x] types/document.md ✅ (Phase 1: Document interface, ContentType, type guards, validators, createDocument factory, updateDocumentContent, unit tests)
- [x] types/task.md ✅ (Phase 1: Task interface, HydratedTask, TaskStatus, Priority, Complexity, TaskTypeValue, type guards, validators, createTask factory, updateTaskStatus, softDeleteTask, status transition validation, utility functions, unit tests - 135 tests)
- [x] systems/events.md ✅ (Phase 1: Event interface, EventType unions, EventFilter, type guards, validators, createEvent factory, utility functions, unit tests - 129 tests; Phase 2-5,8: Schema with indexes (actor, event_type), CRUD event recording, value capture, queries by element/actor/time/type, integration tests - 40 tests)

#### Phase 3: Dependencies
- [x] systems/dependencies.md ✅ (Phase 1-8 complete: Type definitions, validators, factories - 175 tests; DependencyService CRUD - 67 tests; Cycle detection with BFS - 33 tests; Blocked cache with invalidation - 60 tests; Gate dependencies (timer/approval/external) - tested in blocked-cache.test.ts; Ready/blocked queries with filtering - tested in API; CLI commands (dep add/remove/list/tree) - 308 CLI tests; Integration tests for ready/blocked work queries - 31 tests. Total: 366+ tests)

#### Phase 4: Collections
- [x] types/plan.md ✅ (Phase 1: Plan interface, PlanStatus, type guards, validators, createPlan factory, updatePlanStatus, status transitions, progress calculation, canAutoComplete, filter/sort utilities, unit tests - 103 tests)
- [x] types/message.md ✅ (Phase 1: Message interface, HydratedMessage, MessageId/ChannelId branded types, type guards, validators, createMessage factory, immutability enforcement, threading utilities, filter/sort/grouping utilities, unit tests - 109 tests; Phase 2: Immutability enforcement complete)
- [x] types/channel.md ✅ (Phase 1: Channel interface, ChannelType, ChannelPermissions, Visibility, JoinPolicy, type guards, validators, createGroupChannel/createDirectChannel factories, deterministic naming, membership utilities, filter/sort/grouping utilities, unit tests - 153 tests)

#### Phase 5: Advanced Features
- [x] types/workflow.md ✅ (Phase 1: Workflow interface, WorkflowStatus, WorkflowId/PlaybookId branded types, type guards, validators, createWorkflow factory, updateWorkflowStatus, squashWorkflow, status transitions, utility functions (filters, sorts, groups), GC helpers, unit tests - 121 tests)
- [x] types/playbook.md ✅ (Phase 1-4: Playbook interface, PlaybookStep, PlaybookVariable, VariableType, PlaybookId branded type, type guards, validators, createPlaybook/updatePlaybook factories, variable resolution system (resolveVariables, getVariableNames), condition system (parseCondition, evaluateCondition, isTruthy), substitution system (substituteVariables, extractVariableNames, hasVariables, filterStepsByConditions), utility functions (filters, sorts, grouping), unit tests - 230 tests)
- [x] types/library.md ✅ (Phase 1-2: Library interface, HydratedLibrary, LibraryId branded type, type guards, validators, createLibrary factory, updateLibrary, utility functions (filters, sorts, grouping, search, uniqueness), unit tests - 94 tests)
- [x] types/team.md ✅ (Phase 1-4: Team interface, HydratedTeam, TeamId branded type, type guards, validators, createTeam/updateTeam factories, membership operations (addMember, removeMember, isMember), utility functions (filters, sorts, grouping, search, uniqueness, team comparison), unit tests - 141 tests)

#### Phase 6: Interfaces
- [x] api/query-api.md ✅ (Phase 1: Interface definitions, filter types, return types, type guards, validation helpers, unit tests - 110 tests; Phase 2-7: Full CRUD operations implementation - get/list/create/update/delete, task queries (ready/blocked), dependency operations, search/hydration, history operations, stats, export/import via SyncService - 70 integration tests)
- [x] api/configuration.md ✅ (Phase 1-5,7-8: Configuration interface, SyncConfig, PlaybookConfig, TombstoneConfig, IdentityConfigSection, defaults, YAML file loading/parsing, environment variable support, access API (getConfig, getValue, setValue, unsetValue), validation with helpful errors, unit tests - 115 tests)
- [x] api/sync.md ✅ (Phase 1: JSONL serialization/parsing; Phase 2: Full/incremental export; Phase 3: Import with merge; Phase 4: Merge strategy with LWW, tombstones, status, tags, dependencies; Phase 5: Dirty tracking integration; Phase 6: Content hashing with SHA256; Phase 7: CLI commands - export, import, status with options; Phase 9: Unit tests - 157 tests)
- [x] api/cli.md ✅ (Phase 1: Framework setup - native arg parsing, output formatting (human/JSON/quiet modes), global flags; Phase 2: Core commands - init, create (tasks), list, show, update, delete (src/cli/commands/crud.ts); Phase 3: Task commands - ready, blocked, close, reopen, assign, defer, undefer (src/cli/commands/task.ts); Phase 4: Dependency commands - dep add, dep remove, dep list, dep tree (src/cli/commands/dep.ts); Phase 6: Sync commands - export, import, status (src/cli/commands/sync.ts); Phase 6.5: Identity commands - whoami, identity mode (src/cli/commands/identity.ts); Phase 7 partial: config command (show/set/unset); Phase 8 partial: help text, database existence checking for read operations; Unit tests - 400+ tests)

#### Phase 7: Identity
- [x] systems/identity.md ✅ (Phase 1: Type definitions - IdentityMode, Signature, PublicKey, SignedRequestFields, VerificationStatus, VerificationResult, IdentityConfig; Phase 2: Soft identity - ActorContext, ActorSource, resolveActor, validateSoftActor, lookupEntityByName, actor param on update/delete/addDependency - 18 integration tests; Phase 3-4: Ed25519 crypto - key validation, signature verification, signed data construction, time tolerance, full verification pipeline, shouldAllowRequest; Phase 7: CLI support - whoami command, identity mode command, --actor global flag; Phase 8: Unit tests - 176 tests)

---

### Remaining Implementation Items

#### Storage & Infrastructure (Priority: High)
- [ ] **systems/storage.md Phase 3**: Node.js backend (better-sqlite3 adapter, compatibility tests)
- [ ] **systems/storage.md Phase 4**: Browser backend (sql.js adapter, OPFS integration, WASM loading)
- [x] **systems/storage.md Phase 6**: Dirty tracking ✅ (markDirty, getDirtyElements, clearDirty, clearDirtyElements in BunStorageBackend)
- [x] **systems/storage.md Phase 7**: Content hashing ✅ (computeContentHashSync in sync/hash.ts, integrated with create/update in elemental-api.ts, hash column in schema)
- [ ] **systems/id-generation.md Phase 3**: Storage integration (element count query, length caching)
- [ ] **systems/id-generation.md Phase 5**: Hierarchical ID storage (child counter table, atomic counter increment)

#### Sync System (Priority: High)
- [x] **api/sync.md Phase 2**: Full export ✅ (SyncService.export with full/incremental modes, ephemeral filtering, file writing)
- [x] **api/sync.md Phase 3**: Import ✅ (SyncService.import with file reading, parsing, merge strategy, import ordering)
- [x] **api/sync.md Phase 5**: Dirty tracking integration ✅ (markDirty on mutations, clearDirty after export)
- [x] **api/sync.md Phase 7**: CLI commands ✅ (el export, el import, el status with full option support)
- [ ] **api/sync.md Phase 8**: Browser sync (HTTP endpoints, browser export/import)
- [x] **api/query-api.md Phase 7**: Update ElementalAPI export/import to use SyncService ✅ (export via SyncService.exportToString, import via SyncService.importFromStrings with element/dependency separation, merge strategy, dry-run, force, round-trip tests)

#### Identity & Security (Priority: High)
- [x] **systems/identity.md Phase 2**: Soft identity (actor context management, name-based lookup, add actor to all operations) ✅ (ActorContext, resolveActor, validateSoftActor, lookupEntityByName, actor param)
- [ ] **systems/identity.md Phase 4**: Verification middleware integration
- [ ] **systems/identity.md Phase 5**: Key management (registration, update, revocation)
- [x] **systems/identity.md Phase 7**: CLI support ✅ (--actor global flag, identity mode config via el identity mode, whoami command showing actor/source/mode/verification - 39 tests)

#### Type Integration (Priority: Medium)
- [ ] **types/task.md Phase 2**: Automatic blocked status computation, status change event emission
- [ ] **types/task.md Phase 3-4**: Ready/blocked work queries, assignment/deadline queries, hydration (Document reference resolution, batch hydration)
- [ ] **types/task.md Phase 5**: Integration with dependency system, blocked cache, event system
- [ ] **types/entity.md Phase 2-3**: Name uniqueness validation (storage-level), name-based lookup, entity listing queries
- [ ] **types/entity.md Phase 4**: Ed25519 signature verification integration, signature validation to API
- [ ] **types/entity.md Phase 5**: Entity update, deactivation, search/filter, assignment queries
- [ ] **types/document.md Phase 3-4**: Version table schema integration, getDocumentVersion/getDocumentHistory (storage layer)
- [ ] **types/document.md Phase 6**: Integration with Task (description, design), Message (content, attachments), Library (parent-child)

#### Collection Type Integration (Priority: Medium)
- [ ] **types/plan.md Phase 2-4**: Status change events, task-to-plan linking, hierarchical ID generation, progress calculation
- [ ] **types/plan.md Phase 5**: Bulk operations (close, defer, reassign, tag)
- [ ] **types/plan.md Phase 6**: Plan listing, tasks-in-plan query, progress in results
- [ ] **types/workflow.md Phase 2-3**: Auto-completion/failure detection, pouring (playbook loading, variable resolution, condition evaluation, task creation, dependency wiring)
- [ ] **types/workflow.md Phase 4-5**: Ephemeral support (filtering, burn, GC), task-to-workflow linking
- [ ] **types/workflow.md Phase 6**: Workflow queries (listing, tasks-in-workflow, ready tasks)
- [ ] **types/playbook.md Phase 5**: Inheritance (playbook loading, chain resolution, variable/step merging)
- [ ] **types/playbook.md Phase 6**: YAML support (schema, parser, file discovery)
- [ ] **types/playbook.md Phase 7**: Pour-time validation, validation CLI command
- [ ] **types/channel.md Phase 2-4**: Find-or-create logic, name uniqueness, membership operations (add, remove, leave), membership events
- [ ] **types/channel.md Phase 6**: Message integration (sender membership validation, direct message helper, auto-create direct channels)
- [ ] **types/message.md Phase 3-5**: Channel membership validation, Document reference validation, thread integrity, content/attachments hydration
- [ ] **types/library.md Phase 2-5**: Library deletion, document association (add, remove, multi-membership, listing), hierarchy (nesting, cycle detection, queries), root listing, statistics
- [ ] **types/team.md Phase 2-6**: Team deletion, membership events, task integration (team as assignee, tasks-for-team, claim mechanism), metrics

#### Events & Audit (Priority: Medium)
- [ ] **systems/events.md Phase 3**: Tag operations integration, membership operations integration
- [ ] **systems/events.md Phase 6**: Reconstruction (point-in-time state, timeline generation, reconstruction API)
- [ ] **systems/events.md Phase 7**: CLI integration (events in show command, history command, timeline formatting)
- [ ] **systems/dependencies.md Phase 5**: Gate satisfaction events (API to mark gates as satisfied)

#### CLI Commands (Priority: Medium)
- [ ] **api/cli.md Phase 5**: Collection commands (plan create/list/show/close, workflow pour/list/show/burn/squash/gc, playbook list/show/validate/create, channel create/join/leave/list/members, library create/list/add/remove, team create/add/remove/list/members)
- [x] **api/cli.md Phase 6**: Sync commands ✅ (export, import, status - 46 tests)
- [ ] **api/cli.md Phase 7**: Admin commands (stats, doctor, migrate)
- [ ] **api/cli.md Phase 8**: Shell completion, command aliases
- [x] **api/configuration.md Phase 6**: CLI commands ✅ (config show, set, unset implemented in src/cli/commands/config.ts; edit pending)
- [x] **types/task.md Phase 5 (partial)**: CLI commands for task operations ✅ (ready, blocked, close, reopen, assign, defer, undefer - 58 tests)
- [ ] **types/task.md Phase 5**: Integration with dependency system, blocked cache, event system (pending)
- [ ] **types/entity.md Phase 6**: CLI commands (register, list, whoami)
- [ ] **types/message.md Phase 7**: CLI commands (send, thread)

#### Error Handling & Validation (Priority: Low)
- [ ] **api/errors.md Phase 3**: Field validation integration, status validation integration
- [ ] **api/errors.md Phase 4**: SQLite error mapping
- [x] **api/errors.md Phase 5**: CLI formatting ✅ (standard, verbose, quiet modes in src/cli/formatter.ts)
- [ ] **api/errors.md Phase 6**: Documentation (common causes, resolutions, examples)

#### Testing & Performance (Priority: Low)
- [ ] **systems/storage.md Phase 8**: Cross-runtime compatibility tests
- [ ] **systems/dependencies.md Phase 8**: Performance tests for large dependency graphs
- [ ] **api/query-api.md Phase 5**: Optimize batch fetching
- [ ] **api/query-api.md Phase 8**: Performance tests for queries
- [ ] **types/task.md Phase 6**: Unit tests for ready/blocked computation with dependencies, integration tests for hydration, E2E tests for task lifecycle
- [ ] **types/message.md Phase 8**: Integration tests for threading, E2E tests for message flows
- [ ] **types/document.md Phase 7**: Integration tests for history queries, E2E tests for Document lifecycle
- [ ] **types/entity.md Phase 7**: Integration tests for uniqueness, E2E tests for entity lifecycle
- [ ] **types/plan.md Phase 8**: Unit tests for status transitions, progress calculation; integration tests; E2E tests
- [ ] **types/workflow.md Phase 8**: Unit tests for pouring logic; integration tests for full pour flow; E2E tests
- [ ] **types/playbook.md Phase 9**: Unit tests for inheritance; integration tests for full pour; E2E tests
- [ ] **types/channel.md Phase 9**: Integration tests for membership; E2E tests for messaging flow
- [ ] **types/library.md Phase 7**: Unit tests for association/hierarchy; integration tests; E2E tests
- [ ] **types/team.md Phase 8**: Integration tests for task assignment; E2E tests for team workflows
- [x] **api/sync.md Phase 9**: Integration tests for sync ✅ (24 tests in service.test.ts)
- [x] **api/configuration.md Phase 8**: Integration tests for CLI ✅ (20 tests in src/cli/commands/config.test.ts)
- [ ] **api/errors.md Phase 7**: Integration tests for propagation, CLI output tests

---

## Contributing

When adding or modifying specifications:

1. **Discuss first**: For major changes, discuss in issues
2. **Keep consistent**: Follow existing format and conventions
3. **Update index**: Add new specs to this README
4. **Cross-reference**: Link related specs
5. **Implementation checklist**: Include actionable tasks

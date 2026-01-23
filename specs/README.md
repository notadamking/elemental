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
- [ ] systems/storage.md (Phase 1 ✅: Interface definitions; Phase 2 ✅: Bun backend with integration tests)
- [x] api/errors.md ✅ (core error types, codes, factories, type guards, unit tests)

#### Phase 2: Core Types
- [x] types/entity.md ✅ (Phase 1: Entity interface, EntityTypeValue, type guards, validators, createEntity factory, unit tests)
- [x] types/document.md ✅ (Phase 1: Document interface, ContentType, type guards, validators, createDocument factory, updateDocumentContent, unit tests)
- [x] types/task.md ✅ (Phase 1: Task interface, HydratedTask, TaskStatus, Priority, Complexity, TaskTypeValue, type guards, validators, createTask factory, updateTaskStatus, softDeleteTask, status transition validation, utility functions, unit tests - 135 tests)
- [x] systems/events.md ✅ (Phase 1: Event interface, EventType unions, EventFilter, type guards, validators, createEvent factory, utility functions, unit tests - 129 tests)

#### Phase 3: Dependencies
- [x] systems/dependencies.md ✅ (Phase 1: Type definitions, validators, factories, utilities - 175 tests; Phase 2: DependencyService CRUD operations, event helpers - 67 tests; Phase 3: Cycle detection with BFS traversal, depth limiting, relates-to exclusion - 33 tests. Total: 100 tests)

#### Phase 4: Collections
- [ ] types/plan.md
- [ ] types/message.md
- [ ] types/channel.md

#### Phase 5: Advanced Features
- [ ] types/workflow.md
- [ ] types/playbook.md
- [ ] types/library.md
- [ ] types/team.md

#### Phase 6: Interfaces
- [ ] api/query-api.md
- [ ] api/configuration.md
- [ ] api/sync.md
- [ ] api/cli.md

#### Phase 7: Identity
- [ ] systems/identity.md

---

## Contributing

When adding or modifying specifications:

1. **Discuss first**: For major changes, discuss in issues
2. **Keep consistent**: Follow existing format and conventions
3. **Update index**: Add new specs to this README
4. **Cross-reference**: Link related specs
5. **Implementation checklist**: Include actionable tasks

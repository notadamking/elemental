# Elemental Specifications Index

This directory contains all technical specifications for the Elemental library. Specifications document design decisions, implementation details, and serve as the source of truth for how the system should work.

## How to Use This Index

1. **Finding specs**: Use the search keywords in the tables below
2. **Adding specs**: Create spec file, then add entry to appropriate table
3. **Updating specs**: Keep specs synchronized with implementation
4. **Implementing**: Follow the implementation checklists in each spec

---

## Master Specifications

| Path | Description | Keywords |
|------|-------------|----------|
| [PLAN.md](./PLAN.md) | Complete technical specification for Elemental core | overview, architecture, design, types, storage, api, cli |
| [platform/PLAN.md](./platform/PLAN.md) | Web platform specification | web, ui, dashboard, react, hono, websocket, real-time |

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
| [types/inbox.md](./types/inbox.md) | Entity inbox system | inbox, messages, mentions, unread, notifications |

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

## Platform Specifications

Detailed specifications for web platform features (tracer bullets).

| Path | Description | Keywords |
|------|-------------|----------|
| [platform/TB54-editor-toolbar-polish.md](./platform/TB54-editor-toolbar-polish.md) | Editor toolbar redesign with tooltips and responsive overflow | editor, toolbar, tiptap, tooltip, shortcuts, responsive, overflow |
| [platform/TB55-slash-commands.md](./platform/TB55-slash-commands.md) | Slash commands for quick block insertion in document editor | editor, tiptap, slash, commands, fuzzy search, keyboard navigation |
| [platform/TB56-drag-drop-blocks.md](./platform/TB56-drag-drop-blocks.md) | Drag-and-drop block reordering in document editor | editor, tiptap, drag, drop, blocks, reorder, handle |
| [platform/TB58-inline-formatting.md](./platform/TB58-inline-formatting.md) | Inline code styling and selection bubble menu | editor, tiptap, bubble menu, inline code, formatting, highlight |
| [platform/TB59-settings-theme.md](./platform/TB59-settings-theme.md) | Settings page with theme selection (light, dark, system) | settings, theme, dark mode, light mode, preferences, localStorage |
| [platform/TB60-settings-shortcuts.md](./platform/TB60-settings-shortcuts.md) | Settings page keyboard shortcuts section with customization | settings, keyboard, shortcuts, customize, key capture, conflict detection |
| [platform/TB61-settings-defaults.md](./platform/TB61-settings-defaults.md) | Settings page default views (tasks view, dashboard lens, sort order) | settings, defaults, preferences, localStorage, tasks, dashboard |
| [platform/TB62-settings-notifications.md](./platform/TB62-settings-notifications.md) | Settings page notification preferences (types, browser, toast settings) | settings, notifications, toast, sonner, browser notifications, preferences |
| [platform/TB63-settings-sync.md](./platform/TB63-settings-sync.md) | Settings page sync configuration (export, import, status) | settings, sync, export, import, JSONL, backup, version control |
| [platform/deep-link-navigation.md](./platform/deep-link-navigation.md) | Deep-link navigation with auto-scroll and highlight | deep-link, navigation, URL, scroll, highlight, not-found |
| [platform/TB71-design-tokens.md](./platform/TB71-design-tokens.md) | Design tokens foundation with CSS custom properties | design system, tokens, colors, spacing, typography, shadows, transitions |
| [platform/TB72-dark-light-mode.md](./platform/TB72-dark-light-mode.md) | Dark/Light mode overhaul with deep charcoal dark mode | theme, dark mode, light mode, toggle, transitions, design tokens |
| [platform/TB73-core-component-styling.md](./platform/TB73-core-component-styling.md) | Core component styling with Button, Input, Dialog, Select, Badge, Card | button, input, dialog, modal, select, dropdown, badge, card, radix ui |
| [platform/TB74-card-table-styling.md](./platform/TB74-card-table-styling.md) | Card and table styling with TaskCard, EntityCard, TeamCard, EmptyState | card, table, list, empty state, design tokens, entity cards |
| [platform/TB78-dashboard-charts.md](./platform/TB78-dashboard-charts.md) | Dashboard overview charts (Tasks by Status, Completed Over Time, Workload by Agent) | dashboard, charts, recharts, donut, line, bar, visualization |
| [platform/TB79-view-more-ready-tasks.md](./platform/TB79-view-more-ready-tasks.md) | View More Ready Tasks fix with readyOnly URL filter | tasks, ready, filter, dashboard, navigation, filter chip |
| [platform/TB82-task-search.md](./platform/TB82-task-search.md) | Task search with fuzzy matching and character highlighting | tasks, search, filter, fuzzy, highlight, debounce, keyboard |
| [platform/TB83-rich-task-display.md](./platform/TB83-rich-task-display.md) | Rich task display with description preview, attachment count, dependency counts | tasks, TaskCard, description, attachments, dependencies, tooltip, counts |
| [platform/TB84-dependency-sub-issues.md](./platform/TB84-dependency-sub-issues.md) | Dependencies as sub-issues display with progress, navigation, and create blocker | dependencies, sub-issues, blockers, blocks, TaskDetailPanel, progress, navigation |
| [platform/TB86-plan-progress-ring.md](./platform/TB86-plan-progress-ring.md) | Visual circular progress rings for plans with color-coded status | plans, progress, ring, circular, percentage, status, color-coded |
| [platform/TB93-inbox-filtering-sorting.md](./platform/TB93-inbox-filtering-sorting.md) | Inbox filtering by source type and sorting by date/sender | inbox, filter, sort, direct messages, mentions, localStorage |
| [platform/TB94-inbox-time-ago.md](./platform/TB94-inbox-time-ago.md) | Inbox time-ago display with periodic updates and time period grouping | inbox, time, relative, grouping, today, yesterday, sticky headers |
| [platform/TB94b-core-formatting-fixes.md](./platform/TB94b-core-formatting-fixes.md) | Fix BlockEditor to preserve rich text formatting on save | editor, tiptap, formatting, bold, italic, headings, lists, code, blockquote, html |
| [platform/TB94c-markdown-first-editor.md](./platform/TB94c-markdown-first-editor.md) | Markdown-first editor architecture with Markdown as storage format | editor, markdown, turndown, marked, storage, conversion, AI agents |
| [platform/TB94d-text-alignment.md](./platform/TB94d-text-alignment.md) | Text alignment controls (left, center, right, justify) with toolbar, slash commands, keyboard shortcuts | editor, tiptap, alignment, text-align, toolbar, shortcuts, markdown |
| [platform/TB94e-image-support.md](./platform/TB94e-image-support.md) | Image block support with upload, URL insert, and standard Markdown syntax | editor, image, upload, markdown, drag-drop, alt text |
| [platform/TB94f-task-document-embedding.md](./platform/TB94f-task-document-embedding.md) | Task and document embedding with ![[task:ID]] and ![[doc:ID]] syntax | editor, embed, task, document, obsidian, markdown, slash commands |
| [platform/TB96-media-library-browser.md](./platform/TB96-media-library-browser.md) | Media library browser for reusing uploaded images with search, usage tracking, and delete | media, library, images, uploads, search, usage tracking, delete |
| [platform/TB97-emoji-support.md](./platform/TB97-emoji-support.md) | Emoji picker modal and :emoji: autocomplete with Unicode storage | editor, emoji, picker, autocomplete, unicode, markdown |
| [platform/TB99-message-day-separation.md](./platform/TB99-message-day-separation.md) | Message day separation with date headers (Today, Yesterday, full date) | messages, channel, date, separator, grouping, calendar |
| [platform/TB100-copy-message.md](./platform/TB100-copy-message.md) | Copy message action with hover menu button and keyboard shortcut | messages, copy, clipboard, keyboard shortcut, toast, hover menu |
| [platform/TB101-RICH-TEXT-MESSAGE-COMPOSER.md](./platform/TB101-RICH-TEXT-MESSAGE-COMPOSER.md) | Rich text message composer with Tiptap editor and formatting toolbar | messages, composer, tiptap, rich text, bold, italic, code, lists, blockquote |
| [platform/TB102-image-input-messages.md](./platform/TB102-image-input-messages.md) | Image input in messages with upload, library, paste, drag-drop | messages, image, upload, attachment, paste, drag-drop, media |
| [platform/TB103-message-search.md](./platform/TB103-message-search.md) | Message search within channels and global search in command palette | messages, search, channel, highlight, scroll, command palette |

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

> **Note:** Active task tracking has moved to elemental's task system.
> Run `bun ./dist/bin/el.js ready` to see current tasks.
> This checklist is preserved for historical reference and as a guide for what has been completed.

Recommended implementation sequence:

#### Phase 1: Foundation
- [x] types/element.md ✅ (Element type, validation, type guards, utilities, unit tests)
- [x] systems/id-generation.md ✅ (ID validation, parsing, SHA256/Base36 hashing, adaptive length, collision resolution, hierarchical IDs, unit tests)
- [x] systems/storage.md ✅ (Phase 1: Interface definitions; Phase 2: Bun backend with integration tests; Phase 3: Node.js backend with 33 vitest tests; Phase 5: Schema management - migrations, version tracking, validation; Phase 8: Unit tests, integration tests, migration tests - 251+ tests)
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
- [x] api/cli.md ✅ (Phase 1: Framework setup - native arg parsing, output formatting (human/JSON/quiet modes), global flags; Phase 2: Core commands - init, create (tasks), list, show, update, delete (src/cli/commands/crud.ts); Phase 3: Task commands - ready, blocked, close, reopen, assign, defer, undefer (src/cli/commands/task.ts); Phase 4: Dependency commands - dep add, dep remove, dep list, dep tree (src/cli/commands/dep.ts); Phase 6: Sync commands - export, import, status (src/cli/commands/sync.ts); Phase 6.5: Identity commands - whoami, identity mode (src/cli/commands/identity.ts); Phase 7: Admin commands - config (show/set/unset), stats, doctor (health checks, schema validation, 31 tests), migrate (schema migration with dry-run); Phase 8 partial: help text, database existence checking for read operations; Unit tests - 431+ tests)

#### Phase 7: Identity
- [x] systems/identity.md ✅ (Phase 1: Type definitions - IdentityMode, Signature, PublicKey, SignedRequestFields, VerificationStatus, VerificationResult, IdentityConfig; Phase 2: Soft identity - ActorContext, ActorSource, resolveActor, validateSoftActor, lookupEntityByName, actor param on update/delete/addDependency - 18 integration tests; Phase 3-4: Ed25519 crypto - key validation, signature verification, signed data construction, time tolerance, full verification pipeline, shouldAllowRequest; Phase 7: CLI support - whoami command, identity mode command, --actor global flag; Phase 8: Unit tests - 176 tests)

---

### Remaining Implementation Items

#### Storage & Infrastructure (Priority: High)
- [x] **systems/storage.md Phase 3**: Node.js backend ✅ (better-sqlite3 adapter in src/storage/node-backend.ts, 33 vitest tests in tests/node/node-backend.test.ts)
- [ ] **systems/storage.md Phase 4**: Browser backend (sql.js adapter, OPFS integration, WASM loading)
- [x] **systems/storage.md Phase 6**: Dirty tracking ✅ (markDirty, getDirtyElements, clearDirty, clearDirtyElements in BunStorageBackend)
- [x] **systems/storage.md Phase 7**: Content hashing ✅ (computeContentHashSync in sync/hash.ts, integrated with create/update in elemental-api.ts, hash column in schema)
- [ ] **systems/id-generation.md Phase 3**: Storage integration (element count query, length caching)
- [x] **systems/id-generation.md Phase 5**: Hierarchical ID storage ✅ (child counter table, atomic counter increment via getNextChildNumber - 13+8 tests)

#### Sync System (Priority: High)
- [x] **api/sync.md Phase 2**: Full export ✅ (SyncService.export with full/incremental modes, ephemeral filtering, file writing)
- [x] **api/sync.md Phase 3**: Import ✅ (SyncService.import with file reading, parsing, merge strategy, import ordering)
- [x] **api/sync.md Phase 5**: Dirty tracking integration ✅ (markDirty on mutations, clearDirty after export)
- [x] **api/sync.md Phase 7**: CLI commands ✅ (el export, el import, el status with full option support)
- [ ] **api/sync.md Phase 8**: Browser sync (HTTP endpoints, browser export/import)
- [x] **api/query-api.md Phase 7**: Update ElementalAPI export/import to use SyncService ✅ (export via SyncService.exportToString, import via SyncService.importFromStrings with element/dependency separation, merge strategy, dry-run, force, round-trip tests)

#### Identity & Security (Priority: High)
- [x] **systems/identity.md Phase 2**: Soft identity (actor context management, name-based lookup, add actor to all operations) ✅ (ActorContext, resolveActor, validateSoftActor, lookupEntityByName, actor param)
- [x] **systems/identity.md Phase 4**: Verification middleware integration ✅ (createVerificationMiddleware - 11 tests)
- [x] **systems/identity.md Phase 5**: Key management ✅ (registration via createEntity, signed key rotation via rotateEntityKey with verification - 20 tests)
- [x] **systems/identity.md Phase 7**: CLI support ✅ (--actor global flag, identity mode config via el identity mode, whoami command showing actor/source/mode/verification - 39 tests)

#### Type Integration (Priority: Medium)
- [x] **types/task.md Phase 2**: Automatic blocked status computation ✅ (BlockedCacheService triggers auto_blocked/auto_unblocked events, stores previous_status in blocked_cache for restoration - 20 tests)
- [x] **types/task.md Phase 2**: Status change event emission ✅ (closed/reopened/updated events - 9 tests)
- [x] **types/task.md Phase 3**: Ready/blocked work queries ✅ (api.ready(), api.blocked() - 31 tests), assignment/deadline queries ✅ (TaskFilter.assignee, TaskFilter.owner, TaskFilter.hasDeadline, TaskFilter.deadlineBefore - 16 integration tests)
- [x] **types/task.md Phase 4**: Hydration ✅ (Document reference resolution, batch hydration for lists, hydrate option in ElementFilter - 18 tests)
- [x] **types/task.md Phase 5** (partial): Integration with blocked cache ✅ (automatic status transitions via BlockedCacheService callback, auto_blocked/auto_unblocked events)
- [ ] **types/task.md Phase 5** (pending): Further dependency system integration (dependency-based priority, complexity inheritance)
- [x] **types/entity.md Phase 2**: Name uniqueness validation ✅ (storage-level check in create(), DUPLICATE_NAME error)
- [x] **types/entity.md Phase 3**: Entity listing queries ✅ (name-based lookup, whoami, api.list({ type: 'entity' }))
- [x] **types/entity.md Phase 4**: Ed25519 signature verification integration, signature validation to API ✅ (systems/identity.ts)
- [x] **types/entity.md Phase 5** (partial): Entity update ✅ (updateEntity in src/types/entity.ts - publicKey, tags, metadata; 11 tests)
- [x] **types/entity.md Phase 5** (partial): Entity deactivation ✅ (deactivateEntity, reactivateEntity, isEntityActive, filterActiveEntities - 25 tests)
- [x] **types/entity.md Phase 5** (partial): Entity search/filter ✅ (filterByCreator, filterWithPublicKey, filterByTag, sortByName, groupByEntityType, searchByName, findByName, countByEntityType - 30 tests)
- [x] **types/entity.md Phase 5**: Entity assignment queries ✅ (getAssignedTo, getCreatedBy, getRelatedTo, countAssignmentsByEntity, getTopAssignees, hasAssignments, getUnassigned, getEntityAssignmentStats - 21 tests)
- [x] **types/document.md Phase 3-4**: Version table schema integration ✅ (schema migration 1), getDocumentVersion/getDocumentHistory ✅ (API implementation - 19 integration tests)
- [ ] **types/document.md Phase 6**: Integration with Task (description, design), Message (content, attachments), Library (parent-child)

#### Collection Type Integration (Priority: Medium)
- [x] **types/plan.md Phase 2** (partial): Status change events ✅ (closed/reopened events for completed/cancelled transitions - 12 tests)
- [x] **types/plan.md Phase 3**: Task-to-plan linking ✅ (addTaskToPlan, removeTaskFromPlan, getTasksInPlan, createTaskInPlan API methods, hierarchical ID generation - 31 integration tests)
- [x] **types/plan.md Phase 4** (partial): Progress calculation ✅ (`getPlanProgress` API method, `calculatePlanProgress` utility - 12 integration tests); remaining: progress caching (optional), weighted progress (optional)
- [x] **types/plan.md Phase 5**: Bulk operations ✅ (`bulkClosePlanTasks`, `bulkDeferPlanTasks`, `bulkReassignPlanTasks`, `bulkTagPlanTasks` API methods with filter support - 39 integration tests)
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
- [x] **systems/events.md Phase 3 (partial)**: Tag operations integration ✅ (tracked via update events)
- [ ] **systems/events.md Phase 3**: Membership operations integration (blocked on collection types)
- [ ] **systems/events.md Phase 6**: Reconstruction (point-in-time state, timeline generation, reconstruction API)
- [x] **systems/events.md Phase 7**: CLI integration ✅ (--events flag on show, history command with filtering, timeline/table formatting - 19 tests)
- [x] **systems/dependencies.md Phase 5**: Gate satisfaction API ✅ (satisfyGate, recordApproval, removeApproval - updates dependency metadata and recomputes blocking state - 23 tests)

#### CLI Commands (Priority: Medium)
- [ ] **api/cli.md Phase 5**: Collection commands (plan create/list/show/close, workflow pour/list/show/burn/squash/gc, playbook list/show/validate/create, channel create/join/leave/list/members, library create/list/add/remove, team create/add/remove/list/members)
- [x] **api/cli.md Phase 6**: Sync commands ✅ (export, import, status - 46 tests)
- [x] **api/cli.md Phase 7**: Admin commands ✅ (config show/set/unset, stats - 11 tests, doctor - health checks, schema validation, integrity checks, 31 tests, migrate - schema migration with dry-run)
- [ ] **api/cli.md Phase 8**: Shell completion, command aliases
- [x] **api/configuration.md Phase 6**: CLI commands ✅ (config show, set, unset, edit implemented in src/cli/commands/config.ts - 28 tests)
- [x] **types/task.md Phase 5 (partial)**: CLI commands for task operations ✅ (ready, blocked, close, reopen, assign, defer, undefer - 58 tests)
- [x] **types/task.md Phase 5 (partial)**: Integration with blocked cache ✅ (automatic status transitions via BlockedCacheService callback, auto_blocked/auto_unblocked events - 20 tests)
- [x] **types/entity.md Phase 6**: CLI commands ✅ (entity register, entity list - 40 tests; whoami - 39 tests)
- [ ] **types/message.md Phase 7**: CLI commands (send, thread)

#### Error Handling & Validation (Priority: Low)
- [x] **api/errors.md Phase 3**: Field validation integration, status validation integration ✅ (types have validators)
- [x] **api/errors.md Phase 4**: SQLite error mapping ✅ (mapStorageError handles unique, FK, busy, corruption errors)
- [x] **api/errors.md Phase 5**: CLI formatting ✅ (standard, verbose, quiet modes in src/cli/formatter.ts)
- [ ] **api/errors.md Phase 6**: Documentation (common causes, resolutions, examples)

#### Testing & Performance (Priority: Low)
- [ ] **systems/storage.md Phase 8**: Cross-runtime compatibility tests
- [ ] **systems/dependencies.md Phase 8**: Performance tests for large dependency graphs
- [ ] **api/query-api.md Phase 5**: Optimize batch fetching
- [ ] **api/query-api.md Phase 8**: Performance tests for queries
- [ ] **types/task.md Phase 6**: Unit tests for ready/blocked computation with dependencies, E2E tests for task lifecycle
- [x] **types/task.md Phase 6** (partial): Integration tests for hydration ✅ (task-hydration.integration.test.ts - 18 tests)
- [ ] **types/message.md Phase 8**: Integration tests for threading, E2E tests for message flows
- [x] **types/document.md Phase 7** (partial): Integration tests for history queries ✅ (document-version.integration.test.ts - 19 tests)
- [ ] **types/document.md Phase 7**: E2E tests for Document lifecycle
- [x] **types/entity.md Phase 7** (partial): Integration tests for uniqueness ✅ (6 tests), signature verification tests ✅ (148 tests)
- [ ] **types/entity.md Phase 7**: E2E tests for entity lifecycle
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

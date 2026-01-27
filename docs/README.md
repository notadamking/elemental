# Elemental Agent Docs

## Quick Navigation

| I want to... | Read | Key Files |
|-------------|------|-----------|
| Work with tasks | [core/types.md#task](core/types.md#task) | `apps/legacy/src/types/task.ts` |
| Work with entities | [core/types.md#entity](core/types.md#entity) | `apps/legacy/src/types/entity.ts` |
| Work with messages | [core/types.md#message](core/types.md#message) | `apps/legacy/src/types/message.ts` |
| Work with documents | [core/types.md#document](core/types.md#document) | `apps/legacy/src/types/document.ts` |
| Work with collections | [core/collections.md](core/collections.md) | `apps/legacy/src/types/plan.ts`, etc. |
| Add dependencies | [core/dependencies.md](core/dependencies.md) | `apps/legacy/src/services/dependency.ts` |
| Understand storage | [core/storage.md](core/storage.md) | `apps/legacy/src/storage/bun-backend.ts` |
| Export/import data | [core/storage.md#sync-system](core/storage.md#sync-system) | `apps/legacy/src/sync/service.ts` |
| Add API endpoint | [platform/server.md](platform/server.md) | `apps/server/src/index.ts` |
| Add React component | [platform/web.md](platform/web.md) | `apps/web/src/components/` |
| Add React hook | [platform/web.md](platform/web.md) | `apps/web/src/api/hooks/` |
| Use WebSocket | [platform/websocket.md](platform/websocket.md) | `apps/server/src/ws/` |
| Use the TypeScript API | [api/elemental-api.md](api/elemental-api.md) | `apps/legacy/src/api/elemental-api.ts` |
| Use the CLI | [api/cli.md](api/cli.md) | `apps/legacy/src/cli/commands/` |
| Debug issues | [gotchas.md](gotchas.md) | - |

## Architecture at a Glance

> **Note**: The project is now a TurboRepo monorepo. The core CLI library is temporarily at `apps/legacy/` during the migration to separate packages.

```
┌─────────────────┐     ┌─────────────────┐
│   apps/web/     │────→│  apps/server/   │
│   (React SPA)   │ HTTP│   (Hono API)    │
└─────────────────┘     └────────┬────────┘
                                 │
                        ┌────────▼────────┐
                        │ @elemental/cli  │
                        │ (apps/legacy/)  │
                        └────────┬────────┘
                                 │
                        ┌────────▼────────┐
                        │     SQLite      │
                        │  (.elemental/)  │
                        └─────────────────┘
```

## File Map (Packages)

| Package | Purpose | Key Exports |
|---------|---------|-------------|
| `packages/core/` | Shared types, errors, ID generation, utilities | `ElementType`, `Task`, `ErrorCode`, `generateId` |

> **Migration Status**: `@elemental/core` extracted. Storage and SDK packages pending.

## File Map (Core Library - apps/legacy/src/)

> **Note**: All paths below are relative to `apps/legacy/src/`. The core library is being extracted to separate packages (`@elemental/core` complete, `@elemental/storage` and `@elemental/sdk` pending).

| Concept | Source | Tests |
|---------|--------|-------|
| Library entry point | `index.ts` | - |
| CLI entry point | `bin/el.ts` | - |
| Type exports | `types/index.ts` | - |
| Task type | `types/task.ts` | `types/task.test.ts` |
| Entity type | `types/entity.ts` | `types/entity.test.ts` |
| Message type | `types/message.ts` | `types/message.test.ts` |
| Document type | `types/document.ts` | `types/document.test.ts` |
| Plan type | `types/plan.ts` | `types/plan.test.ts` |
| Workflow type | `types/workflow.ts` | `types/workflow.test.ts` |
| Channel type | `types/channel.ts` | `types/channel.test.ts` |
| Library type | `types/library.ts` | `types/library.test.ts` |
| Team type | `types/team.ts` | `types/team.test.ts` |
| Dependency type | `types/dependency.ts` | `types/dependency.test.ts` |
| Element base | `types/element.ts` | `types/element.test.ts` |
| Inbox type | `types/inbox.ts` | `types/inbox.test.ts` |
| Event type | `types/event.ts` | `types/event.test.ts` |
| Playbook type | `types/playbook.ts` | `types/playbook.test.ts` |
| Playbook YAML | `types/playbook-yaml.ts` | `types/playbook-yaml.test.ts` |
| Workflow ops | `types/workflow-ops.ts` | `types/workflow-ops.test.ts` |
| Workflow pour | `types/workflow-pour.ts` | `types/workflow-pour.test.ts` |
| Dependency service | `services/dependency.ts` | `services/dependency.test.ts` |
| Blocked cache | `services/blocked-cache.ts` | `services/blocked-cache.test.ts` |
| Inbox service | `services/inbox.ts` | `services/inbox.test.ts` |
| Priority service | `services/priority-service.ts` | `services/priority-service.test.ts` |
| ID length cache | `services/id-length-cache.ts` | `services/id-length-cache.test.ts` |
| Storage exports | `storage/index.ts` | - |
| Storage backend interface | `storage/backend.ts` | `storage/backend.test.ts` |
| Storage factory | `storage/create-backend.ts` | - |
| Storage errors | `storage/errors.ts` | `storage/errors.test.ts` |
| Storage types | `storage/types.ts` | `storage/types.test.ts` |
| Schema & migrations | `storage/schema.ts` | `storage/schema.test.ts` |
| Bun backend | `storage/bun-backend.ts` | `storage/bun-backend.test.ts` |
| Node backend | `storage/node-backend.ts` | - |
| Browser backend | `storage/browser-backend.ts` | `storage/browser-backend.test.ts` |
| ElementalAPI | `api/elemental-api.ts` | `api/*.integration.test.ts` |
| API types | `api/types.ts` | `api/types.test.ts` |
| CLI runner | `cli/runner.ts` | `cli/runner.test.ts` |
| CLI parser | `cli/parser.ts` | `cli/parser.test.ts` |
| CLI formatter | `cli/formatter.ts` | `cli/formatter.test.ts` |
| CLI types | `cli/types.ts` | `cli/types.test.ts` |
| CLI commands | `cli/commands/*.ts` | `cli/commands/*.test.ts` |
| GC commands | `cli/commands/gc.ts` | - |
| ID generator | `id/generator.ts` | `id/generator.test.ts` |
| Sync service | `sync/service.ts` | `sync/service.test.ts` |
| Sync types | `sync/types.ts` | - |
| Sync serialization | `sync/serialization.ts` | - |
| Sync merge | `sync/merge.ts` | - |
| Sync hashing | `sync/hash.ts` | - |
| Identity system | `systems/identity.ts` | `systems/identity.test.ts` |
| Error codes | `errors/codes.ts` | `errors/codes.test.ts` |
| Error base class | `errors/error.ts` | `errors/error.test.ts` |
| Error factories | `errors/factories.ts` | `errors/factories.test.ts` |
| Config loader | `config/config.ts` | `config/config.test.ts` |
| Config types | `config/types.ts` | - |
| Config defaults | `config/defaults.ts` | - |
| Config validation | `config/validation.ts` | - |
| Config merge | `config/merge.ts` | - |
| Config file I/O | `config/file.ts` | - |
| Config env vars | `config/env.ts` | - |
| Duration parsing | `config/duration.ts` | - |
| HTTP sync handlers | `http/sync-handlers.ts` | - |
| Mention parsing | `utils/mentions.ts` | - |

## File Map (Platform)

| Concept | Server | Web |
|---------|--------|-----|
| Server entry | `apps/server/src/index.ts` | - |
| WebSocket server | `apps/server/src/ws/broadcaster.ts`, `handler.ts`, `types.ts` | - |
| WebSocket client | - | `apps/web/src/api/websocket.ts` |
| API hooks | - | `apps/web/src/api/hooks/useAllElements.ts`, `useRealtimeEvents.ts` |
| React entry | - | `apps/web/src/main.tsx` |
| Router | - | `apps/web/src/router.tsx` |
| Routes | - | `apps/web/src/routes/*.tsx` |
| Layout | - | `apps/web/src/components/layout/` |
| Dashboard | - | `apps/web/src/components/dashboard/` |
| Editor | - | `apps/web/src/components/editor/` |
| Task UI | - | `apps/web/src/components/task/` |
| Entity UI | - | `apps/web/src/components/entity/` |
| Document UI | - | `apps/web/src/components/document/` |
| Message UI | - | `apps/web/src/components/message/` |
| Workflow UI | - | `apps/web/src/components/workflow/` |
| Navigation | - | `apps/web/src/components/navigation/` |
| Shared | - | `apps/web/src/components/shared/` |
| UI primitives | - | `apps/web/src/components/ui/` |
| Custom hooks | - | `apps/web/src/hooks/` |
| Lib utilities | - | `apps/web/src/lib/` |

## Critical Gotchas

See [gotchas.md](gotchas.md) for critical pitfalls.

**Top 3:**
1. Task `blocked` status is computed from dependencies, never set directly
2. `sendDirectMessage()` needs `contentRef` (DocumentId), not raw text
3. `blocks` direction is opposite to `parent-child`/`awaits` (see gotchas.md)

---

## Keeping Docs Updated (MANDATORY)

**When you modify code, you MUST update these docs in the same commit:**

| If you... | Update |
|-----------|--------|
| Add/rename/move a source file | File Map tables in this README |
| Add a new type/interface | `core/types.md` or `core/collections.md` |
| Add a new API method | `api/elemental-api.md` |
| Add a CLI command | `api/cli.md` |
| Add platform feature | `platform/README.md` + relevant platform doc |
| Discover a critical bug/gotcha | `gotchas.md` |

**Enforcement:**
- PRs that add/modify source files without updating docs should be rejected
- If you find stale docs, fix them immediately (don't leave for "later")
- When in doubt, update the doc - small updates are cheap, stale docs are expensive

**File paths are the source of truth.** If a file path in docs doesn't exist, the doc is wrong and must be fixed.

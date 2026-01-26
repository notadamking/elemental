# Elemental Agent Docs

## Quick Navigation

| I want to... | Read | Key Files |
|-------------|------|-----------|
| Work with tasks | [core/types.md#task](core/types.md#task) | `src/types/task.ts` |
| Work with entities | [core/types.md#entity](core/types.md#entity) | `src/types/entity.ts` |
| Work with messages | [core/types.md#message](core/types.md#message) | `src/types/message.ts` |
| Work with documents | [core/types.md#document](core/types.md#document) | `src/types/document.ts` |
| Work with collections | [core/collections.md](core/collections.md) | `src/types/plan.ts`, etc. |
| Add dependencies | [core/dependencies.md](core/dependencies.md) | `src/services/dependency.ts` |
| Understand storage | [core/storage.md](core/storage.md) | `src/storage/bun-backend.ts` |
| Export/import data | [core/storage.md#sync-system](core/storage.md#sync-system) | `src/sync/service.ts` |
| Add API endpoint | [platform/server.md](platform/server.md) | `apps/server/src/index.ts` |
| Add React component | [platform/web.md](platform/web.md) | `apps/web/src/components/` |
| Add React hook | [platform/web.md](platform/web.md) | `apps/web/src/api/hooks/` |
| Use WebSocket | [platform/websocket.md](platform/websocket.md) | `apps/server/src/ws/` |
| Use the TypeScript API | [api/elemental-api.md](api/elemental-api.md) | `src/api/elemental-api.ts` |
| Use the CLI | [api/cli.md](api/cli.md) | `src/cli/commands/` |
| Debug issues | [gotchas.md](gotchas.md) | - |

## Architecture at a Glance

```
┌─────────────────┐     ┌─────────────────┐
│   apps/web/     │────→│  apps/server/   │
│   (React SPA)   │ HTTP│   (Hono API)    │
└─────────────────┘     └────────┬────────┘
                                 │
                        ┌────────▼────────┐
                        │  @elemental/core │
                        │  (src/)          │
                        └────────┬────────┘
                                 │
                        ┌────────▼────────┐
                        │     SQLite      │
                        │  (.elemental/)  │
                        └─────────────────┘
```

## File Map (Core Library)

| Concept | Source | Tests |
|---------|--------|-------|
| Library entry point | `src/index.ts` | - |
| CLI entry point | `src/bin/el.ts` | - |
| Type exports | `src/types/index.ts` | - |
| Task type | `src/types/task.ts` | `src/types/task.test.ts` |
| Entity type | `src/types/entity.ts` | `src/types/entity.test.ts` |
| Message type | `src/types/message.ts` | `src/types/message.test.ts` |
| Document type | `src/types/document.ts` | `src/types/document.test.ts` |
| Plan type | `src/types/plan.ts` | `src/types/plan.test.ts` |
| Workflow type | `src/types/workflow.ts` | `src/types/workflow.test.ts` |
| Channel type | `src/types/channel.ts` | `src/types/channel.test.ts` |
| Library type | `src/types/library.ts` | `src/types/library.test.ts` |
| Team type | `src/types/team.ts` | `src/types/team.test.ts` |
| Dependency type | `src/types/dependency.ts` | `src/types/dependency.test.ts` |
| Element base | `src/types/element.ts` | `src/types/element.test.ts` |
| Inbox type | `src/types/inbox.ts` | `src/types/inbox.test.ts` |
| Event type | `src/types/event.ts` | `src/types/event.test.ts` |
| Playbook type | `src/types/playbook.ts` | `src/types/playbook.test.ts` |
| Playbook YAML | `src/types/playbook-yaml.ts` | `src/types/playbook-yaml.test.ts` |
| Workflow ops | `src/types/workflow-ops.ts` | `src/types/workflow-ops.test.ts` |
| Workflow pour | `src/types/workflow-pour.ts` | `src/types/workflow-pour.test.ts` |
| Dependency service | `src/services/dependency.ts` | `src/services/dependency.test.ts` |
| Blocked cache | `src/services/blocked-cache.ts` | `src/services/blocked-cache.test.ts` |
| Inbox service | `src/services/inbox.ts` | `src/services/inbox.test.ts` |
| Priority service | `src/services/priority-service.ts` | `src/services/priority-service.test.ts` |
| ID length cache | `src/services/id-length-cache.ts` | `src/services/id-length-cache.test.ts` |
| Storage exports | `src/storage/index.ts` | - |
| Storage backend interface | `src/storage/backend.ts` | `src/storage/backend.test.ts` |
| Storage factory | `src/storage/create-backend.ts` | - |
| Storage errors | `src/storage/errors.ts` | `src/storage/errors.test.ts` |
| Storage types | `src/storage/types.ts` | `src/storage/types.test.ts` |
| Schema & migrations | `src/storage/schema.ts` | `src/storage/schema.test.ts` |
| Bun backend | `src/storage/bun-backend.ts` | `src/storage/bun-backend.test.ts` |
| Node backend | `src/storage/node-backend.ts` | - |
| Browser backend | `src/storage/browser-backend.ts` | `src/storage/browser-backend.test.ts` |
| ElementalAPI | `src/api/elemental-api.ts` | `src/api/*.integration.test.ts` |
| API types | `src/api/types.ts` | `src/api/types.test.ts` |
| CLI runner | `src/cli/runner.ts` | `src/cli/runner.test.ts` |
| CLI parser | `src/cli/parser.ts` | `src/cli/parser.test.ts` |
| CLI formatter | `src/cli/formatter.ts` | `src/cli/formatter.test.ts` |
| CLI types | `src/cli/types.ts` | `src/cli/types.test.ts` |
| CLI commands | `src/cli/commands/*.ts` | `src/cli/commands/*.test.ts` |
| ID generator | `src/id/generator.ts` | `src/id/generator.test.ts` |
| Sync service | `src/sync/service.ts` | `src/sync/service.test.ts` |
| Sync types | `src/sync/types.ts` | - |
| Sync serialization | `src/sync/serialization.ts` | - |
| Sync merge | `src/sync/merge.ts` | - |
| Sync hashing | `src/sync/hash.ts` | - |
| Identity system | `src/systems/identity.ts` | `src/systems/identity.test.ts` |
| Error codes | `src/errors/codes.ts` | `src/errors/codes.test.ts` |
| Error base class | `src/errors/error.ts` | `src/errors/error.test.ts` |
| Error factories | `src/errors/factories.ts` | `src/errors/factories.test.ts` |
| Config loader | `src/config/config.ts` | `src/config/config.test.ts` |
| Config types | `src/config/types.ts` | - |
| Config defaults | `src/config/defaults.ts` | - |
| Config validation | `src/config/validation.ts` | - |
| Config merge | `src/config/merge.ts` | - |
| Config file I/O | `src/config/file.ts` | - |
| Config env vars | `src/config/env.ts` | - |
| Duration parsing | `src/config/duration.ts` | - |
| HTTP sync handlers | `src/http/sync-handlers.ts` | - |
| Mention parsing | `src/utils/mentions.ts` | - |

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

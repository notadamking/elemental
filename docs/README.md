# Elemental Agent Docs

> LLM-optimized documentation for the Elemental codebase. Start here to find the right files quickly.

## Quick Navigation

| I want to... | Read | Key Files |
|--------------|------|-----------|
| **Core Types & Collections** |
| Work with tasks | [reference/core-types.md#task](reference/core-types.md#task) | `packages/core/src/types/task.ts` |
| Work with entities | [reference/core-types.md#entity](reference/core-types.md#entity) | `packages/core/src/types/entity.ts` |
| Work with messages | [reference/core-types.md#message](reference/core-types.md#message) | `packages/core/src/types/message.ts` |
| Work with documents | [reference/core-types.md#document](reference/core-types.md#document) | `packages/core/src/types/document.ts` |
| Work with plans, workflows, channels | [reference/core-types.md#collections](reference/core-types.md#collections) | `packages/core/src/types/plan.ts`, etc. |
| Add dependencies | [reference/core-types.md#dependency](reference/core-types.md#dependency) | `packages/sdk/src/services/dependency.ts` |
| **SDK & Services** |
| Use the TypeScript API | [reference/elemental-api.md](reference/elemental-api.md) | `packages/sdk/src/api/elemental-api.ts` |
| Use SDK services | [reference/sdk-services.md](reference/sdk-services.md) | `packages/sdk/src/services/` |
| Understand storage | [reference/storage.md](reference/storage.md) | `packages/storage/src/bun-backend.ts` |
| Configure identity/signing | [reference/identity.md](reference/identity.md) | `packages/sdk/src/systems/identity.ts` |
| Configure the system | [reference/config.md](reference/config.md) | `packages/sdk/src/config/` |
| **Orchestrator** |
| Use the Orchestrator API | [reference/orchestrator-api.md](reference/orchestrator-api.md) | `packages/orchestrator-sdk/src/api/orchestrator-api.ts` |
| Work with orchestrator services | [reference/orchestrator-services.md](reference/orchestrator-services.md) | `packages/orchestrator-sdk/src/services/` |
| Use runtime components | [reference/orchestrator-runtime.md](reference/orchestrator-runtime.md) | `packages/orchestrator-sdk/src/runtime/` |
| Define agent role prompts | [reference/prompts.md](reference/prompts.md) | `packages/orchestrator-sdk/src/prompts/` |
| Define agent role definitions | [reference/orchestrator-services.md#roledefinitionservice](reference/orchestrator-services.md#roledefinitionservice) | `packages/orchestrator-sdk/src/services/role-definition-service.ts` |
| **Platform** |
| Use the CLI | [reference/cli.md](reference/cli.md) | `packages/sdk/src/cli/commands/` |
| Work with platform apps | [reference/platform.md](reference/platform.md) | `apps/server/`, `apps/web/`, etc. |
| **How-To Guides** |
| Add an API endpoint | [how-to/add-api-endpoint.md](how-to/add-api-endpoint.md) | `apps/server/src/index.ts`, `apps/orchestrator-server/src/routes/` |
| Add a React component | [how-to/add-react-component.md](how-to/add-react-component.md) | `apps/web/src/components/` |
| Add a new core type | [how-to/add-core-type.md](how-to/add-core-type.md) | `packages/core/src/types/` |
| Add an orchestrator service | [how-to/add-orchestrator-service.md](how-to/add-orchestrator-service.md) | `packages/orchestrator-sdk/src/services/` |
| Work with dependencies | [how-to/work-with-dependencies.md](how-to/work-with-dependencies.md) | `packages/sdk/src/services/dependency.ts` |
| Customize agent prompts | [how-to/customize-agent-prompts.md](how-to/customize-agent-prompts.md) | `.elemental/prompts/` |
| Configure identity | [how-to/configure-identity.md](how-to/configure-identity.md) | `packages/sdk/src/systems/identity.ts` |
| **Understanding** |
| Understand event sourcing | [explanation/event-sourcing.md](explanation/event-sourcing.md) | `packages/core/src/types/event.ts` |
| Understand dependencies | [explanation/dependency-system.md](explanation/dependency-system.md) | `packages/sdk/src/services/` |
| Understand agent roles | [explanation/agent-roles.md](explanation/agent-roles.md) | `packages/orchestrator-sdk/src/types/agent.ts` |
| Understand sync/merge | [explanation/sync-and-merge.md](explanation/sync-and-merge.md) | `packages/sdk/src/sync/` |
| Debug issues | [GOTCHAS.md](GOTCHAS.md) | - |

## Architecture Overview

See [ARCHITECTURE.md](ARCHITECTURE.md) for full architecture details.

**Package Dependency Graph:**
```
@elemental/core        (shared types, no dependencies)
       ↓
@elemental/storage     (SQLite backends)
       ↓
@elemental/sdk         (API, services, sync, CLI)
       ↓
@elemental/orchestrator-sdk  (agent orchestration)
```

**Dual Storage Model:**
- **SQLite**: Fast cache, queries, indexes
- **JSONL**: Git-tracked source of truth

## File Map (Packages)

| Package | Purpose | Key Exports |
|---------|---------|-------------|
| `packages/core/` | Shared types, errors, ID generation | `ElementType`, `Task`, `Entity`, `Document`, `ErrorCode`, `generateId` |
| `packages/storage/` | SQLite storage backends | `createStorage`, `initializeSchema`, `StorageBackend` |
| `packages/sdk/` | Core API, services, sync, CLI | `ElementalAPI`, `createElementalAPI`, `SyncService`, `InboxService` |
| `packages/orchestrator-sdk/` | Agent orchestration | `OrchestratorAPI`, `AgentRole`, `SpawnerService`, `SessionManager` |

## File Map (@elemental/core)

| Concept | Source | Tests |
|---------|--------|-------|
| Task type | `types/task.ts` | `types/task.test.ts` |
| Entity type | `types/entity.ts` | `types/entity.test.ts` |
| Message type | `types/message.ts` | `types/message.test.ts` |
| Document type | `types/document.ts` | `types/document.test.ts` |
| Plan type | `types/plan.ts` | `types/plan.test.ts` |
| Workflow type | `types/workflow.ts` | `types/workflow.test.ts` |
| Channel type | `types/channel.ts` | `types/channel.test.ts` |
| Dependency type | `types/dependency.ts` | `types/dependency.test.ts` |
| Event type | `types/event.ts` | `types/event.test.ts` |
| Inbox type | `types/inbox.ts` | `types/inbox.test.ts` |
| ID generator | `id/generator.ts` | `id/generator.test.ts` |
| Error codes | `errors/codes.ts` | `errors/codes.test.ts` |

## File Map (@elemental/sdk)

| Concept | Source | Tests |
|---------|--------|-------|
| ElementalAPI | `api/elemental-api.ts` | `api/*.integration.test.ts` |
| Dependency service | `services/dependency.ts` | `services/dependency.test.ts` |
| Blocked cache | `services/blocked-cache.ts` | `services/blocked-cache.test.ts` |
| Inbox service | `services/inbox.ts` | `services/inbox.test.ts` |
| Priority service | `services/priority-service.ts` | `services/priority-service.test.ts` |
| ID length cache | `services/id-length-cache.ts` | `services/id-length-cache.test.ts` |
| Sync service | `sync/service.ts` | `sync/service.test.ts` |
| Sync merge | `sync/merge.ts` | - |
| Sync hash | `sync/hash.ts` | - |
| Config loader | `config/config.ts` | `config/config.test.ts` |
| Identity system | `systems/identity.ts` | `systems/identity.test.ts` |
| CLI commands | `cli/commands/*.ts` | `cli/commands/*.test.ts` |

## File Map (@elemental/orchestrator-sdk)

| Concept | Source | Tests |
|---------|--------|-------|
| OrchestratorAPI | `api/orchestrator-api.ts` | `api/*.integration.test.ts` |
| Agent registry | `services/agent-registry.ts` | `services/agent-registry.test.ts` |
| Role definition service | `services/role-definition-service.ts` | `services/role-definition-service.test.ts` |
| Capability service | `services/capability-service.ts` | `services/capability-service.test.ts` |
| Task assignment service | `services/task-assignment-service.ts` | `services/task-assignment-service.test.ts` |
| Dispatch service | `services/dispatch-service.ts` | `services/dispatch-service.test.ts` |
| Health steward service | `services/health-steward-service.ts` | `services/health-steward-service.test.ts` |
| Steward scheduler | `services/steward-scheduler.ts` | `services/steward-scheduler.test.ts` |
| Plugin executor | `services/plugin-executor.ts` | `services/plugin-executor.test.ts` |
| Spawner service | `runtime/spawner.ts` | `runtime/spawner.test.ts` |
| Session manager | `runtime/session-manager.ts` | `runtime/session-manager.test.ts` |
| Inbox polling | `runtime/inbox-polling.ts` | `runtime/inbox-polling.test.ts` |
| Handoff service | `runtime/handoff.ts` | `runtime/handoff.test.ts` |
| Message mapper | `runtime/message-mapper.ts` | - |
| Prompts | `prompts/index.ts` | - |
| Worktree manager | `git/worktree-manager.ts` | `git/worktree-manager.test.ts` |

## File Map (Platform)

| App | Entry | Key Directories |
|-----|-------|-----------------|
| `apps/server/` | `src/index.ts` | `src/ws/` (WebSocket) |
| `apps/web/` | `src/main.tsx` | `src/components/`, `src/routes/`, `src/api/hooks/` |
| `apps/orchestrator-server/` | `src/index.ts` | `src/routes/` (route modules), `src/config.ts`, `src/services.ts` |
| `apps/orchestrator-web/` | `src/main.tsx` | `src/components/`, `src/routes/` |

## Critical Gotchas

See [GOTCHAS.md](GOTCHAS.md) for full list.

**Top 5:**
1. Task `blocked` status is **computed** from dependencies, never set directly
2. `sendDirectMessage()` needs `contentRef` (DocumentId), not raw text
3. `blocks` direction is **opposite** to `parent-child`/`awaits`
4. SQLite is cache, JSONL is source of truth
5. `sortByEffectivePriority()` mutates array in place

---

## Keeping Docs Updated

| If you... | Update |
|-----------|--------|
| Add/rename/move a source file | File Map tables in this README |
| Add a new type/interface | `reference/core-types.md` |
| Add a new API method | `reference/elemental-api.md` or `reference/orchestrator-api.md` |
| Add a CLI command | `reference/cli.md` |
| Add platform feature | `reference/platform.md` |
| Discover a gotcha | `GOTCHAS.md` |

**File paths are the source of truth.** If a file path in docs doesn't exist, the doc is wrong.

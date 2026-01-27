# Elemental Agent Docs

## Quick Navigation

| I want to... | Read | Key Files |
|-------------|------|-----------|
| Work with tasks | [core/types.md#task](core/types.md#task) | `packages/core/src/types/task.ts` |
| Work with entities | [core/types.md#entity](core/types.md#entity) | `packages/core/src/types/entity.ts` |
| Work with messages | [core/types.md#message](core/types.md#message) | `packages/core/src/types/message.ts` |
| Work with documents | [core/types.md#document](core/types.md#document) | `packages/core/src/types/document.ts` |
| Work with collections | [core/collections.md](core/collections.md) | `packages/core/src/types/plan.ts`, etc. |
| Add dependencies | [core/dependencies.md](core/dependencies.md) | `packages/sdk/src/services/dependency.ts` |
| Understand storage | [core/storage.md](core/storage.md) | `packages/storage/src/bun-backend.ts` |
| Export/import data | [core/storage.md#sync-system](core/storage.md#sync-system) | `packages/sdk/src/sync/service.ts` |
| Add API endpoint | [platform/server.md](platform/server.md) | `apps/server/src/index.ts` |
| Add React component | [platform/web.md](platform/web.md) | `apps/web/src/components/` |
| Add React hook | [platform/web.md](platform/web.md) | `apps/web/src/api/hooks/` |
| Use WebSocket | [platform/websocket.md](platform/websocket.md) | `apps/server/src/ws/` |
| Use the TypeScript API | [api/elemental-api.md](api/elemental-api.md) | `packages/sdk/src/api/elemental-api.ts` |
| Use the Orchestrator API | [api/orchestrator-api.md](api/orchestrator-api.md) | `packages/orchestrator-sdk/src/api/orchestrator-api.ts` |
| Work with agent capabilities | [api/orchestrator-api.md#agent-capabilities](api/orchestrator-api.md#agent-capabilities) | `packages/orchestrator-sdk/src/services/capability-service.ts` |
| Work with agent channels | [api/orchestrator-api.md#agent-channels](api/orchestrator-api.md#agent-channels) | `packages/orchestrator-sdk/src/services/agent-registry.ts` |
| Define agent role definitions | [orchestrator/role-definitions.md](orchestrator/role-definitions.md) | `packages/orchestrator-sdk/src/services/role-definition-service.ts` |
| Assign tasks to agents | [api/orchestrator-api.md#taskassignmentservice-tb-o8](api/orchestrator-api.md#taskassignmentservice-tb-o8) | `packages/orchestrator-sdk/src/services/task-assignment-service.ts` |
| Dispatch tasks to agents | [api/orchestrator-api.md#dispatchservice-tb-o8a](api/orchestrator-api.md#dispatchservice-tb-o8a) | `packages/orchestrator-sdk/src/services/dispatch-service.ts` |
| Spawn agent processes | [api/orchestrator-api.md#spawnerservice-tb-o9](api/orchestrator-api.md#spawnerservice-tb-o9) | `packages/orchestrator-sdk/src/runtime/spawner.ts` |
| Manage agent sessions | [api/orchestrator-api.md#sessionmanager-tb-o10](api/orchestrator-api.md#sessionmanager-tb-o10) | `packages/orchestrator-sdk/src/runtime/session-manager.ts` |
| Manage git worktrees | [api/orchestrator-api.md#worktreemanager-tb-o11](api/orchestrator-api.md#worktreemanager-tb-o11) | `packages/orchestrator-sdk/src/git/worktree-manager.ts` |
| Work with agent messages | [api/orchestrator-api.md#message-types-tb-o14a](api/orchestrator-api.md#message-types-tb-o14a) | `packages/orchestrator-sdk/src/types/message-types.ts` |
| Use the Orchestrator Server | [platform/orchestrator-server.md](platform/orchestrator-server.md) | `apps/orchestrator-server/src/index.ts` |
| Use the Orchestrator Web UI | [apps/orchestrator-web.md](apps/orchestrator-web.md) | `apps/orchestrator-web/src/` |
| Use the CLI | [api/cli.md](api/cli.md) | `packages/sdk/src/cli/commands/` |
| Debug issues | [gotchas.md](gotchas.md) | - |

## Architecture at a Glance

The project is a TurboRepo monorepo with the following structure:

```
┌─────────────────┐     ┌─────────────────┐
│   apps/web/     │────→│  apps/server/   │
│   (React SPA)   │ HTTP│   (Hono API)    │
└─────────────────┘     └────────┬────────┘
                                 │
                        ┌────────▼────────┐
                        │  @elemental/sdk │
                        │  (packages/sdk/)│
                        └────────┬────────┘
                                 │
              ┌──────────────────┼──────────────────┐
              │                  │                  │
     ┌────────▼────────┐ ┌──────▼───────┐ ┌───────▼───────┐
     │ @elemental/core │ │@elemental/   │ │   SQLite      │
     │ (packages/core/)│ │   storage    │ │ (.elemental/) │
     └─────────────────┘ └──────────────┘ └───────────────┘
```

## File Map (Packages)

| Package | Purpose | Key Exports |
|---------|---------|-------------|
| `packages/core/` | Shared types, errors, ID generation, utilities | `ElementType`, `Task`, `Entity`, `Document`, `ErrorCode`, `generateId`, factory functions |
| `packages/storage/` | SQLite storage layer with Bun, Node.js, and Browser backends | `createStorage`, `initializeSchema`, `StorageBackend` |
| `packages/sdk/` | Core API, services, sync, CLI | `ElementalAPI`, `createElementalAPI`, `SyncService`, `InboxService`, CLI commands |
| `packages/orchestrator-sdk/` | Agent orchestration, task metadata, worktree naming | `OrchestratorAPI`, `AgentRole`, `AgentMetadata`, `OrchestratorTaskMeta` |

## File Map (@elemental/core - packages/core/src/)

| Concept | Source | Tests |
|---------|--------|-------|
| Package entry | `index.ts` | - |
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
| ID generator | `id/generator.ts` | `id/generator.test.ts` |
| Error codes | `errors/codes.ts` | `errors/codes.test.ts` |
| Error base class | `errors/error.ts` | `errors/error.test.ts` |
| Error factories | `errors/factories.ts` | `errors/factories.test.ts` |
| Mention parsing | `utils/mentions.ts` | - |

## File Map (@elemental/storage - packages/storage/src/)

| Concept | Source | Tests |
|---------|--------|-------|
| Package entry | `index.ts` | - |
| Storage backend interface | `backend.ts` | `backend.test.ts` |
| Storage factory | `create-backend.ts` | - |
| Storage errors | `errors.ts` | `errors.test.ts` |
| Storage types | `types.ts` | `types.test.ts` |
| Schema & migrations | `schema.ts` | `schema.test.ts` |
| Bun backend | `bun-backend.ts` | `bun-backend.test.ts` |
| Node backend | `node-backend.ts` | - |
| Browser backend | `browser-backend.ts` | `browser-backend.test.ts` |

## File Map (@elemental/sdk - packages/sdk/src/)

| Concept | Source | Tests |
|---------|--------|-------|
| Package entry | `index.ts` | - |
| ElementalAPI | `api/elemental-api.ts` | `api/*.integration.test.ts` |
| API types | `api/types.ts` | `api/types.test.ts` |
| Dependency service | `services/dependency.ts` | `services/dependency.test.ts` |
| Blocked cache | `services/blocked-cache.ts` | `services/blocked-cache.test.ts` |
| Inbox service | `services/inbox.ts` | `services/inbox.test.ts` |
| Priority service | `services/priority-service.ts` | `services/priority-service.test.ts` |
| ID length cache | `services/id-length-cache.ts` | `services/id-length-cache.test.ts` |
| Sync service | `sync/service.ts` | `sync/service.test.ts` |
| Sync types | `sync/types.ts` | - |
| Sync serialization | `sync/serialization.ts` | - |
| Sync merge | `sync/merge.ts` | - |
| Sync hashing | `sync/hash.ts` | - |
| CLI runner | `cli/runner.ts` | `cli/runner.test.ts` |
| CLI parser | `cli/parser.ts` | `cli/parser.test.ts` |
| CLI formatter | `cli/formatter.ts` | `cli/formatter.test.ts` |
| CLI types | `cli/types.ts` | `cli/types.test.ts` |
| CLI commands | `cli/commands/*.ts` | `cli/commands/*.test.ts` |
| CLI entry point | `bin/el.ts` | - |
| Config loader | `config/config.ts` | `config/config.test.ts` |
| Config types | `config/types.ts` | - |
| Config defaults | `config/defaults.ts` | - |
| Config validation | `config/validation.ts` | - |
| Config merge | `config/merge.ts` | - |
| Config file I/O | `config/file.ts` | `config/file.test.ts` |
| Config env vars | `config/env.ts` | - |
| Duration parsing | `config/duration.ts` | - |
| HTTP sync handlers | `http/sync-handlers.ts` | - |
| Identity system | `systems/identity.ts` | `systems/identity.test.ts` |

## File Map (@elemental/orchestrator-sdk - packages/orchestrator-sdk/src/)

| Concept | Source | Tests |
|---------|--------|-------|
| Package entry | `index.ts` | - |
| Type exports | `types/index.ts` | - |
| Agent types | `types/agent.ts` | `types/agent.test.ts` |
| Task metadata | `types/task-meta.ts` | `types/task-meta.test.ts` |
| Role definition types | `types/role-definition.ts` | `types/role-definition.test.ts` |
| Message types | `types/message-types.ts` | `types/message-types.test.ts` |
| OrchestratorAPI | `api/orchestrator-api.ts` | `api/orchestrator-api.integration.test.ts` |
| Agent registry | `services/agent-registry.ts` | `services/agent-registry.test.ts` |
| Capability service | `services/capability-service.ts` | `services/capability-service.test.ts` |
| Role definition service | `services/role-definition-service.ts` | `services/role-definition-service.test.ts` |
| Task assignment service | `services/task-assignment-service.ts` | `services/task-assignment-service.test.ts` |
| Dispatch service | `services/dispatch-service.ts` | `services/dispatch-service.test.ts` |
| Spawner service | `runtime/spawner.ts` | `runtime/spawner.test.ts`, `runtime/spawner.integration.test.ts` |
| Session manager | `runtime/session-manager.ts` | `runtime/session-manager.test.ts` |
| Inbox polling | `runtime/inbox-polling.ts` | `runtime/inbox-polling.test.ts` |
| Predecessor query | `runtime/predecessor-query.ts` | `runtime/predecessor-query.test.ts` |
| Handoff service | `runtime/handoff.ts` | `runtime/handoff.test.ts` |
| Worktree manager | `git/worktree-manager.ts` | `git/worktree-manager.test.ts` |

## File Map (@elemental/orchestrator-server - apps/orchestrator-server/src/)

| Concept | Source | Tests |
|---------|--------|-------|
| Server entry | `index.ts` | `index.test.ts` |

## File Map (@elemental/orchestrator-web - apps/orchestrator-web/src/)

| Concept | Source | Tests |
|---------|--------|-------|
| React entry | `main.tsx` | - |
| Router config | `router.tsx` | `tests/scaffold.spec.ts` |
| App shell layout | `components/layout/AppShell.tsx` | - |
| Sidebar navigation | `components/layout/Sidebar.tsx` | - |
| Director panel | `components/layout/DirectorPanel.tsx` | `tests/director-terminal.spec.ts` |
| Mobile drawer | `components/layout/MobileDrawer.tsx` | - |
| Activity page | `routes/activity/index.tsx` | - |
| Tasks page | `routes/tasks/index.tsx` | - |
| Agents page | `routes/agents/index.tsx` | `tests/agents.spec.ts` |
| Workspaces page | `routes/workspaces/index.tsx` | `tests/workspaces.spec.ts` |
| Workspace pane manager | `components/workspace/usePaneManager.ts` | - |
| Workspace pane component | `components/workspace/WorkspacePane.tsx` | - |
| Workspace grid layout | `components/workspace/WorkspaceGrid.tsx` | - |
| Stream viewer | `components/workspace/StreamViewer.tsx` | - |
| Add pane dialog | `components/workspace/AddPaneDialog.tsx` | - |
| Workspace types | `components/workspace/types.ts` | - |
| Workflows page | `routes/workflows/index.tsx` | - |
| Metrics page | `routes/metrics/index.tsx` | - |
| Settings page | `routes/settings/index.tsx` | - |
| API types | `api/types.ts` | - |
| Agent hooks | `api/hooks/useAgents.ts` | - |
| AgentCard component | `components/agent/AgentCard.tsx` | - |
| AgentStatusBadge | `components/agent/AgentStatusBadge.tsx` | - |
| AgentRoleBadge | `components/agent/AgentRoleBadge.tsx` | - |
| XTerminal component | `components/terminal/XTerminal.tsx` | `tests/director-terminal.spec.ts` |
| Terminal exports | `components/terminal/index.ts` | - |
| UI components | `components/ui/*.tsx` | - |
| Design tokens | `styles/tokens.css` | - |

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

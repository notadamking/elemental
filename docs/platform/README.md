# Platform Docs

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     apps/web/ (React SPA)                    │
│  TanStack Query + React Router + Tailwind + Shadcn/ui       │
└─────────────────────────────────────────────────────────────┘
                              │
                    HTTP/REST │ WebSocket
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   apps/server/ (Hono API)                    │
│              REST endpoints + WebSocket events              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    @elemental/core (src/)                    │
│                    ElementalAPI + Storage                    │
└─────────────────────────────────────────────────────────────┘
```

- **Server**: `apps/server/` - Hono HTTP + WebSocket
- **Client**: `apps/web/` - React + TanStack Query + Tailwind

## Quick Tasks

### Add an API endpoint
1. Add route handler in `apps/server/src/index.ts`
2. See existing patterns in the same file
3. Details: [server.md](server.md)

### Add a React hook
1. Create: `apps/web/src/api/hooks/use{Feature}.ts`
2. Import hooks directly from their source files
3. Example: `apps/web/src/api/hooks/useAllElements.ts`
4. Details: [web.md](web.md)

### Add a page/route
1. Create: `apps/web/src/routes/{feature}.tsx`
2. Register: `apps/web/src/router.tsx`
3. Add sidebar link: `apps/web/src/components/layout/Sidebar.tsx`
4. Details: [web.md](web.md)

### Add a UI component
1. Primitive: `apps/web/src/components/ui/`
2. Feature-specific: `apps/web/src/components/{feature}/`
3. Shared: `apps/web/src/components/shared/`

### Add WebSocket event handling
1. Server: `apps/server/src/ws/`
2. Client: `apps/web/src/api/websocket.ts`
3. Details: [websocket.md](websocket.md)

## File Map

| Area | Files |
|------|-------|
| Server entry | `apps/server/src/index.ts` |
| WebSocket server | `apps/server/src/ws/broadcaster.ts`, `handler.ts`, `types.ts` |
| WebSocket client | `apps/web/src/api/websocket.ts` |
| React entry | `apps/web/src/main.tsx` |
| App shell | `apps/web/src/App.tsx` |
| Router | `apps/web/src/router.tsx` |
| API hooks | `apps/web/src/api/hooks/useAllElements.ts`, `useRealtimeEvents.ts` |
| Routes | `apps/web/src/routes/*.tsx` |
| Layout | `apps/web/src/components/layout/AppShell.tsx`, `Sidebar.tsx` |
| Dashboard | `apps/web/src/components/dashboard/DashboardCharts.tsx` |
| Editor | `apps/web/src/components/editor/BlockEditor.tsx`, `SlashCommands.tsx`, `BubbleMenu.tsx`, `DocumentPickerModal.tsx`, `TaskPickerModal.tsx`, `blocks/TaskEmbedBlock.tsx`, `blocks/DocumentEmbedBlock.tsx` |
| Task UI | `apps/web/src/components/task/KanbanBoard.tsx`, `TaskDetailPanel.tsx`, `CreateTaskModal.tsx` |
| Entity UI | `apps/web/src/components/entity/EntityCard.tsx`, `TaskCard.tsx`, `PlanCard.tsx`, `TeamCard.tsx`, `WorkflowCard.tsx`, `types.ts` |
| Document UI | `apps/web/src/components/document/CreateDocumentModal.tsx`, `CreateLibraryModal.tsx` |
| Message UI | `apps/web/src/components/message/ChannelMembersPanel.tsx`, `CreateChannelModal.tsx` |
| Workflow UI | `apps/web/src/components/workflow/PourWorkflowModal.tsx` |
| Navigation | `apps/web/src/components/navigation/CommandPalette.tsx` |
| Shared | `apps/web/src/components/shared/Pagination.tsx`, `VirtualizedList.tsx`, `EmptyState.tsx`, `ProgressRing.tsx`, `DataPreloader.tsx`, `ElementNotFound.tsx` |
| UI primitives | `apps/web/src/components/ui/` (Badge, Button, Card, Dialog, Input, Select, TagInput, ThemeToggle, Tooltip) |
| Custom hooks | `apps/web/src/hooks/useDeepLink.ts`, `useKeyboardShortcuts.ts`, `usePaginatedData.ts`, `useTheme.ts`, `useDebounce.ts`, `useTrackDashboardSection.ts` |
| Lib utilities | `apps/web/src/lib/deep-link.ts`, `keyboard.ts` |

## Routes

| Route | File | Description |
|-------|------|-------------|
| `/` | Redirects to user's preferred dashboard lens | Root redirect |
| `/dashboard/overview` | `apps/web/src/routes/dashboard.tsx` | Dashboard |
| `/dashboard/task-flow` | `apps/web/src/routes/task-flow.tsx` | Task flow view |
| `/dashboard/agents` | `apps/web/src/routes/agent-activity.tsx` | Agent activity |
| `/dashboard/dependencies` | `apps/web/src/routes/dependency-graph.tsx` | Dependency graph |
| `/dashboard/timeline` | `apps/web/src/routes/timeline.tsx` | Timeline |
| `/tasks` | `apps/web/src/routes/tasks.tsx` | Task list |
| `/plans` | `apps/web/src/routes/plans.tsx` | Plans |
| `/workflows` | `apps/web/src/routes/workflows.tsx` | Workflows |
| `/messages` | `apps/web/src/routes/messages.tsx` | Messages/Channels |
| `/documents` | `apps/web/src/routes/documents.tsx` | Documents |
| `/entities` | `apps/web/src/routes/entities.tsx` | Entities |
| `/teams` | `apps/web/src/routes/teams.tsx` | Teams |
| `/settings` | `apps/web/src/routes/settings.tsx` | Settings |

---

## Keeping Docs Updated (MANDATORY)

**When you modify platform code, you MUST update these docs in the same commit:**

| If you... | Update |
|-----------|--------|
| Add/rename a route | `router.tsx` registration AND Routes table above |
| Add API endpoint | server.md AND this README if significant |
| Add React hook | web.md AND File Map above |
| Add page/feature | web.md AND Routes table above |
| Add component | File Map in this README |

**Enforcement:**
- Never merge platform changes without updating this README
- File paths are the source of truth - if a path doesn't exist, fix the doc immediately

**Stale docs waste more context than they save.** Keep them accurate or delete them.

# TB84: Dependencies as Sub-Issues Display

## Overview

Enhance the TaskDetailPanel to display dependencies (blockers and blocks) as expandable sub-issue lists, similar to how Linear displays sub-issues. This provides a more actionable view of task dependencies with:
- Expandable "Blocked By" section showing tasks that block this task
- Expandable "Blocks" section showing tasks blocked by this task
- Progress indicator for resolved blockers
- Quick navigation to related tasks
- Ability to create new blocker tasks inline

## Implementation Details

### Server-Side Changes

#### New Endpoint: `/api/tasks/:id/dependency-tasks`

Added a new endpoint in `apps/server/src/index.ts` that returns hydrated task details for dependencies:

```typescript
GET /api/tasks/:id/dependency-tasks

Response:
{
  blockedBy: [
    {
      dependencyType: "blocks",
      task: {
        id: "el-xxxx",
        title: "Blocking task title",
        status: "open" | "in_progress" | "completed" | ...,
        priority: 1-5
      }
    },
    ...
  ],
  blocks: [
    {
      dependencyType: "blocks",
      task: {
        id: "el-yyyy",
        title: "Blocked task title",
        status: "open",
        priority: 3
      }
    },
    ...
  ],
  progress: {
    resolved: 2,  // Count of blockedBy tasks with status completed or cancelled
    total: 5      // Total count of blockedBy tasks
  }
}
```

**Logic:**
- Uses `api.getDependencies(taskId)` to get outgoing dependencies (tasks THIS task blocks)
- Uses `api.getDependents(taskId)` to get incoming dependencies (tasks that block THIS task)
- Filters to only include `blocks` and `awaits` dependency types (excludes `references`)
- Fetches full task details for all related tasks in parallel
- Calculates progress stats (resolved = completed + cancelled)

### Frontend Changes

#### New Types (`TaskDetailPanel.tsx`)

```typescript
interface DependencyTask {
  id: string;
  title: string;
  status: string;
  priority: number;
}

interface HydratedDependency {
  dependencyType: string;
  task: DependencyTask;
}

interface DependencyTasksResponse {
  blockedBy: HydratedDependency[];
  blocks: HydratedDependency[];
  progress: {
    resolved: number;
    total: number;
  };
}
```

#### New Hooks

1. **`useDependencyTasks(taskId: string)`**
   - Fetches hydrated dependency tasks from `/api/tasks/:id/dependency-tasks`
   - Query key: `['tasks', taskId, 'dependency-tasks']`

2. **`useCreateBlockerTask()`**
   - Mutation that creates a new task and establishes a blocking dependency
   - First creates the task via `POST /api/tasks`
   - Then creates the dependency via `POST /api/dependencies`
   - Invalidates relevant queries on success

#### New Components

1. **`SubIssueCard`**
   - Displays a single dependency task as a mini-card
   - Shows: status icon, title, priority badge (P1-P5)
   - Completed/cancelled tasks have reduced opacity and strikethrough
   - Click navigates to the related task

2. **`CreateBlockerModal`**
   - Modal for creating a new blocker task
   - Fields: title (required), priority (defaults to P3)
   - Shows which task will be blocked
   - Creates task and dependency in one flow

3. **`DependencySubIssues`**
   - Main container component for dependency display
   - Shows "Blocked By" section with progress: "X of Y resolved"
   - Shows "Blocks" section with count
   - Both sections are collapsible
   - Always shows "Create Blocker Task" button

### Status Icons

Status icons used in sub-issue cards:

| Status | Icon | Color |
|--------|------|-------|
| open | Circle (outline) | blue |
| in_progress | CircleDot (filled center) | yellow |
| blocked | AlertTriangle | red |
| completed | CheckCircle2 | green |
| cancelled | X | gray |
| deferred | Clock | purple |

### Test Data IDs

- `dependency-sub-issues-section` - Main container
- `dependency-sub-issues-loading` - Loading state
- `blocked-by-toggle` - Expandable header for blockers
- `blocked-by-list` - List of blocker cards
- `blocks-toggle` - Expandable header for blocks
- `blocks-list` - List of blocked task cards
- `sub-issue-{taskId}` - Individual sub-issue card
- `create-blocker-btn` - Button to open create modal
- `create-blocker-modal` - Modal container
- `blocker-title-input` - Title input in modal
- `blocker-priority-{1-5}` - Priority buttons in modal
- `create-blocker-submit` - Submit button in modal

## Testing

### Playwright Tests (`apps/web/tests/tb84-dependency-sub-issues.spec.ts`)

**API Tests:**
- `returns empty arrays for task with no dependencies`
- `returns hydrated blockedBy tasks`
- `returns hydrated blocks tasks`
- `calculates progress correctly`
- `returns 404 for non-existent task`

**Blocked By Section Tests:**
- `shows "Blocked By" section with progress for task with blockers`
- `blockedBy section is collapsible`

**Blocks Section Tests:**
- `shows "Blocks" section for task that blocks others`

**Sub-Issue Card Tests:**
- `sub-issue card shows status icon, title, and priority`
- `completed blockers are shown with strikethrough style`
- `clicking sub-issue card navigates to that task`

**Create Blocker Tests:**
- `shows "Create Blocker Task" button`
- `clicking Create Blocker opens modal`
- `can create a blocker task that blocks the current task`
- `modal can be cancelled with Cancel button`

**Both Directions Test:**
- `shows both sections when task has dependencies in both directions`

Run tests:
```bash
cd apps/web && bun run test --grep "TB84"
```

## Files Changed

- `apps/server/src/index.ts` - Added `/api/tasks/:id/dependency-tasks` endpoint
- `apps/web/src/components/task/TaskDetailPanel.tsx` - Added new types, hooks, and components
- `apps/web/tests/tb84-dependency-sub-issues.spec.ts` - New test file (16 tests)
- `specs/platform/PLAN.md` - Marked TB84 complete
- `specs/platform/TB84-dependency-sub-issues.md` - This spec file

## Visual Design

The dependencies are displayed as expandable sections below the attachments:

```
┌─────────────────────────────────────────────┐
│ Attachments (2)                              │
│ ├─ document.md                               │
│ └─ notes.txt                                 │
│                                              │
│ ▼ Blocked By (1 of 3 resolved)              │
│ ├─ ○ Design mockups                    P2   │  ← in_progress
│ ├─ ✓ API specification                 P1   │  ← completed (faded)
│ └─ ○ Review requirements               P3   │  ← open
│                                              │
│ ▼ Blocks (2)                                │
│ ├─ ○ Frontend implementation           P2   │
│ └─ ○ Documentation update              P4   │
│                                              │
│ [+ Create Blocker Task]                      │
└─────────────────────────────────────────────┘
```

Colors:
- Open/in_progress tasks: normal opacity
- Completed/cancelled tasks: 70% opacity with strikethrough
- Priority badges match task priority colors

## Dependencies

- `@tanstack/react-router` - For navigation to related tasks
- `@tanstack/react-query` - For data fetching and caching
- `lucide-react` - For status icons (Circle, CheckCircle2, AlertTriangle, etc.)

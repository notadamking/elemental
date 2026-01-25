# TB74: Card and Table Styling

## Status: Implemented

## Purpose

Provide consistent, design-token-based styling for all card-based list views and empty states across the Elemental platform. This creates a cohesive visual language for displaying entities, tasks, plans, workflows, and teams.

## Implementation Summary

### Components Created

All components are located in `apps/web/src/components/entity/`:

1. **TaskCard** - Displays tasks with priority badges, task type color coding, and assignee info
2. **EntityCard** - Displays entities (agents, humans, systems) with type-specific icons and badges
3. **TeamCard** - Displays teams with member count and optional avatar stack
4. **PlanCard** - Displays plans with status badges and progress bar support
5. **WorkflowCard** - Displays workflows with ephemeral indicators and progress bar support
6. **EmptyState** - Consistent empty state component with type-specific icons and action buttons

### Shared Types

Located in `apps/web/src/components/entity/types.ts`:
- Task, Entity, Team, Plan, Workflow, Document, Channel interfaces

### Design Token Integration

All components use CSS custom properties from `apps/web/src/styles/tokens.css`:
- `--color-card-bg`, `--color-card-border`, `--color-card-hover` for card backgrounds
- `--color-text`, `--color-text-secondary`, `--color-text-tertiary` for typography
- `--color-primary`, `--color-success`, `--color-warning`, `--color-error` for semantic colors
- `--color-surface-active`, `--color-surface-selected` for interactive states
- `--duration-fast` for transitions

### Features

#### TaskCard
- Left border color-coded by task type (bug=red, feature=purple, task=blue, chore=gray)
- Priority badge with semantic colors (Critical=error, High=warning, Medium=primary, Low=default, Trivial=outline)
- Task type badge
- Assignee display
- Tags with overflow (shows first 3, then "+N")
- Optional ID display
- Optional timestamp display
- Selection ring state

#### EntityCard
- Avatar with type-specific icon (Bot for agent, User for human, Server for system)
- Type-specific background colors
- Active/inactive status badge
- Tags with overflow
- Timestamp display
- Selection ring state

#### TeamCard
- Team avatar with Users icon
- Member count badge
- Optional member avatar stack slot
- Active/deleted status badge
- Tags with overflow
- Timestamp display
- Selection ring state

#### PlanCard
- Target icon
- Status badge (draft, active, completed, cancelled)
- Optional progress bar
- Tags with overflow
- Selection ring state with background highlight

#### WorkflowCard
- Workflow/Flame icon based on ephemeral status
- Ephemeral indicator badge
- Status badge (created, active, completed, failed, cancelled)
- Optional progress bar with status-colored fill
- Playbook reference display
- Tags with overflow
- Dashed border for ephemeral workflows
- Selection ring state

#### EmptyState
- Type-specific icons (tasks, entities, teams, documents, messages, plans, workflows, inbox, search, generic)
- Title and description text
- Optional action button with Plus icon

### DataTable Note

The project uses card-based grid layouts rather than traditional DataTable components. The card styling provides the equivalent visual consistency that would be achieved with DataTable styling.

## Route Integration

The dashboard.tsx route has been updated to import and use the shared TaskCard component instead of defining it inline. The local Task interface and TaskCard function were removed from dashboard.tsx.

Other routes (entities.tsx, teams.tsx, plans.tsx, workflows.tsx) continue to use their inline card implementations, but the shared components are available for future refactoring.

## Exports

Components are exported from `apps/web/src/components/entity/index.ts`:
- TaskCard, TaskCardProps
- EntityCard, EntityCardProps
- TeamCard, TeamCardProps
- PlanCard, PlanCardProps
- WorkflowCard, WorkflowCardProps
- All type definitions

EmptyState is exported from `apps/web/src/components/shared/index.ts`:
- EmptyState, EmptyStateProps

## Testing

15 Playwright tests in `apps/web/tests/tb74-card-styling.spec.ts`:

1. TaskCard Component
   - Task cards display with consistent styling in dashboard
   - Task cards show priority badges
   - Task cards have proper color coding by type

2. EntityCard Component
   - Entity cards display in entities page
   - Entity cards show type badges
   - Entity cards show avatar with icon

3. TeamCard Component
   - Team cards display in teams page
   - Team cards show member count

4. PlanCard Component
   - Plans page displays cards

5. WorkflowCard Component
   - Workflows page displays cards

6. Design Tokens Integration
   - Cards respect dark mode styling
   - Cards have proper hover states

7. EmptyState Component
   - Empty state displays helpful message when no data

8. Card Selection States
   - Entity cards show selection state when clicked
   - Team cards show selection state when clicked

## Implementation Checklist

- [x] Create consistent Card component with variants (default, elevated, outlined) - Enhanced existing Card.tsx
- [x] Restyle TaskCard with design tokens
  - [x] Subtle border, hover elevation, consistent padding
  - [x] Priority badges with semantic colors
  - [x] Task type color coding
  - [x] Timestamps in muted text
- [x] Restyle EntityCard with design tokens
  - [x] Type-specific icons and colors
  - [x] Active/inactive status
- [x] Restyle TeamCard with design tokens
  - [x] Member count badge
  - [x] Avatar stack slot
- [x] Create PlanCard with design tokens
  - [x] Status badges
  - [x] Progress bar support
- [x] Create WorkflowCard with design tokens
  - [x] Ephemeral indicators
  - [x] Status-based progress colors
- [x] Create EmptyState component
  - [x] Type-specific icons
  - [x] Action button support
- [x] Update dashboard.tsx to use shared TaskCard
- [x] Create types.ts with shared interfaces
- [x] Create index.ts for component exports
- [x] Write Playwright tests
- [x] Update specs/README.md
- [x] Update specs/platform/PLAN.md

## Related Specifications

- [TB71: Design Tokens](./TB71-design-tokens.md)
- [TB72: Dark/Light Mode](./TB72-dark-light-mode.md)
- [TB73: Core Component Styling](./TB73-core-component-styling.md)

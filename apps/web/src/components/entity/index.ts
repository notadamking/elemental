/**
 * Entity Components
 *
 * Reusable card components for displaying different element types.
 * All components use design tokens for consistent styling across light/dark modes.
 *
 * Core domain components are imported from @elemental/ui/domain.
 * App-specific components remain local.
 */

// Re-export domain components from @elemental/ui
export {
  TaskCard,
  type TaskCardProps,
  EntityCard,
  type EntityCardProps,
  PlanCard,
  type PlanCardProps,
  WorkflowCard,
  type WorkflowCardProps,
  TeamCard,
  type TeamCardProps,
  TaskStatusBadge,
  type TaskStatusBadgeProps,
  TaskPriorityBadge,
  type TaskPriorityBadgeProps,
  TaskTypeBadge,
  type TaskTypeBadgeProps,
  MergeStatusBadge,
  type MergeStatusBadgeProps,
} from '@elemental/ui/domain';

// Re-export types from @elemental/ui
export type {
  Task,
  Entity,
  Plan,
  Workflow,
  Document,
  Channel,
  Team,
  TaskStatus,
  Priority,
  TaskType,
  MergeStatus,
  EntityType,
  PlanStatus,
  WorkflowStatus,
} from '@elemental/ui/domain';

// App-specific components (not yet extracted to @elemental/ui)
export { CreateEntityModal } from './CreateEntityModal';

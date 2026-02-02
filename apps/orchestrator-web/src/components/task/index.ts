/**
 * Task Components for Orchestrator Web
 *
 * Badge components are re-exported from @elemental/ui/domain.
 * TaskCard and TaskRow remain local as they have orchestrator-specific features.
 */

// Re-export badge components from @elemental/ui
export {
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
  TaskStatus,
  Priority,
  TaskType,
  MergeStatus,
} from '@elemental/ui/domain';

// Orchestrator-specific components (have action buttons, orchestrator metadata)
export { TaskCard } from './TaskCard';
export { TaskRow } from './TaskRow';
export { TaskDetailPanel } from './TaskDetailPanel';
export { CreateTaskModal } from './CreateTaskModal';

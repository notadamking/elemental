/**
 * @elemental/ui Domain Components
 *
 * Reusable domain-specific components for Task, Entity, Plan, Workflow, etc.
 * All components receive data via props and make no API calls.
 *
 * Usage:
 * - Import components: import { TaskCard, EntityCard, TaskStatusBadge } from '@elemental/ui/domain'
 * - Import types: import type { Task, Entity, Priority } from '@elemental/ui/domain'
 */

// Types
export type {
  BaseElement,
  Task,
  TaskStatus,
  Priority,
  TaskType,
  MergeStatus,
  Entity,
  EntityType,
  Plan,
  PlanStatus,
  Workflow,
  WorkflowStatus,
  Document,
  DocumentContentType,
  Channel,
  ChannelType,
  Team,
  PriorityConfig,
  EntityTypeConfig,
} from './types';

// Type utilities and constants
export {
  PRIORITY_CONFIG,
  TASK_TYPE_STYLES,
  ENTITY_TYPE_CONFIG,
  getPriorityConfig,
  getPriorityDisplayName,
  getPriorityColor,
  getStatusDisplayName,
  getStatusColor,
  getTaskTypeDisplayName,
  getTaskTypeColor,
  getTaskTypeStyle,
  getMergeStatusDisplayName,
  getMergeStatusColor,
  getEntityTypeConfig,
} from './types';

// Card components
export { TaskCard, type TaskCardProps } from './TaskCard';
export { EntityCard, type EntityCardProps } from './EntityCard';
export { PlanCard, type PlanCardProps } from './PlanCard';
export { WorkflowCard, type WorkflowCardProps } from './WorkflowCard';
export { TeamCard, type TeamCardProps } from './TeamCard';

// Badge components
export {
  TaskStatusBadge,
  type TaskStatusBadgeProps,
  TaskPriorityBadge,
  type TaskPriorityBadgeProps,
  TaskTypeBadge,
  type TaskTypeBadgeProps,
  MergeStatusBadge,
  type MergeStatusBadgeProps,
} from './TaskBadges';

// User selection
export { UserSelector } from './UserSelector';

// Channel components
export {
  ChannelHeader,
  ChannelIcon,
  ChannelSearchInput,
  useChannelSearch,
  type ChannelHeaderProps,
  type ChannelHeaderChannel,
  type ChannelSearchInputProps,
  type UseChannelSearchOptions,
  type UseChannelSearchReturn,
} from './ChannelHeader';

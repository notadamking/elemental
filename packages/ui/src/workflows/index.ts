/**
 * @elemental/ui Workflows Module
 *
 * Shared workflow and playbook components, hooks, and utilities.
 */

// Types
export type {
  WorkflowStatus,
  TaskStatus,
  Workflow,
  WorkflowTask,
  WorkflowProgress,
  WorkflowDependency,
  HydratedWorkflow,
  Playbook,
  PlaybookStep,
  PlaybookVariable,
} from './types';

// Constants
export {
  WORKFLOW_STATUS_CONFIG,
  STATUS_FILTER_OPTIONS,
  TASK_PRIORITY_COLORS,
  VARIABLE_TYPES,
} from './constants';

// Utilities
export {
  getWorkflowStatusDisplayName,
  getWorkflowStatusColor,
  formatWorkflowDuration,
  formatRelativeTime,
  generateStepId,
} from './utils';

// Hooks
export {
  useWorkflows,
  useWorkflow,
  useWorkflowTasks,
  useWorkflowProgress,
  useWorkflowDetail,
  usePlaybooks,
  usePlaybook,
  useCreateWorkflow,
  useUpdateWorkflow,
  useCancelWorkflow,
  useDeleteWorkflow,
  useBurnWorkflow,
  useSquashWorkflow,
  useCreatePlaybook,
  useUpdatePlaybook,
  useDeletePlaybook,
  usePourPlaybook,
} from './hooks';

// Components
export {
  StatusBadge,
  StatusFilter,
  ProgressBar,
  WorkflowListItem,
  MobileWorkflowCard,
  TaskStatusSummary,
  WorkflowTaskList,
  WorkflowDetailPanel,
  PlaybookCard,
  WorkflowCard,
  PourWorkflowModal,
  WorkflowEditorModal,
  WorkflowProgressDashboard,
} from './components';

/**
 * @elemental/ui Workflows Hooks
 *
 * Re-exports all workflow-related hooks.
 */

export {
  // Workflow queries
  useWorkflows,
  useWorkflow,
  useWorkflowTasks,
  useWorkflowProgress,
  useWorkflowDetail,
  useWorkflowsByStatus,
  useWorkflowCounts,
  // Workflow mutations
  useCreateWorkflow,
  useUpdateWorkflow,
  useStartWorkflow,
  useCancelWorkflow,
  useDeleteWorkflow,
  useBurnWorkflow,
  useSquashWorkflow,
  // Playbook queries
  usePlaybooks,
  usePlaybook,
  // Playbook mutations
  useCreatePlaybook,
  useUpdatePlaybook,
  useDeletePlaybook,
  usePourPlaybook,
} from './useWorkflowApi';

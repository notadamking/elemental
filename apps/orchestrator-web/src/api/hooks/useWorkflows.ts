/**
 * React Query hooks for workflow and playbook data
 *
 * Provides hooks for fetching and mutating workflow/playbook data from the orchestrator API.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  WorkflowsResponse,
  WorkflowResponse,
  WorkflowFilter,
  WorkflowStatus,
  WorkflowTasksResponse,
  PlaybooksResponse,
  PlaybookResponse,
  PlaybookFilter,
  Workflow,
  VariableType,
  TaskTypeValue,
  Priority,
  Complexity,
} from '../types';

// ============================================================================
// API Functions
// ============================================================================

const API_BASE = '/api';

async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
    throw new Error(error.error?.message || `HTTP ${response.status}`);
  }

  return response.json();
}

// ============================================================================
// Workflow Query Hooks
// ============================================================================

/**
 * Hook to fetch all workflows with optional filters
 */
export function useWorkflows(filter?: WorkflowFilter) {
  const params = new URLSearchParams();
  if (filter?.status && filter.status !== 'all') params.set('status', filter.status);
  if (filter?.playbookId) params.set('playbookId', filter.playbookId);
  if (filter?.ephemeral !== undefined) params.set('ephemeral', String(filter.ephemeral));
  if (filter?.limit) params.set('limit', String(filter.limit));

  const queryString = params.toString();
  const path = queryString ? `/workflows?${queryString}` : '/workflows';

  return useQuery<WorkflowsResponse, Error>({
    queryKey: ['workflows', filter],
    queryFn: () => fetchApi<WorkflowsResponse>(path),
    refetchInterval: 10000, // Poll every 10 seconds
  });
}

/**
 * Hook to fetch a single workflow by ID
 */
export function useWorkflow(workflowId: string | undefined) {
  return useQuery<WorkflowResponse, Error>({
    queryKey: ['workflow', workflowId],
    queryFn: () => fetchApi<WorkflowResponse>(`/workflows/${workflowId}`),
    enabled: !!workflowId,
  });
}

/**
 * Hook to fetch tasks belonging to a workflow with progress metrics
 *
 * TB-O35: Workflow Progress Dashboard
 */
export function useWorkflowTasks(workflowId: string | undefined) {
  return useQuery<WorkflowTasksResponse, Error>({
    queryKey: ['workflow-tasks', workflowId],
    queryFn: () => fetchApi<WorkflowTasksResponse>(`/workflows/${workflowId}/tasks`),
    enabled: !!workflowId,
    refetchInterval: 5000, // Poll every 5 seconds for real-time progress updates
  });
}

/**
 * Hook to get workflow detail with tasks and progress (combined)
 *
 * TB-O35: Workflow Progress Dashboard
 */
export function useWorkflowDetail(workflowId: string | undefined) {
  const workflowQuery = useWorkflow(workflowId);
  const tasksQuery = useWorkflowTasks(workflowId);

  return {
    workflow: workflowQuery.data?.workflow,
    tasks: tasksQuery.data?.tasks ?? [],
    progress: tasksQuery.data?.progress ?? {
      total: 0,
      completed: 0,
      inProgress: 0,
      blocked: 0,
      open: 0,
      percentage: 0,
    },
    dependencies: tasksQuery.data?.dependencies ?? [],
    isLoading: workflowQuery.isLoading || tasksQuery.isLoading,
    error: workflowQuery.error || tasksQuery.error,
    refetch: async () => {
      await workflowQuery.refetch();
      await tasksQuery.refetch();
    },
  };
}

/**
 * Hook to get workflows grouped by status
 */
export function useWorkflowsByStatus() {
  const { data, isLoading, error, refetch } = useWorkflows();

  const workflows = data?.workflows ?? [];

  const pending = workflows.filter(w => w.status === 'pending');
  const running = workflows.filter(w => w.status === 'running');
  const completed = workflows.filter(w => w.status === 'completed');
  const failed = workflows.filter(w => w.status === 'failed');
  const cancelled = workflows.filter(w => w.status === 'cancelled');
  const active = workflows.filter(w => w.status === 'pending' || w.status === 'running');
  const terminal = workflows.filter(w => ['completed', 'failed', 'cancelled'].includes(w.status));

  return {
    pending,
    running,
    completed,
    failed,
    cancelled,
    active,
    terminal,
    allWorkflows: workflows,
    total: data?.total ?? workflows.length,
    isLoading,
    error,
    refetch,
  };
}

/**
 * Hook to get workflow counts by status
 */
export function useWorkflowCounts() {
  const { allWorkflows, isLoading, error } = useWorkflowsByStatus();

  const counts = {
    all: allWorkflows.length,
    pending: allWorkflows.filter(w => w.status === 'pending').length,
    running: allWorkflows.filter(w => w.status === 'running').length,
    completed: allWorkflows.filter(w => w.status === 'completed').length,
    failed: allWorkflows.filter(w => w.status === 'failed').length,
    cancelled: allWorkflows.filter(w => w.status === 'cancelled').length,
    active: allWorkflows.filter(w => w.status === 'pending' || w.status === 'running').length,
    terminal: allWorkflows.filter(w => ['completed', 'failed', 'cancelled'].includes(w.status)).length,
  };

  return { counts, isLoading, error };
}

// ============================================================================
// Workflow Mutation Hooks
// ============================================================================

interface CreateWorkflowInput {
  title: string;
  descriptionRef?: string;
  playbookId?: string;
  ephemeral?: boolean;
  variables?: Record<string, unknown>;
  tags?: string[];
}

/**
 * Hook to create a new workflow
 */
export function useCreateWorkflow() {
  const queryClient = useQueryClient();

  return useMutation<WorkflowResponse, Error, CreateWorkflowInput>({
    mutationFn: async (input: CreateWorkflowInput) => {
      return fetchApi<WorkflowResponse>('/workflows', {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
    },
  });
}

interface UpdateWorkflowInput {
  workflowId: string;
  status?: WorkflowStatus;
  failureReason?: string;
  cancelReason?: string;
}

/**
 * Hook to update a workflow's status
 */
export function useUpdateWorkflow() {
  const queryClient = useQueryClient();

  return useMutation<WorkflowResponse, Error, UpdateWorkflowInput>({
    mutationFn: async ({ workflowId, ...updates }) => {
      return fetchApi<WorkflowResponse>(`/workflows/${workflowId}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      });
    },
    onSuccess: (_, { workflowId }) => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
      queryClient.invalidateQueries({ queryKey: ['workflow', workflowId] });
    },
  });
}

/**
 * Hook to start a workflow (transition to running)
 */
export function useStartWorkflow() {
  const queryClient = useQueryClient();

  return useMutation<WorkflowResponse, Error, { workflowId: string }>({
    mutationFn: async ({ workflowId }) => {
      return fetchApi<WorkflowResponse>(`/workflows/${workflowId}/start`, {
        method: 'POST',
      });
    },
    onSuccess: (_, { workflowId }) => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
      queryClient.invalidateQueries({ queryKey: ['workflow', workflowId] });
    },
  });
}

/**
 * Hook to cancel a workflow
 */
export function useCancelWorkflow() {
  const queryClient = useQueryClient();

  return useMutation<WorkflowResponse, Error, { workflowId: string; reason?: string }>({
    mutationFn: async ({ workflowId, reason }) => {
      return fetchApi<WorkflowResponse>(`/workflows/${workflowId}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });
    },
    onSuccess: (_, { workflowId }) => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
      queryClient.invalidateQueries({ queryKey: ['workflow', workflowId] });
    },
  });
}

/**
 * Hook to delete a workflow
 */
export function useDeleteWorkflow() {
  const queryClient = useQueryClient();

  return useMutation<{ success: boolean }, Error, { workflowId: string }>({
    mutationFn: async ({ workflowId }) => {
      return fetchApi(`/workflows/${workflowId}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
    },
  });
}

// ============================================================================
// Playbook Query Hooks
// ============================================================================

/**
 * Hook to fetch all playbooks with optional filters
 */
export function usePlaybooks(filter?: PlaybookFilter) {
  const params = new URLSearchParams();
  if (filter?.name) params.set('name', filter.name);
  if (filter?.limit) params.set('limit', String(filter.limit));

  const queryString = params.toString();
  const path = queryString ? `/playbooks?${queryString}` : '/playbooks';

  return useQuery<PlaybooksResponse, Error>({
    queryKey: ['playbooks', filter],
    queryFn: () => fetchApi<PlaybooksResponse>(path),
    refetchInterval: 30000, // Poll every 30 seconds (playbooks change less frequently)
  });
}

/**
 * Hook to fetch a single playbook by ID
 */
export function usePlaybook(playbookId: string | undefined) {
  return useQuery<PlaybookResponse, Error>({
    queryKey: ['playbook', playbookId],
    queryFn: () => fetchApi<PlaybookResponse>(`/playbooks/${playbookId}`),
    enabled: !!playbookId,
  });
}

// ============================================================================
// Playbook Mutation Hooks
// ============================================================================

interface PlaybookStepInput {
  id: string;
  title: string;
  description?: string;
  taskType?: TaskTypeValue;
  priority?: Priority;
  complexity?: Complexity;
  assignee?: string;
  dependsOn?: string[];
  condition?: string;
}

interface PlaybookVariableInput {
  name: string;
  description?: string;
  type: VariableType;
  required: boolean;
  default?: unknown;
  enum?: unknown[];
}

interface CreatePlaybookInput {
  name: string;
  title: string;
  descriptionRef?: string;
  steps: PlaybookStepInput[];
  variables: PlaybookVariableInput[];
  extends?: string[];
  tags?: string[];
}

/**
 * Hook to create a new playbook
 */
export function useCreatePlaybook() {
  const queryClient = useQueryClient();

  return useMutation<PlaybookResponse, Error, CreatePlaybookInput>({
    mutationFn: async (input: CreatePlaybookInput) => {
      return fetchApi<PlaybookResponse>('/playbooks', {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['playbooks'] });
    },
  });
}

interface UpdatePlaybookInput {
  playbookId: string;
  title?: string;
  steps?: PlaybookStepInput[];
  variables?: PlaybookVariableInput[];
  extends?: string[];
  descriptionRef?: string;
  tags?: string[];
}

/**
 * Hook to update a playbook
 */
export function useUpdatePlaybook() {
  const queryClient = useQueryClient();

  return useMutation<PlaybookResponse, Error, UpdatePlaybookInput>({
    mutationFn: async ({ playbookId, ...updates }) => {
      return fetchApi<PlaybookResponse>(`/playbooks/${playbookId}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      });
    },
    onSuccess: (_, { playbookId }) => {
      queryClient.invalidateQueries({ queryKey: ['playbooks'] });
      queryClient.invalidateQueries({ queryKey: ['playbook', playbookId] });
    },
  });
}

/**
 * Hook to delete a playbook
 */
export function useDeletePlaybook() {
  const queryClient = useQueryClient();

  return useMutation<{ success: boolean }, Error, { playbookId: string }>({
    mutationFn: async ({ playbookId }) => {
      return fetchApi(`/playbooks/${playbookId}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['playbooks'] });
    },
  });
}

interface PourPlaybookInput {
  playbookId: string;
  title?: string;
  variables?: Record<string, unknown>;
  ephemeral?: boolean;
}

/**
 * Hook to pour a playbook (instantiate as a workflow)
 */
export function usePourPlaybook() {
  const queryClient = useQueryClient();

  return useMutation<WorkflowResponse, Error, PourPlaybookInput>({
    mutationFn: async ({ playbookId, ...input }) => {
      return fetchApi<WorkflowResponse>(`/playbooks/${playbookId}/pour`, {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
    },
  });
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get display name for workflow status
 */
export function getWorkflowStatusDisplayName(status: WorkflowStatus): string {
  switch (status) {
    case 'pending': return 'Pending';
    case 'running': return 'Running';
    case 'completed': return 'Completed';
    case 'failed': return 'Failed';
    case 'cancelled': return 'Cancelled';
    default: return status;
  }
}

/**
 * Get status color class for workflow
 */
export function getWorkflowStatusColor(status: WorkflowStatus): string {
  switch (status) {
    case 'pending': return 'text-gray-600 bg-gray-100 dark:text-gray-400 dark:bg-gray-900/30';
    case 'running': return 'text-blue-600 bg-blue-100 dark:text-blue-400 dark:bg-blue-900/30';
    case 'completed': return 'text-green-600 bg-green-100 dark:text-green-400 dark:bg-green-900/30';
    case 'failed': return 'text-red-600 bg-red-100 dark:text-red-400 dark:bg-red-900/30';
    case 'cancelled': return 'text-yellow-600 bg-yellow-100 dark:text-yellow-400 dark:bg-yellow-900/30';
    default: return 'text-gray-600 bg-gray-100';
  }
}

/**
 * Get progress percentage for a workflow
 */
export function getWorkflowProgress(workflow: Workflow): number {
  switch (workflow.status) {
    case 'pending': return 0;
    case 'running': return 50; // Could be computed from task progress in the future
    case 'completed': return 100;
    case 'failed': return 100;
    case 'cancelled': return 100;
    default: return 0;
  }
}

/**
 * Format workflow duration
 */
export function formatWorkflowDuration(workflow: Workflow): string | undefined {
  if (!workflow.startedAt) return undefined;

  const start = new Date(workflow.startedAt).getTime();
  const end = workflow.finishedAt
    ? new Date(workflow.finishedAt).getTime()
    : Date.now();

  const durationMs = end - start;

  if (durationMs < 1000) return `${durationMs}ms`;
  if (durationMs < 60000) return `${Math.round(durationMs / 1000)}s`;
  if (durationMs < 3600000) return `${Math.round(durationMs / 60000)}m`;
  return `${Math.round(durationMs / 3600000)}h`;
}

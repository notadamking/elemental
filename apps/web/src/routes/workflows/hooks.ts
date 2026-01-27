/**
 * Hooks for the Workflows page
 * All data fetching and mutation hooks for workflow-related operations
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { WorkflowType, HydratedWorkflow, WorkflowProgress, TaskType } from './types';

/**
 * Fetch workflows with optional status filter
 */
export function useWorkflows(status?: string) {
  return useQuery<WorkflowType[]>({
    queryKey: ['workflows', status],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (status) {
        params.set('status', status);
      }
      const response = await fetch(`/api/workflows?${params.toString()}`);
      if (!response.ok) {
        throw new Error('Failed to fetch workflows');
      }
      return response.json();
    },
  });
}

/**
 * Fetch a single workflow by ID with progress hydration
 */
export function useWorkflow(workflowId: string | null) {
  return useQuery<HydratedWorkflow>({
    queryKey: ['workflows', workflowId],
    queryFn: async () => {
      if (!workflowId) throw new Error('No workflow selected');
      const response = await fetch(`/api/workflows/${workflowId}?hydrate.progress=true`);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to fetch workflow');
      }
      return response.json();
    },
    enabled: !!workflowId,
  });
}

/**
 * Fetch tasks belonging to a workflow
 */
export function useWorkflowTasks(workflowId: string | null) {
  return useQuery<TaskType[]>({
    queryKey: ['workflows', workflowId, 'tasks'],
    queryFn: async () => {
      if (!workflowId) throw new Error('No workflow selected');
      const response = await fetch(`/api/workflows/${workflowId}/tasks`);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to fetch workflow tasks');
      }
      return response.json();
    },
    enabled: !!workflowId,
  });
}

/**
 * Fetch workflow progress metrics
 */
export function useWorkflowProgress(workflowId: string | null) {
  return useQuery<WorkflowProgress>({
    queryKey: ['workflows', workflowId, 'progress'],
    queryFn: async () => {
      if (!workflowId) throw new Error('No workflow selected');
      const response = await fetch(`/api/workflows/${workflowId}/progress`);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to fetch workflow progress');
      }
      return response.json();
    },
    enabled: !!workflowId,
  });
}

/**
 * Update a workflow (title, status, etc.)
 */
export function useUpdateWorkflow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ workflowId, updates }: { workflowId: string; updates: Partial<WorkflowType> }) => {
      const response = await fetch(`/api/workflows/${workflowId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to update workflow');
      }
      return response.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
      queryClient.invalidateQueries({ queryKey: ['workflows', variables.workflowId] });
    },
  });
}

/**
 * Burn (delete) an ephemeral workflow and all its tasks
 */
export function useBurnWorkflow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ workflowId, force = false }: { workflowId: string; force?: boolean }) => {
      const url = force ? `/api/workflows/${workflowId}/burn?force=true` : `/api/workflows/${workflowId}/burn`;
      const response = await fetch(url, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to burn workflow');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
    },
  });
}

/**
 * Squash an ephemeral workflow (make it durable)
 */
export function useSquashWorkflow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ workflowId }: { workflowId: string }) => {
      const response = await fetch(`/api/workflows/${workflowId}/squash`, {
        method: 'POST',
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to squash workflow');
      }
      return response.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
      queryClient.invalidateQueries({ queryKey: ['workflows', variables.workflowId] });
    },
  });
}

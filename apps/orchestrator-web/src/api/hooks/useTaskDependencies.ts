/**
 * React Query hook for task dependencies
 *
 * Provides hook for fetching task dependency information for UI display.
 */

import { useQuery } from '@tanstack/react-query';
import type { TaskStatus, Priority } from '../types';

// ============================================================================
// Types
// ============================================================================

export interface DependencyTask {
  id: string;
  title: string;
  status: TaskStatus;
  priority: Priority;
}

export interface DependencyInfo {
  dependencyType: string;
  task: DependencyTask;
}

export interface DependencyTasksResponse {
  blockedBy: DependencyInfo[];
  blocks: DependencyInfo[];
  progress: {
    resolved: number;
    total: number;
  };
}

// ============================================================================
// API Functions
// ============================================================================

const API_BASE = '/api';

async function fetchApi<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
    throw new Error(error.error?.message || `HTTP ${response.status}`);
  }

  return response.json();
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook to fetch task dependencies (blocked by and blocks)
 */
export function useTaskDependencies(taskId: string | undefined) {
  return useQuery<DependencyTasksResponse, Error>({
    queryKey: ['tasks', taskId, 'dependency-tasks'],
    queryFn: () => fetchApi<DependencyTasksResponse>(`/tasks/${taskId}/dependency-tasks`),
    enabled: !!taskId,
  });
}

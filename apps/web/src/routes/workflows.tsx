/**
 * Workflows Page - Workflow management with pour functionality (TB25, TB48)
 *
 * Features:
 * - List all workflows with status badges
 * - Progress visualization
 * - Workflow detail panel with task list
 * - Pour workflow from playbook modal
 * - Edit workflow title and status (TB48)
 * - Burn/Squash workflow buttons (TB48)
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearch, useNavigate } from '@tanstack/react-router';
import { ElementNotFound } from '../components/shared/ElementNotFound';
import { MobileDetailSheet } from '../components/shared/MobileDetailSheet';
import { MobileWorkflowCard } from '../components/workflow/MobileWorkflowCard';
import { useAllWorkflows } from '../api/hooks/useAllElements';
import { useDeepLink } from '../hooks/useDeepLink';
import { useIsMobile, useGlobalQuickActions } from '../hooks';
import {
  GitBranch,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ChevronRight,
  X,
  ListTodo,
  CircleDot,
  AlertCircle,
  User,
  Play,
  Plus,
  Loader2,
  Pencil,
  Check,
  Flame,
  Archive,
  Ban,
} from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

interface WorkflowType {
  id: string;
  type: 'workflow';
  title: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  playbookId?: string;
  ephemeral: boolean;
  variables: Record<string, unknown>;
  descriptionRef?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  tags: string[];
  startedAt?: string;
  finishedAt?: string;
  failureReason?: string;
  cancelReason?: string;
}

interface WorkflowProgress {
  workflowId: string;
  totalTasks: number;
  statusCounts: Record<string, number>;
  completionPercentage: number;
  readyTasks: number;
  blockedTasks: number;
}

interface HydratedWorkflow extends WorkflowType {
  _progress?: WorkflowProgress;
}

interface TaskType {
  id: string;
  type: 'task';
  title: string;
  status: string;
  priority: number;
  assignee?: string;
  createdAt: string;
  updatedAt: string;
  tags: string[];
}

// ============================================================================
// Status Configuration
// ============================================================================

const STATUS_CONFIG: Record<
  string,
  { label: string; icon: React.ReactNode; color: string; bgColor: string }
> = {
  pending: {
    label: 'Pending',
    icon: <Clock className="w-4 h-4" />,
    color: 'text-gray-600',
    bgColor: 'bg-gray-100',
  },
  running: {
    label: 'Running',
    icon: <Play className="w-4 h-4" />,
    color: 'text-blue-700',
    bgColor: 'bg-blue-100',
  },
  completed: {
    label: 'Completed',
    icon: <CheckCircle2 className="w-4 h-4" />,
    color: 'text-green-700',
    bgColor: 'bg-green-100',
  },
  failed: {
    label: 'Failed',
    icon: <AlertTriangle className="w-4 h-4" />,
    color: 'text-red-700',
    bgColor: 'bg-red-100',
  },
  cancelled: {
    label: 'Cancelled',
    icon: <XCircle className="w-4 h-4" />,
    color: 'text-orange-600',
    bgColor: 'bg-orange-100',
  },
};

// ============================================================================
// API Hooks
// ============================================================================

function useWorkflows(status?: string) {
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

function useWorkflow(workflowId: string | null) {
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

function useWorkflowTasks(workflowId: string | null) {
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

function useWorkflowProgress(workflowId: string | null) {
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

function useUpdateWorkflow() {
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

function useBurnWorkflow() {
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

function useSquashWorkflow() {
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

// ============================================================================
// Helper Functions
// ============================================================================

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(dateString);
}

// ============================================================================
// Components
// ============================================================================

/**
 * Progress Bar component with completion percentage
 */
function ProgressBar({
  progress,
  showLabel = true,
  size = 'md',
}: {
  progress: WorkflowProgress;
  showLabel?: boolean;
  size?: 'sm' | 'md';
}) {
  const { completionPercentage, totalTasks } = progress;
  const height = size === 'sm' ? 'h-1.5' : 'h-2.5';
  const completedCount = progress.statusCounts['closed'] || 0;

  return (
    <div data-testid="workflow-progress-bar" className="flex items-center gap-2">
      <div className={`flex-1 bg-gray-200 rounded-full ${height} overflow-hidden`}>
        <div
          className={`${height} bg-green-500 rounded-full transition-all duration-300`}
          style={{ width: `${completionPercentage}%` }}
          data-testid="workflow-progress-bar-fill"
        />
      </div>
      {showLabel && (
        <span
          data-testid="workflow-progress-label"
          className="text-xs text-gray-500 whitespace-nowrap"
        >
          {completedCount}/{totalTasks} ({Math.round(completionPercentage)}%)
        </span>
      )}
    </div>
  );
}

/**
 * Status Badge component
 */
function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.pending;

  return (
    <span
      data-testid={`workflow-status-badge-${status}`}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${config.bgColor} ${config.color}`}
    >
      {config.icon}
      {config.label}
    </span>
  );
}

/**
 * Workflow List Item component
 */
function WorkflowListItem({
  workflow,
  isSelected,
  onClick,
}: {
  workflow: WorkflowType;
  isSelected: boolean;
  onClick: (id: string) => void;
}) {
  return (
    <div
      data-testid={`workflow-item-${workflow.id}`}
      className={`p-4 rounded-lg border cursor-pointer transition-colors ${
        isSelected
          ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-700'
          : 'bg-white dark:bg-[var(--color-surface)] border-gray-200 dark:border-[var(--color-border)] hover:border-gray-300 dark:hover:border-[var(--color-border-hover)] hover:bg-gray-50 dark:hover:bg-[var(--color-surface-hover)]'
      }`}
      onClick={() => onClick(workflow.id)}
    >
      <div className="flex items-start justify-between mb-2">
        <h3
          data-testid="workflow-item-title"
          className="font-medium text-gray-900 dark:text-[var(--color-text)] truncate flex-1"
        >
          {workflow.title}
        </h3>
        <ChevronRight className="w-4 h-4 text-gray-400 dark:text-gray-500 flex-shrink-0 ml-2" />
      </div>

      <div className="flex items-center gap-2 mb-2">
        <StatusBadge status={workflow.status} />
        {workflow.ephemeral && (
          <span className="text-xs text-gray-600 dark:text-[var(--color-text-secondary)] bg-gray-100 dark:bg-[var(--color-surface-hover)] px-1.5 py-0.5 rounded">
            Ephemeral
          </span>
        )}
        <span className="text-xs text-gray-500 dark:text-[var(--color-text-tertiary)]" title={formatDate(workflow.updatedAt)}>
          Updated {formatRelativeTime(workflow.updatedAt)}
        </span>
      </div>

      {workflow.tags && workflow.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {workflow.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="px-1.5 py-0.5 text-xs bg-gray-100 dark:bg-[var(--color-surface-hover)] text-gray-600 dark:text-[var(--color-text-secondary)] rounded"
            >
              {tag}
            </span>
          ))}
          {workflow.tags.length > 3 && (
            <span className="text-xs text-gray-400 dark:text-[var(--color-text-tertiary)]">+{workflow.tags.length - 3}</span>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Status Filter Tabs
 */
function StatusFilter({
  selectedStatus,
  onStatusChange,
}: {
  selectedStatus: string | null;
  onStatusChange: (status: string | null) => void;
}) {
  const statuses = [
    { value: null, label: 'All' },
    { value: 'running', label: 'Running' },
    { value: 'pending', label: 'Pending' },
    { value: 'completed', label: 'Completed' },
    { value: 'failed', label: 'Failed' },
    { value: 'cancelled', label: 'Cancelled' },
  ];

  return (
    <div data-testid="workflow-status-filter" className="flex gap-1 p-1 bg-gray-100 rounded-lg">
      {statuses.map((status) => (
        <button
          key={status.value ?? 'all'}
          data-testid={`workflow-status-filter-${status.value ?? 'all'}`}
          onClick={() => onStatusChange(status.value)}
          className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
            selectedStatus === status.value
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          {status.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Task Status Summary
 */
function TaskStatusSummary({ progress }: { progress: WorkflowProgress }) {
  const items = [
    {
      label: 'Completed',
      count: progress.statusCounts['closed'] || 0,
      icon: <CheckCircle2 className="w-4 h-4 text-green-500" />,
    },
    {
      label: 'In Progress',
      count: progress.statusCounts['in_progress'] || 0,
      icon: <CircleDot className="w-4 h-4 text-blue-500" />,
    },
    {
      label: 'Blocked',
      count: progress.blockedTasks,
      icon: <AlertCircle className="w-4 h-4 text-red-500" />,
    },
    {
      label: 'Ready',
      count: progress.readyTasks,
      icon: <ListTodo className="w-4 h-4 text-gray-400" />,
    },
  ];

  return (
    <div data-testid="workflow-task-status-summary" className="grid grid-cols-2 gap-3">
      {items.map((item) => (
        <div
          key={item.label}
          className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg"
        >
          {item.icon}
          <div>
            <div className="text-lg font-semibold text-gray-900">{item.count}</div>
            <div className="text-xs text-gray-500">{item.label}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Workflow Task List
 */
function WorkflowTaskList({ tasks }: { tasks: TaskType[] }) {
  if (tasks.length === 0) {
    return (
      <div
        data-testid="workflow-tasks-empty"
        className="text-center py-8 text-gray-500"
      >
        <AlertCircle className="w-8 h-8 mx-auto mb-2 text-gray-400" />
        <p className="text-sm font-medium">No tasks in this workflow</p>
        <p className="text-xs text-gray-400 mt-1">
          Workflows need tasks to be useful. This state should not occur
          as workflows require at least one task to be created.
        </p>
      </div>
    );
  }

  const priorityColors: Record<number, string> = {
    1: 'bg-gray-200',
    2: 'bg-blue-200',
    3: 'bg-yellow-200',
    4: 'bg-orange-200',
    5: 'bg-red-200',
  };

  return (
    <div data-testid="workflow-tasks-list" className="space-y-2">
      {tasks.map((task) => (
        <div
          key={task.id}
          data-testid={`workflow-task-${task.id}`}
          className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg"
        >
          <div
            className={`w-2 h-2 rounded-full ${priorityColors[task.priority] || 'bg-gray-200'}`}
            title={`Priority ${task.priority}`}
          />
          <a
            href={`/tasks?selected=${task.id}`}
            className="flex-1 text-sm text-gray-900 truncate hover:text-blue-600 hover:underline"
          >
            {task.title}
          </a>
          <span
            className={`text-xs px-2 py-0.5 rounded ${
              task.status === 'closed'
                ? 'bg-green-100 text-green-700'
                : task.status === 'blocked'
                  ? 'bg-red-100 text-red-700'
                  : task.status === 'in_progress'
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-gray-100 text-gray-700'
            }`}
          >
            {task.status.replace('_', ' ')}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * Workflow Detail Panel with edit functionality (TB48)
 */
function WorkflowDetailPanel({
  workflowId,
  onClose,
}: {
  workflowId: string;
  onClose: () => void;
}) {
  const { data: workflow, isLoading, isError, error } = useWorkflow(workflowId);
  const { data: tasks = [] } = useWorkflowTasks(workflowId);
  const { data: progress } = useWorkflowProgress(workflowId);

  // Edit mode state
  const [isEditMode, setIsEditMode] = useState(false);
  const [editedTitle, setEditedTitle] = useState('');
  const [showBurnConfirm, setShowBurnConfirm] = useState(false);

  // Mutations
  const updateWorkflow = useUpdateWorkflow();
  const burnWorkflow = useBurnWorkflow();
  const squashWorkflow = useSquashWorkflow();

  // Initialize edited title when workflow loads
  useEffect(() => {
    if (workflow) {
      setEditedTitle(workflow.title);
    }
  }, [workflow]);

  // Exit edit mode when workflow changes
  useEffect(() => {
    setIsEditMode(false);
    setShowBurnConfirm(false);
  }, [workflowId]);

  const handleSaveTitle = useCallback(async () => {
    if (!workflow || editedTitle.trim() === workflow.title) {
      setIsEditMode(false);
      return;
    }
    try {
      await updateWorkflow.mutateAsync({ workflowId, updates: { title: editedTitle.trim() } });
      setIsEditMode(false);
    } catch (err) {
      console.error('Failed to update title:', err);
    }
  }, [workflow, editedTitle, workflowId, updateWorkflow]);

  const handleCancelEdit = useCallback(() => {
    if (workflow) {
      setEditedTitle(workflow.title);
    }
    setIsEditMode(false);
  }, [workflow]);

  const handleStatusChange = useCallback(async (newStatus: string) => {
    if (!workflow || newStatus === workflow.status) return;
    try {
      await updateWorkflow.mutateAsync({
        workflowId,
        updates: { status: newStatus as WorkflowType['status'] },
      });
    } catch (err) {
      console.error('Failed to update status:', err);
    }
  }, [workflow, workflowId, updateWorkflow]);

  const handleBurn = useCallback(async () => {
    try {
      await burnWorkflow.mutateAsync({ workflowId });
      onClose();
    } catch (err) {
      console.error('Failed to burn workflow:', err);
    }
  }, [workflowId, burnWorkflow, onClose]);

  const handleSquash = useCallback(async () => {
    try {
      await squashWorkflow.mutateAsync({ workflowId });
    } catch (err) {
      console.error('Failed to squash workflow:', err);
    }
  }, [workflowId, squashWorkflow]);

  if (isLoading) {
    return (
      <div
        data-testid="workflow-detail-loading"
        className="h-full flex items-center justify-center bg-white"
      >
        <div className="text-gray-500">Loading workflow...</div>
      </div>
    );
  }

  if (isError) {
    return (
      <div
        data-testid="workflow-detail-error"
        className="h-full flex flex-col items-center justify-center bg-white"
      >
        <div className="text-red-600 mb-2">Failed to load workflow</div>
        <div className="text-sm text-gray-500">{(error as Error)?.message}</div>
      </div>
    );
  }

  if (!workflow) {
    return (
      <div
        data-testid="workflow-detail-not-found"
        className="h-full flex items-center justify-center bg-white"
      >
        <div className="text-gray-500">Workflow not found</div>
      </div>
    );
  }

  // Determine available status transitions
  const getStatusTransitions = () => {
    switch (workflow.status) {
      case 'pending':
        return [
          { status: 'running', label: 'Start', icon: Play, color: 'bg-blue-500 hover:bg-blue-600' },
          { status: 'cancelled', label: 'Cancel', icon: Ban, color: 'bg-orange-500 hover:bg-orange-600' },
        ];
      case 'running':
        return [
          { status: 'completed', label: 'Complete', icon: CheckCircle2, color: 'bg-green-500 hover:bg-green-600' },
          { status: 'failed', label: 'Mark Failed', icon: AlertTriangle, color: 'bg-red-500 hover:bg-red-600' },
          { status: 'cancelled', label: 'Cancel', icon: Ban, color: 'bg-orange-500 hover:bg-orange-600' },
        ];
      case 'completed':
      case 'failed':
      case 'cancelled':
        return [{ status: 'pending', label: 'Reset to Pending', icon: Clock, color: 'bg-gray-500 hover:bg-gray-600' }];
      default:
        return [];
    }
  };

  const statusTransitions = getStatusTransitions();

  return (
    <div
      data-testid="workflow-detail-panel"
      className="h-full flex flex-col bg-white border-l border-gray-200"
    >
      {/* Header */}
      <div className="flex items-start justify-between p-4 border-b border-gray-200">
        <div className="flex-1 min-w-0">
          {/* Status badge */}
          <div className="mb-2 flex items-center gap-2">
            <StatusBadge status={workflow.status} />
            {workflow.ephemeral && (
              <span
                data-testid="ephemeral-badge"
                className="text-xs text-gray-600 bg-gray-100 px-1.5 py-0.5 rounded"
              >
                Ephemeral
              </span>
            )}
          </div>

          {/* Title - editable */}
          {isEditMode ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                data-testid="workflow-title-input"
                value={editedTitle}
                onChange={(e) => setEditedTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveTitle();
                  if (e.key === 'Escape') handleCancelEdit();
                }}
                className="flex-1 text-lg font-semibold text-gray-900 border border-blue-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
              <button
                data-testid="save-title-btn"
                onClick={handleSaveTitle}
                disabled={updateWorkflow.isPending}
                className="p-1 text-green-600 hover:bg-green-50 rounded"
                title="Save"
              >
                <Check className="w-5 h-5" />
              </button>
              <button
                data-testid="cancel-edit-btn"
                onClick={handleCancelEdit}
                className="p-1 text-gray-400 hover:bg-gray-100 rounded"
                title="Cancel"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 group">
              <h2
                data-testid="workflow-detail-title"
                className="text-lg font-semibold text-gray-900"
              >
                {workflow.title}
              </h2>
              <button
                data-testid="edit-title-btn"
                onClick={() => setIsEditMode(true)}
                className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                title="Edit title"
              >
                <Pencil className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* ID */}
          <div className="mt-1 text-xs text-gray-500 font-mono">
            <span data-testid="workflow-detail-id">{workflow.id}</span>
          </div>
        </div>

        <button
          onClick={onClose}
          className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
          aria-label="Close panel"
          data-testid="workflow-detail-close"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Status Actions */}
      {statusTransitions.length > 0 && (
        <div className="flex flex-wrap gap-2 p-4 border-b border-gray-200 bg-gray-50">
          {statusTransitions.map((transition) => {
            const Icon = transition.icon;
            return (
              <button
                key={transition.status}
                data-testid={`status-action-${transition.status}`}
                onClick={() => handleStatusChange(transition.status)}
                disabled={updateWorkflow.isPending}
                className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white rounded ${transition.color} disabled:opacity-50`}
              >
                <Icon className="w-4 h-4" />
                {transition.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Ephemeral Workflow Actions */}
      {workflow.ephemeral && (
        <div className="flex gap-2 p-4 border-b border-gray-200 bg-yellow-50">
          {showBurnConfirm ? (
            <div className="flex-1 flex items-center gap-2">
              <span className="text-sm text-red-600 font-medium">
                Delete this workflow and all its tasks?
              </span>
              <button
                data-testid="burn-confirm-btn"
                onClick={handleBurn}
                disabled={burnWorkflow.isPending}
                className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded disabled:opacity-50"
              >
                {burnWorkflow.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Flame className="w-4 h-4" />
                )}
                Confirm Burn
              </button>
              <button
                data-testid="burn-cancel-btn"
                onClick={() => setShowBurnConfirm(false)}
                className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded"
              >
                Cancel
              </button>
            </div>
          ) : (
            <>
              <button
                data-testid="squash-btn"
                onClick={handleSquash}
                disabled={squashWorkflow.isPending}
                className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 rounded disabled:opacity-50"
              >
                {squashWorkflow.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Archive className="w-4 h-4" />
                )}
                Squash (Make Durable)
              </button>
              <button
                data-testid="burn-btn"
                onClick={() => setShowBurnConfirm(true)}
                className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-red-600 border border-red-300 hover:bg-red-50 rounded"
              >
                <Flame className="w-4 h-4" />
                Burn
              </button>
            </>
          )}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Progress Section */}
        {progress && (
          <div className="mb-6">
            <div className="text-sm font-medium text-gray-700 mb-2">Progress</div>
            <ProgressBar progress={progress} />
            <div className="mt-4">
              <TaskStatusSummary progress={progress} />
            </div>
          </div>
        )}

        {/* Tasks Section */}
        <div className="mb-6">
          <div className="text-sm font-medium text-gray-700 mb-2">
            Tasks ({tasks.length})
          </div>
          {/* TB122: Warning when workflow has only one task */}
          {tasks.length === 1 && (
            <div
              data-testid="last-task-warning"
              className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-lg"
            >
              <div className="flex items-center gap-2 text-amber-700">
                <AlertTriangle className="w-4 h-4" />
                <span className="text-sm font-medium">Only one task remaining</span>
              </div>
              <p className="mt-1 text-xs text-amber-600">
                Workflows must have at least one task. This task cannot be deleted.
                Use &apos;Burn&apos; to delete the entire workflow if needed.
              </p>
            </div>
          )}
          <WorkflowTaskList tasks={tasks} />
        </div>

        {/* Metadata */}
        <div className="pt-4 border-t border-gray-100">
          <div className="grid grid-cols-2 gap-4 text-xs text-gray-500">
            <div>
              <div className="flex items-center gap-1 mb-1">
                <Clock className="w-3 h-3" />
                <span className="font-medium">Created:</span>
              </div>
              <span title={formatDate(workflow.createdAt)}>
                {formatRelativeTime(workflow.createdAt)}
              </span>
            </div>
            <div>
              <div className="flex items-center gap-1 mb-1">
                <Clock className="w-3 h-3" />
                <span className="font-medium">Updated:</span>
              </div>
              <span title={formatDate(workflow.updatedAt)}>
                {formatRelativeTime(workflow.updatedAt)}
              </span>
            </div>
            <div className="col-span-2">
              <div className="flex items-center gap-1 mb-1">
                <User className="w-3 h-3" />
                <span className="font-medium">Created by:</span>
              </div>
              <span className="font-mono">{workflow.createdBy}</span>
            </div>
            {workflow.startedAt && (
              <div className="col-span-2">
                <div className="flex items-center gap-1 mb-1">
                  <Play className="w-3 h-3 text-blue-500" />
                  <span className="font-medium">Started:</span>
                </div>
                <span>{formatDate(workflow.startedAt)}</span>
              </div>
            )}
            {workflow.finishedAt && (
              <div className="col-span-2">
                <div className="flex items-center gap-1 mb-1">
                  <CheckCircle2 className="w-3 h-3 text-green-500" />
                  <span className="font-medium">Finished:</span>
                </div>
                <span>{formatDate(workflow.finishedAt)}</span>
              </div>
            )}
            {workflow.failureReason && (
              <div className="col-span-2">
                <div className="flex items-center gap-1 mb-1">
                  <AlertTriangle className="w-3 h-3 text-red-500" />
                  <span className="font-medium">Failure reason:</span>
                </div>
                <p className="text-red-600">{workflow.failureReason}</p>
              </div>
            )}
            {workflow.cancelReason && (
              <div className="col-span-2">
                <div className="flex items-center gap-1 mb-1">
                  <XCircle className="w-3 h-3 text-orange-500" />
                  <span className="font-medium">Cancel reason:</span>
                </div>
                <p className="text-orange-600">{workflow.cancelReason}</p>
              </div>
            )}
          </div>

          {/* Tags */}
          {workflow.tags && workflow.tags.length > 0 && (
            <div className="mt-4">
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                Tags
              </div>
              <div className="flex flex-wrap gap-1">
                {workflow.tags.map((tag) => (
                  <span
                    key={tag}
                    data-testid={`workflow-tag-${tag}`}
                    className="px-2 py-0.5 text-xs bg-gray-100 text-gray-700 rounded"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Variables */}
          {workflow.variables && Object.keys(workflow.variables).length > 0 && (
            <div className="mt-4">
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                Variables
              </div>
              <div className="bg-gray-50 rounded p-2 text-xs font-mono">
                {Object.entries(workflow.variables).map(([key, value]) => (
                  <div key={key} className="flex gap-2">
                    <span className="text-gray-500">{key}:</span>
                    <span className="text-gray-900">{JSON.stringify(value)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Main Workflows Page Component (TB148 - responsive)
 */
export function WorkflowsPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: '/workflows' });
  const isMobile = useIsMobile();

  const [selectedStatus, setSelectedStatus] = useState<string | null>(search.status ?? null);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(search.selected ?? null);

  // Global quick actions for C W shortcut
  const { openPourWorkflowModal } = useGlobalQuickActions();

  // Use upfront-loaded data (TB67)
  const { data: allWorkflows, isLoading: isWorkflowsLoading } = useAllWorkflows();

  // Also keep the server-side query (fallback)
  const { data: serverWorkflows = [], isLoading: isServerLoading, error } = useWorkflows(selectedStatus ?? undefined);

  // Use preloaded data if available
  const workflows = useMemo(() => {
    if (allWorkflows && allWorkflows.length > 0) {
      // Cast to HydratedWorkflow (preloaded data may have optional properties)
      const workflowsTyped = allWorkflows as unknown as HydratedWorkflow[];
      if (selectedStatus) {
        return workflowsTyped.filter(w => w.status === selectedStatus);
      }
      return workflowsTyped;
    }
    return serverWorkflows;
  }, [allWorkflows, serverWorkflows, selectedStatus]);

  const isLoading = isWorkflowsLoading || isServerLoading;

  // Deep-link navigation (TB70)
  const deepLink = useDeepLink({
    data: allWorkflows as HydratedWorkflow[] | undefined,
    selectedId: search.selected,
    currentPage: 1,
    pageSize: 1000, // Workflows don't have pagination
    getId: (workflow) => workflow.id,
    routePath: '/workflows',
    rowTestIdPrefix: 'workflow-item-',
    autoNavigate: false,
    highlightDelay: 200,
  });

  // Sync with URL on mount
  useEffect(() => {
    if (search.selected && search.selected !== selectedWorkflowId) {
      setSelectedWorkflowId(search.selected);
    }
    if (search.status && search.status !== selectedStatus) {
      setSelectedStatus(search.status);
    }
  }, [search.selected, search.status]);

  const handleWorkflowClick = (workflowId: string) => {
    setSelectedWorkflowId(workflowId);
    navigate({ to: '/workflows', search: { selected: workflowId, status: selectedStatus ?? undefined } });
  };

  const handleCloseDetail = () => {
    setSelectedWorkflowId(null);
    navigate({ to: '/workflows', search: { selected: undefined, status: selectedStatus ?? undefined } });
  };

  const handleStatusFilterChange = (status: string | null) => {
    setSelectedStatus(status);
    navigate({ to: '/workflows', search: { selected: selectedWorkflowId ?? undefined, status: status ?? undefined } });
  };

  return (
    <div data-testid="workflows-page" className="h-full flex flex-col">
      {/* Header - Responsive layout (TB148) */}
      <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
        {/* Mobile header */}
        {isMobile ? (
          <div className="p-3 space-y-3">
            {/* Status filter - scrollable on mobile */}
            <div className="overflow-x-auto -mx-3 px-3 scrollbar-hide">
              <StatusFilter
                selectedStatus={selectedStatus}
                onStatusChange={handleStatusFilterChange}
              />
            </div>
          </div>
        ) : (
          /* Desktop header */
          <div className="p-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <GitBranch className="w-6 h-6 text-purple-500" />
                <h1 className="text-xl font-semibold text-[var(--color-text)]">Workflows</h1>
                {workflows.length > 0 && (
                  <span
                    data-testid="workflows-count"
                    className="text-sm text-[var(--color-text-secondary)]"
                  >
                    ({workflows.length})
                  </span>
                )}
              </div>
              <button
                onClick={openPourWorkflowModal}
                data-testid="pour-workflow-button"
                className="flex items-center gap-2 px-3 py-1.5 bg-purple-600 text-white rounded-md hover:bg-purple-700 text-sm font-medium"
              >
                <Plus className="w-4 h-4" />
                Pour Workflow
                <kbd className="ml-1 text-xs bg-purple-800/50 text-white px-1 py-0.5 rounded">C W</kbd>
              </button>
            </div>

            <StatusFilter
              selectedStatus={selectedStatus}
              onStatusChange={handleStatusFilterChange}
            />
          </div>
        )}
      </div>

      {/* Content - Responsive layout (TB148) */}
      <div className={`flex-1 flex overflow-hidden ${selectedWorkflowId && isMobile ? 'hidden' : ''}`}>
        {/* Workflow List */}
        <div className={`flex-1 overflow-y-auto bg-[var(--color-bg)] ${isMobile ? '' : 'p-4'}`} tabIndex={0} role="region" aria-label="Workflow list">
          {isLoading && (
            <div
              data-testid="workflows-loading"
              className="text-center py-12 text-[var(--color-text-secondary)]"
            >
              Loading workflows...
            </div>
          )}

          {error && (
            <div
              data-testid="workflows-error"
              className="text-center py-12 text-red-500"
            >
              Failed to load workflows
            </div>
          )}

          {!isLoading && !error && workflows.length === 0 && (
            <div
              data-testid="workflows-empty"
              className="text-center py-12"
            >
              <GitBranch className="w-12 h-12 text-[var(--color-border)] mx-auto mb-3" />
              <p className="text-[var(--color-text-secondary)]">No workflows found</p>
              <p className="text-sm text-[var(--color-text-muted)] mt-1">
                {selectedStatus
                  ? `No ${selectedStatus} workflows available`
                  : 'Pour your first workflow from a playbook'}
              </p>
            </div>
          )}

          {/* Mobile List View with Cards (TB148) */}
          {!isLoading && !error && workflows.length > 0 && isMobile && (
            <div data-testid="mobile-workflows-list">
              {workflows.map((workflow) => (
                <MobileWorkflowCard
                  key={workflow.id}
                  workflow={workflow}
                  isSelected={selectedWorkflowId === workflow.id}
                  onClick={() => handleWorkflowClick(workflow.id)}
                />
              ))}
            </div>
          )}

          {/* Desktop List View */}
          {!isLoading && !error && workflows.length > 0 && !isMobile && (
            <div data-testid="workflows-list" className="space-y-3">
              {workflows.map((workflow) => (
                <WorkflowListItem
                  key={workflow.id}
                  workflow={workflow}
                  isSelected={selectedWorkflowId === workflow.id}
                  onClick={handleWorkflowClick}
                />
              ))}
            </div>
          )}
        </div>

        {/* Workflow Detail Panel - Desktop (side panel) */}
        {selectedWorkflowId && !isMobile && (
          <div className="w-96 flex-shrink-0 border-l border-[var(--color-border)]" data-testid="workflow-detail-container">
            {deepLink.notFound ? (
              <ElementNotFound
                elementType="Workflow"
                elementId={selectedWorkflowId}
                backRoute="/workflows"
                backLabel="Back to Workflows"
                onDismiss={handleCloseDetail}
              />
            ) : (
              <WorkflowDetailPanel
                workflowId={selectedWorkflowId}
                onClose={handleCloseDetail}
              />
            )}
          </div>
        )}
      </div>

      {/* Workflow Detail Panel - Mobile (full-screen sheet) (TB148) */}
      {selectedWorkflowId && isMobile && (
        <MobileDetailSheet
          open={!!selectedWorkflowId}
          onClose={handleCloseDetail}
          title="Workflow Details"
          data-testid="mobile-workflow-detail-sheet"
        >
          {deepLink.notFound ? (
            <ElementNotFound
              elementType="Workflow"
              elementId={selectedWorkflowId}
              backRoute="/workflows"
              backLabel="Back to Workflows"
              onDismiss={handleCloseDetail}
            />
          ) : (
            <WorkflowDetailPanel
              workflowId={selectedWorkflowId}
              onClose={handleCloseDetail}
            />
          )}
        </MobileDetailSheet>
      )}

      {/* Mobile Floating Action Button for Pour Workflow (TB148) */}
      {isMobile && !selectedWorkflowId && (
        <button
          onClick={openPourWorkflowModal}
          className="fixed bottom-6 right-6 w-14 h-14 flex items-center justify-center bg-purple-600 hover:bg-purple-700 text-white rounded-full shadow-lg z-40 touch-target"
          aria-label="Pour new workflow"
          data-testid="mobile-pour-workflow-fab"
        >
          <Plus className="w-6 h-6" />
        </button>
      )}
    </div>
  );
}

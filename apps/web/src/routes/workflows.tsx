/**
 * Workflows Page - Workflow management with pour functionality (TB25)
 *
 * Features:
 * - List all workflows with status badges
 * - Progress visualization
 * - Workflow detail panel with task list
 * - Pour workflow from playbook modal
 */

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
  FileText,
  ChevronDown,
  Book,
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

interface DiscoveredPlaybook {
  name: string;
  path: string;
  directory: string;
}

interface PlaybookVariable {
  name: string;
  description?: string;
  type: 'string' | 'number' | 'boolean';
  required: boolean;
  default?: unknown;
  enum?: unknown[];
}

interface PlaybookStep {
  id: string;
  title: string;
  description?: string;
  priority?: number;
  complexity?: number;
  dependsOn?: string[];
}

interface PlaybookDetail {
  id: string;
  name: string;
  title: string;
  version: number;
  steps: PlaybookStep[];
  variables: PlaybookVariable[];
  filePath: string;
  directory: string;
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
    color: 'text-blue-600',
    bgColor: 'bg-blue-100',
  },
  completed: {
    label: 'Completed',
    icon: <CheckCircle2 className="w-4 h-4" />,
    color: 'text-green-600',
    bgColor: 'bg-green-100',
  },
  failed: {
    label: 'Failed',
    icon: <AlertTriangle className="w-4 h-4" />,
    color: 'text-red-600',
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

function usePourWorkflow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      playbook: {
        name: string;
        version: string;
        steps: Array<{
          id: string;
          title: string;
          taskType?: string;
          priority?: number;
          complexity?: number;
        }>;
        variables?: Array<{
          name: string;
          type: string;
          default?: unknown;
        }>;
      };
      variables?: Record<string, unknown>;
      createdBy: string;
      title?: string;
      ephemeral?: boolean;
      tags?: string[];
    }) => {
      const response = await fetch('/api/workflows/pour', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to pour workflow');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
    },
  });
}

function usePlaybooks() {
  return useQuery<DiscoveredPlaybook[]>({
    queryKey: ['playbooks'],
    queryFn: async () => {
      const response = await fetch('/api/playbooks');
      if (!response.ok) {
        throw new Error('Failed to fetch playbooks');
      }
      return response.json();
    },
  });
}

function usePlaybook(name: string | null) {
  return useQuery<PlaybookDetail>({
    queryKey: ['playbooks', name],
    queryFn: async () => {
      if (!name) throw new Error('No playbook selected');
      const response = await fetch(`/api/playbooks/${encodeURIComponent(name)}`);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to fetch playbook');
      }
      return response.json();
    },
    enabled: !!name,
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
          ? 'bg-blue-50 border-blue-200'
          : 'bg-white border-gray-200 hover:border-gray-300 hover:bg-gray-50'
      }`}
      onClick={() => onClick(workflow.id)}
    >
      <div className="flex items-start justify-between mb-2">
        <h3
          data-testid="workflow-item-title"
          className="font-medium text-gray-900 truncate flex-1"
        >
          {workflow.title}
        </h3>
        <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0 ml-2" />
      </div>

      <div className="flex items-center gap-2 mb-2">
        <StatusBadge status={workflow.status} />
        {workflow.ephemeral && (
          <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
            Ephemeral
          </span>
        )}
        <span className="text-xs text-gray-500" title={formatDate(workflow.updatedAt)}>
          Updated {formatRelativeTime(workflow.updatedAt)}
        </span>
      </div>

      {workflow.tags && workflow.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {workflow.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="px-1.5 py-0.5 text-xs bg-gray-100 text-gray-600 rounded"
            >
              {tag}
            </span>
          ))}
          {workflow.tags.length > 3 && (
            <span className="text-xs text-gray-400">+{workflow.tags.length - 3}</span>
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
        className="text-center py-8 text-gray-500 text-sm"
      >
        No tasks in this workflow
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
          <span className="flex-1 text-sm text-gray-900 truncate">{task.title}</span>
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
 * Workflow Detail Panel
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
              <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                Ephemeral
              </span>
            )}
          </div>

          {/* Title */}
          <h2
            data-testid="workflow-detail-title"
            className="text-lg font-semibold text-gray-900"
          >
            {workflow.title}
          </h2>

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
 * Playbook Picker Component - Shows available playbooks to choose from
 */
function PlaybookPicker({
  selectedPlaybook,
  onSelect,
}: {
  selectedPlaybook: string | null;
  onSelect: (name: string) => void;
}) {
  const { data: playbooks = [], isLoading, isError } = usePlaybooks();
  const [isOpen, setIsOpen] = useState(false);

  if (isLoading) {
    return (
      <div
        data-testid="playbook-picker-loading"
        className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-gray-500 flex items-center gap-2"
      >
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading playbooks...
      </div>
    );
  }

  if (isError || playbooks.length === 0) {
    return (
      <div
        data-testid="playbook-picker-empty"
        className="w-full px-3 py-2 border border-dashed border-gray-300 rounded-md bg-gray-50 text-gray-500 text-center"
      >
        <Book className="w-5 h-5 mx-auto mb-1 text-gray-400" />
        <p className="text-sm">No playbooks found</p>
        <p className="text-xs">Add .playbook.yaml files to .elemental/playbooks</p>
      </div>
    );
  }

  return (
    <div className="relative" data-testid="playbook-picker">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        data-testid="playbook-picker-trigger"
        className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-left flex items-center justify-between hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {selectedPlaybook ? (
          <span className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-purple-500" />
            <span className="text-gray-900">{selectedPlaybook}</span>
          </span>
        ) : (
          <span className="text-gray-400">Select a playbook...</span>
        )}
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div
          data-testid="playbook-picker-dropdown"
          className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-y-auto"
        >
          {playbooks.map((playbook) => (
            <button
              key={playbook.name}
              type="button"
              onClick={() => {
                onSelect(playbook.name);
                setIsOpen(false);
              }}
              data-testid={`playbook-option-${playbook.name}`}
              className={`w-full px-3 py-2 text-left hover:bg-gray-50 flex items-center gap-2 ${
                selectedPlaybook === playbook.name ? 'bg-purple-50' : ''
              }`}
            >
              <FileText className={`w-4 h-4 ${selectedPlaybook === playbook.name ? 'text-purple-500' : 'text-gray-400'}`} />
              <span className={selectedPlaybook === playbook.name ? 'text-purple-700 font-medium' : 'text-gray-700'}>
                {playbook.name}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Variable Input Form - Renders inputs for playbook variables
 */
function VariableInputForm({
  variables,
  values,
  onChange,
}: {
  variables: PlaybookVariable[];
  values: Record<string, unknown>;
  onChange: (name: string, value: unknown) => void;
}) {
  if (variables.length === 0) {
    return null;
  }

  return (
    <div data-testid="variable-input-form" className="space-y-3">
      <div className="text-sm font-medium text-gray-700">Variables</div>
      {variables.map((variable) => (
        <div key={variable.name}>
          <label className="block text-sm text-gray-600 mb-1">
            {variable.name}
            {variable.required && <span className="text-red-500 ml-1">*</span>}
          </label>
          {variable.description && (
            <p className="text-xs text-gray-400 mb-1">{variable.description}</p>
          )}
          {variable.type === 'boolean' ? (
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={Boolean(values[variable.name] ?? variable.default ?? false)}
                onChange={(e) => onChange(variable.name, e.target.checked)}
                data-testid={`variable-input-${variable.name}`}
                className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
              />
              <span className="text-sm text-gray-700">Enable</span>
            </label>
          ) : variable.enum && variable.enum.length > 0 ? (
            <select
              value={String(values[variable.name] ?? variable.default ?? '')}
              onChange={(e) => onChange(variable.name, variable.type === 'number' ? Number(e.target.value) : e.target.value)}
              data-testid={`variable-input-${variable.name}`}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <option value="">Select...</option>
              {variable.enum.map((opt) => (
                <option key={String(opt)} value={String(opt)}>
                  {String(opt)}
                </option>
              ))}
            </select>
          ) : (
            <input
              type={variable.type === 'number' ? 'number' : 'text'}
              value={String(values[variable.name] ?? variable.default ?? '')}
              onChange={(e) => onChange(variable.name, variable.type === 'number' ? Number(e.target.value) : e.target.value)}
              data-testid={`variable-input-${variable.name}`}
              placeholder={variable.default ? `Default: ${variable.default}` : ''}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * Pour Workflow Modal
 */
function PourWorkflowModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const pourWorkflow = usePourWorkflow();
  const [title, setTitle] = useState('');
  const [selectedPlaybookName, setSelectedPlaybookName] = useState<string | null>(null);
  const [variables, setVariables] = useState<Record<string, unknown>>({});
  const [useQuickMode, setUseQuickMode] = useState(true);
  const [quickPlaybookName, setQuickPlaybookName] = useState('');

  const { data: selectedPlaybook, isLoading: isLoadingPlaybook } = usePlaybook(selectedPlaybookName);

  // Reset variables when playbook changes
  useEffect(() => {
    if (selectedPlaybook) {
      const defaults: Record<string, unknown> = {};
      for (const v of selectedPlaybook.variables) {
        if (v.default !== undefined) {
          defaults[v.name] = v.default;
        }
      }
      setVariables(defaults);
    } else {
      setVariables({});
    }
  }, [selectedPlaybook]);

  if (!isOpen) return null;

  const handleVariableChange = (name: string, value: unknown) => {
    setVariables((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    let playbook;

    if (useQuickMode || !selectedPlaybook) {
      // Create a simple playbook for quick mode
      playbook = {
        name: quickPlaybookName || 'Quick Workflow',
        version: '1.0.0',
        variables: [],
        steps: [
          { id: 'step-1', title: 'Step 1', priority: 3 },
          { id: 'step-2', title: 'Step 2', priority: 3 },
          { id: 'step-3', title: 'Step 3', priority: 3 },
        ],
      };
    } else {
      // Use the selected playbook
      playbook = {
        name: selectedPlaybook.name,
        version: String(selectedPlaybook.version),
        variables: selectedPlaybook.variables,
        steps: selectedPlaybook.steps,
      };
    }

    try {
      await pourWorkflow.mutateAsync({
        playbook,
        variables: useQuickMode ? undefined : variables,
        createdBy: 'web-user',
        title: title || playbook.name || 'New Workflow',
      });
      onClose();
      setTitle('');
      setSelectedPlaybookName(null);
      setQuickPlaybookName('');
      setVariables({});
    } catch {
      // Error handled by mutation
    }
  };

  return (
    <div
      data-testid="pour-workflow-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">Pour New Workflow</h2>
          <button
            onClick={onClose}
            data-testid="pour-modal-close"
            className="p-1 text-gray-400 hover:text-gray-600 rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 overflow-y-auto flex-1">
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Workflow Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              data-testid="pour-title-input"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
              placeholder="My Workflow"
            />
          </div>

          {/* Mode Toggle */}
          <div className="mb-4">
            <div className="flex gap-2 p-1 bg-gray-100 rounded-lg">
              <button
                type="button"
                onClick={() => setUseQuickMode(true)}
                data-testid="mode-quick"
                className={`flex-1 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  useQuickMode ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Quick Create
              </button>
              <button
                type="button"
                onClick={() => setUseQuickMode(false)}
                data-testid="mode-playbook"
                className={`flex-1 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  !useQuickMode ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                From Playbook
              </button>
            </div>
          </div>

          {useQuickMode ? (
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Playbook Name
              </label>
              <input
                type="text"
                value={quickPlaybookName}
                onChange={(e) => setQuickPlaybookName(e.target.value)}
                data-testid="pour-playbook-input"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                placeholder="Quick Setup"
              />
              <p className="mt-1 text-xs text-gray-500">
                A simple 3-step workflow will be created with this name
              </p>
            </div>
          ) : (
            <>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Select Playbook
                </label>
                <PlaybookPicker
                  selectedPlaybook={selectedPlaybookName}
                  onSelect={setSelectedPlaybookName}
                />
              </div>

              {selectedPlaybookName && isLoadingPlaybook && (
                <div className="mb-4 flex items-center gap-2 text-gray-500 text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading playbook details...
                </div>
              )}

              {selectedPlaybook && (
                <>
                  {/* Playbook Info */}
                  <div
                    data-testid="playbook-info"
                    className="mb-4 p-3 bg-purple-50 rounded-lg border border-purple-100"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <Book className="w-4 h-4 text-purple-500" />
                      <span className="font-medium text-purple-900">{selectedPlaybook.title}</span>
                    </div>
                    <div className="text-xs text-purple-700">
                      {selectedPlaybook.steps.length} steps • Version {selectedPlaybook.version}
                    </div>
                  </div>

                  {/* Variable Inputs */}
                  {selectedPlaybook.variables.length > 0 && (
                    <div className="mb-4">
                      <VariableInputForm
                        variables={selectedPlaybook.variables}
                        values={variables}
                        onChange={handleVariableChange}
                      />
                    </div>
                  )}

                  {/* Steps Preview */}
                  <div className="mb-4">
                    <div className="text-sm font-medium text-gray-700 mb-2">
                      Steps ({selectedPlaybook.steps.length})
                    </div>
                    <div
                      data-testid="playbook-steps-preview"
                      className="space-y-1 max-h-32 overflow-y-auto"
                    >
                      {selectedPlaybook.steps.map((step, index) => (
                        <div
                          key={step.id}
                          className="flex items-center gap-2 text-sm text-gray-600 py-1"
                        >
                          <span className="w-5 h-5 flex items-center justify-center bg-gray-100 rounded text-xs font-medium">
                            {index + 1}
                          </span>
                          <span>{step.title}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </>
          )}

          {pourWorkflow.isError && (
            <div className="mb-4 p-2 bg-red-50 text-red-700 text-sm rounded">
              {pourWorkflow.error?.message || 'Failed to pour workflow'}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-4 border-t">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-md"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pourWorkflow.isPending || (!useQuickMode && !selectedPlaybook)}
              data-testid="pour-submit-button"
              className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50 flex items-center gap-2"
            >
              {pourWorkflow.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Pouring...
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  Pour Workflow
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * Main Workflows Page Component
 */
export function WorkflowsPage() {
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  const [isPourModalOpen, setIsPourModalOpen] = useState(false);

  const { data: workflows = [], isLoading, error } = useWorkflows(selectedStatus ?? undefined);

  return (
    <div data-testid="workflows-page" className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 bg-white">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <GitBranch className="w-6 h-6 text-purple-500" />
            <h1 className="text-xl font-semibold text-gray-900">Workflows</h1>
            {workflows.length > 0 && (
              <span
                data-testid="workflows-count"
                className="text-sm text-gray-500"
              >
                ({workflows.length})
              </span>
            )}
          </div>
          <button
            onClick={() => setIsPourModalOpen(true)}
            data-testid="pour-workflow-button"
            className="flex items-center gap-2 px-3 py-1.5 bg-purple-600 text-white rounded-md hover:bg-purple-700 text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            Pour Workflow
          </button>
        </div>

        <StatusFilter
          selectedStatus={selectedStatus}
          onStatusChange={setSelectedStatus}
        />
      </div>

      {/* Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Workflow List */}
        <div className="flex-1 overflow-y-auto p-4 bg-gray-50">
          {isLoading && (
            <div
              data-testid="workflows-loading"
              className="text-center py-12 text-gray-500"
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
              <GitBranch className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">No workflows found</p>
              <p className="text-sm text-gray-400 mt-1">
                {selectedStatus
                  ? `No ${selectedStatus} workflows available`
                  : 'Pour your first workflow from a playbook'}
              </p>
            </div>
          )}

          {!isLoading && !error && workflows.length > 0 && (
            <div data-testid="workflows-list" className="space-y-3">
              {workflows.map((workflow) => (
                <WorkflowListItem
                  key={workflow.id}
                  workflow={workflow}
                  isSelected={selectedWorkflowId === workflow.id}
                  onClick={setSelectedWorkflowId}
                />
              ))}
            </div>
          )}
        </div>

        {/* Workflow Detail Panel */}
        {selectedWorkflowId && (
          <div className="w-96 flex-shrink-0">
            <WorkflowDetailPanel
              workflowId={selectedWorkflowId}
              onClose={() => setSelectedWorkflowId(null)}
            />
          </div>
        )}
      </div>

      {/* Pour Workflow Modal */}
      <PourWorkflowModal
        isOpen={isPourModalOpen}
        onClose={() => setIsPourModalOpen(false)}
      />
    </div>
  );
}

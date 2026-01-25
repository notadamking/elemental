/**
 * Plans Page - Plan management with progress visualization (TB24)
 *
 * Features:
 * - List all plans with status badges
 * - Progress bars showing completion percentage
 * - Plan detail panel with task breakdown
 * - Filter by status
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ClipboardList,
  Clock,
  CheckCircle2,
  XCircle,
  FileEdit,
  ChevronRight,
  X,
  ListTodo,
  CircleDot,
  AlertCircle,
  User,
} from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

interface PlanType {
  id: string;
  type: 'plan';
  title: string;
  status: 'draft' | 'active' | 'completed' | 'cancelled';
  descriptionRef?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  tags: string[];
  completedAt?: string;
  cancelledAt?: string;
  cancelReason?: string;
}

interface PlanProgress {
  totalTasks: number;
  completedTasks: number;
  inProgressTasks: number;
  blockedTasks: number;
  remainingTasks: number;
  completionPercentage: number;
}

interface HydratedPlan extends PlanType {
  _progress?: PlanProgress;
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
  draft: {
    label: 'Draft',
    icon: <FileEdit className="w-4 h-4" />,
    color: 'text-gray-600',
    bgColor: 'bg-gray-100',
  },
  active: {
    label: 'Active',
    icon: <CircleDot className="w-4 h-4" />,
    color: 'text-blue-600',
    bgColor: 'bg-blue-100',
  },
  completed: {
    label: 'Completed',
    icon: <CheckCircle2 className="w-4 h-4" />,
    color: 'text-green-600',
    bgColor: 'bg-green-100',
  },
  cancelled: {
    label: 'Cancelled',
    icon: <XCircle className="w-4 h-4" />,
    color: 'text-red-600',
    bgColor: 'bg-red-100',
  },
};

// ============================================================================
// API Hooks
// ============================================================================

function usePlans(status?: string) {
  return useQuery<PlanType[]>({
    queryKey: ['plans', status],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (status) {
        params.set('status', status);
      }
      const response = await fetch(`/api/plans?${params.toString()}`);
      if (!response.ok) {
        throw new Error('Failed to fetch plans');
      }
      return response.json();
    },
  });
}

function usePlan(planId: string | null) {
  return useQuery<HydratedPlan>({
    queryKey: ['plans', planId],
    queryFn: async () => {
      if (!planId) throw new Error('No plan selected');
      const response = await fetch(`/api/plans/${planId}?hydrate.progress=true`);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to fetch plan');
      }
      return response.json();
    },
    enabled: !!planId,
  });
}

function usePlanTasks(planId: string | null) {
  return useQuery<TaskType[]>({
    queryKey: ['plans', planId, 'tasks'],
    queryFn: async () => {
      if (!planId) throw new Error('No plan selected');
      const response = await fetch(`/api/plans/${planId}/tasks`);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to fetch plan tasks');
      }
      return response.json();
    },
    enabled: !!planId,
  });
}

function usePlanProgress(planId: string | null) {
  return useQuery<PlanProgress>({
    queryKey: ['plans', planId, 'progress'],
    queryFn: async () => {
      if (!planId) throw new Error('No plan selected');
      const response = await fetch(`/api/plans/${planId}/progress`);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to fetch plan progress');
      }
      return response.json();
    },
    enabled: !!planId,
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
  progress: PlanProgress;
  showLabel?: boolean;
  size?: 'sm' | 'md';
}) {
  const { completionPercentage, completedTasks, totalTasks } = progress;
  const height = size === 'sm' ? 'h-1.5' : 'h-2.5';

  return (
    <div data-testid="progress-bar" className="flex items-center gap-2">
      <div className={`flex-1 bg-gray-200 rounded-full ${height} overflow-hidden`}>
        <div
          className={`${height} bg-green-500 rounded-full transition-all duration-300`}
          style={{ width: `${completionPercentage}%` }}
          data-testid="progress-bar-fill"
        />
      </div>
      {showLabel && (
        <span
          data-testid="progress-label"
          className="text-xs text-gray-500 whitespace-nowrap"
        >
          {completedTasks}/{totalTasks} ({Math.round(completionPercentage)}%)
        </span>
      )}
    </div>
  );
}

/**
 * Status Badge component
 */
function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.draft;

  return (
    <span
      data-testid={`status-badge-${status}`}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${config.bgColor} ${config.color}`}
    >
      {config.icon}
      {config.label}
    </span>
  );
}

/**
 * Plan List Item component
 */
function PlanListItem({
  plan,
  isSelected,
  onClick,
}: {
  plan: PlanType;
  isSelected: boolean;
  onClick: (id: string) => void;
}) {
  return (
    <div
      data-testid={`plan-item-${plan.id}`}
      className={`p-4 rounded-lg border cursor-pointer transition-colors ${
        isSelected
          ? 'bg-blue-50 border-blue-200'
          : 'bg-white border-gray-200 hover:border-gray-300 hover:bg-gray-50'
      }`}
      onClick={() => onClick(plan.id)}
    >
      <div className="flex items-start justify-between mb-2">
        <h3
          data-testid="plan-item-title"
          className="font-medium text-gray-900 truncate flex-1"
        >
          {plan.title}
        </h3>
        <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0 ml-2" />
      </div>

      <div className="flex items-center gap-2 mb-2">
        <StatusBadge status={plan.status} />
        <span className="text-xs text-gray-500" title={formatDate(plan.updatedAt)}>
          Updated {formatRelativeTime(plan.updatedAt)}
        </span>
      </div>

      {plan.tags && plan.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {plan.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="px-1.5 py-0.5 text-xs bg-gray-100 text-gray-600 rounded"
            >
              {tag}
            </span>
          ))}
          {plan.tags.length > 3 && (
            <span className="text-xs text-gray-400">+{plan.tags.length - 3}</span>
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
    { value: 'active', label: 'Active' },
    { value: 'draft', label: 'Draft' },
    { value: 'completed', label: 'Completed' },
    { value: 'cancelled', label: 'Cancelled' },
  ];

  return (
    <div data-testid="status-filter" className="flex gap-1 p-1 bg-gray-100 rounded-lg">
      {statuses.map((status) => (
        <button
          key={status.value ?? 'all'}
          data-testid={`status-filter-${status.value ?? 'all'}`}
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
function TaskStatusSummary({ progress }: { progress: PlanProgress }) {
  const items = [
    {
      label: 'Completed',
      count: progress.completedTasks,
      icon: <CheckCircle2 className="w-4 h-4 text-green-500" />,
    },
    {
      label: 'In Progress',
      count: progress.inProgressTasks,
      icon: <CircleDot className="w-4 h-4 text-blue-500" />,
    },
    {
      label: 'Blocked',
      count: progress.blockedTasks,
      icon: <AlertCircle className="w-4 h-4 text-red-500" />,
    },
    {
      label: 'Remaining',
      count: progress.remainingTasks,
      icon: <ListTodo className="w-4 h-4 text-gray-400" />,
    },
  ];

  return (
    <div data-testid="task-status-summary" className="grid grid-cols-2 gap-3">
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
 * Plan Task List
 */
function PlanTaskList({ tasks }: { tasks: TaskType[] }) {
  if (tasks.length === 0) {
    return (
      <div
        data-testid="plan-tasks-empty"
        className="text-center py-8 text-gray-500 text-sm"
      >
        No tasks in this plan
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
    <div data-testid="plan-tasks-list" className="space-y-2">
      {tasks.map((task) => (
        <div
          key={task.id}
          data-testid={`plan-task-${task.id}`}
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
 * Plan Detail Panel
 */
function PlanDetailPanel({
  planId,
  onClose,
}: {
  planId: string;
  onClose: () => void;
}) {
  const { data: plan, isLoading, isError, error } = usePlan(planId);
  const { data: tasks = [] } = usePlanTasks(planId);
  const { data: progress } = usePlanProgress(planId);

  if (isLoading) {
    return (
      <div
        data-testid="plan-detail-loading"
        className="h-full flex items-center justify-center bg-white"
      >
        <div className="text-gray-500">Loading plan...</div>
      </div>
    );
  }

  if (isError) {
    return (
      <div
        data-testid="plan-detail-error"
        className="h-full flex flex-col items-center justify-center bg-white"
      >
        <div className="text-red-600 mb-2">Failed to load plan</div>
        <div className="text-sm text-gray-500">{(error as Error)?.message}</div>
      </div>
    );
  }

  if (!plan) {
    return (
      <div
        data-testid="plan-detail-not-found"
        className="h-full flex items-center justify-center bg-white"
      >
        <div className="text-gray-500">Plan not found</div>
      </div>
    );
  }

  return (
    <div
      data-testid="plan-detail-panel"
      className="h-full flex flex-col bg-white border-l border-gray-200"
    >
      {/* Header */}
      <div className="flex items-start justify-between p-4 border-b border-gray-200">
        <div className="flex-1 min-w-0">
          {/* Status badge */}
          <div className="mb-2">
            <StatusBadge status={plan.status} />
          </div>

          {/* Title */}
          <h2
            data-testid="plan-detail-title"
            className="text-lg font-semibold text-gray-900"
          >
            {plan.title}
          </h2>

          {/* ID */}
          <div className="mt-1 text-xs text-gray-500 font-mono">
            <span data-testid="plan-detail-id">{plan.id}</span>
          </div>
        </div>

        <button
          onClick={onClose}
          className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
          aria-label="Close panel"
          data-testid="plan-detail-close"
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
          <PlanTaskList tasks={tasks} />
        </div>

        {/* Metadata */}
        <div className="pt-4 border-t border-gray-100">
          <div className="grid grid-cols-2 gap-4 text-xs text-gray-500">
            <div>
              <div className="flex items-center gap-1 mb-1">
                <Clock className="w-3 h-3" />
                <span className="font-medium">Created:</span>
              </div>
              <span title={formatDate(plan.createdAt)}>
                {formatRelativeTime(plan.createdAt)}
              </span>
            </div>
            <div>
              <div className="flex items-center gap-1 mb-1">
                <Clock className="w-3 h-3" />
                <span className="font-medium">Updated:</span>
              </div>
              <span title={formatDate(plan.updatedAt)}>
                {formatRelativeTime(plan.updatedAt)}
              </span>
            </div>
            <div className="col-span-2">
              <div className="flex items-center gap-1 mb-1">
                <User className="w-3 h-3" />
                <span className="font-medium">Created by:</span>
              </div>
              <span className="font-mono">{plan.createdBy}</span>
            </div>
            {plan.completedAt && (
              <div className="col-span-2">
                <div className="flex items-center gap-1 mb-1">
                  <CheckCircle2 className="w-3 h-3 text-green-500" />
                  <span className="font-medium">Completed:</span>
                </div>
                <span>{formatDate(plan.completedAt)}</span>
              </div>
            )}
            {plan.cancelledAt && (
              <div className="col-span-2">
                <div className="flex items-center gap-1 mb-1">
                  <XCircle className="w-3 h-3 text-red-500" />
                  <span className="font-medium">Cancelled:</span>
                </div>
                <span>{formatDate(plan.cancelledAt)}</span>
                {plan.cancelReason && (
                  <p className="mt-1 text-gray-600">{plan.cancelReason}</p>
                )}
              </div>
            )}
          </div>

          {/* Tags */}
          {plan.tags && plan.tags.length > 0 && (
            <div className="mt-4">
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                Tags
              </div>
              <div className="flex flex-wrap gap-1">
                {plan.tags.map((tag) => (
                  <span
                    key={tag}
                    data-testid={`plan-tag-${tag}`}
                    className="px-2 py-0.5 text-xs bg-gray-100 text-gray-700 rounded"
                  >
                    {tag}
                  </span>
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
 * Main Plans Page Component
 */
export function PlansPage() {
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);

  const { data: plans = [], isLoading, error } = usePlans(selectedStatus ?? undefined);

  return (
    <div data-testid="plans-page" className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 bg-white">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <ClipboardList className="w-6 h-6 text-blue-500" />
            <h1 className="text-xl font-semibold text-gray-900">Plans</h1>
            {plans.length > 0 && (
              <span
                data-testid="plans-count"
                className="text-sm text-gray-500"
              >
                ({plans.length})
              </span>
            )}
          </div>
        </div>

        <StatusFilter
          selectedStatus={selectedStatus}
          onStatusChange={setSelectedStatus}
        />
      </div>

      {/* Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Plan List */}
        <div className="flex-1 overflow-y-auto p-4 bg-gray-50">
          {isLoading && (
            <div
              data-testid="plans-loading"
              className="text-center py-12 text-gray-500"
            >
              Loading plans...
            </div>
          )}

          {error && (
            <div
              data-testid="plans-error"
              className="text-center py-12 text-red-500"
            >
              Failed to load plans
            </div>
          )}

          {!isLoading && !error && plans.length === 0 && (
            <div
              data-testid="plans-empty"
              className="text-center py-12"
            >
              <ClipboardList className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">No plans found</p>
              <p className="text-sm text-gray-400 mt-1">
                {selectedStatus
                  ? `No ${selectedStatus} plans available`
                  : 'Create your first plan to get started'}
              </p>
            </div>
          )}

          {!isLoading && !error && plans.length > 0 && (
            <div data-testid="plans-list" className="space-y-3">
              {plans.map((plan) => (
                <PlanListItem
                  key={plan.id}
                  plan={plan}
                  isSelected={selectedPlanId === plan.id}
                  onClick={setSelectedPlanId}
                />
              ))}
            </div>
          )}
        </div>

        {/* Plan Detail Panel */}
        {selectedPlanId && (
          <div className="w-96 flex-shrink-0">
            <PlanDetailPanel
              planId={selectedPlanId}
              onClose={() => setSelectedPlanId(null)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * WorkflowProgressDashboard - Displays workflow execution progress
 *
 * Shows progress bar, task list with status, dependency graph visualization,
 * and a scoped activity feed for the workflow.
 *
 * TB-O35: Workflow Progress Dashboard
 */

import { useMemo } from 'react';
import {
  CheckCircle,
  Clock,
  AlertCircle,
  Loader2,
  ArrowRight,
  Circle,
  Play,
  AlertTriangle,
  ListTodo,
} from 'lucide-react';
import type { Task, WorkflowProgress, WorkflowDependency, Workflow } from '../../api/types';
import { TaskStatusBadge, TaskPriorityBadge } from '@elemental/ui/domain';

// ============================================================================
// Types
// ============================================================================

interface WorkflowProgressDashboardProps {
  workflow: Workflow;
  tasks: Task[];
  progress: WorkflowProgress;
  dependencies: WorkflowDependency[];
  isLoading?: boolean;
}

// ============================================================================
// Progress Bar Component
// ============================================================================

function ProgressBar({ progress }: { progress: WorkflowProgress }) {
  const { percentage, completed, inProgress, blocked, open, total } = progress;

  // Calculate segment widths
  const completedWidth = total > 0 ? (completed / total) * 100 : 0;
  const inProgressWidth = total > 0 ? (inProgress / total) * 100 : 0;
  const blockedWidth = total > 0 ? (blocked / total) * 100 : 0;

  return (
    <div className="space-y-3" data-testid="workflow-progress-bar">
      {/* Progress header */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-[var(--color-text)]">
          Progress
        </span>
        <span className="text-sm text-[var(--color-text-secondary)]">
          {percentage}% complete
        </span>
      </div>

      {/* Stacked progress bar */}
      <div className="h-3 bg-[var(--color-surface-elevated)] rounded-full overflow-hidden flex">
        {completedWidth > 0 && (
          <div
            className="bg-green-500 transition-all duration-500"
            style={{ width: `${completedWidth}%` }}
            title={`Completed: ${completed}`}
          />
        )}
        {inProgressWidth > 0 && (
          <div
            className="bg-blue-500 transition-all duration-500"
            style={{ width: `${inProgressWidth}%` }}
            title={`In Progress: ${inProgress}`}
          />
        )}
        {blockedWidth > 0 && (
          <div
            className="bg-red-400 transition-all duration-500"
            style={{ width: `${blockedWidth}%` }}
            title={`Blocked: ${blocked}`}
          />
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-green-500" />
          <span className="text-[var(--color-text-secondary)]">
            Completed ({completed})
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-blue-500" />
          <span className="text-[var(--color-text-secondary)]">
            In Progress ({inProgress})
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-400" />
          <span className="text-[var(--color-text-secondary)]">
            Blocked ({blocked})
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-gray-300 dark:bg-gray-600" />
          <span className="text-[var(--color-text-secondary)]">
            Open ({open})
          </span>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Stats Cards Component
// ============================================================================

function StatsCards({ progress }: { progress: WorkflowProgress }) {
  const stats = [
    {
      label: 'Total Tasks',
      value: progress.total,
      icon: ListTodo,
      color: 'text-[var(--color-text)]',
      bgColor: 'bg-[var(--color-surface-elevated)]',
    },
    {
      label: 'Completed',
      value: progress.completed,
      icon: CheckCircle,
      color: 'text-green-600 dark:text-green-400',
      bgColor: 'bg-green-100 dark:bg-green-900/30',
    },
    {
      label: 'In Progress',
      value: progress.inProgress,
      icon: Play,
      color: 'text-blue-600 dark:text-blue-400',
      bgColor: 'bg-blue-100 dark:bg-blue-900/30',
    },
    {
      label: 'Blocked',
      value: progress.blocked,
      icon: AlertCircle,
      color: 'text-red-600 dark:text-red-400',
      bgColor: 'bg-red-100 dark:bg-red-900/30',
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="workflow-stats-cards">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className={`p-3 rounded-lg ${stat.bgColor}`}
          data-testid={`stat-card-${stat.label.toLowerCase().replace(' ', '-')}`}
        >
          <div className="flex items-center gap-2">
            <stat.icon className={`w-4 h-4 ${stat.color}`} />
            <span className={`text-xl font-semibold ${stat.color}`}>
              {stat.value}
            </span>
          </div>
          <span className="text-xs text-[var(--color-text-secondary)]">
            {stat.label}
          </span>
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// Task List Component
// ============================================================================

interface TaskListItemProps {
  task: Task;
  dependsOn: string[];
  blockedBy: string[];
}

function TaskListItem({ task, dependsOn, blockedBy }: TaskListItemProps) {
  const statusIcon = useMemo(() => {
    switch (task.status) {
      case 'closed':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'in_progress':
        return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
      case 'blocked':
        return <AlertCircle className="w-4 h-4 text-red-400" />;
      case 'open':
        return <Circle className="w-4 h-4 text-gray-400" />;
      default:
        return <Clock className="w-4 h-4 text-gray-400" />;
    }
  }, [task.status]);

  return (
    <div
      className="flex items-center gap-3 p-3 border border-[var(--color-border)] rounded-lg bg-[var(--color-surface)] hover:bg-[var(--color-surface-hover)] transition-colors"
      data-testid={`workflow-task-${task.id}`}
    >
      {/* Status Icon */}
      <div className="flex-shrink-0">{statusIcon}</div>

      {/* Task Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-[var(--color-text)] truncate">
            {task.title}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-1">
          <TaskStatusBadge status={task.status} />
          <TaskPriorityBadge priority={task.priority} />
          {dependsOn.length > 0 && (
            <span className="text-xs text-[var(--color-text-tertiary)]">
              Depends on {dependsOn.length} task{dependsOn.length > 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      {/* Blocked indicator */}
      {blockedBy.length > 0 && (
        <div className="flex items-center gap-1 text-xs text-red-500">
          <AlertTriangle className="w-3 h-3" />
          <span>Blocked</span>
        </div>
      )}
    </div>
  );
}

function TaskList({
  tasks,
  dependencies,
}: {
  tasks: Task[];
  dependencies: WorkflowDependency[];
}) {
  // Build dependency maps for display
  const { dependsOnMap, blockedByMap } = useMemo(() => {
    const dependsOn = new Map<string, string[]>();
    const blockedBy = new Map<string, string[]>();

    // Dependencies are: sourceId blocks targetId
    // So if A blocks B, sourceId=A, targetId=B
    // Task B depends on A (B cannot start until A completes)
    for (const dep of dependencies) {
      // targetId depends on sourceId
      if (!dependsOn.has(dep.targetId)) {
        dependsOn.set(dep.targetId, []);
      }
      dependsOn.get(dep.targetId)!.push(dep.sourceId);

      // sourceId blocks targetId
      if (!blockedBy.has(dep.targetId)) {
        blockedBy.set(dep.targetId, []);
      }
      blockedBy.get(dep.targetId)!.push(dep.sourceId);
    }

    return { dependsOnMap: dependsOn, blockedByMap: blockedBy };
  }, [dependencies]);

  // Sort tasks: in_progress first, then blocked, then open, then closed
  const sortedTasks = useMemo(() => {
    const statusOrder: Record<string, number> = {
      in_progress: 0,
      blocked: 1,
      open: 2,
      closed: 3,
      deferred: 4,
      tombstone: 5,
    };

    return [...tasks].sort((a, b) => {
      const aOrder = statusOrder[a.status] ?? 99;
      const bOrder = statusOrder[b.status] ?? 99;
      return aOrder - bOrder;
    });
  }, [tasks]);

  if (tasks.length === 0) {
    return (
      <div className="text-center py-8 text-[var(--color-text-secondary)]">
        No tasks in this workflow
      </div>
    );
  }

  return (
    <div className="space-y-2" data-testid="workflow-task-list">
      {sortedTasks.map((task) => (
        <TaskListItem
          key={task.id}
          task={task}
          dependsOn={dependsOnMap.get(task.id) ?? []}
          blockedBy={blockedByMap.get(task.id) ?? []}
        />
      ))}
    </div>
  );
}

// ============================================================================
// Dependency Graph Component (Simple visualization)
// ============================================================================

function DependencyGraph({
  tasks,
  dependencies,
}: {
  tasks: Task[];
  dependencies: WorkflowDependency[];
}) {
  const taskMap = useMemo(() => {
    const map = new Map<string, Task>();
    for (const task of tasks) {
      map.set(task.id, task);
    }
    return map;
  }, [tasks]);

  if (dependencies.length === 0) {
    return (
      <div className="text-center py-4 text-[var(--color-text-tertiary)] text-sm">
        No dependencies between tasks
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'closed':
        return 'border-green-500 bg-green-100 dark:bg-green-900/30';
      case 'in_progress':
        return 'border-blue-500 bg-blue-100 dark:bg-blue-900/30';
      case 'blocked':
        return 'border-red-400 bg-red-100 dark:bg-red-900/30';
      default:
        return 'border-gray-300 bg-gray-100 dark:bg-gray-800';
    }
  };

  return (
    <div className="space-y-3" data-testid="workflow-dependency-graph">
      <div className="text-xs text-[var(--color-text-secondary)] mb-2">
        Task dependencies ({dependencies.length} connection{dependencies.length !== 1 ? 's' : ''})
      </div>
      <div className="space-y-2 overflow-x-auto">
        {dependencies.slice(0, 10).map((dep, idx) => {
          const sourceTask = taskMap.get(dep.sourceId);
          const targetTask = taskMap.get(dep.targetId);
          if (!sourceTask || !targetTask) return null;

          return (
            <div key={idx} className="flex items-center gap-2 text-xs">
              <div
                className={`px-2 py-1 rounded border-2 ${getStatusColor(sourceTask.status)} truncate max-w-[150px]`}
                title={sourceTask.title}
              >
                {sourceTask.title}
              </div>
              <ArrowRight className="w-4 h-4 text-[var(--color-text-tertiary)] flex-shrink-0" />
              <div
                className={`px-2 py-1 rounded border-2 ${getStatusColor(targetTask.status)} truncate max-w-[150px]`}
                title={targetTask.title}
              >
                {targetTask.title}
              </div>
            </div>
          );
        })}
        {dependencies.length > 10 && (
          <div className="text-xs text-[var(--color-text-tertiary)]">
            ...and {dependencies.length - 10} more
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function WorkflowProgressDashboard({
  workflow,
  tasks,
  progress,
  dependencies,
  isLoading,
}: WorkflowProgressDashboardProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-[var(--color-primary)] animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="workflow-progress-dashboard">
      {/* Workflow Status Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-[var(--color-text)]">
            {workflow.title}
          </h2>
          <p className="text-sm text-[var(--color-text-secondary)]">
            {progress.total} task{progress.total !== 1 ? 's' : ''} in workflow
          </p>
        </div>
        <div
          className={`px-3 py-1.5 rounded-full text-sm font-medium ${getWorkflowStatusStyle(workflow.status)}`}
        >
          {getWorkflowStatusLabel(workflow.status)}
        </div>
      </div>

      {/* Stats Cards */}
      <StatsCards progress={progress} />

      {/* Progress Bar */}
      <ProgressBar progress={progress} />

      {/* Two Column Layout: Task List and Dependencies */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Task List - 2 columns */}
        <div className="lg:col-span-2">
          <h3 className="text-sm font-medium text-[var(--color-text)] mb-3">
            Tasks
          </h3>
          <TaskList tasks={tasks} dependencies={dependencies} />
        </div>

        {/* Dependencies - 1 column */}
        <div className="lg:col-span-1">
          <h3 className="text-sm font-medium text-[var(--color-text)] mb-3">
            Dependencies
          </h3>
          <div className="p-4 border border-[var(--color-border)] rounded-lg bg-[var(--color-surface)]">
            <DependencyGraph tasks={tasks} dependencies={dependencies} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Helper Functions
// ============================================================================

function getWorkflowStatusStyle(status: string): string {
  switch (status) {
    case 'pending':
      return 'text-gray-600 bg-gray-100 dark:text-gray-400 dark:bg-gray-900/30';
    case 'running':
      return 'text-blue-600 bg-blue-100 dark:text-blue-400 dark:bg-blue-900/30';
    case 'completed':
      return 'text-green-600 bg-green-100 dark:text-green-400 dark:bg-green-900/30';
    case 'failed':
      return 'text-red-600 bg-red-100 dark:text-red-400 dark:bg-red-900/30';
    case 'cancelled':
      return 'text-yellow-600 bg-yellow-100 dark:text-yellow-400 dark:bg-yellow-900/30';
    default:
      return 'text-gray-600 bg-gray-100';
  }
}

function getWorkflowStatusLabel(status: string): string {
  switch (status) {
    case 'pending':
      return 'Pending';
    case 'running':
      return 'Running';
    case 'completed':
      return 'Completed';
    case 'failed':
      return 'Failed';
    case 'cancelled':
      return 'Cancelled';
    default:
      return status;
  }
}

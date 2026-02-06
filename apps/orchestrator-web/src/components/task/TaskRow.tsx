/**
 * TaskRow - Table row component for displaying task information
 * Used in the list view of the tasks page
 *
 * Badge components are from @elemental/ui/domain.
 */

import { GitBranch, GitMerge, AlertTriangle, Bot, User, Play, CheckCircle2 } from 'lucide-react';
import type { Task, Agent } from '../../api/types';
import { TaskStatusBadge, TaskPriorityBadge, TaskTypeBadge } from '@elemental/ui/domain';
import { TaskActionsDropdown } from './TaskActionsDropdown';

interface TaskRowProps {
  task: Task;
  assignedAgent?: Agent;
  onStart?: () => void;
  onComplete?: () => void;
  onClick?: () => void;
  isStarting?: boolean;
  isCompleting?: boolean;
  /** Pre-rendered title with search highlights */
  highlightedTitle?: React.ReactNode;
}

export function TaskRow({
  task,
  assignedAgent,
  onStart,
  onComplete,
  onClick,
  isStarting,
  isCompleting,
  highlightedTitle,
}: TaskRowProps) {
  const orchestratorMeta = task.metadata?.orchestrator;
  const canStart = task.status === 'open' && task.assignee;
  const canComplete = task.status === 'in_progress';

  return (
    <tr
      className="border-b border-[var(--color-border)] hover:bg-[var(--color-surface-hover)] cursor-pointer transition-colors"
      onClick={onClick}
      data-testid={`task-row-${task.id}`}
    >
      {/* Title */}
      <td className="px-4 py-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium text-[var(--color-text)] truncate max-w-[300px]" title={task.title}>
            {highlightedTitle ?? task.title}
          </span>
          <span className="text-xs text-[var(--color-text-tertiary)] font-mono">
            {task.id}
          </span>
        </div>
      </td>

      {/* Status */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-1.5">
          <TaskStatusBadge
            status={task.status}
            mergeStatus={orchestratorMeta?.mergeStatus}
          />
          {task.status === 'review' && (orchestratorMeta?.mergeStatus === 'testing' || orchestratorMeta?.mergeStatus === 'merging') && (
            <span className="inline-flex items-center gap-0.5 text-xs text-blue-600 dark:text-blue-400" title="Steward reviewing">
              <Bot className="w-3.5 h-3.5 animate-pulse" />
              Reviewing
            </span>
          )}
          {task.status === 'closed' && orchestratorMeta?.mergeStatus === 'merged' && (
            <span className="inline-flex items-center gap-0.5 text-xs text-green-600 dark:text-green-400">
              <GitMerge className="w-3.5 h-3.5" />
              Merged
            </span>
          )}
          {task.status === 'closed' && orchestratorMeta?.mergeStatus && orchestratorMeta.mergeStatus !== 'merged' && (
            <span className="inline-flex items-center text-orange-500 dark:text-orange-400" title="Closed but not merged">
              <AlertTriangle className="w-3.5 h-3.5" />
            </span>
          )}
        </div>
      </td>

      {/* Priority */}
      <td className="px-4 py-3">
        <TaskPriorityBadge priority={task.priority} showIcon={false} />
      </td>

      {/* Type */}
      <td className="px-4 py-3">
        <TaskTypeBadge taskType={task.taskType} />
      </td>

      {/* Assignee */}
      <td className="px-4 py-3">
        {assignedAgent || task.assignee ? (
          <div className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
            <User className="w-4 h-4" />
            <span className="truncate max-w-[120px]">{assignedAgent?.name || task.assignee}</span>
          </div>
        ) : (
          <span className="text-sm text-[var(--color-text-tertiary)]">Unassigned</span>
        )}
      </td>

      {/* Branch */}
      <td className="px-4 py-3">
        {orchestratorMeta?.branch ? (
          <div className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)]">
            <GitBranch className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="truncate max-w-[150px] font-mono" title={orchestratorMeta.branch}>
              {orchestratorMeta.branch.split('/').pop()}
            </span>
          </div>
        ) : (
          <span className="text-sm text-[var(--color-text-tertiary)]">-</span>
        )}
      </td>

      {/* Updated */}
      <td className="px-4 py-3 text-xs text-[var(--color-text-tertiary)]">
        {formatDate(task.updatedAt)}
      </td>

      {/* Actions */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-1 justify-end">
          {canStart && onStart && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onStart();
              }}
              disabled={isStarting}
              className="p-1.5 text-[var(--color-primary)] hover:bg-[var(--color-primary-muted)] rounded disabled:opacity-50 transition-colors"
              title="Start task"
              data-testid="task-row-start"
            >
              <Play className="w-4 h-4" />
            </button>
          )}
          {canComplete && onComplete && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onComplete();
              }}
              disabled={isCompleting}
              className="p-1.5 text-green-600 hover:bg-green-100 dark:hover:bg-green-900/30 rounded disabled:opacity-50 transition-colors"
              title="Complete task"
              data-testid="task-row-complete"
            >
              <CheckCircle2 className="w-4 h-4" />
            </button>
          )}
          <TaskActionsDropdown task={task} />
        </div>
      </td>
    </tr>
  );
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours === 0) {
      const diffMins = Math.floor(diffMs / (1000 * 60));
      return diffMins <= 1 ? 'Just now' : `${diffMins}m ago`;
    }
    return `${diffHours}h ago`;
  }
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

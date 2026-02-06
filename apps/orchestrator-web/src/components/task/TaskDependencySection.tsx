/**
 * TaskDependencySection - Displays task dependencies (blocked by and blocks)
 *
 * Shows:
 * - Tasks that block this task (Blocked By)
 * - Tasks that this task blocks (Blocks)
 * - Progress indicator for resolved blockers
 */

import { useState } from 'react';
import {
  Link2,
  ChevronDown,
  ChevronRight,
  Circle,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ArrowRight,
  Loader2,
  Eye,
  PlayCircle,
} from 'lucide-react';
import { useTaskDependencies, type DependencyInfo } from '../../api/hooks/useTaskDependencies';
import type { TaskStatus, Priority } from '../../api/types';

interface TaskDependencySectionProps {
  taskId: string;
  onNavigateToTask?: (taskId: string) => void;
}

// ============================================================================
// Main Component
// ============================================================================

export function TaskDependencySection({ taskId, onNavigateToTask }: TaskDependencySectionProps) {
  const { data, isLoading, error } = useTaskDependencies(taskId);
  const [isBlockedByExpanded, setIsBlockedByExpanded] = useState(true);
  const [isBlocksExpanded, setIsBlocksExpanded] = useState(true);

  const blockedBy = data?.blockedBy ?? [];
  const blocks = data?.blocks ?? [];
  const progress = data?.progress ?? { resolved: 0, total: 0 };

  const hasNoDependencies = blockedBy.length === 0 && blocks.length === 0;

  if (isLoading) {
    return (
      <div className="mb-6 p-4 bg-[var(--color-surface-elevated)] rounded-lg border border-[var(--color-border)]">
        <div className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading dependencies...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mb-6 p-4 bg-[var(--color-surface-elevated)] rounded-lg border border-[var(--color-border)]">
        <div className="text-sm text-[var(--color-danger)]">
          Failed to load dependencies: {error.message}
        </div>
      </div>
    );
  }

  return (
    <div
      className="mb-6 p-4 bg-[var(--color-surface-elevated)] rounded-lg border border-[var(--color-border)]"
      data-testid="dependencies-section"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wide">
          <Link2 className="w-3 h-3" />
          Dependencies
        </div>
        {progress.total > 0 && (
          <span className="text-xs text-[var(--color-text-tertiary)]">
            {progress.resolved}/{progress.total} resolved
          </span>
        )}
      </div>

      {/* Empty State */}
      {hasNoDependencies && (
        <div className="text-sm text-[var(--color-text-tertiary)]" data-testid="dependencies-empty">
          No dependencies
        </div>
      )}

      {/* Blocked By Section */}
      {blockedBy.length > 0 && (
        <div className="mb-4">
          <button
            onClick={() => setIsBlockedByExpanded(!isBlockedByExpanded)}
            className="flex items-center gap-2 text-xs font-medium text-[var(--color-text-secondary)] mb-2 hover:text-[var(--color-text)]"
            data-testid="blocked-by-toggle"
          >
            {isBlockedByExpanded ? (
              <ChevronDown className="w-3 h-3" />
            ) : (
              <ChevronRight className="w-3 h-3" />
            )}
            Blocked By ({progress.resolved}/{progress.total} resolved)
          </button>
          {isBlockedByExpanded && (
            <div className="space-y-2" data-testid="blocked-by-list">
              {blockedBy.map((dep) => (
                <DependencyCard
                  key={dep.task.id}
                  dependency={dep}
                  onClick={onNavigateToTask ? () => onNavigateToTask(dep.task.id) : undefined}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Blocks Section */}
      {blocks.length > 0 && (
        <div>
          <button
            onClick={() => setIsBlocksExpanded(!isBlocksExpanded)}
            className="flex items-center gap-2 text-xs font-medium text-[var(--color-text-secondary)] mb-2 hover:text-[var(--color-text)]"
            data-testid="blocks-toggle"
          >
            {isBlocksExpanded ? (
              <ChevronDown className="w-3 h-3" />
            ) : (
              <ChevronRight className="w-3 h-3" />
            )}
            Blocks ({blocks.length})
          </button>
          {isBlocksExpanded && (
            <div className="space-y-2" data-testid="blocks-list">
              {blocks.map((dep) => (
                <DependencyCard
                  key={dep.task.id}
                  dependency={dep}
                  onClick={onNavigateToTask ? () => onNavigateToTask(dep.task.id) : undefined}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// DependencyCard Component
// ============================================================================

interface DependencyCardProps {
  dependency: DependencyInfo;
  onClick?: () => void;
}

function DependencyCard({ dependency, onClick }: DependencyCardProps) {
  const { task } = dependency;
  const isResolved = task.status === 'closed';
  const isClickable = !!onClick;

  const content = (
    <>
      {/* Status Icon */}
      <StatusIcon status={task.status} />

      {/* Title */}
      <span
        className={`flex-1 text-sm text-[var(--color-text)] truncate ${
          isResolved ? 'line-through' : ''
        }`}
      >
        {task.title}
      </span>

      {/* Priority Badge */}
      <PriorityBadge priority={task.priority} />

      {/* Arrow (only show if clickable) */}
      {isClickable && <ArrowRight className="w-4 h-4 text-[var(--color-text-tertiary)]" />}
    </>
  );

  if (isClickable) {
    return (
      <button
        onClick={onClick}
        className={`w-full flex items-center gap-3 p-3 rounded-lg border border-[var(--color-border)] hover:bg-[var(--color-surface-hover)] hover:border-[var(--color-primary)] transition-colors text-left ${
          isResolved ? 'opacity-70' : ''
        }`}
        data-testid={`dependency-card-${task.id}`}
      >
        {content}
      </button>
    );
  }

  return (
    <div
      className={`w-full flex items-center gap-3 p-3 rounded-lg border border-[var(--color-border)] ${
        isResolved ? 'opacity-70' : ''
      }`}
      data-testid={`dependency-card-${task.id}`}
    >
      {content}
    </div>
  );
}

// ============================================================================
// Status Icon Component
// ============================================================================

interface StatusIconProps {
  status: TaskStatus;
}

function StatusIcon({ status }: StatusIconProps) {
  switch (status) {
    case 'open':
      return <Circle className="w-4 h-4 text-blue-500" />;
    case 'in_progress':
      return <PlayCircle className="w-4 h-4 text-yellow-500" />;
    case 'blocked':
      return <AlertTriangle className="w-4 h-4 text-red-500" />;
    case 'review':
      return <Eye className="w-4 h-4 text-purple-500" />;
    case 'closed':
      return <CheckCircle2 className="w-4 h-4 text-green-500" />;
    case 'deferred':
      return <Clock className="w-4 h-4 text-gray-500" />;
    default:
      return <Circle className="w-4 h-4 text-gray-400" />;
  }
}

// ============================================================================
// Priority Badge Component
// ============================================================================

interface PriorityBadgeProps {
  priority: Priority;
}

function PriorityBadge({ priority }: PriorityBadgeProps) {
  const config = getPriorityConfig(priority);

  return (
    <span
      className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${config.className}`}
      title={config.label}
    >
      P{priority}
    </span>
  );
}

function getPriorityConfig(priority: Priority): { label: string; className: string } {
  switch (priority) {
    case 1:
      return {
        label: 'Critical',
        className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
      };
    case 2:
      return {
        label: 'High',
        className: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
      };
    case 3:
      return {
        label: 'Medium',
        className: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
      };
    case 4:
      return {
        label: 'Low',
        className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
      };
    case 5:
      return {
        label: 'Minimal',
        className: 'bg-gray-100 text-gray-600 dark:bg-gray-800/50 dark:text-gray-400',
      };
    default:
      return {
        label: `P${priority}`,
        className: 'bg-gray-100 text-gray-600 dark:bg-gray-800/50 dark:text-gray-400',
      };
  }
}

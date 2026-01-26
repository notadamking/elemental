/**
 * MobileWorkflowCard - Card-based workflow display for mobile devices (TB148)
 *
 * A touch-friendly workflow card designed for mobile list views.
 * Shows key workflow information in a compact, readable format.
 *
 * Features:
 * - Minimum 44px touch target
 * - Status badge
 * - Ephemeral indicator
 * - Truncated title
 */

import {
  GitBranch,
  Clock,
  Play,
  CheckCircle2,
  AlertTriangle,
  Ban,
} from 'lucide-react';

interface Workflow {
  id: string;
  type: 'workflow';
  title: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  ephemeral: boolean;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

interface MobileWorkflowCardProps {
  workflow: Workflow;
  isSelected: boolean;
  onClick: () => void;
}

const STATUS_CONFIG: Record<
  string,
  { label: string; icon: React.ReactNode; color: string }
> = {
  pending: {
    label: 'Pending',
    icon: <Clock className="w-3 h-3" />,
    color: 'bg-gray-100 text-gray-700 dark:bg-gray-800/50 dark:text-gray-300',
  },
  running: {
    label: 'Running',
    icon: <Play className="w-3 h-3" />,
    color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  },
  completed: {
    label: 'Completed',
    icon: <CheckCircle2 className="w-3 h-3" />,
    color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  },
  failed: {
    label: 'Failed',
    icon: <AlertTriangle className="w-3 h-3" />,
    color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  },
  cancelled: {
    label: 'Cancelled',
    icon: <Ban className="w-3 h-3" />,
    color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  },
};

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
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function MobileWorkflowCard({
  workflow,
  isSelected,
  onClick,
}: MobileWorkflowCardProps) {
  const statusConfig = STATUS_CONFIG[workflow.status] || STATUS_CONFIG.pending;

  return (
    <div
      className={`
        flex gap-3 p-4
        bg-[var(--color-surface)] border-b border-[var(--color-border)]
        cursor-pointer transition-colors duration-150
        active:bg-[var(--color-surface-hover)]
        ${isSelected ? 'bg-purple-50 dark:bg-purple-900/20' : ''}
      `}
      onClick={onClick}
      data-testid={`mobile-workflow-card-${workflow.id}`}
    >
      {/* Icon */}
      <div className="flex-shrink-0 mt-0.5">
        <GitBranch className="w-5 h-5 text-purple-500" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Title */}
        <div
          className="font-medium text-[var(--color-text)] line-clamp-2 mb-1"
          data-testid={`mobile-workflow-title-${workflow.id}`}
        >
          {workflow.title}
        </div>

        {/* ID and time */}
        <div className="flex items-center gap-2 flex-wrap mb-2">
          <span className="text-xs text-[var(--color-text-muted)] font-mono">
            {workflow.id}
          </span>
          <span className="text-xs text-[var(--color-text-muted)]">
            · {formatRelativeTime(workflow.updatedAt)}
          </span>
        </div>

        {/* Status, ephemeral, and tags */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Status badge */}
          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-xs font-medium rounded ${statusConfig.color}`}>
            {statusConfig.icon}
            {statusConfig.label}
          </span>

          {/* Ephemeral badge */}
          {workflow.ephemeral && (
            <span className="px-1.5 py-0.5 text-xs bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300 rounded">
              Ephemeral
            </span>
          )}

          {/* Tags (limited) */}
          {workflow.tags && workflow.tags.length > 0 && (
            <>
              {workflow.tags.slice(0, 2).map((tag) => (
                <span
                  key={tag}
                  className="px-1.5 py-0.5 text-xs bg-[var(--color-surface-hover)] text-[var(--color-text-secondary)] rounded truncate max-w-20"
                >
                  {tag}
                </span>
              ))}
              {workflow.tags.length > 2 && (
                <span className="text-xs text-[var(--color-text-muted)]">
                  +{workflow.tags.length - 2}
                </span>
              )}
            </>
          )}
        </div>
      </div>

      {/* Chevron indicator */}
      <div className="flex-shrink-0 self-center text-[var(--color-text-tertiary)]">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </div>
  );
}

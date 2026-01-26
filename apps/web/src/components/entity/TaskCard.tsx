import * as React from 'react';
import * as Tooltip from '@radix-ui/react-tooltip';
import { Paperclip, Link2, GitBranch } from 'lucide-react';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import type { Task } from './types';

/**
 * TaskCard Component
 *
 * Displays a task in a card format with consistent styling using design tokens.
 * Features:
 * - Priority badge with color-coded variants
 * - Task type indicator with subtle color coding
 * - Assignee display
 * - Tags with overflow handling
 * - Timestamps in muted text
 * - TB83: Description preview (2 lines, truncated)
 * - TB83: Attachment count badge
 * - TB83: Dependency count indicators (Blocks N / Blocked by N)
 * - TB83: Hover tooltip for full description
 */

export interface TaskCardProps {
  task: Task;
  isSelected?: boolean;
  onClick?: () => void;
  className?: string;
  /** Show the element ID below the title */
  showId?: boolean;
  /** Show creation timestamp */
  showTimestamp?: boolean;
  /** Show description preview (TB83) */
  showDescription?: boolean;
  /** Show dependency/attachment counts (TB83) */
  showCounts?: boolean;
}

const PRIORITY_CONFIG: Record<number, { label: string; variant: 'error' | 'warning' | 'primary' | 'default' | 'outline' }> = {
  1: { label: 'Critical', variant: 'error' },
  2: { label: 'High', variant: 'warning' },
  3: { label: 'Medium', variant: 'primary' },
  4: { label: 'Low', variant: 'default' },
  5: { label: 'Trivial', variant: 'outline' },
};

const TASK_TYPE_STYLES: Record<string, string> = {
  bug: 'border-l-4 border-l-[var(--color-error-400)]',
  feature: 'border-l-4 border-l-[var(--color-accent-400)]',
  task: 'border-l-4 border-l-[var(--color-primary-400)]',
  chore: 'border-l-4 border-l-[var(--color-neutral-400)]',
};

/**
 * Truncate text to a specified number of lines
 */
function truncateToLines(text: string | undefined, maxLines: number): { truncated: string; isTruncated: boolean } {
  if (!text) return { truncated: '', isTruncated: false };
  const lines = text.split('\n').slice(0, maxLines);
  const truncated = lines.join('\n');
  // Check if we truncated either by line count or if any line was very long
  const isTruncated = text.split('\n').length > maxLines || truncated.length < text.length;
  // Also truncate if total length exceeds ~150 chars for 2 lines
  if (truncated.length > 150) {
    return { truncated: truncated.slice(0, 147) + '...', isTruncated: true };
  }
  return { truncated, isTruncated };
}

export const TaskCard = React.forwardRef<HTMLDivElement, TaskCardProps>(
  (
    {
      task,
      isSelected = false,
      onClick,
      className = '',
      showId = true,
      showTimestamp = false,
      showDescription = true,
      showCounts = true,
    },
    ref
  ) => {
    const priority = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG[3];
    const typeStyle = TASK_TYPE_STYLES[task.taskType] || TASK_TYPE_STYLES.task;

    // TB83: Prepare description preview
    const { truncated: descPreview, isTruncated: hasMoreDescription } = truncateToLines(task.description, 2);
    const hasDescription = !!task.description && task.description.trim().length > 0;

    // TB83: Check for counts
    const attachmentCount = task._attachmentCount || 0;
    const blocksCount = task._blocksCount || 0;
    const blockedByCount = task._blockedByCount || 0;
    const hasCounts = attachmentCount > 0 || blocksCount > 0 || blockedByCount > 0;

    // Render description preview with optional tooltip
    const renderDescriptionPreview = () => {
      if (!showDescription || !hasDescription) return null;

      const previewElement = (
        <p
          className="mt-2 text-xs text-[var(--color-text-secondary)] line-clamp-2 leading-relaxed"
          data-testid="task-description-preview"
        >
          {descPreview}
        </p>
      );

      // If there's more content, wrap in tooltip
      if (hasMoreDescription && task.description) {
        return (
          <Tooltip.Provider delayDuration={400}>
            <Tooltip.Root>
              <Tooltip.Trigger asChild>
                {previewElement}
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Content
                  className="max-w-sm p-3 text-xs text-[var(--color-text)] bg-[var(--color-surface-elevated)] border border-[var(--color-border)] rounded-lg shadow-lg z-50"
                  sideOffset={5}
                  data-testid="task-description-tooltip"
                >
                  <p className="whitespace-pre-wrap">{task.description.slice(0, 500)}{task.description.length > 500 ? '...' : ''}</p>
                  <Tooltip.Arrow className="fill-[var(--color-surface-elevated)]" />
                </Tooltip.Content>
              </Tooltip.Portal>
            </Tooltip.Root>
          </Tooltip.Provider>
        );
      }

      return previewElement;
    };

    return (
      <Card
        ref={ref}
        variant="default"
        clickable={!!onClick}
        onClick={onClick}
        className={[
          typeStyle,
          isSelected
            ? 'ring-2 ring-[var(--color-primary)] border-[var(--color-primary)]'
            : '',
          'transition-all duration-[var(--duration-fast)]',
          className,
        ].filter(Boolean).join(' ')}
        data-testid={`task-card-${task.id}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h4 className="font-medium text-[var(--color-text)] truncate leading-tight">
              {task.title}
            </h4>
            {showId && (
              <p className="text-[11px] text-[var(--color-text-tertiary)] mt-1 font-mono truncate">
                {task.id}
              </p>
            )}
          </div>
          <Badge variant={priority.variant} size="sm">
            {priority.label}
          </Badge>
        </div>

        {/* TB83: Description preview */}
        {renderDescriptionPreview()}

        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <Badge variant="outline" size="sm" className="capitalize">
            {task.taskType}
          </Badge>
          {task.assignee && (
            <span className="text-xs text-[var(--color-text-secondary)]">
              Assigned: <span className="text-[var(--color-text)]">{task.assignee}</span>
            </span>
          )}
        </div>

        {/* TB83: Dependency and attachment counts */}
        {showCounts && hasCounts && (
          <div className="mt-2 flex items-center gap-3 flex-wrap" data-testid="task-counts">
            {attachmentCount > 0 && (
              <span
                className="inline-flex items-center gap-1 text-[11px] text-[var(--color-text-secondary)]"
                data-testid="task-attachment-count"
              >
                <Paperclip className="w-3 h-3" />
                {attachmentCount}
              </span>
            )}
            {blocksCount > 0 && (
              <span
                className="inline-flex items-center gap-1 text-[11px] text-[var(--color-warning)]"
                data-testid="task-blocks-count"
                title={`Blocks ${blocksCount} task${blocksCount > 1 ? 's' : ''}`}
              >
                <GitBranch className="w-3 h-3" />
                Blocks {blocksCount}
              </span>
            )}
            {blockedByCount > 0 && (
              <span
                className="inline-flex items-center gap-1 text-[11px] text-[var(--color-error)]"
                data-testid="task-blocked-by-count"
                title={`Blocked by ${blockedByCount} task${blockedByCount > 1 ? 's' : ''}`}
              >
                <Link2 className="w-3 h-3" />
                Blocked by {blockedByCount}
              </span>
            )}
          </div>
        )}

        {task.tags && task.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {task.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="px-1.5 py-0.5 text-[10px] bg-[var(--color-surface-active)] text-[var(--color-text-secondary)] rounded"
              >
                {tag}
              </span>
            ))}
            {task.tags.length > 3 && (
              <span className="text-[10px] text-[var(--color-text-tertiary)]">
                +{task.tags.length - 3}
              </span>
            )}
          </div>
        )}

        {showTimestamp && (
          <div className="mt-3 text-[11px] text-[var(--color-text-tertiary)]">
            Created {new Date(task.createdAt).toLocaleDateString()}
          </div>
        )}
      </Card>
    );
  }
);

TaskCard.displayName = 'TaskCard';

export default TaskCard;

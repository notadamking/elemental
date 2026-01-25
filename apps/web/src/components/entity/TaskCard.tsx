import * as React from 'react';
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

export const TaskCard = React.forwardRef<HTMLDivElement, TaskCardProps>(
  (
    {
      task,
      isSelected = false,
      onClick,
      className = '',
      showId = true,
      showTimestamp = false,
    },
    ref
  ) => {
    const priority = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG[3];
    const typeStyle = TASK_TYPE_STYLES[task.taskType] || TASK_TYPE_STYLES.task;

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

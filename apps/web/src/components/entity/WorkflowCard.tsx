import * as React from 'react';
import { ChevronRight, Workflow, Flame } from 'lucide-react';
import { Card, Badge } from '@elemental/ui';
import type { Workflow as WorkflowType } from './types';

/**
 * WorkflowCard Component
 *
 * Displays a workflow in a card format with consistent styling.
 * Features:
 * - Status badge with color-coded variants
 * - Ephemeral indicator
 * - Progress indicator (if progress data provided)
 * - Timestamps in muted text
 */

export interface WorkflowCardProps {
  workflow: WorkflowType;
  isSelected?: boolean;
  onClick?: () => void;
  className?: string;
  /** Show the element ID below the title */
  showId?: boolean;
  /** Progress percentage (0-100) */
  progress?: number;
  /** Optional slot for additional content below title */
  children?: React.ReactNode;
}

const STATUS_CONFIG: Record<string, {
  label: string;
  variant: 'default' | 'primary' | 'success' | 'warning' | 'error';
}> = {
  created: { label: 'Created', variant: 'default' },
  active: { label: 'Active', variant: 'primary' },
  completed: { label: 'Completed', variant: 'success' },
  failed: { label: 'Failed', variant: 'error' },
  cancelled: { label: 'Cancelled', variant: 'warning' },
};

export const WorkflowCard = React.forwardRef<HTMLDivElement, WorkflowCardProps>(
  (
    {
      workflow,
      isSelected = false,
      onClick,
      className = '',
      showId = false,
      progress,
      children,
    },
    ref
  ) => {
    const config = STATUS_CONFIG[workflow.status] || STATUS_CONFIG.created;
    const isEphemeral = workflow.ephemeral === true;

    return (
      <Card
        ref={ref}
        variant="default"
        clickable={!!onClick}
        onClick={onClick}
        className={[
          isSelected
            ? 'ring-2 ring-[var(--color-primary)] border-[var(--color-primary)] bg-[var(--color-surface-selected)]'
            : '',
          isEphemeral ? 'border-dashed' : '',
          'transition-all duration-[var(--duration-fast)]',
          className,
        ].filter(Boolean).join(' ')}
        data-testid={`workflow-card-${workflow.id}`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
              isEphemeral
                ? 'bg-[var(--color-warning-bg)]'
                : 'bg-[var(--color-accent-100)] dark:bg-[var(--color-accent-900)]'
            }`}>
              {isEphemeral ? (
                <Flame className="w-4 h-4 text-[var(--color-warning)]" />
              ) : (
                <Workflow className="w-4 h-4 text-[var(--color-accent-600)] dark:text-[var(--color-accent-400)]" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h3
                data-testid="workflow-card-title"
                className="font-medium text-[var(--color-text)] truncate"
              >
                {workflow.title}
              </h3>
              {showId && (
                <p className="text-[11px] text-[var(--color-text-tertiary)] font-mono truncate mt-0.5">
                  {workflow.id}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {isEphemeral && (
              <Badge variant="warning" size="sm">
                Ephemeral
              </Badge>
            )}
            <Badge variant={config.variant} size="sm">
              {config.label}
            </Badge>
            <ChevronRight className="w-4 h-4 text-[var(--color-text-tertiary)]" />
          </div>
        </div>

        {/* Progress bar */}
        {typeof progress === 'number' && (
          <div className="mt-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-[var(--color-text-secondary)]">Progress</span>
              <span className="text-xs font-medium text-[var(--color-text)]">{progress}%</span>
            </div>
            <div className="w-full h-1.5 bg-[var(--color-surface-active)] rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  workflow.status === 'failed'
                    ? 'bg-[var(--color-error)]'
                    : workflow.status === 'completed'
                    ? 'bg-[var(--color-success)]'
                    : 'bg-[var(--color-primary)]'
                }`}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Playbook reference */}
        {workflow.playbookId && (
          <div className="mt-2 text-xs text-[var(--color-text-secondary)]">
            From playbook: <span className="font-mono text-[var(--color-text-tertiary)]">{workflow.playbookId}</span>
          </div>
        )}

        {/* Additional content slot */}
        {children}

        {/* Tags */}
        {workflow.tags && workflow.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {workflow.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="px-1.5 py-0.5 text-[10px] bg-[var(--color-surface-active)] text-[var(--color-text-secondary)] rounded"
              >
                {tag}
              </span>
            ))}
            {workflow.tags.length > 3 && (
              <span className="text-[10px] text-[var(--color-text-tertiary)]">
                +{workflow.tags.length - 3}
              </span>
            )}
          </div>
        )}
      </Card>
    );
  }
);

WorkflowCard.displayName = 'WorkflowCard';

export default WorkflowCard;

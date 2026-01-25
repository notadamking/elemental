import * as React from 'react';
import {
  FileText,
  ListTodo,
  Users,
  MessageSquare,
  FolderOpen,
  Target,
  Workflow,
  Inbox,
  Search,
  Plus,
} from 'lucide-react';

/**
 * EmptyState Component
 *
 * A consistent empty state display for when lists or views have no data.
 * Features:
 * - Contextual icon based on element type
 * - Title and description
 * - Optional action button
 */

export interface EmptyStateProps {
  /** The type of element/context for appropriate icon */
  type?: 'tasks' | 'entities' | 'teams' | 'documents' | 'messages' | 'plans' | 'workflows' | 'inbox' | 'search' | 'generic';
  /** Main heading */
  title: string;
  /** Description text */
  description?: string;
  /** Custom icon override */
  icon?: React.ReactNode;
  /** Optional action button */
  action?: {
    label: string;
    onClick: () => void;
  };
  /** Additional class names */
  className?: string;
}

const TYPE_ICONS: Record<NonNullable<EmptyStateProps['type']>, typeof FileText> = {
  tasks: ListTodo,
  entities: Users,
  teams: Users,
  documents: FileText,
  messages: MessageSquare,
  plans: Target,
  workflows: Workflow,
  inbox: Inbox,
  search: Search,
  generic: FolderOpen,
};

export const EmptyState = React.forwardRef<HTMLDivElement, EmptyStateProps>(
  (
    {
      type = 'generic',
      title,
      description,
      icon,
      action,
      className = '',
    },
    ref
  ) => {
    const IconComponent = TYPE_ICONS[type];

    return (
      <div
        ref={ref}
        className={[
          'flex flex-col items-center justify-center',
          'px-6 py-12',
          'text-center',
          className,
        ].join(' ')}
        data-testid="empty-state"
      >
        {/* Icon */}
        <div className="w-16 h-16 rounded-full bg-[var(--color-surface-active)] flex items-center justify-center mb-4">
          {icon || <IconComponent className="w-8 h-8 text-[var(--color-text-tertiary)]" />}
        </div>

        {/* Title */}
        <h3 className="text-lg font-medium text-[var(--color-text)] mb-2">
          {title}
        </h3>

        {/* Description */}
        {description && (
          <p className="text-sm text-[var(--color-text-secondary)] max-w-sm mb-6">
            {description}
          </p>
        )}

        {/* Action Button */}
        {action && (
          <button
            onClick={action.onClick}
            className={[
              'inline-flex items-center gap-2',
              'px-4 py-2',
              'text-sm font-medium',
              'text-[var(--color-text-inverted)]',
              'bg-[var(--color-primary)]',
              'hover:bg-[var(--color-primary-hover)]',
              'active:bg-[var(--color-primary-active)]',
              'rounded-lg',
              'transition-colors duration-[var(--duration-fast)]',
              'focus:outline-none focus:ring-2 focus:ring-[var(--color-border-focus)] focus:ring-offset-2',
            ].join(' ')}
            data-testid="empty-state-action"
          >
            <Plus className="w-4 h-4" />
            {action.label}
          </button>
        )}
      </div>
    );
  }
);

EmptyState.displayName = 'EmptyState';

export default EmptyState;

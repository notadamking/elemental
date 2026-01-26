import * as React from 'react';
import { Bot, User, Server } from 'lucide-react';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import type { Entity } from './types';

/**
 * EntityCard Component
 *
 * Displays an entity (agent, human, or system) in a card format with consistent styling.
 * Features:
 * - Entity type icon and badge
 * - Active/inactive status indicator
 * - Tags with overflow handling
 * - Timestamps in muted text
 */

export interface EntityCardProps {
  entity: Entity;
  isSelected?: boolean;
  onClick?: () => void;
  className?: string;
  /** Show the element ID below the title */
  showId?: boolean;
  /** Show creation timestamp */
  showTimestamp?: boolean;
}

const ENTITY_TYPE_CONFIG: Record<string, {
  icon: typeof Bot;
  bgColor: string;
  textColor: string;
  variant: 'primary' | 'success' | 'warning' | 'default';
}> = {
  agent: {
    icon: Bot,
    bgColor: 'bg-[var(--color-primary-muted)]',
    textColor: 'text-[var(--color-primary-text)]',
    variant: 'primary',
  },
  human: {
    icon: User,
    bgColor: 'bg-[var(--color-success-bg)]',
    textColor: 'text-[var(--color-success-text)]',
    variant: 'success',
  },
  system: {
    icon: Server,
    bgColor: 'bg-[var(--color-warning-bg)]',
    textColor: 'text-[var(--color-warning-text)]',
    variant: 'warning',
  },
};

export const EntityCard = React.forwardRef<HTMLDivElement, EntityCardProps>(
  (
    {
      entity,
      isSelected = false,
      onClick,
      className = '',
      showId = true,
      showTimestamp = true,
    },
    ref
  ) => {
    const config = ENTITY_TYPE_CONFIG[entity.entityType] || ENTITY_TYPE_CONFIG.system;
    const Icon = config.icon;
    const isActive = entity.active !== false;

    return (
      <Card
        ref={ref}
        variant="default"
        clickable={!!onClick}
        onClick={onClick}
        className={[
          isSelected
            ? 'ring-2 ring-[var(--color-primary)] border-[var(--color-primary)]'
            : '',
          !isActive ? 'opacity-60' : '',
          'transition-all duration-[var(--duration-fast)]',
          className,
        ].filter(Boolean).join(' ')}
        data-testid={`entity-card-${entity.id}`}
      >
        <div className="flex items-start gap-3">
          {/* Avatar */}
          <div
            className={`w-10 h-10 rounded-full flex items-center justify-center ${config.bgColor} flex-shrink-0`}
            data-testid={`entity-avatar-${entity.id}`}
          >
            <Icon className={`w-5 h-5 ${config.textColor}`} />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-medium text-[var(--color-text)] truncate">
                {entity.name}
              </h3>
              {!isActive && (
                <Badge variant="outline" size="sm">
                  Inactive
                </Badge>
              )}
            </div>
            {showId && (
              <p className="text-[11px] text-[var(--color-text-tertiary)] font-mono truncate">
                {entity.id}
              </p>
            )}
          </div>

          {/* Type badge */}
          <Badge
            variant={config.variant}
            size="sm"
            className="capitalize flex-shrink-0"
            data-testid={`entity-type-badge-${entity.id}`}
          >
            {entity.entityType}
          </Badge>
        </div>

        {/* Tags */}
        {entity.tags && entity.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            {entity.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="px-1.5 py-0.5 text-[10px] bg-[var(--color-surface-active)] text-[var(--color-text-secondary)] rounded"
              >
                {tag}
              </span>
            ))}
            {entity.tags.length > 3 && (
              <span className="text-[10px] text-[var(--color-text-tertiary)]">
                +{entity.tags.length - 3}
              </span>
            )}
          </div>
        )}

        {/* Timestamp */}
        {showTimestamp && (
          <div className="mt-3 text-[11px] text-[var(--color-text-tertiary)]">
            Created {new Date(entity.createdAt).toLocaleDateString()}
          </div>
        )}
      </Card>
    );
  }
);

EntityCard.displayName = 'EntityCard';

export default EntityCard;

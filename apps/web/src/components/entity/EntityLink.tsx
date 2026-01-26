/**
 * EntityLink Component - TB104
 *
 * A clickable link that navigates to entity detail and shows a hover preview card.
 * Used throughout the app for entity references (assignees, senders, team members, etc.)
 */

import * as HoverCard from '@radix-ui/react-hover-card';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { Bot, User, Server, Loader2, ExternalLink, Clock } from 'lucide-react';
import { type ReactNode } from 'react';
import { type Entity } from './types';

interface EntityStats {
  totalTasks: number;
  openTasks: number;
  completedTasks: number;
  currentTask?: {
    id: string;
    title: string;
    status: string;
  };
}

interface EntityLinkProps {
  /**
   * Entity ID or name - if it starts with "el-", treated as ID, otherwise as name
   */
  entityRef: string;
  /**
   * Optional display text. If not provided, will show the entity name (once loaded)
   * or the entityRef as fallback.
   */
  children?: ReactNode;
  /**
   * Additional CSS classes for the link
   */
  className?: string;
  /**
   * Whether to show the hover preview card
   * @default true
   */
  showPreview?: boolean;
  /**
   * Icon to show before the name
   */
  showIcon?: boolean;
  /**
   * Data test ID for testing
   */
  'data-testid'?: string;
}

const ENTITY_TYPE_STYLES = {
  agent: {
    icon: Bot,
    bg: 'bg-purple-100',
    text: 'text-purple-700',
    darkBg: 'dark:bg-purple-900/30',
    darkText: 'dark:text-purple-300',
  },
  human: {
    icon: User,
    bg: 'bg-blue-100',
    text: 'text-blue-700',
    darkBg: 'dark:bg-blue-900/30',
    darkText: 'dark:text-blue-300',
  },
  system: {
    icon: Server,
    bg: 'bg-gray-100',
    text: 'text-gray-700',
    darkBg: 'dark:bg-gray-800/50',
    darkText: 'dark:text-gray-300',
  },
};

function useEntityByRef(entityRef: string | null) {
  const isId = entityRef?.startsWith('el-');

  return useQuery<Entity | null>({
    queryKey: ['entities', 'byRef', entityRef],
    queryFn: async () => {
      if (!entityRef) return null;

      if (isId) {
        // Fetch by ID
        const response = await fetch(`/api/entities/${entityRef}`);
        if (!response.ok) {
          if (response.status === 404) return null;
          throw new Error('Failed to fetch entity');
        }
        return response.json();
      } else {
        // Search by name
        const response = await fetch(`/api/entities?search=${encodeURIComponent(entityRef)}&limit=100`);
        if (!response.ok) throw new Error('Failed to fetch entity');
        const result: { items: Entity[] } = await response.json();
        // Find exact match (case-insensitive)
        const entity = result.items.find(
          (e) => e.name.toLowerCase() === entityRef.toLowerCase()
        );
        return entity ?? null;
      }
    },
    enabled: !!entityRef,
    staleTime: 30000, // Cache for 30 seconds
  });
}

function useEntityStats(entityId: string | null) {
  return useQuery<EntityStats>({
    queryKey: ['entities', entityId, 'stats'],
    queryFn: async () => {
      const response = await fetch(`/api/entities/${entityId}/stats`);
      if (!response.ok) throw new Error('Failed to fetch entity stats');
      return response.json();
    },
    enabled: !!entityId,
    staleTime: 30000,
  });
}

export function EntityLink({
  entityRef,
  children,
  className = '',
  showPreview = true,
  showIcon = false,
  'data-testid': testId,
}: EntityLinkProps) {
  const { data: entity, isLoading: entityLoading } = useEntityByRef(entityRef);
  const { data: stats, isLoading: statsLoading } = useEntityStats(showPreview ? entity?.id ?? null : null);
  const navigate = useNavigate();

  const displayName = children ?? entity?.name ?? entityRef;
  const styles = entity ? ENTITY_TYPE_STYLES[entity.entityType] || ENTITY_TYPE_STYLES.system : ENTITY_TYPE_STYLES.system;
  const Icon = styles.icon;

  // Build the navigation target
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (entity) {
      navigate({ to: '/entities', search: { selected: entity.id, name: undefined, page: 1, limit: 25 } });
    } else {
      // Fallback: search by name
      navigate({ to: '/entities', search: { selected: undefined, name: entityRef, page: 1, limit: 25 } });
    }
  };

  const linkContent = (
    <button
      onClick={handleClick}
      className={`inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 hover:underline cursor-pointer font-medium ${className}`}
      data-testid={testId || `entity-link-${entityRef}`}
    >
      {showIcon && <Icon className={`w-3.5 h-3.5 ${styles.text} ${styles.darkText}`} />}
      {displayName}
    </button>
  );

  if (!showPreview) {
    return linkContent;
  }

  return (
    <HoverCard.Root openDelay={400} closeDelay={200}>
      <HoverCard.Trigger asChild>
        {linkContent}
      </HoverCard.Trigger>
      <HoverCard.Portal>
        <HoverCard.Content
          className="w-72 p-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50
                     animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out
                     data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95
                     data-[side=top]:slide-in-from-bottom-2
                     data-[side=bottom]:slide-in-from-top-2"
          sideOffset={5}
          data-testid={`entity-preview-${entityRef}`}
        >
          {entityLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
            </div>
          ) : entity ? (
            <EntityPreviewContent entity={entity} stats={stats} statsLoading={statsLoading} />
          ) : (
            <div className="text-sm text-gray-500 dark:text-gray-400">
              Entity not found: {entityRef}
            </div>
          )}
          <HoverCard.Arrow className="fill-white dark:fill-gray-900" />
        </HoverCard.Content>
      </HoverCard.Portal>
    </HoverCard.Root>
  );
}

function EntityPreviewContent({
  entity,
  stats,
  statsLoading,
}: {
  entity: Entity;
  stats?: EntityStats;
  statsLoading: boolean;
}) {
  const styles = ENTITY_TYPE_STYLES[entity.entityType] || ENTITY_TYPE_STYLES.system;
  const Icon = styles.icon;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-lg ${styles.bg} ${styles.darkBg}`}>
          <Icon className={`w-5 h-5 ${styles.text} ${styles.darkText}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-gray-900 dark:text-gray-100 truncate">
            {entity.name}
          </div>
          <div className={`text-xs ${styles.text} ${styles.darkText} capitalize`}>
            {entity.entityType}
          </div>
        </div>
      </div>

      {/* Stats */}
      {statsLoading ? (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="w-3 h-3 animate-spin" />
          Loading stats...
        </div>
      ) : stats ? (
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="p-2 bg-gray-50 dark:bg-gray-800 rounded">
            <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {stats.openTasks}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Open</div>
          </div>
          <div className="p-2 bg-gray-50 dark:bg-gray-800 rounded">
            <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {stats.completedTasks}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Done</div>
          </div>
          <div className="p-2 bg-gray-50 dark:bg-gray-800 rounded">
            <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {stats.totalTasks}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Total</div>
          </div>
        </div>
      ) : null}

      {/* Current Task */}
      {stats?.currentTask && (
        <div className="p-2 bg-blue-50 dark:bg-blue-900/30 rounded border border-blue-100 dark:border-blue-800">
          <div className="flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 mb-1">
            <Clock className="w-3 h-3" />
            Currently working on
          </div>
          <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
            {stats.currentTask.title}
          </div>
        </div>
      )}

      {/* Tags */}
      {entity.tags && entity.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {entity.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="px-1.5 py-0.5 text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded"
            >
              {tag}
            </span>
          ))}
          {entity.tags.length > 3 && (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              +{entity.tags.length - 3} more
            </span>
          )}
        </div>
      )}

      {/* Footer link */}
      <Link
        to="/entities"
        search={{ selected: entity.id, name: undefined, page: 1, limit: 25 }}
        className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
        data-testid={`entity-preview-link-${entity.id}`}
      >
        View full profile
        <ExternalLink className="w-3 h-3" />
      </Link>
    </div>
  );
}

// Export a simple version for contexts where hover preview isn't needed
export function EntityName({
  entityRef,
  children,
  className = '',
  showIcon = false,
  'data-testid': testId,
}: Omit<EntityLinkProps, 'showPreview'>) {
  return (
    <EntityLink
      entityRef={entityRef}
      className={className}
      showPreview={false}
      showIcon={showIcon}
      data-testid={testId}
    >
      {children}
    </EntityLink>
  );
}

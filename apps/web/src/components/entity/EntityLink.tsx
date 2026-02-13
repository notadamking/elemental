/**
 * EntityLink wrapper for apps/web
 *
 * Re-exports the shared EntityLink from @elemental/ui with apps/web-specific
 * defaults: hover card preview enabled, navigation via TanStack Router, and
 * a "View full profile" link that uses the router's Link component.
 */

import { Link, useNavigate } from '@tanstack/react-router';
import { ExternalLink } from 'lucide-react';
import {
  EntityLink as BaseEntityLink,
  EntityName,
  type EntityStats,
} from '@elemental/ui/domain';
import type { Entity } from '@elemental/ui/domain';
import type { ReactNode } from 'react';

// Re-export EntityName and types unchanged
export { EntityName, type EntityStats };

interface EntityLinkProps {
  entityRef: string;
  children?: ReactNode;
  className?: string;
  /**
   * Whether to show the hover preview card.
   * @default true (apps/web default -- full-featured)
   */
  showPreview?: boolean;
  /**
   * Whether to show task stats in the hover preview card.
   * @default true
   */
  showStats?: boolean;
  showIcon?: boolean;
  'data-testid'?: string;
}

export function EntityLink({
  entityRef,
  children,
  className = '',
  showPreview = true,
  showStats = true,
  showIcon = false,
  'data-testid': testId,
}: EntityLinkProps) {
  const navigate = useNavigate();

  const handleNavigate = (entity: Entity | null, ref: string) => {
    if (entity) {
      navigate({ to: '/entities', search: { selected: entity.id, name: undefined, page: 1, limit: 25 } });
    } else {
      navigate({ to: '/entities', search: { selected: undefined, name: ref, page: 1, limit: 25 } });
    }
  };

  const renderProfileLink = showPreview
    ? (entity: Entity) => (
        <Link
          to="/entities"
          search={{ selected: entity.id, name: undefined, page: 1, limit: 25 }}
          className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
          data-testid={`entity-preview-link-${entity.id}`}
        >
          View full profile
          <ExternalLink className="w-3 h-3" />
        </Link>
      )
    : undefined;

  return (
    <BaseEntityLink
      entityRef={entityRef}
      className={className}
      showHoverCard={showPreview}
      showStats={showStats}
      showIcon={showIcon}
      navigable={showPreview}
      onNavigate={handleNavigate}
      renderProfileLink={renderProfileLink}
      data-testid={testId}
    >
      {children}
    </BaseEntityLink>
  );
}

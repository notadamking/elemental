/**
 * MobileEntityCard - Card-based entity display for mobile devices
 *
 * A touch-friendly entity card designed for mobile list views.
 * Shows key entity information in a compact, readable format.
 *
 * Features:
 * - Minimum 44px touch target
 * - Type icon and badge
 * - Name and ID display
 * - Active/inactive status
 * - Search highlighting support
 */

import { useMemo } from 'react';
import { Bot, User, Server } from 'lucide-react';
import type { Entity } from './types';

interface MobileEntityCardProps {
  entity: Entity;
  isSelected: boolean;
  onClick: () => void;
  searchQuery?: string;
}

const ENTITY_TYPE_STYLES: Record<string, { bg: string; text: string; icon: typeof Bot }> = {
  agent: { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-700 dark:text-purple-300', icon: Bot },
  human: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-300', icon: User },
  system: { bg: 'bg-gray-100 dark:bg-gray-800/50', text: 'text-gray-700 dark:text-gray-300', icon: Server },
};

/**
 * Fuzzy search function that matches query characters in sequence within the name.
 */
function fuzzySearch(name: string, query: string): { matched: boolean; indices: number[] } | null {
  if (!query) return { matched: true, indices: [] };

  const lowerName = name.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const indices: number[] = [];
  let queryIdx = 0;

  for (let i = 0; i < lowerName.length && queryIdx < lowerQuery.length; i++) {
    if (lowerName[i] === lowerQuery[queryIdx]) {
      indices.push(i);
      queryIdx++;
    }
  }

  if (queryIdx === lowerQuery.length) {
    return { matched: true, indices };
  }

  return null;
}

/**
 * Highlights matched characters in a name based on match indices.
 */
function highlightMatches(name: string, indices: number[]): React.ReactNode {
  if (indices.length === 0) {
    return <>{name}</>;
  }

  const result: React.ReactNode[] = [];
  const indexSet = new Set(indices);
  let lastIndex = 0;

  for (let i = 0; i < name.length; i++) {
    if (indexSet.has(i)) {
      if (i > lastIndex) {
        result.push(<span key={`text-${lastIndex}`}>{name.slice(lastIndex, i)}</span>);
      }
      result.push(
        <mark key={`match-${i}`} className="bg-yellow-200 text-gray-900 dark:bg-yellow-700 dark:text-white rounded-sm px-0.5">
          {name[i]}
        </mark>
      );
      lastIndex = i + 1;
    }
  }

  if (lastIndex < name.length) {
    result.push(<span key={`text-${lastIndex}`}>{name.slice(lastIndex)}</span>);
  }

  return <>{result}</>;
}

export function MobileEntityCard({
  entity,
  isSelected,
  onClick,
  searchQuery,
}: MobileEntityCardProps) {
  const styles = ENTITY_TYPE_STYLES[entity.entityType] || ENTITY_TYPE_STYLES.system;
  const Icon = styles.icon;
  const isActive = entity.active !== false;

  // Compute highlighted name based on search query
  const highlightedName = useMemo(() => {
    if (!searchQuery) return entity.name;
    const searchResult = fuzzySearch(entity.name, searchQuery);
    if (searchResult && searchResult.indices.length > 0) {
      return highlightMatches(entity.name, searchResult.indices);
    }
    return entity.name;
  }, [entity.name, searchQuery]);

  return (
    <div
      className={`
        relative flex gap-3 p-3 border-b border-[var(--color-border)]
        bg-[var(--color-surface)] cursor-pointer transition-colors duration-150
        active:bg-[var(--color-surface-hover)]
        ${isSelected ? 'bg-blue-50 dark:bg-blue-900/20' : ''}
        ${!isActive ? 'opacity-60' : ''}
      `}
      onClick={onClick}
      data-testid={`mobile-entity-card-${entity.id}`}
    >
      {/* Icon */}
      <div
        className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${styles.bg}`}
      >
        <Icon className={`w-5 h-5 ${styles.text}`} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Name and inactive badge */}
        <div className="flex items-center gap-2">
          <div
            className="font-medium text-[var(--color-text)] truncate"
            data-testid={`mobile-entity-name-${entity.id}`}
          >
            {highlightedName}
          </div>
          {!isActive && (
            <span className="px-1.5 py-0.5 text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 rounded flex-shrink-0">
              Inactive
            </span>
          )}
        </div>

        {/* ID */}
        <div className="text-xs text-[var(--color-text-muted)] font-mono truncate mb-1.5">
          {entity.id}
        </div>

        {/* Type and tags row */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Entity type badge */}
          <span className={`px-1.5 py-0.5 text-xs font-medium rounded ${styles.bg} ${styles.text}`}>
            {entity.entityType}
          </span>

          {/* Tags (first 2) */}
          {entity.tags && entity.tags.slice(0, 2).map((tag) => (
            <span
              key={tag}
              className="px-1.5 py-0.5 text-xs bg-[var(--color-surface-hover)] text-[var(--color-text-secondary)] rounded truncate max-w-20"
            >
              {tag}
            </span>
          ))}
          {entity.tags && entity.tags.length > 2 && (
            <span className="text-xs text-[var(--color-text-muted)]">
              +{entity.tags.length - 2}
            </span>
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

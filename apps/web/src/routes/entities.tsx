/**
 * Entities Page
 *
 * Lists all entities with filtering by type and search functionality.
 */

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Bot, User, Server, Users } from 'lucide-react';

interface Entity {
  id: string;
  type: 'entity';
  name: string;
  entityType: 'agent' | 'human' | 'system';
  publicKey?: string;
  active?: boolean;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

type EntityTypeFilter = 'all' | 'agent' | 'human' | 'system';

function useEntities() {
  return useQuery<Entity[]>({
    queryKey: ['entities'],
    queryFn: async () => {
      const response = await fetch('/api/entities');
      if (!response.ok) throw new Error('Failed to fetch entities');
      return response.json();
    },
  });
}

const ENTITY_TYPE_STYLES: Record<string, { bg: string; text: string; icon: typeof Bot }> = {
  agent: { bg: 'bg-purple-100', text: 'text-purple-800', icon: Bot },
  human: { bg: 'bg-blue-100', text: 'text-blue-800', icon: User },
  system: { bg: 'bg-gray-100', text: 'text-gray-800', icon: Server },
};

const FILTER_TABS: { value: EntityTypeFilter; label: string; icon: typeof Users }[] = [
  { value: 'all', label: 'All', icon: Users },
  { value: 'agent', label: 'Agents', icon: Bot },
  { value: 'human', label: 'Humans', icon: User },
  { value: 'system', label: 'Systems', icon: Server },
];

function EntityCard({ entity }: { entity: Entity }) {
  const styles = ENTITY_TYPE_STYLES[entity.entityType] || ENTITY_TYPE_STYLES.system;
  const Icon = styles.icon;
  const isActive = entity.active !== false; // Default to active if not specified

  return (
    <div
      className={`bg-white rounded-lg border border-gray-200 p-4 hover:border-gray-300 transition-colors ${
        !isActive ? 'opacity-60' : ''
      }`}
      data-testid={`entity-card-${entity.id}`}
    >
      {/* Header with avatar and type badge */}
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div
          className={`w-10 h-10 rounded-full flex items-center justify-center ${styles.bg}`}
          data-testid={`entity-avatar-${entity.id}`}
        >
          <Icon className={`w-5 h-5 ${styles.text}`} />
        </div>

        {/* Name and ID */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-gray-900 truncate">{entity.name}</h3>
            {!isActive && (
              <span className="px-1.5 py-0.5 text-xs font-medium bg-gray-100 text-gray-600 rounded">
                Inactive
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 font-mono truncate">{entity.id}</p>
        </div>

        {/* Type badge */}
        <span
          className={`px-2 py-1 text-xs font-medium rounded ${styles.bg} ${styles.text}`}
          data-testid={`entity-type-badge-${entity.id}`}
        >
          {entity.entityType}
        </span>
      </div>

      {/* Tags */}
      {entity.tags && entity.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {entity.tags.slice(0, 3).map((tag) => (
            <span key={tag} className="px-1.5 py-0.5 text-xs bg-gray-100 text-gray-600 rounded">
              {tag}
            </span>
          ))}
          {entity.tags.length > 3 && (
            <span className="text-xs text-gray-500">+{entity.tags.length - 3}</span>
          )}
        </div>
      )}

      {/* Created date */}
      <div className="mt-3 text-xs text-gray-400">
        Created {new Date(entity.createdAt).toLocaleDateString()}
      </div>
    </div>
  );
}

function FilterTabs({
  selected,
  onChange,
  counts,
}: {
  selected: EntityTypeFilter;
  onChange: (value: EntityTypeFilter) => void;
  counts: Record<EntityTypeFilter, number>;
}) {
  return (
    <div className="flex gap-1 p-1 bg-gray-100 rounded-lg" data-testid="entity-filter-tabs">
      {FILTER_TABS.map((tab) => {
        const Icon = tab.icon;
        const isSelected = selected === tab.value;
        return (
          <button
            key={tab.value}
            onClick={() => onChange(tab.value)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              isSelected
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            }`}
            data-testid={`entity-filter-${tab.value}`}
          >
            <Icon className="w-4 h-4" />
            <span>{tab.label}</span>
            <span
              className={`ml-1 px-1.5 py-0.5 text-xs rounded-full ${
                isSelected ? 'bg-gray-100 text-gray-600' : 'bg-gray-200 text-gray-500'
              }`}
            >
              {counts[tab.value]}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function SearchBox({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="relative" data-testid="entity-search">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search entities..."
        className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        data-testid="entity-search-input"
      />
    </div>
  );
}

export function EntitiesPage() {
  const entities = useEntities();
  const [typeFilter, setTypeFilter] = useState<EntityTypeFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Compute counts for each filter tab
  const counts = useMemo(() => {
    const data = entities.data || [];
    return {
      all: data.length,
      agent: data.filter((e) => e.entityType === 'agent').length,
      human: data.filter((e) => e.entityType === 'human').length,
      system: data.filter((e) => e.entityType === 'system').length,
    };
  }, [entities.data]);

  // Filter entities based on type and search
  const filteredEntities = useMemo(() => {
    let result = entities.data || [];

    // Filter by type
    if (typeFilter !== 'all') {
      result = result.filter((e) => e.entityType === typeFilter);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (e) =>
          e.name.toLowerCase().includes(query) ||
          e.id.toLowerCase().includes(query) ||
          e.tags.some((tag) => tag.toLowerCase().includes(query))
      );
    }

    return result;
  }, [entities.data, typeFilter, searchQuery]);

  return (
    <div className="h-full flex flex-col" data-testid="entities-page">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-medium text-gray-900">Entities</h2>
        <p className="text-sm text-gray-500">
          {filteredEntities.length} of {entities.data?.length || 0} entities
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <FilterTabs selected={typeFilter} onChange={setTypeFilter} counts={counts} />
        <div className="sm:ml-auto sm:w-64">
          <SearchBox value={searchQuery} onChange={setSearchQuery} />
        </div>
      </div>

      {/* Loading state */}
      {entities.isLoading && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-gray-500" data-testid="entities-loading">
            Loading entities...
          </div>
        </div>
      )}

      {/* Error state */}
      {entities.isError && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-red-600" data-testid="entities-error">
            Failed to load entities
          </div>
        </div>
      )}

      {/* Empty state */}
      {entities.data && filteredEntities.length === 0 && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center" data-testid="entities-empty">
            {searchQuery || typeFilter !== 'all' ? (
              <>
                <p className="text-gray-500">No entities match your filters</p>
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setTypeFilter('all');
                  }}
                  className="mt-2 text-sm text-blue-600 hover:text-blue-700"
                  data-testid="clear-filters-button"
                >
                  Clear filters
                </button>
              </>
            ) : (
              <>
                <p className="text-gray-500">No entities registered</p>
                <p className="mt-1 text-sm text-gray-400">
                  Use <code className="bg-gray-100 px-1 rounded">el entity register</code> to add an entity
                </p>
              </>
            )}
          </div>
        </div>
      )}

      {/* Entity grid */}
      {entities.data && filteredEntities.length > 0 && (
        <div
          className="flex-1 overflow-auto"
          data-testid="entities-grid"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredEntities.map((entity) => (
              <EntityCard key={entity.id} entity={entity} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

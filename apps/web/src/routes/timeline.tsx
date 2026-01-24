/**
 * Timeline Lens
 *
 * Chronological view of all events in the system with filtering capabilities.
 * Shows what happened, when, and who did it.
 */

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

// Event types from the API spec
type EventType =
  | 'created'
  | 'updated'
  | 'closed'
  | 'reopened'
  | 'deleted'
  | 'dependency_added'
  | 'dependency_removed'
  | 'tag_added'
  | 'tag_removed'
  | 'member_added'
  | 'member_removed'
  | 'auto_blocked'
  | 'auto_unblocked';

interface Event {
  id: number;
  elementId: string;
  eventType: EventType;
  actor: string;
  oldValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  createdAt: string;
}

// Event filter state
interface EventFilterState {
  eventTypes: EventType[];
  actor: string;
  search: string;
}

// Available event type filters
const ALL_EVENT_TYPES: { value: EventType; label: string }[] = [
  { value: 'created', label: 'Created' },
  { value: 'updated', label: 'Updated' },
  { value: 'closed', label: 'Closed' },
  { value: 'reopened', label: 'Reopened' },
  { value: 'deleted', label: 'Deleted' },
  { value: 'dependency_added', label: 'Dep Added' },
  { value: 'dependency_removed', label: 'Dep Removed' },
  { value: 'tag_added', label: 'Tag Added' },
  { value: 'tag_removed', label: 'Tag Removed' },
  { value: 'member_added', label: 'Member Added' },
  { value: 'member_removed', label: 'Member Removed' },
  { value: 'auto_blocked', label: 'Auto Blocked' },
  { value: 'auto_unblocked', label: 'Auto Unblocked' },
];

// Event type color mapping
const EVENT_TYPE_COLORS: Record<EventType, { bg: string; text: string; border: string }> = {
  created: { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200' },
  updated: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  closed: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
  reopened: { bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-200' },
  deleted: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' },
  dependency_added: { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200' },
  dependency_removed: { bg: 'bg-pink-50', text: 'text-pink-700', border: 'border-pink-200' },
  tag_added: { bg: 'bg-cyan-50', text: 'text-cyan-700', border: 'border-cyan-200' },
  tag_removed: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
  member_added: { bg: 'bg-teal-50', text: 'text-teal-700', border: 'border-teal-200' },
  member_removed: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200' },
  auto_blocked: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-300' },
  auto_unblocked: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
};

// Display names for event types
const EVENT_TYPE_DISPLAY: Record<EventType, string> = {
  created: 'Created',
  updated: 'Updated',
  closed: 'Closed',
  reopened: 'Reopened',
  deleted: 'Deleted',
  dependency_added: 'Dependency Added',
  dependency_removed: 'Dependency Removed',
  tag_added: 'Tag Added',
  tag_removed: 'Tag Removed',
  member_added: 'Member Added',
  member_removed: 'Member Removed',
  auto_blocked: 'Auto Blocked',
  auto_unblocked: 'Auto Unblocked',
};

function useEvents(filter: EventFilterState) {
  const queryParams = new URLSearchParams();

  // Add event type filter
  if (filter.eventTypes.length > 0 && filter.eventTypes.length < ALL_EVENT_TYPES.length) {
    queryParams.set('eventType', filter.eventTypes.join(','));
  }

  // Add actor filter
  if (filter.actor) {
    queryParams.set('actor', filter.actor);
  }

  // Always get more events to allow client-side filtering
  queryParams.set('limit', '200');

  const queryString = queryParams.toString();
  const url = queryString ? `/api/events?${queryString}` : '/api/events?limit=200';

  return useQuery<Event[]>({
    queryKey: ['events', filter.eventTypes, filter.actor],
    queryFn: async () => {
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch events');
      return response.json();
    },
    refetchInterval: 5000, // Poll every 5 seconds for live updates
  });
}

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 10) return 'just now';
  if (diffSecs < 60) return `${diffSecs}s ago`;
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString();
}

function formatTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function generateEventSummary(event: Event): string {
  const { eventType, oldValue, newValue, actor } = event;

  switch (eventType) {
    case 'created':
      return `Created by ${actor}`;

    case 'updated': {
      if (oldValue && newValue) {
        const changedFields: string[] = [];
        const allKeys = new Set([...Object.keys(oldValue), ...Object.keys(newValue)]);
        for (const key of allKeys) {
          if (JSON.stringify(oldValue[key]) !== JSON.stringify(newValue[key])) {
            changedFields.push(key);
          }
        }
        if (changedFields.length <= 3) {
          return `Updated ${changedFields.join(', ')} by ${actor}`;
        }
        return `Updated ${changedFields.length} fields by ${actor}`;
      }
      return `Updated by ${actor}`;
    }

    case 'closed':
      return `Closed by ${actor}`;

    case 'reopened':
      return `Reopened by ${actor}`;

    case 'deleted':
      return `Deleted by ${actor}`;

    case 'dependency_added': {
      const targetId = (newValue?.targetId as string) ?? 'unknown';
      const depType = (newValue?.type as string) ?? 'dependency';
      return `Added ${depType} to ${targetId} by ${actor}`;
    }

    case 'dependency_removed': {
      const targetId = (oldValue?.targetId as string) ?? 'unknown';
      const depType = (oldValue?.type as string) ?? 'dependency';
      return `Removed ${depType} from ${targetId} by ${actor}`;
    }

    case 'tag_added': {
      const tag = (newValue?.tag as string) ?? 'tag';
      return `Added tag "${tag}" by ${actor}`;
    }

    case 'tag_removed': {
      const tag = (oldValue?.tag as string) ?? 'tag';
      return `Removed tag "${tag}" by ${actor}`;
    }

    case 'member_added': {
      const member = (newValue?.addedMember as string) ?? 'member';
      return `Added member ${member} by ${actor}`;
    }

    case 'member_removed': {
      const member = (newValue?.removedMember as string) ?? 'member';
      const selfRemoval = newValue?.selfRemoval;
      return selfRemoval ? `${member} left` : `Removed member ${member} by ${actor}`;
    }

    case 'auto_blocked':
      return 'Automatically blocked (dependency not satisfied)';

    case 'auto_unblocked':
      return 'Automatically unblocked (blockers resolved)';

    default:
      return `${EVENT_TYPE_DISPLAY[eventType] || eventType} by ${actor}`;
  }
}

interface EventCardProps {
  event: Event;
}

function EventCard({ event }: EventCardProps) {
  const colors = EVENT_TYPE_COLORS[event.eventType] || EVENT_TYPE_COLORS.updated;
  const summary = generateEventSummary(event);

  return (
    <div
      className={`p-3 rounded-lg border ${colors.border} ${colors.bg}`}
      data-testid="event-card"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`px-2 py-0.5 text-xs font-medium rounded ${colors.text} ${colors.bg}`}>
              {EVENT_TYPE_DISPLAY[event.eventType]}
            </span>
            <span className="text-xs text-gray-500">{formatTimeAgo(event.createdAt)}</span>
          </div>
          <p className="text-sm text-gray-900">{summary}</p>
          <p className="text-xs text-gray-500 mt-1 font-mono">{event.elementId}</p>
        </div>
        <span className="text-xs text-gray-400 shrink-0">{formatTime(event.createdAt)}</span>
      </div>
    </div>
  );
}

interface FilterToggleProps {
  label: string;
  active: boolean;
  onClick: () => void;
  color?: string;
}

function FilterToggle({ label, active, onClick, color }: FilterToggleProps) {
  return (
    <button
      onClick={onClick}
      className={`
        px-2 py-1 text-xs font-medium rounded-md transition-colors
        ${active
          ? `${color || 'bg-blue-100 text-blue-700'} ring-1 ring-blue-300`
          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
        }
      `}
    >
      {label}
    </button>
  );
}

export function TimelinePage() {
  const [filter, setFilter] = useState<EventFilterState>({
    eventTypes: [],
    actor: '',
    search: '',
  });

  const { data: events, isLoading, isError } = useEvents(filter);

  // Get unique actors from events for filtering
  const uniqueActors = useMemo(() => {
    if (!events) return [];
    const actorSet = new Set(events.map((e) => e.actor));
    return Array.from(actorSet).sort();
  }, [events]);

  // Apply client-side search filter
  const filteredEvents = useMemo(() => {
    if (!events) return [];
    if (!filter.search) return events;

    const searchLower = filter.search.toLowerCase();
    return events.filter(
      (event) =>
        event.elementId.toLowerCase().includes(searchLower) ||
        event.actor.toLowerCase().includes(searchLower) ||
        generateEventSummary(event).toLowerCase().includes(searchLower)
    );
  }, [events, filter.search]);

  const toggleEventType = (eventType: EventType) => {
    setFilter((prev) => ({
      ...prev,
      eventTypes: prev.eventTypes.includes(eventType)
        ? prev.eventTypes.filter((t) => t !== eventType)
        : [...prev.eventTypes, eventType],
    }));
  };

  const clearFilters = () => {
    setFilter({ eventTypes: [], actor: '', search: '' });
  };

  const hasActiveFilters = filter.eventTypes.length > 0 || filter.actor !== '' || filter.search !== '';

  return (
    <div className="h-full flex flex-col" data-testid="timeline-page">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-medium text-gray-900">Timeline</h2>
        <p className="text-sm text-gray-500">Event history across all elements</p>
      </div>

      {/* Filter controls */}
      <div className="mb-4 space-y-3">
        {/* Search bar */}
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Search events..."
            value={filter.search}
            onChange={(e) => setFilter((prev) => ({ ...prev, search: e.target.value }))}
            className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            data-testid="search-input"
          />
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="px-3 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Clear filters
            </button>
          )}
        </div>

        {/* Event type filters */}
        <div className="flex flex-wrap gap-1.5" data-testid="event-type-filters">
          {ALL_EVENT_TYPES.map(({ value, label }) => {
            const colors = EVENT_TYPE_COLORS[value];
            return (
              <FilterToggle
                key={value}
                label={label}
                active={filter.eventTypes.includes(value)}
                onClick={() => toggleEventType(value)}
                color={filter.eventTypes.includes(value) ? `${colors.bg} ${colors.text}` : undefined}
              />
            );
          })}
        </div>

        {/* Actor filter */}
        {uniqueActors.length > 0 && (
          <div className="flex items-center gap-2" data-testid="actor-filter">
            <span className="text-xs text-gray-500">Actor:</span>
            <select
              value={filter.actor}
              onChange={(e) => setFilter((prev) => ({ ...prev, actor: e.target.value }))}
              className="px-2 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All actors</option>
              {uniqueActors.map((actor) => (
                <option key={actor} value={actor}>
                  {actor}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Event count */}
      <div className="mb-3 text-sm text-gray-500" data-testid="event-count">
        {isLoading
          ? 'Loading events...'
          : `${filteredEvents.length} events${hasActiveFilters ? ' (filtered)' : ''}`}
      </div>

      {/* Events list */}
      <div className="flex-1 overflow-y-auto space-y-2 min-h-0" data-testid="events-list">
        {isLoading && (
          <div className="text-center py-8 text-gray-500">Loading events...</div>
        )}
        {isError && (
          <div className="text-center py-8 text-red-600">Failed to load events</div>
        )}
        {!isLoading && !isError && filteredEvents.length === 0 && (
          <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-lg">
            {hasActiveFilters ? 'No events match the current filters' : 'No events recorded yet'}
          </div>
        )}
        {!isLoading &&
          !isError &&
          filteredEvents.map((event) => <EventCard key={event.id} event={event} />)}
      </div>
    </div>
  );
}

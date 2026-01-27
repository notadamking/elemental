/**
 * Activity Page - Real-time feed of all orchestrator events
 * Home page showing live agent activity
 */

import { useState, useMemo } from 'react';
import { Activity as ActivityIcon, RefreshCw, Radio, WifiOff, Filter } from 'lucide-react';
import { ActivityList, SessionActivityCard } from '../../components/activity/index.js';
import { useInfiniteActivity, useActivityStream } from '../../api/hooks/useActivity.js';
import type { ActivityFilterCategory, ActivityEvent } from '../../api/types.js';

// Filter category options
const FILTER_CATEGORIES: { value: ActivityFilterCategory; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'tasks', label: 'Tasks' },
  { value: 'agents', label: 'Agents' },
  { value: 'workflows', label: 'Workflows' },
];

export function ActivityPage() {
  const [filterCategory, setFilterCategory] = useState<ActivityFilterCategory>('all');

  // Fetch activity events with infinite scroll
  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
  } = useInfiniteActivity({ category: filterCategory, limit: 20 });

  // Real-time session streaming
  const {
    isConnected,
    sessionEvents,
    clearSessionEvents,
  } = useActivityStream(filterCategory);

  // Flatten pages into a single array of events
  const events = useMemo(() => {
    if (!data?.pages) return [];
    return data.pages.flatMap((page) => page.events);
  }, [data]);

  const handleRefresh = () => {
    clearSessionEvents();
    refetch();
  };

  const handleLoadMore = () => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  };

  const handleOpenInWorkspace = (event: ActivityEvent) => {
    // Navigate to workspace with the element
    // This would typically use React Router navigation
    console.log('Open in workspace:', event.elementId);
    // For now, just log - full implementation would integrate with workspace routing
  };

  const handleOpenSessionInWorkspace = (sessionId: string) => {
    // Navigate to workspace with the session
    console.log('Open session in workspace:', sessionId);
  };

  return (
    <div className="space-y-6 animate-fade-in" data-testid="activity-page">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-[var(--color-primary-muted)]">
            <ActivityIcon className="w-5 h-5 text-[var(--color-primary)]" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-[var(--color-text)]">Activity</h1>
            <p className="text-sm text-[var(--color-text-secondary)]">
              Real-time feed of agent events and updates
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Connection status indicator */}
          <div
            className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium ${
              isConnected
                ? 'bg-[var(--color-success-muted)] text-[var(--color-success)]'
                : 'bg-[var(--color-error-muted)] text-[var(--color-error)]'
            }`}
            data-testid="activity-connection-status"
          >
            {isConnected ? (
              <>
                <Radio className="w-3 h-3" />
                Live
              </>
            ) : (
              <>
                <WifiOff className="w-3 h-3" />
                Offline
              </>
            )}
          </div>

          <button
            onClick={handleRefresh}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-[var(--color-text-secondary)] rounded-md border border-[var(--color-border)] hover:bg-[var(--color-surface-hover)] transition-colors duration-150"
            data-testid="activity-refresh"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 p-1 bg-[var(--color-surface)] rounded-lg border border-[var(--color-border)]">
        <Filter className="w-4 h-4 text-[var(--color-text-tertiary)] ml-2 mr-1" />
        {FILTER_CATEGORIES.map((category) => (
          <button
            key={category.value}
            onClick={() => setFilterCategory(category.value)}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors duration-150 ${
              filterCategory === category.value
                ? 'bg-[var(--color-primary)] text-white'
                : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]'
            }`}
            data-testid={`activity-filter-${category.value}`}
          >
            {category.label}
          </button>
        ))}
      </div>

      {/* Real-time session activity (if any) */}
      {sessionEvents.length > 0 && (
        <div className="space-y-2" data-testid="session-activity-section">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-[var(--color-text-secondary)]">
              Live Activity
            </h2>
            <button
              onClick={clearSessionEvents}
              className="text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]"
            >
              Clear
            </button>
          </div>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {sessionEvents.slice(0, 5).map((event, index) => (
              <SessionActivityCard
                key={`${event.sessionId}-${index}`}
                event={event}
                onOpenInWorkspace={handleOpenSessionInWorkspace}
              />
            ))}
          </div>
        </div>
      )}

      {/* Historical activity feed */}
      <div data-testid="activity-feed-section">
        <h2 className="text-sm font-medium text-[var(--color-text-secondary)] mb-3">
          {sessionEvents.length > 0 ? 'Recent Activity' : 'Activity Feed'}
        </h2>
        <ActivityList
          events={events}
          isLoading={isLoading || isFetchingNextPage}
          hasMore={hasNextPage}
          onLoadMore={handleLoadMore}
          onOpenInWorkspace={handleOpenInWorkspace}
          emptyMessage={
            filterCategory === 'all'
              ? 'No activity yet. Activity will appear here when agents start working on tasks.'
              : `No ${filterCategory} activity to show.`
          }
        />
      </div>
    </div>
  );
}

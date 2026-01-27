/**
 * Activity Page - Real-time feed of all orchestrator events
 * Home page showing live agent activity
 */

import { Activity as ActivityIcon, RefreshCw } from 'lucide-react';

export function ActivityPage() {
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
        <button
          className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-[var(--color-text-secondary)] rounded-md border border-[var(--color-border)] hover:bg-[var(--color-surface-hover)] transition-colors duration-150"
          data-testid="activity-refresh"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Empty state */}
      <div className="flex flex-col items-center justify-center py-16 px-4 border border-dashed border-[var(--color-border)] rounded-lg">
        <ActivityIcon className="w-12 h-12 text-[var(--color-text-tertiary)] mb-4" />
        <h3 className="text-lg font-medium text-[var(--color-text)]">No activity yet</h3>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)] text-center max-w-md">
          Activity will appear here when agents start working on tasks.
          Start by creating an agent or assigning a task.
        </p>
      </div>
    </div>
  );
}

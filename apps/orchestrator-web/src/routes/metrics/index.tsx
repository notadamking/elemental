/**
 * Metrics Page - Visualize orchestrator performance
 * Charts for activity, throughput, merge success, and health incidents
 */

import { BarChart3, Calendar, TrendingUp, AlertCircle } from 'lucide-react';

export function MetricsPage() {
  return (
    <div className="space-y-6 animate-fade-in" data-testid="metrics-page">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-[var(--color-primary-muted)]">
            <BarChart3 className="w-5 h-5 text-[var(--color-primary)]" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-[var(--color-text)]">Metrics</h1>
            <p className="text-sm text-[var(--color-text-secondary)]">
              Performance analytics and health monitoring
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-[var(--color-text-secondary)] rounded-md border border-[var(--color-border)] hover:bg-[var(--color-surface-hover)] transition-colors duration-150"
            data-testid="metrics-timerange"
          >
            <Calendar className="w-4 h-4" />
            Last 7 days
          </button>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-card-bg)]">
          <div className="flex items-center justify-between">
            <span className="text-sm text-[var(--color-text-secondary)]">Tasks Completed</span>
            <TrendingUp className="w-4 h-4 text-[var(--color-success)]" />
          </div>
          <div className="mt-2 text-2xl font-semibold text-[var(--color-text)]">0</div>
          <div className="mt-1 text-xs text-[var(--color-text-tertiary)]">+0% from last week</div>
        </div>

        <div className="p-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-card-bg)]">
          <div className="flex items-center justify-between">
            <span className="text-sm text-[var(--color-text-secondary)]">Active Agents</span>
            <TrendingUp className="w-4 h-4 text-[var(--color-success)]" />
          </div>
          <div className="mt-2 text-2xl font-semibold text-[var(--color-text)]">0</div>
          <div className="mt-1 text-xs text-[var(--color-text-tertiary)]">Currently running</div>
        </div>

        <div className="p-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-card-bg)]">
          <div className="flex items-center justify-between">
            <span className="text-sm text-[var(--color-text-secondary)]">Merge Success</span>
            <TrendingUp className="w-4 h-4 text-[var(--color-success)]" />
          </div>
          <div className="mt-2 text-2xl font-semibold text-[var(--color-text)]">--%</div>
          <div className="mt-1 text-xs text-[var(--color-text-tertiary)]">Auto-merge rate</div>
        </div>

        <div className="p-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-card-bg)]">
          <div className="flex items-center justify-between">
            <span className="text-sm text-[var(--color-text-secondary)]">Health Incidents</span>
            <AlertCircle className="w-4 h-4 text-[var(--color-text-tertiary)]" />
          </div>
          <div className="mt-2 text-2xl font-semibold text-[var(--color-text)]">0</div>
          <div className="mt-1 text-xs text-[var(--color-text-tertiary)]">This week</div>
        </div>
      </div>

      {/* Charts placeholder */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="p-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-card-bg)]">
          <h3 className="text-sm font-medium text-[var(--color-text)]">Activity Over Time</h3>
          <div className="mt-4 h-48 flex items-center justify-center border border-dashed border-[var(--color-border)] rounded-lg">
            <span className="text-sm text-[var(--color-text-tertiary)]">No data yet</span>
          </div>
        </div>

        <div className="p-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-card-bg)]">
          <h3 className="text-sm font-medium text-[var(--color-text)]">Task Distribution</h3>
          <div className="mt-4 h-48 flex items-center justify-center border border-dashed border-[var(--color-border)] rounded-lg">
            <span className="text-sm text-[var(--color-text-tertiary)]">No data yet</span>
          </div>
        </div>
      </div>
    </div>
  );
}

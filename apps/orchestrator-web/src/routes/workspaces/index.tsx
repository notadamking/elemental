/**
 * Workspaces Page - Terminal multiplexer for managing agent sessions
 * Tmux-like interface for viewing multiple agent terminals
 */

import { LayoutGrid, Plus, Maximize2 } from 'lucide-react';

export function WorkspacesPage() {
  return (
    <div className="space-y-6 animate-fade-in" data-testid="workspaces-page">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-[var(--color-primary-muted)]">
            <LayoutGrid className="w-5 h-5 text-[var(--color-primary)]" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-[var(--color-text)]">Workspaces</h1>
            <p className="text-sm text-[var(--color-text-secondary)]">
              Terminal multiplexer for agent sessions
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-[var(--color-text-secondary)] rounded-md border border-[var(--color-border)] hover:bg-[var(--color-surface-hover)] transition-colors duration-150"
            data-testid="workspaces-layout"
          >
            <Maximize2 className="w-4 h-4" />
            Layout
          </button>
          <button
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-[var(--color-primary)] rounded-md hover:bg-[var(--color-primary-hover)] transition-colors duration-150"
            data-testid="workspaces-add-pane"
          >
            <Plus className="w-4 h-4" />
            Add Pane
          </button>
        </div>
      </div>

      {/* Terminal grid placeholder */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 min-h-[400px]">
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--color-border)]">
            <span className="text-xs text-[var(--color-text-secondary)] font-mono">director</span>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500 opacity-50" />
              <div className="w-2.5 h-2.5 rounded-full bg-yellow-500 opacity-50" />
              <div className="w-2.5 h-2.5 rounded-full bg-green-500 opacity-50" />
            </div>
          </div>
          <div className="p-3 font-mono text-xs text-[var(--color-text-tertiary)] h-48">
            <p># No session connected</p>
            <p className="mt-2">
              <span className="text-[var(--color-success)]">$</span> _
            </p>
          </div>
        </div>

        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-[var(--color-border)] bg-[var(--color-bg-secondary)] min-h-[200px]">
          <Plus className="w-8 h-8 text-[var(--color-text-tertiary)] mb-2" />
          <span className="text-sm text-[var(--color-text-secondary)]">Add terminal pane</span>
        </div>
      </div>
    </div>
  );
}

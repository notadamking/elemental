/**
 * Agents Page - View and manage agents and stewards
 * Displays agent status, capabilities, and current tasks
 */

import { Users, Plus, Search } from 'lucide-react';

export function AgentsPage() {
  return (
    <div className="space-y-6 animate-fade-in" data-testid="agents-page">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-[var(--color-primary-muted)]">
            <Users className="w-5 h-5 text-[var(--color-primary)]" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-[var(--color-text)]">Agents</h1>
            <p className="text-sm text-[var(--color-text-secondary)]">
              Manage your AI agents and stewards
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-tertiary)]" />
            <input
              type="text"
              placeholder="Search agents..."
              className="pl-9 pr-3 py-2 text-sm border border-[var(--color-border)] rounded-md bg-[var(--color-input-bg)] text-[var(--color-text)] placeholder:text-[var(--color-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:border-transparent"
              data-testid="agents-search"
            />
          </div>
          <button
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-[var(--color-primary)] rounded-md hover:bg-[var(--color-primary-hover)] transition-colors duration-150"
            data-testid="agents-create"
          >
            <Plus className="w-4 h-4" />
            Create Agent
          </button>
        </div>
      </div>

      {/* Tabs: Agents | Stewards */}
      <div className="border-b border-[var(--color-border)]">
        <nav className="flex gap-4" aria-label="Tabs">
          <button
            className="pb-3 px-1 text-sm font-medium text-[var(--color-primary)] border-b-2 border-[var(--color-primary)]"
            data-testid="agents-tab-agents"
          >
            Agents
          </button>
          <button
            className="pb-3 px-1 text-sm font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text)] border-b-2 border-transparent hover:border-[var(--color-border)]"
            data-testid="agents-tab-stewards"
          >
            Stewards
          </button>
        </nav>
      </div>

      {/* Empty state */}
      <div className="flex flex-col items-center justify-center py-16 px-4 border border-dashed border-[var(--color-border)] rounded-lg">
        <Users className="w-12 h-12 text-[var(--color-text-tertiary)] mb-4" />
        <h3 className="text-lg font-medium text-[var(--color-text)]">No agents yet</h3>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)] text-center max-w-md">
          Create your first agent to start orchestrating AI work.
          Agents can work on tasks autonomously in isolated git worktrees.
        </p>
        <button
          className="mt-4 flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[var(--color-primary)] rounded-md hover:bg-[var(--color-primary-hover)] transition-colors duration-150"
          data-testid="agents-create-empty"
        >
          <Plus className="w-4 h-4" />
          Create Agent
        </button>
      </div>
    </div>
  );
}

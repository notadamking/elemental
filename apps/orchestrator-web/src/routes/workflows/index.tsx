/**
 * Workflows Page - View and manage workflow templates
 * Templates tab shows playbooks, Active tab shows running workflows
 */

import { Workflow, Plus, Play } from 'lucide-react';

export function WorkflowsPage() {
  return (
    <div className="space-y-6 animate-fade-in" data-testid="workflows-page">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-[var(--color-primary-muted)]">
            <Workflow className="w-5 h-5 text-[var(--color-primary)]" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-[var(--color-text)]">Workflows</h1>
            <p className="text-sm text-[var(--color-text-secondary)]">
              Manage workflow templates and active workflows
            </p>
          </div>
        </div>
        <button
          className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-[var(--color-primary)] rounded-md hover:bg-[var(--color-primary-hover)] transition-colors duration-150"
          data-testid="workflows-create"
        >
          <Plus className="w-4 h-4" />
          Create Workflow
        </button>
      </div>

      {/* Tabs: Templates | Active */}
      <div className="border-b border-[var(--color-border)]">
        <nav className="flex gap-4" aria-label="Tabs">
          <button
            className="pb-3 px-1 text-sm font-medium text-[var(--color-primary)] border-b-2 border-[var(--color-primary)]"
            data-testid="workflows-tab-templates"
          >
            Templates
          </button>
          <button
            className="pb-3 px-1 text-sm font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text)] border-b-2 border-transparent hover:border-[var(--color-border)]"
            data-testid="workflows-tab-active"
          >
            Active
          </button>
        </nav>
      </div>

      {/* Empty state */}
      <div className="flex flex-col items-center justify-center py-16 px-4 border border-dashed border-[var(--color-border)] rounded-lg">
        <Workflow className="w-12 h-12 text-[var(--color-text-tertiary)] mb-4" />
        <h3 className="text-lg font-medium text-[var(--color-text)]">No workflow templates</h3>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)] text-center max-w-md">
          Create workflow templates to define reusable sequences of tasks.
          Templates can be "poured" to create active workflows.
        </p>
        <div className="mt-4 flex items-center gap-2">
          <button
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[var(--color-primary)] rounded-md hover:bg-[var(--color-primary-hover)] transition-colors duration-150"
            data-testid="workflows-create-empty"
          >
            <Plus className="w-4 h-4" />
            Create Template
          </button>
          <button
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] rounded-md border border-[var(--color-border)] hover:bg-[var(--color-surface-hover)] transition-colors duration-150"
            data-testid="workflows-import"
          >
            <Play className="w-4 h-4" />
            Import YAML
          </button>
        </div>
      </div>
    </div>
  );
}

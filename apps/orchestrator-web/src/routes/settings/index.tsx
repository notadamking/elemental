/**
 * Settings Page - User preferences and workspace configuration
 * Tabs: Preferences | Workspace
 */

import { Settings, Palette, Bell, Keyboard, Folder } from 'lucide-react';

export function SettingsPage() {
  return (
    <div className="space-y-6 animate-fade-in" data-testid="settings-page">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-[var(--color-primary-muted)]">
          <Settings className="w-5 h-5 text-[var(--color-primary)]" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-[var(--color-text)]">Settings</h1>
          <p className="text-sm text-[var(--color-text-secondary)]">
            Configure your preferences and workspace
          </p>
        </div>
      </div>

      {/* Tabs: Preferences | Workspace */}
      <div className="border-b border-[var(--color-border)]">
        <nav className="flex gap-4" aria-label="Tabs">
          <button
            className="pb-3 px-1 text-sm font-medium text-[var(--color-primary)] border-b-2 border-[var(--color-primary)]"
            data-testid="settings-tab-preferences"
          >
            Preferences
          </button>
          <button
            className="pb-3 px-1 text-sm font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text)] border-b-2 border-transparent hover:border-[var(--color-border)]"
            data-testid="settings-tab-workspace"
          >
            Workspace
          </button>
        </nav>
      </div>

      {/* Settings sections */}
      <div className="space-y-6 max-w-2xl">
        {/* Theme */}
        <div className="p-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-card-bg)]">
          <div className="flex items-center gap-3 mb-4">
            <Palette className="w-5 h-5 text-[var(--color-text-secondary)]" />
            <h3 className="text-sm font-medium text-[var(--color-text)]">Theme</h3>
          </div>
          <div className="flex items-center gap-3">
            <button
              className="px-4 py-2 text-sm rounded-md border border-[var(--color-primary)] text-[var(--color-primary)] bg-[var(--color-primary-muted)]"
              data-testid="settings-theme-system"
            >
              System
            </button>
            <button
              className="px-4 py-2 text-sm rounded-md border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]"
              data-testid="settings-theme-light"
            >
              Light
            </button>
            <button
              className="px-4 py-2 text-sm rounded-md border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]"
              data-testid="settings-theme-dark"
            >
              Dark
            </button>
          </div>
        </div>

        {/* Notifications */}
        <div className="p-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-card-bg)]">
          <div className="flex items-center gap-3 mb-4">
            <Bell className="w-5 h-5 text-[var(--color-text-secondary)]" />
            <h3 className="text-sm font-medium text-[var(--color-text)]">Notifications</h3>
          </div>
          <div className="space-y-3">
            <label className="flex items-center justify-between">
              <span className="text-sm text-[var(--color-text-secondary)]">Task completion alerts</span>
              <input type="checkbox" className="rounded border-[var(--color-border)]" defaultChecked />
            </label>
            <label className="flex items-center justify-between">
              <span className="text-sm text-[var(--color-text-secondary)]">Agent health warnings</span>
              <input type="checkbox" className="rounded border-[var(--color-border)]" defaultChecked />
            </label>
            <label className="flex items-center justify-between">
              <span className="text-sm text-[var(--color-text-secondary)]">Merge notifications</span>
              <input type="checkbox" className="rounded border-[var(--color-border)]" defaultChecked />
            </label>
          </div>
        </div>

        {/* Keyboard Shortcuts */}
        <div className="p-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-card-bg)]">
          <div className="flex items-center gap-3 mb-4">
            <Keyboard className="w-5 h-5 text-[var(--color-text-secondary)]" />
            <h3 className="text-sm font-medium text-[var(--color-text)]">Keyboard Shortcuts</h3>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between py-1">
              <span className="text-[var(--color-text-secondary)]">Command palette</span>
              <kbd className="px-2 py-1 rounded bg-[var(--color-surface)] text-[var(--color-text-tertiary)] font-mono text-xs">⌘K</kbd>
            </div>
            <div className="flex items-center justify-between py-1">
              <span className="text-[var(--color-text-secondary)]">Toggle sidebar</span>
              <kbd className="px-2 py-1 rounded bg-[var(--color-surface)] text-[var(--color-text-tertiary)] font-mono text-xs">⌘B</kbd>
            </div>
            <div className="flex items-center justify-between py-1">
              <span className="text-[var(--color-text-secondary)]">Toggle Director panel</span>
              <kbd className="px-2 py-1 rounded bg-[var(--color-surface)] text-[var(--color-text-tertiary)] font-mono text-xs">⌘D</kbd>
            </div>
          </div>
        </div>

        {/* Workspace */}
        <div className="p-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-card-bg)]">
          <div className="flex items-center gap-3 mb-4">
            <Folder className="w-5 h-5 text-[var(--color-text-secondary)]" />
            <h3 className="text-sm font-medium text-[var(--color-text)]">Workspace</h3>
          </div>
          <div className="space-y-3 text-sm">
            <div>
              <label className="block text-[var(--color-text-secondary)] mb-1">Worktree directory</label>
              <input
                type="text"
                defaultValue=".worktrees/"
                className="w-full px-3 py-2 rounded-md border border-[var(--color-border)] bg-[var(--color-input-bg)] text-[var(--color-text)]"
                data-testid="settings-worktree-dir"
              />
            </div>
            <div>
              <label className="block text-[var(--color-text-secondary)] mb-1">Ephemeral task retention</label>
              <input
                type="text"
                defaultValue="24h"
                className="w-full px-3 py-2 rounded-md border border-[var(--color-border)] bg-[var(--color-input-bg)] text-[var(--color-text)]"
                data-testid="settings-ephemeral-retention"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

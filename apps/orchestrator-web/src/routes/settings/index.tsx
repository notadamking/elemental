/**
 * Settings Page - User preferences and workspace configuration
 *
 * Tabs: Preferences | Workspace
 * - Preferences: Theme, notifications, keyboard shortcuts
 * - Workspace: Worktree directory, ephemeral retention, steward schedules
 */

import { useState } from 'react';
import { useSearch, useNavigate } from '@tanstack/react-router';
import {
  Settings,
  Palette,
  Bell,
  Keyboard,
  Folder,
  Clock,
  Shield,
  Sun,
  Moon,
  Monitor,
  Check,
  RotateCcw,
  Volume2,
  VolumeX,
  GitBranch,
  Trash2,
  Calendar,
} from 'lucide-react';
import {
  useSettings,
  KEYBOARD_SHORTCUTS,
  type Theme,
} from '../../api/hooks/useSettings';

type TabValue = 'preferences' | 'workspace';

export function SettingsPage() {
  const search = useSearch({ from: '/settings' }) as { tab?: string };
  const navigate = useNavigate();

  const currentTab = (search.tab as TabValue) || 'preferences';

  const setTab = (tab: TabValue) => {
    navigate({
      to: '/settings',
      search: { tab },
    });
  };

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
        <nav className="flex gap-1" aria-label="Settings tabs">
          <button
            onClick={() => setTab('preferences')}
            className={`pb-3 px-4 text-sm font-medium border-b-2 transition-colors ${
              currentTab === 'preferences'
                ? 'text-[var(--color-primary)] border-[var(--color-primary)]'
                : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text)] border-transparent hover:border-[var(--color-border)]'
            }`}
            data-testid="settings-tab-preferences"
          >
            <span className="flex items-center gap-2">
              <Palette className="w-4 h-4" />
              Preferences
            </span>
          </button>
          <button
            onClick={() => setTab('workspace')}
            className={`pb-3 px-4 text-sm font-medium border-b-2 transition-colors ${
              currentTab === 'workspace'
                ? 'text-[var(--color-primary)] border-[var(--color-primary)]'
                : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text)] border-transparent hover:border-[var(--color-border)]'
            }`}
            data-testid="settings-tab-workspace"
          >
            <span className="flex items-center gap-2">
              <Folder className="w-4 h-4" />
              Workspace
            </span>
          </button>
        </nav>
      </div>

      {/* Content */}
      {currentTab === 'preferences' ? <PreferencesTab /> : <WorkspaceTab />}
    </div>
  );
}

// ============================================================================
// Preferences Tab
// ============================================================================

function PreferencesTab() {
  const { theme, notifications } = useSettings();

  return (
    <div className="space-y-6 max-w-2xl" data-testid="settings-preferences">
      {/* Theme */}
      <SettingsSection
        icon={Palette}
        title="Theme"
        description="Choose how the interface looks"
      >
        <div className="flex items-center gap-2">
          <ThemeButton
            theme="light"
            icon={Sun}
            label="Light"
            isActive={theme.theme === 'light'}
            onClick={() => theme.setTheme('light')}
          />
          <ThemeButton
            theme="dark"
            icon={Moon}
            label="Dark"
            isActive={theme.theme === 'dark'}
            onClick={() => theme.setTheme('dark')}
          />
          <ThemeButton
            theme="system"
            icon={Monitor}
            label="System"
            isActive={theme.theme === 'system'}
            onClick={() => theme.setTheme('system')}
          />
        </div>
        <p className="mt-2 text-xs text-[var(--color-text-tertiary)]">
          {theme.theme === 'system'
            ? `Currently using ${theme.resolvedTheme} theme based on system preference`
            : `Using ${theme.theme} theme`}
        </p>
      </SettingsSection>

      {/* Notifications */}
      <SettingsSection
        icon={Bell}
        title="Notifications"
        description="Configure how you receive alerts"
      >
        <div className="space-y-3">
          <ToggleSetting
            label="Task completion alerts"
            description="Notify when tasks are completed"
            checked={notifications.settings.taskCompletion}
            onChange={(checked) => notifications.setSettings({ taskCompletion: checked })}
            testId="settings-notify-task"
          />
          <ToggleSetting
            label="Agent health warnings"
            description="Notify when agents encounter issues"
            checked={notifications.settings.agentHealth}
            onChange={(checked) => notifications.setSettings({ agentHealth: checked })}
            testId="settings-notify-health"
          />
          <ToggleSetting
            label="Merge notifications"
            description="Notify when branches are merged"
            checked={notifications.settings.mergeNotifications}
            onChange={(checked) => notifications.setSettings({ mergeNotifications: checked })}
            testId="settings-notify-merge"
          />
          <div className="pt-2 border-t border-[var(--color-border)]">
            <ToggleSetting
              label="Sound"
              description="Play a sound when notifications arrive"
              checked={notifications.settings.sound}
              onChange={(checked) => notifications.setSettings({ sound: checked })}
              icon={notifications.settings.sound ? Volume2 : VolumeX}
              testId="settings-notify-sound"
            />
          </div>
          <div className="pt-2">
            <label className="block text-sm text-[var(--color-text-secondary)] mb-1">
              Toast duration
            </label>
            <select
              value={notifications.settings.toastDuration}
              onChange={(e) => notifications.setSettings({ toastDuration: Number(e.target.value) })}
              className="px-3 py-2 text-sm rounded-md border border-[var(--color-border)] bg-[var(--color-input-bg)] text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:border-transparent"
              data-testid="settings-toast-duration"
            >
              <option value="3000">3 seconds</option>
              <option value="5000">5 seconds</option>
              <option value="10000">10 seconds</option>
              <option value="0">Don't auto-dismiss</option>
            </select>
          </div>
          <div className="pt-2">
            <button
              onClick={() => notifications.resetToDefaults()}
              className="flex items-center gap-2 px-3 py-1.5 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] rounded-md transition-colors"
              data-testid="settings-notify-reset"
            >
              <RotateCcw className="w-4 h-4" />
              Reset to defaults
            </button>
          </div>
        </div>
      </SettingsSection>

      {/* Keyboard Shortcuts */}
      <SettingsSection
        icon={Keyboard}
        title="Keyboard Shortcuts"
        description="Quick access to common actions"
      >
        <div className="space-y-2">
          {KEYBOARD_SHORTCUTS.map((shortcut) => (
            <div
              key={shortcut.key}
              className="flex items-center justify-between py-2"
              data-testid={`shortcut-${shortcut.label.toLowerCase().replace(/\s+/g, '-')}`}
            >
              <div>
                <span className="text-sm text-[var(--color-text)]">{shortcut.label}</span>
                <p className="text-xs text-[var(--color-text-tertiary)]">{shortcut.description}</p>
              </div>
              <kbd className="px-2 py-1 rounded bg-[var(--color-surface)] text-[var(--color-text-secondary)] font-mono text-xs border border-[var(--color-border)]">
                {shortcut.key}
              </kbd>
            </div>
          ))}
        </div>
      </SettingsSection>
    </div>
  );
}

// ============================================================================
// Workspace Tab
// ============================================================================

function WorkspaceTab() {
  const { workspace, stewardSchedules, resetAllToDefaults } = useSettings();
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  return (
    <div className="space-y-6 max-w-2xl" data-testid="settings-workspace">
      {/* Git Worktrees */}
      <SettingsSection
        icon={GitBranch}
        title="Git Worktrees"
        description="Configure how agent worktrees are managed"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-[var(--color-text-secondary)] mb-1">
              Worktree directory
            </label>
            <input
              type="text"
              value={workspace.settings.worktreeDirectory}
              onChange={(e) => workspace.setSettings({ worktreeDirectory: e.target.value })}
              className="w-full px-3 py-2 rounded-md border border-[var(--color-border)] bg-[var(--color-input-bg)] text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:border-transparent"
              placeholder=".elemental/.worktrees/"
              data-testid="settings-worktree-dir"
            />
            <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">
              Directory relative to workspace root where agent worktrees are created
            </p>
          </div>
          <div>
            <label className="block text-sm text-[var(--color-text-secondary)] mb-1">
              Default branch
            </label>
            <input
              type="text"
              value={workspace.settings.defaultBranch}
              onChange={(e) => workspace.setSettings({ defaultBranch: e.target.value })}
              className="w-full px-3 py-2 rounded-md border border-[var(--color-border)] bg-[var(--color-input-bg)] text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:border-transparent"
              placeholder="main"
              data-testid="settings-default-branch"
            />
            <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">
              Branch used as base for new worktrees
            </p>
          </div>
          <ToggleSetting
            label="Auto-merge passing branches"
            description="Automatically merge branches when tests pass"
            checked={workspace.settings.autoMerge}
            onChange={(checked) => workspace.setSettings({ autoMerge: checked })}
            testId="settings-auto-merge"
          />
        </div>
      </SettingsSection>

      {/* Ephemeral Tasks */}
      <SettingsSection
        icon={Clock}
        title="Ephemeral Tasks"
        description="Configure temporary task retention"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-[var(--color-text-secondary)] mb-1">
              Retention period
            </label>
            <select
              value={workspace.settings.ephemeralRetention}
              onChange={(e) => workspace.setSettings({ ephemeralRetention: e.target.value })}
              className="w-full px-3 py-2 rounded-md border border-[var(--color-border)] bg-[var(--color-input-bg)] text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:border-transparent"
              data-testid="settings-ephemeral-retention"
            >
              <option value="1h">1 hour</option>
              <option value="6h">6 hours</option>
              <option value="12h">12 hours</option>
              <option value="24h">24 hours</option>
              <option value="7d">7 days</option>
              <option value="30d">30 days</option>
            </select>
            <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">
              Completed ephemeral tasks are automatically deleted after this period
            </p>
          </div>
        </div>
      </SettingsSection>

      {/* Steward Schedules */}
      <SettingsSection
        icon={Shield}
        title="Steward Schedules"
        description="Configure automated steward execution"
      >
        <div className="space-y-4">
          <ToggleSetting
            label="Health Steward"
            description="Monitors agent health and restarts stuck agents"
            checked={stewardSchedules.settings.healthStewardEnabled}
            onChange={(checked) => stewardSchedules.setSettings({ healthStewardEnabled: checked })}
            testId="settings-health-steward"
          />
          {stewardSchedules.settings.healthStewardEnabled && (
            <div className="pl-6 border-l-2 border-[var(--color-border)]">
              <label className="block text-sm text-[var(--color-text-secondary)] mb-1">
                Check interval
              </label>
              <select
                value={stewardSchedules.settings.healthCheckInterval}
                onChange={(e) => stewardSchedules.setSettings({ healthCheckInterval: e.target.value })}
                className="w-full px-3 py-2 rounded-md border border-[var(--color-border)] bg-[var(--color-input-bg)] text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:border-transparent"
                data-testid="settings-health-interval"
              >
                <option value="1m">Every minute</option>
                <option value="5m">Every 5 minutes</option>
                <option value="15m">Every 15 minutes</option>
                <option value="30m">Every 30 minutes</option>
              </select>
            </div>
          )}

          <ToggleSetting
            label="Merge Steward"
            description="Automatically merges completed branches"
            checked={stewardSchedules.settings.mergeStewardEnabled}
            onChange={(checked) => stewardSchedules.setSettings({ mergeStewardEnabled: checked })}
            testId="settings-merge-steward"
          />

          <ToggleSetting
            label="Ops Steward"
            description="Runs scheduled maintenance tasks"
            checked={stewardSchedules.settings.opsStewardEnabled}
            onChange={(checked) => stewardSchedules.setSettings({ opsStewardEnabled: checked })}
            testId="settings-ops-steward"
          />
          {stewardSchedules.settings.opsStewardEnabled && (
            <div className="pl-6 border-l-2 border-[var(--color-border)]">
              <label className="block text-sm text-[var(--color-text-secondary)] mb-1">
                <span className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  Schedule (cron)
                </span>
              </label>
              <input
                type="text"
                value={stewardSchedules.settings.opsSchedule}
                onChange={(e) => stewardSchedules.setSettings({ opsSchedule: e.target.value })}
                className="w-full px-3 py-2 rounded-md border border-[var(--color-border)] bg-[var(--color-input-bg)] text-[var(--color-text)] font-mono text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:border-transparent"
                placeholder="0 2 * * *"
                data-testid="settings-ops-schedule"
              />
              <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">
                Cron expression (default: 2 AM daily)
              </p>
            </div>
          )}

          <div className="pt-2">
            <button
              onClick={() => stewardSchedules.resetToDefaults()}
              className="flex items-center gap-2 px-3 py-1.5 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] rounded-md transition-colors"
              data-testid="settings-steward-reset"
            >
              <RotateCcw className="w-4 h-4" />
              Reset to defaults
            </button>
          </div>
        </div>
      </SettingsSection>

      {/* Danger Zone */}
      <SettingsSection
        icon={Trash2}
        title="Reset All Settings"
        description="Reset all settings to their default values"
        variant="danger"
      >
        {!showResetConfirm ? (
          <button
            onClick={() => setShowResetConfirm(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-[var(--color-danger-text)] bg-[var(--color-danger-muted)] border border-[var(--color-danger)] rounded-md hover:bg-[var(--color-danger)] hover:text-white transition-colors"
            data-testid="settings-reset-all"
          >
            <RotateCcw className="w-4 h-4" />
            Reset All Settings
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-sm text-[var(--color-text-secondary)]">Are you sure?</span>
            <button
              onClick={() => {
                resetAllToDefaults();
                setShowResetConfirm(false);
              }}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[var(--color-danger)] rounded-md hover:opacity-90 transition-opacity"
              data-testid="settings-reset-confirm"
            >
              <Check className="w-4 h-4" />
              Yes, Reset
            </button>
            <button
              onClick={() => setShowResetConfirm(false)}
              className="px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text)] transition-colors"
              data-testid="settings-reset-cancel"
            >
              Cancel
            </button>
          </div>
        )}
      </SettingsSection>
    </div>
  );
}

// ============================================================================
// Shared Components
// ============================================================================

interface SettingsSectionProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  children: React.ReactNode;
  variant?: 'default' | 'danger';
}

function SettingsSection({
  icon: Icon,
  title,
  description,
  children,
  variant = 'default',
}: SettingsSectionProps) {
  const borderClass = variant === 'danger'
    ? 'border-[var(--color-danger)]'
    : 'border-[var(--color-border)]';
  const iconClass = variant === 'danger'
    ? 'text-[var(--color-danger)]'
    : 'text-[var(--color-text-secondary)]';

  return (
    <div
      className={`p-4 rounded-lg border ${borderClass} bg-[var(--color-card-bg)]`}
      data-testid={`settings-section-${title.toLowerCase().replace(/\s+/g, '-')}`}
    >
      <div className="flex items-center gap-3 mb-4">
        <Icon className={`w-5 h-5 ${iconClass}`} />
        <div>
          <h3 className="text-sm font-medium text-[var(--color-text)]">{title}</h3>
          {description && (
            <p className="text-xs text-[var(--color-text-tertiary)]">{description}</p>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}

interface ThemeButtonProps {
  theme: Theme;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  isActive: boolean;
  onClick: () => void;
}

function ThemeButton({ theme, icon: Icon, label, isActive, onClick }: ThemeButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 text-sm rounded-md border transition-colors ${
        isActive
          ? 'border-[var(--color-primary)] text-[var(--color-primary)] bg-[var(--color-primary-muted)]'
          : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]'
      }`}
      data-testid={`settings-theme-${theme}`}
    >
      <Icon className="w-4 h-4" />
      {label}
      {isActive && <Check className="w-3 h-3" />}
    </button>
  );
}

interface ToggleSettingProps {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  icon?: React.ComponentType<{ className?: string }>;
  testId?: string;
}

function ToggleSetting({
  label,
  description,
  checked,
  onChange,
  icon: Icon,
  testId,
}: ToggleSettingProps) {
  return (
    <label
      className="flex items-center justify-between cursor-pointer group"
      data-testid={testId}
    >
      <div className="flex items-center gap-2">
        {Icon && <Icon className="w-4 h-4 text-[var(--color-text-tertiary)]" />}
        <div>
          <span className="text-sm text-[var(--color-text)] group-hover:text-[var(--color-primary)]">
            {label}
          </span>
          {description && (
            <p className="text-xs text-[var(--color-text-tertiary)]">{description}</p>
          )}
        </div>
      </div>
      <div className="relative">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="sr-only peer"
          data-checked={checked}
        />
        <div className="w-11 h-6 bg-[var(--color-surface-elevated)] peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-[var(--color-primary)] rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[var(--color-primary)]" />
      </div>
    </label>
  );
}

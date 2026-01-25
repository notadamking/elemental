/**
 * Settings Page
 *
 * User preferences and configuration settings.
 * Includes theme selection, keyboard shortcuts, and more.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Sun, Moon, Monitor, Palette, Keyboard, Settings2, Bell, RefreshCw, RotateCcw, X, AlertCircle, Check, List, LayoutGrid, Home, Workflow, Users, GitBranch, Clock, ArrowUp, Calendar, FileText, BellRing, MessageSquare, CheckCircle2, AlertTriangle, Download, Upload, Loader2, HardDrive } from 'lucide-react';
import {
  DEFAULT_SHORTCUTS,
  getCurrentBinding,
  checkShortcutConflict,
  setCustomShortcut,
  resetAllShortcuts,
  getCustomShortcuts,
  type ShortcutCategory,
} from '../lib/keyboard';
import { useDisableKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';

type Theme = 'light' | 'dark' | 'system';

const THEME_STORAGE_KEY = 'settings.theme';

function getStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'system';
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === 'light' || stored === 'dark' || stored === 'system') {
    return stored;
  }
  return 'system';
}

function setStoredTheme(theme: Theme) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(THEME_STORAGE_KEY, theme);
}

function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme: Theme) {
  if (typeof window === 'undefined') return;
  const resolvedTheme = theme === 'system' ? getSystemTheme() : theme;
  const root = document.documentElement;

  if (resolvedTheme === 'dark') {
    root.classList.add('dark');
    root.classList.remove('theme-light');
    root.classList.add('theme-dark');
  } else {
    root.classList.remove('dark');
    root.classList.remove('theme-dark');
    root.classList.add('theme-light');
  }
}

type SettingsSection = 'theme' | 'shortcuts' | 'defaults' | 'notifications' | 'sync';

interface SectionNavItem {
  id: SettingsSection;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  implemented: boolean;
}

const SETTINGS_SECTIONS: SectionNavItem[] = [
  { id: 'theme', label: 'Theme', icon: Palette, description: 'Customize appearance', implemented: true },
  { id: 'shortcuts', label: 'Shortcuts', icon: Keyboard, description: 'Keyboard shortcuts', implemented: true },
  { id: 'defaults', label: 'Defaults', icon: Settings2, description: 'Default view settings', implemented: true },
  { id: 'notifications', label: 'Notifications', icon: Bell, description: 'Notification preferences', implemented: true },
  { id: 'sync', label: 'Sync', icon: RefreshCw, description: 'Sync configuration', implemented: true },
];

function ThemeOption({
  theme,
  label,
  description,
  icon: Icon,
  isSelected,
  onSelect,
}: {
  theme: Theme;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={`
        flex items-start gap-4 p-4 rounded-lg border transition-all text-left w-full
        ${isSelected
          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-400 ring-2 ring-blue-200 dark:ring-blue-800'
          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800/50'
        }
      `}
      data-testid={`theme-option-${theme}`}
    >
      <div className={`
        w-10 h-10 rounded-lg flex items-center justify-center
        ${isSelected
          ? 'bg-blue-500 text-white'
          : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
        }
      `}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className={`font-medium ${isSelected ? 'text-blue-700 dark:text-blue-300' : 'text-gray-900 dark:text-gray-100'}`}>
            {label}
          </span>
          {isSelected && (
            <span className="px-2 py-0.5 text-xs font-medium bg-blue-100 dark:bg-blue-800 text-blue-700 dark:text-blue-200 rounded">
              Active
            </span>
          )}
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{description}</p>
      </div>
    </button>
  );
}

function ThemeSection({
  currentTheme,
  onThemeChange,
}: {
  currentTheme: Theme;
  onThemeChange: (theme: Theme) => void;
}) {
  const resolvedTheme = currentTheme === 'system' ? getSystemTheme() : currentTheme;

  return (
    <div data-testid="settings-theme-section">
      <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">Theme</h3>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        Choose how the application looks. You can select light mode, dark mode, or follow your system settings.
      </p>

      <div className="space-y-3">
        <ThemeOption
          theme="light"
          label="Light"
          description="A clean, bright interface for daytime use"
          icon={Sun}
          isSelected={currentTheme === 'light'}
          onSelect={() => onThemeChange('light')}
        />
        <ThemeOption
          theme="dark"
          label="Dark"
          description="Easy on the eyes, perfect for low-light environments"
          icon={Moon}
          isSelected={currentTheme === 'dark'}
          onSelect={() => onThemeChange('dark')}
        />
        <ThemeOption
          theme="system"
          label="System"
          description={`Automatically match your system preference (currently ${resolvedTheme})`}
          icon={Monitor}
          isSelected={currentTheme === 'system'}
          onSelect={() => onThemeChange('system')}
        />
      </div>

      {/* Theme Preview */}
      <div className="mt-8">
        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Preview</h4>
        <div className={`
          p-4 rounded-lg border
          ${resolvedTheme === 'dark'
            ? 'bg-gray-900 border-gray-700'
            : 'bg-white border-gray-200'
          }
        `} data-testid="theme-preview">
          <div className="flex items-center gap-3 mb-3">
            <div className={`w-8 h-8 rounded-full ${resolvedTheme === 'dark' ? 'bg-blue-500' : 'bg-blue-600'}`} />
            <div>
              <div className={`text-sm font-medium ${resolvedTheme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                Sample Task
              </div>
              <div className={`text-xs ${resolvedTheme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                This is how content will appear
              </div>
            </div>
          </div>
          <div className={`
            text-xs px-2 py-1 rounded inline-block
            ${resolvedTheme === 'dark'
              ? 'bg-green-900/50 text-green-300'
              : 'bg-green-100 text-green-700'
            }
          `}>
            Status: Active
          </div>
        </div>
      </div>
    </div>
  );
}

// Helper to detect platform
function isMac(): boolean {
  if (typeof window === 'undefined') return false;
  return navigator.platform.toUpperCase().indexOf('MAC') >= 0;
}

// Format shortcut keys for display
function formatShortcutDisplay(keys: string): string {
  if (isMac()) {
    return keys.replace(/Cmd/gi, '⌘').replace(/Ctrl/gi, '⌃').replace(/Alt/gi, '⌥').replace(/Shift/gi, '⇧');
  }
  return keys.replace(/Cmd/gi, 'Ctrl');
}

// Shortcut categories with labels
const CATEGORY_LABELS: Record<ShortcutCategory, string> = {
  navigation: 'Navigation',
  actions: 'Actions',
  views: 'Views',
  editing: 'Editing',
  other: 'Other',
};

// Group shortcuts by category
function groupShortcutsByCategory(): Record<ShortcutCategory, Array<{ actionId: string; description: string; defaultKeys: string }>> {
  const groups: Record<ShortcutCategory, Array<{ actionId: string; description: string; defaultKeys: string }>> = {
    navigation: [],
    actions: [],
    views: [],
    editing: [],
    other: [],
  };

  for (const [actionId, config] of Object.entries(DEFAULT_SHORTCUTS)) {
    groups[config.category].push({
      actionId,
      description: config.description,
      defaultKeys: config.keys,
    });
  }

  return groups;
}

interface ShortcutEditModalProps {
  actionId: string;
  description: string;
  currentKeys: string;
  defaultKeys: string;
  onSave: (keys: string) => void;
  onCancel: () => void;
}

function ShortcutEditModal({ actionId, description, currentKeys, defaultKeys, onSave, onCancel }: ShortcutEditModalProps) {
  const [capturedKeys, setCapturedKeys] = useState<string[]>([]);
  const [isCapturing, setIsCapturing] = useState(false);
  const [conflict, setConflict] = useState<string | null>(null);
  const inputRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!isCapturing) return;

    e.preventDefault();
    e.stopPropagation();

    const key = e.key.toLowerCase();

    // Ignore modifier keys alone
    if (['meta', 'control', 'alt', 'shift'].includes(key)) {
      return;
    }

    let newKeys: string[] = [];

    // Check for modifier shortcuts
    if (e.metaKey || e.ctrlKey) {
      const parts: string[] = [];
      if (e.metaKey) parts.push('Cmd');
      if (e.ctrlKey) parts.push('Ctrl');
      if (e.altKey) parts.push('Alt');
      if (e.shiftKey) parts.push('Shift');
      parts.push(key.toUpperCase());
      newKeys = [parts.join('+')];
    } else {
      // Sequential shortcut
      newKeys = [...capturedKeys, key.toUpperCase()];
    }

    const keysString = newKeys.join(' ');
    setCapturedKeys(newKeys);

    // Check for conflicts
    const conflictingAction = checkShortcutConflict(keysString, actionId);
    if (conflictingAction) {
      const conflictDescription = DEFAULT_SHORTCUTS[conflictingAction]?.description || conflictingAction;
      setConflict(conflictDescription);
    } else {
      setConflict(null);
    }
  }, [isCapturing, capturedKeys, actionId]);

  useEffect(() => {
    if (isCapturing) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isCapturing, handleKeyDown]);

  const handleStartCapture = () => {
    setCapturedKeys([]);
    setConflict(null);
    setIsCapturing(true);
    inputRef.current?.focus();
  };

  const handleStopCapture = () => {
    setIsCapturing(false);
  };

  const handleSave = () => {
    if (capturedKeys.length > 0 && !conflict) {
      onSave(capturedKeys.join(' '));
    }
  };

  const handleResetToDefault = () => {
    onSave(defaultKeys);
  };

  const displayKeys = capturedKeys.length > 0
    ? formatShortcutDisplay(capturedKeys.join(' '))
    : formatShortcutDisplay(currentKeys);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" data-testid="shortcut-edit-modal">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Edit Shortcut</h3>
          <button
            onClick={onCancel}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500"
            data-testid="shortcut-edit-close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{description}</p>

        <div
          ref={inputRef}
          tabIndex={0}
          onClick={handleStartCapture}
          onBlur={handleStopCapture}
          className={`
            p-4 rounded-lg border-2 text-center font-mono text-lg cursor-pointer transition-all
            ${isCapturing
              ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
              : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900'
            }
            ${conflict ? 'border-red-500 bg-red-50 dark:bg-red-900/20' : ''}
          `}
          data-testid="shortcut-capture-area"
        >
          {isCapturing && capturedKeys.length === 0 ? (
            <span className="text-gray-400">Press keys...</span>
          ) : (
            <span className="text-gray-900 dark:text-gray-100">{displayKeys}</span>
          )}
        </div>

        {isCapturing && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 text-center">
            Press a key combination. For sequential shortcuts, press keys one after another.
          </p>
        )}

        {conflict && (
          <div className="flex items-center gap-2 mt-3 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
            <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
            <p className="text-sm text-red-600 dark:text-red-400" data-testid="shortcut-conflict-warning">
              Conflicts with: {conflict}
            </p>
          </div>
        )}

        <div className="flex items-center justify-between mt-6">
          <button
            onClick={handleResetToDefault}
            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
            data-testid="shortcut-reset-default"
          >
            <RotateCcw className="w-4 h-4" />
            Reset to Default
          </button>
          <div className="flex gap-2">
            <button
              onClick={onCancel}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              data-testid="shortcut-edit-cancel"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={capturedKeys.length === 0 || !!conflict}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg flex items-center gap-2"
              data-testid="shortcut-edit-save"
            >
              <Check className="w-4 h-4" />
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface ShortcutRowProps {
  actionId: string;
  description: string;
  currentKeys: string;
  isCustomized: boolean;
  onEdit: () => void;
}

function ShortcutRow({ actionId, description, currentKeys, isCustomized, onEdit }: ShortcutRowProps) {
  return (
    <div
      className="flex items-center justify-between py-3 px-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 rounded-lg group"
      data-testid={`shortcut-row-${actionId}`}
    >
      <div className="flex-1">
        <span className="text-sm text-gray-900 dark:text-gray-100">{description}</span>
        {isCustomized && (
          <span className="ml-2 text-xs px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded">
            Customized
          </span>
        )}
      </div>
      <div className="flex items-center gap-3">
        <kbd className="px-2 py-1 text-sm font-mono bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded border border-gray-200 dark:border-gray-700">
          {formatShortcutDisplay(currentKeys)}
        </kbd>
        <button
          onClick={onEdit}
          className="px-3 py-1 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded opacity-0 group-hover:opacity-100 transition-opacity"
          data-testid={`shortcut-edit-${actionId}`}
        >
          Customize
        </button>
      </div>
    </div>
  );
}

function ShortcutsSection() {
  const [customShortcuts, setCustomShortcuts] = useState<Record<string, string>>({});
  const [editingShortcut, setEditingShortcut] = useState<{
    actionId: string;
    description: string;
    currentKeys: string;
    defaultKeys: string;
  } | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // Disable global keyboard shortcuts when modal is open
  useDisableKeyboardShortcuts(!!editingShortcut);

  // Load custom shortcuts on mount
  useEffect(() => {
    setCustomShortcuts(getCustomShortcuts());
  }, []);

  const groups = groupShortcutsByCategory();

  const handleSaveShortcut = (keys: string) => {
    if (!editingShortcut) return;
    setCustomShortcut(editingShortcut.actionId, keys);
    setCustomShortcuts(getCustomShortcuts());
    setEditingShortcut(null);

    // Note: In a real implementation, we'd also need to re-register the shortcuts
    // with the keyboard manager. For now, this requires a page refresh to take effect.
    // The user can refresh the page or the app can be enhanced to support hot-reloading.
  };

  const handleResetAll = () => {
    resetAllShortcuts();
    setCustomShortcuts({});
    setShowResetConfirm(false);
  };

  const hasCustomizations = Object.keys(customShortcuts).length > 0;

  return (
    <div data-testid="settings-shortcuts-section">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">Keyboard Shortcuts</h3>
        {hasCustomizations && (
          <button
            onClick={() => setShowResetConfirm(true)}
            className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
            data-testid="shortcuts-reset-all"
          >
            <RotateCcw className="w-4 h-4" />
            Reset to Defaults
          </button>
        )}
      </div>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        View and customize keyboard shortcuts. Click "Customize" to change a shortcut, or use the search to find specific actions.
      </p>

      {/* Shortcut Categories */}
      <div className="space-y-6">
        {(Object.entries(groups) as [ShortcutCategory, typeof groups[ShortcutCategory]][]).map(([category, shortcuts]) => {
          if (shortcuts.length === 0) return null;

          return (
            <div key={category}>
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 px-4">
                {CATEGORY_LABELS[category]}
              </h4>
              <div className="border border-gray-200 dark:border-gray-700 rounded-lg divide-y divide-gray-200 dark:divide-gray-700">
                {shortcuts.map(({ actionId, description, defaultKeys }) => {
                  const currentKeys = getCurrentBinding(actionId);
                  const isCustomized = !!customShortcuts[actionId];

                  return (
                    <ShortcutRow
                      key={actionId}
                      actionId={actionId}
                      description={description}
                      currentKeys={currentKeys}
                      isCustomized={isCustomized}
                      onEdit={() => setEditingShortcut({ actionId, description, currentKeys, defaultKeys })}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Edit Modal */}
      {editingShortcut && (
        <ShortcutEditModal
          actionId={editingShortcut.actionId}
          description={editingShortcut.description}
          currentKeys={editingShortcut.currentKeys}
          defaultKeys={editingShortcut.defaultKeys}
          onSave={handleSaveShortcut}
          onCancel={() => setEditingShortcut(null)}
        />
      )}

      {/* Reset Confirmation */}
      {showResetConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" data-testid="reset-confirm-modal">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-sm p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">Reset All Shortcuts?</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
              This will reset all keyboard shortcuts to their default values. This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowResetConfirm(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                data-testid="reset-confirm-cancel"
              >
                Cancel
              </button>
              <button
                onClick={handleResetAll}
                className="px-4 py-2 text-sm font-medium text-white bg-red-500 hover:bg-red-600 rounded-lg"
                data-testid="reset-confirm-yes"
              >
                Reset All
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Note about reloading */}
      <p className="text-xs text-gray-400 dark:text-gray-500 mt-6 text-center">
        Changes to keyboard shortcuts take effect after refreshing the page.
      </p>
    </div>
  );
}

// Storage keys for defaults
const DEFAULTS_STORAGE_KEY = 'settings.defaults';

type TasksViewMode = 'list' | 'kanban';
type DashboardLens = 'overview' | 'task-flow' | 'agents' | 'dependencies' | 'timeline';
type DefaultSortOrder = 'updated_at' | 'created_at' | 'priority' | 'title';

interface DefaultsSettings {
  tasksView: TasksViewMode;
  dashboardLens: DashboardLens;
  sortOrder: DefaultSortOrder;
}

const DEFAULT_SETTINGS: DefaultsSettings = {
  tasksView: 'list',
  dashboardLens: 'overview',
  sortOrder: 'updated_at',
};

function getStoredDefaults(): DefaultsSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  const stored = localStorage.getItem(DEFAULTS_STORAGE_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      return {
        ...DEFAULT_SETTINGS,
        ...parsed,
      };
    } catch {
      return DEFAULT_SETTINGS;
    }
  }
  return DEFAULT_SETTINGS;
}

function setStoredDefaults(defaults: DefaultsSettings) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(DEFAULTS_STORAGE_KEY, JSON.stringify(defaults));

  // Also update individual storage keys so pages pick up the settings
  // Tasks view mode
  localStorage.setItem('tasks.viewMode', defaults.tasksView);
}

// Export for use by other pages
export function getDefaultTasksView(): TasksViewMode {
  const defaults = getStoredDefaults();
  return defaults.tasksView;
}

export function getDefaultDashboardLens(): DashboardLens {
  const defaults = getStoredDefaults();
  return defaults.dashboardLens;
}

export function getDefaultSortOrder(): DefaultSortOrder {
  const defaults = getStoredDefaults();
  return defaults.sortOrder;
}

interface OptionCardProps<T extends string> {
  value: T;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  isSelected: boolean;
  onSelect: () => void;
  testId: string;
}

function OptionCard<T extends string>({
  label,
  description,
  icon: Icon,
  isSelected,
  onSelect,
  testId,
}: OptionCardProps<T>) {
  return (
    <button
      onClick={onSelect}
      className={`
        flex items-start gap-3 p-3 rounded-lg border transition-all text-left w-full
        ${isSelected
          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-400'
          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800/50'
        }
      `}
      data-testid={testId}
    >
      <div className={`
        w-8 h-8 rounded flex items-center justify-center flex-shrink-0
        ${isSelected
          ? 'bg-blue-500 text-white'
          : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
        }
      `}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`text-sm font-medium ${isSelected ? 'text-blue-700 dark:text-blue-300' : 'text-gray-900 dark:text-gray-100'}`}>
            {label}
          </span>
          {isSelected && (
            <Check className="w-4 h-4 text-blue-500" />
          )}
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{description}</p>
      </div>
    </button>
  );
}

function DefaultsSection() {
  const [defaults, setDefaults] = useState<DefaultsSettings>(DEFAULT_SETTINGS);

  // Load settings on mount
  useEffect(() => {
    setDefaults(getStoredDefaults());
  }, []);

  const updateSetting = <K extends keyof DefaultsSettings>(key: K, value: DefaultsSettings[K]) => {
    const newDefaults = { ...defaults, [key]: value };
    setDefaults(newDefaults);
    setStoredDefaults(newDefaults);
  };

  return (
    <div data-testid="settings-defaults-section">
      <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">Default Views</h3>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        Set default view preferences that will be applied when you first load pages.
      </p>

      {/* Tasks Default View */}
      <div className="mb-8">
        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Tasks View</h4>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          Choose the default view when opening the Tasks page.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <OptionCard
            value="list"
            label="List View"
            description="Traditional list layout with sorting"
            icon={List}
            isSelected={defaults.tasksView === 'list'}
            onSelect={() => updateSetting('tasksView', 'list')}
            testId="default-tasks-view-list"
          />
          <OptionCard
            value="kanban"
            label="Kanban View"
            description="Drag-and-drop board by status"
            icon={LayoutGrid}
            isSelected={defaults.tasksView === 'kanban'}
            onSelect={() => updateSetting('tasksView', 'kanban')}
            testId="default-tasks-view-kanban"
          />
        </div>
      </div>

      {/* Dashboard Default Lens */}
      <div className="mb-8">
        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Dashboard Lens</h4>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          Choose the default dashboard view when navigating to the Dashboard.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <OptionCard
            value="overview"
            label="Overview"
            description="Key metrics and quick actions"
            icon={Home}
            isSelected={defaults.dashboardLens === 'overview'}
            onSelect={() => updateSetting('dashboardLens', 'overview')}
            testId="default-dashboard-lens-overview"
          />
          <OptionCard
            value="task-flow"
            label="Task Flow"
            description="Ready, blocked & completed tasks"
            icon={Workflow}
            isSelected={defaults.dashboardLens === 'task-flow'}
            onSelect={() => updateSetting('dashboardLens', 'task-flow')}
            testId="default-dashboard-lens-task-flow"
          />
          <OptionCard
            value="agents"
            label="Agents"
            description="Agent workload and activity"
            icon={Users}
            isSelected={defaults.dashboardLens === 'agents'}
            onSelect={() => updateSetting('dashboardLens', 'agents')}
            testId="default-dashboard-lens-agents"
          />
          <OptionCard
            value="dependencies"
            label="Dependencies"
            description="Visual dependency graph"
            icon={GitBranch}
            isSelected={defaults.dashboardLens === 'dependencies'}
            onSelect={() => updateSetting('dashboardLens', 'dependencies')}
            testId="default-dashboard-lens-dependencies"
          />
          <OptionCard
            value="timeline"
            label="Timeline"
            description="Chronological event feed"
            icon={Clock}
            isSelected={defaults.dashboardLens === 'timeline'}
            onSelect={() => updateSetting('dashboardLens', 'timeline')}
            testId="default-dashboard-lens-timeline"
          />
        </div>
      </div>

      {/* Default Sort Order */}
      <div className="mb-8">
        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Default Sort Order</h4>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          Choose how lists are sorted by default across the application.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <OptionCard
            value="updated_at"
            label="Last Updated"
            description="Most recently modified first"
            icon={Clock}
            isSelected={defaults.sortOrder === 'updated_at'}
            onSelect={() => updateSetting('sortOrder', 'updated_at')}
            testId="default-sort-updated"
          />
          <OptionCard
            value="created_at"
            label="Date Created"
            description="Newest items first"
            icon={Calendar}
            isSelected={defaults.sortOrder === 'created_at'}
            onSelect={() => updateSetting('sortOrder', 'created_at')}
            testId="default-sort-created"
          />
          <OptionCard
            value="priority"
            label="Priority"
            description="Highest priority first"
            icon={ArrowUp}
            isSelected={defaults.sortOrder === 'priority'}
            onSelect={() => updateSetting('sortOrder', 'priority')}
            testId="default-sort-priority"
          />
          <OptionCard
            value="title"
            label="Title"
            description="Alphabetical order"
            icon={FileText}
            isSelected={defaults.sortOrder === 'title'}
            onSelect={() => updateSetting('sortOrder', 'title')}
            testId="default-sort-title"
          />
        </div>
      </div>

      {/* Note */}
      <p className="text-xs text-gray-400 dark:text-gray-500 mt-6 text-center">
        These defaults apply when you first load a page. You can still change views temporarily at any time.
      </p>
    </div>
  );
}

// Storage keys for notifications
const NOTIFICATIONS_STORAGE_KEY = 'settings.notifications';

type ToastDuration = 3000 | 5000 | 10000;
type ToastPosition = 'top-right' | 'bottom-right' | 'top-left' | 'bottom-left';

interface NotificationPreferences {
  taskAssigned: boolean;
  taskCompleted: boolean;
  newMessage: boolean;
  workflowCompleted: boolean;
}

interface NotificationsSettings {
  browserNotifications: boolean;
  preferences: NotificationPreferences;
  toastDuration: ToastDuration;
  toastPosition: ToastPosition;
}

const DEFAULT_NOTIFICATIONS: NotificationsSettings = {
  browserNotifications: false,
  preferences: {
    taskAssigned: true,
    taskCompleted: true,
    newMessage: true,
    workflowCompleted: true,
  },
  toastDuration: 5000,
  toastPosition: 'top-right',
};

function getStoredNotifications(): NotificationsSettings {
  if (typeof window === 'undefined') return DEFAULT_NOTIFICATIONS;
  const stored = localStorage.getItem(NOTIFICATIONS_STORAGE_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      return {
        ...DEFAULT_NOTIFICATIONS,
        ...parsed,
        preferences: {
          ...DEFAULT_NOTIFICATIONS.preferences,
          ...parsed.preferences,
        },
      };
    } catch {
      return DEFAULT_NOTIFICATIONS;
    }
  }
  return DEFAULT_NOTIFICATIONS;
}

function setStoredNotifications(settings: NotificationsSettings) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, JSON.stringify(settings));
}

// Export for use by notification system
export function getNotificationSettings(): NotificationsSettings {
  return getStoredNotifications();
}

export function getToastPosition(): ToastPosition {
  return getStoredNotifications().toastPosition;
}

export function getToastDuration(): ToastDuration {
  return getStoredNotifications().toastDuration;
}

export function shouldNotify(type: keyof NotificationPreferences): boolean {
  const settings = getStoredNotifications();
  return settings.preferences[type];
}

// Helper to check browser notification permission
function getBrowserNotificationPermission(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission;
}

// Request browser notification permission
async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'denied';
  }
  return await Notification.requestPermission();
}

interface ToggleSwitchProps {
  enabled: boolean;
  onToggle: () => void;
  disabled?: boolean;
  testId: string;
}

function ToggleSwitch({ enabled, onToggle, disabled = false, testId }: ToggleSwitchProps) {
  return (
    <button
      onClick={onToggle}
      disabled={disabled}
      className={`
        relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
        ${enabled ? 'bg-blue-500' : 'bg-gray-200 dark:bg-gray-700'}
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
      `}
      role="switch"
      aria-checked={enabled}
      data-testid={testId}
    >
      <span
        className={`
          inline-block h-4 w-4 transform rounded-full bg-white transition-transform
          ${enabled ? 'translate-x-6' : 'translate-x-1'}
        `}
      />
    </button>
  );
}

interface NotificationToggleRowProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  description: string;
  enabled: boolean;
  onToggle: () => void;
  disabled?: boolean;
  testId: string;
}

function NotificationToggleRow({
  icon: Icon,
  label,
  description,
  enabled,
  onToggle,
  disabled = false,
  testId,
}: NotificationToggleRowProps) {
  return (
    <div
      className={`flex items-center justify-between py-4 ${disabled ? 'opacity-50' : ''}`}
      data-testid={testId}
    >
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
          <Icon className="w-4 h-4 text-gray-600 dark:text-gray-400" />
        </div>
        <div>
          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{label}</span>
          <p className="text-xs text-gray-500 dark:text-gray-400">{description}</p>
        </div>
      </div>
      <ToggleSwitch
        enabled={enabled}
        onToggle={onToggle}
        disabled={disabled}
        testId={`${testId}-toggle`}
      />
    </div>
  );
}

function NotificationsSection() {
  const [settings, setSettings] = useState<NotificationsSettings>(DEFAULT_NOTIFICATIONS);
  const [browserPermission, setBrowserPermission] = useState<NotificationPermission | 'unsupported'>('default');
  const [permissionRequesting, setPermissionRequesting] = useState(false);

  // Load settings on mount
  useEffect(() => {
    setSettings(getStoredNotifications());
    setBrowserPermission(getBrowserNotificationPermission());
  }, []);

  const updateSettings = (newSettings: NotificationsSettings) => {
    setSettings(newSettings);
    setStoredNotifications(newSettings);
  };

  const togglePreference = (key: keyof NotificationPreferences) => {
    const newSettings = {
      ...settings,
      preferences: {
        ...settings.preferences,
        [key]: !settings.preferences[key],
      },
    };
    updateSettings(newSettings);
  };

  const toggleBrowserNotifications = async () => {
    if (!settings.browserNotifications) {
      // Enabling - check permission first
      if (browserPermission === 'default') {
        setPermissionRequesting(true);
        const result = await requestNotificationPermission();
        setBrowserPermission(result);
        setPermissionRequesting(false);
        if (result === 'granted') {
          updateSettings({ ...settings, browserNotifications: true });
        }
      } else if (browserPermission === 'granted') {
        updateSettings({ ...settings, browserNotifications: true });
      }
    } else {
      // Disabling
      updateSettings({ ...settings, browserNotifications: false });
    }
  };

  const setToastDuration = (duration: ToastDuration) => {
    updateSettings({ ...settings, toastDuration: duration });
  };

  const setToastPosition = (position: ToastPosition) => {
    updateSettings({ ...settings, toastPosition: position });
  };

  return (
    <div data-testid="settings-notifications-section">
      <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">Notifications</h3>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        Configure how you receive notifications about activity in your workspace.
      </p>

      {/* Browser Notifications */}
      <div className="mb-8">
        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Browser Notifications</h4>

        {browserPermission === 'unsupported' && (
          <div className="mb-4 p-3 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
              <p className="text-sm text-yellow-700 dark:text-yellow-300">
                Browser notifications are not supported in this browser.
              </p>
            </div>
          </div>
        )}

        {browserPermission === 'denied' && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
              <p className="text-sm text-red-700 dark:text-red-300">
                Browser notifications are blocked. Please enable them in your browser settings.
              </p>
            </div>
          </div>
        )}

        {browserPermission === 'default' && (
          <div className="mb-4">
            <button
              onClick={toggleBrowserNotifications}
              disabled={permissionRequesting}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg"
              data-testid="request-permission-button"
            >
              <BellRing className="w-4 h-4" />
              {permissionRequesting ? 'Requesting...' : 'Enable Browser Notifications'}
            </button>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              Click to request permission for browser notifications.
            </p>
          </div>
        )}

        {browserPermission === 'granted' && (
          <div className="mb-4">
            <div className="flex items-center justify-between p-4 rounded-lg border border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <Check className="w-4 h-4 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">Browser Notifications</span>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Show desktop notifications for important events
                  </p>
                </div>
              </div>
              <ToggleSwitch
                enabled={settings.browserNotifications}
                onToggle={toggleBrowserNotifications}
                testId="browser-notifications-toggle"
              />
            </div>
          </div>
        )}
      </div>

      {/* Notification Preferences */}
      <div className="mb-8">
        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Notification Types</h4>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
          Choose which events you want to be notified about.
        </p>

        <div className="border border-gray-200 dark:border-gray-700 rounded-lg divide-y divide-gray-200 dark:divide-gray-700 px-4">
          <NotificationToggleRow
            icon={Users}
            label="Task assigned to me"
            description="When a task is assigned to you or your team"
            enabled={settings.preferences.taskAssigned}
            onToggle={() => togglePreference('taskAssigned')}
            testId="notification-task-assigned"
          />
          <NotificationToggleRow
            icon={CheckCircle2}
            label="Task completed"
            description="When a task you're watching is completed"
            enabled={settings.preferences.taskCompleted}
            onToggle={() => togglePreference('taskCompleted')}
            testId="notification-task-completed"
          />
          <NotificationToggleRow
            icon={MessageSquare}
            label="New message in channel"
            description="When you receive a new message in a channel"
            enabled={settings.preferences.newMessage}
            onToggle={() => togglePreference('newMessage')}
            testId="notification-new-message"
          />
          <NotificationToggleRow
            icon={Workflow}
            label="Workflow completed/failed"
            description="When a workflow finishes or encounters an error"
            enabled={settings.preferences.workflowCompleted}
            onToggle={() => togglePreference('workflowCompleted')}
            testId="notification-workflow-completed"
          />
        </div>
      </div>

      {/* Toast Settings */}
      <div className="mb-8">
        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Toast Notifications</h4>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
          Configure how in-app toast notifications appear.
        </p>

        {/* Duration */}
        <div className="mb-4">
          <label className="text-sm text-gray-600 dark:text-gray-400 mb-2 block">Duration</label>
          <div className="flex gap-2">
            {([
              { value: 3000 as ToastDuration, label: '3 seconds' },
              { value: 5000 as ToastDuration, label: '5 seconds' },
              { value: 10000 as ToastDuration, label: '10 seconds' },
            ]).map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setToastDuration(value)}
                className={`
                  px-4 py-2 text-sm rounded-lg border transition-all
                  ${settings.toastDuration === value
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                    : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                  }
                `}
                data-testid={`toast-duration-${value}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Position */}
        <div>
          <label className="text-sm text-gray-600 dark:text-gray-400 mb-2 block">Position</label>
          <div className="grid grid-cols-2 gap-2">
            {([
              { value: 'top-right' as ToastPosition, label: 'Top Right' },
              { value: 'top-left' as ToastPosition, label: 'Top Left' },
              { value: 'bottom-right' as ToastPosition, label: 'Bottom Right' },
              { value: 'bottom-left' as ToastPosition, label: 'Bottom Left' },
            ]).map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setToastPosition(value)}
                className={`
                  px-4 py-2 text-sm rounded-lg border transition-all
                  ${settings.toastPosition === value
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                    : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                  }
                `}
                data-testid={`toast-position-${value}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Note */}
      <p className="text-xs text-gray-400 dark:text-gray-500 mt-6 text-center">
        Notification settings are saved automatically and apply immediately.
      </p>
    </div>
  );
}

// ============================================================================
// Sync Section Types and Helpers
// ============================================================================

interface SyncStatus {
  dirtyElementCount: number;
  dirtyDependencyCount: number;
  hasPendingChanges: boolean;
  exportPath: string;
  lastExportAt?: string;
  lastImportAt?: string;
}

interface ExportResult {
  success: boolean;
  elementsExported: number;
  dependenciesExported: number;
  elementsFile: string;
  dependenciesFile: string;
  exportedAt: string;
}

interface ImportResult {
  success: boolean;
  elementsImported: number;
  elementsSkipped: number;
  dependenciesImported: number;
  dependenciesSkipped: number;
  conflicts: Array<{ elementId: string; resolution: string }>;
  errors: Array<{ line: number; file: string; message: string }>;
  importedAt: string;
}

// Storage key for sync settings
const SYNC_STORAGE_KEY = 'settings.sync';

interface SyncSettings {
  autoExport: boolean;
  lastExportAt?: string;
  lastImportAt?: string;
}

const DEFAULT_SYNC_SETTINGS: SyncSettings = {
  autoExport: false,
};

function getStoredSyncSettings(): SyncSettings {
  if (typeof window === 'undefined') return DEFAULT_SYNC_SETTINGS;
  const stored = localStorage.getItem(SYNC_STORAGE_KEY);
  if (stored) {
    try {
      return { ...DEFAULT_SYNC_SETTINGS, ...JSON.parse(stored) };
    } catch {
      return DEFAULT_SYNC_SETTINGS;
    }
  }
  return DEFAULT_SYNC_SETTINGS;
}

function setStoredSyncSettings(settings: SyncSettings) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(SYNC_STORAGE_KEY, JSON.stringify(settings));
}

// ============================================================================
// Sync Section Component
// ============================================================================

function SyncSection() {
  const queryClient = useQueryClient();
  const [syncSettings, setSyncSettings] = useState<SyncSettings>(DEFAULT_SYNC_SETTINGS);
  const [exportResult, setExportResult] = useState<ExportResult | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load settings on mount
  useEffect(() => {
    setSyncSettings(getStoredSyncSettings());
  }, []);

  // Fetch sync status
  const { data: syncStatus, isLoading: statusLoading, refetch: refetchStatus } = useQuery<SyncStatus>({
    queryKey: ['sync', 'status'],
    queryFn: async () => {
      const response = await fetch('/api/sync/status');
      if (!response.ok) throw new Error('Failed to fetch sync status');
      return response.json();
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Export mutation
  const exportMutation = useMutation({
    mutationFn: async (includeEphemeral: boolean = false) => {
      const response = await fetch('/api/sync/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ includeEphemeral }),
      });
      if (!response.ok) throw new Error('Failed to export');
      return response.json() as Promise<ExportResult>;
    },
    onSuccess: (data) => {
      setExportResult(data);
      setImportResult(null);
      // Update last export time in settings
      const newSettings = { ...syncSettings, lastExportAt: data.exportedAt };
      setSyncSettings(newSettings);
      setStoredSyncSettings(newSettings);
      // Refetch status to update dirty count
      refetchStatus();
    },
  });

  // Import mutation
  const importMutation = useMutation({
    mutationFn: async (params: { elements: string; dependencies?: string; dryRun?: boolean; force?: boolean }) => {
      const response = await fetch('/api/sync/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      if (!response.ok) throw new Error('Failed to import');
      return response.json() as Promise<ImportResult>;
    },
    onSuccess: (data) => {
      setImportResult(data);
      setExportResult(null);
      // Update last import time in settings
      const newSettings = { ...syncSettings, lastImportAt: data.importedAt };
      setSyncSettings(newSettings);
      setStoredSyncSettings(newSettings);
      // Invalidate all queries since data changed
      queryClient.invalidateQueries();
    },
  });

  const handleExport = () => {
    exportMutation.mutate(false);
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    try {
      // Read all selected files
      let elementsContent = '';
      let dependenciesContent = '';

      for (const file of Array.from(files)) {
        const content = await file.text();
        if (file.name.includes('elements')) {
          elementsContent = content;
        } else if (file.name.includes('dependencies')) {
          dependenciesContent = content;
        } else {
          // Assume it's elements if not specified
          elementsContent = content;
        }
      }

      if (!elementsContent) {
        alert('No valid elements file found. Please select a file named "elements.jsonl" or containing "elements" in the filename.');
        return;
      }

      importMutation.mutate({ elements: elementsContent, dependencies: dependenciesContent });
    } catch (error) {
      console.error('Failed to read files:', error);
      alert('Failed to read the selected files.');
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const updateAutoExport = (enabled: boolean) => {
    const newSettings = { ...syncSettings, autoExport: enabled };
    setSyncSettings(newSettings);
    setStoredSyncSettings(newSettings);
  };

  const formatTimestamp = (timestamp?: string) => {
    if (!timestamp) return 'Never';
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  return (
    <div data-testid="settings-sync-section">
      <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">Sync</h3>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        Export and import your data as JSONL files. This allows you to backup your data, share it across machines, or version control your work.
      </p>

      {/* Status Section */}
      <div className="mb-8">
        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Status</h4>
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-3">
          {statusLoading ? (
            <div className="flex items-center gap-2 text-gray-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Loading status...</span>
            </div>
          ) : syncStatus ? (
            <>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <HardDrive className="w-4 h-4 text-gray-500" />
                  <span className="text-sm text-gray-600 dark:text-gray-400">Export Path</span>
                </div>
                <code className="text-xs bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded" data-testid="export-path">
                  {syncStatus.exportPath}
                </code>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 text-gray-500" />
                  <span className="text-sm text-gray-600 dark:text-gray-400">Pending Changes</span>
                </div>
                <span
                  className={`text-sm font-medium ${syncStatus.hasPendingChanges ? 'text-yellow-600 dark:text-yellow-400' : 'text-green-600 dark:text-green-400'}`}
                  data-testid="dirty-element-count"
                >
                  {syncStatus.dirtyElementCount} elements
                </span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Download className="w-4 h-4 text-gray-500" />
                  <span className="text-sm text-gray-600 dark:text-gray-400">Last Export</span>
                </div>
                <span className="text-sm text-gray-600 dark:text-gray-400" data-testid="last-export-time">
                  {formatTimestamp(syncSettings.lastExportAt)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Upload className="w-4 h-4 text-gray-500" />
                  <span className="text-sm text-gray-600 dark:text-gray-400">Last Import</span>
                </div>
                <span className="text-sm text-gray-600 dark:text-gray-400" data-testid="last-import-time">
                  {formatTimestamp(syncSettings.lastImportAt)}
                </span>
              </div>
            </>
          ) : (
            <div className="text-sm text-red-500">Failed to load status</div>
          )}
        </div>
      </div>

      {/* Auto-Export Toggle */}
      <div className="mb-8">
        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Auto Export</h4>
        <div className="flex items-center justify-between p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
          <div>
            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">Enable Auto Export</span>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Automatically export changes to JSONL files (feature coming soon)
            </p>
          </div>
          <ToggleSwitch
            enabled={syncSettings.autoExport}
            onToggle={() => updateAutoExport(!syncSettings.autoExport)}
            disabled={true} // Not yet implemented
            testId="auto-export-toggle"
          />
        </div>
      </div>

      {/* Export Section */}
      <div className="mb-8">
        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Export Data</h4>
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Export all elements and dependencies to JSONL files in the .elemental directory.
          </p>
          <button
            onClick={handleExport}
            disabled={exportMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="export-now-button"
          >
            {exportMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            {exportMutation.isPending ? 'Exporting...' : 'Export Now'}
          </button>

          {/* Export Result */}
          {exportResult && (
            <div className="mt-4 p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800" data-testid="export-result">
              <div className="flex items-center gap-2 text-green-700 dark:text-green-300 mb-2">
                <Check className="w-4 h-4" />
                <span className="font-medium">Export Successful</span>
              </div>
              <div className="text-sm text-green-600 dark:text-green-400 space-y-1">
                <div>Elements exported: {exportResult.elementsExported}</div>
                <div>Dependencies exported: {exportResult.dependenciesExported}</div>
                <div className="text-xs mt-2">
                  <div>Elements file: {exportResult.elementsFile}</div>
                  <div>Dependencies file: {exportResult.dependenciesFile}</div>
                </div>
              </div>
            </div>
          )}

          {exportMutation.isError && (
            <div className="mt-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
              <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
                <AlertCircle className="w-4 h-4" />
                <span>Export failed. Please try again.</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Import Section */}
      <div className="mb-8">
        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Import Data</h4>
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Import elements and dependencies from JSONL files. Select both elements.jsonl and dependencies.jsonl files.
          </p>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            accept=".jsonl"
            multiple
            className="hidden"
            data-testid="import-file-input"
          />
          <button
            onClick={handleImportClick}
            disabled={importMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="import-button"
          >
            {importMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Upload className="w-4 h-4" />
            )}
            {importMutation.isPending ? 'Importing...' : 'Import from File'}
          </button>

          {/* Import Result */}
          {importResult && (
            <div
              className={`mt-4 p-3 rounded-lg ${
                importResult.errors.length > 0
                  ? 'bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800'
                  : 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
              }`}
              data-testid="import-result"
            >
              <div className={`flex items-center gap-2 ${
                importResult.errors.length > 0
                  ? 'text-yellow-700 dark:text-yellow-300'
                  : 'text-green-700 dark:text-green-300'
              } mb-2`}>
                {importResult.errors.length > 0 ? (
                  <AlertTriangle className="w-4 h-4" />
                ) : (
                  <Check className="w-4 h-4" />
                )}
                <span className="font-medium">
                  {importResult.errors.length > 0 ? 'Import Completed with Warnings' : 'Import Successful'}
                </span>
              </div>
              <div className={`text-sm ${
                importResult.errors.length > 0
                  ? 'text-yellow-600 dark:text-yellow-400'
                  : 'text-green-600 dark:text-green-400'
              } space-y-1`}>
                <div>Elements imported: {importResult.elementsImported}</div>
                <div>Elements skipped: {importResult.elementsSkipped}</div>
                <div>Dependencies imported: {importResult.dependenciesImported}</div>
                <div>Dependencies skipped: {importResult.dependenciesSkipped}</div>
                {importResult.conflicts.length > 0 && (
                  <div className="mt-2">Conflicts resolved: {importResult.conflicts.length}</div>
                )}
                {importResult.errors.length > 0 && (
                  <div className="mt-2 text-xs text-red-600 dark:text-red-400">
                    Errors: {importResult.errors.length}
                    <ul className="list-disc list-inside mt-1">
                      {importResult.errors.slice(0, 3).map((err, i) => (
                        <li key={i}>{err.file}:{err.line} - {err.message}</li>
                      ))}
                      {importResult.errors.length > 3 && (
                        <li>... and {importResult.errors.length - 3} more</li>
                      )}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}

          {importMutation.isError && (
            <div className="mt-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
              <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
                <AlertCircle className="w-4 h-4" />
                <span>Import failed. Please check your files and try again.</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Note */}
      <p className="text-xs text-gray-400 dark:text-gray-500 mt-6 text-center">
        JSONL exports are git-friendly and can be version controlled for backup.
      </p>
    </div>
  );
}

function ComingSoonSection({ section }: { section: SectionNavItem }) {
  const Icon = section.icon;

  return (
    <div className="text-center py-12" data-testid={`settings-${section.id}-section`}>
      <div className="w-12 h-12 mx-auto mb-4 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
        <Icon className="w-6 h-6 text-gray-400" />
      </div>
      <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
        {section.label}
      </h3>
      <p className="text-sm text-gray-500 dark:text-gray-400">
        {section.description} settings are coming soon.
      </p>
    </div>
  );
}

export function SettingsPage() {
  const [currentTheme, setCurrentTheme] = useState<Theme>('system');
  const [activeSection, setActiveSection] = useState<SettingsSection>('theme');

  // Initialize theme from localStorage
  useEffect(() => {
    const stored = getStoredTheme();
    setCurrentTheme(stored);
    applyTheme(stored);
  }, []);

  // Listen for system theme changes when using 'system' mode
  useEffect(() => {
    if (currentTheme !== 'system') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      applyTheme('system');
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [currentTheme]);

  const handleThemeChange = (theme: Theme) => {
    setCurrentTheme(theme);
    setStoredTheme(theme);
    applyTheme(theme);
  };

  const renderSection = () => {
    if (activeSection === 'theme') {
      return (
        <ThemeSection
          currentTheme={currentTheme}
          onThemeChange={handleThemeChange}
        />
      );
    }

    if (activeSection === 'shortcuts') {
      return <ShortcutsSection />;
    }

    if (activeSection === 'defaults') {
      return <DefaultsSection />;
    }

    if (activeSection === 'notifications') {
      return <NotificationsSection />;
    }

    if (activeSection === 'sync') {
      return <SyncSection />;
    }

    const section = SETTINGS_SECTIONS.find((s) => s.id === activeSection);
    if (section) {
      return <ComingSoonSection section={section} />;
    }

    return null;
  };

  return (
    <div className="h-full flex" data-testid="settings-page">
      {/* Settings Sidebar */}
      <div className="w-64 border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
        <div className="p-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">Settings</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">Customize your experience</p>
        </div>
        <nav className="px-2 py-2 space-y-1" data-testid="settings-nav">
          {SETTINGS_SECTIONS.map((section) => {
            const Icon = section.icon;
            const isActive = activeSection === section.id;

            return (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={`
                  w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors
                  ${isActive
                    ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-white dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-200'
                  }
                `}
                data-testid={`settings-nav-${section.id}`}
              >
                <Icon className="w-5 h-5" />
                <div className="flex-1">
                  <span className="font-medium">{section.label}</span>
                  {!section.implemented && (
                    <span className="ml-2 text-xs text-gray-400">Soon</span>
                  )}
                </div>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Settings Content */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-2xl mx-auto p-8">
          {renderSection()}
        </div>
      </div>
    </div>
  );
}

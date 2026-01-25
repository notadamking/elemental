/**
 * Settings Page
 *
 * User preferences and configuration settings.
 * Includes theme selection, keyboard shortcuts, and more.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { Sun, Moon, Monitor, Palette, Keyboard, Settings2, Bell, RefreshCw, RotateCcw, X, AlertCircle, Check } from 'lucide-react';
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
  { id: 'defaults', label: 'Defaults', icon: Settings2, description: 'Default view settings', implemented: false },
  { id: 'notifications', label: 'Notifications', icon: Bell, description: 'Notification preferences', implemented: false },
  { id: 'sync', label: 'Sync', icon: RefreshCw, description: 'Sync configuration', implemented: false },
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

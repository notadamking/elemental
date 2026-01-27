/**
 * Settings Page
 *
 * User preferences and configuration settings.
 * Includes theme selection, keyboard shortcuts, and more.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Sun, Moon, Monitor, Palette, Keyboard, Settings2, Bell, RefreshCw, RotateCcw, X, AlertCircle, Check, List, LayoutGrid, Home, Workflow, Users, GitBranch, Clock, ArrowUp, Calendar, FileText, BellRing, MessageSquare, CheckCircle2, AlertTriangle, Download, Upload, Loader2, HardDrive, Contrast } from 'lucide-react';
import { useIsMobile } from '../hooks/useBreakpoint';
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

type Theme = 'light' | 'dark' | 'system' | 'high-contrast';

const THEME_STORAGE_KEY = 'settings.theme';

function getStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'system';
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === 'light' || stored === 'dark' || stored === 'system' || stored === 'high-contrast') {
    return stored;
  }
  return 'system';
}

const HIGH_CONTRAST_BASE_KEY = 'settings.highContrastBase';

function getHighContrastBase(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  const stored = localStorage.getItem(HIGH_CONTRAST_BASE_KEY);
  return stored === 'dark' ? 'dark' : 'light';
}

function setHighContrastBase(base: 'light' | 'dark') {
  if (typeof window === 'undefined') return;
  localStorage.setItem(HIGH_CONTRAST_BASE_KEY, base);
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
  const root = document.documentElement;

  // Remove all theme classes first
  root.classList.remove('dark', 'theme-dark', 'theme-light', 'high-contrast');

  if (theme === 'high-contrast') {
    // High contrast mode - use stored base (light or dark)
    const base = getHighContrastBase();
    root.classList.add('high-contrast');
    if (base === 'dark') {
      root.classList.add('dark', 'theme-dark');
    } else {
      root.classList.add('theme-light');
    }
  } else {
    const resolvedTheme = theme === 'system' ? getSystemTheme() : theme;
    if (resolvedTheme === 'dark') {
      root.classList.add('dark', 'theme-dark');
    } else {
      root.classList.add('theme-light');
    }
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
  isMobile,
}: {
  theme: Theme;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  isSelected: boolean;
  onSelect: () => void;
  isMobile?: boolean;
}) {
  return (
    <button
      onClick={onSelect}
      className={`
        flex items-start gap-3 sm:gap-4 p-3 sm:p-4 rounded-lg border transition-all text-left w-full min-h-[60px]
        ${isSelected
          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-400 ring-2 ring-blue-200 dark:ring-blue-800'
          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800/50 active:bg-gray-100 dark:active:bg-gray-700'
        }
      `}
      data-testid={`theme-option-${theme}`}
    >
      <div className={`
        w-9 h-9 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center flex-shrink-0
        ${isSelected
          ? 'bg-blue-500 text-white'
          : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
        }
      `}>
        <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`font-medium text-sm sm:text-base ${isSelected ? 'text-blue-700 dark:text-blue-300' : 'text-gray-900 dark:text-gray-100'}`}>
            {label}
          </span>
          {isSelected && (
            <span className="px-2 py-0.5 text-xs font-medium bg-blue-100 dark:bg-blue-800 text-blue-700 dark:text-blue-200 rounded">
              Active
            </span>
          )}
        </div>
        <p className={`text-xs sm:text-sm mt-0.5 ${isSelected ? 'text-gray-700 dark:text-gray-300' : 'text-gray-500 dark:text-gray-400'} ${isMobile ? 'line-clamp-2' : ''}`}>{description}</p>
      </div>
    </button>
  );
}

function ThemeSection({
  currentTheme,
  onThemeChange,
  isMobile,
}: {
  currentTheme: Theme;
  onThemeChange: (theme: Theme) => void;
  isMobile: boolean;
}) {
  const [highContrastBase, setHighContrastBaseState] = useState<'light' | 'dark'>('light');

  // Initialize high contrast base on mount
  useEffect(() => {
    setHighContrastBaseState(getHighContrastBase());
  }, []);

  const handleHighContrastBaseChange = (base: 'light' | 'dark') => {
    setHighContrastBase(base);
    setHighContrastBaseState(base);
    if (currentTheme === 'high-contrast') {
      // Re-apply theme to update the styling
      applyTheme('high-contrast');
    }
  };

  // Resolve the displayed theme
  const resolvedTheme = currentTheme === 'system'
    ? getSystemTheme()
    : currentTheme === 'high-contrast'
    ? highContrastBase
    : currentTheme;

  return (
    <div data-testid="settings-theme-section">
      <h3 className="text-base sm:text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">Theme</h3>
      <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-4 sm:mb-6">
        Choose how the application looks. You can select light mode, dark mode, high contrast mode, or follow your system settings.
      </p>

      <div className="space-y-2 sm:space-y-3">
        <ThemeOption
          theme="light"
          label="Light"
          description="A clean, bright interface for daytime use"
          icon={Sun}
          isSelected={currentTheme === 'light'}
          onSelect={() => onThemeChange('light')}
          isMobile={isMobile}
        />
        <ThemeOption
          theme="dark"
          label="Dark"
          description="Easy on the eyes, perfect for low-light environments"
          icon={Moon}
          isSelected={currentTheme === 'dark'}
          onSelect={() => onThemeChange('dark')}
          isMobile={isMobile}
        />
        <ThemeOption
          theme="high-contrast"
          label="High Contrast"
          description="Improved readability with enhanced color contrast (WCAG AAA)"
          icon={Contrast}
          isSelected={currentTheme === 'high-contrast'}
          onSelect={() => onThemeChange('high-contrast')}
          isMobile={isMobile}
        />
        <ThemeOption
          theme="system"
          label="System"
          description={`Automatically match your system preference (currently ${resolvedTheme})`}
          icon={Monitor}
          isSelected={currentTheme === 'system'}
          onSelect={() => onThemeChange('system')}
          isMobile={isMobile}
        />
      </div>

      {/* High Contrast Base Toggle */}
      {currentTheme === 'high-contrast' && (
        <div className="mt-4 sm:mt-6 p-3 sm:p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50" data-testid="high-contrast-base-section">
          <h4 className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 sm:mb-3">High Contrast Base</h4>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2 sm:mb-3">
            Choose whether high contrast mode uses a light or dark base.
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <button
              onClick={() => handleHighContrastBaseChange('light')}
              className={`
                flex items-center justify-center sm:justify-start gap-2 px-4 py-3 sm:py-2 rounded-lg border transition-all text-sm min-h-[44px]
                ${highContrastBase === 'light'
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                  : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 active:bg-gray-200 dark:active:bg-gray-700'
                }
              `}
              data-testid="high-contrast-base-light"
            >
              <Sun className="w-4 h-4" />
              Light Base
            </button>
            <button
              onClick={() => handleHighContrastBaseChange('dark')}
              className={`
                flex items-center justify-center sm:justify-start gap-2 px-4 py-3 sm:py-2 rounded-lg border transition-all text-sm min-h-[44px]
                ${highContrastBase === 'dark'
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                  : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 active:bg-gray-200 dark:active:bg-gray-700'
                }
              `}
              data-testid="high-contrast-base-dark"
            >
              <Moon className="w-4 h-4" />
              Dark Base
            </button>
          </div>
        </div>
      )}

      {/* Theme Preview */}
      <div className="mt-6 sm:mt-8">
        <h4 className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 sm:mb-3">Preview</h4>
        <div className={`
          p-4 rounded-lg border
          ${currentTheme === 'high-contrast'
            ? highContrastBase === 'dark'
              ? 'bg-black border-white'
              : 'bg-white border-black border-2'
            : resolvedTheme === 'dark'
              ? 'bg-gray-900 border-gray-700'
              : 'bg-white border-gray-200'
          }
        `} data-testid="theme-preview">
          <div className="flex items-center gap-3 mb-3">
            <div className={`w-8 h-8 rounded-full ${
              currentTheme === 'high-contrast'
                ? highContrastBase === 'dark' ? 'bg-[#66b3ff]' : 'bg-[#0052cc]'
                : resolvedTheme === 'dark' ? 'bg-blue-500' : 'bg-blue-600'
            }`} />
            <div>
              <div className={`text-sm font-medium ${
                currentTheme === 'high-contrast'
                  ? highContrastBase === 'dark' ? 'text-white' : 'text-black'
                  : resolvedTheme === 'dark' ? 'text-white' : 'text-gray-900'
              }`}>
                Sample Task
              </div>
              <div className={`text-xs ${
                currentTheme === 'high-contrast'
                  ? highContrastBase === 'dark' ? 'text-[#e0e0e0]' : 'text-[#333333]'
                  : resolvedTheme === 'dark' ? 'text-gray-400' : 'text-gray-500'
              }`}>
                This is how content will appear
              </div>
            </div>
          </div>
          <div className={`
            text-xs px-2 py-1 rounded inline-block
            ${currentTheme === 'high-contrast'
              ? highContrastBase === 'dark'
                ? 'bg-[rgba(102,178,255,0.2)] text-[#66b3ff]'
                : 'bg-[#cce5ff] text-[#0052cc]'
              : resolvedTheme === 'dark'
                ? 'bg-blue-900/50 text-blue-200'
                : 'bg-blue-100 text-blue-800'
            }
          `}>
            Open
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
  isMobile: boolean;
}

function ShortcutEditModal({ actionId, description, currentKeys, defaultKeys, onSave, onCancel, isMobile }: ShortcutEditModalProps) {
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
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50" data-testid="shortcut-edit-modal">
      <div className={`
        bg-white dark:bg-gray-800 shadow-xl w-full p-4 sm:p-6
        ${isMobile
          ? 'rounded-t-2xl max-h-[90vh] overflow-y-auto pb-safe'
          : 'rounded-lg max-w-md'
        }
      `}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100">Edit Shortcut</h3>
          <button
            onClick={onCancel}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 min-h-[44px] min-w-[44px] flex items-center justify-center"
            data-testid="shortcut-edit-close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-4">{description}</p>

        <div
          ref={inputRef}
          tabIndex={0}
          onClick={handleStartCapture}
          onBlur={handleStopCapture}
          className={`
            p-4 sm:p-6 rounded-lg border-2 text-center font-mono text-base sm:text-lg cursor-pointer transition-all min-h-[60px] flex items-center justify-center
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
            <p className="text-xs sm:text-sm text-red-600 dark:text-red-400" data-testid="shortcut-conflict-warning">
              Conflicts with: {conflict}
            </p>
          </div>
        )}

        <div className={`mt-6 ${isMobile ? 'space-y-3' : 'flex items-center justify-between'}`}>
          <button
            onClick={handleResetToDefault}
            className={`flex items-center justify-center gap-2 px-3 py-3 sm:py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 min-h-[44px] ${isMobile ? 'w-full border border-gray-200 dark:border-gray-700 rounded-lg' : ''}`}
            data-testid="shortcut-reset-default"
          >
            <RotateCcw className="w-4 h-4" />
            Reset to Default
          </button>
          <div className={`flex gap-2 ${isMobile ? 'flex-col-reverse' : ''}`}>
            <button
              onClick={onCancel}
              className={`px-4 py-3 sm:py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg min-h-[44px] ${isMobile ? 'w-full border border-gray-200 dark:border-gray-700' : ''}`}
              data-testid="shortcut-edit-cancel"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={capturedKeys.length === 0 || !!conflict}
              className={`px-4 py-3 sm:py-2 text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg flex items-center justify-center gap-2 min-h-[44px] ${isMobile ? 'w-full' : ''}`}
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
  isMobile?: boolean;
}

function ShortcutRow({ actionId, description, currentKeys, isCustomized, onEdit, isMobile }: ShortcutRowProps) {
  return (
    <button
      onClick={onEdit}
      className={`
        w-full text-left py-3 px-3 sm:px-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 active:bg-gray-100 dark:active:bg-gray-700 rounded-lg group min-h-[56px]
        ${isMobile ? 'flex flex-col gap-2' : 'flex items-center justify-between'}
      `}
      data-testid={`shortcut-row-${actionId}`}
    >
      <div className={`${isMobile ? 'w-full' : 'flex-1'}`}>
        <span className="text-xs sm:text-sm text-gray-900 dark:text-gray-100">{description}</span>
        {isCustomized && (
          <span className="ml-2 text-xs px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded">
            Customized
          </span>
        )}
      </div>
      <div className={`flex items-center gap-3 ${isMobile ? 'w-full justify-between' : ''}`}>
        <kbd className="px-2 py-1 text-xs sm:text-sm font-mono bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded border border-gray-200 dark:border-gray-700">
          {formatShortcutDisplay(currentKeys)}
        </kbd>
        <span
          className={`text-xs sm:text-sm text-blue-600 dark:text-blue-400 ${isMobile ? '' : 'opacity-0 group-hover:opacity-100 transition-opacity'}`}
        >
          {isMobile ? 'Edit' : 'Customize'}
        </span>
      </div>
    </button>
  );
}

function ShortcutsSection({ isMobile }: { isMobile: boolean }) {
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
  };

  const handleResetAll = () => {
    resetAllShortcuts();
    setCustomShortcuts({});
    setShowResetConfirm(false);
  };

  const hasCustomizations = Object.keys(customShortcuts).length > 0;

  return (
    <div data-testid="settings-shortcuts-section">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
        <h3 className="text-base sm:text-lg font-medium text-gray-900 dark:text-gray-100">Keyboard Shortcuts</h3>
        {hasCustomizations && (
          <button
            onClick={() => setShowResetConfirm(true)}
            className="flex items-center gap-2 px-3 py-2 sm:py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 sm:border-0 min-h-[44px] sm:min-h-0"
            data-testid="shortcuts-reset-all"
          >
            <RotateCcw className="w-4 h-4" />
            Reset to Defaults
          </button>
        )}
      </div>
      <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-4 sm:mb-6">
        View and customize keyboard shortcuts. {isMobile ? 'Tap' : 'Click "Customize"'} to change a shortcut.
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
                      isMobile={isMobile}
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
          isMobile={isMobile}
        />
      )}

      {/* Reset Confirmation */}
      {showResetConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50" data-testid="reset-confirm-modal">
          <div className={`
            bg-white dark:bg-gray-800 shadow-xl w-full p-4 sm:p-6
            ${isMobile ? 'rounded-t-2xl' : 'rounded-lg max-w-sm'}
          `}>
            <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">Reset All Shortcuts?</h3>
            <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-4 sm:mb-6">
              This will reset all keyboard shortcuts to their default values. This action cannot be undone.
            </p>
            <div className={`flex gap-2 ${isMobile ? 'flex-col-reverse' : 'justify-end'}`}>
              <button
                onClick={() => setShowResetConfirm(false)}
                className={`px-4 py-3 sm:py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg min-h-[44px] ${isMobile ? 'w-full border border-gray-200 dark:border-gray-700' : ''}`}
                data-testid="reset-confirm-cancel"
              >
                Cancel
              </button>
              <button
                onClick={handleResetAll}
                className={`px-4 py-3 sm:py-2 text-sm font-medium text-white bg-red-500 hover:bg-red-600 rounded-lg min-h-[44px] ${isMobile ? 'w-full' : ''}`}
                data-testid="reset-confirm-yes"
              >
                Reset All
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Note about shortcuts */}
      <p className="text-xs text-gray-400 dark:text-gray-500 mt-6 text-center">
        Changes to keyboard shortcuts take effect immediately.
      </p>
    </div>
  );
}

// Storage keys for defaults
const DEFAULTS_STORAGE_KEY = 'settings.defaults';

type TasksViewMode = 'list' | 'kanban';
type DashboardLens = 'overview' | 'task-flow' | 'dependencies' | 'timeline';
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

// Storage key for last visited dashboard section
const LAST_VISITED_DASHBOARD_KEY = 'dashboard.lastVisited';

/**
 * Get the last visited dashboard section from localStorage
 * Falls back to user's default dashboard lens if not set
 */
export function getLastVisitedDashboardSection(): DashboardLens {
  if (typeof window === 'undefined') {
    return getDefaultDashboardLens();
  }
  const stored = localStorage.getItem(LAST_VISITED_DASHBOARD_KEY);
  if (stored && ['overview', 'task-flow', 'dependencies', 'timeline'].includes(stored)) {
    return stored as DashboardLens;
  }
  return getDefaultDashboardLens();
}

/**
 * Set the last visited dashboard section in localStorage
 */
export function setLastVisitedDashboardSection(section: DashboardLens): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(LAST_VISITED_DASHBOARD_KEY, section);
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
        flex items-start gap-2 sm:gap-3 p-2.5 sm:p-3 rounded-lg border transition-all text-left w-full min-h-[56px] active:scale-[0.98]
        ${isSelected
          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-400'
          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800/50 active:bg-gray-100 dark:active:bg-gray-700'
        }
      `}
      data-testid={testId}
    >
      <div className={`
        w-7 h-7 sm:w-8 sm:h-8 rounded flex items-center justify-center flex-shrink-0
        ${isSelected
          ? 'bg-blue-500 text-white'
          : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
        }
      `}>
        <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1 sm:gap-2">
          <span className={`text-xs sm:text-sm font-medium ${isSelected ? 'text-blue-700 dark:text-blue-300' : 'text-gray-900 dark:text-gray-100'}`}>
            {label}
          </span>
          {isSelected && (
            <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-500 flex-shrink-0" />
          )}
        </div>
        <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">{description}</p>
      </div>
    </button>
  );
}

function DefaultsSection({ isMobile: _isMobile }: { isMobile: boolean }) {
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
      <h3 className="text-base sm:text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">Default Views</h3>
      <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-4 sm:mb-6">
        Set default view preferences that will be applied when you first load pages.
      </p>

      {/* Tasks Default View */}
      <div className="mb-6 sm:mb-8">
        <h4 className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 sm:mb-3">Tasks View</h4>
        <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 mb-2 sm:mb-3">
          Choose the default view when opening the Tasks page.
        </p>
        <div className="grid grid-cols-2 gap-2 sm:gap-3">
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
      <div className="mb-6 sm:mb-8">
        <h4 className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 sm:mb-3">Dashboard Lens</h4>
        <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 mb-2 sm:mb-3">
          Choose the default dashboard view when navigating to the Dashboard.
        </p>
        <div className="grid grid-cols-2 gap-2 sm:gap-3">
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
      <div className="mb-6 sm:mb-8">
        <h4 className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 sm:mb-3">Default Sort Order</h4>
        <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 mb-2 sm:mb-3">
          Choose how lists are sorted by default across the application.
        </p>
        <div className="grid grid-cols-2 gap-2 sm:gap-3">
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
  toastPosition: 'bottom-right',
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
        relative inline-flex h-7 w-12 sm:h-6 sm:w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 flex-shrink-0
        ${enabled ? 'bg-blue-500' : 'bg-gray-200 dark:bg-gray-700'}
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
      `}
      role="switch"
      aria-checked={enabled}
      data-testid={testId}
    >
      <span
        className={`
          inline-block h-5 w-5 sm:h-4 sm:w-4 transform rounded-full bg-white transition-transform
          ${enabled ? 'translate-x-6 sm:translate-x-6' : 'translate-x-1'}
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
      className={`flex items-center justify-between py-3 sm:py-4 px-3 sm:px-4 gap-3 min-h-[56px] ${disabled ? 'opacity-50' : ''}`}
      data-testid={testId}
    >
      <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
        <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0">
          <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-600 dark:text-gray-400" />
        </div>
        <div className="min-w-0 flex-1">
          <span className="text-xs sm:text-sm font-medium text-gray-900 dark:text-gray-100 block">{label}</span>
          <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 line-clamp-2">{description}</p>
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

function NotificationsSection({ isMobile }: { isMobile: boolean }) {
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
      <h3 className="text-base sm:text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">Notifications</h3>
      <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-4 sm:mb-6">
        Configure how you receive notifications about activity in your workspace.
      </p>

      {/* Browser Notifications */}
      <div className="mb-6 sm:mb-8">
        <h4 className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 sm:mb-3">Browser Notifications</h4>

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

        <div className="border border-gray-200 dark:border-gray-700 rounded-lg divide-y divide-gray-200 dark:divide-gray-700">
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
      <div className="mb-6 sm:mb-8">
        <h4 className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 sm:mb-3">Toast Notifications</h4>
        <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 mb-3 sm:mb-4">
          Configure how in-app toast notifications appear.
        </p>

        {/* Duration */}
        <div className="mb-4">
          <label className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mb-2 block">Duration</label>
          <div className={`flex gap-2 ${isMobile ? 'flex-col' : ''}`}>
            {([
              { value: 3000 as ToastDuration, label: '3 seconds' },
              { value: 5000 as ToastDuration, label: '5 seconds' },
              { value: 10000 as ToastDuration, label: '10 seconds' },
            ]).map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setToastDuration(value)}
                className={`
                  px-4 py-3 sm:py-2 text-xs sm:text-sm rounded-lg border transition-all min-h-[44px] active:scale-[0.98]
                  ${settings.toastDuration === value
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                    : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 active:bg-gray-100 dark:active:bg-gray-700'
                  }
                  ${isMobile ? 'w-full' : ''}
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
          <label className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mb-2 block">Position</label>
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
                  px-4 py-3 sm:py-2 text-xs sm:text-sm rounded-lg border transition-all min-h-[44px] active:scale-[0.98]
                  ${settings.toastPosition === value
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                    : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 active:bg-gray-100 dark:active:bg-gray-700'
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

function SyncSection({ isMobile }: { isMobile: boolean }) {
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
      <h3 className="text-base sm:text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">Sync</h3>
      <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-4 sm:mb-6">
        Export and import your data as JSONL files. This allows you to backup your data, share it across machines, or version control your work.
      </p>

      {/* Status Section */}
      <div className="mb-6 sm:mb-8">
        <h4 className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 sm:mb-3">Status</h4>
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 sm:p-4 space-y-3">
          {statusLoading ? (
            <div className="flex items-center gap-2 text-gray-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-xs sm:text-sm">Loading status...</span>
            </div>
          ) : syncStatus ? (
            <>
              <div className={`flex gap-2 ${isMobile ? 'flex-col' : 'items-center justify-between'}`}>
                <div className="flex items-center gap-2">
                  <HardDrive className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-500 flex-shrink-0" />
                  <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">Export Path</span>
                </div>
                <code className="text-[10px] sm:text-xs bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded truncate max-w-full" data-testid="export-path">
                  {syncStatus.exportPath}
                </code>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <RefreshCw className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-500 flex-shrink-0" />
                  <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">Pending Changes</span>
                </div>
                <span
                  className={`text-xs sm:text-sm font-medium ${syncStatus.hasPendingChanges ? 'text-yellow-600 dark:text-yellow-400' : 'text-green-600 dark:text-green-400'}`}
                  data-testid="dirty-element-count"
                >
                  {syncStatus.dirtyElementCount} elements
                </span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Download className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-500 flex-shrink-0" />
                  <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">Last Export</span>
                </div>
                <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-400" data-testid="last-export-time">
                  {formatTimestamp(syncSettings.lastExportAt)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Upload className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-500 flex-shrink-0" />
                  <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">Last Import</span>
                </div>
                <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-400" data-testid="last-import-time">
                  {formatTimestamp(syncSettings.lastImportAt)}
                </span>
              </div>
            </>
          ) : (
            <div className="text-xs sm:text-sm text-red-500">Failed to load status</div>
          )}
        </div>
      </div>

      {/* Auto-Export Toggle */}
      <div className="mb-6 sm:mb-8">
        <h4 className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 sm:mb-3">Auto Export</h4>
        <div className="flex items-center justify-between gap-3 p-3 sm:p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
          <div className="min-w-0 flex-1">
            <span className="text-xs sm:text-sm font-medium text-gray-900 dark:text-gray-100 block">Enable Auto Export</span>
            <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 mt-0.5">
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
      <div className="mb-6 sm:mb-8">
        <h4 className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 sm:mb-3">Export Data</h4>
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 sm:p-4">
          <p className="text-[10px] sm:text-sm text-gray-500 dark:text-gray-400 mb-3 sm:mb-4">
            Export all elements and dependencies to JSONL files in the .elemental directory.
          </p>
          <button
            onClick={handleExport}
            disabled={exportMutation.isPending}
            className={`flex items-center justify-center gap-2 px-4 py-3 sm:py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-xs sm:text-sm min-h-[44px] ${isMobile ? 'w-full' : ''}`}
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
            <div className="mt-3 sm:mt-4 p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800" data-testid="export-result">
              <div className="flex items-center gap-2 text-green-700 dark:text-green-300 mb-2">
                <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span className="font-medium text-xs sm:text-sm">Export Successful</span>
              </div>
              <div className="text-[10px] sm:text-sm text-green-600 dark:text-green-400 space-y-1">
                <div>Elements exported: {exportResult.elementsExported}</div>
                <div>Dependencies exported: {exportResult.dependenciesExported}</div>
                <div className="text-[10px] sm:text-xs mt-2 break-all">
                  <div>Elements file: {exportResult.elementsFile}</div>
                  <div>Dependencies file: {exportResult.dependenciesFile}</div>
                </div>
              </div>
            </div>
          )}

          {exportMutation.isError && (
            <div className="mt-3 sm:mt-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
              <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
                <AlertCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span className="text-xs sm:text-sm">Export failed. Please try again.</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Import Section */}
      <div className="mb-6 sm:mb-8">
        <h4 className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 sm:mb-3">Import Data</h4>
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 sm:p-4">
          <p className="text-[10px] sm:text-sm text-gray-500 dark:text-gray-400 mb-3 sm:mb-4">
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
            className={`flex items-center justify-center gap-2 px-4 py-3 sm:py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed text-xs sm:text-sm min-h-[44px] ${isMobile ? 'w-full' : ''}`}
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
              className={`mt-3 sm:mt-4 p-3 rounded-lg ${
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
                  <AlertTriangle className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                ) : (
                  <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                )}
                <span className="font-medium text-xs sm:text-sm">
                  {importResult.errors.length > 0 ? 'Import Completed with Warnings' : 'Import Successful'}
                </span>
              </div>
              <div className={`text-[10px] sm:text-sm ${
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
                  <div className="mt-2 text-[10px] sm:text-xs text-red-600 dark:text-red-400">
                    Errors: {importResult.errors.length}
                    <ul className="list-disc list-inside mt-1">
                      {importResult.errors.slice(0, 3).map((err, i) => (
                        <li key={i} className="break-all">{err.file}:{err.line} - {err.message}</li>
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
            <div className="mt-3 sm:mt-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
              <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
                <AlertCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span className="text-xs sm:text-sm">Import failed. Please check your files and try again.</span>
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
  const isMobile = useIsMobile();
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
          isMobile={isMobile}
        />
      );
    }

    if (activeSection === 'shortcuts') {
      return <ShortcutsSection isMobile={isMobile} />;
    }

    if (activeSection === 'defaults') {
      return <DefaultsSection isMobile={isMobile} />;
    }

    if (activeSection === 'notifications') {
      return <NotificationsSection isMobile={isMobile} />;
    }

    if (activeSection === 'sync') {
      return <SyncSection isMobile={isMobile} />;
    }

    const section = SETTINGS_SECTIONS.find((s) => s.id === activeSection);
    if (section) {
      return <ComingSoonSection section={section} />;
    }

    return null;
  };

  return (
    <div className="h-full flex flex-col lg:flex-row" data-testid="settings-page">
      {/* Mobile Header */}
      {isMobile && (
        <div className="p-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
          <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Settings</h1>
        </div>
      )}

      {/* Mobile: Horizontal scrollable tabs / Desktop: Sidebar */}
      {isMobile ? (
        <div className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
          <nav
            className="flex overflow-x-auto px-2 py-2 gap-1 no-scrollbar"
            data-testid="settings-nav"
          >
            {SETTINGS_SECTIONS.map((section) => {
              const Icon = section.icon;
              const isActive = activeSection === section.id;

              return (
                <button
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  className={`
                    flex items-center gap-2 px-3 py-2 rounded-lg whitespace-nowrap transition-colors flex-shrink-0 min-h-[44px]
                    ${isActive
                      ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow-sm'
                      : 'text-gray-600 dark:text-gray-400 active:bg-white dark:active:bg-gray-800'
                    }
                  `}
                  data-testid={`settings-nav-${section.id}`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="text-sm font-medium">{section.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      ) : (
        <div className="w-64 border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 flex-shrink-0">
          <div className="p-4">
            <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-1">Settings</h1>
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
      )}

      {/* Settings Content */}
      <div className="flex-1 overflow-auto">
        <div className={`mx-auto ${isMobile ? 'p-4' : 'max-w-2xl p-8'}`}>
          {renderSection()}
        </div>
      </div>
    </div>
  );
}

/**
 * Settings API Hooks
 *
 * React hooks for managing user preferences and workspace settings.
 * Settings are persisted to localStorage for immediate availability.
 */

import { useState, useCallback, useEffect } from 'react';

// ============================================================================
// Types
// ============================================================================

export type Theme = 'light' | 'dark' | 'system';

export interface NotificationSettings {
  /** Show toasts for task completion */
  taskCompletion: boolean;
  /** Show toasts for agent health warnings */
  agentHealth: boolean;
  /** Show toasts for merge notifications */
  mergeNotifications: boolean;
  /** Play sound for notifications */
  sound: boolean;
  /** Toast auto-dismiss duration in ms (0 to disable) */
  toastDuration: number;
}

export interface WorkspaceSettings {
  /** Path to worktree directory relative to workspace root */
  worktreeDirectory: string;
  /** Ephemeral task retention period (e.g., '24h', '7d') */
  ephemeralRetention: string;
  /** Default branch for new worktrees */
  defaultBranch: string;
  /** Auto-merge passing branches */
  autoMerge: boolean;
}

export interface StewardScheduleSettings {
  /** Health steward check interval (e.g., '5m', '15m') */
  healthCheckInterval: string;
  /** Ops steward schedule (cron expression) */
  opsSchedule: string;
  /** Enable merge steward */
  mergeStewardEnabled: boolean;
  /** Enable health steward */
  healthStewardEnabled: boolean;
  /** Enable ops steward */
  opsStewardEnabled: boolean;
}

export interface Settings {
  theme: Theme;
  notifications: NotificationSettings;
  workspace: WorkspaceSettings;
  stewardSchedules: StewardScheduleSettings;
}

// ============================================================================
// Default Settings
// ============================================================================

const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  taskCompletion: true,
  agentHealth: true,
  mergeNotifications: true,
  sound: false,
  toastDuration: 5000,
};

const DEFAULT_WORKSPACE_SETTINGS: WorkspaceSettings = {
  worktreeDirectory: '.elemental/.worktrees/',
  ephemeralRetention: '24h',
  defaultBranch: 'main',
  autoMerge: false,
};

const DEFAULT_STEWARD_SCHEDULE_SETTINGS: StewardScheduleSettings = {
  healthCheckInterval: '5m',
  opsSchedule: '0 2 * * *', // 2 AM daily
  mergeStewardEnabled: true,
  healthStewardEnabled: true,
  opsStewardEnabled: true,
};

// Default settings (exported for testing and documentation)
export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  notifications: DEFAULT_NOTIFICATION_SETTINGS,
  workspace: DEFAULT_WORKSPACE_SETTINGS,
  stewardSchedules: DEFAULT_STEWARD_SCHEDULE_SETTINGS,
};

// ============================================================================
// Storage Keys
// ============================================================================

const THEME_KEY = 'settings.theme';
const NOTIFICATIONS_KEY = 'settings.notifications';
const WORKSPACE_KEY = 'settings.workspace';
const STEWARD_SCHEDULES_KEY = 'settings.stewardSchedules';

// ============================================================================
// Helper Functions
// ============================================================================

function loadFromStorage<T>(key: string, defaultValue: T): T {
  try {
    const stored = localStorage.getItem(key);
    if (stored) {
      return { ...defaultValue, ...JSON.parse(stored) };
    }
  } catch {
    // Ignore parse errors
  }
  return defaultValue;
}

function saveToStorage<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage errors
  }
}

// ============================================================================
// Hooks
// ============================================================================

/**
 * Hook for managing theme setting
 */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window === 'undefined') return 'system';
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      return stored;
    }
    return 'system';
  });

  const applyTheme = useCallback((t: Theme) => {
    const root = document.documentElement;
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

    // Remove all theme classes first
    root.classList.remove('dark', 'theme-dark', 'theme-light');

    const resolvedTheme = t === 'system' ? (systemDark ? 'dark' : 'light') : t;

    if (resolvedTheme === 'dark') {
      root.classList.add('dark', 'theme-dark');
    } else {
      root.classList.add('theme-light');
    }
  }, []);

  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem(THEME_KEY, theme);
  }, [theme, applyTheme]);

  // Listen for system theme changes when in 'system' mode
  useEffect(() => {
    if (theme !== 'system') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => applyTheme('system');

    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, [theme, applyTheme]);

  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme);
  }, []);

  const resolvedTheme = theme === 'system'
    ? (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : theme;

  return {
    theme,
    setTheme,
    resolvedTheme,
  };
}

/**
 * Hook for managing notification settings
 */
export function useNotificationSettings() {
  const [settings, setSettingsState] = useState<NotificationSettings>(() =>
    loadFromStorage(NOTIFICATIONS_KEY, DEFAULT_NOTIFICATION_SETTINGS)
  );

  useEffect(() => {
    saveToStorage(NOTIFICATIONS_KEY, settings);
  }, [settings]);

  const setSettings = useCallback((updates: Partial<NotificationSettings>) => {
    setSettingsState((prev) => ({ ...prev, ...updates }));
  }, []);

  const resetToDefaults = useCallback(() => {
    setSettingsState(DEFAULT_NOTIFICATION_SETTINGS);
  }, []);

  return {
    settings,
    setSettings,
    resetToDefaults,
  };
}

/**
 * Hook for managing workspace settings
 */
export function useWorkspaceSettings() {
  const [settings, setSettingsState] = useState<WorkspaceSettings>(() =>
    loadFromStorage(WORKSPACE_KEY, DEFAULT_WORKSPACE_SETTINGS)
  );

  useEffect(() => {
    saveToStorage(WORKSPACE_KEY, settings);
  }, [settings]);

  const setSettings = useCallback((updates: Partial<WorkspaceSettings>) => {
    setSettingsState((prev) => ({ ...prev, ...updates }));
  }, []);

  const resetToDefaults = useCallback(() => {
    setSettingsState(DEFAULT_WORKSPACE_SETTINGS);
  }, []);

  return {
    settings,
    setSettings,
    resetToDefaults,
  };
}

/**
 * Hook for managing steward schedule settings
 */
export function useStewardScheduleSettings() {
  const [settings, setSettingsState] = useState<StewardScheduleSettings>(() =>
    loadFromStorage(STEWARD_SCHEDULES_KEY, DEFAULT_STEWARD_SCHEDULE_SETTINGS)
  );

  useEffect(() => {
    saveToStorage(STEWARD_SCHEDULES_KEY, settings);
  }, [settings]);

  const setSettings = useCallback((updates: Partial<StewardScheduleSettings>) => {
    setSettingsState((prev) => ({ ...prev, ...updates }));
  }, []);

  const resetToDefaults = useCallback(() => {
    setSettingsState(DEFAULT_STEWARD_SCHEDULE_SETTINGS);
  }, []);

  return {
    settings,
    setSettings,
    resetToDefaults,
  };
}

/**
 * Hook for managing all settings
 */
export function useSettings() {
  const themeHook = useTheme();
  const notificationsHook = useNotificationSettings();
  const workspaceHook = useWorkspaceSettings();
  const stewardSchedulesHook = useStewardScheduleSettings();

  const settings: Settings = {
    theme: themeHook.theme,
    notifications: notificationsHook.settings,
    workspace: workspaceHook.settings,
    stewardSchedules: stewardSchedulesHook.settings,
  };

  const resetAllToDefaults = useCallback(() => {
    themeHook.setTheme('system');
    notificationsHook.resetToDefaults();
    workspaceHook.resetToDefaults();
    stewardSchedulesHook.resetToDefaults();
  }, [themeHook, notificationsHook, workspaceHook, stewardSchedulesHook]);

  return {
    settings,
    theme: themeHook,
    notifications: notificationsHook,
    workspace: workspaceHook,
    stewardSchedules: stewardSchedulesHook,
    resetAllToDefaults,
  };
}

// ============================================================================
// Keyboard Shortcuts Reference
// ============================================================================

export interface KeyboardShortcut {
  key: string;
  label: string;
  description: string;
}

export const KEYBOARD_SHORTCUTS: KeyboardShortcut[] = [
  { key: '⌘K', label: 'Command palette', description: 'Open the command palette for quick actions' },
  { key: '⌘B', label: 'Toggle sidebar', description: 'Show or hide the navigation sidebar' },
  { key: '⌘D', label: 'Toggle Director panel', description: 'Show or hide the Director terminal panel' },
  { key: '⌘/', label: 'Keyboard shortcuts', description: 'Show this keyboard shortcuts reference' },
  { key: 'Esc', label: 'Close dialog', description: 'Close any open dialog or panel' },
  { key: '↑↓', label: 'Navigate', description: 'Navigate through lists and options' },
  { key: 'Enter', label: 'Select', description: 'Select the current item or confirm action' },
];

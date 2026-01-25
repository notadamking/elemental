/**
 * Settings Page
 *
 * User preferences and configuration settings.
 * Includes theme selection, keyboard shortcuts, and more.
 */

import { useState, useEffect } from 'react';
import { Sun, Moon, Monitor, Palette, Keyboard, Settings2, Bell, RefreshCw } from 'lucide-react';

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
  { id: 'shortcuts', label: 'Shortcuts', icon: Keyboard, description: 'Keyboard shortcuts', implemented: false },
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

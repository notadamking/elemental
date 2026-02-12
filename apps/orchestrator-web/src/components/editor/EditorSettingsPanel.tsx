/**
 * EditorSettingsPanel - Settings panel for the file editor
 *
 * A sidebar panel that allows users to configure editor settings.
 * Currently supports:
 * - Theme selection (Monaco editor themes)
 *
 * Designed to accommodate more settings in the future.
 */

import { Palette } from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

export interface EditorSettingsPanelProps {
  /** Current editor theme */
  theme: string;
  /** Callback when theme changes */
  onThemeChange: (theme: string) => void;
}

// ============================================================================
// Available themes
// ============================================================================

const EDITOR_THEMES = [
  { id: 'elemental-dark', name: 'Elemental Dark' },
  { id: 'vs-dark', name: 'Dark (VS Code)' },
  { id: 'vs', name: 'Light (VS Code)' },
  { id: 'hc-black', name: 'High Contrast Dark' },
  { id: 'hc-light', name: 'High Contrast Light' },
] as const;

// ============================================================================
// Main Component
// ============================================================================

export function EditorSettingsPanel({ theme, onThemeChange }: EditorSettingsPanelProps) {
  return (
    <div
      className="flex flex-col h-full overflow-y-auto"
      data-testid="editor-settings-panel"
    >
      {/* Appearance Section */}
      <div className="p-3 space-y-3">
        {/* Section header */}
        <div className="flex items-center gap-2">
          <Palette className="w-4 h-4 text-[var(--color-text-muted)]" />
          <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
            Appearance
          </h3>
        </div>

        {/* Theme selector */}
        <div className="space-y-1.5">
          <label
            htmlFor="editor-theme"
            className="text-sm font-medium text-[var(--color-text)]"
          >
            Theme
          </label>
          <select
            id="editor-theme"
            value={theme}
            onChange={(e) => onThemeChange(e.target.value)}
            className="
              w-full px-3 py-2
              text-sm
              bg-[var(--color-surface)]
              border border-[var(--color-border)]
              rounded-lg
              text-[var(--color-text)]
              focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30
            "
            data-testid="editor-theme-select"
          >
            {EDITOR_THEMES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <p className="text-xs text-[var(--color-text-tertiary)]">
            Choose the color theme for the editor.
          </p>
        </div>
      </div>
    </div>
  );
}

export default EditorSettingsPanel;

/**
 * Monaco Editor Initialization Module
 *
 * Centralizes Monaco editor initialization using @codingame/monaco-vscode-api.
 * This module replaces scattered loader.init() calls with a single initialize()
 * call that sets up VSCode service overrides.
 *
 * Features:
 * - Idempotent initialization (safe to call multiple times)
 * - VSCode service overrides for theme, textmate, model, configuration, languages
 * - Built-in VS Code themes (dark, light, high contrast)
 * - Custom elemental-dark theme registration
 */

import { initialize } from '@codingame/monaco-vscode-api/services';
import getThemeServiceOverride from '@codingame/monaco-vscode-theme-service-override';
import getTextmateServiceOverride from '@codingame/monaco-vscode-textmate-service-override';
import getModelServiceOverride from '@codingame/monaco-vscode-model-service-override';
import getConfigurationServiceOverride from '@codingame/monaco-vscode-configuration-service-override';
import getLanguagesServiceOverride from '@codingame/monaco-vscode-languages-service-override';
// Import for side effects: registers built-in VS Code themes (dark, light, high contrast)
import '@codingame/monaco-vscode-theme-defaults-default-extension';
import * as monaco from 'monaco-editor';

// Module-level promise for idempotent initialization
let initPromise: Promise<void> | null = null;
let initialized = false;

/**
 * Custom elemental-dark theme definition
 * Based on VS Code dark theme with enhanced syntax highlighting
 */
const ELEMENTAL_DARK_THEME: monaco.editor.IStandaloneThemeData = {
  base: 'vs-dark',
  inherit: true,
  rules: [
    // Enhanced syntax highlighting rules
    { token: 'comment', foreground: '6A9955', fontStyle: 'italic' },
    { token: 'keyword', foreground: 'C586C0' },
    { token: 'keyword.control', foreground: 'C586C0' },
    { token: 'keyword.operator', foreground: 'C586C0' },
    { token: 'string', foreground: 'CE9178' },
    { token: 'string.escape', foreground: 'D7BA7D' },
    { token: 'number', foreground: 'B5CEA8' },
    { token: 'regexp', foreground: 'D16969' },
    { token: 'type', foreground: '4EC9B0' },
    { token: 'type.identifier', foreground: '4EC9B0' },
    { token: 'class', foreground: '4EC9B0' },
    { token: 'interface', foreground: '4EC9B0', fontStyle: 'italic' },
    { token: 'enum', foreground: '4EC9B0' },
    { token: 'typeParameter', foreground: '4EC9B0', fontStyle: 'italic' },
    { token: 'function', foreground: 'DCDCAA' },
    { token: 'function.declaration', foreground: 'DCDCAA' },
    { token: 'method', foreground: 'DCDCAA' },
    { token: 'variable', foreground: '9CDCFE' },
    { token: 'variable.readonly', foreground: '4FC1FF' },
    { token: 'variable.constant', foreground: '4FC1FF' },
    { token: 'parameter', foreground: '9CDCFE', fontStyle: 'italic' },
    { token: 'property', foreground: '9CDCFE' },
    { token: 'namespace', foreground: '4EC9B0' },
    { token: 'decorator', foreground: 'DCDCAA' },
    { token: 'tag', foreground: '569CD6' },
    { token: 'attribute.name', foreground: '9CDCFE' },
    { token: 'attribute.value', foreground: 'CE9178' },
    // JSX/TSX specific
    { token: 'tag.tsx', foreground: '4EC9B0' },
    { token: 'tag.jsx', foreground: '4EC9B0' },
    // JSON
    { token: 'string.key.json', foreground: '9CDCFE' },
    { token: 'string.value.json', foreground: 'CE9178' },
    // Markdown
    { token: 'markup.heading', foreground: '569CD6', fontStyle: 'bold' },
    { token: 'markup.bold', fontStyle: 'bold' },
    { token: 'markup.italic', fontStyle: 'italic' },
    { token: 'markup.inline.raw', foreground: 'CE9178' },
    // Shell
    { token: 'variable.shell', foreground: '9CDCFE' },
  ],
  colors: {
    'editor.background': '#1a1a2e',
    'editor.foreground': '#d4d4d4',
    'editor.lineHighlightBackground': '#2a2a4e',
    'editor.selectionBackground': '#264f78',
    'editorCursor.foreground': '#aeafad',
    'editorWhitespace.foreground': '#3b3b5b',
    'editorLineNumber.foreground': '#5a5a8a',
    'editorLineNumber.activeForeground': '#c6c6c6',
    'editor.inactiveSelectionBackground': '#3a3d41',
    'editorIndentGuide.background1': '#404060',
    'editorIndentGuide.activeBackground1': '#707090',
  },
};

/**
 * Register the custom elemental-dark theme
 * Must be called after initialize() completes
 */
function registerElementalDarkTheme(): void {
  monaco.editor.defineTheme('elemental-dark', ELEMENTAL_DARK_THEME);
}

/**
 * Initialize Monaco editor with @codingame/monaco-vscode-api service overrides.
 *
 * This function is idempotent - multiple calls return the same promise and
 * do not re-initialize. Consumers should await this before creating editors.
 *
 * Service overrides included:
 * - Theme service: VS Code theme support
 * - Textmate service: TextMate grammar support
 * - Model service: Document model management
 * - Configuration service: Editor configuration
 * - Languages service: Language registration
 *
 * @returns Promise that resolves when initialization is complete
 */
export async function initializeMonaco(): Promise<void> {
  // Return existing promise if already initializing or initialized
  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    if (initialized) {
      return;
    }

    await initialize({
      ...getThemeServiceOverride(),
      ...getTextmateServiceOverride(),
      ...getModelServiceOverride(),
      ...getConfigurationServiceOverride(),
      ...getLanguagesServiceOverride(),
    });

    // Register custom theme after initialization
    registerElementalDarkTheme();

    initialized = true;
    console.log('[monaco-init] Monaco initialized with @codingame/monaco-vscode-api');
  })();

  return initPromise;
}

/**
 * Check if Monaco has been initialized
 */
export function isMonacoInitialized(): boolean {
  return initialized;
}

/**
 * Export the elemental-dark theme data for consumers that need it
 */
export const elementalDarkTheme = ELEMENTAL_DARK_THEME;

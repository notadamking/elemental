/**
 * File Editor Page - Monaco-based code editor
 *
 * Features:
 * - Monaco Editor integration with syntax highlighting
 * - Theme support (light/dark)
 * - Language auto-detection from file extension
 * - Read-only mode support
 */

import { useState, useCallback, useEffect } from 'react';
import { useSearch, useNavigate } from '@tanstack/react-router';
import Editor, { type OnMount, type Monaco } from '@monaco-editor/react';
import { FileCode, Save, X, RefreshCw, Moon, Sun } from 'lucide-react';

// Common file extension to Monaco language mapping
const EXTENSION_TO_LANGUAGE: Record<string, string> = {
  // JavaScript/TypeScript
  js: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  mjs: 'javascript',
  cjs: 'javascript',
  // Web
  html: 'html',
  htm: 'html',
  css: 'css',
  scss: 'scss',
  less: 'less',
  // Data formats
  json: 'json',
  jsonc: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  xml: 'xml',
  toml: 'toml',
  // Markdown
  md: 'markdown',
  mdx: 'markdown',
  // Shell
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  fish: 'shell',
  // Config
  env: 'ini',
  ini: 'ini',
  conf: 'ini',
  // Programming languages
  py: 'python',
  rb: 'ruby',
  go: 'go',
  rs: 'rust',
  java: 'java',
  kt: 'kotlin',
  swift: 'swift',
  c: 'c',
  cpp: 'cpp',
  h: 'c',
  hpp: 'cpp',
  cs: 'csharp',
  php: 'php',
  // Other
  sql: 'sql',
  graphql: 'graphql',
  gql: 'graphql',
  dockerfile: 'dockerfile',
  makefile: 'makefile',
};

/**
 * Get Monaco language from filename
 */
function getLanguageFromFilename(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  return EXTENSION_TO_LANGUAGE[ext] ?? 'plaintext';
}

/**
 * Editor theme options
 */
type EditorTheme = 'vs-dark' | 'light';

export interface FileEditorPageProps {
  /** Initial file content (for testing/demo) */
  initialContent?: string;
  /** Initial filename (for testing/demo) */
  initialFilename?: string;
}

export function FileEditorPage({
  initialContent = '',
  initialFilename = 'untitled.txt'
}: FileEditorPageProps = {}) {
  const navigate = useNavigate();
  const search = useSearch({ from: '/editor' });

  // Editor state
  const [content, setContent] = useState(initialContent);
  const [filename] = useState(search.file || initialFilename);
  const [isDirty, setIsDirty] = useState(false);
  const [theme, setTheme] = useState<EditorTheme>('vs-dark');
  const isReadOnly = search.readonly === 'true';

  // Monaco instance ref (kept for future use)
  const [, setMonacoInstance] = useState<Monaco | null>(null);

  // Detect system theme preference
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    setTheme(mediaQuery.matches ? 'vs-dark' : 'light');

    const handler = (e: MediaQueryListEvent) => {
      setTheme(e.matches ? 'vs-dark' : 'light');
    };

    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  // Handle save (placeholder - would integrate with actual file system)
  const handleSave = useCallback(() => {
    // In a real implementation, this would save to the server/file system
    console.log('Save requested:', { filename, content });
    setIsDirty(false);
    // Show toast notification could be added here
  }, [filename, content]);

  // Handle editor mount
  const handleEditorMount: OnMount = useCallback((editor, monaco) => {
    setMonacoInstance(monaco);

    // Focus the editor
    editor.focus();

    // Add keyboard shortcut for save (Ctrl/Cmd + S)
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      handleSave();
    });
  }, [handleSave]);

  // Handle content change
  const handleContentChange = useCallback((value: string | undefined) => {
    if (value !== undefined) {
      setContent(value);
      setIsDirty(true);
    }
  }, []);

  // Handle close
  const handleClose = useCallback(() => {
    if (isDirty) {
      // In a real implementation, show confirmation dialog
      if (window.confirm('You have unsaved changes. Are you sure you want to close?')) {
        navigate({ to: '/documents', search: { selected: undefined, library: undefined } });
      }
    } else {
      navigate({ to: '/documents', search: { selected: undefined, library: undefined } });
    }
  }, [isDirty, navigate]);

  // Toggle theme
  const toggleTheme = useCallback(() => {
    setTheme(prev => prev === 'vs-dark' ? 'light' : 'vs-dark');
  }, []);

  // Reset content to initial
  const handleReset = useCallback(() => {
    if (isDirty) {
      if (window.confirm('Discard all changes and reset to original content?')) {
        setContent(initialContent);
        setIsDirty(false);
      }
    }
  }, [isDirty, initialContent]);

  // Get language from filename
  const language = getLanguageFromFilename(filename);

  return (
    <div
      data-testid="file-editor-page"
      className="flex flex-col h-full bg-[var(--color-bg)]"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="flex items-center gap-2 min-w-0">
          <FileCode className="w-5 h-5 text-[var(--color-primary)] flex-shrink-0" />
          <h1 className="text-lg font-semibold text-[var(--color-text)] truncate">
            {filename}
          </h1>
          {isDirty && (
            <span className="text-xs text-amber-500 font-medium">(unsaved)</span>
          )}
          {isReadOnly && (
            <span className="text-xs bg-gray-200 dark:bg-gray-700 px-2 py-0.5 rounded">
              Read Only
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className="p-2 rounded-md hover:bg-[var(--color-bg-hover)] transition-colors"
            title={`Switch to ${theme === 'vs-dark' ? 'light' : 'dark'} theme`}
            data-testid="theme-toggle"
          >
            {theme === 'vs-dark' ? (
              <Sun className="w-4 h-4 text-[var(--color-text-muted)]" />
            ) : (
              <Moon className="w-4 h-4 text-[var(--color-text-muted)]" />
            )}
          </button>

          {/* Reset button */}
          {isDirty && (
            <button
              onClick={handleReset}
              className="p-2 rounded-md hover:bg-[var(--color-bg-hover)] transition-colors"
              title="Reset to original content"
              data-testid="reset-button"
            >
              <RefreshCw className="w-4 h-4 text-[var(--color-text-muted)]" />
            </button>
          )}

          {/* Save button */}
          {!isReadOnly && (
            <button
              onClick={handleSave}
              disabled={!isDirty}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors ${
                isDirty
                  ? 'bg-[var(--color-primary)] text-white hover:opacity-90'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed'
              }`}
              title="Save (Ctrl/Cmd + S)"
              data-testid="save-button"
            >
              <Save className="w-4 h-4" />
              <span className="text-sm">Save</span>
            </button>
          )}

          {/* Close button */}
          <button
            onClick={handleClose}
            className="p-2 rounded-md hover:bg-[var(--color-bg-hover)] transition-colors"
            title="Close editor"
            data-testid="close-button"
          >
            <X className="w-4 h-4 text-[var(--color-text-muted)]" />
          </button>
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 min-h-0" data-testid="monaco-editor-container">
        <Editor
          height="100%"
          language={language}
          value={content}
          theme={theme}
          onChange={handleContentChange}
          onMount={handleEditorMount}
          options={{
            readOnly: isReadOnly,
            minimap: { enabled: true },
            fontSize: 14,
            fontFamily: '"JetBrains Mono", "Fira Code", Consolas, "Liberation Mono", Menlo, Courier, monospace',
            lineNumbers: 'on',
            renderLineHighlight: 'line',
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 2,
            wordWrap: 'on',
            formatOnPaste: true,
            formatOnType: true,
            bracketPairColorization: { enabled: true },
            guides: {
              bracketPairs: true,
              indentation: true,
            },
            padding: { top: 16, bottom: 16 },
          }}
          loading={
            <div className="flex items-center justify-center h-full">
              <div className="text-[var(--color-text-muted)]">Loading editor...</div>
            </div>
          }
        />
      </div>

      {/* Status bar */}
      <div
        className="flex items-center justify-between px-4 py-1.5 border-t border-[var(--color-border)] bg-[var(--color-bg-subtle)] text-xs text-[var(--color-text-muted)]"
        data-testid="status-bar"
      >
        <div className="flex items-center gap-4">
          <span>Language: {language}</span>
          <span>Lines: {content.split('\n').length}</span>
          <span>Characters: {content.length}</span>
        </div>
        <div className="flex items-center gap-4">
          {isReadOnly && <span className="text-amber-500">Read Only</span>}
          <span>UTF-8</span>
        </div>
      </div>
    </div>
  );
}

// Default export for route
export default FileEditorPage;

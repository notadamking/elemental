/**
 * LspMonacoEditor - Monaco Editor Component with LSP Support
 *
 * A React component that wraps Monaco editor using @monaco-editor/react.
 * Provides:
 * - Syntax highlighting via Monaco's built-in language support
 * - LSP features via WebSocket connection to server-side language servers
 * - Custom elemental-dark theme
 * - Read-only mode support
 * - Responsive input handling
 */

import { useCallback, useState, memo, useEffect, useRef } from 'react';
import Editor, { loader, OnMount, BeforeMount } from '@monaco-editor/react';
import type * as monacoTypes from 'monaco-editor';
import { Loader2 } from 'lucide-react';
import { getKeyboardManager } from '@elemental/ui';
import { useLsp, isPotentialLspLanguage, getActiveClient, type LspState } from '../../lib/monaco-lsp';

/**
 * TypeScript/JavaScript language IDs that use Monaco's built-in TS worker
 */
const TS_JS_LANGUAGES = ['typescript', 'javascript', 'typescriptreact', 'javascriptreact'];

/**
 * Default mode configuration for Monaco's built-in TS/JS features
 */
const DEFAULT_TS_MODE_CONFIG = {
  completionItems: true,
  hovers: true,
  diagnostics: true,
  definitions: true,
  references: true,
  documentHighlights: true,
  rename: true,
  codeActions: true,
  signatureHelp: true,
  selectionRanges: true,
  foldingRanges: true,
};

/**
 * Disabled mode configuration when LSP is connected
 * Keeps editor UX features (folding, selection ranges) but disables intellisense features
 */
const DISABLED_TS_MODE_CONFIG = {
  completionItems: false,
  hovers: false,
  diagnostics: false,
  definitions: false,
  references: false,
  documentHighlights: false,
  rename: false,
  codeActions: false,
  signatureHelp: false,
  selectionRanges: true,
  foldingRanges: true,
};

interface LspMonacoEditorProps {
  /** Editor content */
  value: string;
  /** Language ID (e.g., 'typescript', 'javascript') */
  language: string;
  /** Whether the editor is read-only */
  readOnly?: boolean;
  /** Callback when content changes (lightweight notification, no value) */
  onChange?: () => void;
  /** Callback when editor mounts */
  onMount?: (editor: monacoTypes.editor.IStandaloneCodeEditor, monacoInstance: typeof monacoTypes) => void;
  /** Custom theme name */
  theme?: string;
  /** Additional CSS class for container */
  className?: string;
  /** File path or URI for LSP workspace resolution */
  filePath?: string;
  /** Callback when LSP state changes */
  onLspStateChange?: (state: LspState) => void;
}

// Track if we've defined the custom theme
let themeInitialized = false;

/**
 * Custom dark theme configuration for the editor
 */
function defineCustomTheme(monacoInstance: typeof monacoTypes): void {
  if (themeInitialized) return;

  monacoInstance.editor.defineTheme('elemental-dark', {
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
  });

  themeInitialized = true;
}

// Initialize the theme once on module load via loader
loader.init().then((monaco) => {
  defineCustomTheme(monaco);
}).catch(console.error);

/**
 * Monaco editor component with LSP support
 */
function LspMonacoEditorComponent({
  value,
  language,
  readOnly = false,
  onChange,
  onMount,
  theme = 'elemental-dark',
  className = '',
  filePath,
  onLspStateChange,
}: LspMonacoEditorProps) {
  const [error] = useState<string | null>(null);
  // Store Monaco instance in state to trigger re-renders when it becomes available
  const [monacoInstance, setMonacoInstance] = useState<typeof monacoTypes | null>(null);
  const editorRef = useRef<monacoTypes.editor.IStandaloneCodeEditor | null>(null);
  const didOpenSentRef = useRef(false);

  // Track the previous value prop to detect external changes (tab switches, file reloads)
  // without interfering with the user's typing
  const prevValuePropRef = useRef(value);
  // Debounce timer for LSP didChange notifications
  const lspChangeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Disposables for editor subscriptions (content change, focus/blur)
  const editorDisposablesRef = useRef<monacoTypes.IDisposable[]>([]);

  // Use LSP hook for language server connection
  const { state: lspState } = useLsp({
    monaco: monacoInstance ?? undefined,
    language,
    documentUri: filePath ? `file://${filePath}` : undefined,
    autoConnect: isPotentialLspLanguage(language) && !readOnly,
  });

  // Unconditionally disable semantic validation from built-in TS worker.
  // The in-browser TS worker cannot resolve modules (no filesystem access),
  // so semantic diagnostics always produce false "Cannot find module" errors.
  // Syntax validation is kept as a useful baseline.
  useEffect(() => {
    if (!monacoInstance) return;
    if (!TS_JS_LANGUAGES.includes(language)) return;

    const diagnosticsOptions = { noSemanticValidation: true, noSyntaxValidation: false };

    try {
      if (language === 'typescript' || language === 'typescriptreact') {
        monacoInstance.languages.typescript.typescriptDefaults.setDiagnosticsOptions(diagnosticsOptions);
      } else if (language === 'javascript' || language === 'javascriptreact') {
        monacoInstance.languages.typescript.javascriptDefaults.setDiagnosticsOptions(diagnosticsOptions);
      }
      console.log(`[LspMonacoEditor] Disabled built-in TS semantic validation for ${language}`);
    } catch (err) {
      console.warn('[LspMonacoEditor] Failed to set diagnostics options:', err);
    }
  }, [monacoInstance, language]);

  // Disable built-in TS intellisense features when LSP is connected to avoid duplicates
  useEffect(() => {
    if (!monacoInstance) return;
    if (!TS_JS_LANGUAGES.includes(language)) return;

    const isLspConnected = lspState === 'connected';
    const modeConfig = isLspConnected ? DISABLED_TS_MODE_CONFIG : DEFAULT_TS_MODE_CONFIG;

    try {
      if (language === 'typescript' || language === 'typescriptreact') {
        monacoInstance.languages.typescript.typescriptDefaults.setModeConfiguration(modeConfig);
      } else if (language === 'javascript' || language === 'javascriptreact') {
        monacoInstance.languages.typescript.javascriptDefaults.setModeConfiguration(modeConfig);
      }
      console.log(
        `[LspMonacoEditor] ${isLspConnected ? 'Disabled' : 'Enabled'} built-in TS intellisense for ${language}`
      );
    } catch (err) {
      console.warn('[LspMonacoEditor] Failed to set mode configuration:', err);
    }
  }, [monacoInstance, language, lspState]);

  // Send didOpen to LSP when connected and document is ready
  useEffect(() => {
    if (lspState !== 'connected' || !editorRef.current || didOpenSentRef.current) return;

    const client = getActiveClient(language);
    if (!client) return;

    const model = editorRef.current.getModel();
    if (!model) return;

    const uri = filePath ? `file://${filePath}` : model.uri.toString();
    client.sendDidOpen(uri, language, model.getValue());
    didOpenSentRef.current = true;
    console.log(`[LspMonacoEditor] Sent didOpen for ${uri}`);
  }, [lspState, language, filePath]);

  // Notify parent of LSP state changes
  useEffect(() => {
    if (onLspStateChange) {
      onLspStateChange(lspState);
    }
  }, [lspState, onLspStateChange]);

  // Apply external value changes (tab switch, file reload) without interfering with typing.
  // Only triggers model.setValue when the value prop itself changed (not from our own onChange).
  useEffect(() => {
    if (value === prevValuePropRef.current) return;
    prevValuePropRef.current = value;

    if (!editorRef.current) return;
    const model = editorRef.current.getModel();
    if (model && model.getValue() !== value) {
      model.setValue(value);
    }
  }, [value]);

  // Cleanup editor subscriptions and debounce timer on unmount
  useEffect(() => {
    return () => {
      if (lspChangeTimerRef.current) {
        clearTimeout(lspChangeTimerRef.current);
      }
      for (const d of editorDisposablesRef.current) {
        d.dispose();
      }
      editorDisposablesRef.current = [];
      // Re-enable global shortcuts when editor unmounts
      getKeyboardManager().setEnabled(true);
    };
  }, []);

  // Handle editor mount
  const handleMount: OnMount = useCallback((editor, monaco) => {
    // Store editor and Monaco instance
    editorRef.current = editor;
    setMonacoInstance(monaco);
    didOpenSentRef.current = false;

    // Sync with latest value prop in case it changed before mount completed
    prevValuePropRef.current = value;
    const model = editor.getModel();
    if (model && model.getValue() !== value) {
      model.setValue(value);
    }

    // Dispose previous subscriptions (in case of re-mount)
    for (const d of editorDisposablesRef.current) {
      d.dispose();
    }

    // Subscribe to content changes directly (bypasses @monaco-editor/react's
    // onChange which calls editor.getValue() O(n) on every keystroke)
    const contentDisposable = editor.onDidChangeModelContent(() => {
      // Lightweight dirty notification to parent (no value extraction)
      onChange?.();

      // Debounce LSP didChange — only read model value when the timer fires
      if (didOpenSentRef.current) {
        if (lspChangeTimerRef.current) {
          clearTimeout(lspChangeTimerRef.current);
        }
        lspChangeTimerRef.current = setTimeout(() => {
          const client = getActiveClient(language);
          if (client) {
            const m = editor.getModel();
            if (m) {
              const uri = filePath ? `file://${filePath}` : m.uri.toString();
              client.sendDidChange(uri, m.getValue());
            }
          }
        }, 200);
      }
    });

    // Disable global keyboard shortcuts (G A, Cmd+B, etc.) when editor is focused
    // so they don't steal keystrokes. Cmd+K (command palette) and Cmd+S (save)
    // are handled by their own document-level listeners and remain unaffected.
    const focusDisposable = editor.onDidFocusEditorWidget(() => {
      getKeyboardManager().setEnabled(false);
    });
    const blurDisposable = editor.onDidBlurEditorWidget(() => {
      getKeyboardManager().setEnabled(true);
    });

    editorDisposablesRef.current = [contentDisposable, focusDisposable, blurDisposable];

    // Ensure theme is defined
    defineCustomTheme(monaco);

    // Set the theme
    monaco.editor.setTheme(theme);

    // Call onMount callback
    if (onMount) {
      onMount(editor, monaco);
    }
  }, [onMount, theme, value, onChange, language, filePath]);

  // Handle beforeMount to define theme early
  const handleBeforeMount: BeforeMount = useCallback((monaco) => {
    defineCustomTheme(monaco);
  }, []);

  // Loading spinner component
  const LoadingSpinner = (
    <div className="flex items-center justify-center h-full bg-[var(--color-surface)]">
      <Loader2 className="w-8 h-8 animate-spin text-[var(--color-text-muted)]" />
    </div>
  );

  if (error) {
    return (
      <div className={`flex items-center justify-center h-full bg-[var(--color-surface)] ${className}`}>
        <div className="text-center p-4">
          <p className="text-[var(--color-danger)] mb-2">Failed to load editor</p>
          <p className="text-sm text-[var(--color-text-secondary)]">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative h-full ${className}`} data-testid="lsp-monaco-editor">
      <Editor
        defaultLanguage={language}
        language={language}
        defaultValue={value}
        theme={theme}
        onMount={handleMount}
        beforeMount={handleBeforeMount}
        loading={LoadingSpinner}
        options={{
          readOnly,
          automaticLayout: true,
          minimap: {
            enabled: true,
            scale: 1,
            showSlider: 'mouseover',
            renderCharacters: false,
          },
          fontSize: 14,
          fontFamily: "'Fira Code', 'JetBrains Mono', 'Cascadia Code', Menlo, Monaco, 'Courier New', monospace",
          fontLigatures: true,
          lineNumbers: 'on',
          scrollBeyondLastLine: false,
          wordWrap: 'on',
          padding: { top: 16, bottom: 16 },
          // Enhanced syntax highlighting
          renderWhitespace: 'selection',
          bracketPairColorization: { enabled: true },
          guides: {
            bracketPairs: true,
            indentation: true,
            highlightActiveIndentation: true,
          },
          // Smooth scrolling and cursor
          smoothScrolling: true,
          cursorBlinking: 'smooth',
          cursorSmoothCaretAnimation: 'on',
          // Code folding
          folding: true,
          foldingStrategy: 'indentation',
          showFoldingControls: 'mouseover',
          // Hover and suggestions (enabled for all editable files)
          hover: { enabled: true, delay: 300 },
          quickSuggestions: !readOnly,
          suggestOnTriggerCharacters: !readOnly,
          parameterHints: { enabled: !readOnly },
          // Selection highlighting
          occurrencesHighlight: 'singleFile',
          selectionHighlight: true,
          // IntelliSense
          suggest: {
            showMethods: true,
            showFunctions: true,
            showConstructors: true,
            showFields: true,
            showVariables: true,
            showClasses: true,
            showStructs: true,
            showInterfaces: true,
            showModules: true,
            showProperties: true,
            showEvents: true,
            showOperators: true,
            showUnits: true,
            showValues: true,
            showConstants: true,
            showEnums: true,
            showEnumMembers: true,
            showKeywords: true,
            showWords: true,
            showColors: true,
            showFiles: true,
            showReferences: true,
            showFolders: true,
            showTypeParameters: true,
            showSnippets: true,
          },
        }}
      />
    </div>
  );
}

// Memoize to prevent unnecessary re-renders
export const LspMonacoEditor = memo(LspMonacoEditorComponent);

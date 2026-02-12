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
  /** Callback when content changes */
  onChange?: (value: string) => void;
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
  // Track if we've opened the document with the LSP server
  const documentOpenedRef = useRef(false);
  // Store current value for document sync
  const currentValueRef = useRef(value);
  currentValueRef.current = value;

  // Calculate document URI
  const documentUri = filePath ? `file://${filePath}` : undefined;

  // Use LSP hook for language server connection
  // Now uses state instead of ref, so the hook will re-run when Monaco mounts
  const { state: lspState } = useLsp({
    monaco: monacoInstance ?? undefined,
    language,
    documentUri,
    autoConnect: isPotentialLspLanguage(language) && !readOnly,
  });

  // Open document with LSP server when connected
  useEffect(() => {
    if (lspState !== 'connected' || !documentUri) {
      documentOpenedRef.current = false;
      return;
    }

    const client = getActiveClient(language);
    if (!client || documentOpenedRef.current) return;

    // Open the document with the language server
    client.openDocument(documentUri, language, currentValueRef.current);
    documentOpenedRef.current = true;
    console.log(`[LspMonacoEditor] Opened document with LSP: ${documentUri}`);

    // Clean up when disconnecting
    return () => {
      if (documentOpenedRef.current) {
        const activeClient = getActiveClient(language);
        if (activeClient) {
          activeClient.closeDocument(documentUri);
          console.log(`[LspMonacoEditor] Closed document with LSP: ${documentUri}`);
        }
        documentOpenedRef.current = false;
      }
    };
  }, [lspState, language, documentUri]);

  // Unconditionally disable semantic validation from Monaco's built-in TS worker.
  // The in-browser TS worker cannot resolve modules (no filesystem access),
  // so semantic diagnostics always produce false "Cannot find module" errors.
  // Syntax validation is kept as a useful baseline for catching basic errors.
  // When LSP is connected, it provides its own accurate diagnostics via markers.
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
      console.log(`[LspMonacoEditor] Disabled semantic validation for ${language} (syntax validation still active)`);
    } catch (err) {
      console.warn('[LspMonacoEditor] Failed to set diagnostics options:', err);
    }
  }, [monacoInstance, language]);

  // Disable built-in TS intellisense features when LSP is connected to avoid duplicates.
  // Re-enable them as fallback when LSP is not connected.
  // Note: Diagnostics are handled separately via setDiagnosticsOptions above.
  useEffect(() => {
    if (!monacoInstance) return;

    // Only apply to TypeScript/JavaScript languages
    if (!TS_JS_LANGUAGES.includes(language)) return;

    const isLspConnected = lspState === 'connected';
    const modeConfig = isLspConnected ? DISABLED_TS_MODE_CONFIG : DEFAULT_TS_MODE_CONFIG;

    // Apply to both TS and JS defaults (they share settings for some language IDs)
    try {
      if (language === 'typescript' || language === 'typescriptreact') {
        monacoInstance.languages.typescript.typescriptDefaults.setModeConfiguration(modeConfig);
      } else if (language === 'javascript' || language === 'javascriptreact') {
        monacoInstance.languages.typescript.javascriptDefaults.setModeConfiguration(modeConfig);
      }
      console.log(
        `[LspMonacoEditor] ${isLspConnected ? 'Disabled' : 'Enabled'} built-in TS intellisense features for ${language}`
      );
    } catch (err) {
      console.warn('[LspMonacoEditor] Failed to set mode configuration:', err);
    }
  }, [monacoInstance, language, lspState]);

  // Notify parent of LSP state changes
  useEffect(() => {
    if (onLspStateChange) {
      onLspStateChange(lspState);
    }
  }, [lspState, onLspStateChange]);

  // Handle editor mount
  const handleMount: OnMount = useCallback((editor, monaco) => {
    // Store Monaco instance in state to trigger re-render and allow useLsp to receive it
    setMonacoInstance(monaco);

    // Ensure theme is defined
    defineCustomTheme(monaco);

    // Set the theme
    monaco.editor.setTheme(theme);

    // Call onMount callback
    if (onMount) {
      onMount(editor, monaco);
    }
  }, [onMount, theme]);

  // Handle beforeMount to define theme early
  const handleBeforeMount: BeforeMount = useCallback((monaco) => {
    defineCustomTheme(monaco);
  }, []);

  // Handle content changes
  const handleChange = useCallback((newValue: string | undefined) => {
    if (newValue === undefined) return;

    // Notify the LSP server of content changes
    if (documentOpenedRef.current && documentUri) {
      const client = getActiveClient(language);
      if (client) {
        client.changeDocument(documentUri, newValue);
      }
    }

    // Call the onChange callback
    if (onChange) {
      onChange(newValue);
    }
  }, [onChange, language, documentUri]);

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
        value={value}
        theme={theme}
        onChange={handleChange}
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

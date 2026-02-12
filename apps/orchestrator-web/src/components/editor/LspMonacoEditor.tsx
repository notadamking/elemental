/**
 * LspMonacoEditor - Monaco Editor with LSP Support
 *
 * A React component that wraps Monaco editor with full LSP support
 * for TypeScript/JavaScript files. Provides:
 * - Autocompletion
 * - Hover information with types
 * - Inline diagnostics (errors/warnings)
 * - Go-to-definition (Cmd/Ctrl+click)
 * - Syntax highlighting via TextMate
 */

import { useEffect, useRef, useState, memo } from 'react';
import type * as monaco from '@codingame/monaco-vscode-editor-api';
import { Loader2 } from 'lucide-react';
import { initializeMonacoLsp, isLspInitialized, isLspSupportedLanguage } from '../../lib/monaco-lsp';

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
  onMount?: (editor: monaco.editor.IStandaloneCodeEditor, monacoInstance: typeof monaco) => void;
  /** Custom theme name */
  theme?: string;
  /** Additional CSS class for container */
  className?: string;
}

/**
 * Custom dark theme configuration for the editor
 */
function defineCustomTheme(monacoInstance: typeof monaco): void {
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
}

/**
 * Monaco editor with LSP support component
 */
function LspMonacoEditorComponent({
  value,
  language,
  readOnly = false,
  onChange,
  onMount,
  theme = 'elemental-dark',
  className = '',
}: LspMonacoEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const modelRef = useRef<monaco.editor.ITextModel | null>(null);
  const monacoRef = useRef<typeof monaco | null>(null);

  const [isInitializing, setIsInitializing] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Track if value update is from external prop change
  const isExternalUpdate = useRef(false);
  // Track mounted state
  const isMountedRef = useRef(true);

  // Initialize LSP and create editor
  useEffect(() => {
    isMountedRef.current = true;
    let disposed = false;

    const setupEditor = async () => {
      if (!containerRef.current) {
        return;
      }

      try {
        setIsInitializing(true);
        setError(null);

        // Initialize LSP services if not already done
        if (!isLspInitialized()) {
          await initializeMonacoLsp();
        }

        if (disposed || !isMountedRef.current) {
          return;
        }

        // Dynamic import to ensure initialization happens first
        const monacoModule = await import('@codingame/monaco-vscode-editor-api');
        monacoRef.current = monacoModule;

        if (disposed || !isMountedRef.current) {
          return;
        }

        // Define custom theme (may not be available with VSCode theme service override)
        let activeTheme = theme;
        try {
          defineCustomTheme(monacoModule);
        } catch (themeErr) {
          console.warn('[LspMonacoEditor] Custom theme unavailable, falling back to vs-dark:', themeErr);
          activeTheme = 'vs-dark';
        }

        // Create model with unique URI
        const uniqueId = Date.now().toString(36) + Math.random().toString(36).substr(2);
        const modelUri = monacoModule.Uri.parse(`inmemory://model/${uniqueId}.${language === 'typescript' ? 'ts' : language === 'javascript' ? 'js' : language}`);
        const model = monacoModule.editor.createModel(value, language, modelUri);
        modelRef.current = model;

        // Create editor with LSP-friendly options
        const editor = monacoModule.editor.create(containerRef.current, {
          model,
          theme: activeTheme,
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
          // Semantic highlighting for LSP
          'semanticHighlighting.enabled': true,
          // Smooth scrolling and cursor
          smoothScrolling: true,
          cursorBlinking: 'smooth',
          cursorSmoothCaretAnimation: 'on',
          // Code folding
          folding: true,
          foldingStrategy: 'indentation',
          showFoldingControls: 'mouseover',
          // Hover and suggestions (enabled for LSP languages)
          hover: { enabled: 'on', delay: 300 },
          quickSuggestions: !readOnly && isLspSupportedLanguage(language),
          suggestOnTriggerCharacters: !readOnly && isLspSupportedLanguage(language),
          parameterHints: { enabled: !readOnly && isLspSupportedLanguage(language) },
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
        });

        editorRef.current = editor;

        if (disposed || !isMountedRef.current) {
          editor.dispose();
          model.dispose();
          return;
        }

        setIsInitializing(false);

        // Call onMount callback
        if (onMount) {
          onMount(editor, monacoModule);
        }
      } catch (err) {
        console.error('[LspMonacoEditor] Setup failed:', err);
        if (!disposed && isMountedRef.current) {
          setError(err instanceof Error ? err.message : 'Failed to initialize editor');
          setIsInitializing(false);
        }
      }
    };

    setupEditor();

    return () => {
      disposed = true;
      isMountedRef.current = false;
      if (editorRef.current) {
        editorRef.current.dispose();
        editorRef.current = null;
      }
      if (modelRef.current) {
        modelRef.current.dispose();
        modelRef.current = null;
      }
      monacoRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  // Handle content changes
  useEffect(() => {
    if (!editorRef.current || !onChange) {
      return;
    }

    const disposable = editorRef.current.onDidChangeModelContent(() => {
      if (isExternalUpdate.current) {
        isExternalUpdate.current = false;
        return;
      }
      const content = editorRef.current?.getValue() || '';
      onChange(content);
    });

    return () => disposable.dispose();
  }, [onChange]);

  // Update value when prop changes (controlled mode)
  useEffect(() => {
    if (editorRef.current && !isInitializing) {
      const currentValue = editorRef.current.getValue();
      if (currentValue !== value) {
        isExternalUpdate.current = true;
        editorRef.current.setValue(value);
      }
    }
  }, [value, isInitializing]);

  // Update language when prop changes
  useEffect(() => {
    if (modelRef.current && monacoRef.current && !isInitializing) {
      const currentLanguage = modelRef.current.getLanguageId();
      if (currentLanguage !== language) {
        monacoRef.current.editor.setModelLanguage(modelRef.current, language);
      }
    }
  }, [language, isInitializing]);

  // Update readOnly when prop changes
  useEffect(() => {
    if (editorRef.current && !isInitializing) {
      editorRef.current.updateOptions({ readOnly });
    }
  }, [readOnly, isInitializing]);

  // Update theme when prop changes
  useEffect(() => {
    if (editorRef.current && monacoRef.current && !isInitializing) {
      try {
        monacoRef.current.editor.setTheme(theme);
      } catch (themeErr) {
        console.warn('[LspMonacoEditor] Theme change failed, keeping current theme:', themeErr);
      }
    }
  }, [theme, isInitializing]);

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
    <div className={`relative h-full ${className}`}>
      {isInitializing && (
        <div className="absolute inset-0 flex items-center justify-center bg-[var(--color-surface)] z-10">
          <Loader2 className="w-8 h-8 animate-spin text-[var(--color-text-muted)]" />
        </div>
      )}
      <div
        ref={containerRef}
        className="h-full w-full"
        data-testid="lsp-monaco-editor"
      />
    </div>
  );
}

// Memoize to prevent unnecessary re-renders
export const LspMonacoEditor = memo(LspMonacoEditorComponent);

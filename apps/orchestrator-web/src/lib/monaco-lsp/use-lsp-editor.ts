/**
 * React Hook for LSP-enabled Monaco Editor
 *
 * Provides a React hook that handles Monaco LSP initialization
 * and editor lifecycle management.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import type * as monaco from '@codingame/monaco-vscode-editor-api';
import { initializeMonacoLsp, isLspInitialized } from './lsp-setup';
import { createLspEditor, type LspEditorResult, getMonaco } from './lsp-editor';
import { isLspSupportedLanguage } from './languages';

export interface UseLspEditorOptions {
  /** Initial content */
  value?: string;
  /** Language ID (e.g., 'typescript', 'javascript') */
  language?: string;
  /** Whether the editor is read-only */
  readOnly?: boolean;
  /** Callback when content changes */
  onChange?: (value: string) => void;
  /** Callback when editor is mounted */
  onMount?: (editor: monaco.editor.IStandaloneCodeEditor, monacoInstance: typeof monaco) => void;
}

export interface UseLspEditorResult {
  /** Ref to attach to the container element */
  containerRef: React.RefObject<HTMLDivElement>;
  /** The Monaco editor instance (null until mounted) */
  editor: monaco.editor.IStandaloneCodeEditor | null;
  /** Whether LSP is initializing */
  isInitializing: boolean;
  /** Whether LSP is ready */
  isReady: boolean;
  /** Error message if initialization failed */
  error: string | null;
  /** Whether the current language has LSP support */
  hasLspSupport: boolean;
}

/**
 * React hook for creating an LSP-enabled Monaco editor
 *
 * @example
 * ```tsx
 * function MyEditor() {
 *   const { containerRef, isReady, hasLspSupport } = useLspEditor({
 *     value: 'const x: number = 42;',
 *     language: 'typescript',
 *     onChange: (value) => console.log('Content changed:', value),
 *   });
 *
 *   return (
 *     <div ref={containerRef} style={{ height: '400px' }}>
 *       {!isReady && <div>Loading editor...</div>}
 *     </div>
 *   );
 * }
 * ```
 */
export function useLspEditor(options: UseLspEditorOptions): UseLspEditorResult {
  const { value = '', language = 'plaintext', readOnly = false, onChange, onMount } = options;

  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<LspEditorResult | null>(null);
  const [editor, setEditor] = useState<monaco.editor.IStandaloneCodeEditor | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Track if component is mounted for async operations
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

        // Create editor
        const result = createLspEditor({
          container: containerRef.current,
          value,
          language,
          readOnly,
        });

        if (disposed || !isMountedRef.current) {
          result.dispose();
          return;
        }

        editorRef.current = result;
        setEditor(result.editor);
        setIsReady(true);
        setIsInitializing(false);

        // Call onMount callback
        if (onMount) {
          onMount(result.editor, getMonaco());
        }
      } catch (err) {
        if (!disposed && isMountedRef.current) {
          console.error('[useLspEditor] Setup failed:', err);
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
      setEditor(null);
      setIsReady(false);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  // Handle content changes
  useEffect(() => {
    if (!editorRef.current || !onChange) {
      return;
    }

    const disposable = editorRef.current.editor.onDidChangeModelContent(() => {
      const content = editorRef.current?.editor.getValue() || '';
      onChange(content);
    });

    return () => disposable.dispose();
  }, [onChange]);

  // Update value when prop changes (controlled mode)
  const updateValue = useCallback((newValue: string) => {
    if (editorRef.current) {
      const currentValue = editorRef.current.editor.getValue();
      if (currentValue !== newValue) {
        editorRef.current.editor.setValue(newValue);
      }
    }
  }, []);

  useEffect(() => {
    if (isReady && value !== undefined) {
      updateValue(value);
    }
  }, [isReady, value, updateValue]);

  // Update language when prop changes
  useEffect(() => {
    if (editorRef.current && language) {
      const model = editorRef.current.model;
      const currentLanguage = model.getLanguageId();
      if (currentLanguage !== language) {
        // Import dynamically to avoid circular dependency
        import('@codingame/monaco-vscode-editor-api').then((monaco) => {
          monaco.editor.setModelLanguage(model, language);
        });
      }
    }
  }, [language, isReady]);

  // Update readOnly when prop changes
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.editor.updateOptions({ readOnly });
    }
  }, [readOnly]);

  return {
    containerRef: containerRef as React.RefObject<HTMLDivElement>,
    editor,
    isInitializing,
    isReady,
    error,
    hasLspSupport: isLspSupportedLanguage(language),
  };
}

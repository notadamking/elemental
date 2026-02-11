/**
 * LSP Editor Factory
 *
 * Creates Monaco editor instances with LSP support configured.
 * Provides a higher-level API for creating editors with TypeScript/JavaScript
 * language intelligence.
 */

import * as monaco from '@codingame/monaco-vscode-editor-api';
import { isLspSupportedLanguage } from './languages';

export interface LspEditorOptions {
  /** Container element for the editor */
  container: HTMLElement;
  /** Initial content */
  value?: string;
  /** Language ID (e.g., 'typescript', 'javascript') */
  language?: string;
  /** Whether the editor is read-only */
  readOnly?: boolean;
  /** Custom editor options */
  options?: monaco.editor.IStandaloneEditorConstructionOptions;
}

export interface LspEditorResult {
  /** The Monaco editor instance */
  editor: monaco.editor.IStandaloneCodeEditor;
  /** The text model */
  model: monaco.editor.ITextModel;
  /** Dispose the editor and model */
  dispose: () => void;
}

/**
 * Default editor options with LSP-friendly settings
 */
const DEFAULT_EDITOR_OPTIONS: monaco.editor.IStandaloneEditorConstructionOptions = {
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
  // Enhanced syntax highlighting options
  renderWhitespace: 'selection',
  bracketPairColorization: { enabled: true },
  guides: {
    bracketPairs: true,
    indentation: true,
    highlightActiveIndentation: true,
  },
  // Semantic highlighting
  'semanticHighlighting.enabled': true,
  // Smooth scrolling and cursor
  smoothScrolling: true,
  cursorBlinking: 'smooth',
  cursorSmoothCaretAnimation: 'on',
  // Code folding
  folding: true,
  foldingStrategy: 'indentation',
  showFoldingControls: 'mouseover',
  // Hover and suggestions
  hover: { enabled: 'on', delay: 300 },
  quickSuggestions: true,
  suggestOnTriggerCharacters: true,
  parameterHints: { enabled: true },
  // Selection highlighting
  occurrencesHighlight: 'singleFile',
  selectionHighlight: true,
  // IntelliSense settings
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
};

/**
 * Create a unique model URI for a file
 */
function createModelUri(path?: string): monaco.Uri {
  const uniqueId = Date.now().toString(36) + Math.random().toString(36).substr(2);
  const defaultPath = `inmemory://model/${uniqueId}`;
  return monaco.Uri.parse(path || defaultPath);
}

/**
 * Create a Monaco editor with LSP support
 *
 * @param options Editor creation options
 * @returns Editor instance, model, and dispose function
 */
export function createLspEditor(options: LspEditorOptions): LspEditorResult {
  const { container, value = '', language = 'plaintext', readOnly = false, options: customOptions = {} } = options;

  // Create model with proper language ID
  const modelUri = createModelUri();
  const model = monaco.editor.createModel(value, language, modelUri);

  // Merge options
  const editorOptions: monaco.editor.IStandaloneEditorConstructionOptions = {
    ...DEFAULT_EDITOR_OPTIONS,
    ...customOptions,
    model,
    readOnly,
    // Enable LSP features for supported languages
    quickSuggestions: !readOnly && isLspSupportedLanguage(language),
    suggestOnTriggerCharacters: !readOnly && isLspSupportedLanguage(language),
    parameterHints: { enabled: !readOnly && isLspSupportedLanguage(language) },
  };

  // Create editor
  const editor = monaco.editor.create(container, editorOptions);

  // Dispose function
  const dispose = () => {
    editor.dispose();
    model.dispose();
  };

  return { editor, model, dispose };
}

/**
 * Update the language of an existing model
 * This is useful when file extensions change
 */
export function updateModelLanguage(model: monaco.editor.ITextModel, language: string): void {
  monaco.editor.setModelLanguage(model, language);
}

/**
 * Get Monaco editor module
 * Useful for accessing Monaco APIs directly
 */
export function getMonacoEditor(): typeof monaco.editor {
  return monaco.editor;
}

/**
 * Get Monaco module
 * Useful for accessing all Monaco APIs
 */
export function getMonaco(): typeof monaco {
  return monaco;
}

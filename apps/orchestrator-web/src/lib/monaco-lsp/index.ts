/**
 * Monaco LSP Integration
 *
 * Provides Language Server Protocol (LSP) support for the Monaco editor
 * using monaco-languageclient and @codingame/monaco-vscode-api.
 *
 * This module initializes VSCode services and configures TypeScript/JavaScript
 * language support running in web workers.
 */

export { initializeMonacoLsp, isLspInitialized } from './lsp-setup';
export { createLspEditor, getMonaco, getMonacoEditor, updateModelLanguage, type LspEditorOptions, type LspEditorResult } from './lsp-editor';
export { SUPPORTED_LSP_LANGUAGES, isLspSupportedLanguage, getLanguageIdForExtension, getExtensionFromFilename } from './languages';
export { useLspEditor, type UseLspEditorOptions, type UseLspEditorResult } from './use-lsp-editor';

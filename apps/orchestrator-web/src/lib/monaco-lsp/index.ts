/**
 * Monaco Language Support
 *
 * Pure utility module for language detection and support.
 * Note: Full LSP support via @codingame/monaco-vscode-* packages was removed
 * due to incompatibility issues. This module now only provides language utilities.
 */

export { SUPPORTED_LSP_LANGUAGES, isLspSupportedLanguage, getLanguageIdForExtension, getExtensionFromFilename } from './languages';

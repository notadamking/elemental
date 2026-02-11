/**
 * LSP Language Support Configuration
 *
 * Defines which languages have LSP support enabled and provides
 * utilities for language detection.
 */

/**
 * Languages with full LSP support (autocompletion, hover, diagnostics)
 */
export const SUPPORTED_LSP_LANGUAGES = [
  'typescript',
  'javascript',
  'typescriptreact',
  'javascriptreact',
] as const;

export type SupportedLspLanguage = (typeof SUPPORTED_LSP_LANGUAGES)[number];

/**
 * Check if a language has LSP support enabled
 */
export function isLspSupportedLanguage(language: string): language is SupportedLspLanguage {
  return SUPPORTED_LSP_LANGUAGES.includes(language as SupportedLspLanguage);
}

/**
 * Map file extensions to LSP-supported language IDs
 */
export function getLanguageIdForExtension(extension: string): string | null {
  const extensionMap: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescriptreact',
    mts: 'typescript',
    cts: 'typescript',
    js: 'javascript',
    jsx: 'javascriptreact',
    mjs: 'javascript',
    cjs: 'javascript',
  };

  return extensionMap[extension.toLowerCase()] || null;
}

/**
 * Get the file extension from a filename
 */
export function getExtensionFromFilename(filename: string): string {
  const parts = filename.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
}

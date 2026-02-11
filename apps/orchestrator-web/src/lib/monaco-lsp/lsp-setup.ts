/**
 * Monaco LSP Setup
 *
 * Initializes VSCode services and Monaco editor with LSP support.
 * This module handles the one-time initialization of the monaco-vscode-api
 * services that provide TypeScript/JavaScript language intelligence.
 */

import { initialize } from '@codingame/monaco-vscode-api';
import getLanguagesServiceOverride from '@codingame/monaco-vscode-languages-service-override';
import getTextMateServiceOverride from '@codingame/monaco-vscode-textmate-service-override';
import getThemeServiceOverride from '@codingame/monaco-vscode-theme-service-override';
import getModelServiceOverride from '@codingame/monaco-vscode-model-service-override';
import getConfigurationServiceOverride from '@codingame/monaco-vscode-configuration-service-override';

// Import TypeScript and theme extensions
import '@codingame/monaco-vscode-typescript-basics-default-extension';
import '@codingame/monaco-vscode-theme-defaults-default-extension';

/** Initialization state */
let initializationPromise: Promise<void> | null = null;
let initialized = false;

/**
 * Worker loader type for Monaco environment
 */
type WorkerLoader = () => Worker;

/**
 * Configure Monaco environment with web workers
 */
function configureMonacoEnvironment(): void {
  const workerLoaders: Partial<Record<string, WorkerLoader>> = {
    // Editor worker for basic editing features
    TextEditorWorker: () =>
      new Worker(
        new URL(
          '@codingame/monaco-vscode-editor-api/esm/vs/editor/editor.worker.js',
          import.meta.url
        ),
        { type: 'module' }
      ),
    // TextMate worker for syntax highlighting
    TextMateWorker: () =>
      new Worker(
        new URL(
          '@codingame/monaco-vscode-textmate-service-override/worker',
          import.meta.url
        ),
        { type: 'module' }
      ),
  };

  // Set up Monaco environment
  self.MonacoEnvironment = {
    getWorker(_workerId: string, label: string): Worker {
      const workerFactory = workerLoaders[label];
      if (workerFactory) {
        return workerFactory();
      }
      // Fallback to TextEditorWorker for unknown labels
      const fallback = workerLoaders.TextEditorWorker;
      if (fallback) {
        return fallback();
      }
      throw new Error(`Worker "${label}" not found and no fallback available`);
    },
  };
}

/**
 * Initialize Monaco with VSCode services and LSP support
 *
 * This function should be called once before using the Monaco editor.
 * It sets up:
 * - Web workers for editor and TextMate
 * - Language services (for language detection and features)
 * - TextMate service (for syntax highlighting)
 * - Theme service (for VS Code themes)
 * - Model service (for document models)
 * - Configuration service (for editor settings)
 *
 * @returns Promise that resolves when initialization is complete
 */
export async function initializeMonacoLsp(): Promise<void> {
  // Return existing promise if already initializing
  if (initializationPromise) {
    return initializationPromise;
  }

  // Return immediately if already initialized
  if (initialized) {
    return;
  }

  initializationPromise = (async () => {
    try {
      // Configure Monaco environment with web workers
      configureMonacoEnvironment();

      // Initialize VSCode services
      await initialize({
        ...getLanguagesServiceOverride(),
        ...getTextMateServiceOverride(),
        ...getThemeServiceOverride(),
        ...getModelServiceOverride(),
        ...getConfigurationServiceOverride(),
      });

      initialized = true;
      console.log('[Monaco LSP] Initialization complete');
    } catch (error) {
      console.error('[Monaco LSP] Initialization failed:', error);
      initializationPromise = null;
      throw error;
    }
  })();

  return initializationPromise;
}

/**
 * Check if Monaco LSP services have been initialized
 */
export function isLspInitialized(): boolean {
  return initialized;
}

/**
 * VSCode Services Initialization for monaco-languageclient v10.x
 *
 * monaco-languageclient v10+ depends on @codingame/monaco-vscode-api which requires
 * VSCode services to be initialized BEFORE creating any MonacoLanguageClient instances.
 *
 * This module provides a one-time initialization that must complete before LSP connections.
 * The initialization is idempotent - calling ensureServicesInitialized() multiple times
 * is safe and returns the same promise.
 *
 * Service overrides included:
 * - Model service: Required for document model management
 * - Languages service: Required for language features (completions, hover, etc.)
 *
 * Note: We use minimal service overrides to avoid conflicts with @monaco-editor/react
 * which manages its own Monaco instance. Only the services strictly required for
 * MonacoLanguageClient are initialized.
 */

import { initialize } from '@codingame/monaco-vscode-api';
import getModelServiceOverride from '@codingame/monaco-vscode-model-service-override';
import getLanguagesServiceOverride from '@codingame/monaco-vscode-languages-service-override';

/** Promise that resolves when VSCode services are initialized */
let initPromise: Promise<void> | null = null;

/** Whether initialization has been attempted */
let initAttempted = false;

/**
 * Initialize VSCode API services required for monaco-languageclient v10.x.
 *
 * This must be called BEFORE creating any MonacoLanguageClient instances.
 * The initialization is idempotent - multiple calls return the same promise.
 *
 * @returns Promise that resolves when services are ready
 * @throws If initialization fails
 */
export async function ensureServicesInitialized(): Promise<void> {
  // Return existing promise if already initializing/initialized
  if (initPromise) {
    return initPromise;
  }

  // Prevent re-initialization attempts after failure
  if (initAttempted) {
    throw new Error('[init-services] VSCode services initialization already attempted and failed');
  }

  initAttempted = true;
  console.log('[init-services] Initializing VSCode API services for monaco-languageclient...');

  initPromise = (async () => {
    try {
      // Initialize with minimal service overrides required for LSP
      // These are dependencies of monaco-languageclient and should be available
      await initialize({
        ...getModelServiceOverride(),
        ...getLanguagesServiceOverride(),
      });

      console.log('[init-services] VSCode API services initialized successfully');
    } catch (error) {
      // Reset state to allow retry
      initPromise = null;
      initAttempted = false;

      // Check for common error patterns
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (errorMessage.includes('already been initialized')) {
        // Services were already initialized elsewhere (e.g., by another module)
        console.log('[init-services] VSCode services already initialized by another source');
        return;
      }

      console.error('[init-services] Failed to initialize VSCode services:', error);
      throw new Error(`[init-services] VSCode services initialization failed: ${errorMessage}`);
    }
  })();

  return initPromise;
}

/**
 * Check if VSCode services have been initialized.
 *
 * @returns true if services are initialized, false otherwise
 */
export function isServicesInitialized(): boolean {
  return initPromise !== null;
}

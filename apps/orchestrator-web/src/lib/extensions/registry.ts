/**
 * Extension Registry Bridge
 *
 * Bridges the storage layer (IndexedDB) with Monaco's extension system
 * (@codingame/monaco-vscode-api). Handles loading installed extensions on
 * startup and registering/unregistering extensions at runtime.
 *
 * Key responsibilities:
 * - Load installed extensions from IndexedDB on startup
 * - Register extensions with Monaco via registerExtension()
 * - Create blob URLs for extension files and register them
 * - Track registered extensions for cleanup on uninstall
 * - Revoke blob URLs and dispose extension handles on uninstall
 */

import {
  registerExtension as monacoRegisterExtension,
  type IExtensionManifest,
} from '@codingame/monaco-vscode-api/extensions';
import {
  getInstalledExtensions,
  getExtensionFiles,
  type ExtensionManifest,
} from '../openvsx/storage';

// ============================================================================
// Types
// ============================================================================

/**
 * Simple disposable interface matching VS Code's IDisposable.
 * We define our own to avoid import issues with const enums.
 */
interface Disposable {
  dispose(): void;
}

/**
 * Represents a registered extension in the Monaco editor.
 * Tracks all resources needed for cleanup on uninstall.
 */
export interface RegisteredExtension {
  /** Extension ID (publisher.name format) */
  id: string;
  /** The extension manifest */
  manifest: ExtensionManifest;
  /** Blob URLs created for this extension's files */
  blobUrls: Map<string, string>;
  /** Disposables for file URL registrations */
  fileDisposables: Disposable[];
  /** Function to dispose the extension registration */
  dispose: () => Promise<void>;
  /** Promise that resolves when the extension is ready */
  whenReady: () => Promise<void>;
}

/**
 * Result from registering an extension, containing the registered extension
 * or an error if registration failed.
 */
export interface RegistrationResult {
  success: boolean;
  extension?: RegisteredExtension;
  error?: string;
}

// ============================================================================
// State
// ============================================================================

/** Map of extension ID to registered extension */
const registeredExtensions = new Map<string, RegisteredExtension>();

/** Flag to track if initial load has been performed */
let initialLoadComplete = false;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Convert a file path to a MIME type based on extension.
 */
function getMimeType(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'json':
      return 'application/json';
    case 'plist':
    case 'tmLanguage':
      return 'application/xml';
    case 'tmTheme':
      return 'application/xml';
    case 'png':
      return 'image/png';
    case 'svg':
      return 'image/svg+xml';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    default:
      return 'application/octet-stream';
  }
}

/**
 * Create a blob URL from file content.
 */
function createBlobUrl(content: Uint8Array, path: string): string {
  const mimeType = getMimeType(path);
  // Create a new ArrayBuffer from the Uint8Array to satisfy Blob constructor types
  // This handles both regular ArrayBuffer and SharedArrayBuffer backing
  const buffer = new ArrayBuffer(content.byteLength);
  new Uint8Array(buffer).set(content);
  const blob = new Blob([buffer], { type: mimeType });
  return URL.createObjectURL(blob);
}

/**
 * Convert our ExtensionManifest to the IExtensionManifest format expected
 * by @codingame/monaco-vscode-api.
 */
function toMonacoManifest(manifest: ExtensionManifest): IExtensionManifest {
  // The manifest types are largely compatible, but we need to cast
  // because our type is slightly more permissive
  return manifest as unknown as IExtensionManifest;
}

/**
 * Generate the extension ID from a manifest.
 */
function getExtensionId(manifest: ExtensionManifest): string {
  return `${manifest.publisher}.${manifest.name}`;
}

// ============================================================================
// Core API
// ============================================================================

/**
 * Register a single extension with Monaco.
 *
 * Creates blob URLs for all contributed files, registers them with the
 * extension system, and tracks the registration for later cleanup.
 *
 * @param manifest - The extension manifest (package.json)
 * @param files - Map of file paths to their content
 * @returns Registration result with the registered extension or error
 */
export function registerExtension(
  manifest: ExtensionManifest,
  files: Map<string, Uint8Array>
): RegistrationResult {
  const extensionId = getExtensionId(manifest);

  // Check if already registered
  if (registeredExtensions.has(extensionId)) {
    console.warn(
      `[ExtensionRegistry] Extension ${extensionId} is already registered`
    );
    return {
      success: true,
      extension: registeredExtensions.get(extensionId),
    };
  }

  try {
    // Register the extension with Monaco
    // ExtensionHostKind.LocalProcess = 1 (using literal due to isolatedModules)
    const registration = monacoRegisterExtension(
      toMonacoManifest(manifest),
      1 // ExtensionHostKind.LocalProcess
    );

    // Create blob URLs for all files and register them
    const blobUrls = new Map<string, string>();
    const fileDisposables: Disposable[] = [];

    for (const [path, content] of files) {
      const blobUrl = createBlobUrl(content, path);
      blobUrls.set(path, blobUrl);

      // Register the file URL with the extension
      const disposable = registration.registerFileUrl(path, blobUrl);
      fileDisposables.push(disposable);
    }

    // Create the registered extension record
    const registeredExtension: RegisteredExtension = {
      id: extensionId,
      manifest,
      blobUrls,
      fileDisposables,
      dispose: registration.dispose.bind(registration),
      whenReady: registration.whenReady.bind(registration),
    };

    // Track the registration
    registeredExtensions.set(extensionId, registeredExtension);

    console.log(`[ExtensionRegistry] Registered extension: ${extensionId}`);

    return {
      success: true,
      extension: registeredExtension,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    console.error(
      `[ExtensionRegistry] Failed to register extension ${extensionId}:`,
      error
    );
    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Unregister an extension and clean up all associated resources.
 *
 * Revokes all blob URLs and disposes the extension registration.
 *
 * @param extensionId - The extension ID to unregister
 */
export async function unregisterExtension(extensionId: string): Promise<void> {
  const registration = registeredExtensions.get(extensionId);

  if (!registration) {
    console.warn(
      `[ExtensionRegistry] Extension ${extensionId} is not registered`
    );
    return;
  }

  try {
    // Dispose file URL registrations
    for (const disposable of registration.fileDisposables) {
      disposable.dispose();
    }

    // Revoke all blob URLs to free memory
    for (const blobUrl of registration.blobUrls.values()) {
      URL.revokeObjectURL(blobUrl);
    }

    // Dispose the extension registration
    await registration.dispose();

    // Remove from tracking
    registeredExtensions.delete(extensionId);

    console.log(`[ExtensionRegistry] Unregistered extension: ${extensionId}`);
  } catch (error) {
    console.error(
      `[ExtensionRegistry] Error unregistering extension ${extensionId}:`,
      error
    );
    // Still remove from tracking even if disposal failed
    registeredExtensions.delete(extensionId);
    throw error;
  }
}

/**
 * Load all installed extensions from IndexedDB and register them with Monaco.
 *
 * This should be called once after initializeMonaco() completes.
 * Subsequent calls are no-ops.
 */
export async function loadInstalledExtensions(): Promise<void> {
  if (initialLoadComplete) {
    console.log(
      '[ExtensionRegistry] Initial load already complete, skipping'
    );
    return;
  }

  console.log('[ExtensionRegistry] Loading installed extensions...');

  try {
    const installedExtensions = await getInstalledExtensions();

    if (installedExtensions.length === 0) {
      console.log('[ExtensionRegistry] No installed extensions found');
      initialLoadComplete = true;
      return;
    }

    console.log(
      `[ExtensionRegistry] Found ${installedExtensions.length} installed extension(s)`
    );

    // Register each installed extension
    const results = await Promise.allSettled(
      installedExtensions.map(async (installed) => {
        const files = await getExtensionFiles(installed.id);
        return registerExtension(installed.manifest, files);
      })
    );

    // Log results
    let successCount = 0;
    let failureCount = 0;

    results.forEach((result, index) => {
      const extensionId = installedExtensions[index].id;
      if (result.status === 'fulfilled' && result.value.success) {
        successCount++;
      } else {
        failureCount++;
        const error =
          result.status === 'rejected'
            ? result.reason
            : result.value.error;
        console.error(
          `[ExtensionRegistry] Failed to load extension ${extensionId}:`,
          error
        );
      }
    });

    console.log(
      `[ExtensionRegistry] Loaded ${successCount} extension(s), ${failureCount} failed`
    );

    // Wait for all successfully registered extensions to be ready
    const readyPromises = Array.from(registeredExtensions.values()).map(
      (ext) =>
        ext.whenReady().catch((err) => {
          console.warn(
            `[ExtensionRegistry] Extension ${ext.id} whenReady failed:`,
            err
          );
        })
    );

    await Promise.all(readyPromises);

    console.log('[ExtensionRegistry] All extensions ready');
    initialLoadComplete = true;
  } catch (error) {
    console.error(
      '[ExtensionRegistry] Failed to load installed extensions:',
      error
    );
    // Mark as complete even on error to prevent infinite retry loops
    initialLoadComplete = true;
    throw error;
  }
}

/**
 * Get all currently registered extensions.
 *
 * @returns Array of registered extensions
 */
export function getRegisteredExtensions(): RegisteredExtension[] {
  return Array.from(registeredExtensions.values());
}

/**
 * Get a specific registered extension by ID.
 *
 * @param extensionId - The extension ID (publisher.name format)
 * @returns The registered extension or undefined if not found
 */
export function getRegisteredExtension(
  extensionId: string
): RegisteredExtension | undefined {
  return registeredExtensions.get(extensionId);
}

/**
 * Check if an extension is currently registered.
 *
 * @param extensionId - The extension ID to check
 * @returns True if the extension is registered
 */
export function isExtensionRegistered(extensionId: string): boolean {
  return registeredExtensions.has(extensionId);
}

/**
 * Check if the initial extension load has completed.
 *
 * @returns True if loadInstalledExtensions() has completed
 */
export function isInitialLoadComplete(): boolean {
  return initialLoadComplete;
}

/**
 * Reset the registry state. Useful for testing.
 * Does NOT unregister extensions from Monaco.
 */
export function resetRegistryState(): void {
  registeredExtensions.clear();
  initialLoadComplete = false;
}

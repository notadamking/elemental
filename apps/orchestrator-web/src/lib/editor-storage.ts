/**
 * Editor Storage Utilities
 *
 * Provides localStorage-based persistence for editor state,
 * including the last opened folder per workspace.
 */

// ============================================================================
// Constants
// ============================================================================

const STORAGE_PREFIX = 'elemental.editor';
const LAST_FOLDER_KEY = `${STORAGE_PREFIX}.lastFolder`;

// ============================================================================
// Types
// ============================================================================

/**
 * Stored state for a workspace's last folder
 */
interface LastFolderState {
  /** Path to the last opened/expanded folder */
  path: string;
  /** Timestamp when it was saved */
  savedAt: number;
}

/**
 * Map of workspace names to their last folder state
 */
type LastFolderStorage = Record<string, LastFolderState>;

// ============================================================================
// Last Folder Persistence
// ============================================================================

/**
 * Get the last opened folder path for a workspace
 *
 * @param workspaceName - The name of the workspace (directory name)
 * @returns The path to the last opened folder, or null if none stored
 */
export function getLastOpenedFolder(workspaceName: string): string | null {
  if (!workspaceName) return null;

  try {
    const stored = localStorage.getItem(LAST_FOLDER_KEY);
    if (!stored) return null;

    const storage: LastFolderStorage = JSON.parse(stored);
    const state = storage[workspaceName];

    return state?.path ?? null;
  } catch {
    // Handle corrupted storage gracefully
    return null;
  }
}

/**
 * Save the last opened folder path for a workspace
 *
 * @param workspaceName - The name of the workspace (directory name)
 * @param folderPath - The path to the folder that was opened
 */
export function setLastOpenedFolder(
  workspaceName: string,
  folderPath: string
): void {
  if (!workspaceName || !folderPath) return;

  try {
    const stored = localStorage.getItem(LAST_FOLDER_KEY);
    const storage: LastFolderStorage = stored ? JSON.parse(stored) : {};

    storage[workspaceName] = {
      path: folderPath,
      savedAt: Date.now(),
    };

    localStorage.setItem(LAST_FOLDER_KEY, JSON.stringify(storage));
  } catch {
    // Silently fail on storage errors
    console.warn('Failed to save last opened folder to localStorage');
  }
}

/**
 * Clear the last opened folder for a workspace
 *
 * @param workspaceName - The name of the workspace to clear
 */
export function clearLastOpenedFolder(workspaceName: string): void {
  if (!workspaceName) return;

  try {
    const stored = localStorage.getItem(LAST_FOLDER_KEY);
    if (!stored) return;

    const storage: LastFolderStorage = JSON.parse(stored);
    delete storage[workspaceName];

    localStorage.setItem(LAST_FOLDER_KEY, JSON.stringify(storage));
  } catch {
    // Silently fail on storage errors
  }
}

/**
 * Get all ancestor paths for a given folder path
 *
 * For example, "src/components/editor" returns:
 * ["src", "src/components", "src/components/editor"]
 *
 * @param folderPath - The full path to expand to
 * @returns Array of ancestor paths including the target
 */
export function getAncestorPaths(folderPath: string): string[] {
  if (!folderPath) return [];

  const parts = folderPath.split('/');
  const paths: string[] = [];

  for (let i = 0; i < parts.length; i++) {
    paths.push(parts.slice(0, i + 1).join('/'));
  }

  return paths;
}

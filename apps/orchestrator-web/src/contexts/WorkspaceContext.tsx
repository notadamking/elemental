/**
 * WorkspaceContext - Global context for local workspace file system access
 *
 * Provides access to the File System Access API state across the application,
 * allowing components to browse and read files from a user-selected workspace directory.
 */

import { createContext, useContext, ReactNode } from 'react';
import {
  useFileSystemAccess,
  type UseFileSystemAccessReturn,
  type FileSystemEntry,
  type FileReadResult,
  type FileWriteResult,
} from '../hooks/useFileSystemAccess';

// ============================================================================
// Context
// ============================================================================

const WorkspaceContext = createContext<UseFileSystemAccessReturn | null>(null);

// ============================================================================
// Provider
// ============================================================================

export interface WorkspaceProviderProps {
  children: ReactNode;
}

/**
 * Provider component for workspace file system access
 */
export function WorkspaceProvider({ children }: WorkspaceProviderProps) {
  const fileSystemAccess = useFileSystemAccess();

  return (
    <WorkspaceContext.Provider value={fileSystemAccess}>
      {children}
    </WorkspaceContext.Provider>
  );
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook to access the workspace file system context
 *
 * @throws Error if used outside of WorkspaceProvider
 */
export function useWorkspace(): UseFileSystemAccessReturn {
  const context = useContext(WorkspaceContext);

  if (!context) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }

  return context;
}

// ============================================================================
// Re-exports for convenience
// ============================================================================

export type { FileSystemEntry, FileReadResult, FileWriteResult, UseFileSystemAccessReturn };

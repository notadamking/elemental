/**
 * useFileSystemAccess Hook - File System Access API Integration
 *
 * Provides a hook for interacting with the browser's File System Access API
 * to allow users to open local workspace directories and browse files.
 *
 * Features:
 * - Open directory picker to select a workspace
 * - Read directory contents recursively
 * - Read individual file contents
 * - Handle API availability detection
 * - Error handling for permission denials and other issues
 */

import { useState, useCallback, useRef } from 'react';

// ============================================================================
// Types
// ============================================================================

/**
 * Represents a file or directory entry in the workspace
 */
export interface FileSystemEntry {
  /** Unique identifier for the entry (full path from root) */
  id: string;
  /** Display name of the file or directory */
  name: string;
  /** Type of entry */
  type: 'file' | 'directory';
  /** Path from workspace root */
  path: string;
  /** File size in bytes (only for files) */
  size?: number;
  /** Last modified timestamp */
  lastModified?: number;
  /** Children entries (only for directories) */
  children?: FileSystemEntry[];
  /** The underlying file handle (for reading content later) */
  handle?: FileSystemFileHandle;
  /** The underlying directory handle */
  dirHandle?: FileSystemDirectoryHandle;
}

/**
 * Result of reading a file
 */
export interface FileReadResult {
  /** The file content as text */
  content: string;
  /** The file name */
  name: string;
  /** The file path */
  path: string;
  /** File size in bytes */
  size: number;
  /** Last modified timestamp */
  lastModified: number;
  /** Detected language/mime type */
  language?: string;
}

/**
 * Hook state
 */
export interface FileSystemAccessState {
  /** Whether a workspace is currently open */
  isOpen: boolean;
  /** The root directory handle */
  rootHandle: FileSystemDirectoryHandle | null;
  /** The name of the opened workspace directory */
  workspaceName: string | null;
  /** Flattened tree of all entries */
  entries: FileSystemEntry[];
  /** Whether we're currently loading */
  isLoading: boolean;
  /** Any error that occurred */
  error: string | null;
}

/**
 * Hook return value
 */
export interface UseFileSystemAccessReturn extends FileSystemAccessState {
  /** Whether the File System Access API is available */
  isSupported: boolean;
  /** Open a directory picker to select a workspace */
  openWorkspace: () => Promise<void>;
  /** Close the current workspace */
  closeWorkspace: () => void;
  /** Refresh the file tree */
  refreshTree: () => Promise<void>;
  /** Read a file's content */
  readFile: (entry: FileSystemEntry) => Promise<FileReadResult>;
  /** Read a file by path */
  readFileByPath: (path: string) => Promise<FileReadResult | null>;
}

// ============================================================================
// Browser API Detection
// ============================================================================

/**
 * Check if the File System Access API is available
 */
export function isFileSystemAccessSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'showDirectoryPicker' in window &&
    typeof window.showDirectoryPicker === 'function'
  );
}

// ============================================================================
// File Language Detection
// ============================================================================

/**
 * Detect language from filename extension
 */
function detectLanguage(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';

  const extMap: Record<string, string> = {
    js: 'javascript',
    jsx: 'javascript',
    mjs: 'javascript',
    cjs: 'javascript',
    ts: 'typescript',
    tsx: 'typescript',
    mts: 'typescript',
    cts: 'typescript',
    json: 'json',
    jsonc: 'json',
    json5: 'json',
    md: 'markdown',
    mdx: 'markdown',
    html: 'html',
    htm: 'html',
    css: 'css',
    scss: 'scss',
    sass: 'scss',
    less: 'less',
    py: 'python',
    pyw: 'python',
    pyx: 'python',
    yaml: 'yaml',
    yml: 'yaml',
    xml: 'xml',
    svg: 'xml',
    sql: 'sql',
    sh: 'shell',
    bash: 'shell',
    zsh: 'shell',
    fish: 'shell',
    ps1: 'powershell',
    go: 'go',
    rs: 'rust',
    java: 'java',
    kt: 'kotlin',
    kts: 'kotlin',
    c: 'c',
    cpp: 'cpp',
    cc: 'cpp',
    cxx: 'cpp',
    h: 'c',
    hpp: 'cpp',
    hxx: 'cpp',
    cs: 'csharp',
    php: 'php',
    rb: 'ruby',
    swift: 'swift',
    r: 'r',
    R: 'r',
    lua: 'lua',
    pl: 'perl',
    pm: 'perl',
    ex: 'elixir',
    exs: 'elixir',
    erl: 'erlang',
    hrl: 'erlang',
    clj: 'clojure',
    cljs: 'clojure',
    scala: 'scala',
    vue: 'vue',
    svelte: 'svelte',
    astro: 'astro',
    graphql: 'graphql',
    gql: 'graphql',
    dockerfile: 'dockerfile',
    toml: 'toml',
    ini: 'ini',
    conf: 'ini',
    cfg: 'ini',
    env: 'dotenv',
    gitignore: 'ignore',
    dockerignore: 'ignore',
    makefile: 'makefile',
    cmake: 'cmake',
  };

  // Handle special filenames
  const lowerName = filename.toLowerCase();
  if (lowerName === 'dockerfile' || lowerName.startsWith('dockerfile.')) {
    return 'dockerfile';
  }
  if (lowerName === 'makefile' || lowerName === 'gnumakefile') {
    return 'makefile';
  }
  if (lowerName.endsWith('.d.ts')) {
    return 'typescript';
  }

  return extMap[ext] || 'plaintext';
}

// ============================================================================
// Helper to check if path should be ignored
// ============================================================================

const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  '.svn',
  '.hg',
  'dist',
  'build',
  'out',
  '.next',
  '.nuxt',
  '.cache',
  '__pycache__',
  '.pytest_cache',
  'target',
  'vendor',
  '.elemental',
  '.vscode',
  '.idea',
  'coverage',
]);

function shouldIgnore(name: string): boolean {
  return IGNORED_DIRS.has(name) || name.startsWith('.');
}

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Hook for accessing the local file system via File System Access API
 */
export function useFileSystemAccess(): UseFileSystemAccessReturn {
  const [state, setState] = useState<FileSystemAccessState>({
    isOpen: false,
    rootHandle: null,
    workspaceName: null,
    entries: [],
    isLoading: false,
    error: null,
  });

  // Keep track of file handles for reading
  const fileHandlesRef = useRef<Map<string, FileSystemFileHandle>>(new Map());

  const isSupported = isFileSystemAccessSupported();

  /**
   * Read directory contents recursively
   */
  const readDirectory = useCallback(
    async (
      dirHandle: FileSystemDirectoryHandle,
      basePath: string = '',
      depth: number = 0,
      maxDepth: number = 10
    ): Promise<FileSystemEntry[]> => {
      if (depth >= maxDepth) {
        return [];
      }

      const entries: FileSystemEntry[] = [];

      try {
        for await (const entry of dirHandle.values()) {
          const path = basePath ? `${basePath}/${entry.name}` : entry.name;

          if (entry.kind === 'directory') {
            // Skip ignored directories
            if (shouldIgnore(entry.name)) {
              continue;
            }

            const children = await readDirectory(
              entry as FileSystemDirectoryHandle,
              path,
              depth + 1,
              maxDepth
            );

            entries.push({
              id: path,
              name: entry.name,
              type: 'directory',
              path,
              children,
              dirHandle: entry as FileSystemDirectoryHandle,
            });
          } else {
            // File entry
            const fileHandle = entry as FileSystemFileHandle;

            // Store handle for later reading
            fileHandlesRef.current.set(path, fileHandle);

            // Get file metadata
            let size: number | undefined;
            let lastModified: number | undefined;

            try {
              const file = await fileHandle.getFile();
              size = file.size;
              lastModified = file.lastModified;
            } catch {
              // Ignore metadata errors
            }

            entries.push({
              id: path,
              name: entry.name,
              type: 'file',
              path,
              size,
              lastModified,
              handle: fileHandle,
            });
          }
        }
      } catch (error) {
        console.warn(`Error reading directory ${basePath}:`, error);
      }

      // Sort: directories first, then files, alphabetically
      return entries.sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === 'directory' ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });
    },
    []
  );

  /**
   * Open a directory picker to select a workspace
   */
  const openWorkspace = useCallback(async () => {
    if (!isSupported) {
      setState((prev) => ({
        ...prev,
        error: 'File System Access API is not supported in this browser.',
      }));
      return;
    }

    setState((prev) => ({
      ...prev,
      isLoading: true,
      error: null,
    }));

    try {
      // Open directory picker
      const dirHandle = await window.showDirectoryPicker({
        mode: 'read',
      });

      // Clear previous file handles
      fileHandlesRef.current.clear();

      // Read directory contents
      const entries = await readDirectory(dirHandle);

      setState({
        isOpen: true,
        rootHandle: dirHandle,
        workspaceName: dirHandle.name,
        entries,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      // User cancelled or permission denied
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          // User cancelled - don't set error
          setState((prev) => ({
            ...prev,
            isLoading: false,
          }));
        } else {
          setState((prev) => ({
            ...prev,
            isLoading: false,
            error: error.message,
          }));
        }
      } else {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: 'Failed to open workspace directory.',
        }));
      }
    }
  }, [isSupported, readDirectory]);

  /**
   * Close the current workspace
   */
  const closeWorkspace = useCallback(() => {
    fileHandlesRef.current.clear();
    setState({
      isOpen: false,
      rootHandle: null,
      workspaceName: null,
      entries: [],
      isLoading: false,
      error: null,
    });
  }, []);

  /**
   * Refresh the file tree
   */
  const refreshTree = useCallback(async () => {
    if (!state.rootHandle) {
      return;
    }

    setState((prev) => ({
      ...prev,
      isLoading: true,
      error: null,
    }));

    try {
      // Clear previous file handles
      fileHandlesRef.current.clear();

      // Re-read directory contents
      const entries = await readDirectory(state.rootHandle);

      setState((prev) => ({
        ...prev,
        entries,
        isLoading: false,
      }));
    } catch (error) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to refresh workspace.',
      }));
    }
  }, [state.rootHandle, readDirectory]);

  /**
   * Read a file's content
   */
  const readFile = useCallback(async (entry: FileSystemEntry): Promise<FileReadResult> => {
    if (entry.type !== 'file') {
      throw new Error('Cannot read content of a directory');
    }

    const handle = entry.handle || fileHandlesRef.current.get(entry.path);
    if (!handle) {
      throw new Error('File handle not found');
    }

    try {
      const file = await handle.getFile();
      const content = await file.text();

      return {
        content,
        name: file.name,
        path: entry.path,
        size: file.size,
        lastModified: file.lastModified,
        language: detectLanguage(file.name),
      };
    } catch (error) {
      throw new Error(
        `Failed to read file: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }, []);

  /**
   * Read a file by path
   */
  const readFileByPath = useCallback(
    async (path: string): Promise<FileReadResult | null> => {
      const handle = fileHandlesRef.current.get(path);
      if (!handle) {
        return null;
      }

      try {
        const file = await handle.getFile();
        const content = await file.text();

        return {
          content,
          name: file.name,
          path,
          size: file.size,
          lastModified: file.lastModified,
          language: detectLanguage(file.name),
        };
      } catch {
        return null;
      }
    },
    []
  );

  return {
    ...state,
    isSupported,
    openWorkspace,
    closeWorkspace,
    refreshTree,
    readFile,
    readFileByPath,
  };
}

export default useFileSystemAccess;

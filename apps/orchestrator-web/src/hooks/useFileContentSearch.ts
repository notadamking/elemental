/**
 * useFileContentSearch Hook - File Content Search with Real-time Results
 *
 * Provides a hook for searching through file contents in the workspace.
 * Features:
 * - Debounced search input
 * - Real-time streaming results as files are searched
 * - Regex support (optional)
 * - Case sensitivity toggle
 * - Search progress tracking
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useDebounce } from './useDebounce';
import { useWorkspace, type FileSystemEntry } from '../contexts';

// ============================================================================
// Constants
// ============================================================================

/** Default debounce delay in milliseconds */
export const SEARCH_DEBOUNCE_DELAY = 300;

/** Maximum number of matches to return per file */
export const MAX_MATCHES_PER_FILE = 10;

/** Maximum total matches to return */
export const MAX_TOTAL_MATCHES = 200;

/** Maximum file size to search (skip large files) */
export const MAX_FILE_SIZE = 1024 * 1024; // 1MB

// ============================================================================
// Types
// ============================================================================

/**
 * A single match within a file
 */
export interface FileMatch {
  /** Line number (1-indexed) */
  line: number;
  /** Column position (1-indexed) */
  column: number;
  /** The matched text */
  matchedText: string;
  /** Full line content */
  lineContent: string;
  /** Start position of match in line */
  startIndex: number;
  /** End position of match in line */
  endIndex: number;
}

/**
 * Search result for a single file
 */
export interface FileSearchResult {
  /** File path from workspace root */
  path: string;
  /** File name */
  name: string;
  /** All matches in this file */
  matches: FileMatch[];
  /** Total matches in file (may be more than returned if truncated) */
  totalMatches: number;
}

/**
 * Overall search state
 */
export interface FileContentSearchState {
  /** Current search query */
  query: string;
  /** Debounced search query (actual search is performed with this) */
  debouncedQuery: string;
  /** Whether a search is currently in progress */
  isSearching: boolean;
  /** Search results */
  results: FileSearchResult[];
  /** Total number of files searched */
  filesSearched: number;
  /** Total number of files to search */
  totalFiles: number;
  /** Total number of matches found */
  totalMatches: number;
  /** Search progress (0-1) */
  progress: number;
  /** Error message if search failed */
  error: string | null;
  /** Whether search is complete */
  isComplete: boolean;
  /** Time taken to complete search (ms) */
  searchTime: number | null;
}

/**
 * Search options
 */
export interface FileContentSearchOptions {
  /** Whether search is case sensitive (default: false) */
  caseSensitive?: boolean;
  /** Whether to use regex (default: false) */
  useRegex?: boolean;
  /** Whether to search whole words only (default: false) */
  wholeWord?: boolean;
  /** File extensions to include (e.g., ['ts', 'tsx', 'js']) */
  includeExtensions?: string[];
  /** File extensions to exclude */
  excludeExtensions?: string[];
  /** Debounce delay in ms (default: SEARCH_DEBOUNCE_DELAY) */
  debounceDelay?: number;
}

/**
 * Hook return value
 */
export interface UseFileContentSearchReturn extends FileContentSearchState {
  /** Set the search query */
  setQuery: (query: string) => void;
  /** Cancel any ongoing search */
  cancelSearch: () => void;
  /** Clear results and reset state */
  clearResults: () => void;
  /** Current search options */
  options: FileContentSearchOptions;
  /** Update search options */
  setOptions: (options: Partial<FileContentSearchOptions>) => void;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Flatten file tree to get all files
 */
function flattenFiles(entries: FileSystemEntry[]): FileSystemEntry[] {
  const files: FileSystemEntry[] = [];

  function traverse(entry: FileSystemEntry) {
    if (entry.type === 'file') {
      files.push(entry);
    } else if (entry.children) {
      for (const child of entry.children) {
        traverse(child);
      }
    }
  }

  for (const entry of entries) {
    traverse(entry);
  }

  return files;
}

/**
 * Get file extension from filename
 */
function getExtension(filename: string): string {
  const parts = filename.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
}

/**
 * Check if file should be searched based on options
 */
function shouldSearchFile(
  file: FileSystemEntry,
  options: FileContentSearchOptions
): boolean {
  const ext = getExtension(file.name);

  if (options.includeExtensions && options.includeExtensions.length > 0) {
    if (!options.includeExtensions.includes(ext)) {
      return false;
    }
  }

  if (options.excludeExtensions && options.excludeExtensions.length > 0) {
    if (options.excludeExtensions.includes(ext)) {
      return false;
    }
  }

  // Skip files that are too large
  if (file.size && file.size > MAX_FILE_SIZE) {
    return false;
  }

  return true;
}

/**
 * Create search pattern from query
 */
function createSearchPattern(
  query: string,
  options: FileContentSearchOptions
): RegExp | null {
  if (!query) return null;

  try {
    let pattern = query;

    if (!options.useRegex) {
      // Escape special regex characters for literal search
      pattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    if (options.wholeWord) {
      pattern = `\\b${pattern}\\b`;
    }

    const flags = options.caseSensitive ? 'g' : 'gi';
    return new RegExp(pattern, flags);
  } catch {
    // Invalid regex pattern
    return null;
  }
}

/**
 * Search file content for matches
 */
function searchContent(
  content: string,
  pattern: RegExp,
  maxMatches: number = MAX_MATCHES_PER_FILE
): { matches: FileMatch[]; totalMatches: number } {
  const matches: FileMatch[] = [];
  const lines = content.split('\n');
  let totalMatches = 0;

  for (let lineNum = 0; lineNum < lines.length && matches.length < maxMatches; lineNum++) {
    const line = lines[lineNum];
    // Reset lastIndex for each line
    pattern.lastIndex = 0;

    let match: RegExpExecArray | null;
    while ((match = pattern.exec(line)) !== null && matches.length < maxMatches) {
      totalMatches++;
      matches.push({
        line: lineNum + 1,
        column: match.index + 1,
        matchedText: match[0],
        lineContent: line,
        startIndex: match.index,
        endIndex: match.index + match[0].length,
      });

      // Prevent infinite loop on zero-length matches
      if (match.index === pattern.lastIndex) {
        pattern.lastIndex++;
      }
    }

    // Continue counting total matches even if we've hit the limit
    if (matches.length >= maxMatches) {
      while ((match = pattern.exec(line)) !== null) {
        totalMatches++;
        if (match.index === pattern.lastIndex) {
          pattern.lastIndex++;
        }
      }
    }
  }

  // Count remaining matches in remaining lines
  for (let lineNum = lines.findIndex(l => l === lines[lines.length - 1]) + 1; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum];
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(line)) !== null) {
      totalMatches++;
      if (match.index === pattern.lastIndex) {
        pattern.lastIndex++;
      }
    }
  }

  return { matches, totalMatches };
}

// ============================================================================
// Initial State
// ============================================================================

const initialState: FileContentSearchState = {
  query: '',
  debouncedQuery: '',
  isSearching: false,
  results: [],
  filesSearched: 0,
  totalFiles: 0,
  totalMatches: 0,
  progress: 0,
  error: null,
  isComplete: false,
  searchTime: null,
};

const defaultOptions: FileContentSearchOptions = {
  caseSensitive: false,
  useRegex: false,
  wholeWord: false,
  includeExtensions: undefined,
  excludeExtensions: undefined,
  debounceDelay: SEARCH_DEBOUNCE_DELAY,
};

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Hook for searching file contents with real-time results
 */
export function useFileContentSearch(
  initialOptions: FileContentSearchOptions = {}
): UseFileContentSearchReturn {
  const { entries, readFile, isOpen } = useWorkspace();
  const [state, setState] = useState<FileContentSearchState>(initialState);
  const [options, setOptionsState] = useState<FileContentSearchOptions>({
    ...defaultOptions,
    ...initialOptions,
  });

  // Track abort controller for cancellation
  const abortControllerRef = useRef<AbortController | null>(null);

  // Debounce the query
  const debouncedQuery = useDebounce(state.query, options.debounceDelay ?? SEARCH_DEBOUNCE_DELAY);

  // Update debouncedQuery in state when it changes
  useEffect(() => {
    setState(prev => ({ ...prev, debouncedQuery }));
  }, [debouncedQuery]);

  /**
   * Set search query
   */
  const setQuery = useCallback((query: string) => {
    setState(prev => ({
      ...prev,
      query,
      isComplete: false,
    }));
  }, []);

  /**
   * Cancel ongoing search
   */
  const cancelSearch = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setState(prev => ({
      ...prev,
      isSearching: false,
      isComplete: true,
    }));
  }, []);

  /**
   * Clear results and reset state
   */
  const clearResults = useCallback(() => {
    cancelSearch();
    setState(initialState);
  }, [cancelSearch]);

  /**
   * Update search options
   */
  const setOptions = useCallback((newOptions: Partial<FileContentSearchOptions>) => {
    setOptionsState(prev => ({ ...prev, ...newOptions }));
  }, []);

  /**
   * Perform the search when debouncedQuery changes
   */
  useEffect(() => {
    // Cancel any previous search
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Don't search if no query or workspace not open
    if (!debouncedQuery.trim() || !isOpen) {
      setState(prev => ({
        ...prev,
        results: [],
        isSearching: false,
        filesSearched: 0,
        totalFiles: 0,
        totalMatches: 0,
        progress: 0,
        error: null,
        isComplete: !debouncedQuery.trim(),
        searchTime: null,
      }));
      return;
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const runSearch = async () => {
      const startTime = performance.now();

      // Create search pattern
      const pattern = createSearchPattern(debouncedQuery, options);
      if (!pattern) {
        setState(prev => ({
          ...prev,
          error: 'Invalid search pattern',
          isSearching: false,
          isComplete: true,
        }));
        return;
      }

      // Get all files to search
      const allFiles = flattenFiles(entries);
      const filesToSearch = allFiles.filter(f => shouldSearchFile(f, options));

      setState(prev => ({
        ...prev,
        isSearching: true,
        results: [],
        filesSearched: 0,
        totalFiles: filesToSearch.length,
        totalMatches: 0,
        progress: 0,
        error: null,
        isComplete: false,
        searchTime: null,
      }));

      const results: FileSearchResult[] = [];
      let totalMatchesFound = 0;

      for (let i = 0; i < filesToSearch.length; i++) {
        // Check for cancellation
        if (abortController.signal.aborted) {
          return;
        }

        const file = filesToSearch[i];

        try {
          // Read file content
          const fileResult = await readFile(file);

          // Search content
          const { matches, totalMatches } = searchContent(fileResult.content, pattern);

          if (matches.length > 0) {
            results.push({
              path: file.path,
              name: file.name,
              matches,
              totalMatches,
            });
            totalMatchesFound += totalMatches;

            // Check if we've hit the total match limit
            if (totalMatchesFound >= MAX_TOTAL_MATCHES) {
              // Update state with final results
              setState(prev => ({
                ...prev,
                results: [...results],
                filesSearched: i + 1,
                totalMatches: totalMatchesFound,
                progress: 1,
                isSearching: false,
                isComplete: true,
                searchTime: performance.now() - startTime,
                error: `Search stopped: Maximum ${MAX_TOTAL_MATCHES} matches reached`,
              }));
              return;
            }
          }

          // Update progress periodically (every 5 files or on match)
          if (i % 5 === 0 || matches.length > 0) {
            setState(prev => ({
              ...prev,
              results: [...results],
              filesSearched: i + 1,
              totalMatches: totalMatchesFound,
              progress: (i + 1) / filesToSearch.length,
            }));
          }
        } catch {
          // Skip files that can't be read (binary files, etc.)
          continue;
        }
      }

      // Final update
      const endTime = performance.now();
      setState(prev => ({
        ...prev,
        results,
        filesSearched: filesToSearch.length,
        totalMatches: totalMatchesFound,
        progress: 1,
        isSearching: false,
        isComplete: true,
        searchTime: endTime - startTime,
      }));
    };

    runSearch();

    // Cleanup
    return () => {
      abortController.abort();
    };
  }, [debouncedQuery, entries, isOpen, options, readFile]);

  return {
    ...state,
    setQuery,
    cancelSearch,
    clearResults,
    options,
    setOptions,
  };
}

export default useFileContentSearch;

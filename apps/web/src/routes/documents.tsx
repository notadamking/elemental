/**
 * Documents Page - Notion-style document library interface
 *
 * Features:
 * - Library tree sidebar (TB20)
 * - Library selection
 * - Document list
 * - Nested library navigation
 * - Document detail display (TB21)
 */

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearch, useNavigate } from '@tanstack/react-router';
import { ElementNotFound } from '../components/shared/ElementNotFound';
import { useDeepLink } from '../hooks/useDeepLink';
import { useDebounce } from '../hooks';
import { useIsMobile } from '../hooks/useBreakpoint';
import { VirtualizedList } from '../components/shared/VirtualizedList';
import { MobileDetailSheet } from '../components/shared/MobileDetailSheet';
import {
  Library,
  FileText,
  ChevronRight,
  ChevronDown,
  FolderOpen,
  Folder,
  FolderPlus,
  X,
  User,
  Tag,
  Clock,
  Hash,
  Code,
  FileType,
  Edit3,
  Save,
  XCircle,
  History,
  RotateCcw,
  Eye,
  Plus,
  Maximize2,
  Minimize2,
  Copy,
  Link2,
  ExternalLink,
  ArrowRight,
  ArrowLeft,
  Search,
  Unlink,
  Loader2,
  MessageSquare,
  Smile,
} from 'lucide-react';
import { EmojiPickerModal } from '../components/editor/EmojiPickerModal';
import { BlockEditor } from '../components/editor/BlockEditor';
import { CreateDocumentModal } from '../components/document/CreateDocumentModal';
import { CreateLibraryModal } from '../components/document/CreateLibraryModal';
import { AddCommentModal } from '../components/editor/AddCommentModal';
import { CommentsPanel } from '../components/editor/CommentsPanel';
import { useAllDocuments as useAllDocumentsPreloaded, useAllEntities } from '../api/hooks/useAllElements';
import type { MentionEntity } from '../components/editor/MentionAutocomplete';
import { useCreateComment, useDocumentComments, type Comment } from '../api/hooks/useDocumentComments';
import { createTextAnchor, findAnchorPosition, getPlainTextForAnchoring } from '../lib/anchors';
import { sortData, createSimpleDocumentSearchFilter } from '../hooks/usePaginatedData';
import { markdownToHtml, isHtmlContent } from '../lib/markdown';

// ============================================================================
// Search Constants and Hooks (TB95)
// ============================================================================

const SEARCH_DEBOUNCE_DELAY = 300;

interface DocumentSearchResult {
  id: string;
  title: string;
  contentType: string;
  matchType: 'title' | 'content' | 'both';
  snippet?: string;
  updatedAt: string;
}

interface DocumentSearchResponse {
  results: DocumentSearchResult[];
  query: string;
}

/**
 * Hook to search documents by title and content (TB95)
 */
function useDocumentSearch(query: string) {
  const debouncedQuery = useDebounce(query, SEARCH_DEBOUNCE_DELAY);

  return useQuery<DocumentSearchResponse>({
    queryKey: ['documents', 'search', debouncedQuery],
    queryFn: async () => {
      if (!debouncedQuery.trim()) {
        return { results: [], query: '' };
      }
      const response = await fetch(`/api/documents/search?q=${encodeURIComponent(debouncedQuery)}&limit=10`);
      if (!response.ok) {
        throw new Error('Failed to search documents');
      }
      return response.json();
    },
    enabled: debouncedQuery.trim().length > 0,
    staleTime: 30000, // Cache for 30 seconds
  });
}

/**
 * Highlights search query matches in text
 */
function highlightMatches(text: string, query: string): React.ReactNode {
  if (!query || !text) return text;

  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const matchIndex = lowerText.indexOf(lowerQuery);

  if (matchIndex === -1) return text;

  return (
    <>
      {text.slice(0, matchIndex)}
      <mark className="bg-yellow-200 text-gray-900 rounded-sm px-0.5">
        {text.slice(matchIndex, matchIndex + query.length)}
      </mark>
      {text.slice(matchIndex + query.length)}
    </>
  );
}

/**
 * Document Search Bar Component (TB95)
 * Provides full-text search across document titles and content
 */
function DocumentSearchBar({
  onSelectDocument,
}: {
  onSelectDocument: (documentId: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: searchData, isLoading, isFetching } = useDocumentSearch(query);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Keyboard shortcuts: / to focus, Escape to clear/close
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      // / to focus search when not in an input
      if (
        event.key === '/' &&
        !(event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)
      ) {
        event.preventDefault();
        inputRef.current?.focus();
      }
      // Escape to clear/close
      if (event.key === 'Escape' && document.activeElement === inputRef.current) {
        event.preventDefault();
        if (query) {
          setQuery('');
        } else {
          setIsOpen(false);
          inputRef.current?.blur();
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [query]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    setIsOpen(true);
  };

  const handleClear = () => {
    setQuery('');
    setIsOpen(false);
    inputRef.current?.focus();
  };

  const handleSelectResult = (documentId: string) => {
    onSelectDocument(documentId);
    setQuery('');
    setIsOpen(false);
  };

  const showDropdown = isOpen && query.trim().length > 0;
  const results = searchData?.results || [];
  const showLoading = (isLoading || isFetching) && query.trim().length > 0;

  return (
    <div ref={containerRef} className="relative" data-testid="document-search-container">
      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleInputChange}
          onFocus={() => query.trim() && setIsOpen(true)}
          placeholder="Search docs... (/)"
          className="w-full pl-9 pr-8 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          data-testid="document-search-input"
          aria-label="Search documents"
        />
        {query && (
          <button
            onClick={handleClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 rounded"
            data-testid="document-search-clear"
            aria-label="Clear search"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Results Dropdown */}
      {showDropdown && (
        <div
          className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-80 overflow-y-auto"
          data-testid="document-search-results"
        >
          {showLoading && (
            <div className="flex items-center gap-2 px-3 py-2 text-sm text-gray-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              Searching...
            </div>
          )}

          {!showLoading && results.length === 0 && (
            <div className="px-3 py-4 text-sm text-gray-500 text-center" data-testid="document-search-no-results">
              No documents found for "{query}"
            </div>
          )}

          {!showLoading && results.length > 0 && (
            <div data-testid="document-search-results-list">
              {results.map((result) => (
                <button
                  key={result.id}
                  onClick={() => handleSelectResult(result.id)}
                  className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b border-gray-100 last:border-b-0 focus:bg-gray-50 focus:outline-none"
                  data-testid={`document-search-result-${result.id}`}
                >
                  {/* Title with highlight */}
                  <div className="font-medium text-gray-900 text-sm truncate">
                    <FileText className="inline w-4 h-4 text-blue-400 mr-1.5" />
                    {highlightMatches(result.title, query)}
                  </div>

                  {/* Content snippet with highlight */}
                  {result.snippet && (
                    <div className="text-xs text-gray-500 mt-0.5 line-clamp-2" data-testid={`document-search-snippet-${result.id}`}>
                      {highlightMatches(result.snippet, query)}
                    </div>
                  )}

                  {/* Metadata */}
                  <div className="flex items-center gap-2 text-xs text-gray-400 mt-1">
                    <span className={`px-1.5 py-0.5 rounded ${
                      result.matchType === 'content' ? 'bg-yellow-100 text-yellow-700' :
                      result.matchType === 'both' ? 'bg-green-100 text-green-700' :
                      'bg-blue-100 text-blue-700'
                    }`}>
                      {result.matchType === 'title' ? 'Title match' :
                       result.matchType === 'content' ? 'Content match' : 'Title & content'}
                    </span>
                    <span>{result.contentType}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Types
// ============================================================================

interface LibraryType {
  id: string;
  name: string;
  type: 'library';
  descriptionRef?: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  tags: string[];
  parentId: string | null;
}

interface LibraryTreeNode extends LibraryType {
  children: LibraryTreeNode[];
}

/**
 * Build a tree structure from a flat list of libraries
 */
function buildLibraryTree(libraries: LibraryType[]): LibraryTreeNode[] {
  const nodeMap = new Map<string, LibraryTreeNode>();
  const roots: LibraryTreeNode[] = [];

  // First pass: create nodes
  for (const library of libraries) {
    nodeMap.set(library.id, { ...library, children: [] });
  }

  // Second pass: build tree
  for (const library of libraries) {
    const node = nodeMap.get(library.id)!;
    if (library.parentId && nodeMap.has(library.parentId)) {
      // Add to parent's children
      nodeMap.get(library.parentId)!.children.push(node);
    } else {
      // Root level library
      roots.push(node);
    }
  }

  // Sort children alphabetically at each level
  const sortChildren = (nodes: LibraryTreeNode[]) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name));
    for (const node of nodes) {
      sortChildren(node.children);
    }
  };
  sortChildren(roots);

  return roots;
}

/**
 * Flatten a library tree for virtualization (TB129)
 *
 * Returns only the visible items based on which nodes are expanded.
 * Each item includes its level (for indentation) and metadata needed for rendering.
 */
interface FlatLibraryItem {
  node: LibraryTreeNode;
  level: number;
  hasChildren: boolean;
  isExpanded: boolean;
}

function flattenLibraryTree(
  nodes: LibraryTreeNode[],
  expandedIds: Set<string>,
  level = 0
): FlatLibraryItem[] {
  const result: FlatLibraryItem[] = [];

  for (const node of nodes) {
    const hasChildren = node.children.length > 0;
    const isExpanded = expandedIds.has(node.id);

    result.push({
      node,
      level,
      hasChildren,
      isExpanded,
    });

    // Only include children if this node is expanded
    if (hasChildren && isExpanded) {
      result.push(...flattenLibraryTree(node.children, expandedIds, level + 1));
    }
  }

  return result;
}

interface DocumentType {
  id: string;
  type: 'document';
  title?: string;
  content?: string;
  contentType: string;
  version?: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  tags: string[];
  metadata?: {
    icon?: string; // Emoji or icon for the document (TB97)
    [key: string]: unknown;
  };
}

interface LibraryWithChildren extends LibraryType {
  _subLibraries?: LibraryType[];
  _documents?: DocumentType[];
}

// ============================================================================
// API Hooks
// ============================================================================

function useLibraries() {
  return useQuery<LibraryType[]>({
    queryKey: ['libraries'],
    queryFn: async () => {
      const response = await fetch('/api/libraries?hydrate.description=true');
      if (!response.ok) {
        throw new Error('Failed to fetch libraries');
      }
      return response.json();
    },
  });
}

function useLibrary(libraryId: string | null) {
  return useQuery<LibraryWithChildren>({
    queryKey: ['libraries', libraryId],
    queryFn: async () => {
      if (!libraryId) throw new Error('No library selected');
      const response = await fetch(`/api/libraries/${libraryId}?hydrate.description=true`);
      if (!response.ok) {
        throw new Error('Failed to fetch library');
      }
      return response.json();
    },
    enabled: !!libraryId,
  });
}

function useLibraryDocuments(libraryId: string | null) {
  return useQuery<DocumentType[]>({
    queryKey: ['libraries', libraryId, 'documents'],
    queryFn: async () => {
      if (!libraryId) throw new Error('No library selected');
      const response = await fetch(`/api/libraries/${libraryId}/documents`);
      if (!response.ok) {
        throw new Error('Failed to fetch documents');
      }
      return response.json();
    },
    enabled: !!libraryId,
  });
}

interface PaginatedResult<T> {
  items: T[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
}

const DEFAULT_PAGE_SIZE = 25;

// Reserved for future server-side pagination if needed
function _useDocuments(
  page: number = 1,
  pageSize: number = DEFAULT_PAGE_SIZE,
  searchQuery: string = ''
) {
  const offset = (page - 1) * pageSize;

  return useQuery<PaginatedResult<DocumentType>>({
    queryKey: ['documents', 'paginated', page, pageSize, searchQuery],
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: pageSize.toString(),
        offset: offset.toString(),
        orderBy: 'updated_at',
        orderDir: 'desc',
      });

      if (searchQuery.trim()) {
        params.set('search', searchQuery.trim());
      }

      const response = await fetch(`/api/documents?${params}`);
      if (!response.ok) {
        throw new Error('Failed to fetch documents');
      }
      return response.json();
    },
  });
}
void _useDocuments; // Suppress unused warning

function useDocument(documentId: string | null) {
  return useQuery<DocumentType>({
    queryKey: ['documents', documentId],
    queryFn: async () => {
      if (!documentId) throw new Error('No document selected');
      const response = await fetch(`/api/documents/${documentId}`);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to fetch document');
      }
      return response.json();
    },
    enabled: !!documentId,
  });
}

function useUpdateDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: Partial<Pick<DocumentType, 'title' | 'content' | 'contentType' | 'tags' | 'metadata'>>;
    }) => {
      const response = await fetch(`/api/documents/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to update document');
      }

      return response.json();
    },
    onSuccess: (_data, variables) => {
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      queryClient.invalidateQueries({ queryKey: ['documents', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['libraries'] });
    },
  });
}

function useDocumentVersions(documentId: string | null) {
  return useQuery<DocumentType[]>({
    queryKey: ['documents', documentId, 'versions'],
    queryFn: async () => {
      if (!documentId) throw new Error('No document selected');
      const response = await fetch(`/api/documents/${documentId}/versions`);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to fetch document versions');
      }
      return response.json();
    },
    enabled: !!documentId,
  });
}

function useDocumentVersion(documentId: string | null, version: number | null) {
  return useQuery<DocumentType>({
    queryKey: ['documents', documentId, 'versions', version],
    queryFn: async () => {
      if (!documentId || !version) throw new Error('No document or version selected');
      const response = await fetch(`/api/documents/${documentId}/versions/${version}`);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to fetch document version');
      }
      return response.json();
    },
    enabled: !!documentId && !!version,
  });
}

function useRestoreDocumentVersion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, version }: { id: string; version: number }) => {
      const response = await fetch(`/api/documents/${id}/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to restore document version');
      }

      return response.json();
    },
    onSuccess: (_data, variables) => {
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      queryClient.invalidateQueries({ queryKey: ['documents', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['documents', variables.id, 'versions'] });
      queryClient.invalidateQueries({ queryKey: ['libraries'] });
    },
  });
}

function useCloneDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      createdBy,
      title,
      libraryId,
    }: {
      id: string;
      createdBy: string;
      title?: string;
      libraryId?: string;
    }) => {
      const response = await fetch(`/api/documents/${id}/clone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ createdBy, title, libraryId }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to clone document');
      }

      return response.json();
    },
    onSuccess: () => {
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      queryClient.invalidateQueries({ queryKey: ['libraries'] });
    },
  });
}

// ============================================================================
// Document Links Hooks (TB53)
// ============================================================================

interface DocumentLinks {
  outgoing: DocumentType[];
  incoming: DocumentType[];
}

function useDocumentLinks(documentId: string | null) {
  return useQuery<DocumentLinks>({
    queryKey: ['documents', documentId, 'links'],
    queryFn: async () => {
      if (!documentId) throw new Error('No document selected');
      const response = await fetch(`/api/documents/${documentId}/links`);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to fetch document links');
      }
      return response.json();
    },
    enabled: !!documentId,
  });
}

function useAddDocumentLink() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ sourceId, targetDocumentId }: { sourceId: string; targetDocumentId: string }) => {
      const response = await fetch(`/api/documents/${sourceId}/links`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetDocumentId }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to link document');
      }

      return response.json();
    },
    onSuccess: (_data, { sourceId, targetDocumentId }) => {
      queryClient.invalidateQueries({ queryKey: ['documents', sourceId, 'links'] });
      queryClient.invalidateQueries({ queryKey: ['documents', targetDocumentId, 'links'] });
    },
  });
}

function useRemoveDocumentLink() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ sourceId, targetId }: { sourceId: string; targetId: string }) => {
      const response = await fetch(`/api/documents/${sourceId}/links/${targetId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to remove document link');
      }

      return response.json();
    },
    onSuccess: (_data, { sourceId, targetId }) => {
      queryClient.invalidateQueries({ queryKey: ['documents', sourceId, 'links'] });
      queryClient.invalidateQueries({ queryKey: ['documents', targetId, 'links'] });
    },
  });
}

// Hook to fetch all documents for the link picker (reuse from TB50 pattern)
function useAllDocuments() {
  return useQuery<DocumentType[]>({
    queryKey: ['documents', 'all'],
    queryFn: async () => {
      const response = await fetch('/api/documents?limit=100');
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to fetch documents');
      }
      const data = await response.json();
      // Handle paginated response format
      return data.items || data;
    },
  });
}

// ============================================================================
// Components
// ============================================================================

/**
 * Flat library item for virtualized rendering (TB129)
 * This is a non-recursive version that works with the flattened tree
 */
function FlatLibraryTreeItem({
  item,
  selectedLibraryId,
  onSelect,
  onToggleExpand,
}: {
  item: FlatLibraryItem;
  selectedLibraryId: string | null;
  onSelect: (id: string) => void;
  onToggleExpand: (id: string) => void;
}) {
  const { node, level, hasChildren, isExpanded } = item;
  const isSelected = selectedLibraryId === node.id;

  return (
    <div data-testid={`library-tree-item-${node.id}`}>
      <div
        className={`flex items-center gap-1 px-2 py-1.5 rounded-md cursor-pointer transition-colors ${
          isSelected
            ? 'bg-blue-50 text-blue-700'
            : 'text-gray-700 hover:bg-gray-100'
        }`}
        style={{ paddingLeft: `${8 + level * 16}px` }}
        onClick={() => onSelect(node.id)}
      >
        {/* Expand/Collapse Toggle */}
        <button
          data-testid={`library-toggle-${node.id}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggleExpand(node.id);
          }}
          className="p-0.5 hover:bg-gray-200 rounded"
          aria-label={hasChildren ? (isExpanded ? `Collapse ${node.name}` : `Expand ${node.name}`) : 'No children'}
          aria-expanded={hasChildren ? isExpanded : undefined}
        >
          {hasChildren ? (
            isExpanded ? (
              <ChevronDown className="w-4 h-4 text-gray-500" />
            ) : (
              <ChevronRight className="w-4 h-4 text-gray-500" />
            )
          ) : (
            <span className="w-4 h-4" aria-hidden="true" />
          )}
        </button>

        {/* Library Icon */}
        {isExpanded && hasChildren ? (
          <FolderOpen className="w-4 h-4 text-yellow-500 flex-shrink-0" />
        ) : (
          <Folder className="w-4 h-4 text-yellow-500 flex-shrink-0" />
        )}

        {/* Library Name */}
        <span
          data-testid={`library-name-${node.id}`}
          className="text-sm font-medium truncate"
        >
          {node.name}
        </span>
      </div>
    </div>
  );
}

/**
 * LibraryTree - Virtualized library tree sidebar (TB129)
 *
 * Uses VirtualizedList for efficient rendering of large library trees.
 * Flattens the tree structure based on expand/collapse state and
 * renders only visible items for optimal performance.
 */
function LibraryTree({
  libraries,
  selectedLibraryId,
  expandedIds,
  onSelectLibrary,
  onToggleExpand,
  onNewDocument,
  onNewLibrary,
  onSelectDocument,
  isMobile = false,
}: {
  libraries: LibraryType[];
  selectedLibraryId: string | null;
  expandedIds: Set<string>;
  onSelectLibrary: (id: string | null) => void;
  onToggleExpand: (id: string) => void;
  onNewDocument: () => void;
  onNewLibrary: () => void;
  onSelectDocument: (documentId: string) => void;
  isMobile?: boolean;
}) {
  // Build tree structure from flat list
  const treeNodes = useMemo(() => buildLibraryTree(libraries), [libraries]);

  // Flatten tree for virtualization based on expanded state (TB129)
  const flatItems = useMemo(
    () => flattenLibraryTree(treeNodes, expandedIds),
    [treeNodes, expandedIds]
  );

  // Item height for virtualization (36px = py-1.5 * 2 + content)
  const ITEM_HEIGHT = 36;

  // Render a single flat library item
  const renderLibraryItem = useCallback(
    (item: FlatLibraryItem, _index: number) => (
      <FlatLibraryTreeItem
        item={item}
        selectedLibraryId={selectedLibraryId}
        onSelect={onSelectLibrary}
        onToggleExpand={onToggleExpand}
      />
    ),
    [selectedLibraryId, onSelectLibrary, onToggleExpand]
  );

  return (
    <div
      data-testid="library-tree"
      className={`${isMobile ? 'w-full' : 'w-64 border-r border-gray-200'} bg-white dark:bg-[var(--color-bg)] flex flex-col h-full`}
    >
      <div className={`${isMobile ? 'p-3' : 'p-4'} border-b border-gray-200 dark:border-[var(--color-border)]`}>
        <div className="flex items-center justify-between mb-3">
          <h2 className={`${isMobile ? 'text-base' : 'text-lg'} font-semibold text-gray-900 dark:text-[var(--color-text)] flex items-center gap-2`}>
            <Library className={`${isMobile ? 'w-4 h-4' : 'w-5 h-5'} text-gray-500 dark:text-gray-400`} />
            Libraries
          </h2>
          {/* Hide action buttons on mobile - we have FABs instead */}
          {!isMobile && (
            <div className="flex items-center gap-1">
              <button
                onClick={onNewLibrary}
                className="p-1.5 text-gray-500 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/30 rounded-md transition-colors"
                title="New Library"
                data-testid="new-library-button-sidebar"
              >
                <FolderPlus className="w-4 h-4" />
              </button>
              <button
                onClick={onNewDocument}
                className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-md transition-colors"
                title="Create Document"
                data-testid="new-document-button-sidebar"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
        {/* Document Search Bar (TB95) */}
        <DocumentSearchBar onSelectDocument={onSelectDocument} />
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* All Documents option - always visible outside virtualized list */}
        <div className={`${isMobile ? 'p-2 pb-0' : 'p-2 pb-0'}`}>
          <button
            onClick={() => onSelectLibrary(null)}
            className={`w-full flex items-center gap-2 ${isMobile ? 'px-3 py-3' : 'px-3 py-2'} rounded-md text-left text-sm mb-2 ${
              selectedLibraryId === null
                ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium'
                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
            } ${isMobile ? 'touch-target' : ''}`}
            data-testid="all-documents-button"
          >
            <FileText className="w-4 h-4" />
            All Documents
          </button>
        </div>

        {libraries.length === 0 ? (
          <div
            data-testid="library-empty-state"
            className="text-center py-8 text-gray-500 dark:text-gray-400"
          >
            <Folder className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
            <p className="text-sm">No libraries yet</p>
            <button
              onClick={onNewLibrary}
              className="mt-2 text-sm text-purple-600 dark:text-purple-400 hover:underline"
              data-testid="new-library-button-empty"
            >
              Create one
            </button>
          </div>
        ) : (
          <div data-testid="library-list" className="flex-1 overflow-hidden px-2">
            <VirtualizedList
              items={flatItems}
              getItemKey={(item) => item.node.id}
              estimateSize={isMobile ? 44 : ITEM_HEIGHT}
              renderItem={renderLibraryItem}
              overscan={5}
              className="h-full"
              scrollRestoreId="library-tree-scroll"
              testId="virtualized-library-list"
              renderEmpty={() => (
                <div className="text-center py-4 text-gray-500 dark:text-gray-400 text-sm">
                  No libraries to display
                </div>
              )}
            />
          </div>
        )}
      </div>

      {/* Library count - hidden on mobile */}
      {!isMobile && (
        <div
          data-testid="library-count"
          className="p-3 border-t border-gray-200 dark:border-[var(--color-border)] text-xs text-gray-500 dark:text-gray-400"
        >
          {libraries.length} {libraries.length === 1 ? 'library' : 'libraries'}
        </div>
      )}
    </div>
  );
}

function DocumentListItem({
  document,
  isSelected,
  onClick,
}: {
  document: DocumentType;
  isSelected?: boolean;
  onClick?: (id: string) => void;
}) {
  const formattedDate = new Date(document.updatedAt).toLocaleDateString();
  const title = document.title || `Document ${document.id}`;
  const documentIcon = document.metadata?.icon;

  return (
    <div
      data-testid={`document-item-${document.id}`}
      onClick={() => onClick?.(document.id)}
      className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
        isSelected
          ? 'border-blue-300 bg-blue-50'
          : 'border-gray-100 hover:border-gray-200 hover:bg-gray-50'
      }`}
    >
      {/* Document Icon: Show emoji from metadata, or fall back to FileText icon */}
      {documentIcon ? (
        <span
          className="w-8 h-8 flex items-center justify-center text-2xl flex-shrink-0"
          data-testid={`document-icon-${document.id}`}
        >
          {documentIcon}
        </span>
      ) : (
        <FileText className={`w-8 h-8 flex-shrink-0 ${isSelected ? 'text-blue-500' : 'text-blue-400'}`} />
      )}
      <div className="flex-1 min-w-0">
        <p
          data-testid={`document-title-${document.id}`}
          className={`font-medium truncate ${isSelected ? 'text-blue-900' : 'text-gray-900'}`}
        >
          {title}
        </p>
        <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
          <span data-testid={`document-type-${document.id}`}>
            {document.contentType}
          </span>
          <span>·</span>
          <span data-testid={`document-date-${document.id}`}>
            {formattedDate}
          </span>
        </div>
      </div>
    </div>
  );
}

// TB130: Document list item height for virtualization (p-3 padding + content)
const DOCUMENT_ITEM_HEIGHT = 64;

function LibraryView({
  libraryId,
  selectedDocumentId,
  onSelectDocument,
  onSelectLibrary,
  onNewDocument,
  isMobile = false,
}: {
  libraryId: string;
  selectedDocumentId: string | null;
  onSelectDocument: (id: string) => void;
  onSelectLibrary: (id: string) => void;
  onNewDocument: () => void;
  isMobile?: boolean;
}) {
  const { data: library, isLoading: libraryLoading } = useLibrary(libraryId);
  const { data: documents = [], isLoading: docsLoading, error } = useLibraryDocuments(libraryId);

  const isLoading = libraryLoading || docsLoading;

  // Include both documents from API and embedded _documents
  const allDocuments = useMemo(() => [
    ...documents,
    ...(library?._documents || []),
  ].filter((doc, index, self) =>
    index === self.findIndex((d) => d.id === doc.id)
  ), [documents, library?._documents]);

  // TB130: Render function for virtualized document list item
  const renderDocumentItem = useCallback((doc: DocumentType) => (
    <div className="px-4">
      <DocumentListItem
        document={doc}
        isSelected={selectedDocumentId === doc.id}
        onClick={onSelectDocument}
      />
    </div>
  ), [selectedDocumentId, onSelectDocument]);

  return (
    <div
      data-testid="library-view"
      className="h-full flex flex-col bg-white dark:bg-[var(--color-bg)]"
    >
      {/* Library Header */}
      <div
        data-testid="library-header"
        className={`flex-shrink-0 ${isMobile ? 'p-3' : 'p-4'} border-b border-gray-200 dark:border-[var(--color-border)]`}
      >
        <div className="flex items-center justify-between">
          <div className={`flex items-center ${isMobile ? 'gap-2' : 'gap-3'} min-w-0`}>
            <FolderOpen className={`${isMobile ? 'w-5 h-5' : 'w-6 h-6'} text-yellow-500 flex-shrink-0`} />
            {library ? (
              <>
                <h3
                  data-testid="library-name"
                  className={`font-semibold text-gray-900 dark:text-[var(--color-text)] ${isMobile ? 'text-base' : 'text-lg'} truncate`}
                >
                  {library.name}
                </h3>
                <span
                  data-testid="library-doc-count"
                  className={`text-gray-400 dark:text-gray-500 flex-shrink-0 ${isMobile ? 'text-xs' : 'text-sm'}`}
                >
                  {allDocuments.length} {allDocuments.length === 1 ? 'doc' : 'docs'}
                </span>
              </>
            ) : (
              <div className="animate-pulse h-6 w-32 bg-gray-200 dark:bg-gray-700 rounded" />
            )}
          </div>
          {/* Hide button on mobile - use FAB instead */}
          {!isMobile && (
            <button
              onClick={onNewDocument}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors"
              data-testid="new-document-button-library"
            >
              <Plus className="w-4 h-4" />
              Create Document
              <kbd className="ml-1 text-xs bg-blue-800/50 text-white px-1 py-0.5 rounded">C D</kbd>
            </button>
          )}
        </div>

        {/* Library description */}
        {library?.description && (
          <p
            data-testid="library-description"
            className={`mt-2 text-sm text-gray-600 dark:text-gray-400 ${isMobile ? 'line-clamp-2' : ''}`}
          >
            {library.description}
          </p>
        )}
      </div>

      {/* Sub-libraries section */}
      {library?._subLibraries && library._subLibraries.length > 0 && (
        <div data-testid="sub-libraries" className={`flex-shrink-0 ${isMobile ? 'p-3' : 'p-4'} border-b border-gray-100 dark:border-gray-800`}>
          <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
            Sub-libraries
          </h4>
          <div className="flex flex-wrap gap-2">
            {library._subLibraries.map((subLib) => (
              <button
                key={subLib.id}
                data-testid={`sub-library-${subLib.id}`}
                onClick={() => onSelectLibrary(subLib.id)}
                className={`flex items-center gap-1.5 ${isMobile ? 'px-2.5 py-2' : 'px-3 py-1.5'} bg-yellow-50 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 rounded-md text-sm hover:bg-yellow-100 dark:hover:bg-yellow-900/50 transition-colors cursor-pointer ${isMobile ? 'touch-target' : ''}`}
              >
                <Folder className="w-4 h-4" />
                {subLib.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* TB130: Virtualized Documents Area */}
      <div
        data-testid="documents-container"
        className="flex-1 min-h-0"
      >
        {isLoading ? (
          <div
            data-testid="documents-loading"
            className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400"
          >
            Loading documents...
          </div>
        ) : error ? (
          <div
            data-testid="documents-error"
            className="flex items-center justify-center h-full text-red-500 dark:text-red-400"
          >
            Failed to load documents
          </div>
        ) : allDocuments.length === 0 ? (
          <div
            data-testid="documents-empty"
            className="flex flex-col items-center justify-center h-full text-gray-500 dark:text-gray-400 px-4"
          >
            <FileText className="w-12 h-12 mb-3 text-gray-300 dark:text-gray-600" />
            <p className="text-sm">No documents in this library</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              Add documents to organize your knowledge
            </p>
          </div>
        ) : (
          <VirtualizedList
            items={allDocuments}
            getItemKey={(doc) => doc.id}
            estimateSize={isMobile ? 72 : DOCUMENT_ITEM_HEIGHT}
            renderItem={renderDocumentItem}
            overscan={5}
            className="h-full pt-2"
            scrollRestoreId={`library-documents-${libraryId}`}
            testId="virtualized-documents-list"
            gap={isMobile ? 4 : 8}
          />
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Document Detail Components (TB21)
// ============================================================================

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(dateString);
}

const CONTENT_TYPE_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  text: { label: 'Plain Text', icon: <FileType className="w-4 h-4" />, color: 'bg-gray-100 text-gray-700' },
  markdown: { label: 'Markdown', icon: <Hash className="w-4 h-4" />, color: 'bg-purple-100 text-purple-700' },
  json: { label: 'JSON', icon: <Code className="w-4 h-4" />, color: 'bg-blue-100 text-blue-700' },
};

/**
 * Version History Sidebar - Shows all versions of a document with restore capability
 */
function VersionHistorySidebar({
  documentId,
  currentVersion,
  onPreviewVersion,
  previewingVersion,
  onClose,
}: {
  documentId: string;
  currentVersion: number;
  onPreviewVersion: (version: number | null) => void;
  previewingVersion: number | null;
  onClose: () => void;
}) {
  const { data: versions = [], isLoading, error } = useDocumentVersions(documentId);
  const restoreVersion = useRestoreDocumentVersion();

  const handleRestore = async (version: number) => {
    if (confirm(`Restore to version ${version}? This will create a new version with the restored content.`)) {
      try {
        await restoreVersion.mutateAsync({ id: documentId, version });
        onPreviewVersion(null); // Clear preview after restore
      } catch {
        // Error is handled by mutation
      }
    }
  };

  return (
    <div
      data-testid="version-history-sidebar"
      className="w-72 border-l border-gray-200 bg-gray-50 flex flex-col h-full"
    >
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-gray-500" />
          <h3 className="font-medium text-gray-900 text-sm">Version History</h3>
        </div>
        <button
          onClick={onClose}
          className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
          aria-label="Close version history"
          data-testid="version-history-close"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Version List */}
      <div className="flex-1 overflow-y-auto p-2">
        {isLoading && (
          <div data-testid="version-history-loading" className="text-center text-gray-500 text-sm py-4">
            Loading versions...
          </div>
        )}

        {error && (
          <div data-testid="version-history-error" className="text-center text-red-500 text-sm py-4">
            Failed to load versions
          </div>
        )}

        {!isLoading && !error && versions.length === 0 && (
          <div data-testid="version-history-empty" className="text-center text-gray-500 text-sm py-4">
            No version history available
          </div>
        )}

        {!isLoading && !error && versions.length > 0 && (
          <div data-testid="version-history-list" className="space-y-1">
            {versions.map((version) => {
              const isCurrentVersion = version.version === currentVersion;
              const isPreviewing = previewingVersion === version.version;

              return (
                <div
                  key={version.version}
                  data-testid={`version-item-${version.version}`}
                  className={`p-2 rounded-md ${
                    isPreviewing
                      ? 'bg-blue-100 border border-blue-300'
                      : isCurrentVersion
                        ? 'bg-green-50 border border-green-200'
                        : 'bg-white border border-gray-100 hover:border-gray-200'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm text-gray-900">
                        v{version.version}
                      </span>
                      {isCurrentVersion && (
                        <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">
                          Current
                        </span>
                      )}
                      {isPreviewing && (
                        <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">
                          Previewing
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="text-xs text-gray-500 mb-2">
                    {formatRelativeTime(version.updatedAt)}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1">
                    {!isCurrentVersion && (
                      <>
                        <button
                          onClick={() => onPreviewVersion(isPreviewing ? null : version.version!)}
                          data-testid={`version-preview-${version.version}`}
                          className={`flex items-center gap-1 px-2 py-1 text-xs rounded ${
                            isPreviewing
                              ? 'bg-blue-600 text-white'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          <Eye className="w-3 h-3" />
                          {isPreviewing ? 'Exit Preview' : 'Preview'}
                        </button>
                        <button
                          onClick={() => handleRestore(version.version!)}
                          disabled={restoreVersion.isPending}
                          data-testid={`version-restore-${version.version}`}
                          className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-orange-100 text-orange-700 hover:bg-orange-200 disabled:opacity-50"
                        >
                          <RotateCcw className="w-3 h-3" />
                          Restore
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Restore Error */}
      {restoreVersion.isError && (
        <div className="p-2 m-2 bg-red-50 text-red-700 text-xs rounded">
          {restoreVersion.error?.message || 'Failed to restore version'}
        </div>
      )}
    </div>
  );
}

/**
 * Renders document content based on its contentType.
 *
 * Architecture (Markdown-First):
 * - Content is stored as Markdown (source of truth)
 * - For rendering, Markdown is converted to HTML
 * - Legacy HTML content is also supported for backwards compatibility
 */
function DocumentRenderer({
  content,
  contentType,
}: {
  content: string;
  contentType: string;
}) {
  if (!content) {
    return (
      <div data-testid="document-content-empty" className="text-gray-400 italic">
        No content
      </div>
    );
  }

  switch (contentType) {
    case 'json':
      // Pretty-print JSON with syntax highlighting colors
      try {
        const formatted = JSON.stringify(JSON.parse(content), null, 2);
        return (
          <pre
            data-testid="document-content-json"
            className="whitespace-pre-wrap font-mono text-sm bg-gray-900 text-gray-100 rounded-lg p-4 overflow-x-auto"
          >
            <code>{formatted}</code>
          </pre>
        );
      } catch {
        // If JSON parsing fails, show as plain text
        return (
          <pre
            data-testid="document-content-json"
            className="whitespace-pre-wrap font-mono text-sm bg-gray-900 text-gray-100 rounded-lg p-4 overflow-x-auto"
          >
            <code>{content}</code>
          </pre>
        );
      }

    case 'markdown':
    case 'text':
    default: {
      // Check if content is already HTML (legacy content from old BlockEditor)
      // If so, render it directly for backwards compatibility
      if (isHtmlContent(content)) {
        return (
          <div
            data-testid="document-content-html"
            className="prose prose-sm max-w-none text-gray-700
                       prose-headings:mt-4 prose-headings:mb-2 prose-headings:font-semibold
                       prose-h1:text-2xl prose-h2:text-xl prose-h3:text-lg
                       prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5
                       prose-blockquote:border-l-4 prose-blockquote:border-gray-300 prose-blockquote:pl-4 prose-blockquote:italic
                       prose-pre:bg-gray-900 prose-pre:text-gray-100 prose-pre:rounded-lg prose-pre:p-4
                       prose-code:bg-gray-100 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-sm
                       [&_mark]:bg-yellow-200 [&_mark]:px-0.5"
            dangerouslySetInnerHTML={{ __html: content }}
          />
        );
      }

      // Content is Markdown - convert to HTML for rendering
      const html = markdownToHtml(content);
      return (
        <div
          data-testid="document-content-markdown"
          className="prose prose-sm max-w-none text-gray-700
                     prose-headings:mt-4 prose-headings:mb-2 prose-headings:font-semibold
                     prose-h1:text-2xl prose-h2:text-xl prose-h3:text-lg
                     prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5
                     prose-blockquote:border-l-4 prose-blockquote:border-gray-300 prose-blockquote:pl-4 prose-blockquote:italic
                     prose-pre:bg-gray-900 prose-pre:text-gray-100 prose-pre:rounded-lg prose-pre:p-4
                     prose-code:bg-gray-100 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-sm
                     [&_mark]:bg-yellow-200 [&_mark]:px-0.5"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      );
    }
  }
}

// ============================================================================
// Document Links Components (TB53)
// ============================================================================

/**
 * Modal for selecting a document to link
 */
function DocumentLinkPickerModal({
  isOpen,
  onClose,
  onSelectDocument,
  currentDocumentId,
  existingLinkIds,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSelectDocument: (documentId: string) => void;
  currentDocumentId: string;
  existingLinkIds: string[];
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const { data: documents = [], isLoading } = useAllDocuments();

  // Filter documents: exclude current document, existing links, and apply search
  const filteredDocuments = documents.filter((doc) => {
    // Exclude current document
    if (doc.id === currentDocumentId) return false;
    // Exclude already linked documents
    if (existingLinkIds.includes(doc.id)) return false;
    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      return (
        (doc.title?.toLowerCase().includes(query)) ||
        doc.id.toLowerCase().includes(query)
      );
    }
    return true;
  });

  // Handle escape key
  React.useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      data-testid="document-link-picker-modal"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal content */}
      <div className="relative bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Link2 className="w-5 h-5 text-blue-500" />
            Link Document
          </h3>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
            aria-label="Close"
            data-testid="document-link-picker-close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search */}
        <div className="p-4 border-b border-gray-100">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search documents by title or ID..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              autoFocus
              data-testid="document-link-search"
            />
          </div>
        </div>

        {/* Document list */}
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="text-center py-8 text-gray-500">Loading documents...</div>
          ) : filteredDocuments.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              {searchQuery.trim() ? 'No matching documents found' : 'No documents available to link'}
            </div>
          ) : (
            <div className="space-y-2" data-testid="document-link-list">
              {filteredDocuments.map((doc) => (
                <button
                  key={doc.id}
                  onClick={() => onSelectDocument(doc.id)}
                  className="w-full flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50 text-left transition-colors"
                  data-testid={`document-link-option-${doc.id}`}
                >
                  <FileText className="w-5 h-5 text-blue-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 truncate">
                      {doc.title || `Document ${doc.id}`}
                    </div>
                    <div className="text-xs text-gray-500 flex items-center gap-2">
                      <span className="font-mono">{doc.id}</span>
                      <span>·</span>
                      <span>{doc.contentType}</span>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-gray-400" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Linked document card - displays a linked document with remove option
 */
function LinkedDocumentCard({
  document,
  direction,
  onRemove,
  onNavigate,
  isRemoving,
}: {
  document: DocumentType;
  direction: 'outgoing' | 'incoming';
  onRemove: () => void;
  onNavigate: () => void;
  isRemoving: boolean;
}) {
  return (
    <div
      className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors group"
      data-testid={`linked-document-${document.id}`}
    >
      {/* Direction indicator */}
      <div
        className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${
          direction === 'outgoing' ? 'bg-blue-100' : 'bg-green-100'
        }`}
        title={direction === 'outgoing' ? 'Links to' : 'Linked from'}
      >
        {direction === 'outgoing' ? (
          <ArrowRight className="w-3 h-3 text-blue-600" />
        ) : (
          <ArrowLeft className="w-3 h-3 text-green-600" />
        )}
      </div>

      {/* Document info */}
      <div className="flex-1 min-w-0">
        <button
          onClick={onNavigate}
          className="font-medium text-gray-900 hover:text-blue-600 truncate block text-left w-full"
          data-testid={`linked-document-title-${document.id}`}
        >
          {document.title || `Document ${document.id}`}
        </button>
        <div className="text-xs text-gray-500 flex items-center gap-2">
          <span className="font-mono">{document.id}</span>
          <span>·</span>
          <span>{document.contentType}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={onNavigate}
          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
          title="Open document"
          data-testid={`linked-document-open-${document.id}`}
        >
          <ExternalLink className="w-4 h-4" />
        </button>
        {direction === 'outgoing' && (
          <button
            onClick={onRemove}
            disabled={isRemoving}
            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded disabled:opacity-50"
            title="Remove link"
            data-testid={`linked-document-remove-${document.id}`}
          >
            <Unlink className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * LinkedDocumentsSection - Shows outgoing and incoming document links
 */
function LinkedDocumentsSection({
  documentId,
  onNavigateToDocument,
}: {
  documentId: string;
  onNavigateToDocument: (id: string) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [showPicker, setShowPicker] = useState(false);

  const { data: links, isLoading, isError } = useDocumentLinks(documentId);
  const addLink = useAddDocumentLink();
  const removeLink = useRemoveDocumentLink();

  const outgoing = links?.outgoing || [];
  const incoming = links?.incoming || [];
  const totalLinks = outgoing.length + incoming.length;

  const handleAddLink = (targetDocumentId: string) => {
    addLink.mutate({ sourceId: documentId, targetDocumentId });
    setShowPicker(false);
  };

  const handleRemoveLink = (targetId: string) => {
    removeLink.mutate({ sourceId: documentId, targetId });
  };

  // Get existing outgoing link IDs for the picker
  const existingOutgoingIds = outgoing.map((doc) => doc.id);

  return (
    <div className="mb-6" data-testid="linked-documents-section">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 text-xs font-medium text-gray-500 uppercase tracking-wide mb-2 hover:text-gray-700 w-full"
        data-testid="linked-documents-toggle"
      >
        {isExpanded ? (
          <ChevronDown className="w-3 h-3" />
        ) : (
          <ChevronRight className="w-3 h-3" />
        )}
        <Link2 className="w-3 h-3" />
        <span>Linked Documents</span>
        {totalLinks > 0 && (
          <span className="text-gray-400 font-normal">({totalLinks})</span>
        )}
      </button>

      {isExpanded && (
        <div className="space-y-4">
          {isLoading && (
            <div className="text-sm text-gray-500">Loading links...</div>
          )}

          {isError && (
            <div className="text-sm text-red-500">Failed to load links</div>
          )}

          {!isLoading && !isError && (
            <>
              {/* Outgoing links section */}
              {outgoing.length > 0 && (
                <div data-testid="outgoing-links-section">
                  <div className="text-xs text-gray-500 mb-2 flex items-center gap-1">
                    <ArrowRight className="w-3 h-3" />
                    Links to ({outgoing.length})
                  </div>
                  <div className="space-y-2">
                    {outgoing.map((doc) => (
                      <LinkedDocumentCard
                        key={doc.id}
                        document={doc}
                        direction="outgoing"
                        onRemove={() => handleRemoveLink(doc.id)}
                        onNavigate={() => onNavigateToDocument(doc.id)}
                        isRemoving={removeLink.isPending}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Incoming links section */}
              {incoming.length > 0 && (
                <div data-testid="incoming-links-section">
                  <div className="text-xs text-gray-500 mb-2 flex items-center gap-1">
                    <ArrowLeft className="w-3 h-3" />
                    Linked from ({incoming.length})
                  </div>
                  <div className="space-y-2">
                    {incoming.map((doc) => (
                      <LinkedDocumentCard
                        key={doc.id}
                        document={doc}
                        direction="incoming"
                        onRemove={() => {}} // Incoming links can't be removed from here
                        onNavigate={() => onNavigateToDocument(doc.id)}
                        isRemoving={false}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Empty state */}
              {totalLinks === 0 && (
                <div className="text-sm text-gray-400 italic" data-testid="no-links-message">
                  No linked documents
                </div>
              )}

              {/* Add link button */}
              <button
                onClick={() => setShowPicker(true)}
                disabled={addLink.isPending}
                className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 font-medium disabled:opacity-50"
                data-testid="add-document-link-button"
              >
                <Plus className="w-4 h-4" />
                Link Document
              </button>

              {/* Error message */}
              {addLink.isError && (
                <div className="text-sm text-red-500 mt-2">
                  {addLink.error?.message || 'Failed to add link'}
                </div>
              )}
              {removeLink.isError && (
                <div className="text-sm text-red-500 mt-2">
                  {removeLink.error?.message || 'Failed to remove link'}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Document link picker modal */}
      <DocumentLinkPickerModal
        isOpen={showPicker}
        onClose={() => setShowPicker(false)}
        onSelectDocument={handleAddLink}
        currentDocumentId={documentId}
        existingLinkIds={existingOutgoingIds}
      />
    </div>
  );
}

/**
 * Document Detail Panel - Shows full document content and metadata with edit support
 */
function DocumentDetailPanel({
  documentId,
  onClose,
  isExpanded = false,
  onToggleExpand,
  isFullscreen = false,
  onEnterFullscreen,
  onExitFullscreen,
  onDocumentCloned,
  libraryId,
  onNavigateToDocument,
  isMobile = false,
}: {
  documentId: string;
  onClose: () => void;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  isFullscreen?: boolean;
  onEnterFullscreen?: () => void;
  onExitFullscreen?: () => void;
  onDocumentCloned?: (document: { id: string }) => void;
  libraryId?: string | null;
  onNavigateToDocument?: (id: string) => void;
  isMobile?: boolean;
}) {
  const { data: document, isLoading, isError, error } = useDocument(documentId);
  const updateDocument = useUpdateDocument();
  const cloneDocument = useCloneDocument();
  const createComment = useCreateComment();
  const { data: entitiesData } = useAllEntities();
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState('');
  const [editedTitle, setEditedTitle] = useState('');
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [previewingVersion, setPreviewingVersion] = useState<number | null>(null);

  // Comments state (TB98)
  const [showCommentsPanel, setShowCommentsPanel] = useState(false);
  const [commentModalOpen, setCommentModalOpen] = useState(false);
  const [pendingComment, setPendingComment] = useState<{
    selectedText: string;
    from: number;
    to: number;
  } | null>(null);
  const { data: commentsData } = useDocumentComments(documentId);
  const commentCount = commentsData?.comments.filter((c: Comment) => !c.resolved).length || 0;

  // Document icon/emoji state (TB97)
  const [showIconPicker, setShowIconPicker] = useState(false);

  // Convert entities to mention format for @mention autocomplete (TB111)
  const mentionEntities: MentionEntity[] = useMemo(() => {
    if (!entitiesData) return [];
    return entitiesData.map((e) => ({
      id: e.id,
      name: e.name,
      entityType: e.entityType,
    }));
  }, [entitiesData]);

  // Fetch the previewing version content
  const { data: previewDocument } = useDocumentVersion(
    previewingVersion ? documentId : null,
    previewingVersion
  );

  // Initialize edit state when entering edit mode
  const handleStartEdit = () => {
    if (document) {
      setEditedContent(document.content || '');
      setEditedTitle(document.title || '');
      setIsEditing(true);
    }
  };

  // Cancel editing
  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditedContent('');
    setEditedTitle('');
  };

  // Save changes
  const handleSave = async () => {
    if (!document) return;

    const updates: Partial<Pick<DocumentType, 'title' | 'content'>> = {};

    if (editedTitle !== (document.title || '')) {
      updates.title = editedTitle;
    }
    if (editedContent !== (document.content || '')) {
      updates.content = editedContent;
    }

    // Only update if there are changes
    if (Object.keys(updates).length > 0) {
      try {
        await updateDocument.mutateAsync({ id: documentId, updates });
        setIsEditing(false);
      } catch {
        // Error handling is done by the mutation
      }
    } else {
      setIsEditing(false);
    }
  };

  // Handle comment from bubble menu (TB98)
  const handleComment = (selectedText: string, from: number, to: number) => {
    setPendingComment({ selectedText, from, to });
    setCommentModalOpen(true);
  };

  // Submit comment (TB98)
  const handleSubmitComment = async (content: string) => {
    if (!document || !pendingComment) return;

    // Get plain text version of document for anchoring
    const plainText = getPlainTextForAnchoring(document.content || '', document.contentType);
    const anchor = createTextAnchor(
      plainText,
      pendingComment.from,
      pendingComment.to
    );

    try {
      await createComment.mutateAsync({
        documentId: document.id,
        input: {
          authorId: 'el-0000', // TODO: Use actual current user ID
          content,
          anchor,
          startOffset: pendingComment.from,
          endOffset: pendingComment.to,
        },
      });
      setCommentModalOpen(false);
      setPendingComment(null);
      setShowCommentsPanel(true); // Show comments panel after adding
    } catch {
      // Error handling done by mutation
    }
  };

  // Handle clicking a comment to scroll to its position
  const handleCommentClick = (comment: Comment) => {
    // Find anchor position in current document
    const plainText = getPlainTextForAnchoring(document?.content || '', document?.contentType || 'text');
    const match = findAnchorPosition(comment.anchor, plainText);
    if (match) {
      // TODO: Scroll to position in editor - this would require editor ref
      console.log('Comment position:', match.startOffset, match.endOffset);
    }
  };

  // Clone document
  const handleClone = async () => {
    if (!document) return;

    try {
      const clonedDoc = await cloneDocument.mutateAsync({
        id: documentId,
        createdBy: document.createdBy,
        // Include libraryId so the clone is added to the same library
        libraryId: libraryId || undefined,
      });
      // Navigate to the cloned document
      if (clonedDoc?.id && onDocumentCloned) {
        onDocumentCloned({ id: clonedDoc.id });
      }
    } catch {
      // Error handling is done by the mutation
    }
  };

  // Set document icon/emoji (TB97)
  const handleSetIcon = async (emoji: string) => {
    if (!document) return;

    try {
      await updateDocument.mutateAsync({
        id: documentId,
        updates: {
          metadata: {
            ...document.metadata,
            icon: emoji,
          },
        },
      });
      setShowIconPicker(false);
    } catch {
      // Error handling is done by the mutation
    }
  };

  // Remove document icon (TB97)
  const handleRemoveIcon = async () => {
    if (!document) return;

    try {
      const newMetadata = { ...document.metadata };
      delete newMetadata.icon;
      await updateDocument.mutateAsync({
        id: documentId,
        updates: {
          metadata: newMetadata,
        },
      });
    } catch {
      // Error handling is done by the mutation
    }
  };

  if (isLoading) {
    return (
      <div
        data-testid="document-detail-loading"
        className="h-full flex items-center justify-center bg-white dark:bg-[var(--color-bg)]"
      >
        <div className="text-gray-500 dark:text-gray-400">Loading document...</div>
      </div>
    );
  }

  if (isError) {
    return (
      <div
        data-testid="document-detail-error"
        className="h-full flex flex-col items-center justify-center bg-white dark:bg-[var(--color-bg)] px-4"
      >
        <div className="text-red-600 dark:text-red-400 mb-2">Failed to load document</div>
        <div className="text-sm text-gray-500 dark:text-gray-400">{(error as Error)?.message}</div>
      </div>
    );
  }

  if (!document) {
    return (
      <div
        data-testid="document-detail-not-found"
        className="h-full flex items-center justify-center bg-white dark:bg-[var(--color-bg)]"
      >
        <div className="text-gray-500 dark:text-gray-400">Document not found</div>
      </div>
    );
  }

  const title = document.title || `Document ${document.id}`;
  const typeConfig = CONTENT_TYPE_CONFIG[document.contentType] || CONTENT_TYPE_CONFIG.text;

  return (
    <div
      data-testid="document-detail-panel"
      className={`h-full flex flex-col bg-white dark:bg-[var(--color-bg)] ${isMobile ? '' : 'border-l border-gray-200 dark:border-[var(--color-border)]'}`}
    >
      {/* Header */}
      <div className={`flex items-start justify-between ${isMobile ? 'p-3' : 'p-4'} border-b border-gray-200 dark:border-[var(--color-border)]`}>
        <div className="flex-1 min-w-0">
          {/* Content type badge */}
          <div className="flex items-center gap-2 mb-2">
            <span
              data-testid="document-detail-type"
              className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded ${typeConfig.color}`}
            >
              {typeConfig.icon}
              {typeConfig.label}
            </span>
            {document.version !== undefined && (
              <span
                data-testid="document-detail-version"
                className="text-xs text-gray-500"
              >
                v{document.version}
              </span>
            )}
          </div>

          {/* Title with Document Icon (TB97) */}
          <div className="flex items-center gap-2">
            {/* Document Icon/Emoji - clickable to open picker */}
            <button
              onClick={() => setShowIconPicker(true)}
              className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors group"
              title={document.metadata?.icon ? 'Change icon' : 'Add icon'}
              data-testid="document-icon-button"
            >
              {document.metadata?.icon ? (
                <span className="text-2xl" data-testid="document-detail-icon">
                  {document.metadata.icon}
                </span>
              ) : (
                <Smile className="w-5 h-5 text-gray-400 group-hover:text-gray-600" />
              )}
            </button>

            {/* Title */}
            {isEditing ? (
              <input
                type="text"
                value={editedTitle}
                onChange={(e) => setEditedTitle(e.target.value)}
                data-testid="document-title-input"
                className="text-lg font-semibold text-gray-900 flex-1 border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Document title"
              />
            ) : (
              <h2
                data-testid="document-detail-title"
                className="text-lg font-semibold text-gray-900 truncate"
              >
                {title}
              </h2>
            )}

            {/* Remove icon button - only shown when icon exists */}
            {document.metadata?.icon && (
              <button
                onClick={handleRemoveIcon}
                className="p-1 text-gray-400 hover:text-red-500 rounded transition-colors"
                title="Remove icon"
                data-testid="document-remove-icon-button"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* ID */}
          <div className="flex items-center gap-2 mt-1 text-xs text-gray-500 font-mono">
            <span data-testid="document-detail-id">{document.id}</span>
          </div>

          {/* Metadata - Created, Created By, Updated */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-gray-500">
            <div className="flex items-center gap-1" title={formatDate(previewingVersion !== null && previewDocument ? previewDocument.createdAt : document.createdAt)}>
              <Clock className="w-3 h-3" />
              <span>Created {formatRelativeTime(previewingVersion !== null && previewDocument ? previewDocument.createdAt : document.createdAt)}</span>
            </div>
            <div className="flex items-center gap-1" title={formatDate(previewingVersion !== null && previewDocument ? previewDocument.updatedAt : document.updatedAt)}>
              <Clock className="w-3 h-3" />
              <span>Updated {formatRelativeTime(previewingVersion !== null && previewDocument ? previewDocument.updatedAt : document.updatedAt)}</span>
            </div>
            <div className="flex items-center gap-1">
              <User className="w-3 h-3" />
              <span className="font-mono">{document.createdBy}</span>
            </div>
          </div>
        </div>

        {/* Action buttons - simplified on mobile */}
        <div className={`flex items-center ${isMobile ? 'gap-0.5' : 'gap-1'} ml-2`}>
          {isEditing ? (
            <>
              <button
                onClick={handleSave}
                disabled={updateDocument.isPending}
                data-testid="document-save-button"
                className={`${isMobile ? 'p-2 touch-target' : 'p-1.5'} text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-900/30 rounded disabled:opacity-50`}
                aria-label="Save changes"
                title="Save (Cmd+S)"
              >
                <Save className="w-5 h-5" />
              </button>
              <button
                onClick={handleCancelEdit}
                disabled={updateDocument.isPending}
                data-testid="document-cancel-button"
                className={`${isMobile ? 'p-2 touch-target' : 'p-1.5'} text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/30 rounded disabled:opacity-50`}
                aria-label="Cancel editing"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleStartEdit}
                disabled={previewingVersion !== null}
                data-testid="document-edit-button"
                className={`${isMobile ? 'p-2 touch-target' : 'p-1.5'} text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded disabled:opacity-50 disabled:cursor-not-allowed`}
                aria-label="Edit document"
                title={previewingVersion !== null ? 'Exit preview to edit' : 'Edit document'}
              >
                <Edit3 className="w-5 h-5" />
              </button>
              {/* Hide clone and history buttons on mobile for cleaner UI */}
              {!isMobile && (
                <>
                  <button
                    onClick={handleClone}
                    disabled={cloneDocument.isPending || previewingVersion !== null}
                    data-testid="document-clone-button"
                    className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                    aria-label="Clone document"
                    title={previewingVersion !== null ? 'Exit preview to clone' : 'Clone document'}
                  >
                    <Copy className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => setShowVersionHistory(!showVersionHistory)}
                    data-testid="document-history-button"
                    className={`p-1.5 rounded ${
                      showVersionHistory
                        ? 'text-blue-600 bg-blue-50 dark:bg-blue-900/30'
                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                    }`}
                    aria-label={showVersionHistory ? 'Hide version history' : 'Show version history'}
                    title="Version history"
                  >
                    <History className="w-5 h-5" />
                  </button>
                </>
              )}
              {/* Comments button (TB98) - show on mobile too */}
              <button
                onClick={() => setShowCommentsPanel(!showCommentsPanel)}
                data-testid="document-comments-button"
                className={`${isMobile ? 'p-2 touch-target' : 'p-1.5'} rounded relative ${
                  showCommentsPanel
                    ? 'text-blue-600 bg-blue-50 dark:bg-blue-900/30'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
                aria-label={showCommentsPanel ? 'Hide comments' : 'Show comments'}
                title="Comments"
              >
                <MessageSquare className="w-5 h-5" />
                {commentCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-blue-600 text-white text-xs rounded-full flex items-center justify-center">
                    {commentCount > 9 ? '9+' : commentCount}
                  </span>
                )}
              </button>
            </>
          )}
          {/* Expand button - hide on mobile */}
          {!isMobile && onToggleExpand && !isFullscreen && (
            <button
              onClick={onToggleExpand}
              data-testid="document-expand-button"
              className={`p-1.5 rounded ${
                isExpanded
                  ? 'text-blue-600 bg-blue-50 dark:bg-blue-900/30'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
              aria-label={isExpanded ? 'Collapse document' : 'Expand document'}
              title={isExpanded ? 'Show document list' : 'Hide document list'}
            >
              {isExpanded ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
            </button>
          )}
          {/* Fullscreen/Focus mode button (TB94a) - hide on mobile */}
          {!isMobile && isFullscreen ? (
            <button
              onClick={onExitFullscreen}
              data-testid="document-fullscreen-button"
              className="p-1.5 rounded text-blue-600 bg-blue-50 dark:bg-blue-900/30"
              aria-label="Exit fullscreen"
              title="Exit fullscreen (Escape)"
            >
              <Minimize2 className="w-5 h-5" />
            </button>
          ) : (
            !isMobile && onEnterFullscreen && (
              <button
                onClick={onEnterFullscreen}
                data-testid="document-fullscreen-button"
                className="p-1.5 rounded text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                aria-label="Enter fullscreen"
                title="Focus mode (fullscreen)"
              >
                <Maximize2 className="w-5 h-5" />
              </button>
            )
          )}
          {/* Close button - hide on mobile since MobileDetailSheet has its own */}
          {!isMobile && (
            <button
              onClick={isFullscreen ? onExitFullscreen : onClose}
              className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
              aria-label={isFullscreen ? 'Exit fullscreen' : 'Close panel'}
              data-testid="document-detail-close"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Error message */}
      {updateDocument.isError && (
        <div
          data-testid="document-update-error"
          className={`${isMobile ? 'mx-3' : 'mx-4'} mt-2 p-2 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-sm rounded`}
        >
          {updateDocument.error?.message || 'Failed to save document'}
        </div>
      )}

      {/* Main content area with optional version history sidebar */}
      <div className="flex-1 flex overflow-hidden">
        {/* Content */}
        <div className={`flex-1 overflow-y-auto ${isMobile ? 'p-3' : 'p-4'}`}>
          {/* Preview banner */}
          {previewingVersion !== null && previewDocument && (
            <div
              data-testid="document-preview-banner"
              className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-between"
            >
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-blue-600" />
                <span className="text-sm text-blue-800">
                  Previewing version {previewingVersion}
                </span>
              </div>
              <button
                onClick={() => setPreviewingVersion(null)}
                data-testid="exit-preview-button"
                className="text-xs text-blue-600 hover:text-blue-800 font-medium"
              >
                Exit Preview
              </button>
            </div>
          )}

          {/* Document Content */}
          <div data-testid="document-content" className="mb-6">
            {isEditing ? (
              <BlockEditor
                content={editedContent}
                contentType={document.contentType}
                onChange={setEditedContent}
                onSave={handleSave}
                placeholder="Start writing..."
                onComment={handleComment}
                mentionEntities={mentionEntities}
              />
            ) : (
              <DocumentRenderer
                content={previewingVersion !== null && previewDocument ? previewDocument.content || '' : document.content || ''}
                contentType={previewingVersion !== null && previewDocument ? previewDocument.contentType : document.contentType}
              />
            )}
          </div>

          {/* Tags - only show for current version, not preview */}
          {!previewingVersion && document.tags && document.tags.length > 0 && (
            <div className="mb-6">
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1">
                <Tag className="w-3 h-3" />
                Tags
              </div>
              <div className="flex flex-wrap gap-1">
                {document.tags.map((tag) => (
                  <span
                    key={tag}
                    data-testid={`document-tag-${tag}`}
                    className="px-2 py-0.5 text-xs bg-gray-100 text-gray-700 rounded"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Linked Documents - only show for current version, not preview */}
          {!previewingVersion && onNavigateToDocument && (
            <LinkedDocumentsSection
              documentId={documentId}
              onNavigateToDocument={onNavigateToDocument}
            />
          )}
        </div>

        {/* Version History Sidebar */}
        {showVersionHistory && (
          <VersionHistorySidebar
            documentId={documentId}
            currentVersion={document.version || 1}
            onPreviewVersion={setPreviewingVersion}
            previewingVersion={previewingVersion}
            onClose={() => {
              setShowVersionHistory(false);
              setPreviewingVersion(null);
            }}
          />
        )}

        {/* Comments Panel (TB98) */}
        {showCommentsPanel && (
          <div className="w-80 flex-shrink-0 border-l border-gray-200 h-full overflow-hidden">
            <CommentsPanel
              documentId={documentId}
              onCommentClick={handleCommentClick}
              currentUserId="el-0000" // TODO: Use actual current user ID
            />
          </div>
        )}
      </div>

      {/* Add Comment Modal (TB98) */}
      <AddCommentModal
        isOpen={commentModalOpen}
        onClose={() => {
          setCommentModalOpen(false);
          setPendingComment(null);
        }}
        selectedText={pendingComment?.selectedText || ''}
        onSubmit={handleSubmitComment}
        isSubmitting={createComment.isPending}
      />

      {/* Document Icon Picker Modal (TB97) */}
      <EmojiPickerModal
        isOpen={showIconPicker}
        onClose={() => setShowIconPicker(false)}
        onSelect={handleSetIcon}
      />
    </div>
  );
}

function AllDocumentsView({
  selectedDocumentId,
  onSelectDocument,
  onNewDocument,
  isMobile = false,
}: {
  selectedDocumentId: string | null;
  onSelectDocument: (id: string) => void;
  onNewDocument: () => void;
  isMobile?: boolean;
}) {
  const [searchQuery, setSearchQuery] = useState('');

  // Use upfront-loaded data (TB67) instead of server-side pagination
  const { data: allDocuments, isLoading: isDocumentsLoading } = useAllDocumentsPreloaded();

  // TB130: Client-side filtering with instant results (no Load More pattern)
  const filteredDocuments = useMemo((): DocumentType[] => {
    if (!allDocuments) return [];

    // Cast to DocumentType[] - the Document type from useAllElements is compatible
    const docs = allDocuments as unknown as DocumentType[];
    const filterFn = createSimpleDocumentSearchFilter(searchQuery);
    const filtered = filterFn ? docs.filter(filterFn) : docs;

    // Sort by updatedAt descending
    return sortData(filtered, { field: 'updatedAt', direction: 'desc' });
  }, [allDocuments, searchQuery]);

  const totalItems = filteredDocuments.length;
  const isLoading = isDocumentsLoading;

  // TB130: Render function for virtualized document list item
  const renderDocumentItem = useCallback((doc: DocumentType) => (
    <div className={`${isMobile ? 'px-3' : 'px-4'}`}>
      <DocumentListItem
        document={doc}
        isSelected={selectedDocumentId === doc.id}
        onClick={onSelectDocument}
      />
    </div>
  ), [selectedDocumentId, onSelectDocument, isMobile]);

  return (
    <div
      data-testid="all-documents-view"
      className="h-full flex flex-col bg-white dark:bg-[var(--color-bg)]"
    >
      {/* Header */}
      <div
        data-testid="all-documents-header"
        className={`flex-shrink-0 ${isMobile ? 'p-3' : 'p-4'} border-b border-gray-200 dark:border-[var(--color-border)]`}
      >
        <div className="flex items-center justify-between">
          <div className={`flex items-center ${isMobile ? 'gap-2' : 'gap-3'} min-w-0`}>
            <FileText className={`${isMobile ? 'w-5 h-5' : 'w-6 h-6'} text-blue-400 flex-shrink-0`} />
            <h3 className={`font-semibold text-gray-900 dark:text-[var(--color-text)] ${isMobile ? 'text-base' : 'text-lg'}`}>
              All Documents
            </h3>
            <span className={`text-gray-500 dark:text-gray-400 ${isMobile ? 'text-xs' : 'text-sm'}`} data-testid="all-documents-count">
              {totalItems} {totalItems === 1 ? 'doc' : 'docs'}
            </span>
          </div>
          {/* Hide button on mobile - use FAB instead */}
          {!isMobile && (
            <button
              onClick={onNewDocument}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors"
              data-testid="new-document-button-all"
            >
              <Plus className="w-4 h-4" />
              Create Document
              <kbd className="ml-1 text-xs bg-blue-800/50 text-white px-1 py-0.5 rounded">C D</kbd>
            </button>
          )}
        </div>
        {/* Search box */}
        <div className="mt-3 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search documents..."
            className={`w-full pl-9 pr-4 ${isMobile ? 'py-3' : 'py-2'} text-sm border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500`}
            data-testid="documents-search-input"
          />
        </div>
      </div>

      {/* TB130: Virtualized Documents Area */}
      <div
        data-testid="all-documents-container"
        className="flex-1 min-h-0"
      >
        {isLoading ? (
          <div
            data-testid="all-documents-loading"
            className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400"
          >
            Loading documents...
          </div>
        ) : filteredDocuments.length === 0 ? (
          <div
            data-testid="all-documents-empty"
            className="flex flex-col items-center justify-center h-full text-gray-500 dark:text-gray-400 px-4"
          >
            <FileText className="w-12 h-12 mb-3 text-gray-300 dark:text-gray-600" />
            <p className="text-sm text-center">{searchQuery ? 'No documents match your search' : 'No documents yet'}</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 text-center">
              {searchQuery ? 'Try a different search term' : 'Create documents to build your knowledge base'}
            </p>
          </div>
        ) : (
          <VirtualizedList
            items={filteredDocuments}
            getItemKey={(doc) => doc.id}
            estimateSize={isMobile ? 72 : DOCUMENT_ITEM_HEIGHT}
            renderItem={renderDocumentItem}
            overscan={5}
            className="h-full pt-2"
            scrollRestoreId="all-documents-scroll"
            testId="virtualized-all-documents-list"
            gap={isMobile ? 4 : 8}
          />
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Page Component
// ============================================================================

export function DocumentsPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: '/documents' });
  const isMobile = useIsMobile();

  const { data: libraries = [], isLoading, error } = useLibraries();
  const [selectedLibraryId, setSelectedLibraryId] = useState<string | null>(
    search.library ?? null
  );
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(
    search.selected ?? null
  );
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showCreateLibraryModal, setShowCreateLibraryModal] = useState(false);
  // Expand state - initialized from localStorage (TB94a)
  const [isDocumentExpanded, setIsDocumentExpandedState] = useState(false);
  const [expandedInitialized, setExpandedInitialized] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Initialize expand state from localStorage on mount (TB94a)
  useEffect(() => {
    if (!expandedInitialized) {
      const stored = localStorage.getItem('document.expanded');
      if (stored === 'true') {
        setIsDocumentExpandedState(true);
      }
      setExpandedInitialized(true);
    }
  }, [expandedInitialized]);

  // Wrapper for setIsDocumentExpanded that also persists to localStorage (TB94a)
  const setIsDocumentExpanded = (value: boolean | ((prev: boolean) => boolean)) => {
    setIsDocumentExpandedState((prev) => {
      const newValue = typeof value === 'function' ? value(prev) : value;
      localStorage.setItem('document.expanded', newValue.toString());
      return newValue;
    });
  };

  // Handle Escape key to exit fullscreen (TB94a)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen]);

  // Use upfront-loaded data for deep-link navigation (TB70)
  const { data: allDocuments } = useAllDocumentsPreloaded();

  // Deep-link navigation (TB70)
  const deepLink = useDeepLink({
    data: allDocuments as DocumentType[] | undefined,
    selectedId: search.selected,
    currentPage: 1,
    pageSize: 1000, // Documents don't use pagination in this view
    getId: (doc) => doc.id,
    routePath: '/documents',
    rowTestIdPrefix: 'document-item-',
    autoNavigate: false, // Documents don't use pagination pages
    highlightDelay: 200,
  });

  // Sync state from URL on mount and when search changes
  useEffect(() => {
    if (search.selected && search.selected !== selectedDocumentId) {
      setSelectedDocumentId(search.selected);
    }
    if (!search.selected && selectedDocumentId) {
      setSelectedDocumentId(null);
    }
    if (search.library && search.library !== selectedLibraryId) {
      setSelectedLibraryId(search.library);
    }
    if (!search.library && selectedLibraryId) {
      setSelectedLibraryId(null);
    }
  }, [search.selected, search.library]);

  // Toggle expand/collapse for a library in the tree
  const handleToggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Expand all ancestors of a library in the tree
  const expandAncestors = (libraryId: string) => {
    const library = libraries.find(l => l.id === libraryId);
    if (!library) return;

    // Build ancestor chain and expand all
    const ancestorsToExpand: string[] = [];
    let current = library;
    while (current.parentId) {
      ancestorsToExpand.push(current.parentId);
      const parent = libraries.find(l => l.id === current.parentId);
      if (!parent) break;
      current = parent;
    }

    if (ancestorsToExpand.length > 0) {
      setExpandedIds((prev) => {
        const next = new Set(prev);
        for (const id of ancestorsToExpand) {
          next.add(id);
        }
        return next;
      });
    }
  };

  // Clear document selection and collapse when library changes
  const handleSelectLibrary = (libraryId: string | null) => {
    setSelectedLibraryId(libraryId);
    setSelectedDocumentId(null);
    setIsDocumentExpanded(false);
    // Expand ancestors so the library is visible in the tree
    if (libraryId) {
      expandAncestors(libraryId);
    }
  };

  const handleSelectDocument = (documentId: string) => {
    setSelectedDocumentId(documentId);
    navigate({ to: '/documents', search: { selected: documentId, library: selectedLibraryId ?? undefined, page: 1, limit: DEFAULT_PAGE_SIZE } });
  };

  const handleCloseDocument = () => {
    setSelectedDocumentId(null);
    navigate({ to: '/documents', search: { selected: undefined, library: selectedLibraryId ?? undefined, page: 1, limit: DEFAULT_PAGE_SIZE } });
  };

  const handleOpenCreateModal = () => {
    setShowCreateModal(true);
  };

  const handleCloseCreateModal = () => {
    setShowCreateModal(false);
  };

  const handleOpenCreateLibraryModal = () => {
    setShowCreateLibraryModal(true);
  };

  const handleCloseCreateLibraryModal = () => {
    setShowCreateLibraryModal(false);
  };

  const handleLibraryCreated = (library: { id: string }) => {
    // Select the newly created library
    setSelectedLibraryId(library.id);
  };

  const handleDocumentCreated = (document: { id: string }) => {
    // Select the newly created document
    setSelectedDocumentId(document.id);
  };

  // Handle mobile back navigation
  const handleMobileBack = () => {
    setSelectedDocumentId(null);
    navigate({ to: '/documents', search: { selected: undefined, library: selectedLibraryId ?? undefined, page: 1, limit: DEFAULT_PAGE_SIZE } });
  };

  if (error) {
    return (
      <div
        data-testid="documents-page-error"
        className="flex items-center justify-center h-full px-4"
      >
        <div className="text-center">
          <p className="text-red-500 mb-2">Failed to load libraries</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">{(error as Error).message}</p>
        </div>
      </div>
    );
  }

  // Determine the main content view
  const renderMainContent = (mobile = false) => {
    if (selectedLibraryId) {
      return (
        <LibraryView
          libraryId={selectedLibraryId}
          selectedDocumentId={selectedDocumentId}
          onSelectDocument={handleSelectDocument}
          onSelectLibrary={handleSelectLibrary}
          onNewDocument={handleOpenCreateModal}
          isMobile={mobile}
        />
      );
    }

    // Show all documents when no library is selected
    return (
      <AllDocumentsView
        selectedDocumentId={selectedDocumentId}
        onSelectDocument={handleSelectDocument}
        onNewDocument={handleOpenCreateModal}
        isMobile={mobile}
      />
    );
  };

  // Mobile: Two-screen navigation pattern
  // - When no document selected: show document list (simplified, no sidebar library tree)
  // - When document selected: show full-screen document editor
  if (isMobile) {
    return (
      <div data-testid="documents-page" className="flex flex-col h-full relative">
        {/* Mobile: Show document list when no document selected */}
        {!selectedDocumentId && (
          <>
            {isLoading ? (
              <div
                data-testid="libraries-loading"
                className="flex-1 flex items-center justify-center"
              >
                <div className="text-gray-500 dark:text-gray-400">Loading...</div>
              </div>
            ) : (
              <div className="flex-1 min-h-0 overflow-hidden">
                {/* Mobile shows simplified document list - no library tree on mobile */}
                {renderMainContent(true)}
              </div>
            )}

            {/* Mobile FAB for creating new document */}
            <button
              onClick={handleOpenCreateModal}
              className="fixed bottom-20 right-4 w-14 h-14 bg-blue-500 hover:bg-blue-600 text-white rounded-full shadow-lg flex items-center justify-center transition-colors z-30 touch-target"
              data-testid="mobile-create-document-fab"
              aria-label="Create new document"
            >
              <Plus className="w-6 h-6" />
            </button>
          </>
        )}

        {/* Mobile: Show full-screen document editor when document selected */}
        {selectedDocumentId && (
          <MobileDetailSheet
            open={true}
            onClose={handleMobileBack}
            title="Document"
            data-testid="mobile-document-sheet"
          >
            {deepLink.notFound ? (
              <ElementNotFound
                elementType="Document"
                elementId={selectedDocumentId}
                backRoute="/documents"
                backLabel="Back to Documents"
                onDismiss={handleMobileBack}
              />
            ) : (
              <div className="h-full">
                <DocumentDetailPanel
                  documentId={selectedDocumentId}
                  onClose={handleMobileBack}
                  isExpanded={true}
                  isFullscreen={false}
                  onDocumentCloned={handleDocumentCreated}
                  libraryId={selectedLibraryId}
                  onNavigateToDocument={handleSelectDocument}
                  isMobile={true}
                />
              </div>
            )}
          </MobileDetailSheet>
        )}

        {/* Create Document Modal */}
        <CreateDocumentModal
          isOpen={showCreateModal}
          onClose={handleCloseCreateModal}
          onSuccess={handleDocumentCreated}
          defaultLibraryId={selectedLibraryId || undefined}
          isMobile={true}
        />

        {/* Create Library Modal */}
        <CreateLibraryModal
          isOpen={showCreateLibraryModal}
          onClose={handleCloseCreateLibraryModal}
          onSuccess={handleLibraryCreated}
          defaultParentId={selectedLibraryId || undefined}
        />
      </div>
    );
  }

  // Desktop: Side-by-side layout
  return (
    <div data-testid="documents-page" className="flex h-full">
      {/* Fullscreen Panel - overlays everything when in fullscreen mode (TB94a) */}
      {isFullscreen && selectedDocumentId && (
        <div
          data-testid="document-fullscreen-panel"
          className="fixed inset-0 z-50 bg-white dark:bg-gray-900 flex flex-col"
        >
          <DocumentDetailPanel
            documentId={selectedDocumentId}
            onClose={() => setIsFullscreen(false)}
            isExpanded={true}
            onToggleExpand={() => setIsFullscreen(false)}
            isFullscreen={true}
            onExitFullscreen={() => setIsFullscreen(false)}
            onDocumentCloned={handleDocumentCreated}
            libraryId={selectedLibraryId}
            onNavigateToDocument={handleSelectDocument}
          />
        </div>
      )}

      {/* Library Tree Sidebar - hide in fullscreen mode */}
      {!isFullscreen && (
        <>
          {isLoading ? (
            <div
              data-testid="libraries-loading"
              className="w-64 border-r border-gray-200 dark:border-[var(--color-border)] flex items-center justify-center"
            >
              <div className="text-gray-500 dark:text-gray-400">Loading libraries...</div>
            </div>
          ) : (
            <div data-testid="library-tree-sidebar">
              <LibraryTree
                libraries={libraries}
                selectedLibraryId={selectedLibraryId}
                expandedIds={expandedIds}
                onSelectLibrary={handleSelectLibrary}
                onToggleExpand={handleToggleExpand}
                onNewDocument={handleOpenCreateModal}
                onNewLibrary={handleOpenCreateLibraryModal}
                onSelectDocument={handleSelectDocument}
              />
            </div>
          )}
        </>
      )}

      {/* Main Content Area - with or without document detail panel (hidden in fullscreen) */}
      {!isFullscreen && (
        <div className="flex-1 flex overflow-hidden">
          {/* Document List / Library View - hide when document is expanded */}
          {(!selectedDocumentId || !isDocumentExpanded) && (
            <div className={`${selectedDocumentId ? 'flex-1 border-r border-gray-200 dark:border-[var(--color-border)]' : 'flex-1'} h-full overflow-hidden`}>
              {renderMainContent()}
            </div>
          )}

          {/* Document Detail Panel or Not Found (TB70) */}
          {selectedDocumentId && (
            <div className={`${isDocumentExpanded ? 'flex-1' : 'flex-1'} flex-shrink-0 overflow-hidden`}>
              {deepLink.notFound ? (
                <ElementNotFound
                  elementType="Document"
                  elementId={selectedDocumentId}
                  backRoute="/documents"
                  backLabel="Back to Documents"
                  onDismiss={handleCloseDocument}
                />
              ) : (
                <DocumentDetailPanel
                  documentId={selectedDocumentId}
                  onClose={handleCloseDocument}
                  isExpanded={isDocumentExpanded}
                  onToggleExpand={() => setIsDocumentExpanded(!isDocumentExpanded)}
                  isFullscreen={false}
                  onEnterFullscreen={() => setIsFullscreen(true)}
                  onDocumentCloned={handleDocumentCreated}
                  libraryId={selectedLibraryId}
                  onNavigateToDocument={handleSelectDocument}
                />
              )}
            </div>
          )}
        </div>
      )}

      {/* Create Document Modal */}
      <CreateDocumentModal
        isOpen={showCreateModal}
        onClose={handleCloseCreateModal}
        onSuccess={handleDocumentCreated}
        defaultLibraryId={selectedLibraryId || undefined}
      />

      {/* Create Library Modal */}
      <CreateLibraryModal
        isOpen={showCreateLibraryModal}
        onClose={handleCloseCreateLibraryModal}
        onSuccess={handleLibraryCreated}
        defaultParentId={selectedLibraryId || undefined}
      />
    </div>
  );
}

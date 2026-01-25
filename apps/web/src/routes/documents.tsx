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

import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearch, useNavigate } from '@tanstack/react-router';
import { Pagination } from '../components/shared/Pagination';
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
} from 'lucide-react';
import { BlockEditor } from '../components/editor/BlockEditor';
import { CreateDocumentModal } from '../components/document/CreateDocumentModal';
import { CreateLibraryModal } from '../components/document/CreateLibraryModal';

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

function useDocuments(
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
      updates: Partial<Pick<DocumentType, 'title' | 'content' | 'contentType' | 'tags'>>;
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

function LibraryTreeItem({
  node,
  selectedLibraryId,
  expandedIds,
  onSelect,
  onToggleExpand,
  level = 0,
}: {
  node: LibraryTreeNode;
  selectedLibraryId: string | null;
  expandedIds: Set<string>;
  onSelect: (id: string) => void;
  onToggleExpand: (id: string) => void;
  level?: number;
}) {
  const hasChildren = node.children.length > 0;
  const isSelected = selectedLibraryId === node.id;
  const isExpanded = expandedIds.has(node.id);

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
        >
          {hasChildren ? (
            isExpanded ? (
              <ChevronDown className="w-4 h-4 text-gray-400" />
            ) : (
              <ChevronRight className="w-4 h-4 text-gray-400" />
            )
          ) : (
            <span className="w-4 h-4" />
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

      {/* Children - recursively render nested libraries */}
      {isExpanded && hasChildren && (
        <div data-testid={`library-children-${node.id}`}>
          {node.children.map((child) => (
            <LibraryTreeItem
              key={child.id}
              node={child}
              selectedLibraryId={selectedLibraryId}
              expandedIds={expandedIds}
              onSelect={onSelect}
              onToggleExpand={onToggleExpand}
              level={level + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function LibraryTree({
  libraries,
  selectedLibraryId,
  expandedIds,
  onSelectLibrary,
  onToggleExpand,
  onNewDocument,
  onNewLibrary,
}: {
  libraries: LibraryType[];
  selectedLibraryId: string | null;
  expandedIds: Set<string>;
  onSelectLibrary: (id: string) => void;
  onToggleExpand: (id: string) => void;
  onNewDocument: () => void;
  onNewLibrary: () => void;
}) {
  // Build tree structure from flat list
  const treeNodes = buildLibraryTree(libraries);

  return (
    <div
      data-testid="library-tree"
      className="w-64 border-r border-gray-200 bg-white flex flex-col h-full"
    >
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Library className="w-5 h-5 text-gray-500" />
            Libraries
          </h2>
          <div className="flex items-center gap-1">
            <button
              onClick={onNewLibrary}
              className="p-1.5 text-gray-500 hover:text-purple-600 hover:bg-purple-50 rounded-md transition-colors"
              title="New Library"
              data-testid="new-library-button-sidebar"
            >
              <FolderPlus className="w-4 h-4" />
            </button>
            <button
              onClick={onNewDocument}
              className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
              title="New Document"
              data-testid="new-document-button-sidebar"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {libraries.length === 0 ? (
          <div
            data-testid="library-empty-state"
            className="text-center py-8 text-gray-500"
          >
            <Folder className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p className="text-sm">No libraries yet</p>
            <button
              onClick={onNewLibrary}
              className="mt-2 text-sm text-purple-600 hover:underline"
              data-testid="new-library-button-empty"
            >
              Create one
            </button>
          </div>
        ) : (
          <div data-testid="library-list" className="space-y-1">
            {treeNodes.map((node) => (
              <LibraryTreeItem
                key={node.id}
                node={node}
                selectedLibraryId={selectedLibraryId}
                expandedIds={expandedIds}
                onSelect={onSelectLibrary}
                onToggleExpand={onToggleExpand}
              />
            ))}
          </div>
        )}
      </div>

      {/* Library count */}
      <div
        data-testid="library-count"
        className="p-3 border-t border-gray-200 text-xs text-gray-500"
      >
        {libraries.length} {libraries.length === 1 ? 'library' : 'libraries'}
      </div>
    </div>
  );
}

function LibraryPlaceholder() {
  return (
    <div
      data-testid="library-placeholder"
      className="h-full flex items-center justify-center bg-gray-50"
    >
      <div className="text-center">
        <Library className="w-16 h-16 mx-auto mb-4 text-gray-300" />
        <h3 className="text-lg font-medium text-gray-900 mb-1">
          Select a library
        </h3>
        <p className="text-sm text-gray-500">
          Choose a library from the sidebar to view documents
        </p>
      </div>
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
      <FileText className={`w-8 h-8 flex-shrink-0 ${isSelected ? 'text-blue-500' : 'text-blue-400'}`} />
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

function LibraryView({
  libraryId,
  selectedDocumentId,
  onSelectDocument,
  onSelectLibrary,
  onNewDocument,
}: {
  libraryId: string;
  selectedDocumentId: string | null;
  onSelectDocument: (id: string) => void;
  onSelectLibrary: (id: string) => void;
  onNewDocument: () => void;
}) {
  const { data: library, isLoading: libraryLoading } = useLibrary(libraryId);
  const { data: documents = [], isLoading: docsLoading, error } = useLibraryDocuments(libraryId);

  const isLoading = libraryLoading || docsLoading;

  // Include both documents from API and embedded _documents
  const allDocuments = [
    ...documents,
    ...(library?._documents || []),
  ].filter((doc, index, self) =>
    index === self.findIndex((d) => d.id === doc.id)
  );

  return (
    <div
      data-testid="library-view"
      className="h-full flex flex-col bg-white"
    >
      {/* Library Header */}
      <div
        data-testid="library-header"
        className="p-4 border-b border-gray-200"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FolderOpen className="w-6 h-6 text-yellow-500" />
            {library ? (
              <>
                <h3
                  data-testid="library-name"
                  className="font-semibold text-gray-900 text-lg"
                >
                  {library.name}
                </h3>
                <span
                  data-testid="library-doc-count"
                  className="text-sm text-gray-400"
                >
                  {allDocuments.length} {allDocuments.length === 1 ? 'document' : 'documents'}
                </span>
              </>
            ) : (
              <div className="animate-pulse h-6 w-32 bg-gray-200 rounded" />
            )}
          </div>
          <button
            onClick={onNewDocument}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
            data-testid="new-document-button-library"
          >
            <Plus className="w-4 h-4" />
            New Document
          </button>
        </div>

        {/* Library description */}
        {library?.description && (
          <p
            data-testid="library-description"
            className="mt-2 text-sm text-gray-600"
          >
            {library.description}
          </p>
        )}
      </div>

      {/* Sub-libraries section */}
      {library?._subLibraries && library._subLibraries.length > 0 && (
        <div data-testid="sub-libraries" className="p-4 border-b border-gray-100">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            Sub-libraries
          </h4>
          <div className="flex flex-wrap gap-2">
            {library._subLibraries.map((subLib) => (
              <button
                key={subLib.id}
                data-testid={`sub-library-${subLib.id}`}
                onClick={() => onSelectLibrary(subLib.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-yellow-50 text-yellow-700 rounded-md text-sm hover:bg-yellow-100 transition-colors cursor-pointer"
              >
                <Folder className="w-4 h-4" />
                {subLib.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Documents Area */}
      <div
        data-testid="documents-container"
        className="flex-1 overflow-y-auto p-4"
      >
        {isLoading ? (
          <div
            data-testid="documents-loading"
            className="flex items-center justify-center h-full text-gray-500"
          >
            Loading documents...
          </div>
        ) : error ? (
          <div
            data-testid="documents-error"
            className="flex items-center justify-center h-full text-red-500"
          >
            Failed to load documents
          </div>
        ) : allDocuments.length === 0 ? (
          <div
            data-testid="documents-empty"
            className="flex flex-col items-center justify-center h-full text-gray-500"
          >
            <FileText className="w-12 h-12 mb-3 text-gray-300" />
            <p className="text-sm">No documents in this library</p>
            <p className="text-xs text-gray-400 mt-1">
              Add documents to organize your knowledge
            </p>
          </div>
        ) : (
          <div data-testid="documents-list" className="space-y-2">
            {allDocuments.map((doc) => (
              <DocumentListItem
                key={doc.id}
                document={doc}
                isSelected={selectedDocumentId === doc.id}
                onClick={onSelectDocument}
              />
            ))}
          </div>
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
 * Renders document content based on its contentType
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
      // For now, render markdown as plain text with better formatting
      // A full markdown renderer would require a library like react-markdown
      return (
        <div
          data-testid="document-content-markdown"
          className="prose prose-sm max-w-none text-gray-700"
        >
          <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
            {content}
          </pre>
        </div>
      );

    case 'text':
    default:
      return (
        <div
          data-testid="document-content-text"
          className="whitespace-pre-wrap text-sm text-gray-700 leading-relaxed"
        >
          {content}
        </div>
      );
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
  onDocumentCloned,
  libraryId,
  onNavigateToDocument,
}: {
  documentId: string;
  onClose: () => void;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  onDocumentCloned?: (document: { id: string }) => void;
  libraryId?: string | null;
  onNavigateToDocument?: (id: string) => void;
}) {
  const { data: document, isLoading, isError, error } = useDocument(documentId);
  const updateDocument = useUpdateDocument();
  const cloneDocument = useCloneDocument();
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState('');
  const [editedTitle, setEditedTitle] = useState('');
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [previewingVersion, setPreviewingVersion] = useState<number | null>(null);

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

  if (isLoading) {
    return (
      <div
        data-testid="document-detail-loading"
        className="h-full flex items-center justify-center bg-white"
      >
        <div className="text-gray-500">Loading document...</div>
      </div>
    );
  }

  if (isError) {
    return (
      <div
        data-testid="document-detail-error"
        className="h-full flex flex-col items-center justify-center bg-white"
      >
        <div className="text-red-600 mb-2">Failed to load document</div>
        <div className="text-sm text-gray-500">{(error as Error)?.message}</div>
      </div>
    );
  }

  if (!document) {
    return (
      <div
        data-testid="document-detail-not-found"
        className="h-full flex items-center justify-center bg-white"
      >
        <div className="text-gray-500">Document not found</div>
      </div>
    );
  }

  const title = document.title || `Document ${document.id}`;
  const typeConfig = CONTENT_TYPE_CONFIG[document.contentType] || CONTENT_TYPE_CONFIG.text;

  return (
    <div
      data-testid="document-detail-panel"
      className="h-full flex flex-col bg-white border-l border-gray-200"
    >
      {/* Header */}
      <div className="flex items-start justify-between p-4 border-b border-gray-200">
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

          {/* Title */}
          {isEditing ? (
            <input
              type="text"
              value={editedTitle}
              onChange={(e) => setEditedTitle(e.target.value)}
              data-testid="document-title-input"
              className="text-lg font-semibold text-gray-900 w-full border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
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

        {/* Action buttons */}
        <div className="flex items-center gap-1 ml-2">
          {isEditing ? (
            <>
              <button
                onClick={handleSave}
                disabled={updateDocument.isPending}
                data-testid="document-save-button"
                className="p-1.5 text-green-600 hover:text-green-700 hover:bg-green-50 rounded disabled:opacity-50"
                aria-label="Save changes"
                title="Save (Cmd+S)"
              >
                <Save className="w-5 h-5" />
              </button>
              <button
                onClick={handleCancelEdit}
                disabled={updateDocument.isPending}
                data-testid="document-cancel-button"
                className="p-1.5 text-red-600 hover:text-red-700 hover:bg-red-50 rounded disabled:opacity-50"
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
                className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label="Edit document"
                title={previewingVersion !== null ? 'Exit preview to edit' : 'Edit document'}
              >
                <Edit3 className="w-5 h-5" />
              </button>
              <button
                onClick={handleClone}
                disabled={cloneDocument.isPending || previewingVersion !== null}
                data-testid="document-clone-button"
                className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded disabled:opacity-50 disabled:cursor-not-allowed"
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
                    ? 'text-blue-600 bg-blue-50'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                }`}
                aria-label={showVersionHistory ? 'Hide version history' : 'Show version history'}
                title="Version history"
              >
                <History className="w-5 h-5" />
              </button>
              {onToggleExpand && (
                <button
                  onClick={onToggleExpand}
                  data-testid="document-expand-button"
                  className={`p-1.5 rounded ${
                    isExpanded
                      ? 'text-blue-600 bg-blue-50'
                      : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                  }`}
                  aria-label={isExpanded ? 'Collapse document' : 'Expand document'}
                  title={isExpanded ? 'Show document list' : 'Hide document list'}
                >
                  {isExpanded ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
                </button>
              )}
            </>
          )}
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
            aria-label="Close panel"
            data-testid="document-detail-close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Error message */}
      {updateDocument.isError && (
        <div
          data-testid="document-update-error"
          className="mx-4 mt-2 p-2 bg-red-50 text-red-700 text-sm rounded"
        >
          {updateDocument.error?.message || 'Failed to save document'}
        </div>
      )}

      {/* Main content area with optional version history sidebar */}
      <div className="flex-1 flex overflow-hidden">
        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
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
      </div>
    </div>
  );
}

function AllDocumentsView({
  selectedDocumentId,
  onSelectDocument,
  onNewDocument,
  currentPage,
  pageSize,
  onPageChange,
  onPageSizeChange,
  searchQuery,
  onSearchChange,
}: {
  selectedDocumentId: string | null;
  onSelectDocument: (id: string) => void;
  onNewDocument: () => void;
  currentPage: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}) {
  const { data: documents, isLoading, error } = useDocuments(currentPage, pageSize, searchQuery);

  const documentItems = documents?.items ?? [];
  const totalItems = documents?.total ?? 0;
  const totalPages = Math.ceil(totalItems / pageSize);

  return (
    <div
      data-testid="all-documents-view"
      className="flex-1 flex flex-col bg-white"
    >
      {/* Header */}
      <div
        data-testid="all-documents-header"
        className="p-4 border-b border-gray-200"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FileText className="w-6 h-6 text-blue-400" />
            <h3 className="font-semibold text-gray-900 text-lg">
              All Documents
            </h3>
            <span className="text-sm text-gray-400">
              {documentItems.length} of {totalItems} {totalItems === 1 ? 'document' : 'documents'}
            </span>
          </div>
          <button
            onClick={onNewDocument}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
            data-testid="new-document-button-all"
          >
            <Plus className="w-4 h-4" />
            New Document
          </button>
        </div>
        {/* Search box */}
        <div className="mt-3 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search documents..."
            className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            data-testid="documents-search-input"
          />
        </div>
      </div>

      {/* Documents Area */}
      <div
        data-testid="all-documents-container"
        className="flex-1 overflow-y-auto p-4"
      >
        {isLoading ? (
          <div
            data-testid="all-documents-loading"
            className="flex items-center justify-center h-full text-gray-500"
          >
            Loading documents...
          </div>
        ) : error ? (
          <div
            data-testid="all-documents-error"
            className="flex items-center justify-center h-full text-red-500"
          >
            Failed to load documents
          </div>
        ) : documentItems.length === 0 ? (
          <div
            data-testid="all-documents-empty"
            className="flex flex-col items-center justify-center h-full text-gray-500"
          >
            <FileText className="w-12 h-12 mb-3 text-gray-300" />
            <p className="text-sm">{searchQuery ? 'No documents match your search' : 'No documents yet'}</p>
            <p className="text-xs text-gray-400 mt-1">
              {searchQuery ? 'Try a different search term' : 'Create documents to build your knowledge base'}
            </p>
          </div>
        ) : (
          <>
            <div data-testid="all-documents-list" className="space-y-2">
              {documentItems.map((doc) => (
                <DocumentListItem
                  key={doc.id}
                  document={doc}
                  isSelected={selectedDocumentId === doc.id}
                  onClick={onSelectDocument}
                />
              ))}
            </div>
            {/* Pagination */}
            <div className="mt-4">
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                totalItems={totalItems}
                pageSize={pageSize}
                onPageChange={onPageChange}
                onPageSizeChange={onPageSizeChange}
              />
            </div>
          </>
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

  // Pagination state from URL
  const currentPage = search.page ?? 1;
  const pageSize = search.limit ?? DEFAULT_PAGE_SIZE;

  const { data: libraries = [], isLoading, error } = useLibraries();
  const [selectedLibraryId, setSelectedLibraryId] = useState<string | null>(
    search.library ?? null
  );
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(
    search.selected ?? null
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showCreateLibraryModal, setShowCreateLibraryModal] = useState(false);
  const [isDocumentExpanded, setIsDocumentExpanded] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

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
  const handleSelectLibrary = (libraryId: string) => {
    setSelectedLibraryId(libraryId);
    setSelectedDocumentId(null);
    setIsDocumentExpanded(false);
    // Expand ancestors so the library is visible in the tree
    expandAncestors(libraryId);
  };

  const handleSelectDocument = (documentId: string) => {
    setSelectedDocumentId(documentId);
    navigate({ to: '/documents', search: { selected: documentId, library: selectedLibraryId ?? undefined, page: currentPage, limit: pageSize } });
  };

  const handleCloseDocument = () => {
    setSelectedDocumentId(null);
    navigate({ to: '/documents', search: { selected: undefined, library: selectedLibraryId ?? undefined, page: currentPage, limit: pageSize } });
  };

  const handlePageChange = (page: number) => {
    navigate({ to: '/documents', search: { page, limit: pageSize, selected: selectedDocumentId ?? undefined, library: selectedLibraryId ?? undefined } });
  };

  const handlePageSizeChange = (newPageSize: number) => {
    navigate({ to: '/documents', search: { page: 1, limit: newPageSize, selected: selectedDocumentId ?? undefined, library: selectedLibraryId ?? undefined } });
  };

  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
    navigate({ to: '/documents', search: { page: 1, limit: pageSize, selected: selectedDocumentId ?? undefined, library: selectedLibraryId ?? undefined } });
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

  if (error) {
    return (
      <div
        data-testid="documents-page-error"
        className="flex items-center justify-center h-full"
      >
        <div className="text-center">
          <p className="text-red-500 mb-2">Failed to load libraries</p>
          <p className="text-sm text-gray-500">{(error as Error).message}</p>
        </div>
      </div>
    );
  }

  // Determine the main content view
  const renderMainContent = () => {
    if (selectedLibraryId) {
      return (
        <LibraryView
          libraryId={selectedLibraryId}
          selectedDocumentId={selectedDocumentId}
          onSelectDocument={handleSelectDocument}
          onSelectLibrary={handleSelectLibrary}
          onNewDocument={handleOpenCreateModal}
        />
      );
    }

    if (libraries.length > 0) {
      return <LibraryPlaceholder />;
    }

    return (
      <AllDocumentsView
        selectedDocumentId={selectedDocumentId}
        onSelectDocument={handleSelectDocument}
        onNewDocument={handleOpenCreateModal}
        currentPage={currentPage}
        pageSize={pageSize}
        onPageChange={handlePageChange}
        onPageSizeChange={handlePageSizeChange}
        searchQuery={searchQuery}
        onSearchChange={handleSearchChange}
      />
    );
  };

  return (
    <div data-testid="documents-page" className="flex h-full">
      {/* Library Tree Sidebar */}
      {isLoading ? (
        <div
          data-testid="libraries-loading"
          className="w-64 border-r border-gray-200 flex items-center justify-center"
        >
          <div className="text-gray-500">Loading libraries...</div>
        </div>
      ) : (
        <LibraryTree
          libraries={libraries}
          selectedLibraryId={selectedLibraryId}
          expandedIds={expandedIds}
          onSelectLibrary={handleSelectLibrary}
          onToggleExpand={handleToggleExpand}
          onNewDocument={handleOpenCreateModal}
          onNewLibrary={handleOpenCreateLibraryModal}
        />
      )}

      {/* Main Content Area - with or without document detail panel */}
      <div className="flex-1 flex overflow-hidden">
        {/* Document List / Library View - hide when document is expanded */}
        {(!selectedDocumentId || !isDocumentExpanded) && (
          <div className={`${selectedDocumentId ? 'flex-1 border-r border-gray-200' : 'flex-1'} h-full overflow-hidden`}>
            {renderMainContent()}
          </div>
        )}

        {/* Document Detail Panel */}
        {selectedDocumentId && (
          <div className={`${isDocumentExpanded ? 'flex-1' : 'flex-1'} flex-shrink-0 overflow-hidden`}>
            <DocumentDetailPanel
              documentId={selectedDocumentId}
              onClose={handleCloseDocument}
              isExpanded={isDocumentExpanded}
              onToggleExpand={() => setIsDocumentExpanded(!isDocumentExpanded)}
              onDocumentCloned={handleDocumentCreated}
              libraryId={selectedLibraryId}
              onNavigateToDocument={handleSelectDocument}
            />
          </div>
        )}
      </div>

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

/**
 * Documents Page - Notion-style document library interface
 *
 * Features:
 * - Library tree sidebar (TB20)
 * - Library selection
 * - Document list
 * - Nested library navigation
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Library,
  FileText,
  ChevronRight,
  ChevronDown,
  FolderOpen,
  Folder,
} from 'lucide-react';

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
}

interface DocumentType {
  id: string;
  type: 'document';
  title?: string;
  content?: string;
  contentType: string;
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

function useDocuments() {
  return useQuery<DocumentType[]>({
    queryKey: ['documents'],
    queryFn: async () => {
      const response = await fetch('/api/documents?limit=50');
      if (!response.ok) {
        throw new Error('Failed to fetch documents');
      }
      return response.json();
    },
  });
}

// ============================================================================
// Components
// ============================================================================

function LibraryTreeItem({
  library,
  isSelected,
  isExpanded,
  onSelect,
  onToggleExpand,
  level = 0,
  children,
}: {
  library: LibraryType;
  isSelected: boolean;
  isExpanded: boolean;
  onSelect: (id: string) => void;
  onToggleExpand: (id: string) => void;
  level?: number;
  children?: React.ReactNode;
}) {
  const hasChildren = !!children;

  return (
    <div data-testid={`library-tree-item-${library.id}`}>
      <div
        className={`flex items-center gap-1 px-2 py-1.5 rounded-md cursor-pointer transition-colors ${
          isSelected
            ? 'bg-blue-50 text-blue-700'
            : 'text-gray-700 hover:bg-gray-100'
        }`}
        style={{ paddingLeft: `${8 + level * 16}px` }}
        onClick={() => onSelect(library.id)}
      >
        {/* Expand/Collapse Toggle */}
        <button
          data-testid={`library-toggle-${library.id}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggleExpand(library.id);
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
        {isExpanded ? (
          <FolderOpen className="w-4 h-4 text-yellow-500 flex-shrink-0" />
        ) : (
          <Folder className="w-4 h-4 text-yellow-500 flex-shrink-0" />
        )}

        {/* Library Name */}
        <span
          data-testid={`library-name-${library.id}`}
          className="text-sm font-medium truncate"
        >
          {library.name}
        </span>
      </div>

      {/* Children */}
      {isExpanded && children && (
        <div data-testid={`library-children-${library.id}`}>
          {children}
        </div>
      )}
    </div>
  );
}

function LibraryTree({
  libraries,
  selectedLibraryId,
  onSelectLibrary,
}: {
  libraries: LibraryType[];
  selectedLibraryId: string | null;
  onSelectLibrary: (id: string) => void;
}) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) => {
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

  return (
    <div
      data-testid="library-tree"
      className="w-64 border-r border-gray-200 bg-white flex flex-col h-full"
    >
      <div className="p-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <Library className="w-5 h-5 text-gray-500" />
          Libraries
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {libraries.length === 0 ? (
          <div
            data-testid="library-empty-state"
            className="text-center py-8 text-gray-500"
          >
            <Folder className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p className="text-sm">No libraries yet</p>
          </div>
        ) : (
          <div data-testid="library-list" className="space-y-1">
            {libraries.map((library) => (
              <LibraryTreeItem
                key={library.id}
                library={library}
                isSelected={selectedLibraryId === library.id}
                isExpanded={expandedIds.has(library.id)}
                onSelect={onSelectLibrary}
                onToggleExpand={toggleExpand}
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
      className="flex-1 flex items-center justify-center bg-gray-50"
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

function DocumentListItem({ document }: { document: DocumentType }) {
  const formattedDate = new Date(document.updatedAt).toLocaleDateString();
  const title = document.title || `Document ${document.id}`;

  return (
    <div
      data-testid={`document-item-${document.id}`}
      className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 hover:border-gray-200 hover:bg-gray-50 cursor-pointer transition-colors"
    >
      <FileText className="w-8 h-8 text-blue-400 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p
          data-testid={`document-title-${document.id}`}
          className="font-medium text-gray-900 truncate"
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

function LibraryView({ libraryId }: { libraryId: string }) {
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
      className="flex-1 flex flex-col bg-white"
    >
      {/* Library Header */}
      <div
        data-testid="library-header"
        className="p-4 border-b border-gray-200"
      >
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
              <div
                key={subLib.id}
                data-testid={`sub-library-${subLib.id}`}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-yellow-50 text-yellow-700 rounded-md text-sm"
              >
                <Folder className="w-4 h-4" />
                {subLib.name}
              </div>
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
              <DocumentListItem key={doc.id} document={doc} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AllDocumentsView() {
  const { data: documents = [], isLoading, error } = useDocuments();

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
        <div className="flex items-center gap-3">
          <FileText className="w-6 h-6 text-blue-400" />
          <h3 className="font-semibold text-gray-900 text-lg">
            All Documents
          </h3>
          <span className="text-sm text-gray-400">
            {documents.length} {documents.length === 1 ? 'document' : 'documents'}
          </span>
        </div>
        <p className="mt-2 text-sm text-gray-600">
          Select a library from the sidebar to filter documents
        </p>
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
        ) : documents.length === 0 ? (
          <div
            data-testid="all-documents-empty"
            className="flex flex-col items-center justify-center h-full text-gray-500"
          >
            <FileText className="w-12 h-12 mb-3 text-gray-300" />
            <p className="text-sm">No documents yet</p>
            <p className="text-xs text-gray-400 mt-1">
              Create documents to build your knowledge base
            </p>
          </div>
        ) : (
          <div data-testid="all-documents-list" className="space-y-2">
            {documents.map((doc) => (
              <DocumentListItem key={doc.id} document={doc} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Page Component
// ============================================================================

export function DocumentsPage() {
  const { data: libraries = [], isLoading, error } = useLibraries();
  const [selectedLibraryId, setSelectedLibraryId] = useState<string | null>(null);

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

  return (
    <div data-testid="documents-page" className="flex h-full">
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
          onSelectLibrary={setSelectedLibraryId}
        />
      )}

      {selectedLibraryId ? (
        <LibraryView libraryId={selectedLibraryId} />
      ) : libraries.length > 0 ? (
        <LibraryPlaceholder />
      ) : (
        <AllDocumentsView />
      )}
    </div>
  );
}

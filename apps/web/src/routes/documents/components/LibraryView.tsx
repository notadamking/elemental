/**
 * LibraryView - Displays documents within a selected library
 */

import { useMemo, useCallback } from 'react';
import { FolderOpen, Folder, FileText, Plus } from 'lucide-react';
import { useShortcutVersion } from '../../../hooks';
import { getCurrentBinding } from '../../../lib/keyboard';
import { VirtualizedList } from '../../../components/shared/VirtualizedList';
import { useLibrary, useLibraryDocuments } from '../hooks';
import { DocumentListItem } from './DocumentListItem';
import { DOCUMENT_ITEM_HEIGHT } from '../constants';
import type { DocumentType } from '../types';

interface LibraryViewProps {
  libraryId: string;
  selectedDocumentId: string | null;
  onSelectDocument: (id: string) => void;
  onSelectLibrary: (id: string) => void;
  onNewDocument: () => void;
  isMobile?: boolean;
}

export function LibraryView({
  libraryId,
  selectedDocumentId,
  onSelectDocument,
  onSelectLibrary,
  onNewDocument,
  isMobile = false,
}: LibraryViewProps) {
  const { data: library, isLoading: libraryLoading } = useLibrary(libraryId);
  const { data: documents = [], isLoading: docsLoading, error } = useLibraryDocuments(libraryId);
  useShortcutVersion();

  const isLoading = libraryLoading || docsLoading;

  // Include both documents from API and embedded _documents
  const allDocuments = useMemo(() => [
    ...documents,
    ...(library?._documents || []),
  ].filter((doc, index, self) =>
    index === self.findIndex((d) => d.id === doc.id)
  ), [documents, library?._documents]);

  // Render function for virtualized document list item
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
              <kbd className="ml-1 text-xs bg-blue-800/50 text-white px-1 py-0.5 rounded">{getCurrentBinding('action.createDocument')}</kbd>
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

      {/* Virtualized Documents Area */}
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

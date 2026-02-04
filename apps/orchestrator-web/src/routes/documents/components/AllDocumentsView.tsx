/**
 * AllDocumentsView - Shows all documents with search and filtering
 */

import { useState, useMemo, useCallback } from 'react';
import { FileText, Search, Plus } from 'lucide-react';
import { useShortcutVersion } from '../../../hooks';
import { getCurrentBinding } from '../../../lib/keyboard';
import { VirtualizedList } from '../../../components/shared/VirtualizedList';
import { useAllDocuments as useAllDocumentsPreloaded } from '../../../api/hooks/useAllElements';
import { sortData, createSimpleDocumentSearchFilter } from '../../../hooks/usePaginatedData';
import { DocumentListItem } from './DocumentListItem';
import { DOCUMENT_ITEM_HEIGHT } from '../constants';
import type { DocumentType } from '../types';

interface AllDocumentsViewProps {
  selectedDocumentId: string | null;
  onSelectDocument: (id: string) => void;
  onNewDocument: () => void;
  isMobile?: boolean;
}

export function AllDocumentsView({
  selectedDocumentId,
  onSelectDocument,
  onNewDocument,
  isMobile = false,
}: AllDocumentsViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  useShortcutVersion();

  // Use upfront-loaded data
  const { data: allDocuments, isLoading: isDocumentsLoading } = useAllDocumentsPreloaded();

  // Client-side filtering with instant results
  const filteredDocuments = useMemo((): DocumentType[] => {
    if (!allDocuments) return [];

    // Cast to DocumentType[]
    const docs = allDocuments as unknown as DocumentType[];
    const filterFn = createSimpleDocumentSearchFilter(searchQuery);
    const filtered = filterFn ? docs.filter(filterFn) : docs;

    // Sort by updatedAt descending
    return sortData(filtered, { field: 'updatedAt', direction: 'desc' });
  }, [allDocuments, searchQuery]);

  const totalItems = filteredDocuments.length;
  const isLoading = isDocumentsLoading;

  // Render function for virtualized document list item
  const renderDocumentItem = useCallback((doc: DocumentType) => (
    <div className={`${isMobile ? 'px-3' : 'px-4'}`}>
      <DocumentListItem
        document={doc}
        isSelected={selectedDocumentId === doc.id}
        onClick={onSelectDocument}
        libraryId={null}
        draggable={true}
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
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] rounded-md transition-colors"
              data-testid="new-document-button-all"
            >
              <Plus className="w-4 h-4" />
              Create Document
              <kbd className="ml-1 text-xs bg-[var(--color-primary-700)]/50 text-white px-1 py-0.5 rounded">{getCurrentBinding('action.createDocument')}</kbd>
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

      {/* Virtualized Documents Area */}
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

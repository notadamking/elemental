/**
 * DocumentPickerModal - Modal for searching and selecting documents to embed
 *
 * Features:
 * - Search documents by title
 * - Display document content type and title
 * - Keyboard navigation (arrows, Enter, Escape)
 * - Click to select
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  X,
  Search,
  Loader2,
  FileText,
  FileCode,
  Hash,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';

interface Document {
  id: string;
  title?: string;
  contentType: string;
}

interface DocumentPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (documentId: string) => void;
  excludeIds?: string[];
}

// Content type icon mapping
const contentTypeIcons: Record<string, React.ReactNode> = {
  text: <FileText className="w-4 h-4 text-gray-500" />,
  markdown: <Hash className="w-4 h-4 text-purple-500" />,
  json: <FileCode className="w-4 h-4 text-blue-500" />,
};

// Content type labels
const contentTypeLabels: Record<string, string> = {
  text: 'Text',
  markdown: 'Markdown',
  json: 'JSON',
};

// Content type colors
const contentTypeColors: Record<string, string> = {
  text: 'bg-gray-100 text-gray-700',
  markdown: 'bg-purple-100 text-purple-700',
  json: 'bg-blue-100 text-blue-700',
};

function useDocuments(searchQuery: string) {
  return useQuery<Document[]>({
    queryKey: ['documents', 'search', searchQuery],
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: '50',
      });
      if (searchQuery) {
        params.set('search', searchQuery);
      }
      const response = await fetch(`/api/documents?${params}`);
      if (!response.ok) throw new Error('Failed to fetch documents');
      const data = await response.json();
      // API returns array or { data: Document[], total: number } for paginated results
      return Array.isArray(data) ? data : data.data || [];
    },
  });
}

export function DocumentPickerModal({
  isOpen,
  onClose,
  onSelect,
  excludeIds = [],
}: DocumentPickerModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const { data: documents, isLoading } = useDocuments(searchQuery);

  // Filter out excluded documents
  const filteredDocs = documents?.filter((doc) => !excludeIds.includes(doc.id)) || [];

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [filteredDocs.length, searchQuery]);

  // Focus search input when modal opens
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      // Small delay to ensure modal is rendered
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setSearchQuery('');
      setSelectedIndex(0);
    }
  }, [isOpen]);

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current) {
      const selectedElement = listRef.current.querySelector(
        `[data-index="${selectedIndex}"]`
      );
      selectedElement?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  const handleSelect = useCallback(
    (docId: string) => {
      onSelect(docId);
      onClose();
    },
    [onSelect, onClose]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev >= filteredDocs.length - 1 ? 0 : prev + 1
        );
        return;
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev <= 0 ? filteredDocs.length - 1 : prev - 1
        );
        return;
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        const selectedDoc = filteredDocs[selectedIndex];
        if (selectedDoc) {
          handleSelect(selectedDoc.id);
        }
        return;
      }
    },
    [filteredDocs, selectedIndex, handleSelect, onClose]
  );

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50"
      data-testid="document-picker-modal"
      onKeyDown={handleKeyDown}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        data-testid="document-picker-modal-backdrop"
      />

      {/* Dialog */}
      <div className="absolute left-1/2 top-1/4 -translate-x-1/2 w-full max-w-lg">
        <div className="bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Select Document</h2>
            <button
              onClick={onClose}
              className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
              aria-label="Close"
              data-testid="document-picker-modal-close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Search */}
          <div className="px-4 py-3 border-b border-gray-200">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Search documents..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                data-testid="document-picker-search"
              />
            </div>
          </div>

          {/* Document List */}
          <div
            ref={listRef}
            className="max-h-[300px] overflow-y-auto p-2"
            data-testid="document-picker-list"
          >
            {isLoading ? (
              <div className="flex items-center justify-center py-8 text-gray-500">
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                Loading documents...
              </div>
            ) : filteredDocs.length === 0 ? (
              <div className="py-8 text-center text-gray-500">
                {searchQuery
                  ? 'No documents match your search'
                  : 'No documents available'}
              </div>
            ) : (
              filteredDocs.map((doc, index) => {
                const isSelected = index === selectedIndex;
                const contentType = doc.contentType || 'text';
                const icon = contentTypeIcons[contentType] || contentTypeIcons.text;
                const label = contentTypeLabels[contentType] || 'Text';
                const color = contentTypeColors[contentType] || contentTypeColors.text;
                const title = doc.title || `Document ${doc.id}`;

                return (
                  <button
                    key={doc.id}
                    data-index={index}
                    data-testid={`document-picker-item-${doc.id}`}
                    onClick={() => handleSelect(doc.id)}
                    onMouseEnter={() => setSelectedIndex(index)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-left transition-colors ${
                      isSelected
                        ? 'bg-blue-50 text-blue-700'
                        : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    {/* Content type icon */}
                    <span className="flex-shrink-0">{icon}</span>

                    {/* Title */}
                    <span className="flex-1 truncate font-medium">{title}</span>

                    {/* Content type badge */}
                    <span
                      className={`flex-shrink-0 px-2 py-0.5 text-xs font-medium rounded ${color}`}
                    >
                      {label}
                    </span>
                  </button>
                );
              })
            )}
          </div>

          {/* Footer with keyboard hints */}
          <div className="px-4 py-2 border-t border-gray-200 bg-gray-50 flex items-center justify-between text-xs text-gray-500">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <ChevronUp className="w-3 h-3" />
                <ChevronDown className="w-3 h-3" />
                Navigate
              </span>
              <span>↵ Select</span>
              <span>Esc Close</span>
            </div>
            {filteredDocs.length > 0 && (
              <span>
                {filteredDocs.length} document{filteredDocs.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default DocumentPickerModal;

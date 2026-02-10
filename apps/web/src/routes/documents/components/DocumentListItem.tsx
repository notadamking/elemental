/**
 * DocumentListItem - Single document in a list
 */

import { FileText } from 'lucide-react';
import { getCategoryDisplayLabel } from '@elemental/ui/documents';
import type { DocumentType } from '../types';

interface DocumentListItemProps {
  document: DocumentType;
  isSelected?: boolean;
  onClick?: (id: string) => void;
}

export function DocumentListItem({ document, isSelected, onClick }: DocumentListItemProps) {
  const formattedDate = new Date(document.updatedAt).toLocaleDateString();
  const title = document.title || `Document ${document.id}`;
  const documentIcon = document.metadata?.icon;
  const categoryLabel = getCategoryDisplayLabel(document.category, document.metadata);

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
        <div className="flex items-center gap-2">
          <p
            data-testid={`document-title-${document.id}`}
            className={`font-medium truncate ${isSelected ? 'text-blue-900' : 'text-gray-900'}`}
          >
            {title}
          </p>
          {/* Category Badge */}
          <span
            data-testid={`document-category-${document.id}`}
            className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 flex-shrink-0"
          >
            {categoryLabel}
          </span>
        </div>
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

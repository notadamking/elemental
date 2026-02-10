/**
 * @elemental/ui Documents Module
 *
 * Shared types, utilities, and components for document sorting and filtering.
 * Use this module to build document list views in any Elemental app.
 *
 * Usage:
 * - Import everything: import * as Documents from '@elemental/ui/documents'
 * - Import types: import type { DocumentSortField, DocumentFilterConfig } from '@elemental/ui/documents'
 * - Import utils: import { getStoredSort, createDocumentFilter } from '@elemental/ui/documents'
 * - Import components: import { DocumentSortDropdown, DocumentFilterBar } from '@elemental/ui/documents'
 */

// Types
export {
  DocumentCategory,
} from './types';

export type {
  DocumentSortField,
  SortDirection,
  DocumentSortOption,
  ContentTypeFilterOption,
  DocumentFilterConfig,
  DocumentCategory as DocumentCategoryType,
} from './types';

// Constants
export {
  DOCUMENT_SORT_OPTIONS,
  CONTENT_TYPE_FILTER_OPTIONS,
  DOCUMENT_STORAGE_KEYS,
  EMPTY_DOCUMENT_FILTER,
  DOCUMENT_CATEGORY_LABELS,
} from './constants';

// Utilities
export {
  getStoredSort,
  setStoredSort,
  createDocumentFilter,
  getActiveFilterCount,
  hasActiveFilters,
  getDefaultDirection,
  getCategoryDisplayLabel,
} from './utils';

// Components
export * from './components';

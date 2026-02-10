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
export type {
  DocumentSortField,
  SortDirection,
  DocumentSortOption,
  ContentTypeFilterOption,
  DocumentFilterConfig,
} from './types';

// Constants
export {
  DOCUMENT_SORT_OPTIONS,
  CONTENT_TYPE_FILTER_OPTIONS,
  DOCUMENT_STORAGE_KEYS,
  EMPTY_DOCUMENT_FILTER,
  DocumentCategory,
  DOCUMENT_CATEGORY_LABELS,
} from './constants';
export type { DocumentCategoryValue } from './constants';

// Utilities
export {
  getStoredSort,
  setStoredSort,
  createDocumentFilter,
  getActiveFilterCount,
  hasActiveFilters,
  getDefaultDirection,
  getCategoryDisplayLabel,
  isValidCategory,
} from './utils';

// Components
export * from './components';

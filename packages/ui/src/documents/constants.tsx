/**
 * @elemental/ui Documents Constants
 *
 * Sort options, filter options, and storage keys for document components.
 */

import type { DocumentSortOption, ContentTypeFilterOption, CategoryFilterOption, DocumentFilterConfig } from './types';

// ============================================================================
// Sort Options
// ============================================================================

export const DOCUMENT_SORT_OPTIONS: DocumentSortOption[] = [
  { value: 'updatedAt', label: 'Updated', defaultDirection: 'desc' },
  { value: 'createdAt', label: 'Created', defaultDirection: 'desc' },
  { value: 'title', label: 'Title', defaultDirection: 'asc' },
  { value: 'contentType', label: 'Type', defaultDirection: 'asc' },
];

// ============================================================================
// Content Type Filter Options
// ============================================================================

export const CONTENT_TYPE_FILTER_OPTIONS: ContentTypeFilterOption[] = [
  { value: 'text', label: 'Text', color: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200' },
  { value: 'markdown', label: 'Markdown', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300' },
  { value: 'json', label: 'JSON', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300' },
];

// ============================================================================
// Category Filter Options
// ============================================================================

export const CATEGORY_FILTER_OPTIONS: CategoryFilterOption[] = [
  // Knowledge categories
  { value: 'spec', label: 'Spec', color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300' },
  { value: 'prd', label: 'PRD', color: 'bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300' },
  { value: 'decision-log', label: 'Decision Log', color: 'bg-pink-100 text-pink-700 dark:bg-pink-900/50 dark:text-pink-300' },
  { value: 'changelog', label: 'Changelog', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300' },
  { value: 'tutorial', label: 'Tutorial', color: 'bg-teal-100 text-teal-700 dark:bg-teal-900/50 dark:text-teal-300' },
  { value: 'how-to', label: 'How-To', color: 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300' },
  { value: 'explanation', label: 'Explanation', color: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/50 dark:text-cyan-300' },
  { value: 'reference', label: 'Reference', color: 'bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300' },
  { value: 'runbook', label: 'Runbook', color: 'bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300' },
  { value: 'meeting-notes', label: 'Meeting Notes', color: 'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/50 dark:text-fuchsia-300' },
  { value: 'post-mortem', label: 'Post-Mortem', color: 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300' },
  // System categories
  { value: 'task-description', label: 'Task Description', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300' },
  { value: 'message-content', label: 'Message Content', color: 'bg-lime-100 text-lime-700 dark:bg-lime-900/50 dark:text-lime-300' },
  // Fallback
  { value: 'other', label: 'Other', color: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300' },
];

// ============================================================================
// Storage Keys
// ============================================================================

export const DOCUMENT_STORAGE_KEYS = {
  sortField: 'documents.sortBy',
  sortDirection: 'documents.sortDir',
} as const;

// ============================================================================
// Empty Filter Config
// ============================================================================

export const EMPTY_DOCUMENT_FILTER: DocumentFilterConfig = {
  contentTypes: [],
  tags: [],
  categories: [],
};

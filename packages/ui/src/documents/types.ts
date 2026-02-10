/**
 * @elemental/ui Documents Types
 *
 * Type definitions for document sorting and filtering.
 */

export type DocumentSortField = 'updatedAt' | 'createdAt' | 'title' | 'contentType';
export type SortDirection = 'asc' | 'desc';

export interface DocumentSortOption {
  value: DocumentSortField;
  label: string;
  defaultDirection: SortDirection;
}

export interface ContentTypeFilterOption {
  value: string;
  label: string;
  color: string;
}

export interface DocumentFilterConfig {
  contentTypes: string[];  // Multi-select
  tags: string[];          // Multi-select
}

/**
 * Document Category Enum
 * Local copy to avoid dependency on @elemental/core in frontend bundle
 */
export const DocumentCategory = {
  SPEC: 'spec',
  PRD: 'prd',
  DECISION_LOG: 'decision-log',
  CHANGELOG: 'changelog',
  TUTORIAL: 'tutorial',
  HOW_TO: 'how-to',
  EXPLANATION: 'explanation',
  REFERENCE: 'reference',
  RUNBOOK: 'runbook',
  MEETING_NOTES: 'meeting-notes',
  POST_MORTEM: 'post-mortem',
  TASK_DESCRIPTION: 'task-description',
  MESSAGE_CONTENT: 'message-content',
  OTHER: 'other',
} as const;

export type DocumentCategory = (typeof DocumentCategory)[keyof typeof DocumentCategory];

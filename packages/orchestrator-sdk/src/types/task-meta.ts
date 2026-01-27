/**
 * Orchestrator Task Metadata Types
 *
 * This module defines the metadata structure for tasks in the orchestration system.
 * Tasks gain additional metadata when managed by the orchestrator to track:
 * - Git branch association
 * - Worktree location
 * - Claude Code session ID for resumption
 *
 * This metadata is stored in the task's `metadata` field alongside any existing
 * task metadata.
 */

import type { EntityId, ElementId, Timestamp } from '@elemental/core';

// ============================================================================
// Orchestrator Task Metadata
// ============================================================================

/**
 * Orchestrator-specific metadata attached to tasks managed by the orchestration system.
 *
 * This is stored in the task's `metadata` field under the `orchestrator` key:
 * ```typescript
 * task.metadata = {
 *   ...existingMetadata,
 *   orchestrator: OrchestratorTaskMeta
 * }
 * ```
 */
export interface OrchestratorTaskMeta {
  /** Git branch created for this task (e.g., "agent/alice/task-123-implement-feature") */
  readonly branch?: string;

  /** Path to the worktree where the agent is working (e.g., ".worktrees/alice-implement-feature/") */
  readonly worktree?: string;

  /** Claude Code session ID for this task, enabling session resumption */
  readonly sessionId?: string;

  /** Entity ID of the agent assigned to this task */
  readonly assignedAgent?: EntityId;

  /** When the agent started working on this task */
  readonly startedAt?: Timestamp;

  /** When the agent completed this task (before merge) */
  readonly completedAt?: Timestamp;

  /** When the branch was merged */
  readonly mergedAt?: Timestamp;

  /** Merge status tracking */
  readonly mergeStatus?: MergeStatus;

  /** If merge failed, the reason */
  readonly mergeFailureReason?: string;

  /** Number of times tests have been run on this branch */
  readonly testRunCount?: number;

  /** Last test result */
  readonly lastTestResult?: TestResult;
}

// ============================================================================
// Merge Status Types
// ============================================================================

/**
 * Status of the merge process for a completed task's branch
 */
export type MergeStatus =
  | 'pending'      // Task completed, awaiting merge
  | 'testing'      // Steward is running tests on the branch
  | 'merging'      // Tests passed, merge in progress
  | 'merged'       // Successfully merged
  | 'conflict'     // Merge conflict detected
  | 'test_failed'  // Tests failed, needs attention
  | 'failed';      // Merge failed for other reason

/**
 * All valid merge status values
 */
export const MergeStatusValues = [
  'pending',
  'testing',
  'merging',
  'merged',
  'conflict',
  'test_failed',
  'failed',
] as const;

/**
 * Type guard to check if a value is a valid MergeStatus
 */
export function isMergeStatus(value: unknown): value is MergeStatus {
  return typeof value === 'string' && MergeStatusValues.includes(value as MergeStatus);
}

// ============================================================================
// Test Result Types
// ============================================================================

/**
 * Result of running tests on a task's branch
 */
export interface TestResult {
  /** Whether tests passed */
  readonly passed: boolean;

  /** Total number of tests run */
  readonly totalTests?: number;

  /** Number of tests that passed */
  readonly passedTests?: number;

  /** Number of tests that failed */
  readonly failedTests?: number;

  /** Number of tests that were skipped */
  readonly skippedTests?: number;

  /** When the test run completed */
  readonly completedAt: Timestamp;

  /** Duration of the test run in milliseconds */
  readonly durationMs?: number;

  /** Error message if tests failed to run */
  readonly errorMessage?: string;
}

/**
 * Type guard to check if a value is a valid TestResult
 */
export function isTestResult(value: unknown): value is TestResult {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.passed === 'boolean' &&
    typeof obj.completedAt === 'string'
  );
}

// ============================================================================
// Orchestrator Task Metadata Utilities
// ============================================================================

/**
 * Extracts orchestrator metadata from a task's metadata field
 */
export function getOrchestratorTaskMeta(
  taskMetadata: Record<string, unknown> | undefined
): OrchestratorTaskMeta | undefined {
  if (!taskMetadata || typeof taskMetadata.orchestrator !== 'object') {
    return undefined;
  }
  return taskMetadata.orchestrator as OrchestratorTaskMeta;
}

/**
 * Sets orchestrator metadata on a task's metadata field
 */
export function setOrchestratorTaskMeta(
  existingMetadata: Record<string, unknown> | undefined,
  orchestratorMeta: OrchestratorTaskMeta
): Record<string, unknown> {
  return {
    ...existingMetadata,
    orchestrator: orchestratorMeta,
  };
}

/**
 * Updates orchestrator metadata on a task's metadata field
 */
export function updateOrchestratorTaskMeta(
  existingMetadata: Record<string, unknown> | undefined,
  updates: Partial<OrchestratorTaskMeta>
): Record<string, unknown> {
  const existing = getOrchestratorTaskMeta(existingMetadata) ?? {};
  return setOrchestratorTaskMeta(existingMetadata, {
    ...existing,
    ...updates,
  });
}

/**
 * Type guard to validate OrchestratorTaskMeta structure
 */
export function isOrchestratorTaskMeta(value: unknown): value is OrchestratorTaskMeta {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const obj = value as Record<string, unknown>;

  // All fields are optional, so we just check types if present
  if (obj.branch !== undefined && typeof obj.branch !== 'string') return false;
  if (obj.worktree !== undefined && typeof obj.worktree !== 'string') return false;
  if (obj.sessionId !== undefined && typeof obj.sessionId !== 'string') return false;
  if (obj.assignedAgent !== undefined && typeof obj.assignedAgent !== 'string') return false;
  if (obj.mergeStatus !== undefined && !isMergeStatus(obj.mergeStatus)) return false;
  if (obj.lastTestResult !== undefined && !isTestResult(obj.lastTestResult)) return false;

  return true;
}

// ============================================================================
// Branch and Worktree Naming Utilities
// ============================================================================

/**
 * Generates a branch name for an agent working on a task
 *
 * Format: agent/{worker-name}/{task-id}-{slug}
 *
 * @param workerName - The agent's name
 * @param taskId - The task ID
 * @param slug - URL-friendly slug derived from task title (optional)
 */
export function generateBranchName(
  workerName: string,
  taskId: ElementId,
  slug?: string
): string {
  const safeName = workerName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  const safeTaskId = taskId.toLowerCase();
  if (slug) {
    const safeSlug = slug.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 30);
    return `agent/${safeName}/${safeTaskId}-${safeSlug}`;
  }
  return `agent/${safeName}/${safeTaskId}`;
}

/**
 * Generates a worktree path for an agent working on a task
 *
 * Format: .worktrees/{worker-name}-{task-slug}/
 *
 * @param workerName - The agent's name
 * @param slug - URL-friendly slug derived from task title (optional)
 */
export function generateWorktreePath(
  workerName: string,
  slug?: string
): string {
  const safeName = workerName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  if (slug) {
    const safeSlug = slug.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 30);
    return `.worktrees/${safeName}-${safeSlug}`;
  }
  return `.worktrees/${safeName}`;
}

/**
 * Creates a URL-friendly slug from a task title
 */
export function createSlugFromTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')  // Remove special characters
    .replace(/\s+/g, '-')          // Replace spaces with hyphens
    .replace(/-+/g, '-')           // Collapse multiple hyphens
    .slice(0, 30)                  // Limit length
    .replace(/^-|-$/g, '');        // Trim leading/trailing hyphens
}

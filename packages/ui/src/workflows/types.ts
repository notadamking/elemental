/**
 * @elemental/ui Workflows Module Types
 *
 * Consolidated type definitions for workflow and playbook entities.
 */

// Local type aliases (avoiding dependency on @elemental/core in the frontend bundle)
export type EntityId = string;
export type Timestamp = number;
export type ElementId = string;

// ============================================================================
// Task Types (used in workflow context)
// ============================================================================

export type TaskStatus = 'open' | 'in_progress' | 'blocked' | 'deferred' | 'closed' | 'tombstone';
export type Priority = 1 | 2 | 3 | 4 | 5;
export type Complexity = 1 | 2 | 3 | 4 | 5;
export type TaskTypeValue = 'bug' | 'feature' | 'task' | 'chore';

/**
 * Simplified task entity for workflow context
 */
export interface WorkflowTask {
  id: ElementId;
  type: 'task';
  title: string;
  description?: string;
  status: TaskStatus;
  priority: Priority;
  complexity: Complexity;
  taskType: TaskTypeValue;
  assignee?: EntityId;
  ephemeral: boolean;
  createdAt: string;
  updatedAt: string;
  tags: string[];
}

// ============================================================================
// Workflow Types
// ============================================================================

export type WorkflowStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
export type WorkflowFilterStatus = 'all' | 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'active' | 'terminal';

/**
 * Workflow entity as returned by the API
 */
export interface Workflow {
  id: ElementId;
  type: 'workflow';
  title: string;
  descriptionRef?: string;
  status: WorkflowStatus;
  playbookId?: string;
  ephemeral: boolean;
  variables: Record<string, unknown>;
  startedAt?: string;
  finishedAt?: string;
  failureReason?: string;
  cancelReason?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: EntityId;
  tags: string[];
  metadata?: Record<string, unknown>;
}

/**
 * Progress metrics for a workflow
 * Supports both orchestrator format (numeric fields) and web app format (statusCounts)
 */
export interface WorkflowProgress {
  total: number;
  completed: number;
  inProgress: number;
  blocked: number;
  open: number;
  percentage: number;
  // Extended fields from web app format
  totalTasks?: number;
  statusCounts?: Record<string, number>;
  completionPercentage?: number;
  readyTasks?: number;
  blockedTasks?: number;
  workflowId?: string;
}

/**
 * Workflow with hydrated progress data
 */
export interface HydratedWorkflow extends Workflow {
  _progress?: WorkflowProgress;
}

/**
 * Internal dependency between workflow tasks
 */
export interface WorkflowDependency {
  sourceId: ElementId;
  targetId: ElementId;
  type: string;
}

/**
 * Filter options for workflows
 */
export interface WorkflowFilter {
  status?: WorkflowFilterStatus;
  playbookId?: string;
  ephemeral?: boolean;
  limit?: number;
}

// ============================================================================
// Playbook Types
// ============================================================================

export type VariableType = 'string' | 'number' | 'boolean';

/**
 * Variable definition in a playbook
 */
export interface PlaybookVariable {
  name: string;
  description?: string;
  type: VariableType;
  required: boolean;
  default?: unknown;
  enum?: unknown[];
}

/**
 * Step definition in a playbook
 */
export interface PlaybookStep {
  id: string;
  title: string;
  description?: string;
  taskType?: TaskTypeValue;
  priority?: Priority;
  complexity?: Complexity;
  assignee?: string;
  dependsOn?: string[];
  condition?: string;
}

/**
 * Playbook entity as returned by the API
 */
export interface Playbook {
  id: ElementId;
  type: 'playbook';
  name: string;
  title: string;
  descriptionRef?: string;
  version: number;
  steps: PlaybookStep[];
  variables: PlaybookVariable[];
  extends?: string[];
  createdAt: string;
  updatedAt: string;
  createdBy: EntityId;
  tags: string[];
  metadata?: Record<string, unknown>;
}

/**
 * Filter options for playbooks
 */
export interface PlaybookFilter {
  name?: string;
  limit?: number;
}

// ============================================================================
// API Response Types
// ============================================================================

export interface WorkflowsResponse {
  workflows: Workflow[];
  total?: number;
}

export interface WorkflowResponse {
  workflow: Workflow;
}

export interface WorkflowTasksResponse {
  tasks: WorkflowTask[];
  total: number;
  progress: WorkflowProgress;
  dependencies: WorkflowDependency[];
}

export interface PlaybooksResponse {
  playbooks: Playbook[];
  total?: number;
}

export interface PlaybookResponse {
  playbook: Playbook;
}

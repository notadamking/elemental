/**
 * Types for the Workflows page
 * Page-specific types for workflow management
 */

export interface WorkflowType {
  id: string;
  type: 'workflow';
  title: string;
  status: WorkflowStatus;
  playbookId?: string;
  ephemeral: boolean;
  variables: Record<string, unknown>;
  descriptionRef?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  tags: string[];
  startedAt?: string;
  finishedAt?: string;
  failureReason?: string;
  cancelReason?: string;
}

export type WorkflowStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface WorkflowProgress {
  workflowId: string;
  totalTasks: number;
  statusCounts: Record<string, number>;
  completionPercentage: number;
  readyTasks: number;
  blockedTasks: number;
}

export interface HydratedWorkflow extends WorkflowType {
  _progress?: WorkflowProgress;
}

export interface TaskType {
  id: string;
  type: 'task';
  title: string;
  status: string;
  priority: number;
  assignee?: string;
  createdAt: string;
  updatedAt: string;
  tags: string[];
}

export interface StatusTransition {
  status: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}

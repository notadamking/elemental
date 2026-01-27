/**
 * API Types for Orchestrator Web
 *
 * Type definitions for API responses and data structures.
 * These mirror the types from @elemental/orchestrator-sdk but are kept
 * separate to avoid bundling the full SDK in the frontend.
 */

// Local type aliases (avoiding dependency on @elemental/core in the frontend bundle)
export type EntityId = string;
export type ChannelId = string;
export type Timestamp = number;
export type ElementId = string;

// ============================================================================
// Agent Types
// ============================================================================

export type AgentRole = 'director' | 'steward' | 'worker';
export type WorkerMode = 'ephemeral' | 'persistent';
export type StewardFocus = 'merge' | 'health' | 'reminder' | 'ops';
/** Agent metadata session status (simpler set) */
export type AgentSessionStatus = 'idle' | 'running' | 'suspended' | 'terminated';
/** Full session status including transitional states */
export type SessionStatus = 'starting' | 'running' | 'suspended' | 'terminating' | 'terminated';

export interface AgentCapabilities {
  skills: string[];
  languages: string[];
  maxConcurrentTasks: number;
}

export interface CronTrigger {
  type: 'cron';
  schedule: string;
}

export interface EventTrigger {
  type: 'event';
  event: string;
  condition?: string;
}

export type StewardTrigger = CronTrigger | EventTrigger;

export interface BaseAgentMetadata {
  agentRole: AgentRole;
  channelId?: ChannelId;
  sessionId?: string;
  worktree?: string;
  sessionStatus?: SessionStatus;
  lastActivityAt?: Timestamp;
  capabilities?: AgentCapabilities;
  roleDefinitionRef?: ElementId;
}

export interface DirectorMetadata extends BaseAgentMetadata {
  agentRole: 'director';
}

export interface WorkerMetadata extends BaseAgentMetadata {
  agentRole: 'worker';
  workerMode: WorkerMode;
  branch?: string;
}

export interface StewardMetadata extends BaseAgentMetadata {
  agentRole: 'steward';
  stewardFocus: StewardFocus;
  triggers?: StewardTrigger[];
  lastExecutedAt?: Timestamp;
  nextScheduledAt?: Timestamp;
}

export type AgentMetadata = DirectorMetadata | WorkerMetadata | StewardMetadata;

/**
 * Agent entity as returned by the API
 */
export interface Agent {
  id: EntityId;
  name: string;
  type: 'entity';
  entityType: string;
  tags?: string[];
  status: string;
  createdAt: Timestamp;
  modifiedAt: Timestamp;
  metadata?: {
    agent?: AgentMetadata;
    [key: string]: unknown;
  };
}

// ============================================================================
// Session Types
// ============================================================================

export interface SessionRecord {
  id: string;
  claudeSessionId?: string;
  agentId: EntityId;
  agentRole: AgentRole;
  workerMode?: WorkerMode;
  pid?: number;
  status: 'starting' | 'running' | 'suspended' | 'terminating' | 'terminated';
  workingDirectory?: string;
  worktree?: string;
  createdAt: Timestamp;
  startedAt?: Timestamp;
  lastActivityAt?: Timestamp;
  endedAt?: Timestamp;
  terminationReason?: string;
}

// ============================================================================
// Worktree Types
// ============================================================================

export interface WorktreeInfo {
  path: string;
  relativePath: string;
  branch: string;
  head: string;
  isMain: boolean;
  state: 'creating' | 'active' | 'suspended' | 'merging' | 'cleaning' | 'archived';
  agentName?: string;
  taskId?: ElementId;
  createdAt?: Timestamp;
}

// ============================================================================
// API Response Types
// ============================================================================

export interface ApiError {
  code: string;
  message: string;
}

export interface AgentsResponse {
  agents: Agent[];
}

export interface AgentResponse {
  agent: Agent;
}

export interface AgentStatusResponse {
  agentId: EntityId;
  hasActiveSession: boolean;
  activeSession: SessionRecord | null;
  recentHistory: SessionRecord[];
}

export interface SessionsResponse {
  sessions: SessionRecord[];
}

export interface WorktreesResponse {
  worktrees: WorktreeInfo[];
}

// ============================================================================
// Create Agent Input Types
// ============================================================================

export interface CreateAgentInput {
  name: string;
  role: AgentRole;
  tags?: string[];
  capabilities?: Partial<AgentCapabilities>;
  // Worker-specific
  workerMode?: WorkerMode;
  // Steward-specific
  stewardFocus?: StewardFocus;
  triggers?: StewardTrigger[];
}

// ============================================================================
// Task Types
// ============================================================================

export type TaskStatus = 'open' | 'in_progress' | 'blocked' | 'deferred' | 'closed' | 'tombstone';
export type Priority = 1 | 2 | 3 | 4 | 5;
export type Complexity = 1 | 2 | 3 | 4 | 5;
export type TaskTypeValue = 'bug' | 'feature' | 'task' | 'chore';
export type MergeStatus = 'pending' | 'testing' | 'merging' | 'merged' | 'conflict' | 'test_failed' | 'failed';

/**
 * Orchestrator-specific metadata attached to tasks
 */
export interface OrchestratorTaskMeta {
  branch?: string;
  worktree?: string;
  sessionId?: string;
  assignedAgent?: EntityId;
  startedAt?: string;
  completedAt?: string;
  mergedAt?: string;
  mergeStatus?: MergeStatus;
  mergeFailureReason?: string;
  testRunCount?: number;
  lastTestResult?: TestResult;
}

export interface TestResult {
  passed: boolean;
  totalTests?: number;
  passedTests?: number;
  failedTests?: number;
  skippedTests?: number;
  completedAt: string;
  durationMs?: number;
  errorMessage?: string;
}

/**
 * Task entity as returned by the API
 */
export interface Task {
  id: ElementId;
  type: 'task';
  title: string;
  descriptionRef?: string;
  designRef?: string;
  acceptanceCriteria?: string;
  status: TaskStatus;
  priority: Priority;
  complexity: Complexity;
  taskType: TaskTypeValue;
  closeReason?: string;
  assignee?: EntityId;
  owner?: EntityId;
  deadline?: string;
  scheduledFor?: string;
  closedAt?: string;
  ephemeral: boolean;
  externalRef?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: EntityId;
  tags: string[];
  metadata?: {
    orchestrator?: OrchestratorTaskMeta;
    [key: string]: unknown;
  };
}

// ============================================================================
// Task API Response Types
// ============================================================================

export interface TasksResponse {
  tasks: Task[];
  total?: number;
  page?: number;
  limit?: number;
}

export interface TaskResponse {
  task: Task;
}

// Filter for fetching tasks
export type TaskFilterStatus = 'all' | 'open' | 'in_progress' | 'blocked' | 'deferred' | 'closed' | 'done' | 'awaiting_merge';
export type TaskAssignmentFilter = 'all' | 'unassigned' | 'assigned';

export interface TaskFilter {
  status?: TaskFilterStatus;
  assignment?: TaskAssignmentFilter;
  assignee?: EntityId;
  priority?: Priority;
  taskType?: TaskTypeValue;
  ephemeral?: boolean;
  page?: number;
  limit?: number;
}

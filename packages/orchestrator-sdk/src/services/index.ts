/**
 * Orchestrator Services
 *
 * This module exports orchestration services:
 * - CapabilityService (TB-O6a) - Capability-based agent matching and task routing
 * - AgentRegistry (TB-O7, TB-O7a) - Agent registration, management, and channel setup
 * - RoleDefinitionService (TB-O7b) - Agent role definition storage and management
 * - TaskAssignmentService (TB-O8) - Task assignment with orchestrator metadata
 * - DispatchService (TB-O8a) - Task dispatch with assignment + notification
 * - StewardScheduler (TB-O23) - TODO
 */

// Agent registry (TB-O7, TB-O7a)
// Note: AgentEntity, isAgentEntity, and getAgentMetadata are exported from api/index.js
// to avoid duplicate export conflicts
export {
  // Types
  type RegisterAgentInput,
  type AgentRegistry,
  // Implementation
  AgentRegistryImpl,
  // Factory
  createAgentRegistry,
  // Agent channel utilities (TB-O7a)
  generateAgentChannelName,
  parseAgentChannelName,
} from './agent-registry.js';

// Role definition service (TB-O7b)
export {
  // Types
  type RoleDefinitionService,
  // Implementation
  RoleDefinitionServiceImpl,
  // Factory
  createRoleDefinitionService,
} from './role-definition-service.js';

// Task assignment service (TB-O8)
export {
  // Types
  type AssignTaskOptions,
  type CompleteTaskOptions,
  type TaskAssignment,
  type AssignmentFilter,
  type AssignmentStatus,
  type AgentWorkloadSummary,
  type TaskAssignmentService,
  // Constants
  AssignmentStatusValues,
  // Implementation
  TaskAssignmentServiceImpl,
  // Factory
  createTaskAssignmentService,
} from './task-assignment-service.js';

// Capability service (TB-O6a)
export {
  // Task capability metadata
  getTaskCapabilityRequirements,
  setTaskCapabilityRequirements,
  // Capability matching
  matchAgentToTaskRequirements,
  matchAgentToTask,
  // Agent filtering and ranking
  type FindAgentsForTaskOptions,
  type AgentMatchEntry,
  findAgentsForTask,
  findAgentsForRequirements,
  getBestAgentForTask,
  // Capability management
  getAgentCapabilities,
  agentHasSkill,
  agentHasLanguage,
  agentHasAllSkills,
  agentHasAllLanguages,
  agentHasCapacity,
  // Validation
  validateAgentCapabilities,
  // Re-exports
  createAgentCapabilities,
  normalizeCapabilityString,
  normalizeCapabilityArray,
  DefaultAgentCapabilities,
  DefaultTaskCapabilityRequirements,
} from './capability-service.js';

// Dispatch service (TB-O8a)
export {
  // Types
  type DispatchOptions,
  type DispatchResult,
  type SmartDispatchOptions,
  type SmartDispatchCandidatesResult,
  type DispatchMessageType,
  type DispatchNotificationMetadata,
  type DispatchService,
  // Implementation
  DispatchServiceImpl,
  // Factory
  createDispatchService,
} from './dispatch-service.js';

// Worker task service (TB-O20)
export {
  // Types
  type StartWorkerOnTaskOptions,
  type StartWorkerOnTaskResult,
  type CompleteTaskOptions as WorkerCompleteTaskOptions,
  type CompleteTaskResult,
  type TaskContext,
  type WorkerTaskService,
  // Implementation
  WorkerTaskServiceImpl,
  // Factory
  createWorkerTaskService,
} from './worker-task-service.js';

// Merge steward service (TB-O21)
export {
  // Types
  type MergeStewardConfig,
  type ProcessTaskOptions,
  type MergeProcessResult,
  type TestRunResult,
  type MergeAttemptResult,
  type CreateFixTaskOptions,
  type BatchProcessResult,
  type MergeStewardService,
  // Implementation
  MergeStewardServiceImpl,
  // Factory
  createMergeStewardService,
} from './merge-steward-service.js';

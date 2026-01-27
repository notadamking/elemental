/**
 * Orchestrator SDK Types
 *
 * This module exports all type definitions for the Elemental Orchestrator SDK.
 */

// Agent types
export {
  // Capability types
  type AgentCapabilities,
  DefaultAgentCapabilities,
  type TaskCapabilityRequirements,
  DefaultTaskCapabilityRequirements,
  type CapabilityMatchResult,
  createAgentCapabilities,
  isAgentCapabilities,
  isTaskCapabilityRequirements,
  normalizeCapabilityString,
  normalizeCapabilityArray,
  // Role types
  type AgentRole,
  AgentRoleValues,
  isAgentRole,
  // Worker mode types
  type WorkerMode,
  WorkerModeValues,
  isWorkerMode,
  // Steward focus types
  type StewardFocus,
  StewardFocusValues,
  isStewardFocus,
  // Steward trigger types
  type CronTrigger,
  type EventTrigger,
  type StewardTrigger,
  isCronTrigger,
  isEventTrigger,
  isStewardTrigger,
  // Agent metadata types
  type BaseAgentMetadata,
  type DirectorMetadata,
  type WorkerMetadata,
  type StewardMetadata,
  type AgentMetadata,
  isDirectorMetadata,
  isWorkerMetadata,
  isStewardMetadata,
  // Registration input types
  type RegisterDirectorInput,
  type RegisterWorkerInput,
  type RegisterStewardInput,
  // Query types
  type AgentFilter,
  // Validation
  validateAgentMetadata,
} from './agent.js';

// Task metadata types
export {
  type OrchestratorTaskMeta,
  type MergeStatus,
  MergeStatusValues,
  isMergeStatus,
  type TestResult,
  isTestResult,
  // Utilities
  getOrchestratorTaskMeta,
  setOrchestratorTaskMeta,
  updateOrchestratorTaskMeta,
  isOrchestratorTaskMeta,
  // Naming utilities
  generateBranchName,
  generateWorktreePath,
  createSlugFromTitle,
} from './task-meta.js';

// Role definition types
export {
  // Behavior types
  type AgentBehaviors,
  isAgentBehaviors,
  // Role definition types
  type BaseRoleDefinition,
  type DirectorRoleDefinition,
  type WorkerRoleDefinition,
  type StewardRoleDefinition,
  type AgentRoleDefinition,
  type StoredRoleDefinition,
  // Type guards
  isDirectorRoleDefinition,
  isWorkerRoleDefinition,
  isStewardRoleDefinition,
  isAgentRoleDefinition,
  // Input types
  type CreateRoleDefinitionInput,
  type UpdateRoleDefinitionInput,
  // Query types
  type RoleDefinitionFilter,
  // Constants and utilities
  ROLE_DEFINITION_TAGS,
  generateRoleDefinitionTags,
} from './role-definition.js';

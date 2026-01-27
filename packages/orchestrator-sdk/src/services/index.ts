/**
 * Orchestrator Services
 *
 * This module exports orchestration services:
 * - CapabilityService (TB-O6a) - Capability-based agent matching and task routing
 * - AgentRegistry (TB-O7, TB-O7a) - Agent registration, management, and channel setup
 * - RoleDefinitionService (TB-O7b) - Agent role definition storage and management
 * - TaskAssignmentService (TB-O8) - TODO
 * - DispatchService (TB-O8a) - TODO
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

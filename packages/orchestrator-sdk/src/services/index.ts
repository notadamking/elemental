/**
 * Orchestrator Services
 *
 * This module exports orchestration services:
 * - CapabilityService (TB-O6a) - Capability-based agent matching and task routing
 * - AgentRegistry (TB-O7) - TODO
 * - TaskAssignmentService (TB-O8) - TODO
 * - DispatchService (TB-O8a) - TODO
 * - StewardScheduler (TB-O23) - TODO
 */

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

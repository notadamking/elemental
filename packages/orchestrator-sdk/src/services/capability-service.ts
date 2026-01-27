/**
 * Capability Service
 *
 * This service provides capability-based agent matching and task routing.
 * It enables intelligent dispatch of tasks to agents with the appropriate
 * skills and languages.
 *
 * Key features:
 * - Match agents against task requirements
 * - Score and rank agents for task suitability
 * - Validate agent capabilities
 * - Filter agents by capability requirements
 */

import type { Task } from '@elemental/core';
import type {
  AgentCapabilities,
  TaskCapabilityRequirements,
  CapabilityMatchResult,
} from '../types/index.js';
import {
  DefaultAgentCapabilities,
  DefaultTaskCapabilityRequirements,
  normalizeCapabilityArray,
  normalizeCapabilityString,
  createAgentCapabilities,
  isAgentCapabilities,
} from '../types/index.js';
import type { AgentEntity } from '../api/orchestrator-api.js';
import { getAgentMetadata } from '../api/orchestrator-api.js';

// ============================================================================
// Task Capability Metadata
// ============================================================================

/**
 * Key used to store capability requirements in Task.metadata
 */
const TASK_CAPABILITY_KEY = 'capabilityRequirements';

/**
 * Gets capability requirements from a task's metadata
 */
export function getTaskCapabilityRequirements(
  task: Task
): TaskCapabilityRequirements {
  if (!task.metadata || typeof task.metadata !== 'object') {
    return DefaultTaskCapabilityRequirements;
  }
  const requirements = (task.metadata as Record<string, unknown>)[TASK_CAPABILITY_KEY];
  if (!requirements || typeof requirements !== 'object') {
    return DefaultTaskCapabilityRequirements;
  }
  return requirements as TaskCapabilityRequirements;
}

/**
 * Sets capability requirements on a task's metadata
 */
export function setTaskCapabilityRequirements(
  metadata: Record<string, unknown> | undefined,
  requirements: TaskCapabilityRequirements
): Record<string, unknown> {
  return {
    ...(metadata ?? {}),
    [TASK_CAPABILITY_KEY]: requirements,
  };
}

// ============================================================================
// Capability Matching
// ============================================================================

/**
 * Matches an agent's capabilities against task requirements.
 *
 * @param agent - The agent entity with capabilities
 * @param requirements - The task's capability requirements
 * @returns A match result indicating eligibility and score
 */
export function matchAgentToTaskRequirements(
  agent: AgentEntity,
  requirements: TaskCapabilityRequirements
): CapabilityMatchResult {
  const agentMeta = getAgentMetadata(agent);
  const capabilities = agentMeta?.capabilities ?? DefaultAgentCapabilities;

  // Normalize all strings for case-insensitive matching
  const agentSkills = normalizeCapabilityArray([...capabilities.skills]);
  const agentLanguages = normalizeCapabilityArray([...capabilities.languages]);

  const requiredSkills = normalizeCapabilityArray([...(requirements.requiredSkills ?? [])]);
  const preferredSkills = normalizeCapabilityArray([...(requirements.preferredSkills ?? [])]);
  const requiredLanguages = normalizeCapabilityArray([...(requirements.requiredLanguages ?? [])]);
  const preferredLanguages = normalizeCapabilityArray([...(requirements.preferredLanguages ?? [])]);

  // Calculate matches
  const matchedRequiredSkills = requiredSkills.filter((s) => agentSkills.includes(s));
  const missingRequiredSkills = requiredSkills.filter((s) => !agentSkills.includes(s));
  const matchedPreferredSkills = preferredSkills.filter((s) => agentSkills.includes(s));

  const matchedRequiredLanguages = requiredLanguages.filter((l) => agentLanguages.includes(l));
  const missingRequiredLanguages = requiredLanguages.filter((l) => !agentLanguages.includes(l));
  const matchedPreferredLanguages = preferredLanguages.filter((l) => agentLanguages.includes(l));

  // Check eligibility - must have ALL required skills and languages
  const isEligible = missingRequiredSkills.length === 0 && missingRequiredLanguages.length === 0;

  // Calculate score (0-100)
  // Score breakdown:
  // - 50 points for meeting all required capabilities (base eligibility)
  // - 25 points for preferred skills (proportional)
  // - 25 points for preferred languages (proportional)
  let score = 0;

  if (isEligible) {
    // Base score for eligibility
    score = 50;

    // Score for preferred skills
    if (preferredSkills.length > 0) {
      score += 25 * (matchedPreferredSkills.length / preferredSkills.length);
    } else {
      score += 25; // Full points if no preferred skills specified
    }

    // Score for preferred languages
    if (preferredLanguages.length > 0) {
      score += 25 * (matchedPreferredLanguages.length / preferredLanguages.length);
    } else {
      score += 25; // Full points if no preferred languages specified
    }
  }

  return {
    isEligible,
    score: Math.round(score),
    matchedRequiredSkills,
    matchedPreferredSkills,
    matchedRequiredLanguages,
    matchedPreferredLanguages,
    missingRequiredSkills,
    missingRequiredLanguages,
  };
}

/**
 * Matches an agent against a task's capability requirements
 */
export function matchAgentToTask(
  agent: AgentEntity,
  task: Task
): CapabilityMatchResult {
  const requirements = getTaskCapabilityRequirements(task);
  return matchAgentToTaskRequirements(agent, requirements);
}

// ============================================================================
// Agent Filtering and Ranking
// ============================================================================

/**
 * Options for finding agents for a task
 */
export interface FindAgentsForTaskOptions {
  /** Only return eligible agents (meet all requirements) */
  readonly eligibleOnly?: boolean;
  /** Minimum score threshold (0-100) */
  readonly minScore?: number;
  /** Maximum number of results to return */
  readonly limit?: number;
}

/**
 * Result of finding agents for a task
 */
export interface AgentMatchEntry {
  readonly agent: AgentEntity;
  readonly matchResult: CapabilityMatchResult;
}

/**
 * Finds and ranks agents for a task based on capability matching.
 *
 * @param agents - List of agents to evaluate
 * @param task - The task to match against
 * @param options - Filtering and ranking options
 * @returns Sorted list of agents with their match results (highest score first)
 */
export function findAgentsForTask(
  agents: readonly AgentEntity[],
  task: Task,
  options: FindAgentsForTaskOptions = {}
): AgentMatchEntry[] {
  const requirements = getTaskCapabilityRequirements(task);
  return findAgentsForRequirements(agents, requirements, options);
}

/**
 * Finds and ranks agents for capability requirements.
 *
 * @param agents - List of agents to evaluate
 * @param requirements - The capability requirements to match
 * @param options - Filtering and ranking options
 * @returns Sorted list of agents with their match results (highest score first)
 */
export function findAgentsForRequirements(
  agents: readonly AgentEntity[],
  requirements: TaskCapabilityRequirements,
  options: FindAgentsForTaskOptions = {}
): AgentMatchEntry[] {
  const { eligibleOnly = true, minScore = 0, limit } = options;

  // Calculate match results for all agents
  let entries: AgentMatchEntry[] = agents.map((agent) => ({
    agent,
    matchResult: matchAgentToTaskRequirements(agent, requirements),
  }));

  // Filter by eligibility
  if (eligibleOnly) {
    entries = entries.filter((e) => e.matchResult.isEligible);
  }

  // Filter by minimum score
  entries = entries.filter((e) => e.matchResult.score >= minScore);

  // Sort by score (descending)
  entries.sort((a, b) => b.matchResult.score - a.matchResult.score);

  // Apply limit
  if (limit !== undefined && limit > 0) {
    entries = entries.slice(0, limit);
  }

  return entries;
}

/**
 * Gets the best agent for a task (highest score among eligible agents)
 */
export function getBestAgentForTask(
  agents: readonly AgentEntity[],
  task: Task
): AgentMatchEntry | undefined {
  const results = findAgentsForTask(agents, task, { eligibleOnly: true, limit: 1 });
  return results[0];
}

// ============================================================================
// Capability Management
// ============================================================================

/**
 * Gets an agent's capabilities (returns defaults if not set)
 */
export function getAgentCapabilities(agent: AgentEntity): AgentCapabilities {
  const meta = getAgentMetadata(agent);
  return meta?.capabilities ?? DefaultAgentCapabilities;
}

/**
 * Checks if an agent has a specific skill
 */
export function agentHasSkill(agent: AgentEntity, skill: string): boolean {
  const capabilities = getAgentCapabilities(agent);
  const normalizedSkill = normalizeCapabilityString(skill);
  const normalizedAgentSkills = normalizeCapabilityArray([...capabilities.skills]);
  return normalizedAgentSkills.includes(normalizedSkill);
}

/**
 * Checks if an agent has a specific language
 */
export function agentHasLanguage(agent: AgentEntity, language: string): boolean {
  const capabilities = getAgentCapabilities(agent);
  const normalizedLanguage = normalizeCapabilityString(language);
  const normalizedAgentLanguages = normalizeCapabilityArray([...capabilities.languages]);
  return normalizedAgentLanguages.includes(normalizedLanguage);
}

/**
 * Checks if an agent has all required skills
 */
export function agentHasAllSkills(agent: AgentEntity, skills: readonly string[]): boolean {
  return skills.every((skill) => agentHasSkill(agent, skill));
}

/**
 * Checks if an agent has all required languages
 */
export function agentHasAllLanguages(agent: AgentEntity, languages: readonly string[]): boolean {
  return languages.every((lang) => agentHasLanguage(agent, lang));
}

/**
 * Checks if an agent has capacity to take on more tasks.
 * This requires knowing the agent's current task count, which must be provided.
 */
export function agentHasCapacity(agent: AgentEntity, currentTaskCount: number): boolean {
  const capabilities = getAgentCapabilities(agent);
  return currentTaskCount < capabilities.maxConcurrentTasks;
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validates that an agent has properly configured capabilities
 */
export function validateAgentCapabilities(agent: AgentEntity): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  const meta = getAgentMetadata(agent);

  if (!meta) {
    errors.push('Agent has no metadata');
    return { valid: false, errors };
  }

  if (meta.capabilities === undefined) {
    // No capabilities is valid (uses defaults)
    return { valid: true, errors: [] };
  }

  if (!isAgentCapabilities(meta.capabilities)) {
    errors.push('Capabilities have invalid structure');
    return { valid: false, errors };
  }

  const caps = meta.capabilities;

  if (caps.maxConcurrentTasks < 0) {
    errors.push('maxConcurrentTasks must be non-negative');
  }

  // Check for empty strings in skills
  for (const skill of caps.skills) {
    if (skill.trim() === '') {
      errors.push('Skills array contains empty string');
      break;
    }
  }

  // Check for empty strings in languages
  for (const lang of caps.languages) {
    if (lang.trim() === '') {
      errors.push('Languages array contains empty string');
      break;
    }
  }

  return { valid: errors.length === 0, errors };
}

// ============================================================================
// Re-exports for convenience
// ============================================================================

export {
  createAgentCapabilities,
  normalizeCapabilityString,
  normalizeCapabilityArray,
  DefaultAgentCapabilities,
  DefaultTaskCapabilityRequirements,
};

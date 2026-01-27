/**
 * Capability Service Tests
 */

import { describe, test, expect } from 'bun:test';
import type { Task, EntityId, ElementId } from '@elemental/core';
import { ElementType, TaskStatus, createTimestamp } from '@elemental/core';
import type { AgentEntity } from '../api/orchestrator-api.js';
import type { TaskCapabilityRequirements, AgentCapabilities } from '../types/index.js';
import {
  // Task capability metadata
  getTaskCapabilityRequirements,
  setTaskCapabilityRequirements,
  // Capability matching
  matchAgentToTaskRequirements,
  matchAgentToTask,
  // Agent filtering and ranking
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
  // Defaults
  DefaultAgentCapabilities,
  DefaultTaskCapabilityRequirements,
} from './capability-service.js';

// ============================================================================
// Test Helpers
// ============================================================================

let idCounter = 0;
function nextId(prefix: string): string {
  return `${prefix}-test-${++idCounter}`;
}

function createMockTask(options: Partial<Task> = {}): Task {
  const id = nextId('task') as unknown as ElementId;
  const createdBy = nextId('entity') as unknown as EntityId;
  return {
    type: ElementType.TASK,
    id,
    title: 'Test Task',
    status: TaskStatus.OPEN,
    priority: 50,
    createdAt: createTimestamp(),
    updatedAt: createTimestamp(),
    createdBy,
    blocked: false,
    ephemeral: false,
    ...options,
  } as Task;
}

function createMockAgentEntity(options: {
  name: string;
  capabilities?: Partial<AgentCapabilities>;
}): AgentEntity {
  const id = nextId('entity') as unknown as ElementId;
  const createdBy = nextId('entity') as unknown as EntityId;

  const capabilities: AgentCapabilities | undefined = options.capabilities
    ? {
        skills: options.capabilities.skills ?? [],
        languages: options.capabilities.languages ?? [],
        maxConcurrentTasks: options.capabilities.maxConcurrentTasks ?? 1,
      }
    : undefined;

  return {
    type: ElementType.ENTITY,
    id,
    name: options.name,
    entityType: 'agent',
    createdAt: createTimestamp(),
    updatedAt: createTimestamp(),
    createdBy,
    metadata: {
      agent: {
        agentRole: 'worker',
        workerMode: 'ephemeral',
        sessionStatus: 'idle',
        capabilities,
      },
    },
  } as AgentEntity;
}

// ============================================================================
// Task Capability Metadata Tests
// ============================================================================

describe('Task Capability Metadata', () => {
  describe('getTaskCapabilityRequirements', () => {
    test('returns defaults for task without metadata', () => {
      const task = createMockTask({ metadata: undefined });
      const reqs = getTaskCapabilityRequirements(task);
      expect(reqs).toEqual(DefaultTaskCapabilityRequirements);
    });

    test('returns defaults for task with empty metadata', () => {
      const task = createMockTask({ metadata: {} });
      const reqs = getTaskCapabilityRequirements(task);
      expect(reqs).toEqual(DefaultTaskCapabilityRequirements);
    });

    test('returns requirements from task metadata', () => {
      const requirements: TaskCapabilityRequirements = {
        requiredSkills: ['frontend'],
        preferredSkills: ['testing'],
        requiredLanguages: ['typescript'],
      };
      const task = createMockTask({
        metadata: { capabilityRequirements: requirements },
      });
      const reqs = getTaskCapabilityRequirements(task);
      expect(reqs).toEqual(requirements);
    });
  });

  describe('setTaskCapabilityRequirements', () => {
    test('sets requirements on undefined metadata', () => {
      const requirements: TaskCapabilityRequirements = {
        requiredSkills: ['backend'],
      };
      const result = setTaskCapabilityRequirements(undefined, requirements);
      expect(result.capabilityRequirements).toEqual(requirements);
    });

    test('preserves existing metadata', () => {
      const requirements: TaskCapabilityRequirements = {
        requiredSkills: ['backend'],
      };
      const result = setTaskCapabilityRequirements(
        { existingKey: 'value' },
        requirements
      );
      expect(result.existingKey).toBe('value');
      expect(result.capabilityRequirements).toEqual(requirements);
    });
  });
});

// ============================================================================
// Capability Matching Tests
// ============================================================================

describe('Capability Matching', () => {
  describe('matchAgentToTaskRequirements', () => {
    test('agent with no capabilities matches task with no requirements', () => {
      const agent = createMockAgentEntity({ name: 'alice' });
      const requirements: TaskCapabilityRequirements = {};
      const result = matchAgentToTaskRequirements(agent, requirements);

      expect(result.isEligible).toBe(true);
      expect(result.score).toBe(100);
      expect(result.missingRequiredSkills).toEqual([]);
      expect(result.missingRequiredLanguages).toEqual([]);
    });

    test('agent meets all required skills', () => {
      const agent = createMockAgentEntity({
        name: 'alice',
        capabilities: { skills: ['frontend', 'testing'] },
      });
      const requirements: TaskCapabilityRequirements = {
        requiredSkills: ['frontend', 'testing'],
      };
      const result = matchAgentToTaskRequirements(agent, requirements);

      expect(result.isEligible).toBe(true);
      expect(result.matchedRequiredSkills).toEqual(['frontend', 'testing']);
      expect(result.missingRequiredSkills).toEqual([]);
    });

    test('agent missing required skills is not eligible', () => {
      const agent = createMockAgentEntity({
        name: 'alice',
        capabilities: { skills: ['frontend'] },
      });
      const requirements: TaskCapabilityRequirements = {
        requiredSkills: ['frontend', 'backend'],
      };
      const result = matchAgentToTaskRequirements(agent, requirements);

      expect(result.isEligible).toBe(false);
      expect(result.score).toBe(0);
      expect(result.missingRequiredSkills).toEqual(['backend']);
    });

    test('case-insensitive skill matching', () => {
      const agent = createMockAgentEntity({
        name: 'alice',
        capabilities: { skills: ['Frontend', 'BACKEND'] },
      });
      const requirements: TaskCapabilityRequirements = {
        requiredSkills: ['frontend', 'backend'],
      };
      const result = matchAgentToTaskRequirements(agent, requirements);

      expect(result.isEligible).toBe(true);
      expect(result.matchedRequiredSkills).toEqual(['frontend', 'backend']);
    });

    test('agent meets required languages', () => {
      const agent = createMockAgentEntity({
        name: 'alice',
        capabilities: { languages: ['typescript', 'python'] },
      });
      const requirements: TaskCapabilityRequirements = {
        requiredLanguages: ['typescript'],
      };
      const result = matchAgentToTaskRequirements(agent, requirements);

      expect(result.isEligible).toBe(true);
      expect(result.matchedRequiredLanguages).toEqual(['typescript']);
    });

    test('agent missing required languages is not eligible', () => {
      const agent = createMockAgentEntity({
        name: 'alice',
        capabilities: { languages: ['javascript'] },
      });
      const requirements: TaskCapabilityRequirements = {
        requiredLanguages: ['rust'],
      };
      const result = matchAgentToTaskRequirements(agent, requirements);

      expect(result.isEligible).toBe(false);
      expect(result.missingRequiredLanguages).toEqual(['rust']);
    });

    test('preferred skills increase score', () => {
      const agentWithPreferred = createMockAgentEntity({
        name: 'alice',
        capabilities: { skills: ['frontend', 'testing'] },
      });
      const agentWithoutPreferred = createMockAgentEntity({
        name: 'bob',
        capabilities: { skills: ['frontend'] },
      });
      const requirements: TaskCapabilityRequirements = {
        requiredSkills: ['frontend'],
        preferredSkills: ['testing'],
      };

      const resultWith = matchAgentToTaskRequirements(agentWithPreferred, requirements);
      const resultWithout = matchAgentToTaskRequirements(agentWithoutPreferred, requirements);

      expect(resultWith.isEligible).toBe(true);
      expect(resultWithout.isEligible).toBe(true);
      expect(resultWith.score).toBeGreaterThan(resultWithout.score);
      expect(resultWith.matchedPreferredSkills).toEqual(['testing']);
      expect(resultWithout.matchedPreferredSkills).toEqual([]);
    });

    test('preferred languages increase score', () => {
      const agentWithPreferred = createMockAgentEntity({
        name: 'alice',
        capabilities: { languages: ['typescript', 'python'] },
      });
      const agentWithoutPreferred = createMockAgentEntity({
        name: 'bob',
        capabilities: { languages: ['typescript'] },
      });
      const requirements: TaskCapabilityRequirements = {
        requiredLanguages: ['typescript'],
        preferredLanguages: ['python'],
      };

      const resultWith = matchAgentToTaskRequirements(agentWithPreferred, requirements);
      const resultWithout = matchAgentToTaskRequirements(agentWithoutPreferred, requirements);

      expect(resultWith.score).toBeGreaterThan(resultWithout.score);
      expect(resultWith.matchedPreferredLanguages).toEqual(['python']);
    });
  });

  describe('matchAgentToTask', () => {
    test('matches agent against task with requirements', () => {
      const agent = createMockAgentEntity({
        name: 'alice',
        capabilities: { skills: ['frontend'] },
      });
      const task = createMockTask({
        metadata: {
          capabilityRequirements: { requiredSkills: ['frontend'] },
        },
      });

      const result = matchAgentToTask(agent, task);
      expect(result.isEligible).toBe(true);
      expect(result.matchedRequiredSkills).toEqual(['frontend']);
    });
  });
});

// ============================================================================
// Agent Filtering and Ranking Tests
// ============================================================================

describe('Agent Filtering and Ranking', () => {
  const agents = [
    createMockAgentEntity({
      name: 'alice',
      capabilities: { skills: ['frontend', 'testing'], languages: ['typescript'] },
    }),
    createMockAgentEntity({
      name: 'bob',
      capabilities: { skills: ['backend', 'database'], languages: ['python'] },
    }),
    createMockAgentEntity({
      name: 'carol',
      capabilities: { skills: ['frontend', 'backend'], languages: ['typescript', 'python'] },
    }),
  ];

  describe('findAgentsForRequirements', () => {
    test('finds all eligible agents', () => {
      const requirements: TaskCapabilityRequirements = {
        requiredSkills: ['frontend'],
      };
      const results = findAgentsForRequirements(agents, requirements);

      expect(results.length).toBe(2);
      expect(results.map((r) => r.agent.name)).toContain('alice');
      expect(results.map((r) => r.agent.name)).toContain('carol');
    });

    test('returns empty array when no agents match', () => {
      const requirements: TaskCapabilityRequirements = {
        requiredSkills: ['devops'],
      };
      const results = findAgentsForRequirements(agents, requirements);

      expect(results.length).toBe(0);
    });

    test('includes ineligible agents when eligibleOnly is false', () => {
      const requirements: TaskCapabilityRequirements = {
        requiredSkills: ['frontend'],
      };
      const results = findAgentsForRequirements(agents, requirements, { eligibleOnly: false });

      expect(results.length).toBe(3);
    });

    test('sorts by score descending', () => {
      const requirements: TaskCapabilityRequirements = {
        requiredSkills: ['frontend'],
        preferredSkills: ['testing'],
      };
      const results = findAgentsForRequirements(agents, requirements);

      // Alice should rank higher because she has the preferred 'testing' skill
      expect(results[0].agent.name).toBe('alice');
    });

    test('respects limit option', () => {
      const requirements: TaskCapabilityRequirements = {};
      const results = findAgentsForRequirements(agents, requirements, { limit: 2 });

      expect(results.length).toBe(2);
    });

    test('filters by minimum score', () => {
      const requirements: TaskCapabilityRequirements = {
        requiredSkills: ['frontend'],
        preferredSkills: ['testing', 'backend'],
      };
      // Alice has testing but not backend -> some preferred matches
      // Carol has backend but not testing -> some preferred matches
      const results = findAgentsForRequirements(agents, requirements, { minScore: 80 });

      // Both should have some matches but exact scores depend on calculation
      expect(results.every((r) => r.matchResult.score >= 80)).toBe(true);
    });
  });

  describe('findAgentsForTask', () => {
    test('finds agents matching task requirements', () => {
      const task = createMockTask({
        metadata: {
          capabilityRequirements: {
            requiredSkills: ['backend'],
            requiredLanguages: ['python'],
          },
        },
      });
      const results = findAgentsForTask(agents, task);

      expect(results.length).toBe(2);
      expect(results.map((r) => r.agent.name)).toContain('bob');
      expect(results.map((r) => r.agent.name)).toContain('carol');
    });
  });

  describe('getBestAgentForTask', () => {
    test('returns the best matching agent', () => {
      const task = createMockTask({
        metadata: {
          capabilityRequirements: {
            requiredSkills: ['frontend'],
            preferredSkills: ['testing'],
          },
        },
      });
      const best = getBestAgentForTask(agents, task);

      expect(best).toBeDefined();
      expect(best?.agent.name).toBe('alice'); // Has both frontend and testing
    });

    test('returns undefined when no agents match', () => {
      const task = createMockTask({
        metadata: {
          capabilityRequirements: { requiredSkills: ['devops'] },
        },
      });
      const best = getBestAgentForTask(agents, task);

      expect(best).toBeUndefined();
    });
  });
});

// ============================================================================
// Capability Management Tests
// ============================================================================

describe('Capability Management', () => {
  describe('getAgentCapabilities', () => {
    test('returns agent capabilities', () => {
      const agent = createMockAgentEntity({
        name: 'alice',
        capabilities: { skills: ['frontend'], languages: ['typescript'], maxConcurrentTasks: 2 },
      });
      const caps = getAgentCapabilities(agent);

      expect(caps.skills).toEqual(['frontend']);
      expect(caps.languages).toEqual(['typescript']);
      expect(caps.maxConcurrentTasks).toBe(2);
    });

    test('returns defaults when agent has no capabilities', () => {
      const agent = createMockAgentEntity({ name: 'alice' });
      const caps = getAgentCapabilities(agent);

      expect(caps).toEqual(DefaultAgentCapabilities);
    });
  });

  describe('agentHasSkill', () => {
    test('returns true when agent has skill', () => {
      const agent = createMockAgentEntity({
        name: 'alice',
        capabilities: { skills: ['frontend', 'testing'] },
      });
      expect(agentHasSkill(agent, 'frontend')).toBe(true);
      expect(agentHasSkill(agent, 'testing')).toBe(true);
    });

    test('returns false when agent lacks skill', () => {
      const agent = createMockAgentEntity({
        name: 'alice',
        capabilities: { skills: ['frontend'] },
      });
      expect(agentHasSkill(agent, 'backend')).toBe(false);
    });

    test('is case-insensitive', () => {
      const agent = createMockAgentEntity({
        name: 'alice',
        capabilities: { skills: ['Frontend'] },
      });
      expect(agentHasSkill(agent, 'FRONTEND')).toBe(true);
      expect(agentHasSkill(agent, 'frontend')).toBe(true);
    });
  });

  describe('agentHasLanguage', () => {
    test('returns true when agent has language', () => {
      const agent = createMockAgentEntity({
        name: 'alice',
        capabilities: { languages: ['typescript', 'python'] },
      });
      expect(agentHasLanguage(agent, 'typescript')).toBe(true);
    });

    test('returns false when agent lacks language', () => {
      const agent = createMockAgentEntity({
        name: 'alice',
        capabilities: { languages: ['typescript'] },
      });
      expect(agentHasLanguage(agent, 'rust')).toBe(false);
    });
  });

  describe('agentHasAllSkills', () => {
    test('returns true when agent has all skills', () => {
      const agent = createMockAgentEntity({
        name: 'alice',
        capabilities: { skills: ['frontend', 'testing', 'backend'] },
      });
      expect(agentHasAllSkills(agent, ['frontend', 'testing'])).toBe(true);
    });

    test('returns false when agent missing any skill', () => {
      const agent = createMockAgentEntity({
        name: 'alice',
        capabilities: { skills: ['frontend'] },
      });
      expect(agentHasAllSkills(agent, ['frontend', 'backend'])).toBe(false);
    });

    test('returns true for empty skills array', () => {
      const agent = createMockAgentEntity({ name: 'alice' });
      expect(agentHasAllSkills(agent, [])).toBe(true);
    });
  });

  describe('agentHasAllLanguages', () => {
    test('returns true when agent has all languages', () => {
      const agent = createMockAgentEntity({
        name: 'alice',
        capabilities: { languages: ['typescript', 'python', 'rust'] },
      });
      expect(agentHasAllLanguages(agent, ['typescript', 'python'])).toBe(true);
    });

    test('returns false when agent missing any language', () => {
      const agent = createMockAgentEntity({
        name: 'alice',
        capabilities: { languages: ['typescript'] },
      });
      expect(agentHasAllLanguages(agent, ['typescript', 'go'])).toBe(false);
    });
  });

  describe('agentHasCapacity', () => {
    test('returns true when agent has capacity', () => {
      const agent = createMockAgentEntity({
        name: 'alice',
        capabilities: { maxConcurrentTasks: 3 },
      });
      expect(agentHasCapacity(agent, 0)).toBe(true);
      expect(agentHasCapacity(agent, 2)).toBe(true);
    });

    test('returns false when agent at capacity', () => {
      const agent = createMockAgentEntity({
        name: 'alice',
        capabilities: { maxConcurrentTasks: 2 },
      });
      expect(agentHasCapacity(agent, 2)).toBe(false);
      expect(agentHasCapacity(agent, 3)).toBe(false);
    });

    test('uses default maxConcurrentTasks when not specified', () => {
      const agent = createMockAgentEntity({ name: 'alice' });
      expect(agentHasCapacity(agent, 0)).toBe(true);
      expect(agentHasCapacity(agent, 1)).toBe(false);
    });
  });
});

// ============================================================================
// Validation Tests
// ============================================================================

describe('Validation', () => {
  describe('validateAgentCapabilities', () => {
    test('returns valid for agent without capabilities', () => {
      const agent = createMockAgentEntity({ name: 'alice' });
      const result = validateAgentCapabilities(agent);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    test('returns valid for agent with valid capabilities', () => {
      const agent = createMockAgentEntity({
        name: 'alice',
        capabilities: {
          skills: ['frontend'],
          languages: ['typescript'],
          maxConcurrentTasks: 2,
        },
      });
      const result = validateAgentCapabilities(agent);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    test('returns invalid for empty skill strings', () => {
      const agent = createMockAgentEntity({
        name: 'alice',
        capabilities: {
          skills: ['frontend', ''],
          languages: ['typescript'],
          maxConcurrentTasks: 1,
        },
      });
      const result = validateAgentCapabilities(agent);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Skills array contains empty string');
    });

    test('returns invalid for empty language strings', () => {
      const agent = createMockAgentEntity({
        name: 'alice',
        capabilities: {
          skills: ['frontend'],
          languages: ['typescript', '  '],
          maxConcurrentTasks: 1,
        },
      });
      const result = validateAgentCapabilities(agent);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Languages array contains empty string');
    });
  });
});

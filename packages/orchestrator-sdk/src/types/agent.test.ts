/**
 * Agent Types Tests
 */

import { describe, test, expect } from 'bun:test';
import type {
  CronTrigger,
  EventTrigger,
  DirectorMetadata,
  WorkerMetadata,
  StewardMetadata,
  AgentCapabilities,
} from './agent.js';
import {
  AgentRoleValues,
  WorkerModeValues,
  StewardFocusValues,
  DefaultAgentCapabilities,
  DefaultTaskCapabilityRequirements,
  isAgentRole,
  isWorkerMode,
  isStewardFocus,
  isCronTrigger,
  isEventTrigger,
  isStewardTrigger,
  isDirectorMetadata,
  isWorkerMetadata,
  isStewardMetadata,
  validateAgentMetadata,
  createAgentCapabilities,
  isAgentCapabilities,
  isTaskCapabilityRequirements,
  normalizeCapabilityString,
  normalizeCapabilityArray,
} from './agent.js';

describe('AgentRole', () => {
  test('AgentRoleValues contains all valid roles', () => {
    expect(AgentRoleValues).toEqual(['director', 'steward', 'worker']);
  });

  test('isAgentRole returns true for valid roles', () => {
    expect(isAgentRole('director')).toBe(true);
    expect(isAgentRole('steward')).toBe(true);
    expect(isAgentRole('worker')).toBe(true);
  });

  test('isAgentRole returns false for invalid roles', () => {
    expect(isAgentRole('admin')).toBe(false);
    expect(isAgentRole('human')).toBe(false);
    expect(isAgentRole('')).toBe(false);
    expect(isAgentRole(null)).toBe(false);
    expect(isAgentRole(undefined)).toBe(false);
    expect(isAgentRole(123)).toBe(false);
  });
});

describe('WorkerMode', () => {
  test('WorkerModeValues contains all valid modes', () => {
    expect(WorkerModeValues).toEqual(['ephemeral', 'persistent']);
  });

  test('isWorkerMode returns true for valid modes', () => {
    expect(isWorkerMode('ephemeral')).toBe(true);
    expect(isWorkerMode('persistent')).toBe(true);
  });

  test('isWorkerMode returns false for invalid modes', () => {
    expect(isWorkerMode('temporary')).toBe(false);
    expect(isWorkerMode('permanent')).toBe(false);
    expect(isWorkerMode('')).toBe(false);
    expect(isWorkerMode(null)).toBe(false);
  });
});

describe('StewardFocus', () => {
  test('StewardFocusValues contains all valid focus areas', () => {
    expect(StewardFocusValues).toEqual(['merge', 'health', 'reminder', 'ops']);
  });

  test('isStewardFocus returns true for valid focus areas', () => {
    expect(isStewardFocus('merge')).toBe(true);
    expect(isStewardFocus('health')).toBe(true);
    expect(isStewardFocus('reminder')).toBe(true);
    expect(isStewardFocus('ops')).toBe(true);
  });

  test('isStewardFocus returns false for invalid focus areas', () => {
    expect(isStewardFocus('cleanup')).toBe(false);
    expect(isStewardFocus('')).toBe(false);
    expect(isStewardFocus(null)).toBe(false);
  });
});

describe('StewardTrigger', () => {
  test('isCronTrigger identifies cron triggers', () => {
    const cronTrigger: CronTrigger = { type: 'cron', schedule: '0 2 * * *' };
    const eventTrigger: EventTrigger = { type: 'event', event: 'task_completed' };

    expect(isCronTrigger(cronTrigger)).toBe(true);
    expect(isCronTrigger(eventTrigger)).toBe(false);
  });

  test('isEventTrigger identifies event triggers', () => {
    const cronTrigger: CronTrigger = { type: 'cron', schedule: '0 2 * * *' };
    const eventTrigger: EventTrigger = { type: 'event', event: 'task_completed' };

    expect(isEventTrigger(eventTrigger)).toBe(true);
    expect(isEventTrigger(cronTrigger)).toBe(false);
  });

  test('isStewardTrigger validates cron triggers', () => {
    expect(isStewardTrigger({ type: 'cron', schedule: '0 2 * * *' })).toBe(true);
    expect(isStewardTrigger({ type: 'cron' })).toBe(false);
    expect(isStewardTrigger({ type: 'cron', schedule: 123 })).toBe(false);
  });

  test('isStewardTrigger validates event triggers', () => {
    expect(isStewardTrigger({ type: 'event', event: 'task_completed' })).toBe(true);
    expect(isStewardTrigger({ type: 'event', event: 'branch_ready', condition: "task.status === 'done'" })).toBe(true);
    expect(isStewardTrigger({ type: 'event' })).toBe(false);
    expect(isStewardTrigger({ type: 'event', event: 123 })).toBe(false);
  });

  test('isStewardTrigger rejects invalid triggers', () => {
    expect(isStewardTrigger(null)).toBe(false);
    expect(isStewardTrigger(undefined)).toBe(false);
    expect(isStewardTrigger({})).toBe(false);
    expect(isStewardTrigger({ type: 'unknown' })).toBe(false);
  });
});

describe('AgentMetadata type guards', () => {
  test('isDirectorMetadata identifies director metadata', () => {
    const director: DirectorMetadata = { agentRole: 'director', sessionStatus: 'idle' };
    const worker: WorkerMetadata = { agentRole: 'worker', workerMode: 'ephemeral', sessionStatus: 'idle' };
    const steward: StewardMetadata = { agentRole: 'steward', stewardFocus: 'merge', sessionStatus: 'idle' };

    expect(isDirectorMetadata(director)).toBe(true);
    expect(isDirectorMetadata(worker)).toBe(false);
    expect(isDirectorMetadata(steward)).toBe(false);
  });

  test('isWorkerMetadata identifies worker metadata', () => {
    const director: DirectorMetadata = { agentRole: 'director', sessionStatus: 'idle' };
    const worker: WorkerMetadata = { agentRole: 'worker', workerMode: 'ephemeral', sessionStatus: 'idle' };
    const steward: StewardMetadata = { agentRole: 'steward', stewardFocus: 'merge', sessionStatus: 'idle' };

    expect(isWorkerMetadata(worker)).toBe(true);
    expect(isWorkerMetadata(director)).toBe(false);
    expect(isWorkerMetadata(steward)).toBe(false);
  });

  test('isStewardMetadata identifies steward metadata', () => {
    const director: DirectorMetadata = { agentRole: 'director', sessionStatus: 'idle' };
    const worker: WorkerMetadata = { agentRole: 'worker', workerMode: 'ephemeral', sessionStatus: 'idle' };
    const steward: StewardMetadata = { agentRole: 'steward', stewardFocus: 'merge', sessionStatus: 'idle' };

    expect(isStewardMetadata(steward)).toBe(true);
    expect(isStewardMetadata(director)).toBe(false);
    expect(isStewardMetadata(worker)).toBe(false);
  });
});

describe('validateAgentMetadata', () => {
  test('validates director metadata', () => {
    expect(validateAgentMetadata({ agentRole: 'director' })).toBe(true);
    expect(validateAgentMetadata({ agentRole: 'director', sessionStatus: 'running', channelId: 'ch-123' })).toBe(true);
  });

  test('validates worker metadata', () => {
    expect(validateAgentMetadata({ agentRole: 'worker', workerMode: 'ephemeral' })).toBe(true);
    expect(validateAgentMetadata({ agentRole: 'worker', workerMode: 'persistent', branch: 'agent/alice/task-1' })).toBe(true);
  });

  test('rejects worker metadata without workerMode', () => {
    expect(validateAgentMetadata({ agentRole: 'worker' })).toBe(false);
  });

  test('validates steward metadata', () => {
    expect(validateAgentMetadata({ agentRole: 'steward', stewardFocus: 'merge' })).toBe(true);
    expect(validateAgentMetadata({ agentRole: 'steward', stewardFocus: 'ops', triggers: [{ type: 'cron', schedule: '0 2 * * *' }] })).toBe(true);
  });

  test('rejects steward metadata without stewardFocus', () => {
    expect(validateAgentMetadata({ agentRole: 'steward' })).toBe(false);
  });

  test('rejects steward metadata with invalid triggers', () => {
    expect(validateAgentMetadata({ agentRole: 'steward', stewardFocus: 'merge', triggers: [{ type: 'invalid' }] })).toBe(false);
  });

  test('rejects invalid agent metadata', () => {
    expect(validateAgentMetadata(null)).toBe(false);
    expect(validateAgentMetadata(undefined)).toBe(false);
    expect(validateAgentMetadata({})).toBe(false);
    expect(validateAgentMetadata({ agentRole: 'invalid' })).toBe(false);
  });

  test('validates agent metadata with capabilities', () => {
    const validCaps: AgentCapabilities = {
      skills: ['frontend', 'testing'],
      languages: ['typescript', 'python'],
      maxConcurrentTasks: 2,
    };
    expect(validateAgentMetadata({ agentRole: 'director', capabilities: validCaps })).toBe(true);
    expect(validateAgentMetadata({ agentRole: 'worker', workerMode: 'ephemeral', capabilities: validCaps })).toBe(true);
  });

  test('rejects agent metadata with invalid capabilities', () => {
    expect(validateAgentMetadata({ agentRole: 'director', capabilities: 'invalid' })).toBe(false);
    expect(validateAgentMetadata({ agentRole: 'director', capabilities: { skills: 'not-array' } })).toBe(false);
    expect(validateAgentMetadata({ agentRole: 'director', capabilities: { skills: [], languages: [], maxConcurrentTasks: -1 } })).toBe(false);
  });
});

// ============================================================================
// Capability Types Tests
// ============================================================================

describe('AgentCapabilities', () => {
  test('DefaultAgentCapabilities has expected values', () => {
    expect(DefaultAgentCapabilities.skills).toEqual([]);
    expect(DefaultAgentCapabilities.languages).toEqual([]);
    expect(DefaultAgentCapabilities.maxConcurrentTasks).toBe(1);
  });

  test('createAgentCapabilities creates with defaults', () => {
    const caps = createAgentCapabilities();
    expect(caps.skills).toEqual([]);
    expect(caps.languages).toEqual([]);
    expect(caps.maxConcurrentTasks).toBe(1);
  });

  test('createAgentCapabilities creates with partial input', () => {
    const caps = createAgentCapabilities({
      skills: ['frontend', 'backend'],
    });
    expect(caps.skills).toEqual(['frontend', 'backend']);
    expect(caps.languages).toEqual([]);
    expect(caps.maxConcurrentTasks).toBe(1);
  });

  test('createAgentCapabilities creates with full input', () => {
    const caps = createAgentCapabilities({
      skills: ['frontend', 'testing'],
      languages: ['typescript', 'python'],
      maxConcurrentTasks: 3,
    });
    expect(caps.skills).toEqual(['frontend', 'testing']);
    expect(caps.languages).toEqual(['typescript', 'python']);
    expect(caps.maxConcurrentTasks).toBe(3);
  });

  test('isAgentCapabilities validates valid capabilities', () => {
    expect(isAgentCapabilities({
      skills: ['frontend'],
      languages: ['typescript'],
      maxConcurrentTasks: 1,
    })).toBe(true);

    expect(isAgentCapabilities({
      skills: [],
      languages: [],
      maxConcurrentTasks: 0,
    })).toBe(true);
  });

  test('isAgentCapabilities rejects invalid capabilities', () => {
    expect(isAgentCapabilities(null)).toBe(false);
    expect(isAgentCapabilities(undefined)).toBe(false);
    expect(isAgentCapabilities({})).toBe(false);
    expect(isAgentCapabilities({ skills: 'not-array' })).toBe(false);
    expect(isAgentCapabilities({ skills: [], languages: 'not-array' })).toBe(false);
    expect(isAgentCapabilities({ skills: [], languages: [], maxConcurrentTasks: 'not-number' })).toBe(false);
    expect(isAgentCapabilities({ skills: [], languages: [], maxConcurrentTasks: -1 })).toBe(false);
    expect(isAgentCapabilities({ skills: [123], languages: [], maxConcurrentTasks: 1 })).toBe(false);
  });
});

describe('TaskCapabilityRequirements', () => {
  test('DefaultTaskCapabilityRequirements has expected values', () => {
    expect(DefaultTaskCapabilityRequirements.requiredSkills).toEqual([]);
    expect(DefaultTaskCapabilityRequirements.preferredSkills).toEqual([]);
    expect(DefaultTaskCapabilityRequirements.requiredLanguages).toEqual([]);
    expect(DefaultTaskCapabilityRequirements.preferredLanguages).toEqual([]);
  });

  test('isTaskCapabilityRequirements validates valid requirements', () => {
    expect(isTaskCapabilityRequirements({})).toBe(true);
    expect(isTaskCapabilityRequirements({
      requiredSkills: ['frontend'],
      preferredSkills: ['testing'],
    })).toBe(true);
    expect(isTaskCapabilityRequirements({
      requiredSkills: [],
      preferredSkills: [],
      requiredLanguages: ['typescript'],
      preferredLanguages: ['python'],
    })).toBe(true);
  });

  test('isTaskCapabilityRequirements rejects invalid requirements', () => {
    expect(isTaskCapabilityRequirements(null)).toBe(false);
    expect(isTaskCapabilityRequirements(undefined)).toBe(false);
    expect(isTaskCapabilityRequirements({ requiredSkills: 'not-array' })).toBe(false);
    expect(isTaskCapabilityRequirements({ requiredSkills: [123] })).toBe(false);
  });
});

describe('Capability string normalization', () => {
  test('normalizeCapabilityString normalizes correctly', () => {
    expect(normalizeCapabilityString('Frontend')).toBe('frontend');
    expect(normalizeCapabilityString('  TypeScript  ')).toBe('typescript');
    expect(normalizeCapabilityString('PYTHON')).toBe('python');
    expect(normalizeCapabilityString('react-native')).toBe('react-native');
  });

  test('normalizeCapabilityArray normalizes all elements', () => {
    const input = ['Frontend', '  Backend  ', 'TESTING'];
    const result = normalizeCapabilityArray(input);
    expect(result).toEqual(['frontend', 'backend', 'testing']);
  });

  test('normalizeCapabilityArray handles empty array', () => {
    expect(normalizeCapabilityArray([])).toEqual([]);
  });
});

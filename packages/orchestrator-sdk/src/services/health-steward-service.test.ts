/**
 * Health Steward Service Tests
 *
 * Tests for the HealthStewardService which monitors agent health,
 * detects stuck agents, and takes corrective actions.
 *
 * TB-O24: Health Steward Implementation
 *
 * @module
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { createTimestamp, TaskStatus, Priority, Complexity } from '@elemental/core';
import type { Task, ElementId, EntityId, Channel, Message } from '@elemental/core';
import type { ElementalAPI } from '@elemental/sdk';

import type { TaskAssignmentService, TaskAssignment } from './task-assignment-service.js';
import type { DispatchService, DispatchResult } from './dispatch-service.js';
import type { SessionManager, SessionRecord } from '../runtime/session-manager.js';
import type { AgentRegistry, AgentEntity } from './agent-registry.js';

import {
  HealthStewardServiceImpl,
  createHealthStewardService,
  type HealthStewardService,
  type HealthStewardConfig,
  type HealthIssue,
} from './health-steward-service.js';

// ============================================================================
// Test Fixtures
// ============================================================================

function createMockAgent(overrides: Partial<AgentEntity> = {}): AgentEntity {
  // Agent metadata must be under the 'agent' key per getAgentMetadata()
  const overrideAgentMeta = overrides.metadata?.agent as Record<string, unknown> | undefined;
  const agentMeta = {
    agentRole: (overrideAgentMeta?.agentRole as string) ?? 'worker',
    workerMode: (overrideAgentMeta?.workerMode as string) ?? 'ephemeral',
    sessionStatus: (overrideAgentMeta?.sessionStatus as string) ?? 'running',
    lastActivityAt: createTimestamp(),
    ...overrideAgentMeta,
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { metadata: _ignoredMeta, ...restOverrides } = overrides;

  const defaultAgent: AgentEntity = {
    id: 'agent-worker-001' as ElementId,
    type: 'entity',
    name: 'Worker Alice',
    entityType: 'agent',
    tags: ['agent', 'worker'],
    createdBy: 'system' as EntityId,
    createdAt: createTimestamp(),
    updatedAt: createTimestamp(),
    version: 1,
    ...restOverrides,
    metadata: {
      agent: agentMeta,
    },
  } as AgentEntity;

  return defaultAgent;
}

function createMockTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-001' as ElementId,
    type: 'task',
    title: 'Implement feature X',
    status: TaskStatus.IN_PROGRESS,
    priority: Priority.MEDIUM,
    complexity: Complexity.MEDIUM,
    tags: ['feature'],
    assignee: 'agent-worker-001' as EntityId,
    createdBy: 'user-001' as EntityId,
    createdAt: createTimestamp(),
    updatedAt: createTimestamp(),
    version: 1,
    ephemeral: false,
    metadata: {
      description: 'A test task',
      orchestrator: {
        branch: 'agent/worker-alice/task-001-implement-feature-x',
        assignedAgent: 'agent-worker-001' as EntityId,
      },
    },
    ...overrides,
  } as Task;
}

function _createMockTaskAssignment(task: Task): TaskAssignment {
  return {
    taskId: task.id,
    task,
    orchestratorMeta: (task.metadata as Record<string, unknown>)?.orchestrator as TaskAssignment['orchestratorMeta'],
  };
}

function createMockSession(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id: 'session-001',
    agentId: 'agent-worker-001' as EntityId,
    agentRole: 'worker',
    workerMode: 'ephemeral',
    status: 'running',
    workingDirectory: '/project',
    createdAt: createTimestamp(),
    lastActivityAt: createTimestamp(),
    ...overrides,
  };
}

function createMockChannel(): Channel {
  return {
    id: 'channel-agent-001' as ElementId,
    type: 'channel',
    name: 'agent-agent-worker-001',
    channelType: 'group',
    members: ['agent-worker-001'] as EntityId[],
    tags: ['agent-channel'],
    createdBy: 'system' as EntityId,
    createdAt: createTimestamp(),
    updatedAt: createTimestamp(),
    version: 1,
    metadata: {},
  } as unknown as Channel;
}

// ============================================================================
// Mock Setup
// ============================================================================

function createMockApi(): ElementalAPI {
  return {
    get: vi.fn(),
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  } as unknown as ElementalAPI;
}

function createMockTaskAssignmentService(): TaskAssignmentService {
  return {
    getTasksAwaitingMerge: vi.fn(),
    assignToAgent: vi.fn(),
    unassignTask: vi.fn(),
    startTask: vi.fn(),
    completeTask: vi.fn(),
    updateSessionId: vi.fn(),
    getAgentTasks: vi.fn().mockResolvedValue([]),
    getAgentWorkload: vi.fn(),
    agentHasCapacity: vi.fn(),
    getUnassignedTasks: vi.fn(),
    getTasksByAssignmentStatus: vi.fn(),
    listAssignments: vi.fn(),
  } as unknown as TaskAssignmentService;
}

function createMockDispatchService(): DispatchService {
  return {
    dispatch: vi.fn(),
    dispatchBatch: vi.fn(),
    smartDispatch: vi.fn(),
    getCandidates: vi.fn(),
    getBestAgent: vi.fn(),
    notifyAgent: vi.fn().mockResolvedValue({
      id: 'msg-001' as ElementId,
      type: 'message',
    } as Message),
  } as unknown as DispatchService;
}

function createMockAgentRegistry(): AgentRegistry {
  return {
    registerDirector: vi.fn(),
    registerWorker: vi.fn(),
    registerSteward: vi.fn(),
    getAgent: vi.fn(),
    getAgentsByRole: vi.fn().mockResolvedValue([]),
    getAgentChannel: vi.fn().mockResolvedValue(createMockChannel()),
    getAgentChannelId: vi.fn(),
    updateAgent: vi.fn(),
    deleteAgent: vi.fn(),
    listAgents: vi.fn().mockResolvedValue([]),
    getAgentsByFilter: vi.fn(),
    updateSessionStatus: vi.fn(),
    getAvailableWorkers: vi.fn().mockResolvedValue([]),
  } as unknown as AgentRegistry;
}

function createMockSessionManager(): SessionManager {
  return {
    startSession: vi.fn(),
    resumeSession: vi.fn(),
    stopSession: vi.fn(),
    suspendSession: vi.fn(),
    getSession: vi.fn(),
    getActiveSession: vi.fn().mockReturnValue(null),
    listSessions: vi.fn().mockReturnValue([]),
    messageSession: vi.fn().mockResolvedValue({ success: true }),
    getSessionHistory: vi.fn(),
    pruneInactiveSessions: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
  } as unknown as SessionManager;
}

// ============================================================================
// Tests
// ============================================================================

describe('HealthStewardService', () => {
  let api: ElementalAPI;
  let agentRegistry: AgentRegistry;
  let sessionManager: SessionManager;
  let taskAssignment: TaskAssignmentService;
  let dispatchService: DispatchService;
  let service: HealthStewardService;
  let config: HealthStewardConfig;

  beforeEach(() => {
    api = createMockApi();
    agentRegistry = createMockAgentRegistry();
    sessionManager = createMockSessionManager();
    taskAssignment = createMockTaskAssignmentService();
    dispatchService = createMockDispatchService();
    config = {
      noOutputThresholdMs: 5000, // 5 seconds for testing
      errorCountThreshold: 3,
      errorWindowMs: 60000, // 1 minute
      staleSessionThresholdMs: 10000, // 10 seconds for testing
      healthCheckIntervalMs: 1000, // 1 second for testing
      maxPingAttempts: 2,
      autoRestart: true,
      autoReassign: true,
      notifyDirector: true,
    };

    service = createHealthStewardService(
      api,
      agentRegistry,
      sessionManager,
      taskAssignment,
      dispatchService,
      config
    );
  });

  afterEach(() => {
    // Stop service if running
    if (service.isRunning()) {
      service.stop();
    }
    vi.clearAllMocks();
  });

  // ----------------------------------------
  // Factory Function
  // ----------------------------------------

  describe('createHealthStewardService', () => {
    it('creates a health steward service instance', () => {
      expect(service).toBeDefined();
      expect(service).toBeInstanceOf(HealthStewardServiceImpl);
    });

    it('uses default config when none provided', () => {
      const defaultService = createHealthStewardService(
        api,
        agentRegistry,
        sessionManager,
        taskAssignment,
        dispatchService
      );
      expect(defaultService).toBeDefined();
    });
  });

  // ----------------------------------------
  // Activity Tracking
  // ----------------------------------------

  describe('recordOutput', () => {
    it('records output for an agent', () => {
      const agentId = 'agent-001' as EntityId;
      service.recordOutput(agentId);

      // The tracker should have been updated - we can verify via stats
      const stats = service.getStats();
      expect(stats.monitoredAgents).toBe(1);
    });

    it('resets ping attempts on output', () => {
      const agentId = 'agent-001' as EntityId;
      // Record some errors first to potentially trigger ping attempts
      service.recordError(agentId);
      service.recordError(agentId);

      // Now record output - should reset
      service.recordOutput(agentId);

      const stats = service.getStats();
      expect(stats.monitoredAgents).toBe(1);
    });
  });

  describe('recordError', () => {
    it('records errors for an agent', () => {
      const agentId = 'agent-001' as EntityId;
      service.recordError(agentId, 'Test error');

      const stats = service.getStats();
      expect(stats.monitoredAgents).toBe(1);
    });
  });

  describe('recordCrash', () => {
    it('creates an immediate issue for crashed agent', () => {
      const agentId = 'agent-001' as EntityId;
      service.recordCrash(agentId, 1);

      const issues = service.getActiveIssues();
      expect(issues.length).toBe(1);
      expect(issues[0].issueType).toBe('process_crashed');
    });
  });

  // ----------------------------------------
  // Health Checks
  // ----------------------------------------

  describe('checkAgent', () => {
    it('returns healthy status for agent with no issues', async () => {
      const agent = createMockAgent();
      vi.mocked(agentRegistry.getAgent).mockResolvedValue(agent);

      // Session must be running for health checks to apply
      const session = createMockSession({ status: 'running' });
      vi.mocked(sessionManager.getActiveSession).mockReturnValue(session);

      // Record recent output to prevent no_output detection
      const agentId = agent.id as unknown as EntityId;
      service.recordOutput(agentId);

      const status = await service.checkAgent(agentId);
      // When session is running but has recent output, should be healthy
      expect(status.isHealthy).toBe(true);
      expect(status.issues.length).toBe(0);
    });

    it('detects no output issue for stale agent', async () => {
      // Create service with very short threshold for testing
      const testService = createHealthStewardService(
        api,
        agentRegistry,
        sessionManager,
        taskAssignment,
        dispatchService,
        {
          noOutputThresholdMs: 100, // 100ms for testing
          errorCountThreshold: 3,
          errorWindowMs: 60000,
        }
      );

      const agent = createMockAgent();
      vi.mocked(agentRegistry.getAgent).mockResolvedValue(agent);

      // Session must be 'running' for health checks to detect issues
      const session = createMockSession({ status: 'running' });
      vi.mocked(sessionManager.getActiveSession).mockReturnValue(session);

      // Record output in the past (simulate old activity)
      const agentId = agent.id as unknown as EntityId;
      testService.recordOutput(agentId);

      // Wait longer than threshold
      await new Promise((resolve) => setTimeout(resolve, 200));

      const status = await testService.checkAgent(agentId);
      expect(status.isHealthy).toBe(false);
      expect(status.issues.length).toBeGreaterThan(0);
      expect(status.issues.some(i => i.issueType === 'no_output')).toBe(true);
    });

    it('detects repeated errors issue', async () => {
      const agent = createMockAgent();
      vi.mocked(agentRegistry.getAgent).mockResolvedValue(agent);

      // Session must be 'running' for health checks to detect issues
      const session = createMockSession({ status: 'running' });
      vi.mocked(sessionManager.getActiveSession).mockReturnValue(session);

      const agentId = agent.id as unknown as EntityId;

      // Record enough errors to trigger threshold (config.errorCountThreshold = 3)
      for (let i = 0; i < 5; i++) {
        service.recordError(agentId, `Error ${i}`);
      }

      const status = await service.checkAgent(agentId);
      expect(status.isHealthy).toBe(false);
      expect(status.issues.some(i => i.issueType === 'repeated_errors')).toBe(true);
    });

    it('returns unhealthy status for unknown agent', async () => {
      vi.mocked(agentRegistry.getAgent).mockResolvedValue(undefined);

      const status = await service.checkAgent('unknown' as EntityId);
      expect(status.isHealthy).toBe(false);
      expect(status.agentName).toBe('unknown');
    });
  });

  describe('runHealthCheck', () => {
    it('checks all running agents', async () => {
      const agents = [
        createMockAgent({ id: 'agent-001' as ElementId, name: 'Worker 1' }),
        createMockAgent({ id: 'agent-002' as ElementId, name: 'Worker 2' }),
      ];
      vi.mocked(agentRegistry.listAgents).mockResolvedValue(agents);

      for (const agent of agents) {
        vi.mocked(agentRegistry.getAgent).mockResolvedValueOnce(agent);
        vi.mocked(sessionManager.getActiveSession).mockReturnValueOnce(
          createMockSession({ agentId: agent.id as unknown as EntityId })
        );
      }

      const result = await service.runHealthCheck();
      expect(result.agentsChecked).toBe(2);
    });

    it('returns new and resolved issues', async () => {
      vi.mocked(agentRegistry.listAgents).mockResolvedValue([]);

      const result = await service.runHealthCheck();
      expect(result.newIssues).toEqual([]);
      expect(result.resolvedIssues).toEqual([]);
      expect(result.actionsTaken).toEqual([]);
    });

    it('increments total checks stat', async () => {
      vi.mocked(agentRegistry.listAgents).mockResolvedValue([]);

      await service.runHealthCheck();
      await service.runHealthCheck();

      const stats = service.getStats();
      expect(stats.totalChecks).toBe(2);
    });
  });

  describe('getAllAgentHealth', () => {
    it('returns health status for all agents', async () => {
      const agents = [
        createMockAgent({ id: 'agent-001' as ElementId }),
        createMockAgent({ id: 'agent-002' as ElementId }),
      ];
      vi.mocked(agentRegistry.listAgents).mockResolvedValue(agents);

      for (const agent of agents) {
        vi.mocked(agentRegistry.getAgent).mockResolvedValueOnce(agent);
        vi.mocked(sessionManager.getActiveSession).mockReturnValueOnce(
          createMockSession({ agentId: agent.id as unknown as EntityId })
        );
      }

      const statuses = await service.getAllAgentHealth();
      expect(statuses.length).toBe(2);
    });
  });

  // ----------------------------------------
  // Issue Management
  // ----------------------------------------

  describe('getActiveIssues', () => {
    it('returns empty array when no issues', () => {
      const issues = service.getActiveIssues();
      expect(issues).toEqual([]);
    });

    it('returns active issues', () => {
      service.recordCrash('agent-001' as EntityId, 1);

      const issues = service.getActiveIssues();
      expect(issues.length).toBe(1);
    });
  });

  describe('getIssuesForAgent', () => {
    it('returns only issues for specified agent', () => {
      service.recordCrash('agent-001' as EntityId, 1);
      service.recordCrash('agent-002' as EntityId, 1);

      const issues = service.getIssuesForAgent('agent-001' as EntityId);
      expect(issues.length).toBe(1);
      expect(issues[0].agentId).toBe('agent-001');
    });
  });

  describe('resolveIssue', () => {
    it('removes issue from active issues', () => {
      service.recordCrash('agent-001' as EntityId, 1);

      const issues = service.getActiveIssues();
      const issueId = issues[0].id;

      const resolved = service.resolveIssue(issueId);
      expect(resolved).toBe(true);
      expect(service.getActiveIssues().length).toBe(0);
    });

    it('returns false for non-existent issue', () => {
      const resolved = service.resolveIssue('non-existent-id');
      expect(resolved).toBe(false);
    });

    it('increments resolved issues stat', () => {
      service.recordCrash('agent-001' as EntityId, 1);

      const issues = service.getActiveIssues();
      service.resolveIssue(issues[0].id);

      const stats = service.getStats();
      expect(stats.totalIssuesResolved).toBe(1);
    });
  });

  describe('clearResolvedIssues', () => {
    it('clears resolved issue history', () => {
      service.recordCrash('agent-001' as EntityId, 1);

      const issues = service.getActiveIssues();
      service.resolveIssue(issues[0].id);
      service.clearResolvedIssues();

      // No error should occur
      expect(service.getActiveIssues().length).toBe(0);
    });
  });

  // ----------------------------------------
  // Actions
  // ----------------------------------------

  describe('takeAction', () => {
    it('returns error for non-existent issue', async () => {
      const result = await service.takeAction('non-existent-id');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Issue not found');
    });

    it('handles monitor action', async () => {
      service.recordCrash('agent-001' as EntityId, 1);
      const issues = service.getActiveIssues();

      const result = await service.takeAction(issues[0].id, 'monitor');
      expect(result.success).toBe(true);
      expect(result.action).toBe('monitor');
    });

    it('handles send_ping action', async () => {
      const agent = createMockAgent();
      vi.mocked(agentRegistry.getAgent).mockResolvedValue(agent);
      vi.mocked(sessionManager.getActiveSession).mockReturnValue(createMockSession());

      service.recordCrash('agent-worker-001' as EntityId, 1);
      const issues = service.getActiveIssues();

      const result = await service.takeAction(issues[0].id, 'send_ping');
      expect(result.action).toBe('send_ping');
    });

    it('handles restart action', async () => {
      vi.mocked(sessionManager.getActiveSession).mockReturnValue(createMockSession());
      vi.mocked(sessionManager.stopSession).mockResolvedValue(undefined);

      service.recordCrash('agent-worker-001' as EntityId, 1);
      const issues = service.getActiveIssues();

      const result = await service.takeAction(issues[0].id, 'restart');
      expect(result.success).toBe(true);
      expect(result.action).toBe('restart');
    });

    it('handles notify_director action', async () => {
      const director = createMockAgent({
        id: 'director-001' as ElementId,
        name: 'Director',
        metadata: {
          agentRole: 'director' as const,
          agent: { agentRole: 'director' as const },
        },
      });
      vi.mocked(agentRegistry.getAgentsByRole).mockResolvedValue([director]);
      vi.mocked(agentRegistry.getAgentChannel).mockResolvedValue(createMockChannel());

      service.recordCrash('agent-worker-001' as EntityId, 1);
      const issues = service.getActiveIssues();

      const result = await service.takeAction(issues[0].id, 'notify_director');
      expect(result.success).toBe(true);
      expect(result.action).toBe('notify_director');
    });
  });

  describe('pingAgent', () => {
    it('sends ping via session manager', async () => {
      vi.mocked(sessionManager.getActiveSession).mockReturnValue(createMockSession());

      await service.pingAgent('agent-001' as EntityId);
      expect(sessionManager.messageSession).toHaveBeenCalled();
    });

    it('returns false for agent without session', async () => {
      vi.mocked(sessionManager.getActiveSession).mockReturnValue(undefined);

      const result = await service.pingAgent('agent-001' as EntityId);
      expect(result).toBe(false);
    });
  });

  describe('restartAgent', () => {
    it('stops existing session', async () => {
      vi.mocked(sessionManager.getActiveSession).mockReturnValue(createMockSession());
      vi.mocked(sessionManager.stopSession).mockResolvedValue(undefined);

      const result = await service.restartAgent('agent-001' as EntityId);
      expect(result).toBe(true);
      expect(sessionManager.stopSession).toHaveBeenCalled();
    });

    it('succeeds even without active session', async () => {
      vi.mocked(sessionManager.getActiveSession).mockReturnValue(undefined);

      const result = await service.restartAgent('agent-001' as EntityId);
      expect(result).toBe(true);
    });
  });

  describe('notifyDirector', () => {
    it('sends notification to director', async () => {
      const director = createMockAgent({
        id: 'director-001' as ElementId,
        name: 'Director',
        metadata: {
          agentRole: 'director' as const,
          agent: { agentRole: 'director' as const },
        },
      });
      vi.mocked(agentRegistry.getAgentsByRole).mockResolvedValue([director]);
      vi.mocked(agentRegistry.getAgentChannel).mockResolvedValue(createMockChannel());

      const issue: HealthIssue = {
        id: 'issue-001',
        agentId: 'agent-001' as EntityId,
        agentName: 'Worker 1',
        agentRole: 'worker',
        issueType: 'process_crashed',
        severity: 'critical',
        description: 'Agent crashed',
        detectedAt: createTimestamp(),
        lastSeenAt: createTimestamp(),
        occurrenceCount: 1,
      };

      const result = await service.notifyDirector(issue);
      expect(result).toBe(true);
      expect(dispatchService.notifyAgent).toHaveBeenCalled();
    });

    it('returns false when no director found', async () => {
      vi.mocked(agentRegistry.getAgentsByRole).mockResolvedValue([]);

      const issue: HealthIssue = {
        id: 'issue-001',
        agentId: 'agent-001' as EntityId,
        agentName: 'Worker 1',
        agentRole: 'worker',
        issueType: 'process_crashed',
        severity: 'critical',
        description: 'Agent crashed',
        detectedAt: createTimestamp(),
        lastSeenAt: createTimestamp(),
        occurrenceCount: 1,
      };

      const result = await service.notifyDirector(issue);
      expect(result).toBe(false);
    });
  });

  describe('reassignTask', () => {
    it('stops agent and reassigns task', async () => {
      vi.mocked(sessionManager.getActiveSession).mockReturnValue(createMockSession());
      vi.mocked(sessionManager.stopSession).mockResolvedValue(undefined);
      vi.mocked(taskAssignment.unassignTask).mockResolvedValue(createMockTask());

      const newAgent = createMockAgent({ id: 'agent-002' as ElementId });
      vi.mocked(dispatchService.smartDispatch).mockResolvedValue({
        task: createMockTask(),
        agent: newAgent,
        notification: {} as Message,
        channel: createMockChannel(),
        isNewAssignment: true,
        dispatchedAt: createTimestamp(),
      } as DispatchResult);

      const result = await service.reassignTask(
        'agent-001' as EntityId,
        'task-001' as ElementId
      );

      expect(result.success).toBe(true);
      expect(result.newAgentId).toBe('agent-002');
    });

    it('returns error when no suitable agent found', async () => {
      vi.mocked(sessionManager.getActiveSession).mockReturnValue(createMockSession());
      vi.mocked(sessionManager.stopSession).mockResolvedValue(undefined);
      vi.mocked(taskAssignment.unassignTask).mockResolvedValue(createMockTask());
      vi.mocked(dispatchService.smartDispatch).mockResolvedValue({
        task: createMockTask(),
        agent: null as unknown as AgentEntity,
        notification: {} as Message,
        channel: createMockChannel(),
        isNewAssignment: false,
        dispatchedAt: createTimestamp(),
      } as DispatchResult);

      const result = await service.reassignTask(
        'agent-001' as EntityId,
        'task-001' as ElementId
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('No suitable agent');
    });
  });

  // ----------------------------------------
  // Lifecycle
  // ----------------------------------------

  describe('start/stop', () => {
    it('starts the health check interval', () => {
      expect(service.isRunning()).toBe(false);

      service.start();
      expect(service.isRunning()).toBe(true);

      service.stop();
      expect(service.isRunning()).toBe(false);
    });

    it('does not start twice', () => {
      service.start();
      service.start(); // Should be no-op
      expect(service.isRunning()).toBe(true);

      service.stop();
    });

    it('does not stop if not running', () => {
      service.stop(); // Should be no-op
      expect(service.isRunning()).toBe(false);
    });
  });

  // ----------------------------------------
  // Statistics
  // ----------------------------------------

  describe('getStats', () => {
    it('returns initial stats', () => {
      const stats = service.getStats();
      expect(stats.totalChecks).toBe(0);
      expect(stats.totalIssuesDetected).toBe(0);
      expect(stats.totalIssuesResolved).toBe(0);
      expect(stats.totalActionsTaken).toBe(0);
      expect(stats.successfulActions).toBe(0);
      expect(stats.failedActions).toBe(0);
      expect(stats.activeIssues).toBe(0);
      expect(stats.monitoredAgents).toBe(0);
    });

    it('tracks activity correctly', () => {
      // Record activity for agent-001 (creates tracker)
      service.recordOutput('agent-001' as EntityId);
      service.recordError('agent-001' as EntityId);
      // Record crash for agent-002 - note: recordCrash doesn't create a tracker,
      // it only creates an issue
      service.recordCrash('agent-002' as EntityId, 1);

      const stats = service.getStats();
      // Only agent-001 has a tracker (from recordOutput/recordError)
      // agent-002 doesn't have a tracker because recordCrash doesn't create one
      expect(stats.monitoredAgents).toBe(1);
      expect(stats.totalIssuesDetected).toBe(1); // From crash
      expect(stats.activeIssues).toBe(1);
    });
  });

  // ----------------------------------------
  // Events
  // ----------------------------------------

  describe('events', () => {
    it('emits issue:detected event', () => {
      const listener = vi.fn();
      service.on('issue:detected', listener);

      service.recordCrash('agent-001' as EntityId, 1);

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(expect.objectContaining({
        issueType: 'process_crashed',
      }));
    });

    it('emits issue:resolved event', () => {
      const listener = vi.fn();
      service.on('issue:resolved', listener);

      service.recordCrash('agent-001' as EntityId, 1);
      const issues = service.getActiveIssues();
      service.resolveIssue(issues[0].id);

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('can unsubscribe from events', () => {
      const listener = vi.fn();
      service.on('issue:detected', listener);
      service.off('issue:detected', listener);

      service.recordCrash('agent-001' as EntityId, 1);

      expect(listener).not.toHaveBeenCalled();
    });
  });

  // ----------------------------------------
  // Type Guards
  // ----------------------------------------

  describe('type guards', () => {
    it('isHealthIssueType validates correctly', async () => {
      const { isHealthIssueType } = await import('./health-steward-service.js');

      expect(isHealthIssueType('no_output')).toBe(true);
      expect(isHealthIssueType('repeated_errors')).toBe(true);
      expect(isHealthIssueType('process_crashed')).toBe(true);
      expect(isHealthIssueType('invalid')).toBe(false);
    });

    it('isHealthIssueSeverity validates correctly', async () => {
      const { isHealthIssueSeverity } = await import('./health-steward-service.js');

      expect(isHealthIssueSeverity('warning')).toBe(true);
      expect(isHealthIssueSeverity('error')).toBe(true);
      expect(isHealthIssueSeverity('critical')).toBe(true);
      expect(isHealthIssueSeverity('invalid')).toBe(false);
    });

    it('isHealthAction validates correctly', async () => {
      const { isHealthAction } = await import('./health-steward-service.js');

      expect(isHealthAction('monitor')).toBe(true);
      expect(isHealthAction('restart')).toBe(true);
      expect(isHealthAction('escalate')).toBe(true);
      expect(isHealthAction('invalid')).toBe(false);
    });
  });
});

/**
 * Orchestrator Server Integration Tests
 *
 * Tests for the orchestrator server API endpoints.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import { createStorage, initializeSchema } from '@elemental/storage';
import { createElementalAPI, type ElementalAPI } from '@elemental/sdk';
import { createEntity, EntityTypeValue, type EntityId } from '@elemental/core';
import {
  createAgentRegistry,
  createSpawnerService,
  createSessionManager,
  createTaskAssignmentService,
  createDispatchService,
  type AgentRegistry,
  type SpawnerService,
  type SessionManager,
  type TaskAssignmentService,
  type DispatchService,
} from '@elemental/orchestrator-sdk';
import { createTask, TaskStatus, Priority, Complexity, type Task } from '@elemental/core';

// Test services
let api: ElementalAPI;
let agentRegistry: AgentRegistry;
let spawnerService: SpawnerService;
let sessionManager: SessionManager;
let taskAssignmentService: TaskAssignmentService;
let dispatchService: DispatchService;
let systemEntity: EntityId;
let testDbPath: string;

// Setup test environment
beforeEach(async () => {
  // Create a temporary database
  testDbPath = `/tmp/orchestrator-server-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`;
  const storage = createStorage({ path: testDbPath });
  initializeSchema(storage);

  // Initialize test services
  api = createElementalAPI(storage);
  agentRegistry = createAgentRegistry(api);
  spawnerService = createSpawnerService({
    workingDirectory: process.cwd(),
  });
  sessionManager = createSessionManager(spawnerService, api, agentRegistry);
  taskAssignmentService = createTaskAssignmentService(api);
  dispatchService = createDispatchService(api, taskAssignmentService, agentRegistry);

  // Create a system entity for tests
  const entity = await createEntity({
    name: 'test-system',
    entityType: EntityTypeValue.SYSTEM,
    createdBy: 'system:test' as EntityId,
  });
  const saved = await api.create(entity as unknown as Record<string, unknown> & { createdBy: EntityId });
  systemEntity = saved.id as unknown as EntityId;
});

afterEach(() => {
  // Clean up the temporary database
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }
});

describe('AgentRegistry Integration', () => {
  test('should register and retrieve a director agent', async () => {
    const agent = await agentRegistry.registerAgent({
      name: 'test-director',
      role: 'director',
      createdBy: systemEntity,
    });

    expect(agent).toBeDefined();
    expect(agent.name).toBe('test-director');

    // Retrieve the agent
    const agentEntityId = agent.id as unknown as EntityId;
    const retrieved = await agentRegistry.getAgent(agentEntityId);
    expect(retrieved).toBeDefined();
    expect(retrieved?.id).toBe(agent.id);
    expect(retrieved?.name).toBe('test-director');
  });

  test('should register and retrieve a worker agent', async () => {
    const agent = await agentRegistry.registerAgent({
      name: 'test-worker',
      role: 'worker',
      workerMode: 'ephemeral',
      createdBy: systemEntity,
      capabilities: {
        skills: ['typescript', 'testing'],
        languages: ['typescript', 'javascript'],
        maxConcurrentTasks: 2,
      },
    });

    expect(agent).toBeDefined();
    expect(agent.name).toBe('test-worker');

    // Verify capabilities stored in metadata
    const agentEntityId = agent.id as unknown as EntityId;
    const retrieved = await agentRegistry.getAgent(agentEntityId);
    expect(retrieved).toBeDefined();
  });

  test('should list agents by role', async () => {
    // Register multiple agents
    await agentRegistry.registerAgent({ name: 'director-1', role: 'director', createdBy: systemEntity });
    await agentRegistry.registerAgent({ name: 'worker-1', role: 'worker', workerMode: 'ephemeral', createdBy: systemEntity });
    await agentRegistry.registerAgent({ name: 'worker-2', role: 'worker', workerMode: 'persistent', createdBy: systemEntity });
    await agentRegistry.registerAgent({ name: 'steward-1', role: 'steward', stewardFocus: 'merge', createdBy: systemEntity });

    const directors = await agentRegistry.getAgentsByRole('director');
    expect(directors.length).toBe(1);

    const workers = await agentRegistry.getAgentsByRole('worker');
    expect(workers.length).toBe(2);

    const stewards = await agentRegistry.getAgentsByRole('steward');
    expect(stewards.length).toBe(1);

    const all = await agentRegistry.listAgents();
    expect(all.length).toBe(4);
  });

  test('should create agent channel on registration', async () => {
    const agent = await agentRegistry.registerAgent({
      name: 'test-agent-with-channel',
      role: 'worker',
      workerMode: 'ephemeral',
      createdBy: systemEntity,
    });

    // Channel should be created
    const agentEntityId = agent.id as unknown as EntityId;
    const channel = await agentRegistry.getAgentChannel(agentEntityId);
    expect(channel).toBeDefined();
    expect(channel?.name).toBe(`agent-${agent.id}`);
  });
});

describe('SessionManager Integration', () => {
  test('should track session state', async () => {
    const agent = await agentRegistry.registerAgent({
      name: 'session-test-agent',
      role: 'worker',
      workerMode: 'ephemeral',
      createdBy: systemEntity,
    });

    // Before starting, no active session
    const agentEntityId = agent.id as unknown as EntityId;
    const activeBefore = sessionManager.getActiveSession(agentEntityId);
    expect(activeBefore).toBeUndefined();

    // List sessions should be empty
    const sessions = sessionManager.listSessions({ agentId: agentEntityId });
    expect(sessions.length).toBe(0);
  });

  test('should filter sessions correctly', async () => {
    const agent1 = await agentRegistry.registerAgent({
      name: 'filter-test-agent-1',
      role: 'worker',
      workerMode: 'ephemeral',
      createdBy: systemEntity,
    });

    const agent2 = await agentRegistry.registerAgent({
      name: 'filter-test-agent-2',
      role: 'director',
      createdBy: systemEntity,
    });

    // Filter by role
    const workerAgents = await agentRegistry.getAgentsByRole('worker');
    expect(workerAgents.some(a => a.id === agent1.id)).toBe(true);
    expect(workerAgents.some(a => a.id === agent2.id)).toBe(false);

    const directorAgents = await agentRegistry.getAgentsByRole('director');
    expect(directorAgents.some(a => a.id === agent2.id)).toBe(true);
    expect(directorAgents.some(a => a.id === agent1.id)).toBe(false);
  });
});

describe('API Endpoint Structures', () => {
  test('SessionRecord format is correct', async () => {
    const agent = await agentRegistry.registerAgent({
      name: 'record-test-agent',
      role: 'worker',
      workerMode: 'ephemeral',
      createdBy: systemEntity,
    });

    // Verify the session manager can be called without errors
    const agentEntityId = agent.id as unknown as EntityId;
    const noSession = sessionManager.getActiveSession(agentEntityId);
    expect(noSession).toBeUndefined();

    // Get session history
    const history = await sessionManager.getSessionHistory(agentEntityId, 5);
    expect(Array.isArray(history)).toBe(true);
  });
});

describe('Task Assignment Service Integration', () => {
  test('should assign task to agent', async () => {
    // Register a worker
    const worker = await agentRegistry.registerAgent({
      name: 'task-test-worker',
      role: 'worker',
      workerMode: 'ephemeral',
      createdBy: systemEntity,
      capabilities: {
        skills: ['typescript', 'testing'],
        languages: ['typescript'],
        maxConcurrentTasks: 3,
      },
    });

    // Create a task
    const task = await createTask({
      title: 'Test task for assignment',
      createdBy: systemEntity,
      priority: Priority.MEDIUM,
      complexity: Complexity.MEDIUM,
    });
    const savedTask = await api.create(task as unknown as Record<string, unknown> & { createdBy: EntityId });

    // Assign task to worker
    const workerId = worker.id as unknown as EntityId;
    const assignedTask = await taskAssignmentService.assignToAgent(
      savedTask.id,
      workerId,
    );

    // Verify assignment
    expect(assignedTask.assignee).toBe(workerId);

    // Check workload
    const workload = await taskAssignmentService.getAgentWorkload(workerId);
    expect(workload.totalTasks).toBe(1);
  });

  test('should get unassigned tasks', async () => {
    // Create multiple tasks
    const task1 = await createTask({
      title: 'Unassigned task 1',
      createdBy: systemEntity,
    });
    const task2 = await createTask({
      title: 'Unassigned task 2',
      createdBy: systemEntity,
    });
    await api.create(task1 as unknown as Record<string, unknown> & { createdBy: EntityId });
    await api.create(task2 as unknown as Record<string, unknown> & { createdBy: EntityId });

    // Get unassigned tasks
    const unassigned = await taskAssignmentService.getUnassignedTasks();
    expect(unassigned.length).toBeGreaterThanOrEqual(2);
  });

  test('should track agent workload correctly', async () => {
    const worker = await agentRegistry.registerAgent({
      name: 'workload-test-worker',
      role: 'worker',
      workerMode: 'ephemeral',
      createdBy: systemEntity,
      capabilities: {
        skills: ['backend'],
        languages: ['typescript'],
        maxConcurrentTasks: 2,
      },
    });

    const workerId = worker.id as unknown as EntityId;

    // Initially has capacity
    const hasCapacityBefore = await taskAssignmentService.agentHasCapacity(workerId);
    expect(hasCapacityBefore).toBe(true);

    // Assign two tasks
    const task1 = await createTask({ title: 'Task 1', createdBy: systemEntity });
    const task2 = await createTask({ title: 'Task 2', createdBy: systemEntity });
    const saved1 = await api.create(task1 as unknown as Record<string, unknown> & { createdBy: EntityId });
    const saved2 = await api.create(task2 as unknown as Record<string, unknown> & { createdBy: EntityId });

    await taskAssignmentService.assignToAgent(saved1.id, workerId);
    await taskAssignmentService.assignToAgent(saved2.id, workerId);

    // Check workload after
    const workload = await taskAssignmentService.getAgentWorkload(workerId);
    expect(workload.totalTasks).toBe(2);
  });
});

describe('Dispatch Service Integration', () => {
  test('should dispatch task to agent with notification', async () => {
    // Register a worker
    const worker = await agentRegistry.registerAgent({
      name: 'dispatch-test-worker',
      role: 'worker',
      workerMode: 'ephemeral',
      createdBy: systemEntity,
      capabilities: {
        skills: ['frontend'],
        languages: ['typescript', 'javascript'],
        maxConcurrentTasks: 3,
      },
    });

    // Create a task
    const task = await createTask({
      title: 'Task for dispatch test',
      createdBy: systemEntity,
    });
    const savedTask = await api.create(task as unknown as Record<string, unknown> & { createdBy: EntityId });

    // Dispatch the task
    const workerId = worker.id as unknown as EntityId;
    const result = await dispatchService.dispatch(savedTask.id, workerId, {
      priority: 5,
      dispatchedBy: systemEntity,
    });

    // Verify dispatch result
    expect(result.task.assignee).toBe(workerId);
    expect(result.agent.id).toBe(worker.id);
    expect(result.isNewAssignment).toBe(true);
    expect(result.notification).toBeDefined();
    expect(result.channel).toBeDefined();
  });

  test('should find candidates for task', async () => {
    // Register workers with different capabilities
    await agentRegistry.registerAgent({
      name: 'frontend-worker',
      role: 'worker',
      workerMode: 'ephemeral',
      createdBy: systemEntity,
      capabilities: {
        skills: ['frontend', 'react'],
        languages: ['typescript', 'javascript'],
        maxConcurrentTasks: 3,
      },
    });

    await agentRegistry.registerAgent({
      name: 'backend-worker',
      role: 'worker',
      workerMode: 'ephemeral',
      createdBy: systemEntity,
      capabilities: {
        skills: ['backend', 'database'],
        languages: ['typescript', 'python'],
        maxConcurrentTasks: 3,
      },
    });

    // Create a task with capability requirements
    const task = await createTask({
      title: 'Frontend task',
      createdBy: systemEntity,
      metadata: {
        capabilityRequirements: {
          requiredSkills: ['frontend'],
          preferredSkills: ['react'],
        },
      },
    });
    const savedTask = await api.create(task as unknown as Record<string, unknown> & { createdBy: EntityId });

    // Get candidates
    const candidates = await dispatchService.getCandidates(savedTask.id, {
      eligibleOnly: true,
    });

    // Should find the frontend worker
    expect(candidates.candidates.length).toBeGreaterThanOrEqual(1);
  });

  test('should smart dispatch to best agent', async () => {
    // Register workers
    const frontendWorker = await agentRegistry.registerAgent({
      name: 'smart-dispatch-frontend',
      role: 'worker',
      workerMode: 'ephemeral',
      createdBy: systemEntity,
      capabilities: {
        skills: ['frontend', 'react', 'css'],
        languages: ['typescript', 'javascript'],
        maxConcurrentTasks: 3,
      },
    });

    await agentRegistry.registerAgent({
      name: 'smart-dispatch-backend',
      role: 'worker',
      workerMode: 'ephemeral',
      createdBy: systemEntity,
      capabilities: {
        skills: ['backend', 'api'],
        languages: ['typescript', 'python'],
        maxConcurrentTasks: 3,
      },
    });

    // Create a frontend task
    const task = await createTask({
      title: 'Smart dispatch frontend task',
      createdBy: systemEntity,
      metadata: {
        capabilityRequirements: {
          requiredSkills: ['frontend'],
          preferredSkills: ['react'],
        },
      },
    });
    const savedTask = await api.create(task as unknown as Record<string, unknown> & { createdBy: EntityId });

    // Smart dispatch should pick frontend worker
    const result = await dispatchService.smartDispatch(savedTask.id);

    // Should be dispatched to frontend worker
    expect(result.task.assignee).toBeDefined();
    expect(result.agent.id).toBe(frontendWorker.id);
  });
});

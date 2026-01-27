/**
 * Elemental Orchestrator Server
 *
 * HTTP + WebSocket server for the Elemental Orchestrator web platform.
 * Extends the base Elemental server with agent session and worktree management.
 *
 * This server provides:
 * - All base Elemental API endpoints (tasks, entities, documents, etc.)
 * - Agent session management (start, stop, resume, status)
 * - SSE streaming for headless agent output
 * - WebSocket for interactive terminals
 * - Worktree management endpoints
 *
 * @module
 */

import { resolve, dirname } from 'node:path';
import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import { streamSSE } from 'hono/streaming';
// Core types
import type { EntityId, ElementId, Task } from '@elemental/core';
import { createTimestamp, createTask, TaskStatus, ElementType, Priority, Complexity } from '@elemental/core';
// Storage layer
import { createStorage, initializeSchema } from '@elemental/storage';
// SDK - API and services
import { createElementalAPI } from '@elemental/sdk';
import type { ElementalAPI } from '@elemental/sdk';
// Orchestrator SDK
import {
  createOrchestratorAPI,
  createAgentRegistry,
  createSessionManager,
  createSpawnerService,
  createWorktreeManager,
  createTaskAssignmentService,
  createDispatchService,
  createRoleDefinitionService,
  createWorkerTaskService,
  // Capability service functions (no CapabilityService class - it's just utility functions)
  getTaskCapabilityRequirements,
  setTaskCapabilityRequirements,
  type OrchestratorAPI,
  type AgentRegistry,
  type SessionManager,
  type SpawnerService,
  type WorktreeManager,
  type TaskAssignmentService,
  type DispatchService,
  type RoleDefinitionService,
  type WorkerTaskService,
  type SessionRecord,
  type SessionFilter,
  type WorktreeInfo,
  type SpawnedSessionEvent,
  type DispatchResult,
  type SmartDispatchCandidatesResult,
  type TaskCapabilityRequirements,
  type OrchestratorTaskMeta,
  type AssignmentFilter,
  type AgentWorkloadSummary,
  type StartWorkerOnTaskResult,
  type CompleteTaskResult,
  GitRepositoryNotFoundError,
} from '@elemental/orchestrator-sdk';
import type { ServerWebSocket } from 'bun';

// ============================================================================
// Server Configuration
// ============================================================================

const PORT = parseInt(process.env.ORCHESTRATOR_PORT || process.env.PORT || '3457', 10);
const HOST = process.env.HOST || 'localhost';

// Database path - defaults to .elemental/elemental.db in project root
const PROJECT_ROOT = resolve(dirname(import.meta.path), '../../..');
const DEFAULT_DB_PATH = resolve(PROJECT_ROOT, '.elemental/elemental.db');
const DB_PATH = process.env.ELEMENTAL_DB_PATH || DEFAULT_DB_PATH;

// ============================================================================
// Initialize Services
// ============================================================================

let api: ElementalAPI;
let orchestratorApi: OrchestratorAPI;
let agentRegistry: AgentRegistry;
let sessionManager: SessionManager;
let spawnerService: SpawnerService;
let worktreeManager: WorktreeManager | undefined;
let taskAssignmentService: TaskAssignmentService;
let dispatchService: DispatchService;
let roleDefinitionService: RoleDefinitionService;
let workerTaskService: WorkerTaskService;
let storageBackend: ReturnType<typeof createStorage>;

try {
  storageBackend = createStorage({ path: DB_PATH });
  initializeSchema(storageBackend);
  api = createElementalAPI(storageBackend);
  orchestratorApi = createOrchestratorAPI(storageBackend);

  // Initialize orchestrator services
  agentRegistry = createAgentRegistry(api);
  spawnerService = createSpawnerService({
    workingDirectory: PROJECT_ROOT,
    elementalRoot: PROJECT_ROOT,
  });
  sessionManager = createSessionManager(spawnerService, api, agentRegistry);
  taskAssignmentService = createTaskAssignmentService(api);
  dispatchService = createDispatchService(api, taskAssignmentService, agentRegistry);
  roleDefinitionService = createRoleDefinitionService(api);

  // Try to initialize worktree manager (may fail if not a git repo)
  try {
    worktreeManager = createWorktreeManager({
      workspaceRoot: PROJECT_ROOT,
    });
  } catch (err) {
    if (err instanceof GitRepositoryNotFoundError) {
      console.warn('[orchestrator] Git repository not found - worktree features disabled');
    } else {
      throw err;
    }
  }

  // Initialize worker task service (TB-O20)
  workerTaskService = createWorkerTaskService(
    api,
    taskAssignmentService,
    agentRegistry,
    dispatchService,
    spawnerService,
    sessionManager,
    worktreeManager
  );

  console.log(`[orchestrator] Connected to database: ${DB_PATH}`);
} catch (error) {
  console.error('[orchestrator] Failed to initialize:', error);
  process.exit(1);
}

// ============================================================================
// Create Hono App
// ============================================================================

const app = new Hono();

// CORS middleware
app.use(
  '*',
  cors({
    origin: ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:5174', 'http://127.0.0.1:5174'],
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'Last-Event-ID'],
    credentials: true,
  })
);

// ============================================================================
// Health Check Endpoint
// ============================================================================

app.get('/api/health', (c) => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    database: DB_PATH,
    services: {
      agentRegistry: 'ready',
      sessionManager: 'ready',
      spawnerService: 'ready',
      worktreeManager: worktreeManager ? 'ready' : 'disabled',
      taskAssignment: 'ready',
      dispatch: 'ready',
      roleDefinition: 'ready',
      workerTask: 'ready',
    },
  });
});

// ============================================================================
// Task Endpoints (TB-O19: Director Creates & Assigns Tasks)
// ============================================================================

/**
 * GET /api/tasks
 * List tasks with optional filtering
 *
 * Query params:
 * - status: Filter by task status (open, in_progress, closed)
 * - assignee: Filter by assigned agent
 * - unassigned: Only show unassigned tasks (true/false)
 * - limit: Maximum number of tasks to return (default 100)
 */
app.get('/api/tasks', async (c) => {
  try {
    const url = new URL(c.req.url);
    const statusParam = url.searchParams.get('status');
    const assigneeParam = url.searchParams.get('assignee');
    const unassignedParam = url.searchParams.get('unassigned');
    const limitParam = url.searchParams.get('limit');
    const limit = limitParam ? parseInt(limitParam, 10) : 100;

    // If unassigned=true, use the optimized method
    if (unassignedParam === 'true') {
      const unassignedTasks = await taskAssignmentService.getUnassignedTasks();
      return c.json({ tasks: unassignedTasks.slice(0, limit).map(formatTaskResponse) });
    }

    // Build filter for assignment-based queries
    if (assigneeParam) {
      const agentAssignments = await taskAssignmentService.getAgentTasks(assigneeParam as EntityId);
      const agentTasks = agentAssignments.map((a) => a.task);
      const filtered = statusParam
        ? agentTasks.filter((t) => t.status === TaskStatus[statusParam.toUpperCase() as keyof typeof TaskStatus])
        : agentTasks;
      return c.json({ tasks: filtered.slice(0, limit).map(formatTaskResponse) });
    }

    // Otherwise, query all tasks from the API
    const allElements = await api.list({ type: ElementType.TASK, limit });
    const tasks = allElements.filter((e): e is Task => e.type === ElementType.TASK);

    // Apply status filter if provided
    const filtered = statusParam
      ? tasks.filter((t) => t.status === TaskStatus[statusParam.toUpperCase() as keyof typeof TaskStatus])
      : tasks;

    return c.json({ tasks: filtered.map(formatTaskResponse) });
  } catch (error) {
    console.error('[orchestrator] Failed to list tasks:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
  }
});

/**
 * GET /api/tasks/unassigned
 * Get unassigned tasks (shortcut for ?unassigned=true)
 */
app.get('/api/tasks/unassigned', async (c) => {
  try {
    const url = new URL(c.req.url);
    const limitParam = url.searchParams.get('limit');
    const limit = limitParam ? parseInt(limitParam, 10) : 100;

    const tasks = await taskAssignmentService.getUnassignedTasks();
    return c.json({ tasks: tasks.slice(0, limit).map(formatTaskResponse) });
  } catch (error) {
    console.error('[orchestrator] Failed to list unassigned tasks:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
  }
});

/**
 * POST /api/tasks
 * Create a new task
 *
 * Body:
 * - title: string (required)
 * - description?: string
 * - priority?: 'critical' | 'high' | 'medium' | 'low'
 * - complexity?: 'trivial' | 'simple' | 'medium' | 'complex' | 'very_complex'
 * - tags?: string[]
 * - capabilityRequirements?: TaskCapabilityRequirements
 * - ephemeral?: boolean
 * - createdBy?: EntityId
 */
app.post('/api/tasks', async (c) => {
  try {
    const body = await c.req.json() as {
      title: string;
      description?: string;
      priority?: 'critical' | 'high' | 'medium' | 'low';
      complexity?: 'trivial' | 'simple' | 'medium' | 'complex' | 'very_complex';
      tags?: string[];
      capabilityRequirements?: TaskCapabilityRequirements;
      ephemeral?: boolean;
      createdBy?: string;
    };

    if (!body.title) {
      return c.json({ error: { code: 'INVALID_INPUT', message: 'title is required' } }, 400);
    }

    // Map string priority/complexity to enum values
    const priorityMap: Record<string, Priority> = {
      critical: Priority.CRITICAL,
      high: Priority.HIGH,
      medium: Priority.MEDIUM,
      low: Priority.LOW,
    };
    const complexityMap: Record<string, Complexity> = {
      trivial: Complexity.TRIVIAL,
      simple: Complexity.SIMPLE,
      medium: Complexity.MEDIUM,
      complex: Complexity.COMPLEX,
      very_complex: Complexity.VERY_COMPLEX,
    };

    // Build metadata including capability requirements and description
    const metadata: Record<string, unknown> = {};
    if (body.capabilityRequirements) {
      metadata.capabilityRequirements = body.capabilityRequirements;
    }
    if (body.description) {
      metadata.description = body.description;
    }

    // Use a system entity for createdBy if not provided
    const createdBy = (body.createdBy ?? 'system') as EntityId;

    // Create the task using core factory
    const taskData = await createTask({
      title: body.title,
      priority: body.priority ? priorityMap[body.priority] : undefined,
      complexity: body.complexity ? complexityMap[body.complexity] : undefined,
      tags: body.tags,
      metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
      ephemeral: body.ephemeral,
      createdBy,
    });

    // Save to database
    const savedTask = await api.create(taskData as unknown as Record<string, unknown> & { createdBy: EntityId });

    return c.json({ task: formatTaskResponse(savedTask as unknown as Task) }, 201);
  } catch (error) {
    console.error('[orchestrator] Failed to create task:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
  }
});

/**
 * GET /api/tasks/:id
 * Get task details
 */
app.get('/api/tasks/:id', async (c) => {
  try {
    const taskId = c.req.param('id') as ElementId;
    const task = await api.get<Task>(taskId);

    if (!task || task.type !== ElementType.TASK) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Task not found' } }, 404);
    }

    // Also get assignment info if assigned
    let assignmentInfo = null;
    if (task.assignee) {
      const agent = await agentRegistry.getAgent(task.assignee);
      if (agent) {
        const meta = (task.metadata as { orchestrator?: OrchestratorTaskMeta })?.orchestrator;
        assignmentInfo = {
          agent: {
            id: agent.id,
            name: agent.name,
            role: (agent.metadata as { agent?: { agentRole?: string } })?.agent?.agentRole,
          },
          branch: meta?.branch,
          worktree: meta?.worktree,
          sessionId: meta?.sessionId,
          mergeStatus: meta?.mergeStatus,
          startedAt: meta?.startedAt,
          completedAt: meta?.completedAt,
        };
      }
    }

    return c.json({
      task: formatTaskResponse(task),
      assignment: assignmentInfo,
    });
  } catch (error) {
    console.error('[orchestrator] Failed to get task:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
  }
});

/**
 * POST /api/tasks/:id/dispatch
 * Dispatch a task to a specific agent
 *
 * Body:
 * - agentId: string (required) - The agent to dispatch to
 * - priority?: number - Dispatch priority (for notification)
 * - restart?: boolean - Signal agent to restart session
 * - markAsStarted?: boolean - Mark task as IN_PROGRESS immediately
 * - branch?: string - Custom branch name
 * - worktree?: string - Custom worktree path
 * - notificationMessage?: string - Custom notification message
 * - dispatchedBy?: string - Entity performing the dispatch
 */
app.post('/api/tasks/:id/dispatch', async (c) => {
  try {
    const taskId = c.req.param('id') as ElementId;
    const body = await c.req.json() as {
      agentId: string;
      priority?: number;
      restart?: boolean;
      markAsStarted?: boolean;
      branch?: string;
      worktree?: string;
      notificationMessage?: string;
      dispatchedBy?: string;
    };

    if (!body.agentId) {
      return c.json({ error: { code: 'INVALID_INPUT', message: 'agentId is required' } }, 400);
    }

    // Verify task exists
    const task = await api.get<Task>(taskId);
    if (!task || task.type !== ElementType.TASK) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Task not found' } }, 404);
    }

    // Verify agent exists
    const agent = await agentRegistry.getAgent(body.agentId as EntityId);
    if (!agent) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Agent not found' } }, 404);
    }

    // Dispatch the task
    const result = await dispatchService.dispatch(taskId, body.agentId as EntityId, {
      priority: body.priority,
      restart: body.restart,
      markAsStarted: body.markAsStarted,
      branch: body.branch,
      worktree: body.worktree,
      notificationMessage: body.notificationMessage,
      dispatchedBy: body.dispatchedBy as EntityId | undefined,
    });

    return c.json({
      success: true,
      task: formatTaskResponse(result.task),
      agent: {
        id: result.agent.id,
        name: result.agent.name,
      },
      notification: {
        id: result.notification.id,
        channelId: result.channel.id,
      },
      isNewAssignment: result.isNewAssignment,
      dispatchedAt: result.dispatchedAt,
    });
  } catch (error) {
    console.error('[orchestrator] Failed to dispatch task:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
  }
});

/**
 * POST /api/tasks/:id/dispatch/smart
 * Smart dispatch - find the best agent and dispatch
 *
 * Body:
 * - eligibleOnly?: boolean - Only consider agents meeting requirements
 * - minScore?: number - Minimum capability score (0-100)
 * - priority?: number - Dispatch priority
 * - restart?: boolean - Signal agent to restart
 * - markAsStarted?: boolean - Mark task as IN_PROGRESS
 * - dispatchedBy?: string - Entity performing the dispatch
 */
app.post('/api/tasks/:id/dispatch/smart', async (c) => {
  try {
    const taskId = c.req.param('id') as ElementId;
    const body = await c.req.json().catch(() => ({})) as {
      eligibleOnly?: boolean;
      minScore?: number;
      priority?: number;
      restart?: boolean;
      markAsStarted?: boolean;
      dispatchedBy?: string;
    };

    // Verify task exists
    const task = await api.get<Task>(taskId);
    if (!task || task.type !== ElementType.TASK) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Task not found' } }, 404);
    }

    // Try smart dispatch
    const result = await dispatchService.smartDispatch(taskId, {
      eligibleOnly: body.eligibleOnly,
      minScore: body.minScore,
      priority: body.priority,
      restart: body.restart,
      markAsStarted: body.markAsStarted,
      dispatchedBy: body.dispatchedBy as EntityId | undefined,
    });

    return c.json({
      success: true,
      task: formatTaskResponse(result.task),
      agent: {
        id: result.agent.id,
        name: result.agent.name,
      },
      notification: {
        id: result.notification.id,
        channelId: result.channel.id,
      },
      isNewAssignment: result.isNewAssignment,
      dispatchedAt: result.dispatchedAt,
    });
  } catch (error) {
    const errorMessage = String(error);
    if (errorMessage.includes('No eligible agents')) {
      return c.json({
        error: { code: 'NO_ELIGIBLE_AGENTS', message: 'No eligible agents found for this task' },
      }, 404);
    }
    console.error('[orchestrator] Failed to smart dispatch task:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: errorMessage } }, 500);
  }
});

/**
 * GET /api/tasks/:id/candidates
 * Get candidate agents for a task ranked by capability match
 */
app.get('/api/tasks/:id/candidates', async (c) => {
  try {
    const taskId = c.req.param('id') as ElementId;
    const url = new URL(c.req.url);
    const eligibleOnly = url.searchParams.get('eligibleOnly') !== 'false';
    const minScoreParam = url.searchParams.get('minScore');
    const minScore = minScoreParam ? parseInt(minScoreParam, 10) : undefined;

    // Verify task exists
    const task = await api.get<Task>(taskId);
    if (!task || task.type !== ElementType.TASK) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Task not found' } }, 404);
    }

    // Get candidates
    const result = await dispatchService.getCandidates(taskId, {
      eligibleOnly,
      minScore,
    });

    return c.json({
      task: {
        id: task.id,
        title: task.title,
      },
      hasRequirements: result.hasRequirements,
      requirements: result.requirements,
      candidates: result.candidates.map((entry) => ({
        agent: {
          id: entry.agent.id,
          name: entry.agent.name,
          role: (entry.agent.metadata as { agent?: { agentRole?: string } })?.agent?.agentRole,
          capabilities: (entry.agent.metadata as { agent?: { capabilities?: unknown } })?.agent?.capabilities,
        },
        isEligible: entry.matchResult.isEligible,
        score: entry.matchResult.score,
        matchDetails: {
          matchedRequiredSkills: entry.matchResult.matchedRequiredSkills,
          matchedPreferredSkills: entry.matchResult.matchedPreferredSkills,
          matchedRequiredLanguages: entry.matchResult.matchedRequiredLanguages,
          matchedPreferredLanguages: entry.matchResult.matchedPreferredLanguages,
          missingRequiredSkills: entry.matchResult.missingRequiredSkills,
          missingRequiredLanguages: entry.matchResult.missingRequiredLanguages,
        },
      })),
      bestCandidate: result.bestCandidate ? {
        agent: {
          id: result.bestCandidate.agent.id,
          name: result.bestCandidate.agent.name,
        },
        score: result.bestCandidate.matchResult.score,
      } : null,
    });
  } catch (error) {
    console.error('[orchestrator] Failed to get task candidates:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
  }
});

/**
 * GET /api/agents/:id/workload
 * Get agent's current workload and capacity
 */
app.get('/api/agents/:id/workload', async (c) => {
  try {
    const agentId = c.req.param('id') as EntityId;

    // Verify agent exists
    const agent = await agentRegistry.getAgent(agentId);
    if (!agent) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Agent not found' } }, 404);
    }

    // Get workload
    const workload = await taskAssignmentService.getAgentWorkload(agentId);
    const hasCapacity = await taskAssignmentService.agentHasCapacity(agentId);

    // Get agent capabilities for max concurrent tasks
    const agentMeta = (agent.metadata as { agent?: { capabilities?: { maxConcurrentTasks?: number } } })?.agent;
    const maxConcurrentTasks = agentMeta?.capabilities?.maxConcurrentTasks ?? 3;

    return c.json({
      agentId,
      agentName: agent.name,
      workload,
      hasCapacity,
      maxConcurrentTasks,
    });
  } catch (error) {
    console.error('[orchestrator] Failed to get agent workload:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
  }
});

// ============================================================================
// Worker Task Endpoints (TB-O20: Worker Picks Up Task with Worktree)
// ============================================================================

/**
 * POST /api/tasks/:id/start-worker
 * Start a worker on a task with worktree isolation
 *
 * This endpoint orchestrates the complete workflow:
 * 1. Creates a worktree for the task (if worktrees enabled)
 * 2. Dispatches the task to the worker (assigns + notifies)
 * 3. Spawns the worker session in the worktree
 * 4. Sends task context to the worker
 *
 * Body:
 * - agentId: string (required) - The worker agent to start
 * - branch?: string - Custom branch name
 * - worktreePath?: string - Custom worktree path
 * - baseBranch?: string - Base branch for worktree
 * - additionalPrompt?: string - Additional instructions for the worker
 * - skipWorktree?: boolean - Skip worktree creation
 * - workingDirectory?: string - Custom working directory (if skipWorktree)
 * - priority?: number - Dispatch priority
 * - performedBy?: string - Entity performing the operation
 */
app.post('/api/tasks/:id/start-worker', async (c) => {
  try {
    const taskId = c.req.param('id') as ElementId;
    const body = await c.req.json() as {
      agentId: string;
      branch?: string;
      worktreePath?: string;
      baseBranch?: string;
      additionalPrompt?: string;
      skipWorktree?: boolean;
      workingDirectory?: string;
      priority?: number;
      performedBy?: string;
    };

    if (!body.agentId) {
      return c.json({ error: { code: 'INVALID_INPUT', message: 'agentId is required' } }, 400);
    }

    // Verify task exists
    const task = await api.get<Task>(taskId);
    if (!task || task.type !== ElementType.TASK) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Task not found' } }, 404);
    }

    // Verify agent exists
    const agent = await agentRegistry.getAgent(body.agentId as EntityId);
    if (!agent) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Agent not found' } }, 404);
    }

    // Start the worker on the task
    const result = await workerTaskService.startWorkerOnTask(
      taskId,
      body.agentId as EntityId,
      {
        branch: body.branch,
        worktreePath: body.worktreePath,
        baseBranch: body.baseBranch,
        additionalPrompt: body.additionalPrompt,
        skipWorktree: body.skipWorktree,
        workingDirectory: body.workingDirectory,
        priority: body.priority,
        performedBy: body.performedBy as EntityId | undefined,
      }
    );

    return c.json({
      success: true,
      task: formatTaskResponse(result.task),
      agent: {
        id: result.agent.id,
        name: result.agent.name,
      },
      session: {
        id: result.session.id,
        claudeSessionId: result.session.claudeSessionId,
        status: result.session.status,
        workingDirectory: result.session.workingDirectory,
      },
      worktree: result.worktree ? {
        path: result.worktree.path,
        branch: result.worktree.branch,
        branchCreated: result.worktree.branchCreated,
      } : null,
      dispatch: {
        notificationId: result.dispatch.notification.id,
        channelId: result.dispatch.channel.id,
        isNewAssignment: result.dispatch.isNewAssignment,
      },
      startedAt: result.startedAt,
    }, 201);
  } catch (error) {
    const errorMessage = String(error);
    if (errorMessage.includes('not a worker')) {
      return c.json({
        error: { code: 'INVALID_AGENT', message: 'Agent is not a worker' },
      }, 400);
    }
    console.error('[orchestrator] Failed to start worker on task:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: errorMessage } }, 500);
  }
});

/**
 * POST /api/tasks/:id/complete
 * Complete a task and mark branch as ready for merge
 *
 * Body:
 * - summary?: string - Summary of what was accomplished
 * - commitHash?: string - Final commit hash
 * - performedBy?: string - Entity completing the task
 */
app.post('/api/tasks/:id/complete', async (c) => {
  try {
    const taskId = c.req.param('id') as ElementId;
    const body = await c.req.json().catch(() => ({})) as {
      summary?: string;
      commitHash?: string;
      performedBy?: string;
    };

    // Verify task exists
    const task = await api.get<Task>(taskId);
    if (!task || task.type !== ElementType.TASK) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Task not found' } }, 404);
    }

    // Complete the task
    const result = await workerTaskService.completeTask(taskId, {
      summary: body.summary,
      commitHash: body.commitHash,
      performedBy: body.performedBy as EntityId | undefined,
    });

    return c.json({
      success: true,
      task: formatTaskResponse(result.task),
      worktree: result.worktree ? {
        path: result.worktree.path,
        branch: result.worktree.branch,
        state: result.worktree.state,
      } : null,
      readyForMerge: result.readyForMerge,
      completedAt: result.completedAt,
    });
  } catch (error) {
    console.error('[orchestrator] Failed to complete task:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
  }
});

/**
 * GET /api/tasks/:id/context
 * Get task context prompt for a worker
 *
 * Query params:
 * - additionalInstructions?: string - Additional instructions to include
 */
app.get('/api/tasks/:id/context', async (c) => {
  try {
    const taskId = c.req.param('id') as ElementId;
    const url = new URL(c.req.url);
    const additionalInstructions = url.searchParams.get('additionalInstructions') ?? undefined;

    // Verify task exists
    const task = await api.get<Task>(taskId);
    if (!task || task.type !== ElementType.TASK) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Task not found' } }, 404);
    }

    const context = await workerTaskService.getTaskContext(taskId);
    const prompt = await workerTaskService.buildTaskContextPrompt(taskId, additionalInstructions);

    return c.json({
      task: {
        id: task.id,
        title: task.title,
      },
      context,
      prompt,
    });
  } catch (error) {
    console.error('[orchestrator] Failed to get task context:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
  }
});

/**
 * POST /api/tasks/:id/cleanup
 * Clean up task worktree after completion
 *
 * Body:
 * - deleteBranch?: boolean - Whether to delete the branch (default false)
 */
app.post('/api/tasks/:id/cleanup', async (c) => {
  try {
    const taskId = c.req.param('id') as ElementId;
    const body = await c.req.json().catch(() => ({})) as {
      deleteBranch?: boolean;
    };

    // Verify task exists
    const task = await api.get<Task>(taskId);
    if (!task || task.type !== ElementType.TASK) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Task not found' } }, 404);
    }

    const success = await workerTaskService.cleanupTask(taskId, body.deleteBranch ?? false);

    return c.json({
      success,
      taskId,
      deletedBranch: success && (body.deleteBranch ?? false),
    });
  } catch (error) {
    console.error('[orchestrator] Failed to cleanup task:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
  }
});

// ============================================================================
// Agent Endpoints
// ============================================================================

/**
 * GET /api/agents
 * List all registered agents
 */
app.get('/api/agents', async (c) => {
  try {
    const url = new URL(c.req.url);
    const role = url.searchParams.get('role') as 'director' | 'worker' | 'steward' | null;
    const agents = role
      ? await agentRegistry.getAgentsByRole(role)
      : await agentRegistry.listAgents();
    return c.json({ agents });
  } catch (error) {
    console.error('[orchestrator] Failed to list agents:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
  }
});

/**
 * GET /api/agents/:id
 * Get agent details
 */
app.get('/api/agents/:id', async (c) => {
  try {
    const agentId = c.req.param('id') as EntityId;
    const agent = await agentRegistry.getAgent(agentId);
    if (!agent) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Agent not found' } }, 404);
    }
    return c.json({ agent });
  } catch (error) {
    console.error('[orchestrator] Failed to get agent:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
  }
});

/**
 * GET /api/agents/:id/status
 * Get agent session status
 */
app.get('/api/agents/:id/status', async (c) => {
  try {
    const agentId = c.req.param('id') as EntityId;
    const agent = await agentRegistry.getAgent(agentId);
    if (!agent) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Agent not found' } }, 404);
    }

    const activeSession = sessionManager.getActiveSession(agentId);
    const history = await sessionManager.getSessionHistory(agentId, 5);

    return c.json({
      agentId,
      hasActiveSession: !!activeSession,
      activeSession: activeSession ? formatSessionRecord(activeSession) : null,
      recentHistory: history,
    });
  } catch (error) {
    console.error('[orchestrator] Failed to get agent status:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
  }
});

// ============================================================================
// Session Management Endpoints
// ============================================================================

/**
 * POST /api/agents/:id/start
 * Start a new agent session
 */
app.post('/api/agents/:id/start', async (c) => {
  try {
    const agentId = c.req.param('id') as EntityId;
    const body = await c.req.json().catch(() => ({})) as {
      workingDirectory?: string;
      worktree?: string;
      initialPrompt?: string;
      interactive?: boolean;
    };

    const agent = await agentRegistry.getAgent(agentId);
    if (!agent) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Agent not found' } }, 404);
    }

    // Check if agent already has an active session
    const existingSession = sessionManager.getActiveSession(agentId);
    if (existingSession) {
      return c.json({
        error: { code: 'SESSION_EXISTS', message: 'Agent already has an active session' },
        existingSession: formatSessionRecord(existingSession),
      }, 409);
    }

    const { session, events } = await sessionManager.startSession(agentId, {
      workingDirectory: body.workingDirectory,
      worktree: body.worktree,
      initialPrompt: body.initialPrompt,
      interactive: body.interactive,
    });

    return c.json({
      success: true,
      session: formatSessionRecord(session),
    }, 201);
  } catch (error) {
    console.error('[orchestrator] Failed to start session:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
  }
});

/**
 * POST /api/agents/:id/stop
 * Stop an agent session
 */
app.post('/api/agents/:id/stop', async (c) => {
  try {
    const agentId = c.req.param('id') as EntityId;
    const body = await c.req.json().catch(() => ({})) as {
      graceful?: boolean;
      reason?: string;
    };

    const activeSession = sessionManager.getActiveSession(agentId);
    if (!activeSession) {
      return c.json({ error: { code: 'NO_SESSION', message: 'Agent has no active session' } }, 404);
    }

    await sessionManager.stopSession(activeSession.id, {
      graceful: body.graceful,
      reason: body.reason,
    });

    return c.json({
      success: true,
      sessionId: activeSession.id,
    });
  } catch (error) {
    console.error('[orchestrator] Failed to stop session:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
  }
});

/**
 * POST /api/agents/:id/resume
 * Resume a previous agent session
 */
app.post('/api/agents/:id/resume', async (c) => {
  try {
    const agentId = c.req.param('id') as EntityId;
    const body = await c.req.json().catch(() => ({})) as {
      claudeSessionId?: string;
      workingDirectory?: string;
      worktree?: string;
      resumePrompt?: string;
      checkReadyQueue?: boolean;
    };

    const agent = await agentRegistry.getAgent(agentId);
    if (!agent) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Agent not found' } }, 404);
    }

    // Check if agent already has an active session
    const existingSession = sessionManager.getActiveSession(agentId);
    if (existingSession) {
      return c.json({
        error: { code: 'SESSION_EXISTS', message: 'Agent already has an active session' },
        existingSession: formatSessionRecord(existingSession),
      }, 409);
    }

    // Get the session ID to resume
    let claudeSessionId = body.claudeSessionId;
    if (!claudeSessionId) {
      // Try to get the most recent resumable session
      const resumable = sessionManager.getMostRecentResumableSession(agentId);
      if (!resumable?.claudeSessionId) {
        return c.json({
          error: { code: 'NO_RESUMABLE_SESSION', message: 'No resumable session found for this agent' },
        }, 404);
      }
      claudeSessionId = resumable.claudeSessionId;
    }

    const { session, events, uwpCheck } = await sessionManager.resumeSession(agentId, {
      claudeSessionId,
      workingDirectory: body.workingDirectory,
      worktree: body.worktree,
      resumePrompt: body.resumePrompt,
      checkReadyQueue: body.checkReadyQueue,
    });

    return c.json({
      success: true,
      session: formatSessionRecord(session),
      uwpCheck,
    }, 201);
  } catch (error) {
    console.error('[orchestrator] Failed to resume session:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
  }
});

/**
 * GET /api/agents/:id/stream
 * SSE stream for headless agent output
 */
app.get('/api/agents/:id/stream', async (c) => {
  const agentId = c.req.param('id') as EntityId;
  const lastEventId = c.req.header('Last-Event-ID');

  const activeSession = sessionManager.getActiveSession(agentId);
  if (!activeSession) {
    return c.json({ error: { code: 'NO_SESSION', message: 'Agent has no active session' } }, 404);
  }

  const events = spawnerService.getEventEmitter(activeSession.id);
  if (!events) {
    return c.json({ error: { code: 'NO_EVENTS', message: 'Session event emitter not available' } }, 404);
  }

  return streamSSE(c, async (stream) => {
    let eventId = 0;

    // Send initial connection event
    await stream.writeSSE({
      id: String(++eventId),
      event: 'connected',
      data: JSON.stringify({
        sessionId: activeSession.id,
        agentId,
        timestamp: createTimestamp(),
      }),
    });

    // Set up event handlers
    const onEvent = async (event: SpawnedSessionEvent) => {
      await stream.writeSSE({
        id: String(++eventId),
        event: `agent_${event.type}`,
        data: JSON.stringify(event),
      });
    };

    const onError = async (error: Error) => {
      await stream.writeSSE({
        id: String(++eventId),
        event: 'agent_error',
        data: JSON.stringify({ error: error.message }),
      });
    };

    const onExit = async (code: number | null, signal: string | null) => {
      await stream.writeSSE({
        id: String(++eventId),
        event: 'agent_exit',
        data: JSON.stringify({ code, signal }),
      });
    };

    events.on('event', onEvent);
    events.on('error', onError);
    events.on('exit', onExit);

    // Keep connection alive with heartbeat
    const heartbeatInterval = setInterval(async () => {
      try {
        await stream.writeSSE({
          id: String(++eventId),
          event: 'heartbeat',
          data: JSON.stringify({ timestamp: createTimestamp() }),
        });
      } catch {
        // Connection closed
        clearInterval(heartbeatInterval);
      }
    }, 30000);

    // Clean up on close
    stream.onAbort(() => {
      clearInterval(heartbeatInterval);
      events.off('event', onEvent);
      events.off('error', onError);
      events.off('exit', onExit);
    });

    // Keep the stream open until client disconnects
    await new Promise(() => {});
  });
});

/**
 * POST /api/agents/:id/input
 * Send input to a headless agent
 */
app.post('/api/agents/:id/input', async (c) => {
  try {
    const agentId = c.req.param('id') as EntityId;
    const body = await c.req.json() as {
      input: string;
      isUserMessage?: boolean;
    };

    if (!body.input) {
      return c.json({ error: { code: 'INVALID_INPUT', message: 'Input is required' } }, 400);
    }

    const activeSession = sessionManager.getActiveSession(agentId);
    if (!activeSession) {
      return c.json({ error: { code: 'NO_SESSION', message: 'Agent has no active session' } }, 404);
    }

    await spawnerService.sendInput(activeSession.id, body.input, {
      isUserMessage: body.isUserMessage,
    });

    return c.json({
      success: true,
      sessionId: activeSession.id,
    }, 202);
  } catch (error) {
    console.error('[orchestrator] Failed to send input:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
  }
});

// ============================================================================
// Session Listing Endpoints
// ============================================================================

/**
 * GET /api/sessions
 * List all sessions with optional filtering
 */
app.get('/api/sessions', async (c) => {
  try {
    const url = new URL(c.req.url);

    const agentIdParam = url.searchParams.get('agentId');
    const roleParam = url.searchParams.get('role');
    const statusParam = url.searchParams.get('status');
    const resumableParam = url.searchParams.get('resumable');

    const filter: SessionFilter = {
      ...(agentIdParam && { agentId: agentIdParam as EntityId }),
      ...(roleParam && { role: roleParam as 'director' | 'worker' | 'steward' }),
      ...(statusParam && {
        status: statusParam.includes(',')
          ? statusParam.split(',') as ('starting' | 'running' | 'suspended' | 'terminating' | 'terminated')[]
          : statusParam as 'starting' | 'running' | 'suspended' | 'terminating' | 'terminated'
      }),
      ...(resumableParam === 'true' && { resumable: true }),
    };

    const sessions = sessionManager.listSessions(filter);
    return c.json({ sessions: sessions.map(formatSessionRecord) });
  } catch (error) {
    console.error('[orchestrator] Failed to list sessions:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
  }
});

/**
 * GET /api/sessions/:id
 * Get session details
 */
app.get('/api/sessions/:id', async (c) => {
  try {
    const sessionId = c.req.param('id');
    const session = sessionManager.getSession(sessionId);
    if (!session) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Session not found' } }, 404);
    }
    return c.json({ session: formatSessionRecord(session) });
  } catch (error) {
    console.error('[orchestrator] Failed to get session:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
  }
});

// ============================================================================
// Worktree Endpoints
// ============================================================================

/**
 * GET /api/worktrees
 * List all active worktrees
 */
app.get('/api/worktrees', async (c) => {
  try {
    if (!worktreeManager) {
      return c.json({ error: { code: 'WORKTREES_DISABLED', message: 'Worktree management is disabled (no git repository)' } }, 503);
    }

    const worktrees = await worktreeManager.listWorktrees();
    return c.json({ worktrees: worktrees.map(formatWorktreeInfo) });
  } catch (error) {
    console.error('[orchestrator] Failed to list worktrees:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
  }
});

/**
 * GET /api/worktrees/:path
 * Get worktree details by path
 */
app.get('/api/worktrees/:path', async (c) => {
  try {
    if (!worktreeManager) {
      return c.json({ error: { code: 'WORKTREES_DISABLED', message: 'Worktree management is disabled (no git repository)' } }, 503);
    }

    const worktreePath = decodeURIComponent(c.req.param('path'));
    const worktree = await worktreeManager.getWorktree(worktreePath);
    if (!worktree) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Worktree not found' } }, 404);
    }
    return c.json({ worktree: formatWorktreeInfo(worktree) });
  } catch (error) {
    console.error('[orchestrator] Failed to get worktree:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
  }
});

/**
 * POST /api/worktrees
 * Create a new worktree
 */
app.post('/api/worktrees', async (c) => {
  try {
    if (!worktreeManager) {
      return c.json({ error: { code: 'WORKTREES_DISABLED', message: 'Worktree management is disabled (no git repository)' } }, 503);
    }

    const body = await c.req.json() as {
      agentName: string;
      taskId: string;
      taskTitle?: string;
      customBranch?: string;
      customPath?: string;
      baseBranch?: string;
    };

    if (!body.agentName || !body.taskId) {
      return c.json({ error: { code: 'INVALID_INPUT', message: 'agentName and taskId are required' } }, 400);
    }

    const result = await worktreeManager.createWorktree({
      agentName: body.agentName,
      taskId: body.taskId as ElementId,
      taskTitle: body.taskTitle,
      customBranch: body.customBranch,
      customPath: body.customPath,
      baseBranch: body.baseBranch,
    });

    return c.json({
      success: true,
      worktree: formatWorktreeInfo(result.worktree),
      branch: result.branch,
      path: result.path,
      branchCreated: result.branchCreated,
    }, 201);
  } catch (error) {
    console.error('[orchestrator] Failed to create worktree:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
  }
});

/**
 * DELETE /api/worktrees/:path
 * Remove a worktree
 */
app.delete('/api/worktrees/:path', async (c) => {
  try {
    if (!worktreeManager) {
      return c.json({ error: { code: 'WORKTREES_DISABLED', message: 'Worktree management is disabled (no git repository)' } }, 503);
    }

    const worktreePath = decodeURIComponent(c.req.param('path'));
    const url = new URL(c.req.url);
    const force = url.searchParams.get('force') === 'true';
    const deleteBranch = url.searchParams.get('deleteBranch') === 'true';

    await worktreeManager.removeWorktree(worktreePath, {
      force,
      deleteBranch,
    });

    return c.json({ success: true });
  } catch (error) {
    console.error('[orchestrator] Failed to remove worktree:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
  }
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Format a Task for JSON response
 */
function formatTaskResponse(task: Task) {
  const meta = (task.metadata as { orchestrator?: OrchestratorTaskMeta })?.orchestrator;
  const description = (task.metadata as { description?: string })?.description;
  return {
    id: task.id,
    title: task.title,
    description,
    status: task.status,
    priority: task.priority,
    complexity: task.complexity,
    taskType: task.taskType,
    assignee: task.assignee,
    owner: task.owner,
    deadline: task.deadline,
    scheduledFor: task.scheduledFor,
    ephemeral: task.ephemeral,
    tags: task.tags,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    // Orchestrator-specific metadata
    orchestrator: meta ? {
      branch: meta.branch,
      worktree: meta.worktree,
      sessionId: meta.sessionId,
      assignedAgent: meta.assignedAgent,
      startedAt: meta.startedAt,
      completedAt: meta.completedAt,
      mergeStatus: meta.mergeStatus,
      mergedAt: meta.mergedAt,
      lastTestResult: meta.lastTestResult,
      testRunCount: meta.testRunCount,
    } : null,
  };
}

/**
 * Format a SessionRecord for JSON response
 */
function formatSessionRecord(session: SessionRecord) {
  return {
    id: session.id,
    claudeSessionId: session.claudeSessionId,
    agentId: session.agentId,
    agentRole: session.agentRole,
    workerMode: session.workerMode,
    pid: session.pid,
    status: session.status,
    workingDirectory: session.workingDirectory,
    worktree: session.worktree,
    createdAt: session.createdAt,
    startedAt: session.startedAt,
    lastActivityAt: session.lastActivityAt,
    endedAt: session.endedAt,
    terminationReason: session.terminationReason,
  };
}

/**
 * Format a WorktreeInfo for JSON response
 */
function formatWorktreeInfo(worktree: WorktreeInfo) {
  return {
    path: worktree.path,
    relativePath: worktree.relativePath,
    branch: worktree.branch,
    head: worktree.head,
    isMain: worktree.isMain,
    state: worktree.state,
    agentName: worktree.agentName,
    taskId: worktree.taskId,
    createdAt: worktree.createdAt,
  };
}

// ============================================================================
// WebSocket Handling for Interactive Terminals
// ============================================================================

// WebSocket data interface
interface WSClientData {
  id: string;
  agentId?: EntityId;
  sessionId?: string;
}

// Track WebSocket clients
const wsClients = new Map<string, { ws: ServerWebSocket<WSClientData>; cleanup?: () => void }>();

function generateClientId(): string {
  return `ws-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
}

// WebSocket handlers
function handleWSOpen(ws: ServerWebSocket<WSClientData>): void {
  const clientId = generateClientId();
  ws.data = { id: clientId };
  wsClients.set(clientId, { ws });
  console.log(`[orchestrator:ws] Client connected: ${clientId}`);
}

function handleWSMessage(ws: ServerWebSocket<WSClientData>, message: string | Buffer): void {
  try {
    const data = JSON.parse(message.toString()) as {
      type: string;
      agentId?: string;
      input?: string;
    };

    switch (data.type) {
      case 'subscribe': {
        if (data.agentId) {
          ws.data.agentId = data.agentId as EntityId;
          const activeSession = sessionManager.getActiveSession(data.agentId as EntityId);
          if (activeSession) {
            ws.data.sessionId = activeSession.id;
            // Set up event forwarding
            const events = spawnerService.getEventEmitter(activeSession.id);
            if (events) {
              const onEvent = (event: SpawnedSessionEvent) => {
                ws.send(JSON.stringify({ type: 'event', event }));
              };
              const onError = (error: Error) => {
                ws.send(JSON.stringify({ type: 'error', error: error.message }));
              };
              const onExit = (code: number | null, signal: string | null) => {
                ws.send(JSON.stringify({ type: 'exit', code, signal }));
              };
              events.on('event', onEvent);
              events.on('error', onError);
              events.on('exit', onExit);

              // Store cleanup function
              wsClients.get(ws.data.id)!.cleanup = () => {
                events.off('event', onEvent);
                events.off('error', onError);
                events.off('exit', onExit);
              };
            }
          }
          ws.send(JSON.stringify({
            type: 'subscribed',
            agentId: data.agentId,
            hasSession: !!activeSession,
          }));
        }
        break;
      }
      case 'input': {
        if (ws.data.sessionId && data.input) {
          spawnerService.sendInput(ws.data.sessionId, data.input).catch((err) => {
            ws.send(JSON.stringify({ type: 'error', error: err.message }));
          });
        }
        break;
      }
      case 'ping': {
        ws.send(JSON.stringify({ type: 'pong' }));
        break;
      }
    }
  } catch (err) {
    console.error('[orchestrator:ws] Error handling message:', err);
  }
}

function handleWSClose(ws: ServerWebSocket<WSClientData>): void {
  const client = wsClients.get(ws.data.id);
  if (client?.cleanup) {
    client.cleanup();
  }
  wsClients.delete(ws.data.id);
  console.log(`[orchestrator:ws] Client disconnected: ${ws.data.id}`);
}

// ============================================================================
// Start Server
// ============================================================================

const server = Bun.serve({
  port: PORT,
  hostname: HOST,
  fetch: app.fetch,
  websocket: {
    open(ws: ServerWebSocket<WSClientData>) {
      handleWSOpen(ws);
    },
    message(ws: ServerWebSocket<WSClientData>, message: string | Buffer) {
      handleWSMessage(ws, message);
    },
    close(ws: ServerWebSocket<WSClientData>) {
      handleWSClose(ws);
    },
  },
});

// Upgrade WebSocket connections
app.get('/ws', (c) => {
  const upgraded = server.upgrade(c.req.raw, {
    data: { id: '' },
  });
  if (upgraded) {
    return new Response(null, { status: 101 });
  }
  return c.json({ error: 'WebSocket upgrade failed' }, 400);
});

console.log(`[orchestrator] Server running at http://${HOST}:${PORT}`);
console.log(`[orchestrator] WebSocket available at ws://${HOST}:${PORT}/ws`);

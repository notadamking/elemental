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

import { resolve, dirname, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFile, mkdir } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
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
  createStewardScheduler,
  createDefaultStewardExecutor,
  createPluginExecutor,
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
  type StewardScheduler,
  type PluginExecutor,
  type StewardPlugin,
  type PluginExecutionResult,
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
  type StewardExecutionEntry,
  GitRepositoryNotFoundError,
} from '@elemental/orchestrator-sdk';

// Bun/Node.js compatibility: Use Bun types if available
type ServerWebSocket<T> = {
  data: T;
  send(data: string | ArrayBuffer): void;
  close(): void;
  readyState: number;
};

// Cross-runtime __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================================================
// Server Configuration
// ============================================================================

const PORT = parseInt(process.env.ORCHESTRATOR_PORT || process.env.PORT || '3457', 10);
const HOST = process.env.HOST || 'localhost';

// Database path - defaults to .elemental/elemental.db in project root
const PROJECT_ROOT = resolve(__dirname, '../../..');
const DEFAULT_DB_PATH = resolve(PROJECT_ROOT, '.elemental/elemental.db');
const DB_PATH = process.env.ELEMENTAL_DB_PATH || DEFAULT_DB_PATH;

// ============================================================================
// Claude CLI Path Resolution
// ============================================================================

import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';

/**
 * Resolves the path to the Claude CLI executable.
 *
 * This is needed because node-pty spawns a shell that may not have
 * the same PATH as the current process, causing "posix_spawnp failed".
 *
 * Resolution order:
 * 1. CLAUDE_PATH environment variable (explicit override)
 * 2. `which claude` (if claude is in current PATH)
 * 3. Common installation locations
 * 4. Fallback to 'claude' (rely on shell PATH)
 */
function getClaudePath(): string {
  // 1. Environment variable override
  if (process.env.CLAUDE_PATH) {
    return process.env.CLAUDE_PATH;
  }

  // 2. Try to find claude using `which`
  try {
    const result = execSync('which claude', { encoding: 'utf-8', timeout: 5000 });
    const path = result.trim();
    if (path && existsSync(path)) {
      return path;
    }
  } catch {
    // `which` failed, continue to fallbacks
  }

  // 3. Check common installation locations
  const commonPaths = [
    `${process.env.HOME}/.local/bin/claude`,
    '/usr/local/bin/claude',
    '/opt/homebrew/bin/claude',
  ];

  for (const path of commonPaths) {
    if (existsSync(path)) {
      return path;
    }
  }

  // 4. Fallback - rely on shell PATH (may fail with posix_spawnp)
  console.warn('[orchestrator] Claude CLI not found at common paths, falling back to PATH resolution');
  return 'claude';
}

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
let stewardScheduler: StewardScheduler;
let pluginExecutor: PluginExecutor;
let storageBackend: ReturnType<typeof createStorage>;

// Map to store initial prompts for sessions (keyed by session ID)
// This allows SSE clients to receive the initial prompt when they connect
const sessionInitialPrompts = new Map<string, string>();

try {
  storageBackend = createStorage({ path: DB_PATH });
  initializeSchema(storageBackend);
  api = createElementalAPI(storageBackend);
  orchestratorApi = createOrchestratorAPI(storageBackend);

  // Initialize orchestrator services
  agentRegistry = createAgentRegistry(api);

  // Get Claude CLI path - resolves "posix_spawnp failed" when node-pty shell doesn't have claude in PATH
  const claudePath = getClaudePath();
  console.log(`[orchestrator] Using Claude CLI at: ${claudePath}`);

  spawnerService = createSpawnerService({
    workingDirectory: PROJECT_ROOT,
    elementalRoot: PROJECT_ROOT,
    claudePath,
  });
  sessionManager = createSessionManager(spawnerService, api, agentRegistry);

  // Map to store initial prompts for sessions (so they can be sent via SSE when clients connect)
  sessionInitialPrompts.clear();
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

  // Initialize steward scheduler service (TB-O23)
  const stewardExecutor = createDefaultStewardExecutor();
  stewardScheduler = createStewardScheduler(agentRegistry, stewardExecutor, {
    maxHistoryPerSteward: 100,
    defaultTimeoutMs: 5 * 60 * 1000, // 5 minutes
    startImmediately: false, // Don't auto-register stewards on startup
  });

  // Initialize plugin executor service (TB-O23a)
  pluginExecutor = createPluginExecutor({
    api,
    workspaceRoot: PROJECT_ROOT,
  });

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
      stewardScheduler: stewardScheduler.isRunning() ? 'running' : 'stopped',
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
    const createdBy = (body.createdBy ?? 'el-0000') as EntityId;

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
 * POST /api/agents
 * Register a new agent (generic endpoint that accepts any role)
 *
 * Body:
 * - role: 'director' | 'worker' | 'steward' (required)
 * - name: string (required)
 * - For workers: workerMode: 'ephemeral' | 'persistent' (required)
 * - For stewards: stewardFocus: 'merge' | 'health' | 'reminder' | 'ops' (required)
 * - capabilities?: { skills?: string[], languages?: string[], maxConcurrentTasks?: number }
 * - tags?: string[]
 * - triggers?: StewardTrigger[] (for stewards only)
 * - reportsTo?: EntityId
 * - createdBy?: EntityId (defaults to 'el-0000')
 */
app.post('/api/agents', async (c) => {
  try {
    const body = await c.req.json() as {
      role: 'director' | 'worker' | 'steward';
      name: string;
      workerMode?: 'ephemeral' | 'persistent';
      stewardFocus?: 'merge' | 'health' | 'reminder' | 'ops';
      capabilities?: {
        skills?: string[];
        languages?: string[];
        maxConcurrentTasks?: number;
      };
      tags?: string[];
      triggers?: Array<{ type: 'cron'; schedule: string } | { type: 'event'; event: string; condition?: string }>;
      reportsTo?: string;
      createdBy?: string;
    };

    if (!body.role || !body.name) {
      return c.json({ error: { code: 'INVALID_INPUT', message: 'role and name are required' } }, 400);
    }

    const createdBy = (body.createdBy ?? 'el-0000') as EntityId;

    let agent;
    switch (body.role) {
      case 'director':
        agent = await agentRegistry.registerDirector({
          name: body.name,
          createdBy,
          tags: body.tags,
          capabilities: body.capabilities,
        });
        break;

      case 'worker':
        if (!body.workerMode) {
          return c.json({ error: { code: 'INVALID_INPUT', message: 'workerMode is required for workers' } }, 400);
        }
        agent = await agentRegistry.registerWorker({
          name: body.name,
          workerMode: body.workerMode,
          createdBy,
          tags: body.tags,
          capabilities: body.capabilities,
          reportsTo: body.reportsTo as EntityId | undefined,
        });
        break;

      case 'steward':
        if (!body.stewardFocus) {
          return c.json({ error: { code: 'INVALID_INPUT', message: 'stewardFocus is required for stewards' } }, 400);
        }
        agent = await agentRegistry.registerSteward({
          name: body.name,
          stewardFocus: body.stewardFocus,
          triggers: body.triggers,
          createdBy,
          tags: body.tags,
          capabilities: body.capabilities,
          reportsTo: body.reportsTo as EntityId | undefined,
        });
        break;

      default:
        return c.json({ error: { code: 'INVALID_INPUT', message: `Invalid role: ${body.role}` } }, 400);
    }

    return c.json({ agent }, 201);
  } catch (error) {
    const errorMessage = String(error);
    if (errorMessage.includes('already exists') || errorMessage.includes('duplicate')) {
      return c.json({ error: { code: 'ALREADY_EXISTS', message: errorMessage } }, 409);
    }
    console.error('[orchestrator] Failed to register agent:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: errorMessage } }, 500);
  }
});

/**
 * POST /api/agents/director
 * Register a Director agent
 *
 * Body:
 * - name: string (required)
 * - capabilities?: { skills?: string[], languages?: string[], maxConcurrentTasks?: number }
 * - tags?: string[]
 * - createdBy?: EntityId (defaults to 'el-0000')
 */
app.post('/api/agents/director', async (c) => {
  try {
    const body = await c.req.json() as {
      name: string;
      capabilities?: {
        skills?: string[];
        languages?: string[];
        maxConcurrentTasks?: number;
      };
      tags?: string[];
      createdBy?: string;
    };

    if (!body.name) {
      return c.json({ error: { code: 'INVALID_INPUT', message: 'name is required' } }, 400);
    }

    const createdBy = (body.createdBy ?? 'el-0000') as EntityId;

    const agent = await agentRegistry.registerDirector({
      name: body.name,
      createdBy,
      tags: body.tags,
      capabilities: body.capabilities,
    });

    return c.json({ agent }, 201);
  } catch (error) {
    const errorMessage = String(error);
    if (errorMessage.includes('already exists') || errorMessage.includes('duplicate')) {
      return c.json({ error: { code: 'ALREADY_EXISTS', message: errorMessage } }, 409);
    }
    console.error('[orchestrator] Failed to register director:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: errorMessage } }, 500);
  }
});

/**
 * POST /api/agents/worker
 * Register a Worker agent
 *
 * Body:
 * - name: string (required)
 * - workerMode: 'ephemeral' | 'persistent' (required)
 * - capabilities?: { skills?: string[], languages?: string[], maxConcurrentTasks?: number }
 * - tags?: string[]
 * - reportsTo?: EntityId
 * - createdBy?: EntityId (defaults to 'el-0000')
 */
app.post('/api/agents/worker', async (c) => {
  try {
    const body = await c.req.json() as {
      name: string;
      workerMode: 'ephemeral' | 'persistent';
      capabilities?: {
        skills?: string[];
        languages?: string[];
        maxConcurrentTasks?: number;
      };
      tags?: string[];
      reportsTo?: string;
      createdBy?: string;
    };

    if (!body.name) {
      return c.json({ error: { code: 'INVALID_INPUT', message: 'name is required' } }, 400);
    }
    if (!body.workerMode) {
      return c.json({ error: { code: 'INVALID_INPUT', message: 'workerMode is required' } }, 400);
    }
    if (body.workerMode !== 'ephemeral' && body.workerMode !== 'persistent') {
      return c.json({ error: { code: 'INVALID_INPUT', message: 'workerMode must be "ephemeral" or "persistent"' } }, 400);
    }

    const createdBy = (body.createdBy ?? 'el-0000') as EntityId;

    const agent = await agentRegistry.registerWorker({
      name: body.name,
      workerMode: body.workerMode,
      createdBy,
      tags: body.tags,
      capabilities: body.capabilities,
      reportsTo: body.reportsTo as EntityId | undefined,
    });

    return c.json({ agent }, 201);
  } catch (error) {
    const errorMessage = String(error);
    if (errorMessage.includes('already exists') || errorMessage.includes('duplicate')) {
      return c.json({ error: { code: 'ALREADY_EXISTS', message: errorMessage } }, 409);
    }
    console.error('[orchestrator] Failed to register worker:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: errorMessage } }, 500);
  }
});

/**
 * POST /api/agents/steward
 * Register a Steward agent
 *
 * Body:
 * - name: string (required)
 * - stewardFocus: 'merge' | 'health' | 'reminder' | 'ops' (required)
 * - triggers?: Array<{ type: 'cron'; schedule: string } | { type: 'event'; event: string; condition?: string }>
 * - capabilities?: { skills?: string[], languages?: string[], maxConcurrentTasks?: number }
 * - tags?: string[]
 * - reportsTo?: EntityId
 * - createdBy?: EntityId (defaults to 'el-0000')
 */
app.post('/api/agents/steward', async (c) => {
  try {
    const body = await c.req.json() as {
      name: string;
      stewardFocus: 'merge' | 'health' | 'reminder' | 'ops';
      triggers?: Array<{ type: 'cron'; schedule: string } | { type: 'event'; event: string; condition?: string }>;
      capabilities?: {
        skills?: string[];
        languages?: string[];
        maxConcurrentTasks?: number;
      };
      tags?: string[];
      reportsTo?: string;
      createdBy?: string;
    };

    if (!body.name) {
      return c.json({ error: { code: 'INVALID_INPUT', message: 'name is required' } }, 400);
    }
    if (!body.stewardFocus) {
      return c.json({ error: { code: 'INVALID_INPUT', message: 'stewardFocus is required' } }, 400);
    }
    const validFocuses = ['merge', 'health', 'reminder', 'ops'];
    if (!validFocuses.includes(body.stewardFocus)) {
      return c.json({ error: { code: 'INVALID_INPUT', message: `stewardFocus must be one of: ${validFocuses.join(', ')}` } }, 400);
    }

    // Validate triggers if provided
    if (body.triggers) {
      for (const trigger of body.triggers) {
        if (trigger.type === 'cron') {
          if (!trigger.schedule) {
            return c.json({ error: { code: 'INVALID_INPUT', message: 'Cron trigger requires a schedule' } }, 400);
          }
        } else if (trigger.type === 'event') {
          if (!trigger.event) {
            return c.json({ error: { code: 'INVALID_INPUT', message: 'Event trigger requires an event name' } }, 400);
          }
        } else {
          return c.json({ error: { code: 'INVALID_INPUT', message: 'Trigger type must be "cron" or "event"' } }, 400);
        }
      }
    }

    const createdBy = (body.createdBy ?? 'el-0000') as EntityId;

    const agent = await agentRegistry.registerSteward({
      name: body.name,
      stewardFocus: body.stewardFocus,
      triggers: body.triggers,
      createdBy,
      tags: body.tags,
      capabilities: body.capabilities,
      reportsTo: body.reportsTo as EntityId | undefined,
    });

    return c.json({ agent }, 201);
  } catch (error) {
    const errorMessage = String(error);
    if (errorMessage.includes('already exists') || errorMessage.includes('duplicate')) {
      return c.json({ error: { code: 'ALREADY_EXISTS', message: errorMessage } }, 409);
    }
    console.error('[orchestrator] Failed to register steward:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: errorMessage } }, 500);
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
 * PATCH /api/agents/:id
 * Update agent properties (e.g., rename)
 */
app.patch('/api/agents/:id', async (c) => {
  try {
    const agentId = c.req.param('id') as EntityId;
    const body = await c.req.json() as { name?: string };

    const agent = await agentRegistry.getAgent(agentId);
    if (!agent) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Agent not found' } }, 404);
    }

    // Validate name if provided
    if (body.name !== undefined) {
      if (typeof body.name !== 'string' || body.name.trim().length === 0) {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Name must be a non-empty string' } }, 400);
      }
    }

    // Update agent via registry
    const updatedAgent = await agentRegistry.updateAgent(agentId, {
      name: body.name?.trim(),
    });

    return c.json({ agent: updatedAgent });
  } catch (error) {
    console.error('[orchestrator] Failed to update agent:', error);
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
 *
 * Body:
 * - taskId?: string - Task to assign to the agent (for ephemeral workers)
 * - initialMessage?: string - Additional message context
 * - initialPrompt?: string - Initial prompt (merged with task context if taskId provided)
 * - workingDirectory?: string - Working directory
 * - worktree?: string - Git worktree path
 * - interactive?: boolean - Use interactive PTY mode
 */
app.post('/api/agents/:id/start', async (c) => {
  try {
    const agentId = c.req.param('id') as EntityId;
    const body = await c.req.json().catch(() => ({})) as {
      taskId?: string;
      initialMessage?: string;
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

    // Build initial prompt with task context if taskId provided
    let effectivePrompt = body.initialPrompt;
    let assignedTask: { id: string; title: string } | undefined;

    if (body.taskId) {
      // Fetch task details
      const taskResult = await api.get<Task>(body.taskId as ElementId);
      if (!taskResult || taskResult.type !== ElementType.TASK) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Task not found' } }, 404);
      }

      // Assign task to agent using orchestrator API
      await orchestratorApi.assignTaskToAgent(body.taskId as ElementId, agentId);

      // Build task context prompt
      const taskPrompt = `You have been assigned the following task:

**Task ID**: ${taskResult.id}
**Title**: ${taskResult.title}
**Priority**: ${taskResult.priority ?? 'Not set'}
${taskResult.acceptanceCriteria ? `**Acceptance Criteria**: ${taskResult.acceptanceCriteria}` : ''}

Please begin working on this task. Use \`el task get ${taskResult.id}\` to see full details if needed.`;

      // Combine prompts
      effectivePrompt = body.initialMessage
        ? `${taskPrompt}\n\n**Additional Instructions**:\n${body.initialMessage}${body.initialPrompt ? `\n\n${body.initialPrompt}` : ''}`
        : body.initialPrompt
          ? `${taskPrompt}\n\n${body.initialPrompt}`
          : taskPrompt;

      assignedTask = { id: taskResult.id, title: taskResult.title };
    } else if (body.initialMessage) {
      // Use initial message as prompt if no task
      effectivePrompt = body.initialPrompt
        ? `${body.initialMessage}\n\n${body.initialPrompt}`
        : body.initialMessage;
    }

    const { session, events } = await sessionManager.startSession(agentId, {
      workingDirectory: body.workingDirectory,
      worktree: body.worktree,
      initialPrompt: effectivePrompt,
      interactive: body.interactive,
    });

    // Store initial prompt so SSE clients can receive it when they connect
    if (effectivePrompt) {
      sessionInitialPrompts.set(session.id, effectivePrompt);
    }

    // Notify all WebSocket clients subscribed to this agent about the new session
    // This allows them to send input to the session
    notifyClientsOfNewSession(agentId, session, events);

    return c.json({
      success: true,
      session: formatSessionRecord(session),
      ...(assignedTask && { assignedTask }),
    }, 201);
  } catch (error) {
    console.error('[orchestrator] Failed to start session:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
  }
});

/**
 * POST /api/agents/:id/stop
 * Stop an agent session
 *
 * If there's no active session but the agent's metadata shows "running",
 * this endpoint clears the stale status and returns success.
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
      // No active session - but the UI may have shown "running" due to stale metadata.
      // Clear the session status to ensure UI and server are in sync.
      try {
        await agentRegistry.updateAgentSession(agentId, undefined, 'idle');
      } catch (updateError) {
        // Agent may not exist - that's fine
        console.warn('[orchestrator] Could not update agent session status:', updateError);
      }
      return c.json({
        success: true,
        message: 'No active session to stop',
      });
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
 * POST /api/agents/:id/interrupt
 * Interrupt a running agent session (sends SIGINT-like signal to stop current operation)
 */
app.post('/api/agents/:id/interrupt', async (c) => {
  try {
    const agentId = c.req.param('id') as EntityId;

    const activeSession = sessionManager.getActiveSession(agentId);
    if (!activeSession) {
      return c.json({
        error: { code: 'NO_SESSION', message: 'No active session to interrupt' },
      }, 404);
    }

    // Interrupt the session via session manager
    await sessionManager.interruptSession(activeSession.id);

    return c.json({
      success: true,
      sessionId: activeSession.id,
    });
  } catch (error) {
    console.error('[orchestrator] Failed to interrupt session:', error);
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

    // Notify all WebSocket clients subscribed to this agent about the resumed session
    notifyClientsOfNewSession(agentId, session, events);

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

  // Use sessionManager's event emitter, not spawnerService's
  // The sessionManager creates its own EventEmitter and forwards events from the spawner
  const events = sessionManager.getEventEmitter(activeSession.id);
  if (!events) {
    return c.json({ error: { code: 'NO_EVENTS', message: 'Session event emitter not available' } }, 404);
  }

  return streamSSE(c, async (stream) => {
    let eventId = 0;

    try {
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

      // Send the initial prompt as a user event if it exists
      // This ensures the StreamViewer captures the initial message that started the session
      const initialPrompt = sessionInitialPrompts.get(activeSession.id);
      if (initialPrompt) {
        await stream.writeSSE({
          id: String(++eventId),
          event: 'agent_user',
          data: JSON.stringify({
            type: 'user',
            message: initialPrompt,
            raw: { type: 'user', content: initialPrompt },
          }),
        });
        // Remove from map after sending (only send once per session)
        sessionInitialPrompts.delete(activeSession.id);
      }

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
    } catch (error) {
      console.error(`[orchestrator] SSE: Error in stream callback:`, error);
    }
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
// Steward Scheduler Endpoints (TB-O23)
// ============================================================================

/**
 * GET /api/scheduler/status
 * Get steward scheduler status and statistics
 */
app.get('/api/scheduler/status', (c) => {
  const stats = stewardScheduler.getStats();
  return c.json({
    isRunning: stewardScheduler.isRunning(),
    stats,
  });
});

/**
 * POST /api/scheduler/start
 * Start the steward scheduler
 */
app.post('/api/scheduler/start', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({})) as {
      registerAllStewards?: boolean;
    };

    await stewardScheduler.start();

    // Optionally register all stewards
    if (body.registerAllStewards) {
      const registered = await stewardScheduler.registerAllStewards();
      return c.json({
        success: true,
        isRunning: stewardScheduler.isRunning(),
        registeredStewards: registered,
      });
    }

    return c.json({
      success: true,
      isRunning: stewardScheduler.isRunning(),
    });
  } catch (error) {
    console.error('[orchestrator] Failed to start scheduler:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
  }
});

/**
 * POST /api/scheduler/stop
 * Stop the steward scheduler
 */
app.post('/api/scheduler/stop', async (c) => {
  try {
    await stewardScheduler.stop();
    return c.json({
      success: true,
      isRunning: stewardScheduler.isRunning(),
    });
  } catch (error) {
    console.error('[orchestrator] Failed to stop scheduler:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
  }
});

/**
 * POST /api/scheduler/register-all
 * Register all stewards with the scheduler
 */
app.post('/api/scheduler/register-all', async (c) => {
  try {
    const registered = await stewardScheduler.registerAllStewards();
    return c.json({
      success: true,
      registeredCount: registered,
      stats: stewardScheduler.getStats(),
    });
  } catch (error) {
    console.error('[orchestrator] Failed to register stewards:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
  }
});

/**
 * POST /api/scheduler/stewards/:id/register
 * Register a specific steward with the scheduler
 */
app.post('/api/scheduler/stewards/:id/register', async (c) => {
  try {
    const stewardId = c.req.param('id') as EntityId;

    const success = await stewardScheduler.registerSteward(stewardId);
    if (!success) {
      return c.json({
        error: { code: 'NOT_FOUND', message: 'Steward not found or not a valid steward agent' },
      }, 404);
    }

    return c.json({
      success: true,
      stewardId,
      jobs: stewardScheduler.getScheduledJobs(stewardId),
      subscriptions: stewardScheduler.getEventSubscriptions(stewardId),
    });
  } catch (error) {
    console.error('[orchestrator] Failed to register steward:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
  }
});

/**
 * POST /api/scheduler/stewards/:id/unregister
 * Unregister a steward from the scheduler
 */
app.post('/api/scheduler/stewards/:id/unregister', async (c) => {
  try {
    const stewardId = c.req.param('id') as EntityId;

    const success = await stewardScheduler.unregisterSteward(stewardId);
    return c.json({
      success,
      stewardId,
    });
  } catch (error) {
    console.error('[orchestrator] Failed to unregister steward:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
  }
});

/**
 * POST /api/scheduler/stewards/:id/execute
 * Manually execute a steward
 */
app.post('/api/scheduler/stewards/:id/execute', async (c) => {
  try {
    const stewardId = c.req.param('id') as EntityId;
    const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;

    const result = await stewardScheduler.executeSteward(stewardId, body);
    return c.json({
      success: result.success,
      result,
    });
  } catch (error) {
    console.error('[orchestrator] Failed to execute steward:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
  }
});

/**
 * POST /api/scheduler/events
 * Publish an event to trigger event-based stewards
 *
 * Body:
 * - eventName: string (required)
 * - eventData: Record<string, unknown>
 */
app.post('/api/scheduler/events', async (c) => {
  try {
    const body = await c.req.json() as {
      eventName: string;
      eventData?: Record<string, unknown>;
    };

    if (!body.eventName) {
      return c.json({ error: { code: 'INVALID_INPUT', message: 'eventName is required' } }, 400);
    }

    const triggered = await stewardScheduler.publishEvent(
      body.eventName,
      body.eventData ?? {}
    );

    return c.json({
      success: true,
      eventName: body.eventName,
      stewardsTriggered: triggered,
    });
  } catch (error) {
    console.error('[orchestrator] Failed to publish event:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
  }
});

/**
 * GET /api/scheduler/jobs
 * Get all scheduled cron jobs
 */
app.get('/api/scheduler/jobs', (c) => {
  const url = new URL(c.req.url);
  const stewardId = url.searchParams.get('stewardId') as EntityId | null;

  const jobs = stewardScheduler.getScheduledJobs(stewardId ?? undefined);
  return c.json({ jobs });
});

/**
 * GET /api/scheduler/subscriptions
 * Get all event subscriptions
 */
app.get('/api/scheduler/subscriptions', (c) => {
  const url = new URL(c.req.url);
  const stewardId = url.searchParams.get('stewardId') as EntityId | null;

  const subscriptions = stewardScheduler.getEventSubscriptions(stewardId ?? undefined);
  return c.json({ subscriptions });
});

/**
 * GET /api/scheduler/history
 * Get execution history
 *
 * Query params:
 * - stewardId: Filter by steward
 * - triggerType: Filter by trigger type (cron or event)
 * - success: Filter by success (true or false)
 * - limit: Maximum entries to return
 */
app.get('/api/scheduler/history', (c) => {
  const url = new URL(c.req.url);
  const stewardId = url.searchParams.get('stewardId') as EntityId | null;
  const triggerType = url.searchParams.get('triggerType') as 'cron' | 'event' | null;
  const successParam = url.searchParams.get('success');
  const limitParam = url.searchParams.get('limit');

  const history = stewardScheduler.getExecutionHistory({
    stewardId: stewardId ?? undefined,
    triggerType: triggerType ?? undefined,
    success: successParam !== null ? successParam === 'true' : undefined,
    limit: limitParam ? parseInt(limitParam, 10) : undefined,
  });

  return c.json({
    history: history.map(formatExecutionEntry),
    count: history.length,
  });
});

/**
 * GET /api/scheduler/stewards/:id/last-execution
 * Get the last execution for a steward
 */
app.get('/api/scheduler/stewards/:id/last-execution', (c) => {
  const stewardId = c.req.param('id') as EntityId;

  const lastExecution = stewardScheduler.getLastExecution(stewardId);
  if (!lastExecution) {
    return c.json({ lastExecution: null });
  }

  return c.json({
    lastExecution: formatExecutionEntry(lastExecution),
  });
});

// ============================================================================
// Plugin Executor Endpoints (TB-O23a)
// ============================================================================

/**
 * GET /api/plugins/builtin
 * List all built-in plugins
 */
app.get('/api/plugins/builtin', (c) => {
  const names = pluginExecutor.listBuiltIns();
  const plugins = names.map((name) => {
    const plugin = pluginExecutor.getBuiltIn(name);
    return plugin ? {
      name: plugin.name,
      type: plugin.type,
      description: plugin.description,
      tags: plugin.tags,
      timeout: plugin.timeout,
      continueOnError: plugin.continueOnError,
    } : null;
  }).filter(Boolean);

  return c.json({
    plugins,
    count: plugins.length,
  });
});

/**
 * GET /api/plugins/builtin/:name
 * Get details of a built-in plugin
 */
app.get('/api/plugins/builtin/:name', (c) => {
  const name = c.req.param('name');
  const plugin = pluginExecutor.getBuiltIn(name);

  if (!plugin) {
    return c.json({
      error: { code: 'NOT_FOUND', message: `Built-in plugin not found: ${name}` },
    }, 404);
  }

  return c.json({ plugin });
});

/**
 * POST /api/plugins/validate
 * Validate a plugin configuration
 *
 * Body: StewardPlugin
 */
app.post('/api/plugins/validate', async (c) => {
  try {
    const plugin = await c.req.json() as StewardPlugin;
    const result = pluginExecutor.validate(plugin);

    return c.json({
      valid: result.valid,
      errors: result.errors,
    });
  } catch (error) {
    console.error('[orchestrator] Failed to validate plugin:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
  }
});

/**
 * POST /api/plugins/execute
 * Execute a single plugin
 *
 * Body:
 * - plugin: StewardPlugin (required)
 * - options?: PluginExecutionOptions
 */
app.post('/api/plugins/execute', async (c) => {
  try {
    const body = await c.req.json() as {
      plugin: StewardPlugin;
      options?: {
        workspaceRoot?: string;
        defaultTimeout?: number;
        env?: Record<string, string>;
        stopOnError?: boolean;
      };
    };

    if (!body.plugin) {
      return c.json({ error: { code: 'INVALID_INPUT', message: 'plugin is required' } }, 400);
    }

    const result = await pluginExecutor.execute(body.plugin, body.options);

    return c.json({
      result: formatPluginExecutionResult(result),
    });
  } catch (error) {
    console.error('[orchestrator] Failed to execute plugin:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
  }
});

/**
 * POST /api/plugins/execute-batch
 * Execute multiple plugins in sequence
 *
 * Body:
 * - plugins: StewardPlugin[] (required)
 * - options?: PluginExecutionOptions
 */
app.post('/api/plugins/execute-batch', async (c) => {
  try {
    const body = await c.req.json() as {
      plugins: StewardPlugin[];
      options?: {
        workspaceRoot?: string;
        defaultTimeout?: number;
        env?: Record<string, string>;
        stopOnError?: boolean;
      };
    };

    if (!body.plugins || !Array.isArray(body.plugins)) {
      return c.json({ error: { code: 'INVALID_INPUT', message: 'plugins array is required' } }, 400);
    }

    const result = await pluginExecutor.executeBatch(body.plugins, body.options);

    return c.json({
      total: result.total,
      succeeded: result.succeeded,
      failed: result.failed,
      skipped: result.skipped,
      allSucceeded: result.allSucceeded,
      durationMs: result.durationMs,
      results: result.results.map(formatPluginExecutionResult),
    });
  } catch (error) {
    console.error('[orchestrator] Failed to execute plugins batch:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
  }
});

/**
 * POST /api/plugins/execute-builtin/:name
 * Execute a built-in plugin by name
 *
 * Body:
 * - options?: PluginExecutionOptions
 */
app.post('/api/plugins/execute-builtin/:name', async (c) => {
  try {
    const name = c.req.param('name');
    const body = await c.req.json().catch(() => ({})) as {
      options?: {
        workspaceRoot?: string;
        defaultTimeout?: number;
        env?: Record<string, string>;
      };
    };

    const plugin = pluginExecutor.getBuiltIn(name);
    if (!plugin) {
      return c.json({
        error: { code: 'NOT_FOUND', message: `Built-in plugin not found: ${name}` },
      }, 404);
    }

    const result = await pluginExecutor.execute(plugin, body.options);

    return c.json({
      result: formatPluginExecutionResult(result),
    });
  } catch (error) {
    console.error('[orchestrator] Failed to execute built-in plugin:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
  }
});

// ============================================================================
// Activity/Events Endpoints (TB-O25)
// ============================================================================

/**
 * GET /api/events
 * List events (activity feed) with filtering and pagination
 *
 * Query params:
 * - elementId: Filter by specific element
 * - elementType: Filter by element type (task, entity, etc.)
 * - eventType: Filter by event type (created, updated, etc.)
 * - actor: Filter by actor (who performed the action)
 * - after: Events after this timestamp
 * - before: Events before this timestamp
 * - limit: Maximum events to return (default 50, max 200)
 * - offset: Offset for pagination
 */
app.get('/api/events', async (c) => {
  try {
    const url = new URL(c.req.url);
    const elementId = url.searchParams.get('elementId') as ElementId | null;
    const elementTypeParam = url.searchParams.get('elementType');
    const eventTypeParam = url.searchParams.get('eventType');
    const actor = url.searchParams.get('actor') as EntityId | null;
    const after = url.searchParams.get('after');
    const before = url.searchParams.get('before');
    const limitParam = url.searchParams.get('limit');
    const offsetParam = url.searchParams.get('offset');

    const limit = Math.min(limitParam ? parseInt(limitParam, 10) : 50, 200);
    const offset = offsetParam ? parseInt(offsetParam, 10) : 0;

    // Build filter for listEvents
    // Build filter for listEvents (using type assertion for EventFilter compatibility)
    const filter = {
      ...(elementId && { elementId }),
      ...(eventTypeParam && {
        eventType: eventTypeParam.includes(',') ? eventTypeParam.split(',') : eventTypeParam,
      }),
      ...(actor && { actor }),
      ...(after && { after }),
      ...(before && { before }),
      limit: limit + 1, // Fetch one extra to determine hasMore
      offset,
    };

    // Get events from the API (cast filter to any to work around strict typing)
    const events = await api.listEvents(filter as Parameters<typeof api.listEvents>[0]);

    // Determine if there are more events
    const hasMore = events.length > limit;
    const resultEvents = hasMore ? events.slice(0, limit) : events;

    // Enrich events with element info
    const enrichedEvents = await Promise.all(
      resultEvents.map(async (event) => {
        let elementType: string | undefined;
        let elementTitle: string | undefined;
        let actorName: string | undefined;

        // Try to get element info
        try {
          const element = await api.get(event.elementId);
          if (element) {
            elementType = element.type;
            // Get title based on element type
            if ('title' in element) {
              elementTitle = element.title as string;
            } else if ('name' in element) {
              elementTitle = element.name as string;
            }
          }
        } catch {
          // Element may have been deleted
        }

        // Filter by element type if requested
        if (elementTypeParam && elementType) {
          const requestedTypes = elementTypeParam.split(',');
          if (!requestedTypes.includes(elementType)) {
            return null;
          }
        }

        // Try to get actor name
        try {
          const actorEntity = await api.get(event.actor as unknown as ElementId);
          if (actorEntity && 'name' in actorEntity) {
            actorName = actorEntity.name as string;
          }
        } catch {
          // Actor may be a system entity
        }

        // Generate summary
        const summary = generateActivitySummary(event, elementType, elementTitle);

        return {
          id: event.id,
          elementId: event.elementId,
          elementType,
          elementTitle,
          eventType: event.eventType,
          actor: event.actor,
          actorName,
          oldValue: event.oldValue,
          newValue: event.newValue,
          createdAt: event.createdAt,
          summary,
        };
      })
    );

    // Filter out null values (events that didn't match element type filter)
    const filteredEvents = enrichedEvents.filter(Boolean);

    return c.json({
      events: filteredEvents,
      hasMore,
      total: filteredEvents.length,
    });
  } catch (error) {
    console.error('[orchestrator] Failed to list events:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
  }
});

/**
 * GET /api/events/stream
 * SSE stream for real-time activity events
 */
app.get('/api/events/stream', async (c) => {
  const url = new URL(c.req.url);
  const category = url.searchParams.get('category'); // 'all', 'tasks', 'agents', 'sessions'

  return streamSSE(c, async (stream) => {
    let eventId = 0;

    // Send initial connection event
    await stream.writeSSE({
      id: String(++eventId),
      event: 'connected',
      data: JSON.stringify({
        timestamp: createTimestamp(),
        category: category || 'all',
      }),
    });

    // Set up event listeners for real-time activity

    // Listen for session events (all active sessions)
    const sessionListeners = new Map<string, (event: SpawnedSessionEvent) => void>();
    const sessions = sessionManager.listSessions({ status: ['starting', 'running'] });

    for (const session of sessions) {
      const events = spawnerService.getEventEmitter(session.id);
      if (events) {
        const onEvent = async (event: SpawnedSessionEvent) => {
          // Filter by category
          if (category === 'agents' || category === 'sessions' || category === 'all') {
            await stream.writeSSE({
              id: String(++eventId),
              event: 'session_event',
              data: JSON.stringify({
                type: event.type,
                sessionId: session.id,
                agentId: session.agentId,
                agentRole: session.agentRole,
                content: event.message,
                timestamp: createTimestamp(),
              }),
            });
          }
        };
        events.on('event', onEvent);
        sessionListeners.set(session.id, onEvent);
      }
    }

    // Heartbeat to keep connection alive
    const heartbeatInterval = setInterval(async () => {
      try {
        await stream.writeSSE({
          id: String(++eventId),
          event: 'heartbeat',
          data: JSON.stringify({ timestamp: createTimestamp() }),
        });
      } catch {
        clearInterval(heartbeatInterval);
      }
    }, 30000);

    // Clean up on close
    stream.onAbort(() => {
      clearInterval(heartbeatInterval);
      for (const [sessionId, listener] of sessionListeners) {
        const events = spawnerService.getEventEmitter(sessionId);
        if (events) {
          events.off('event', listener);
        }
      }
    });

    // Keep stream open
    await new Promise(() => {});
  });
});

/**
 * GET /api/events/:id
 * Get a specific event by ID
 */
app.get('/api/events/:id', async (c) => {
  try {
    const eventId = parseInt(c.req.param('id'), 10);
    if (isNaN(eventId) || eventId < 1) {
      return c.json({ error: { code: 'INVALID_INPUT', message: 'Invalid event ID' } }, 400);
    }

    // Query for specific event
    const events = await api.listEvents({ limit: 1 });
    const event = events.find((e) => e.id === eventId);

    if (!event) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Event not found' } }, 404);
    }

    // Enrich with element info
    let elementType: string | undefined;
    let elementTitle: string | undefined;
    let actorName: string | undefined;

    try {
      const element = await api.get(event.elementId);
      if (element) {
        elementType = element.type;
        if ('title' in element) {
          elementTitle = element.title as string;
        } else if ('name' in element) {
          elementTitle = element.name as string;
        }
      }
    } catch {
      // Element may have been deleted
    }

    try {
      const actorEntity = await api.get(event.actor as unknown as ElementId);
      if (actorEntity && 'name' in actorEntity) {
        actorName = actorEntity.name as string;
      }
    } catch {
      // Actor may be a system entity
    }

    const summary = generateActivitySummary(event, elementType, elementTitle);

    return c.json({
      event: {
        id: event.id,
        elementId: event.elementId,
        elementType,
        elementTitle,
        eventType: event.eventType,
        actor: event.actor,
        actorName,
        oldValue: event.oldValue,
        newValue: event.newValue,
        createdAt: event.createdAt,
        summary,
      },
    });
  } catch (error) {
    console.error('[orchestrator] Failed to get event:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
  }
});

/**
 * Generate a human-readable summary for an activity event
 */
function generateActivitySummary(
  event: { eventType: string; actor: string; oldValue: Record<string, unknown> | null; newValue: Record<string, unknown> | null },
  elementType?: string,
  elementTitle?: string
): string {
  const typeLabel = elementType || 'item';
  const titlePart = elementTitle ? ` "${elementTitle}"` : '';

  switch (event.eventType) {
    case 'created':
      return `Created ${typeLabel}${titlePart}`;
    case 'updated':
      return `Updated ${typeLabel}${titlePart}`;
    case 'closed':
      return `Closed ${typeLabel}${titlePart}`;
    case 'reopened':
      return `Reopened ${typeLabel}${titlePart}`;
    case 'deleted':
      return `Deleted ${typeLabel}${titlePart}`;
    case 'dependency_added':
      return `Added dependency to ${typeLabel}${titlePart}`;
    case 'dependency_removed':
      return `Removed dependency from ${typeLabel}${titlePart}`;
    case 'tag_added': {
      const tag = event.newValue?.tag as string;
      return tag ? `Added tag "${tag}" to ${typeLabel}${titlePart}` : `Added tag to ${typeLabel}${titlePart}`;
    }
    case 'tag_removed': {
      const tag = event.oldValue?.tag as string;
      return tag ? `Removed tag "${tag}" from ${typeLabel}${titlePart}` : `Removed tag from ${typeLabel}${titlePart}`;
    }
    case 'member_added':
      return `Added member to ${typeLabel}${titlePart}`;
    case 'member_removed':
      return `Removed member from ${typeLabel}${titlePart}`;
    case 'auto_blocked':
      return `${typeLabel}${titlePart} was automatically blocked`;
    case 'auto_unblocked':
      return `${typeLabel}${titlePart} was automatically unblocked`;
    default:
      return `${event.eventType} on ${typeLabel}${titlePart}`;
  }
}

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

/**
 * Format a StewardExecutionEntry for JSON response
 */
function formatExecutionEntry(entry: StewardExecutionEntry) {
  return {
    executionId: entry.executionId,
    stewardId: entry.stewardId,
    stewardName: entry.stewardName,
    trigger: entry.trigger,
    manual: entry.manual,
    startedAt: entry.startedAt,
    completedAt: entry.completedAt,
    result: entry.result,
    eventContext: entry.eventContext,
  };
}

/**
 * Format a PluginExecutionResult for JSON response
 */
function formatPluginExecutionResult(result: PluginExecutionResult) {
  return {
    pluginName: result.pluginName,
    pluginType: result.pluginType,
    success: result.success,
    error: result.error,
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode,
    durationMs: result.durationMs,
    itemsProcessed: result.itemsProcessed,
    startedAt: result.startedAt,
    completedAt: result.completedAt,
  };
}

// ============================================================================
// Terminal File Upload Endpoint
// ============================================================================

// Directory for uploaded files (in /tmp for system-managed cleanup)
const UPLOAD_DIR = '/tmp/elemental-terminal-uploads';

/**
 * POST /api/terminal/upload
 * Upload files for use in terminal sessions.
 *
 * Files are uploaded to /tmp and the path is returned so it can be
 * pasted into the terminal. This enables drag-and-drop file support
 * in the web terminal interface.
 *
 * Body: multipart/form-data with 'file' field
 * Response: { path: string, filename: string, size: number }
 */
app.post('/api/terminal/upload', async (c) => {
  try {
    // Ensure upload directory exists
    await mkdir(UPLOAD_DIR, { recursive: true });

    const timestamp = Date.now();
    const randomSuffix = randomBytes(4).toString('hex');

    // Parse JSON body with base64-encoded file data
    // This avoids Bun's multipart binary corruption issue
    const body = await c.req.json() as { filename?: string; data?: string };

    if (!body.data) {
      return c.json({ error: { code: 'INVALID_INPUT', message: 'No file data provided' } }, 400);
    }

    // Decode base64 data
    const buffer = Buffer.from(body.data, 'base64');
    const originalName = body.filename || `file-${timestamp}`;

    // Generate unique filename
    const ext = extname(originalName);
    const nameWithoutExt = ext ? originalName.slice(0, -ext.length) : originalName;
    const sanitizedName = nameWithoutExt.replace(/[^a-zA-Z0-9._-]/g, '_');
    const uniqueFilename = `${timestamp}-${randomSuffix}-${sanitizedName}${ext}`;
    const filePath = resolve(UPLOAD_DIR, uniqueFilename);

    // Write file
    await writeFile(filePath, buffer);

    return c.json({
      path: filePath,
      filename: originalName,
      size: buffer.length,
    });
  } catch (error) {
    console.error('[orchestrator] Failed to upload file:', error);
    return c.json({ error: { code: 'UPLOAD_FAILED', message: String(error) } }, 500);
  }
});

// ============================================================================
// WebSocket Handling for Interactive Terminals
// ============================================================================

// WebSocket data interface
interface WSClientData {
  id: string;
  agentId?: EntityId;
  sessionId?: string;
  isInteractive?: boolean;
}

// Track WebSocket clients
const wsClients = new Map<string, { ws: ServerWebSocket<WSClientData>; cleanup?: () => void }>();

function generateClientId(): string {
  return `ws-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
}

/**
 * Notify all WebSocket clients subscribed to an agent about a new session.
 * This updates their session context so they can send input to the session.
 */
function notifyClientsOfNewSession(
  agentId: EntityId,
  session: { id: string; mode: 'headless' | 'interactive' },
  events: import('events').EventEmitter
): void {
  for (const [clientId, client] of wsClients) {
    if (client.ws.data.agentId === agentId) {
      // Update client's session context
      client.ws.data.sessionId = session.id;
      client.ws.data.isInteractive = session.mode === 'interactive';

      // Clean up any previous event listeners
      if (client.cleanup) {
        client.cleanup();
      }

      // Set up event forwarding for the new session
      const onEvent = (event: SpawnedSessionEvent) => {
        client.ws.send(JSON.stringify({ type: 'event', event }));
      };

      const onPtyData = (ptyData: string) => {
        client.ws.send(JSON.stringify({ type: 'pty-data', data: ptyData }));
      };

      const onError = (error: Error) => {
        client.ws.send(JSON.stringify({ type: 'error', error: error.message }));
      };

      const onExit = (code: number | null, signal: string | number | null) => {
        client.ws.send(JSON.stringify({ type: 'exit', code, signal }));
        // Clear session context on exit
        client.ws.data.sessionId = undefined;
        client.ws.data.isInteractive = undefined;
      };

      events.on('event', onEvent);
      events.on('pty-data', onPtyData);
      events.on('error', onError);
      events.on('exit', onExit);

      // Store cleanup function
      client.cleanup = () => {
        events.off('event', onEvent);
        events.off('pty-data', onPtyData);
        events.off('error', onError);
        events.off('exit', onExit);
      };

      // Notify client of the new session
      client.ws.send(JSON.stringify({
        type: 'session-started',
        agentId,
        sessionId: session.id,
        isInteractive: session.mode === 'interactive',
      }));

      console.log(`[orchestrator:ws] Notified client ${clientId} of new session for agent ${agentId}`);
    }
  }
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
      cols?: number;
      rows?: number;
    };

    switch (data.type) {
      case 'subscribe': {
        if (data.agentId) {
          ws.data.agentId = data.agentId as EntityId;

          // Clean up any existing event listeners before setting up new ones
          // This prevents duplicate listeners when a client re-subscribes
          const client = wsClients.get(ws.data.id);
          if (client?.cleanup) {
            client.cleanup();
            client.cleanup = undefined;
          }

          const activeSession = sessionManager.getActiveSession(data.agentId as EntityId);
          if (activeSession) {
            ws.data.sessionId = activeSession.id;
            ws.data.isInteractive = activeSession.mode === 'interactive';

            // Set up event forwarding
            const events = spawnerService.getEventEmitter(activeSession.id);
            if (events) {
              // For headless sessions, forward structured events
              const onEvent = (event: SpawnedSessionEvent) => {
                ws.send(JSON.stringify({ type: 'event', event }));
              };

              // For interactive PTY sessions, forward raw terminal data
              const onPtyData = (ptyData: string) => {
                ws.send(JSON.stringify({ type: 'pty-data', data: ptyData }));
              };

              const onError = (error: Error) => {
                ws.send(JSON.stringify({ type: 'error', error: error.message }));
              };

              const onExit = (code: number | null, signal: string | number | null) => {
                ws.send(JSON.stringify({ type: 'exit', code, signal }));
              };

              events.on('event', onEvent);
              events.on('pty-data', onPtyData);
              events.on('error', onError);
              events.on('exit', onExit);

              // Store cleanup function
              wsClients.get(ws.data.id)!.cleanup = () => {
                events.off('event', onEvent);
                events.off('pty-data', onPtyData);
                events.off('error', onError);
                events.off('exit', onExit);
              };

              // For interactive sessions, trigger a terminal redraw by sending a resize event.
              // This causes Claude Code (and most terminal apps) to redraw their UI,
              // which is helpful when reconnecting to an existing session after page refresh.
              if (activeSession.mode === 'interactive') {
                // Small delay to ensure client is ready, then trigger redraw via resize
                setTimeout(() => {
                  // Get current terminal size from session if available, or use defaults
                  const cols = 120;
                  const rows = 30;
                  spawnerService.resize(activeSession.id, cols, rows).catch(() => {
                    // Ignore resize errors - session may have ended
                  });
                }, 100);
              }
            }
          }
          ws.send(JSON.stringify({
            type: 'subscribed',
            agentId: data.agentId,
            hasSession: !!activeSession,
            isInteractive: activeSession?.mode === 'interactive',
          }));
        }
        break;
      }

      case 'input': {
        // For headless sessions, send structured input
        if (ws.data.sessionId && data.input && !ws.data.isInteractive) {
          spawnerService.sendInput(ws.data.sessionId, data.input).catch((err) => {
            ws.send(JSON.stringify({ type: 'error', error: err.message }));
          });
        }
        // For interactive PTY sessions, write directly to PTY
        else if (ws.data.sessionId && data.input && ws.data.isInteractive) {
          spawnerService.writeToPty(ws.data.sessionId, data.input).catch((err) => {
            ws.send(JSON.stringify({ type: 'error', error: err.message }));
          });
        }
        break;
      }

      case 'resize': {
        // Resize PTY for interactive sessions
        if (ws.data.sessionId && ws.data.isInteractive && data.cols && data.rows) {
          spawnerService.resize(ws.data.sessionId, data.cols, data.rows).catch((err) => {
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
// Start Server (Cross-runtime: Node.js with @hono/node-server + ws, or Bun)
// ============================================================================

// Detect runtime
const isBun = typeof globalThis.Bun !== 'undefined';

if (isBun) {
  // Bun runtime - use native Bun.serve
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Bun = (globalThis as any).Bun;
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

  // Upgrade WebSocket connections for Bun
  app.get('/ws', (c) => {
    const upgraded = server.upgrade(c.req.raw, {
      data: { id: '' },
    });
    if (upgraded) {
      return new Response(null, { status: 101 });
    }
    return c.json({ error: 'WebSocket upgrade failed' }, 400);
  });

  console.log(`[orchestrator] Server running at http://${HOST}:${PORT} (Bun)`);
  console.log(`[orchestrator] WebSocket available at ws://${HOST}:${PORT}/ws`);
} else {
  // Node.js runtime - use custom http server + ws (for streaming support)
  import('ws').then(({ WebSocketServer }) => {
    import('http').then(({ createServer }) => {
        // Create HTTP server from Hono
        const httpServer = createServer(async (req, res) => {
          // Handle non-WebSocket requests through Hono
          const url = `http://${HOST}:${PORT}${req.url}`;
          const headers = new Headers();
          for (const [key, value] of Object.entries(req.headers)) {
            if (value) headers.set(key, Array.isArray(value) ? value.join(', ') : value);
          }

          let body: string | undefined;
          if (req.method !== 'GET' && req.method !== 'HEAD') {
            const chunks: Buffer[] = [];
            for await (const chunk of req) {
              chunks.push(chunk);
            }
            body = Buffer.concat(chunks).toString();
          }

          const request = new Request(url, {
            method: req.method,
            headers,
            body,
          });

          const response = await app.fetch(request);
          res.statusCode = response.status;
          response.headers.forEach((value, key) => {
            res.setHeader(key, value);
          });

          // Handle streaming responses (SSE) vs regular responses
          if (response.body) {
            const reader = response.body.getReader();
            const pump = async (): Promise<void> => {
              try {
                const { done, value } = await reader.read();
                if (done) {
                  res.end();
                  return;
                }
                res.write(value);
                return pump();
              } catch {
                // Client disconnected or stream error
                res.end();
              }
            };
            await pump();
          } else {
            const responseBody = await response.text();
            res.end(responseBody);
          }
        });

        // Create WebSocket server on same HTTP server
        const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

        wss.on('connection', (ws) => {
          // Create a WSClientData compatible object
          const wsData: WSClientData = {
            id: `ws-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            agentId: undefined,
            sessionId: undefined,
            isInteractive: undefined,
          };

          // Adapter to match Bun's ServerWebSocket interface
          // WebSocket.OPEN = 1 in the 'ws' library
          const WS_OPEN = 1;
          const wsAdapter: ServerWebSocket<WSClientData> = {
            data: wsData,
            send: (data: string | ArrayBuffer) => {
              if (ws.readyState === WS_OPEN) {
                ws.send(typeof data === 'string' ? data : Buffer.from(data));
              }
            },
            close: () => ws.close(),
            readyState: ws.readyState,
          };

          handleWSOpen(wsAdapter);

          ws.on('message', (message) => {
            // Update readyState proxy
            (wsAdapter as { readyState: number }).readyState = ws.readyState;
            handleWSMessage(wsAdapter, message.toString());
          });

          ws.on('close', () => {
            handleWSClose(wsAdapter);
          });
        });

        httpServer.listen(PORT, HOST, () => {
          console.log(`[orchestrator] Server running at http://${HOST}:${PORT} (Node.js)`);
          console.log(`[orchestrator] WebSocket available at ws://${HOST}:${PORT}/ws`);
        });
      });
    });
}

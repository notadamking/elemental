/**
 * Service Initialization
 *
 * Creates and exports all orchestrator services.
 */

import { createStorage, initializeSchema } from '@elemental/storage';
import { createElementalAPI } from '@elemental/sdk';
import type { ElementalAPI } from '@elemental/sdk';
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
  GitRepositoryNotFoundError,
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
} from '@elemental/orchestrator-sdk';
import { DB_PATH, PROJECT_ROOT, getClaudePath } from './config.js';

export interface Services {
  api: ElementalAPI;
  orchestratorApi: OrchestratorAPI;
  agentRegistry: AgentRegistry;
  sessionManager: SessionManager;
  spawnerService: SpawnerService;
  worktreeManager: WorktreeManager | undefined;
  taskAssignmentService: TaskAssignmentService;
  dispatchService: DispatchService;
  roleDefinitionService: RoleDefinitionService;
  workerTaskService: WorkerTaskService;
  stewardScheduler: StewardScheduler;
  pluginExecutor: PluginExecutor;
  sessionInitialPrompts: Map<string, string>;
}

export function initializeServices(): Services {
  const storageBackend = createStorage({ path: DB_PATH });
  initializeSchema(storageBackend);

  const api = createElementalAPI(storageBackend);
  const orchestratorApi = createOrchestratorAPI(storageBackend);
  const agentRegistry = createAgentRegistry(api);

  const claudePath = getClaudePath();
  console.log(`[orchestrator] Using Claude CLI at: ${claudePath}`);

  const spawnerService = createSpawnerService({
    workingDirectory: PROJECT_ROOT,
    elementalRoot: PROJECT_ROOT,
    claudePath,
  });

  const sessionManager = createSessionManager(spawnerService, api, agentRegistry);
  const sessionInitialPrompts = new Map<string, string>();
  const taskAssignmentService = createTaskAssignmentService(api);
  const dispatchService = createDispatchService(api, taskAssignmentService, agentRegistry);
  const roleDefinitionService = createRoleDefinitionService(api);

  let worktreeManager: WorktreeManager | undefined;
  try {
    worktreeManager = createWorktreeManager({ workspaceRoot: PROJECT_ROOT });
  } catch (err) {
    if (err instanceof GitRepositoryNotFoundError) {
      console.warn('[orchestrator] Git repository not found - worktree features disabled');
    } else {
      throw err;
    }
  }

  const workerTaskService = createWorkerTaskService(
    api,
    taskAssignmentService,
    agentRegistry,
    dispatchService,
    spawnerService,
    sessionManager,
    worktreeManager
  );

  const stewardExecutor = createDefaultStewardExecutor();
  const stewardScheduler = createStewardScheduler(agentRegistry, stewardExecutor, {
    maxHistoryPerSteward: 100,
    defaultTimeoutMs: 5 * 60 * 1000,
    startImmediately: false,
  });

  const pluginExecutor = createPluginExecutor({
    api,
    workspaceRoot: PROJECT_ROOT,
  });

  console.log(`[orchestrator] Connected to database: ${DB_PATH}`);

  return {
    api,
    orchestratorApi,
    agentRegistry,
    sessionManager,
    spawnerService,
    worktreeManager,
    taskAssignmentService,
    dispatchService,
    roleDefinitionService,
    workerTaskService,
    stewardScheduler,
    pluginExecutor,
    sessionInitialPrompts,
  };
}

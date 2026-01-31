/**
 * Service Initialization
 *
 * Creates and exports all orchestrator services.
 */

import { createStorage, initializeSchema } from '@elemental/storage';
import type { StorageBackend } from '@elemental/storage';
import { createElementalAPI, createInboxService } from '@elemental/sdk';
import type { ElementalAPI, InboxService } from '@elemental/sdk';
import { createSessionMessageService, type SessionMessageService } from './services/session-messages.js';
import type { EntityId } from '@elemental/core';
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
  createDispatchDaemon,
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
  type DispatchDaemon,
  type OnSessionStartedCallback,
} from '@elemental/orchestrator-sdk';
import { attachSessionEventSaver } from './routes/sessions.js';
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
  inboxService: InboxService;
  dispatchDaemon: DispatchDaemon | undefined;
  sessionInitialPrompts: Map<string, string>;
  sessionMessageService: SessionMessageService;
  storageBackend: StorageBackend;
}

export async function initializeServices(): Promise<Services> {
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
    // Initialize the worktree manager (creates .elemental/.worktrees directory, validates git repo)
    // This is synchronous initialization - consider making services async if this becomes slow
    await worktreeManager.initWorkspace();
  } catch (err) {
    if (err instanceof GitRepositoryNotFoundError) {
      console.warn('[orchestrator] Git repository not found - worktree features disabled');
      worktreeManager = undefined;
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

  const inboxService = createInboxService(storageBackend);
  const sessionMessageService = createSessionMessageService(storageBackend);

  // DispatchDaemon requires worktreeManager, so only create if available
  let dispatchDaemon: DispatchDaemon | undefined;
  if (worktreeManager) {
    // Callback to attach event saver and save initial prompt when daemon starts a session
    const onSessionStarted: OnSessionStartedCallback = (session, events, agentId, initialPrompt) => {
      // Attach event saver to capture all agent events
      attachSessionEventSaver(events, session.id, agentId, sessionMessageService);

      // Store initial prompt for SSE clients
      sessionInitialPrompts.set(session.id, initialPrompt);

      // Save initial prompt to database
      const initialMsgId = `user-${session.id}-initial`;
      sessionMessageService.saveMessage({
        id: initialMsgId,
        sessionId: session.id,
        agentId: agentId as EntityId,
        type: 'user',
        content: initialPrompt,
        isError: false,
      });
    };

    dispatchDaemon = createDispatchDaemon(
      api,
      agentRegistry,
      sessionManager,
      dispatchService,
      worktreeManager,
      taskAssignmentService,
      stewardScheduler,
      inboxService,
      { pollIntervalMs: 5000, onSessionStarted }
    );
  } else {
    console.warn('[orchestrator] DispatchDaemon disabled - no git repository');
  }

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
    inboxService,
    dispatchDaemon,
    sessionInitialPrompts,
    sessionMessageService,
    storageBackend,
  };
}

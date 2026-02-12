/**
 * Elemental Orchestrator Server
 *
 * HTTP and WebSocket server for agent orchestration.
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { EntityId } from '@elemental/core';
import { getAgentMetadata } from '@elemental/orchestrator-sdk';
import { CORS_ORIGINS } from './config.js';
import { initializeServices } from './services.js';
import {
  createHealthRoutes,
  createTaskRoutes,
  createAgentRoutes,
  createSessionRoutes,
  createWorktreeRoutes,
  createSchedulerRoutes,
  createPluginRoutes,
  createEventRoutes,
  createUploadRoutes,
  createDaemonRoutes,
  createWorkflowRoutes,
  createPoolRoutes,
  createWorkspaceFilesRoutes,
  markDaemonAsServerManaged,
} from './routes/index.js';
// Shared collaborate routes
import {
  createElementsRoutes,
  createEntityRoutes,
  createChannelRoutes,
  createMessageRoutes,
  createLibraryRoutes,
  createDocumentRoutes,
  createInboxRoutes,
  createPlanRoutes,
} from '@elemental/shared-routes';
import { notifyClientsOfNewSession } from './websocket.js';
import { attachSessionEventSaver } from './routes/sessions.js';
import { startServer } from './server.js';
import { shouldDaemonAutoStart, saveDaemonState } from './daemon-state.js';

// Main entry point - async to allow service initialization
async function main() {
  const services = await initializeServices();

  // Before reconciliation, capture director's session info if it was running
  // This allows us to auto-resume the director after server restart
  let directorSessionId: string | undefined;
  const director = await services.agentRegistry.getDirector();
  if (director) {
    const meta = getAgentMetadata(director);
    if (meta?.sessionStatus === 'running' && meta?.sessionId) {
      directorSessionId = meta.sessionId;
      console.log(`[orchestrator] Director was running with session ${directorSessionId} before restart`);
    }
  }

  // Reconcile stale sessions: reset agents marked 'running' to 'idle' if process is dead
  const reconcileResult = await services.sessionManager.reconcileOnStartup();
  if (reconcileResult.reconciled > 0) {
    console.log(`[orchestrator] Reconciled ${reconcileResult.reconciled} stale agent session(s)`);
  }
  if (reconcileResult.errors.length > 0) {
    console.warn('[orchestrator] Reconciliation errors:', reconcileResult.errors);
  }

  const app = new Hono();

  app.use(
    '*',
    cors({
      origin: CORS_ORIGINS,
      allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization', 'Last-Event-ID'],
      credentials: true,
    })
  );

  app.route('/', createHealthRoutes(services));
  app.route('/', createTaskRoutes(services));
  app.route('/', createAgentRoutes(services));
  app.route('/', createSessionRoutes(services, notifyClientsOfNewSession));
  app.route('/', createWorktreeRoutes(services));
  app.route('/', createSchedulerRoutes(services));
  app.route('/', createPluginRoutes(services));
  app.route('/', createEventRoutes(services));
  app.route('/', createUploadRoutes());
  app.route('/', createDaemonRoutes(services));
  app.route('/', createWorkflowRoutes(services));
  app.route('/', createPoolRoutes(services));
  app.route('/', createWorkspaceFilesRoutes());

  // Register shared collaborate routes
  const collaborateServices = {
    api: services.api,
    inboxService: services.inboxService,
    storageBackend: services.storageBackend,
  };
  app.route('/', createElementsRoutes(collaborateServices));
  app.route('/', createEntityRoutes(collaborateServices));
  app.route('/', createChannelRoutes(collaborateServices));
  app.route('/', createMessageRoutes(collaborateServices));
  app.route('/', createLibraryRoutes(collaborateServices));
  app.route('/', createDocumentRoutes(collaborateServices));
  app.route('/', createInboxRoutes(collaborateServices));
  app.route('/', createPlanRoutes(collaborateServices));

  startServer(app, services);

  // Auto-resume director session if it was running before server restart
  // This must happen after startServer() so HTTP/WS infrastructure is ready for clients
  if (directorSessionId && director) {
    const directorId = director.id as unknown as EntityId;
    console.log(`[orchestrator] Attempting to auto-resume director session ${directorSessionId}`);
    try {
      const { session, events } = await services.sessionManager.resumeSession(directorId, {
        providerSessionId: directorSessionId,
        resumePrompt: 'Server restarted. You have been automatically reconnected to your previous session. Check your inbox for any pending messages.',
      });

      // Attach event saver to capture all agent events
      attachSessionEventSaver(events, session.id, directorId, services.sessionMessageService);

      // Notify WebSocket clients of the resumed session
      notifyClientsOfNewSession(directorId, session, events);

      console.log(`[orchestrator] Director session auto-resumed successfully (session: ${session.id})`);
    } catch (error) {
      // Resume failed - director will stay idle and can be started manually via UI
      console.warn('[orchestrator] Failed to auto-resume director session:', error instanceof Error ? error.message : String(error));
      console.log('[orchestrator] Director will remain idle - can be started manually via UI');
    }
  }

  // Auto-start dispatch daemon based on persisted state and environment variable
  // Priority: DAEMON_AUTO_START=false disables auto-start entirely
  // Otherwise, check persisted state (remembers if user stopped it via UI/API)
  const envDisabled = process.env.DAEMON_AUTO_START === 'false';
  const persistedShouldRun = shouldDaemonAutoStart();

  if (!services.dispatchDaemon) {
    console.log('[orchestrator] Dispatch daemon not available (no git repository)');
  } else if (envDisabled) {
    console.log('[orchestrator] Dispatch daemon auto-start disabled (DAEMON_AUTO_START=false)');
  } else if (!persistedShouldRun) {
    console.log('[orchestrator] Dispatch daemon not started (was stopped by user, state persisted)');
  } else {
    services.dispatchDaemon.start();
    saveDaemonState(true, 'server-startup');
    markDaemonAsServerManaged();
    console.log('[orchestrator] Dispatch daemon auto-started');
  }
}

// Start the server
main().catch((err) => {
  console.error('[orchestrator] Fatal error during startup:', err);
  process.exit(1);
});

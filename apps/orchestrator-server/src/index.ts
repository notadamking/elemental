/**
 * Elemental Orchestrator Server
 *
 * HTTP and WebSocket server for agent orchestration.
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
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
} from '@elemental/shared-routes';
import { notifyClientsOfNewSession } from './websocket.js';
import { startServer } from './server.js';

// Main entry point - async to allow service initialization
async function main() {
  const services = await initializeServices();

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

  startServer(app, services);

  // Auto-start dispatch daemon unless disabled via environment variable
  const daemonAutoStart = process.env.DAEMON_AUTO_START !== 'false';
  if (daemonAutoStart && services.dispatchDaemon) {
    services.dispatchDaemon.start();
    markDaemonAsServerManaged();
    console.log('[orchestrator] Dispatch daemon auto-started');
  } else if (!services.dispatchDaemon) {
    console.log('[orchestrator] Dispatch daemon not available (no git repository)');
  } else {
    console.log('[orchestrator] Dispatch daemon auto-start disabled (DAEMON_AUTO_START=false)');
  }
}

// Start the server
main().catch((err) => {
  console.error('[orchestrator] Fatal error during startup:', err);
  process.exit(1);
});

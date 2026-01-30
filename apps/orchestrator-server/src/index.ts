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
} from './routes/index.js';
import { notifyClientsOfNewSession } from './websocket.js';
import { startServer } from './server.js';

const services = initializeServices();

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

startServer(app, services);

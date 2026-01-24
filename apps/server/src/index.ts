/**
 * Elemental Platform Server
 *
 * HTTP + WebSocket server for the Elemental web platform.
 * Built with Hono for fast, minimal overhead.
 */

import { resolve, dirname } from 'node:path';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { createStorage, createElementalAPI, initializeSchema } from '@elemental/cli';
import type { ElementalAPI } from '@elemental/cli';
import type { ServerWebSocket } from 'bun';
import { initializeBroadcaster } from './ws/broadcaster.js';
import { handleOpen, handleMessage, handleClose, handleError, getClientCount, type ClientData } from './ws/handler.js';

// ============================================================================
// Server Configuration
// ============================================================================

const PORT = parseInt(process.env.PORT || '3456', 10);
const HOST = process.env.HOST || 'localhost';

// Database path - defaults to .elemental/elemental.db in project root
// Resolve relative paths from the project root (two levels up from apps/server/src)
const PROJECT_ROOT = resolve(dirname(import.meta.path), '../../..');
const DEFAULT_DB_PATH = resolve(PROJECT_ROOT, '.elemental/elemental.db');
const DB_PATH = process.env.ELEMENTAL_DB_PATH || DEFAULT_DB_PATH;

// ============================================================================
// Initialize API
// ============================================================================

let api: ElementalAPI;

try {
  const backend = createStorage({ path: DB_PATH });
  initializeSchema(backend);
  api = createElementalAPI(backend);
  console.log(`[elemental] Connected to database: ${DB_PATH}`);
} catch (error) {
  console.error('[elemental] Failed to initialize database:', error);
  process.exit(1);
}

// ============================================================================
// Initialize Event Broadcaster
// ============================================================================

const broadcaster = initializeBroadcaster(api);
broadcaster.start().catch((err) => {
  console.error('[elemental] Failed to start event broadcaster:', err);
});

// ============================================================================
// Create Hono App
// ============================================================================

const app = new Hono();

// CORS middleware - allow web app to connect
app.use(
  '*',
  cors({
    origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
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
    websocket: {
      clients: getClientCount(),
      broadcasting: broadcaster.listenerCount > 0,
    },
  });
});

// ============================================================================
// Stats Endpoint
// ============================================================================

app.get('/api/stats', async (c) => {
  try {
    const stats = await api.stats();
    return c.json(stats);
  } catch (error) {
    console.error('[elemental] Failed to get stats:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get stats' } }, 500);
  }
});

// ============================================================================
// Tasks Endpoints
// ============================================================================

app.get('/api/tasks/ready', async (c) => {
  try {
    const tasks = await api.ready();
    return c.json(tasks);
  } catch (error) {
    console.error('[elemental] Failed to get ready tasks:', error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get ready tasks' } }, 500);
  }
});

// ============================================================================
// Start Server with WebSocket Support
// ============================================================================

console.log(`[elemental] Starting server on http://${HOST}:${PORT}`);

export default {
  port: PORT,
  hostname: HOST,
  fetch(request: Request, server: { upgrade: (request: Request, options?: { data?: ClientData }) => boolean }) {
    // Handle WebSocket upgrade at the Bun level
    const url = new URL(request.url);
    if (url.pathname === '/ws') {
      const upgradeHeader = request.headers.get('Upgrade');
      if (upgradeHeader?.toLowerCase() === 'websocket') {
        const success = server.upgrade(request, {
          data: {} as ClientData,
        });
        if (success) {
          // Bun handles the upgrade, return undefined
          return undefined;
        }
        return new Response('WebSocket upgrade failed', { status: 500 });
      }
      return new Response('Expected WebSocket Upgrade request', { status: 426 });
    }

    // Handle regular HTTP requests with Hono
    return app.fetch(request);
  },
  websocket: {
    open(ws: ServerWebSocket<ClientData>) {
      handleOpen(ws);
    },
    message(ws: ServerWebSocket<ClientData>, message: string | Buffer) {
      handleMessage(ws, message);
    },
    close(ws: ServerWebSocket<ClientData>) {
      handleClose(ws);
    },
    error(ws: ServerWebSocket<ClientData>, error: Error) {
      handleError(ws, error);
    },
  },
};

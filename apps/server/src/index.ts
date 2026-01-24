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
// Start Server
// ============================================================================

console.log(`[elemental] Starting server on http://${HOST}:${PORT}`);

export default {
  port: PORT,
  hostname: HOST,
  fetch: app.fetch,
};

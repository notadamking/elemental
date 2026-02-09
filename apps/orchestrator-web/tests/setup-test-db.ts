/**
 * Pre-server setup script for Playwright tests.
 *
 * This script runs BEFORE the orchestrator-server starts to ensure the
 * .elemental-test directory and database exist. This fixes a race condition
 * where Playwright may start webServer processes before globalSetup runs.
 *
 * globalSetup still handles seeding test data (e.g., the operator entity).
 */
import { mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStorage, initializeSchema } from '@elemental/storage';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '../../..');
const TEST_ELEMENTAL_DIR = resolve(PROJECT_ROOT, '.elemental-test');
const TEST_DB_PATH = resolve(TEST_ELEMENTAL_DIR, 'elemental.db');

// Create directory if it doesn't exist
mkdirSync(TEST_ELEMENTAL_DIR, { recursive: true });

// Initialize DB schema if it doesn't exist
if (!existsSync(TEST_DB_PATH)) {
  try {
    const backend = createStorage({ path: TEST_DB_PATH, create: true });
    initializeSchema(backend);
    backend.close();
  } catch (error) {
    // If we get an error, another process may have already created it
    // This is fine - the DB is now ready
    if (!existsSync(TEST_DB_PATH)) {
      throw error;
    }
  }
}

console.log('[setup-test-db] Test database ready at:', TEST_DB_PATH);

import { mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '../../..');
const TEST_ELEMENTAL_DIR = resolve(PROJECT_ROOT, '.elemental-test');
const TEST_DB_PATH = resolve(TEST_ELEMENTAL_DIR, 'elemental.db');
const SETUP_SCRIPT = resolve(__dirname, 'setup-test-db.ts');

/**
 * Global setup for Playwright tests.
 * Creates the test database with fixtures using a Bun subprocess.
 * This approach is needed because Playwright runs in Node.js but our
 * storage and API modules require Bun to work correctly.
 */
export default async function globalSetup() {
  // Create the test directory if it doesn't exist
  mkdirSync(TEST_ELEMENTAL_DIR, { recursive: true });

  console.log('[globalSetup] Setting up test database with fixtures...');

  // Use Bun to run the setup script since our storage modules require Bun
  try {
    execSync(`bun run ${SETUP_SCRIPT}`, {
      cwd: PROJECT_ROOT,
      stdio: 'inherit',
    });
    console.log('[globalSetup] Test database created successfully');
  } catch (error) {
    console.error('[globalSetup] Failed to create test database:', error);
    throw error;
  }
}

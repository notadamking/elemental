import { rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '../../..');
const TEST_ELEMENTAL_DIR = resolve(PROJECT_ROOT, '.elemental-test');

export default async function globalTeardown() {
  try {
    rmSync(TEST_ELEMENTAL_DIR, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

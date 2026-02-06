import { rmSync } from 'node:fs';
import { resolve } from 'node:path';

const PROJECT_ROOT = resolve(__dirname, '../../..');
const TEST_ELEMENTAL_DIR = resolve(PROJECT_ROOT, '.elemental-test');

export default async function globalTeardown() {
  try {
    rmSync(TEST_ELEMENTAL_DIR, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

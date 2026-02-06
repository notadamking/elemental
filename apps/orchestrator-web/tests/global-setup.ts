import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStorage, initializeSchema } from '@elemental/storage';
import { createElementalAPI } from '@elemental/sdk';
import { ElementType, createTimestamp, EntityTypeValue } from '@elemental/core';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '../../..');
const TEST_ELEMENTAL_DIR = resolve(PROJECT_ROOT, '.elemental-test');
const TEST_DB_PATH = resolve(TEST_ELEMENTAL_DIR, 'elemental.db');

export default async function globalSetup() {
  mkdirSync(TEST_ELEMENTAL_DIR, { recursive: true });

  const backend = createStorage({ path: TEST_DB_PATH, create: true });
  initializeSchema(backend);
  const api = createElementalAPI(backend);

  // Create default operator entity (same as `el init`)
  const now = createTimestamp();
  await api.create({
    id: 'el-0000',
    type: ElementType.ENTITY,
    createdAt: now,
    updatedAt: now,
    createdBy: 'el-0000',
    tags: [],
    metadata: {},
    name: 'operator',
    entityType: EntityTypeValue.HUMAN,
  });
}

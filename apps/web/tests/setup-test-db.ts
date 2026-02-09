/**
 * Setup script for test database - runs with Bun
 *
 * This script creates the test database with fixtures needed for UI tests.
 * It's called from global-setup.ts which runs in Node.js but delegates
 * the actual database creation to this Bun script.
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStorage, initializeSchema } from '../../../packages/storage/src/index.ts';
import { createElementalAPI } from '../../../packages/sdk/src/api/elemental-api.ts';
import { ElementType, createTimestamp, EntityTypeValue, DocumentStatus } from '../../../packages/core/src/index.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '../../..');
const TEST_ELEMENTAL_DIR = resolve(PROJECT_ROOT, '.elemental-test');
const TEST_DB_PATH = resolve(TEST_ELEMENTAL_DIR, 'elemental.db');

const backend = createStorage({ path: TEST_DB_PATH, create: true });
initializeSchema(backend);
const api = createElementalAPI(backend);

const now = createTimestamp();

// Create default operator entity (same as `el init`)
const existingOperator = await api.get('el-0000');
if (!existingOperator) {
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

// Create test fixtures for block-editor tests
// Create a test library
const existingLibrary = await api.get('el-kr5w');
if (!existingLibrary) {
  await api.create({
    id: 'el-kr5w',
    type: 'library',
    createdAt: now,
    updatedAt: now,
    createdBy: 'el-0000',
    tags: [],
    metadata: {},
    name: 'Test Library',
    description: 'Library for testing',
  });
}

// Create a test document in the library
const existingDocument = await api.get('el-5ebx');
if (!existingDocument) {
  await api.create({
    id: 'el-5ebx',
    type: 'document',
    createdAt: now,
    updatedAt: now,
    createdBy: 'el-0000',
    tags: [],
    metadata: {},
    title: 'Test Document',
    content: 'This is test content for the document.',
    contentType: 'text',
    status: DocumentStatus.ACTIVE,
  });

  // Add document to library via parent-child dependency
  await api.addDependency({
    blockedId: 'el-5ebx',
    blockerId: 'el-kr5w',
    type: 'parent-child',
  });
}

// Close the database connection to release the file lock
backend.close();

console.log('[setup-test-db] Test database created successfully at', TEST_DB_PATH);

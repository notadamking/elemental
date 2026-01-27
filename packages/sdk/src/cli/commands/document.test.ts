/**
 * Document Commands E2E Tests
 *
 * Tests for the document CLI commands and lifecycle:
 * - doc create: Create a new document
 * - doc list: List documents
 * - doc show: Show document details
 * - doc history: Show version history
 * - doc rollback: Rollback to a previous version
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { documentCommand } from './document.js';
import type { GlobalOptions } from '../types.js';
import { ExitCode } from '../types.js';
import { createStorage, initializeSchema } from '@elemental/storage';
import { createElementalAPI } from '../../api/elemental-api.js';
import type { Document, DocumentId } from '@elemental/core';
import type { ElementId } from '@elemental/core';

// ============================================================================
// Test Utilities
// ============================================================================

const TEST_DIR = join(import.meta.dir, '__test_document_workspace__');
const ELEMENTAL_DIR = join(TEST_DIR, '.elemental');
const DB_PATH = join(ELEMENTAL_DIR, 'elemental.db');

function createTestOptions<T extends Record<string, unknown> = Record<string, unknown>>(
  overrides: T = {} as T
): GlobalOptions & T {
  return {
    db: DB_PATH,
    actor: 'test-user',
    json: false,
    quiet: false,
    verbose: false,
    help: false,
    version: false,
    ...overrides,
  };
}

// Helper to create a document and return it
async function createTestDocument(
  content: string,
  extra: Record<string, unknown> = {}
): Promise<Document> {
  const options = createTestOptions({ content, ...extra });
  const result = await documentCommand.subcommands!.create.handler!([], options);
  return result.data as Document;
}

// Helper to create API instance for direct manipulation
function createTestAPI() {
  const backend = createStorage({ path: DB_PATH, create: true });
  initializeSchema(backend);
  return { api: createElementalAPI(backend), backend };
}

// ============================================================================
// Setup / Teardown
// ============================================================================

beforeEach(() => {
  // Create test workspace
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true });
  }
  mkdirSync(ELEMENTAL_DIR, { recursive: true });
});

afterEach(() => {
  // Cleanup test workspace
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true });
  }
});

// ============================================================================
// Document Create Command Tests
// ============================================================================

describe('doc create command', () => {
  test('creates document with inline content', async () => {
    const options = createTestOptions({ content: 'Hello, World!' });
    const result = await documentCommand.subcommands!.create.handler!([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toBeDefined();
    const doc = result.data as Document;
    expect(doc.content).toBe('Hello, World!');
    expect(doc.contentType).toBe('text');
    expect(doc.version).toBe(1);
  });

  test('creates document from file', async () => {
    const filePath = join(TEST_DIR, 'test.md');
    writeFileSync(filePath, '# Test Markdown\n\nSome content');

    const options = createTestOptions({ file: filePath, type: 'markdown' });
    const result = await documentCommand.subcommands!.create.handler!([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const doc = result.data as Document;
    expect(doc.content).toBe('# Test Markdown\n\nSome content');
    expect(doc.contentType).toBe('markdown');
  });

  test('creates JSON document with validation', async () => {
    const jsonContent = JSON.stringify({ key: 'value', nested: { a: 1 } });
    const options = createTestOptions({ content: jsonContent, type: 'json' });
    const result = await documentCommand.subcommands!.create.handler!([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const doc = result.data as Document;
    expect(doc.contentType).toBe('json');
    expect(JSON.parse(doc.content)).toEqual({ key: 'value', nested: { a: 1 } });
  });

  test('creates document with tags', async () => {
    const options = createTestOptions({ content: 'Tagged doc', tag: ['important', 'v1'] });
    const result = await documentCommand.subcommands!.create.handler!([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const doc = result.data as Document;
    expect(doc.tags).toContain('important');
    expect(doc.tags).toContain('v1');
  });

  test('fails when neither content nor file is provided', async () => {
    const options = createTestOptions();
    const result = await documentCommand.subcommands!.create.handler!([], options);

    expect(result.exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
    expect(result.error).toContain('--content or --file');
  });

  test('fails when both content and file are provided', async () => {
    const filePath = join(TEST_DIR, 'test.txt');
    writeFileSync(filePath, 'File content');

    const options = createTestOptions({ content: 'Inline content', file: filePath });
    const result = await documentCommand.subcommands!.create.handler!([], options);

    expect(result.exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
    expect(result.error).toContain('Cannot specify both');
  });

  test('fails for invalid content type', async () => {
    const options = createTestOptions({ content: 'Test', type: 'invalid' });
    const result = await documentCommand.subcommands!.create.handler!([], options);

    expect(result.exitCode).toBe(ExitCode.VALIDATION);
    expect(result.error).toContain('Invalid content type');
  });
});

// ============================================================================
// Document List Command Tests
// ============================================================================

describe('doc list command', () => {
  test('lists all documents', async () => {
    await createTestDocument('Doc 1');
    await createTestDocument('Doc 2');
    await createTestDocument('Doc 3');

    const options = createTestOptions({ json: true });
    const result = await documentCommand.subcommands!.list.handler!([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const docs = result.data as Document[];
    expect(docs.length).toBe(3);
  });

  test('filters by content type', async () => {
    await createTestDocument('Text doc', { type: 'text' });
    await createTestDocument('# Markdown', { type: 'markdown' });
    await createTestDocument('{"a":1}', { type: 'json' });

    const options = createTestOptions({ type: 'markdown', json: true });
    const result = await documentCommand.subcommands!.list.handler!([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const docs = result.data as Document[];
    expect(docs.length).toBe(1);
    expect(docs[0].contentType).toBe('markdown');
  });

  test('respects limit option', async () => {
    await createTestDocument('Doc 1');
    await createTestDocument('Doc 2');
    await createTestDocument('Doc 3');

    const options = createTestOptions({ limit: '2', json: true });
    const result = await documentCommand.subcommands!.list.handler!([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const docs = result.data as Document[];
    expect(docs.length).toBe(2);
  });

  test('returns empty for no documents', async () => {
    // Initialize the database first by creating and deleting a document
    const { backend } = createTestAPI();
    backend.close();

    const options = createTestOptions({ json: true });
    const result = await documentCommand.subcommands!.list.handler!([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const docs = result.data as Document[];
    expect(docs.length).toBe(0);
  });
});

// ============================================================================
// Document Show Command Tests
// ============================================================================

describe('doc show command', () => {
  test('shows document details', async () => {
    const doc = await createTestDocument('Show me');

    const options = createTestOptions({ json: true });
    const result = await documentCommand.subcommands!.show.handler!([doc.id], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const shownDoc = result.data as Document;
    expect(shownDoc.id).toBe(doc.id);
    expect(shownDoc.content).toBe('Show me');
  });

  test('shows specific version', async () => {
    const doc = await createTestDocument('Version 1');
    const { api, backend } = createTestAPI();
    await api.update<Document>(doc.id as ElementId, { content: 'Version 2' });
    backend.close();

    const options = createTestOptions({ docVersion: '1', json: true });
    const result = await documentCommand.subcommands!.show.handler!([doc.id], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const shownDoc = result.data as Document;
    expect(shownDoc.version).toBe(1);
    expect(shownDoc.content).toBe('Version 1');
  });

  test('fails for non-existent document', async () => {
    // Initialize database first
    const { backend } = createTestAPI();
    backend.close();

    const options = createTestOptions();
    const result = await documentCommand.subcommands!.show.handler!(['el-nonexistent'], options);

    expect(result.exitCode).toBe(ExitCode.NOT_FOUND);
  });

  test('fails for non-existent version', async () => {
    const doc = await createTestDocument('Only version');

    const options = createTestOptions({ docVersion: '99' });
    const result = await documentCommand.subcommands!.show.handler!([doc.id], options);

    expect(result.exitCode).toBe(ExitCode.NOT_FOUND);
  });
});

// ============================================================================
// Document History Command Tests
// ============================================================================

describe('doc history command', () => {
  test('shows version history', async () => {
    const doc = await createTestDocument('Initial');
    const { api, backend } = createTestAPI();
    await api.update<Document>(doc.id as ElementId, { content: 'Update 1' });
    await api.update<Document>(doc.id as ElementId, { content: 'Update 2' });
    backend.close();

    const options = createTestOptions({ json: true });
    const result = await documentCommand.subcommands!.history.handler!([doc.id], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const history = result.data as Document[];
    expect(history.length).toBe(3);
    expect(history[0].version).toBe(3);
    expect(history[1].version).toBe(2);
    expect(history[2].version).toBe(1);
  });

  test('respects limit option', async () => {
    const doc = await createTestDocument('V1');
    const { api, backend } = createTestAPI();
    await api.update<Document>(doc.id as ElementId, { content: 'V2' });
    await api.update<Document>(doc.id as ElementId, { content: 'V3' });
    await api.update<Document>(doc.id as ElementId, { content: 'V4' });
    backend.close();

    const options = createTestOptions({ limit: '2', json: true });
    const result = await documentCommand.subcommands!.history.handler!([doc.id], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const history = result.data as Document[];
    expect(history.length).toBe(2);
  });

  test('shows single version for new document', async () => {
    const doc = await createTestDocument('Only version');

    const options = createTestOptions({ json: true });
    const result = await documentCommand.subcommands!.history.handler!([doc.id], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const history = result.data as Document[];
    expect(history.length).toBe(1);
    expect(history[0].version).toBe(1);
  });

  test('fails for non-existent document', async () => {
    // Initialize database first
    const { backend } = createTestAPI();
    backend.close();

    const options = createTestOptions();
    const result = await documentCommand.subcommands!.history.handler!(['el-nonexistent'], options);

    expect(result.exitCode).toBe(ExitCode.NOT_FOUND);
  });
});

// ============================================================================
// Document Rollback Command Tests
// ============================================================================

describe('doc rollback command', () => {
  test('rolls back to previous version', async () => {
    const doc = await createTestDocument('Original content');
    const { api, backend } = createTestAPI();
    await api.update<Document>(doc.id as ElementId, { content: 'Bad change' });
    backend.close();

    const options = createTestOptions({ json: true });
    const result = await documentCommand.subcommands!.rollback.handler!([doc.id, '1'], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const rolled = result.data as Document;
    expect(rolled.content).toBe('Original content');
    expect(rolled.version).toBe(3); // Rollback creates a new version
  });

  test('creates new version on rollback (preserves history)', async () => {
    const doc = await createTestDocument('V1');
    const { api, backend } = createTestAPI();
    await api.update<Document>(doc.id as ElementId, { content: 'V2' });
    await api.update<Document>(doc.id as ElementId, { content: 'V3' });
    backend.close();

    await documentCommand.subcommands!.rollback.handler!([doc.id, '1'], createTestOptions());

    const historyOptions = createTestOptions({ json: true });
    const historyResult = await documentCommand.subcommands!.history.handler!([doc.id], historyOptions);
    const history = historyResult.data as Document[];

    expect(history.length).toBe(4);
    expect(history[0].version).toBe(4);
    expect(history[0].content).toBe('V1'); // Rolled back content
  });

  test('returns current when already at version', async () => {
    const doc = await createTestDocument('Only version');

    const options = createTestOptions();
    const result = await documentCommand.subcommands!.rollback.handler!([doc.id, '1'], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.message).toContain('already at version');
  });

  test('fails for non-existent version', async () => {
    const doc = await createTestDocument('Content');

    const options = createTestOptions();
    const result = await documentCommand.subcommands!.rollback.handler!([doc.id, '99'], options);

    expect(result.exitCode).toBe(ExitCode.NOT_FOUND);
  });

  test('fails with invalid version argument', async () => {
    const doc = await createTestDocument('Content');

    const options = createTestOptions();
    const result = await documentCommand.subcommands!.rollback.handler!([doc.id, 'abc'], options);

    expect(result.exitCode).toBe(ExitCode.VALIDATION);
  });
});

// ============================================================================
// Document Lifecycle E2E Tests
// ============================================================================

describe('document lifecycle E2E scenarios', () => {
  test('complete document lifecycle: create → update → view history → rollback', async () => {
    // 1. Create a new document
    const createOptions = createTestOptions({
      content: 'Initial specification draft',
      type: 'markdown',
      tag: ['spec', 'v1'],
    });
    const createResult = await documentCommand.subcommands!.create.handler!([], createOptions);
    expect(createResult.exitCode).toBe(ExitCode.SUCCESS);
    const doc = createResult.data as Document;
    expect(doc.version).toBe(1);

    // 2. Update the document multiple times (simulating revisions)
    const { api, backend } = createTestAPI();

    await api.update<Document>(doc.id as ElementId, {
      content: '# Specification v2\n\nAdded requirements section',
    });

    await api.update<Document>(doc.id as ElementId, {
      content: '# Specification v3\n\nBroken changes - mistake!',
    });
    backend.close();

    // 3. View current state
    const showOptions = createTestOptions({ json: true });
    const showResult = await documentCommand.subcommands!.show.handler!([doc.id], showOptions);
    expect((showResult.data as Document).version).toBe(3);
    expect((showResult.data as Document).content).toContain('mistake');

    // 4. Check version history
    const historyOptions = createTestOptions({ json: true });
    const historyResult = await documentCommand.subcommands!.history.handler!([doc.id], historyOptions);
    expect(historyResult.exitCode).toBe(ExitCode.SUCCESS);
    const history = historyResult.data as Document[];
    expect(history.length).toBe(3);

    // 5. Rollback to v2 (before the mistake)
    const rollbackOptions = createTestOptions({ json: true });
    const rollbackResult = await documentCommand.subcommands!.rollback.handler!([doc.id, '2'], rollbackOptions);
    expect(rollbackResult.exitCode).toBe(ExitCode.SUCCESS);
    const rolledBack = rollbackResult.data as Document;
    expect(rolledBack.content).toContain('requirements section');
    expect(rolledBack.version).toBe(4); // New version created

    // 6. Verify final state and complete history
    const finalHistoryResult = await documentCommand.subcommands!.history.handler!([doc.id], historyOptions);
    const finalHistory = finalHistoryResult.data as Document[];
    expect(finalHistory.length).toBe(4);
    expect(finalHistory[0].content).toContain('requirements section');
  });

  test('document versioning with content type changes', async () => {
    // 1. Create a text document
    const doc = await createTestDocument('Plain text notes');
    expect(doc.contentType).toBe('text');

    // 2. Verify list shows the document
    const listOptions = createTestOptions({ json: true });
    const listResult = await documentCommand.subcommands!.list.handler!([], listOptions);
    expect((listResult.data as Document[]).some(d => d.id === doc.id)).toBe(true);

    // 3. Update content (contentType is preserved)
    const { api, backend } = createTestAPI();
    const updated = await api.update<Document>(doc.id as ElementId, {
      content: 'Updated plain text notes',
    });
    expect(updated.contentType).toBe('text'); // Preserved
    backend.close();

    // 4. Verify history shows same content type
    const historyOptions = createTestOptions({ json: true });
    const historyResult = await documentCommand.subcommands!.history.handler!([doc.id], historyOptions);
    const history = historyResult.data as Document[];
    expect(history.every(h => h.contentType === 'text')).toBe(true);
  });

  test('multiple documents with independent version histories', async () => {
    // 1. Create two documents
    const doc1 = await createTestDocument('Document A - v1');
    const doc2 = await createTestDocument('Document B - v1');

    // 2. Update them independently
    const { api, backend } = createTestAPI();
    await api.update<Document>(doc1.id as ElementId, { content: 'Document A - v2' });
    await api.update<Document>(doc1.id as ElementId, { content: 'Document A - v3' });
    await api.update<Document>(doc2.id as ElementId, { content: 'Document B - v2' });
    backend.close();

    // 3. Verify independent histories
    const historyOptions = createTestOptions({ json: true });

    const history1Result = await documentCommand.subcommands!.history.handler!([doc1.id], historyOptions);
    const history1 = history1Result.data as Document[];
    expect(history1.length).toBe(3);

    const history2Result = await documentCommand.subcommands!.history.handler!([doc2.id], historyOptions);
    const history2 = history2Result.data as Document[];
    expect(history2.length).toBe(2);

    // 4. Rollback doc1 only
    await documentCommand.subcommands!.rollback.handler!([doc1.id, '1'], createTestOptions());

    // 5. Verify doc2 is unaffected
    const finalHistory2 = await documentCommand.subcommands!.history.handler!([doc2.id], historyOptions);
    expect((finalHistory2.data as Document[]).length).toBe(2);
  });

  test('document persistence across database connections', async () => {
    // 1. Create document and update it
    const doc = await createTestDocument('Persistent content');

    let api = createTestAPI();
    await api.api.update<Document>(doc.id as ElementId, { content: 'Updated content' });
    api.backend.close();

    // 2. Reconnect and verify data persists
    const { api: api2, backend: backend2 } = createTestAPI();
    const retrieved = await api2.get<Document>(doc.id as ElementId);

    expect(retrieved).toBeDefined();
    expect(retrieved!.content).toBe('Updated content');
    expect(retrieved!.version).toBe(2);

    // 3. Verify history persists
    const history = await api2.getDocumentHistory(doc.id as DocumentId);
    expect(history.length).toBe(2);
    backend2.close();
  });

  test('JSON document lifecycle with validation', async () => {
    // 1. Create valid JSON document
    const validJson = JSON.stringify({ config: { setting: 'value' } });
    const options = createTestOptions({ content: validJson, type: 'json' });
    const createResult = await documentCommand.subcommands!.create.handler!([], options);
    expect(createResult.exitCode).toBe(ExitCode.SUCCESS);
    const doc = createResult.data as Document;

    // 2. Update with valid JSON
    const { api, backend } = createTestAPI();
    const updated = await api.update<Document>(doc.id as ElementId, {
      content: JSON.stringify({ config: { setting: 'new_value', extra: true } }),
    });
    expect(updated.version).toBe(2);
    backend.close();

    // 3. Verify history contains valid JSON at each version
    const historyOptions = createTestOptions({ json: true });
    const historyResult = await documentCommand.subcommands!.history.handler!([doc.id], historyOptions);
    const history = historyResult.data as Document[];

    for (const version of history) {
      expect(() => JSON.parse(version.content)).not.toThrow();
    }
  });

  test('document with empty content transitions', async () => {
    // 1. Create with content
    const doc = await createTestDocument('Has content');

    // 2. Update to empty
    const { api, backend } = createTestAPI();
    await api.update<Document>(doc.id as ElementId, { content: '' });

    // 3. Update back to content
    await api.update<Document>(doc.id as ElementId, { content: 'Content restored' });
    backend.close();

    // 4. Verify history tracks all transitions
    const historyOptions = createTestOptions({ json: true });
    const historyResult = await documentCommand.subcommands!.history.handler!([doc.id], historyOptions);
    const history = historyResult.data as Document[];

    expect(history.length).toBe(3);
    expect(history[0].content).toBe('Content restored');
    expect(history[1].content).toBe('');
    expect(history[2].content).toBe('Has content');
  });
});

// ============================================================================
// Document Output Format Tests
// ============================================================================

describe('document output formats', () => {
  test('quiet mode returns only content', async () => {
    const doc = await createTestDocument('Quiet content');

    const options = createTestOptions({ quiet: true });
    const result = await documentCommand.subcommands!.show.handler!([doc.id], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toBe('Quiet content');
  });

  test('quiet mode for list returns IDs', async () => {
    await createTestDocument('Doc 1');
    await createTestDocument('Doc 2');

    const options = createTestOptions({ quiet: true });
    const result = await documentCommand.subcommands!.list.handler!([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(typeof result.data).toBe('string');
    expect((result.data as string).split('\n').length).toBe(2);
  });

  test('json mode returns full document object', async () => {
    const doc = await createTestDocument('JSON output test');

    const options = createTestOptions({ json: true });
    const result = await documentCommand.subcommands!.show.handler!([doc.id], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const data = result.data as Document;
    expect(data.id).toBeDefined();
    expect(data.type).toBe('document');
    expect(data.content).toBe('JSON output test');
    expect(data.version).toBe(1);
    expect(data.createdAt).toBeDefined();
  });
});

// ============================================================================
// Document Edge Cases
// ============================================================================

describe('document edge cases', () => {
  test('handles large content', async () => {
    const largeContent = 'x'.repeat(100000); // 100KB
    const doc = await createTestDocument(largeContent);

    const showOptions = createTestOptions({ json: true });
    const result = await documentCommand.subcommands!.show.handler!([doc.id], showOptions);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect((result.data as Document).content.length).toBe(100000);
  });

  test('handles special characters in content', async () => {
    const specialContent = 'Line 1\nLine 2\tTabbed\r\nCRLF\n\n"Quoted" & <Tagged>';
    const doc = await createTestDocument(specialContent);

    const showOptions = createTestOptions({ json: true });
    const result = await documentCommand.subcommands!.show.handler!([doc.id], showOptions);

    expect((result.data as Document).content).toBe(specialContent);
  });

  test('handles unicode content', async () => {
    const unicodeContent = '日本語 • Emojis 🎉 • Math ∑∏∫ • Greek αβγ';
    const doc = await createTestDocument(unicodeContent);

    const showOptions = createTestOptions({ json: true });
    const result = await documentCommand.subcommands!.show.handler!([doc.id], showOptions);

    expect((result.data as Document).content).toBe(unicodeContent);
  });

  test('rapid version updates', async () => {
    const doc = await createTestDocument('Start');
    const { api, backend } = createTestAPI();

    // Rapid sequential updates
    for (let i = 1; i <= 20; i++) {
      await api.update<Document>(doc.id as ElementId, { content: `Update ${i}` });
    }
    backend.close();

    const historyOptions = createTestOptions({ json: true });
    const historyResult = await documentCommand.subcommands!.history.handler!([doc.id], historyOptions);
    const history = historyResult.data as Document[];

    expect(history.length).toBe(21); // Initial + 20 updates
    expect(history[0].version).toBe(21);
    expect(history[0].content).toBe('Update 20');
  });
});

// ============================================================================
// Document Tombstone Handling Tests
// ============================================================================

describe('document tombstone handling', () => {
  test('rollback fails on tombstoned document', async () => {
    // Create document with version history
    const doc = await createTestDocument('Version 1');
    const { api, backend } = createTestAPI();
    await api.update<Document>(doc.id as ElementId, { content: 'Version 2' });

    // Soft-delete the document
    await api.delete(doc.id as ElementId, { reason: 'Testing tombstone' });
    backend.close();

    // Try to rollback - should fail
    const result = await documentCommand.subcommands!.rollback.handler!(
      [doc.id, '1'],
      createTestOptions()
    );

    expect(result.exitCode).toBe(ExitCode.NOT_FOUND);
    expect(result.error).toContain('Cannot rollback deleted document');
  });

  test('history fails on tombstoned document', async () => {
    const doc = await createTestDocument('Some content');
    const { api, backend } = createTestAPI();

    // Soft-delete the document
    await api.delete(doc.id as ElementId, { reason: 'Testing tombstone' });
    backend.close();

    // Try to view history - should fail
    const result = await documentCommand.subcommands!.history.handler!(
      [doc.id],
      createTestOptions()
    );

    expect(result.exitCode).toBe(ExitCode.NOT_FOUND);
    expect(result.error).toContain('Document not found');
  });

  test('show fails on tombstoned document', async () => {
    const doc = await createTestDocument('Show me');
    const { api, backend } = createTestAPI();

    // Soft-delete the document
    await api.delete(doc.id as ElementId, { reason: 'Testing tombstone' });
    backend.close();

    // Try to show - should fail
    const result = await documentCommand.subcommands!.show.handler!(
      [doc.id],
      createTestOptions()
    );

    expect(result.exitCode).toBe(ExitCode.NOT_FOUND);
    expect(result.error).toContain('Document not found');
  });

  test('list excludes tombstoned documents', async () => {
    // Create two documents
    const doc1 = await createTestDocument('Doc 1');
    const doc2 = await createTestDocument('Doc 2');

    // Soft-delete one
    const { api, backend } = createTestAPI();
    await api.delete(doc1.id as ElementId, { reason: 'Testing' });
    backend.close();

    // List should only show the non-deleted document
    const listOptions = createTestOptions({ json: true });
    const result = await documentCommand.subcommands!.list.handler!([], listOptions);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const docs = result.data as Document[];
    expect(docs.length).toBe(1);
    expect(docs[0].id).toBe(doc2.id);
  });
});

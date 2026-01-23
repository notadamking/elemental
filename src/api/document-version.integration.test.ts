/**
 * Document Versioning Integration Tests
 *
 * Tests for Document version history:
 * - Version history is saved on update
 * - getDocumentVersion retrieves specific versions
 * - getDocumentHistory retrieves full version history
 * - Version number auto-increments
 * - previousVersionId is correctly linked
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { ElementalAPIImpl } from './elemental-api.js';
import { createStorage, initializeSchema } from '../storage/index.js';
import type { StorageBackend } from '../storage/backend.js';
import type { EntityId, ElementId } from '../types/element.js';
import type { Document, DocumentId } from '../types/document.js';
import { createDocument, ContentType } from '../types/document.js';

// ============================================================================
// Test Helpers
// ============================================================================

const mockEntityId = 'user:test-user' as EntityId;

function toCreateInput<T>(element: T): Parameters<ElementalAPIImpl['create']>[0] {
  return element as unknown as Parameters<ElementalAPIImpl['create']>[0];
}

async function createTestDocument(
  overrides: Partial<Parameters<typeof createDocument>[0]> = {}
): Promise<Document> {
  return createDocument({
    content: 'Initial content',
    contentType: ContentType.MARKDOWN,
    createdBy: mockEntityId,
    ...overrides,
  });
}

// ============================================================================
// Tests
// ============================================================================

describe('Document Versioning', () => {
  let backend: StorageBackend;
  let api: ElementalAPIImpl;

  beforeEach(() => {
    backend = createStorage({ path: ':memory:' });
    initializeSchema(backend);
    api = new ElementalAPIImpl(backend);
  });

  afterEach(() => {
    if (backend.isOpen) {
      backend.close();
    }
  });

  // --------------------------------------------------------------------------
  // Version Creation on Update
  // --------------------------------------------------------------------------

  describe('Version Creation on Update', () => {
    it('should create version history when document is updated', async () => {
      // Create initial document
      const doc = await createTestDocument({
        content: 'Version 1 content',
      });
      const created = await api.create<Document>(toCreateInput(doc));

      // Update the document
      const updated = await api.update<Document>(created.id, {
        content: 'Version 2 content',
      });

      // Verify version incremented
      expect(updated.version).toBe(2);
      expect(updated.previousVersionId).toBe(created.id);

      // Verify history contains previous version
      const history = await api.getDocumentHistory(created.id as unknown as DocumentId);
      expect(history.length).toBe(2);

      // Current version should be first
      expect(history[0].version).toBe(2);
      expect(history[0].content).toBe('Version 2 content');

      // Previous version should be second
      expect(history[1].version).toBe(1);
      expect(history[1].content).toBe('Version 1 content');
    });

    it('should preserve all versions through multiple updates', async () => {
      const doc = await createTestDocument({ content: 'V1' });
      const created = await api.create<Document>(toCreateInput(doc));

      // Update multiple times
      await api.update<Document>(created.id, { content: 'V2' });
      await api.update<Document>(created.id, { content: 'V3' });
      const v4 = await api.update<Document>(created.id, { content: 'V4' });

      expect(v4.version).toBe(4);

      const history = await api.getDocumentHistory(created.id as unknown as DocumentId);
      expect(history.length).toBe(4);

      // Verify order and content
      expect(history.map((d) => d.version)).toEqual([4, 3, 2, 1]);
      expect(history.map((d) => d.content)).toEqual(['V4', 'V3', 'V2', 'V1']);
    });

    it('should not create version history for non-document elements', async () => {
      // Create a task and update it
      const { createTask } = await import('../types/task.js');
      const task = await createTask({
        title: 'Test Task',
        createdBy: mockEntityId,
      });
      const created = await api.create(toCreateInput(task));

      // Update the task
      await api.update(created.id, {
        title: 'Updated Task Title',
      });

      // Verify no document versions were created
      const rows = backend.query<{ count: number }>(
        'SELECT COUNT(*) as count FROM document_versions'
      );
      expect(rows[0].count).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // getDocumentVersion
  // --------------------------------------------------------------------------

  describe('getDocumentVersion', () => {
    it('should retrieve current version', async () => {
      const doc = await createTestDocument({ content: 'Initial' });
      const created = await api.create<Document>(toCreateInput(doc));
      await api.update<Document>(created.id, { content: 'Updated' });

      const currentVersion = await api.getDocumentVersion(
        created.id as unknown as DocumentId,
        2
      );

      expect(currentVersion).toBeDefined();
      expect(currentVersion?.version).toBe(2);
      expect(currentVersion?.content).toBe('Updated');
    });

    it('should retrieve historical version', async () => {
      const doc = await createTestDocument({ content: 'Original content' });
      const created = await api.create<Document>(toCreateInput(doc));
      await api.update<Document>(created.id, { content: 'New content' });

      const v1 = await api.getDocumentVersion(created.id as unknown as DocumentId, 1);

      expect(v1).toBeDefined();
      expect(v1?.version).toBe(1);
      expect(v1?.content).toBe('Original content');
    });

    it('should return null for non-existent version', async () => {
      const doc = await createTestDocument({ content: 'Content' });
      const created = await api.create<Document>(toCreateInput(doc));

      const nonExistent = await api.getDocumentVersion(
        created.id as unknown as DocumentId,
        99
      );

      expect(nonExistent).toBeNull();
    });

    it('should retrieve middle version in history', async () => {
      const doc = await createTestDocument({ content: 'V1' });
      const created = await api.create<Document>(toCreateInput(doc));
      await api.update<Document>(created.id, { content: 'V2' });
      await api.update<Document>(created.id, { content: 'V3' });
      await api.update<Document>(created.id, { content: 'V4' });

      const v2 = await api.getDocumentVersion(created.id as unknown as DocumentId, 2);

      expect(v2).toBeDefined();
      expect(v2?.version).toBe(2);
      expect(v2?.content).toBe('V2');
    });
  });

  // --------------------------------------------------------------------------
  // getDocumentHistory
  // --------------------------------------------------------------------------

  describe('getDocumentHistory', () => {
    it('should return history in descending version order', async () => {
      const doc = await createTestDocument({ content: 'First' });
      const created = await api.create<Document>(toCreateInput(doc));
      await api.update<Document>(created.id, { content: 'Second' });
      await api.update<Document>(created.id, { content: 'Third' });

      const history = await api.getDocumentHistory(created.id as unknown as DocumentId);

      expect(history.length).toBe(3);
      // Should be newest first
      expect(history[0].version).toBe(3);
      expect(history[1].version).toBe(2);
      expect(history[2].version).toBe(1);
    });

    it('should return single version for never-updated document', async () => {
      const doc = await createTestDocument({ content: 'Only version' });
      const created = await api.create<Document>(toCreateInput(doc));

      const history = await api.getDocumentHistory(created.id as unknown as DocumentId);

      expect(history.length).toBe(1);
      expect(history[0].version).toBe(1);
      expect(history[0].content).toBe('Only version');
    });

    it('should return empty array for non-existent document', async () => {
      const history = await api.getDocumentHistory('el-nonexistent' as DocumentId);

      expect(history).toEqual([]);
    });

    it('should preserve metadata across versions', async () => {
      const doc = await createTestDocument({
        content: '{"initial": true}',
        contentType: ContentType.JSON,
        tags: ['tag1'],
        metadata: { key: 'value' },
      });
      const created = await api.create<Document>(toCreateInput(doc));
      await api.update<Document>(created.id, {
        content: '{"updated": true}',
        tags: ['tag2'],
      });

      const history = await api.getDocumentHistory(created.id as unknown as DocumentId);

      // V1 should have original metadata
      const v1 = history.find((h) => h.version === 1);
      expect(v1?.contentType).toBe(ContentType.JSON);
      expect(v1?.tags).toContain('tag1');
      expect(v1?.metadata?.key).toBe('value');
    });
  });

  // --------------------------------------------------------------------------
  // Version Properties
  // --------------------------------------------------------------------------

  describe('Version Properties', () => {
    it('should start with version 1', async () => {
      const doc = await createTestDocument({ content: 'New doc' });
      const created = await api.create<Document>(toCreateInput(doc));

      expect(created.version).toBe(1);
      expect(created.previousVersionId).toBeNull();
    });

    it('should increment version on each update', async () => {
      const doc = await createTestDocument({ content: 'Start' });
      const created = await api.create<Document>(toCreateInput(doc));

      expect(created.version).toBe(1);

      const v2 = await api.update<Document>(created.id, { content: 'Update 1' });
      expect(v2.version).toBe(2);

      const v3 = await api.update<Document>(created.id, { content: 'Update 2' });
      expect(v3.version).toBe(3);

      const v4 = await api.update<Document>(created.id, { content: 'Update 3' });
      expect(v4.version).toBe(4);
    });

    it('should link previousVersionId correctly', async () => {
      const doc = await createTestDocument({ content: 'V1' });
      const created = await api.create<Document>(toCreateInput(doc));

      const v2 = await api.update<Document>(created.id, { content: 'V2' });

      // V2 should point back to the document's ID (which holds the previous version)
      expect(v2.previousVersionId).toBe(created.id);
    });

    it('should preserve contentType across versions', async () => {
      const doc = await createTestDocument({
        content: '{"key": "value"}',
        contentType: ContentType.JSON,
      });
      const created = await api.create<Document>(toCreateInput(doc));

      const updated = await api.update<Document>(created.id, {
        content: '{"key": "new value"}',
      });

      expect(updated.contentType).toBe(ContentType.JSON);

      const history = await api.getDocumentHistory(created.id as unknown as DocumentId);
      for (const version of history) {
        expect(version.contentType).toBe(ContentType.JSON);
      }
    });
  });

  // --------------------------------------------------------------------------
  // Edge Cases
  // --------------------------------------------------------------------------

  describe('Edge Cases', () => {
    it('should handle empty content', async () => {
      const doc = await createTestDocument({ content: '' });
      const created = await api.create<Document>(toCreateInput(doc));

      await api.update<Document>(created.id, { content: 'Now has content' });
      await api.update<Document>(created.id, { content: '' });

      const history = await api.getDocumentHistory(created.id as unknown as DocumentId);
      expect(history.length).toBe(3);
      expect(history[0].content).toBe('');
      expect(history[1].content).toBe('Now has content');
      expect(history[2].content).toBe('');
    });

    it('should handle large content', async () => {
      const largeContent = 'x'.repeat(10000);
      const doc = await createTestDocument({ content: largeContent });
      const created = await api.create<Document>(toCreateInput(doc));

      await api.update<Document>(created.id, { content: 'Small' });

      const v1 = await api.getDocumentVersion(created.id as unknown as DocumentId, 1);
      expect(v1?.content.length).toBe(10000);
    });

    it('should handle concurrent-like rapid updates', async () => {
      const doc = await createTestDocument({ content: 'Start' });
      const created = await api.create<Document>(toCreateInput(doc));

      // Rapid sequential updates (simulating fast updates)
      for (let i = 1; i <= 10; i++) {
        await api.update<Document>(created.id, { content: `Update ${i}` });
      }

      const history = await api.getDocumentHistory(created.id as unknown as DocumentId);
      expect(history.length).toBe(11); // 1 initial + 10 updates
      expect(history[0].version).toBe(11);
      expect(history[0].content).toBe('Update 10');
    });

    it('should handle multiple documents independently', async () => {
      const doc1 = await createTestDocument({ content: 'Doc1 V1' });
      const doc2 = await createTestDocument({ content: 'Doc2 V1' });

      const created1 = await api.create<Document>(toCreateInput(doc1));
      const created2 = await api.create<Document>(toCreateInput(doc2));

      await api.update<Document>(created1.id, { content: 'Doc1 V2' });
      await api.update<Document>(created2.id, { content: 'Doc2 V2' });
      await api.update<Document>(created2.id, { content: 'Doc2 V3' });

      const history1 = await api.getDocumentHistory(created1.id as unknown as DocumentId);
      const history2 = await api.getDocumentHistory(created2.id as unknown as DocumentId);

      expect(history1.length).toBe(2);
      expect(history2.length).toBe(3);
    });
  });
});

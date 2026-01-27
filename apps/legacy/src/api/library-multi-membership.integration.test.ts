/**
 * Library Multi-Membership Integration Tests
 *
 * Tests for Document multi-membership in Libraries:
 * - Documents belonging to multiple libraries simultaneously
 * - Removing from one library doesn't affect others
 * - Querying all parent libraries of a document
 * - Edge cases with overlapping library hierarchies
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { ElementalAPIImpl } from './elemental-api.js';
import { createStorage, initializeSchema } from '../storage/index.js';
import type { StorageBackend } from '../storage/backend.js';
import type { Element, EntityId } from '../types/element.js';
import type { Library } from '../types/library.js';
import type { Document } from '../types/document.js';
import { createDocument, ContentType } from '../types/document.js';
import { createLibrary } from '../types/library.js';

// ============================================================================
// Test Helpers
// ============================================================================

const mockEntityA = 'el-user1' as EntityId;

function toCreateInput<T extends Element>(element: T): Parameters<ElementalAPIImpl['create']>[0] {
  return element as unknown as Parameters<ElementalAPIImpl['create']>[0];
}

async function createTestDocument(
  createdBy: EntityId = mockEntityA,
  content: string = 'Test document content'
): Promise<Document> {
  return createDocument({
    content,
    contentType: ContentType.MARKDOWN,
    createdBy,
  });
}

async function createTestLibrary(
  overrides: Partial<Parameters<typeof createLibrary>[0]> = {}
): Promise<Library> {
  return createLibrary({
    name: 'test-library',
    createdBy: mockEntityA,
    ...overrides,
  });
}

// ============================================================================
// Tests
// ============================================================================

describe('Library Multi-Membership', () => {
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
  // Core Multi-Membership Tests
  // --------------------------------------------------------------------------

  describe('Document in Multiple Libraries', () => {
    it('should allow a document to belong to multiple libraries', async () => {
      // Create multiple libraries
      const lib1 = await createTestLibrary({ name: 'API Documentation' });
      const lib2 = await createTestLibrary({ name: 'Security Guide' });
      const lib3 = await createTestLibrary({ name: 'Best Practices' });

      const createdLib1 = await api.create<Library>(toCreateInput(lib1));
      const createdLib2 = await api.create<Library>(toCreateInput(lib2));
      const createdLib3 = await api.create<Library>(toCreateInput(lib3));

      // Create a shared document
      const doc = await createTestDocument(mockEntityA, 'API Security Best Practices');
      const createdDoc = await api.create<Document>(toCreateInput(doc));

      // Add document to all three libraries
      await api.addDependency({
        sourceId: createdDoc.id,
        targetId: createdLib1.id,
        type: 'parent-child',
        actor: mockEntityA,
      });
      await api.addDependency({
        sourceId: createdDoc.id,
        targetId: createdLib2.id,
        type: 'parent-child',
        actor: mockEntityA,
      });
      await api.addDependency({
        sourceId: createdDoc.id,
        targetId: createdLib3.id,
        type: 'parent-child',
        actor: mockEntityA,
      });

      // Verify document has three parent-child dependencies
      const docDeps = await api.getDependencies(createdDoc.id, ['parent-child']);
      expect(docDeps.length).toBe(3);

      const targetIds = docDeps.map((d) => d.targetId);
      expect(targetIds).toContain(createdLib1.id);
      expect(targetIds).toContain(createdLib2.id);
      expect(targetIds).toContain(createdLib3.id);
    });

    it('should remove document from one library without affecting others', async () => {
      // Create two libraries
      const lib1 = await createTestLibrary({ name: 'Library A' });
      const lib2 = await createTestLibrary({ name: 'Library B' });

      const createdLib1 = await api.create<Library>(toCreateInput(lib1));
      const createdLib2 = await api.create<Library>(toCreateInput(lib2));

      // Create document and add to both libraries
      const doc = await createTestDocument(mockEntityA, 'Shared doc');
      const createdDoc = await api.create<Document>(toCreateInput(doc));

      await api.addDependency({
        sourceId: createdDoc.id,
        targetId: createdLib1.id,
        type: 'parent-child',
        actor: mockEntityA,
      });
      await api.addDependency({
        sourceId: createdDoc.id,
        targetId: createdLib2.id,
        type: 'parent-child',
        actor: mockEntityA,
      });

      // Verify document is in both
      let docDeps = await api.getDependencies(createdDoc.id, ['parent-child']);
      expect(docDeps.length).toBe(2);

      // Remove from library A
      await api.removeDependency(createdDoc.id, createdLib1.id, 'parent-child');

      // Verify document is still in library B
      docDeps = await api.getDependencies(createdDoc.id, ['parent-child']);
      expect(docDeps.length).toBe(1);
      expect(docDeps[0].targetId).toBe(createdLib2.id);

      // Verify library A has no documents
      const lib1Dependents = await api.getDependents(createdLib1.id, ['parent-child']);
      expect(lib1Dependents.length).toBe(0);

      // Verify library B still has the document
      const lib2Dependents = await api.getDependents(createdLib2.id, ['parent-child']);
      expect(lib2Dependents.length).toBe(1);
      expect(lib2Dependents[0].sourceId).toBe(createdDoc.id);
    });

    it('should correctly list all parent libraries of a document', async () => {
      // Create libraries
      const apiDocs = await createTestLibrary({ name: 'API Docs' });
      const frontendDocs = await createTestLibrary({ name: 'Frontend Docs' });
      const backendDocs = await createTestLibrary({ name: 'Backend Docs' });

      const createdApiDocs = await api.create<Library>(toCreateInput(apiDocs));
      const createdFrontendDocs = await api.create<Library>(toCreateInput(frontendDocs));
      const createdBackendDocs = await api.create<Library>(toCreateInput(backendDocs));

      // Create document and add to two of three libraries
      const doc = await createTestDocument(mockEntityA, 'REST API Guide');
      const createdDoc = await api.create<Document>(toCreateInput(doc));

      await api.addDependency({
        sourceId: createdDoc.id,
        targetId: createdApiDocs.id,
        type: 'parent-child',
        actor: mockEntityA,
      });
      await api.addDependency({
        sourceId: createdDoc.id,
        targetId: createdBackendDocs.id,
        type: 'parent-child',
        actor: mockEntityA,
      });

      // Query document's parent libraries
      const parentDeps = await api.getDependencies(createdDoc.id, ['parent-child']);
      const parentLibraryIds = parentDeps.map((d) => d.targetId);

      expect(parentLibraryIds.length).toBe(2);
      expect(parentLibraryIds).toContain(createdApiDocs.id);
      expect(parentLibraryIds).toContain(createdBackendDocs.id);
      expect(parentLibraryIds).not.toContain(createdFrontendDocs.id);
    });

    it('should allow the same document to be added and removed repeatedly', async () => {
      const lib = await createTestLibrary({ name: 'Docs' });
      const createdLib = await api.create<Library>(toCreateInput(lib));

      const doc = await createTestDocument(mockEntityA, 'Test doc');
      const createdDoc = await api.create<Document>(toCreateInput(doc));

      // Add, remove, add again
      await api.addDependency({
        sourceId: createdDoc.id,
        targetId: createdLib.id,
        type: 'parent-child',
        actor: mockEntityA,
      });

      let deps = await api.getDependencies(createdDoc.id, ['parent-child']);
      expect(deps.length).toBe(1);

      await api.removeDependency(createdDoc.id, createdLib.id, 'parent-child');

      deps = await api.getDependencies(createdDoc.id, ['parent-child']);
      expect(deps.length).toBe(0);

      // Add again
      await api.addDependency({
        sourceId: createdDoc.id,
        targetId: createdLib.id,
        type: 'parent-child',
        actor: mockEntityA,
      });

      deps = await api.getDependencies(createdDoc.id, ['parent-child']);
      expect(deps.length).toBe(1);
    });
  });

  // --------------------------------------------------------------------------
  // Library Content Listing Tests
  // --------------------------------------------------------------------------

  describe('Library Content Queries', () => {
    it('should list all documents in a library including shared ones', async () => {
      // Create two libraries
      const lib1 = await createTestLibrary({ name: 'Primary Lib' });
      const lib2 = await createTestLibrary({ name: 'Secondary Lib' });

      const createdLib1 = await api.create<Library>(toCreateInput(lib1));
      const createdLib2 = await api.create<Library>(toCreateInput(lib2));

      // Create documents: doc1 in lib1 only, doc2 in both, doc3 in lib2 only
      const doc1 = await createTestDocument(mockEntityA, 'Doc 1 - Exclusive to lib1');
      const doc2 = await createTestDocument(mockEntityA, 'Doc 2 - Shared');
      const doc3 = await createTestDocument(mockEntityA, 'Doc 3 - Exclusive to lib2');

      const createdDoc1 = await api.create<Document>(toCreateInput(doc1));
      const createdDoc2 = await api.create<Document>(toCreateInput(doc2));
      const createdDoc3 = await api.create<Document>(toCreateInput(doc3));

      // Add to libraries
      await api.addDependency({ sourceId: createdDoc1.id, targetId: createdLib1.id, type: 'parent-child', actor: mockEntityA });
      await api.addDependency({ sourceId: createdDoc2.id, targetId: createdLib1.id, type: 'parent-child', actor: mockEntityA });
      await api.addDependency({ sourceId: createdDoc2.id, targetId: createdLib2.id, type: 'parent-child', actor: mockEntityA });
      await api.addDependency({ sourceId: createdDoc3.id, targetId: createdLib2.id, type: 'parent-child', actor: mockEntityA });

      // Query lib1 documents
      const lib1Children = await api.getDependents(createdLib1.id, ['parent-child']);
      const lib1DocIds = lib1Children.map((d) => d.sourceId);

      expect(lib1DocIds.length).toBe(2);
      expect(lib1DocIds).toContain(createdDoc1.id);
      expect(lib1DocIds).toContain(createdDoc2.id);

      // Query lib2 documents
      const lib2Children = await api.getDependents(createdLib2.id, ['parent-child']);
      const lib2DocIds = lib2Children.map((d) => d.sourceId);

      expect(lib2DocIds.length).toBe(2);
      expect(lib2DocIds).toContain(createdDoc2.id);
      expect(lib2DocIds).toContain(createdDoc3.id);
    });

    it('should correctly count documents when shared across libraries', async () => {
      // Create 3 libraries
      const libs = await Promise.all([
        createTestLibrary({ name: 'Lib A' }),
        createTestLibrary({ name: 'Lib B' }),
        createTestLibrary({ name: 'Lib C' }),
      ]);

      const createdLibs = await Promise.all(
        libs.map((lib) => api.create<Library>(toCreateInput(lib)))
      );

      // Create 1 document and add to all 3 libraries
      const doc = await createTestDocument(mockEntityA, 'Shared everywhere');
      const createdDoc = await api.create<Document>(toCreateInput(doc));

      for (const lib of createdLibs) {
        await api.addDependency({
          sourceId: createdDoc.id,
          targetId: lib.id,
          type: 'parent-child',
          actor: mockEntityA,
        });
      }

      // Each library should report exactly 1 document
      for (const lib of createdLibs) {
        const children = await api.getDependents(lib.id, ['parent-child']);
        expect(children.length).toBe(1);
      }

      // But the document should have 3 parent relationships
      const parentDeps = await api.getDependencies(createdDoc.id, ['parent-child']);
      expect(parentDeps.length).toBe(3);
    });
  });

  // --------------------------------------------------------------------------
  // Multi-Membership with Hierarchy Tests
  // --------------------------------------------------------------------------

  describe('Multi-Membership with Library Hierarchy', () => {
    it('should support document in both parent and nested libraries', async () => {
      // Create parent library
      const parentLib = await createTestLibrary({ name: 'Parent Library' });
      const createdParentLib = await api.create<Library>(toCreateInput(parentLib));

      // Create child library
      const childLib = await createTestLibrary({ name: 'Child Library' });
      const createdChildLib = await api.create<Library>(toCreateInput(childLib));

      // Nest child under parent
      await api.addDependency({
        sourceId: createdChildLib.id,
        targetId: createdParentLib.id,
        type: 'parent-child',
        actor: mockEntityA,
      });

      // Create document and add to BOTH parent and child library
      const doc = await createTestDocument(mockEntityA, 'Featured document');
      const createdDoc = await api.create<Document>(toCreateInput(doc));

      await api.addDependency({
        sourceId: createdDoc.id,
        targetId: createdParentLib.id,
        type: 'parent-child',
        actor: mockEntityA,
      });
      await api.addDependency({
        sourceId: createdDoc.id,
        targetId: createdChildLib.id,
        type: 'parent-child',
        actor: mockEntityA,
      });

      // Document should have 2 library memberships
      const docParents = await api.getDependencies(createdDoc.id, ['parent-child']);
      expect(docParents.length).toBe(2);

      // Parent library should have child library + document (2 children)
      const parentChildren = await api.getDependents(createdParentLib.id, ['parent-child']);
      expect(parentChildren.length).toBe(2);
      expect(parentChildren.map((d) => d.sourceId)).toContain(createdChildLib.id);
      expect(parentChildren.map((d) => d.sourceId)).toContain(createdDoc.id);

      // Child library should have just the document
      const childChildren = await api.getDependents(createdChildLib.id, ['parent-child']);
      expect(childChildren.length).toBe(1);
      expect(childChildren[0].sourceId).toBe(createdDoc.id);
    });

    it('should handle document in multiple sibling libraries under same parent', async () => {
      // Create parent library
      const parentLib = await createTestLibrary({ name: 'Parent' });
      const createdParentLib = await api.create<Library>(toCreateInput(parentLib));

      // Create two sibling libraries
      const siblingA = await createTestLibrary({ name: 'Sibling A' });
      const siblingB = await createTestLibrary({ name: 'Sibling B' });
      const createdSiblingA = await api.create<Library>(toCreateInput(siblingA));
      const createdSiblingB = await api.create<Library>(toCreateInput(siblingB));

      // Nest siblings under parent
      await api.addDependency({ sourceId: createdSiblingA.id, targetId: createdParentLib.id, type: 'parent-child', actor: mockEntityA });
      await api.addDependency({ sourceId: createdSiblingB.id, targetId: createdParentLib.id, type: 'parent-child', actor: mockEntityA });

      // Create document in both sibling libraries
      const doc = await createTestDocument(mockEntityA, 'Shared across siblings');
      const createdDoc = await api.create<Document>(toCreateInput(doc));

      await api.addDependency({ sourceId: createdDoc.id, targetId: createdSiblingA.id, type: 'parent-child', actor: mockEntityA });
      await api.addDependency({ sourceId: createdDoc.id, targetId: createdSiblingB.id, type: 'parent-child', actor: mockEntityA });

      // Document should be in both siblings
      const docParents = await api.getDependencies(createdDoc.id, ['parent-child']);
      expect(docParents.length).toBe(2);
      expect(docParents.map((d) => d.targetId)).toContain(createdSiblingA.id);
      expect(docParents.map((d) => d.targetId)).toContain(createdSiblingB.id);

      // Both siblings should contain the document
      const siblingAChildren = await api.getDependents(createdSiblingA.id, ['parent-child']);
      const siblingBChildren = await api.getDependents(createdSiblingB.id, ['parent-child']);

      expect(siblingAChildren.map((d) => d.sourceId)).toContain(createdDoc.id);
      expect(siblingBChildren.map((d) => d.sourceId)).toContain(createdDoc.id);
    });
  });

  // --------------------------------------------------------------------------
  // Edge Cases
  // --------------------------------------------------------------------------

  describe('Edge Cases', () => {
    it('should handle removing document from last library', async () => {
      const lib = await createTestLibrary({ name: 'Only Library' });
      const createdLib = await api.create<Library>(toCreateInput(lib));

      const doc = await createTestDocument(mockEntityA, 'Orphan document');
      const createdDoc = await api.create<Document>(toCreateInput(doc));

      await api.addDependency({
        sourceId: createdDoc.id,
        targetId: createdLib.id,
        type: 'parent-child',
        actor: mockEntityA,
      });

      // Remove from only library
      await api.removeDependency(createdDoc.id, createdLib.id, 'parent-child');

      // Document should still exist but have no library membership
      const retrievedDoc = await api.get<Document>(createdDoc.id);
      expect(retrievedDoc).toBeDefined();
      expect(retrievedDoc?.type).toBe('document');

      const docParents = await api.getDependencies(createdDoc.id, ['parent-child']);
      expect(docParents.length).toBe(0);
    });

    it('should prevent duplicate membership in same library', async () => {
      const lib = await createTestLibrary({ name: 'Test Library' });
      const createdLib = await api.create<Library>(toCreateInput(lib));

      const doc = await createTestDocument(mockEntityA, 'Test doc');
      const createdDoc = await api.create<Document>(toCreateInput(doc));

      // Add document to library
      await api.addDependency({
        sourceId: createdDoc.id,
        targetId: createdLib.id,
        type: 'parent-child',
        actor: mockEntityA,
      });

      // Try to add again - should throw error
      await expect(
        api.addDependency({
          sourceId: createdDoc.id,
          targetId: createdLib.id,
          type: 'parent-child',
          actor: mockEntityA,
        })
      ).rejects.toThrow('Dependency already exists');

      // Should still only have one dependency
      const deps = await api.getDependencies(createdDoc.id, ['parent-child']);
      expect(deps.length).toBe(1);
    });

    it('should handle many libraries with same document', async () => {
      const libraryCount = 10;
      const createdLibraries: Library[] = [];

      for (let i = 0; i < libraryCount; i++) {
        const lib = await createTestLibrary({ name: `Library ${i}` });
        const created = await api.create<Library>(toCreateInput(lib));
        createdLibraries.push(created);
      }

      const doc = await createTestDocument(mockEntityA, 'Mega-shared document');
      const createdDoc = await api.create<Document>(toCreateInput(doc));

      // Add to all libraries
      for (const lib of createdLibraries) {
        await api.addDependency({
          sourceId: createdDoc.id,
          targetId: lib.id,
          type: 'parent-child',
          actor: mockEntityA,
        });
      }

      // Verify all memberships
      const docParents = await api.getDependencies(createdDoc.id, ['parent-child']);
      expect(docParents.length).toBe(libraryCount);

      // Each library should have the document
      for (const lib of createdLibraries) {
        const children = await api.getDependents(lib.id, ['parent-child']);
        expect(children.length).toBe(1);
        expect(children[0].sourceId).toBe(createdDoc.id);
      }
    });

    it('should handle mixed document types in library correctly', async () => {
      const lib = await createTestLibrary({ name: 'Mixed Library' });
      const createdLib = await api.create<Library>(toCreateInput(lib));

      // Add multiple documents of different content types
      const markdownDoc = await createDocument({
        content: '# Markdown',
        contentType: ContentType.MARKDOWN,
        createdBy: mockEntityA,
      });
      const textDoc = await createDocument({
        content: 'Plain text',
        contentType: ContentType.TEXT,
        createdBy: mockEntityA,
      });
      const jsonDoc = await createDocument({
        content: '{"key": "value"}',
        contentType: ContentType.JSON,
        createdBy: mockEntityA,
      });

      const createdMd = await api.create<Document>(toCreateInput(markdownDoc));
      const createdText = await api.create<Document>(toCreateInput(textDoc));
      const createdJson = await api.create<Document>(toCreateInput(jsonDoc));

      await api.addDependency({ sourceId: createdMd.id, targetId: createdLib.id, type: 'parent-child', actor: mockEntityA });
      await api.addDependency({ sourceId: createdText.id, targetId: createdLib.id, type: 'parent-child', actor: mockEntityA });
      await api.addDependency({ sourceId: createdJson.id, targetId: createdLib.id, type: 'parent-child', actor: mockEntityA });

      // Library should have all three
      const children = await api.getDependents(createdLib.id, ['parent-child']);
      expect(children.length).toBe(3);

      // Fetch and verify types
      const childDocs: Document[] = [];
      for (const child of children) {
        const doc = await api.get<Document>(child.sourceId);
        if (doc) childDocs.push(doc);
      }

      expect(childDocs.length).toBe(3);
      const contentTypes = childDocs.map((d) => d.contentType);
      expect(contentTypes).toContain(ContentType.MARKDOWN);
      expect(contentTypes).toContain(ContentType.TEXT);
      expect(contentTypes).toContain(ContentType.JSON);
    });
  });

  // --------------------------------------------------------------------------
  // Event Tracking Tests
  // --------------------------------------------------------------------------

  describe('Multi-Membership Events', () => {
    it('should record events for each library membership', async () => {
      const lib1 = await createTestLibrary({ name: 'Events Lib 1' });
      const lib2 = await createTestLibrary({ name: 'Events Lib 2' });

      const createdLib1 = await api.create<Library>(toCreateInput(lib1));
      const createdLib2 = await api.create<Library>(toCreateInput(lib2));

      const doc = await createTestDocument(mockEntityA, 'Event tracked doc');
      const createdDoc = await api.create<Document>(toCreateInput(doc));

      // Add to both libraries
      await api.addDependency({
        sourceId: createdDoc.id,
        targetId: createdLib1.id,
        type: 'parent-child',
        actor: mockEntityA,
      });
      await api.addDependency({
        sourceId: createdDoc.id,
        targetId: createdLib2.id,
        type: 'parent-child',
        actor: mockEntityA,
      });

      // Check events for the document
      const docEvents = await api.getEvents(createdDoc.id);
      const depAddedEvents = docEvents.filter((e) => e.eventType === 'dependency_added');

      // Should have events for both library additions
      expect(depAddedEvents.length).toBe(2);
    });
  });
});

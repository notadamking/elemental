/**
 * Elemental API CRUD Operations Tests
 *
 * Comprehensive tests for the ElementalAPI implementation covering:
 * - CRUD operations (create, get, list, update, delete)
 * - Task-specific queries (ready, blocked)
 * - Dependency management
 * - Search functionality
 * - Event tracking
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { ElementalAPIImpl, createElementalAPI } from './elemental-api.js';
import { BunStorageBackend } from '../storage/bun-backend.js';
import { initializeSchema } from '../storage/schema.js';
import type { StorageBackend } from '../storage/backend.js';
import type { Element, ElementId, EntityId, Timestamp } from '../types/element.js';
import type { Task, HydratedTask } from '../types/task.js';
import type { Document, DocumentId } from '../types/document.js';
import { createTask, Priority } from '../types/task.js';
import { createDocument, ContentType } from '../types/document.js';
import { NotFoundError, ConstraintError, ConflictError } from '../errors/error.js';

// ============================================================================
// Test Helpers
// ============================================================================

const mockEntityId = 'user:test-user' as EntityId;

/**
 * Helper to cast element for api.create()
 * The API expects Record<string, unknown> but our typed elements are compatible
 */
function toCreateInput<T extends Element>(element: T): Parameters<ElementalAPIImpl['create']>[0] {
  return element as unknown as Parameters<ElementalAPIImpl['create']>[0];
}

/**
 * Create a test task element
 */
async function createTestTask(overrides: Partial<Parameters<typeof createTask>[0]> = {}): Promise<Task> {
  return createTask({
    title: 'Test Task',
    createdBy: mockEntityId,
    ...overrides,
  });
}

/**
 * Create a test document element
 */
async function createTestDocument(overrides: Partial<Parameters<typeof createDocument>[0]> = {}): Promise<Document> {
  return createDocument({
    contentType: ContentType.MARKDOWN,
    content: '# Test Document\n\nThis is a test.',
    createdBy: mockEntityId,
    ...overrides,
  });
}

// ============================================================================
// Integration Tests
// ============================================================================

describe('ElementalAPI', () => {
  let backend: StorageBackend;
  let api: ElementalAPIImpl;

  beforeEach(() => {
    backend = new BunStorageBackend({ path: ':memory:' });
    initializeSchema(backend);
    api = new ElementalAPIImpl(backend);
  });

  afterEach(() => {
    if (backend.isOpen) {
      backend.close();
    }
  });

  // --------------------------------------------------------------------------
  // Factory Function Tests
  // --------------------------------------------------------------------------

  describe('createElementalAPI', () => {
    it('should create an API instance', () => {
      const instance = createElementalAPI(backend);
      expect(instance).toBeInstanceOf(ElementalAPIImpl);
    });
  });

  // --------------------------------------------------------------------------
  // Create Operation Tests
  // --------------------------------------------------------------------------

  describe('create()', () => {
    it('should create a task element', async () => {
      const task = await createTestTask();
      const created = await api.create(toCreateInput(task));

      expect(created.id).toBe(task.id);
      expect(created.type).toBe('task');
      expect(created.createdBy).toBe(mockEntityId);
    });

    it('should create a document element', async () => {
      const doc = await createTestDocument();
      const created = await api.create(toCreateInput(doc));

      expect(created.id).toBe(doc.id);
      expect(created.type).toBe('document');
    });

    it('should persist tags', async () => {
      const task = await createTestTask({ tags: ['urgent', 'frontend'] });
      await api.create(toCreateInput(task));

      const retrieved = await api.get<Task>(task.id);
      expect(retrieved?.tags).toEqual(['urgent', 'frontend']);
    });

    it('should record a creation event', async () => {
      const task = await createTestTask();
      await api.create(toCreateInput(task));

      const events = await api.getEvents(task.id);
      expect(events.length).toBe(1);
      expect(events[0].eventType).toBe('created');
      expect(events[0].elementId).toBe(task.id);
    });

    it('should mark element as dirty for sync', async () => {
      const task = await createTestTask();
      await api.create(toCreateInput(task));

      const dirtyElements = backend.getDirtyElements();
      const dirtyIds = dirtyElements.map(d => String(d.elementId));
      expect(dirtyIds).toContain(task.id);
    });
  });

  // --------------------------------------------------------------------------
  // Get Operation Tests
  // --------------------------------------------------------------------------

  describe('get()', () => {
    it('should retrieve an existing element', async () => {
      const task = await createTestTask();
      await api.create(toCreateInput(task));

      const retrieved = await api.get<Task>(task.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe(task.id);
      expect(retrieved?.type).toBe('task');
    });

    it('should return null for non-existent element', async () => {
      const result = await api.get('el-nonexistent' as ElementId);
      expect(result).toBeNull();
    });

    it('should retrieve element with all fields intact', async () => {
      const task = await createTestTask({
        title: 'Specific Title',
        tags: ['test'],
        priority: Priority.HIGH,
      });
      await api.create(toCreateInput(task));

      const retrieved = await api.get<Task>(task.id);
      expect(retrieved?.title).toBe('Specific Title');
      expect(retrieved?.tags).toEqual(['test']);
      expect(retrieved?.priority).toBe(Priority.HIGH);
    });

    it('should hydrate task with description when requested', async () => {
      // Create a description document
      const descDoc = await createTestDocument({
        content: 'Detailed task description',
      });
      await api.create(toCreateInput(descDoc));

      // Create a task with description ref
      const task = await createTestTask({
        descriptionRef: descDoc.id as DocumentId,
      });
      await api.create(toCreateInput(task));

      // Get with hydration
      const hydrated = await api.get<HydratedTask>(task.id, {
        hydrate: { description: true },
      });
      expect(hydrated?.description).toBe('Detailed task description');
    });
  });

  // --------------------------------------------------------------------------
  // List Operation Tests
  // --------------------------------------------------------------------------

  describe('list()', () => {
    beforeEach(async () => {
      // Create test data
      const task1 = await createTestTask({ title: 'Task 1', tags: ['urgent'] });
      const task2 = await createTestTask({ title: 'Task 2', tags: ['later'] });
      const task3 = await createTestTask({ title: 'Task 3', tags: ['urgent', 'important'] });
      const doc = await createTestDocument({ content: 'Document 1' });

      await api.create(toCreateInput(task1));
      await api.create(toCreateInput(task2));
      await api.create(toCreateInput(task3));
      await api.create(toCreateInput(doc));
    });

    it('should list all elements without filter', async () => {
      const elements = await api.list();
      expect(elements.length).toBe(4);
    });

    it('should filter by type', async () => {
      const tasks = await api.list<Task>({ type: 'task' });
      expect(tasks.length).toBe(3);
      tasks.forEach((t) => expect(t.type).toBe('task'));
    });

    it('should filter by multiple types', async () => {
      const elements = await api.list({ type: ['task', 'document'] });
      expect(elements.length).toBe(4);
    });

    it('should filter by tag', async () => {
      const urgentTasks = await api.list<Task>({ tags: ['urgent'] });
      expect(urgentTasks.length).toBe(2);
    });

    it('should paginate results', async () => {
      const page1 = await api.listPaginated({ limit: 2, offset: 0 });
      expect(page1.items.length).toBe(2);
      expect(page1.total).toBe(4);
      expect(page1.hasMore).toBe(true);

      const page2 = await api.listPaginated({ limit: 2, offset: 2 });
      expect(page2.items.length).toBe(2);
      expect(page2.hasMore).toBe(false);
    });

    it('should order results', async () => {
      const ascending = await api.list({ orderBy: 'created_at', orderDir: 'asc' });
      const descending = await api.list({ orderBy: 'created_at', orderDir: 'desc' });

      // Both should have the same elements
      expect(ascending.length).toBe(descending.length);
      expect(ascending.length).toBe(4);

      // Both orderings contain the same set of IDs
      const ascIds = new Set(ascending.map((e) => e.id));
      const descIds = new Set(descending.map((e) => e.id));
      expect(ascIds).toEqual(descIds);
    });
  });

  // --------------------------------------------------------------------------
  // Update Operation Tests
  // --------------------------------------------------------------------------

  describe('update()', () => {
    it('should update an element', async () => {
      const task = await createTestTask({ title: 'Original Title' });
      await api.create(toCreateInput(task));

      const updated = await api.update<Task>(task.id, { title: 'Updated Title' } as Partial<Task>);
      expect(updated.title).toBe('Updated Title');
    });

    it('should update updatedAt timestamp', async () => {
      const task = await createTestTask();
      await api.create(toCreateInput(task));
      const originalUpdatedAt = task.updatedAt;

      // Small delay to ensure different timestamp
      await new Promise((resolve) => setTimeout(resolve, 10));

      const updated = await api.update<Task>(task.id, { title: 'New Title' } as Partial<Task>);
      expect(updated.updatedAt).not.toBe(originalUpdatedAt);
    });

    it('should not change immutable fields', async () => {
      const task = await createTestTask();
      await api.create(toCreateInput(task));
      const originalId = task.id;
      const originalCreatedAt = task.createdAt;
      const originalCreatedBy = task.createdBy;

      const updated = await api.update<Task>(task.id, {
        id: 'el-new-id' as ElementId,
        createdAt: '2020-01-01T00:00:00.000Z' as Timestamp,
        createdBy: 'user:hacker' as EntityId,
      } as Partial<Task>);

      expect(updated.id).toBe(originalId);
      expect(updated.createdAt).toBe(originalCreatedAt);
      expect(updated.createdBy).toBe(originalCreatedBy);
    });

    it('should throw NotFoundError for non-existent element', async () => {
      await expect(
        api.update('el-nonexistent' as ElementId, { title: 'Test' } as Partial<Task>)
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw ConstraintError when updating messages', async () => {
      // Create a mock message element directly in DB
      const now = new Date().toISOString();
      backend.run(
        `INSERT INTO elements (id, type, data, created_at, updated_at, created_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          'el-msg-1',
          'message',
          JSON.stringify({ channelId: 'ch-1', sender: mockEntityId }),
          now,
          now,
          mockEntityId,
        ]
      );

      await expect(
        api.update('el-msg-1' as ElementId, { title: 'Test' } as Partial<Task>)
      ).rejects.toThrow(ConstraintError);
    });

    it('should record an update event', async () => {
      const task = await createTestTask();
      await api.create(toCreateInput(task));

      await api.update<Task>(task.id, { title: 'New Title' } as Partial<Task>);

      const events = await api.getEvents(task.id);
      const updateEvents = events.filter((e) => e.eventType === 'updated');
      expect(updateEvents.length).toBe(1);
    });

    it('should update tags correctly', async () => {
      const task = await createTestTask({ tags: ['old-tag'] });
      await api.create(toCreateInput(task));

      await api.update<Task>(task.id, { tags: ['new-tag-1', 'new-tag-2'] } as Partial<Task>);

      const retrieved = await api.get<Task>(task.id);
      expect(retrieved?.tags).toEqual(['new-tag-1', 'new-tag-2']);
    });
  });

  // --------------------------------------------------------------------------
  // Delete Operation Tests
  // --------------------------------------------------------------------------

  describe('delete()', () => {
    it('should soft-delete an element', async () => {
      const task = await createTestTask();
      await api.create(toCreateInput(task));

      await api.delete(task.id);

      // Should not appear in default list
      const elements = await api.list();
      expect(elements.find((e) => e.id === task.id)).toBeUndefined();

      // Should appear with includeDeleted
      const allElements = await api.list({ includeDeleted: true });
      expect(allElements.find((e) => e.id === task.id)).toBeDefined();
    });

    it('should throw NotFoundError for non-existent element', async () => {
      await expect(
        api.delete('el-nonexistent' as ElementId)
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw ConstraintError when deleting messages', async () => {
      // Create a mock message element directly in DB
      const now = new Date().toISOString();
      backend.run(
        `INSERT INTO elements (id, type, data, created_at, updated_at, created_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          'el-msg-2',
          'message',
          JSON.stringify({ channelId: 'ch-1', sender: mockEntityId }),
          now,
          now,
          mockEntityId,
        ]
      );

      await expect(api.delete('el-msg-2' as ElementId)).rejects.toThrow(ConstraintError);
    });

    it('should record a delete event', async () => {
      const task = await createTestTask();
      await api.create(toCreateInput(task));

      await api.delete(task.id, { reason: 'No longer needed' });

      const events = await api.getEvents(task.id);
      const deleteEvents = events.filter((e) => e.eventType === 'deleted');
      expect(deleteEvents.length).toBe(1);
    });
  });

  // --------------------------------------------------------------------------
  // Task Query Tests
  // --------------------------------------------------------------------------

  describe('ready()', () => {
    it('should return tasks that are not blocked', async () => {
      const task1 = await createTestTask({ title: 'Ready Task' });
      const task2 = await createTestTask({ title: 'Blocked Task' });
      await api.create(toCreateInput(task1));
      await api.create(toCreateInput(task2));

      // Block task2
      const blocker = await createTestTask({ title: 'Blocker' });
      await api.create(toCreateInput(blocker));
      await api.addDependency({
        sourceId: task2.id,
        targetId: blocker.id,
        type: 'blocks',
      });

      const readyTasks = await api.ready();
      expect(readyTasks.map((t) => t.id)).toContain(task1.id);
      expect(readyTasks.map((t) => t.id)).not.toContain(task2.id);
    });

    it('should filter out scheduled-for-future tasks', async () => {
      const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const futureTask = await createTestTask({
        title: 'Future Task',
        scheduledFor: futureDate,
      });
      const nowTask = await createTestTask({ title: 'Now Task' });

      await api.create(toCreateInput(futureTask));
      await api.create(toCreateInput(nowTask));

      const readyTasks = await api.ready();
      expect(readyTasks.map((t) => t.id)).toContain(nowTask.id);
      expect(readyTasks.map((t) => t.id)).not.toContain(futureTask.id);
    });
  });

  describe('blocked()', () => {
    it('should return blocked tasks with blocking info', async () => {
      const task = await createTestTask({ title: 'Blocked Task' });
      const blocker = await createTestTask({ title: 'Blocker' });

      await api.create(toCreateInput(task));
      await api.create(toCreateInput(blocker));
      await api.addDependency({
        sourceId: task.id,
        targetId: blocker.id,
        type: 'blocks',
      });

      const blockedTasks = await api.blocked();
      expect(blockedTasks.length).toBe(1);
      expect(blockedTasks[0].id).toBe(task.id);
      expect(blockedTasks[0].blockedBy).toBe(blocker.id);
    });
  });

  // --------------------------------------------------------------------------
  // Dependency Tests
  // --------------------------------------------------------------------------

  describe('Dependency Operations', () => {
    let task1: Task;
    let task2: Task;

    beforeEach(async () => {
      task1 = await createTestTask({ title: 'Task 1' });
      task2 = await createTestTask({ title: 'Task 2' });
      await api.create(toCreateInput(task1));
      await api.create(toCreateInput(task2));
    });

    describe('addDependency()', () => {
      it('should add a dependency between elements', async () => {
        const dep = await api.addDependency({
          sourceId: task1.id,
          targetId: task2.id,
          type: 'blocks',
        });

        expect(dep.sourceId).toBe(task1.id);
        expect(dep.targetId).toBe(task2.id);
        expect(dep.type).toBe('blocks');
      });

      it('should throw NotFoundError for non-existent source', async () => {
        await expect(
          api.addDependency({
            sourceId: 'el-nonexistent' as ElementId,
            targetId: task2.id,
            type: 'blocks',
          })
        ).rejects.toThrow(NotFoundError);
      });

      it('should throw ConflictError for duplicate dependency', async () => {
        await api.addDependency({
          sourceId: task1.id,
          targetId: task2.id,
          type: 'blocks',
        });

        await expect(
          api.addDependency({
            sourceId: task1.id,
            targetId: task2.id,
            type: 'blocks',
          })
        ).rejects.toThrow(ConflictError);
      });

      it('should update blocked cache for blocking dependencies', async () => {
        await api.addDependency({
          sourceId: task1.id,
          targetId: task2.id,
          type: 'blocks',
        });

        const blockedTasks = await api.blocked();
        expect(blockedTasks.find((t) => t.id === task1.id)).toBeDefined();
      });
    });

    describe('removeDependency()', () => {
      it('should remove an existing dependency', async () => {
        await api.addDependency({
          sourceId: task1.id,
          targetId: task2.id,
          type: 'blocks',
        });

        await api.removeDependency(task1.id, task2.id, 'blocks');

        const deps = await api.getDependencies(task1.id);
        expect(deps.length).toBe(0);
      });

      it('should throw NotFoundError for non-existent dependency', async () => {
        await expect(
          api.removeDependency(task1.id, task2.id, 'blocks')
        ).rejects.toThrow(NotFoundError);
      });

      it('should update blocked cache when dependency removed', async () => {
        await api.addDependency({
          sourceId: task1.id,
          targetId: task2.id,
          type: 'blocks',
        });

        await api.removeDependency(task1.id, task2.id, 'blocks');

        const blockedTasks = await api.blocked();
        expect(blockedTasks.find((t) => t.id === task1.id)).toBeUndefined();
      });
    });

    describe('getDependencies()', () => {
      it('should return all dependencies for an element', async () => {
        const task3 = await createTestTask({ title: 'Task 3' });
        await api.create(toCreateInput(task3));

        await api.addDependency({
          sourceId: task1.id,
          targetId: task2.id,
          type: 'blocks',
        });
        await api.addDependency({
          sourceId: task1.id,
          targetId: task3.id,
          type: 'relates-to',
        });

        const deps = await api.getDependencies(task1.id);
        expect(deps.length).toBe(2);
      });

      it('should filter by dependency type', async () => {
        await api.addDependency({
          sourceId: task1.id,
          targetId: task2.id,
          type: 'blocks',
        });

        const blockDeps = await api.getDependencies(task1.id, ['blocks']);
        expect(blockDeps.length).toBe(1);

        const relateDeps = await api.getDependencies(task1.id, ['relates-to']);
        expect(relateDeps.length).toBe(0);
      });
    });

    describe('getDependents()', () => {
      it('should return elements that depend on this element', async () => {
        await api.addDependency({
          sourceId: task1.id,
          targetId: task2.id,
          type: 'blocks',
        });

        const dependents = await api.getDependents(task2.id);
        expect(dependents.length).toBe(1);
        expect(dependents[0].sourceId).toBe(task1.id);
      });
    });

    describe('getDependencyTree()', () => {
      it('should build a dependency tree', async () => {
        const task3 = await createTestTask({ title: 'Task 3' });
        await api.create(toCreateInput(task3));

        await api.addDependency({
          sourceId: task1.id,
          targetId: task2.id,
          type: 'blocks',
        });
        await api.addDependency({
          sourceId: task2.id,
          targetId: task3.id,
          type: 'blocks',
        });

        const tree = await api.getDependencyTree(task1.id);
        expect(tree.root.element.id).toBe(task1.id);
        expect(tree.dependencyDepth).toBeGreaterThanOrEqual(1);
        expect(tree.nodeCount).toBeGreaterThanOrEqual(2);
      });

      it('should throw NotFoundError for non-existent element', async () => {
        await expect(
          api.getDependencyTree('el-nonexistent' as ElementId)
        ).rejects.toThrow(NotFoundError);
      });
    });
  });

  // --------------------------------------------------------------------------
  // Search Tests
  // --------------------------------------------------------------------------

  describe('search()', () => {
    beforeEach(async () => {
      const task1 = await createTestTask({ title: 'Login Feature' });
      const task2 = await createTestTask({ title: 'Authentication Bug' });
      const task3 = await createTestTask({ title: 'Dashboard Updates' });

      await api.create(toCreateInput(task1));
      await api.create(toCreateInput(task2));
      await api.create(toCreateInput(task3));
    });

    it('should find elements by title', async () => {
      const results = await api.search('Login');
      expect(results.length).toBe(1);
      expect((results[0] as Task).title).toBe('Login Feature');
    });

    it('should be case-insensitive', async () => {
      const results = await api.search('login');
      expect(results.length).toBe(1);
    });

    it('should find partial matches', async () => {
      const results = await api.search('Auth');
      expect(results.length).toBe(1);
      expect((results[0] as Task).title).toContain('Authentication');
    });

    it('should return empty array for no matches', async () => {
      const results = await api.search('XYZ-NonExistent');
      expect(results.length).toBe(0);
    });

    it('should respect type filter', async () => {
      const doc = await createTestDocument({ content: 'Login instructions' });
      await api.create(toCreateInput(doc));

      const taskResults = await api.search('Login', { type: 'task' });
      expect(taskResults.every((e) => e.type === 'task')).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // History/Events Tests
  // --------------------------------------------------------------------------

  describe('getEvents()', () => {
    it('should return events for an element', async () => {
      const task = await createTestTask();
      await api.create(toCreateInput(task));
      await api.update<Task>(task.id, { title: 'Updated' } as Partial<Task>);

      const events = await api.getEvents(task.id);
      expect(events.length).toBe(2);
    });

    it('should filter events by type', async () => {
      const task = await createTestTask();
      await api.create(toCreateInput(task));
      await api.update<Task>(task.id, { title: 'Updated' } as Partial<Task>);

      const createEvents = await api.getEvents(task.id, { eventType: 'created' });
      expect(createEvents.length).toBe(1);
    });

    it('should limit event results', async () => {
      const task = await createTestTask();
      await api.create(toCreateInput(task));
      await api.update<Task>(task.id, { title: 'Update 1' } as Partial<Task>);
      await api.update<Task>(task.id, { title: 'Update 2' } as Partial<Task>);

      const events = await api.getEvents(task.id, { limit: 2 });
      expect(events.length).toBe(2);
    });
  });

  // --------------------------------------------------------------------------
  // Stats Tests
  // --------------------------------------------------------------------------

  describe('stats()', () => {
    it('should return system statistics', async () => {
      const task = await createTestTask();
      const doc = await createTestDocument();
      await api.create(toCreateInput(task));
      await api.create(toCreateInput(doc));

      const stats = await api.stats();
      expect(stats.totalElements).toBe(2);
      expect(stats.elementsByType.task).toBe(1);
      expect(stats.elementsByType.document).toBe(1);
      expect(stats.computedAt).toBeDefined();
    });

    it('should count ready and blocked tasks', async () => {
      const task1 = await createTestTask({ title: 'Ready Task' });
      const task2 = await createTestTask({ title: 'Blocked Task' });
      const blocker = await createTestTask({ title: 'Blocker' });

      await api.create(toCreateInput(task1));
      await api.create(toCreateInput(task2));
      await api.create(toCreateInput(blocker));

      await api.addDependency({
        sourceId: task2.id,
        targetId: blocker.id,
        type: 'blocks',
      });

      const stats = await api.stats();
      expect(stats.readyTasks).toBeGreaterThanOrEqual(1);
      expect(stats.blockedTasks).toBe(1);
    });
  });

  // --------------------------------------------------------------------------
  // Export Tests
  // --------------------------------------------------------------------------

  describe('export()', () => {
    it('should export elements as JSONL', async () => {
      const task = await createTestTask();
      await api.create(toCreateInput(task));

      const jsonl = await api.export();
      expect(typeof jsonl).toBe('string');
      expect(jsonl).toContain(task.id);
    });

    it('should export multiple elements', async () => {
      const task1 = await createTestTask({ title: 'Task 1' });
      const task2 = await createTestTask({ title: 'Task 2' });
      await api.create(toCreateInput(task1));
      await api.create(toCreateInput(task2));

      const jsonl = await api.export();
      expect(jsonl).toContain(task1.id);
      expect(jsonl).toContain(task2.id);
    });

    it('should export elements with dependencies', async () => {
      const task1 = await createTestTask({ title: 'Task 1' });
      const task2 = await createTestTask({ title: 'Task 2' });
      await api.create(toCreateInput(task1));
      await api.create(toCreateInput(task2));
      await api.addDependency({
        sourceId: task1.id,
        targetId: task2.id,
        type: 'blocks',
      });

      const jsonl = await api.export({ includeDependencies: true });
      expect(jsonl).toContain(task1.id);
      expect(jsonl).toContain(task2.id);
      // Dependencies should be included
      const lines = jsonl!.split('\n').filter(Boolean);
      expect(lines.length).toBeGreaterThanOrEqual(2);
    });

    it('should export element with tags', async () => {
      const task = await createTestTask({ tags: ['urgent', 'bug'] });
      await api.create(toCreateInput(task));

      const jsonl = await api.export();
      expect(jsonl).toContain('urgent');
      expect(jsonl).toContain('bug');
    });

    it('should export element with metadata', async () => {
      const task = await createTestTask({ metadata: { custom: 'value' } });
      await api.create(toCreateInput(task));

      const jsonl = await api.export();
      expect(jsonl).toContain('custom');
      expect(jsonl).toContain('value');
    });

    it('should return empty string when no elements', async () => {
      const jsonl = await api.export();
      expect(jsonl).toBe('');
    });
  });

  // --------------------------------------------------------------------------
  // Import Tests
  // --------------------------------------------------------------------------

  describe('import()', () => {
    it('should import elements from raw JSONL data', async () => {
      // Create JSONL data for a task
      const now = new Date().toISOString();
      const taskData = {
        id: 'test-import-1',
        type: 'task',
        createdAt: now,
        updatedAt: now,
        createdBy: 'user:test',
        tags: [],
        metadata: {},
        title: 'Imported Task',
        status: 'open',
        priority: 3,
        complexity: 3,
        taskType: 'task',
      };

      const result = await api.import({ data: JSON.stringify(taskData) });
      expect(result.success).toBe(true);
      expect(result.elementsImported).toBe(1);
      expect(result.dryRun).toBe(false);
    });

    it('should support dry run mode', async () => {
      const now = new Date().toISOString();
      const taskData = {
        id: 'test-import-dryrun',
        type: 'task',
        createdAt: now,
        updatedAt: now,
        createdBy: 'user:test',
        tags: [],
        metadata: {},
        title: 'Dry Run Task',
        status: 'open',
        priority: 3,
        complexity: 3,
        taskType: 'task',
      };

      const result = await api.import({ data: JSON.stringify(taskData), dryRun: true });
      expect(result.success).toBe(true);
      expect(result.dryRun).toBe(true);
      expect(result.elementsImported).toBe(1);

      // Element should NOT be in database
      const element = await api.get(taskData.id as ElementId);
      expect(element).toBeNull();
    });

    it('should import multiple elements', async () => {
      const now = new Date().toISOString();
      const task1 = {
        id: 'test-import-multi-1',
        type: 'task',
        createdAt: now,
        updatedAt: now,
        createdBy: 'user:test',
        tags: [],
        metadata: {},
        title: 'Task 1',
        status: 'open',
        priority: 3,
        complexity: 3,
        taskType: 'task',
      };
      const task2 = {
        id: 'test-import-multi-2',
        type: 'task',
        createdAt: now,
        updatedAt: now,
        createdBy: 'user:test',
        tags: [],
        metadata: {},
        title: 'Task 2',
        status: 'open',
        priority: 3,
        complexity: 3,
        taskType: 'task',
      };

      const jsonl = [JSON.stringify(task1), JSON.stringify(task2)].join('\n');
      const result = await api.import({ data: jsonl });

      expect(result.success).toBe(true);
      expect(result.elementsImported).toBe(2);
    });

    it('should handle import with tags', async () => {
      const now = new Date().toISOString();
      const taskData = {
        id: 'test-import-tags',
        type: 'task',
        createdAt: now,
        updatedAt: now,
        createdBy: 'user:test',
        tags: ['urgent', 'bug'],
        metadata: {},
        title: 'Tagged Task',
        status: 'open',
        priority: 3,
        complexity: 3,
        taskType: 'task',
      };

      const result = await api.import({ data: JSON.stringify(taskData) });
      expect(result.success).toBe(true);

      // Verify tags were imported
      const element = await api.get<Task>(taskData.id as ElementId);
      expect(element?.tags).toContain('urgent');
      expect(element?.tags).toContain('bug');
    });

    it('should handle invalid JSONL data', async () => {
      const result = await api.import({ data: 'not valid json' });
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should handle empty data', async () => {
      const result = await api.import({ data: '' });
      expect(result.success).toBe(true);
      expect(result.elementsImported).toBe(0);
    });

    it('should merge existing element with LWW strategy', async () => {
      // Create an element first
      const task = await createTestTask({ title: 'Original Title' });
      await api.create(toCreateInput(task));

      // Import an update with later timestamp
      const later = new Date(Date.now() + 10000).toISOString();
      const updatedData = {
        id: task.id,
        type: 'task',
        createdAt: task.createdAt,
        updatedAt: later,
        createdBy: task.createdBy,
        tags: [],
        metadata: {},
        title: 'Updated Title',
        status: 'open',
        priority: 3,
        complexity: 3,
        taskType: 'task',
      };

      const result = await api.import({ data: JSON.stringify(updatedData) });
      expect(result.success).toBe(true);
      expect(result.elementsImported).toBe(1);

      // Verify the update was applied
      const element = await api.get<Task>(task.id);
      expect(element?.title).toBe('Updated Title');
    });

    it('should skip element when local is newer', async () => {
      // Create an element with a recent timestamp
      const task = await createTestTask({ title: 'Local Title' });
      await api.create(toCreateInput(task));

      // Import an older version
      const earlier = new Date(Date.now() - 100000).toISOString();
      const oldData = {
        id: task.id,
        type: 'task',
        createdAt: earlier,
        updatedAt: earlier,
        createdBy: task.createdBy,
        tags: [],
        metadata: {},
        title: 'Old Title',
        status: 'open',
        priority: 3,
        complexity: 3,
        taskType: 'task',
      };

      const result = await api.import({ data: JSON.stringify(oldData) });
      expect(result.success).toBe(true);

      // Verify local version was kept
      const element = await api.get<Task>(task.id);
      expect(element?.title).toBe('Local Title');
    });

    it('should force overwrite with overwrite strategy', async () => {
      // Create an element first
      const task = await createTestTask({ title: 'Original Title' });
      await api.create(toCreateInput(task));

      // Import an older version with force
      const earlier = new Date(Date.now() - 100000).toISOString();
      const oldData = {
        id: task.id,
        type: 'task',
        createdAt: earlier,
        updatedAt: earlier,
        createdBy: task.createdBy,
        tags: [],
        metadata: {},
        title: 'Forced Title',
        status: 'open',
        priority: 3,
        complexity: 3,
        taskType: 'task',
      };

      const result = await api.import({
        data: JSON.stringify(oldData),
        conflictStrategy: 'overwrite',
      });
      expect(result.success).toBe(true);
      expect(result.elementsImported).toBe(1);

      // Verify force overwrite was applied
      const element = await api.get<Task>(task.id);
      expect(element?.title).toBe('Forced Title');
    });
  });

  // --------------------------------------------------------------------------
  // Round-trip Export/Import Tests
  // --------------------------------------------------------------------------

  describe('export/import round-trip', () => {
    it('should round-trip a single task', async () => {
      // Create a task
      const task = await createTestTask({ title: 'Round Trip Task' });
      await api.create(toCreateInput(task));

      // Export
      const jsonl = await api.export();

      // Create a new database and import
      const backend2 = new BunStorageBackend({ path: ':memory:' });
      initializeSchema(backend2);
      const api2 = new ElementalAPIImpl(backend2);

      const result = await api2.import({ data: jsonl! });
      expect(result.success).toBe(true);
      expect(result.elementsImported).toBe(1);

      // Verify the element exists in new database
      const imported = await api2.get<Task>(task.id);
      expect(imported).not.toBeNull();
      expect(imported?.title).toBe('Round Trip Task');

      backend2.close();
    });

    it('should round-trip elements with dependencies', async () => {
      // Create tasks with dependency
      const task1 = await createTestTask({ title: 'Task 1' });
      const task2 = await createTestTask({ title: 'Task 2' });
      await api.create(toCreateInput(task1));
      await api.create(toCreateInput(task2));
      await api.addDependency({
        sourceId: task1.id,
        targetId: task2.id,
        type: 'blocks',
      });

      // Export
      const jsonl = await api.export({ includeDependencies: true });

      // Create a new database and import
      const backend2 = new BunStorageBackend({ path: ':memory:' });
      initializeSchema(backend2);
      const api2 = new ElementalAPIImpl(backend2);

      const result = await api2.import({ data: jsonl! });
      expect(result.success).toBe(true);
      expect(result.elementsImported).toBe(2);

      // Verify both elements exist
      const imported1 = await api2.get<Task>(task1.id);
      const imported2 = await api2.get<Task>(task2.id);
      expect(imported1).not.toBeNull();
      expect(imported2).not.toBeNull();

      backend2.close();
    });

    it('should round-trip elements with tags', async () => {
      const task = await createTestTask({ tags: ['round-trip', 'test'] });
      await api.create(toCreateInput(task));

      const jsonl = await api.export();

      const backend2 = new BunStorageBackend({ path: ':memory:' });
      initializeSchema(backend2);
      const api2 = new ElementalAPIImpl(backend2);

      await api2.import({ data: jsonl! });

      const imported = await api2.get<Task>(task.id);
      expect(imported?.tags).toContain('round-trip');
      expect(imported?.tags).toContain('test');

      backend2.close();
    });
  });
});

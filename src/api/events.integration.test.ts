/**
 * Events System Integration Tests
 *
 * Comprehensive tests for the events system covering:
 * - Event recording for CRUD operations
 * - Event queries by element, actor, time range, type
 * - Event filtering and pagination
 * - Old/new value capture and diff computation
 * - Event immutability
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { ElementalAPIImpl } from './elemental-api.js';
import { BunStorageBackend } from '../storage/bun-backend.js';
import { initializeSchema } from '../storage/schema.js';
import type { StorageBackend } from '../storage/backend.js';
import type { ElementId, EntityId, Timestamp } from '../types/element.js';
import type { Task } from '../types/task.js';
// Event and EventFilter types used implicitly via API methods
import { createTask, Priority, TaskStatus } from '../types/task.js';
import { createDocument, ContentType } from '../types/document.js';
import { EventType, computeChangedFields } from '../types/event.js';

// ============================================================================
// Test Helpers
// ============================================================================

const mockEntityId = 'user:test-user' as EntityId;
const mockEntityId2 = 'user:other-user' as EntityId;

/**
 * Helper to cast element for api.create()
 */
function toCreateInput<T>(element: T): Parameters<ElementalAPIImpl['create']>[0] {
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
 * Create a small delay to ensure distinct timestamps
 */
async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// Integration Tests
// ============================================================================

describe('Events System Integration', () => {
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
  // Event Recording Tests
  // --------------------------------------------------------------------------

  describe('Event Recording', () => {
    describe('Create Events', () => {
      it('should record a created event when creating an element', async () => {
        const task = await createTestTask();
        await api.create(toCreateInput(task));

        const events = await api.getEvents(task.id);
        expect(events.length).toBe(1);
        expect(events[0].eventType).toBe(EventType.CREATED);
        expect(events[0].elementId).toBe(task.id);
        expect(events[0].actor).toBe(mockEntityId);
      });

      it('should store null oldValue for created events', async () => {
        const task = await createTestTask();
        await api.create(toCreateInput(task));

        const events = await api.getEvents(task.id);
        expect(events[0].oldValue).toBeNull();
      });

      it('should store full element in newValue for created events', async () => {
        const task = await createTestTask({
          title: 'Specific Title',
          priority: Priority.HIGH,
          tags: ['urgent'],
        });
        await api.create(toCreateInput(task));

        const events = await api.getEvents(task.id);
        const newValue = events[0].newValue as Record<string, unknown>;
        expect(newValue).not.toBeNull();
        expect(newValue.title).toBe('Specific Title');
        expect(newValue.priority).toBe(Priority.HIGH);
      });

      it('should record events for different element types', async () => {
        const task = await createTestTask();
        const doc = await createDocument({
          contentType: ContentType.MARKDOWN,
          content: '# Test',
          createdBy: mockEntityId,
        });

        await api.create(toCreateInput(task));
        await api.create(toCreateInput(doc));

        const taskEvents = await api.getEvents(task.id);
        const docEvents = await api.getEvents(doc.id);

        expect(taskEvents[0].eventType).toBe(EventType.CREATED);
        expect(docEvents[0].eventType).toBe(EventType.CREATED);
      });
    });

    describe('Update Events', () => {
      it('should record an updated event when updating an element', async () => {
        const task = await createTestTask();
        await api.create(toCreateInput(task));

        await api.update<Task>(task.id, { title: 'New Title' } as Partial<Task>);

        const events = await api.getEvents(task.id);
        const updateEvents = events.filter((e) => e.eventType === EventType.UPDATED);
        expect(updateEvents.length).toBe(1);
      });

      it('should capture old and new values in update events', async () => {
        const task = await createTestTask({ title: 'Original Title' });
        await api.create(toCreateInput(task));

        await api.update<Task>(task.id, { title: 'New Title' } as Partial<Task>);

        const events = await api.getEvents(task.id);
        const updateEvent = events.find((e) => e.eventType === EventType.UPDATED);

        expect(updateEvent).toBeDefined();
        const oldValue = updateEvent!.oldValue as Record<string, unknown>;
        const newValue = updateEvent!.newValue as Record<string, unknown>;

        expect(oldValue.title).toBe('Original Title');
        expect(newValue.title).toBe('New Title');
      });

      it('should record multiple update events for multiple updates', async () => {
        const task = await createTestTask();
        await api.create(toCreateInput(task));

        await api.update<Task>(task.id, { title: 'Update 1' } as Partial<Task>);
        await api.update<Task>(task.id, { title: 'Update 2' } as Partial<Task>);
        await api.update<Task>(task.id, { title: 'Update 3' } as Partial<Task>);

        const events = await api.getEvents(task.id);
        const updateEvents = events.filter((e) => e.eventType === EventType.UPDATED);
        expect(updateEvents.length).toBe(3);
      });

      it('should track status changes', async () => {
        const task = await createTestTask({ status: TaskStatus.OPEN });
        await api.create(toCreateInput(task));

        await api.update<Task>(task.id, { status: TaskStatus.IN_PROGRESS } as Partial<Task>);

        const events = await api.getEvents(task.id);
        const updateEvent = events.find((e) => e.eventType === EventType.UPDATED);

        const oldValue = updateEvent!.oldValue as Record<string, unknown>;
        const newValue = updateEvent!.newValue as Record<string, unknown>;

        expect(oldValue.status).toBe(TaskStatus.OPEN);
        expect(newValue.status).toBe(TaskStatus.IN_PROGRESS);
      });

      it('should track tag changes', async () => {
        const task = await createTestTask({ tags: ['tag1', 'tag2'] });
        await api.create(toCreateInput(task));

        await api.update<Task>(task.id, { tags: ['tag1', 'tag3', 'tag4'] } as Partial<Task>);

        const events = await api.getEvents(task.id);
        const updateEvent = events.find((e) => e.eventType === EventType.UPDATED);

        expect(updateEvent).toBeDefined();
      });
    });

    describe('Delete Events', () => {
      it('should record a deleted event when deleting an element', async () => {
        const task = await createTestTask();
        await api.create(toCreateInput(task));

        await api.delete(task.id);

        const events = await api.getEvents(task.id);
        const deleteEvents = events.filter((e) => e.eventType === EventType.DELETED);
        expect(deleteEvents.length).toBe(1);
      });

      it('should capture element state in oldValue for delete events', async () => {
        const task = await createTestTask({ title: 'Task to Delete' });
        await api.create(toCreateInput(task));

        await api.delete(task.id, 'No longer needed');

        const events = await api.getEvents(task.id);
        const deleteEvent = events.find((e) => e.eventType === EventType.DELETED);

        expect(deleteEvent!.oldValue).not.toBeNull();
        const oldValue = deleteEvent!.oldValue as Record<string, unknown>;
        expect(oldValue.title).toBe('Task to Delete');
      });

      it('should include delete reason in newValue', async () => {
        const task = await createTestTask();
        await api.create(toCreateInput(task));

        await api.delete(task.id, 'Duplicate task');

        const events = await api.getEvents(task.id);
        const deleteEvent = events.find((e) => e.eventType === EventType.DELETED);

        const newValue = deleteEvent!.newValue as Record<string, unknown> | null;
        expect(newValue).not.toBeNull();
        expect(newValue!.reason).toBe('Duplicate task');
      });
    });
  });

  // --------------------------------------------------------------------------
  // Event Query Tests
  // --------------------------------------------------------------------------

  describe('Event Queries', () => {
    describe('getEvents by Element', () => {
      it('should return all events for an element', async () => {
        const task = await createTestTask();
        await api.create(toCreateInput(task));
        await api.update<Task>(task.id, { title: 'Update 1' } as Partial<Task>);
        await api.update<Task>(task.id, { title: 'Update 2' } as Partial<Task>);

        const events = await api.getEvents(task.id);
        expect(events.length).toBe(3);
      });

      it('should return events in descending order by default', async () => {
        const task = await createTestTask();
        await api.create(toCreateInput(task));
        await delay(5);
        await api.update<Task>(task.id, { title: 'Update 1' } as Partial<Task>);
        await delay(5);
        await api.update<Task>(task.id, { title: 'Update 2' } as Partial<Task>);

        const events = await api.getEvents(task.id);

        // Most recent first
        expect(events[0].eventType).toBe(EventType.UPDATED);
        expect(events[events.length - 1].eventType).toBe(EventType.CREATED);
      });

      it('should return empty array for element with no events', async () => {
        const events = await api.getEvents('el-nonexistent' as ElementId);
        expect(events).toEqual([]);
      });

      it('should only return events for the specified element', async () => {
        const task1 = await createTestTask({ title: 'Task 1' });
        const task2 = await createTestTask({ title: 'Task 2' });

        await api.create(toCreateInput(task1));
        await api.create(toCreateInput(task2));

        const task1Events = await api.getEvents(task1.id);
        const task2Events = await api.getEvents(task2.id);

        expect(task1Events.every((e) => e.elementId === task1.id)).toBe(true);
        expect(task2Events.every((e) => e.elementId === task2.id)).toBe(true);
      });
    });

    describe('Filter by Event Type', () => {
      it('should filter events by single event type', async () => {
        const task = await createTestTask();
        await api.create(toCreateInput(task));
        await api.update<Task>(task.id, { title: 'Updated' } as Partial<Task>);

        const createEvents = await api.getEvents(task.id, { eventType: EventType.CREATED });
        const updateEvents = await api.getEvents(task.id, { eventType: EventType.UPDATED });

        expect(createEvents.length).toBe(1);
        expect(updateEvents.length).toBe(1);
        expect(createEvents[0].eventType).toBe(EventType.CREATED);
        expect(updateEvents[0].eventType).toBe(EventType.UPDATED);
      });

      it('should filter events by multiple event types', async () => {
        const task = await createTestTask();
        await api.create(toCreateInput(task));
        await api.update<Task>(task.id, { title: 'Updated' } as Partial<Task>);
        await api.delete(task.id);

        const lifecycleEvents = await api.getEvents(task.id, {
          eventType: [EventType.CREATED, EventType.UPDATED],
        });

        expect(lifecycleEvents.length).toBe(2);
        expect(lifecycleEvents.every((e) =>
          e.eventType === EventType.CREATED || e.eventType === EventType.UPDATED
        )).toBe(true);
      });
    });

    describe('Filter by Actor', () => {
      it('should filter events by actor', async () => {
        const task1 = await createTestTask({ createdBy: mockEntityId });
        const task2 = await createTestTask({ createdBy: mockEntityId2 });

        await api.create(toCreateInput(task1));
        await api.create(toCreateInput(task2));

        // Query by first actor
        const actor1Events = await api.getEvents(task1.id, { actor: mockEntityId });
        expect(actor1Events.length).toBe(1);
        expect(actor1Events[0].actor).toBe(mockEntityId);

        // Verify task2 event has different actor
        const task2Events = await api.getEvents(task2.id);
        expect(task2Events[0].actor).toBe(mockEntityId2);
      });
    });

    describe('Filter by Time Range', () => {
      it('should filter events after a timestamp', async () => {
        const task = await createTestTask();
        await api.create(toCreateInput(task));

        const timestamp = new Date().toISOString() as Timestamp;
        await delay(10);

        await api.update<Task>(task.id, { title: 'Updated' } as Partial<Task>);

        const recentEvents = await api.getEvents(task.id, { after: timestamp });

        // Should only get update event, not creation
        expect(recentEvents.length).toBe(1);
        expect(recentEvents[0].eventType).toBe(EventType.UPDATED);
      });

      it('should filter events before a timestamp', async () => {
        const task = await createTestTask();
        await api.create(toCreateInput(task));
        await delay(10);

        const timestamp = new Date().toISOString() as Timestamp;
        await delay(10);

        await api.update<Task>(task.id, { title: 'Updated' } as Partial<Task>);

        const oldEvents = await api.getEvents(task.id, { before: timestamp });

        // Should only get creation event, not update
        expect(oldEvents.length).toBe(1);
        expect(oldEvents[0].eventType).toBe(EventType.CREATED);
      });

      it('should filter events within a time range', async () => {
        const task = await createTestTask();
        await api.create(toCreateInput(task));
        await delay(10);

        const afterTime = new Date().toISOString() as Timestamp;
        await delay(10);

        await api.update<Task>(task.id, { title: 'Update 1' } as Partial<Task>);
        await delay(10);

        const beforeTime = new Date().toISOString() as Timestamp;
        await delay(10);

        await api.update<Task>(task.id, { title: 'Update 2' } as Partial<Task>);

        const rangeEvents = await api.getEvents(task.id, {
          after: afterTime,
          before: beforeTime,
        });

        // Should only get the first update
        expect(rangeEvents.length).toBe(1);
      });
    });

    describe('Limit Results', () => {
      it('should limit the number of events returned', async () => {
        const task = await createTestTask();
        await api.create(toCreateInput(task));
        await api.update<Task>(task.id, { title: 'Update 1' } as Partial<Task>);
        await api.update<Task>(task.id, { title: 'Update 2' } as Partial<Task>);
        await api.update<Task>(task.id, { title: 'Update 3' } as Partial<Task>);

        const limitedEvents = await api.getEvents(task.id, { limit: 2 });

        expect(limitedEvents.length).toBe(2);
      });

      it('should return all events if limit exceeds total', async () => {
        const task = await createTestTask();
        await api.create(toCreateInput(task));

        const events = await api.getEvents(task.id, { limit: 100 });

        expect(events.length).toBe(1);
      });
    });

    describe('Combined Filters', () => {
      it('should apply multiple filters together', async () => {
        const task = await createTestTask();
        await api.create(toCreateInput(task));
        await delay(10);

        const timestamp = new Date().toISOString() as Timestamp;
        await delay(10);

        await api.update<Task>(task.id, { title: 'Update 1' } as Partial<Task>);
        await api.update<Task>(task.id, { title: 'Update 2' } as Partial<Task>);

        const filteredEvents = await api.getEvents(task.id, {
          eventType: EventType.UPDATED,
          after: timestamp,
          limit: 1,
        });

        expect(filteredEvents.length).toBe(1);
        expect(filteredEvents[0].eventType).toBe(EventType.UPDATED);
      });
    });
  });

  // --------------------------------------------------------------------------
  // Event Value Capture Tests
  // --------------------------------------------------------------------------

  describe('Event Value Capture', () => {
    describe('Create Events', () => {
      it('should capture all element fields in newValue', async () => {
        const task = await createTestTask({
          title: 'Full Task',
          priority: Priority.CRITICAL,
          tags: ['urgent', 'important'],
          metadata: { customField: 'value' },
        });
        await api.create(toCreateInput(task));

        const events = await api.getEvents(task.id);
        const newValue = events[0].newValue as Record<string, unknown>;

        expect(newValue.title).toBe('Full Task');
        expect(newValue.priority).toBe(Priority.CRITICAL);
      });
    });

    describe('Update Events', () => {
      it('should capture changed fields accurately', async () => {
        const task = await createTestTask({
          title: 'Original',
          priority: Priority.LOW,
        });
        await api.create(toCreateInput(task));

        await api.update<Task>(task.id, {
          title: 'Modified',
          priority: Priority.HIGH,
        } as Partial<Task>);

        const events = await api.getEvents(task.id);
        const updateEvent = events.find((e) => e.eventType === EventType.UPDATED);

        const oldValue = updateEvent!.oldValue as Record<string, unknown>;
        const newValue = updateEvent!.newValue as Record<string, unknown>;

        expect(oldValue.title).toBe('Original');
        expect(oldValue.priority).toBe(Priority.LOW);
        expect(newValue.title).toBe('Modified');
        expect(newValue.priority).toBe(Priority.HIGH);
      });

      it('should preserve updatedAt timestamp', async () => {
        const task = await createTestTask();
        await api.create(toCreateInput(task));
        const originalUpdatedAt = task.updatedAt;

        await delay(10);
        await api.update<Task>(task.id, { title: 'Updated' } as Partial<Task>);

        const events = await api.getEvents(task.id);
        const updateEvent = events.find((e) => e.eventType === EventType.UPDATED);

        const newValue = updateEvent!.newValue as Record<string, unknown>;
        expect(newValue.updatedAt).not.toBe(originalUpdatedAt);
      });
    });
  });

  // --------------------------------------------------------------------------
  // Event Ordering and Consistency Tests
  // --------------------------------------------------------------------------

  describe('Event Ordering', () => {
    it('should assign incrementing IDs to events', async () => {
      const task = await createTestTask();
      await api.create(toCreateInput(task));
      await api.update<Task>(task.id, { title: 'Update 1' } as Partial<Task>);
      await api.update<Task>(task.id, { title: 'Update 2' } as Partial<Task>);

      const events = await api.getEvents(task.id);
      const ids = events.map((e) => e.id).sort((a, b) => a - b);

      // IDs should be in ascending order
      for (let i = 1; i < ids.length; i++) {
        expect(ids[i]).toBeGreaterThan(ids[i - 1]);
      }
    });

    it('should maintain event order across multiple elements', async () => {
      const task1 = await createTestTask({ title: 'Task 1' });
      const task2 = await createTestTask({ title: 'Task 2' });

      await api.create(toCreateInput(task1));
      await api.create(toCreateInput(task2));
      await api.update<Task>(task1.id, { title: 'Task 1 Updated' } as Partial<Task>);
      await api.update<Task>(task2.id, { title: 'Task 2 Updated' } as Partial<Task>);

      const events1 = await api.getEvents(task1.id);
      const events2 = await api.getEvents(task2.id);

      // All events should have unique IDs
      const allIds = [...events1, ...events2].map((e) => e.id);
      const uniqueIds = new Set(allIds);
      expect(uniqueIds.size).toBe(allIds.length);
    });
  });

  // --------------------------------------------------------------------------
  // Dependency Event Tests
  // --------------------------------------------------------------------------

  describe('Dependency Events', () => {
    it('should be queryable alongside element events', async () => {
      const task1 = await createTestTask({ title: 'Task 1' });
      const task2 = await createTestTask({ title: 'Task 2' });

      await api.create(toCreateInput(task1));
      await api.create(toCreateInput(task2));

      // Add dependency
      await api.addDependency({
        sourceId: task1.id,
        targetId: task2.id,
        type: 'blocks',
      });

      // Both tasks should have events
      const events1 = await api.getEvents(task1.id);
      const events2 = await api.getEvents(task2.id);

      expect(events1.length).toBeGreaterThanOrEqual(1);
      expect(events2.length).toBeGreaterThanOrEqual(1);
    });
  });

  // --------------------------------------------------------------------------
  // Changed Fields Computation Tests
  // --------------------------------------------------------------------------

  describe('computeChangedFields', () => {
    it('should identify changed fields between old and new values', () => {
      const oldValue = { a: 1, b: 2, c: 3 };
      const newValue = { a: 1, b: 5, d: 4 };

      const changed = computeChangedFields(oldValue, newValue);

      expect(changed).toContain('b');
      expect(changed).toContain('c');
      expect(changed).toContain('d');
      expect(changed).not.toContain('a');
    });

    it('should return all fields when creating (oldValue is null)', () => {
      const newValue = { a: 1, b: 2 };
      const changed = computeChangedFields(null, newValue);

      expect(changed).toEqual(['a', 'b']);
    });

    it('should return all fields when deleting (newValue is null)', () => {
      const oldValue = { a: 1, b: 2 };
      const changed = computeChangedFields(oldValue, null);

      expect(changed).toEqual(['a', 'b']);
    });

    it('should return empty array when both values are null', () => {
      const changed = computeChangedFields(null, null);
      expect(changed).toEqual([]);
    });

    it('should handle nested object changes', () => {
      const oldValue = { config: { setting: 'old' } };
      const newValue = { config: { setting: 'new' } };

      const changed = computeChangedFields(oldValue, newValue);
      expect(changed).toContain('config');
    });
  });

  // --------------------------------------------------------------------------
  // Transaction and Atomicity Tests
  // --------------------------------------------------------------------------

  describe('Event Transaction Atomicity', () => {
    it('should record event atomically with element creation', async () => {
      const task = await createTestTask();

      // Create should succeed and event should exist
      await api.create(toCreateInput(task));

      const element = await api.get<Task>(task.id);
      const events = await api.getEvents(task.id);

      expect(element).not.toBeNull();
      expect(events.length).toBe(1);
    });

    it('should record event atomically with element update', async () => {
      const task = await createTestTask();
      await api.create(toCreateInput(task));

      await api.update<Task>(task.id, { title: 'Updated' } as Partial<Task>);

      const element = await api.get<Task>(task.id);
      const events = await api.getEvents(task.id);

      expect(element?.title).toBe('Updated');
      expect(events.filter((e) => e.eventType === EventType.UPDATED).length).toBe(1);
    });
  });

  // --------------------------------------------------------------------------
  // Index Performance Tests (Smoke Tests)
  // --------------------------------------------------------------------------

  describe('Index Performance', () => {
    it('should query by actor efficiently', async () => {
      // Create multiple elements with events
      for (let i = 0; i < 10; i++) {
        const task = await createTestTask({
          title: `Task ${i}`,
          createdBy: i % 2 === 0 ? mockEntityId : mockEntityId2,
        });
        await api.create(toCreateInput(task));
      }

      // Query by actor should be efficient due to idx_events_actor index
      const start = Date.now();
      const task = await createTestTask({ title: 'Query Test', createdBy: mockEntityId });
      await api.create(toCreateInput(task));
      const events = await api.getEvents(task.id, { actor: mockEntityId });
      const duration = Date.now() - start;

      expect(events.length).toBeGreaterThan(0);
      // Should complete quickly (< 100ms for a small dataset)
      expect(duration).toBeLessThan(100);
    });

    it('should query by event type efficiently', async () => {
      const task = await createTestTask();
      await api.create(toCreateInput(task));

      for (let i = 0; i < 10; i++) {
        await api.update<Task>(task.id, { title: `Update ${i}` } as Partial<Task>);
      }

      // Query by event type should be efficient due to idx_events_type index
      const start = Date.now();
      const events = await api.getEvents(task.id, { eventType: EventType.UPDATED });
      const duration = Date.now() - start;

      expect(events.length).toBe(10);
      // Should complete quickly (< 100ms for a small dataset)
      expect(duration).toBeLessThan(100);
    });
  });
});

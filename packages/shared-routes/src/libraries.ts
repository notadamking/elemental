/**
 * Library Routes Factory
 *
 * CRUD operations for document libraries.
 */

import { Hono } from 'hono';
import type { ElementId, EntityId, Element, CreateLibraryInput } from '@elemental/core';
import { createLibrary } from '@elemental/core';
import type { CollaborateServices } from './types.js';

export function createLibraryRoutes(services: CollaborateServices) {
  const { api } = services;
  const app = new Hono();

  // GET /api/libraries - List all libraries
  app.get('/api/libraries', async (c) => {
    try {
      const url = new URL(c.req.url);
      const hydrateDescription = url.searchParams.get('hydrate.description') === 'true';
      const limitParam = url.searchParams.get('limit');
      const limit = limitParam ? parseInt(limitParam, 10) : 10000; // Default to loading all

      const libraries = await api.list({
        type: 'library',
        limit,
        ...(hydrateDescription && { hydrate: { description: true } }),
      } as Parameters<typeof api.list>[0]);

      // Get parent relationships for all libraries
      // Parent-child dependencies have: sourceId = child, targetId = parent
      const librariesWithParent = await Promise.all(
        libraries.map(async (library) => {
          // Find if this library has a parent (it would be the source in a parent-child dependency)
          const dependencies = await api.getDependencies(library.id, ['parent-child']);
          const parentDep = dependencies.find((d) => d.type === 'parent-child');
          return {
            ...library,
            parentId: parentDep?.targetId || null,
          };
        })
      );

      return c.json(librariesWithParent);
    } catch (error) {
      console.error('[elemental] Failed to get libraries:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get libraries' } }, 500);
    }
  });

  // GET /api/libraries/:id - Get single library with children
  app.get('/api/libraries/:id', async (c) => {
    try {
      const id = c.req.param('id') as ElementId;
      const url = new URL(c.req.url);
      const hydrateDescription = url.searchParams.get('hydrate.description') === 'true';

      const library = await api.get(id, hydrateDescription ? { hydrate: { description: true } } : undefined);

      if (!library) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Library not found' } }, 404);
      }

      if (library.type !== 'library') {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Library not found' } }, 404);
      }

      // Get sub-libraries and documents (children via parent-child dependency)
      const dependents = await api.getDependents(id, ['parent-child']);

      // Separate into sub-libraries and documents
      const childIds = dependents.map((d) => d.sourceId);
      const children: Element[] = [];
      for (const childId of childIds) {
        const child = await api.get(childId as ElementId);
        if (child) {
          children.push(child);
        }
      }

      const subLibraries = children.filter((c) => c.type === 'library');
      const documents = children.filter((c) => c.type === 'document');

      return c.json({
        ...library,
        _subLibraries: subLibraries,
        _documents: documents,
      });
    } catch (error) {
      console.error('[elemental] Failed to get library:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get library' } }, 500);
    }
  });

  // GET /api/libraries/:id/documents - Get documents in a library
  app.get('/api/libraries/:id/documents', async (c) => {
    try {
      const id = c.req.param('id') as ElementId;
      const url = new URL(c.req.url);
      const limitParam = url.searchParams.get('limit');
      const offsetParam = url.searchParams.get('offset');

      // First verify library exists
      const library = await api.get(id);
      if (!library) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Library not found' } }, 404);
      }
      if (library.type !== 'library') {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Library not found' } }, 404);
      }

      // Get documents via parent-child dependency
      const dependents = await api.getDependents(id, ['parent-child']);

      // Filter to only documents and fetch full data
      const documentIds = dependents.map((d) => d.sourceId);
      const documents: Element[] = [];

      for (const docId of documentIds) {
        const doc = await api.get(docId as ElementId);
        if (doc && doc.type === 'document') {
          documents.push(doc);
        }
      }

      // Apply pagination if requested
      let result = documents;
      const offset = offsetParam ? parseInt(offsetParam, 10) : 0;
      const limit = limitParam ? parseInt(limitParam, 10) : undefined;

      if (offset > 0) {
        result = result.slice(offset);
      }
      if (limit !== undefined) {
        result = result.slice(0, limit);
      }

      return c.json(result);
    } catch (error) {
      console.error('[elemental] Failed to get library documents:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get library documents' } }, 500);
    }
  });

  // POST /api/libraries - Create a new library
  app.post('/api/libraries', async (c) => {
    try {
      const body = (await c.req.json()) as {
        name: string;
        createdBy: string;
        parentId?: string;
        tags?: string[];
        metadata?: Record<string, unknown>;
      };

      // Validate required fields
      if (!body.name || typeof body.name !== 'string') {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: 'name is required and must be a string' } }, 400);
      }
      if (!body.createdBy || typeof body.createdBy !== 'string') {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: 'createdBy is required and must be a string' } }, 400);
      }

      // Create the library input
      const libraryInput: CreateLibraryInput = {
        name: body.name.trim(),
        createdBy: body.createdBy as EntityId,
        ...(body.tags && { tags: body.tags }),
        ...(body.metadata && { metadata: body.metadata }),
      };

      // Create the library using the factory function
      const library = await createLibrary(libraryInput);

      // Persist to database
      const created = await api.create(library as unknown as Element & Record<string, unknown>);

      // If parentId is provided, establish parent-child relationship
      if (body.parentId) {
        // Verify parent library exists
        const parent = await api.get(body.parentId as ElementId);
        if (!parent) {
          // Library was created but parent doesn't exist - delete and return error
          await api.delete(created.id);
          return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Parent library not found' } }, 400);
        }
        if (parent.type !== 'library') {
          await api.delete(created.id);
          return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Parent must be a library' } }, 400);
        }

        // Add parent-child dependency (child is source, parent is target)
        await api.addDependency({
          sourceId: created.id,
          targetId: body.parentId as ElementId,
          type: 'parent-child',
          actor: body.createdBy as EntityId,
        });
      }

      return c.json(created, 201);
    } catch (error) {
      if ((error as { code?: string }).code === 'VALIDATION_ERROR') {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: (error as Error).message } }, 400);
      }
      console.error('[elemental] Failed to create library:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to create library' } }, 500);
    }
  });

  return app;
}

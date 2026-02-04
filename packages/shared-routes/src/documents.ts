/**
 * Document Routes Factory
 *
 * CRUD operations for documents, versioning, links, and comments.
 */

import { Hono } from 'hono';
import type { ElementId, EntityId, Element, Document, DocumentId, CreateDocumentInput, DocumentCategory, DocumentStatus } from '@elemental/core';
import { createDocument, isValidDocumentCategory, isValidDocumentStatus, DocumentStatus as DocumentStatusEnum } from '@elemental/core';
import type { CollaborateServices } from './types.js';

// Comment type for the comments table
interface CommentRow {
  [key: string]: unknown; // Index signature for Row compatibility
  id: string;
  document_id: string;
  author_id: string;
  content: string;
  anchor: string;
  start_offset: number | null;
  end_offset: number | null;
  resolved: number;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export function createDocumentRoutes(services: CollaborateServices) {
  const { api, storageBackend } = services;
  const app = new Hono();

  // GET /api/documents - List documents
  app.get('/api/documents', async (c) => {
    try {
      const url = new URL(c.req.url);

      // Parse pagination and filter parameters
      const limitParam = url.searchParams.get('limit');
      const offsetParam = url.searchParams.get('offset');
      const orderByParam = url.searchParams.get('orderBy');
      const orderDirParam = url.searchParams.get('orderDir');
      const searchParam = url.searchParams.get('search');
      const categoryParam = url.searchParams.get('category');
      const statusParam = url.searchParams.get('status');

      // Build filter
      const filter: Record<string, unknown> = {
        type: 'document',
      };

      // Category filter
      if (categoryParam) {
        const categories = categoryParam.split(',');
        for (const cat of categories) {
          if (!isValidDocumentCategory(cat)) {
            return c.json({ error: { code: 'VALIDATION_ERROR', message: `Invalid category: ${cat}` } }, 400);
          }
        }
        filter.category = categories.length === 1 ? categories[0] : categories;
      }

      // Status filter (default: active only, unless explicitly specified)
      if (statusParam) {
        const statuses = statusParam.split(',');
        for (const s of statuses) {
          if (!isValidDocumentStatus(s)) {
            return c.json({ error: { code: 'VALIDATION_ERROR', message: `Invalid status: ${s}` } }, 400);
          }
        }
        filter.status = statuses.length === 1 ? statuses[0] : statuses;
      }

      const requestedLimit = limitParam ? parseInt(limitParam, 10) : 50;
      const requestedOffset = offsetParam ? parseInt(offsetParam, 10) : 0;

      if (orderByParam) {
        filter.orderBy = orderByParam;
      } else {
        filter.orderBy = 'updated_at';
      }
      if (orderDirParam) {
        filter.orderDir = orderDirParam;
      } else {
        filter.orderDir = 'desc';
      }

      // If search param is provided, use the search API for better results
      if (searchParam && searchParam.trim()) {
        const searchResults = await api.search(searchParam.trim(), filter as Parameters<typeof api.search>[1]);
        const slicedResults = searchResults.slice(requestedOffset, requestedOffset + requestedLimit);
        return c.json({
          items: slicedResults,
          total: searchResults.length,
          offset: requestedOffset,
          limit: requestedLimit,
          hasMore: requestedOffset + requestedLimit < searchResults.length,
        });
      }

      // Standard paginated query when no search
      filter.limit = requestedLimit;
      filter.offset = requestedOffset;

      const result = await api.listPaginated(filter as Parameters<typeof api.listPaginated>[0]);

      // Return paginated response format
      return c.json({
        items: result.items,
        total: result.total,
        offset: result.offset,
        limit: result.limit,
        hasMore: result.hasMore,
      });
    } catch (error) {
      console.error('[elemental] Failed to get documents:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get documents' } }, 500);
    }
  });

  /**
   * GET /api/documents/search
   * Search documents using FTS5 full-text search with BM25 ranking.
   *
   * Query params:
   * - q: Search query (required)
   * - limit: Hard cap on results (default: 50)
   * - category: Filter by category
   * - status: Filter by status (default: active)
   * - sensitivity: Elbow detection sensitivity (default: 1.5)
   * - mode: Search mode — 'relevance' (FTS5 only, default), 'semantic' (vector), 'hybrid' (RRF fusion)
   */
  app.get('/api/documents/search', async (c) => {
    try {
      const url = new URL(c.req.url);
      const query = url.searchParams.get('q');
      const limitParam = url.searchParams.get('limit');
      const categoryParam = url.searchParams.get('category');
      const statusParam = url.searchParams.get('status');
      const sensitivityParam = url.searchParams.get('sensitivity');
      const mode = url.searchParams.get('mode') ?? 'relevance';

      if (!query || query.trim().length === 0) {
        return c.json({ results: [] });
      }

      // Validate mode
      if (!['relevance', 'semantic', 'hybrid'].includes(mode)) {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: `Invalid mode: ${mode}. Must be relevance, semantic, or hybrid` } }, 400);
      }

      // Semantic and hybrid modes require a registered EmbeddingService (currently CLI-only)
      if (mode === 'semantic' || mode === 'hybrid') {
        return c.json({ error: { code: 'NOT_IMPLEMENTED', message: `${mode} search requires a registered EmbeddingService. Use mode=relevance for FTS5 search, or install embeddings via 'el embeddings install' (CLI only).` } }, 501);
      }

      // Validate category if provided
      if (categoryParam && !isValidDocumentCategory(categoryParam)) {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: `Invalid category: ${categoryParam}` } }, 400);
      }

      // Validate status if provided
      if (statusParam && !isValidDocumentStatus(statusParam)) {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: `Invalid status: ${statusParam}` } }, 400);
      }

      const results = await api.searchDocumentsFTS(query.trim(), {
        hardCap: limitParam ? parseInt(limitParam, 10) : 50,
        ...(categoryParam && { category: categoryParam as DocumentCategory }),
        ...(statusParam && { status: statusParam as DocumentStatus }),
        ...(sensitivityParam && { elbowSensitivity: parseFloat(sensitivityParam) }),
      });

      return c.json({
        results: results.map((r) => ({
          id: r.document.id,
          contentType: r.document.contentType,
          category: r.document.category,
          status: r.document.status,
          score: r.score,
          snippet: r.snippet,
          updatedAt: r.document.updatedAt,
        })),
        query: query.trim(),
        mode,
        total: results.length,
      });
    } catch (error) {
      console.error('[elemental] Failed to search documents:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to search documents' } }, 500);
    }
  });

  // GET /api/documents/:id - Get single document
  app.get('/api/documents/:id', async (c) => {
    try {
      const id = c.req.param('id') as ElementId;
      const document = await api.get(id);

      if (!document) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Document not found' } }, 404);
      }

      if (document.type !== 'document') {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Document not found' } }, 404);
      }

      return c.json(document);
    } catch (error) {
      console.error('[elemental] Failed to get document:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get document' } }, 500);
    }
  });

  // POST /api/documents - Create document
  app.post('/api/documents', async (c) => {
    try {
      const body = await c.req.json();

      // Validate required fields
      if (!body.createdBy || typeof body.createdBy !== 'string') {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: 'createdBy is required' } }, 400);
      }

      // Default content type to 'text' if not provided
      const contentType = body.contentType || 'text';

      // Validate contentType
      const validContentTypes = ['text', 'markdown', 'json'];
      if (!validContentTypes.includes(contentType)) {
        return c.json(
          {
            error: {
              code: 'VALIDATION_ERROR',
              message: `Invalid contentType. Must be one of: ${validContentTypes.join(', ')}`,
            },
          },
          400
        );
      }

      // Default content to empty string if not provided
      const content = body.content || '';

      // Validate JSON content if contentType is json
      if (contentType === 'json' && content) {
        try {
          JSON.parse(content);
        } catch {
          return c.json(
            {
              error: {
                code: 'VALIDATION_ERROR',
                message: 'Invalid JSON content',
              },
            },
            400
          );
        }
      }

      // Validate category if provided
      if (body.category !== undefined && !isValidDocumentCategory(body.category)) {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: `Invalid category: ${body.category}` } }, 400);
      }

      // Validate status if provided
      if (body.status !== undefined && !isValidDocumentStatus(body.status)) {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: `Invalid status: ${body.status}` } }, 400);
      }

      // Build CreateDocumentInput
      const docInput: CreateDocumentInput = {
        contentType,
        content,
        createdBy: body.createdBy as EntityId,
        ...(body.tags !== undefined && { tags: body.tags }),
        ...(body.metadata !== undefined && { metadata: body.metadata }),
        ...(body.category !== undefined && { category: body.category as DocumentCategory }),
        ...(body.status !== undefined && { status: body.status as DocumentStatus }),
      };

      // Create the document using the factory function
      const document = await createDocument(docInput);

      // If title is provided, add it to the document data
      const documentWithTitle = body.title ? { ...document, title: body.title } : document;

      // Create in database
      const created = await api.create(documentWithTitle as unknown as Element & Record<string, unknown>);

      // If libraryId is provided, add document to library via parent-child dependency
      if (body.libraryId) {
        // Verify library exists
        const library = await api.get(body.libraryId as ElementId);
        if (library && library.type === 'library') {
          await api.addDependency({
            blockedId: created.id,
            blockerId: body.libraryId as ElementId,
            type: 'parent-child',
          });
        }
      }

      return c.json(created, 201);
    } catch (error) {
      if ((error as { code?: string }).code === 'VALIDATION_ERROR') {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: (error as Error).message } }, 400);
      }
      console.error('[elemental] Failed to create document:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to create document' } }, 500);
    }
  });

  // PATCH /api/documents/:id - Update document
  app.patch('/api/documents/:id', async (c) => {
    try {
      const id = c.req.param('id') as ElementId;
      const body = await c.req.json();

      // First verify it's a document
      const existing = await api.get(id);
      if (!existing) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Document not found' } }, 404);
      }
      if (existing.type !== 'document') {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Document not found' } }, 404);
      }

      // Extract allowed updates (prevent changing immutable fields)
      const updates: Record<string, unknown> = {};
      const allowedFields = ['title', 'content', 'contentType', 'tags', 'metadata', 'category', 'status'];

      for (const field of allowedFields) {
        if (body[field] !== undefined) {
          updates[field] = body[field];
        }
      }

      // Validate contentType if provided
      if (updates.contentType) {
        const validContentTypes = ['text', 'markdown', 'json'];
        if (!validContentTypes.includes(updates.contentType as string)) {
          return c.json(
            {
              error: {
                code: 'VALIDATION_ERROR',
                message: `Invalid contentType. Must be one of: ${validContentTypes.join(', ')}`,
              },
            },
            400
          );
        }
      }

      // Validate category if provided
      if (updates.category !== undefined && !isValidDocumentCategory(updates.category as string)) {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: `Invalid category: ${updates.category}` } }, 400);
      }

      // Validate status if provided
      if (updates.status !== undefined && !isValidDocumentStatus(updates.status as string)) {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: `Invalid status: ${updates.status}` } }, 400);
      }

      // Validate JSON content if contentType is json
      const contentTypeVal = (updates.contentType || (existing as unknown as { contentType: string }).contentType) as string;
      if (contentTypeVal === 'json' && updates.content !== undefined) {
        try {
          JSON.parse(updates.content as string);
        } catch {
          return c.json(
            {
              error: {
                code: 'VALIDATION_ERROR',
                message: 'Invalid JSON content',
              },
            },
            400
          );
        }
      }

      // Update the document
      const updated = await api.update(id, updates);

      return c.json(updated);
    } catch (error) {
      if ((error as { code?: string }).code === 'NOT_FOUND') {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Document not found' } }, 404);
      }
      if ((error as { code?: string }).code === 'CONCURRENT_MODIFICATION') {
        return c.json({ error: { code: 'CONFLICT', message: 'Document was modified by another process' } }, 409);
      }
      if ((error as { code?: string }).code === 'VALIDATION_ERROR') {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: (error as Error).message } }, 400);
      }
      console.error('[elemental] Failed to update document:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to update document' } }, 500);
    }
  });

  // POST /api/documents/:id/archive - Archive a document
  app.post('/api/documents/:id/archive', async (c) => {
    try {
      const id = c.req.param('id') as ElementId;

      const existing = await api.get(id);
      if (!existing) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Document not found' } }, 404);
      }
      if (existing.type !== 'document') {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Document not found' } }, 404);
      }

      const updated = await api.update(id, { status: DocumentStatusEnum.ARCHIVED } as unknown as Partial<Document>);
      return c.json(updated);
    } catch (error) {
      if ((error as { code?: string }).code === 'NOT_FOUND') {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Document not found' } }, 404);
      }
      console.error('[elemental] Failed to archive document:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to archive document' } }, 500);
    }
  });

  // POST /api/documents/:id/unarchive - Unarchive a document
  app.post('/api/documents/:id/unarchive', async (c) => {
    try {
      const id = c.req.param('id') as ElementId;

      const existing = await api.get(id);
      if (!existing) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Document not found' } }, 404);
      }
      if (existing.type !== 'document') {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Document not found' } }, 404);
      }

      const updated = await api.update(id, { status: DocumentStatusEnum.ACTIVE } as unknown as Partial<Document>);
      return c.json(updated);
    } catch (error) {
      if ((error as { code?: string }).code === 'NOT_FOUND') {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Document not found' } }, 404);
      }
      console.error('[elemental] Failed to unarchive document:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to unarchive document' } }, 500);
    }
  });

  // GET /api/documents/:id/versions - Get document version history
  app.get('/api/documents/:id/versions', async (c) => {
    try {
      const id = c.req.param('id') as ElementId;

      // First verify it's a document
      const existing = await api.get(id);
      if (!existing) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Document not found' } }, 404);
      }
      if (existing.type !== 'document') {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Document not found' } }, 404);
      }

      // Get version history using the API method
      const versions = await api.getDocumentHistory(id as unknown as DocumentId);

      return c.json(versions);
    } catch (error) {
      console.error('[elemental] Failed to get document versions:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get document versions' } }, 500);
    }
  });

  // GET /api/documents/:id/versions/:version - Get specific version
  app.get('/api/documents/:id/versions/:version', async (c) => {
    try {
      const id = c.req.param('id') as ElementId;
      const versionParam = c.req.param('version');
      const version = parseInt(versionParam, 10);

      if (isNaN(version) || version < 1) {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid version number' } }, 400);
      }

      // Get the specific version
      const document = await api.getDocumentVersion(id as unknown as DocumentId, version);

      if (!document) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Document version not found' } }, 404);
      }

      return c.json(document);
    } catch (error) {
      console.error('[elemental] Failed to get document version:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get document version' } }, 500);
    }
  });

  // POST /api/documents/:id/restore - Restore document to a specific version
  app.post('/api/documents/:id/restore', async (c) => {
    try {
      const id = c.req.param('id') as ElementId;
      const body = await c.req.json();
      const version = body.version;

      if (typeof version !== 'number' || version < 1) {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid version number' } }, 400);
      }

      // First verify it's a document
      const existing = await api.get(id);
      if (!existing) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Document not found' } }, 404);
      }
      if (existing.type !== 'document') {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Document not found' } }, 404);
      }

      // Get the version to restore
      const versionToRestore = await api.getDocumentVersion(id as unknown as DocumentId, version);
      if (!versionToRestore) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Document version not found' } }, 404);
      }

      // Update the document with the restored content
      const restored = await api.update(id, {
        content: versionToRestore.content,
        contentType: versionToRestore.contentType,
      } as unknown as Partial<Document>);

      return c.json(restored);
    } catch (error) {
      if ((error as { code?: string }).code === 'NOT_FOUND') {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Document not found' } }, 404);
      }
      console.error('[elemental] Failed to restore document version:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to restore document version' } }, 500);
    }
  });

  // POST /api/documents/:id/clone - Clone a document
  app.post('/api/documents/:id/clone', async (c) => {
    try {
      const id = c.req.param('id') as ElementId;
      const body = await c.req.json();

      // Get the source document
      const sourceDoc = await api.get(id);
      if (!sourceDoc) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Document not found' } }, 404);
      }
      if (sourceDoc.type !== 'document') {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Document not found' } }, 404);
      }

      // Cast to document type with title field (title is a runtime-added field)
      const sourceDocument = sourceDoc as Document & { title?: string };

      // Validate createdBy
      if (!body.createdBy || typeof body.createdBy !== 'string') {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: 'createdBy is required' } }, 400);
      }

      // Create a new document with the same content
      const docInput: CreateDocumentInput = {
        contentType: sourceDocument.contentType,
        content: sourceDocument.content || '',
        createdBy: body.createdBy as EntityId,
        tags: sourceDocument.tags || [],
      };

      const newDoc = await createDocument(docInput);

      // Use the new title or generate one from the original
      const originalTitle = (sourceDocument.title as string | undefined) || `Document ${sourceDocument.id}`;
      const newTitle = body.title || `${originalTitle} (Copy)`;

      const documentWithTitle = { ...newDoc, title: newTitle };

      // Create in database
      const created = await api.create(documentWithTitle as unknown as Element & Record<string, unknown>);

      // If libraryId is provided, add document to library via parent-child dependency
      if (body.libraryId) {
        const library = await api.get(body.libraryId as ElementId);
        if (library && library.type === 'library') {
          await api.addDependency({
            blockedId: created.id,
            blockerId: body.libraryId as ElementId,
            type: 'parent-child',
          });
        }
      }

      return c.json(created, 201);
    } catch (error) {
      if ((error as { code?: string }).code === 'NOT_FOUND') {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Document not found' } }, 404);
      }
      console.error('[elemental] Failed to clone document:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to clone document' } }, 500);
    }
  });

  /**
   * GET /api/documents/:id/links
   * Returns documents linked from this document (outgoing) and documents linking to it (incoming)
   * Query params:
   *   - direction: 'outgoing' | 'incoming' | 'both' (default: 'both')
   */
  app.get('/api/documents/:id/links', async (c) => {
    try {
      const documentId = c.req.param('id') as ElementId;
      const url = new URL(c.req.url);
      const direction = url.searchParams.get('direction') || 'both';

      // Verify document exists
      const doc = await api.get(documentId);
      if (!doc) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Document not found' } }, 404);
      }
      if (doc.type !== 'document') {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Document not found' } }, 404);
      }

      // Fetch document details based on direction
      let outgoing: (typeof doc)[] = [];
      let incoming: (typeof doc)[] = [];

      if (direction === 'outgoing' || direction === 'both') {
        // Outgoing links: documents this document references (blockedId = this document)
        const outgoingDeps = await api.getDependencies(documentId, ['references']);
        const outgoingDocs = await Promise.all(
          outgoingDeps.map(async (dep) => {
            const linkedDoc = await api.get(dep.blockerId as ElementId);
            if (linkedDoc && linkedDoc.type === 'document') {
              return linkedDoc;
            }
            return null;
          })
        );
        outgoing = outgoingDocs.filter(Boolean) as (typeof doc)[];
      }

      if (direction === 'incoming' || direction === 'both') {
        // Incoming links: documents that reference this document (blockerId = this document)
        const incomingDeps = await api.getDependents(documentId, ['references']);
        const incomingDocs = await Promise.all(
          incomingDeps.map(async (dep) => {
            const linkedDoc = await api.get(dep.blockedId as ElementId);
            if (linkedDoc && linkedDoc.type === 'document') {
              return linkedDoc;
            }
            return null;
          })
        );
        incoming = incomingDocs.filter(Boolean) as (typeof doc)[];
      }

      return c.json({ outgoing, incoming });
    } catch (error) {
      console.error('[elemental] Failed to get document links:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get document links' } }, 500);
    }
  });

  /**
   * POST /api/documents/:id/links
   * Creates a link from this document to another document
   * Body: { targetDocumentId: string, actor?: string }
   */
  app.post('/api/documents/:id/links', async (c) => {
    try {
      const sourceId = c.req.param('id') as ElementId;
      const body = await c.req.json();

      // Validate target document ID
      if (!body.targetDocumentId || typeof body.targetDocumentId !== 'string') {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: 'targetDocumentId is required' } }, 400);
      }

      const targetId = body.targetDocumentId as ElementId;

      // Prevent self-reference
      if (sourceId === targetId) {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Cannot link a document to itself' } }, 400);
      }

      // Verify source document exists
      const sourceDoc = await api.get(sourceId);
      if (!sourceDoc) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Source document not found' } }, 404);
      }
      if (sourceDoc.type !== 'document') {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Source document not found' } }, 404);
      }

      // Verify target document exists
      const targetDoc = await api.get(targetId);
      if (!targetDoc) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Target document not found' } }, 404);
      }
      if (targetDoc.type !== 'document') {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Target document not found' } }, 404);
      }

      // Check if link already exists
      const existingDeps = await api.getDependencies(sourceId);
      const alreadyLinked = existingDeps.some(
        (dep) => dep.blockedId === sourceId && dep.blockerId === targetId && dep.type === 'references'
      );
      if (alreadyLinked) {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Link already exists between these documents' } }, 400);
      }

      // Create the references dependency (source document references target document)
      await api.addDependency({
        blockedId: sourceId,
        blockerId: targetId,
        type: 'references',
        actor: (body.actor as EntityId) || ('el-0000' as EntityId),
      });

      return c.json({ sourceId, targetId, targetDocument: targetDoc }, 201);
    } catch (error) {
      console.error('[elemental] Failed to link documents:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to link documents' } }, 500);
    }
  });

  /**
   * DELETE /api/documents/:sourceId/links/:targetId
   * Removes a link between two documents
   */
  app.delete('/api/documents/:sourceId/links/:targetId', async (c) => {
    try {
      const sourceId = c.req.param('sourceId') as ElementId;
      const targetId = c.req.param('targetId') as ElementId;

      // Verify source document exists
      const sourceDoc = await api.get(sourceId);
      if (!sourceDoc) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Source document not found' } }, 404);
      }
      if (sourceDoc.type !== 'document') {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Source document not found' } }, 404);
      }

      // Find the link dependency
      const dependencies = await api.getDependencies(sourceId);
      const linkDep = dependencies.find(
        (dep) => dep.blockedId === sourceId && dep.blockerId === targetId && dep.type === 'references'
      );

      if (!linkDep) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Link not found between these documents' } }, 404);
      }

      // Remove the dependency
      await api.removeDependency(sourceId, targetId, 'references');

      return c.json({ success: true, sourceId, targetId });
    } catch (error) {
      console.error('[elemental] Failed to remove document link:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to remove document link' } }, 500);
    }
  });

  /**
   * GET /api/documents/:id/comments
   * Returns all comments for a document
   * Query params:
   *   - includeResolved: 'true' to include resolved comments (default: false)
   */
  app.get('/api/documents/:id/comments', async (c) => {
    try {
      const documentId = c.req.param('id') as ElementId;
      const url = new URL(c.req.url);
      const includeResolved = url.searchParams.get('includeResolved') === 'true';

      // Verify document exists
      const doc = await api.get(documentId);
      if (!doc) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Document not found' } }, 404);
      }
      if (doc.type !== 'document') {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Document not found' } }, 404);
      }

      // Query comments from the database
      let query = `
        SELECT * FROM comments
        WHERE document_id = ? AND deleted_at IS NULL
      `;
      if (!includeResolved) {
        query += ' AND resolved = 0';
      }
      query += ' ORDER BY created_at ASC';

      const comments = storageBackend.query<CommentRow>(query, [documentId]);

      // Hydrate with author info
      const hydratedComments = await Promise.all(
        comments.map(async (comment) => {
          const author = await api.get(comment.author_id as ElementId);
          let resolvedByEntity = null;
          if (comment.resolved_by) {
            resolvedByEntity = await api.get(comment.resolved_by as ElementId);
          }

          return {
            id: comment.id,
            documentId: comment.document_id,
            author: author
              ? {
                  id: author.id,
                  name: (author as unknown as { name: string }).name,
                  entityType: (author as unknown as { entityType: string }).entityType,
                }
              : { id: comment.author_id, name: 'Unknown', entityType: 'unknown' },
            content: comment.content,
            anchor: JSON.parse(comment.anchor),
            startOffset: comment.start_offset,
            endOffset: comment.end_offset,
            resolved: comment.resolved === 1,
            resolvedBy: resolvedByEntity
              ? {
                  id: resolvedByEntity.id,
                  name: (resolvedByEntity as unknown as { name: string }).name,
                }
              : null,
            resolvedAt: comment.resolved_at,
            createdAt: comment.created_at,
            updatedAt: comment.updated_at,
          };
        })
      );

      return c.json({
        comments: hydratedComments,
        total: hydratedComments.length,
      });
    } catch (error) {
      console.error('[elemental] Failed to get document comments:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get document comments' } }, 500);
    }
  });

  /**
   * POST /api/documents/:id/comments
   * Creates a new comment on a document
   * Body: {
   *   authorId: string,
   *   content: string,
   *   anchor: { hash: string, prefix: string, text: string, suffix: string },
   *   startOffset?: number,
   *   endOffset?: number
   * }
   */
  app.post('/api/documents/:id/comments', async (c) => {
    try {
      const documentId = c.req.param('id') as ElementId;
      const body = await c.req.json();

      // Validate required fields
      if (!body.authorId || typeof body.authorId !== 'string') {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: 'authorId is required' } }, 400);
      }
      if (!body.content || typeof body.content !== 'string' || body.content.trim().length === 0) {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: 'content is required' } }, 400);
      }
      if (!body.anchor || typeof body.anchor !== 'object') {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: 'anchor is required' } }, 400);
      }
      if (!body.anchor.hash || !body.anchor.text) {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: 'anchor must include hash and text' } }, 400);
      }

      // Verify document exists
      const doc = await api.get(documentId);
      if (!doc) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Document not found' } }, 404);
      }
      if (doc.type !== 'document') {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Document not found' } }, 404);
      }

      // Verify author exists
      const author = await api.get(body.authorId as ElementId);
      if (!author) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Author not found' } }, 404);
      }
      if (author.type !== 'entity') {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: 'authorId must be an entity' } }, 400);
      }

      // Generate comment ID
      const commentId = `cmt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      const now = new Date().toISOString();

      // Insert comment
      storageBackend.run(
        `
        INSERT INTO comments (id, document_id, author_id, content, anchor, start_offset, end_offset, resolved, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
      `,
        [
          commentId,
          documentId,
          body.authorId,
          body.content.trim(),
          JSON.stringify(body.anchor),
          body.startOffset ?? null,
          body.endOffset ?? null,
          now,
          now,
        ]
      );

      return c.json(
        {
          id: commentId,
          documentId,
          author: {
            id: author.id,
            name: (author as unknown as { name: string }).name,
            entityType: (author as unknown as { entityType: string }).entityType,
          },
          content: body.content.trim(),
          anchor: body.anchor,
          startOffset: body.startOffset ?? null,
          endOffset: body.endOffset ?? null,
          resolved: false,
          resolvedBy: null,
          resolvedAt: null,
          createdAt: now,
          updatedAt: now,
        },
        201
      );
    } catch (error) {
      console.error('[elemental] Failed to create comment:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to create comment' } }, 500);
    }
  });

  return app;
}

/**
 * Document Commands - Document management CLI interface
 *
 * Provides CLI commands for document operations:
 * - doc create: Create a new document
 * - doc list: List documents
 * - doc history: Show document version history
 * - doc rollback: Rollback to a previous version
 */

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Command, GlobalOptions, CommandResult, CommandOption } from '../types.js';
import { success, failure, ExitCode } from '../types.js';
import { getFormatter, getOutputMode } from '../formatter.js';
import { createStorage, initializeSchema } from '@elemental/storage';
import { createElementalAPI } from '../../api/elemental-api.js';
import {
  createDocument,
  ContentType,
  DocumentCategory,
  DocumentStatus,
  isValidDocumentCategory,
  isValidDocumentStatus,
  type Document,
  type CreateDocumentInput,
  type DocumentId,
} from '@elemental/core';
import type { Element, ElementId, EntityId } from '@elemental/core';
import type { ElementalAPI } from '../../api/types.js';
import { OPERATOR_ENTITY_ID } from './init.js';

// ============================================================================
// Constants
// ============================================================================

const ELEMENTAL_DIR = '.elemental';
const DEFAULT_DB_NAME = 'elemental.db';
const DEFAULT_ACTOR = OPERATOR_ENTITY_ID;

// ============================================================================
// Database Helper
// ============================================================================

function resolveDatabasePath(options: GlobalOptions, requireExists: boolean = true): string | null {
  if (options.db) {
    if (requireExists && !existsSync(options.db)) {
      return null;
    }
    return options.db;
  }

  const elementalDir = join(process.cwd(), ELEMENTAL_DIR);
  if (existsSync(elementalDir)) {
    const dbPath = join(elementalDir, DEFAULT_DB_NAME);
    if (requireExists && !existsSync(dbPath)) {
      return null;
    }
    return dbPath;
  }

  return null;
}

function resolveActor(options: GlobalOptions): EntityId {
  return (options.actor ?? DEFAULT_ACTOR) as EntityId;
}

function createAPI(options: GlobalOptions, createDb: boolean = false): { api: ElementalAPI; error?: string } {
  const dbPath = resolveDatabasePath(options, !createDb);
  if (!dbPath) {
    return {
      api: null as unknown as ElementalAPI,
      error: 'No database found. Run "el init" to initialize a workspace, or specify --db path',
    };
  }

  try {
    const backend = createStorage({ path: dbPath, create: true });
    initializeSchema(backend);
    return { api: createElementalAPI(backend) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      api: null as unknown as ElementalAPI,
      error: `Failed to open database: ${message}`,
    };
  }
}

// ============================================================================
// Document Create Command
// ============================================================================

interface DocCreateOptions {
  content?: string;
  file?: string;
  type?: string;
  category?: string;
  tag?: string[];
}

const docCreateOptions: CommandOption[] = [
  {
    name: 'content',
    short: 'c',
    description: 'Document content (text)',
    hasValue: true,
  },
  {
    name: 'file',
    short: 'f',
    description: 'Read content from file',
    hasValue: true,
  },
  {
    name: 'type',
    short: 't',
    description: 'Content type: text, markdown, json (default: text)',
    hasValue: true,
  },
  {
    name: 'category',
    description: 'Document category (e.g., spec, prd, reference, tutorial)',
    hasValue: true,
  },
  {
    name: 'tag',
    description: 'Add tag (can be repeated)',
    hasValue: true,
    array: true,
  },
];

async function docCreateHandler(
  _args: string[],
  options: GlobalOptions & DocCreateOptions
): Promise<CommandResult> {
  // Must specify either --content or --file
  if (!options.content && !options.file) {
    return failure('Either --content or --file is required', ExitCode.INVALID_ARGUMENTS);
  }

  if (options.content && options.file) {
    return failure('Cannot specify both --content and --file', ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = createAPI(options, true);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    const actor = resolveActor(options);

    // Get content
    let content: string;
    if (options.content) {
      content = options.content;
    } else {
      const filePath = resolve(options.file!);
      if (!existsSync(filePath)) {
        return failure(`File not found: ${filePath}`, ExitCode.NOT_FOUND);
      }
      content = readFileSync(filePath, 'utf-8');
    }

    // Parse content type
    let contentType = ContentType.TEXT;
    if (options.type) {
      const validTypes = Object.values(ContentType);
      if (!validTypes.includes(options.type as typeof ContentType.TEXT)) {
        return failure(
          `Invalid content type: ${options.type}. Must be one of: ${validTypes.join(', ')}`,
          ExitCode.VALIDATION
        );
      }
      contentType = options.type as typeof ContentType.TEXT;
    }

    // Validate category
    if (options.category && !isValidDocumentCategory(options.category)) {
      const validCategories = Object.values(DocumentCategory);
      return failure(
        `Invalid category: ${options.category}. Must be one of: ${validCategories.join(', ')}`,
        ExitCode.VALIDATION
      );
    }

    // Handle tags
    let tags: string[] | undefined;
    if (options.tag) {
      tags = Array.isArray(options.tag) ? options.tag : [options.tag];
    }

    const input: CreateDocumentInput = {
      content,
      contentType,
      createdBy: actor,
      ...(tags && { tags }),
      ...(options.category && { category: options.category as typeof DocumentCategory.OTHER }),
    };

    const doc = await createDocument(input);
    const created = await api.create(doc as unknown as Element & Record<string, unknown>);

    const mode = getOutputMode(options);
    if (mode === 'quiet') {
      return success(created.id);
    }

    return success(created, `Created document ${created.id}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to create document: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

const docCreateCommand: Command = {
  name: 'create',
  description: 'Create a new document',
  usage: 'el doc create --content <text> | --file <path> [options]',
  help: `Create a new document.

Options:
  -c, --content <text>      Document content (inline)
  -f, --file <path>         Read content from file
  -t, --type <type>         Content type: text, markdown, json (default: text)
      --category <category> Document category (e.g., spec, prd, reference, tutorial)
      --tag <tag>           Add tag (can be repeated)

Examples:
  el doc create --content "Hello world"
  el doc create --file README.md --type markdown
  el doc create --file spec.md --type markdown --category spec
  el doc create -c '{"key": "value"}' -t json --tag config`,
  options: docCreateOptions,
  handler: docCreateHandler as Command['handler'],
};

// ============================================================================
// Document List Command
// ============================================================================

interface DocListOptions {
  limit?: string;
  type?: string;
  category?: string;
  status?: string;
  all?: boolean;
}

const docListOptions: CommandOption[] = [
  {
    name: 'limit',
    short: 'l',
    description: 'Maximum number of results',
    hasValue: true,
  },
  {
    name: 'type',
    short: 't',
    description: 'Filter by content type (text, markdown, json)',
    hasValue: true,
  },
  {
    name: 'category',
    description: 'Filter by category (e.g., spec, prd, reference)',
    hasValue: true,
  },
  {
    name: 'status',
    description: 'Filter by status (active, archived)',
    hasValue: true,
  },
  {
    name: 'all',
    short: 'a',
    description: 'Include archived documents',
    hasValue: false,
  },
];

async function docListHandler(
  _args: string[],
  options: GlobalOptions & DocListOptions
): Promise<CommandResult> {
  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    // Build filter
    const filter: Record<string, unknown> = {
      type: 'document',
    };

    // Limit
    if (options.limit) {
      const limit = parseInt(options.limit, 10);
      if (isNaN(limit) || limit < 1) {
        return failure('Limit must be a positive number', ExitCode.VALIDATION);
      }
      filter.limit = limit;
    }

    // Category filter
    if (options.category) {
      if (!isValidDocumentCategory(options.category)) {
        const validCategories = Object.values(DocumentCategory);
        return failure(
          `Invalid category: ${options.category}. Must be one of: ${validCategories.join(', ')}`,
          ExitCode.VALIDATION
        );
      }
      filter.category = options.category;
    }

    // Status filter: --all includes everything, --status filters explicitly, default is active only
    if (options.all) {
      filter.status = [DocumentStatus.ACTIVE, DocumentStatus.ARCHIVED];
    } else if (options.status) {
      if (!isValidDocumentStatus(options.status)) {
        return failure(
          `Invalid status: ${options.status}. Must be one of: active, archived`,
          ExitCode.VALIDATION
        );
      }
      filter.status = options.status;
    }
    // Default: active only (handled by buildDocumentWhereClause)

    const result = await api.listPaginated<Document>(filter);
    let items = result.items;

    // Filter by content type if specified
    if (options.type) {
      items = items.filter((d) => d.contentType === options.type);
    }

    const mode = getOutputMode(options);
    const formatter = getFormatter(mode);

    if (mode === 'json') {
      return success(items);
    }

    if (mode === 'quiet') {
      return success(items.map((d) => d.id).join('\n'));
    }

    if (items.length === 0) {
      return success(null, 'No documents found');
    }

    // Build table
    const headers = ['ID', 'TYPE', 'CATEGORY', 'STATUS', 'VERSION', 'SIZE', 'CREATED'];
    const rows = items.map((d) => [
      d.id,
      d.contentType,
      d.category ?? 'other',
      d.status ?? 'active',
      `v${d.version}`,
      formatSize(d.content.length),
      d.createdAt.split('T')[0],
    ]);

    const table = formatter.table(headers, rows);
    const summary = `\nShowing ${items.length} of ${result.total} documents`;

    return success(items, table + summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to list documents: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

/**
 * Format size in human-readable format
 */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

const docListCommand: Command = {
  name: 'list',
  description: 'List documents',
  usage: 'el doc list [options]',
  help: `List documents (active only by default).

Options:
  -l, --limit <n>            Maximum results
  -t, --type <type>          Filter by content type
      --category <category>  Filter by category (e.g., spec, prd, reference)
      --status <status>      Filter by status (active, archived)
  -a, --all                  Include archived documents

Examples:
  el doc list
  el doc list --type markdown
  el doc list --category spec
  el doc list --status archived
  el doc list --all
  el doc list --limit 10`,
  options: docListOptions,
  handler: docListHandler as Command['handler'],
};

// ============================================================================
// Document History Command
// ============================================================================

interface DocHistoryOptions {
  limit?: string;
}

const docHistoryOptions: CommandOption[] = [
  {
    name: 'limit',
    short: 'l',
    description: 'Maximum versions to show',
    hasValue: true,
  },
];

async function docHistoryHandler(
  args: string[],
  options: GlobalOptions & DocHistoryOptions
): Promise<CommandResult> {
  const [docId] = args;

  if (!docId) {
    return failure('Usage: el doc history <document-id>', ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    // Get current document to verify it exists
    const current = await api.get<Document>(docId as ElementId);
    if (!current) {
      return failure(`Document not found: ${docId}`, ExitCode.NOT_FOUND);
    }
    if (current.type !== 'document') {
      return failure(`Element ${docId} is not a document (type: ${current.type})`, ExitCode.VALIDATION);
    }

    // Check if document is deleted (tombstone)
    const data = current as unknown as Record<string, unknown>;
    if (data.status === 'tombstone' || data.deletedAt) {
      return failure(`Document not found: ${docId}`, ExitCode.NOT_FOUND);
    }

    // Get version history
    const history = await api.getDocumentHistory(current.id as unknown as DocumentId);

    // Apply limit
    let versions = history;
    if (options.limit) {
      const limit = parseInt(options.limit, 10);
      if (isNaN(limit) || limit < 1) {
        return failure('Limit must be a positive number', ExitCode.VALIDATION);
      }
      versions = history.slice(0, limit);
    }

    const mode = getOutputMode(options);
    const formatter = getFormatter(mode);

    if (mode === 'json') {
      return success(versions);
    }

    if (mode === 'quiet') {
      return success(versions.map((v) => `v${v.version}`).join('\n'));
    }

    if (versions.length === 0) {
      return success(null, 'No version history');
    }

    // Build table
    const headers = ['VERSION', 'SIZE', 'MODIFIED', 'CURRENT'];
    const rows = versions.map((v) => [
      `v${v.version}`,
      formatSize(v.content.length),
      v.updatedAt.split('T')[0],
      v.id === current.id ? 'Yes' : '',
    ]);

    const table = formatter.table(headers, rows);
    const summary = `\nDocument ${docId} has ${history.length} version(s)`;

    return success(versions, table + summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to get document history: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

const docHistoryCommand: Command = {
  name: 'history',
  description: 'Show document version history',
  usage: 'el doc history <document-id> [options]',
  help: `Show the version history of a document.

Arguments:
  document-id   Document identifier

Options:
  -l, --limit <n>  Maximum versions to show

Examples:
  el doc history el-doc123
  el doc history el-doc123 --limit 5`,
  options: docHistoryOptions,
  handler: docHistoryHandler as Command['handler'],
};

// ============================================================================
// Document Rollback Command
// ============================================================================

async function docRollbackHandler(
  args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  const [docId, versionStr] = args;

  if (!docId || !versionStr) {
    return failure('Usage: el doc rollback <document-id> <version>', ExitCode.INVALID_ARGUMENTS);
  }

  const version = parseInt(versionStr, 10);
  if (isNaN(version) || version < 1) {
    return failure('Version must be a positive number', ExitCode.VALIDATION);
  }

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    const actor = resolveActor(options);

    // Get the target version
    const targetVersion = await api.getDocumentVersion(docId as unknown as DocumentId, version);
    if (!targetVersion) {
      return failure(`Version ${version} not found for document ${docId}`, ExitCode.NOT_FOUND);
    }

    // Get current document
    const current = await api.get<Document>(docId as ElementId);
    if (!current) {
      return failure(`Document not found: ${docId}`, ExitCode.NOT_FOUND);
    }

    // Check if document is deleted (tombstone)
    const data = current as unknown as Record<string, unknown>;
    if (data.status === 'tombstone' || data.deletedAt) {
      return failure(`Cannot rollback deleted document: ${docId}`, ExitCode.NOT_FOUND);
    }

    // Already at that version?
    if (current.version === version) {
      return success(current, `Document is already at version ${version}`);
    }

    // Update document with content from target version
    // This creates a new version with the old content
    const updated = await api.update<Document>(
      docId as ElementId,
      { content: targetVersion.content },
      { actor }
    );

    return success(
      updated,
      `Rolled back document ${docId} to version ${version} (new version: ${updated.version})`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const code = (err as { code?: string }).code;
    if (code === 'NOT_FOUND') {
      return failure(message, ExitCode.NOT_FOUND);
    }
    if (code === 'INVALID_INPUT') {
      return failure(message, ExitCode.VALIDATION);
    }
    return failure(`Failed to rollback document: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

const docRollbackCommand: Command = {
  name: 'rollback',
  description: 'Rollback document to a previous version',
  usage: 'el doc rollback <document-id> <version>',
  help: `Rollback a document to a previous version.

This creates a new version with the content from the specified version.
The version history is preserved.

Arguments:
  document-id   Document identifier
  version       Version number to rollback to

Examples:
  el doc rollback el-doc123 2`,
  handler: docRollbackHandler as Command['handler'],
};

// ============================================================================
// Document Update Command
// ============================================================================

interface DocUpdateOptions {
  content?: string;
  file?: string;
}

const docUpdateOptions: CommandOption[] = [
  {
    name: 'content',
    short: 'c',
    description: 'New document content (text)',
    hasValue: true,
  },
  {
    name: 'file',
    short: 'f',
    description: 'Read new content from file',
    hasValue: true,
  },
];

async function docUpdateHandler(
  args: string[],
  options: GlobalOptions & DocUpdateOptions
): Promise<CommandResult> {
  const [docId] = args;

  if (!docId) {
    return failure('Usage: el doc update <document-id> --content <text> | --file <path>', ExitCode.INVALID_ARGUMENTS);
  }

  // Must specify either --content or --file
  if (!options.content && !options.file) {
    return failure('Either --content or --file is required', ExitCode.INVALID_ARGUMENTS);
  }

  if (options.content && options.file) {
    return failure('Cannot specify both --content and --file', ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    // Verify document exists
    const existing = await api.get<Document>(docId as ElementId);
    if (!existing) {
      return failure(`Document not found: ${docId}`, ExitCode.NOT_FOUND);
    }
    if (existing.type !== 'document') {
      return failure(`Element ${docId} is not a document (type: ${existing.type})`, ExitCode.VALIDATION);
    }

    // Check if document is deleted (tombstone)
    const data = existing as unknown as Record<string, unknown>;
    if (data.status === 'tombstone' || data.deletedAt) {
      return failure(`Document not found: ${docId}`, ExitCode.NOT_FOUND);
    }

    const actor = resolveActor(options);

    // Get new content
    let content: string;
    if (options.content) {
      content = options.content;
    } else {
      const filePath = resolve(options.file!);
      if (!existsSync(filePath)) {
        return failure(`File not found: ${filePath}`, ExitCode.NOT_FOUND);
      }
      content = readFileSync(filePath, 'utf-8');
    }

    // Update the document (creates a new version)
    const updated = await api.update<Document>(
      docId as ElementId,
      { content },
      { actor }
    );

    const mode = getOutputMode(options);
    if (mode === 'json') {
      return success(updated);
    }
    if (mode === 'quiet') {
      return success(updated.id);
    }

    return success(updated, `Updated document ${docId} (now at version ${updated.version})`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to update document: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

const docUpdateCommand: Command = {
  name: 'update',
  description: 'Update document content',
  usage: 'el doc update <document-id> --content <text> | --file <path>',
  help: `Update a document's content, creating a new version.

Documents are versioned - each update creates a new version while preserving
the history. Use 'el doc history' to view versions and 'el doc rollback' to
revert to a previous version.

Arguments:
  document-id   Document identifier

Options:
  -c, --content <text>  New content (inline)
  -f, --file <path>     Read new content from file

Examples:
  el doc update el-doc123 --content "Updated content"
  el doc update el-doc123 --file updated-spec.md
  el doc update el-doc123 -c "Quick fix"`,
  options: docUpdateOptions,
  handler: docUpdateHandler as Command['handler'],
};

// ============================================================================
// Document Show Command
// ============================================================================

interface DocShowOptions {
  docVersion?: string;
}

const docShowOptions: CommandOption[] = [
  {
    name: 'docVersion',
    short: 'V',
    description: 'Show specific version',
    hasValue: true,
  },
];

async function docShowHandler(
  args: string[],
  options: GlobalOptions & DocShowOptions
): Promise<CommandResult> {
  const [docId] = args;

  if (!docId) {
    return failure('Usage: el doc show <document-id> [options]', ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    let doc: Document | null;

    if (options.docVersion) {
      const version = parseInt(options.docVersion, 10);
      if (isNaN(version) || version < 1) {
        return failure('Version must be a positive number', ExitCode.VALIDATION);
      }
      doc = await api.getDocumentVersion(docId as unknown as DocumentId, version);
      if (!doc) {
        return failure(`Version ${version} not found for document ${docId}`, ExitCode.NOT_FOUND);
      }
    } else {
      doc = await api.get<Document>(docId as ElementId);
      if (!doc) {
        return failure(`Document not found: ${docId}`, ExitCode.NOT_FOUND);
      }
      if (doc.type !== 'document') {
        return failure(`Element ${docId} is not a document (type: ${doc.type})`, ExitCode.VALIDATION);
      }
    }

    // Check if document is deleted (tombstone)
    const data = doc as unknown as Record<string, unknown>;
    if (data.status === 'tombstone' || data.deletedAt) {
      return failure(`Document not found: ${docId}`, ExitCode.NOT_FOUND);
    }

    const mode = getOutputMode(options);
    const formatter = getFormatter(mode);

    if (mode === 'json') {
      return success(doc);
    }

    if (mode === 'quiet') {
      return success(doc.content);
    }

    // Format document details
    const output = formatter.element(doc as unknown as Record<string, unknown>);
    return success(doc, output);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const code = (err as { code?: string }).code;
    if (code === 'NOT_FOUND') {
      return failure(message, ExitCode.NOT_FOUND);
    }
    if (code === 'INVALID_INPUT') {
      return failure(message, ExitCode.VALIDATION);
    }
    return failure(`Failed to show document: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

const docShowCommand: Command = {
  name: 'show',
  description: 'Show document details',
  usage: 'el doc show <document-id> [options]',
  help: `Show document details and content.

Arguments:
  document-id   Document identifier

Options:
  -V, --docVersion <n>  Show specific version

Examples:
  el doc show el-doc123
  el doc show el-doc123 --docVersion 2
  el doc show el-doc123 --quiet  # Output content only`,
  options: docShowOptions,
  handler: docShowHandler as Command['handler'],
};

// ============================================================================
// Document Archive Command
// ============================================================================

async function docArchiveHandler(
  args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  const [docId] = args;

  if (!docId) {
    return failure('Usage: el doc archive <document-id>', ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    const existing = await api.get<Document>(docId as ElementId);
    if (!existing) {
      return failure(`Document not found: ${docId}`, ExitCode.NOT_FOUND);
    }
    if (existing.type !== 'document') {
      return failure(`Element ${docId} is not a document`, ExitCode.VALIDATION);
    }

    const updated = await api.update<Document>(
      docId as ElementId,
      { status: DocumentStatus.ARCHIVED } as Partial<Document>,
      { actor: resolveActor(options) }
    );

    return success(updated, `Archived document ${docId}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to archive document: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

const docArchiveCommand: Command = {
  name: 'archive',
  description: 'Archive a document',
  usage: 'el doc archive <document-id>',
  help: `Archive a document. Archived documents are hidden from default list/search.

Arguments:
  document-id   Document identifier

Examples:
  el doc archive el-doc123`,
  handler: docArchiveHandler as Command['handler'],
};

// ============================================================================
// Document Delete Command
// ============================================================================

interface DocDeleteOptions {
  reason?: string;
  force?: boolean;
}

const docDeleteOptions: CommandOption[] = [
  {
    name: 'reason',
    short: 'r',
    description: 'Reason for deletion',
    hasValue: true,
  },
  {
    name: 'force',
    short: 'f',
    description: 'Skip confirmation',
    hasValue: false,
  },
];

async function docDeleteHandler(
  args: string[],
  options: GlobalOptions & DocDeleteOptions
): Promise<CommandResult> {
  const [docId] = args;

  if (!docId) {
    return failure('Usage: el doc delete <document-id>', ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    const existing = await api.get<Document>(docId as ElementId);
    if (!existing) {
      return failure(`Document not found: ${docId}`, ExitCode.NOT_FOUND);
    }
    if (existing.type !== 'document') {
      return failure(`Element ${docId} is not a document`, ExitCode.VALIDATION);
    }

    // Check if document is already deleted (tombstone)
    const data = existing as unknown as Record<string, unknown>;
    if (data.status === 'tombstone' || data.deletedAt) {
      return failure(`Document not found: ${docId}`, ExitCode.NOT_FOUND);
    }

    const actor = resolveActor(options);
    await api.delete(docId as ElementId, { actor, reason: options.reason } as Record<string, unknown>);

    const mode = getOutputMode(options);
    if (mode === 'json') {
      return success({ id: docId, deleted: true, type: 'document' });
    }
    if (mode === 'quiet') {
      return success(docId);
    }
    return success(null, `Deleted document ${docId}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const code = (err as { code?: string }).code;
    if (code === 'NOT_FOUND') {
      return failure(message, ExitCode.NOT_FOUND);
    }
    return failure(`Failed to delete document: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

const docDeleteCommand: Command = {
  name: 'delete',
  description: 'Delete a document (soft-delete)',
  usage: 'el doc delete <document-id> [options]',
  help: `Delete a document (soft-delete via tombstone).

Arguments:
  document-id   Document identifier

Options:
  -r, --reason <text>  Reason for deletion
  -f, --force          Skip confirmation

Examples:
  el doc delete el-doc123
  el doc delete el-doc123 --reason "outdated"
  el doc delete el-doc123 --force`,
  options: docDeleteOptions,
  handler: docDeleteHandler as Command['handler'],
};

// ============================================================================
// Document Unarchive Command
// ============================================================================

async function docUnarchiveHandler(
  args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  const [docId] = args;

  if (!docId) {
    return failure('Usage: el doc unarchive <document-id>', ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    const existing = await api.get<Document>(docId as ElementId);
    if (!existing) {
      return failure(`Document not found: ${docId}`, ExitCode.NOT_FOUND);
    }
    if (existing.type !== 'document') {
      return failure(`Element ${docId} is not a document`, ExitCode.VALIDATION);
    }

    const updated = await api.update<Document>(
      docId as ElementId,
      { status: DocumentStatus.ACTIVE } as Partial<Document>,
      { actor: resolveActor(options) }
    );

    return success(updated, `Unarchived document ${docId}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to unarchive document: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

const docUnarchiveCommand: Command = {
  name: 'unarchive',
  description: 'Unarchive a document',
  usage: 'el doc unarchive <document-id>',
  help: `Unarchive a document, making it visible in default list/search again.

Arguments:
  document-id   Document identifier

Examples:
  el doc unarchive el-doc123`,
  handler: docUnarchiveHandler as Command['handler'],
};

// ============================================================================
// Document Search Command
// ============================================================================

interface DocSearchOptions {
  category?: string;
  status?: string;
  limit?: string;
}

const docSearchOptions: CommandOption[] = [
  {
    name: 'category',
    description: 'Filter by category',
    hasValue: true,
  },
  {
    name: 'status',
    description: 'Filter by status',
    hasValue: true,
  },
  {
    name: 'limit',
    short: 'l',
    description: 'Maximum results',
    hasValue: true,
  },
];

async function docSearchHandler(
  args: string[],
  options: GlobalOptions & DocSearchOptions
): Promise<CommandResult> {
  if (args.length === 0) {
    return failure('Search query is required. Usage: el doc search <query>', ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    const query = args.join(' ');

    // Validate category
    if (options.category) {
      if (!isValidDocumentCategory(options.category)) {
        const validCategories = Object.values(DocumentCategory);
        return failure(
          `Invalid category: ${options.category}. Must be one of: ${validCategories.join(', ')}`,
          ExitCode.VALIDATION
        );
      }
    }

    // Validate status
    if (options.status) {
      if (!isValidDocumentStatus(options.status)) {
        return failure(
          `Invalid status: ${options.status}. Must be one of: active, archived`,
          ExitCode.VALIDATION
        );
      }
    }

    // Validate limit
    let hardCap = 50;
    if (options.limit) {
      hardCap = parseInt(options.limit, 10);
      if (isNaN(hardCap) || hardCap < 1) {
        return failure('Limit must be a positive number', ExitCode.VALIDATION);
      }
    }

    const searchOptions: Record<string, unknown> = { hardCap };
    if (options.category) searchOptions.category = options.category;
    if (options.status) searchOptions.status = options.status;

    const results = await api.searchDocumentsFTS(query, searchOptions as Parameters<typeof api.searchDocumentsFTS>[1]);

    const mode = getOutputMode(options);
    const formatter = getFormatter(mode);

    if (mode === 'json') {
      return success(results);
    }

    if (mode === 'quiet') {
      return success(results.map((r) => r.document.id).join('\n'));
    }

    if (results.length === 0) {
      return success(null, 'No documents found');
    }

    const headers = ['ID', 'SCORE', 'TITLE', 'CATEGORY', 'SNIPPET'];
    const rows = results.map((r) => [
      r.document.id,
      r.score.toFixed(2),
      (r.document.title ?? '').slice(0, 40),
      r.document.category ?? 'other',
      r.snippet.slice(0, 60).replace(/\n/g, ' '),
    ]);

    const table = formatter.table(headers, rows);
    const summary = `\n${results.length} result${results.length !== 1 ? 's' : ''} for "${query}"`;

    return success(results, table + summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Search failed: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

const docSearchCommand: Command = {
  name: 'search',
  description: 'Full-text search documents',
  usage: 'el doc search <query> [options]',
  help: `Full-text search documents using FTS5 with BM25 ranking.

Arguments:
  query   Search query text

Options:
  -l, --limit <n>            Maximum results (default: 50)
      --category <category>  Filter by category (e.g., spec, prd, reference)
      --status <status>      Filter by status (active, archived)

Examples:
  el doc search "API authentication"
  el doc search "migration" --category spec
  el doc search "config" --limit 5`,
  options: docSearchOptions,
  handler: docSearchHandler as Command['handler'],
};

// ============================================================================
// Document Reindex Command
// ============================================================================

async function docReindexHandler(
  _args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    const result = api.reindexAllDocumentsFTS();
    const mode = getOutputMode(options);
    if (mode === 'json') {
      return success(result);
    }
    return success(
      null,
      `Reindexed ${result.indexed} documents for FTS search${result.errors > 0 ? ` (${result.errors} errors)` : ''}`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to reindex documents: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

const docReindexCommand: Command = {
  name: 'reindex',
  description: 'Rebuild full-text search index',
  usage: 'el doc reindex',
  help: `Rebuild the FTS5 full-text search index for all documents.

Iterates all documents (including archived) and re-indexes them
in the FTS5 virtual table. Use this after migration or if search
results seem stale.

Examples:
  el doc reindex`,
  handler: docReindexHandler as Command['handler'],
};

// ============================================================================
// Document Root Command
// ============================================================================

export const documentCommand: Command = {
  name: 'doc',
  description: 'Manage documents (versioned content)',
  usage: 'el doc <subcommand> [options]',
  help: `Manage documents - versioned content storage.

Documents store content with automatic versioning. Each update creates
a new version, and you can view history or rollback to any previous version.

Subcommands:
  create      Create a new document
  list        List documents (active only by default)
  search      Full-text search documents
  show        Show document details
  update      Update document content (creates new version)
  history     Show version history
  rollback    Rollback to a previous version
  archive     Archive a document
  unarchive   Unarchive a document
  delete      Delete a document (soft-delete)
  reindex     Rebuild full-text search index

Examples:
  el doc create --content "Hello world"
  el doc create --file notes.md --type markdown --category spec
  el doc list
  el doc list --category reference --all
  el doc search "API authentication"
  el doc search "migration" --category spec
  el doc show el-doc123
  el doc update el-doc123 --content "New content"
  el doc update el-doc123 --file updated.md
  el doc history el-doc123
  el doc rollback el-doc123 2
  el doc archive el-doc123
  el doc unarchive el-doc123
  el doc delete el-doc123
  el doc reindex`,
  subcommands: {
    create: docCreateCommand,
    list: docListCommand,
    search: docSearchCommand,
    show: docShowCommand,
    update: docUpdateCommand,
    history: docHistoryCommand,
    rollback: docRollbackCommand,
    archive: docArchiveCommand,
    unarchive: docUnarchiveCommand,
    delete: docDeleteCommand,
    reindex: docReindexCommand,
  },
  handler: async (args, options): Promise<CommandResult> => {
    // Default to list if no subcommand
    if (args.length === 0) {
      return docListHandler(args, options);
    }
    return failure(
      `Unknown subcommand: ${args[0]}. Use 'el doc --help' for available subcommands.`,
      ExitCode.INVALID_ARGUMENTS
    );
  },
};

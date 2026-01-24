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
import { createStorage, initializeSchema } from '../../storage/index.js';
import { createElementalAPI } from '../../api/elemental-api.js';
import {
  createDocument,
  ContentType,
  type Document,
  type CreateDocumentInput,
  type DocumentId,
} from '../../types/document.js';
import type { Element, ElementId, EntityId } from '../../types/element.js';
import type { ElementalAPI } from '../../api/types.js';

// ============================================================================
// Constants
// ============================================================================

const ELEMENTAL_DIR = '.elemental';
const DEFAULT_DB_NAME = 'elemental.db';
const DEFAULT_ACTOR = 'cli-user';

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
    name: 'tag',
    description: 'Add tag (can be repeated)',
    hasValue: true,
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
  -c, --content <text>  Document content (inline)
  -f, --file <path>     Read content from file
  -t, --type <type>     Content type: text, markdown, json (default: text)
      --tag <tag>       Add tag (can be repeated)

Examples:
  el doc create --content "Hello world"
  el doc create --file README.md --type markdown
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
    const headers = ['ID', 'TYPE', 'VERSION', 'SIZE', 'CREATED'];
    const rows = items.map((d) => [
      d.id,
      d.contentType,
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
  help: `List documents.

Options:
  -l, --limit <n>    Maximum results
  -t, --type <type>  Filter by content type

Examples:
  el doc list
  el doc list --type markdown
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
  create    Create a new document
  list      List documents
  show      Show document details
  history   Show version history
  rollback  Rollback to a previous version

Examples:
  el doc create --content "Hello world"
  el doc create --file notes.md --type markdown
  el doc list
  el doc show el-doc123
  el doc history el-doc123
  el doc rollback el-doc123 2`,
  subcommands: {
    create: docCreateCommand,
    list: docListCommand,
    show: docShowCommand,
    history: docHistoryCommand,
    rollback: docRollbackCommand,
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

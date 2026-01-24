/**
 * Library Commands - Collection command interface for libraries
 *
 * Provides CLI commands for library operations:
 * - library create: Create a new library
 * - library list: List libraries
 * - library add: Add document to library
 * - library remove: Remove document from library
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Command, GlobalOptions, CommandResult, CommandOption } from '../types.js';
import { success, failure, ExitCode } from '../types.js';
import { getFormatter, getOutputMode } from '../formatter.js';
import { createStorage, initializeSchema } from '../../storage/index.js';
import { createElementalAPI } from '../../api/elemental-api.js';
import {
  createLibrary,
  type Library,
  type CreateLibraryInput,
} from '../../types/library.js';
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
// Library Create Command
// ============================================================================

interface LibraryCreateOptions {
  name?: string;
  tag?: string[];
}

const libraryCreateOptions: CommandOption[] = [
  {
    name: 'name',
    short: 'n',
    description: 'Library name (required)',
    hasValue: true,
    required: true,
  },
  {
    name: 'tag',
    description: 'Add tag (can be repeated)',
    hasValue: true,
  },
];

async function libraryCreateHandler(
  _args: string[],
  options: GlobalOptions & LibraryCreateOptions
): Promise<CommandResult> {
  if (!options.name) {
    return failure('--name is required for creating a library', ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = createAPI(options, true);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    const actor = resolveActor(options);

    // Handle tags
    let tags: string[] | undefined;
    if (options.tag) {
      tags = Array.isArray(options.tag) ? options.tag : [options.tag];
    }

    const input: CreateLibraryInput = {
      name: options.name,
      createdBy: actor,
      ...(tags && { tags }),
    };

    const library = await createLibrary(input);
    const created = await api.create(library as unknown as Element & Record<string, unknown>);

    const mode = getOutputMode(options);
    if (mode === 'quiet') {
      return success(created.id);
    }

    return success(created, `Created library ${created.id}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to create library: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

const libraryCreateCommand: Command = {
  name: 'create',
  description: 'Create a new library',
  usage: 'el library create --name <name> [options]',
  help: `Create a new document library.

Options:
  -n, --name <name>  Library name (required)
      --tag <tag>    Add tag (can be repeated)

Examples:
  el library create --name "API Documentation"
  el library create -n "Design Docs" --tag design --tag frontend`,
  options: libraryCreateOptions,
  handler: libraryCreateHandler as Command['handler'],
};

// ============================================================================
// Library List Command
// ============================================================================

interface LibraryListOptions {
  limit?: string;
}

const libraryListOptions: CommandOption[] = [
  {
    name: 'limit',
    short: 'l',
    description: 'Maximum number of results',
    hasValue: true,
  },
];

async function libraryListHandler(
  _args: string[],
  options: GlobalOptions & LibraryListOptions
): Promise<CommandResult> {
  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    // Build filter
    const filter: Record<string, unknown> = {
      type: 'library',
    };

    // Limit
    if (options.limit) {
      const limit = parseInt(options.limit, 10);
      if (isNaN(limit) || limit < 1) {
        return failure('Limit must be a positive number', ExitCode.VALIDATION);
      }
      filter.limit = limit;
    }

    const result = await api.listPaginated<Library>(filter);
    const items = result.items;

    const mode = getOutputMode(options);
    const formatter = getFormatter(mode);

    if (mode === 'json') {
      return success(items);
    }

    if (mode === 'quiet') {
      return success(items.map((l) => l.id).join('\n'));
    }

    if (items.length === 0) {
      return success(null, 'No libraries found');
    }

    // Build table
    const headers = ['ID', 'NAME', 'TAGS', 'CREATED'];
    const rows = items.map((l) => [
      l.id,
      l.name.length > 40 ? l.name.substring(0, 37) + '...' : l.name,
      l.tags.slice(0, 3).join(', ') + (l.tags.length > 3 ? '...' : ''),
      l.createdAt.split('T')[0],
    ]);

    const table = formatter.table(headers, rows);
    const summary = `\nShowing ${items.length} of ${result.total} libraries`;

    return success(items, table + summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to list libraries: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

const libraryListCommand: Command = {
  name: 'list',
  description: 'List libraries',
  usage: 'el library list [options]',
  help: `List document libraries.

Options:
  -l, --limit <n>  Maximum results

Examples:
  el library list
  el library list --limit 10`,
  options: libraryListOptions,
  handler: libraryListHandler as Command['handler'],
};

// ============================================================================
// Library Add Command
// ============================================================================

async function libraryAddHandler(
  args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  const [libraryId, docId] = args;

  if (!libraryId || !docId) {
    return failure('Usage: el library add <library-id> <document-id>', ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    const actor = resolveActor(options);

    // Verify library exists
    const library = await api.get<Library>(libraryId as ElementId);
    if (!library) {
      return failure(`Library not found: ${libraryId}`, ExitCode.NOT_FOUND);
    }
    if (library.type !== 'library') {
      return failure(`Element ${libraryId} is not a library (type: ${library.type})`, ExitCode.VALIDATION);
    }

    // Verify document exists
    const doc = await api.get<Element>(docId as ElementId);
    if (!doc) {
      return failure(`Document not found: ${docId}`, ExitCode.NOT_FOUND);
    }
    if (doc.type !== 'document') {
      return failure(`Element ${docId} is not a document (type: ${doc.type})`, ExitCode.VALIDATION);
    }

    // Add parent-child dependency (library is parent, document is child)
    await api.addDependency({
      sourceId: libraryId as ElementId,
      targetId: docId as ElementId,
      type: 'parent-child',
      actor,
    });

    return success(
      { libraryId, docId },
      `Added document ${docId} to library ${libraryId}`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to add document: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

const libraryAddCommand: Command = {
  name: 'add',
  description: 'Add document to library',
  usage: 'el library add <library-id> <document-id>',
  help: `Add a document to a library.

Arguments:
  library-id    Library identifier
  document-id   Document identifier to add

Examples:
  el library add el-lib123 el-doc456`,
  handler: libraryAddHandler as Command['handler'],
};

// ============================================================================
// Library Remove Command
// ============================================================================

async function libraryRemoveHandler(
  args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  const [libraryId, docId] = args;

  if (!libraryId || !docId) {
    return failure('Usage: el library remove <library-id> <document-id>', ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    // Remove parent-child dependency
    await api.removeDependency(
      libraryId as ElementId,
      docId as ElementId,
      'parent-child'
    );

    return success(
      { libraryId, docId },
      `Removed document ${docId} from library ${libraryId}`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to remove document: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

const libraryRemoveCommand: Command = {
  name: 'remove',
  description: 'Remove document from library',
  usage: 'el library remove <library-id> <document-id>',
  help: `Remove a document from a library.

Arguments:
  library-id    Library identifier
  document-id   Document identifier to remove

Examples:
  el library remove el-lib123 el-doc456`,
  handler: libraryRemoveHandler as Command['handler'],
};

// ============================================================================
// Library Root Command
// ============================================================================

export const libraryCommand: Command = {
  name: 'library',
  description: 'Manage libraries (document collections)',
  usage: 'el library <subcommand> [options]',
  help: `Manage libraries - collections of related documents.

Libraries organize documents for knowledge bases, documentation, and
content management. Documents can belong to multiple libraries.

Subcommands:
  create   Create a new library
  list     List libraries
  add      Add document to library
  remove   Remove document from library

Examples:
  el library create --name "API Documentation"
  el library list
  el library add el-lib123 el-doc456
  el library remove el-lib123 el-doc456`,
  subcommands: {
    create: libraryCreateCommand,
    list: libraryListCommand,
    add: libraryAddCommand,
    remove: libraryRemoveCommand,
  },
  handler: async (args, options): Promise<CommandResult> => {
    // Default to list if no subcommand
    if (args.length === 0) {
      return libraryListHandler(args, options);
    }
    return failure(
      `Unknown subcommand: ${args[0]}. Use 'el library --help' for available subcommands.`,
      ExitCode.INVALID_ARGUMENTS
    );
  },
};

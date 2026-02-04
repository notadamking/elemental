/**
 * Embeddings Commands - Manage document embeddings for semantic search
 *
 * Provides CLI commands for embedding operations:
 * - embeddings install: Download the local embedding model
 * - embeddings status: Show embedding configuration and model availability
 * - embeddings reindex: Re-embed all documents
 * - embeddings search: Semantic search (for testing)
 */

import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Command, GlobalOptions, CommandResult } from '../types.js';
import { success, failure, ExitCode } from '../types.js';
import { getOutputMode } from '../formatter.js';
import { createStorage, initializeSchema } from '@elemental/storage';
import { createElementalAPI } from '../../api/elemental-api.js';
import { DocumentStatus, type Document, type ElementId } from '@elemental/core';
import type { ElementalAPI } from '../../api/types.js';
import { EmbeddingService } from '../../services/embeddings/service.js';
import { LocalEmbeddingProvider } from '../../services/embeddings/local-provider.js';
import { OPERATOR_ENTITY_ID } from './init.js';

// ============================================================================
// Constants
// ============================================================================

const ELEMENTAL_DIR = '.elemental';
const DEFAULT_DB_NAME = 'elemental.db';
const MODELS_DIR = 'models';
const DEFAULT_MODEL = 'bge-base-en-v1.5';

// ============================================================================
// Helpers
// ============================================================================

function createAPI(options: GlobalOptions): { api: ElementalAPI; error?: string } {
  const dbPath = options.db ?? join(process.cwd(), ELEMENTAL_DIR, DEFAULT_DB_NAME);
  if (!existsSync(dbPath)) {
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

function createEmbeddingService(options: GlobalOptions): { service: EmbeddingService; error?: string } {
  const dbPath = options.db ?? join(process.cwd(), ELEMENTAL_DIR, DEFAULT_DB_NAME);
  if (!existsSync(dbPath)) {
    return {
      service: null as unknown as EmbeddingService,
      error: 'No database found. Run "el init" to initialize a workspace',
    };
  }

  try {
    const backend = createStorage({ path: dbPath, create: true });
    initializeSchema(backend);
    const provider = new LocalEmbeddingProvider();
    return { service: new EmbeddingService(backend, { provider }) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      service: null as unknown as EmbeddingService,
      error: `Failed to initialize embedding service: ${message}`,
    };
  }
}

// ============================================================================
// Embeddings Install Command
// ============================================================================

async function embeddingsInstallHandler(
  _args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  const modelDir = join(process.cwd(), ELEMENTAL_DIR, MODELS_DIR, DEFAULT_MODEL);

  if (existsSync(modelDir)) {
    return success(null, `Model ${DEFAULT_MODEL} is already installed at ${modelDir}`);
  }

  try {
    // Create model directory (placeholder for actual model download)
    mkdirSync(modelDir, { recursive: true });

    // TODO: Download actual ONNX model files
    // For now, just create the directory to mark as "installed"

    const mode = getOutputMode(options);
    if (mode === 'json') {
      return success({ model: DEFAULT_MODEL, path: modelDir, status: 'installed' });
    }

    return success(
      null,
      `Installed embedding model ${DEFAULT_MODEL} at ${modelDir}\n` +
      `Note: Using placeholder implementation. ONNX model download will be added in a future release.`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to install embedding model: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

const embeddingsInstallCommand: Command = {
  name: 'install',
  description: 'Download the local embedding model',
  usage: 'el embeddings install',
  help: `Download and install the local embedding model (bge-base-en-v1.5).

The model is stored in .elemental/models/ and used for semantic search.

Examples:
  el embeddings install`,
  handler: embeddingsInstallHandler as Command['handler'],
};

// ============================================================================
// Embeddings Status Command
// ============================================================================

async function embeddingsStatusHandler(
  _args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  const modelDir = join(process.cwd(), ELEMENTAL_DIR, MODELS_DIR, DEFAULT_MODEL);
  const modelInstalled = existsSync(modelDir);

  const { service, error } = createEmbeddingService(options);

  const status = {
    model: DEFAULT_MODEL,
    modelInstalled,
    modelPath: modelDir,
    provider: service ? service.getProviderInfo() : null,
    available: service ? await service.isAvailable() : false,
    error: error ?? null,
  };

  const mode = getOutputMode(options);
  if (mode === 'json') {
    return success(status);
  }

  const lines = [
    `Model: ${status.model}`,
    `Installed: ${status.modelInstalled ? 'Yes' : 'No'}`,
    `Path: ${status.modelPath}`,
    `Available: ${status.available ? 'Yes' : 'No'}`,
  ];

  if (status.provider) {
    lines.push(`Provider: ${status.provider.name} (${status.provider.dimensions}d, ${status.provider.isLocal ? 'local' : 'remote'})`);
  }

  if (status.error) {
    lines.push(`Error: ${status.error}`);
  }

  if (!status.modelInstalled) {
    lines.push(`\nRun 'el embeddings install' to download the model.`);
  }

  return success(status, lines.join('\n'));
}

const embeddingsStatusCommand: Command = {
  name: 'status',
  description: 'Show embedding configuration and model availability',
  usage: 'el embeddings status',
  help: `Show the current embedding configuration and model status.

Examples:
  el embeddings status`,
  handler: embeddingsStatusHandler as Command['handler'],
};

// ============================================================================
// Embeddings Reindex Command
// ============================================================================

async function embeddingsReindexHandler(
  _args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  const { service, error: serviceError } = createEmbeddingService(options);
  if (serviceError) {
    return failure(serviceError, ExitCode.GENERAL_ERROR);
  }

  const available = await service.isAvailable();
  if (!available) {
    return failure(
      `Embedding model not installed. Run 'el embeddings install' first.`,
      ExitCode.GENERAL_ERROR
    );
  }

  const { api, error: apiError } = createAPI(options);
  if (apiError) {
    return failure(apiError, ExitCode.GENERAL_ERROR);
  }

  try {
    // Get all documents (including archived)
    const result = await api.listPaginated<Document>({
      type: 'document',
      limit: 10000,
      status: [DocumentStatus.ACTIVE, DocumentStatus.ARCHIVED],
    } as Record<string, unknown>);

    const documents = result.items.map((doc) => ({
      id: doc.id,
      content: `${doc.title ?? ''} ${doc.content}`.trim(),
    }));

    const { indexed, errors } = await service.reindexAll(documents);

    const mode = getOutputMode(options);
    if (mode === 'json') {
      return success({ indexed, errors, total: documents.length });
    }

    return success(
      null,
      `Re-embedded ${indexed} documents${errors > 0 ? ` (${errors} errors)` : ''}`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to reindex embeddings: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

const embeddingsReindexCommand: Command = {
  name: 'reindex',
  description: 'Re-embed all documents',
  usage: 'el embeddings reindex',
  help: `Re-generate embeddings for all documents.

Requires the embedding model to be installed first.

Examples:
  el embeddings reindex`,
  handler: embeddingsReindexHandler as Command['handler'],
};

// ============================================================================
// Embeddings Search Command
// ============================================================================

async function embeddingsSearchHandler(
  args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  const query = args.join(' ');

  if (!query.trim()) {
    return failure('Usage: el embeddings search <query>', ExitCode.INVALID_ARGUMENTS);
  }

  const { service, error: serviceError } = createEmbeddingService(options);
  if (serviceError) {
    return failure(serviceError, ExitCode.GENERAL_ERROR);
  }

  const available = await service.isAvailable();
  if (!available) {
    return failure(
      `Embedding model not installed. Run 'el embeddings install' first.`,
      ExitCode.GENERAL_ERROR
    );
  }

  try {
    const results = await service.searchSemantic(query.trim(), 10);

    const mode = getOutputMode(options);
    if (mode === 'json') {
      return success(results);
    }

    if (results.length === 0) {
      return success(null, 'No results found');
    }

    const lines = results.map((r, i) =>
      `${i + 1}. ${r.documentId} (similarity: ${r.similarity.toFixed(4)})`
    );

    return success(results, lines.join('\n'));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to search embeddings: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

const embeddingsSearchCommand: Command = {
  name: 'search',
  description: 'Semantic search (for testing)',
  usage: 'el embeddings search <query>',
  help: `Perform a semantic search over document embeddings.

This command is primarily for testing. Use 'el doc search' for production search.

Examples:
  el embeddings search "authentication flow"
  el embeddings search "database migration"`,
  handler: embeddingsSearchHandler as Command['handler'],
};

// ============================================================================
// Embeddings Root Command
// ============================================================================

export const embeddingsCommand: Command = {
  name: 'embeddings',
  description: 'Manage document embeddings for semantic search',
  usage: 'el embeddings <subcommand>',
  help: `Manage document embeddings for semantic search.

Embeddings enable semantic (meaning-based) search in addition to keyword search.
A local embedding model generates vector representations of document content.

Subcommands:
  install   Download the local embedding model
  status    Show configuration and model availability
  reindex   Re-embed all documents
  search    Semantic search (for testing)

Examples:
  el embeddings install
  el embeddings status
  el embeddings reindex
  el embeddings search "how to deploy"`,
  subcommands: {
    install: embeddingsInstallCommand,
    status: embeddingsStatusCommand,
    reindex: embeddingsReindexCommand,
    search: embeddingsSearchCommand,
  },
  handler: async (args, _options): Promise<CommandResult> => {
    if (args.length === 0) {
      return failure(
        `Usage: el embeddings <subcommand>. Use 'el embeddings --help' for available subcommands.`,
        ExitCode.INVALID_ARGUMENTS
      );
    }
    return failure(
      `Unknown subcommand: ${args[0]}. Use 'el embeddings --help' for available subcommands.`,
      ExitCode.INVALID_ARGUMENTS
    );
  },
};

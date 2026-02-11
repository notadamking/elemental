/**
 * OpenCode Server Manager (Singleton)
 *
 * Manages the lifecycle of a single shared OpenCode server process.
 * Multiple sessions share one server; ref counting shuts it down
 * when the last session releases.
 *
 * @module
 */

// ============================================================================
// Internal Types (our interface into the SDK)
// ============================================================================

/** Session object from the SDK */
export interface OpencodeSession {
  id: string;
  projectID?: string;
  directory?: string;
}

/** SDK response wrapper — all SDK methods return { data, error, request, response } */
export interface SdkResponse<T> {
  data: T | undefined;
  error?: unknown;
}

/** SSE subscribe result — returns { stream: AsyncGenerator<Event> } */
export interface SseSubscribeResult {
  stream: AsyncIterable<unknown>;
}

/** Text part input for prompts */
export interface TextPartInput {
  type: 'text';
  text: string;
}

/** Model information from OpenCode SDK */
export interface OpencodeModel {
  id: string;
  providerID: string;
  name: string;
}

/** Provider information from OpenCode SDK */
export interface OpencodeProvider {
  id: string;
  name: string;
  models: Record<string, OpencodeModel>;
}

/** Response from config.providers() */
export interface ConfigProvidersResponse {
  providers: OpencodeProvider[];
  default: Record<string, string>;
}

/** Model specification for promptAsync */
export interface ModelSpec {
  providerID: string;
  modelID: string;
}

/** Minimal OpenCode client shape matching the real SDK response wrappers */
export interface OpencodeClient {
  session: {
    create(opts: { body: { title?: string } }): Promise<SdkResponse<OpencodeSession>>;
    get(opts: { path: { id: string } }): Promise<SdkResponse<OpencodeSession>>;
    abort(opts: { path: { id: string } }): Promise<SdkResponse<unknown>>;
    promptAsync(opts: {
      path: { id: string };
      body: { parts: TextPartInput[]; model?: ModelSpec };
    }): Promise<SdkResponse<void>>;
  };
  event: {
    subscribe(): Promise<SseSubscribeResult>;
  };
  config: {
    providers(): Promise<SdkResponse<ConfigProvidersResponse>>;
  };
}

/** Minimal OpenCode server shape */
interface OpencodeServer {
  close(): void;
}

// ============================================================================
// Server Manager
// ============================================================================

export interface ServerManagerConfig {
  port?: number;
  cwd?: string;
  elementalRoot?: string;
}

/**
 * Manages a single shared OpenCode server instance.
 *
 * - `acquire()` starts or reuses the server, increments ref count
 * - `release()` decrements ref count, stops server at zero
 * - Concurrent acquire() calls are coalesced into a single startup
 */
class OpenCodeServerManager {
  private client: OpencodeClient | null = null;
  private server: OpencodeServer | null = null;
  private refCount = 0;
  private startPromise: Promise<OpencodeClient> | null = null;

  async acquire(config?: ServerManagerConfig): Promise<OpencodeClient> {
    this.refCount++;

    if (this.client) {
      return this.client;
    }

    // Coalesce concurrent startup requests
    if (this.startPromise) {
      return this.startPromise;
    }

    this.startPromise = this.startServer(config);

    try {
      const client = await this.startPromise;
      return client;
    } catch (error) {
      this.refCount--;
      this.startPromise = null;
      throw error;
    }
  }

  release(): void {
    this.refCount = Math.max(0, this.refCount - 1);
    if (this.refCount === 0) {
      this.shutdown();
    }
  }

  shutdown(): void {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
    this.client = null;
    this.startPromise = null;
    this.refCount = 0;
  }

  /**
   * List all available models from OpenCode providers.
   * Each model ID is formatted as `providerID/modelID`.
   * @returns Flattened array of models with composite IDs
   */
  async listModels(
    config?: ServerManagerConfig
  ): Promise<Array<{ id: string; displayName: string; description?: string }>> {
    const client = await this.acquire(config);

    try {
      const response = await client.config.providers();

      if (!response.data?.providers) {
        return [];
      }

      const models: Array<{ id: string; displayName: string; description?: string }> = [];

      for (const provider of response.data.providers) {
        if (!provider.models) continue;

        for (const [modelKey, model] of Object.entries(provider.models)) {
          // Format ID as providerID/modelID
          const id = `${provider.id}/${modelKey}`;
          models.push({
            id,
            displayName: model.name || modelKey,
            description: undefined, // OpenCode SDK doesn't provide model descriptions
          });
        }
      }

      return models;
    } finally {
      this.release();
    }
  }

  private async startServer(config?: ServerManagerConfig): Promise<OpencodeClient> {
    const createOpencode = await this.loadSDK();

    const env: Record<string, string> = {
      ...(process.env as Record<string, string>),
      OPENCODE_PERMISSION: JSON.stringify({ '*': 'allow' }),
      OPENCODE_CLIENT: 'elemental',
    };
    if (config?.elementalRoot) {
      env.ELEMENTAL_ROOT = config.elementalRoot;
    }

    const result = await createOpencode({
      port: config?.port ?? 0,
      cwd: config?.cwd,
      env,
    });

    // The SDK returns richer types; we extract what we need
    this.client = result.client as unknown as OpencodeClient;
    this.server = result.server as unknown as OpencodeServer;
    this.startPromise = null;

    return this.client;
  }

  private async loadSDK(): Promise<(...args: unknown[]) => Promise<{ client: unknown; server: unknown }>> {
    try {
      const sdk = await import('@opencode-ai/sdk');
      return sdk.createOpencode as (...args: unknown[]) => Promise<{ client: unknown; server: unknown }>;
    } catch {
      throw new Error(
        'OpenCode SDK is not installed. Install it with: npm install @opencode-ai/sdk'
      );
    }
  }
}

/** Singleton instance */
export const serverManager = new OpenCodeServerManager();

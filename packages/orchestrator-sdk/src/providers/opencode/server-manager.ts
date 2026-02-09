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
// SDK Types (loosely typed to avoid hard dependency)
// ============================================================================

/** Minimal OpenCode client shape */
interface OpencodeClient {
  session: {
    create(opts: { body: { title?: string } }): Promise<{ id: string }>;
    get(opts: { path: { id: string } }): Promise<{ id: string }>;
    abort(opts: { path: { id: string } }): Promise<void>;
    prompt(opts: { path: { id: string }; body: { content: string } }): Promise<void>;
  };
  event: {
    subscribe(): Promise<AsyncIterable<unknown>>;
  };
  url: string;
}

/** Minimal OpenCode server shape */
interface OpencodeServer {
  stop(): Promise<void>;
}

/** The createOpencode() function signature */
type CreateOpencodeFunction = (options?: {
  port?: number;
  cwd?: string;
  env?: Record<string, string>;
}) => Promise<{ client: OpencodeClient; server: OpencodeServer }>;

// ============================================================================
// Server Manager
// ============================================================================

export interface ServerManagerConfig {
  port?: number;
  cwd?: string;
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
      this.server.stop().catch(() => {});
      this.server = null;
    }
    this.client = null;
    this.startPromise = null;
    this.refCount = 0;
  }

  private async startServer(config?: ServerManagerConfig): Promise<OpencodeClient> {
    const createOpencode = await this.loadSDK();

    const env: Record<string, string> = {
      ...(process.env as Record<string, string>),
      OPENCODE_PERMISSION: JSON.stringify({ '*': 'allow' }),
      OPENCODE_CLIENT: 'elemental',
    };

    const { client, server } = await createOpencode({
      port: config?.port ?? 0,
      cwd: config?.cwd,
      env,
    });

    this.client = client;
    this.server = server;
    this.startPromise = null;

    return client;
  }

  private async loadSDK(): Promise<CreateOpencodeFunction> {
    try {
      // @ts-expect-error - optional dependency, checked at runtime
      const sdk = await import('@opencode-ai/sdk');
      return sdk.createOpencode as CreateOpencodeFunction;
    } catch {
      throw new Error(
        'OpenCode SDK is not installed. Install it with: npm install @opencode-ai/sdk'
      );
    }
  }
}

/** Singleton instance */
export const serverManager = new OpenCodeServerManager();

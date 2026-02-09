/**
 * OpenCode Headless Provider
 *
 * Implements the HeadlessProvider interface using the OpenCode SDK.
 * Manages a shared server, creates sessions, and maps SSE events
 * to the AgentMessage stream.
 *
 * @module
 */

import type {
  HeadlessProvider,
  HeadlessSession,
  HeadlessSpawnOptions,
  AgentMessage,
  ProviderSessionId,
} from '../types.js';
import { AsyncQueue } from './async-queue.js';
import { OpenCodeEventMapper } from './event-mapper.js';
import type { OpenCodeEvent } from './event-mapper.js';
import { serverManager } from './server-manager.js';
import type { OpencodeClient } from './server-manager.js';

// ============================================================================
// OpenCode Headless Session
// ============================================================================

class OpenCodeHeadlessSession implements HeadlessSession {
  private client: OpencodeClient;
  private sessionId: string;
  private eventMapper: OpenCodeEventMapper;
  private messageQueue: AsyncQueue<AgentMessage>;
  private closed = false;

  constructor(
    client: OpencodeClient,
    sessionId: string,
    eventSubscription: AsyncIterable<unknown>
  ) {
    this.client = client;
    this.sessionId = sessionId;
    this.eventMapper = new OpenCodeEventMapper();
    this.messageQueue = new AsyncQueue<AgentMessage>();

    // Start background event processor (fire-and-forget)
    this.processEvents(eventSubscription);
  }

  sendMessage(content: string): void {
    if (this.closed) return;

    // Fire-and-forget: SSE events drive the message stream
    this.client.session
      .prompt({
        path: { id: this.sessionId },
        body: { content },
      })
      .catch((error) => {
        this.messageQueue.push({
          type: 'error',
          content: error instanceof Error ? error.message : String(error),
          raw: error,
        });
      });
  }

  [Symbol.asyncIterator](): AsyncIterator<AgentMessage> {
    return this.messageQueue[Symbol.asyncIterator]();
  }

  async interrupt(): Promise<void> {
    await this.client.session.abort({ path: { id: this.sessionId } });
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.messageQueue.close();
    serverManager.release();
  }

  getSessionId(): ProviderSessionId | undefined {
    return this.sessionId;
  }

  /** Injects a synthetic system init message (OpenCode has no equivalent) */
  injectInitMessage(): void {
    this.messageQueue.push({
      type: 'system',
      subtype: 'init',
      sessionId: this.sessionId,
      raw: { synthetic: true, provider: 'opencode' },
    });
  }

  // ----------------------------------------
  // Private
  // ----------------------------------------

  private async processEvents(eventSubscription: AsyncIterable<unknown>): Promise<void> {
    try {
      for await (const rawEvent of eventSubscription) {
        if (this.closed) break;

        const event = rawEvent as OpenCodeEvent;
        const agentMessages = this.eventMapper.mapEvent(event, this.sessionId);

        for (const msg of agentMessages) {
          this.messageQueue.push(msg);
        }
      }
    } catch (error) {
      if (!this.closed) {
        this.messageQueue.push({
          type: 'error',
          content: error instanceof Error ? error.message : String(error),
          raw: error,
        });
      }
    }
  }
}

// ============================================================================
// OpenCode Headless Provider
// ============================================================================

export interface OpenCodeHeadlessConfig {
  port?: number;
}

/**
 * OpenCode headless provider using @opencode-ai/sdk.
 * Manages a shared server and creates sessions on demand.
 */
export class OpenCodeHeadlessProvider implements HeadlessProvider {
  readonly name = 'opencode-headless';
  private config?: OpenCodeHeadlessConfig;

  constructor(config?: OpenCodeHeadlessConfig) {
    this.config = config;
  }

  async spawn(options: HeadlessSpawnOptions): Promise<HeadlessSession> {
    // 1. Acquire server client
    const client = await serverManager.acquire({
      port: this.config?.port,
      cwd: options.workingDirectory,
    });

    let sessionId: string;

    try {
      // 2. Create or resume session
      if (options.resumeSessionId) {
        // Verify session exists
        await client.session.get({ path: { id: options.resumeSessionId } });
        sessionId = options.resumeSessionId;
      } else {
        const session = await client.session.create({
          body: { title: options.initialPrompt?.slice(0, 100) || 'Elemental Agent' },
        });
        sessionId = session.id;
      }

      // 3. Subscribe to SSE events
      const events = await client.event.subscribe();

      // 4. Create session object
      const headlessSession = new OpenCodeHeadlessSession(client, sessionId, events);

      // 5. Synthesize system init message
      headlessSession.injectInitMessage();

      // 6. Send initial prompt
      if (options.initialPrompt) {
        headlessSession.sendMessage(options.initialPrompt);
      }

      return headlessSession;
    } catch (error) {
      // Release on failure
      serverManager.release();
      throw error;
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      await import('@opencode-ai/sdk');
      return true;
    } catch {
      return false;
    }
  }
}

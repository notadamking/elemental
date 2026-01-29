/**
 * SDK Adapter
 *
 * This module provides an adapter for integrating the Claude Agent SDK
 * (when available) with the orchestrator's session management.
 *
 * Features:
 * - Message queue for sending messages while agent is busy
 * - Async iterable input for streaming messages to the SDK
 * - Interrupt handling
 *
 * NOTE: This is a scaffolded implementation. When the actual
 * @anthropic-ai/claude-agent-sdk package becomes available, update
 * the imports and implementation to use the real SDK.
 *
 * @module
 */

import { EventEmitter } from 'node:events';
import { createTimestamp } from '@elemental/core';
import type { SpawnedSessionEvent, StreamJsonEventType } from './spawner.js';

// ============================================================================
// Types
// ============================================================================

/**
 * SDK user message format
 */
export interface SDKUserMessage {
  role: 'user';
  content: string;
}

/**
 * Options for creating an SDK session
 */
export interface SDKSessionOptions {
  /** Working directory for the session */
  cwd: string;
  /** Model to use (defaults to claude-sonnet-4-20250514) */
  model?: string;
  /** Permission mode: bypass or default */
  permissionMode?: 'bypassPermissions' | 'default';
  /** Maximum number of turns before stopping */
  maxTurns?: number;
  /** Environment variables */
  environmentVariables?: Record<string, string>;
}

/**
 * SDK session interface
 */
export interface SDKSession {
  /** Session ID */
  id: string;
  /** Send a message to the agent */
  sendMessage(content: string): void;
  /** Interrupt the current operation */
  interrupt(): Promise<void>;
  /** Check if the agent is currently processing */
  isProcessing(): boolean;
  /** Close the session */
  close(): void;
  /** Event emitter for session events */
  events: EventEmitter;
}

// ============================================================================
// Message Queue
// ============================================================================

/**
 * Message queue for buffering messages while the agent is busy.
 * Implements async iterable for streaming input to the SDK.
 */
export class MessageQueue {
  private queue: SDKUserMessage[] = [];
  private waitingResolve: ((value: SDKUserMessage) => void) | null = null;
  private closed = false;

  /**
   * Push a message to the queue.
   * If someone is waiting, resolve immediately.
   */
  push(message: SDKUserMessage): void {
    if (this.closed) {
      throw new Error('Queue is closed');
    }

    if (this.waitingResolve) {
      this.waitingResolve(message);
      this.waitingResolve = null;
    } else {
      this.queue.push(message);
    }
  }

  /**
   * Close the queue. No more messages can be added.
   */
  close(): void {
    this.closed = true;
    if (this.waitingResolve) {
      // Signal end by resolving with a special message
      this.waitingResolve = null;
    }
  }

  /**
   * Check if the queue has pending messages.
   */
  hasPending(): boolean {
    return this.queue.length > 0;
  }

  /**
   * Get the number of pending messages.
   */
  get length(): number {
    return this.queue.length;
  }

  /**
   * Async iterator for consuming messages from the queue.
   */
  async *[Symbol.asyncIterator](): AsyncGenerator<SDKUserMessage> {
    while (!this.closed) {
      if (this.queue.length > 0) {
        yield this.queue.shift()!;
      } else {
        // Wait for the next message
        const message = await new Promise<SDKUserMessage | null>((resolve) => {
          this.waitingResolve = resolve as (value: SDKUserMessage) => void;

          // Check if we were closed while setting up the promise
          if (this.closed) {
            resolve(null);
          }
        });

        if (message === null || this.closed) {
          break;
        }

        yield message;
      }
    }

    // Drain any remaining messages
    while (this.queue.length > 0) {
      yield this.queue.shift()!;
    }
  }
}

// ============================================================================
// SDK Session Implementation (Stub)
// ============================================================================

/**
 * Creates an SDK session.
 *
 * NOTE: This is a stub implementation that emits placeholder events.
 * When the actual SDK is available, this should be replaced with
 * real SDK integration.
 *
 * @param initialPrompt - Initial prompt to send to the agent
 * @param options - Session options
 * @returns SDK session instance
 */
export function createSDKSession(
  initialPrompt: string,
  options: SDKSessionOptions
): SDKSession {
  const id = generateSessionId();
  const events = new EventEmitter();
  const messageQueue = new MessageQueue();
  let processing = false;
  let closed = false;

  // Process initial prompt
  if (initialPrompt) {
    messageQueue.push({ role: 'user', content: initialPrompt });
  }

  // Emit a system init event
  setTimeout(() => {
    if (!closed) {
      const initEvent: SpawnedSessionEvent = {
        type: 'system',
        subtype: 'init',
        receivedAt: createTimestamp(),
        raw: {
          type: 'system',
          subtype: 'init',
          session_id: id,
        },
      };
      events.emit('event', initEvent);
    }
  }, 100);

  const session: SDKSession = {
    id,
    events,

    sendMessage(content: string): void {
      if (closed) {
        throw new Error('Session is closed');
      }
      messageQueue.push({ role: 'user', content });

      // Emit a user event
      const userEvent: SpawnedSessionEvent = {
        type: 'user' as StreamJsonEventType,
        receivedAt: createTimestamp(),
        raw: {
          type: 'user',
          message: content,
        },
        message: content,
      };
      events.emit('event', userEvent);
    },

    async interrupt(): Promise<void> {
      if (processing) {
        processing = false;
        events.emit('interrupt');
      }
    },

    isProcessing(): boolean {
      return processing;
    },

    close(): void {
      if (!closed) {
        closed = true;
        messageQueue.close();
        events.emit('exit', 0, null);
      }
    },
  };

  // Store options for potential future use
  void options;

  return session;
}

// ============================================================================
// Helper Functions
// ============================================================================

let sessionCounter = 0;

function generateSessionId(): string {
  sessionCounter++;
  const timestamp = Date.now().toString(36);
  const counter = sessionCounter.toString(36).padStart(4, '0');
  const random = Math.random().toString(36).slice(2, 6);
  return `sdk-session-${timestamp}-${counter}-${random}`;
}

// ============================================================================
// Export Types
// ============================================================================

export type { SpawnedSessionEvent } from './spawner.js';

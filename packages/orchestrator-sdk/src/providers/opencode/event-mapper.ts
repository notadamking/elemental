/**
 * OpenCode Event Mapper
 *
 * Maps OpenCode SSE events to the provider-agnostic AgentMessage interface.
 * Handles deduplication of tool_use/tool_result events and text delta streaming.
 *
 * Types here mirror the real @opencode-ai/sdk event shapes:
 * - ToolPart.state is an object with `status` + nested `input`/`output`/`error`
 * - TextPart has `text` but delta comes from `event.properties.delta`
 * - Tool name lives in `ToolPart.tool`, not `ToolPart.name`
 *
 * @module
 */

import type { AgentMessage } from '../types.js';

// ============================================================================
// OpenCode Event Types (matching @opencode-ai/sdk v1.x)
// ============================================================================

/** Tool state objects — the `state` field on ToolPart is a discriminated union */
interface ToolStatePending {
  status: 'pending';
  input: Record<string, unknown>;
}

interface ToolStateRunning {
  status: 'running';
  input: Record<string, unknown>;
  title?: string;
}

interface ToolStateCompleted {
  status: 'completed';
  input: Record<string, unknown>;
  output: string;
  title: string;
}

interface ToolStateError {
  status: 'error';
  input: Record<string, unknown>;
  error: string;
}

type ToolState = ToolStatePending | ToolStateRunning | ToolStateCompleted | ToolStateError;

/** Part types emitted by OpenCode */
interface TextPart {
  type: 'text';
  id: string;
  sessionID: string;
  text: string;
}

interface ToolPart {
  type: 'tool';
  id: string;
  sessionID: string;
  callID: string;
  tool: string;
  state: ToolState;
}

interface ReasoningPart {
  type: 'reasoning';
  id: string;
  sessionID: string;
}

interface StepStartPart {
  type: 'step-start';
  id: string;
  sessionID: string;
}

interface StepFinishPart {
  type: 'step-finish';
  id: string;
  sessionID: string;
}

interface AgentPart {
  type: 'agent';
  id: string;
  sessionID: string;
}

type OpenCodePart = TextPart | ReasoningPart | ToolPart | StepStartPart | StepFinishPart | AgentPart;

/** OpenCode SSE event structure */
export interface OpenCodeEvent {
  type: string;
  properties?: {
    sessionID?: string;
    /** Incremental text delta (only on message.part.updated for TextPart) */
    delta?: string;
    part?: OpenCodePart & { sessionID?: string };
    info?: { id?: string };
    /** Structured error object (on session.error events) */
    error?: { message?: string; type?: string } | string;
    status?: unknown;
    [key: string]: unknown;
  };
}

// ============================================================================
// Event Mapper
// ============================================================================

/**
 * Maps OpenCode SSE events to AgentMessage arrays.
 *
 * Tracks emitted tool IDs to avoid duplicate tool_use/tool_result messages
 * when OpenCode fires multiple `message.part.updated` events for the same tool
 * as it transitions through states.
 */
export class OpenCodeEventMapper {
  private emittedToolUses = new Set<string>();
  private emittedToolResults = new Set<string>();

  /**
   * Maps an OpenCode SSE event to zero or more AgentMessages.
   *
   * @param event - The raw OpenCode SSE event
   * @param sessionId - Our session ID for filtering
   * @returns Array of AgentMessages (may be empty)
   */
  mapEvent(event: OpenCodeEvent, sessionId: string): AgentMessage[] {
    // Filter events by session ID
    const eventSessionId = this.extractSessionId(event);
    if (eventSessionId && eventSessionId !== sessionId) {
      return [];
    }

    switch (event.type) {
      case 'message.part.updated':
        return this.mapPartUpdated(event);

      case 'session.idle':
        return [{
          type: 'result',
          subtype: 'success',
          raw: event,
        }];

      case 'session.error':
        return [{
          type: 'error',
          content: this.extractErrorMessage(event.properties?.error),
          raw: event,
        }];

      // Internal state events - no AgentMessage needed
      case 'session.status':
      case 'message.updated':
        return [];

      default:
        return [];
    }
  }

  /** Reset state for a new conversation turn */
  reset(): void {
    this.emittedToolUses.clear();
    this.emittedToolResults.clear();
  }

  // ----------------------------------------
  // Private
  // ----------------------------------------

  private extractSessionId(event: OpenCodeEvent): string | undefined {
    return event.properties?.sessionID
      ?? event.properties?.part?.sessionID
      ?? event.properties?.info?.id;
  }

  private extractErrorMessage(error: unknown): string {
    if (!error) return 'Unknown session error';
    if (typeof error === 'string') return error;
    if (typeof error === 'object' && error !== null) {
      const obj = error as Record<string, unknown>;
      if (typeof obj.message === 'string') return obj.message;
      if (typeof obj.type === 'string') return obj.type;
    }
    return String(error);
  }

  private mapPartUpdated(event: OpenCodeEvent): AgentMessage[] {
    const part = event.properties?.part;
    if (!part) return [];

    switch (part.type) {
      case 'text':
        return this.mapTextPart(part as TextPart, event);

      case 'tool':
        return this.mapToolPart(part as ToolPart, event);

      // Skip internal parts
      case 'reasoning':
      case 'step-start':
      case 'step-finish':
      case 'agent':
        return [];

      default:
        return [];
    }
  }

  private mapTextPart(part: TextPart, event: OpenCodeEvent): AgentMessage[] {
    // Delta is at event.properties.delta (not on the part itself)
    const content = event.properties?.delta ?? part.text;
    if (!content) return [];

    return [{
      type: 'assistant',
      content,
      raw: event,
    }];
  }

  private mapToolPart(part: ToolPart, event: OpenCodeEvent): AgentMessage[] {
    const partId = part.id;
    if (!partId) return [];

    const status = part.state?.status;
    const messages: AgentMessage[] = [];

    // Emit tool_use once when first seen (pending or running)
    if ((status === 'pending' || status === 'running') && !this.emittedToolUses.has(partId)) {
      this.emittedToolUses.add(partId);
      messages.push({
        type: 'tool_use',
        tool: {
          name: part.tool,
          id: partId,
          input: part.state?.input,
        },
        raw: event,
      });
    }

    // Emit tool_result once when completed or error
    if ((status === 'completed' || status === 'error') && !this.emittedToolResults.has(partId)) {
      this.emittedToolResults.add(partId);
      const resultContent = status === 'error'
        ? ((part.state as ToolStateError).error ?? 'Tool error')
        : ((part.state as ToolStateCompleted).output ?? '');
      messages.push({
        type: 'tool_result',
        content: resultContent,
        tool: { id: partId },
        raw: event,
      });
    }

    return messages;
  }
}

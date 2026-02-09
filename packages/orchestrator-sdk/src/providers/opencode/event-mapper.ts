/**
 * OpenCode Event Mapper
 *
 * Maps OpenCode SSE events to the provider-agnostic AgentMessage interface.
 * Handles deduplication of tool_use/tool_result events and text delta streaming.
 *
 * @module
 */

import type { AgentMessage } from '../types.js';

// ============================================================================
// OpenCode Event Types
// ============================================================================

/** Part types emitted by OpenCode */
interface TextPart {
  type: 'text';
  id?: string;
  text?: string;
  delta?: string;
}

interface ReasoningPart {
  type: 'reasoning';
  id?: string;
}

interface ToolPart {
  type: 'tool';
  id?: string;
  state?: 'pending' | 'running' | 'completed' | 'error';
  name?: string;
  input?: unknown;
  output?: string;
  error?: string;
}

interface StepStartPart {
  type: 'step-start';
}

interface StepFinishPart {
  type: 'step-finish';
}

interface AgentPart {
  type: 'agent';
}

type OpenCodePart = TextPart | ReasoningPart | ToolPart | StepStartPart | StepFinishPart | AgentPart;

/** OpenCode SSE event structure */
export interface OpenCodeEvent {
  type: string;
  properties?: {
    sessionID?: string;
    part?: OpenCodePart & { sessionID?: string };
    info?: { id?: string };
    error?: string;
    status?: string;
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
          content: event.properties?.error ?? 'Unknown session error',
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
    // Prefer delta (incremental) over full text
    const content = part.delta ?? part.text;
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

    const messages: AgentMessage[] = [];

    // Emit tool_use once when first seen (pending or running)
    if ((part.state === 'pending' || part.state === 'running') && !this.emittedToolUses.has(partId)) {
      this.emittedToolUses.add(partId);
      messages.push({
        type: 'tool_use',
        tool: {
          name: part.name,
          id: partId,
          input: part.input,
        },
        raw: event,
      });
    }

    // Emit tool_result once when completed or error
    if ((part.state === 'completed' || part.state === 'error') && !this.emittedToolResults.has(partId)) {
      this.emittedToolResults.add(partId);
      messages.push({
        type: 'tool_result',
        content: part.state === 'error' ? (part.error ?? 'Tool error') : (part.output ?? ''),
        tool: { id: partId },
        raw: event,
      });
    }

    return messages;
  }
}

/**
 * OpenCode Event Mapper Tests
 *
 * Tests for mapping OpenCode SSE events to AgentMessage format.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { OpenCodeEventMapper } from './event-mapper.js';
import type { OpenCodeEvent } from './event-mapper.js';

describe('OpenCodeEventMapper', () => {
  let mapper: OpenCodeEventMapper;
  const sessionId = 'test-session-123';

  beforeEach(() => {
    mapper = new OpenCodeEventMapper();
  });

  describe('session ID filtering', () => {
    it('should pass events with matching session ID', () => {
      const event: OpenCodeEvent = {
        type: 'message.part.updated',
        properties: {
          sessionID: sessionId,
          part: { type: 'text', delta: 'hello' },
        },
      };
      const messages = mapper.mapEvent(event, sessionId);
      expect(messages.length).toBe(1);
      expect(messages[0].type).toBe('assistant');
    });

    it('should filter events with different session ID', () => {
      const event: OpenCodeEvent = {
        type: 'message.part.updated',
        properties: {
          sessionID: 'other-session',
          part: { type: 'text', delta: 'hello' },
        },
      };
      const messages = mapper.mapEvent(event, sessionId);
      expect(messages.length).toBe(0);
    });

    it('should pass events without session ID', () => {
      const event: OpenCodeEvent = {
        type: 'message.part.updated',
        properties: {
          part: { type: 'text', delta: 'hello' },
        },
      };
      const messages = mapper.mapEvent(event, sessionId);
      expect(messages.length).toBe(1);
    });

    it('should extract session ID from part.sessionID', () => {
      const event: OpenCodeEvent = {
        type: 'message.part.updated',
        properties: {
          part: { type: 'text', delta: 'hello', sessionID: 'other-session' },
        },
      };
      const messages = mapper.mapEvent(event, sessionId);
      expect(messages.length).toBe(0);
    });

    it('should extract session ID from info.id', () => {
      const event: OpenCodeEvent = {
        type: 'session.idle',
        properties: {
          info: { id: sessionId },
        },
      };
      const messages = mapper.mapEvent(event, sessionId);
      expect(messages.length).toBe(1);
    });
  });

  describe('text parts', () => {
    it('should map text delta to assistant message', () => {
      const event: OpenCodeEvent = {
        type: 'message.part.updated',
        properties: {
          part: { type: 'text', delta: 'Hello world' },
        },
      };
      const messages = mapper.mapEvent(event, sessionId);
      expect(messages.length).toBe(1);
      expect(messages[0].type).toBe('assistant');
      expect(messages[0].content).toBe('Hello world');
    });

    it('should prefer delta over full text', () => {
      const event: OpenCodeEvent = {
        type: 'message.part.updated',
        properties: {
          part: { type: 'text', text: 'Full text', delta: 'delta only' },
        },
      };
      const messages = mapper.mapEvent(event, sessionId);
      expect(messages[0].content).toBe('delta only');
    });

    it('should fall back to full text when no delta', () => {
      const event: OpenCodeEvent = {
        type: 'message.part.updated',
        properties: {
          part: { type: 'text', text: 'Full text' },
        },
      };
      const messages = mapper.mapEvent(event, sessionId);
      expect(messages[0].content).toBe('Full text');
    });

    it('should skip text parts with no content', () => {
      const event: OpenCodeEvent = {
        type: 'message.part.updated',
        properties: {
          part: { type: 'text' },
        },
      };
      const messages = mapper.mapEvent(event, sessionId);
      expect(messages.length).toBe(0);
    });
  });

  describe('tool parts', () => {
    it('should emit tool_use on first pending state', () => {
      const event: OpenCodeEvent = {
        type: 'message.part.updated',
        properties: {
          part: {
            type: 'tool',
            id: 'tool-1',
            state: 'pending',
            name: 'read_file',
            input: { path: '/test' },
          },
        },
      };
      const messages = mapper.mapEvent(event, sessionId);
      expect(messages.length).toBe(1);
      expect(messages[0].type).toBe('tool_use');
      expect(messages[0].tool?.name).toBe('read_file');
      expect(messages[0].tool?.id).toBe('tool-1');
      expect(messages[0].tool?.input).toEqual({ path: '/test' });
    });

    it('should emit tool_use on first running state', () => {
      const event: OpenCodeEvent = {
        type: 'message.part.updated',
        properties: {
          part: {
            type: 'tool',
            id: 'tool-2',
            state: 'running',
            name: 'bash',
          },
        },
      };
      const messages = mapper.mapEvent(event, sessionId);
      expect(messages.length).toBe(1);
      expect(messages[0].type).toBe('tool_use');
    });

    it('should not duplicate tool_use for same part ID', () => {
      const event: OpenCodeEvent = {
        type: 'message.part.updated',
        properties: {
          part: { type: 'tool', id: 'tool-3', state: 'pending', name: 'test' },
        },
      };
      mapper.mapEvent(event, sessionId);

      // Same ID, still pending
      const messages2 = mapper.mapEvent(event, sessionId);
      expect(messages2.length).toBe(0);

      // Same ID, now running
      const runningEvent: OpenCodeEvent = {
        type: 'message.part.updated',
        properties: {
          part: { type: 'tool', id: 'tool-3', state: 'running', name: 'test' },
        },
      };
      const messages3 = mapper.mapEvent(runningEvent, sessionId);
      expect(messages3.length).toBe(0);
    });

    it('should emit tool_result on completed state', () => {
      // First emit tool_use
      mapper.mapEvent({
        type: 'message.part.updated',
        properties: {
          part: { type: 'tool', id: 'tool-4', state: 'pending', name: 'test' },
        },
      }, sessionId);

      // Now complete
      const event: OpenCodeEvent = {
        type: 'message.part.updated',
        properties: {
          part: { type: 'tool', id: 'tool-4', state: 'completed', output: 'done' },
        },
      };
      const messages = mapper.mapEvent(event, sessionId);
      expect(messages.length).toBe(1);
      expect(messages[0].type).toBe('tool_result');
      expect(messages[0].content).toBe('done');
      expect(messages[0].tool?.id).toBe('tool-4');
    });

    it('should emit tool_result with error content on error state', () => {
      mapper.mapEvent({
        type: 'message.part.updated',
        properties: {
          part: { type: 'tool', id: 'tool-5', state: 'running', name: 'test' },
        },
      }, sessionId);

      const event: OpenCodeEvent = {
        type: 'message.part.updated',
        properties: {
          part: { type: 'tool', id: 'tool-5', state: 'error', error: 'Permission denied' },
        },
      };
      const messages = mapper.mapEvent(event, sessionId);
      expect(messages.length).toBe(1);
      expect(messages[0].type).toBe('tool_result');
      expect(messages[0].content).toBe('Permission denied');
    });

    it('should not duplicate tool_result for same part ID', () => {
      mapper.mapEvent({
        type: 'message.part.updated',
        properties: {
          part: { type: 'tool', id: 'tool-6', state: 'pending', name: 'test' },
        },
      }, sessionId);

      const completedEvent: OpenCodeEvent = {
        type: 'message.part.updated',
        properties: {
          part: { type: 'tool', id: 'tool-6', state: 'completed', output: 'ok' },
        },
      };
      mapper.mapEvent(completedEvent, sessionId);

      // Second completed event for same ID
      const messages = mapper.mapEvent(completedEvent, sessionId);
      expect(messages.length).toBe(0);
    });

    it('should skip tool parts without an ID', () => {
      const event: OpenCodeEvent = {
        type: 'message.part.updated',
        properties: {
          part: { type: 'tool', state: 'pending', name: 'test' },
        },
      };
      const messages = mapper.mapEvent(event, sessionId);
      expect(messages.length).toBe(0);
    });
  });

  describe('skipped part types', () => {
    it('should skip reasoning parts', () => {
      const event: OpenCodeEvent = {
        type: 'message.part.updated',
        properties: {
          part: { type: 'reasoning' },
        },
      };
      expect(mapper.mapEvent(event, sessionId).length).toBe(0);
    });

    it('should skip step-start parts', () => {
      const event: OpenCodeEvent = {
        type: 'message.part.updated',
        properties: {
          part: { type: 'step-start' },
        },
      };
      expect(mapper.mapEvent(event, sessionId).length).toBe(0);
    });

    it('should skip step-finish parts', () => {
      const event: OpenCodeEvent = {
        type: 'message.part.updated',
        properties: {
          part: { type: 'step-finish' },
        },
      };
      expect(mapper.mapEvent(event, sessionId).length).toBe(0);
    });

    it('should skip agent parts', () => {
      const event: OpenCodeEvent = {
        type: 'message.part.updated',
        properties: {
          part: { type: 'agent' },
        },
      };
      expect(mapper.mapEvent(event, sessionId).length).toBe(0);
    });
  });

  describe('session events', () => {
    it('should map session.idle to result message', () => {
      const event: OpenCodeEvent = {
        type: 'session.idle',
        properties: {},
      };
      const messages = mapper.mapEvent(event, sessionId);
      expect(messages.length).toBe(1);
      expect(messages[0].type).toBe('result');
      expect(messages[0].subtype).toBe('success');
    });

    it('should map session.error to error message', () => {
      const event: OpenCodeEvent = {
        type: 'session.error',
        properties: { error: 'Something went wrong' },
      };
      const messages = mapper.mapEvent(event, sessionId);
      expect(messages.length).toBe(1);
      expect(messages[0].type).toBe('error');
      expect(messages[0].content).toBe('Something went wrong');
    });

    it('should handle session.error with no error message', () => {
      const event: OpenCodeEvent = {
        type: 'session.error',
        properties: {},
      };
      const messages = mapper.mapEvent(event, sessionId);
      expect(messages[0].content).toBe('Unknown session error');
    });

    it('should skip session.status events', () => {
      const event: OpenCodeEvent = {
        type: 'session.status',
        properties: { status: 'busy' },
      };
      expect(mapper.mapEvent(event, sessionId).length).toBe(0);
    });

    it('should skip message.updated events', () => {
      const event: OpenCodeEvent = {
        type: 'message.updated',
        properties: {},
      };
      expect(mapper.mapEvent(event, sessionId).length).toBe(0);
    });

    it('should skip unknown event types', () => {
      const event: OpenCodeEvent = {
        type: 'some.unknown.event',
        properties: {},
      };
      expect(mapper.mapEvent(event, sessionId).length).toBe(0);
    });
  });

  describe('reset', () => {
    it('should clear deduplication state', () => {
      // Emit a tool_use
      mapper.mapEvent({
        type: 'message.part.updated',
        properties: {
          part: { type: 'tool', id: 'tool-r1', state: 'pending', name: 'test' },
        },
      }, sessionId);

      // Reset
      mapper.reset();

      // Same tool ID should emit again after reset
      const messages = mapper.mapEvent({
        type: 'message.part.updated',
        properties: {
          part: { type: 'tool', id: 'tool-r1', state: 'pending', name: 'test' },
        },
      }, sessionId);
      expect(messages.length).toBe(1);
      expect(messages[0].type).toBe('tool_use');
    });
  });

  describe('missing properties', () => {
    it('should handle event with no properties', () => {
      const event: OpenCodeEvent = {
        type: 'message.part.updated',
      };
      expect(mapper.mapEvent(event, sessionId).length).toBe(0);
    });

    it('should handle event with no part', () => {
      const event: OpenCodeEvent = {
        type: 'message.part.updated',
        properties: {},
      };
      expect(mapper.mapEvent(event, sessionId).length).toBe(0);
    });
  });
});

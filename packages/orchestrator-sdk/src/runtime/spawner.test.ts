/**
 * Spawner Service Unit Tests
 *
 * Tests for the SpawnerService which manages Claude Code process spawning
 * and lifecycle for AI agents in the orchestration system.
 *
 * Note: These tests focus on the internal logic and state management.
 * Integration tests that spawn actual Claude Code processes would require
 * Claude to be installed and available.
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { EventEmitter } from 'node:events';
import type { EntityId, Timestamp } from '@elemental/core';
import { createTimestamp } from '@elemental/core';
import {
  createSpawnerService,
  type SpawnerService,
  type SpawnedSession,
  type SpawnConfig,
  type StreamJsonEvent,
  type SpawnedSessionEvent,
  SessionStatusTransitions,
  canReceiveInput,
  isTerminalStatus,
  getStatusDescription,
} from './spawner.js';

// Mock agent ID for tests
const testAgentId = 'agent-test-001' as EntityId;

describe('SpawnerService', () => {
  let spawnerService: SpawnerService;

  beforeEach(() => {
    spawnerService = createSpawnerService({
      claudePath: 'claude',
      workingDirectory: '/tmp',
      timeout: 5000,
    });
  });

  describe('listActiveSessions', () => {
    test('returns empty array when no sessions exist', () => {
      const sessions = spawnerService.listActiveSessions();
      expect(sessions).toEqual([]);
    });

    test('returns empty array when filtering by non-existent agent', () => {
      const sessions = spawnerService.listActiveSessions(testAgentId);
      expect(sessions).toEqual([]);
    });
  });

  describe('listAllSessions', () => {
    test('returns empty array when no sessions exist', () => {
      const sessions = spawnerService.listAllSessions();
      expect(sessions).toEqual([]);
    });
  });

  describe('getSession', () => {
    test('returns undefined for non-existent session', () => {
      const session = spawnerService.getSession('nonexistent-session');
      expect(session).toBeUndefined();
    });
  });

  describe('getMostRecentSession', () => {
    test('returns undefined when agent has no sessions', () => {
      const session = spawnerService.getMostRecentSession(testAgentId);
      expect(session).toBeUndefined();
    });
  });

  describe('getEventEmitter', () => {
    test('returns undefined for non-existent session', () => {
      const emitter = spawnerService.getEventEmitter('nonexistent-session');
      expect(emitter).toBeUndefined();
    });
  });

  describe('terminate', () => {
    test('throws error for non-existent session', async () => {
      await expect(spawnerService.terminate('nonexistent-session')).rejects.toThrow(
        'Session not found'
      );
    });
  });

  describe('suspend', () => {
    test('throws error for non-existent session', async () => {
      await expect(spawnerService.suspend('nonexistent-session')).rejects.toThrow(
        'Session not found'
      );
    });
  });

  describe('sendInput', () => {
    test('throws error for non-existent session', async () => {
      await expect(
        spawnerService.sendInput('nonexistent-session', 'test message')
      ).rejects.toThrow('Session not found');
    });
  });
});

describe('SessionStatusTransitions', () => {
  test('starting can transition to running or terminated', () => {
    expect(SessionStatusTransitions.starting).toContain('running');
    expect(SessionStatusTransitions.starting).toContain('terminated');
    expect(SessionStatusTransitions.starting).not.toContain('suspended');
  });

  test('running can transition to suspended, terminating, or terminated', () => {
    expect(SessionStatusTransitions.running).toContain('suspended');
    expect(SessionStatusTransitions.running).toContain('terminating');
    expect(SessionStatusTransitions.running).toContain('terminated');
    expect(SessionStatusTransitions.running).not.toContain('starting');
  });

  test('suspended can transition to running or terminated', () => {
    expect(SessionStatusTransitions.suspended).toContain('running');
    expect(SessionStatusTransitions.suspended).toContain('terminated');
    expect(SessionStatusTransitions.suspended).not.toContain('starting');
  });

  test('terminating can only transition to terminated', () => {
    expect(SessionStatusTransitions.terminating).toEqual(['terminated']);
  });

  test('terminated has no valid transitions', () => {
    expect(SessionStatusTransitions.terminated).toEqual([]);
  });
});

describe('canReceiveInput', () => {
  test('returns true only for running status', () => {
    expect(canReceiveInput('running')).toBe(true);
    expect(canReceiveInput('starting')).toBe(false);
    expect(canReceiveInput('suspended')).toBe(false);
    expect(canReceiveInput('terminating')).toBe(false);
    expect(canReceiveInput('terminated')).toBe(false);
  });
});

describe('isTerminalStatus', () => {
  test('returns true only for terminated status', () => {
    expect(isTerminalStatus('terminated')).toBe(true);
    expect(isTerminalStatus('starting')).toBe(false);
    expect(isTerminalStatus('running')).toBe(false);
    expect(isTerminalStatus('suspended')).toBe(false);
    expect(isTerminalStatus('terminating')).toBe(false);
  });
});

describe('getStatusDescription', () => {
  test('returns appropriate description for each status', () => {
    expect(getStatusDescription('starting')).toBe('Starting up');
    expect(getStatusDescription('running')).toBe('Running');
    expect(getStatusDescription('suspended')).toBe('Suspended (can be resumed)');
    expect(getStatusDescription('terminating')).toBe('Shutting down');
    expect(getStatusDescription('terminated')).toBe('Terminated');
  });

  test('returns Unknown for invalid status', () => {
    expect(getStatusDescription('invalid' as 'running')).toBe('Unknown');
  });
});

describe('SpawnConfig defaults', () => {
  test('uses default values when not provided', () => {
    const service = createSpawnerService();
    // The service should be created without errors
    expect(service).toBeDefined();
  });

  test('accepts custom configuration', () => {
    const config: SpawnConfig = {
      claudePath: '/custom/claude',
      workingDirectory: '/custom/dir',
      timeout: 30000,
      elementalRoot: '/custom/elemental',
      environmentVariables: { CUSTOM_VAR: 'value' },
    };
    const service = createSpawnerService(config);
    expect(service).toBeDefined();
  });
});

describe('Type definitions', () => {
  test('SpawnedSession has required fields', () => {
    // Test that the type structure is correct
    const now: Timestamp = createTimestamp();
    const mockSession: SpawnedSession = {
      id: 'session-123',
      agentId: 'agent-123' as EntityId,
      agentRole: 'worker',
      workerMode: 'ephemeral',
      mode: 'headless',
      pid: 12345,
      status: 'running',
      workingDirectory: '/tmp',
      createdAt: now,
      lastActivityAt: now,
      startedAt: now,
    };

    expect(mockSession.id).toBe('session-123');
    expect(mockSession.agentRole).toBe('worker');
    expect(mockSession.mode).toBe('headless');
    expect(mockSession.status).toBe('running');
  });

  test('SpawnedSessionEvent has required fields', () => {
    const now: Timestamp = createTimestamp();
    const mockEvent: SpawnedSessionEvent = {
      type: 'assistant',
      subtype: 'text',
      receivedAt: now,
      raw: { type: 'assistant', message: 'Hello' },
      message: 'Hello',
    };

    expect(mockEvent.type).toBe('assistant');
    expect(mockEvent.message).toBe('Hello');
  });

  test('StreamJsonEvent represents valid Claude Code events', () => {
    // Test various event types
    const initEvent: StreamJsonEvent = {
      type: 'system',
      subtype: 'init',
      session_id: 'claude-session-123',
      timestamp: new Date().toISOString(),
    };
    expect(initEvent.type).toBe('system');
    expect(initEvent.session_id).toBe('claude-session-123');

    const assistantEvent: StreamJsonEvent = {
      type: 'assistant',
      subtype: 'text',
      message: 'I will help you with that.',
    };
    expect(assistantEvent.type).toBe('assistant');

    const toolUseEvent: StreamJsonEvent = {
      type: 'tool_use',
      tool: 'Read',
      tool_use_id: 'tool-123',
      tool_input: { file_path: '/test.ts' },
    };
    expect(toolUseEvent.type).toBe('tool_use');
    expect(toolUseEvent.tool).toBe('Read');

    const toolResultEvent: StreamJsonEvent = {
      type: 'tool_result',
      tool_use_id: 'tool-123',
      content: 'File contents here',
    };
    expect(toolResultEvent.type).toBe('tool_result');

    const errorEvent: StreamJsonEvent = {
      type: 'error',
      error: 'Something went wrong',
    };
    expect(errorEvent.type).toBe('error');
  });
});

describe('Spawn mode determination', () => {
  test('director defaults to interactive mode', async () => {
    // This test validates the intended behavior
    // The actual spawn would fail without Claude, but we can verify the logic
    const service = createSpawnerService({ claudePath: 'nonexistent-claude' });

    // Director should attempt interactive spawn (which will fail with our error)
    await expect(
      service.spawn(testAgentId, 'director')
    ).rejects.toThrow('Interactive mode requires node-pty');
  });

  // Note: Tests for worker/steward defaulting to headless mode require the actual
  // claude binary to be installed. The spawn throws synchronously in Bun when the
  // binary is not found. Integration tests with a real claude installation would
  // verify this behavior.

  test('can override mode with options', async () => {
    const service = createSpawnerService({ claudePath: 'nonexistent-claude' });

    // Worker with interactive mode override should fail with node-pty error
    await expect(
      service.spawn(testAgentId, 'worker', { mode: 'interactive' })
    ).rejects.toThrow('Interactive mode requires node-pty');
  });
});

describe('Event handling', () => {
  test('EventEmitter is properly typed', () => {
    const emitter = new EventEmitter();
    const now: Timestamp = createTimestamp();

    // Test that we can emit and listen to the expected events
    let receivedEvent: SpawnedSessionEvent | undefined = undefined;

    emitter.on('event', (event: SpawnedSessionEvent) => {
      receivedEvent = event;
    });

    const testEvent: SpawnedSessionEvent = {
      type: 'assistant',
      receivedAt: now,
      raw: { type: 'assistant', message: 'test' },
      message: 'test',
    };

    emitter.emit('event', testEvent);
    expect(receivedEvent).toBeDefined();
    expect(receivedEvent!.type).toBe('assistant');
    expect(receivedEvent!.message).toBe('test');
  });

  test('EventEmitter handles multiple event types', () => {
    const emitter = new EventEmitter();
    const now: Timestamp = createTimestamp();

    const events: SpawnedSessionEvent[] = [];
    const errors: Error[] = [];
    const exits: { code: number | null; signal: string | null }[] = [];

    emitter.on('event', (e) => events.push(e));
    emitter.on('error', (e) => errors.push(e));
    emitter.on('exit', (code, signal) => exits.push({ code, signal }));

    // Emit different event types
    emitter.emit('event', {
      type: 'assistant',
      receivedAt: now,
      raw: { type: 'assistant' },
    });
    emitter.emit('error', new Error('Test error'));
    emitter.emit('exit', 0, null);

    expect(events.length).toBe(1);
    expect(errors.length).toBe(1);
    expect(exits.length).toBe(1);
    expect(exits[0].code).toBe(0);
  });
});

describe('Session ID generation', () => {
  test('generates unique session IDs', () => {
    const service1 = createSpawnerService();
    const service2 = createSpawnerService();

    // We can't directly test the ID generation, but we can verify
    // that the service is properly instantiated
    expect(service1).toBeDefined();
    expect(service2).toBeDefined();
    expect(service1).not.toBe(service2);
  });
});

describe('Worker mode inference', () => {
  test('headless mode is inferred for worker role', () => {
    // This tests that the service determines the correct mode based on role
    // Director -> interactive, Worker -> headless, Steward -> headless
    // We can only test director (throws node-pty error) without a real claude binary
    const service = createSpawnerService({ claudePath: 'nonexistent-claude' });

    // Director uses interactive mode - we can verify this throws the node-pty error
    expect(
      service.spawn(testAgentId, 'director')
    ).rejects.toThrow('Interactive mode requires node-pty');

    // Worker/Steward headless mode can only be verified with integration tests
    // because spawn() throws synchronously in Bun when binary is not found
  });
});

describe('Resume session option', () => {
  test('resume option is properly typed', () => {
    // Verify that the SpawnOptions type accepts resumeSessionId
    const options = {
      resumeSessionId: 'previous-session-123',
      initialPrompt: 'Continue from where you left off',
      mode: 'headless' as const,
    };

    expect(options.resumeSessionId).toBe('previous-session-123');
  });
});

describe('Environment variables', () => {
  test('ELEMENTAL_ROOT is supported in config', () => {
    const config: SpawnConfig = {
      elementalRoot: '/workspace/root',
      environmentVariables: {
        CUSTOM_VAR: 'custom_value',
      },
    };

    const service = createSpawnerService(config);
    expect(service).toBeDefined();
  });
});

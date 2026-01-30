/**
 * Agent Command Tests
 *
 * Tests for orchestrator CLI agent commands structure and validation.
 * Note: Full integration tests would require database setup.
 */

import { describe, it, expect } from 'bun:test';
import {
  agentCommand,
  agentListCommand,
  agentShowCommand,
  agentRegisterCommand,
  agentStartCommand,
  agentStopCommand,
  agentStreamCommand,
} from './agent.js';

describe('Agent Command Structure', () => {
  describe('agentCommand (parent)', () => {
    it('should have correct name and description', () => {
      expect(agentCommand.name).toBe('agent');
      expect(agentCommand.description).toBe('Manage orchestrator agents');
    });

    it('should have all subcommands', () => {
      expect(agentCommand.subcommands).toBeDefined();
      expect(agentCommand.subcommands!.list).toBe(agentListCommand);
      expect(agentCommand.subcommands!.show).toBe(agentShowCommand);
      expect(agentCommand.subcommands!.register).toBe(agentRegisterCommand);
      expect(agentCommand.subcommands!.start).toBe(agentStartCommand);
      expect(agentCommand.subcommands!.stop).toBe(agentStopCommand);
      expect(agentCommand.subcommands!.stream).toBe(agentStreamCommand);
    });

    it('should default to list handler', () => {
      expect(agentCommand.handler).toBe(agentListCommand.handler);
    });
  });

  describe('agentListCommand', () => {
    it('should have correct structure', () => {
      expect(agentListCommand.name).toBe('list');
      expect(agentListCommand.description).toBe('List registered agents');
      expect(agentListCommand.usage).toBe('el agent list [options]');
      expect(typeof agentListCommand.handler).toBe('function');
    });

    it('should have role and status options', () => {
      expect(agentListCommand.options).toBeDefined();
      expect(agentListCommand.options!.length).toBe(2);
      expect(agentListCommand.options![0].name).toBe('role');
      expect(agentListCommand.options![1].name).toBe('status');
    });
  });

  describe('agentShowCommand', () => {
    it('should have correct structure', () => {
      expect(agentShowCommand.name).toBe('show');
      expect(agentShowCommand.description).toBe('Show agent details');
      expect(agentShowCommand.usage).toBe('el agent show <id>');
      expect(typeof agentShowCommand.handler).toBe('function');
    });
  });

  describe('agentRegisterCommand', () => {
    it('should have correct structure', () => {
      expect(agentRegisterCommand.name).toBe('register');
      expect(agentRegisterCommand.description).toBe('Register a new agent');
      expect(agentRegisterCommand.usage).toBe('el agent register <name> --role <role> [options]');
      expect(typeof agentRegisterCommand.handler).toBe('function');
    });

    it('should have required role option', () => {
      expect(agentRegisterCommand.options).toBeDefined();
      expect(agentRegisterCommand.options!.length).toBeGreaterThanOrEqual(1);
      const roleOption = agentRegisterCommand.options![0];
      expect(roleOption.name).toBe('role');
      expect(roleOption.required).toBe(true);
    });

    it('should have mode option for workers', () => {
      const modeOption = agentRegisterCommand.options![1];
      expect(modeOption.name).toBe('mode');
      expect(modeOption.hasValue).toBe(true);
    });

    it('should have focus option for stewards', () => {
      const focusOption = agentRegisterCommand.options![2];
      expect(focusOption.name).toBe('focus');
      expect(focusOption.hasValue).toBe(true);
    });

    it('should have maxTasks option', () => {
      const maxTasksOption = agentRegisterCommand.options![3];
      expect(maxTasksOption.name).toBe('maxTasks');
      expect(maxTasksOption.hasValue).toBe(true);
    });
  });

  describe('agentStartCommand', () => {
    it('should have correct structure', () => {
      expect(agentStartCommand.name).toBe('start');
      expect(agentStartCommand.description).toBe('Start an agent session');
      expect(agentStartCommand.usage).toBe('el agent start <id> [options]');
      expect(typeof agentStartCommand.handler).toBe('function');
    });

    it('should have session option', () => {
      expect(agentStartCommand.options).toBeDefined();
      expect(agentStartCommand.options!.length).toBeGreaterThanOrEqual(1);
      const sessionOption = agentStartCommand.options![0];
      expect(sessionOption.name).toBe('session');
      expect(sessionOption.hasValue).toBe(true);
    });
  });

  describe('agentStopCommand', () => {
    it('should have correct structure', () => {
      expect(agentStopCommand.name).toBe('stop');
      expect(agentStopCommand.description).toBe('Stop an agent session');
      expect(agentStopCommand.usage).toBe('el agent stop <id>');
      expect(typeof agentStopCommand.handler).toBe('function');
    });
  });

  describe('agentStreamCommand', () => {
    it('should have correct structure', () => {
      expect(agentStreamCommand.name).toBe('stream');
      expect(agentStreamCommand.description).toBe('Get agent channel for streaming');
      expect(agentStreamCommand.usage).toBe('el agent stream <id>');
      expect(typeof agentStreamCommand.handler).toBe('function');
    });
  });
});

describe('Agent Command Validation', () => {
  describe('agentShowCommand', () => {
    it('should fail without id argument', async () => {
      const result = await agentShowCommand.handler([], {});
      expect(result.exitCode).not.toBe(0);
      expect(result.error).toContain('Usage');
    });
  });

  describe('agentRegisterCommand', () => {
    it('should fail without name argument', async () => {
      const result = await agentRegisterCommand.handler([], {});
      expect(result.exitCode).not.toBe(0);
      expect(result.error).toContain('Usage');
    });

    it('should fail without role option', async () => {
      const result = await agentRegisterCommand.handler(['TestAgent'], {});
      expect(result.exitCode).not.toBe(0);
      expect(result.error).toContain('--role');
    });

    it('should fail with invalid role', async () => {
      const result = await agentRegisterCommand.handler(['TestAgent'], { role: 'invalid' });
      expect(result.exitCode).not.toBe(0);
      expect(result.error).toContain('Invalid role');
    });
  });

  describe('agentStartCommand', () => {
    it('should fail without id argument', async () => {
      const result = await agentStartCommand.handler([], {});
      expect(result.exitCode).not.toBe(0);
      expect(result.error).toContain('Usage');
    });
  });

  describe('agentStopCommand', () => {
    it('should fail without id argument', async () => {
      const result = await agentStopCommand.handler([], {});
      expect(result.exitCode).not.toBe(0);
      expect(result.error).toContain('Usage');
    });
  });

  describe('agentStreamCommand', () => {
    it('should fail without id argument', async () => {
      const result = await agentStreamCommand.handler([], {});
      expect(result.exitCode).not.toBe(0);
      expect(result.error).toContain('Usage');
    });
  });
});

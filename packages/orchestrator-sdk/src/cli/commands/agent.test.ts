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
  agentSpawnCommand,
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
      expect(agentCommand.subcommands!.spawn).toBe(agentSpawnCommand);
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

    it('should have all filter options', () => {
      expect(agentListCommand.options).toBeDefined();
      expect(agentListCommand.options!.length).toBe(6);
      expect(agentListCommand.options![0].name).toBe('role');
      expect(agentListCommand.options![1].name).toBe('status');
      expect(agentListCommand.options![2].name).toBe('workerMode');
      expect(agentListCommand.options![3].name).toBe('focus');
      expect(agentListCommand.options![4].name).toBe('reportsTo');
      expect(agentListCommand.options![5].name).toBe('hasSession');
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

    it('should have all registration options', () => {
      expect(agentRegisterCommand.options).toBeDefined();
      expect(agentRegisterCommand.options!.length).toBe(8);

      // Required role option
      const roleOption = agentRegisterCommand.options![0];
      expect(roleOption.name).toBe('role');
      expect(roleOption.required).toBe(true);

      // Mode option for workers
      const modeOption = agentRegisterCommand.options![1];
      expect(modeOption.name).toBe('mode');
      expect(modeOption.hasValue).toBe(true);

      // Focus option for stewards
      const focusOption = agentRegisterCommand.options![2];
      expect(focusOption.name).toBe('focus');
      expect(focusOption.hasValue).toBe(true);

      // MaxTasks option
      const maxTasksOption = agentRegisterCommand.options![3];
      expect(maxTasksOption.name).toBe('maxTasks');
      expect(maxTasksOption.hasValue).toBe(true);

      // Tags option
      const tagsOption = agentRegisterCommand.options![4];
      expect(tagsOption.name).toBe('tags');
      expect(tagsOption.hasValue).toBe(true);

      // ReportsTo option
      const reportsToOption = agentRegisterCommand.options![5];
      expect(reportsToOption.name).toBe('reportsTo');
      expect(reportsToOption.hasValue).toBe(true);

      // RoleDef option
      const roleDefOption = agentRegisterCommand.options![6];
      expect(roleDefOption.name).toBe('roleDef');
      expect(roleDefOption.hasValue).toBe(true);

      // Trigger option
      const triggerOption = agentRegisterCommand.options![7];
      expect(triggerOption.name).toBe('trigger');
      expect(triggerOption.hasValue).toBe(true);
    });
  });

  describe('agentSpawnCommand', () => {
    it('should have correct structure', () => {
      expect(agentSpawnCommand.name).toBe('spawn');
      expect(agentSpawnCommand.description).toBe('Spawn a Claude Code process for an agent');
      expect(agentSpawnCommand.usage).toBe('el agent spawn <id> [options]');
      expect(typeof agentSpawnCommand.handler).toBe('function');
    });

    it('should have all spawn options', () => {
      expect(agentSpawnCommand.options).toBeDefined();
      expect(agentSpawnCommand.options!.length).toBe(10);
      expect(agentSpawnCommand.options![0].name).toBe('prompt');
      expect(agentSpawnCommand.options![1].name).toBe('mode');
      expect(agentSpawnCommand.options![2].name).toBe('resume');
      expect(agentSpawnCommand.options![3].name).toBe('workdir');
      expect(agentSpawnCommand.options![4].name).toBe('cols');
      expect(agentSpawnCommand.options![5].name).toBe('rows');
      expect(agentSpawnCommand.options![6].name).toBe('timeout');
      expect(agentSpawnCommand.options![7].name).toBe('env');
      expect(agentSpawnCommand.options![8].name).toBe('taskId');
      expect(agentSpawnCommand.options![9].name).toBe('stream');
    });
  });

  describe('agentStartCommand', () => {
    it('should have correct structure', () => {
      expect(agentStartCommand.name).toBe('start');
      expect(agentStartCommand.description).toBe('Start an agent session');
      expect(agentStartCommand.usage).toBe('el agent start <id> [options]');
      expect(typeof agentStartCommand.handler).toBe('function');
    });

    it('should have all start options', () => {
      expect(agentStartCommand.options).toBeDefined();
      expect(agentStartCommand.options!.length).toBe(4);
      expect(agentStartCommand.options![0].name).toBe('session');
      expect(agentStartCommand.options![0].hasValue).toBe(true);
      expect(agentStartCommand.options![1].name).toBe('taskId');
      expect(agentStartCommand.options![1].hasValue).toBe(true);
      expect(agentStartCommand.options![2].name).toBe('interactive');
      expect(agentStartCommand.options![3].name).toBe('stream');
    });
  });

  describe('agentStopCommand', () => {
    it('should have correct structure', () => {
      expect(agentStopCommand.name).toBe('stop');
      expect(agentStopCommand.description).toBe('Stop an agent session');
      expect(agentStopCommand.usage).toBe('el agent stop <id> [options]');
      expect(typeof agentStopCommand.handler).toBe('function');
    });

    it('should have all stop options', () => {
      expect(agentStopCommand.options).toBeDefined();
      expect(agentStopCommand.options!.length).toBe(3);
      expect(agentStopCommand.options![0].name).toBe('graceful');
      expect(agentStopCommand.options![1].name).toBe('no-graceful');
      expect(agentStopCommand.options![2].name).toBe('reason');
      expect(agentStopCommand.options![2].hasValue).toBe(true);
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

  describe('agentSpawnCommand', () => {
    it('should fail without id argument', async () => {
      const result = await agentSpawnCommand.handler([], {});
      expect(result.exitCode).not.toBe(0);
      expect(result.error).toContain('Usage');
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

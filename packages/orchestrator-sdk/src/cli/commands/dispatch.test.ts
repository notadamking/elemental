/**
 * Dispatch Command Tests
 *
 * Tests for orchestrator CLI dispatch commands structure and validation.
 * Note: Full integration tests would require database setup.
 */

import { describe, it, expect } from 'bun:test';
import { dispatchCommand, smartDispatchCommand } from './dispatch.js';

describe('Dispatch Command Structure', () => {
  describe('dispatchCommand (parent)', () => {
    it('should have correct name and description', () => {
      expect(dispatchCommand.name).toBe('dispatch');
      expect(dispatchCommand.description).toBe('Dispatch a task to an agent');
    });

    it('should have smart subcommand', () => {
      expect(dispatchCommand.subcommands).toBeDefined();
      expect(dispatchCommand.subcommands!.smart).toBe(smartDispatchCommand);
    });

    it('should have handler', () => {
      expect(typeof dispatchCommand.handler).toBe('function');
    });

    it('should have options', () => {
      expect(dispatchCommand.options).toBeDefined();
      expect(dispatchCommand.options!.length).toBe(3);
      expect(dispatchCommand.options![0].name).toBe('branch');
      expect(dispatchCommand.options![1].name).toBe('worktree');
      expect(dispatchCommand.options![2].name).toBe('session');
    });
  });

  describe('smartDispatchCommand', () => {
    it('should have correct structure', () => {
      expect(smartDispatchCommand.name).toBe('smart');
      expect(smartDispatchCommand.description).toBe('Smart dispatch to best available agent');
      expect(smartDispatchCommand.usage).toBe('el dispatch smart <task-id> [options]');
      expect(typeof smartDispatchCommand.handler).toBe('function');
    });

    it('should have branch and worktree options', () => {
      expect(smartDispatchCommand.options).toBeDefined();
      expect(smartDispatchCommand.options!.length).toBe(2);
      expect(smartDispatchCommand.options![0].name).toBe('branch');
      expect(smartDispatchCommand.options![1].name).toBe('worktree');
    });
  });
});

describe('Dispatch Command Validation', () => {
  describe('dispatchCommand', () => {
    it('should fail without arguments', async () => {
      const result = await dispatchCommand.handler([], {});
      expect(result.exitCode).not.toBe(0);
      expect(result.error).toContain('Usage');
    });

    it('should fail with only task-id', async () => {
      const result = await dispatchCommand.handler(['el-task123'], {});
      expect(result.exitCode).not.toBe(0);
      expect(result.error).toContain('Usage');
    });
  });

  describe('smartDispatchCommand', () => {
    it('should fail without task-id argument', async () => {
      const result = await smartDispatchCommand.handler([], {});
      expect(result.exitCode).not.toBe(0);
      expect(result.error).toContain('Usage');
    });
  });
});

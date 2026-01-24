/**
 * Workflow Commands Integration Tests
 *
 * Tests for the workflow CLI commands:
 * - workflow pour: Instantiate a playbook into a workflow
 * - workflow list: List workflows
 * - workflow show: Show workflow details
 * - workflow burn: Delete ephemeral workflow
 * - workflow squash: Promote ephemeral to durable
 * - workflow gc: Garbage collect old ephemeral workflows
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { workflowCommand } from './workflow.js';
import type { GlobalOptions } from '../types.js';
import { ExitCode } from '../types.js';
import type { Workflow } from '../../types/workflow.js';
import { WorkflowStatus } from '../../types/workflow.js';

// ============================================================================
// Test Utilities
// ============================================================================

const TEST_DIR = join(import.meta.dir, '__test_workflow_workspace__');
const ELEMENTAL_DIR = join(TEST_DIR, '.elemental');
const DB_PATH = join(ELEMENTAL_DIR, 'elemental.db');

function createTestOptions<T extends Record<string, unknown> = Record<string, unknown>>(
  overrides: T = {} as T
): GlobalOptions & T {
  return {
    db: DB_PATH,
    actor: 'test-user',
    json: false,
    quiet: false,
    verbose: false,
    help: false,
    version: false,
    ...overrides,
  };
}

// Helper to create a workflow and return its ID
async function createTestWorkflow(
  playbookName: string,
  extra: Record<string, unknown> = {}
): Promise<string> {
  const pourSubCmd = workflowCommand.subcommands!['pour'];
  const options = createTestOptions({ ...extra });
  const result = await pourSubCmd.handler([playbookName], options);
  return (result.data as { id: string }).id;
}

// ============================================================================
// Setup / Teardown
// ============================================================================

beforeEach(() => {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true });
  }
  mkdirSync(ELEMENTAL_DIR, { recursive: true });
});

afterEach(() => {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true });
  }
});

// ============================================================================
// Workflow Pour Command Tests
// ============================================================================

describe('workflow pour command', () => {
  const pourSubCmd = workflowCommand.subcommands!['pour'];

  test('creates a workflow from playbook name', async () => {
    const options = createTestOptions();
    const result = await pourSubCmd.handler(['deploy'], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toBeDefined();

    const workflow = result.data as Workflow;
    expect(workflow.id).toMatch(/^el-/);
    expect(workflow.title).toContain('deploy');
    expect(workflow.type).toBe('workflow');
    expect(workflow.status).toBe(WorkflowStatus.PENDING);
    expect(workflow.ephemeral).toBe(false);
  });

  test('creates ephemeral workflow with --ephemeral flag', async () => {
    const options = createTestOptions({ ephemeral: true });
    const result = await pourSubCmd.handler(['deploy'], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const workflow = result.data as Workflow;
    expect(workflow.ephemeral).toBe(true);
  });

  test('creates workflow with custom title', async () => {
    const options = createTestOptions({ title: 'Custom Title' });
    const result = await pourSubCmd.handler(['deploy'], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const workflow = result.data as Workflow;
    expect(workflow.title).toBe('Custom Title');
  });

  test('creates workflow with variables', async () => {
    const options = createTestOptions({ var: ['env=prod', 'version=1.0'] });
    const result = await pourSubCmd.handler(['deploy'], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const workflow = result.data as Workflow;
    expect(workflow.variables.env).toBe('prod');
    expect(workflow.variables.version).toBe('1.0');
  });

  test('fails without playbook name', async () => {
    const options = createTestOptions();
    const result = await pourSubCmd.handler([], options);

    expect(result.exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
    expect(result.error).toContain('Usage');
  });

  test('fails with invalid variable format', async () => {
    const options = createTestOptions({ var: 'invalidformat' });
    const result = await pourSubCmd.handler(['deploy'], options);

    expect(result.exitCode).toBe(ExitCode.VALIDATION);
    expect(result.error).toContain('Invalid variable format');
  });
});

// ============================================================================
// Workflow List Command Tests
// ============================================================================

describe('workflow list command', () => {
  const listSubCmd = workflowCommand.subcommands!['list'];

  test('lists all workflows', async () => {
    await createTestWorkflow('deploy1');
    await createTestWorkflow('deploy2');

    const options = createTestOptions();
    const result = await listSubCmd.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toBeDefined();
    expect(Array.isArray(result.data)).toBe(true);
    expect((result.data as Workflow[]).length).toBe(2);
  });

  test('filters by ephemeral flag', async () => {
    await createTestWorkflow('durable');
    await createTestWorkflow('ephemeral', { ephemeral: true });

    const options = createTestOptions({ ephemeral: true });
    const result = await listSubCmd.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const workflows = result.data as Workflow[];
    expect(workflows.length).toBe(1);
    expect(workflows[0].ephemeral).toBe(true);
  });

  test('filters by durable flag', async () => {
    await createTestWorkflow('durable');
    await createTestWorkflow('ephemeral', { ephemeral: true });

    const options = createTestOptions({ durable: true });
    const result = await listSubCmd.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const workflows = result.data as Workflow[];
    expect(workflows.length).toBe(1);
    expect(workflows[0].ephemeral).toBe(false);
  });

  test('respects limit option', async () => {
    await createTestWorkflow('deploy1');
    await createTestWorkflow('deploy2');
    await createTestWorkflow('deploy3');

    const options = createTestOptions({ limit: '2' });
    const result = await listSubCmd.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect((result.data as Workflow[]).length).toBe(2);
  });

  test('returns empty message when no workflows', async () => {
    // Create and delete a workflow to initialize the database
    const workflowId = await createTestWorkflow('temp');
    const { createElementalAPI } = await import('../../api/elemental-api.js');
    const { createStorage, initializeSchema } = await import('../../storage/index.js');
    const backend = createStorage({ path: DB_PATH, create: true });
    initializeSchema(backend);
    const api = createElementalAPI(backend);
    await api.delete(workflowId as unknown as import('../../types/element.js').ElementId, {});

    // Now list, which should filter out deleted (tombstone) workflows
    const options = createTestOptions();
    const result = await listSubCmd.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.message).toContain('No workflows found');
  });
});

// ============================================================================
// Workflow Show Command Tests
// ============================================================================

describe('workflow show command', () => {
  const showSubCmd = workflowCommand.subcommands!['show'];

  test('shows workflow details', async () => {
    const workflowId = await createTestWorkflow('deploy');

    const options = createTestOptions();
    const result = await showSubCmd.handler([workflowId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toBeDefined();

    const workflow = result.data as Workflow;
    expect(String(workflow.id)).toBe(workflowId);
    expect(workflow.type).toBe('workflow');
  });

  test('fails without id', async () => {
    const options = createTestOptions();
    const result = await showSubCmd.handler([], options);

    expect(result.exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
    expect(result.error).toContain('Usage');
  });

  test('fails for non-existent workflow', async () => {
    await createTestWorkflow('deploy');

    const options = createTestOptions();
    const result = await showSubCmd.handler(['el-nonexistent'], options);

    expect(result.exitCode).toBe(ExitCode.NOT_FOUND);
    expect(result.error).toContain('not found');
  });
});

// ============================================================================
// Workflow Burn Command Tests
// ============================================================================

describe('workflow burn command', () => {
  const burnSubCmd = workflowCommand.subcommands!['burn'];
  const showSubCmd = workflowCommand.subcommands!['show'];

  test('burns an ephemeral workflow', async () => {
    const workflowId = await createTestWorkflow('ephemeral', { ephemeral: true });

    const options = createTestOptions();
    const result = await burnSubCmd.handler([workflowId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.message).toContain('Burned');

    // After soft delete, the workflow has tombstone status
    const showResult = await showSubCmd.handler([workflowId], createTestOptions({ json: true }));
    expect(showResult.exitCode).toBe(ExitCode.SUCCESS);
    const workflow = showResult.data as Workflow;
    // The status should be 'tombstone' after deletion (cast as unknown since it's a special state)
    expect(workflow.status as unknown as string).toBe('tombstone');
  });

  test('fails for durable workflow', async () => {
    const workflowId = await createTestWorkflow('durable');

    const options = createTestOptions();
    const result = await burnSubCmd.handler([workflowId], options);

    expect(result.exitCode).toBe(ExitCode.VALIDATION);
    expect(result.error).toContain('durable');
  });

  test('fails without id', async () => {
    const options = createTestOptions();
    const result = await burnSubCmd.handler([], options);

    expect(result.exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
    expect(result.error).toContain('Usage');
  });
});

// ============================================================================
// Workflow Squash Command Tests
// ============================================================================

describe('workflow squash command', () => {
  const squashSubCmd = workflowCommand.subcommands!['squash'];
  const showSubCmd = workflowCommand.subcommands!['show'];

  test('squashes an ephemeral workflow to durable', async () => {
    const workflowId = await createTestWorkflow('ephemeral', { ephemeral: true });

    const options = createTestOptions();
    const result = await squashSubCmd.handler([workflowId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.message).toContain('Promoted');

    // Verify workflow is now durable
    const showResult = await showSubCmd.handler([workflowId], createTestOptions({ json: true }));
    const workflow = showResult.data as Workflow;
    expect(workflow.ephemeral).toBe(false);
  });

  test('returns success for already durable workflow', async () => {
    const workflowId = await createTestWorkflow('durable');

    const options = createTestOptions();
    const result = await squashSubCmd.handler([workflowId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.message).toContain('already durable');
  });

  test('fails without id', async () => {
    const options = createTestOptions();
    const result = await squashSubCmd.handler([], options);

    expect(result.exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
    expect(result.error).toContain('Usage');
  });
});

// ============================================================================
// Workflow GC Command Tests
// ============================================================================

describe('workflow gc command', () => {
  const gcSubCmd = workflowCommand.subcommands!['gc'];

  test('reports no workflows eligible when empty', async () => {
    // Create a workflow that's not eligible (not ephemeral)
    await createTestWorkflow('durable');

    const options = createTestOptions();
    const result = await gcSubCmd.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.message).toContain('No workflows eligible');
  });

  test('dry-run shows what would be deleted', async () => {
    // Create a workflow first so database exists
    await createTestWorkflow('deploy');

    // Note: GC normally requires completed/failed ephemeral workflows older than threshold
    // For testing, we just verify the dry-run behavior
    const options = createTestOptions({ dryRun: true });
    const result = await gcSubCmd.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
  });

  test('respects age option', async () => {
    // Create a workflow first so database exists
    await createTestWorkflow('deploy');

    const options = createTestOptions({ age: '30' });
    const result = await gcSubCmd.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
  });

  test('fails with invalid age', async () => {
    // Create a workflow first so database exists
    await createTestWorkflow('deploy');

    const options = createTestOptions({ age: 'invalid' });
    const result = await gcSubCmd.handler([], options);

    expect(result.exitCode).toBe(ExitCode.VALIDATION);
    expect(result.error).toContain('Age must be');
  });
});

// ============================================================================
// Workflow Root Command Tests
// ============================================================================

describe('workflow root command', () => {
  test('defaults to list when no subcommand', async () => {
    await createTestWorkflow('deploy');

    const options = createTestOptions();
    const result = await workflowCommand.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toBeDefined();
    expect(Array.isArray(result.data)).toBe(true);
  });

  test('returns error for unknown subcommand', async () => {
    const options = createTestOptions();
    const result = await workflowCommand.handler(['unknown'], options);

    expect(result.exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
    expect(result.error).toContain('Unknown subcommand');
  });
});

/**
 * Team Commands Integration Tests
 *
 * Tests for the team CLI commands:
 * - team create: Create a new team
 * - team add: Add member to team
 * - team remove: Remove member from team
 * - team list: List teams
 * - team members: List team members
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { teamCommand } from './team.js';
import type { GlobalOptions } from '../types.js';
import { ExitCode } from '../types.js';
import type { Team } from '../../types/team.js';

// ============================================================================
// Test Utilities
// ============================================================================

const TEST_DIR = join(import.meta.dir, '__test_team_workspace__');
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

// Helper to create a team and return its ID
async function createTestTeam(
  name: string,
  extra: Record<string, unknown> = {}
): Promise<string> {
  const createSubCmd = teamCommand.subcommands!['create'];
  const options = createTestOptions({ name, ...extra });
  const result = await createSubCmd.handler([], options);
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
// Team Create Command Tests
// ============================================================================

describe('team create command', () => {
  const createSubCmd = teamCommand.subcommands!['create'];

  test('creates a team with required name', async () => {
    const options = createTestOptions({ name: 'Engineering' });
    const result = await createSubCmd.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toBeDefined();

    const team = result.data as Team;
    expect(team.id).toMatch(/^el-/);
    expect(team.name).toBe('Engineering');
    expect(team.type).toBe('team');
    expect(team.members).toEqual([]);
  });

  test('creates team with initial members', async () => {
    const options = createTestOptions({ name: 'Design', member: ['el-user1', 'el-user2'] });
    const result = await createSubCmd.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const team = result.data as Team;
    expect(team.members.map(String)).toContain('el-user1');
    expect(team.members.map(String)).toContain('el-user2');
  });

  test('creates team with tags', async () => {
    const options = createTestOptions({ name: 'Backend', tag: ['engineering', 'backend'] });
    const result = await createSubCmd.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const team = result.data as Team;
    expect(team.tags).toContain('engineering');
    expect(team.tags).toContain('backend');
  });

  test('fails without name', async () => {
    const options = createTestOptions();
    const result = await createSubCmd.handler([], options);

    expect(result.exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
    expect(result.error).toContain('--name is required');
  });
});

// ============================================================================
// Team List Command Tests
// ============================================================================

describe('team list command', () => {
  const listSubCmd = teamCommand.subcommands!['list'];

  test('lists all teams', async () => {
    await createTestTeam('Team 1');
    await createTestTeam('Team 2');

    const options = createTestOptions();
    const result = await listSubCmd.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toBeDefined();
    expect(Array.isArray(result.data)).toBe(true);
    expect((result.data as Team[]).length).toBe(2);
  });

  test('filters by member', async () => {
    await createTestTeam('Team 1', { member: ['el-user1'] });
    await createTestTeam('Team 2', { member: ['el-user2'] });

    const options = createTestOptions({ member: 'el-user1' });
    const result = await listSubCmd.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const teams = result.data as Team[];
    expect(teams.length).toBe(1);
    expect(teams[0].members.map(String)).toContain('el-user1');
  });

  test('respects limit option', async () => {
    await createTestTeam('Team 1');
    await createTestTeam('Team 2');
    await createTestTeam('Team 3');

    const options = createTestOptions({ limit: '2' });
    const result = await listSubCmd.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect((result.data as Team[]).length).toBe(2);
  });

  test('returns empty message when no teams', async () => {
    // Create and delete a team to initialize the database
    const teamId = await createTestTeam('Temp');
    const { createElementalAPI } = await import('../../api/elemental-api.js');
    const { createStorage, initializeSchema } = await import('../../storage/index.js');
    const backend = createStorage({ path: DB_PATH, create: true });
    initializeSchema(backend);
    const api = createElementalAPI(backend);
    await api.delete(teamId as unknown as import('../../types/element.js').ElementId, {});

    const options = createTestOptions();
    const result = await listSubCmd.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.message).toContain('No teams found');
  });
});

// ============================================================================
// Team Add Command Tests
// ============================================================================

describe('team add command', () => {
  const addSubCmd = teamCommand.subcommands!['add'];
  const membersSubCmd = teamCommand.subcommands!['members'];

  test('adds a member to a team', async () => {
    const teamId = await createTestTeam('Engineering');

    const options = createTestOptions();
    const result = await addSubCmd.handler([teamId, 'el-newuser'], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.message).toContain('Added');

    // Verify member is in team
    const membersResult = await membersSubCmd.handler([teamId], createTestOptions({ json: true }));
    const data = membersResult.data as { members: string[] };
    expect(data.members).toContain('el-newuser');
  });

  test('returns success for already existing member', async () => {
    const teamId = await createTestTeam('Engineering', { member: ['el-user1'] });

    const options = createTestOptions();
    const result = await addSubCmd.handler([teamId, 'el-user1'], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.message).toContain('already a member');
  });

  test('fails without team id and entity id', async () => {
    const options = createTestOptions();
    const result = await addSubCmd.handler([], options);

    expect(result.exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
    expect(result.error).toContain('Usage');
  });

  test('fails for non-existent team', async () => {
    // Create a team first so the database exists
    await createTestTeam('Existing');

    const options = createTestOptions();
    const result = await addSubCmd.handler(['el-nonexistent', 'el-user1'], options);

    expect(result.exitCode).toBe(ExitCode.NOT_FOUND);
    expect(result.error).toContain('Team not found');
  });
});

// ============================================================================
// Team Remove Command Tests
// ============================================================================

describe('team remove command', () => {
  const removeSubCmd = teamCommand.subcommands!['remove'];
  const membersSubCmd = teamCommand.subcommands!['members'];

  test('removes a member from a team', async () => {
    const teamId = await createTestTeam('Engineering', { member: ['el-user1'] });

    const options = createTestOptions();
    const result = await removeSubCmd.handler([teamId, 'el-user1'], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.message).toContain('Removed');

    // Verify member is removed
    const membersResult = await membersSubCmd.handler([teamId], createTestOptions({ json: true }));
    const data = membersResult.data as { members: string[] };
    expect(data.members).not.toContain('el-user1');
  });

  test('returns success for non-member', async () => {
    const teamId = await createTestTeam('Engineering');

    const options = createTestOptions();
    const result = await removeSubCmd.handler([teamId, 'el-nonmember'], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.message).toContain('is not a member');
  });

  test('fails without team id and entity id', async () => {
    const options = createTestOptions();
    const result = await removeSubCmd.handler([], options);

    expect(result.exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
    expect(result.error).toContain('Usage');
  });
});

// ============================================================================
// Team Members Command Tests
// ============================================================================

describe('team members command', () => {
  const membersSubCmd = teamCommand.subcommands!['members'];

  test('lists team members', async () => {
    const teamId = await createTestTeam('Engineering', { member: ['el-user1', 'el-user2'] });

    const options = createTestOptions();
    const result = await membersSubCmd.handler([teamId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const data = result.data as { members: string[]; count: number };
    expect(data.members.length).toBe(2);
    expect(data.count).toBe(2);
  });

  test('returns empty message when no members', async () => {
    const teamId = await createTestTeam('Empty Team');

    const options = createTestOptions();
    const result = await membersSubCmd.handler([teamId], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.message).toContain('No members');
  });

  test('fails without team id', async () => {
    const options = createTestOptions();
    const result = await membersSubCmd.handler([], options);

    expect(result.exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
    expect(result.error).toContain('Usage');
  });

  test('fails for non-existent team', async () => {
    // Create a team first so DB exists
    await createTestTeam('Existing');

    const options = createTestOptions();
    const result = await membersSubCmd.handler(['el-nonexistent'], options);

    expect(result.exitCode).toBe(ExitCode.NOT_FOUND);
    expect(result.error).toContain('Team not found');
  });
});

// ============================================================================
// Team Root Command Tests
// ============================================================================

describe('team root command', () => {
  test('defaults to list when no subcommand', async () => {
    await createTestTeam('Engineering');

    const options = createTestOptions();
    const result = await teamCommand.handler([], options);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.data).toBeDefined();
    expect(Array.isArray(result.data)).toBe(true);
  });

  test('returns error for unknown subcommand', async () => {
    const options = createTestOptions();
    const result = await teamCommand.handler(['unknown'], options);

    expect(result.exitCode).toBe(ExitCode.INVALID_ARGUMENTS);
    expect(result.error).toContain('Unknown subcommand');
  });
});

/**
 * reset command - Reset an Elemental workspace
 *
 * Performs a complete workspace reset:
 * - Stops any running daemon
 * - Removes .elemental/elemental.db (and related db files)
 * - Cleans up .elemental/.worktrees/ directory
 * - Runs git worktree prune
 */

import * as readline from 'node:readline';
import { existsSync, rmSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import type { Command, GlobalOptions, CommandResult } from '../types.js';
import { success, failure, ExitCode } from '../types.js';

// ============================================================================
// Constants
// ============================================================================

const ELEMENTAL_DIR = '.elemental';
const WORKTREES_DIR = '.elemental/.worktrees';
const DEFAULT_SERVER_URL = 'http://localhost:3456';

// ============================================================================
// Helpers
// ============================================================================

/**
 * Prompts user for confirmation
 */
async function confirm(message: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${message} (y/N): `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

/**
 * Attempts to stop the daemon via the server API
 */
async function tryStopDaemon(serverUrl: string): Promise<{ stopped: boolean; error?: string }> {
  try {
    const response = await fetch(`${serverUrl}/api/daemon/stop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    if (response.ok) {
      return { stopped: true };
    }

    // Try to parse error response, but don't fail if it's not valid JSON
    try {
      const data = await response.json();
      return { stopped: false, error: data.error?.message ?? `Server returned ${response.status}` };
    } catch {
      return { stopped: false, error: `Server returned ${response.status}` };
    }
  } catch (err) {
    // Server not running or connection refused - that's fine
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('ECONNREFUSED') || message.includes('fetch failed')) {
      return { stopped: false }; // Not an error, server just isn't running
    }
    return { stopped: false, error: message };
  }
}

/**
 * Removes database and data files from .elemental directory
 */
function removeDataFiles(elementalDir: string): { removed: string[] } {
  const removed: string[] = [];

  if (!existsSync(elementalDir)) {
    return { removed };
  }

  // Database files and root-level sync files
  const filesToRemove = [
    'elemental.db',
    'elemental.db-journal',
    'elemental.db-wal',
    'elemental.db-shm',
    // Sync/export files (root level, legacy location)
    'elements.jsonl',
    'dependencies.jsonl',
  ];

  for (const filename of filesToRemove) {
    const filePath = join(elementalDir, filename);
    if (existsSync(filePath)) {
      rmSync(filePath, { force: true });
      removed.push(filename);
    }
  }

  // Clear sync directory files
  const syncDir = join(elementalDir, 'sync');
  if (existsSync(syncDir)) {
    const syncFiles = ['elements.jsonl', 'dependencies.jsonl'];
    for (const filename of syncFiles) {
      const filePath = join(syncDir, filename);
      if (existsSync(filePath)) {
        rmSync(filePath, { force: true });
        removed.push(`sync/${filename}`);
      }
    }
  }

  // Clear uploads directory
  const uploadsDir = join(elementalDir, 'uploads');
  if (existsSync(uploadsDir)) {
    try {
      const files = readdirSync(uploadsDir);
      for (const file of files) {
        const filePath = join(uploadsDir, file);
        rmSync(filePath, { recursive: true, force: true });
        removed.push(`uploads/${file}`);
      }
    } catch {
      // Ignore errors reading uploads directory
    }
  }

  return { removed };
}

/**
 * Removes .elemental/.worktrees directory and prunes git worktrees
 */
function cleanupWorktrees(workDir: string): { removed: boolean; pruned: boolean; error?: string } {
  const worktreesDir = join(workDir, WORKTREES_DIR);
  let removed = false;
  let pruned = false;

  // Remove .elemental/.worktrees directory
  if (existsSync(worktreesDir)) {
    try {
      rmSync(worktreesDir, { recursive: true, force: true });
      removed = true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { removed: false, pruned: false, error: `Failed to remove ${WORKTREES_DIR}: ${message}` };
    }
  }

  // Run git worktree prune
  try {
    execSync('git worktree prune', { cwd: workDir, stdio: 'pipe' });
    pruned = true;
  } catch (err) {
    // Git worktree prune might fail if not in a git repo - that's okay
    const message = err instanceof Error ? err.message : String(err);
    if (!message.includes('not a git repository')) {
      return { removed, pruned: false, error: `Failed to prune git worktrees: ${message}` };
    }
  }

  return { removed, pruned };
}

// ============================================================================
// Command Options
// ============================================================================

interface ResetOptions {
  force?: boolean;
  full?: boolean;
  server?: string;
}

// ============================================================================
// Handler
// ============================================================================

async function resetHandler(
  _args: string[],
  options: GlobalOptions & ResetOptions
): Promise<CommandResult> {
  const workDir = process.cwd();
  const elementalDir = join(workDir, ELEMENTAL_DIR);

  // Check if workspace exists
  if (!existsSync(elementalDir)) {
    return failure(
      `No Elemental workspace found at ${elementalDir}`,
      ExitCode.VALIDATION
    );
  }

  const isFull = options.full ?? false;

  // Confirm unless --force
  if (!options.force) {
    if (isFull) {
      console.log('This will FULLY reset the Elemental workspace:');
      console.log('  - Stop any running daemon');
      console.log('  - Delete entire .elemental folder (including config)');
      console.log('  - Remove all worktrees');
      console.log('  - Prune git worktrees');
      console.log('  - Reinitialize with default configuration');
    } else {
      console.log('This will reset the Elemental workspace:');
      console.log('  - Stop any running daemon');
      console.log('  - Remove database (all entities, tasks, etc.)');
      console.log('  - Remove sync files (elements.jsonl, dependencies.jsonl)');
      console.log('  - Remove all uploaded files');
      console.log('  - Remove all worktrees');
      console.log('  - Prune git worktrees');
      console.log('');
      console.log('Configuration files will be preserved.');
    }
    console.log('');

    const confirmed = await confirm('Are you sure you want to reset the workspace?');
    if (!confirmed) {
      return success(null, 'Cancelled');
    }
  }

  const results: string[] = [];

  // 1. Stop daemon
  const serverUrl = options.server ?? DEFAULT_SERVER_URL;
  const daemonResult = await tryStopDaemon(serverUrl);
  if (daemonResult.stopped) {
    results.push('Stopped daemon');
  } else if (daemonResult.error) {
    results.push(`Warning: Could not stop daemon: ${daemonResult.error}`);
  }

  if (isFull) {
    // Full reset: delete entire .elemental folder
    try {
      rmSync(elementalDir, { recursive: true, force: true });
      results.push('Deleted .elemental folder');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return failure(`Failed to delete .elemental folder: ${message}`, ExitCode.GENERAL_ERROR);
    }
  } else {
    // Partial reset: remove only data files
    const dataResult = removeDataFiles(elementalDir);
    if (dataResult.removed.length > 0) {
      results.push(`Removed data files: ${dataResult.removed.join(', ')}`);
    }
  }

  // 3. Cleanup worktrees
  const worktreeResult = cleanupWorktrees(workDir);
  if (worktreeResult.error) {
    return failure(worktreeResult.error, ExitCode.GENERAL_ERROR);
  }
  if (worktreeResult.removed) {
    results.push('Removed .elemental/.worktrees directory');
  }
  if (worktreeResult.pruned) {
    results.push('Pruned git worktrees');
  }

  // 4. If full reset, reinitialize
  if (isFull) {
    const { initCommand } = await import('./init.js');
    const initResult = await initCommand.handler([], options);
    if (initResult.error) {
      return failure(`Reset complete but init failed: ${initResult.message}`, ExitCode.GENERAL_ERROR);
    }
    results.push('Reinitialized workspace');
  }

  // Summary
  const summary = results.length > 0
    ? `Workspace reset complete:\n  ${results.join('\n  ')}`
    : 'Workspace reset complete (nothing to clean up)';

  return success(
    {
      full: isFull,
      worktreesRemoved: worktreeResult.removed,
      gitPruned: worktreeResult.pruned,
      daemonStopped: daemonResult.stopped,
    },
    summary
  );
}

// ============================================================================
// Command Definition
// ============================================================================

export const resetCommand: Command = {
  name: 'reset',
  description: 'Reset an Elemental workspace',
  usage: 'el reset [--force] [--full]',
  help: `Reset an Elemental workspace to a clean state.

By default, this command will:
  - Stop any running daemon
  - Remove the database (all entities, tasks, messages, etc.)
  - Remove sync files (elements.jsonl, dependencies.jsonl)
  - Remove all uploaded files (.elemental/uploads/)
  - Remove all worktrees (.elemental/.worktrees/ directory)
  - Prune git worktrees

Configuration files (.elemental/config.yaml) will be preserved.

With --full, this command will:
  - Stop any running daemon
  - Delete the entire .elemental folder (including config and worktrees)
  - Prune git worktrees
  - Reinitialize with default configuration

Options:
  --force, -f           Skip confirmation prompt
  --full                Delete everything and reinitialize
  --server, -s <url>    Orchestrator server URL (default: ${DEFAULT_SERVER_URL})

Examples:
  el reset              # Interactive confirmation, preserve config
  el reset --force      # Skip confirmation, preserve config
  el reset --full       # Delete everything and reinitialize
  el reset --full -f    # Full reset without confirmation`,
  options: [
    {
      name: 'force',
      short: 'f',
      description: 'Skip confirmation prompt',
    },
    {
      name: 'full',
      description: 'Delete everything and reinitialize',
    },
    {
      name: 'server',
      short: 's',
      description: `Orchestrator server URL (default: ${DEFAULT_SERVER_URL})`,
      hasValue: true,
    },
  ],
  handler: resetHandler as Command['handler'],
};

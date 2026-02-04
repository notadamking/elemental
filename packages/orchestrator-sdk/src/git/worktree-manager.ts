/**
 * Worktree Manager
 *
 * This module provides git worktree management for the orchestration system.
 * Each worker agent gets a dedicated git worktree for true parallel development.
 *
 * Key features:
 * - Verify git repo exists before operations
 * - Create isolated worktrees for workers
 * - Branch naming: agent/{worker-name}/{task-id}-{slug}
 * - Worktree path: .elemental/.worktrees/{worker-name}-{task-slug}/
 * - Clean up worktrees after merge
 *
 * @module
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import * as path from 'node:path';
import * as fs from 'node:fs';
import type { ElementId, Timestamp } from '@elemental/core';
import { createTimestamp } from '@elemental/core';
import {
  generateBranchName,
  generateWorktreePath,
  createSlugFromTitle,
} from '../types/task-meta.js';

const execAsync = promisify(exec);

// ============================================================================
// Types
// ============================================================================

/**
 * Lifecycle state of a worktree
 */
export type WorktreeState =
  | 'creating'
  | 'active'
  | 'suspended'
  | 'merging'
  | 'cleaning'
  | 'archived';

/**
 * All valid worktree states
 */
export const WorktreeStates = [
  'creating',
  'active',
  'suspended',
  'merging',
  'cleaning',
  'archived',
] as const;

/**
 * Valid state transitions for worktrees
 */
export const WorktreeStateTransitions: Record<WorktreeState, WorktreeState[]> = {
  creating: ['active', 'cleaning'],
  active: ['suspended', 'merging', 'cleaning'],
  suspended: ['active', 'cleaning'],
  merging: ['archived', 'cleaning', 'active'],
  cleaning: ['archived'],
  archived: [],
};

/**
 * Information about a git worktree
 */
export interface WorktreeInfo {
  /** Full path to the worktree directory */
  readonly path: string;
  /** Relative path from workspace root (e.g., ".elemental/.worktrees/alice-feature") */
  readonly relativePath: string;
  /** Branch checked out in this worktree */
  readonly branch: string;
  /** HEAD commit hash */
  readonly head: string;
  /** Whether this is the main worktree */
  readonly isMain: boolean;
  /** Worktree lifecycle state */
  state: WorktreeState;
  /** Agent name associated with this worktree */
  readonly agentName?: string;
  /** Task ID associated with this worktree */
  readonly taskId?: string;
  /** When the worktree was created */
  readonly createdAt?: Timestamp;
}

/**
 * Options for creating a worktree
 */
export interface CreateWorktreeOptions {
  /** Agent name for path generation */
  readonly agentName: string;
  /** Task ID for branch naming */
  readonly taskId: ElementId;
  /** Task title for slug generation (optional) */
  readonly taskTitle?: string;
  /** Custom branch name (overrides auto-generated) */
  readonly customBranch?: string;
  /** Custom worktree path (overrides auto-generated) */
  readonly customPath?: string;
  /** Base branch to create from (default: current branch) */
  readonly baseBranch?: string;
  /** Track remote branch (default: true) */
  readonly trackRemote?: boolean;
}

/**
 * Options for removing a worktree
 */
export interface RemoveWorktreeOptions {
  /** Force removal even if there are uncommitted changes */
  readonly force?: boolean;
  /** Also delete the branch */
  readonly deleteBranch?: boolean;
  /** Force delete branch even if not fully merged */
  readonly forceBranchDelete?: boolean;
}

/**
 * Result of creating a worktree
 */
export interface CreateWorktreeResult {
  /** The created worktree info */
  readonly worktree: WorktreeInfo;
  /** The branch name created/checked out */
  readonly branch: string;
  /** Full path to the worktree */
  readonly path: string;
  /** Whether a new branch was created */
  readonly branchCreated: boolean;
}

/**
 * Configuration for the WorktreeManager
 */
export interface WorktreeManagerConfig {
  /** Workspace root directory (must be a git repo) */
  readonly workspaceRoot: string;
  /** Directory for worktrees relative to workspace root (default: ".elemental/.worktrees") */
  readonly worktreeDir?: string;
  /** Default base branch (default: auto-detect from git) */
  readonly defaultBaseBranch?: string;
}

/**
 * Error thrown when git repository is not found
 */
export class GitRepositoryNotFoundError extends Error {
  constructor(path: string) {
    super(
      `Git repository not found at ${path}.\n\n` +
      `The orchestrator requires an existing git repository.\n` +
      `Please initialize a git repository first:\n\n` +
      `  cd ${path}\n` +
      `  git init\n` +
      `  git add .\n` +
      `  git commit -m "Initial commit"\n`
    );
    this.name = 'GitRepositoryNotFoundError';
  }
}

/**
 * Error thrown when a worktree operation fails
 */
export class WorktreeError extends Error {
  readonly code: string;
  readonly details?: string;

  constructor(message: string, code: string, details?: string) {
    super(message);
    this.name = 'WorktreeError';
    this.code = code;
    this.details = details;
  }
}

// ============================================================================
// WorktreeManager Interface
// ============================================================================

/**
 * WorktreeManager interface for git worktree operations.
 *
 * The manager provides methods for:
 * - Initializing workspace and verifying git repo
 * - Creating worktrees for workers
 * - Removing worktrees after merge
 * - Listing and querying worktrees
 */
export interface WorktreeManager {
  // ----------------------------------------
  // Initialization
  // ----------------------------------------

  /**
   * Initializes the workspace, verifying git repo exists.
   *
   * @throws GitRepositoryNotFoundError if no git repo found
   */
  initWorkspace(): Promise<void>;

  /**
   * Checks if the workspace has been initialized.
   */
  isInitialized(): boolean;

  /**
   * Gets the workspace root directory.
   */
  getWorkspaceRoot(): string;

  // ----------------------------------------
  // Worktree Operations
  // ----------------------------------------

  /**
   * Creates a new worktree for a worker.
   *
   * @param options - Worktree creation options
   * @returns The created worktree result
   */
  createWorktree(options: CreateWorktreeOptions): Promise<CreateWorktreeResult>;

  /**
   * Creates a read-only worktree detached on the default branch.
   * Used for triage sessions that should not create new branches.
   *
   * @param options - Agent name and purpose for path generation
   * @returns The created worktree result
   */
  createReadOnlyWorktree(options: {
    agentName: string;
    purpose: string;
  }): Promise<CreateWorktreeResult>;

  /**
   * Removes a worktree.
   *
   * @param worktreePath - Path to the worktree (relative or absolute)
   * @param options - Removal options
   */
  removeWorktree(worktreePath: string, options?: RemoveWorktreeOptions): Promise<void>;

  /**
   * Suspends a worktree (marks it inactive but preserves it).
   *
   * @param worktreePath - Path to the worktree
   */
  suspendWorktree(worktreePath: string): Promise<void>;

  /**
   * Resumes a suspended worktree.
   *
   * @param worktreePath - Path to the worktree
   */
  resumeWorktree(worktreePath: string): Promise<void>;

  // ----------------------------------------
  // Worktree Queries
  // ----------------------------------------

  /**
   * Lists all worktrees in the workspace.
   *
   * @param includeMain - Whether to include the main worktree (default: false)
   */
  listWorktrees(includeMain?: boolean): Promise<WorktreeInfo[]>;

  /**
   * Gets information about a specific worktree.
   *
   * @param worktreePath - Path to the worktree (relative or absolute)
   */
  getWorktree(worktreePath: string): Promise<WorktreeInfo | undefined>;

  /**
   * Gets the worktree path for an agent/task combination.
   *
   * @param agentName - The agent's name
   * @param taskTitle - The task title (optional, used for slug)
   */
  getWorktreePath(agentName: string, taskTitle?: string): string;

  /**
   * Gets worktrees for a specific agent.
   *
   * @param agentName - The agent's name
   */
  getWorktreesForAgent(agentName: string): Promise<WorktreeInfo[]>;

  /**
   * Checks if a worktree exists at the given path.
   *
   * @param worktreePath - Path to check
   */
  worktreeExists(worktreePath: string): Promise<boolean>;

  // ----------------------------------------
  // Branch Operations
  // ----------------------------------------

  /**
   * Gets the current branch of the main worktree.
   */
  getCurrentBranch(): Promise<string>;

  /**
   * Gets the default base branch (main, master, etc).
   */
  getDefaultBranch(): Promise<string>;

  /**
   * Checks if a branch exists.
   *
   * @param branchName - The branch name to check
   */
  branchExists(branchName: string): Promise<boolean>;
}

// ============================================================================
// WorktreeManager Implementation
// ============================================================================

/**
 * Implementation of the WorktreeManager.
 */
export class WorktreeManagerImpl implements WorktreeManager {
  private readonly config: Required<WorktreeManagerConfig>;
  private initialized = false;
  private defaultBranch: string | undefined;
  private worktreeStates: Map<string, WorktreeState> = new Map();
  private realWorkspaceRoot: string | undefined;

  constructor(config: WorktreeManagerConfig) {
    this.config = {
      workspaceRoot: path.resolve(config.workspaceRoot),
      worktreeDir: config.worktreeDir ?? '.elemental/.worktrees',
      defaultBaseBranch: config.defaultBaseBranch ?? '',
    };
  }

  // ----------------------------------------
  // Initialization
  // ----------------------------------------

  async initWorkspace(): Promise<void> {
    const gitDir = path.join(this.config.workspaceRoot, '.git');

    // Check if .git exists (could be a file for worktrees or a directory)
    if (!fs.existsSync(gitDir)) {
      throw new GitRepositoryNotFoundError(this.config.workspaceRoot);
    }

    // Verify it's actually a git repository by running a git command
    try {
      await this.execGit(['rev-parse', '--git-dir']);
    } catch {
      throw new GitRepositoryNotFoundError(this.config.workspaceRoot);
    }

    // Create worktree directory if it doesn't exist
    const worktreeDir = path.join(this.config.workspaceRoot, this.config.worktreeDir);
    if (!fs.existsSync(worktreeDir)) {
      fs.mkdirSync(worktreeDir, { recursive: true });
    }

    // Add worktree directory to .gitignore if not already there
    await this.ensureGitignore();

    // Cache the default branch
    this.defaultBranch = await this.detectDefaultBranch();

    // Prune stale worktree entries (directories removed but git still tracks them)
    await this.execGit(['worktree', 'prune']);

    // Resolve real path (handles symlinks like /tmp -> /private/tmp on macOS)
    try {
      this.realWorkspaceRoot = fs.realpathSync(this.config.workspaceRoot);
    } catch {
      this.realWorkspaceRoot = this.config.workspaceRoot;
    }

    this.initialized = true;
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  getWorkspaceRoot(): string {
    return this.config.workspaceRoot;
  }

  // ----------------------------------------
  // Worktree Operations
  // ----------------------------------------

  async createWorktree(options: CreateWorktreeOptions): Promise<CreateWorktreeResult> {
    this.ensureInitialized();

    // Generate paths and branch name
    const slug = options.taskTitle ? createSlugFromTitle(options.taskTitle) : undefined;
    const branch = options.customBranch ?? generateBranchName(options.agentName, options.taskId, slug);
    const relativePath = options.customPath ?? generateWorktreePath(options.agentName, slug);
    const fullPath = path.join(this.config.workspaceRoot, relativePath);

    // Check if worktree already exists
    if (fs.existsSync(fullPath)) {
      throw new WorktreeError(
        `Worktree already exists at ${relativePath}`,
        'WORKTREE_EXISTS'
      );
    }

    // Track state
    this.worktreeStates.set(relativePath, 'creating');

    let branchCreated = false;
    const baseBranch = options.baseBranch ?? await this.getDefaultBranch();

    try {
      // Check if branch exists
      const branchExists = await this.branchExists(branch);

      if (branchExists) {
        // Branch exists, create worktree checking out existing branch
        await this.execGit(['worktree', 'add', fullPath, branch]);
      } else {
        // Create new branch from base
        await this.execGit(['worktree', 'add', '-b', branch, fullPath, baseBranch]);
        branchCreated = true;

        // Set up tracking if requested
        if (options.trackRemote !== false) {
          try {
            // Try to set upstream (may fail if remote doesn't exist)
            await this.execGit(['branch', '--set-upstream-to', `origin/${baseBranch}`, branch]);
          } catch {
            // Ignore - remote may not exist
          }
        }
      }

      // Update state to active
      this.worktreeStates.set(relativePath, 'active');

      // Get worktree info
      const worktree = await this.getWorktree(relativePath);
      if (!worktree) {
        throw new WorktreeError(
          'Failed to get worktree info after creation',
          'WORKTREE_INFO_FAILED'
        );
      }

      // Attach additional metadata
      const enrichedWorktree: WorktreeInfo = {
        ...worktree,
        agentName: options.agentName,
        taskId: options.taskId,
        createdAt: createTimestamp(),
        state: 'active',
      };

      return {
        worktree: enrichedWorktree,
        branch,
        path: fullPath,
        branchCreated,
      };
    } catch (error) {
      // Clean up on failure
      this.worktreeStates.delete(relativePath);
      if (fs.existsSync(fullPath)) {
        try {
          await this.execGit(['worktree', 'remove', '--force', fullPath]);
        } catch {
          // Ignore cleanup errors
        }
      }
      throw error;
    }
  }

  /**
   * Create a read-only (detached HEAD) worktree for triage sessions.
   * Uses `git worktree add --detach` so no new branch is created.
   */
  async createReadOnlyWorktree(options: {
    agentName: string;
    purpose: string;
  }): Promise<CreateWorktreeResult> {
    this.ensureInitialized();

    const relativePath = `.elemental/.worktrees/${options.agentName}-${options.purpose}`;
    const fullPath = path.join(this.config.workspaceRoot, relativePath);

    if (fs.existsSync(fullPath)) {
      throw new WorktreeError(
        `Worktree already exists at ${relativePath}`,
        'WORKTREE_EXISTS'
      );
    }

    this.worktreeStates.set(relativePath, 'creating');

    try {
      const baseBranch = await this.getDefaultBranch();

      // Prune stale worktree entries before adding, in case git's list is stale
      await this.execGit(['worktree', 'prune']);

      await this.execGit(['worktree', 'add', '--detach', fullPath, baseBranch]);

      this.worktreeStates.set(relativePath, 'active');

      const worktree = await this.getWorktree(relativePath);
      if (!worktree) {
        throw new WorktreeError(
          'Failed to get worktree info after creation',
          'WORKTREE_INFO_FAILED'
        );
      }

      const enrichedWorktree: WorktreeInfo = {
        ...worktree,
        agentName: options.agentName,
        createdAt: createTimestamp(),
        state: 'active',
      };

      return {
        worktree: enrichedWorktree,
        branch: `(detached-${options.purpose})`,
        path: fullPath,
        branchCreated: false,
      };
    } catch (error) {
      this.worktreeStates.delete(relativePath);
      if (fs.existsSync(fullPath)) {
        try {
          await this.execGit(['worktree', 'remove', '--force', fullPath]);
        } catch {
          // Ignore cleanup errors
        }
      }
      throw error;
    }
  }

  async removeWorktree(worktreePath: string, options?: RemoveWorktreeOptions): Promise<void> {
    this.ensureInitialized();

    const fullPath = this.resolvePath(worktreePath);
    const relativePath = this.getRelativePath(fullPath);

    // Get worktree info to find the branch
    const worktree = await this.getWorktree(worktreePath);
    if (!worktree) {
      throw new WorktreeError(
        `Worktree not found: ${worktreePath}`,
        'WORKTREE_NOT_FOUND'
      );
    }

    if (worktree.isMain) {
      throw new WorktreeError(
        'Cannot remove the main worktree',
        'CANNOT_REMOVE_MAIN'
      );
    }

    // Update state
    this.worktreeStates.set(relativePath, 'cleaning');

    try {
      // Remove the worktree
      const removeArgs = ['worktree', 'remove'];
      if (options?.force) {
        removeArgs.push('--force');
      }
      removeArgs.push(fullPath);

      await this.execGit(removeArgs);

      // Delete branch if requested
      if (options?.deleteBranch && worktree.branch) {
        const deleteArgs = ['branch'];
        if (options.forceBranchDelete) {
          deleteArgs.push('-D');
        } else {
          deleteArgs.push('-d');
        }
        deleteArgs.push(worktree.branch);

        try {
          await this.execGit(deleteArgs);
        } catch (error) {
          // Branch might not exist or might not be fully merged
          // Only throw if not forcing
          if (!options.forceBranchDelete) {
            throw new WorktreeError(
              `Failed to delete branch ${worktree.branch}. Use forceBranchDelete to force deletion.`,
              'BRANCH_DELETE_FAILED',
              (error as Error).message
            );
          }
        }
      }

      // Update state to archived
      this.worktreeStates.set(relativePath, 'archived');
    } catch (error) {
      if (error instanceof WorktreeError) {
        throw error;
      }
      throw new WorktreeError(
        `Failed to remove worktree: ${worktreePath}`,
        'REMOVE_FAILED',
        (error as Error).message
      );
    }
  }

  async suspendWorktree(worktreePath: string): Promise<void> {
    this.ensureInitialized();

    const worktree = await this.getWorktree(worktreePath);
    if (!worktree) {
      throw new WorktreeError(
        `Worktree not found: ${worktreePath}`,
        'WORKTREE_NOT_FOUND'
      );
    }

    const relativePath = this.getRelativePath(this.resolvePath(worktreePath));
    const currentState = this.worktreeStates.get(relativePath) ?? 'active';

    if (!WorktreeStateTransitions[currentState].includes('suspended')) {
      throw new WorktreeError(
        `Cannot suspend worktree in state: ${currentState}`,
        'INVALID_STATE_TRANSITION'
      );
    }

    this.worktreeStates.set(relativePath, 'suspended');
  }

  async resumeWorktree(worktreePath: string): Promise<void> {
    this.ensureInitialized();

    const worktree = await this.getWorktree(worktreePath);
    if (!worktree) {
      throw new WorktreeError(
        `Worktree not found: ${worktreePath}`,
        'WORKTREE_NOT_FOUND'
      );
    }

    const relativePath = this.getRelativePath(this.resolvePath(worktreePath));
    const currentState = this.worktreeStates.get(relativePath) ?? 'active';

    if (currentState !== 'suspended') {
      throw new WorktreeError(
        `Cannot resume worktree in state: ${currentState}`,
        'INVALID_STATE_TRANSITION'
      );
    }

    this.worktreeStates.set(relativePath, 'active');
  }

  // ----------------------------------------
  // Worktree Queries
  // ----------------------------------------

  async listWorktrees(includeMain = false): Promise<WorktreeInfo[]> {
    this.ensureInitialized();

    try {
      const { stdout } = await this.execGit(['worktree', 'list', '--porcelain']);
      const worktrees = this.parseWorktreeList(stdout);

      if (includeMain) {
        return worktrees;
      }
      return worktrees.filter((w) => !w.isMain);
    } catch (error) {
      throw new WorktreeError(
        'Failed to list worktrees',
        'LIST_FAILED',
        (error as Error).message
      );
    }
  }

  async getWorktree(worktreePath: string): Promise<WorktreeInfo | undefined> {
    this.ensureInitialized();

    const fullPath = this.resolvePath(worktreePath);
    // Resolve real path for comparison (handles symlinks like /tmp -> /private/tmp)
    let realFullPath: string;
    try {
      realFullPath = fs.realpathSync(fullPath);
    } catch {
      realFullPath = fullPath;
    }

    const worktrees = await this.listWorktrees(true);
    return worktrees.find((w) => {
      // Compare real paths to handle symlinks
      try {
        const realWPath = fs.realpathSync(w.path);
        return realWPath === realFullPath;
      } catch {
        return w.path === fullPath;
      }
    });
  }

  getWorktreePath(agentName: string, taskTitle?: string): string {
    const slug = taskTitle ? createSlugFromTitle(taskTitle) : undefined;
    const relativePath = generateWorktreePath(agentName, slug);
    return path.join(this.config.workspaceRoot, relativePath);
  }

  async getWorktreesForAgent(agentName: string): Promise<WorktreeInfo[]> {
    this.ensureInitialized();

    const worktrees = await this.listWorktrees();
    const safeName = agentName.toLowerCase().replace(/[^a-z0-9-]/g, '-');

    return worktrees.filter((w) => {
      // Check if the relative path starts with the agent's prefix
      // Match either exact name (.elemental/.worktrees/bob) or name with slug (.elemental/.worktrees/bob-feature)
      // Escape special regex characters in the worktreeDir path (like .)
      const escapedDir = this.config.worktreeDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pathPattern = new RegExp(`^${escapedDir}/${safeName}($|-)`);
      return pathPattern.test(w.relativePath);
    });
  }

  async worktreeExists(worktreePath: string): Promise<boolean> {
    const worktree = await this.getWorktree(worktreePath);
    return worktree !== undefined;
  }

  // ----------------------------------------
  // Branch Operations
  // ----------------------------------------

  async getCurrentBranch(): Promise<string> {
    this.ensureInitialized();

    try {
      const { stdout } = await this.execGit(['rev-parse', '--abbrev-ref', 'HEAD']);
      return stdout.trim();
    } catch (error) {
      throw new WorktreeError(
        'Failed to get current branch',
        'BRANCH_QUERY_FAILED',
        (error as Error).message
      );
    }
  }

  async getDefaultBranch(): Promise<string> {
    if (this.defaultBranch) {
      return this.defaultBranch;
    }

    this.defaultBranch = await this.detectDefaultBranch();
    return this.defaultBranch;
  }

  async branchExists(branchName: string): Promise<boolean> {
    try {
      await this.execGit(['rev-parse', '--verify', `refs/heads/${branchName}`]);
      return true;
    } catch {
      return false;
    }
  }

  // ----------------------------------------
  // Private Helpers
  // ----------------------------------------

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new WorktreeError(
        'WorktreeManager not initialized. Call initWorkspace() first.',
        'NOT_INITIALIZED'
      );
    }
  }

  private async execGit(args: string[]): Promise<{ stdout: string; stderr: string }> {
    const command = `git ${args.join(' ')}`;
    return execAsync(command, {
      cwd: this.config.workspaceRoot,
      encoding: 'utf8',
    });
  }

  private resolvePath(worktreePath: string): string {
    if (path.isAbsolute(worktreePath)) {
      return worktreePath;
    }
    return path.join(this.config.workspaceRoot, worktreePath);
  }

  private getRelativePath(fullPath: string): string {
    // Use the real workspace root for relative path calculation to handle symlinks
    const baseRoot = this.realWorkspaceRoot ?? this.config.workspaceRoot;
    // Also resolve the full path to handle symlinks in both paths
    let realFullPath = fullPath;
    try {
      realFullPath = fs.realpathSync(fullPath);
    } catch {
      // Path might not exist yet during creation, use as-is
    }
    return path.relative(baseRoot, realFullPath);
  }

  private parseWorktreeList(output: string): WorktreeInfo[] {
    const worktrees: WorktreeInfo[] = [];
    const lines = output.trim().split('\n');

    // Use a mutable interface for parsing
    interface MutableWorktreeInfo {
      path?: string;
      head?: string;
      branch?: string;
      isMain?: boolean;
    }

    let current: MutableWorktreeInfo = {};

    for (const line of lines) {
      if (line.startsWith('worktree ')) {
        // Start of new worktree entry
        if (current.path) {
          worktrees.push(this.finalizeWorktreeInfo(current));
        }
        current = {
          path: line.substring(9),
          isMain: false,
        };
      } else if (line.startsWith('HEAD ')) {
        current.head = line.substring(5);
      } else if (line.startsWith('branch ')) {
        // Remove refs/heads/ prefix
        const branch = line.substring(7);
        current.branch = branch.replace(/^refs\/heads\//, '');
      } else if (line === 'bare') {
        current.isMain = true;
      } else if (line === '') {
        // End of entry
        if (current.path) {
          worktrees.push(this.finalizeWorktreeInfo(current));
          current = {};
        }
      }
    }

    // Handle last entry
    if (current.path) {
      worktrees.push(this.finalizeWorktreeInfo(current));
    }

    // The first worktree is always the main one
    if (worktrees.length > 0) {
      (worktrees[0] as { isMain: boolean }).isMain = true;
    }

    return worktrees;
  }

  private finalizeWorktreeInfo(partial: { path?: string; head?: string; branch?: string; isMain?: boolean }): WorktreeInfo {
    const fullPath = partial.path!;
    const relativePath = this.getRelativePath(fullPath);
    const state = this.worktreeStates.get(relativePath) ?? 'active';

    // Parse agent name and task ID from path if it matches our pattern
    let agentName: string | undefined;
    let taskId: string | undefined;

    // Escape special regex characters in the worktreeDir path and match agent name
    const escapedDir = this.config.worktreeDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = relativePath.match(new RegExp(`^${escapedDir}/([^-]+)-`));
    if (match) {
      agentName = match[1];
      // Task ID might be in the branch name
      const branchMatch = partial.branch?.match(/^agent\/[^/]+\/([^-]+)/);
      if (branchMatch) {
        taskId = branchMatch[1];
      }
    }

    return {
      path: fullPath,
      relativePath,
      branch: partial.branch ?? 'HEAD',
      head: partial.head ?? '',
      isMain: partial.isMain ?? false,
      state,
      agentName,
      taskId,
    };
  }

  private async detectDefaultBranch(): Promise<string> {
    // Check config first
    if (this.config.defaultBaseBranch) {
      return this.config.defaultBaseBranch;
    }

    // Try to detect from remote
    try {
      const { stdout } = await this.execGit(['remote', 'show', 'origin']);
      const match = stdout.match(/HEAD branch: (.+)/);
      if (match) {
        return match[1].trim();
      }
    } catch {
      // No remote or error, continue
    }

    // Try common default branch names
    for (const branch of ['main', 'master', 'develop']) {
      if (await this.branchExists(branch)) {
        return branch;
      }
    }

    // Fall back to current branch
    return this.getCurrentBranch();
  }

  private async ensureGitignore(): Promise<void> {
    const gitignorePath = path.join(this.config.workspaceRoot, '.gitignore');
    const worktreeDirPattern = `/${this.config.worktreeDir}/`;

    let content = '';
    if (fs.existsSync(gitignorePath)) {
      content = fs.readFileSync(gitignorePath, 'utf8');
    }

    if (!content.includes(worktreeDirPattern)) {
      const newContent = content.endsWith('\n')
        ? content + worktreeDirPattern + '\n'
        : content + '\n' + worktreeDirPattern + '\n';
      fs.writeFileSync(gitignorePath, newContent, 'utf8');
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Creates a WorktreeManager instance
 */
export function createWorktreeManager(config: WorktreeManagerConfig): WorktreeManager {
  return new WorktreeManagerImpl(config);
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Type guard to check if a value is a valid WorktreeState
 */
export function isWorktreeState(value: unknown): value is WorktreeState {
  return typeof value === 'string' && WorktreeStates.includes(value as WorktreeState);
}

/**
 * Checks if a state transition is valid
 */
export function isValidStateTransition(from: WorktreeState, to: WorktreeState): boolean {
  return WorktreeStateTransitions[from].includes(to);
}

/**
 * Gets human-readable description of a worktree state
 */
export function getWorktreeStateDescription(state: WorktreeState): string {
  switch (state) {
    case 'creating':
      return 'Being created';
    case 'active':
      return 'Active and in use';
    case 'suspended':
      return 'Suspended (can be resumed)';
    case 'merging':
      return 'Branch being merged';
    case 'cleaning':
      return 'Being cleaned up';
    case 'archived':
      return 'Archived (removed)';
    default:
      return 'Unknown';
  }
}

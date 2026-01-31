/**
 * Dispatch Daemon Service
 *
 * This daemon runs continuous polling loops to coordinate task assignment
 * and message delivery across all agents in the orchestration system.
 *
 * Key features:
 * - Worker availability polling: Assigns unassigned tasks to available workers
 * - Inbox polling: Delivers messages and spawns agents when needed
 * - Steward trigger polling: Activates stewards based on scheduled triggers
 * - Workflow task polling: Assigns workflow tasks to available stewards
 *
 * The daemon implements the dispatch behavior defined in ORCHESTRATION_PLAN.md:
 * - Workers are spawned INSIDE their worktree directory
 * - Handoff branches are reused when present in task metadata
 * - Messages are forwarded to active sessions or spawn new ones
 *
 * @module
 */

import { EventEmitter } from 'node:events';
import type {
  EntityId,
  ElementId,
  Task,
  Message,
  InboxItem,
} from '@elemental/core';
import { InboxStatus, createTimestamp, TaskStatus } from '@elemental/core';
import type { ElementalAPI, InboxService } from '@elemental/sdk';

import type { AgentRegistry, AgentEntity } from './agent-registry.js';
import { getAgentMetadata } from './agent-registry.js';
import type { SessionManager, SessionRecord } from '../runtime/session-manager.js';
import type { DispatchService, DispatchOptions } from './dispatch-service.js';
import type { WorktreeManager, CreateWorktreeResult } from '../git/worktree-manager.js';
import type { TaskAssignmentService } from './task-assignment-service.js';
import type { StewardScheduler } from './steward-scheduler.js';
import type { WorkerMetadata, StewardMetadata } from '../types/agent.js';
import { getOrchestratorTaskMeta } from '../types/task-meta.js';

// ============================================================================
// Constants
// ============================================================================

/**
 * Default poll interval in milliseconds for dispatch daemon (5 seconds)
 */
export const DISPATCH_DAEMON_DEFAULT_POLL_INTERVAL_MS = 5000;

/**
 * Minimum poll interval in milliseconds for dispatch daemon (1 second)
 */
export const DISPATCH_DAEMON_MIN_POLL_INTERVAL_MS = 1000;

/**
 * Maximum poll interval in milliseconds for dispatch daemon (1 minute)
 */
export const DISPATCH_DAEMON_MAX_POLL_INTERVAL_MS = 60000;

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration for the Dispatch Daemon
 */
export interface DispatchDaemonConfig {
  /**
   * Poll interval in milliseconds.
   * Default: 5000 (5 seconds)
   */
  readonly pollIntervalMs?: number;

  /**
   * Whether worker availability polling is enabled.
   * Default: true
   */
  readonly workerAvailabilityPollEnabled?: boolean;

  /**
   * Whether inbox polling is enabled.
   * Default: true
   */
  readonly inboxPollEnabled?: boolean;

  /**
   * Whether steward trigger polling is enabled.
   * Default: true
   */
  readonly stewardTriggerPollEnabled?: boolean;

  /**
   * Whether workflow task polling is enabled.
   * Default: true
   */
  readonly workflowTaskPollEnabled?: boolean;
}

/**
 * Result of a poll operation
 */
export interface PollResult {
  /** The poll type */
  readonly pollType: 'worker-availability' | 'inbox' | 'steward-trigger' | 'workflow-task';
  /** Timestamp when the poll started */
  readonly startedAt: string;
  /** Duration of the poll in milliseconds */
  readonly durationMs: number;
  /** Number of items processed */
  readonly processed: number;
  /** Number of errors encountered */
  readonly errors: number;
  /** Error messages if any */
  readonly errorMessages?: string[];
}

/**
 * Internal normalized configuration
 */
interface NormalizedConfig {
  pollIntervalMs: number;
  workerAvailabilityPollEnabled: boolean;
  inboxPollEnabled: boolean;
  stewardTriggerPollEnabled: boolean;
  workflowTaskPollEnabled: boolean;
}

// ============================================================================
// Dispatch Daemon Interface
// ============================================================================

/**
 * Dispatch Daemon interface for coordinating task assignment and message delivery.
 *
 * The daemon provides methods for:
 * - Starting and stopping the polling loops
 * - Manual trigger of individual poll operations
 * - Configuration management
 */
export interface DispatchDaemon {
  // ----------------------------------------
  // Lifecycle
  // ----------------------------------------

  /**
   * Starts the dispatch daemon with all enabled polling loops.
   */
  start(): void;

  /**
   * Stops the dispatch daemon and all polling loops.
   */
  stop(): void;

  /**
   * Whether the daemon is currently running.
   */
  isRunning(): boolean;

  // ----------------------------------------
  // Manual Poll Triggers
  // ----------------------------------------

  /**
   * Manually triggers worker availability polling.
   * Finds available ephemeral workers and assigns unassigned tasks.
   */
  pollWorkerAvailability(): Promise<PollResult>;

  /**
   * Manually triggers inbox polling.
   * Processes unread messages for all agents.
   */
  pollInboxes(): Promise<PollResult>;

  /**
   * Manually triggers steward trigger polling.
   * Checks for scheduled steward activations.
   */
  pollStewardTriggers(): Promise<PollResult>;

  /**
   * Manually triggers workflow task polling.
   * Assigns workflow tasks to available stewards.
   */
  pollWorkflowTasks(): Promise<PollResult>;

  // ----------------------------------------
  // Configuration
  // ----------------------------------------

  /**
   * Gets the current configuration.
   */
  getConfig(): Required<DispatchDaemonConfig>;

  /**
   * Updates the configuration.
   * Takes effect on the next poll cycle.
   */
  updateConfig(config: Partial<DispatchDaemonConfig>): void;

  // ----------------------------------------
  // Events
  // ----------------------------------------

  /**
   * Subscribe to daemon events.
   */
  on(event: 'poll:start', listener: (pollType: string) => void): void;
  on(event: 'poll:complete', listener: (result: PollResult) => void): void;
  on(event: 'poll:error', listener: (pollType: string, error: Error) => void): void;
  on(event: 'task:dispatched', listener: (taskId: ElementId, agentId: EntityId) => void): void;
  on(event: 'message:forwarded', listener: (messageId: string, agentId: EntityId) => void): void;
  on(event: 'agent:spawned', listener: (agentId: EntityId, worktree?: string) => void): void;

  /**
   * Unsubscribe from daemon events.
   */
  off(event: string, listener: (...args: unknown[]) => void): void;
}

// ============================================================================
// Dispatch Daemon Implementation
// ============================================================================

/**
 * Implementation of the Dispatch Daemon.
 */
export class DispatchDaemonImpl implements DispatchDaemon {
  private readonly api: ElementalAPI;
  private readonly agentRegistry: AgentRegistry;
  private readonly sessionManager: SessionManager;
  private readonly dispatchService: DispatchService;
  private readonly worktreeManager: WorktreeManager;
  private readonly taskAssignment: TaskAssignmentService;
  private readonly stewardScheduler: StewardScheduler;
  private readonly inboxService: InboxService;
  private readonly emitter: EventEmitter;

  private config: NormalizedConfig;
  private running = false;
  private pollIntervalHandle?: NodeJS.Timeout;

  constructor(
    api: ElementalAPI,
    agentRegistry: AgentRegistry,
    sessionManager: SessionManager,
    dispatchService: DispatchService,
    worktreeManager: WorktreeManager,
    taskAssignment: TaskAssignmentService,
    stewardScheduler: StewardScheduler,
    inboxService: InboxService,
    config?: DispatchDaemonConfig
  ) {
    this.api = api;
    this.agentRegistry = agentRegistry;
    this.sessionManager = sessionManager;
    this.dispatchService = dispatchService;
    this.worktreeManager = worktreeManager;
    this.taskAssignment = taskAssignment;
    this.stewardScheduler = stewardScheduler;
    this.inboxService = inboxService;
    this.emitter = new EventEmitter();
    this.config = this.normalizeConfig(config);
  }

  // ----------------------------------------
  // Lifecycle
  // ----------------------------------------

  start(): void {
    if (this.running) {
      return;
    }

    this.running = true;

    // Start the main poll loop
    this.pollIntervalHandle = setInterval(async () => {
      if (!this.running) {
        return;
      }

      try {
        await this.runPollCycle();
      } catch (error) {
        console.error('[dispatch-daemon] Poll cycle error:', error);
      }
    }, this.config.pollIntervalMs);

    // Run an initial poll cycle immediately
    this.runPollCycle().catch((error) => {
      console.error('[dispatch-daemon] Initial poll cycle error:', error);
    });
  }

  stop(): void {
    if (!this.running) {
      return;
    }

    this.running = false;

    if (this.pollIntervalHandle) {
      clearInterval(this.pollIntervalHandle);
      this.pollIntervalHandle = undefined;
    }
  }

  isRunning(): boolean {
    return this.running;
  }

  // ----------------------------------------
  // Manual Poll Triggers
  // ----------------------------------------

  async pollWorkerAvailability(): Promise<PollResult> {
    const startedAt = new Date().toISOString();
    const startTime = Date.now();
    let processed = 0;
    let errors = 0;
    const errorMessages: string[] = [];

    this.emitter.emit('poll:start', 'worker-availability');

    try {
      // 1. Get all ephemeral workers
      const workers = await this.agentRegistry.listAgents({
        role: 'worker',
        workerMode: 'ephemeral',
      });

      // 2. Find workers with no active session
      const availableWorkers: AgentEntity[] = [];
      for (const worker of workers) {
        const session = this.sessionManager.getActiveSession(worker.id as unknown as EntityId);
        if (!session) {
          availableWorkers.push(worker);
        }
      }

      // 3. For each available worker, try to assign a task
      for (const worker of availableWorkers) {
        try {
          const assigned = await this.assignTaskToWorker(worker);
          if (assigned) {
            processed++;
          }
        } catch (error) {
          errors++;
          const errorMessage = error instanceof Error ? error.message : String(error);
          errorMessages.push(`Worker ${worker.name}: ${errorMessage}`);
          console.error(`[dispatch-daemon] Error assigning task to worker ${worker.name}:`, error);
        }
      }
    } catch (error) {
      errors++;
      const errorMessage = error instanceof Error ? error.message : String(error);
      errorMessages.push(errorMessage);
      console.error('[dispatch-daemon] Error in pollWorkerAvailability:', error);
    }

    const result: PollResult = {
      pollType: 'worker-availability',
      startedAt,
      durationMs: Date.now() - startTime,
      processed,
      errors,
      errorMessages: errorMessages.length > 0 ? errorMessages : undefined,
    };

    this.emitter.emit('poll:complete', result);
    return result;
  }

  async pollInboxes(): Promise<PollResult> {
    const startedAt = new Date().toISOString();
    const startTime = Date.now();
    let processed = 0;
    let errors = 0;
    const errorMessages: string[] = [];

    this.emitter.emit('poll:start', 'inbox');

    try {
      // Get all agents
      const agents = await this.agentRegistry.listAgents();

      for (const agent of agents) {
        try {
          const agentId = agent.id as unknown as EntityId;
          const meta = getAgentMetadata(agent);
          if (!meta) continue;

          // Get unread messages for this agent
          const inboxItems = this.inboxService.getInbox(agentId, {
            status: InboxStatus.UNREAD,
            limit: 50, // Process up to 50 messages per agent per cycle
          });

          for (const item of inboxItems) {
            try {
              const messageProcessed = await this.processInboxItem(agent, item, meta);
              if (messageProcessed) {
                processed++;
              }
            } catch (error) {
              errors++;
              const errorMessage = error instanceof Error ? error.message : String(error);
              errorMessages.push(`Message ${item.messageId}: ${errorMessage}`);
            }
          }
        } catch (error) {
          errors++;
          const errorMessage = error instanceof Error ? error.message : String(error);
          errorMessages.push(`Agent ${agent.name}: ${errorMessage}`);
        }
      }
    } catch (error) {
      errors++;
      const errorMessage = error instanceof Error ? error.message : String(error);
      errorMessages.push(errorMessage);
      console.error('[dispatch-daemon] Error in pollInboxes:', error);
    }

    const result: PollResult = {
      pollType: 'inbox',
      startedAt,
      durationMs: Date.now() - startTime,
      processed,
      errors,
      errorMessages: errorMessages.length > 0 ? errorMessages : undefined,
    };

    this.emitter.emit('poll:complete', result);
    return result;
  }

  async pollStewardTriggers(): Promise<PollResult> {
    const startedAt = new Date().toISOString();
    const startTime = Date.now();
    let processed = 0;
    let errors = 0;
    const errorMessages: string[] = [];

    this.emitter.emit('poll:start', 'steward-trigger');

    try {
      // The StewardScheduler handles trigger evaluation internally
      // We just need to check if any stewards need to be triggered
      // This is mainly handled by the scheduler's own polling, but
      // we can use this to ensure the scheduler is running

      if (!this.stewardScheduler.isRunning()) {
        // Start the scheduler if it's not running
        await this.stewardScheduler.start();
        processed++;
      }

      // Get stats to report on activity
      const stats = this.stewardScheduler.getStats();
      processed += stats.runningExecutions;
    } catch (error) {
      errors++;
      const errorMessage = error instanceof Error ? error.message : String(error);
      errorMessages.push(errorMessage);
      console.error('[dispatch-daemon] Error in pollStewardTriggers:', error);
    }

    const result: PollResult = {
      pollType: 'steward-trigger',
      startedAt,
      durationMs: Date.now() - startTime,
      processed,
      errors,
      errorMessages: errorMessages.length > 0 ? errorMessages : undefined,
    };

    this.emitter.emit('poll:complete', result);
    return result;
  }

  async pollWorkflowTasks(): Promise<PollResult> {
    const startedAt = new Date().toISOString();
    const startTime = Date.now();
    let processed = 0;
    let errors = 0;
    const errorMessages: string[] = [];

    this.emitter.emit('poll:start', 'workflow-task');

    try {
      // 1. Find incomplete workflows without an assigned steward
      // For now, we look for tasks with workflow-related tags that are unassigned
      const stewards = await this.agentRegistry.getStewards();

      // Find available stewards (no active session)
      const availableStewards: AgentEntity[] = [];
      for (const steward of stewards) {
        const session = this.sessionManager.getActiveSession(steward.id as unknown as EntityId);
        if (!session) {
          availableStewards.push(steward);
        }
      }

      // For each available steward, check for workflow tasks they can handle
      for (const steward of availableStewards) {
        try {
          const meta = getAgentMetadata(steward) as StewardMetadata | undefined;
          if (!meta) continue;

          // Look for unassigned tasks that match this steward's focus
          // For merge stewards, look for tasks with 'merge' or 'review' tags
          // For health stewards, look for tasks with 'health' or 'check' tags
          const focusTag = meta.stewardFocus;

          const unassignedTasks = await this.taskAssignment.getUnassignedTasks({
            taskStatus: [TaskStatus.OPEN, TaskStatus.IN_PROGRESS],
          });

          // Filter tasks that match this steward's focus
          const matchingTasks = unassignedTasks.filter((task) => {
            const tags = task.tags ?? [];
            return tags.includes(focusTag) ||
              tags.includes(`steward-${focusTag}`) ||
              tags.includes('workflow');
          });

          if (matchingTasks.length > 0) {
            // Assign the highest priority task to this steward
            const sortedTasks = [...matchingTasks].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
            const task = sortedTasks[0];
            const stewardId = steward.id as unknown as EntityId;

            await this.dispatchService.dispatch(task.id, stewardId);
            processed++;

            this.emitter.emit('task:dispatched', task.id, stewardId);
          }
        } catch (error) {
          errors++;
          const errorMessage = error instanceof Error ? error.message : String(error);
          errorMessages.push(`Steward ${steward.name}: ${errorMessage}`);
        }
      }
    } catch (error) {
      errors++;
      const errorMessage = error instanceof Error ? error.message : String(error);
      errorMessages.push(errorMessage);
      console.error('[dispatch-daemon] Error in pollWorkflowTasks:', error);
    }

    const result: PollResult = {
      pollType: 'workflow-task',
      startedAt,
      durationMs: Date.now() - startTime,
      processed,
      errors,
      errorMessages: errorMessages.length > 0 ? errorMessages : undefined,
    };

    this.emitter.emit('poll:complete', result);
    return result;
  }

  // ----------------------------------------
  // Configuration
  // ----------------------------------------

  getConfig(): Required<DispatchDaemonConfig> {
    return { ...this.config };
  }

  updateConfig(config: Partial<DispatchDaemonConfig>): void {
    this.config = this.normalizeConfig({ ...this.config, ...config });
  }

  // ----------------------------------------
  // Events
  // ----------------------------------------

  on(event: 'poll:start', listener: (pollType: string) => void): void;
  on(event: 'poll:complete', listener: (result: PollResult) => void): void;
  on(event: 'poll:error', listener: (pollType: string, error: Error) => void): void;
  on(event: 'task:dispatched', listener: (taskId: ElementId, agentId: EntityId) => void): void;
  on(event: 'message:forwarded', listener: (messageId: string, agentId: EntityId) => void): void;
  on(event: 'agent:spawned', listener: (agentId: EntityId, worktree?: string) => void): void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(event: string, listener: (...args: any[]) => void): void {
    this.emitter.on(event, listener);
  }

  off(event: string, listener: (...args: unknown[]) => void): void {
    this.emitter.off(event, listener);
  }

  // ----------------------------------------
  // Private Helpers
  // ----------------------------------------

  private normalizeConfig(config?: DispatchDaemonConfig): NormalizedConfig {
    let pollIntervalMs = config?.pollIntervalMs ?? DISPATCH_DAEMON_DEFAULT_POLL_INTERVAL_MS;
    pollIntervalMs = Math.max(DISPATCH_DAEMON_MIN_POLL_INTERVAL_MS, Math.min(DISPATCH_DAEMON_MAX_POLL_INTERVAL_MS, pollIntervalMs));

    return {
      pollIntervalMs,
      workerAvailabilityPollEnabled: config?.workerAvailabilityPollEnabled ?? true,
      inboxPollEnabled: config?.inboxPollEnabled ?? true,
      stewardTriggerPollEnabled: config?.stewardTriggerPollEnabled ?? true,
      workflowTaskPollEnabled: config?.workflowTaskPollEnabled ?? true,
    };
  }

  /**
   * Runs a complete poll cycle for all enabled polling loops.
   */
  private async runPollCycle(): Promise<void> {
    // Run polls sequentially to avoid overwhelming the system
    if (this.config.workerAvailabilityPollEnabled) {
      await this.pollWorkerAvailability();
    }

    if (this.config.inboxPollEnabled) {
      await this.pollInboxes();
    }

    if (this.config.stewardTriggerPollEnabled) {
      await this.pollStewardTriggers();
    }

    if (this.config.workflowTaskPollEnabled) {
      await this.pollWorkflowTasks();
    }
  }

  /**
   * Assigns the highest priority unassigned task to a worker.
   * Handles handoff branches by reusing existing worktrees.
   */
  private async assignTaskToWorker(worker: AgentEntity): Promise<boolean> {
    // Get highest priority unassigned task
    const unassignedTasks = await this.taskAssignment.getUnassignedTasks({
      taskStatus: [TaskStatus.OPEN],
    });

    if (unassignedTasks.length === 0) {
      return false;
    }

    // Sort by priority (higher is more urgent)
    const sortedTasks = [...unassignedTasks].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
    const task = sortedTasks[0];
    const workerId = worker.id as unknown as EntityId;

    // Check for existing worktree/branch in task metadata
    // Priority: handoff > existing assignment > create new
    const taskMeta = getOrchestratorTaskMeta(task.metadata as Record<string, unknown> | undefined);
    const handoffBranch = taskMeta?.handoffBranch;
    const handoffWorktree = taskMeta?.handoffWorktree;
    const existingBranch = taskMeta?.branch;
    const existingWorktree = taskMeta?.worktree;

    let worktreePath: string;
    let branch: string;

    // Check handoff first (takes priority)
    if (handoffBranch && handoffWorktree) {
      worktreePath = handoffWorktree;
      branch = handoffBranch;

      // Verify the worktree still exists
      const exists = await this.worktreeManager.worktreeExists(worktreePath);
      if (!exists) {
        // Worktree was cleaned up, create a new one
        const worktreeResult = await this.createWorktreeForTask(worker, task);
        worktreePath = worktreeResult.path;
        branch = worktreeResult.branch;
      }
    }
    // Check for existing assignment worktree (from previous attempt)
    else if (existingBranch && existingWorktree) {
      worktreePath = existingWorktree;
      branch = existingBranch;

      // Verify the worktree still exists
      const exists = await this.worktreeManager.worktreeExists(worktreePath);
      if (!exists) {
        // Worktree was cleaned up, create a new one
        const worktreeResult = await this.createWorktreeForTask(worker, task);
        worktreePath = worktreeResult.path;
        branch = worktreeResult.branch;
      }
    }
    // No existing worktree, create a new one
    else {
      const worktreeResult = await this.createWorktreeForTask(worker, task);
      worktreePath = worktreeResult.path;
      branch = worktreeResult.branch;
    }

    // Dispatch task (assigns + sends message)
    const dispatchOptions: DispatchOptions = {
      branch,
      worktree: worktreePath,
      markAsStarted: true,
      priority: task.priority,
    };

    await this.dispatchService.dispatch(task.id, workerId, dispatchOptions);
    this.emitter.emit('task:dispatched', task.id, workerId);

    // Build initial prompt with task context
    const initialPrompt = this.buildTaskPrompt(task);

    // Spawn worker INSIDE the worktree
    await this.sessionManager.startSession(workerId, {
      workingDirectory: worktreePath,
      worktree: worktreePath,
      initialPrompt,
    });

    this.emitter.emit('agent:spawned', workerId, worktreePath);

    return true;
  }

  /**
   * Creates a worktree for a task assignment.
   */
  private async createWorktreeForTask(worker: AgentEntity, task: Task): Promise<CreateWorktreeResult> {
    return this.worktreeManager.createWorktree({
      agentName: worker.name,
      taskId: task.id,
      taskTitle: task.title,
    });
  }

  /**
   * Builds the initial prompt for a task assignment.
   */
  private buildTaskPrompt(task: Task): string {
    const parts = [
      '## Task Assignment',
      '',
      `**Task ID:** ${task.id}`,
      `**Title:** ${task.title}`,
    ];

    if (task.priority !== undefined) {
      parts.push(`**Priority:** ${task.priority}`);
    }

    // Note: Task.descriptionRef is a reference to a Document element
    // The actual content would need to be fetched separately
    if (task.descriptionRef) {
      parts.push('', `**Description Document:** ${task.descriptionRef}`);
    }

    // Include acceptance criteria if any
    if (task.acceptanceCriteria) {
      parts.push('', '### Acceptance Criteria', task.acceptanceCriteria);
    }

    // Include design reference if any
    if (task.designRef) {
      parts.push('', `**Design Document:** ${task.designRef}`);
    }

    // Include handoff notes if this is a handoff
    const taskMeta = getOrchestratorTaskMeta(task.metadata as Record<string, unknown> | undefined);
    if (taskMeta?.handoffNote) {
      parts.push('', '### Handoff Note', taskMeta.handoffNote);
    }

    return parts.join('\n');
  }

  /**
   * Processes an inbox item for an agent.
   * Handles dispatch messages, forwarding, and silent drops.
   */
  private async processInboxItem(
    agent: AgentEntity,
    item: InboxItem,
    meta: WorkerMetadata | StewardMetadata | { agentRole: 'director' }
  ): Promise<boolean> {
    const agentId = agent.id as unknown as EntityId;
    const activeSession = this.sessionManager.getActiveSession(agentId);

    // Get the message to check its type
    const message = await this.api.get<Message>(item.messageId as unknown as ElementId);
    if (!message) {
      // Message not found, mark as read and skip
      this.inboxService.markAsRead(item.id);
      return false;
    }

    const messageMetadata = message.metadata as Record<string, unknown> | undefined;
    const isDispatchMessage = messageMetadata?.type === 'task-dispatch' ||
      messageMetadata?.type === 'task-assignment' ||
      messageMetadata?.type === 'task-reassignment';

    // Handle based on agent role and session state
    if (meta.agentRole === 'worker' && (meta as WorkerMetadata).workerMode === 'ephemeral') {
      return this.processEphemeralWorkerMessage(agent, message, item, activeSession, isDispatchMessage);
    } else if (meta.agentRole === 'steward') {
      return this.processEphemeralWorkerMessage(agent, message, item, activeSession, isDispatchMessage);
    } else if (meta.agentRole === 'worker' && (meta as WorkerMetadata).workerMode === 'persistent') {
      return this.processPersistentAgentMessage(agent, message, item, activeSession);
    } else if (meta.agentRole === 'director') {
      return this.processPersistentAgentMessage(agent, message, item, activeSession);
    }

    return false;
  }

  /**
   * Process message for ephemeral workers and stewards.
   * - Dispatch message + no session -> spawn agent in worktree
   * - Non-dispatch + in session -> forward as user input
   * - Non-dispatch + no session -> mark read, drop silently
   */
  private async processEphemeralWorkerMessage(
    agent: AgentEntity,
    message: Message,
    item: InboxItem,
    activeSession: SessionRecord | undefined,
    isDispatchMessage: boolean
  ): Promise<boolean> {
    const agentId = agent.id as unknown as EntityId;

    if (isDispatchMessage && !activeSession) {
      // Dispatch message + no session -> spawn agent
      // The task dispatch should have already been handled by pollWorkerAvailability
      // Just mark as read
      this.inboxService.markAsRead(item.id);
      return true;
    }

    if (!isDispatchMessage && activeSession) {
      // Non-dispatch + in session -> forward as user input
      const forwardedContent = this.formatForwardedMessage(message);
      await this.sessionManager.messageSession(activeSession.id, {
        content: forwardedContent,
        senderId: message.sender,
      });

      this.inboxService.markAsRead(item.id);
      this.emitter.emit('message:forwarded', message.id, agentId);
      return true;
    }

    if (!isDispatchMessage && !activeSession) {
      // Non-dispatch + no session -> mark read, drop silently
      this.inboxService.markAsRead(item.id);
      return false;
    }

    // isDispatchMessage && activeSession -> forward as user input
    if (isDispatchMessage && activeSession) {
      const forwardedContent = this.formatForwardedMessage(message);
      await this.sessionManager.messageSession(activeSession.id, {
        content: forwardedContent,
        senderId: message.sender,
      });

      this.inboxService.markAsRead(item.id);
      this.emitter.emit('message:forwarded', message.id, agentId);
      return true;
    }

    return false;
  }

  /**
   * Process message for persistent workers and directors.
   * - If in session -> forward as user input
   * - Otherwise -> leave for next session
   */
  private async processPersistentAgentMessage(
    agent: AgentEntity,
    message: Message,
    item: InboxItem,
    activeSession: SessionRecord | undefined
  ): Promise<boolean> {
    const agentId = agent.id as unknown as EntityId;

    if (activeSession) {
      // In session -> forward as user input
      const forwardedContent = this.formatForwardedMessage(message);
      await this.sessionManager.messageSession(activeSession.id, {
        content: forwardedContent,
        senderId: message.sender,
      });

      this.inboxService.markAsRead(item.id);
      this.emitter.emit('message:forwarded', message.id, agentId);
      return true;
    }

    // No session -> leave message unread for next session
    return false;
  }

  /**
   * Formats a message for forwarding to an agent session.
   */
  private formatForwardedMessage(message: Message): string {
    const senderId = message.sender ?? 'unknown';
    // Get content from contentRef or use a placeholder
    // Note: In a full implementation, we would fetch the document content
    const contentPlaceholder = '[Message content - see contentRef for details]';

    return `[MESSAGE RECEIVED FROM ${senderId}]: ${contentPlaceholder}`;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Creates a DispatchDaemon instance
 */
export function createDispatchDaemon(
  api: ElementalAPI,
  agentRegistry: AgentRegistry,
  sessionManager: SessionManager,
  dispatchService: DispatchService,
  worktreeManager: WorktreeManager,
  taskAssignment: TaskAssignmentService,
  stewardScheduler: StewardScheduler,
  inboxService: InboxService,
  config?: DispatchDaemonConfig
): DispatchDaemon {
  return new DispatchDaemonImpl(
    api,
    agentRegistry,
    sessionManager,
    dispatchService,
    worktreeManager,
    taskAssignment,
    stewardScheduler,
    inboxService,
    config
  );
}

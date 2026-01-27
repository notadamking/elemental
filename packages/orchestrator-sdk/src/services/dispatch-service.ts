/**
 * Dispatch Service
 *
 * This service provides the dispatch operation that combines task assignment
 * with agent notification. It also integrates with the capability system
 * for intelligent task routing.
 *
 * Key features:
 * - Dispatch tasks to specific agents (assigns task + sends notification)
 * - Smart routing using capability-based agent matching
 * - Find best available agent for a task
 * - Support for priority and restart options
 *
 * @module
 */

import type {
  Task,
  ElementId,
  EntityId,
  DocumentId,
  Message,
  Channel,
  Timestamp,
} from '@elemental/core';
import {
  createTimestamp,
  createDocument,
  ContentType,
  ElementType,
  createMessage,
} from '@elemental/core';
import type { ElementalAPI } from '@elemental/sdk';

import type { TaskCapabilityRequirements } from '../types/index.js';
import type { AgentEntity } from '../api/orchestrator-api.js';

import type { TaskAssignmentService, AssignTaskOptions } from './task-assignment-service.js';
import type { AgentRegistry } from './agent-registry.js';
import {
  findAgentsForTask,
  getTaskCapabilityRequirements,
  type AgentMatchEntry,
} from './capability-service.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Options for dispatching a task to an agent
 */
export interface DispatchOptions {
  /** Git branch for the task (auto-generated if not provided) */
  branch?: string;
  /** Worktree path for the task (auto-generated if not provided) */
  worktree?: string;
  /** Claude Code session ID */
  sessionId?: string;
  /** Priority level (higher = more urgent). Used for notification message. */
  priority?: number;
  /** Whether to signal the agent to restart its session */
  restart?: boolean;
  /** Whether to mark the task as started immediately */
  markAsStarted?: boolean;
  /** Custom notification message (defaults to standard task assignment message) */
  notificationMessage?: string;
  /** Additional metadata for the notification */
  notificationMetadata?: Record<string, unknown>;
  /** Entity performing the dispatch (for message sender) */
  dispatchedBy?: EntityId;
}

/**
 * Result of a dispatch operation
 */
export interface DispatchResult {
  /** The updated task after assignment */
  task: Task;
  /** The agent the task was dispatched to */
  agent: AgentEntity;
  /** The notification message sent to the agent */
  notification: Message;
  /** The channel the notification was sent to */
  channel: Channel;
  /** Whether this is a new assignment (true) or reassignment (false) */
  isNewAssignment: boolean;
  /** The dispatch timestamp */
  dispatchedAt: Timestamp;
}

/**
 * Options for finding the best agent and dispatching a task
 */
export interface SmartDispatchOptions extends DispatchOptions {
  /** Only consider agents that meet all task requirements */
  eligibleOnly?: boolean;
  /** Minimum capability score required (0-100) */
  minScore?: number;
}

/**
 * Result of smart dispatch candidate search
 */
export interface SmartDispatchCandidatesResult {
  /** Sorted list of candidate agents with their match scores */
  candidates: AgentMatchEntry[];
  /** The best candidate (first in sorted list) */
  bestCandidate: AgentMatchEntry | undefined;
  /** Whether the task has any capability requirements */
  hasRequirements: boolean;
  /** The task's capability requirements */
  requirements: TaskCapabilityRequirements;
}

/**
 * Message types for agent notifications
 */
export type DispatchMessageType =
  | 'task-assignment'
  | 'task-reassignment'
  | 'restart-signal';

/**
 * Metadata structure for dispatch notification messages
 */
export interface DispatchNotificationMetadata {
  type: DispatchMessageType;
  taskId: ElementId;
  priority?: number;
  restart?: boolean;
  branch?: string;
  worktree?: string;
  sessionId?: string;
  dispatchedAt: Timestamp;
  dispatchedBy?: EntityId;
  [key: string]: unknown;
}

// ============================================================================
// Dispatch Service Interface
// ============================================================================

/**
 * Dispatch Service interface for task dispatch operations.
 *
 * The service provides methods for:
 * - Dispatching tasks to specific agents
 * - Smart routing based on capabilities
 * - Sending notifications to agents
 */
export interface DispatchService {
  // ----------------------------------------
  // Direct Dispatch
  // ----------------------------------------

  /**
   * Dispatches a task to a specific agent.
   *
   * This method:
   * 1. Assigns the task to the agent (using TaskAssignmentService)
   * 2. Sends a notification message to the agent's channel
   * 3. Optionally signals the agent to restart
   *
   * @param taskId - The task to dispatch
   * @param agentId - The agent to dispatch to
   * @param options - Dispatch options
   * @returns The dispatch result
   */
  dispatch(
    taskId: ElementId,
    agentId: EntityId,
    options?: DispatchOptions
  ): Promise<DispatchResult>;

  /**
   * Dispatches multiple tasks to the same agent.
   *
   * This is more efficient than calling dispatch() multiple times
   * as it batches the notification.
   *
   * @param taskIds - The tasks to dispatch
   * @param agentId - The agent to dispatch to
   * @param options - Dispatch options
   * @returns Array of dispatch results
   */
  dispatchBatch(
    taskIds: ElementId[],
    agentId: EntityId,
    options?: DispatchOptions
  ): Promise<DispatchResult[]>;

  // ----------------------------------------
  // Smart Dispatch (Capability-based routing)
  // ----------------------------------------

  /**
   * Finds the best available agent for a task and dispatches to them.
   *
   * This method:
   * 1. Gets available workers from the registry
   * 2. Matches them against task requirements using capability service
   * 3. Dispatches to the best match
   *
   * @param taskId - The task to find an agent for
   * @param options - Smart dispatch options
   * @returns The dispatch result
   * @throws Error if no eligible agents found
   */
  smartDispatch(
    taskId: ElementId,
    options?: SmartDispatchOptions
  ): Promise<DispatchResult>;

  /**
   * Gets candidate agents for a task ranked by capability match.
   *
   * @param taskId - The task to find agents for
   * @param options - Options for filtering candidates
   * @returns The candidates result
   */
  getCandidates(
    taskId: ElementId,
    options?: Omit<SmartDispatchOptions, 'autoDispatch'>
  ): Promise<SmartDispatchCandidatesResult>;

  /**
   * Gets the best available agent for a task.
   *
   * @param taskId - The task to find an agent for
   * @param options - Options for filtering candidates
   * @returns The best agent match or undefined if none found
   */
  getBestAgent(
    taskId: ElementId,
    options?: Omit<SmartDispatchOptions, 'autoDispatch'>
  ): Promise<AgentMatchEntry | undefined>;

  // ----------------------------------------
  // Notification
  // ----------------------------------------

  /**
   * Sends a notification to an agent without assigning a task.
   *
   * Useful for restart signals, status updates, etc.
   *
   * @param agentId - The agent to notify
   * @param messageType - Type of notification
   * @param content - Message content
   * @param metadata - Additional metadata
   * @returns The sent message
   */
  notifyAgent(
    agentId: EntityId,
    messageType: DispatchMessageType,
    content: string,
    metadata?: Record<string, unknown>
  ): Promise<Message>;
}

// ============================================================================
// Dispatch Service Implementation
// ============================================================================

/**
 * Implementation of the Dispatch Service.
 */
export class DispatchServiceImpl implements DispatchService {
  private readonly api: ElementalAPI;
  private readonly taskAssignment: TaskAssignmentService;
  private readonly agentRegistry: AgentRegistry;

  constructor(
    api: ElementalAPI,
    taskAssignment: TaskAssignmentService,
    agentRegistry: AgentRegistry
  ) {
    this.api = api;
    this.taskAssignment = taskAssignment;
    this.agentRegistry = agentRegistry;
  }

  // ----------------------------------------
  // Direct Dispatch
  // ----------------------------------------

  async dispatch(
    taskId: ElementId,
    agentId: EntityId,
    options?: DispatchOptions
  ): Promise<DispatchResult> {
    const dispatchedAt = createTimestamp();

    // Get the task to check if it's already assigned
    const existingTask = await this.api.get<Task>(taskId);
    if (!existingTask || existingTask.type !== ElementType.TASK) {
      throw new Error(`Task not found: ${taskId}`);
    }
    const isNewAssignment = !existingTask.assignee;

    // Get the agent
    const agent = await this.agentRegistry.getAgent(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    // Assign the task using TaskAssignmentService
    const assignOptions: AssignTaskOptions = {
      branch: options?.branch,
      worktree: options?.worktree,
      sessionId: options?.sessionId,
      markAsStarted: options?.markAsStarted,
    };
    const updatedTask = await this.taskAssignment.assignToAgent(
      taskId,
      agentId,
      assignOptions
    );

    // Get the agent's channel
    const channel = await this.agentRegistry.getAgentChannel(agentId);
    if (!channel) {
      throw new Error(`Agent channel not found for agent: ${agentId}`);
    }

    // Create notification message
    const messageType: DispatchMessageType = isNewAssignment
      ? 'task-assignment'
      : 'task-reassignment';

    const notificationMetadata: DispatchNotificationMetadata = {
      type: messageType,
      taskId,
      priority: options?.priority,
      restart: options?.restart,
      branch: assignOptions.branch,
      worktree: assignOptions.worktree,
      sessionId: assignOptions.sessionId,
      dispatchedAt,
      dispatchedBy: options?.dispatchedBy,
      ...(options?.notificationMetadata ?? {}),
    };

    const messageContent = options?.notificationMessage ??
      this.createNotificationContent(updatedTask, messageType, options);

    const notification = await this.sendNotification(
      agentId,
      channel.id as unknown as ElementId,
      messageContent,
      notificationMetadata,
      options?.dispatchedBy
    );

    return {
      task: updatedTask,
      agent,
      notification,
      channel,
      isNewAssignment,
      dispatchedAt,
    };
  }

  async dispatchBatch(
    taskIds: ElementId[],
    agentId: EntityId,
    options?: DispatchOptions
  ): Promise<DispatchResult[]> {
    // For now, dispatch sequentially
    // Future optimization: batch the notifications
    const results: DispatchResult[] = [];
    for (const taskId of taskIds) {
      const result = await this.dispatch(taskId, agentId, options);
      results.push(result);
    }
    return results;
  }

  // ----------------------------------------
  // Smart Dispatch (Capability-based routing)
  // ----------------------------------------

  async smartDispatch(
    taskId: ElementId,
    options?: SmartDispatchOptions
  ): Promise<DispatchResult> {
    const candidates = await this.getCandidates(taskId, options);

    if (candidates.candidates.length === 0) {
      throw new Error(`No eligible agents found for task: ${taskId}`);
    }

    const bestAgent = candidates.candidates[0].agent;
    return this.dispatch(
      taskId,
      bestAgent.id as unknown as EntityId,
      options
    );
  }

  async getCandidates(
    taskId: ElementId,
    options?: Omit<SmartDispatchOptions, 'autoDispatch'>
  ): Promise<SmartDispatchCandidatesResult> {
    // Get the task
    const task = await this.api.get<Task>(taskId);
    if (!task || task.type !== ElementType.TASK) {
      throw new Error(`Task not found: ${taskId}`);
    }

    // Get available workers
    const availableWorkers = await this.agentRegistry.getAvailableWorkers();

    // Check capacity for each worker
    const workersWithCapacity: AgentEntity[] = [];
    for (const worker of availableWorkers) {
      const hasCapacity = await this.taskAssignment.agentHasCapacity(
        worker.id as unknown as EntityId
      );
      if (hasCapacity) {
        workersWithCapacity.push(worker);
      }
    }

    // Get task requirements and find candidates
    const requirements = getTaskCapabilityRequirements(task);
    const hasRequirements = Boolean(
      requirements.requiredSkills?.length ||
      requirements.preferredSkills?.length ||
      requirements.requiredLanguages?.length ||
      requirements.preferredLanguages?.length
    );

    const candidates = findAgentsForTask(workersWithCapacity, task, {
      eligibleOnly: options?.eligibleOnly ?? true,
      minScore: options?.minScore,
    });

    return {
      candidates,
      bestCandidate: candidates[0],
      hasRequirements,
      requirements,
    };
  }

  async getBestAgent(
    taskId: ElementId,
    options?: Omit<SmartDispatchOptions, 'autoDispatch'>
  ): Promise<AgentMatchEntry | undefined> {
    const result = await this.getCandidates(taskId, options);
    return result.bestCandidate;
  }

  // ----------------------------------------
  // Notification
  // ----------------------------------------

  async notifyAgent(
    agentId: EntityId,
    messageType: DispatchMessageType,
    content: string,
    metadata?: Record<string, unknown>
  ): Promise<Message> {
    const channel = await this.agentRegistry.getAgentChannel(agentId);
    if (!channel) {
      throw new Error(`Agent channel not found for agent: ${agentId}`);
    }

    const fullMetadata: DispatchNotificationMetadata = {
      type: messageType,
      taskId: '' as ElementId, // No task associated
      dispatchedAt: createTimestamp(),
      ...(metadata ?? {}),
    };

    return this.sendNotification(
      agentId,
      channel.id as unknown as ElementId,
      content,
      fullMetadata
    );
  }

  // ----------------------------------------
  // Private Helpers
  // ----------------------------------------

  /**
   * Creates the notification content for a dispatch
   */
  private createNotificationContent(
    task: Task,
    messageType: DispatchMessageType,
    options?: DispatchOptions
  ): string {
    const priorityStr = options?.priority ? ` [Priority: ${options.priority}]` : '';
    const restartStr = options?.restart ? ' (restart requested)' : '';

    switch (messageType) {
      case 'task-assignment':
        return `Task assigned: ${task.title}${priorityStr}${restartStr}`;
      case 'task-reassignment':
        return `Task reassigned: ${task.title}${priorityStr}${restartStr}`;
      case 'restart-signal':
        return `Restart requested${restartStr}`;
      default:
        return `Notification: ${messageType}`;
    }
  }

  /**
   * Sends a notification message to an agent's channel
   */
  private async sendNotification(
    agentId: EntityId,
    channelId: ElementId,
    content: string,
    metadata: DispatchNotificationMetadata,
    dispatchedBy?: EntityId
  ): Promise<Message> {
    const sender = dispatchedBy ?? agentId;

    // Create a document for the message content
    const contentDoc = await createDocument({
      contentType: ContentType.TEXT,
      content,
      createdBy: sender,
      tags: ['dispatch-notification', metadata.type],
      metadata: { dispatchNotification: true },
    });

    // Save the document
    const savedDoc = await this.api.create(
      contentDoc as unknown as Record<string, unknown> & { createdBy: EntityId }
    );

    // Create message for the agent's channel
    const message = await createMessage({
      channelId: channelId as unknown as import('@elemental/core').ChannelId,
      sender,
      contentRef: savedDoc.id as unknown as DocumentId,
      tags: ['dispatch-notification', metadata.type],
      metadata: metadata as Record<string, unknown>,
    });

    // Save the message
    const savedMessage = await this.api.create(
      message as unknown as Record<string, unknown> & { createdBy: EntityId }
    );

    return savedMessage as unknown as Message;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Creates a DispatchService instance
 */
export function createDispatchService(
  api: ElementalAPI,
  taskAssignment: TaskAssignmentService,
  agentRegistry: AgentRegistry
): DispatchService {
  return new DispatchServiceImpl(api, taskAssignment, agentRegistry);
}

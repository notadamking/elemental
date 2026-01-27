/**
 * Inbox Polling Service (TB-O10b)
 *
 * This service provides periodic inbox checking for agent sessions.
 * It polls the agent's inbox for unread messages and dispatches them
 * based on message type.
 *
 * Key features:
 * - Configurable poll interval (default 30s)
 * - Message type-based processing
 * - Per-agent polling with start/stop controls
 * - Event emission for message processing
 *
 * @module
 */

import { EventEmitter } from 'node:events';
import type { EntityId, InboxItem } from '@elemental/core';
import { InboxStatus } from '@elemental/core';
import type { InboxService } from '@elemental/sdk';
import type { SessionManager } from './session-manager.js';
import type { AgentRegistry } from '../services/agent-registry.js';

// ============================================================================
// Constants
// ============================================================================

/**
 * Default poll interval in milliseconds (30 seconds)
 */
export const DEFAULT_POLL_INTERVAL_MS = 30_000;

/**
 * Minimum allowed poll interval in milliseconds (1 second)
 */
export const MIN_POLL_INTERVAL_MS = 1_000;

/**
 * Maximum allowed poll interval in milliseconds (5 minutes)
 */
export const MAX_POLL_INTERVAL_MS = 300_000;

// ============================================================================
// Message Type Constants
// ============================================================================

/**
 * Known message types for orchestrator inter-agent communication.
 * These are stored in message metadata.type field.
 */
export const OrchestratorMessageType = {
  /** New task has been assigned to the agent */
  TASK_ASSIGNMENT: 'task-assignment',
  /** Status update from another agent */
  STATUS_UPDATE: 'status-update',
  /** Agent is requesting help/assistance */
  HELP_REQUEST: 'help-request',
  /** Session handoff request */
  HANDOFF: 'handoff',
  /** Health check ping from steward */
  HEALTH_CHECK: 'health-check',
  /** Generic message (no specific type) */
  GENERIC: 'generic',
} as const;

export type OrchestratorMessageType =
  (typeof OrchestratorMessageType)[keyof typeof OrchestratorMessageType];

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration for inbox polling
 */
export interface InboxPollingConfig {
  /**
   * Interval between inbox checks in milliseconds.
   * Default: 30000 (30 seconds)
   * Min: 1000 (1 second)
   * Max: 300000 (5 minutes)
   */
  readonly pollIntervalMs?: number;

  /**
   * Whether to start polling automatically when an agent session starts.
   * Default: true
   */
  readonly autoStart?: boolean;

  /**
   * Whether to automatically mark messages as read after processing.
   * Default: true
   */
  readonly autoMarkAsRead?: boolean;

  /**
   * Maximum number of messages to process per poll cycle.
   * Default: 10
   */
  readonly maxMessagesPerPoll?: number;

  /**
   * Whether to process messages in order (oldest first) or newest first.
   * Default: true (oldest first - FIFO)
   */
  readonly processOldestFirst?: boolean;
}

/**
 * Processed message with parsed metadata
 */
export interface ProcessedInboxMessage {
  /** The inbox item */
  readonly item: InboxItem;
  /** Parsed message type from metadata */
  readonly messageType: OrchestratorMessageType;
  /** Raw message metadata (if available) */
  readonly metadata?: Record<string, unknown>;
  /** Whether the message was marked as read */
  readonly markedAsRead: boolean;
}

/**
 * Result of processing inbox messages
 */
export interface InboxPollResult {
  /** Agent entity ID */
  readonly agentId: EntityId;
  /** Number of messages found */
  readonly totalFound: number;
  /** Number of messages processed */
  readonly processed: number;
  /** Number of messages skipped (e.g., due to errors) */
  readonly skipped: number;
  /** Processed messages by type */
  readonly byType: Record<OrchestratorMessageType, ProcessedInboxMessage[]>;
  /** Timestamp of the poll */
  readonly polledAt: string;
  /** Duration of the poll in milliseconds */
  readonly durationMs: number;
}

/**
 * Polling state for an agent
 */
interface AgentPollingState {
  /** Agent entity ID */
  agentId: EntityId;
  /** Session ID if active */
  sessionId?: string;
  /** Timer handle for the interval */
  intervalHandle?: NodeJS.Timeout;
  /** Whether currently polling */
  isPolling: boolean;
  /** Last poll timestamp */
  lastPollAt?: string;
  /** Event emitter for this agent's polling */
  events: EventEmitter;
  /** Configuration for this agent */
  config: Required<InboxPollingConfig>;
}

/**
 * Callback for handling processed messages
 */
export type InboxMessageHandler = (
  message: ProcessedInboxMessage,
  agentId: EntityId
) => Promise<void> | void;

/**
 * Inbox Polling Service interface
 */
export interface InboxPollingService {
  // ----------------------------------------
  // Polling Control
  // ----------------------------------------

  /**
   * Starts polling for an agent.
   *
   * @param agentId - The agent entity ID
   * @param config - Optional polling configuration override
   * @returns Event emitter for polling events
   */
  startPolling(agentId: EntityId, config?: InboxPollingConfig): EventEmitter;

  /**
   * Stops polling for an agent.
   *
   * @param agentId - The agent entity ID
   */
  stopPolling(agentId: EntityId): void;

  /**
   * Checks if polling is active for an agent.
   *
   * @param agentId - The agent entity ID
   */
  isPolling(agentId: EntityId): boolean;

  /**
   * Triggers an immediate poll for an agent.
   * Does not affect the regular polling schedule.
   *
   * @param agentId - The agent entity ID
   * @returns The poll result
   */
  pollNow(agentId: EntityId): Promise<InboxPollResult>;

  // ----------------------------------------
  // Message Handlers
  // ----------------------------------------

  /**
   * Registers a handler for a specific message type.
   *
   * @param messageType - The message type to handle
   * @param handler - The handler function
   */
  onMessageType(messageType: OrchestratorMessageType, handler: InboxMessageHandler): void;

  /**
   * Registers a handler for all messages.
   *
   * @param handler - The handler function
   */
  onAnyMessage(handler: InboxMessageHandler): void;

  /**
   * Removes a handler for a specific message type.
   *
   * @param messageType - The message type
   * @param handler - The handler function to remove
   */
  offMessageType(messageType: OrchestratorMessageType, handler: InboxMessageHandler): void;

  /**
   * Removes a handler for all messages.
   *
   * @param handler - The handler function to remove
   */
  offAnyMessage(handler: InboxMessageHandler): void;

  // ----------------------------------------
  // Queries
  // ----------------------------------------

  /**
   * Gets the polling state for an agent.
   *
   * @param agentId - The agent entity ID
   */
  getPollingState(agentId: EntityId): {
    isPolling: boolean;
    lastPollAt?: string;
    config: InboxPollingConfig;
  } | undefined;

  /**
   * Gets all agents currently being polled.
   */
  getPollingAgents(): EntityId[];

  // ----------------------------------------
  // Configuration
  // ----------------------------------------

  /**
   * Updates the default configuration.
   *
   * @param config - New default configuration
   */
  setDefaultConfig(config: InboxPollingConfig): void;

  /**
   * Gets the default configuration.
   */
  getDefaultConfig(): Required<InboxPollingConfig>;

  // ----------------------------------------
  // Integration
  // ----------------------------------------

  /**
   * Integrates with session manager to auto-start/stop polling.
   * When a session starts, polling starts. When it stops, polling stops.
   *
   * @param sessionManager - The session manager to integrate with
   */
  integrateWithSessionManager(sessionManager: SessionManager): void;

  // ----------------------------------------
  // Lifecycle
  // ----------------------------------------

  /**
   * Stops all polling and cleans up resources.
   */
  dispose(): void;
}

// ============================================================================
// Implementation
// ============================================================================

/**
 * Implementation of the Inbox Polling Service.
 */
export class InboxPollingServiceImpl implements InboxPollingService {
  private readonly pollingStates: Map<EntityId, AgentPollingState> = new Map();
  private readonly typeHandlers: Map<OrchestratorMessageType, Set<InboxMessageHandler>> = new Map();
  private readonly anyHandlers: Set<InboxMessageHandler> = new Set();
  private defaultConfig: Required<InboxPollingConfig>;
  private disposed = false;

  constructor(
    private readonly inboxService: InboxService,
    _registry: AgentRegistry,
    config?: InboxPollingConfig
  ) {
    this.defaultConfig = this.normalizeConfig(config);
  }

  // ----------------------------------------
  // Polling Control
  // ----------------------------------------

  startPolling(agentId: EntityId, config?: InboxPollingConfig): EventEmitter {
    if (this.disposed) {
      throw new Error('InboxPollingService has been disposed');
    }

    // Stop existing polling if any
    this.stopPolling(agentId);

    const normalizedConfig = this.normalizeConfig({ ...this.defaultConfig, ...config });
    const events = new EventEmitter();

    const state: AgentPollingState = {
      agentId,
      isPolling: true,
      events,
      config: normalizedConfig,
    };

    // Start the interval
    state.intervalHandle = setInterval(async () => {
      if (!state.isPolling || this.disposed) {
        return;
      }
      try {
        const result = await this.doPoll(state);
        events.emit('poll', result);
      } catch (error) {
        events.emit('error', error);
      }
    }, normalizedConfig.pollIntervalMs);

    this.pollingStates.set(agentId, state);
    events.emit('start', { agentId, config: normalizedConfig });

    return events;
  }

  stopPolling(agentId: EntityId): void {
    const state = this.pollingStates.get(agentId);
    if (!state) {
      return;
    }

    state.isPolling = false;
    if (state.intervalHandle) {
      clearInterval(state.intervalHandle);
      state.intervalHandle = undefined;
    }

    state.events.emit('stop', { agentId });
    this.pollingStates.delete(agentId);
  }

  isPolling(agentId: EntityId): boolean {
    const state = this.pollingStates.get(agentId);
    return state?.isPolling ?? false;
  }

  async pollNow(agentId: EntityId): Promise<InboxPollResult> {
    if (this.disposed) {
      throw new Error('InboxPollingService has been disposed');
    }

    const state = this.pollingStates.get(agentId);
    if (state) {
      return this.doPoll(state);
    }

    // Create temporary state for one-time poll
    const tempState: AgentPollingState = {
      agentId,
      isPolling: false,
      events: new EventEmitter(),
      config: this.defaultConfig,
    };

    return this.doPoll(tempState);
  }

  // ----------------------------------------
  // Message Handlers
  // ----------------------------------------

  onMessageType(messageType: OrchestratorMessageType, handler: InboxMessageHandler): void {
    let handlers = this.typeHandlers.get(messageType);
    if (!handlers) {
      handlers = new Set();
      this.typeHandlers.set(messageType, handlers);
    }
    handlers.add(handler);
  }

  onAnyMessage(handler: InboxMessageHandler): void {
    this.anyHandlers.add(handler);
  }

  offMessageType(messageType: OrchestratorMessageType, handler: InboxMessageHandler): void {
    const handlers = this.typeHandlers.get(messageType);
    if (handlers) {
      handlers.delete(handler);
    }
  }

  offAnyMessage(handler: InboxMessageHandler): void {
    this.anyHandlers.delete(handler);
  }

  // ----------------------------------------
  // Queries
  // ----------------------------------------

  getPollingState(
    agentId: EntityId
  ): { isPolling: boolean; lastPollAt?: string; config: InboxPollingConfig } | undefined {
    const state = this.pollingStates.get(agentId);
    if (!state) {
      return undefined;
    }
    return {
      isPolling: state.isPolling,
      lastPollAt: state.lastPollAt,
      config: state.config,
    };
  }

  getPollingAgents(): EntityId[] {
    return Array.from(this.pollingStates.keys());
  }

  // ----------------------------------------
  // Configuration
  // ----------------------------------------

  setDefaultConfig(config: InboxPollingConfig): void {
    this.defaultConfig = this.normalizeConfig({ ...this.defaultConfig, ...config });
  }

  getDefaultConfig(): Required<InboxPollingConfig> {
    return { ...this.defaultConfig };
  }

  // ----------------------------------------
  // Integration
  // ----------------------------------------

  integrateWithSessionManager(_sessionManager: SessionManager): void {
    // Note: This would require modifications to SessionManager to expose
    // session start/stop events. For now, we document the intended pattern.
    // The actual integration would look like:
    //
    // sessionManager.on('sessionStart', (session: SessionRecord) => {
    //   if (this.defaultConfig.autoStart) {
    //     this.startPolling(session.agentId);
    //   }
    // });
    //
    // sessionManager.on('sessionStop', (session: SessionRecord) => {
    //   this.stopPolling(session.agentId);
    // });
  }

  // ----------------------------------------
  // Lifecycle
  // ----------------------------------------

  dispose(): void {
    this.disposed = true;

    // Stop all polling
    for (const agentId of this.pollingStates.keys()) {
      this.stopPolling(agentId);
    }

    // Clear handlers
    this.typeHandlers.clear();
    this.anyHandlers.clear();
  }

  // ----------------------------------------
  // Private Helpers
  // ----------------------------------------

  private normalizeConfig(config?: InboxPollingConfig): Required<InboxPollingConfig> {
    let pollIntervalMs = config?.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    pollIntervalMs = Math.max(MIN_POLL_INTERVAL_MS, Math.min(MAX_POLL_INTERVAL_MS, pollIntervalMs));

    return {
      pollIntervalMs,
      autoStart: config?.autoStart ?? true,
      autoMarkAsRead: config?.autoMarkAsRead ?? true,
      maxMessagesPerPoll: config?.maxMessagesPerPoll ?? 10,
      processOldestFirst: config?.processOldestFirst ?? true,
    };
  }

  private async doPoll(state: AgentPollingState): Promise<InboxPollResult> {
    const startTime = Date.now();
    const now = new Date().toISOString();
    state.lastPollAt = now;

    // Mutable accumulators for building result
    let totalFound = 0;
    let processed = 0;
    let skipped = 0;
    const byType: Record<OrchestratorMessageType, ProcessedInboxMessage[]> = {
      [OrchestratorMessageType.TASK_ASSIGNMENT]: [],
      [OrchestratorMessageType.STATUS_UPDATE]: [],
      [OrchestratorMessageType.HELP_REQUEST]: [],
      [OrchestratorMessageType.HANDOFF]: [],
      [OrchestratorMessageType.HEALTH_CHECK]: [],
      [OrchestratorMessageType.GENERIC]: [],
    };

    try {
      // Get unread inbox items for the agent
      const inboxItems = this.inboxService.getInbox(state.agentId, {
        status: InboxStatus.UNREAD,
        limit: state.config.maxMessagesPerPoll,
      });

      totalFound = inboxItems.length;

      if (inboxItems.length > 0) {
        // Sort messages based on config
        const sortedItems = state.config.processOldestFirst
          ? [...inboxItems].sort(
              (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
            )
          : [...inboxItems].sort(
              (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            );

        // Process each message
        for (const item of sortedItems) {
          try {
            const processedMessage = await this.processMessage(item, state);
            byType[processedMessage.messageType].push(processedMessage);
            processed++;
          } catch (error) {
            skipped++;
            state.events.emit('messageError', { item, error });
          }
        }
      }
    } catch (error) {
      state.events.emit('error', error);
    }

    return {
      agentId: state.agentId,
      totalFound,
      processed,
      skipped,
      byType,
      polledAt: now,
      durationMs: Date.now() - startTime,
    };
  }

  private async processMessage(
    item: InboxItem,
    state: AgentPollingState
  ): Promise<ProcessedInboxMessage> {
    // Parse message type from message metadata (would need message lookup)
    // For now, we extract from inbox item metadata if available
    const messageType = this.extractMessageType(item);

    const processedMessage: ProcessedInboxMessage = {
      item,
      messageType,
      metadata: undefined, // Would be populated from message lookup
      markedAsRead: false,
    };

    // Call registered handlers
    await this.invokeHandlers(processedMessage, state.agentId);

    // Mark as read if configured
    if (state.config.autoMarkAsRead) {
      try {
        this.inboxService.markAsRead(item.id);
        (processedMessage as { markedAsRead: boolean }).markedAsRead = true;
      } catch {
        // Ignore mark-as-read errors
      }
    }

    return processedMessage;
  }

  private extractMessageType(_item: InboxItem): OrchestratorMessageType {
    // The message type would normally be stored in the Message's metadata
    // Since we only have the InboxItem, we could:
    // 1. Look up the message to get its metadata (expensive)
    // 2. Use the inbox sourceType as a hint
    // 3. Default to GENERIC
    //
    // For this implementation, we default to GENERIC and let handlers
    // determine the specific type if needed
    return OrchestratorMessageType.GENERIC;
  }

  private async invokeHandlers(
    message: ProcessedInboxMessage,
    agentId: EntityId
  ): Promise<void> {
    // Call type-specific handlers
    const typeHandlers = this.typeHandlers.get(message.messageType);
    if (typeHandlers) {
      for (const handler of typeHandlers) {
        try {
          await handler(message, agentId);
        } catch (error) {
          // Log but don't fail the whole process
          console.error(`Handler error for type ${message.messageType}:`, error);
        }
      }
    }

    // Call any-message handlers
    for (const handler of this.anyHandlers) {
      try {
        await handler(message, agentId);
      } catch (error) {
        // Log but don't fail the whole process
        console.error('Handler error:', error);
      }
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Creates an InboxPollingService instance
 */
export function createInboxPollingService(
  inboxService: InboxService,
  registry: AgentRegistry,
  config?: InboxPollingConfig
): InboxPollingService {
  return new InboxPollingServiceImpl(inboxService, registry, config);
}

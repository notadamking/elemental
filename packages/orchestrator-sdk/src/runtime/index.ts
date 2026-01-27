/**
 * Orchestrator Runtime
 *
 * This module exports runtime management for Claude Code agent processes:
 * - SpawnerService (TB-O9) - Spawns and manages Claude Code processes
 * - SessionManager (TB-O10) - Session tracking with resume support
 * - Predecessor query service (TB-O10d) - TODO
 * - Handoff services (TB-O10e, TB-O10f) - TODO
 */

// Spawner service (TB-O9)
export {
  // Types
  type SpawnMode,
  type SpawnConfig,
  type SpawnOptions,
  type StreamJsonEventType,
  type StreamJsonEvent,
  type SpawnedSessionEvent,
  type SessionStatus,
  type SpawnedSession,
  type SpawnResult,
  type SendInputOptions,
  type SpawnerService,
  // UWP Types (TB-O9a)
  type UWPCheckResult,
  type UWPCheckOptions,
  type UWPTaskInfo,
  // Constants
  SessionStatusTransitions,
  // Implementation
  SpawnerServiceImpl,
  // Factory
  createSpawnerService,
  // Utilities
  canReceiveInput,
  isTerminalStatus,
  getStatusDescription,
} from './spawner.js';

// Session Manager (TB-O10)
export {
  // Types
  type SessionRecord,
  type StartSessionOptions,
  type ResumeSessionOptions,
  type StopSessionOptions,
  type MessageSessionOptions,
  type MessageSessionResult,
  type SessionFilter,
  type SessionHistoryEntry,
  type SessionManager,
  // UWP Check Result (TB-O10a)
  type ResumeUWPCheckResult,
  // Implementation
  SessionManagerImpl,
  // Factory
  createSessionManager,
} from './session-manager.js';

// Inbox Polling Service (TB-O10b)
export {
  // Constants
  DEFAULT_POLL_INTERVAL_MS,
  MIN_POLL_INTERVAL_MS,
  MAX_POLL_INTERVAL_MS,
  OrchestratorMessageType,
  // Types
  type InboxPollingConfig,
  type ProcessedInboxMessage,
  type InboxPollResult,
  type InboxMessageHandler,
  type InboxPollingService,
  // Implementation
  InboxPollingServiceImpl,
  // Factory
  createInboxPollingService,
} from './inbox-polling.js';

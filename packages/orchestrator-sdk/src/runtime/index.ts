/**
 * Orchestrator Runtime
 *
 * This module exports runtime management for Claude Code agent processes:
 * - SpawnerService (TB-O9) - Spawns and manages Claude Code processes
 * - SessionManager (TB-O10) - Session tracking with resume support
 * - InboxPollingService (TB-O10b) - Periodic inbox check for message processing
 * - PredecessorQueryService (TB-O10d) - Query previous sessions for context
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
  // Role-based session history (TB-O10c)
  type RoleSessionHistoryEntry,
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

// Predecessor Query Service (TB-O10d)
export {
  // Constants
  DEFAULT_QUERY_TIMEOUT_MS,
  MIN_QUERY_TIMEOUT_MS,
  MAX_QUERY_TIMEOUT_MS,
  // Types
  type PredecessorQueryOptions,
  type PredecessorQueryResult,
  type PredecessorInfo,
  type PredecessorQueryStatus,
  type ActivePredecessorQuery,
  type PredecessorQueryService,
  // Implementation
  PredecessorQueryServiceImpl,
  // Factory
  createPredecessorQueryService,
  // Errors
  TimeoutError,
  NoPredecessorError,
} from './predecessor-query.js';

// Handoff Service (TB-O10e, TB-O10f)
export {
  // Constants
  HANDOFF_DOCUMENT_TAG,
  HANDOFF_MESSAGE_TYPE,
  // Types
  type HandoffContent,
  type SelfHandoffOptions,
  type SelfHandoffResult,
  type AgentHandoffOptions,
  type AgentHandoffResult,
  type HandoffService,
  // Implementation
  HandoffServiceImpl,
  // Factory
  createHandoffService,
} from './handoff.js';

// SDK Adapter (for future Claude Agent SDK integration)
export {
  // Types
  type SDKUserMessage,
  type SDKSessionOptions,
  type SDKSession,
  // Classes
  MessageQueue,
  // Factory
  createSDKSession,
} from './sdk-adapter.js';

// Message Mapper (SDK to SpawnedSessionEvent conversion)
export {
  // Types
  type SDKMessage,
  type SDKAssistantMessage,
  type SDKSystemMessage,
  type SDKResultMessage,
  type SDKErrorMessage,
  type SDKContentBlock,
  type AnySDKMessage,
  // Functions
  mapSDKMessageToEvent,
  mapToolResultToEvent,
  mapSDKMessagesToEvents,
} from './message-mapper.js';

/**
 * Agent Providers
 *
 * Provider abstraction layer that enables drop-in replacement of the
 * underlying agent CLI/SDK. The default provider is Claude Code.
 *
 * @module
 */

// Core types
export type {
  ProviderSessionId,
  AgentProviderConfig,
  AgentMessage,
  HeadlessSession,
  HeadlessSpawnOptions,
  HeadlessProvider,
  InteractiveSession,
  InteractiveSpawnOptions,
  InteractiveProvider,
  AgentProvider,
} from './types.js';

// Registry
export {
  AgentProviderRegistry,
  getProviderRegistry,
} from './registry.js';

// Claude provider
export {
  ClaudeAgentProvider,
  ClaudeHeadlessProvider,
  ClaudeInteractiveProvider,
} from './claude/index.js';

// OpenCode provider (stubs)
export {
  OpenCodeAgentProvider,
  OpenCodeHeadlessProvider,
  OpenCodeInteractiveProvider,
} from './opencode/index.js';

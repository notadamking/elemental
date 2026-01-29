/**
 * @elemental/orchestrator-sdk
 *
 * Orchestrator SDK for Elemental - AI agent orchestration library extending the core SDK.
 *
 * This package provides the OrchestratorAPI which extends ElementalAPI with:
 * - Agent registration and management (Director, Worker, Steward)
 * - Session tracking with Claude Code integration
 * - Orchestrator-specific task metadata (branch, worktree, sessionId)
 * - Git worktree management for parallel development
 *
 * Note: Types from @elemental/core and @elemental/sdk are NOT re-exported here
 * to avoid naming conflicts. Import them directly:
 *   import { Task, Entity, ... } from '@elemental/core';
 *   import { ElementalAPI, createElementalAPI, ... } from '@elemental/sdk';
 */

// Re-export all types
export * from './types/index.js';

// Re-export API
export * from './api/index.js';

// Re-export services (stubs for now)
export * from './services/index.js';

// Re-export runtime (stubs for now)
export * from './runtime/index.js';

// Re-export git utilities (stubs for now)
export * from './git/index.js';

// Re-export prompt loading utilities
export * from './prompts/index.js';

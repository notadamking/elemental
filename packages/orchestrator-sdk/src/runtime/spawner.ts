/**
 * Spawner Service
 *
 * This service manages spawning and lifecycle of Claude Code processes
 * for AI agents in the orchestration system.
 *
 * Key features:
 * - Spawn headless agents (ephemeral workers, stewards) with stream-json output
 * - Spawn interactive agents (Director, persistent workers) with PTY
 * - Resume existing sessions with `--resume {session_id}`
 * - Parse stream-json events (assistant, tool_use, tool_result, error)
 * - Track session metadata for cross-restart resumption
 *
 * @module
 */

import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import type { EntityId, Timestamp } from '@elemental/core';
import { createTimestamp } from '@elemental/core';
import type { AgentRole, WorkerMode } from '../types/agent.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Mode for spawning an agent process
 */
export type SpawnMode = 'headless' | 'interactive';

/**
 * Configuration for spawn behavior
 */
export interface SpawnConfig {
  /** The Claude Code executable path (defaults to 'claude') */
  readonly claudePath?: string;
  /** Working directory for the agent */
  readonly workingDirectory?: string;
  /** Environment variables to pass to the process */
  readonly environmentVariables?: Record<string, string>;
  /** Timeout for process operations in milliseconds */
  readonly timeout?: number;
  /** Root directory for elemental (passed as ELEMENTAL_ROOT) */
  readonly elementalRoot?: string;
}

/**
 * Options for spawning an agent session
 */
export interface SpawnOptions extends SpawnConfig {
  /** Claude Code session ID to resume (if any) */
  readonly resumeSessionId?: string;
  /** Initial prompt to send to the agent */
  readonly initialPrompt?: string;
  /** Spawn mode: headless (stream-json) or interactive (PTY) */
  readonly mode?: SpawnMode;
}

/**
 * Stream-json event types from Claude Code
 */
export type StreamJsonEventType =
  | 'system'
  | 'assistant'
  | 'user'
  | 'tool_use'
  | 'tool_result'
  | 'result'
  | 'error';

/**
 * Stream-json event structure from Claude Code
 */
export interface StreamJsonEvent {
  /** Event type */
  readonly type: StreamJsonEventType;
  /** Event subtype (e.g., 'init', 'text', 'input_json_delta') */
  readonly subtype?: string;
  /** Session ID (from init event) */
  readonly session_id?: string;
  /** Tool information */
  readonly tool?: string;
  readonly tool_use_id?: string;
  readonly tool_input?: unknown;
  /** Content (for assistant/user messages) */
  readonly message?: string;
  readonly content?: string;
  /** Timestamp */
  readonly timestamp?: string;
  /** Error information */
  readonly error?: string;
  /** Result status */
  readonly result?: string;
  /** Raw event data */
  readonly [key: string]: unknown;
}

/**
 * Parsed event with typed data
 */
export interface SpawnedSessionEvent {
  /** Event type */
  readonly type: StreamJsonEventType;
  /** Event subtype */
  readonly subtype?: string;
  /** Timestamp when event was received */
  readonly receivedAt: Timestamp;
  /** Raw event data */
  readonly raw: StreamJsonEvent;
  /** Parsed message content (if any) */
  readonly message?: string;
  /** Tool information (if tool_use or tool_result) */
  readonly tool?: {
    readonly name?: string;
    readonly id?: string;
    readonly input?: unknown;
  };
}

/**
 * Status of a spawned session
 */
export type SessionStatus = 'starting' | 'running' | 'suspended' | 'terminating' | 'terminated';

/**
 * Session state machine transitions
 */
export const SessionStatusTransitions: Record<SessionStatus, SessionStatus[]> = {
  starting: ['running', 'terminated'],
  running: ['suspended', 'terminating', 'terminated'],
  suspended: ['running', 'terminated'],
  terminating: ['terminated'],
  terminated: [],
};

/**
 * Spawned session information
 */
export interface SpawnedSession {
  /** Internal session ID (unique per spawn) */
  readonly id: string;
  /** Claude Code session ID (for resume) */
  readonly claudeSessionId?: string;
  /** Agent entity ID this session belongs to */
  readonly agentId: EntityId;
  /** Agent role */
  readonly agentRole: AgentRole;
  /** Worker mode (for workers) */
  readonly workerMode?: WorkerMode;
  /** Spawn mode used */
  readonly mode: SpawnMode;
  /** Process ID */
  readonly pid?: number;
  /** Current status */
  status: SessionStatus;
  /** Working directory */
  readonly workingDirectory: string;
  /** Session created timestamp */
  readonly createdAt: Timestamp;
  /** Last activity timestamp */
  lastActivityAt: Timestamp;
  /** Session started timestamp (when running state entered) */
  startedAt?: Timestamp;
  /** Session ended timestamp (when terminated) */
  endedAt?: Timestamp;
}

/**
 * Internal session state tracking
 */
interface InternalSession extends SpawnedSession {
  /** Child process handle */
  process?: ChildProcess;
  /** Event emitter for session events */
  events: EventEmitter;
  /** Buffer for incomplete JSON lines */
  jsonBuffer: string;
}

/**
 * Result of spawning an agent
 */
export interface SpawnResult {
  /** The spawned session */
  session: SpawnedSession;
  /** Event emitter for session events */
  events: EventEmitter;
}

/**
 * Options for sending input to a headless agent
 */
export interface SendInputOptions {
  /** Whether this is a user message (vs system command) */
  readonly isUserMessage?: boolean;
}

/**
 * Result of the UWP (Universal Work Principle) check
 */
export interface UWPCheckResult {
  /** Whether a ready task was found */
  hasReadyTask: boolean;
  /** The ready task ID if found */
  taskId?: string;
  /** The task title if found */
  taskTitle?: string;
  /** The task priority if found */
  taskPriority?: number;
  /** Whether the task was automatically started */
  autoStarted: boolean;
  /** Session ID if a task was auto-started */
  sessionId?: string;
}

// ============================================================================
// Spawner Service Interface
// ============================================================================

/**
 * Spawner Service interface for agent process management.
 *
 * The service provides methods for:
 * - Spawning new agent sessions (headless or interactive)
 * - Resuming previous sessions
 * - Managing session lifecycle
 * - Sending input to headless agents
 */
export interface SpawnerService {
  // ----------------------------------------
  // Session Lifecycle
  // ----------------------------------------

  /**
   * Spawns a new Claude Code session for an agent.
   *
   * @param agentId - The agent entity ID
   * @param agentRole - The agent's role
   * @param options - Spawn options
   * @returns The spawn result with session info and event emitter
   */
  spawn(
    agentId: EntityId,
    agentRole: AgentRole,
    options?: SpawnOptions
  ): Promise<SpawnResult>;

  /**
   * Terminates a running session.
   *
   * @param sessionId - The internal session ID
   * @param graceful - Whether to attempt graceful shutdown (default: true)
   */
  terminate(sessionId: string, graceful?: boolean): Promise<void>;

  /**
   * Suspends a session (marks it for later resume).
   *
   * @param sessionId - The internal session ID
   */
  suspend(sessionId: string): Promise<void>;

  // ----------------------------------------
  // Session Queries
  // ----------------------------------------

  /**
   * Gets a session by internal ID.
   *
   * @param sessionId - The internal session ID
   * @returns The session or undefined if not found
   */
  getSession(sessionId: string): SpawnedSession | undefined;

  /**
   * Lists all active sessions.
   *
   * @param agentId - Optional filter by agent ID
   * @returns Array of active sessions
   */
  listActiveSessions(agentId?: EntityId): SpawnedSession[];

  /**
   * Lists all sessions (including terminated).
   *
   * @param agentId - Optional filter by agent ID
   * @returns Array of all sessions
   */
  listAllSessions(agentId?: EntityId): SpawnedSession[];

  /**
   * Gets the most recent session for an agent.
   *
   * @param agentId - The agent entity ID
   * @returns The most recent session or undefined
   */
  getMostRecentSession(agentId: EntityId): SpawnedSession | undefined;

  // ----------------------------------------
  // Headless Agent Communication
  // ----------------------------------------

  /**
   * Sends input to a headless agent's stdin.
   *
   * @param sessionId - The internal session ID
   * @param input - The input to send (will be formatted as stream-json)
   * @param options - Send options
   */
  sendInput(sessionId: string, input: string, options?: SendInputOptions): Promise<void>;

  // ----------------------------------------
  // Event Subscription
  // ----------------------------------------

  /**
   * Gets the event emitter for a session.
   *
   * Events emitted:
   * - 'event' (SpawnedSessionEvent) - Parsed stream-json event
   * - 'error' (Error) - Process error
   * - 'exit' (code: number | null, signal: string | null) - Process exit
   *
   * @param sessionId - The internal session ID
   * @returns The event emitter or undefined if session not found
   */
  getEventEmitter(sessionId: string): EventEmitter | undefined;

  // ----------------------------------------
  // Universal Work Principle (UWP)
  // ----------------------------------------

  /**
   * Checks the ready queue for an agent and optionally auto-starts the first task.
   *
   * This implements the Universal Work Principle (UWP):
   * "If there is work on your anchor, YOU MUST RUN IT"
   *
   * On agent startup:
   * 1. Query tasks ready for this agent (assigned to them, status open/in_progress)
   * 2. If task exists → Optionally set task status to IN_PROGRESS, return task info
   * 3. If no task → Return empty result, agent should enter idle/polling mode
   *
   * @param agentId - The agent entity ID to check tasks for
   * @param options - Options for the check
   * @returns UWP check result with task info if found
   */
  checkReadyQueue(
    agentId: EntityId,
    options?: UWPCheckOptions
  ): Promise<UWPCheckResult>;
}

/**
 * Options for UWP ready queue check
 */
export interface UWPCheckOptions {
  /** Whether to automatically mark the task as started (default: false) */
  autoStart?: boolean;
  /** Maximum number of tasks to check (default: 1) */
  limit?: number;
  /** Callback to get task info - allows integration without circular deps */
  getReadyTasks?: (agentId: EntityId, limit: number) => Promise<UWPTaskInfo[]>;
}

/**
 * Task information for UWP check
 */
export interface UWPTaskInfo {
  id: string;
  title: string;
  priority: number;
  status: string;
}

// ============================================================================
// Spawner Service Implementation
// ============================================================================

/**
 * Implementation of the Spawner Service.
 */
export class SpawnerServiceImpl implements SpawnerService {
  private readonly sessions: Map<string, InternalSession> = new Map();
  private readonly defaultConfig: SpawnConfig;
  private sessionCounter = 0;

  constructor(config?: SpawnConfig) {
    this.defaultConfig = {
      claudePath: config?.claudePath ?? 'claude',
      workingDirectory: config?.workingDirectory ?? process.cwd(),
      timeout: config?.timeout ?? 120000, // 2 minutes default
      elementalRoot: config?.elementalRoot,
      environmentVariables: config?.environmentVariables,
    };
  }

  // ----------------------------------------
  // Session Lifecycle
  // ----------------------------------------

  async spawn(
    agentId: EntityId,
    agentRole: AgentRole,
    options?: SpawnOptions
  ): Promise<SpawnResult> {
    const mode = this.determineSpawnMode(agentRole, options?.mode);
    const now = createTimestamp();
    const sessionId = this.generateSessionId();

    // Create session record
    const session: InternalSession = {
      id: sessionId,
      agentId,
      agentRole,
      workerMode: this.getWorkerMode(agentRole, options?.mode),
      mode,
      status: 'starting',
      workingDirectory: options?.workingDirectory ?? this.defaultConfig.workingDirectory!,
      createdAt: now,
      lastActivityAt: now,
      events: new EventEmitter(),
      jsonBuffer: '',
    };

    this.sessions.set(sessionId, session);

    try {
      if (mode === 'headless') {
        await this.spawnHeadless(session, options);
      } else {
        await this.spawnInteractive(session, options);
      }

      return {
        session: this.toPublicSession(session),
        events: session.events,
      };
    } catch (error) {
      // Clean up on failure
      session.status = 'terminated';
      session.endedAt = createTimestamp();
      throw error;
    }
  }

  async terminate(sessionId: string, graceful = true): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    if (session.status === 'terminated' || session.status === 'terminating') {
      return;
    }

    this.transitionStatus(session, 'terminating');

    if (session.process) {
      if (graceful) {
        // Try graceful shutdown first
        session.process.kill('SIGTERM');

        // Wait for graceful shutdown with timeout
        await new Promise<void>((resolve) => {
          const timeout = setTimeout(() => {
            if (session.process && !session.process.killed) {
              session.process.kill('SIGKILL');
            }
            resolve();
          }, 5000);

          session.process?.once('exit', () => {
            clearTimeout(timeout);
            resolve();
          });
        });
      } else {
        session.process.kill('SIGKILL');
      }
    }

    this.transitionStatus(session, 'terminated');
    session.endedAt = createTimestamp();
  }

  async suspend(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    if (session.status !== 'running') {
      throw new Error(`Cannot suspend session in status: ${session.status}`);
    }

    // For headless, we terminate the process but mark as suspended
    // The claudeSessionId can be used to resume later
    if (session.process) {
      session.process.kill('SIGTERM');
    }

    this.transitionStatus(session, 'suspended');
    session.lastActivityAt = createTimestamp();
  }

  // ----------------------------------------
  // Session Queries
  // ----------------------------------------

  getSession(sessionId: string): SpawnedSession | undefined {
    const session = this.sessions.get(sessionId);
    return session ? this.toPublicSession(session) : undefined;
  }

  listActiveSessions(agentId?: EntityId): SpawnedSession[] {
    const sessions = Array.from(this.sessions.values())
      .filter((s) => s.status !== 'terminated');

    return this.filterAndMapSessions(sessions, agentId);
  }

  listAllSessions(agentId?: EntityId): SpawnedSession[] {
    const sessions = Array.from(this.sessions.values());
    return this.filterAndMapSessions(sessions, agentId);
  }

  getMostRecentSession(agentId: EntityId): SpawnedSession | undefined {
    const agentSessions = Array.from(this.sessions.values())
      .filter((s) => s.agentId === agentId)
      .sort((a, b) => {
        // Sort by createdAt descending
        const aTime = typeof a.createdAt === 'number' ? a.createdAt : new Date(a.createdAt).getTime();
        const bTime = typeof b.createdAt === 'number' ? b.createdAt : new Date(b.createdAt).getTime();
        return bTime - aTime;
      });

    return agentSessions.length > 0 ? this.toPublicSession(agentSessions[0]) : undefined;
  }

  // ----------------------------------------
  // Headless Agent Communication
  // ----------------------------------------

  async sendInput(sessionId: string, input: string, options?: SendInputOptions): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    if (session.mode !== 'headless') {
      throw new Error('sendInput is only supported for headless sessions');
    }

    if (session.status !== 'running') {
      throw new Error(`Cannot send input to session in status: ${session.status}`);
    }

    if (!session.process?.stdin?.writable) {
      throw new Error('Session stdin is not writable');
    }

    // Format as stream-json user message
    const message = {
      type: 'user',
      message: input,
      timestamp: new Date().toISOString(),
    };

    session.process.stdin.write(JSON.stringify(message) + '\n');
    session.lastActivityAt = createTimestamp();
  }

  // ----------------------------------------
  // Event Subscription
  // ----------------------------------------

  getEventEmitter(sessionId: string): EventEmitter | undefined {
    const session = this.sessions.get(sessionId);
    return session?.events;
  }

  // ----------------------------------------
  // Universal Work Principle (UWP)
  // ----------------------------------------

  async checkReadyQueue(
    agentId: EntityId,
    options?: UWPCheckOptions
  ): Promise<UWPCheckResult> {
    const limit = options?.limit ?? 1;

    // If no getReadyTasks callback provided, return empty result
    // The callback allows integration with TaskAssignmentService without circular deps
    if (!options?.getReadyTasks) {
      return {
        hasReadyTask: false,
        autoStarted: false,
      };
    }

    // Query for ready tasks assigned to this agent
    const readyTasks = await options.getReadyTasks(agentId, limit);

    if (readyTasks.length === 0) {
      return {
        hasReadyTask: false,
        autoStarted: false,
      };
    }

    // Take the first task (highest priority should come first)
    const task = readyTasks[0];

    const result: UWPCheckResult = {
      hasReadyTask: true,
      taskId: task.id,
      taskTitle: task.title,
      taskPriority: task.priority,
      autoStarted: false,
    };

    // Auto-start is handled by the caller using TaskAssignmentService
    // We just report what we found - the caller can then decide to start the task
    if (options.autoStart) {
      result.autoStarted = true;
      // Note: Actual task status update should be done by the caller
      // using TaskAssignmentService.startTask() to avoid circular dependencies
    }

    return result;
  }

  // ----------------------------------------
  // Private Helpers - Spawning
  // ----------------------------------------

  private async spawnHeadless(session: InternalSession, options?: SpawnOptions): Promise<void> {
    const args = this.buildHeadlessArgs(options);
    const env = this.buildEnvironment(session, options);

    let childProcess;
    try {
      childProcess = spawn(this.defaultConfig.claudePath!, args, {
        cwd: session.workingDirectory,
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (error) {
      // spawn can throw synchronously if the executable is not found
      this.transitionStatus(session, 'terminated');
      session.endedAt = createTimestamp();
      throw error;
    }

    session.process = childProcess;
    (session as { pid?: number }).pid = childProcess.pid;

    // Handle stdout (stream-json output)
    childProcess.stdout?.on('data', (data: Buffer) => {
      this.handleHeadlessOutput(session, data);
    });

    // Handle stderr
    childProcess.stderr?.on('data', (data: Buffer) => {
      const errorMsg = data.toString();
      session.events.emit('stderr', errorMsg);
    });

    // Handle process exit
    childProcess.on('exit', (code, signal) => {
      if (session.status !== 'suspended') {
        this.transitionStatus(session, 'terminated');
      }
      session.endedAt = createTimestamp();
      session.events.emit('exit', code, signal);
    });

    // Handle process errors
    childProcess.on('error', (error) => {
      session.events.emit('error', error);
    });

    // Wait for the init event to get the Claude session ID
    await this.waitForInit(session, options?.timeout ?? this.defaultConfig.timeout!);
  }

  private async spawnInteractive(
    _session: InternalSession,
    _options?: SpawnOptions
  ): Promise<void> {
    // For interactive mode, we need node-pty
    // This is a placeholder - the actual implementation requires node-pty
    // which needs to be added as a dependency

    // For now, throw an error indicating this feature requires node-pty
    throw new Error(
      'Interactive mode requires node-pty. ' +
      'Interactive agent spawning will be fully implemented when node-pty is added as a dependency.'
    );
  }

  private buildHeadlessArgs(options?: SpawnOptions): string[] {
    const args: string[] = [
      '-p', // Print mode (non-interactive)
      '--dangerously-skip-permissions',
      '--output-format', 'stream-json',
      '--input-format', 'stream-json',
    ];

    if (options?.resumeSessionId) {
      args.push('--resume', options.resumeSessionId);
    }

    if (options?.initialPrompt) {
      args.push(options.initialPrompt);
    }

    return args;
  }

  private buildEnvironment(
    session: InternalSession,
    options?: SpawnOptions
  ): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      ...this.defaultConfig.environmentVariables,
      ...options?.environmentVariables,
    };

    // Set ELEMENTAL_ROOT for worktree root-finding
    if (options?.elementalRoot ?? this.defaultConfig.elementalRoot) {
      env.ELEMENTAL_ROOT = options?.elementalRoot ?? this.defaultConfig.elementalRoot;
    }

    return env;
  }

  private async waitForInit(session: InternalSession, timeout: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timeout waiting for Claude Code init (${timeout}ms)`));
      }, timeout);

      const onEvent = (event: SpawnedSessionEvent) => {
        if (event.type === 'system' && event.subtype === 'init') {
          clearTimeout(timer);
          session.events.off('event', onEvent);

          // Extract Claude session ID from init event
          if (event.raw.session_id) {
            (session as { claudeSessionId?: string }).claudeSessionId = event.raw.session_id;
          }

          this.transitionStatus(session, 'running');
          session.startedAt = createTimestamp();
          resolve();
        }
      };

      session.events.on('event', onEvent);
    });
  }

  // ----------------------------------------
  // Private Helpers - Output Parsing
  // ----------------------------------------

  private handleHeadlessOutput(session: InternalSession, data: Buffer): void {
    const text = data.toString();
    session.jsonBuffer += text;
    session.lastActivityAt = createTimestamp();

    // Parse complete JSON lines
    const lines = session.jsonBuffer.split('\n');
    session.jsonBuffer = lines.pop() ?? ''; // Keep incomplete line in buffer

    for (const line of lines) {
      if (line.trim()) {
        this.parseAndEmitEvent(session, line);
      }
    }
  }

  private parseAndEmitEvent(session: InternalSession, line: string): void {
    try {
      const rawEvent = JSON.parse(line) as StreamJsonEvent;

      const event: SpawnedSessionEvent = {
        type: rawEvent.type as StreamJsonEventType,
        subtype: rawEvent.subtype,
        receivedAt: createTimestamp(),
        raw: rawEvent,
        message: rawEvent.message ?? rawEvent.content,
        tool: rawEvent.tool
          ? {
              name: rawEvent.tool,
              id: rawEvent.tool_use_id,
              input: rawEvent.tool_input,
            }
          : undefined,
      };

      session.events.emit('event', event);
    } catch (error) {
      // Not valid JSON, emit as raw output
      session.events.emit('raw', line);
    }
  }

  // ----------------------------------------
  // Private Helpers - State Management
  // ----------------------------------------

  private generateSessionId(): string {
    this.sessionCounter++;
    const timestamp = Date.now().toString(36);
    const counter = this.sessionCounter.toString(36).padStart(4, '0');
    const random = Math.random().toString(36).slice(2, 6);
    return `session-${timestamp}-${counter}-${random}`;
  }

  private determineSpawnMode(agentRole: AgentRole, requestedMode?: SpawnMode): SpawnMode {
    if (requestedMode) {
      return requestedMode;
    }

    // Default mode based on role
    switch (agentRole) {
      case 'director':
        return 'interactive';
      case 'worker':
        return 'headless'; // Default to headless, can be overridden for persistent
      case 'steward':
        return 'headless';
      default:
        return 'headless';
    }
  }

  private getWorkerMode(
    agentRole: AgentRole,
    requestedMode?: SpawnMode
  ): WorkerMode | undefined {
    if (agentRole !== 'worker') {
      return undefined;
    }
    // Worker mode is typically determined by the agent metadata
    // For spawn, we can infer from the requested mode
    const mode = requestedMode ?? this.determineSpawnMode(agentRole);
    return mode === 'interactive' ? 'persistent' : 'ephemeral';
  }

  private transitionStatus(session: InternalSession, newStatus: SessionStatus): void {
    const allowedTransitions = SessionStatusTransitions[session.status];
    if (!allowedTransitions.includes(newStatus)) {
      throw new Error(
        `Invalid status transition: ${session.status} -> ${newStatus}`
      );
    }
    session.status = newStatus;
  }

  private filterAndMapSessions(
    sessions: InternalSession[],
    agentId?: EntityId
  ): SpawnedSession[] {
    const filtered = agentId
      ? sessions.filter((s) => s.agentId === agentId)
      : sessions;
    return filtered.map((s) => this.toPublicSession(s));
  }

  private toPublicSession(session: InternalSession): SpawnedSession {
    // Return a copy without internal fields
    return {
      id: session.id,
      claudeSessionId: session.claudeSessionId,
      agentId: session.agentId,
      agentRole: session.agentRole,
      workerMode: session.workerMode,
      mode: session.mode,
      pid: session.pid,
      status: session.status,
      workingDirectory: session.workingDirectory,
      createdAt: session.createdAt,
      lastActivityAt: session.lastActivityAt,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
    };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Creates a SpawnerService instance
 */
export function createSpawnerService(config?: SpawnConfig): SpawnerService {
  return new SpawnerServiceImpl(config);
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Checks if a status allows the session to receive input
 */
export function canReceiveInput(status: SessionStatus): boolean {
  return status === 'running';
}

/**
 * Checks if a status is a terminal state
 */
export function isTerminalStatus(status: SessionStatus): boolean {
  return status === 'terminated';
}

/**
 * Gets human-readable description of a session status
 */
export function getStatusDescription(status: SessionStatus): string {
  switch (status) {
    case 'starting':
      return 'Starting up';
    case 'running':
      return 'Running';
    case 'suspended':
      return 'Suspended (can be resumed)';
    case 'terminating':
      return 'Shutting down';
    case 'terminated':
      return 'Terminated';
    default:
      return 'Unknown';
  }
}

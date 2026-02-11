/**
 * Claude Interactive Provider
 *
 * Implements the InteractiveProvider interface by spawning the `claude` CLI
 * in a PTY. Extracted from the original spawner.ts to enable provider abstraction.
 *
 * @module
 */

import * as pty from 'node-pty';
import type { IPty } from 'node-pty';
import type {
  InteractiveProvider,
  InteractiveSession,
  InteractiveSpawnOptions,
  ProviderSessionId,
} from '../types.js';

// ============================================================================
// Helpers
// ============================================================================

/**
 * Shell-quotes a string for safe inclusion in a bash command.
 */
function shellQuote(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'";
}

// ============================================================================
// Claude Interactive Session
// ============================================================================

/**
 * A running Claude CLI interactive (PTY) session.
 */
class ClaudeInteractiveSession implements InteractiveSession {
  private ptyProcess: IPty;
  private sessionId: ProviderSessionId | undefined;

  readonly pid?: number;

  constructor(ptyProcess: IPty) {
    this.ptyProcess = ptyProcess;
    this.pid = ptyProcess.pid;

    // Listen for session ID in output
    this.ptyProcess.onData((data: string) => {
      if (!this.sessionId) {
        const sessionMatch = data.match(/Session:\s*([a-zA-Z0-9-]+)/);
        if (sessionMatch) {
          this.sessionId = sessionMatch[1];
        }
      }
    });
  }

  write(data: string): void {
    this.ptyProcess.write(data);
  }

  resize(cols: number, rows: number): void {
    this.ptyProcess.resize(cols, rows);
  }

  kill(): void {
    this.ptyProcess.kill();
  }

  onData(callback: (data: string) => void): void {
    this.ptyProcess.onData(callback);
  }

  onExit(callback: (code: number, signal?: number) => void): void {
    this.ptyProcess.onExit((e) => callback(e.exitCode, e.signal));
  }

  getSessionId(): ProviderSessionId | undefined {
    return this.sessionId;
  }
}

// ============================================================================
// Claude Interactive Provider
// ============================================================================

/**
 * Claude interactive provider that spawns the `claude` CLI in a PTY.
 */
export class ClaudeInteractiveProvider implements InteractiveProvider {
  readonly name = 'claude-interactive';
  private readonly executablePath: string;

  constructor(executablePath = 'claude') {
    this.executablePath = executablePath;
  }

  async spawn(options: InteractiveSpawnOptions): Promise<InteractiveSession> {
    const args = this.buildArgs(options);

    // Build environment
    const env: Record<string, string> = {
      ...(process.env as Record<string, string>),
      ...options.environmentVariables,
    };
    if (options.elementalRoot) {
      env.ELEMENTAL_ROOT = options.elementalRoot;
    }

    const cols = options.cols ?? 120;
    const rows = options.rows ?? 30;

    // Get shell based on platform
    const shell = process.platform === 'win32' ? 'cmd.exe' : '/bin/bash';
    const shellArgs = process.platform === 'win32' ? [] : ['-l'];

    // Build the command to run claude inside the shell
    // If there's an initial prompt, pass it as a positional argument: claude "query"
    const commandParts = [shellQuote(this.executablePath), ...args];
    if (options.initialPrompt) {
      commandParts.push(shellQuote(options.initialPrompt));
    }
    const claudeCommand = commandParts.join(' ');

    // Spawn PTY with the shell
    const ptyProcess = pty.spawn(shell, shellArgs, {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: options.workingDirectory,
      env,
    });

    const session = new ClaudeInteractiveSession(ptyProcess);

    // Wait for shell to be ready, then start claude
    await new Promise<void>((resolve) => {
      let started = false;
      setTimeout(() => {
        if (!started) {
          started = true;
          ptyProcess.write(claudeCommand + '\r');
          resolve();
        }
      }, 100);
    });

    return session;
  }

  async isAvailable(): Promise<boolean> {
    try {
      const { execSync } = await import('node:child_process');
      execSync(`${this.executablePath} --version`, { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  private buildArgs(options: InteractiveSpawnOptions): string[] {
    const args: string[] = [
      '--dangerously-skip-permissions',
    ];

    if (options.resumeSessionId) {
      args.push('--resume', shellQuote(options.resumeSessionId));
    }

    return args;
  }
}

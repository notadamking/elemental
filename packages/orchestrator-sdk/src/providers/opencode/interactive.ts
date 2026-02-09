/**
 * OpenCode Interactive Provider (Stub)
 *
 * Stub implementation of the InteractiveProvider interface for OpenCode.
 * Will spawn the `opencode` CLI in a PTY when available.
 *
 * @module
 */

import type {
  InteractiveProvider,
  InteractiveSession,
  InteractiveSpawnOptions,
} from '../types.js';

/**
 * OpenCode interactive provider stub.
 * Requires the `opencode` CLI to be installed.
 */
export class OpenCodeInteractiveProvider implements InteractiveProvider {
  readonly name = 'opencode-interactive';

  async spawn(_options: InteractiveSpawnOptions): Promise<InteractiveSession> {
    throw new Error(
      'OpenCode interactive provider is not yet implemented. ' +
      'Install OpenCode CLI: see https://opencode.ai for instructions'
    );
  }

  async isAvailable(): Promise<boolean> {
    try {
      const { execSync } = await import('node:child_process');
      execSync('opencode --version', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }
}

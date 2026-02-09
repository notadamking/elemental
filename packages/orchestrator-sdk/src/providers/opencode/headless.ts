/**
 * OpenCode Headless Provider (Stub)
 *
 * Stub implementation of the HeadlessProvider interface for OpenCode.
 * Will use @opencode-ai/sdk when available.
 *
 * @module
 */

import type {
  HeadlessProvider,
  HeadlessSession,
  HeadlessSpawnOptions,
} from '../types.js';

/**
 * OpenCode headless provider stub.
 * Requires @opencode-ai/sdk to be installed.
 */
export class OpenCodeHeadlessProvider implements HeadlessProvider {
  readonly name = 'opencode-headless';

  async spawn(_options: HeadlessSpawnOptions): Promise<HeadlessSession> {
    throw new Error(
      'OpenCode headless provider is not yet implemented. ' +
      'Install the SDK with: npm install @opencode-ai/sdk'
    );
  }

  async isAvailable(): Promise<boolean> {
    try {
      // @ts-expect-error - optional dependency, checked at runtime
      await import('@opencode-ai/sdk');
      return true;
    } catch {
      return false;
    }
  }
}

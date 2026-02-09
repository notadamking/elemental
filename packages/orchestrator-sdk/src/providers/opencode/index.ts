/**
 * OpenCode Agent Provider (Stub)
 *
 * Combines the OpenCode headless and interactive providers
 * into a single AgentProvider implementation.
 *
 * @module
 */

import type { AgentProvider, HeadlessProvider, InteractiveProvider } from '../types.js';
import { OpenCodeHeadlessProvider } from './headless.js';
import { OpenCodeInteractiveProvider } from './interactive.js';

export { OpenCodeHeadlessProvider } from './headless.js';
export { OpenCodeInteractiveProvider } from './interactive.js';

/**
 * OpenCode Agent Provider - alternative provider using OpenCode CLI and SDK.
 */
export class OpenCodeAgentProvider implements AgentProvider {
  readonly name = 'opencode';
  readonly headless: HeadlessProvider;
  readonly interactive: InteractiveProvider;

  constructor() {
    this.headless = new OpenCodeHeadlessProvider();
    this.interactive = new OpenCodeInteractiveProvider();
  }

  async isAvailable(): Promise<boolean> {
    const headlessAvailable = await this.headless.isAvailable();
    const interactiveAvailable = await this.interactive.isAvailable();
    return headlessAvailable || interactiveAvailable;
  }

  getInstallInstructions(): string {
    return 'Install OpenCode SDK: npm install @opencode-ai/sdk\nInstall OpenCode CLI: see https://opencode.ai';
  }
}

/**
 * Codex Agent Provider
 *
 * Combines the Codex headless and interactive providers
 * into a single AgentProvider implementation.
 *
 * @module
 */

import type { AgentProvider, HeadlessProvider, InteractiveProvider } from '../types.js';
import { CodexHeadlessProvider } from './headless.js';
import { CodexInteractiveProvider } from './interactive.js';

export { CodexHeadlessProvider } from './headless.js';
export { CodexInteractiveProvider } from './interactive.js';
export { CodexEventMapper } from './event-mapper.js';
export type { CodexNotification } from './event-mapper.js';
export { serverManager as codexServerManager } from './server-manager.js';

export interface CodexProviderConfig {
  executablePath?: string;
}

/**
 * Codex Agent Provider - provider using OpenAI Codex CLI and app-server.
 */
export class CodexAgentProvider implements AgentProvider {
  readonly name = 'codex';
  readonly headless: HeadlessProvider;
  readonly interactive: InteractiveProvider;

  constructor(config?: CodexProviderConfig) {
    this.headless = new CodexHeadlessProvider();
    this.interactive = new CodexInteractiveProvider(config?.executablePath);
  }

  async isAvailable(): Promise<boolean> {
    const headlessAvailable = await this.headless.isAvailable();
    const interactiveAvailable = await this.interactive.isAvailable();
    return headlessAvailable || interactiveAvailable;
  }

  getInstallInstructions(): string {
    return 'Install Codex CLI: npm install -g @openai/codex';
  }
}

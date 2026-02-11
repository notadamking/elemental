/**
 * Claude Agent Provider
 *
 * Combines the Claude headless (SDK) and interactive (PTY) providers
 * into a single AgentProvider implementation.
 *
 * @module
 */

import type { AgentProvider, HeadlessProvider, InteractiveProvider, ModelInfo } from '../types.js';
import { ClaudeHeadlessProvider } from './headless.js';
import { ClaudeInteractiveProvider } from './interactive.js';

export { ClaudeHeadlessProvider } from './headless.js';
export { ClaudeInteractiveProvider } from './interactive.js';

/**
 * Claude Agent Provider - the default provider using Claude Code CLI and SDK.
 */
export class ClaudeAgentProvider implements AgentProvider {
  readonly name = 'claude';
  readonly headless: HeadlessProvider;
  readonly interactive: InteractiveProvider;

  constructor(executablePath = 'claude') {
    this.headless = new ClaudeHeadlessProvider();
    this.interactive = new ClaudeInteractiveProvider(executablePath);
  }

  async isAvailable(): Promise<boolean> {
    // Check if at least the headless provider is available (SDK installed)
    return this.headless.isAvailable();
  }

  getInstallInstructions(): string {
    return 'Install Claude Code: npm install -g @anthropic-ai/claude-code\nInstall Claude Agent SDK: npm install @anthropic-ai/claude-agent-sdk';
  }

  async listModels(): Promise<ModelInfo[]> {
    // TODO: Implement actual model listing via Claude SDK
    return [];
  }
}

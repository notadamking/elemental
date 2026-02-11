/**
 * Claude Agent Provider
 *
 * Combines the Claude headless (SDK) and interactive (PTY) providers
 * into a single AgentProvider implementation.
 *
 * @module
 */

import { query as sdkQuery } from '@anthropic-ai/claude-agent-sdk';
import type { ModelInfo as SDKModelInfo } from '@anthropic-ai/claude-agent-sdk';
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
    // Create a temporary query instance to access supportedModels().
    // We use a minimal prompt and immediately close the query to avoid
    // actually running a session - we just need the query object's methods.
    const queryInstance = sdkQuery({
      prompt: '',
      options: {
        // Use bypassPermissions to avoid permission prompts
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
      },
    });

    try {
      const sdkModels: SDKModelInfo[] = await queryInstance.supportedModels();

      // Map SDK ModelInfo (value, displayName, description) to our ModelInfo (id, displayName, description?)
      return sdkModels.map((model) => ({
        id: model.value,
        displayName: model.displayName,
        description: model.description,
      }));
    } finally {
      // Always close the query to clean up resources
      queryInstance.close();
    }
  }
}

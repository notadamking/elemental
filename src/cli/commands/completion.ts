/**
 * Completion Command - Generate shell completion scripts
 *
 * Provides shell completion for bash, zsh, and fish shells.
 */

import type { Command, CommandResult } from '../types.js';
import { success, failure, ExitCode } from '../types.js';
import { generateCompletion, getInstallInstructions, type ShellType } from '../completion.js';
import { getAllCommands } from '../runner.js';

// ============================================================================
// Supported Shells
// ============================================================================

const SUPPORTED_SHELLS: ShellType[] = ['bash', 'zsh', 'fish'];

// ============================================================================
// Handler
// ============================================================================

function completionHandler(args: string[]): CommandResult {
  const [shell] = args;

  if (!shell) {
    // Show help
    const message = `Generate shell completion scripts

Usage: el completion <shell>

Supported shells:
  bash    Bash shell completion
  zsh     Zsh shell completion
  fish    Fish shell completion

Examples:
  el completion bash > ~/.local/share/bash-completion/completions/el
  source <(el completion zsh)
  el completion fish > ~/.config/fish/completions/el.fish`;

    return success(undefined, message);
  }

  const shellLower = shell.toLowerCase() as ShellType;

  if (!SUPPORTED_SHELLS.includes(shellLower)) {
    return failure(
      `Unsupported shell: ${shell}. Supported shells: ${SUPPORTED_SHELLS.join(', ')}`,
      ExitCode.INVALID_ARGUMENTS
    );
  }

  try {
    const commands = getAllCommands();
    const script = generateCompletion(shellLower, commands);
    return success({ shell: shellLower }, script);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to generate completion: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

// ============================================================================
// Command Definition
// ============================================================================

export const completionCommand: Command = {
  name: 'completion',
  description: 'Generate shell completion scripts',
  usage: 'el completion <shell>',
  help: `Generate shell completion scripts for bash, zsh, or fish.

Arguments:
  shell    Shell type: bash, zsh, or fish

Installation:
  Bash:
    # Add to ~/.bashrc or ~/.bash_profile:
    source <(el completion bash)

    # Or save to a file:
    el completion bash > ~/.local/share/bash-completion/completions/el

  Zsh:
    # Add to ~/.zshrc:
    source <(el completion zsh)

    # Or save to a file in your fpath:
    el completion zsh > ~/.zsh/completions/_el

  Fish:
    # Save to completions directory:
    el completion fish > ~/.config/fish/completions/el.fish

Examples:
  el completion bash
  el completion zsh
  el completion fish`,
  options: [],
  handler: completionHandler,
};

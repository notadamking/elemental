/**
 * Test Prompt Builders for Real-Mode Orchestration Tests
 *
 * Constrained prompts that produce verifiable outcomes quickly.
 * Used when running orchestration tests with `--mode real` to
 * guide actual Claude processes toward fast, deterministic behavior.
 *
 * @module
 */

// ============================================================================
// Worker Prompts
// ============================================================================

/**
 * Builds a constrained prompt for a test worker agent.
 *
 * Instructs the worker to complete a task with minimal exploration,
 * commit changes, push to the current branch, and mark the task done.
 */
export function buildTestWorkerPrompt(
  taskTitle: string,
  worktreePath: string
): string {
  return `You are a test worker agent. Complete the following task as quickly as possible.

TASK: ${taskTitle}

INSTRUCTIONS:
1. You are working in: ${worktreePath}
2. Make minimal, focused changes to complete the task.
3. Do NOT explore the codebase beyond what is needed.
4. Commit your changes with a descriptive message.
5. Push to the current branch.
6. Mark the task as done using: el task complete <task-id>

CONSTRAINTS:
- Do not refactor existing code.
- Do not add tests unless the task explicitly requires it.
- Do not create documentation.
- Complete as fast as possible.`;
}

/**
 * Builds a prompt override for the worker role.
 * Written to .elemental/prompts/worker.md for real-mode tests.
 */
export function buildTestWorkerOverride(): string {
  return `# Test Worker Override

You are running inside an orchestration test. Your goal is to complete tasks quickly and deterministically.

## Rules
- Make minimal changes to satisfy the task requirements.
- Skip exploration — go straight to implementation.
- Use the \`el\` CLI for all elemental operations.
- Always commit and push your changes before marking a task done.
- Do not ask clarifying questions — use your best judgment.
- Do not install dependencies or run builds unless required by the task.
- The \`el\` command is on PATH and ready to use. Do not attempt to install or locate it.`;
}

// ============================================================================
// Director Prompts
// ============================================================================

/**
 * Builds a constrained prompt for a test director agent.
 *
 * Instructs the director to execute one specific action and stop.
 */
export function buildTestDirectorPrompt(instruction: string): string {
  return `You are a test director agent. Execute the following instruction and then stop.

INSTRUCTION: ${instruction}

CONSTRAINTS:
- Execute this one instruction only.
- Do not explore the codebase.
- Do not plan beyond what is asked.
- Complete as quickly as possible.
- Use the \`el\` CLI for all elemental operations (e.g., \`el task create\`).`;
}

/**
 * Builds a prompt override for the director role.
 * Written to .elemental/prompts/director.md for real-mode tests.
 */
export function buildTestDirectorOverride(): string {
  return `# Test Director Override

You are running inside an orchestration test. Your goal is to execute instructions quickly and deterministically.

## Rules
- Execute the given instruction and stop.
- Use the \`el\` CLI for creating tasks and plans.
- Do not explore the codebase.
- Do not engage in extended planning — act immediately.
- Keep task titles concise and descriptive.
- The \`el\` command is on PATH and ready to use. Do not attempt to install or locate it.`;
}

// ============================================================================
// Steward Prompts
// ============================================================================

/**
 * Builds a constrained prompt for a test steward agent.
 *
 * Instructs the steward to review a task and take a specific action.
 */
export function buildTestStewardPrompt(
  action: 'merge' | 'reject' | 'handoff',
  taskId: string
): string {
  let actionInstruction: string;
  if (action === 'merge') {
    actionInstruction = `Run \`el task merge ${taskId}\` to merge this task.`;
  } else {
    actionInstruction = `Run \`el task reject ${taskId} --reason "Tests failed" --message "Needs fixes"\` to reject this task.`;
  }

  return `You are a test steward agent. Review the specified task and take the required action.

TASK ID: ${taskId}
REQUIRED ACTION: ${action}

INSTRUCTIONS:
- ${actionInstruction}
- Use the \`el\` CLI for all operations.
- Complete as quickly as possible.

CONSTRAINTS:
- Do not explore the codebase beyond the task metadata.
- Do not modify code.
- Execute only the specified action.`;
}

/**
 * Builds a prompt override for the steward role.
 * Written to .elemental/prompts/steward.md for real-mode tests.
 */
export function buildTestStewardOverride(): string {
  return `# Test Steward Override

You are running inside an orchestration test. Your goal is to review and act on tasks quickly.

## Rules
- Review the task metadata and take the appropriate action.
- Use the \`el\` CLI for all elemental operations.
- Available commands: \`el task merge <id>\`, \`el task reject <id> --reason "..." --message "..."\`
- Do not explore the codebase.
- Act on the merge request status as instructed.
- Complete as quickly as possible.
- The \`el\` command is on PATH and ready to use. Do not attempt to install or locate it.`;
}

/**
 * Workflow Pouring - Instantiate workflows from playbooks
 *
 * "Pouring" is the process of instantiating a workflow from a playbook:
 * 1. Load playbook definition
 * 2. Resolve inheritance chain (if extends)
 * 3. Collect and validate variables
 * 4. Evaluate step conditions
 * 5. Substitute variables in templates
 * 6. Create Workflow element
 * 7. Create Task elements for each step
 * 8. Wire `blocks` dependencies
 */

import { ValidationError } from '../errors/error.js';
import { ErrorCode } from '../errors/codes.js';
import type { ElementId, EntityId } from './element.js';
import type { Task, CreateTaskInput } from './task.js';
import { TaskStatus, DEFAULT_PRIORITY, DEFAULT_COMPLEXITY, DEFAULT_TASK_TYPE } from './task.js';
import type { Dependency } from './dependency.js';
import { DependencyType, createDependency } from './dependency.js';
import type { Workflow, CreateWorkflowInput } from './workflow.js';
import { WorkflowStatus, createWorkflow } from './workflow.js';
import type { PlaybookId } from './playbook.js';
import type {
  Playbook,
  PlaybookStep,
  PlaybookLoader,
  ResolvedVariables,
} from './playbook.js';
import {
  resolvePlaybookInheritance,
  resolveVariables,
  filterStepsByConditions,
  substituteVariables,
} from './playbook.js';
import type { IdGeneratorConfig } from '../id/generator.js';
import { generateChildId } from '../id/generator.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Input for pouring a workflow from a playbook
 */
export interface PourWorkflowInput {
  /** The playbook to pour from */
  playbook: Playbook;
  /** Variable values to use during pouring */
  variables: Record<string, unknown>;
  /** Entity performing the pour operation */
  createdBy: EntityId;
  /** Optional: Custom workflow title (defaults to playbook title) */
  title?: string;
  /** Whether to create an ephemeral workflow (default: false) */
  ephemeral?: boolean;
  /** Optional: Playbook loader for inheritance resolution */
  playbookLoader?: PlaybookLoader;
  /** Optional: Tags to apply to the workflow */
  tags?: string[];
  /** Optional: Metadata to apply to the workflow */
  metadata?: Record<string, unknown>;
}

/**
 * A created task with its step ID for dependency wiring
 */
export interface CreatedTask {
  /** The created task */
  task: Task;
  /** The step ID this task was created from */
  stepId: string;
}

/**
 * Result of pouring a workflow
 */
export interface PourWorkflowResult {
  /** The created workflow */
  workflow: Workflow;
  /** The created tasks */
  tasks: CreatedTask[];
  /** Dependencies to wire (blocks dependencies between tasks) */
  blocksDependencies: Dependency[];
  /** Parent-child dependencies (tasks are children of workflow) */
  parentChildDependencies: Dependency[];
  /** Resolved variables used during pouring */
  resolvedVariables: ResolvedVariables;
  /** Steps that were filtered out by conditions */
  skippedSteps: string[];
}

/**
 * Function type for task creation (used for dependency injection in tests)
 */
export type TaskCreator = (
  input: CreateTaskInput,
  config?: IdGeneratorConfig
) => Promise<Task>;

/**
 * Options for pour operation
 */
export interface PourOptions {
  /** ID generator configuration */
  idConfig?: IdGeneratorConfig;
  /** Custom task creator (for testing) */
  taskCreator?: TaskCreator;
}

// ============================================================================
// Workflow Auto-Completion/Failure Detection
// ============================================================================

/**
 * Determines if a workflow should auto-complete based on task statuses.
 *
 * A workflow can auto-complete when:
 * - All tasks are in 'closed' status
 * - Workflow is currently in 'running' status
 *
 * @param workflow - The workflow to check
 * @param tasks - All tasks in the workflow
 * @returns Whether the workflow should transition to 'completed'
 */
export function shouldAutoComplete(workflow: Workflow, tasks: Task[]): boolean {
  // Only running workflows can auto-complete
  if (workflow.status !== WorkflowStatus.RUNNING) {
    return false;
  }

  // No tasks means nothing to complete
  if (tasks.length === 0) {
    return false;
  }

  // All tasks must be closed
  return tasks.every((task) => task.status === TaskStatus.CLOSED);
}

/**
 * Determines if a workflow should auto-fail based on task statuses.
 *
 * A workflow can auto-fail when:
 * - Any required task is in 'tombstone' status (deleted/failed)
 * - Workflow is currently in 'running' or 'pending' status
 *
 * Note: We treat tombstoned tasks as failed because they represent
 * work that cannot be completed.
 *
 * @param workflow - The workflow to check
 * @param tasks - All tasks in the workflow
 * @returns Whether the workflow should transition to 'failed'
 */
export function shouldAutoFail(workflow: Workflow, tasks: Task[]): boolean {
  // Only pending or running workflows can auto-fail
  if (
    workflow.status !== WorkflowStatus.PENDING &&
    workflow.status !== WorkflowStatus.RUNNING
  ) {
    return false;
  }

  // Any tombstoned task causes workflow failure
  return tasks.some((task) => task.status === TaskStatus.TOMBSTONE);
}

/**
 * Determines if a workflow should auto-start based on task statuses.
 *
 * A workflow should auto-start (transition from pending to running) when:
 * - Any task transitions to 'in_progress'
 * - Workflow is currently in 'pending' status
 *
 * @param workflow - The workflow to check
 * @param tasks - All tasks in the workflow
 * @returns Whether the workflow should transition to 'running'
 */
export function shouldAutoStart(workflow: Workflow, tasks: Task[]): boolean {
  // Only pending workflows can auto-start
  if (workflow.status !== WorkflowStatus.PENDING) {
    return false;
  }

  // Any task in progress triggers workflow start
  return tasks.some((task) => task.status === TaskStatus.IN_PROGRESS);
}

/**
 * Computes the suggested workflow status based on current task statuses.
 *
 * @param workflow - The workflow to check
 * @param tasks - All tasks in the workflow
 * @returns The suggested workflow status, or undefined if no change needed
 */
export function computeWorkflowStatus(
  workflow: Workflow,
  tasks: Task[]
): WorkflowStatus | undefined {
  if (shouldAutoFail(workflow, tasks)) {
    return WorkflowStatus.FAILED;
  }

  if (shouldAutoStart(workflow, tasks)) {
    return WorkflowStatus.RUNNING;
  }

  if (shouldAutoComplete(workflow, tasks)) {
    return WorkflowStatus.COMPLETED;
  }

  return undefined;
}

// ============================================================================
// Pouring Implementation
// ============================================================================

/**
 * Validates pour input before processing
 */
function validatePourInput(input: PourWorkflowInput): void {
  if (!input.playbook) {
    throw new ValidationError(
      'Playbook is required for pouring',
      ErrorCode.MISSING_REQUIRED_FIELD,
      { field: 'playbook' }
    );
  }

  if (!input.createdBy) {
    throw new ValidationError(
      'createdBy is required for pouring',
      ErrorCode.MISSING_REQUIRED_FIELD,
      { field: 'createdBy' }
    );
  }

  if (typeof input.variables !== 'object' || input.variables === null) {
    throw new ValidationError(
      'variables must be an object',
      ErrorCode.INVALID_INPUT,
      { field: 'variables', value: input.variables }
    );
  }
}

/**
 * Creates a task from a playbook step
 */
async function createTaskFromStep(
  step: PlaybookStep,
  resolvedVariables: ResolvedVariables,
  workflowId: ElementId,
  taskIndex: number,
  createdBy: EntityId,
  options: PourOptions
): Promise<Task> {
  // Substitute variables in title
  const title = substituteVariables(step.title, resolvedVariables, false);

  // Substitute variables in assignee if present
  const assignee = step.assignee
    ? (substituteVariables(step.assignee, resolvedVariables, true) as EntityId | undefined)
    : undefined;

  // Generate hierarchical ID: workflow.1, workflow.2, etc.
  const taskId = generateChildId(workflowId, taskIndex + 1);

  // Import createTask dynamically to avoid circular dependency
  const { createTask } = await import('./task.js');

  const taskInput: CreateTaskInput = {
    id: taskId as ElementId,
    title,
    createdBy,
    priority: step.priority ?? DEFAULT_PRIORITY,
    complexity: step.complexity ?? DEFAULT_COMPLEXITY,
    taskType: step.taskType ?? DEFAULT_TASK_TYPE,
    status: TaskStatus.OPEN,
    ...(assignee && assignee.length > 0 && { assignee }),
  };

  // Use custom task creator if provided (for testing)
  if (options.taskCreator) {
    return options.taskCreator(taskInput, options.idConfig);
  }

  return createTask(taskInput, options.idConfig);
}

/**
 * Creates blocks dependencies based on step dependsOn relationships
 */
function createBlocksDependencies(
  tasks: CreatedTask[],
  steps: PlaybookStep[],
  createdBy: EntityId
): Dependency[] {
  const dependencies: Dependency[] = [];
  const taskByStepId = new Map<string, CreatedTask>();

  // Build lookup map
  for (const createdTask of tasks) {
    taskByStepId.set(createdTask.stepId, createdTask);
  }

  // For each step with dependencies
  for (const step of steps) {
    if (!step.dependsOn || step.dependsOn.length === 0) {
      continue;
    }

    const dependentTask = taskByStepId.get(step.id);
    if (!dependentTask) {
      continue; // Step was filtered out by condition
    }

    for (const dependsOnId of step.dependsOn) {
      const blockerTask = taskByStepId.get(dependsOnId);
      if (!blockerTask) {
        continue; // Blocker step was filtered out by condition
      }

      // Create blocks dependency: blocker blocks dependent
      // This means dependent task cannot proceed until blocker is closed
      const dep = createDependency({
        sourceId: blockerTask.task.id,
        targetId: dependentTask.task.id,
        type: DependencyType.BLOCKS,
        createdBy,
      });

      dependencies.push(dep);
    }
  }

  return dependencies;
}

/**
 * Creates parent-child dependencies linking tasks to the workflow
 */
function createParentChildDependencies(
  workflow: Workflow,
  tasks: CreatedTask[],
  createdBy: EntityId
): Dependency[] {
  return tasks.map((createdTask) =>
    createDependency({
      sourceId: createdTask.task.id,
      targetId: workflow.id,
      type: DependencyType.PARENT_CHILD,
      createdBy,
    })
  );
}

/**
 * Pours a workflow from a playbook.
 *
 * This is the main entry point for workflow instantiation. It:
 * 1. Resolves playbook inheritance (if any)
 * 2. Validates and resolves variables
 * 3. Filters steps by conditions
 * 4. Creates the workflow element
 * 5. Creates tasks for each included step
 * 6. Wires up dependencies
 *
 * @param input - Pour configuration
 * @param options - Optional pour options
 * @returns The result containing workflow, tasks, and dependencies
 * @throws ValidationError if input is invalid
 * @throws NotFoundError if parent playbook not found
 */
export async function pourWorkflow(
  input: PourWorkflowInput,
  options: PourOptions = {}
): Promise<PourWorkflowResult> {
  // Validate input
  validatePourInput(input);

  const { playbook, variables, createdBy, ephemeral = false, playbookLoader } = input;

  // Resolve playbook inheritance if needed
  const defaultLoader: PlaybookLoader = () => undefined;
  const resolved = await resolvePlaybookInheritance(
    playbook,
    playbookLoader ?? defaultLoader
  );

  // Resolve variables with defaults and validation
  const resolvedVariables = resolveVariables(resolved.variables, variables);

  // Filter steps by conditions
  const includedSteps = filterStepsByConditions(resolved.steps, resolvedVariables);
  const skippedSteps = resolved.steps
    .filter((step) => !includedSteps.includes(step))
    .map((step) => step.id);

  // Create workflow
  const workflowTitle = input.title ?? substituteVariables(playbook.title, resolvedVariables, true);

  const workflowInput: CreateWorkflowInput = {
    title: workflowTitle,
    createdBy,
    ephemeral,
    variables: resolvedVariables,
    playbookId: playbook.id as PlaybookId,
    tags: input.tags,
    metadata: input.metadata,
  };

  const workflow = await createWorkflow(workflowInput, options.idConfig);

  // Create tasks for each included step
  const createdTasks: CreatedTask[] = [];

  for (let i = 0; i < includedSteps.length; i++) {
    const step = includedSteps[i];
    const task = await createTaskFromStep(
      step,
      resolvedVariables,
      workflow.id,
      i,
      createdBy,
      options
    );

    createdTasks.push({
      task,
      stepId: step.id,
    });
  }

  // Create dependencies
  const blocksDependencies = createBlocksDependencies(
    createdTasks,
    includedSteps,
    createdBy
  );

  const parentChildDependencies = createParentChildDependencies(
    workflow,
    createdTasks,
    createdBy
  );

  return {
    workflow,
    tasks: createdTasks,
    blocksDependencies,
    parentChildDependencies,
    resolvedVariables,
    skippedSteps,
  };
}

/**
 * Validates that a playbook can be poured with the given variables.
 * Does not create any elements - just validates.
 *
 * @param playbook - The playbook to validate
 * @param variables - Variable values to validate
 * @param playbookLoader - Optional loader for inheritance
 * @returns Validation result with resolved variables and steps
 */
export async function validatePour(
  playbook: Playbook,
  variables: Record<string, unknown>,
  playbookLoader?: PlaybookLoader
): Promise<{
  valid: boolean;
  resolvedVariables?: ResolvedVariables;
  includedSteps?: PlaybookStep[];
  skippedSteps?: string[];
  error?: string;
}> {
  try {
    const defaultLoader: PlaybookLoader = () => undefined;
    const resolved = await resolvePlaybookInheritance(
      playbook,
      playbookLoader ?? defaultLoader
    );

    const resolvedVariables = resolveVariables(resolved.variables, variables);
    const includedSteps = filterStepsByConditions(resolved.steps, resolvedVariables);
    const skippedSteps = resolved.steps
      .filter((step) => !includedSteps.includes(step))
      .map((step) => step.id);

    // Validate variable substitution in all templates
    for (const step of includedSteps) {
      substituteVariables(step.title, resolvedVariables, false);
      if (step.description) {
        substituteVariables(step.description, resolvedVariables, false);
      }
    }

    return {
      valid: true,
      resolvedVariables,
      includedSteps,
      skippedSteps,
    };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

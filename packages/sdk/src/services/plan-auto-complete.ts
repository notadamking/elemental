/**
 * Plan Auto-Complete Service
 *
 * This service checks if a plan should be automatically marked as complete
 * when all its tasks are closed. It is triggered after a task status change
 * to CLOSED.
 *
 * @module
 */

import type { ElementId, Plan, Task, TaskStatus } from '@elemental/core';
import {
  canAutoComplete,
  PlanStatus,
  isValidPlanStatusTransition,
  updatePlanStatus,
} from '@elemental/core';
import type { ElementalAPI } from '../api/types.js';

/**
 * Result of checking plan auto-completion
 */
export interface PlanAutoCompleteResult {
  /** Whether any plan was auto-completed */
  completed: boolean;
  /** The plan ID if auto-completed */
  planId?: ElementId;
  /** The updated plan if auto-completed */
  plan?: Plan;
  /** Error message if something went wrong */
  error?: string;
}

/**
 * Checks if a task belongs to a plan and if that plan should be auto-completed.
 * If all tasks in the plan are closed, the plan is marked as complete.
 *
 * This function should be called after a task is closed/completed.
 *
 * @param api - The Elemental API instance
 * @param taskId - The ID of the task that was just closed
 * @returns Result indicating if a plan was auto-completed
 */
export async function checkPlanAutoComplete(
  api: ElementalAPI,
  taskId: ElementId
): Promise<PlanAutoCompleteResult> {
  try {
    // 1. Get the parent-child dependencies to find if task belongs to a plan
    const dependencies = await api.getDependencies(taskId, ['parent-child']);

    // If no parent-child dependencies, task doesn't belong to a plan
    if (dependencies.length === 0) {
      return { completed: false };
    }

    // The blockerId is the parent plan
    const planId = dependencies[0].blockerId;

    // 2. Get the plan to verify it exists and check its status
    const plan = await api.get<Plan>(planId);
    if (!plan || plan.type !== 'plan') {
      return { completed: false };
    }

    // 3. Only auto-complete if plan is in ACTIVE status
    // (can't transition from DRAFT, COMPLETED, or CANCELLED to COMPLETED)
    if (plan.status !== PlanStatus.ACTIVE) {
      return { completed: false };
    }

    // 4. Get all tasks in the plan to check their statuses
    const tasks = await api.getTasksInPlan(planId, { includeDeleted: false });

    // Count tasks by status
    const statusCounts: Record<TaskStatus, number> = {
      open: 0,
      in_progress: 0,
      blocked: 0,
      deferred: 0,
      backlog: 0,
      review: 0,
      closed: 0,
      tombstone: 0,
    };

    for (const task of tasks) {
      if (task.status in statusCounts) {
        statusCounts[task.status as TaskStatus]++;
      }
    }

    // 5. Check if plan can be auto-completed
    if (!canAutoComplete(statusCounts)) {
      return { completed: false };
    }

    // 6. Validate the transition is allowed (should be: ACTIVE -> COMPLETED)
    if (!isValidPlanStatusTransition(plan.status, PlanStatus.COMPLETED)) {
      return {
        completed: false,
        error: `Cannot transition plan from ${plan.status} to ${PlanStatus.COMPLETED}`,
      };
    }

    // 7. Update the plan status to COMPLETED
    const updatedPlan = updatePlanStatus(plan, { status: PlanStatus.COMPLETED });

    // 8. Save the updated plan
    const savedPlan = await api.update<Plan>(planId, updatedPlan);

    return {
      completed: true,
      planId,
      plan: savedPlan,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      completed: false,
      error: `Failed to check plan auto-complete: ${message}`,
    };
  }
}

/**
 * Checks if a task belongs to a plan (has a parent-child dependency to a plan).
 *
 * @param api - The Elemental API instance
 * @param taskId - The ID of the task to check
 * @returns The plan ID if task belongs to a plan, undefined otherwise
 */
export async function getTaskPlanId(
  api: ElementalAPI,
  taskId: ElementId
): Promise<ElementId | undefined> {
  try {
    const dependencies = await api.getDependencies(taskId, ['parent-child']);
    if (dependencies.length === 0) {
      return undefined;
    }
    return dependencies[0].blockerId;
  } catch {
    return undefined;
  }
}

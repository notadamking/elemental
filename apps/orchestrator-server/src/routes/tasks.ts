/**
 * Task Routes
 *
 * CRUD and dispatch operations for tasks.
 */

import { Hono } from 'hono';
import type { EntityId, ElementId, Task } from '@elemental/core';
import { createTask, TaskStatus, ElementType, Priority, Complexity } from '@elemental/core';
import type { OrchestratorTaskMeta } from '@elemental/orchestrator-sdk';
import type { Services } from '../services.js';
import { formatTaskResponse } from '../formatters.js';

export function createTaskRoutes(services: Services) {
  const { api, agentRegistry, taskAssignmentService, dispatchService, workerTaskService } = services;
  const app = new Hono();

  // GET /api/tasks - List tasks
  app.get('/api/tasks', async (c) => {
    try {
      const url = new URL(c.req.url);
      const statusParam = url.searchParams.get('status');
      const assigneeParam = url.searchParams.get('assignee');
      const unassignedParam = url.searchParams.get('unassigned');
      const limitParam = url.searchParams.get('limit');
      const limit = limitParam ? parseInt(limitParam, 10) : 100;

      if (unassignedParam === 'true') {
        const unassignedTasks = await taskAssignmentService.getUnassignedTasks();
        return c.json({ tasks: unassignedTasks.slice(0, limit).map(formatTaskResponse) });
      }

      if (assigneeParam) {
        const agentAssignments = await taskAssignmentService.getAgentTasks(assigneeParam as EntityId);
        const agentTasks = agentAssignments.map((a) => a.task);
        const filtered = statusParam
          ? agentTasks.filter((t) => t.status === TaskStatus[statusParam.toUpperCase() as keyof typeof TaskStatus])
          : agentTasks;
        return c.json({ tasks: filtered.slice(0, limit).map(formatTaskResponse) });
      }

      const allElements = await api.list({ type: ElementType.TASK, limit });
      const tasks = allElements.filter((e): e is Task => e.type === ElementType.TASK);
      const filtered = statusParam
        ? tasks.filter((t) => t.status === TaskStatus[statusParam.toUpperCase() as keyof typeof TaskStatus])
        : tasks;

      return c.json({ tasks: filtered.map(formatTaskResponse) });
    } catch (error) {
      console.error('[orchestrator] Failed to list tasks:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
    }
  });

  // GET /api/tasks/unassigned
  app.get('/api/tasks/unassigned', async (c) => {
    try {
      const url = new URL(c.req.url);
      const limitParam = url.searchParams.get('limit');
      const limit = limitParam ? parseInt(limitParam, 10) : 100;

      const tasks = await taskAssignmentService.getUnassignedTasks();
      return c.json({ tasks: tasks.slice(0, limit).map(formatTaskResponse) });
    } catch (error) {
      console.error('[orchestrator] Failed to list unassigned tasks:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
    }
  });

  // POST /api/tasks - Create task
  app.post('/api/tasks', async (c) => {
    try {
      const body = (await c.req.json()) as {
        title: string;
        description?: string;
        priority?: 'critical' | 'high' | 'medium' | 'low';
        complexity?: 'trivial' | 'simple' | 'medium' | 'complex' | 'very_complex';
        tags?: string[];
        ephemeral?: boolean;
        createdBy?: string;
      };

      if (!body.title) {
        return c.json({ error: { code: 'INVALID_INPUT', message: 'title is required' } }, 400);
      }

      const priorityMap: Record<string, Priority> = {
        critical: Priority.CRITICAL,
        high: Priority.HIGH,
        medium: Priority.MEDIUM,
        low: Priority.LOW,
      };
      const complexityMap: Record<string, Complexity> = {
        trivial: Complexity.TRIVIAL,
        simple: Complexity.SIMPLE,
        medium: Complexity.MEDIUM,
        complex: Complexity.COMPLEX,
        very_complex: Complexity.VERY_COMPLEX,
      };

      const metadata: Record<string, unknown> = {};
      if (body.description) {
        metadata.description = body.description;
      }

      const createdBy = (body.createdBy ?? 'el-0000') as EntityId;

      const taskData = await createTask({
        title: body.title,
        priority: body.priority ? priorityMap[body.priority] : undefined,
        complexity: body.complexity ? complexityMap[body.complexity] : undefined,
        tags: body.tags,
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
        ephemeral: body.ephemeral,
        createdBy,
      });

      const savedTask = await api.create(taskData as unknown as Record<string, unknown> & { createdBy: EntityId });
      return c.json({ task: formatTaskResponse(savedTask as unknown as Task) }, 201);
    } catch (error) {
      console.error('[orchestrator] Failed to create task:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
    }
  });

  // GET /api/tasks/:id
  app.get('/api/tasks/:id', async (c) => {
    try {
      const taskId = c.req.param('id') as ElementId;
      const task = await api.get<Task>(taskId);

      if (!task || task.type !== ElementType.TASK) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Task not found' } }, 404);
      }

      let assignmentInfo = null;
      if (task.assignee) {
        const agent = await agentRegistry.getAgent(task.assignee);
        if (agent) {
          const meta = (task.metadata as { orchestrator?: OrchestratorTaskMeta })?.orchestrator;
          assignmentInfo = {
            agent: {
              id: agent.id,
              name: agent.name,
              role: (agent.metadata as { agent?: { agentRole?: string } })?.agent?.agentRole,
            },
            branch: meta?.branch,
            worktree: meta?.worktree,
            sessionId: meta?.sessionId,
            mergeStatus: meta?.mergeStatus,
            startedAt: meta?.startedAt,
            completedAt: meta?.completedAt,
          };
        }
      }

      return c.json({ task: formatTaskResponse(task), assignment: assignmentInfo });
    } catch (error) {
      console.error('[orchestrator] Failed to get task:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
    }
  });

  // POST /api/tasks/:id/dispatch
  app.post('/api/tasks/:id/dispatch', async (c) => {
    try {
      const taskId = c.req.param('id') as ElementId;
      const body = (await c.req.json()) as {
        agentId: string;
        priority?: number;
        restart?: boolean;
        markAsStarted?: boolean;
        branch?: string;
        worktree?: string;
        notificationMessage?: string;
        dispatchedBy?: string;
      };

      if (!body.agentId) {
        return c.json({ error: { code: 'INVALID_INPUT', message: 'agentId is required' } }, 400);
      }

      const task = await api.get<Task>(taskId);
      if (!task || task.type !== ElementType.TASK) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Task not found' } }, 404);
      }

      const agent = await agentRegistry.getAgent(body.agentId as EntityId);
      if (!agent) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Agent not found' } }, 404);
      }

      const result = await dispatchService.dispatch(taskId, body.agentId as EntityId, {
        priority: body.priority,
        restart: body.restart,
        markAsStarted: body.markAsStarted,
        branch: body.branch,
        worktree: body.worktree,
        notificationMessage: body.notificationMessage,
        dispatchedBy: body.dispatchedBy as EntityId | undefined,
      });

      return c.json({
        success: true,
        task: formatTaskResponse(result.task),
        agent: { id: result.agent.id, name: result.agent.name },
        notification: { id: result.notification.id, channelId: result.channel.id },
        isNewAssignment: result.isNewAssignment,
        dispatchedAt: result.dispatchedAt,
      });
    } catch (error) {
      console.error('[orchestrator] Failed to dispatch task:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
    }
  });

  // POST /api/tasks/:id/start-worker
  app.post('/api/tasks/:id/start-worker', async (c) => {
    try {
      const taskId = c.req.param('id') as ElementId;
      const body = (await c.req.json()) as {
        agentId: string;
        branch?: string;
        worktreePath?: string;
        baseBranch?: string;
        additionalPrompt?: string;
        skipWorktree?: boolean;
        workingDirectory?: string;
        priority?: number;
        performedBy?: string;
      };

      if (!body.agentId) {
        return c.json({ error: { code: 'INVALID_INPUT', message: 'agentId is required' } }, 400);
      }

      const task = await api.get<Task>(taskId);
      if (!task || task.type !== ElementType.TASK) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Task not found' } }, 404);
      }

      const agent = await agentRegistry.getAgent(body.agentId as EntityId);
      if (!agent) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Agent not found' } }, 404);
      }

      const result = await workerTaskService.startWorkerOnTask(taskId, body.agentId as EntityId, {
        branch: body.branch,
        worktreePath: body.worktreePath,
        baseBranch: body.baseBranch,
        additionalPrompt: body.additionalPrompt,
        skipWorktree: body.skipWorktree,
        workingDirectory: body.workingDirectory,
        priority: body.priority,
        performedBy: body.performedBy as EntityId | undefined,
      });

      return c.json(
        {
          success: true,
          task: formatTaskResponse(result.task),
          agent: { id: result.agent.id, name: result.agent.name },
          session: {
            id: result.session.id,
            claudeSessionId: result.session.claudeSessionId,
            status: result.session.status,
            workingDirectory: result.session.workingDirectory,
          },
          worktree: result.worktree
            ? { path: result.worktree.path, branch: result.worktree.branch, branchCreated: result.worktree.branchCreated }
            : null,
          dispatch: {
            notificationId: result.dispatch.notification.id,
            channelId: result.dispatch.channel.id,
            isNewAssignment: result.dispatch.isNewAssignment,
          },
          startedAt: result.startedAt,
        },
        201
      );
    } catch (error) {
      const errorMessage = String(error);
      if (errorMessage.includes('not a worker')) {
        return c.json({ error: { code: 'INVALID_AGENT', message: 'Agent is not a worker' } }, 400);
      }
      console.error('[orchestrator] Failed to start worker on task:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: errorMessage } }, 500);
    }
  });

  // POST /api/tasks/:id/complete
  app.post('/api/tasks/:id/complete', async (c) => {
    try {
      const taskId = c.req.param('id') as ElementId;
      const body = (await c.req.json().catch(() => ({}))) as {
        summary?: string;
        commitHash?: string;
        performedBy?: string;
      };

      const task = await api.get<Task>(taskId);
      if (!task || task.type !== ElementType.TASK) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Task not found' } }, 404);
      }

      const result = await workerTaskService.completeTask(taskId, {
        summary: body.summary,
        commitHash: body.commitHash,
        performedBy: body.performedBy as EntityId | undefined,
      });

      return c.json({
        success: true,
        task: formatTaskResponse(result.task),
        worktree: result.worktree
          ? { path: result.worktree.path, branch: result.worktree.branch, state: result.worktree.state }
          : null,
        readyForMerge: result.readyForMerge,
        completedAt: result.completedAt,
      });
    } catch (error) {
      console.error('[orchestrator] Failed to complete task:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
    }
  });

  // GET /api/tasks/:id/context
  app.get('/api/tasks/:id/context', async (c) => {
    try {
      const taskId = c.req.param('id') as ElementId;
      const url = new URL(c.req.url);
      const additionalInstructions = url.searchParams.get('additionalInstructions') ?? undefined;

      const task = await api.get<Task>(taskId);
      if (!task || task.type !== ElementType.TASK) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Task not found' } }, 404);
      }

      const context = await workerTaskService.getTaskContext(taskId);
      const prompt = await workerTaskService.buildTaskContextPrompt(taskId, additionalInstructions);

      return c.json({ task: { id: task.id, title: task.title }, context, prompt });
    } catch (error) {
      console.error('[orchestrator] Failed to get task context:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
    }
  });

  // POST /api/tasks/:id/cleanup
  app.post('/api/tasks/:id/cleanup', async (c) => {
    try {
      const taskId = c.req.param('id') as ElementId;
      const body = (await c.req.json().catch(() => ({}))) as { deleteBranch?: boolean };

      const task = await api.get<Task>(taskId);
      if (!task || task.type !== ElementType.TASK) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Task not found' } }, 404);
      }

      const success = await workerTaskService.cleanupTask(taskId, body.deleteBranch ?? false);

      return c.json({ success, taskId, deletedBranch: success && (body.deleteBranch ?? false) });
    } catch (error) {
      console.error('[orchestrator] Failed to cleanup task:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
    }
  });

  return app;
}

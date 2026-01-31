/**
 * Session Routes
 *
 * Agent session management (start, stop, resume, stream).
 */

import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { EntityId, ElementId, Task } from '@elemental/core';
import { createTimestamp, ElementType } from '@elemental/core';
import type { SessionFilter, SpawnedSessionEvent } from '@elemental/orchestrator-sdk';
import type { Services } from '../services.js';
import { formatSessionRecord } from '../formatters.js';

type NotifyClientsCallback = (
  agentId: EntityId,
  session: { id: string; mode: 'headless' | 'interactive' },
  events: import('events').EventEmitter
) => void;

export function createSessionRoutes(
  services: Services,
  notifyClientsOfNewSession: NotifyClientsCallback
) {
  const { api, orchestratorApi, agentRegistry, sessionManager, spawnerService, sessionInitialPrompts, sessionMessageService } = services;
  const app = new Hono();

  // POST /api/agents/:id/start
  app.post('/api/agents/:id/start', async (c) => {
    try {
      const agentId = c.req.param('id') as EntityId;
      const body = (await c.req.json().catch(() => ({}))) as {
        taskId?: string;
        initialMessage?: string;
        workingDirectory?: string;
        worktree?: string;
        initialPrompt?: string;
        interactive?: boolean;
      };

      const agent = await agentRegistry.getAgent(agentId);
      if (!agent) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Agent not found' } }, 404);
      }

      const existingSession = sessionManager.getActiveSession(agentId);
      if (existingSession) {
        return c.json(
          {
            error: { code: 'SESSION_EXISTS', message: 'Agent already has an active session' },
            existingSession: formatSessionRecord(existingSession),
          },
          409
        );
      }

      let effectivePrompt = body.initialPrompt;
      let assignedTask: { id: string; title: string } | undefined;

      if (body.taskId) {
        const taskResult = await api.get<Task>(body.taskId as ElementId);
        if (!taskResult || taskResult.type !== ElementType.TASK) {
          return c.json({ error: { code: 'NOT_FOUND', message: 'Task not found' } }, 404);
        }

        await orchestratorApi.assignTaskToAgent(body.taskId as ElementId, agentId);

        const taskPrompt = `You have been assigned the following task:

**Task ID**: ${taskResult.id}
**Title**: ${taskResult.title}
**Priority**: ${taskResult.priority ?? 'Not set'}
${taskResult.acceptanceCriteria ? `**Acceptance Criteria**: ${taskResult.acceptanceCriteria}` : ''}

Please begin working on this task. Use \`el task get ${taskResult.id}\` to see full details if needed.`;

        effectivePrompt = body.initialMessage
          ? `${taskPrompt}\n\n**Additional Instructions**:\n${body.initialMessage}${body.initialPrompt ? `\n\n${body.initialPrompt}` : ''}`
          : body.initialPrompt
            ? `${taskPrompt}\n\n${body.initialPrompt}`
            : taskPrompt;

        assignedTask = { id: taskResult.id, title: taskResult.title };
      } else if (body.initialMessage) {
        effectivePrompt = body.initialPrompt
          ? `${body.initialMessage}\n\n${body.initialPrompt}`
          : body.initialMessage;
      }

      const { session, events } = await sessionManager.startSession(agentId, {
        workingDirectory: body.workingDirectory,
        worktree: body.worktree,
        initialPrompt: effectivePrompt,
        interactive: body.interactive,
      });

      if (effectivePrompt) {
        sessionInitialPrompts.set(session.id, effectivePrompt);
        // Save initial prompt to database immediately (don't wait for SSE connection)
        const initialMsgId = `user-${session.id}-initial`;
        sessionMessageService.saveMessage({
          id: initialMsgId,
          sessionId: session.id,
          agentId,
          type: 'user',
          content: effectivePrompt,
          isError: false,
        });
      }

      notifyClientsOfNewSession(agentId, session, events);

      return c.json(
        {
          success: true,
          session: formatSessionRecord(session),
          ...(assignedTask && { assignedTask }),
        },
        201
      );
    } catch (error) {
      console.error('[orchestrator] Failed to start session:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
    }
  });

  // POST /api/agents/:id/stop
  app.post('/api/agents/:id/stop', async (c) => {
    try {
      const agentId = c.req.param('id') as EntityId;
      const body = (await c.req.json().catch(() => ({}))) as {
        graceful?: boolean;
        reason?: string;
      };

      const activeSession = sessionManager.getActiveSession(agentId);
      if (!activeSession) {
        try {
          await agentRegistry.updateAgentSession(agentId, undefined, 'idle');
        } catch {
          // Agent may not exist
        }
        return c.json({ success: true, message: 'No active session to stop' });
      }

      await sessionManager.stopSession(activeSession.id, {
        graceful: body.graceful,
        reason: body.reason,
      });

      // Clean up initial prompt for this session
      sessionInitialPrompts.delete(activeSession.id);

      return c.json({ success: true, sessionId: activeSession.id });
    } catch (error) {
      console.error('[orchestrator] Failed to stop session:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
    }
  });

  // POST /api/agents/:id/interrupt
  app.post('/api/agents/:id/interrupt', async (c) => {
    try {
      const agentId = c.req.param('id') as EntityId;

      const activeSession = sessionManager.getActiveSession(agentId);
      if (!activeSession) {
        return c.json({ error: { code: 'NO_SESSION', message: 'No active session to interrupt' } }, 404);
      }

      await sessionManager.interruptSession(activeSession.id);
      return c.json({ success: true, sessionId: activeSession.id });
    } catch (error) {
      console.error('[orchestrator] Failed to interrupt session:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
    }
  });

  // POST /api/agents/:id/resume
  app.post('/api/agents/:id/resume', async (c) => {
    try {
      const agentId = c.req.param('id') as EntityId;
      const body = (await c.req.json().catch(() => ({}))) as {
        claudeSessionId?: string;
        workingDirectory?: string;
        worktree?: string;
        resumePrompt?: string;
        checkReadyQueue?: boolean;
      };

      const agent = await agentRegistry.getAgent(agentId);
      if (!agent) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Agent not found' } }, 404);
      }

      const existingSession = sessionManager.getActiveSession(agentId);
      if (existingSession) {
        return c.json(
          {
            error: { code: 'SESSION_EXISTS', message: 'Agent already has an active session' },
            existingSession: formatSessionRecord(existingSession),
          },
          409
        );
      }

      let claudeSessionId = body.claudeSessionId;
      if (!claudeSessionId) {
        const resumable = sessionManager.getMostRecentResumableSession(agentId);
        if (!resumable?.claudeSessionId) {
          return c.json({ error: { code: 'NO_RESUMABLE_SESSION', message: 'No resumable session found' } }, 404);
        }
        claudeSessionId = resumable.claudeSessionId;
      }

      const { session, events, uwpCheck } = await sessionManager.resumeSession(agentId, {
        claudeSessionId,
        workingDirectory: body.workingDirectory,
        worktree: body.worktree,
        resumePrompt: body.resumePrompt,
        checkReadyQueue: body.checkReadyQueue,
      });

      // Save resume prompt to database if provided
      if (body.resumePrompt) {
        sessionInitialPrompts.set(session.id, body.resumePrompt);
        const resumeMsgId = `user-${session.id}-resume`;
        sessionMessageService.saveMessage({
          id: resumeMsgId,
          sessionId: session.id,
          agentId,
          type: 'user',
          content: body.resumePrompt,
          isError: false,
        });
      }

      notifyClientsOfNewSession(agentId, session, events);

      return c.json({ success: true, session: formatSessionRecord(session), uwpCheck }, 201);
    } catch (error) {
      console.error('[orchestrator] Failed to resume session:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
    }
  });

  // GET /api/agents/:id/stream
  app.get('/api/agents/:id/stream', async (c) => {
    const agentId = c.req.param('id') as EntityId;

    const activeSession = sessionManager.getActiveSession(agentId);
    if (!activeSession) {
      return c.json({ error: { code: 'NO_SESSION', message: 'Agent has no active session' } }, 404);
    }

    const events = sessionManager.getEventEmitter(activeSession.id);
    if (!events) {
      return c.json({ error: { code: 'NO_EVENTS', message: 'Session event emitter not available' } }, 404);
    }

    return streamSSE(c, async (stream) => {
      let eventId = 0;

      try {
        await stream.writeSSE({
          id: String(++eventId),
          event: 'connected',
          data: JSON.stringify({
            sessionId: activeSession.id,
            agentId,
            timestamp: createTimestamp(),
          }),
        });

        // Send initial prompt to every connecting client (for real-time display)
        // Note: The initial prompt is already saved to database when session starts
        // We keep the prompt in the map for the session duration so reconnecting clients also get it via SSE
        const initialPrompt = sessionInitialPrompts.get(activeSession.id);
        if (initialPrompt) {
          const initialMsgId = `user-${activeSession.id}-initial`;
          await stream.writeSSE({
            id: initialMsgId,
            event: 'agent_user',
            data: JSON.stringify({
              type: 'user',
              message: initialPrompt,
              msgId: initialMsgId, // Include ID in data for deduplication
              raw: { type: 'user', content: initialPrompt },
            }),
          });
        }

        const onEvent = async (event: SpawnedSessionEvent) => {
          const msgId = `${event.type}-${activeSession.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          await stream.writeSSE({
            id: msgId,
            event: `agent_${event.type}`,
            data: JSON.stringify({ ...event, msgId }), // Include ID in data for deduplication
          });

          // Skip saving system and result events (not displayed in UI)
          if (event.type === 'system' || event.type === 'result') {
            return;
          }

          // Extract content from event (match client-side logic)
          // Content can be in: event.message, event.raw?.message, event.raw?.content (if string)
          // IMPORTANT: content MUST be a string or undefined, never an object (SQLite can't bind objects)
          let content: string | undefined = typeof event.message === 'string' ? event.message : undefined;
          if (!content && event.raw) {
            const raw = event.raw as Record<string, unknown>;
            // Only use raw.message if it's actually a string
            if (typeof raw.message === 'string') {
              content = raw.message;
            } else if (typeof raw.content === 'string') {
              content = raw.content;
            }
            // If raw.content is an array (Claude API format), extract text from text blocks
            if (!content && Array.isArray(raw.content)) {
              const textParts: string[] = [];
              for (const block of raw.content) {
                if (typeof block === 'object' && block !== null && 'type' in block) {
                  const b = block as { type: string; text?: string };
                  if (b.type === 'text' && typeof b.text === 'string') {
                    textParts.push(b.text);
                  }
                }
              }
              if (textParts.length > 0) {
                content = textParts.join('');
              }
            }
          }

          // Extract tool info from event
          // Tool info is in event.tool (parsed) or event.raw.tool (raw)
          let toolName = event.tool?.name;
          let toolInput = event.tool?.input;
          let toolOutput: string | undefined;
          let actualType = event.type;

          // Check for tool_use/tool_result blocks in content arrays (Claude API format)
          const raw = event.raw as Record<string, unknown>;
          const rawContentArray = raw?.content;
          if (Array.isArray(rawContentArray)) {
            for (const block of rawContentArray) {
              if (typeof block === 'object' && block !== null && 'type' in block) {
                const b = block as { type: string; name?: string; input?: unknown; content?: string };
                if (b.type === 'tool_use' && b.name) {
                  toolName = toolName || b.name;
                  toolInput = toolInput || b.input;
                  // Override type if we found tool info but type was 'assistant'
                  if (actualType === 'assistant') {
                    actualType = 'tool_use';
                  }
                } else if (b.type === 'tool_result') {
                  toolOutput = typeof b.content === 'string' ? b.content : undefined;
                  if (actualType === 'user') {
                    actualType = 'tool_result';
                  }
                }
              }
            }
          }

          // For tool_result, use raw content as output if not found
          if (actualType === 'tool_result' && !toolOutput && typeof raw?.content === 'string') {
            toolOutput = raw.content as string;
          }

          // For tool_result events, content should be empty (output is in toolOutput)
          const finalContent = (actualType === 'tool_result' && toolOutput) ? undefined : content;

          // Safely stringify tool input (JSON.stringify can return undefined for functions)
          let toolInputStr: string | undefined;
          if (toolInput !== undefined && toolInput !== null) {
            try {
              const str = JSON.stringify(toolInput);
              toolInputStr = typeof str === 'string' ? str : undefined;
            } catch {
              toolInputStr = String(toolInput);
            }
          }

          sessionMessageService.saveMessage({
            id: msgId,
            sessionId: activeSession.id,
            agentId,
            type: actualType as 'user' | 'assistant' | 'tool_use' | 'tool_result' | 'error',
            content: finalContent,
            toolName: toolName,
            toolInput: toolInputStr,
            toolOutput: toolOutput,
            isError: actualType === 'error',
          });
        };

        const onError = async (error: Error) => {
          const msgId = `error-${activeSession.id}-${Date.now()}`;
          await stream.writeSSE({
            id: msgId,
            event: 'agent_error',
            data: JSON.stringify({ error: error.message }),
          });
          // Save error to database
          sessionMessageService.saveMessage({
            id: msgId,
            sessionId: activeSession.id,
            agentId,
            type: 'error',
            content: error.message,
            isError: true,
          });
        };

        const onExit = async (code: number | null, signal: string | null) => {
          await stream.writeSSE({
            id: String(++eventId),
            event: 'agent_exit',
            data: JSON.stringify({ code, signal }),
          });
        };

        events.on('event', onEvent);
        events.on('error', onError);
        events.on('exit', onExit);

        const heartbeatInterval = setInterval(async () => {
          try {
            await stream.writeSSE({
              id: String(++eventId),
              event: 'heartbeat',
              data: JSON.stringify({ timestamp: createTimestamp() }),
            });
          } catch {
            clearInterval(heartbeatInterval);
          }
        }, 30000);

        stream.onAbort(() => {
          clearInterval(heartbeatInterval);
          events.off('event', onEvent);
          events.off('error', onError);
          events.off('exit', onExit);
        });

        await new Promise(() => {});
      } catch (error) {
        console.error(`[orchestrator] SSE: Error in stream:`, error);
      }
    });
  });

  // POST /api/agents/:id/input
  app.post('/api/agents/:id/input', async (c) => {
    try {
      const agentId = c.req.param('id') as EntityId;
      const body = (await c.req.json()) as {
        input: string;
        isUserMessage?: boolean;
      };

      if (!body.input) {
        return c.json({ error: { code: 'INVALID_INPUT', message: 'Input is required' } }, 400);
      }

      const activeSession = sessionManager.getActiveSession(agentId);
      if (!activeSession) {
        return c.json({ error: { code: 'NO_SESSION', message: 'Agent has no active session' } }, 404);
      }

      await spawnerService.sendInput(activeSession.id, body.input, {
        isUserMessage: body.isUserMessage,
      });

      // Save user input to database if it's a user message
      if (body.isUserMessage) {
        const inputMsgId = `user-${activeSession.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        sessionMessageService.saveMessage({
          id: inputMsgId,
          sessionId: activeSession.id,
          agentId,
          type: 'user',
          content: body.input,
          isError: false,
        });
      }

      return c.json({ success: true, sessionId: activeSession.id }, 202);
    } catch (error) {
      console.error('[orchestrator] Failed to send input:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
    }
  });

  // GET /api/sessions
  app.get('/api/sessions', async (c) => {
    try {
      const url = new URL(c.req.url);
      const agentIdParam = url.searchParams.get('agentId');
      const roleParam = url.searchParams.get('role');
      const statusParam = url.searchParams.get('status');
      const resumableParam = url.searchParams.get('resumable');

      const filter: SessionFilter = {
        ...(agentIdParam && { agentId: agentIdParam as EntityId }),
        ...(roleParam && { role: roleParam as 'director' | 'worker' | 'steward' }),
        ...(statusParam && {
          status: statusParam.includes(',')
            ? (statusParam.split(',') as ('starting' | 'running' | 'suspended' | 'terminating' | 'terminated')[])
            : (statusParam as 'starting' | 'running' | 'suspended' | 'terminating' | 'terminated'),
        }),
        ...(resumableParam === 'true' && { resumable: true }),
      };

      const sessions = sessionManager.listSessions(filter);
      return c.json({ sessions: sessions.map(formatSessionRecord) });
    } catch (error) {
      console.error('[orchestrator] Failed to list sessions:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
    }
  });

  // GET /api/sessions/:id
  app.get('/api/sessions/:id', async (c) => {
    try {
      const sessionId = c.req.param('id');
      const session = sessionManager.getSession(sessionId);
      if (!session) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Session not found' } }, 404);
      }
      return c.json({ session: formatSessionRecord(session) });
    } catch (error) {
      console.error('[orchestrator] Failed to get session:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
    }
  });

  // GET /api/sessions/:id/messages
  // Retrieve all messages for a session (for transcript restoration)
  app.get('/api/sessions/:id/messages', async (c) => {
    try {
      const sessionId = c.req.param('id');
      const url = new URL(c.req.url);
      const afterId = url.searchParams.get('after');

      const messages = afterId
        ? sessionMessageService.getSessionMessagesAfter(sessionId, afterId)
        : sessionMessageService.getSessionMessages(sessionId);

      return c.json({ messages });
    } catch (error) {
      console.error('[orchestrator] Failed to get session messages:', error);
      return c.json({ error: { code: 'INTERNAL_ERROR', message: String(error) } }, 500);
    }
  });

  return app;
}

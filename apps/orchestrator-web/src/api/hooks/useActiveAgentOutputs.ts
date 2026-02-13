/**
 * Hook to track the latest SSE output per agent
 *
 * Subscribes to the activity stream and maintains a Map<agentId, lastOutput>
 * so dashboard cards can show the most recent output line per agent without
 * scanning the flat sessionEvents array on every render.
 *
 * On mount, fetches the latest persisted message for each running session
 * so cards immediately show meaningful status instead of "working...".
 */

import { useRef, useState, useEffect, useCallback } from 'react';
import { useActivityStream } from './useActivity.js';
import type { SessionEvent, SessionEventType } from '../types.js';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3457';

export interface AgentOutput {
  content: string;
  timestamp: string;
  eventType: SessionEvent['type'];
}

/**
 * Generate a display string for tool events that have no message content
 */
function getToolActivityDisplay(event: SessionEvent): string | undefined {
  if (event.type === 'tool_use') {
    // Use tool name from event if available
    const toolName = event.tool;
    if (toolName) {
      // Capitalize first letter for nicer display
      const displayName = toolName.charAt(0).toUpperCase() + toolName.slice(1);
      return `Using ${displayName}...`;
    }
    return 'Running tool...';
  }

  if (event.type === 'tool_result') {
    return 'Tool completed';
  }

  return undefined;
}

/**
 * Event types that indicate active work even without message content
 */
const ACTIVE_EVENT_TYPES: Set<SessionEventType> = new Set(['tool_use', 'tool_result', 'assistant']);

/**
 * Info about a running session, used to seed initial output state
 */
export interface RunningSessionInfo {
  sessionId: string;
  agentId: string;
}

/**
 * Fetch latest displayable messages for a set of sessions from the REST API.
 * Returns a map of agentId -> AgentOutput.
 */
async function fetchLatestMessages(
  sessions: RunningSessionInfo[]
): Promise<Map<string, AgentOutput>> {
  const result = new Map<string, AgentOutput>();
  if (sessions.length === 0) return result;

  const sessionIds = sessions.map((s) => s.sessionId).join(',');

  try {
    const response = await fetch(
      `${API_BASE}/api/sessions/latest-messages?sessionIds=${encodeURIComponent(sessionIds)}`
    );
    if (!response.ok) return result;

    const data = (await response.json()) as {
      messages: Record<
        string,
        {
          content?: string;
          type: string;
          toolName?: string;
          timestamp: string;
          agentId: string;
        }
      >;
    };

    for (const [, msg] of Object.entries(data.messages)) {
      if (msg.content && msg.agentId) {
        result.set(msg.agentId, {
          content: msg.content,
          timestamp: msg.timestamp,
          eventType: msg.type as SessionEvent['type'],
        });
      }
    }
  } catch {
    // Silently fail — SSE will fill in the data shortly
  }

  return result;
}

export function useActiveAgentOutputs(runningSessions?: RunningSessionInfo[]) {
  const { isConnected, sessionEvents } = useActivityStream('all');
  const mapRef = useRef<Map<string, AgentOutput>>(new Map());
  const [version, setVersion] = useState(0);
  const lastProcessedRef = useRef(0);
  const seededSessionsRef = useRef<Set<string>>(new Set());

  // Seed initial output from persisted messages when sessions are provided
  const seedInitialOutput = useCallback(async (sessions: RunningSessionInfo[]) => {
    // Only seed sessions we haven't seeded yet
    const unseeded = sessions.filter((s) => !seededSessionsRef.current.has(s.sessionId));
    if (unseeded.length === 0) return;

    const initial = await fetchLatestMessages(unseeded);

    let changed = false;
    for (const [agentId, output] of initial) {
      // Only set if we don't already have a more recent SSE update
      if (!mapRef.current.has(agentId)) {
        mapRef.current.set(agentId, output);
        changed = true;
      }
    }

    // Mark these sessions as seeded
    for (const s of unseeded) {
      seededSessionsRef.current.add(s.sessionId);
    }

    if (changed) {
      setVersion((v) => v + 1);
    }
  }, []);

  // Seed when runningSessions change
  useEffect(() => {
    if (runningSessions && runningSessions.length > 0) {
      seedInitialOutput(runningSessions);
    }
  }, [runningSessions, seedInitialOutput]);

  useEffect(() => {
    if (sessionEvents.length === 0) {
      if (mapRef.current.size > 0) {
        mapRef.current.clear();
        setVersion((v) => v + 1);
      }
      lastProcessedRef.current = 0;
      return;
    }

    // sessionEvents is newest-first, so process new events
    // that arrived since our last check
    const newCount = sessionEvents.length - lastProcessedRef.current;
    if (newCount <= 0) return;

    let changed = false;
    // New events are at indices 0..newCount-1 (newest first)
    for (let i = newCount - 1; i >= 0; i--) {
      const event = sessionEvents[i];
      if (!event.agentId) continue;

      // Determine content to display
      let displayContent = event.content;

      // If no content but it's a tool event, generate synthetic display
      if (!displayContent && ACTIVE_EVENT_TYPES.has(event.type)) {
        displayContent = getToolActivityDisplay(event);
      }

      // Skip events with no displayable content
      if (!displayContent) continue;

      mapRef.current.set(event.agentId, {
        content: displayContent,
        timestamp: event.timestamp,
        eventType: event.type,
      });
      changed = true;
    }

    lastProcessedRef.current = sessionEvents.length;
    if (changed) {
      setVersion((v) => v + 1);
    }
  }, [sessionEvents]);

  return {
    outputByAgent: mapRef.current,
    isConnected,
    /** Used internally to trigger re-renders; can be ignored by consumers */
    _version: version,
  };
}

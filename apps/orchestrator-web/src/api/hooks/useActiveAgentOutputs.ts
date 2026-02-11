/**
 * Hook to track the latest SSE output per agent
 *
 * Subscribes to the activity stream and maintains a Map<agentId, lastOutput>
 * so dashboard cards can show the most recent output line per agent without
 * scanning the flat sessionEvents array on every render.
 */

import { useRef, useState, useEffect } from 'react';
import { useActivityStream } from './useActivity.js';
import type { SessionEvent } from '../types.js';

export interface AgentOutput {
  content: string;
  timestamp: string;
  eventType: SessionEvent['type'];
}

export function useActiveAgentOutputs() {
  const { isConnected, sessionEvents } = useActivityStream('all');
  const mapRef = useRef<Map<string, AgentOutput>>(new Map());
  const [version, setVersion] = useState(0);
  const lastProcessedRef = useRef(0);

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
      if (!event.agentId || !event.content) continue;

      mapRef.current.set(event.agentId, {
        content: event.content,
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

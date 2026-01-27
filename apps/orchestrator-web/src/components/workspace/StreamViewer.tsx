/**
 * StreamViewer - JSON stream renderer for ephemeral agent output
 *
 * Renders stream-json events in a terminal-like format with syntax highlighting.
 * Used for viewing ephemeral worker and steward output.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Send, ChevronDown, ChevronRight, Bot, Wrench, AlertCircle, User, Info } from 'lucide-react';
import type { StreamEvent } from './types';
import type { PaneStatus } from './types';

export interface StreamViewerProps {
  agentId: string;
  agentName: string;
  onStatusChange?: (status: PaneStatus) => void;
  'data-testid'?: string;
}

const DEFAULT_SSE_URL = '/api/agents';

/** Event type colors */
const eventColors: Record<string, { bg: string; text: string; border: string }> = {
  assistant: {
    bg: 'bg-blue-50 dark:bg-blue-900/20',
    text: 'text-blue-700 dark:text-blue-300',
    border: 'border-blue-200 dark:border-blue-800',
  },
  tool_use: {
    bg: 'bg-amber-50 dark:bg-amber-900/20',
    text: 'text-amber-700 dark:text-amber-300',
    border: 'border-amber-200 dark:border-amber-800',
  },
  tool_result: {
    bg: 'bg-green-50 dark:bg-green-900/20',
    text: 'text-green-700 dark:text-green-300',
    border: 'border-green-200 dark:border-green-800',
  },
  user: {
    bg: 'bg-purple-50 dark:bg-purple-900/20',
    text: 'text-purple-700 dark:text-purple-300',
    border: 'border-purple-200 dark:border-purple-800',
  },
  system: {
    bg: 'bg-gray-50 dark:bg-gray-800/50',
    text: 'text-gray-600 dark:text-gray-400',
    border: 'border-gray-200 dark:border-gray-700',
  },
  error: {
    bg: 'bg-red-50 dark:bg-red-900/20',
    text: 'text-red-700 dark:text-red-300',
    border: 'border-red-200 dark:border-red-800',
  },
};

/** Event type icons */
const eventIcons: Record<string, typeof Bot> = {
  assistant: Bot,
  tool_use: Wrench,
  tool_result: Wrench,
  user: User,
  system: Info,
  error: AlertCircle,
};

/** Check if event has any displayable content */
function hasEventContent(event: StreamEvent): boolean {
  return event.content != null || event.toolInput != null || event.toolOutput != null;
}

function StreamEventCard({
  event,
  isLast,
}: {
  event: StreamEvent;
  isLast: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(true);
  const colors = eventColors[event.type] || eventColors.system;
  const Icon = eventIcons[event.type] || Info;

  // Format timestamp
  const time = new Date(event.timestamp).toLocaleTimeString();

  return (
    <div
      className={`
        mb-2 rounded-md border overflow-hidden
        ${colors.bg} ${colors.border}
        ${isLast ? 'animate-fade-in' : ''}
      `}
      data-testid={`stream-event-${event.id}`}
    >
      {/* Event header */}
      <div
        className={`
          flex items-center gap-2 px-3 py-1.5 cursor-pointer
          ${colors.text}
        `}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {/* Expand/collapse icon */}
        {event.content || event.toolInput || event.toolOutput ? (
          isExpanded ? (
            <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" />
          )
        ) : (
          <div className="w-3.5 h-3.5 flex-shrink-0" />
        )}

        {/* Event type icon */}
        <Icon className="w-4 h-4 flex-shrink-0" />

        {/* Event type label */}
        <span className="text-xs font-semibold uppercase tracking-wide flex-shrink-0">
          {event.type.replace('_', ' ')}
        </span>

        {/* Tool name (for tool events) */}
        {event.toolName && (
          <span className="text-xs font-mono opacity-75 truncate">
            {event.toolName}
          </span>
        )}

        {/* Timestamp */}
        <span className="ml-auto text-xs opacity-50 flex-shrink-0">
          {time}
        </span>
      </div>

      {/* Event content */}
      {isExpanded && hasEventContent(event) && (
        <div className="px-3 py-2 border-t border-[var(--color-border)]/30">
          {/* Assistant/User message content */}
          {event.content != null && event.content !== '' && (
            <div className="text-sm whitespace-pre-wrap break-words text-[var(--color-text)]">
              {event.content}
            </div>
          )}

          {/* Tool input */}
          {event.toolInput != null && (
            <div className="mt-2">
              <div className="text-xs font-medium text-[var(--color-text-secondary)] mb-1">
                Input:
              </div>
              <pre className="
                text-xs font-mono p-2 rounded
                bg-[var(--color-bg-secondary)]
                text-[var(--color-text-secondary)]
                overflow-x-auto
              ">
                {typeof event.toolInput === 'string'
                  ? event.toolInput
                  : String(JSON.stringify(event.toolInput, null, 2))}
              </pre>
            </div>
          )}

          {/* Tool output */}
          {event.toolOutput && (
            <div className="mt-2">
              <div className="text-xs font-medium text-[var(--color-text-secondary)] mb-1">
                Output:
              </div>
              <pre className="
                text-xs font-mono p-2 rounded
                bg-[var(--color-bg-secondary)]
                text-[var(--color-text-secondary)]
                overflow-x-auto max-h-48 overflow-y-auto
              ">
                {event.toolOutput}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function StreamViewer({
  agentId,
  agentName,
  onStatusChange,
  'data-testid': testId = 'stream-viewer',
}: StreamViewerProps) {
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [status, setStatus] = useState<PaneStatus>('disconnected');
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;

  // Update status and notify parent
  const updateStatus = useCallback((newStatus: PaneStatus) => {
    setStatus(newStatus);
    onStatusChange?.(newStatus);
  }, [onStatusChange]);

  // Auto-scroll to bottom when new events arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events]);

  // Connect to SSE stream
  useEffect(() => {
    if (!agentId) {
      updateStatus('disconnected');
      return;
    }

    const connect = () => {
      updateStatus('connecting');

      const eventSource = new EventSource(`${DEFAULT_SSE_URL}/${agentId}/stream`);
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        reconnectAttempts.current = 0;
        updateStatus('connected');
      };

      eventSource.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);

          // Handle different event types
          if (data.type === 'connected') {
            // Initial connection event
            return;
          }

          if (data.type === 'heartbeat') {
            // Ignore heartbeats
            return;
          }

          // Extract event from wrapper if present
          const eventData = data.event || data;
          const eventType = eventData.type?.replace('agent_', '') || 'system';

          const newEvent: StreamEvent = {
            id: e.lastEventId || `event-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            type: eventType as StreamEvent['type'],
            timestamp: Date.now(),
            content: eventData.content || eventData.data?.content,
            toolName: eventData.data?.name || eventData.toolName,
            toolInput: eventData.data?.input || eventData.toolInput,
            toolOutput: eventData.output || eventData.data?.output,
            isError: eventType === 'error',
          };

          setEvents(prev => [...prev.slice(-200), newEvent]); // Keep last 200 events
        } catch (err) {
          console.error('[StreamViewer] Error parsing event:', err);
        }
      };

      eventSource.onerror = () => {
        updateStatus('error');
        eventSource.close();

        if (reconnectAttempts.current < maxReconnectAttempts) {
          reconnectAttempts.current++;
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
          setTimeout(connect, delay);
        }
      };
    };

    connect();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [agentId, updateStatus]);

  // Send input to agent
  const sendInput = async () => {
    if (!input.trim() || isSending) return;

    setIsSending(true);

    // Add user message to events
    const userEvent: StreamEvent = {
      id: `user-${Date.now()}`,
      type: 'user',
      timestamp: Date.now(),
      content: input.trim(),
    };
    setEvents(prev => [...prev, userEvent]);

    try {
      const response = await fetch(`${DEFAULT_SSE_URL}/${agentId}/input`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: input.trim(),
          isUserMessage: true,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      setInput('');
    } catch (err) {
      console.error('[StreamViewer] Error sending input:', err);
      // Add error event
      const errorEvent: StreamEvent = {
        id: `error-${Date.now()}`,
        type: 'error',
        timestamp: Date.now(),
        content: `Failed to send message: ${err instanceof Error ? err.message : 'Unknown error'}`,
        isError: true,
      };
      setEvents(prev => [...prev, errorEvent]);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div
      className="flex flex-col h-full bg-[var(--color-bg-secondary)]"
      data-testid={testId}
      data-status={status}
    >
      {/* Event stream */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-3 space-y-1"
        data-testid="stream-events"
      >
        {events.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-[var(--color-text-tertiary)]">
            <Bot className="w-8 h-8 mb-2 opacity-50" />
            <p className="text-sm">
              {status === 'connected'
                ? `Waiting for output from ${agentName}...`
                : status === 'connecting'
                ? 'Connecting...'
                : 'Not connected'}
            </p>
          </div>
        ) : (
          events.map((event, index) => (
            <StreamEventCard
              key={event.id}
              event={event}
              isLast={index === events.length - 1}
            />
          ))
        )}
      </div>

      {/* Input area */}
      <div className="
        flex items-center gap-2 p-3
        border-t border-[var(--color-border)]
        bg-[var(--color-surface)]
      ">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              sendInput();
            }
          }}
          placeholder={status === 'connected' ? 'Type a message...' : 'Connect to send messages'}
          disabled={status !== 'connected' || isSending}
          className="
            flex-1 px-3 py-2
            text-sm
            bg-[var(--color-bg)]
            border border-[var(--color-border)]
            rounded-md
            placeholder:text-[var(--color-text-tertiary)]
            focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]
            disabled:opacity-50 disabled:cursor-not-allowed
          "
          data-testid="stream-input"
        />
        <button
          onClick={sendInput}
          disabled={!input.trim() || status !== 'connected' || isSending}
          className="
            p-2 rounded-md
            text-white bg-[var(--color-primary)]
            hover:bg-[var(--color-primary-hover)]
            disabled:opacity-50 disabled:cursor-not-allowed
            transition-colors
          "
          title="Send message"
          data-testid="stream-send-btn"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

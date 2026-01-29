/**
 * StreamViewer - JSON stream renderer for ephemeral agent output
 *
 * Renders stream-json events in a terminal-like format with syntax highlighting.
 * Used for viewing ephemeral worker and steward output.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronDown, ChevronRight, Bot, Wrench, AlertCircle, User, Info } from 'lucide-react';
import type { StreamEvent } from './types';
import type { PaneStatus } from './types';
import { TerminalInput } from './TerminalInput';

export interface StreamViewerProps {
  agentId: string;
  agentName: string;
  /** API URL for file uploads (defaults to orchestrator server) */
  apiUrl?: string;
  onStatusChange?: (status: PaneStatus) => void;
  /** Whether to enable file drag and drop (default: true) */
  enableFileDrop?: boolean;
  'data-testid'?: string;
}

const DEFAULT_SSE_URL = '/api/agents';
const DEFAULT_API_URL = 'http://localhost:3457';

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
  apiUrl = DEFAULT_API_URL,
  onStatusChange,
  enableFileDrop = true,
  'data-testid': testId = 'stream-viewer',
}: StreamViewerProps) {
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [status, setStatus] = useState<PaneStatus>('disconnected');
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;
  // Track if we're intentionally closing to prevent reconnection attempts
  const isIntentionalCloseRef = useRef(false);

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

      // Handler for agent events
      const handleAgentEvent = (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);

          // Extract the actual event data (may be wrapped)
          const eventData = data.event || data;
          const eventType = (eventData.type?.replace('agent_', '') || 'system') as StreamEvent['type'];

          const newEvent: StreamEvent = {
            id: e.lastEventId || `event-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            type: eventType,
            timestamp: Date.now(),
            content: eventData.message || eventData.content || eventData.data?.content,
            toolName: eventData.tool?.name || eventData.data?.name || eventData.toolName,
            toolInput: eventData.tool?.input || eventData.data?.input || eventData.toolInput,
            toolOutput: eventData.output || eventData.data?.output,
            isError: eventType === 'error',
          };

          setEvents(prev => [...prev.slice(-200), newEvent]); // Keep last 200 events
        } catch (err) {
          console.error('[StreamViewer] Error parsing event:', err);
        }
      };

      // Listen for named SSE events from the server
      // The server sends: connected, heartbeat, agent_assistant, agent_tool_use, agent_tool_result, agent_error, agent_exit
      eventSource.addEventListener('connected', () => {
        // Connection confirmed by server
      });

      eventSource.addEventListener('heartbeat', () => {
        // Heartbeat received, connection is alive
      });

      eventSource.addEventListener('agent_system', handleAgentEvent);
      eventSource.addEventListener('agent_assistant', handleAgentEvent);
      eventSource.addEventListener('agent_user', handleAgentEvent);
      eventSource.addEventListener('agent_tool_use', handleAgentEvent);
      eventSource.addEventListener('agent_tool_result', handleAgentEvent);
      eventSource.addEventListener('agent_error', handleAgentEvent);
      eventSource.addEventListener('agent_result', handleAgentEvent);

      eventSource.addEventListener('agent_exit', (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          const exitEvent: StreamEvent = {
            id: `exit-${Date.now()}`,
            type: 'system',
            timestamp: Date.now(),
            content: `Session exited with code ${data.code}${data.signal ? ` (signal: ${data.signal})` : ''}`,
          };
          setEvents(prev => [...prev, exitEvent]);
        } catch (err) {
          console.error('[StreamViewer] Error parsing exit event:', err);
        }
      });

      // Fallback for unnamed events (compatibility)
      eventSource.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);

          // Handle different event types
          if (data.type === 'connected' || data.type === 'heartbeat') {
            return;
          }

          // Process as agent event
          handleAgentEvent(e);
        } catch (err) {
          console.error('[StreamViewer] Error parsing message:', err);
        }
      };

      eventSource.onerror = () => {
        // Don't attempt to reconnect if we're intentionally closing
        if (isIntentionalCloseRef.current) {
          isIntentionalCloseRef.current = false;
          return;
        }

        updateStatus('error');
        eventSource.close();

        if (reconnectAttempts.current < maxReconnectAttempts) {
          reconnectAttempts.current++;
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
          setTimeout(connect, delay);
        }
      };
    };

    // Reset the intentional close flag when starting a new connection
    isIntentionalCloseRef.current = false;
    connect();

    return () => {
      if (eventSourceRef.current) {
        // Mark as intentional close to prevent reconnection attempts
        isIntentionalCloseRef.current = true;
        // Remove all event listeners before closing
        const es = eventSourceRef.current;
        es.onopen = null;
        es.onmessage = null;
        es.onerror = null;
        es.close();
        eventSourceRef.current = null;
      }
    };
  }, [agentId, updateStatus]);

  // Send input to agent
  const sendInput = useCallback(async (message: string) => {
    // Add user message to events
    const userEvent: StreamEvent = {
      id: `user-${Date.now()}`,
      type: 'user',
      timestamp: Date.now(),
      content: message,
    };
    setEvents(prev => [...prev, userEvent]);

    try {
      const response = await fetch(`${DEFAULT_SSE_URL}/${agentId}/input`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: message,
          isUserMessage: true,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
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
      throw err; // Re-throw so TerminalInput can restore input
    }
  }, [agentId]);

  // File upload function - uses base64 encoding to avoid Bun's multipart binary corruption
  const uploadFile = useCallback(async (file: File): Promise<string | null> => {
    try {
      // Read file as base64 to avoid binary corruption in Bun's multipart handling
      const arrayBuffer = await file.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
      );

      const response = await fetch(`${apiUrl}/api/terminal/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filename: file.name,
          data: base64,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `Upload failed: ${response.status}`);
      }

      const data = await response.json() as { path: string; filename: string; size: number };
      return data.path;
    } catch (error) {
      console.error('[StreamViewer] File upload failed:', error);
      const errorEvent: StreamEvent = {
        id: `error-${Date.now()}`,
        type: 'error',
        timestamp: Date.now(),
        content: `File upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        isError: true,
      };
      setEvents(prev => [...prev, errorEvent]);
      return null;
    }
  }, [apiUrl]);

  // Handle file drop
  const handleDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    if (!enableFileDrop || status !== 'connected') return;

    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    setIsUploading(true);

    // Add upload notification event
    const uploadEvent: StreamEvent = {
      id: `system-${Date.now()}`,
      type: 'system',
      timestamp: Date.now(),
      content: `Uploading ${files.length} file(s)...`,
    };
    setEvents(prev => [...prev, uploadEvent]);

    // Upload files and collect paths
    const paths: string[] = [];
    for (const file of files) {
      const path = await uploadFile(file);
      if (path) {
        paths.push(path);
      }
    }

    setIsUploading(false);

    if (paths.length > 0) {
      // Store paths for potential use, then send them directly
      const pathsText = paths.join(' ');

      // Add success notification with paths
      const successEvent: StreamEvent = {
        id: `system-${Date.now() + 1}`,
        type: 'system',
        timestamp: Date.now(),
        content: `${paths.length} file(s) uploaded:\n${pathsText}`,
      };
      setEvents(prev => [...prev, successEvent]);

      // Automatically send the file paths as a message
      await sendInput(pathsText);
    }
  }, [enableFileDrop, status, uploadFile, sendInput]);

  // Handle drag over
  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (enableFileDrop && status === 'connected') {
      setIsDragOver(true);
    }
  }, [enableFileDrop, status]);

  // Handle drag enter
  const handleDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (enableFileDrop && status === 'connected') {
      setIsDragOver(true);
    }
  }, [enableFileDrop, status]);

  // Handle drag leave
  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    // Only set to false if we're leaving the container (not entering a child)
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      const { clientX, clientY } = e;
      if (
        clientX < rect.left ||
        clientX >= rect.right ||
        clientY < rect.top ||
        clientY >= rect.bottom
      ) {
        setIsDragOver(false);
      }
    }
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative flex flex-col h-full bg-[var(--color-bg-secondary)]"
      data-testid={testId}
      data-status={status}
      data-drag-over={isDragOver}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
    >
      {/* Drag and drop overlay */}
      {isDragOver && enableFileDrop && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center bg-[var(--color-primary)]/20 border-2 border-dashed border-[var(--color-primary)] rounded-lg pointer-events-none"
          data-testid="file-drop-overlay"
        >
          <div className="flex flex-col items-center gap-2 p-4 rounded-lg bg-[var(--color-bg)]/90 shadow-lg">
            <svg
              className="w-10 h-10 text-[var(--color-primary)]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
            <span className="text-sm font-medium text-[var(--color-text)]">
              Drop files to upload
            </span>
            <span className="text-xs text-[var(--color-text-muted)]">
              File paths will be added to input
            </span>
          </div>
        </div>
      )}

      {/* Upload progress overlay */}
      {isUploading && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center bg-[var(--color-bg)]/50 pointer-events-none"
          data-testid="upload-progress-overlay"
        >
          <div className="flex items-center gap-2 p-3 rounded-lg bg-[var(--color-bg)] shadow-lg border border-[var(--color-border)]">
            <svg
              className="w-5 h-5 text-[var(--color-primary)] animate-spin"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <span className="text-sm text-[var(--color-text)]">Uploading...</span>
          </div>
        </div>
      )}

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
      <TerminalInput
        isConnected={status === 'connected'}
        onSend={sendInput}
        data-testid="stream-input"
      />
    </div>
  );
}

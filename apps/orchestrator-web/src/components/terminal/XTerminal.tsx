/**
 * XTerminal - Interactive terminal component using xterm.js
 *
 * This component provides a full-featured terminal emulator for interactive
 * agent sessions. It connects via WebSocket to the orchestrator server
 * and supports PTY communication.
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';

export type TerminalStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface XTerminalProps {
  /** Agent ID to connect to */
  agentId?: string;
  /** WebSocket URL (defaults to orchestrator server) */
  wsUrl?: string;
  /** Called when terminal status changes */
  onStatusChange?: (status: TerminalStatus) => void;
  /** Called when terminal connects successfully */
  onConnected?: () => void;
  /** Called when terminal receives data */
  onData?: (data: string) => void;
  /** Theme variant */
  theme?: 'dark' | 'light';
  /** Font size in pixels */
  fontSize?: number;
  /** Font family */
  fontFamily?: string;
  /** Whether to auto-fit terminal to container */
  autoFit?: boolean;
  /** Whether terminal should be interactive (accept input) */
  interactive?: boolean;
  /** Whether to auto-focus the terminal on mount */
  autoFocus?: boolean;
  /** Whether this terminal controls PTY resize (default: true).
   * Set to false for secondary viewers to prevent resize conflicts. */
  controlsResize?: boolean;
  /** Test ID for testing */
  'data-testid'?: string;
}

// Theme configurations
const DARK_THEME = {
  background: '#1a1a1a',
  foreground: '#e0e0e0',
  cursor: '#e0e0e0',
  cursorAccent: '#1a1a1a',
  selectionBackground: '#404040',
  selectionForeground: '#ffffff',
  black: '#1a1a1a',
  red: '#ff5555',
  green: '#50fa7b',
  yellow: '#f1fa8c',
  blue: '#6272a4',
  magenta: '#ff79c6',
  cyan: '#8be9fd',
  white: '#e0e0e0',
  brightBlack: '#555555',
  brightRed: '#ff6e6e',
  brightGreen: '#69ff94',
  brightYellow: '#ffffa5',
  brightBlue: '#d6acff',
  brightMagenta: '#ff92df',
  brightCyan: '#a4ffff',
  brightWhite: '#ffffff',
};

const LIGHT_THEME = {
  background: '#ffffff',
  foreground: '#333333',
  cursor: '#333333',
  cursorAccent: '#ffffff',
  selectionBackground: '#add6ff',
  selectionForeground: '#000000',
  black: '#000000',
  red: '#cd3131',
  green: '#00bc00',
  yellow: '#949800',
  blue: '#0451a5',
  magenta: '#bc05bc',
  cyan: '#0598bc',
  white: '#555555',
  brightBlack: '#666666',
  brightRed: '#cd3131',
  brightGreen: '#14ce14',
  brightYellow: '#b5ba00',
  brightBlue: '#0451a5',
  brightMagenta: '#bc05bc',
  brightCyan: '#0598bc',
  brightWhite: '#a5a5a5',
};

const DEFAULT_WS_URL = 'ws://localhost:3457/ws';

export function XTerminal({
  agentId,
  wsUrl = DEFAULT_WS_URL,
  onStatusChange,
  onConnected,
  onData,
  theme = 'dark',
  fontSize = 13,
  fontFamily = '"JetBrains Mono", "Fira Code", Consolas, "Liberation Mono", Menlo, Courier, monospace',
  autoFit = true,
  interactive = true,
  autoFocus = false,
  controlsResize = true,
  'data-testid': testId = 'xterminal',
}: XTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<TerminalStatus>('disconnected');
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;
  // Track session to avoid duplicate session-started messages
  const currentSessionRef = useRef<string | null>(null);
  // Track if we've shown initial connection message to avoid duplicates on reconnect
  const hasShownConnectionRef = useRef(false);
  // Track last sent dimensions to avoid duplicate resize messages
  const lastSentDimsRef = useRef<{ cols: number; rows: number } | null>(null);

  // Store callbacks in refs to avoid recreating dependent callbacks
  // This prevents WebSocket reconnection loops when parent passes inline functions
  const onStatusChangeRef = useRef(onStatusChange);
  const onConnectedRef = useRef(onConnected);
  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
    onConnectedRef.current = onConnected;
  }, [onStatusChange, onConnected]);

  // Update status and notify callback
  const updateStatus = useCallback((newStatus: TerminalStatus) => {
    setStatus(newStatus);
    onStatusChangeRef.current?.(newStatus);
  }, []);

  // Send data to WebSocket
  const sendToServer = useCallback((data: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'input', input: data }));
    }
  }, []);

  // Initialize terminal
  useEffect(() => {
    if (!containerRef.current || terminalRef.current) return;

    const terminal = new Terminal({
      theme: theme === 'dark' ? DARK_THEME : LIGHT_THEME,
      fontSize,
      fontFamily,
      cursorBlink: true,
      cursorStyle: 'block',
      scrollback: 10000,
      allowProposedApi: true,
      convertEol: true,
      disableStdin: !interactive,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    terminal.loadAddon(fitAddon);
    terminal.loadAddon(webLinksAddon);
    terminal.open(containerRef.current);

    if (autoFit) {
      fitAddon.fit();
    }

    // Handle user input
    if (interactive) {
      terminal.onData((data) => {
        sendToServer(data);
        onData?.(data);
      });
    }

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    // Write welcome message
    terminal.writeln('\x1b[1;36m  Elemental Orchestrator Terminal\x1b[0m');
    terminal.writeln('\x1b[90m  Connecting to agent...\x1b[0m');
    terminal.writeln('');

    // Auto-focus if requested
    if (autoFocus && interactive) {
      // Delay focus slightly to ensure terminal is fully rendered
      setTimeout(() => terminal.focus(), 100);
    }

    return () => {
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, [theme, fontSize, fontFamily, autoFit, interactive, autoFocus, sendToServer, onData]);

  // Handle resize
  useEffect(() => {
    if (!autoFit || !containerRef.current || !fitAddonRef.current) return;

    // Debounce timer for PTY resize messages
    let resizeDebounceTimer: ReturnType<typeof setTimeout> | null = null;

    const sendResizeToServer = () => {
      if (controlsResize && wsRef.current?.readyState === WebSocket.OPEN && fitAddonRef.current) {
        const dims = fitAddonRef.current.proposeDimensions();
        if (dims) {
          // Skip if dimensions haven't changed
          const last = lastSentDimsRef.current;
          if (last && last.cols === dims.cols && last.rows === dims.rows) {
            return;
          }
          lastSentDimsRef.current = { cols: dims.cols, rows: dims.rows };
          wsRef.current.send(JSON.stringify({ type: 'resize', cols: dims.cols, rows: dims.rows }));
        }
      }
    };

    const handleResize = () => {
      try {
        // Always fit the terminal visually (this is fast and doesn't cause issues)
        fitAddonRef.current?.fit();

        // Debounce sending resize to PTY server to avoid rapid redraws
        if (resizeDebounceTimer) {
          clearTimeout(resizeDebounceTimer);
        }
        resizeDebounceTimer = setTimeout(sendResizeToServer, 150);
      } catch {
        // Ignore resize errors (can happen during unmount)
      }
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      if (resizeDebounceTimer) {
        clearTimeout(resizeDebounceTimer);
      }
    };
  }, [autoFit, controlsResize]);

  // WebSocket connection
  useEffect(() => {
    if (!agentId) {
      updateStatus('disconnected');
      if (!hasShownConnectionRef.current) {
        terminalRef.current?.writeln('\x1b[33m  No agent selected\x1b[0m');
      }
      return;
    }

    // Reset tracking refs when agentId changes
    hasShownConnectionRef.current = false;
    currentSessionRef.current = null;
    lastSentDimsRef.current = null;

    const connect = () => {
      updateStatus('connecting');
      // Only show connecting message on first attempt, not reconnects
      if (reconnectAttempts.current === 0) {
        terminalRef.current?.writeln(`\x1b[90m  Connecting to agent ${agentId}...\x1b[0m`);
      }

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        reconnectAttempts.current = 0;
        // Subscribe to agent events
        ws.send(JSON.stringify({ type: 'subscribe', agentId }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as {
            type: string;
            event?: { type: string; data?: unknown; content?: string; output?: string };
            data?: string; // For pty-data messages
            hasSession?: boolean;
            isInteractive?: boolean;
            sessionId?: string;
            error?: string;
          };

          switch (data.type) {
            case 'subscribed':
              updateStatus('connected');
              onConnectedRef.current?.();
              // Only show connection message once per mount
              if (!hasShownConnectionRef.current) {
                hasShownConnectionRef.current = true;
                if (data.isInteractive) {
                  terminalRef.current?.writeln(
                    data.hasSession
                      ? '\x1b[32m  Connected to interactive PTY session\x1b[0m\r\n'
                      : '\x1b[33m  Agent has no active session\x1b[0m\r\n'
                  );
                } else {
                  terminalRef.current?.writeln(
                    data.hasSession
                      ? '\x1b[32m  Connected to active session\x1b[0m\r\n'
                      : '\x1b[33m  Agent has no active session\x1b[0m\r\n'
                  );
                }
              }
              // Send initial resize for interactive sessions (only if this terminal controls resize)
              // Use a small delay to ensure terminal is fully laid out
              if (controlsResize && data.hasSession && fitAddonRef.current && terminalRef.current) {
                setTimeout(() => {
                  if (wsRef.current?.readyState === WebSocket.OPEN && fitAddonRef.current) {
                    const dims = fitAddonRef.current.proposeDimensions();
                    if (dims) {
                      // Skip if dimensions haven't changed
                      const last = lastSentDimsRef.current;
                      if (last && last.cols === dims.cols && last.rows === dims.rows) {
                        return;
                      }
                      lastSentDimsRef.current = { cols: dims.cols, rows: dims.rows };
                      wsRef.current.send(JSON.stringify({ type: 'resize', cols: dims.cols, rows: dims.rows }));
                    }
                  }
                }, 100);
              }
              break;

            case 'pty-data':
              // Raw PTY data from interactive session
              if (data.data) {
                terminalRef.current?.write(data.data);
              }
              break;

            case 'event':
              if (data.event) {
                handleAgentEvent(data.event);
              }
              break;

            case 'error':
              terminalRef.current?.writeln(`\x1b[31m  Error: ${data.error}\x1b[0m`);
              break;

            case 'exit':
              terminalRef.current?.writeln('\x1b[90m  Session ended\x1b[0m');
              currentSessionRef.current = null;
              break;

            case 'pong':
              // Heartbeat response, ignore
              break;

            case 'session-started': {
              // A new session was started for this agent
              const sessionId = (data as { sessionId?: string }).sessionId;
              // Only process if this is a new session (avoid duplicates)
              if (sessionId && sessionId === currentSessionRef.current) {
                break; // Already processed this session
              }
              currentSessionRef.current = sessionId ?? null;
              // Reset last sent dimensions so new session gets a fresh resize
              lastSentDimsRef.current = null;

              // Clear previous output and show new session message
              terminalRef.current?.clear();
              terminalRef.current?.writeln(
                (data as { isInteractive?: boolean }).isInteractive
                  ? '\x1b[32m  Session started - interactive PTY connected\x1b[0m\r\n'
                  : '\x1b[32m  Session started - connected\x1b[0m\r\n'
              );
              // Send initial resize for interactive sessions (only if this terminal controls resize)
              // Use a small delay to ensure terminal is fully laid out
              if (controlsResize && (data as { isInteractive?: boolean }).isInteractive && fitAddonRef.current && terminalRef.current) {
                setTimeout(() => {
                  if (wsRef.current?.readyState === WebSocket.OPEN && fitAddonRef.current) {
                    const dims = fitAddonRef.current.proposeDimensions();
                    if (dims) {
                      // Skip if dimensions haven't changed
                      const last = lastSentDimsRef.current;
                      if (last && last.cols === dims.cols && last.rows === dims.rows) {
                        return;
                      }
                      lastSentDimsRef.current = { cols: dims.cols, rows: dims.rows };
                      wsRef.current.send(JSON.stringify({ type: 'resize', cols: dims.cols, rows: dims.rows }));
                    }
                  }
                }, 100);
              }
              break;
            }
          }
        } catch (err) {
          console.error('[XTerminal] Error parsing message:', err);
        }
      };

      ws.onerror = () => {
        updateStatus('error');
        terminalRef.current?.writeln('\x1b[31m  WebSocket error\x1b[0m');
      };

      ws.onclose = () => {
        if (reconnectAttempts.current < maxReconnectAttempts) {
          reconnectAttempts.current++;
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
          terminalRef.current?.writeln(
            `\x1b[33m  Reconnecting in ${delay / 1000}s (attempt ${reconnectAttempts.current}/${maxReconnectAttempts})...\x1b[0m`
          );
          setTimeout(connect, delay);
        } else {
          updateStatus('error');
          terminalRef.current?.writeln(
            '\x1b[31m  Connection lost. Max reconnect attempts reached.\x1b[0m'
          );
        }
      };
    };

    // Handle agent events
    const handleAgentEvent = (event: { type: string; data?: unknown; content?: string; output?: string }) => {
      const terminal = terminalRef.current;
      if (!terminal) return;

      switch (event.type) {
        case 'assistant':
          // Claude assistant response - may contain content
          if (event.content) {
            terminal.write(event.content);
          }
          break;

        case 'tool_use':
          // Tool invocation
          terminal.writeln(`\x1b[36m[Tool: ${(event.data as { name?: string })?.name ?? 'unknown'}]\x1b[0m`);
          break;

        case 'tool_result':
          // Tool result
          if (event.output) {
            terminal.writeln(`\x1b[90m${event.output}\x1b[0m`);
          }
          break;

        case 'system':
          // System message
          if (event.content) {
            terminal.writeln(`\x1b[33m[System] ${event.content}\x1b[0m`);
          }
          break;

        case 'error':
          // Error
          terminal.writeln(`\x1b[31m[Error] ${event.content ?? 'Unknown error'}\x1b[0m`);
          break;
      }
    };

    connect();

    // Heartbeat to keep connection alive
    const heartbeatInterval = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'ping' }));
      }
    }, 30000);

    return () => {
      clearInterval(heartbeatInterval);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  // Note: updateStatus uses refs internally so it's stable and doesn't need to be in deps
  }, [agentId, wsUrl, updateStatus]);

  // Public methods exposed via ref
  const write = useCallback((data: string) => {
    terminalRef.current?.write(data);
  }, []);

  const writeln = useCallback((data: string) => {
    terminalRef.current?.writeln(data);
  }, []);

  const clear = useCallback(() => {
    terminalRef.current?.clear();
  }, []);

  const focus = useCallback(() => {
    terminalRef.current?.focus();
  }, []);

  const fit = useCallback(() => {
    fitAddonRef.current?.fit();
  }, []);

  // Expose methods through window for testing
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__xterminal = {
      write,
      writeln,
      clear,
      focus,
      fit,
      getStatus: () => status,
    };
    return () => {
      delete (window as unknown as Record<string, unknown>).__xterminal;
    };
  }, [write, writeln, clear, focus, fit, status]);

  // Handle click to focus terminal
  const handleClick = useCallback(() => {
    if (interactive) {
      terminalRef.current?.focus();
    }
  }, [interactive]);

  return (
    <div
      ref={containerRef}
      data-testid={testId}
      data-status={status}
      className="w-full h-full overflow-hidden cursor-text"
      style={{ minHeight: '200px' }}
      onClick={handleClick}
    />
  );
}

export default XTerminal;

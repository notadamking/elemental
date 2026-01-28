/**
 * DirectorPanel - Right sidebar panel for Director agent terminal
 * Collapsible panel that shows the Director agent's interactive terminal
 */

import { useState, useCallback } from 'react';
import {
  PanelRightClose,
  Terminal,
  Circle,
  Play,
  Square,
  RefreshCw,
  Maximize2,
  AlertCircle,
} from 'lucide-react';
import { Tooltip } from '../ui/Tooltip';
import { XTerminal, type TerminalStatus } from '../terminal';
import { useDirector, useStartAgentSession, useStopAgentSession } from '../../api/hooks/useAgents';

type DirectorStatus = 'idle' | 'running' | 'error' | 'connecting' | 'no-director';

interface DirectorPanelProps {
  collapsed?: boolean;
  onToggle?: () => void;
  onOpenInWorkspaces?: () => void;
}

export function DirectorPanel({ collapsed = false, onToggle, onOpenInWorkspaces }: DirectorPanelProps) {
  const [terminalStatus, setTerminalStatus] = useState<TerminalStatus>('disconnected');
  const { director, hasActiveSession, isLoading, error } = useDirector();
  const startSession = useStartAgentSession();
  const stopSession = useStopAgentSession();

  // Derive the director status from various sources
  const getStatus = (): DirectorStatus => {
    if (error || terminalStatus === 'error') return 'error';
    if (isLoading || terminalStatus === 'connecting') return 'connecting';
    if (!director) return 'no-director';
    if (hasActiveSession && terminalStatus === 'connected') return 'running';
    return 'idle';
  };

  const status = getStatus();

  const statusColor = {
    idle: 'text-[var(--color-text-tertiary)]',
    running: 'text-[var(--color-success)]',
    error: 'text-[var(--color-danger)]',
    connecting: 'text-[var(--color-warning)]',
    'no-director': 'text-[var(--color-text-muted)]',
  }[status];

  const statusLabel = {
    idle: 'Idle',
    running: 'Running',
    error: 'Error',
    connecting: 'Connecting...',
    'no-director': 'No Director',
  }[status];

  const handleStartSession = useCallback(async () => {
    if (!director?.id) return;
    try {
      await startSession.mutateAsync({ agentId: director.id });
    } catch (err) {
      console.error('Failed to start director session:', err);
    }
  }, [director?.id, startSession]);

  const handleStopSession = useCallback(async () => {
    if (!director?.id) return;
    try {
      await stopSession.mutateAsync({ agentId: director.id, graceful: true });
    } catch (err) {
      console.error('Failed to stop director session:', err);
    }
  }, [director?.id, stopSession]);

  const handleTerminalStatusChange = useCallback((newStatus: TerminalStatus) => {
    setTerminalStatus(newStatus);
  }, []);

  if (collapsed) {
    return (
      <aside
        className="flex flex-col items-center py-3 w-12 border-l border-[var(--color-border)] bg-[var(--color-bg-secondary)]"
        data-testid="director-panel-collapsed"
      >
        <Tooltip content="Open Director Panel" side="left">
          <button
            onClick={onToggle}
            className="relative p-2 rounded-md text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] transition-colors duration-150"
            aria-label="Open Director Panel"
            data-testid="director-panel-expand"
          >
            <Terminal className="w-5 h-5" />
            {/* Status indicator dot */}
            <Circle
              className={`absolute -top-0.5 -right-0.5 w-2.5 h-2.5 fill-current ${statusColor}`}
            />
          </button>
        </Tooltip>
      </aside>
    );
  }

  return (
    <aside
      className="flex flex-col w-96 border-l border-[var(--color-border)] bg-[var(--color-bg-secondary)]"
      data-testid="director-panel"
    >
      {/* Header */}
      <div className="flex items-center justify-between h-14 px-4 border-b border-[var(--color-border)]">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-[var(--color-text-secondary)]" />
          <span className="text-sm font-medium text-[var(--color-text)]">Director</span>
          <span className={`flex items-center gap-1 text-xs ${statusColor}`}>
            <Circle className="w-2 h-2 fill-current" />
            {statusLabel}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {/* Session Controls */}
          {director && (
            <>
              {!hasActiveSession ? (
                <Tooltip content="Start Director Session" side="bottom">
                  <button
                    onClick={handleStartSession}
                    disabled={startSession.isPending}
                    className="p-1.5 rounded-md text-[var(--color-success)] hover:bg-[var(--color-surface-hover)] transition-colors duration-150 disabled:opacity-50"
                    aria-label="Start Director Session"
                    data-testid="director-start-session"
                  >
                    {startSession.isPending ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Play className="w-4 h-4" />
                    )}
                  </button>
                </Tooltip>
              ) : (
                <Tooltip content="Stop Director Session" side="bottom">
                  <button
                    onClick={handleStopSession}
                    disabled={stopSession.isPending}
                    className="p-1.5 rounded-md text-[var(--color-danger)] hover:bg-[var(--color-surface-hover)] transition-colors duration-150 disabled:opacity-50"
                    aria-label="Stop Director Session"
                    data-testid="director-stop-session"
                  >
                    {stopSession.isPending ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Square className="w-4 h-4" />
                    )}
                  </button>
                </Tooltip>
              )}
            </>
          )}
          <Tooltip content="Collapse Panel" side="left">
            <button
              onClick={onToggle}
              className="p-1.5 rounded-md text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] transition-colors duration-150"
              aria-label="Collapse Director Panel"
              data-testid="director-panel-collapse"
            >
              <PanelRightClose className="w-4 h-4" />
            </button>
          </Tooltip>
        </div>
      </div>

      {/* Terminal Area */}
      <div className="flex-1 p-2 overflow-hidden" data-testid="director-terminal-container">
        <div className="h-full rounded-lg bg-[#1a1a1a] border border-[var(--color-border)] flex flex-col overflow-hidden">
          {/* Terminal header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--color-border)] bg-[#252525]">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <div className={`w-2.5 h-2.5 rounded-full ${hasActiveSession ? 'bg-green-500' : 'bg-red-500 opacity-50'}`} />
                <div className="w-2.5 h-2.5 rounded-full bg-yellow-500 opacity-50" />
                <div className="w-2.5 h-2.5 rounded-full bg-green-500 opacity-50" />
              </div>
              <span className="text-xs text-gray-400 font-mono">
                {director?.name ?? 'director'}
              </span>
            </div>
          </div>

          {/* Terminal body */}
          <div className="flex-1 overflow-hidden">
            {status === 'no-director' ? (
              <div className="flex flex-col items-center justify-center h-full p-4 text-center">
                <AlertCircle className="w-8 h-8 text-[var(--color-text-muted)] mb-2" />
                <p className="text-sm text-[var(--color-text-muted)]">No Director agent found</p>
                <p className="text-xs text-[var(--color-text-tertiary)] mt-1">
                  Register a Director agent to use this terminal
                </p>
              </div>
            ) : status === 'error' && error ? (
              <div className="flex flex-col items-center justify-center h-full p-4 text-center">
                <AlertCircle className="w-8 h-8 text-[var(--color-danger)] mb-2" />
                <p className="text-sm text-[var(--color-danger)]">Connection Error</p>
                <p className="text-xs text-[var(--color-text-tertiary)] mt-1">
                  {error.message}
                </p>
              </div>
            ) : (
              <XTerminal
                agentId={director?.id}
                onStatusChange={handleTerminalStatusChange}
                theme="dark"
                fontSize={12}
                autoFit={true}
                interactive={true}
                autoFocus={true}
                data-testid="director-xterminal"
              />
            )}
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="px-4 py-3 border-t border-[var(--color-border)]">
        <div className="flex items-center gap-2">
          <Tooltip content="Open full terminal in Workspaces" side="top">
            <button
              onClick={onOpenInWorkspaces}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-[var(--color-text-secondary)] rounded-md border border-[var(--color-border)] hover:bg-[var(--color-surface-hover)] transition-colors duration-150"
              data-testid="director-expand-terminal"
            >
              <Maximize2 className="w-4 h-4" />
              Open in Workspaces
            </button>
          </Tooltip>
        </div>
      </div>
    </aside>
  );
}

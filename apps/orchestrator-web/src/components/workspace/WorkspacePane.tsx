/**
 * WorkspacePane - A single pane in the workspace terminal multiplexer
 *
 * Renders either an interactive terminal (XTerminal) for persistent workers
 * or a stream viewer for ephemeral workers.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { X, Maximize2, Minimize2, MoreVertical, Terminal, Radio } from 'lucide-react';
import type { WorkspacePane as WorkspacePaneType, PaneStatus } from './types';
import { XTerminal } from '../terminal/XTerminal';
import { StreamViewer } from './StreamViewer';

export interface WorkspacePaneProps {
  pane: WorkspacePaneType;
  isActive: boolean;
  isMaximized: boolean;
  onClose: () => void;
  onMaximize: () => void;
  onMinimize: () => void;
  onFocus: () => void;
  onStatusChange: (status: PaneStatus) => void;
}

/** Status indicator colors */
const statusColors: Record<PaneStatus, string> = {
  disconnected: 'bg-gray-400',
  connecting: 'bg-yellow-500 animate-pulse',
  connected: 'bg-green-500',
  error: 'bg-red-500',
};

/** Status text */
const statusText: Record<PaneStatus, string> = {
  disconnected: 'Disconnected',
  connecting: 'Connecting...',
  connected: 'Connected',
  error: 'Error',
};

/** Role badge styles */
const roleBadgeStyles: Record<string, { bg: string; text: string; icon: typeof Terminal }> = {
  director: { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-700 dark:text-purple-300', icon: Terminal },
  worker: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-300', icon: Terminal },
  steward: { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-300', icon: Radio },
};

export function WorkspacePane({
  pane,
  isActive,
  isMaximized,
  onClose,
  onMaximize,
  onMinimize,
  onFocus,
  onStatusChange,
}: WorkspacePaneProps) {
  const [showMenu, setShowMenu] = useState(false);

  // Use ref to avoid recreating callback when onStatusChange prop changes
  // This prevents WebSocket reconnection loops caused by inline arrow functions in parent
  const onStatusChangeRef = useRef(onStatusChange);
  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
  }, [onStatusChange]);

  const handleStatusChange = useCallback((status: 'disconnected' | 'connecting' | 'connected' | 'error') => {
    onStatusChangeRef.current(status);
  }, []);

  const roleStyle = roleBadgeStyles[pane.agentRole] || roleBadgeStyles.worker;
  const RoleIcon = roleStyle.icon;

  return (
    <div
      className={`
        flex flex-col h-full
        rounded-lg border overflow-hidden
        transition-all duration-150
        ${isActive
          ? 'border-[var(--color-primary)] ring-1 ring-[var(--color-primary)]/30'
          : 'border-[var(--color-border)]'
        }
        bg-[var(--color-bg-secondary)]
      `}
      onClick={onFocus}
      data-testid={`workspace-pane-${pane.id}`}
      data-pane-id={pane.id}
      data-agent-id={pane.agentId}
      data-pane-type={pane.paneType}
    >
      {/* Pane Header */}
      <div
        className="
          flex items-center justify-between
          px-3 py-2
          border-b border-[var(--color-border)]
          bg-[var(--color-surface)]
          cursor-grab active:cursor-grabbing
        "
        data-testid="pane-header"
      >
        {/* Left: Agent info */}
        <div className="flex items-center gap-2 min-w-0">
          {/* Status indicator */}
          <div
            className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${statusColors[pane.status]}`}
            title={statusText[pane.status]}
          />

          {/* Role badge */}
          <span className={`
            inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium flex-shrink-0
            ${roleStyle.bg} ${roleStyle.text}
          `}>
            <RoleIcon className="w-3 h-3" />
            {pane.agentRole}
          </span>

          {/* Agent name */}
          <span
            className="text-sm font-mono text-[var(--color-text)] truncate"
            title={pane.agentName}
          >
            {pane.agentName}
          </span>

          {/* Worker mode badge */}
          {pane.workerMode && (
            <span className="
              px-1.5 py-0.5 rounded text-xs
              bg-[var(--color-surface-hover)] text-[var(--color-text-tertiary)]
              flex-shrink-0
            ">
              {pane.workerMode}
            </span>
          )}

          {/* Pane type indicator */}
          {pane.paneType === 'stream' && (
            <span className="text-xs text-[var(--color-text-tertiary)] flex-shrink-0">
              (stream)
            </span>
          )}
        </div>

        {/* Right: Window controls */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {/* Maximize/Minimize button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              isMaximized ? onMinimize() : onMaximize();
            }}
            className="
              p-1 rounded
              text-[var(--color-text-tertiary)]
              hover:text-[var(--color-text)]
              hover:bg-[var(--color-surface-hover)]
              transition-colors
            "
            title={isMaximized ? 'Restore' : 'Maximize'}
            data-testid="pane-maximize-btn"
          >
            {isMaximized ? (
              <Minimize2 className="w-3.5 h-3.5" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5" />
            )}
          </button>

          {/* More menu */}
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowMenu(!showMenu);
              }}
              className="
                p-1 rounded
                text-[var(--color-text-tertiary)]
                hover:text-[var(--color-text)]
                hover:bg-[var(--color-surface-hover)]
                transition-colors
              "
              title="More options"
              data-testid="pane-menu-btn"
            >
              <MoreVertical className="w-3.5 h-3.5" />
            </button>

            {/* Dropdown menu */}
            {showMenu && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setShowMenu(false)}
                />
                <div
                  className="
                    absolute right-0 top-full mt-1 z-20
                    min-w-32 py-1 rounded-md shadow-lg
                    bg-[var(--color-bg)] border border-[var(--color-border)]
                  "
                  data-testid="pane-menu"
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowMenu(false);
                      // TODO: Add pop-out functionality
                    }}
                    className="
                      w-full px-3 py-1.5 text-left text-sm
                      text-[var(--color-text-secondary)]
                      hover:bg-[var(--color-surface-hover)]
                    "
                  >
                    Pop out
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowMenu(false);
                      // TODO: Clear terminal
                    }}
                    className="
                      w-full px-3 py-1.5 text-left text-sm
                      text-[var(--color-text-secondary)]
                      hover:bg-[var(--color-surface-hover)]
                    "
                  >
                    Clear
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Close button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="
              p-1 rounded
              text-[var(--color-text-tertiary)]
              hover:text-red-500
              hover:bg-red-50 dark:hover:bg-red-900/20
              transition-colors
            "
            title="Close pane"
            data-testid="pane-close-btn"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Pane Content */}
      <div className="flex-1 min-h-0 overflow-hidden" data-testid="pane-content">
        {pane.paneType === 'terminal' ? (
          <XTerminal
            agentId={pane.agentId}
            onStatusChange={handleStatusChange}
            interactive={true}
            autoFocus={true}
            data-testid={`terminal-${pane.id}`}
          />
        ) : (
          <StreamViewer
            agentId={pane.agentId}
            agentName={pane.agentName}
            onStatusChange={handleStatusChange}
            data-testid={`stream-${pane.id}`}
          />
        )}
      </div>
    </div>
  );
}

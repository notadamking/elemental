/**
 * DirectorPanel - Right sidebar panel for Director agent terminal
 * Collapsible panel that shows the Director agent's interactive terminal
 */

import { useState } from 'react';
import {
  PanelRight,
  PanelRightClose,
  Terminal,
  Circle,
} from 'lucide-react';
import { Tooltip } from '../ui/Tooltip';

type DirectorStatus = 'idle' | 'running' | 'error';

interface DirectorPanelProps {
  collapsed?: boolean;
  onToggle?: () => void;
}

export function DirectorPanel({ collapsed = false, onToggle }: DirectorPanelProps) {
  // For now, director is always idle (no actual terminal yet)
  const [status] = useState<DirectorStatus>('idle');

  const statusColor = {
    idle: 'text-[var(--color-text-tertiary)]',
    running: 'text-[var(--color-success)]',
    error: 'text-[var(--color-danger)]',
  }[status];

  const statusLabel = {
    idle: 'Idle',
    running: 'Running',
    error: 'Error',
  }[status];

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
      className="flex flex-col w-80 border-l border-[var(--color-border)] bg-[var(--color-bg-secondary)]"
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

      {/* Terminal placeholder */}
      <div className="flex-1 p-4 overflow-hidden">
        <div className="h-full rounded-lg bg-[var(--color-bg)] border border-[var(--color-border)] flex flex-col">
          {/* Terminal header */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--color-border)]">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500 opacity-50" />
              <div className="w-2.5 h-2.5 rounded-full bg-yellow-500 opacity-50" />
              <div className="w-2.5 h-2.5 rounded-full bg-green-500 opacity-50" />
            </div>
            <span className="text-xs text-[var(--color-text-muted)] font-mono">director</span>
          </div>

          {/* Terminal body */}
          <div className="flex-1 p-3 font-mono text-xs text-[var(--color-text-secondary)] overflow-auto">
            <p className="text-[var(--color-text-muted)]"># Director terminal not connected</p>
            <p className="text-[var(--color-text-muted)]"># Start the orchestrator server and connect an agent</p>
            <p className="mt-4 text-[var(--color-text-tertiary)]">
              <span className="text-[var(--color-success)]">$</span> _
            </p>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="px-4 py-3 border-t border-[var(--color-border)]">
        <div className="flex items-center gap-2">
          <Tooltip content="Expand to full terminal" side="top">
            <button
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-[var(--color-text-secondary)] rounded-md border border-[var(--color-border)] hover:bg-[var(--color-surface-hover)] transition-colors duration-150"
              data-testid="director-expand-terminal"
            >
              <PanelRight className="w-4 h-4" />
              Open in Workspaces
            </button>
          </Tooltip>
        </div>
      </div>
    </aside>
  );
}

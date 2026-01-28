/**
 * AgentCard - Card component for displaying agent information
 *
 * Shows agent name, role, status, capabilities, and actions.
 */

import { useState, useRef, useEffect } from 'react';
import { Play, Square, RefreshCw, Terminal, MoreVertical, Clock, GitBranch, Pencil } from 'lucide-react';
import type { Agent, WorkerMetadata, StewardMetadata, SessionStatus } from '../../api/types';
import { AgentStatusBadge } from './AgentStatusBadge';
import { AgentRoleBadge } from './AgentRoleBadge';
import { Tooltip } from '../ui/Tooltip';

interface AgentCardProps {
  agent: Agent;
  activeSessionStatus?: SessionStatus;
  onStart?: () => void;
  onStop?: () => void;
  onRestart?: () => void;
  onOpenTerminal?: () => void;
  onRename?: () => void;
  isStarting?: boolean;
  isStopping?: boolean;
}

export function AgentCard({
  agent,
  activeSessionStatus,
  onStart,
  onStop,
  onRestart,
  onOpenTerminal,
  onRename,
  isStarting,
  isStopping,
}: AgentCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const agentMeta = agent.metadata?.agent;
  const isRunning = activeSessionStatus === 'running' || activeSessionStatus === 'starting';
  const canStart = !isRunning && !isStarting;
  const canStop = isRunning && !isStopping;

  // Close menu when clicking outside
  useEffect(() => {
    if (!menuOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  // Extract role-specific metadata
  const workerMeta = agentMeta?.agentRole === 'worker' ? (agentMeta as WorkerMetadata) : null;
  const stewardMeta = agentMeta?.agentRole === 'steward' ? (agentMeta as StewardMetadata) : null;

  // Get capabilities
  const capabilities = agentMeta?.capabilities;
  const skills = capabilities?.skills ?? [];
  const languages = capabilities?.languages ?? [];

  return (
    <div
      className="p-4 border border-[var(--color-border)] rounded-lg bg-[var(--color-surface)] hover:border-[var(--color-border-hover)] transition-colors duration-150"
      data-testid={`agent-card-${agent.id}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3
              className="font-semibold text-[var(--color-text)] truncate"
              data-testid={`agent-name-${agent.id}`}
            >
              {agent.name}
            </h3>
            <AgentStatusBadge
              status={activeSessionStatus ?? agentMeta?.sessionStatus ?? 'idle'}
              size="sm"
              showLabel={false}
            />
          </div>
          <AgentRoleBadge
            role={agentMeta?.agentRole ?? 'worker'}
            workerMode={workerMeta?.workerMode}
            stewardFocus={stewardMeta?.stewardFocus}
            size="sm"
          />
        </div>

        {/* Actions dropdown */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="p-1.5 rounded-md text-[var(--color-text-tertiary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] transition-colors"
            data-testid={`agent-menu-${agent.id}`}
          >
            <MoreVertical className="w-4 h-4" />
          </button>

          {/* Dropdown menu */}
          {menuOpen && (
            <div
              className="
                absolute right-0 top-full mt-1 z-20
                min-w-36 py-1 rounded-md shadow-lg
                bg-[var(--color-bg)] border border-[var(--color-border)]
              "
              data-testid={`agent-menu-dropdown-${agent.id}`}
            >
              <button
                onClick={() => {
                  setMenuOpen(false);
                  onRename?.();
                }}
                className="
                  w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm
                  text-[var(--color-text-secondary)]
                  hover:bg-[var(--color-surface-hover)]
                  hover:text-[var(--color-text)]
                "
                data-testid={`agent-rename-${agent.id}`}
              >
                <Pencil className="w-3.5 h-3.5" />
                Rename agent
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Worker-specific info */}
      {workerMeta?.branch && (
        <div className="mt-3 flex items-center gap-1.5 text-sm text-[var(--color-text-secondary)]">
          <GitBranch className="w-3.5 h-3.5" />
          <span className="truncate font-mono text-xs">{workerMeta.branch}</span>
        </div>
      )}

      {/* Steward-specific info */}
      {stewardMeta?.lastExecutedAt && (
        <div className="mt-3 flex items-center gap-1.5 text-sm text-[var(--color-text-secondary)]">
          <Clock className="w-3.5 h-3.5" />
          <span>Last run: {formatRelativeTime(stewardMeta.lastExecutedAt)}</span>
        </div>
      )}

      {/* Capabilities */}
      {(skills.length > 0 || languages.length > 0) && (
        <div className="mt-3 flex flex-wrap gap-1">
          {skills.slice(0, 3).map((skill) => (
            <span
              key={skill}
              className="px-1.5 py-0.5 text-xs rounded bg-[var(--color-surface-elevated)] text-[var(--color-text-secondary)]"
            >
              {skill}
            </span>
          ))}
          {languages.slice(0, 2).map((lang) => (
            <span
              key={lang}
              className="px-1.5 py-0.5 text-xs rounded bg-[var(--color-primary-muted)] text-[var(--color-primary)]"
            >
              {lang}
            </span>
          ))}
          {(skills.length > 3 || languages.length > 2) && (
            <span className="px-1.5 py-0.5 text-xs text-[var(--color-text-tertiary)]">
              +{skills.length - 3 + languages.length - 2} more
            </span>
          )}
        </div>
      )}

      {/* Action buttons */}
      <div className="mt-4 flex items-center gap-2">
        {canStart && onStart && (
          <Tooltip content="Start agent">
            <button
              onClick={onStart}
              disabled={isStarting}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-sm font-medium text-white bg-[var(--color-success)] rounded-md hover:bg-[var(--color-success-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              data-testid={`agent-start-${agent.id}`}
            >
              <Play className="w-3.5 h-3.5" />
              {isStarting ? 'Starting...' : 'Start'}
            </button>
          </Tooltip>
        )}
        {canStop && onStop && (
          <Tooltip content="Stop agent">
            <button
              onClick={onStop}
              disabled={isStopping}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-sm font-medium text-[var(--color-danger-text)] bg-[var(--color-danger-muted)] rounded-md hover:bg-[var(--color-danger-muted-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              data-testid={`agent-stop-${agent.id}`}
            >
              <Square className="w-3.5 h-3.5" />
              {isStopping ? 'Stopping...' : 'Stop'}
            </button>
          </Tooltip>
        )}
        {isRunning && onOpenTerminal && (
          <Tooltip content="Open in Workspace">
            <button
              onClick={onOpenTerminal}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-sm font-medium text-[var(--color-text-secondary)] bg-[var(--color-surface-elevated)] rounded-md hover:bg-[var(--color-surface-hover)] transition-colors"
              data-testid={`agent-terminal-${agent.id}`}
            >
              <Terminal className="w-3.5 h-3.5" />
              Open
            </button>
          </Tooltip>
        )}
        {onRestart && (
          <Tooltip content="Restart agent">
            <button
              onClick={onRestart}
              className="p-1.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-text)] rounded-md hover:bg-[var(--color-surface-hover)] transition-colors"
              data-testid={`agent-restart-${agent.id}`}
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </Tooltip>
        )}
      </div>
    </div>
  );
}

/**
 * Format a timestamp as relative time
 */
function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'just now';
}

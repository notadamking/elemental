/**
 * SessionHistoryModal - Display past chat sessions for an agent
 *
 * Shows a list of past sessions that can be selected to view their transcript.
 */

import { useState, useEffect, useMemo } from 'react';
import { X, History, Clock, ChevronRight, MessageSquare, Trash2 } from 'lucide-react';
import type { SessionRecord } from '../../api/types';
import type { StreamEvent } from './types';
import { MarkdownContent } from '../shared/MarkdownContent';

// Storage key prefix for session transcripts
const SESSION_STORAGE_PREFIX = 'elemental-session-transcript-';
const MAX_STORED_SESSIONS = 50;

export interface SessionHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  agentId: string;
  agentName: string;
  sessions: SessionRecord[];
}

/** Get transcript from localStorage */
export function getSessionTranscript(sessionId: string): StreamEvent[] {
  try {
    const stored = localStorage.getItem(`${SESSION_STORAGE_PREFIX}${sessionId}`);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (err) {
    console.error('[SessionHistory] Failed to load transcript:', err);
  }
  return [];
}

/** Save transcript to localStorage (only if there are events) */
export function saveSessionTranscript(sessionId: string, events: StreamEvent[]): void {
  // Don't save empty transcripts
  if (events.length === 0) {
    return;
  }
  try {
    localStorage.setItem(`${SESSION_STORAGE_PREFIX}${sessionId}`, JSON.stringify(events));
    cleanupOldTranscripts();
  } catch (err) {
    console.error('[SessionHistory] Failed to save transcript:', err);
  }
}

/** Remove old transcripts to prevent localStorage from growing too large */
function cleanupOldTranscripts(): void {
  try {
    const keys = Object.keys(localStorage).filter(k => k.startsWith(SESSION_STORAGE_PREFIX));
    if (keys.length > MAX_STORED_SESSIONS) {
      // Sort by key (which includes session ID) and remove oldest
      const toRemove = keys.slice(0, keys.length - MAX_STORED_SESSIONS);
      toRemove.forEach(key => localStorage.removeItem(key));
    }
  } catch (err) {
    console.error('[SessionHistory] Failed to cleanup transcripts:', err);
  }
}

/** Clear a specific session transcript */
function clearSessionTranscript(sessionId: string): void {
  try {
    localStorage.removeItem(`${SESSION_STORAGE_PREFIX}${sessionId}`);
  } catch (err) {
    console.error('[SessionHistory] Failed to clear transcript:', err);
  }
}

/** Format session date for display */
function formatSessionDate(timestamp: number | string | undefined): string {
  if (!timestamp) return 'Unknown';
  const date = new Date(timestamp);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const isYesterday = new Date(now.getTime() - 86400000).toDateString() === date.toDateString();

  if (isToday) {
    return `Today ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }
  if (isYesterday) {
    return `Yesterday ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }
  return date.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/** Get the first meaningful text content from an event */
function getEventText(event: StreamEvent): string | undefined {
  // Check content field first
  if (event.content?.trim()) {
    return event.content.trim();
  }
  // Check toolInput for tool_use events - might contain the task description
  if (event.type === 'tool_use' && event.toolInput) {
    const input = typeof event.toolInput === 'string'
      ? event.toolInput
      : JSON.stringify(event.toolInput);
    if (input.trim()) {
      return input.trim();
    }
  }
  // Check toolOutput for tool_result events
  if (event.type === 'tool_result' && event.toolOutput?.trim()) {
    return event.toolOutput.trim();
  }
  return undefined;
}

/** Extract task name from worktree path, or first meaningful message from transcript */
function extractSessionName(session: SessionRecord, transcript: StreamEvent[]): string {
  // Try to extract from worktree (format: usually contains task info)
  if (session.worktree) {
    // Extract the last part of the worktree path
    const parts = session.worktree.split('/');
    const worktreeName = parts[parts.length - 1];
    // Clean up common prefixes - only use if it's not a generic worktree name
    if (worktreeName && !worktreeName.startsWith('worktree-')) {
      return worktreeName.replace(/-/g, ' ');
    }
  }

  // Try to get the first user message from the transcript
  const firstUserMessage = transcript.find(e => e.type === 'user');
  const userText = firstUserMessage ? getEventText(firstUserMessage) : undefined;
  if (userText) {
    if (userText.length > 100) {
      return userText.slice(0, 100) + '...';
    }
    return userText;
  }

  // Try to get the first assistant message as fallback (might describe the task)
  const firstAssistantMessage = transcript.find(e => e.type === 'assistant');
  const assistantText = firstAssistantMessage ? getEventText(firstAssistantMessage) : undefined;
  if (assistantText) {
    // Take first line or sentence
    const firstLine = assistantText.split('\n')[0].split('.')[0];
    if (firstLine.length > 100) {
      return firstLine.slice(0, 100) + '...';
    }
    if (firstLine.length > 0) {
      return firstLine;
    }
  }

  // Try any event with meaningful text as a last resort
  for (const event of transcript) {
    if (event.type === 'system' || event.type === 'error') continue;
    const text = getEventText(event);
    if (text) {
      const firstLine = text.split('\n')[0];
      if (firstLine.length > 100) {
        return firstLine.slice(0, 100) + '...';
      }
      if (firstLine.length > 0) {
        return firstLine;
      }
    }
  }

  // Last fallback to formatted date
  const date = new Date(session.startedAt || session.createdAt);
  return `Session from ${date.toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
}

interface SessionItemProps {
  session: SessionRecord;
  transcript: StreamEvent[];
  isSelected: boolean;
  onClick: () => void;
  onDelete: () => void;
}

function SessionItem({ session, transcript, isSelected, onClick, onDelete }: SessionItemProps) {
  const sessionName = extractSessionName(session, transcript);
  const formattedDate = formatSessionDate(session.startedAt || session.createdAt);

  return (
    <div
      className={`
        group flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors
        ${isSelected
          ? 'bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/30'
          : 'hover:bg-[var(--color-surface-hover)] border border-transparent'
        }
      `}
      onClick={onClick}
      data-testid={`session-item-${session.id}`}
    >
      <div className="flex-shrink-0">
        <MessageSquare className={`w-4 h-4 ${isSelected ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-muted)]'}`} />
      </div>

      <div className="flex-1 min-w-0">
        <div className={`text-sm font-medium truncate ${isSelected ? 'text-[var(--color-primary)]' : 'text-[var(--color-text)]'}`}>
          {sessionName}
        </div>
        <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
          <Clock className="w-3 h-3" />
          <span>{formattedDate}</span>
        </div>
      </div>

      <div className="flex items-center gap-1">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity text-[var(--color-text-muted)] hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
          title="Delete transcript"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
        <ChevronRight className={`w-4 h-4 ${isSelected ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-muted)]'}`} />
      </div>
    </div>
  );
}

interface TranscriptViewerProps {
  events: StreamEvent[];
}

function TranscriptViewer({ events }: TranscriptViewerProps) {
  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-[var(--color-text-muted)] p-6">
        <MessageSquare className="w-8 h-8 mb-2 opacity-50" />
        <p className="text-sm">No transcript available for this session</p>
      </div>
    );
  }

  return (
    <div className="p-3 space-y-2 overflow-y-auto h-full">
      {events.map((event) => (
        <TranscriptEvent key={event.id} event={event} />
      ))}
    </div>
  );
}

function TranscriptEvent({ event }: { event: StreamEvent }) {
  const typeColors: Record<string, { bg: string; text: string }> = {
    assistant: { bg: 'bg-blue-50 dark:bg-blue-900/20', text: 'text-blue-700 dark:text-blue-300' },
    user: { bg: 'bg-purple-50 dark:bg-purple-900/20', text: 'text-purple-700 dark:text-purple-300' },
    tool_use: { bg: 'bg-amber-50 dark:bg-amber-900/20', text: 'text-amber-700 dark:text-amber-300' },
    tool_result: { bg: 'bg-green-50 dark:bg-green-900/20', text: 'text-green-700 dark:text-green-300' },
    system: { bg: 'bg-gray-50 dark:bg-gray-800/50', text: 'text-gray-600 dark:text-gray-400' },
    error: { bg: 'bg-red-50 dark:bg-red-900/20', text: 'text-red-700 dark:text-red-300' },
  };

  const colors = typeColors[event.type] || typeColors.system;
  const time = new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <div className={`rounded-md border overflow-hidden ${colors.bg} border-[var(--color-border)]/30`}>
      <div className={`flex items-center gap-2 px-3 py-1.5 ${colors.text}`}>
        <span className="text-xs font-semibold uppercase tracking-wide">
          {event.type.replace('_', ' ')}
        </span>
        {event.toolName && (
          <span className="text-xs font-mono opacity-75">{event.toolName}</span>
        )}
        <span className="ml-auto text-xs opacity-50">{time}</span>
      </div>
      {event.content && (
        <div className="px-3 py-2 border-t border-[var(--color-border)]/30">
          {event.type === 'assistant' || event.type === 'user' ? (
            <MarkdownContent content={event.content} className="text-sm text-[var(--color-text)]" />
          ) : (
            <div className="text-sm whitespace-pre-wrap break-words text-[var(--color-text)]">
              {event.content}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function SessionHistoryModal({
  isOpen,
  onClose,
  agentName,
  sessions,
}: SessionHistoryModalProps) {
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [transcriptCache, setTranscriptCache] = useState<Record<string, StreamEvent[]>>({});

  // Load transcripts for all sessions on mount
  useEffect(() => {
    if (isOpen) {
      const cache: Record<string, StreamEvent[]> = {};
      sessions.forEach(session => {
        cache[session.id] = getSessionTranscript(session.id);
      });
      setTranscriptCache(cache);
      // Don't auto-select a session - start with full-width list
      setSelectedSessionId(null);
    }
  }, [isOpen, sessions]);

  // Filter to only sessions with transcripts
  const sessionsWithTranscripts = useMemo(() => {
    return sessions.filter(s => (transcriptCache[s.id]?.length || 0) > 0);
  }, [sessions, transcriptCache]);

  const selectedTranscript = useMemo(() => {
    if (!selectedSessionId) return [];
    return transcriptCache[selectedSessionId] || [];
  }, [selectedSessionId, transcriptCache]);

  const handleDeleteTranscript = (sessionId: string) => {
    clearSessionTranscript(sessionId);
    setTranscriptCache(prev => ({
      ...prev,
      [sessionId]: []
    }));
    // If we deleted the selected session, deselect it
    if (sessionId === selectedSessionId) {
      setSelectedSessionId(null);
    }
  };

  if (!isOpen) return null;

  const hasSelectedSession = selectedSessionId !== null;

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center p-4" data-testid="session-history-modal">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-3xl h-[70%] max-h-[500px] bg-[var(--color-bg)] rounded-xl shadow-2xl border border-[var(--color-border)] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)] bg-[var(--color-surface)]">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-[var(--color-primary)]" />
            <h2 className="text-lg font-semibold text-[var(--color-text)]">
              Session History
            </h2>
            <span className="text-sm text-[var(--color-text-muted)]">
              — {agentName}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] transition-colors"
            data-testid="session-history-close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 flex min-h-0">
          {sessionsWithTranscripts.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-[var(--color-text-muted)] p-6">
              <History className="w-12 h-12 mb-3 opacity-50" />
              <p className="text-sm">No session history available</p>
              <p className="text-xs mt-1">Sessions will appear here after you start using this agent</p>
            </div>
          ) : (
            <>
              {/* Session list - full width when no session selected */}
              <div className={`${hasSelectedSession ? 'w-72 border-r border-[var(--color-border)]' : 'flex-1'} overflow-y-auto p-2 flex-shrink-0`}>
                {sessionsWithTranscripts.map(session => (
                  <SessionItem
                    key={session.id}
                    session={session}
                    transcript={transcriptCache[session.id] || []}
                    isSelected={session.id === selectedSessionId}
                    onClick={() => setSelectedSessionId(session.id)}
                    onDelete={() => handleDeleteTranscript(session.id)}
                  />
                ))}
              </div>

              {/* Transcript viewer - only shown when a session is selected */}
              {hasSelectedSession && (
                <div className="flex-1 min-w-0 bg-[var(--color-bg-secondary)] flex flex-col">
                  {/* Transcript header with close button */}
                  <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--color-border)] bg-[var(--color-surface)]">
                    <span className="text-sm font-medium text-[var(--color-text)] truncate">
                      {extractSessionName(
                        sessionsWithTranscripts.find(s => s.id === selectedSessionId)!,
                        selectedTranscript
                      )}
                    </span>
                    <button
                      onClick={() => setSelectedSessionId(null)}
                      className="p-1 rounded text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] transition-colors flex-shrink-0"
                      title="Close transcript"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex-1 min-h-0">
                    <TranscriptViewer events={selectedTranscript} />
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * TaskDetailPanel - Detail view panel for a selected task
 *
 * Orchestrator-specific features:
 * - Shows orchestrator metadata (branch, worktree, merge status, test results)
 * - Agent assignment with worker selection
 * - Start/Complete actions
 * - Session info if task has active session
 */

import { useState, useRef, useEffect } from 'react';
import {
  X,
  Calendar,
  User,
  Tag,
  Pencil,
  Check,
  Loader2,
  Trash2,
  GitBranch,
  Play,
  CheckCircle2,
  AlertCircle,
  Bot,
  FlaskConical,
  GitMerge,
} from 'lucide-react';
import { useTask, useUpdateTask, useDeleteTask, useStartTask, useCompleteTask } from '../../api/hooks/useTasks';
import { useAgents } from '../../api/hooks/useAgents';
import { TaskStatusBadge, TaskPriorityBadge, TaskTypeBadge, MergeStatusBadge } from './index';
import type { Task, Agent, Priority, TaskStatus } from '../../api/types';

interface TaskDetailPanelProps {
  taskId: string;
  onClose: () => void;
}

const PRIORITY_OPTIONS: { value: Priority; label: string }[] = [
  { value: 1, label: 'Critical' },
  { value: 2, label: 'High' },
  { value: 3, label: 'Medium' },
  { value: 4, label: 'Low' },
  { value: 5, label: 'Minimal' },
];

const STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'deferred', label: 'Deferred' },
  { value: 'closed', label: 'Closed' },
];

export function TaskDetailPanel({ taskId, onClose }: TaskDetailPanelProps) {
  const { data, isLoading, error } = useTask(taskId);
  const { data: agentsData } = useAgents('worker');
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const startTask = useStartTask();
  const completeTask = useCompleteTask();

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [editingField, setEditingField] = useState<string | null>(null);

  const task = data?.task;
  const workers: Agent[] = agentsData?.agents ?? [];
  const orchestratorMeta = task?.metadata?.orchestrator;

  const canStart = task?.status === 'open' && task?.assignee;
  const canComplete = task?.status === 'in_progress';

  const handleUpdate = async (updates: Partial<Task>) => {
    if (!task) return;
    try {
      await updateTask.mutateAsync({ taskId: task.id, ...updates });
      setEditingField(null);
    } catch {
      // Error handled by mutation state
    }
  };

  const handleDelete = async () => {
    if (!task) return;
    try {
      await deleteTask.mutateAsync({ taskId: task.id });
      onClose();
    } catch {
      // Error handled by mutation state
    }
  };

  const handleStart = async () => {
    if (!task) return;
    await startTask.mutateAsync({ taskId: task.id });
  };

  const handleComplete = async () => {
    if (!task) return;
    await completeTask.mutateAsync({ taskId: task.id });
  };

  if (isLoading) {
    return (
      <div
        className="h-full flex items-center justify-center bg-[var(--color-surface)]"
        data-testid="task-detail-loading"
      >
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="w-6 h-6 animate-spin text-[var(--color-primary)]" />
          <span className="text-sm text-[var(--color-text-secondary)]">Loading task...</span>
        </div>
      </div>
    );
  }

  if (error || !task) {
    return (
      <div
        className="h-full flex flex-col items-center justify-center bg-[var(--color-surface)]"
        data-testid="task-detail-error"
      >
        <AlertCircle className="w-8 h-8 text-[var(--color-danger)] mb-2" />
        <span className="text-sm text-[var(--color-text-secondary)]">
          {error?.message || 'Task not found'}
        </span>
        <button
          onClick={onClose}
          className="mt-4 px-4 py-2 text-sm text-[var(--color-primary)] hover:bg-[var(--color-surface-hover)] rounded-md"
        >
          Close
        </button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-[var(--color-surface)]" data-testid="task-detail-panel">
      {/* Delete Confirmation */}
      {showDeleteConfirm && (
        <DeleteConfirmDialog
          taskTitle={task.title}
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteConfirm(false)}
          isDeleting={deleteTask.isPending}
        />
      )}

      {/* Header */}
      <div className="flex items-start justify-between p-4 border-b border-[var(--color-border)]">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <TaskStatusBadge status={task.status} mergeStatus={orchestratorMeta?.mergeStatus} />
            <TaskPriorityBadge priority={task.priority} />
            <TaskTypeBadge taskType={task.taskType} />
          </div>
          <EditableTitle
            value={task.title}
            onSave={(title) => handleUpdate({ title })}
            isUpdating={updateTask.isPending && editingField === 'title'}
            onEdit={() => setEditingField('title')}
          />
          <div className="flex items-center gap-2 mt-1 text-xs text-[var(--color-text-tertiary)] font-mono">
            <span data-testid="task-detail-id">{task.id}</span>
            {task.ephemeral && (
              <span className="px-1.5 py-0.5 bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 rounded text-[10px]">
                Ephemeral
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="p-1.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-muted)] rounded transition-colors"
            aria-label="Delete task"
            data-testid="task-delete-btn"
          >
            <Trash2 className="w-5 h-5" />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] rounded transition-colors"
            aria-label="Close panel"
            data-testid="task-detail-close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Action Buttons */}
      {(canStart || canComplete) && (
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--color-border)] bg-[var(--color-surface-elevated)]">
          {canStart && (
            <button
              onClick={handleStart}
              disabled={startTask.isPending}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-[var(--color-primary)] bg-[var(--color-primary-muted)] hover:bg-[var(--color-primary-muted)]/80 rounded-md disabled:opacity-50 transition-colors"
              data-testid="task-start-btn"
            >
              <Play className="w-4 h-4" />
              {startTask.isPending ? 'Starting...' : 'Start Task'}
            </button>
          )}
          {canComplete && (
            <button
              onClick={handleComplete}
              disabled={completeTask.isPending}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-green-700 bg-green-100 hover:bg-green-200 dark:text-green-300 dark:bg-green-900/30 dark:hover:bg-green-900/50 rounded-md disabled:opacity-50 transition-colors"
              data-testid="task-complete-btn"
            >
              <CheckCircle2 className="w-4 h-4" />
              {completeTask.isPending ? 'Completing...' : 'Complete Task'}
            </button>
          )}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Metadata Grid */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          {/* Status */}
          <MetadataField label="Status" icon={<CheckCircle2 className="w-3 h-3" />}>
            <StatusDropdown
              value={task.status}
              onSave={(status) => handleUpdate({ status })}
              isUpdating={updateTask.isPending && editingField === 'status'}
            />
          </MetadataField>

          {/* Priority */}
          <MetadataField label="Priority">
            <PriorityDropdown
              value={task.priority}
              onSave={(priority) => handleUpdate({ priority })}
              isUpdating={updateTask.isPending && editingField === 'priority'}
            />
          </MetadataField>

          {/* Assignee */}
          <MetadataField label="Assigned Agent" icon={<Bot className="w-3 h-3" />}>
            <AssigneeDropdown
              value={task.assignee}
              workers={workers}
              onSave={(assignee) => handleUpdate({ assignee: assignee ?? undefined })}
              isUpdating={updateTask.isPending && editingField === 'assignee'}
            />
          </MetadataField>

          {/* Complexity */}
          <MetadataField label="Complexity">
            <span className="text-sm text-[var(--color-text)]">
              {['Trivial', 'Simple', 'Moderate', 'Complex', 'Very Complex'][task.complexity - 1]}
            </span>
          </MetadataField>

          {/* Deadline */}
          {task.deadline && (
            <MetadataField label="Deadline" icon={<Calendar className="w-3 h-3" />}>
              <span className="text-sm text-[var(--color-text)]">{formatDate(task.deadline)}</span>
            </MetadataField>
          )}
        </div>

        {/* Tags */}
        {task.tags.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center gap-1 text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wide mb-2">
              <Tag className="w-3 h-3" />
              Tags
            </div>
            <div className="flex flex-wrap gap-1">
              {task.tags.map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-0.5 text-xs bg-[var(--color-surface-elevated)] text-[var(--color-text-secondary)] rounded"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Orchestrator Metadata Section */}
        {orchestratorMeta && (
          <OrchestratorMetadataSection meta={orchestratorMeta} />
        )}

        {/* Timestamps */}
        <div className="mt-6 pt-4 border-t border-[var(--color-border)]">
          <div className="grid grid-cols-2 gap-4 text-xs text-[var(--color-text-tertiary)]">
            <div>
              <span className="font-medium">Created:</span>{' '}
              <span title={formatDateTime(task.createdAt)}>{formatRelativeTime(task.createdAt)}</span>
            </div>
            <div>
              <span className="font-medium">Updated:</span>{' '}
              <span title={formatDateTime(task.updatedAt)}>{formatRelativeTime(task.updatedAt)}</span>
            </div>
            {task.closedAt && (
              <div>
                <span className="font-medium">Closed:</span>{' '}
                <span title={formatDateTime(task.closedAt)}>{formatRelativeTime(task.closedAt)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Error display */}
        {updateTask.isError && (
          <div className="mt-4 p-3 bg-[var(--color-danger-muted)] border border-[var(--color-danger)] rounded-lg text-sm text-[var(--color-danger)]">
            Failed to update: {updateTask.error?.message}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Orchestrator Metadata Section
// ============================================================================

interface OrchestratorMetadataSectionProps {
  meta: NonNullable<Task['metadata']>['orchestrator'];
}

function OrchestratorMetadataSection({ meta }: OrchestratorMetadataSectionProps) {
  if (!meta) return null;

  return (
    <div className="mb-6 p-4 bg-[var(--color-surface-elevated)] rounded-lg border border-[var(--color-border)]">
      <h3 className="text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wide mb-3">
        Orchestrator Info
      </h3>

      <div className="space-y-3">
        {/* Branch */}
        {meta.branch && (
          <div className="flex items-center gap-2 text-sm">
            <GitBranch className="w-4 h-4 text-[var(--color-text-tertiary)]" />
            <span className="font-mono text-[var(--color-text)]">{meta.branch}</span>
          </div>
        )}

        {/* Merge Status */}
        {meta.mergeStatus && (
          <div className="flex items-center gap-2 text-sm">
            <GitMerge className="w-4 h-4 text-[var(--color-text-tertiary)]" />
            <MergeStatusBadge status={meta.mergeStatus} />
            {meta.mergeFailureReason && (
              <span className="text-xs text-[var(--color-danger)]">
                {meta.mergeFailureReason}
              </span>
            )}
          </div>
        )}

        {/* Session */}
        {meta.sessionId && (
          <div className="flex items-center gap-2 text-sm">
            <Bot className="w-4 h-4 text-[var(--color-text-tertiary)]" />
            <span className="text-[var(--color-text)]">
              Session: <span className="font-mono text-xs">{meta.sessionId}</span>
            </span>
          </div>
        )}

        {/* Test Results */}
        {meta.lastTestResult && (
          <div className="flex items-start gap-2 text-sm">
            <FlaskConical className="w-4 h-4 text-[var(--color-text-tertiary)] mt-0.5" />
            <div>
              <div className="flex items-center gap-2">
                <span
                  className={`font-medium ${
                    meta.lastTestResult.passed
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-[var(--color-danger)]'
                  }`}
                >
                  Tests: {meta.lastTestResult.passed ? 'Passed' : 'Failed'}
                </span>
                {meta.testRunCount && meta.testRunCount > 1 && (
                  <span className="text-xs text-[var(--color-text-tertiary)]">
                    (Run #{meta.testRunCount})
                  </span>
                )}
              </div>
              {meta.lastTestResult.totalTests !== undefined && (
                <div className="text-xs text-[var(--color-text-tertiary)]">
                  {meta.lastTestResult.passedTests ?? 0}/{meta.lastTestResult.totalTests} passed
                  {meta.lastTestResult.failedTests
                    ? `, ${meta.lastTestResult.failedTests} failed`
                    : ''}
                  {meta.lastTestResult.skippedTests
                    ? `, ${meta.lastTestResult.skippedTests} skipped`
                    : ''}
                </div>
              )}
              {meta.lastTestResult.errorMessage && (
                <div className="mt-1 text-xs text-[var(--color-danger)] font-mono">
                  {meta.lastTestResult.errorMessage}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Timestamps */}
        <div className="text-xs text-[var(--color-text-tertiary)] pt-2 border-t border-[var(--color-border)]">
          {meta.startedAt && <div>Started: {formatRelativeTime(meta.startedAt)}</div>}
          {meta.completedAt && <div>Completed: {formatRelativeTime(meta.completedAt)}</div>}
          {meta.mergedAt && <div>Merged: {formatRelativeTime(meta.mergedAt)}</div>}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Helper Components
// ============================================================================

interface MetadataFieldProps {
  label: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}

function MetadataField({ label, icon, children }: MetadataFieldProps) {
  return (
    <div>
      <div className="flex items-center gap-1 text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wide mb-1">
        {icon}
        {label}
      </div>
      {children}
    </div>
  );
}

// Editable Title
function EditableTitle({
  value,
  onSave,
  isUpdating,
  onEdit,
}: {
  value: string;
  onSave: (value: string) => void;
  isUpdating: boolean;
  onEdit: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  useEffect(() => {
    setEditValue(value);
  }, [value]);

  const handleSave = () => {
    if (editValue.trim() && editValue !== value) {
      onEdit();
      onSave(editValue.trim());
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSave();
    else if (e.key === 'Escape') {
      setEditValue(value);
      setIsEditing(false);
    }
  };

  if (isEditing) {
    return (
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          className="flex-1 text-lg font-semibold text-[var(--color-text)] border border-[var(--color-primary)] rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] bg-[var(--color-input-bg)]"
          data-testid="task-title-input"
        />
        {isUpdating && <Loader2 className="w-4 h-4 animate-spin text-[var(--color-text-tertiary)]" />}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 group">
      <h2
        className="text-lg font-semibold text-[var(--color-text)] cursor-pointer hover:text-[var(--color-primary)] transition-colors"
        onClick={() => setIsEditing(true)}
        data-testid="task-detail-title"
      >
        {value}
      </h2>
      <button
        onClick={() => setIsEditing(true)}
        className="p-1 opacity-0 group-hover:opacity-100 hover:bg-[var(--color-surface-hover)] rounded transition-opacity"
        aria-label="Edit title"
      >
        <Pencil className="w-3.5 h-3.5 text-[var(--color-text-tertiary)]" />
      </button>
      {isUpdating && <Loader2 className="w-4 h-4 animate-spin text-[var(--color-text-tertiary)]" />}
    </div>
  );
}

// Status Dropdown
function StatusDropdown({
  value,
  onSave,
  isUpdating,
}: {
  value: TaskStatus;
  onSave: (value: TaskStatus) => void;
  isUpdating: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1 hover:ring-2 hover:ring-[var(--color-primary)] rounded transition-all"
        disabled={isUpdating}
        data-testid="task-status-dropdown"
      >
        <TaskStatusBadge status={value} />
        {isUpdating && <Loader2 className="w-3 h-3 animate-spin" />}
      </button>
      {isOpen && (
        <div className="absolute z-10 mt-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md shadow-lg py-1 min-w-[140px]">
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => {
                if (opt.value !== value) onSave(opt.value);
                setIsOpen(false);
              }}
              className={`w-full text-left px-3 py-1.5 text-xs hover:bg-[var(--color-surface-hover)] flex items-center gap-2 ${
                opt.value === value ? 'bg-[var(--color-surface-elevated)]' : ''
              }`}
            >
              <TaskStatusBadge status={opt.value} />
              {opt.value === value && <Check className="w-3 h-3 text-[var(--color-primary)] ml-auto" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Priority Dropdown
function PriorityDropdown({
  value,
  onSave,
  isUpdating,
}: {
  value: Priority;
  onSave: (value: Priority) => void;
  isUpdating: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1 hover:ring-2 hover:ring-[var(--color-primary)] rounded transition-all"
        disabled={isUpdating}
        data-testid="task-priority-dropdown"
      >
        <TaskPriorityBadge priority={value} />
        {isUpdating && <Loader2 className="w-3 h-3 animate-spin" />}
      </button>
      {isOpen && (
        <div className="absolute z-10 mt-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md shadow-lg py-1 min-w-[120px]">
          {PRIORITY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => {
                if (opt.value !== value) onSave(opt.value);
                setIsOpen(false);
              }}
              className={`w-full text-left px-3 py-1.5 text-xs hover:bg-[var(--color-surface-hover)] flex items-center gap-2 ${
                opt.value === value ? 'bg-[var(--color-surface-elevated)]' : ''
              }`}
            >
              <TaskPriorityBadge priority={opt.value} showIcon={false} />
              {opt.value === value && <Check className="w-3 h-3 text-[var(--color-primary)] ml-auto" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Assignee Dropdown
function AssigneeDropdown({
  value,
  workers,
  onSave,
  isUpdating,
}: {
  value?: string;
  workers: Agent[];
  onSave: (value: string | null) => void;
  isUpdating: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentAgent = value ? workers.find((w) => w.id === value) : undefined;

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-2 py-1 text-sm rounded bg-[var(--color-surface-elevated)] hover:ring-2 hover:ring-[var(--color-primary)] transition-all"
        disabled={isUpdating}
        data-testid="task-assignee-dropdown"
      >
        <Bot className="w-3.5 h-3.5 text-[var(--color-text-tertiary)]" />
        <span className={currentAgent ? 'text-[var(--color-text)]' : 'text-[var(--color-text-tertiary)] italic'}>
          {currentAgent?.name || 'Unassigned'}
        </span>
        {isUpdating && <Loader2 className="w-3 h-3 animate-spin" />}
      </button>
      {isOpen && (
        <div className="absolute z-10 mt-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md shadow-lg py-1 min-w-[180px] max-h-[200px] overflow-y-auto">
          {/* Unassigned option */}
          <button
            onClick={() => {
              if (value) onSave(null);
              setIsOpen(false);
            }}
            className={`w-full text-left px-3 py-2 text-xs hover:bg-[var(--color-surface-hover)] flex items-center gap-2 ${
              !value ? 'bg-[var(--color-surface-elevated)]' : ''
            }`}
          >
            <User className="w-3.5 h-3.5 text-[var(--color-text-tertiary)]" />
            <span className="text-[var(--color-text-tertiary)] italic">Unassigned</span>
            {!value && <Check className="w-3 h-3 text-[var(--color-primary)] ml-auto" />}
          </button>
          <div className="border-t border-[var(--color-border)] my-1" />
          {workers.length === 0 ? (
            <div className="px-3 py-2 text-xs text-[var(--color-text-tertiary)]">
              No worker agents available
            </div>
          ) : (
            workers.map((agent) => (
              <button
                key={agent.id}
                onClick={() => {
                  if (agent.id !== value) onSave(agent.id);
                  setIsOpen(false);
                }}
                className={`w-full text-left px-3 py-2 text-xs hover:bg-[var(--color-surface-hover)] flex items-center gap-2 ${
                  agent.id === value ? 'bg-[var(--color-surface-elevated)]' : ''
                }`}
              >
                <Bot className="w-3.5 h-3.5 text-purple-500" />
                <span className="text-[var(--color-text)]">{agent.name}</span>
                {agent.id === value && <Check className="w-3 h-3 text-[var(--color-primary)] ml-auto" />}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// Delete Confirmation Dialog
function DeleteConfirmDialog({
  taskTitle,
  onConfirm,
  onCancel,
  isDeleting,
}: {
  taskTitle: string;
  onConfirm: () => void;
  onCancel: () => void;
  isDeleting: boolean;
}) {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isDeleting) onCancel();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isDeleting, onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" data-testid="delete-confirm-dialog">
      <div className="absolute inset-0 bg-black/50" onClick={() => !isDeleting && onCancel()} />
      <div className="relative bg-[var(--color-surface)] rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-[var(--color-danger-muted)] flex items-center justify-center">
            <Trash2 className="w-5 h-5 text-[var(--color-danger)]" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-[var(--color-text)]">Delete Task</h3>
            <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
              Are you sure you want to delete{' '}
              <span className="font-medium text-[var(--color-text)]">"{taskTitle}"</span>? This action
              cannot be undone.
            </p>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={isDeleting}
            className="px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md hover:bg-[var(--color-surface-hover)] disabled:opacity-50"
            data-testid="delete-cancel-btn"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isDeleting}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[var(--color-danger)] rounded-md hover:opacity-90 disabled:opacity-50"
            data-testid="delete-confirm-btn"
          >
            {isDeleting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Deleting...
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4" />
                Delete
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Date Formatting Utilities
// ============================================================================

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(dateStr);
}

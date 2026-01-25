import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Calendar, User, Tag, Clock, Link2, AlertTriangle, CheckCircle2, Pencil, Check, Loader2, Trash2 } from 'lucide-react';

interface Dependency {
  sourceId: string;
  targetId: string;
  type: string;
  metadata?: Record<string, unknown>;
  createdBy: string;
  createdAt: string;
}

interface TaskDetail {
  id: string;
  type: 'task';
  title: string;
  status: string;
  priority: number;
  complexity: number;
  taskType: string;
  assignee?: string;
  owner?: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  deadline?: string;
  scheduledFor?: string;
  descriptionRef?: string;
  designRef?: string;
  description?: string;
  design?: string;
  _dependencies: Dependency[];
  _dependents: Dependency[];
}

interface TaskDetailPanelProps {
  taskId: string;
  onClose: () => void;
}

function useTaskDetail(taskId: string) {
  return useQuery<TaskDetail>({
    queryKey: ['tasks', taskId],
    queryFn: async () => {
      const response = await fetch(`/api/tasks/${taskId}?hydrate.description=true&hydrate.design=true`);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to fetch task');
      }
      return response.json();
    },
    enabled: !!taskId,
  });
}

function useUpdateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<TaskDetail> }) => {
      const response = await fetch(`/api/tasks/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to update task');
      }

      return response.json();
    },
    onMutate: async ({ id, updates }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['tasks', id] });

      // Snapshot previous value
      const previousTask = queryClient.getQueryData<TaskDetail>(['tasks', id]);

      // Optimistically update the cache
      if (previousTask) {
        queryClient.setQueryData<TaskDetail>(['tasks', id], {
          ...previousTask,
          ...updates,
        });
      }

      return { previousTask };
    },
    onError: (_error, { id }, context) => {
      // Rollback on error
      if (context?.previousTask) {
        queryClient.setQueryData(['tasks', id], context.previousTask);
      }
    },
    onSettled: (_data, _error, { id }) => {
      // Always refetch after error or success
      queryClient.invalidateQueries({ queryKey: ['tasks', id] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['tasks', 'ready'] });
      queryClient.invalidateQueries({ queryKey: ['tasks', 'blocked'] });
      queryClient.invalidateQueries({ queryKey: ['tasks', 'completed'] });
    },
  });
}

function useDeleteTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/tasks/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to delete task');
      }

      return response.json();
    },
    onSuccess: (_data, id) => {
      // Remove from cache and invalidate lists
      queryClient.removeQueries({ queryKey: ['tasks', id] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['tasks', 'ready'] });
      queryClient.invalidateQueries({ queryKey: ['tasks', 'blocked'] });
      queryClient.invalidateQueries({ queryKey: ['tasks', 'completed'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    },
  });
}

const PRIORITY_LABELS: Record<number, { label: string; color: string }> = {
  1: { label: 'Critical', color: 'bg-red-100 text-red-800 border-red-200' },
  2: { label: 'High', color: 'bg-orange-100 text-orange-800 border-orange-200' },
  3: { label: 'Medium', color: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  4: { label: 'Low', color: 'bg-green-100 text-green-800 border-green-200' },
  5: { label: 'Trivial', color: 'bg-gray-100 text-gray-800 border-gray-200' },
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  open: { label: 'Open', color: 'bg-blue-100 text-blue-800', icon: null },
  in_progress: { label: 'In Progress', color: 'bg-yellow-100 text-yellow-800', icon: null },
  blocked: { label: 'Blocked', color: 'bg-red-100 text-red-800', icon: <AlertTriangle className="w-3 h-3" /> },
  completed: { label: 'Completed', color: 'bg-green-100 text-green-800', icon: <CheckCircle2 className="w-3 h-3" /> },
  cancelled: { label: 'Cancelled', color: 'bg-gray-100 text-gray-800', icon: null },
  deferred: { label: 'Deferred', color: 'bg-purple-100 text-purple-800', icon: null },
};

const COMPLEXITY_LABELS: Record<number, string> = {
  1: 'Trivial',
  2: 'Simple',
  3: 'Moderate',
  4: 'Complex',
  5: 'Very Complex',
};

const STATUS_OPTIONS = ['open', 'in_progress', 'blocked', 'completed', 'cancelled', 'deferred'];
const PRIORITY_OPTIONS = [1, 2, 3, 4, 5];
const COMPLEXITY_OPTIONS = [1, 2, 3, 4, 5];

// Delete confirmation dialog component
function DeleteConfirmDialog({
  isOpen,
  taskTitle,
  onConfirm,
  onCancel,
  isDeleting,
}: {
  isOpen: boolean;
  taskTitle: string;
  onConfirm: () => void;
  onCancel: () => void;
  isDeleting: boolean;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape' && !isDeleting) {
          onCancel();
        }
      };
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen, isDeleting, onCancel]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      data-testid="delete-confirm-dialog"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={() => !isDeleting && onCancel()}
      />
      {/* Dialog */}
      <div
        ref={dialogRef}
        className="relative bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6"
      >
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
            <Trash2 className="w-5 h-5 text-red-600" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-gray-900">Delete Task</h3>
            <p className="mt-2 text-sm text-gray-600">
              Are you sure you want to delete{' '}
              <span className="font-medium text-gray-900">"{taskTitle}"</span>?
              This action cannot be undone.
            </p>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={isDeleting}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
            data-testid="delete-cancel-button"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isDeleting}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50"
            data-testid="delete-confirm-button"
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

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(dateString);
}

function DependencyList({ dependencies, title, type }: { dependencies: Dependency[]; title: string; type: 'blockers' | 'blocking' }) {
  if (dependencies.length === 0) return null;

  return (
    <div className="mt-4">
      <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">{title}</h4>
      <div className="space-y-1">
        {dependencies.map((dep) => (
          <div
            key={`${dep.sourceId}-${dep.targetId}-${dep.type}`}
            className="flex items-center gap-2 text-sm text-gray-600 bg-gray-50 rounded px-2 py-1"
          >
            <Link2 className="w-3 h-3 text-gray-400" />
            <span className="font-mono text-xs">
              {type === 'blockers' ? dep.targetId : dep.sourceId}
            </span>
            <span className="text-xs text-gray-400">({dep.type})</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Inline editable title component
function EditableTitle({
  value,
  onSave,
  isUpdating,
}: {
  value: string;
  onSave: (value: string) => void;
  isUpdating: boolean;
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
      onSave(editValue.trim());
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
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
          className="flex-1 text-lg font-semibold text-gray-900 border border-blue-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
          data-testid="task-title-input"
        />
        {isUpdating && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 group">
      <h2
        className="text-lg font-semibold text-gray-900 truncate cursor-pointer hover:text-blue-600"
        onClick={() => setIsEditing(true)}
        data-testid="task-detail-title"
      >
        {value}
      </h2>
      <button
        onClick={() => setIsEditing(true)}
        className="p-1 opacity-0 group-hover:opacity-100 hover:bg-gray-100 rounded transition-opacity"
        aria-label="Edit title"
        data-testid="task-title-edit-button"
      >
        <Pencil className="w-3.5 h-3.5 text-gray-400" />
      </button>
      {isUpdating && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
    </div>
  );
}

// Status dropdown component
function StatusDropdown({
  value,
  onSave,
  isUpdating,
}: {
  value: string;
  onSave: (value: string) => void;
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

  const status = STATUS_CONFIG[value] || STATUS_CONFIG.open;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded cursor-pointer hover:ring-2 hover:ring-blue-300 ${status.color}`}
        disabled={isUpdating}
        data-testid="task-status-dropdown"
      >
        {status.icon}
        {status.label}
        {isUpdating && <Loader2 className="w-3 h-3 animate-spin ml-1" />}
      </button>
      {isOpen && (
        <div className="absolute z-10 mt-1 bg-white border border-gray-200 rounded-md shadow-lg py-1 min-w-[120px]" data-testid="task-status-options">
          {STATUS_OPTIONS.map((statusOption) => {
            const config = STATUS_CONFIG[statusOption] || STATUS_CONFIG.open;
            return (
              <button
                key={statusOption}
                onClick={() => {
                  if (statusOption !== value) {
                    onSave(statusOption);
                  }
                  setIsOpen(false);
                }}
                className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 flex items-center gap-2 ${statusOption === value ? 'bg-gray-50' : ''}`}
                data-testid={`task-status-option-${statusOption}`}
              >
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded ${config.color}`}>
                  {config.icon}
                  {config.label}
                </span>
                {statusOption === value && <Check className="w-3 h-3 text-blue-600 ml-auto" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Priority dropdown component
function PriorityDropdown({
  value,
  onSave,
  isUpdating,
}: {
  value: number;
  onSave: (value: number) => void;
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

  const priority = PRIORITY_LABELS[value] || PRIORITY_LABELS[3];

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`px-2 py-0.5 text-xs font-medium rounded border cursor-pointer hover:ring-2 hover:ring-blue-300 ${priority.color}`}
        disabled={isUpdating}
        data-testid="task-priority-dropdown"
      >
        {priority.label}
        {isUpdating && <Loader2 className="w-3 h-3 animate-spin ml-1 inline" />}
      </button>
      {isOpen && (
        <div className="absolute z-10 mt-1 bg-white border border-gray-200 rounded-md shadow-lg py-1 min-w-[100px]" data-testid="task-priority-options">
          {PRIORITY_OPTIONS.map((priorityOption) => {
            const config = PRIORITY_LABELS[priorityOption] || PRIORITY_LABELS[3];
            return (
              <button
                key={priorityOption}
                onClick={() => {
                  if (priorityOption !== value) {
                    onSave(priorityOption);
                  }
                  setIsOpen(false);
                }}
                className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 flex items-center gap-2 ${priorityOption === value ? 'bg-gray-50' : ''}`}
                data-testid={`task-priority-option-${priorityOption}`}
              >
                <span className={`px-2 py-0.5 rounded border ${config.color}`}>
                  {config.label}
                </span>
                {priorityOption === value && <Check className="w-3 h-3 text-blue-600 ml-auto" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Complexity dropdown component
function ComplexityDropdown({
  value,
  onSave,
  isUpdating,
}: {
  value: number;
  onSave: (value: number) => void;
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

  const complexity = COMPLEXITY_LABELS[value] || COMPLEXITY_LABELS[3];

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="text-sm text-gray-900 cursor-pointer hover:text-blue-600 hover:underline"
        disabled={isUpdating}
        data-testid="task-complexity-dropdown"
      >
        {complexity}
        {isUpdating && <Loader2 className="w-3 h-3 animate-spin ml-1 inline" />}
      </button>
      {isOpen && (
        <div className="absolute z-10 mt-1 bg-white border border-gray-200 rounded-md shadow-lg py-1 min-w-[100px]" data-testid="task-complexity-options">
          {COMPLEXITY_OPTIONS.map((complexityOption) => {
            const label = COMPLEXITY_LABELS[complexityOption] || COMPLEXITY_LABELS[3];
            return (
              <button
                key={complexityOption}
                onClick={() => {
                  if (complexityOption !== value) {
                    onSave(complexityOption);
                  }
                  setIsOpen(false);
                }}
                className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 flex items-center justify-between ${complexityOption === value ? 'bg-gray-50' : ''}`}
                data-testid={`task-complexity-option-${complexityOption}`}
              >
                <span>{label}</span>
                {complexityOption === value && <Check className="w-3 h-3 text-blue-600" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function TaskDetailPanel({ taskId, onClose }: TaskDetailPanelProps) {
  const { data: task, isLoading, isError, error } = useTaskDetail(taskId);
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const [updateField, setUpdateField] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleUpdate = (updates: Partial<TaskDetail>, fieldName: string) => {
    setUpdateField(fieldName);
    updateTask.mutate(
      { id: taskId, updates },
      {
        onSettled: () => setUpdateField(null),
      }
    );
  };

  const handleDelete = () => {
    deleteTask.mutate(taskId, {
      onSuccess: () => {
        setShowDeleteConfirm(false);
        onClose();
      },
    });
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center" data-testid="task-detail-loading">
        <div className="text-gray-500">Loading task...</div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="h-full flex flex-col items-center justify-center" data-testid="task-detail-error">
        <div className="text-red-600 mb-2">Failed to load task</div>
        <div className="text-sm text-gray-500">{(error as Error)?.message}</div>
      </div>
    );
  }

  if (!task) {
    return (
      <div className="h-full flex items-center justify-center" data-testid="task-detail-not-found">
        <div className="text-gray-500">Task not found</div>
      </div>
    );
  }

  // Separate dependencies by type
  const blockers = task._dependencies.filter(d => d.type === 'blocks' || d.type === 'awaits');
  const blocking = task._dependents.filter(d => d.type === 'blocks' || d.type === 'awaits');

  return (
    <div className="h-full flex flex-col bg-white" data-testid="task-detail-panel">
      {/* Delete Confirmation Dialog */}
      <DeleteConfirmDialog
        isOpen={showDeleteConfirm}
        taskTitle={task.title}
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteConfirm(false)}
        isDeleting={deleteTask.isPending}
      />

      {/* Header */}
      <div className="flex items-start justify-between p-4 border-b border-gray-200">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <StatusDropdown
              value={task.status}
              onSave={(status) => handleUpdate({ status }, 'status')}
              isUpdating={updateField === 'status'}
            />
            <PriorityDropdown
              value={task.priority}
              onSave={(priority) => handleUpdate({ priority }, 'priority')}
              isUpdating={updateField === 'priority'}
            />
          </div>
          <EditableTitle
            value={task.title}
            onSave={(title) => handleUpdate({ title }, 'title')}
            isUpdating={updateField === 'title'}
          />
          <div className="flex items-center gap-2 mt-1 text-xs text-gray-500 font-mono">
            <span data-testid="task-detail-id">{task.id}</span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
            aria-label="Delete task"
            data-testid="task-delete-button"
          >
            <Trash2 className="w-5 h-5" />
          </button>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
            aria-label="Close panel"
            data-testid="task-detail-close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Metadata grid */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div>
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Type</div>
            <div className="text-sm text-gray-900 capitalize">{task.taskType}</div>
          </div>
          <div>
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Complexity</div>
            <ComplexityDropdown
              value={task.complexity}
              onSave={(complexity) => handleUpdate({ complexity }, 'complexity')}
              isUpdating={updateField === 'complexity'}
            />
          </div>
          {task.assignee && (
            <div>
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1 flex items-center gap-1">
                <User className="w-3 h-3" />
                Assignee
              </div>
              <div className="text-sm text-gray-900 font-mono">{task.assignee}</div>
            </div>
          )}
          {task.owner && (
            <div>
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Owner</div>
              <div className="text-sm text-gray-900 font-mono">{task.owner}</div>
            </div>
          )}
          {task.deadline && (
            <div>
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1 flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                Deadline
              </div>
              <div className="text-sm text-gray-900">{formatDate(task.deadline)}</div>
            </div>
          )}
          {task.scheduledFor && (
            <div>
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Scheduled For
              </div>
              <div className="text-sm text-gray-900">{formatDate(task.scheduledFor)}</div>
            </div>
          )}
        </div>

        {/* Tags */}
        {task.tags.length > 0 && (
          <div className="mb-6">
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1">
              <Tag className="w-3 h-3" />
              Tags
            </div>
            <div className="flex flex-wrap gap-1">
              {task.tags.map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-0.5 text-xs bg-gray-100 text-gray-700 rounded"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Description */}
        {task.description && (
          <div className="mb-6">
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Description</div>
            <div className="prose prose-sm max-w-none text-gray-700 bg-gray-50 rounded-lg p-3" data-testid="task-detail-description">
              <pre className="whitespace-pre-wrap font-sans text-sm">{task.description}</pre>
            </div>
          </div>
        )}

        {/* Design */}
        {task.design && (
          <div className="mb-6">
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Design</div>
            <div className="prose prose-sm max-w-none text-gray-700 bg-gray-50 rounded-lg p-3" data-testid="task-detail-design">
              <pre className="whitespace-pre-wrap font-sans text-sm">{task.design}</pre>
            </div>
          </div>
        )}

        {/* Dependencies */}
        <DependencyList dependencies={blockers} title="Blocked By" type="blockers" />
        <DependencyList dependencies={blocking} title="Blocking" type="blocking" />

        {/* Timestamps */}
        <div className="mt-6 pt-4 border-t border-gray-100">
          <div className="grid grid-cols-2 gap-4 text-xs text-gray-500">
            <div>
              <span className="font-medium">Created:</span>{' '}
              <span title={formatDate(task.createdAt)}>{formatRelativeTime(task.createdAt)}</span>
            </div>
            <div>
              <span className="font-medium">Updated:</span>{' '}
              <span title={formatDate(task.updatedAt)}>{formatRelativeTime(task.updatedAt)}</span>
            </div>
            <div>
              <span className="font-medium">Created by:</span>{' '}
              <span className="font-mono">{task.createdBy}</span>
            </div>
          </div>
        </div>

        {/* Update error display */}
        {updateTask.isError && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700" data-testid="task-update-error">
            Failed to update task: {(updateTask.error as Error)?.message}
          </div>
        )}
      </div>
    </div>
  );
}

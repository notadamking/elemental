import { useState, useEffect, useRef } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { X, Loader2, Plus } from 'lucide-react';
import { TagInput } from '../ui/TagInput';

interface Entity {
  id: string;
  name: string;
  entityType: string;
}

interface CreateTaskInput {
  title: string;
  createdBy: string;
  priority?: number;
  complexity?: number;
  taskType?: string;
  assignee?: string;
  tags?: string[];
}

interface CreateTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (task: { id: string }) => void;
}

function useEntities() {
  return useQuery<Entity[]>({
    queryKey: ['entities'],
    queryFn: async () => {
      const response = await fetch('/api/entities');
      if (!response.ok) throw new Error('Failed to fetch entities');
      return response.json();
    },
  });
}

function useCreateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateTaskInput) => {
      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(input),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to create task');
      }

      return response.json();
    },
    onSuccess: () => {
      // Invalidate all task-related queries
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['tasks', 'ready'] });
      queryClient.invalidateQueries({ queryKey: ['tasks', 'blocked'] });
      queryClient.invalidateQueries({ queryKey: ['tasks', 'completed'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    },
  });
}

const PRIORITY_OPTIONS = [
  { value: 1, label: 'Critical' },
  { value: 2, label: 'High' },
  { value: 3, label: 'Medium' },
  { value: 4, label: 'Low' },
  { value: 5, label: 'Trivial' },
];

const COMPLEXITY_OPTIONS = [
  { value: 1, label: 'Trivial' },
  { value: 2, label: 'Simple' },
  { value: 3, label: 'Moderate' },
  { value: 4, label: 'Complex' },
  { value: 5, label: 'Very Complex' },
];

const TASK_TYPE_OPTIONS = [
  { value: 'task', label: 'Task' },
  { value: 'bug', label: 'Bug' },
  { value: 'feature', label: 'Feature' },
  { value: 'chore', label: 'Chore' },
  { value: 'research', label: 'Research' },
  { value: 'documentation', label: 'Documentation' },
];

export function CreateTaskModal({ isOpen, onClose, onSuccess }: CreateTaskModalProps) {
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState(3);
  const [complexity, setComplexity] = useState(3);
  const [taskType, setTaskType] = useState('task');
  const [assignee, setAssignee] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [createdBy, setCreatedBy] = useState('');

  const titleInputRef = useRef<HTMLInputElement>(null);
  const createTask = useCreateTask();
  const { data: entities } = useEntities();

  // Focus title input when modal opens
  useEffect(() => {
    if (isOpen && titleInputRef.current) {
      titleInputRef.current.focus();
    }
  }, [isOpen]);

  // Reset form when modal closes
  useEffect(() => {
    if (!isOpen) {
      setTitle('');
      setPriority(3);
      setComplexity(3);
      setTaskType('task');
      setAssignee('');
      setTags([]);
      setCreatedBy('');
      createTask.reset();
    }
  }, [isOpen]);

  // Set default createdBy to operator (human entity), fall back to first entity
  useEffect(() => {
    if (entities && entities.length > 0 && !createdBy) {
      const operator = entities.find((e) => e.entityType === 'human');
      setCreatedBy(operator?.id || entities[0].id);
    }
  }, [entities, createdBy]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) return;
    if (!createdBy) return;

    const input: CreateTaskInput = {
      title: title.trim(),
      createdBy,
      priority,
      complexity,
      taskType,
    };

    if (assignee) {
      input.assignee = assignee;
    }

    if (tags.length > 0) {
      input.tags = tags;
    }

    try {
      const result = await createTask.mutateAsync(input);
      onSuccess?.(result);
      onClose();
    } catch {
      // Error is handled by mutation state
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50" data-testid="create-task-modal" onKeyDown={handleKeyDown}>
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        data-testid="create-task-modal-backdrop"
      />

      {/* Dialog */}
      <div className="absolute left-1/2 top-1/4 -translate-x-1/2 w-full max-w-lg">
        <div className="bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Create Task</h2>
            <button
              onClick={onClose}
              className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
              aria-label="Close"
              data-testid="create-task-modal-close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-4">
            {/* Title */}
            <div className="mb-4">
              <label htmlFor="task-title" className="block text-sm font-medium text-gray-700 mb-1">
                Title <span className="text-red-500">*</span>
              </label>
              <input
                ref={titleInputRef}
                id="task-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Enter task title..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                data-testid="create-task-title-input"
                required
              />
            </div>

            {/* Created By */}
            <div className="mb-4">
              <label htmlFor="task-created-by" className="block text-sm font-medium text-gray-700 mb-1">
                Created By <span className="text-red-500">*</span>
              </label>
              <select
                id="task-created-by"
                value={createdBy}
                onChange={(e) => setCreatedBy(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                data-testid="create-task-created-by-select"
                required
              >
                <option value="">Select entity...</option>
                {entities?.map((entity) => (
                  <option key={entity.id} value={entity.id}>
                    {entity.name} ({entity.entityType})
                  </option>
                ))}
              </select>
            </div>

            {/* Priority & Complexity row */}
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label htmlFor="task-priority" className="block text-sm font-medium text-gray-700 mb-1">
                  Priority
                </label>
                <select
                  id="task-priority"
                  value={priority}
                  onChange={(e) => setPriority(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  data-testid="create-task-priority-select"
                >
                  {PRIORITY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="task-complexity" className="block text-sm font-medium text-gray-700 mb-1">
                  Complexity
                </label>
                <select
                  id="task-complexity"
                  value={complexity}
                  onChange={(e) => setComplexity(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  data-testid="create-task-complexity-select"
                >
                  {COMPLEXITY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Task Type & Assignee row */}
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label htmlFor="task-type" className="block text-sm font-medium text-gray-700 mb-1">
                  Type
                </label>
                <select
                  id="task-type"
                  value={taskType}
                  onChange={(e) => setTaskType(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  data-testid="create-task-type-select"
                >
                  {TASK_TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="task-assignee" className="block text-sm font-medium text-gray-700 mb-1">
                  Assignee
                </label>
                <select
                  id="task-assignee"
                  value={assignee}
                  onChange={(e) => setAssignee(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  data-testid="create-task-assignee-select"
                >
                  <option value="">Unassigned</option>
                  {entities?.map((entity) => (
                    <option key={entity.id} value={entity.id}>
                      {entity.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Tags */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tags
              </label>
              <TagInput
                tags={tags}
                onChange={setTags}
                placeholder="Type and press comma to add tags"
                data-testid="create-task-tags-input"
              />
            </div>

            {/* Error display */}
            {createTask.isError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700" data-testid="create-task-error">
                {(createTask.error as Error)?.message || 'Failed to create task'}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
                data-testid="create-task-cancel-button"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={createTask.isPending || !title.trim() || !createdBy}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                data-testid="create-task-submit-button"
              >
                {createTask.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    Create Task
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

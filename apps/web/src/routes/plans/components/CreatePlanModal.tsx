/**
 * Create Plan Modal Component
 *
 * Reusable modal for creating plans with an initial task.
 * Plans must have at least one task.
 * Supports both creating a new task or selecting an existing one.
 */

import { useState, useEffect, useRef } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { X, ChevronLeft, Search, Check, Info, Loader2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useIsMobile } from '../../../hooks';
import { useCurrentUser } from '../../../contexts';
import type { TaskType } from '../types';

interface TaskEntry {
  id: string; // Unique ID for this entry in the list
  mode: 'new' | 'existing';
  // For new tasks
  title?: string;
  priority?: number;
  // For existing tasks
  existingTaskId?: string;
  existingTaskTitle?: string;
}

interface CreatePlanModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (plan: { id: string; title: string }) => void;
}

function useCreatePlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      title,
      createdBy,
      initialTask,
      initialTaskId,
      additionalTasks,
      status,
      tags,
    }: {
      title: string;
      createdBy: string;
      initialTask?: { title: string; priority?: number; status?: string };
      initialTaskId?: string;
      additionalTasks?: Array<{ title: string; priority?: number } | { existingTaskId: string }>;
      status?: string;
      tags?: string[];
    }) => {
      const response = await fetch('/api/plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          createdBy,
          initialTask,
          initialTaskId,
          status,
          tags,
        }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to create plan');
      }
      const plan = await response.json();

      // Add additional tasks to the plan if any
      if (additionalTasks && additionalTasks.length > 0) {
        for (const task of additionalTasks) {
          if ('existingTaskId' in task) {
            // Add existing task to plan
            await fetch(`/api/plans/${plan.id}/tasks`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ taskId: task.existingTaskId }),
            });
          } else {
            // Create new task and add to plan
            const taskResponse = await fetch('/api/tasks', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                title: task.title,
                priority: task.priority || 3,
                createdBy,
              }),
            });
            if (taskResponse.ok) {
              const newTask = await taskResponse.json();
              await fetch(`/api/plans/${plan.id}/tasks`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ taskId: newTask.id }),
              });
            }
          }
        }
      }

      return plan;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plans'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

const priorityLabels: Record<number, string> = {
  1: 'Lowest',
  2: 'Low',
  3: 'Medium',
  4: 'High',
  5: 'Critical',
};

export function CreatePlanModal({ isOpen, onClose, onSuccess }: CreatePlanModalProps) {
  const isMobile = useIsMobile();
  const { currentUser } = useCurrentUser();
  const [planTitle, setPlanTitle] = useState('');
  const [tasks, setTasks] = useState<TaskEntry[]>([
    { id: '1', mode: 'new', title: '', priority: 3 },
  ]);
  const [activeTaskId, setActiveTaskId] = useState<string>('1');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  const createPlan = useCreatePlan();

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setPlanTitle('');
      setTasks([{ id: '1', mode: 'new', title: '', priority: 3 }]);
      setActiveTaskId('1');
      setSearchQuery('');
      setDebouncedQuery('');
    }
  }, [isOpen]);

  // Debounce search for existing tasks
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchQuery]);

  // Get the active task entry
  const activeTask = tasks.find((t) => t.id === activeTaskId);

  // Query for existing tasks when in existing mode
  const { data: existingTasks = [], isLoading: isLoadingTasks } = useQuery<TaskType[]>({
    queryKey: ['tasks', 'for-plan-creation', debouncedQuery],
    queryFn: async () => {
      const url = debouncedQuery
        ? `/api/tasks?limit=50&search=${encodeURIComponent(debouncedQuery)}`
        : '/api/tasks?limit=50';
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch tasks');
      const result = await response.json();
      const allTasks = (result.items || result.data || []) as TaskType[];
      // Filter out tasks that are already selected
      const selectedIds = new Set(tasks.filter((t) => t.existingTaskId).map((t) => t.existingTaskId));
      return allTasks.filter((t) => !selectedIds.has(t.id));
    },
    enabled: activeTask?.mode === 'existing',
  });

  // Check if at least one valid task is defined
  const hasValidTask = tasks.some((t) => {
    if (t.mode === 'new') {
      return t.title && t.title.trim().length > 0;
    } else {
      return t.existingTaskId !== undefined;
    }
  });

  const canSubmit = planTitle.trim().length > 0 && hasValidTask && currentUser;

  const addTask = () => {
    const newId = String(Date.now());
    setTasks([...tasks, { id: newId, mode: 'new', title: '', priority: 3 }]);
    setActiveTaskId(newId);
  };

  const removeTask = (taskId: string) => {
    if (tasks.length <= 1) return; // Must have at least one task
    const newTasks = tasks.filter((t) => t.id !== taskId);
    setTasks(newTasks);
    if (activeTaskId === taskId) {
      setActiveTaskId(newTasks[0].id);
    }
  };

  const updateTask = (taskId: string, updates: Partial<TaskEntry>) => {
    setTasks(tasks.map((t) => (t.id === taskId ? { ...t, ...updates } : t)));
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;

    try {
      // Find the first valid task as the initial task
      const validTasks = tasks.filter((t) => {
        if (t.mode === 'new') return t.title && t.title.trim().length > 0;
        return t.existingTaskId !== undefined;
      });

      const firstTask = validTasks[0];
      const additionalTasks = validTasks.slice(1);

      const result = await createPlan.mutateAsync({
        title: planTitle.trim(),
        createdBy: currentUser!.id,
        ...(firstTask.mode === 'new'
          ? { initialTask: { title: firstTask.title!.trim(), priority: firstTask.priority } }
          : { initialTaskId: firstTask.existingTaskId! }),
        additionalTasks: additionalTasks.map((t) =>
          t.mode === 'new'
            ? { title: t.title!.trim(), priority: t.priority }
            : { existingTaskId: t.existingTaskId! }
        ),
      });

      toast.success('Plan created successfully');
      onSuccess?.({ id: result.id, title: planTitle.trim() });
      onClose();
    } catch (err) {
      toast.error((err as Error).message || 'Failed to create plan');
    }
  };

  if (!isOpen) return null;

  // Mobile: Full-screen modal
  if (isMobile) {
    return (
      <div className="fixed inset-0 z-50 bg-[var(--color-bg)]" data-testid="create-plan-modal">
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--color-border)] bg-[var(--color-surface)] sticky top-0 z-10">
          <button
            onClick={onClose}
            className="p-2 -ml-2 rounded-md text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] transition-colors duration-150 touch-target"
            aria-label="Cancel"
            data-testid="create-plan-close"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h2 className="flex-1 text-lg font-semibold text-[var(--color-text)]">Create Plan</h2>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || createPlan.isPending}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors touch-target"
            data-testid="create-plan-submit"
          >
            {createPlan.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create'}
          </button>
        </div>

        {/* Content - scrollable */}
        <div className="p-4 pb-20 overflow-y-auto h-[calc(100vh-60px)] space-y-4">
          {/* Plan Title */}
          <div>
            <label htmlFor="plan-title-mobile" className="block text-sm font-medium text-[var(--color-text)] mb-1">
              Plan Title *
            </label>
            <input
              id="plan-title-mobile"
              type="text"
              data-testid="plan-title-input"
              placeholder="Enter plan title..."
              value={planTitle}
              onChange={(e) => setPlanTitle(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              autoFocus
            />
          </div>

          {/* Tasks Section */}
          <div className="border border-blue-200 dark:border-blue-800 rounded-lg p-4 bg-blue-50 dark:bg-blue-900/20">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Info className="w-4 h-4 text-blue-500" />
                <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
                  Tasks ({tasks.length})
                </span>
              </div>
              <button
                onClick={addTask}
                className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-100 rounded transition-colors"
                data-testid="add-task-btn"
              >
                <Plus className="w-3 h-3" />
                Add Task
              </button>
            </div>

            {/* Task Tabs */}
            <div className="flex flex-wrap gap-2 mb-4">
              {tasks.map((task, index) => (
                <button
                  key={task.id}
                  onClick={() => setActiveTaskId(task.id)}
                  className={`flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg transition-colors ${
                    activeTaskId === task.id
                      ? 'bg-blue-500 text-white'
                      : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  Task {index + 1}
                  {task.mode === 'new' && task.title && (
                    <Check className="w-3 h-3 text-green-400" />
                  )}
                  {task.mode === 'existing' && task.existingTaskId && (
                    <Check className="w-3 h-3 text-green-400" />
                  )}
                </button>
              ))}
            </div>

            {/* Active Task Editor */}
            {activeTask && (
              <TaskEditor
                task={activeTask}
                existingTasks={existingTasks}
                isLoadingTasks={isLoadingTasks}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                onUpdate={(updates) => updateTask(activeTask.id, updates)}
                onRemove={tasks.length > 1 ? () => removeTask(activeTask.id) : undefined}
                isMobile={true}
              />
            )}
          </div>
        </div>
      </div>
    );
  }

  // Desktop: Centered modal
  return (
    <div
      data-testid="create-plan-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Create Plan</h3>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
            data-testid="create-plan-close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Plan Title */}
          <div>
            <label htmlFor="plan-title" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Plan Title *
            </label>
            <input
              id="plan-title"
              type="text"
              data-testid="plan-title-input"
              placeholder="Enter plan title..."
              value={planTitle}
              onChange={(e) => setPlanTitle(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              autoFocus
            />
          </div>

          {/* Tasks Section */}
          <div className="border border-blue-200 dark:border-blue-800 rounded-lg p-4 bg-blue-50 dark:bg-blue-900/20">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Info className="w-4 h-4 text-blue-500" />
                <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
                  Tasks ({tasks.length})
                </span>
              </div>
              <button
                onClick={addTask}
                className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/40 rounded transition-colors"
                data-testid="add-task-btn"
              >
                <Plus className="w-3 h-3" />
                Add Task
              </button>
            </div>
            <p className="text-xs text-blue-600 dark:text-blue-400 mb-4">
              Plans must have at least one task. Add new tasks or select existing ones.
            </p>

            {/* Task Tabs */}
            <div className="flex flex-wrap gap-2 mb-4">
              {tasks.map((task, index) => (
                <button
                  key={task.id}
                  onClick={() => setActiveTaskId(task.id)}
                  className={`flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg transition-colors ${
                    activeTaskId === task.id
                      ? 'bg-blue-500 text-white'
                      : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  Task {index + 1}
                  {task.mode === 'new' && task.title && (
                    <Check className="w-3 h-3 text-green-400" />
                  )}
                  {task.mode === 'existing' && task.existingTaskId && (
                    <Check className="w-3 h-3 text-green-400" />
                  )}
                </button>
              ))}
            </div>

            {/* Active Task Editor */}
            {activeTask && (
              <TaskEditor
                task={activeTask}
                existingTasks={existingTasks}
                isLoadingTasks={isLoadingTasks}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                onUpdate={(updates) => updateTask(activeTask.id, updates)}
                onRemove={tasks.length > 1 ? () => removeTask(activeTask.id) : undefined}
                isMobile={false}
              />
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            data-testid="create-plan-cancel"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || createPlan.isPending}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="create-plan-submit"
          >
            {createPlan.isPending ? 'Creating...' : 'Create Plan'}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Task Editor Component - handles both new and existing task selection
 */
function TaskEditor({
  task,
  existingTasks,
  isLoadingTasks,
  searchQuery,
  onSearchChange,
  onUpdate,
  onRemove,
  isMobile,
}: {
  task: TaskEntry;
  existingTasks: TaskType[];
  isLoadingTasks: boolean;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onUpdate: (updates: Partial<TaskEntry>) => void;
  onRemove?: () => void;
  isMobile: boolean;
}) {
  return (
    <div className="space-y-3">
      {/* Mode Toggle */}
      <div className="flex gap-2">
        <button
          data-testid="mode-new-task"
          onClick={() => onUpdate({ mode: 'new', existingTaskId: undefined, existingTaskTitle: undefined })}
          className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
            task.mode === 'new'
              ? 'bg-blue-500 text-white'
              : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
          }`}
        >
          Create New Task
        </button>
        <button
          data-testid="mode-existing-task"
          onClick={() => onUpdate({ mode: 'existing' })}
          className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
            task.mode === 'existing'
              ? 'bg-blue-500 text-white'
              : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
          }`}
        >
          Use Existing Task
        </button>
      </div>

      {/* New Task Form */}
      {task.mode === 'new' && (
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Task Title *
            </label>
            <input
              type="text"
              data-testid="task-title-input"
              placeholder="Enter task title..."
              value={task.title || ''}
              onChange={(e) => onUpdate({ title: e.target.value })}
              className={`w-full px-3 ${isMobile ? 'py-2.5' : 'py-2'} border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-white`}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Priority
            </label>
            <select
              data-testid="task-priority-select"
              value={task.priority || 3}
              onChange={(e) => onUpdate({ priority: Number(e.target.value) })}
              className={`w-full px-3 ${isMobile ? 'py-2.5 touch-target' : 'py-2'} border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-white`}
              aria-label="Task priority"
            >
              {[1, 2, 3, 4, 5].map((p) => (
                <option key={p} value={p}>
                  {p} - {priorityLabels[p]}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Existing Task Picker */}
      {task.mode === 'existing' && (
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              data-testid="existing-task-search"
              placeholder="Search tasks by title or ID..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className={`w-full pl-10 pr-4 ${isMobile ? 'py-2.5' : 'py-2'} border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-white`}
            />
          </div>

          {/* Task List */}
          <div className={`${isMobile ? 'max-h-60' : 'max-h-48'} overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800`}>
            {isLoadingTasks ? (
              <div className="text-center py-4 text-gray-500 text-sm">
                Loading tasks...
              </div>
            ) : existingTasks.length === 0 ? (
              <div className="text-center py-4 text-gray-500 text-sm">
                {searchQuery ? 'No matching tasks found' : 'No tasks available'}
              </div>
            ) : (
              <div className="divide-y divide-gray-100 dark:divide-gray-700">
                {existingTasks.map((existingTask) => (
                  <button
                    key={existingTask.id}
                    data-testid={`existing-task-${existingTask.id}`}
                    onClick={() => onUpdate({
                      existingTaskId: existingTask.id,
                      existingTaskTitle: existingTask.title,
                    })}
                    className={`w-full flex items-center gap-3 p-3 text-left transition-colors ${isMobile ? 'touch-target' : ''} ${
                      task.existingTaskId === existingTask.id
                        ? 'bg-blue-100 dark:bg-blue-900/30 border-l-2 border-blue-500'
                        : 'hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {existingTask.title}
                      </div>
                      <div className="text-xs text-gray-500 font-mono">{existingTask.id}</div>
                    </div>
                    {task.existingTaskId === existingTask.id && (
                      <Check className="w-4 h-4 text-blue-500 flex-shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {task.existingTaskId && (
            <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
              <Check className="w-4 h-4" />
              <span>Task selected: {task.existingTaskTitle}</span>
            </div>
          )}
        </div>
      )}

      {/* Remove Task Button */}
      {onRemove && (
        <button
          onClick={onRemove}
          className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-red-600 hover:text-red-800 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
          data-testid="remove-task-btn"
        >
          <Trash2 className="w-3 h-3" />
          Remove Task
        </button>
      )}
    </div>
  );
}

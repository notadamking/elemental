/**
 * CreateTaskModal - Modal for creating new tasks in the orchestrator
 *
 * Orchestrator-specific features:
 * - Agent assignment (workers) instead of generic entity assignment
 * - Supports ephemeral flag for temporary tasks
 * - Simpler form focused on orchestrator workflow
 */

import { useState, useEffect, useRef } from 'react';
import { X, Loader2, Plus, ChevronLeft } from 'lucide-react';
import { useCreateTask } from '../../api/hooks/useTasks';
import { useAgents } from '../../api/hooks/useAgents';
import { TagInput } from '../ui/TagInput';
import type { Priority, Complexity, TaskTypeValue, Agent } from '../../api/types';

interface CreateTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (taskId: string) => void;
}

const PRIORITY_OPTIONS: { value: Priority; label: string }[] = [
  { value: 1, label: 'Critical' },
  { value: 2, label: 'High' },
  { value: 3, label: 'Medium' },
  { value: 4, label: 'Low' },
  { value: 5, label: 'Minimal' },
];

const COMPLEXITY_OPTIONS: { value: Complexity; label: string }[] = [
  { value: 1, label: 'Trivial' },
  { value: 2, label: 'Simple' },
  { value: 3, label: 'Moderate' },
  { value: 4, label: 'Complex' },
  { value: 5, label: 'Very Complex' },
];

const TASK_TYPE_OPTIONS: { value: TaskTypeValue; label: string }[] = [
  { value: 'task', label: 'Task' },
  { value: 'bug', label: 'Bug' },
  { value: 'feature', label: 'Feature' },
  { value: 'chore', label: 'Chore' },
];

export function CreateTaskModal({ isOpen, onClose, onSuccess }: CreateTaskModalProps) {
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<Priority>(3);
  const [complexity, setComplexity] = useState<Complexity>(3);
  const [taskType, setTaskType] = useState<TaskTypeValue>('task');
  const [assignee, setAssignee] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [ephemeral, setEphemeral] = useState(false);

  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const createTask = useCreateTask();
  const { data: agentsData } = useAgents('worker');

  // Get available worker agents for assignment
  const workers: Agent[] = agentsData?.agents ?? [];

  // Focus title input when modal opens
  useEffect(() => {
    if (isOpen && titleInputRef.current) {
      setTimeout(() => titleInputRef.current?.focus(), 100);
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
      setEphemeral(false);
      createTask.reset();
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) return;

    try {
      const result = await createTask.mutateAsync({
        title: title.trim(),
        priority,
        complexity,
        taskType,
        assignee: assignee || undefined,
        tags: tags.length > 0 ? tags : undefined,
        ephemeral,
      });
      onSuccess?.(result.task?.id ?? '');
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

  // Responsive detection
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  if (!isOpen) return null;

  // Mobile: Full-screen modal
  if (isMobile) {
    return (
      <div
        className="fixed inset-0 z-50 bg-[var(--color-bg)]"
        data-testid="create-task-modal"
        onKeyDown={handleKeyDown}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--color-border)] bg-[var(--color-surface)] sticky top-0 z-10">
          <button
            onClick={onClose}
            className="p-2 -ml-2 rounded-md text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] transition-colors"
            aria-label="Cancel"
            data-testid="create-task-close"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h2 className="flex-1 text-lg font-semibold text-[var(--color-text)]">Create Task</h2>
          <button
            onClick={handleSubmit as unknown as () => void}
            disabled={createTask.isPending || !title.trim()}
            className="px-4 py-2 text-sm font-medium text-white bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
            data-testid="create-task-submit"
          >
            {createTask.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create'}
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 pb-20 overflow-y-auto h-[calc(100vh-60px)]">
          {createTask.isError && (
            <div className="mb-4 p-3 bg-[var(--color-danger-muted)] border border-[var(--color-danger)] rounded-lg text-sm text-[var(--color-danger)]">
              {createTask.error?.message || 'Failed to create task'}
            </div>
          )}

          <FormFields
            title={title}
            setTitle={setTitle}
            titleInputRef={titleInputRef}
            priority={priority}
            setPriority={setPriority}
            complexity={complexity}
            setComplexity={setComplexity}
            taskType={taskType}
            setTaskType={setTaskType}
            assignee={assignee}
            setAssignee={setAssignee}
            workers={workers}
            tags={tags}
            setTags={setTags}
            ephemeral={ephemeral}
            setEphemeral={setEphemeral}
          />
        </form>
      </div>
    );
  }

  // Desktop: Centered modal
  return (
    <div className="fixed inset-0 z-50" data-testid="create-task-modal" onKeyDown={handleKeyDown}>
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        data-testid="create-task-backdrop"
      />

      {/* Dialog */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="bg-[var(--color-surface)] rounded-xl shadow-2xl border border-[var(--color-border)]">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
            <h2 className="text-lg font-semibold text-[var(--color-text)]">Create Task</h2>
            <button
              onClick={onClose}
              className="p-1 text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] rounded"
              aria-label="Close"
              data-testid="create-task-close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-4">
            {createTask.isError && (
              <div
                className="mb-4 p-3 bg-[var(--color-danger-muted)] border border-[var(--color-danger)] rounded-lg text-sm text-[var(--color-danger)]"
                data-testid="create-task-error"
              >
                {createTask.error?.message || 'Failed to create task'}
              </div>
            )}

            <FormFields
              title={title}
              setTitle={setTitle}
              titleInputRef={titleInputRef}
              priority={priority}
              setPriority={setPriority}
              complexity={complexity}
              setComplexity={setComplexity}
              taskType={taskType}
              setTaskType={setTaskType}
              assignee={assignee}
              setAssignee={setAssignee}
              workers={workers}
              tags={tags}
              setTags={setTags}
              ephemeral={ephemeral}
              setEphemeral={setEphemeral}
            />

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] rounded-md transition-colors"
                data-testid="create-task-cancel"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={createTask.isPending || !title.trim()}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                data-testid="create-task-submit"
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

// Form fields component to reduce duplication
interface FormFieldsProps {
  title: string;
  setTitle: (value: string) => void;
  titleInputRef: React.RefObject<HTMLInputElement | null>;
  priority: Priority;
  setPriority: (value: Priority) => void;
  complexity: Complexity;
  setComplexity: (value: Complexity) => void;
  taskType: TaskTypeValue;
  setTaskType: (value: TaskTypeValue) => void;
  assignee: string;
  setAssignee: (value: string) => void;
  workers: Agent[];
  tags: string[];
  setTags: (value: string[]) => void;
  ephemeral: boolean;
  setEphemeral: (value: boolean) => void;
}

function FormFields({
  title,
  setTitle,
  titleInputRef,
  priority,
  setPriority,
  complexity,
  setComplexity,
  taskType,
  setTaskType,
  assignee,
  setAssignee,
  workers,
  tags,
  setTags,
  ephemeral,
  setEphemeral,
}: FormFieldsProps) {
  return (
    <>
      {/* Title */}
      <div className="mb-4">
        <label
          htmlFor="task-title"
          className="block text-sm font-medium text-[var(--color-text)] mb-1"
        >
          Title <span className="text-[var(--color-danger)]">*</span>
        </label>
        <input
          ref={titleInputRef}
          id="task-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Enter task title..."
          className="w-full px-3 py-2 border border-[var(--color-border)] rounded-md bg-[var(--color-input-bg)] text-[var(--color-text)] placeholder:text-[var(--color-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:border-transparent"
          data-testid="create-task-title"
          required
        />
      </div>

      {/* Priority & Complexity */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <label
            htmlFor="task-priority"
            className="block text-sm font-medium text-[var(--color-text)] mb-1"
          >
            Priority
          </label>
          <select
            id="task-priority"
            value={priority}
            onChange={(e) => setPriority(Number(e.target.value) as Priority)}
            className="w-full px-3 py-2 border border-[var(--color-border)] rounded-md bg-[var(--color-input-bg)] text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:border-transparent"
            data-testid="create-task-priority"
          >
            {PRIORITY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            htmlFor="task-complexity"
            className="block text-sm font-medium text-[var(--color-text)] mb-1"
          >
            Complexity
          </label>
          <select
            id="task-complexity"
            value={complexity}
            onChange={(e) => setComplexity(Number(e.target.value) as Complexity)}
            className="w-full px-3 py-2 border border-[var(--color-border)] rounded-md bg-[var(--color-input-bg)] text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:border-transparent"
            data-testid="create-task-complexity"
          >
            {COMPLEXITY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Type & Assignee */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <label
            htmlFor="task-type"
            className="block text-sm font-medium text-[var(--color-text)] mb-1"
          >
            Type
          </label>
          <select
            id="task-type"
            value={taskType}
            onChange={(e) => setTaskType(e.target.value as TaskTypeValue)}
            className="w-full px-3 py-2 border border-[var(--color-border)] rounded-md bg-[var(--color-input-bg)] text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:border-transparent"
            data-testid="create-task-type"
          >
            {TASK_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            htmlFor="task-assignee"
            className="block text-sm font-medium text-[var(--color-text)] mb-1"
          >
            Assign to Agent
          </label>
          <select
            id="task-assignee"
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
            className="w-full px-3 py-2 border border-[var(--color-border)] rounded-md bg-[var(--color-input-bg)] text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:border-transparent"
            data-testid="create-task-assignee"
          >
            <option value="">Unassigned</option>
            {workers.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Tags */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-[var(--color-text)] mb-1">Tags</label>
        <TagInput
          tags={tags}
          onChange={setTags}
          placeholder="Type and press comma to add tags"
          data-testid="create-task-tags"
        />
      </div>

      {/* Ephemeral toggle */}
      <div className="mb-4">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={ephemeral}
            onChange={(e) => setEphemeral(e.target.checked)}
            className="w-4 h-4 text-[var(--color-primary)] border-[var(--color-border)] rounded focus:ring-[var(--color-primary)] focus:ring-offset-0"
            data-testid="create-task-ephemeral"
          />
          <div>
            <span className="text-sm font-medium text-[var(--color-text)]">Ephemeral task</span>
            <p className="text-xs text-[var(--color-text-tertiary)]">
              Temporary task that won't be persisted long-term
            </p>
          </div>
        </label>
      </div>
    </>
  );
}

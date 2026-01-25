import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, List, LayoutGrid, CheckSquare, Square, X, ChevronDown, Loader2 } from 'lucide-react';
import { TaskDetailPanel } from '../components/task/TaskDetailPanel';
import { CreateTaskModal } from '../components/task/CreateTaskModal';
import { KanbanBoard } from '../components/task/KanbanBoard';

type ViewMode = 'list' | 'kanban';

interface Task {
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
}

function useTasks() {
  return useQuery<Task[]>({
    queryKey: ['tasks'],
    queryFn: async () => {
      // For now, we'll use the ready tasks endpoint
      // TODO: Add a full tasks list endpoint
      const response = await fetch('/api/tasks/ready');
      if (!response.ok) throw new Error('Failed to fetch tasks');
      return response.json();
    },
  });
}

function useBulkUpdate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ ids, updates }: { ids: string[]; updates: Record<string, unknown> }) => {
      const response = await fetch('/api/tasks/bulk', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, updates }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to update tasks');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['tasks', 'ready'] });
      queryClient.invalidateQueries({ queryKey: ['tasks', 'blocked'] });
      queryClient.invalidateQueries({ queryKey: ['tasks', 'completed'] });
    },
  });
}

const PRIORITY_LABELS: Record<number, { label: string; color: string }> = {
  1: { label: 'Critical', color: 'bg-red-100 text-red-800' },
  2: { label: 'High', color: 'bg-orange-100 text-orange-800' },
  3: { label: 'Medium', color: 'bg-yellow-100 text-yellow-800' },
  4: { label: 'Low', color: 'bg-green-100 text-green-800' },
  5: { label: 'Trivial', color: 'bg-gray-100 text-gray-800' },
};

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-blue-100 text-blue-800',
  in_progress: 'bg-yellow-100 text-yellow-800',
  blocked: 'bg-red-100 text-red-800',
  completed: 'bg-green-100 text-green-800',
  cancelled: 'bg-gray-100 text-gray-800',
};

const STATUS_OPTIONS = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

const PRIORITY_OPTIONS = [
  { value: 1, label: 'Critical' },
  { value: 2, label: 'High' },
  { value: 3, label: 'Medium' },
  { value: 4, label: 'Low' },
  { value: 5, label: 'Trivial' },
];

function TaskRow({
  task,
  isSelected,
  isChecked,
  onCheck,
  onClick,
  showCheckbox
}: {
  task: Task;
  isSelected: boolean;
  isChecked: boolean;
  onCheck: (checked: boolean) => void;
  onClick: () => void;
  showCheckbox: boolean;
}) {
  const priority = PRIORITY_LABELS[task.priority] || PRIORITY_LABELS[3];
  const statusColor = STATUS_COLORS[task.status] || STATUS_COLORS.open;

  const handleCheckboxClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onCheck(!isChecked);
  };

  return (
    <tr
      className={`cursor-pointer transition-colors ${isSelected ? 'bg-blue-50 hover:bg-blue-100' : 'hover:bg-gray-50'}`}
      onClick={onClick}
      data-testid={`task-row-${task.id}`}
    >
      {showCheckbox && (
        <td className="px-2 py-3 w-10">
          <button
            onClick={handleCheckboxClick}
            className="p-1 hover:bg-gray-200 rounded"
            data-testid={`task-checkbox-${task.id}`}
          >
            {isChecked ? (
              <CheckSquare className="w-4 h-4 text-blue-600" />
            ) : (
              <Square className="w-4 h-4 text-gray-400" />
            )}
          </button>
        </td>
      )}
      <td className="px-4 py-3">
        <div>
          <div className="font-medium text-gray-900">{task.title}</div>
          <div className="text-xs text-gray-500 font-mono">{task.id}</div>
        </div>
      </td>
      <td className="px-4 py-3">
        <span className={`px-2 py-1 text-xs font-medium rounded ${statusColor}`}>
          {task.status.replace('_', ' ')}
        </span>
      </td>
      <td className="px-4 py-3">
        <span className={`px-2 py-1 text-xs font-medium rounded ${priority.color}`}>
          {priority.label}
        </span>
      </td>
      <td className="px-4 py-3 text-sm text-gray-600 capitalize">
        {task.taskType}
      </td>
      <td className="px-4 py-3 text-sm text-gray-600">
        {task.assignee || '-'}
      </td>
      <td className="px-4 py-3">
        <div className="flex gap-1">
          {task.tags.slice(0, 2).map((tag) => (
            <span key={tag} className="px-1.5 py-0.5 text-xs bg-gray-200 rounded">
              {tag}
            </span>
          ))}
          {task.tags.length > 2 && (
            <span className="text-xs text-gray-500">+{task.tags.length - 2}</span>
          )}
        </div>
      </td>
    </tr>
  );
}

function ViewToggle({ view, onViewChange }: { view: ViewMode; onViewChange: (view: ViewMode) => void }) {
  return (
    <div className="flex items-center bg-gray-100 rounded-md p-0.5" data-testid="view-toggle">
      <button
        onClick={() => onViewChange('list')}
        className={`inline-flex items-center gap-1 px-2 py-1 text-sm rounded transition-colors ${
          view === 'list' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
        }`}
        data-testid="view-toggle-list"
        aria-label="List view"
      >
        <List className="w-4 h-4" />
      </button>
      <button
        onClick={() => onViewChange('kanban')}
        className={`inline-flex items-center gap-1 px-2 py-1 text-sm rounded transition-colors ${
          view === 'kanban' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
        }`}
        data-testid="view-toggle-kanban"
        aria-label="Kanban view"
      >
        <LayoutGrid className="w-4 h-4" />
      </button>
    </div>
  );
}

function BulkActionMenu({
  selectedCount,
  onChangeStatus,
  onChangePriority,
  onClear,
  isPending
}: {
  selectedCount: number;
  onChangeStatus: (status: string) => void;
  onChangePriority: (priority: number) => void;
  onClear: () => void;
  isPending: boolean;
}) {
  const [isStatusOpen, setIsStatusOpen] = useState(false);
  const [isPriorityOpen, setIsPriorityOpen] = useState(false);
  const statusRef = useRef<HTMLDivElement>(null);
  const priorityRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (statusRef.current && !statusRef.current.contains(event.target as Node)) {
        setIsStatusOpen(false);
      }
      if (priorityRef.current && !priorityRef.current.contains(event.target as Node)) {
        setIsPriorityOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div
      className="flex items-center gap-2 px-4 py-2 bg-blue-50 border-b border-blue-200"
      data-testid="bulk-action-menu"
    >
      <span className="text-sm font-medium text-blue-700" data-testid="bulk-selected-count">
        {selectedCount} selected
      </span>

      {/* Status dropdown */}
      <div className="relative" ref={statusRef}>
        <button
          onClick={() => { setIsPriorityOpen(false); setIsStatusOpen(!isStatusOpen); }}
          disabled={isPending}
          className="inline-flex items-center gap-1 px-2 py-1 text-sm bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
          data-testid="bulk-status-button"
        >
          Set Status
          <ChevronDown className="w-3 h-3" />
        </button>
        {isStatusOpen && (
          <div
            className="absolute z-10 mt-1 bg-white border border-gray-200 rounded-md shadow-lg py-1 min-w-32"
            data-testid="bulk-status-options"
          >
            {STATUS_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => {
                  onChangeStatus(option.value);
                  setIsStatusOpen(false);
                }}
                className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50"
                data-testid={`bulk-status-option-${option.value}`}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Priority dropdown */}
      <div className="relative" ref={priorityRef}>
        <button
          onClick={() => { setIsStatusOpen(false); setIsPriorityOpen(!isPriorityOpen); }}
          disabled={isPending}
          className="inline-flex items-center gap-1 px-2 py-1 text-sm bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
          data-testid="bulk-priority-button"
        >
          Set Priority
          <ChevronDown className="w-3 h-3" />
        </button>
        {isPriorityOpen && (
          <div
            className="absolute z-10 mt-1 bg-white border border-gray-200 rounded-md shadow-lg py-1 min-w-32"
            data-testid="bulk-priority-options"
          >
            {PRIORITY_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => {
                  onChangePriority(option.value);
                  setIsPriorityOpen(false);
                }}
                className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50"
                data-testid={`bulk-priority-option-${option.value}`}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {isPending && <Loader2 className="w-4 h-4 animate-spin text-blue-600" />}

      {/* Clear selection */}
      <button
        onClick={onClear}
        className="ml-auto p-1 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded"
        data-testid="bulk-clear-selection"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

function ListView({
  tasks,
  selectedTaskId,
  selectedIds,
  onTaskClick,
  onTaskCheck,
  onSelectAll
}: {
  tasks: Task[];
  selectedTaskId: string | null;
  selectedIds: Set<string>;
  onTaskClick: (taskId: string) => void;
  onTaskCheck: (taskId: string, checked: boolean) => void;
  onSelectAll: () => void;
}) {
  if (tasks.length === 0) {
    return (
      <div className="p-6 text-center text-gray-500">
        No tasks found.
      </div>
    );
  }

  const allSelected = tasks.length > 0 && tasks.every(t => selectedIds.has(t.id));
  const someSelected = selectedIds.size > 0;

  return (
    <table className="min-w-full divide-y divide-gray-200" data-testid="tasks-list-view">
      <thead className="bg-gray-50 sticky top-0">
        <tr>
          <th className="px-2 py-3 w-10">
            <button
              onClick={onSelectAll}
              className="p-1 hover:bg-gray-200 rounded"
              data-testid="task-select-all"
            >
              {allSelected ? (
                <CheckSquare className="w-4 h-4 text-blue-600" />
              ) : someSelected ? (
                <div className="w-4 h-4 border-2 border-blue-600 rounded flex items-center justify-center">
                  <div className="w-2 h-0.5 bg-blue-600" />
                </div>
              ) : (
                <Square className="w-4 h-4 text-gray-400" />
              )}
            </button>
          </th>
          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
            Task
          </th>
          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
            Status
          </th>
          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
            Priority
          </th>
          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
            Type
          </th>
          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
            Assignee
          </th>
          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
            Tags
          </th>
        </tr>
      </thead>
      <tbody className="bg-white divide-y divide-gray-200">
        {tasks.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            isSelected={task.id === selectedTaskId}
            isChecked={selectedIds.has(task.id)}
            onCheck={(checked) => onTaskCheck(task.id, checked)}
            onClick={() => onTaskClick(task.id)}
            showCheckbox={true}
          />
        ))}
      </tbody>
    </table>
  );
}

export function TasksPage() {
  const tasks = useTasks();
  const bulkUpdate = useBulkUpdate();
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const handleTaskClick = (taskId: string) => {
    setSelectedTaskId(taskId);
  };

  const handleCloseDetail = () => {
    setSelectedTaskId(null);
  };

  const handleCreateSuccess = (task: { id: string }) => {
    // Optionally select the newly created task
    setSelectedTaskId(task.id);
  };

  const handleTaskCheck = (taskId: string, checked: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (checked) {
        next.add(taskId);
      } else {
        next.delete(taskId);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (!tasks.data) return;

    const allSelected = tasks.data.every(t => selectedIds.has(t.id));
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(tasks.data.map(t => t.id)));
    }
  };

  const handleBulkStatusChange = (status: string) => {
    bulkUpdate.mutate(
      { ids: Array.from(selectedIds), updates: { status } },
      { onSuccess: () => setSelectedIds(new Set()) }
    );
  };

  const handleBulkPriorityChange = (priority: number) => {
    bulkUpdate.mutate(
      { ids: Array.from(selectedIds), updates: { priority } },
      { onSuccess: () => setSelectedIds(new Set()) }
    );
  };

  const handleClearSelection = () => {
    setSelectedIds(new Set());
  };

  return (
    <div className="flex h-full" data-testid="tasks-page">
      {/* Create Task Modal */}
      <CreateTaskModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={handleCreateSuccess}
      />

      {/* Task List - shrinks when detail panel is open */}
      <div className={`flex flex-col ${selectedTaskId ? 'w-1/2' : 'w-full'} transition-all duration-200`}>
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-lg font-medium text-gray-900">Tasks</h2>
          <div className="flex items-center gap-3">
            <ViewToggle view={viewMode} onViewChange={setViewMode} />
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors"
              data-testid="create-task-button"
            >
              <Plus className="w-4 h-4" />
              Create Task
            </button>
          </div>
        </div>

        {/* Bulk Action Menu */}
        {selectedIds.size > 0 && viewMode === 'list' && (
          <BulkActionMenu
            selectedCount={selectedIds.size}
            onChangeStatus={handleBulkStatusChange}
            onChangePriority={handleBulkPriorityChange}
            onClear={handleClearSelection}
            isPending={bulkUpdate.isPending}
          />
        )}

        <div className="flex-1 overflow-auto">
          {tasks.isLoading && (
            <div className="p-4 text-gray-500">Loading tasks...</div>
          )}

          {tasks.isError && (
            <div className="p-4 text-red-600">Failed to load tasks</div>
          )}

          {tasks.data && viewMode === 'list' && (
            <ListView
              tasks={tasks.data}
              selectedTaskId={selectedTaskId}
              selectedIds={selectedIds}
              onTaskClick={handleTaskClick}
              onTaskCheck={handleTaskCheck}
              onSelectAll={handleSelectAll}
            />
          )}

          {tasks.data && viewMode === 'kanban' && (
            <KanbanBoard
              tasks={tasks.data}
              selectedTaskId={selectedTaskId}
              onTaskClick={handleTaskClick}
            />
          )}
        </div>
      </div>

      {/* Task Detail Panel */}
      {selectedTaskId && (
        <div className="w-1/2 border-l border-gray-200" data-testid="task-detail-container">
          <TaskDetailPanel taskId={selectedTaskId} onClose={handleCloseDetail} />
        </div>
      )}
    </div>
  );
}

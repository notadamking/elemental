import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, List, LayoutGrid } from 'lucide-react';
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

function TaskRow({ task, isSelected, onClick }: { task: Task; isSelected: boolean; onClick: () => void }) {
  const priority = PRIORITY_LABELS[task.priority] || PRIORITY_LABELS[3];
  const statusColor = STATUS_COLORS[task.status] || STATUS_COLORS.open;

  return (
    <tr
      className={`cursor-pointer transition-colors ${isSelected ? 'bg-blue-50 hover:bg-blue-100' : 'hover:bg-gray-50'}`}
      onClick={onClick}
      data-testid={`task-row-${task.id}`}
    >
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

function ListView({
  tasks,
  selectedTaskId,
  onTaskClick
}: {
  tasks: Task[];
  selectedTaskId: string | null;
  onTaskClick: (taskId: string) => void;
}) {
  if (tasks.length === 0) {
    return (
      <div className="p-6 text-center text-gray-500">
        No tasks found.
      </div>
    );
  }

  return (
    <table className="min-w-full divide-y divide-gray-200" data-testid="tasks-list-view">
      <thead className="bg-gray-50 sticky top-0">
        <tr>
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
            onClick={() => onTaskClick(task.id)}
          />
        ))}
      </tbody>
    </table>
  );
}

export function TasksPage() {
  const tasks = useTasks();
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('list');

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
              onTaskClick={handleTaskClick}
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

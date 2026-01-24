/**
 * Task Flow Lens
 *
 * Three-column layout showing:
 * 1. Ready Tasks (unblocked, actionable)
 * 2. Blocked Tasks (waiting on dependencies)
 * 3. Recently Completed (closed in last 24h)
 */

import { useQuery } from '@tanstack/react-query';

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

interface BlockedTask extends Task {
  blockedBy: string;
  blockReason: string;
}

function useReadyTasks() {
  return useQuery<Task[]>({
    queryKey: ['tasks', 'ready'],
    queryFn: async () => {
      const response = await fetch('/api/tasks/ready');
      if (!response.ok) throw new Error('Failed to fetch ready tasks');
      return response.json();
    },
  });
}

function useBlockedTasks() {
  return useQuery<BlockedTask[]>({
    queryKey: ['tasks', 'blocked'],
    queryFn: async () => {
      const response = await fetch('/api/tasks/blocked');
      if (!response.ok) throw new Error('Failed to fetch blocked tasks');
      return response.json();
    },
  });
}

function useCompletedTasks() {
  return useQuery<Task[]>({
    queryKey: ['tasks', 'completed'],
    queryFn: async () => {
      const response = await fetch('/api/tasks/completed');
      if (!response.ok) throw new Error('Failed to fetch completed tasks');
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

const TASK_TYPE_COLORS: Record<string, string> = {
  bug: 'bg-red-50 border-red-200',
  feature: 'bg-purple-50 border-purple-200',
  task: 'bg-blue-50 border-blue-200',
  chore: 'bg-gray-50 border-gray-200',
};

function TaskCard({ task, showBlockReason }: { task: Task | BlockedTask; showBlockReason?: boolean }) {
  const priority = PRIORITY_LABELS[task.priority] || PRIORITY_LABELS[3];
  const typeColor = TASK_TYPE_COLORS[task.taskType] || TASK_TYPE_COLORS.task;
  const blockedTask = showBlockReason ? (task as BlockedTask) : null;

  return (
    <div className={`p-3 rounded-lg border ${typeColor}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-gray-900 text-sm truncate">{task.title}</h4>
          <p className="text-xs text-gray-500 mt-0.5 font-mono">{task.id}</p>
        </div>
        <span className={`px-1.5 py-0.5 text-xs font-medium rounded shrink-0 ${priority.color}`}>
          {priority.label}
        </span>
      </div>
      {blockedTask && (
        <div className="mt-2 p-2 bg-red-50 rounded border border-red-100">
          <p className="text-xs text-red-700">
            <span className="font-medium">Blocked by:</span>{' '}
            <span className="font-mono">{blockedTask.blockedBy}</span>
          </p>
          <p className="text-xs text-red-600 mt-0.5">{blockedTask.blockReason}</p>
        </div>
      )}
      <div className="mt-2 flex items-center gap-2 flex-wrap">
        <span className="text-xs text-gray-600 capitalize">{task.taskType}</span>
        {task.assignee && (
          <span className="text-xs text-gray-500">→ {task.assignee}</span>
        )}
      </div>
    </div>
  );
}

function CompletedTaskCard({ task }: { task: Task }) {
  const timeAgo = getTimeAgo(task.updatedAt);

  return (
    <div className="p-3 rounded-lg border bg-green-50 border-green-200">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-gray-700 text-sm truncate line-through">{task.title}</h4>
          <p className="text-xs text-gray-500 mt-0.5 font-mono">{task.id}</p>
        </div>
        <span className="px-1.5 py-0.5 text-xs font-medium rounded bg-green-100 text-green-800 shrink-0">
          {task.status === 'cancelled' ? 'Cancelled' : 'Done'}
        </span>
      </div>
      <div className="mt-2 text-xs text-gray-500">
        Completed {timeAgo}
      </div>
    </div>
  );
}

function getTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

interface ColumnProps {
  title: string;
  count: number;
  color: string;
  children: React.ReactNode;
  isLoading?: boolean;
  isError?: boolean;
  emptyMessage?: string;
}

function Column({ title, count, color, children, isLoading, isError, emptyMessage }: ColumnProps) {
  return (
    <div className="flex flex-col min-h-0" data-testid={`column-${title.toLowerCase().replace(' ', '-')}`}>
      <div className="flex items-center gap-2 mb-3">
        <div className={`w-3 h-3 rounded-full ${color}`} />
        <h3 className="font-medium text-gray-900">{title}</h3>
        <span className="text-sm text-gray-500">({count})</span>
      </div>
      <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
        {isLoading && (
          <div className="text-sm text-gray-500 p-3">Loading...</div>
        )}
        {isError && (
          <div className="text-sm text-red-600 p-3">Failed to load</div>
        )}
        {!isLoading && !isError && count === 0 && (
          <div className="text-sm text-gray-500 p-3 bg-gray-50 rounded-lg">
            {emptyMessage || 'No items'}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

export function TaskFlowPage() {
  const readyTasks = useReadyTasks();
  const blockedTasks = useBlockedTasks();
  const completedTasks = useCompletedTasks();

  return (
    <div className="h-full flex flex-col" data-testid="task-flow-page">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-medium text-gray-900">Task Flow</h2>
        <p className="text-sm text-gray-500">
          Real-time view of task states
        </p>
      </div>

      <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-6 min-h-0">
        {/* Ready Tasks Column */}
        <Column
          title="Ready"
          count={readyTasks.data?.length ?? 0}
          color="bg-green-500"
          isLoading={readyTasks.isLoading}
          isError={readyTasks.isError}
          emptyMessage="No tasks ready to work on"
        >
          {readyTasks.data?.map((task) => (
            <TaskCard key={task.id} task={task} />
          ))}
        </Column>

        {/* Blocked Tasks Column */}
        <Column
          title="Blocked"
          count={blockedTasks.data?.length ?? 0}
          color="bg-red-500"
          isLoading={blockedTasks.isLoading}
          isError={blockedTasks.isError}
          emptyMessage="No blocked tasks"
        >
          {blockedTasks.data?.map((task) => (
            <TaskCard key={task.id} task={task} showBlockReason />
          ))}
        </Column>

        {/* Completed Tasks Column */}
        <Column
          title="Completed"
          count={completedTasks.data?.length ?? 0}
          color="bg-blue-500"
          isLoading={completedTasks.isLoading}
          isError={completedTasks.isError}
          emptyMessage="No recently completed tasks"
        >
          {completedTasks.data?.map((task) => (
            <CompletedTaskCard key={task.id} task={task} />
          ))}
        </Column>
      </div>
    </div>
  );
}

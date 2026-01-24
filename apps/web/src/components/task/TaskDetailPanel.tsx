import { useQuery } from '@tanstack/react-query';
import { X, Calendar, User, Tag, Clock, Link2, AlertTriangle, CheckCircle2 } from 'lucide-react';

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

export function TaskDetailPanel({ taskId, onClose }: TaskDetailPanelProps) {
  const { data: task, isLoading, isError, error } = useTaskDetail(taskId);

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

  const priority = PRIORITY_LABELS[task.priority] || PRIORITY_LABELS[3];
  const status = STATUS_CONFIG[task.status] || STATUS_CONFIG.open;
  const complexity = COMPLEXITY_LABELS[task.complexity] || COMPLEXITY_LABELS[3];

  // Separate dependencies by type
  const blockers = task._dependencies.filter(d => d.type === 'blocks' || d.type === 'awaits');
  const blocking = task._dependents.filter(d => d.type === 'blocks' || d.type === 'awaits');

  return (
    <div className="h-full flex flex-col bg-white" data-testid="task-detail-panel">
      {/* Header */}
      <div className="flex items-start justify-between p-4 border-b border-gray-200">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded ${status.color}`}>
              {status.icon}
              {status.label}
            </span>
            <span className={`px-2 py-0.5 text-xs font-medium rounded border ${priority.color}`}>
              {priority.label}
            </span>
          </div>
          <h2 className="text-lg font-semibold text-gray-900 truncate" data-testid="task-detail-title">
            {task.title}
          </h2>
          <div className="flex items-center gap-2 mt-1 text-xs text-gray-500 font-mono">
            <span data-testid="task-detail-id">{task.id}</span>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
          aria-label="Close panel"
          data-testid="task-detail-close"
        >
          <X className="w-5 h-5" />
        </button>
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
            <div className="text-sm text-gray-900">{complexity}</div>
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
      </div>
    </div>
  );
}

/**
 * Agent Activity Lens
 *
 * Shows agent cards with their current assigned tasks and workload distribution.
 * Features: status indicators, tasks completed today, clickable navigation to entity detail.
 */

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Clock, CheckCircle, ArrowRight, AlertTriangle } from 'lucide-react';
import { useTrackDashboardSection } from '../hooks/useTrackDashboardSection';

interface Entity {
  id: string;
  type: 'entity';
  name: string;
  entityType: 'agent' | 'human' | 'system';
  publicKey?: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

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

interface EntityStats {
  assignedTaskCount: number;
  activeTaskCount: number;
  completedTaskCount: number;
  completedTodayCount: number;
  blockedTaskCount: number;
  inProgressTaskCount: number;
  createdTaskCount: number;
  messageCount: number;
  documentCount: number;
}

function useEntities() {
  return useQuery<Entity[]>({
    queryKey: ['entities'],
    queryFn: async () => {
      const response = await fetch('/api/entities');
      if (!response.ok) throw new Error('Failed to fetch entities');
      const data = await response.json();
      // Handle paginated response format
      return data.items || data;
    },
  });
}

function useEntityTasks(entityId: string) {
  return useQuery<Task[]>({
    queryKey: ['entities', entityId, 'tasks'],
    queryFn: async () => {
      const response = await fetch(`/api/entities/${entityId}/tasks`);
      if (!response.ok) throw new Error('Failed to fetch entity tasks');
      return response.json();
    },
    enabled: !!entityId,
  });
}

function useEntityStats(entityId: string) {
  return useQuery<EntityStats>({
    queryKey: ['entities', entityId, 'stats'],
    queryFn: async () => {
      const response = await fetch(`/api/entities/${entityId}/stats`);
      if (!response.ok) throw new Error('Failed to fetch entity stats');
      return response.json();
    },
    enabled: !!entityId,
    refetchInterval: 60000, // Refresh stats every minute
  });
}

const ENTITY_TYPE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  agent: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
  human: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  system: { bg: 'bg-gray-50', text: 'text-gray-700', border: 'border-gray-200' },
};

const PRIORITY_LABELS: Record<number, { label: string; color: string }> = {
  1: { label: 'Critical', color: 'text-red-600' },
  2: { label: 'High', color: 'text-orange-600' },
  3: { label: 'Medium', color: 'text-yellow-600' },
  4: { label: 'Low', color: 'text-green-600' },
  5: { label: 'Trivial', color: 'text-gray-500' },
};

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-blue-100 text-blue-800',
  in_progress: 'bg-yellow-100 text-yellow-800',
  blocked: 'bg-red-100 text-red-800',
  completed: 'bg-green-100 text-green-800',
  cancelled: 'bg-gray-100 text-gray-800',
};

type AgentStatus = 'idle' | 'working' | 'blocked';

function getAgentStatus(stats: EntityStats | undefined, inProgressTask: Task | undefined): AgentStatus {
  if (!stats) return 'idle';
  if (stats.blockedTaskCount > 0 && stats.inProgressTaskCount === 0) return 'blocked';
  if (inProgressTask || stats.inProgressTaskCount > 0) return 'working';
  return 'idle';
}

const AGENT_STATUS_STYLES: Record<AgentStatus, { dot: string; label: string; labelColor: string }> = {
  idle: { dot: 'bg-gray-400', label: 'Idle', labelColor: 'text-gray-500' },
  working: { dot: 'bg-green-500 animate-pulse', label: 'Working', labelColor: 'text-green-600' },
  blocked: { dot: 'bg-yellow-500', label: 'Blocked', labelColor: 'text-yellow-600' },
};

function formatTimeElapsed(dateStr: string): string {
  const start = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - start.getTime();

  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

function TaskMiniCard({ task, showTimeElapsed }: { task: Task; showTimeElapsed?: boolean }) {
  const [, setTick] = useState(0);
  const priority = PRIORITY_LABELS[task.priority] || PRIORITY_LABELS[3];
  const statusColor = STATUS_COLORS[task.status] || STATUS_COLORS.open;

  // Update time elapsed every minute
  useEffect(() => {
    if (!showTimeElapsed) return;
    const interval = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(interval);
  }, [showTimeElapsed]);

  return (
    <div className="p-2 bg-white rounded border border-gray-100 hover:border-gray-200">
      <div className="flex items-start gap-2">
        <span className={`px-1.5 py-0.5 text-xs font-medium rounded ${statusColor}`}>
          {task.status.replace('_', ' ')}
        </span>
        <span className={`text-xs ${priority.color}`}>P{task.priority}</span>
        {showTimeElapsed && task.status === 'in_progress' && (
          <span className="ml-auto flex items-center gap-1 text-xs text-gray-500">
            <Clock className="w-3 h-3" />
            {formatTimeElapsed(task.updatedAt)}
          </span>
        )}
      </div>
      <p className="mt-1 text-sm text-gray-900 line-clamp-2">{task.title}</p>
      <p className="mt-1 text-xs text-gray-500 font-mono">{task.id}</p>
    </div>
  );
}

function AgentStatusIndicator({ status }: { status: AgentStatus }) {
  const style = AGENT_STATUS_STYLES[status];

  return (
    <div className="flex items-center gap-1.5" data-testid="agent-status-indicator">
      <div className={`w-2 h-2 rounded-full ${style.dot}`} data-testid={`agent-status-dot-${status}`} />
      <span className={`text-xs font-medium ${style.labelColor}`}>{style.label}</span>
    </div>
  );
}

function AgentCard({ entity, onClick }: { entity: Entity; onClick: () => void }) {
  const entityTasks = useEntityTasks(entity.id);
  const entityStats = useEntityStats(entity.id);
  const colors = ENTITY_TYPE_COLORS[entity.entityType] || ENTITY_TYPE_COLORS.system;

  const activeTasks = entityTasks.data?.filter(
    (task) => task.status !== 'completed' && task.status !== 'cancelled' && task.status !== 'closed'
  ) || [];

  const inProgressTask = activeTasks.find((task) => task.status === 'in_progress');
  const agentStatus = getAgentStatus(entityStats.data, inProgressTask);
  const completedToday = entityStats.data?.completedTodayCount ?? 0;

  return (
    <div
      onClick={onClick}
      className={`rounded-lg border ${colors.border} ${colors.bg} p-4 cursor-pointer hover:shadow-md transition-shadow`}
      data-testid={`agent-card-${entity.id}`}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className={`font-medium ${colors.text} truncate`}>{entity.name}</h3>
            <ArrowRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
          </div>
          <p className="text-xs text-gray-500 font-mono truncate">{entity.id}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className={`px-2 py-0.5 text-xs font-medium rounded ${colors.bg} ${colors.text} border ${colors.border}`}>
            {entity.entityType}
          </span>
          <AgentStatusIndicator status={agentStatus} />
        </div>
      </div>

      {/* Stats Row */}
      <div className="flex gap-4 mb-3 text-sm">
        <div>
          <span className="text-gray-500">Active:</span>{' '}
          <span className="font-medium text-gray-900">{activeTasks.length}</span>
        </div>
        <div className="flex items-center gap-1">
          <CheckCircle className="w-3.5 h-3.5 text-green-500" />
          <span className="text-gray-500">Today:</span>{' '}
          <span className="font-medium text-green-600" data-testid={`completed-today-${entity.id}`}>
            {completedToday}
          </span>
        </div>
        {entityStats.data && entityStats.data.blockedTaskCount > 0 && (
          <div className="flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5 text-yellow-500" />
            <span className="text-gray-500">Blocked:</span>{' '}
            <span className="font-medium text-yellow-600">{entityStats.data.blockedTaskCount}</span>
          </div>
        )}
      </div>

      {/* Current Task (in progress) with Time Elapsed */}
      {inProgressTask && (
        <div className="mb-3">
          <div className="text-xs text-gray-500 mb-1.5 flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            Current Task
          </div>
          <TaskMiniCard task={inProgressTask} showTimeElapsed />
        </div>
      )}

      {/* Tasks List */}
      <div className="space-y-2">
        {entityTasks.isLoading && (
          <div className="text-xs text-gray-500">Loading tasks...</div>
        )}
        {entityTasks.isError && (
          <div className="text-xs text-red-600">Failed to load tasks</div>
        )}
        {!inProgressTask && activeTasks.length === 0 && !entityTasks.isLoading && (
          <div className="text-xs text-gray-500 py-2">No active tasks</div>
        )}
        {/* Show other active tasks (not the current in-progress one) */}
        {activeTasks.filter(t => t.id !== inProgressTask?.id).slice(0, 2).map((task) => (
          <TaskMiniCard key={task.id} task={task} />
        ))}
        {activeTasks.filter(t => t.id !== inProgressTask?.id).length > 2 && (
          <div className="text-xs text-gray-500 text-center">
            +{activeTasks.filter(t => t.id !== inProgressTask?.id).length - 2} more tasks
          </div>
        )}
      </div>
    </div>
  );
}

function WorkloadChart({ entities, tasksByEntity }: { entities: Entity[]; tasksByEntity: Map<string, number> }) {
  const maxTasks = Math.max(...Array.from(tasksByEntity.values()), 1);
  const totalTasks = Array.from(tasksByEntity.values()).reduce((sum, count) => sum + count, 0);

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <h3 className="font-medium text-gray-900 mb-4">Workload Distribution</h3>
      <div className="space-y-3" data-testid="workload-chart">
        {entities.map((entity) => {
          const taskCount = tasksByEntity.get(entity.id) || 0;
          const percentage = maxTasks > 0 ? (taskCount / maxTasks) * 100 : 0;
          const sharePercentage = totalTasks > 0 ? Math.round((taskCount / totalTasks) * 100) : 0;
          const colors = ENTITY_TYPE_COLORS[entity.entityType] || ENTITY_TYPE_COLORS.system;

          return (
            <div key={entity.id} data-testid={`workload-bar-${entity.id}`}>
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="text-gray-700 truncate">{entity.name}</span>
                <span className="text-gray-500 flex-shrink-0 ml-2">
                  {taskCount} task{taskCount !== 1 ? 's' : ''} ({sharePercentage}%)
                </span>
              </div>
              <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full ${colors.text.replace('text-', 'bg-')} rounded-full transition-all duration-300`}
                  style={{ width: `${percentage}%` }}
                />
              </div>
            </div>
          );
        })}
        {entities.length === 0 && (
          <div className="text-sm text-gray-500 text-center py-2">No agents to display</div>
        )}
      </div>
    </div>
  );
}

export function AgentActivityPage() {
  // Track this dashboard section visit
  useTrackDashboardSection('agents');

  const navigate = useNavigate();
  const entities = useEntities();

  // Compute task counts per entity (from ready tasks)
  const { data: readyTasks } = useQuery<Task[]>({
    queryKey: ['tasks', 'ready'],
    queryFn: async () => {
      const response = await fetch('/api/tasks/ready');
      if (!response.ok) throw new Error('Failed to fetch ready tasks');
      return response.json();
    },
  });

  const tasksByEntity = new Map<string, number>();
  readyTasks?.forEach((task) => {
    if (task.assignee) {
      tasksByEntity.set(task.assignee, (tasksByEntity.get(task.assignee) || 0) + 1);
    }
  });

  // Filter for agents only (not system entities)
  const agents = entities.data?.filter((e) => e.entityType === 'agent' || e.entityType === 'human') || [];

  const handleAgentClick = (entityId: string) => {
    // Navigate to entities page with entity selected via URL search params
    // The entities page uses state, but we can navigate and it will show the entity list
    navigate({ to: '/entities', search: { selected: entityId, name: undefined, page: 1, limit: 25 } });
  };

  return (
    <div className="h-full flex flex-col" data-testid="agent-activity-page">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-medium text-gray-900">Agent Activity</h2>
        <p className="text-sm text-gray-500">
          {agents.length} agent{agents.length !== 1 ? 's' : ''} active
        </p>
      </div>

      {entities.isLoading && (
        <div className="text-gray-500">Loading agents...</div>
      )}

      {entities.isError && (
        <div className="text-red-600">Failed to load agents</div>
      )}

      {entities.data && agents.length === 0 && (
        <div className="bg-white rounded-lg shadow p-6 text-center text-gray-500">
          No agents registered. Use `el entity register` to add an agent.
        </div>
      )}

      {agents.length > 0 && (
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6 min-h-0">
          {/* Agent Cards Grid */}
          <div className="lg:col-span-2 space-y-4 overflow-y-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4" data-testid="agent-grid">
              {agents.map((entity) => (
                <AgentCard
                  key={entity.id}
                  entity={entity}
                  onClick={() => handleAgentClick(entity.id)}
                />
              ))}
            </div>
          </div>

          {/* Workload Chart */}
          <div className="space-y-4">
            <WorkloadChart entities={agents} tasksByEntity={tasksByEntity} />

            {/* Quick Stats */}
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h3 className="font-medium text-gray-900 mb-3">Summary</h3>
              <div className="space-y-2 text-sm" data-testid="summary-stats">
                <div className="flex justify-between">
                  <span className="text-gray-500">Total Agents</span>
                  <span className="font-medium">{agents.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Ready Tasks</span>
                  <span className="font-medium">{readyTasks?.length || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Assigned</span>
                  <span className="font-medium">{readyTasks?.filter((t) => t.assignee).length || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Unassigned</span>
                  <span className="font-medium">{readyTasks?.filter((t) => !t.assignee).length || 0}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

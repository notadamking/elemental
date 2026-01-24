/**
 * Agent Activity Lens
 *
 * Shows agent cards with their current assigned tasks and workload distribution.
 */

import { useQuery } from '@tanstack/react-query';

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

function TaskMiniCard({ task }: { task: Task }) {
  const priority = PRIORITY_LABELS[task.priority] || PRIORITY_LABELS[3];
  const statusColor = STATUS_COLORS[task.status] || STATUS_COLORS.open;

  return (
    <div className="p-2 bg-white rounded border border-gray-100 hover:border-gray-200">
      <div className="flex items-start gap-2">
        <span className={`px-1.5 py-0.5 text-xs font-medium rounded ${statusColor}`}>
          {task.status.replace('_', ' ')}
        </span>
        <span className={`text-xs ${priority.color}`}>P{task.priority}</span>
      </div>
      <p className="mt-1 text-sm text-gray-900 line-clamp-2">{task.title}</p>
      <p className="mt-1 text-xs text-gray-500 font-mono">{task.id}</p>
    </div>
  );
}

function AgentCard({ entity }: { entity: Entity }) {
  const entityTasks = useEntityTasks(entity.id);
  const colors = ENTITY_TYPE_COLORS[entity.entityType] || ENTITY_TYPE_COLORS.system;

  const activeTasks = entityTasks.data?.filter(
    (task) => task.status !== 'completed' && task.status !== 'cancelled'
  ) || [];
  const completedTasks = entityTasks.data?.filter(
    (task) => task.status === 'completed' || task.status === 'cancelled'
  ) || [];

  return (
    <div
      className={`rounded-lg border ${colors.border} ${colors.bg} p-4`}
      data-testid={`agent-card-${entity.id}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <h3 className={`font-medium ${colors.text}`}>{entity.name}</h3>
          <p className="text-xs text-gray-500 font-mono">{entity.id}</p>
        </div>
        <span className={`px-2 py-0.5 text-xs font-medium rounded ${colors.bg} ${colors.text} border ${colors.border}`}>
          {entity.entityType}
        </span>
      </div>

      {/* Stats */}
      <div className="flex gap-4 mb-3 text-sm">
        <div>
          <span className="text-gray-500">Active:</span>{' '}
          <span className="font-medium text-gray-900">{activeTasks.length}</span>
        </div>
        <div>
          <span className="text-gray-500">Done:</span>{' '}
          <span className="font-medium text-gray-900">{completedTasks.length}</span>
        </div>
      </div>

      {/* Tasks List */}
      <div className="space-y-2">
        {entityTasks.isLoading && (
          <div className="text-xs text-gray-500">Loading tasks...</div>
        )}
        {entityTasks.isError && (
          <div className="text-xs text-red-600">Failed to load tasks</div>
        )}
        {activeTasks.length === 0 && !entityTasks.isLoading && (
          <div className="text-xs text-gray-500 py-2">No active tasks</div>
        )}
        {activeTasks.slice(0, 3).map((task) => (
          <TaskMiniCard key={task.id} task={task} />
        ))}
        {activeTasks.length > 3 && (
          <div className="text-xs text-gray-500 text-center">
            +{activeTasks.length - 3} more tasks
          </div>
        )}
      </div>
    </div>
  );
}

function WorkloadChart({ entities, tasksByEntity }: { entities: Entity[]; tasksByEntity: Map<string, number> }) {
  const maxTasks = Math.max(...Array.from(tasksByEntity.values()), 1);

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <h3 className="font-medium text-gray-900 mb-4">Workload Distribution</h3>
      <div className="space-y-3">
        {entities.map((entity) => {
          const taskCount = tasksByEntity.get(entity.id) || 0;
          const percentage = (taskCount / maxTasks) * 100;
          const colors = ENTITY_TYPE_COLORS[entity.entityType] || ENTITY_TYPE_COLORS.system;

          return (
            <div key={entity.id}>
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="text-gray-700">{entity.name}</span>
                <span className="text-gray-500">{taskCount} tasks</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full ${colors.text.replace('text-', 'bg-')} rounded-full transition-all`}
                  style={{ width: `${percentage}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function AgentActivityPage() {
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
                <AgentCard key={entity.id} entity={entity} />
              ))}
            </div>
          </div>

          {/* Workload Chart */}
          <div className="space-y-4">
            <WorkloadChart entities={agents} tasksByEntity={tasksByEntity} />

            {/* Quick Stats */}
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h3 className="font-medium text-gray-900 mb-3">Summary</h3>
              <div className="space-y-2 text-sm">
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

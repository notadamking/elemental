import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Plus, Zap, ListTodo, CheckCircle, Clock, AlertCircle, Users, Bot, Activity, FileText, MessageSquare, ArrowRight } from 'lucide-react';

interface StatsResponse {
  totalElements: number;
  elementsByType: Record<string, number>;
  totalDependencies: number;
  totalEvents: number;
  readyTasks: number;
  blockedTasks: number;
  databaseSize: number;
  computedAt: string;
}

interface HealthResponse {
  status: string;
  timestamp: string;
  database: string;
  websocket?: {
    clients: number;
    broadcasting: boolean;
  };
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

function useStats() {
  return useQuery<StatsResponse>({
    queryKey: ['stats'],
    queryFn: async () => {
      const response = await fetch('/api/stats');
      if (!response.ok) throw new Error('Failed to fetch stats');
      return response.json();
    },
  });
}

function useHealth() {
  return useQuery<HealthResponse>({
    queryKey: ['health'],
    queryFn: async () => {
      const response = await fetch('/api/health');
      if (!response.ok) throw new Error('Failed to fetch health');
      return response.json();
    },
    refetchInterval: 30000,
  });
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

interface ElementalEvent {
  id: number;
  elementId: string;
  elementType: string;
  eventType: string;
  actor: string;
  oldValue?: unknown;
  newValue?: unknown;
  createdAt: string;
}

interface Entity {
  id: string;
  name: string;
  entityType: 'agent' | 'human' | 'system';
  active?: boolean;
}

function useRecentEvents() {
  return useQuery<ElementalEvent[]>({
    queryKey: ['events', 'recent'],
    queryFn: async () => {
      const response = await fetch('/api/events?limit=10');
      if (!response.ok) throw new Error('Failed to fetch events');
      return response.json();
    },
    refetchInterval: 30000,
  });
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

function useCompletedTodayCount() {
  return useQuery<number>({
    queryKey: ['tasks', 'completedToday'],
    queryFn: async () => {
      const response = await fetch('/api/tasks');
      if (!response.ok) throw new Error('Failed to fetch tasks');
      const tasks = await response.json();

      // Get today's start timestamp
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStart = today.toISOString();

      // Count tasks completed today
      const completed = tasks.filter((task: Task & { closedAt?: string }) => {
        if (task.status !== 'closed') return false;
        const closedAt = task.closedAt || task.updatedAt;
        return closedAt >= todayStart;
      });

      return completed.length;
    },
  });
}

// StatsCard component for displaying stats - used in metrics overview
function _StatsCard({ title, value, subtitle }: { title: string; value: string | number; subtitle?: string }) {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide">{title}</h3>
      <p className="mt-2 text-3xl font-semibold text-gray-900">{value}</p>
      {subtitle && <p className="mt-1 text-sm text-gray-500">{subtitle}</p>}
    </div>
  );
}
export { _StatsCard as StatsCard };

const PRIORITY_LABELS: Record<number, { label: string; color: string }> = {
  1: { label: 'Critical', color: 'bg-red-100 text-red-800' },
  2: { label: 'High', color: 'bg-orange-100 text-orange-800' },
  3: { label: 'Medium', color: 'bg-yellow-100 text-yellow-800' },
  4: { label: 'Low', color: 'bg-green-100 text-green-800' },
  5: { label: 'Trivial', color: 'bg-gray-100 text-gray-800' },
};

const TASK_TYPE_COLORS: Record<string, string> = {
  bug: 'bg-red-50 border-red-200 text-red-700',
  feature: 'bg-purple-50 border-purple-200 text-purple-700',
  task: 'bg-blue-50 border-blue-200 text-blue-700',
  chore: 'bg-gray-50 border-gray-200 text-gray-700',
};

function TaskCard({ task }: { task: Task }) {
  const priority = PRIORITY_LABELS[task.priority] || PRIORITY_LABELS[3];
  const typeColor = TASK_TYPE_COLORS[task.taskType] || TASK_TYPE_COLORS.task;

  return (
    <div className={`p-4 rounded-lg border ${typeColor}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-gray-900 truncate">{task.title}</h4>
          <p className="text-xs text-gray-500 mt-1 font-mono">{task.id}</p>
        </div>
        <span className={`px-2 py-0.5 text-xs font-medium rounded ${priority.color}`}>
          {priority.label}
        </span>
      </div>
      <div className="mt-3 flex items-center gap-2 flex-wrap">
        <span className="text-xs text-gray-600 capitalize">{task.taskType}</span>
        {task.assignee && (
          <span className="text-xs text-gray-500">Assigned: {task.assignee}</span>
        )}
        {task.tags.length > 0 && (
          <div className="flex gap-1">
            {task.tags.slice(0, 3).map((tag) => (
              <span key={tag} className="px-1.5 py-0.5 text-xs bg-gray-200 rounded">
                {tag}
              </span>
            ))}
            {task.tags.length > 3 && (
              <span className="text-xs text-gray-500">+{task.tags.length - 3}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ReadyTasksList() {
  const readyTasks = useReadyTasks();

  return (
    <div className="mt-8">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-md font-medium text-gray-900">Ready Tasks</h3>
        <Link to="/tasks" search={{ page: 1, limit: 25 }} className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1">
          View all <ArrowRight className="w-4 h-4" />
        </Link>
      </div>

      {readyTasks.isLoading && (
        <div className="text-gray-500">Loading ready tasks...</div>
      )}

      {readyTasks.isError && (
        <div className="text-red-600">Failed to load ready tasks</div>
      )}

      {readyTasks.data && readyTasks.data.length === 0 && (
        <div className="bg-white rounded-lg shadow p-6 text-center text-gray-500">
          No ready tasks available. All tasks are either blocked or completed.
        </div>
      )}

      {readyTasks.data && readyTasks.data.length > 0 && (
        <div className="space-y-3">
          {readyTasks.data.slice(0, 5).map((task) => (
            <TaskCard key={task.id} task={task} />
          ))}
          {readyTasks.data.length > 5 && (
            <Link to="/tasks" search={{ page: 1, limit: 25 }} className="block text-center text-sm text-blue-600 hover:text-blue-700 py-2">
              View {readyTasks.data.length - 5} more ready tasks
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

const EVENT_TYPE_ICONS: Record<string, typeof Activity> = {
  created: Plus,
  updated: Activity,
  deleted: AlertCircle,
};

const ELEMENT_TYPE_ICONS: Record<string, typeof Activity> = {
  task: ListTodo,
  entity: Users,
  document: FileText,
  message: MessageSquare,
};

function getRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function RecentActivityFeed() {
  const events = useRecentEvents();

  return (
    <div className="mt-8" data-testid="recent-activity">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-md font-medium text-gray-900">Recent Activity</h3>
        <Link to="/dashboard/timeline" className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1">
          View all <ArrowRight className="w-4 h-4" />
        </Link>
      </div>

      {events.isLoading && (
        <div className="text-gray-500">Loading activity...</div>
      )}

      {events.isError && (
        <div className="text-red-600">Failed to load activity</div>
      )}

      {events.data && events.data.length === 0 && (
        <div className="bg-white rounded-lg shadow p-6 text-center text-gray-500">
          No recent activity
        </div>
      )}

      {events.data && events.data.length > 0 && (
        <div className="bg-white rounded-lg shadow divide-y divide-gray-100" data-testid="activity-list">
          {events.data.map((event) => {
            const EventIcon = EVENT_TYPE_ICONS[event.eventType] || Activity;
            const ElementIcon = ELEMENT_TYPE_ICONS[event.elementType] || Activity;
            return (
              <div key={event.id} className="p-4 flex items-start gap-3" data-testid={`activity-item-${event.id}`}>
                <div className="p-2 rounded-full bg-gray-100">
                  <EventIcon className="w-4 h-4 text-gray-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <ElementIcon className="w-4 h-4 text-gray-400" />
                    <span className="text-sm font-medium text-gray-900 capitalize">{event.eventType}</span>
                    <span className="text-sm text-gray-500">{event.elementType}</span>
                  </div>
                  <p className="text-xs text-gray-500 font-mono mt-0.5">{event.elementId}</p>
                  <p className="text-xs text-gray-400 mt-1">{getRelativeTime(event.createdAt)}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function QuickActions() {
  return (
    <div className="mt-8" data-testid="quick-actions">
      <h3 className="text-md font-medium text-gray-900 mb-4">Quick Actions</h3>
      <div className="flex flex-wrap gap-3">
        <Link
          to="/tasks"
          search={{ page: 1, limit: 25 }}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          data-testid="quick-action-create-task"
        >
          <Plus className="w-4 h-4" />
          Create Task
        </Link>
        <Link
          to="/workflows"
          className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 transition-colors"
          data-testid="quick-action-pour-workflow"
        >
          <Zap className="w-4 h-4" />
          Pour Workflow
        </Link>
        <Link
          to="/tasks"
          search={{ page: 1, limit: 25 }}
          className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors"
          data-testid="quick-action-view-tasks"
        >
          <ListTodo className="w-4 h-4" />
          View Ready Tasks
        </Link>
      </div>
    </div>
  );
}

function MetricsOverview() {
  const stats = useStats();
  const entities = useEntities();
  const completedToday = useCompletedTodayCount();

  // Calculate active agents
  const activeAgents = (entities.data || []).filter(
    (e) => e.entityType === 'agent' && e.active !== false
  ).length;

  // Calculate ready vs blocked ratio
  const readyCount = stats.data?.readyTasks || 0;
  const blockedCount = stats.data?.blockedTasks || 0;
  const totalTasks = readyCount + blockedCount;
  const readyRatio = totalTasks > 0 ? Math.round((readyCount / totalTasks) * 100) : 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6" data-testid="metrics-overview">
      <div className="bg-white rounded-lg shadow p-6" data-testid="metric-total-tasks">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-full bg-blue-100">
            <ListTodo className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <p className="text-sm text-gray-500">Total Tasks</p>
            <p className="text-2xl font-semibold text-gray-900">
              {stats.isLoading ? '...' : totalTasks}
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-6" data-testid="metric-ready-ratio">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-full bg-green-100">
            <CheckCircle className="w-6 h-6 text-green-600" />
          </div>
          <div>
            <p className="text-sm text-gray-500">Ready vs Blocked</p>
            <p className="text-2xl font-semibold text-gray-900">
              {stats.isLoading ? '...' : `${readyRatio}%`}
            </p>
            <p className="text-xs text-gray-400">{readyCount} ready, {blockedCount} blocked</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-6" data-testid="metric-active-agents">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-full bg-purple-100">
            <Bot className="w-6 h-6 text-purple-600" />
          </div>
          <div>
            <p className="text-sm text-gray-500">Active Agents</p>
            <p className="text-2xl font-semibold text-gray-900">
              {entities.isLoading ? '...' : activeAgents}
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-6" data-testid="metric-completed-today">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-full bg-yellow-100">
            <Clock className="w-6 h-6 text-yellow-600" />
          </div>
          <div>
            <p className="text-sm text-gray-500">Completed Today</p>
            <p className="text-2xl font-semibold text-gray-900">
              {completedToday.isLoading ? '...' : completedToday.data || 0}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function DashboardPage() {
  const stats = useStats();
  const health = useHealth();

  return (
    <div data-testid="dashboard-page">
      <h2 className="text-lg font-medium text-gray-900 mb-6">Dashboard</h2>

      {/* Key Metrics Overview */}
      <MetricsOverview />

      {/* Quick Actions */}
      <QuickActions />

      {/* Two-column layout for Ready Tasks and Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Ready Tasks List */}
        <ReadyTasksList />

        {/* Recent Activity Feed */}
        <RecentActivityFeed />
      </div>

      {/* Element Types Breakdown */}
      {stats.data && Object.keys(stats.data.elementsByType).length > 0 && (
        <div className="mt-8">
          <h3 className="text-md font-medium text-gray-900 mb-4">Elements by Type</h3>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Object.entries(stats.data.elementsByType).map(([type, count]) => {
                const Icon = ELEMENT_TYPE_ICONS[type] || Activity;
                return (
                  <div key={type} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                    <Icon className="w-5 h-5 text-gray-400" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">{count}</p>
                      <p className="text-xs text-gray-500 capitalize">{type}s</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Server Info */}
      {health.data && (
        <div className="mt-8">
          <h3 className="text-md font-medium text-gray-900 mb-4">System Status</h3>
          <div className="bg-white rounded-lg shadow p-6">
            <dl className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <dt className="text-xs text-gray-500">Database</dt>
                <dd className="font-mono text-sm text-gray-700 truncate">{health.data.database}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Last Updated</dt>
                <dd className="text-sm text-gray-700">{new Date(health.data.timestamp).toLocaleTimeString()}</dd>
              </div>
              {health.data.websocket && (
                <>
                  <div>
                    <dt className="text-xs text-gray-500">WebSocket Clients</dt>
                    <dd className="text-sm text-gray-700">{health.data.websocket.clients}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-gray-500">Broadcasting</dt>
                    <dd className="text-sm text-gray-700">{health.data.websocket.broadcasting ? 'Active' : 'Inactive'}</dd>
                  </div>
                </>
              )}
            </dl>
          </div>
        </div>
      )}
    </div>
  );
}

import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Plus, Zap, ListTodo, CheckCircle, Clock, AlertCircle, Users, Bot, Activity, FileText, MessageSquare, ArrowRight } from 'lucide-react';
import { TaskCard } from '../components/entity/TaskCard';
import type { Task } from '../components/entity/types';
import { useTrackDashboardSection } from '../hooks/useTrackDashboardSection';
import { useGlobalQuickActions } from '../hooks';
import { DashboardCharts } from '../components/dashboard/DashboardCharts';

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
      const data = await response.json();
      // Handle paginated response format
      return data.items || data;
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
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6">
      <h3 className="text-xs sm:text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">{title}</h3>
      <p className="mt-1 sm:mt-2 text-2xl sm:text-3xl font-semibold text-gray-900 dark:text-gray-100">{value}</p>
      {subtitle && <p className="mt-1 text-xs sm:text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>}
    </div>
  );
}
export { _StatsCard as StatsCard };

function ReadyTasksList() {
  const readyTasks = useReadyTasks();

  return (
    <div className="mt-6 sm:mt-8">
      <div className="flex items-center justify-between mb-3 sm:mb-4">
        <h3 className="text-sm sm:text-md font-medium text-gray-900 dark:text-gray-100">Ready Tasks</h3>
        <Link to="/tasks" search={{ page: 1, limit: 25, readyOnly: true }} className="text-xs sm:text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1">
          View all <ArrowRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
        </Link>
      </div>

      {readyTasks.isLoading && (
        <div className="text-gray-500 dark:text-gray-400 text-sm">Loading ready tasks...</div>
      )}

      {readyTasks.isError && (
        <div className="text-red-600 text-sm">Failed to load ready tasks</div>
      )}

      {readyTasks.data && readyTasks.data.length === 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6 text-center text-gray-500 dark:text-gray-400 text-sm">
          No ready tasks available. All tasks are either blocked or completed.
        </div>
      )}

      {readyTasks.data && readyTasks.data.length > 0 && (
        <div className="space-y-2 sm:space-y-3">
          {readyTasks.data.slice(0, 5).map((task) => (
            <TaskCard key={task.id} task={task} />
          ))}
          {readyTasks.data.length > 5 && (
            <Link to="/tasks" search={{ page: 1, limit: 25, readyOnly: true }} className="block text-center text-xs sm:text-sm text-blue-600 hover:text-blue-700 py-2">
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
    <div className="mt-6 sm:mt-8" data-testid="recent-activity">
      <div className="flex items-center justify-between mb-3 sm:mb-4">
        <h3 className="text-sm sm:text-md font-medium text-gray-900 dark:text-gray-100">Recent Activity</h3>
        <Link to="/dashboard/timeline" search={{ page: 1, limit: 100, actor: undefined, startTime: undefined, endTime: undefined }} className="text-xs sm:text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1">
          View all <ArrowRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
        </Link>
      </div>

      {events.isLoading && (
        <div className="text-gray-500 dark:text-gray-400 text-sm">Loading activity...</div>
      )}

      {events.isError && (
        <div className="text-red-600 text-sm">Failed to load activity</div>
      )}

      {events.data && events.data.length === 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6 text-center text-gray-500 dark:text-gray-400 text-sm">
          No recent activity
        </div>
      )}

      {events.data && events.data.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow divide-y divide-gray-100 dark:divide-gray-700" data-testid="activity-list">
          {events.data.map((event) => {
            const EventIcon = EVENT_TYPE_ICONS[event.eventType] || Activity;
            const ElementIcon = ELEMENT_TYPE_ICONS[event.elementType] || Activity;
            return (
              <div key={event.id} className="p-3 sm:p-4 flex items-start gap-2 sm:gap-3" data-testid={`activity-item-${event.id}`}>
                <div className="p-1.5 sm:p-2 rounded-full bg-gray-100 dark:bg-gray-700 shrink-0">
                  <EventIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-600 dark:text-gray-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                    <ElementIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-500 dark:text-gray-400 shrink-0" />
                    <span className="text-xs sm:text-sm font-medium text-gray-900 dark:text-gray-100 capitalize">{event.eventType}</span>
                    <span className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">{event.elementType}</span>
                  </div>
                  <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 font-mono mt-0.5 truncate">{event.elementId}</p>
                  <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 mt-1">{getRelativeTime(event.createdAt)}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function QuickActions({
  onCreateTask,
  onPourWorkflow,
}: {
  onCreateTask: () => void;
  onPourWorkflow: () => void;
}) {
  return (
    <div className="mt-8" data-testid="quick-actions">
      <h3 className="text-md font-medium text-gray-900 dark:text-gray-100 mb-4">Quick Actions</h3>
      <div className="flex flex-wrap gap-3">
        <button
          onClick={onCreateTask}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          data-testid="quick-action-create-task"
        >
          <Plus className="w-4 h-4" />
          Create Task
          <kbd className="ml-1 text-xs bg-blue-800/50 text-white px-1 py-0.5 rounded">C T</kbd>
        </button>
        <button
          onClick={onPourWorkflow}
          className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 transition-colors"
          data-testid="quick-action-pour-workflow"
        >
          <Zap className="w-4 h-4" />
          Create Workflow
          <kbd className="ml-1 text-xs bg-purple-800/50 text-white px-1 py-0.5 rounded">C W</kbd>
        </button>
        <Link
          to="/tasks"
          search={{ page: 1, limit: 25, readyOnly: true }}
          className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 text-sm font-medium rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
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
    <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6" data-testid="metrics-overview">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-3 sm:p-4 lg:p-6" data-testid="metric-total-tasks">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="p-2 sm:p-3 rounded-full bg-blue-100 dark:bg-blue-900/30 shrink-0">
            <ListTodo className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="min-w-0">
            <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 truncate">Total Tasks</p>
            <p className="text-lg sm:text-xl lg:text-2xl font-semibold text-gray-900 dark:text-gray-100">
              {stats.isLoading ? '...' : totalTasks}
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-3 sm:p-4 lg:p-6" data-testid="metric-ready-ratio">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="p-2 sm:p-3 rounded-full bg-green-100 dark:bg-green-900/30 shrink-0">
            <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6 text-green-600 dark:text-green-400" />
          </div>
          <div className="min-w-0">
            <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 truncate">Ready vs Blocked</p>
            <p className="text-lg sm:text-xl lg:text-2xl font-semibold text-gray-900 dark:text-gray-100">
              {stats.isLoading ? '...' : `${readyRatio}%`}
            </p>
            <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 truncate">{readyCount} ready, {blockedCount} blocked</p>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-3 sm:p-4 lg:p-6" data-testid="metric-active-agents">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="p-2 sm:p-3 rounded-full bg-purple-100 dark:bg-purple-900/30 shrink-0">
            <Bot className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6 text-purple-600 dark:text-purple-400" />
          </div>
          <div className="min-w-0">
            <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 truncate">Active Agents</p>
            <p className="text-lg sm:text-xl lg:text-2xl font-semibold text-gray-900 dark:text-gray-100">
              {entities.isLoading ? '...' : activeAgents}
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-3 sm:p-4 lg:p-6" data-testid="metric-completed-today">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="p-2 sm:p-3 rounded-full bg-yellow-100 dark:bg-yellow-900/30 shrink-0">
            <Clock className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6 text-yellow-600 dark:text-yellow-400" />
          </div>
          <div className="min-w-0">
            <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 truncate">Completed Today</p>
            <p className="text-lg sm:text-xl lg:text-2xl font-semibold text-gray-900 dark:text-gray-100">
              {completedToday.isLoading ? '...' : completedToday.data || 0}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function DashboardPage() {
  // Track this dashboard section visit
  useTrackDashboardSection('overview');

  const stats = useStats();
  const health = useHealth();

  // Use global quick actions for C T and C W shortcuts
  const { openCreateTaskModal, openPourWorkflowModal } = useGlobalQuickActions();

  return (
    <div data-testid="dashboard-page">
      <h1 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-6">Dashboard</h1>

      {/* Key Metrics Overview */}
      <MetricsOverview />

      {/* Quick Actions */}
      <QuickActions
        onCreateTask={openCreateTaskModal}
        onPourWorkflow={openPourWorkflowModal}
      />

      {/* Dashboard Charts */}
      <DashboardCharts />

      {/* Two-column layout for Ready Tasks and Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 lg:gap-8">
        {/* Ready Tasks List */}
        <ReadyTasksList />

        {/* Recent Activity Feed */}
        <RecentActivityFeed />
      </div>

      {/* Element Types Breakdown */}
      {stats.data && Object.keys(stats.data.elementsByType).length > 0 && (
        <div className="mt-6 sm:mt-8">
          <h3 className="text-sm sm:text-md font-medium text-gray-900 dark:text-gray-100 mb-3 sm:mb-4">Elements by Type</h3>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
              {Object.entries(stats.data.elementsByType).map(([type, count]) => {
                const Icon = ELEMENT_TYPE_ICONS[type] || Activity;
                return (
                  <div key={type} className="flex items-center gap-2 sm:gap-3 p-2 sm:p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                    <Icon className="w-4 h-4 sm:w-5 sm:h-5 text-gray-500 dark:text-gray-400 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{count}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 capitalize truncate">{type === 'entity' ? 'Entities' : type === 'library' ? 'Libraries' : `${type}s`}</p>
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
        <div className="mt-6 sm:mt-8">
          <h3 className="text-sm sm:text-md font-medium text-gray-900 dark:text-gray-100 mb-3 sm:mb-4">System Status</h3>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6">
            <dl className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              <div className="min-w-0">
                <dt className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">Database</dt>
                <dd className="font-mono text-xs sm:text-sm text-gray-700 dark:text-gray-300 truncate">{health.data.database}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">Last Updated</dt>
                <dd className="text-xs sm:text-sm text-gray-700 dark:text-gray-300">{new Date(health.data.timestamp).toLocaleTimeString()}</dd>
              </div>
              {health.data.websocket && (
                <>
                  <div className="min-w-0">
                    <dt className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">WebSocket Clients</dt>
                    <dd className="text-xs sm:text-sm text-gray-700 dark:text-gray-300">{health.data.websocket.clients}</dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">Broadcasting</dt>
                    <dd className="text-xs sm:text-sm text-gray-700 dark:text-gray-300">{health.data.websocket.broadcasting ? 'Active' : 'Inactive'}</dd>
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

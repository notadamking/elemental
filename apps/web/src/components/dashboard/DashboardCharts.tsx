import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
  CartesianGrid,
} from 'recharts';
import type { Task } from '../entity/types';

// Types for chart data
interface TasksByStatusData {
  name: string;
  value: number;
  status: string;
}

interface CompletedOverTimeData {
  date: string;
  dateLabel: string;
  completed: number;
}

interface WorkloadByAgentData {
  name: string;
  entityId: string;
  tasks: number;
}

// Status colors matching the app's design tokens
const STATUS_COLORS: Record<string, string> = {
  open: 'var(--color-primary, #3b82f6)',
  in_progress: 'var(--color-warning, #eab308)',
  blocked: 'var(--color-error, #ef4444)',
  closed: 'var(--color-success, #22c55e)',
};

// Default colors for pie chart segments
const PIE_COLORS = ['#3b82f6', '#eab308', '#ef4444', '#22c55e'];

interface Entity {
  id: string;
  name: string;
  entityType: 'agent' | 'human' | 'system';
  active?: boolean;
}

// Hook to get all tasks for charts
function useAllTasks() {
  return useQuery<Task[]>({
    queryKey: ['tasks', 'all'],
    queryFn: async () => {
      const response = await fetch('/api/tasks?limit=10000');
      if (!response.ok) throw new Error('Failed to fetch tasks');
      const data = await response.json();
      // Handle paginated response format
      return data.items || data;
    },
  });
}

// Hook to get all entities for workload chart
function useAllEntities() {
  return useQuery<Entity[]>({
    queryKey: ['entities', 'all'],
    queryFn: async () => {
      const response = await fetch('/api/entities?limit=10000');
      if (!response.ok) throw new Error('Failed to fetch entities');
      const data = await response.json();
      return data.items || data;
    },
  });
}

// Calculate tasks by status from raw task data
function calculateTasksByStatus(tasks: Task[]): TasksByStatusData[] {
  const counts: Record<string, number> = {
    open: 0,
    in_progress: 0,
    blocked: 0,
    closed: 0,
  };

  tasks.forEach((task) => {
    if (counts[task.status] !== undefined) {
      counts[task.status]++;
    }
  });

  return Object.entries(counts)
    .map(([status, value]) => ({
      name: formatStatusName(status),
      value,
      status,
    }))
    .filter((d) => d.value > 0);
}

function formatStatusName(status: string): string {
  switch (status) {
    case 'open':
      return 'Open';
    case 'in_progress':
      return 'In Progress';
    case 'blocked':
      return 'Blocked';
    case 'closed':
      return 'Completed';
    default:
      return status;
  }
}

// Calculate tasks completed over time (last 7 days)
function calculateCompletedOverTime(tasks: Task[]): CompletedOverTimeData[] {
  const days: CompletedOverTimeData[] = [];
  const now = new Date();

  // Create buckets for last 7 days
  for (let i = 6; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    date.setHours(0, 0, 0, 0);

    const dateStr = date.toISOString().split('T')[0];
    const dayLabel = i === 0 ? 'Today' : i === 1 ? 'Yesterday' : date.toLocaleDateString('en-US', { weekday: 'short' });

    days.push({
      date: dateStr,
      dateLabel: dayLabel,
      completed: 0,
    });
  }

  // Count completed tasks per day
  tasks.forEach((task) => {
    if (task.status !== 'closed') return;

    // Use updatedAt as completion date
    const taskDate = new Date(task.updatedAt);
    taskDate.setHours(0, 0, 0, 0);
    const taskDateStr = taskDate.toISOString().split('T')[0];

    const dayBucket = days.find((d) => d.date === taskDateStr);
    if (dayBucket) {
      dayBucket.completed++;
    }
  });

  return days;
}

// Calculate workload by agent
function calculateWorkloadByAgent(
  tasks: Task[],
  entities: Entity[]
): WorkloadByAgentData[] {
  // Count tasks per assignee
  const assigneeCounts: Record<string, number> = {};

  tasks.forEach((task) => {
    // Only count active (non-completed) tasks
    if (task.status === 'closed') return;

    const assignee = task.assignee;
    if (assignee) {
      assigneeCounts[assignee] = (assigneeCounts[assignee] || 0) + 1;
    }
  });

  // Map to entity names
  const entityMap = new Map(entities.map((e) => [e.id, e]));

  return Object.entries(assigneeCounts)
    .map(([entityId, count]) => {
      const entity = entityMap.get(entityId);
      return {
        name: entity?.name || entityId.slice(0, 8),
        entityId,
        tasks: count,
      };
    })
    .sort((a, b) => b.tasks - a.tasks)
    .slice(0, 10); // Top 10 agents
}

// Custom tooltip for donut chart
function DonutTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: TasksByStatusData }> }) {
  if (!active || !payload?.length) return null;

  const data = payload[0].payload;
  return (
    <div className="bg-card p-2 rounded-lg shadow-lg border border-border">
      <p className="text-sm font-medium text-foreground">{data.name}</p>
      <p className="text-sm text-muted-foreground">{data.value} tasks</p>
    </div>
  );
}

// Custom tooltip for line chart
function LineChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) {
  if (!active || !payload?.length) return null;

  return (
    <div className="bg-card p-2 rounded-lg shadow-lg border border-border">
      <p className="text-sm font-medium text-foreground">{label}</p>
      <p className="text-sm text-muted-foreground">{payload[0].value} completed</p>
    </div>
  );
}

// Custom tooltip for bar chart
function BarChartTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: WorkloadByAgentData }> }) {
  if (!active || !payload?.length) return null;

  const data = payload[0].payload;
  return (
    <div className="bg-card p-2 rounded-lg shadow-lg border border-border">
      <p className="text-sm font-medium text-foreground">{data.name}</p>
      <p className="text-sm text-muted-foreground">{data.tasks} active tasks</p>
    </div>
  );
}

export function TasksByStatusChart() {
  const { data: tasks, isLoading, isError } = useAllTasks();

  if (isLoading) {
    return (
      <div className="bg-card rounded-lg shadow-sm p-6 border border-border" data-testid="tasks-by-status-chart">
        <h4 className="text-sm font-medium text-foreground mb-4">Tasks by Status</h4>
        <div className="h-48 flex items-center justify-center">
          <div className="animate-pulse text-muted-foreground">Loading chart...</div>
        </div>
      </div>
    );
  }

  if (isError || !tasks) {
    return (
      <div className="bg-card rounded-lg shadow-sm p-6 border border-border" data-testid="tasks-by-status-chart">
        <h4 className="text-sm font-medium text-foreground mb-4">Tasks by Status</h4>
        <div className="h-48 flex items-center justify-center">
          <div className="text-error">Failed to load chart data</div>
        </div>
      </div>
    );
  }

  const chartData = calculateTasksByStatus(tasks);
  const totalTasks = chartData.reduce((sum, d) => sum + d.value, 0);

  if (totalTasks === 0) {
    return (
      <div className="bg-card rounded-lg shadow-sm p-6 border border-border" data-testid="tasks-by-status-chart">
        <h4 className="text-sm font-medium text-foreground mb-4">Tasks by Status</h4>
        <div className="h-48 flex items-center justify-center">
          <div className="text-muted-foreground">No tasks to display</div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-lg shadow-sm p-6 border border-border" data-testid="tasks-by-status-chart">
      <h4 className="text-sm font-medium text-foreground mb-4">Tasks by Status</h4>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={40}
              outerRadius={70}
              dataKey="value"
              labelLine={false}
              label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
            >
              {chartData.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={STATUS_COLORS[entry.status] || PIE_COLORS[index % PIE_COLORS.length]}
                  data-testid={`chart-segment-${entry.status}`}
                />
              ))}
            </Pie>
            <Tooltip content={<DonutTooltip />} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-4 flex justify-center gap-4 flex-wrap" data-testid="chart-legend">
        {chartData.map((entry) => (
          <Link
            key={entry.status}
            to="/tasks"
            search={{ page: 1, limit: 25 }}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            data-testid={`legend-${entry.status}`}
          >
            <span
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: STATUS_COLORS[entry.status] }}
            />
            {entry.name}: {entry.value}
          </Link>
        ))}
      </div>
    </div>
  );
}

export function TasksCompletedOverTimeChart() {
  const { data: tasks, isLoading, isError } = useAllTasks();

  if (isLoading) {
    return (
      <div className="bg-card rounded-lg shadow-sm p-6 border border-border" data-testid="tasks-completed-chart">
        <h4 className="text-sm font-medium text-foreground mb-4">Tasks Completed (Last 7 Days)</h4>
        <div className="h-48 flex items-center justify-center">
          <div className="animate-pulse text-muted-foreground">Loading chart...</div>
        </div>
      </div>
    );
  }

  if (isError || !tasks) {
    return (
      <div className="bg-card rounded-lg shadow-sm p-6 border border-border" data-testid="tasks-completed-chart">
        <h4 className="text-sm font-medium text-foreground mb-4">Tasks Completed (Last 7 Days)</h4>
        <div className="h-48 flex items-center justify-center">
          <div className="text-error">Failed to load chart data</div>
        </div>
      </div>
    );
  }

  const chartData = calculateCompletedOverTime(tasks);
  const totalCompleted = chartData.reduce((sum, d) => sum + d.completed, 0);

  return (
    <div className="bg-card rounded-lg shadow-sm p-6 border border-border" data-testid="tasks-completed-chart">
      <h4 className="text-sm font-medium text-foreground mb-4">
        Tasks Completed (Last 7 Days)
        {totalCompleted > 0 && (
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            Total: {totalCompleted}
          </span>
        )}
      </h4>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border, #e5e7eb)" />
            <XAxis
              dataKey="dateLabel"
              tick={{ fontSize: 11, fill: 'var(--color-muted-foreground, #6b7280)' }}
              axisLine={{ stroke: 'var(--color-border, #e5e7eb)' }}
              tickLine={{ stroke: 'var(--color-border, #e5e7eb)' }}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fontSize: 11, fill: 'var(--color-muted-foreground, #6b7280)' }}
              axisLine={{ stroke: 'var(--color-border, #e5e7eb)' }}
              tickLine={{ stroke: 'var(--color-border, #e5e7eb)' }}
            />
            <Tooltip content={<LineChartTooltip />} />
            <Line
              type="monotone"
              dataKey="completed"
              stroke="var(--color-success, #22c55e)"
              strokeWidth={2}
              dot={{ fill: 'var(--color-success, #22c55e)', strokeWidth: 0, r: 4 }}
              activeDot={{ r: 6, fill: 'var(--color-success, #22c55e)' }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function WorkloadByAgentChart() {
  const { data: tasks, isLoading: tasksLoading, isError: tasksError } = useAllTasks();
  const { data: entities, isLoading: entitiesLoading, isError: entitiesError } = useAllEntities();

  const isLoading = tasksLoading || entitiesLoading;
  const isError = tasksError || entitiesError;

  if (isLoading) {
    return (
      <div className="bg-card rounded-lg shadow-sm p-6 border border-border" data-testid="workload-by-agent-chart">
        <h4 className="text-sm font-medium text-foreground mb-4">Workload by Agent</h4>
        <div className="h-48 flex items-center justify-center">
          <div className="animate-pulse text-muted-foreground">Loading chart...</div>
        </div>
      </div>
    );
  }

  if (isError || !tasks || !entities) {
    return (
      <div className="bg-card rounded-lg shadow-sm p-6 border border-border" data-testid="workload-by-agent-chart">
        <h4 className="text-sm font-medium text-foreground mb-4">Workload by Agent</h4>
        <div className="h-48 flex items-center justify-center">
          <div className="text-error">Failed to load chart data</div>
        </div>
      </div>
    );
  }

  const chartData = calculateWorkloadByAgent(tasks, entities);

  if (chartData.length === 0) {
    return (
      <div className="bg-card rounded-lg shadow-sm p-6 border border-border" data-testid="workload-by-agent-chart">
        <h4 className="text-sm font-medium text-foreground mb-4">Workload by Agent</h4>
        <div className="h-48 flex items-center justify-center">
          <div className="text-muted-foreground">No assigned tasks</div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-lg shadow-sm p-6 border border-border" data-testid="workload-by-agent-chart">
      <h4 className="text-sm font-medium text-foreground mb-4">Workload by Agent</h4>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border, #e5e7eb)" />
            <XAxis
              type="number"
              allowDecimals={false}
              tick={{ fontSize: 11, fill: 'var(--color-muted-foreground, #6b7280)' }}
              axisLine={{ stroke: 'var(--color-border, #e5e7eb)' }}
              tickLine={{ stroke: 'var(--color-border, #e5e7eb)' }}
            />
            <YAxis
              type="category"
              dataKey="name"
              tick={{ fontSize: 11, fill: 'var(--color-muted-foreground, #6b7280)' }}
              axisLine={{ stroke: 'var(--color-border, #e5e7eb)' }}
              tickLine={{ stroke: 'var(--color-border, #e5e7eb)' }}
              width={100}
            />
            <Tooltip content={<BarChartTooltip />} />
            <Bar
              dataKey="tasks"
              fill="var(--color-primary, #3b82f6)"
              radius={[0, 4, 4, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// Main charts grid component
export function DashboardCharts() {
  return (
    <div className="mt-8" data-testid="dashboard-charts">
      <h3 className="text-md font-medium text-foreground mb-4">Charts</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" data-testid="charts-grid">
        <TasksByStatusChart />
        <TasksCompletedOverTimeChart />
        <WorkloadByAgentChart />
      </div>
    </div>
  );
}

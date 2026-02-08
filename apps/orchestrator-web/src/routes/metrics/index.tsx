/**
 * Metrics Page - Visualize orchestrator performance
 * Charts for activity, throughput, merge success, and health incidents
 *
 * Uses shared visualization components from @elemental/ui/visualizations
 */

import { BarChart3, Calendar, TrendingUp, AlertCircle } from 'lucide-react';
import {
  StatusPieChart,
  TrendLineChart,
  HorizontalBarChart,
  type PieChartDataPoint,
  type LineChartDataPoint,
  type BarChartDataPoint,
} from '@elemental/ui/visualizations';
import { useTasksByStatus } from '../../api/hooks/useTasks';
import { useAgents } from '../../api/hooks/useAgents';
import { useMemo } from 'react';

// Status colors matching the app's design tokens
const STATUS_COLORS: Record<string, string> = {
  open: '#3b82f6',
  in_progress: '#eab308',
  blocked: '#ef4444',
  closed: '#22c55e',
  unassigned: '#6b7280',
};

export function MetricsPage() {
  const {
    unassigned,
    assigned,
    inProgress,
    blocked,
    closed,
    allTasks,
    isLoading: tasksLoading,
    error: tasksError,
  } = useTasksByStatus();

  const { data: agentsResponse, isLoading: agentsLoading, error: agentsError } = useAgents();
  const agents = agentsResponse?.agents ?? [];

  // Calculate task status distribution for pie chart
  const taskStatusData = useMemo((): PieChartDataPoint[] => {
    return [
      { name: 'Open', value: assigned.length, key: 'open', color: STATUS_COLORS.open },
      { name: 'In Progress', value: inProgress.length, key: 'in_progress', color: STATUS_COLORS.in_progress },
      { name: 'Blocked', value: blocked.length, key: 'blocked', color: STATUS_COLORS.blocked },
      { name: 'Completed', value: closed.length, key: 'closed', color: STATUS_COLORS.closed },
    ].filter(d => d.value > 0);
  }, [assigned.length, inProgress.length, blocked.length, closed.length]);

  // Calculate completed tasks over time (last 7 days) - placeholder data structure
  const completedOverTimeData = useMemo((): LineChartDataPoint[] => {
    // For now, return placeholder data since we don't have completion timestamps
    // In production, this would aggregate tasks by updatedAt date
    const days: LineChartDataPoint[] = [];
    const now = new Date();

    for (let i = 6; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dayLabel = i === 0 ? 'Today' : i === 1 ? 'Yesterday' : date.toLocaleDateString('en-US', { weekday: 'short' });

      // Count tasks completed on this day (simplified - uses random placeholder if no real data)
      const tasksOnDay = closed.filter(t => {
        const taskDate = new Date(t.updatedAt);
        taskDate.setHours(0, 0, 0, 0);
        const targetDate = new Date(date);
        targetDate.setHours(0, 0, 0, 0);
        return taskDate.getTime() === targetDate.getTime();
      }).length;

      days.push({
        label: dayLabel,
        value: tasksOnDay,
        date: date.toISOString().split('T')[0],
      });
    }

    return days;
  }, [closed]);

  // Calculate workload by agent for bar chart
  const workloadByAgentData = useMemo((): BarChartDataPoint[] => {
    const agentWorkload: Record<string, { name: string; count: number }> = {};

    // Count non-completed tasks per assignee
    const activeTasks = [...assigned, ...inProgress, ...blocked];
    activeTasks.forEach(task => {
      if (task.assignee) {
        const agent = agents.find(a => a.id === task.assignee);
        const name = agent?.name || task.assignee.slice(0, 8);
        if (!agentWorkload[task.assignee]) {
          agentWorkload[task.assignee] = { name, count: 0 };
        }
        agentWorkload[task.assignee].count++;
      }
    });

    // Calculate total and convert to data points
    const total = Object.values(agentWorkload).reduce((sum, { count }) => sum + count, 0);

    return Object.entries(agentWorkload)
      .map(([id, { name, count }]) => ({
        name,
        value: count,
        id,
        percentage: total > 0 ? Math.round((count / total) * 100) : 0,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [assigned, inProgress, blocked, agents]);

  const isLoading = tasksLoading || agentsLoading;
  const isError = !!(tasksError || agentsError);

  // Calculate summary stats
  const totalCompleted = closed.length;
  const activeAgents = agents.filter(a => a.metadata?.agent?.sessionStatus === 'running').length;

  return (
    <div className="space-y-6 animate-fade-in" data-testid="metrics-page">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-[var(--color-primary-muted)]">
            <BarChart3 className="w-5 h-5 text-[var(--color-primary)]" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-[var(--color-text)]">Metrics</h1>
            <p className="text-sm text-[var(--color-text-secondary)]">
              Performance analytics and health monitoring
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-[var(--color-text-secondary)] rounded-md border border-[var(--color-border)] hover:bg-[var(--color-surface-hover)] transition-colors duration-150"
            data-testid="metrics-timerange"
          >
            <Calendar className="w-4 h-4" />
            Last 7 days
          </button>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4" data-testid="stats-cards">
        <div className="p-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-card-bg)]" data-testid="stat-tasks-completed">
          <div className="flex items-center justify-between">
            <span className="text-sm text-[var(--color-text-secondary)]">Tasks Completed</span>
            <TrendingUp className="w-4 h-4 text-[var(--color-success)]" />
          </div>
          <div className="mt-2 text-2xl font-semibold text-[var(--color-text)]">{totalCompleted}</div>
          <div className="mt-1 text-xs text-[var(--color-text-tertiary)]">Total completed tasks</div>
        </div>

        <div className="p-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-card-bg)]" data-testid="stat-active-agents">
          <div className="flex items-center justify-between">
            <span className="text-sm text-[var(--color-text-secondary)]">Active Agents</span>
            <TrendingUp className="w-4 h-4 text-[var(--color-success)]" />
          </div>
          <div className="mt-2 text-2xl font-semibold text-[var(--color-text)]">{activeAgents}</div>
          <div className="mt-1 text-xs text-[var(--color-text-tertiary)]">Currently running</div>
        </div>

        <div className="p-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-card-bg)]" data-testid="stat-total-tasks">
          <div className="flex items-center justify-between">
            <span className="text-sm text-[var(--color-text-secondary)]">Total Tasks</span>
            <TrendingUp className="w-4 h-4 text-[var(--color-success)]" />
          </div>
          <div className="mt-2 text-2xl font-semibold text-[var(--color-text)]">{allTasks.length}</div>
          <div className="mt-1 text-xs text-[var(--color-text-tertiary)]">All tasks in system</div>
        </div>

        <div className="p-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-card-bg)]" data-testid="stat-unassigned">
          <div className="flex items-center justify-between">
            <span className="text-sm text-[var(--color-text-secondary)]">Unassigned</span>
            <AlertCircle className="w-4 h-4 text-[var(--color-text-tertiary)]" />
          </div>
          <div className="mt-2 text-2xl font-semibold text-[var(--color-text)]">{unassigned.length}</div>
          <div className="mt-1 text-xs text-[var(--color-text-tertiary)]">Tasks needing assignment</div>
        </div>
      </div>

      {/* Charts - using @elemental/ui visualization components */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6" data-testid="charts-grid">
        <StatusPieChart
          data={taskStatusData}
          title="Task Distribution"
          testId="task-distribution-chart"
          isLoading={isLoading}
          isError={isError}
          errorMessage="Failed to load task data"
          emptyMessage="No tasks to display"
          height={192}
        />

        <TrendLineChart
          data={completedOverTimeData}
          title="Tasks Completed (Last 7 Days)"
          testId="tasks-completed-chart"
          isLoading={isLoading}
          isError={isError}
          errorMessage="Failed to load completion data"
          emptyMessage="No completion data"
          total={totalCompleted}
          height={192}
        />

        <HorizontalBarChart
          data={workloadByAgentData}
          title="Workload by Agent"
          testId="workload-by-agent-chart"
          isLoading={isLoading}
          isError={isError}
          errorMessage="Failed to load workload data"
          emptyMessage="No assigned tasks"
          height={192}
          maxBars={5}
        />
      </div>
    </div>
  );
}

/**
 * Tasks Page - View tasks with orchestrator metadata
 *
 * Shows tasks with agent assignments, branches, and worktree status.
 * Supports list view and kanban view with filter tabs.
 */

import { useState, useMemo } from 'react';
import { useSearch, useNavigate } from '@tanstack/react-router';
import {
  CheckSquare,
  Plus,
  Search,
  List,
  LayoutGrid,
  Loader2,
  AlertCircle,
  RefreshCw,
  Inbox,
  UserCheck,
  Play,
  CheckCircle2,
  GitMerge,
} from 'lucide-react';
import { useTasksByStatus, useStartTask, useCompleteTask } from '../../api/hooks/useTasks';
import { useAgents } from '../../api/hooks/useAgents';
import { TaskCard, TaskRow, TaskDetailPanel, CreateTaskModal } from '../../components/task';
import type { Task, Agent } from '../../api/types';

type ViewMode = 'list' | 'kanban';
type TabValue = 'all' | 'unassigned' | 'assigned' | 'in_progress' | 'done' | 'awaiting_merge';

export function TasksPage() {
  const search = useSearch({ from: '/tasks' }) as {
    selected?: string;
    page?: number;
    limit?: number;
    status?: string;
    assignee?: string;
  };
  const navigate = useNavigate();

  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [searchQuery, setSearchQuery] = useState('');
  const currentTab = (search.status as TabValue) || 'all';

  // Modal states
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const selectedTaskId = search.selected;

  // Track pending operations
  const [pendingStart, setPendingStart] = useState<Set<string>>(new Set());
  const [pendingComplete, setPendingComplete] = useState<Set<string>>(new Set());

  // Fetch data
  const {
    unassigned,
    assigned,
    inProgress,
    done,
    awaitingMerge,
    allTasks,
    isLoading,
    error,
    refetch,
  } = useTasksByStatus();

  const { data: agentsData } = useAgents();
  const agents = agentsData?.agents ?? [];

  // Create agent lookup map
  const agentMap = useMemo(() => {
    const map = new Map<string, Agent>();
    agents.forEach((a) => map.set(a.id, a));
    return map;
  }, [agents]);

  // Mutations
  const startTaskMutation = useStartTask();
  const completeTaskMutation = useCompleteTask();

  // Filter tasks based on current tab
  const filteredTasks = useMemo(() => {
    let tasks: Task[];
    switch (currentTab) {
      case 'unassigned':
        tasks = unassigned;
        break;
      case 'assigned':
        tasks = assigned;
        break;
      case 'in_progress':
        tasks = inProgress;
        break;
      case 'done':
        tasks = done;
        break;
      case 'awaiting_merge':
        tasks = awaitingMerge;
        break;
      default:
        tasks = allTasks.filter((t) => t.status !== 'tombstone');
    }

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      tasks = tasks.filter(
        (t) =>
          t.title.toLowerCase().includes(query) ||
          t.id.toLowerCase().includes(query) ||
          t.tags.some((tag) => tag.toLowerCase().includes(query))
      );
    }

    return tasks;
  }, [currentTab, allTasks, unassigned, assigned, inProgress, done, awaitingMerge, searchQuery]);

  const setTab = (tab: TabValue) => {
    navigate({
      to: '/tasks',
      search: {
        selected: search.selected,
        page: search.page ?? 1,
        limit: search.limit ?? 25,
        status: tab === 'all' ? undefined : tab,
        assignee: search.assignee,
      },
    });
  };

  const handleSelectTask = (taskId: string) => {
    navigate({
      to: '/tasks',
      search: {
        selected: taskId,
        page: search.page ?? 1,
        limit: search.limit ?? 25,
        status: search.status,
        assignee: search.assignee,
      },
    });
  };

  const handleCloseDetail = () => {
    navigate({
      to: '/tasks',
      search: {
        selected: undefined,
        page: search.page ?? 1,
        limit: search.limit ?? 25,
        status: search.status,
        assignee: search.assignee,
      },
    });
  };

  const handleStartTask = async (taskId: string) => {
    setPendingStart((prev) => new Set(prev).add(taskId));
    try {
      await startTaskMutation.mutateAsync({ taskId });
    } finally {
      setPendingStart((prev) => {
        const next = new Set(prev);
        next.delete(taskId);
        return next;
      });
    }
  };

  const handleCompleteTask = async (taskId: string) => {
    setPendingComplete((prev) => new Set(prev).add(taskId));
    try {
      await completeTaskMutation.mutateAsync({ taskId });
    } finally {
      setPendingComplete((prev) => {
        const next = new Set(prev);
        next.delete(taskId);
        return next;
      });
    }
  };

  // Tab counts
  const counts = {
    all: allTasks.filter((t) => t.status !== 'tombstone').length,
    unassigned: unassigned.length,
    assigned: assigned.length,
    in_progress: inProgress.length,
    done: done.length,
    awaiting_merge: awaitingMerge.length,
  };

  return (
    <div className="space-y-6 animate-fade-in" data-testid="tasks-page">
      {/* Create Task Modal */}
      <CreateTaskModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={(taskId) => handleSelectTask(taskId)}
      />

      {/* Task Detail Panel - Slide-over */}
      {selectedTaskId && (
        <div className="fixed inset-0 z-40" data-testid="task-detail-overlay">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/30"
            onClick={handleCloseDetail}
          />
          {/* Panel */}
          <div className="absolute right-0 top-0 h-full w-full max-w-lg bg-[var(--color-surface)] shadow-xl border-l border-[var(--color-border)] animate-slide-in-right">
            <TaskDetailPanel taskId={selectedTaskId} onClose={handleCloseDetail} />
          </div>
        </div>
      )}

      {/* Page header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-[var(--color-primary-muted)]">
            <CheckSquare className="w-5 h-5 text-[var(--color-primary)]" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-[var(--color-text)]">Tasks</h1>
            <p className="text-sm text-[var(--color-text-secondary)]">
              Manage and track agent task assignments
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-tertiary)]" />
            <input
              type="text"
              placeholder="Search tasks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-3 py-2 text-sm border border-[var(--color-border)] rounded-md bg-[var(--color-input-bg)] text-[var(--color-text)] placeholder:text-[var(--color-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:border-transparent w-48 md:w-64"
              data-testid="tasks-search"
            />
          </div>

          {/* View Toggle */}
          <div className="flex items-center border border-[var(--color-border)] rounded-md overflow-hidden">
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 transition-colors ${
                viewMode === 'list'
                  ? 'bg-[var(--color-primary)] text-white'
                  : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]'
              }`}
              title="List view"
              data-testid="tasks-view-list"
            >
              <List className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('kanban')}
              className={`p-2 transition-colors ${
                viewMode === 'kanban'
                  ? 'bg-[var(--color-primary)] text-white'
                  : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]'
              }`}
              title="Kanban view"
              data-testid="tasks-view-kanban"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>

          {/* Create Button */}
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-[var(--color-primary)] rounded-md hover:bg-[var(--color-primary-hover)] transition-colors duration-150"
            data-testid="tasks-create"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Create Task</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-[var(--color-border)] overflow-x-auto">
        <nav className="flex gap-1 min-w-max" aria-label="Tabs">
          <TabButton
            label="All"
            value="all"
            current={currentTab}
            count={counts.all}
            icon={CheckSquare}
            onClick={() => setTab('all')}
          />
          <TabButton
            label="Unassigned"
            value="unassigned"
            current={currentTab}
            count={counts.unassigned}
            icon={Inbox}
            onClick={() => setTab('unassigned')}
          />
          <TabButton
            label="Assigned"
            value="assigned"
            current={currentTab}
            count={counts.assigned}
            icon={UserCheck}
            onClick={() => setTab('assigned')}
          />
          <TabButton
            label="In Progress"
            value="in_progress"
            current={currentTab}
            count={counts.in_progress}
            icon={Play}
            onClick={() => setTab('in_progress')}
          />
          <TabButton
            label="Done"
            value="done"
            current={currentTab}
            count={counts.done}
            icon={CheckCircle2}
            onClick={() => setTab('done')}
          />
          <TabButton
            label="Awaiting Merge"
            value="awaiting_merge"
            current={currentTab}
            count={counts.awaiting_merge}
            icon={GitMerge}
            onClick={() => setTab('awaiting_merge')}
          />
        </nav>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-16">
          <Loader2 className="w-8 h-8 text-[var(--color-primary)] animate-spin mb-4" />
          <p className="text-sm text-[var(--color-text-secondary)]">Loading tasks...</p>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-16 px-4 border border-dashed border-[var(--color-danger)] rounded-lg bg-[var(--color-danger-muted)]">
          <AlertCircle className="w-12 h-12 text-[var(--color-danger)] mb-4" />
          <h3 className="text-lg font-medium text-[var(--color-text)]">Failed to load tasks</h3>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)] text-center max-w-md">
            {error.message}
          </p>
          <button
            onClick={() => refetch()}
            className="mt-4 flex items-center gap-2 px-4 py-2 text-sm font-medium text-[var(--color-primary)] bg-[var(--color-surface)] rounded-md hover:bg-[var(--color-surface-hover)] transition-colors"
            data-testid="tasks-retry"
          >
            <RefreshCw className="w-4 h-4" />
            Retry
          </button>
        </div>
      ) : filteredTasks.length === 0 ? (
        <EmptyState searchQuery={searchQuery} currentTab={currentTab} onCreateClick={() => setIsCreateModalOpen(true)} />
      ) : viewMode === 'list' ? (
        <TaskListView
          tasks={filteredTasks}
          agentMap={agentMap}
          onStart={handleStartTask}
          onComplete={handleCompleteTask}
          onSelectTask={handleSelectTask}
          pendingStart={pendingStart}
          pendingComplete={pendingComplete}
        />
      ) : (
        <TaskKanbanView
          unassigned={unassigned}
          assigned={assigned}
          inProgress={inProgress}
          done={done}
          awaitingMerge={awaitingMerge}
          agentMap={agentMap}
          onStart={handleStartTask}
          onComplete={handleCompleteTask}
          onSelectTask={handleSelectTask}
          pendingStart={pendingStart}
          pendingComplete={pendingComplete}
        />
      )}
    </div>
  );
}

// ============================================================================
// Tab Button Component
// ============================================================================

interface TabButtonProps {
  label: string;
  value: TabValue;
  current: TabValue;
  count: number;
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
}

function TabButton({ label, value, current, count, icon: Icon, onClick }: TabButtonProps) {
  const isActive = current === value;
  return (
    <button
      onClick={onClick}
      className={`pb-3 px-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
        isActive
          ? 'text-[var(--color-primary)] border-[var(--color-primary)]'
          : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text)] border-transparent hover:border-[var(--color-border)]'
      }`}
      data-testid={`tasks-tab-${value}`}
    >
      <span className="flex items-center gap-2">
        <Icon className="w-4 h-4" />
        {label}
        {count > 0 && (
          <span className="px-1.5 py-0.5 text-xs rounded-full bg-[var(--color-surface-elevated)]">
            {count}
          </span>
        )}
      </span>
    </button>
  );
}

// ============================================================================
// List View
// ============================================================================

interface TaskListViewProps {
  tasks: Task[];
  agentMap: Map<string, Agent>;
  onStart: (taskId: string) => void;
  onComplete: (taskId: string) => void;
  onSelectTask: (taskId: string) => void;
  pendingStart: Set<string>;
  pendingComplete: Set<string>;
}

function TaskListView({
  tasks,
  agentMap,
  onStart,
  onComplete,
  onSelectTask,
  pendingStart,
  pendingComplete,
}: TaskListViewProps) {
  return (
    <div className="border border-[var(--color-border)] rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full" data-testid="tasks-table">
          <thead className="bg-[var(--color-surface-elevated)]">
            <tr className="border-b border-[var(--color-border)]">
              <th className="px-4 py-3 text-left text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wider">
                Task
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wider">
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wider">
                Priority
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wider">
                Type
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wider">
                Assignee
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wider">
                Branch
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wider">
                Updated
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-[var(--color-surface)]">
            {tasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                assignedAgent={task.assignee ? agentMap.get(task.assignee) : undefined}
                onStart={() => onStart(task.id)}
                onComplete={() => onComplete(task.id)}
                onClick={() => onSelectTask(task.id)}
                isStarting={pendingStart.has(task.id)}
                isCompleting={pendingComplete.has(task.id)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================================
// Kanban View
// ============================================================================

interface TaskKanbanViewProps {
  unassigned: Task[];
  assigned: Task[];
  inProgress: Task[];
  done: Task[];
  awaitingMerge: Task[];
  agentMap: Map<string, Agent>;
  onStart: (taskId: string) => void;
  onComplete: (taskId: string) => void;
  onSelectTask: (taskId: string) => void;
  pendingStart: Set<string>;
  pendingComplete: Set<string>;
}

function TaskKanbanView({
  unassigned,
  assigned,
  inProgress,
  done,
  awaitingMerge,
  agentMap,
  onStart,
  onComplete,
  onSelectTask,
  pendingStart,
  pendingComplete,
}: TaskKanbanViewProps) {
  return (
    <div
      className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 overflow-x-auto pb-4"
      data-testid="tasks-kanban"
    >
      <KanbanColumn
        title="Unassigned"
        icon={Inbox}
        tasks={unassigned}
        agentMap={agentMap}
        onStart={onStart}
        onComplete={onComplete}
        onSelectTask={onSelectTask}
        pendingStart={pendingStart}
        pendingComplete={pendingComplete}
        colorClass="border-gray-400"
      />
      <KanbanColumn
        title="Assigned"
        icon={UserCheck}
        tasks={assigned}
        agentMap={agentMap}
        onStart={onStart}
        onComplete={onComplete}
        onSelectTask={onSelectTask}
        pendingStart={pendingStart}
        pendingComplete={pendingComplete}
        colorClass="border-blue-400"
      />
      <KanbanColumn
        title="In Progress"
        icon={Play}
        tasks={inProgress}
        agentMap={agentMap}
        onStart={onStart}
        onComplete={onComplete}
        onSelectTask={onSelectTask}
        pendingStart={pendingStart}
        pendingComplete={pendingComplete}
        colorClass="border-yellow-400"
      />
      <KanbanColumn
        title="Done"
        icon={CheckCircle2}
        tasks={done}
        agentMap={agentMap}
        onStart={onStart}
        onComplete={onComplete}
        onSelectTask={onSelectTask}
        pendingStart={pendingStart}
        pendingComplete={pendingComplete}
        colorClass="border-green-400"
      />
      <KanbanColumn
        title="Awaiting Merge"
        icon={GitMerge}
        tasks={awaitingMerge}
        agentMap={agentMap}
        onStart={onStart}
        onComplete={onComplete}
        onSelectTask={onSelectTask}
        pendingStart={pendingStart}
        pendingComplete={pendingComplete}
        colorClass="border-purple-400"
      />
    </div>
  );
}

interface KanbanColumnProps {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  tasks: Task[];
  agentMap: Map<string, Agent>;
  onStart: (taskId: string) => void;
  onComplete: (taskId: string) => void;
  onSelectTask: (taskId: string) => void;
  pendingStart: Set<string>;
  pendingComplete: Set<string>;
  colorClass: string;
}

function KanbanColumn({
  title,
  icon: Icon,
  tasks,
  agentMap,
  onStart,
  onComplete,
  onSelectTask,
  pendingStart,
  pendingComplete,
  colorClass,
}: KanbanColumnProps) {
  return (
    <div
      className={`flex flex-col bg-[var(--color-surface-elevated)] rounded-lg border-t-4 ${colorClass} min-w-[280px]`}
      data-testid={`kanban-column-${title.toLowerCase().replace(/\s+/g, '-')}`}
    >
      <div className="flex items-center gap-2 px-3 py-3 border-b border-[var(--color-border)]">
        <Icon className="w-4 h-4 text-[var(--color-text-secondary)]" />
        <h3 className="text-sm font-medium text-[var(--color-text)]">{title}</h3>
        <span className="ml-auto px-2 py-0.5 text-xs rounded-full bg-[var(--color-surface)] text-[var(--color-text-secondary)]">
          {tasks.length}
        </span>
      </div>
      <div className="flex-1 p-2 space-y-2 overflow-y-auto max-h-[calc(100vh-320px)]">
        {tasks.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-xs text-[var(--color-text-tertiary)]">
            No tasks
          </div>
        ) : (
          tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              assignedAgent={task.assignee ? agentMap.get(task.assignee) : undefined}
              onStart={() => onStart(task.id)}
              onComplete={() => onComplete(task.id)}
              onClick={() => onSelectTask(task.id)}
              isStarting={pendingStart.has(task.id)}
              isCompleting={pendingComplete.has(task.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Empty State
// ============================================================================

interface EmptyStateProps {
  searchQuery: string;
  currentTab: TabValue;
  onCreateClick: () => void;
}

function EmptyState({ searchQuery, currentTab, onCreateClick }: EmptyStateProps) {
  if (searchQuery) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4 border border-dashed border-[var(--color-border)] rounded-lg">
        <Search className="w-12 h-12 text-[var(--color-text-tertiary)] mb-4" />
        <h3 className="text-lg font-medium text-[var(--color-text)]">No matching tasks</h3>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)] text-center max-w-md">
          No tasks found matching &quot;{searchQuery}&quot;. Try a different search term.
        </p>
      </div>
    );
  }

  const emptyMessages: Record<TabValue, { title: string; description: string }> = {
    all: {
      title: 'No tasks yet',
      description: 'Create your first task to get started. Tasks can be assigned to agents and tracked through completion.',
    },
    unassigned: {
      title: 'No unassigned tasks',
      description: 'All tasks have been assigned to agents. Create a new task or unassign an existing one.',
    },
    assigned: {
      title: 'No assigned tasks',
      description: 'No tasks are currently assigned and waiting to start. Assign a task to an agent to see it here.',
    },
    in_progress: {
      title: 'No tasks in progress',
      description: 'No agents are currently working on tasks. Start a task to see it here.',
    },
    done: {
      title: 'No completed tasks',
      description: 'No tasks have been completed yet. Keep working on those tasks!',
    },
    awaiting_merge: {
      title: 'No tasks awaiting merge',
      description: 'No completed tasks are waiting to be merged. Completed task branches will appear here.',
    },
  };

  const { title, description } = emptyMessages[currentTab];

  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 border border-dashed border-[var(--color-border)] rounded-lg">
      <CheckSquare className="w-12 h-12 text-[var(--color-text-tertiary)] mb-4" />
      <h3 className="text-lg font-medium text-[var(--color-text)]">{title}</h3>
      <p className="mt-1 text-sm text-[var(--color-text-secondary)] text-center max-w-md">
        {description}
      </p>
      {currentTab === 'all' && (
        <button
          onClick={onCreateClick}
          className="mt-4 flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[var(--color-primary)] rounded-md hover:bg-[var(--color-primary-hover)] transition-colors duration-150"
          data-testid="tasks-create-empty"
        >
          <Plus className="w-4 h-4" />
          Create Task
        </button>
      )}
    </div>
  );
}

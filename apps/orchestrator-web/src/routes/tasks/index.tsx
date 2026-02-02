/**
 * Tasks Page - Enhanced view with sorting, grouping, filtering, and virtualization
 *
 * Features:
 * - List view with sortable headers and grouping
 * - Kanban view with drag-and-drop
 * - Advanced filtering (status, priority, assignee)
 * - Search with fuzzy matching
 * - Pagination for list view
 * - localStorage persistence for preferences
 */

import { useState, useMemo, useEffect, useCallback } from 'react';
import { useSearch, useNavigate } from '@tanstack/react-router';
import {
  CheckSquare,
  Plus,
  Search,
  Loader2,
  AlertCircle,
  RefreshCw,
  Inbox,
  UserCheck,
  Play,
  CheckCircle2,
  GitMerge,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { useTasksByStatus, useStartTask, useCompleteTask, useUpdateTask } from '../../api/hooks/useTasks';
import { useAgents } from '../../api/hooks/useAgents';
import {
  TaskRow,
  TaskDetailPanel,
  CreateTaskModal,
  SortByDropdown,
  GroupByDropdown,
  ViewToggle,
  FilterBar,
  KanbanBoard,
} from '../../components/task';
import { Pagination } from '../../components/shared/Pagination';
import type { Task, Agent } from '../../api/types';
import type {
  ViewMode,
  SortField,
  SortDirection,
  GroupByField,
  FilterConfig,
  TaskGroup,
} from '../../lib/task-constants';
import {
  DEFAULT_PAGE_SIZE,
  EMPTY_FILTER,
} from '../../lib/task-constants';
import {
  fuzzySearch,
  highlightMatches,
  taskSortCompareFn,
  groupTasks,
  createTaskFilter,
  getStoredViewMode,
  setStoredViewMode,
  getStoredSortField,
  setStoredSortField,
  getStoredSortDirection,
  setStoredSortDirection,
  getStoredSecondarySort,
  setStoredSecondarySort,
  getStoredGroupBy,
  setStoredGroupBy,
  getStoredSearch,
  setStoredSearch,
} from '../../lib/task-utils';

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

  // View and sort preferences (persisted in localStorage)
  const [viewMode, setViewModeState] = useState<ViewMode>(() => getStoredViewMode());
  const [sortField, setSortFieldState] = useState<SortField>(() => getStoredSortField());
  const [sortDirection, setSortDirectionState] = useState<SortDirection>(() => getStoredSortDirection());
  const [secondarySort, setSecondarySortState] = useState<SortField | null>(() => getStoredSecondarySort());
  const [groupBy, setGroupByState] = useState<GroupByField>(() => getStoredGroupBy());
  const [searchQuery, setSearchQueryState] = useState(() => getStoredSearch());

  // Filters
  const [filters, setFilters] = useState<FilterConfig>(EMPTY_FILTER);

  // Pagination
  const currentPage = search.page ?? 1;
  const pageSize = search.limit ?? DEFAULT_PAGE_SIZE;
  const currentTab = (search.status as TabValue) || 'all';

  // Modal states
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const selectedTaskId = search.selected;

  // Track pending operations
  const [pendingStart, setPendingStart] = useState<Set<string>>(new Set());
  const [pendingComplete, setPendingComplete] = useState<Set<string>>(new Set());

  // Collapsed groups state
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

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
  const updateTaskMutation = useUpdateTask();

  // Setters with persistence
  const setViewMode = useCallback((mode: ViewMode) => {
    setViewModeState(mode);
    setStoredViewMode(mode);
  }, []);

  const setSortField = useCallback((field: SortField) => {
    setSortFieldState(field);
    setStoredSortField(field);
  }, []);

  const setSortDirection = useCallback((dir: SortDirection) => {
    setSortDirectionState(dir);
    setStoredSortDirection(dir);
  }, []);

  const setSecondarySort = useCallback((field: SortField | null) => {
    setSecondarySortState(field);
    setStoredSecondarySort(field);
  }, []);

  const setGroupBy = useCallback((field: GroupByField) => {
    setGroupByState(field);
    setStoredGroupBy(field);
  }, []);

  const setSearchQuery = useCallback((query: string) => {
    setSearchQueryState(query);
    setStoredSearch(query);
  }, []);

  // Keyboard shortcuts for view toggle
  useEffect(() => {
    let pendingV = false;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't capture if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.key === 'v' || e.key === 'V') {
        pendingV = true;
        return;
      }

      if (pendingV) {
        if (e.key === 'l' || e.key === 'L') {
          setViewMode('list');
          pendingV = false;
        } else if (e.key === 'k' || e.key === 'K') {
          setViewMode('kanban');
          pendingV = false;
        } else {
          pendingV = false;
        }
      }
    };

    const handleKeyUp = () => {
      // Reset pending state after a short delay
      setTimeout(() => {
        pendingV = false;
      }, 500);
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
    };
  }, [setViewMode]);

  // Filter tasks based on current tab
  const tabFilteredTasks = useMemo(() => {
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
    return tasks;
  }, [currentTab, allTasks, unassigned, assigned, inProgress, done, awaitingMerge]);

  // Apply filters and search
  const filteredTasks = useMemo(() => {
    const filterFn = createTaskFilter(filters, searchQuery);
    return tabFilteredTasks.filter(filterFn);
  }, [tabFilteredTasks, filters, searchQuery]);

  // Apply sorting
  const sortedTasks = useMemo(() => {
    const sorted = [...filteredTasks];
    sorted.sort((a, b) => {
      const primaryCmp = taskSortCompareFn(a, b, sortField === 'created_at' ? 'createdAt' : sortField === 'updated_at' ? 'updatedAt' : sortField, sortDirection);
      if (primaryCmp !== 0 || !secondarySort) return primaryCmp;
      return taskSortCompareFn(a, b, secondarySort === 'created_at' ? 'createdAt' : secondarySort === 'updated_at' ? 'updatedAt' : secondarySort, sortDirection);
    });
    return sorted;
  }, [filteredTasks, sortField, sortDirection, secondarySort]);

  // Pagination (list view only)
  const totalItems = sortedTasks.length;
  const totalPages = Math.ceil(totalItems / pageSize);
  const paginatedTasks = useMemo(() => {
    if (viewMode === 'kanban') return sortedTasks;
    const start = (currentPage - 1) * pageSize;
    const end = start + pageSize;
    return sortedTasks.slice(start, end);
  }, [sortedTasks, currentPage, pageSize, viewMode]);

  // Paginated grouped tasks
  const paginatedGroupedTasks = useMemo(() => {
    if (viewMode === 'kanban' || groupBy === 'none') {
      return [{ key: 'all', label: 'All Tasks', tasks: paginatedTasks }];
    }
    // For grouped view, paginate within each group
    return groupTasks(paginatedTasks, groupBy, agents);
  }, [paginatedTasks, groupBy, agents, viewMode]);

  const setTab = (tab: TabValue) => {
    navigate({
      to: '/tasks',
      search: {
        selected: search.selected,
        page: 1, // Reset to page 1 when changing tabs
        limit: search.limit ?? DEFAULT_PAGE_SIZE,
        status: tab === 'all' ? undefined : tab,
        assignee: search.assignee,
      },
    });
  };

  const setPage = (page: number) => {
    navigate({
      to: '/tasks',
      search: {
        selected: search.selected,
        page,
        limit: search.limit ?? DEFAULT_PAGE_SIZE,
        status: search.status,
        assignee: search.assignee,
      },
    });
  };

  const setPageSize = (limit: number) => {
    navigate({
      to: '/tasks',
      search: {
        selected: search.selected,
        page: 1, // Reset to page 1 when changing page size
        limit,
        status: search.status,
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
        limit: search.limit ?? DEFAULT_PAGE_SIZE,
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
        limit: search.limit ?? DEFAULT_PAGE_SIZE,
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

  const handleUpdateTask = async (taskId: string, updates: { status?: string; assignee?: string | null }) => {
    const updatePayload: Parameters<typeof updateTaskMutation.mutateAsync>[0] = { taskId };
    if (updates.status !== undefined) {
      updatePayload.status = updates.status as 'open' | 'in_progress' | 'blocked' | 'deferred' | 'closed';
    }
    if (updates.assignee !== undefined) {
      updatePayload.assignee = updates.assignee;
    }
    await updateTaskMutation.mutateAsync(updatePayload);
  };

  const handleClearFilters = () => {
    setFilters(EMPTY_FILTER);
  };

  const toggleGroupCollapse = (groupKey: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) {
        next.delete(groupKey);
      } else {
        next.add(groupKey);
      }
      return next;
    });
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
    <div className="space-y-4 animate-fade-in" data-testid="tasks-page">
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
        <div className="flex items-center gap-2 flex-wrap">
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

          {/* Sort Dropdown */}
          <SortByDropdown
            sortField={sortField}
            sortDirection={sortDirection}
            secondarySort={secondarySort}
            onSortFieldChange={setSortField}
            onSortDirectionChange={setSortDirection}
            onSecondarySortChange={setSecondarySort}
          />

          {/* Group By Dropdown (list view only) */}
          {viewMode === 'list' && (
            <GroupByDropdown
              groupBy={groupBy}
              onGroupByChange={setGroupBy}
            />
          )}

          {/* View Toggle */}
          <ViewToggle view={viewMode} onViewChange={setViewMode} />

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

      {/* Filter Bar (list view only) */}
      {viewMode === 'list' && (
        <FilterBar
          filters={filters}
          onFilterChange={setFilters}
          onClearFilters={handleClearFilters}
          agents={agents}
        />
      )}

      {/* Tabs (list view only - kanban has columns for same purpose) */}
      {viewMode === 'list' && (
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
      )}

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
        <>
          <TaskListView
            groups={paginatedGroupedTasks}
            agentMap={agentMap}
            onStart={handleStartTask}
            onComplete={handleCompleteTask}
            onSelectTask={handleSelectTask}
            pendingStart={pendingStart}
            pendingComplete={pendingComplete}
            collapsedGroups={collapsedGroups}
            onToggleCollapse={toggleGroupCollapse}
            searchQuery={searchQuery}
          />
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        </>
      ) : (
        <KanbanBoard
          tasks={allTasks}
          agentMap={agentMap}
          selectedTaskId={selectedTaskId ?? null}
          onTaskClick={handleSelectTask}
          onUpdateTask={handleUpdateTask}
          searchQuery={searchQuery}
          pageSort={{ field: sortField, direction: sortDirection }}
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
// List View with Grouping
// ============================================================================

interface TaskListViewProps {
  groups: TaskGroup[];
  agentMap: Map<string, Agent>;
  onStart: (taskId: string) => void;
  onComplete: (taskId: string) => void;
  onSelectTask: (taskId: string) => void;
  pendingStart: Set<string>;
  pendingComplete: Set<string>;
  collapsedGroups: Set<string>;
  onToggleCollapse: (groupKey: string) => void;
  searchQuery: string;
}

function TaskListView({
  groups,
  agentMap,
  onStart,
  onComplete,
  onSelectTask,
  pendingStart,
  pendingComplete,
  collapsedGroups,
  onToggleCollapse,
  searchQuery,
}: TaskListViewProps) {
  const showGroups = groups.length > 1 || (groups.length === 1 && groups[0].key !== 'all');

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
            {groups.map((group) => (
              <GroupSection
                key={group.key}
                group={group}
                agentMap={agentMap}
                onStart={onStart}
                onComplete={onComplete}
                onSelectTask={onSelectTask}
                pendingStart={pendingStart}
                pendingComplete={pendingComplete}
                showHeader={showGroups}
                isCollapsed={collapsedGroups.has(group.key)}
                onToggleCollapse={() => onToggleCollapse(group.key)}
                searchQuery={searchQuery}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface GroupSectionProps {
  group: TaskGroup;
  agentMap: Map<string, Agent>;
  onStart: (taskId: string) => void;
  onComplete: (taskId: string) => void;
  onSelectTask: (taskId: string) => void;
  pendingStart: Set<string>;
  pendingComplete: Set<string>;
  showHeader: boolean;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  searchQuery: string;
}

function GroupSection({
  group,
  agentMap,
  onStart,
  onComplete,
  onSelectTask,
  pendingStart,
  pendingComplete,
  showHeader,
  isCollapsed,
  onToggleCollapse,
  searchQuery,
}: GroupSectionProps) {
  return (
    <>
      {showHeader && (
        <tr className="bg-[var(--color-surface-elevated)] border-t border-b border-[var(--color-border)]">
          <td colSpan={8}>
            <button
              onClick={onToggleCollapse}
              className="w-full px-4 py-2 flex items-center gap-2 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]"
            >
              {isCollapsed ? (
                <ChevronRight className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
              <span className={group.color ? `px-2 py-0.5 rounded text-xs ${group.color}` : ''}>
                {group.label}
              </span>
              <span className="text-xs text-[var(--color-text-tertiary)]">
                ({group.tasks.length})
              </span>
            </button>
          </td>
        </tr>
      )}
      {!isCollapsed &&
        group.tasks.map((task) => {
          const matchInfo = searchQuery ? fuzzySearch(task.title, searchQuery) : null;
          return (
            <TaskRow
              key={task.id}
              task={task}
              assignedAgent={task.assignee ? agentMap.get(task.assignee) : undefined}
              onStart={() => onStart(task.id)}
              onComplete={() => onComplete(task.id)}
              onClick={() => onSelectTask(task.id)}
              isStarting={pendingStart.has(task.id)}
              isCompleting={pendingComplete.has(task.id)}
              highlightedTitle={matchInfo?.indices ? highlightMatches(task.title, matchInfo.indices) : undefined}
            />
          );
        })}
    </>
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

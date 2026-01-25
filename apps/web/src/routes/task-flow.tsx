/**
 * Task Flow Lens
 *
 * Four-column layout showing:
 * 1. Ready Tasks (unblocked, actionable - status: open)
 * 2. In Progress Tasks (actively being worked on)
 * 3. Blocked Tasks (waiting on dependencies)
 * 4. Recently Completed (closed in last 24h)
 */

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Calendar, User, Tag, Clock, Link2, AlertTriangle, CheckCircle2, Pencil, Check, Loader2, Trash2, Filter, ArrowUpDown } from 'lucide-react';

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

interface Dependency {
  sourceId: string;
  targetId: string;
  type: string;
  metadata?: Record<string, unknown>;
  createdBy: string;
  createdAt: string;
}

interface TaskDetail extends Task {
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

// ============================================================================
// Filter & Sort Types
// ============================================================================

type SortField = 'priority' | 'created' | 'updated' | 'deadline' | 'title';
type SortDirection = 'asc' | 'desc';

interface ColumnFilters {
  assignee: string | null;
  priority: number | null;
  tag: string | null;
}

interface ColumnSort {
  field: SortField;
  direction: SortDirection;
}

interface ColumnPreferences {
  filters: ColumnFilters;
  sort: ColumnSort;
}

const DEFAULT_FILTERS: ColumnFilters = {
  assignee: null,
  priority: null,
  tag: null,
};

const DEFAULT_SORT: ColumnSort = {
  field: 'priority',
  direction: 'asc',
};

const SORT_OPTIONS: { value: SortField; label: string }[] = [
  { value: 'priority', label: 'Priority' },
  { value: 'created', label: 'Created Date' },
  { value: 'updated', label: 'Updated Date' },
  { value: 'deadline', label: 'Deadline' },
  { value: 'title', label: 'Title' },
];

const PRIORITY_FILTER_OPTIONS = [
  { value: 1, label: 'Critical' },
  { value: 2, label: 'High' },
  { value: 3, label: 'Medium' },
  { value: 4, label: 'Low' },
  { value: 5, label: 'Trivial' },
];

// Hook to persist column preferences in localStorage
function useColumnPreferences(columnId: string): [ColumnPreferences, (prefs: Partial<ColumnPreferences>) => void] {
  const storageKey = `task-flow-column-${columnId}`;

  const [preferences, setPreferences] = useState<ColumnPreferences>(() => {
    if (typeof window === 'undefined') {
      return { filters: DEFAULT_FILTERS, sort: DEFAULT_SORT };
    }
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        return {
          filters: { ...DEFAULT_FILTERS, ...parsed.filters },
          sort: { ...DEFAULT_SORT, ...parsed.sort },
        };
      }
    } catch {
      // Ignore parse errors
    }
    return { filters: DEFAULT_FILTERS, sort: DEFAULT_SORT };
  });

  const updatePreferences = useCallback((updates: Partial<ColumnPreferences>) => {
    setPreferences((prev) => {
      const next = {
        filters: updates.filters ? { ...prev.filters, ...updates.filters } : prev.filters,
        sort: updates.sort ? { ...prev.sort, ...updates.sort } : prev.sort,
      };
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        // Ignore storage errors
      }
      return next;
    });
  }, [storageKey]);

  return [preferences, updatePreferences];
}

// Apply filters and sorting to tasks
function applyFiltersAndSort<T extends Task>(
  tasks: T[] | undefined,
  filters: ColumnFilters,
  sort: ColumnSort
): T[] {
  if (!tasks) return [];

  let result = [...tasks];

  // Apply filters
  if (filters.assignee) {
    result = result.filter((t) => t.assignee === filters.assignee);
  }
  if (filters.priority !== null) {
    result = result.filter((t) => t.priority === filters.priority);
  }
  if (filters.tag) {
    result = result.filter((t) => t.tags?.includes(filters.tag!));
  }

  // Apply sorting
  result.sort((a, b) => {
    let comparison = 0;

    switch (sort.field) {
      case 'priority':
        comparison = a.priority - b.priority;
        break;
      case 'created':
        comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        break;
      case 'updated':
        comparison = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
        break;
      case 'deadline':
        // Tasks without deadlines go last
        const aDeadline = (a as unknown as TaskDetail).deadline;
        const bDeadline = (b as unknown as TaskDetail).deadline;
        if (!aDeadline && !bDeadline) comparison = 0;
        else if (!aDeadline) comparison = 1;
        else if (!bDeadline) comparison = -1;
        else comparison = new Date(aDeadline).getTime() - new Date(bDeadline).getTime();
        break;
      case 'title':
        comparison = a.title.localeCompare(b.title);
        break;
    }

    return sort.direction === 'asc' ? comparison : -comparison;
  });

  return result;
}

// Get unique assignees from tasks
function getUniqueAssignees(tasks: Task[] | undefined): string[] {
  if (!tasks) return [];
  const assignees = new Set<string>();
  tasks.forEach((t) => {
    if (t.assignee) assignees.add(t.assignee);
  });
  return Array.from(assignees).sort();
}

// Get unique tags from tasks
function getUniqueTags(tasks: Task[] | undefined): string[] {
  if (!tasks) return [];
  const tags = new Set<string>();
  tasks.forEach((t) => {
    t.tags?.forEach((tag) => tags.add(tag));
  });
  return Array.from(tags).sort();
}

function useReadyTasks() {
  return useQuery<Task[]>({
    queryKey: ['tasks', 'ready'],
    queryFn: async () => {
      const response = await fetch('/api/tasks/ready');
      if (!response.ok) throw new Error('Failed to fetch ready tasks');
      const tasks = await response.json();
      // Filter to only open tasks (not in_progress) for the Ready column
      return tasks.filter((t: Task) => t.status === 'open');
    },
  });
}

function useInProgressTasks() {
  return useQuery<Task[]>({
    queryKey: ['tasks', 'in-progress'],
    queryFn: async () => {
      const response = await fetch('/api/tasks/in-progress');
      if (!response.ok) throw new Error('Failed to fetch in-progress tasks');
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

function useTaskDetail(taskId: string | null) {
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

function useUpdateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<TaskDetail> }) => {
      const response = await fetch(`/api/tasks/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to update task');
      }

      return response.json();
    },
    onMutate: async ({ id, updates }) => {
      await queryClient.cancelQueries({ queryKey: ['tasks', id] });
      const previousTask = queryClient.getQueryData<TaskDetail>(['tasks', id]);
      if (previousTask) {
        queryClient.setQueryData<TaskDetail>(['tasks', id], {
          ...previousTask,
          ...updates,
        });
      }
      return { previousTask };
    },
    onError: (_error, { id }, context) => {
      if (context?.previousTask) {
        queryClient.setQueryData(['tasks', id], context.previousTask);
      }
    },
    onSettled: (_data, _error, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['tasks', id] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['tasks', 'ready'] });
      queryClient.invalidateQueries({ queryKey: ['tasks', 'in-progress'] });
      queryClient.invalidateQueries({ queryKey: ['tasks', 'blocked'] });
      queryClient.invalidateQueries({ queryKey: ['tasks', 'completed'] });
    },
  });
}

function useDeleteTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/tasks/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to delete task');
      }

      return response.json();
    },
    onSuccess: (_data, id) => {
      queryClient.removeQueries({ queryKey: ['tasks', id] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['tasks', 'ready'] });
      queryClient.invalidateQueries({ queryKey: ['tasks', 'in-progress'] });
      queryClient.invalidateQueries({ queryKey: ['tasks', 'blocked'] });
      queryClient.invalidateQueries({ queryKey: ['tasks', 'completed'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
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

const STATUS_OPTIONS = ['open', 'in_progress', 'blocked', 'completed', 'cancelled', 'deferred'];
const PRIORITY_OPTIONS = [1, 2, 3, 4, 5];
const COMPLEXITY_OPTIONS = [1, 2, 3, 4, 5];

function TaskCard({ task, showBlockReason, onClick }: { task: Task | BlockedTask; showBlockReason?: boolean; onClick?: () => void }) {
  const priority = PRIORITY_LABELS[task.priority] || PRIORITY_LABELS[3];
  const typeColor = TASK_TYPE_COLORS[task.taskType] || TASK_TYPE_COLORS.task;
  const blockedTask = showBlockReason ? (task as BlockedTask) : null;

  return (
    <div
      className={`p-3 rounded-lg border ${typeColor} ${onClick ? 'cursor-pointer hover:shadow-md hover:border-blue-400 transition-all' : ''}`}
      onClick={onClick}
      data-testid={`task-card-${task.id}`}
    >
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

function InProgressTaskCard({ task, onClick }: { task: Task; onClick?: () => void }) {
  const priority = PRIORITY_LABELS[task.priority] || PRIORITY_LABELS[3];
  const timeAgo = getTimeAgo(task.updatedAt);

  return (
    <div
      className={`p-3 rounded-lg border bg-yellow-50 border-yellow-200 ${onClick ? 'cursor-pointer hover:shadow-md hover:border-blue-400 transition-all' : ''}`}
      onClick={onClick}
      data-testid={`task-card-${task.id}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-gray-900 text-sm truncate">{task.title}</h4>
          <p className="text-xs text-gray-500 mt-0.5 font-mono">{task.id}</p>
        </div>
        <span className={`px-1.5 py-0.5 text-xs font-medium rounded shrink-0 ${priority.color}`}>
          {priority.label}
        </span>
      </div>
      <div className="mt-2 flex items-center gap-2 flex-wrap">
        <span className="px-1.5 py-0.5 text-xs font-medium rounded bg-yellow-100 text-yellow-800">
          In Progress
        </span>
        <span className="text-xs text-gray-500">Started {timeAgo}</span>
        {task.assignee && (
          <span className="text-xs text-gray-500">→ {task.assignee}</span>
        )}
      </div>
    </div>
  );
}

function CompletedTaskCard({ task, onClick }: { task: Task; onClick?: () => void }) {
  const timeAgo = getTimeAgo(task.updatedAt);

  return (
    <div
      className={`p-3 rounded-lg border bg-green-50 border-green-200 ${onClick ? 'cursor-pointer hover:shadow-md hover:border-blue-400 transition-all' : ''}`}
      onClick={onClick}
      data-testid={`task-card-${task.id}`}
    >
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

// ============================================================================
// Filter & Sort Dropdown Component
// ============================================================================

interface FilterSortDropdownProps {
  columnId: string;
  availableAssignees: string[];
  availableTags: string[];
  preferences: ColumnPreferences;
  onUpdate: (updates: Partial<ColumnPreferences>) => void;
}

function FilterSortDropdown({
  columnId,
  availableAssignees,
  availableTags,
  preferences,
  onUpdate,
}: FilterSortDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Count active filters
  const activeFilters = [
    preferences.filters.assignee,
    preferences.filters.priority,
    preferences.filters.tag,
  ].filter(Boolean).length;

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleClearFilters = () => {
    onUpdate({ filters: DEFAULT_FILTERS });
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`p-1 rounded transition-colors ${
          activeFilters > 0 || preferences.sort.field !== 'priority' || preferences.sort.direction !== 'asc'
            ? 'text-blue-600 bg-blue-50 hover:bg-blue-100'
            : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
        }`}
        title="Filter & Sort"
        data-testid={`${columnId}-filter-button`}
      >
        <Filter className="w-3.5 h-3.5" />
        {activeFilters > 0 && (
          <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-blue-600 text-white text-[10px] rounded-full flex items-center justify-center">
            {activeFilters}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          className="absolute right-0 top-full mt-1 w-56 bg-white border border-gray-200 rounded-lg shadow-lg z-20 py-2"
          data-testid={`${columnId}-filter-dropdown`}
        >
          {/* Sort Section */}
          <div className="px-3 pb-2 border-b border-gray-100">
            <div className="flex items-center gap-1 text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
              <ArrowUpDown className="w-3 h-3" />
              Sort By
            </div>
            <div className="space-y-1">
              {SORT_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  onClick={() => onUpdate({ sort: { field: option.value, direction: preferences.sort.direction } })}
                  className={`w-full text-left px-2 py-1 text-xs rounded ${
                    preferences.sort.field === option.value
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                  data-testid={`${columnId}-sort-${option.value}`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className="flex gap-1 mt-2">
              <button
                onClick={() => onUpdate({ sort: { ...preferences.sort, direction: 'asc' } })}
                className={`flex-1 px-2 py-1 text-xs rounded ${
                  preferences.sort.direction === 'asc'
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-50 border border-gray-200'
                }`}
                data-testid={`${columnId}-sort-asc`}
              >
                Ascending
              </button>
              <button
                onClick={() => onUpdate({ sort: { ...preferences.sort, direction: 'desc' } })}
                className={`flex-1 px-2 py-1 text-xs rounded ${
                  preferences.sort.direction === 'desc'
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-50 border border-gray-200'
                }`}
                data-testid={`${columnId}-sort-desc`}
              >
                Descending
              </button>
            </div>
          </div>

          {/* Filter Section */}
          <div className="px-3 pt-2">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1 text-xs font-medium text-gray-500 uppercase tracking-wide">
                <Filter className="w-3 h-3" />
                Filter
              </div>
              {activeFilters > 0 && (
                <button
                  onClick={handleClearFilters}
                  className="text-xs text-blue-600 hover:underline"
                  data-testid={`${columnId}-clear-filters`}
                >
                  Clear
                </button>
              )}
            </div>

            {/* Priority Filter */}
            <div className="mb-2">
              <label className="text-xs text-gray-500 mb-1 block">Priority</label>
              <select
                value={preferences.filters.priority ?? ''}
                onChange={(e) => onUpdate({
                  filters: {
                    ...preferences.filters,
                    priority: e.target.value ? parseInt(e.target.value, 10) : null,
                  },
                })}
                className="w-full text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                data-testid={`${columnId}-filter-priority`}
              >
                <option value="">All priorities</option>
                {PRIORITY_FILTER_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Assignee Filter */}
            {availableAssignees.length > 0 && (
              <div className="mb-2">
                <label className="text-xs text-gray-500 mb-1 block">Assignee</label>
                <select
                  value={preferences.filters.assignee ?? ''}
                  onChange={(e) => onUpdate({
                    filters: {
                      ...preferences.filters,
                      assignee: e.target.value || null,
                    },
                  })}
                  className="w-full text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  data-testid={`${columnId}-filter-assignee`}
                >
                  <option value="">All assignees</option>
                  {availableAssignees.map((assignee) => (
                    <option key={assignee} value={assignee}>
                      {assignee}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Tag Filter */}
            {availableTags.length > 0 && (
              <div className="mb-1">
                <label className="text-xs text-gray-500 mb-1 block">Tag</label>
                <select
                  value={preferences.filters.tag ?? ''}
                  onChange={(e) => onUpdate({
                    filters: {
                      ...preferences.filters,
                      tag: e.target.value || null,
                    },
                  })}
                  className="w-full text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  data-testid={`${columnId}-filter-tag`}
                >
                  <option value="">All tags</option>
                  {availableTags.map((tag) => (
                    <option key={tag} value={tag}>
                      {tag}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Column Component with Filter/Sort
// ============================================================================

interface ColumnProps {
  title: string;
  columnId: string;
  count: number;
  totalCount: number;
  color: string;
  children: React.ReactNode;
  isLoading?: boolean;
  isError?: boolean;
  emptyMessage?: string;
  availableAssignees: string[];
  availableTags: string[];
  preferences: ColumnPreferences;
  onUpdatePreferences: (updates: Partial<ColumnPreferences>) => void;
}

function Column({
  title,
  columnId,
  count,
  totalCount,
  color,
  children,
  isLoading,
  isError,
  emptyMessage,
  availableAssignees,
  availableTags,
  preferences,
  onUpdatePreferences,
}: ColumnProps) {
  const hasActiveFilters = preferences.filters.assignee || preferences.filters.priority || preferences.filters.tag;

  return (
    <div className="flex flex-col min-h-0" data-testid={`column-${columnId}`}>
      <div className="flex items-center gap-2 mb-3">
        <div className={`w-3 h-3 rounded-full ${color}`} />
        <h3 className="font-medium text-gray-900">{title}</h3>
        <span className="text-sm text-gray-500">
          ({count}{hasActiveFilters && count !== totalCount ? ` / ${totalCount}` : ''})
        </span>
        <div className="ml-auto">
          <FilterSortDropdown
            columnId={columnId}
            availableAssignees={availableAssignees}
            availableTags={availableTags}
            preferences={preferences}
            onUpdate={onUpdatePreferences}
          />
        </div>
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
            {hasActiveFilters ? 'No matching tasks' : emptyMessage || 'No items'}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

// ============================================================================
// Task Slide-Over Panel
// ============================================================================

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

function EditableTitle({
  value,
  onSave,
  isUpdating,
}: {
  value: string;
  onSave: (value: string) => void;
  isUpdating: boolean;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  useEffect(() => {
    setEditValue(value);
  }, [value]);

  const handleSave = () => {
    if (editValue.trim() && editValue !== value) {
      onSave(editValue.trim());
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      setEditValue(value);
      setIsEditing(false);
    }
  };

  if (isEditing) {
    return (
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          className="flex-1 text-lg font-semibold text-gray-900 border border-blue-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
          data-testid="task-title-input"
        />
        {isUpdating && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 group">
      <h2
        className="text-lg font-semibold text-gray-900 truncate cursor-pointer hover:text-blue-600"
        onClick={() => setIsEditing(true)}
        data-testid="task-detail-title"
      >
        {value}
      </h2>
      <button
        onClick={() => setIsEditing(true)}
        className="p-1 opacity-0 group-hover:opacity-100 hover:bg-gray-100 rounded transition-opacity"
        aria-label="Edit title"
        data-testid="task-title-edit-button"
      >
        <Pencil className="w-3.5 h-3.5 text-gray-400" />
      </button>
      {isUpdating && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
    </div>
  );
}

function StatusDropdown({
  value,
  onSave,
  isUpdating,
}: {
  value: string;
  onSave: (value: string) => void;
  isUpdating: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const status = STATUS_CONFIG[value] || STATUS_CONFIG.open;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded cursor-pointer hover:ring-2 hover:ring-blue-300 ${status.color}`}
        disabled={isUpdating}
        data-testid="task-status-dropdown"
      >
        {status.icon}
        {status.label}
        {isUpdating && <Loader2 className="w-3 h-3 animate-spin ml-1" />}
      </button>
      {isOpen && (
        <div className="absolute z-10 mt-1 bg-white border border-gray-200 rounded-md shadow-lg py-1 min-w-[120px]" data-testid="task-status-options">
          {STATUS_OPTIONS.map((statusOption) => {
            const config = STATUS_CONFIG[statusOption] || STATUS_CONFIG.open;
            return (
              <button
                key={statusOption}
                onClick={() => {
                  if (statusOption !== value) {
                    onSave(statusOption);
                  }
                  setIsOpen(false);
                }}
                className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 flex items-center gap-2 ${statusOption === value ? 'bg-gray-50' : ''}`}
                data-testid={`task-status-option-${statusOption}`}
              >
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded ${config.color}`}>
                  {config.icon}
                  {config.label}
                </span>
                {statusOption === value && <Check className="w-3 h-3 text-blue-600 ml-auto" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PriorityDropdown({
  value,
  onSave,
  isUpdating,
}: {
  value: number;
  onSave: (value: number) => void;
  isUpdating: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const priority = PRIORITY_LABELS[value] || PRIORITY_LABELS[3];

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`px-2 py-0.5 text-xs font-medium rounded border cursor-pointer hover:ring-2 hover:ring-blue-300 ${priority.color}`}
        disabled={isUpdating}
        data-testid="task-priority-dropdown"
      >
        {priority.label}
        {isUpdating && <Loader2 className="w-3 h-3 animate-spin ml-1 inline" />}
      </button>
      {isOpen && (
        <div className="absolute z-10 mt-1 bg-white border border-gray-200 rounded-md shadow-lg py-1 min-w-[100px]" data-testid="task-priority-options">
          {PRIORITY_OPTIONS.map((priorityOption) => {
            const config = PRIORITY_LABELS[priorityOption] || PRIORITY_LABELS[3];
            return (
              <button
                key={priorityOption}
                onClick={() => {
                  if (priorityOption !== value) {
                    onSave(priorityOption);
                  }
                  setIsOpen(false);
                }}
                className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 flex items-center gap-2 ${priorityOption === value ? 'bg-gray-50' : ''}`}
                data-testid={`task-priority-option-${priorityOption}`}
              >
                <span className={`px-2 py-0.5 rounded border ${config.color}`}>
                  {config.label}
                </span>
                {priorityOption === value && <Check className="w-3 h-3 text-blue-600 ml-auto" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ComplexityDropdown({
  value,
  onSave,
  isUpdating,
}: {
  value: number;
  onSave: (value: number) => void;
  isUpdating: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const complexity = COMPLEXITY_LABELS[value] || COMPLEXITY_LABELS[3];

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="text-sm text-gray-900 cursor-pointer hover:text-blue-600 hover:underline"
        disabled={isUpdating}
        data-testid="task-complexity-dropdown"
      >
        {complexity}
        {isUpdating && <Loader2 className="w-3 h-3 animate-spin ml-1 inline" />}
      </button>
      {isOpen && (
        <div className="absolute z-10 mt-1 bg-white border border-gray-200 rounded-md shadow-lg py-1 min-w-[100px]" data-testid="task-complexity-options">
          {COMPLEXITY_OPTIONS.map((complexityOption) => {
            const label = COMPLEXITY_LABELS[complexityOption] || COMPLEXITY_LABELS[3];
            return (
              <button
                key={complexityOption}
                onClick={() => {
                  if (complexityOption !== value) {
                    onSave(complexityOption);
                  }
                  setIsOpen(false);
                }}
                className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 flex items-center justify-between ${complexityOption === value ? 'bg-gray-50' : ''}`}
                data-testid={`task-complexity-option-${complexityOption}`}
              >
                <span>{label}</span>
                {complexityOption === value && <Check className="w-3 h-3 text-blue-600" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DeleteConfirmDialog({
  isOpen,
  taskTitle,
  onConfirm,
  onCancel,
  isDeleting,
}: {
  isOpen: boolean;
  taskTitle: string;
  onConfirm: () => void;
  onCancel: () => void;
  isDeleting: boolean;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape' && !isDeleting) {
          onCancel();
        }
      };
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen, isDeleting, onCancel]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center"
      data-testid="delete-confirm-dialog"
    >
      <div
        className="absolute inset-0 bg-black/50"
        onClick={() => !isDeleting && onCancel()}
      />
      <div
        ref={dialogRef}
        className="relative bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6"
      >
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
            <Trash2 className="w-5 h-5 text-red-600" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-gray-900">Delete Task</h3>
            <p className="mt-2 text-sm text-gray-600">
              Are you sure you want to delete{' '}
              <span className="font-medium text-gray-900">"{taskTitle}"</span>?
              This action cannot be undone.
            </p>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={isDeleting}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
            data-testid="delete-cancel-button"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isDeleting}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50"
            data-testid="delete-confirm-button"
          >
            {isDeleting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Deleting...
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4" />
                Delete
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

interface TaskSlideOverProps {
  taskId: string;
  onClose: () => void;
}

function TaskSlideOver({ taskId, onClose }: TaskSlideOverProps) {
  const { data: task, isLoading, isError, error } = useTaskDetail(taskId);
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const [updateField, setUpdateField] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Handle escape key to close
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !showDeleteConfirm) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose, showDeleteConfirm]);

  const handleUpdate = (updates: Partial<TaskDetail>, fieldName: string) => {
    setUpdateField(fieldName);
    updateTask.mutate(
      { id: taskId, updates },
      {
        onSettled: () => setUpdateField(null),
      }
    );
  };

  const handleDelete = () => {
    deleteTask.mutate(taskId, {
      onSuccess: () => {
        setShowDeleteConfirm(false);
        onClose();
      },
    });
  };

  // Separate dependencies by type
  const blockers = task?._dependencies?.filter(d => d.type === 'blocks' || d.type === 'awaits') || [];
  const blocking = task?._dependents?.filter(d => d.type === 'blocks' || d.type === 'awaits') || [];

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 z-40"
        onClick={onClose}
        data-testid="slide-over-backdrop"
      />

      {/* Slide-over panel */}
      <div
        className="fixed right-0 top-0 h-full w-full max-w-lg bg-white shadow-xl z-50 flex flex-col animate-slide-in-right"
        data-testid="task-slide-over"
      >
        {/* Delete Confirmation Dialog */}
        {task && (
          <DeleteConfirmDialog
            isOpen={showDeleteConfirm}
            taskTitle={task.title}
            onConfirm={handleDelete}
            onCancel={() => setShowDeleteConfirm(false)}
            isDeleting={deleteTask.isPending}
          />
        )}

        {isLoading && (
          <div className="flex-1 flex items-center justify-center" data-testid="task-slide-over-loading">
            <div className="flex items-center gap-2 text-gray-500">
              <Loader2 className="w-5 h-5 animate-spin" />
              Loading task...
            </div>
          </div>
        )}

        {isError && (
          <div className="flex-1 flex flex-col items-center justify-center" data-testid="task-slide-over-error">
            <div className="text-red-600 mb-2">Failed to load task</div>
            <div className="text-sm text-gray-500">{(error as Error)?.message}</div>
          </div>
        )}

        {task && (
          <>
            {/* Header */}
            <div className="flex items-start justify-between p-4 border-b border-gray-200">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <StatusDropdown
                    value={task.status}
                    onSave={(status) => handleUpdate({ status }, 'status')}
                    isUpdating={updateField === 'status'}
                  />
                  <PriorityDropdown
                    value={task.priority}
                    onSave={(priority) => handleUpdate({ priority }, 'priority')}
                    isUpdating={updateField === 'priority'}
                  />
                </div>
                <EditableTitle
                  value={task.title}
                  onSave={(title) => handleUpdate({ title }, 'title')}
                  isUpdating={updateField === 'title'}
                />
                <div className="flex items-center gap-2 mt-1 text-xs text-gray-500 font-mono">
                  <span data-testid="task-slide-over-id">{task.id}</span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                  aria-label="Delete task"
                  data-testid="task-slide-over-delete-button"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
                <button
                  onClick={onClose}
                  className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
                  aria-label="Close panel"
                  data-testid="task-slide-over-close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
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
                  <ComplexityDropdown
                    value={task.complexity}
                    onSave={(complexity) => handleUpdate({ complexity }, 'complexity')}
                    isUpdating={updateField === 'complexity'}
                  />
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
                  <div className="prose prose-sm max-w-none text-gray-700 bg-gray-50 rounded-lg p-3" data-testid="task-slide-over-description">
                    <pre className="whitespace-pre-wrap font-sans text-sm">{task.description}</pre>
                  </div>
                </div>
              )}

              {/* Design */}
              {task.design && (
                <div className="mb-6">
                  <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Design</div>
                  <div className="prose prose-sm max-w-none text-gray-700 bg-gray-50 rounded-lg p-3" data-testid="task-slide-over-design">
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

              {/* Update error display */}
              {updateTask.isError && (
                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700" data-testid="task-update-error">
                  Failed to update task: {(updateTask.error as Error)?.message}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}

// ============================================================================
// Main Page Component
// ============================================================================

export function TaskFlowPage() {
  const readyTasks = useReadyTasks();
  const inProgressTasks = useInProgressTasks();
  const blockedTasks = useBlockedTasks();
  const completedTasks = useCompletedTasks();
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  // Column preferences with localStorage persistence
  const [readyPrefs, setReadyPrefs] = useColumnPreferences('ready');
  const [inProgressPrefs, setInProgressPrefs] = useColumnPreferences('in-progress');
  const [blockedPrefs, setBlockedPrefs] = useColumnPreferences('blocked');
  const [completedPrefs, setCompletedPrefs] = useColumnPreferences('completed');

  // Apply filters and sorting
  const filteredReadyTasks = useMemo(
    () => applyFiltersAndSort(readyTasks.data, readyPrefs.filters, readyPrefs.sort),
    [readyTasks.data, readyPrefs.filters, readyPrefs.sort]
  );

  const filteredInProgressTasks = useMemo(
    () => applyFiltersAndSort(inProgressTasks.data, inProgressPrefs.filters, inProgressPrefs.sort),
    [inProgressTasks.data, inProgressPrefs.filters, inProgressPrefs.sort]
  );

  const filteredBlockedTasks = useMemo(
    () => applyFiltersAndSort(blockedTasks.data, blockedPrefs.filters, blockedPrefs.sort),
    [blockedTasks.data, blockedPrefs.filters, blockedPrefs.sort]
  );

  const filteredCompletedTasks = useMemo(
    () => applyFiltersAndSort(completedTasks.data, completedPrefs.filters, completedPrefs.sort),
    [completedTasks.data, completedPrefs.filters, completedPrefs.sort]
  );

  // Collect unique assignees and tags from all tasks for filter dropdowns
  const allTasks = useMemo(() => [
    ...(readyTasks.data || []),
    ...(inProgressTasks.data || []),
    ...(blockedTasks.data || []),
    ...(completedTasks.data || []),
  ], [readyTasks.data, inProgressTasks.data, blockedTasks.data, completedTasks.data]);

  const allAssignees = useMemo(() => getUniqueAssignees(allTasks), [allTasks]);
  const allTags = useMemo(() => getUniqueTags(allTasks), [allTasks]);

  const handleTaskClick = (taskId: string) => {
    setSelectedTaskId(taskId);
  };

  const handleCloseSlideOver = () => {
    setSelectedTaskId(null);
  };

  return (
    <div className="h-full flex flex-col" data-testid="task-flow-page">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-medium text-gray-900">Task Flow</h2>
        <p className="text-sm text-gray-500">
          Real-time view of task states
        </p>
      </div>

      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 min-h-0">
        {/* Ready Tasks Column */}
        <Column
          title="Ready"
          columnId="ready"
          count={filteredReadyTasks.length}
          totalCount={readyTasks.data?.length ?? 0}
          color="bg-green-500"
          isLoading={readyTasks.isLoading}
          isError={readyTasks.isError}
          emptyMessage="No tasks ready to work on"
          availableAssignees={allAssignees}
          availableTags={allTags}
          preferences={readyPrefs}
          onUpdatePreferences={setReadyPrefs}
        >
          {filteredReadyTasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onClick={() => handleTaskClick(task.id)}
            />
          ))}
        </Column>

        {/* In Progress Tasks Column */}
        <Column
          title="In Progress"
          columnId="in-progress"
          count={filteredInProgressTasks.length}
          totalCount={inProgressTasks.data?.length ?? 0}
          color="bg-yellow-500"
          isLoading={inProgressTasks.isLoading}
          isError={inProgressTasks.isError}
          emptyMessage="No tasks in progress"
          availableAssignees={allAssignees}
          availableTags={allTags}
          preferences={inProgressPrefs}
          onUpdatePreferences={setInProgressPrefs}
        >
          {filteredInProgressTasks.map((task) => (
            <InProgressTaskCard
              key={task.id}
              task={task}
              onClick={() => handleTaskClick(task.id)}
            />
          ))}
        </Column>

        {/* Blocked Tasks Column */}
        <Column
          title="Blocked"
          columnId="blocked"
          count={filteredBlockedTasks.length}
          totalCount={blockedTasks.data?.length ?? 0}
          color="bg-red-500"
          isLoading={blockedTasks.isLoading}
          isError={blockedTasks.isError}
          emptyMessage="No blocked tasks"
          availableAssignees={allAssignees}
          availableTags={allTags}
          preferences={blockedPrefs}
          onUpdatePreferences={setBlockedPrefs}
        >
          {filteredBlockedTasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              showBlockReason
              onClick={() => handleTaskClick(task.id)}
            />
          ))}
        </Column>

        {/* Completed Tasks Column */}
        <Column
          title="Completed"
          columnId="completed"
          count={filteredCompletedTasks.length}
          totalCount={completedTasks.data?.length ?? 0}
          color="bg-blue-500"
          isLoading={completedTasks.isLoading}
          isError={completedTasks.isError}
          emptyMessage="No recently completed tasks"
          availableAssignees={allAssignees}
          availableTags={allTags}
          preferences={completedPrefs}
          onUpdatePreferences={setCompletedPrefs}
        >
          {filteredCompletedTasks.map((task) => (
            <CompletedTaskCard
              key={task.id}
              task={task}
              onClick={() => handleTaskClick(task.id)}
            />
          ))}
        </Column>
      </div>

      {/* Task Slide-Over Panel */}
      {selectedTaskId && (
        <TaskSlideOver
          taskId={selectedTaskId}
          onClose={handleCloseSlideOver}
        />
      )}
    </div>
  );
}

import { useState, useRef, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearch, useNavigate } from '@tanstack/react-router';
import { Plus, List, LayoutGrid, CheckSquare, Square, X, ChevronDown, Loader2, Trash2, ArrowUp, ArrowDown, ArrowUpDown, Filter, XCircle } from 'lucide-react';
import { TaskDetailPanel } from '../components/task/TaskDetailPanel';
import { CreateTaskModal } from '../components/task/CreateTaskModal';
import { KanbanBoard } from '../components/task/KanbanBoard';
import { Pagination } from '../components/shared/Pagination';

const VIEW_MODE_STORAGE_KEY = 'tasks.viewMode';

function getStoredViewMode(): ViewMode {
  if (typeof window === 'undefined') return 'list';
  const stored = localStorage.getItem(VIEW_MODE_STORAGE_KEY);
  return stored === 'kanban' ? 'kanban' : 'list';
}

function setStoredViewMode(mode: ViewMode) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode);
}

type ViewMode = 'list' | 'kanban';
type SortDirection = 'asc' | 'desc';
type SortField = 'title' | 'status' | 'priority' | 'taskType' | 'assignee' | 'created_at' | 'updated_at';

interface SortConfig {
  field: SortField;
  direction: SortDirection;
}

interface FilterConfig {
  status: string[];
  priority: number[];
  assignee: string;
}

const EMPTY_FILTER: FilterConfig = {
  status: [],
  priority: [],
  assignee: '',
};

const STATUS_OPTIONS = [
  { value: 'open', label: 'Open', color: 'bg-green-100 text-green-800' },
  { value: 'in_progress', label: 'In Progress', color: 'bg-blue-100 text-blue-800' },
  { value: 'blocked', label: 'Blocked', color: 'bg-yellow-100 text-yellow-800' },
  { value: 'closed', label: 'Closed', color: 'bg-gray-100 text-gray-800' },
  { value: 'deferred', label: 'Deferred', color: 'bg-purple-100 text-purple-800' },
];

const PRIORITY_OPTIONS = [
  { value: 1, label: 'Critical', color: 'bg-red-100 text-red-800' },
  { value: 2, label: 'High', color: 'bg-orange-100 text-orange-800' },
  { value: 3, label: 'Medium', color: 'bg-yellow-100 text-yellow-800' },
  { value: 4, label: 'Low', color: 'bg-green-100 text-green-800' },
  { value: 5, label: 'Trivial', color: 'bg-gray-100 text-gray-800' },
];

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

interface PaginatedResult<T> {
  items: T[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
}

const DEFAULT_PAGE_SIZE = 25;
const DEFAULT_SORT: SortConfig = { field: 'updated_at', direction: 'desc' };

function useTasks(
  page: number,
  pageSize: number = DEFAULT_PAGE_SIZE,
  sort: SortConfig = DEFAULT_SORT,
  filters: FilterConfig = EMPTY_FILTER
) {
  const offset = (page - 1) * pageSize;

  return useQuery<PaginatedResult<Task>>({
    queryKey: ['tasks', 'paginated', page, pageSize, sort.field, sort.direction, filters],
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: pageSize.toString(),
        offset: offset.toString(),
        orderBy: sort.field,
        orderDir: sort.direction,
      });

      // Add filter parameters
      if (filters.status.length > 0) {
        params.set('status', filters.status.join(','));
      }
      if (filters.priority.length > 0) {
        params.set('priority', filters.priority.join(','));
      }
      if (filters.assignee) {
        params.set('assignee', filters.assignee);
      }

      const response = await fetch(`/api/tasks?${params}`);
      if (!response.ok) throw new Error('Failed to fetch tasks');
      return response.json();
    },
  });
}

function useBulkUpdate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ ids, updates }: { ids: string[]; updates: Record<string, unknown> }) => {
      const response = await fetch('/api/tasks/bulk', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, updates }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to update tasks');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['tasks', 'ready'] });
      queryClient.invalidateQueries({ queryKey: ['tasks', 'blocked'] });
      queryClient.invalidateQueries({ queryKey: ['tasks', 'completed'] });
    },
  });
}

function useBulkDelete() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (ids: string[]) => {
      console.log('[bulk-delete] Starting delete for ids:', ids);
      const response = await fetch('/api/tasks/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });

      console.log('[bulk-delete] Response status:', response.status);

      if (!response.ok) {
        const error = await response.json();
        console.error('[bulk-delete] Error response:', error);
        throw new Error(error.error?.message || 'Failed to delete tasks');
      }

      const result = await response.json();
      console.log('[bulk-delete] Success response:', result);
      return result;
    },
    onSuccess: (data, ids) => {
      console.log('[bulk-delete] onSuccess called with:', data);
      // Remove deleted tasks from cache
      for (const id of ids) {
        queryClient.removeQueries({ queryKey: ['tasks', id] });
      }
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['tasks', 'ready'] });
      queryClient.invalidateQueries({ queryKey: ['tasks', 'blocked'] });
      queryClient.invalidateQueries({ queryKey: ['tasks', 'completed'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    },
    onError: (error) => {
      console.error('[bulk-delete] onError called:', error);
    },
  });
}

interface Entity {
  id: string;
  name: string;
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
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });
}

const PRIORITY_LABELS: Record<number, { label: string; color: string }> = {
  1: { label: 'Critical', color: 'bg-red-100 text-red-800' },
  2: { label: 'High', color: 'bg-orange-100 text-orange-800' },
  3: { label: 'Medium', color: 'bg-yellow-100 text-yellow-800' },
  4: { label: 'Low', color: 'bg-green-100 text-green-800' },
  5: { label: 'Trivial', color: 'bg-gray-100 text-gray-800' },
};

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-blue-100 text-blue-800',
  in_progress: 'bg-yellow-100 text-yellow-800',
  blocked: 'bg-red-100 text-red-800',
  completed: 'bg-green-100 text-green-800',
  cancelled: 'bg-gray-100 text-gray-800',
};

function TaskRow({
  task,
  isSelected,
  isChecked,
  onCheck,
  onClick,
  showCheckbox
}: {
  task: Task;
  isSelected: boolean;
  isChecked: boolean;
  onCheck: (checked: boolean) => void;
  onClick: () => void;
  showCheckbox: boolean;
}) {
  const priority = PRIORITY_LABELS[task.priority] || PRIORITY_LABELS[3];
  const statusColor = STATUS_COLORS[task.status] || STATUS_COLORS.open;

  const handleCheckboxClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onCheck(!isChecked);
  };

  return (
    <tr
      className={`cursor-pointer transition-colors ${isSelected ? 'bg-blue-50 hover:bg-blue-100' : 'hover:bg-gray-50'}`}
      onClick={onClick}
      data-testid={`task-row-${task.id}`}
    >
      {showCheckbox && (
        <td className="px-2 py-3 w-10">
          <button
            onClick={handleCheckboxClick}
            className="p-1 hover:bg-gray-200 rounded"
            data-testid={`task-checkbox-${task.id}`}
          >
            {isChecked ? (
              <CheckSquare className="w-4 h-4 text-blue-600" />
            ) : (
              <Square className="w-4 h-4 text-gray-400" />
            )}
          </button>
        </td>
      )}
      <td className="px-4 py-3">
        <div>
          <div className="font-medium text-gray-900">{task.title}</div>
          <div className="text-xs text-gray-500 font-mono">{task.id}</div>
        </div>
      </td>
      <td className="px-4 py-3">
        <span className={`px-2 py-1 text-xs font-medium rounded ${statusColor}`}>
          {task.status.replace('_', ' ')}
        </span>
      </td>
      <td className="px-4 py-3">
        <span className={`px-2 py-1 text-xs font-medium rounded ${priority.color}`}>
          {priority.label}
        </span>
      </td>
      <td className="px-4 py-3 text-sm text-gray-600 capitalize">
        {task.taskType}
      </td>
      <td className="px-4 py-3 text-sm text-gray-600">
        {task.assignee || '-'}
      </td>
      <td className="px-4 py-3">
        <div className="flex gap-1">
          {task.tags.slice(0, 2).map((tag) => (
            <span key={tag} className="px-1.5 py-0.5 text-xs bg-gray-200 rounded">
              {tag}
            </span>
          ))}
          {task.tags.length > 2 && (
            <span className="text-xs text-gray-500">+{task.tags.length - 2}</span>
          )}
        </div>
      </td>
    </tr>
  );
}

function ViewToggle({ view, onViewChange }: { view: ViewMode; onViewChange: (view: ViewMode) => void }) {
  return (
    <div className="flex items-center bg-gray-100 rounded-md p-0.5" data-testid="view-toggle">
      <button
        onClick={() => onViewChange('list')}
        className={`inline-flex items-center gap-1 px-2 py-1 text-sm rounded transition-all duration-200 ${
          view === 'list' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
        }`}
        data-testid="view-toggle-list"
        aria-label="List view (V L)"
        title="List view (V L)"
      >
        <List className="w-4 h-4" />
        <span className="sr-only">List</span>
      </button>
      <button
        onClick={() => onViewChange('kanban')}
        className={`inline-flex items-center gap-1 px-2 py-1 text-sm rounded transition-all duration-200 ${
          view === 'kanban' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
        }`}
        data-testid="view-toggle-kanban"
        aria-label="Kanban view (V K)"
        title="Kanban view (V K)"
      >
        <LayoutGrid className="w-4 h-4" />
        <span className="sr-only">Kanban</span>
      </button>
    </div>
  );
}

function BulkActionMenu({
  selectedCount,
  onChangeStatus,
  onChangePriority,
  onDelete,
  onClear,
  isPending,
  isDeleting
}: {
  selectedCount: number;
  onChangeStatus: (status: string) => void;
  onChangePriority: (priority: number) => void;
  onDelete: () => void;
  onClear: () => void;
  isPending: boolean;
  isDeleting: boolean;
}) {
  const [isStatusOpen, setIsStatusOpen] = useState(false);
  const [isPriorityOpen, setIsPriorityOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const statusRef = useRef<HTMLDivElement>(null);
  const priorityRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (statusRef.current && !statusRef.current.contains(event.target as Node)) {
        setIsStatusOpen(false);
      }
      if (priorityRef.current && !priorityRef.current.contains(event.target as Node)) {
        setIsPriorityOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Track if deletion was in progress to detect completion
  const wasDeleting = useRef(false);

  // Close delete confirm when deletion completes (transitions from true to false)
  useEffect(() => {
    if (isDeleting) {
      wasDeleting.current = true;
    } else if (wasDeleting.current && showDeleteConfirm) {
      // Deletion just completed
      wasDeleting.current = false;
      setShowDeleteConfirm(false);
    }
  }, [isDeleting, showDeleteConfirm]);

  const handleDeleteClick = () => {
    setIsStatusOpen(false);
    setIsPriorityOpen(false);
    setShowDeleteConfirm(true);
  };

  const handleConfirmDelete = () => {
    onDelete();
  };

  return (
    <div
      className="flex items-center gap-2 px-4 py-2 bg-blue-50 border-b border-blue-200"
      data-testid="bulk-action-menu"
    >
      <span className="text-sm font-medium text-blue-700" data-testid="bulk-selected-count">
        {selectedCount} selected
      </span>

      {/* Status dropdown */}
      <div className="relative" ref={statusRef}>
        <button
          onClick={() => { setIsPriorityOpen(false); setIsStatusOpen(!isStatusOpen); }}
          disabled={isPending || isDeleting}
          className="inline-flex items-center gap-1 px-2 py-1 text-sm bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
          data-testid="bulk-status-button"
        >
          Set Status
          <ChevronDown className="w-3 h-3" />
        </button>
        {isStatusOpen && (
          <div
            className="absolute z-10 mt-1 bg-white border border-gray-200 rounded-md shadow-lg py-1 min-w-32"
            data-testid="bulk-status-options"
          >
            {STATUS_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => {
                  onChangeStatus(option.value);
                  setIsStatusOpen(false);
                }}
                className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50"
                data-testid={`bulk-status-option-${option.value}`}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Priority dropdown */}
      <div className="relative" ref={priorityRef}>
        <button
          onClick={() => { setIsStatusOpen(false); setIsPriorityOpen(!isPriorityOpen); }}
          disabled={isPending || isDeleting}
          className="inline-flex items-center gap-1 px-2 py-1 text-sm bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
          data-testid="bulk-priority-button"
        >
          Set Priority
          <ChevronDown className="w-3 h-3" />
        </button>
        {isPriorityOpen && (
          <div
            className="absolute z-10 mt-1 bg-white border border-gray-200 rounded-md shadow-lg py-1 min-w-32"
            data-testid="bulk-priority-options"
          >
            {PRIORITY_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => {
                  onChangePriority(option.value);
                  setIsPriorityOpen(false);
                }}
                className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50"
                data-testid={`bulk-priority-option-${option.value}`}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Delete button */}
      {!showDeleteConfirm ? (
        <button
          onClick={handleDeleteClick}
          disabled={isPending || isDeleting}
          className="inline-flex items-center gap-1 px-2 py-1 text-sm text-red-600 bg-white border border-red-300 rounded hover:bg-red-50 disabled:opacity-50"
          data-testid="bulk-delete-button"
        >
          <Trash2 className="w-3 h-3" />
          Delete
        </button>
      ) : (
        <div className="inline-flex items-center gap-2 px-2 py-1 bg-red-50 border border-red-300 rounded" data-testid="bulk-delete-confirm">
          <span className="text-sm text-red-700">Delete {selectedCount} tasks?</span>
          <button
            onClick={handleConfirmDelete}
            disabled={isDeleting}
            className="px-2 py-0.5 text-xs font-medium text-white bg-red-600 rounded hover:bg-red-700 disabled:opacity-50"
            data-testid="bulk-delete-confirm-button"
          >
            {isDeleting ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              'Confirm'
            )}
          </button>
          <button
            onClick={() => setShowDeleteConfirm(false)}
            disabled={isDeleting}
            className="px-2 py-0.5 text-xs font-medium text-gray-600 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
            data-testid="bulk-delete-cancel-button"
          >
            Cancel
          </button>
        </div>
      )}

      {isPending && <Loader2 className="w-4 h-4 animate-spin text-blue-600" />}

      {/* Clear selection */}
      <button
        onClick={onClear}
        disabled={isDeleting}
        className="ml-auto p-1 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded disabled:opacity-50"
        data-testid="bulk-clear-selection"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

function FilterBar({
  filters,
  onFilterChange,
  onClearFilters,
  entities,
}: {
  filters: FilterConfig;
  onFilterChange: (filters: FilterConfig) => void;
  onClearFilters: () => void;
  entities: Entity[];
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const hasActiveFilters = filters.status.length > 0 || filters.priority.length > 0 || filters.assignee !== '';
  const activeFilterCount = filters.status.length + filters.priority.length + (filters.assignee ? 1 : 0);

  const toggleStatus = (status: string) => {
    const newStatus = filters.status.includes(status)
      ? filters.status.filter(s => s !== status)
      : [...filters.status, status];
    onFilterChange({ ...filters, status: newStatus });
  };

  const togglePriority = (priority: number) => {
    const newPriority = filters.priority.includes(priority)
      ? filters.priority.filter(p => p !== priority)
      : [...filters.priority, priority];
    onFilterChange({ ...filters, priority: newPriority });
  };

  return (
    <div className="border-b border-gray-200 bg-gray-50" data-testid="filter-bar">
      {/* Filter toggle button */}
      <div className="px-4 py-2 flex items-center justify-between">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
          data-testid="filter-toggle"
        >
          <Filter className="w-4 h-4" />
          <span>Filters</span>
          {activeFilterCount > 0 && (
            <span className="px-1.5 py-0.5 text-xs font-medium bg-blue-100 text-blue-800 rounded-full">
              {activeFilterCount}
            </span>
          )}
          <ChevronDown className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
        </button>

        {hasActiveFilters && (
          <button
            onClick={onClearFilters}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
            data-testid="clear-filters"
          >
            <XCircle className="w-4 h-4" />
            <span>Clear all</span>
          </button>
        )}
      </div>

      {/* Expanded filter options */}
      {isExpanded && (
        <div className="px-4 pb-3 space-y-3">
          {/* Status filter */}
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase mb-1.5">Status</label>
            <div className="flex flex-wrap gap-1.5">
              {STATUS_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  onClick={() => toggleStatus(option.value)}
                  className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                    filters.status.includes(option.value)
                      ? `${option.color} border-transparent font-medium`
                      : 'bg-white border-gray-300 text-gray-600 hover:border-gray-400'
                  }`}
                  data-testid={`filter-status-${option.value}`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* Priority filter */}
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase mb-1.5">Priority</label>
            <div className="flex flex-wrap gap-1.5">
              {PRIORITY_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  onClick={() => togglePriority(option.value)}
                  className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                    filters.priority.includes(option.value)
                      ? `${option.color} border-transparent font-medium`
                      : 'bg-white border-gray-300 text-gray-600 hover:border-gray-400'
                  }`}
                  data-testid={`filter-priority-${option.value}`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* Assignee filter */}
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase mb-1.5">Assignee</label>
            <select
              value={filters.assignee}
              onChange={(e) => onFilterChange({ ...filters, assignee: e.target.value })}
              className="w-full max-w-xs px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white"
              data-testid="filter-assignee"
            >
              <option value="">All assignees</option>
              {entities.map((entity) => (
                <option key={entity.id} value={entity.id}>
                  {entity.name || entity.id}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Active filter chips (shown when collapsed) */}
      {!isExpanded && hasActiveFilters && (
        <div className="px-4 pb-2 flex flex-wrap gap-1.5">
          {filters.status.map((status) => {
            const option = STATUS_OPTIONS.find(o => o.value === status);
            return (
              <span
                key={status}
                className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full ${option?.color || 'bg-gray-100 text-gray-800'}`}
              >
                {option?.label || status}
                <button
                  onClick={() => toggleStatus(status)}
                  className="hover:opacity-70"
                  aria-label={`Remove ${option?.label || status} filter`}
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            );
          })}
          {filters.priority.map((priority) => {
            const option = PRIORITY_OPTIONS.find(o => o.value === priority);
            return (
              <span
                key={priority}
                className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full ${option?.color || 'bg-gray-100 text-gray-800'}`}
              >
                {option?.label || priority}
                <button
                  onClick={() => togglePriority(priority)}
                  className="hover:opacity-70"
                  aria-label={`Remove ${option?.label || priority} filter`}
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            );
          })}
          {filters.assignee && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-800">
              Assignee: {entities.find(e => e.id === filters.assignee)?.name || filters.assignee}
              <button
                onClick={() => onFilterChange({ ...filters, assignee: '' })}
                className="hover:opacity-70"
                aria-label="Remove assignee filter"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function SortableHeader({
  label,
  field,
  currentSort,
  onSort,
}: {
  label: string;
  field: SortField;
  currentSort: SortConfig;
  onSort: (field: SortField) => void;
}) {
  const isActive = currentSort.field === field;

  return (
    <th
      className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
      onClick={() => onSort(field)}
      data-testid={`sort-header-${field}`}
    >
      <div className="flex items-center gap-1">
        <span>{label}</span>
        {isActive ? (
          currentSort.direction === 'asc' ? (
            <ArrowUp className="w-3.5 h-3.5 text-blue-600" />
          ) : (
            <ArrowDown className="w-3.5 h-3.5 text-blue-600" />
          )
        ) : (
          <ArrowUpDown className="w-3.5 h-3.5 text-gray-300" />
        )}
      </div>
    </th>
  );
}

function ListView({
  tasks,
  selectedTaskId,
  selectedIds,
  onTaskClick,
  onTaskCheck,
  onSelectAll,
  sort,
  onSort,
}: {
  tasks: Task[];
  selectedTaskId: string | null;
  selectedIds: Set<string>;
  onTaskClick: (taskId: string) => void;
  onTaskCheck: (taskId: string, checked: boolean) => void;
  onSelectAll: () => void;
  sort: SortConfig;
  onSort: (field: SortField) => void;
}) {
  if (tasks.length === 0) {
    return (
      <div className="p-6 text-center text-gray-500">
        No tasks found.
      </div>
    );
  }

  const allSelected = tasks.length > 0 && tasks.every(t => selectedIds.has(t.id));
  const someSelected = selectedIds.size > 0;

  return (
    <table className="min-w-full divide-y divide-gray-200" data-testid="tasks-list-view">
      <thead className="bg-gray-50 sticky top-0">
        <tr>
          <th className="px-2 py-3 w-10">
            <button
              onClick={onSelectAll}
              className="p-1 hover:bg-gray-200 rounded"
              data-testid="task-select-all"
            >
              {allSelected ? (
                <CheckSquare className="w-4 h-4 text-blue-600" />
              ) : someSelected ? (
                <div className="w-4 h-4 border-2 border-blue-600 rounded flex items-center justify-center">
                  <div className="w-2 h-0.5 bg-blue-600" />
                </div>
              ) : (
                <Square className="w-4 h-4 text-gray-400" />
              )}
            </button>
          </th>
          <SortableHeader label="Task" field="title" currentSort={sort} onSort={onSort} />
          <SortableHeader label="Status" field="status" currentSort={sort} onSort={onSort} />
          <SortableHeader label="Priority" field="priority" currentSort={sort} onSort={onSort} />
          <SortableHeader label="Type" field="taskType" currentSort={sort} onSort={onSort} />
          <SortableHeader label="Assignee" field="assignee" currentSort={sort} onSort={onSort} />
          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
            Tags
          </th>
        </tr>
      </thead>
      <tbody className="bg-white divide-y divide-gray-200">
        {tasks.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            isSelected={task.id === selectedTaskId}
            isChecked={selectedIds.has(task.id)}
            onCheck={(checked) => onTaskCheck(task.id, checked)}
            onClick={() => onTaskClick(task.id)}
            showCheckbox={true}
          />
        ))}
      </tbody>
    </table>
  );
}

export function TasksPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: '/tasks' });

  // Pagination state from URL
  const currentPage = search.page ?? 1;
  const pageSize = search.limit ?? DEFAULT_PAGE_SIZE;
  const selectedFromUrl = search.selected ?? null;

  const [sort, setSort] = useState<SortConfig>(DEFAULT_SORT);
  const [filters, setFilters] = useState<FilterConfig>(EMPTY_FILTER);
  const tasks = useTasks(currentPage, pageSize, sort, filters);
  const bulkUpdate = useBulkUpdate();
  const bulkDelete = useBulkDelete();
  const entities = useEntities();
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(selectedFromUrl);

  // Sync selectedTaskId with URL parameter
  useEffect(() => {
    if (selectedFromUrl) {
      setSelectedTaskId(selectedFromUrl);
    }
  }, [selectedFromUrl]);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>(getStoredViewMode);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Handle view mode changes and persist to localStorage
  const handleViewModeChange = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    setStoredViewMode(mode);
  }, []);

  // Keyboard shortcuts for view toggle (V L = list, V K = kanban)
  useEffect(() => {
    let lastKey = '';
    let lastKeyTime = 0;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle if typing in an input/textarea
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      const now = Date.now();
      const key = e.key.toLowerCase();

      // Check for V + L or V + K sequence within 500ms
      if (key === 'v') {
        lastKey = 'v';
        lastKeyTime = now;
        return;
      }

      if (lastKey === 'v' && now - lastKeyTime < 500) {
        if (key === 'l') {
          e.preventDefault();
          handleViewModeChange('list');
        } else if (key === 'k') {
          e.preventDefault();
          handleViewModeChange('kanban');
        }
      }

      lastKey = '';
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleViewModeChange]);

  // Extract task items from paginated response
  const taskItems = tasks.data?.items ?? [];
  const totalItems = tasks.data?.total ?? 0;
  const totalPages = Math.ceil(totalItems / pageSize);

  const handleTaskClick = (taskId: string) => {
    setSelectedTaskId(taskId);
  };

  const handleCloseDetail = () => {
    setSelectedTaskId(null);
  };

  const handleCreateSuccess = (task: { id: string }) => {
    // Optionally select the newly created task
    setSelectedTaskId(task.id);
  };

  const handleTaskCheck = (taskId: string, checked: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (checked) {
        next.add(taskId);
      } else {
        next.delete(taskId);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (taskItems.length === 0) return;

    const allSelected = taskItems.every(t => selectedIds.has(t.id));
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(taskItems.map(t => t.id)));
    }
  };

  const handlePageChange = (page: number) => {
    navigate({ to: '/tasks', search: { page, limit: pageSize } });
    // Clear selection when changing pages
    setSelectedIds(new Set());
  };

  const handlePageSizeChange = (newPageSize: number) => {
    // When page size changes, go back to page 1
    navigate({ to: '/tasks', search: { page: 1, limit: newPageSize } });
    setSelectedIds(new Set());
  };

  const handleSort = (field: SortField) => {
    setSort(prev => ({
      field,
      // Toggle direction if same field, otherwise default to desc
      direction: prev.field === field && prev.direction === 'desc' ? 'asc' : 'desc',
    }));
    // Reset to first page when sort changes
    navigate({ to: '/tasks', search: { page: 1, limit: pageSize } });
  };

  const handleFilterChange = (newFilters: FilterConfig) => {
    setFilters(newFilters);
    // Reset to first page when filters change
    navigate({ to: '/tasks', search: { page: 1, limit: pageSize } });
  };

  const handleClearFilters = () => {
    setFilters(EMPTY_FILTER);
    navigate({ to: '/tasks', search: { page: 1, limit: pageSize } });
  };

  const handleBulkStatusChange = (status: string) => {
    bulkUpdate.mutate(
      { ids: Array.from(selectedIds), updates: { status } },
      { onSuccess: () => setSelectedIds(new Set()) }
    );
  };

  const handleBulkPriorityChange = (priority: number) => {
    bulkUpdate.mutate(
      { ids: Array.from(selectedIds), updates: { priority } },
      { onSuccess: () => setSelectedIds(new Set()) }
    );
  };

  const handleBulkDelete = () => {
    // If the currently selected task is being deleted, close the detail panel
    const idsToDelete = Array.from(selectedIds);
    if (selectedTaskId && idsToDelete.includes(selectedTaskId)) {
      setSelectedTaskId(null);
    }
    bulkDelete.mutate(idsToDelete, {
      onSuccess: () => setSelectedIds(new Set()),
    });
  };

  const handleClearSelection = () => {
    setSelectedIds(new Set());
  };

  return (
    <div className="flex h-full" data-testid="tasks-page">
      {/* Create Task Modal */}
      <CreateTaskModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={handleCreateSuccess}
      />

      {/* Task List - shrinks when detail panel is open */}
      <div className={`flex flex-col ${selectedTaskId ? 'w-1/2' : 'w-full'} transition-all duration-200`}>
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-lg font-medium text-gray-900">Tasks</h2>
          <div className="flex items-center gap-3">
            <ViewToggle view={viewMode} onViewChange={handleViewModeChange} />
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors"
              data-testid="create-task-button"
            >
              <Plus className="w-4 h-4" />
              Create Task
            </button>
          </div>
        </div>

        {/* Bulk Action Menu */}
        {selectedIds.size > 0 && viewMode === 'list' && (
          <BulkActionMenu
            selectedCount={selectedIds.size}
            onChangeStatus={handleBulkStatusChange}
            onChangePriority={handleBulkPriorityChange}
            onDelete={handleBulkDelete}
            onClear={handleClearSelection}
            isPending={bulkUpdate.isPending}
            isDeleting={bulkDelete.isPending}
          />
        )}

        {/* Filter Bar */}
        {viewMode === 'list' && (
          <FilterBar
            filters={filters}
            onFilterChange={handleFilterChange}
            onClearFilters={handleClearFilters}
            entities={entities.data ?? []}
          />
        )}

        <div className="flex-1 overflow-auto" data-testid="tasks-view-container">
          {tasks.isLoading && (
            <div className="p-4 text-gray-500">Loading tasks...</div>
          )}

          {tasks.isError && (
            <div className="p-4 text-red-600">Failed to load tasks</div>
          )}

          {tasks.data && viewMode === 'list' && (
            <div className="animate-fade-in" data-testid="list-view-content">
              <ListView
                tasks={taskItems}
                selectedTaskId={selectedTaskId}
                selectedIds={selectedIds}
                onTaskClick={handleTaskClick}
                onTaskCheck={handleTaskCheck}
                onSelectAll={handleSelectAll}
                sort={sort}
                onSort={handleSort}
              />
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                totalItems={totalItems}
                pageSize={pageSize}
                onPageChange={handlePageChange}
                onPageSizeChange={handlePageSizeChange}
              />
            </div>
          )}

          {tasks.data && viewMode === 'kanban' && (
            <div className="animate-fade-in" data-testid="kanban-view-content">
              <KanbanBoard
                tasks={taskItems}
                selectedTaskId={selectedTaskId}
                onTaskClick={handleTaskClick}
              />
            </div>
          )}
        </div>
      </div>

      {/* Task Detail Panel */}
      {selectedTaskId && (
        <div className="w-1/2 border-l border-gray-200" data-testid="task-detail-container">
          <TaskDetailPanel taskId={selectedTaskId} onClose={handleCloseDetail} />
        </div>
      )}
    </div>
  );
}

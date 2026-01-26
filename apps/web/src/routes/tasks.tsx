import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearch, useNavigate } from '@tanstack/react-router';
import { Plus, List, LayoutGrid, CheckSquare, Square, X, ChevronDown, ChevronRight, Loader2, Trash2, ArrowUp, ArrowDown, ArrowUpDown, Filter, XCircle, Sparkles, Layers, Search, SlidersHorizontal } from 'lucide-react';
import { useDebounce, useIsMobile, useIsTablet, useGlobalQuickActions, useShortcutVersion } from '../hooks';
import { getCurrentBinding } from '../lib/keyboard';
import { TaskDetailPanel } from '../components/task/TaskDetailPanel';
import { KanbanBoard } from '../components/task/KanbanBoard';
import { Pagination } from '../components/shared/Pagination';
import { VirtualizedList } from '../components/shared/VirtualizedList';
import { ElementNotFound } from '../components/shared/ElementNotFound';
import { MobileDetailSheet } from '../components/shared/MobileDetailSheet';
import { MobileTaskCard } from '../components/task/MobileTaskCard';
import { useAllTasks } from '../api/hooks/useAllElements';
import { usePaginatedData, createTaskFilter, type SortConfig as PaginatedSortConfig } from '../hooks/usePaginatedData';
import { useDeepLink } from '../hooks/useDeepLink';

const VIEW_MODE_STORAGE_KEY = 'tasks.viewMode';
const GROUP_BY_STORAGE_KEY = 'tasks.groupBy';
const SEARCH_STORAGE_KEY = 'tasks.search';

// Search debounce delay in milliseconds
const SEARCH_DEBOUNCE_DELAY = 300;

function getStoredSearch(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(SEARCH_STORAGE_KEY) || '';
}

function setStoredSearch(search: string) {
  if (typeof window === 'undefined') return;
  if (search) {
    localStorage.setItem(SEARCH_STORAGE_KEY, search);
  } else {
    localStorage.removeItem(SEARCH_STORAGE_KEY);
  }
}

/**
 * Fuzzy search function that matches query characters in sequence within the title.
 * Returns match info for highlighting if matched, null otherwise.
 */
function fuzzySearch(title: string, query: string): { matched: boolean; indices: number[] } | null {
  if (!query) return { matched: true, indices: [] };

  const lowerTitle = title.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const indices: number[] = [];
  let queryIdx = 0;

  for (let i = 0; i < lowerTitle.length && queryIdx < lowerQuery.length; i++) {
    if (lowerTitle[i] === lowerQuery[queryIdx]) {
      indices.push(i);
      queryIdx++;
    }
  }

  // All query characters must be found in sequence
  if (queryIdx === lowerQuery.length) {
    return { matched: true, indices };
  }

  return null;
}

/**
 * Highlights matched characters in a title based on match indices.
 */
function highlightMatches(title: string, indices: number[]): React.ReactNode {
  if (indices.length === 0) {
    return <>{title}</>;
  }

  const result: React.ReactNode[] = [];
  const indexSet = new Set(indices);
  let lastIndex = 0;

  for (let i = 0; i < title.length; i++) {
    if (indexSet.has(i)) {
      // Add text before this match
      if (i > lastIndex) {
        result.push(<span key={`text-${lastIndex}`}>{title.slice(lastIndex, i)}</span>);
      }
      // Add highlighted character
      result.push(
        <mark key={`match-${i}`} className="bg-yellow-200 text-gray-900 rounded-sm px-0.5">
          {title[i]}
        </mark>
      );
      lastIndex = i + 1;
    }
  }

  // Add remaining text
  if (lastIndex < title.length) {
    result.push(<span key={`text-${lastIndex}`}>{title.slice(lastIndex)}</span>);
  }

  return <>{result}</>;
}

function getStoredViewMode(): ViewMode {
  if (typeof window === 'undefined') return 'list';
  const stored = localStorage.getItem(VIEW_MODE_STORAGE_KEY);
  return stored === 'kanban' ? 'kanban' : 'list';
}

function setStoredViewMode(mode: ViewMode) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode);
}

// GroupBy types and helpers
type GroupByField = 'none' | 'status' | 'priority' | 'assignee' | 'taskType' | 'tags';

const GROUP_BY_OPTIONS: { value: GroupByField; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'status', label: 'Status' },
  { value: 'priority', label: 'Priority' },
  { value: 'assignee', label: 'Assignee' },
  { value: 'taskType', label: 'Type' },
  { value: 'tags', label: 'Tags' },
];

function getStoredGroupBy(): GroupByField {
  if (typeof window === 'undefined') return 'none';
  const stored = localStorage.getItem(GROUP_BY_STORAGE_KEY);
  if (stored && GROUP_BY_OPTIONS.some(opt => opt.value === stored)) {
    return stored as GroupByField;
  }
  return 'none';
}

function setStoredGroupBy(groupBy: GroupByField) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(GROUP_BY_STORAGE_KEY, groupBy);
}

interface TaskGroup {
  key: string;
  label: string;
  color?: string;
  tasks: Task[];
}

// Group tasks by the specified field
function groupTasks(tasks: Task[], groupBy: GroupByField, entities: Entity[]): TaskGroup[] {
  if (groupBy === 'none') {
    return [{ key: 'all', label: 'All Tasks', tasks }];
  }

  const groups: Map<string, Task[]> = new Map();

  for (const task of tasks) {
    let keys: string[];

    switch (groupBy) {
      case 'status':
        keys = [task.status];
        break;
      case 'priority':
        keys = [String(task.priority)];
        break;
      case 'assignee':
        keys = [task.assignee || 'unassigned'];
        break;
      case 'taskType':
        keys = [task.taskType || 'task'];
        break;
      case 'tags':
        keys = task.tags.length > 0 ? task.tags : ['untagged'];
        break;
      default:
        keys = ['other'];
    }

    for (const key of keys) {
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(task);
    }
  }

  // Convert to array and add labels/colors
  const result: TaskGroup[] = [];

  if (groupBy === 'status') {
    // Use specific order for status
    const statusOrder = ['open', 'in_progress', 'blocked', 'closed', 'deferred', 'completed', 'cancelled'];
    for (const status of statusOrder) {
      if (groups.has(status)) {
        const option = STATUS_OPTIONS.find(o => o.value === status);
        result.push({
          key: status,
          label: option?.label || status.replace('_', ' '),
          color: option?.color,
          tasks: groups.get(status)!,
        });
      }
    }
    // Add any remaining statuses
    for (const [key, groupTasks] of groups) {
      if (!statusOrder.includes(key)) {
        result.push({
          key,
          label: key.replace('_', ' '),
          tasks: groupTasks,
        });
      }
    }
  } else if (groupBy === 'priority') {
    // Sort by priority number (1 is highest)
    const priorityOrder = [1, 2, 3, 4, 5];
    for (const priority of priorityOrder) {
      const key = String(priority);
      if (groups.has(key)) {
        const option = PRIORITY_OPTIONS.find(o => o.value === priority);
        result.push({
          key,
          label: option?.label || `Priority ${priority}`,
          color: option?.color,
          tasks: groups.get(key)!,
        });
      }
    }
  } else if (groupBy === 'assignee') {
    // Sort alphabetically with "Unassigned" first
    const sortedKeys = Array.from(groups.keys()).sort((a, b) => {
      if (a === 'unassigned') return -1;
      if (b === 'unassigned') return 1;
      const nameA = entities.find(e => e.id === a)?.name || a;
      const nameB = entities.find(e => e.id === b)?.name || b;
      return nameA.localeCompare(nameB);
    });
    for (const key of sortedKeys) {
      const entityName = key === 'unassigned' ? 'Unassigned' : (entities.find(e => e.id === key)?.name || key);
      result.push({
        key,
        label: entityName,
        tasks: groups.get(key)!,
      });
    }
  } else if (groupBy === 'taskType') {
    // Sort alphabetically
    const sortedKeys = Array.from(groups.keys()).sort();
    for (const key of sortedKeys) {
      result.push({
        key,
        label: key.charAt(0).toUpperCase() + key.slice(1),
        tasks: groups.get(key)!,
      });
    }
  } else if (groupBy === 'tags') {
    // Sort alphabetically with "Untagged" first
    const sortedKeys = Array.from(groups.keys()).sort((a, b) => {
      if (a === 'untagged') return -1;
      if (b === 'untagged') return 1;
      return a.localeCompare(b);
    });
    for (const key of sortedKeys) {
      result.push({
        key,
        label: key === 'untagged' ? 'Untagged' : key,
        tasks: groups.get(key)!,
      });
    }
  }

  return result;
}

/**
 * Hook to fetch ready task IDs for filtering (TB79)
 * Returns a Set of task IDs that are currently "ready" (unblocked)
 */
function useReadyTaskIds() {
  return useQuery<Set<string>>({
    queryKey: ['tasks', 'ready', 'ids'],
    queryFn: async () => {
      const response = await fetch('/api/tasks/ready');
      if (!response.ok) throw new Error('Failed to fetch ready tasks');
      const tasks: { id: string }[] = await response.json();
      return new Set(tasks.map((t) => t.id));
    },
  });
}

type ViewMode = 'list' | 'kanban';
type SortDirection = 'asc' | 'desc';
type SortField = 'title' | 'status' | 'priority' | 'taskType' | 'assignee' | 'created_at' | 'updated_at' | 'deadline' | 'complexity';

interface SortConfig {
  field: SortField;
  direction: SortDirection;
}

const SORT_BY_STORAGE_KEY = 'tasks.sortBy';
const SORT_DIR_STORAGE_KEY = 'tasks.sortDir';
const SECONDARY_SORT_STORAGE_KEY = 'tasks.secondarySort';

// Sort options for the dropdown
const SORT_OPTIONS: { value: SortField; label: string }[] = [
  { value: 'priority', label: 'Priority' },
  { value: 'created_at', label: 'Created' },
  { value: 'updated_at', label: 'Updated' },
  { value: 'deadline', label: 'Deadline' },
  { value: 'title', label: 'Title' },
  { value: 'complexity', label: 'Complexity' },
];

function getStoredSortField(): SortField {
  if (typeof window === 'undefined') return 'updated_at';
  const stored = localStorage.getItem(SORT_BY_STORAGE_KEY);
  if (stored && SORT_OPTIONS.some(opt => opt.value === stored)) {
    return stored as SortField;
  }
  return 'updated_at';
}

function setStoredSortField(field: SortField) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(SORT_BY_STORAGE_KEY, field);
}

function getStoredSortDirection(): SortDirection {
  if (typeof window === 'undefined') return 'desc';
  const stored = localStorage.getItem(SORT_DIR_STORAGE_KEY);
  return stored === 'asc' ? 'asc' : 'desc';
}

function setStoredSortDirection(dir: SortDirection) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(SORT_DIR_STORAGE_KEY, dir);
}

function getStoredSecondarySort(): SortField | null {
  if (typeof window === 'undefined') return null;
  const stored = localStorage.getItem(SECONDARY_SORT_STORAGE_KEY);
  if (stored && SORT_OPTIONS.some(opt => opt.value === stored)) {
    return stored as SortField;
  }
  return null;
}

function setStoredSecondarySort(field: SortField | null) {
  if (typeof window === 'undefined') return;
  if (field) {
    localStorage.setItem(SECONDARY_SORT_STORAGE_KEY, field);
  } else {
    localStorage.removeItem(SECONDARY_SORT_STORAGE_KEY);
  }
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
  deadline?: string;
  metadata?: {
    manualOrder?: number;
    [key: string]: unknown;
  };
}

const DEFAULT_PAGE_SIZE = 25;

// Map sort field names to task property names (handle snake_case from legacy URLs)
type TaskSortField = keyof Task | 'created_at' | 'updated_at' | 'deadline' | 'complexity';

function getTaskSortField(field: TaskSortField): keyof Task {
  if (field === 'created_at') return 'createdAt';
  if (field === 'updated_at') return 'updatedAt';
  return field as keyof Task;
}

// Custom sort comparison for tasks
function taskSortCompareFn(
  a: Task,
  b: Task,
  field: keyof Task | string,
  direction: 'asc' | 'desc'
): number {
  // Handle date fields specially - parse ISO strings
  if (field === 'createdAt' || field === 'updatedAt') {
    const aDate = new Date(a[field] as string).getTime();
    const bDate = new Date(b[field] as string).getTime();
    const cmp = aDate - bDate;
    return direction === 'asc' ? cmp : -cmp;
  }

  // Handle deadline (null deadlines sort last)
  if (field === 'deadline') {
    const aDeadline = a.deadline;
    const bDeadline = b.deadline;
    if (!aDeadline && !bDeadline) return 0;
    if (!aDeadline) return direction === 'asc' ? 1 : -1;
    if (!bDeadline) return direction === 'asc' ? -1 : 1;
    const cmp = new Date(aDeadline).getTime() - new Date(bDeadline).getTime();
    return direction === 'asc' ? cmp : -cmp;
  }

  // Handle priority (numeric, lower is higher priority)
  if (field === 'priority') {
    const cmp = (a.priority ?? 5) - (b.priority ?? 5);
    return direction === 'asc' ? cmp : -cmp;
  }

  // Handle complexity (numeric, lower is simpler)
  if (field === 'complexity') {
    const cmp = (a.complexity ?? 3) - (b.complexity ?? 3);
    return direction === 'asc' ? cmp : -cmp;
  }

  // Default string/number comparison
  const aVal = (a as unknown as Record<string, unknown>)[field as string];
  const bVal = (b as unknown as Record<string, unknown>)[field as string];

  let cmp = 0;
  if (aVal === null || aVal === undefined) cmp = 1;
  else if (bVal === null || bVal === undefined) cmp = -1;
  else if (typeof aVal === 'string' && typeof bVal === 'string') {
    cmp = aVal.localeCompare(bVal);
  } else if (typeof aVal === 'number' && typeof bVal === 'number') {
    cmp = aVal - bVal;
  } else {
    cmp = String(aVal).localeCompare(String(bVal));
  }

  return direction === 'asc' ? cmp : -cmp;
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
  1: { label: 'Critical', color: 'bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-200' },
  2: { label: 'High', color: 'bg-orange-100 dark:bg-orange-900/50 text-orange-800 dark:text-orange-200' },
  3: { label: 'Medium', color: 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-800 dark:text-yellow-200' },
  4: { label: 'Low', color: 'bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-200' },
  5: { label: 'Trivial', color: 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200' },
};

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200',
  in_progress: 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-800 dark:text-yellow-200',
  blocked: 'bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-200',
  completed: 'bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-200',
  cancelled: 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200',
};

// Format status for display with proper capitalization
function formatStatus(status: string): string {
  return status
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function ViewToggle({ view, onViewChange }: { view: ViewMode; onViewChange: (view: ViewMode) => void }) {
  return (
    <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-md p-0.5" data-testid="view-toggle">
      <button
        onClick={() => onViewChange('list')}
        className={`inline-flex items-center justify-center px-2 py-1.5 sm:py-1 text-sm rounded transition-all duration-200 touch-target ${
          view === 'list'
            ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
        }`}
        data-testid="view-toggle-list"
        aria-label="List view (V L)"
        title="List view (V L)"
      >
        <List className="w-4 h-4 sm:w-4 sm:h-4" />
        <span className="sr-only">List</span>
      </button>
      <button
        onClick={() => onViewChange('kanban')}
        className={`inline-flex items-center justify-center px-2 py-1.5 sm:py-1 text-sm rounded transition-all duration-200 touch-target ${
          view === 'kanban'
            ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
        }`}
        data-testid="view-toggle-kanban"
        aria-label="Kanban view (V K)"
        title="Kanban view (V K)"
      >
        <LayoutGrid className="w-4 h-4 sm:w-4 sm:h-4" />
        <span className="sr-only">Kanban</span>
      </button>
    </div>
  );
}

// Task Search Bar component (TB82, TB147)
function TaskSearchBar({
  value,
  onChange,
  onClear,
  compact = false,
}: {
  value: string;
  onChange: (value: string) => void;
  onClear: () => void;
  compact?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  // Handle Escape key to clear search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Clear search on Escape when input is focused
      if (e.key === 'Escape' && document.activeElement === inputRef.current) {
        e.preventDefault();
        onClear();
        inputRef.current?.blur();
      }
      // Focus search on / when not in an input/textarea
      if (
        e.key === '/' &&
        !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)
      ) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClear]);

  return (
    <div className={`relative ${compact ? 'w-full' : 'flex-1 max-w-md'}`} data-testid="task-search-container">
      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
        <Search className="w-4 h-4 text-gray-400 dark:text-gray-500" />
      </div>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={compact ? "Search..." : "Search tasks... (Press / to focus)"}
        className="w-full pl-9 pr-8 py-2 sm:py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
        data-testid="task-search-input"
      />
      {value && (
        <button
          onClick={onClear}
          className="absolute inset-y-0 right-0 pr-2 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 touch-target"
          data-testid="task-search-clear"
          aria-label="Clear search (Escape)"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

function GroupByDropdown({
  groupBy,
  onGroupByChange,
}: {
  groupBy: GroupByField;
  onGroupByChange: (groupBy: GroupByField) => void;
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

  const selectedOption = GROUP_BY_OPTIONS.find(opt => opt.value === groupBy) || GROUP_BY_OPTIONS[0];

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
        data-testid="group-by-dropdown"
      >
        <Layers className="w-4 h-4" />
        <span>Group: {selectedOption.label}</span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && (
        <div
          className="absolute z-20 mt-1 right-0 bg-white border border-gray-200 rounded-md shadow-lg py-1 min-w-40"
          data-testid="group-by-options"
        >
          {GROUP_BY_OPTIONS.map((option) => (
            <button
              key={option.value}
              onClick={() => {
                onGroupByChange(option.value);
                setIsOpen(false);
              }}
              className={`w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 flex items-center justify-between ${
                groupBy === option.value ? 'text-blue-600 font-medium' : 'text-gray-700'
              }`}
              data-testid={`group-by-option-${option.value}`}
            >
              <span>{option.label}</span>
              {groupBy === option.value && (
                <span className="text-blue-600">✓</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Sort by dropdown component with ascending/descending toggle
function SortByDropdown({
  sortField,
  sortDirection,
  secondarySort,
  onSortFieldChange,
  onSortDirectionChange,
  onSecondarySortChange,
}: {
  sortField: SortField;
  sortDirection: SortDirection;
  secondarySort: SortField | null;
  onSortFieldChange: (field: SortField) => void;
  onSortDirectionChange: (direction: SortDirection) => void;
  onSecondarySortChange: (field: SortField | null) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [showSecondary, setShowSecondary] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setShowSecondary(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedOption = SORT_OPTIONS.find(opt => opt.value === sortField) || SORT_OPTIONS[0];
  const secondaryOption = secondarySort ? SORT_OPTIONS.find(opt => opt.value === secondarySort) : null;

  // Filter out the primary sort from secondary options
  const secondarySortOptions = SORT_OPTIONS.filter(opt => opt.value !== sortField);

  return (
    <div className="relative flex items-center gap-1" ref={dropdownRef}>
      {/* Main sort dropdown */}
      <button
        onClick={() => { setIsOpen(!isOpen); setShowSecondary(false); }}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
        data-testid="sort-by-dropdown"
      >
        <ArrowUpDown className="w-4 h-4" />
        <span>Sort: {selectedOption.label}</span>
        {secondaryOption && (
          <span className="text-gray-400">+ {secondaryOption.label}</span>
        )}
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Ascending/descending toggle */}
      <button
        onClick={() => onSortDirectionChange(sortDirection === 'asc' ? 'desc' : 'asc')}
        className={`inline-flex items-center justify-center w-8 h-8 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors ${
          sortDirection === 'asc' ? 'text-blue-600' : ''
        }`}
        data-testid="sort-direction-toggle"
        aria-label={sortDirection === 'asc' ? 'Sort ascending' : 'Sort descending'}
        title={sortDirection === 'asc' ? 'Sort ascending' : 'Sort descending'}
      >
        {sortDirection === 'asc' ? (
          <ArrowUp className="w-4 h-4" />
        ) : (
          <ArrowDown className="w-4 h-4" />
        )}
      </button>

      {/* Dropdown menu */}
      {isOpen && !showSecondary && (
        <div
          className="absolute z-20 mt-1 top-full left-0 bg-white border border-gray-200 rounded-md shadow-lg py-1 min-w-48"
          data-testid="sort-by-options"
        >
          <div className="px-3 py-1.5 text-xs font-medium text-gray-500 uppercase">Primary Sort</div>
          {SORT_OPTIONS.map((option) => (
            <button
              key={option.value}
              onClick={() => {
                onSortFieldChange(option.value);
                // If secondary sort is same as new primary, clear it
                if (secondarySort === option.value) {
                  onSecondarySortChange(null);
                }
                setIsOpen(false);
              }}
              className={`w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 flex items-center justify-between ${
                sortField === option.value ? 'text-blue-600 font-medium' : 'text-gray-700'
              }`}
              data-testid={`sort-by-option-${option.value}`}
            >
              <span>{option.label}</span>
              {sortField === option.value && (
                <span className="text-blue-600">✓</span>
              )}
            </button>
          ))}
          <div className="border-t border-gray-100 mt-1 pt-1">
            <button
              onClick={() => setShowSecondary(true)}
              className="w-full text-left px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 flex items-center justify-between"
              data-testid="sort-secondary-button"
            >
              <span>Secondary sort...</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Secondary sort submenu */}
      {isOpen && showSecondary && (
        <div
          className="absolute z-20 mt-1 top-full left-0 bg-white border border-gray-200 rounded-md shadow-lg py-1 min-w-48"
          data-testid="sort-secondary-options"
        >
          <button
            onClick={() => setShowSecondary(false)}
            className="w-full text-left px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-50 flex items-center gap-1"
          >
            <ChevronRight className="w-4 h-4 rotate-180" />
            <span>Back</span>
          </button>
          <div className="border-t border-gray-100 my-1" />
          <div className="px-3 py-1.5 text-xs font-medium text-gray-500 uppercase">Secondary Sort</div>
          <button
            onClick={() => {
              onSecondarySortChange(null);
              setIsOpen(false);
              setShowSecondary(false);
            }}
            className={`w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 flex items-center justify-between ${
              secondarySort === null ? 'text-blue-600 font-medium' : 'text-gray-700'
            }`}
            data-testid="sort-secondary-option-none"
          >
            <span>None</span>
            {secondarySort === null && (
              <span className="text-blue-600">✓</span>
            )}
          </button>
          {secondarySortOptions.map((option) => (
            <button
              key={option.value}
              onClick={() => {
                onSecondarySortChange(option.value);
                setIsOpen(false);
                setShowSecondary(false);
              }}
              className={`w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 flex items-center justify-between ${
                secondarySort === option.value ? 'text-blue-600 font-medium' : 'text-gray-700'
              }`}
              data-testid={`sort-secondary-option-${option.value}`}
            >
              <span>{option.label}</span>
              {secondarySort === option.value && (
                <span className="text-blue-600">✓</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Collapsible group section header
function GroupHeader({
  group,
  isCollapsed,
  onToggle,
}: {
  group: TaskGroup;
  isCollapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center gap-2 px-4 py-2.5 bg-gray-100 hover:bg-gray-150 border-b border-gray-200 transition-colors"
      data-testid={`group-header-${group.key}`}
    >
      <span className={`transition-transform ${isCollapsed ? '' : 'rotate-90'}`}>
        <ChevronRight className="w-4 h-4 text-gray-500" />
      </span>
      {group.color && (
        <span className={`px-2 py-0.5 text-xs font-medium rounded ${group.color}`}>
          {group.label}
        </span>
      )}
      {!group.color && (
        <span className="text-sm font-medium text-gray-700">{group.label}</span>
      )}
      <span className="ml-auto px-2 py-0.5 text-xs font-medium bg-gray-200 text-gray-600 rounded-full" data-testid={`group-count-${group.key}`}>
        {group.tasks.length}
      </span>
    </button>
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

// Row height constant for virtualization
const TASK_ROW_HEIGHT = 60;

function ListView({
  tasks,
  selectedTaskId,
  selectedIds,
  onTaskClick,
  onTaskCheck,
  onSelectAll,
  sort,
  onSort,
  containerHeight,
  searchQuery,
}: {
  tasks: Task[];
  selectedTaskId: string | null;
  selectedIds: Set<string>;
  onTaskClick: (taskId: string) => void;
  onTaskCheck: (taskId: string, checked: boolean) => void;
  onSelectAll: () => void;
  sort: SortConfig;
  onSort: (field: SortField) => void;
  containerHeight?: number;
  searchQuery?: string;
}) {
  const allSelected = tasks.length > 0 && tasks.every(t => selectedIds.has(t.id));
  const someSelected = selectedIds.size > 0;

  // Header row component (stays sticky)
  const TableHeader = () => (
    <div className="bg-gray-50 sticky top-0 z-10 border-b border-gray-200">
      <div className="flex items-center" data-testid="tasks-list-header">
        <div className="px-2 py-3 w-10 flex-shrink-0">
          <button
            onClick={onSelectAll}
            className="p-1 hover:bg-gray-200 rounded"
            data-testid="task-select-all"
            aria-label={allSelected ? 'Deselect all tasks' : 'Select all tasks'}
          >
            {allSelected ? (
              <CheckSquare className="w-4 h-4 text-blue-600" />
            ) : someSelected ? (
              <div className="w-4 h-4 border-2 border-blue-600 rounded flex items-center justify-center">
                <div className="w-2 h-0.5 bg-blue-600" />
              </div>
            ) : (
              <Square className="w-4 h-4 text-gray-500" />
            )}
          </button>
        </div>
        <div className="flex-1 min-w-[200px]">
          <SortableHeaderCell label="Task" field="title" currentSort={sort} onSort={onSort} />
        </div>
        <div className="w-28">
          <SortableHeaderCell label="Status" field="status" currentSort={sort} onSort={onSort} />
        </div>
        <div className="w-28">
          <SortableHeaderCell label="Priority" field="priority" currentSort={sort} onSort={onSort} />
        </div>
        <div className="w-28">
          <SortableHeaderCell label="Type" field="taskType" currentSort={sort} onSort={onSort} />
        </div>
        <div className="w-32">
          <SortableHeaderCell label="Assignee" field="assignee" currentSort={sort} onSort={onSort} />
        </div>
        <div className="w-32 px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
          Tags
        </div>
      </div>
    </div>
  );

  if (tasks.length === 0) {
    return (
      <div data-testid="tasks-list-view">
        <TableHeader />
        <div className="p-6 text-center text-gray-500">
          No tasks found.
        </div>
      </div>
    );
  }

  // Use virtualization for large lists (more than 50 items)
  const useVirtualization = tasks.length > 50;

  if (useVirtualization) {
    return (
      <div data-testid="tasks-list-view">
        <TableHeader />
        <VirtualizedList
          items={tasks}
          getItemKey={(task) => task.id}
          estimateSize={TASK_ROW_HEIGHT}
          scrollRestoreId="tasks-list"
          height={containerHeight ? containerHeight - 48 : 'calc(100% - 48px)'}
          className="flex-1"
          testId="virtualized-task-list"
          renderItem={(task, index) => (
            <VirtualTaskRow
              task={task}
              isSelected={task.id === selectedTaskId}
              isChecked={selectedIds.has(task.id)}
              onCheck={(checked) => onTaskCheck(task.id, checked)}
              onClick={() => onTaskClick(task.id)}
              isOdd={index % 2 === 1}
              searchQuery={searchQuery}
            />
          )}
        />
      </div>
    );
  }

  // Standard rendering for small lists
  return (
    <div data-testid="tasks-list-view">
      <TableHeader />
      <div className="bg-white">
        {tasks.map((task, index) => (
          <VirtualTaskRow
            key={task.id}
            task={task}
            isSelected={task.id === selectedTaskId}
            isChecked={selectedIds.has(task.id)}
            onCheck={(checked) => onTaskCheck(task.id, checked)}
            onClick={() => onTaskClick(task.id)}
            isOdd={index % 2 === 1}
            searchQuery={searchQuery}
          />
        ))}
      </div>
    </div>
  );
}

// Grouped List View with collapsible sections
function GroupedListView({
  groups,
  selectedTaskId,
  selectedIds,
  onTaskClick,
  onTaskCheck,
  sort,
  onSort,
  searchQuery,
}: {
  groups: TaskGroup[];
  selectedTaskId: string | null;
  selectedIds: Set<string>;
  onTaskClick: (taskId: string) => void;
  onTaskCheck: (taskId: string, checked: boolean) => void;
  sort: SortConfig;
  searchQuery?: string;
  onSort: (field: SortField) => void;
}) {
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const toggleGroup = (key: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const allTasks = groups.flatMap(g => g.tasks);
  const allSelected = allTasks.length > 0 && allTasks.every(t => selectedIds.has(t.id));
  const someSelected = selectedIds.size > 0;

  const handleSelectAll = () => {
    // This will be handled by the parent
  };

  // Header row component (stays sticky)
  const TableHeader = () => (
    <div className="bg-gray-50 sticky top-0 z-10 border-b border-gray-200">
      <div className="flex items-center" data-testid="tasks-list-header">
        <div className="px-2 py-3 w-10 flex-shrink-0">
          <button
            onClick={handleSelectAll}
            className="p-1 hover:bg-gray-200 rounded"
            data-testid="task-select-all"
            aria-label={allSelected ? 'Deselect all tasks' : 'Select all tasks'}
          >
            {allSelected ? (
              <CheckSquare className="w-4 h-4 text-blue-600" />
            ) : someSelected ? (
              <div className="w-4 h-4 border-2 border-blue-600 rounded flex items-center justify-center">
                <div className="w-2 h-0.5 bg-blue-600" />
              </div>
            ) : (
              <Square className="w-4 h-4 text-gray-500" />
            )}
          </button>
        </div>
        <div className="flex-1 min-w-[200px]">
          <SortableHeaderCell label="Task" field="title" currentSort={sort} onSort={onSort} />
        </div>
        <div className="w-28">
          <SortableHeaderCell label="Status" field="status" currentSort={sort} onSort={onSort} />
        </div>
        <div className="w-28">
          <SortableHeaderCell label="Priority" field="priority" currentSort={sort} onSort={onSort} />
        </div>
        <div className="w-28">
          <SortableHeaderCell label="Type" field="taskType" currentSort={sort} onSort={onSort} />
        </div>
        <div className="w-32">
          <SortableHeaderCell label="Assignee" field="assignee" currentSort={sort} onSort={onSort} />
        </div>
        <div className="w-32 px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
          Tags
        </div>
      </div>
    </div>
  );

  if (allTasks.length === 0) {
    return (
      <div data-testid="tasks-grouped-list-view">
        <TableHeader />
        <div className="p-6 text-center text-gray-500">
          No tasks found.
        </div>
      </div>
    );
  }

  return (
    <div data-testid="tasks-grouped-list-view">
      <TableHeader />
      <div className="bg-white">
        {groups.map((group) => {
          const isCollapsed = collapsedGroups.has(group.key);
          return (
            <div key={group.key} data-testid={`task-group-${group.key}`}>
              <GroupHeader
                group={group}
                isCollapsed={isCollapsed}
                onToggle={() => toggleGroup(group.key)}
              />
              {!isCollapsed && (
                <div>
                  {group.tasks.map((task, index) => (
                    <VirtualTaskRow
                      key={task.id}
                      task={task}
                      isSelected={task.id === selectedTaskId}
                      isChecked={selectedIds.has(task.id)}
                      onCheck={(checked) => onTaskCheck(task.id, checked)}
                      onClick={() => onTaskClick(task.id)}
                      isOdd={index % 2 === 1}
                      searchQuery={searchQuery}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Sortable header cell for flex-based layout
function SortableHeaderCell({
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
    <button
      className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-200 select-none w-full flex items-center gap-1 transition-colors"
      onClick={() => onSort(field)}
      data-testid={`sort-header-${field}`}
    >
      <span>{label}</span>
      {isActive ? (
        currentSort.direction === 'asc' ? (
          <ArrowUp className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
        ) : (
          <ArrowDown className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
        )
      ) : (
        <ArrowUpDown className="w-3.5 h-3.5 text-gray-300 dark:text-gray-600" />
      )}
    </button>
  );
}

// Row component for virtualized list (uses flex instead of table)
function VirtualTaskRow({
  task,
  isSelected,
  isChecked,
  onCheck,
  onClick,
  isOdd,
  searchQuery,
}: {
  task: Task;
  isSelected: boolean;
  isChecked: boolean;
  onCheck: (checked: boolean) => void;
  onClick: () => void;
  isOdd: boolean;
  searchQuery?: string;
}) {
  const priority = PRIORITY_LABELS[task.priority] || PRIORITY_LABELS[3];
  const statusColor = STATUS_COLORS[task.status] || STATUS_COLORS.open;

  // Compute highlighted title based on search query (TB82)
  const highlightedTitle = useMemo(() => {
    if (!searchQuery) return task.title;
    const searchResult = fuzzySearch(task.title, searchQuery);
    if (searchResult && searchResult.indices.length > 0) {
      return highlightMatches(task.title, searchResult.indices);
    }
    return task.title;
  }, [task.title, searchQuery]);

  const handleCheckboxClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onCheck(!isChecked);
  };

  return (
    <div
      className={`flex items-center border-b border-gray-200 dark:border-gray-700 cursor-pointer transition-colors ${
        isSelected
          ? 'bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/40'
          : isOdd
            ? 'bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800'
            : 'bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800/50'
      }`}
      onClick={onClick}
      data-testid={`task-row-${task.id}`}
      style={{ height: TASK_ROW_HEIGHT }}
    >
      <div className="px-2 py-3 w-10 flex-shrink-0">
        <button
          onClick={handleCheckboxClick}
          className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
          data-testid={`task-checkbox-${task.id}`}
          aria-label={isChecked ? `Deselect task: ${task.title}` : `Select task: ${task.title}`}
        >
          {isChecked ? (
            <CheckSquare className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          ) : (
            <Square className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          )}
        </button>
      </div>
      <div className="flex-1 min-w-[200px] px-4 py-3">
        <div className="font-medium text-gray-900 dark:text-gray-100 truncate" data-testid={`task-title-${task.id}`}>{highlightedTitle}</div>
        <div className="text-xs text-gray-500 dark:text-gray-400 font-mono truncate">{task.id}</div>
      </div>
      <div className="w-28 px-4 py-3">
        <span className={`px-2 py-1 text-xs font-medium rounded whitespace-nowrap ${statusColor}`}>
          {formatStatus(task.status)}
        </span>
      </div>
      <div className="w-28 px-4 py-3">
        <span className={`px-2 py-1 text-xs font-medium rounded ${priority.color}`}>
          {priority.label}
        </span>
      </div>
      <div className="w-28 px-4 py-3 text-sm text-gray-600 dark:text-gray-400 capitalize truncate">
        {task.taskType}
      </div>
      <div className="w-32 px-4 py-3 text-sm text-gray-600 dark:text-gray-400 truncate">
        {task.assignee || '-'}
      </div>
      <div className="w-32 px-4 py-3">
        <div className="flex gap-1">
          {task.tags.slice(0, 2).map((tag) => (
            <span key={tag} className="px-1.5 py-0.5 text-xs bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded truncate max-w-[60px]">
              {tag}
            </span>
          ))}
          {task.tags.length > 2 && (
            <span className="text-xs text-gray-500 dark:text-gray-400">+{task.tags.length - 2}</span>
          )}
        </div>
      </div>
    </div>
  );
}

export function TasksPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: '/tasks' });

  // Pagination state from URL
  const currentPage = search.page ?? 1;
  const pageSize = search.limit ?? DEFAULT_PAGE_SIZE;
  const selectedFromUrl = search.selected ?? null;
  const readyOnly = search.readyOnly ?? false;
  const assigneeFromUrl = search.assignee ?? '';

  // Sort configuration - use internal field names and localStorage
  const [sortField, setSortField] = useState<SortField>(getStoredSortField);
  const [sortDirection, setSortDirection] = useState<SortDirection>(getStoredSortDirection);
  const [secondarySort, setSecondarySort] = useState<SortField | null>(getStoredSecondarySort);
  // Initialize filters from URL if assignee is provided
  const [filters, setFilters] = useState<FilterConfig>(() => ({
    ...EMPTY_FILTER,
    assignee: assigneeFromUrl,
  }));
  const [groupBy, setGroupBy] = useState<GroupByField>(getStoredGroupBy);

  // Search state (TB82)
  const [searchQuery, setSearchQuery] = useState<string>(getStoredSearch);
  const debouncedSearch = useDebounce(searchQuery, SEARCH_DEBOUNCE_DELAY);

  // Use upfront-loaded data (TB67) instead of server-side pagination
  const { data: allTasks, isLoading: isTasksLoading } = useAllTasks();
  const bulkUpdate = useBulkUpdate();
  const bulkDelete = useBulkDelete();
  const entities = useEntities();
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(selectedFromUrl);

  // Fetch ready task IDs when readyOnly filter is active (TB79)
  const { data: readyTaskIds, isLoading: isReadyTasksLoading } = useReadyTaskIds();

  // Create filter function for client-side filtering (includes search - TB82)
  const filterFn = useMemo(() => {
    // Base filter from UI filters
    const baseFilter = createTaskFilter({
      status: filters.status,
      priority: filters.priority,
      assignee: filters.assignee,
    });

    return (task: Task) => {
      // Apply search filter first (TB82)
      if (debouncedSearch) {
        const searchResult = fuzzySearch(task.title, debouncedSearch);
        if (!searchResult || !searchResult.matched) return false;
      }

      // Apply readyOnly filter if enabled (TB79)
      if (readyOnly && readyTaskIds) {
        if (!readyTaskIds.has(task.id)) return false;
      }

      // Apply base filter if exists
      if (baseFilter && !baseFilter(task)) return false;

      return true;
    };
  }, [filters.status, filters.priority, filters.assignee, readyOnly, readyTaskIds, debouncedSearch]);

  // Create sort config using internal field names
  const sortConfig = useMemo((): PaginatedSortConfig<Task> => ({
    field: getTaskSortField(sortField),
    direction: sortDirection,
  }), [sortField, sortDirection]);

  // Create a combined sort function that handles secondary sorting
  const combinedSortCompareFn = useCallback((
    a: Task,
    b: Task,
    field: keyof Task | string,
    direction: 'asc' | 'desc'
  ): number => {
    // First, compare using primary sort
    const primaryResult = taskSortCompareFn(a, b, field, direction);

    // If equal and secondary sort is set, use secondary sort
    if (primaryResult === 0 && secondarySort) {
      const secondaryField = getTaskSortField(secondarySort);
      // Secondary sort always uses the same direction as primary
      return taskSortCompareFn(a, b, secondaryField, direction);
    }

    return primaryResult;
  }, [secondarySort]);

  // Client-side pagination with filtering and sorting (TB69)
  const paginatedData = usePaginatedData<Task>({
    data: allTasks as Task[] | undefined,
    page: currentPage,
    pageSize,
    filterFn,
    sort: sortConfig,
    sortCompareFn: combinedSortCompareFn,
  });

  // Deep-link navigation (TB70)
  const deepLink = useDeepLink({
    data: allTasks as Task[] | undefined,
    selectedId: selectedFromUrl,
    currentPage,
    pageSize,
    getId: (task) => task.id,
    routePath: '/tasks',
    rowTestIdPrefix: 'task-row-',
    autoNavigate: true,
    highlightDelay: 200,
  });

  // Sync selectedTaskId with URL parameter
  useEffect(() => {
    if (selectedFromUrl) {
      setSelectedTaskId(selectedFromUrl);
    }
  }, [selectedFromUrl]);

  // Sync assignee filter with URL parameter (TB105)
  useEffect(() => {
    if (assigneeFromUrl !== filters.assignee) {
      setFilters(prev => ({ ...prev, assignee: assigneeFromUrl }));
    }
  }, [assigneeFromUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  // Responsive hooks (TB147)
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();

  // Global quick actions for C T shortcut
  const { openCreateTaskModal } = useGlobalQuickActions();
  // Track shortcut changes to update the badge
  useShortcutVersion();
  const [viewMode, setViewMode] = useState<ViewMode>(getStoredViewMode);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);

  // Handle view mode changes and persist to localStorage
  const handleViewModeChange = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    setStoredViewMode(mode);
  }, []);

  // Handle group by changes and persist to localStorage
  const handleGroupByChange = useCallback((newGroupBy: GroupByField) => {
    setGroupBy(newGroupBy);
    setStoredGroupBy(newGroupBy);
    // Reset to first page when grouping changes
    navigate({ to: '/tasks', search: { page: 1, limit: pageSize, readyOnly: readyOnly ? true : undefined } });
  }, [navigate, pageSize, readyOnly]);

  // Handle sort field changes and persist to localStorage
  const handleSortFieldChange = useCallback((field: SortField) => {
    setSortField(field);
    setStoredSortField(field);
    // Reset to first page when sort changes
    navigate({ to: '/tasks', search: { page: 1, limit: pageSize, readyOnly: readyOnly ? true : undefined } });
  }, [navigate, pageSize, readyOnly]);

  // Handle sort direction changes and persist to localStorage
  const handleSortDirectionChange = useCallback((direction: SortDirection) => {
    setSortDirection(direction);
    setStoredSortDirection(direction);
    // Reset to first page when sort changes
    navigate({ to: '/tasks', search: { page: 1, limit: pageSize, readyOnly: readyOnly ? true : undefined } });
  }, [navigate, pageSize, readyOnly]);

  // Handle secondary sort changes and persist to localStorage
  const handleSecondarySortChange = useCallback((field: SortField | null) => {
    setSecondarySort(field);
    setStoredSecondarySort(field);
    // Reset to first page when sort changes
    navigate({ to: '/tasks', search: { page: 1, limit: pageSize, readyOnly: readyOnly ? true : undefined } });
  }, [navigate, pageSize, readyOnly]);

  // Handle search changes and persist to localStorage (TB82)
  const handleSearchChange = useCallback((query: string) => {
    setSearchQuery(query);
    setStoredSearch(query);
    // Reset to first page when search changes
    navigate({ to: '/tasks', search: { page: 1, limit: pageSize, readyOnly: readyOnly ? true : undefined } });
  }, [navigate, pageSize, readyOnly]);

  // Handle clear search (TB82)
  const handleClearSearch = useCallback(() => {
    setSearchQuery('');
    setStoredSearch('');
    // Reset to first page when search is cleared
    navigate({ to: '/tasks', search: { page: 1, limit: pageSize, readyOnly: readyOnly ? true : undefined } });
  }, [navigate, pageSize, readyOnly]);

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

  // Extract task items from client-side paginated data (TB69)
  const taskItems = paginatedData.items;
  const totalItems = paginatedData.filteredTotal;
  const totalPages = paginatedData.totalPages;
  const isLoading = isTasksLoading || paginatedData.isLoading || (readyOnly && isReadyTasksLoading);

  // Group tasks if grouping is enabled (TB80)
  const taskGroups = useMemo(() => {
    return groupTasks(taskItems, groupBy, entities.data ?? []);
  }, [taskItems, groupBy, entities.data]);

  // Handle task click - update URL with selected task (TB70)
  const handleTaskClick = (taskId: string) => {
    setSelectedTaskId(taskId);
    // Update URL with selected task for deep-linking
    navigate({ to: '/tasks', search: { page: currentPage, limit: pageSize, selected: taskId } });
  };

  const handleCloseDetail = () => {
    setSelectedTaskId(null);
    // Remove selected from URL
    navigate({ to: '/tasks', search: { page: currentPage, limit: pageSize } });
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
    navigate({ to: '/tasks', search: { page, limit: pageSize, readyOnly: readyOnly ? true : undefined } });
    // Clear selection when changing pages
    setSelectedIds(new Set());
  };

  const handlePageSizeChange = (newPageSize: number) => {
    // When page size changes, go back to page 1
    navigate({ to: '/tasks', search: { page: 1, limit: newPageSize, readyOnly: readyOnly ? true : undefined } });
    setSelectedIds(new Set());
  };

  const handleSort = (field: SortField) => {
    // Toggle direction if same field, otherwise default to desc
    if (sortField === field) {
      const newDirection = sortDirection === 'desc' ? 'asc' : 'desc';
      setSortDirection(newDirection);
      setStoredSortDirection(newDirection);
    } else {
      setSortField(field);
      setStoredSortField(field);
      setSortDirection('desc');
      setStoredSortDirection('desc');
    }
    // Reset to first page when sort changes
    navigate({ to: '/tasks', search: { page: 1, limit: pageSize, readyOnly: readyOnly ? true : undefined } });
  };

  const handleFilterChange = (newFilters: FilterConfig) => {
    setFilters(newFilters);
    // Reset to first page when filters change, preserve readyOnly and assignee (TB105)
    navigate({
      to: '/tasks',
      search: {
        page: 1,
        limit: pageSize,
        readyOnly: readyOnly ? true : undefined,
        assignee: newFilters.assignee || undefined,
      },
    });
  };

  const handleClearFilters = () => {
    setFilters(EMPTY_FILTER);
    // Clear all filters including assignee from URL (TB105)
    navigate({ to: '/tasks', search: { page: 1, limit: pageSize, readyOnly: readyOnly ? true : undefined } });
  };

  // Handler to clear the readyOnly filter (TB79)
  const handleClearReadyOnly = () => {
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

  // Compute active filter count for mobile filter button
  const activeFilterCount = filters.status.length + filters.priority.length + (filters.assignee ? 1 : 0);

  return (
    <div className="flex h-full" data-testid="tasks-page">
      {/* Mobile Filter Sheet */}
      {isMobile && mobileFilterOpen && (
        <MobileDetailSheet
          open={mobileFilterOpen}
          onClose={() => setMobileFilterOpen(false)}
          title="Filters"
          data-testid="mobile-filter-sheet"
        >
          <div className="p-4 space-y-6">
            {/* Status filter */}
            <div>
              <label className="block text-sm font-medium text-[var(--color-text)] mb-2">Status</label>
              <div className="flex flex-wrap gap-2">
                {STATUS_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => {
                      const newStatus = filters.status.includes(option.value)
                        ? filters.status.filter(s => s !== option.value)
                        : [...filters.status, option.value];
                      handleFilterChange({ ...filters, status: newStatus });
                    }}
                    className={`px-3 py-2 text-sm rounded-lg border transition-colors touch-target ${
                      filters.status.includes(option.value)
                        ? `${option.color} border-transparent font-medium`
                        : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300'
                    }`}
                    data-testid={`mobile-filter-status-${option.value}`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Priority filter */}
            <div>
              <label className="block text-sm font-medium text-[var(--color-text)] mb-2">Priority</label>
              <div className="flex flex-wrap gap-2">
                {PRIORITY_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => {
                      const newPriority = filters.priority.includes(option.value)
                        ? filters.priority.filter(p => p !== option.value)
                        : [...filters.priority, option.value];
                      handleFilterChange({ ...filters, priority: newPriority });
                    }}
                    className={`px-3 py-2 text-sm rounded-lg border transition-colors touch-target ${
                      filters.priority.includes(option.value)
                        ? `${option.color} border-transparent font-medium`
                        : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300'
                    }`}
                    data-testid={`mobile-filter-priority-${option.value}`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Assignee filter */}
            <div>
              <label className="block text-sm font-medium text-[var(--color-text)] mb-2">Assignee</label>
              <select
                value={filters.assignee}
                onChange={(e) => handleFilterChange({ ...filters, assignee: e.target.value })}
                className="w-full px-3 py-2.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-[var(--color-text)] touch-target"
                data-testid="mobile-filter-assignee"
              >
                <option value="">All assignees</option>
                {entities.data?.map((entity) => (
                  <option key={entity.id} value={entity.id}>
                    {entity.name || entity.id}
                  </option>
                ))}
              </select>
            </div>

            {/* Clear filters button */}
            {activeFilterCount > 0 && (
              <button
                onClick={() => {
                  handleClearFilters();
                  setMobileFilterOpen(false);
                }}
                className="w-full py-2.5 text-sm font-medium text-red-600 dark:text-red-400 border border-red-300 dark:border-red-800 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors touch-target"
                data-testid="mobile-clear-filters"
              >
                Clear all filters ({activeFilterCount})
              </button>
            )}

            {/* Apply button */}
            <button
              onClick={() => setMobileFilterOpen(false)}
              className="w-full py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors touch-target"
              data-testid="mobile-apply-filters"
            >
              Apply Filters
            </button>
          </div>
        </MobileDetailSheet>
      )}

      {/* Task List - full width on mobile, shrinks when detail panel is open on desktop */}
      <div className={`flex flex-col ${selectedTaskId && !isMobile ? 'w-1/2' : 'w-full'} transition-all duration-200 ${selectedTaskId && isMobile ? 'hidden' : ''}`}>
        {/* Header - Responsive layout (TB147) */}
        <div className="border-b border-gray-200 dark:border-gray-700">
          {/* Mobile header */}
          {isMobile ? (
            <div className="p-3 space-y-3">
              {/* Search bar - full width on mobile */}
              <TaskSearchBar
                value={searchQuery}
                onChange={handleSearchChange}
                onClear={handleClearSearch}
                compact
              />
              {/* Controls row */}
              <div className="flex items-center justify-between gap-2">
                <ViewToggle view={viewMode} onViewChange={handleViewModeChange} />
                <button
                  onClick={() => setMobileFilterOpen(true)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors touch-target ${
                    activeFilterCount > 0
                      ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                  }`}
                  data-testid="mobile-filter-button"
                >
                  <SlidersHorizontal className="w-4 h-4" />
                  <span>Filters</span>
                  {activeFilterCount > 0 && (
                    <span className="px-1.5 py-0.5 text-xs font-medium bg-blue-600 text-white rounded-full">
                      {activeFilterCount}
                    </span>
                  )}
                </button>
              </div>
            </div>
          ) : (
            /* Desktop/Tablet header */
            <div className="flex items-center justify-between p-4">
              <div className="flex items-center gap-4 flex-1 mr-4">
                <h2 className="text-lg font-medium text-[var(--color-text)] flex-shrink-0">Tasks</h2>
                {/* Search Bar (TB82) */}
                <TaskSearchBar
                  value={searchQuery}
                  onChange={handleSearchChange}
                  onClear={handleClearSearch}
                />
              </div>
              <div className="flex items-center gap-3">
                {viewMode === 'list' && (
                  <>
                    {!isTablet && (
                      <SortByDropdown
                        sortField={sortField}
                        sortDirection={sortDirection}
                        secondarySort={secondarySort}
                        onSortFieldChange={handleSortFieldChange}
                        onSortDirectionChange={handleSortDirectionChange}
                        onSecondarySortChange={handleSecondarySortChange}
                      />
                    )}
                    {!isTablet && <GroupByDropdown groupBy={groupBy} onGroupByChange={handleGroupByChange} />}
                  </>
                )}
                <ViewToggle view={viewMode} onViewChange={handleViewModeChange} />
                <button
                  onClick={openCreateTaskModal}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors"
                  data-testid="create-task-button"
                >
                  <Plus className="w-4 h-4" />
                  Create Task
                  <kbd className="ml-1 text-xs bg-blue-800/50 text-white px-1 py-0.5 rounded">{getCurrentBinding('action.createTask')}</kbd>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Bulk Action Menu - hide on mobile */}
        {selectedIds.size > 0 && viewMode === 'list' && !isMobile && (
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

        {/* Filter Bar - hide on mobile (uses mobile filter sheet instead) */}
        {viewMode === 'list' && !isMobile && (
          <FilterBar
            filters={filters}
            onFilterChange={handleFilterChange}
            onClearFilters={handleClearFilters}
            entities={entities.data ?? []}
          />
        )}

        {/* Ready Tasks Filter Chip (TB79) */}
        {readyOnly && (
          <div className="px-4 py-2 border-b border-gray-200 bg-blue-50" data-testid="ready-filter-chip">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-blue-600" />
              <span className="text-sm font-medium text-blue-800">Ready tasks only</span>
              <button
                onClick={handleClearReadyOnly}
                className="ml-auto inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-700 bg-blue-100 hover:bg-blue-200 rounded transition-colors"
                data-testid="clear-ready-filter"
              >
                <X className="w-3 h-3" />
                Clear filter
              </button>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-auto" data-testid="tasks-view-container">
          {isLoading && (
            <div className="p-4 text-gray-500">Loading tasks...</div>
          )}

          {!isLoading && viewMode === 'list' && (
            <div className="animate-fade-in" data-testid="list-view-content">
              {/* Mobile list view with cards (TB147) */}
              {isMobile ? (
                <div data-testid="mobile-list-view">
                  {taskItems.map((task) => (
                    <MobileTaskCard
                      key={task.id}
                      task={task}
                      isSelected={selectedTaskId === task.id}
                      isChecked={selectedIds.has(task.id)}
                      onCheck={(checked) => handleTaskCheck(task.id, checked)}
                      onClick={() => handleTaskClick(task.id)}
                      searchQuery={debouncedSearch}
                    />
                  ))}
                  {taskItems.length === 0 && (
                    <div className="p-8 text-center text-[var(--color-text-muted)]">
                      No tasks found
                    </div>
                  )}
                </div>
              ) : groupBy === 'none' ? (
                <ListView
                  tasks={taskItems}
                  selectedTaskId={selectedTaskId}
                  selectedIds={selectedIds}
                  onTaskClick={handleTaskClick}
                  onTaskCheck={handleTaskCheck}
                  onSelectAll={handleSelectAll}
                  sort={{ field: sortField, direction: sortDirection }}
                  onSort={handleSort}
                  searchQuery={debouncedSearch}
                />
              ) : (
                <GroupedListView
                  groups={taskGroups}
                  selectedTaskId={selectedTaskId}
                  selectedIds={selectedIds}
                  onTaskClick={handleTaskClick}
                  onTaskCheck={handleTaskCheck}
                  sort={{ field: sortField, direction: sortDirection }}
                  onSort={handleSort}
                  searchQuery={debouncedSearch}
                />
              )}
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

          {!isLoading && viewMode === 'kanban' && (
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

      {/* Task Detail Panel - Desktop (side panel) */}
      {selectedTaskId && !isMobile && (
        <div className="w-1/2 border-l border-gray-200 dark:border-gray-700" data-testid="task-detail-container">
          {deepLink.notFound ? (
            <ElementNotFound
              elementType="Task"
              elementId={selectedTaskId}
              backRoute="/tasks"
              backLabel="Back to Tasks"
              onDismiss={handleCloseDetail}
            />
          ) : (
            <TaskDetailPanel taskId={selectedTaskId} onClose={handleCloseDetail} />
          )}
        </div>
      )}

      {/* Task Detail Panel - Mobile (full-screen sheet) (TB147) */}
      {selectedTaskId && isMobile && (
        <MobileDetailSheet
          open={!!selectedTaskId}
          onClose={handleCloseDetail}
          title="Task Details"
          data-testid="mobile-task-detail-sheet"
        >
          {deepLink.notFound ? (
            <ElementNotFound
              elementType="Task"
              elementId={selectedTaskId}
              backRoute="/tasks"
              backLabel="Back to Tasks"
              onDismiss={handleCloseDetail}
            />
          ) : (
            <TaskDetailPanel taskId={selectedTaskId} onClose={handleCloseDetail} />
          )}
        </MobileDetailSheet>
      )}

      {/* Mobile Floating Action Button for Create Task (TB147) */}
      {isMobile && !selectedTaskId && (
        <button
          onClick={openCreateTaskModal}
          className="fixed bottom-6 right-6 w-14 h-14 flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg z-40 touch-target"
          aria-label="Create new task"
          data-testid="mobile-create-task-fab"
        >
          <Plus className="w-6 h-6" />
        </button>
      )}
    </div>
  );
}

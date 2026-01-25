/**
 * TaskPickerModal - Modal for searching and selecting tasks to embed in documents
 *
 * Features:
 * - Search tasks by title
 * - Display task status, priority, and title
 * - Keyboard navigation (arrows, Enter, Escape)
 * - Click to select
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  X,
  Search,
  Loader2,
  CheckCircle,
  Circle,
  Clock,
  AlertCircle,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';

interface Task {
  id: string;
  title: string;
  status: string;
  priority?: number;
}

interface TaskPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (taskId: string) => void;
  excludeIds?: string[];
}

// Status icon mapping
const statusIcons: Record<string, React.ReactNode> = {
  open: <Circle className="w-4 h-4 text-gray-400" />,
  in_progress: <Clock className="w-4 h-4 text-blue-500" />,
  blocked: <AlertCircle className="w-4 h-4 text-red-500" />,
  completed: <CheckCircle className="w-4 h-4 text-green-500" />,
  cancelled: <CheckCircle className="w-4 h-4 text-gray-400" />,
};

// Priority labels
const priorityLabels: Record<number, string> = {
  1: 'Critical',
  2: 'High',
  3: 'Medium',
  4: 'Low',
  5: 'Trivial',
};

// Priority colors
const priorityColors: Record<number, string> = {
  1: 'bg-red-100 text-red-700',
  2: 'bg-orange-100 text-orange-700',
  3: 'bg-yellow-100 text-yellow-700',
  4: 'bg-blue-100 text-blue-700',
  5: 'bg-gray-100 text-gray-600',
};

function useTasks(searchQuery: string) {
  return useQuery<Task[]>({
    queryKey: ['tasks', 'search', searchQuery],
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: '50',
      });
      if (searchQuery) {
        params.set('search', searchQuery);
      }
      const response = await fetch(`/api/tasks?${params}`);
      if (!response.ok) throw new Error('Failed to fetch tasks');
      const data = await response.json();
      // API returns { data: Task[], total: number } for paginated results
      return Array.isArray(data) ? data : data.data || [];
    },
  });
}

export function TaskPickerModal({
  isOpen,
  onClose,
  onSelect,
  excludeIds = [],
}: TaskPickerModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const { data: tasks, isLoading } = useTasks(searchQuery);

  // Filter out excluded tasks
  const filteredTasks = tasks?.filter((task) => !excludeIds.includes(task.id)) || [];

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [filteredTasks.length, searchQuery]);

  // Focus search input when modal opens
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      // Small delay to ensure modal is rendered
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setSearchQuery('');
      setSelectedIndex(0);
    }
  }, [isOpen]);

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current) {
      const selectedElement = listRef.current.querySelector(
        `[data-index="${selectedIndex}"]`
      );
      selectedElement?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  const handleSelect = useCallback(
    (taskId: string) => {
      onSelect(taskId);
      onClose();
    },
    [onSelect, onClose]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev >= filteredTasks.length - 1 ? 0 : prev + 1
        );
        return;
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev <= 0 ? filteredTasks.length - 1 : prev - 1
        );
        return;
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        const selectedTask = filteredTasks[selectedIndex];
        if (selectedTask) {
          handleSelect(selectedTask.id);
        }
        return;
      }
    },
    [filteredTasks, selectedIndex, handleSelect, onClose]
  );

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50"
      data-testid="task-picker-modal"
      onKeyDown={handleKeyDown}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        data-testid="task-picker-modal-backdrop"
      />

      {/* Dialog */}
      <div className="absolute left-1/2 top-1/4 -translate-x-1/2 w-full max-w-lg">
        <div className="bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Select Task</h2>
            <button
              onClick={onClose}
              className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
              aria-label="Close"
              data-testid="task-picker-modal-close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Search */}
          <div className="px-4 py-3 border-b border-gray-200">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Search tasks..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                data-testid="task-picker-search"
              />
            </div>
          </div>

          {/* Task List */}
          <div
            ref={listRef}
            className="max-h-[300px] overflow-y-auto p-2"
            data-testid="task-picker-list"
          >
            {isLoading ? (
              <div className="flex items-center justify-center py-8 text-gray-500">
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                Loading tasks...
              </div>
            ) : filteredTasks.length === 0 ? (
              <div className="py-8 text-center text-gray-500">
                {searchQuery ? 'No tasks match your search' : 'No tasks available'}
              </div>
            ) : (
              filteredTasks.map((task, index) => {
                const isSelected = index === selectedIndex;
                const statusIcon = statusIcons[task.status] || statusIcons.open;
                const priority = task.priority || 3;
                const priorityLabel = priorityLabels[priority] || 'Medium';
                const priorityColor = priorityColors[priority] || priorityColors[3];

                return (
                  <button
                    key={task.id}
                    data-index={index}
                    data-testid={`task-picker-item-${task.id}`}
                    onClick={() => handleSelect(task.id)}
                    onMouseEnter={() => setSelectedIndex(index)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-left transition-colors ${
                      isSelected
                        ? 'bg-blue-50 text-blue-700'
                        : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    {/* Status icon */}
                    <span className="flex-shrink-0">{statusIcon}</span>

                    {/* Title */}
                    <span className="flex-1 truncate font-medium">{task.title}</span>

                    {/* Priority badge */}
                    <span
                      className={`flex-shrink-0 px-2 py-0.5 text-xs font-medium rounded ${priorityColor}`}
                    >
                      {priorityLabel}
                    </span>
                  </button>
                );
              })
            )}
          </div>

          {/* Footer with keyboard hints */}
          <div className="px-4 py-2 border-t border-gray-200 bg-gray-50 flex items-center justify-between text-xs text-gray-500">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <ChevronUp className="w-3 h-3" />
                <ChevronDown className="w-3 h-3" />
                Navigate
              </span>
              <span>↵ Select</span>
              <span>Esc Close</span>
            </div>
            {filteredTasks.length > 0 && (
              <span>
                {filteredTasks.length} task{filteredTasks.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default TaskPickerModal;

import { useState, useRef, useCallback, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { AlertTriangle, CheckCircle2, Clock, PlayCircle } from 'lucide-react';

// Storage for scroll positions keyed by column ID
const kanbanScrollPositionStore = new Map<string, number>();

interface Task {
  id: string;
  type: 'task';
  title: string;
  status: string;
  priority: number;
  complexity: number;
  taskType: string;
  assignee?: string;
  tags: string[];
}

interface KanbanBoardProps {
  tasks: Task[];
  selectedTaskId: string | null;
  onTaskClick: (taskId: string) => void;
}

interface ColumnConfig {
  id: string;
  title: string;
  status: string;
  color: string;
  icon: React.ReactNode;
}

const COLUMNS: ColumnConfig[] = [
  { id: 'open', title: 'Open', status: 'open', color: 'bg-blue-500', icon: <Clock className="w-4 h-4" /> },
  { id: 'in_progress', title: 'In Progress', status: 'in_progress', color: 'bg-yellow-500', icon: <PlayCircle className="w-4 h-4" /> },
  { id: 'blocked', title: 'Blocked', status: 'blocked', color: 'bg-red-500', icon: <AlertTriangle className="w-4 h-4" /> },
  { id: 'completed', title: 'Completed', status: 'completed', color: 'bg-green-500', icon: <CheckCircle2 className="w-4 h-4" /> },
];

const PRIORITY_COLORS: Record<number, string> = {
  1: 'border-l-red-500',
  2: 'border-l-orange-500',
  3: 'border-l-yellow-500',
  4: 'border-l-green-500',
  5: 'border-l-gray-400',
};

function useUpdateTaskStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const response = await fetch(`/api/tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to update task');
      }

      return response.json();
    },
    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey: ['tasks'] });

      // Optimistic update
      const previousTasks = queryClient.getQueryData<Task[]>(['tasks']);
      if (previousTasks) {
        queryClient.setQueryData<Task[]>(['tasks'],
          previousTasks.map(task =>
            task.id === id ? { ...task, status } : task
          )
        );
      }

      return { previousTasks };
    },
    onError: (_error, _vars, context) => {
      if (context?.previousTasks) {
        queryClient.setQueryData(['tasks'], context.previousTasks);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['tasks', 'ready'] });
      queryClient.invalidateQueries({ queryKey: ['tasks', 'blocked'] });
      queryClient.invalidateQueries({ queryKey: ['tasks', 'completed'] });
    },
  });
}

function TaskCard({
  task,
  isSelected,
  onClick,
  isDragging = false
}: {
  task: Task;
  isSelected: boolean;
  onClick: () => void;
  isDragging?: boolean;
}) {
  const priorityBorder = PRIORITY_COLORS[task.priority] || PRIORITY_COLORS[3];

  return (
    <div
      className={`
        p-3 bg-white dark:bg-neutral-700 rounded-lg shadow-sm border-l-4 ${priorityBorder}
        cursor-pointer transition-all hover:shadow-md h-full
        ${isSelected ? 'ring-2 ring-blue-500' : 'border border-gray-200 dark:border-neutral-600'}
        ${isDragging ? 'opacity-50' : ''}
      `}
      onClick={onClick}
      data-testid={`kanban-card-${task.id}`}
    >
      <div className="font-medium text-gray-900 dark:text-gray-100 text-sm mb-1 line-clamp-2 break-words">{task.title}</div>
      <div className="text-xs text-gray-500 dark:text-gray-400 font-mono mb-2">{task.id}</div>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="px-1.5 py-0.5 text-xs bg-gray-100 dark:bg-neutral-600 text-gray-600 dark:text-gray-300 rounded capitalize">
          {task.taskType}
        </span>
        {task.assignee && (
          <span className="px-1.5 py-0.5 text-xs bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded truncate max-w-20">
            {task.assignee}
          </span>
        )}
        {task.tags.slice(0, 1).map((tag) => (
          <span key={tag} className="px-1.5 py-0.5 text-xs bg-gray-200 dark:bg-neutral-600 text-gray-700 dark:text-gray-300 rounded truncate max-w-16">
            {tag}
          </span>
        ))}
      </div>
    </div>
  );
}

function SortableTaskCard({
  task,
  isSelected,
  onClick
}: {
  task: Task;
  isSelected: boolean;
  onClick: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} className="h-full" {...attributes} {...listeners}>
      <TaskCard task={task} isSelected={isSelected} onClick={onClick} isDragging={isDragging} />
    </div>
  );
}

// Estimated height for each task card (without gap - gap is handled separately)
// Card content: p-3 (24px) + title 2-lines (~40px) + id (~16px) + tags (~24px) + borders = ~110px
const TASK_CARD_HEIGHT = 110;
// Gap between cards
const TASK_CARD_GAP = 8;

/**
 * VirtualizedKanbanColumn - TB85/TB132
 *
 * Uses @tanstack/react-virtual for virtualized rendering of tasks within each column.
 * This enables smooth scrolling even with 100+ tasks per column.
 *
 * TB132: Now always used for all columns (no threshold) with scroll position restoration.
 */
function VirtualizedKanbanColumn({
  column,
  tasks,
  selectedTaskId,
  onTaskClick,
  isDragActive,
  scrollRestoreId,
}: {
  column: ColumnConfig;
  tasks: Task[];
  selectedTaskId: string | null;
  onTaskClick: (taskId: string) => void;
  isDragActive: boolean;
  scrollRestoreId?: string;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const taskIds = tasks.map(t => t.id);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Make the column a droppable zone for @dnd-kit
  const { setNodeRef: setDroppableRef, isOver } = useDroppable({
    id: column.id,
  });

  // Use virtualization for efficient rendering
  const virtualizer = useVirtualizer({
    count: tasks.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => TASK_CARD_HEIGHT,
    gap: TASK_CARD_GAP,
    overscan: 5,
    getItemKey: (index) => tasks[index].id,
  });

  const virtualItems = virtualizer.getVirtualItems();

  // Combine refs for both droppable and scroll parent
  const setRefs = useCallback((node: HTMLDivElement | null) => {
    (parentRef as { current: HTMLDivElement | null }).current = node;
    setDroppableRef(node);
  }, [setDroppableRef]);

  // Restore scroll position on mount
  useEffect(() => {
    if (scrollRestoreId && parentRef.current) {
      const savedPosition = kanbanScrollPositionStore.get(scrollRestoreId);
      if (savedPosition !== undefined && savedPosition > 0) {
        // Small delay to ensure virtualizer is ready
        requestAnimationFrame(() => {
          virtualizer.scrollToOffset(savedPosition);
        });
      }
    }
  }, [scrollRestoreId]);

  // Save scroll position on unmount
  useEffect(() => {
    return () => {
      if (scrollRestoreId && parentRef.current) {
        const currentOffset = virtualizer.scrollOffset;
        if (currentOffset !== null && currentOffset > 0) {
          kanbanScrollPositionStore.set(scrollRestoreId, currentOffset);
        }
      }
    };
  }, [scrollRestoreId, virtualizer]);

  // Handle scroll events to save position
  const handleScroll = useCallback(() => {
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }

    scrollTimeoutRef.current = setTimeout(() => {
      const offset = virtualizer.scrollOffset;
      if (scrollRestoreId && offset !== null && offset > 0) {
        kanbanScrollPositionStore.set(scrollRestoreId, offset);
      }
    }, 100);
  }, [virtualizer, scrollRestoreId]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div
      className="flex flex-col min-w-64 max-w-80 bg-gray-50 dark:bg-neutral-800 rounded-lg h-full"
      data-testid={`kanban-column-${column.id}`}
    >
      {/* Column Header */}
      <div className="flex items-center gap-2 p-3 border-b border-gray-200 dark:border-neutral-700 sticky top-0 bg-gray-50 dark:bg-neutral-800 z-10">
        <div className={`w-2 h-2 rounded-full ${column.color}`} />
        <span className="font-medium text-gray-700 dark:text-gray-200 text-sm">{column.title}</span>
        <span
          className="ml-auto px-2 py-0.5 text-xs bg-gray-200 dark:bg-neutral-700 text-gray-600 dark:text-gray-300 rounded-full"
          data-testid={`kanban-column-${column.id}-count`}
        >
          {tasks.length}
        </span>
      </div>

      {/* Virtualized Cards Container */}
      <div
        ref={setRefs}
        className={`flex-1 overflow-y-auto p-2 pt-3 ${
          isOver && isDragActive ? 'bg-blue-50 dark:bg-blue-950' : ''
        }`}
        data-testid={`kanban-column-${column.id}-scroll`}
        onScroll={handleScroll}
      >
        {tasks.length === 0 ? (
          <div className="p-4 text-center text-gray-400 dark:text-gray-500 text-sm h-32 flex items-center justify-center">
            No tasks
          </div>
        ) : (
          <div
            className="relative w-full"
            style={{
              height: `${virtualizer.getTotalSize()}px`,
            }}
          >
            <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
              {virtualItems.map((virtualItem) => {
                const task = tasks[virtualItem.index];
                return (
                  <div
                    key={task.id}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: `${virtualItem.size}px`,
                      transform: `translateY(${virtualItem.start}px)`,
                    }}
                    data-index={virtualItem.index}
                  >
                    <SortableTaskCard
                      task={task}
                      isSelected={task.id === selectedTaskId}
                      onClick={() => onTaskClick(task.id)}
                    />
                  </div>
                );
              })}
            </SortableContext>
          </div>
        )}
      </div>
    </div>
  );
}

// TB132: Removed VIRTUALIZATION_THRESHOLD - always use virtualized columns for consistent UX

export function KanbanBoard({ tasks, selectedTaskId, onTaskClick }: KanbanBoardProps) {
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const updateTaskStatus = useUpdateTaskStatus();

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // 8px movement before drag starts
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Group tasks by status
  const tasksByStatus: Record<string, Task[]> = {};
  for (const column of COLUMNS) {
    tasksByStatus[column.status] = tasks.filter(t => t.status === column.status);
  }

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const task = tasks.find(t => t.id === active.id);
    if (task) {
      setActiveTask(task);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveTask(null);

    if (!over) return;

    const taskId = active.id as string;
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    // Determine the target column
    // If dropped over a task, find which column that task is in
    // If dropped over empty space in a column, the over.id might be the column
    let targetStatus: string | null = null;

    // Check if dropped over a task
    const overTask = tasks.find(t => t.id === over.id);
    if (overTask) {
      targetStatus = overTask.status;
    } else {
      // Check if dropped directly on a column
      const column = COLUMNS.find(c => c.id === over.id);
      if (column) {
        targetStatus = column.status;
      }
    }

    // Update task status if it changed
    if (targetStatus && targetStatus !== task.status) {
      updateTaskStatus.mutate({ id: taskId, status: targetStatus });
    }
  };

  const isDragActive = activeTask !== null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div
        className="flex gap-4 p-4 overflow-x-auto h-full"
        data-testid="kanban-board"
      >
        {COLUMNS.map((column) => {
          const columnTasks = tasksByStatus[column.status] || [];

          // TB132: Always use virtualized columns for consistent UX and scroll position preservation
          return (
            <VirtualizedKanbanColumn
              key={column.id}
              column={column}
              tasks={columnTasks}
              selectedTaskId={selectedTaskId}
              onTaskClick={onTaskClick}
              isDragActive={isDragActive}
              scrollRestoreId={`kanban-column-${column.id}`}
            />
          );
        })}
      </div>

      <DragOverlay>
        {activeTask && (
          <TaskCard
            task={activeTask}
            isSelected={false}
            onClick={() => {}}
          />
        )}
      </DragOverlay>
    </DndContext>
  );
}

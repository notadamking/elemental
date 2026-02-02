/**
 * TaskActionsDropdown - Dropdown menu for task row actions
 *
 * Features:
 * - Delete action with confirmation dialog
 * - Extensible for future actions
 */

import { useState, useRef, useEffect } from 'react';
import { MoreHorizontal, Trash2, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
} from '@elemental/ui/components';
import type { Task } from '../../api/types';
import { useDeleteTask } from '../../api/hooks/useTasks';

interface TaskActionsDropdownProps {
  task: Task;
  /** Callback when task is deleted */
  onDeleted?: () => void;
}

export function TaskActionsDropdown({ task, onDeleted }: TaskActionsDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const deleteTaskMutation = useDeleteTask();

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(false);
    setShowDeleteConfirm(true);
  };

  const handleConfirmDelete = async () => {
    try {
      await deleteTaskMutation.mutateAsync({ taskId: task.id });
      setShowDeleteConfirm(false);
      onDeleted?.();
    } catch (error) {
      // Error is handled by the mutation
      console.error('Failed to delete task:', error);
    }
  };

  const handleCancelDelete = () => {
    setShowDeleteConfirm(false);
  };

  return (
    <>
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setIsOpen(!isOpen);
          }}
          className="p-1.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-elevated)] rounded transition-colors"
          data-testid="task-row-menu"
          aria-label="Task actions"
        >
          <MoreHorizontal className="w-4 h-4" />
        </button>

        {isOpen && (
          <div
            className="absolute z-20 right-0 mt-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md shadow-lg py-1 min-w-36"
            data-testid="task-actions-menu"
          >
            <button
              onClick={handleDeleteClick}
              className="w-full text-left px-3 py-1.5 text-sm text-[var(--color-danger)] hover:bg-[var(--color-danger-muted)] flex items-center gap-2 transition-colors"
              data-testid="task-action-delete"
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </button>
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Delete Task</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this task? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <div className="p-3 bg-[var(--color-surface-elevated)] rounded-md border border-[var(--color-border)]">
              <p className="text-sm font-medium text-[var(--color-text)] truncate" title={task.title}>
                {task.title}
              </p>
              <p className="text-xs text-[var(--color-text-tertiary)] font-mono mt-1">
                {task.id}
              </p>
            </div>
          </DialogBody>
          <DialogFooter>
            <button
              onClick={handleCancelDelete}
              disabled={deleteTaskMutation.isPending}
              className="px-4 py-2 text-sm font-medium text-[var(--color-text)] bg-[var(--color-surface-elevated)] hover:bg-[var(--color-surface-hover)] rounded-md transition-colors disabled:opacity-50"
              data-testid="delete-cancel"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmDelete}
              disabled={deleteTaskMutation.isPending}
              className="px-4 py-2 text-sm font-medium text-white bg-[var(--color-danger)] hover:bg-[var(--color-danger-hover)] rounded-md transition-colors disabled:opacity-50 flex items-center gap-2"
              data-testid="delete-confirm"
            >
              {deleteTaskMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Delete
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

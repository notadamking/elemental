/**
 * Global Quick Actions Context
 *
 * Provides global keyboard shortcuts (C T, C W) for creating tasks and pouring workflows
 * from any page in the application. The shortcuts are registered at the app level and
 * work consistently across dashboard, tasks, workflows, and other pages.
 */

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { toast } from 'sonner';
import { keyboardManager } from '../lib/keyboard';
import { CreateTaskModal } from '../components/task/CreateTaskModal';
import { PourWorkflowModal } from '../components/workflow/PourWorkflowModal';

interface GlobalQuickActionsContextValue {
  /** Open the create task modal */
  openCreateTaskModal: () => void;
  /** Open the pour workflow modal */
  openPourWorkflowModal: () => void;
  /** Whether the create task modal is open */
  isCreateTaskModalOpen: boolean;
  /** Whether the pour workflow modal is open */
  isPourWorkflowModalOpen: boolean;
}

const GlobalQuickActionsContext = createContext<GlobalQuickActionsContextValue | null>(null);

interface GlobalQuickActionsProviderProps {
  children: ReactNode;
}

export function GlobalQuickActionsProvider({ children }: GlobalQuickActionsProviderProps) {
  const navigate = useNavigate();
  const [isCreateTaskModalOpen, setIsCreateTaskModalOpen] = useState(false);
  const [isPourWorkflowModalOpen, setIsPourWorkflowModalOpen] = useState(false);

  // Handlers for opening modals
  const openCreateTaskModal = useCallback(() => {
    setIsCreateTaskModalOpen(true);
  }, []);

  const openPourWorkflowModal = useCallback(() => {
    setIsPourWorkflowModalOpen(true);
  }, []);

  // Handlers for modal success
  const handleTaskCreated = useCallback((task: { id: string }) => {
    toast.success('Task created successfully', {
      description: 'Your new task has been created.',
      action: {
        label: 'View Task',
        onClick: () => navigate({ to: '/tasks', search: { selected: task.id, page: 1, limit: 25 } }),
      },
    });
  }, [navigate]);

  const handleWorkflowPoured = useCallback((workflow: { id: string; title: string }) => {
    toast.success('Workflow poured successfully', {
      description: `"${workflow.title}" has been created.`,
      action: {
        label: 'View Workflow',
        onClick: () => navigate({ to: '/workflows', search: { selected: workflow.id } }),
      },
    });
  }, [navigate]);

  // Register global keyboard shortcuts for C T and C W
  useEffect(() => {
    const createTaskHandler = () => {
      // Don't open if another modal is already open
      if (!isPourWorkflowModalOpen) {
        setIsCreateTaskModalOpen(true);
      }
    };

    const pourWorkflowHandler = () => {
      // Don't open if another modal is already open
      if (!isCreateTaskModalOpen) {
        setIsPourWorkflowModalOpen(true);
      }
    };

    keyboardManager.register('C T', createTaskHandler, 'Create Task');
    keyboardManager.register('C W', pourWorkflowHandler, 'Pour Workflow');

    return () => {
      keyboardManager.unregister('C T');
      keyboardManager.unregister('C W');
    };
  }, [isCreateTaskModalOpen, isPourWorkflowModalOpen]);

  // Disable keyboard shortcuts when modals are open
  useEffect(() => {
    if (isCreateTaskModalOpen || isPourWorkflowModalOpen) {
      keyboardManager.setEnabled(false);
    } else {
      keyboardManager.setEnabled(true);
    }
  }, [isCreateTaskModalOpen, isPourWorkflowModalOpen]);

  const contextValue: GlobalQuickActionsContextValue = {
    openCreateTaskModal,
    openPourWorkflowModal,
    isCreateTaskModalOpen,
    isPourWorkflowModalOpen,
  };

  return (
    <GlobalQuickActionsContext.Provider value={contextValue}>
      {children}

      {/* Global Create Task Modal */}
      <CreateTaskModal
        isOpen={isCreateTaskModalOpen}
        onClose={() => setIsCreateTaskModalOpen(false)}
        onSuccess={handleTaskCreated}
      />

      {/* Global Pour Workflow Modal */}
      <PourWorkflowModal
        isOpen={isPourWorkflowModalOpen}
        onClose={() => setIsPourWorkflowModalOpen(false)}
        onSuccess={handleWorkflowPoured}
      />
    </GlobalQuickActionsContext.Provider>
  );
}

/**
 * Hook to access global quick actions (create task, pour workflow)
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { openCreateTaskModal, openPourWorkflowModal } = useGlobalQuickActions();
 *
 *   return (
 *     <button onClick={openCreateTaskModal}>
 *       Create Task
 *       <kbd>C T</kbd>
 *     </button>
 *   );
 * }
 * ```
 */
export function useGlobalQuickActions(): GlobalQuickActionsContextValue {
  const context = useContext(GlobalQuickActionsContext);
  if (!context) {
    throw new Error('useGlobalQuickActions must be used within a GlobalQuickActionsProvider');
  }
  return context;
}

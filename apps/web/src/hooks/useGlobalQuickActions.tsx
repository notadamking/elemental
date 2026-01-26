/**
 * Global Quick Actions Context
 *
 * Provides global keyboard shortcuts (C T, C W, C E, C M) for creating tasks, workflows,
 * entities, and teams from any page in the application. The shortcuts are registered at the
 * app level and work consistently across dashboard, tasks, workflows, and other pages.
 */

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { toast } from 'sonner';
import { keyboardManager } from '../lib/keyboard';
import { CreateTaskModal } from '../components/task/CreateTaskModal';
import { PourWorkflowModal } from '../components/workflow/PourWorkflowModal';
import { CreateEntityModal } from '../components/entity/CreateEntityModal';
import { CreateTeamModal } from '../components/team/CreateTeamModal';

interface GlobalQuickActionsContextValue {
  /** Open the create task modal */
  openCreateTaskModal: () => void;
  /** Open the create workflow modal */
  openCreateWorkflowModal: () => void;
  /** @deprecated Use openCreateWorkflowModal instead */
  openPourWorkflowModal: () => void;
  /** Open the create entity modal */
  openCreateEntityModal: () => void;
  /** Open the create team modal */
  openCreateTeamModal: () => void;
  /** Whether the create task modal is open */
  isCreateTaskModalOpen: boolean;
  /** Whether the create workflow modal is open */
  isCreateWorkflowModalOpen: boolean;
  /** @deprecated Use isCreateWorkflowModalOpen instead */
  isPourWorkflowModalOpen: boolean;
  /** Whether the create entity modal is open */
  isCreateEntityModalOpen: boolean;
  /** Whether the create team modal is open */
  isCreateTeamModalOpen: boolean;
}

const GlobalQuickActionsContext = createContext<GlobalQuickActionsContextValue | null>(null);

interface GlobalQuickActionsProviderProps {
  children: ReactNode;
}

export function GlobalQuickActionsProvider({ children }: GlobalQuickActionsProviderProps) {
  const navigate = useNavigate();
  const [isCreateTaskModalOpen, setIsCreateTaskModalOpen] = useState(false);
  const [isCreateWorkflowModalOpen, setIsCreateWorkflowModalOpen] = useState(false);
  const [isCreateEntityModalOpen, setIsCreateEntityModalOpen] = useState(false);
  const [isCreateTeamModalOpen, setIsCreateTeamModalOpen] = useState(false);

  // Check if any modal is open
  const isAnyModalOpen = isCreateTaskModalOpen || isCreateWorkflowModalOpen || isCreateEntityModalOpen || isCreateTeamModalOpen;

  // Handlers for opening modals
  const openCreateTaskModal = useCallback(() => {
    setIsCreateTaskModalOpen(true);
  }, []);

  const openCreateWorkflowModal = useCallback(() => {
    setIsCreateWorkflowModalOpen(true);
  }, []);

  const openCreateEntityModal = useCallback(() => {
    setIsCreateEntityModalOpen(true);
  }, []);

  const openCreateTeamModal = useCallback(() => {
    setIsCreateTeamModalOpen(true);
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

  const handleWorkflowCreated = useCallback((workflow: { id: string; title: string }) => {
    toast.success('Workflow created successfully', {
      description: `"${workflow.title}" has been created.`,
      action: {
        label: 'View Workflow',
        onClick: () => navigate({ to: '/workflows', search: { selected: workflow.id } }),
      },
    });
  }, [navigate]);

  const handleEntityCreated = useCallback((entity: { id: string; name: string }) => {
    toast.success('Entity created successfully', {
      description: `"${entity.name}" has been created.`,
      action: {
        label: 'View Entity',
        onClick: () => navigate({ to: '/entities', search: { selected: entity.id, name: undefined, page: 1, limit: 25 } }),
      },
    });
  }, [navigate]);

  const handleTeamCreated = useCallback((team: { id: string; name: string }) => {
    toast.success('Team created successfully', {
      description: `"${team.name}" has been created.`,
      action: {
        label: 'View Team',
        onClick: () => navigate({ to: '/teams', search: { selected: team.id, page: 1, limit: 25 } }),
      },
    });
  }, [navigate]);

  // Register global keyboard shortcuts for C T, C W, C E, and C M
  useEffect(() => {
    const createTaskHandler = () => {
      // Don't open if another modal is already open
      if (!isAnyModalOpen) {
        setIsCreateTaskModalOpen(true);
      }
    };

    const createWorkflowHandler = () => {
      // Don't open if another modal is already open
      if (!isAnyModalOpen) {
        setIsCreateWorkflowModalOpen(true);
      }
    };

    const createEntityHandler = () => {
      // Don't open if another modal is already open
      if (!isAnyModalOpen) {
        setIsCreateEntityModalOpen(true);
      }
    };

    const createTeamHandler = () => {
      // Don't open if another modal is already open
      if (!isAnyModalOpen) {
        setIsCreateTeamModalOpen(true);
      }
    };

    keyboardManager.register('C T', createTaskHandler, 'Create Task');
    keyboardManager.register('C W', createWorkflowHandler, 'Create Workflow');
    keyboardManager.register('C E', createEntityHandler, 'Create Entity');
    keyboardManager.register('C M', createTeamHandler, 'Create Team');

    return () => {
      keyboardManager.unregister('C T');
      keyboardManager.unregister('C W');
      keyboardManager.unregister('C E');
      keyboardManager.unregister('C M');
    };
  }, [isAnyModalOpen]);

  // Disable keyboard shortcuts when modals are open
  useEffect(() => {
    if (isAnyModalOpen) {
      keyboardManager.setEnabled(false);
    } else {
      keyboardManager.setEnabled(true);
    }
  }, [isAnyModalOpen]);

  const contextValue: GlobalQuickActionsContextValue = {
    openCreateTaskModal,
    openCreateWorkflowModal,
    openPourWorkflowModal: openCreateWorkflowModal, // deprecated alias
    openCreateEntityModal,
    openCreateTeamModal,
    isCreateTaskModalOpen,
    isCreateWorkflowModalOpen,
    isPourWorkflowModalOpen: isCreateWorkflowModalOpen, // deprecated alias
    isCreateEntityModalOpen,
    isCreateTeamModalOpen,
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

      {/* Global Create Workflow Modal */}
      <PourWorkflowModal
        isOpen={isCreateWorkflowModalOpen}
        onClose={() => setIsCreateWorkflowModalOpen(false)}
        onSuccess={handleWorkflowCreated}
      />

      {/* Global Create Entity Modal */}
      <CreateEntityModal
        isOpen={isCreateEntityModalOpen}
        onClose={() => setIsCreateEntityModalOpen(false)}
        onSuccess={handleEntityCreated}
      />

      {/* Global Create Team Modal */}
      <CreateTeamModal
        isOpen={isCreateTeamModalOpen}
        onClose={() => setIsCreateTeamModalOpen(false)}
        onSuccess={handleTeamCreated}
      />
    </GlobalQuickActionsContext.Provider>
  );
}

/**
 * Hook to access global quick actions (create task, workflow, entity)
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { openCreateTaskModal, openCreateWorkflowModal, openCreateEntityModal } = useGlobalQuickActions();
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

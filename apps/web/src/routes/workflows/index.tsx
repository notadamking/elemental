/**
 * Workflows Page - Workflow management with pour functionality (TB25, TB48)
 *
 * Features:
 * - List all workflows with status badges
 * - Progress visualization
 * - Workflow detail panel with task list
 * - Pour workflow from playbook modal
 * - Edit workflow title and status (TB48)
 * - Burn/Squash workflow buttons (TB48)
 */

import { useState, useEffect, useMemo } from 'react';
import { useSearch, useNavigate } from '@tanstack/react-router';
import { GitBranch, Plus } from 'lucide-react';

import { ElementNotFound } from '../../components/shared/ElementNotFound';
import { MobileDetailSheet } from '../../components/shared/MobileDetailSheet';
import { PageHeader } from '../../components/shared';
import { MobileWorkflowCard } from '../../components/workflow/MobileWorkflowCard';
import { useAllWorkflows } from '../../api/hooks/useAllElements';
import { useDeepLink } from '../../hooks/useDeepLink';
import { useIsMobile, useGlobalQuickActions, useShortcutVersion } from '../../hooks';
import { getCurrentBinding } from '../../lib/keyboard';

import type { HydratedWorkflow } from './types';
import { useWorkflows } from './hooks';
import {
  StatusFilter,
  WorkflowListItem,
  WorkflowDetailPanel,
} from './components';

export function WorkflowsPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: '/workflows' });
  const isMobile = useIsMobile();

  const [selectedStatus, setSelectedStatus] = useState<string | null>(search.status ?? null);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(search.selected ?? null);

  // Global quick actions for C W shortcut
  const { openPourWorkflowModal } = useGlobalQuickActions();
  // Track shortcut changes to update the badge
  useShortcutVersion();

  // Use upfront-loaded data (TB67)
  const { data: allWorkflows, isLoading: isWorkflowsLoading } = useAllWorkflows();

  // Also keep the server-side query (fallback)
  const { data: serverWorkflows = [], isLoading: isServerLoading, error } = useWorkflows(selectedStatus ?? undefined);

  // Use preloaded data if available
  const workflows = useMemo(() => {
    if (allWorkflows && allWorkflows.length > 0) {
      // Cast to HydratedWorkflow (preloaded data may have optional properties)
      const workflowsTyped = allWorkflows as unknown as HydratedWorkflow[];
      if (selectedStatus) {
        return workflowsTyped.filter(w => w.status === selectedStatus);
      }
      return workflowsTyped;
    }
    return serverWorkflows;
  }, [allWorkflows, serverWorkflows, selectedStatus]);

  const isLoading = isWorkflowsLoading || isServerLoading;

  // Deep-link navigation (TB70)
  const deepLink = useDeepLink({
    data: allWorkflows as HydratedWorkflow[] | undefined,
    selectedId: search.selected,
    currentPage: 1,
    pageSize: 1000, // Workflows don't have pagination
    getId: (workflow) => workflow.id,
    routePath: '/workflows',
    rowTestIdPrefix: 'workflow-item-',
    autoNavigate: false,
    highlightDelay: 200,
  });

  // Sync with URL on mount
  useEffect(() => {
    if (search.selected && search.selected !== selectedWorkflowId) {
      setSelectedWorkflowId(search.selected);
    }
    if (search.status && search.status !== selectedStatus) {
      setSelectedStatus(search.status);
    }
  }, [search.selected, search.status]);

  const handleWorkflowClick = (workflowId: string) => {
    setSelectedWorkflowId(workflowId);
    navigate({ to: '/workflows', search: { selected: workflowId, status: selectedStatus ?? undefined } });
  };

  const handleCloseDetail = () => {
    setSelectedWorkflowId(null);
    navigate({ to: '/workflows', search: { selected: undefined, status: selectedStatus ?? undefined } });
  };

  const handleStatusFilterChange = (status: string | null) => {
    setSelectedStatus(status);
    navigate({ to: '/workflows', search: { selected: selectedWorkflowId ?? undefined, status: status ?? undefined } });
  };

  return (
    <div data-testid="workflows-page" className="h-full flex flex-col">
      {/* Header */}
      <PageHeader
        title="Workflows"
        icon={GitBranch}
        iconColor="text-blue-500"
        count={workflows.length > 0 ? workflows.length : undefined}
        bordered
        actions={[
          {
            label: 'Create Workflow',
            shortLabel: 'Create',
            icon: Plus,
            onClick: openPourWorkflowModal,
            shortcut: getCurrentBinding('action.createWorkflow'),
            testId: 'pour-workflow-button',
          },
        ]}
        testId="workflows-header"
      >
        <div className={isMobile ? 'overflow-x-auto -mx-3 px-3 scrollbar-hide' : ''}>
          <StatusFilter
            selectedStatus={selectedStatus}
            onStatusChange={handleStatusFilterChange}
          />
        </div>
      </PageHeader>

      {/* Content - Responsive layout (TB148) */}
      <div className={`flex-1 flex overflow-hidden ${selectedWorkflowId && isMobile ? 'hidden' : ''}`}>
        {/* Workflow List */}
        <div className={`flex-1 overflow-y-auto bg-[var(--color-bg)] ${isMobile ? '' : 'p-4'}`} tabIndex={0} role="region" aria-label="Workflow list">
          {isLoading && (
            <div
              data-testid="workflows-loading"
              className="text-center py-12 text-[var(--color-text-secondary)]"
            >
              Loading workflows...
            </div>
          )}

          {error && (
            <div
              data-testid="workflows-error"
              className="text-center py-12 text-red-500"
            >
              Failed to load workflows
            </div>
          )}

          {!isLoading && !error && workflows.length === 0 && (
            <div
              data-testid="workflows-empty"
              className="text-center py-12"
            >
              <GitBranch className="w-12 h-12 text-[var(--color-border)] mx-auto mb-3" />
              <p className="text-[var(--color-text-secondary)]">No workflows found</p>
              <p className="text-sm text-[var(--color-text-muted)] mt-1">
                {selectedStatus
                  ? `No ${selectedStatus} workflows available`
                  : 'Pour your first workflow from a playbook'}
              </p>
            </div>
          )}

          {/* Mobile List View with Cards (TB148) */}
          {!isLoading && !error && workflows.length > 0 && isMobile && (
            <div data-testid="mobile-workflows-list">
              {workflows.map((workflow) => (
                <MobileWorkflowCard
                  key={workflow.id}
                  workflow={workflow}
                  isSelected={selectedWorkflowId === workflow.id}
                  onClick={() => handleWorkflowClick(workflow.id)}
                />
              ))}
            </div>
          )}

          {/* Desktop List View */}
          {!isLoading && !error && workflows.length > 0 && !isMobile && (
            <div data-testid="workflows-list" className="space-y-3">
              {workflows.map((workflow) => (
                <WorkflowListItem
                  key={workflow.id}
                  workflow={workflow}
                  isSelected={selectedWorkflowId === workflow.id}
                  onClick={handleWorkflowClick}
                />
              ))}
            </div>
          )}
        </div>

        {/* Workflow Detail Panel - Desktop (side panel) */}
        {selectedWorkflowId && !isMobile && (
          <div className="w-96 flex-shrink-0 border-l border-[var(--color-border)]" data-testid="workflow-detail-container">
            {deepLink.notFound ? (
              <ElementNotFound
                elementType="Workflow"
                elementId={selectedWorkflowId}
                backRoute="/workflows"
                backLabel="Back to Workflows"
                onDismiss={handleCloseDetail}
              />
            ) : (
              <WorkflowDetailPanel
                workflowId={selectedWorkflowId}
                onClose={handleCloseDetail}
              />
            )}
          </div>
        )}
      </div>

      {/* Workflow Detail Panel - Mobile (full-screen sheet) (TB148) */}
      {selectedWorkflowId && isMobile && (
        <MobileDetailSheet
          open={!!selectedWorkflowId}
          onClose={handleCloseDetail}
          title="Workflow Details"
          data-testid="mobile-workflow-detail-sheet"
        >
          {deepLink.notFound ? (
            <ElementNotFound
              elementType="Workflow"
              elementId={selectedWorkflowId}
              backRoute="/workflows"
              backLabel="Back to Workflows"
              onDismiss={handleCloseDetail}
            />
          ) : (
            <WorkflowDetailPanel
              workflowId={selectedWorkflowId}
              onClose={handleCloseDetail}
            />
          )}
        </MobileDetailSheet>
      )}

      {/* Mobile Floating Action Button for Create Workflow (TB148) */}
      {isMobile && !selectedWorkflowId && (
        <button
          onClick={openPourWorkflowModal}
          className="fixed bottom-6 right-6 w-14 h-14 flex items-center justify-center bg-purple-600 hover:bg-purple-700 text-white rounded-full shadow-lg z-40 touch-target"
          aria-label="Pour new workflow"
          data-testid="mobile-pour-workflow-fab"
        >
          <Plus className="w-6 h-6" />
        </button>
      )}
    </div>
  );
}

// Default export for route
export default WorkflowsPage;

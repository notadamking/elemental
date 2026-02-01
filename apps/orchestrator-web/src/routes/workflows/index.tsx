/**
 * Workflows Page - View and manage workflow templates and active workflows
 * Templates tab shows playbooks, Active tab shows running workflows
 *
 * TB-O34: Pour Workflow Template
 * TB-O35: Workflow Progress Dashboard
 */

import { useState, useMemo } from 'react';
import { useSearch, useNavigate } from '@tanstack/react-router';
import { PourWorkflowModal } from '../../components/workflow/PourWorkflowModal';
import { WorkflowProgressDashboard } from '../../components/workflow/WorkflowProgressDashboard';
import {
  Workflow,
  Plus,
  Search,
  Loader2,
  AlertCircle,
  RefreshCw,
  Play,
  FileText,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  MoreVertical,
  Trash2,
  BookOpen,
  Settings,
  ArrowLeft,
  Eye,
} from 'lucide-react';
import {
  useWorkflows,
  usePlaybooks,
  useCancelWorkflow,
  useDeleteWorkflow,
  useWorkflowDetail,
  getWorkflowStatusDisplayName,
  getWorkflowStatusColor,
  formatWorkflowDuration,
} from '../../api/hooks/useWorkflows';
import type { Workflow as WorkflowType, Playbook, WorkflowStatus } from '../../api/types';

type TabValue = 'templates' | 'active';

function formatRelativeTime(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function getStatusIcon(status: WorkflowStatus) {
  switch (status) {
    case 'pending':
      return <Clock className="w-4 h-4" />;
    case 'running':
      return <Play className="w-4 h-4" />;
    case 'completed':
      return <CheckCircle className="w-4 h-4" />;
    case 'failed':
      return <XCircle className="w-4 h-4" />;
    case 'cancelled':
      return <AlertTriangle className="w-4 h-4" />;
    default:
      return <Clock className="w-4 h-4" />;
  }
}

// Playbook Card Component
function PlaybookCard({
  playbook,
  onPour,
}: {
  playbook: Playbook;
  onPour: (playbookId: string) => void;
}) {
  const [showMenu, setShowMenu] = useState(false);

  return (
    <div
      className="flex flex-col p-4 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg hover:border-[var(--color-primary)] transition-colors duration-150"
      data-testid={`playbook-card-${playbook.id}`}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-[var(--color-primary-muted)]">
            <BookOpen className="w-5 h-5 text-[var(--color-primary)]" />
          </div>
          <div>
            <h3 className="text-sm font-medium text-[var(--color-text)]">{playbook.title}</h3>
            <p className="text-xs text-[var(--color-text-tertiary)] font-mono">{playbook.name}</p>
          </div>
        </div>
        <div className="relative">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="p-1 rounded hover:bg-[var(--color-surface-hover)] transition-colors"
          >
            <MoreVertical className="w-4 h-4 text-[var(--color-text-secondary)]" />
          </button>
          {showMenu && (
            <div className="absolute right-0 mt-1 w-40 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md shadow-lg z-10">
              <button
                onClick={() => {
                  onPour(playbook.id);
                  setShowMenu(false);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]"
              >
                <Play className="w-4 h-4" />
                Pour Workflow
              </button>
              <button
                onClick={() => setShowMenu(false)}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]"
              >
                <Settings className="w-4 h-4" />
                Edit
              </button>
              <button
                onClick={() => setShowMenu(false)}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 flex items-center gap-4 text-xs text-[var(--color-text-secondary)]">
        <span className="flex items-center gap-1">
          <FileText className="w-3 h-3" />
          {playbook.steps.length} steps
        </span>
        <span>v{playbook.version}</span>
        {playbook.variables.length > 0 && (
          <span>{playbook.variables.length} variables</span>
        )}
      </div>

      <div className="mt-3 pt-3 border-t border-[var(--color-border)]">
        <button
          onClick={() => onPour(playbook.id)}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-white bg-[var(--color-primary)] rounded-md hover:bg-[var(--color-primary-hover)] transition-colors duration-150"
          data-testid={`playbook-pour-${playbook.id}`}
        >
          <Play className="w-4 h-4" />
          Pour Workflow
        </button>
      </div>
    </div>
  );
}

// Workflow Card Component
function WorkflowCard({
  workflow,
  onCancel,
  onDelete,
  onViewDetails,
}: {
  workflow: WorkflowType;
  onCancel: (workflowId: string) => void;
  onDelete: (workflowId: string) => void;
  onViewDetails: (workflowId: string) => void;
}) {
  const [showMenu, setShowMenu] = useState(false);
  const canCancel = workflow.status === 'pending' || workflow.status === 'running';
  const isTerminal = ['completed', 'failed', 'cancelled'].includes(workflow.status);
  const duration = formatWorkflowDuration(workflow);

  return (
    <div
      className="flex flex-col p-4 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg hover:border-[var(--color-primary)] transition-colors duration-150 cursor-pointer"
      data-testid={`workflow-card-${workflow.id}`}
      onClick={() => onViewDetails(workflow.id)}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${getWorkflowStatusColor(workflow.status)}`}>
            {getStatusIcon(workflow.status)}
          </div>
          <div>
            <h3 className="text-sm font-medium text-[var(--color-text)]">{workflow.title}</h3>
            <p className="text-xs text-[var(--color-text-tertiary)] font-mono">{workflow.id}</p>
          </div>
        </div>
        <div className="relative">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowMenu(!showMenu);
            }}
            className="p-1 rounded hover:bg-[var(--color-surface-hover)] transition-colors"
          >
            <MoreVertical className="w-4 h-4 text-[var(--color-text-secondary)]" />
          </button>
          {showMenu && (
            <div className="absolute right-0 mt-1 w-40 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md shadow-lg z-10">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onViewDetails(workflow.id);
                  setShowMenu(false);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]"
              >
                <Eye className="w-4 h-4" />
                View Details
              </button>
              {canCancel && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onCancel(workflow.id);
                    setShowMenu(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-yellow-600 hover:bg-yellow-50 dark:hover:bg-yellow-900/20"
                >
                  <XCircle className="w-4 h-4" />
                  Cancel
                </button>
              )}
              {isTerminal && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(workflow.id);
                    setShowMenu(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 flex items-center gap-4 text-xs text-[var(--color-text-secondary)]">
        <span className={`px-2 py-0.5 rounded-full ${getWorkflowStatusColor(workflow.status)}`}>
          {getWorkflowStatusDisplayName(workflow.status)}
        </span>
        {duration && <span>Duration: {duration}</span>}
        {workflow.ephemeral && <span className="text-amber-600">Ephemeral</span>}
      </div>

      <div className="mt-2 flex items-center gap-4 text-xs text-[var(--color-text-tertiary)]">
        <span>Created {formatRelativeTime(workflow.createdAt)}</span>
        {workflow.startedAt && <span>Started {formatRelativeTime(workflow.startedAt)}</span>}
      </div>

      {(workflow.failureReason || workflow.cancelReason) && (
        <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/20 rounded text-xs text-red-600 dark:text-red-400">
          {workflow.failureReason || workflow.cancelReason}
        </div>
      )}
    </div>
  );
}

export function WorkflowsPage() {
  const search = useSearch({ from: '/workflows' }) as { tab?: string; selected?: string };
  const navigate = useNavigate();

  const currentTab = (search.tab as TabValue) || 'templates';
  const selectedWorkflowId = search.selected;
  const [searchQuery, setSearchQuery] = useState('');

  // Pour modal state
  const [pourModalOpen, setPourModalOpen] = useState(false);
  const [selectedPlaybookId, setSelectedPlaybookId] = useState<string | null>(null);

  // Fetch playbooks for templates tab
  const { data: playbooksData, isLoading: playbooksLoading, error: playbooksError, refetch: refetchPlaybooks } = usePlaybooks();
  const playbooks = playbooksData?.playbooks ?? [];

  // Fetch workflows for active tab
  const { data: workflowsData, isLoading: workflowsLoading, error: workflowsError, refetch: refetchWorkflows } = useWorkflows();
  const allWorkflows = workflowsData?.workflows ?? [];

  // Fetch workflow detail when a workflow is selected (TB-O35)
  const {
    workflow: selectedWorkflow,
    tasks: workflowTasks,
    progress: workflowProgress,
    dependencies: workflowDependencies,
    isLoading: workflowDetailLoading,
    error: workflowDetailError,
  } = useWorkflowDetail(selectedWorkflowId);

  // Split workflows into active and terminal
  const activeWorkflows = useMemo(() =>
    allWorkflows.filter(w => w.status === 'pending' || w.status === 'running'),
    [allWorkflows]
  );

  const terminalWorkflows = useMemo(() =>
    allWorkflows.filter(w => ['completed', 'failed', 'cancelled'].includes(w.status)),
    [allWorkflows]
  );

  // Mutations
  const cancelWorkflow = useCancelWorkflow();
  const deleteWorkflow = useDeleteWorkflow();

  // Filter based on search query
  const filteredPlaybooks = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return playbooks;
    return playbooks.filter(
      p => p.name.toLowerCase().includes(query) || p.title.toLowerCase().includes(query)
    );
  }, [searchQuery, playbooks]);

  const filteredActiveWorkflows = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return activeWorkflows;
    return activeWorkflows.filter(w => w.title.toLowerCase().includes(query));
  }, [searchQuery, activeWorkflows]);

  const filteredTerminalWorkflows = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return terminalWorkflows;
    return terminalWorkflows.filter(w => w.title.toLowerCase().includes(query));
  }, [searchQuery, terminalWorkflows]);

  const setTab = (tab: TabValue) => {
    navigate({ to: '/workflows', search: { selected: search.selected, tab } });
  };

  const handlePourPlaybook = (playbookId: string) => {
    setSelectedPlaybookId(playbookId);
    setPourModalOpen(true);
  };

  const handlePourSuccess = (workflow: { id: string; title: string }) => {
    console.log('Workflow created:', workflow.id, workflow.title);
    // Switch to Active tab to show the new workflow
    setTab('active');
  };

  const handleCancelWorkflow = async (workflowId: string) => {
    try {
      await cancelWorkflow.mutateAsync({ workflowId, reason: 'Cancelled by user' });
    } catch (error) {
      console.error('Failed to cancel workflow:', error);
    }
  };

  const handleDeleteWorkflow = async (workflowId: string) => {
    try {
      await deleteWorkflow.mutateAsync({ workflowId });
    } catch (error) {
      console.error('Failed to delete workflow:', error);
    }
  };

  // Handle viewing workflow details (TB-O35)
  const handleViewDetails = (workflowId: string) => {
    navigate({ to: '/workflows', search: { tab: search.tab ?? 'active', selected: workflowId } });
  };

  // Handle going back from detail view
  const handleBackToList = () => {
    navigate({ to: '/workflows', search: { tab: search.tab ?? 'active', selected: undefined } });
  };

  const isLoading = currentTab === 'templates' ? playbooksLoading : workflowsLoading;
  const error = currentTab === 'templates' ? playbooksError : workflowsError;
  const refetch = currentTab === 'templates' ? refetchPlaybooks : refetchWorkflows;

  // If a workflow is selected, show the detail/progress view (TB-O35)
  if (selectedWorkflowId && selectedWorkflow) {
    return (
      <div className="space-y-6 animate-fade-in" data-testid="workflow-detail-page">
        {/* Back button */}
        <div className="flex items-center gap-4">
          <button
            onClick={handleBackToList}
            className="flex items-center gap-2 px-3 py-2 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text)] rounded-md hover:bg-[var(--color-surface-hover)] transition-colors"
            data-testid="workflow-back-button"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Workflows
          </button>
        </div>

        {/* Error state */}
        {workflowDetailError && (
          <div className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <AlertCircle className="w-5 h-5 text-red-500" />
            <div>
              <p className="text-sm font-medium text-red-800 dark:text-red-200">Error loading workflow</p>
              <p className="text-sm text-red-600 dark:text-red-400">{workflowDetailError.message}</p>
            </div>
          </div>
        )}

        {/* Workflow Progress Dashboard */}
        <WorkflowProgressDashboard
          workflow={selectedWorkflow}
          tasks={workflowTasks}
          progress={workflowProgress}
          dependencies={workflowDependencies}
          isLoading={workflowDetailLoading}
        />
      </div>
    );
  }

  // Loading state for detail view
  if (selectedWorkflowId && workflowDetailLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-8 h-8 text-[var(--color-primary)] animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in" data-testid="workflows-page">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-[var(--color-primary-muted)]">
            <Workflow className="w-5 h-5 text-[var(--color-primary)]" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-[var(--color-text)]">Workflows</h1>
            <p className="text-sm text-[var(--color-text-secondary)]">
              Manage workflow templates and active workflows
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            className="flex items-center gap-2 px-3 py-2 text-sm text-[var(--color-text-secondary)] rounded-md hover:bg-[var(--color-surface-hover)] transition-colors duration-150"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          {currentTab === 'templates' && (
            <button
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-[var(--color-primary)] rounded-md hover:bg-[var(--color-primary-hover)] transition-colors duration-150"
              data-testid="workflows-create"
            >
              <Plus className="w-4 h-4" />
              Create Template
            </button>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-tertiary)]" />
        <input
          type="text"
          placeholder={currentTab === 'templates' ? 'Search templates...' : 'Search workflows...'}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2 text-sm bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:border-transparent"
          data-testid="workflows-search"
        />
      </div>

      {/* Tabs: Templates | Active */}
      <div className="border-b border-[var(--color-border)]">
        <nav className="flex gap-4" aria-label="Tabs">
          <button
            onClick={() => setTab('templates')}
            className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
              currentTab === 'templates'
                ? 'text-[var(--color-primary)] border-[var(--color-primary)]'
                : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text)] border-transparent hover:border-[var(--color-border)]'
            }`}
            data-testid="workflows-tab-templates"
          >
            Templates
            {playbooks.length > 0 && (
              <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-[var(--color-primary-muted)] text-[var(--color-primary)]">
                {playbooks.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setTab('active')}
            className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
              currentTab === 'active'
                ? 'text-[var(--color-primary)] border-[var(--color-primary)]'
                : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text)] border-transparent hover:border-[var(--color-border)]'
            }`}
            data-testid="workflows-tab-active"
          >
            Active
            {activeWorkflows.length > 0 && (
              <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
                {activeWorkflows.length}
              </span>
            )}
          </button>
        </nav>
      </div>

      {/* Error state */}
      {error && (
        <div className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <AlertCircle className="w-5 h-5 text-red-500" />
          <div>
            <p className="text-sm font-medium text-red-800 dark:text-red-200">Error loading data</p>
            <p className="text-sm text-red-600 dark:text-red-400">{error.message}</p>
          </div>
          <button
            onClick={() => refetch()}
            className="ml-auto px-3 py-1 text-sm text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 rounded"
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 text-[var(--color-primary)] animate-spin" />
        </div>
      )}

      {/* Templates Tab Content */}
      {!isLoading && !error && currentTab === 'templates' && (
        <>
          {filteredPlaybooks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-4 border border-dashed border-[var(--color-border)] rounded-lg">
              <BookOpen className="w-12 h-12 text-[var(--color-text-tertiary)] mb-4" />
              <h3 className="text-lg font-medium text-[var(--color-text)]">
                {searchQuery ? 'No matching templates' : 'No workflow templates'}
              </h3>
              <p className="mt-1 text-sm text-[var(--color-text-secondary)] text-center max-w-md">
                {searchQuery
                  ? 'Try adjusting your search query.'
                  : 'Create workflow templates to define reusable sequences of tasks. Templates can be "poured" to create active workflows.'}
              </p>
              {!searchQuery && (
                <div className="mt-4">
                  <button
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[var(--color-primary)] rounded-md hover:bg-[var(--color-primary-hover)] transition-colors duration-150"
                    data-testid="workflows-create-empty"
                  >
                    <Plus className="w-4 h-4" />
                    Create Template
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="playbooks-grid">
              {filteredPlaybooks.map((playbook) => (
                <PlaybookCard
                  key={playbook.id}
                  playbook={playbook}
                  onPour={handlePourPlaybook}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Active Tab Content */}
      {!isLoading && !error && currentTab === 'active' && (
        <>
          {filteredActiveWorkflows.length === 0 && filteredTerminalWorkflows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-4 border border-dashed border-[var(--color-border)] rounded-lg">
              <Workflow className="w-12 h-12 text-[var(--color-text-tertiary)] mb-4" />
              <h3 className="text-lg font-medium text-[var(--color-text)]">
                {searchQuery ? 'No matching workflows' : 'No workflows'}
              </h3>
              <p className="mt-1 text-sm text-[var(--color-text-secondary)] text-center max-w-md">
                {searchQuery
                  ? 'Try adjusting your search query.'
                  : 'Pour a template to create a new workflow, or create an ad-hoc workflow.'}
              </p>
              {!searchQuery && (
                <div className="mt-4">
                  <button
                    onClick={() => setTab('templates')}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[var(--color-primary)] rounded-md hover:bg-[var(--color-primary-hover)] transition-colors duration-150"
                  >
                    <BookOpen className="w-4 h-4" />
                    View Templates
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              {/* Active Workflows Section */}
              {filteredActiveWorkflows.length > 0 && (
                <div>
                  <h2 className="text-sm font-medium text-[var(--color-text-secondary)] mb-3">
                    Active ({filteredActiveWorkflows.length})
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="active-workflows-grid">
                    {filteredActiveWorkflows.map((workflow) => (
                      <WorkflowCard
                        key={workflow.id}
                        workflow={workflow}
                        onCancel={handleCancelWorkflow}
                        onDelete={handleDeleteWorkflow}
                        onViewDetails={handleViewDetails}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Recent/Terminal Workflows Section */}
              {filteredTerminalWorkflows.length > 0 && (
                <div>
                  <h2 className="text-sm font-medium text-[var(--color-text-secondary)] mb-3">
                    Recent ({filteredTerminalWorkflows.length})
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="terminal-workflows-grid">
                    {filteredTerminalWorkflows.slice(0, 9).map((workflow) => (
                      <WorkflowCard
                        key={workflow.id}
                        workflow={workflow}
                        onCancel={handleCancelWorkflow}
                        onDelete={handleDeleteWorkflow}
                        onViewDetails={handleViewDetails}
                      />
                    ))}
                  </div>
                  {filteredTerminalWorkflows.length > 9 && (
                    <p className="mt-4 text-sm text-[var(--color-text-secondary)] text-center">
                      Showing 9 of {filteredTerminalWorkflows.length} completed workflows
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Pour Workflow Modal */}
      <PourWorkflowModal
        isOpen={pourModalOpen}
        onClose={() => {
          setPourModalOpen(false);
          setSelectedPlaybookId(null);
        }}
        playbookId={selectedPlaybookId}
        onSuccess={handlePourSuccess}
      />
    </div>
  );
}

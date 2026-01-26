/**
 * PourWorkflowModal - Modal for creating workflows from playbooks (TB77)
 *
 * TB153: Updated with responsive mobile support
 *
 * This component is extracted from workflows.tsx to be reusable across
 * the application (dashboard quick actions, workflows page, etc.)
 */

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, Book, FileText, ChevronDown } from 'lucide-react';
import { ResponsiveModal } from '../shared/ResponsiveModal';

// ============================================================================
// Types
// ============================================================================

interface DiscoveredPlaybook {
  name: string;
  path: string;
  directory: string;
}

interface PlaybookVariable {
  name: string;
  description?: string;
  type: 'string' | 'number' | 'boolean';
  required: boolean;
  default?: unknown;
  enum?: unknown[];
}

interface PlaybookStep {
  id: string;
  title: string;
  description?: string;
  priority?: number;
  complexity?: number;
  dependsOn?: string[];
}

interface PlaybookDetail {
  id: string;
  name: string;
  title: string;
  version: number;
  steps: PlaybookStep[];
  variables: PlaybookVariable[];
  filePath: string;
  directory: string;
}

interface PourWorkflowModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (workflow: { id: string; title: string }) => void;
}

// ============================================================================
// Hooks
// ============================================================================

function usePlaybooks() {
  return useQuery<DiscoveredPlaybook[]>({
    queryKey: ['playbooks'],
    queryFn: async () => {
      const response = await fetch('/api/playbooks');
      if (!response.ok) {
        throw new Error('Failed to fetch playbooks');
      }
      return response.json();
    },
  });
}

function usePlaybook(name: string | null) {
  return useQuery<PlaybookDetail>({
    queryKey: ['playbooks', name],
    queryFn: async () => {
      if (!name) throw new Error('No playbook selected');
      const response = await fetch(`/api/playbooks/${encodeURIComponent(name)}`);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to fetch playbook');
      }
      return response.json();
    },
    enabled: !!name,
  });
}

function usePourWorkflow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      playbook: {
        name: string;
        version: string;
        steps: Array<{
          id: string;
          title: string;
          taskType?: string;
          priority?: number;
          complexity?: number;
        }>;
        variables?: Array<{
          name: string;
          type: string;
          default?: unknown;
        }>;
      };
      variables?: Record<string, unknown>;
      createdBy: string;
      title?: string;
      ephemeral?: boolean;
      tags?: string[];
    }) => {
      const response = await fetch('/api/workflows/pour', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to pour workflow');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    },
  });
}

// ============================================================================
// Sub-Components
// ============================================================================

function PlaybookPicker({
  selectedPlaybook,
  onSelect,
}: {
  selectedPlaybook: string | null;
  onSelect: (name: string) => void;
}) {
  const { data: playbooks = [], isLoading, isError } = usePlaybooks();
  const [isOpen, setIsOpen] = useState(false);

  if (isLoading) {
    return (
      <div
        data-testid="playbook-picker-loading"
        className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-gray-500 flex items-center gap-2"
      >
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading playbooks...
      </div>
    );
  }

  if (isError || playbooks.length === 0) {
    return (
      <div
        data-testid="playbook-picker-empty"
        className="w-full px-3 py-2 border border-dashed border-gray-300 rounded-md bg-gray-50 text-gray-500 text-center"
      >
        <Book className="w-5 h-5 mx-auto mb-1 text-gray-400" />
        <p className="text-sm">No playbooks found</p>
        <p className="text-xs">Add .playbook.yaml files to .elemental/playbooks</p>
      </div>
    );
  }

  return (
    <div className="relative" data-testid="playbook-picker">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        data-testid="playbook-picker-trigger"
        className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-left flex items-center justify-between hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {selectedPlaybook ? (
          <span className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-purple-500" />
            <span className="text-gray-900">{selectedPlaybook}</span>
          </span>
        ) : (
          <span className="text-gray-400">Select a playbook...</span>
        )}
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div
          data-testid="playbook-picker-dropdown"
          className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-y-auto"
        >
          {playbooks.map((playbook) => (
            <button
              key={playbook.name}
              type="button"
              onClick={() => {
                onSelect(playbook.name);
                setIsOpen(false);
              }}
              data-testid={`playbook-option-${playbook.name}`}
              className={`w-full px-3 py-2 text-left hover:bg-gray-50 flex items-center gap-2 ${
                selectedPlaybook === playbook.name ? 'bg-purple-50' : ''
              }`}
            >
              <FileText className={`w-4 h-4 ${selectedPlaybook === playbook.name ? 'text-purple-500' : 'text-gray-400'}`} />
              <span className={selectedPlaybook === playbook.name ? 'text-purple-700 font-medium' : 'text-gray-700'}>
                {playbook.name}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function VariableInputForm({
  variables,
  values,
  onChange,
}: {
  variables: PlaybookVariable[];
  values: Record<string, unknown>;
  onChange: (name: string, value: unknown) => void;
}) {
  if (variables.length === 0) {
    return null;
  }

  return (
    <div data-testid="variable-input-form" className="space-y-3">
      <div className="text-sm font-medium text-gray-700">Variables</div>
      {variables.map((variable) => (
        <div key={variable.name}>
          <label className="block text-sm text-gray-600 mb-1">
            {variable.name}
            {variable.required && <span className="text-red-500 ml-1">*</span>}
          </label>
          {variable.description && (
            <p className="text-xs text-gray-400 mb-1">{variable.description}</p>
          )}
          {variable.type === 'boolean' ? (
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={Boolean(values[variable.name] ?? variable.default ?? false)}
                onChange={(e) => onChange(variable.name, e.target.checked)}
                data-testid={`variable-input-${variable.name}`}
                className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
              />
              <span className="text-sm text-gray-700">Enable</span>
            </label>
          ) : variable.enum && variable.enum.length > 0 ? (
            <select
              value={String(values[variable.name] ?? variable.default ?? '')}
              onChange={(e) => onChange(variable.name, variable.type === 'number' ? Number(e.target.value) : e.target.value)}
              data-testid={`variable-input-${variable.name}`}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <option value="">Select...</option>
              {variable.enum.map((opt) => (
                <option key={String(opt)} value={String(opt)}>
                  {String(opt)}
                </option>
              ))}
            </select>
          ) : (
            <input
              type={variable.type === 'number' ? 'number' : 'text'}
              value={String(values[variable.name] ?? variable.default ?? '')}
              onChange={(e) => onChange(variable.name, variable.type === 'number' ? Number(e.target.value) : e.target.value)}
              data-testid={`variable-input-${variable.name}`}
              placeholder={variable.default ? `Default: ${variable.default}` : ''}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          )}
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function PourWorkflowModal({
  isOpen,
  onClose,
  onSuccess,
}: PourWorkflowModalProps) {
  const pourWorkflow = usePourWorkflow();
  const [title, setTitle] = useState('');
  const [selectedPlaybookName, setSelectedPlaybookName] = useState<string | null>(null);
  const [variables, setVariables] = useState<Record<string, unknown>>({});
  const [useQuickMode, setUseQuickMode] = useState(true);
  const [quickPlaybookName, setQuickPlaybookName] = useState('');

  const { data: selectedPlaybook, isLoading: isLoadingPlaybook } = usePlaybook(selectedPlaybookName);

  // Reset variables when playbook changes
  useEffect(() => {
    if (selectedPlaybook) {
      const defaults: Record<string, unknown> = {};
      for (const v of selectedPlaybook.variables) {
        if (v.default !== undefined) {
          defaults[v.name] = v.default;
        }
      }
      setVariables(defaults);
    } else {
      setVariables({});
    }
  }, [selectedPlaybook]);

  // Reset form when modal closes
  useEffect(() => {
    if (!isOpen) {
      setTitle('');
      setSelectedPlaybookName(null);
      setQuickPlaybookName('');
      setVariables({});
      setUseQuickMode(true);
      pourWorkflow.reset();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleVariableChange = (name: string, value: unknown) => {
    setVariables((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    let playbook;

    if (useQuickMode || !selectedPlaybook) {
      // Create a simple playbook for quick mode
      playbook = {
        name: quickPlaybookName || 'Quick Workflow',
        version: '1.0.0',
        variables: [],
        steps: [
          { id: 'step-1', title: 'Step 1', priority: 3 },
          { id: 'step-2', title: 'Step 2', priority: 3 },
          { id: 'step-3', title: 'Step 3', priority: 3 },
        ],
      };
    } else {
      // Use the selected playbook
      playbook = {
        name: selectedPlaybook.name,
        version: String(selectedPlaybook.version),
        variables: selectedPlaybook.variables,
        steps: selectedPlaybook.steps,
      };
    }

    const workflowTitle = title || playbook.name || 'New Workflow';

    try {
      const result = await pourWorkflow.mutateAsync({
        playbook,
        variables: useQuickMode ? undefined : variables,
        createdBy: 'web-user',
        title: workflowTitle,
      });
      onSuccess?.({ id: result.id, title: workflowTitle });
      onClose();
    } catch {
      // Error handled by mutation
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  const formActions = (
    <div className="flex items-center justify-end gap-3">
      <button
        type="button"
        onClick={onClose}
        className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors touch-target"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={handleSubmit as unknown as () => void}
        disabled={pourWorkflow.isPending || (!useQuickMode && (!selectedPlaybook || selectedPlaybook.steps.length === 0))}
        data-testid="pour-submit-button"
        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-md hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors touch-target"
      >
        {pourWorkflow.isPending ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Pouring...
          </>
        ) : (
          <>
            <Plus className="w-4 h-4" />
            Pour
          </>
        )}
      </button>
    </div>
  );

  return (
    <ResponsiveModal
      open={isOpen}
      onClose={onClose}
      title="Pour New Workflow"
      icon={<Book className="w-5 h-5 text-purple-500" />}
      size="lg"
      data-testid="pour-workflow-modal"
      footer={formActions}
    >
      <form onSubmit={handleSubmit} className="p-4" onKeyDown={handleKeyDown}>
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Workflow Title
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            data-testid="pour-title-input"
            className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-purple-500 touch-target"
            placeholder="My Workflow"
            autoFocus
          />
        </div>

        {/* Mode Toggle */}
        <div className="mb-4">
          <div className="flex gap-2 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg">
            <button
              type="button"
              onClick={() => setUseQuickMode(true)}
              data-testid="mode-quick"
              className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg transition-colors touch-target ${
                useQuickMode
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              Quick Create
            </button>
            <button
              type="button"
              onClick={() => setUseQuickMode(false)}
              data-testid="mode-playbook"
              className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg transition-colors touch-target ${
                !useQuickMode
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              From Playbook
            </button>
          </div>
        </div>

        {useQuickMode ? (
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Playbook Name
            </label>
            <input
              type="text"
              value={quickPlaybookName}
              onChange={(e) => setQuickPlaybookName(e.target.value)}
              data-testid="pour-playbook-input"
              className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-purple-500 touch-target"
              placeholder="Quick Setup"
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              A simple 3-step workflow will be created with this name
            </p>
          </div>
        ) : (
          <>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Select Playbook
              </label>
              <PlaybookPicker
                selectedPlaybook={selectedPlaybookName}
                onSelect={setSelectedPlaybookName}
              />
            </div>

            {selectedPlaybookName && isLoadingPlaybook && (
              <div className="mb-4 flex items-center gap-2 text-gray-500 dark:text-gray-400 text-sm">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading playbook details...
              </div>
            )}

            {selectedPlaybook && (
              <>
                {/* Playbook Info */}
                <div
                  data-testid="playbook-info"
                  className="mb-4 p-3 bg-purple-50 dark:bg-purple-900/30 rounded-lg border border-purple-100 dark:border-purple-800"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Book className="w-4 h-4 text-purple-500" />
                    <span className="font-medium text-purple-900 dark:text-purple-300">{selectedPlaybook.title}</span>
                  </div>
                  <div className="text-xs text-purple-700 dark:text-purple-400">
                    {selectedPlaybook.steps.length} steps • Version {selectedPlaybook.version}
                  </div>
                </div>

                {/* TB122: Warning if playbook has no steps */}
                {selectedPlaybook.steps.length === 0 && (
                  <div
                    data-testid="empty-playbook-warning"
                    className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-lg"
                  >
                    <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      <span className="text-sm font-medium">This playbook has no steps defined</span>
                    </div>
                    <p className="mt-1 text-xs text-amber-600 dark:text-amber-500">
                      Workflows must have at least one task. Add steps to this playbook or choose a different one.
                    </p>
                  </div>
                )}

                {/* Variable Inputs */}
                {selectedPlaybook.variables.length > 0 && (
                  <div className="mb-4">
                    <VariableInputForm
                      variables={selectedPlaybook.variables}
                      values={variables}
                      onChange={handleVariableChange}
                    />
                  </div>
                )}

                {/* Steps Preview */}
                <div className="mb-4">
                  <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Steps ({selectedPlaybook.steps.length})
                  </div>
                  <div
                    data-testid="playbook-steps-preview"
                    className="space-y-1 max-h-32 overflow-y-auto"
                  >
                    {selectedPlaybook.steps.map((step, index) => (
                      <div
                        key={step.id}
                        className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 py-1"
                      >
                        <span className="w-5 h-5 flex items-center justify-center bg-gray-100 dark:bg-gray-800 rounded text-xs font-medium">
                          {index + 1}
                        </span>
                        <span>{step.title}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </>
        )}

        {pourWorkflow.isError && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-400">
            {pourWorkflow.error?.message || 'Failed to pour workflow'}
          </div>
        )}
      </form>
    </ResponsiveModal>
  );
}

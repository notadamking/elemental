/**
 * PourWorkflowModal - Dialog for pouring (instantiating) a playbook as a workflow
 *
 * TB-O34: Pour Workflow Template
 *
 * Features:
 * - Variable input form for playbook variables
 * - Preview of steps that will be created as tasks
 * - Custom workflow title
 * - Ephemeral workflow toggle
 * - Validation before creation
 */

import { useState, useEffect, useMemo } from 'react';
import {
  X,
  Play,
  AlertCircle,
  Loader2,
  ChevronDown,
  ChevronRight,
  BookOpen,
  Check,
  Hash,
  ToggleLeft,
  Type,
  List,
} from 'lucide-react';
import type { PlaybookVariable, PlaybookStep } from '../../api/types';
import { usePlaybook, usePourPlaybook } from '../../api/hooks/useWorkflows';

export interface PourWorkflowModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** The playbook ID to pour */
  playbookId: string | null;
  /** Callback when workflow is successfully created */
  onSuccess?: (workflow: { id: string; title: string }) => void;
}

/**
 * Get the icon for a variable type
 */
function getVariableTypeIcon(type: string) {
  switch (type) {
    case 'string':
      return <Type className="w-3.5 h-3.5" />;
    case 'number':
      return <Hash className="w-3.5 h-3.5" />;
    case 'boolean':
      return <ToggleLeft className="w-3.5 h-3.5" />;
    default:
      return <Type className="w-3.5 h-3.5" />;
  }
}

/**
 * Variable input component that renders the appropriate input type
 */
function VariableInput({
  variable,
  value,
  onChange,
}: {
  variable: PlaybookVariable;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  // Boolean input
  if (variable.type === 'boolean') {
    return (
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={Boolean(value ?? variable.default ?? false)}
          onChange={(e) => onChange(e.target.checked)}
          className="
            w-4 h-4
            rounded
            border-[var(--color-border)]
            text-[var(--color-primary)]
            focus:ring-[var(--color-primary)]/30
          "
          data-testid={`variable-${variable.name}`}
        />
        <span className="text-sm text-[var(--color-text)]">Enable</span>
      </label>
    );
  }

  // Enum/select input
  if (variable.enum && variable.enum.length > 0) {
    return (
      <div className="relative">
        <select
          value={String(value ?? variable.default ?? '')}
          onChange={(e) =>
            onChange(
              variable.type === 'number'
                ? Number(e.target.value)
                : e.target.value
            )
          }
          className="
            w-full px-3 py-2 pr-8
            text-sm
            bg-[var(--color-surface)]
            border border-[var(--color-border)]
            rounded-lg
            appearance-none
            focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30
          "
          data-testid={`variable-${variable.name}`}
        >
          <option value="">Select...</option>
          {variable.enum.map((opt) => (
            <option key={String(opt)} value={String(opt)}>
              {String(opt)}
            </option>
          ))}
        </select>
        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-tertiary)] pointer-events-none" />
      </div>
    );
  }

  // Number input
  if (variable.type === 'number') {
    return (
      <input
        type="number"
        value={value !== undefined ? String(value) : (variable.default !== undefined ? String(variable.default) : '')}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : undefined)}
        placeholder={variable.default !== undefined ? `Default: ${variable.default}` : 'Enter number...'}
        className="
          w-full px-3 py-2
          text-sm
          bg-[var(--color-surface)]
          border border-[var(--color-border)]
          rounded-lg
          placeholder:text-[var(--color-text-tertiary)]
          focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30
        "
        data-testid={`variable-${variable.name}`}
      />
    );
  }

  // Default: text input
  return (
    <input
      type="text"
      value={String(value ?? variable.default ?? '')}
      onChange={(e) => onChange(e.target.value)}
      placeholder={variable.default ? `Default: ${variable.default}` : 'Enter value...'}
      className="
        w-full px-3 py-2
        text-sm
        bg-[var(--color-surface)]
        border border-[var(--color-border)]
        rounded-lg
        placeholder:text-[var(--color-text-tertiary)]
        focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30
      "
      data-testid={`variable-${variable.name}`}
    />
  );
}

/**
 * Steps preview component showing what tasks will be created
 */
function StepsPreview({ steps }: { steps: PlaybookStep[] }) {
  const [isExpanded, setIsExpanded] = useState(true);

  if (steps.length === 0) {
    return (
      <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
        <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300">
          <AlertCircle className="w-4 h-4" />
          <span className="text-sm font-medium">No steps defined</span>
        </div>
        <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
          This playbook has no steps. The workflow will be created but no tasks
          will be generated.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 text-sm font-medium text-[var(--color-text)] hover:text-[var(--color-primary)] transition-colors"
        data-testid="steps-toggle"
      >
        {isExpanded ? (
          <ChevronDown className="w-4 h-4" />
        ) : (
          <ChevronRight className="w-4 h-4" />
        )}
        <List className="w-4 h-4" />
        Steps ({steps.length})
      </button>
      {isExpanded && (
        <div
          className="space-y-1 max-h-40 overflow-y-auto pl-6"
          data-testid="steps-preview"
        >
          {steps.map((step, index) => (
            <div
              key={step.id}
              className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)] py-1"
            >
              <span className="w-5 h-5 flex items-center justify-center bg-[var(--color-surface)] border border-[var(--color-border)] rounded text-xs font-medium">
                {index + 1}
              </span>
              <span className="flex-1 truncate">{step.title}</span>
              {step.dependsOn && step.dependsOn.length > 0 && (
                <span className="text-xs text-[var(--color-text-tertiary)]">
                  depends on {step.dependsOn.length}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function PourWorkflowModal({
  isOpen,
  onClose,
  playbookId,
  onSuccess,
}: PourWorkflowModalProps) {
  const [title, setTitle] = useState('');
  const [variables, setVariables] = useState<Record<string, unknown>>({});
  const [isEphemeral, setIsEphemeral] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch playbook details
  const {
    data: playbookResponse,
    isLoading: isLoadingPlaybook,
    error: playbookError,
  } = usePlaybook(playbookId ?? undefined);
  const playbook = playbookResponse?.playbook;

  // Pour mutation
  const pourPlaybook = usePourPlaybook();

  // Reset form when playbook changes
  useEffect(() => {
    if (playbook) {
      // Initialize variables with defaults
      const defaults: Record<string, unknown> = {};
      for (const v of playbook.variables) {
        if (v.default !== undefined) {
          defaults[v.name] = v.default;
        }
      }
      setVariables(defaults);
      setTitle('');
      setError(null);
    }
  }, [playbook]);

  // Reset form when modal closes
  useEffect(() => {
    if (!isOpen) {
      setTitle('');
      setVariables({});
      setIsEphemeral(false);
      setShowAdvanced(false);
      setError(null);
      pourPlaybook.reset();
    }
  }, [isOpen, pourPlaybook]);

  // Check if all required variables are filled
  const missingRequiredVariables = useMemo(() => {
    if (!playbook) return [];
    return playbook.variables
      .filter((v) => v.required && variables[v.name] === undefined)
      .map((v) => v.name);
  }, [playbook, variables]);

  const canSubmit = useMemo(() => {
    if (!playbook) return false;
    if (pourPlaybook.isPending) return false;
    if (missingRequiredVariables.length > 0) return false;
    return true;
  }, [playbook, pourPlaybook.isPending, missingRequiredVariables]);

  if (!isOpen) return null;

  const handleClose = () => {
    setError(null);
    onClose();
  };

  const handleVariableChange = (name: string, value: unknown) => {
    setVariables((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!playbookId || !playbook) {
      setError('No playbook selected');
      return;
    }

    if (missingRequiredVariables.length > 0) {
      setError(`Missing required variables: ${missingRequiredVariables.join(', ')}`);
      return;
    }

    try {
      const result = await pourPlaybook.mutateAsync({
        playbookId,
        title: title.trim() || undefined,
        variables: Object.keys(variables).length > 0 ? variables : undefined,
        ephemeral: isEphemeral,
      });

      onSuccess?.({ id: result.workflow.id, title: result.workflow.title });
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create workflow');
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50 animate-fade-in"
        onClick={handleClose}
        data-testid="pour-workflow-backdrop"
      />

      {/* Dialog */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none overflow-y-auto">
        <div
          className="
            w-full max-w-lg
            bg-[var(--color-bg)]
            rounded-xl shadow-2xl
            border border-[var(--color-border)]
            animate-scale-in
            pointer-events-auto
            my-8
          "
          data-testid="pour-workflow-dialog"
          role="dialog"
          aria-labelledby="pour-workflow-title"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
            <div className="flex items-center gap-2">
              <Play className="w-5 h-5 text-[var(--color-primary)]" />
              <h2
                id="pour-workflow-title"
                className="text-lg font-semibold text-[var(--color-text)]"
              >
                Pour Workflow
              </h2>
            </div>
            <button
              onClick={handleClose}
              className="
                p-1.5 rounded-lg
                text-[var(--color-text-tertiary)]
                hover:text-[var(--color-text)]
                hover:bg-[var(--color-surface-hover)]
                transition-colors
              "
              aria-label="Close dialog"
              data-testid="pour-workflow-close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <form onSubmit={handleSubmit} className="p-4 space-y-4">
            {/* Error message */}
            {(error || playbookError) && (
              <div className="flex items-center gap-2 px-3 py-2 text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {error || playbookError?.message || 'Failed to load playbook'}
              </div>
            )}

            {/* Loading state */}
            {isLoadingPlaybook && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-8 h-8 text-[var(--color-primary)] animate-spin" />
              </div>
            )}

            {/* Playbook info */}
            {playbook && !isLoadingPlaybook && (
              <>
                <div className="p-3 bg-[var(--color-primary-muted)] border border-[var(--color-primary)]/20 rounded-lg">
                  <div className="flex items-center gap-2 mb-1">
                    <BookOpen className="w-4 h-4 text-[var(--color-primary)]" />
                    <span className="font-medium text-[var(--color-text)]">
                      {playbook.title}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-[var(--color-text-secondary)]">
                    <span className="font-mono">{playbook.name}</span>
                    <span>•</span>
                    <span>v{playbook.version}</span>
                    <span>•</span>
                    <span>{playbook.steps.length} steps</span>
                    {playbook.variables.length > 0 && (
                      <>
                        <span>•</span>
                        <span>{playbook.variables.length} variables</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Workflow title */}
                <div className="space-y-1">
                  <label
                    htmlFor="workflow-title"
                    className="text-sm font-medium text-[var(--color-text)]"
                  >
                    Workflow Title
                  </label>
                  <input
                    id="workflow-title"
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={`${playbook.title} - Run`}
                    className="
                      w-full px-3 py-2
                      text-sm
                      bg-[var(--color-surface)]
                      border border-[var(--color-border)]
                      rounded-lg
                      placeholder:text-[var(--color-text-tertiary)]
                      focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30
                    "
                    data-testid="workflow-title"
                  />
                  <p className="text-xs text-[var(--color-text-tertiary)]">
                    Leave empty to use default title
                  </p>
                </div>

                {/* Variables */}
                {playbook.variables.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-medium text-[var(--color-text)]">
                      Variables
                    </h3>
                    {playbook.variables.map((variable) => (
                      <div key={variable.name} className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[var(--color-text-secondary)]">
                            {getVariableTypeIcon(variable.type)}
                          </span>
                          <label className="text-sm text-[var(--color-text)]">
                            {variable.name}
                            {variable.required && (
                              <span className="text-red-500 ml-0.5">*</span>
                            )}
                          </label>
                        </div>
                        {variable.description && (
                          <p className="text-xs text-[var(--color-text-tertiary)] ml-5">
                            {variable.description}
                          </p>
                        )}
                        <div className="ml-5">
                          <VariableInput
                            variable={variable}
                            value={variables[variable.name]}
                            onChange={(value) =>
                              handleVariableChange(variable.name, value)
                            }
                          />
                        </div>
                      </div>
                    ))}
                    {missingRequiredVariables.length > 0 && (
                      <p className="text-xs text-red-500">
                        Missing required variables: {missingRequiredVariables.join(', ')}
                      </p>
                    )}
                  </div>
                )}

                {/* Steps preview */}
                <StepsPreview steps={playbook.steps} />

                {/* Advanced options */}
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    className="flex items-center gap-2 text-sm font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text)] transition-colors"
                    data-testid="toggle-advanced"
                  >
                    <ChevronDown
                      className={`w-4 h-4 transition-transform ${
                        showAdvanced ? 'rotate-180' : ''
                      }`}
                    />
                    Advanced Options
                  </button>
                  {showAdvanced && (
                    <div className="pl-6 space-y-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isEphemeral}
                          onChange={(e) => setIsEphemeral(e.target.checked)}
                          className="
                            w-4 h-4
                            rounded
                            border-[var(--color-border)]
                            text-[var(--color-primary)]
                            focus:ring-[var(--color-primary)]/30
                          "
                          data-testid="ephemeral-checkbox"
                        />
                        <span className="text-sm text-[var(--color-text)]">
                          Ephemeral workflow
                        </span>
                      </label>
                      <p className="text-xs text-[var(--color-text-tertiary)]">
                        Ephemeral workflows are automatically cleaned up after completion
                      </p>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2 border-t border-[var(--color-border)]">
              <button
                type="button"
                onClick={handleClose}
                className="
                  px-4 py-2
                  text-sm font-medium
                  text-[var(--color-text-secondary)]
                  hover:text-[var(--color-text)]
                  hover:bg-[var(--color-surface-hover)]
                  rounded-lg
                  transition-colors
                "
                data-testid="cancel-pour"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!canSubmit}
                className="
                  flex items-center gap-2
                  px-4 py-2
                  text-sm font-medium
                  text-white
                  bg-[var(--color-primary)]
                  hover:bg-[var(--color-primary-hover)]
                  disabled:opacity-50 disabled:cursor-not-allowed
                  rounded-lg
                  transition-colors
                "
                data-testid="submit-pour"
              >
                {pourPlaybook.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    Pour Workflow
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

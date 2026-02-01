/**
 * WorkflowEditorModal - Visual editor for creating and editing playbook templates
 *
 * TB-O33: Visual Workflow Editor
 *
 * Features:
 * - Step list with drag-to-reorder
 * - Step form for editing individual steps
 * - Variable definitions UI
 * - YAML preview and export
 * - Import YAML functionality
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  X,
  Save,
  AlertCircle,
  Loader2,
  BookOpen,
  Plus,
  Trash2,
  Code,
  FileText,
  Variable,
  List,
  GripVertical,
  Copy,
  Download,
  Upload,
  Check,
  ArrowUp,
  ArrowDown,
  Edit3,
} from 'lucide-react';
import type {
  Playbook,
  PlaybookStep,
  PlaybookVariable,
  VariableType,
  TaskTypeValue,
  Priority,
  Complexity,
} from '../../api/types';
import {
  useCreatePlaybook,
  useUpdatePlaybook,
  usePlaybook,
} from '../../api/hooks/useWorkflows';

// ============================================================================
// Types
// ============================================================================

export interface WorkflowEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Playbook ID for editing (null for creating new) */
  playbookId?: string | null;
  /** Callback when playbook is successfully saved */
  onSuccess?: (playbook: Playbook) => void;
}

type EditorTab = 'steps' | 'variables' | 'yaml';

interface StepFormData {
  id: string;
  title: string;
  description: string;
  taskType: TaskTypeValue | '';
  priority: Priority | '';
  complexity: Complexity | '';
  assignee: string;
  dependsOn: string[];
  condition: string;
}

interface VariableFormData {
  name: string;
  description: string;
  type: VariableType;
  required: boolean;
  default: string;
  enum: string[];
}

// ============================================================================
// Constants
// ============================================================================

const TASK_TYPES: { value: TaskTypeValue; label: string }[] = [
  { value: 'task', label: 'Task' },
  { value: 'bug', label: 'Bug' },
  { value: 'feature', label: 'Feature' },
  { value: 'chore', label: 'Chore' },
];

const PRIORITIES: { value: Priority; label: string }[] = [
  { value: 5, label: '5 - Critical' },
  { value: 4, label: '4 - High' },
  { value: 3, label: '3 - Medium' },
  { value: 2, label: '2 - Low' },
  { value: 1, label: '1 - Lowest' },
];

const COMPLEXITIES: { value: Complexity; label: string }[] = [
  { value: 1, label: '1 - Trivial' },
  { value: 2, label: '2 - Simple' },
  { value: 3, label: '3 - Medium' },
  { value: 4, label: '4 - Complex' },
  { value: 5, label: '5 - Very Complex' },
];

const VARIABLE_TYPES: { value: VariableType; label: string }[] = [
  { value: 'string', label: 'String' },
  { value: 'number', label: 'Number' },
  { value: 'boolean', label: 'Boolean' },
];

// ============================================================================
// Helper Functions
// ============================================================================

function generateStepId(): string {
  return `step_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function stepToFormData(step: PlaybookStep): StepFormData {
  return {
    id: step.id,
    title: step.title,
    description: step.description ?? '',
    taskType: step.taskType ?? '',
    priority: step.priority ?? '',
    complexity: step.complexity ?? '',
    assignee: step.assignee ?? '',
    dependsOn: step.dependsOn ?? [],
    condition: step.condition ?? '',
  };
}

function formDataToStep(data: StepFormData): PlaybookStep {
  const step: PlaybookStep = {
    id: data.id,
    title: data.title,
  };

  if (data.description.trim()) {
    step.description = data.description.trim();
  }
  if (data.taskType) {
    step.taskType = data.taskType as TaskTypeValue;
  }
  if (data.priority) {
    step.priority = data.priority as Priority;
  }
  if (data.complexity) {
    step.complexity = data.complexity as Complexity;
  }
  if (data.assignee.trim()) {
    step.assignee = data.assignee.trim();
  }
  if (data.dependsOn.length > 0) {
    step.dependsOn = data.dependsOn;
  }
  if (data.condition.trim()) {
    step.condition = data.condition.trim();
  }

  return step;
}

function variableToFormData(variable: PlaybookVariable): VariableFormData {
  return {
    name: variable.name,
    description: variable.description ?? '',
    type: variable.type,
    required: variable.required,
    default: variable.default !== undefined ? String(variable.default) : '',
    enum: variable.enum?.map(String) ?? [],
  };
}

function formDataToVariable(data: VariableFormData): PlaybookVariable {
  const variable: PlaybookVariable = {
    name: data.name,
    type: data.type,
    required: data.required,
  };

  if (data.description.trim()) {
    variable.description = data.description.trim();
  }

  if (data.default.trim()) {
    switch (data.type) {
      case 'number':
        variable.default = Number(data.default);
        break;
      case 'boolean':
        variable.default = data.default === 'true';
        break;
      default:
        variable.default = data.default;
    }
  }

  if (data.enum.length > 0 && data.enum.some(v => v.trim())) {
    const enumValues = data.enum.filter(v => v.trim());
    switch (data.type) {
      case 'number':
        variable.enum = enumValues.map(Number);
        break;
      case 'boolean':
        variable.enum = enumValues.map(v => v === 'true');
        break;
      default:
        variable.enum = enumValues;
    }
  }

  return variable;
}

function generateYaml(
  name: string,
  title: string,
  steps: StepFormData[],
  variables: VariableFormData[]
): string {
  const lines: string[] = [];

  lines.push(`name: ${name}`);
  lines.push(`title: "${title}"`);
  lines.push(`version: 1`);

  if (variables.length > 0) {
    lines.push('');
    lines.push('variables:');
    for (const v of variables) {
      lines.push(`  - name: ${v.name}`);
      lines.push(`    type: ${v.type}`);
      lines.push(`    required: ${v.required}`);
      if (v.description) {
        lines.push(`    description: "${v.description}"`);
      }
      if (v.default) {
        const defaultVal = v.type === 'string' ? `"${v.default}"` : v.default;
        lines.push(`    default: ${defaultVal}`);
      }
      if (v.enum.length > 0 && v.enum.some(e => e.trim())) {
        lines.push('    enum:');
        for (const e of v.enum.filter(x => x.trim())) {
          const enumVal = v.type === 'string' ? `"${e}"` : e;
          lines.push(`      - ${enumVal}`);
        }
      }
    }
  }

  if (steps.length > 0) {
    lines.push('');
    lines.push('steps:');
    for (const s of steps) {
      lines.push(`  - id: ${s.id}`);
      lines.push(`    title: "${s.title}"`);
      if (s.description) {
        lines.push(`    description: "${s.description}"`);
      }
      if (s.taskType) {
        lines.push(`    task_type: ${s.taskType}`);
      }
      if (s.priority) {
        lines.push(`    priority: ${s.priority}`);
      }
      if (s.complexity) {
        lines.push(`    complexity: ${s.complexity}`);
      }
      if (s.assignee) {
        lines.push(`    assignee: "${s.assignee}"`);
      }
      if (s.dependsOn.length > 0) {
        lines.push('    depends_on:');
        for (const d of s.dependsOn) {
          lines.push(`      - ${d}`);
        }
      }
      if (s.condition) {
        lines.push(`    condition: "${s.condition}"`);
      }
    }
  }

  return lines.join('\n');
}

function parseYaml(yamlContent: string): {
  name: string;
  title: string;
  steps: StepFormData[];
  variables: VariableFormData[];
} | null {
  try {
    // Simple YAML parser for playbook format
    const lines = yamlContent.split('\n');
    let name = '';
    let title = '';
    const steps: StepFormData[] = [];
    const variables: VariableFormData[] = [];

    let currentSection: 'root' | 'variables' | 'steps' = 'root';
    let currentVariable: Partial<VariableFormData> | null = null;
    let currentStep: Partial<StepFormData> | null = null;
    let inEnum = false;
    let inDependsOn = false;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      // Detect section changes
      if (trimmed === 'variables:') {
        currentSection = 'variables';
        continue;
      }
      if (trimmed === 'steps:') {
        if (currentVariable) {
          variables.push({
            name: currentVariable.name ?? '',
            description: currentVariable.description ?? '',
            type: currentVariable.type ?? 'string',
            required: currentVariable.required ?? false,
            default: currentVariable.default ?? '',
            enum: currentVariable.enum ?? [],
          });
          currentVariable = null;
        }
        currentSection = 'steps';
        continue;
      }

      // Parse root level
      if (currentSection === 'root') {
        if (trimmed.startsWith('name:')) {
          name = trimmed.slice(5).trim().replace(/^["']|["']$/g, '');
        } else if (trimmed.startsWith('title:')) {
          title = trimmed.slice(6).trim().replace(/^["']|["']$/g, '');
        }
      }

      // Parse variables
      if (currentSection === 'variables') {
        if (trimmed.startsWith('- name:')) {
          if (currentVariable) {
            variables.push({
              name: currentVariable.name ?? '',
              description: currentVariable.description ?? '',
              type: currentVariable.type ?? 'string',
              required: currentVariable.required ?? false,
              default: currentVariable.default ?? '',
              enum: currentVariable.enum ?? [],
            });
          }
          currentVariable = { name: trimmed.slice(8).trim(), enum: [] };
          inEnum = false;
        } else if (currentVariable) {
          if (trimmed === 'enum:') {
            inEnum = true;
          } else if (inEnum && trimmed.startsWith('-')) {
            const enumVal = trimmed.slice(1).trim().replace(/^["']|["']$/g, '');
            currentVariable.enum = [...(currentVariable.enum ?? []), enumVal];
          } else if (trimmed.startsWith('type:')) {
            currentVariable.type = trimmed.slice(5).trim() as VariableType;
            inEnum = false;
          } else if (trimmed.startsWith('required:')) {
            currentVariable.required = trimmed.slice(9).trim() === 'true';
            inEnum = false;
          } else if (trimmed.startsWith('description:')) {
            currentVariable.description = trimmed.slice(12).trim().replace(/^["']|["']$/g, '');
            inEnum = false;
          } else if (trimmed.startsWith('default:')) {
            currentVariable.default = trimmed.slice(8).trim().replace(/^["']|["']$/g, '');
            inEnum = false;
          }
        }
      }

      // Parse steps
      if (currentSection === 'steps') {
        if (trimmed.startsWith('- id:')) {
          if (currentStep) {
            steps.push({
              id: currentStep.id ?? '',
              title: currentStep.title ?? '',
              description: currentStep.description ?? '',
              taskType: (currentStep.taskType ?? '') as TaskTypeValue | '',
              priority: (currentStep.priority ?? '') as Priority | '',
              complexity: (currentStep.complexity ?? '') as Complexity | '',
              assignee: currentStep.assignee ?? '',
              dependsOn: currentStep.dependsOn ?? [],
              condition: currentStep.condition ?? '',
            });
          }
          currentStep = { id: trimmed.slice(6).trim(), dependsOn: [] };
          inDependsOn = false;
        } else if (currentStep) {
          if (trimmed === 'depends_on:') {
            inDependsOn = true;
          } else if (inDependsOn && trimmed.startsWith('-')) {
            const depId = trimmed.slice(1).trim();
            currentStep.dependsOn = [...(currentStep.dependsOn ?? []), depId];
          } else if (trimmed.startsWith('title:')) {
            currentStep.title = trimmed.slice(6).trim().replace(/^["']|["']$/g, '');
            inDependsOn = false;
          } else if (trimmed.startsWith('description:')) {
            currentStep.description = trimmed.slice(12).trim().replace(/^["']|["']$/g, '');
            inDependsOn = false;
          } else if (trimmed.startsWith('task_type:')) {
            currentStep.taskType = trimmed.slice(10).trim() as TaskTypeValue;
            inDependsOn = false;
          } else if (trimmed.startsWith('priority:')) {
            currentStep.priority = Number(trimmed.slice(9).trim()) as Priority;
            inDependsOn = false;
          } else if (trimmed.startsWith('complexity:')) {
            currentStep.complexity = Number(trimmed.slice(11).trim()) as Complexity;
            inDependsOn = false;
          } else if (trimmed.startsWith('assignee:')) {
            currentStep.assignee = trimmed.slice(9).trim().replace(/^["']|["']$/g, '');
            inDependsOn = false;
          } else if (trimmed.startsWith('condition:')) {
            currentStep.condition = trimmed.slice(10).trim().replace(/^["']|["']$/g, '');
            inDependsOn = false;
          }
        }
      }
    }

    // Push last items
    if (currentVariable) {
      variables.push({
        name: currentVariable.name ?? '',
        description: currentVariable.description ?? '',
        type: currentVariable.type ?? 'string',
        required: currentVariable.required ?? false,
        default: currentVariable.default ?? '',
        enum: currentVariable.enum ?? [],
      });
    }
    if (currentStep) {
      steps.push({
        id: currentStep.id ?? '',
        title: currentStep.title ?? '',
        description: currentStep.description ?? '',
        taskType: (currentStep.taskType ?? '') as TaskTypeValue | '',
        priority: (currentStep.priority ?? '') as Priority | '',
        complexity: (currentStep.complexity ?? '') as Complexity | '',
        assignee: currentStep.assignee ?? '',
        dependsOn: currentStep.dependsOn ?? [],
        condition: currentStep.condition ?? '',
      });
    }

    return { name, title, steps, variables };
  } catch {
    return null;
  }
}

// ============================================================================
// StepListItem Component
// ============================================================================

interface StepListItemProps {
  step: StepFormData;
  index: number;
  isSelected: boolean;
  onSelect: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
  isFirst: boolean;
  isLast: boolean;
}

function StepListItem({
  step,
  index,
  isSelected,
  onSelect,
  onMoveUp,
  onMoveDown,
  onDelete,
  isFirst,
  isLast,
}: StepListItemProps) {
  return (
    <div
      className={`
        flex items-center gap-2 p-3
        border rounded-lg cursor-pointer
        transition-colors duration-150
        ${isSelected
          ? 'border-[var(--color-primary)] bg-[var(--color-primary-muted)]'
          : 'border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-primary)]/50'
        }
      `}
      onClick={onSelect}
      data-testid={`step-item-${step.id}`}
    >
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <GripVertical className="w-4 h-4 text-[var(--color-text-tertiary)] cursor-grab flex-shrink-0" />
        <span className="w-6 h-6 flex items-center justify-center bg-[var(--color-bg)] border border-[var(--color-border)] rounded text-xs font-medium text-[var(--color-text-secondary)] flex-shrink-0">
          {index + 1}
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-[var(--color-text)] truncate">
            {step.title || 'Untitled step'}
          </div>
          <div className="text-xs text-[var(--color-text-tertiary)] font-mono truncate">
            {step.id}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1">
        {step.dependsOn.length > 0 && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
            {step.dependsOn.length} dep{step.dependsOn.length > 1 ? 's' : ''}
          </span>
        )}
        {step.condition && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400">
            cond
          </span>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onMoveUp(); }}
          disabled={isFirst}
          className="p-1 rounded hover:bg-[var(--color-surface-hover)] disabled:opacity-30 disabled:cursor-not-allowed"
          title="Move up"
        >
          <ArrowUp className="w-4 h-4 text-[var(--color-text-secondary)]" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onMoveDown(); }}
          disabled={isLast}
          className="p-1 rounded hover:bg-[var(--color-surface-hover)] disabled:opacity-30 disabled:cursor-not-allowed"
          title="Move down"
        >
          <ArrowDown className="w-4 h-4 text-[var(--color-text-secondary)]" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500"
          title="Delete step"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// StepForm Component
// ============================================================================

interface StepFormProps {
  step: StepFormData;
  onChange: (step: StepFormData) => void;
  allStepIds: string[];
  onClose: () => void;
}

function StepForm({ step, onChange, allStepIds, onClose }: StepFormProps) {
  const availableDependencies = allStepIds.filter(id => id !== step.id);

  const handleChange = (field: keyof StepFormData, value: unknown) => {
    onChange({ ...step, [field]: value });
  };

  const toggleDependency = (depId: string) => {
    const newDeps = step.dependsOn.includes(depId)
      ? step.dependsOn.filter(d => d !== depId)
      : [...step.dependsOn, depId];
    handleChange('dependsOn', newDeps);
  };

  return (
    <div className="space-y-4" data-testid="step-form">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-[var(--color-text)]">Edit Step</h4>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-[var(--color-surface-hover)]"
        >
          <X className="w-4 h-4 text-[var(--color-text-secondary)]" />
        </button>
      </div>

      {/* Step ID */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-[var(--color-text-secondary)]">
          Step ID
        </label>
        <input
          type="text"
          value={step.id}
          onChange={(e) => handleChange('id', e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))}
          placeholder="step_id"
          className="w-full px-3 py-2 text-sm bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30 font-mono"
          data-testid="step-id-input"
        />
      </div>

      {/* Title */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-[var(--color-text-secondary)]">
          Title <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={step.title}
          onChange={(e) => handleChange('title', e.target.value)}
          placeholder="Step title (supports {{variable}} substitution)"
          className="w-full px-3 py-2 text-sm bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30"
          data-testid="step-title-input"
        />
      </div>

      {/* Description */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-[var(--color-text-secondary)]">
          Description
        </label>
        <textarea
          value={step.description}
          onChange={(e) => handleChange('description', e.target.value)}
          placeholder="Step description (supports {{variable}} substitution)"
          rows={3}
          className="w-full px-3 py-2 text-sm bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30 resize-none"
          data-testid="step-description-input"
        />
      </div>

      {/* Task Type, Priority, Complexity */}
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-[var(--color-text-secondary)]">
            Task Type
          </label>
          <select
            value={step.taskType}
            onChange={(e) => handleChange('taskType', e.target.value)}
            className="w-full px-3 py-2 text-sm bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30"
            data-testid="step-tasktype-select"
          >
            <option value="">None</option>
            {TASK_TYPES.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-[var(--color-text-secondary)]">
            Priority
          </label>
          <select
            value={step.priority}
            onChange={(e) => handleChange('priority', e.target.value ? Number(e.target.value) : '')}
            className="w-full px-3 py-2 text-sm bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30"
            data-testid="step-priority-select"
          >
            <option value="">None</option>
            {PRIORITIES.map(p => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-[var(--color-text-secondary)]">
            Complexity
          </label>
          <select
            value={step.complexity}
            onChange={(e) => handleChange('complexity', e.target.value ? Number(e.target.value) : '')}
            className="w-full px-3 py-2 text-sm bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30"
            data-testid="step-complexity-select"
          >
            <option value="">None</option>
            {COMPLEXITIES.map(c => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Assignee */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-[var(--color-text-secondary)]">
          Assignee
        </label>
        <input
          type="text"
          value={step.assignee}
          onChange={(e) => handleChange('assignee', e.target.value)}
          placeholder="{{variable}} or entity name"
          className="w-full px-3 py-2 text-sm bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30"
          data-testid="step-assignee-input"
        />
      </div>

      {/* Dependencies */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-[var(--color-text-secondary)]">
          Dependencies (steps that must complete before this one)
        </label>
        {availableDependencies.length === 0 ? (
          <p className="text-xs text-[var(--color-text-tertiary)] italic">
            No other steps available for dependencies
          </p>
        ) : (
          <div className="flex flex-wrap gap-2" data-testid="step-dependencies">
            {availableDependencies.map(depId => (
              <button
                key={depId}
                onClick={() => toggleDependency(depId)}
                className={`
                  px-2 py-1 text-xs rounded-full border transition-colors
                  ${step.dependsOn.includes(depId)
                    ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)]'
                    : 'bg-[var(--color-surface)] text-[var(--color-text-secondary)] border-[var(--color-border)] hover:border-[var(--color-primary)]'
                  }
                `}
              >
                {depId}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Condition */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-[var(--color-text-secondary)]">
          Condition (skip step if false)
        </label>
        <input
          type="text"
          value={step.condition}
          onChange={(e) => handleChange('condition', e.target.value)}
          placeholder="{{variable}} or {{var}} == value"
          className="w-full px-3 py-2 text-sm bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30 font-mono"
          data-testid="step-condition-input"
        />
        <p className="text-xs text-[var(--color-text-tertiary)]">
          Examples: {"{{is_premium}}"}, {"!{{skip_tests}}"}, {"{{env}} == production"}
        </p>
      </div>
    </div>
  );
}

// ============================================================================
// VariableListItem Component
// ============================================================================

interface VariableListItemProps {
  variable: VariableFormData;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}

function VariableListItem({ variable, isSelected, onSelect, onDelete }: VariableListItemProps) {
  return (
    <div
      className={`
        flex items-center gap-2 p-3
        border rounded-lg cursor-pointer
        transition-colors duration-150
        ${isSelected
          ? 'border-[var(--color-primary)] bg-[var(--color-primary-muted)]'
          : 'border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-primary)]/50'
        }
      `}
      onClick={onSelect}
      data-testid={`variable-item-${variable.name}`}
    >
      <Variable className="w-4 h-4 text-[var(--color-primary)] flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-[var(--color-text)] truncate font-mono">
            {variable.name || 'unnamed'}
          </span>
          {variable.required && (
            <span className="text-red-500 text-xs">required</span>
          )}
        </div>
        <div className="text-xs text-[var(--color-text-tertiary)]">
          {variable.type}
          {variable.enum.length > 0 && ` (enum: ${variable.enum.length})`}
        </div>
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500"
        title="Delete variable"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}

// ============================================================================
// VariableForm Component
// ============================================================================

interface VariableFormProps {
  variable: VariableFormData;
  onChange: (variable: VariableFormData) => void;
  onClose: () => void;
}

function VariableForm({ variable, onChange, onClose }: VariableFormProps) {
  const handleChange = (field: keyof VariableFormData, value: unknown) => {
    onChange({ ...variable, [field]: value });
  };

  const addEnumValue = () => {
    handleChange('enum', [...variable.enum, '']);
  };

  const updateEnumValue = (index: number, value: string) => {
    const newEnum = [...variable.enum];
    newEnum[index] = value;
    handleChange('enum', newEnum);
  };

  const removeEnumValue = (index: number) => {
    handleChange('enum', variable.enum.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-4" data-testid="variable-form">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-[var(--color-text)]">Edit Variable</h4>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-[var(--color-surface-hover)]"
        >
          <X className="w-4 h-4 text-[var(--color-text-secondary)]" />
        </button>
      </div>

      {/* Variable Name */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-[var(--color-text-secondary)]">
          Name <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={variable.name}
          onChange={(e) => handleChange('name', e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
          placeholder="variable_name"
          className="w-full px-3 py-2 text-sm bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30 font-mono"
          data-testid="variable-name-input"
        />
      </div>

      {/* Type */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-[var(--color-text-secondary)]">
          Type <span className="text-red-500">*</span>
        </label>
        <select
          value={variable.type}
          onChange={(e) => handleChange('type', e.target.value as VariableType)}
          className="w-full px-3 py-2 text-sm bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30"
          data-testid="variable-type-select"
        >
          {VARIABLE_TYPES.map(t => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>

      {/* Required */}
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={variable.required}
          onChange={(e) => handleChange('required', e.target.checked)}
          className="w-4 h-4 rounded border-[var(--color-border)] text-[var(--color-primary)]"
          data-testid="variable-required-checkbox"
        />
        <span className="text-sm text-[var(--color-text)]">Required</span>
      </label>

      {/* Description */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-[var(--color-text-secondary)]">
          Description
        </label>
        <input
          type="text"
          value={variable.description}
          onChange={(e) => handleChange('description', e.target.value)}
          placeholder="What this variable is for"
          className="w-full px-3 py-2 text-sm bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30"
          data-testid="variable-description-input"
        />
      </div>

      {/* Default Value */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-[var(--color-text-secondary)]">
          Default Value
        </label>
        {variable.type === 'boolean' ? (
          <select
            value={variable.default}
            onChange={(e) => handleChange('default', e.target.value)}
            className="w-full px-3 py-2 text-sm bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30"
            data-testid="variable-default-input"
          >
            <option value="">No default</option>
            <option value="true">true</option>
            <option value="false">false</option>
          </select>
        ) : (
          <input
            type={variable.type === 'number' ? 'number' : 'text'}
            value={variable.default}
            onChange={(e) => handleChange('default', e.target.value)}
            placeholder={variable.type === 'number' ? '0' : 'default value'}
            className="w-full px-3 py-2 text-sm bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30"
            data-testid="variable-default-input"
          />
        )}
      </div>

      {/* Enum Values */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-[var(--color-text-secondary)]">
            Allowed Values (Enum)
          </label>
          <button
            onClick={addEnumValue}
            className="flex items-center gap-1 px-2 py-1 text-xs text-[var(--color-primary)] hover:bg-[var(--color-primary-muted)] rounded"
          >
            <Plus className="w-3 h-3" />
            Add
          </button>
        </div>
        {variable.enum.length > 0 ? (
          <div className="space-y-2" data-testid="variable-enum-list">
            {variable.enum.map((val, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type={variable.type === 'number' ? 'number' : 'text'}
                  value={val}
                  onChange={(e) => updateEnumValue(i, e.target.value)}
                  placeholder={`Option ${i + 1}`}
                  className="flex-1 px-3 py-2 text-sm bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30"
                />
                <button
                  onClick={() => removeEnumValue(i)}
                  className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-[var(--color-text-tertiary)] italic">
            No enum values. Variable accepts any value of its type.
          </p>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// YamlPreview Component
// ============================================================================

interface YamlPreviewProps {
  yaml: string;
  onImport: (yaml: string) => void;
}

function YamlPreview({ yaml, onImport }: YamlPreviewProps) {
  const [importMode, setImportMode] = useState(false);
  const [importText, setImportText] = useState('');
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(yaml);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleDownload = () => {
    const blob = new Blob([yaml], { type: 'text/yaml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'playbook.yaml';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = () => {
    onImport(importText);
    setImportMode(false);
    setImportText('');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        onImport(content);
        setImportMode(false);
      };
      reader.readAsText(file);
    }
  };

  return (
    <div className="space-y-3" data-testid="yaml-preview">
      {/* Actions */}
      <div className="flex items-center gap-2 justify-end">
        <button
          onClick={() => setImportMode(!importMode)}
          className={`
            flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg transition-colors
            ${importMode
              ? 'bg-[var(--color-primary)] text-white'
              : 'bg-[var(--color-surface)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]'
            }
          `}
          data-testid="yaml-import-toggle"
        >
          <Upload className="w-4 h-4" />
          Import
        </button>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 px-3 py-1.5 text-sm bg-[var(--color-surface)] text-[var(--color-text-secondary)] rounded-lg hover:bg-[var(--color-surface-hover)]"
          data-testid="yaml-copy"
        >
          {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
          {copied ? 'Copied!' : 'Copy'}
        </button>
        <button
          onClick={handleDownload}
          className="flex items-center gap-1 px-3 py-1.5 text-sm bg-[var(--color-surface)] text-[var(--color-text-secondary)] rounded-lg hover:bg-[var(--color-surface-hover)]"
          data-testid="yaml-download"
        >
          <Download className="w-4 h-4" />
          Download
        </button>
      </div>

      {/* Import UI */}
      {importMode && (
        <div className="p-3 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg space-y-3">
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 px-3 py-2 text-sm bg-[var(--color-primary)] text-white rounded-lg cursor-pointer hover:bg-[var(--color-primary-hover)]">
              <FileText className="w-4 h-4" />
              Upload File
              <input
                type="file"
                accept=".yaml,.yml"
                onChange={handleFileUpload}
                className="hidden"
                data-testid="yaml-file-input"
              />
            </label>
            <span className="text-sm text-[var(--color-text-tertiary)]">or paste YAML below</span>
          </div>
          <textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder="Paste YAML content here..."
            rows={10}
            className="w-full px-3 py-2 text-sm font-mono bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30 resize-none"
            data-testid="yaml-import-textarea"
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => { setImportMode(false); setImportText(''); }}
              className="px-3 py-1.5 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] rounded-lg"
            >
              Cancel
            </button>
            <button
              onClick={handleImport}
              disabled={!importText.trim()}
              className="flex items-center gap-1 px-3 py-1.5 text-sm bg-[var(--color-primary)] text-white rounded-lg hover:bg-[var(--color-primary-hover)] disabled:opacity-50"
              data-testid="yaml-import-confirm"
            >
              <Check className="w-4 h-4" />
              Import
            </button>
          </div>
        </div>
      )}

      {/* YAML Preview */}
      <pre
        className="p-4 bg-gray-900 text-green-400 rounded-lg overflow-auto text-xs font-mono max-h-96"
        data-testid="yaml-content"
      >
        {yaml}
      </pre>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function WorkflowEditorModal({
  isOpen,
  onClose,
  playbookId,
  onSuccess,
}: WorkflowEditorModalProps) {
  const isEditing = Boolean(playbookId);

  // Form state
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [steps, setSteps] = useState<StepFormData[]>([]);
  const [variables, setVariables] = useState<VariableFormData[]>([]);
  const [activeTab, setActiveTab] = useState<EditorTab>('steps');
  const [selectedStepIndex, setSelectedStepIndex] = useState<number | null>(null);
  const [selectedVariableIndex, setSelectedVariableIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch existing playbook if editing
  const {
    data: playbookResponse,
    isLoading: isLoadingPlaybook,
    error: playbookError,
  } = usePlaybook(playbookId ?? undefined);
  const playbook = playbookResponse?.playbook;

  // Mutations
  const createPlaybook = useCreatePlaybook();
  const updatePlaybook = useUpdatePlaybook();

  // Initialize form from existing playbook
  useEffect(() => {
    if (playbook && isEditing) {
      setName(playbook.name);
      setTitle(playbook.title);
      setSteps(playbook.steps.map(stepToFormData));
      setVariables(playbook.variables.map(variableToFormData));
    }
  }, [playbook, isEditing]);

  // Reset form when modal closes
  useEffect(() => {
    if (!isOpen) {
      setName('');
      setTitle('');
      setSteps([]);
      setVariables([]);
      setActiveTab('steps');
      setSelectedStepIndex(null);
      setSelectedVariableIndex(null);
      setError(null);
      createPlaybook.reset();
      updatePlaybook.reset();
    }
  }, [isOpen]);

  // Generate YAML preview
  const yamlPreview = useMemo(() => {
    return generateYaml(name || 'my_playbook', title || 'My Playbook', steps, variables);
  }, [name, title, steps, variables]);

  // All step IDs for dependency selection
  const allStepIds = useMemo(() => steps.map(s => s.id), [steps]);

  // Validation
  const validationErrors = useMemo(() => {
    const errors: string[] = [];
    if (!name.trim()) errors.push('Name is required');
    if (!title.trim()) errors.push('Title is required');
    if (!/^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(name)) {
      errors.push('Name must start with letter/underscore, contain only alphanumeric, underscore, or hyphen');
    }
    for (const step of steps) {
      if (!step.id.trim()) errors.push('All steps must have an ID');
      if (!step.title.trim()) errors.push('All steps must have a title');
    }
    for (const variable of variables) {
      if (!variable.name.trim()) errors.push('All variables must have a name');
    }
    // Check for duplicate step IDs
    const stepIdSet = new Set<string>();
    for (const step of steps) {
      if (stepIdSet.has(step.id)) {
        errors.push(`Duplicate step ID: ${step.id}`);
      }
      stepIdSet.add(step.id);
    }
    // Check for duplicate variable names
    const varNameSet = new Set<string>();
    for (const variable of variables) {
      if (varNameSet.has(variable.name)) {
        errors.push(`Duplicate variable name: ${variable.name}`);
      }
      varNameSet.add(variable.name);
    }
    return errors;
  }, [name, title, steps, variables]);

  const canSave = validationErrors.length === 0 && !createPlaybook.isPending && !updatePlaybook.isPending;

  // Handlers
  const handleAddStep = useCallback(() => {
    const newStep: StepFormData = {
      id: generateStepId(),
      title: '',
      description: '',
      taskType: '',
      priority: '',
      complexity: '',
      assignee: '',
      dependsOn: [],
      condition: '',
    };
    setSteps(prev => [...prev, newStep]);
    setSelectedStepIndex(steps.length);
  }, [steps.length]);

  const handleUpdateStep = useCallback((index: number, updatedStep: StepFormData) => {
    setSteps(prev => prev.map((s, i) => i === index ? updatedStep : s));
  }, []);

  const handleDeleteStep = useCallback((index: number) => {
    const stepId = steps[index]?.id;
    setSteps(prev => {
      const newSteps = prev.filter((_, i) => i !== index);
      // Remove deleted step from other steps' dependencies
      return newSteps.map(s => ({
        ...s,
        dependsOn: s.dependsOn.filter(d => d !== stepId),
      }));
    });
    setSelectedStepIndex(null);
  }, [steps]);

  const handleMoveStep = useCallback((index: number, direction: 'up' | 'down') => {
    setSteps(prev => {
      const newSteps = [...prev];
      const newIndex = direction === 'up' ? index - 1 : index + 1;
      [newSteps[index], newSteps[newIndex]] = [newSteps[newIndex], newSteps[index]];
      return newSteps;
    });
    setSelectedStepIndex(direction === 'up' ? index - 1 : index + 1);
  }, []);

  const handleAddVariable = useCallback(() => {
    const newVariable: VariableFormData = {
      name: '',
      description: '',
      type: 'string',
      required: false,
      default: '',
      enum: [],
    };
    setVariables(prev => [...prev, newVariable]);
    setSelectedVariableIndex(variables.length);
  }, [variables.length]);

  const handleUpdateVariable = useCallback((index: number, updatedVariable: VariableFormData) => {
    setVariables(prev => prev.map((v, i) => i === index ? updatedVariable : v));
  }, []);

  const handleDeleteVariable = useCallback((index: number) => {
    setVariables(prev => prev.filter((_, i) => i !== index));
    setSelectedVariableIndex(null);
  }, []);

  const handleImportYaml = useCallback((yamlContent: string) => {
    const parsed = parseYaml(yamlContent);
    if (parsed) {
      setName(parsed.name);
      setTitle(parsed.title);
      setSteps(parsed.steps);
      setVariables(parsed.variables);
      setActiveTab('steps');
      setError(null);
    } else {
      setError('Failed to parse YAML. Please check the format.');
    }
  }, []);

  const handleSave = async () => {
    setError(null);

    if (validationErrors.length > 0) {
      setError(validationErrors.join(', '));
      return;
    }

    try {
      const stepsData = steps.map(formDataToStep);
      const variablesData = variables.map(formDataToVariable);

      if (isEditing && playbookId) {
        const result = await updatePlaybook.mutateAsync({
          playbookId,
          title,
          steps: stepsData,
          variables: variablesData,
        });
        onSuccess?.(result.playbook);
      } else {
        const result = await createPlaybook.mutateAsync({
          name,
          title,
          steps: stepsData,
          variables: variablesData,
        });
        onSuccess?.(result.playbook);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save playbook');
    }
  };

  if (!isOpen) return null;

  const isPending = createPlaybook.isPending || updatePlaybook.isPending;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50 animate-fade-in"
        onClick={onClose}
        data-testid="workflow-editor-backdrop"
      />

      {/* Dialog */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none overflow-y-auto">
        <div
          className="
            w-full max-w-4xl max-h-[90vh]
            bg-[var(--color-bg)]
            rounded-xl shadow-2xl
            border border-[var(--color-border)]
            animate-scale-in
            pointer-events-auto
            flex flex-col
          "
          data-testid="workflow-editor-dialog"
          role="dialog"
          aria-labelledby="workflow-editor-title"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)] flex-shrink-0">
            <div className="flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-[var(--color-primary)]" />
              <h2
                id="workflow-editor-title"
                className="text-lg font-semibold text-[var(--color-text)]"
              >
                {isEditing ? 'Edit Playbook' : 'Create Playbook'}
              </h2>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-[var(--color-text-tertiary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] transition-colors"
              aria-label="Close dialog"
              data-testid="workflow-editor-close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Loading state */}
          {isLoadingPlaybook && isEditing && (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-8 h-8 text-[var(--color-primary)] animate-spin" />
            </div>
          )}

          {/* Error state */}
          {(error || playbookError) && (
            <div className="mx-4 mt-4 flex items-center gap-2 px-3 py-2 text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error || playbookError?.message || 'An error occurred'}
            </div>
          )}

          {/* Content */}
          {(!isLoadingPlaybook || !isEditing) && (
            <div className="flex-1 overflow-hidden flex flex-col">
              {/* Playbook Name & Title */}
              <div className="px-4 pt-4 pb-3 border-b border-[var(--color-border)] space-y-3 flex-shrink-0">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-[var(--color-text-secondary)]">
                      Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))}
                      placeholder="my_playbook"
                      disabled={isEditing}
                      className="w-full px-3 py-2 text-sm bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30 font-mono disabled:opacity-50"
                      data-testid="playbook-name-input"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-[var(--color-text-secondary)]">
                      Title <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="My Playbook"
                      className="w-full px-3 py-2 text-sm bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30"
                      data-testid="playbook-title-input"
                    />
                  </div>
                </div>
              </div>

              {/* Tabs */}
              <div className="px-4 border-b border-[var(--color-border)] flex-shrink-0">
                <nav className="flex gap-4" aria-label="Editor tabs">
                  <button
                    onClick={() => setActiveTab('steps')}
                    className={`
                      flex items-center gap-1.5 pb-3 px-1 text-sm font-medium border-b-2 transition-colors
                      ${activeTab === 'steps'
                        ? 'text-[var(--color-primary)] border-[var(--color-primary)]'
                        : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text)] border-transparent'
                      }
                    `}
                    data-testid="tab-steps"
                  >
                    <List className="w-4 h-4" />
                    Steps
                    <span className="px-1.5 py-0.5 text-xs rounded-full bg-[var(--color-surface)]">
                      {steps.length}
                    </span>
                  </button>
                  <button
                    onClick={() => setActiveTab('variables')}
                    className={`
                      flex items-center gap-1.5 pb-3 px-1 text-sm font-medium border-b-2 transition-colors
                      ${activeTab === 'variables'
                        ? 'text-[var(--color-primary)] border-[var(--color-primary)]'
                        : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text)] border-transparent'
                      }
                    `}
                    data-testid="tab-variables"
                  >
                    <Variable className="w-4 h-4" />
                    Variables
                    <span className="px-1.5 py-0.5 text-xs rounded-full bg-[var(--color-surface)]">
                      {variables.length}
                    </span>
                  </button>
                  <button
                    onClick={() => setActiveTab('yaml')}
                    className={`
                      flex items-center gap-1.5 pb-3 px-1 text-sm font-medium border-b-2 transition-colors
                      ${activeTab === 'yaml'
                        ? 'text-[var(--color-primary)] border-[var(--color-primary)]'
                        : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text)] border-transparent'
                      }
                    `}
                    data-testid="tab-yaml"
                  >
                    <Code className="w-4 h-4" />
                    YAML
                  </button>
                </nav>
              </div>

              {/* Tab Content */}
              <div className="flex-1 overflow-auto p-4">
                {/* Steps Tab */}
                {activeTab === 'steps' && (
                  <div className="grid grid-cols-2 gap-4 h-full">
                    {/* Step List */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-medium text-[var(--color-text)]">
                          Steps
                        </h3>
                        <button
                          onClick={handleAddStep}
                          className="flex items-center gap-1 px-2 py-1 text-sm text-[var(--color-primary)] hover:bg-[var(--color-primary-muted)] rounded"
                          data-testid="add-step-button"
                        >
                          <Plus className="w-4 h-4" />
                          Add Step
                        </button>
                      </div>
                      <div className="space-y-2 max-h-[400px] overflow-auto" data-testid="step-list">
                        {steps.length === 0 ? (
                          <div className="text-center py-8 text-sm text-[var(--color-text-tertiary)]">
                            <List className="w-8 h-8 mx-auto mb-2 opacity-50" />
                            No steps yet. Click "Add Step" to begin.
                          </div>
                        ) : (
                          steps.map((step, index) => (
                            <StepListItem
                              key={step.id || index}
                              step={step}
                              index={index}
                              isSelected={selectedStepIndex === index}
                              onSelect={() => setSelectedStepIndex(index)}
                              onMoveUp={() => handleMoveStep(index, 'up')}
                              onMoveDown={() => handleMoveStep(index, 'down')}
                              onDelete={() => handleDeleteStep(index)}
                              isFirst={index === 0}
                              isLast={index === steps.length - 1}
                            />
                          ))
                        )}
                      </div>
                    </div>

                    {/* Step Form */}
                    <div className="border-l border-[var(--color-border)] pl-4">
                      {selectedStepIndex !== null && steps[selectedStepIndex] ? (
                        <StepForm
                          step={steps[selectedStepIndex]}
                          onChange={(updated) => handleUpdateStep(selectedStepIndex, updated)}
                          allStepIds={allStepIds}
                          onClose={() => setSelectedStepIndex(null)}
                        />
                      ) : (
                        <div className="flex items-center justify-center h-full text-sm text-[var(--color-text-tertiary)]">
                          <div className="text-center">
                            <Edit3 className="w-8 h-8 mx-auto mb-2 opacity-50" />
                            Select a step to edit
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Variables Tab */}
                {activeTab === 'variables' && (
                  <div className="grid grid-cols-2 gap-4 h-full">
                    {/* Variable List */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-medium text-[var(--color-text)]">
                          Variables
                        </h3>
                        <button
                          onClick={handleAddVariable}
                          className="flex items-center gap-1 px-2 py-1 text-sm text-[var(--color-primary)] hover:bg-[var(--color-primary-muted)] rounded"
                          data-testid="add-variable-button"
                        >
                          <Plus className="w-4 h-4" />
                          Add Variable
                        </button>
                      </div>
                      <div className="space-y-2 max-h-[400px] overflow-auto" data-testid="variable-list">
                        {variables.length === 0 ? (
                          <div className="text-center py-8 text-sm text-[var(--color-text-tertiary)]">
                            <Variable className="w-8 h-8 mx-auto mb-2 opacity-50" />
                            No variables yet. Click "Add Variable" to begin.
                          </div>
                        ) : (
                          variables.map((variable, index) => (
                            <VariableListItem
                              key={variable.name || index}
                              variable={variable}
                              isSelected={selectedVariableIndex === index}
                              onSelect={() => setSelectedVariableIndex(index)}
                              onDelete={() => handleDeleteVariable(index)}
                            />
                          ))
                        )}
                      </div>
                    </div>

                    {/* Variable Form */}
                    <div className="border-l border-[var(--color-border)] pl-4">
                      {selectedVariableIndex !== null && variables[selectedVariableIndex] ? (
                        <VariableForm
                          variable={variables[selectedVariableIndex]}
                          onChange={(updated) => handleUpdateVariable(selectedVariableIndex, updated)}
                          onClose={() => setSelectedVariableIndex(null)}
                        />
                      ) : (
                        <div className="flex items-center justify-center h-full text-sm text-[var(--color-text-tertiary)]">
                          <div className="text-center">
                            <Edit3 className="w-8 h-8 mx-auto mb-2 opacity-50" />
                            Select a variable to edit
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* YAML Tab */}
                {activeTab === 'yaml' && (
                  <YamlPreview yaml={yamlPreview} onImport={handleImportYaml} />
                )}
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--color-border)] flex-shrink-0">
            <div className="text-xs text-[var(--color-text-tertiary)]">
              {steps.length} step{steps.length !== 1 ? 's' : ''}, {variables.length} variable{variables.length !== 1 ? 's' : ''}
              {validationErrors.length > 0 && (
                <span className="ml-2 text-red-500">
                  ({validationErrors.length} validation error{validationErrors.length !== 1 ? 's' : ''})
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] rounded-lg transition-colors"
                data-testid="cancel-button"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={!canSave}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
                data-testid="save-button"
              >
                {isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    {isEditing ? 'Save Changes' : 'Create Playbook'}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

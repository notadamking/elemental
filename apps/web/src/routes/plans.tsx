/**
 * Plans Page - Plan management with progress visualization (TB24, TB47, TB87, TB88, TB121)
 *
 * Features:
 * - List all plans with status badges
 * - Progress bars showing completion percentage
 * - Plan detail panel with task breakdown
 * - Filter by status
 * - Edit plan title and status (TB47)
 * - Add/remove tasks from plan (TB47)
 * - Status transition buttons (TB47)
 * - Search plans by title (TB87)
 * - Roadmap view showing plans as horizontal bars on timeline (TB88)
 * - Plans must have at least one task (TB121)
 */

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useDebounce, useIsMobile, useGlobalQuickActions, useShortcutVersion } from '../hooks';
import { getCurrentBinding } from '../lib/keyboard';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearch, useNavigate } from '@tanstack/react-router';
import { ElementNotFound } from '../components/shared/ElementNotFound';
import { ProgressRing, ProgressRingWithBreakdown } from '../components/shared/ProgressRing';
import { PageHeader } from '../components/shared';
import { MobileDetailSheet } from '../components/shared/MobileDetailSheet';
import { MobilePlanCard } from '../components/plan/MobilePlanCard';
import { useAllPlans } from '../api/hooks/useAllElements';
import { useDeepLink } from '../hooks/useDeepLink';
import { toast } from 'sonner';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import {
  ClipboardList,
  Clock,
  CheckCircle2,
  XCircle,
  FileEdit,
  ChevronRight,
  X,
  ListTodo,
  CircleDot,
  AlertCircle,
  User,
  Pencil,
  Check,
  Plus,
  Trash2,
  Play,
  Ban,
  Search,
  List,
  GanttChart,
} from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

interface PlanType {
  id: string;
  type: 'plan';
  title: string;
  status: 'draft' | 'active' | 'completed' | 'cancelled';
  descriptionRef?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  tags: string[];
  completedAt?: string;
  cancelledAt?: string;
  cancelReason?: string;
}

interface PlanProgress {
  totalTasks: number;
  completedTasks: number;
  inProgressTasks: number;
  blockedTasks: number;
  remainingTasks: number;
  completionPercentage: number;
}

interface HydratedPlan extends PlanType {
  _progress?: PlanProgress;
}

interface TaskType {
  id: string;
  type: 'task';
  title: string;
  status: string;
  priority: number;
  assignee?: string;
  createdAt: string;
  updatedAt: string;
  tags: string[];
}

// ============================================================================
// Status Configuration
// ============================================================================

// ============================================================================
// Search Configuration (TB87)
// ============================================================================

const SEARCH_STORAGE_KEY = 'plans.search';
const SEARCH_DEBOUNCE_DELAY = 300;

function getStoredSearch(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(SEARCH_STORAGE_KEY) || '';
}

function setStoredSearch(search: string) {
  if (typeof window === 'undefined') return;
  if (search) {
    localStorage.setItem(SEARCH_STORAGE_KEY, search);
  } else {
    localStorage.removeItem(SEARCH_STORAGE_KEY);
  }
}

/**
 * Fuzzy search function that matches query characters in sequence within the title.
 * Returns match info for highlighting if matched, null otherwise.
 */
function fuzzySearch(title: string, query: string): { matched: boolean; indices: number[] } | null {
  if (!query) return { matched: true, indices: [] };

  const lowerTitle = title.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const indices: number[] = [];
  let queryIdx = 0;

  for (let i = 0; i < lowerTitle.length && queryIdx < lowerQuery.length; i++) {
    if (lowerTitle[i] === lowerQuery[queryIdx]) {
      indices.push(i);
      queryIdx++;
    }
  }

  // All query characters must be found in sequence
  if (queryIdx === lowerQuery.length) {
    return { matched: true, indices };
  }

  return null;
}

/**
 * Highlights matched characters in a title based on match indices.
 */
function highlightMatches(title: string, indices: number[]): React.ReactNode {
  if (indices.length === 0) {
    return <>{title}</>;
  }

  const result: React.ReactNode[] = [];
  const indexSet = new Set(indices);
  let lastIndex = 0;

  for (let i = 0; i < title.length; i++) {
    if (indexSet.has(i)) {
      // Add text before this match
      if (i > lastIndex) {
        result.push(<span key={`text-${lastIndex}`}>{title.slice(lastIndex, i)}</span>);
      }
      // Add highlighted character
      result.push(
        <mark key={`match-${i}`} className="bg-yellow-200 dark:bg-yellow-700/50 text-gray-900 dark:text-yellow-100 rounded-sm px-0.5">
          {title[i]}
        </mark>
      );
      lastIndex = i + 1;
    }
  }

  // Add remaining text
  if (lastIndex < title.length) {
    result.push(<span key={`text-${lastIndex}`}>{title.slice(lastIndex)}</span>);
  }

  return <>{result}</>;
}

// ============================================================================
// Status Configuration
// ============================================================================

const STATUS_CONFIG: Record<
  string,
  { label: string; icon: React.ReactNode; color: string; bgColor: string }
> = {
  draft: {
    label: 'Draft',
    icon: <FileEdit className="w-4 h-4" />,
    color: 'text-gray-600',
    bgColor: 'bg-gray-100',
  },
  active: {
    label: 'Active',
    icon: <CircleDot className="w-4 h-4" />,
    color: 'text-blue-700',
    bgColor: 'bg-blue-100',
  },
  completed: {
    label: 'Completed',
    icon: <CheckCircle2 className="w-4 h-4" />,
    color: 'text-green-700',
    bgColor: 'bg-green-100',
  },
  cancelled: {
    label: 'Cancelled',
    icon: <XCircle className="w-4 h-4" />,
    color: 'text-red-700',
    bgColor: 'bg-red-100',
  },
};

// ============================================================================
// View Mode Configuration (TB88)
// ============================================================================

type ViewMode = 'list' | 'roadmap';

const VIEW_MODE_STORAGE_KEY = 'plans.viewMode';

function getStoredViewMode(): ViewMode {
  if (typeof window === 'undefined') return 'list';
  const stored = localStorage.getItem(VIEW_MODE_STORAGE_KEY);
  return stored === 'roadmap' ? 'roadmap' : 'list';
}

function setStoredViewMode(mode: ViewMode) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode);
}

// Status colors for roadmap bars
const STATUS_BAR_COLORS: Record<string, string> = {
  draft: '#9ca3af',    // gray-400
  active: '#3b82f6',   // blue-500
  completed: '#22c55e', // green-500
  cancelled: '#ef4444', // red-500
};

// ============================================================================
// API Hooks
// ============================================================================

function usePlans(status?: string) {
  return useQuery<HydratedPlan[]>({
    queryKey: ['plans', status, 'with-progress'],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('hydrate.progress', 'true');
      if (status) {
        params.set('status', status);
      }
      const response = await fetch(`/api/plans?${params.toString()}`);
      if (!response.ok) {
        throw new Error('Failed to fetch plans');
      }
      return response.json();
    },
  });
}

function usePlan(planId: string | null) {
  return useQuery<HydratedPlan>({
    queryKey: ['plans', planId],
    queryFn: async () => {
      if (!planId) throw new Error('No plan selected');
      const response = await fetch(`/api/plans/${planId}?hydrate.progress=true`);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to fetch plan');
      }
      return response.json();
    },
    enabled: !!planId,
  });
}

function usePlanTasks(planId: string | null) {
  return useQuery<TaskType[]>({
    queryKey: ['plans', planId, 'tasks'],
    queryFn: async () => {
      if (!planId) throw new Error('No plan selected');
      const response = await fetch(`/api/plans/${planId}/tasks`);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to fetch plan tasks');
      }
      return response.json();
    },
    enabled: !!planId,
  });
}

function usePlanProgress(planId: string | null) {
  return useQuery<PlanProgress>({
    queryKey: ['plans', planId, 'progress'],
    queryFn: async () => {
      if (!planId) throw new Error('No plan selected');
      const response = await fetch(`/api/plans/${planId}/progress`);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to fetch plan progress');
      }
      return response.json();
    },
    enabled: !!planId,
  });
}

function useUpdatePlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ planId, updates }: { planId: string; updates: Partial<PlanType> }) => {
      const response = await fetch(`/api/plans/${planId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to update plan');
      }
      return response.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['plans'] });
      queryClient.invalidateQueries({ queryKey: ['plans', variables.planId] });
    },
  });
}

function useAddTaskToPlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ planId, taskId }: { planId: string; taskId: string }) => {
      const response = await fetch(`/api/plans/${planId}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to add task to plan');
      }
      return response.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['plans', variables.planId, 'tasks'] });
      queryClient.invalidateQueries({ queryKey: ['plans', variables.planId, 'progress'] });
      queryClient.invalidateQueries({ queryKey: ['plans', variables.planId] });
    },
  });
}

function useRemoveTaskFromPlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ planId, taskId }: { planId: string; taskId: string }) => {
      const response = await fetch(`/api/plans/${planId}/tasks/${taskId}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to remove task from plan');
      }
      return response.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['plans', variables.planId, 'tasks'] });
      queryClient.invalidateQueries({ queryKey: ['plans', variables.planId, 'progress'] });
      queryClient.invalidateQueries({ queryKey: ['plans', variables.planId] });
    },
  });
}

function useAvailableTasks(planId: string | null, searchQuery: string) {
  return useQuery<TaskType[]>({
    queryKey: ['tasks', 'available', planId, searchQuery],
    queryFn: async () => {
      if (!planId) return [];

      // Get all tasks not in this plan
      const tasksResponse = await fetch('/api/tasks');
      if (!tasksResponse.ok) {
        throw new Error('Failed to fetch tasks');
      }
      const allTasks = await tasksResponse.json() as TaskType[];

      // Get tasks already in the plan
      const planTasksResponse = await fetch(`/api/plans/${planId}/tasks`);
      if (!planTasksResponse.ok) {
        throw new Error('Failed to fetch plan tasks');
      }
      const planTasks = await planTasksResponse.json() as TaskType[];
      const planTaskIds = new Set(planTasks.map(t => t.id));

      // Filter to only tasks not in plan
      let available = allTasks.filter(t => !planTaskIds.has(t.id));

      // Filter by search query
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        available = available.filter(t =>
          t.title.toLowerCase().includes(query) ||
          t.id.toLowerCase().includes(query)
        );
      }

      return available.slice(0, 50); // Limit results
    },
    enabled: !!planId,
  });
}

// ============================================================================
// Helper Functions
// ============================================================================

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(dateString);
}

// ============================================================================
// Components
// ============================================================================

/**
 * Status Badge component
 */
function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.draft;

  return (
    <span
      data-testid={`status-badge-${status}`}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${config.bgColor} ${config.color}`}
    >
      {config.icon}
      {config.label}
    </span>
  );
}

/**
 * Plan List Item component with mini progress ring (TB86) and search highlighting (TB87)
 */
function PlanListItem({
  plan,
  isSelected,
  onClick,
  searchMatchIndices,
}: {
  plan: HydratedPlan;
  isSelected: boolean;
  onClick: (id: string) => void;
  searchMatchIndices?: number[];
}) {
  const progress = plan._progress;
  const hasProgress = progress && progress.totalTasks > 0;

  // Render title with optional search highlighting (TB87)
  const titleContent = searchMatchIndices && searchMatchIndices.length > 0
    ? highlightMatches(plan.title, searchMatchIndices)
    : plan.title;

  return (
    <div
      data-testid={`plan-item-${plan.id}`}
      className={`p-4 rounded-lg border cursor-pointer transition-colors ${
        isSelected
          ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-700'
          : 'bg-white dark:bg-[var(--color-surface)] border-gray-200 dark:border-[var(--color-border)] hover:border-gray-300 dark:hover:border-[var(--color-border-hover)] hover:bg-gray-50 dark:hover:bg-[var(--color-surface-hover)]'
      }`}
      onClick={() => onClick(plan.id)}
    >
      <div className="flex items-start justify-between gap-3">
        {/* Left side: Title and metadata */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between mb-2">
            <h3
              data-testid="plan-item-title"
              className="font-medium text-gray-900 dark:text-[var(--color-text)] truncate flex-1"
            >
              {titleContent}
            </h3>
          </div>

          <div className="flex items-center gap-2 mb-2">
            <StatusBadge status={plan.status} />
            <span className="text-xs text-gray-500 dark:text-[var(--color-text-tertiary)]" title={formatDate(plan.updatedAt)}>
              Updated {formatRelativeTime(plan.updatedAt)}
            </span>
          </div>

          {plan.tags && plan.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {plan.tags.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className="px-1.5 py-0.5 text-xs bg-gray-100 dark:bg-[var(--color-surface-hover)] text-gray-600 dark:text-[var(--color-text-secondary)] rounded"
                >
                  {tag}
                </span>
              ))}
              {plan.tags.length > 3 && (
                <span className="text-xs text-gray-400 dark:text-[var(--color-text-tertiary)]">+{plan.tags.length - 3}</span>
              )}
            </div>
          )}
        </div>

        {/* Right side: Progress ring (mini, 32px) */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {hasProgress ? (
            <ProgressRing
              percentage={progress.completionPercentage}
              size="mini"
              testId={`plan-progress-${plan.id}`}
            />
          ) : (
            <div
              className="w-8 h-8 rounded-full border-2 border-dashed border-gray-200 dark:border-gray-600 flex items-center justify-center"
              title="No tasks in plan"
              data-testid={`plan-progress-empty-${plan.id}`}
            >
              <span className="text-[8px] text-gray-400 dark:text-gray-500">--</span>
            </div>
          )}
          <ChevronRight className="w-4 h-4 text-gray-400 dark:text-gray-500" />
        </div>
      </div>
    </div>
  );
}

/**
 * Plan Search Bar component (TB87)
 */
function PlanSearchBar({
  value,
  onChange,
  onClear,
}: {
  value: string;
  onChange: (value: string) => void;
  onClear: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  // Handle Escape key to clear search and / to focus
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Clear search on Escape when input is focused
      if (e.key === 'Escape' && document.activeElement === inputRef.current) {
        e.preventDefault();
        onClear();
        inputRef.current?.blur();
      }
      // Focus search on / when not in an input/textarea
      if (
        e.key === '/' &&
        !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)
      ) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClear]);

  return (
    <div className="relative flex-1 max-w-md" data-testid="plan-search-container">
      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
        <Search className="w-4 h-4 text-gray-400" />
      </div>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search plans... (Press / to focus)"
        className="w-full pl-9 pr-8 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
        data-testid="plan-search-input"
      />
      {value && (
        <button
          onClick={onClear}
          className="absolute inset-y-0 right-0 pr-2 flex items-center text-gray-400 hover:text-gray-600"
          data-testid="plan-search-clear"
          aria-label="Clear search (Escape)"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

/**
 * Status Filter Tabs
 */
function StatusFilter({
  selectedStatus,
  onStatusChange,
}: {
  selectedStatus: string | null;
  onStatusChange: (status: string | null) => void;
}) {
  const statuses = [
    { value: null, label: 'All' },
    { value: 'active', label: 'Active' },
    { value: 'draft', label: 'Draft' },
    { value: 'completed', label: 'Completed' },
    { value: 'cancelled', label: 'Cancelled' },
  ];

  return (
    <div data-testid="status-filter" className="flex gap-1 p-1 bg-gray-100 rounded-lg">
      {statuses.map((status) => (
        <button
          key={status.value ?? 'all'}
          data-testid={`status-filter-${status.value ?? 'all'}`}
          onClick={() => onStatusChange(status.value)}
          className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
            selectedStatus === status.value
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          {status.label}
        </button>
      ))}
    </div>
  );
}

/**
 * View Toggle (List vs Roadmap) - TB88
 */
function ViewToggle({
  view,
  onViewChange,
}: {
  view: ViewMode;
  onViewChange: (view: ViewMode) => void;
}) {
  return (
    <div
      data-testid="view-toggle"
      className="flex p-0.5 bg-gray-100 rounded-lg"
    >
      <button
        data-testid="view-toggle-list"
        onClick={() => onViewChange('list')}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 text-sm font-medium rounded-md transition-colors ${
          view === 'list'
            ? 'bg-white text-gray-900 shadow-sm'
            : 'text-gray-600 hover:text-gray-900'
        }`}
        aria-label="List view"
      >
        <List className="w-4 h-4" />
        List
      </button>
      <button
        data-testid="view-toggle-roadmap"
        onClick={() => onViewChange('roadmap')}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 text-sm font-medium rounded-md transition-colors ${
          view === 'roadmap'
            ? 'bg-white text-gray-900 shadow-sm'
            : 'text-gray-600 hover:text-gray-900'
        }`}
        aria-label="Roadmap view"
      >
        <GanttChart className="w-4 h-4" />
        Roadmap
      </button>
    </div>
  );
}

// ============================================================================
// Roadmap View Component (TB88)
// ============================================================================

interface RoadmapBarData {
  planId: string;
  title: string;
  status: string;
  startDate: Date;
  endDate: Date;
  startOffset: number; // Days from timeline start
  duration: number;    // Days duration
  completionPercentage: number;
}

/**
 * Custom tooltip for roadmap bars
 */
function RoadmapTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: RoadmapBarData }>;
}) {
  if (!active || !payload?.length) return null;

  const data = payload[0].payload;
  const statusConfig = STATUS_CONFIG[data.status] || STATUS_CONFIG.draft;

  return (
    <div
      className="bg-white p-3 rounded-lg shadow-lg border border-gray-200 max-w-xs"
      data-testid="roadmap-tooltip"
    >
      <div className="font-medium text-gray-900 mb-1 truncate">{data.title}</div>
      <div className="flex items-center gap-2 mb-2">
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${statusConfig.bgColor} ${statusConfig.color}`}>
          {statusConfig.icon}
          {statusConfig.label}
        </span>
        <span className="text-xs text-gray-500">{data.completionPercentage}% complete</span>
      </div>
      <div className="text-xs text-gray-500">
        <div>Start: {data.startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
        <div>End: {data.endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
        <div>Duration: {data.duration} days</div>
      </div>
    </div>
  );
}

/**
 * Roadmap View - Shows plans as horizontal bars on a timeline (TB88)
 */
function RoadmapView({
  plans,
  onPlanClick,
  selectedPlanId,
}: {
  plans: HydratedPlan[];
  onPlanClick: (planId: string) => void;
  selectedPlanId: string | null;
}) {
  // Calculate timeline range based on plan dates
  const { timelineStart, timelineEnd, chartData, tickValues, tickFormatter } = useMemo(() => {
    if (plans.length === 0) {
      const now = new Date();
      const start = new Date(now);
      start.setDate(start.getDate() - 7);
      const end = new Date(now);
      end.setDate(end.getDate() + 30);
      return {
        timelineStart: start,
        timelineEnd: end,
        chartData: [],
        tickValues: [],
        tickFormatter: (_dayOffset: number) => '',
      };
    }

    // Find the earliest and latest dates across all plans
    let minDate = new Date();
    let maxDate = new Date();
    let hasValidDates = false;

    plans.forEach((plan) => {
      const created = new Date(plan.createdAt);
      const updated = new Date(plan.updatedAt);
      const completed = plan.completedAt ? new Date(plan.completedAt) : null;
      const cancelled = plan.cancelledAt ? new Date(plan.cancelledAt) : null;

      const startDate = created;
      const endDate = completed || cancelled || updated;

      if (!hasValidDates) {
        minDate = new Date(startDate);
        maxDate = new Date(endDate);
        hasValidDates = true;
      } else {
        if (startDate < minDate) minDate = new Date(startDate);
        if (endDate > maxDate) maxDate = new Date(endDate);
      }
    });

    // Add padding to the timeline (7 days before, 14 days after)
    const start = new Date(minDate);
    start.setDate(start.getDate() - 7);
    const end = new Date(maxDate);
    end.setDate(end.getDate() + 14);

    // Calculate total days for the timeline
    const totalDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

    // Create chart data for each plan
    const data: RoadmapBarData[] = plans.map((plan) => {
      const created = new Date(plan.createdAt);
      const updated = new Date(plan.updatedAt);
      const completed = plan.completedAt ? new Date(plan.completedAt) : null;
      const cancelled = plan.cancelledAt ? new Date(plan.cancelledAt) : null;

      const startDate = created;
      const endDate = completed || cancelled || updated;

      // Calculate offset from timeline start (in days)
      const startOffset = Math.ceil((startDate.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      const duration = Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));

      return {
        planId: plan.id,
        title: plan.title,
        status: plan.status,
        startDate,
        endDate,
        startOffset,
        duration,
        completionPercentage: plan._progress?.completionPercentage ?? 0,
      };
    });

    // Generate tick values (every 7 days)
    const ticks: number[] = [];
    for (let i = 0; i <= totalDays; i += 7) {
      ticks.push(i);
    }

    // Tick formatter
    const formatter = (dayOffset: number): string => {
      const date = new Date(start);
      date.setDate(date.getDate() + dayOffset);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };

    return {
      timelineStart: start,
      timelineEnd: end,
      chartData: data,
      tickValues: ticks,
      tickFormatter: formatter,
    };
  }, [plans]);

  const totalDays = Math.ceil((timelineEnd.getTime() - timelineStart.getTime()) / (1000 * 60 * 60 * 24));

  if (plans.length === 0) {
    return (
      <div
        data-testid="roadmap-empty"
        className="flex flex-col items-center justify-center h-full py-12 text-center"
      >
        <GanttChart className="w-12 h-12 text-gray-300 mb-3" />
        <p className="text-gray-500">No plans to display in roadmap</p>
        <p className="text-sm text-gray-400 mt-1">Create plans to see them on the timeline</p>
      </div>
    );
  }

  // Row height for each plan bar
  const rowHeight = 48;
  const chartHeight = Math.max(200, chartData.length * rowHeight + 60); // Extra space for axis

  return (
    <div
      data-testid="roadmap-view"
      className="h-full flex flex-col bg-white rounded-lg border border-gray-200 overflow-hidden"
    >
      {/* Timeline Header */}
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-600">
            {timelineStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} —{' '}
            {timelineEnd.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </div>
          <div className="text-xs text-gray-500">
            {plans.length} plan{plans.length !== 1 ? 's' : ''}
          </div>
        </div>
      </div>

      {/* Chart Container */}
      <div className="flex-1 overflow-auto p-4" data-testid="roadmap-chart-container">
        <div style={{ height: chartHeight, minWidth: Math.max(600, totalDays * 8) }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              layout="vertical"
              barCategoryGap={8}
              margin={{ top: 20, right: 30, left: 200, bottom: 20 }}
            >
              {/* X-axis: Time (days) */}
              <XAxis
                type="number"
                dataKey="startOffset"
                domain={[0, totalDays]}
                ticks={tickValues}
                tickFormatter={tickFormatter}
                axisLine={{ stroke: '#e5e7eb' }}
                tickLine={{ stroke: '#e5e7eb' }}
                tick={{ fontSize: 11, fill: '#6b7280' }}
              />

              {/* Y-axis: Plan titles */}
              <YAxis
                type="category"
                dataKey="title"
                width={190}
                axisLine={{ stroke: '#e5e7eb' }}
                tickLine={false}
                tick={({ x, y, payload }) => (
                  <g transform={`translate(${x},${y})`}>
                    <text
                      x={-5}
                      y={0}
                      dy={4}
                      textAnchor="end"
                      fill="#374151"
                      fontSize={12}
                      fontWeight={500}
                      style={{ cursor: 'pointer' }}
                    >
                      {(payload.value as string).length > 25
                        ? (payload.value as string).slice(0, 22) + '...'
                        : payload.value}
                    </text>
                  </g>
                )}
              />

              <Tooltip
                content={<RoadmapTooltip />}
                cursor={{ fill: 'rgba(59, 130, 246, 0.05)' }}
              />

              {/* Custom bar that accounts for offset */}
              <Bar
                dataKey="duration"
                radius={[4, 4, 4, 4]}
                style={{ cursor: 'pointer' }}
                onClick={(data) => {
                  // Access the original data from the payload
                  const barData = data as unknown as RoadmapBarData;
                  if (barData?.planId) {
                    onPlanClick(barData.planId);
                  }
                }}
              >
                {chartData.map((entry) => (
                  <Cell
                    key={entry.planId}
                    fill={STATUS_BAR_COLORS[entry.status] || STATUS_BAR_COLORS.draft}
                    stroke={selectedPlanId === entry.planId ? '#1d4ed8' : 'transparent'}
                    strokeWidth={selectedPlanId === entry.planId ? 2 : 0}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Legend */}
      <div className="px-4 py-3 border-t border-gray-200 bg-gray-50">
        <div className="flex items-center justify-center gap-6" data-testid="roadmap-legend">
          {Object.entries(STATUS_CONFIG).map(([status, config]) => (
            <div key={status} className="flex items-center gap-1.5 text-xs">
              <span
                className="w-3 h-3 rounded"
                style={{ backgroundColor: STATUS_BAR_COLORS[status] }}
              />
              <span className="text-gray-600">{config.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Task Status Summary
 */
function TaskStatusSummary({ progress }: { progress: PlanProgress }) {
  const items = [
    {
      label: 'Completed',
      count: progress.completedTasks,
      icon: <CheckCircle2 className="w-4 h-4 text-green-500" />,
    },
    {
      label: 'In Progress',
      count: progress.inProgressTasks,
      icon: <CircleDot className="w-4 h-4 text-blue-500" />,
    },
    {
      label: 'Blocked',
      count: progress.blockedTasks,
      icon: <AlertCircle className="w-4 h-4 text-red-500" />,
    },
    {
      label: 'Remaining',
      count: progress.remainingTasks,
      icon: <ListTodo className="w-4 h-4 text-gray-400" />,
    },
  ];

  return (
    <div data-testid="task-status-summary" className="grid grid-cols-2 gap-3">
      {items.map((item) => (
        <div
          key={item.label}
          className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg"
        >
          {item.icon}
          <div>
            <div className="text-lg font-semibold text-gray-900">{item.count}</div>
            <div className="text-xs text-gray-500">{item.label}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Plan Task List with optional edit mode (TB121: disable removing last task)
 */
function PlanTaskList({
  tasks,
  isEditMode = false,
  onRemoveTask,
  removingTaskId,
}: {
  tasks: TaskType[];
  isEditMode?: boolean;
  onRemoveTask?: (taskId: string) => void;
  removingTaskId?: string | null;
}) {
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);

  if (tasks.length === 0) {
    return (
      <div
        data-testid="plan-tasks-empty"
        className="text-center py-8 text-gray-500 text-sm"
      >
        No tasks in this plan
      </div>
    );
  }

  // TB121: Check if this is the last task
  const isLastTask = tasks.length === 1;

  const priorityColors: Record<number, string> = {
    1: 'bg-gray-200',
    2: 'bg-blue-200',
    3: 'bg-yellow-200',
    4: 'bg-orange-200',
    5: 'bg-red-200',
  };

  const handleRemoveClick = (taskId: string) => {
    // TB121: Prevent removing the last task
    if (isLastTask) {
      toast.error('Cannot remove the last task. Plans must have at least one task.');
      return;
    }

    if (confirmRemoveId === taskId) {
      // Second click - confirm removal
      onRemoveTask?.(taskId);
      setConfirmRemoveId(null);
    } else {
      // First click - show confirmation
      setConfirmRemoveId(taskId);
    }
  };

  return (
    <div data-testid="plan-tasks-list" className="space-y-2">
      {/* TB121: Show warning when only one task */}
      {isLastTask && isEditMode && (
        <div
          data-testid="last-task-warning"
          className="flex items-center gap-2 p-2 mb-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700"
        >
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>This is the only task. Plans must have at least one task.</span>
        </div>
      )}
      {tasks.map((task) => (
        <div
          key={task.id}
          data-testid={`plan-task-${task.id}`}
          className={`flex items-center gap-3 p-2 bg-gray-50 rounded-lg group ${
            confirmRemoveId === task.id ? 'bg-red-50 border border-red-200' : ''
          }`}
        >
          <div
            className={`w-2 h-2 rounded-full ${priorityColors[task.priority] || 'bg-gray-200'}`}
            title={`Priority ${task.priority}`}
          />
          <a
            href={`/tasks?selected=${task.id}`}
            className="flex-1 text-sm text-gray-900 truncate hover:text-blue-600 hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {task.title}
          </a>
          <span
            className={`text-xs px-2 py-0.5 rounded ${
              task.status === 'closed'
                ? 'bg-green-100 text-green-700'
                : task.status === 'blocked'
                  ? 'bg-red-100 text-red-700'
                  : task.status === 'in_progress'
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-gray-100 text-gray-700'
            }`}
          >
            {task.status.replace('_', ' ')}
          </span>
          {isEditMode && onRemoveTask && (
            <button
              data-testid={`remove-task-${task.id}`}
              onClick={() => handleRemoveClick(task.id)}
              disabled={removingTaskId === task.id || isLastTask}
              className={`p-1 rounded transition-colors ${
                isLastTask
                  ? 'text-gray-300 cursor-not-allowed opacity-50'
                  : confirmRemoveId === task.id
                    ? 'bg-red-500 text-white hover:bg-red-600'
                    : 'text-gray-400 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100'
              } ${removingTaskId === task.id ? 'opacity-50 cursor-not-allowed' : ''}`}
              title={
                isLastTask
                  ? 'Cannot remove - plans must have at least one task'
                  : confirmRemoveId === task.id
                    ? 'Click again to confirm removal'
                    : 'Remove from plan'
              }
            >
              {removingTaskId === task.id ? (
                <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * Task Picker Modal for adding tasks to plan
 */
function TaskPickerModal({
  planId,
  onClose,
  onAddTask,
  isAdding,
}: {
  planId: string;
  onClose: () => void;
  onAddTask: (taskId: string) => void;
  isAdding: boolean;
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  // Debounce search query
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchQuery]);

  const { data: availableTasks = [], isLoading } = useAvailableTasks(planId, debouncedQuery);

  const priorityColors: Record<number, string> = {
    1: 'bg-gray-200',
    2: 'bg-blue-200',
    3: 'bg-yellow-200',
    4: 'bg-orange-200',
    5: 'bg-red-200',
  };

  return (
    <div
      data-testid="task-picker-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Add Task to Plan</h3>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
            data-testid="task-picker-close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search */}
        <div className="p-4 border-b border-gray-200">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              data-testid="task-picker-search"
              placeholder="Search tasks by title or ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              autoFocus
            />
          </div>
        </div>

        {/* Task List */}
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="text-center py-8 text-gray-500">Loading tasks...</div>
          ) : availableTasks.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              {searchQuery ? 'No matching tasks found' : 'All tasks are already in this plan'}
            </div>
          ) : (
            <div className="space-y-2">
              {availableTasks.map((task) => (
                <button
                  key={task.id}
                  data-testid={`task-picker-item-${task.id}`}
                  onClick={() => onAddTask(task.id)}
                  disabled={isAdding}
                  className="w-full flex items-center gap-3 p-3 bg-gray-50 hover:bg-blue-50 rounded-lg text-left transition-colors disabled:opacity-50"
                >
                  <div
                    className={`w-2 h-2 rounded-full ${priorityColors[task.priority] || 'bg-gray-200'}`}
                    title={`Priority ${task.priority}`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">{task.title}</div>
                    <div className="text-xs text-gray-500 font-mono">{task.id}</div>
                  </div>
                  <span
                    className={`text-xs px-2 py-0.5 rounded flex-shrink-0 ${
                      task.status === 'closed'
                        ? 'bg-green-100 text-green-700'
                        : task.status === 'blocked'
                          ? 'bg-red-100 text-red-700'
                          : task.status === 'in_progress'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    {task.status.replace('_', ' ')}
                  </span>
                  <Plus className="w-4 h-4 text-blue-500 flex-shrink-0" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Plan Detail Panel with edit functionality (TB47)
 */
function PlanDetailPanel({
  planId,
  onClose,
}: {
  planId: string;
  onClose: () => void;
}) {
  const { data: plan, isLoading, isError, error } = usePlan(planId);
  const { data: tasks = [] } = usePlanTasks(planId);
  const { data: progress } = usePlanProgress(planId);

  // Edit mode state
  const [isEditMode, setIsEditMode] = useState(false);
  const [editedTitle, setEditedTitle] = useState('');
  const [showTaskPicker, setShowTaskPicker] = useState(false);
  const [removingTaskId, setRemovingTaskId] = useState<string | null>(null);

  // Mutations
  const updatePlan = useUpdatePlan();
  const addTaskToPlan = useAddTaskToPlan();
  const removeTaskFromPlan = useRemoveTaskFromPlan();

  // Initialize edited title when plan loads
  useEffect(() => {
    if (plan) {
      setEditedTitle(plan.title);
    }
  }, [plan]);

  // Exit edit mode when plan changes
  useEffect(() => {
    setIsEditMode(false);
    setShowTaskPicker(false);
    setRemovingTaskId(null);
  }, [planId]);

  const handleSaveTitle = useCallback(async () => {
    if (!plan || editedTitle.trim() === plan.title) {
      setIsEditMode(false);
      return;
    }
    try {
      await updatePlan.mutateAsync({ planId, updates: { title: editedTitle.trim() } });
      setIsEditMode(false);
    } catch (err) {
      // Error handling - keep in edit mode
      console.error('Failed to update title:', err);
    }
  }, [plan, editedTitle, planId, updatePlan]);

  const handleCancelEdit = useCallback(() => {
    if (plan) {
      setEditedTitle(plan.title);
    }
    setIsEditMode(false);
  }, [plan]);

  const handleStatusChange = useCallback(async (newStatus: string) => {
    if (!plan || newStatus === plan.status) return;
    try {
      await updatePlan.mutateAsync({ planId, updates: { status: newStatus as 'draft' | 'active' | 'completed' | 'cancelled' } });
    } catch (err) {
      console.error('Failed to update status:', err);
    }
  }, [plan, planId, updatePlan]);

  const handleAddTask = useCallback(async (taskId: string) => {
    try {
      await addTaskToPlan.mutateAsync({ planId, taskId });
      setShowTaskPicker(false);
    } catch (err) {
      console.error('Failed to add task:', err);
    }
  }, [planId, addTaskToPlan]);

  const handleRemoveTask = useCallback(async (taskId: string) => {
    setRemovingTaskId(taskId);
    try {
      await removeTaskFromPlan.mutateAsync({ planId, taskId });
    } catch (err) {
      console.error('Failed to remove task:', err);
    } finally {
      setRemovingTaskId(null);
    }
  }, [planId, removeTaskFromPlan]);

  if (isLoading) {
    return (
      <div
        data-testid="plan-detail-loading"
        className="h-full flex items-center justify-center bg-white"
      >
        <div className="text-gray-500">Loading plan...</div>
      </div>
    );
  }

  if (isError) {
    return (
      <div
        data-testid="plan-detail-error"
        className="h-full flex flex-col items-center justify-center bg-white"
      >
        <div className="text-red-600 mb-2">Failed to load plan</div>
        <div className="text-sm text-gray-500">{(error as Error)?.message}</div>
      </div>
    );
  }

  if (!plan) {
    return (
      <div
        data-testid="plan-detail-not-found"
        className="h-full flex items-center justify-center bg-white"
      >
        <div className="text-gray-500">Plan not found</div>
      </div>
    );
  }

  // Determine available status transitions
  const getStatusTransitions = () => {
    switch (plan.status) {
      case 'draft':
        return [{ status: 'active', label: 'Activate', icon: Play, color: 'bg-blue-500 hover:bg-blue-600' }];
      case 'active':
        return [
          { status: 'completed', label: 'Complete', icon: CheckCircle2, color: 'bg-green-500 hover:bg-green-600' },
          { status: 'cancelled', label: 'Cancel', icon: Ban, color: 'bg-red-500 hover:bg-red-600' },
        ];
      case 'completed':
      case 'cancelled':
        return [{ status: 'draft', label: 'Reopen as Draft', icon: FileEdit, color: 'bg-gray-500 hover:bg-gray-600' }];
      default:
        return [];
    }
  };

  const statusTransitions = getStatusTransitions();

  return (
    <>
      <div
        data-testid="plan-detail-panel"
        className="h-full flex flex-col bg-white border-l border-gray-200"
      >
        {/* Header */}
        <div className="flex items-start justify-between p-4 border-b border-gray-200">
          <div className="flex-1 min-w-0">
            {/* Status badge */}
            <div className="mb-2">
              <StatusBadge status={plan.status} />
            </div>

            {/* Title - editable */}
            {isEditMode ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  data-testid="plan-title-input"
                  value={editedTitle}
                  onChange={(e) => setEditedTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveTitle();
                    if (e.key === 'Escape') handleCancelEdit();
                  }}
                  className="flex-1 text-lg font-semibold text-gray-900 border border-blue-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
                <button
                  data-testid="save-title-btn"
                  onClick={handleSaveTitle}
                  disabled={updatePlan.isPending}
                  className="p-1 text-green-600 hover:bg-green-50 rounded"
                  title="Save"
                >
                  <Check className="w-5 h-5" />
                </button>
                <button
                  data-testid="cancel-edit-btn"
                  onClick={handleCancelEdit}
                  className="p-1 text-gray-400 hover:bg-gray-100 rounded"
                  title="Cancel"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 group">
                <h2
                  data-testid="plan-detail-title"
                  className="text-lg font-semibold text-gray-900"
                >
                  {plan.title}
                </h2>
                <button
                  data-testid="edit-title-btn"
                  onClick={() => setIsEditMode(true)}
                  className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Edit title"
                >
                  <Pencil className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* ID */}
            <div className="mt-1 text-xs text-gray-500 font-mono">
              <span data-testid="plan-detail-id">{plan.id}</span>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
            aria-label="Close panel"
            data-testid="plan-detail-close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status Actions */}
        {statusTransitions.length > 0 && (
          <div className="flex gap-2 p-4 border-b border-gray-200 bg-gray-50">
            {statusTransitions.map((transition) => {
              const Icon = transition.icon;
              return (
                <button
                  key={transition.status}
                  data-testid={`status-action-${transition.status}`}
                  onClick={() => handleStatusChange(transition.status)}
                  disabled={updatePlan.isPending}
                  className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white rounded ${transition.color} disabled:opacity-50`}
                >
                  <Icon className="w-4 h-4" />
                  {transition.label}
                </button>
              );
            })}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* Progress Section with Progress Ring (TB86) */}
          {progress && (
            <div className="mb-6" data-testid="plan-progress-section">
              <div className="text-sm font-medium text-gray-700 mb-4">Progress</div>
              <div className="flex flex-col items-center gap-4">
                {/* Large Progress Ring (80px) */}
                <ProgressRingWithBreakdown
                  percentage={progress.completionPercentage}
                  completed={progress.completedTasks}
                  total={progress.totalTasks}
                  itemLabel="tasks"
                  size="large"
                  testId="plan-detail-progress-ring"
                />
                {/* Task Status Summary */}
                <div className="w-full mt-2">
                  <TaskStatusSummary progress={progress} />
                </div>
              </div>
            </div>
          )}

          {/* Tasks Section */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-medium text-gray-700">
                Tasks ({tasks.length})
              </div>
              <button
                data-testid="add-task-btn"
                onClick={() => setShowTaskPicker(true)}
                className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded transition-colors"
              >
                <Plus className="w-3 h-3" />
                Add Task
              </button>
            </div>
            <PlanTaskList
              tasks={tasks}
              isEditMode={true}
              onRemoveTask={handleRemoveTask}
              removingTaskId={removingTaskId}
            />
          </div>

          {/* Metadata */}
          <div className="pt-4 border-t border-gray-100">
            <div className="grid grid-cols-2 gap-4 text-xs text-gray-500">
              <div>
                <div className="flex items-center gap-1 mb-1">
                  <Clock className="w-3 h-3" />
                  <span className="font-medium">Created:</span>
                </div>
                <span title={formatDate(plan.createdAt)}>
                  {formatRelativeTime(plan.createdAt)}
                </span>
              </div>
              <div>
                <div className="flex items-center gap-1 mb-1">
                  <Clock className="w-3 h-3" />
                  <span className="font-medium">Updated:</span>
                </div>
                <span title={formatDate(plan.updatedAt)}>
                  {formatRelativeTime(plan.updatedAt)}
                </span>
              </div>
              <div className="col-span-2">
                <div className="flex items-center gap-1 mb-1">
                  <User className="w-3 h-3" />
                  <span className="font-medium">Created by:</span>
                </div>
                <span className="font-mono">{plan.createdBy}</span>
              </div>
              {plan.completedAt && (
                <div className="col-span-2">
                  <div className="flex items-center gap-1 mb-1">
                    <CheckCircle2 className="w-3 h-3 text-green-500" />
                    <span className="font-medium">Completed:</span>
                  </div>
                  <span>{formatDate(plan.completedAt)}</span>
                </div>
              )}
              {plan.cancelledAt && (
                <div className="col-span-2">
                  <div className="flex items-center gap-1 mb-1">
                    <XCircle className="w-3 h-3 text-red-500" />
                    <span className="font-medium">Cancelled:</span>
                  </div>
                  <span>{formatDate(plan.cancelledAt)}</span>
                  {plan.cancelReason && (
                    <p className="mt-1 text-gray-600">{plan.cancelReason}</p>
                  )}
                </div>
              )}
            </div>

            {/* Tags */}
            {plan.tags && plan.tags.length > 0 && (
              <div className="mt-4">
                <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                  Tags
                </div>
                <div className="flex flex-wrap gap-1">
                  {plan.tags.map((tag) => (
                    <span
                      key={tag}
                      data-testid={`plan-tag-${tag}`}
                      className="px-2 py-0.5 text-xs bg-gray-100 text-gray-700 rounded"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Task Picker Modal */}
      {showTaskPicker && (
        <TaskPickerModal
          planId={planId}
          onClose={() => setShowTaskPicker(false)}
          onAddTask={handleAddTask}
          isAdding={addTaskToPlan.isPending}
        />
      )}
    </>
  );
}

/**
 * Main Plans Page Component with search (TB87) and responsive design (TB148)
 */
export function PlansPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: '/plans' });
  const isMobile = useIsMobile();
  const { openCreatePlanModal } = useGlobalQuickActions();
  // Track shortcut changes to update the badge
  useShortcutVersion();

  const [selectedStatus, setSelectedStatus] = useState<string | null>(search.status ?? null);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(search.selected ?? null);

  // View mode state (TB88) - Default to list on mobile, roadmap only on desktop
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    // Force list view on mobile since roadmap isn't mobile-optimized
    if (typeof window !== 'undefined' && window.innerWidth < 640) {
      return 'list';
    }
    return getStoredViewMode();
  });

  // Search state (TB87)
  const [searchQuery, setSearchQuery] = useState<string>(getStoredSearch());
  const debouncedSearchQuery = useDebounce(searchQuery, SEARCH_DEBOUNCE_DELAY);

  // Use upfront-loaded data (TB67) - but note it doesn't include progress
  const { data: allPlans } = useAllPlans();

  // Use server-side query with progress hydration (TB86)
  // This is the primary data source for plans with progress info
  const { data: serverPlans = [], isLoading: isServerLoading, error } = usePlans(selectedStatus ?? undefined);

  // Prefer server data with progress (TB86), fall back to allPlans for deep-linking checks
  const basePlans = useMemo(() => {
    // Server query returns plans with progress hydration - always use if available
    if (serverPlans && serverPlans.length > 0) {
      return serverPlans;
    }
    // Fallback to upfront-loaded data (may not have progress)
    if (allPlans && allPlans.length > 0) {
      if (selectedStatus) {
        return (allPlans as HydratedPlan[]).filter(p => p.status === selectedStatus);
      }
      return allPlans as HydratedPlan[];
    }
    return [];
  }, [allPlans, serverPlans, selectedStatus]);

  // Filter plans by search query (TB87) and compute match indices
  const { filteredPlans, matchIndicesMap } = useMemo(() => {
    if (!debouncedSearchQuery.trim()) {
      return { filteredPlans: basePlans, matchIndicesMap: new Map<string, number[]>() };
    }

    const matchMap = new Map<string, number[]>();
    const filtered = basePlans.filter((plan) => {
      const match = fuzzySearch(plan.title, debouncedSearchQuery);
      if (match && match.matched) {
        matchMap.set(plan.id, match.indices);
        return true;
      }
      return false;
    });

    return { filteredPlans: filtered, matchIndicesMap: matchMap };
  }, [basePlans, debouncedSearchQuery]);

  const plans = filteredPlans;
  const isLoading = isServerLoading;

  // Deep-link navigation (TB70)
  const deepLink = useDeepLink({
    data: allPlans as HydratedPlan[] | undefined,
    selectedId: search.selected,
    currentPage: 1,
    pageSize: 1000, // Plans don't have pagination
    getId: (plan) => plan.id,
    routePath: '/plans',
    rowTestIdPrefix: 'plan-item-',
    autoNavigate: false, // No pagination
    highlightDelay: 200,
  });

  // Sync with URL on mount
  useEffect(() => {
    if (search.selected && search.selected !== selectedPlanId) {
      setSelectedPlanId(search.selected);
    }
    if (search.status && search.status !== selectedStatus) {
      setSelectedStatus(search.status);
    }
  }, [search.selected, search.status]);

  // Persist search query to localStorage (TB87)
  useEffect(() => {
    setStoredSearch(debouncedSearchQuery);
  }, [debouncedSearchQuery]);

  const handlePlanClick = (planId: string) => {
    setSelectedPlanId(planId);
    navigate({ to: '/plans', search: { selected: planId, status: selectedStatus ?? undefined } });
  };

  const handleCloseDetail = () => {
    setSelectedPlanId(null);
    navigate({ to: '/plans', search: { selected: undefined, status: selectedStatus ?? undefined } });
  };

  const handleStatusFilterChange = (status: string | null) => {
    setSelectedStatus(status);
    navigate({ to: '/plans', search: { selected: selectedPlanId ?? undefined, status: status ?? undefined } });
  };

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
  };

  const handleSearchClear = () => {
    setSearchQuery('');
  };

  // View mode change handler (TB88)
  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode);
    setStoredViewMode(mode);
  };

  // Determine what to show in empty state (TB87)
  const isSearchActive = debouncedSearchQuery.trim().length > 0;
  const totalBeforeSearch = basePlans.length;

  return (
    <div data-testid="plans-page" className="h-full flex flex-col">
      {/* Header */}
      <PageHeader
        title="Plans"
        icon={ClipboardList}
        iconColor="text-blue-500"
        count={plans.length > 0 ? plans.length : undefined}
        totalCount={isSearchActive && totalBeforeSearch !== plans.length ? totalBeforeSearch : undefined}
        bordered
        actions={[
          {
            label: 'Create Plan',
            shortLabel: 'Create',
            icon: Plus,
            onClick: openCreatePlanModal,
            shortcut: getCurrentBinding('action.createPlan'),
            testId: 'create-plan-btn',
          },
        ]}
        testId="plans-header"
      >
        {/* Search and filter controls */}
        <div className="space-y-3">
          {/* Search bar */}
          <PlanSearchBar
            value={searchQuery}
            onChange={handleSearchChange}
            onClear={handleSearchClear}
          />
          {/* Filter and View Controls */}
          <div className="flex items-center justify-between gap-4">
            <div className={isMobile ? 'overflow-x-auto -mx-3 px-3 scrollbar-hide flex-1' : ''}>
              <StatusFilter
                selectedStatus={selectedStatus}
                onStatusChange={handleStatusFilterChange}
              />
            </div>
            {/* View Toggle (TB88) - Hide on mobile */}
            {!isMobile && (
              <ViewToggle
                view={viewMode}
                onViewChange={handleViewModeChange}
              />
            )}
          </div>
        </div>
      </PageHeader>

      {/* Content - Responsive layout (TB148) */}
      <div className={`flex-1 flex overflow-hidden ${selectedPlanId && isMobile ? 'hidden' : ''}`}>
        {/* Plan Content - List or Roadmap View (TB88) */}
        <div className={`flex-1 overflow-y-auto bg-[var(--color-bg)] ${viewMode === 'roadmap' ? 'overflow-x-auto p-4' : isMobile ? '' : 'p-4'}`} tabIndex={0} role="region" aria-label="Plan content">
          {isLoading && (
            <div
              data-testid="plans-loading"
              className="text-center py-12 text-[var(--color-text-secondary)]"
            >
              Loading plans...
            </div>
          )}

          {error && (
            <div
              data-testid="plans-error"
              className="text-center py-12 text-red-500"
            >
              Failed to load plans
            </div>
          )}

          {!isLoading && !error && plans.length === 0 && (
            <div
              data-testid="plans-empty"
              className="text-center py-12"
            >
              <ClipboardList className="w-12 h-12 text-[var(--color-border)] mx-auto mb-3" />
              {isSearchActive ? (
                <>
                  <p className="text-[var(--color-text-secondary)]" data-testid="plans-no-search-results">
                    No plans matching "{debouncedSearchQuery}"
                  </p>
                  <button
                    onClick={handleSearchClear}
                    className="mt-2 text-sm text-blue-600 hover:text-blue-800"
                    data-testid="plans-clear-search"
                  >
                    Clear search
                  </button>
                </>
              ) : (
                <>
                  <p className="text-[var(--color-text-secondary)]">No plans found</p>
                  <p className="text-sm text-[var(--color-text-muted)] mt-1">
                    {selectedStatus
                      ? `No ${selectedStatus} plans available`
                      : 'Create your first plan to get started'}
                  </p>
                </>
              )}
            </div>
          )}

          {/* Mobile List View with Cards (TB148) */}
          {!isLoading && !error && plans.length > 0 && viewMode === 'list' && isMobile && (
            <div data-testid="mobile-plans-list">
              {plans.map((plan) => (
                <MobilePlanCard
                  key={plan.id}
                  plan={plan}
                  isSelected={selectedPlanId === plan.id}
                  onClick={() => handlePlanClick(plan.id)}
                  searchMatchIndices={matchIndicesMap.get(plan.id)}
                />
              ))}
            </div>
          )}

          {/* Desktop List View */}
          {!isLoading && !error && plans.length > 0 && viewMode === 'list' && !isMobile && (
            <div data-testid="plans-list" className="space-y-3">
              {plans.map((plan) => (
                <PlanListItem
                  key={plan.id}
                  plan={plan}
                  isSelected={selectedPlanId === plan.id}
                  onClick={handlePlanClick}
                  searchMatchIndices={matchIndicesMap.get(plan.id)}
                />
              ))}
            </div>
          )}

          {/* Roadmap View (TB88) - Desktop only */}
          {!isLoading && !error && plans.length > 0 && viewMode === 'roadmap' && !isMobile && (
            <RoadmapView
              plans={plans}
              onPlanClick={handlePlanClick}
              selectedPlanId={selectedPlanId}
            />
          )}
        </div>

        {/* Plan Detail Panel - Desktop (side panel) */}
        {selectedPlanId && !isMobile && (
          <div className="w-96 flex-shrink-0 border-l border-[var(--color-border)]" data-testid="plan-detail-container">
            {deepLink.notFound ? (
              <ElementNotFound
                elementType="Plan"
                elementId={selectedPlanId}
                backRoute="/plans"
                backLabel="Back to Plans"
                onDismiss={handleCloseDetail}
              />
            ) : (
              <PlanDetailPanel
                planId={selectedPlanId}
                onClose={handleCloseDetail}
              />
            )}
          </div>
        )}
      </div>

      {/* Plan Detail Panel - Mobile (full-screen sheet) (TB148) */}
      {selectedPlanId && isMobile && (
        <MobileDetailSheet
          open={!!selectedPlanId}
          onClose={handleCloseDetail}
          title="Plan Details"
          data-testid="mobile-plan-detail-sheet"
        >
          {deepLink.notFound ? (
            <ElementNotFound
              elementType="Plan"
              elementId={selectedPlanId}
              backRoute="/plans"
              backLabel="Back to Plans"
              onDismiss={handleCloseDetail}
            />
          ) : (
            <PlanDetailPanel
              planId={selectedPlanId}
              onClose={handleCloseDetail}
            />
          )}
        </MobileDetailSheet>
      )}

      {/* Mobile Floating Action Button for Create Plan (TB148) */}
      {isMobile && !selectedPlanId && (
        <button
          onClick={openCreatePlanModal}
          className="fixed bottom-6 right-6 w-14 h-14 flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg z-40 touch-target"
          aria-label="Create new plan"
          data-testid="mobile-create-plan-fab"
        >
          <Plus className="w-6 h-6" />
        </button>
      )}
    </div>
  );
}

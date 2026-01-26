/**
 * Timeline Lens - TB42: Visual Overhaul + TB116: Horizontal Timeline View
 *
 * Chronological view of all events in the system with:
 * - Visual event type icons (plus, pencil, trash, etc.)
 * - Events grouped by time period (Today, Yesterday, This Week, Earlier)
 * - Enhanced event cards with actor avatar, element type badge, preview
 * - Jump to date picker for navigation
 * - Multi-select chips for filtering (instead of dropdowns)
 * - TB116: Horizontal timeline visualization with pan/zoom
 */

import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearch, useNavigate } from '@tanstack/react-router';
import { Pagination } from '../components/shared/Pagination';
import { VirtualizedList } from '../components/shared/VirtualizedList';
import { useTrackDashboardSection } from '../hooks/useTrackDashboardSection';

// Estimated event card height for virtualization
const EVENT_CARD_HEIGHT = 140;
import {
  Plus,
  Pencil,
  XCircle,
  RotateCcw,
  Trash2,
  Link,
  Unlink,
  Tag,
  Tags,
  UserPlus,
  UserMinus,
  AlertTriangle,
  CheckCircle,
  ListTodo,
  FileText,
  MessageSquare,
  Users,
  Folder,
  Workflow,
  Bot,
  UsersRound,
  GitBranch,
  BookOpen,
  Calendar,
  X,
  ChevronDown,
  Search,
  List,
  Clock,
  ZoomIn,
  ZoomOut,
  Maximize,
} from 'lucide-react';

// Event types from the API spec
type EventType =
  | 'created'
  | 'updated'
  | 'closed'
  | 'reopened'
  | 'deleted'
  | 'dependency_added'
  | 'dependency_removed'
  | 'tag_added'
  | 'tag_removed'
  | 'member_added'
  | 'member_removed'
  | 'auto_blocked'
  | 'auto_unblocked';

interface Event {
  id: number;
  elementId: string;
  elementType?: string;
  eventType: EventType;
  actor: string;
  oldValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  createdAt: string;
}

// Event filter state
interface EventFilterState {
  eventTypes: EventType[];
  actors: string[];
  elementTypes: string[];
  search: string;
  jumpToDate: string | null;
}

interface PaginatedResult<T> {
  items: T[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
}

const DEFAULT_EVENT_PAGE_SIZE = 100;

// TB116: View modes
type TimelineViewMode = 'list' | 'horizontal';

// TB116: Time range presets for horizontal timeline
type TimeRange = '24h' | '7d' | '30d' | 'all';

// Time period grouping
type TimePeriod = 'today' | 'yesterday' | 'thisWeek' | 'earlier';

// Available event type filters with icons
const ALL_EVENT_TYPES: { value: EventType; label: string; icon: typeof Plus }[] = [
  { value: 'created', label: 'Created', icon: Plus },
  { value: 'updated', label: 'Updated', icon: Pencil },
  { value: 'closed', label: 'Closed', icon: XCircle },
  { value: 'reopened', label: 'Reopened', icon: RotateCcw },
  { value: 'deleted', label: 'Deleted', icon: Trash2 },
  { value: 'dependency_added', label: 'Dep Added', icon: Link },
  { value: 'dependency_removed', label: 'Dep Removed', icon: Unlink },
  { value: 'tag_added', label: 'Tag Added', icon: Tag },
  { value: 'tag_removed', label: 'Tag Removed', icon: Tags },
  { value: 'member_added', label: 'Member+', icon: UserPlus },
  { value: 'member_removed', label: 'Member-', icon: UserMinus },
  { value: 'auto_blocked', label: 'Blocked', icon: AlertTriangle },
  { value: 'auto_unblocked', label: 'Unblocked', icon: CheckCircle },
];

// Event type color mapping
const EVENT_TYPE_COLORS: Record<EventType, { bg: string; text: string; border: string; iconBg: string }> = {
  created: { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200', iconBg: 'bg-green-100' },
  updated: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', iconBg: 'bg-blue-100' },
  closed: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200', iconBg: 'bg-purple-100' },
  reopened: { bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-200', iconBg: 'bg-yellow-100' },
  deleted: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', iconBg: 'bg-red-100' },
  dependency_added: { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200', iconBg: 'bg-indigo-100' },
  dependency_removed: { bg: 'bg-pink-50', text: 'text-pink-700', border: 'border-pink-200', iconBg: 'bg-pink-100' },
  tag_added: { bg: 'bg-cyan-50', text: 'text-cyan-700', border: 'border-cyan-200', iconBg: 'bg-cyan-100' },
  tag_removed: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200', iconBg: 'bg-orange-100' },
  member_added: { bg: 'bg-teal-50', text: 'text-teal-700', border: 'border-teal-200', iconBg: 'bg-teal-100' },
  member_removed: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200', iconBg: 'bg-rose-100' },
  auto_blocked: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-300', iconBg: 'bg-red-100' },
  auto_unblocked: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', iconBg: 'bg-emerald-100' },
};

// Event type icons mapping
const EVENT_TYPE_ICONS: Record<EventType, typeof Plus> = {
  created: Plus,
  updated: Pencil,
  closed: XCircle,
  reopened: RotateCcw,
  deleted: Trash2,
  dependency_added: Link,
  dependency_removed: Unlink,
  tag_added: Tag,
  tag_removed: Tags,
  member_added: UserPlus,
  member_removed: UserMinus,
  auto_blocked: AlertTriangle,
  auto_unblocked: CheckCircle,
};

// Element type icons
const ELEMENT_TYPE_ICONS: Record<string, typeof ListTodo> = {
  task: ListTodo,
  plan: Folder,
  workflow: Workflow,
  channel: MessageSquare,
  message: MessageSquare,
  document: FileText,
  library: BookOpen,
  entity: Bot,
  team: UsersRound,
  playbook: GitBranch,
};

// Element type colors
const ELEMENT_TYPE_COLORS: Record<string, string> = {
  task: 'bg-blue-100 text-blue-700',
  plan: 'bg-purple-100 text-purple-700',
  workflow: 'bg-indigo-100 text-indigo-700',
  channel: 'bg-green-100 text-green-700',
  message: 'bg-emerald-100 text-emerald-700',
  document: 'bg-orange-100 text-orange-700',
  library: 'bg-amber-100 text-amber-700',
  entity: 'bg-cyan-100 text-cyan-700',
  team: 'bg-pink-100 text-pink-700',
  playbook: 'bg-violet-100 text-violet-700',
};

// Display names for event types
const EVENT_TYPE_DISPLAY: Record<EventType, string> = {
  created: 'Created',
  updated: 'Updated',
  closed: 'Closed',
  reopened: 'Reopened',
  deleted: 'Deleted',
  dependency_added: 'Dependency Added',
  dependency_removed: 'Dependency Removed',
  tag_added: 'Tag Added',
  tag_removed: 'Tag Removed',
  member_added: 'Member Added',
  member_removed: 'Member Removed',
  auto_blocked: 'Auto Blocked',
  auto_unblocked: 'Auto Unblocked',
};

function useEvents(
  filter: EventFilterState,
  page: number = 1,
  pageSize: number = DEFAULT_EVENT_PAGE_SIZE
) {
  const offset = (page - 1) * pageSize;
  const queryParams = new URLSearchParams();

  // Add event type filter
  if (filter.eventTypes.length > 0 && filter.eventTypes.length < ALL_EVENT_TYPES.length) {
    queryParams.set('eventType', filter.eventTypes.join(','));
  }

  // Add actor filter (first selected actor for server-side filtering)
  if (filter.actors.length === 1) {
    queryParams.set('actor', filter.actors[0]);
  }

  // Add pagination params
  queryParams.set('limit', pageSize.toString());
  queryParams.set('offset', offset.toString());
  queryParams.set('paginated', 'true');

  const url = `/api/events?${queryParams.toString()}`;

  return useQuery<PaginatedResult<Event>>({
    queryKey: ['events', 'paginated', page, pageSize, filter.eventTypes, filter.actors],
    queryFn: async () => {
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch events');
      return response.json();
    },
    refetchInterval: 5000, // Poll every 5 seconds for live updates
  });
}

function getTimePeriod(dateString: string): TimePeriod {
  const date = new Date(dateString);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);

  if (date >= today) return 'today';
  if (date >= yesterday) return 'yesterday';
  if (date >= weekAgo) return 'thisWeek';
  return 'earlier';
}

const TIME_PERIOD_LABELS: Record<TimePeriod, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  thisWeek: 'This Week',
  earlier: 'Earlier',
};

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 10) return 'just now';
  if (diffSecs < 60) return `${diffSecs}s ago`;
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString();
}

function formatTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function generateChangesPreview(event: Event): string | null {
  const { eventType, oldValue, newValue } = event;

  if (eventType === 'updated' && oldValue && newValue) {
    const changedFields: string[] = [];
    const allKeys = new Set([...Object.keys(oldValue), ...Object.keys(newValue)]);
    for (const key of allKeys) {
      if (JSON.stringify(oldValue[key]) !== JSON.stringify(newValue[key])) {
        const newVal = newValue[key];
        // Create a short preview of the change
        if (typeof newVal === 'string' && newVal.length < 30) {
          changedFields.push(`${key}: "${newVal}"`);
        } else {
          changedFields.push(key);
        }
      }
    }
    if (changedFields.length > 0) {
      return changedFields.slice(0, 2).join(', ') + (changedFields.length > 2 ? `, +${changedFields.length - 2} more` : '');
    }
  }

  if (eventType === 'dependency_added' && newValue) {
    const targetId = (newValue.targetId as string) ?? '';
    const depType = (newValue.type as string) ?? 'dependency';
    if (targetId) return `${depType} → ${targetId.slice(0, 8)}...`;
  }

  if (eventType === 'dependency_removed' && oldValue) {
    const targetId = (oldValue.targetId as string) ?? '';
    const depType = (oldValue.type as string) ?? 'dependency';
    if (targetId) return `${depType} → ${targetId.slice(0, 8)}...`;
  }

  if (eventType === 'tag_added' && newValue) {
    const tag = (newValue.tag as string) ?? '';
    if (tag) return `"${tag}"`;
  }

  if (eventType === 'tag_removed' && oldValue) {
    const tag = (oldValue.tag as string) ?? '';
    if (tag) return `"${tag}"`;
  }

  if (eventType === 'member_added' && newValue) {
    const member = (newValue.addedMember as string) ?? '';
    if (member) return member;
  }

  if (eventType === 'member_removed' && newValue) {
    const member = (newValue.removedMember as string) ?? '';
    const selfRemoval = newValue.selfRemoval;
    if (member) return selfRemoval ? `${member} left` : member;
  }

  return null;
}

function generateEventSummary(event: Event): string {
  const { eventType, actor } = event;

  switch (eventType) {
    case 'created':
      return `Created by ${actor}`;
    case 'updated':
      return `Updated by ${actor}`;
    case 'closed':
      return `Closed by ${actor}`;
    case 'reopened':
      return `Reopened by ${actor}`;
    case 'deleted':
      return `Deleted by ${actor}`;
    case 'dependency_added':
      return `Dependency added by ${actor}`;
    case 'dependency_removed':
      return `Dependency removed by ${actor}`;
    case 'tag_added':
      return `Tag added by ${actor}`;
    case 'tag_removed':
      return `Tag removed by ${actor}`;
    case 'member_added':
      return `Member added by ${actor}`;
    case 'member_removed':
      return `Member removed by ${actor}`;
    case 'auto_blocked':
      return 'Automatically blocked';
    case 'auto_unblocked':
      return 'Automatically unblocked';
    default:
      return `${EVENT_TYPE_DISPLAY[eventType] || eventType} by ${actor}`;
  }
}

function getInitials(name: string): string {
  const parts = name.split(/[\s_-]+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

function getAvatarColor(name: string): string {
  // Generate a consistent color based on the name
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const colors = [
    'bg-blue-500',
    'bg-green-500',
    'bg-purple-500',
    'bg-orange-500',
    'bg-pink-500',
    'bg-cyan-500',
    'bg-indigo-500',
    'bg-teal-500',
  ];
  return colors[Math.abs(hash) % colors.length];
}

interface EventCardProps {
  event: Event;
}

function EventCard({ event }: EventCardProps) {
  const colors = EVENT_TYPE_COLORS[event.eventType] || EVENT_TYPE_COLORS.updated;
  const EventIcon = EVENT_TYPE_ICONS[event.eventType] || Pencil;
  const elementType = event.elementType || inferElementType(event.elementId);
  const ElementIcon = ELEMENT_TYPE_ICONS[elementType] || ListTodo;
  const elementColor = ELEMENT_TYPE_COLORS[elementType] || 'bg-gray-100 text-gray-700';
  const changesPreview = generateChangesPreview(event);
  const avatarColor = getAvatarColor(event.actor);

  return (
    <div
      className="p-4 bg-white rounded-lg border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all"
      data-testid="event-card"
    >
      <div className="flex items-start gap-3">
        {/* Event type icon */}
        <div className={`p-2 rounded-lg ${colors.iconBg} shrink-0`} data-testid="event-icon">
          <EventIcon className={`w-4 h-4 ${colors.text}`} />
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          {/* Top row: event type badge + element type badge + timestamp */}
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full ${colors.bg} ${colors.text}`}
              data-testid="event-type-badge"
            >
              {EVENT_TYPE_DISPLAY[event.eventType]}
            </span>
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full ${elementColor}`}
              data-testid="element-type-badge"
            >
              <ElementIcon className="w-3 h-3" />
              {elementType}
            </span>
            <span className="text-xs text-gray-400 ml-auto shrink-0" data-testid="event-time">
              {formatTimeAgo(event.createdAt)}
            </span>
          </div>

          {/* Element ID */}
          <p className="text-sm text-gray-900 mt-1.5 font-mono truncate" data-testid="element-id">
            {event.elementId}
          </p>

          {/* Changes preview */}
          {changesPreview && (
            <p className="text-xs text-gray-500 mt-1 truncate" data-testid="changes-preview">
              {changesPreview}
            </p>
          )}

          {/* Actor row */}
          <div className="flex items-center gap-2 mt-2">
            <div
              className={`w-5 h-5 rounded-full ${avatarColor} flex items-center justify-center shrink-0`}
              data-testid="actor-avatar"
            >
              <span className="text-[10px] font-medium text-white">{getInitials(event.actor)}</span>
            </div>
            <span className="text-xs text-gray-600 truncate">{event.actor}</span>
            <span className="text-xs text-gray-400 ml-auto shrink-0">{formatTime(event.createdAt)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function inferElementType(elementId: string): string {
  // Try to infer element type from ID prefix patterns
  const prefix = elementId.slice(0, 2).toLowerCase();
  const prefixMap: Record<string, string> = {
    ts: 'task',
    tk: 'task',
    pl: 'plan',
    wf: 'workflow',
    ch: 'channel',
    ms: 'message',
    dc: 'document',
    lb: 'library',
    en: 'entity',
    tm: 'team',
    pb: 'playbook',
  };
  return prefixMap[prefix] || 'element';
}

interface FilterChipProps {
  label: string;
  icon?: typeof Plus;
  active: boolean;
  onClick: () => void;
  color?: { bg: string; text: string };
}

function FilterChip({ label, icon: Icon, active, onClick, color }: FilterChipProps) {
  return (
    <button
      onClick={onClick}
      data-testid={`filter-chip-${label.toLowerCase().replace(/\s+/g, '-')}`}
      className={`
        inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full transition-all
        ${active
          ? color
            ? `${color.bg} ${color.text} ring-2 ring-offset-1 ring-current`
            : 'bg-blue-100 text-blue-700 ring-2 ring-offset-1 ring-blue-400'
          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
        }
      `}
    >
      {Icon && <Icon className="w-3.5 h-3.5" />}
      {label}
      {active && <X className="w-3 h-3 ml-0.5" />}
    </button>
  );
}

interface MultiSelectDropdownProps {
  label: string;
  icon: typeof Users;
  options: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
  testId: string;
}

function MultiSelectDropdown({ label, icon: Icon, options, selected, onChange, testId }: MultiSelectDropdownProps) {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleOption = (option: string) => {
    if (selected.includes(option)) {
      onChange(selected.filter((s) => s !== option));
    } else {
      onChange([...selected, option]);
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen(!open)}
        data-testid={testId}
        className={`
          inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full transition-all
          ${selected.length > 0
            ? 'bg-blue-100 text-blue-700 ring-2 ring-offset-1 ring-blue-400'
            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }
        `}
      >
        <Icon className="w-3.5 h-3.5" />
        {label}
        {selected.length > 0 && (
          <span className="ml-0.5 bg-blue-600 text-white text-[10px] px-1.5 rounded-full">
            {selected.length}
          </span>
        )}
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && options.length > 0 && (
        <div
          className="absolute top-full left-0 mt-1 w-48 max-h-60 overflow-y-auto bg-white rounded-lg shadow-lg border border-gray-200 z-50"
          data-testid={`${testId}-dropdown`}
        >
          <div className="p-1">
            {options.map((option) => (
              <button
                key={option}
                onClick={() => toggleOption(option)}
                className={`
                  w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-colors
                  ${selected.includes(option) ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50 text-gray-700'}
                `}
              >
                <div
                  className={`w-4 h-4 rounded border flex items-center justify-center
                    ${selected.includes(option) ? 'bg-blue-600 border-blue-600' : 'border-gray-300'}
                  `}
                >
                  {selected.includes(option) && (
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <span className="truncate">{option}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface DatePickerProps {
  value: string | null;
  onChange: (date: string | null) => void;
}

function JumpToDatePicker({ value, onChange }: DatePickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="relative">
      <button
        onClick={() => inputRef.current?.showPicker?.()}
        data-testid="jump-to-date-button"
        className={`
          inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full transition-all
          ${value
            ? 'bg-blue-100 text-blue-700 ring-2 ring-offset-1 ring-blue-400'
            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }
        `}
      >
        <Calendar className="w-3.5 h-3.5" />
        {value ? formatDate(value) : 'Jump to date'}
        {value && (
          <X
            className="w-3 h-3 ml-0.5"
            onClick={(e) => {
              e.stopPropagation();
              onChange(null);
            }}
          />
        )}
      </button>
      <input
        ref={inputRef}
        type="date"
        value={value || ''}
        onChange={(e) => onChange(e.target.value || null)}
        className="absolute opacity-0 w-0 h-0"
        data-testid="jump-to-date-input"
      />
    </div>
  );
}

interface TimePeriodGroupProps {
  period: TimePeriod;
  events: Event[];
  isFirst: boolean;
}

function TimePeriodGroup({ period, events, isFirst }: TimePeriodGroupProps) {
  if (events.length === 0) return null;

  // Use virtualization for large groups (more than 50 events)
  const useVirtualization = events.length > 50;

  return (
    <div className="mb-6" data-testid={`time-period-${period}`}>
      <div
        className={`sticky top-0 z-10 bg-gray-50 py-2 px-3 -mx-3 ${isFirst ? '' : 'mt-4'}`}
        data-testid={`time-period-header-${period}`}
      >
        <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
          {TIME_PERIOD_LABELS[period]}
          <span className="text-xs font-normal text-gray-400">({events.length})</span>
        </h3>
      </div>
      {useVirtualization ? (
        <div className="mt-2">
          <VirtualizedList
            items={events}
            getItemKey={(event) => event.id}
            estimateSize={EVENT_CARD_HEIGHT}
            scrollRestoreId={`timeline-${period}`}
            height={400}
            testId={`virtualized-events-${period}`}
            gap={8}
            renderItem={(event) => (
              <EventCard event={event} />
            )}
          />
        </div>
      ) : (
        <div className="space-y-2 mt-2">
          {events.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      )}
    </div>
  );
}

// TB116: Time range presets configuration
const TIME_RANGE_OPTIONS: { value: TimeRange; label: string; hours: number | null }[] = [
  { value: '24h', label: 'Last 24 Hours', hours: 24 },
  { value: '7d', label: 'Last 7 Days', hours: 24 * 7 },
  { value: '30d', label: 'Last 30 Days', hours: 24 * 30 },
  { value: 'all', label: 'All Time', hours: null },
];

// TB116: Horizontal Timeline Component
interface HorizontalTimelineProps {
  events: Event[];
  isLoading: boolean;
}

interface EventDot {
  event: Event;
  x: number;
  y: number;
  stackIndex: number;
}

function HorizontalTimeline({ events, isLoading }: HorizontalTimelineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>('7d');
  const [zoom, setZoom] = useState(1);
  const [panOffset, setPanOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState(0);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [hoveredEvent, setHoveredEvent] = useState<Event | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{ x: number; y: number } | null>(null);

  // Filter events by time range
  const filteredEvents = useMemo(() => {
    const option = TIME_RANGE_OPTIONS.find(o => o.value === timeRange);
    if (!option || option.hours === null) return events;

    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - option.hours);
    return events.filter(e => new Date(e.createdAt) >= cutoff);
  }, [events, timeRange]);

  // Calculate time bounds
  const { minTime, timeSpan } = useMemo(() => {
    if (filteredEvents.length === 0) {
      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return { minTime: weekAgo.getTime(), maxTime: now.getTime(), timeSpan: 7 * 24 * 60 * 60 * 1000 };
    }

    const times = filteredEvents.map(e => new Date(e.createdAt).getTime());
    const min = Math.min(...times);
    const max = Math.max(...times);
    // Add 5% padding on each side
    const span = max - min || 24 * 60 * 60 * 1000; // Default to 1 day if single event
    const padding = span * 0.05;
    return { minTime: min - padding, maxTime: max + padding, timeSpan: span + padding * 2 };
  }, [filteredEvents]);

  // Calculate dot positions with collision detection
  const eventDots = useMemo((): EventDot[] => {
    const containerWidth = containerRef.current?.clientWidth ?? 800;
    const effectiveWidth = containerWidth * zoom;
    const dotRadius = 8;
    const dotDiameter = dotRadius * 2;
    const verticalGap = 4;
    const baseY = 100; // Y position of the time axis

    // Sort events by time
    const sorted = [...filteredEvents].sort((a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

    // Calculate positions with stacking for overlaps
    const dots: EventDot[] = [];
    const occupiedSlots: { x: number; stackIndex: number }[] = [];

    for (const event of sorted) {
      const time = new Date(event.createdAt).getTime();
      const x = ((time - minTime) / timeSpan) * effectiveWidth;

      // Find the lowest available stack position
      let stackIndex = 0;
      for (const slot of occupiedSlots) {
        if (Math.abs(slot.x - x) < dotDiameter + 4) {
          stackIndex = Math.max(stackIndex, slot.stackIndex + 1);
        }
      }

      // Clean up old slots that don't overlap anymore
      const relevantSlots = occupiedSlots.filter(slot => Math.abs(slot.x - x) < dotDiameter + 4);
      occupiedSlots.length = 0;
      occupiedSlots.push(...relevantSlots);
      occupiedSlots.push({ x, stackIndex });

      dots.push({
        event,
        x,
        y: baseY - stackIndex * (dotDiameter + verticalGap),
        stackIndex,
      });
    }

    return dots;
  }, [filteredEvents, minTime, timeSpan, zoom]);

  // Format time axis labels
  const timeAxisLabels = useMemo(() => {
    const containerWidth = containerRef.current?.clientWidth ?? 800;
    const effectiveWidth = containerWidth * zoom;
    const labelCount = Math.max(4, Math.floor(effectiveWidth / 150));
    const labels: { x: number; label: string }[] = [];

    for (let i = 0; i <= labelCount; i++) {
      const ratio = i / labelCount;
      const time = minTime + timeSpan * ratio;
      const date = new Date(time);

      // Format based on time span
      let label: string;
      if (timeSpan < 2 * 24 * 60 * 60 * 1000) {
        // Less than 2 days: show time
        label = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      } else if (timeSpan < 30 * 24 * 60 * 60 * 1000) {
        // Less than 30 days: show date + time
        label = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
      } else {
        // More than 30 days: show month + year
        label = date.toLocaleDateString([], { month: 'short', year: '2-digit' });
      }

      labels.push({ x: ratio * effectiveWidth, label });
    }

    return labels;
  }, [minTime, timeSpan, zoom]);

  // Pan handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return; // Only left click
    setIsDragging(true);
    setDragStart(e.clientX + panOffset);
  }, [panOffset]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return;
    const newOffset = dragStart - e.clientX;
    const containerWidth = containerRef.current?.clientWidth ?? 800;
    const maxOffset = Math.max(0, containerWidth * zoom - containerWidth);
    setPanOffset(Math.max(0, Math.min(maxOffset, newOffset)));
  }, [isDragging, dragStart, zoom]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Zoom handlers
  const handleZoomIn = useCallback(() => {
    setZoom(z => Math.min(z * 1.5, 10));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom(z => Math.max(z / 1.5, 1));
    // Reset pan if zoom is back to 1
    if (zoom <= 1.5) setPanOffset(0);
  }, [zoom]);

  const handleFitToView = useCallback(() => {
    setZoom(1);
    setPanOffset(0);
  }, []);

  // Handle wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      setZoom(z => Math.max(1, Math.min(10, z * delta)));
    }
  }, []);

  // Event dot color based on event type
  const getEventDotColor = (eventType: EventType): string => {
    const colors: Record<EventType, string> = {
      created: '#22c55e',
      updated: '#3b82f6',
      closed: '#a855f7',
      reopened: '#eab308',
      deleted: '#ef4444',
      dependency_added: '#6366f1',
      dependency_removed: '#ec4899',
      tag_added: '#06b6d4',
      tag_removed: '#f97316',
      member_added: '#14b8a6',
      member_removed: '#f43f5e',
      auto_blocked: '#ef4444',
      auto_unblocked: '#10b981',
    };
    return colors[eventType] || '#6b7280';
  };

  // Handle event dot hover
  const handleDotMouseEnter = (event: Event, e: React.MouseEvent) => {
    setHoveredEvent(event);
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setTooltipPosition({ x: rect.left + rect.width / 2, y: rect.top });
  };

  const handleDotMouseLeave = () => {
    setHoveredEvent(null);
    setTooltipPosition(null);
  };

  if (isLoading) {
    return (
      <div className="h-64 flex items-center justify-center bg-gray-50 rounded-lg">
        <div className="animate-pulse text-gray-500">Loading timeline...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="horizontal-timeline">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        {/* Time range selector */}
        <div className="flex items-center gap-2" data-testid="time-range-selector">
          <Clock className="w-4 h-4 text-gray-400" />
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value as TimeRange)}
            className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            data-testid="time-range-select"
          >
            {TIME_RANGE_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {/* Zoom controls */}
        <div className="flex items-center gap-1" data-testid="zoom-controls">
          <button
            onClick={handleZoomOut}
            disabled={zoom <= 1}
            className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Zoom out"
            data-testid="zoom-out-button"
          >
            <ZoomOut className="w-4 h-4 text-gray-600" />
          </button>
          <span className="text-xs text-gray-500 w-12 text-center" data-testid="zoom-level">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={handleZoomIn}
            disabled={zoom >= 10}
            className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Zoom in"
            data-testid="zoom-in-button"
          >
            <ZoomIn className="w-4 h-4 text-gray-600" />
          </button>
          <div className="w-px h-4 bg-gray-300 mx-1" />
          <button
            onClick={handleFitToView}
            className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
            title="Fit to view"
            data-testid="fit-to-view-button"
          >
            <Maximize className="w-4 h-4 text-gray-600" />
          </button>
        </div>

        {/* Event count */}
        <div className="text-sm text-gray-500">
          {filteredEvents.length} event{filteredEvents.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Timeline canvas */}
      <div
        ref={containerRef}
        className="relative h-64 bg-gray-50 rounded-lg border border-gray-200 overflow-hidden select-none"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        style={{ cursor: isDragging ? 'grabbing' : zoom > 1 ? 'grab' : 'default' }}
        data-testid="timeline-canvas"
      >
        {/* Scrollable content */}
        <div
          ref={canvasRef}
          className="absolute inset-0"
          style={{ transform: `translateX(-${panOffset}px)` }}
        >
          {/* Time axis line */}
          <div
            className="absolute left-0 right-0 h-px bg-gray-300"
            style={{
              top: '100px',
              width: `${100 * zoom}%`,
            }}
          />

          {/* Time axis labels */}
          {timeAxisLabels.map((label, i) => (
            <div
              key={i}
              className="absolute text-xs text-gray-500 whitespace-nowrap"
              style={{
                left: label.x,
                top: '110px',
                transform: 'translateX(-50%)',
              }}
              data-testid={`axis-label-${i}`}
            >
              {label.label}
            </div>
          ))}

          {/* Event dots */}
          {eventDots.map((dot) => (
            <button
              key={dot.event.id}
              className="absolute w-4 h-4 rounded-full border-2 border-white shadow-sm hover:scale-125 transition-transform focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              style={{
                left: dot.x - 8,
                top: dot.y - 8,
                backgroundColor: getEventDotColor(dot.event.eventType),
              }}
              onClick={() => setSelectedEvent(dot.event)}
              onMouseEnter={(e) => handleDotMouseEnter(dot.event, e)}
              onMouseLeave={handleDotMouseLeave}
              data-testid={`event-dot-${dot.event.id}`}
              aria-label={`${EVENT_TYPE_DISPLAY[dot.event.eventType]} event on ${dot.event.elementId}`}
            />
          ))}
        </div>

        {/* Empty state */}
        {filteredEvents.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-gray-500">
            No events in the selected time range
          </div>
        )}

        {/* Pan hint */}
        {zoom > 1 && !isDragging && (
          <div className="absolute bottom-2 right-2 text-xs text-gray-400 bg-white/80 px-2 py-1 rounded">
            Drag to pan • Ctrl+scroll to zoom
          </div>
        )}
      </div>

      {/* Tooltip */}
      {hoveredEvent && tooltipPosition && (
        <div
          className="fixed z-50 bg-white shadow-lg rounded-lg border border-gray-200 p-3 max-w-xs pointer-events-none"
          style={{
            left: tooltipPosition.x,
            top: tooltipPosition.y - 10,
            transform: 'translate(-50%, -100%)',
          }}
          data-testid="event-tooltip"
        >
          <div className="flex items-center gap-2 mb-1">
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: getEventDotColor(hoveredEvent.eventType) }}
            />
            <span className="text-sm font-medium">{EVENT_TYPE_DISPLAY[hoveredEvent.eventType]}</span>
          </div>
          <p className="text-xs text-gray-600 font-mono">{hoveredEvent.elementId}</p>
          <p className="text-xs text-gray-500 mt-1">
            {new Date(hoveredEvent.createdAt).toLocaleString()}
          </p>
          <p className="text-xs text-gray-500">by {hoveredEvent.actor}</p>
        </div>
      )}

      {/* Selected event card */}
      {selectedEvent && (
        <div className="border border-blue-200 rounded-lg bg-blue-50 p-4" data-testid="selected-event-card">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <EventCard event={selectedEvent} />
            </div>
            <button
              onClick={() => setSelectedEvent(null)}
              className="p-1 hover:bg-blue-100 rounded-lg transition-colors ml-2"
              data-testid="close-selected-event"
            >
              <X className="w-4 h-4 text-gray-500" />
            </button>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs" data-testid="timeline-legend">
        {ALL_EVENT_TYPES.slice(0, 6).map(({ value, label }) => (
          <div key={value} className="flex items-center gap-1.5">
            <span
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: getEventDotColor(value) }}
            />
            <span className="text-gray-600">{label}</span>
          </div>
        ))}
        <span className="text-gray-400">+ {ALL_EVENT_TYPES.length - 6} more</span>
      </div>
    </div>
  );
}

// TB116: View mode toggle component
interface ViewModeToggleProps {
  mode: TimelineViewMode;
  onChange: (mode: TimelineViewMode) => void;
}

function ViewModeToggle({ mode, onChange }: ViewModeToggleProps) {
  return (
    <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5" data-testid="view-mode-toggle">
      <button
        onClick={() => onChange('list')}
        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
          mode === 'list'
            ? 'bg-white text-gray-900 shadow-sm'
            : 'text-gray-600 hover:text-gray-900'
        }`}
        data-testid="view-mode-list"
      >
        <List className="w-3.5 h-3.5" />
        List
      </button>
      <button
        onClick={() => onChange('horizontal')}
        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
          mode === 'horizontal'
            ? 'bg-white text-gray-900 shadow-sm'
            : 'text-gray-600 hover:text-gray-900'
        }`}
        data-testid="view-mode-horizontal"
      >
        <Clock className="w-3.5 h-3.5" />
        Horizontal
      </button>
    </div>
  );
}

export function TimelinePage() {
  // Track this dashboard section visit
  useTrackDashboardSection('timeline');

  // TB116: View mode state
  const [viewMode, setViewMode] = useState<TimelineViewMode>(() => {
    // Persist view mode preference in localStorage
    const saved = localStorage.getItem('timeline-view-mode');
    return (saved === 'list' || saved === 'horizontal') ? saved : 'list';
  });

  // Save view mode preference
  useEffect(() => {
    localStorage.setItem('timeline-view-mode', viewMode);
  }, [viewMode]);

  const navigate = useNavigate();
  const search = useSearch({ from: '/dashboard/timeline' });

  // Pagination state from URL
  const currentPage = search.page ?? 1;
  const pageSize = search.limit ?? DEFAULT_EVENT_PAGE_SIZE;
  // TB109: Actor filter from URL for "View all activity" link from EntityDetailPanel
  const actorFromUrl = search.actor;

  const [filter, setFilter] = useState<EventFilterState>(() => ({
    eventTypes: [],
    actors: actorFromUrl ? [actorFromUrl] : [],
    elementTypes: [],
    search: '',
    jumpToDate: null,
  }));

  // TB109: Sync filter.actors when URL actor param changes
  useEffect(() => {
    if (actorFromUrl) {
      setFilter((prev) => ({
        ...prev,
        actors: [actorFromUrl],
      }));
    }
  }, [actorFromUrl]);

  const { data: eventsData, isLoading, isError } = useEvents(filter, currentPage, pageSize);

  // Extract items from paginated response
  const events = eventsData?.items ?? [];
  const totalItems = eventsData?.total ?? 0;
  const totalPages = Math.ceil(totalItems / pageSize);
  const hasMore = eventsData?.hasMore ?? false;

  const handlePageChange = (page: number) => {
    navigate({ to: '/dashboard/timeline', search: { page, limit: pageSize, actor: actorFromUrl } });
  };

  const handlePageSizeChange = (newPageSize: number) => {
    navigate({ to: '/dashboard/timeline', search: { page: 1, limit: newPageSize, actor: actorFromUrl } });
  };

  // Get unique actors from events for filtering
  const uniqueActors = useMemo(() => {
    if (!events || events.length === 0) return [];
    const actorSet = new Set(events.map((e: Event) => e.actor));
    return Array.from(actorSet).sort() as string[];
  }, [events]);

  // Get unique element types from events
  const uniqueElementTypes = useMemo(() => {
    if (!events || events.length === 0) return [];
    const typeSet = new Set(events.map((e: Event) => e.elementType || inferElementType(e.elementId)));
    return Array.from(typeSet).sort() as string[];
  }, [events]);

  // Apply client-side filters
  const filteredEvents = useMemo(() => {
    if (!events || events.length === 0) return [];

    return events.filter((event: Event) => {
      // Actor filter (multi-select)
      if (filter.actors.length > 0 && !filter.actors.includes(event.actor)) {
        return false;
      }

      // Element type filter
      if (filter.elementTypes.length > 0) {
        const elementType = event.elementType || inferElementType(event.elementId);
        if (!filter.elementTypes.includes(elementType)) {
          return false;
        }
      }

      // Search filter
      if (filter.search) {
        const searchLower = filter.search.toLowerCase();
        const matchesId = event.elementId.toLowerCase().includes(searchLower);
        const matchesActor = event.actor.toLowerCase().includes(searchLower);
        const matchesSummary = generateEventSummary(event).toLowerCase().includes(searchLower);
        if (!matchesId && !matchesActor && !matchesSummary) {
          return false;
        }
      }

      // Jump to date filter
      if (filter.jumpToDate) {
        const eventDate = new Date(event.createdAt);
        const targetDate = new Date(filter.jumpToDate);
        // Show events from the target date and later (going back in time)
        eventDate.setHours(0, 0, 0, 0);
        targetDate.setHours(0, 0, 0, 0);
        if (eventDate > targetDate) {
          return false;
        }
      }

      return true;
    });
  }, [events, filter]);

  // Group events by time period
  const groupedEvents = useMemo(() => {
    const groups: Record<TimePeriod, Event[]> = {
      today: [],
      yesterday: [],
      thisWeek: [],
      earlier: [],
    };

    for (const event of filteredEvents) {
      const period = getTimePeriod(event.createdAt);
      groups[period].push(event);
    }

    return groups;
  }, [filteredEvents]);

  const toggleEventType = (eventType: EventType) => {
    setFilter((prev) => ({
      ...prev,
      eventTypes: prev.eventTypes.includes(eventType)
        ? prev.eventTypes.filter((t) => t !== eventType)
        : [...prev.eventTypes, eventType],
    }));
  };

  const clearFilters = () => {
    setFilter({ eventTypes: [], actors: [], elementTypes: [], search: '', jumpToDate: null });
  };

  const hasActiveFilters =
    filter.eventTypes.length > 0 ||
    filter.actors.length > 0 ||
    filter.elementTypes.length > 0 ||
    filter.search !== '' ||
    filter.jumpToDate !== null;

  const timePeriodOrder: TimePeriod[] = ['today', 'yesterday', 'thisWeek', 'earlier'];

  return (
    <div className="h-full flex flex-col" data-testid="timeline-page">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-medium text-gray-900">Timeline</h2>
          <p className="text-sm text-gray-500">Event history across all elements</p>
        </div>
        <div className="flex items-center gap-3">
          {/* TB116: View mode toggle */}
          <ViewModeToggle mode={viewMode} onChange={setViewMode} />
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="px-3 py-1.5 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors flex items-center gap-1.5"
              data-testid="clear-filters-button"
            >
              <X className="w-4 h-4" />
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Filter controls */}
      <div className="mb-4 space-y-3">
        {/* Search bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search events..."
            value={filter.search}
            onChange={(e) => setFilter((prev) => ({ ...prev, search: e.target.value }))}
            className="w-full pl-10 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            data-testid="search-input"
          />
        </div>

        {/* Filter chips row */}
        <div className="flex flex-wrap gap-2 items-center" data-testid="filter-chips">
          {/* Event type filter chips */}
          <div className="flex flex-wrap gap-1.5" data-testid="event-type-filters">
            {ALL_EVENT_TYPES.map(({ value, label, icon }) => {
              const colors = EVENT_TYPE_COLORS[value];
              return (
                <FilterChip
                  key={value}
                  label={label}
                  icon={icon}
                  active={filter.eventTypes.includes(value)}
                  onClick={() => toggleEventType(value)}
                  color={filter.eventTypes.includes(value) ? { bg: colors.bg, text: colors.text } : undefined}
                />
              );
            })}
          </div>

          {/* Separator */}
          <div className="h-6 w-px bg-gray-300 mx-1" />

          {/* Actor multi-select dropdown */}
          <MultiSelectDropdown
            label="Actors"
            icon={Users}
            options={uniqueActors}
            selected={filter.actors}
            onChange={(actors) => setFilter((prev) => ({ ...prev, actors }))}
            testId="actor-filter"
          />

          {/* Element type multi-select dropdown */}
          <MultiSelectDropdown
            label="Types"
            icon={ListTodo}
            options={uniqueElementTypes}
            selected={filter.elementTypes}
            onChange={(elementTypes) => setFilter((prev) => ({ ...prev, elementTypes }))}
            testId="element-type-filter"
          />

          {/* Jump to date picker */}
          <JumpToDatePicker
            value={filter.jumpToDate}
            onChange={(jumpToDate) => setFilter((prev) => ({ ...prev, jumpToDate }))}
          />
        </div>
      </div>

      {/* TB116: Conditional rendering based on view mode */}
      {viewMode === 'horizontal' ? (
        /* Horizontal Timeline View */
        <div className="flex-1 min-h-0 overflow-y-auto" data-testid="horizontal-timeline-container">
          <HorizontalTimeline events={filteredEvents} isLoading={isLoading} />
        </div>
      ) : (
        /* List View */
        <>
          {/* Event count */}
          <div className="mb-3 text-sm text-gray-500 flex items-center gap-2" data-testid="event-count">
            {isLoading ? (
              'Loading events...'
            ) : (
              <>
                <span>{filteredEvents.length} of {totalItems} events</span>
                {hasActiveFilters && (
                  <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full">(filtered)</span>
                )}
                {hasMore && (
                  <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full">more available</span>
                )}
              </>
            )}
          </div>

          {/* Events list with time period grouping */}
          <div className="flex-1 overflow-y-auto min-h-0 px-3 -mx-3" data-testid="events-list">
            {isLoading && (
              <div className="text-center py-8 text-gray-500">
                <div className="animate-pulse">Loading events...</div>
              </div>
            )}
            {isError && (
              <div className="text-center py-8 text-red-600">Failed to load events</div>
            )}
            {!isLoading && !isError && filteredEvents.length === 0 && (
              <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-lg">
                {hasActiveFilters ? 'No events match the current filters' : 'No events recorded yet'}
              </div>
            )}
            {!isLoading &&
              !isError &&
              filteredEvents.length > 0 &&
              timePeriodOrder.map((period, index) => (
                <TimePeriodGroup
                  key={period}
                  period={period}
                  events={groupedEvents[period]}
                  isFirst={index === 0 || timePeriodOrder.slice(0, index).every((p) => groupedEvents[p].length === 0)}
                />
              ))}

            {/* Pagination */}
            {!isLoading && !isError && totalPages > 1 && (
              <div className="mt-4 mb-2">
                <Pagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  totalItems={totalItems}
                  pageSize={pageSize}
                  onPageChange={handlePageChange}
                  onPageSizeChange={handlePageSizeChange}
                />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

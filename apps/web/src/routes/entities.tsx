/**
 * Entities Page
 *
 * Lists all entities with filtering by type and search functionality.
 * Includes detail panel with stats, activity timeline, and inbox.
 */

import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearch, useNavigate } from '@tanstack/react-router';
import { Search, Bot, User, Server, Users, X, CheckCircle, Clock, FileText, MessageSquare, ListTodo, Activity, Plus, Loader2, Pencil, Save, Power, PowerOff, Tag, Inbox, Mail, Archive, AtSign, CheckCheck, ChevronRight, GitBranch, ChevronDown, AlertCircle, RefreshCw, Reply, Paperclip, CornerUpLeft, Filter, ArrowUpDown, ArrowUp, ArrowDown, Calendar, History, Hash, Eye, EyeOff } from 'lucide-react';
import { Pagination } from '../components/shared/Pagination';
import { ElementNotFound } from '../components/shared/ElementNotFound';
import { VirtualizedList } from '../components/shared/VirtualizedList';
import { ContributionChart } from '../components/shared/ContributionChart';
import { useAllEntities as useAllEntitiesPreloaded } from '../api/hooks/useAllElements';
import { usePaginatedData, createEntityFilter } from '../hooks/usePaginatedData';
import { useDeepLink } from '../hooks/useDeepLink';
import { useKeyboardShortcut } from '../hooks';
import { groupByTimePeriod, TIME_PERIOD_LABELS, type TimePeriod, formatCompactTime } from '../lib';

interface Entity {
  id: string;
  type: 'entity';
  name: string;
  entityType: 'agent' | 'human' | 'system';
  publicKey?: string;
  active?: boolean;
  reportsTo?: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

interface EntityStats {
  assignedTaskCount: number;
  activeTaskCount: number;
  completedTaskCount: number;
  createdTaskCount: number;
  messageCount: number;
  documentCount: number;
}

interface Task {
  id: string;
  title: string;
  status: string;
  priority: number;
}

interface ElementalEvent {
  id: number;
  elementId: string;
  elementType: string;
  eventType: string;
  actor: string;
  oldValue?: unknown;
  newValue?: unknown;
  createdAt: string;
}

type EntityTypeFilter = 'all' | 'agent' | 'human' | 'system';

interface InboxItem {
  id: string;
  recipientId: string;
  messageId: string;
  channelId: string;
  sourceType: 'direct' | 'mention';
  status: 'unread' | 'read' | 'archived';
  readAt: string | null;
  createdAt: string;
  // Hydrated fields (optional)
  message?: {
    id: string;
    sender: string;
    contentRef: string;
    contentPreview?: string;
    fullContent?: string; // TB92: Full message content for rendering
    contentType?: string; // TB92: Content type (text, markdown, etc.)
    threadId?: string | null; // TB92: Parent message ID for threading
    createdAt: string;
  } | null;
  channel?: {
    id: string;
    name: string;
    channelType: 'group' | 'direct';
  } | null;
  sender?: Entity | null;
  // TB92: Hydrated attachments
  attachments?: {
    id: string;
    title: string;
    content?: string;
    contentType?: string;
  }[];
  // TB92: Thread parent message info
  threadParent?: {
    id: string;
    sender?: Entity | null;
    contentPreview: string;
    createdAt: string;
  } | null;
}

interface PaginatedResult<T> {
  items: T[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
}

const DEFAULT_PAGE_SIZE = 25;

// Reserved for future server-side pagination if needed
function _useEntities(
  page: number,
  pageSize: number = DEFAULT_PAGE_SIZE,
  typeFilter: EntityTypeFilter = 'all',
  searchQuery: string = ''
) {
  const offset = (page - 1) * pageSize;

  return useQuery<PaginatedResult<Entity>>({
    queryKey: ['entities', 'paginated', page, pageSize, typeFilter, searchQuery],
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: pageSize.toString(),
        offset: offset.toString(),
        orderBy: 'updated_at',
        orderDir: 'desc',
      });

      if (typeFilter !== 'all') {
        params.set('entityType', typeFilter);
      }

      if (searchQuery.trim()) {
        params.set('search', searchQuery.trim());
      }

      const response = await fetch(`/api/entities?${params}`);
      if (!response.ok) throw new Error('Failed to fetch entities');
      return response.json();
    },
  });
}
void _useEntities; // Suppress unused warning

function useEntity(id: string | null) {
  return useQuery<Entity>({
    queryKey: ['entities', id],
    queryFn: async () => {
      const response = await fetch(`/api/entities/${id}`);
      if (!response.ok) throw new Error('Failed to fetch entity');
      return response.json();
    },
    enabled: !!id,
  });
}

function useEntityByName(name: string | null) {
  return useQuery<Entity | null>({
    queryKey: ['entities', 'byName', name],
    queryFn: async () => {
      // Search for entities with exact name match
      // Use a large limit since server does client-side filtering on paginated results
      const response = await fetch(`/api/entities?search=${encodeURIComponent(name!)}&limit=1000`);
      if (!response.ok) throw new Error('Failed to fetch entity');
      const result: PaginatedResult<Entity> = await response.json();
      // Find exact match (case-insensitive)
      const entity = result.items.find(
        (e) => e.name.toLowerCase() === name!.toLowerCase()
      );
      return entity ?? null;
    },
    enabled: !!name,
  });
}

function useEntityStats(id: string | null) {
  return useQuery<EntityStats>({
    queryKey: ['entities', id, 'stats'],
    queryFn: async () => {
      const response = await fetch(`/api/entities/${id}/stats`);
      if (!response.ok) throw new Error('Failed to fetch entity stats');
      return response.json();
    },
    enabled: !!id,
  });
}

function useEntityTasks(id: string | null) {
  return useQuery<Task[]>({
    queryKey: ['entities', id, 'tasks'],
    queryFn: async () => {
      const response = await fetch(`/api/entities/${id}/tasks`);
      if (!response.ok) throw new Error('Failed to fetch entity tasks');
      return response.json();
    },
    enabled: !!id,
  });
}

function useEntityEvents(id: string | null) {
  return useQuery<ElementalEvent[]>({
    queryKey: ['entities', id, 'events'],
    queryFn: async () => {
      const response = await fetch(`/api/entities/${id}/events?limit=20`);
      if (!response.ok) throw new Error('Failed to fetch entity events');
      return response.json();
    },
    enabled: !!id,
  });
}

// TB108: Hook for entity activity data (contribution chart)
interface EntityActivity {
  entityId: string;
  startDate: string;
  endDate: string;
  totalEvents: number;
  activity: { date: string; count: number }[];
}

function useEntityActivity(id: string | null, days: number = 365) {
  return useQuery<EntityActivity>({
    queryKey: ['entities', id, 'activity', days],
    queryFn: async () => {
      const response = await fetch(`/api/entities/${id}/activity?days=${days}`);
      if (!response.ok) throw new Error('Failed to fetch entity activity');
      return response.json();
    },
    enabled: !!id,
  });
}

// TB110: Hook for entity history with pagination and event type filter
interface EntityHistoryResult {
  items: ElementalEvent[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
}

type HistoryEventTypeFilter = 'all' | 'created' | 'updated' | 'closed' | 'deleted';

// LocalStorage keys for persisting history preferences
const HISTORY_PAGE_SIZE_KEY = 'history.pageSize';
const HISTORY_EVENT_TYPE_KEY = 'history.eventType';

function getStoredHistoryPageSize(): number {
  try {
    const stored = localStorage.getItem(HISTORY_PAGE_SIZE_KEY);
    if (stored) {
      const num = parseInt(stored, 10);
      if (!isNaN(num) && num > 0 && num <= 100) return num;
    }
  } catch {
    // localStorage not available
  }
  return 25; // Default
}

function _setStoredHistoryPageSize(size: number): void {
  try {
    localStorage.setItem(HISTORY_PAGE_SIZE_KEY, size.toString());
  } catch {
    // localStorage not available
  }
}
void _setStoredHistoryPageSize; // Reserved for future use when page size selector is added

function getStoredHistoryEventType(): HistoryEventTypeFilter {
  try {
    const stored = localStorage.getItem(HISTORY_EVENT_TYPE_KEY);
    if (stored === 'all' || stored === 'created' || stored === 'updated' || stored === 'closed' || stored === 'deleted') {
      return stored;
    }
  } catch {
    // localStorage not available
  }
  return 'all'; // Default
}

function setStoredHistoryEventType(type: HistoryEventTypeFilter): void {
  try {
    localStorage.setItem(HISTORY_EVENT_TYPE_KEY, type);
  } catch {
    // localStorage not available
  }
}

function useEntityHistory(
  id: string | null,
  page: number = 1,
  pageSize: number = 25,
  eventType: HistoryEventTypeFilter = 'all'
) {
  const offset = (page - 1) * pageSize;

  return useQuery<EntityHistoryResult>({
    queryKey: ['entities', id, 'history', page, pageSize, eventType],
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: pageSize.toString(),
        offset: offset.toString(),
      });

      if (eventType !== 'all') {
        params.set('eventType', eventType);
      }

      const response = await fetch(`/api/entities/${id}/history?${params}`);
      if (!response.ok) throw new Error('Failed to fetch entity history');
      return response.json();
    },
    enabled: !!id,
  });
}

type InboxViewType = 'unread' | 'all' | 'archived';

// TB93: Filter and sort types for inbox
type InboxSourceFilter = 'all' | 'direct' | 'mention';
type InboxSortOrder = 'newest' | 'oldest' | 'sender';

// LocalStorage keys for persisting inbox preferences
const INBOX_VIEW_STORAGE_KEY = 'inbox.view';
const INBOX_SOURCE_FILTER_KEY = 'inbox.sourceFilter';
const INBOX_SORT_ORDER_KEY = 'inbox.sortOrder';

function getStoredInboxView(): InboxViewType {
  try {
    const stored = localStorage.getItem(INBOX_VIEW_STORAGE_KEY);
    if (stored === 'unread' || stored === 'all' || stored === 'archived') {
      return stored;
    }
  } catch {
    // localStorage not available
  }
  return 'all'; // Default to all
}

function setStoredInboxView(view: InboxViewType): void {
  try {
    localStorage.setItem(INBOX_VIEW_STORAGE_KEY, view);
  } catch {
    // localStorage not available
  }
}

// TB93: Get stored source filter
function getStoredSourceFilter(): InboxSourceFilter {
  try {
    const stored = localStorage.getItem(INBOX_SOURCE_FILTER_KEY);
    if (stored === 'all' || stored === 'direct' || stored === 'mention') {
      return stored;
    }
  } catch {
    // localStorage not available
  }
  return 'all'; // Default to all
}

// TB93: Set stored source filter
function setStoredSourceFilter(filter: InboxSourceFilter): void {
  try {
    localStorage.setItem(INBOX_SOURCE_FILTER_KEY, filter);
  } catch {
    // localStorage not available
  }
}

// TB93: Get stored sort order
function getStoredSortOrder(): InboxSortOrder {
  try {
    const stored = localStorage.getItem(INBOX_SORT_ORDER_KEY);
    if (stored === 'newest' || stored === 'oldest' || stored === 'sender') {
      return stored;
    }
  } catch {
    // localStorage not available
  }
  return 'newest'; // Default to newest first
}

// TB93: Set stored sort order
function setStoredSortOrder(order: InboxSortOrder): void {
  try {
    localStorage.setItem(INBOX_SORT_ORDER_KEY, order);
  } catch {
    // localStorage not available
  }
}

function useEntityInbox(id: string | null, view: InboxViewType = 'all') {
  return useQuery<PaginatedResult<InboxItem>>({
    queryKey: ['entities', id, 'inbox', view],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '50', hydrate: 'true' });
      // For 'all' view, we fetch both unread and read (but not archived)
      // For 'unread' view, we fetch only unread
      // For 'archived' view, we fetch only archived
      if (view === 'unread') {
        params.set('status', 'unread');
      } else if (view === 'archived') {
        params.set('status', 'archived');
      } else {
        // For 'all', fetch unread and read (exclude archived)
        params.set('status', 'unread,read');
      }
      const response = await fetch(`/api/entities/${id}/inbox?${params}`);
      if (!response.ok) throw new Error('Failed to fetch inbox');
      return response.json();
    },
    enabled: !!id,
  });
}

function useEntityInboxCount(id: string | null) {
  return useQuery<{ count: number }>({
    queryKey: ['entities', id, 'inbox', 'count'],
    queryFn: async () => {
      const response = await fetch(`/api/entities/${id}/inbox/count`);
      if (!response.ok) throw new Error('Failed to fetch inbox count');
      return response.json();
    },
    enabled: !!id,
  });
}

// Get count for a specific view (for archived count display)
function useEntityInboxViewCount(id: string | null, status: 'archived') {
  return useQuery<PaginatedResult<InboxItem>>({
    queryKey: ['entities', id, 'inbox', status, 'count'],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '1', status });
      const response = await fetch(`/api/entities/${id}/inbox?${params}`);
      if (!response.ok) throw new Error('Failed to fetch inbox count');
      return response.json();
    },
    enabled: !!id,
    // Only need total count, not full data
    select: (data) => data,
  });
}

function useMarkInboxRead(entityId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ itemId, status }: { itemId: string; status: 'read' | 'unread' | 'archived' }) => {
      const response = await fetch(`/api/inbox/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) throw new Error('Failed to update inbox item');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['entities', entityId, 'inbox'] });
    },
  });
}

function useMarkAllInboxRead(entityId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/entities/${entityId}/inbox/mark-all-read`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error('Failed to mark all as read');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['entities', entityId, 'inbox'] });
    },
  });
}

function useAllEntities(search: string = '') {
  return useQuery<PaginatedResult<Entity>>({
    queryKey: ['entities', 'all', search],
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: '100',
        orderBy: 'name',
        orderDir: 'asc',
      });
      if (search.trim()) {
        params.set('search', search.trim());
      }
      const response = await fetch(`/api/entities?${params}`);
      if (!response.ok) throw new Error('Failed to fetch entities');
      return response.json();
    },
  });
}

function useEntityDirectReports(id: string | null) {
  return useQuery<Entity[]>({
    queryKey: ['entities', id, 'reports'],
    queryFn: async () => {
      const response = await fetch(`/api/entities/${id}/reports`);
      if (!response.ok) throw new Error('Failed to fetch direct reports');
      return response.json();
    },
    enabled: !!id,
  });
}

function useEntityManagementChain(id: string | null) {
  return useQuery<Entity[]>({
    queryKey: ['entities', id, 'chain'],
    queryFn: async () => {
      const response = await fetch(`/api/entities/${id}/chain`);
      if (!response.ok) throw new Error('Failed to fetch management chain');
      return response.json();
    },
    enabled: !!id,
  });
}

function useSetEntityManager(entityId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (managerId: string | null) => {
      const response = await fetch(`/api/entities/${entityId}/manager`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ managerId }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to set manager');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['entities'] });
      queryClient.invalidateQueries({ queryKey: ['entities', entityId] });
      queryClient.invalidateQueries({ queryKey: ['entities', entityId, 'chain'] });
      // Also invalidate the old manager's reports if there was one
      queryClient.invalidateQueries({ queryKey: ['entities', undefined, 'reports'] });
    },
  });
}

interface CreateEntityInput {
  name: string;
  entityType: 'agent' | 'human' | 'system';
  publicKey?: string;
  tags?: string[];
  createdBy?: string;
}

function useCreateEntity() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateEntityInput) => {
      const response = await fetch('/api/entities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to create entity');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['entities'] });
    },
  });
}

interface UpdateEntityInput {
  name?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  active?: boolean;
}

function useUpdateEntity(entityId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateEntityInput) => {
      const response = await fetch(`/api/entities/${entityId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to update entity');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['entities'] });
      queryClient.invalidateQueries({ queryKey: ['entities', entityId] });
      queryClient.invalidateQueries({ queryKey: ['entities', entityId, 'stats'] });
    },
  });
}

const ENTITY_TYPE_OPTIONS = [
  { value: 'agent', label: 'Agent', description: 'AI agent - automated actors performing work', icon: Bot },
  { value: 'human', label: 'Human', description: 'Human user - manual actors in the system', icon: User },
  { value: 'system', label: 'System', description: 'System process - automated infrastructure', icon: Server },
] as const;

function RegisterEntityModal({
  isOpen,
  onClose,
  onSuccess,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (entity: Entity) => void;
}) {
  const [name, setName] = useState('');
  const [entityType, setEntityType] = useState<'agent' | 'human' | 'system'>('agent');
  const [publicKey, setPublicKey] = useState('');
  const [tags, setTags] = useState('');

  const nameInputRef = useRef<HTMLInputElement>(null);
  const createEntity = useCreateEntity();

  // Focus name input when modal opens
  useEffect(() => {
    if (isOpen && nameInputRef.current) {
      nameInputRef.current.focus();
    }
  }, [isOpen]);

  // Reset form when modal closes
  useEffect(() => {
    if (!isOpen) {
      setName('');
      setEntityType('agent');
      setPublicKey('');
      setTags('');
      createEntity.reset();
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) return;

    const input: CreateEntityInput = {
      name: name.trim(),
      entityType,
    };

    if (publicKey.trim()) {
      input.publicKey = publicKey.trim();
    }

    if (tags.trim()) {
      input.tags = tags.split(',').map((t) => t.trim()).filter(Boolean);
    }

    try {
      const result = await createEntity.mutateAsync(input);
      onSuccess?.(result);
      onClose();
    } catch {
      // Error is handled by mutation state
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50" data-testid="register-entity-modal" onKeyDown={handleKeyDown}>
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        data-testid="register-entity-modal-backdrop"
      />

      {/* Dialog */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden flex flex-col max-h-full">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Register Entity</h2>
            <button
              onClick={onClose}
              className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
              aria-label="Close"
              data-testid="register-entity-modal-close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-4 overflow-auto flex-1">
            {/* Name */}
            <div className="mb-4">
              <label htmlFor="entity-name" className="block text-sm font-medium text-gray-700 mb-1">
                Name <span className="text-red-500">*</span>
              </label>
              <input
                ref={nameInputRef}
                id="entity-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter entity name..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                data-testid="register-entity-name-input"
                required
              />
              <p className="mt-1 text-xs text-gray-500">
                Must start with a letter, followed by alphanumeric characters, hyphens, or underscores
              </p>
            </div>

            {/* Entity Type */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Type <span className="text-red-500">*</span>
              </label>
              <div className="space-y-2" data-testid="register-entity-type-options">
                {ENTITY_TYPE_OPTIONS.map((option) => {
                  const Icon = option.icon;
                  return (
                    <label
                      key={option.value}
                      className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                        entityType === option.value
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                      data-testid={`register-entity-type-${option.value}`}
                    >
                      <input
                        type="radio"
                        name="entityType"
                        value={option.value}
                        checked={entityType === option.value}
                        onChange={() => setEntityType(option.value)}
                        className="sr-only"
                      />
                      <Icon className={`w-5 h-5 ${entityType === option.value ? 'text-blue-600' : 'text-gray-400'}`} />
                      <div>
                        <div className={`font-medium ${entityType === option.value ? 'text-blue-900' : 'text-gray-900'}`}>
                          {option.label}
                        </div>
                        <div className="text-xs text-gray-500">{option.description}</div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Public Key (optional) */}
            <div className="mb-4">
              <label htmlFor="entity-public-key" className="block text-sm font-medium text-gray-700 mb-1">
                Public Key <span className="text-gray-400">(optional)</span>
              </label>
              <textarea
                id="entity-public-key"
                value={publicKey}
                onChange={(e) => setPublicKey(e.target.value)}
                placeholder="Ed25519 public key, base64 encoded..."
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                data-testid="register-entity-public-key-input"
              />
            </div>

            {/* Tags (optional) */}
            <div className="mb-4">
              <label htmlFor="entity-tags" className="block text-sm font-medium text-gray-700 mb-1">
                Tags <span className="text-gray-400">(optional)</span>
              </label>
              <input
                id="entity-tags"
                type="text"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="Enter tags separated by commas..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                data-testid="register-entity-tags-input"
              />
            </div>

            {/* Error */}
            {createEntity.isError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-600" data-testid="register-entity-error">
                {createEntity.error.message}
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
                data-testid="register-entity-cancel"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!name.trim() || createEntity.isPending}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                data-testid="register-entity-submit"
              >
                {createEntity.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    Register Entity
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

const ENTITY_TYPE_STYLES: Record<string, { bg: string; text: string; icon: typeof Bot }> = {
  agent: { bg: 'bg-purple-100', text: 'text-purple-800', icon: Bot },
  human: { bg: 'bg-blue-100', text: 'text-blue-800', icon: User },
  system: { bg: 'bg-gray-100', text: 'text-gray-800', icon: Server },
};

const FILTER_TABS: { value: EntityTypeFilter; label: string; icon: typeof Users }[] = [
  { value: 'all', label: 'All', icon: Users },
  { value: 'agent', label: 'Agents', icon: Bot },
  { value: 'human', label: 'Humans', icon: User },
  { value: 'system', label: 'Systems', icon: Server },
];

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-blue-100 text-blue-800',
  in_progress: 'bg-yellow-100 text-yellow-800',
  blocked: 'bg-red-100 text-red-800',
  closed: 'bg-green-100 text-green-800',
};

const PRIORITY_COLORS: Record<number, string> = {
  1: 'text-red-600',
  2: 'text-orange-600',
  3: 'text-yellow-600',
  4: 'text-green-600',
  5: 'text-gray-500',
};

function EntityCard({
  entity,
  isSelected,
  onClick,
}: {
  entity: Entity;
  isSelected: boolean;
  onClick: () => void;
}) {
  const styles = ENTITY_TYPE_STYLES[entity.entityType] || ENTITY_TYPE_STYLES.system;
  const Icon = styles.icon;
  const isActive = entity.active !== false;

  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-lg border p-4 transition-colors cursor-pointer ${
        isSelected
          ? 'border-blue-500 ring-2 ring-blue-200'
          : 'border-gray-200 hover:border-gray-300'
      } ${!isActive ? 'opacity-60' : ''}`}
      data-testid={`entity-card-${entity.id}`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`w-10 h-10 rounded-full flex items-center justify-center ${styles.bg}`}
          data-testid={`entity-avatar-${entity.id}`}
        >
          <Icon className={`w-5 h-5 ${styles.text}`} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-gray-900 truncate">{entity.name}</h3>
            {!isActive && (
              <span className="px-1.5 py-0.5 text-xs font-medium bg-gray-100 text-gray-600 rounded">
                Inactive
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 font-mono truncate">{entity.id}</p>
        </div>

        <span
          className={`px-2 py-1 text-xs font-medium rounded ${styles.bg} ${styles.text}`}
          data-testid={`entity-type-badge-${entity.id}`}
        >
          {entity.entityType}
        </span>
      </div>

      {entity.tags && entity.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {entity.tags.slice(0, 3).map((tag) => (
            <span key={tag} className="px-1.5 py-0.5 text-xs bg-gray-100 text-gray-600 rounded">
              {tag}
            </span>
          ))}
          {entity.tags.length > 3 && (
            <span className="text-xs text-gray-500">+{entity.tags.length - 3}</span>
          )}
        </div>
      )}

      <div className="mt-3 text-xs text-gray-400">
        Created {new Date(entity.createdAt).toLocaleDateString()}
      </div>
    </div>
  );
}

function FilterTabs({
  selected,
  onChange,
  counts,
}: {
  selected: EntityTypeFilter;
  onChange: (value: EntityTypeFilter) => void;
  counts: Record<EntityTypeFilter, number>;
}) {
  return (
    <div className="flex gap-1 p-1 bg-gray-100 rounded-lg" data-testid="entity-filter-tabs">
      {FILTER_TABS.map((tab) => {
        const Icon = tab.icon;
        const isSelected = selected === tab.value;
        return (
          <button
            key={tab.value}
            onClick={() => onChange(tab.value)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              isSelected
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            }`}
            data-testid={`entity-filter-${tab.value}`}
          >
            <Icon className="w-4 h-4" />
            <span>{tab.label}</span>
            <span
              className={`ml-1 px-1.5 py-0.5 text-xs rounded-full ${
                isSelected ? 'bg-gray-100 text-gray-600' : 'bg-gray-200 text-gray-500'
              }`}
            >
              {counts[tab.value]}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function SearchBox({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="relative" data-testid="entity-search">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search entities..."
        className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        data-testid="entity-search-input"
      />
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  color = 'text-gray-600',
}: {
  icon: typeof ListTodo;
  label: string;
  value: number;
  color?: string;
}) {
  return (
    <div className="bg-gray-50 rounded-lg p-3">
      <div className="flex items-center gap-2 mb-1">
        <Icon className={`w-4 h-4 ${color}`} />
        <span className="text-xs text-gray-500">{label}</span>
      </div>
      <span className="text-lg font-semibold text-gray-900">{value}</span>
    </div>
  );
}

function TaskMiniCard({ task, onClick }: { task: Task; onClick?: (taskId: string) => void }) {
  const statusColor = STATUS_COLORS[task.status] || STATUS_COLORS.open;
  const priorityColor = PRIORITY_COLORS[task.priority] || PRIORITY_COLORS[3];

  const handleClick = () => {
    if (onClick) {
      onClick(task.id);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.key === 'Enter' || e.key === ' ') && onClick) {
      e.preventDefault();
      onClick(task.id);
    }
  };

  return (
    <div
      className={`bg-white border border-gray-100 rounded p-2 ${
        onClick
          ? 'cursor-pointer hover:border-blue-300 hover:bg-blue-50/50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 transition-colors'
          : 'hover:border-gray-200'
      }`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      data-testid={`task-mini-card-${task.id}`}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className={`px-1.5 py-0.5 text-xs font-medium rounded ${statusColor}`}>
          {task.status.replace('_', ' ')}
        </span>
        <span className={`text-xs font-medium ${priorityColor}`}>P{task.priority}</span>
      </div>
      <p className="text-sm text-gray-900 line-clamp-2">{task.title}</p>
    </div>
  );
}

/**
 * TB109: Enhanced ActivityFeedItem component for entity activity overview
 * Shows recent events with icons, descriptions, and timestamps
 */
function ActivityFeedItem({ event }: { event: ElementalEvent }) {
  // Get appropriate icon based on event type and element type
  const getEventIcon = () => {
    // First check element type for specific icons
    const elementType = event.elementType || '';

    // Event-specific icons take precedence for certain actions
    switch (event.eventType) {
      case 'closed':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'created':
        return <Plus className="w-4 h-4 text-green-500" />;
      case 'deleted':
        return <X className="w-4 h-4 text-red-500" />;
      case 'updated':
        // Use element type icon for updates
        break;
      default:
        break;
    }

    // Element type specific icons
    switch (elementType) {
      case 'task':
        return <ListTodo className="w-4 h-4 text-blue-500" />;
      case 'message':
        return <MessageSquare className="w-4 h-4 text-purple-500" />;
      case 'document':
        return <FileText className="w-4 h-4 text-yellow-600" />;
      case 'entity':
        return <User className="w-4 h-4 text-gray-500" />;
      case 'team':
        return <Users className="w-4 h-4 text-indigo-500" />;
      default:
        return <Activity className="w-4 h-4 text-gray-400" />;
    }
  };

  // Get icon background color
  const getIconBg = () => {
    switch (event.eventType) {
      case 'closed':
        return 'bg-green-100';
      case 'created':
        return 'bg-green-100';
      case 'deleted':
        return 'bg-red-100';
      default:
        break;
    }

    const elementType = event.elementType || '';
    switch (elementType) {
      case 'task':
        return 'bg-blue-100';
      case 'message':
        return 'bg-purple-100';
      case 'document':
        return 'bg-yellow-100';
      case 'entity':
        return 'bg-gray-100';
      case 'team':
        return 'bg-indigo-100';
      default:
        return 'bg-gray-100';
    }
  };

  // Generate human-readable description
  const getDescription = () => {
    const elementType = event.elementType || 'item';
    const eventType = event.eventType;

    // Special case handling for common patterns
    if (eventType === 'closed' && elementType === 'task') {
      return 'Completed task';
    }
    if (eventType === 'created' && elementType === 'message') {
      return 'Sent message';
    }
    if (eventType === 'updated' && elementType === 'document') {
      return 'Edited document';
    }
    if (eventType === 'created' && elementType === 'task') {
      return 'Created task';
    }
    if (eventType === 'created' && elementType === 'document') {
      return 'Created document';
    }

    // Default pattern: "Event type + element type"
    const action = eventType.replace(/_/g, ' ');
    return `${action.charAt(0).toUpperCase() + action.slice(1)} ${elementType}`;
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="flex items-start gap-3 py-2.5" data-testid={`activity-item-${event.id}`}>
      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${getIconBg()}`}>
        {getEventIcon()}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-900">
          {getDescription()}
        </p>
        <p className="text-xs text-gray-500 font-mono truncate">{event.elementId}</p>
      </div>
      <span className="text-xs text-gray-400 whitespace-nowrap">{formatTime(event.createdAt)}</span>
    </div>
  );
}

/**
 * TB110: HistoryEventItem component - Git commit log style display
 * Shows event ID (hash), description, timestamp, and expandable details
 */
function HistoryEventItem({
  event,
  isExpanded,
  onToggle,
}: {
  event: ElementalEvent;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  // Generate a short hash from the event ID
  const shortHash = `${event.id}`.padStart(7, '0').slice(0, 7);

  // Get event color based on event type
  const getEventColor = () => {
    switch (event.eventType) {
      case 'created':
        return 'text-green-600';
      case 'updated':
        return 'text-blue-600';
      case 'closed':
        return 'text-purple-600';
      case 'deleted':
        return 'text-red-600';
      case 'reopened':
        return 'text-yellow-600';
      default:
        return 'text-gray-600';
    }
  };

  // Generate commit-style message
  const getMessage = () => {
    const elementType = event.elementType || 'element';
    const eventType = event.eventType;

    // Handle common event types with meaningful messages
    switch (eventType) {
      case 'created':
        return `Create ${elementType}`;
      case 'updated':
        return `Update ${elementType}`;
      case 'closed':
        return elementType === 'task' ? 'Complete task' : `Close ${elementType}`;
      case 'deleted':
        return `Delete ${elementType}`;
      case 'reopened':
        return `Reopen ${elementType}`;
      case 'added_dependency':
        return `Add dependency`;
      case 'removed_dependency':
        return `Remove dependency`;
      case 'auto_blocked':
        return `Auto-blocked by dependency`;
      case 'auto_unblocked':
        return `Auto-unblocked (dependency resolved)`;
      default:
        return eventType.replace(/_/g, ' ');
    }
  };

  // Format timestamp
  const formatTimestamp = () => {
    const date = new Date(event.createdAt);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / 86400000);

    if (days === 0) {
      return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    }
    if (days < 7) {
      return `${days} day${days === 1 ? '' : 's'} ago`;
    }
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    });
  };

  // Format old/new values for display
  const formatValue = (value: unknown): string => {
    if (value === null || value === undefined) return '(none)';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (Array.isArray(value)) return value.join(', ') || '(empty)';
    if (typeof value === 'object') return JSON.stringify(value, null, 2);
    return String(value);
  };

  // Get changed fields
  const getChangedFields = () => {
    const changes: { field: string; oldValue: string; newValue: string }[] = [];

    const oldValue = event.oldValue as Record<string, unknown> | null;
    const newValue = event.newValue as Record<string, unknown> | null;

    if (!oldValue && newValue) {
      // Created - show new values
      Object.entries(newValue).forEach(([key, value]) => {
        if (key !== 'id' && key !== 'createdAt' && key !== 'updatedAt') {
          changes.push({ field: key, oldValue: '(none)', newValue: formatValue(value) });
        }
      });
    } else if (oldValue && newValue) {
      // Updated - show differences
      const allKeys = new Set([...Object.keys(oldValue), ...Object.keys(newValue)]);
      allKeys.forEach((key) => {
        if (key !== 'updatedAt') {
          const oldVal = oldValue[key];
          const newVal = newValue[key];
          if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
            changes.push({
              field: key,
              oldValue: formatValue(oldVal),
              newValue: formatValue(newVal),
            });
          }
        }
      });
    } else if (oldValue && !newValue) {
      // Deleted - show old values
      Object.entries(oldValue).forEach(([key, value]) => {
        if (key !== 'id' && key !== 'createdAt' && key !== 'updatedAt') {
          changes.push({ field: key, oldValue: formatValue(value), newValue: '(deleted)' });
        }
      });
    }

    return changes;
  };

  const changes = isExpanded ? getChangedFields() : [];

  return (
    <div
      className="border-l-2 border-gray-200 pl-4 py-3 hover:bg-gray-50 transition-colors"
      data-testid={`history-item-${event.id}`}
    >
      {/* Main row - commit log style */}
      <div className="flex items-start gap-3">
        {/* Hash (event ID) */}
        <button
          onClick={onToggle}
          className="flex-shrink-0 font-mono text-xs bg-gray-100 px-2 py-0.5 rounded text-gray-600 hover:bg-gray-200 transition-colors"
          title={`Event ID: ${event.id}`}
          data-testid={`history-hash-${event.id}`}
        >
          <Hash className="w-3 h-3 inline mr-1" />
          {shortHash}
        </button>

        {/* Message */}
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium ${getEventColor()}`}>
            {getMessage()}
          </p>
          <p className="text-xs text-gray-500 font-mono truncate" title={event.elementId}>
            {event.elementId}
          </p>
        </div>

        {/* Timestamp */}
        <span className="flex-shrink-0 text-xs text-gray-400" title={new Date(event.createdAt).toLocaleString()}>
          {formatTimestamp()}
        </span>

        {/* Expand/collapse button */}
        <button
          onClick={onToggle}
          className="flex-shrink-0 p-1 text-gray-400 hover:text-gray-600 rounded transition-colors"
          title={isExpanded ? 'Hide details' : 'Show details'}
          data-testid={`history-toggle-${event.id}`}
        >
          {isExpanded ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>

      {/* Expanded details - git diff style */}
      {isExpanded && changes.length > 0 && (
        <div className="mt-3 bg-gray-50 rounded border border-gray-200 overflow-hidden" data-testid={`history-details-${event.id}`}>
          <div className="px-3 py-1.5 bg-gray-100 border-b border-gray-200 text-xs text-gray-600 font-medium">
            Changes ({changes.length})
          </div>
          <div className="divide-y divide-gray-200">
            {changes.slice(0, 10).map((change, index) => (
              <div key={index} className="px-3 py-2 text-xs">
                <div className="font-medium text-gray-700 mb-1">{change.field}</div>
                {change.oldValue !== '(none)' && change.oldValue !== '(deleted)' && (
                  <div className="flex items-start gap-2 text-red-600 bg-red-50 px-2 py-1 rounded mb-1">
                    <span className="font-mono">-</span>
                    <span className="break-all font-mono">{change.oldValue}</span>
                  </div>
                )}
                {change.newValue !== '(none)' && change.newValue !== '(deleted)' && (
                  <div className="flex items-start gap-2 text-green-600 bg-green-50 px-2 py-1 rounded">
                    <span className="font-mono">+</span>
                    <span className="break-all font-mono">{change.newValue}</span>
                  </div>
                )}
              </div>
            ))}
            {changes.length > 10 && (
              <div className="px-3 py-2 text-xs text-gray-500 italic">
                +{changes.length - 10} more fields
              </div>
            )}
          </div>
        </div>
      )}

      {/* Message if no details */}
      {isExpanded && changes.length === 0 && (
        <div className="mt-2 text-xs text-gray-400 italic pl-10">
          No detailed changes recorded
        </div>
      )}
    </div>
  );
}

// Event type filter options for history
const HISTORY_EVENT_TYPE_OPTIONS: { value: HistoryEventTypeFilter; label: string }[] = [
  { value: 'all', label: 'All Events' },
  { value: 'created', label: 'Created' },
  { value: 'updated', label: 'Updated' },
  { value: 'closed', label: 'Closed' },
  { value: 'deleted', label: 'Deleted' },
];

// Legacy card component - kept for reference but replaced by InboxMessageListItem + InboxMessageContent split layout (TB91)
function _InboxItemCard({
  item,
  onMarkRead,
  onMarkUnread,
  onArchive,
  onRestore,
  isPending,
  onNavigateToMessage,
}: {
  item: InboxItem;
  onMarkRead: () => void;
  onMarkUnread: () => void;
  onArchive: () => void;
  onRestore: () => void;
  isPending: boolean;
  onNavigateToMessage: () => void;
}) {
  const isUnread = item.status === 'unread';
  const isArchived = item.status === 'archived';

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  };

  // Get sender info from hydrated data
  const senderName = item.sender?.name ?? 'Unknown';
  const senderType = item.sender?.entityType ?? 'agent';
  const channelName = item.channel?.name ?? item.channelId;
  const messagePreview = item.message?.contentPreview ?? '';

  // Avatar icon based on entity type
  const getAvatarIcon = () => {
    switch (senderType) {
      case 'agent': return <Bot className="w-4 h-4" />;
      case 'human': return <User className="w-4 h-4" />;
      case 'system': return <Server className="w-4 h-4" />;
      default: return <User className="w-4 h-4" />;
    }
  };

  const getAvatarColors = () => {
    switch (senderType) {
      case 'agent': return 'bg-purple-100 text-purple-600';
      case 'human': return 'bg-blue-100 text-blue-600';
      case 'system': return 'bg-gray-100 text-gray-600';
      default: return 'bg-gray-100 text-gray-600';
    }
  };

  const handleCardClick = (e: React.MouseEvent) => {
    // Don't navigate if clicking on action buttons
    if ((e.target as HTMLElement).closest('button')) {
      return;
    }
    onNavigateToMessage();
  };

  return (
    <div
      onClick={handleCardClick}
      className={`bg-white border rounded-lg p-3 transition-colors cursor-pointer hover:shadow-sm ${
        isUnread ? 'border-blue-200 bg-blue-50/50' : 'border-gray-100 hover:border-gray-200'
      } ${isArchived ? 'opacity-50' : ''}`}
      data-testid={`inbox-item-${item.id}`}
    >
      <div className="flex items-start gap-3">
        {/* Sender Avatar */}
        <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${getAvatarColors()}`} data-testid={`inbox-item-avatar-${item.id}`}>
          {getAvatarIcon()}
        </div>

        <div className="flex-1 min-w-0">
          {/* Header: sender name, source badge, timestamp */}
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium text-gray-900 truncate" data-testid={`inbox-item-sender-${item.id}`}>
              {senderName}
            </span>
            <span
              className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 text-xs font-medium rounded flex-shrink-0 ${
                item.sourceType === 'mention'
                  ? 'bg-purple-100 text-purple-700'
                  : 'bg-blue-100 text-blue-700'
              }`}
              data-testid={`inbox-item-source-${item.id}`}
            >
              {item.sourceType === 'mention' ? (
                <>
                  <AtSign className="w-3 h-3" />
                  Mention
                </>
              ) : (
                <>
                  <MessageSquare className="w-3 h-3" />
                  Direct
                </>
              )}
            </span>
            <span className="text-xs text-gray-400 flex-shrink-0" data-testid={`inbox-item-time-${item.id}`}>{formatTime(item.createdAt)}</span>
            {isUnread && (
              <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" data-testid={`inbox-item-unread-indicator-${item.id}`} title="Unread" />
            )}
          </div>

          {/* Channel name */}
          <div className="flex items-center gap-1 mb-1">
            <span className="text-xs text-gray-500" data-testid={`inbox-item-channel-${item.id}`}>
              in <span className="font-medium">{channelName}</span>
            </span>
          </div>

          {/* Message preview */}
          {messagePreview && (
            <p className="text-sm text-gray-600 line-clamp-2" data-testid={`inbox-item-preview-${item.id}`}>
              {messagePreview}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {isPending ? (
            <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
          ) : (
            <>
              {isArchived ? (
                <button
                  onClick={onRestore}
                  className="p-1 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded transition-colors"
                  title="Restore"
                  data-testid={`inbox-restore-${item.id}`}
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              ) : (
                <>
                  {isUnread ? (
                    <button
                      onClick={onMarkRead}
                      className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                      title="Mark as read"
                      data-testid={`inbox-mark-read-${item.id}`}
                    >
                      <CheckCheck className="w-4 h-4" />
                    </button>
                  ) : (
                    <button
                      onClick={onMarkUnread}
                      className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                      title="Mark as unread"
                      data-testid={`inbox-mark-unread-${item.id}`}
                    >
                      <Mail className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={onArchive}
                    className="p-1 text-gray-400 hover:text-orange-600 hover:bg-orange-50 rounded transition-colors"
                    title="Archive"
                    data-testid={`inbox-archive-${item.id}`}
                  >
                    <Archive className="w-4 h-4" />
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
void _InboxItemCard; // Suppress unused warning - kept for reference

/**
 * TB94: Time period sticky header for inbox list grouping
 * Shows the time period label (Today, Yesterday, This Week, Earlier)
 */
function InboxTimePeriodHeader({ period }: { period: TimePeriod }) {
  return (
    <div
      className="sticky top-0 z-10 px-3 py-1.5 bg-gray-100 border-b border-gray-200 flex items-center gap-2"
      data-testid={`inbox-time-period-${period}`}
    >
      <Calendar className="w-3 h-3 text-gray-500" />
      <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
        {TIME_PERIOD_LABELS[period]}
      </span>
    </div>
  );
}

/**
 * TB91: Compact message list item for the left side of split layout
 * TB94: Updated with relative time display that updates periodically
 * Shows: avatar, sender name, preview (first line), time ago, unread indicator
 */
function InboxMessageListItem({
  item,
  isSelected,
  onSelect,
  formattedTime,
}: {
  item: InboxItem;
  isSelected: boolean;
  onSelect: () => void;
  formattedTime?: string; // TB94: Pre-formatted time for periodic updates
}) {
  const isUnread = item.status === 'unread';

  // TB94: Use pre-formatted time if provided, otherwise format locally
  const displayTime = formattedTime ?? formatCompactTime(item.createdAt);

  const senderName = item.sender?.name ?? 'Unknown';
  const senderType = item.sender?.entityType ?? 'agent';
  const messagePreview = item.message?.contentPreview ?? '';
  // Get first line only for compact preview
  const firstLine = messagePreview.split('\n')[0]?.slice(0, 50) || '';

  const getAvatarIcon = () => {
    switch (senderType) {
      case 'agent': return <Bot className="w-3 h-3" />;
      case 'human': return <User className="w-3 h-3" />;
      case 'system': return <Server className="w-3 h-3" />;
      default: return <User className="w-3 h-3" />;
    }
  };

  const getAvatarColors = () => {
    switch (senderType) {
      case 'agent': return 'bg-purple-100 text-purple-600';
      case 'human': return 'bg-blue-100 text-blue-600';
      case 'system': return 'bg-gray-100 text-gray-600';
      default: return 'bg-gray-100 text-gray-600';
    }
  };

  return (
    <button
      onClick={onSelect}
      className={`w-full text-left px-3 py-2 flex items-start gap-2 transition-colors border-b border-gray-100 ${
        isSelected
          ? 'bg-blue-50 border-l-2 border-l-blue-500'
          : isUnread
          ? 'bg-white hover:bg-gray-50'
          : 'bg-gray-50/50 hover:bg-gray-100/50'
      }`}
      data-testid={`inbox-list-item-${item.id}`}
    >
      {/* Avatar */}
      <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${getAvatarColors()}`}>
        {getAvatarIcon()}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className={`text-sm truncate ${isUnread ? 'font-medium text-gray-900' : 'text-gray-700'}`}>
            {senderName}
          </span>
          <div className="flex items-center gap-1 flex-shrink-0">
            <span className="text-xs text-gray-400" data-testid={`inbox-list-item-time-${item.id}`}>{displayTime}</span>
            {isUnread && (
              <span className="w-2 h-2 rounded-full bg-blue-500" data-testid={`inbox-list-item-unread-${item.id}`} />
            )}
          </div>
        </div>
        {firstLine && (
          <p className={`text-xs truncate ${isUnread ? 'text-gray-600' : 'text-gray-500'}`}>
            {firstLine}
          </p>
        )}
      </div>
    </button>
  );
}

/**
 * TB91/TB92: Full message content panel for the right side of split layout
 * Shows: sender avatar/name (clickable), channel (clickable), full timestamp, full content,
 * attachments (document embeds), thread context (parent message), actions (Reply, Mark read/unread, Archive)
 */
function InboxMessageContent({
  item,
  onMarkRead,
  onMarkUnread,
  onArchive,
  onRestore,
  isPending,
  onNavigateToMessage,
  onNavigateToEntity,
  onReply,
}: {
  item: InboxItem;
  onMarkRead: () => void;
  onMarkUnread: () => void;
  onArchive: () => void;
  onRestore: () => void;
  isPending: boolean;
  onNavigateToMessage: () => void;
  onNavigateToEntity: (entityId: string) => void;
  onReply?: () => void; // TB92: Reply action
}) {
  const isUnread = item.status === 'unread';
  const isArchived = item.status === 'archived';

  const formatFullTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const formatAbsoluteTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const formatRelativeTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
    if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
    if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
    return '';
  };

  const senderName = item.sender?.name ?? 'Unknown';
  const senderType = item.sender?.entityType ?? 'agent';
  const senderId = item.sender?.id ?? item.message?.sender;
  const channelName = item.channel?.name ?? item.channelId;
  // TB92: Use full content if available, fallback to preview
  const messageContent = item.message?.fullContent ?? item.message?.contentPreview ?? '';
  const contentType = item.message?.contentType ?? 'text';

  const getAvatarIcon = (entityType?: string) => {
    switch (entityType ?? senderType) {
      case 'agent': return <Bot className="w-5 h-5" />;
      case 'human': return <User className="w-5 h-5" />;
      case 'system': return <Server className="w-5 h-5" />;
      default: return <User className="w-5 h-5" />;
    }
  };

  const getAvatarColors = (entityType?: string) => {
    switch (entityType ?? senderType) {
      case 'agent': return 'bg-purple-100 text-purple-600';
      case 'human': return 'bg-blue-100 text-blue-600';
      case 'system': return 'bg-gray-100 text-gray-600';
      default: return 'bg-gray-100 text-gray-600';
    }
  };

  const relativeTime = formatRelativeTime(item.createdAt);

  // TB92: Check if message has attachments
  const hasAttachments = item.attachments && item.attachments.length > 0;

  // TB92: Check if message is a reply (has thread parent)
  const hasThreadParent = item.threadParent !== null && item.threadParent !== undefined;

  return (
    <div className="h-full flex flex-col" data-testid={`inbox-message-content-${item.id}`}>
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            {/* Sender Avatar - clickable */}
            <button
              onClick={() => senderId && onNavigateToEntity(senderId)}
              className={`w-10 h-10 rounded-full flex items-center justify-center ${getAvatarColors()} hover:ring-2 hover:ring-blue-300 transition-all`}
              data-testid={`inbox-content-avatar-${item.id}`}
            >
              {getAvatarIcon()}
            </button>
            <div>
              {/* Sender Name - clickable */}
              <button
                onClick={() => senderId && onNavigateToEntity(senderId)}
                className="text-sm font-medium text-gray-900 hover:text-blue-600 hover:underline"
                data-testid={`inbox-content-sender-${item.id}`}
              >
                {senderName}
              </button>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                {/* Channel - clickable */}
                <button
                  onClick={onNavigateToMessage}
                  className="hover:text-blue-600 hover:underline"
                  data-testid={`inbox-content-channel-${item.id}`}
                >
                  #{channelName}
                </button>
                <span>•</span>
                {/* Source badge */}
                <span
                  className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 text-xs font-medium rounded ${
                    item.sourceType === 'mention'
                      ? 'bg-purple-100 text-purple-700'
                      : 'bg-blue-100 text-blue-700'
                  }`}
                >
                  {item.sourceType === 'mention' ? (
                    <>
                      <AtSign className="w-3 h-3" />
                      Mention
                    </>
                  ) : (
                    <>
                      <MessageSquare className="w-3 h-3" />
                      Direct
                    </>
                  )}
                </span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1">
            {isPending ? (
              <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
            ) : (
              <>
                {/* TB92: Reply action button */}
                {!isArchived && onReply && (
                  <button
                    onClick={onReply}
                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                    title="Reply"
                    data-testid={`inbox-content-reply-${item.id}`}
                  >
                    <Reply className="w-4 h-4" />
                  </button>
                )}
                {isArchived ? (
                  <button
                    onClick={onRestore}
                    className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded transition-colors"
                    title="Restore"
                    data-testid={`inbox-content-restore-${item.id}`}
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                ) : (
                  <>
                    {isUnread ? (
                      <button
                        onClick={onMarkRead}
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                        title="Mark as read"
                        data-testid={`inbox-content-mark-read-${item.id}`}
                      >
                        <CheckCheck className="w-4 h-4" />
                      </button>
                    ) : (
                      <button
                        onClick={onMarkUnread}
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                        title="Mark as unread"
                        data-testid={`inbox-content-mark-unread-${item.id}`}
                      >
                        <Mail className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={onArchive}
                      className="p-1.5 text-gray-400 hover:text-orange-600 hover:bg-orange-50 rounded transition-colors"
                      title="Archive"
                      data-testid={`inbox-content-archive-${item.id}`}
                    >
                      <Archive className="w-4 h-4" />
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        </div>

        {/* Timestamp - TB92: with absolute time on hover */}
        <div
          className="mt-2 text-xs text-gray-500 cursor-help"
          title={formatAbsoluteTime(item.createdAt)}
          data-testid={`inbox-content-time-${item.id}`}
        >
          {formatFullTime(item.createdAt)}
          {relativeTime && <span className="ml-1">({relativeTime})</span>}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-auto">
        {/* TB92: Thread context - show parent message if this is a reply */}
        {hasThreadParent && item.threadParent && (
          <div
            className="mx-4 mt-4 p-3 bg-gray-50 border-l-4 border-gray-300 rounded-r"
            data-testid={`inbox-content-thread-context-${item.id}`}
          >
            <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
              <CornerUpLeft className="w-3 h-3" />
              <span>Reply to</span>
            </div>
            <div className="flex items-start gap-2">
              {/* Parent sender avatar */}
              <button
                onClick={() => item.threadParent?.sender?.id && onNavigateToEntity(item.threadParent.sender.id)}
                className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${getAvatarColors(item.threadParent.sender?.entityType)} hover:ring-2 hover:ring-blue-300 transition-all`}
                data-testid={`inbox-content-thread-parent-avatar-${item.id}`}
              >
                {getAvatarIcon(item.threadParent.sender?.entityType)}
              </button>
              <div className="min-w-0 flex-1">
                {/* Parent sender name */}
                <button
                  onClick={() => item.threadParent?.sender?.id && onNavigateToEntity(item.threadParent.sender.id)}
                  className="text-xs font-medium text-gray-700 hover:text-blue-600 hover:underline"
                  data-testid={`inbox-content-thread-parent-sender-${item.id}`}
                >
                  {item.threadParent.sender?.name ?? 'Unknown'}
                </button>
                {/* Parent message preview */}
                <p
                  className="text-xs text-gray-500 truncate mt-0.5"
                  data-testid={`inbox-content-thread-parent-preview-${item.id}`}
                >
                  {item.threadParent.contentPreview || 'No content'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Message Content - TB92: Full content with markdown rendering */}
        <div className="p-4">
          <div
            className={`prose prose-sm max-w-none text-gray-700 ${
              contentType === 'markdown' ? 'whitespace-pre-wrap' : 'whitespace-pre-wrap'
            }`}
            data-testid={`inbox-content-body-${item.id}`}
          >
            {messageContent || <span className="text-gray-400 italic">No content</span>}
          </div>
        </div>

        {/* TB92: Attachments section - document embeds */}
        {hasAttachments && (
          <div
            className="px-4 pb-4"
            data-testid={`inbox-content-attachments-${item.id}`}
          >
            <div className="flex items-center gap-2 text-xs text-gray-500 mb-2">
              <Paperclip className="w-3 h-3" />
              <span>{item.attachments!.length} attachment{item.attachments!.length !== 1 ? 's' : ''}</span>
            </div>
            <div className="space-y-2">
              {item.attachments!.map((attachment) => (
                <div
                  key={attachment.id}
                  className="border border-gray-200 rounded-lg p-3 bg-gray-50 hover:bg-gray-100 transition-colors"
                  data-testid={`inbox-content-attachment-${attachment.id}`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      <div className="min-w-0">
                        <p
                          className="text-sm font-medium text-gray-700 truncate"
                          data-testid={`inbox-content-attachment-title-${attachment.id}`}
                        >
                          {attachment.title}
                        </p>
                        <span
                          className="inline-flex items-center px-1.5 py-0.5 text-xs font-medium bg-gray-200 text-gray-600 rounded"
                          data-testid={`inbox-content-attachment-type-${attachment.id}`}
                        >
                          {attachment.contentType ?? 'text'}
                        </span>
                      </div>
                    </div>
                  </div>
                  {/* Attachment content preview */}
                  {attachment.content && (
                    <div
                      className="mt-2 text-xs text-gray-500 line-clamp-3 whitespace-pre-wrap"
                      data-testid={`inbox-content-attachment-preview-${attachment.id}`}
                    >
                      {attachment.content.substring(0, 200)}
                      {attachment.content.length > 200 && '...'}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer - View in channel link */}
      <div className="p-3 border-t border-gray-200 bg-gray-50">
        <button
          onClick={onNavigateToMessage}
          className="text-sm text-blue-600 hover:text-blue-700 hover:underline flex items-center gap-1"
          data-testid={`inbox-content-view-in-channel-${item.id}`}
        >
          View in channel
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

/**
 * TB91: Empty state for message content panel when no message is selected
 */
function InboxMessageEmptyState() {
  return (
    <div className="h-full flex flex-col items-center justify-center text-gray-400" data-testid="inbox-content-empty">
      <Inbox className="w-12 h-12 mb-3" />
      <p className="text-sm font-medium">Select a message</p>
      <p className="text-xs mt-1">Choose a message from the list to view its content</p>
      <p className="text-xs mt-3 text-gray-300">Tip: Use J/K keys to navigate</p>
    </div>
  );
}

// Manager display component - shows the current manager with a link
function ManagerDisplay({
  managerId,
  onClick,
}: {
  managerId: string;
  onClick: (id: string) => void;
}) {
  const { data: manager, isLoading } = useEntity(managerId);

  if (isLoading) {
    return <span className="text-sm text-gray-400">Loading...</span>;
  }

  if (!manager) {
    return <span className="text-sm text-gray-400">Unknown manager</span>;
  }

  const styles = ENTITY_TYPE_STYLES[manager.entityType] || ENTITY_TYPE_STYLES.system;
  const Icon = styles.icon;

  return (
    <button
      onClick={() => onClick(manager.id)}
      className="flex items-center gap-2 p-2 rounded border border-gray-200 hover:bg-gray-50 transition-colors w-full text-left"
      data-testid="entity-manager-display"
    >
      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${styles.bg}`}>
        <Icon className={`w-4 h-4 ${styles.text}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-900 truncate">{manager.name}</div>
        <div className="text-xs text-gray-500">{manager.entityType}</div>
      </div>
    </button>
  );
}

// Manager picker component - allows selecting a manager from all entities
function ManagerPicker({
  entityId,
  currentManagerId,
  searchQuery,
  onSearchChange,
  onSelect,
  isLoading,
}: {
  entityId: string;
  currentManagerId: string | null;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onSelect: (managerId: string | null) => void;
  isLoading: boolean;
}) {
  const { data: allEntitiesData, isLoading: entitiesLoading } = useAllEntities(searchQuery);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Filter out self and current manager
  const availableEntities = useMemo(() => {
    if (!allEntitiesData?.items) return [];
    return allEntitiesData.items.filter(e =>
      e.id !== entityId && // Can't be own manager
      e.active !== false // Only active entities
    );
  }, [allEntitiesData, entityId]);

  return (
    <div className="space-y-2" data-testid="manager-picker">
      <input
        ref={inputRef}
        type="text"
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="Search for an entity..."
        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        data-testid="manager-search-input"
      />
      <div className="max-h-40 overflow-auto border border-gray-200 rounded-md divide-y divide-gray-100">
        {/* Clear manager option */}
        {currentManagerId && (
          <button
            onClick={() => onSelect(null)}
            disabled={isLoading}
            className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-red-50 transition-colors disabled:opacity-50"
            data-testid="manager-clear-button"
          >
            <X className="w-4 h-4 text-red-500" />
            <span className="text-sm text-red-600">Remove manager</span>
          </button>
        )}
        {entitiesLoading ? (
          <div className="px-3 py-2 text-sm text-gray-500">Loading...</div>
        ) : availableEntities.length === 0 ? (
          <div className="px-3 py-2 text-sm text-gray-500">No entities found</div>
        ) : (
          availableEntities.map((e) => {
            const styles = ENTITY_TYPE_STYLES[e.entityType] || ENTITY_TYPE_STYLES.system;
            const Icon = styles.icon;
            const isCurrentManager = e.id === currentManagerId;

            return (
              <button
                key={e.id}
                onClick={() => onSelect(e.id)}
                disabled={isLoading || isCurrentManager}
                className={`flex items-center gap-2 w-full px-3 py-2 text-left transition-colors disabled:opacity-50 ${
                  isCurrentManager ? 'bg-blue-50' : 'hover:bg-gray-50'
                }`}
                data-testid={`manager-option-${e.id}`}
              >
                <div className={`w-6 h-6 rounded-full flex items-center justify-center ${styles.bg}`}>
                  <Icon className={`w-3 h-3 ${styles.text}`} />
                </div>
                <span className="text-sm text-gray-900 flex-1 truncate">{e.name}</span>
                {isCurrentManager && (
                  <span className="text-xs text-blue-600">Current</span>
                )}
              </button>
            );
          })
        )}
      </div>
      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="w-4 h-4 animate-spin" />
          Updating...
        </div>
      )}
    </div>
  );
}

// Simple org chart visualization showing entity and direct reports
function OrgChartView({
  rootEntity,
  directReports,
  onEntityClick,
}: {
  rootEntity: Entity;
  directReports: Entity[];
  onEntityClick: (id: string) => void;
}) {
  const styles = ENTITY_TYPE_STYLES[rootEntity.entityType] || ENTITY_TYPE_STYLES.system;
  const Icon = styles.icon;

  return (
    <div className="p-3 bg-gray-50 rounded-lg" data-testid="org-chart-view">
      {/* Root entity (current) */}
      <div className="flex flex-col items-center">
        <div className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg shadow-sm border border-gray-200 mb-2">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${styles.bg}`}>
            <Icon className={`w-4 h-4 ${styles.text}`} />
          </div>
          <div>
            <div className="text-sm font-medium text-gray-900">{rootEntity.name}</div>
            <div className="text-xs text-gray-500">{rootEntity.entityType}</div>
          </div>
        </div>

        {/* Connector line */}
        {directReports.length > 0 && (
          <div className="w-px h-4 bg-gray-300" />
        )}

        {/* Horizontal connector */}
        {directReports.length > 1 && (
          <div
            className="h-px bg-gray-300 mb-2"
            style={{ width: `${Math.min(directReports.length * 120, 400)}px` }}
          />
        )}

        {/* Direct reports */}
        {directReports.length > 0 && (
          <div className="flex flex-wrap justify-center gap-3">
            {directReports.map((report) => {
              const reportStyles = ENTITY_TYPE_STYLES[report.entityType] || ENTITY_TYPE_STYLES.system;
              const ReportIcon = reportStyles.icon;

              return (
                <button
                  key={report.id}
                  onClick={() => onEntityClick(report.id)}
                  className="flex flex-col items-center p-2 bg-white rounded-lg shadow-sm border border-gray-200 hover:border-blue-300 hover:shadow transition-all"
                  data-testid={`org-chart-report-${report.id}`}
                >
                  {/* Vertical connector */}
                  <div className="w-px h-2 bg-gray-300 -mt-4 mb-1" />
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${reportStyles.bg}`}>
                    <ReportIcon className={`w-4 h-4 ${reportStyles.text}`} />
                  </div>
                  <div className="text-xs font-medium text-gray-900 mt-1 max-w-[80px] truncate">
                    {report.name}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

type EntityDetailTab = 'overview' | 'inbox' | 'history';

// Inbox view tabs configuration
const INBOX_VIEW_TABS: { value: InboxViewType; label: string }[] = [
  { value: 'unread', label: 'Unread' },
  { value: 'all', label: 'All' },
  { value: 'archived', label: 'Archived' },
];

function EntityDetailPanel({
  entityId,
  onClose,
}: {
  entityId: string;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const { data: entity, isLoading: entityLoading } = useEntity(entityId);
  const { data: stats, isLoading: statsLoading } = useEntityStats(entityId);
  const { data: tasks, isLoading: tasksLoading } = useEntityTasks(entityId);
  const { data: events, isLoading: eventsLoading } = useEntityEvents(entityId);
  // TB108: Entity Contribution Chart - activity data for GitHub-style grid
  const { data: activityData, isLoading: activityLoading } = useEntityActivity(entityId);
  const { data: inboxCount } = useEntityInboxCount(entityId);
  const { data: archivedData } = useEntityInboxViewCount(entityId, 'archived');
  const [inboxView, setInboxView] = useState<InboxViewType>(() => getStoredInboxView());
  const { data: inboxData, isLoading: inboxLoading, isError: inboxError, refetch: refetchInbox } = useEntityInbox(entityId, inboxView);
  const { data: directReports, isLoading: reportsLoading } = useEntityDirectReports(entityId);
  const { data: managementChain, isLoading: chainLoading } = useEntityManagementChain(entityId);
  const updateEntity = useUpdateEntity(entityId);
  const setEntityManager = useSetEntityManager(entityId);
  const markInboxRead = useMarkInboxRead(entityId);
  const markAllRead = useMarkAllInboxRead(entityId);

  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editTags, setEditTags] = useState('');
  const [showDeactivateConfirm, setShowDeactivateConfirm] = useState(false);
  const [activeTab, setActiveTab] = useState<EntityDetailTab>('overview');
  const [pendingItemId, setPendingItemId] = useState<string | null>(null);
  const [showManagerPicker, setShowManagerPicker] = useState(false);
  const [managerSearchQuery, setManagerSearchQuery] = useState('');
  const [showOrgChart, setShowOrgChart] = useState(false);
  // TB91: Selected inbox message for split layout
  const [selectedInboxItemId, setSelectedInboxItemId] = useState<string | null>(null);
  const inboxListRef = useRef<HTMLDivElement>(null);
  // TB93: Filter and sort state for inbox
  const [inboxSourceFilter, setInboxSourceFilter] = useState<InboxSourceFilter>(() => getStoredSourceFilter());
  const [inboxSortOrder, setInboxSortOrder] = useState<InboxSortOrder>(() => getStoredSortOrder());

  // Handle inbox view change and persist to localStorage
  const handleInboxViewChange = (view: InboxViewType) => {
    setInboxView(view);
    setStoredInboxView(view);
  };

  // TB93: Handle source filter change
  const handleSourceFilterChange = (filter: InboxSourceFilter) => {
    setInboxSourceFilter(filter);
    setStoredSourceFilter(filter);
    // Reset selection when filter changes
    setSelectedInboxItemId(null);
  };

  // TB93: Handle sort order change
  const handleSortOrderChange = (order: InboxSortOrder) => {
    setInboxSortOrder(order);
    setStoredSortOrder(order);
  };

  // Initialize edit values when entity loads or editing starts
  useEffect(() => {
    if (entity && isEditing) {
      setEditName(entity.name);
      setEditTags(entity.tags?.join(', ') || '');
    }
  }, [entity, isEditing]);

  // Reset edit mode and tab when entity changes
  useEffect(() => {
    setIsEditing(false);
    setShowDeactivateConfirm(false);
    setActiveTab('overview');
  }, [entityId]);

  const handleMarkInboxRead = async (itemId: string) => {
    setPendingItemId(itemId);
    try {
      await markInboxRead.mutateAsync({ itemId, status: 'read' });
    } finally {
      setPendingItemId(null);
    }
  };

  const handleMarkInboxUnread = async (itemId: string) => {
    setPendingItemId(itemId);
    try {
      await markInboxRead.mutateAsync({ itemId, status: 'unread' });
    } finally {
      setPendingItemId(null);
    }
  };

  const handleArchiveInbox = async (itemId: string) => {
    setPendingItemId(itemId);
    try {
      await markInboxRead.mutateAsync({ itemId, status: 'archived' });
    } finally {
      setPendingItemId(null);
    }
  };

  const handleRestoreInbox = async (itemId: string) => {
    setPendingItemId(itemId);
    try {
      // Restore to 'read' status (previously archived items become read)
      await markInboxRead.mutateAsync({ itemId, status: 'read' });
    } finally {
      setPendingItemId(null);
    }
  };

  const handleMarkAllRead = async () => {
    await markAllRead.mutateAsync();
  };

  const handleNavigateToMessage = (channelId: string, messageId: string) => {
    // Navigate to messages page with the channel selected and message highlighted
    navigate({
      to: '/messages',
      search: { channel: channelId, message: messageId, page: 1, limit: 50 },
    });
  };

  // TB91: Navigate to entity detail from inbox content
  const handleNavigateToEntity = (targetEntityId: string) => {
    // If it's a different entity, we could navigate or just select it
    // For now, navigate to the entities page with the target selected
    navigate({
      to: '/entities',
      search: { selected: targetEntityId, name: undefined, page: 1, limit: 25 },
    });
  };

  // TB106: Navigate to task detail page when clicking assigned tasks
  const handleNavigateToTask = (taskId: string) => {
    navigate({
      to: '/tasks',
      search: { selected: taskId, page: 1, limit: 25 },
    });
  };

  // TB93: Client-side filtering and sorting of inbox items
  const filteredAndSortedInboxItems = useMemo(() => {
    if (!inboxData?.items) return [];

    let items = [...inboxData.items];

    // Apply source filter
    if (inboxSourceFilter !== 'all') {
      items = items.filter((item) => item.sourceType === inboxSourceFilter);
    }

    // Apply sorting
    items.sort((a, b) => {
      switch (inboxSortOrder) {
        case 'newest':
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case 'oldest':
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case 'sender':
          const senderA = a.sender?.name || '';
          const senderB = b.sender?.name || '';
          return senderA.localeCompare(senderB);
        default:
          return 0;
      }
    });

    return items;
  }, [inboxData?.items, inboxSourceFilter, inboxSortOrder]);

  // TB94: Group inbox items by time period (Today, Yesterday, This Week, Earlier)
  const groupedInboxItems = useMemo(() => {
    if (filteredAndSortedInboxItems.length === 0) return [];

    // Only group when sorted by date (newest/oldest), not by sender
    if (inboxSortOrder === 'sender') {
      // No grouping for sender sort - just wrap items without group info
      return filteredAndSortedInboxItems.map((item) => ({
        item,
        period: 'today' as TimePeriod, // Placeholder - won't show headers
        isFirstInGroup: false,
      }));
    }

    return groupByTimePeriod(filteredAndSortedInboxItems, (item) => item.createdAt);
  }, [filteredAndSortedInboxItems, inboxSortOrder]);

  // TB94: Periodic update trigger for relative times
  // Forces re-render every minute for time-sensitive displays
  const [timeUpdateTrigger, setTimeUpdateTrigger] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeUpdateTrigger((prev) => prev + 1);
    }, 60000); // Update every minute
    return () => clearInterval(timer);
  }, []);

  // TB91: Get currently selected inbox item (updated to use filtered list)
  const selectedInboxItem = useMemo(() => {
    if (!selectedInboxItemId || !filteredAndSortedInboxItems) return null;
    return filteredAndSortedInboxItems.find((item) => item.id === selectedInboxItemId) ?? null;
  }, [selectedInboxItemId, filteredAndSortedInboxItems]);

  // TB91: Keyboard navigation for inbox (J = next, K = previous) - updated to use filtered list
  const handleInboxKeyNavigation = useCallback(
    (direction: 'next' | 'prev') => {
      if (!filteredAndSortedInboxItems || filteredAndSortedInboxItems.length === 0) return;

      const items = filteredAndSortedInboxItems;
      const currentIndex = selectedInboxItemId
        ? items.findIndex((item) => item.id === selectedInboxItemId)
        : -1;

      let newIndex: number;
      if (direction === 'next') {
        newIndex = currentIndex < items.length - 1 ? currentIndex + 1 : currentIndex;
      } else {
        newIndex = currentIndex > 0 ? currentIndex - 1 : 0;
      }

      if (newIndex !== currentIndex && items[newIndex]) {
        setSelectedInboxItemId(items[newIndex].id);
      }
    },
    [filteredAndSortedInboxItems, selectedInboxItemId]
  );

  // TB91: Reset selection when inbox view changes or entity changes
  useEffect(() => {
    setSelectedInboxItemId(null);
  }, [inboxView, entityId]);

  // TB91: Keyboard shortcuts for inbox navigation (only when inbox tab is active)
  useKeyboardShortcut(
    'J',
    useCallback(() => {
      if (activeTab === 'inbox') {
        handleInboxKeyNavigation('next');
      }
    }, [activeTab, handleInboxKeyNavigation]),
    'Select next inbox message'
  );

  useKeyboardShortcut(
    'K',
    useCallback(() => {
      if (activeTab === 'inbox') {
        handleInboxKeyNavigation('prev');
      }
    }, [activeTab, handleInboxKeyNavigation]),
    'Select previous inbox message'
  );

  const handleSave = async () => {
    if (!entity) return;

    const updates: UpdateEntityInput = {};

    if (editName.trim() && editName.trim() !== entity.name) {
      updates.name = editName.trim();
    }

    const newTags = editTags.split(',').map((t) => t.trim()).filter(Boolean);
    const currentTags = entity.tags || [];
    if (JSON.stringify(newTags) !== JSON.stringify(currentTags)) {
      updates.tags = newTags;
    }

    if (Object.keys(updates).length === 0) {
      setIsEditing(false);
      return;
    }

    try {
      await updateEntity.mutateAsync(updates);
      setIsEditing(false);
    } catch {
      // Error handled by mutation
    }
  };

  const handleToggleActive = async () => {
    if (!entity) return;
    const newActive = entity.active === false;

    try {
      await updateEntity.mutateAsync({ active: newActive });
      setShowDeactivateConfirm(false);
    } catch {
      // Error handled by mutation
    }
  };

  const handleRemoveTag = async (tagToRemove: string) => {
    if (!entity) return;
    const newTags = (entity.tags || []).filter((t) => t !== tagToRemove);

    try {
      await updateEntity.mutateAsync({ tags: newTags });
    } catch {
      // Error handled by mutation
    }
  };

  if (entityLoading) {
    return (
      <div className="h-full flex items-center justify-center" data-testid="entity-detail-loading">
        <span className="text-gray-500">Loading...</span>
      </div>
    );
  }

  if (!entity) {
    return (
      <div className="h-full flex items-center justify-center" data-testid="entity-detail-error">
        <span className="text-red-600">Entity not found</span>
      </div>
    );
  }

  const styles = ENTITY_TYPE_STYLES[entity.entityType] || ENTITY_TYPE_STYLES.system;
  const Icon = styles.icon;
  const isActive = entity.active !== false;
  const activeTasks = tasks?.filter((t) => t.status !== 'closed' && t.status !== 'cancelled') || [];

  return (
    <div className="h-full flex flex-col" data-testid="entity-detail-panel">
      {/* Header */}
      <div className="flex items-start justify-between p-4 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <div className={`w-12 h-12 rounded-full flex items-center justify-center ${styles.bg}`}>
            <Icon className={`w-6 h-6 ${styles.text}`} />
          </div>
          <div>
            {isEditing ? (
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="text-lg font-medium text-gray-900 border border-blue-300 rounded px-2 py-0.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                data-testid="entity-edit-name-input"
              />
            ) : (
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-medium text-gray-900">{entity.name}</h2>
                {!isActive && (
                  <span className="px-1.5 py-0.5 text-xs font-medium bg-gray-100 text-gray-600 rounded">
                    Inactive
                  </span>
                )}
              </div>
            )}
            <p className="text-sm text-gray-500 font-mono">{entity.id}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {isEditing ? (
            <>
              <button
                onClick={handleSave}
                disabled={updateEntity.isPending}
                className="p-1.5 text-green-600 hover:bg-green-50 rounded transition-colors disabled:opacity-50"
                data-testid="entity-save-button"
              >
                {updateEntity.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
              </button>
              <button
                onClick={() => setIsEditing(false)}
                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                data-testid="entity-cancel-edit-button"
              >
                <X className="w-5 h-5" />
              </button>
            </>
          ) : (
            <button
              onClick={() => setIsEditing(true)}
              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
              data-testid="entity-edit-button"
            >
              <Pencil className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 rounded"
            data-testid="entity-detail-close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Error message */}
      {updateEntity.isError && (
        <div className="mx-4 mt-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-600" data-testid="entity-update-error">
          {updateEntity.error.message}
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-gray-200 px-4" data-testid="entity-detail-tabs">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'overview'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
          data-testid="entity-tab-overview"
        >
          Overview
        </button>
        <button
          onClick={() => setActiveTab('inbox')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'inbox'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
          data-testid="entity-tab-inbox"
        >
          <Inbox className="w-4 h-4" />
          Inbox
          {inboxCount && inboxCount.count > 0 && (
            <span className="px-1.5 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 rounded-full" data-testid="inbox-count-badge">
              {inboxCount.count}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'history'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
          data-testid="entity-tab-history"
        >
          <History className="w-4 h-4" />
          History
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4 space-y-6">
        {activeTab === 'overview' ? (
          <>
        {/* Entity Info */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className={`px-2 py-1 text-xs font-medium rounded ${styles.bg} ${styles.text}`}>
              {entity.entityType}
            </span>
            {entity.publicKey && (
              <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded">
                Has Public Key
              </span>
            )}
          </div>

          {/* Active Status Toggle */}
          <div className="mb-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Status</span>
              {showDeactivateConfirm ? (
                <div className="flex items-center gap-2" data-testid="entity-deactivate-confirm">
                  <span className="text-sm text-gray-600">
                    {isActive ? 'Deactivate?' : 'Reactivate?'}
                  </span>
                  <button
                    onClick={handleToggleActive}
                    disabled={updateEntity.isPending}
                    className="px-2 py-1 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded disabled:opacity-50"
                    data-testid="entity-confirm-toggle-button"
                  >
                    {updateEntity.isPending ? 'Saving...' : 'Confirm'}
                  </button>
                  <button
                    onClick={() => setShowDeactivateConfirm(false)}
                    className="px-2 py-1 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded"
                    data-testid="entity-cancel-toggle-button"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowDeactivateConfirm(true)}
                  className={`inline-flex items-center gap-1.5 px-2 py-1 text-xs font-medium rounded transition-colors ${
                    isActive
                      ? 'bg-green-100 text-green-800 hover:bg-green-200'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                  data-testid="entity-toggle-active-button"
                >
                  {isActive ? (
                    <>
                      <Power className="w-3 h-3" />
                      Active
                    </>
                  ) : (
                    <>
                      <PowerOff className="w-3 h-3" />
                      Inactive
                    </>
                  )}
                </button>
              )}
            </div>
          </div>

          {/* Tags Section */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Tag className="w-4 h-4 text-gray-400" />
              <span className="text-sm font-medium text-gray-700">Tags</span>
            </div>
            {isEditing ? (
              <input
                type="text"
                value={editTags}
                onChange={(e) => setEditTags(e.target.value)}
                placeholder="Enter tags separated by commas..."
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                data-testid="entity-edit-tags-input"
              />
            ) : entity.tags && entity.tags.length > 0 ? (
              <div className="flex flex-wrap gap-1" data-testid="entity-tags-list">
                {entity.tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded group"
                  >
                    {tag}
                    <button
                      onClick={() => handleRemoveTag(tag)}
                      className="opacity-0 group-hover:opacity-100 hover:text-red-600 transition-opacity"
                      data-testid={`entity-remove-tag-${tag}`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <span className="text-sm text-gray-400">No tags</span>
            )}
          </div>
        </div>

        {/* Management Hierarchy Section */}
        <div className="border-t border-gray-100 pt-4">
          <div className="flex items-center gap-2 mb-3">
            <GitBranch className="w-4 h-4 text-gray-400" />
            <h3 className="text-sm font-medium text-gray-900">Organization</h3>
          </div>

          {/* Reports To (Manager) */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600">Reports To</span>
              {!showManagerPicker ? (
                <button
                  onClick={() => {
                    setShowManagerPicker(true);
                    setManagerSearchQuery('');
                  }}
                  className="text-xs text-blue-600 hover:text-blue-700"
                  data-testid="entity-edit-manager-button"
                >
                  {entity.reportsTo ? 'Change' : 'Set Manager'}
                </button>
              ) : (
                <button
                  onClick={() => setShowManagerPicker(false)}
                  className="text-xs text-gray-500 hover:text-gray-700"
                  data-testid="entity-cancel-manager-edit"
                >
                  Cancel
                </button>
              )}
            </div>
            {showManagerPicker ? (
              <ManagerPicker
                entityId={entityId}
                currentManagerId={entity.reportsTo || null}
                searchQuery={managerSearchQuery}
                onSearchChange={setManagerSearchQuery}
                onSelect={async (managerId) => {
                  try {
                    await setEntityManager.mutateAsync(managerId);
                    setShowManagerPicker(false);
                  } catch {
                    // Error handled by mutation
                  }
                }}
                isLoading={setEntityManager.isPending}
              />
            ) : entity.reportsTo ? (
              <ManagerDisplay
                managerId={entity.reportsTo}
                onClick={(id) => navigate({ to: '/entities', search: { selected: id, name: undefined, page: 1, limit: 25 } })}
              />
            ) : (
              <span className="text-sm text-gray-400" data-testid="entity-no-manager">No manager assigned</span>
            )}
            {setEntityManager.isError && (
              <p className="mt-1 text-xs text-red-600" data-testid="entity-manager-error">
                {setEntityManager.error.message}
              </p>
            )}
          </div>

          {/* Management Chain */}
          {managementChain && managementChain.length > 0 && (
            <div className="mb-4" data-testid="entity-management-chain">
              <div className="text-xs text-gray-500 mb-2">Management Chain</div>
              <div className="flex flex-wrap items-center gap-1">
                <span className="text-sm text-gray-700">{entity.name}</span>
                {managementChain.map((manager, index) => (
                  <span key={manager.id} className="flex items-center gap-1">
                    <ChevronRight className="w-3 h-3 text-gray-400" />
                    <button
                      onClick={() => navigate({ to: '/entities', search: { selected: manager.id, name: undefined, page: 1, limit: 25 } })}
                      className="text-sm text-blue-600 hover:text-blue-700 hover:underline"
                      data-testid={`chain-entity-${index}`}
                    >
                      {manager.name}
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}
          {chainLoading && (
            <div className="text-xs text-gray-400 mb-4">Loading management chain...</div>
          )}

          {/* Direct Reports */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600">
                Direct Reports {directReports && directReports.length > 0 && `(${directReports.length})`}
              </span>
              {directReports && directReports.length > 0 && (
                <button
                  onClick={() => setShowOrgChart(!showOrgChart)}
                  className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
                  data-testid="entity-toggle-org-chart"
                >
                  {showOrgChart ? (
                    <>
                      <ChevronDown className="w-3 h-3" />
                      Hide chart
                    </>
                  ) : (
                    <>
                      <GitBranch className="w-3 h-3" />
                      Show chart
                    </>
                  )}
                </button>
              )}
            </div>
            {reportsLoading ? (
              <div className="text-xs text-gray-400">Loading reports...</div>
            ) : !directReports || directReports.length === 0 ? (
              <span className="text-sm text-gray-400" data-testid="entity-no-reports">No direct reports</span>
            ) : showOrgChart ? (
              <OrgChartView
                rootEntity={entity}
                directReports={directReports}
                onEntityClick={(id) => navigate({ to: '/entities', search: { selected: id, name: undefined, page: 1, limit: 25 } })}
              />
            ) : (
              <div className="space-y-1" data-testid="entity-direct-reports-list">
                {directReports.map((report) => (
                  <button
                    key={report.id}
                    onClick={() => navigate({ to: '/entities', search: { selected: report.id, name: undefined, page: 1, limit: 25 } })}
                    className="flex items-center gap-2 w-full p-2 text-left rounded hover:bg-gray-50 transition-colors"
                    data-testid={`direct-report-${report.id}`}
                  >
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center ${ENTITY_TYPE_STYLES[report.entityType]?.bg || 'bg-gray-100'}`}>
                      {report.entityType === 'agent' ? <Bot className="w-3 h-3 text-blue-600" /> :
                       report.entityType === 'human' ? <User className="w-3 h-3 text-green-600" /> :
                       <Server className="w-3 h-3 text-purple-600" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">{report.name}</div>
                      <div className="text-xs text-gray-500">{report.entityType}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Statistics */}
        <div>
          <h3 className="text-sm font-medium text-gray-900 mb-3">Statistics</h3>
          {statsLoading ? (
            <div className="text-sm text-gray-500">Loading stats...</div>
          ) : stats ? (
            <div className="grid grid-cols-2 gap-3" data-testid="entity-stats">
              <StatCard icon={ListTodo} label="Assigned Tasks" value={stats.assignedTaskCount} />
              <StatCard icon={Clock} label="Active Tasks" value={stats.activeTaskCount} color="text-yellow-600" />
              <StatCard icon={CheckCircle} label="Completed" value={stats.completedTaskCount} color="text-green-600" />
              <StatCard icon={ListTodo} label="Created Tasks" value={stats.createdTaskCount} color="text-blue-600" />
              <StatCard icon={MessageSquare} label="Messages Sent" value={stats.messageCount} />
              <StatCard icon={FileText} label="Documents Created" value={stats.documentCount} />
            </div>
          ) : null}
        </div>

        {/* TB108: Activity Contribution Chart - GitHub-style activity grid */}
        <div className="border-t border-gray-100 pt-4">
          <h3 className="text-sm font-medium text-gray-900 mb-3 flex items-center gap-2">
            <Activity className="w-4 h-4" />
            Activity
          </h3>
          <ContributionChart
            activity={activityData?.activity || []}
            startDate={activityData?.startDate}
            endDate={activityData?.endDate}
            isLoading={activityLoading}
            testId="entity-contribution-chart"
          />
        </div>

        {/* Active Tasks */}
        <div>
          <h3 className="text-sm font-medium text-gray-900 mb-3">
            Assigned Tasks ({activeTasks.length})
          </h3>
          {tasksLoading ? (
            <div className="text-sm text-gray-500">Loading tasks...</div>
          ) : activeTasks.length === 0 ? (
            <div className="text-sm text-gray-500">No active tasks assigned</div>
          ) : (
            <div className="space-y-2" data-testid="entity-tasks">
              {activeTasks.slice(0, 5).map((task) => (
                <TaskMiniCard key={task.id} task={task} onClick={handleNavigateToTask} />
              ))}
              {activeTasks.length > 5 && (
                <button
                  onClick={() => navigate({ to: '/tasks', search: { assignee: entityId, page: 1, limit: 25 } })}
                  className="w-full text-xs text-blue-600 hover:text-blue-700 text-center py-1 hover:bg-blue-50 rounded transition-colors"
                  data-testid="view-all-tasks"
                >
                  +{activeTasks.length - 5} more tasks
                </button>
              )}
            </div>
          )}
        </div>

        {/* TB109: Activity Timeline with enhanced ActivityFeedItem */}
        <div>
          <h3 className="text-sm font-medium text-gray-900 mb-3 flex items-center gap-2">
            <Activity className="w-4 h-4" />
            Recent Activity
          </h3>
          {eventsLoading ? (
            <div className="text-sm text-gray-500">Loading activity...</div>
          ) : !events || events.length === 0 ? (
            <div className="text-sm text-gray-500">No recent activity</div>
          ) : (
            <>
              <div className="divide-y divide-gray-100" data-testid="entity-events">
                {events.slice(0, 10).map((event) => (
                  <ActivityFeedItem key={event.id} event={event} />
                ))}
              </div>
              {/* TB109: View all activity link - navigates to filtered timeline */}
              {events.length > 0 && (
                <button
                  onClick={() => navigate({ to: '/dashboard/timeline', search: { page: 1, limit: 100, actor: entity.id } })}
                  className="w-full mt-3 text-sm text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded py-2 transition-colors flex items-center justify-center gap-1"
                  data-testid="view-all-activity"
                >
                  View all activity
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}
            </>
          )}
        </div>

        {/* Timestamps */}
        <div className="text-xs text-gray-400 pt-4 border-t border-gray-100">
          <div>Created: {new Date(entity.createdAt).toLocaleString()}</div>
          <div>Updated: {new Date(entity.updatedAt).toLocaleString()}</div>
        </div>
          </>
        ) : activeTab === 'inbox' ? (
          /* Inbox Tab Content - TB91: Split Layout */
          <div className="flex flex-col h-full -m-4" data-testid="entity-inbox-tab">
            {/* Inbox Header with View Tabs */}
            <div className="flex flex-col gap-2 p-3 border-b border-gray-200 bg-gray-50/50">
              {/* Title and Mark All Read */}
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-gray-900 flex items-center gap-2">
                  <Inbox className="w-4 h-4" />
                  Inbox
                </h3>
                {inboxView !== 'archived' && inboxCount && inboxCount.count > 0 && (
                  <button
                    onClick={handleMarkAllRead}
                    disabled={markAllRead.isPending}
                    className="inline-flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded transition-colors disabled:opacity-50"
                    data-testid="inbox-mark-all-read"
                  >
                    {markAllRead.isPending ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <CheckCheck className="w-3 h-3" />
                    )}
                    Mark all read
                  </button>
                )}
              </div>

              {/* View Tabs (TB90) */}
              <div className="flex gap-1 p-1 bg-gray-100 rounded-lg" data-testid="inbox-view-tabs">
                {INBOX_VIEW_TABS.map((tab) => {
                  const isSelected = inboxView === tab.value;
                  // Show count badge for unread and archived
                  let countBadge = null;
                  if (tab.value === 'unread' && inboxCount && inboxCount.count > 0) {
                    countBadge = (
                      <span
                        className={`ml-1 px-1.5 py-0.5 text-xs rounded-full ${
                          isSelected ? 'bg-blue-100 text-blue-700' : 'bg-gray-200 text-gray-600'
                        }`}
                        data-testid="inbox-unread-count-badge"
                      >
                        {inboxCount.count}
                      </span>
                    );
                  } else if (tab.value === 'archived' && archivedData && archivedData.total > 0) {
                    countBadge = (
                      <span
                        className={`ml-1 px-1.5 py-0.5 text-xs rounded-full ${
                          isSelected ? 'bg-orange-100 text-orange-700' : 'bg-gray-200 text-gray-600'
                        }`}
                        data-testid="inbox-archived-count-badge"
                      >
                        {archivedData.total}
                      </span>
                    );
                  }

                  return (
                    <button
                      key={tab.value}
                      onClick={() => handleInboxViewChange(tab.value)}
                      className={`flex items-center px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                        isSelected
                          ? 'bg-white text-gray-900 shadow-sm'
                          : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                      }`}
                      data-testid={`inbox-view-${tab.value}`}
                    >
                      {tab.label}
                      {countBadge}
                    </button>
                  );
                })}
              </div>

              {/* TB93: Filter and Sort Controls */}
              <div className="flex items-center gap-2" data-testid="inbox-filter-sort-controls">
                {/* Source Filter Dropdown */}
                <div className="relative">
                  <button
                    className={`inline-flex items-center gap-1.5 px-2 py-1 text-xs font-medium rounded-md border transition-colors ${
                      inboxSourceFilter !== 'all'
                        ? 'bg-blue-50 text-blue-700 border-blue-200'
                        : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                    }`}
                    onClick={() => {
                      const dropdown = document.getElementById('inbox-filter-dropdown');
                      if (dropdown) {
                        dropdown.classList.toggle('hidden');
                      }
                    }}
                    data-testid="inbox-filter-button"
                  >
                    <Filter className="w-3 h-3" />
                    Filter
                    <ChevronDown className="w-3 h-3" />
                  </button>
                  <div
                    id="inbox-filter-dropdown"
                    className="hidden absolute left-0 top-full mt-1 w-44 bg-white border border-gray-200 rounded-md shadow-lg z-10"
                    data-testid="inbox-filter-dropdown"
                  >
                    <div className="p-1">
                      <div className="px-2 py-1 text-xs font-semibold text-gray-500 uppercase">Source Type</div>
                      {[
                        { value: 'all', label: 'All Messages', icon: Mail },
                        { value: 'direct', label: 'Direct Messages', icon: MessageSquare },
                        { value: 'mention', label: 'Mentions', icon: AtSign },
                      ].map((option) => {
                        const OptionIcon = option.icon;
                        const isSelected = inboxSourceFilter === option.value;
                        return (
                          <button
                            key={option.value}
                            onClick={() => {
                              handleSourceFilterChange(option.value as InboxSourceFilter);
                              const dropdown = document.getElementById('inbox-filter-dropdown');
                              if (dropdown) dropdown.classList.add('hidden');
                            }}
                            className={`w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded transition-colors ${
                              isSelected
                                ? 'bg-blue-50 text-blue-700'
                                : 'text-gray-700 hover:bg-gray-50'
                            }`}
                            data-testid={`inbox-filter-${option.value}`}
                          >
                            <OptionIcon className="w-3.5 h-3.5" />
                            {option.label}
                            {isSelected && <CheckCircle className="w-3 h-3 ml-auto" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Sort Dropdown */}
                <div className="relative">
                  <button
                    className={`inline-flex items-center gap-1.5 px-2 py-1 text-xs font-medium rounded-md border transition-colors ${
                      inboxSortOrder !== 'newest'
                        ? 'bg-blue-50 text-blue-700 border-blue-200'
                        : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                    }`}
                    onClick={() => {
                      const dropdown = document.getElementById('inbox-sort-dropdown');
                      if (dropdown) {
                        dropdown.classList.toggle('hidden');
                      }
                    }}
                    data-testid="inbox-sort-button"
                  >
                    <ArrowUpDown className="w-3 h-3" />
                    Sort
                    <ChevronDown className="w-3 h-3" />
                  </button>
                  <div
                    id="inbox-sort-dropdown"
                    className="hidden absolute left-0 top-full mt-1 w-36 bg-white border border-gray-200 rounded-md shadow-lg z-10"
                    data-testid="inbox-sort-dropdown"
                  >
                    <div className="p-1">
                      {[
                        { value: 'newest', label: 'Newest First', icon: ArrowDown },
                        { value: 'oldest', label: 'Oldest First', icon: ArrowUp },
                        { value: 'sender', label: 'By Sender', icon: User },
                      ].map((option) => {
                        const OptionIcon = option.icon;
                        const isSelected = inboxSortOrder === option.value;
                        return (
                          <button
                            key={option.value}
                            onClick={() => {
                              handleSortOrderChange(option.value as InboxSortOrder);
                              const dropdown = document.getElementById('inbox-sort-dropdown');
                              if (dropdown) dropdown.classList.add('hidden');
                            }}
                            className={`w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded transition-colors ${
                              isSelected
                                ? 'bg-blue-50 text-blue-700'
                                : 'text-gray-700 hover:bg-gray-50'
                            }`}
                            data-testid={`inbox-sort-${option.value}`}
                          >
                            <OptionIcon className="w-3.5 h-3.5" />
                            {option.label}
                            {isSelected && <CheckCircle className="w-3 h-3 ml-auto" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* TB93: Active Filter Chips */}
              {(inboxSourceFilter !== 'all' || inboxSortOrder !== 'newest') && (
                <div className="flex flex-wrap gap-1.5" data-testid="inbox-active-filters">
                  {inboxSourceFilter !== 'all' && (
                    <span
                      className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-blue-50 text-blue-700 rounded-full"
                      data-testid={`inbox-filter-chip-${inboxSourceFilter}`}
                    >
                      {inboxSourceFilter === 'direct' ? (
                        <>
                          <MessageSquare className="w-3 h-3" />
                          Direct Messages
                        </>
                      ) : (
                        <>
                          <AtSign className="w-3 h-3" />
                          Mentions
                        </>
                      )}
                      <button
                        onClick={() => handleSourceFilterChange('all')}
                        className="ml-0.5 hover:text-blue-900"
                        data-testid="inbox-clear-source-filter"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  )}
                  {inboxSortOrder !== 'newest' && (
                    <span
                      className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-700 rounded-full"
                      data-testid={`inbox-sort-chip-${inboxSortOrder}`}
                    >
                      {inboxSortOrder === 'oldest' ? (
                        <>
                          <ArrowUp className="w-3 h-3" />
                          Oldest First
                        </>
                      ) : (
                        <>
                          <User className="w-3 h-3" />
                          By Sender
                        </>
                      )}
                      <button
                        onClick={() => handleSortOrderChange('newest')}
                        className="ml-0.5 hover:text-gray-900"
                        data-testid="inbox-clear-sort"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  )}
                  {/* Clear All button */}
                  {inboxSourceFilter !== 'all' && inboxSortOrder !== 'newest' && (
                    <button
                      onClick={() => {
                        handleSourceFilterChange('all');
                        handleSortOrderChange('newest');
                      }}
                      className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors"
                      data-testid="inbox-clear-all-filters"
                    >
                      Clear all
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* TB91: Split Layout - Message List (left 40%) + Content (right 60%) */}
            <div className="flex-1 flex overflow-hidden">
              {/* Left Panel - Message List (40%) */}
              <div
                ref={inboxListRef}
                className="w-2/5 min-w-[200px] max-w-[300px] border-r border-gray-200 overflow-auto"
                data-testid="inbox-message-list"
              >
                {inboxLoading ? (
                  <div className="p-4 text-sm text-gray-500">Loading inbox...</div>
                ) : inboxError ? (
                  <div className="text-center py-8 px-4" data-testid="inbox-error">
                    <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-2" />
                    <p className="text-sm text-gray-700">Failed to load inbox</p>
                    <p className="text-xs text-gray-500 mt-1 mb-3">
                      There was an error loading your messages
                    </p>
                    <button
                      onClick={() => refetchInbox()}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded transition-colors"
                      data-testid="inbox-retry"
                    >
                      <RefreshCw className="w-3 h-3" />
                      Retry
                    </button>
                  </div>
                ) : !inboxData || inboxData.items.length === 0 ? (
                  <div className="text-center py-8 px-4" data-testid="inbox-empty">
                    <Inbox className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm text-gray-500">
                      {inboxView === 'unread'
                        ? 'No unread messages'
                        : inboxView === 'archived'
                        ? 'No archived messages'
                        : 'No messages in inbox'}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      {inboxView === 'archived'
                        ? 'Archived messages will appear here'
                        : 'Direct messages and @mentions will appear here'}
                    </p>
                  </div>
                ) : filteredAndSortedInboxItems.length === 0 ? (
                  /* TB93: Empty state when filters exclude all items */
                  <div className="text-center py-8 px-4" data-testid="inbox-filtered-empty">
                    <Filter className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm text-gray-500">No messages match your filters</p>
                    <p className="text-xs text-gray-400 mt-1">
                      Try adjusting your filter settings
                    </p>
                    <button
                      onClick={() => handleSourceFilterChange('all')}
                      className="mt-2 text-xs font-medium text-blue-600 hover:text-blue-700"
                      data-testid="inbox-clear-filters-link"
                    >
                      Clear filters
                    </button>
                  </div>
                ) : (
                  <VirtualizedList
                    items={groupedInboxItems}
                    getItemKey={(groupedItem) => groupedItem.item.id}
                    // TB94: Estimate size accounts for headers (24px) + items (56px)
                    estimateSize={(index) => {
                      const groupedItem = groupedInboxItems[index];
                      // Show headers only when not sorted by sender
                      if (groupedItem?.isFirstInGroup && inboxSortOrder !== 'sender') {
                        return 56 + 28; // Item + header
                      }
                      return 56;
                    }}
                    height="100%"
                    testId="inbox-items-list"
                    renderItem={(groupedItem) => (
                      <>
                        {/* TB94: Show time period header for first item in each group */}
                        {groupedItem.isFirstInGroup && inboxSortOrder !== 'sender' && (
                          <InboxTimePeriodHeader period={groupedItem.period} />
                        )}
                        <InboxMessageListItem
                          item={groupedItem.item}
                          isSelected={selectedInboxItemId === groupedItem.item.id}
                          onSelect={() => setSelectedInboxItemId(groupedItem.item.id)}
                          // TB94: Pass pre-formatted time for periodic updates
                          // eslint-disable-next-line react-hooks/exhaustive-deps
                          formattedTime={formatCompactTime(groupedItem.item.createdAt)}
                          key={`${groupedItem.item.id}-${timeUpdateTrigger}`}
                        />
                      </>
                    )}
                  />
                )}
                {/* TB93: Show count info with filter count */}
                {inboxData && inboxData.items.length > 0 && (
                  <div className="text-center text-xs text-gray-500 py-2 border-t border-gray-100">
                    {inboxSourceFilter !== 'all' ? (
                      <>
                        Showing {filteredAndSortedInboxItems.length} of {inboxData.items.length} (filtered)
                      </>
                    ) : inboxData.hasMore ? (
                      <>
                        Showing {inboxData.items.length} of {inboxData.total} items
                      </>
                    ) : (
                      <>
                        {inboxData.items.length} {inboxData.items.length === 1 ? 'item' : 'items'}
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Right Panel - Message Content (60%) */}
              <div className="flex-1 overflow-hidden bg-white" data-testid="inbox-message-content-panel">
                {selectedInboxItem ? (
                  <InboxMessageContent
                    item={selectedInboxItem}
                    onMarkRead={() => handleMarkInboxRead(selectedInboxItem.id)}
                    onMarkUnread={() => handleMarkInboxUnread(selectedInboxItem.id)}
                    onArchive={() => handleArchiveInbox(selectedInboxItem.id)}
                    onRestore={() => handleRestoreInbox(selectedInboxItem.id)}
                    isPending={pendingItemId === selectedInboxItem.id}
                    onNavigateToMessage={() => handleNavigateToMessage(selectedInboxItem.channelId, selectedInboxItem.messageId)}
                    onNavigateToEntity={handleNavigateToEntity}
                    // TB92: Reply action navigates to channel with message for replying
                    onReply={() => handleNavigateToMessage(selectedInboxItem.channelId, selectedInboxItem.messageId)}
                  />
                ) : (
                  <InboxMessageEmptyState />
                )}
              </div>
            </div>
          </div>
        ) : (
          /* History Tab Content - TB110 */
          <HistoryTabContent entityId={entityId} />
        )}
      </div>
    </div>
  );
}

/**
 * TB110: History Tab Content Component
 * Shows entity's full event history in git commit log style
 */
function HistoryTabContent({ entityId }: { entityId: string }) {
  const [page, setPage] = useState(1);
  const [pageSize] = useState(() => getStoredHistoryPageSize());
  const [eventTypeFilter, setEventTypeFilter] = useState<HistoryEventTypeFilter>(() => getStoredHistoryEventType());
  const [expandedEvents, setExpandedEvents] = useState<Set<number>>(new Set());

  const { data, isLoading, isError } = useEntityHistory(entityId, page, pageSize, eventTypeFilter);

  // Handle event type filter change
  const handleEventTypeChange = (type: HistoryEventTypeFilter) => {
    setEventTypeFilter(type);
    setStoredHistoryEventType(type);
    setPage(1); // Reset to first page when filter changes
    setExpandedEvents(new Set()); // Collapse all
  };

  // Toggle event expansion
  const toggleEventExpansion = (eventId: number) => {
    setExpandedEvents((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(eventId)) {
        newSet.delete(eventId);
      } else {
        newSet.add(eventId);
      }
      return newSet;
    });
  };

  // Expand/collapse all
  const expandAll = () => {
    if (data?.items) {
      setExpandedEvents(new Set(data.items.map((e) => e.id)));
    }
  };

  const collapseAll = () => {
    setExpandedEvents(new Set());
  };

  const totalPages = data ? Math.ceil(data.total / pageSize) : 1;

  return (
    <div className="flex flex-col h-full -m-4" data-testid="entity-history-tab">
      {/* Header */}
      <div className="flex flex-col gap-2 p-3 border-b border-gray-200 bg-gray-50/50">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-gray-900 flex items-center gap-2">
            <History className="w-4 h-4" />
            Event History
            {data && (
              <span className="text-gray-500 font-normal">
                ({data.total} total)
              </span>
            )}
          </h3>
          <div className="flex items-center gap-2">
            <button
              onClick={expandAll}
              className="text-xs text-gray-600 hover:text-gray-800 px-2 py-1 rounded hover:bg-gray-100 transition-colors"
              title="Expand all"
              data-testid="history-expand-all"
            >
              <Eye className="w-3 h-3" />
            </button>
            <button
              onClick={collapseAll}
              className="text-xs text-gray-600 hover:text-gray-800 px-2 py-1 rounded hover:bg-gray-100 transition-colors"
              title="Collapse all"
              data-testid="history-collapse-all"
            >
              <EyeOff className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Event Type Filter */}
        <div className="flex gap-1 flex-wrap" data-testid="history-event-type-filter">
          {HISTORY_EVENT_TYPE_OPTIONS.map((option) => (
            <button
              key={option.value}
              onClick={() => handleEventTypeChange(option.value)}
              className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                eventTypeFilter === option.value
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
              data-testid={`history-filter-${option.value}`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
            <span className="ml-2 text-sm text-gray-500">Loading history...</span>
          </div>
        ) : isError ? (
          <div className="text-center py-8">
            <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-2" />
            <p className="text-sm text-red-600">Failed to load history</p>
          </div>
        ) : !data?.items.length ? (
          <div className="text-center py-8">
            <History className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-500">
              {eventTypeFilter !== 'all'
                ? `No ${eventTypeFilter} events found`
                : 'No events recorded yet'}
            </p>
          </div>
        ) : (
          <div className="space-y-0" data-testid="history-events-list">
            {data.items.map((event) => (
              <HistoryEventItem
                key={event.id}
                event={event}
                isExpanded={expandedEvents.has(event.id)}
                onToggle={() => toggleEventExpansion(event.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      {data && data.total > pageSize && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
          <span className="text-xs text-gray-500">
            Showing {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, data.total)} of {data.total}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-2 py-1 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              data-testid="history-prev-page"
            >
              Previous
            </button>
            <span className="px-2 text-xs text-gray-600">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="px-2 py-1 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              data-testid="history-next-page"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function EntitiesPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: '/entities' });

  // Pagination state from URL
  const currentPage = search.page ?? 1;
  const pageSize = search.limit ?? DEFAULT_PAGE_SIZE;

  const [typeFilter, setTypeFilter] = useState<EntityTypeFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(
    search.selected ?? null
  );
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);

  // Use upfront-loaded data (TB67) instead of server-side pagination
  const { data: allEntities, isLoading: isEntitiesLoading } = useAllEntitiesPreloaded();

  // Create filter function for client-side filtering
  const filterFn = useMemo(() => {
    return createEntityFilter({
      entityType: typeFilter,
      search: searchQuery,
    });
  }, [typeFilter, searchQuery]);

  // Client-side pagination with filtering (TB69)
  const paginatedData = usePaginatedData<Entity>({
    data: allEntities as Entity[] | undefined,
    page: currentPage,
    pageSize,
    filterFn,
    sort: { field: 'updatedAt', direction: 'desc' },
  });

  // Deep-link navigation (TB70)
  const deepLink = useDeepLink({
    data: allEntities as Entity[] | undefined,
    selectedId: search.selected,
    currentPage,
    pageSize,
    getId: (entity) => entity.id,
    routePath: '/entities',
    rowTestIdPrefix: 'entity-card-',
    autoNavigate: true,
    highlightDelay: 200,
  });

  // Look up entity by name if name param is provided
  const { data: entityByName } = useEntityByName(search.name ?? null);

  // Extract items from client-side paginated data (TB69)
  const entityItems = paginatedData.items;
  const totalItems = paginatedData.filteredTotal;
  const totalPages = paginatedData.totalPages;
  const isLoading = isEntitiesLoading || paginatedData.isLoading;

  // Sync selected entity from URL on mount and when search changes
  useEffect(() => {
    // When URL has a selected param, sync it to state
    if (search.selected && search.selected !== selectedEntityId) {
      setSelectedEntityId(search.selected);
    }
    // When URL doesn't have a selected param but state has one, clear state
    if (!search.selected && !search.name && selectedEntityId) {
      setSelectedEntityId(null);
    }
  }, [search.selected, search.name]);

  // Handle name lookup - when entity is found by name, select it and update URL
  useEffect(() => {
    if (search.name && entityByName) {
      setSelectedEntityId(entityByName.id);
      // Replace URL to use selected instead of name (so refresh works correctly)
      navigate({
        to: '/entities',
        search: { selected: entityByName.id, name: undefined, page: currentPage, limit: pageSize },
        replace: true,
      });
    }
  }, [search.name, entityByName, navigate, currentPage, pageSize]);

  const handleEntityCreated = (entity: Entity) => {
    setSelectedEntityId(entity.id);
    navigate({ to: '/entities', search: { selected: entity.id, name: undefined, page: currentPage, limit: pageSize } });
  };

  // Counts based on current page items (for display purposes)
  const counts = useMemo(() => {
    return {
      all: totalItems,
      agent: entityItems.filter((e) => e.entityType === 'agent').length,
      human: entityItems.filter((e) => e.entityType === 'human').length,
      system: entityItems.filter((e) => e.entityType === 'system').length,
    };
  }, [entityItems, totalItems]);

  const handleEntityClick = (entityId: string) => {
    setSelectedEntityId(entityId);
    navigate({ to: '/entities', search: { selected: entityId, name: undefined, page: currentPage, limit: pageSize } });
  };

  const handleCloseDetail = () => {
    setSelectedEntityId(null);
    navigate({ to: '/entities', search: { selected: undefined, name: undefined, page: currentPage, limit: pageSize } });
  };

  const handlePageChange = (page: number) => {
    navigate({ to: '/entities', search: { page, limit: pageSize, selected: selectedEntityId ?? undefined, name: undefined } });
  };

  const handlePageSizeChange = (newPageSize: number) => {
    // When page size changes, go back to page 1
    navigate({ to: '/entities', search: { page: 1, limit: newPageSize, selected: selectedEntityId ?? undefined, name: undefined } });
  };

  const handleTypeFilterChange = (newFilter: EntityTypeFilter) => {
    setTypeFilter(newFilter);
    // Reset to first page when filter changes
    navigate({ to: '/entities', search: { page: 1, limit: pageSize, selected: selectedEntityId ?? undefined, name: undefined } });
  };

  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
    // Reset to first page when search changes
    navigate({ to: '/entities', search: { page: 1, limit: pageSize, selected: selectedEntityId ?? undefined, name: undefined } });
  };

  const handleClearFilters = () => {
    setSearchQuery('');
    setTypeFilter('all');
    navigate({ to: '/entities', search: { page: 1, limit: pageSize, selected: selectedEntityId ?? undefined, name: undefined } });
  };

  return (
    <div className="h-full flex" data-testid="entities-page">
      {/* Register Entity Modal */}
      <RegisterEntityModal
        isOpen={isRegisterModalOpen}
        onClose={() => setIsRegisterModalOpen(false)}
        onSuccess={handleEntityCreated}
      />

      {/* Entity List */}
      <div className={`flex flex-col ${selectedEntityId ? 'w-1/2' : 'w-full'} transition-all duration-200`}>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-medium text-gray-900">Entities</h2>
          <div className="flex items-center gap-3">
            <p className="text-sm text-gray-500">
              {entityItems.length} of {totalItems} entities
            </p>
            <button
              onClick={() => setIsRegisterModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors"
              data-testid="register-entity-button"
            >
              <Plus className="w-4 h-4" />
              Register Entity
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <FilterTabs selected={typeFilter} onChange={handleTypeFilterChange} counts={counts} />
          <div className="sm:ml-auto sm:w-64">
            <SearchBox value={searchQuery} onChange={handleSearchChange} />
          </div>
        </div>

        {/* Loading state */}
        {isLoading && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-gray-500" data-testid="entities-loading">
              Loading entities...
            </div>
          </div>
        )}

        {/* Empty state */}
        {!isLoading && entityItems.length === 0 && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center" data-testid="entities-empty">
              {searchQuery || typeFilter !== 'all' ? (
                <>
                  <p className="text-gray-500">No entities match your filters</p>
                  <button
                    onClick={handleClearFilters}
                    className="mt-2 text-sm text-blue-600 hover:text-blue-700"
                    data-testid="clear-filters-button"
                  >
                    Clear filters
                  </button>
                </>
              ) : (
                <>
                  <p className="text-gray-500">No entities registered</p>
                  <p className="mt-1 text-sm text-gray-400">
                    Use <code className="bg-gray-100 px-1 rounded">el entity register</code> to add an entity
                  </p>
                </>
              )}
            </div>
          </div>
        )}

        {/* Entity grid */}
        {!isLoading && entityItems.length > 0 && (
          <div className="flex-1 overflow-auto" data-testid="entities-grid">
            <div className={`grid gap-4 ${selectedEntityId ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'}`}>
              {entityItems.map((entity) => (
                <EntityCard
                  key={entity.id}
                  entity={entity}
                  isSelected={entity.id === selectedEntityId}
                  onClick={() => handleEntityClick(entity.id)}
                />
              ))}
            </div>
            {/* Pagination */}
            <div className="mt-6">
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                totalItems={totalItems}
                pageSize={pageSize}
                onPageChange={handlePageChange}
                onPageSizeChange={handlePageSizeChange}
              />
            </div>
          </div>
        )}
      </div>

      {/* Entity Detail Panel or Not Found (TB70) */}
      {selectedEntityId && (
        <div className="w-1/2 border-l border-gray-200" data-testid="entity-detail-container">
          {deepLink.notFound ? (
            <ElementNotFound
              elementType="Entity"
              elementId={selectedEntityId}
              backRoute="/entities"
              backLabel="Back to Entities"
              onDismiss={handleCloseDetail}
            />
          ) : (
            <EntityDetailPanel entityId={selectedEntityId} onClose={handleCloseDetail} />
          )}
        </div>
      )}
    </div>
  );
}

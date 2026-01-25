/**
 * Entities Page
 *
 * Lists all entities with filtering by type and search functionality.
 * Includes detail panel with stats, activity timeline, and inbox.
 */

import { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearch, useNavigate } from '@tanstack/react-router';
import { Search, Bot, User, Server, Users, X, CheckCircle, Clock, FileText, MessageSquare, ListTodo, Activity, Plus, Loader2, Pencil, Save, Power, PowerOff, Tag, Inbox, Mail, Archive, AtSign, CheckCheck, ChevronRight, GitBranch, ChevronDown } from 'lucide-react';
import { Pagination } from '../components/shared/Pagination';

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
    createdAt: string;
  } | null;
  channel?: {
    id: string;
    name: string;
    channelType: 'group' | 'direct';
  } | null;
  sender?: Entity | null;
}

interface PaginatedResult<T> {
  items: T[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
}

const DEFAULT_PAGE_SIZE = 25;

function useEntities(
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

function useEntityInbox(id: string | null, status?: 'unread' | 'read' | 'archived' | 'all') {
  return useQuery<PaginatedResult<InboxItem>>({
    queryKey: ['entities', id, 'inbox', status],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '50', hydrate: 'true' });
      if (status && status !== 'all') {
        params.set('status', status);
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

function TaskMiniCard({ task }: { task: Task }) {
  const statusColor = STATUS_COLORS[task.status] || STATUS_COLORS.open;
  const priorityColor = PRIORITY_COLORS[task.priority] || PRIORITY_COLORS[3];

  return (
    <div className="bg-white border border-gray-100 rounded p-2 hover:border-gray-200">
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

function EventItem({ event }: { event: ElementalEvent }) {
  const getEventIcon = () => {
    switch (event.eventType) {
      case 'created':
        return <div className="w-2 h-2 bg-green-500 rounded-full" />;
      case 'updated':
        return <div className="w-2 h-2 bg-blue-500 rounded-full" />;
      case 'deleted':
        return <div className="w-2 h-2 bg-red-500 rounded-full" />;
      default:
        return <div className="w-2 h-2 bg-gray-400 rounded-full" />;
    }
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
    <div className="flex items-start gap-2 py-2">
      <div className="mt-1.5">{getEventIcon()}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-900 capitalize">{event.eventType}</span>
          <span className="text-xs text-gray-500">{event.elementType}</span>
        </div>
        <p className="text-xs text-gray-500 font-mono truncate">{event.elementId}</p>
      </div>
      <span className="text-xs text-gray-400">{formatTime(event.createdAt)}</span>
    </div>
  );
}

function InboxItemCard({
  item,
  onMarkRead,
  onMarkUnread,
  onArchive,
  isPending,
  onNavigateToMessage,
}: {
  item: InboxItem;
  onMarkRead: () => void;
  onMarkUnread: () => void;
  onArchive: () => void;
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
              {!isArchived && (
                <button
                  onClick={onArchive}
                  className="p-1 text-gray-400 hover:text-orange-600 hover:bg-orange-50 rounded transition-colors"
                  title="Archive"
                  data-testid={`inbox-archive-${item.id}`}
                >
                  <Archive className="w-4 h-4" />
                </button>
              )}
            </>
          )}
        </div>
      </div>
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

type EntityDetailTab = 'overview' | 'inbox';

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
  const { data: inboxCount } = useEntityInboxCount(entityId);
  const { data: inboxData, isLoading: inboxLoading } = useEntityInbox(entityId);
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
                <TaskMiniCard key={task.id} task={task} />
              ))}
              {activeTasks.length > 5 && (
                <div className="text-xs text-gray-500 text-center">
                  +{activeTasks.length - 5} more tasks
                </div>
              )}
            </div>
          )}
        </div>

        {/* Activity Timeline */}
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
            <div className="divide-y divide-gray-100" data-testid="entity-events">
              {events.slice(0, 10).map((event) => (
                <EventItem key={event.id} event={event} />
              ))}
            </div>
          )}
        </div>

        {/* Timestamps */}
        <div className="text-xs text-gray-400 pt-4 border-t border-gray-100">
          <div>Created: {new Date(entity.createdAt).toLocaleString()}</div>
          <div>Updated: {new Date(entity.updatedAt).toLocaleString()}</div>
        </div>
          </>
        ) : (
          /* Inbox Tab Content */
          <div data-testid="entity-inbox-tab">
            {/* Inbox Header */}
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-gray-900 flex items-center gap-2">
                <Inbox className="w-4 h-4" />
                Inbox
                {inboxCount && inboxCount.count > 0 && (
                  <span className="text-xs text-gray-500">
                    ({inboxCount.count} unread)
                  </span>
                )}
              </h3>
              {inboxCount && inboxCount.count > 0 && (
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

            {/* Inbox Items */}
            {inboxLoading ? (
              <div className="text-sm text-gray-500">Loading inbox...</div>
            ) : !inboxData || inboxData.items.length === 0 ? (
              <div className="text-center py-8" data-testid="inbox-empty">
                <Inbox className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500">No messages in inbox</p>
                <p className="text-xs text-gray-400 mt-1">
                  Direct messages and @mentions will appear here
                </p>
              </div>
            ) : (
              <div className="space-y-2" data-testid="inbox-items-list">
                {inboxData.items.map((item) => (
                  <InboxItemCard
                    key={item.id}
                    item={item}
                    onMarkRead={() => handleMarkInboxRead(item.id)}
                    onMarkUnread={() => handleMarkInboxUnread(item.id)}
                    onArchive={() => handleArchiveInbox(item.id)}
                    isPending={pendingItemId === item.id}
                    onNavigateToMessage={() => handleNavigateToMessage(item.channelId, item.messageId)}
                  />
                ))}
                {inboxData.hasMore && (
                  <div className="text-center text-xs text-gray-500 pt-2">
                    Showing {inboxData.items.length} of {inboxData.total} items
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
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

  // Fetch paginated entities with filters
  const entities = useEntities(currentPage, pageSize, typeFilter, searchQuery);

  // Look up entity by name if name param is provided
  const { data: entityByName } = useEntityByName(search.name ?? null);

  // Extract items from paginated response
  const entityItems = entities.data?.items ?? [];
  const totalItems = entities.data?.total ?? 0;
  const totalPages = Math.ceil(totalItems / pageSize);

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
        {entities.isLoading && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-gray-500" data-testid="entities-loading">
              Loading entities...
            </div>
          </div>
        )}

        {/* Error state */}
        {entities.isError && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-red-600" data-testid="entities-error">
              Failed to load entities
            </div>
          </div>
        )}

        {/* Empty state */}
        {entities.data && entityItems.length === 0 && (
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
        {entities.data && entityItems.length > 0 && (
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

      {/* Entity Detail Panel */}
      {selectedEntityId && (
        <div className="w-1/2 border-l border-gray-200" data-testid="entity-detail-container">
          <EntityDetailPanel entityId={selectedEntityId} onClose={handleCloseDetail} />
        </div>
      )}
    </div>
  );
}

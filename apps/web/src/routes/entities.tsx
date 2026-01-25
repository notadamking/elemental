/**
 * Entities Page
 *
 * Lists all entities with filtering by type and search functionality.
 * Includes detail panel with stats and activity timeline.
 */

import { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, Bot, User, Server, Users, X, CheckCircle, Clock, FileText, MessageSquare, ListTodo, Activity, Plus, Loader2 } from 'lucide-react';

interface Entity {
  id: string;
  type: 'entity';
  name: string;
  entityType: 'agent' | 'human' | 'system';
  publicKey?: string;
  active?: boolean;
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

function useEntities() {
  return useQuery<Entity[]>({
    queryKey: ['entities'],
    queryFn: async () => {
      const response = await fetch('/api/entities');
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

function EntityDetailPanel({
  entityId,
  onClose,
}: {
  entityId: string;
  onClose: () => void;
}) {
  const { data: entity, isLoading: entityLoading } = useEntity(entityId);
  const { data: stats, isLoading: statsLoading } = useEntityStats(entityId);
  const { data: tasks, isLoading: tasksLoading } = useEntityTasks(entityId);
  const { data: events, isLoading: eventsLoading } = useEntityEvents(entityId);

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
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-medium text-gray-900">{entity.name}</h2>
              {!isActive && (
                <span className="px-1.5 py-0.5 text-xs font-medium bg-gray-100 text-gray-600 rounded">
                  Inactive
                </span>
              )}
            </div>
            <p className="text-sm text-gray-500 font-mono">{entity.id}</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1 text-gray-400 hover:text-gray-600 rounded"
          data-testid="entity-detail-close"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4 space-y-6">
        {/* Entity Info */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className={`px-2 py-1 text-xs font-medium rounded ${styles.bg} ${styles.text}`}>
              {entity.entityType}
            </span>
            {entity.publicKey && (
              <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded">
                Has Public Key
              </span>
            )}
          </div>
          {entity.tags && entity.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {entity.tags.map((tag) => (
                <span key={tag} className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded">
                  {tag}
                </span>
              ))}
            </div>
          )}
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
      </div>
    </div>
  );
}

export function EntitiesPage() {
  const entities = useEntities();
  const [typeFilter, setTypeFilter] = useState<EntityTypeFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);

  const handleEntityCreated = (entity: Entity) => {
    setSelectedEntityId(entity.id);
  };

  const counts = useMemo(() => {
    const data = entities.data || [];
    return {
      all: data.length,
      agent: data.filter((e) => e.entityType === 'agent').length,
      human: data.filter((e) => e.entityType === 'human').length,
      system: data.filter((e) => e.entityType === 'system').length,
    };
  }, [entities.data]);

  const filteredEntities = useMemo(() => {
    let result = entities.data || [];

    if (typeFilter !== 'all') {
      result = result.filter((e) => e.entityType === typeFilter);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (e) =>
          e.name.toLowerCase().includes(query) ||
          e.id.toLowerCase().includes(query) ||
          e.tags.some((tag) => tag.toLowerCase().includes(query))
      );
    }

    return result;
  }, [entities.data, typeFilter, searchQuery]);

  const handleEntityClick = (entityId: string) => {
    setSelectedEntityId(entityId);
  };

  const handleCloseDetail = () => {
    setSelectedEntityId(null);
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
              {filteredEntities.length} of {entities.data?.length || 0} entities
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
          <FilterTabs selected={typeFilter} onChange={setTypeFilter} counts={counts} />
          <div className="sm:ml-auto sm:w-64">
            <SearchBox value={searchQuery} onChange={setSearchQuery} />
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
        {entities.data && filteredEntities.length === 0 && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center" data-testid="entities-empty">
              {searchQuery || typeFilter !== 'all' ? (
                <>
                  <p className="text-gray-500">No entities match your filters</p>
                  <button
                    onClick={() => {
                      setSearchQuery('');
                      setTypeFilter('all');
                    }}
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
        {entities.data && filteredEntities.length > 0 && (
          <div className="flex-1 overflow-auto" data-testid="entities-grid">
            <div className={`grid gap-4 ${selectedEntityId ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'}`}>
              {filteredEntities.map((entity) => (
                <EntityCard
                  key={entity.id}
                  entity={entity}
                  isSelected={entity.id === selectedEntityId}
                  onClick={() => handleEntityClick(entity.id)}
                />
              ))}
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

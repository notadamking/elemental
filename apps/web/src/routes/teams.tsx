/**
 * Teams Page
 *
 * Lists all teams with member count and avatar previews.
 * Includes detail panel for selected team.
 */

import { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearch, useNavigate } from '@tanstack/react-router';
import { Search, Users, X, Bot, User, Server, ListTodo, CheckCircle, Clock, PlusCircle, Plus, Loader2, Pencil, Save, Trash2, UserMinus } from 'lucide-react';
import { Pagination } from '../components/shared/Pagination';
import { ElementNotFound } from '../components/shared/ElementNotFound';
import { useAllTeams } from '../api/hooks/useAllElements';
import { usePaginatedData, createTeamFilter } from '../hooks/usePaginatedData';
import { useDeepLink } from '../hooks/useDeepLink';
import { EntityLink } from '../components/entity/EntityLink';

interface Team {
  id: string;
  type: 'team';
  name: string;
  members: string[];
  status?: 'active' | 'tombstone';
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

interface Entity {
  id: string;
  type: 'entity';
  name: string;
  entityType: 'agent' | 'human' | 'system';
  active?: boolean;
  tags: string[];
  createdAt: string;
  updatedAt: string;
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
function _useTeams(
  page: number,
  pageSize: number = DEFAULT_PAGE_SIZE,
  searchQuery: string = ''
) {
  const offset = (page - 1) * pageSize;

  return useQuery<PaginatedResult<Team>>({
    queryKey: ['teams', 'paginated', page, pageSize, searchQuery],
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: pageSize.toString(),
        offset: offset.toString(),
        orderBy: 'updated_at',
        orderDir: 'desc',
      });

      if (searchQuery.trim()) {
        params.set('search', searchQuery.trim());
      }

      const response = await fetch(`/api/teams?${params}`);
      if (!response.ok) throw new Error('Failed to fetch teams');
      return response.json();
    },
  });
}
void _useTeams; // Suppress unused warning

function useTeam(id: string | null) {
  return useQuery<Team>({
    queryKey: ['teams', id],
    queryFn: async () => {
      const response = await fetch(`/api/teams/${id}`);
      if (!response.ok) throw new Error('Failed to fetch team');
      return response.json();
    },
    enabled: !!id,
  });
}

function useTeamMembers(id: string | null) {
  return useQuery<Entity[]>({
    queryKey: ['teams', id, 'members'],
    queryFn: async () => {
      const response = await fetch(`/api/teams/${id}/members`);
      if (!response.ok) throw new Error('Failed to fetch team members');
      return response.json();
    },
    enabled: !!id,
  });
}

interface TeamStats {
  memberCount: number;
  totalTasksAssigned: number;
  activeTasksAssigned: number;
  completedTasksAssigned: number;
  createdByTeamMembers: number;
  tasksByMember: Record<string, { assigned: number; active: number; completed: number }>;
  workloadDistribution: { memberId: string; taskCount: number; percentage: number }[];
}

function useTeamStats(id: string | null) {
  return useQuery<TeamStats>({
    queryKey: ['teams', id, 'stats'],
    queryFn: async () => {
      const response = await fetch(`/api/teams/${id}/stats`);
      if (!response.ok) throw new Error('Failed to fetch team stats');
      return response.json();
    },
    enabled: !!id,
  });
}

interface UpdateTeamInput {
  name?: string;
  tags?: string[];
  addMembers?: string[];
  removeMembers?: string[];
}

function useUpdateTeam() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: UpdateTeamInput }) => {
      const response = await fetch(`/api/teams/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to update team');
      }

      return response.json();
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      queryClient.invalidateQueries({ queryKey: ['teams', id] });
      queryClient.invalidateQueries({ queryKey: ['teams', id, 'members'] });
    },
  });
}

function useDeleteTeam() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/teams/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to delete team');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
    },
  });
}

interface CreateTeamInput {
  name: string;
  members?: string[];
  createdBy?: string;
  tags?: string[];
}

function useCreateTeam() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateTeamInput) => {
      const response = await fetch('/api/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to create team');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
    },
  });
}

function useAllEntities() {
  return useQuery<Entity[]>({
    queryKey: ['entities', 'all'],
    queryFn: async () => {
      // Fetch all entities with a high limit for the member picker
      const response = await fetch('/api/entities?limit=1000');
      if (!response.ok) throw new Error('Failed to fetch entities');
      const data = await response.json();
      // Handle paginated response format
      return data.items || data;
    },
  });
}

function CreateTeamModal({
  isOpen,
  onClose,
  onSuccess,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (team: Team) => void;
}) {
  const [name, setName] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [tags, setTags] = useState('');
  const [memberSearch, setMemberSearch] = useState('');

  const nameInputRef = useRef<HTMLInputElement>(null);
  const createTeam = useCreateTeam();
  const entities = useAllEntities();

  // Filter entities based on search
  const availableEntities = useMemo(() => {
    const allEntities = entities.data || [];
    if (!memberSearch.trim()) {
      return allEntities.filter((e) => !selectedMembers.includes(e.id));
    }
    const query = memberSearch.toLowerCase();
    return allEntities.filter(
      (e) =>
        !selectedMembers.includes(e.id) &&
        (e.name.toLowerCase().includes(query) ||
          e.id.toLowerCase().includes(query))
    );
  }, [entities.data, memberSearch, selectedMembers]);

  // Get selected entity details
  const selectedEntities = useMemo(() => {
    return (entities.data || []).filter((e) => selectedMembers.includes(e.id));
  }, [entities.data, selectedMembers]);

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
      setSelectedMembers([]);
      setTags('');
      setMemberSearch('');
      createTeam.reset();
    }
  }, [isOpen]);

  const handleAddMember = (entityId: string) => {
    setSelectedMembers((prev) => [...prev, entityId]);
    setMemberSearch('');
  };

  const handleRemoveMember = (entityId: string) => {
    setSelectedMembers((prev) => prev.filter((id) => id !== entityId));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) return;

    const input: CreateTeamInput = {
      name: name.trim(),
      members: selectedMembers,
    };

    if (tags.trim()) {
      input.tags = tags.split(',').map((t) => t.trim()).filter(Boolean);
    }

    try {
      const result = await createTeam.mutateAsync(input);
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
    <div className="fixed inset-0 z-50" data-testid="create-team-modal" onKeyDown={handleKeyDown}>
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        data-testid="create-team-modal-backdrop"
      />

      {/* Dialog */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden flex flex-col max-h-full">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Create Team</h2>
            <button
              onClick={onClose}
              className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
              aria-label="Close"
              data-testid="create-team-modal-close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-4 overflow-auto flex-1">
            {/* Name */}
            <div className="mb-4">
              <label htmlFor="team-name" className="block text-sm font-medium text-gray-700 mb-1">
                Team Name <span className="text-red-500">*</span>
              </label>
              <input
                ref={nameInputRef}
                id="team-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter team name..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                data-testid="create-team-name-input"
                required
              />
            </div>

            {/* Members */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Members <span className="text-gray-400">(optional)</span>
              </label>

              {/* Selected Members */}
              {selectedEntities.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2" data-testid="selected-members">
                  {selectedEntities.map((entity) => {
                    const styles = ENTITY_TYPE_STYLES[entity.entityType] || ENTITY_TYPE_STYLES.system;
                    const Icon = styles.icon;
                    return (
                      <div
                        key={entity.id}
                        className="inline-flex items-center gap-1.5 px-2 py-1 bg-gray-100 rounded-full text-sm"
                        data-testid={`selected-member-${entity.id}`}
                      >
                        <Icon className={`w-3.5 h-3.5 ${styles.text}`} />
                        <span className="text-gray-700">{entity.name}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveMember(entity.id)}
                          className="p-0.5 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-200"
                          data-testid={`remove-member-${entity.id}`}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Member Search */}
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  placeholder="Search entities to add..."
                  className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  data-testid="member-search-input"
                />
              </div>

              {/* Available Entities */}
              {memberSearch.trim() && (
                <div className="mt-2 max-h-40 overflow-auto border border-gray-200 rounded-md" data-testid="entity-search-results">
                  {entities.isLoading ? (
                    <div className="p-3 text-sm text-gray-500 text-center">Loading entities...</div>
                  ) : availableEntities.length === 0 ? (
                    <div className="p-3 text-sm text-gray-500 text-center">No matching entities</div>
                  ) : (
                    availableEntities.slice(0, 10).map((entity) => {
                      const styles = ENTITY_TYPE_STYLES[entity.entityType] || ENTITY_TYPE_STYLES.system;
                      const Icon = styles.icon;
                      return (
                        <button
                          key={entity.id}
                          type="button"
                          onClick={() => handleAddMember(entity.id)}
                          className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 text-left"
                          data-testid={`add-member-${entity.id}`}
                        >
                          <Icon className={`w-4 h-4 ${styles.text}`} />
                          <span className="text-sm text-gray-900">{entity.name}</span>
                          <span className={`ml-auto px-1.5 py-0.5 text-xs font-medium rounded ${styles.bg} ${styles.text}`}>
                            {entity.entityType}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            {/* Tags (optional) */}
            <div className="mb-4">
              <label htmlFor="team-tags" className="block text-sm font-medium text-gray-700 mb-1">
                Tags <span className="text-gray-400">(optional)</span>
              </label>
              <input
                id="team-tags"
                type="text"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="Enter tags separated by commas..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                data-testid="create-team-tags-input"
              />
            </div>

            {/* Error */}
            {createTeam.isError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-600" data-testid="create-team-error">
                {createTeam.error.message}
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
                data-testid="create-team-cancel"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!name.trim() || createTeam.isPending}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                data-testid="create-team-submit"
              >
                {createTeam.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    Create Team
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

function MemberAvatarStack({ memberIds, maxDisplay = 5 }: { memberIds: string[]; maxDisplay?: number }) {
  // For the preview, we just show placeholder circles based on member count
  const displayCount = Math.min(memberIds.length, maxDisplay);
  const remaining = memberIds.length - displayCount;

  return (
    <div className="flex -space-x-2" data-testid="member-avatar-stack">
      {Array.from({ length: displayCount }).map((_, i) => (
        <div
          key={i}
          className="w-8 h-8 rounded-full bg-gray-200 ring-2 ring-white flex items-center justify-center"
        >
          <Users className="w-4 h-4 text-gray-400" />
        </div>
      ))}
      {remaining > 0 && (
        <div className="w-8 h-8 rounded-full bg-gray-100 ring-2 ring-white flex items-center justify-center text-xs font-medium text-gray-600">
          +{remaining}
        </div>
      )}
    </div>
  );
}

function TeamCard({
  team,
  isSelected,
  onClick,
}: {
  team: Team;
  isSelected: boolean;
  onClick: () => void;
}) {
  const isActive = team.status !== 'tombstone';
  const memberCount = team.members?.length || 0;

  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-lg border p-4 transition-colors cursor-pointer ${
        isSelected
          ? 'border-blue-500 ring-2 ring-blue-200'
          : 'border-gray-200 hover:border-gray-300'
      } ${!isActive ? 'opacity-60' : ''}`}
      data-testid={`team-card-${team.id}`}
    >
      <div className="flex items-start gap-3">
        <div
          className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center"
          data-testid={`team-avatar-${team.id}`}
        >
          <Users className="w-5 h-5 text-indigo-600" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-gray-900 truncate">{team.name}</h3>
            {!isActive && (
              <span className="px-1.5 py-0.5 text-xs font-medium bg-gray-100 text-gray-600 rounded">
                Deleted
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 font-mono truncate">{team.id}</p>
        </div>

        <span
          className="px-2 py-1 text-xs font-medium rounded bg-indigo-100 text-indigo-800"
          data-testid={`team-member-count-${team.id}`}
        >
          {memberCount} {memberCount === 1 ? 'member' : 'members'}
        </span>
      </div>

      {/* Member Avatar Stack */}
      {memberCount > 0 && (
        <div className="mt-3">
          <MemberAvatarStack memberIds={team.members} maxDisplay={5} />
        </div>
      )}

      {/* Tags */}
      {team.tags && team.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {team.tags.slice(0, 3).map((tag) => (
            <span key={tag} className="px-1.5 py-0.5 text-xs bg-gray-100 text-gray-600 rounded">
              {tag}
            </span>
          ))}
          {team.tags.length > 3 && (
            <span className="text-xs text-gray-500">+{team.tags.length - 3}</span>
          )}
        </div>
      )}

      <div className="mt-3 text-xs text-gray-400">
        Created {new Date(team.createdAt).toLocaleDateString()}
      </div>
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
    <div className="relative" data-testid="team-search">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search teams..."
        className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        data-testid="team-search-input"
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

function WorkloadBar({
  memberId,
  memberName,
  taskCount,
  percentage,
  maxTasks,
  onClick,
}: {
  memberId: string;
  memberName: string;
  taskCount: number;
  percentage: number;
  maxTasks: number;
  onClick?: () => void;
}) {
  const barWidth = maxTasks > 0 ? Math.round((taskCount / maxTasks) * 100) : 0;
  const navigate = useNavigate();

  const handleClick = () => {
    if (onClick) {
      onClick();
    } else {
      // Default behavior: navigate to tasks filtered by this member (TB105)
      navigate({
        to: '/tasks',
        search: { assignee: memberId, page: 1, limit: 25 },
      });
    }
  };

  return (
    <button
      className="flex items-center gap-3 w-full text-left hover:bg-gray-50 rounded p-1 -mx-1 transition-colors cursor-pointer group"
      data-testid={`workload-bar-${memberId}`}
      onClick={handleClick}
      title={`Click to view ${memberName}'s tasks`}
    >
      <div className="w-24 truncate text-sm text-gray-700 group-hover:text-blue-600">{memberName}</div>
      <div className="flex-1 h-6 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-indigo-500 rounded-full transition-all"
          style={{ width: `${barWidth}%` }}
        />
      </div>
      <div className="w-16 text-right text-sm text-gray-600">
        {taskCount} ({percentage}%)
      </div>
    </button>
  );
}

function TeamDetailPanel({
  teamId,
  onClose,
  onDeleted,
}: {
  teamId: string;
  onClose: () => void;
  onDeleted?: () => void;
}) {
  const { data: team, isLoading: teamLoading } = useTeam(teamId);
  const { data: members, isLoading: membersLoading } = useTeamMembers(teamId);
  const { data: stats, isLoading: statsLoading } = useTeamStats(teamId);
  const entities = useAllEntities();
  const updateTeam = useUpdateTeam();
  const deleteTeam = useDeleteTeam();

  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');

  const nameInputRef = useRef<HTMLInputElement>(null);

  // Focus name input when editing
  useEffect(() => {
    if (isEditingName && nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, [isEditingName]);

  // Available entities to add (not already members)
  const availableEntities = useMemo(() => {
    const teamMemberIds = team?.members || [];
    const allEntities = entities.data || [];
    if (!memberSearch.trim()) {
      return allEntities.filter((e) => !teamMemberIds.includes(e.id));
    }
    const query = memberSearch.toLowerCase();
    return allEntities.filter(
      (e) =>
        !teamMemberIds.includes(e.id) &&
        (e.name.toLowerCase().includes(query) || e.id.toLowerCase().includes(query))
    );
  }, [entities.data, team?.members, memberSearch]);

  if (teamLoading) {
    return (
      <div className="h-full flex items-center justify-center" data-testid="team-detail-loading">
        <span className="text-gray-500">Loading...</span>
      </div>
    );
  }

  if (!team) {
    return (
      <div className="h-full flex items-center justify-center" data-testid="team-detail-error">
        <span className="text-red-600">Team not found</span>
      </div>
    );
  }

  const isActive = team.status !== 'tombstone';
  const memberCount = team.members?.length || 0;

  // Create a map of member IDs to names for the workload chart
  const memberNameMap: Record<string, string> = {};
  if (members) {
    for (const member of members) {
      memberNameMap[member.id] = member.name;
    }
  }

  // Find max tasks for scaling the workload bars
  const maxTasks = stats?.workloadDistribution?.reduce((max, item) =>
    Math.max(max, item.taskCount), 0
  ) || 0;

  const handleStartEditName = () => {
    setEditName(team.name);
    setIsEditingName(true);
  };

  const handleSaveName = async () => {
    if (!editName.trim() || editName.trim() === team.name) {
      setIsEditingName(false);
      return;
    }

    try {
      await updateTeam.mutateAsync({ id: teamId, input: { name: editName.trim() } });
      setIsEditingName(false);
    } catch {
      // Error is handled by mutation state
    }
  };

  const handleCancelEditName = () => {
    setIsEditingName(false);
    setEditName('');
  };

  const handleNameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveName();
    } else if (e.key === 'Escape') {
      handleCancelEditName();
    }
  };

  const handleAddMember = async (entityId: string) => {
    try {
      await updateTeam.mutateAsync({ id: teamId, input: { addMembers: [entityId] } });
      setMemberSearch('');
    } catch {
      // Error is handled by mutation state
    }
  };

  const handleRemoveMember = async (entityId: string) => {
    try {
      await updateTeam.mutateAsync({ id: teamId, input: { removeMembers: [entityId] } });
    } catch {
      // Error is handled by mutation state
    }
  };

  const handleDelete = async () => {
    try {
      await deleteTeam.mutateAsync(teamId);
      setShowDeleteConfirm(false);
      onDeleted?.();
      onClose();
    } catch {
      // Error is handled by mutation state
    }
  };

  return (
    <div className="h-full flex flex-col" data-testid="team-detail-panel">
      {/* Header */}
      <div className="flex items-start justify-between p-4 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center">
            <Users className="w-6 h-6 text-indigo-600" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              {isEditingName ? (
                <div className="flex items-center gap-1">
                  <input
                    ref={nameInputRef}
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={handleNameKeyDown}
                    className="px-2 py-1 text-lg font-medium text-gray-900 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                    data-testid="team-name-input"
                  />
                  <button
                    onClick={handleSaveName}
                    disabled={updateTeam.isPending}
                    className="p-1 text-green-600 hover:bg-green-50 rounded"
                    data-testid="team-name-save"
                  >
                    {updateTeam.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={handleCancelEditName}
                    className="p-1 text-gray-400 hover:bg-gray-100 rounded"
                    data-testid="team-name-cancel"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <>
                  <h2 className="text-lg font-medium text-gray-900">{team.name}</h2>
                  {isActive && (
                    <button
                      onClick={handleStartEditName}
                      className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
                      data-testid="team-name-edit"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                  )}
                  {!isActive && (
                    <span className="px-1.5 py-0.5 text-xs font-medium bg-gray-100 text-gray-600 rounded">
                      Deleted
                    </span>
                  )}
                </>
              )}
            </div>
            <p className="text-sm text-gray-500 font-mono">{team.id}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {isActive && (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded"
              data-testid="team-delete-button"
              title="Delete team"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 rounded"
            data-testid="team-detail-close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50" data-testid="delete-team-confirm-modal">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowDeleteConfirm(false)} />
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm">
            <div className="bg-white rounded-lg shadow-xl p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-2">Delete Team?</h3>
              <p className="text-sm text-gray-500 mb-4">
                Are you sure you want to delete <strong>{team.name}</strong>? This action cannot be undone.
              </p>
              {deleteTeam.isError && (
                <div className="mb-4 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-600">
                  {deleteTeam.error.message}
                </div>
              )}
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-md"
                  data-testid="delete-team-cancel"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleteTeam.isPending}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md disabled:opacity-50"
                  data-testid="delete-team-confirm"
                >
                  {deleteTeam.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      Delete
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-auto p-4 space-y-6">
        {/* Update Error */}
        {updateTeam.isError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-600" data-testid="team-update-error">
            {updateTeam.error.message}
          </div>
        )}

        {/* Team Info */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="px-2 py-1 text-sm font-medium bg-indigo-100 text-indigo-800 rounded">
              {memberCount} {memberCount === 1 ? 'Member' : 'Members'}
            </span>
            {team.status && (
              <span className={`px-2 py-1 text-xs font-medium rounded ${
                team.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
              }`}>
                {team.status}
              </span>
            )}
          </div>

          {/* Tags */}
          {team.tags && team.tags.length > 0 && (
            <div className="flex flex-wrap gap-1" data-testid="team-tags">
              {team.tags.map((tag) => (
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
            <div className="grid grid-cols-2 gap-3" data-testid="team-stats">
              <StatCard icon={ListTodo} label="Total Tasks" value={stats.totalTasksAssigned} />
              <StatCard icon={Clock} label="Active Tasks" value={stats.activeTasksAssigned} color="text-yellow-600" />
              <StatCard icon={CheckCircle} label="Completed" value={stats.completedTasksAssigned} color="text-green-600" />
              <StatCard icon={PlusCircle} label="Created by Team" value={stats.createdByTeamMembers} color="text-blue-600" />
            </div>
          ) : null}
        </div>

        {/* Workload Distribution */}
        {stats && stats.workloadDistribution && stats.workloadDistribution.length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-gray-900 mb-3">Workload Distribution</h3>
            <div className="space-y-2" data-testid="team-workload">
              {stats.workloadDistribution.map((item) => (
                <WorkloadBar
                  key={item.memberId}
                  memberId={item.memberId}
                  memberName={memberNameMap[item.memberId] || item.memberId}
                  taskCount={item.taskCount}
                  percentage={item.percentage}
                  maxTasks={maxTasks}
                />
              ))}
            </div>
          </div>
        )}

        {/* Members List */}
        <div>
          <h3 className="text-sm font-medium text-gray-900 mb-3">
            Team Members ({memberCount})
          </h3>

          {/* Add Member Search (only for active teams) */}
          {isActive && (
            <div className="mb-3">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  placeholder="Add member..."
                  className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  data-testid="add-member-search"
                />
              </div>
              {memberSearch.trim() && (
                <div className="mt-1 max-h-32 overflow-auto border border-gray-200 rounded-md bg-white shadow-lg" data-testid="add-member-results">
                  {entities.isLoading ? (
                    <div className="p-2 text-sm text-gray-500 text-center">Loading...</div>
                  ) : availableEntities.length === 0 ? (
                    <div className="p-2 text-sm text-gray-500 text-center">No matching entities</div>
                  ) : (
                    availableEntities.slice(0, 5).map((entity) => {
                      const styles = ENTITY_TYPE_STYLES[entity.entityType] || ENTITY_TYPE_STYLES.system;
                      const Icon = styles.icon;
                      return (
                        <button
                          key={entity.id}
                          type="button"
                          onClick={() => handleAddMember(entity.id)}
                          disabled={updateTeam.isPending}
                          className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 text-left disabled:opacity-50"
                          data-testid={`add-member-option-${entity.id}`}
                        >
                          <Plus className="w-3 h-3 text-green-500" />
                          <Icon className={`w-4 h-4 ${styles.text}`} />
                          <span className="text-sm text-gray-900">{entity.name}</span>
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          )}

          {membersLoading ? (
            <div className="text-sm text-gray-500">Loading members...</div>
          ) : members && members.length > 0 ? (
            <div className="space-y-1" data-testid="team-members-list">
              {members.map((member) => {
                const styles = ENTITY_TYPE_STYLES[member.entityType] || ENTITY_TYPE_STYLES.system;
                const Icon = styles.icon;
                return (
                  <div
                    key={member.id}
                    className="flex items-center justify-between gap-2 p-2 rounded-md hover:bg-gray-50 group"
                    data-testid={`member-item-${member.id}`}
                  >
                    <div className="flex items-center gap-2">
                      <Icon className={`w-4 h-4 ${styles.text}`} />
                      <EntityLink
                        entityRef={member.id}
                        className="text-sm"
                        data-testid={`member-link-${member.id}`}
                      >
                        {member.name}
                      </EntityLink>
                      <span className={`px-1.5 py-0.5 text-xs font-medium rounded ${styles.bg} ${styles.text}`}>
                        {member.entityType}
                      </span>
                    </div>
                    {isActive && (
                      <button
                        onClick={() => handleRemoveMember(member.id)}
                        disabled={updateTeam.isPending}
                        className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
                        title="Remove from team"
                        data-testid={`remove-member-${member.id}`}
                      >
                        <UserMinus className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          ) : memberCount > 0 ? (
            <div className="text-sm text-gray-500">
              {memberCount} members (details not available)
            </div>
          ) : (
            <div className="text-sm text-gray-500">No members</div>
          )}
        </div>

        {/* Timestamps */}
        <div className="text-xs text-gray-400 pt-4 border-t border-gray-100">
          <div>Created: {new Date(team.createdAt).toLocaleString()}</div>
          <div>Updated: {new Date(team.updatedAt).toLocaleString()}</div>
        </div>
      </div>
    </div>
  );
}

export function TeamsPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: '/teams' });

  // Pagination state from URL
  const currentPage = search.page ?? 1;
  const pageSize = search.limit ?? DEFAULT_PAGE_SIZE;

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(
    search.selected ?? null
  );
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // Use upfront-loaded data (TB67) instead of server-side pagination
  const { data: allTeams, isLoading: isTeamsLoading } = useAllTeams();

  // Create filter function for client-side filtering
  const filterFn = useMemo(() => {
    return createTeamFilter({ search: searchQuery });
  }, [searchQuery]);

  // Client-side pagination with filtering (TB69)
  const paginatedData = usePaginatedData<Team>({
    data: allTeams as Team[] | undefined,
    page: currentPage,
    pageSize,
    filterFn,
    sort: { field: 'updatedAt', direction: 'desc' },
  });

  // Deep-link navigation (TB70)
  const deepLink = useDeepLink({
    data: allTeams as Team[] | undefined,
    selectedId: search.selected,
    currentPage,
    pageSize,
    getId: (team) => team.id,
    routePath: '/teams',
    rowTestIdPrefix: 'team-card-',
    autoNavigate: true,
    highlightDelay: 200,
  });

  // Extract items from client-side paginated data (TB69)
  const teamItems = paginatedData.items;
  const totalItems = paginatedData.filteredTotal;
  const totalPages = paginatedData.totalPages;
  const isLoading = isTeamsLoading || paginatedData.isLoading;

  // Sync selected team from URL on mount and when search changes
  useEffect(() => {
    // When URL has a selected param, sync it to state
    if (search.selected && search.selected !== selectedTeamId) {
      setSelectedTeamId(search.selected);
    }
    // When URL doesn't have a selected param but state has one, clear state
    if (!search.selected && selectedTeamId) {
      setSelectedTeamId(null);
    }
  }, [search.selected]);

  const handleTeamClick = (teamId: string) => {
    setSelectedTeamId(teamId);
    navigate({ to: '/teams', search: { selected: teamId, page: currentPage, limit: pageSize } });
  };

  const handleCloseDetail = () => {
    setSelectedTeamId(null);
    navigate({ to: '/teams', search: { selected: undefined, page: currentPage, limit: pageSize } });
  };

  const handleTeamCreated = (team: Team) => {
    setSelectedTeamId(team.id);
    navigate({ to: '/teams', search: { selected: team.id, page: currentPage, limit: pageSize } });
  };

  const handlePageChange = (page: number) => {
    navigate({ to: '/teams', search: { page, limit: pageSize, selected: selectedTeamId ?? undefined } });
  };

  const handlePageSizeChange = (newPageSize: number) => {
    // When page size changes, go back to page 1
    navigate({ to: '/teams', search: { page: 1, limit: newPageSize, selected: selectedTeamId ?? undefined } });
  };

  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
    // Reset to first page when search changes
    navigate({ to: '/teams', search: { page: 1, limit: pageSize, selected: selectedTeamId ?? undefined } });
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    navigate({ to: '/teams', search: { page: 1, limit: pageSize, selected: selectedTeamId ?? undefined } });
  };

  return (
    <div className="h-full flex" data-testid="teams-page">
      {/* Create Team Modal */}
      <CreateTeamModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={handleTeamCreated}
      />

      {/* Team List */}
      <div className={`flex flex-col ${selectedTeamId ? 'w-1/2' : 'w-full'} transition-all duration-200`}>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-medium text-gray-900">Teams</h2>
          <div className="flex items-center gap-3">
            <p className="text-sm text-gray-500">
              {teamItems.length} of {totalItems} teams
            </p>
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors"
              data-testid="new-team-button"
            >
              <Plus className="w-4 h-4" />
              New Team
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="mb-6">
          <SearchBox value={searchQuery} onChange={handleSearchChange} />
        </div>

        {/* Loading state */}
        {isLoading && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-gray-500" data-testid="teams-loading">
              Loading teams...
            </div>
          </div>
        )}

        {/* Empty state */}
        {!isLoading && teamItems.length === 0 && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center" data-testid="teams-empty">
              {searchQuery ? (
                <>
                  <p className="text-gray-500">No teams match your search</p>
                  <button
                    onClick={handleClearSearch}
                    className="mt-2 text-sm text-blue-600 hover:text-blue-700"
                    data-testid="clear-search-button"
                  >
                    Clear search
                  </button>
                </>
              ) : (
                <>
                  <p className="text-gray-500">No teams created</p>
                  <button
                    onClick={() => setIsCreateModalOpen(true)}
                    className="mt-2 text-sm text-blue-600 hover:text-blue-700"
                    data-testid="create-team-empty-button"
                  >
                    Create one
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* Teams grid */}
        {!isLoading && teamItems.length > 0 && (
          <div className="flex-1 overflow-auto" data-testid="teams-grid">
            <div className={`grid gap-4 ${selectedTeamId ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'}`}>
              {teamItems.map((team) => (
                <TeamCard
                  key={team.id}
                  team={team}
                  isSelected={team.id === selectedTeamId}
                  onClick={() => handleTeamClick(team.id)}
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

      {/* Team Detail Panel or Not Found (TB70) */}
      {selectedTeamId && (
        <div className="w-1/2 border-l border-gray-200" data-testid="team-detail-container">
          {deepLink.notFound ? (
            <ElementNotFound
              elementType="Team"
              elementId={selectedTeamId}
              backRoute="/teams"
              backLabel="Back to Teams"
              onDismiss={handleCloseDetail}
            />
          ) : (
            <TeamDetailPanel teamId={selectedTeamId} onClose={handleCloseDetail} onDeleted={() => setSelectedTeamId(null)} />
          )}
        </div>
      )}
    </div>
  );
}

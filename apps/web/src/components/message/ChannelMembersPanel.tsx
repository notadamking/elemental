/**
 * Channel Members Panel
 *
 * A slide-over panel for viewing and managing channel members.
 * Shows member list, allows adding/removing members (if permitted).
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X, UserPlus, UserMinus, Users, Crown, LogOut, Loader2, AlertCircle } from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

interface Entity {
  id: string;
  name: string;
  entityType: 'human' | 'agent' | 'system';
  notFound?: boolean;
}

interface ChannelMembersData {
  members: (Entity | { id: string; name: string; notFound: true })[];
  permissions: {
    visibility: 'public' | 'private';
    joinPolicy: 'open' | 'invite-only' | 'request';
    modifyMembers: string[];
  };
  channelType: 'direct' | 'group';
}

interface Channel {
  id: string;
  name: string;
  channelType: 'direct' | 'group';
  members: string[];
  createdBy: string;
  permissions: {
    visibility: 'public' | 'private';
    joinPolicy: 'open' | 'invite-only' | 'request';
    modifyMembers: string[];
  };
}

interface ChannelMembersPanelProps {
  channel: Channel;
  currentOperator: string; // The current user/operator's entity ID
  onClose: () => void;
}

// ============================================================================
// API Hooks
// ============================================================================

function useChannelMembers(channelId: string) {
  return useQuery<ChannelMembersData>({
    queryKey: ['channels', channelId, 'members'],
    queryFn: async () => {
      const response = await fetch(`/api/channels/${channelId}/members?hydrate=true`);
      if (!response.ok) {
        throw new Error('Failed to fetch channel members');
      }
      return response.json();
    },
  });
}

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

function useAddMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      channelId,
      entityId,
      actor,
    }: {
      channelId: string;
      entityId: string;
      actor: string;
    }) => {
      const response = await fetch(`/api/channels/${channelId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityId, actor }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to add member');
      }
      return response.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['channels', variables.channelId, 'members'],
      });
      queryClient.invalidateQueries({
        queryKey: ['channels', variables.channelId],
      });
      queryClient.invalidateQueries({ queryKey: ['channels'] });
    },
  });
}

function useRemoveMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      channelId,
      entityId,
      actor,
    }: {
      channelId: string;
      entityId: string;
      actor: string;
    }) => {
      const response = await fetch(
        `/api/channels/${channelId}/members/${entityId}?actor=${encodeURIComponent(actor)}`,
        { method: 'DELETE' }
      );
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to remove member');
      }
      return response.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['channels', variables.channelId, 'members'],
      });
      queryClient.invalidateQueries({
        queryKey: ['channels', variables.channelId],
      });
      queryClient.invalidateQueries({ queryKey: ['channels'] });
    },
  });
}

function useLeaveChannel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      channelId,
      actor,
    }: {
      channelId: string;
      actor: string;
    }) => {
      const response = await fetch(`/api/channels/${channelId}/leave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to leave channel');
      }
      return response.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['channels', variables.channelId, 'members'],
      });
      queryClient.invalidateQueries({
        queryKey: ['channels', variables.channelId],
      });
      queryClient.invalidateQueries({ queryKey: ['channels'] });
    },
  });
}

// ============================================================================
// Components
// ============================================================================

function MemberAvatar({ name, entityType }: { name: string; entityType?: string }) {
  const colors: Record<string, string> = {
    human: 'bg-blue-100 text-blue-600',
    agent: 'bg-purple-100 text-purple-600',
    system: 'bg-gray-100 text-gray-600',
  };
  const colorClass = colors[entityType || 'system'] || colors.system;

  return (
    <div
      className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${colorClass}`}
    >
      <span className="text-sm font-medium">
        {name.slice(0, 2).toUpperCase()}
      </span>
    </div>
  );
}

function MemberRow({
  member,
  isCreator,
  canModify,
  canRemove,
  onRemove,
  isRemoving,
}: {
  member: Entity | { id: string; name: string; notFound?: true };
  isCreator: boolean;
  canModify: boolean;
  canRemove: boolean;
  onRemove: () => void;
  isRemoving: boolean;
}) {
  const [showConfirm, setShowConfirm] = useState(false);
  const entityType = 'entityType' in member ? member.entityType : undefined;
  const isNotFound = 'notFound' in member && member.notFound;

  const handleRemoveClick = () => {
    setShowConfirm(true);
  };

  const handleConfirmRemove = () => {
    setShowConfirm(false);
    onRemove();
  };

  return (
    <div
      data-testid={`member-${member.id}`}
      className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 group relative"
    >
      <MemberAvatar name={member.name} entityType={entityType} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span
            className={`text-sm font-medium truncate ${isNotFound ? 'text-gray-400 italic' : 'text-gray-900'}`}
          >
            {member.name}
          </span>
          {isCreator && (
            <span title="Channel creator">
              <Crown className="w-4 h-4 text-amber-500 flex-shrink-0" />
            </span>
          )}
        </div>
        {entityType && !isNotFound && (
          <span className="text-xs text-gray-500 capitalize">{entityType}</span>
        )}
        {isNotFound && (
          <span className="text-xs text-gray-400">Entity not found</span>
        )}
      </div>
      {canModify && canRemove && !showConfirm && (
        <button
          onClick={handleRemoveClick}
          disabled={isRemoving}
          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
          title="Remove member"
          data-testid={`remove-member-${member.id}`}
        >
          {isRemoving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <UserMinus className="w-4 h-4" />
          )}
        </button>
      )}

      {/* Confirmation buttons */}
      {showConfirm && (
        <div className="flex items-center gap-1" data-testid={`confirm-remove-${member.id}`}>
          <button
            onClick={handleConfirmRemove}
            disabled={isRemoving}
            className="px-2 py-1 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded disabled:opacity-50"
            data-testid={`confirm-remove-yes-${member.id}`}
          >
            {isRemoving ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Remove'}
          </button>
          <button
            onClick={() => setShowConfirm(false)}
            className="px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded"
            data-testid={`confirm-remove-cancel-${member.id}`}
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

function AddMemberForm({
  channelId,
  currentMembers,
  currentOperator,
  onSuccess,
}: {
  channelId: string;
  currentMembers: string[];
  currentOperator: string;
  onSuccess: () => void;
}) {
  const [selectedEntity, setSelectedEntity] = useState('');
  const { data: entities } = useEntities();
  const addMember = useAddMember();

  // Filter out existing members
  const availableEntities = entities?.filter(
    (e) => !currentMembers.includes(e.id)
  );

  const handleAdd = async () => {
    if (!selectedEntity) return;

    try {
      await addMember.mutateAsync({
        channelId,
        entityId: selectedEntity,
        actor: currentOperator,
      });
      setSelectedEntity('');
      onSuccess();
    } catch {
      // Error handled by mutation state
    }
  };

  return (
    <div className="px-4 py-3 bg-gray-50 border-t border-gray-200">
      <label className="block text-sm font-medium text-gray-700 mb-2">
        Add Member
      </label>
      <div className="flex gap-2">
        <select
          value={selectedEntity}
          onChange={(e) => setSelectedEntity(e.target.value)}
          className="flex-1 min-w-0 px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          data-testid="add-member-select"
        >
          <option value="">Select entity...</option>
          {availableEntities?.map((entity) => (
            <option key={entity.id} value={entity.id}>
              {entity.name} ({entity.entityType})
            </option>
          ))}
        </select>
        <button
          onClick={handleAdd}
          disabled={!selectedEntity || addMember.isPending}
          className="px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
          data-testid="add-member-button"
        >
          {addMember.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <UserPlus className="w-4 h-4" />
          )}
          Add
        </button>
      </div>
      {addMember.isError && (
        <p className="mt-2 text-sm text-red-600 flex items-center gap-1">
          <AlertCircle className="w-4 h-4" />
          {(addMember.error as Error).message}
        </p>
      )}
      {availableEntities?.length === 0 && (
        <p className="mt-2 text-xs text-gray-500">
          No more entities available to add
        </p>
      )}
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function ChannelMembersPanel({
  channel,
  currentOperator,
  onClose,
}: ChannelMembersPanelProps) {
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);
  const { data: membersData, isLoading, error } = useChannelMembers(channel.id);
  const removeMember = useRemoveMember();
  const leaveChannel = useLeaveChannel();

  const isDirect = channel.channelType === 'direct';
  const canModify =
    !isDirect && membersData?.permissions.modifyMembers.includes(currentOperator);
  const isMember = channel.members.includes(currentOperator);

  const handleRemoveMember = async (entityId: string) => {
    setRemovingMemberId(entityId);
    try {
      await removeMember.mutateAsync({
        channelId: channel.id,
        entityId,
        actor: currentOperator,
      });
    } catch {
      // Error handled by mutation state
    } finally {
      setRemovingMemberId(null);
    }
  };

  const handleLeaveChannel = async () => {
    if (!confirm('Are you sure you want to leave this channel?')) return;

    try {
      await leaveChannel.mutateAsync({
        channelId: channel.id,
        actor: currentOperator,
      });
      onClose();
    } catch {
      // Error handled by mutation state
    }
  };

  return (
    <div
      data-testid="channel-members-panel"
      className="fixed inset-y-0 right-0 w-80 bg-white shadow-xl border-l border-gray-200 flex flex-col z-50 animate-slide-in-right"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-gray-500" />
          <h3 className="font-medium text-gray-900">Members</h3>
          {membersData && (
            <span className="text-sm text-gray-500">
              ({membersData.members.length})
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
          data-testid="close-members-panel"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Channel Info */}
      {isDirect && (
        <div className="px-4 py-3 bg-amber-50 border-b border-amber-100">
          <p className="text-sm text-amber-800">
            Direct message channels have fixed membership and cannot be modified.
          </p>
        </div>
      )}

      {/* Members List */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-8 text-gray-500">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            Loading members...
          </div>
        ) : error ? (
          <div className="flex items-center justify-center py-8 text-red-500">
            <AlertCircle className="w-5 h-5 mr-2" />
            Failed to load members
          </div>
        ) : (
          <div data-testid="members-list">
            {membersData?.members.map((member) => (
              <MemberRow
                key={member.id}
                member={member as Entity}
                isCreator={member.id === channel.createdBy}
                canModify={!!canModify}
                canRemove={member.id !== currentOperator && member.id !== channel.createdBy}
                onRemove={() => handleRemoveMember(member.id)}
                isRemoving={removingMemberId === member.id}
              />
            ))}
          </div>
        )}
      </div>

      {/* Add Member Form (only for group channels with modify permission) */}
      {canModify && (
        <AddMemberForm
          channelId={channel.id}
          currentMembers={channel.members}
          currentOperator={currentOperator}
          onSuccess={() => {}}
        />
      )}

      {/* Leave Channel Button (only for group channels where user is a member) */}
      {!isDirect && isMember && (
        <div className="px-4 py-3 border-t border-gray-200">
          <button
            onClick={handleLeaveChannel}
            disabled={leaveChannel.isPending}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-md transition-colors disabled:opacity-50"
            data-testid="leave-channel-button"
          >
            {leaveChannel.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <LogOut className="w-4 h-4" />
            )}
            Leave Channel
          </button>
          {leaveChannel.isError && (
            <p className="mt-2 text-sm text-red-600 text-center">
              {(leaveChannel.error as Error).message}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

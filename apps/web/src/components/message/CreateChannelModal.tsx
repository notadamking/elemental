import { useState, useEffect, useRef } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { X, Loader2, Plus, Hash, Users } from 'lucide-react';
import { TagInput } from '../ui/TagInput';

interface Entity {
  id: string;
  name: string;
  entityType: string;
}

interface CreateGroupChannelInput {
  channelType: 'group';
  name: string;
  createdBy: string;
  members?: string[];
  visibility?: 'public' | 'private';
  joinPolicy?: 'open' | 'invite-only' | 'request';
  tags?: string[];
}

interface CreateDirectChannelInput {
  channelType: 'direct';
  createdBy: string;
  entityA: string;
  entityB: string;
  tags?: string[];
}

type CreateChannelInput = CreateGroupChannelInput | CreateDirectChannelInput;

interface CreateChannelModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (channel: { id: string }) => void;
}

function useEntities() {
  return useQuery<Entity[]>({
    queryKey: ['entities'],
    queryFn: async () => {
      const response = await fetch('/api/entities');
      if (!response.ok) throw new Error('Failed to fetch entities');
      const data = await response.json();
      // Handle paginated response format
      return data.items || data;
    },
  });
}

function useCreateChannel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateChannelInput) => {
      const response = await fetch('/api/channels', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(input),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to create channel');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channels'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    },
  });
}

export function CreateChannelModal({
  isOpen,
  onClose,
  onSuccess,
}: CreateChannelModalProps) {
  const [channelType, setChannelType] = useState<'group' | 'direct'>('group');
  const [name, setName] = useState('');
  const [createdBy, setCreatedBy] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'private'>('private');
  const [joinPolicy, setJoinPolicy] = useState<'open' | 'invite-only' | 'request'>('invite-only');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [entityA, setEntityA] = useState('');
  const [entityB, setEntityB] = useState('');
  const [tags, setTags] = useState<string[]>([]);

  const nameInputRef = useRef<HTMLInputElement>(null);
  const createChannel = useCreateChannel();
  const { data: entities } = useEntities();

  // Focus name input when modal opens
  useEffect(() => {
    if (isOpen && nameInputRef.current) {
      nameInputRef.current.focus();
    }
  }, [isOpen]);

  // Reset form when modal closes
  useEffect(() => {
    if (!isOpen) {
      setChannelType('group');
      setName('');
      setCreatedBy('');
      setVisibility('private');
      setJoinPolicy('invite-only');
      setSelectedMembers([]);
      setEntityA('');
      setEntityB('');
      setTags([]);
      createChannel.reset();
    }
  }, [isOpen]);

  // Set default createdBy to operator (human entity), fall back to first entity
  useEffect(() => {
    if (entities && entities.length > 0 && !createdBy) {
      const operator = entities.find((e) => e.entityType === 'human');
      setCreatedBy(operator?.id || entities[0].id);
    }
  }, [entities, createdBy]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!createdBy) return;

    let input: CreateChannelInput;

    if (channelType === 'group') {
      if (!name.trim()) return;

      input = {
        channelType: 'group',
        name: name.trim().replace(/\s+/g, '-').toLowerCase(),
        createdBy,
        visibility,
        joinPolicy,
        ...(selectedMembers.length > 0 && { members: selectedMembers }),
        ...(tags.length > 0 && { tags }),
      };
    } else {
      if (!entityA || !entityB) return;
      if (entityA === entityB) return;

      input = {
        channelType: 'direct',
        createdBy,
        entityA,
        entityB,
        ...(tags.length > 0 && { tags }),
      };
    }

    try {
      const result = await createChannel.mutateAsync(input);
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

  const handleMemberToggle = (entityId: string) => {
    setSelectedMembers((prev) =>
      prev.includes(entityId)
        ? prev.filter((id) => id !== entityId)
        : [...prev, entityId]
    );
  };

  const isGroupFormValid = name.trim() && createdBy;
  const isDirectFormValid = entityA && entityB && entityA !== entityB && createdBy;
  const isFormValid = channelType === 'group' ? isGroupFormValid : isDirectFormValid;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto py-8" data-testid="create-channel-modal" onKeyDown={handleKeyDown}>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        data-testid="create-channel-modal-backdrop"
      />

      {/* Dialog */}
      <div className="relative w-full max-w-md mx-4">
        <div className="bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
            <div className="flex items-center gap-2">
              <Hash className="w-5 h-5 text-blue-500" />
              <h2 className="text-lg font-semibold text-gray-900">Create Channel</h2>
            </div>
            <button
              onClick={onClose}
              className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
              aria-label="Close"
              data-testid="create-channel-modal-close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-4">
            {/* Channel Type Toggle */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Channel Type
              </label>
              <div className="flex gap-2" data-testid="create-channel-type-toggle">
                <button
                  type="button"
                  onClick={() => setChannelType('group')}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md border transition-colors ${
                    channelType === 'group'
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                  }`}
                  data-testid="create-channel-type-group"
                >
                  <Hash className="w-4 h-4" />
                  Group
                </button>
                <button
                  type="button"
                  onClick={() => setChannelType('direct')}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md border transition-colors ${
                    channelType === 'direct'
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                  }`}
                  data-testid="create-channel-type-direct"
                >
                  <Users className="w-4 h-4" />
                  Direct
                </button>
              </div>
            </div>

            {/* Group Channel Fields */}
            {channelType === 'group' && (
              <>
                {/* Name */}
                <div className="mb-4">
                  <label htmlFor="channel-name" className="block text-sm font-medium text-gray-700 mb-1">
                    Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    ref={nameInputRef}
                    id="channel-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Enter channel name..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    data-testid="create-channel-name-input"
                    required
                    maxLength={100}
                  />
                  <p className="mt-1 text-xs text-gray-500">Alphanumeric, hyphens, underscores only</p>
                </div>

                {/* Visibility */}
                <div className="mb-4">
                  <label htmlFor="channel-visibility" className="block text-sm font-medium text-gray-700 mb-1">
                    Visibility
                  </label>
                  <select
                    id="channel-visibility"
                    value={visibility}
                    onChange={(e) => setVisibility(e.target.value as 'public' | 'private')}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    data-testid="create-channel-visibility-select"
                  >
                    <option value="private">Private - Only members can see</option>
                    <option value="public">Public - Anyone can see</option>
                  </select>
                </div>

                {/* Join Policy */}
                <div className="mb-4">
                  <label htmlFor="channel-join-policy" className="block text-sm font-medium text-gray-700 mb-1">
                    Join Policy
                  </label>
                  <select
                    id="channel-join-policy"
                    value={joinPolicy}
                    onChange={(e) => setJoinPolicy(e.target.value as 'open' | 'invite-only' | 'request')}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    data-testid="create-channel-join-policy-select"
                  >
                    <option value="invite-only">Invite Only</option>
                    <option value="open">Open - Anyone can join</option>
                    <option value="request">Request - Approval required</option>
                  </select>
                </div>

                {/* Members */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Members (optional)
                  </label>
                  <div
                    className="border border-gray-300 rounded-md max-h-32 overflow-y-auto"
                    data-testid="create-channel-members-list"
                  >
                    {entities?.filter((e) => e.id !== createdBy).map((entity) => (
                      <label
                        key={entity.id}
                        className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selectedMembers.includes(entity.id)}
                          onChange={() => handleMemberToggle(entity.id)}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-700">
                          {entity.name} ({entity.entityType})
                        </span>
                      </label>
                    ))}
                    {(!entities || entities.length <= 1) && (
                      <div className="px-3 py-2 text-sm text-gray-500">
                        No other entities available
                      </div>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-gray-500">Creator is automatically added</p>
                </div>
              </>
            )}

            {/* Direct Channel Fields */}
            {channelType === 'direct' && (
              <>
                {/* Entity A */}
                <div className="mb-4">
                  <label htmlFor="channel-entity-a" className="block text-sm font-medium text-gray-700 mb-1">
                    First Entity <span className="text-red-500">*</span>
                  </label>
                  <select
                    id="channel-entity-a"
                    value={entityA}
                    onChange={(e) => setEntityA(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    data-testid="create-channel-entity-a-select"
                    required
                  >
                    <option value="">Select entity...</option>
                    {entities?.map((entity) => (
                      <option key={entity.id} value={entity.id}>
                        {entity.name} ({entity.entityType})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Entity B */}
                <div className="mb-4">
                  <label htmlFor="channel-entity-b" className="block text-sm font-medium text-gray-700 mb-1">
                    Second Entity <span className="text-red-500">*</span>
                  </label>
                  <select
                    id="channel-entity-b"
                    value={entityB}
                    onChange={(e) => setEntityB(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    data-testid="create-channel-entity-b-select"
                    required
                  >
                    <option value="">Select entity...</option>
                    {entities?.filter((e) => e.id !== entityA).map((entity) => (
                      <option key={entity.id} value={entity.id}>
                        {entity.name} ({entity.entityType})
                      </option>
                    ))}
                  </select>
                  {entityA && entityB && entityA === entityB && (
                    <p className="mt-1 text-xs text-red-500">Entities must be different</p>
                  )}
                </div>
              </>
            )}

            {/* Created By */}
            <div className="mb-4">
              <label htmlFor="channel-created-by" className="block text-sm font-medium text-gray-700 mb-1">
                Created By <span className="text-red-500">*</span>
              </label>
              <select
                id="channel-created-by"
                value={createdBy}
                onChange={(e) => setCreatedBy(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                data-testid="create-channel-created-by-select"
                required
              >
                <option value="">Select entity...</option>
                {entities?.map((entity) => (
                  <option key={entity.id} value={entity.id}>
                    {entity.name} ({entity.entityType})
                  </option>
                ))}
              </select>
            </div>

            {/* Tags */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tags
              </label>
              <TagInput
                tags={tags}
                onChange={setTags}
                placeholder="Type and press comma to add tags"
                data-testid="create-channel-tags-input"
              />
            </div>

            {/* Error display */}
            {createChannel.isError && (
              <div
                className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700"
                data-testid="create-channel-error"
              >
                {(createChannel.error as Error)?.message || 'Failed to create channel'}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
                data-testid="create-channel-cancel-button"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={createChannel.isPending || !isFormValid}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                data-testid="create-channel-submit-button"
              >
                {createChannel.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    Create Channel
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

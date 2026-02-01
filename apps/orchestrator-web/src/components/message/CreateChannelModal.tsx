/**
 * CreateChannelModal - Modal for creating new group channels or direct messages
 */

import { useState, useEffect } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Hash, Users, Loader2, AlertCircle, Lock, Globe } from 'lucide-react';
import { useCurrentUser } from '../../contexts';

// ============================================================================
// Types
// ============================================================================

interface Entity {
  id: string;
  name: string;
  entityType: 'human' | 'agent' | 'system';
}

interface CreateChannelModalProps {
  isOpen: boolean;
  onClose: () => void;
  onChannelCreated?: (channelId: string) => void;
}

// ============================================================================
// API Hooks
// ============================================================================

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
    mutationFn: async ({
      name,
      channelType,
      members,
      visibility,
      createdBy,
    }: {
      name: string;
      channelType: 'direct' | 'group';
      members: string[];
      visibility: 'public' | 'private';
      createdBy: string;
    }) => {
      const response = await fetch('/api/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, channelType, members, visibility, createdBy }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to create channel');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channels'] });
    },
  });
}

// ============================================================================
// Component
// ============================================================================

export function CreateChannelModal({
  isOpen,
  onClose,
  onChannelCreated,
}: CreateChannelModalProps) {
  const [mode, setMode] = useState<'group' | 'direct'>('group');
  const [name, setName] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'private'>('public');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);

  const { data: entities = [] } = useEntities();
  const createChannel = useCreateChannel();
  const { currentUser } = useCurrentUser();

  // Reset form when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      setMode('group');
      setName('');
      setVisibility('public');
      setSelectedMembers([]);
      createChannel.reset();
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!currentUser) {
      return;
    }

    // For direct messages, we need exactly one other person
    if (mode === 'direct' && selectedMembers.length !== 1) {
      return;
    }

    // For group channels, we need a name
    if (mode === 'group' && !name.trim()) {
      return;
    }

    const finalMembers = [currentUser.id, ...selectedMembers];
    const finalName =
      mode === 'direct'
        ? `dm-${[currentUser.id, ...selectedMembers].sort().join('-')}`
        : name.trim();

    try {
      const channel = await createChannel.mutateAsync({
        name: finalName,
        channelType: mode,
        members: finalMembers,
        visibility: mode === 'direct' ? 'private' : visibility,
        createdBy: currentUser.id,
      });
      onChannelCreated?.(channel.id);
      onClose();
    } catch {
      // Error handled by mutation state
    }
  };

  const toggleMember = (entityId: string) => {
    if (mode === 'direct') {
      // For direct messages, only allow one selection
      setSelectedMembers((prev) =>
        prev.includes(entityId) ? [] : [entityId]
      );
    } else {
      setSelectedMembers((prev) =>
        prev.includes(entityId)
          ? prev.filter((id) => id !== entityId)
          : [...prev, entityId]
      );
    }
  };

  // Filter out current user from entity list
  const availableEntities = entities.filter((e) => e.id !== currentUser?.id);

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
        <Dialog.Content
          className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-gray-900 rounded-lg shadow-xl p-6 w-full max-w-md z-50 max-h-[85vh] overflow-y-auto"
          data-testid="create-channel-modal"
        >
          <Dialog.Title className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
            New Conversation
          </Dialog.Title>

          {/* Mode selector */}
          <div className="flex gap-2 mb-6">
            <button
              type="button"
              onClick={() => {
                setMode('group');
                setSelectedMembers([]);
              }}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 transition-colors ${
                mode === 'group'
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
              data-testid="mode-group"
            >
              <Hash className="w-5 h-5" />
              <span className="font-medium">Group Channel</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('direct');
                setSelectedMembers([]);
              }}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 transition-colors ${
                mode === 'direct'
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
              data-testid="mode-direct"
            >
              <Users className="w-5 h-5" />
              <span className="font-medium">Direct Message</span>
            </button>
          </div>

          <form onSubmit={handleSubmit}>
            {/* Channel name (group only) */}
            {mode === 'group' && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Channel Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., project-updates"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  data-testid="channel-name-input"
                  autoFocus
                />
              </div>
            )}

            {/* Visibility selector (group only) */}
            {mode === 'group' && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Visibility
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setVisibility('public')}
                    className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md border transition-colors ${
                      visibility === 'public'
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                    }`}
                    data-testid="visibility-public"
                  >
                    <Globe className="w-4 h-4" />
                    <span className="text-sm">Public</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setVisibility('private')}
                    className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md border transition-colors ${
                      visibility === 'private'
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                    }`}
                    data-testid="visibility-private"
                  >
                    <Lock className="w-4 h-4" />
                    <span className="text-sm">Private</span>
                  </button>
                </div>
              </div>
            )}

            {/* Member selector */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {mode === 'direct' ? 'Select Person' : 'Add Members (optional)'}
              </label>
              <div className="border border-gray-200 dark:border-gray-700 rounded-lg max-h-48 overflow-y-auto">
                {availableEntities.length === 0 ? (
                  <div className="p-4 text-center text-gray-500 dark:text-gray-400">
                    No entities available
                  </div>
                ) : (
                  availableEntities.map((entity) => {
                    const isSelected = selectedMembers.includes(entity.id);
                    return (
                      <label
                        key={entity.id}
                        className={`flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 ${
                          isSelected ? 'bg-blue-50 dark:bg-blue-900/30' : ''
                        }`}
                        data-testid={`member-option-${entity.id}`}
                      >
                        <input
                          type={mode === 'direct' ? 'radio' : 'checkbox'}
                          name="members"
                          checked={isSelected}
                          onChange={() => toggleMember(entity.id)}
                          className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-gray-900 dark:text-gray-100 truncate">
                            {entity.name}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 capitalize">
                            {entity.entityType}
                          </div>
                        </div>
                      </label>
                    );
                  })
                )}
              </div>
            </div>

            {/* Error */}
            {createChannel.isError && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg">
                <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
                  <AlertCircle className="w-4 h-4" />
                  <span className="text-sm">{createChannel.error.message}</span>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                data-testid="create-channel-cancel"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={
                  createChannel.isPending ||
                  (mode === 'group' && !name.trim()) ||
                  (mode === 'direct' && selectedMembers.length !== 1)
                }
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                data-testid="create-channel-submit"
              >
                {createChannel.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : null}
                {mode === 'direct' ? 'Start Conversation' : 'Create Channel'}
              </button>
            </div>
          </form>

          {/* Close button */}
          <Dialog.Close asChild>
            <button
              className="absolute top-4 right-4 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export default CreateChannelModal;

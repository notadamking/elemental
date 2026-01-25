/**
 * Messages Page - Slack-style messaging interface
 *
 * Features:
 * - Channel list sidebar
 * - Channel selection
 * - Message display (TB17)
 * - Message composer (TB18)
 * - Threading (TB19)
 */

import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Hash, Lock, Users, MessageSquare, Send, MessageCircle, X, Plus, UserCog } from 'lucide-react';
import { CreateChannelModal } from '../components/message/CreateChannelModal';
import { ChannelMembersPanel } from '../components/message/ChannelMembersPanel';

// ============================================================================
// Entity Types (for operator selection)
// ============================================================================

interface Entity {
  id: string;
  name: string;
  entityType: 'human' | 'agent' | 'system';
}

// ============================================================================
// Types
// ============================================================================

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
  createdAt: string;
  updatedAt: string;
}

interface Message {
  id: string;
  channelId: string;
  sender: string;
  contentRef: string;
  attachments: string[];
  threadId: string | null;
  createdAt: string;
  createdBy: string;
  _content?: string;
}

// ============================================================================
// API Hooks
// ============================================================================

function useChannels() {
  return useQuery<Channel[]>({
    queryKey: ['channels'],
    queryFn: async () => {
      const response = await fetch('/api/channels');
      if (!response.ok) {
        throw new Error('Failed to fetch channels');
      }
      return response.json();
    },
  });
}

function useChannel(channelId: string | null) {
  return useQuery<Channel>({
    queryKey: ['channels', channelId],
    queryFn: async () => {
      if (!channelId) throw new Error('No channel selected');
      const response = await fetch(`/api/channels/${channelId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch channel');
      }
      return response.json();
    },
    enabled: !!channelId,
  });
}

function useChannelMessages(channelId: string | null) {
  return useQuery<Message[]>({
    queryKey: ['channels', channelId, 'messages'],
    queryFn: async () => {
      if (!channelId) throw new Error('No channel selected');
      const response = await fetch(`/api/channels/${channelId}/messages?hydrate.content=true`);
      if (!response.ok) {
        throw new Error('Failed to fetch messages');
      }
      return response.json();
    },
    enabled: !!channelId,
  });
}

function useSendMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      channelId,
      sender,
      content,
      threadId,
    }: {
      channelId: string;
      sender: string;
      content: string;
      threadId?: string;
    }) => {
      const response = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId, sender, content, threadId }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to send message');
      }
      return response.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['channels', variables.channelId, 'messages'],
      });
      // Also invalidate thread replies if this was a threaded message
      if (variables.threadId) {
        queryClient.invalidateQueries({
          queryKey: ['messages', variables.threadId, 'replies'],
        });
      }
    },
  });
}

function useThreadReplies(threadId: string | null) {
  return useQuery<Message[]>({
    queryKey: ['messages', threadId, 'replies'],
    queryFn: async () => {
      if (!threadId) throw new Error('No thread selected');
      // Get all messages in the channel and filter for replies to this thread
      // In a real implementation, we'd have a dedicated endpoint for thread replies
      const response = await fetch(`/api/messages/${threadId}/replies?hydrate.content=true`);
      if (!response.ok) {
        // If the endpoint doesn't exist yet, return empty array
        return [];
      }
      return response.json();
    },
    enabled: !!threadId,
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

// ============================================================================
// Components
// ============================================================================

function ChannelIcon({ channel }: { channel: Channel }) {
  if (channel.channelType === 'direct') {
    return <Users className="w-4 h-4 text-gray-400 flex-shrink-0" />;
  }
  if (channel.permissions.visibility === 'private') {
    return <Lock className="w-4 h-4 text-gray-400 flex-shrink-0" />;
  }
  return <Hash className="w-4 h-4 text-gray-400 flex-shrink-0" />;
}

function ChannelListItem({
  channel,
  isSelected,
  onClick,
}: {
  channel: Channel;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      data-testid={`channel-item-${channel.id}`}
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-left transition-colors ${
        isSelected
          ? 'bg-blue-50 text-blue-700'
          : 'text-gray-700 hover:bg-gray-100'
      }`}
    >
      <ChannelIcon channel={channel} />
      <span className="truncate text-sm font-medium">{channel.name}</span>
      <span className="ml-auto text-xs text-gray-400">
        {channel.members.length}
      </span>
    </button>
  );
}

function ChannelList({
  channels,
  selectedChannelId,
  onSelectChannel,
  onNewChannel,
}: {
  channels: Channel[];
  selectedChannelId: string | null;
  onSelectChannel: (id: string) => void;
  onNewChannel: () => void;
}) {
  // Separate channels into groups and direct
  const groupChannels = channels.filter((c) => c.channelType === 'group');
  const directChannels = channels.filter((c) => c.channelType === 'direct');

  return (
    <div
      data-testid="channel-list"
      className="w-64 border-r border-gray-200 bg-white flex flex-col h-full"
    >
      <div className="p-4 border-b border-gray-200 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Channels</h2>
        <button
          onClick={onNewChannel}
          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
          title="New Channel"
          data-testid="new-channel-button-sidebar"
        >
          <Plus className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {/* Group Channels */}
        {groupChannels.length > 0 && (
          <div className="mb-4">
            <div
              data-testid="channel-group-label"
              className="px-3 py-1 text-xs font-semibold text-gray-500 uppercase tracking-wider"
            >
              Channels
            </div>
            <div data-testid="channel-group-list" className="space-y-1">
              {groupChannels.map((channel) => (
                <ChannelListItem
                  key={channel.id}
                  channel={channel}
                  isSelected={selectedChannelId === channel.id}
                  onClick={() => onSelectChannel(channel.id)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Direct Messages */}
        {directChannels.length > 0 && (
          <div>
            <div
              data-testid="channel-direct-label"
              className="px-3 py-1 text-xs font-semibold text-gray-500 uppercase tracking-wider"
            >
              Direct Messages
            </div>
            <div data-testid="channel-direct-list" className="space-y-1">
              {directChannels.map((channel) => (
                <ChannelListItem
                  key={channel.id}
                  channel={channel}
                  isSelected={selectedChannelId === channel.id}
                  onClick={() => onSelectChannel(channel.id)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {channels.length === 0 && (
          <div
            data-testid="channel-empty-state"
            className="text-center py-8 text-gray-500"
          >
            <MessageSquare className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p className="text-sm">No channels yet</p>
            <button
              onClick={onNewChannel}
              className="mt-2 text-sm text-blue-600 hover:text-blue-700 hover:underline"
              data-testid="new-channel-button-empty"
            >
              Create one
            </button>
          </div>
        )}
      </div>

      {/* Channel count */}
      <div
        data-testid="channel-count"
        className="p-3 border-t border-gray-200 text-xs text-gray-500"
      >
        {channels.length} channel{channels.length !== 1 ? 's' : ''}
      </div>
    </div>
  );
}

function ChannelPlaceholder() {
  return (
    <div
      data-testid="channel-placeholder"
      className="flex-1 flex items-center justify-center bg-gray-50"
    >
      <div className="text-center">
        <MessageSquare className="w-16 h-16 mx-auto mb-4 text-gray-300" />
        <h3 className="text-lg font-medium text-gray-900 mb-1">
          Select a channel
        </h3>
        <p className="text-sm text-gray-500">
          Choose a channel from the sidebar to view messages
        </p>
      </div>
    </div>
  );
}

function MessageBubble({
  message,
  onReply,
  replyCount = 0,
  isThreaded = false,
}: {
  message: Message;
  onReply?: (message: Message) => void;
  replyCount?: number;
  isThreaded?: boolean;
}) {
  const formattedTime = new Date(message.createdAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div
      data-testid={`message-${message.id}`}
      className="flex gap-3 p-3 hover:bg-gray-50 rounded-lg group"
    >
      {/* Avatar placeholder */}
      <div
        data-testid={`message-avatar-${message.id}`}
        className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0"
      >
        <span className="text-blue-600 font-medium text-sm">
          {message.sender.slice(-2).toUpperCase()}
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span
            data-testid={`message-sender-${message.id}`}
            className="font-semibold text-gray-900"
          >
            {message.sender}
          </span>
          <span
            data-testid={`message-time-${message.id}`}
            className="text-xs text-gray-400"
          >
            {formattedTime}
          </span>
        </div>
        <div
          data-testid={`message-content-${message.id}`}
          className="text-gray-700 mt-1 break-words"
        >
          {message._content || (
            <span className="text-gray-400 italic">Content not loaded</span>
          )}
        </div>

        {/* Thread indicators and reply button */}
        <div className="flex items-center gap-2 mt-2">
          {message.threadId && (
            <div
              data-testid={`message-thread-indicator-${message.id}`}
              className="text-xs text-blue-500"
            >
              Reply in thread
            </div>
          )}

          {/* Show reply count for root messages */}
          {!isThreaded && replyCount > 0 && (
            <button
              data-testid={`message-replies-${message.id}`}
              onClick={() => onReply?.(message)}
              className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
            >
              <MessageCircle className="w-3 h-3" />
              <span>{replyCount} {replyCount === 1 ? 'reply' : 'replies'}</span>
            </button>
          )}

          {/* Reply button (shown on hover for non-threaded messages without replies) */}
          {!isThreaded && !message.threadId && onReply && (
            <button
              data-testid={`message-reply-button-${message.id}`}
              onClick={() => onReply(message)}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <MessageCircle className="w-3 h-3" />
              <span>Reply</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ThreadPanel({
  parentMessage,
  channel,
  onClose,
}: {
  parentMessage: Message;
  channel: Channel | undefined;
  onClose: () => void;
}) {
  const { data: replies = [], isLoading } = useThreadReplies(parentMessage.id);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom when replies change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [replies]);

  return (
    <div
      data-testid="thread-panel"
      className="w-80 border-l border-gray-200 flex flex-col bg-white"
    >
      {/* Thread Header */}
      <div
        data-testid="thread-header"
        className="p-4 border-b border-gray-200 flex items-center justify-between"
      >
        <h3 className="font-medium text-gray-900">Thread</h3>
        <button
          data-testid="thread-close-button"
          onClick={onClose}
          className="p-1 text-gray-400 hover:text-gray-600 rounded"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Parent Message */}
      <div data-testid="thread-parent-message" className="border-b border-gray-100">
        <MessageBubble message={parentMessage} isThreaded />
      </div>

      {/* Thread Replies */}
      <div
        data-testid="thread-replies"
        className="flex-1 overflow-y-auto p-2"
      >
        {isLoading ? (
          <div className="text-center py-4 text-gray-500 text-sm">
            Loading replies...
          </div>
        ) : replies.length === 0 ? (
          <div
            data-testid="thread-empty"
            className="text-center py-4 text-gray-500 text-sm"
          >
            No replies yet
          </div>
        ) : (
          <div data-testid="thread-replies-list" className="space-y-1">
            {replies.map((reply) => (
              <MessageBubble key={reply.id} message={reply} isThreaded />
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Thread Composer */}
      <ThreadComposer
        parentMessage={parentMessage}
        channel={channel}
      />
    </div>
  );
}

function ThreadComposer({
  parentMessage,
  channel,
}: {
  parentMessage: Message;
  channel: Channel | undefined;
}) {
  const [content, setContent] = useState('');
  const sendMessage = useSendMessage();
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || !channel) return;

    // Use first member as sender for now (would be current user in real app)
    const sender = channel.members[0];
    if (!sender) return;

    try {
      await sendMessage.mutateAsync({
        channelId: parentMessage.channelId,
        sender,
        content: content.trim(),
        threadId: parentMessage.id,
      });
      setContent('');
    } catch (error) {
      console.error('Failed to send reply:', error);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <form
      data-testid="thread-composer"
      onSubmit={handleSubmit}
      className="p-3 border-t border-gray-200 bg-white"
    >
      <div className="flex gap-2 items-end">
        <textarea
          ref={inputRef}
          data-testid="thread-input"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Reply in thread..."
          className="flex-1 min-h-[36px] max-h-[100px] px-3 py-2 text-sm border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          rows={1}
          disabled={sendMessage.isPending}
        />
        <button
          type="submit"
          data-testid="thread-send-button"
          disabled={!content.trim() || sendMessage.isPending}
          className="px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </form>
  );
}

function MessageComposer({
  channelId,
  channel,
}: {
  channelId: string;
  channel: Channel | undefined;
}) {
  const [content, setContent] = useState('');
  const sendMessage = useSendMessage();
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Focus input when channel changes
  useEffect(() => {
    inputRef.current?.focus();
  }, [channelId]);

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 120)}px`;
    }
  }, [content]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || !channel) return;

    // Use first member as sender for now (would be current user in real app)
    const sender = channel.members[0];
    if (!sender) return;

    try {
      await sendMessage.mutateAsync({
        channelId,
        sender,
        content: content.trim(),
      });
      setContent('');
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <form
      data-testid="message-composer"
      onSubmit={handleSubmit}
      className="p-4 border-t border-gray-200 bg-white"
    >
      <div className="flex gap-2 items-end">
        <textarea
          ref={inputRef}
          data-testid="message-input"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`Message ${channel?.name || 'channel'}...`}
          className="flex-1 min-h-[40px] max-h-[120px] px-3 py-2 border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          rows={1}
          disabled={sendMessage.isPending}
        />
        <button
          type="submit"
          data-testid="message-send-button"
          disabled={!content.trim() || sendMessage.isPending}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
        >
          <Send className="w-4 h-4" />
          <span className="sr-only">Send</span>
        </button>
      </div>
      {sendMessage.isError && (
        <p data-testid="message-send-error" className="mt-2 text-sm text-red-500">
          Failed to send message. Please try again.
        </p>
      )}
    </form>
  );
}

function ChannelView({ channelId }: { channelId: string }) {
  const { data: channel } = useChannel(channelId);
  const { data: messages = [], isLoading, error } = useChannelMessages(channelId);
  const { data: entities } = useEntities();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [selectedThread, setSelectedThread] = useState<Message | null>(null);
  const [showMembersPanel, setShowMembersPanel] = useState(false);

  // Determine current operator (prefer human entity, fall back to first entity)
  const currentOperator =
    entities?.find((e) => e.entityType === 'human')?.id ||
    entities?.[0]?.id ||
    '';

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Calculate reply counts for each message
  const replyCounts = messages.reduce((acc, msg) => {
    if (msg.threadId) {
      acc[msg.threadId] = (acc[msg.threadId] || 0) + 1;
    }
    return acc;
  }, {} as Record<string, number>);

  // Filter out threaded messages from main view (show only root messages)
  const rootMessages = messages.filter((msg) => !msg.threadId);

  const handleReply = (message: Message) => {
    setSelectedThread(message);
  };

  return (
    <div
      data-testid="channel-view"
      className="flex-1 flex bg-white"
    >
      {/* Main Channel Area */}
      <div className="flex-1 flex flex-col">
        {/* Channel Header */}
        <div
          data-testid="channel-header"
          className="p-4 border-b border-gray-200"
        >
          <div className="flex items-center gap-2">
            {channel && (
              <>
                {channel.channelType === 'direct' ? (
                  <Users className="w-5 h-5 text-gray-400" />
                ) : channel.permissions.visibility === 'private' ? (
                  <Lock className="w-5 h-5 text-gray-400" />
                ) : (
                  <Hash className="w-5 h-5 text-gray-400" />
                )}
                <h3 data-testid="channel-name" className="font-medium text-gray-900">
                  {channel.name}
                </h3>
                <button
                  onClick={() => setShowMembersPanel(true)}
                  className="flex items-center gap-1 text-sm text-gray-500 hover:text-blue-600 hover:bg-blue-50 px-2 py-1 rounded transition-colors"
                  data-testid="channel-members-button"
                >
                  <UserCog className="w-4 h-4" />
                  {channel.members.length} members
                </button>
                <div className="flex-1" />
              </>
            )}
          </div>
        </div>

        {/* Messages Area */}
        <div
          data-testid="messages-container"
          className="flex-1 overflow-y-auto p-4"
        >
          {isLoading ? (
            <div
              data-testid="messages-loading"
              className="flex items-center justify-center h-full text-gray-500"
            >
              Loading messages...
            </div>
          ) : error ? (
            <div
              data-testid="messages-error"
              className="flex items-center justify-center h-full text-red-500"
            >
              Failed to load messages
            </div>
          ) : rootMessages.length === 0 ? (
            <div
              data-testid="messages-empty"
              className="flex flex-col items-center justify-center h-full text-gray-500"
            >
              <MessageSquare className="w-12 h-12 mb-3 text-gray-300" />
              <p className="text-sm">No messages yet</p>
              <p className="text-xs text-gray-400 mt-1">
                Be the first to send a message!
              </p>
            </div>
          ) : (
            <div data-testid="messages-list" className="space-y-2">
              {rootMessages.map((message) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  onReply={handleReply}
                  replyCount={replyCounts[message.id] || 0}
                />
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Message Composer */}
        <MessageComposer channelId={channelId} channel={channel} />
      </div>

      {/* Thread Panel */}
      {selectedThread && (
        <ThreadPanel
          parentMessage={selectedThread}
          channel={channel}
          onClose={() => setSelectedThread(null)}
        />
      )}

      {/* Members Panel */}
      {showMembersPanel && channel && currentOperator && (
        <ChannelMembersPanel
          channel={channel}
          currentOperator={currentOperator}
          onClose={() => setShowMembersPanel(false)}
        />
      )}
    </div>
  );
}

// ============================================================================
// Page Component
// ============================================================================

export function MessagesPage() {
  const { data: channels = [], isLoading, error } = useChannels();
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(
    null
  );
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  if (error) {
    return (
      <div
        data-testid="messages-page-error"
        className="flex items-center justify-center h-full"
      >
        <div className="text-center">
          <p className="text-red-500 mb-2">Failed to load channels</p>
          <p className="text-sm text-gray-500">{(error as Error).message}</p>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="messages-page" className="flex h-full">
      {isLoading ? (
        <div
          data-testid="channels-loading"
          className="w-64 border-r border-gray-200 flex items-center justify-center"
        >
          <div className="text-gray-500">Loading channels...</div>
        </div>
      ) : (
        <ChannelList
          channels={channels}
          selectedChannelId={selectedChannelId}
          onSelectChannel={setSelectedChannelId}
          onNewChannel={() => setIsCreateModalOpen(true)}
        />
      )}

      {selectedChannelId ? (
        <ChannelView channelId={selectedChannelId} />
      ) : (
        <ChannelPlaceholder />
      )}

      <CreateChannelModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={(channel) => {
          setSelectedChannelId(channel.id);
        }}
      />
    </div>
  );
}

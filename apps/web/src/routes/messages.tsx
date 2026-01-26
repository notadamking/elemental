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

import { useState, useRef, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearch, useNavigate, Link } from '@tanstack/react-router';
import { Hash, Lock, Users, MessageSquare, Send, MessageCircle, X, Plus, UserCog, Paperclip, FileText, Loader2, Search, Calendar, Copy, Check } from 'lucide-react';
import { toast } from 'sonner';
import { CreateChannelModal } from '../components/message/CreateChannelModal';
import { ChannelMembersPanel } from '../components/message/ChannelMembersPanel';
import { Pagination } from '../components/shared/Pagination';
import { VirtualizedList } from '../components/shared/VirtualizedList';
import { useAllChannels } from '../api/hooks/useAllElements';
import { usePaginatedData, createChannelFilter } from '../hooks/usePaginatedData';
import { groupMessagesByDay } from '../lib';

// Estimated message height for virtualization
const MESSAGE_ROW_HEIGHT = 100;

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

interface AttachedDocument {
  id: string;
  type: 'document';
  title?: string;
  content?: string;
  contentType: string;
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
  _attachments?: AttachedDocument[];
}

// ============================================================================
// Mention Highlighting
// ============================================================================

/**
 * Regex pattern to match @mentions in message content
 * Matches @ followed by a valid entity name (letter, then alphanumeric/hyphen/underscore)
 * Uses negative lookbehind to exclude email addresses
 */
const MENTION_REGEX = /(?<![a-zA-Z0-9])@([a-zA-Z][a-zA-Z0-9_-]*)/g;

/**
 * Renders message content with @mentions highlighted in blue and linked to entities
 */
function renderMessageContent(content: string): React.ReactNode {
  if (!content) return null;

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  const regex = new RegExp(MENTION_REGEX.source, 'g');
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    // Add text before the mention
    if (match.index > lastIndex) {
      parts.push(content.slice(lastIndex, match.index));
    }

    // Add the highlighted mention as a link to the entity
    const entityName = match[1];
    parts.push(
      <Link
        key={`mention-${match.index}`}
        to="/entities"
        search={{ name: entityName, selected: undefined, page: 1, limit: 25 }}
        className="text-blue-600 font-medium hover:underline"
        data-mention={entityName}
      >
        {match[0]}
      </Link>
    );

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text after last mention
  if (lastIndex < content.length) {
    parts.push(content.slice(lastIndex));
  }

  return parts.length > 0 ? parts : content;
}

// ============================================================================
// API Hooks
// ============================================================================

interface PaginatedResult<T> {
  items: T[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
}

const DEFAULT_CHANNEL_PAGE_SIZE = 50;

// Reserved for future server-side pagination if needed
function _useChannels(
  page: number = 1,
  pageSize: number = DEFAULT_CHANNEL_PAGE_SIZE,
  searchQuery: string = ''
) {
  const offset = (page - 1) * pageSize;

  return useQuery<PaginatedResult<Channel>>({
    queryKey: ['channels', 'paginated', page, pageSize, searchQuery],
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

      const response = await fetch(`/api/channels?${params}`);
      if (!response.ok) {
        throw new Error('Failed to fetch channels');
      }
      return response.json();
    },
  });
}
void _useChannels; // Suppress unused warning

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
      attachmentIds,
    }: {
      channelId: string;
      sender: string;
      content: string;
      threadId?: string;
      attachmentIds?: string[];
    }) => {
      const response = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId, sender, content, threadId, attachmentIds }),
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

// Hook to fetch all documents for the attachment picker
function useDocuments(searchQuery: string) {
  return useQuery<AttachedDocument[]>({
    queryKey: ['documents', 'search', searchQuery],
    queryFn: async () => {
      const response = await fetch('/api/documents');
      if (!response.ok) {
        throw new Error('Failed to fetch documents');
      }
      const data = await response.json();
      // Handle paginated response format
      const docs: AttachedDocument[] = data.items || data;
      // Client-side filtering by search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        return docs.filter(doc =>
          (doc.title?.toLowerCase().includes(query)) ||
          doc.id.toLowerCase().includes(query)
        );
      }
      return docs;
    },
  });
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
  totalItems,
  totalPages,
  currentPage,
  pageSize,
  onPageChange,
  onPageSizeChange,
  searchQuery,
  onSearchChange,
}: {
  channels: Channel[];
  selectedChannelId: string | null;
  onSelectChannel: (id: string) => void;
  onNewChannel: () => void;
  totalItems: number;
  totalPages: number;
  currentPage: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}) {
  // Separate channels into groups and direct
  const groupChannels = channels.filter((c) => c.channelType === 'group');
  const directChannels = channels.filter((c) => c.channelType === 'direct');

  return (
    <div
      data-testid="channel-list"
      className="w-64 border-r border-gray-200 bg-white flex flex-col h-full"
    >
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between mb-3">
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
        {/* Search box */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search channels..."
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            data-testid="channels-search-input"
          />
        </div>
        <div className="mt-2 text-xs text-gray-500">
          {channels.length} of {totalItems} channels
        </div>
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
            <p className="text-sm">{searchQuery ? 'No channels match your search' : 'No channels yet'}</p>
            {!searchQuery && (
              <button
                onClick={onNewChannel}
                className="mt-2 text-sm text-blue-600 hover:text-blue-700 hover:underline"
                data-testid="new-channel-button-empty"
              >
                Create one
              </button>
            )}
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="border-t border-gray-200 p-2">
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            pageSize={pageSize}
            onPageChange={onPageChange}
            onPageSizeChange={onPageSizeChange}
            showPageSizeSelector={false}
          />
        </div>
      )}
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

// ============================================================================
// TB99: Date Separator Component
// ============================================================================

function DateSeparator({ date, isSticky = false }: { date: string; isSticky?: boolean }) {
  return (
    <div
      data-testid={`date-separator-${date.replace(/\s/g, '-').toLowerCase()}`}
      className={`flex items-center gap-3 py-3 ${isSticky ? 'sticky top-0 bg-white z-10 -mx-4 px-4 shadow-sm' : ''}`}
    >
      <div className="flex-1 h-px bg-gray-200" />
      <div className="flex items-center gap-2 px-3 py-1 bg-gray-100 rounded-full">
        <Calendar className="w-3 h-3 text-gray-500" />
        <span
          data-testid="date-separator-label"
          className="text-xs font-medium text-gray-600"
        >
          {date}
        </span>
      </div>
      <div className="flex-1 h-px bg-gray-200" />
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
  const [copied, setCopied] = useState(false);
  const messageRef = useRef<HTMLDivElement>(null);

  const formattedTime = new Date(message.createdAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  const handleCopy = async () => {
    const content = message._content || '';
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      toast.success('Message copied');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy message');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Copy on 'c' key when focused (not with modifiers)
    if (e.key === 'c' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      handleCopy();
    }
  };

  return (
    <div
      ref={messageRef}
      data-testid={`message-${message.id}`}
      className="flex gap-3 p-3 hover:bg-gray-50 rounded-lg group relative focus:bg-blue-50 focus:ring-2 focus:ring-blue-200 focus:outline-none"
      tabIndex={0}
      onKeyDown={handleKeyDown}
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
          {message._content ? (
            renderMessageContent(message._content)
          ) : (
            <span className="text-gray-400 italic">Content not loaded</span>
          )}
        </div>

        {/* Attachments */}
        {message._attachments && message._attachments.length > 0 && (
          <div className="mt-2 space-y-1" data-testid={`message-attachments-${message.id}`}>
            {message._attachments.map((doc) => (
              <a
                key={doc.id}
                href={`/documents?selected=${doc.id}`}
                className="flex items-center gap-2 px-3 py-2 bg-gray-50 hover:bg-gray-100 rounded-lg border border-gray-200 transition-colors"
                data-testid={`message-attachment-${doc.id}`}
              >
                <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-blue-600 truncate">
                    {doc.title || 'Untitled Document'}
                  </div>
                  <div className="text-xs text-gray-500">
                    <span className="px-1 py-0.5 bg-gray-200 text-gray-600 rounded text-[10px]">
                      {doc.contentType}
                    </span>
                  </div>
                </div>
              </a>
            ))}
          </div>
        )}

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

      {/* Hover action menu - positioned at top right */}
      <div
        data-testid={`message-actions-${message.id}`}
        className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-white border border-gray-200 rounded-lg shadow-sm p-1"
      >
        <button
          data-testid={`message-copy-button-${message.id}`}
          onClick={handleCopy}
          className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
          title="Copy message (C when focused)"
        >
          {copied ? (
            <Check className="w-4 h-4 text-green-500" />
          ) : (
            <Copy className="w-4 h-4" />
          )}
        </button>
        {!isThreaded && onReply && (
          <button
            data-testid={`message-reply-action-${message.id}`}
            onClick={() => onReply(message)}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
            title="Reply in thread"
          >
            <MessageCircle className="w-4 h-4" />
          </button>
        )}
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

// Document picker modal for message attachments
function MessageAttachmentPicker({
  isOpen,
  onClose,
  onSelect,
  selectedIds,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (doc: AttachedDocument) => void;
  selectedIds: string[];
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const { data: documents, isLoading } = useDocuments(searchQuery);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          onClose();
        }
      };
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const availableDocs = documents?.filter(doc => !selectedIds.includes(doc.id)) || [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      data-testid="message-attachment-picker"
    >
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[60vh] flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold text-gray-900">Attach Document</h3>
            <button
              onClick={onClose}
              className="p-1 text-gray-400 hover:text-gray-600 rounded"
              data-testid="attachment-picker-close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              ref={inputRef}
              type="text"
              placeholder="Search documents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              data-testid="attachment-search"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : availableDocs.length === 0 ? (
            <div className="text-center py-8 text-gray-500" data-testid="attachment-picker-empty">
              {documents?.length === 0
                ? 'No documents available'
                : searchQuery
                ? 'No documents match your search'
                : 'All documents are already attached'}
            </div>
          ) : (
            <div className="space-y-2">
              {availableDocs.map((doc) => (
                <button
                  key={doc.id}
                  onClick={() => onSelect(doc)}
                  className="w-full flex items-center gap-3 p-3 text-left bg-gray-50 hover:bg-blue-50 rounded-lg transition-colors"
                  data-testid={`attachment-option-${doc.id}`}
                >
                  <FileText className="w-5 h-5 text-gray-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 truncate">
                      {doc.title || 'Untitled Document'}
                    </div>
                    <div className="text-xs text-gray-500 flex items-center gap-2">
                      <span className="font-mono">{doc.id}</span>
                      <span className="px-1.5 py-0.5 bg-gray-200 text-gray-600 rounded">
                        {doc.contentType}
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
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
  const [attachments, setAttachments] = useState<AttachedDocument[]>([]);
  const [showPicker, setShowPicker] = useState(false);
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

  const handleAddAttachment = (doc: AttachedDocument) => {
    setAttachments(prev => [...prev, doc]);
    setShowPicker(false);
  };

  const handleRemoveAttachment = (docId: string) => {
    setAttachments(prev => prev.filter(a => a.id !== docId));
  };

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
        attachmentIds: attachments.map(a => a.id),
      });
      setContent('');
      setAttachments([]);
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
    <>
      <form
        data-testid="message-composer"
        onSubmit={handleSubmit}
        className="p-4 border-t border-gray-200 bg-white"
      >
        {/* Attached documents preview */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2" data-testid="message-attachments-preview">
            {attachments.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center gap-2 px-2 py-1 bg-gray-100 rounded-md text-sm"
                data-testid={`attachment-preview-${doc.id}`}
              >
                <FileText className="w-4 h-4 text-gray-400" />
                <span className="truncate max-w-[150px]">{doc.title || 'Untitled'}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveAttachment(doc.id)}
                  className="p-0.5 text-gray-400 hover:text-red-500"
                  data-testid={`remove-attachment-${doc.id}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2 items-end">
          <button
            type="button"
            onClick={() => setShowPicker(true)}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            data-testid="message-attach-button"
            title="Attach document"
          >
            <Paperclip className="w-5 h-5" />
          </button>
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

      <MessageAttachmentPicker
        isOpen={showPicker}
        onClose={() => setShowPicker(false)}
        onSelect={handleAddAttachment}
        selectedIds={attachments.map(a => a.id)}
      />
    </>
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

  // Group messages by day for date separators (TB99)
  const groupedMessages = useMemo(
    () => groupMessagesByDay(rootMessages, (msg) => msg.createdAt),
    [rootMessages]
  );

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
          ) : rootMessages.length > 100 ? (
            // Use virtualization for large message lists with day separators (TB99)
            <VirtualizedList
              items={groupedMessages}
              getItemKey={(grouped) => grouped.item.id}
              estimateSize={(index) => groupedMessages[index]?.isFirstInDay ? MESSAGE_ROW_HEIGHT + 48 : MESSAGE_ROW_HEIGHT}
              scrollRestoreId={`messages-${channelId}`}
              className="h-full"
              testId="virtualized-messages-list"
              gap={8}
              renderItem={(grouped) => (
                <div>
                  {grouped.isFirstInDay && (
                    <DateSeparator date={grouped.formattedDate} />
                  )}
                  <MessageBubble
                    message={grouped.item}
                    onReply={handleReply}
                    replyCount={replyCounts[grouped.item.id] || 0}
                  />
                </div>
              )}
            />
          ) : (
            <div data-testid="messages-list" className="space-y-0">
              {groupedMessages.map((grouped) => (
                <div key={grouped.item.id}>
                  {grouped.isFirstInDay && (
                    <DateSeparator date={grouped.formattedDate} />
                  )}
                  <MessageBubble
                    message={grouped.item}
                    onReply={handleReply}
                    replyCount={replyCounts[grouped.item.id] || 0}
                  />
                </div>
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
  const navigate = useNavigate();
  const search = useSearch({ from: '/messages' });

  // Pagination state from URL
  const currentPage = search.page ?? 1;
  const pageSize = search.limit ?? DEFAULT_CHANNEL_PAGE_SIZE;

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(
    search.channel ?? null
  );
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // Use upfront-loaded data (TB67) instead of server-side pagination
  const { data: allChannels, isLoading: isChannelsLoading, isError } = useAllChannels();

  // Create filter function for client-side filtering
  const filterFn = useMemo(() => {
    return createChannelFilter({ search: searchQuery });
  }, [searchQuery]);

  // Client-side pagination with filtering (TB69)
  const paginatedData = usePaginatedData<Channel>({
    data: allChannels as Channel[] | undefined,
    page: currentPage,
    pageSize,
    filterFn,
    sort: { field: 'updatedAt', direction: 'desc' },
  });

  // Extract items from client-side paginated data (TB69)
  const channels = paginatedData.items;
  const totalItems = paginatedData.filteredTotal;
  const totalPages = paginatedData.totalPages;
  const isLoading = isChannelsLoading || paginatedData.isLoading;
  const error = isError ? new Error('Failed to load channels') : null;

  // Sync selected channel from URL on mount and when search changes
  useEffect(() => {
    if (search.channel && search.channel !== selectedChannelId) {
      setSelectedChannelId(search.channel);
    }
    if (!search.channel && selectedChannelId) {
      setSelectedChannelId(null);
    }
  }, [search.channel]);

  const handleSelectChannel = (channelId: string) => {
    setSelectedChannelId(channelId);
    navigate({ to: '/messages', search: { channel: channelId, message: undefined, page: currentPage, limit: pageSize } });
  };

  const handlePageChange = (page: number) => {
    navigate({ to: '/messages', search: { page, limit: pageSize, channel: selectedChannelId ?? undefined, message: undefined } });
  };

  const handlePageSizeChange = (newPageSize: number) => {
    navigate({ to: '/messages', search: { page: 1, limit: newPageSize, channel: selectedChannelId ?? undefined, message: undefined } });
  };

  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
    navigate({ to: '/messages', search: { page: 1, limit: pageSize, channel: selectedChannelId ?? undefined, message: undefined } });
  };

  const handleChannelCreated = (channel: { id: string }) => {
    setSelectedChannelId(channel.id);
    navigate({ to: '/messages', search: { channel: channel.id, message: undefined, page: currentPage, limit: pageSize } });
  };

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
          onSelectChannel={handleSelectChannel}
          onNewChannel={() => setIsCreateModalOpen(true)}
          totalItems={totalItems}
          totalPages={totalPages}
          currentPage={currentPage}
          pageSize={pageSize}
          onPageChange={handlePageChange}
          onPageSizeChange={handlePageSizeChange}
          searchQuery={searchQuery}
          onSearchChange={handleSearchChange}
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
        onSuccess={handleChannelCreated}
      />
    </div>
  );
}

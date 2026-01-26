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

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearch, useNavigate, Link } from '@tanstack/react-router';
import { Hash, Lock, Users, MessageSquare, Send, MessageCircle, X, Plus, UserCog, Paperclip, FileText, Loader2, Search, Calendar, Copy, Check, ImageIcon, XCircle } from 'lucide-react';
import { useDebounce } from '../hooks/useDebounce';
import { toast } from 'sonner';
import { CreateChannelModal } from '../components/message/CreateChannelModal';
import { ChannelMembersPanel } from '../components/message/ChannelMembersPanel';
import { MessageRichComposer, type MessageRichComposerRef } from '../components/message/MessageRichComposer';
import { MessageImageAttachment } from '../components/message/MessageImageAttachment';
import { TaskPickerModal } from '../components/editor/TaskPickerModal';
import { DocumentPickerModal } from '../components/editor/DocumentPickerModal';
import { EmojiPickerModal } from '../components/editor/EmojiPickerModal';
import type { MessageEmbedCallbacks } from '../components/message/MessageSlashCommands';
import { Pagination } from '../components/shared/Pagination';
import { VirtualizedList } from '../components/shared/VirtualizedList';
import { useAllChannels } from '../api/hooks/useAllElements';
import { usePaginatedData, createChannelFilter } from '../hooks/usePaginatedData';
import { groupMessagesByDay } from '../lib';
import { EntityLink } from '../components/entity/EntityLink';
import { MessageEmbedCard } from '../components/message/MessageEmbedCard';

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
// Mention and Image Rendering (TB102)
// ============================================================================

/**
 * Regex pattern to match @mentions in message content
 * Matches @ followed by a valid entity name (letter, then alphanumeric/hyphen/underscore)
 * Uses negative lookbehind to exclude email addresses
 */
const MENTION_REGEX = /(?<![a-zA-Z0-9])@([a-zA-Z][a-zA-Z0-9_-]*)/g;

/**
 * Regex pattern to match markdown images: ![alt](url)
 */
const IMAGE_REGEX = /!\[([^\]]*)\]\(([^)]+)\)/g;

/**
 * Regex pattern to match embed references: ![[type:id]]
 * TB128: Element embedding in messages
 */
const EMBED_REGEX = /!\[\[(task|doc):([\w-]+)\]\]/g;

/**
 * Renders a single text segment, processing mentions within it
 */
function renderTextWithMentions(text: string, keyPrefix: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  const regex = new RegExp(MENTION_REGEX.source, 'g');
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    // Add text before the mention
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    // Add the highlighted mention as a link to the entity
    const entityName = match[1];
    parts.push(
      <Link
        key={`${keyPrefix}-mention-${match.index}`}
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
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : [text];
}

/**
 * Renders text with embeds: ![[task:id]] and ![[doc:id]]
 * TB128: Element embedding in messages
 */
function renderTextWithEmbeds(text: string, keyPrefix: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  const embedRegex = new RegExp(EMBED_REGEX.source, 'g');
  let match: RegExpExecArray | null;

  while ((match = embedRegex.exec(text)) !== null) {
    // Add text before the embed (with mention processing)
    if (match.index > lastIndex) {
      const textBefore = text.slice(lastIndex, match.index);
      parts.push(...renderTextWithMentions(textBefore, `${keyPrefix}-before-${match.index}`));
    }

    // Add the embed card
    const embedType = match[1] as 'task' | 'doc';
    const embedId = match[2];
    parts.push(
      <MessageEmbedCard
        key={`${keyPrefix}-embed-${match.index}`}
        type={embedType}
        id={embedId}
      />
    );

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text after last embed (with mention processing)
  if (lastIndex < text.length) {
    const textAfter = text.slice(lastIndex);
    parts.push(...renderTextWithMentions(textAfter, `${keyPrefix}-after-${lastIndex}`));
  }

  return parts.length > 0 ? parts : renderTextWithMentions(text, keyPrefix);
}

/**
 * Renders message content with @mentions highlighted, images displayed (TB102),
 * and element embeds (TB128)
 */
function renderMessageContent(content: string): React.ReactNode {
  if (!content) return null;

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  const imageRegex = new RegExp(IMAGE_REGEX.source, 'g');
  let match: RegExpExecArray | null;

  while ((match = imageRegex.exec(content)) !== null) {
    // Add text before the image (with embed and mention processing)
    if (match.index > lastIndex) {
      const textBefore = content.slice(lastIndex, match.index);
      parts.push(...renderTextWithEmbeds(textBefore, `text-${lastIndex}`));
    }

    // Add the image element
    const altText = match[1] || 'Image';
    const imageUrl = match[2];
    parts.push(
      <div key={`image-${match.index}`} className="my-2">
        <img
          src={imageUrl}
          alt={altText}
          className="max-w-full max-h-80 rounded-lg border border-gray-200 cursor-pointer hover:opacity-90 transition-opacity"
          onClick={() => window.open(imageUrl, '_blank')}
          data-testid={`message-image-${match.index}`}
        />
      </div>
    );

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text after last image (with embed and mention processing)
  if (lastIndex < content.length) {
    const textAfter = content.slice(lastIndex);
    parts.push(...renderTextWithEmbeds(textAfter, `text-${lastIndex}`));
  }

  return parts.length > 0 ? parts : content;
}

// ============================================================================
// Message Search Types (TB103)
// ============================================================================

interface MessageSearchResult {
  id: string;
  channelId: string;
  sender: string;
  content: string;
  snippet: string;
  createdAt: string;
  threadId: string | null;
}

interface MessageSearchResponse {
  results: MessageSearchResult[];
  query: string;
}

// Debounce delay for message search
const SEARCH_DEBOUNCE_DELAY = 300;

/**
 * Highlights matched substring in text (TB103)
 */
function highlightSearchMatch(text: string, query: string): React.ReactNode {
  if (!query.trim()) {
    return <>{text}</>;
  }

  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const matchIndex = lowerText.indexOf(lowerQuery);

  if (matchIndex === -1) {
    return <>{text}</>;
  }

  const before = text.slice(0, matchIndex);
  const match = text.slice(matchIndex, matchIndex + query.length);
  const after = text.slice(matchIndex + query.length);

  return (
    <>
      {before}
      <mark className="bg-yellow-200 text-gray-900 rounded-sm px-0.5" data-testid="search-highlight">
        {match}
      </mark>
      {after}
    </>
  );
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

/**
 * Hook to search messages within a channel (TB103)
 */
function useMessageSearch(query: string, channelId: string | null) {
  const debouncedQuery = useDebounce(query, SEARCH_DEBOUNCE_DELAY);

  return useQuery<MessageSearchResponse>({
    queryKey: ['messages', 'search', debouncedQuery, channelId],
    queryFn: async () => {
      if (!debouncedQuery.trim()) {
        return { results: [], query: '' };
      }
      const params = new URLSearchParams({
        q: debouncedQuery,
        limit: '50',
      });
      if (channelId) {
        params.set('channelId', channelId);
      }
      const response = await fetch(`/api/messages/search?${params}`);
      if (!response.ok) {
        throw new Error('Failed to search messages');
      }
      return response.json();
    },
    enabled: debouncedQuery.trim().length > 0,
    staleTime: 30000, // Cache for 30 seconds
  });
}

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
  isHighlighted = false,
}: {
  message: Message;
  onReply?: (message: Message) => void;
  replyCount?: number;
  isThreaded?: boolean;
  isHighlighted?: boolean;
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
      className={`flex gap-3 p-3 rounded-lg group relative focus:bg-blue-50 focus:ring-2 focus:ring-blue-200 focus:outline-none transition-colors duration-300 ${
        isHighlighted
          ? 'bg-yellow-100 ring-2 ring-yellow-300'
          : 'hover:bg-gray-50'
      }`}
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
          <EntityLink
            entityRef={message.sender}
            className="font-semibold"
            data-testid={`message-sender-${message.id}`}
          />
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
  const editorRef = useRef<MessageRichComposerRef>(null);

  const handleSubmit = async () => {
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
      editorRef.current?.clear();
    } catch (error) {
      console.error('Failed to send reply:', error);
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSubmit();
  };

  return (
    <form
      data-testid="thread-composer"
      onSubmit={handleFormSubmit}
      className="p-3 border-t border-gray-200 bg-white"
    >
      <div className="flex gap-2 items-end">
        <div className="flex-1">
          <MessageRichComposer
            ref={editorRef}
            content={content}
            onChange={setContent}
            onSubmit={handleSubmit}
            placeholder="Reply in thread..."
            disabled={sendMessage.isPending}
            maxHeight={120}
            minHeight={48}
          />
        </div>
        <button
          type="submit"
          data-testid="thread-send-button"
          disabled={!content.trim() || sendMessage.isPending}
          className="px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors self-end mb-1"
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

// Image attachment type for TB102
interface ImageAttachment {
  url: string;
  filename?: string;
}

const API_BASE = 'http://localhost:3456';

function MessageComposer({
  channelId,
  channel,
}: {
  channelId: string;
  channel: Channel | undefined;
}) {
  const [content, setContent] = useState('');
  const [attachments, setAttachments] = useState<AttachedDocument[]>([]);
  const [imageAttachments, setImageAttachments] = useState<ImageAttachment[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const [showImagePicker, setShowImagePicker] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  // TB127: Slash command picker states
  const [showTaskPicker, setShowTaskPicker] = useState(false);
  const [showDocumentPicker, setShowDocumentPicker] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const sendMessage = useSendMessage();
  const editorRef = useRef<MessageRichComposerRef>(null);
  const dropZoneRef = useRef<HTMLFormElement>(null);
  const [dragOver, setDragOver] = useState(false);

  // Focus editor when channel changes
  useEffect(() => {
    editorRef.current?.focus();
  }, [channelId]);

  // TB127: Embed callbacks for slash commands
  const embedCallbacks = useMemo<MessageEmbedCallbacks>(
    () => ({
      onTaskEmbed: () => setShowTaskPicker(true),
      onDocumentEmbed: () => setShowDocumentPicker(true),
      onEmojiInsert: () => setShowEmojiPicker(true),
    }),
    []
  );

  // TB127: Handle task selection from picker - insert text reference
  const handleTaskSelect = useCallback(
    (taskId: string) => {
      // Insert task reference as text that will be rendered by TB128
      setContent((prev) => prev + `#task:${taskId}`);
      setShowTaskPicker(false);
      editorRef.current?.focus();
    },
    []
  );

  // TB127: Handle document selection from picker - insert text reference
  const handleDocumentSelect = useCallback(
    (documentId: string) => {
      // Insert document reference as text that will be rendered by TB128
      setContent((prev) => prev + `#doc:${documentId}`);
      setShowDocumentPicker(false);
      editorRef.current?.focus();
    },
    []
  );

  // TB127: Handle emoji selection from picker
  const handleEmojiSelect = useCallback(
    (emoji: string) => {
      setContent((prev) => prev + emoji);
      setShowEmojiPicker(false);
      editorRef.current?.focus();
    },
    []
  );

  const handleAddAttachment = (doc: AttachedDocument) => {
    setAttachments(prev => [...prev, doc]);
    setShowPicker(false);
  };

  const handleRemoveAttachment = (docId: string) => {
    setAttachments(prev => prev.filter(a => a.id !== docId));
  };

  // TB102: Handle image attachment
  const handleAddImageAttachment = (imageUrl: string) => {
    // Extract filename from URL
    const filename = imageUrl.split('/').pop() || 'image';
    setImageAttachments(prev => [...prev, { url: imageUrl, filename }]);
    setShowImagePicker(false);
  };

  const handleRemoveImageAttachment = (url: string) => {
    setImageAttachments(prev => prev.filter(a => a.url !== url));
  };

  // TB102: Upload image file
  const uploadImageFile = async (file: File): Promise<string | null> => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      toast.error(`Invalid file type: ${file.type}`);
      return null;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error('File too large (max 10MB)');
      return null;
    }

    setUploadingImage(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`${API_BASE}/api/uploads`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Upload failed');
      }

      const result = await response.json();
      return `${API_BASE}${result.url}`;
    } catch (err) {
      toast.error('Failed to upload image');
      return null;
    } finally {
      setUploadingImage(false);
    }
  };

  // TB102: Handle image paste from clipboard
  const handleImagePaste = async (file: File) => {
    const url = await uploadImageFile(file);
    if (url) {
      handleAddImageAttachment(url);
      toast.success('Image attached');
    }
  };

  // TB102: Handle drag and drop images
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);

    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      const url = await uploadImageFile(file);
      if (url) {
        handleAddImageAttachment(url);
        toast.success('Image attached');
      }
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.types.includes('Files')) {
      setDragOver(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  };

  const handleSubmit = async () => {
    // Allow sending with only images (no text required if images attached)
    const hasContent = content.trim().length > 0;
    const hasImages = imageAttachments.length > 0;
    const hasAttachments = attachments.length > 0;

    if (!hasContent && !hasImages && !hasAttachments) return;
    if (!channel) return;

    // Use first member as sender for now (would be current user in real app)
    const sender = channel.members[0];
    if (!sender) return;

    try {
      // Include image URLs in the message content using Markdown
      let finalContent = content.trim();

      // Append image URLs as markdown images
      if (imageAttachments.length > 0) {
        const imageMarkdown = imageAttachments
          .map(img => `![${img.filename || 'image'}](${img.url})`)
          .join('\n');
        finalContent = finalContent
          ? `${finalContent}\n\n${imageMarkdown}`
          : imageMarkdown;
      }

      await sendMessage.mutateAsync({
        channelId,
        sender,
        content: finalContent,
        attachmentIds: attachments.map(a => a.id),
      });
      setContent('');
      setAttachments([]);
      setImageAttachments([]);
      editorRef.current?.clear();
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSubmit();
  };

  const hasAnyAttachments = attachments.length > 0 || imageAttachments.length > 0;
  const canSend = content.trim() || hasAnyAttachments;

  return (
    <>
      <form
        ref={dropZoneRef}
        data-testid="message-composer"
        onSubmit={handleFormSubmit}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`p-4 border-t border-gray-200 bg-white relative ${
          dragOver ? 'ring-2 ring-blue-500 ring-inset bg-blue-50' : ''
        }`}
      >
        {/* Drag overlay */}
        {dragOver && (
          <div className="absolute inset-0 flex items-center justify-center bg-blue-50/90 z-10 pointer-events-none">
            <div className="flex flex-col items-center text-blue-600">
              <ImageIcon className="w-8 h-8 mb-2" />
              <span className="text-sm font-medium">Drop image here</span>
            </div>
          </div>
        )}

        {/* TB102: Image attachments preview */}
        {imageAttachments.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2" data-testid="message-image-attachments-preview">
            {imageAttachments.map((img) => (
              <div
                key={img.url}
                className="relative group"
                data-testid={`image-attachment-preview-${img.filename}`}
              >
                <img
                  src={img.url}
                  alt={img.filename || 'Attached image'}
                  className="w-20 h-20 object-cover rounded-lg border border-gray-200"
                />
                <button
                  type="button"
                  onClick={() => handleRemoveImageAttachment(img.url)}
                  className="absolute -top-1 -right-1 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                  data-testid={`remove-image-attachment-${img.filename}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

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
          {/* TB102: Image attachment button */}
          <button
            type="button"
            onClick={() => setShowImagePicker(true)}
            disabled={uploadingImage}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors self-end mb-1 disabled:opacity-50"
            data-testid="message-image-attach-button"
            title="Attach image"
          >
            {uploadingImage ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <ImageIcon className="w-5 h-5" />
            )}
          </button>
          <button
            type="button"
            onClick={() => setShowPicker(true)}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors self-end mb-1"
            data-testid="message-attach-button"
            title="Attach document"
          >
            <Paperclip className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <MessageRichComposer
              ref={editorRef}
              content={content}
              onChange={setContent}
              onSubmit={handleSubmit}
              onImagePaste={handleImagePaste}
              channelName={channel?.name}
              disabled={sendMessage.isPending}
              maxHeight={180}
              minHeight={60}
              embedCallbacks={embedCallbacks}
            />
          </div>
          <button
            type="submit"
            data-testid="message-send-button"
            disabled={!canSend || sendMessage.isPending}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2 self-end mb-1"
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

      {/* TB102: Image attachment modal */}
      <MessageImageAttachment
        isOpen={showImagePicker}
        onClose={() => setShowImagePicker(false)}
        onAttach={handleAddImageAttachment}
      />

      {/* TB127: Task picker modal for slash commands */}
      <TaskPickerModal
        isOpen={showTaskPicker}
        onClose={() => setShowTaskPicker(false)}
        onSelect={handleTaskSelect}
      />

      {/* TB127: Document picker modal for slash commands */}
      <DocumentPickerModal
        isOpen={showDocumentPicker}
        onClose={() => setShowDocumentPicker(false)}
        onSelect={handleDocumentSelect}
      />

      {/* TB127: Emoji picker modal for slash commands */}
      <EmojiPickerModal
        isOpen={showEmojiPicker}
        onClose={() => setShowEmojiPicker(false)}
        onSelect={handleEmojiSelect}
      />
    </>
  );
}

/**
 * Message Search Dropdown Component (TB103)
 * Shows search results in a dropdown with highlighted matches
 */
function MessageSearchDropdown({
  searchQuery,
  channelId,
  onSelectResult,
  onClose,
}: {
  searchQuery: string;
  channelId: string;
  onSelectResult: (messageId: string) => void;
  onClose: () => void;
}) {
  const { data: searchResponse, isLoading } = useMessageSearch(searchQuery, channelId);
  const results = searchResponse?.results || [];
  const [selectedIndex, setSelectedIndex] = useState(0);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [results.length]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (results[selectedIndex]) {
          onSelectResult(results[selectedIndex].id);
          onClose();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [results, selectedIndex, onSelectResult, onClose]);

  // Scroll selected item into view
  useEffect(() => {
    if (resultsRef.current) {
      const selectedElement = resultsRef.current.children[selectedIndex] as HTMLElement;
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  if (!searchQuery.trim()) {
    return null;
  }

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    const isToday = date.toDateString() === today.toDateString();
    if (isToday) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  return (
    <div
      data-testid="message-search-dropdown"
      className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-80 overflow-hidden"
    >
      {isLoading ? (
        <div className="flex items-center justify-center py-6" data-testid="message-search-loading">
          <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
          <span className="ml-2 text-sm text-gray-500">Searching...</span>
        </div>
      ) : results.length === 0 ? (
        <div className="py-6 text-center" data-testid="message-search-empty">
          <Search className="w-8 h-8 mx-auto mb-2 text-gray-300" />
          <p className="text-sm text-gray-500">No messages found</p>
          <p className="text-xs text-gray-400 mt-1">Try a different search term</p>
        </div>
      ) : (
        <>
          <div className="px-3 py-2 text-xs text-gray-500 border-b border-gray-100">
            {results.length} result{results.length !== 1 ? 's' : ''} found
          </div>
          <div ref={resultsRef} className="overflow-y-auto max-h-64" data-testid="message-search-results">
            {results.map((result, index) => (
              <button
                key={result.id}
                onClick={() => {
                  onSelectResult(result.id);
                  onClose();
                }}
                className={`w-full text-left px-3 py-2 flex items-start gap-3 transition-colors ${
                  index === selectedIndex
                    ? 'bg-blue-50'
                    : 'hover:bg-gray-50'
                }`}
                data-testid={`message-search-result-${result.id}`}
              >
                {/* Avatar */}
                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <span className="text-blue-600 font-medium text-xs">
                    {result.sender.slice(-2).toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <EntityLink
                      entityRef={result.sender}
                      className="font-medium text-sm"
                      showPreview={false}
                    />
                    <span className="text-xs text-gray-400">{formatTime(result.createdAt)}</span>
                  </div>
                  <p className="text-sm text-gray-600 truncate mt-0.5">
                    {highlightSearchMatch(result.snippet, searchQuery)}
                  </p>
                </div>
              </button>
            ))}
          </div>
          <div className="px-3 py-2 text-xs text-gray-400 border-t border-gray-100">
            <kbd className="px-1 py-0.5 bg-gray-100 rounded text-[10px]">↑</kbd>{' '}
            <kbd className="px-1 py-0.5 bg-gray-100 rounded text-[10px]">↓</kbd> navigate{' '}
            <kbd className="px-1 py-0.5 bg-gray-100 rounded text-[10px]">Enter</kbd> select{' '}
            <kbd className="px-1 py-0.5 bg-gray-100 rounded text-[10px]">Esc</kbd> close
          </div>
        </>
      )}
    </div>
  );
}

function ChannelView({ channelId }: { channelId: string }) {
  const { data: channel } = useChannel(channelId);
  const { data: messages = [], isLoading, error } = useChannelMessages(channelId);
  const { data: entities } = useEntities();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [selectedThread, setSelectedThread] = useState<Message | null>(null);
  const [showMembersPanel, setShowMembersPanel] = useState(false);

  // TB103: Message search state
  const [messageSearchQuery, setMessageSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Determine current operator (prefer human entity, fall back to first entity)
  const currentOperator =
    entities?.find((e) => e.entityType === 'human')?.id ||
    entities?.[0]?.id ||
    '';

  // Scroll to bottom when messages change (only if not searching)
  useEffect(() => {
    if (!highlightedMessageId) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, highlightedMessageId]);

  // TB103: Handle search result selection - scroll to and highlight message
  const handleSearchResultSelect = useCallback((messageId: string) => {
    setMessageSearchQuery('');
    setIsSearchOpen(false);

    // Find the message element and scroll to it
    const messageElement = document.querySelector(`[data-testid="message-${messageId}"]`);
    if (messageElement) {
      messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });

      // Highlight the message temporarily
      setHighlightedMessageId(messageId);
      setTimeout(() => {
        setHighlightedMessageId(null);
      }, 2000);
    }
  }, []);

  // TB103: Clear highlight when clicking elsewhere
  useEffect(() => {
    if (!highlightedMessageId) return;

    const handleClick = () => {
      setHighlightedMessageId(null);
    };

    // Delay adding listener to avoid immediate clearing
    const timeout = setTimeout(() => {
      document.addEventListener('click', handleClick);
    }, 100);

    return () => {
      clearTimeout(timeout);
      document.removeEventListener('click', handleClick);
    };
  }, [highlightedMessageId]);

  // TB103: Handle search input focus with keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + F to focus search
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault();
        searchInputRef.current?.focus();
        setIsSearchOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

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
                {/* TB103: Message Search Input */}
                <div className="relative" data-testid="message-search-container">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      ref={searchInputRef}
                      type="text"
                      value={messageSearchQuery}
                      onChange={(e) => {
                        setMessageSearchQuery(e.target.value);
                        setIsSearchOpen(e.target.value.length > 0);
                      }}
                      onFocus={() => messageSearchQuery && setIsSearchOpen(true)}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                          setMessageSearchQuery('');
                          setIsSearchOpen(false);
                          searchInputRef.current?.blur();
                        }
                      }}
                      placeholder="Search messages..."
                      className="w-48 pl-8 pr-8 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      data-testid="message-search-input"
                    />
                    {messageSearchQuery && (
                      <button
                        onClick={() => {
                          setMessageSearchQuery('');
                          setIsSearchOpen(false);
                          searchInputRef.current?.focus();
                        }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        data-testid="message-search-clear"
                      >
                        <XCircle className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  {/* Search Results Dropdown */}
                  {isSearchOpen && (
                    <MessageSearchDropdown
                      searchQuery={messageSearchQuery}
                      channelId={channelId}
                      onSelectResult={handleSearchResultSelect}
                      onClose={() => setIsSearchOpen(false)}
                    />
                  )}
                </div>
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
                    isHighlighted={highlightedMessageId === grouped.item.id}
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
                    isHighlighted={highlightedMessageId === grouped.item.id}
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

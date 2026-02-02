/**
 * Channel view components for displaying messages in a channel
 */

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Settings, Search, ChevronLeft } from 'lucide-react';
import { VirtualizedChatList } from '../../../components/shared/VirtualizedChatList';
import { useIsMobile } from '../../../hooks';
import { useChannelMessages } from '../../../api/hooks/useMessages';
import {
  groupMessagesByDay,
  type MessageWithDayGroup,
  formatDateSeparator,
} from '../../../lib';
import { ChannelIcon } from './ChannelList';
import { MessageBubble, DateSeparator } from './MessageBubble';
import { MessageComposer } from './MessageComposer';
import { MessageSearch } from './MessageSearch';
import { ThreadPanel } from './ThreadPanel';
import type { Channel, Message, MessageSearchResult } from '../types';

// ============================================================================
// ChannelHeader
// ============================================================================

interface ChannelHeaderProps {
  channel: Channel;
  onOpenMembers?: () => void;
  onBack?: () => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onSearchResultClick: (result: MessageSearchResult) => void;
  isMobile?: boolean;
}

export function ChannelHeader({
  channel,
  onOpenMembers,
  onBack,
  searchQuery: _searchQuery,
  onSearchChange: _onSearchChange,
  onSearchResultClick,
  isMobile = false,
}: ChannelHeaderProps) {
  const [showSearch, setShowSearch] = useState(false);

  return (
    <div
      data-testid="channel-header"
      className={`border-b border-[var(--color-border)] bg-[var(--color-bg)] ${
        isMobile ? 'px-2 py-2' : 'px-4 py-3'
      }`}
    >
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Mobile back button */}
        {isMobile && onBack && (
          <button
            onClick={onBack}
            className="p-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 touch-target"
            data-testid="channel-back-button"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        )}
        <ChannelIcon channel={channel} />
        <div className="flex-1 min-w-0">
          <h2
            data-testid="channel-name"
            className={`font-semibold text-[var(--color-text)] truncate ${
              isMobile ? 'text-base' : 'text-lg'
            }`}
          >
            {channel.name}
          </h2>
          <p
            data-testid="channel-members-count"
            className={`text-gray-500 dark:text-gray-400 ${
              isMobile ? 'text-xs' : 'text-sm'
            }`}
          >
            {channel.members.length} {channel.members.length === 1 ? 'member' : 'members'}
          </p>
        </div>

        {/* Search toggle (mobile) */}
        {isMobile && (
          <button
            onClick={() => setShowSearch(!showSearch)}
            className={`p-2 rounded-lg transition-colors touch-target ${
              showSearch
                ? 'text-blue-600 bg-blue-50 dark:bg-blue-900/30'
                : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
            data-testid="channel-search-toggle"
          >
            <Search className="w-5 h-5" />
          </button>
        )}

        {/* Search bar (desktop) */}
        {!isMobile && (
          <div className="hidden md:block w-64">
            <MessageSearch
              channelId={channel.id}
              onResultClick={onSearchResultClick}
              isMobile={false}
            />
          </div>
        )}

        {/* Settings button */}
        {onOpenMembers && (
          <button
            onClick={onOpenMembers}
            className={`text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors ${
              isMobile ? 'p-2 touch-target' : 'p-2'
            }`}
            title="Channel settings"
            data-testid="channel-settings-button"
          >
            <Settings className={isMobile ? 'w-5 h-5' : 'w-5 h-5'} />
          </button>
        )}
      </div>

      {/* Mobile search bar (expanded) */}
      {isMobile && showSearch && (
        <div className="mt-2">
          <MessageSearch
            channelId={channel.id}
            onResultClick={(result) => {
              onSearchResultClick(result);
              setShowSearch(false);
            }}
            isMobile={true}
          />
        </div>
      )}
    </div>
  );
}

// ============================================================================
// ChannelView
// ============================================================================

interface ChannelViewProps {
  channelId: string;
  channel: Channel | undefined;
  onOpenMembers?: () => void;
  onBack?: () => void;
  className?: string;
}

export function ChannelView({
  channelId,
  channel,
  onOpenMembers,
  onBack,
  className = '',
}: ChannelViewProps) {
  const isMobile = useIsMobile();
  const { data: messages = [], isLoading } = useChannelMessages(channelId);
  const [selectedThread, setSelectedThread] = useState<Message | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear highlighted message after delay
  useEffect(() => {
    if (highlightedMessageId) {
      highlightTimeoutRef.current = setTimeout(() => {
        setHighlightedMessageId(null);
      }, 3000);
    }
    return () => {
      if (highlightTimeoutRef.current) {
        clearTimeout(highlightTimeoutRef.current);
      }
    };
  }, [highlightedMessageId]);

  // TB99: Group messages by day for display
  const groupedMessages = useMemo(() => {
    // Only include root messages (no threadId)
    const rootMessages = messages.filter((m: Message) => !m.threadId);
    return groupMessagesByDay(rootMessages, (m) => m.createdAt);
  }, [messages]);

  // Count replies per thread
  const replyCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    messages.forEach((msg: Message) => {
      if (msg.threadId) {
        counts[msg.threadId] = (counts[msg.threadId] || 0) + 1;
      }
    });
    return counts;
  }, [messages]);

  const handleOpenThread = useCallback((message: Message) => {
    setSelectedThread(message);
  }, []);

  const handleSearchResultClick = useCallback((result: MessageSearchResult) => {
    // Check if it's a threaded message
    if (result.threadId) {
      // Find the parent message and open thread panel
      const parentMessage = messages.find((m: Message) => m.id === result.threadId);
      if (parentMessage) {
        setSelectedThread(parentMessage);
        // After thread opens, scroll to and highlight the specific reply
        setTimeout(() => {
          setHighlightedMessageId(result.id);
        }, 100);
      }
    } else {
      // Highlight the message in main view
      setHighlightedMessageId(result.id);
    }
  }, [messages]);

  if (!channel) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[var(--color-surface)]">
        <div className="text-center text-gray-500 dark:text-gray-400">Channel not found</div>
      </div>
    );
  }

  // TB131: Item height estimator for VirtualizedChatList
  const estimateItemSize = (index: number) => {
    const item = groupedMessages[index];
    if (!item) return 80;

    const message = item.item;

    // Date separator height
    if (item.isFirstInDay) {
      return 44 + 80; // Separator + message
    }

    // Estimate based on content
    const baseHeight = 80;
    const content = message._content || '';

    // Add extra height for long messages
    const lineCount = Math.ceil(content.length / 60);
    const contentHeight = lineCount > 2 ? (lineCount - 2) * 20 : 0;

    // Add extra height for messages with images
    if (content.includes('![') && content.includes('](')) {
      return baseHeight + contentHeight + 340;
    }

    // Add height for attachments
    const attachmentCount = message._attachments?.length || 0;
    const attachmentHeight = attachmentCount * 60;

    return baseHeight + contentHeight + attachmentHeight;
  };

  return (
    <div
      data-testid="channel-view"
      className={`flex-1 flex flex-col h-full bg-[var(--color-bg)] ${className}`}
    >
      <ChannelHeader
        channel={channel}
        onOpenMembers={onOpenMembers}
        onBack={onBack}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onSearchResultClick={handleSearchResultClick}
        isMobile={isMobile}
      />
      <div className="flex-1 flex overflow-hidden">
        {/* Messages area - TB131: Virtualized */}
        <div className="flex-1 flex flex-col min-w-0">
          <div
            data-testid="channel-messages"
            className={`flex-1 overflow-hidden ${isMobile ? 'px-1' : 'px-4'}`}
          >
            {isLoading ? (
              <div className="h-full flex items-center justify-center text-gray-500 dark:text-gray-400">
                Loading messages...
              </div>
            ) : groupedMessages.length === 0 ? (
              <div
                data-testid="channel-empty-messages"
                className="h-full flex items-center justify-center text-gray-500 dark:text-gray-400"
              >
                <div className="text-center">
                  <p className="text-lg mb-2">No messages yet</p>
                  <p className="text-sm">Start the conversation!</p>
                </div>
              </div>
            ) : (
              <VirtualizedChatList
                items={groupedMessages}
                getItemKey={(msg) => msg.item.id}
                estimateSize={estimateItemSize}
                testId="virtualized-channel-messages"
                gap={2}
                latestMessageId={groupedMessages[groupedMessages.length - 1]?.item.id}
                renderItem={(msg: MessageWithDayGroup<Message>) => (
                  <div>
                    {msg.isFirstInDay && (
                      <DateSeparator date={formatDateSeparator(msg.item.createdAt)} />
                    )}
                    <MessageBubble
                      message={msg.item}
                      onReply={handleOpenThread}
                      replyCount={replyCounts[msg.item.id] || 0}
                      isHighlighted={highlightedMessageId === msg.item.id}
                      isMobile={isMobile}
                    />
                  </div>
                )}
              />
            )}
          </div>
          <MessageComposer channelId={channelId} channel={channel} isMobile={isMobile} />
        </div>

        {/* Thread panel - desktop only */}
        {selectedThread && !isMobile && (
          <ThreadPanel
            parentMessage={selectedThread}
            channel={channel}
            onClose={() => setSelectedThread(null)}
          />
        )}
      </div>

      {/* Thread modal - mobile only */}
      {selectedThread && isMobile && (
        <MobileThreadModal
          parentMessage={selectedThread}
          channel={channel}
          onClose={() => {
            setSelectedThread(null);
            setHighlightedMessageId(null);
          }}
        />
      )}
    </div>
  );
}

// ============================================================================
// MobileThreadModal
// ============================================================================

interface MobileThreadModalProps {
  parentMessage: Message;
  channel: Channel | undefined;
  onClose: () => void;
}

function MobileThreadModal({
  parentMessage,
  channel,
  onClose,
}: MobileThreadModalProps) {
  return (
    <div className="fixed inset-0 z-50 bg-[var(--color-bg)] flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 px-2 py-3 border-b border-[var(--color-border)]">
        <button
          onClick={onClose}
          className="p-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 touch-target"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h3 className="text-lg font-semibold text-[var(--color-text)]">Thread</h3>
      </div>

      {/* Thread content */}
      <div className="flex-1 overflow-hidden">
        <ThreadPanel
          parentMessage={parentMessage}
          channel={channel}
          onClose={onClose}
        />
      </div>
    </div>
  );
}

/**
 * Channel view components for displaying messages in a channel
 */

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Search, ChevronLeft, Users, UserCog, XCircle } from 'lucide-react';
import { VirtualizedChatList } from '../../../components/shared/VirtualizedChatList';
import { useIsMobile } from '../../../hooks';
import { useChannelMessages } from '../../../api/hooks/useMessages';
import {
  groupMessagesByDay,
  type MessageWithDayGroup,
  formatDateSeparator,
} from '../../../lib';
import {
  ChannelHeader as SharedChannelHeader,
  ChannelIcon,
  useChannelSearch,
} from '@elemental/ui';
import { MessageBubble, DateSeparator } from './MessageBubble';
import { MessageComposer } from './MessageComposer';
import { MessageSearchDropdown } from './MessageSearch';
import { ThreadPanel } from './ThreadPanel';
import type { Channel, Message } from '../types';

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
  const [showMobileSearch, setShowMobileSearch] = useState(false);
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Use shared search hook
  const {
    searchQuery,
    setSearchQuery,
    isSearchOpen,
    setIsSearchOpen,
    searchInputRef,
    clearSearch,
  } = useChannelSearch({ enableKeyboardShortcut: true });

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

  const handleSearchResultSelect = useCallback(
    (messageId: string) => {
      clearSearch();
      setShowMobileSearch(false);

      // Find the result to check if it's threaded
      const message = messages.find((m: Message) => m.id === messageId);
      if (message?.threadId) {
        // Find the parent message and open thread panel
        const parentMessage = messages.find((m: Message) => m.id === message.threadId);
        if (parentMessage) {
          setSelectedThread(parentMessage);
          // After thread opens, scroll to and highlight the specific reply
          setTimeout(() => {
            setHighlightedMessageId(messageId);
          }, 100);
        }
      } else {
        // Highlight the message in main view
        setHighlightedMessageId(messageId);
      }
    },
    [messages, clearSearch]
  );

  // Render search input for desktop
  const renderDesktopSearch = () => {
    if (!channel) return null;
    return (
      <div className="relative w-64" data-testid="message-search-container">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setIsSearchOpen(e.target.value.length > 0);
            }}
            onFocus={() => searchQuery && setIsSearchOpen(true)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                clearSearch();
                searchInputRef.current?.blur();
              }
            }}
            placeholder="Search messages..."
            className="w-full pl-8 pr-8 py-1.5 text-sm border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-[var(--color-surface)] text-[var(--color-text)]"
            data-testid="message-search-input"
          />
          {searchQuery && (
            <button
              onClick={() => {
                clearSearch();
                searchInputRef.current?.focus();
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              data-testid="message-search-clear"
            >
              <XCircle className="w-4 h-4" />
            </button>
          )}
        </div>
        {/* Search Results Dropdown */}
        {isSearchOpen && (
          <MessageSearchDropdown
            searchQuery={searchQuery}
            channelId={channelId}
            onSelectResult={handleSearchResultSelect}
            onClose={() => setIsSearchOpen(false)}
          />
        )}
      </div>
    );
  };

  // Render actions for the header
  const renderHeaderActions = ({ isMobile: mobile }: { isMobile: boolean }) => {
    if (!channel) return null;

    if (mobile) {
      return (
        <div className="flex items-center gap-1 ml-auto">
          <button
            onClick={() => setShowMobileSearch(!showMobileSearch)}
            className="p-2 rounded-md text-gray-500 dark:text-gray-400 hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] transition-colors touch-target"
            data-testid="mobile-search-toggle"
            aria-label="Search messages"
          >
            <Search className="w-5 h-5" />
          </button>
          {onOpenMembers && (
            <button
              onClick={onOpenMembers}
              className="p-2 rounded-md text-gray-500 dark:text-gray-400 hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] transition-colors touch-target"
              data-testid="channel-members-button"
              aria-label="View members"
            >
              <Users className="w-5 h-5" />
            </button>
          )}
        </div>
      );
    }

    return (
      <>
        {onOpenMembers && (
          <button
            onClick={onOpenMembers}
            className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 px-2 py-1 rounded transition-colors"
            data-testid="channel-members-button"
          >
            <UserCog className="w-4 h-4" />
            {channel.members.length} members
          </button>
        )}
        <div className="flex-1" />
        {renderDesktopSearch()}
      </>
    );
  };

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
      {/* Channel Header */}
      <div>
        <SharedChannelHeader
          channel={channel}
          isMobile={isMobile}
          onBack={onBack}
          renderIcon={(ch) => (
            <ChannelIcon channel={ch} className={isMobile ? 'w-4 h-4' : 'w-5 h-5'} />
          )}
          renderActions={renderHeaderActions}
        />

        {/* Mobile search bar (expanded) */}
        {isMobile && showMobileSearch && (
          <div className="px-2 pb-2 relative" data-testid="mobile-message-search-container">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setIsSearchOpen(e.target.value.length > 0);
                }}
                onFocus={() => searchQuery && setIsSearchOpen(true)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    clearSearch();
                    setShowMobileSearch(false);
                  }
                }}
                placeholder="Search messages..."
                className="w-full pl-10 pr-10 py-2.5 text-base border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-[var(--color-surface)] text-[var(--color-text)]"
                data-testid="mobile-message-search-input"
                autoFocus
              />
              {searchQuery && (
                <button
                  onClick={() => {
                    clearSearch();
                    searchInputRef.current?.focus();
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              )}
            </div>
            {/* Search Results Dropdown */}
            {isSearchOpen && (
              <MessageSearchDropdown
                searchQuery={searchQuery}
                channelId={channelId}
                onSelectResult={(messageId) => {
                  handleSearchResultSelect(messageId);
                  setShowMobileSearch(false);
                }}
                onClose={() => {
                  setIsSearchOpen(false);
                  setShowMobileSearch(false);
                }}
              />
            )}
          </div>
        )}
      </div>

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

function MobileThreadModal({ parentMessage, channel, onClose }: MobileThreadModalProps) {
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
        <ThreadPanel parentMessage={parentMessage} channel={channel} onClose={onClose} />
      </div>
    </div>
  );
}


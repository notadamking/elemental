/**
 * ChannelView component - main channel display with messages
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  MessageSquare,
  Search,
  XCircle,
  ChevronLeft,
} from 'lucide-react';
import { VirtualizedChatList } from '../../../components/shared/VirtualizedChatList';
import { ChannelMembersPanel } from '../../../components/message/ChannelMembersPanel';
import { groupMessagesByDay } from '../../../lib';
import { useChannel, useChannelMessages, useEntities } from '../../../api/hooks/useMessages';
import {
  ChannelHeader as SharedChannelHeader,
  ChannelIcon,
  useChannelSearch,
} from '@elemental/ui';
import { MessageBubble, DateSeparator } from './MessageBubble';
import { MessageComposer } from './MessageComposer';
import { MessageSearchDropdown } from './MessageSearch';
import { ThreadPanel } from './ThreadPanel';
import type { Message, Channel } from '../types';

// Estimated message height for virtualization
const MESSAGE_ROW_HEIGHT = 100;

// ============================================================================
// ChannelView
// ============================================================================

interface ChannelViewProps {
  channelId: string;
  isMobile?: boolean;
  onBack?: () => void;
  onChannelDeleted?: () => void;
}

export function ChannelView({ channelId, isMobile = false, onBack, onChannelDeleted }: ChannelViewProps) {
  const { data: channel } = useChannel(channelId);
  const { data: messages = [], isLoading, error } = useChannelMessages(channelId);
  const { data: entities } = useEntities();
  const [selectedThread, setSelectedThread] = useState<Message | null>(null);
  const [showMembersPanel, setShowMembersPanel] = useState(false);
  const [showMobileSearch, setShowMobileSearch] = useState(false);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);

  // Use shared search hook
  const {
    searchQuery,
    setSearchQuery,
    isSearchOpen,
    setIsSearchOpen,
    searchInputRef,
    clearSearch,
  } = useChannelSearch({ enableKeyboardShortcut: true });

  // Determine current operator (prefer human entity, fall back to first entity)
  const currentOperator =
    entities?.find((e) => e.entityType === 'human')?.id || entities?.[0]?.id || '';

  // Handle search result selection - scroll to and highlight message
  const handleSearchResultSelect = useCallback((messageId: string) => {
    clearSearch();
    setShowMobileSearch(false);

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
  }, [clearSearch]);

  // Clear highlight when clicking elsewhere
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

  // Calculate reply counts for each message
  const replyCounts = messages.reduce(
    (acc, msg) => {
      if (msg.threadId) {
        acc[msg.threadId] = (acc[msg.threadId] || 0) + 1;
      }
      return acc;
    },
    {} as Record<string, number>
  );

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

  // Render search input for desktop
  const renderDesktopSearch = () => (
    <div className="relative" data-testid="message-search-container">
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
          className="w-48 pl-8 pr-8 py-1.5 text-sm border border-[var(--color-border)] rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-[var(--color-surface)] text-[var(--color-text)]"
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

  // Render actions for the header
  const renderHeaderActions = ({ isMobile: mobile }: { isMobile: boolean }) => {
    if (!channel) return null;

    if (mobile) {
      return (
        <button
          onClick={() => setShowMobileSearch(!showMobileSearch)}
          className="p-2 rounded-md text-gray-500 dark:text-gray-400 hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] transition-colors touch-target"
          data-testid="mobile-search-toggle"
          aria-label="Search messages"
        >
          <Search className="w-5 h-5" />
        </button>
      );
    }

    return (
      <>
        {renderDesktopSearch()}
      </>
    );
  };

  return (
    <div
      data-testid="channel-view"
      className={`flex-1 flex bg-[var(--color-bg)] ${isMobile ? 'absolute inset-0 z-40' : ''}`}
    >
      {/* Main Channel Area */}
      <div className="flex-1 flex flex-col">
        {/* Channel Header */}
        {channel && (
          <div>
            <SharedChannelHeader
              channel={channel}
              isMobile={isMobile}
              onBack={onBack}
              onOpenMembers={() => setShowMembersPanel(true)}
              renderIcon={(ch) => (
                <ChannelIcon channel={ch} className={isMobile ? 'w-4 h-4' : 'w-5 h-5'} />
              )}
              renderActions={renderHeaderActions}
            />

            {/* Mobile search bar (shown below header when toggled) */}
            {isMobile && showMobileSearch && (
              <div className="px-3 pb-3 relative" data-testid="mobile-message-search-container">
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
                    placeholder="Search..."
                    className="w-full pl-10 pr-10 py-2.5 text-base border border-[var(--color-border)] rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-[var(--color-surface)] text-[var(--color-text)]"
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
        )}

        {/* Messages Area - TB131: Always use virtualized chat list */}
        <div
          data-testid="messages-container"
          className={`flex-1 overflow-hidden ${isMobile ? 'p-2' : 'p-4'}`}
        >
          {isLoading ? (
            <div
              data-testid="messages-loading"
              className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400"
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
          ) : (
            <VirtualizedChatList
              items={groupedMessages}
              getItemKey={(grouped) => grouped.item.id}
              estimateSize={(index) => {
                const baseHeight = isMobile ? 80 : MESSAGE_ROW_HEIGHT;
                const grouped = groupedMessages[index];
                let height = baseHeight;

                // Add more height for day separator
                if (grouped?.isFirstInDay) {
                  height += 48;
                }

                // Add height for messages with images (max-h-80 = 320px + margins)
                const content = grouped?.item?._content || '';
                if (content.includes('![') && content.includes('](')) {
                  height += 340; // Account for max image height + margins
                }

                return height;
              }}
              scrollRestoreId={`messages-${channelId}`}
              testId="virtualized-messages-list"
              gap={isMobile ? 4 : 8}
              latestMessageId={rootMessages[rootMessages.length - 1]?.id}
              renderEmpty={() => (
                <div
                  data-testid="messages-empty"
                  className={`flex flex-col items-center justify-center h-full text-gray-500 dark:text-gray-400 ${
                    isMobile ? 'px-4' : ''
                  }`}
                >
                  <MessageSquare
                    className={`mb-3 text-gray-300 dark:text-gray-600 ${
                      isMobile ? 'w-10 h-10' : 'w-12 h-12'
                    }`}
                  />
                  <p className={isMobile ? 'text-base' : 'text-sm'}>No messages yet</p>
                  <p
                    className={`text-gray-400 dark:text-gray-500 mt-1 ${
                      isMobile ? 'text-sm' : 'text-xs'
                    }`}
                  >
                    Be the first to send a message!
                  </p>
                </div>
              )}
              renderItem={(grouped) => (
                <div>
                  {grouped.isFirstInDay && <DateSeparator date={grouped.formattedDate} />}
                  <MessageBubble
                    message={grouped.item}
                    onReply={handleReply}
                    replyCount={replyCounts[grouped.item.id] || 0}
                    isHighlighted={highlightedMessageId === grouped.item.id}
                    isMobile={isMobile}
                  />
                </div>
              )}
            />
          )}
        </div>

        {/* Message Composer */}
        <MessageComposer channelId={channelId} channel={channel} isMobile={isMobile} />
      </div>

      {/* Thread Panel - hide on mobile when showing channel view */}
      {selectedThread && !isMobile && (
        <ThreadPanel
          parentMessage={selectedThread}
          channel={channel}
          onClose={() => setSelectedThread(null)}
        />
      )}

      {/* Thread Panel as full-screen modal on mobile */}
      {selectedThread && isMobile && (
        <MobileThreadPanel
          selectedThread={selectedThread}
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
          onChannelDeleted={onChannelDeleted}
        />
      )}
    </div>
  );
}

// ============================================================================
// MobileThreadPanel (extracted for clarity)
// ============================================================================

interface MobileThreadPanelProps {
  selectedThread: Message;
  channel: Channel | undefined;
  onClose: () => void;
}

function MobileThreadPanel({ selectedThread, channel, onClose }: MobileThreadPanelProps) {
  return (
    <div
      className="fixed inset-0 z-50 bg-[var(--color-bg)] flex flex-col"
      data-testid="mobile-thread-panel"
    >
      <div className="flex items-center gap-2 p-3 border-b border-[var(--color-border)]">
        <button
          onClick={onClose}
          className="p-2 -ml-2 rounded-md text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] transition-colors touch-target"
          data-testid="mobile-thread-back"
          aria-label="Close thread"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <span className="font-medium text-[var(--color-text)]">Thread</span>
      </div>
      <div className="flex-1 overflow-hidden">
        <ThreadPanel parentMessage={selectedThread} channel={channel} onClose={onClose} />
      </div>
    </div>
  );
}

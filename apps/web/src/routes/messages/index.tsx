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

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearch, useNavigate } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { useIsMobile } from '../../hooks/useBreakpoint';
import { CreateChannelModal } from '../../components/message/CreateChannelModal';
import { useAllChannels } from '../../api/hooks/useAllElements';
import { usePaginatedData, createChannelFilter } from '../../hooks/usePaginatedData';
import { useCurrentUser } from '../../contexts';
import { useRealtimeEvents } from '../../api/hooks/useRealtimeEvents';
import type { WebSocketEvent } from '../../api/websocket';

import { ChannelList, ChannelPlaceholder } from './components/ChannelList';
import { ChannelView } from './components/ChannelView';
import { DEFAULT_CHANNEL_PAGE_SIZE } from '../../api/hooks/useMessages';
import type { Channel } from './types';

// ============================================================================
// MessagesPage
// ============================================================================

export function MessagesPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: '/messages' });
  const isMobile = useIsMobile();
  const { currentUser } = useCurrentUser();

  // Pagination state from URL
  const currentPage = search.page ?? 1;
  const pageSize = search.limit ?? DEFAULT_CHANNEL_PAGE_SIZE;

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(
    search.channel ?? null
  );
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // Real-time event handling for new messages
  const handleMessageEvent = useCallback(
    (event: WebSocketEvent) => {
      if (event.elementType === 'message' && event.eventType === 'created') {
        const msgChannelId = event.newValue?.channelId as string | undefined;
        const msgSender = event.newValue?.sender as string | undefined;
        // Don't show toast for messages sent by the current user
        if (msgSender && currentUser && msgSender === currentUser.id) {
          return;
        }
        // Show toast for new messages in the currently selected channel
        if (msgChannelId && msgChannelId === selectedChannelId) {
          toast.info('New message received', {
            description: 'The conversation has been updated',
            duration: 3000,
          });
        }
      }
    },
    [selectedChannelId, currentUser]
  );

  // Subscribe to messages channel for real-time updates
  useRealtimeEvents({
    channels: selectedChannelId ? [`messages:${selectedChannelId}`, 'messages'] : ['messages'],
    onEvent: handleMessageEvent,
  });

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
    navigate({
      to: '/messages',
      search: { channel: channelId, message: undefined, page: currentPage, limit: pageSize },
    });
  };

  const handlePageChange = (page: number) => {
    navigate({
      to: '/messages',
      search: {
        page,
        limit: pageSize,
        channel: selectedChannelId ?? undefined,
        message: undefined,
      },
    });
  };

  const handlePageSizeChange = (newPageSize: number) => {
    navigate({
      to: '/messages',
      search: {
        page: 1,
        limit: newPageSize,
        channel: selectedChannelId ?? undefined,
        message: undefined,
      },
    });
  };

  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
    navigate({
      to: '/messages',
      search: {
        page: 1,
        limit: pageSize,
        channel: selectedChannelId ?? undefined,
        message: undefined,
      },
    });
  };

  const handleChannelCreated = (channel: { id: string }) => {
    setSelectedChannelId(channel.id);
    navigate({
      to: '/messages',
      search: { channel: channel.id, message: undefined, page: currentPage, limit: pageSize },
    });
  };

  // Handle back navigation on mobile
  const handleMobileBack = () => {
    setSelectedChannelId(null);
    navigate({
      to: '/messages',
      search: { page: currentPage, limit: pageSize, channel: undefined, message: undefined },
    });
  };

  if (error) {
    return (
      <div data-testid="messages-page-error" className="flex items-center justify-center h-full">
        <div className="text-center px-4">
          <p className="text-red-500 mb-2">Failed to load channels</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">{(error as Error).message}</p>
        </div>
      </div>
    );
  }

  // Mobile: Two-screen navigation pattern
  // - When no channel selected: show full-screen channel list
  // - When channel selected: show full-screen channel view with back button
  if (isMobile) {
    return (
      <div data-testid="messages-page" className="flex flex-col h-full relative">
        {/* Mobile: Show channel list when no channel selected */}
        {!selectedChannelId && (
          <>
            {isLoading ? (
              <div
                data-testid="channels-loading"
                className="flex-1 flex items-center justify-center"
              >
                <div className="text-gray-500 dark:text-gray-400">Loading channels...</div>
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
                isMobile={true}
              />
            )}

            {/* Mobile FAB for creating new channel */}
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="fixed bottom-20 right-4 w-14 h-14 bg-blue-500 hover:bg-blue-600 text-white rounded-full shadow-lg flex items-center justify-center transition-colors z-30 touch-target"
              data-testid="mobile-create-channel-fab"
              aria-label="Create new channel"
            >
              <Plus className="w-6 h-6" />
            </button>
          </>
        )}

        {/* Mobile: Show channel view when channel selected */}
        {selectedChannelId && (
          <ChannelView channelId={selectedChannelId} isMobile={true} onBack={handleMobileBack} />
        )}

        <CreateChannelModal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          onSuccess={handleChannelCreated}
        />
      </div>
    );
  }

  // Desktop: Side-by-side layout
  return (
    <div data-testid="messages-page" className="flex h-full">
      {isLoading ? (
        <div
          data-testid="channels-loading"
          className="w-64 border-r border-[var(--color-border)] flex items-center justify-center"
        >
          <div className="text-gray-500 dark:text-gray-400">Loading channels...</div>
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
          isMobile={false}
        />
      )}

      {selectedChannelId ? (
        <ChannelView channelId={selectedChannelId} isMobile={false} />
      ) : (
        <ChannelPlaceholder isMobile={false} />
      )}

      <CreateChannelModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={handleChannelCreated}
      />
    </div>
  );
}

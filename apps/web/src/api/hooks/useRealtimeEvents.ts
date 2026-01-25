/**
 * Real-time Events Hook
 *
 * React hook for subscribing to real-time events and invalidating React Query caches.
 */

import { useEffect, useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getWebSocketManager,
  initializeWebSocket,
  type WebSocketEvent,
  type ConnectionState,
  type SubscriptionChannel,
} from '../websocket';

/**
 * Map element types to query keys that should be invalidated
 */
function getQueryKeysForEvent(event: WebSocketEvent): string[][] {
  const keys: string[][] = [];

  switch (event.elementType) {
    case 'task':
      keys.push(['tasks']);
      keys.push(['tasks', event.elementId]);
      keys.push(['tasks', 'ready']);
      keys.push(['tasks', 'blocked']);
      keys.push(['tasks', 'completed']);
      keys.push(['stats']); // Stats include ready/blocked counts
      break;

    case 'plan':
      keys.push(['plans']);
      keys.push(['plans', event.elementId]);
      keys.push(['stats']);
      break;

    case 'workflow':
      keys.push(['workflows']);
      keys.push(['workflows', event.elementId]);
      keys.push(['stats']);
      break;

    case 'entity':
      keys.push(['entities']);
      keys.push(['entities', event.elementId]);
      keys.push(['stats']);
      break;

    case 'document':
      keys.push(['documents']);
      keys.push(['documents', event.elementId]);
      keys.push(['stats']);
      break;

    case 'channel':
      keys.push(['channels']);
      keys.push(['channels', event.elementId]);
      keys.push(['stats']);
      break;

    case 'message':
      keys.push(['messages']);
      keys.push(['messages', event.elementId]);
      // Also invalidate the channel's messages
      if (event.newValue?.channel) {
        keys.push(['channels', event.newValue.channel as string, 'messages']);
      }
      break;

    case 'team':
      keys.push(['teams']);
      keys.push(['teams', event.elementId]);
      keys.push(['stats']);
      break;

    case 'inbox-item':
      // Invalidate inbox queries for the recipient
      // The recipientId is included in the newValue by the server
      if (event.newValue?.recipientId) {
        const recipientId = event.newValue.recipientId as string;
        keys.push(['entities', recipientId, 'inbox']);
        keys.push(['entities', recipientId, 'inbox', 'count']);
        keys.push(['entities', recipientId, 'inbox', 'unread']);
        keys.push(['entities', recipientId, 'inbox', 'read']);
        keys.push(['entities', recipientId, 'inbox', 'archived']);
      }
      break;

    default:
      // For unknown types, just invalidate stats
      keys.push(['stats']);
  }

  return keys;
}

/**
 * Hook options
 */
export interface UseRealtimeEventsOptions {
  /** Channels to subscribe to (default: ['*']) */
  channels?: SubscriptionChannel[];
  /** Called when an event is received */
  onEvent?: (event: WebSocketEvent) => void;
  /** Called when connection state changes */
  onStateChange?: (state: ConnectionState) => void;
  /** Whether to automatically invalidate queries (default: true) */
  autoInvalidate?: boolean;
}

/**
 * Hook for subscribing to real-time events
 *
 * Automatically connects to WebSocket, subscribes to channels,
 * and invalidates React Query caches when events are received.
 */
export function useRealtimeEvents(options: UseRealtimeEventsOptions = {}): {
  connectionState: ConnectionState;
  lastEvent: WebSocketEvent | null;
} {
  const {
    channels = ['*'],
    onEvent,
    onStateChange,
    autoInvalidate = true,
  } = options;

  const queryClient = useQueryClient();
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [lastEvent, setLastEvent] = useState<WebSocketEvent | null>(null);

  // Handle incoming events
  const handleEvent = useCallback(
    (event: WebSocketEvent) => {
      setLastEvent(event);

      // Call custom handler
      if (onEvent) {
        onEvent(event);
      }

      // Invalidate relevant queries
      if (autoInvalidate) {
        const queryKeys = getQueryKeysForEvent(event);
        for (const key of queryKeys) {
          queryClient.invalidateQueries({ queryKey: key });
        }
      }
    },
    [onEvent, autoInvalidate, queryClient]
  );

  // Handle connection state changes
  const handleStateChange = useCallback(
    (state: ConnectionState) => {
      setConnectionState(state);
      if (onStateChange) {
        onStateChange(state);
      }
    },
    [onStateChange]
  );

  useEffect(() => {
    // Initialize WebSocket
    const manager = initializeWebSocket({
      channels,
    });

    // Add listeners
    const removeEventListener = manager.addEventListener(handleEvent);
    const removeStateListener = manager.addStateListener(handleStateChange);

    // Subscribe to channels
    manager.subscribe(channels);

    return () => {
      removeEventListener();
      removeStateListener();
    };
  }, [channels, handleEvent, handleStateChange]);

  return {
    connectionState,
    lastEvent,
  };
}

/**
 * Hook for just getting connection state without subscribing to events
 */
export function useWebSocketState(): ConnectionState {
  const [state, setState] = useState<ConnectionState>('disconnected');

  useEffect(() => {
    const manager = getWebSocketManager();
    const removeListener = manager.addStateListener(setState);
    return removeListener;
  }, []);

  return state;
}

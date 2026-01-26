# WebSocket Patterns

## Files

### Server
- **Broadcaster**: `apps/server/src/ws/broadcaster.ts` - Event polling and distribution
- **Handler**: `apps/server/src/ws/handler.ts` - Connection management
- **Types**: `apps/server/src/ws/types.ts` - Message/event types

### Client
- **React hook**: `apps/web/src/api/hooks/useRealtimeEvents.ts`

## Architecture

**Endpoint**: `/ws` (upgrade from HTTP)

The WebSocket system uses **event polling** (not direct broadcasting):
1. `EventBroadcaster` polls the database for new events every 500ms
2. Listeners registered via `addListener()` receive events
3. Handler distributes to subscribed clients based on channel

## Subscription Channels

Clients subscribe to channels: `tasks`, `plans`, `workflows`, `entities`, `documents`, `channels`, `messages`, `teams`, `inbox`, `*` (all).

Dynamic channels: `messages:${channelId}`, `inbox:${recipientId}`

## Server-Side Setup

```typescript
import { initializeBroadcaster, getBroadcaster } from './ws/broadcaster';

// Initialize (once at startup)
const broadcaster = initializeBroadcaster(api);
await broadcaster.start();

// Events are automatically polled and distributed to listeners
```

## Handler Exports

The handler (`apps/server/src/ws/handler.ts`) exports:
- `broadcastToAll(message)` - Send arbitrary message to all clients
- `broadcastInboxEvent(event)` - Broadcast inbox-specific events
- `getClientCount()` - Get current connected client count

## Client-Side Usage

Use the `useRealtimeEvents` hook - no direct WebSocket client needed:

## React Integration

Use the `useRealtimeEvents` hook:

```typescript
import { useRealtimeEvents } from '@/api/hooks/useRealtimeEvents';
import { useQueryClient } from '@tanstack/react-query';

function TaskList() {
  const queryClient = useQueryClient();

  useRealtimeEvents({
    onElementCreated: (element) => {
      if (element.type === 'task') {
        // Invalidate cache to refetch
        queryClient.invalidateQueries({ queryKey: ['tasks'] });
      }
    },
    onElementUpdated: (element) => {
      if (element.type === 'task') {
        queryClient.invalidateQueries({ queryKey: ['tasks'] });
      }
    },
  });

  // ... render tasks
}
```

## Optimistic Updates

Combine mutations with WebSocket for optimistic UI:

```typescript
const mutation = useMutation({
  mutationFn: createTask,
  onMutate: async (newTask) => {
    // Cancel outgoing refetches
    await queryClient.cancelQueries({ queryKey: ['tasks'] });

    // Snapshot previous value
    const previous = queryClient.getQueryData(['tasks']);

    // Optimistically update
    queryClient.setQueryData(['tasks'], (old) => [...old, newTask]);

    return { previous };
  },
  onError: (err, newTask, context) => {
    // Rollback on error
    queryClient.setQueryData(['tasks'], context.previous);
  },
  onSettled: () => {
    // Always refetch after error or success
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
  },
});
```

## Connection Status

```typescript
// Use the useWebSocketState hook for connection state
import { useWebSocketState } from '@/api/hooks/useRealtimeEvents';

function ConnectionStatus() {
  const status = useWebSocketState();  // 'connecting' | 'connected' | 'disconnected' | 'reconnecting'
  return <span>Status: {status}</span>;
}
```

## Reconnection & Keep-Alive

- Client sends ping every 30 seconds (configurable via `pingInterval` option)
- Reconnection uses exponential backoff: 1s → 2s → 4s → ... → 30s max
- Events poll every 500ms on server (configurable via `pollIntervalMs`)
```

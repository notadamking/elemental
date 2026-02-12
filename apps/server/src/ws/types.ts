/**
 * WebSocket Types
 *
 * Re-exported from @elemental/shared-routes for backwards compatibility.
 */

export type {
  SubscriptionChannel,
  ClientMessageType,
  SubscribeMessage,
  UnsubscribeMessage,
  PingMessage,
  ClientMessage,
  ServerMessageType,
  WebSocketEvent,
  EventMessage,
  PongMessage,
  ErrorMessage,
  SubscribedMessage,
  UnsubscribedMessage,
  ServerMessage,
} from '@elemental/shared-routes';
export { getChannelForElementType, parseClientMessage } from '@elemental/shared-routes';

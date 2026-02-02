/**
 * Shared Types for Collaborate Routes
 *
 * Defines the services interface that both main server and orchestrator-server satisfy.
 */

import type { ElementalAPI, InboxService } from '@elemental/sdk';
import type { StorageBackend } from '@elemental/storage';
import type { EntityId } from '@elemental/core';

/**
 * Services required for collaborate routes.
 * Both main server and orchestrator-server provide these services.
 */
export interface CollaborateServices {
  api: ElementalAPI;
  inboxService: InboxService;
  storageBackend: StorageBackend;
}

/**
 * Optional callback for broadcasting inbox events in real-time.
 * Used by servers with WebSocket support.
 */
export type BroadcastInboxEventFn = (
  id: string,
  recipientId: EntityId,
  action: 'created' | 'updated' | 'deleted',
  oldData: Record<string, unknown> | null,
  newData: Record<string, unknown> | null,
  actor: EntityId
) => void;

/**
 * Extended services including optional real-time features.
 */
export interface CollaborateServicesWithBroadcast extends CollaborateServices {
  broadcastInboxEvent?: BroadcastInboxEventFn;
}

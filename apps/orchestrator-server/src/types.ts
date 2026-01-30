/**
 * Shared Types
 *
 * Type definitions used across the orchestrator server.
 */

import type { EntityId } from '@elemental/core';

export type ServerWebSocket<T> = {
  data: T;
  send(data: string | ArrayBuffer): void;
  close(): void;
  readyState: number;
};

export interface WSClientData {
  id: string;
  agentId?: EntityId;
  sessionId?: string;
  isInteractive?: boolean;
}

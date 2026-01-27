/**
 * Workspace Pane Types
 *
 * Type definitions for the terminal multiplexer workspace system.
 */

import type { AgentRole, WorkerMode, Agent } from '../../api/types';

/** Unique identifier for a pane */
export type PaneId = string;

/** Layout preset types */
export type LayoutPreset = 'single' | 'split-horizontal' | 'split-vertical' | 'grid';

/** Pane type determines rendering behavior */
export type PaneType = 'terminal' | 'stream';

/** Pane status reflects agent connection state */
export type PaneStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

/**
 * Configuration for a single pane
 */
export interface WorkspacePane {
  id: PaneId;
  agentId: string;
  agentName: string;
  agentRole: AgentRole;
  workerMode?: WorkerMode;
  paneType: PaneType;
  status: PaneStatus;
  /** Position in the grid (0-indexed) */
  position: number;
  /** Size weight for resizing (default 1) */
  weight: number;
}

/**
 * Layout configuration for persisting workspace state
 */
export interface WorkspaceLayout {
  id: string;
  name: string;
  preset: LayoutPreset;
  panes: WorkspacePane[];
  createdAt: number;
  modifiedAt: number;
}

/**
 * Workspace state managed by the PaneManager hook
 */
export interface WorkspaceState {
  layout: WorkspaceLayout;
  activePane: PaneId | null;
  isResizing: boolean;
}

/**
 * Actions for workspace pane management
 */
export interface WorkspaceActions {
  /** Add a new pane with the specified agent */
  addPane: (agent: Agent) => void;
  /** Remove a pane by ID */
  removePane: (paneId: PaneId) => void;
  /** Set the active (focused) pane */
  setActivePane: (paneId: PaneId | null) => void;
  /** Update pane status */
  updatePaneStatus: (paneId: PaneId, status: PaneStatus) => void;
  /** Change layout preset */
  setLayoutPreset: (preset: LayoutPreset) => void;
  /** Reorder panes (for drag-drop) */
  reorderPanes: (fromIndex: number, toIndex: number) => void;
  /** Update pane weight for resizing */
  setPaneWeight: (paneId: PaneId, weight: number) => void;
  /** Save current layout with a name */
  saveLayout: (name: string) => void;
  /** Load a saved layout */
  loadLayout: (layout: WorkspaceLayout) => void;
  /** Clear all panes */
  clearPanes: () => void;
}

/**
 * Stream event from ephemeral agent
 */
export interface StreamEvent {
  id: string;
  type: 'assistant' | 'tool_use' | 'tool_result' | 'system' | 'error' | 'user';
  timestamp: number;
  content?: string;
  toolName?: string;
  toolInput?: unknown;
  toolOutput?: string;
  isError?: boolean;
}

/**
 * Local storage key for workspace layouts
 */
export const WORKSPACE_STORAGE_KEY = 'elemental-workspace-layouts';
export const ACTIVE_LAYOUT_KEY = 'elemental-active-workspace-layout';

/**
 * Default layout configuration
 */
export const DEFAULT_LAYOUT: WorkspaceLayout = {
  id: 'default',
  name: 'Default',
  preset: 'single',
  panes: [],
  createdAt: Date.now(),
  modifiedAt: Date.now(),
};

/**
 * usePaneManager - Hook for managing workspace pane state
 *
 * Handles pane creation, removal, layout management, and persistence.
 */

import { useState, useCallback, useEffect } from 'react';
import type { Agent } from '../../api/types';
import type {
  PaneId,
  PaneStatus,
  LayoutPreset,
  WorkspacePane,
  WorkspaceLayout,
  WorkspaceState,
  WorkspaceActions,
} from './types';
import {
  DEFAULT_LAYOUT,
  WORKSPACE_STORAGE_KEY,
  ACTIVE_LAYOUT_KEY,
} from './types';

/** Generate a unique pane ID */
function generatePaneId(): PaneId {
  return `pane-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Generate a unique layout ID */
function generateLayoutId(): string {
  return `layout-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Determine pane type based on agent role and mode */
function determinePaneType(agent: Agent): 'terminal' | 'stream' {
  const meta = agent.metadata?.agent;
  if (!meta) return 'stream';

  // Director and persistent workers get interactive terminal
  if (meta.agentRole === 'director') return 'terminal';
  if (meta.agentRole === 'worker') {
    const workerMeta = meta as { workerMode?: string };
    if (workerMeta.workerMode === 'persistent') return 'terminal';
  }

  // Ephemeral workers and stewards get stream viewer
  return 'stream';
}

/** Load saved layouts from localStorage */
function loadSavedLayouts(): WorkspaceLayout[] {
  try {
    const saved = localStorage.getItem(WORKSPACE_STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}

/** Save layouts to localStorage */
function saveLayouts(layouts: WorkspaceLayout[]): void {
  try {
    localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(layouts));
  } catch {
    // Ignore storage errors
  }
}

/** Load active layout from localStorage */
function loadActiveLayout(): WorkspaceLayout {
  try {
    const saved = localStorage.getItem(ACTIVE_LAYOUT_KEY);
    if (saved) {
      const layout = JSON.parse(saved);
      // Validate the layout has required fields
      if (layout.id && layout.panes && Array.isArray(layout.panes)) {
        return layout;
      }
    }
  } catch {
    // Ignore parse errors
  }
  return { ...DEFAULT_LAYOUT };
}

/** Save active layout to localStorage */
function saveActiveLayout(layout: WorkspaceLayout): void {
  try {
    localStorage.setItem(ACTIVE_LAYOUT_KEY, JSON.stringify(layout));
  } catch {
    // Ignore storage errors
  }
}

export interface UsePaneManagerResult extends WorkspaceState, WorkspaceActions {
  /** Get all saved layout presets */
  savedLayouts: WorkspaceLayout[];
  /** Delete a saved layout */
  deleteLayout: (layoutId: string) => void;
  /** Check if there are any panes */
  hasPanes: boolean;
  /** Get number of panes */
  paneCount: number;
}

/**
 * Hook for managing workspace panes
 */
export function usePaneManager(): UsePaneManagerResult {
  const [layout, setLayout] = useState<WorkspaceLayout>(() => loadActiveLayout());
  const [activePane, setActivePane] = useState<PaneId | null>(null);
  const [isResizing] = useState(false); // TODO: implement resize drag handles
  const [savedLayouts, setSavedLayouts] = useState<WorkspaceLayout[]>(() => loadSavedLayouts());

  // Persist active layout on changes
  useEffect(() => {
    saveActiveLayout(layout);
  }, [layout]);

  // Add a new pane
  const addPane = useCallback((agent: Agent) => {
    const newPane: WorkspacePane = {
      id: generatePaneId(),
      agentId: agent.id,
      agentName: agent.name,
      agentRole: agent.metadata?.agent?.agentRole ?? 'worker',
      workerMode: agent.metadata?.agent?.agentRole === 'worker'
        ? (agent.metadata?.agent as { workerMode?: 'ephemeral' | 'persistent' })?.workerMode
        : undefined,
      paneType: determinePaneType(agent),
      status: 'disconnected',
      position: 0,
      weight: 1,
    };

    setLayout(prev => {
      // Update positions for existing panes
      const updatedPanes = prev.panes.map((p, i) => ({ ...p, position: i }));
      newPane.position = updatedPanes.length;

      // Auto-switch to split view if adding second pane
      let newPreset = prev.preset;
      if (updatedPanes.length === 1 && prev.preset === 'single') {
        newPreset = 'split-vertical';
      } else if (updatedPanes.length === 3 && prev.preset === 'split-vertical') {
        newPreset = 'grid';
      }

      return {
        ...prev,
        preset: newPreset,
        panes: [...updatedPanes, newPane],
        modifiedAt: Date.now(),
      };
    });

    // Set as active pane
    setActivePane(newPane.id);
  }, []);

  // Remove a pane
  const removePane = useCallback((paneId: PaneId) => {
    setLayout(prev => {
      const filteredPanes = prev.panes.filter(p => p.id !== paneId);

      // Re-index positions
      const reindexedPanes = filteredPanes.map((p, i) => ({ ...p, position: i }));

      // Auto-switch layout if needed
      let newPreset = prev.preset;
      if (reindexedPanes.length <= 1) {
        newPreset = 'single';
      } else if (reindexedPanes.length === 2 && prev.preset === 'grid') {
        newPreset = 'split-vertical';
      }

      return {
        ...prev,
        preset: newPreset,
        panes: reindexedPanes,
        modifiedAt: Date.now(),
      };
    });

    // Clear active pane if it was removed
    setActivePane(prev => prev === paneId ? null : prev);
  }, []);

  // Update pane status
  const updatePaneStatus = useCallback((paneId: PaneId, status: PaneStatus) => {
    setLayout(prev => ({
      ...prev,
      panes: prev.panes.map(p => p.id === paneId ? { ...p, status } : p),
    }));
  }, []);

  // Change layout preset
  const setLayoutPreset = useCallback((preset: LayoutPreset) => {
    setLayout(prev => ({
      ...prev,
      preset,
      modifiedAt: Date.now(),
    }));
  }, []);

  // Reorder panes
  const reorderPanes = useCallback((fromIndex: number, toIndex: number) => {
    setLayout(prev => {
      const panes = [...prev.panes];
      const [moved] = panes.splice(fromIndex, 1);
      panes.splice(toIndex, 0, moved);

      // Re-index positions
      const reindexed = panes.map((p, i) => ({ ...p, position: i }));

      return {
        ...prev,
        panes: reindexed,
        modifiedAt: Date.now(),
      };
    });
  }, []);

  // Update pane weight
  const setPaneWeight = useCallback((paneId: PaneId, weight: number) => {
    setLayout(prev => ({
      ...prev,
      panes: prev.panes.map(p => p.id === paneId ? { ...p, weight: Math.max(0.5, Math.min(2, weight)) } : p),
    }));
  }, []);

  // Save current layout
  const saveLayout = useCallback((name: string) => {
    const newLayout: WorkspaceLayout = {
      ...layout,
      id: generateLayoutId(),
      name,
      createdAt: Date.now(),
      modifiedAt: Date.now(),
    };

    const updated = [...savedLayouts, newLayout];
    setSavedLayouts(updated);
    saveLayouts(updated);
  }, [layout, savedLayouts]);

  // Load a saved layout
  const loadLayout = useCallback((layoutToLoad: WorkspaceLayout) => {
    setLayout({
      ...layoutToLoad,
      modifiedAt: Date.now(),
    });
    setActivePane(layoutToLoad.panes[0]?.id ?? null);
  }, []);

  // Delete a saved layout
  const deleteLayout = useCallback((layoutId: string) => {
    const updated = savedLayouts.filter(l => l.id !== layoutId);
    setSavedLayouts(updated);
    saveLayouts(updated);
  }, [savedLayouts]);

  // Clear all panes
  const clearPanes = useCallback(() => {
    setLayout(prev => ({
      ...prev,
      preset: 'single',
      panes: [],
      modifiedAt: Date.now(),
    }));
    setActivePane(null);
  }, []);

  return {
    // State
    layout,
    activePane,
    isResizing,
    savedLayouts,

    // Computed
    hasPanes: layout.panes.length > 0,
    paneCount: layout.panes.length,

    // Actions
    addPane,
    removePane,
    setActivePane,
    updatePaneStatus,
    setLayoutPreset,
    reorderPanes,
    setPaneWeight,
    saveLayout,
    loadLayout,
    deleteLayout,
    clearPanes,
  };
}

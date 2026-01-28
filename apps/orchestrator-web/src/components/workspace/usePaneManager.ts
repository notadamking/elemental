/**
 * usePaneManager - Hook for managing workspace pane state
 *
 * Handles pane creation, removal, layout management, resizing, drag-drop, and persistence.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import type { Agent } from '../../api/types';
import type {
  PaneId,
  PaneStatus,
  LayoutPreset,
  WorkspacePane,
  WorkspaceLayout,
  WorkspaceState,
  WorkspaceActions,
  WorkspaceChannelMessage,
  GridConfig,
  DragState,
  ResizeState,
  ResizeDirection,
} from './types';
import {
  DEFAULT_LAYOUT,
  WORKSPACE_STORAGE_KEY,
  ACTIVE_LAYOUT_KEY,
  WORKSPACE_CHANNEL_NAME,
  DEFAULT_GRID_CONFIG,
  createGridConfigForPanes,
  calculateGridPosition,
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
        // Ensure gridConfig exists
        if (!layout.gridConfig) {
          layout.gridConfig = createGridConfigForPanes(layout.panes.length);
        }
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

/** Get grid config for a layout preset */
function getGridConfigForPreset(preset: LayoutPreset, paneCount: number): GridConfig {
  if (paneCount === 0) {
    return DEFAULT_GRID_CONFIG;
  }

  switch (preset) {
    case 'single':
      return { cols: 1, rows: paneCount, colSizes: [{ fr: 1 }], rowSizes: Array(paneCount).fill({ fr: 1 }) };

    case 'split-vertical':
      if (paneCount <= 2) {
        return { cols: paneCount, rows: 1, colSizes: Array(paneCount).fill({ fr: 1 }), rowSizes: [{ fr: 1 }] };
      }
      // For more than 2 panes, use 2 columns with multiple rows
      const rowsV = Math.ceil(paneCount / 2);
      return { cols: 2, rows: rowsV, colSizes: [{ fr: 1 }, { fr: 1 }], rowSizes: Array(rowsV).fill({ fr: 1 }) };

    case 'split-horizontal':
      if (paneCount <= 2) {
        return { cols: 1, rows: paneCount, colSizes: [{ fr: 1 }], rowSizes: Array(paneCount).fill({ fr: 1 }) };
      }
      // For more than 2 panes, use 2 rows with multiple columns
      const colsH = Math.ceil(paneCount / 2);
      return { cols: colsH, rows: 2, colSizes: Array(colsH).fill({ fr: 1 }), rowSizes: [{ fr: 1 }, { fr: 1 }] };

    case 'grid':
    case 'flex':
      return createGridConfigForPanes(paneCount);

    default:
      return createGridConfigForPanes(paneCount);
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
  /** Get the current grid config */
  gridConfig: GridConfig;
}

/**
 * Hook for managing workspace panes
 */
export function usePaneManager(): UsePaneManagerResult {
  const [layout, setLayout] = useState<WorkspaceLayout>(() => loadActiveLayout());
  const [activePane, setActivePane] = useState<PaneId | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [resizeState, setResizeState] = useState<ResizeState | null>(null);
  const [savedLayouts, setSavedLayouts] = useState<WorkspaceLayout[]>(() => loadSavedLayouts());

  // Refs for resize calculations
  const resizeStartSizesRef = useRef<[number, number]>([0, 0]);

  const isResizing = resizeState !== null;
  const isDragging = dragState !== null;

  // Ensure gridConfig is always defined
  const gridConfig = layout.gridConfig || createGridConfigForPanes(layout.panes.length);

  // Persist active layout on changes
  useEffect(() => {
    saveActiveLayout(layout);
  }, [layout]);

  // Listen for cross-window messages (pop back in)
  useEffect(() => {
    const channel = new BroadcastChannel(WORKSPACE_CHANNEL_NAME);

    const handleMessage = (event: MessageEvent<WorkspaceChannelMessage>) => {
      if (event.data.type === 'pop-back-in') {
        const { pane } = event.data;
        const newPane: WorkspacePane = {
          id: generatePaneId(),
          ...pane,
          status: 'disconnected',
          position: 0,
          weight: 1,
        };

        setLayout(prev => {
          const updatedPanes = [...prev.panes, { ...newPane, position: prev.panes.length }];
          const newGridConfig = getGridConfigForPreset(prev.preset, updatedPanes.length);

          // Assign grid positions to all panes
          const panesWithPositions = updatedPanes.map((p, i) => ({
            ...p,
            position: i,
            gridPosition: calculateGridPosition(i, updatedPanes.length),
          }));

          // Auto-switch to appropriate preset
          let newPreset = prev.preset;
          if (updatedPanes.length === 2 && prev.preset === 'single') {
            newPreset = 'split-vertical';
          } else if (updatedPanes.length > 2 && prev.preset !== 'grid' && prev.preset !== 'flex') {
            newPreset = 'grid';
          }

          return {
            ...prev,
            preset: newPreset,
            panes: panesWithPositions,
            gridConfig: newGridConfig,
            modifiedAt: Date.now(),
          };
        });

        setActivePane(newPane.id);
      }
    };

    channel.addEventListener('message', handleMessage);

    return () => {
      channel.removeEventListener('message', handleMessage);
      channel.close();
    };
  }, []);

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
      const updatedPanes = [...prev.panes, { ...newPane, position: prev.panes.length }];
      const newGridConfig = getGridConfigForPreset(prev.preset, updatedPanes.length);

      // Assign grid positions to all panes
      const panesWithPositions = updatedPanes.map((p, i) => ({
        ...p,
        position: i,
        gridPosition: calculateGridPosition(i, updatedPanes.length),
      }));

      // Auto-switch to appropriate preset
      let newPreset = prev.preset;
      if (updatedPanes.length === 2 && prev.preset === 'single') {
        newPreset = 'split-vertical';
      } else if (updatedPanes.length > 2 && prev.preset !== 'grid' && prev.preset !== 'flex') {
        newPreset = 'grid';
      }

      return {
        ...prev,
        preset: newPreset,
        panes: panesWithPositions,
        gridConfig: newGridConfig,
        modifiedAt: Date.now(),
      };
    });

    setActivePane(newPane.id);
  }, []);

  // Remove a pane
  const removePane = useCallback((paneId: PaneId) => {
    setLayout(prev => {
      const filteredPanes = prev.panes.filter(p => p.id !== paneId);

      // Re-index positions and recalculate grid positions
      const reindexedPanes = filteredPanes.map((p, i) => ({
        ...p,
        position: i,
        gridPosition: calculateGridPosition(i, filteredPanes.length),
      }));

      const newGridConfig = getGridConfigForPreset(prev.preset, reindexedPanes.length);

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
        gridConfig: newGridConfig,
        modifiedAt: Date.now(),
      };
    });

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
    setLayout(prev => {
      const newGridConfig = getGridConfigForPreset(preset, prev.panes.length);

      // Recalculate grid positions for the new layout
      const panesWithPositions = prev.panes.map((p, i) => ({
        ...p,
        gridPosition: calculateGridPosition(i, prev.panes.length),
      }));

      return {
        ...prev,
        preset,
        panes: panesWithPositions,
        gridConfig: newGridConfig,
        modifiedAt: Date.now(),
      };
    });
  }, []);

  // Reorder panes
  const reorderPanes = useCallback((fromIndex: number, toIndex: number) => {
    setLayout(prev => {
      const panes = [...prev.panes];
      const [moved] = panes.splice(fromIndex, 1);
      panes.splice(toIndex, 0, moved);

      // Re-index positions and recalculate grid positions
      const reindexed = panes.map((p, i) => ({
        ...p,
        position: i,
        gridPosition: calculateGridPosition(i, panes.length),
      }));

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

  // Start dragging a pane
  const startDrag = useCallback((paneId: PaneId) => {
    const pane = layout.panes.find(p => p.id === paneId);
    if (!pane) return;

    setDragState({
      paneId,
      originalPosition: pane.position,
      targetPosition: null,
    });
  }, [layout.panes]);

  // Update drag target position
  const updateDragTarget = useCallback((targetPosition: number | null) => {
    setDragState(prev => prev ? { ...prev, targetPosition } : null);
  }, []);

  // End drag and apply reorder
  const endDrag = useCallback(() => {
    if (dragState && dragState.targetPosition !== null && dragState.targetPosition !== dragState.originalPosition) {
      reorderPanes(dragState.originalPosition, dragState.targetPosition);
    }
    setDragState(null);
  }, [dragState, reorderPanes]);

  // Cancel drag without applying
  const cancelDrag = useCallback(() => {
    setDragState(null);
  }, []);

  // Start resize operation - no dependencies to keep callback stable
  const startResize = useCallback((direction: ResizeDirection, dividerIndex: number, startPos: number) => {
    try {
      let sizesValid = false;

      // Read current layout state directly to get latest gridConfig
      setLayout(currentLayout => {
        try {
          const config = currentLayout.gridConfig || createGridConfigForPanes(currentLayout.panes.length);
          const sizes = direction === 'horizontal' ? config.colSizes : config.rowSizes;

          if (!sizes || !Array.isArray(sizes) || sizes.length < 2) {
            console.error('[usePaneManager.startResize] invalid sizes:', sizes);
            return currentLayout;
          }

          if (dividerIndex < 0 || dividerIndex >= sizes.length - 1) {
            console.error('[usePaneManager.startResize] invalid dividerIndex:', dividerIndex, 'sizes.length:', sizes.length);
            return currentLayout;
          }

          const size1 = sizes[dividerIndex];
          const size2 = sizes[dividerIndex + 1];

          if (!size1 || typeof size1.fr !== 'number' || !size2 || typeof size2.fr !== 'number') {
            console.error('[usePaneManager.startResize] invalid size objects:', size1, size2);
            return currentLayout;
          }

          resizeStartSizesRef.current = [size1.fr, size2.fr];
          sizesValid = true;
        } catch (innerErr) {
          console.error('[usePaneManager.startResize] inner error:', innerErr);
        }

        // We're using setLayout just to read current state, not to modify it
        // The resize state is set separately
        return currentLayout;
      });

      // Set resize state after reading current layout
      if (sizesValid) {
        const startSizes = resizeStartSizesRef.current;
        if (startSizes && startSizes.length >= 2 && typeof startSizes[0] === 'number' && typeof startSizes[1] === 'number') {
          setResizeState({
            direction,
            dividerIndex,
            startPos,
            startSizes: [startSizes[0], startSizes[1]],
          });
        }
      }
    } catch (e) {
      console.error('[usePaneManager.startResize] error:', e);
    }
  }, []);

  // Resize a track (column or row)
  // deltaFr is the change in fr units (pre-calculated from pixels in WorkspaceGrid)
  // No dependencies to keep callback stable across re-renders
  const resizeTrack = useCallback((direction: ResizeDirection, index: number, deltaFr: number) => {
    try {
      setLayout(prev => {
        try {
          // Always read from prev state, create default if missing
          const config = prev.gridConfig || createGridConfigForPanes(prev.panes.length);
          if (!config) {
            console.error('[usePaneManager.resizeTrack] no gridConfig');
            return prev;
          }

          const sourceSizes = direction === 'horizontal' ? config.colSizes : config.rowSizes;
          if (!sourceSizes || !Array.isArray(sourceSizes) || sourceSizes.length < 2) {
            console.error('[usePaneManager.resizeTrack] invalid source sizes:', sourceSizes);
            return prev;
          }

          if (index < 0 || index >= sourceSizes.length - 1) {
            console.error('[usePaneManager.resizeTrack] invalid index:', index, 'sizes.length:', sourceSizes.length);
            return prev;
          }

          // Use the start sizes from when resizing began
          const startSizes = resizeStartSizesRef.current;
          if (!startSizes || !Array.isArray(startSizes) || startSizes.length < 2) {
            console.error('[usePaneManager.resizeTrack] invalid startSizes:', startSizes);
            return prev;
          }

          if (typeof startSizes[0] !== 'number' || typeof startSizes[1] !== 'number') {
            console.error('[usePaneManager.resizeTrack] startSizes are not numbers:', startSizes);
            return prev;
          }

          const combinedFr = startSizes[0] + startSizes[1];

          // Calculate new sizes, respecting minimum
          const minFr = 0.15;
          let newSize1 = startSizes[0] + deltaFr;
          let newSize2 = startSizes[1] - deltaFr;

          // Clamp to minimum
          if (newSize1 < minFr) {
            newSize1 = minFr;
            newSize2 = combinedFr - minFr;
          }
          if (newSize2 < minFr) {
            newSize2 = minFr;
            newSize1 = combinedFr - minFr;
          }

          // Clone the sizes array and update the values
          const sizes = sourceSizes.map((s, i) => {
            if (i === index) return { ...s, fr: newSize1 };
            if (i === index + 1) return { ...s, fr: newSize2 };
            return { ...s };
          });

          const newGridConfig = direction === 'horizontal'
            ? { ...config, colSizes: sizes }
            : { ...config, rowSizes: sizes };

          return {
            ...prev,
            gridConfig: newGridConfig,
            modifiedAt: Date.now(),
          };
        } catch (innerErr) {
          console.error('[usePaneManager.resizeTrack] inner error:', innerErr);
          return prev;
        }
      });
    } catch (err) {
      console.error('[usePaneManager.resizeTrack] outer error:', err);
    }
  }, []);

  // End resize operation
  const endResize = useCallback(() => {
    setResizeState(null);
  }, []);

  // Update grid configuration
  const setGridConfig = useCallback((config: GridConfig) => {
    setLayout(prev => ({
      ...prev,
      gridConfig: config,
      modifiedAt: Date.now(),
    }));
  }, []);

  // Move a pane to a new position
  const movePaneToPosition = useCallback((paneId: PaneId, newPosition: number) => {
    setLayout(prev => {
      const paneIndex = prev.panes.findIndex(p => p.id === paneId);
      if (paneIndex === -1) return prev;

      const panes = [...prev.panes];
      const [moved] = panes.splice(paneIndex, 1);

      // Insert at new position
      const insertIndex = Math.min(newPosition, panes.length);
      panes.splice(insertIndex, 0, moved);

      // Re-index positions and recalculate grid positions
      const reindexed = panes.map((p, i) => ({
        ...p,
        position: i,
        gridPosition: calculateGridPosition(i, panes.length),
      }));

      return {
        ...prev,
        panes: reindexed,
        modifiedAt: Date.now(),
      };
    });
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
      gridConfig: DEFAULT_GRID_CONFIG,
      modifiedAt: Date.now(),
    }));
    setActivePane(null);
  }, []);

  return {
    // State
    layout,
    activePane,
    isResizing,
    isDragging,
    dragState,
    resizeState,
    savedLayouts,
    gridConfig,

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
    startDrag,
    updateDragTarget,
    endDrag,
    cancelDrag,
    startResize,
    resizeTrack,
    endResize,
    setGridConfig,
    movePaneToPosition,
  };
}

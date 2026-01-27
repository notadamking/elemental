/**
 * WorkspaceGrid - Layout container for workspace panes
 *
 * Manages the grid layout for multiple terminal panes with support for
 * different presets (single, split, grid) and resizing.
 */

import { useState, useCallback } from 'react';
import type { WorkspacePane, LayoutPreset, PaneId, PaneStatus } from './types';
import { WorkspacePane as WorkspacePaneComponent } from './WorkspacePane';

export interface WorkspaceGridProps {
  panes: WorkspacePane[];
  preset: LayoutPreset;
  activePane: PaneId | null;
  onPaneClose: (paneId: PaneId) => void;
  onPaneActivate: (paneId: PaneId) => void;
  onPaneStatusChange: (paneId: PaneId, status: PaneStatus) => void;
}

/**
 * Get CSS grid template based on layout preset and pane count
 */
function getGridStyles(preset: LayoutPreset, paneCount: number): React.CSSProperties {
  if (paneCount === 0) return {};
  if (paneCount === 1) {
    return {
      gridTemplateColumns: '1fr',
      gridTemplateRows: '1fr',
    };
  }

  switch (preset) {
    case 'single':
      return {
        gridTemplateColumns: '1fr',
        gridTemplateRows: '1fr',
      };

    case 'split-vertical':
      return {
        gridTemplateColumns: '1fr 1fr',
        gridTemplateRows: '1fr',
      };

    case 'split-horizontal':
      return {
        gridTemplateColumns: '1fr',
        gridTemplateRows: paneCount === 2 ? '1fr 1fr' : `repeat(${paneCount}, 1fr)`,
      };

    case 'grid': {
      // Calculate grid dimensions for 3+ panes
      if (paneCount === 2) {
        return {
          gridTemplateColumns: '1fr 1fr',
          gridTemplateRows: '1fr',
        };
      }
      if (paneCount === 3) {
        return {
          gridTemplateColumns: '1fr 1fr',
          gridTemplateRows: '1fr 1fr',
        };
      }
      if (paneCount === 4) {
        return {
          gridTemplateColumns: '1fr 1fr',
          gridTemplateRows: '1fr 1fr',
        };
      }
      // For 5+ panes, use 3 columns
      const rows = Math.ceil(paneCount / 3);
      return {
        gridTemplateColumns: 'repeat(3, 1fr)',
        gridTemplateRows: `repeat(${rows}, 1fr)`,
      };
    }

    default:
      return {
        gridTemplateColumns: '1fr',
        gridTemplateRows: '1fr',
      };
  }
}

/**
 * Get the grid area for a specific pane based on layout
 */
function getPaneGridArea(
  index: number,
  paneCount: number,
  preset: LayoutPreset
): React.CSSProperties | undefined {
  // Special case: 3 panes in grid layout - first pane spans full height
  if (preset === 'grid' && paneCount === 3 && index === 0) {
    return { gridRow: '1 / 3' };
  }
  return undefined;
}

export function WorkspaceGrid({
  panes,
  preset,
  activePane,
  onPaneClose,
  onPaneActivate,
  onPaneStatusChange,
}: WorkspaceGridProps) {
  const [maximizedPane, setMaximizedPane] = useState<PaneId | null>(null);

  const handleMaximize = useCallback((paneId: PaneId) => {
    setMaximizedPane(paneId);
  }, []);

  const handleMinimize = useCallback(() => {
    setMaximizedPane(null);
  }, []);

  // If a pane is maximized, only show that pane
  const visiblePanes = maximizedPane
    ? panes.filter(p => p.id === maximizedPane)
    : panes;

  const effectivePreset = maximizedPane ? 'single' : preset;
  const gridStyles = getGridStyles(effectivePreset, visiblePanes.length);

  if (panes.length === 0) {
    return null;
  }

  return (
    <div
      className="
        grid gap-3 h-full w-full
        transition-all duration-200
      "
      style={gridStyles}
      data-testid="workspace-grid"
      data-preset={effectivePreset}
      data-pane-count={visiblePanes.length}
    >
      {visiblePanes.map((pane, index) => (
        <div
          key={pane.id}
          className="min-h-0 min-w-0"
          style={getPaneGridArea(index, visiblePanes.length, effectivePreset)}
        >
          <WorkspacePaneComponent
            pane={pane}
            isActive={pane.id === activePane}
            isMaximized={maximizedPane === pane.id}
            onClose={() => onPaneClose(pane.id)}
            onMaximize={() => handleMaximize(pane.id)}
            onMinimize={handleMinimize}
            onFocus={() => onPaneActivate(pane.id)}
            onStatusChange={(status) => onPaneStatusChange(pane.id, status)}
          />
        </div>
      ))}
    </div>
  );
}

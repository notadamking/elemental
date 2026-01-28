/**
 * WorkspaceGrid - Layout container for workspace panes
 *
 * Uses react-resizable-panels for smooth split-pane resizing with support
 * for multiple layouts (single, split, grid) and drag-drop reordering.
 */

import { useState, useCallback, useMemo } from 'react';
import { Group, Panel, Separator } from 'react-resizable-panels';
import type {
  WorkspacePane,
  LayoutPreset,
  PaneId,
  PaneStatus,
  DragState,
} from './types';
import { WorkspacePane as WorkspacePaneComponent } from './WorkspacePane';

export interface WorkspaceGridProps {
  panes: WorkspacePane[];
  preset: LayoutPreset;
  activePane: PaneId | null;
  dragState: DragState | null;
  onPaneClose: (paneId: PaneId) => void;
  onPaneActivate: (paneId: PaneId) => void;
  onPaneStatusChange: (paneId: PaneId, status: PaneStatus) => void;
  onStartDrag: (paneId: PaneId) => void;
  onUpdateDragTarget: (targetPosition: number | null) => void;
  onEndDrag: () => void;
}

/**
 * Custom resize handle with visual feedback
 */
function CustomResizeHandle({ orientation }: { orientation: 'horizontal' | 'vertical' }) {
  const isHorizontal = orientation === 'horizontal';

  return (
    <Separator
      className={`
        group
        flex items-center justify-center
        ${isHorizontal ? 'w-2 cursor-col-resize' : 'h-2 cursor-row-resize'}
        hover:bg-[var(--color-primary-muted)]
        transition-colors duration-150
      `}
    >
      {/* Visual indicator line */}
      <div
        className={`
          ${isHorizontal ? 'w-0.5 h-8' : 'h-0.5 w-8'}
          bg-[var(--color-border)]
          group-hover:bg-[var(--color-primary)]
          group-data-[resize-handle-active]:bg-[var(--color-primary)]
          transition-colors duration-150
          rounded-full
        `}
      />
    </Separator>
  );
}

/**
 * Render a single pane with its wrapper
 */
function PaneWrapper({
  pane,
  isActive,
  isMaximized,
  isDragging,
  isDropTarget,
  onClose,
  onMaximize,
  onMinimize,
  onFocus,
  onStatusChange,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: {
  pane: WorkspacePane;
  isActive: boolean;
  isMaximized: boolean;
  isDragging: boolean;
  isDropTarget: boolean;
  onClose: () => void;
  onMaximize: () => void;
  onMinimize: () => void;
  onFocus: () => void;
  onStatusChange: (status: PaneStatus) => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}) {
  return (
    <div
      className={`
        h-full w-full min-h-0 min-w-0 relative
        ${isDragging ? 'opacity-50 scale-95' : ''}
        ${isDropTarget ? 'ring-2 ring-[var(--color-primary)] ring-offset-2' : ''}
        transition-all duration-150
      `}
      draggable={!isMaximized}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    >
      <WorkspacePaneComponent
        pane={pane}
        isActive={isActive}
        isMaximized={isMaximized}
        onClose={onClose}
        onMaximize={onMaximize}
        onMinimize={onMinimize}
        onFocus={onFocus}
        onStatusChange={onStatusChange}
      />
    </div>
  );
}

/**
 * Get layout configuration based on preset and pane count
 */
function getLayoutConfig(preset: LayoutPreset, paneCount: number): {
  orientation: 'horizontal' | 'vertical';
  rows: number[][];
} {
  if (paneCount === 0) {
    return { orientation: 'horizontal', rows: [] };
  }

  if (paneCount === 1) {
    return { orientation: 'horizontal', rows: [[0]] };
  }

  switch (preset) {
    case 'single':
      // Stack vertically
      return {
        orientation: 'vertical',
        rows: Array.from({ length: paneCount }, (_, i) => [i]),
      };

    case 'split-vertical':
      // Side by side
      if (paneCount <= 2) {
        return {
          orientation: 'horizontal',
          rows: [Array.from({ length: paneCount }, (_, i) => i)],
        };
      }
      // For 3+, use 2 columns with rows
      const colsV = 2;
      const rowsV: number[][] = [];
      for (let i = 0; i < paneCount; i += colsV) {
        rowsV.push(Array.from({ length: Math.min(colsV, paneCount - i) }, (_, j) => i + j));
      }
      return { orientation: 'vertical', rows: rowsV };

    case 'split-horizontal':
      // Stack vertically
      if (paneCount <= 2) {
        return {
          orientation: 'vertical',
          rows: Array.from({ length: paneCount }, (_, i) => [i]),
        };
      }
      // For 3+, use 2 rows with columns
      const colsH = Math.ceil(paneCount / 2);
      const rowsH: number[][] = [[], []];
      for (let i = 0; i < paneCount; i++) {
        rowsH[Math.floor(i / colsH)].push(i);
      }
      return { orientation: 'vertical', rows: rowsH.filter(r => r.length > 0) };

    case 'grid':
    case 'flex':
    default:
      // Smart grid layout
      if (paneCount === 2) {
        return { orientation: 'horizontal', rows: [[0, 1]] };
      }
      if (paneCount === 3) {
        // 2 columns: first pane on left, 2 panes stacked on right
        return { orientation: 'horizontal', rows: [[0], [1, 2]] };
      }
      if (paneCount === 4) {
        // 2x2 grid
        return { orientation: 'vertical', rows: [[0, 1], [2, 3]] };
      }
      // For 5+, use 3 columns
      const cols = 3;
      const gridRows: number[][] = [];
      for (let i = 0; i < paneCount; i += cols) {
        gridRows.push(Array.from({ length: Math.min(cols, paneCount - i) }, (_, j) => i + j));
      }
      return { orientation: 'vertical', rows: gridRows };
  }
}

export function WorkspaceGrid({
  panes,
  preset,
  activePane,
  dragState,
  onPaneClose,
  onPaneActivate,
  onPaneStatusChange,
  onStartDrag,
  onUpdateDragTarget,
  onEndDrag,
}: WorkspaceGridProps) {
  const [maximizedPane, setMaximizedPane] = useState<PaneId | null>(null);

  const handleMaximize = useCallback((paneId: PaneId) => {
    setMaximizedPane(paneId);
  }, []);

  const handleMinimize = useCallback(() => {
    setMaximizedPane(null);
  }, []);

  // Drag and drop handlers
  const handleDragStart = useCallback((e: React.DragEvent, paneId: PaneId) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', paneId);
    onStartDrag(paneId);
  }, [onStartDrag]);

  const handleDragOver = useCallback((e: React.DragEvent, targetPosition: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    onUpdateDragTarget(targetPosition);
  }, [onUpdateDragTarget]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    onEndDrag();
  }, [onEndDrag]);

  const handleDragEnd = useCallback(() => {
    onEndDrag();
  }, [onEndDrag]);

  // If a pane is maximized, only show that pane
  const visiblePanes = maximizedPane
    ? panes.filter(p => p.id === maximizedPane)
    : panes;

  const isMaximized = maximizedPane !== null;

  // Get layout configuration
  const layoutConfig = useMemo(
    () => getLayoutConfig(isMaximized ? 'single' : preset, visiblePanes.length),
    [preset, visiblePanes.length, isMaximized]
  );

  if (panes.length === 0) {
    return null;
  }

  // Helper to render a pane by index
  const renderPane = (index: number) => {
    const pane = visiblePanes[index];
    if (!pane) return null;

    const isDragging = dragState?.paneId === pane.id;
    const isDropTarget = dragState !== null && dragState.targetPosition === index && !isDragging;

    return (
      <PaneWrapper
        key={pane.id}
        pane={pane}
        isActive={pane.id === activePane}
        isMaximized={maximizedPane === pane.id}
        isDragging={isDragging}
        isDropTarget={isDropTarget}
        onClose={() => onPaneClose(pane.id)}
        onMaximize={() => handleMaximize(pane.id)}
        onMinimize={handleMinimize}
        onFocus={() => onPaneActivate(pane.id)}
        onStatusChange={(status) => onPaneStatusChange(pane.id, status)}
        onDragStart={(e) => handleDragStart(e, pane.id)}
        onDragOver={(e) => handleDragOver(e, index)}
        onDrop={handleDrop}
        onDragEnd={handleDragEnd}
      />
    );
  };

  // Special case: single pane
  if (visiblePanes.length === 1) {
    return (
      <div
        className="h-full w-full"
        data-testid="workspace-grid"
        data-preset={preset}
        data-pane-count={visiblePanes.length}
      >
        {renderPane(0)}
      </div>
    );
  }

  // Special case for 3-pane grid layout (first pane full height on left)
  if (!isMaximized && preset === 'grid' && visiblePanes.length === 3) {
    return (
      <div
        className="h-full w-full"
        data-testid="workspace-grid"
        data-preset={preset}
        data-pane-count={visiblePanes.length}
      >
        <Group orientation="horizontal" id="workspace-grid-3pane">
          <Panel id="pane-0" defaultSize={50} minSize={15}>
            {renderPane(0)}
          </Panel>
          <CustomResizeHandle orientation="horizontal" />
          <Panel id="pane-right" defaultSize={50} minSize={15}>
            <Group orientation="vertical" id="workspace-grid-3pane-right">
              <Panel id="pane-1" defaultSize={50} minSize={15}>
                {renderPane(1)}
              </Panel>
              <CustomResizeHandle orientation="vertical" />
              <Panel id="pane-2" defaultSize={50} minSize={15}>
                {renderPane(2)}
              </Panel>
            </Group>
          </Panel>
        </Group>
      </div>
    );
  }

  // For vertical stacking (single row with multiple columns or multiple rows)
  if (layoutConfig.orientation === 'vertical') {
    // Multiple rows, each potentially with multiple columns
    return (
      <div
        className="h-full w-full"
        data-testid="workspace-grid"
        data-preset={preset}
        data-pane-count={visiblePanes.length}
      >
        <Group orientation="vertical" id={`workspace-grid-${preset}`}>
          {layoutConfig.rows.map((rowIndices, rowIndex) => (
            <>
              {rowIndex > 0 && <CustomResizeHandle key={`sep-${rowIndex}`} orientation="vertical" />}
              <Panel key={`row-${rowIndex}`} id={`row-${rowIndex}`} defaultSize={100 / layoutConfig.rows.length} minSize={10}>
                {rowIndices.length === 1 ? (
                  renderPane(rowIndices[0])
                ) : (
                  <Group orientation="horizontal" id={`workspace-row-${rowIndex}`}>
                    {rowIndices.map((paneIndex, colIndex) => (
                      <>
                        {colIndex > 0 && <CustomResizeHandle key={`sep-col-${colIndex}`} orientation="horizontal" />}
                        <Panel key={`col-${colIndex}`} id={`col-${rowIndex}-${colIndex}`} defaultSize={100 / rowIndices.length} minSize={15}>
                          {renderPane(paneIndex)}
                        </Panel>
                      </>
                    ))}
                  </Group>
                )}
              </Panel>
            </>
          ))}
        </Group>
      </div>
    );
  }

  // For horizontal layout (single column with multiple rows per column)
  return (
    <div
      className="h-full w-full"
      data-testid="workspace-grid"
      data-preset={preset}
      data-pane-count={visiblePanes.length}
    >
      <Group orientation="horizontal" id={`workspace-grid-${preset}`}>
        {layoutConfig.rows.map((columnIndices, colIndex) => (
          <>
            {colIndex > 0 && <CustomResizeHandle key={`sep-${colIndex}`} orientation="horizontal" />}
            <Panel key={`col-${colIndex}`} id={`col-${colIndex}`} defaultSize={100 / layoutConfig.rows.length} minSize={15}>
              {columnIndices.length === 1 ? (
                renderPane(columnIndices[0])
              ) : (
                <Group orientation="vertical" id={`workspace-col-${colIndex}`}>
                  {columnIndices.map((paneIndex, rowIndex) => (
                    <>
                      {rowIndex > 0 && <CustomResizeHandle key={`sep-row-${rowIndex}`} orientation="vertical" />}
                      <Panel key={`row-${rowIndex}`} id={`row-${colIndex}-${rowIndex}`} defaultSize={100 / columnIndices.length} minSize={15}>
                        {renderPane(paneIndex)}
                      </Panel>
                    </>
                  ))}
                </Group>
              )}
            </Panel>
          </>
        ))}
      </Group>
    </div>
  );
}

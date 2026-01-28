/**
 * WorkspaceGrid - Layout container for workspace panes
 *
 * Manages the grid layout for multiple terminal panes with support for
 * different presets (single, split, grid), resizing via drag handles,
 * and drag-drop reordering.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import type {
  WorkspacePane,
  LayoutPreset,
  PaneId,
  PaneStatus,
  GridConfig,
  DragState,
  ResizeState,
  ResizeDirection,
  GridPosition,
} from './types';
import { RESIZE_HANDLE_SIZE_PX, calculateGridPosition } from './types';
import { WorkspacePane as WorkspacePaneComponent } from './WorkspacePane';
import { ResizeHandle } from './ResizeHandle';

export interface WorkspaceGridProps {
  panes: WorkspacePane[];
  preset: LayoutPreset;
  gridConfig: GridConfig;
  activePane: PaneId | null;
  dragState: DragState | null;
  resizeState: ResizeState | null;
  onPaneClose: (paneId: PaneId) => void;
  onPaneActivate: (paneId: PaneId) => void;
  onPaneStatusChange: (paneId: PaneId, status: PaneStatus) => void;
  onStartDrag: (paneId: PaneId) => void;
  onUpdateDragTarget: (targetPosition: number | null) => void;
  onEndDrag: () => void;
  onStartResize: (direction: ResizeDirection, dividerIndex: number, startPos: number) => void;
  /** Called during resize with deltaFr (change in fr units, not pixels) */
  onResize: (direction: ResizeDirection, index: number, deltaFr: number) => void;
  onEndResize: () => void;
}

/**
 * Build CSS grid-template value from track sizes
 */
function buildGridTemplate(sizes: { fr: number }[]): string {
  return sizes.map(s => `${s.fr}fr`).join(' ');
}

/**
 * Get the grid area CSS for a pane based on its position
 */
function getPaneGridArea(
  index: number,
  paneCount: number
): React.CSSProperties {
  const pos = calculateGridPosition(index, paneCount);

  return {
    gridColumn: `${pos.col + 1} / span ${pos.colSpan}`,
    gridRow: `${pos.row + 1} / span ${pos.rowSpan}`,
  };
}

/**
 * Calculate the grid positions for all panes
 */
function getAllPanePositions(paneCount: number): GridPosition[] {
  return Array.from({ length: paneCount }, (_, i) => calculateGridPosition(i, paneCount));
}

/**
 * Calculate which columns a vertical divider (between rows) should span
 * based on which panes are affected by that row boundary
 */
function getVerticalDividerSpan(
  rowIndex: number,
  panePositions: GridPosition[],
  gridConfig: GridConfig
): { startCol: number; endCol: number } | null {
  // Find panes that are affected by this row boundary
  // A pane is affected if it doesn't span across this row boundary
  // (i.e., it ends at rowIndex or starts at rowIndex + 1)

  let minCol = gridConfig.cols;
  let maxCol = 0;

  for (const pos of panePositions) {
    const paneStartRow = pos.row;
    const paneEndRow = pos.row + pos.rowSpan - 1;

    // Check if this pane is NOT spanning across the row boundary
    // (boundary is between rowIndex and rowIndex + 1)
    if (paneEndRow === rowIndex || paneStartRow === rowIndex + 1) {
      // This pane is affected - the divider should span its columns
      minCol = Math.min(minCol, pos.col);
      maxCol = Math.max(maxCol, pos.col + pos.colSpan - 1);
    }
  }

  if (maxCol < minCol) {
    return null; // No divider needed
  }

  return { startCol: minCol, endCol: maxCol };
}

/**
 * Calculate which rows a horizontal divider (between columns) should span
 */
function getHorizontalDividerSpan(
  colIndex: number,
  panePositions: GridPosition[],
  gridConfig: GridConfig
): { startRow: number; endRow: number } | null {
  let minRow = gridConfig.rows;
  let maxRow = 0;

  for (const pos of panePositions) {
    const paneStartCol = pos.col;
    const paneEndCol = pos.col + pos.colSpan - 1;

    // Check if this pane is NOT spanning across the column boundary
    if (paneEndCol === colIndex || paneStartCol === colIndex + 1) {
      minRow = Math.min(minRow, pos.row);
      maxRow = Math.max(maxRow, pos.row + pos.rowSpan - 1);
    }
  }

  if (maxRow < minRow) {
    return null;
  }

  return { startRow: minRow, endRow: maxRow };
}

/**
 * Divider info including position and span
 */
interface DividerInfo {
  position: number; // pixel position
  startPx: number;  // start position in pixels
  endPx: number;    // end position in pixels
  index: number;    // track index
}

/**
 * Calculate divider positions and spans for resize handles
 */
function getDividers(
  gridConfig: GridConfig,
  paneCount: number,
  containerRect: DOMRect | null,
  gap: number
): { horizontal: DividerInfo[]; vertical: DividerInfo[] } {
  if (!containerRect || paneCount === 0) {
    return { horizontal: [], vertical: [] };
  }

  const panePositions = getAllPanePositions(paneCount);
  const horizontal: DividerInfo[] = [];
  const vertical: DividerInfo[] = [];

  // Account for gaps in calculations
  const totalHGaps = (gridConfig.cols - 1) * gap;
  const totalVGaps = (gridConfig.rows - 1) * gap;
  const availableWidth = containerRect.width - totalHGaps;
  const availableHeight = containerRect.height - totalVGaps;

  // Calculate total fr units
  const totalColFr = gridConfig.colSizes.reduce((sum, s) => sum + s.fr, 0);
  const totalRowFr = gridConfig.rowSizes.reduce((sum, s) => sum + s.fr, 0);

  // Calculate column positions
  const colStartPositions: number[] = [0];
  let colOffset = 0;
  for (let i = 0; i < gridConfig.cols; i++) {
    const colWidth = (gridConfig.colSizes[i].fr / totalColFr) * availableWidth;
    if (i > 0) {
      colStartPositions.push(colOffset);
    }
    colOffset += colWidth + (i < gridConfig.cols - 1 ? gap : 0);
  }
  colStartPositions.push(containerRect.width); // end position

  // Calculate row positions
  const rowStartPositions: number[] = [0];
  let rowOffset = 0;
  for (let i = 0; i < gridConfig.rows; i++) {
    const rowHeight = (gridConfig.rowSizes[i].fr / totalRowFr) * availableHeight;
    if (i > 0) {
      rowStartPositions.push(rowOffset);
    }
    rowOffset += rowHeight + (i < gridConfig.rows - 1 ? gap : 0);
  }
  rowStartPositions.push(containerRect.height); // end position

  // Calculate horizontal dividers (between columns)
  let hDividerPos = 0;
  for (let i = 0; i < gridConfig.cols - 1; i++) {
    const colWidth = (gridConfig.colSizes[i].fr / totalColFr) * availableWidth;
    hDividerPos += colWidth + gap / 2;

    const span = getHorizontalDividerSpan(i, panePositions, gridConfig);
    if (span) {
      horizontal.push({
        position: hDividerPos,
        startPx: rowStartPositions[span.startRow],
        endPx: rowStartPositions[span.endRow + 1],
        index: i,
      });
    }
    hDividerPos += gap / 2;
  }

  // Calculate vertical dividers (between rows)
  let vDividerPos = 0;
  for (let i = 0; i < gridConfig.rows - 1; i++) {
    const rowHeight = (gridConfig.rowSizes[i].fr / totalRowFr) * availableHeight;
    vDividerPos += rowHeight + gap / 2;

    const span = getVerticalDividerSpan(i, panePositions, gridConfig);
    if (span) {
      vertical.push({
        position: vDividerPos,
        startPx: colStartPositions[span.startCol],
        endPx: colStartPositions[span.endCol + 1],
        index: i,
      });
    }
    vDividerPos += gap / 2;
  }

  return { horizontal, vertical };
}

export function WorkspaceGrid({
  panes,
  preset,
  gridConfig,
  activePane,
  dragState,
  resizeState,
  onPaneClose,
  onPaneActivate,
  onPaneStatusChange,
  onStartDrag,
  onUpdateDragTarget,
  onEndDrag,
  onStartResize,
  onResize,
  onEndResize,
}: WorkspaceGridProps) {
  const [maximizedPane, setMaximizedPane] = useState<PaneId | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [containerRect, setContainerRect] = useState<DOMRect | null>(null);

  // Track active resize direction/index in ref for immediate access
  const activeResizeRef = useRef<{ direction: ResizeDirection; index: number } | null>(null);
  // Store the pixel-to-fr conversion factor at resize start (to avoid stale closure issues)
  const pixelToFrRatioRef = useRef<number>(0);
  // Store the starting sizes for direct DOM manipulation during resize
  const startSizesRef = useRef<{ fr: number }[]>([]);
  // Track the current deltaFr during resize (to commit on end)
  const currentDeltaFrRef = useRef<number>(0);
  // Track if we're currently resizing (for disabling transitions)
  const [isResizing, setIsResizing] = useState(false);

  // Track container size for divider positioning
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateRect = () => {
      setContainerRect(container.getBoundingClientRect());
    };

    updateRect();

    const observer = new ResizeObserver(updateRect);
    observer.observe(container);

    return () => observer.disconnect();
  }, []);

  const handleMaximize = useCallback((paneId: PaneId) => {
    setMaximizedPane(paneId);
  }, []);

  const handleMinimize = useCallback(() => {
    setMaximizedPane(null);
  }, []);

  // Store gridConfig in a ref so handleResizeStart doesn't need it as a dependency
  const gridConfigRef = useRef(gridConfig);
  gridConfigRef.current = gridConfig;

  // Handle resize start - store direction/index and sizes for direct DOM manipulation
  const handleResizeStart = useCallback((direction: ResizeDirection, index: number, startPos: number) => {
    try {
      // Read from ref to get latest gridConfig without dependency
      const config = gridConfigRef.current;
      if (!config) {
        console.error('[WorkspaceGrid.handleResizeStart] gridConfig is null');
        return;
      }

      const sizes = direction === 'horizontal' ? config.colSizes : config.rowSizes;
      if (!sizes || sizes.length < 2) {
        console.error('[WorkspaceGrid.handleResizeStart] invalid sizes:', sizes);
        return;
      }

      if (index < 0 || index >= sizes.length - 1) {
        console.error('[WorkspaceGrid.handleResizeStart] invalid index:', index, 'sizes.length:', sizes.length);
        return;
      }

      // Set refs BEFORE calling onStartResize to ensure they're ready for any callbacks
      activeResizeRef.current = { direction, index };
      startSizesRef.current = sizes.map(s => ({ fr: s.fr }));
      currentDeltaFrRef.current = 0;

      // Calculate and store the pixel-to-fr conversion ratio
      if (containerRect) {
        const totalFr = sizes.reduce((sum, s) => sum + s.fr, 0);
        const gap = RESIZE_HANDLE_SIZE_PX + 6;
        const numGaps = sizes.length - 1;
        const totalGapSpace = numGaps * gap;
        const availableSpace = direction === 'horizontal'
          ? containerRect.width - totalGapSpace
          : containerRect.height - totalGapSpace;
        pixelToFrRatioRef.current = totalFr / availableSpace;
      } else {
        console.warn('[WorkspaceGrid.handleResizeStart] no containerRect');
        pixelToFrRatioRef.current = 0;
      }

      setIsResizing(true);
      onStartResize(direction, index, startPos);
    } catch (e) {
      console.error('[WorkspaceGrid.handleResizeStart] error:', e);
      // Clean up on error
      activeResizeRef.current = null;
      startSizesRef.current = [];
      currentDeltaFrRef.current = 0;
      pixelToFrRatioRef.current = 0;
    }
  }, [onStartResize, containerRect]);

  // Handle resize - directly manipulate DOM for instant feedback (no React state updates)
  const handleResize = useCallback((pixelDelta: number) => {
    try {
      const active = activeResizeRef.current;
      const pixelToFrRatio = pixelToFrRatioRef.current;
      const grid = gridRef.current;
      const sizes = startSizesRef.current;

      // Validate all required refs are present
      if (!active) {
        return; // Not resizing
      }
      if (pixelToFrRatio === 0) {
        return; // No ratio calculated
      }
      if (!grid) {
        return; // No grid element
      }
      if (!sizes || !Array.isArray(sizes) || sizes.length < 2) {
        return; // Invalid sizes
      }
      if (active.index < 0 || active.index + 1 >= sizes.length) {
        return; // Invalid index
      }

      // Validate the size objects have the fr property
      const size1 = sizes[active.index];
      const size2 = sizes[active.index + 1];
      if (!size1 || typeof size1.fr !== 'number' || !size2 || typeof size2.fr !== 'number') {
        console.error('[WorkspaceGrid.handleResize] invalid size objects:', size1, size2);
        return;
      }

      // Calculate new sizes
      const deltaFr = pixelDelta * pixelToFrRatio;
      const minFr = 0.15;

      const combinedFr = size1.fr + size2.fr;
      let newSize1 = size1.fr + deltaFr;
      let newSize2 = size2.fr - deltaFr;

      // Clamp to minimum
      if (newSize1 < minFr) {
        newSize1 = minFr;
        newSize2 = combinedFr - minFr;
      }
      if (newSize2 < minFr) {
        newSize2 = minFr;
        newSize1 = combinedFr - minFr;
      }

      // Track the effective deltaFr (accounting for clamping)
      currentDeltaFrRef.current = newSize1 - size1.fr;

      // Build new template and apply directly to DOM (instant, no React re-render)
      const newSizes = sizes.map((s, i) => {
        if (i === active.index) return { fr: newSize1 };
        if (i === active.index + 1) return { fr: newSize2 };
        return { fr: s.fr };
      });
      const template = newSizes.map(s => `${s.fr}fr`).join(' ');

      if (active.direction === 'horizontal') {
        grid.style.gridTemplateColumns = template;
      } else {
        grid.style.gridTemplateRows = template;
      }
    } catch (e) {
      console.error('[WorkspaceGrid.handleResize] error:', e);
    }
  }, []);

  // Handle resize end - commit final values to React state
  const handleResizeEnd = useCallback(() => {
    try {
      const active = activeResizeRef.current;
      const grid = gridRef.current;
      const finalDeltaFr = currentDeltaFrRef.current;

      if (active && grid && finalDeltaFr !== 0) {
        // Commit the tracked deltaFr to state
        onResize(active.direction, active.index, finalDeltaFr);
      }

      // Clear the inline styles so React takes over
      if (grid) {
        grid.style.gridTemplateColumns = '';
        grid.style.gridTemplateRows = '';
      }

      // Clean up state
      activeResizeRef.current = null;
      startSizesRef.current = [];
      currentDeltaFrRef.current = 0;
      setIsResizing(false);
      onEndResize();
    } catch (e) {
      console.error('[WorkspaceGrid.handleResizeEnd] error:', e);
      // Still try to clean up even on error
      try {
        activeResizeRef.current = null;
        startSizesRef.current = [];
        currentDeltaFrRef.current = 0;
        setIsResizing(false);
        onEndResize();
      } catch (cleanupError) {
        console.error('[WorkspaceGrid.handleResizeEnd] cleanup error:', cleanupError);
      }
    }
  }, [onResize, onEndResize]);

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

  // Use simple grid for maximized view
  const effectiveGridConfig = isMaximized
    ? { cols: 1, rows: 1, colSizes: [{ fr: 1 }], rowSizes: [{ fr: 1 }] }
    : gridConfig;

  const gap = RESIZE_HANDLE_SIZE_PX + 6;

  // Calculate divider positions and spans
  const dividers = getDividers(effectiveGridConfig, visiblePanes.length, containerRect, gap);

  if (panes.length === 0) {
    return null;
  }

  const gridStyles: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: buildGridTemplate(effectiveGridConfig.colSizes),
    gridTemplateRows: buildGridTemplate(effectiveGridConfig.rowSizes),
    gap: `${gap}px`,
  };

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full"
      data-testid="workspace-grid"
      data-preset={preset}
      data-pane-count={visiblePanes.length}
    >
      {/* Main grid */}
      <div
        ref={gridRef}
        className={`h-full w-full ${isResizing ? '' : 'transition-all duration-150'}`}
        style={gridStyles}
      >
        {visiblePanes.map((pane, index) => {
          const isDragging = dragState?.paneId === pane.id;
          const isDropTarget = dragState !== null && dragState.targetPosition === index && !isDragging;

          return (
            <div
              key={pane.id}
              className={`
                min-h-0 min-w-0 relative
                ${isDragging ? 'opacity-50 scale-95' : ''}
                ${isDropTarget ? 'ring-2 ring-[var(--color-primary)] ring-offset-2' : ''}
                transition-all duration-150
              `}
              style={isMaximized ? undefined : getPaneGridArea(index, visiblePanes.length)}
              draggable={!isMaximized}
              onDragStart={(e) => handleDragStart(e, pane.id)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDrop={handleDrop}
              onDragEnd={handleDragEnd}
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
          );
        })}
      </div>

      {/* Horizontal resize handles (between columns) */}
      {!isMaximized && dividers.horizontal.map((divider) => (
        <div
          key={`h-divider-${divider.index}`}
          className="absolute z-10"
          style={{
            left: `${divider.position}px`,
            top: `${divider.startPx}px`,
            height: `${divider.endPx - divider.startPx}px`,
          }}
        >
          <ResizeHandle
            direction="horizontal"
            index={divider.index}
            onResizeStart={handleResizeStart}
            onResize={handleResize}
            onResizeEnd={handleResizeEnd}
            isResizing={resizeState?.direction === 'horizontal' && resizeState?.dividerIndex === divider.index}
          />
        </div>
      ))}

      {/* Vertical resize handles (between rows) */}
      {!isMaximized && dividers.vertical.map((divider) => (
        <div
          key={`v-divider-${divider.index}`}
          className="absolute z-10"
          style={{
            top: `${divider.position}px`,
            left: `${divider.startPx}px`,
            width: `${divider.endPx - divider.startPx}px`,
          }}
        >
          <ResizeHandle
            direction="vertical"
            index={divider.index}
            onResizeStart={handleResizeStart}
            onResize={handleResize}
            onResizeEnd={handleResizeEnd}
            isResizing={resizeState?.direction === 'vertical' && resizeState?.dividerIndex === divider.index}
          />
        </div>
      ))}

      {/* Drop overlay when dragging */}
      {dragState && (
        <div
          className="absolute inset-0 pointer-events-none z-20"
          style={{
            background: 'radial-gradient(ellipse at center, rgba(var(--color-primary-rgb), 0.05) 0%, transparent 70%)',
          }}
        />
      )}
    </div>
  );
}

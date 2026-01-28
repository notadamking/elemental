/**
 * WorkspaceGrid - Layout container for workspace panes
 *
 * Uses react-resizable-panels for smooth split-pane resizing with support
 * for multiple layouts (single, columns, rows, grid) and drag-drop reordering.
 * Single mode displays tabs like a browser/code editor.
 */

import { useState, useCallback, useMemo, Fragment } from 'react';
import { Group, Panel, Separator } from 'react-resizable-panels';
import { X, Terminal, Radio, ArrowLeftRight, ArrowUpDown } from 'lucide-react';
import type {
  WorkspacePane,
  LayoutPreset,
  GridOrientation,
  SectionLayout,
  PaneId,
  PaneStatus,
  DragState,
} from './types';
import { WorkspacePane as WorkspacePaneComponent } from './WorkspacePane';

/** Role badge styles for tabs */
const tabRoleColors: Record<string, string> = {
  director: 'text-purple-500',
  worker: 'text-blue-500',
  steward: 'text-amber-500',
};

export interface WorkspaceGridProps {
  panes: WorkspacePane[];
  preset: LayoutPreset;
  gridOrientation?: GridOrientation;
  sectionLayout?: SectionLayout;
  activePane: PaneId | null;
  dragState: DragState | null;
  onPaneClose: (paneId: PaneId) => void;
  onPaneActivate: (paneId: PaneId) => void;
  onPaneStatusChange: (paneId: PaneId, status: PaneStatus) => void;
  onStartDrag: (paneId: PaneId) => void;
  onUpdateDragTarget: (targetPosition: number | null) => void;
  onEndDrag: () => void;
  onSwapSections?: () => void;
  onSwapPanes?: (paneId1: PaneId, paneId2: PaneId) => void;
}

/**
 * Custom resize handle with visual feedback and optional swap button
 */
function CustomResizeHandle({
  orientation,
  onSwap,
  swapTestId,
}: {
  orientation: 'horizontal' | 'vertical';
  onSwap?: () => void;
  swapTestId?: string;
}) {
  const isHorizontal = orientation === 'horizontal';
  const SwapIcon = isHorizontal ? ArrowLeftRight : ArrowUpDown;

  return (
    <Separator
      className={`
        group relative
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
      {/* Swap button - positioned in center of resize handle */}
      {onSwap && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onSwap();
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          className={`
            absolute z-20
            p-1.5 rounded-full
            bg-[var(--color-surface)] border border-[var(--color-border)]
            text-[var(--color-text-tertiary)]
            hover:bg-[var(--color-primary-muted)] hover:text-[var(--color-primary)]
            hover:border-[var(--color-primary)] hover:scale-110
            transition-all duration-150
            shadow-md
            opacity-60 hover:opacity-100
            cursor-pointer
          `}
          title="Swap sections"
          data-testid={swapTestId}
        >
          <SwapIcon className="w-3.5 h-3.5" />
        </button>
      )}
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
  isSingleMode,
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
  isSingleMode: boolean;
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
        transition-all duration-150
      `}
      draggable={!isMaximized && !isSingleMode}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    >
      {/* Drop target overlay */}
      {isDropTarget && (
        <div className="absolute inset-0 z-10 pointer-events-none flex items-center justify-center bg-[var(--color-primary)]/10 border-2 border-dashed border-[var(--color-primary)] rounded-lg">
          <div className="px-3 py-1.5 rounded-md bg-[var(--color-primary)] text-white text-sm font-medium shadow-lg">
            Drop to swap positions
          </div>
        </div>
      )}
      <WorkspacePaneComponent
        pane={pane}
        isActive={isActive}
        isMaximized={isMaximized}
        isSingleMode={isSingleMode}
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
      // For single mode, we show one pane at a time (handled by tab UI)
      // But if we get here, stack vertically for fallback
      return {
        orientation: 'vertical',
        rows: Array.from({ length: paneCount }, (_, i) => [i]),
      };

    case 'columns':
      // All panes side by side in a single row (each pane is its own column)
      return {
        orientation: 'horizontal',
        rows: Array.from({ length: paneCount }, (_, i) => [i]),
      };

    case 'rows':
      // All panes stacked vertically in a single column (each pane is its own row)
      return {
        orientation: 'vertical',
        rows: Array.from({ length: paneCount }, (_, i) => [i]),
      };

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
  gridOrientation = 'horizontal',
  sectionLayout = 'single-first',
  activePane,
  dragState,
  onPaneClose,
  onPaneActivate,
  onPaneStatusChange,
  onStartDrag,
  onUpdateDragTarget,
  onEndDrag,
  onSwapSections,
  onSwapPanes,
}: WorkspaceGridProps) {
  const [maximizedPane, setMaximizedPane] = useState<PaneId | null>(null);

  // For single/tabbed mode, track which pane is selected (uses activePane or first pane)
  const selectedPaneId = activePane || panes[0]?.id || null;

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
    // Also set a custom MIME type to identify pane drags vs file drags
    e.dataTransfer.setData('application/x-workspace-pane', paneId);
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
        isSingleMode={preset === 'single' && !isMaximized}
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

  // Special case: single pane (no tabs needed)
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

  // Single/Tabbed mode: show tabs like a browser with one pane visible at a time
  if (preset === 'single' && !isMaximized && visiblePanes.length > 1) {
    const selectedIndex = visiblePanes.findIndex(p => p.id === selectedPaneId);
    const activeIndex = selectedIndex >= 0 ? selectedIndex : 0;

    return (
      <div
        className="h-full w-full flex flex-col"
        data-testid="workspace-grid"
        data-preset={preset}
        data-pane-count={visiblePanes.length}
      >
        {/* Tab bar */}
        <div className="flex-shrink-0 flex items-center border-b border-[var(--color-border)] bg-[var(--color-surface)] overflow-x-auto">
          {visiblePanes.map((pane, index) => {
            const isSelected = index === activeIndex;
            const RoleIcon = pane.agentRole === 'steward' ? Radio : Terminal;
            const roleColor = tabRoleColors[pane.agentRole] || tabRoleColors.worker;

            return (
              <div
                key={pane.id}
                className={`
                  group relative flex items-center gap-2 px-3 py-2 min-w-0
                  border-r border-[var(--color-border)]
                  cursor-pointer select-none
                  transition-colors duration-150
                  ${isSelected
                    ? 'bg-[var(--color-bg)] text-[var(--color-text)]'
                    : 'bg-[var(--color-surface-hover)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)]'
                  }
                `}
                onClick={() => onPaneActivate(pane.id)}
                data-testid={`workspace-tab-${pane.id}`}
              >
                {/* Status indicator */}
                <div
                  className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    pane.status === 'connected' ? 'bg-green-500' :
                    pane.status === 'connecting' ? 'bg-yellow-500 animate-pulse' :
                    pane.status === 'error' ? 'bg-red-500' :
                    'bg-gray-400'
                  }`}
                />
                {/* Role icon */}
                <RoleIcon className={`w-3.5 h-3.5 flex-shrink-0 ${roleColor}`} />
                {/* Agent name */}
                <span className="truncate text-sm font-medium max-w-32" title={pane.agentName}>
                  {pane.agentName}
                </span>
                {/* Close button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onPaneClose(pane.id);
                  }}
                  className="
                    p-0.5 rounded ml-1 flex-shrink-0
                    text-[var(--color-text-tertiary)]
                    hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20
                    opacity-0 group-hover:opacity-100
                    transition-all duration-150
                  "
                  title="Close tab"
                >
                  <X className="w-3 h-3" />
                </button>
                {/* Active indicator */}
                {isSelected && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--color-primary)]" />
                )}
              </div>
            );
          })}
        </div>

        {/* Tab content - show only the selected pane */}
        <div className="flex-1 min-h-0">
          {renderPane(activeIndex)}
        </div>
      </div>
    );
  }

  // Special case for 3-pane grid layout
  // Horizontal orientation + single-first: 1 pane on left, 2 stacked on right
  // Horizontal orientation + single-last: 2 stacked on left, 1 pane on right
  // Vertical orientation + single-first: 1 pane on top, 2 side-by-side on bottom
  // Vertical orientation + single-last: 2 side-by-side on top, 1 pane on bottom
  if (!isMaximized && preset === 'grid' && visiblePanes.length === 3) {
    const isHorizontal = gridOrientation === 'horizontal';
    const isSingleFirst = sectionLayout === 'single-first';

    // Determine pane indices based on section layout
    // single-first: pane 0 is single, panes 1,2 are paired
    // single-last: panes 0,1 are paired, pane 2 is single
    const singlePaneIndex = isSingleFirst ? 0 : 2;
    const pairedPaneIndices = isSingleFirst ? [1, 2] : [0, 1];

    return (
      <div
        className="h-full w-full"
        data-testid="workspace-grid"
        data-preset={preset}
        data-pane-count={visiblePanes.length}
        data-orientation={gridOrientation}
        data-section-layout={sectionLayout}
      >
        <Group orientation={isHorizontal ? 'horizontal' : 'vertical'} id="workspace-grid-3pane">
          {isSingleFirst ? (
            <>
              <Panel id="pane-single" defaultSize={50} minSize={15}>
                {renderPane(singlePaneIndex)}
              </Panel>
              <CustomResizeHandle
                orientation={isHorizontal ? 'horizontal' : 'vertical'}
                onSwap={onSwapSections}
                swapTestId="swap-sections-btn"
              />
              <Panel id="pane-paired" defaultSize={50} minSize={15}>
                <Group orientation={isHorizontal ? 'vertical' : 'horizontal'} id="workspace-grid-3pane-secondary">
                  <Panel id="pane-paired-0" defaultSize={50} minSize={15}>
                    {renderPane(pairedPaneIndices[0])}
                  </Panel>
                  <CustomResizeHandle
                    orientation={isHorizontal ? 'vertical' : 'horizontal'}
                    onSwap={onSwapPanes ? () => onSwapPanes(visiblePanes[pairedPaneIndices[0]].id, visiblePanes[pairedPaneIndices[1]].id) : undefined}
                    swapTestId="swap-panes-btn"
                  />
                  <Panel id="pane-paired-1" defaultSize={50} minSize={15}>
                    {renderPane(pairedPaneIndices[1])}
                  </Panel>
                </Group>
              </Panel>
            </>
          ) : (
            <>
              <Panel id="pane-paired" defaultSize={50} minSize={15}>
                <Group orientation={isHorizontal ? 'vertical' : 'horizontal'} id="workspace-grid-3pane-secondary">
                  <Panel id="pane-paired-0" defaultSize={50} minSize={15}>
                    {renderPane(pairedPaneIndices[0])}
                  </Panel>
                  <CustomResizeHandle
                    orientation={isHorizontal ? 'vertical' : 'horizontal'}
                    onSwap={onSwapPanes ? () => onSwapPanes(visiblePanes[pairedPaneIndices[0]].id, visiblePanes[pairedPaneIndices[1]].id) : undefined}
                    swapTestId="swap-panes-btn"
                  />
                  <Panel id="pane-paired-1" defaultSize={50} minSize={15}>
                    {renderPane(pairedPaneIndices[1])}
                  </Panel>
                </Group>
              </Panel>
              <CustomResizeHandle
                orientation={isHorizontal ? 'horizontal' : 'vertical'}
                onSwap={onSwapSections}
                swapTestId="swap-sections-btn"
              />
              <Panel id="pane-single" defaultSize={50} minSize={15}>
                {renderPane(singlePaneIndex)}
              </Panel>
            </>
          )}
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
            <Fragment key={`row-group-${rowIndex}`}>
              {rowIndex > 0 && (
                <CustomResizeHandle
                  orientation="vertical"
                  onSwap={
                    onSwapPanes && layoutConfig.rows[rowIndex - 1].length === 1 && rowIndices.length === 1
                      ? () => onSwapPanes(visiblePanes[layoutConfig.rows[rowIndex - 1][0]].id, visiblePanes[rowIndices[0]].id)
                      : undefined
                  }
                  swapTestId={`swap-row-${rowIndex - 1}-${rowIndex}-btn`}
                />
              )}
              <Panel id={`row-${rowIndex}`} defaultSize={100 / layoutConfig.rows.length} minSize={10}>
                {rowIndices.length === 1 ? (
                  renderPane(rowIndices[0])
                ) : (
                  <Group orientation="horizontal" id={`workspace-row-${rowIndex}`}>
                    {rowIndices.map((paneIndex, colIndex) => (
                      <Fragment key={`col-group-${colIndex}`}>
                        {colIndex > 0 && (
                          <CustomResizeHandle
                            orientation="horizontal"
                            onSwap={
                              onSwapPanes
                                ? () => onSwapPanes(visiblePanes[rowIndices[colIndex - 1]].id, visiblePanes[paneIndex].id)
                                : undefined
                            }
                            swapTestId={`swap-col-${colIndex - 1}-${colIndex}-btn`}
                          />
                        )}
                        <Panel id={`col-${rowIndex}-${colIndex}`} defaultSize={100 / rowIndices.length} minSize={15}>
                          {renderPane(paneIndex)}
                        </Panel>
                      </Fragment>
                    ))}
                  </Group>
                )}
              </Panel>
            </Fragment>
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
          <Fragment key={`col-group-${colIndex}`}>
            {colIndex > 0 && (
              <CustomResizeHandle
                orientation="horizontal"
                onSwap={
                  onSwapPanes && layoutConfig.rows[colIndex - 1].length === 1 && columnIndices.length === 1
                    ? () => onSwapPanes(visiblePanes[layoutConfig.rows[colIndex - 1][0]].id, visiblePanes[columnIndices[0]].id)
                    : undefined
                }
                swapTestId={`swap-col-${colIndex - 1}-${colIndex}-btn`}
              />
            )}
            <Panel id={`col-${colIndex}`} defaultSize={100 / layoutConfig.rows.length} minSize={15}>
              {columnIndices.length === 1 ? (
                renderPane(columnIndices[0])
              ) : (
                <Group orientation="vertical" id={`workspace-col-${colIndex}`}>
                  {columnIndices.map((paneIndex, rowIndex) => (
                    <Fragment key={`row-group-${rowIndex}`}>
                      {rowIndex > 0 && (
                        <CustomResizeHandle
                          orientation="vertical"
                          onSwap={
                            onSwapPanes
                              ? () => onSwapPanes(visiblePanes[columnIndices[rowIndex - 1]].id, visiblePanes[paneIndex].id)
                              : undefined
                          }
                          swapTestId={`swap-row-${rowIndex - 1}-${rowIndex}-btn`}
                        />
                      )}
                      <Panel id={`row-${colIndex}-${rowIndex}`} defaultSize={100 / columnIndices.length} minSize={15}>
                        {renderPane(paneIndex)}
                      </Panel>
                    </Fragment>
                  ))}
                </Group>
              )}
            </Panel>
          </Fragment>
        ))}
      </Group>
    </div>
  );
}

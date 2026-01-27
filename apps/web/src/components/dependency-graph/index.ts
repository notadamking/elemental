/**
 * Dependency Graph Components
 *
 * This module provides components for visualizing task dependencies
 * using React Flow.
 */

// Types
export type {
  Task,
  DependencyTree,
  DependencyTreeNode,
  Dependency,
  DependencyListResponse,
  TaskNodeData,
  CustomEdgeData,
  CustomEdgeProps,
  GraphOptions,
  LayoutDirection,
  LayoutAlgorithm,
  LayoutOptions,
  GraphBuildResult,
} from './types';

// Constants
export {
  DEPENDENCY_TYPES,
  EDGE_TYPE_COLORS,
  STATUS_COLORS,
  PRIORITY_COLORS,
  STATUS_OPTIONS,
  DEFAULT_LAYOUT_OPTIONS,
  DIRECTION_LABELS,
  ALGORITHM_LABELS,
  getEdgeColor,
} from './constants';

// Hooks
export {
  useReadyTasks,
  useBlockedTasks,
  useDependencyTree,
  useDependencyList,
} from './hooks';

// Utilities
export {
  loadLayoutOptions,
  saveLayoutOptions,
  applyDagreLayout,
  applyForceLayout,
  applyRadialLayout,
  applyAutoLayout,
  buildDependencyTypeMap,
  buildGraphFromTree,
} from './utils';

// Components
export { TaskNode } from './TaskNode';
export { CustomEdge } from './CustomEdge';
export { TaskSelector } from './TaskSelector';
export { GraphToolbar } from './GraphToolbar';
export { DependencyGraphInner } from './DependencyGraphInner';
export type { DependencyGraphInnerProps } from './DependencyGraphInner';
export { GraphLegend } from './GraphLegend';

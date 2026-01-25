/**
 * Dependency Graph Lens
 *
 * Interactive visualization of task dependencies using React Flow.
 * Supports Edit Mode for adding/removing dependencies.
 */

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  type Node,
  type Edge,
  type NodeTypes,
  type EdgeTypes,
  Handle,
  Position,
  MarkerType,
  type NodeMouseHandler,
  BaseEdge,
  getSmoothStepPath,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Search, X, Filter, ZoomIn, ZoomOut, Maximize2, Edit3, Trash2, Link2 } from 'lucide-react';

interface Task {
  id: string;
  type: 'task';
  title: string;
  status: string;
  priority: number;
  complexity: number;
  taskType: string;
  assignee?: string;
  tags: string[];
}

interface DependencyTreeNode {
  element: Task;
  dependencies: DependencyTreeNode[];
  dependents: DependencyTreeNode[];
}

interface DependencyTree {
  root: DependencyTreeNode;
  dependencyDepth: number;
  dependentDepth: number;
  nodeCount: number;
}

// Dependency types that can be created
const DEPENDENCY_TYPES = [
  { value: 'blocks', label: 'Blocks', description: 'Target cannot proceed until source completes' },
  { value: 'parent-child', label: 'Parent-Child', description: 'Hierarchical containment' },
  { value: 'relates-to', label: 'Relates To', description: 'Semantic bidirectional link' },
  { value: 'references', label: 'References', description: 'Citation (unidirectional)' },
] as const;

function useReadyTasks() {
  return useQuery<Task[]>({
    queryKey: ['tasks', 'ready'],
    queryFn: async () => {
      const response = await fetch('/api/tasks/ready');
      if (!response.ok) throw new Error('Failed to fetch ready tasks');
      return response.json();
    },
  });
}

function useBlockedTasks() {
  return useQuery<Task[]>({
    queryKey: ['tasks', 'blocked'],
    queryFn: async () => {
      const response = await fetch('/api/tasks/blocked');
      if (!response.ok) throw new Error('Failed to fetch blocked tasks');
      return response.json();
    },
  });
}

function useDependencyTree(taskId: string | null) {
  return useQuery<DependencyTree>({
    queryKey: ['dependencies', 'tree', taskId],
    queryFn: async () => {
      const response = await fetch(`/api/dependencies/${taskId}/tree`);
      if (!response.ok) throw new Error('Failed to fetch dependency tree');
      return response.json();
    },
    enabled: !!taskId,
  });
}

function useAddDependency() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { sourceId: string; targetId: string; type: string }) => {
      const response = await fetch('/api/dependencies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to create dependency');
      }
      return response.json();
    },
    onSuccess: () => {
      // Invalidate dependency queries to refresh the graph
      queryClient.invalidateQueries({ queryKey: ['dependencies'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

function useRemoveDependency() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { sourceId: string; targetId: string; type: string }) => {
      const response = await fetch(
        `/api/dependencies/${encodeURIComponent(data.sourceId)}/${encodeURIComponent(data.targetId)}/${encodeURIComponent(data.type)}`,
        { method: 'DELETE' }
      );
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to remove dependency');
      }
      return response.json();
    },
    onSuccess: () => {
      // Invalidate dependency queries to refresh the graph
      queryClient.invalidateQueries({ queryKey: ['dependencies'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

const STATUS_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  open: { bg: 'bg-blue-50', border: 'border-blue-300', text: 'text-blue-800' },
  in_progress: { bg: 'bg-yellow-50', border: 'border-yellow-300', text: 'text-yellow-800' },
  blocked: { bg: 'bg-red-50', border: 'border-red-300', text: 'text-red-800' },
  completed: { bg: 'bg-green-50', border: 'border-green-300', text: 'text-green-800' },
  cancelled: { bg: 'bg-gray-50', border: 'border-gray-300', text: 'text-gray-500' },
};

const PRIORITY_COLORS: Record<number, string> = {
  1: 'text-red-600',
  2: 'text-orange-600',
  3: 'text-yellow-600',
  4: 'text-green-600',
  5: 'text-gray-500',
};

interface TaskNodeData extends Record<string, unknown> {
  task: Task;
  isRoot: boolean;
  isHighlighted: boolean;
  isSearchMatch: boolean;
  isSelected: boolean;
  editMode: boolean;
}

function TaskNode({ data }: { data: TaskNodeData }) {
  const { task, isRoot, isHighlighted, isSearchMatch, isSelected, editMode } = data;
  const colors = STATUS_COLORS[task.status] || STATUS_COLORS.open;
  const priorityColor = PRIORITY_COLORS[task.priority] || PRIORITY_COLORS[3];

  return (
    <div
      className={`
        px-4 py-3 rounded-lg border-2 shadow-sm min-w-[180px] max-w-[220px]
        ${colors.bg} ${colors.border}
        ${isRoot ? 'ring-2 ring-blue-500 ring-offset-2' : ''}
        ${isSearchMatch ? 'ring-2 ring-yellow-400 ring-offset-2 shadow-lg shadow-yellow-200' : ''}
        ${isSelected && editMode ? 'ring-2 ring-purple-500 ring-offset-2 shadow-lg shadow-purple-200' : ''}
        ${isHighlighted && !isSearchMatch ? 'opacity-100' : ''}
        ${!isHighlighted && !isSearchMatch ? 'opacity-40' : ''}
        ${editMode ? 'cursor-pointer hover:shadow-md' : ''}
        transition-all duration-200
      `}
      data-testid="graph-node"
      data-node-id={task.id}
      data-selected={isSelected}
    >
      <Handle type="target" position={Position.Top} className="!bg-gray-400" />
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className={`text-xs font-medium ${colors.text} uppercase`}>
          {task.status.replace('_', ' ')}
        </span>
        <span className={`text-xs font-medium ${priorityColor}`}>P{task.priority}</span>
      </div>
      <div className="font-medium text-gray-900 text-sm leading-tight line-clamp-2">
        {task.title}
      </div>
      <div className="mt-1 text-xs text-gray-500 font-mono truncate">{task.id}</div>
      <Handle type="source" position={Position.Bottom} className="!bg-gray-400" />
    </div>
  );
}

// Custom edge with right-click context menu support
interface CustomEdgeData extends Record<string, unknown> {
  dependencyType: string;
  editMode: boolean;
  onDelete: (sourceId: string, targetId: string, type: string) => void;
}

interface CustomEdgeProps {
  id: string;
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  sourcePosition: Position;
  targetPosition: Position;
  style?: React.CSSProperties;
  markerEnd?: string;
  data?: CustomEdgeData;
}

function CustomEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  data,
}: CustomEdgeProps) {
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [contextMenuPos, setContextMenuPos] = useState({ x: 0, y: 0 });
  const edgeRef = useRef<SVGGElement>(null);

  const [edgePath] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const handleContextMenu = useCallback((event: React.MouseEvent) => {
    if (!data?.editMode) return;
    event.preventDefault();
    event.stopPropagation();
    setContextMenuPos({ x: event.clientX, y: event.clientY });
    setShowContextMenu(true);
  }, [data?.editMode]);

  const handleDelete = useCallback(() => {
    // Extract source and target from edge id (format: "sourceId->targetId")
    const [sourceId, targetId] = id.split('->');
    if (sourceId && targetId && data?.onDelete && data?.dependencyType) {
      data.onDelete(sourceId, targetId, data.dependencyType);
    }
    setShowContextMenu(false);
  }, [id, data]);

  // Close context menu when clicking outside
  useEffect(() => {
    if (!showContextMenu) return;
    const handleClick = () => setShowContextMenu(false);
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [showContextMenu]);

  return (
    <g ref={edgeRef}>
      <BaseEdge path={edgePath} markerEnd={markerEnd} style={style} />
      {/* Wider invisible path for easier interaction */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
        onContextMenu={handleContextMenu}
        style={{ cursor: data?.editMode ? 'context-menu' : 'default' }}
        data-testid="edge-interaction-zone"
        data-edge-id={id}
      />
      {showContextMenu && (
        <foreignObject
          x={contextMenuPos.x - 100}
          y={contextMenuPos.y - 40}
          width={200}
          height={100}
          style={{ overflow: 'visible' }}
        >
          <div
            className="bg-white border border-gray-200 rounded-lg shadow-lg py-1 w-40"
            style={{
              position: 'fixed',
              left: contextMenuPos.x,
              top: contextMenuPos.y,
              zIndex: 9999,
            }}
            data-testid="edge-context-menu"
          >
            <button
              onClick={handleDelete}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
              data-testid="delete-edge-button"
            >
              <Trash2 className="w-4 h-4" />
              Delete Dependency
            </button>
          </div>
        </foreignObject>
      )}
    </g>
  );
}

const nodeTypes: NodeTypes = {
  task: TaskNode,
};

const edgeTypes: EdgeTypes = {
  custom: CustomEdge,
};

interface GraphOptions {
  searchQuery: string;
  statusFilter: string[];
  selectedNodeId: string | null;
  editMode: boolean;
}

function buildGraphFromTree(
  tree: DependencyTree,
  options: GraphOptions,
  onDeleteEdge: (sourceId: string, targetId: string, type: string) => void
): { nodes: Node<TaskNodeData>[]; edges: Edge[] } {
  const nodes: Node<TaskNodeData>[] = [];
  const edges: Edge<CustomEdgeData>[] = [];
  const visited = new Set<string>();

  const { searchQuery, statusFilter, selectedNodeId, editMode } = options;
  const hasSearch = searchQuery.trim().length > 0;
  const hasStatusFilter = statusFilter.length > 0;
  const hasAnyFilter = hasSearch || hasStatusFilter;

  // Check if a task matches the search query
  function matchesSearch(task: Task): boolean {
    if (!hasSearch) return true;
    const query = searchQuery.toLowerCase();
    return (
      task.title.toLowerCase().includes(query) ||
      task.id.toLowerCase().includes(query)
    );
  }

  // Check if a task matches the status filter
  function matchesStatus(task: Task): boolean {
    if (!hasStatusFilter) return true;
    return statusFilter.includes(task.status);
  }

  // Check if a task matches all filters
  function matchesFilters(task: Task): boolean {
    return matchesSearch(task) && matchesStatus(task);
  }

  // Helper to recursively add nodes and edges
  function processNode(
    node: DependencyTreeNode,
    level: number,
    position: number,
    direction: 'up' | 'down' | 'root'
  ) {
    if (visited.has(node.element.id)) return;
    visited.add(node.element.id);

    // Calculate Y position based on level
    const y = direction === 'up' ? -level * 150 : level * 150;
    const x = position * 250;

    const isMatch = matchesFilters(node.element);
    const isSearchMatch = hasSearch && matchesSearch(node.element);
    const isSelected = node.element.id === selectedNodeId;

    nodes.push({
      id: node.element.id,
      type: 'task',
      position: { x, y },
      data: {
        task: node.element,
        isRoot: direction === 'root',
        isHighlighted: !hasAnyFilter || isMatch,
        isSearchMatch: isSearchMatch,
        isSelected: isSelected,
        editMode: editMode,
      },
    });

    // Process dependencies (nodes this task depends on - above)
    node.dependencies.forEach((dep, i) => {
      if (!visited.has(dep.element.id)) {
        processNode(dep, level + 1, position + i - Math.floor(node.dependencies.length / 2), 'up');
      }
      edges.push({
        id: `${node.element.id}->${dep.element.id}`,
        source: node.element.id,
        target: dep.element.id,
        type: editMode ? 'custom' : 'smoothstep',
        animated: true,
        markerEnd: { type: MarkerType.ArrowClosed },
        style: { stroke: '#94a3b8' },
        data: {
          dependencyType: 'blocks',
          editMode: editMode,
          onDelete: onDeleteEdge,
        },
      });
    });

    // Process dependents (nodes that depend on this task - below)
    node.dependents.forEach((dep, i) => {
      if (!visited.has(dep.element.id)) {
        processNode(dep, level + 1, position + i - Math.floor(node.dependents.length / 2), 'down');
      }
      edges.push({
        id: `${dep.element.id}->${node.element.id}`,
        source: dep.element.id,
        target: node.element.id,
        type: editMode ? 'custom' : 'smoothstep',
        animated: true,
        markerEnd: { type: MarkerType.ArrowClosed },
        style: { stroke: '#94a3b8' },
        data: {
          dependencyType: 'blocks',
          editMode: editMode,
          onDelete: onDeleteEdge,
        },
      });
    });
  }

  processNode(tree.root, 0, 0, 'root');

  return { nodes, edges };
}

function TaskSelector({
  tasks,
  selectedId,
  onSelect,
}: {
  tasks: Task[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="space-y-2">
      {tasks.map((task) => (
        <button
          key={task.id}
          onClick={() => onSelect(task.id)}
          className={`
            w-full text-left p-3 rounded-lg border transition-colors
            ${selectedId === task.id
              ? 'border-blue-500 bg-blue-50'
              : 'border-gray-200 hover:border-gray-300 bg-white'
            }
          `}
        >
          <div className="font-medium text-gray-900 text-sm truncate">{task.title}</div>
          <div className="text-xs text-gray-500 font-mono mt-1">{task.id}</div>
        </button>
      ))}
    </div>
  );
}

// Status options for filter
const STATUS_OPTIONS = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

// Dependency type picker modal
function DependencyTypePicker({
  sourceNode: _sourceNode,
  targetNode: _targetNode,
  onSelect,
  onCancel,
  isLoading,
  error,
}: {
  sourceNode: Task;
  targetNode: Task;
  onSelect: (type: string) => void;
  onCancel: () => void;
  isLoading: boolean;
  error: string | null;
}) {
  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={onCancel}
      data-testid="dependency-type-picker-overlay"
    >
      <div
        className="bg-white rounded-lg shadow-xl p-4 w-80"
        onClick={(e) => e.stopPropagation()}
        data-testid="dependency-type-picker"
      >
        <div className="flex items-center gap-2 mb-4">
          <Link2 className="w-5 h-5 text-purple-600" />
          <h3 className="font-medium text-gray-900">Add Dependency</h3>
        </div>

        {error && (
          <div className="mb-4 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700" data-testid="dependency-error">
            {error}
          </div>
        )}

        <div className="space-y-2">
          {DEPENDENCY_TYPES.map(({ value, label, description }) => (
            <button
              key={value}
              onClick={() => onSelect(value)}
              disabled={isLoading}
              className="w-full text-left p-3 rounded-lg border border-gray-200 hover:border-purple-300 hover:bg-purple-50 transition-colors disabled:opacity-50"
              data-testid={`dependency-type-${value}`}
            >
              <div className="font-medium text-gray-900 text-sm">{label}</div>
              <div className="text-xs text-gray-500 mt-1">{description}</div>
            </button>
          ))}
        </div>

        <div className="mt-4 flex justify-end">
          <button
            onClick={onCancel}
            className="px-3 py-2 text-sm text-gray-600 hover:text-gray-800"
            data-testid="cancel-dependency-button"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// Graph toolbar with search, filters, and edit mode toggle
function GraphToolbar({
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  matchCount,
  totalCount,
  onClearFilters,
  onFitView,
  onZoomIn,
  onZoomOut,
  editMode,
  onEditModeToggle,
  selectedSourceNode,
  onCancelSelection,
}: {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  statusFilter: string[];
  onStatusFilterChange: (value: string[]) => void;
  matchCount: number;
  totalCount: number;
  onClearFilters: () => void;
  onFitView: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  editMode: boolean;
  onEditModeToggle: () => void;
  selectedSourceNode: Task | null;
  onCancelSelection: () => void;
}) {
  const [showStatusFilter, setShowStatusFilter] = useState(false);
  const hasFilters = searchQuery.trim().length > 0 || statusFilter.length > 0;

  const toggleStatus = (status: string) => {
    if (statusFilter.includes(status)) {
      onStatusFilterChange(statusFilter.filter(s => s !== status));
    } else {
      onStatusFilterChange([...statusFilter, status]);
    }
  };

  return (
    <div className="flex items-center gap-3 mb-3" data-testid="graph-toolbar">
      {/* Edit Mode Toggle */}
      <button
        onClick={onEditModeToggle}
        className={`
          flex items-center gap-2 px-3 py-2 text-sm border rounded-lg transition-colors
          ${editMode
            ? 'bg-purple-100 border-purple-400 text-purple-700'
            : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
          }
        `}
        data-testid="edit-mode-toggle"
      >
        <Edit3 className="w-4 h-4" />
        <span>{editMode ? 'Exit Edit Mode' : 'Edit Mode'}</span>
      </button>

      {/* Edit mode instructions */}
      {editMode && !selectedSourceNode && (
        <span className="text-sm text-purple-600" data-testid="edit-mode-hint">
          Click a node to select source, then click another to add dependency
        </span>
      )}
      {editMode && selectedSourceNode && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-purple-600" data-testid="source-selected-hint">
            Source: <span className="font-medium">{selectedSourceNode.title.substring(0, 20)}...</span> — Click another node
          </span>
          <button
            onClick={onCancelSelection}
            className="text-sm text-gray-500 hover:text-gray-700"
            data-testid="cancel-selection-button"
          >
            (Cancel)
          </button>
        </div>
      )}

      {/* Search Input - only show when not in edit mode or not selecting */}
      {!editMode && (
        <>
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by title or ID..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full pl-9 pr-8 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              data-testid="graph-search-input"
            />
            {searchQuery && (
              <button
                onClick={() => onSearchChange('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
                data-testid="clear-search-button"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Status Filter Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowStatusFilter(!showStatusFilter)}
              className={`
                flex items-center gap-2 px-3 py-2 text-sm border rounded-lg transition-colors
                ${statusFilter.length > 0
                  ? 'bg-blue-50 border-blue-300 text-blue-700'
                  : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                }
              `}
              data-testid="status-filter-button"
            >
              <Filter className="w-4 h-4" />
              <span>Status</span>
              {statusFilter.length > 0 && (
                <span className="bg-blue-600 text-white text-xs px-1.5 py-0.5 rounded-full">
                  {statusFilter.length}
                </span>
              )}
            </button>
            {showStatusFilter && (
              <div
                className="absolute top-full left-0 mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-50"
                data-testid="status-filter-dropdown"
              >
                <div className="p-2 space-y-1">
                  {STATUS_OPTIONS.map(({ value, label }) => (
                    <button
                      key={value}
                      onClick={() => toggleStatus(value)}
                      className={`
                        w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-colors
                        ${statusFilter.includes(value)
                          ? 'bg-blue-50 text-blue-700'
                          : 'hover:bg-gray-50 text-gray-700'
                        }
                      `}
                      data-testid={`status-filter-option-${value}`}
                    >
                      <div className={`w-3 h-3 rounded border ${STATUS_COLORS[value].bg} ${STATUS_COLORS[value].border}`} />
                      <span>{label}</span>
                      {statusFilter.includes(value) && (
                        <span className="ml-auto text-blue-600">✓</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Match Count */}
          {hasFilters && (
            <span className="text-sm text-gray-500" data-testid="match-count">
              {matchCount} of {totalCount} nodes match
            </span>
          )}

          {/* Clear Filters */}
          {hasFilters && (
            <button
              onClick={onClearFilters}
              className="flex items-center gap-1 px-3 py-2 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
              data-testid="clear-filters-button"
            >
              <X className="w-4 h-4" />
              Clear filters
            </button>
          )}
        </>
      )}

      {/* Zoom Controls */}
      <div className="flex items-center gap-1 ml-auto">
        <button
          onClick={onZoomOut}
          className="p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
          title="Zoom out"
          data-testid="zoom-out-button"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <button
          onClick={onZoomIn}
          className="p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
          title="Zoom in"
          data-testid="zoom-in-button"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          onClick={onFitView}
          className="p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
          title="Fit to view"
          data-testid="fit-view-button"
        >
          <Maximize2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

interface DependencyGraphInnerProps {
  nodes: Node<TaskNodeData>[];
  edges: Edge[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onNodesChange: (changes: any) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onEdgesChange: (changes: any) => void;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  statusFilter: string[];
  onStatusFilterChange: (value: string[]) => void;
  onClearFilters: () => void;
  matchCount: number;
  totalCount: number;
  isLoadingTree: boolean;
  isError: boolean;
  hasData: boolean;
  editMode: boolean;
  onEditModeToggle: () => void;
  selectedSourceNode: Task | null;
  onCancelSelection: () => void;
  onNodeClick: NodeMouseHandler<Node<TaskNodeData>>;
}

// Inner component that uses useReactFlow (must be inside ReactFlowProvider)
function DependencyGraphInner({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  onClearFilters,
  matchCount,
  totalCount,
  isLoadingTree,
  isError,
  hasData,
  editMode,
  onEditModeToggle,
  selectedSourceNode,
  onCancelSelection,
  onNodeClick,
}: DependencyGraphInnerProps) {
  const { fitView, zoomIn, zoomOut } = useReactFlow();

  const handleFitView = useCallback(() => {
    fitView({ padding: 0.3, duration: 300 });
  }, [fitView]);

  const handleZoomIn = useCallback(() => {
    zoomIn({ duration: 200 });
  }, [zoomIn]);

  const handleZoomOut = useCallback(() => {
    zoomOut({ duration: 200 });
  }, [zoomOut]);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <GraphToolbar
        searchQuery={searchQuery}
        onSearchChange={onSearchChange}
        statusFilter={statusFilter}
        onStatusFilterChange={onStatusFilterChange}
        matchCount={matchCount}
        totalCount={totalCount}
        onClearFilters={onClearFilters}
        onFitView={handleFitView}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        editMode={editMode}
        onEditModeToggle={onEditModeToggle}
        selectedSourceNode={selectedSourceNode}
        onCancelSelection={onCancelSelection}
      />
      <div className="flex-1 bg-white rounded-lg border border-gray-200 overflow-hidden" data-testid="graph-canvas">
        {isLoadingTree && (
          <div className="flex items-center justify-center h-full text-gray-500">
            Loading dependency tree...
          </div>
        )}
        {isError && (
          <div className="flex items-center justify-center h-full text-red-600">
            Failed to load dependency tree
          </div>
        )}
        {hasData && nodes.length === 0 && (
          <div className="flex items-center justify-center h-full text-gray-500">
            No dependencies found for this task
          </div>
        )}
        {hasData && nodes.length > 0 && (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            fitView
            fitViewOptions={{ padding: 0.3 }}
            proOptions={{ hideAttribution: true }}
          >
            <Background />
            <Controls showZoom={false} showFitView={false} />
            <MiniMap
              nodeColor={(node) => {
                const task = (node.data as TaskNodeData).task;
                return STATUS_COLORS[task.status]?.border.replace('border-', '#').replace('-300', '') || '#cbd5e1';
              }}
              maskColor="rgba(255, 255, 255, 0.8)"
              data-testid="graph-minimap"
            />
          </ReactFlow>
        )}
        {!hasData && !isLoadingTree && !isError && (
          <div className="flex items-center justify-center h-full text-gray-500">
            Select a task to view its dependencies
          </div>
        )}
      </div>
    </div>
  );
}

export function DependencyGraphPage() {
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<TaskNodeData>>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [edges, setEdges, onEdgesChange] = useEdgesState<any>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string[]>([]);

  // Edit mode state
  const [editMode, setEditMode] = useState(false);
  const [selectedSourceNode, setSelectedSourceNode] = useState<Task | null>(null);
  const [targetNode, setTargetNode] = useState<Task | null>(null);
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [dependencyError, setDependencyError] = useState<string | null>(null);

  const readyTasks = useReadyTasks();
  const blockedTasks = useBlockedTasks();
  const dependencyTree = useDependencyTree(selectedTaskId);
  const addDependency = useAddDependency();
  const removeDependency = useRemoveDependency();

  // Combine tasks for the selector
  const allTasks = useMemo(() => {
    const ready = readyTasks.data || [];
    const blocked = blockedTasks.data || [];
    // Deduplicate by id
    const map = new Map<string, Task>();
    ready.forEach((t) => map.set(t.id, t));
    blocked.forEach((t) => map.set(t.id, t));
    return Array.from(map.values());
  }, [readyTasks.data, blockedTasks.data]);


  // Auto-select first blocked task (they have dependencies to visualize)
  useEffect(() => {
    if (!selectedTaskId && blockedTasks.data && blockedTasks.data.length > 0) {
      setSelectedTaskId(blockedTasks.data[0].id);
    } else if (!selectedTaskId && allTasks.length > 0) {
      setSelectedTaskId(allTasks[0].id);
    }
  }, [selectedTaskId, blockedTasks.data, allTasks]);

  // Handle edge deletion - stable reference using ref
  const handleDeleteEdgeRef = useRef<(sourceId: string, targetId: string, type: string) => void>(null!);
  handleDeleteEdgeRef.current = (sourceId: string, targetId: string, type: string) => {
    removeDependency.mutate(
      { sourceId, targetId, type },
      {
        onError: (error) => {
          console.error('Failed to delete dependency:', error);
          setDependencyError(error instanceof Error ? error.message : 'Failed to delete dependency');
        },
      }
    );
  };

  const handleDeleteEdge = useCallback((sourceId: string, targetId: string, type: string) => {
    handleDeleteEdgeRef.current?.(sourceId, targetId, type);
  }, []);

  // Update graph when dependency tree or filters change
  useEffect(() => {
    if (dependencyTree.data) {
      const { nodes: newNodes, edges: newEdges } = buildGraphFromTree(
        dependencyTree.data,
        { searchQuery, statusFilter, selectedNodeId: selectedSourceNode?.id || null, editMode },
        handleDeleteEdge
      );
      setNodes(newNodes);
      setEdges(newEdges);
    } else {
      setNodes([]);
      setEdges([]);
    }
  }, [dependencyTree.data, searchQuery, statusFilter, editMode, selectedSourceNode, setNodes, setEdges, handleDeleteEdge]);

  // Calculate match count for the filter display
  const matchCount = useMemo(() => {
    const hasSearch = searchQuery.trim().length > 0;
    const hasStatusFilter = statusFilter.length > 0;
    if (!hasSearch && !hasStatusFilter) return nodes.length;

    return nodes.filter(node => {
      const data = node.data as TaskNodeData;
      return data.isHighlighted || data.isSearchMatch;
    }).length;
  }, [nodes, searchQuery, statusFilter]);

  const clearFilters = useCallback(() => {
    setSearchQuery('');
    setStatusFilter([]);
  }, []);

  // Toggle edit mode
  const handleEditModeToggle = useCallback(() => {
    setEditMode(prev => !prev);
    setSelectedSourceNode(null);
    setTargetNode(null);
    setShowTypePicker(false);
    setDependencyError(null);
  }, []);

  // Cancel node selection
  const handleCancelSelection = useCallback(() => {
    setSelectedSourceNode(null);
    setTargetNode(null);
    setShowTypePicker(false);
    setDependencyError(null);
  }, []);

  // Handle node click in edit mode
  const handleNodeClick: NodeMouseHandler<Node<TaskNodeData>> = useCallback((_event, node) => {
    if (!editMode) return;

    const task = (node.data as TaskNodeData).task;

    if (!selectedSourceNode) {
      // First click - select source
      setSelectedSourceNode(task);
      setDependencyError(null);
    } else if (selectedSourceNode.id === task.id) {
      // Clicked same node - deselect
      setSelectedSourceNode(null);
    } else {
      // Second click - select target and show type picker
      setTargetNode(task);
      setShowTypePicker(true);
      setDependencyError(null);
    }
  }, [editMode, selectedSourceNode]);

  // Handle dependency type selection
  const handleDependencyTypeSelect = useCallback((type: string) => {
    if (!selectedSourceNode || !targetNode) return;

    addDependency.mutate(
      {
        sourceId: selectedSourceNode.id,
        targetId: targetNode.id,
        type,
      },
      {
        onSuccess: () => {
          setSelectedSourceNode(null);
          setTargetNode(null);
          setShowTypePicker(false);
          setDependencyError(null);
        },
        onError: (error) => {
          setDependencyError(error instanceof Error ? error.message : 'Failed to create dependency');
        },
      }
    );
  }, [selectedSourceNode, targetNode, addDependency]);

  // Cancel type picker
  const handleCancelTypePicker = useCallback(() => {
    setTargetNode(null);
    setShowTypePicker(false);
    setDependencyError(null);
  }, []);

  const isLoading = readyTasks.isLoading || blockedTasks.isLoading;

  return (
    <div className="h-full flex flex-col" data-testid="dependency-graph-page">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-medium text-gray-900">Dependency Graph</h2>
        <p className="text-sm text-gray-500">
          Visualize and edit task dependencies
        </p>
      </div>

      {isLoading && (
        <div className="text-gray-500">Loading tasks...</div>
      )}

      {!isLoading && allTasks.length === 0 && (
        <div className="bg-white rounded-lg shadow p-6 text-center text-gray-500">
          No tasks available. Create some tasks to visualize their dependencies.
        </div>
      )}

      {!isLoading && allTasks.length > 0 && (
        <div className="flex-1 flex gap-4 min-h-0">
          {/* Task Selector */}
          <div className="w-64 flex flex-col min-h-0">
            <h3 className="font-medium text-gray-700 mb-2">Select a Task</h3>
            <div className="flex-1 overflow-y-auto" data-testid="task-selector">
              <TaskSelector
                tasks={allTasks}
                selectedId={selectedTaskId}
                onSelect={setSelectedTaskId}
              />
            </div>
          </div>

          {/* Graph Canvas with Toolbar */}
          <ReactFlowProvider>
            <DependencyGraphInner
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              statusFilter={statusFilter}
              onStatusFilterChange={setStatusFilter}
              onClearFilters={clearFilters}
              matchCount={matchCount}
              totalCount={nodes.length}
              isLoadingTree={dependencyTree.isLoading}
              isError={dependencyTree.isError}
              hasData={!!dependencyTree.data}
              editMode={editMode}
              onEditModeToggle={handleEditModeToggle}
              selectedSourceNode={selectedSourceNode}
              onCancelSelection={handleCancelSelection}
              onNodeClick={handleNodeClick}
            />
          </ReactFlowProvider>
        </div>
      )}

      {/* Legend */}
      <div className="mt-4 flex items-center gap-6 text-sm text-gray-600">
        <span className="font-medium">Status:</span>
        {Object.entries(STATUS_COLORS).map(([status, colors]) => (
          <div key={status} className="flex items-center gap-1">
            <div className={`w-3 h-3 rounded border ${colors.bg} ${colors.border}`} />
            <span className="capitalize">{status.replace('_', ' ')}</span>
          </div>
        ))}
      </div>

      {/* Dependency Type Picker Modal */}
      {showTypePicker && selectedSourceNode && targetNode && (
        <DependencyTypePicker
          sourceNode={selectedSourceNode}
          targetNode={targetNode}
          onSelect={handleDependencyTypeSelect}
          onCancel={handleCancelTypePicker}
          isLoading={addDependency.isPending}
          error={dependencyError}
        />
      )}
    </div>
  );
}

/**
 * Dependency Graph Lens
 *
 * Interactive visualization of task dependencies using React Flow.
 * Supports Edit Mode for adding/removing dependencies.
 */

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTrackDashboardSection } from '../hooks/useTrackDashboardSection';
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
import dagre from 'dagre';
import { Search, X, Filter, ZoomIn, ZoomOut, Maximize2, Edit3, Trash2, Link2, Loader2, Tag, LayoutGrid, ArrowDown, ArrowRight, ArrowUp, ArrowLeft, SlidersHorizontal, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';

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
  { value: 'awaits', label: 'Awaits', description: 'Waiting for external event' },
  { value: 'validates', label: 'Validates', description: 'Validation relationship' },
  { value: 'authored-by', label: 'Authored By', description: 'Attribution to creator' },
  { value: 'assigned-to', label: 'Assigned To', description: 'Work assignment' },
] as const;

// Edge colors by dependency type category
const EDGE_TYPE_COLORS: Record<string, { stroke: string; label: string; labelBg: string }> = {
  // Blocking types - red/orange (critical path)
  'blocks': { stroke: '#ef4444', label: '#ef4444', labelBg: '#fef2f2' },
  'parent-child': { stroke: '#f97316', label: '#f97316', labelBg: '#fff7ed' },
  'awaits': { stroke: '#f59e0b', label: '#f59e0b', labelBg: '#fffbeb' },
  // Associative types - blue/gray (informational)
  'relates-to': { stroke: '#3b82f6', label: '#3b82f6', labelBg: '#eff6ff' },
  'references': { stroke: '#6b7280', label: '#6b7280', labelBg: '#f9fafb' },
  'validates': { stroke: '#8b5cf6', label: '#8b5cf6', labelBg: '#f5f3ff' },
  // Attribution types - green (people)
  'authored-by': { stroke: '#22c55e', label: '#22c55e', labelBg: '#f0fdf4' },
  'assigned-to': { stroke: '#10b981', label: '#10b981', labelBg: '#ecfdf5' },
};

// Get edge color for a dependency type (with fallback)
function getEdgeColor(type: string) {
  return EDGE_TYPE_COLORS[type] || { stroke: '#94a3b8', label: '#64748b', labelBg: '#f8fafc' };
}

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

interface Dependency {
  sourceId: string;
  targetId: string;
  type: string;
  createdAt: string;
  createdBy: string;
  metadata?: Record<string, unknown>;
}

interface DependencyListResponse {
  dependencies: Dependency[];
  dependents: Dependency[];
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

// Fetch actual dependency relationships with type information
function useDependencyList(taskId: string | null) {
  return useQuery<DependencyListResponse>({
    queryKey: ['dependencies', 'list', taskId],
    queryFn: async () => {
      const response = await fetch(`/api/dependencies/${taskId}`);
      if (!response.ok) throw new Error('Failed to fetch dependencies');
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
    onSuccess: (_data, variables) => {
      // Invalidate dependency queries to refresh the graph
      queryClient.invalidateQueries({ queryKey: ['dependencies'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      toast.success(`Dependency created`, {
        description: `Added ${variables.type} relationship`,
      });
    },
    onError: (error) => {
      toast.error('Failed to create dependency', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
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
      toast.success('Dependency removed');
    },
    onError: (error) => {
      toast.error('Failed to remove dependency', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
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
  // Handle cases where task properties may be undefined (e.g., non-task elements in dependency tree)
  const status = task.status || 'open';
  const title = task.title || task.id;
  const priority = task.priority ?? 3;
  const colors = STATUS_COLORS[status] || STATUS_COLORS.open;
  const priorityColor = PRIORITY_COLORS[priority] || PRIORITY_COLORS[3];

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
          {status.replace('_', ' ')}
        </span>
        <span className={`text-xs font-medium ${priorityColor}`}>P{priority}</span>
      </div>
      <div className="font-medium text-gray-900 text-sm leading-tight line-clamp-2">
        {title}
      </div>
      <div className="mt-1 text-xs text-gray-500 font-mono truncate">{task.id}</div>
      <Handle type="source" position={Position.Bottom} className="!bg-gray-400" />
    </div>
  );
}

// Custom edge with right-click context menu support and labels
interface CustomEdgeData extends Record<string, unknown> {
  dependencyType: string;
  editMode: boolean;
  showLabels: boolean;
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

  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const dependencyType = data?.dependencyType || 'blocks';
  const showLabels = data?.showLabels ?? true;
  const colors = getEdgeColor(dependencyType);

  // Get a short display label for the edge
  const displayLabel = dependencyType.replace('-', ' ');

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
      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        style={{ ...style, stroke: colors.stroke }}
      />
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
        data-edge-type={dependencyType}
      />
      {/* Edge label */}
      {showLabels && (
        <foreignObject
          x={labelX - 40}
          y={labelY - 10}
          width={80}
          height={20}
          style={{ overflow: 'visible', pointerEvents: 'none' }}
          data-testid="edge-label"
          data-edge-type={dependencyType}
        >
          <div
            style={{
              backgroundColor: colors.labelBg,
              color: colors.label,
              border: `1px solid ${colors.stroke}`,
            }}
            className="px-1.5 py-0.5 rounded text-[10px] font-medium text-center whitespace-nowrap"
            title={DEPENDENCY_TYPES.find(t => t.value === dependencyType)?.description || dependencyType}
          >
            {displayLabel}
          </div>
        </foreignObject>
      )}
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
  showEdgeLabels: boolean;
}

// Layout types for auto-layout
type LayoutDirection = 'TB' | 'LR' | 'BT' | 'RL';
type LayoutAlgorithm = 'hierarchical' | 'force' | 'radial';

interface LayoutOptions {
  algorithm: LayoutAlgorithm;
  direction: LayoutDirection;
  nodeSpacing: number;
  rankSpacing: number;
}

// Default layout options
const DEFAULT_LAYOUT_OPTIONS: LayoutOptions = {
  algorithm: 'hierarchical',
  direction: 'TB',
  nodeSpacing: 80,
  rankSpacing: 150,
};

// Layout direction labels
const DIRECTION_LABELS: Record<LayoutDirection, { label: string; icon: typeof ArrowDown }> = {
  'TB': { label: 'Top to Bottom', icon: ArrowDown },
  'LR': { label: 'Left to Right', icon: ArrowRight },
  'BT': { label: 'Bottom to Top', icon: ArrowUp },
  'RL': { label: 'Right to Left', icon: ArrowLeft },
};

// Layout algorithm labels
const ALGORITHM_LABELS: Record<LayoutAlgorithm, { label: string; description: string }> = {
  'hierarchical': { label: 'Hierarchical', description: 'Tree-style layout based on dependency direction' },
  'force': { label: 'Force-Directed', description: 'Physics-based layout for graphs without clear hierarchy' },
  'radial': { label: 'Radial', description: 'Root node in center, dependencies radiating outward' },
};

// Load layout options from localStorage
function loadLayoutOptions(): LayoutOptions {
  try {
    const saved = localStorage.getItem('dependency-graph-layout');
    if (saved) {
      const parsed = JSON.parse(saved);
      return { ...DEFAULT_LAYOUT_OPTIONS, ...parsed };
    }
  } catch {
    // Ignore parse errors
  }
  return DEFAULT_LAYOUT_OPTIONS;
}

// Save layout options to localStorage
function saveLayoutOptions(options: LayoutOptions): void {
  try {
    localStorage.setItem('dependency-graph-layout', JSON.stringify(options));
  } catch {
    // Ignore storage errors
  }
}

// Apply auto-layout to nodes using dagre
function applyDagreLayout(
  nodes: Node<TaskNodeData>[],
  edges: Edge[],
  options: LayoutOptions
): Node<TaskNodeData>[] {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));

  // Configure the graph direction
  g.setGraph({
    rankdir: options.direction,
    nodesep: options.nodeSpacing,
    ranksep: options.rankSpacing,
    marginx: 50,
    marginy: 50,
  });

  // Add nodes to dagre
  const nodeWidth = 200;
  const nodeHeight = 100;
  nodes.forEach((node) => {
    g.setNode(node.id, { width: nodeWidth, height: nodeHeight });
  });

  // Add edges to dagre
  edges.forEach((edge) => {
    g.setEdge(edge.source, edge.target);
  });

  // Compute the layout
  dagre.layout(g);

  // Apply computed positions to nodes
  return nodes.map((node) => {
    const nodeWithPosition = g.node(node.id);
    if (nodeWithPosition) {
      return {
        ...node,
        position: {
          x: nodeWithPosition.x - nodeWidth / 2,
          y: nodeWithPosition.y - nodeHeight / 2,
        },
      };
    }
    return node;
  });
}

// Apply force-directed layout (simulation-based positioning)
function applyForceLayout(
  nodes: Node<TaskNodeData>[],
  edges: Edge[],
  options: LayoutOptions
): Node<TaskNodeData>[] {
  // For force-directed layout, we use a simple spring-force simulation
  // This is a basic implementation; for more sophisticated layouts, use a library like d3-force
  const positions = new Map<string, { x: number; y: number; vx: number; vy: number }>();

  // Initialize positions in a grid
  const gridSize = Math.ceil(Math.sqrt(nodes.length));
  nodes.forEach((node, i) => {
    const row = Math.floor(i / gridSize);
    const col = i % gridSize;
    positions.set(node.id, {
      x: col * options.nodeSpacing * 2 + Math.random() * 50,
      y: row * options.rankSpacing + Math.random() * 50,
      vx: 0,
      vy: 0,
    });
  });

  // Build adjacency for repulsion calculation
  const edgeMap = new Map<string, Set<string>>();
  edges.forEach((edge) => {
    if (!edgeMap.has(edge.source)) edgeMap.set(edge.source, new Set());
    if (!edgeMap.has(edge.target)) edgeMap.set(edge.target, new Set());
    edgeMap.get(edge.source)!.add(edge.target);
    edgeMap.get(edge.target)!.add(edge.source);
  });

  // Run simulation for a fixed number of iterations
  const iterations = 50;
  const springStrength = 0.1;
  const repulsionStrength = 5000;
  const dampening = 0.9;

  for (let iter = 0; iter < iterations; iter++) {
    // Calculate forces
    const nodeList = Array.from(positions.entries());

    // Repulsion between all nodes
    for (let i = 0; i < nodeList.length; i++) {
      const [id1, pos1] = nodeList[i];
      for (let j = i + 1; j < nodeList.length; j++) {
        const [id2, pos2] = nodeList[j];
        const dx = pos1.x - pos2.x;
        const dy = pos1.y - pos2.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = repulsionStrength / (dist * dist);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        pos1.vx += fx;
        pos1.vy += fy;
        pos2.vx -= fx;
        pos2.vy -= fy;
        positions.set(id1, pos1);
        positions.set(id2, pos2);
      }
    }

    // Spring attraction along edges
    edges.forEach((edge) => {
      const pos1 = positions.get(edge.source);
      const pos2 = positions.get(edge.target);
      if (pos1 && pos2) {
        const dx = pos2.x - pos1.x;
        const dy = pos2.y - pos1.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = (dist - options.rankSpacing) * springStrength;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        pos1.vx += fx;
        pos1.vy += fy;
        pos2.vx -= fx;
        pos2.vy -= fy;
        positions.set(edge.source, pos1);
        positions.set(edge.target, pos2);
      }
    });

    // Apply velocities and dampen
    positions.forEach((pos, id) => {
      pos.x += pos.vx;
      pos.y += pos.vy;
      pos.vx *= dampening;
      pos.vy *= dampening;
      positions.set(id, pos);
    });
  }

  // Apply computed positions to nodes
  return nodes.map((node) => {
    const pos = positions.get(node.id);
    if (pos) {
      return {
        ...node,
        position: { x: pos.x, y: pos.y },
      };
    }
    return node;
  });
}

// Apply radial layout (root in center, dependencies radiating outward)
function applyRadialLayout(
  nodes: Node<TaskNodeData>[],
  edges: Edge[],
  options: LayoutOptions
): Node<TaskNodeData>[] {
  // Find the root node (marked in data)
  const rootNode = nodes.find((n) => (n.data as TaskNodeData).isRoot);
  if (!rootNode || nodes.length <= 1) {
    // Fallback to dagre if no root or single node
    return applyDagreLayout(nodes, edges, options);
  }

  // Build adjacency list for BFS
  const adjacency = new Map<string, string[]>();
  nodes.forEach((n) => adjacency.set(n.id, []));
  edges.forEach((edge) => {
    if (adjacency.has(edge.source)) {
      adjacency.get(edge.source)!.push(edge.target);
    }
    if (adjacency.has(edge.target)) {
      adjacency.get(edge.target)!.push(edge.source);
    }
  });

  // BFS from root to assign levels
  const levels = new Map<string, number>();
  const queue: string[] = [rootNode.id];
  levels.set(rootNode.id, 0);

  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentLevel = levels.get(current)!;
    const neighbors = adjacency.get(current) || [];

    for (const neighbor of neighbors) {
      if (!levels.has(neighbor)) {
        levels.set(neighbor, currentLevel + 1);
        queue.push(neighbor);
      }
    }
  }

  // Group nodes by level
  const nodesByLevel = new Map<number, string[]>();
  let maxLevel = 0;
  levels.forEach((level, id) => {
    if (!nodesByLevel.has(level)) nodesByLevel.set(level, []);
    nodesByLevel.get(level)!.push(id);
    maxLevel = Math.max(maxLevel, level);
  });

  // Position nodes in concentric circles
  const positions = new Map<string, { x: number; y: number }>();
  const centerX = 0;
  const centerY = 0;

  // Root at center
  positions.set(rootNode.id, { x: centerX, y: centerY });

  // Other levels in concentric circles
  for (let level = 1; level <= maxLevel; level++) {
    const nodesAtLevel = nodesByLevel.get(level) || [];
    const radius = level * options.rankSpacing;
    const angleStep = (2 * Math.PI) / nodesAtLevel.length;

    nodesAtLevel.forEach((id, index) => {
      const angle = index * angleStep - Math.PI / 2; // Start from top
      positions.set(id, {
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle),
      });
    });
  }

  // Apply positions to nodes
  return nodes.map((node) => {
    const pos = positions.get(node.id);
    if (pos) {
      return {
        ...node,
        position: { x: pos.x - 100, y: pos.y - 50 }, // Offset by half node size
      };
    }
    return node;
  });
}

// Main layout function that dispatches to the appropriate algorithm
function applyAutoLayout(
  nodes: Node<TaskNodeData>[],
  edges: Edge[],
  options: LayoutOptions
): Node<TaskNodeData>[] {
  if (nodes.length === 0) return nodes;

  switch (options.algorithm) {
    case 'force':
      return applyForceLayout(nodes, edges, options);
    case 'radial':
      return applyRadialLayout(nodes, edges, options);
    case 'hierarchical':
    default:
      return applyDagreLayout(nodes, edges, options);
  }
}

// Build a map of dependency types for quick lookup
function buildDependencyTypeMap(depList: DependencyListResponse | undefined): Map<string, string> {
  const typeMap = new Map<string, string>();
  if (!depList) return typeMap;

  // Map dependencies (outgoing from selected node)
  for (const dep of depList.dependencies) {
    const key = `${dep.sourceId}->${dep.targetId}`;
    typeMap.set(key, dep.type);
  }

  // Map dependents (incoming to selected node)
  for (const dep of depList.dependents) {
    const key = `${dep.sourceId}->${dep.targetId}`;
    typeMap.set(key, dep.type);
  }

  return typeMap;
}

function buildGraphFromTree(
  tree: DependencyTree,
  options: GraphOptions,
  onDeleteEdge: (sourceId: string, targetId: string, type: string) => void,
  dependencyTypeMap: Map<string, string>
): { nodes: Node<TaskNodeData>[]; edges: Edge[] } {
  const nodes: Node<TaskNodeData>[] = [];
  const edges: Edge<CustomEdgeData>[] = [];
  const visited = new Set<string>();

  const { searchQuery, statusFilter, selectedNodeId, editMode, showEdgeLabels } = options;
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
      const edgeId = `${node.element.id}->${dep.element.id}`;
      const depType = dependencyTypeMap.get(edgeId) || 'blocks';
      const edgeColors = getEdgeColor(depType);
      edges.push({
        id: edgeId,
        source: node.element.id,
        target: dep.element.id,
        type: 'custom', // Always use custom edge to show labels and colors
        animated: true,
        markerEnd: { type: MarkerType.ArrowClosed, color: edgeColors.stroke },
        style: { stroke: edgeColors.stroke },
        data: {
          dependencyType: depType,
          editMode: editMode,
          showLabels: showEdgeLabels,
          onDelete: onDeleteEdge,
        },
      });
    });

    // Process dependents (nodes that depend on this task - below)
    node.dependents.forEach((dep, i) => {
      if (!visited.has(dep.element.id)) {
        processNode(dep, level + 1, position + i - Math.floor(node.dependents.length / 2), 'down');
      }
      const edgeId = `${dep.element.id}->${node.element.id}`;
      const depType = dependencyTypeMap.get(edgeId) || 'blocks';
      const edgeColors = getEdgeColor(depType);
      edges.push({
        id: edgeId,
        source: dep.element.id,
        target: node.element.id,
        type: 'custom', // Always use custom edge to show labels and colors
        animated: true,
        markerEnd: { type: MarkerType.ArrowClosed, color: edgeColors.stroke },
        style: { stroke: edgeColors.stroke },
        data: {
          dependencyType: depType,
          editMode: editMode,
          showLabels: showEdgeLabels,
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
          {isLoading ? (
            <Loader2 className="w-5 h-5 text-purple-600 animate-spin" />
          ) : (
            <Link2 className="w-5 h-5 text-purple-600" />
          )}
          <h3 className="font-medium text-gray-900">
            {isLoading ? 'Creating dependency...' : 'Add Dependency'}
          </h3>
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
  showEdgeLabels,
  onToggleEdgeLabels,
  layoutOptions,
  onLayoutChange,
  onApplyLayout,
  isLayouting,
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
  showEdgeLabels: boolean;
  onToggleEdgeLabels: () => void;
  layoutOptions: LayoutOptions;
  onLayoutChange: (options: Partial<LayoutOptions>) => void;
  onApplyLayout: () => void;
  isLayouting: boolean;
}) {
  const [showStatusFilter, setShowStatusFilter] = useState(false);
  const [showLayoutDropdown, setShowLayoutDropdown] = useState(false);
  const [showSpacingControls, setShowSpacingControls] = useState(false);
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

      {/* Layout Controls and Zoom Controls */}
      <div className="flex items-center gap-1 ml-auto">
        {/* Auto Layout Button with Dropdown */}
        <div className="relative">
          <div className="flex items-center">
            <button
              onClick={onApplyLayout}
              disabled={isLayouting}
              className={`
                flex items-center gap-1.5 px-3 py-2 text-sm border border-r-0 rounded-l-lg transition-colors
                ${isLayouting
                  ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                }
              `}
              title="Apply auto layout"
              data-testid="auto-layout-button"
            >
              {isLayouting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <LayoutGrid className="w-4 h-4" />
              )}
              <span className="hidden sm:inline">Auto Layout</span>
            </button>
            <button
              onClick={() => setShowLayoutDropdown(!showLayoutDropdown)}
              className="px-2 py-2 border border-gray-300 rounded-r-lg bg-white text-gray-700 hover:bg-gray-50 transition-colors"
              data-testid="layout-options-dropdown-toggle"
            >
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>
          {showLayoutDropdown && (
            <div
              className="absolute top-full right-0 mt-1 w-72 bg-white border border-gray-200 rounded-lg shadow-lg z-50"
              data-testid="layout-options-dropdown"
            >
              <div className="p-3 space-y-4">
                {/* Algorithm Selection */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                    Layout Algorithm
                  </label>
                  <div className="space-y-1">
                    {(Object.entries(ALGORITHM_LABELS) as [LayoutAlgorithm, typeof ALGORITHM_LABELS[LayoutAlgorithm]][]).map(([algo, { label, description }]) => (
                      <button
                        key={algo}
                        onClick={() => onLayoutChange({ algorithm: algo })}
                        className={`
                          w-full text-left px-3 py-2 rounded-md text-sm transition-colors
                          ${layoutOptions.algorithm === algo
                            ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200'
                            : 'hover:bg-gray-50 text-gray-700'
                          }
                        `}
                        data-testid={`layout-algorithm-${algo}`}
                      >
                        <div className="font-medium">{label}</div>
                        <div className="text-xs text-gray-500">{description}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Direction Selection (only for hierarchical) */}
                {layoutOptions.algorithm === 'hierarchical' && (
                  <div>
                    <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                      Direction
                    </label>
                    <div className="flex gap-1">
                      {(Object.entries(DIRECTION_LABELS) as [LayoutDirection, typeof DIRECTION_LABELS[LayoutDirection]][]).map(([dir, { label, icon: Icon }]) => (
                        <button
                          key={dir}
                          onClick={() => onLayoutChange({ direction: dir })}
                          className={`
                            flex-1 flex items-center justify-center gap-1 px-2 py-2 rounded-md text-sm transition-colors
                            ${layoutOptions.direction === dir
                              ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200'
                              : 'hover:bg-gray-50 text-gray-700 border border-gray-200'
                            }
                          `}
                          title={label}
                          data-testid={`layout-direction-${dir}`}
                        >
                          <Icon className="w-4 h-4" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Spacing Controls */}
                <div>
                  <button
                    onClick={() => setShowSpacingControls(!showSpacingControls)}
                    className="flex items-center gap-2 text-xs font-medium text-gray-500 uppercase tracking-wide hover:text-gray-700"
                    data-testid="toggle-spacing-controls"
                  >
                    <SlidersHorizontal className="w-3 h-3" />
                    Spacing
                    <ChevronDown className={`w-3 h-3 transition-transform ${showSpacingControls ? 'rotate-180' : ''}`} />
                  </button>
                  {showSpacingControls && (
                    <div className="mt-2 space-y-3">
                      <div>
                        <label className="flex items-center justify-between text-xs text-gray-600 mb-1">
                          <span>Node Spacing</span>
                          <span className="font-mono">{layoutOptions.nodeSpacing}px</span>
                        </label>
                        <input
                          type="range"
                          min="40"
                          max="200"
                          step="10"
                          value={layoutOptions.nodeSpacing}
                          onChange={(e) => onLayoutChange({ nodeSpacing: parseInt(e.target.value) })}
                          className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                          data-testid="node-spacing-slider"
                        />
                      </div>
                      <div>
                        <label className="flex items-center justify-between text-xs text-gray-600 mb-1">
                          <span>Rank Spacing</span>
                          <span className="font-mono">{layoutOptions.rankSpacing}px</span>
                        </label>
                        <input
                          type="range"
                          min="80"
                          max="300"
                          step="10"
                          value={layoutOptions.rankSpacing}
                          onChange={(e) => onLayoutChange({ rankSpacing: parseInt(e.target.value) })}
                          className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                          data-testid="rank-spacing-slider"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Apply Button */}
                <button
                  onClick={() => {
                    onApplyLayout();
                    setShowLayoutDropdown(false);
                  }}
                  disabled={isLayouting}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  data-testid="apply-layout-button"
                >
                  {isLayouting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Applying...
                    </>
                  ) : (
                    <>
                      <LayoutGrid className="w-4 h-4" />
                      Apply Layout
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="w-px h-4 bg-gray-300 mx-1" />

        {/* Edge Labels Toggle */}
        <button
          onClick={onToggleEdgeLabels}
          className={`
            p-2 rounded-lg transition-colors
            ${showEdgeLabels
              ? 'text-blue-600 bg-blue-50 hover:bg-blue-100'
              : 'text-gray-600 hover:text-gray-800 hover:bg-gray-100'
            }
          `}
          title={showEdgeLabels ? 'Hide edge labels' : 'Show edge labels'}
          data-testid="toggle-edge-labels-button"
        >
          <Tag className="w-4 h-4" />
        </button>
        <div className="w-px h-4 bg-gray-300 mx-1" />
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
  showEdgeLabels: boolean;
  onToggleEdgeLabels: () => void;
  layoutOptions: LayoutOptions;
  onLayoutChange: (options: Partial<LayoutOptions>) => void;
  onApplyLayout: () => void;
  isLayouting: boolean;
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
  showEdgeLabels,
  onToggleEdgeLabels,
  layoutOptions,
  onLayoutChange,
  onApplyLayout,
  isLayouting,
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
        showEdgeLabels={showEdgeLabels}
        onToggleEdgeLabels={onToggleEdgeLabels}
        layoutOptions={layoutOptions}
        onLayoutChange={onLayoutChange}
        onApplyLayout={onApplyLayout}
        isLayouting={isLayouting}
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
  // Track this dashboard section visit
  useTrackDashboardSection('dependencies');

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

  // Edge label visibility state (default: true)
  const [showEdgeLabels, setShowEdgeLabels] = useState(true);

  // Layout state (persisted in localStorage)
  const [layoutOptions, setLayoutOptions] = useState<LayoutOptions>(loadLayoutOptions);
  const [isLayouting, setIsLayouting] = useState(false);

  // Handle layout option changes
  const handleLayoutChange = useCallback((newOptions: Partial<LayoutOptions>) => {
    setLayoutOptions(prev => {
      const updated = { ...prev, ...newOptions };
      saveLayoutOptions(updated);
      return updated;
    });
  }, []);

  // Apply auto-layout to nodes
  const handleApplyLayout = useCallback(() => {
    if (nodes.length === 0) return;

    setIsLayouting(true);

    // Use requestAnimationFrame to allow the loading state to render
    requestAnimationFrame(() => {
      const layoutedNodes = applyAutoLayout(nodes, edges, layoutOptions);

      // Animate to new positions by setting nodes with transitions
      // React Flow will handle the smooth transition if we use setNodes
      setNodes(layoutedNodes);

      // Fit view after layout with a small delay for animation
      setTimeout(() => {
        setIsLayouting(false);
      }, 300);
    });
  }, [nodes, edges, layoutOptions, setNodes]);

  const readyTasks = useReadyTasks();
  const blockedTasks = useBlockedTasks();
  const dependencyTree = useDependencyTree(selectedTaskId);
  const dependencyList = useDependencyList(selectedTaskId);
  const addDependency = useAddDependency();
  const removeDependency = useRemoveDependency();

  // Build dependency type map for looking up actual types
  const dependencyTypeMap = useMemo(() => {
    return buildDependencyTypeMap(dependencyList.data);
  }, [dependencyList.data]);

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
        { searchQuery, statusFilter, selectedNodeId: selectedSourceNode?.id || null, editMode, showEdgeLabels },
        handleDeleteEdge,
        dependencyTypeMap
      );
      setNodes(newNodes);
      setEdges(newEdges);
    } else {
      setNodes([]);
      setEdges([]);
    }
  }, [dependencyTree.data, dependencyTypeMap, searchQuery, statusFilter, editMode, showEdgeLabels, selectedSourceNode, setNodes, setEdges, handleDeleteEdge]);

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
              showEdgeLabels={showEdgeLabels}
              onToggleEdgeLabels={() => setShowEdgeLabels(prev => !prev)}
              layoutOptions={layoutOptions}
              onLayoutChange={handleLayoutChange}
              onApplyLayout={handleApplyLayout}
              isLayouting={isLayouting}
            />
          </ReactFlowProvider>
        </div>
      )}

      {/* Legend */}
      <div className="mt-4 space-y-2">
        {/* Status Legend */}
        <div className="flex items-center gap-6 text-sm text-gray-600">
          <span className="font-medium">Status:</span>
          {Object.entries(STATUS_COLORS).map(([status, colors]) => (
            <div key={status} className="flex items-center gap-1">
              <div className={`w-3 h-3 rounded border ${colors.bg} ${colors.border}`} />
              <span className="capitalize">{status.replace('_', ' ')}</span>
            </div>
          ))}
        </div>
        {/* Edge Type Legend */}
        <div className="flex items-center gap-4 text-sm text-gray-600 flex-wrap" data-testid="edge-type-legend">
          <span className="font-medium">Edge Types:</span>
          {Object.entries(EDGE_TYPE_COLORS).map(([type, colors]) => (
            <div key={type} className="flex items-center gap-1.5" data-testid={`edge-legend-${type}`}>
              <div
                className="w-4 h-0.5"
                style={{ backgroundColor: colors.stroke }}
              />
              <span className="capitalize">{type.replace('-', ' ')}</span>
            </div>
          ))}
        </div>
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

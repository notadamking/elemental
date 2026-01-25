/**
 * Dependency Graph Lens
 *
 * Interactive visualization of task dependencies using React Flow.
 */

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
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
  Handle,
  Position,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Search, X, Filter, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';

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
}

function TaskNode({ data }: { data: TaskNodeData }) {
  const { task, isRoot, isHighlighted, isSearchMatch } = data;
  const colors = STATUS_COLORS[task.status] || STATUS_COLORS.open;
  const priorityColor = PRIORITY_COLORS[task.priority] || PRIORITY_COLORS[3];

  return (
    <div
      className={`
        px-4 py-3 rounded-lg border-2 shadow-sm min-w-[180px] max-w-[220px]
        ${colors.bg} ${colors.border}
        ${isRoot ? 'ring-2 ring-blue-500 ring-offset-2' : ''}
        ${isSearchMatch ? 'ring-2 ring-yellow-400 ring-offset-2 shadow-lg shadow-yellow-200' : ''}
        ${isHighlighted && !isSearchMatch ? 'opacity-100' : ''}
        ${!isHighlighted && !isSearchMatch ? 'opacity-40' : ''}
        transition-all duration-200
      `}
      data-testid="graph-node"
      data-node-id={task.id}
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

const nodeTypes: NodeTypes = {
  task: TaskNode,
};

interface GraphOptions {
  searchQuery: string;
  statusFilter: string[];
}

function buildGraphFromTree(
  tree: DependencyTree,
  options: GraphOptions
): { nodes: Node<TaskNodeData>[]; edges: Edge[] } {
  const nodes: Node<TaskNodeData>[] = [];
  const edges: Edge[] = [];
  const visited = new Set<string>();

  const { searchQuery, statusFilter } = options;
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

    nodes.push({
      id: node.element.id,
      type: 'task',
      position: { x, y },
      data: {
        task: node.element,
        isRoot: direction === 'root',
        isHighlighted: !hasAnyFilter || isMatch,
        isSearchMatch: isSearchMatch,
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
        type: 'smoothstep',
        animated: true,
        markerEnd: { type: MarkerType.ArrowClosed },
        style: { stroke: '#94a3b8' },
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
        type: 'smoothstep',
        animated: true,
        markerEnd: { type: MarkerType.ArrowClosed },
        style: { stroke: '#94a3b8' },
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

// Graph toolbar with search and filters
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
      {/* Search Input */}
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
            nodeTypes={nodeTypes}
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
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string[]>([]);

  const readyTasks = useReadyTasks();
  const blockedTasks = useBlockedTasks();
  const dependencyTree = useDependencyTree(selectedTaskId);

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

  // Update graph when dependency tree or filters change
  useEffect(() => {
    if (dependencyTree.data) {
      const { nodes: newNodes, edges: newEdges } = buildGraphFromTree(
        dependencyTree.data,
        { searchQuery, statusFilter }
      );
      setNodes(newNodes);
      setEdges(newEdges);
    } else {
      setNodes([]);
      setEdges([]);
    }
  }, [dependencyTree.data, searchQuery, statusFilter, setNodes, setEdges]);

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

  const isLoading = readyTasks.isLoading || blockedTasks.isLoading;

  return (
    <div className="h-full flex flex-col" data-testid="dependency-graph-page">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-medium text-gray-900">Dependency Graph</h2>
        <p className="text-sm text-gray-500">
          Visualize task dependencies
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
    </div>
  );
}

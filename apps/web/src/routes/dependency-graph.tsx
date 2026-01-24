/**
 * Dependency Graph Lens
 *
 * Interactive visualization of task dependencies using React Flow.
 */

import { useEffect, useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeTypes,
  Handle,
  Position,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

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
}

function TaskNode({ data }: { data: TaskNodeData }) {
  const { task, isRoot } = data;
  const colors = STATUS_COLORS[task.status] || STATUS_COLORS.open;
  const priorityColor = PRIORITY_COLORS[task.priority] || PRIORITY_COLORS[3];

  return (
    <div
      className={`
        px-4 py-3 rounded-lg border-2 shadow-sm min-w-[180px] max-w-[220px]
        ${colors.bg} ${colors.border}
        ${isRoot ? 'ring-2 ring-blue-500 ring-offset-2' : ''}
      `}
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

function buildGraphFromTree(
  tree: DependencyTree
): { nodes: Node<TaskNodeData>[]; edges: Edge[] } {
  const nodes: Node<TaskNodeData>[] = [];
  const edges: Edge[] = [];
  const visited = new Set<string>();

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

    nodes.push({
      id: node.element.id,
      type: 'task',
      position: { x, y },
      data: {
        task: node.element,
        isRoot: direction === 'root',
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

export function DependencyGraphPage() {
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<TaskNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

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

  // Update graph when dependency tree changes
  useEffect(() => {
    if (dependencyTree.data) {
      const { nodes: newNodes, edges: newEdges } = buildGraphFromTree(dependencyTree.data);
      setNodes(newNodes);
      setEdges(newEdges);
    } else {
      setNodes([]);
      setEdges([]);
    }
  }, [dependencyTree.data, setNodes, setEdges]);

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

          {/* Graph Canvas */}
          <div className="flex-1 bg-white rounded-lg border border-gray-200 overflow-hidden" data-testid="graph-canvas">
            {dependencyTree.isLoading && (
              <div className="flex items-center justify-center h-full text-gray-500">
                Loading dependency tree...
              </div>
            )}
            {dependencyTree.isError && (
              <div className="flex items-center justify-center h-full text-red-600">
                Failed to load dependency tree
              </div>
            )}
            {dependencyTree.data && nodes.length === 0 && (
              <div className="flex items-center justify-center h-full text-gray-500">
                No dependencies found for this task
              </div>
            )}
            {dependencyTree.data && nodes.length > 0 && (
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
                <Controls />
                <MiniMap
                  nodeColor={(node) => {
                    const task = (node.data as TaskNodeData).task;
                    return STATUS_COLORS[task.status]?.border.replace('border-', '#').replace('-300', '') || '#cbd5e1';
                  }}
                  maskColor="rgba(255, 255, 255, 0.8)"
                />
              </ReactFlow>
            )}
            {!dependencyTree.data && !dependencyTree.isLoading && !dependencyTree.isError && (
              <div className="flex items-center justify-center h-full text-gray-500">
                Select a task to view its dependencies
              </div>
            )}
          </div>
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

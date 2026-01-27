/**
 * Workflow Task List component displaying tasks within a workflow
 */

import { AlertCircle } from 'lucide-react';
import type { TaskType } from '../types';
import { TASK_PRIORITY_COLORS } from '../constants';

interface WorkflowTaskListProps {
  tasks: TaskType[];
}

export function WorkflowTaskList({ tasks }: WorkflowTaskListProps) {
  if (tasks.length === 0) {
    return (
      <div
        data-testid="workflow-tasks-empty"
        className="text-center py-8 text-gray-500"
      >
        <AlertCircle className="w-8 h-8 mx-auto mb-2 text-gray-400" />
        <p className="text-sm font-medium">No tasks in this workflow</p>
        <p className="text-xs text-gray-400 mt-1">
          Workflows need tasks to be useful. This state should not occur
          as workflows require at least one task to be created.
        </p>
      </div>
    );
  }

  return (
    <div data-testid="workflow-tasks-list" className="space-y-2">
      {tasks.map((task) => (
        <div
          key={task.id}
          data-testid={`workflow-task-${task.id}`}
          className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg"
        >
          <div
            className={`w-2 h-2 rounded-full ${TASK_PRIORITY_COLORS[task.priority] || 'bg-gray-200'}`}
            title={`Priority ${task.priority}`}
          />
          <a
            href={`/tasks?selected=${task.id}`}
            className="flex-1 text-sm text-gray-900 truncate hover:text-blue-600 hover:underline"
          >
            {task.title}
          </a>
          <span
            className={`text-xs px-2 py-0.5 rounded ${
              task.status === 'closed'
                ? 'bg-green-100 text-green-700'
                : task.status === 'blocked'
                  ? 'bg-red-100 text-red-700'
                  : task.status === 'in_progress'
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-gray-100 text-gray-700'
            }`}
          >
            {task.status.replace('_', ' ')}
          </span>
        </div>
      ))}
    </div>
  );
}

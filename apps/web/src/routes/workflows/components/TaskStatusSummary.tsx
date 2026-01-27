/**
 * Task Status Summary component showing task counts by status
 */

import { CheckCircle2, CircleDot, AlertCircle, ListTodo } from 'lucide-react';
import type { WorkflowProgress } from '../types';

interface TaskStatusSummaryProps {
  progress: WorkflowProgress;
}

export function TaskStatusSummary({ progress }: TaskStatusSummaryProps) {
  const items = [
    {
      label: 'Completed',
      count: progress.statusCounts['closed'] || 0,
      icon: <CheckCircle2 className="w-4 h-4 text-green-500" />,
    },
    {
      label: 'In Progress',
      count: progress.statusCounts['in_progress'] || 0,
      icon: <CircleDot className="w-4 h-4 text-blue-500" />,
    },
    {
      label: 'Blocked',
      count: progress.blockedTasks,
      icon: <AlertCircle className="w-4 h-4 text-red-500" />,
    },
    {
      label: 'Ready',
      count: progress.readyTasks,
      icon: <ListTodo className="w-4 h-4 text-gray-400" />,
    },
  ];

  return (
    <div data-testid="workflow-task-status-summary" className="grid grid-cols-2 gap-3">
      {items.map((item) => (
        <div
          key={item.label}
          className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg"
        >
          {item.icon}
          <div>
            <div className="text-lg font-semibold text-gray-900">{item.count}</div>
            <div className="text-xs text-gray-500">{item.label}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

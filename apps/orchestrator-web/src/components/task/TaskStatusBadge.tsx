/**
 * TaskStatusBadge - Displays task status with color coding
 */

import type { TaskStatus, MergeStatus } from '../../api/types';
import { getStatusDisplayName, getStatusColor } from '../../api/hooks/useTasks';

interface TaskStatusBadgeProps {
  status: TaskStatus;
  mergeStatus?: MergeStatus;
  className?: string;
}

export function TaskStatusBadge({ status, mergeStatus, className = '' }: TaskStatusBadgeProps) {
  // Show merge status for closed tasks with pending merge
  if (status === 'closed' && mergeStatus && mergeStatus !== 'merged') {
    return (
      <span
        className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ${getMergeStatusColor(mergeStatus)} ${className}`}
        data-testid="task-merge-status-badge"
      >
        {getMergeStatusDisplayName(mergeStatus)}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ${getStatusColor(status)} ${className}`}
      data-testid="task-status-badge"
    >
      {getStatusDisplayName(status)}
    </span>
  );
}

function getMergeStatusDisplayName(status: MergeStatus): string {
  switch (status) {
    case 'pending': return 'Pending Merge';
    case 'testing': return 'Testing';
    case 'merging': return 'Merging';
    case 'merged': return 'Merged';
    case 'conflict': return 'Conflict';
    case 'test_failed': return 'Tests Failed';
    case 'failed': return 'Merge Failed';
    default: return status;
  }
}

function getMergeStatusColor(status: MergeStatus): string {
  switch (status) {
    case 'pending': return 'text-purple-600 bg-purple-100 dark:text-purple-400 dark:bg-purple-900/30';
    case 'testing': return 'text-blue-600 bg-blue-100 dark:text-blue-400 dark:bg-blue-900/30';
    case 'merging': return 'text-yellow-600 bg-yellow-100 dark:text-yellow-400 dark:bg-yellow-900/30';
    case 'merged': return 'text-green-600 bg-green-100 dark:text-green-400 dark:bg-green-900/30';
    case 'conflict': return 'text-orange-600 bg-orange-100 dark:text-orange-400 dark:bg-orange-900/30';
    case 'test_failed': return 'text-red-600 bg-red-100 dark:text-red-400 dark:bg-red-900/30';
    case 'failed': return 'text-red-600 bg-red-100 dark:text-red-400 dark:bg-red-900/30';
    default: return 'text-gray-600 bg-gray-100';
  }
}

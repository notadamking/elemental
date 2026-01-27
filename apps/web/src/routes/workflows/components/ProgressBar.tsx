/**
 * Progress Bar component with completion percentage
 */

import type { WorkflowProgress } from '../types';

interface ProgressBarProps {
  progress: WorkflowProgress;
  showLabel?: boolean;
  size?: 'sm' | 'md';
}

export function ProgressBar({
  progress,
  showLabel = true,
  size = 'md',
}: ProgressBarProps) {
  const { completionPercentage, totalTasks } = progress;
  const height = size === 'sm' ? 'h-1.5' : 'h-2.5';
  const completedCount = progress.statusCounts['closed'] || 0;

  return (
    <div data-testid="workflow-progress-bar" className="flex items-center gap-2">
      <div className={`flex-1 bg-gray-200 rounded-full ${height} overflow-hidden`}>
        <div
          className={`${height} bg-green-500 rounded-full transition-all duration-300`}
          style={{ width: `${completionPercentage}%` }}
          data-testid="workflow-progress-bar-fill"
        />
      </div>
      {showLabel && (
        <span
          data-testid="workflow-progress-label"
          className="text-xs text-gray-500 whitespace-nowrap"
        >
          {completedCount}/{totalTasks} ({Math.round(completionPercentage)}%)
        </span>
      )}
    </div>
  );
}

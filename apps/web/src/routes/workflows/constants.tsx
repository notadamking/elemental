/**
 * Constants for the Workflows page
 * Status configuration and other static values
 */

import {
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Play,
} from 'lucide-react';

export interface StatusConfig {
  label: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
}

export const STATUS_CONFIG: Record<string, StatusConfig> = {
  pending: {
    label: 'Pending',
    icon: <Clock className="w-4 h-4" />,
    color: 'text-gray-600',
    bgColor: 'bg-gray-100',
  },
  running: {
    label: 'Running',
    icon: <Play className="w-4 h-4" />,
    color: 'text-blue-700',
    bgColor: 'bg-blue-100',
  },
  completed: {
    label: 'Completed',
    icon: <CheckCircle2 className="w-4 h-4" />,
    color: 'text-green-700',
    bgColor: 'bg-green-100',
  },
  failed: {
    label: 'Failed',
    icon: <AlertTriangle className="w-4 h-4" />,
    color: 'text-red-700',
    bgColor: 'bg-red-100',
  },
  cancelled: {
    label: 'Cancelled',
    icon: <XCircle className="w-4 h-4" />,
    color: 'text-orange-600',
    bgColor: 'bg-orange-100',
  },
};

export const STATUS_FILTER_OPTIONS = [
  { value: null, label: 'All' },
  { value: 'running', label: 'Running' },
  { value: 'pending', label: 'Pending' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
  { value: 'cancelled', label: 'Cancelled' },
] as const;

export const TASK_PRIORITY_COLORS: Record<number, string> = {
  1: 'bg-gray-200',
  2: 'bg-blue-200',
  3: 'bg-yellow-200',
  4: 'bg-orange-200',
  5: 'bg-red-200',
};

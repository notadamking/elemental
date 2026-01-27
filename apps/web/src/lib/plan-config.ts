/**
 * Plan Configuration - Status and view mode configurations
 *
 * Centralized configuration for plan status badges, colors, and view modes.
 */

import React from 'react';
import {
  FileEdit,
  CircleDot,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import type { ViewMode } from './plan-types';

// ============================================================================
// Status Configuration
// ============================================================================

export interface StatusConfig {
  label: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
}

export const STATUS_CONFIG: Record<string, StatusConfig> = {
  draft: {
    label: 'Draft',
    icon: React.createElement(FileEdit, { className: 'w-4 h-4' }),
    color: 'text-gray-600',
    bgColor: 'bg-gray-100',
  },
  active: {
    label: 'Active',
    icon: React.createElement(CircleDot, { className: 'w-4 h-4' }),
    color: 'text-blue-700',
    bgColor: 'bg-blue-100',
  },
  completed: {
    label: 'Completed',
    icon: React.createElement(CheckCircle2, { className: 'w-4 h-4' }),
    color: 'text-green-700',
    bgColor: 'bg-green-100',
  },
  cancelled: {
    label: 'Cancelled',
    icon: React.createElement(XCircle, { className: 'w-4 h-4' }),
    color: 'text-red-700',
    bgColor: 'bg-red-100',
  },
};

// Status colors for roadmap bars
export const STATUS_BAR_COLORS: Record<string, string> = {
  draft: '#9ca3af',     // gray-400
  active: '#3b82f6',    // blue-500
  completed: '#22c55e', // green-500
  cancelled: '#ef4444', // red-500
};

// ============================================================================
// View Mode Configuration
// ============================================================================

const VIEW_MODE_STORAGE_KEY = 'plans.viewMode';

export function getStoredViewMode(): ViewMode {
  if (typeof window === 'undefined') return 'list';
  const stored = localStorage.getItem(VIEW_MODE_STORAGE_KEY);
  return stored === 'roadmap' ? 'roadmap' : 'list';
}

export function setStoredViewMode(mode: ViewMode): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode);
}

// ============================================================================
// Priority Colors
// ============================================================================

export const PRIORITY_COLORS: Record<number, string> = {
  1: 'bg-gray-200',
  2: 'bg-blue-200',
  3: 'bg-yellow-200',
  4: 'bg-orange-200',
  5: 'bg-red-200',
};

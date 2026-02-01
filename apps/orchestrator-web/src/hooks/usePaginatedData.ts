/**
 * Client-Side Pagination Hook (TB69)
 *
 * This hook provides client-side pagination, filtering, and sorting
 * for data that's already loaded in memory (from TB67 upfront loading).
 *
 * Key features:
 * - Works with data loaded upfront via useAllElements()
 * - Applies filters, sorts, and pagination entirely client-side
 * - No additional server requests needed
 * - Compatible with existing Pagination component
 */

import { useMemo } from 'react';

// ============================================================================
// Types
// ============================================================================

export interface SortConfig<T> {
  field: keyof T | string;
  direction: 'asc' | 'desc';
}

export interface PaginationConfig {
  page: number;
  pageSize: number;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  totalPages: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

// ============================================================================
// Generic Filtering, Sorting, and Pagination
// ============================================================================

/**
 * Apply filters to data in memory
 */
export function filterData<T>(
  data: T[],
  filterFn?: (item: T) => boolean
): T[] {
  if (!filterFn) return data;
  return data.filter(filterFn);
}

/**
 * Sort data in memory
 */
export function sortData<T>(
  data: T[],
  sort?: SortConfig<T>,
  compareFn?: (a: T, b: T, field: keyof T | string, direction: 'asc' | 'desc') => number
): T[] {
  if (!sort) return data;

  const sortedData = [...data];

  sortedData.sort((a, b) => {
    // Use custom compare function if provided
    if (compareFn) {
      return compareFn(a, b, sort.field, sort.direction);
    }

    // Default comparison
    const aVal = (a as Record<string, unknown>)[sort.field as string];
    const bVal = (b as Record<string, unknown>)[sort.field as string];

    let comparison = 0;

    if (aVal === null || aVal === undefined) comparison = 1;
    else if (bVal === null || bVal === undefined) comparison = -1;
    else if (typeof aVal === 'string' && typeof bVal === 'string') {
      comparison = aVal.localeCompare(bVal);
    } else if (typeof aVal === 'number' && typeof bVal === 'number') {
      comparison = aVal - bVal;
    } else if (aVal instanceof Date && bVal instanceof Date) {
      comparison = aVal.getTime() - bVal.getTime();
    } else {
      comparison = String(aVal).localeCompare(String(bVal));
    }

    return sort.direction === 'asc' ? comparison : -comparison;
  });

  return sortedData;
}

/**
 * Paginate data in memory
 */
export function paginateData<T>(
  data: T[],
  pagination: PaginationConfig
): PaginatedResult<T> {
  const { page, pageSize } = pagination;
  const total = data.length;
  const totalPages = Math.ceil(total / pageSize);
  const offset = (page - 1) * pageSize;
  const items = data.slice(offset, offset + pageSize);
  const hasMore = page < totalPages;

  return {
    items,
    total,
    totalPages,
    page,
    pageSize,
    hasMore,
  };
}

// ============================================================================
// Main Hook
// ============================================================================

export interface UsePaginatedDataOptions<T> {
  /** Full dataset from upfront loading */
  data: T[] | undefined;
  /** Current page (1-indexed) */
  page: number;
  /** Items per page */
  pageSize: number;
  /** Filter function to apply to data */
  filterFn?: (item: T) => boolean;
  /** Sort configuration */
  sort?: SortConfig<T>;
  /** Custom sort comparison function */
  sortCompareFn?: (a: T, b: T, field: keyof T | string, direction: 'asc' | 'desc') => number;
}

/**
 * Hook for client-side pagination with filtering and sorting.
 *
 * @example
 * ```tsx
 * const { data: allTasks } = useAllTasks();
 *
 * const { items, total, totalPages } = usePaginatedData({
 *   data: allTasks,
 *   page: currentPage,
 *   pageSize: 25,
 *   filterFn: (task) => task.status === 'open',
 *   sort: { field: 'priority', direction: 'asc' },
 * });
 * ```
 */
export function usePaginatedData<T>({
  data,
  page,
  pageSize,
  filterFn,
  sort,
  sortCompareFn,
}: UsePaginatedDataOptions<T>): PaginatedResult<T> & { isLoading: boolean; filteredTotal: number; allItems: T[] } {
  const result = useMemo(() => {
    if (!data) {
      return {
        items: [] as T[],
        allItems: [] as T[],
        total: 0,
        totalPages: 0,
        page: 1,
        pageSize,
        hasMore: false,
        filteredTotal: 0,
      };
    }

    // Step 1: Filter
    const filtered = filterData(data, filterFn);

    // Step 2: Sort
    const sorted = sortData(filtered, sort, sortCompareFn);

    // Step 3: Paginate
    const paginated = paginateData(sorted, { page, pageSize });

    return {
      ...paginated,
      allItems: sorted,
      filteredTotal: filtered.length,
    };
  }, [data, page, pageSize, filterFn, sort, sortCompareFn]);

  return {
    ...result,
    isLoading: data === undefined,
  };
}

// ============================================================================
// Channel-Specific Filtering Utilities
// ============================================================================

export interface ChannelFilterConfig {
  search?: string;
  channelType?: 'all' | 'group' | 'direct';
}

export function createChannelFilter(filters: ChannelFilterConfig): ((channel: {
  name: string;
  channelType: string;
}) => boolean) | undefined {
  const hasFilters =
    filters.search ||
    (filters.channelType && filters.channelType !== 'all');

  if (!hasFilters) return undefined;

  return (channel) => {
    // Search filter (name)
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      if (!channel.name.toLowerCase().includes(searchLower)) return false;
    }

    // Channel type filter
    if (filters.channelType && filters.channelType !== 'all') {
      if (channel.channelType !== filters.channelType) return false;
    }

    return true;
  };
}

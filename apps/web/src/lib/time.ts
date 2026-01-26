/**
 * Time utility functions for displaying relative times and grouping by time periods
 * TB94: Inbox Time-Ago Indicator
 */

/**
 * Time period categories for grouping messages
 */
export type TimePeriod = 'today' | 'yesterday' | 'this-week' | 'earlier';

/**
 * Time period display labels
 */
export const TIME_PERIOD_LABELS: Record<TimePeriod, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  'this-week': 'This Week',
  earlier: 'Earlier',
};

/**
 * Determines which time period a date falls into
 */
export function getTimePeriod(date: Date | string): TimePeriod {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();

  // Reset times to start of day for comparison
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - 6); // Last 7 days including today

  if (d >= todayStart) {
    return 'today';
  } else if (d >= yesterdayStart) {
    return 'yesterday';
  } else if (d >= weekStart) {
    return 'this-week';
  } else {
    return 'earlier';
  }
}

/**
 * Groups items by time period based on their date field
 * Returns items in the same order but with group information
 */
export interface GroupedItem<T> {
  item: T;
  period: TimePeriod;
  isFirstInGroup: boolean;
}

export function groupByTimePeriod<T>(
  items: T[],
  getDate: (item: T) => string | Date
): GroupedItem<T>[] {
  const result: GroupedItem<T>[] = [];
  let lastPeriod: TimePeriod | null = null;

  for (const item of items) {
    const date = getDate(item);
    const period = getTimePeriod(date);
    const isFirstInGroup = period !== lastPeriod;

    result.push({
      item,
      period,
      isFirstInGroup,
    });

    lastPeriod = period;
  }

  return result;
}

/**
 * Formats a date as a relative time string
 * Updates granularity based on how old the date is:
 * - < 1 min: "just now"
 * - < 1 hour: "Xm ago"
 * - < 24 hours: "Xh ago"
 * - < 7 days: "Xd ago"
 * - Otherwise: "Jan 15" (short date format)
 */
export function formatRelativeTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diff = now.getTime() - d.getTime();

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) {
    return 'just now';
  }
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  if (hours < 24) {
    return `${hours}h ago`;
  }
  if (days === 1) {
    return 'Yesterday';
  }
  if (days < 7) {
    return `${days}d ago`;
  }

  // For older dates, show the actual date
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Formats a date as a compact relative time string (for list items)
 * - < 1 min: "now"
 * - < 1 hour: "Xm"
 * - < 24 hours: "Xh"
 * - < 7 days: "Xd"
 * - Otherwise: "Jan 15"
 */
export function formatCompactTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diff = now.getTime() - d.getTime();

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) {
    return 'now';
  }
  if (minutes < 60) {
    return `${minutes}m`;
  }
  if (hours < 24) {
    return `${hours}h`;
  }
  if (days < 7) {
    return `${days}d`;
  }

  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Gets the appropriate update interval for a given date
 * - Recent (< 1 hour): update every minute (60000ms)
 * - Today: update every 5 minutes (300000ms)
 * - Older: update every hour (3600000ms)
 */
export function getUpdateInterval(date: Date | string): number {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diff = now.getTime() - d.getTime();

  const hours = Math.floor(diff / 3600000);

  if (hours < 1) {
    return 60000; // 1 minute
  }
  if (hours < 24) {
    return 300000; // 5 minutes
  }
  return 3600000; // 1 hour
}

/**
 * Calculates the next update interval based on the oldest "recent" item
 * If most items are old, returns a longer interval
 */
export function getSmartUpdateInterval(dates: (Date | string)[]): number {
  if (dates.length === 0) return 3600000; // 1 hour default

  // Find the most recent date
  let mostRecent = new Date(0);
  for (const date of dates) {
    const d = typeof date === 'string' ? new Date(date) : date;
    if (d > mostRecent) {
      mostRecent = d;
    }
  }

  return getUpdateInterval(mostRecent);
}

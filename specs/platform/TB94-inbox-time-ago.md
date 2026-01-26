# TB94: Inbox Time-Ago Indicator

## Purpose

Provide a clear, user-friendly time display for inbox messages that shows relative times ("2m ago", "1h ago") and groups messages by time periods (Today, Yesterday, This Week, Earlier) with sticky headers for easy navigation.

## Features

### 1. Relative Time Display

Messages in the inbox display their timestamp as relative times:

- **Just now**: < 1 minute ago → "now"
- **Minutes**: 1-59 minutes → "5m"
- **Hours**: 1-23 hours → "3h"
- **Days**: 1-6 days → "2d"
- **Older**: 7+ days → "Jan 15" (short date format)

### 2. Periodic Time Updates

The relative times update automatically without requiring page refresh:

- **Recent messages** (< 1 hour): Update every minute (60000ms)
- **Today's messages**: Update every 5 minutes (300000ms)
- **Older messages**: Update every hour (3600000ms)

The implementation uses a `timeUpdateTrigger` state that increments every minute, causing re-renders that recalculate the displayed times.

### 3. Time Period Grouping

Messages are grouped by time period with sticky headers:

| Period | Description |
|--------|-------------|
| **Today** | Messages from today (after midnight) |
| **Yesterday** | Messages from yesterday |
| **This Week** | Messages from the last 7 days (excluding today/yesterday) |
| **Earlier** | Messages older than 7 days |

#### Grouping Rules

- Headers are only shown when sorted by date (newest or oldest)
- Headers are hidden when sorted by sender
- Each time period shows at most one header (the first item in that group)
- Headers have sticky positioning within the scroll container

## Implementation

### Files Changed/Created

| File | Purpose |
|------|---------|
| `apps/web/src/lib/time.ts` | Time utility functions for formatting and grouping |
| `apps/web/src/hooks/useRelativeTime.ts` | React hooks for periodic time updates |
| `apps/web/src/routes/entities.tsx` | Updated inbox rendering with grouping and time display |
| `apps/web/tests/tb94-inbox-time-ago.spec.ts` | Playwright tests |

### Key Functions

```typescript
// Format time as compact string
formatCompactTime(date: Date | string): string
// Returns: "now", "5m", "3h", "2d", or "Jan 15"

// Get time period for grouping
getTimePeriod(date: Date | string): TimePeriod
// Returns: "today", "yesterday", "this-week", or "earlier"

// Group items by time period
groupByTimePeriod<T>(items: T[], getDate: (item: T) => string | Date): GroupedItem<T>[]
// Returns items with period and isFirstInGroup metadata
```

### Component: InboxTimePeriodHeader

```tsx
function InboxTimePeriodHeader({ period }: { period: TimePeriod }) {
  return (
    <div className="sticky top-0 z-10 px-3 py-1.5 bg-gray-100 ...">
      <Calendar className="w-3 h-3 text-gray-500" />
      <span className="text-xs font-semibold text-gray-600 uppercase">
        {TIME_PERIOD_LABELS[period]}
      </span>
    </div>
  );
}
```

## Test Coverage

| Test | Description |
|------|-------------|
| Time period headers visible | Shows headers when sorted by date |
| Headers hidden for sender sort | No headers when sorted by sender |
| Correct header labels | "Today", "Yesterday", "This Week", "Earlier" |
| Time display present | Each inbox item shows time |
| Sticky header positioning | Headers have `position: sticky` |
| formatCompactTime formats | Correct output for various time deltas |
| getTimePeriod categorization | Correct period assignment |

## Data Flow

```
1. Inbox items fetched from API
   ↓
2. Items filtered by source type (all/direct/mention)
   ↓
3. Items sorted by date or sender
   ↓
4. If sorted by date: groupByTimePeriod() adds period metadata
   ↓
5. VirtualizedList renders items with conditional headers
   ↓
6. timeUpdateTrigger increments every 60s → re-render → times update
```

## LocalStorage Keys

None (time display doesn't persist state; filter/sort preferences are handled by TB93)

## Accessibility

- Time period headers have semantic grouping via styling
- Calendar icon provides visual indicator
- High contrast text (gray-600 on gray-100 background)
- Uppercase text improves scanability

## Related Specifications

- [TB91: Inbox Message Summary Sidebar](./TB91-inbox-split-layout.md) - Split layout structure
- [TB93: Inbox Filtering and Sorting](./TB93-inbox-filtering-sorting.md) - Sort order affects grouping

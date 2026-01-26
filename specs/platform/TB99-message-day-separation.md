# TB99: Message Day Separation Specification

**Status:** Implemented
**Last Updated:** 2026-01-26

## Purpose

Group messages in channel views by day with clear visual separator headers, improving message organization and time context for users scanning through conversations.

## Design

### Date Separator Display

Date separators show between messages from different days:
- **Today**: "Today"
- **Yesterday**: "Yesterday"
- **Older dates**: Full format "Monday, January 15"

### Separator Styling

```
[────────────────── 📅 Today ──────────────────]
```

- Horizontal lines on both sides (h-px, bg-gray-200)
- Center pill with Calendar icon and date label
- Gray-100 background with rounded-full styling
- Small, unobtrusive text (text-xs, font-medium, text-gray-600)

### Implementation Details

1. **Time Utilities** (`apps/web/src/lib/time.ts`)
   - `getDateKey(date)` - Returns YYYY-MM-DD key for grouping
   - `formatDateSeparator(date)` - Returns display label
   - `groupMessagesByDay(items, getDate)` - Groups items with `isFirstInDay` flags

2. **DateSeparator Component** (`apps/web/src/routes/messages.tsx`)
   - Accepts `date` string (formatted label)
   - Renders calendar icon, label, and horizontal lines

3. **ChannelView Integration**
   - Messages grouped using `groupMessagesByDay(rootMessages, msg => msg.createdAt)`
   - Both virtualized (>100 messages) and non-virtualized lists supported
   - Virtualized list adjusts estimateSize for items with separators

## Files Modified

- `apps/web/src/lib/time.ts` - Added date grouping utilities
- `apps/web/src/lib/index.ts` - Exported new utilities
- `apps/web/src/routes/messages.tsx` - Added DateSeparator component and integration

## Testing

8 Playwright tests in `apps/web/tests/tb99-message-day-separation.spec.ts`:
- Messages list displays date separators
- Date separator displays correct label (Today, Yesterday, or full date)
- Date separator includes calendar icon
- Date separator styling has correct appearance (horizontal lines)
- Each unique day has exactly one date separator
- Messages are grouped under their date separator
- Date separator "Today" shows for messages from today
- Date separator is consistent in both virtualized and non-virtualized lists

## Technical Notes

### Virtualization Support

For large message lists (>100 messages), the VirtualizedList component is used. The `estimateSize` function accounts for date separator height:

```typescript
estimateSize={(index) =>
  groupedMessages[index]?.isFirstInDay
    ? MESSAGE_ROW_HEIGHT + 48
    : MESSAGE_ROW_HEIGHT
}
```

### Date Grouping Algorithm

The `groupMessagesByDay` function:
1. Iterates through messages in order
2. Computes date key (YYYY-MM-DD) for each message
3. Marks first message of each day with `isFirstInDay: true`
4. Returns array with grouping metadata

### Future Enhancements (Deferred)

- Sticky date header while scrolling (would require scroll event handling and position tracking)
- Click date separator to jump to that day
- Collapse/expand messages by day

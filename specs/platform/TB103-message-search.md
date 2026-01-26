# TB103: Message Search

## Purpose

Enable users to search messages within channels and globally across the application. This feature helps users quickly find specific messages, navigate to them, and includes highlighting for search matches.

## Features

### Channel-Level Message Search
- Search input in channel header
- Real-time search with debouncing (300ms)
- Results dropdown with sender, timestamp, and snippet preview
- Keyboard navigation (arrow keys, Enter, Escape)
- Click-to-scroll-and-highlight functionality
- Clear button to reset search
- Keyboard shortcut: Cmd/Ctrl+F to focus search

### Search Results Display
- Message sender name with avatar
- Timestamp (time for today, date for older messages)
- Content snippet with highlighted match text
- Results limited to 50 per search
- Loading state indicator
- Empty state for no matches

### Message Highlighting
- Selected message scrolls into view (smooth scroll, centered)
- Yellow highlight ring appears for 2 seconds
- Highlight fades automatically

### Global Message Search (Command Palette)
- "Search Messages" command in command palette
- Searches across all channels
- Navigate to message location on selection

## Implementation

### Server Endpoint

```
GET /api/messages/search
```

Query parameters:
- `q`: Search query (required)
- `channelId`: Optional - limit search to specific channel
- `limit`: Max results (default: 20)

Response:
```typescript
interface MessageSearchResponse {
  results: MessageSearchResult[];
  query: string;
}

interface MessageSearchResult {
  id: string;
  channelId: string;
  sender: string;
  content: string;
  snippet: string;  // Context around match, cleaned of markdown
  createdAt: string;
  threadId: string | null;
}
```

### Client Components

1. **useMessageSearch hook**: Debounced search query hook
2. **MessageSearchDropdown**: Results dropdown with keyboard navigation
3. **highlightSearchMatch**: Utility to render highlighted text

### Data TestIds

- `message-search-container`: Container div
- `message-search-input`: Search input field
- `message-search-clear`: Clear button
- `message-search-dropdown`: Results dropdown
- `message-search-loading`: Loading state
- `message-search-empty`: No results state
- `message-search-results`: Results list
- `message-search-result-{id}`: Individual result item
- `search-highlight`: Highlighted match text (mark element)

## Acceptance Criteria

- [x] Search input visible in channel header when channel selected
- [x] Search input has placeholder "Search messages..."
- [x] Typing triggers debounced search after 300ms
- [x] Results dropdown appears with matching messages
- [x] No results shows empty state message
- [x] Clear button appears when search has value
- [x] Clear button clears search and hides dropdown
- [x] Escape key clears search
- [x] Cmd/Ctrl+F focuses search input
- [x] Arrow keys navigate through results
- [x] Enter key selects highlighted result
- [x] Clicking result scrolls to and highlights message
- [x] Message highlight appears with yellow background
- [x] Highlight fades after 2 seconds
- [x] Search available in command palette

## Implementation Status

- [x] Server endpoint: `/api/messages/search`
- [x] Client hook: `useMessageSearch`
- [x] UI component: `MessageSearchDropdown`
- [x] Highlight utility: `highlightSearchMatch`
- [x] Integration with channel header
- [x] Keyboard shortcuts (Cmd/Ctrl+F, Escape, arrows)
- [x] Command palette integration
- [x] Playwright tests (15 tests, 9 passing, 6 skipped due to test data)

## Related

- TB95: Document Search (similar pattern)
- TB82: Task Search (similar filtering pattern)
- TB99: Message Day Separation (message display)
- TB100: Copy Message (message actions)

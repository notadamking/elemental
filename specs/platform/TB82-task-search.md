# TB82: Task Search

**Status:** Completed
**Last Updated:** 2026-01-25

## Overview

Adds a search bar to the Tasks page for filtering tasks by title using fuzzy matching with character highlighting.

## Features

### Search Bar
- Located in the header of the Tasks page, between the title and controls
- Search icon (magnifying glass) as visual indicator
- Placeholder text: "Search tasks... (Press / to focus)"
- Clear button (X) appears when search has a value

### Fuzzy Search
- Matches characters in sequence within task titles
- Example: "auth" matches "Authentication Handler" (highlighting the matched characters)
- Search is case-insensitive
- Filter is applied on the client side using debounced input

### Highlighting
- Matched characters are highlighted with yellow background (`<mark>` tags)
- Non-matched characters remain normal text
- Highlighting works in both regular and grouped list views

### Keyboard Shortcuts
- Press `/` to focus the search input (when not in another input field)
- Press `Escape` to clear the search and blur the input

### Persistence
- Search query is persisted to localStorage (`tasks.search`)
- Search is restored when returning to the Tasks page

### Integration
- Works with grouping (search first, then group, then sort)
- Works with sorting (search first, then sort)
- Works with pagination (resets to page 1 when search changes)
- Works in both list and kanban views

## Implementation

### Files Modified
- `apps/web/src/routes/tasks.tsx` - Main Tasks page with search integration
- `apps/web/src/hooks/useDebounce.ts` - New debounce hook
- `apps/web/src/hooks/index.ts` - Export the debounce hook

### Key Functions
- `fuzzySearch(title, query)` - Fuzzy matching algorithm returning matched indices
- `highlightMatches(title, indices)` - React component rendering highlighted text
- `TaskSearchBar` - Search input component with clear button and keyboard handling
- `useDebounce` - Generic debounce hook for values

### Test Data IDs
- `task-search-container` - The search bar container
- `task-search-input` - The search input field
- `task-search-clear` - The clear button (only visible when search has value)
- `task-title-{id}` - Individual task titles (for verifying highlighting)

## Testing

Playwright test file: `apps/web/tests/tb82-task-search.spec.ts`

17 tests covering:
1. Search bar visibility
2. Search input placeholder
3. Typing filters tasks
4. No matches shows empty list
5. Clear button appears/disappears
6. Clicking clear button clears search
7. Escape key clears search
8. Forward slash focuses search
9. Search highlights matching characters
10. Search works with grouping
11. Search works with sorting
12. Search resets pagination
13. Search persists in localStorage
14. Search restored from localStorage
15. Search is debounced
16. Search in kanban view
17. Clearing search restores all tasks

## Deferred

- Search also searches task description content (if hydrated) - deferred to future implementation

## Dependencies

- Uses existing `createTaskFilter` from `usePaginatedData` hook for base filtering
- Integrates with existing grouping (TB80) and sorting (TB81) features

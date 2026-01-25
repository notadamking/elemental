# TB55: Slash Commands

**Status:** Complete
**Implemented:** 2026-01-25

## Summary

Implemented a slash command menu for the document editor that allows users to quickly insert blocks by typing `/` followed by a command name. Features fuzzy search filtering, keyboard navigation, and mouse interaction support.

## Features Implemented

### Slash Command Trigger

- Typing `/` anywhere in the editor opens the slash command menu
- Works at the start of a line or after any text
- Menu appears as a floating popup near the cursor position

### Command Categories

Commands are organized into four categories:

1. **Headings**
   - `/heading1` - Large section heading (H1)
   - `/heading2` - Medium section heading (H2)
   - `/heading3` - Small section heading (H3)

2. **Lists**
   - `/bullet` - Create a bullet list
   - `/numbered` - Create a numbered list

3. **Blocks**
   - `/quote` - Insert a block quote
   - `/code` - Insert a code block
   - `/divider` - Insert a horizontal rule

4. **Embeds** (placeholders for TB57)
   - `/task` - Embed a task reference
   - `/doc` - Embed a document reference

### Fuzzy Search Filtering

- Type after `/` to filter commands (e.g., `/head` shows only heading options)
- Matches against command title, description, and ID
- Case-insensitive search
- Shows "No matching commands" when no results

### Keyboard Navigation

- **Arrow Down** - Move selection to next item
- **Arrow Up** - Move selection to previous item
- **Enter** - Execute selected command
- **Escape** - Close menu without selecting

### Mouse Interaction

- Hover over item to change selection
- Click on item to execute command
- Uses `onMouseDown` with `preventDefault` to maintain editor focus

## Technical Implementation

### Dependencies Added

```
@tiptap/suggestion - Tiptap suggestion plugin for slash commands
tippy.js - Tooltip/popover positioning library
```

### Files Created/Changed

- `apps/web/src/components/editor/SlashCommands.tsx` - New slash commands extension
  - `SlashCommands` - Main Tiptap extension
  - `SlashCommandMenu` - React component for the floating menu
  - `SlashCommandItem` - Interface for command definitions
  - `fuzzySearch` - Filtering function for commands
  - `groupByCategory` - Grouping function for display

- `apps/web/src/components/editor/BlockEditor.tsx` - Added SlashCommands extension to editor

- `apps/web/tests/slash-commands.spec.ts` - 19 Playwright tests

### Component Architecture

```tsx
// Extension registration in BlockEditor
const editor = useEditor({
  extensions: [
    StarterKit,
    Placeholder,
    CodeBlockLowlight,
    Highlight,
    SlashCommands,  // New extension
  ],
  // ...
});
```

### Menu Component Props

```typescript
interface SlashCommandMenuProps {
  items: SlashCommandItem[];     // Filtered command list
  command: (item: SlashCommandItem) => void;  // Execute command
}

interface SlashCommandMenuRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}
```

### Command Definition

```typescript
interface SlashCommandItem {
  id: string;           // Unique identifier (e.g., "heading1")
  title: string;        // Display title (e.g., "Heading 1")
  description: string;  // Description shown below title
  icon: React.ReactNode; // Lucide icon component
  category: 'headings' | 'lists' | 'blocks' | 'embeds';
  action: (props: { editor: any; range: Range }) => void;
}
```

## Test Coverage

19 Playwright tests covering:

### Basic Menu Tests
- Typing "/" opens slash command menu
- Menu shows categories (headings, lists, blocks, embeds)
- Menu shows command items with correct test IDs

### Fuzzy Search Tests
- Typing after "/" filters commands
- Typing "/bul" shows only bullet list
- Non-matching text shows "No matching commands"

### Keyboard Navigation Tests
- Arrow down moves selection to next item
- Arrow up moves selection to previous item
- Escape closes menu

### Command Execution Tests
- Enter executes selected command
- Clicking command item executes command
- /bullet inserts bullet list
- /numbered inserts ordered list
- /quote inserts blockquote
- /code inserts code block
- /divider inserts horizontal rule

### Mouse Interaction Tests
- Hovering over item changes selection

### Edge Cases
- Slash command works after text
- Embeds category shows task and document options

## Usage

### Quick Block Insertion

1. Type `/` anywhere in the document
2. Start typing to filter (e.g., `head` for headings)
3. Use arrow keys to navigate or hover with mouse
4. Press Enter or click to insert the block

### Examples

```
/h        → Shows Heading 1, Heading 2, Heading 3
/bul      → Shows Bullet List
/code     → Shows Code Block
```

## Styling

The menu uses Tailwind CSS classes:

- White background with border and shadow
- Blue-50 background for selected item
- Gray category headers in uppercase
- Icons in gray or blue (when selected)
- Max height of 300px with overflow scroll

## Related

- TB22: Block Editor - Base editor implementation
- TB54: Editor Toolbar Polish - Toolbar redesign
- TB57: Inline Task/Document Embeds - Will enhance /task and /doc commands

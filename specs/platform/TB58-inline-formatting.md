# TB58: Advanced Inline Formatting

**Status:** Implemented
**Last Updated:** 2026-01-24

## Purpose

Enhance the document editor with improved inline code styling and a selection bubble menu that provides quick access to text formatting options when text is selected.

## Features Implemented

### 1. Inline Code Styling

Improved inline code elements with better visual styling:

- **Monospace font**: Uses `ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas` font stack
- **Subtle background**: Light gray rgba background (`rgba(175, 184, 193, 0.2)`)
- **Border radius**: 4px rounded corners for a polished look
- **Padding**: Horizontal padding (`0.15em 0.35em`) for better readability
- **Font size**: Slightly smaller (0.9em) to match inline context

### 2. Selection Bubble Menu

A floating toolbar that appears above selected text:

- **Trigger**: Appears automatically when text is selected
- **Positioning**: Floats above the selection using Floating UI
- **Dark theme**: Dark background (`bg-gray-900`) with light text for visibility
- **Animation**: Smooth fade-in animation

#### Formatting Buttons

| Button | Action | Keyboard Shortcut |
|--------|--------|-------------------|
| Bold | Toggle bold | ⌘B / Ctrl+B |
| Italic | Toggle italic | ⌘I / Ctrl+I |
| Code | Toggle inline code | ⌘E / Ctrl+E |
| Strikethrough | Toggle strikethrough | ⌘⇧S / Ctrl+Shift+S |
| Highlight | Toggle highlight | ⌘⇧H / Ctrl+Shift+H |

### 3. Highlight Styling

Yellow highlight for marked text:
- **Background color**: Light yellow (`#fef08a`)
- **Border radius**: 2px
- **No additional padding** to maintain inline flow

## Implementation Details

### Files Modified

| File | Changes |
|------|---------|
| `apps/web/src/index.css` | Added inline code, highlight, and bubble menu CSS styles |
| `apps/web/src/components/editor/BubbleMenu.tsx` | New component for selection bubble menu |
| `apps/web/src/components/editor/BlockEditor.tsx` | Integrated EditorBubbleMenu component |

### Dependencies Added

- `@tiptap/extension-bubble-menu` - Tiptap extension for bubble menu positioning

### CSS Classes

```css
/* Inline code styling */
.ProseMirror code:not(pre code) {
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
  font-size: 0.9em;
  background-color: rgba(175, 184, 193, 0.2);
  border-radius: 4px;
  padding: 0.15em 0.35em;
  color: #1f2937;
}

/* Highlight styling */
.ProseMirror mark {
  background-color: #fef08a;
  border-radius: 2px;
}

/* Bubble menu animation */
.bubble-menu {
  animation: bubble-menu-fade-in 0.15s ease-out;
}
```

## Behavior

### Bubble Menu Visibility

The bubble menu:
- **Shows** when text is selected (non-empty selection)
- **Hides** when selection is cleared (cursor position only)
- **Hides** when cursor is inside a code block (formatting not applicable)

### Platform-Aware Shortcuts

Keyboard shortcuts display platform-appropriate modifiers:
- macOS: ⌘ (Command key)
- Windows/Linux: Ctrl

## Testing

15 Playwright tests in `apps/web/tests/inline-formatting.spec.ts`:

### Inline Code Styling Tests
1. Inline code has monospace font styling
2. Inline code has subtle background color
3. Inline code has border-radius
4. Inline code has padding

### Bubble Menu Tests
5. Bubble menu appears when text is selected
6. Bubble menu has formatting buttons
7. Bubble menu bold button applies formatting
8. Bubble menu italic button applies formatting
9. Bubble menu code button applies formatting
10. Bubble menu strikethrough button applies formatting
11. Bubble menu highlight button applies formatting
12. Bubble menu hides when selection is cleared
13. Bubble menu does not appear when cursor is in code blocks

### Keyboard Shortcut Tests
14. Keyboard shortcut Cmd+E toggles inline code
15. Highlight styling has yellow background

## Related Specs

- [TB54: Editor Toolbar Polish](./TB54-editor-toolbar-polish.md) - Added highlight and strikethrough toolbar buttons
- [TB55: Slash Commands](./TB55-slash-commands.md) - Slash command menu for block insertion
- [TB56: Drag-and-Drop Blocks](./TB56-drag-drop-blocks.md) - Block reordering

# TB56: Drag-and-Drop Blocks Specification

**Version:** 1.0.0
**Status:** Implemented
**Last Updated:** 2026-01-24

## Purpose

Add drag-and-drop functionality to the document block editor, allowing users to reorder blocks (paragraphs, headings, lists, code blocks, etc.) by dragging them with a grip handle.

## Features

### Drag Handle

- Grip icon appears on the left side of each block when hovering
- Uses a dot-grid pattern (2x2 dots) for the grip visual
- Fixed positioned element managed by the Tiptap extension
- Cursor changes to `grab` on hover, `grabbing` when dragging

### Block Reordering

- Drag any block type (paragraph, heading, list, code block, etc.) to a new position
- Visual drop indicator line shows where the block will be placed
- Auto-scroll when dragging near the edges of the editor (configurable threshold)
- Maintains block content and formatting during/after drag

### Visual Feedback

- Drag handle background color changes on hover (`#d1d5db`)
- Active/dragging state has darker background (`#9ca3af`)
- Drop cursor is a 2px blue line (`#3b82f6`)
- Dragged block has reduced opacity (0.5) while dragging

## Implementation

### Dependencies

- `tiptap-extension-global-drag-handle@0.1.18` - Third-party Tiptap extension for drag handles

### Files Modified

1. **apps/web/package.json** - Added tiptap-extension-global-drag-handle dependency
2. **apps/web/src/components/editor/BlockEditor.tsx** - Added GlobalDragHandle extension
3. **apps/web/src/index.css** - Added drag handle and drop indicator styles

### BlockEditor Configuration

```typescript
import GlobalDragHandle from 'tiptap-extension-global-drag-handle';

const editor = useEditor({
  extensions: [
    // ... other extensions
    GlobalDragHandle.configure({
      dragHandleWidth: 20,
      scrollTreshold: 100,
    }),
  ],
});
```

### CSS Styles

```css
/* Drag handle styles for block editor */
.drag-handle {
  position: fixed;
  opacity: 1;
  transition: opacity 0.2s ease, background 0.2s ease;
  border-radius: 0.25rem;
  background: #e5e7eb;
  background-size: calc(0.5em + 1px) calc(0.5em + 1px);
  background-image: url('data:image/svg+xml,<svg ...>'); /* Grip dots pattern */
  background-repeat: no-repeat;
  background-position: center;
  width: 1.2rem;
  height: 1.5rem;
  z-index: 50;
  cursor: grab;
}

.drag-handle:hover {
  background-color: #d1d5db;
}

.drag-handle:active,
.drag-handle.dragging {
  cursor: grabbing;
  background-color: #9ca3af;
}

/* Drop indicator line while dragging */
.ProseMirror-focused .is-dragging {
  opacity: 0.5;
}

/* Drop placeholder indicator */
.ProseMirror .drop-cursor {
  border-top: 2px solid #3b82f6 !important;
  border-radius: 1px;
}
```

## Configuration Options

| Option | Default | Description |
|--------|---------|-------------|
| `dragHandleWidth` | 20 | Width of the drag handle in pixels |
| `scrollTreshold` | 100 | Distance from edge of screen to trigger auto-scroll during drag |

## Testing

15 Playwright tests covering:

1. Drag handle element existence
2. Cursor grab style
3. Cursor grabbing style when active
4. Block rendering
5. Multiple block creation
6. Drop cursor styles
7. Extension loading
8. Block focus
9. Block structure maintenance
10. Hover state styles
11. Visual grip pattern
12. Toolbar functionality with extension
13. Slash commands compatibility
14. Dragging state CSS
15. Scroll threshold configuration

## Browser Support

Works in all modern browsers supported by Tiptap:
- Chrome/Edge 80+
- Firefox 78+
- Safari 14+

## Future Enhancements

- [ ] Keyboard-based block movement (Alt+Up/Down)
- [ ] Multi-block selection and drag
- [ ] Drag blocks between documents
- [ ] Custom drag preview styling

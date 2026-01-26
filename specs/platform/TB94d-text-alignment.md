# TB94d: Text Alignment Specification

**Status:** Implemented
**Version:** 1.0.0
**Last Updated:** 2026-01-25

## Purpose

Add text alignment controls to the document editor, allowing users to align text left, center, right, or justify. Alignment is stored in Markdown-compatible format using inline HTML styles.

## Features

### 1. Toolbar Buttons

Four alignment buttons are added to the editor toolbar:
- **Align Left** - Default alignment (removes explicit alignment)
- **Align Center** - Centers text within the block
- **Align Right** - Right-aligns text
- **Justify** - Justifies text across the full width

Buttons appear in the main toolbar when space permits, otherwise they're accessible via the overflow menu ("More formatting options").

### 2. Slash Commands

Users can type slash commands to apply alignment:
- `/left` - Align text left
- `/center` - Center align text
- `/right` - Right align text
- `/justify` - Justify text

Commands appear in the slash command menu under the "Alignment" category.

### 3. Keyboard Shortcuts

Standard keyboard shortcuts for alignment:
- `Cmd/Ctrl+Shift+L` - Align left
- `Cmd/Ctrl+Shift+E` - Center (E for center)
- `Cmd/Ctrl+Shift+R` - Align right
- `Cmd/Ctrl+Shift+J` - Justify

These shortcuts match common text editor conventions.

### 4. Markdown Storage Format

Aligned content is stored using inline HTML within Markdown:

```markdown
<p style="text-align: center">Centered paragraph</p>

<h1 style="text-align: right">Right-aligned heading</h1>

<p style="text-align: justify">Justified text that spans the full width of the container.</p>
```

Left alignment is the default and doesn't require explicit styling.

**Rationale:** Pure Markdown doesn't support text alignment. Using inline HTML:
- Is fully compatible with CommonMark and GFM parsers
- Renders correctly in GitHub, VS Code, and other Markdown viewers
- Can be read and written by AI agents
- Preserves semantic meaning

## Implementation Details

### Files Modified

1. **`apps/web/src/components/editor/BlockEditor.tsx`**
   - Added `@tiptap/extension-text-align` import
   - Configured TextAlign extension for headings and paragraphs
   - Added alignment action group with four buttons
   - Added alignment buttons to toolbar and overflow menu
   - Updated icon imports from lucide-react

2. **`apps/web/src/components/editor/SlashCommands.tsx`**
   - Added alignment category
   - Added four alignment slash commands (/left, /center, /right, /justify)
   - Updated groupByCategory and categoryLabels

3. **`apps/web/src/lib/markdown.ts`**
   - Added turndown rule for preserving text-align styles
   - Rule handles both paragraphs and headings (H1-H6)
   - Non-left alignments are converted to HTML with inline styles

### Dependencies

- `@tiptap/extension-text-align` - Tiptap extension for text alignment

## Testing

15 Playwright tests verify:

### Toolbar Tests (via overflow menu)
- Align center works
- Align right works
- Justify works
- Align left works

### Slash Command Tests
- `/center` applies center alignment
- `/right` applies right alignment
- `/justify` applies justify alignment
- `/left` applies left alignment

### Keyboard Shortcut Tests
- `Cmd/Ctrl+Shift+E` centers text
- `Cmd/Ctrl+Shift+R` right-aligns text
- `Cmd/Ctrl+Shift+J` justifies text
- `Cmd/Ctrl+Shift+L` left-aligns text

### Persistence Tests
- Centered heading persists after save and reload
- Multiple alignments in same document persist

### State Indicator Test
- Alignment via keyboard shortcuts applies correctly

## User Experience

1. **Creating aligned content:**
   - Position cursor in paragraph or heading
   - Use toolbar button, slash command, or keyboard shortcut
   - Alignment applies immediately

2. **Viewing aligned content:**
   - Content renders with correct alignment in both edit and view modes
   - HTML with alignment is parsed and displayed correctly

3. **Modifying alignment:**
   - Click different alignment button to change
   - Use left alignment to reset to default

## Implementation Checklist

- [x] Web: Add text alignment extension (@tiptap/extension-text-align)
- [x] Web: Add toolbar buttons: Align Left, Center, Align Right, Justify
- [x] Web: Add slash commands: /left, /center, /right, /justify
- [x] Web: Keyboard shortcuts: Cmd+Shift+L (left), Cmd+Shift+E (center), Cmd+Shift+R (right), Cmd+Shift+J (justify)
- [x] Web: Alignment applies to current block (paragraph, heading)
- [x] Web: Alignment indicator in toolbar (shows current alignment state via overflow menu)
- [x] Web: Alignment stored in Markdown using HTML attributes
- [x] **Verify:** Create centered heading, right-aligned paragraph, alignment persists in Markdown; Playwright tests passing (15 tests)

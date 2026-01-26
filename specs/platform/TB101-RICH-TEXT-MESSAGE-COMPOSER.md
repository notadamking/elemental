# TB101: Rich Text in MessageComposer

**Status:** Complete
**Completed:** 2026-01-26

## Overview

Replaced the plain textarea in MessageComposer with a mini Tiptap-based rich text editor, enabling users to format messages with rich text formatting before sending.

## Features Implemented

### 1. Mini Tiptap Editor

- Created new `MessageRichComposer` component (`apps/web/src/components/message/MessageRichComposer.tsx`)
- Uses Tiptap with StarterKit, Underline, Placeholder, and CodeBlockLowlight extensions
- Integrated into both `MessageComposer` and `ThreadComposer` components
- Content is stored as Markdown for AI agent compatibility

### 2. Text Formatting Support

| Format | Keyboard Shortcut | Toolbar Button |
|--------|-------------------|----------------|
| Bold | Cmd/Ctrl + B | Yes |
| Italic | Cmd/Ctrl + I | Yes |
| Underline | Cmd/Ctrl + U | Yes (expanded) |
| Strikethrough | - | Yes (expanded) |
| Inline Code | Cmd/Ctrl + E | Yes |
| Code Block | - | Yes (expanded) |
| Bullet List | - | Yes (expanded) |
| Numbered List | - | Yes (expanded) |
| Block Quote | - | Yes (expanded) |

### 3. Compact Toolbar

- Condensed toolbar shows: Bold, Italic, Inline Code
- Toggle button expands to show all formatting options
- Toolbar positioned below the editor content
- Active formatting state reflected in button highlighting (blue)

### 4. Send Behavior

- Enter key sends message (unless in list or code block)
- Shift+Enter creates new line
- Editor clears after successful send
- Send button disabled when editor is empty

## Files Changed

- `apps/web/src/components/message/MessageRichComposer.tsx` - New component
- `apps/web/src/routes/messages.tsx` - Updated MessageComposer and ThreadComposer

## Dependencies Added

- `@tiptap/extension-underline` - For underline formatting support

## Test Coverage

20 Playwright tests in `apps/web/tests/tb101-rich-text-message-composer.spec.ts`:

1. Rich text composer is visible in channel view
2. Toolbar toggle button is visible
3. Condensed toolbar shows basic formatting buttons
4. Expanded toolbar shows all formatting buttons
5. Bold formatting can be applied via toolbar
6. Italic formatting can be applied via toolbar
7. Inline code formatting can be applied via toolbar
8. Code block can be inserted via expanded toolbar
9. Bullet list can be created via expanded toolbar
10. Numbered list can be created via expanded toolbar
11. Block quote can be created via expanded toolbar
12. Keyboard shortcut Cmd+B applies bold
13. Keyboard shortcut Cmd+I applies italic
14. Send button is disabled when editor is empty
15. Send button is enabled when editor has content
16. Message with formatting can be sent
17. Editor clears after sending message
18. Markdown shortcut **bold** works
19. Underline button exists in expanded toolbar
20. Strikethrough can be applied via expanded toolbar

## Architecture Notes

- Content is converted to/from Markdown at the boundary using the existing `prepareContentForEditor` and `prepareContentForStorage` utilities
- This ensures AI agents can read/write message content naturally
- The component exposes a ref interface for programmatic control (focus, clear, isEmpty)

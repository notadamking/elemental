# TB100: Copy Message Action

## Purpose

Add the ability to copy message content to the clipboard with a single click or keyboard shortcut, providing a Slack-like messaging experience.

## Features

### Copy Button in Hover Menu
- When hovering over a message, an action menu appears at the top-right corner
- Action menu contains a copy button (and reply button for non-threaded messages)
- Clicking the copy button copies the message content as plain text to the clipboard
- The copy icon changes to a checkmark for 2 seconds after successful copy

### Toast Notification
- After successful copy, a toast notification appears: "Message copied"
- Uses the sonner toast library with the app's standard toast configuration
- Toast respects user's notification settings (position, duration)

### Keyboard Shortcut
- When a message is focused (via Tab or click), pressing `C` copies the content
- Only the plain `C` key triggers copy (not Ctrl+C, Cmd+C, or Alt+C)
- Focus state is indicated visually with a blue background and ring

### Focus Styling
- Messages are focusable via `tabIndex={0}`
- Focused messages display with:
  - Blue background (`bg-blue-50`)
  - Blue ring border (`ring-2 ring-blue-200`)
  - No outline

## Implementation

### Component: MessageBubble
Location: `apps/web/src/routes/messages.tsx`

Key changes:
1. Added `useState` for `copied` state
2. Added `useRef` for the message div
3. Added `handleCopy` async function using `navigator.clipboard.writeText()`
4. Added `handleKeyDown` handler for the `C` keyboard shortcut
5. Added action menu div with copy button (and reply button)
6. Added focus styles via Tailwind CSS

### Dependencies
- `lucide-react`: Copy and Check icons
- `sonner`: Toast notifications

## Testing

### Playwright Tests
Location: `apps/web/tests/tb100-copy-message.spec.ts`

Tests:
1. Message displays copy button on hover
2. Clicking copy button copies message content
3. Copy button shows success indicator (checkmark) after click
4. Toast notification appears after copying message
5. Pressing C key when message is focused copies content
6. Focused message has visual highlight
7. Action menu includes reply button for non-threaded messages
8. Copy button title shows keyboard shortcut hint

## API

No API changes required - this is a purely frontend feature that uses the existing message data.

## Status

**Implemented** - All tests passing

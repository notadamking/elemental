# TB97: Emoji Support (Markdown-Compatible)

**Status:** Implemented
**Last Updated:** 2026-01-26

## Purpose

Add emoji support to the document editor with full Markdown compatibility. Emojis are stored as Unicode characters (not shortcodes) ensuring AI agents can read and write emoji-containing documents naturally.

## Features

### 1. Emoji Picker Modal

A full-featured emoji picker accessible from:
- Toolbar button (Smile icon)
- Slash command `/emoji`

**Features:**
- Category navigation (Smileys, Nature, Food, Travel, Activities, Objects, Symbols, Flags)
- Search functionality
- Recently used emojis (stored in localStorage)
- Click to insert emoji
- Keyboard navigation (Escape to close)

### 2. :emoji: Inline Autocomplete

Type `:shortcode:` to trigger inline emoji autocomplete:
- Triggered by typing `:` followed by characters
- Fuzzy search matching against shortcodes and keywords
- Keyboard navigation (Arrow Up/Down, Enter to select, Escape to close)
- Converts shortcode to Unicode emoji on selection

**Common Shortcodes:**
- `:smile:` → 😊
- `:thumbsup:` or `:+1:` → 👍
- `:fire:` → 🔥
- `:rocket:` → 🚀
- `:tada:` → 🎉
- `:100:` → 💯
- `:check:` → ✅
- `:heart:` → ❤️

### 3. Markdown Storage

Emojis are stored as Unicode characters in Markdown:

```markdown
Great job! 🎉 You did it! 🚀

This task is ✅ complete.
```

**NOT** as shortcodes:
```markdown
<!-- We do NOT store this way -->
Great job! :tada: You did it! :rocket:
```

This ensures:
- AI agents can read/write documents naturally
- Universal compatibility with any Markdown renderer
- No custom parsing required

## Architecture

### Components

1. **EmojiPickerModal** (`apps/web/src/components/editor/EmojiPickerModal.tsx`)
   - Uses `emoji-picker-react` library
   - Tracks recent emojis in localStorage (`elemental.recentEmojis`)
   - Supports light/dark theme

2. **EmojiAutocomplete** (`apps/web/src/components/editor/EmojiAutocomplete.tsx`)
   - Tiptap extension using Suggestion plugin
   - Contains curated emoji dataset with shortcodes and keywords
   - Fuzzy search implementation
   - Unique PluginKey to avoid conflicts with slash commands

### Integration Points

- **BlockEditor.tsx**: Imports and registers both components
  - Adds emoji button to toolbar (`blockActions`)
  - Adds `EmojiAutocomplete` extension to Tiptap
  - Adds `EmojiPickerModal` to component tree
  - Wires up `handleEmojiInsert` callback

- **SlashCommands.tsx**: Adds `/emoji` command
  - Added `onEmojiInsert` to `EmbedCallbacks` interface
  - Command triggers emoji picker modal

## Emoji Dataset

The autocomplete includes 400+ emojis covering:
- Smileys & People
- Gestures
- Hearts
- Objects & Symbols
- Tech
- Food & Drink
- Animals
- Nature
- Activities & Sports
- Travel & Places
- Symbols
- Flags

Each emoji has:
- `shortcode`: Primary name (e.g., "smile")
- `emoji`: Unicode character (e.g., "😊")
- `keywords`: Alternative search terms (e.g., ["happy", "face", "joy"])

## Implementation Checklist

- [x] Web: Install emoji-picker-react library
- [x] Web: Create EmojiPickerModal component with categories and search
- [x] Web: Add emoji picker button to toolbar
- [x] Web: Add `/emoji` slash command
- [x] Web: Create EmojiAutocomplete Tiptap extension
- [x] Web: Implement `:emoji:` autocomplete with fuzzy search
- [x] Web: Convert shortcodes to Unicode on insert (not stored as shortcodes)
- [x] Web: Store emojis as Unicode in Markdown for universal compatibility
- [x] Web: Track recent emojis in localStorage
- [x] Web: Support common emoji shortcodes (+1, 100, tada, check, etc.)
- [x] **Verify:** 11/16 Playwright tests passing (`apps/web/tests/tb97-emoji-support.spec.ts`)
  - Note: 5 failing tests are due to pre-existing documents page issue (`documents?.filter is not a function`), not emoji functionality

## Testing

```bash
cd apps/web
bun run test tests/tb97-emoji-support.spec.ts
```

Passing tests verify:
- `:emoji:` autocomplete shows menu
- Emoji insertion works
- Keyboard navigation works
- Unknown shortcodes show "No matching emojis"
- Emojis stored as Unicode in Markdown
- Common shortcuts (thumbsup, 100, tada) work

## Future Enhancements

- Document icon/emoji in library tree (stored in document metadata)
- Skin tone variants for human emojis
- Custom emoji upload
- Emoji reactions on messages

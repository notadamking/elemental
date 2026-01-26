# TB94f: Task and Document Embedding Specification

## Purpose

Enable embedding of tasks and documents within the document editor using an Obsidian-inspired syntax (`![[task:ID]]` and `![[doc:ID]]`). Embeds render as rich inline badges showing the element's title and status, providing quick navigation while keeping the Markdown simple enough for AI agents to read and write.

## Markdown Format

Embeds use a custom Markdown syntax inspired by Obsidian's wiki-style links:

```markdown
# Document with Embeds

Here is a task embed:
![[task:el-abc123]]

And a document embed:
![[doc:el-xyz789]]
```

This syntax was chosen because:
- **AI Agent Friendly**: Simple text pattern that agents can generate without UI knowledge
- **Obsidian Compatibility**: Familiar to users of Obsidian and similar tools
- **Distinct from Links**: Different from standard Markdown links `[text](url)` to indicate embedded content

## Editor Integration

### Tiptap Nodes

Two custom Tiptap nodes handle embed parsing and rendering:

| Node | File | Attributes |
|------|------|------------|
| TaskEmbed | `apps/web/src/components/editor/blocks/TaskEmbedBlock.tsx` | `taskId: string` |
| DocumentEmbed | `apps/web/src/components/editor/blocks/DocumentEmbedBlock.tsx` | `documentId: string` |

### HTML Representation

The editor uses `<div>` elements with data attributes for HTML representation:

```html
<!-- Task embed -->
<div data-type="taskEmbed" data-task-id="el-abc123"></div>

<!-- Document embed -->
<div data-type="documentEmbed" data-document-id="el-xyz789"></div>
```

### Markdown Conversion

Conversion rules in `apps/web/src/lib/markdown.ts`:

| Direction | Format |
|-----------|--------|
| Markdown → HTML | `![[task:ID]]` → `<div data-type="taskEmbed" data-task-id="ID"></div>` |
| HTML → Markdown | `<div data-type="taskEmbed">` → `![[task:ID]]` |

## Slash Commands

| Command | Action | Modal |
|---------|--------|-------|
| `/task` | Insert task embed | TaskPickerModal |
| `/doc` | Insert document embed | DocumentPickerModal |

Both commands appear in the "Embeds" category of the slash command menu.

## Embed Components

### TaskEmbedBlock

Renders a task embed with:
- Task title (fetched via API)
- Status indicator icon with color coding
- Clickable link to `/tasks/:id`
- Error state for non-existent tasks (data-testid: `task-embed-error-{id}`)

### DocumentEmbedBlock

Renders a document embed with:
- Document title (fetched via API)
- Content type icon
- Clickable link to `/documents/:id`
- Error state for non-existent documents (data-testid: `doc-embed-error-{id}`)

## Picker Modals

### TaskPickerModal

File: `apps/web/src/components/editor/TaskPickerModal.tsx`

Features:
- Search input (data-testid: `task-picker-search`)
- Task list with data-testid: `task-picker-item-{id}`
- Close button (data-testid: `task-picker-modal-close`)
- Keyboard navigation support

### DocumentPickerModal

File: `apps/web/src/components/editor/DocumentPickerModal.tsx`

Features:
- Search input (data-testid: `document-picker-search`)
- Document list with data-testid: `document-picker-item-{id}`
- Close button (data-testid: `document-picker-modal-close`)
- Keyboard navigation support

## Test Coverage

18 Playwright tests in `apps/web/tests/tb94f-task-document-embedding.spec.ts`:

### Slash Commands (4 tests)
- /task slash command opens task picker modal
- /doc slash command opens document picker modal
- /task appears in Embeds category
- /doc appears in Embeds category

### Embed Persistence (4 tests)
- Task embed ![[task:id]] renders in editor from Markdown
- Document embed ![[doc:id]] renders in editor from Markdown
- Task embed survives save and reload
- Document embed survives save and reload

### Embed Rendering (2 tests)
- Task embed shows task title
- Document embed shows document title

### Embed Navigation (2 tests)
- Task embed has correct href
- Document embed has correct href

### Embed Error Handling (2 tests)
- Task embed shows error for non-existent task
- Document embed shows error for non-existent document

### Picker Functionality (4 tests)
- Task picker can be closed with close button
- Document picker can be closed with close button
- Task picker has search input
- Document picker has search input

## Implementation Checklist

- [x] Define embed syntax convention (![[task:ID]] and ![[doc:ID]])
- [x] Create TaskEmbedBlock Tiptap node with HTML parsing
- [x] Create DocumentEmbedBlock Tiptap node with HTML parsing
- [x] Add turndown rules for Markdown conversion
- [x] Add marked extensions for Markdown parsing
- [x] Create TaskPickerModal component
- [x] Create DocumentPickerModal component
- [x] Add /task and /doc slash commands
- [x] Integrate embeds into BlockEditor
- [x] Add error handling for non-existent elements
- [x] Write comprehensive Playwright tests
- [x] Update PLAN.md with completion status

## Status

**Implemented** - All functionality complete and tested.

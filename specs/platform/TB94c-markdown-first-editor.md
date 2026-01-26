# TB94c: Markdown-First Editor Architecture

**Status:** Implemented
**Last Updated:** 2026-01-25

## Purpose

Refactor the BlockEditor to use Markdown as the canonical storage format instead of HTML. This ensures:

1. **AI Agent Compatibility:** Agents can read/write documents naturally without schema knowledge
2. **Token Efficiency:** Markdown is 3-5x more compact than structured JSON for the same content
3. **Universal Interoperability:** Works with GitHub, external tools, and other AI systems
4. **Simplicity:** No format migration, no schema versioning, no complex nested structures

## Architecture

### Storage Format

All document content is stored as Markdown in the database. The editor internally uses HTML (via Tiptap), but conversions happen at the boundary:

```
┌─────────────────────────────────────────────────────────────┐
│                        Storage (SQLite)                      │
│                     Markdown Content                         │
└──────────────────────────┬──────────────────────────────────┘
                           │
              ┌────────────┴────────────┐
              │                         │
              ▼                         ▼
       Load (prepareContentForEditor)   Save (prepareContentForStorage)
              │                         ▲
              │ Markdown → HTML         │ HTML → Markdown
              │                         │
              ▼                         │
┌─────────────────────────────────────────────────────────────┐
│                      BlockEditor (Tiptap)                    │
│                      Internal HTML State                     │
└─────────────────────────────────────────────────────────────┘
```

### Key Files

| File | Purpose |
|------|---------|
| `apps/web/src/lib/markdown.ts` | Markdown conversion utilities (htmlToMarkdown, markdownToHtml) |
| `apps/web/src/components/editor/BlockEditor.tsx` | Tiptap-based editor, uses markdown utilities |
| `apps/web/src/routes/documents.tsx` | DocumentRenderer for viewing markdown/HTML content |

## Markdown Format Specification

### Standard Markdown

| Feature | Markdown Syntax | HTML |
|---------|----------------|------|
| Heading 1 | `# Title` | `<h1>Title</h1>` |
| Heading 2 | `## Title` | `<h2>Title</h2>` |
| Heading 3 | `### Title` | `<h3>Title</h3>` |
| Bold | `**text**` | `<strong>text</strong>` |
| Italic | `_text_` | `<em>text</em>` |
| Inline Code | `` `code` `` | `<code>code</code>` |
| Code Block | ` ```\ncode\n``` ` | `<pre><code>code</code></pre>` |
| Bullet List | `- item` | `<ul><li>item</li></ul>` |
| Numbered List | `1. item` | `<ol><li>item</li></ol>` |
| Blockquote | `> text` | `<blockquote>text</blockquote>` |

### Custom Extensions

| Feature | Markdown Syntax | HTML |
|---------|----------------|------|
| Highlight | `==text==` | `<mark>text</mark>` |
| Strikethrough | `~~text~~` | `<s>text</s>` |
| Task Embed | `![[task:el-abc123]]` | `<div data-type="taskEmbed" data-task-id="el-abc123">` |
| Document Embed | `![[doc:el-xyz789]]` | `<div data-type="documentEmbed" data-document-id="el-xyz789">` |

## Implementation Details

### Turndown Configuration

```typescript
const turndownService = new TurndownService({
  headingStyle: 'atx',        // Use # style headings
  codeBlockStyle: 'fenced',   // Use ``` style code blocks
  bulletListMarker: '-',      // Use - for bullet lists
  emDelimiter: '_',           // Use _ for italic
  strongDelimiter: '**',      // Use ** for bold
});

// Custom rules for highlight, strikethrough, embeds
turndownService.addRule('highlight', { ... });
turndownService.addRule('strikethrough', { ... });
turndownService.addRule('taskEmbed', { ... });
turndownService.addRule('documentEmbed', { ... });
```

### Marked Configuration

```typescript
marked.setOptions({
  gfm: true,    // GitHub Flavored Markdown
  breaks: true, // Convert \n to <br>
});
```

### Pre-processing for Custom Syntax

When converting Markdown to HTML, custom syntax is pre-processed before calling marked:

```typescript
// Convert highlight: ==text== → <mark>text</mark>
processed = processed.replace(/==([^=]+)==/g, '<mark>$1</mark>');

// Convert strikethrough: ~~text~~ → <s>text</s>
processed = processed.replace(/~~([^~]+)~~/g, '<s>$1</s>');

// Convert embeds
processed = processed.replace(/!\[\[task:([\w-]+)\]\]/g, '<div data-type="taskEmbed" ...>');
processed = processed.replace(/!\[\[doc:([\w-]+)\]\]/g, '<div data-type="documentEmbed" ...>');
```

## Backwards Compatibility

### Legacy HTML Content

Documents created before TB94c contain HTML content. The system handles this gracefully:

1. `isHtmlContent()` detects HTML tags in content
2. HTML content is rendered directly with `dangerouslySetInnerHTML`
3. When edited and saved, HTML content is converted to Markdown

### Content Type Detection

```typescript
// Check for HTML markers
function isHtmlContent(content: string): boolean {
  return /<(p|h[1-6]|ul|ol|li|blockquote|pre|code|strong|em|mark|s|br|hr|div)\b/i.test(content);
}
```

### Rendering Logic

```
if (isHtmlContent(content)) {
  → Render with document-content-html testid
} else {
  → Convert Markdown to HTML
  → Render with document-content-markdown testid
}
```

## Testing

### Test Coverage

11 Playwright tests in `apps/web/tests/tb94c-markdown-first.spec.ts`:

1. **Markdown Storage Format**
   - Content is stored as Markdown, not HTML
   - Bold text stored as `**bold**`
   - Italic text stored as `_italic_`
   - Bullet list stored as Markdown list
   - Code block stored as fenced code block

2. **Markdown Rendering**
   - Markdown content rendered as HTML in view mode

3. **Round-Trip Fidelity**
   - Markdown → Editor → Save preserves formatting structure

4. **Legacy HTML Compatibility**
   - Legacy HTML content loads and displays correctly
   - Legacy HTML content editable and saves as Markdown

5. **Highlight Formatting**
   - Highlight stored as `==text==` in Markdown
   - `==text==` in Markdown renders correctly

### Running Tests

```bash
cd apps/web
bun run test tests/tb94c-markdown-first.spec.ts
```

## Dependencies

Added to `apps/web/package.json`:

- `turndown: ^7.2.2` - HTML to Markdown conversion
- `marked: ^17.0.1` - Markdown to HTML conversion
- `@types/turndown: ^5.0.6` - TypeScript types

## Future Considerations

1. **TB94c-2:** Block drag-and-drop should work with Markdown persistence
2. **TB94e:** Image embeds should use standard `![alt](url)` syntax
3. **TB94f:** Task/doc embeds use `![[type:id]]` syntax (Obsidian-inspired)

## Related Specs

- [TB94b: Core Formatting Fixes](./TB94b-core-formatting-fixes.md) - Prerequisite
- [TB94c-2: Block Drag-and-Drop](./PLAN.md) - Follow-up for drag handles

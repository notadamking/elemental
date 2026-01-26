# TB140: Render Task Attachments as Markdown

## Purpose

Task attachments (documents) should render with proper formatting when the content type is `markdown`. Previously, markdown documents were rendered as preformatted plain text, which didn't provide the expected formatting (headings, lists, code blocks, etc.).

## Implementation

### Change Summary

Modified the `renderDocumentContent()` function in `TaskDetailPanel.tsx` to use the existing `MarkdownRenderer` component for markdown content type instead of rendering as preformatted text.

### Code Changes

**File:** `apps/web/src/components/task/TaskDetailPanel.tsx`

Changed from:
```tsx
if (contentType === 'markdown') {
  // For now, render as preformatted text - a full markdown renderer could be added
  return (
    <div className="prose prose-sm max-w-none text-gray-700">
      <pre className="whitespace-pre-wrap font-sans text-sm">{content}</pre>
    </div>
  );
}
```

Changed to:
```tsx
if (contentType === 'markdown') {
  return (
    <MarkdownRenderer
      content={content}
      className="text-sm text-gray-700 dark:text-gray-300"
      testId="attachment-markdown-content"
    />
  );
}
```

### Features

The markdown rendering now supports:
- **Headings** (h1-h6)
- **Lists** (ordered and unordered)
- **Bold and italic** text
- **Code blocks** (fenced and inline)
- **Blockquotes**
- **Links**
- **@mentions** (rendered as clickable links to entity search)
- **Task embeds** (![[task:id]])
- **Document embeds** (![[doc:id]])
- **Highlight syntax** (==text==)
- **Strikethrough** (~~text~~)

### Styling

The `MarkdownRenderer` component applies `prose prose-sm` classes from Tailwind Typography for consistent, readable typography. Dark mode is supported via the `dark:text-gray-300` class.

## Verification

### Playwright Tests

Created comprehensive test suite in `apps/web/tests/tb140-attachment-markdown.spec.ts`:

1. **markdown attachment renders headings properly** - Verifies h1, h2, h3 elements are created
2. **markdown attachment renders lists properly** - Verifies ul/ol and li elements
3. **markdown attachment renders bold and italic text** - Verifies strong/em elements
4. **markdown attachment renders code blocks** - Verifies pre/code blocks and inline code
5. **markdown attachment renders blockquotes** - Verifies blockquote elements
6. **markdown attachment renders links** - Verifies anchor elements with correct href
7. **markdown attachment uses prose styling** - Verifies prose class for typography
8. **plain text attachment still renders as plain text** - Regression test
9. **json attachment still renders as formatted JSON** - Regression test
10. **markdown attachment with @mentions renders mention links** - Verifies mention-chip class and entity links

All 10 tests pass.

## Implementation Checklist

- [x] Import `MarkdownRenderer` component (already imported)
- [x] Modify `renderDocumentContent()` to use `MarkdownRenderer` for markdown content
- [x] Add `testId` prop for test targeting
- [x] Verify headings render properly
- [x] Verify lists render properly
- [x] Verify bold/italic render properly
- [x] Verify code blocks render properly
- [x] Verify blockquotes render properly
- [x] Verify links render properly
- [x] Verify @mentions render as clickable links
- [x] Write Playwright tests
- [x] All tests pass

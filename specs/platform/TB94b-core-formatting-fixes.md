# TB94b: Core Formatting Fixes

## Overview
Fix the BlockEditor to preserve rich text formatting (bold, italic, headings, lists, etc.) when saving documents. Previously, all formatting was being stripped and converted to plain text.

## Problem
The BlockEditor was using lossy conversion:
1. Content was stored as plain text in the database
2. `textToHtml()` converted plain text to basic `<p>` tags when loading
3. `htmlToText()` stripped all HTML formatting when saving
4. All rich text formatting (headings, bold, lists, code blocks) was lost on save

## Solution

### 1. Update BlockEditor to emit HTML
Changed the `onUpdate` handler to emit HTML directly instead of converting to plain text:
```typescript
onUpdate: ({ editor }) => {
  const html = editor.getHTML();
  onChange(html);  // Emit HTML directly
},
```

### 2. Update textToHtml to handle existing HTML
Added detection for existing HTML content:
```typescript
const isHtmlContent = (content: string) => {
  return /<(p|h[1-6]|ul|ol|li|blockquote|pre|code|strong|em|mark|s|br|hr)\b/i.test(content);
};

const textToHtml = (text: string) => {
  if (!text) return '<p></p>';
  if (isHtmlContent(text)) return text;  // Return as-is if already HTML
  // Convert plain text to HTML for backwards compatibility
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<p>${escaped.replace(/\n/g, '</p><p>')}</p>`;
};
```

### 3. Update DocumentRenderer to display HTML
Added HTML rendering support to the DocumentRenderer:
```typescript
if (isHtmlContent(content)) {
  return (
    <div
      data-testid="document-content-html"
      className="prose prose-sm max-w-none ..."
      dangerouslySetInnerHTML={{ __html: content }}
    />
  );
}
```

## Formatting Support

### Text Formatting (all persist on save)
- **Bold** (`<strong>`) - Cmd+B / toolbar button
- **Italic** (`<em>`) - Cmd+I / toolbar button
- **Inline Code** (`<code>`) - Cmd+E / toolbar button
- **Strikethrough** (`<s>`) - Cmd+Shift+S / toolbar button / bubble menu
- **Highlight** (`<mark>`) - Cmd+Shift+H / toolbar button / bubble menu

### Block Elements (all persist on save)
- **Heading 1** (`<h1>`) - Cmd+Alt+1 / toolbar button / slash command
- **Heading 2** (`<h2>`) - Cmd+Alt+2 / toolbar button / slash command
- **Heading 3** (`<h3>`) - Cmd+Alt+3 / toolbar button / slash command
- **Bullet List** (`<ul>`) - Cmd+Shift+8 / toolbar button / slash command
- **Numbered List** (`<ol>`) - Cmd+Shift+7 / toolbar button / slash command
- **Blockquote** (`<blockquote>`) - Cmd+Shift+B / toolbar button / slash command
- **Code Block** (`<pre><code>`) - Cmd+Alt+C / toolbar button / slash command

## Test Coverage

Created comprehensive Playwright tests in `apps/web/tests/tb94b-core-formatting.spec.ts`:
- 14 tests covering all formatting types
- Tests verify formatting is applied in editor
- Tests verify formatting persists after save and page reload
- Tests verify existing HTML content loads correctly

## Files Modified

1. `apps/web/src/components/editor/BlockEditor.tsx`
   - Updated `textToHtml()` to detect and preserve HTML content
   - Changed `onUpdate` to emit HTML instead of plain text
   - Removed unused `htmlToText()` function
   - Updated content comparison in useEffect

2. `apps/web/src/routes/documents.tsx`
   - Added `isHtmlContent()` helper function
   - Updated `DocumentRenderer` to display HTML content with Tailwind prose styles

3. `apps/web/tests/tb94b-core-formatting.spec.ts` (new file)
   - Added 14 comprehensive tests for formatting persistence

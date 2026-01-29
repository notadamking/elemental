/**
 * Markdown utilities for rendering agent messages.
 */

import { marked } from 'marked';

// Configure marked for safe output
marked.setOptions({
  gfm: true,    // GitHub Flavored Markdown
  breaks: true, // Convert \n to <br>
});

/**
 * Convert markdown content to HTML.
 * Used for rendering assistant and user messages in chat panels.
 */
export function markdownToHtml(markdown: string): string {
  if (!markdown) {
    return '';
  }
  return marked.parse(markdown, { async: false }) as string;
}

/**
 * BlockEditor - Tiptap-based block editor for document content
 *
 * Features:
 * - Block-based editing with paragraphs, headings, lists, code
 * - Markdown-like shortcuts (# for headings, - for lists)
 * - Undo/Redo support
 * - Keyboard shortcuts
 */

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { common, createLowlight } from 'lowlight';
import { useCallback, useEffect } from 'react';
import {
  Bold,
  Italic,
  Code,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Undo,
  Redo,
  FileCode,
} from 'lucide-react';

// Create lowlight instance with common languages
const lowlight = createLowlight(common);

interface BlockEditorProps {
  content: string;
  contentType: string;
  onChange: (content: string) => void;
  onSave?: () => void;
  placeholder?: string;
  readOnly?: boolean;
}

interface ToolbarButtonProps {
  onClick: () => void;
  isActive?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
  title?: string;
  testId?: string;
}

function ToolbarButton({
  onClick,
  isActive = false,
  disabled = false,
  children,
  title,
  testId,
}: ToolbarButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      data-testid={testId}
      className={`p-1.5 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${
        isActive ? 'bg-gray-200 text-blue-600' : 'text-gray-600'
      }`}
    >
      {children}
    </button>
  );
}

function ToolbarDivider() {
  return <div className="w-px h-6 bg-gray-200 mx-1" />;
}

export function BlockEditor({
  content,
  contentType,
  onChange,
  onSave,
  placeholder = 'Start writing...',
  readOnly = false,
}: BlockEditorProps) {
  // Convert plain text to HTML for Tiptap
  // Use <br> for line breaks within content to preserve exact newline count
  const textToHtml = useCallback((text: string) => {
    if (!text) return '<p></p>';
    // Escape HTML entities and convert newlines to <br> tags
    const escaped = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    // Wrap in a single paragraph with <br> for newlines
    const withBreaks = escaped.replace(/\n/g, '<br>');
    return `<p>${withBreaks}</p>`;
  }, []);

  // Convert HTML back to plain text with newlines
  const htmlToText = useCallback((html: string) => {
    if (!html) return '';
    // Replace <br> tags with newlines first
    let text = html.replace(/<br\s*\/?>/gi, '\n');
    // Replace paragraph/block endings with newlines
    text = text.replace(/<\/(p|div|h[1-6]|li|blockquote)>/gi, '\n');
    // Remove all remaining HTML tags
    text = text.replace(/<[^>]+>/g, '');
    // Decode HTML entities
    const div = document.createElement('div');
    div.innerHTML = text;
    text = div.textContent || '';
    // Remove trailing newline that gets added from the closing </p>
    return text.replace(/\n$/, '');
  }, []);

  // Determine initial content format
  const getInitialContent = useCallback(() => {
    if (!content) return '';

    // For JSON content, pretty-print it and wrap in code block
    if (contentType === 'json') {
      try {
        const formatted = JSON.stringify(JSON.parse(content), null, 2);
        return `<pre><code>${formatted}</code></pre>`;
      } catch {
        return textToHtml(content);
      }
    }

    // Convert plain text with newlines to HTML paragraphs
    return textToHtml(content);
  }, [content, contentType, textToHtml]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false, // Use CodeBlockLowlight instead
      }),
      Placeholder.configure({
        placeholder,
      }),
      CodeBlockLowlight.configure({
        lowlight,
        defaultLanguage: contentType === 'json' ? 'json' : undefined,
      }),
    ],
    content: getInitialContent(),
    editable: !readOnly,
    onUpdate: ({ editor }) => {
      // Get HTML and convert back to plain text with newlines
      const html = editor.getHTML();
      const text = htmlToText(html);
      onChange(text);
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none focus:outline-none min-h-[200px] px-4 py-3',
        'data-testid': 'block-editor-content',
      },
      handleKeyDown: (_view, event) => {
        // Cmd+S / Ctrl+S to save
        if ((event.metaKey || event.ctrlKey) && event.key === 's') {
          event.preventDefault();
          onSave?.();
          return true;
        }
        return false;
      },
    },
  });

  // Update editor content when prop changes (but not from user edits)
  useEffect(() => {
    if (editor && !editor.isFocused) {
      const currentText = editor.getText();
      const newContent = getInitialContent();
      if (currentText !== newContent) {
        editor.commands.setContent(newContent);
      }
    }
  }, [editor, content, getInitialContent]);

  if (!editor) {
    return (
      <div data-testid="block-editor-loading" className="p-4 text-gray-500">
        Loading editor...
      </div>
    );
  }

  // For JSON and code content, show a simplified toolbar
  const isCodeMode = contentType === 'json';

  return (
    <div data-testid="block-editor" className="border border-gray-200 rounded-lg overflow-hidden bg-white">
      {/* Toolbar */}
      {!readOnly && (
        <div
          data-testid="block-editor-toolbar"
          className="flex items-center gap-0.5 px-2 py-1.5 border-b border-gray-200 bg-gray-50"
        >
          {/* Undo/Redo */}
          <ToolbarButton
            onClick={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().undo()}
            title="Undo (Cmd+Z)"
            testId="toolbar-undo"
          >
            <Undo className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().redo().run()}
            disabled={!editor.can().redo()}
            title="Redo (Cmd+Shift+Z)"
            testId="toolbar-redo"
          >
            <Redo className="w-4 h-4" />
          </ToolbarButton>

          <ToolbarDivider />

          {/* Text formatting - only for non-code modes */}
          {!isCodeMode && (
            <>
              <ToolbarButton
                onClick={() => editor.chain().focus().toggleBold().run()}
                isActive={editor.isActive('bold')}
                title="Bold (Cmd+B)"
                testId="toolbar-bold"
              >
                <Bold className="w-4 h-4" />
              </ToolbarButton>
              <ToolbarButton
                onClick={() => editor.chain().focus().toggleItalic().run()}
                isActive={editor.isActive('italic')}
                title="Italic (Cmd+I)"
                testId="toolbar-italic"
              >
                <Italic className="w-4 h-4" />
              </ToolbarButton>
              <ToolbarButton
                onClick={() => editor.chain().focus().toggleCode().run()}
                isActive={editor.isActive('code')}
                title="Inline Code (Cmd+E)"
                testId="toolbar-code"
              >
                <Code className="w-4 h-4" />
              </ToolbarButton>

              <ToolbarDivider />

              {/* Headings */}
              <ToolbarButton
                onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
                isActive={editor.isActive('heading', { level: 1 })}
                title="Heading 1"
                testId="toolbar-h1"
              >
                <Heading1 className="w-4 h-4" />
              </ToolbarButton>
              <ToolbarButton
                onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                isActive={editor.isActive('heading', { level: 2 })}
                title="Heading 2"
                testId="toolbar-h2"
              >
                <Heading2 className="w-4 h-4" />
              </ToolbarButton>
              <ToolbarButton
                onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
                isActive={editor.isActive('heading', { level: 3 })}
                title="Heading 3"
                testId="toolbar-h3"
              >
                <Heading3 className="w-4 h-4" />
              </ToolbarButton>

              <ToolbarDivider />

              {/* Lists */}
              <ToolbarButton
                onClick={() => editor.chain().focus().toggleBulletList().run()}
                isActive={editor.isActive('bulletList')}
                title="Bullet List"
                testId="toolbar-bullet-list"
              >
                <List className="w-4 h-4" />
              </ToolbarButton>
              <ToolbarButton
                onClick={() => editor.chain().focus().toggleOrderedList().run()}
                isActive={editor.isActive('orderedList')}
                title="Numbered List"
                testId="toolbar-ordered-list"
              >
                <ListOrdered className="w-4 h-4" />
              </ToolbarButton>

              <ToolbarDivider />

              {/* Block elements */}
              <ToolbarButton
                onClick={() => editor.chain().focus().toggleBlockquote().run()}
                isActive={editor.isActive('blockquote')}
                title="Quote"
                testId="toolbar-blockquote"
              >
                <Quote className="w-4 h-4" />
              </ToolbarButton>
            </>
          )}

          {/* Code block */}
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
            isActive={editor.isActive('codeBlock')}
            title="Code Block"
            testId="toolbar-code-block"
          >
            <FileCode className="w-4 h-4" />
          </ToolbarButton>
        </div>
      )}

      {/* Editor Content */}
      <div className={isCodeMode ? 'font-mono text-sm bg-gray-900 text-gray-100' : ''}>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

export default BlockEditor;

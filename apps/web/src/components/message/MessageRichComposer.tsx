/**
 * MessageRichComposer - A mini Tiptap editor for rich text message composition
 *
 * Features:
 * - Rich text formatting: bold, italic, underline, strikethrough
 * - Inline code and code blocks
 * - Bullet lists and numbered lists
 * - Block quotes
 * - Compact toolbar (toggleable)
 * - Markdown shortcuts (e.g., **bold**, _italic_)
 * - Enter to send, Shift+Enter for newline
 *
 * TB101 Implementation
 */

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Placeholder from '@tiptap/extension-placeholder';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { common, createLowlight } from 'lowlight';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  forwardRef,
  useImperativeHandle,
} from 'react';
import {
  prepareContentForEditor,
  prepareContentForStorage,
} from '../../lib/markdown';
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Code,
  FileCode,
  List,
  ListOrdered,
  Quote,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

// Create lowlight instance with common languages
const lowlight = createLowlight(common);

// Detect platform for keyboard shortcut display
const isMac =
  typeof navigator !== 'undefined' &&
  /Mac|iPod|iPhone|iPad/.test(navigator.platform);
const modKey = isMac ? '⌘' : 'Ctrl';

interface MessageRichComposerProps {
  content: string;
  onChange: (content: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  disabled?: boolean;
  maxHeight?: number;
  minHeight?: number;
  channelName?: string;
}

export interface MessageRichComposerRef {
  focus: () => void;
  clear: () => void;
  isEmpty: () => boolean;
}

interface ToolbarButtonProps {
  onClick: () => void;
  isActive?: boolean;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
  testId?: string;
}

function ToolbarButton({
  onClick,
  isActive = false,
  disabled = false,
  title,
  children,
  testId,
}: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      data-testid={testId}
      className={`p-1.5 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${
        isActive ? 'bg-gray-200 text-blue-600' : 'text-gray-500'
      }`}
    >
      {children}
    </button>
  );
}

function ToolbarDivider() {
  return <div className="w-px h-5 bg-gray-200 mx-0.5" />;
}

export const MessageRichComposer = forwardRef<
  MessageRichComposerRef,
  MessageRichComposerProps
>(function MessageRichComposer(
  {
    content,
    onChange,
    onSubmit,
    placeholder = 'Message...',
    disabled = false,
    maxHeight = 200,
    minHeight = 60,
    channelName,
  },
  ref
) {
  const [showToolbar, setShowToolbar] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Convert content (Markdown or legacy HTML) to HTML for Tiptap editor
  const getInitialContent = useCallback(() => {
    if (!content) return '<p></p>';
    return prepareContentForEditor(content, 'markdown');
  }, [content]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false, // Disable default, use lowlight version
        heading: false, // Messages don't need headings
        dropcursor: false,
        gapcursor: false,
      }),
      Underline,
      Placeholder.configure({
        placeholder: channelName ? `Message ${channelName}...` : placeholder,
      }),
      CodeBlockLowlight.configure({
        lowlight,
      }),
    ],
    content: getInitialContent(),
    editable: !disabled,
    onUpdate: ({ editor }) => {
      // Convert HTML to Markdown for storage
      const html = editor.getHTML();
      const markdown = prepareContentForStorage(html, 'markdown');
      onChange(markdown);
    },
    editorProps: {
      attributes: {
        class:
          'prose prose-sm max-w-none focus:outline-none min-h-[40px] px-3 py-2',
        'data-testid': 'message-input',
        style: `max-height: ${maxHeight - 40}px; overflow-y: auto;`,
      },
      handleKeyDown: (_view, event) => {
        // Enter to send, Shift+Enter for newline
        if (event.key === 'Enter' && !event.shiftKey && !event.metaKey && !event.ctrlKey) {
          // Don't send if content is in a list or code block (allow natural enter behavior)
          const isInList = editor?.isActive('bulletList') || editor?.isActive('orderedList');
          const isInCodeBlock = editor?.isActive('codeBlock');

          if (!isInList && !isInCodeBlock) {
            event.preventDefault();
            onSubmit();
            return true;
          }
        }
        return false;
      },
    },
  });

  // Expose methods via ref
  useImperativeHandle(ref, () => ({
    focus: () => editor?.commands.focus(),
    clear: () => {
      editor?.commands.clearContent();
      editor?.commands.focus();
    },
    isEmpty: () => {
      if (!editor) return true;
      const text = editor.getText().trim();
      return text.length === 0;
    },
  }));

  // Update editor content when prop changes (for clearing)
  useEffect(() => {
    if (editor && !editor.isFocused) {
      const currentText = editor.getText().trim();
      // Only reset if content was cleared externally
      if (content === '' && currentText !== '') {
        editor.commands.clearContent();
      }
    }
  }, [editor, content]);

  // Sync disabled state
  useEffect(() => {
    if (editor) {
      editor.setEditable(!disabled);
    }
  }, [editor, disabled]);

  // Auto-focus when channel name changes (new channel selected)
  useEffect(() => {
    if (editor && channelName) {
      editor.commands.focus();
    }
  }, [editor, channelName]);

  if (!editor) {
    return (
      <div
        data-testid="message-rich-composer-loading"
        className="px-3 py-2 text-gray-400 text-sm"
      >
        Loading editor...
      </div>
    );
  }

  const toolbarActions = [
    {
      id: 'bold',
      icon: <Bold className="w-4 h-4" />,
      title: `Bold (${modKey}B)`,
      action: () => editor.chain().focus().toggleBold().run(),
      isActive: editor.isActive('bold'),
    },
    {
      id: 'italic',
      icon: <Italic className="w-4 h-4" />,
      title: `Italic (${modKey}I)`,
      action: () => editor.chain().focus().toggleItalic().run(),
      isActive: editor.isActive('italic'),
    },
    {
      id: 'underline',
      icon: <UnderlineIcon className="w-4 h-4" />,
      title: `Underline (${modKey}U)`,
      action: () => editor.chain().focus().toggleUnderline().run(),
      isActive: editor.isActive('underline'),
    },
    {
      id: 'strike',
      icon: <Strikethrough className="w-4 h-4" />,
      title: 'Strikethrough',
      action: () => editor.chain().focus().toggleStrike().run(),
      isActive: editor.isActive('strike'),
    },
    { id: 'divider1', type: 'divider' },
    {
      id: 'code',
      icon: <Code className="w-4 h-4" />,
      title: `Inline Code (${modKey}E)`,
      action: () => editor.chain().focus().toggleCode().run(),
      isActive: editor.isActive('code'),
    },
    {
      id: 'codeBlock',
      icon: <FileCode className="w-4 h-4" />,
      title: 'Code Block',
      action: () => editor.chain().focus().toggleCodeBlock().run(),
      isActive: editor.isActive('codeBlock'),
    },
    { id: 'divider2', type: 'divider' },
    {
      id: 'bulletList',
      icon: <List className="w-4 h-4" />,
      title: 'Bullet List',
      action: () => editor.chain().focus().toggleBulletList().run(),
      isActive: editor.isActive('bulletList'),
    },
    {
      id: 'orderedList',
      icon: <ListOrdered className="w-4 h-4" />,
      title: 'Numbered List',
      action: () => editor.chain().focus().toggleOrderedList().run(),
      isActive: editor.isActive('orderedList'),
    },
    { id: 'divider3', type: 'divider' },
    {
      id: 'blockquote',
      icon: <Quote className="w-4 h-4" />,
      title: 'Block Quote',
      action: () => editor.chain().focus().toggleBlockquote().run(),
      isActive: editor.isActive('blockquote'),
    },
  ];

  return (
    <div
      ref={containerRef}
      data-testid="message-rich-composer"
      className={`border border-gray-300 rounded-lg bg-white transition-all ${
        disabled ? 'opacity-50' : ''
      }`}
      style={{ minHeight: `${minHeight}px` }}
    >
      {/* Editor Content */}
      <div
        className="message-rich-editor"
        style={{
          maxHeight: `${maxHeight - (showToolbar ? 40 : 0)}px`,
          overflow: 'auto',
        }}
      >
        <EditorContent editor={editor} />
      </div>

      {/* Compact Toolbar (toggleable) */}
      <div className="flex items-center justify-between border-t border-gray-100 px-2 py-1 bg-gray-50 rounded-b-lg">
        <div className="flex items-center gap-0.5">
          {showToolbar ? (
            <>
              {toolbarActions.map((action) =>
                action.type === 'divider' ? (
                  <ToolbarDivider key={action.id} />
                ) : (
                  <ToolbarButton
                    key={action.id}
                    onClick={action.action!}
                    isActive={action.isActive}
                    disabled={disabled}
                    title={action.title!}
                    testId={`message-toolbar-${action.id}`}
                  >
                    {action.icon}
                  </ToolbarButton>
                )
              )}
            </>
          ) : (
            // Condensed toolbar: just show commonly used formatting
            <>
              <ToolbarButton
                onClick={() => editor.chain().focus().toggleBold().run()}
                isActive={editor.isActive('bold')}
                disabled={disabled}
                title={`Bold (${modKey}B)`}
                testId="message-toolbar-bold"
              >
                <Bold className="w-4 h-4" />
              </ToolbarButton>
              <ToolbarButton
                onClick={() => editor.chain().focus().toggleItalic().run()}
                isActive={editor.isActive('italic')}
                disabled={disabled}
                title={`Italic (${modKey}I)`}
                testId="message-toolbar-italic"
              >
                <Italic className="w-4 h-4" />
              </ToolbarButton>
              <ToolbarButton
                onClick={() => editor.chain().focus().toggleCode().run()}
                isActive={editor.isActive('code')}
                disabled={disabled}
                title={`Inline Code (${modKey}E)`}
                testId="message-toolbar-code"
              >
                <Code className="w-4 h-4" />
              </ToolbarButton>
            </>
          )}
        </div>

        {/* Toggle toolbar button */}
        <button
          type="button"
          onClick={() => setShowToolbar(!showToolbar)}
          className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
          title={showToolbar ? 'Hide formatting options' : 'Show more formatting options'}
          data-testid="message-toolbar-toggle"
        >
          {showToolbar ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronUp className="w-4 h-4" />
          )}
        </button>
      </div>
    </div>
  );
});

export default MessageRichComposer;

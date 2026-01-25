/**
 * BlockEditor - Tiptap-based block editor for document content
 *
 * Features:
 * - Block-based editing with paragraphs, headings, lists, code
 * - Markdown-like shortcuts (# for headings, - for lists)
 * - Undo/Redo support
 * - Keyboard shortcuts with tooltip hints
 * - Responsive toolbar with overflow menu
 */

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import Highlight from '@tiptap/extension-highlight';
import GlobalDragHandle from 'tiptap-extension-global-drag-handle';
import { SlashCommands } from './SlashCommands';
import { common, createLowlight } from 'lowlight';
import { useCallback, useEffect, useState, useRef } from 'react';
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
  Strikethrough,
  Highlighter,
  Minus,
  MoreHorizontal,
} from 'lucide-react';
import { Tooltip } from '../ui/Tooltip';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';

// Create lowlight instance with common languages
const lowlight = createLowlight(common);

// Detect platform for keyboard shortcut display
const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
const modKey = isMac ? '⌘' : 'Ctrl';

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
  label: string;
  shortcut?: string;
  testId?: string;
}

function ToolbarButton({
  onClick,
  isActive = false,
  disabled = false,
  children,
  label,
  shortcut,
  testId,
}: ToolbarButtonProps) {
  return (
    <Tooltip content={label} shortcut={shortcut}>
      <button
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        data-testid={testId}
        className={`p-1.5 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${
          isActive ? 'bg-gray-200 text-blue-600' : 'text-gray-600'
        }`}
      >
        {children}
      </button>
    </Tooltip>
  );
}

function ToolbarDivider() {
  return <div className="w-px h-6 bg-gray-200 mx-1" data-testid="toolbar-divider" />;
}

// Menu item for overflow dropdown
interface MenuItemProps {
  onClick: () => void;
  isActive?: boolean;
  disabled?: boolean;
  icon: React.ReactNode;
  label: string;
  shortcut?: string;
}

function MenuItem({ onClick, isActive, disabled, icon, label, shortcut }: MenuItemProps) {
  return (
    <DropdownMenu.Item
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center justify-between gap-3 px-3 py-2 text-sm rounded cursor-pointer outline-none
                  ${isActive ? 'bg-blue-50 text-blue-700' : 'text-gray-700'}
                  ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-100'}
                  data-[highlighted]:bg-gray-100`}
    >
      <span className="flex items-center gap-2">
        {icon}
        <span>{label}</span>
      </span>
      {shortcut && (
        <kbd className="text-xs text-gray-400 font-mono">{shortcut}</kbd>
      )}
    </DropdownMenu.Item>
  );
}

export function BlockEditor({
  content,
  contentType,
  onChange,
  onSave,
  placeholder = 'Start writing...',
  readOnly = false,
}: BlockEditorProps) {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [showOverflow, setShowOverflow] = useState(false);

  // Convert plain text to HTML for Tiptap
  const textToHtml = useCallback((text: string) => {
    if (!text) return '<p></p>';
    const escaped = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    const withBreaks = escaped.replace(/\n/g, '<br>');
    return `<p>${withBreaks}</p>`;
  }, []);

  // Convert HTML back to plain text with newlines
  const htmlToText = useCallback((html: string) => {
    if (!html) return '';
    let text = html.replace(/<br\s*\/?>/gi, '\n');
    text = text.replace(/<\/(p|div|h[1-6]|li|blockquote)>/gi, '\n');
    text = text.replace(/<[^>]+>/g, '');
    const div = document.createElement('div');
    div.innerHTML = text;
    text = div.textContent || '';
    return text.replace(/\n$/, '');
  }, []);

  // Determine initial content format
  const getInitialContent = useCallback(() => {
    if (!content) return '';

    if (contentType === 'json') {
      try {
        const formatted = JSON.stringify(JSON.parse(content), null, 2);
        return `<pre><code>${formatted}</code></pre>`;
      } catch {
        return textToHtml(content);
      }
    }

    return textToHtml(content);
  }, [content, contentType, textToHtml]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false,
      }),
      Placeholder.configure({
        placeholder,
      }),
      CodeBlockLowlight.configure({
        lowlight,
        defaultLanguage: contentType === 'json' ? 'json' : undefined,
      }),
      Highlight.configure({
        multicolor: false,
      }),
      GlobalDragHandle.configure({
        dragHandleWidth: 20,
        scrollTreshold: 100,
      }),
      SlashCommands,
    ],
    content: getInitialContent(),
    editable: !readOnly,
    onUpdate: ({ editor }) => {
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
        if ((event.metaKey || event.ctrlKey) && event.key === 's') {
          event.preventDefault();
          onSave?.();
          return true;
        }
        return false;
      },
    },
  });

  // Update editor content when prop changes
  useEffect(() => {
    if (editor && !editor.isFocused) {
      const currentText = editor.getText();
      const newContent = getInitialContent();
      if (currentText !== newContent) {
        editor.commands.setContent(newContent);
      }
    }
  }, [editor, content, getInitialContent]);

  // Responsive toolbar: detect when to show overflow menu
  useEffect(() => {
    const checkOverflow = () => {
      if (toolbarRef.current) {
        const containerWidth = toolbarRef.current.offsetWidth;
        // Show overflow if container is narrower than 420px
        setShowOverflow(containerWidth < 420);
      }
    };

    checkOverflow();
    window.addEventListener('resize', checkOverflow);

    // Also observe the element's size changes
    const resizeObserver = new ResizeObserver(checkOverflow);
    if (toolbarRef.current) {
      resizeObserver.observe(toolbarRef.current);
    }

    return () => {
      window.removeEventListener('resize', checkOverflow);
      resizeObserver.disconnect();
    };
  }, []);

  if (!editor) {
    return (
      <div data-testid="block-editor-loading" className="p-4 text-gray-500">
        Loading editor...
      </div>
    );
  }

  const isCodeMode = contentType === 'json';

  // Toolbar actions grouped by category
  const historyActions = [
    {
      id: 'undo',
      icon: <Undo className="w-4 h-4" />,
      label: 'Undo',
      shortcut: `${modKey}Z`,
      action: () => editor.chain().focus().undo().run(),
      disabled: !editor.can().undo(),
      isActive: false,
    },
    {
      id: 'redo',
      icon: <Redo className="w-4 h-4" />,
      label: 'Redo',
      shortcut: `${modKey}⇧Z`,
      action: () => editor.chain().focus().redo().run(),
      disabled: !editor.can().redo(),
      isActive: false,
    },
  ];

  const textActions = [
    {
      id: 'bold',
      icon: <Bold className="w-4 h-4" />,
      label: 'Bold',
      shortcut: `${modKey}B`,
      action: () => editor.chain().focus().toggleBold().run(),
      isActive: editor.isActive('bold'),
    },
    {
      id: 'italic',
      icon: <Italic className="w-4 h-4" />,
      label: 'Italic',
      shortcut: `${modKey}I`,
      action: () => editor.chain().focus().toggleItalic().run(),
      isActive: editor.isActive('italic'),
    },
    {
      id: 'code',
      icon: <Code className="w-4 h-4" />,
      label: 'Inline Code',
      shortcut: `${modKey}E`,
      action: () => editor.chain().focus().toggleCode().run(),
      isActive: editor.isActive('code'),
    },
    {
      id: 'strikethrough',
      icon: <Strikethrough className="w-4 h-4" />,
      label: 'Strikethrough',
      shortcut: `${modKey}⇧S`,
      action: () => editor.chain().focus().toggleStrike().run(),
      isActive: editor.isActive('strike'),
    },
    {
      id: 'highlight',
      icon: <Highlighter className="w-4 h-4" />,
      label: 'Highlight',
      shortcut: `${modKey}⇧H`,
      action: () => editor.chain().focus().toggleHighlight().run(),
      isActive: editor.isActive('highlight'),
    },
  ];

  const headingActions = [
    {
      id: 'h1',
      icon: <Heading1 className="w-4 h-4" />,
      label: 'Heading 1',
      shortcut: `${modKey}⌥1`,
      action: () => editor.chain().focus().toggleHeading({ level: 1 }).run(),
      isActive: editor.isActive('heading', { level: 1 }),
    },
    {
      id: 'h2',
      icon: <Heading2 className="w-4 h-4" />,
      label: 'Heading 2',
      shortcut: `${modKey}⌥2`,
      action: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
      isActive: editor.isActive('heading', { level: 2 }),
    },
    {
      id: 'h3',
      icon: <Heading3 className="w-4 h-4" />,
      label: 'Heading 3',
      shortcut: `${modKey}⌥3`,
      action: () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
      isActive: editor.isActive('heading', { level: 3 }),
    },
  ];

  const listActions = [
    {
      id: 'bullet-list',
      icon: <List className="w-4 h-4" />,
      label: 'Bullet List',
      shortcut: `${modKey}⇧8`,
      action: () => editor.chain().focus().toggleBulletList().run(),
      isActive: editor.isActive('bulletList'),
    },
    {
      id: 'ordered-list',
      icon: <ListOrdered className="w-4 h-4" />,
      label: 'Numbered List',
      shortcut: `${modKey}⇧7`,
      action: () => editor.chain().focus().toggleOrderedList().run(),
      isActive: editor.isActive('orderedList'),
    },
  ];

  const blockActions = [
    {
      id: 'blockquote',
      icon: <Quote className="w-4 h-4" />,
      label: 'Quote',
      shortcut: `${modKey}⇧B`,
      action: () => editor.chain().focus().toggleBlockquote().run(),
      isActive: editor.isActive('blockquote'),
    },
    {
      id: 'code-block',
      icon: <FileCode className="w-4 h-4" />,
      label: 'Code Block',
      shortcut: `${modKey}⌥C`,
      action: () => editor.chain().focus().toggleCodeBlock().run(),
      isActive: editor.isActive('codeBlock'),
    },
    {
      id: 'horizontal-rule',
      icon: <Minus className="w-4 h-4" />,
      label: 'Horizontal Rule',
      action: () => editor.chain().focus().setHorizontalRule().run(),
      isActive: false,
    },
  ];

  // Define action type with optional disabled
  type ToolbarAction = {
    id: string;
    icon: React.ReactNode;
    label: string;
    shortcut?: string;
    action: () => boolean;
    isActive: boolean;
    disabled?: boolean;
  };

  // Render toolbar buttons
  const renderToolbarButton = (action: ToolbarAction) => (
    <ToolbarButton
      key={action.id}
      onClick={action.action}
      isActive={action.isActive}
      disabled={action.disabled}
      label={action.label}
      shortcut={action.shortcut}
      testId={`toolbar-${action.id}`}
    >
      {action.icon}
    </ToolbarButton>
  );

  return (
    <div data-testid="block-editor" className="border border-gray-200 rounded-lg overflow-hidden bg-white">
      {/* Toolbar */}
      {!readOnly && (
        <div
          ref={toolbarRef}
          data-testid="block-editor-toolbar"
          className="flex items-center gap-0.5 px-2 py-1.5 border-b border-gray-200 bg-gray-50 flex-wrap"
        >
          {/* History - always visible */}
          {historyActions.map(renderToolbarButton)}

          <ToolbarDivider />

          {/* Show full toolbar or compact with overflow */}
          {!showOverflow ? (
            <>
              {/* Text formatting - only for non-code modes */}
              {!isCodeMode && (
                <>
                  {textActions.map(renderToolbarButton)}
                  <ToolbarDivider />
                  {headingActions.map(renderToolbarButton)}
                  <ToolbarDivider />
                  {listActions.map(renderToolbarButton)}
                  <ToolbarDivider />
                </>
              )}
              {/* Block elements */}
              {blockActions.map(renderToolbarButton)}
            </>
          ) : (
            <>
              {/* Compact mode: show essential buttons + overflow menu */}
              {!isCodeMode && (
                <>
                  {textActions.slice(0, 3).map(renderToolbarButton)}
                  <ToolbarDivider />
                </>
              )}

              {/* Overflow menu */}
              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                  <button
                    className="p-1.5 rounded hover:bg-gray-100 text-gray-600 transition-colors"
                    aria-label="More formatting options"
                    data-testid="toolbar-overflow-menu"
                  >
                    <MoreHorizontal className="w-4 h-4" />
                  </button>
                </DropdownMenu.Trigger>

                <DropdownMenu.Portal>
                  <DropdownMenu.Content
                    align="end"
                    sideOffset={4}
                    className="z-50 min-w-[200px] p-1 bg-white rounded-lg shadow-lg border border-gray-200
                               animate-in fade-in-0 zoom-in-95 data-[side=bottom]:slide-in-from-top-2"
                    data-testid="toolbar-overflow-content"
                  >
                    {!isCodeMode && (
                      <>
                        <DropdownMenu.Label className="px-3 py-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                          Text
                        </DropdownMenu.Label>
                        {textActions.slice(3).map(action => (
                          <MenuItem key={action.id} {...action} onClick={action.action} />
                        ))}
                        <DropdownMenu.Separator className="h-px my-1 bg-gray-200" />

                        <DropdownMenu.Label className="px-3 py-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                          Headings
                        </DropdownMenu.Label>
                        {headingActions.map(action => (
                          <MenuItem key={action.id} {...action} onClick={action.action} />
                        ))}
                        <DropdownMenu.Separator className="h-px my-1 bg-gray-200" />

                        <DropdownMenu.Label className="px-3 py-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                          Lists
                        </DropdownMenu.Label>
                        {listActions.map(action => (
                          <MenuItem key={action.id} {...action} onClick={action.action} />
                        ))}
                        <DropdownMenu.Separator className="h-px my-1 bg-gray-200" />
                      </>
                    )}

                    <DropdownMenu.Label className="px-3 py-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Blocks
                    </DropdownMenu.Label>
                    {blockActions.map(action => (
                      <MenuItem key={action.id} {...action} onClick={action.action} />
                    ))}
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
            </>
          )}
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

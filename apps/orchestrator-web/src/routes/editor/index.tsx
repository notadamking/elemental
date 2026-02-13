/**
 * FileEditorPage - File editor with Monaco and multi-tab support
 *
 * Displays files in a Monaco editor with a VSCode-style sidebar.
 * Features:
 * - Activity bar with File Explorer and Search icons
 * - File tree sidebar for browsing workspace files and documents
 * - Search sidebar panel for full-text search across files
 * - Monaco editor with syntax highlighting
 * - Multi-tab support with preview tabs and dirty indicators
 * - Drag-and-drop tab reordering
 *
 * Supports two modes:
 * 1. Local workspace mode: Browse and view files from a local directory
 *    using the File System Access API
 * 2. Documents mode: Browse documents from the API document library
 */

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import type * as monaco from 'monaco-editor';
import {
  FileCode,
  Loader2,
  AlertCircle,
  RefreshCw,
  HardDrive,
  Database,
  Braces,
  Files,
  Search,
  Save,
  CheckCircle,
  Settings,
  Puzzle,
} from 'lucide-react';
import { EditorFileTree, type FileTreeNodeData, type FileSource } from '../../components/editor/EditorFileTree';
import { EditorSearchPanel, type EditorSearchPanelRef } from '../../components/editor/EditorSearchPanel';
import { EditorSettingsPanel } from '../../components/editor/EditorSettingsPanel';
import { EditorExtensionsPanel } from '../../components/editor/EditorExtensionsPanel';
import { EditorTabBar, type EditorTab } from '../../components/editor/EditorTabBar';
import { LspMonacoEditor } from '../../components/editor/LspMonacoEditor';
import { ExtensionDetailPage } from '../../components/editor/ExtensionDetailPage';
import type { OpenVSXExtensionSummary } from '../../lib/openvsx/client';
import { useAllDocuments } from '../../api/hooks/useAllElements';
import { useWorkspace } from '../../contexts';
import type { Document } from '../../api/hooks/useAllElements';
import {
  getMonacoLanguageFromContentType,
  detectLanguageFromFilename,
} from '../../lib/language-detection';
import { isPotentialLspLanguage, type LspState } from '../../lib/monaco-lsp';
import { initializeMonaco } from '../../lib/monaco-init';

// ============================================================================
// Types
// ============================================================================

/** Active sidebar panel */
type SidebarPanel = 'files' | 'search' | 'extensions' | 'settings';

// ============================================================================
// Hook to fetch document content
// ============================================================================

function useDocumentContent(documentId: string | null) {
  return useQuery({
    queryKey: ['document', documentId, 'content'],
    queryFn: async () => {
      if (!documentId) return null;
      const response = await fetch(`/api/documents/${documentId}`);
      if (!response.ok) throw new Error('Failed to fetch document');
      const doc = await response.json();
      return doc;
    },
    enabled: !!documentId,
    staleTime: 30000,
  });
}

// ============================================================================
// Language detection (using shared utilities)
// ============================================================================

function getLanguageFromDocument(doc: Document | null): string {
  if (!doc) return 'plaintext';
  return getMonacoLanguageFromContentType(doc.contentType, doc.title);
}

// ============================================================================
// Empty state component
// ============================================================================

function NoFileSelected() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-6" data-testid="editor-no-file-selected">
      <FileCode className="w-12 h-12 text-[var(--color-text-muted)] mb-4" />
      <h3 className="text-lg font-medium text-[var(--color-text)] mb-2">Select a File</h3>
      <p className="text-sm text-[var(--color-text-secondary)] max-w-xs">
        Choose a file from the sidebar to view its content in the editor.
      </p>
    </div>
  );
}

// ============================================================================
// Source toggle component
// ============================================================================

interface SourceToggleProps {
  source: FileSource;
  onSourceChange: (source: FileSource) => void;
  isWorkspaceOpen: boolean;
  workspaceName: string | null;
}

function SourceToggle({ source, onSourceChange, isWorkspaceOpen, workspaceName }: SourceToggleProps) {
  return (
    <div className="flex items-center gap-1 p-1 bg-[var(--color-surface-hover)] rounded-lg">
      <button
        onClick={() => onSourceChange('workspace')}
        className={`
          flex items-center gap-1.5 px-2 py-1 text-xs font-medium rounded transition-colors
          ${source === 'workspace'
            ? 'bg-[var(--color-surface)] text-[var(--color-text)] shadow-sm'
            : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text)]'
          }
        `}
        title={isWorkspaceOpen ? `Workspace: ${workspaceName}` : 'No workspace open'}
      >
        <HardDrive className="w-3 h-3" />
        Local
      </button>
      <button
        onClick={() => onSourceChange('documents')}
        className={`
          flex items-center gap-1.5 px-2 py-1 text-xs font-medium rounded transition-colors
          ${source === 'documents'
            ? 'bg-[var(--color-surface)] text-[var(--color-text)] shadow-sm'
            : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text)]'
          }
        `}
      >
        <Database className="w-3 h-3" />
        Docs
      </button>
    </div>
  );
}

// ============================================================================
// Activity Bar Component
// ============================================================================

interface ActivityBarProps {
  activePanel: SidebarPanel;
  onPanelChange: (panel: SidebarPanel) => void;
}

function ActivityBar({ activePanel, onPanelChange }: ActivityBarProps) {
  const topItems: { id: SidebarPanel; icon: React.ComponentType<{ className?: string }>; label: string }[] = [
    { id: 'files', icon: Files, label: 'Explorer' },
    { id: 'search', icon: Search, label: 'Search' },
    { id: 'extensions', icon: Puzzle, label: 'Extensions' },
  ];

  const bottomItems: { id: SidebarPanel; icon: React.ComponentType<{ className?: string }>; label: string }[] = [
    { id: 'settings', icon: Settings, label: 'Settings' },
  ];

  const renderItem = (item: { id: SidebarPanel; icon: React.ComponentType<{ className?: string }>; label: string }) => {
    const Icon = item.icon;
    const isActive = activePanel === item.id;
    return (
      <button
        key={item.id}
        onClick={() => onPanelChange(item.id)}
        className={`
          w-10 h-10 flex items-center justify-center rounded-md transition-colors
          ${isActive
            ? 'bg-[var(--color-surface)] text-[var(--color-text)] shadow-sm'
            : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface)]'
          }
        `}
        title={item.label}
        data-testid={`activity-bar-${item.id}`}
        aria-pressed={isActive}
      >
        <Icon className="w-5 h-5" />
      </button>
    );
  };

  return (
    <div
      className="w-12 flex-shrink-0 bg-[var(--color-surface-hover)] border-r border-[var(--color-border)] flex flex-col justify-between items-center py-2"
      data-testid="editor-activity-bar"
    >
      {/* Top items: Explorer, Search */}
      <div className="flex flex-col items-center gap-1">
        {topItems.map(renderItem)}
      </div>

      {/* Bottom items: Settings */}
      <div className="flex flex-col items-center gap-1">
        {bottomItems.map(renderItem)}
      </div>
    </div>
  );
}

// ============================================================================
// Main component
// ============================================================================

export function FileEditorPage() {
  // Monaco initialization state - must complete before rendering editor
  const [monacoReady, setMonacoReady] = useState(false);
  const [monacoError, setMonacoError] = useState<string | null>(null);

  // Tab state - array of open tabs and active tab ID
  const [tabs, setTabs] = useState<EditorTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  // Ref to track current activeTabId for use in setTabs callbacks
  const activeTabIdRef = useRef<string | null>(null);
  activeTabIdRef.current = activeTabId;
  // Ref to track current tabs for synchronous checks (avoids stale closure issues)
  const tabsRef = useRef<EditorTab[]>([]);
  tabsRef.current = tabs;
  // Ref to track files currently being loaded (prevents duplicate concurrent loads)
  const loadingFilesRef = useRef<Set<string>>(new Set());

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [fileSource, setFileSource] = useState<FileSource>('workspace');
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [activePanel, setActivePanel] = useState<SidebarPanel>('files');
  const [editorTheme, setEditorTheme] = useState(() => localStorage.getItem('editor.theme') || 'elemental-dark');
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const searchPanelRef = useRef<EditorSearchPanelRef>(null);
  const [lspState, setLspState] = useState<LspState>('idle');

  // Initialize Monaco before rendering the editor
  useEffect(() => {
    let mounted = true;

    initializeMonaco()
      .then(() => {
        if (mounted) {
          setMonacoReady(true);
        }
      })
      .catch((err) => {
        if (mounted) {
          console.error('[FileEditorPage] Failed to initialize Monaco:', err);
          setMonacoError(err instanceof Error ? err.message : 'Failed to initialize editor');
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  // Workspace state from context (server-backed, always supported)
  const {
    isOpen: isWorkspaceOpen,
    workspaceName,
    entries: workspaceEntries,
    isLoading: workspaceLoading,
    error: workspaceError,
    deleteFile,
    renameFile,
    readFileByPath,
    writeFile,
    refreshTree,
  } = useWorkspace();

  // Save state
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Fetch all documents for documents mode
  const { data: documents = [], isLoading: documentsLoading, isError: documentsError } = useAllDocuments();

  // Fetch selected document content (for documents mode)
  const { data: selectedDocument, isLoading: docContentLoading, isError: docContentError } = useDocumentContent(
    fileSource === 'documents' ? selectedId : null
  );

  // Get the active tab
  const activeTab = useMemo(() => {
    return tabs.find(t => t.id === activeTabId) || null;
  }, [tabs, activeTabId]);

  // Capture current editor content into tab state.
  // Called synchronously before tab switches so content is preserved.
  // Uses refs to avoid stale closure issues.
  const captureEditorContent = useCallback(() => {
    const currentTabId = activeTabIdRef.current;
    if (!currentTabId || !editorRef.current) return;
    const model = editorRef.current.getModel();
    if (!model) return;
    const content = model.getValue();
    setTabs(prev => {
      const tab = prev.find(t => t.id === currentTabId);
      if (!tab || tab.content === content) return prev;
      return prev.map(t => t.id === currentTabId ? { ...t, content } : t);
    });
  }, []);

  // Update tab when document content loads (for documents mode)
  useEffect(() => {
    if (fileSource === 'documents' && selectedDocument && selectedId) {
      captureEditorContent();
      const newTab: EditorTab = {
        id: selectedId,
        name: selectedDocument.title || 'Untitled',
        path: selectedDocument.title || 'Untitled',
        content: selectedDocument.content || '',
        language: getLanguageFromDocument(selectedDocument),
        source: 'documents',
        isPreview: false,
        isDirty: false,
      };

      setTabs(prevTabs => {
        // Check if this file is already open
        const existingIndex = prevTabs.findIndex(t => t.id === selectedId);
        if (existingIndex !== -1) {
          // Update existing tab
          const updated = [...prevTabs];
          updated[existingIndex] = { ...updated[existingIndex], ...newTab, isPreview: updated[existingIndex].isPreview };
          return updated;
        }

        // Replace the active tab if it's not dirty
        const currentActiveId = activeTabIdRef.current;
        const activeIndex = prevTabs.findIndex(t => t.id === currentActiveId);
        if (activeIndex !== -1 && !prevTabs[activeIndex].isDirty) {
          const updated = [...prevTabs];
          updated[activeIndex] = newTab;
          return updated;
        }

        // Add as new tab
        return [...prevTabs, newTab];
      });

      setActiveTabId(selectedId);
    }
  }, [fileSource, selectedDocument, selectedId, captureEditorContent]);

  // Handle file selection from tree
  const handleSelectFile = useCallback(
    async (node: FileTreeNodeData, pinTab = false) => {
      if (node.nodeType === 'folder') return;

      setSelectedId(node.id);
      setFileError(null);

      // Capture current editor content before switching tabs
      if (node.id !== activeTabIdRef.current) {
        captureEditorContent();
      }

      // Check if file is already open (use ref for latest state, not stale closure)
      const existingTab = tabsRef.current.find(t => t.id === node.id);
      if (existingTab) {
        setActiveTabId(node.id);
        if (pinTab) {
          // Pin the tab (make it non-preview)
          setTabs(prevTabs =>
            prevTabs.map(t => t.id === node.id ? { ...t, isPreview: false } : t)
          );
        }
        return;
      }

      // Prevent duplicate concurrent loads of the same file
      if (loadingFilesRef.current.has(node.id)) return;

      if (fileSource === 'workspace') {
        // Mark file as loading
        loadingFilesRef.current.add(node.id);
        setIsLoadingFile(true);
        try {
          const result = await readFileByPath(node.path);
          if (!result) {
            throw new Error('File not found');
          }
          const newTab: EditorTab = {
            id: node.id,
            name: result.name,
            path: result.path,
            content: result.content,
            language: result.language || 'plaintext',
            source: 'workspace',
            isPreview: !pinTab,
            isDirty: false,
          };

          setTabs(prevTabs => {
            // Check if file is already open (using latest state inside setTabs)
            const existingIndex = prevTabs.findIndex(t => t.id === node.id);
            if (existingIndex !== -1) {
              // File already open — just update preview status if pinning
              if (pinTab) {
                const updated = [...prevTabs];
                updated[existingIndex] = { ...updated[existingIndex], isPreview: false };
                return updated;
              }
              return prevTabs;
            }

            // If pinning, just add a new tab
            if (pinTab) {
              return [...prevTabs, newTab];
            }

            // Replace the active tab if it's not dirty
            const currentActiveId = activeTabIdRef.current;
            const activeIndex = prevTabs.findIndex(t => t.id === currentActiveId);
            if (activeIndex !== -1 && !prevTabs[activeIndex].isDirty) {
              const updated = [...prevTabs];
              updated[activeIndex] = newTab;
              return updated;
            }

            // Add as new tab
            return [...prevTabs, newTab];
          });

          setActiveTabId(node.id);
        } catch (error) {
          setFileError(error instanceof Error ? error.message : 'Failed to read file');
        } finally {
          loadingFilesRef.current.delete(node.id);
          setIsLoadingFile(false);
        }
      }
      // For documents mode, the useEffect above handles loading
    },
    [fileSource, readFileByPath, captureEditorContent]
  );

  // Handle double-click to pin tab (make it non-preview)
  const handleDoubleClickFile = useCallback(
    async (node: FileTreeNodeData) => {
      await handleSelectFile(node, true);
    },
    [handleSelectFile]
  );

  // Handle delete file from context menu
  const handleDeleteFile = useCallback(async (path: string) => {
    try {
      await deleteFile(path);
      // Close any open tab for this file
      setTabs(prevTabs => {
        const newTabs = prevTabs.filter(t => t.path !== path && !t.path.startsWith(path + '/'));
        // If active tab was deleted, switch to another
        if (activeTabIdRef.current) {
          const activeTab = newTabs.find(t => t.id === activeTabIdRef.current);
          if (!activeTab && newTabs.length > 0) {
            setActiveTabId(newTabs[0].id);
            setSelectedId(newTabs[0].id);
          } else if (newTabs.length === 0) {
            setActiveTabId(null);
            setSelectedId(null);
          }
        }
        return newTabs;
      });
    } catch (error) {
      console.error('Failed to delete file:', error);
      throw error;
    }
  }, [deleteFile]);

  // Handle rename file from context menu
  const handleRenameFile = useCallback(async (oldPath: string, newPath: string) => {
    try {
      await renameFile(oldPath, newPath);
      // Update any open tabs that reference the old path
      setTabs(prevTabs => prevTabs.map(t => {
        if (t.path === oldPath) {
          const newName = newPath.split('/').pop() || t.name;
          return { ...t, id: newPath, path: newPath, name: newName };
        }
        // Handle files inside a renamed directory
        if (t.path.startsWith(oldPath + '/')) {
          const newTabPath = newPath + t.path.slice(oldPath.length);
          return { ...t, id: newTabPath, path: newTabPath };
        }
        return t;
      }));
      // Update activeTabId and selectedId if they referenced the old path
      if (activeTabIdRef.current === oldPath) {
        setActiveTabId(newPath);
        setSelectedId(newPath);
      }
    } catch (error) {
      console.error('Failed to rename file:', error);
      throw error;
    }
  }, [renameFile]);

  // Handle paste file from context menu (copy or cut operations)
  const handlePasteFile = useCallback(async (sourcePath: string, destFolder: string, operation: 'copy' | 'cut') => {
    try {
      const fileName = sourcePath.split('/').pop() || 'file';
      const destPath = destFolder ? `${destFolder}/${fileName}` : fileName;

      if (operation === 'copy') {
        // Read source file content, then write to destination
        const content = await readFileByPath(sourcePath);
        if (content) {
          await writeFile({ id: destPath, name: fileName, type: 'file', path: destPath }, content.content);
        }
      } else {
        // Cut = rename/move
        await renameFile(sourcePath, destPath);
        // Update tabs same as rename
        setTabs(prevTabs => prevTabs.map(t => {
          if (t.path === sourcePath) {
            return { ...t, id: destPath, path: destPath };
          }
          return t;
        }));
      }
      await refreshTree();
    } catch (error) {
      console.error('Failed to paste file:', error);
      throw error;
    }
  }, [readFileByPath, writeFile, renameFile, refreshTree]);

  // Handle search result selection - open file and navigate to line
  const handleSearchResultSelect = useCallback(
    async (path: string, line: number, column: number) => {
      // Capture current editor content before switching tabs
      captureEditorContent();

      // Check if this file is already open
      const existingTab = tabs.find(t => t.path === path);
      if (existingTab) {
        setActiveTabId(existingTab.id);
        // Navigate to the line
        setTimeout(() => {
          if (editorRef.current) {
            editorRef.current.revealLineInCenter(line);
            editorRef.current.setPosition({ lineNumber: line, column });
            editorRef.current.focus();
          }
        }, 50);
        return;
      }

      // Load the file by path
      setSelectedId(path);
      setFileError(null);
      setIsLoadingFile(true);

      try {
        const result = await readFileByPath(path);
        if (!result) {
          throw new Error('File not found');
        }
        const newTab: EditorTab = {
          id: path,
          name: result.name,
          path: result.path,
          content: result.content,
          language: result.language || 'plaintext',
          source: 'workspace',
          isPreview: true,
          isDirty: false,
        };

        setTabs(prevTabs => {
          // Find preview tab to replace
          const previewIndex = prevTabs.findIndex(t => t.isPreview && !t.isDirty);
          if (previewIndex !== -1) {
            const updated = [...prevTabs];
            updated[previewIndex] = newTab;
            return updated;
          }
          return [...prevTabs, newTab];
        });

        setActiveTabId(path);

        // Navigate to line after a short delay to ensure editor is ready
        setTimeout(() => {
          if (editorRef.current) {
            editorRef.current.revealLineInCenter(line);
            editorRef.current.setPosition({ lineNumber: line, column });
            editorRef.current.focus();
          }
        }, 100);
      } catch (error) {
        setFileError(error instanceof Error ? error.message : 'Failed to read file');
      } finally {
        setIsLoadingFile(false);
      }
    },
    [tabs, readFileByPath, captureEditorContent]
  );

  // Handle tab selection — capture current content before switching
  const handleTabSelect = useCallback((tabId: string) => {
    if (tabId !== activeTabId) {
      captureEditorContent();
    }
    setActiveTabId(tabId);
    const tab = tabs.find(t => t.id === tabId);
    if (tab) {
      setSelectedId(tabId);
    }
  }, [tabs, activeTabId, captureEditorContent]);

  // Handle tab close
  const handleTabClose = useCallback((tabId: string) => {
    setTabs(prevTabs => {
      const tabIndex = prevTabs.findIndex(t => t.id === tabId);
      if (tabIndex === -1) return prevTabs;

      const newTabs = prevTabs.filter(t => t.id !== tabId);

      // If we're closing the active tab, switch to another tab
      if (activeTabId === tabId && newTabs.length > 0) {
        // Prefer the tab to the left, or the first tab if none
        const newActiveIndex = Math.max(0, tabIndex - 1);
        setActiveTabId(newTabs[newActiveIndex]?.id || null);
        setSelectedId(newTabs[newActiveIndex]?.id || null);
      } else if (newTabs.length === 0) {
        setActiveTabId(null);
        setSelectedId(null);
      }

      return newTabs;
    });
  }, [activeTabId]);

  // Handle tabs reorder
  const handleTabsReorder = useCallback((newTabs: EditorTab[]) => {
    setTabs(newTabs);
  }, []);

  // Handle editor content change — lightweight notification from Monaco's onDidChangeModelContent.
  // No value is passed (avoids O(n) editor.getValue() per keystroke).
  // Content is read on demand from editorRef when saving or switching tabs.
  const handleEditorChange = useCallback(() => {
    if (!activeTabId) return;

    // Only update state once to mark the tab as dirty and pinned
    setTabs(prevTabs => {
      const tab = prevTabs.find(t => t.id === activeTabId);
      if (!tab || (tab.isDirty && !tab.isPreview)) return prevTabs;
      return prevTabs.map(t =>
        t.id === activeTabId ? { ...t, isDirty: true, isPreview: false } : t
      );
    });
  }, [activeTabId]);

  // Save the current file
  const handleSaveFile = useCallback(async (tabId?: string) => {
    const targetTabId = tabId || activeTabId;
    if (!targetTabId) return;

    const tab = tabs.find(t => t.id === targetTabId);
    if (!tab || !tab.isDirty) return;

    // Only workspace files can be saved (not documents - they use the API)
    if (tab.source !== 'workspace') {
      setSaveMessage({ type: 'error', text: 'Document saving is not yet supported' });
      setTimeout(() => setSaveMessage(null), 3000);
      return;
    }

    setIsSaving(true);
    setSaveMessage(null);

    // Read content from the live editor model (active tab) or fall back to tab state
    const content = (targetTabId === activeTabId && editorRef.current)
      ? editorRef.current.getValue()
      : tab.content;

    try {
      // Create a minimal entry object for the writeFile API
      const entry = {
        id: tab.path,
        name: tab.name,
        type: 'file' as const,
        path: tab.path,
      };
      await writeFile(entry, content);

      // Sync content to tab state and mark as clean
      setTabs(prevTabs =>
        prevTabs.map(t =>
          t.id === targetTabId ? { ...t, content, isDirty: false } : t
        )
      );

      setSaveMessage({ type: 'success', text: 'File saved successfully' });
      setTimeout(() => setSaveMessage(null), 2000);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to save file';
      setSaveMessage({ type: 'error', text: errorMessage });
      setTimeout(() => setSaveMessage(null), 5000);
    } finally {
      setIsSaving(false);
    }
  }, [activeTabId, tabs, writeFile]);

  // Handle source change
  const handleSourceChange = useCallback((source: FileSource) => {
    setFileSource(source);
    setSelectedId(null);
    setFileError(null);
  }, []);

  // Handle panel change
  const handlePanelChange = useCallback((panel: SidebarPanel) => {
    setActivePanel(panel);
    // Focus search input when switching to search panel
    if (panel === 'search') {
      setTimeout(() => {
        searchPanelRef.current?.focus();
      }, 50);
    }
  }, []);

  // Handle theme change
  const handleThemeChange = useCallback((theme: string) => {
    setEditorTheme(theme);
    localStorage.setItem('editor.theme', theme);
  }, []);

  // Handle extension click (opens extension detail page in a tab)
  const handleExtensionClick = useCallback((ext: OpenVSXExtensionSummary) => {
    const tabId = `ext:${ext.namespace}.${ext.name}`;
    const displayName = ext.displayName || ext.name;

    // Check if already open
    const existing = tabsRef.current.find(t => t.id === tabId);
    if (existing) {
      setActiveTabId(tabId);
      return;
    }

    captureEditorContent();

    const newTab: EditorTab = {
      id: tabId,
      name: displayName,
      path: `Extension: ${displayName}`,
      content: '',
      language: 'plaintext',
      source: 'extension',
      isPreview: false,
      isDirty: false,
      extensionId: `${ext.namespace}.${ext.name}`,
    };

    setTabs(prev => [...prev, newTab]);
    setActiveTabId(tabId);
  }, [captureEditorContent]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+S or Ctrl+S to save current file
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's' && !e.shiftKey) {
        e.preventDefault();
        handleSaveFile();
        return;
      }

      // Cmd+Shift+F or Ctrl+Shift+F to focus search panel
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setActivePanel('search');
        setTimeout(() => {
          searchPanelRef.current?.focus();
        }, 50);
        return;
      }

      // Cmd+W or Ctrl+W to close current tab
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'w') {
        e.preventDefault();
        if (activeTabId) {
          handleTabClose(activeTabId);
        }
        return;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [activeTabId, handleTabClose, handleSaveFile]);

  // Determine loading state
  const isTreeLoading = fileSource === 'workspace' ? workspaceLoading : documentsLoading;
  const isContentLoading = fileSource === 'documents' ? docContentLoading : isLoadingFile;
  const hasTreeError = fileSource === 'workspace' ? !!workspaceError : documentsError;
  const hasContentError = fileSource === 'documents' ? docContentError : !!fileError;

  // Check if tree is empty
  const isTreeEmpty = fileSource === 'workspace'
    ? workspaceEntries.length === 0
    : documents.length === 0;

  // Get subtitle based on state
  const subtitle = useMemo(() => {
    if (activeTab) return activeTab.path;
    if (fileSource === 'workspace' && isWorkspaceOpen) return `Workspace: ${workspaceName}`;
    if (fileSource === 'documents') return 'Document library';
    return 'Open a workspace or select a document';
  }, [activeTab, fileSource, isWorkspaceOpen, workspaceName]);

  // Handle Monaco editor mount - store reference for navigation
  const handleEditorDidMount = useCallback((editor: monaco.editor.IStandaloneCodeEditor) => {
    editorRef.current = editor;
  }, []);

  // Get language info for display
  const languageInfo = activeTab ? detectLanguageFromFilename(activeTab.name) : null;

  return (
    <div className="h-full flex flex-col space-y-6 animate-fade-in" data-testid="file-editor-page">
      {/* Page header */}
      <div className="flex items-center justify-between" data-testid="editor-header">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-[var(--color-primary-muted)]">
            <FileCode className="w-5 h-5 text-[var(--color-primary)]" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-[var(--color-text)]">Editor</h1>
            <p className="text-sm text-[var(--color-text-secondary)]">
              {subtitle}
            </p>
          </div>
        </div>
      </div>

      {/* Main content area */}
      <div className="flex-1 flex overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]" data-testid="editor-main-content">
        {/* Activity Bar */}
        <ActivityBar
          activePanel={activePanel}
          onPanelChange={handlePanelChange}
        />

        {/* Sidebar Panel */}
        <div className="w-64 flex-shrink-0 border-r border-[var(--color-border)] flex flex-col overflow-hidden" data-testid="editor-sidebar">
          {/* Files Panel */}
          {activePanel === 'files' && (
            <>
              {/* Sidebar header with source toggle */}
              <div className="px-3 py-2 border-b border-[var(--color-border)] bg-[var(--color-surface-hover)] space-y-2">
                <div className="flex items-center justify-between">
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
                    Explorer
                  </h2>
                  <SourceToggle
                    source={fileSource}
                    onSourceChange={handleSourceChange}
                    isWorkspaceOpen={isWorkspaceOpen}
                    workspaceName={workspaceName}
                  />
                </div>

                {/* Workspace controls */}
                {fileSource === 'workspace' && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={refreshTree}
                      disabled={workspaceLoading}
                      className="flex items-center gap-1 px-2 py-1 text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface)] rounded transition-colors disabled:opacity-50"
                      title="Refresh"
                    >
                      <RefreshCw className={`w-3 h-3 ${workspaceLoading ? 'animate-spin' : ''}`} />
                    </button>
                    <span className="flex-1 text-xs text-[var(--color-text-muted)] truncate ml-1">
                      {workspaceName || 'Workspace'}
                    </span>
                  </div>
                )}
              </div>

              {/* File tree */}
              <div className="flex-1 flex flex-col overflow-hidden" data-testid="editor-file-tree-container">
                {isTreeLoading ? (
                  <div className="flex items-center justify-center py-8" data-testid="editor-loading-tree">
                    <Loader2 className="w-5 h-5 animate-spin text-[var(--color-text-muted)]" />
                  </div>
                ) : hasTreeError ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center" data-testid="editor-error-tree">
                    <AlertCircle className="w-5 h-5 text-[var(--color-danger)] mb-2" />
                    <p className="text-xs text-[var(--color-text-secondary)]">
                      {fileSource === 'workspace' ? workspaceError : 'Failed to load documents'}
                    </p>
                  </div>
                ) : isTreeEmpty ? (
                  <div className="text-center py-8" data-testid="editor-empty-tree">
                    <p className="text-xs text-[var(--color-text-muted)]">
                      {fileSource === 'workspace' ? 'No files found' : 'No documents available'}
                    </p>
                  </div>
                ) : (
                  <EditorFileTree
                    workspaceEntries={workspaceEntries}
                    documents={documents}
                    source={fileSource}
                    selectedId={selectedId}
                    onSelectFile={handleSelectFile}
                    onDoubleClickFile={handleDoubleClickFile}
                    onDeleteFile={fileSource === 'workspace' ? handleDeleteFile : undefined}
                    onRenameFile={fileSource === 'workspace' ? handleRenameFile : undefined}
                    onPasteFile={fileSource === 'workspace' ? handlePasteFile : undefined}
                  />
                )}
              </div>
            </>
          )}

          {/* Search Panel */}
          {activePanel === 'search' && (
            <>
              {/* Search header */}
              <div className="px-3 py-2 border-b border-[var(--color-border)] bg-[var(--color-surface-hover)]">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
                  Search
                </h2>
              </div>

              {/* Search panel content */}
              <EditorSearchPanel
                ref={searchPanelRef}
                onSelectResult={handleSearchResultSelect}
              />
            </>
          )}

          {/* Extensions Panel */}
          {activePanel === 'extensions' && (
            <>
              <div className="px-3 py-2 border-b border-[var(--color-border)] bg-[var(--color-surface-hover)]">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
                  Extensions
                </h2>
              </div>
              <EditorExtensionsPanel onExtensionClick={handleExtensionClick} />
            </>
          )}

          {/* Settings Panel */}
          {activePanel === 'settings' && (
            <>
              <div className="px-3 py-2 border-b border-[var(--color-border)] bg-[var(--color-surface-hover)]">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
                  Settings
                </h2>
              </div>
              <EditorSettingsPanel
                theme={editorTheme}
                onThemeChange={handleThemeChange}
              />
            </>
          )}
        </div>

        {/* Editor panel */}
        <div className="flex-1 flex flex-col overflow-hidden" data-testid="editor-panel">
          {/* Tab bar */}
          <EditorTabBar
            tabs={tabs}
            activeTabId={activeTabId}
            onTabSelect={handleTabSelect}
            onTabClose={handleTabClose}
            onTabsReorder={handleTabsReorder}
            onSaveRequest={handleSaveFile}
          />

          {/* Monaco initialization error */}
          {monacoError ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-6" data-testid="editor-monaco-error">
              <AlertCircle className="w-8 h-8 text-[var(--color-danger)] mb-3" />
              <h3 className="text-lg font-medium text-[var(--color-text)] mb-2">Editor Failed to Load</h3>
              <p className="text-sm text-[var(--color-text-secondary)]">{monacoError}</p>
            </div>
          ) : !monacoReady ? (
            /* Monaco initialization loading state */
            <div className="flex flex-col items-center justify-center h-full" data-testid="editor-monaco-loading">
              <Loader2 className="w-8 h-8 animate-spin text-[var(--color-text-muted)] mb-3" />
              <p className="text-sm text-[var(--color-text-secondary)]">Initializing editor...</p>
            </div>
          ) : tabs.length === 0 ? (
            <NoFileSelected />
          ) : isContentLoading ? (
            <div className="flex items-center justify-center h-full" data-testid="editor-loading-content">
              <Loader2 className="w-8 h-8 animate-spin text-[var(--color-text-muted)]" />
            </div>
          ) : hasContentError || fileError ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-6" data-testid="editor-error-content">
              <AlertCircle className="w-8 h-8 text-[var(--color-danger)] mb-3" />
              <h3 className="text-lg font-medium text-[var(--color-text)] mb-2">Failed to Load</h3>
              <p className="text-sm text-[var(--color-text-secondary)]">
                {fileError || 'Could not load the file content.'}
              </p>
            </div>
          ) : activeTab ? (
            activeTab.source === 'extension' ? (
              /* Extension detail page */
              <ExtensionDetailPage
                extensionId={activeTab.extensionId!}
                className="flex-1 overflow-auto"
              />
            ) : (
              /* Monaco editor for file tabs */
              <>
                {/* Editor toolbar */}
                <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--color-border)] bg-[var(--color-surface-hover)]">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <Braces className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />
                      <span className="text-xs font-medium text-[var(--color-text-secondary)]">
                        {languageInfo?.displayName || 'Plain Text'}
                      </span>
                    </div>
                    {/* LSP status indicator */}
                    {isPotentialLspLanguage(activeTab.language) && (
                      <div
                        className={`flex items-center gap-1.5 text-xs ${
                          lspState === 'connected' ? 'text-green-500' :
                          lspState === 'connecting' ? 'text-yellow-500' :
                          lspState === 'error' ? 'text-red-500' :
                          'text-[var(--color-text-muted)]'
                        }`}
                        title={
                          lspState === 'connected' ? 'LSP connected - Autocompletion, hover info, and diagnostics active' :
                          lspState === 'connecting' ? 'Connecting to language server...' :
                          lspState === 'error' ? 'LSP connection failed' :
                          lspState === 'unavailable' ? 'Language server not available' :
                          'LSP idle'
                        }
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          lspState === 'connected' ? 'bg-green-500' :
                          lspState === 'connecting' ? 'bg-yellow-500 animate-pulse' :
                          lspState === 'error' ? 'bg-red-500' :
                          'bg-[var(--color-text-muted)]'
                        }`} />
                        <span>LSP</span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Save message */}
                    {saveMessage && (
                      <div
                        className={`flex items-center gap-1.5 text-xs ${
                          saveMessage.type === 'success'
                            ? 'text-green-500'
                            : 'text-[var(--color-danger)]'
                        }`}
                        data-testid="save-message"
                      >
                        {saveMessage.type === 'success' ? (
                          <CheckCircle className="w-3.5 h-3.5" />
                        ) : (
                          <AlertCircle className="w-3.5 h-3.5" />
                        )}
                        <span>{saveMessage.text}</span>
                      </div>
                    )}
                    {/* Save button */}
                    {activeTab.source === 'workspace' && (
                      <button
                        onClick={() => handleSaveFile()}
                        disabled={!activeTab.isDirty || isSaving}
                        className={`
                          flex items-center gap-1.5 px-2 py-1 text-xs font-medium rounded transition-colors
                          ${activeTab.isDirty
                            ? 'text-[var(--color-primary)] hover:bg-[var(--color-surface)] cursor-pointer'
                            : 'text-[var(--color-text-muted)] cursor-not-allowed'
                          }
                          disabled:opacity-50
                        `}
                        title={activeTab.isDirty ? 'Save (Cmd+S)' : 'No unsaved changes'}
                        data-testid="save-button"
                      >
                        {isSaving ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Save className="w-3.5 h-3.5" />
                        )}
                        <span>Save</span>
                      </button>
                    )}
                    {/* Read-only indicator for documents */}
                    {activeTab.source === 'documents' && (
                      <span className="text-xs text-[var(--color-text-muted)]">
                        Read Only
                      </span>
                    )}
                  </div>
                </div>
                <LspMonacoEditor
                  value={activeTab.content}
                  language={activeTab.language}
                  theme={editorTheme}
                  readOnly={activeTab.source === 'documents'}
                  onChange={handleEditorChange}
                  onMount={handleEditorDidMount}
                  onLspStateChange={setLspState}
                  filePath={activeTab.source === 'workspace' ? activeTab.path : undefined}
                  className="flex-1"
                />
              </>
            )
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default FileEditorPage;

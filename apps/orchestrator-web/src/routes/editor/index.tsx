/**
 * FileEditorPage - File editor with Monaco
 *
 * Displays files in a Monaco editor with a VSCode-style sidebar.
 * Features:
 * - Activity bar with File Explorer and Search icons
 * - File tree sidebar for browsing workspace files and documents
 * - Search sidebar panel for full-text search across files
 * - Monaco editor with syntax highlighting
 *
 * Supports two modes:
 * 1. Local workspace mode: Browse and view files from a local directory
 *    using the File System Access API
 * 2. Documents mode: Browse documents from the API document library
 */

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import Editor, { type Monaco, type OnMount } from '@monaco-editor/react';
import type * as monacoEditor from 'monaco-editor';
import {
  FileCode,
  Loader2,
  AlertCircle,
  FolderInput,
  X,
  RefreshCw,
  HardDrive,
  Database,
  Braces,
  Files,
  Search,
} from 'lucide-react';
import { EditorFileTree, type FileTreeNodeData, type FileSource } from '../../components/editor/EditorFileTree';
import { EditorSearchPanel, type EditorSearchPanelRef } from '../../components/editor/EditorSearchPanel';
import { useAllDocuments } from '../../api/hooks/useAllElements';
import { useWorkspace } from '../../contexts';
import type { Document } from '../../api/hooks/useAllElements';
import {
  getMonacoLanguageFromContentType,
  detectLanguageFromFilename,
} from '../../lib/language-detection';

// ============================================================================
// Types
// ============================================================================

/** Currently opened file state */
interface OpenFile {
  id: string;
  name: string;
  path: string;
  content: string;
  language: string;
  source: FileSource;
}

/** Active sidebar panel */
type SidebarPanel = 'files' | 'search';

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
// Monaco configuration for enhanced syntax/semantic highlighting
// ============================================================================

/**
 * Configure Monaco editor instance for enhanced highlighting
 */
function configureMonaco(monaco: Monaco): void {
  // Define custom theme with enhanced semantic token colors
  monaco.editor.defineTheme('elemental-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      // Enhanced syntax highlighting rules
      { token: 'comment', foreground: '6A9955', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'C586C0' },
      { token: 'keyword.control', foreground: 'C586C0' },
      { token: 'keyword.operator', foreground: 'C586C0' },
      { token: 'string', foreground: 'CE9178' },
      { token: 'string.escape', foreground: 'D7BA7D' },
      { token: 'number', foreground: 'B5CEA8' },
      { token: 'regexp', foreground: 'D16969' },
      { token: 'type', foreground: '4EC9B0' },
      { token: 'type.identifier', foreground: '4EC9B0' },
      { token: 'class', foreground: '4EC9B0' },
      { token: 'interface', foreground: '4EC9B0', fontStyle: 'italic' },
      { token: 'enum', foreground: '4EC9B0' },
      { token: 'typeParameter', foreground: '4EC9B0', fontStyle: 'italic' },
      { token: 'function', foreground: 'DCDCAA' },
      { token: 'function.declaration', foreground: 'DCDCAA' },
      { token: 'method', foreground: 'DCDCAA' },
      { token: 'variable', foreground: '9CDCFE' },
      { token: 'variable.readonly', foreground: '4FC1FF' },
      { token: 'variable.constant', foreground: '4FC1FF' },
      { token: 'parameter', foreground: '9CDCFE', fontStyle: 'italic' },
      { token: 'property', foreground: '9CDCFE' },
      { token: 'namespace', foreground: '4EC9B0' },
      { token: 'decorator', foreground: 'DCDCAA' },
      { token: 'tag', foreground: '569CD6' },
      { token: 'attribute.name', foreground: '9CDCFE' },
      { token: 'attribute.value', foreground: 'CE9178' },
      // JSX/TSX specific
      { token: 'tag.tsx', foreground: '4EC9B0' },
      { token: 'tag.jsx', foreground: '4EC9B0' },
      // JSON
      { token: 'string.key.json', foreground: '9CDCFE' },
      { token: 'string.value.json', foreground: 'CE9178' },
      // Markdown
      { token: 'markup.heading', foreground: '569CD6', fontStyle: 'bold' },
      { token: 'markup.bold', fontStyle: 'bold' },
      { token: 'markup.italic', fontStyle: 'italic' },
      { token: 'markup.inline.raw', foreground: 'CE9178' },
      // Shell
      { token: 'variable.shell', foreground: '9CDCFE' },
    ],
    colors: {
      'editor.background': '#1a1a2e',
      'editor.foreground': '#d4d4d4',
      'editor.lineHighlightBackground': '#2a2a4e',
      'editor.selectionBackground': '#264f78',
      'editorCursor.foreground': '#aeafad',
      'editorWhitespace.foreground': '#3b3b5b',
      'editorLineNumber.foreground': '#5a5a8a',
      'editorLineNumber.activeForeground': '#c6c6c6',
      'editor.inactiveSelectionBackground': '#3a3d41',
      'editorIndentGuide.background1': '#404060',
      'editorIndentGuide.activeBackground1': '#707090',
    },
  });

  // Configure TypeScript/JavaScript for better semantic tokens
  monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false,
  });

  monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
    target: monaco.languages.typescript.ScriptTarget.Latest,
    allowNonTsExtensions: true,
    moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
    module: monaco.languages.typescript.ModuleKind.ESNext,
    noEmit: true,
    esModuleInterop: true,
    jsx: monaco.languages.typescript.JsxEmit.React,
    reactNamespace: 'React',
    allowJs: true,
    typeRoots: ['node_modules/@types'],
  });

  monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false,
  });

  monaco.languages.typescript.javascriptDefaults.setCompilerOptions({
    target: monaco.languages.typescript.ScriptTarget.Latest,
    allowNonTsExtensions: true,
    moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
    module: monaco.languages.typescript.ModuleKind.ESNext,
    noEmit: true,
    esModuleInterop: true,
    jsx: monaco.languages.typescript.JsxEmit.React,
    allowJs: true,
  });
}

// ============================================================================
// Empty state component
// ============================================================================

function NoFileSelected({ onOpenWorkspace, isSupported }: { onOpenWorkspace: () => void; isSupported: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-6" data-testid="editor-no-file-selected">
      <FileCode className="w-12 h-12 text-[var(--color-text-muted)] mb-4" />
      <h3 className="text-lg font-medium text-[var(--color-text)] mb-2">Select a File</h3>
      <p className="text-sm text-[var(--color-text-secondary)] max-w-xs mb-4">
        Choose a file from the sidebar to view its content in the editor.
      </p>
      {isSupported && (
        <button
          onClick={onOpenWorkspace}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[var(--color-primary)] rounded-lg hover:bg-[var(--color-primary-hover)] transition-colors"
        >
          <FolderInput className="w-4 h-4" />
          Open Local Workspace
        </button>
      )}
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
  const items: { id: SidebarPanel; icon: React.ComponentType<{ className?: string }>; label: string }[] = [
    { id: 'files', icon: Files, label: 'Explorer' },
    { id: 'search', icon: Search, label: 'Search' },
  ];

  return (
    <div
      className="w-12 flex-shrink-0 bg-[var(--color-surface-hover)] border-r border-[var(--color-border)] flex flex-col items-center py-2 gap-1"
      data-testid="editor-activity-bar"
    >
      {items.map((item) => {
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
      })}
    </div>
  );
}

// ============================================================================
// Main component
// ============================================================================

export function FileEditorPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [openFile, setOpenFile] = useState<OpenFile | null>(null);
  const [fileSource, setFileSource] = useState<FileSource>('workspace');
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [isMonacoReady, setIsMonacoReady] = useState(false);
  const [activePanel, setActivePanel] = useState<SidebarPanel>('files');
  const monacoRef = useRef<Monaco | null>(null);
  const editorRef = useRef<monacoEditor.editor.IStandaloneCodeEditor | null>(null);
  const searchPanelRef = useRef<EditorSearchPanelRef>(null);

  // Workspace state from context
  const {
    isSupported,
    isOpen: isWorkspaceOpen,
    workspaceName,
    entries: workspaceEntries,
    isLoading: workspaceLoading,
    error: workspaceError,
    openWorkspace,
    closeWorkspace,
    refreshTree,
    readFile,
  } = useWorkspace();

  // Fetch all documents for documents mode
  const { data: documents = [], isLoading: documentsLoading, isError: documentsError } = useAllDocuments();

  // Fetch selected document content (for documents mode)
  const { data: selectedDocument, isLoading: docContentLoading, isError: docContentError } = useDocumentContent(
    fileSource === 'documents' ? selectedId : null
  );

  // Update open file when document content loads
  useEffect(() => {
    if (fileSource === 'documents' && selectedDocument && selectedId) {
      setOpenFile({
        id: selectedId,
        name: selectedDocument.title || 'Untitled',
        path: selectedDocument.title || 'Untitled',
        content: selectedDocument.content || '',
        language: getLanguageFromDocument(selectedDocument),
        source: 'documents',
      });
    }
  }, [fileSource, selectedDocument, selectedId]);

  // Handle file selection from tree
  const handleSelectFile = useCallback(
    async (node: FileTreeNodeData) => {
      if (node.nodeType === 'folder') return;

      setSelectedId(node.id);
      setFileError(null);

      if (fileSource === 'workspace' && node.fsEntry) {
        // Read local file
        setIsLoadingFile(true);
        try {
          const result = await readFile(node.fsEntry);
          setOpenFile({
            id: node.id,
            name: result.name,
            path: result.path,
            content: result.content,
            language: result.language || 'plaintext',
            source: 'workspace',
          });
        } catch (error) {
          setFileError(error instanceof Error ? error.message : 'Failed to read file');
          setOpenFile(null);
        } finally {
          setIsLoadingFile(false);
        }
      }
      // For documents mode, the useEffect above handles loading
    },
    [fileSource, readFile]
  );

  // Handle search result selection - open file and navigate to line
  const handleSearchResultSelect = useCallback(
    async (path: string, line: number, column: number) => {
      // Find the file in workspace entries
      const findEntry = (entries: typeof workspaceEntries, targetPath: string): (typeof workspaceEntries)[0] | null => {
        for (const entry of entries) {
          if (entry.path === targetPath) {
            return entry;
          }
          if (entry.children) {
            const found = findEntry(entry.children, targetPath);
            if (found) return found;
          }
        }
        return null;
      };

      const entry = findEntry(workspaceEntries, path);

      if (entry && entry.type === 'file') {
        // Check if this file is already open
        if (openFile?.path === path) {
          // Just navigate to the line
          if (editorRef.current) {
            editorRef.current.revealLineInCenter(line);
            editorRef.current.setPosition({ lineNumber: line, column });
            editorRef.current.focus();
          }
          return;
        }

        // Load the file first
        setSelectedId(entry.id);
        setFileError(null);
        setIsLoadingFile(true);

        try {
          const result = await readFile(entry);
          setOpenFile({
            id: entry.id,
            name: result.name,
            path: result.path,
            content: result.content,
            language: result.language || 'plaintext',
            source: 'workspace',
          });

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
          setOpenFile(null);
        } finally {
          setIsLoadingFile(false);
        }
      }
    },
    [workspaceEntries, openFile, readFile]
  );

  // Handle source change
  const handleSourceChange = useCallback((source: FileSource) => {
    setFileSource(source);
    setSelectedId(null);
    setOpenFile(null);
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

  // Handle keyboard shortcut Cmd/Ctrl+Shift+F
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+Shift+F or Ctrl+Shift+F to focus search panel
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        // Switch to search panel and focus input
        setActivePanel('search');
        setTimeout(() => {
          searchPanelRef.current?.focus();
        }, 50);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

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
    if (openFile) return openFile.path;
    if (fileSource === 'workspace' && isWorkspaceOpen) return `Workspace: ${workspaceName}`;
    if (fileSource === 'documents') return 'Document library';
    return 'Open a workspace or select a document';
  }, [openFile, fileSource, isWorkspaceOpen, workspaceName]);

  // Handle Monaco editor mount - configure once
  const handleEditorDidMount: OnMount = useCallback((editor, monaco) => {
    monacoRef.current = monaco;
    editorRef.current = editor;
    if (!isMonacoReady) {
      configureMonaco(monaco);
      setIsMonacoReady(true);
    }
  }, [isMonacoReady]);

  // Get language info for display
  const languageInfo = openFile ? detectLanguageFromFilename(openFile.name) : null;

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
                {fileSource === 'workspace' && isSupported && (
                  <div className="flex items-center gap-1">
                    {isWorkspaceOpen ? (
                      <>
                        <button
                          onClick={refreshTree}
                          disabled={workspaceLoading}
                          className="flex items-center gap-1 px-2 py-1 text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface)] rounded transition-colors disabled:opacity-50"
                          title="Refresh"
                        >
                          <RefreshCw className={`w-3 h-3 ${workspaceLoading ? 'animate-spin' : ''}`} />
                        </button>
                        <button
                          onClick={closeWorkspace}
                          className="flex items-center gap-1 px-2 py-1 text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-danger)] hover:bg-[var(--color-surface)] rounded transition-colors"
                          title="Close workspace"
                        >
                          <X className="w-3 h-3" />
                        </button>
                        <span className="flex-1 text-xs text-[var(--color-text-muted)] truncate ml-1">
                          {workspaceName}
                        </span>
                      </>
                    ) : (
                      <button
                        onClick={openWorkspace}
                        className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-[var(--color-primary)] hover:bg-[var(--color-surface)] rounded transition-colors"
                      >
                        <FolderInput className="w-3 h-3" />
                        Open Folder
                      </button>
                    )}
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
                    {fileSource === 'workspace' && !isWorkspaceOpen ? (
                      <div className="space-y-2">
                        <FolderInput className="w-6 h-6 text-[var(--color-text-muted)] mx-auto" />
                        <p className="text-xs text-[var(--color-text-muted)]">
                          {isSupported
                            ? 'Open a folder to browse files'
                            : 'File System Access API not supported'}
                        </p>
                        {isSupported && (
                          <button
                            onClick={openWorkspace}
                            className="px-3 py-1.5 text-xs font-medium text-white bg-[var(--color-primary)] rounded hover:bg-[var(--color-primary-hover)] transition-colors"
                          >
                            Open Folder
                          </button>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-[var(--color-text-muted)]">
                        {fileSource === 'workspace' ? 'No files found' : 'No documents available'}
                      </p>
                    )}
                  </div>
                ) : (
                  <EditorFileTree
                    workspaceEntries={workspaceEntries}
                    documents={documents}
                    source={fileSource}
                    selectedId={selectedId}
                    onSelectFile={handleSelectFile}
                    workspaceName={workspaceName}
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
        </div>

        {/* Editor panel */}
        <div className="flex-1 flex flex-col overflow-hidden" data-testid="editor-panel">
          {!selectedId && !openFile ? (
            <NoFileSelected onOpenWorkspace={openWorkspace} isSupported={isSupported} />
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
          ) : openFile ? (
            <>
              {/* Language indicator bar */}
              <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--color-border)] bg-[var(--color-surface-hover)]">
                <div className="flex items-center gap-2">
                  <Braces className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />
                  <span className="text-xs font-medium text-[var(--color-text-secondary)]">
                    {languageInfo?.displayName || 'Plain Text'}
                  </span>
                </div>
                <span className="text-xs text-[var(--color-text-muted)]">
                  Read Only
                </span>
              </div>
              <Editor
                height="100%"
                language={openFile.language}
                value={openFile.content}
                theme={isMonacoReady ? 'elemental-dark' : 'vs-dark'}
                onMount={handleEditorDidMount}
                options={{
                  readOnly: true,
                  minimap: {
                    enabled: true,
                    scale: 1,
                    showSlider: 'mouseover',
                    renderCharacters: false,
                  },
                  fontSize: 14,
                  fontFamily: "'Fira Code', 'JetBrains Mono', 'Cascadia Code', Menlo, Monaco, 'Courier New', monospace",
                  fontLigatures: true,
                  lineNumbers: 'on',
                  scrollBeyondLastLine: false,
                  wordWrap: 'on',
                  automaticLayout: true,
                  padding: { top: 16, bottom: 16 },
                  // Enhanced syntax highlighting options
                  renderWhitespace: 'selection',
                  bracketPairColorization: { enabled: true },
                  guides: {
                    bracketPairs: true,
                    indentation: true,
                    highlightActiveIndentation: true,
                  },
                  // Semantic highlighting
                  'semanticHighlighting.enabled': true,
                  // Smooth scrolling and cursor
                  smoothScrolling: true,
                  cursorBlinking: 'smooth',
                  cursorSmoothCaretAnimation: 'on',
                  // Code folding
                  folding: true,
                  foldingStrategy: 'indentation',
                  showFoldingControls: 'mouseover',
                  // Hover and suggestions (disabled for read-only)
                  hover: { enabled: true, delay: 500 },
                  quickSuggestions: false,
                  suggestOnTriggerCharacters: false,
                  // Selection highlighting
                  occurrencesHighlight: 'singleFile',
                  selectionHighlight: true,
                }}
                loading={
                  <div className="flex items-center justify-center h-full" data-testid="editor-monaco-loading">
                    <Loader2 className="w-8 h-8 animate-spin text-[var(--color-text-muted)]" />
                  </div>
                }
              />
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default FileEditorPage;

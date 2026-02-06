/**
 * FileEditorPage - Read-only file editor with Monaco
 *
 * Displays documents in a read-only Monaco editor with a file tree sidebar.
 * Allows browsing and viewing documents from the document library.
 */

import { useState, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import Editor from '@monaco-editor/react';
import {
  FileCode,
  Folder,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  Loader2,
  AlertCircle,
  FileText,
} from 'lucide-react';
import { useAllDocuments } from '../../api/hooks/useAllElements';
import type { Document } from '../../api/hooks/useAllElements';

// File tree node type
interface FileTreeNode {
  id: string;
  name: string;
  type: 'file' | 'folder';
  children?: FileTreeNode[];
  document?: Document;
}

// Hook to fetch document content
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

// Get language from content type or filename
function getLanguageFromDocument(doc: Document | null): string {
  if (!doc) return 'plaintext';

  const contentType = doc.contentType?.toLowerCase() || '';
  const title = doc.title?.toLowerCase() || '';

  // Check content type first
  if (contentType.includes('javascript') || contentType === 'js') return 'javascript';
  if (contentType.includes('typescript') || contentType === 'ts') return 'typescript';
  if (contentType.includes('json')) return 'json';
  if (contentType.includes('markdown') || contentType === 'md') return 'markdown';
  if (contentType.includes('html')) return 'html';
  if (contentType.includes('css')) return 'css';
  if (contentType.includes('python') || contentType === 'py') return 'python';
  if (contentType.includes('yaml') || contentType.includes('yml')) return 'yaml';
  if (contentType.includes('xml')) return 'xml';
  if (contentType.includes('sql')) return 'sql';
  if (contentType.includes('shell') || contentType.includes('bash') || contentType === 'sh') return 'shell';

  // Fallback to file extension from title
  const ext = title.split('.').pop() || '';
  const extMap: Record<string, string> = {
    js: 'javascript',
    jsx: 'javascript',
    ts: 'typescript',
    tsx: 'typescript',
    json: 'json',
    md: 'markdown',
    html: 'html',
    htm: 'html',
    css: 'css',
    scss: 'scss',
    less: 'less',
    py: 'python',
    yaml: 'yaml',
    yml: 'yaml',
    xml: 'xml',
    sql: 'sql',
    sh: 'shell',
    bash: 'shell',
    zsh: 'shell',
    go: 'go',
    rs: 'rust',
    java: 'java',
    c: 'c',
    cpp: 'cpp',
    h: 'c',
    hpp: 'cpp',
  };

  return extMap[ext] || 'plaintext';
}

// Build file tree from documents
function buildFileTree(documents: Document[]): FileTreeNode[] {
  // Group documents - for now just flat list since we don't have folder structure
  // In the future, this could parse document paths/titles to create folders
  return documents.map((doc) => ({
    id: doc.id,
    name: doc.title || 'Untitled',
    type: 'file' as const,
    document: doc,
  }));
}

// File tree item component
function FileTreeItem({
  node,
  level = 0,
  selectedId,
  expandedFolders,
  onSelect,
  onToggleFolder,
}: {
  node: FileTreeNode;
  level?: number;
  selectedId: string | null;
  expandedFolders: Set<string>;
  onSelect: (id: string) => void;
  onToggleFolder: (id: string) => void;
}) {
  const isSelected = selectedId === node.id;
  const isExpanded = expandedFolders.has(node.id);
  const isFolder = node.type === 'folder';

  const handleClick = () => {
    if (isFolder) {
      onToggleFolder(node.id);
    } else {
      onSelect(node.id);
    }
  };

  const Icon = isFolder
    ? isExpanded
      ? FolderOpen
      : Folder
    : node.document?.contentType?.includes('code') || node.name.match(/\.(tsx?|jsx?|json|py|go|rs|java|c|cpp|h|hpp|sh|bash|yml|yaml|xml|sql|html|css|scss|less|md)$/i)
    ? FileCode
    : FileText;

  return (
    <div data-testid={`file-tree-item-${node.id}`}>
      <button
        onClick={handleClick}
        className={`
          w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-md transition-colors
          ${isSelected
            ? 'bg-[var(--color-primary)] text-white'
            : 'text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]'
          }
        `}
        style={{ paddingLeft: `${8 + level * 16}px` }}
        data-testid={`file-tree-button-${node.id}`}
      >
        {isFolder && (
          <span className="flex-shrink-0">
            {isExpanded ? (
              <ChevronDown className="w-3 h-3" />
            ) : (
              <ChevronRight className="w-3 h-3" />
            )}
          </span>
        )}
        <Icon className={`w-4 h-4 flex-shrink-0 ${isSelected ? 'text-white' : 'text-[var(--color-text-secondary)]'}`} />
        <span className="truncate">{node.name}</span>
      </button>
      {isFolder && isExpanded && node.children && (
        <div>
          {node.children.map((child) => (
            <FileTreeItem
              key={child.id}
              node={child}
              level={level + 1}
              selectedId={selectedId}
              expandedFolders={expandedFolders}
              onSelect={onSelect}
              onToggleFolder={onToggleFolder}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Empty state for editor when no file selected
function NoFileSelected() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-6" data-testid="editor-no-file-selected">
      <FileCode className="w-12 h-12 text-[var(--color-text-muted)] mb-4" />
      <h3 className="text-lg font-medium text-[var(--color-text)] mb-2">Select a File</h3>
      <p className="text-sm text-[var(--color-text-secondary)] max-w-xs">
        Choose a document from the sidebar to view its content in the editor.
      </p>
    </div>
  );
}

export function FileEditorPage() {
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  // Fetch all documents
  const { data: documents = [], isLoading: documentsLoading, isError: documentsError } = useAllDocuments();

  // Fetch selected document content
  const { data: selectedDocument, isLoading: contentLoading, isError: contentError } = useDocumentContent(selectedDocumentId);

  // Build file tree from documents
  const fileTree = useMemo(() => buildFileTree(documents), [documents]);

  // Get language for Monaco
  const language = useMemo(() => getLanguageFromDocument(selectedDocument), [selectedDocument]);

  // Handle file selection
  const handleSelect = useCallback((id: string) => {
    setSelectedDocumentId(id);
  }, []);

  // Handle folder toggle
  const handleToggleFolder = useCallback((id: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  // Determine what content to show in editor
  const editorContent = selectedDocument?.content || '';

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
              {selectedDocument ? selectedDocument.title : 'Read-only file viewer'}
            </p>
          </div>
        </div>
      </div>

      {/* Main content area */}
      <div className="flex-1 flex overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]" data-testid="editor-main-content">
        {/* File tree sidebar */}
        <div className="w-64 flex-shrink-0 border-r border-[var(--color-border)] flex flex-col overflow-hidden" data-testid="editor-sidebar">
          {/* Sidebar header */}
          <div className="px-3 py-2 border-b border-[var(--color-border)] bg-[var(--color-surface-hover)]">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
              Documents
            </h2>
          </div>

          {/* File tree */}
          <div className="flex-1 overflow-y-auto p-2" data-testid="editor-file-tree">
            {documentsLoading ? (
              <div className="flex items-center justify-center py-8" data-testid="editor-loading-documents">
                <Loader2 className="w-5 h-5 animate-spin text-[var(--color-text-muted)]" />
              </div>
            ) : documentsError ? (
              <div className="flex flex-col items-center justify-center py-8 text-center" data-testid="editor-error-documents">
                <AlertCircle className="w-5 h-5 text-[var(--color-danger)] mb-2" />
                <p className="text-xs text-[var(--color-text-secondary)]">Failed to load documents</p>
              </div>
            ) : fileTree.length === 0 ? (
              <div className="text-center py-8" data-testid="editor-no-documents">
                <p className="text-xs text-[var(--color-text-muted)]">No documents available</p>
              </div>
            ) : (
              fileTree.map((node) => (
                <FileTreeItem
                  key={node.id}
                  node={node}
                  selectedId={selectedDocumentId}
                  expandedFolders={expandedFolders}
                  onSelect={handleSelect}
                  onToggleFolder={handleToggleFolder}
                />
              ))
            )}
          </div>
        </div>

        {/* Editor panel */}
        <div className="flex-1 flex flex-col overflow-hidden" data-testid="editor-panel">
          {!selectedDocumentId ? (
            <NoFileSelected />
          ) : contentLoading ? (
            <div className="flex items-center justify-center h-full" data-testid="editor-loading-content">
              <Loader2 className="w-8 h-8 animate-spin text-[var(--color-text-muted)]" />
            </div>
          ) : contentError ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-6" data-testid="editor-error-content">
              <AlertCircle className="w-8 h-8 text-[var(--color-danger)] mb-3" />
              <h3 className="text-lg font-medium text-[var(--color-text)] mb-2">Failed to Load</h3>
              <p className="text-sm text-[var(--color-text-secondary)]">
                Could not load the document content.
              </p>
            </div>
          ) : (
            <Editor
              height="100%"
              language={language}
              value={editorContent}
              theme="vs-dark"
              options={{
                readOnly: true,
                minimap: { enabled: true },
                fontSize: 14,
                lineNumbers: 'on',
                scrollBeyondLastLine: false,
                wordWrap: 'on',
                automaticLayout: true,
                padding: { top: 16 },
              }}
              loading={
                <div className="flex items-center justify-center h-full" data-testid="editor-monaco-loading">
                  <Loader2 className="w-8 h-8 animate-spin text-[var(--color-text-muted)]" />
                </div>
              }
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default FileEditorPage;

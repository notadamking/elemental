/**
 * EditorFileTree - File tree component using react-arborist
 *
 * A performant tree view for displaying files and directories
 * using react-arborist for virtualization and improved UX.
 *
 * Features:
 * - Automatic expansion of last-opened folder per workspace
 * - Persists folder state to localStorage
 */

import { useRef, useMemo, useCallback, useState, useEffect } from 'react';
import { Tree, NodeRendererProps, NodeApi } from 'react-arborist';
import {
  FileCode,
  Folder,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  FileText,
  Settings,
  FileJson,
  FileType,
  Image,
  FileAudio,
  FileVideo,
  File,
  Database,
  Lock,
  Package,
} from 'lucide-react';
import type { FileSystemEntry } from '../../contexts';
import type { Document } from '../../api/hooks/useAllElements';
import {
  isCodeFile,
  isConfigFile,
  isDataFile,
} from '../../lib/language-detection';
import {
  getLastOpenedFolder,
  setLastOpenedFolder,
  getAncestorPaths,
} from '../../lib/editor-storage';

// ============================================================================
// Constants
// ============================================================================

const FILE_ROW_HEIGHT = 32;

// ============================================================================
// Types
// ============================================================================

/** Source of file tree data */
export type FileSource = 'workspace' | 'documents';

/**
 * Unified tree node interface for react-arborist
 */
export interface FileTreeNodeData {
  id: string;
  name: string;
  nodeType: 'file' | 'folder';
  path: string;
  children?: FileTreeNodeData[];
  /** For workspace mode */
  fsEntry?: FileSystemEntry;
  /** For documents mode */
  document?: Document;
}

// ============================================================================
// Icon utilities
// ============================================================================

/**
 * Get file extension from name
 */
function getExtension(name: string): string {
  const idx = name.lastIndexOf('.');
  return idx > 0 ? name.slice(idx + 1).toLowerCase() : '';
}

/**
 * Get appropriate icon for file based on name/extension
 */
function getFileIcon(name: string, isFolder: boolean, isExpanded: boolean) {
  if (isFolder) {
    return isExpanded ? FolderOpen : Folder;
  }

  const ext = getExtension(name);
  const lowerName = name.toLowerCase();

  // Lock files
  if (lowerName.endsWith('.lock') || lowerName.endsWith('-lock.json') || lowerName.endsWith('-lock.yaml')) {
    return Lock;
  }

  // Package files
  if (lowerName === 'package.json' || lowerName === 'cargo.toml' || lowerName === 'go.mod') {
    return Package;
  }

  // Images
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'bmp'].includes(ext)) {
    return Image;
  }

  // Audio
  if (['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac'].includes(ext)) {
    return FileAudio;
  }

  // Video
  if (['mp4', 'webm', 'mkv', 'avi', 'mov'].includes(ext)) {
    return FileVideo;
  }

  // Database
  if (['db', 'sqlite', 'sqlite3', 'sql'].includes(ext)) {
    return Database;
  }

  // JSON files
  if (['json', 'jsonc', 'json5'].includes(ext)) {
    return FileJson;
  }

  // Code files
  if (isCodeFile(name)) {
    return FileCode;
  }

  // Config files
  if (isConfigFile(name)) {
    return Settings;
  }

  // Data files
  if (isDataFile(name)) {
    return FileType;
  }

  // Text/document files
  if (['md', 'txt', 'rtf', 'doc', 'docx', 'pdf'].includes(ext)) {
    return FileText;
  }

  // Default
  return File;
}

/**
 * Get icon color based on file type
 */
function getIconColor(name: string, isFolder: boolean): string {
  if (isFolder) {
    return 'text-amber-500';
  }

  const ext = getExtension(name);
  const lowerName = name.toLowerCase();

  // Lock files - gray
  if (lowerName.endsWith('.lock') || lowerName.endsWith('-lock.json') || lowerName.endsWith('-lock.yaml')) {
    return 'text-gray-400';
  }

  // Package files - green
  if (lowerName === 'package.json' || lowerName === 'cargo.toml' || lowerName === 'go.mod') {
    return 'text-green-500';
  }

  // TypeScript/JavaScript - blue/yellow
  if (['ts', 'tsx'].includes(ext)) return 'text-blue-500';
  if (['js', 'jsx', 'mjs', 'cjs'].includes(ext)) return 'text-yellow-500';

  // Python - blue/green
  if (['py', 'pyw', 'pyi'].includes(ext)) return 'text-blue-400';

  // Rust - orange
  if (['rs'].includes(ext)) return 'text-orange-500';

  // Go - cyan
  if (['go'].includes(ext)) return 'text-cyan-500';

  // Ruby - red
  if (['rb', 'rake'].includes(ext)) return 'text-red-500';

  // HTML/CSS
  if (['html', 'htm'].includes(ext)) return 'text-orange-400';
  if (['css', 'scss', 'sass', 'less'].includes(ext)) return 'text-pink-500';

  // Shell scripts - green
  if (['sh', 'bash', 'zsh', 'fish'].includes(ext)) return 'text-green-400';

  // JSON - yellow
  if (['json', 'jsonc', 'json5'].includes(ext)) return 'text-yellow-400';

  // Markdown - purple
  if (['md', 'mdx'].includes(ext)) return 'text-purple-400';

  // YAML/TOML - red
  if (['yaml', 'yml', 'toml'].includes(ext)) return 'text-red-400';

  // Images
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext)) return 'text-purple-500';

  // Config files - gray
  if (isConfigFile(name)) return 'text-gray-400';

  return 'text-[var(--color-text-muted)]';
}

// ============================================================================
// Tree Node Renderer
// ============================================================================

/**
 * Custom node renderer for file tree items
 */
function FileNode({ node, style }: NodeRendererProps<FileTreeNodeData>) {
  const isFolder = node.data.nodeType === 'folder';
  const isExpanded = node.isOpen;
  const isSelected = node.isSelected;

  const Icon = getFileIcon(node.data.name, isFolder, isExpanded);
  const iconColor = getIconColor(node.data.name, isFolder);

  return (
    <div
      data-testid={`file-tree-item-${node.id}`}
      style={style}
      className="pr-2"
    >
      <button
        data-testid={`file-tree-button-${node.id}`}
        onClick={(e) => {
          e.stopPropagation();
          if (isFolder) {
            node.toggle();
          } else {
            node.select();
            node.activate();
          }
        }}
        className={`
          w-full flex items-center gap-1.5 px-2 py-1 rounded-md text-sm
          transition-colors duration-150 ease-in-out
          ${isSelected
            ? 'bg-[var(--color-primary)] text-white'
            : 'text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]'
          }
        `}
      >
        {/* Chevron for folders */}
        {isFolder ? (
          <span className="flex-shrink-0 w-4 h-4 flex items-center justify-center">
            {isExpanded ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" />
            )}
          </span>
        ) : (
          <span className="w-4" />
        )}

        {/* File/folder icon */}
        <Icon
          className={`w-4 h-4 flex-shrink-0 ${
            isSelected ? 'text-white' : iconColor
          }`}
        />

        {/* File name */}
        <span className="truncate flex-1 text-left">{node.data.name}</span>
      </button>
    </div>
  );
}

// ============================================================================
// Tree Data Conversion
// ============================================================================

/**
 * Convert FileSystemEntry to tree node format
 */
function fsEntryToTreeNode(entry: FileSystemEntry): FileTreeNodeData {
  return {
    id: entry.id,
    name: entry.name,
    nodeType: entry.type === 'directory' ? 'folder' : 'file',
    path: entry.path,
    children: entry.children?.map(fsEntryToTreeNode),
    fsEntry: entry,
  };
}

/**
 * Convert Document to tree node format
 */
function documentToTreeNode(doc: Document): FileTreeNodeData {
  return {
    id: doc.id,
    name: doc.title || 'Untitled',
    nodeType: 'file',
    path: doc.title || 'Untitled',
    document: doc,
  };
}

// ============================================================================
// Main Component
// ============================================================================

interface EditorFileTreeProps {
  /** Workspace file entries (for workspace mode) */
  workspaceEntries?: FileSystemEntry[];
  /** Documents (for documents mode) */
  documents?: Document[];
  /** Current source mode */
  source: FileSource;
  /** Currently selected file ID */
  selectedId: string | null;
  /** Callback when a file is selected */
  onSelectFile: (node: FileTreeNodeData) => void;
  /** Optional class name */
  className?: string;
  /** Name of the current workspace (used for persisting folder state) */
  workspaceName?: string | null;
}

/**
 * Check if a folder path exists in the tree data
 */
function folderExistsInTree(
  nodes: FileTreeNodeData[],
  folderPath: string
): boolean {
  for (const node of nodes) {
    if (node.path === folderPath && node.nodeType === 'folder') {
      return true;
    }
    if (node.children && folderExistsInTree(node.children, folderPath)) {
      return true;
    }
  }
  return false;
}

export function EditorFileTree({
  workspaceEntries = [],
  documents = [],
  source,
  selectedId,
  onSelectFile,
  className = '',
  workspaceName = null,
}: EditorFileTreeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const treeRef = useRef<any>(null);
  const [treeHeight, setTreeHeight] = useState(400);

  // Measure container height
  useEffect(() => {
    if (!containerRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        // Subtract padding
        setTreeHeight(Math.max(entry.contentRect.height - 8, 100));
      }
    });

    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  // Convert data to tree format
  const treeData = useMemo(() => {
    if (source === 'workspace') {
      return workspaceEntries.map(fsEntryToTreeNode);
    }
    return documents.map(documentToTreeNode);
  }, [source, workspaceEntries, documents]);

  // Compute initial open state from last opened folder (for workspace mode)
  const initialOpenState = useMemo(() => {
    // Only apply for workspace mode with a valid workspace name
    if (source !== 'workspace' || !workspaceName || treeData.length === 0) {
      return {};
    }

    const lastFolder = getLastOpenedFolder(workspaceName);
    if (!lastFolder) {
      return {};
    }

    // Check if the folder still exists in the current tree
    if (!folderExistsInTree(treeData, lastFolder)) {
      // Folder no longer exists - gracefully show root instead
      return {};
    }

    // Get all ancestor paths to expand
    const pathsToExpand = getAncestorPaths(lastFolder);
    const openMap: Record<string, boolean> = {};

    for (const path of pathsToExpand) {
      openMap[path] = true;
    }

    return openMap;
  }, [source, workspaceName, treeData]);

  // Handle folder toggle - persist the last opened folder
  const handleToggle = useCallback(
    (nodeId: string) => {
      // Only persist for workspace mode
      if (source !== 'workspace' || !workspaceName) {
        return;
      }

      // Find the node to check if it's being opened
      const findNode = (
        nodes: FileTreeNodeData[],
        id: string
      ): FileTreeNodeData | null => {
        for (const node of nodes) {
          if (node.id === id) return node;
          if (node.children) {
            const found = findNode(node.children, id);
            if (found) return found;
          }
        }
        return null;
      };

      const node = findNode(treeData, nodeId);
      if (node && node.nodeType === 'folder') {
        // The node is being toggled - we save it when opened
        // react-arborist calls onToggle after the state change,
        // so we check the tree ref to see the new state
        const treeApi = treeRef.current;
        if (treeApi) {
          // Get the node from the tree API to check its current state
          const treeNode = treeApi.get(nodeId);
          if (treeNode && treeNode.isOpen) {
            // Folder is now open - save it as the last opened folder
            setLastOpenedFolder(workspaceName, node.path);
          }
        }
      }
    },
    [source, workspaceName, treeData]
  );

  // Handle node selection
  const handleSelect = useCallback(
    (nodes: NodeApi<FileTreeNodeData>[]) => {
      if (nodes.length > 0 && nodes[0].data.nodeType === 'file') {
        onSelectFile(nodes[0].data);
      }
    },
    [onSelectFile]
  );

  // Handle node activation (click)
  const handleActivate = useCallback(
    (node: NodeApi<FileTreeNodeData>) => {
      if (node.data.nodeType === 'file') {
        onSelectFile(node.data);
      }
    },
    [onSelectFile]
  );

  return (
    <div
      ref={containerRef}
      data-testid="editor-file-tree"
      className={`flex-1 overflow-hidden p-1 ${className}`}
    >
      {treeData.length === 0 ? (
        <div className="text-center py-8 text-[var(--color-text-muted)] text-sm">
          No files to display
        </div>
      ) : (
        <Tree<FileTreeNodeData>
          ref={treeRef}
          data={treeData}
          width="100%"
          height={treeHeight}
          rowHeight={FILE_ROW_HEIGHT}
          indent={16}
          paddingTop={4}
          paddingBottom={4}
          initialOpenState={initialOpenState}
          selection={selectedId ?? undefined}
          onSelect={handleSelect}
          onActivate={handleActivate}
          onToggle={handleToggle}
          disableMultiSelection
          openByDefault={false}
        >
          {FileNode}
        </Tree>
      )}
    </div>
  );
}


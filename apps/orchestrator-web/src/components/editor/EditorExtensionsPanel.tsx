/**
 * EditorExtensionsPanel - Extensions panel for the file editor
 *
 * A sidebar panel for browsing and managing OpenVSX extensions.
 * This is a placeholder component that will be expanded with full
 * extension management functionality.
 */

import { Puzzle } from 'lucide-react';

// ============================================================================
// Main Component
// ============================================================================

export function EditorExtensionsPanel() {
  return (
    <div
      className="flex flex-col h-full overflow-y-auto"
      data-testid="editor-extensions-panel"
    >
      <div className="flex flex-col items-center justify-center h-full text-center p-6">
        <Puzzle className="w-12 h-12 text-[var(--color-text-muted)] mb-4" />
        <h3 className="text-sm font-medium text-[var(--color-text)] mb-2">
          Extensions
        </h3>
        <p className="text-xs text-[var(--color-text-secondary)] max-w-xs">
          Browse and manage editor extensions from OpenVSX.
        </p>
      </div>
    </div>
  );
}

export default EditorExtensionsPanel;

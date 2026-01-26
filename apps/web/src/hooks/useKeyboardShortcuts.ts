import { useEffect, useCallback } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { keyboardManager, type ShortcutHandler } from '../lib/keyboard';

/**
 * Navigation shortcuts configuration.
 * Maps shortcut keys to route paths.
 */
const NAVIGATION_SHORTCUTS: Record<string, string> = {
  'G H': '/dashboard/overview',
  'G F': '/dashboard/task-flow',
  'G L': '/dashboard/timeline',
  'G T': '/tasks',
  'G P': '/plans',
  'G W': '/workflows',
  'G G': '/dependencies',
  'G M': '/messages',
  'G D': '/documents',
  'G E': '/entities',
  'G R': '/teams',
  'G S': '/settings',
};

/**
 * Hook to register a custom keyboard shortcut.
 * The shortcut will be automatically unregistered when the component unmounts.
 */
export function useKeyboardShortcut(
  keys: string,
  handler: ShortcutHandler,
  description?: string
): void {
  useEffect(() => {
    keyboardManager.register(keys, handler, description);
    return () => {
      keyboardManager.unregister(keys);
    };
  }, [keys, handler, description]);
}

/**
 * Hook to temporarily disable keyboard shortcuts.
 * Useful when showing modals or other overlays.
 */
export function useDisableKeyboardShortcuts(disabled: boolean): void {
  useEffect(() => {
    if (disabled) {
      keyboardManager.setEnabled(false);
    } else {
      keyboardManager.setEnabled(true);
    }
    return () => {
      keyboardManager.setEnabled(true);
    };
  }, [disabled]);
}

/**
 * Hook to set up all global navigation shortcuts.
 * Should be called once in the app root.
 */
export function useGlobalKeyboardShortcuts(): void {
  const navigate = useNavigate();

  // Memoize navigation handler factory
  const createNavigationHandler = useCallback(
    (path: string): ShortcutHandler => () => {
      navigate({ to: path });
    },
    [navigate]
  );

  useEffect(() => {
    // Start the keyboard manager
    keyboardManager.start();

    // Register navigation shortcuts
    Object.entries(NAVIGATION_SHORTCUTS).forEach(([keys, path]) => {
      keyboardManager.register(
        keys,
        createNavigationHandler(path),
        `Navigate to ${path}`
      );
    });

    // Cleanup on unmount
    return () => {
      // Unregister navigation shortcuts
      Object.keys(NAVIGATION_SHORTCUTS).forEach((keys) => {
        keyboardManager.unregister(keys);
      });
      keyboardManager.stop();
    };
  }, [createNavigationHandler]);
}

/**
 * Get the keyboard manager instance for advanced usage.
 */
export function getKeyboardManager() {
  return keyboardManager;
}

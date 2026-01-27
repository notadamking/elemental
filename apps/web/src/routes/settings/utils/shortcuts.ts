/**
 * Shortcuts utilities for the Settings page
 */

import { DEFAULT_SHORTCUTS, type ShortcutCategory } from '../../../lib/keyboard';

export function isMac(): boolean {
  if (typeof window === 'undefined') return false;
  return navigator.platform.toUpperCase().indexOf('MAC') >= 0;
}

export function formatShortcutDisplay(keys: string): string {
  if (isMac()) {
    return keys.replace(/Cmd/gi, '⌘').replace(/Ctrl/gi, '⌃').replace(/Alt/gi, '⌥').replace(/Shift/gi, '⇧');
  }
  return keys.replace(/Cmd/gi, 'Ctrl');
}

export const CATEGORY_LABELS: Record<ShortcutCategory, string> = {
  navigation: 'Navigation',
  actions: 'Actions',
  views: 'Views',
  editing: 'Editing',
  other: 'Other',
};

export function groupShortcutsByCategory(): Record<ShortcutCategory, Array<{ actionId: string; description: string; defaultKeys: string }>> {
  const groups: Record<ShortcutCategory, Array<{ actionId: string; description: string; defaultKeys: string }>> = {
    navigation: [],
    actions: [],
    views: [],
    editing: [],
    other: [],
  };

  for (const [actionId, config] of Object.entries(DEFAULT_SHORTCUTS)) {
    groups[config.category].push({
      actionId,
      description: config.description,
      defaultKeys: config.keys,
    });
  }

  return groups;
}

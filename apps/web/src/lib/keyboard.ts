/**
 * Keyboard shortcut system supporting both modifier shortcuts (Cmd+K)
 * and sequential shortcuts (G T, G P).
 */

export type ShortcutHandler = () => void;

export interface Shortcut {
  /** Display string for the shortcut (e.g., "G T", "Cmd+K") */
  keys: string;
  /** Handler to execute when shortcut is triggered */
  handler: ShortcutHandler;
  /** Description for accessibility/help */
  description?: string;
}

interface ParsedShortcut {
  type: 'modifier' | 'sequential';
  /** For modifier shortcuts: the key with modifiers */
  key?: string;
  meta?: boolean;
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  /** For sequential shortcuts: array of keys to press in order */
  sequence?: string[];
}

/**
 * Parse a shortcut string into a structured format.
 * Supports:
 * - Modifier shortcuts: "Cmd+K", "Ctrl+Shift+P"
 * - Sequential shortcuts: "G T", "G P"
 */
function parseShortcut(keys: string): ParsedShortcut {
  // Check if it's a modifier shortcut (contains +)
  if (keys.includes('+')) {
    const parts = keys.toLowerCase().split('+');
    const key = parts[parts.length - 1];
    return {
      type: 'modifier',
      key,
      meta: parts.includes('cmd') || parts.includes('meta'),
      ctrl: parts.includes('ctrl'),
      alt: parts.includes('alt'),
      shift: parts.includes('shift'),
    };
  }

  // Sequential shortcut (space-separated)
  const sequence = keys.toLowerCase().split(' ').filter(Boolean);
  return {
    type: 'sequential',
    sequence,
  };
}

export class KeyboardShortcutManager {
  private shortcuts: Map<string, Shortcut> = new Map();
  private sequentialShortcuts: Map<string, Shortcut> = new Map();
  private modifierShortcuts: Map<string, Shortcut> = new Map();
  private pendingKeys: string[] = [];
  private sequenceTimeout: ReturnType<typeof setTimeout> | null = null;
  private readonly SEQUENCE_TIMEOUT = 1000; // 1 second to complete sequence
  private enabled = true;

  constructor() {
    this.handleKeyDown = this.handleKeyDown.bind(this);
  }

  /**
   * Register a keyboard shortcut.
   */
  register(keys: string, handler: ShortcutHandler, description?: string): void {
    const shortcut: Shortcut = { keys, handler, description };
    this.shortcuts.set(keys, shortcut);

    const parsed = parseShortcut(keys);
    if (parsed.type === 'modifier') {
      // Store modifier shortcuts by their key
      const key = this.buildModifierKey(parsed);
      this.modifierShortcuts.set(key, shortcut);
    } else if (parsed.sequence) {
      // Store sequential shortcuts by their sequence joined
      const seqKey = parsed.sequence.join(' ');
      this.sequentialShortcuts.set(seqKey, shortcut);
    }
  }

  /**
   * Unregister a keyboard shortcut.
   */
  unregister(keys: string): void {
    const shortcut = this.shortcuts.get(keys);
    if (!shortcut) return;

    this.shortcuts.delete(keys);

    const parsed = parseShortcut(keys);
    if (parsed.type === 'modifier') {
      const key = this.buildModifierKey(parsed);
      this.modifierShortcuts.delete(key);
    } else if (parsed.sequence) {
      const seqKey = parsed.sequence.join(' ');
      this.sequentialShortcuts.delete(seqKey);
    }
  }

  /**
   * Build a unique key for modifier shortcuts.
   */
  private buildModifierKey(parsed: ParsedShortcut): string {
    const parts: string[] = [];
    if (parsed.meta) parts.push('meta');
    if (parsed.ctrl) parts.push('ctrl');
    if (parsed.alt) parts.push('alt');
    if (parsed.shift) parts.push('shift');
    parts.push(parsed.key || '');
    return parts.join('+');
  }

  /**
   * Enable or disable the shortcut system.
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.resetSequence();
    }
  }

  /**
   * Check if shortcuts are enabled.
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Reset pending sequence.
   */
  private resetSequence(): void {
    this.pendingKeys = [];
    if (this.sequenceTimeout) {
      clearTimeout(this.sequenceTimeout);
      this.sequenceTimeout = null;
    }
  }

  /**
   * Handle keydown events.
   */
  handleKeyDown(event: KeyboardEvent): void {
    if (!this.enabled) return;

    // Ignore events when typing in inputs
    const target = event.target as HTMLElement;
    const isInput = target.tagName === 'INPUT' ||
                    target.tagName === 'TEXTAREA' ||
                    target.isContentEditable;

    // Check for modifier shortcuts first (they work even in inputs for Cmd+K style shortcuts)
    if (event.metaKey || event.ctrlKey) {
      const modKey = this.buildModifierKey({
        type: 'modifier',
        key: event.key.toLowerCase(),
        meta: event.metaKey,
        ctrl: event.ctrlKey,
        alt: event.altKey,
        shift: event.shiftKey,
      });

      const shortcut = this.modifierShortcuts.get(modKey);
      if (shortcut) {
        event.preventDefault();
        shortcut.handler();
        return;
      }
    }

    // Skip sequential shortcuts when in input fields
    if (isInput) {
      this.resetSequence();
      return;
    }

    // Handle sequential shortcuts
    const key = event.key.toLowerCase();

    // Ignore modifier keys themselves
    if (['meta', 'control', 'alt', 'shift'].includes(key)) {
      return;
    }

    // Reset sequence timeout
    if (this.sequenceTimeout) {
      clearTimeout(this.sequenceTimeout);
    }

    // Add key to pending sequence
    this.pendingKeys.push(key);
    const currentSequence = this.pendingKeys.join(' ');

    // Check if current sequence matches any shortcut
    const shortcut = this.sequentialShortcuts.get(currentSequence);
    if (shortcut) {
      event.preventDefault();
      this.resetSequence();
      shortcut.handler();
      return;
    }

    // Check if current sequence is a prefix of any shortcut
    const isPrefix = Array.from(this.sequentialShortcuts.keys()).some(
      seq => seq.startsWith(currentSequence + ' ')
    );

    if (isPrefix) {
      // Wait for more keys
      event.preventDefault();
      this.sequenceTimeout = setTimeout(() => {
        this.resetSequence();
      }, this.SEQUENCE_TIMEOUT);
    } else {
      // No match and not a prefix - reset
      this.resetSequence();
    }
  }

  /**
   * Start listening for keyboard events.
   */
  start(): void {
    document.addEventListener('keydown', this.handleKeyDown);
  }

  /**
   * Stop listening for keyboard events.
   */
  stop(): void {
    document.removeEventListener('keydown', this.handleKeyDown);
    this.resetSequence();
  }

  /**
   * Get all registered shortcuts.
   */
  getShortcuts(): Shortcut[] {
    return Array.from(this.shortcuts.values());
  }
}

// Global singleton instance
export const keyboardManager = new KeyboardShortcutManager();

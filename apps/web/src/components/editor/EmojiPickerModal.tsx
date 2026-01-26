/**
 * EmojiPickerModal - Modal for inserting emojis into the document editor
 *
 * Features:
 * - Emoji picker with categories and search
 * - Click to insert emoji
 * - Recent emoji history (stored in localStorage)
 * - Keyboard navigation support
 *
 * Architecture:
 * - Emojis are stored as Unicode characters in Markdown
 * - No :shortcode: syntax in storage - pure Unicode for AI agent compatibility
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import EmojiPicker, {
  EmojiClickData,
  Theme,
  SuggestionMode,
  Categories,
} from 'emoji-picker-react';
import { X } from 'lucide-react';

interface EmojiPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (emoji: string) => void;
}

export function EmojiPickerModal({ isOpen, onClose, onSelect }: EmojiPickerModalProps) {
  // Track recent emojis for persistence - the value is used in setRecentEmojis callback
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_, setRecentEmojis] = useState<string[]>([]);

  // Load recent emojis from localStorage
  useEffect(() => {
    if (isOpen) {
      const stored = localStorage.getItem('elemental.recentEmojis');
      if (stored) {
        try {
          setRecentEmojis(JSON.parse(stored));
        } catch {
          setRecentEmojis([]);
        }
      }
    }
  }, [isOpen]);

  // Handle emoji selection
  const handleEmojiClick = useCallback(
    (emojiData: EmojiClickData) => {
      const emoji = emojiData.emoji;

      // Update recent emojis
      setRecentEmojis((prev) => {
        const filtered = prev.filter((e) => e !== emoji);
        const updated = [emoji, ...filtered].slice(0, 20); // Keep last 20
        localStorage.setItem('elemental.recentEmojis', JSON.stringify(updated));
        return updated;
      });

      // Insert the emoji
      onSelect(emoji);
      onClose();
    },
    [onSelect, onClose]
  );

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isOpen) return;

      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Detect theme from document
  const theme = useMemo(() => {
    if (typeof document !== 'undefined') {
      return document.documentElement.classList.contains('dark') ? Theme.DARK : Theme.LIGHT;
    }
    return Theme.LIGHT;
  }, [isOpen]); // Re-check when modal opens

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      data-testid="emoji-picker-modal"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 transition-opacity"
        onClick={onClose}
        data-testid="emoji-picker-backdrop"
      />

      {/* Modal */}
      <div
        className="relative bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden"
        data-testid="emoji-picker-content"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Insert Emoji
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors"
            data-testid="emoji-picker-close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Emoji Picker */}
        <div className="p-2">
          <EmojiPicker
            onEmojiClick={handleEmojiClick}
            theme={theme}
            searchPlaceholder="Search emojis..."
            suggestedEmojisMode={SuggestionMode.RECENT}
            categories={[
              {
                category: Categories.SUGGESTED,
                name: 'Recently Used',
              },
              {
                category: Categories.SMILEYS_PEOPLE,
                name: 'Smileys & People',
              },
              {
                category: Categories.ANIMALS_NATURE,
                name: 'Animals & Nature',
              },
              {
                category: Categories.FOOD_DRINK,
                name: 'Food & Drink',
              },
              {
                category: Categories.TRAVEL_PLACES,
                name: 'Travel & Places',
              },
              {
                category: Categories.ACTIVITIES,
                name: 'Activities',
              },
              {
                category: Categories.OBJECTS,
                name: 'Objects',
              },
              {
                category: Categories.SYMBOLS,
                name: 'Symbols',
              },
              {
                category: Categories.FLAGS,
                name: 'Flags',
              },
            ]}
            width={350}
            height={400}
            previewConfig={{
              showPreview: true,
            }}
            lazyLoadEmojis={true}
            data-testid="emoji-picker-grid"
          />
        </div>

        {/* Footer with tips */}
        <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Tip: Type <kbd className="px-1 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-xs font-mono">:emoji:</kbd> in the editor to quickly insert emojis
          </p>
        </div>
      </div>
    </div>
  );
}

export default EmojiPickerModal;

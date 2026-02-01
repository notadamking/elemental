/**
 * MessageSearch - TB103
 *
 * Inline search component that allows searching messages within a channel.
 * Shows search results in a dropdown panel and highlights matching terms.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { Search, X, MessageSquare, Loader2, ArrowUp, ArrowDown } from 'lucide-react';
import { useDebounce } from '../../../hooks/useDebounce';
import { useMessageSearch } from '../../../api/hooks/useMessages';
import { formatRelativeTime } from '../../../lib';
import { highlightSearchMatch } from '../../../lib/message-content';
import type { MessageSearchResult } from '../types';

// ============================================================================
// Types
// ============================================================================

interface MessageSearchProps {
  channelId: string | null;
  onResultClick: (result: MessageSearchResult) => void;
  className?: string;
  isMobile?: boolean;
}

// ============================================================================
// Component
// ============================================================================

export function MessageSearch({
  channelId,
  onResultClick,
  className = '',
  isMobile = false,
}: MessageSearchProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Use debounced query for search
  const debouncedQuery = useDebounce(query, 300);
  const {
    data: searchResponse,
    isLoading,
    error,
  } = useMessageSearch(debouncedQuery, channelId);
  const results = searchResponse?.results || [];

  // Open dropdown when query is entered
  useEffect(() => {
    if (query.trim()) {
      setIsOpen(true);
      setSelectedIndex(-1);
    } else {
      setIsOpen(false);
    }
  }, [query]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isOpen || results.length === 0) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) => (prev < results.length - 1 ? prev + 1 : prev));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) => (prev > 0 ? prev - 1 : prev));
          break;
        case 'Enter':
          e.preventDefault();
          if (selectedIndex >= 0 && results[selectedIndex]) {
            handleResultSelect(results[selectedIndex]);
          }
          break;
        case 'Escape':
          e.preventDefault();
          setIsOpen(false);
          inputRef.current?.blur();
          break;
      }
    },
    [isOpen, results, selectedIndex]
  );

  const handleResultSelect = (result: MessageSearchResult) => {
    onResultClick(result);
    setIsOpen(false);
    // Keep query visible for context
  };

  const handleClear = () => {
    setQuery('');
    setIsOpen(false);
    inputRef.current?.focus();
  };

  return (
    <div
      ref={containerRef}
      className={`relative ${className}`}
      data-testid="message-search"
    >
      {/* Search Input */}
      <div className="relative">
        <Search
          className={`absolute top-1/2 -translate-y-1/2 text-gray-400 ${
            isMobile ? 'left-3 w-5 h-5' : 'left-3 w-4 h-4'
          }`}
        />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => query.trim() && setIsOpen(true)}
          placeholder={isMobile ? 'Search...' : 'Search messages...'}
          className={`w-full border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-[var(--color-surface)] text-[var(--color-text)] ${
            isMobile ? 'pl-10 pr-10 py-2.5 text-base' : 'pl-9 pr-8 py-1.5 text-sm'
          }`}
          data-testid="message-search-input"
        />
        {query && (
          <button
            onClick={handleClear}
            className={`absolute top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 ${
              isMobile ? 'right-3' : 'right-2'
            }`}
            data-testid="message-search-clear"
          >
            <X className={isMobile ? 'w-5 h-5' : 'w-4 h-4'} />
          </button>
        )}
      </div>

      {/* Results Dropdown */}
      {isOpen && (
        <div
          className={`absolute top-full mt-1 w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg shadow-lg z-50 ${
            isMobile ? 'max-h-[50vh]' : 'max-h-80'
          } overflow-y-auto`}
          data-testid="message-search-results"
          role="listbox"
        >
          {isLoading ? (
            <div className="flex items-center justify-center py-6 text-gray-500 dark:text-gray-400">
              <Loader2 className={`animate-spin mr-2 ${isMobile ? 'w-5 h-5' : 'w-4 h-4'}`} />
              <span className={isMobile ? 'text-base' : 'text-sm'}>Searching...</span>
            </div>
          ) : error ? (
            <div
              className={`py-4 px-4 text-center text-red-500 ${isMobile ? 'text-base' : 'text-sm'}`}
              data-testid="message-search-error"
            >
              Search failed. Please try again.
            </div>
          ) : results.length === 0 ? (
            <div
              className={`py-6 px-4 text-center text-gray-500 dark:text-gray-400 ${
                isMobile ? 'text-base' : 'text-sm'
              }`}
              data-testid="message-search-empty"
            >
              <MessageSquare className={`mx-auto mb-2 ${isMobile ? 'w-8 h-8' : 'w-6 h-6'}`} />
              <p>No messages found for "{query}"</p>
            </div>
          ) : (
            <>
              {/* Results header */}
              <div
                className={`px-3 py-1.5 text-gray-500 dark:text-gray-400 border-b border-[var(--color-border)] flex items-center justify-between ${
                  isMobile ? 'text-sm' : 'text-xs'
                }`}
              >
                <span>{results.length} result{results.length !== 1 ? 's' : ''}</span>
                <span className="flex items-center gap-1 text-gray-400">
                  <ArrowUp className="w-3 h-3" />
                  <ArrowDown className="w-3 h-3" />
                  to navigate
                </span>
              </div>
              {/* Results list */}
              {results.map((result, index) => (
                <button
                  key={result.id}
                  onClick={() => handleResultSelect(result)}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={`w-full text-left px-3 py-2 transition-colors ${
                    selectedIndex === index
                      ? 'bg-blue-50 dark:bg-blue-900/30'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}
                  role="option"
                  aria-selected={selectedIndex === index}
                  data-testid={`message-search-result-${result.id}`}
                >
                  <div className={`flex items-center gap-2 ${isMobile ? 'mb-1' : 'mb-0.5'}`}>
                    <span
                      className={`font-medium text-[var(--color-text)] ${
                        isMobile ? 'text-sm' : 'text-xs'
                      }`}
                    >
                      {result.sender}
                    </span>
                    <span className={`text-gray-400 ${isMobile ? 'text-xs' : 'text-[10px]'}`}>
                      {formatRelativeTime(result.createdAt)}
                    </span>
                  </div>
                  <div
                    className={`text-gray-600 dark:text-gray-400 truncate ${
                      isMobile ? 'text-sm' : 'text-xs'
                    }`}
                  >
                    {highlightSearchMatch(result.snippet || result.content, query)}
                  </div>
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

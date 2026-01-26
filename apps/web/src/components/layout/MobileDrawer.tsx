/**
 * MobileDrawer - Slide-out drawer for mobile navigation
 *
 * A full-screen overlay drawer that slides in from the left side.
 * Used to display the sidebar on mobile devices.
 *
 * Features:
 * - Slides in from left with backdrop
 * - Closes on backdrop tap
 * - Supports swipe-to-close gesture
 * - Prevents body scroll when open
 * - Trap focus within drawer for accessibility
 */

import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface MobileDrawerProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  'data-testid'?: string;
}

export function MobileDrawer({
  open,
  onClose,
  children,
  'data-testid': testId = 'mobile-drawer',
}: MobileDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef<number | null>(null);

  // Prevent body scroll when drawer is open
  useEffect(() => {
    if (open) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [open]);

  // Close on escape key
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  // Handle swipe-to-close
  const handleTouchStart = (e: React.TouchEvent) => {
    startXRef.current = e.touches[0].clientX;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (startXRef.current === null) return;

    const currentX = e.touches[0].clientX;
    const deltaX = startXRef.current - currentX;

    // If swiping left more than 50px, close the drawer
    if (deltaX > 50) {
      onClose();
      startXRef.current = null;
    }
  };

  const handleTouchEnd = () => {
    startXRef.current = null;
  };

  // Focus trap: focus first focusable element when opened
  useEffect(() => {
    if (open && drawerRef.current) {
      const firstFocusable = drawerRef.current.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      firstFocusable?.focus();
    }
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50"
      data-testid={testId}
      role="dialog"
      aria-modal="true"
      aria-label="Navigation menu"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-200"
        onClick={onClose}
        data-testid={`${testId}-backdrop`}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div
        ref={drawerRef}
        className="absolute left-0 top-0 bottom-0 w-[280px] max-w-[85vw] bg-[var(--color-sidebar-bg)] shadow-2xl transform transition-transform duration-200 ease-out flex flex-col"
        style={{ transform: open ? 'translateX(0)' : 'translateX(-100%)' }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        data-testid={`${testId}-content`}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 p-2 rounded-md text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-sidebar-item-hover)] transition-colors duration-150 z-10"
          aria-label="Close navigation menu"
          data-testid={`${testId}-close`}
        >
          <X className="w-5 h-5" />
        </button>

        {/* Drawer content (Sidebar) */}
        <div className="flex-1 overflow-hidden">
          {children}
        </div>
      </div>
    </div>
  );
}

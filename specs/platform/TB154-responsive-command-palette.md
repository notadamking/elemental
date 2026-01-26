# TB154: Responsive Command Palette

## Purpose

Make the command palette fully responsive and accessible on all device sizes, from mobile phones to large desktop monitors. The command palette (Cmd+K) is a power-user feature that should also work on mobile for quick navigation.

## Design

### Breakpoints

| Breakpoint | Width | Behavior |
|------------|-------|----------|
| Mobile (xs, sm) | < 640px | Full-screen layout with touch-friendly elements |
| Tablet (md, lg) | 640-1023px | Centered modal with backdrop |
| Desktop (xl, 2xl) | >= 1024px | Centered modal with backdrop and keyboard shortcuts |

### Mobile Layout (< 640px)

- **Full-screen sheet** instead of centered modal
- **Back button** (ChevronLeft) in header to close
- **X button** for close on message search mode
- **Larger touch targets** (min 44px height for command items)
- **Larger icons** (w-10 h-10 for icon containers, w-5 h-5 for icons)
- **No keyboard shortcut hints** (hidden on mobile)
- **Search input** in header with full width
- **Scrollable command list** fills remaining height
- **Search button in header** to open palette (since Cmd+K not available)

### Desktop/Tablet Layout (>= 640px)

- **Centered modal** at 20% from top
- **Backdrop** with blur effect (closes on click)
- **Max width** of `max-w-xl` (448px)
- **Keyboard shortcut hints** visible next to commands
- **Footer** with navigation hints (arrows, enter, escape)
- **Escape key** closes palette

### Alternative Mobile Trigger

Since Cmd+K keyboard shortcut isn't available on mobile:
- **Search button** added to mobile header (right side, next to page title)
- **Custom event** (`open-command-palette`) dispatched when button clicked
- **CommandPalette** listens for this event and opens

## Implementation

### Files Modified

1. **`apps/web/src/components/navigation/CommandPalette.tsx`**
   - Added `useIsMobile()` hook for responsive detection
   - Added separate state `commandSearch` for controlled cmdk input
   - Added custom event listener for mobile trigger
   - Conditional rendering: mobile full-screen vs desktop modal
   - Mobile layout uses `Command` component wrapping header and list
   - Desktop layout unchanged (backward compatible)

2. **`apps/web/src/components/layout/AppShell.tsx`**
   - Added `Search` icon import from lucide-react
   - Added search button in mobile header
   - Button dispatches `open-command-palette` custom event

### Component Structure

#### Mobile Layout
```
<div> (fixed inset-0)
  {mode === 'messages' ? (
    <div> (flex flex-col h-full)
      // Message search header with back + X buttons
      // Message results list
    </div>
  ) : (
    <Command> (flex flex-col h-full)
      // Header with back button + search input
      <Command.Input /> (controlled)
      <Command.List /> (scrollable)
    </Command>
  )}
</div>
```

#### Desktop Layout
```
<div> (fixed inset-0)
  <div> (backdrop with blur)
  <div> (centered modal container)
    {mode === 'messages' ? (
      // Message search mode
    ) : (
      <Command>
        // Commands mode with keyboard shortcuts
      </Command>
    )}
  </div>
</div>
```

## Testing

### Test Coverage (15 tests)

**Mobile Viewport (375px):**
1. Opens full-screen command palette on mobile
2. Mobile search button in header opens command palette
3. Mobile command palette has back button to close
4. Mobile command palette shows navigation items
5. Mobile command items have large touch targets (>= 44px)
6. Mobile command palette hides keyboard shortcuts
7. Mobile command palette navigates to tasks page
8. Mobile command palette search works (filtering)
9. Mobile command palette Escape key closes

**Desktop Viewport (1280px):**
10. Desktop shows centered modal command palette
11. Desktop command palette has keyboard shortcut hints
12. Desktop mobile search button is hidden
13. Desktop command palette closes on backdrop click

**Tablet Viewport (768px):**
14. Tablet shows centered modal command palette (not full-screen)

**Viewport Transitions:**
15. Command palette adapts when resizing from mobile to desktop

## Accessibility

- **ARIA attributes:** `role="dialog"`, `aria-modal="true"`, `aria-label="Command palette"`
- **Focus management:** Auto-focus on search input when opened
- **Keyboard navigation:** Arrow keys, Enter to select, Escape to close
- **Touch targets:** Minimum 44x44px for all interactive elements on mobile
- **Close button:** Visible and accessible for screen readers (`aria-label="Close"`)

## Implementation Checklist

- [x] Add `useIsMobile()` hook to CommandPalette
- [x] Create mobile full-screen layout
- [x] Hide keyboard shortcuts on mobile
- [x] Increase touch target sizes on mobile
- [x] Add search button to mobile header in AppShell
- [x] Add custom event listener for mobile trigger
- [x] Preserve desktop layout (no regression)
- [x] Message search mode works on mobile
- [x] Write Playwright tests for mobile, tablet, desktop
- [x] Verify all 15 tests pass
- [x] Verify existing 11 command palette tests pass (no regression)

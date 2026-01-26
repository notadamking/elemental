# TB149: Responsive Messages Page

**Status:** Completed
**Dependencies:** TB145, TB46 (Messaging System)

## Overview

This specification covers making the Messages page fully responsive across all device sizes. The implementation follows a Slack-style mobile pattern with two-screen navigation.

## Implementation

### Mobile Layout (< 640px)

1. **Two-Screen Navigation Pattern**
   - When no channel is selected: Full-screen channel list
   - When channel is selected: Full-screen channel view with back button
   - Hardware back button and browser back navigate from channel view to channel list

2. **Mobile Channel List**
   - Full-width layout (no sidebar constraint)
   - Larger touch targets (44px minimum) for channel items
   - Mobile search input with compact placeholder ("Search...")
   - FAB (Floating Action Button) for creating new channels
   - Pagination hidden on mobile to save space

3. **Mobile Channel Header**
   - Back button (ChevronLeft) for navigation to channel list
   - Channel name truncated with ellipsis
   - Search toggle button (icon only)
   - Members button (icon only)
   - When search is toggled: Full-width search input appears below header

4. **Mobile Message Bubbles**
   - Smaller avatar (32x32px vs 40x40px)
   - Reduced padding and gaps
   - Smaller font sizes for timestamps
   - More button visible for message actions
   - Long-press (500ms) triggers action sheet
   - Action sheet with Copy and Reply options
   - Thread replies open as full-screen overlay

5. **Mobile Message Composer**
   - Reduced padding (p-2 vs p-4)
   - Smaller attachment previews (56x56px vs 80x80px)
   - Touch-friendly action buttons
   - Reduced max/min heights for rich composer
   - Icon-only send button
   - Delete buttons always visible on attachments (no hover required)

### Tablet Layout (640px - 1023px)

- Similar to desktop but with more compact spacing
- Side-by-side channel list and channel view
- Hybrid touch targets

### Desktop Layout (>= 1024px)

- Traditional side-by-side layout
- Fixed-width channel list (256px / w-64)
- Inline message search with "Search messages..." placeholder
- Members button shows "X members" text
- Hover-based message actions
- Full-featured message composer

## Technical Details

### New Components/Features

- **useIsMobile hook**: Detects viewport < 640px
- **isMobile prop**: Propagated through ChannelList, ChannelView, MessageBubble, MessageComposer
- **MobileDetailSheet reuse**: Thread panel uses full-screen overlay on mobile
- **Touch event handlers**: Long-press detection for message actions
- **Action sheet UI**: Bottom sheet with Copy, Reply, Cancel buttons

### Data Test IDs Added

- `mobile-create-channel-fab` - FAB button on mobile
- `channel-back-button` - Back navigation in mobile header
- `mobile-search-toggle` - Search icon button on mobile
- `mobile-message-search-container` - Search input container
- `mobile-message-search-input` - Search text input on mobile
- `message-more-button-{id}` - More actions button on mobile
- `message-action-sheet-{id}` - Action sheet for message
- `mobile-thread-panel` - Full-screen thread overlay
- `mobile-thread-back` - Back button in thread panel

### CSS Classes Used

- `touch-target` - Ensures 44x44px minimum touch target
- Theme-aware colors using CSS variables (--color-bg, --color-text, etc.)
- Dark mode support throughout

## Test Coverage

The implementation includes comprehensive Playwright tests in `apps/web/tests/tb149-responsive-messages.spec.ts`:

### Mobile Tests
- Full-width channel list display
- Mobile FAB visibility and functionality
- Two-screen navigation (channel selection)
- Back button presence and functionality
- Mobile search toggle
- Compact message composer

### Desktop Tests
- Side-by-side layout verification
- Fixed-width channel list
- No mobile FAB on desktop
- No back button on desktop
- Inline search input
- Members button with text

### Responsive Transition Tests
- Desktop to mobile resize handling
- Mobile to desktop resize handling
- State preservation across viewport changes

## Files Modified

- `apps/web/src/routes/messages.tsx` - Main implementation
- `apps/web/tests/tb149-responsive-messages.spec.ts` - Playwright tests (new)

## Accessibility

- All touch targets meet 44x44px minimum
- ARIA labels on icon-only buttons
- Focus management for modals and sheets
- Keyboard navigation preserved
- Screen reader friendly action sheets

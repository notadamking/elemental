# TB150: Responsive Documents Page (Notion-style)

## Overview
This spec covers the responsive implementation of the Documents page for mobile devices, following the established responsive patterns from TB144-TB149.

## Implementation Status
- [x] Mobile viewport detection using `useIsMobile` hook
- [x] Simplified mobile layout (no sidebar library tree)
- [x] Full-screen document list on mobile
- [x] Floating Action Button (FAB) for creating documents
- [x] Touch-friendly search input
- [x] Full-screen create document modal on mobile
- [x] Responsive document detail panel
- [x] Dark mode support for all components
- [x] Playwright tests

## Mobile Behavior

### Document List View
- On mobile, the sidebar library tree is hidden
- The document list takes full width of the screen
- Search input has larger padding (py-3) for touch targets
- Document items are touch-friendly with proper spacing
- FAB positioned at bottom-right for creating new documents

### Document Detail View
- Uses `MobileDetailSheet` component for full-screen display
- Slides up from bottom with swipe-to-close gesture
- Simplified header with only essential action buttons:
  - Edit button (touch-friendly padding)
  - Comments button (with badge)
- Hidden buttons on mobile for cleaner UI:
  - Clone button
  - Version history button
  - Expand/fullscreen buttons (handled by sheet)
  - Close button (sheet handles this)

### Create Document Modal
- Full-screen modal on mobile (rounded top corners)
- Scrollable form content
- Touch-friendly form inputs (py-3 padding)
- Stacked form fields (vs. side-by-side on desktop)
- Sticky action buttons at bottom
- Primary action (Create) on top

## Desktop Behavior
- Side-by-side layout with library tree sidebar (256px width)
- Document list and detail panel split view
- All action buttons visible (edit, clone, history, comments, expand, fullscreen)
- Centered modal dialog for create document

## Breakpoints
- Mobile: 0 - 639px (xs/sm breakpoints)
- Tablet: 640 - 1023px (md/lg breakpoints)
- Desktop: 1024px+ (xl/2xl breakpoints)

## Test Coverage

### Mobile Tests
1. `shows simplified document list on mobile (no sidebar)` - Verifies mobile layout
2. `document items are visible and clickable on mobile` - Touch interaction
3. `search input is touch-friendly on mobile` - Touch target verification
4. `create document modal is full-screen on mobile` - Modal behavior
5. `FAB create button has proper touch target size on mobile` - FAB sizing (44px+)

### Desktop Tests
1. `shows side-by-side layout on desktop` - Layout verification
2. `document detail panel shows alongside document list on desktop` - Split view
3. `fullscreen button is available on desktop` - Feature availability
4. `expand/collapse button works on desktop` - Panel toggle
5. `version history and clone buttons are visible on desktop` - Full toolbar
6. `create document modal is centered on desktop` - Modal positioning

### Responsive Transition Tests
1. `layout transitions correctly when resizing viewport` - Breakpoint handling

## Files Modified
- `apps/web/src/routes/documents.tsx` - Main page component
- `apps/web/src/components/document/CreateDocumentModal.tsx` - Modal component
- `apps/web/tests/documents-responsive.spec.ts` - Test file (new)

## CSS Classes Used
- `touch-target` - Minimum 44px touch target
- `pb-safe` - Safe area padding for bottom
- Dark mode variables: `var(--color-bg)`, `var(--color-border)`, etc.

## Related Specs
- TB144: Responsive Foundation
- TB145: Responsive AppShell & Sidebar
- TB146-TB149: Other responsive page implementations

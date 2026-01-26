# TB145: Responsive AppShell & Sidebar Specification

**Status:** Implemented
**Version:** 1.0.0
**Last Updated:** 2026-01-26

## Purpose

Transform the AppShell and Sidebar components from a desktop-only layout to a fully responsive design that works across all device sizes. The sidebar is the most critical responsive component as it affects navigation throughout the entire application.

## Behavior by Viewport

### Mobile (< 768px)

- **Sidebar:** Hidden by default, rendered inside a slide-out drawer overlay
- **Header:** Hamburger menu button (left), centered page title, theme toggle (right)
- **Drawer Behavior:**
  - Opens from left side with dark semi-transparent backdrop
  - Closes on: backdrop tap, close button, Escape key, navigation
  - Swipe left to close gesture supported
  - Prevents body scroll when open
  - Focus trapped within drawer for accessibility
- **Keyboard Shortcuts:** Hints hidden (touch-primary devices)

### Tablet (768px - 1023px)

- **Sidebar:** Collapsed by default (icons only, 64px width)
- **Header:** Full breadcrumbs, connection status visible
- **Expand/Collapse:** Click expand button to show full sidebar
- **Keyboard Shortcuts:** `Cmd+B` to toggle, hints visible

### Desktop (>= 1024px)

- **Sidebar:** Expanded by default (240px width), persisted in localStorage
- **Header:** Full breadcrumbs, connection status visible
- **Expand/Collapse:** Click collapse button in header or `Cmd+B`
- **Keyboard Shortcuts:** All hints visible

## Components

### AppShell (`apps/web/src/components/layout/AppShell.tsx`)

Main layout component that orchestrates responsive behavior:

- Uses `useIsMobile()` and `useIsTablet()` hooks for breakpoint detection
- Manages drawer open/close state for mobile
- Persists desktop sidebar collapsed state in localStorage
- Automatically closes drawer on navigation
- Renders conditional header layout based on viewport

### Sidebar (`apps/web/src/components/layout/Sidebar.tsx`)

Navigation sidebar with responsive adaptations:

- Accepts `isMobileDrawer` prop to adjust styling when inside drawer
- Shows/hides keyboard shortcut hints based on context
- Full width when in mobile drawer, fixed width on desktop

### MobileDrawer (`apps/web/src/components/layout/MobileDrawer.tsx`)

Overlay drawer component for mobile navigation:

- Fixed position overlay with backdrop
- Slide-in animation from left
- Swipe-to-close gesture support
- Focus trap for accessibility
- `aria-modal="true"` and `role="dialog"` for screen readers

### BreadcrumbsMobile

Simplified mobile breadcrumbs showing only current page title:

- Centered in header
- Truncated with ellipsis for long titles
- Icon + label format

## localStorage Keys

| Key | Description | Values |
|-----|-------------|--------|
| `elemental-sidebar-collapsed` | Desktop sidebar collapsed state | `"true"` / `"false"` |

## Accessibility

- Mobile drawer has `role="dialog"` and `aria-modal="true"`
- Hamburger button has `aria-expanded` reflecting drawer state
- Close button has `aria-label="Close navigation menu"`
- Focus trapped within drawer when open
- Escape key closes drawer
- All touch targets minimum 44px

## CSS Tokens Used

From TB144 Responsive Foundation:

- `--breakpoint-lg` (768px) - mobile/tablet boundary
- `--breakpoint-xl` (1024px) - tablet/desktop boundary
- `--sidebar-width-collapsed` (3.5rem / 56px)
- `--sidebar-width-expanded` (15rem / 240px)
- `--touch-target-min` (2.75rem / 44px)

## Test Coverage

27 Playwright tests in `apps/web/tests/tb145-responsive-appshell.spec.ts`:

- Mobile viewport tests (10 tests)
  - Sidebar hidden, hamburger visible
  - Drawer open/close behaviors
  - Navigation closes drawer
  - Simplified breadcrumbs
  - Hidden connection status
  - Hidden keyboard hints
  - Touch target sizes

- Tablet viewport tests (4 tests)
  - Collapsed sidebar
  - No hamburger menu
  - Full breadcrumbs
  - Expand button visible

- Desktop viewport tests (4 tests)
  - Expanded sidebar default
  - Cmd+B toggle
  - Collapse button visible
  - Keyboard hints visible

- State persistence tests (2 tests)
  - localStorage persistence
  - Mobile drawer unaffected by localStorage

- Responsive transitions tests (2 tests)
  - Drawer closes on viewport grow
  - Sidebar state maintained on resize

- Header responsiveness test (1 test)
- Accessibility tests (3 tests)
- No horizontal overflow test (1 test)

## Implementation Checklist

- [x] Step 1: Analyze current AppShell and Sidebar structure
- [x] Step 2: Implement mobile sidebar as slide-out drawer
- [x] Step 3: Add backdrop and close behavior
- [x] Step 4: Handle sidebar close on navigation
- [x] Step 5: Implement tablet behavior (collapsed by default)
- [x] Step 6: Implement desktop behavior (always visible)
- [x] Step 7: Add responsive header with hamburger menu
- [x] Step 8: Handle keyboard shortcuts on touch devices
- [x] Step 9: Persist sidebar state per breakpoint
- [x] Step 10: Write comprehensive Playwright tests
- [x] Step 11: Create specification document

## Files Modified

- `apps/web/src/components/layout/AppShell.tsx` - Added responsive logic, mobile header, BreadcrumbsMobile
- `apps/web/src/components/layout/Sidebar.tsx` - Added `isMobileDrawer` prop support
- `apps/web/src/components/layout/MobileDrawer.tsx` - New component
- `apps/web/src/components/layout/index.ts` - Export MobileDrawer
- `apps/web/tests/tb145-responsive-appshell.spec.ts` - New test file

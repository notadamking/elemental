# TB157: Responsive Empty States & Loading States

**Status:** Implemented
**Date:** 2026-01-26
**Tracer Bullet:** Phase 39 (Comprehensive Responsive Design)

## Purpose

Ensure all empty states and loading states (skeletons) throughout the application are properly sized and look good across all screen sizes, from mobile (375px) to desktop (1280px+).

## Problem Statement

Empty states and loading states appear throughout the app (when data is loading, when lists are empty, etc.). These UI elements need to:
- Scale appropriately for different screen sizes
- Maintain readability on small screens
- Have touch-friendly action buttons on mobile
- Preserve proper contrast in light and dark modes

## Implementation

### Components Updated

#### 1. EmptyState Component (`src/components/shared/EmptyState.tsx`)

**New Features:**
- Added `size` prop with variants: `'sm' | 'md' | 'lg'`
- Responsive sizing for icon container, icon, title, description, and action button
- Touch-friendly action button with minimum 44px height on mobile
- Full-width action button on very small screens (< 480px)
- Added data-testid attributes for all sub-elements

**Size Variants:**

| Element | sm (mobile) | md (default) | lg (large) |
|---------|------------|--------------|------------|
| Container padding | px-4 py-6 | px-4 py-8 | px-6 py-12 |
| Icon container | 40-48px | 48-64px | 64-80px |
| Icon | 20-24px | 24-32px | 32-40px |
| Title | text-sm/text-base | text-base/text-lg | text-lg/text-xl |
| Button height | 36-40px | 44px | 48px |

#### 2. Skeleton Components (`src/components/ui/Skeleton.tsx`)

**Components Updated/Added:**

1. **SkeletonCard** - Now accepts `size` prop ('sm' | 'md' | 'lg')
2. **SkeletonTaskCard** - New `variant` prop ('mobile' | 'desktop')
   - Mobile: larger padding (p-4), larger touch targets (24px checkbox)
   - Desktop: compact padding (p-2.5/p-3)
3. **SkeletonTableRow** - Responsive gap (gap-2 sm:gap-4)
4. **SkeletonList** - New responsive props:
   - `mobileItemHeight` (default: 80px)
   - `desktopItemHeight` (default: 60px)
   - `mobileGap` (default: 12px)
   - `desktopGap` (default: 8px)
   - `variant` ('auto' | 'mobile' | 'desktop')
5. **SkeletonStatCard** - Responsive padding (p-3 sm:p-4)
6. **SkeletonPage** - Responsive header layout (stacks on mobile)
7. **SkeletonMessageBubble** (new) - Message bubble loading skeleton
8. **SkeletonDocumentCard** (new) - Document card loading skeleton
9. **SkeletonEntityCard** (new) - Entity/team card loading skeleton

### Data Test IDs

All components include data-testid attributes for testing:

- `empty-state` - Main EmptyState container
- `empty-state-icon` - Icon container
- `empty-state-title` - Title element
- `empty-state-description` - Description element
- `empty-state-action` - Action button
- `skeleton` - Base skeleton element
- `skeleton-card` - Card skeleton
- `skeleton-task-card` - Task card skeleton
- `skeleton-table-row` - Table row skeleton
- `skeleton-list` - List skeleton container
- `skeleton-list-item` - Individual list item skeleton
- `skeleton-stat-card` - Stats card skeleton
- `skeleton-page` - Full page skeleton
- `skeleton-message-bubble` - Message bubble skeleton
- `skeleton-document-card` - Document card skeleton
- `skeleton-entity-card` - Entity card skeleton

## Usage Examples

### EmptyState with Size Variant

```tsx
// Default (medium)
<EmptyState
  type="tasks"
  title="No tasks found"
  description="Create your first task to get started"
  action={{ label: "Create Task", onClick: handleCreate }}
/>

// Small variant (for compact spaces)
<EmptyState
  type="tasks"
  size="sm"
  title="No tasks"
/>

// Large variant (for full-page empty states)
<EmptyState
  type="inbox"
  size="lg"
  title="Your inbox is empty"
  description="Direct messages and @mentions will appear here"
/>
```

### Skeleton with Responsive Sizing

```tsx
// Responsive task card skeleton
<SkeletonTaskCard variant="mobile" /> // On mobile
<SkeletonTaskCard variant="desktop" /> // On desktop

// Responsive list with mobile/desktop heights
<SkeletonList
  count={5}
  mobileItemHeight={80}
  desktopItemHeight={60}
/>

// Auto-responsive card
<SkeletonCard size="md" />
```

## Testing

21 Playwright tests in `apps/web/tests/tb157-responsive-states.spec.ts`:

### Test Categories:

1. **Responsive Empty States (5 tests)**
   - EmptyState renders correctly on mobile, tablet, desktop
   - Action button has touch-friendly size
   - Title and description fit within viewport

2. **Responsive Loading States (3 tests)**
   - Data preloader shows loading state
   - Skeleton components render on mobile
   - Skeleton list adapts to viewport

3. **Page-specific Empty States (6 tests)**
   - Tasks, Documents, Plans, Entities, Teams, Inbox pages
   - Verify no horizontal overflow at all breakpoints

4. **Loading State Skeleton Variations (2 tests)**
   - SkeletonTaskCard responsive sizing
   - SkeletonStatCard responsive sizing

5. **Viewport Transitions (2 tests)**
   - Empty state adapts when resizing
   - Loading skeletons adapt when resizing

6. **Accessibility (3 tests)**
   - Light mode contrast
   - Dark mode contrast
   - Skeleton animation presence

## Files Changed

- `apps/web/src/components/shared/EmptyState.tsx` - Added responsive sizing
- `apps/web/src/components/ui/Skeleton.tsx` - Added responsive variants
- `apps/web/tests/tb157-responsive-states.spec.ts` - 21 Playwright tests

## Verification

```bash
# Run TB157 tests
npx playwright test tb157-responsive-states

# Result: 21 passed
```

## Design Notes

- Mobile-first approach: base styles target mobile, then scale up with breakpoints
- Touch targets: minimum 44px height for buttons on mobile
- Animation: skeleton pulse animation uses Tailwind's `animate-pulse`
- Dark mode: all components use CSS custom properties for theme support
- Breakpoints follow existing pattern: sm (640px), md (768px), lg (1024px)

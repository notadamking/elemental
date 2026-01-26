# TB144: Responsive Foundation & CSS Infrastructure

**Status:** Implemented
**Last Updated:** 2026-01-26

## Purpose

Establish the CSS infrastructure and responsive foundation needed for all subsequent responsive design work. This tracer bullet creates the breakpoint system, responsive spacing utilities, responsive typography scale, and testing utilities that will be used throughout Phase 39.

## Breakpoint Strategy

The application uses a 6-tier breakpoint system:

| Breakpoint | Min Width | Max Width | Device Type | Description |
|------------|-----------|-----------|-------------|-------------|
| xs | 0px | 479px | mobile | Small phones |
| sm | 480px | 639px | mobile | Large phones |
| md | 640px | 767px | tablet | Small tablets |
| lg | 768px | 1023px | tablet | Tablets |
| xl | 1024px | 1279px | desktop | Small laptops |
| 2xl | 1280px+ | - | desktop | Desktops |

## Implementation

### CSS Tokens (`apps/web/src/styles/tokens.css`)

Added responsive CSS custom properties that adapt based on viewport:

#### Breakpoint Tokens
```css
:root {
  --breakpoint-xs: 0;
  --breakpoint-sm: 480px;
  --breakpoint-md: 640px;
  --breakpoint-lg: 768px;
  --breakpoint-xl: 1024px;
  --breakpoint-2xl: 1280px;
}
```

#### Responsive Spacing Tokens
```css
:root {
  --gap-responsive: var(--spacing-4);        /* 16px on mobile */
  --padding-responsive: var(--spacing-4);
  --margin-responsive: var(--spacing-4);
  --container-padding: var(--spacing-4);
  --touch-target-min: 2.75rem;               /* 44px minimum touch target */
}

@media (min-width: 768px) {
  :root {
    --gap-responsive: var(--spacing-6);      /* 24px on tablet */
  }
}

@media (min-width: 1280px) {
  :root {
    --gap-responsive: var(--spacing-8);      /* 32px on desktop */
  }
}
```

#### Responsive Typography Tokens
```css
:root {
  --font-size-responsive-base: 0.875rem;     /* 14px on mobile */
  --font-size-responsive-h1: 1.5rem;         /* 24px on mobile */
}

@media (min-width: 768px) {
  :root {
    --font-size-responsive-base: 0.9375rem;  /* 15px on tablet */
    --font-size-responsive-h1: 1.75rem;      /* 28px on tablet */
  }
}

@media (min-width: 1280px) {
  :root {
    --font-size-responsive-base: 1rem;       /* 16px on desktop */
    --font-size-responsive-h1: 2rem;         /* 32px on desktop */
  }
}
```

#### Responsive Layout Tokens
```css
:root {
  --sidebar-width: 0;                        /* Hidden on mobile */
  --detail-panel-width: 100%;                /* Full screen on mobile */
}

@media (min-width: 768px) {
  :root {
    --sidebar-width: var(--sidebar-width-collapsed);
    --detail-panel-width: 20rem;             /* 320px on tablet */
  }
}

@media (min-width: 1024px) {
  :root {
    --sidebar-width: var(--sidebar-width-expanded);
    --detail-panel-width: 25rem;             /* 400px on desktop */
  }
}
```

#### Responsive Utility Classes
```css
.gap-responsive { gap: var(--gap-responsive); }
.p-responsive { padding: var(--padding-responsive); }
.px-responsive { padding-left/right: var(--padding-responsive); }
.py-responsive { padding-top/bottom: var(--padding-responsive); }
.m-responsive { margin: var(--margin-responsive); }
.mx-responsive { margin-left/right: var(--margin-responsive); }
.my-responsive { margin-top/bottom: var(--margin-responsive); }
.container-padding { padding-left/right: var(--container-padding); }
.min-touch-target { min-width/height: var(--touch-target-min); }
.text-responsive { font-size: var(--font-size-responsive-base); }
.text-responsive-h1 { font-size: var(--font-size-responsive-h1); }
.prose-width { max-width: var(--prose-max-width); }
```

### React Hooks (`apps/web/src/hooks/useBreakpoint.ts`)

Created hooks for detecting and responding to viewport changes:

- `useBreakpoint()` - Returns current breakpoint ('xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl')
- `useWindowSize()` - Returns { width, height }
- `useIsMobile()` - Returns true for xs/sm breakpoints
- `useIsTablet()` - Returns true for md/lg breakpoints
- `useIsDesktop()` - Returns true for xl/2xl breakpoints
- `useDeviceType()` - Returns 'mobile' | 'tablet' | 'desktop'
- `useMediaQuery(query)` - Returns true if CSS media query matches
- `useBreakpointAtLeast(target)` - Returns true if current >= target
- `useBreakpointAtMost(target)` - Returns true if current <= target
- `useBreakpointBetween(min, max)` - Returns true if within range
- `useTouchDevice()` - Returns true if device supports touch
- `usePrefersReducedMotion()` - Returns true if user prefers reduced motion
- `useResponsive()` - Combined hook with all responsive information

### Playwright Test Helpers (`apps/web/tests/helpers/responsive.ts`)

Created utilities for testing responsive behavior:

- `VIEWPORTS` - Standard viewport configurations for each breakpoint
- `DEVICE_PRESETS` - Quick presets for mobile/tablet/desktop
- `setViewport(page, viewport)` - Set page viewport size
- `testAtViewport(page, viewport, testFn)` - Run test at specific viewport
- `testResponsive(page, config)` - Run tests at mobile/tablet/desktop
- `testAtAllBreakpoints(page, testFn)` - Run test at all 6 breakpoints
- `getCSSVariable(page, varName)` - Get CSS custom property value
- `getCSSProperty(page, selector, property)` - Get computed CSS property
- `hasTouchTargetSize(page, selector)` - Verify 44px minimum size
- `getBoundingBox(page, selector)` - Get element dimensions
- `isElementInViewport(page, selector)` - Check if element visible
- `hasHorizontalOverflow(page, selector)` - Check for x-axis scrollbar
- `touchTap(page, target)` - Simulate touch tap
- `swipe(page, direction, options)` - Simulate swipe gesture
- `waitForResponsiveUpdate(page)` - Wait for CSS to apply
- `getCurrentBreakpoint(page)` - Get breakpoint from viewport size
- `getCurrentDeviceType(page)` - Get device type from viewport

## Viewport Meta Tag

Verified `index.html` has correct viewport configuration:
```html
<meta name="viewport" content="width=device-width, initial-scale=1.0">
```

Does NOT include `user-scalable=no` (required for accessibility).

## Testing

18 Playwright tests passing in `apps/web/tests/tb144-responsive-foundation.spec.ts`:

- Viewport meta tag verification
- CSS breakpoint token definitions
- Responsive spacing token changes at breakpoints
- Touch target minimum size
- Responsive typography scaling
- Responsive layout tokens (sidebar, detail panel)
- Test helper utilities (setViewport, getCurrentBreakpoint, etc.)
- No horizontal overflow at tablet and desktop
- Responsive utility class application

1 test skipped (mobile horizontal overflow - will be fixed in TB145).

## Files Changed

- `apps/web/src/styles/tokens.css` - Added responsive CSS tokens and utility classes
- `apps/web/src/hooks/useBreakpoint.ts` - New file with responsive hooks
- `apps/web/src/hooks/index.ts` - Export new hooks
- `apps/web/tests/helpers/responsive.ts` - New file with Playwright helpers
- `apps/web/tests/tb144-responsive-foundation.spec.ts` - New test file

## Usage Examples

### Using Responsive Hooks
```tsx
import { useIsMobile, useBreakpoint, useResponsive } from '@/hooks';

function MyComponent() {
  const isMobile = useIsMobile();
  const breakpoint = useBreakpoint();
  const { deviceType, isTouch } = useResponsive();

  return (
    <div className={isMobile ? 'single-column' : 'two-column'}>
      {breakpoint === 'xs' && <MobileMenu />}
      {isTouch && <TouchInstructions />}
    </div>
  );
}
```

### Using Responsive CSS Classes
```tsx
<div className="gap-responsive p-responsive">
  <h1 className="text-responsive-h1">Title</h1>
  <p className="text-responsive">Body text</p>
</div>
```

### Playwright Responsive Testing
```typescript
import { testResponsive, setViewport, VIEWPORTS } from './helpers/responsive';

test('responsive layout', async ({ page }) => {
  await testResponsive(page, {
    mobile: async () => {
      await expect(sidebar).not.toBeVisible();
    },
    tablet: async () => {
      await expect(sidebar).toHaveClass(/collapsed/);
    },
    desktop: async () => {
      await expect(sidebar).toBeVisible();
    },
  });
});
```

## Next Steps

TB145 will use this foundation to implement the responsive AppShell and Sidebar, including:
- Mobile sidebar as slide-out drawer
- Tablet collapsed sidebar
- Desktop expanded sidebar
- Hamburger menu on mobile

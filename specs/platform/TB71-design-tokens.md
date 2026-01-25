# TB71: Design Tokens Foundation

**Status:** Implemented
**Last Updated:** 2026-01-25

## Purpose

Establish a comprehensive design token system for the Elemental web platform that provides consistent styling across all components. This foundation enables:

- **Single source of truth** for colors, spacing, typography, and other visual properties
- **Theme switching** (light/dark mode) with CSS custom properties
- **Easy customization** by changing values in one place
- **Consistent 4px grid** for spacing and sizing
- **Modern, accessible** color palettes

## Architecture

### File Structure

```
apps/web/src/styles/
├── tokens.css      # All design tokens as CSS custom properties
└── README.md       # Documentation for token usage
```

### Token Categories

| Category | Token Prefix | Example |
|----------|-------------|---------|
| Colors | `--color-*` | `--color-primary-500`, `--color-bg` |
| Spacing | `--spacing-*` | `--spacing-4` |
| Typography | `--font-*`, `--font-size-*` | `--font-family-sans`, `--font-size-lg` |
| Border Radius | `--radius-*` | `--radius-lg` |
| Shadows | `--shadow-*` | `--shadow-md` |
| Transitions | `--duration-*`, `--ease-*` | `--duration-normal` |
| Z-Index | `--z-index-*` | `--z-index-modal` |

## Token Reference

### Color Tokens

#### Primary Color Scale (Blue)
Full scale from 50-950:
- `--color-primary-50` (#eff6ff) to `--color-primary-950` (#172554)

#### Secondary Color Scale (Slate)
Full scale from 50-950:
- `--color-secondary-50` (#f8fafc) to `--color-secondary-950` (#020617)

#### Accent Color Scale (Violet)
Full scale from 50-950:
- `--color-accent-50` (#f5f3ff) to `--color-accent-950` (#2e1065)

#### Neutral Color Scale (Gray)
Full scale from 50-950:
- `--color-neutral-50` (#fafafa) to `--color-neutral-950` (#09090b)

#### Semantic Status Colors
- **Success (Green):** `--color-success-50` to `--color-success-950`
- **Warning (Amber):** `--color-warning-50` to `--color-warning-950`
- **Error (Red):** `--color-error-50` to `--color-error-950`

#### Semantic UI Colors
| Token | Light Mode | Dark Mode |
|-------|------------|-----------|
| `--color-bg` | #ffffff | #0d0d0d |
| `--color-bg-secondary` | #f9fafb | #1a1a1a |
| `--color-text` | #111827 | #f9fafb |
| `--color-text-secondary` | #6b7280 | #9ca3af |
| `--color-border` | #e5e7eb | #2d2d2d |
| `--color-surface` | #ffffff | #1a1a1a |
| `--color-surface-hover` | #f9fafb | #262626 |

### Spacing Tokens (4px Grid)

| Token | Value | Pixels |
|-------|-------|--------|
| `--spacing-1` | 0.25rem | 4px |
| `--spacing-2` | 0.5rem | 8px |
| `--spacing-3` | 0.75rem | 12px |
| `--spacing-4` | 1rem | 16px |
| `--spacing-6` | 1.5rem | 24px |
| `--spacing-8` | 2rem | 32px |
| `--spacing-12` | 3rem | 48px |
| `--spacing-16` | 4rem | 64px |
| `--spacing-24` | 6rem | 96px |

### Typography Tokens

| Token | Value |
|-------|-------|
| `--font-family-sans` | System UI stack |
| `--font-family-mono` | Monospace stack |
| `--font-size-xs` | 0.75rem (12px) |
| `--font-size-sm` | 0.875rem (14px) |
| `--font-size-base` | 1rem (16px) |
| `--font-size-lg` | 1.125rem (18px) |
| `--font-size-xl` | 1.25rem (20px) |
| `--font-size-2xl` | 1.5rem (24px) |
| `--font-weight-normal` | 400 |
| `--font-weight-medium` | 500 |
| `--font-weight-semibold` | 600 |
| `--font-weight-bold` | 700 |

### Border Radius Tokens

| Token | Value | Pixels |
|-------|-------|--------|
| `--radius-sm` | 0.125rem | 2px |
| `--radius-md` | 0.375rem | 6px |
| `--radius-lg` | 0.5rem | 8px |
| `--radius-xl` | 0.75rem | 12px |
| `--radius-2xl` | 1rem | 16px |
| `--radius-full` | 9999px | Full circle |

### Shadow Tokens

| Token | Use Case |
|-------|----------|
| `--shadow-xs` | Subtle elevation (inputs) |
| `--shadow-sm` | Low elevation (cards) |
| `--shadow-md` | Medium elevation (dropdowns) |
| `--shadow-lg` | High elevation (modals) |
| `--shadow-xl` | Highest elevation (dialogs) |
| `--shadow-focus` | Focus ring for accessibility |

### Transition Tokens

| Token | Value | Use Case |
|-------|-------|----------|
| `--duration-fast` | 100ms | Micro-interactions |
| `--duration-normal` | 200ms | Standard interactions |
| `--duration-slow` | 300ms | Larger animations |
| `--ease-linear` | linear | Constant speed |
| `--ease-in-out` | cubic-bezier(0.4, 0, 0.2, 1) | Natural motion |

### Z-Index Tokens

| Token | Value | Use Case |
|-------|-------|----------|
| `--z-index-dropdown` | 1000 | Dropdown menus |
| `--z-index-sticky` | 1020 | Sticky headers |
| `--z-index-modal` | 1050 | Modal content |
| `--z-index-popover` | 1060 | Popovers |
| `--z-index-tooltip` | 1070 | Tooltips |
| `--z-index-toast` | 1080 | Toast notifications |

## Usage

### In CSS

```css
.my-component {
  background-color: var(--color-bg);
  color: var(--color-text);
  padding: var(--spacing-4);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  transition: all var(--duration-normal) var(--ease-in-out);
}
```

### Theme Switching

Toggle dark mode by adding `.dark` or `.theme-dark` class to `:root`:

```javascript
// Enable dark mode
document.documentElement.classList.add('dark');

// Disable dark mode
document.documentElement.classList.remove('dark');
```

### Customizing Primary Color

Change the primary color palette in `tokens.css`:

```css
:root {
  --color-primary-500: #your-brand-color;
  /* ... other shades */
}
```

## Implementation Checklist

- [x] Create `src/styles/tokens.css` with CSS custom properties
- [x] Color tokens: primary, secondary, accent, neutral, success, warning, error scales
- [x] Spacing tokens: 4px grid system
- [x] Typography tokens: font families, sizes, weights, line heights
- [x] Border radius tokens
- [x] Shadow tokens with dark mode variants
- [x] Transition tokens: durations and timing functions
- [x] Z-index tokens for layering
- [x] Semantic color tokens for light/dark modes
- [x] Update `index.css` to import tokens before Tailwind
- [x] Create `src/styles/README.md` documentation
- [x] Playwright tests (12 tests passing)

## Testing

Run the design tokens tests:

```bash
cd apps/web
npx playwright test tests/design-tokens.spec.ts
```

Tests verify:
- Tokens are loaded in stylesheets
- Primary color tokens work correctly
- Semantic colors adapt to light mode
- Full color scales are available
- Spacing tokens follow 4px grid
- Border radius tokens are correct
- Typography tokens work
- Shadow tokens are defined
- Transition tokens work
- Z-index tokens are defined
- Body applies theme colors
- Primary color can be overridden

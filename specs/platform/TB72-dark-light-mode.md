# TB72: Dark/Light Mode Overhaul

**Status:** Implemented
**Last Updated:** 2026-01-25

## Purpose

Complete overhaul of the dark/light mode system for the Elemental web platform. This builds on TB71's design tokens foundation to provide:

- **Deep charcoal dark mode** (#0D0D0D, #1A1A1A) for a modern, premium feel
- **Clean light mode** with whites and grays for crisp contrast
- **Smooth transitions** (300ms) when switching between modes
- **Quick toggle** in the header in addition to Settings page
- **Consistent theming** across all components

## Architecture

### Theme State Management

The theme system uses a central hook (`useTheme`) and early initialization:

```
apps/web/src/
├── hooks/
│   ├── useTheme.ts       # Theme hook with toggle functions
│   └── index.ts          # Re-exports useTheme
├── components/
│   └── ui/
│       └── ThemeToggle.tsx  # Header toggle component
├── main.tsx              # Early theme initialization
└── styles/
    └── tokens.css        # Color tokens for both modes
```

### Theme Storage

Theme preference is stored in localStorage:
- Key: `settings.theme`
- Values: `'light'` | `'dark'` | `'system'`

### CSS Classes

Applied to `document.documentElement`:
- Light mode: `theme-light`
- Dark mode: `dark`, `theme-dark`

## Color Tokens

### Dark Mode Palette

| Token | Value | Usage |
|-------|-------|-------|
| `--color-bg` | #0d0d0d | Main background |
| `--color-bg-secondary` | #141414 | Card backgrounds |
| `--color-bg-tertiary` | #1a1a1a | Elevated surfaces |
| `--color-sidebar-bg` | #0d0d0d | Sidebar background |
| `--color-header-bg` | #0d0d0d | Header background |
| `--color-border` | #262626 | Default borders |
| `--color-text` | #f5f5f5 | Primary text |
| `--color-text-secondary` | #a1a1aa | Secondary text |

### Light Mode Palette

| Token | Value | Usage |
|-------|-------|-------|
| `--color-bg` | #ffffff | Main background |
| `--color-bg-secondary` | #f9fafb | Card backgrounds |
| `--color-sidebar-bg` | #ffffff | Sidebar background |
| `--color-header-bg` | #ffffff | Header background |
| `--color-border` | #e5e7eb | Default borders |
| `--color-text` | #111827 | Primary text |
| `--color-text-secondary` | #6b7280 | Secondary text |

## Components Updated

### AppShell
- Background uses `--color-bg` in dark mode
- Header uses `--color-header-bg` and `--color-header-border`
- Includes ThemeToggle component

### Sidebar
- Background uses `--color-sidebar-bg`
- Borders use `--color-sidebar-border`
- Nav items use `--color-sidebar-item-*` tokens for hover/active states

### ThemeToggle
- Sun icon in dark mode (click to switch to light)
- Moon icon in light mode (click to switch to dark)
- Located in header next to connection status

## Theme Initialization

To prevent flash of wrong theme, `main.tsx` initializes theme before React renders:

```typescript
function initializeTheme() {
  const stored = localStorage.getItem('settings.theme');
  const theme = stored || 'system';
  const resolvedTheme = theme === 'system'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : theme;

  if (resolvedTheme === 'dark') {
    document.documentElement.classList.add('dark', 'theme-dark');
  } else {
    document.documentElement.classList.add('theme-light');
  }
}

initializeTheme();
```

## Smooth Transitions

CSS transitions are applied in `index.css`:

```css
body {
  transition: background-color var(--duration-slow) var(--ease-in-out),
              color var(--duration-slow) var(--ease-in-out);
}
```

Where `--duration-slow` is 300ms.

## Usage

### Using Theme Hook

```typescript
import { useTheme } from '../hooks';

function MyComponent() {
  const { theme, isDark, toggleDarkMode, setTheme } = useTheme();

  return (
    <button onClick={toggleDarkMode}>
      {isDark ? 'Switch to Light' : 'Switch to Dark'}
    </button>
  );
}
```

### Using ThemeToggle Component

```tsx
import { ThemeToggle } from '../components/ui/ThemeToggle';

function Header() {
  return (
    <header>
      <ThemeToggle />
    </header>
  );
}
```

## Implementation Checklist

- [x] Define complete color palette for both modes in `tokens.css`
- [x] Dark mode: deep charcoal backgrounds (#0D0D0D, #1A1A1A), subtle borders
- [x] Light mode: clean whites and grays, crisp contrast
- [x] Fix Settings page notification types horizontal padding issue
- [x] Add smooth transition between modes (300ms)
- [x] Update AppShell to use design tokens
- [x] Update Sidebar to use design tokens
- [x] Create `useTheme` hook
- [x] Create `ThemeToggle` component
- [x] Add theme toggle to header
- [x] Early theme initialization in `main.tsx`
- [x] Playwright tests (17 tests passing)

## Testing

Run the dark/light mode tests:

```bash
cd apps/web
npx playwright test tests/dark-light-mode.spec.ts
```

Tests verify:
- Theme toggle button is visible in header
- Clicking toggle switches between light and dark mode
- Theme preference persists in localStorage
- Theme persists after page reload
- Dark mode styling is applied correctly
- Light mode styling is applied correctly
- Smooth transitions are configured
- Settings page theme section syncs with header toggle
- Notification types list has proper padding
- Theme persists across page navigation

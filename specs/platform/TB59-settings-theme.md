# TB59: Settings Page - Theme

## Purpose

Provide users with a settings page where they can customize their theme preference (light, dark, or system-based).

## Implementation

### Components Created

1. **SettingsPage** (`apps/web/src/routes/settings.tsx`)
   - Main settings page component with sidebar navigation
   - Theme section is shown by default
   - Other sections (Shortcuts, Defaults, Notifications, Sync) show "coming soon"

2. **ThemeOption** - Individual theme option button with:
   - Icon (Sun, Moon, Monitor)
   - Title and description
   - Active indicator when selected
   - Proper dark mode styling

3. **ThemeSection** - Main theme configuration area with:
   - Three theme options (Light, Dark, System)
   - Theme preview showing current appearance
   - Description explaining each option

### Theme System

- **Storage Key**: `settings.theme` in localStorage
- **Values**: `'light' | 'dark' | 'system'`
- **CSS Classes Applied**:
  - `theme-light` on document root for light mode
  - `theme-dark` and `dark` on document root for dark mode
- **CSS Variables** (added to `index.css`):
  - `--color-bg`: Background color
  - `--color-bg-secondary`: Secondary background
  - `--color-text`: Primary text color
  - `--color-text-secondary`: Secondary text color
  - `--color-border`: Border color
  - `--color-primary`: Primary accent color

### System Theme Detection

- Uses `window.matchMedia('(prefers-color-scheme: dark)')`
- Listens for system theme changes when "System" is selected
- Automatically updates theme when system preference changes

## Properties

| Property | Type | Description |
|----------|------|-------------|
| currentTheme | `'light' \| 'dark' \| 'system'` | User's selected theme preference |
| activeSection | SettingsSection | Currently viewed settings section |

## Behavior

1. **Initial Load**: Read theme from localStorage, apply to document, update UI
2. **Theme Change**: Update localStorage, apply CSS classes, update UI
3. **Page Navigation**: Theme persists across all pages
4. **Browser Refresh**: Theme is restored from localStorage
5. **System Theme (when selected)**: Follows OS dark/light mode preference

## Files Modified

- `apps/web/src/router.tsx` - Import and use SettingsPage instead of placeholder
- `apps/web/src/index.css` - Add CSS variables for theming and dark mode overrides

## Files Created

- `apps/web/src/routes/settings.tsx` - Settings page component
- `apps/web/tests/settings.spec.ts` - Playwright tests (17 tests)

## Implementation Checklist

- [x] Create SettingsPage component with sidebar navigation
- [x] Add Theme section with Light/Dark/System options
- [x] Create ThemeOption button component with active state
- [x] Add theme preview section
- [x] Persist theme to localStorage
- [x] Apply theme via CSS classes on document root
- [x] Add CSS variables for theme colors
- [x] Listen for system theme changes
- [x] Update router to use SettingsPage
- [x] Write Playwright tests (17 tests passing)

## Test Coverage

17 Playwright tests covering:
- Settings page navigation
- Sidebar navigation with sections
- Theme section display
- Light theme selection
- Dark theme selection
- System theme selection
- Theme persistence after refresh
- localStorage storage
- Theme preview
- Coming soon sections
- Navigation between sections
- Theme nav active state
- Theme switching between options
- Dark theme CSS application
- Light theme CSS application
- Theme persistence across pages
- System theme description

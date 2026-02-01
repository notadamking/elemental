# @elemental/ui

Shared UI components, design tokens, and hooks for the Elemental platform.

## Installation

The package is part of the Elemental monorepo and is linked automatically.

```bash
pnpm add @elemental/ui
```

## Usage

### Components

```tsx
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
  Input,
  Textarea,
  Label,
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  Badge,
  Tooltip,
  TagInput,
  ThemeToggle,
  Skeleton
} from '@elemental/ui';

// Button with variants
<Button variant="primary">Primary</Button>
<Button variant="secondary">Secondary</Button>
<Button variant="ghost">Ghost</Button>
<Button variant="danger">Danger</Button>
<Button variant="outline">Outline</Button>

// Card
<Card>
  <CardHeader>
    <CardTitle>Card Title</CardTitle>
  </CardHeader>
  <CardContent>
    Card content here
  </CardContent>
</Card>

// Dialog
<Dialog open={isOpen} onOpenChange={setIsOpen}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Dialog Title</DialogTitle>
    </DialogHeader>
    <DialogBody>
      Dialog content
    </DialogBody>
    <DialogFooter>
      <Button variant="secondary" onClick={() => setIsOpen(false)}>Cancel</Button>
      <Button onClick={handleSubmit}>Submit</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

### Hooks

```tsx
import { useTheme } from '@elemental/ui';

function MyComponent() {
  const { theme, resolvedTheme, setTheme, toggleDarkMode, isDark } = useTheme();

  return (
    <button onClick={toggleDarkMode}>
      {isDark ? 'Light Mode' : 'Dark Mode'}
    </button>
  );
}
```

### Design Tokens

Import the design tokens CSS file in your app's entry point:

```css
@import '@elemental/ui/styles/tokens.css';
```

Or in JavaScript:

```tsx
import '@elemental/ui/styles/tokens.css';
```

## Available Components

### Core UI
- `Button` - Primary action button with variants (primary, secondary, ghost, danger, outline)
- `Badge` - Status/category labels with color variants
- `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter` - Container components
- `Dialog`, `DialogContent`, `DialogHeader`, `DialogBody`, `DialogFooter`, `DialogTitle`, `DialogDescription` - Modal dialogs
- `Input`, `Textarea`, `Label` - Form inputs
- `Select`, `SelectTrigger`, `SelectContent`, `SelectItem`, etc. - Dropdown select
- `Tooltip`, `TooltipProvider` - Hover tooltips with keyboard shortcut support
- `TagInput` - Multi-tag input field
- `ThemeToggle` - Light/dark mode toggle button

### Skeleton Loading
- `Skeleton` - Base skeleton with shimmer animation
- `SkeletonText` - Text line skeleton
- `SkeletonAvatar` - Circular avatar skeleton
- `SkeletonCard` - Card content skeleton
- `SkeletonTaskCard` - Task card skeleton (mobile/desktop variants)
- `SkeletonList` - List skeleton
- `SkeletonStatCard` - Dashboard stat card skeleton
- `SkeletonPage` - Full page skeleton
- `SkeletonMessageBubble` - Chat message skeleton
- `SkeletonDocumentCard` - Document card skeleton
- `SkeletonEntityCard` - Entity/team card skeleton

## Design Tokens

The tokens.css file provides CSS custom properties for:
- **Colors**: Primary, secondary, accent, neutral, success, warning, error palettes with light/dark/high-contrast modes
- **Typography**: Font families, sizes, weights, line heights
- **Spacing**: 4px grid system (0-96 scale)
- **Border radius**: none to full
- **Shadows**: xs to 2xl with dark mode variants
- **Transitions**: Durations and timing functions
- **Z-index**: Layering scale for dropdowns, modals, tooltips, toasts
- **Responsive breakpoints**: xs (0), sm (480px), md (640px), lg (768px), xl (1024px), 2xl (1280px)

## Development

```bash
# Build the package
pnpm build

# Run tests
pnpm test

# Type check
pnpm typecheck
```

## License

MIT

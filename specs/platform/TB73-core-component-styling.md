# TB73: Core Component Styling

**Status:** Implemented
**Version:** 1.0.0

## Purpose

Create a polished, consistent set of core UI components using the design token system established in TB71. These components form the foundation for all interactive elements across the Elemental platform.

## Components Created

### 1. Button Component (`src/components/ui/Button.tsx`)

A versatile button component with multiple variants and states.

**Variants:**
- `primary` - Blue background, white text (default)
- `secondary` - Gray background, dark text
- `ghost` - Transparent, hover reveals background
- `danger` - Red colors for destructive actions
- `outline` - Border only, no background

**Sizes:**
- `xs` - 24px height
- `sm` - 28px height
- `md` - 36px height (default)
- `lg` - 44px height

**Features:**
- Subtle hover states with background color shift
- Active states with slight scale (0.98)
- Focus rings for accessibility (ring-2 with offset)
- Loading state with spinner
- Left/right icon support
- Full-width option
- Disabled state with opacity

### 2. Input & Textarea Components (`src/components/ui/Input.tsx`)

Clean, accessible form inputs with consistent styling.

**Features:**
- Clean borders with design token colors
- Focus states with primary color ring
- Error states with red border and error message
- Size variants (sm, md, lg)
- Left/right addon support (icons, text)
- Label component with required indicator
- Full-width option
- Disabled state

### 3. Dialog/Modal Component (`src/components/ui/Dialog.tsx`)

Accessible modal dialogs built on Radix UI Dialog primitive.

**Sub-components:**
- `Dialog` - Root wrapper
- `DialogTrigger` - Trigger element
- `DialogContent` - Main dialog container
- `DialogHeader` - Header section
- `DialogBody` - Content area
- `DialogFooter` - Action buttons area
- `DialogTitle` - Title text
- `DialogDescription` - Description text
- `DialogClose` - Close button

**Features:**
- Backdrop blur effect (bg-black/50 with backdrop-blur-sm)
- Centered content with smooth animation
- Size variants (sm, md, lg, xl, full)
- Close button with X icon
- Escape key to close
- Consistent sections (header, body, footer)
- Animations: fade-in, zoom-in, slide-in

### 4. Select/Dropdown Component (`src/components/ui/Select.tsx`)

Accessible select dropdown built on Radix UI Select primitive.

**Sub-components:**
- `Select` - Root wrapper
- `SelectTrigger` - Trigger button
- `SelectValue` - Placeholder/selected value
- `SelectContent` - Dropdown content
- `SelectItem` - Individual option
- `SelectLabel` - Group label
- `SelectSeparator` - Divider
- `SelectScrollUpButton` / `SelectScrollDownButton` - Scroll indicators

**Features:**
- Consistent with Input styling
- Smooth open/close animation
- Check indicator for selected item
- Keyboard navigation
- Size variants (sm, md, lg)
- Error state support
- Full-width option

### 5. Badge Component (`src/components/ui/Badge.tsx`)

Small label component for displaying status or categories.

**Variants:**
- `default` - Gray background
- `primary` - Blue colors
- `success` - Green colors
- `warning` - Amber colors
- `error` - Red colors
- `outline` - Border only

**Sizes:**
- `sm` - 10px font, minimal padding
- `md` - 12px font, standard padding

### 6. Card Component (`src/components/ui/Card.tsx`)

Container component for grouping related content.

**Variants:**
- `default` - Subtle border, flat background
- `elevated` - Shadow for elevated appearance
- `outlined` - Border only, no background

**Sub-components:**
- `Card` - Main container
- `CardHeader` - Header section
- `CardTitle` - Title text
- `CardDescription` - Description text
- `CardContent` - Main content
- `CardFooter` - Footer section

**Features:**
- Optional hover effect
- Clickable support with focus states
- No-padding option
- Consistent rounded corners

## Dependencies Added

- `@radix-ui/react-dialog@1.1.15` - For accessible Dialog component
- `@radix-ui/react-select@2.2.6` - For accessible Select component

## Files Created

- `apps/web/src/components/ui/Button.tsx`
- `apps/web/src/components/ui/Input.tsx`
- `apps/web/src/components/ui/Dialog.tsx`
- `apps/web/src/components/ui/Select.tsx`
- `apps/web/src/components/ui/Badge.tsx`
- `apps/web/src/components/ui/Card.tsx`
- `apps/web/src/components/ui/index.ts`
- `apps/web/tests/core-components.spec.ts`

## Design Token Integration

All components use CSS custom properties from `src/styles/tokens.css`:

- Colors: `--color-primary`, `--color-text`, `--color-border`, etc.
- Spacing: Uses Tailwind utilities which map to token-based values
- Border radius: `--radius-md`, `--radius-lg`, etc.
- Shadows: `--shadow-sm`, `--shadow-lg`, etc.
- Transitions: `--duration-fast`, `--duration-normal`, etc.

## Theme Support

All components support light and dark mode via:
- CSS custom properties that switch based on `.dark` class
- Tailwind dark mode variants (`dark:`)
- Semantic color tokens (`--color-text`, `--color-bg`, etc.)

## Testing

14 Playwright tests verify:
- Button styling in modals
- Ghost button hover states
- Input focus ring styling
- Input border colors
- Modal backdrop effects
- Modal close button functionality
- Modal escape key handling
- Select field styling
- Dropdown menu functionality
- Light mode compatibility
- Dark mode compatibility
- Badge visibility
- Card borders
- Card hover effects

## Usage Example

```tsx
import {
  Button,
  Input,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  Badge,
  Card,
} from '../components/ui';

function Example() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)}>Open Dialog</Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Example Form</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <Input placeholder="Enter text..." />
            <Select>
              <SelectTrigger>
                <SelectValue placeholder="Select..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Option 1</SelectItem>
                <SelectItem value="2">Option 2</SelectItem>
              </SelectContent>
            </Select>
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button>Submit</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <Badge variant="success">Active</Badge>
        <p>Card content</p>
      </Card>
    </>
  );
}
```

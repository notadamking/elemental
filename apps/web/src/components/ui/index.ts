/**
 * UI Component Library
 *
 * This module exports all core UI components for the Elemental platform.
 * Components are styled using the design token system from src/styles/tokens.css.
 */

// Button
export { Button } from './Button';
export type { ButtonProps } from './Button';

// Input & Form
export { Input, Textarea, Label } from './Input';
export type { InputProps, TextareaProps, LabelProps } from './Input';

// Dialog/Modal
export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from './Dialog';
export type { DialogContentProps } from './Dialog';

// Select/Dropdown
export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
  SelectScrollUpButton,
  SelectScrollDownButton,
} from './Select';
export type { SelectTriggerProps } from './Select';

// Badge
export { Badge } from './Badge';
export type { BadgeProps } from './Badge';

// Card
export {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from './Card';
export type { CardProps } from './Card';

// Tooltip (existing)
export { Tooltip } from './Tooltip';

// TagInput (existing)
export { TagInput } from './TagInput';

// ThemeToggle (existing)
export { ThemeToggle } from './ThemeToggle';

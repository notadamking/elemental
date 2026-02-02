export { useDebounce } from './useDebounce';

// Keyboard shortcuts hooks
export {
  useGlobalKeyboardShortcuts,
  useKeyboardShortcut,
  useDisableKeyboardShortcuts,
  useShortcutVersion,
  getKeyboardManager,
  getCustomShortcuts,
  setCustomShortcuts,
  setCustomShortcut,
  removeCustomShortcut,
  resetAllShortcuts,
  checkShortcutConflict,
  getCurrentBinding,
  SHORTCUTS_CHANGED_EVENT,
} from './useKeyboardShortcuts';
export type { GlobalKeyboardShortcutsOptions } from './useKeyboardShortcuts';

// Responsive breakpoint hooks
export {
  useBreakpoint,
  useWindowSize,
  useIsMobile,
  useIsTablet,
  useIsDesktop,
  useDeviceType,
  useMediaQuery,
  useBreakpointAtLeast,
  useBreakpointAtMost,
  useBreakpointBetween,
  useTouchDevice,
  usePrefersReducedMotion,
  useResponsive,
  BREAKPOINTS,
  BREAKPOINT_ORDER,
} from './useBreakpoint';

export type { Breakpoint, DeviceType } from './useBreakpoint';

// Paginated data hook
export { usePaginatedData } from './usePaginatedData';

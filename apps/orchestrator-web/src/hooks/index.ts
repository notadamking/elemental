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

// Deep-link navigation hook
export { useDeepLink } from './useDeepLink';
export type { UseDeepLinkOptions, UseDeepLinkResult } from './useDeepLink';

// Paginated data hook
export { usePaginatedData } from './usePaginatedData';

// File System Access hook
export {
  useFileSystemAccess,
  isFileSystemAccessSupported,
} from './useFileSystemAccess';
export type {
  FileSystemEntry,
  FileReadResult,
  FileSystemAccessState,
  UseFileSystemAccessReturn,
} from './useFileSystemAccess';

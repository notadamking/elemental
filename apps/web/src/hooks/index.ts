export {
  useKeyboardShortcut,
  useDisableKeyboardShortcuts,
  useGlobalKeyboardShortcuts,
  getKeyboardManager,
} from './useKeyboardShortcuts';

export { useTheme } from './useTheme';
export type { Theme } from './useTheme';

export { useDebounce } from './useDebounce';

export {
  useRelativeTime,
  useRelativeTimeUpdater,
  useRelativeTimeFormatter,
} from './useRelativeTime';

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

/**
 * Layout Components
 *
 * Configurable layout components for Elemental applications.
 * These components provide the structural foundation while allowing
 * each app to customize navigation, branding, and behavior.
 */

// AppShell - Main layout wrapper
export { AppShell, useSidebarState } from './AppShell';
export type { AppShellProps } from './AppShell';

// Sidebar - Configurable navigation sidebar
export { Sidebar } from './Sidebar';
export type {
  SidebarProps,
  NavItem,
  NavSection,
  SidebarBranding,
} from './Sidebar';

// MobileDrawer - Slide-out mobile navigation drawer
export { MobileDrawer } from './MobileDrawer';
export type { MobileDrawerProps } from './MobileDrawer';

// Header - Application header with breadcrumbs
export {
  Header,
  Breadcrumbs,
  BreadcrumbsMobile,
  ConnectionStatus,
  HeaderDivider,
} from './Header';
export type {
  HeaderProps,
  BreadcrumbsProps,
  BreadcrumbItem,
  ConnectionStatusProps,
} from './Header';

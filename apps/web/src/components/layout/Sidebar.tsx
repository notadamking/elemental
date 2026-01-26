import { useState, useCallback } from 'react';
import { Link, useRouterState } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import {
  LayoutDashboard,
  CheckSquare,
  Folder,
  Workflow,
  MessageSquare,
  FileText,
  Users,
  UsersRound,
  Settings,
  ChevronLeft,
  ChevronDown,
  GitBranch,
  Network,
  History,
  PanelLeftOpen,
  Inbox,
  type LucideIcon,
} from 'lucide-react';
import { Tooltip } from '../ui/Tooltip';

// Hook to fetch global inbox unread count
function useGlobalInboxCount() {
  return useQuery<{ count: number }>({
    queryKey: ['inbox', 'global', 'count'],
    queryFn: async () => {
      const response = await fetch('/api/inbox/count');
      if (!response.ok) return { count: 0 };
      return response.json();
    },
    refetchInterval: 30000, // Refetch every 30 seconds
    staleTime: 10000,
  });
}

interface NavItem {
  to: string;
  icon: LucideIcon;
  label: string;
  shortcut?: string;
  testId?: string;
  search?: Record<string, unknown>;
  badgeKey?: 'inbox'; // Badge to show for this item
}

interface NavSection {
  id: string;
  label: string;
  icon?: LucideIcon;
  defaultExpanded?: boolean;
  items: NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
    defaultExpanded: true,
    items: [
      { to: '/dashboard/overview', icon: LayoutDashboard, label: 'Overview', shortcut: 'G H', testId: 'nav-dashboard' },
      { to: '/dashboard/task-flow', icon: GitBranch, label: 'Task Flow', shortcut: 'G F', testId: 'nav-task-flow' },
      { to: '/dashboard/timeline', icon: History, label: 'Timeline', shortcut: 'G L', testId: 'nav-timeline', search: { page: 1, limit: 100, actor: undefined } },
    ],
  },
  {
    id: 'work',
    label: 'Work',
    defaultExpanded: true,
    items: [
      { to: '/tasks', icon: CheckSquare, label: 'Tasks', shortcut: 'G T', testId: 'nav-tasks', search: { page: 1, limit: 25 } },
      { to: '/plans', icon: Folder, label: 'Plans', shortcut: 'G P', testId: 'nav-plans' },
      { to: '/workflows', icon: Workflow, label: 'Workflows', shortcut: 'G W', testId: 'nav-workflows' },
      { to: '/dependencies', icon: Network, label: 'Dependencies', shortcut: 'G G', testId: 'nav-dependencies' },
    ],
  },
  {
    id: 'collaborate',
    label: 'Collaborate',
    defaultExpanded: true,
    items: [
      { to: '/inbox', icon: Inbox, label: 'Inbox', shortcut: 'G I', testId: 'nav-inbox', search: { message: undefined }, badgeKey: 'inbox' },
      { to: '/messages', icon: MessageSquare, label: 'Messages', shortcut: 'G M', testId: 'nav-messages', search: { channel: undefined, message: undefined, page: 1, limit: 50 } },
      { to: '/documents', icon: FileText, label: 'Documents', shortcut: 'G D', testId: 'nav-documents', search: { selected: undefined, library: undefined, page: 1, limit: 25 } },
    ],
  },
  {
    id: 'organize',
    label: 'Organize',
    defaultExpanded: true,
    items: [
      { to: '/entities', icon: Users, label: 'Entities', shortcut: 'G E', testId: 'nav-entities', search: { selected: undefined, name: undefined, page: 1, limit: 25 } },
      { to: '/teams', icon: UsersRound, label: 'Teams', shortcut: 'G R', testId: 'nav-teams', search: { selected: undefined, page: 1, limit: 25 } },
    ],
  },
];

const BOTTOM_NAV_ITEMS: NavItem[] = [
  { to: '/settings', icon: Settings, label: 'Settings', testId: 'nav-settings' },
];

interface SidebarProps {
  collapsed?: boolean;
  onToggle?: () => void;
  /** When true, sidebar is displayed inside a mobile drawer */
  isMobileDrawer?: boolean;
}

export function Sidebar({ collapsed = false, onToggle, isMobileDrawer = false }: SidebarProps) {
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;

  // Fetch inbox unread count for badge (TB137)
  const { data: inboxCount } = useGlobalInboxCount();

  // Track expanded sections - default to section's defaultExpanded
  const [expandedSections, setExpandedSections] = useState<Set<string>>(() =>
    new Set(NAV_SECTIONS.filter(s => s.defaultExpanded).map(s => s.id))
  );

  const toggleSection = useCallback((sectionId: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  }, []);

  const isPathActive = (path: string) => {
    // Exact match for overview and all other paths
    return currentPath === path;
  };

  const renderNavItem = (item: NavItem, inSection: boolean = false) => {
    const isActive = isPathActive(item.to);
    const Icon = item.icon;

    // Get badge count for items that have badges (TB137)
    let badgeCount: number | undefined;
    if (item.badgeKey === 'inbox' && inboxCount?.count && inboxCount.count > 0) {
      badgeCount = inboxCount.count;
    }

    return (
      <Link
        key={item.to}
        to={item.to}
        search={item.search}
        data-testid={item.testId}
        className={`
          group relative flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md
          transition-all duration-150 ease-out
          ${inSection && !collapsed ? 'ml-3' : ''}
          ${isActive
            ? 'bg-[var(--color-sidebar-item-active)] text-[var(--color-sidebar-item-text-active)]'
            : 'text-[var(--color-sidebar-item-text)] hover:bg-[var(--color-sidebar-item-hover)] hover:text-[var(--color-text)]'
          }
          ${collapsed ? 'justify-center px-2' : ''}
        `}
        title={collapsed ? item.label : undefined}
      >
        {/* Active indicator bar */}
        {isActive && !collapsed && (
          <div
            className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-[var(--color-primary)] rounded-r-full"
            data-testid="active-indicator"
          />
        )}
        {/* Icon with optional badge dot when collapsed */}
        <div className="relative flex-shrink-0">
          <Icon className={`w-4 h-4 ${isActive ? 'text-[var(--color-sidebar-item-text-active)]' : 'text-[var(--color-text-tertiary)] group-hover:text-[var(--color-text-secondary)]'}`} />
          {/* Badge dot when collapsed (TB137) */}
          {collapsed && badgeCount !== undefined && (
            <span
              className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-blue-500"
              data-testid={`${item.testId}-badge-dot`}
            />
          )}
        </div>
        {!collapsed && (
          <>
            <span className="flex-1 truncate">{item.label}</span>
            {/* Badge count when expanded (TB137) */}
            {badgeCount !== undefined && (
              <span
                className="px-1.5 py-0.5 text-[10px] font-medium bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-full"
                data-testid={`${item.testId}-badge`}
              >
                {badgeCount > 99 ? '99+' : badgeCount}
              </span>
            )}
            {!badgeCount && item.shortcut && (
              <span className="text-[10px] text-[var(--color-text-muted)] font-mono tracking-wide opacity-0 group-hover:opacity-100 transition-opacity">
                {item.shortcut}
              </span>
            )}
          </>
        )}
      </Link>
    );
  };

  const renderSection = (section: NavSection) => {
    const isExpanded = expandedSections.has(section.id);
    const hasActiveItem = section.items.some(item => isPathActive(item.to));
    const SectionIcon = section.icon;

    if (collapsed) {
      // In collapsed mode, show items directly without sections
      return (
        <div key={section.id} className="space-y-0.5">
          {section.items.map((item) => renderNavItem(item, false))}
        </div>
      );
    }

    return (
      <div key={section.id} className="mb-2" data-testid={`nav-section-${section.id}`}>
        {/* Section header */}
        <button
          onClick={() => toggleSection(section.id)}
          className={`
            w-full flex items-center gap-2 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider
            text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]
            transition-colors duration-150 rounded-md hover:bg-[var(--color-sidebar-item-hover)]
            ${hasActiveItem ? 'text-[var(--color-text-secondary)]' : ''}
          `}
          data-testid={`section-toggle-${section.id}`}
        >
          {SectionIcon && <SectionIcon className="w-3.5 h-3.5" />}
          <span className="flex-1 text-left">{section.label}</span>
          <ChevronDown
            className={`w-3.5 h-3.5 transition-transform duration-200 ${isExpanded ? '' : '-rotate-90'}`}
          />
        </button>

        {/* Section items with animation */}
        <div
          className={`
            mt-1 space-y-0.5 overflow-hidden transition-all duration-200 ease-out
            ${isExpanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}
          `}
        >
          {section.items.map((item) => renderNavItem(item, true))}
        </div>
      </div>
    );
  };

  // When in mobile drawer, always show expanded and hide collapse controls
  const showCollapsedState = collapsed && !isMobileDrawer;
  const showExpandedState = !collapsed || isMobileDrawer;

  return (
    <aside
      className={`
        flex flex-col bg-[var(--color-sidebar-bg)]
        transition-all duration-200 ease-out
        ${isMobileDrawer ? 'w-full h-full border-none' : 'border-r border-[var(--color-sidebar-border)]'}
        ${!isMobileDrawer && collapsed ? 'w-16' : !isMobileDrawer ? 'w-60' : ''}
      `}
      data-testid="sidebar"
    >
      {/* Logo / Header */}
      <div className={`flex items-center justify-between h-14 px-4 border-b border-[var(--color-sidebar-border)] ${isMobileDrawer ? 'pr-12' : ''}`}>
        {showExpandedState && (
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-accent-500)] flex items-center justify-center shadow-sm">
              <span className="text-white text-sm font-bold">E</span>
            </div>
            <span className="text-base font-semibold text-[var(--color-text)]">Elemental</span>
          </div>
        )}
        {showCollapsedState && (
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-accent-500)] flex items-center justify-center mx-auto shadow-sm">
            <span className="text-white text-sm font-bold">E</span>
          </div>
        )}
        {/* Collapse button in header - visible when expanded on desktop/tablet, hidden on mobile drawer */}
        {showExpandedState && !isMobileDrawer && (
          <button
            onClick={onToggle}
            className="p-1.5 rounded-md text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-sidebar-item-hover)] transition-colors duration-150"
            aria-label="Collapse sidebar"
            aria-expanded="true"
            data-testid="sidebar-toggle"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 px-2 py-3 overflow-y-auto scrollbar-thin scrollbar-thumb-[var(--color-border)] scrollbar-track-transparent">
        {NAV_SECTIONS.map(renderSection)}
      </nav>

      {/* Bottom Navigation */}
      <div className="px-2 py-3 border-t border-[var(--color-sidebar-border)] space-y-0.5">
        {BOTTOM_NAV_ITEMS.map((item) => renderNavItem(item, false))}
      </div>

      {/* Expand button - visible when collapsed on desktop/tablet, hidden on mobile */}
      {showCollapsedState && !isMobileDrawer && (
        <div className="px-2 py-3 border-t border-[var(--color-sidebar-border)]">
          <Tooltip content="Expand sidebar" shortcut="⌘B" side="right">
            <button
              onClick={onToggle}
              className="w-full flex items-center justify-center p-2 rounded-md text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-sidebar-item-hover)] transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:ring-offset-1 focus:ring-offset-[var(--color-sidebar-bg)]"
              aria-label="Expand sidebar"
              aria-expanded="false"
              data-testid="sidebar-expand-button"
            >
              <PanelLeftOpen className="w-5 h-5" />
            </button>
          </Tooltip>
        </div>
      )}

      {/* Keyboard hint - hide on mobile drawer (no keyboard shortcuts on mobile) */}
      {showExpandedState && !isMobileDrawer && (
        <div className="px-4 py-2 text-[10px] text-[var(--color-text-muted)] border-t border-[var(--color-sidebar-border)]">
          <kbd className="px-1.5 py-0.5 rounded bg-[var(--color-surface-hover)] text-[var(--color-text-tertiary)] font-mono">⌘K</kbd>
          {' '}for commands
        </div>
      )}
    </aside>
  );
}

import { useState, useCallback } from 'react';
import { Link, useRouterState } from '@tanstack/react-router';
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
  ChevronRight,
  ChevronDown,
  GitBranch,
  Bot,
  Network,
  History,
  type LucideIcon,
} from 'lucide-react';

interface NavItem {
  to: string;
  icon: LucideIcon;
  label: string;
  shortcut?: string;
  testId?: string;
  search?: Record<string, unknown>;
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
      { to: '/dashboard/agents', icon: Bot, label: 'Agents', shortcut: 'G A', testId: 'nav-agents' },
      { to: '/dashboard/dependencies', icon: Network, label: 'Dependencies', shortcut: 'G G', testId: 'nav-dependencies' },
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
    ],
  },
  {
    id: 'collaborate',
    label: 'Collaborate',
    defaultExpanded: true,
    items: [
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
}

export function Sidebar({ collapsed = false, onToggle }: SidebarProps) {
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;

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
        <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-[var(--color-sidebar-item-text-active)]' : 'text-[var(--color-text-tertiary)] group-hover:text-[var(--color-text-secondary)]'}`} />
        {!collapsed && (
          <>
            <span className="flex-1 truncate">{item.label}</span>
            {item.shortcut && (
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

  return (
    <aside
      className={`
        flex flex-col bg-[var(--color-sidebar-bg)] border-r border-[var(--color-sidebar-border)]
        transition-all duration-200 ease-out
        ${collapsed ? 'w-16' : 'w-60'}
      `}
      data-testid="sidebar"
    >
      {/* Logo / Header */}
      <div className="flex items-center justify-between h-14 px-4 border-b border-[var(--color-sidebar-border)]">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-accent-500)] flex items-center justify-center shadow-sm">
              <span className="text-white text-sm font-bold">E</span>
            </div>
            <span className="text-base font-semibold text-[var(--color-text)]">Elemental</span>
          </div>
        )}
        {collapsed && (
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-accent-500)] flex items-center justify-center mx-auto shadow-sm">
            <span className="text-white text-sm font-bold">E</span>
          </div>
        )}
        <button
          onClick={onToggle}
          className={`
            p-1.5 rounded-md text-[var(--color-text-tertiary)]
            hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-sidebar-item-hover)]
            transition-colors duration-150
            ${collapsed ? 'absolute left-1/2 -translate-x-1/2 bottom-20' : ''}
          `}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          data-testid="sidebar-toggle"
        >
          {collapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <ChevronLeft className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 px-2 py-3 overflow-y-auto scrollbar-thin scrollbar-thumb-[var(--color-border)] scrollbar-track-transparent">
        {NAV_SECTIONS.map(renderSection)}
      </nav>

      {/* Bottom Navigation */}
      <div className="px-2 py-3 border-t border-[var(--color-sidebar-border)] space-y-0.5">
        {BOTTOM_NAV_ITEMS.map((item) => renderNavItem(item, false))}
      </div>

      {/* Keyboard hint */}
      {!collapsed && (
        <div className="px-4 py-2 text-[10px] text-[var(--color-text-muted)] border-t border-[var(--color-sidebar-border)]">
          <kbd className="px-1.5 py-0.5 rounded bg-[var(--color-surface-hover)] text-[var(--color-text-tertiary)] font-mono">⌘K</kbd>
          {' '}for commands
        </div>
      )}
    </aside>
  );
}

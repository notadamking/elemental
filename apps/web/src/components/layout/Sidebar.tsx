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
  GitBranch,
  Bot,
  Network,
  History,
} from 'lucide-react';

interface NavItem {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  shortcut?: string;
  testId?: string;
  search?: Record<string, unknown>;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', shortcut: 'G H', testId: 'nav-dashboard' },
  { to: '/dashboard/task-flow', icon: GitBranch, label: 'Task Flow', shortcut: 'G F', testId: 'nav-task-flow' },
  { to: '/dashboard/agents', icon: Bot, label: 'Agents', shortcut: 'G A', testId: 'nav-agents' },
  { to: '/dashboard/dependencies', icon: Network, label: 'Dependencies', shortcut: 'G G', testId: 'nav-dependencies' },
  { to: '/dashboard/timeline', icon: History, label: 'Timeline', shortcut: 'G L', testId: 'nav-timeline', search: { page: 1, limit: 100 } },
  { to: '/tasks', icon: CheckSquare, label: 'Tasks', shortcut: 'G T', testId: 'nav-tasks', search: { page: 1, limit: 25 } },
  { to: '/plans', icon: Folder, label: 'Plans', shortcut: 'G P', testId: 'nav-plans' },
  { to: '/workflows', icon: Workflow, label: 'Workflows', shortcut: 'G W', testId: 'nav-workflows' },
  { to: '/messages', icon: MessageSquare, label: 'Messages', shortcut: 'G M', testId: 'nav-messages', search: { channel: undefined, message: undefined, page: 1, limit: 50 } },
  { to: '/documents', icon: FileText, label: 'Documents', shortcut: 'G D', testId: 'nav-documents', search: { selected: undefined, library: undefined, page: 1, limit: 25 } },
  { to: '/entities', icon: Users, label: 'Entities', shortcut: 'G E', testId: 'nav-entities', search: { selected: undefined, name: undefined, page: 1, limit: 25 } },
  { to: '/teams', icon: UsersRound, label: 'Teams', shortcut: 'G R', testId: 'nav-teams', search: { selected: undefined, page: 1, limit: 25 } },
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

  const renderNavItem = (item: NavItem) => {
    const isActive = currentPath === item.to || currentPath.startsWith(item.to + '/');
    const Icon = item.icon;

    return (
      <Link
        key={item.to}
        to={item.to}
        search={item.search}
        data-testid={item.testId}
        className={`
          flex items-center gap-3 px-3 py-2 rounded-lg transition-colors
          ${isActive
            ? 'bg-blue-50 dark:bg-[var(--color-sidebar-item-active)] text-blue-600 dark:text-[var(--color-sidebar-item-text-active)]'
            : 'text-gray-600 dark:text-[var(--color-sidebar-item-text)] hover:bg-gray-100 dark:hover:bg-[var(--color-sidebar-item-hover)] hover:text-gray-900 dark:hover:text-gray-200'
          }
          ${collapsed ? 'justify-center' : ''}
        `}
        title={collapsed ? item.label : undefined}
      >
        <Icon className="w-5 h-5 flex-shrink-0" />
        {!collapsed && (
          <>
            <span className="flex-1 font-medium">{item.label}</span>
            {item.shortcut && (
              <span className="text-xs text-gray-400 font-mono">{item.shortcut}</span>
            )}
          </>
        )}
      </Link>
    );
  };

  return (
    <aside
      className={`
        flex flex-col bg-white dark:bg-[var(--color-sidebar-bg)] border-r border-gray-200 dark:border-[var(--color-sidebar-border)] transition-all duration-200
        ${collapsed ? 'w-16' : 'w-60'}
      `}
      data-testid="sidebar"
    >
      {/* Logo / Header */}
      <div className="flex items-center justify-between h-14 px-4 border-b border-gray-200 dark:border-[var(--color-sidebar-border)]">
        {!collapsed && (
          <span className="text-lg font-semibold text-gray-900 dark:text-gray-100">Elemental</span>
        )}
        {collapsed && (
          <span className="text-lg font-semibold text-gray-900 dark:text-gray-100 mx-auto">E</span>
        )}
        <button
          onClick={onToggle}
          className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-[var(--color-sidebar-item-hover)] transition-colors"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <ChevronLeft className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map(renderNavItem)}
      </nav>

      {/* Bottom Navigation */}
      <div className="px-2 py-4 border-t border-gray-200 dark:border-[var(--color-sidebar-border)] space-y-1">
        {BOTTOM_NAV_ITEMS.map(renderNavItem)}
      </div>
    </aside>
  );
}

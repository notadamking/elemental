import { useState, useCallback, useMemo } from 'react';
import { Outlet, useRouterState, Link } from '@tanstack/react-router';
import { Sidebar } from './Sidebar';
import { CommandPalette } from '../navigation';
import { ThemeToggle } from '../ui/ThemeToggle';
import { useRealtimeEvents } from '../../api/hooks/useRealtimeEvents';
import { useQuery } from '@tanstack/react-query';
import { useGlobalKeyboardShortcuts, useKeyboardShortcut } from '../../hooks';
import type { ConnectionState } from '../../api/websocket';
import {
  ChevronRight,
  LayoutDashboard,
  CheckSquare,
  Folder,
  Workflow,
  MessageSquare,
  FileText,
  Users,
  UsersRound,
  Settings,
  GitBranch,
  Bot,
  Network,
  History,
} from 'lucide-react';

interface HealthResponse {
  status: string;
  timestamp: string;
  database: string;
  websocket?: {
    clients: number;
    broadcasting: boolean;
  };
}

function useHealth() {
  return useQuery<HealthResponse>({
    queryKey: ['health'],
    queryFn: async () => {
      const response = await fetch('/api/health');
      if (!response.ok) throw new Error('Failed to fetch health');
      return response.json();
    },
    refetchInterval: 30000,
  });
}

function ConnectionStatus({ wsState, health }: { wsState: ConnectionState; health: ReturnType<typeof useHealth> }) {
  if (wsState === 'connecting' || wsState === 'reconnecting') {
    return (
      <div className="flex items-center gap-2 text-[var(--color-warning)]">
        <div className="w-2 h-2 rounded-full bg-[var(--color-warning)] animate-pulse" />
        <span className="text-sm font-medium">{wsState === 'connecting' ? 'Connecting...' : 'Reconnecting...'}</span>
      </div>
    );
  }

  if (wsState === 'connected') {
    return (
      <div className="flex items-center gap-2 text-[var(--color-success)]">
        <div className="w-2 h-2 rounded-full bg-[var(--color-success)]" />
        <span className="text-sm font-medium">Live</span>
      </div>
    );
  }

  if (health.isLoading) {
    return (
      <div className="flex items-center gap-2 text-[var(--color-text-tertiary)]">
        <div className="w-2 h-2 rounded-full bg-[var(--color-text-tertiary)] animate-pulse" />
        <span className="text-sm">Connecting...</span>
      </div>
    );
  }

  if (health.isError) {
    return (
      <div className="flex items-center gap-2 text-[var(--color-danger)]">
        <div className="w-2 h-2 rounded-full bg-[var(--color-danger)]" />
        <span className="text-sm font-medium">Disconnected</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 text-[var(--color-warning)]">
      <div className="w-2 h-2 rounded-full bg-[var(--color-warning)]" />
      <span className="text-sm font-medium">Polling</span>
    </div>
  );
}

// Route metadata for breadcrumbs
interface RouteConfig {
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  parent?: string;
}

const ROUTE_CONFIG: Record<string, RouteConfig> = {
  '/dashboard': { label: 'Dashboard', icon: LayoutDashboard },
  '/dashboard/task-flow': { label: 'Task Flow', icon: GitBranch, parent: '/dashboard' },
  '/dashboard/agents': { label: 'Agents', icon: Bot, parent: '/dashboard' },
  '/dashboard/dependencies': { label: 'Dependencies', icon: Network, parent: '/dashboard' },
  '/dashboard/timeline': { label: 'Timeline', icon: History, parent: '/dashboard' },
  '/tasks': { label: 'Tasks', icon: CheckSquare },
  '/plans': { label: 'Plans', icon: Folder },
  '/workflows': { label: 'Workflows', icon: Workflow },
  '/messages': { label: 'Messages', icon: MessageSquare },
  '/documents': { label: 'Documents', icon: FileText },
  '/entities': { label: 'Entities', icon: Users },
  '/teams': { label: 'Teams', icon: UsersRound },
  '/settings': { label: 'Settings', icon: Settings },
};

interface BreadcrumbItem {
  label: string;
  path: string;
  icon?: React.ComponentType<{ className?: string }>;
  isLast: boolean;
}

function useBreadcrumbs(): BreadcrumbItem[] {
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;

  return useMemo(() => {
    const breadcrumbs: BreadcrumbItem[] = [];
    let path = currentPath;

    // Build breadcrumb chain from current path going up
    const pathsToResolve: string[] = [];
    while (path) {
      const config = ROUTE_CONFIG[path];
      if (config) {
        pathsToResolve.unshift(path);
        path = config.parent || '';
      } else {
        // Try to find a parent route
        const segments = path.split('/').filter(Boolean);
        if (segments.length > 1) {
          path = '/' + segments.slice(0, -1).join('/');
        } else {
          break;
        }
      }
    }

    // Create breadcrumb items
    pathsToResolve.forEach((p, index) => {
      const config = ROUTE_CONFIG[p];
      if (config) {
        breadcrumbs.push({
          label: config.label,
          path: p,
          icon: config.icon,
          isLast: index === pathsToResolve.length - 1,
        });
      }
    });

    return breadcrumbs;
  }, [currentPath]);
}

function Breadcrumbs() {
  const breadcrumbs = useBreadcrumbs();

  if (breadcrumbs.length === 0) {
    return null;
  }

  return (
    <nav aria-label="Breadcrumb" data-testid="breadcrumbs">
      <ol className="flex items-center gap-1 text-sm">
        {breadcrumbs.map((crumb, index) => {
          const Icon = crumb.icon;
          return (
            <li key={crumb.path} className="flex items-center">
              {index > 0 && (
                <ChevronRight className="w-4 h-4 mx-1 text-[var(--color-text-muted)]" />
              )}
              {crumb.isLast ? (
                <span
                  className="flex items-center gap-1.5 px-2 py-1 font-semibold text-[var(--color-text)] rounded-md"
                  data-testid={`breadcrumb-${crumb.label.toLowerCase().replace(/\s/g, '-')}`}
                >
                  {Icon && <Icon className="w-4 h-4" />}
                  {crumb.label}
                </span>
              ) : (
                <Link
                  to={crumb.path}
                  className="flex items-center gap-1.5 px-2 py-1 text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] rounded-md transition-colors duration-150"
                  data-testid={`breadcrumb-${crumb.label.toLowerCase().replace(/\s/g, '-')}`}
                >
                  {Icon && <Icon className="w-4 h-4" />}
                  {crumb.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function AppShell() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const health = useHealth();
  const { connectionState } = useRealtimeEvents({ channels: ['*'] });

  // Initialize global keyboard shortcuts (G T, G P, etc.)
  useGlobalKeyboardShortcuts();

  // Toggle sidebar with Cmd+B
  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed(prev => !prev);
  }, []);
  useKeyboardShortcut('Cmd+B', toggleSidebar, 'Toggle sidebar');

  return (
    <div className="flex h-screen bg-[var(--color-bg)]" data-testid="app-shell">
      <CommandPalette />
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header
          className="flex items-center justify-between h-14 px-6 bg-[var(--color-header-bg)] border-b border-[var(--color-header-border)]"
          data-testid="header"
        >
          <Breadcrumbs />
          <div className="flex items-center gap-4">
            <ThemeToggle />
            <div className="h-5 w-px bg-[var(--color-border)]" />
            <ConnectionStatus wsState={connectionState} health={health} />
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-6 bg-[var(--color-bg)]">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

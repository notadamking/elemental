/**
 * Router configuration for Orchestrator web app
 * Uses TanStack Router with typed routes
 */

import { createRouter, createRoute, createRootRoute, redirect } from '@tanstack/react-router';
import { AppShell } from './components/layout';
import { ActivityPage } from './routes/activity';
import { TasksPage } from './routes/tasks';
import { AgentsPage } from './routes/agents';
import { WorkspacesPage } from './routes/workspaces';
import { WorkflowsPage } from './routes/workflows';
import { MetricsPage } from './routes/metrics';
import { SettingsPage } from './routes/settings';

// Root route with the AppShell layout
const rootRoute = createRootRoute({
  component: AppShell,
});

// Index route - redirect to activity (home page)
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({ to: '/activity' });
  },
});

// Activity route (home page)
const activityRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/activity',
  component: ActivityPage,
});

// Tasks route
const tasksRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/tasks',
  component: TasksPage,
  validateSearch: (search: Record<string, unknown>) => {
    return {
      selected: typeof search.selected === 'string' ? search.selected : undefined,
      page: typeof search.page === 'number' ? search.page :
            typeof search.page === 'string' ? parseInt(search.page, 10) || 1 : 1,
      limit: typeof search.limit === 'number' ? search.limit :
             typeof search.limit === 'string' ? parseInt(search.limit, 10) || 25 : 25,
      status: typeof search.status === 'string' ? search.status : undefined,
      assignee: typeof search.assignee === 'string' ? search.assignee : undefined,
    };
  },
});

// Agents route
const agentsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/agents',
  component: AgentsPage,
  validateSearch: (search: Record<string, unknown>) => {
    return {
      selected: typeof search.selected === 'string' ? search.selected : undefined,
      tab: typeof search.tab === 'string' ? search.tab : 'agents',
      role: typeof search.role === 'string' ? search.role : undefined,
    };
  },
});

// Workspaces route
const workspacesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/workspaces',
  component: WorkspacesPage,
  validateSearch: (search: Record<string, unknown>) => {
    return {
      layout: typeof search.layout === 'string' ? search.layout : 'single',
      agent: typeof search.agent === 'string' ? search.agent : undefined,
    };
  },
});

// Workflows route
const workflowsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/workflows',
  component: WorkflowsPage,
  validateSearch: (search: Record<string, unknown>) => {
    return {
      selected: typeof search.selected === 'string' ? search.selected : undefined,
      tab: typeof search.tab === 'string' ? search.tab : 'templates',
    };
  },
});

// Metrics route
const metricsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/metrics',
  component: MetricsPage,
  validateSearch: (search: Record<string, unknown>) => {
    return {
      range: typeof search.range === 'string' ? search.range : '7d',
    };
  },
});

// Settings route
const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  component: SettingsPage,
  validateSearch: (search: Record<string, unknown>) => {
    return {
      tab: typeof search.tab === 'string' ? search.tab : 'preferences',
    };
  },
});

// Build the route tree
const routeTree = rootRoute.addChildren([
  indexRoute,
  activityRoute,
  tasksRoute,
  agentsRoute,
  workspacesRoute,
  workflowsRoute,
  metricsRoute,
  settingsRoute,
]);

// Create and export the router
export const router = createRouter({ routeTree });

// Type declaration for router
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

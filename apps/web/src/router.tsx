import { createRouter, createRoute, createRootRoute, redirect } from '@tanstack/react-router';
import { AppShell } from './components/layout';
import { DashboardPage } from './routes/dashboard';
import { TasksPage } from './routes/tasks';
import { TaskFlowPage } from './routes/task-flow';
import { AgentActivityPage } from './routes/agent-activity';
import { DependencyGraphPage } from './routes/dependency-graph';
import { TimelinePage } from './routes/timeline';
import { MessagesPage } from './routes/messages';
import { DocumentsPage } from './routes/documents';
import { PlansPage } from './routes/plans';
import { WorkflowsPage } from './routes/workflows';
import { EntitiesPage } from './routes/entities';
import { TeamsPage } from './routes/teams';
import { SettingsPage, getDefaultDashboardLens } from './routes/settings';

// Map dashboard lens settings to routes
const DASHBOARD_LENS_ROUTES: Record<ReturnType<typeof getDefaultDashboardLens>, string> = {
  'overview': '/dashboard',
  'task-flow': '/dashboard/task-flow',
  'agents': '/dashboard/agents',
  'dependencies': '/dashboard/dependencies',
  'timeline': '/dashboard/timeline',
};

// Root route with the AppShell layout
const rootRoute = createRootRoute({
  component: AppShell,
});

// Index route - redirect to user's preferred dashboard lens
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: () => {
    const defaultLens = getDefaultDashboardLens();
    const targetRoute = DASHBOARD_LENS_ROUTES[defaultLens] || '/dashboard';
    throw redirect({ to: targetRoute });
  },
});

// Dashboard route
const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/dashboard',
  component: DashboardPage,
});

// Tasks route with pagination URL sync
const tasksRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/tasks',
  component: TasksPage,
  validateSearch: (search: Record<string, unknown>): { selected?: string; page: number; limit: number } => {
    return {
      selected: typeof search.selected === 'string' ? search.selected : undefined,
      page: typeof search.page === 'number' ? search.page :
            typeof search.page === 'string' ? parseInt(search.page, 10) || 1 : 1,
      limit: typeof search.limit === 'number' ? search.limit :
             typeof search.limit === 'string' ? parseInt(search.limit, 10) || 25 : 25,
    };
  },
});

// Task Flow Lens route (Dashboard sub-view)
const taskFlowRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/dashboard/task-flow',
  component: TaskFlowPage,
});

// Agent Activity Lens route (Dashboard sub-view)
const agentActivityRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/dashboard/agents',
  component: AgentActivityPage,
});

// Dependency Graph Lens route (Dashboard sub-view)
const dependencyGraphRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/dashboard/dependencies',
  component: DependencyGraphPage,
});

// Timeline Lens route (Dashboard sub-view)
const timelineRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/dashboard/timeline',
  component: TimelinePage,
  validateSearch: (search: Record<string, unknown>) => {
    return {
      page: typeof search.page === 'number' ? search.page :
            typeof search.page === 'string' ? parseInt(search.page, 10) || 1 : 1,
      limit: typeof search.limit === 'number' ? search.limit :
             typeof search.limit === 'string' ? parseInt(search.limit, 10) || 100 : 100,
    };
  },
});

const plansRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/plans',
  component: PlansPage,
  validateSearch: (search: Record<string, unknown>): { selected?: string; status?: string } => {
    return {
      selected: typeof search.selected === 'string' ? search.selected : undefined,
      status: typeof search.status === 'string' ? search.status : undefined,
    };
  },
});

const workflowsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/workflows',
  component: WorkflowsPage,
  validateSearch: (search: Record<string, unknown>): { selected?: string; status?: string } => {
    return {
      selected: typeof search.selected === 'string' ? search.selected : undefined,
      status: typeof search.status === 'string' ? search.status : undefined,
    };
  },
});

const messagesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/messages',
  component: MessagesPage,
  validateSearch: (search: Record<string, unknown>) => {
    return {
      channel: typeof search.channel === 'string' ? search.channel : undefined,
      message: typeof search.message === 'string' ? search.message : undefined,
      page: typeof search.page === 'number' ? search.page :
            typeof search.page === 'string' ? parseInt(search.page, 10) || 1 : 1,
      limit: typeof search.limit === 'number' ? search.limit :
             typeof search.limit === 'string' ? parseInt(search.limit, 10) || 50 : 50,
    };
  },
});

const documentsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/documents',
  component: DocumentsPage,
  validateSearch: (search: Record<string, unknown>) => {
    return {
      selected: typeof search.selected === 'string' ? search.selected : undefined,
      library: typeof search.library === 'string' ? search.library : undefined,
      page: typeof search.page === 'number' ? search.page :
            typeof search.page === 'string' ? parseInt(search.page, 10) || 1 : 1,
      limit: typeof search.limit === 'number' ? search.limit :
             typeof search.limit === 'string' ? parseInt(search.limit, 10) || 25 : 25,
    };
  },
});

const entitiesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/entities',
  component: EntitiesPage,
  validateSearch: (search: Record<string, unknown>) => {
    return {
      selected: typeof search.selected === 'string' ? search.selected : undefined,
      name: typeof search.name === 'string' ? search.name : undefined,
      page: typeof search.page === 'number' ? search.page :
            typeof search.page === 'string' ? parseInt(search.page, 10) || 1 : 1,
      limit: typeof search.limit === 'number' ? search.limit :
             typeof search.limit === 'string' ? parseInt(search.limit, 10) || 25 : 25,
    };
  },
});

const teamsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/teams',
  component: TeamsPage,
  validateSearch: (search: Record<string, unknown>) => {
    return {
      selected: typeof search.selected === 'string' ? search.selected : undefined,
      page: typeof search.page === 'number' ? search.page :
            typeof search.page === 'string' ? parseInt(search.page, 10) || 1 : 1,
      limit: typeof search.limit === 'number' ? search.limit :
             typeof search.limit === 'string' ? parseInt(search.limit, 10) || 25 : 25,
    };
  },
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  component: SettingsPage,
});

// Build the route tree
const routeTree = rootRoute.addChildren([
  indexRoute,
  dashboardRoute,
  taskFlowRoute,
  agentActivityRoute,
  dependencyGraphRoute,
  timelineRoute,
  tasksRoute,
  plansRoute,
  workflowsRoute,
  messagesRoute,
  documentsRoute,
  entitiesRoute,
  teamsRoute,
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

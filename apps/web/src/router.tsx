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

// Root route with the AppShell layout
const rootRoute = createRootRoute({
  component: AppShell,
});

// Index route - redirect to dashboard
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({ to: '/dashboard' });
  },
});

// Dashboard route
const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/dashboard',
  component: DashboardPage,
});

// Tasks route
const tasksRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/tasks',
  component: TasksPage,
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
});

// Placeholder routes for future pages
function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="text-center py-12">
      <h2 className="text-lg font-medium text-gray-900 mb-2">{title}</h2>
      <p className="text-gray-500">This page is coming soon.</p>
    </div>
  );
}

const plansRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/plans',
  component: PlansPage,
});

const workflowsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/workflows',
  component: () => <PlaceholderPage title="Workflows" />,
});

const messagesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/messages',
  component: MessagesPage,
});

const documentsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/documents',
  component: DocumentsPage,
});

const entitiesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/entities',
  component: () => <PlaceholderPage title="Entities" />,
});

const teamsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/teams',
  component: () => <PlaceholderPage title="Teams" />,
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  component: () => <PlaceholderPage title="Settings" />,
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

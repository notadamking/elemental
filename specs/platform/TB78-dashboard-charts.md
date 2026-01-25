# TB78: Dashboard Overview Charts Specification

## Purpose

Add interactive data visualization charts to the dashboard overview page, providing at-a-glance insights into task status distribution, completion trends, and workload distribution across agents.

## Components

### DashboardCharts Component

**Location:** `apps/web/src/components/dashboard/DashboardCharts.tsx`

The main component that renders a responsive grid of three chart components.

### TasksByStatusChart (Donut Chart)

Displays the distribution of tasks by status using a donut/pie chart.

**Features:**
- Shows counts for: Open, In Progress, Blocked, Completed
- Color-coded segments matching status colors
- Interactive legend with clickable links to tasks page
- Percentage labels on chart segments
- Hover tooltips showing exact counts
- Empty state when no tasks exist

### TasksCompletedOverTimeChart (Line Chart)

Shows the number of tasks completed over the last 7 days.

**Features:**
- X-axis: Day labels (Today, Yesterday, weekday names)
- Y-axis: Task count
- Smooth line with data points
- Hover tooltips showing day and count
- Total count displayed in header

### WorkloadByAgentChart (Horizontal Bar Chart)

Shows the distribution of active tasks across agents/assignees.

**Features:**
- Horizontal bars for easy comparison
- Agent names on Y-axis
- Task counts on X-axis
- Top 10 agents shown (sorted by task count)
- Empty state when no assigned tasks
- Hover tooltips showing agent name and count

## Technical Implementation

### Dependencies

- `recharts` - React charting library (lightweight, declarative)

### Data Fetching

- Uses React Query for data fetching
- `useAllTasks()` - Fetches all tasks with high limit
- `useAllEntities()` - Fetches all entities for agent names
- Handles paginated API response format (extracts `items` array)

### Responsive Design

- Grid layout: 3 columns on large screens, 2 on medium, 1 on mobile
- Charts resize responsively within their containers
- Consistent card styling with the rest of the app

### Color Tokens

Charts use CSS custom properties for theming:
- `--color-primary` - Open tasks / primary elements
- `--color-warning` - In Progress tasks
- `--color-error` - Blocked tasks
- `--color-success` - Completed tasks
- `--color-border` - Grid lines and axes
- `--color-muted-foreground` - Labels and secondary text

## Test Coverage

**File:** `apps/web/tests/tb78-dashboard-charts.spec.ts`

20 Playwright tests covering:
- Charts grid visibility and responsiveness
- Chart titles and labels
- Legend visibility and interactivity
- Loading and empty states
- Data integration
- Visual consistency

## Usage

The `DashboardCharts` component is rendered in the dashboard overview page:

```tsx
import { DashboardCharts } from '../components/dashboard/DashboardCharts';

function DashboardPage() {
  return (
    <div>
      {/* ... metrics overview ... */}
      <DashboardCharts />
      {/* ... ready tasks list ... */}
    </div>
  );
}
```

## Future Enhancements

- Click on donut segment to filter tasks by status
- Click on bar to filter tasks by assignee
- Date range selector for completion chart
- Export charts as images
- Real-time updates via WebSocket

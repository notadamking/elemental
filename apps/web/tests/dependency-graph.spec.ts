import { test, expect } from '@playwright/test';

test.describe('TB8: Dependency Graph Lens', () => {
  test('dependency tree endpoint is accessible', async ({ page }) => {
    // First get a task to test with
    const tasksResponse = await page.request.get('/api/tasks/ready');
    const tasks = await tasksResponse.json();

    if (tasks.length === 0) {
      test.skip();
      return;
    }

    const firstTask = tasks[0];
    const response = await page.request.get(`/api/dependencies/${firstTask.id}/tree`);
    expect(response.ok()).toBe(true);
    const tree = await response.json();
    expect(tree).toHaveProperty('root');
    expect(tree).toHaveProperty('nodeCount');
  });

  test('dependencies endpoint is accessible', async ({ page }) => {
    // First get a task to test with
    const tasksResponse = await page.request.get('/api/tasks/ready');
    const tasks = await tasksResponse.json();

    if (tasks.length === 0) {
      test.skip();
      return;
    }

    const firstTask = tasks[0];
    const response = await page.request.get(`/api/dependencies/${firstTask.id}`);
    expect(response.ok()).toBe(true);
    const deps = await response.json();
    expect(deps).toHaveProperty('dependencies');
    expect(deps).toHaveProperty('dependents');
  });

  test('dependency graph page is accessible via navigation', async ({ page }) => {
    await page.goto('/dashboard/dependencies');
    await expect(page.getByTestId('dependency-graph-page')).toBeVisible({ timeout: 10000 });
  });

  test('sidebar has Dependencies nav item', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByTestId('sidebar')).toBeVisible({ timeout: 10000 });

    // Check for Dependencies link in sidebar
    const depsLink = page.getByRole('link', { name: /Dependencies/i });
    await expect(depsLink).toBeVisible();
  });

  test('can navigate to Dependencies from sidebar', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByTestId('sidebar')).toBeVisible({ timeout: 10000 });

    // Click Dependencies link
    await page.getByRole('link', { name: /Dependencies/i }).click();

    // Should be on dependencies page
    await expect(page.getByTestId('dependency-graph-page')).toBeVisible({ timeout: 10000 });
    await expect(page).toHaveURL('/dashboard/dependencies');
  });

  test('dependency graph page shows task selector when tasks exist', async ({ page }) => {
    // Get tasks from API
    const readyResponse = await page.request.get('/api/tasks/ready');
    const readyTasks = await readyResponse.json();
    const blockedResponse = await page.request.get('/api/tasks/blocked');
    const blockedTasks = await blockedResponse.json();

    const allTasks = [...readyTasks, ...blockedTasks];

    await page.goto('/dashboard/dependencies');
    await expect(page.getByTestId('dependency-graph-page')).toBeVisible({ timeout: 10000 });

    // Wait for loading to complete
    await expect(page.getByText('Loading tasks...')).not.toBeVisible({ timeout: 10000 });

    if (allTasks.length === 0) {
      // Should show empty state
      await expect(page.getByText('No tasks available')).toBeVisible();
    } else {
      // Should show task selector
      await expect(page.getByTestId('task-selector')).toBeVisible();
    }
  });

  test('graph canvas is displayed when tasks exist', async ({ page }) => {
    // Get tasks from API
    const tasksResponse = await page.request.get('/api/tasks/ready');
    const tasks = await tasksResponse.json();

    if (tasks.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/dashboard/dependencies');
    await expect(page.getByTestId('dependency-graph-page')).toBeVisible({ timeout: 10000 });

    // Wait for loading to complete
    await expect(page.getByText('Loading tasks...')).not.toBeVisible({ timeout: 10000 });

    // Should show graph canvas
    await expect(page.getByTestId('graph-canvas')).toBeVisible();
  });

  test('status legend is displayed', async ({ page }) => {
    await page.goto('/dashboard/dependencies');
    await expect(page.getByTestId('dependency-graph-page')).toBeVisible({ timeout: 10000 });

    // Check for status legend items
    await expect(page.getByText('Status:')).toBeVisible();
    await expect(page.getByText('open', { exact: false })).toBeVisible();
    await expect(page.getByText('completed', { exact: false })).toBeVisible();
  });
});

test.describe('TB43: Dependency Graph - Filter & Search', () => {
  test('search input is displayed in toolbar', async ({ page }) => {
    // Check if there are tasks to display the toolbar
    const readyResponse = await page.request.get('/api/tasks/ready');
    const readyTasks = await readyResponse.json();
    const blockedResponse = await page.request.get('/api/tasks/blocked');
    const blockedTasks = await blockedResponse.json();
    const allTasks = [...readyTasks, ...blockedTasks];

    if (allTasks.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/dashboard/dependencies');
    await expect(page.getByTestId('dependency-graph-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Loading tasks...')).not.toBeVisible({ timeout: 10000 });

    // Search input should be visible
    await expect(page.getByTestId('graph-search-input')).toBeVisible();
  });

  test('search input has placeholder text', async ({ page }) => {
    const readyResponse = await page.request.get('/api/tasks/ready');
    const readyTasks = await readyResponse.json();
    const blockedResponse = await page.request.get('/api/tasks/blocked');
    const blockedTasks = await blockedResponse.json();
    const allTasks = [...readyTasks, ...blockedTasks];

    if (allTasks.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/dashboard/dependencies');
    await expect(page.getByTestId('dependency-graph-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Loading tasks...')).not.toBeVisible({ timeout: 10000 });

    // Check placeholder text
    await expect(page.getByTestId('graph-search-input')).toHaveAttribute('placeholder', 'Search by title or ID...');
  });

  test('status filter button is displayed', async ({ page }) => {
    const readyResponse = await page.request.get('/api/tasks/ready');
    const readyTasks = await readyResponse.json();
    const blockedResponse = await page.request.get('/api/tasks/blocked');
    const blockedTasks = await blockedResponse.json();
    const allTasks = [...readyTasks, ...blockedTasks];

    if (allTasks.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/dashboard/dependencies');
    await expect(page.getByTestId('dependency-graph-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Loading tasks...')).not.toBeVisible({ timeout: 10000 });

    // Status filter button should be visible
    await expect(page.getByTestId('status-filter-button')).toBeVisible();
  });

  test('status filter dropdown opens on click', async ({ page }) => {
    const readyResponse = await page.request.get('/api/tasks/ready');
    const readyTasks = await readyResponse.json();
    const blockedResponse = await page.request.get('/api/tasks/blocked');
    const blockedTasks = await blockedResponse.json();
    const allTasks = [...readyTasks, ...blockedTasks];

    if (allTasks.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/dashboard/dependencies');
    await expect(page.getByTestId('dependency-graph-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Loading tasks...')).not.toBeVisible({ timeout: 10000 });

    // Click status filter button
    await page.getByTestId('status-filter-button').click();

    // Dropdown should be visible
    await expect(page.getByTestId('status-filter-dropdown')).toBeVisible();
  });

  test('status filter dropdown has all status options', async ({ page }) => {
    const readyResponse = await page.request.get('/api/tasks/ready');
    const readyTasks = await readyResponse.json();
    const blockedResponse = await page.request.get('/api/tasks/blocked');
    const blockedTasks = await blockedResponse.json();
    const allTasks = [...readyTasks, ...blockedTasks];

    if (allTasks.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/dashboard/dependencies');
    await expect(page.getByTestId('dependency-graph-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Loading tasks...')).not.toBeVisible({ timeout: 10000 });

    // Open dropdown
    await page.getByTestId('status-filter-button').click();

    // Check all status options are present
    await expect(page.getByTestId('status-filter-option-open')).toBeVisible();
    await expect(page.getByTestId('status-filter-option-in_progress')).toBeVisible();
    await expect(page.getByTestId('status-filter-option-blocked')).toBeVisible();
    await expect(page.getByTestId('status-filter-option-completed')).toBeVisible();
    await expect(page.getByTestId('status-filter-option-cancelled')).toBeVisible();
  });

  test('zoom controls are displayed', async ({ page }) => {
    const readyResponse = await page.request.get('/api/tasks/ready');
    const readyTasks = await readyResponse.json();
    const blockedResponse = await page.request.get('/api/tasks/blocked');
    const blockedTasks = await blockedResponse.json();
    const allTasks = [...readyTasks, ...blockedTasks];

    if (allTasks.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/dashboard/dependencies');
    await expect(page.getByTestId('dependency-graph-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Loading tasks...')).not.toBeVisible({ timeout: 10000 });

    // Zoom controls should be visible
    await expect(page.getByTestId('zoom-in-button')).toBeVisible();
    await expect(page.getByTestId('zoom-out-button')).toBeVisible();
    await expect(page.getByTestId('fit-view-button')).toBeVisible();
  });

  test('typing in search shows match count', async ({ page }) => {
    const readyResponse = await page.request.get('/api/tasks/ready');
    const readyTasks = await readyResponse.json();
    const blockedResponse = await page.request.get('/api/tasks/blocked');
    const blockedTasks = await blockedResponse.json();
    const allTasks = [...readyTasks, ...blockedTasks];

    if (allTasks.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/dashboard/dependencies');
    await expect(page.getByTestId('dependency-graph-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Loading tasks...')).not.toBeVisible({ timeout: 10000 });

    // Type something in search
    await page.getByTestId('graph-search-input').fill('test');

    // Wait for the match count to appear
    await expect(page.getByTestId('match-count')).toBeVisible({ timeout: 5000 });
  });

  test('clear filters button appears when search is active', async ({ page }) => {
    const readyResponse = await page.request.get('/api/tasks/ready');
    const readyTasks = await readyResponse.json();
    const blockedResponse = await page.request.get('/api/tasks/blocked');
    const blockedTasks = await blockedResponse.json();
    const allTasks = [...readyTasks, ...blockedTasks];

    if (allTasks.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/dashboard/dependencies');
    await expect(page.getByTestId('dependency-graph-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Loading tasks...')).not.toBeVisible({ timeout: 10000 });

    // Initially clear filters button should not be visible
    await expect(page.getByTestId('clear-filters-button')).not.toBeVisible();

    // Type something in search
    await page.getByTestId('graph-search-input').fill('test');

    // Clear filters button should appear
    await expect(page.getByTestId('clear-filters-button')).toBeVisible();
  });

  test('clear filters button clears search', async ({ page }) => {
    const readyResponse = await page.request.get('/api/tasks/ready');
    const readyTasks = await readyResponse.json();
    const blockedResponse = await page.request.get('/api/tasks/blocked');
    const blockedTasks = await blockedResponse.json();
    const allTasks = [...readyTasks, ...blockedTasks];

    if (allTasks.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/dashboard/dependencies');
    await expect(page.getByTestId('dependency-graph-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Loading tasks...')).not.toBeVisible({ timeout: 10000 });

    // Type something in search
    await page.getByTestId('graph-search-input').fill('test');

    // Click clear filters
    await page.getByTestId('clear-filters-button').click();

    // Search should be cleared
    await expect(page.getByTestId('graph-search-input')).toHaveValue('');
  });

  test('selecting status filter shows selection count badge', async ({ page }) => {
    const readyResponse = await page.request.get('/api/tasks/ready');
    const readyTasks = await readyResponse.json();
    const blockedResponse = await page.request.get('/api/tasks/blocked');
    const blockedTasks = await blockedResponse.json();
    const allTasks = [...readyTasks, ...blockedTasks];

    if (allTasks.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/dashboard/dependencies');
    await expect(page.getByTestId('dependency-graph-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Loading tasks...')).not.toBeVisible({ timeout: 10000 });

    // Open dropdown and select a status
    await page.getByTestId('status-filter-button').click();
    await page.getByTestId('status-filter-option-open').click();

    // The button should now show a count badge
    const filterButton = page.getByTestId('status-filter-button');
    const countBadge = filterButton.locator('span.bg-blue-600');
    await expect(countBadge).toBeVisible();
    expect(await countBadge.textContent()).toBe('1');
  });

  test('clear search button appears when search has value', async ({ page }) => {
    const readyResponse = await page.request.get('/api/tasks/ready');
    const readyTasks = await readyResponse.json();
    const blockedResponse = await page.request.get('/api/tasks/blocked');
    const blockedTasks = await blockedResponse.json();
    const allTasks = [...readyTasks, ...blockedTasks];

    if (allTasks.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/dashboard/dependencies');
    await expect(page.getByTestId('dependency-graph-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Loading tasks...')).not.toBeVisible({ timeout: 10000 });

    // Initially clear search button should not be visible
    await expect(page.getByTestId('clear-search-button')).not.toBeVisible();

    // Type something in search
    await page.getByTestId('graph-search-input').fill('test');

    // Clear search button should appear
    await expect(page.getByTestId('clear-search-button')).toBeVisible();
  });

  test('clear search button clears only search input', async ({ page }) => {
    const readyResponse = await page.request.get('/api/tasks/ready');
    const readyTasks = await readyResponse.json();
    const blockedResponse = await page.request.get('/api/tasks/blocked');
    const blockedTasks = await blockedResponse.json();
    const allTasks = [...readyTasks, ...blockedTasks];

    if (allTasks.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/dashboard/dependencies');
    await expect(page.getByTestId('dependency-graph-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Loading tasks...')).not.toBeVisible({ timeout: 10000 });

    // Type something in search
    await page.getByTestId('graph-search-input').fill('test');

    // Click clear search button
    await page.getByTestId('clear-search-button').click();

    // Search should be cleared
    await expect(page.getByTestId('graph-search-input')).toHaveValue('');
  });

  test('minimap is displayed in graph', async ({ page }) => {
    const readyResponse = await page.request.get('/api/tasks/ready');
    const readyTasks = await readyResponse.json();
    const blockedResponse = await page.request.get('/api/tasks/blocked');
    const blockedTasks = await blockedResponse.json();
    const allTasks = [...readyTasks, ...blockedTasks];

    if (allTasks.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/dashboard/dependencies');
    await expect(page.getByTestId('dependency-graph-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Loading tasks...')).not.toBeVisible({ timeout: 10000 });

    // Wait for graph to load
    await page.waitForTimeout(1000);

    // MiniMap is a React Flow component, check for its container class
    const minimap = page.locator('.react-flow__minimap');
    await expect(minimap).toBeVisible();
  });

  test('graph toolbar is displayed when tasks exist', async ({ page }) => {
    const readyResponse = await page.request.get('/api/tasks/ready');
    const readyTasks = await readyResponse.json();
    const blockedResponse = await page.request.get('/api/tasks/blocked');
    const blockedTasks = await blockedResponse.json();
    const allTasks = [...readyTasks, ...blockedTasks];

    if (allTasks.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/dashboard/dependencies');
    await expect(page.getByTestId('dependency-graph-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Loading tasks...')).not.toBeVisible({ timeout: 10000 });

    // Toolbar should be visible
    await expect(page.getByTestId('graph-toolbar')).toBeVisible();
  });
});

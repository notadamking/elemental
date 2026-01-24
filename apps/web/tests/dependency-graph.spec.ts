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

import { test, expect } from '@playwright/test';

test.describe('TB5: Basic Sidebar Navigation', () => {
  test('sidebar is visible on page load', async ({ page }) => {
    await page.goto('/');

    // Should redirect to /dashboard
    await expect(page).toHaveURL(/\/dashboard/);

    // Sidebar should be visible
    const sidebar = page.getByTestId('sidebar');
    await expect(sidebar).toBeVisible();
  });

  test('sidebar shows all navigation items', async ({ page }) => {
    await page.goto('/dashboard');

    // Check all expected navigation items are visible
    await expect(page.getByRole('link', { name: /dashboard/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /tasks/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /plans/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /workflows/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /messages/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /documents/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /entities/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /teams/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /settings/i })).toBeVisible();
  });

  test('navigation between dashboard and tasks works', async ({ page }) => {
    await page.goto('/dashboard');

    // Verify we're on dashboard
    await expect(page.getByTestId('dashboard-page')).toBeVisible();
    await expect(page.getByText('System Overview')).toBeVisible();

    // Click on Tasks link
    await page.getByRole('link', { name: /tasks/i }).click();

    // Should navigate to /tasks
    await expect(page).toHaveURL(/\/tasks/);
    await expect(page.getByTestId('tasks-page')).toBeVisible();
    await expect(page.getByRole('heading', { name: /tasks/i })).toBeVisible();

    // Click back to Dashboard
    await page.getByRole('link', { name: /dashboard/i }).click();

    // Should navigate back to /dashboard
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByTestId('dashboard-page')).toBeVisible();
  });

  test('active navigation item is highlighted', async ({ page }) => {
    await page.goto('/dashboard');

    // Dashboard link should have active styling (blue color)
    const dashboardLink = page.getByRole('link', { name: /dashboard/i });
    await expect(dashboardLink).toHaveClass(/bg-blue-50/);
    await expect(dashboardLink).toHaveClass(/text-blue-600/);

    // Tasks link should not have active styling
    const tasksLink = page.getByRole('link', { name: /tasks/i });
    await expect(tasksLink).not.toHaveClass(/bg-blue-50/);

    // Navigate to tasks
    await tasksLink.click();
    await expect(page).toHaveURL(/\/tasks/);

    // Now tasks should be active
    await expect(page.getByRole('link', { name: /tasks/i })).toHaveClass(/bg-blue-50/);
    await expect(page.getByRole('link', { name: /dashboard/i })).not.toHaveClass(/bg-blue-50/);
  });

  test('sidebar can be collapsed and expanded', async ({ page }) => {
    await page.goto('/dashboard');

    const sidebar = page.getByTestId('sidebar');

    // Sidebar should start expanded (w-60 = 240px)
    await expect(sidebar).toHaveClass(/w-60/);

    // Find and click the collapse button
    const collapseButton = page.getByRole('button', { name: /collapse sidebar/i });
    await collapseButton.click();

    // Sidebar should be collapsed (w-16)
    await expect(sidebar).toHaveClass(/w-16/);

    // Find and click the expand button
    const expandButton = page.getByRole('button', { name: /expand sidebar/i });
    await expandButton.click();

    // Sidebar should be expanded again
    await expect(sidebar).toHaveClass(/w-60/);
  });

  test('root URL redirects to dashboard', async ({ page }) => {
    await page.goto('/');

    // Should redirect to /dashboard
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByTestId('dashboard-page')).toBeVisible();
  });

  test('connection status is visible in header', async ({ page }) => {
    await page.goto('/dashboard');

    // Wait for WebSocket connection
    await expect(page.getByText('Live')).toBeVisible({ timeout: 10000 });
  });

  test('placeholder pages show coming soon message', async ({ page }) => {
    await page.goto('/plans');
    await expect(page.getByRole('heading', { name: 'Plans' })).toBeVisible();
    await expect(page.getByText(/coming soon/i)).toBeVisible();

    await page.goto('/workflows');
    await expect(page.getByRole('heading', { name: 'Workflows' })).toBeVisible();
    await expect(page.getByText(/coming soon/i)).toBeVisible();

    // Messages page is now implemented (TB16), skip placeholder check
    // Documents page is now implemented (TB20/TB21), skip placeholder check

    await page.goto('/entities');
    await expect(page.getByRole('heading', { name: 'Entities' })).toBeVisible();
    await expect(page.getByText(/coming soon/i)).toBeVisible();

    await page.goto('/teams');
    await expect(page.getByRole('heading', { name: 'Teams' })).toBeVisible();
    await expect(page.getByText(/coming soon/i)).toBeVisible();

    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    await expect(page.getByText(/coming soon/i)).toBeVisible();
  });

  test('app shell layout is properly structured', async ({ page }) => {
    await page.goto('/dashboard');

    // App shell should be visible
    await expect(page.getByTestId('app-shell')).toBeVisible();

    // Sidebar should be present
    await expect(page.getByTestId('sidebar')).toBeVisible();

    // Main content area should contain the dashboard
    await expect(page.getByTestId('dashboard-page')).toBeVisible();
  });

  test('browser back/forward navigation works', async ({ page }) => {
    await page.goto('/dashboard');

    // Navigate to tasks
    await page.getByRole('link', { name: /tasks/i }).click();
    await expect(page).toHaveURL(/\/tasks/);

    // Navigate to plans
    await page.getByRole('link', { name: /plans/i }).click();
    await expect(page).toHaveURL(/\/plans/);

    // Go back to tasks
    await page.goBack();
    await expect(page).toHaveURL(/\/tasks/);
    await expect(page.getByTestId('tasks-page')).toBeVisible();

    // Go back to dashboard
    await page.goBack();
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByTestId('dashboard-page')).toBeVisible();

    // Go forward to tasks
    await page.goForward();
    await expect(page).toHaveURL(/\/tasks/);
    await expect(page.getByTestId('tasks-page')).toBeVisible();
  });
});

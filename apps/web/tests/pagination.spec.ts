import { test, expect } from '@playwright/test';

test.describe('TB46: Universal Pagination', () => {
  test('tasks page loads with default pagination params in URL', async ({ page }) => {
    await page.goto('/tasks');
    await expect(page).toHaveURL(/\/tasks\?page=1&limit=25/);
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });
  });

  test('pagination component is visible on tasks page', async ({ page }) => {
    await page.goto('/tasks?page=1&limit=25');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });

    // Wait for tasks to load
    await expect(page.getByText('Loading tasks...')).not.toBeVisible({ timeout: 10000 });

    // Pagination should be visible
    await expect(page.getByTestId('pagination')).toBeVisible();
  });

  test('pagination info shows correct range', async ({ page }) => {
    await page.goto('/tasks?page=1&limit=25');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Loading tasks...')).not.toBeVisible({ timeout: 10000 });

    // Should show pagination info
    const paginationInfo = page.getByTestId('pagination-info');
    await expect(paginationInfo).toBeVisible();
    // Info should contain "of" (e.g., "Showing 1-25 of 100" or "No items")
    await expect(paginationInfo).toHaveText(/of|No items/);
  });

  test('page size selector is visible', async ({ page }) => {
    await page.goto('/tasks?page=1&limit=25');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Loading tasks...')).not.toBeVisible({ timeout: 10000 });

    // Page size selector should be visible
    await expect(page.getByTestId('pagination-page-size')).toBeVisible();
  });

  test('changing page size updates URL', async ({ page }) => {
    await page.goto('/tasks?page=1&limit=25');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Loading tasks...')).not.toBeVisible({ timeout: 10000 });

    // Change page size to 50
    await page.getByTestId('pagination-page-size').selectOption('50');

    // URL should update
    await expect(page).toHaveURL(/limit=50/);
  });

  test('clicking next page updates URL', async ({ page }) => {
    // First, get tasks to check if there are enough for pagination
    const response = await page.request.get('/api/tasks?limit=10');
    const data = await response.json();

    if (!data.items || data.total <= 10) {
      test.skip();
      return;
    }

    await page.goto('/tasks?page=1&limit=10');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Loading tasks...')).not.toBeVisible({ timeout: 10000 });

    // Click next page
    await page.getByTestId('pagination-next').click();

    // URL should update to page 2
    await expect(page).toHaveURL(/page=2/);
  });

  test('clicking page number updates URL', async ({ page }) => {
    // First, get tasks to check if there are enough for pagination
    const response = await page.request.get('/api/tasks?limit=10');
    const data = await response.json();

    if (!data.items || data.total <= 20) {
      test.skip();
      return;
    }

    await page.goto('/tasks?page=1&limit=10');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Loading tasks...')).not.toBeVisible({ timeout: 10000 });

    // Click page 2
    await page.getByTestId('pagination-page-2').click();

    // URL should update to page 2
    await expect(page).toHaveURL(/page=2/);
  });

  test('sidebar navigation to tasks uses default pagination', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByTestId('sidebar')).toBeVisible({ timeout: 10000 });

    // Click tasks in sidebar
    await page.getByTestId('nav-tasks').click();

    // Should navigate to tasks with pagination params
    await expect(page).toHaveURL(/\/tasks\?page=1&limit=25/);
  });

  test('direct URL navigation with custom pagination works', async ({ page }) => {
    await page.goto('/tasks?page=2&limit=50');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Loading tasks...')).not.toBeVisible({ timeout: 10000 });

    // Page size selector should show 50
    await expect(page.getByTestId('pagination-page-size')).toHaveValue('50');
  });

  test('pagination buttons are disabled at boundaries', async ({ page }) => {
    await page.goto('/tasks?page=1&limit=25');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Loading tasks...')).not.toBeVisible({ timeout: 10000 });

    // On first page, prev and first buttons should be disabled
    await expect(page.getByTestId('pagination-first')).toBeDisabled();
    await expect(page.getByTestId('pagination-prev')).toBeDisabled();
  });

  test('filter changes reset to page 1', async ({ page }) => {
    // First, get tasks to check if there are enough for pagination
    const response = await page.request.get('/api/tasks?limit=10');
    const data = await response.json();

    if (!data.items || data.total <= 10) {
      test.skip();
      return;
    }

    // Start on page 2
    await page.goto('/tasks?page=2&limit=10');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Loading tasks...')).not.toBeVisible({ timeout: 10000 });

    // Open filter bar
    await page.getByTestId('filter-toggle').click();

    // Click a status filter
    await page.getByTestId('filter-status-open').click();

    // URL should reset to page 1
    await expect(page).toHaveURL(/page=1/);
  });

  test('sort changes reset to page 1', async ({ page }) => {
    // First, get tasks to check if there are enough for pagination
    const response = await page.request.get('/api/tasks?limit=10');
    const data = await response.json();

    if (!data.items || data.total <= 10) {
      test.skip();
      return;
    }

    // Start on page 2
    await page.goto('/tasks?page=2&limit=10');
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Loading tasks...')).not.toBeVisible({ timeout: 10000 });

    // Click a sortable header
    await page.getByTestId('sort-header-title').click();

    // URL should reset to page 1
    await expect(page).toHaveURL(/page=1/);
  });
});

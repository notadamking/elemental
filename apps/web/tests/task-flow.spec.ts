import { test, expect } from '@playwright/test';

test.describe('TB6: Task Flow Lens', () => {
  test('blocked tasks endpoint is accessible', async ({ page }) => {
    const response = await page.request.get('/api/tasks/blocked');
    expect(response.ok()).toBe(true);
    const data = await response.json();
    expect(Array.isArray(data)).toBe(true);
  });

  test('completed tasks endpoint is accessible', async ({ page }) => {
    const response = await page.request.get('/api/tasks/completed');
    expect(response.ok()).toBe(true);
    const data = await response.json();
    expect(Array.isArray(data)).toBe(true);
  });

  test('task flow page is accessible via navigation', async ({ page }) => {
    await page.goto('/dashboard/task-flow');
    await expect(page.getByTestId('task-flow-page')).toBeVisible({ timeout: 10000 });
  });

  test('task flow page displays three columns', async ({ page }) => {
    await page.goto('/dashboard/task-flow');
    await expect(page.getByTestId('task-flow-page')).toBeVisible({ timeout: 10000 });

    // Check for the three column headers
    await expect(page.getByTestId('column-ready')).toBeVisible();
    await expect(page.getByTestId('column-blocked')).toBeVisible();
    await expect(page.getByTestId('column-completed')).toBeVisible();
  });

  test('task flow shows correct counts', async ({ page }) => {
    // Get task counts from APIs
    const readyResponse = await page.request.get('/api/tasks/ready');
    const readyTasks = await readyResponse.json();

    const blockedResponse = await page.request.get('/api/tasks/blocked');
    const blockedTasks = await blockedResponse.json();

    const completedResponse = await page.request.get('/api/tasks/completed');
    const completedTasks = await completedResponse.json();

    await page.goto('/dashboard/task-flow');
    await expect(page.getByTestId('task-flow-page')).toBeVisible({ timeout: 10000 });

    // Wait for all columns to finish loading
    await expect(page.getByTestId('column-ready').getByText('Loading...')).not.toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('column-blocked').getByText('Loading...')).not.toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('column-completed').getByText('Loading...')).not.toBeVisible({ timeout: 10000 });

    // Check the column counts match API data
    const readyColumn = page.getByTestId('column-ready');
    await expect(readyColumn.getByText(`(${readyTasks.length})`)).toBeVisible();

    const blockedColumn = page.getByTestId('column-blocked');
    await expect(blockedColumn.getByText(`(${blockedTasks.length})`)).toBeVisible();

    const completedColumn = page.getByTestId('column-completed');
    await expect(completedColumn.getByText(`(${completedTasks.length})`)).toBeVisible();
  });

  test('sidebar has Task Flow nav item', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByTestId('sidebar')).toBeVisible({ timeout: 10000 });

    // Check for Task Flow link in sidebar
    const taskFlowLink = page.getByRole('link', { name: /Task Flow/i });
    await expect(taskFlowLink).toBeVisible();
  });

  test('can navigate to Task Flow from sidebar', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByTestId('sidebar')).toBeVisible({ timeout: 10000 });

    // Click Task Flow link
    await page.getByRole('link', { name: /Task Flow/i }).click();

    // Should be on task flow page
    await expect(page.getByTestId('task-flow-page')).toBeVisible({ timeout: 10000 });
    await expect(page).toHaveURL('/dashboard/task-flow');
  });

  test('blocked tasks show block reason', async ({ page }) => {
    // Get blocked tasks from API
    const response = await page.request.get('/api/tasks/blocked');
    const blockedTasks = await response.json();

    if (blockedTasks.length === 0) {
      // Skip this test if there are no blocked tasks
      test.skip();
      return;
    }

    await page.goto('/dashboard/task-flow');
    await expect(page.getByTestId('task-flow-page')).toBeVisible({ timeout: 10000 });

    // Wait for blocked column to finish loading
    await expect(page.getByTestId('column-blocked').getByText('Loading...')).not.toBeVisible({ timeout: 10000 });

    // Check that at least one blocked task shows "Blocked by:" text
    await expect(page.getByText('Blocked by:').first()).toBeVisible();
  });

  test('ready tasks display correct task info', async ({ page }) => {
    // Get ready tasks from API
    const response = await page.request.get('/api/tasks/ready');
    const readyTasks = await response.json();

    if (readyTasks.length === 0) {
      // Skip this test if there are no ready tasks
      test.skip();
      return;
    }

    await page.goto('/dashboard/task-flow');
    await expect(page.getByTestId('task-flow-page')).toBeVisible({ timeout: 10000 });

    // Wait for ready column to finish loading
    await expect(page.getByTestId('column-ready').getByText('Loading...')).not.toBeVisible({ timeout: 10000 });

    // Check that the first ready task's title is displayed
    const firstTask = readyTasks[0];
    await expect(page.getByText(firstTask.title).first()).toBeVisible();

    // Check that task ID is displayed
    await expect(page.getByText(firstTask.id).first()).toBeVisible();
  });
});

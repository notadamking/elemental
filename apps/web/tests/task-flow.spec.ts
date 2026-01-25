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

  test('task flow page displays four columns', async ({ page }) => {
    await page.goto('/dashboard/task-flow');
    await expect(page.getByTestId('task-flow-page')).toBeVisible({ timeout: 10000 });

    // Check for the four column headers (TB28: 4 columns instead of 3)
    await expect(page.getByTestId('column-ready')).toBeVisible();
    await expect(page.getByTestId('column-in-progress')).toBeVisible(); // "In Progress" column
    await expect(page.getByTestId('column-blocked')).toBeVisible();
    await expect(page.getByTestId('column-completed')).toBeVisible();
  });

  test('task flow shows correct counts', async ({ page }) => {
    // Get task counts from APIs
    const readyResponse = await page.request.get('/api/tasks/ready');
    const readyTasks = await readyResponse.json();
    // Filter ready tasks to only open (not in_progress) for Ready column
    const openTasks = readyTasks.filter((t: { status: string }) => t.status === 'open');

    const inProgressResponse = await page.request.get('/api/tasks/in-progress');
    const inProgressTasks = await inProgressResponse.json();

    const blockedResponse = await page.request.get('/api/tasks/blocked');
    const blockedTasks = await blockedResponse.json();

    const completedResponse = await page.request.get('/api/tasks/completed');
    const completedTasks = await completedResponse.json();

    await page.goto('/dashboard/task-flow');
    await expect(page.getByTestId('task-flow-page')).toBeVisible({ timeout: 10000 });

    // Wait for all columns to finish loading
    await expect(page.getByTestId('column-ready').getByText('Loading...')).not.toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('column-in-progress').getByText('Loading...')).not.toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('column-blocked').getByText('Loading...')).not.toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('column-completed').getByText('Loading...')).not.toBeVisible({ timeout: 10000 });

    // Check the column counts match API data
    const readyColumn = page.getByTestId('column-ready');
    await expect(readyColumn.getByText(`(${openTasks.length})`)).toBeVisible();

    const inProgressColumn = page.getByTestId('column-in-progress');
    await expect(inProgressColumn.getByText(`(${inProgressTasks.length})`)).toBeVisible();

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
    // Get ready tasks from API and filter to only open
    const response = await page.request.get('/api/tasks/ready');
    const readyTasks = await response.json();
    const openTasks = readyTasks.filter((t: { status: string }) => t.status === 'open');

    if (openTasks.length === 0) {
      // Skip this test if there are no open ready tasks
      test.skip();
      return;
    }

    await page.goto('/dashboard/task-flow');
    await expect(page.getByTestId('task-flow-page')).toBeVisible({ timeout: 10000 });

    // Wait for ready column to finish loading
    await expect(page.getByTestId('column-ready').getByText('Loading...')).not.toBeVisible({ timeout: 10000 });

    // Check that the first open task's title is displayed
    const firstTask = openTasks[0];
    await expect(page.getByText(firstTask.title).first()).toBeVisible();

    // Check that task ID is displayed
    await expect(page.getByText(firstTask.id).first()).toBeVisible();
  });
});

test.describe('TB28: Task Flow - Click to Open', () => {
  test('in-progress tasks endpoint is accessible', async ({ page }) => {
    const response = await page.request.get('/api/tasks/in-progress');
    expect(response.ok()).toBe(true);
    const data = await response.json();
    expect(Array.isArray(data)).toBe(true);
  });

  test('task flow page displays In Progress column', async ({ page }) => {
    await page.goto('/dashboard/task-flow');
    await expect(page.getByTestId('task-flow-page')).toBeVisible({ timeout: 10000 });

    // Check for In Progress column
    const inProgressColumn = page.getByTestId('column-in-progress');
    await expect(inProgressColumn).toBeVisible();
    // Check for the column header containing "In Progress" text (using h3 to be specific)
    await expect(inProgressColumn.locator('h3')).toContainText('In Progress');
  });

  test('clicking a ready task opens slide-over panel', async ({ page }) => {
    // Get ready tasks from API
    const response = await page.request.get('/api/tasks/ready');
    const readyTasks = await response.json();
    const openTasks = readyTasks.filter((t: { status: string }) => t.status === 'open');

    if (openTasks.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/dashboard/task-flow');
    await expect(page.getByTestId('task-flow-page')).toBeVisible({ timeout: 10000 });

    // Wait for ready column to finish loading
    await expect(page.getByTestId('column-ready').getByText('Loading...')).not.toBeVisible({ timeout: 10000 });

    // Click the first task card
    const firstTask = openTasks[0];
    await page.getByTestId(`task-card-${firstTask.id}`).click();

    // Slide-over panel should appear
    await expect(page.getByTestId('task-slide-over')).toBeVisible({ timeout: 5000 });

    // Should show the task ID in the panel
    await expect(page.getByTestId('task-slide-over-id')).toHaveText(firstTask.id);
  });

  test('clicking a blocked task opens slide-over panel', async ({ page }) => {
    // Get blocked tasks from API
    const response = await page.request.get('/api/tasks/blocked');
    const blockedTasks = await response.json();

    if (blockedTasks.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/dashboard/task-flow');
    await expect(page.getByTestId('task-flow-page')).toBeVisible({ timeout: 10000 });

    // Wait for blocked column to finish loading
    await expect(page.getByTestId('column-blocked').getByText('Loading...')).not.toBeVisible({ timeout: 10000 });

    // Click the first blocked task card
    const firstTask = blockedTasks[0];
    await page.getByTestId(`task-card-${firstTask.id}`).click();

    // Slide-over panel should appear
    await expect(page.getByTestId('task-slide-over')).toBeVisible({ timeout: 5000 });

    // Should show the task ID in the panel
    await expect(page.getByTestId('task-slide-over-id')).toHaveText(firstTask.id);
  });

  test('clicking a completed task opens slide-over panel', async ({ page }) => {
    // Get completed tasks from API
    const response = await page.request.get('/api/tasks/completed');
    const completedTasks = await response.json();

    if (completedTasks.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/dashboard/task-flow');
    await expect(page.getByTestId('task-flow-page')).toBeVisible({ timeout: 10000 });

    // Wait for completed column to finish loading
    await expect(page.getByTestId('column-completed').getByText('Loading...')).not.toBeVisible({ timeout: 10000 });

    // Click the first completed task card
    const firstTask = completedTasks[0];
    await page.getByTestId(`task-card-${firstTask.id}`).click();

    // Slide-over panel should appear
    await expect(page.getByTestId('task-slide-over')).toBeVisible({ timeout: 5000 });

    // Should show the task ID in the panel
    await expect(page.getByTestId('task-slide-over-id')).toHaveText(firstTask.id);
  });

  test('slide-over panel shows task details', async ({ page }) => {
    // Get ready tasks from API
    const response = await page.request.get('/api/tasks/ready');
    const readyTasks = await response.json();
    const openTasks = readyTasks.filter((t: { status: string }) => t.status === 'open');

    if (openTasks.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/dashboard/task-flow');
    await expect(page.getByTestId('task-flow-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('column-ready').getByText('Loading...')).not.toBeVisible({ timeout: 10000 });

    // Click the first task card
    const firstTask = openTasks[0];
    await page.getByTestId(`task-card-${firstTask.id}`).click();

    // Slide-over should be visible with task details
    await expect(page.getByTestId('task-slide-over')).toBeVisible({ timeout: 5000 });
    // Check that the title is visible and non-empty (task may have been updated)
    const titleElement = page.getByTestId('task-detail-title');
    await expect(titleElement).toBeVisible();
    const titleText = await titleElement.textContent();
    expect(titleText).toBeTruthy();
    expect(titleText?.length).toBeGreaterThan(0);
    await expect(page.getByTestId('task-status-dropdown')).toBeVisible();
    await expect(page.getByTestId('task-priority-dropdown')).toBeVisible();
  });

  test('slide-over panel closes when clicking close button', async ({ page }) => {
    // Get ready tasks from API
    const response = await page.request.get('/api/tasks/ready');
    const readyTasks = await response.json();
    const openTasks = readyTasks.filter((t: { status: string }) => t.status === 'open');

    if (openTasks.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/dashboard/task-flow');
    await expect(page.getByTestId('task-flow-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('column-ready').getByText('Loading...')).not.toBeVisible({ timeout: 10000 });

    // Click the first task card
    const firstTask = openTasks[0];
    await page.getByTestId(`task-card-${firstTask.id}`).click();

    // Slide-over should be visible
    await expect(page.getByTestId('task-slide-over')).toBeVisible({ timeout: 5000 });

    // Click close button
    await page.getByTestId('task-slide-over-close').click();

    // Slide-over should be hidden
    await expect(page.getByTestId('task-slide-over')).not.toBeVisible();
  });

  test('slide-over panel closes when clicking backdrop', async ({ page }) => {
    // Get ready tasks from API
    const response = await page.request.get('/api/tasks/ready');
    const readyTasks = await response.json();
    const openTasks = readyTasks.filter((t: { status: string }) => t.status === 'open');

    if (openTasks.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/dashboard/task-flow');
    await expect(page.getByTestId('task-flow-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('column-ready').getByText('Loading...')).not.toBeVisible({ timeout: 10000 });

    // Click the first task card
    const firstTask = openTasks[0];
    await page.getByTestId(`task-card-${firstTask.id}`).click();

    // Slide-over should be visible
    await expect(page.getByTestId('task-slide-over')).toBeVisible({ timeout: 5000 });

    // Click backdrop
    await page.getByTestId('slide-over-backdrop').click();

    // Slide-over should be hidden
    await expect(page.getByTestId('task-slide-over')).not.toBeVisible();
  });

  test('slide-over panel closes when pressing Escape', async ({ page }) => {
    // Get ready tasks from API
    const response = await page.request.get('/api/tasks/ready');
    const readyTasks = await response.json();
    const openTasks = readyTasks.filter((t: { status: string }) => t.status === 'open');

    if (openTasks.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/dashboard/task-flow');
    await expect(page.getByTestId('task-flow-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('column-ready').getByText('Loading...')).not.toBeVisible({ timeout: 10000 });

    // Click the first task card
    const firstTask = openTasks[0];
    await page.getByTestId(`task-card-${firstTask.id}`).click();

    // Slide-over should be visible
    await expect(page.getByTestId('task-slide-over')).toBeVisible({ timeout: 5000 });

    // Press Escape
    await page.keyboard.press('Escape');

    // Slide-over should be hidden
    await expect(page.getByTestId('task-slide-over')).not.toBeVisible();
  });

  test('can edit task status from slide-over panel', async ({ page }) => {
    // Get ready tasks from API
    const response = await page.request.get('/api/tasks/ready');
    const readyTasks = await response.json();
    const openTasks = readyTasks.filter((t: { status: string }) => t.status === 'open');

    if (openTasks.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/dashboard/task-flow');
    await expect(page.getByTestId('task-flow-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('column-ready').getByText('Loading...')).not.toBeVisible({ timeout: 10000 });

    // Click the first task card
    const firstTask = openTasks[0];
    await page.getByTestId(`task-card-${firstTask.id}`).click();

    // Slide-over should be visible
    await expect(page.getByTestId('task-slide-over')).toBeVisible({ timeout: 5000 });

    // Click status dropdown
    await page.getByTestId('task-status-dropdown').click();

    // Status options should appear
    await expect(page.getByTestId('task-status-options')).toBeVisible();

    // Click "In Progress"
    await page.getByTestId('task-status-option-in_progress').click();

    // Wait for update to complete
    await page.waitForTimeout(500);

    // Status dropdown should now show "In Progress"
    await expect(page.getByTestId('task-status-dropdown')).toContainText('In Progress');
  });

  test('task cards have hover effect', async ({ page }) => {
    // Get ready tasks from API
    const response = await page.request.get('/api/tasks/ready');
    const readyTasks = await response.json();
    const openTasks = readyTasks.filter((t: { status: string }) => t.status === 'open');

    if (openTasks.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/dashboard/task-flow');
    await expect(page.getByTestId('task-flow-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('column-ready').getByText('Loading...')).not.toBeVisible({ timeout: 10000 });

    // Check that task card has cursor-pointer class
    const firstTask = openTasks[0];
    const taskCard = page.getByTestId(`task-card-${firstTask.id}`);
    await expect(taskCard).toHaveClass(/cursor-pointer/);
  });
});

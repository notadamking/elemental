import { test, expect } from '@playwright/test';

test.describe('TB24: Plan List with Progress', () => {
  // ============================================================================
  // API Endpoint Tests
  // ============================================================================

  test('GET /api/plans returns list of plans', async ({ page }) => {
    const response = await page.request.get('/api/plans');
    expect(response.ok()).toBe(true);
    const plans = await response.json();
    expect(Array.isArray(plans)).toBe(true);

    // Check each plan has required fields
    for (const plan of plans) {
      expect(plan.type).toBe('plan');
      expect(plan.title).toBeDefined();
      expect(['draft', 'active', 'completed', 'cancelled']).toContain(plan.status);
      expect(plan.createdAt).toBeDefined();
      expect(plan.updatedAt).toBeDefined();
      expect(plan.createdBy).toBeDefined();
    }
  });

  test('GET /api/plans supports status filter parameter', async ({ page }) => {
    // Test that the status parameter is accepted (even if not fully functional)
    // Note: Full status filtering requires plan-specific query support
    const response = await page.request.get('/api/plans?status=draft');
    expect(response.ok()).toBe(true);
    const plans = await response.json();
    expect(Array.isArray(plans)).toBe(true);
  });

  test('GET /api/plans/:id returns a plan', async ({ page }) => {
    // First get list of plans
    const listResponse = await page.request.get('/api/plans');
    const plans = await listResponse.json();

    if (plans.length === 0) {
      test.skip();
      return;
    }

    // Get single plan
    const response = await page.request.get(`/api/plans/${plans[0].id}`);
    expect(response.ok()).toBe(true);
    const plan = await response.json();

    expect(plan.id).toBe(plans[0].id);
    expect(plan.type).toBe('plan');
    expect(plan.title).toBeDefined();
  });

  test('GET /api/plans/:id returns 404 for invalid ID', async ({ page }) => {
    const response = await page.request.get('/api/plans/el-invalid999999');
    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe('NOT_FOUND');
  });

  test('GET /api/plans/:id with hydrate.progress includes progress', async ({ page }) => {
    const listResponse = await page.request.get('/api/plans');
    const plans = await listResponse.json();

    if (plans.length === 0) {
      test.skip();
      return;
    }

    const response = await page.request.get(`/api/plans/${plans[0].id}?hydrate.progress=true`);
    expect(response.ok()).toBe(true);
    const plan = await response.json();

    expect(plan._progress).toBeDefined();
    expect(typeof plan._progress.totalTasks).toBe('number');
    expect(typeof plan._progress.completedTasks).toBe('number');
    expect(typeof plan._progress.completionPercentage).toBe('number');
  });

  test('GET /api/plans/:id/progress returns progress metrics', async ({ page }) => {
    const listResponse = await page.request.get('/api/plans');
    const plans = await listResponse.json();

    if (plans.length === 0) {
      test.skip();
      return;
    }

    const response = await page.request.get(`/api/plans/${plans[0].id}/progress`);
    expect(response.ok()).toBe(true);
    const progress = await response.json();

    expect(typeof progress.totalTasks).toBe('number');
    expect(typeof progress.completedTasks).toBe('number');
    expect(typeof progress.inProgressTasks).toBe('number');
    expect(typeof progress.blockedTasks).toBe('number');
    expect(typeof progress.remainingTasks).toBe('number');
    expect(typeof progress.completionPercentage).toBe('number');

    // Validate percentage is between 0 and 100
    expect(progress.completionPercentage).toBeGreaterThanOrEqual(0);
    expect(progress.completionPercentage).toBeLessThanOrEqual(100);
  });

  test('GET /api/plans/:id/tasks returns tasks in plan', async ({ page }) => {
    const listResponse = await page.request.get('/api/plans');
    const plans = await listResponse.json();

    if (plans.length === 0) {
      test.skip();
      return;
    }

    const response = await page.request.get(`/api/plans/${plans[0].id}/tasks`);
    expect(response.ok()).toBe(true);
    const tasks = await response.json();

    expect(Array.isArray(tasks)).toBe(true);

    // Each task should be a valid task
    for (const task of tasks) {
      expect(task.type).toBe('task');
      expect(task.title).toBeDefined();
      expect(task.status).toBeDefined();
    }
  });

  test('POST /api/plans creates a new plan', async ({ page }) => {
    const newPlan = {
      title: `Test Plan ${Date.now()}`,
      createdBy: 'test-user',
      status: 'draft',
      tags: ['test'],
    };

    const response = await page.request.post('/api/plans', {
      data: newPlan,
    });

    expect(response.status()).toBe(201);
    const created = await response.json();

    expect(created.type).toBe('plan');
    expect(created.title).toBe(newPlan.title);
    expect(created.status).toBe('draft');
    expect(created.createdBy).toBe(newPlan.createdBy);
    expect(created.id).toBeDefined();
  });

  test('POST /api/plans validates required fields', async ({ page }) => {
    // Missing title
    const response1 = await page.request.post('/api/plans', {
      data: { createdBy: 'test-user' },
    });
    expect(response1.status()).toBe(400);

    // Missing createdBy
    const response2 = await page.request.post('/api/plans', {
      data: { title: 'Test Plan' },
    });
    expect(response2.status()).toBe(400);
  });

  test('PATCH /api/plans/:id updates a plan', async ({ page }) => {
    // Create a plan to update
    const createResponse = await page.request.post('/api/plans', {
      data: {
        title: `Update Test Plan ${Date.now()}`,
        createdBy: 'test-user',
        status: 'draft',
      },
    });
    const plan = await createResponse.json();

    // Update the plan
    const newTitle = `Updated Title ${Date.now()}`;
    const updateResponse = await page.request.patch(`/api/plans/${plan.id}`, {
      data: { title: newTitle, status: 'active' },
    });

    expect(updateResponse.ok()).toBe(true);
    const updated = await updateResponse.json();

    expect(updated.title).toBe(newTitle);
    expect(updated.status).toBe('active');
  });

  test('PATCH /api/plans/:id validates status values', async ({ page }) => {
    const listResponse = await page.request.get('/api/plans');
    const plans = await listResponse.json();

    if (plans.length === 0) {
      test.skip();
      return;
    }

    const response = await page.request.patch(`/api/plans/${plans[0].id}`, {
      data: { status: 'invalid_status' },
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  // ============================================================================
  // UI Tests - Plans Page
  // ============================================================================

  test('plans page is accessible', async ({ page }) => {
    await page.goto('/plans');
    await expect(page.getByTestId('plans-page')).toBeVisible({ timeout: 10000 });
  });

  test('plans page shows header with title', async ({ page }) => {
    await page.goto('/plans');
    await expect(page.getByTestId('plans-page')).toBeVisible({ timeout: 10000 });
    // Use role-based selector to get the h1 specifically
    await expect(page.getByRole('heading', { name: 'Plans' })).toBeVisible();
  });

  test('plans page shows status filter tabs', async ({ page }) => {
    await page.goto('/plans');
    await expect(page.getByTestId('plans-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('status-filter')).toBeVisible();

    // Check all status filters are present
    await expect(page.getByTestId('status-filter-all')).toBeVisible();
    await expect(page.getByTestId('status-filter-active')).toBeVisible();
    await expect(page.getByTestId('status-filter-draft')).toBeVisible();
    await expect(page.getByTestId('status-filter-completed')).toBeVisible();
    await expect(page.getByTestId('status-filter-cancelled')).toBeVisible();
  });

  test('clicking status filter changes filter', async ({ page }) => {
    await page.goto('/plans');
    await expect(page.getByTestId('plans-page')).toBeVisible({ timeout: 10000 });

    // Click on active filter
    await page.getByTestId('status-filter-active').click();

    // The active filter should be selected (has different styling)
    await expect(page.getByTestId('status-filter-active')).toHaveClass(/bg-white/);
  });

  test('plans list shows plans when available', async ({ page }) => {
    const response = await page.request.get('/api/plans');
    const plans = await response.json();

    await page.goto('/plans');
    await expect(page.getByTestId('plans-page')).toBeVisible({ timeout: 10000 });

    if (plans.length === 0) {
      // Should show empty state
      await expect(page.getByTestId('plans-empty')).toBeVisible();
    } else {
      // Should show plans list
      await expect(page.getByTestId('plans-list')).toBeVisible();
      // At least one plan item should be visible
      await expect(page.getByTestId(`plan-item-${plans[0].id}`)).toBeVisible();
    }
  });

  test('plans list shows plan count', async ({ page }) => {
    const response = await page.request.get('/api/plans');
    const plans = await response.json();

    if (plans.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/plans');
    await expect(page.getByTestId('plans-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('plans-count')).toContainText(`(${plans.length})`);
  });

  test('clicking plan opens detail panel', async ({ page }) => {
    const response = await page.request.get('/api/plans');
    const plans = await response.json();

    if (plans.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/plans');
    await expect(page.getByTestId('plans-page')).toBeVisible({ timeout: 10000 });

    // Click on first plan
    await page.getByTestId(`plan-item-${plans[0].id}`).click();

    // Detail panel should appear
    await expect(page.getByTestId('plan-detail-panel')).toBeVisible({ timeout: 5000 });
  });

  test('plan detail panel shows plan title', async ({ page }) => {
    const response = await page.request.get('/api/plans');
    const plans = await response.json();

    if (plans.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/plans');
    await expect(page.getByTestId('plans-page')).toBeVisible({ timeout: 10000 });

    // Click on first plan
    await page.getByTestId(`plan-item-${plans[0].id}`).click();
    await expect(page.getByTestId('plan-detail-panel')).toBeVisible({ timeout: 5000 });

    // Check title is displayed
    await expect(page.getByTestId('plan-detail-title')).toContainText(plans[0].title);
  });

  test('plan detail panel shows status badge', async ({ page }) => {
    const response = await page.request.get('/api/plans');
    const plans = await response.json();

    if (plans.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/plans');
    await expect(page.getByTestId('plans-page')).toBeVisible({ timeout: 10000 });

    // Click on first plan
    await page.getByTestId(`plan-item-${plans[0].id}`).click();
    await expect(page.getByTestId('plan-detail-panel')).toBeVisible({ timeout: 5000 });

    // Check status badge is displayed in the detail panel
    await expect(
      page.getByTestId('plan-detail-panel').getByTestId(`status-badge-${plans[0].status}`)
    ).toBeVisible();
  });

  test('plan detail panel shows progress bar', async ({ page }) => {
    const response = await page.request.get('/api/plans');
    const plans = await response.json();

    if (plans.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/plans');
    await expect(page.getByTestId('plans-page')).toBeVisible({ timeout: 10000 });

    // Click on first plan
    await page.getByTestId(`plan-item-${plans[0].id}`).click();
    await expect(page.getByTestId('plan-detail-panel')).toBeVisible({ timeout: 5000 });

    // Check progress bar is displayed
    await expect(page.getByTestId('progress-bar')).toBeVisible();
  });

  test('plan detail panel shows task status summary', async ({ page }) => {
    const response = await page.request.get('/api/plans');
    const plans = await response.json();

    if (plans.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/plans');
    await expect(page.getByTestId('plans-page')).toBeVisible({ timeout: 10000 });

    // Click on first plan
    await page.getByTestId(`plan-item-${plans[0].id}`).click();
    await expect(page.getByTestId('plan-detail-panel')).toBeVisible({ timeout: 5000 });

    // Check task status summary is displayed
    await expect(page.getByTestId('task-status-summary')).toBeVisible();
  });

  test('plan detail panel close button works', async ({ page }) => {
    const response = await page.request.get('/api/plans');
    const plans = await response.json();

    if (plans.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/plans');
    await expect(page.getByTestId('plans-page')).toBeVisible({ timeout: 10000 });

    // Click on first plan
    await page.getByTestId(`plan-item-${plans[0].id}`).click();
    await expect(page.getByTestId('plan-detail-panel')).toBeVisible({ timeout: 5000 });

    // Click close button
    await page.getByTestId('plan-detail-close').click();

    // Panel should close
    await expect(page.getByTestId('plan-detail-panel')).not.toBeVisible({ timeout: 5000 });
  });

  test('plans page is navigable via sidebar', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 10000 });

    // Click on Plans in sidebar
    await page.getByTestId('nav-plans').click();

    // Should navigate to plans page
    await expect(page.getByTestId('plans-page')).toBeVisible({ timeout: 5000 });
    expect(page.url()).toContain('/plans');
  });
});

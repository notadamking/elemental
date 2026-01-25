import { test, expect } from '@playwright/test';

test.describe('TB25: Workflow List + Pour', () => {
  // ============================================================================
  // API Endpoint Tests
  // ============================================================================

  test('GET /api/workflows returns list of workflows', async ({ page }) => {
    const response = await page.request.get('/api/workflows');
    expect(response.ok()).toBe(true);
    const workflows = await response.json();
    expect(Array.isArray(workflows)).toBe(true);

    // Check each workflow has required fields
    for (const workflow of workflows) {
      expect(workflow.type).toBe('workflow');
      expect(workflow.title).toBeDefined();
      expect(['pending', 'running', 'completed', 'failed', 'cancelled']).toContain(workflow.status);
      expect(workflow.createdAt).toBeDefined();
      expect(workflow.updatedAt).toBeDefined();
      expect(workflow.createdBy).toBeDefined();
    }
  });

  test('GET /api/workflows supports status filter parameter', async ({ page }) => {
    // Test that the status parameter is accepted
    const response = await page.request.get('/api/workflows?status=pending');
    expect(response.ok()).toBe(true);
    const workflows = await response.json();
    expect(Array.isArray(workflows)).toBe(true);
  });

  test('GET /api/workflows/:id returns a workflow', async ({ page }) => {
    // First get list of workflows
    const listResponse = await page.request.get('/api/workflows');
    const workflows = await listResponse.json();

    if (workflows.length === 0) {
      test.skip();
      return;
    }

    // Get single workflow
    const response = await page.request.get(`/api/workflows/${workflows[0].id}`);
    expect(response.ok()).toBe(true);
    const workflow = await response.json();

    expect(workflow.id).toBe(workflows[0].id);
    expect(workflow.type).toBe('workflow');
    expect(workflow.title).toBeDefined();
  });

  test('GET /api/workflows/:id returns 404 for invalid ID', async ({ page }) => {
    const response = await page.request.get('/api/workflows/el-invalid999999');
    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe('NOT_FOUND');
  });

  test('GET /api/workflows/:id with hydrate.progress includes progress', async ({ page }) => {
    const listResponse = await page.request.get('/api/workflows');
    const workflows = await listResponse.json();

    if (workflows.length === 0) {
      test.skip();
      return;
    }

    const response = await page.request.get(`/api/workflows/${workflows[0].id}?hydrate.progress=true`);
    expect(response.ok()).toBe(true);
    const workflow = await response.json();

    expect(workflow._progress).toBeDefined();
    expect(typeof workflow._progress.totalTasks).toBe('number');
    expect(typeof workflow._progress.completionPercentage).toBe('number');
  });

  test('GET /api/workflows/:id/progress returns progress metrics', async ({ page }) => {
    const listResponse = await page.request.get('/api/workflows');
    const workflows = await listResponse.json();

    if (workflows.length === 0) {
      test.skip();
      return;
    }

    const response = await page.request.get(`/api/workflows/${workflows[0].id}/progress`);
    expect(response.ok()).toBe(true);
    const progress = await response.json();

    expect(typeof progress.totalTasks).toBe('number');
    expect(typeof progress.completionPercentage).toBe('number');
    expect(typeof progress.readyTasks).toBe('number');
    expect(typeof progress.blockedTasks).toBe('number');

    // Validate percentage is between 0 and 100
    expect(progress.completionPercentage).toBeGreaterThanOrEqual(0);
    expect(progress.completionPercentage).toBeLessThanOrEqual(100);
  });

  test('GET /api/workflows/:id/tasks returns tasks in workflow', async ({ page }) => {
    const listResponse = await page.request.get('/api/workflows');
    const workflows = await listResponse.json();

    if (workflows.length === 0) {
      test.skip();
      return;
    }

    const response = await page.request.get(`/api/workflows/${workflows[0].id}/tasks`);
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

  test('POST /api/workflows creates a new workflow', async ({ page }) => {
    const newWorkflow = {
      title: `Test Workflow ${Date.now()}`,
      createdBy: 'test-user',
      status: 'pending',
      ephemeral: false,
      tags: ['test'],
    };

    const response = await page.request.post('/api/workflows', {
      data: newWorkflow,
    });

    expect(response.status()).toBe(201);
    const created = await response.json();

    expect(created.type).toBe('workflow');
    expect(created.title).toBe(newWorkflow.title);
    expect(created.status).toBe('pending');
    expect(created.createdBy).toBe(newWorkflow.createdBy);
    expect(created.id).toBeDefined();
  });

  test('POST /api/workflows validates required fields', async ({ page }) => {
    // Missing title
    const response1 = await page.request.post('/api/workflows', {
      data: { createdBy: 'test-user' },
    });
    expect(response1.status()).toBe(400);

    // Missing createdBy
    const response2 = await page.request.post('/api/workflows', {
      data: { title: 'Test Workflow' },
    });
    expect(response2.status()).toBe(400);
  });

  test('POST /api/workflows/pour creates workflow from playbook', async ({ page }) => {
    const playbook = {
      name: 'Test Playbook',
      version: '1.0.0',
      variables: [],
      steps: [
        { id: 'step-1', title: 'First Step', priority: 3 },
        { id: 'step-2', title: 'Second Step', priority: 2 },
      ],
    };

    const response = await page.request.post('/api/workflows/pour', {
      data: {
        playbook,
        createdBy: 'test-user',
        title: `Poured Workflow ${Date.now()}`,
      },
    });

    expect(response.status()).toBe(201);
    const result = await response.json();

    expect(result.workflow).toBeDefined();
    expect(result.workflow.type).toBe('workflow');
    expect(result.tasks).toBeDefined();
    expect(Array.isArray(result.tasks)).toBe(true);
    expect(result.tasks.length).toBe(2);
  });

  test('POST /api/workflows/pour validates required fields', async ({ page }) => {
    // Missing playbook
    const response1 = await page.request.post('/api/workflows/pour', {
      data: { createdBy: 'test-user' },
    });
    expect(response1.status()).toBe(400);

    // Missing createdBy
    const response2 = await page.request.post('/api/workflows/pour', {
      data: { playbook: { name: 'Test', version: '1.0.0', variables: [], steps: [] } },
    });
    expect(response2.status()).toBe(400);
  });

  test('PATCH /api/workflows/:id updates a workflow', async ({ page }) => {
    // Create a workflow to update
    const createResponse = await page.request.post('/api/workflows', {
      data: {
        title: `Update Test Workflow ${Date.now()}`,
        createdBy: 'test-user',
        status: 'pending',
      },
    });
    const workflow = await createResponse.json();

    // Update the workflow
    const newTitle = `Updated Workflow Title ${Date.now()}`;
    const updateResponse = await page.request.patch(`/api/workflows/${workflow.id}`, {
      data: { title: newTitle, status: 'running' },
    });

    expect(updateResponse.ok()).toBe(true);
    const updated = await updateResponse.json();

    expect(updated.title).toBe(newTitle);
    expect(updated.status).toBe('running');
  });

  test('PATCH /api/workflows/:id validates status values', async ({ page }) => {
    const listResponse = await page.request.get('/api/workflows');
    const workflows = await listResponse.json();

    if (workflows.length === 0) {
      test.skip();
      return;
    }

    const response = await page.request.patch(`/api/workflows/${workflows[0].id}`, {
      data: { status: 'invalid_status' },
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  // ============================================================================
  // UI Tests - Workflows Page
  // ============================================================================

  test('workflows page is accessible', async ({ page }) => {
    await page.goto('/workflows');
    await expect(page.getByTestId('workflows-page')).toBeVisible({ timeout: 10000 });
  });

  test('workflows page shows header with title', async ({ page }) => {
    await page.goto('/workflows');
    await expect(page.getByTestId('workflows-page')).toBeVisible({ timeout: 10000 });
    // Use role-based selector to get the h1 specifically
    await expect(page.getByRole('heading', { name: 'Workflows' })).toBeVisible();
  });

  test('workflows page shows status filter tabs', async ({ page }) => {
    await page.goto('/workflows');
    await expect(page.getByTestId('workflows-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('workflow-status-filter')).toBeVisible();

    // Check all status filters are present
    await expect(page.getByTestId('workflow-status-filter-all')).toBeVisible();
    await expect(page.getByTestId('workflow-status-filter-running')).toBeVisible();
    await expect(page.getByTestId('workflow-status-filter-pending')).toBeVisible();
    await expect(page.getByTestId('workflow-status-filter-completed')).toBeVisible();
  });

  test('workflows page shows pour workflow button', async ({ page }) => {
    await page.goto('/workflows');
    await expect(page.getByTestId('workflows-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('pour-workflow-button')).toBeVisible();
  });

  test('clicking pour workflow button opens modal', async ({ page }) => {
    await page.goto('/workflows');
    await expect(page.getByTestId('workflows-page')).toBeVisible({ timeout: 10000 });

    await page.getByTestId('pour-workflow-button').click();
    await expect(page.getByTestId('pour-workflow-modal')).toBeVisible({ timeout: 5000 });
  });

  test('pour workflow modal has input fields', async ({ page }) => {
    await page.goto('/workflows');
    await expect(page.getByTestId('workflows-page')).toBeVisible({ timeout: 10000 });

    await page.getByTestId('pour-workflow-button').click();
    await expect(page.getByTestId('pour-workflow-modal')).toBeVisible({ timeout: 5000 });

    await expect(page.getByTestId('pour-title-input')).toBeVisible();
    await expect(page.getByTestId('pour-playbook-input')).toBeVisible();
    await expect(page.getByTestId('pour-submit-button')).toBeVisible();
  });

  test('pour workflow modal can be closed', async ({ page }) => {
    await page.goto('/workflows');
    await expect(page.getByTestId('workflows-page')).toBeVisible({ timeout: 10000 });

    await page.getByTestId('pour-workflow-button').click();
    await expect(page.getByTestId('pour-workflow-modal')).toBeVisible({ timeout: 5000 });

    await page.getByTestId('pour-modal-close').click();
    await expect(page.getByTestId('pour-workflow-modal')).not.toBeVisible({ timeout: 5000 });
  });

  test('clicking status filter changes filter', async ({ page }) => {
    await page.goto('/workflows');
    await expect(page.getByTestId('workflows-page')).toBeVisible({ timeout: 10000 });

    // Click on running filter
    await page.getByTestId('workflow-status-filter-running').click();

    // The running filter should be selected (has different styling)
    await expect(page.getByTestId('workflow-status-filter-running')).toHaveClass(/bg-white/);
  });

  test('workflows list shows workflows when available', async ({ page }) => {
    const response = await page.request.get('/api/workflows');
    const workflows = await response.json();

    await page.goto('/workflows');
    await expect(page.getByTestId('workflows-page')).toBeVisible({ timeout: 10000 });

    if (workflows.length === 0) {
      // Should show empty state
      await expect(page.getByTestId('workflows-empty')).toBeVisible();
    } else {
      // Should show workflows list
      await expect(page.getByTestId('workflows-list')).toBeVisible();
      // At least one workflow item should be visible
      await expect(page.getByTestId(`workflow-item-${workflows[0].id}`)).toBeVisible();
    }
  });

  test('clicking workflow opens detail panel', async ({ page }) => {
    const response = await page.request.get('/api/workflows');
    const workflows = await response.json();

    if (workflows.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/workflows');
    await expect(page.getByTestId('workflows-page')).toBeVisible({ timeout: 10000 });

    // Click on first workflow
    await page.getByTestId(`workflow-item-${workflows[0].id}`).click();

    // Detail panel should appear
    await expect(page.getByTestId('workflow-detail-panel')).toBeVisible({ timeout: 5000 });
  });

  test('workflow detail panel shows workflow title', async ({ page }) => {
    const response = await page.request.get('/api/workflows');
    const workflows = await response.json();

    if (workflows.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/workflows');
    await expect(page.getByTestId('workflows-page')).toBeVisible({ timeout: 10000 });

    // Click on first workflow
    await page.getByTestId(`workflow-item-${workflows[0].id}`).click();
    await expect(page.getByTestId('workflow-detail-panel')).toBeVisible({ timeout: 5000 });

    // Check title is displayed
    await expect(page.getByTestId('workflow-detail-title')).toContainText(workflows[0].title);
  });

  test('workflow detail panel shows status badge', async ({ page }) => {
    const response = await page.request.get('/api/workflows');
    const workflows = await response.json();

    if (workflows.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/workflows');
    await expect(page.getByTestId('workflows-page')).toBeVisible({ timeout: 10000 });

    // Click on first workflow
    await page.getByTestId(`workflow-item-${workflows[0].id}`).click();
    await expect(page.getByTestId('workflow-detail-panel')).toBeVisible({ timeout: 5000 });

    // Check status badge is displayed in the detail panel
    await expect(
      page.getByTestId('workflow-detail-panel').getByTestId(`workflow-status-badge-${workflows[0].status}`)
    ).toBeVisible();
  });

  test('workflow detail panel close button works', async ({ page }) => {
    const response = await page.request.get('/api/workflows');
    const workflows = await response.json();

    if (workflows.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/workflows');
    await expect(page.getByTestId('workflows-page')).toBeVisible({ timeout: 10000 });

    // Click on first workflow
    await page.getByTestId(`workflow-item-${workflows[0].id}`).click();
    await expect(page.getByTestId('workflow-detail-panel')).toBeVisible({ timeout: 5000 });

    // Click close button
    await page.getByTestId('workflow-detail-close').click();

    // Panel should close
    await expect(page.getByTestId('workflow-detail-panel')).not.toBeVisible({ timeout: 5000 });
  });

  test('workflows page is navigable via sidebar', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 10000 });

    // Click on Workflows in sidebar
    await page.getByTestId('nav-workflows').click();

    // Should navigate to workflows page
    await expect(page.getByTestId('workflows-page')).toBeVisible({ timeout: 5000 });
    expect(page.url()).toContain('/workflows');
  });

  test('pouring a workflow creates it and shows in list', async ({ page }) => {
    await page.goto('/workflows');
    await expect(page.getByTestId('workflows-page')).toBeVisible({ timeout: 10000 });

    // Get initial count
    const beforeResponse = await page.request.get('/api/workflows');
    const beforeWorkflows = await beforeResponse.json();
    const beforeCount = beforeWorkflows.length;

    // Open pour modal
    await page.getByTestId('pour-workflow-button').click();
    await expect(page.getByTestId('pour-workflow-modal')).toBeVisible({ timeout: 5000 });

    // Fill in the form
    const timestamp = Date.now();
    await page.getByTestId('pour-title-input').fill(`E2E Test Workflow ${timestamp}`);
    await page.getByTestId('pour-playbook-input').fill(`Test Playbook ${timestamp}`);

    // Submit
    await page.getByTestId('pour-submit-button').click();

    // Modal should close
    await expect(page.getByTestId('pour-workflow-modal')).not.toBeVisible({ timeout: 10000 });

    // Verify via API that workflow was created
    const afterResponse = await page.request.get('/api/workflows');
    const afterWorkflows = await afterResponse.json();
    expect(afterWorkflows.length).toBeGreaterThan(beforeCount);
  });
});

import { test, expect } from '@playwright/test';

test.describe('TB7: Agent Activity Lens', () => {
  test('entities endpoint is accessible', async ({ page }) => {
    const response = await page.request.get('/api/entities');
    expect(response.ok()).toBe(true);
    const data = await response.json();
    expect(Array.isArray(data)).toBe(true);
  });

  test('agent activity page is accessible via navigation', async ({ page }) => {
    await page.goto('/dashboard/agents');
    await expect(page.getByTestId('agent-activity-page')).toBeVisible({ timeout: 10000 });
  });

  test('sidebar has Agents nav item', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByTestId('sidebar')).toBeVisible({ timeout: 10000 });

    // Check for Agents link in sidebar
    const agentsLink = page.getByRole('link', { name: /Agents/i });
    await expect(agentsLink).toBeVisible();
  });

  test('can navigate to Agents from sidebar', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByTestId('sidebar')).toBeVisible({ timeout: 10000 });

    // Click Agents link
    await page.getByRole('link', { name: /Agents/i }).click();

    // Should be on agents page
    await expect(page.getByTestId('agent-activity-page')).toBeVisible({ timeout: 10000 });
    await expect(page).toHaveURL('/dashboard/agents');
  });

  test('agent activity page shows appropriate content based on entities', async ({ page }) => {
    // Get entities from API
    const response = await page.request.get('/api/entities');
    const entities = await response.json();

    await page.goto('/dashboard/agents');
    await expect(page.getByTestId('agent-activity-page')).toBeVisible({ timeout: 10000 });

    // Wait for loading to complete
    await expect(page.getByText('Loading agents...')).not.toBeVisible({ timeout: 10000 });

    // Filter for agents/humans (not system)
    const agents = entities.filter((e: { entityType: string }) =>
      e.entityType === 'agent' || e.entityType === 'human'
    );

    if (agents.length === 0) {
      // Should show empty state
      await expect(page.getByText('No agents registered')).toBeVisible();
    } else {
      // Should show agent grid
      await expect(page.getByTestId('agent-grid')).toBeVisible();
      // Should show correct count in header
      await expect(page.getByText(new RegExp(`${agents.length} agent`))).toBeVisible();
    }
  });

  test('entity detail endpoint is accessible', async ({ page }) => {
    // First get entities
    const entitiesResponse = await page.request.get('/api/entities');
    const entities = await entitiesResponse.json();

    if (entities.length === 0) {
      test.skip();
      return;
    }

    // Get first entity by ID
    const firstEntity = entities[0];
    const response = await page.request.get(`/api/entities/${firstEntity.id}`);
    expect(response.ok()).toBe(true);
    const entity = await response.json();
    expect(entity.id).toBe(firstEntity.id);
  });

  test('entity tasks endpoint is accessible', async ({ page }) => {
    // First get entities
    const entitiesResponse = await page.request.get('/api/entities');
    const entities = await entitiesResponse.json();

    if (entities.length === 0) {
      test.skip();
      return;
    }

    // Get tasks for first entity
    const firstEntity = entities[0];
    const response = await page.request.get(`/api/entities/${firstEntity.id}/tasks`);
    expect(response.ok()).toBe(true);
    const tasks = await response.json();
    expect(Array.isArray(tasks)).toBe(true);
  });

  test('agent cards display when agents exist', async ({ page }) => {
    // Get entities from API
    const response = await page.request.get('/api/entities');
    const entities = await response.json();

    // Filter for agents/humans
    const agents = entities.filter((e: { entityType: string }) =>
      e.entityType === 'agent' || e.entityType === 'human'
    );

    if (agents.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/dashboard/agents');
    await expect(page.getByTestId('agent-activity-page')).toBeVisible({ timeout: 10000 });

    // Wait for loading to complete
    await expect(page.getByText('Loading agents...')).not.toBeVisible({ timeout: 10000 });

    // Check that first agent card is visible
    const firstAgent = agents[0];
    await expect(page.getByTestId(`agent-card-${firstAgent.id}`)).toBeVisible();
  });

  test('summary statistics are displayed', async ({ page }) => {
    await page.goto('/dashboard/agents');
    await expect(page.getByTestId('agent-activity-page')).toBeVisible({ timeout: 10000 });

    // Wait for loading to complete
    await expect(page.getByText('Loading agents...')).not.toBeVisible({ timeout: 10000 });

    // Check for summary section
    await expect(page.getByText('Summary')).toBeVisible();
    await expect(page.getByText('Ready Tasks')).toBeVisible();
  });
});

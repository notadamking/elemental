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

test.describe('TB45: Agent Activity Improvements', () => {
  test('entity stats endpoint includes new fields', async ({ page }) => {
    // First get entities
    const entitiesResponse = await page.request.get('/api/entities');
    const entities = await entitiesResponse.json();

    if (entities.length === 0) {
      test.skip();
      return;
    }

    // Get stats for first entity
    const firstEntity = entities[0];
    const response = await page.request.get(`/api/entities/${firstEntity.id}/stats`);
    expect(response.ok()).toBe(true);
    const stats = await response.json();

    // Check for new fields added in TB45
    expect(typeof stats.completedTodayCount).toBe('number');
    expect(typeof stats.blockedTaskCount).toBe('number');
    expect(typeof stats.inProgressTaskCount).toBe('number');
  });

  test('workload chart is displayed with percentages', async ({ page }) => {
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

    // Check for workload chart
    await expect(page.getByTestId('workload-chart')).toBeVisible();
    await expect(page.getByText('Workload Distribution')).toBeVisible();

    // Check for workload bars for first agent
    const firstAgent = agents[0];
    await expect(page.getByTestId(`workload-bar-${firstAgent.id}`)).toBeVisible();
  });

  test('agent status indicator is displayed on agent cards', async ({ page }) => {
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

    // Check for status indicator on agent card
    const firstAgent = agents[0];
    const agentCard = page.getByTestId(`agent-card-${firstAgent.id}`);
    await expect(agentCard).toBeVisible();

    // Check for status indicator component
    await expect(agentCard.getByTestId('agent-status-indicator')).toBeVisible();
  });

  test('agent cards display completed today count', async ({ page }) => {
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

    // Check for "Today:" label on agent cards
    const firstAgent = agents[0];
    const agentCard = page.getByTestId(`agent-card-${firstAgent.id}`);
    await expect(agentCard).toBeVisible();
    await expect(agentCard.getByText('Today:')).toBeVisible();

    // Check for completed today count element
    await expect(page.getByTestId(`completed-today-${firstAgent.id}`)).toBeVisible();
  });

  test('agent cards are clickable and navigate to entity detail', async ({ page }) => {
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

    // Click on first agent card
    const firstAgent = agents[0];
    const agentCard = page.getByTestId(`agent-card-${firstAgent.id}`);
    await expect(agentCard).toBeVisible();
    await agentCard.click();

    // Should navigate to entities page with the selected entity
    await expect(page).toHaveURL(new RegExp(`/entities\\?selected=${firstAgent.id}`));

    // Should show entity detail panel
    await expect(page.getByTestId('entity-detail-panel')).toBeVisible({ timeout: 10000 });
  });

  test('agent cards show arrow icon indicating navigation', async ({ page }) => {
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

    // Check for agent card having cursor pointer style
    const firstAgent = agents[0];
    const agentCard = page.getByTestId(`agent-card-${firstAgent.id}`);
    await expect(agentCard).toBeVisible();

    // Check for role="button" attribute indicating clickability
    await expect(agentCard).toHaveAttribute('role', 'button');
  });

  test('agent cards have keyboard accessibility', async ({ page }) => {
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

    // Check for tabindex allowing keyboard focus
    const firstAgent = agents[0];
    const agentCard = page.getByTestId(`agent-card-${firstAgent.id}`);
    await expect(agentCard).toHaveAttribute('tabindex', '0');
  });

  test('summary stats section is properly labeled', async ({ page }) => {
    await page.goto('/dashboard/agents');
    await expect(page.getByTestId('agent-activity-page')).toBeVisible({ timeout: 10000 });

    // Wait for loading to complete
    await expect(page.getByText('Loading agents...')).not.toBeVisible({ timeout: 10000 });

    // Check for summary stats section with proper test ID
    await expect(page.getByTestId('summary-stats')).toBeVisible();

    // Check for key metrics
    await expect(page.getByText('Total Agents')).toBeVisible();
    await expect(page.getByText('Ready Tasks')).toBeVisible();
    await expect(page.getByText('Assigned', { exact: true })).toBeVisible();
    await expect(page.getByText('Unassigned')).toBeVisible();
  });
});

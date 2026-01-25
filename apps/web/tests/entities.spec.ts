import { test, expect } from '@playwright/test';

test.describe('TB33: Entities Page - List View', () => {
  test('entities endpoint is accessible', async ({ page }) => {
    const response = await page.request.get('/api/entities');
    expect(response.ok()).toBe(true);
    const data = await response.json();
    expect(Array.isArray(data)).toBe(true);
  });

  test('entities page is accessible via navigation', async ({ page }) => {
    await page.goto('/entities');
    await expect(page.getByTestId('entities-page')).toBeVisible({ timeout: 10000 });
  });

  test('sidebar has Entities nav item', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByTestId('sidebar')).toBeVisible({ timeout: 10000 });

    // Check for Entities link in sidebar
    const entitiesLink = page.getByRole('link', { name: /Entities/i });
    await expect(entitiesLink).toBeVisible();
  });

  test('can navigate to Entities from sidebar', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByTestId('sidebar')).toBeVisible({ timeout: 10000 });

    // Click Entities link
    await page.getByRole('link', { name: /Entities/i }).click();

    // Should be on entities page
    await expect(page.getByTestId('entities-page')).toBeVisible({ timeout: 10000 });
    await expect(page).toHaveURL('/entities');
  });

  test('entities page shows filter tabs', async ({ page }) => {
    await page.goto('/entities');
    await expect(page.getByTestId('entities-page')).toBeVisible({ timeout: 10000 });

    // Check for filter tabs
    await expect(page.getByTestId('entity-filter-tabs')).toBeVisible();
    await expect(page.getByTestId('entity-filter-all')).toBeVisible();
    await expect(page.getByTestId('entity-filter-agent')).toBeVisible();
    await expect(page.getByTestId('entity-filter-human')).toBeVisible();
    await expect(page.getByTestId('entity-filter-system')).toBeVisible();
  });

  test('entities page shows search box', async ({ page }) => {
    await page.goto('/entities');
    await expect(page.getByTestId('entities-page')).toBeVisible({ timeout: 10000 });

    // Check for search box
    await expect(page.getByTestId('entity-search')).toBeVisible();
    await expect(page.getByTestId('entity-search-input')).toBeVisible();
  });

  test('entities page shows appropriate content based on entities', async ({ page }) => {
    // Get entities from API
    const response = await page.request.get('/api/entities');
    const entities = await response.json();

    await page.goto('/entities');
    await expect(page.getByTestId('entities-page')).toBeVisible({ timeout: 10000 });

    // Wait for loading to complete
    await expect(page.getByTestId('entities-loading')).not.toBeVisible({ timeout: 10000 });

    if (entities.length === 0) {
      // Should show empty state
      await expect(page.getByTestId('entities-empty')).toBeVisible();
      await expect(page.getByText('No entities registered')).toBeVisible();
    } else {
      // Should show entities grid
      await expect(page.getByTestId('entities-grid')).toBeVisible();
      // Should show correct count in header
      await expect(page.getByText(new RegExp(`${entities.length} of ${entities.length}`))).toBeVisible();
    }
  });

  test('filter by entity type works', async ({ page }) => {
    // Get entities from API
    const response = await page.request.get('/api/entities');
    const entities = await response.json();

    if (entities.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/entities');
    await expect(page.getByTestId('entities-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('entities-loading')).not.toBeVisible({ timeout: 10000 });

    // Count entities by type
    const agentCount = entities.filter((e: { entityType: string }) => e.entityType === 'agent').length;
    const humanCount = entities.filter((e: { entityType: string }) => e.entityType === 'human').length;
    const systemCount = entities.filter((e: { entityType: string }) => e.entityType === 'system').length;

    // Click on agents filter (if there are any)
    if (agentCount > 0) {
      await page.getByTestId('entity-filter-agent').click();
      await expect(page.getByText(new RegExp(`${agentCount} of ${entities.length}`))).toBeVisible();
    }

    // Click on humans filter (if there are any)
    if (humanCount > 0) {
      await page.getByTestId('entity-filter-human').click();
      await expect(page.getByText(new RegExp(`${humanCount} of ${entities.length}`))).toBeVisible();
    }

    // Click on systems filter (if there are any)
    if (systemCount > 0) {
      await page.getByTestId('entity-filter-system').click();
      await expect(page.getByText(new RegExp(`${systemCount} of ${entities.length}`))).toBeVisible();
    }

    // Click on all filter to reset
    await page.getByTestId('entity-filter-all').click();
    await expect(page.getByText(new RegExp(`${entities.length} of ${entities.length}`))).toBeVisible();
  });

  test('search filters entities by name', async ({ page }) => {
    // Get entities from API
    const response = await page.request.get('/api/entities');
    const entities = await response.json();

    if (entities.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/entities');
    await expect(page.getByTestId('entities-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('entities-loading')).not.toBeVisible({ timeout: 10000 });

    // Get first entity name
    const firstEntity = entities[0];
    const searchTerm = firstEntity.name.substring(0, 3);

    // Type in search box
    await page.getByTestId('entity-search-input').fill(searchTerm);

    // Wait for filtering to apply
    await page.waitForTimeout(100);

    // Should show filtered results
    const matchingEntities = entities.filter((e: { name: string; id: string; tags: string[] }) =>
      e.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      e.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      e.tags.some((tag: string) => tag.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    if (matchingEntities.length > 0) {
      await expect(page.getByTestId('entities-grid')).toBeVisible();
    }
  });

  test('entity cards display correct information', async ({ page }) => {
    // Get entities from API
    const response = await page.request.get('/api/entities');
    const entities = await response.json();

    if (entities.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/entities');
    await expect(page.getByTestId('entities-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('entities-loading')).not.toBeVisible({ timeout: 10000 });

    // Check first entity card
    const firstEntity = entities[0];
    const card = page.getByTestId(`entity-card-${firstEntity.id}`);
    await expect(card).toBeVisible();

    // Check for avatar
    await expect(page.getByTestId(`entity-avatar-${firstEntity.id}`)).toBeVisible();

    // Check for type badge
    await expect(page.getByTestId(`entity-type-badge-${firstEntity.id}`)).toBeVisible();
    await expect(page.getByTestId(`entity-type-badge-${firstEntity.id}`)).toHaveText(firstEntity.entityType);
  });

  test('search with no results shows empty state', async ({ page }) => {
    await page.goto('/entities');
    await expect(page.getByTestId('entities-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('entities-loading')).not.toBeVisible({ timeout: 10000 });

    // Type a nonsense search term
    await page.getByTestId('entity-search-input').fill('xyznonexistent123456');

    // Wait for filtering to apply
    await page.waitForTimeout(100);

    // Should show empty state with clear filters option
    await expect(page.getByTestId('entities-empty')).toBeVisible();
    await expect(page.getByText('No entities match your filters')).toBeVisible();
    await expect(page.getByTestId('clear-filters-button')).toBeVisible();
  });

  test('clear filters button works', async ({ page }) => {
    // Get entities from API
    const response = await page.request.get('/api/entities');
    const entities = await response.json();

    await page.goto('/entities');
    await expect(page.getByTestId('entities-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('entities-loading')).not.toBeVisible({ timeout: 10000 });

    // Type a nonsense search term
    await page.getByTestId('entity-search-input').fill('xyznonexistent123456');

    // Wait for filtering
    await page.waitForTimeout(100);

    // Should show empty state
    await expect(page.getByTestId('entities-empty')).toBeVisible();

    // Click clear filters
    await page.getByTestId('clear-filters-button').click();

    // Should now show all entities (or empty state if no entities exist)
    if (entities.length > 0) {
      await expect(page.getByTestId('entities-grid')).toBeVisible();
      await expect(page.getByText(new RegExp(`${entities.length} of ${entities.length}`))).toBeVisible();
    } else {
      await expect(page.getByText('No entities registered')).toBeVisible();
    }
  });
});

test.describe('TB34: Entity Detail Panel', () => {
  test('entity stats endpoint is accessible', async ({ page }) => {
    // Get entities from API
    const response = await page.request.get('/api/entities');
    const entities = await response.json();

    if (entities.length === 0) {
      test.skip();
      return;
    }

    // Get stats for first entity
    const firstEntity = entities[0];
    const statsResponse = await page.request.get(`/api/entities/${firstEntity.id}/stats`);
    expect(statsResponse.ok()).toBe(true);
    const stats = await statsResponse.json();
    expect(typeof stats.assignedTaskCount).toBe('number');
    expect(typeof stats.activeTaskCount).toBe('number');
    expect(typeof stats.completedTaskCount).toBe('number');
    expect(typeof stats.messageCount).toBe('number');
    expect(typeof stats.documentCount).toBe('number');
  });

  test('entity events endpoint is accessible', async ({ page }) => {
    // Get entities from API
    const response = await page.request.get('/api/entities');
    const entities = await response.json();

    if (entities.length === 0) {
      test.skip();
      return;
    }

    // Get events for first entity
    const firstEntity = entities[0];
    const eventsResponse = await page.request.get(`/api/entities/${firstEntity.id}/events`);
    expect(eventsResponse.ok()).toBe(true);
    const events = await eventsResponse.json();
    expect(Array.isArray(events)).toBe(true);
  });

  test('clicking entity card opens detail panel', async ({ page }) => {
    // Get entities from API
    const response = await page.request.get('/api/entities');
    const entities = await response.json();

    if (entities.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/entities');
    await expect(page.getByTestId('entities-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('entities-loading')).not.toBeVisible({ timeout: 10000 });

    // Click first entity card
    const firstEntity = entities[0];
    await page.getByTestId(`entity-card-${firstEntity.id}`).click();

    // Detail panel should be visible
    await expect(page.getByTestId('entity-detail-container')).toBeVisible();
    await expect(page.getByTestId('entity-detail-panel')).toBeVisible();
  });

  test('detail panel shows entity information', async ({ page }) => {
    // Get entities from API
    const response = await page.request.get('/api/entities');
    const entities = await response.json();

    if (entities.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/entities');
    await expect(page.getByTestId('entities-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('entities-loading')).not.toBeVisible({ timeout: 10000 });

    // Click first entity card
    const firstEntity = entities[0];
    await page.getByTestId(`entity-card-${firstEntity.id}`).click();

    // Wait for detail panel to load
    await expect(page.getByTestId('entity-detail-panel')).toBeVisible({ timeout: 10000 });

    // Should show entity name in detail panel
    const detailPanel = page.getByTestId('entity-detail-panel');
    await expect(detailPanel.getByRole('heading', { name: firstEntity.name })).toBeVisible();

    // Should show statistics section
    await expect(page.getByText('Statistics')).toBeVisible();
    await expect(page.getByTestId('entity-stats')).toBeVisible({ timeout: 10000 });
  });

  test('detail panel shows assigned tasks section', async ({ page }) => {
    // Get entities from API
    const response = await page.request.get('/api/entities');
    const entities = await response.json();

    if (entities.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/entities');
    await expect(page.getByTestId('entities-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('entities-loading')).not.toBeVisible({ timeout: 10000 });

    // Click first entity card
    const firstEntity = entities[0];
    await page.getByTestId(`entity-card-${firstEntity.id}`).click();

    // Wait for detail panel to load
    await expect(page.getByTestId('entity-detail-panel')).toBeVisible({ timeout: 10000 });

    // Should show assigned tasks section header
    await expect(page.getByRole('heading', { name: /Assigned Tasks/ })).toBeVisible();
  });

  test('detail panel shows activity timeline', async ({ page }) => {
    // Get entities from API
    const response = await page.request.get('/api/entities');
    const entities = await response.json();

    if (entities.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/entities');
    await expect(page.getByTestId('entities-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('entities-loading')).not.toBeVisible({ timeout: 10000 });

    // Click first entity card
    const firstEntity = entities[0];
    await page.getByTestId(`entity-card-${firstEntity.id}`).click();

    // Wait for detail panel to load
    await expect(page.getByTestId('entity-detail-panel')).toBeVisible({ timeout: 10000 });

    // Should show recent activity section
    await expect(page.getByText('Recent Activity')).toBeVisible();
  });

  test('close button closes detail panel', async ({ page }) => {
    // Get entities from API
    const response = await page.request.get('/api/entities');
    const entities = await response.json();

    if (entities.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/entities');
    await expect(page.getByTestId('entities-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('entities-loading')).not.toBeVisible({ timeout: 10000 });

    // Click first entity card
    const firstEntity = entities[0];
    await page.getByTestId(`entity-card-${firstEntity.id}`).click();

    // Detail panel should be visible
    await expect(page.getByTestId('entity-detail-panel')).toBeVisible({ timeout: 10000 });

    // Click close button
    await page.getByTestId('entity-detail-close').click();

    // Detail panel should be hidden
    await expect(page.getByTestId('entity-detail-container')).not.toBeVisible();
  });

  test('split-view layout works correctly', async ({ page }) => {
    // Get entities from API
    const response = await page.request.get('/api/entities');
    const entities = await response.json();

    if (entities.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/entities');
    await expect(page.getByTestId('entities-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('entities-loading')).not.toBeVisible({ timeout: 10000 });

    // Initially, entity grid should be full width (3 columns on lg)
    const grid = page.getByTestId('entities-grid').locator('> div');
    await expect(grid).toHaveClass(/lg:grid-cols-3/);

    // Click first entity card
    const firstEntity = entities[0];
    await page.getByTestId(`entity-card-${firstEntity.id}`).click();

    // Now grid should be single column (detail panel takes half)
    await expect(grid).toHaveClass(/grid-cols-1/);
    await expect(grid).not.toHaveClass(/lg:grid-cols-3/);
  });

  test('selected entity card is highlighted', async ({ page }) => {
    // Get entities from API
    const response = await page.request.get('/api/entities');
    const entities = await response.json();

    if (entities.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/entities');
    await expect(page.getByTestId('entities-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('entities-loading')).not.toBeVisible({ timeout: 10000 });

    // Click first entity card
    const firstEntity = entities[0];
    const card = page.getByTestId(`entity-card-${firstEntity.id}`);
    await card.click();

    // Card should have selected styling (blue border)
    await expect(card).toHaveClass(/border-blue-500/);
    await expect(card).toHaveClass(/ring-2/);
  });
});

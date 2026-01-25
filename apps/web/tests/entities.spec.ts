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

    // Should show recent activity section header
    await expect(page.getByRole('heading', { name: 'Recent Activity' })).toBeVisible();
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

test.describe('TB35: Create Entity', () => {
  test('POST /api/entities endpoint creates entity', async ({ page }) => {
    const testName = `test-entity-${Date.now()}`;

    const response = await page.request.post('/api/entities', {
      data: {
        name: testName,
        entityType: 'agent',
      },
    });

    expect(response.ok()).toBe(true);
    const entity = await response.json();
    expect(entity.name).toBe(testName);
    expect(entity.entityType).toBe('agent');
    expect(entity.id).toBeDefined();
  });

  test('POST /api/entities validates name is required', async ({ page }) => {
    const response = await page.request.post('/api/entities', {
      data: {
        entityType: 'agent',
      },
    });

    expect(response.ok()).toBe(false);
    const error = await response.json();
    expect(error.error?.message).toContain('Name');
  });

  test('POST /api/entities validates entity type', async ({ page }) => {
    const response = await page.request.post('/api/entities', {
      data: {
        name: `test-entity-${Date.now()}`,
        entityType: 'invalid',
      },
    });

    expect(response.ok()).toBe(false);
    const error = await response.json();
    expect(error.error?.message).toContain('entity type');
  });

  test('POST /api/entities rejects duplicate names', async ({ page }) => {
    // Get existing entities
    const existingResponse = await page.request.get('/api/entities');
    const entities = await existingResponse.json();

    if (entities.length === 0) {
      test.skip();
      return;
    }

    // Try to create entity with same name
    const response = await page.request.post('/api/entities', {
      data: {
        name: entities[0].name,
        entityType: 'agent',
      },
    });

    expect(response.ok()).toBe(false);
    const error = await response.json();
    expect(error.error?.message).toContain('already exists');
  });

  test('register entity button is visible', async ({ page }) => {
    await page.goto('/entities');
    await expect(page.getByTestId('entities-page')).toBeVisible({ timeout: 10000 });

    await expect(page.getByTestId('register-entity-button')).toBeVisible();
  });

  test('clicking register entity button opens modal', async ({ page }) => {
    await page.goto('/entities');
    await expect(page.getByTestId('entities-page')).toBeVisible({ timeout: 10000 });

    await page.getByTestId('register-entity-button').click();

    await expect(page.getByTestId('register-entity-modal')).toBeVisible();
  });

  test('register entity modal has required fields', async ({ page }) => {
    await page.goto('/entities');
    await expect(page.getByTestId('entities-page')).toBeVisible({ timeout: 10000 });

    await page.getByTestId('register-entity-button').click();
    await expect(page.getByTestId('register-entity-modal')).toBeVisible();

    // Check for name input
    await expect(page.getByTestId('register-entity-name-input')).toBeVisible();

    // Check for entity type options
    await expect(page.getByTestId('register-entity-type-options')).toBeVisible();
    await expect(page.getByTestId('register-entity-type-agent')).toBeVisible();
    await expect(page.getByTestId('register-entity-type-human')).toBeVisible();
    await expect(page.getByTestId('register-entity-type-system')).toBeVisible();

    // Check for optional fields
    await expect(page.getByTestId('register-entity-public-key-input')).toBeVisible();
    await expect(page.getByTestId('register-entity-tags-input')).toBeVisible();

    // Check for submit button
    await expect(page.getByTestId('register-entity-submit')).toBeVisible();
  });

  test('register entity modal can be closed', async ({ page }) => {
    await page.goto('/entities');
    await expect(page.getByTestId('entities-page')).toBeVisible({ timeout: 10000 });

    await page.getByTestId('register-entity-button').click();
    await expect(page.getByTestId('register-entity-modal')).toBeVisible();

    // Click close button
    await page.getByTestId('register-entity-modal-close').click();

    await expect(page.getByTestId('register-entity-modal')).not.toBeVisible();
  });

  test('register entity modal can be closed with cancel button', async ({ page }) => {
    await page.goto('/entities');
    await expect(page.getByTestId('entities-page')).toBeVisible({ timeout: 10000 });

    await page.getByTestId('register-entity-button').click();
    await expect(page.getByTestId('register-entity-modal')).toBeVisible();

    // Click cancel button - scroll into view first
    const cancelButton = page.getByTestId('register-entity-cancel');
    await cancelButton.scrollIntoViewIfNeeded();
    await cancelButton.click();

    await expect(page.getByTestId('register-entity-modal')).not.toBeVisible();
  });

  test('can create new entity via modal', async ({ page }) => {
    const testName = `TestAgent${Date.now()}`;

    await page.goto('/entities');
    await expect(page.getByTestId('entities-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('entities-loading')).not.toBeVisible({ timeout: 10000 });

    // Open modal
    await page.getByTestId('register-entity-button').click();
    await expect(page.getByTestId('register-entity-modal')).toBeVisible();

    // Fill in name
    await page.getByTestId('register-entity-name-input').fill(testName);

    // Select agent type (should already be selected by default)
    await page.getByTestId('register-entity-type-agent').click();

    // Submit - scroll into view first
    const submitButton = page.getByTestId('register-entity-submit');
    await submitButton.scrollIntoViewIfNeeded();
    await submitButton.click();

    // Modal should close
    await expect(page.getByTestId('register-entity-modal')).not.toBeVisible({ timeout: 10000 });

    // New entity should appear in the list
    await expect(page.getByTestId(`entity-card-${testName}`).or(page.getByText(testName).first())).toBeVisible({ timeout: 10000 });
  });

  test('shows validation error for invalid entity name', async ({ page }) => {
    await page.goto('/entities');
    await expect(page.getByTestId('entities-page')).toBeVisible({ timeout: 10000 });

    // Open modal
    await page.getByTestId('register-entity-button').click();
    await expect(page.getByTestId('register-entity-modal')).toBeVisible();

    // Fill in invalid name (starts with number)
    await page.getByTestId('register-entity-name-input').fill('123invalid');

    // Submit - scroll into view first
    const submitButton = page.getByTestId('register-entity-submit');
    await submitButton.scrollIntoViewIfNeeded();
    await submitButton.click();

    // Should show error (modal should still be visible with error)
    await expect(page.getByTestId('register-entity-error')).toBeVisible({ timeout: 5000 });
  });

  test('can create entity with all optional fields', async ({ page }) => {
    const testName = `TestFullEntity${Date.now()}`;

    await page.goto('/entities');
    await expect(page.getByTestId('entities-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('entities-loading')).not.toBeVisible({ timeout: 10000 });

    // Open modal
    await page.getByTestId('register-entity-button').click();
    await expect(page.getByTestId('register-entity-modal')).toBeVisible();

    // Fill in name
    await page.getByTestId('register-entity-name-input').fill(testName);

    // Select human type
    await page.getByTestId('register-entity-type-human').click();

    // Add tags
    await page.getByTestId('register-entity-tags-input').fill('test, automation, playwright');

    // Submit - scroll into view first
    const submitButton = page.getByTestId('register-entity-submit');
    await submitButton.scrollIntoViewIfNeeded();
    await submitButton.click();

    // Modal should close
    await expect(page.getByTestId('register-entity-modal')).not.toBeVisible({ timeout: 10000 });

    // Verify entity was created via API
    const response = await page.request.get('/api/entities');
    const entities = await response.json();
    const createdEntity = entities.find((e: { name: string }) => e.name === testName);

    expect(createdEntity).toBeDefined();
    expect(createdEntity.entityType).toBe('human');
    expect(createdEntity.tags).toContain('test');
    expect(createdEntity.tags).toContain('automation');
    expect(createdEntity.tags).toContain('playwright');
  });
});

test.describe('TB36: Edit Entity', () => {
  test('PATCH /api/entities/:id endpoint updates entity name', async ({ page }) => {
    // First create an entity to edit
    const testName = `EditTest${Date.now()}`;
    const createResponse = await page.request.post('/api/entities', {
      data: {
        name: testName,
        entityType: 'agent',
      },
    });
    expect(createResponse.ok()).toBe(true);
    const entity = await createResponse.json();

    // Update the entity name
    const newName = `${testName}Updated`;
    const updateResponse = await page.request.patch(`/api/entities/${entity.id}`, {
      data: { name: newName },
    });
    expect(updateResponse.ok()).toBe(true);
    const updated = await updateResponse.json();
    expect(updated.name).toBe(newName);
  });

  test('PATCH /api/entities/:id endpoint updates entity tags', async ({ page }) => {
    // First create an entity to edit
    const testName = `TagTest${Date.now()}`;
    const createResponse = await page.request.post('/api/entities', {
      data: {
        name: testName,
        entityType: 'agent',
        tags: ['original'],
      },
    });
    expect(createResponse.ok()).toBe(true);
    const entity = await createResponse.json();

    // Update the entity tags
    const updateResponse = await page.request.patch(`/api/entities/${entity.id}`, {
      data: { tags: ['updated', 'new-tag'] },
    });
    expect(updateResponse.ok()).toBe(true);
    const updated = await updateResponse.json();
    expect(updated.tags).toContain('updated');
    expect(updated.tags).toContain('new-tag');
    expect(updated.tags).not.toContain('original');
  });

  test('PATCH /api/entities/:id endpoint updates active status', async ({ page }) => {
    // First create an entity to edit
    const testName = `ActiveTest${Date.now()}`;
    const createResponse = await page.request.post('/api/entities', {
      data: {
        name: testName,
        entityType: 'agent',
      },
    });
    expect(createResponse.ok()).toBe(true);
    const entity = await createResponse.json();

    // Deactivate the entity
    const updateResponse = await page.request.patch(`/api/entities/${entity.id}`, {
      data: { active: false },
    });
    expect(updateResponse.ok()).toBe(true);
    const updated = await updateResponse.json();
    expect(updated.active).toBe(false);

    // Reactivate the entity
    const reactivateResponse = await page.request.patch(`/api/entities/${entity.id}`, {
      data: { active: true },
    });
    expect(reactivateResponse.ok()).toBe(true);
    const reactivated = await reactivateResponse.json();
    expect(reactivated.active).toBe(true);
  });

  test('PATCH /api/entities/:id validates name uniqueness', async ({ page }) => {
    // Create two entities
    const testName1 = `Unique1${Date.now()}`;
    const testName2 = `Unique2${Date.now()}`;

    await page.request.post('/api/entities', {
      data: { name: testName1, entityType: 'agent' },
    });
    const response2 = await page.request.post('/api/entities', {
      data: { name: testName2, entityType: 'agent' },
    });
    const entity2 = await response2.json();

    // Try to rename entity2 to entity1's name
    const updateResponse = await page.request.patch(`/api/entities/${entity2.id}`, {
      data: { name: testName1 },
    });
    expect(updateResponse.ok()).toBe(false);
    const error = await updateResponse.json();
    expect(error.error?.message).toContain('already exists');
  });

  test('edit button is visible in entity detail panel', async ({ page }) => {
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

    // Edit button should be visible
    await expect(page.getByTestId('entity-edit-button')).toBeVisible();
  });

  test('clicking edit button enables edit mode', async ({ page }) => {
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
    await expect(page.getByTestId('entity-detail-panel')).toBeVisible({ timeout: 10000 });

    // Click edit button
    await page.getByTestId('entity-edit-button').click();

    // Edit mode elements should be visible
    await expect(page.getByTestId('entity-edit-name-input')).toBeVisible();
    await expect(page.getByTestId('entity-save-button')).toBeVisible();
    await expect(page.getByTestId('entity-cancel-edit-button')).toBeVisible();
  });

  test('can edit entity name via UI', async ({ page }) => {
    // First create an entity to edit
    const testName = `UIEdit${Date.now()}`;
    const createResponse = await page.request.post('/api/entities', {
      data: {
        name: testName,
        entityType: 'agent',
      },
    });
    expect(createResponse.ok()).toBe(true);
    const entity = await createResponse.json();

    await page.goto('/entities');
    await expect(page.getByTestId('entities-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('entities-loading')).not.toBeVisible({ timeout: 10000 });

    // Click the entity card
    await page.getByTestId(`entity-card-${entity.id}`).click();
    await expect(page.getByTestId('entity-detail-panel')).toBeVisible({ timeout: 10000 });

    // Click edit button
    await page.getByTestId('entity-edit-button').click();

    // Edit the name
    const newName = `${testName}Changed`;
    await page.getByTestId('entity-edit-name-input').fill(newName);

    // Save
    await page.getByTestId('entity-save-button').click();

    // Verify the name was updated in the detail panel
    await expect(page.getByTestId('entity-detail-panel').getByRole('heading', { name: newName })).toBeVisible({ timeout: 10000 });

    // Verify via API
    const verifyResponse = await page.request.get(`/api/entities/${entity.id}`);
    const updated = await verifyResponse.json();
    expect(updated.name).toBe(newName);
  });

  test('cancel button exits edit mode without saving', async ({ page }) => {
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
    await expect(page.getByTestId('entity-detail-panel')).toBeVisible({ timeout: 10000 });

    // Click edit button
    await page.getByTestId('entity-edit-button').click();

    // Change the name
    const originalName = firstEntity.name;
    await page.getByTestId('entity-edit-name-input').fill('SomethingElse');

    // Click cancel
    await page.getByTestId('entity-cancel-edit-button').click();

    // Should exit edit mode
    await expect(page.getByTestId('entity-edit-name-input')).not.toBeVisible();
    await expect(page.getByTestId('entity-edit-button')).toBeVisible();

    // Name should be unchanged
    await expect(page.getByTestId('entity-detail-panel').getByRole('heading', { name: originalName })).toBeVisible();
  });

  test('toggle active button shows confirmation dialog', async ({ page }) => {
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
    await expect(page.getByTestId('entity-detail-panel')).toBeVisible({ timeout: 10000 });

    // Click toggle active button
    await page.getByTestId('entity-toggle-active-button').click();

    // Confirmation dialog should appear
    await expect(page.getByTestId('entity-deactivate-confirm')).toBeVisible();
    await expect(page.getByTestId('entity-confirm-toggle-button')).toBeVisible();
    await expect(page.getByTestId('entity-cancel-toggle-button')).toBeVisible();
  });

  test('cancel toggle active dialog closes without changes', async ({ page }) => {
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
    await expect(page.getByTestId('entity-detail-panel')).toBeVisible({ timeout: 10000 });

    // Click toggle active button
    await page.getByTestId('entity-toggle-active-button').click();
    await expect(page.getByTestId('entity-deactivate-confirm')).toBeVisible();

    // Click cancel
    await page.getByTestId('entity-cancel-toggle-button').click();

    // Confirmation dialog should close
    await expect(page.getByTestId('entity-deactivate-confirm')).not.toBeVisible();
    await expect(page.getByTestId('entity-toggle-active-button')).toBeVisible();
  });

  test('can deactivate entity via confirmation dialog', async ({ page }) => {
    // First create an active entity to deactivate
    const testName = `Deactivate${Date.now()}`;
    const createResponse = await page.request.post('/api/entities', {
      data: {
        name: testName,
        entityType: 'agent',
      },
    });
    expect(createResponse.ok()).toBe(true);
    const entity = await createResponse.json();

    await page.goto('/entities');
    await expect(page.getByTestId('entities-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('entities-loading')).not.toBeVisible({ timeout: 10000 });

    // Click the entity card
    await page.getByTestId(`entity-card-${entity.id}`).click();
    await expect(page.getByTestId('entity-detail-panel')).toBeVisible({ timeout: 10000 });

    // Click toggle active button
    await page.getByTestId('entity-toggle-active-button').click();
    await expect(page.getByTestId('entity-deactivate-confirm')).toBeVisible();

    // Confirm deactivation
    await page.getByTestId('entity-confirm-toggle-button').click();

    // Wait for update
    await expect(page.getByTestId('entity-deactivate-confirm')).not.toBeVisible({ timeout: 10000 });

    // Entity should now show as inactive
    await expect(page.getByTestId('entity-toggle-active-button')).toContainText('Inactive');

    // Verify via API
    const verifyResponse = await page.request.get(`/api/entities/${entity.id}`);
    const updated = await verifyResponse.json();
    expect(updated.active).toBe(false);
  });

  test('can edit tags in edit mode', async ({ page }) => {
    // First create an entity with tags
    const testName = `TagEdit${Date.now()}`;
    const createResponse = await page.request.post('/api/entities', {
      data: {
        name: testName,
        entityType: 'agent',
        tags: ['original-tag'],
      },
    });
    expect(createResponse.ok()).toBe(true);
    const entity = await createResponse.json();

    await page.goto('/entities');
    await expect(page.getByTestId('entities-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('entities-loading')).not.toBeVisible({ timeout: 10000 });

    // Click the entity card
    await page.getByTestId(`entity-card-${entity.id}`).click();
    await expect(page.getByTestId('entity-detail-panel')).toBeVisible({ timeout: 10000 });

    // Click edit button
    await page.getByTestId('entity-edit-button').click();

    // Edit tags input should be visible
    await expect(page.getByTestId('entity-edit-tags-input')).toBeVisible();

    // Change the tags
    await page.getByTestId('entity-edit-tags-input').fill('new-tag, another-tag');

    // Save
    await page.getByTestId('entity-save-button').click();

    // Verify via API
    await page.waitForTimeout(500); // Wait for update to complete
    const verifyResponse = await page.request.get(`/api/entities/${entity.id}`);
    const updated = await verifyResponse.json();
    expect(updated.tags).toContain('new-tag');
    expect(updated.tags).toContain('another-tag');
    expect(updated.tags).not.toContain('original-tag');
  });

  test('tags list shows remove button on hover', async ({ page }) => {
    // First create an entity with tags
    const testName = `TagRemove${Date.now()}`;
    const createResponse = await page.request.post('/api/entities', {
      data: {
        name: testName,
        entityType: 'agent',
        tags: ['removable-tag'],
      },
    });
    expect(createResponse.ok()).toBe(true);
    const entity = await createResponse.json();

    await page.goto('/entities');
    await expect(page.getByTestId('entities-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('entities-loading')).not.toBeVisible({ timeout: 10000 });

    // Click the entity card
    await page.getByTestId(`entity-card-${entity.id}`).click();
    await expect(page.getByTestId('entity-detail-panel')).toBeVisible({ timeout: 10000 });

    // Wait for tags list to load
    await expect(page.getByTestId('entity-tags-list')).toBeVisible({ timeout: 10000 });

    // Hover over the tag to reveal remove button
    const tagElement = page.getByText('removable-tag').first();
    await tagElement.hover();

    // Remove button should become visible
    await expect(page.getByTestId('entity-remove-tag-removable-tag')).toBeVisible();
  });

  test('can remove tag by clicking remove button', async ({ page }) => {
    // First create an entity with multiple tags
    const testName = `TagRemove2${Date.now()}`;
    const createResponse = await page.request.post('/api/entities', {
      data: {
        name: testName,
        entityType: 'agent',
        tags: ['keep-me', 'remove-me'],
      },
    });
    expect(createResponse.ok()).toBe(true);
    const entity = await createResponse.json();

    await page.goto('/entities');
    await expect(page.getByTestId('entities-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('entities-loading')).not.toBeVisible({ timeout: 10000 });

    // Click the entity card
    await page.getByTestId(`entity-card-${entity.id}`).click();
    await expect(page.getByTestId('entity-detail-panel')).toBeVisible({ timeout: 10000 });

    // Wait for tags list to load
    await expect(page.getByTestId('entity-tags-list')).toBeVisible({ timeout: 10000 });

    // Hover and click remove button
    const tagElement = page.getByText('remove-me').first();
    await tagElement.hover();
    await page.getByTestId('entity-remove-tag-remove-me').click();

    // Wait for update to complete
    await page.waitForTimeout(500);

    // Verify via API
    const verifyResponse = await page.request.get(`/api/entities/${entity.id}`);
    const updated = await verifyResponse.json();
    expect(updated.tags).toContain('keep-me');
    expect(updated.tags).not.toContain('remove-me');
  });
});

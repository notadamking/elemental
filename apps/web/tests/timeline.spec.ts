import { test, expect } from '@playwright/test';

test.describe('TB9: Timeline Lens', () => {
  test('events endpoint is accessible', async ({ page }) => {
    const response = await page.request.get('/api/events');
    expect(response.ok()).toBe(true);
    const data = await response.json();
    expect(Array.isArray(data)).toBe(true);
  });

  test('events endpoint respects limit parameter', async ({ page }) => {
    const response = await page.request.get('/api/events?limit=5');
    expect(response.ok()).toBe(true);
    const data = await response.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeLessThanOrEqual(5);
  });

  test('events endpoint supports eventType filter', async ({ page }) => {
    const response = await page.request.get('/api/events?eventType=created');
    expect(response.ok()).toBe(true);
    const data = await response.json();
    expect(Array.isArray(data)).toBe(true);
    // All returned events should be of type 'created'
    for (const event of data) {
      expect(event.eventType).toBe('created');
    }
  });

  test('events endpoint supports multiple eventType filter', async ({ page }) => {
    const response = await page.request.get('/api/events?eventType=created,updated');
    expect(response.ok()).toBe(true);
    const data = await response.json();
    expect(Array.isArray(data)).toBe(true);
    // All returned events should be either 'created' or 'updated'
    for (const event of data) {
      expect(['created', 'updated']).toContain(event.eventType);
    }
  });

  test('timeline page is accessible via navigation', async ({ page }) => {
    await page.goto('/dashboard/timeline');
    await expect(page.getByTestId('timeline-page')).toBeVisible({ timeout: 10000 });
  });

  test('timeline page displays search input', async ({ page }) => {
    await page.goto('/dashboard/timeline');
    await expect(page.getByTestId('timeline-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('search-input')).toBeVisible();
  });

  test('timeline page displays event type filters', async ({ page }) => {
    await page.goto('/dashboard/timeline');
    await expect(page.getByTestId('timeline-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('event-type-filters')).toBeVisible();
  });

  test('timeline page shows event count', async ({ page }) => {
    await page.goto('/dashboard/timeline');
    await expect(page.getByTestId('timeline-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('event-count')).toBeVisible();
  });

  test('timeline page shows events list', async ({ page }) => {
    await page.goto('/dashboard/timeline');
    await expect(page.getByTestId('timeline-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('events-list')).toBeVisible();
  });

  test('sidebar has Timeline nav item', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByTestId('sidebar')).toBeVisible({ timeout: 10000 });

    // Check for Timeline link in sidebar
    const timelineLink = page.getByRole('link', { name: /Timeline/i });
    await expect(timelineLink).toBeVisible();
  });

  test('can navigate to Timeline from sidebar', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByTestId('sidebar')).toBeVisible({ timeout: 10000 });

    // Click Timeline link
    await page.getByRole('link', { name: /Timeline/i }).click();

    // Should be on timeline page
    await expect(page.getByTestId('timeline-page')).toBeVisible({ timeout: 10000 });
    await expect(page).toHaveURL('/dashboard/timeline');
  });

  test('event cards display when events exist', async ({ page }) => {
    // First check if there are any events
    const response = await page.request.get('/api/events?limit=10');
    const events = await response.json();

    await page.goto('/dashboard/timeline');
    await expect(page.getByTestId('timeline-page')).toBeVisible({ timeout: 10000 });

    // Wait for loading to finish - check the events list specifically
    await expect(page.getByTestId('events-list').getByText('Loading events...')).not.toBeVisible({ timeout: 10000 });

    if (events.length > 0) {
      // At least one event card should be visible
      await expect(page.getByTestId('event-card').first()).toBeVisible({ timeout: 10000 });
    } else {
      // Empty state should be shown
      await expect(page.getByText('No events recorded yet')).toBeVisible();
    }
  });

  test('search filters events by element ID', async ({ page }) => {
    // First check if there are any events to search
    const response = await page.request.get('/api/events?limit=10');
    const events = await response.json();

    if (events.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/dashboard/timeline');
    await expect(page.getByTestId('timeline-page')).toBeVisible({ timeout: 10000 });

    // Wait for events to load - use specific locator to avoid matching both count and list loading states
    await expect(page.getByTestId('events-list').getByText('Loading events...')).not.toBeVisible({ timeout: 10000 });

    // Get the element ID from the first event
    const firstEventElementId = events[0].elementId;

    // Type the element ID in the search box
    await page.getByTestId('search-input').fill(firstEventElementId);

    // Wait a moment for filtering
    await page.waitForTimeout(300);

    // The event count should be filtered
    const eventCount = page.getByTestId('event-count');
    await expect(eventCount).toContainText('(filtered)');
  });

  test('event type filter toggles work', async ({ page }) => {
    await page.goto('/dashboard/timeline');
    await expect(page.getByTestId('timeline-page')).toBeVisible({ timeout: 10000 });

    // Find the Created filter button
    const createdFilter = page.getByTestId('event-type-filters').getByRole('button', { name: /Created/i });
    await expect(createdFilter).toBeVisible();

    // Click to toggle the filter on
    await createdFilter.click();

    // The button should now have an active style (we check for a ring class as indicator)
    await expect(createdFilter).toHaveClass(/ring-1/);

    // Click to toggle the filter off
    await createdFilter.click();

    // The button should no longer have the ring
    await expect(createdFilter).not.toHaveClass(/ring-1/);
  });

  test('clear filters button appears when filters are active', async ({ page }) => {
    await page.goto('/dashboard/timeline');
    await expect(page.getByTestId('timeline-page')).toBeVisible({ timeout: 10000 });

    // Initially, clear filters button should not be visible
    await expect(page.getByRole('button', { name: /Clear filters/i })).not.toBeVisible();

    // Type something in search
    await page.getByTestId('search-input').fill('test');

    // Now clear filters should appear
    await expect(page.getByRole('button', { name: /Clear filters/i })).toBeVisible();

    // Click clear filters
    await page.getByRole('button', { name: /Clear filters/i }).click();

    // Search should be cleared
    await expect(page.getByTestId('search-input')).toHaveValue('');
  });
});

import { test, expect } from '@playwright/test';

test.describe('TB59: Settings Page - Theme', () => {
  test('settings page is visible via sidebar navigation', async ({ page }) => {
    await page.goto('/dashboard');

    // Click Settings in sidebar
    await page.getByTestId('nav-settings').click();

    // Should navigate to /settings
    await expect(page).toHaveURL(/\/settings/);

    // Settings page should be visible
    await expect(page.getByTestId('settings-page')).toBeVisible();
  });

  test('settings page has sidebar navigation with sections', async ({ page }) => {
    await page.goto('/settings');

    // Settings sidebar nav should be visible
    await expect(page.getByTestId('settings-nav')).toBeVisible();

    // All sections should be visible
    await expect(page.getByTestId('settings-nav-theme')).toBeVisible();
    await expect(page.getByTestId('settings-nav-shortcuts')).toBeVisible();
    await expect(page.getByTestId('settings-nav-defaults')).toBeVisible();
    await expect(page.getByTestId('settings-nav-notifications')).toBeVisible();
    await expect(page.getByTestId('settings-nav-sync')).toBeVisible();
  });

  test('theme section is shown by default', async ({ page }) => {
    await page.goto('/settings');

    // Theme section should be visible
    await expect(page.getByTestId('settings-theme-section')).toBeVisible();

    // All theme options should be visible
    await expect(page.getByTestId('theme-option-light')).toBeVisible();
    await expect(page.getByTestId('theme-option-dark')).toBeVisible();
    await expect(page.getByTestId('theme-option-system')).toBeVisible();
  });

  test('can select light theme', async ({ page }) => {
    await page.goto('/settings');

    // Click light theme option
    await page.getByTestId('theme-option-light').click();

    // Should show as active
    await expect(page.getByTestId('theme-option-light')).toContainText('Active');

    // Document should have theme-light class
    const htmlClass = await page.evaluate(() => document.documentElement.className);
    expect(htmlClass).toContain('theme-light');
    expect(htmlClass).not.toContain('dark');
  });

  test('can select dark theme', async ({ page }) => {
    await page.goto('/settings');

    // Click dark theme option
    await page.getByTestId('theme-option-dark').click();

    // Should show as active
    await expect(page.getByTestId('theme-option-dark')).toContainText('Active');

    // Document should have dark class
    const htmlClass = await page.evaluate(() => document.documentElement.className);
    expect(htmlClass).toContain('dark');
    expect(htmlClass).toContain('theme-dark');
  });

  test('can select system theme', async ({ page }) => {
    await page.goto('/settings');

    // First select light theme
    await page.getByTestId('theme-option-light').click();

    // Then select system theme
    await page.getByTestId('theme-option-system').click();

    // Should show as active
    await expect(page.getByTestId('theme-option-system')).toContainText('Active');
  });

  test('theme preference persists after page refresh', async ({ page }) => {
    await page.goto('/settings');

    // Select dark theme
    await page.getByTestId('theme-option-dark').click();
    await expect(page.getByTestId('theme-option-dark')).toContainText('Active');

    // Refresh the page
    await page.reload();

    // Dark theme should still be active
    await expect(page.getByTestId('theme-option-dark')).toContainText('Active');

    // Document should still have dark class
    const htmlClass = await page.evaluate(() => document.documentElement.className);
    expect(htmlClass).toContain('dark');
  });

  test('theme is stored in localStorage', async ({ page }) => {
    await page.goto('/settings');

    // Select dark theme
    await page.getByTestId('theme-option-dark').click();

    // Check localStorage
    const storedTheme = await page.evaluate(() => localStorage.getItem('settings.theme'));
    expect(storedTheme).toBe('dark');

    // Select light theme
    await page.getByTestId('theme-option-light').click();

    // Check localStorage again
    const storedTheme2 = await page.evaluate(() => localStorage.getItem('settings.theme'));
    expect(storedTheme2).toBe('light');
  });

  test('theme preview shows current theme appearance', async ({ page }) => {
    await page.goto('/settings');

    // Theme preview should be visible
    await expect(page.getByTestId('theme-preview')).toBeVisible();
  });

  test('clicking other settings sections shows coming soon message', async ({ page }) => {
    await page.goto('/settings');

    // Click shortcuts section
    await page.getByTestId('settings-nav-shortcuts').click();
    await expect(page.getByTestId('settings-shortcuts-section')).toBeVisible();
    await expect(page.getByText(/coming soon/i)).toBeVisible();

    // Click defaults section
    await page.getByTestId('settings-nav-defaults').click();
    await expect(page.getByTestId('settings-defaults-section')).toBeVisible();
    await expect(page.getByText(/coming soon/i)).toBeVisible();

    // Click notifications section
    await page.getByTestId('settings-nav-notifications').click();
    await expect(page.getByTestId('settings-notifications-section')).toBeVisible();
    await expect(page.getByText(/coming soon/i)).toBeVisible();

    // Click sync section
    await page.getByTestId('settings-nav-sync').click();
    await expect(page.getByTestId('settings-sync-section')).toBeVisible();
    await expect(page.getByText(/coming soon/i)).toBeVisible();
  });

  test('can navigate back to theme section after viewing other sections', async ({ page }) => {
    await page.goto('/settings');

    // Click shortcuts section
    await page.getByTestId('settings-nav-shortcuts').click();
    await expect(page.getByTestId('settings-shortcuts-section')).toBeVisible();

    // Click back to theme section
    await page.getByTestId('settings-nav-theme').click();
    await expect(page.getByTestId('settings-theme-section')).toBeVisible();

    // Theme options should be visible again
    await expect(page.getByTestId('theme-option-light')).toBeVisible();
  });

  test('theme nav item shows as active when theme section is selected', async ({ page }) => {
    await page.goto('/settings');

    // Theme nav should be active (have active styling)
    const themeNav = page.getByTestId('settings-nav-theme');
    await expect(themeNav).toHaveClass(/bg-white|text-blue-600/);

    // Click shortcuts to change section
    await page.getByTestId('settings-nav-shortcuts').click();

    // Shortcuts nav should now be active
    const shortcutsNav = page.getByTestId('settings-nav-shortcuts');
    await expect(shortcutsNav).toHaveClass(/bg-white|text-blue-600/);
  });

  test('theme selection switches between options correctly', async ({ page }) => {
    await page.goto('/settings');

    // Light should start as active (default is system, but for test we select light first)
    await page.getByTestId('theme-option-light').click();
    await expect(page.getByTestId('theme-option-light')).toContainText('Active');
    await expect(page.getByTestId('theme-option-dark')).not.toContainText('Active');
    await expect(page.getByTestId('theme-option-system')).not.toContainText('Active');

    // Select dark
    await page.getByTestId('theme-option-dark').click();
    await expect(page.getByTestId('theme-option-dark')).toContainText('Active');
    await expect(page.getByTestId('theme-option-light')).not.toContainText('Active');
    await expect(page.getByTestId('theme-option-system')).not.toContainText('Active');

    // Select system
    await page.getByTestId('theme-option-system').click();
    await expect(page.getByTestId('theme-option-system')).toContainText('Active');
    await expect(page.getByTestId('theme-option-light')).not.toContainText('Active');
    await expect(page.getByTestId('theme-option-dark')).not.toContainText('Active');
  });

  test('dark theme applies dark styling to the page', async ({ page }) => {
    await page.goto('/settings');

    // Select dark theme
    await page.getByTestId('theme-option-dark').click();

    // Body should have dark background (via CSS variables)
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(17, 24, 39)');
  });

  test('light theme applies light styling to the page', async ({ page }) => {
    await page.goto('/settings');

    // First set to dark to ensure we're changing
    await page.getByTestId('theme-option-dark').click();

    // Then set to light
    await page.getByTestId('theme-option-light').click();

    // Body should have light background
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  });

  test('theme persists across different pages', async ({ page }) => {
    await page.goto('/settings');

    // Select dark theme
    await page.getByTestId('theme-option-dark').click();

    // Navigate to dashboard
    await page.getByTestId('nav-dashboard').click();
    await expect(page).toHaveURL(/\/dashboard/);

    // Dark class should still be on document
    const htmlClass = await page.evaluate(() => document.documentElement.className);
    expect(htmlClass).toContain('dark');

    // Navigate back to settings
    await page.getByTestId('nav-settings').click();

    // Dark theme should still be selected
    await expect(page.getByTestId('theme-option-dark')).toContainText('Active');
  });

  test('system theme description shows current system preference', async ({ page }) => {
    await page.goto('/settings');

    // System option should mention either light or dark
    const systemOption = page.getByTestId('theme-option-system');
    await expect(systemOption).toContainText(/currently (light|dark)/i);
  });
});

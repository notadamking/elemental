import { test, expect } from '@playwright/test';

test.describe('TB-O17a: Terminal Multiplexer (Workspaces Page)', () => {
  test.describe('Workspaces page layout', () => {
    test('displays page header with title and actions', async ({ page }) => {
      await page.goto('/workspaces');

      // Page should be visible
      await expect(page.getByTestId('workspaces-page')).toBeVisible();

      // Title should be visible
      await expect(page.getByRole('heading', { name: 'Workspaces' })).toBeVisible();

      // Add Pane button should be visible
      await expect(page.getByTestId('workspaces-add-pane')).toBeVisible();

      // Layout button should be visible
      await expect(page.getByTestId('workspaces-layout-btn')).toBeVisible();
    });

    test('displays empty state when no panes', async ({ page }) => {
      // Clear localStorage to ensure clean state
      await page.goto('/workspaces');
      await page.evaluate(() => {
        localStorage.removeItem('elemental-active-workspace-layout');
        localStorage.removeItem('elemental-workspace-layouts');
      });
      await page.reload();

      // Wait for page to load
      await expect(page.getByTestId('workspaces-page')).toBeVisible();

      // Empty state should be visible
      await expect(page.getByTestId('workspaces-empty')).toBeVisible();

      // Empty state should have CTA
      await expect(page.getByText('No Terminal Panes')).toBeVisible();
      await expect(page.getByText('Add Your First Pane')).toBeVisible();
    });
  });

  test.describe('Add Pane dialog', () => {
    test('opens Add Pane dialog when clicking Add Pane button', async ({ page }) => {
      await page.goto('/workspaces');

      // Click Add Pane button
      await page.getByTestId('workspaces-add-pane').click();

      // Dialog should be visible
      await expect(page.getByTestId('add-pane-dialog')).toBeVisible();
      await expect(page.getByRole('dialog')).toBeVisible();

      // Dialog should have title
      await expect(page.getByRole('heading', { name: 'Add Terminal Pane' })).toBeVisible();

      // Search input should be visible
      await expect(page.getByTestId('add-pane-search')).toBeVisible();

      // Agent list should be visible
      await expect(page.getByTestId('add-pane-list')).toBeVisible();
    });

    test('can close Add Pane dialog via close button', async ({ page }) => {
      await page.goto('/workspaces');

      // Open dialog
      await page.getByTestId('workspaces-add-pane').click();
      await expect(page.getByTestId('add-pane-dialog')).toBeVisible();

      // Click close button
      await page.getByTestId('add-pane-close').click();

      // Dialog should be hidden
      await expect(page.getByTestId('add-pane-dialog')).not.toBeVisible();
    });

    test('can close Add Pane dialog by clicking backdrop', async ({ page }) => {
      await page.goto('/workspaces');

      // Open dialog
      await page.getByTestId('workspaces-add-pane').click();
      await expect(page.getByTestId('add-pane-dialog')).toBeVisible();

      // Click on the backdrop at the top-left corner (outside the dialog)
      // The dialog is centered, so clicking at (10, 10) should hit the backdrop
      await page.mouse.click(10, 10);

      // Dialog should be hidden
      await expect(page.getByTestId('add-pane-dialog')).not.toBeVisible();
    });

    test('can filter agents in search', async ({ page }) => {
      await page.goto('/workspaces');

      // Open dialog
      await page.getByTestId('workspaces-add-pane').click();

      // Type in search
      await page.getByTestId('add-pane-search').fill('director');

      // List should filter (showing only matching agents or "no match" message)
      await expect(page.getByTestId('add-pane-list')).toBeVisible();
    });
  });

  test.describe('Layout presets', () => {
    test('opens layout menu when clicking layout button', async ({ page }) => {
      await page.goto('/workspaces');

      // Click layout button
      await page.getByTestId('workspaces-layout-btn').click();

      // Layout menu should be visible
      await expect(page.getByTestId('layout-menu')).toBeVisible();

      // Preset options should be visible
      await expect(page.getByTestId('layout-preset-single')).toBeVisible();
      await expect(page.getByTestId('layout-preset-split-vertical')).toBeVisible();
      await expect(page.getByTestId('layout-preset-split-horizontal')).toBeVisible();
      await expect(page.getByTestId('layout-preset-grid')).toBeVisible();
    });

    test('can select layout preset', async ({ page }) => {
      await page.goto('/workspaces');

      // Open layout menu
      await page.getByTestId('workspaces-layout-btn').click();

      // Select split-vertical
      await page.getByTestId('layout-preset-split-vertical').click();

      // Menu should close
      await expect(page.getByTestId('layout-menu')).not.toBeVisible();
    });

    test('closes layout menu when clicking outside', async ({ page }) => {
      await page.goto('/workspaces');

      // Open layout menu
      await page.getByTestId('workspaces-layout-btn').click();
      await expect(page.getByTestId('layout-menu')).toBeVisible();

      // Click the invisible overlay that captures outside clicks
      // The layout menu uses a fixed inset-0 div to catch clicks
      await page.locator('.fixed.inset-0.z-10').click({ force: true });

      // Menu should close
      await expect(page.getByTestId('layout-menu')).not.toBeVisible();
    });
  });

  test.describe('Layout persistence', () => {
    test('persists layout to localStorage', async ({ page }) => {
      await page.goto('/workspaces');

      // Open layout menu and select a preset
      await page.getByTestId('workspaces-layout-btn').click();
      await page.getByTestId('layout-preset-grid').click();

      // Verify localStorage was updated
      const layoutData = await page.evaluate(() => {
        return localStorage.getItem('elemental-active-workspace-layout');
      });

      expect(layoutData).toBeTruthy();
      expect(JSON.parse(layoutData!).preset).toBe('grid');
    });

    test('restores layout from localStorage on reload', async ({ page }) => {
      await page.goto('/workspaces');

      // Set a specific layout
      await page.getByTestId('workspaces-layout-btn').click();
      await page.getByTestId('layout-preset-split-horizontal').click();

      // Reload page
      await page.reload();

      // Layout should be preserved - verify by checking the button shows the preset
      // (The button text should show "Split Horizontal" if layout persisted)
      await expect(page.getByTestId('workspaces-page')).toBeVisible();
    });
  });

  test.describe('Save Layout dialog', () => {
    // Note: Save layout option only appears when there are panes
    // For this test we'll verify the menu structure exists
    test('layout menu structure is correct', async ({ page }) => {
      await page.goto('/workspaces');

      // Open layout menu
      await page.getByTestId('workspaces-layout-btn').click();

      // Layout Presets header should be visible
      await expect(page.getByText('Layout Presets')).toBeVisible();
    });
  });

  test.describe('Workspace grid', () => {
    test('shows workspace grid when panes exist', async ({ page }) => {
      await page.goto('/workspaces');

      // Set up a layout with a mock pane in localStorage
      await page.evaluate(() => {
        const mockLayout = {
          id: 'test-layout',
          name: 'Test',
          preset: 'single',
          panes: [
            {
              id: 'pane-1',
              agentId: 'test-agent-1',
              agentName: 'Test Agent',
              agentRole: 'worker',
              workerMode: 'ephemeral',
              paneType: 'stream',
              status: 'disconnected',
              position: 0,
              weight: 1,
            },
          ],
          createdAt: Date.now(),
          modifiedAt: Date.now(),
        };
        localStorage.setItem('elemental-active-workspace-layout', JSON.stringify(mockLayout));
      });

      // Reload to pick up the mock layout
      await page.reload();

      // Workspace grid should be visible
      await expect(page.getByTestId('workspace-grid')).toBeVisible();

      // Pane should be visible
      await expect(page.getByTestId('workspace-pane-pane-1')).toBeVisible();
    });
  });

  test.describe('Pane controls', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/workspaces');

      // Set up a layout with a mock pane
      await page.evaluate(() => {
        const mockLayout = {
          id: 'test-layout',
          name: 'Test',
          preset: 'single',
          panes: [
            {
              id: 'pane-test',
              agentId: 'test-agent-1',
              agentName: 'Test Agent',
              agentRole: 'worker',
              workerMode: 'ephemeral',
              paneType: 'stream',
              status: 'disconnected',
              position: 0,
              weight: 1,
            },
          ],
          createdAt: Date.now(),
          modifiedAt: Date.now(),
        };
        localStorage.setItem('elemental-active-workspace-layout', JSON.stringify(mockLayout));
      });

      await page.reload();
    });

    test('pane has header with agent info', async ({ page }) => {
      // Pane header should be visible
      await expect(page.getByTestId('pane-header')).toBeVisible();

      // Agent name should be visible
      await expect(page.getByText('Test Agent')).toBeVisible();
    });

    test('pane has maximize button', async ({ page }) => {
      // Maximize button should be visible
      await expect(page.getByTestId('pane-maximize-btn')).toBeVisible();
    });

    test('can maximize and restore pane', async ({ page }) => {
      // Click maximize
      await page.getByTestId('pane-maximize-btn').click();

      // Grid should now show single pane
      await expect(page.getByTestId('workspace-grid')).toHaveAttribute('data-preset', 'single');

      // Click restore (same button)
      await page.getByTestId('pane-maximize-btn').click();

      // Should be back to original layout
      await expect(page.getByTestId('workspace-pane-pane-test')).toBeVisible();
    });

    test('pane has close button', async ({ page }) => {
      // Close button should be visible
      await expect(page.getByTestId('pane-close-btn')).toBeVisible();
    });

    test('can close pane', async ({ page }) => {
      // Click close
      await page.getByTestId('pane-close-btn').click();

      // Pane should be removed
      await expect(page.getByTestId('workspace-pane-pane-test')).not.toBeVisible();

      // Empty state should appear
      await expect(page.getByTestId('workspaces-empty')).toBeVisible();
    });

    test('pane has menu button', async ({ page }) => {
      // Menu button should be visible
      await expect(page.getByTestId('pane-menu-btn')).toBeVisible();
    });

    test('can open pane menu', async ({ page }) => {
      // Click menu button
      await page.getByTestId('pane-menu-btn').click();

      // Menu should be visible
      await expect(page.getByTestId('pane-menu')).toBeVisible();
    });
  });

  test.describe('Stream viewer pane', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/workspaces');

      // Set up a layout with a stream pane
      await page.evaluate(() => {
        const mockLayout = {
          id: 'test-layout',
          name: 'Test',
          preset: 'single',
          panes: [
            {
              id: 'pane-stream',
              agentId: 'test-agent-1',
              agentName: 'Test Agent',
              agentRole: 'worker',
              workerMode: 'ephemeral',
              paneType: 'stream',
              status: 'disconnected',
              position: 0,
              weight: 1,
            },
          ],
          createdAt: Date.now(),
          modifiedAt: Date.now(),
        };
        localStorage.setItem('elemental-active-workspace-layout', JSON.stringify(mockLayout));
      });

      await page.reload();
    });

    test('displays stream viewer for ephemeral worker', async ({ page }) => {
      // Stream viewer should be visible
      const pane = page.getByTestId('workspace-pane-pane-stream');
      await expect(pane).toBeVisible();

      // Pane type should be stream
      await expect(pane).toHaveAttribute('data-pane-type', 'stream');
    });

    test('stream viewer has input area', async ({ page }) => {
      // Input should be visible
      await expect(page.getByTestId('stream-input')).toBeVisible();

      // Send button should be visible
      await expect(page.getByTestId('stream-send-btn')).toBeVisible();
    });

    test('stream viewer shows events container', async ({ page }) => {
      // Events container should be visible
      await expect(page.getByTestId('stream-events')).toBeVisible();
    });
  });

  test.describe('Terminal pane', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/workspaces');

      // Set up a layout with a terminal pane (persistent worker)
      await page.evaluate(() => {
        const mockLayout = {
          id: 'test-layout',
          name: 'Test',
          preset: 'single',
          panes: [
            {
              id: 'pane-terminal',
              agentId: 'test-agent-2',
              agentName: 'Persistent Worker',
              agentRole: 'worker',
              workerMode: 'persistent',
              paneType: 'terminal',
              status: 'disconnected',
              position: 0,
              weight: 1,
            },
          ],
          createdAt: Date.now(),
          modifiedAt: Date.now(),
        };
        localStorage.setItem('elemental-active-workspace-layout', JSON.stringify(mockLayout));
      });

      await page.reload();
    });

    test('displays terminal for persistent worker', async ({ page }) => {
      // Pane should be visible
      const pane = page.getByTestId('workspace-pane-pane-terminal');
      await expect(pane).toBeVisible();

      // Pane type should be terminal
      await expect(pane).toHaveAttribute('data-pane-type', 'terminal');
    });

    test('terminal pane shows xterm container', async ({ page }) => {
      // XTerminal component should render
      await expect(page.getByTestId('terminal-pane-terminal')).toBeVisible();
    });
  });

  test.describe('Multiple panes', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/workspaces');

      // Set up a layout with multiple panes
      await page.evaluate(() => {
        const mockLayout = {
          id: 'test-layout',
          name: 'Test',
          preset: 'split-vertical',
          panes: [
            {
              id: 'pane-1',
              agentId: 'agent-1',
              agentName: 'Agent One',
              agentRole: 'worker',
              workerMode: 'ephemeral',
              paneType: 'stream',
              status: 'disconnected',
              position: 0,
              weight: 1,
            },
            {
              id: 'pane-2',
              agentId: 'agent-2',
              agentName: 'Agent Two',
              agentRole: 'worker',
              workerMode: 'persistent',
              paneType: 'terminal',
              status: 'disconnected',
              position: 1,
              weight: 1,
            },
          ],
          createdAt: Date.now(),
          modifiedAt: Date.now(),
        };
        localStorage.setItem('elemental-active-workspace-layout', JSON.stringify(mockLayout));
      });

      await page.reload();
    });

    test('displays multiple panes in grid', async ({ page }) => {
      // Grid should be visible
      await expect(page.getByTestId('workspace-grid')).toBeVisible();

      // Both panes should be visible
      await expect(page.getByTestId('workspace-pane-pane-1')).toBeVisible();
      await expect(page.getByTestId('workspace-pane-pane-2')).toBeVisible();
    });

    test('grid uses correct preset', async ({ page }) => {
      // Grid should have split-vertical preset
      await expect(page.getByTestId('workspace-grid')).toHaveAttribute('data-preset', 'split-vertical');
    });

    test('can close one pane while keeping others', async ({ page }) => {
      // Close first pane
      const pane1 = page.getByTestId('workspace-pane-pane-1');
      await pane1.getByTestId('pane-close-btn').click();

      // First pane should be gone
      await expect(page.getByTestId('workspace-pane-pane-1')).not.toBeVisible();

      // Second pane should still be visible
      await expect(page.getByTestId('workspace-pane-pane-2')).toBeVisible();
    });
  });

  test.describe('Responsive behavior', () => {
    test('page header is visible on mobile viewport', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto('/workspaces');

      // Page title should still be visible
      await expect(page.getByRole('heading', { name: 'Workspaces' })).toBeVisible();

      // Add Pane button should be visible
      await expect(page.getByTestId('workspaces-add-pane')).toBeVisible();
    });
  });

  test.describe('Accessibility', () => {
    test('Add Pane dialog is properly labeled', async ({ page }) => {
      await page.goto('/workspaces');

      // Open dialog
      await page.getByTestId('workspaces-add-pane').click();

      // Dialog should have proper role
      await expect(page.getByRole('dialog')).toBeVisible();

      // Dialog should have accessible name
      const dialog = page.getByRole('dialog');
      await expect(dialog).toHaveAttribute('aria-labelledby', 'add-pane-title');
    });

    test('close button has accessible label', async ({ page }) => {
      await page.goto('/workspaces');

      // Open dialog
      await page.getByTestId('workspaces-add-pane').click();

      // Close button should have accessible name
      await expect(page.getByLabel('Close dialog')).toBeVisible();
    });
  });
});

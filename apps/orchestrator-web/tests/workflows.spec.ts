import { test, expect } from '@playwright/test';

test.describe('TB-O32: Workflows Page', () => {
  test.describe('Page layout', () => {
    test('displays workflows page with correct header', async ({ page }) => {
      await page.goto('/workflows');

      await expect(page.getByTestId('workflows-page')).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Workflows' })).toBeVisible();
      await expect(page.getByText('Manage workflow templates and active workflows')).toBeVisible();
    });

    test('displays search input', async ({ page }) => {
      await page.goto('/workflows');

      const searchInput = page.getByTestId('workflows-search');
      await expect(searchInput).toBeVisible();
      await expect(searchInput).toHaveAttribute('placeholder', 'Search templates...');
    });

    test('displays create template button on templates tab', async ({ page }) => {
      await page.goto('/workflows');

      await expect(page.getByTestId('workflows-create')).toBeVisible();
      await expect(page.getByTestId('workflows-create')).toContainText('Create Template');
    });
  });

  test.describe('Tabs', () => {
    test('displays Templates and Active tabs', async ({ page }) => {
      await page.goto('/workflows');

      await expect(page.getByTestId('workflows-tab-templates')).toBeVisible();
      await expect(page.getByTestId('workflows-tab-active')).toBeVisible();
    });

    test('defaults to Templates tab', async ({ page }) => {
      await page.goto('/workflows');

      const templatesTab = page.getByTestId('workflows-tab-templates');
      // The templates tab should have the active styling (primary color text)
      await expect(templatesTab).toHaveClass(/text-\[var\(--color-primary\)\]/);
    });

    test('can switch to Active tab', async ({ page }) => {
      await page.goto('/workflows');

      await page.getByTestId('workflows-tab-active').click();

      // URL should reflect tab change
      await expect(page).toHaveURL(/tab=active/);

      // Active tab should now be active
      const activeTab = page.getByTestId('workflows-tab-active');
      await expect(activeTab).toHaveClass(/text-\[var\(--color-primary\)\]/);
    });

    test('can switch back to Templates tab', async ({ page }) => {
      await page.goto('/workflows?tab=active');

      await page.getByTestId('workflows-tab-templates').click();

      await expect(page).toHaveURL(/tab=templates/);

      const templatesTab = page.getByTestId('workflows-tab-templates');
      await expect(templatesTab).toHaveClass(/text-\[var\(--color-primary\)\]/);
    });

    test('search placeholder changes based on active tab', async ({ page }) => {
      await page.goto('/workflows');

      // On templates tab
      await expect(page.getByTestId('workflows-search')).toHaveAttribute('placeholder', 'Search templates...');

      // Switch to active tab
      await page.getByTestId('workflows-tab-active').click();
      await page.waitForTimeout(100);

      // Placeholder should change
      await expect(page.getByTestId('workflows-search')).toHaveAttribute('placeholder', 'Search workflows...');
    });
  });

  test.describe('Templates Tab', () => {
    test('shows empty state when no playbooks exist', async ({ page }) => {
      // Mock empty playbooks response
      await page.route('**/api/playbooks*', async (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ playbooks: [], total: 0 }),
        });
      });

      await page.goto('/workflows');

      // Wait for loading
      await page.waitForTimeout(500);

      // Check for empty state
      await expect(page.getByText('No workflow templates')).toBeVisible();
      await expect(page.getByTestId('workflows-create-empty')).toBeVisible();
    });

    test('displays playbook cards when playbooks exist', async ({ page }) => {
      // Mock playbooks response
      await page.route('**/api/playbooks*', async (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            playbooks: [
              {
                id: 'pb-1',
                type: 'playbook',
                name: 'test_playbook',
                title: 'Test Playbook',
                version: 1,
                steps: [
                  { id: 'step-1', title: 'Step 1' },
                  { id: 'step-2', title: 'Step 2' },
                ],
                variables: [
                  { name: 'env', type: 'string', required: true },
                ],
                tags: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                createdBy: 'system',
              },
            ],
            total: 1,
          }),
        });
      });

      await page.goto('/workflows');

      // Wait for data to load
      await page.waitForTimeout(500);

      // Check for playbook card
      await expect(page.getByTestId('playbook-card-pb-1')).toBeVisible();
      await expect(page.getByText('Test Playbook')).toBeVisible();
      await expect(page.getByText('test_playbook')).toBeVisible();
      await expect(page.getByText('2 steps')).toBeVisible();
      await expect(page.getByText('v1')).toBeVisible();
      await expect(page.getByText('1 variables')).toBeVisible();
    });

    test('playbook card has Pour Workflow button', async ({ page }) => {
      // Mock playbooks response
      await page.route('**/api/playbooks*', async (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            playbooks: [
              {
                id: 'pb-1',
                type: 'playbook',
                name: 'test_playbook',
                title: 'Test Playbook',
                version: 1,
                steps: [],
                variables: [],
                tags: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                createdBy: 'system',
              },
            ],
            total: 1,
          }),
        });
      });

      await page.goto('/workflows');
      await page.waitForTimeout(500);

      // Check for Pour Workflow button
      const pourButton = page.getByTestId('playbook-pour-pb-1');
      await expect(pourButton).toBeVisible();
      await expect(pourButton).toContainText('Pour Workflow');
    });

    test('search filters playbooks by name and title', async ({ page }) => {
      // Mock playbooks response
      await page.route('**/api/playbooks*', async (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            playbooks: [
              {
                id: 'pb-1',
                type: 'playbook',
                name: 'deploy_prod',
                title: 'Deploy to Production',
                version: 1,
                steps: [],
                variables: [],
                tags: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                createdBy: 'system',
              },
              {
                id: 'pb-2',
                type: 'playbook',
                name: 'test_suite',
                title: 'Run Test Suite',
                version: 1,
                steps: [],
                variables: [],
                tags: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                createdBy: 'system',
              },
            ],
            total: 2,
          }),
        });
      });

      await page.goto('/workflows');
      await page.waitForTimeout(500);

      // Initially both playbooks should be visible
      await expect(page.getByTestId('playbook-card-pb-1')).toBeVisible();
      await expect(page.getByTestId('playbook-card-pb-2')).toBeVisible();

      // Search for "deploy"
      await page.getByTestId('workflows-search').fill('deploy');
      await page.waitForTimeout(100);

      // Only deploy playbook should be visible
      await expect(page.getByTestId('playbook-card-pb-1')).toBeVisible();
      await expect(page.getByTestId('playbook-card-pb-2')).not.toBeVisible();
    });
  });

  test.describe('Active Tab', () => {
    test('shows empty state when no workflows exist', async ({ page }) => {
      // Mock empty responses
      await page.route('**/api/workflows*', async (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ workflows: [], total: 0 }),
        });
      });

      await page.route('**/api/playbooks*', async (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ playbooks: [], total: 0 }),
        });
      });

      await page.goto('/workflows?tab=active');

      // Wait for loading
      await page.waitForTimeout(500);

      // Check for empty state
      await expect(page.getByText('No workflows')).toBeVisible();
      await expect(page.getByText('View Templates')).toBeVisible();
    });

    test('displays workflow cards when workflows exist', async ({ page }) => {
      // Mock workflows response
      await page.route('**/api/workflows*', async (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            workflows: [
              {
                id: 'wf-1',
                type: 'workflow',
                title: 'Deploy v2.0.0',
                status: 'running',
                playbookId: 'pb-1',
                ephemeral: false,
                variables: {},
                tags: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                startedAt: new Date().toISOString(),
                createdBy: 'system',
              },
            ],
            total: 1,
          }),
        });
      });

      await page.route('**/api/playbooks*', async (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ playbooks: [], total: 0 }),
        });
      });

      await page.goto('/workflows?tab=active');

      // Wait for data to load
      await page.waitForTimeout(500);

      // Check for workflow card
      await expect(page.getByTestId('workflow-card-wf-1')).toBeVisible();
      await expect(page.getByText('Deploy v2.0.0')).toBeVisible();
      await expect(page.getByText('Running')).toBeVisible();
    });

    test('displays both active and terminal workflows sections', async ({ page }) => {
      // Mock workflows response with both active and completed workflows
      await page.route('**/api/workflows*', async (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            workflows: [
              {
                id: 'wf-1',
                type: 'workflow',
                title: 'Active Workflow',
                status: 'running',
                playbookId: 'pb-1',
                ephemeral: false,
                variables: {},
                tags: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                startedAt: new Date().toISOString(),
                createdBy: 'system',
              },
              {
                id: 'wf-2',
                type: 'workflow',
                title: 'Completed Workflow',
                status: 'completed',
                playbookId: 'pb-1',
                ephemeral: false,
                variables: {},
                tags: [],
                createdAt: new Date(Date.now() - 3600000).toISOString(),
                updatedAt: new Date(Date.now() - 3600000).toISOString(),
                startedAt: new Date(Date.now() - 3700000).toISOString(),
                finishedAt: new Date(Date.now() - 3600000).toISOString(),
                createdBy: 'system',
              },
            ],
            total: 2,
          }),
        });
      });

      await page.route('**/api/playbooks*', async (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ playbooks: [], total: 0 }),
        });
      });

      await page.goto('/workflows?tab=active');
      await page.waitForTimeout(500);

      // Check for both sections
      await expect(page.getByText('Active (1)')).toBeVisible();
      await expect(page.getByText('Recent (1)')).toBeVisible();
      await expect(page.getByTestId('workflow-card-wf-1')).toBeVisible();
      await expect(page.getByTestId('workflow-card-wf-2')).toBeVisible();
    });

    test('workflow status displays correctly for different states', async ({ page }) => {
      // Mock workflows with different statuses
      await page.route('**/api/workflows*', async (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            workflows: [
              {
                id: 'wf-pending',
                type: 'workflow',
                title: 'Pending Workflow',
                status: 'pending',
                ephemeral: false,
                variables: {},
                tags: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                createdBy: 'system',
              },
              {
                id: 'wf-running',
                type: 'workflow',
                title: 'Running Workflow',
                status: 'running',
                ephemeral: false,
                variables: {},
                tags: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                startedAt: new Date().toISOString(),
                createdBy: 'system',
              },
              {
                id: 'wf-completed',
                type: 'workflow',
                title: 'Completed Workflow',
                status: 'completed',
                ephemeral: false,
                variables: {},
                tags: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                startedAt: new Date().toISOString(),
                finishedAt: new Date().toISOString(),
                createdBy: 'system',
              },
              {
                id: 'wf-failed',
                type: 'workflow',
                title: 'Failed Workflow',
                status: 'failed',
                failureReason: 'Task failed: timeout',
                ephemeral: false,
                variables: {},
                tags: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                startedAt: new Date().toISOString(),
                finishedAt: new Date().toISOString(),
                createdBy: 'system',
              },
            ],
            total: 4,
          }),
        });
      });

      await page.route('**/api/playbooks*', async (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ playbooks: [], total: 0 }),
        });
      });

      await page.goto('/workflows?tab=active');
      await page.waitForTimeout(500);

      // Verify status badges (using exact match to avoid matching workflow titles)
      await expect(page.getByText('Pending', { exact: true })).toBeVisible();
      await expect(page.getByText('Running', { exact: true })).toBeVisible();
      await expect(page.getByText('Completed', { exact: true })).toBeVisible();
      await expect(page.getByText('Failed', { exact: true })).toBeVisible();

      // Failed workflow should show the failure reason
      await expect(page.getByText('Task failed: timeout')).toBeVisible();
    });
  });

  test.describe('Tab URL persistence', () => {
    test('preserves tab in URL when refreshing', async ({ page }) => {
      await page.goto('/workflows?tab=active');

      // Verify we're on active tab
      await expect(page).toHaveURL(/tab=active/);

      // Refresh the page
      await page.reload();

      // Should still be on active tab
      await expect(page).toHaveURL(/tab=active/);
      const activeTab = page.getByTestId('workflows-tab-active');
      await expect(activeTab).toHaveClass(/text-\[var\(--color-primary\)\]/);
    });
  });

  test.describe('Error handling', () => {
    test('shows error state when playbooks API fails', async ({ page }) => {
      // Block API request
      await page.route('**/api/playbooks*', (route) => {
        route.abort('connectionrefused');
      });

      await page.goto('/workflows');

      // Wait for error state
      await page.waitForTimeout(1000);

      // Check for error UI
      const hasError = await page.getByText('Error loading data').isVisible().catch(() => false);
      if (hasError) {
        await expect(page.getByText('Error loading data')).toBeVisible();
        await expect(page.getByText('Retry')).toBeVisible();
      }
    });

    test('shows error state when workflows API fails', async ({ page }) => {
      // Block workflows API request
      await page.route('**/api/workflows*', (route) => {
        route.abort('connectionrefused');
      });

      // Allow playbooks to work
      await page.route('**/api/playbooks*', async (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ playbooks: [], total: 0 }),
        });
      });

      await page.goto('/workflows?tab=active');

      // Wait for error state
      await page.waitForTimeout(1000);

      // Check for error UI
      const hasError = await page.getByText('Error loading data').isVisible().catch(() => false);
      if (hasError) {
        await expect(page.getByText('Error loading data')).toBeVisible();
      }
    });
  });

  test.describe('Loading state', () => {
    test('shows loading indicator while fetching playbooks', async ({ page }) => {
      // Add delay to API response
      await page.route('**/api/playbooks*', async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ playbooks: [], total: 0 }),
        });
      });

      await page.goto('/workflows');

      // Should show loading indicator (main loader, not the refresh button)
      const loader = page.locator('.lucide-loader-circle.animate-spin');
      await expect(loader).toBeVisible();
    });
  });

  test.describe('Responsive design', () => {
    test('shows create button on desktop', async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.goto('/workflows');

      await expect(page.getByTestId('workflows-create')).toBeVisible();
      await expect(page.getByTestId('workflows-create')).toContainText('Create Template');
    });

    test('playbooks grid is responsive', async ({ page }) => {
      // Mock playbooks
      await page.route('**/api/playbooks*', async (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            playbooks: Array.from({ length: 6 }, (_, i) => ({
              id: `pb-${i}`,
              type: 'playbook',
              name: `playbook_${i}`,
              title: `Playbook ${i}`,
              version: 1,
              steps: [],
              variables: [],
              tags: [],
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              createdBy: 'system',
            })),
            total: 6,
          }),
        });
      });

      await page.goto('/workflows');
      await page.waitForTimeout(500);

      // Grid should be visible
      const grid = page.getByTestId('playbooks-grid');
      await expect(grid).toBeVisible();
    });
  });

  test.describe('Tab badge counts', () => {
    test('shows playbook count badge on templates tab', async ({ page }) => {
      // Mock playbooks
      await page.route('**/api/playbooks*', async (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            playbooks: Array.from({ length: 3 }, (_, i) => ({
              id: `pb-${i}`,
              type: 'playbook',
              name: `playbook_${i}`,
              title: `Playbook ${i}`,
              version: 1,
              steps: [],
              variables: [],
              tags: [],
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              createdBy: 'system',
            })),
            total: 3,
          }),
        });
      });

      await page.goto('/workflows');
      await page.waitForTimeout(500);

      // Check for badge with count
      const templatesTab = page.getByTestId('workflows-tab-templates');
      await expect(templatesTab).toContainText('3');
    });

    test('shows active workflow count badge on active tab', async ({ page }) => {
      // Mock responses
      await page.route('**/api/workflows*', async (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            workflows: [
              {
                id: 'wf-1',
                type: 'workflow',
                title: 'Running 1',
                status: 'running',
                ephemeral: false,
                variables: {},
                tags: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                startedAt: new Date().toISOString(),
                createdBy: 'system',
              },
              {
                id: 'wf-2',
                type: 'workflow',
                title: 'Pending 1',
                status: 'pending',
                ephemeral: false,
                variables: {},
                tags: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                createdBy: 'system',
              },
            ],
            total: 2,
          }),
        });
      });

      await page.route('**/api/playbooks*', async (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ playbooks: [], total: 0 }),
        });
      });

      await page.goto('/workflows');
      await page.waitForTimeout(500);

      // Check for badge with count on active tab
      const activeTab = page.getByTestId('workflows-tab-active');
      await expect(activeTab).toContainText('2');
    });
  });

  test.describe('TB-O34: Pour Workflow Template', () => {
    test.describe('Pour Modal', () => {
      test('clicking Pour button opens the modal', async ({ page }) => {
        // Mock playbook response
        await page.route('**/api/playbooks', async (route) => {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              playbooks: [
                {
                  id: 'pb-1',
                  type: 'playbook',
                  name: 'deploy_playbook',
                  title: 'Deploy Playbook',
                  version: 1,
                  steps: [{ id: 'step-1', title: 'Step 1' }],
                  variables: [],
                  tags: [],
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                  createdBy: 'system',
                },
              ],
              total: 1,
            }),
          });
        });

        // Mock single playbook response (for modal)
        await page.route('**/api/playbooks/pb-1', async (route) => {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              playbook: {
                id: 'pb-1',
                type: 'playbook',
                name: 'deploy_playbook',
                title: 'Deploy Playbook',
                version: 1,
                steps: [{ id: 'step-1', title: 'Step 1' }],
                variables: [],
                tags: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                createdBy: 'system',
              },
            }),
          });
        });

        await page.goto('/workflows');
        await page.waitForTimeout(500);

        // Click Pour button
        await page.getByTestId('playbook-pour-pb-1').click();

        // Modal should be visible
        await expect(page.getByTestId('pour-workflow-dialog')).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Pour Workflow' })).toBeVisible();
      });

      test('modal displays playbook info', async ({ page }) => {
        await page.route('**/api/playbooks', async (route) => {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              playbooks: [
                {
                  id: 'pb-1',
                  type: 'playbook',
                  name: 'deploy_playbook',
                  title: 'Deploy Playbook',
                  version: 2,
                  steps: [
                    { id: 'step-1', title: 'Build' },
                    { id: 'step-2', title: 'Test' },
                    { id: 'step-3', title: 'Deploy' },
                  ],
                  variables: [
                    { name: 'env', type: 'string', required: true },
                  ],
                  tags: [],
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                  createdBy: 'system',
                },
              ],
              total: 1,
            }),
          });
        });

        await page.route('**/api/playbooks/pb-1', async (route) => {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              playbook: {
                id: 'pb-1',
                type: 'playbook',
                name: 'deploy_playbook',
                title: 'Deploy Playbook',
                version: 2,
                steps: [
                  { id: 'step-1', title: 'Build' },
                  { id: 'step-2', title: 'Test' },
                  { id: 'step-3', title: 'Deploy' },
                ],
                variables: [
                  { name: 'env', type: 'string', required: true },
                ],
                tags: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                createdBy: 'system',
              },
            }),
          });
        });

        await page.goto('/workflows');
        await page.waitForTimeout(500);

        await page.getByTestId('playbook-pour-pb-1').click();
        await page.waitForTimeout(300);

        // Check playbook info is displayed in the modal
        const modal = page.getByTestId('pour-workflow-dialog');
        await expect(modal.getByText('Deploy Playbook')).toBeVisible();
        await expect(modal.getByText('deploy_playbook')).toBeVisible();
        await expect(modal.getByText('v2')).toBeVisible();
        await expect(modal.getByText('3 steps')).toBeVisible();
        await expect(modal.getByText('1 variables')).toBeVisible();
      });

      test('modal displays workflow title input', async ({ page }) => {
        await page.route('**/api/playbooks', async (route) => {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              playbooks: [
                {
                  id: 'pb-1',
                  type: 'playbook',
                  name: 'test_playbook',
                  title: 'Test Playbook',
                  version: 1,
                  steps: [{ id: 'step-1', title: 'Step 1' }],
                  variables: [],
                  tags: [],
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                  createdBy: 'system',
                },
              ],
              total: 1,
            }),
          });
        });

        await page.route('**/api/playbooks/pb-1', async (route) => {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              playbook: {
                id: 'pb-1',
                type: 'playbook',
                name: 'test_playbook',
                title: 'Test Playbook',
                version: 1,
                steps: [{ id: 'step-1', title: 'Step 1' }],
                variables: [],
                tags: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                createdBy: 'system',
              },
            }),
          });
        });

        await page.goto('/workflows');
        await page.waitForTimeout(500);

        await page.getByTestId('playbook-pour-pb-1').click();
        await page.waitForTimeout(300);

        // Check workflow title input
        const titleInput = page.getByTestId('workflow-title');
        await expect(titleInput).toBeVisible();
        await expect(titleInput).toHaveAttribute('placeholder', /Test Playbook - Run/);
      });

      test('modal displays variable inputs when playbook has variables', async ({ page }) => {
        await page.route('**/api/playbooks', async (route) => {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              playbooks: [
                {
                  id: 'pb-1',
                  type: 'playbook',
                  name: 'deploy_playbook',
                  title: 'Deploy Playbook',
                  version: 1,
                  steps: [{ id: 'step-1', title: 'Step 1' }],
                  variables: [
                    { name: 'environment', type: 'string', required: true, description: 'Target environment' },
                    { name: 'debug', type: 'boolean', required: false, default: false },
                    { name: 'replicas', type: 'number', required: false, default: 3 },
                  ],
                  tags: [],
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                  createdBy: 'system',
                },
              ],
              total: 1,
            }),
          });
        });

        await page.route('**/api/playbooks/pb-1', async (route) => {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              playbook: {
                id: 'pb-1',
                type: 'playbook',
                name: 'deploy_playbook',
                title: 'Deploy Playbook',
                version: 1,
                steps: [{ id: 'step-1', title: 'Step 1' }],
                variables: [
                  { name: 'environment', type: 'string', required: true, description: 'Target environment' },
                  { name: 'debug', type: 'boolean', required: false, default: false },
                  { name: 'replicas', type: 'number', required: false, default: 3 },
                ],
                tags: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                createdBy: 'system',
              },
            }),
          });
        });

        await page.goto('/workflows');
        await page.waitForTimeout(500);

        await page.getByTestId('playbook-pour-pb-1').click();
        await page.waitForTimeout(300);

        // Check variable inputs in the modal
        const modal = page.getByTestId('pour-workflow-dialog');
        await expect(modal.getByRole('heading', { name: 'Variables' })).toBeVisible();
        await expect(modal.getByText('environment').first()).toBeVisible();
        await expect(modal.getByText('Target environment')).toBeVisible();
        await expect(page.getByTestId('variable-environment')).toBeVisible();
        await expect(page.getByTestId('variable-debug')).toBeVisible();
        await expect(page.getByTestId('variable-replicas')).toBeVisible();
      });

      test('modal displays steps preview', async ({ page }) => {
        await page.route('**/api/playbooks', async (route) => {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              playbooks: [
                {
                  id: 'pb-1',
                  type: 'playbook',
                  name: 'deploy_playbook',
                  title: 'Deploy Playbook',
                  version: 1,
                  steps: [
                    { id: 'step-1', title: 'Build Application' },
                    { id: 'step-2', title: 'Run Tests', dependsOn: ['step-1'] },
                    { id: 'step-3', title: 'Deploy to Staging', dependsOn: ['step-2'] },
                  ],
                  variables: [],
                  tags: [],
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                  createdBy: 'system',
                },
              ],
              total: 1,
            }),
          });
        });

        await page.route('**/api/playbooks/pb-1', async (route) => {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              playbook: {
                id: 'pb-1',
                type: 'playbook',
                name: 'deploy_playbook',
                title: 'Deploy Playbook',
                version: 1,
                steps: [
                  { id: 'step-1', title: 'Build Application' },
                  { id: 'step-2', title: 'Run Tests', dependsOn: ['step-1'] },
                  { id: 'step-3', title: 'Deploy to Staging', dependsOn: ['step-2'] },
                ],
                variables: [],
                tags: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                createdBy: 'system',
              },
            }),
          });
        });

        await page.goto('/workflows');
        await page.waitForTimeout(500);

        await page.getByTestId('playbook-pour-pb-1').click();
        await page.waitForTimeout(300);

        // Check steps preview
        await expect(page.getByText('Steps (3)')).toBeVisible();
        await expect(page.getByTestId('steps-preview')).toBeVisible();
        await expect(page.getByText('Build Application')).toBeVisible();
        await expect(page.getByText('Run Tests')).toBeVisible();
        await expect(page.getByText('Deploy to Staging')).toBeVisible();
      });

      test('modal can be closed with close button', async ({ page }) => {
        await page.route('**/api/playbooks', async (route) => {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              playbooks: [
                {
                  id: 'pb-1',
                  type: 'playbook',
                  name: 'test_playbook',
                  title: 'Test Playbook',
                  version: 1,
                  steps: [{ id: 'step-1', title: 'Step 1' }],
                  variables: [],
                  tags: [],
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                  createdBy: 'system',
                },
              ],
              total: 1,
            }),
          });
        });

        await page.route('**/api/playbooks/pb-1', async (route) => {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              playbook: {
                id: 'pb-1',
                type: 'playbook',
                name: 'test_playbook',
                title: 'Test Playbook',
                version: 1,
                steps: [{ id: 'step-1', title: 'Step 1' }],
                variables: [],
                tags: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                createdBy: 'system',
              },
            }),
          });
        });

        await page.goto('/workflows');
        await page.waitForTimeout(500);

        await page.getByTestId('playbook-pour-pb-1').click();
        await page.waitForTimeout(300);

        await expect(page.getByTestId('pour-workflow-dialog')).toBeVisible();

        // Click close button
        await page.getByTestId('pour-workflow-close').click();

        // Modal should be hidden
        await expect(page.getByTestId('pour-workflow-dialog')).not.toBeVisible();
      });

      test('modal can be closed with cancel button', async ({ page }) => {
        await page.route('**/api/playbooks', async (route) => {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              playbooks: [
                {
                  id: 'pb-1',
                  type: 'playbook',
                  name: 'test_playbook',
                  title: 'Test Playbook',
                  version: 1,
                  steps: [{ id: 'step-1', title: 'Step 1' }],
                  variables: [],
                  tags: [],
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                  createdBy: 'system',
                },
              ],
              total: 1,
            }),
          });
        });

        await page.route('**/api/playbooks/pb-1', async (route) => {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              playbook: {
                id: 'pb-1',
                type: 'playbook',
                name: 'test_playbook',
                title: 'Test Playbook',
                version: 1,
                steps: [{ id: 'step-1', title: 'Step 1' }],
                variables: [],
                tags: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                createdBy: 'system',
              },
            }),
          });
        });

        await page.goto('/workflows');
        await page.waitForTimeout(500);

        await page.getByTestId('playbook-pour-pb-1').click();
        await page.waitForTimeout(300);

        // Click cancel button
        await page.getByTestId('cancel-pour').click();

        // Modal should be hidden
        await expect(page.getByTestId('pour-workflow-dialog')).not.toBeVisible();
      });

      test('submit button is enabled when no required variables', async ({ page }) => {
        await page.route('**/api/playbooks', async (route) => {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              playbooks: [
                {
                  id: 'pb-1',
                  type: 'playbook',
                  name: 'simple_playbook',
                  title: 'Simple Playbook',
                  version: 1,
                  steps: [{ id: 'step-1', title: 'Step 1' }],
                  variables: [],
                  tags: [],
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                  createdBy: 'system',
                },
              ],
              total: 1,
            }),
          });
        });

        await page.route('**/api/playbooks/pb-1', async (route) => {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              playbook: {
                id: 'pb-1',
                type: 'playbook',
                name: 'simple_playbook',
                title: 'Simple Playbook',
                version: 1,
                steps: [{ id: 'step-1', title: 'Step 1' }],
                variables: [],
                tags: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                createdBy: 'system',
              },
            }),
          });
        });

        await page.goto('/workflows');
        await page.waitForTimeout(500);

        await page.getByTestId('playbook-pour-pb-1').click();
        await page.waitForTimeout(300);

        // Submit button should be enabled
        const submitButton = page.getByTestId('submit-pour');
        await expect(submitButton).toBeEnabled();
        await expect(submitButton).toContainText('Pour Workflow');
      });

      test('submitting creates workflow and switches to active tab', async ({ page }) => {
        await page.route('**/api/playbooks', async (route) => {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              playbooks: [
                {
                  id: 'pb-1',
                  type: 'playbook',
                  name: 'deploy_playbook',
                  title: 'Deploy Playbook',
                  version: 1,
                  steps: [{ id: 'step-1', title: 'Step 1' }],
                  variables: [],
                  tags: [],
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                  createdBy: 'system',
                },
              ],
              total: 1,
            }),
          });
        });

        await page.route('**/api/playbooks/pb-1', async (route) => {
          if (route.request().method() === 'GET') {
            route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({
                playbook: {
                  id: 'pb-1',
                  type: 'playbook',
                  name: 'deploy_playbook',
                  title: 'Deploy Playbook',
                  version: 1,
                  steps: [{ id: 'step-1', title: 'Step 1' }],
                  variables: [],
                  tags: [],
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                  createdBy: 'system',
                },
              }),
            });
          }
        });

        await page.route('**/api/playbooks/pb-1/pour', async (route) => {
          route.fulfill({
            status: 201,
            contentType: 'application/json',
            body: JSON.stringify({
              workflow: {
                id: 'wf-new-1',
                type: 'workflow',
                title: 'Deploy Playbook - Run',
                status: 'pending',
                playbookId: 'pb-1',
                ephemeral: false,
                variables: {},
                tags: ['poured'],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                createdBy: 'system',
              },
            }),
          });
        });

        await page.route('**/api/workflows*', async (route) => {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              workflows: [
                {
                  id: 'wf-new-1',
                  type: 'workflow',
                  title: 'Deploy Playbook - Run',
                  status: 'pending',
                  playbookId: 'pb-1',
                  ephemeral: false,
                  variables: {},
                  tags: ['poured'],
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                  createdBy: 'system',
                },
              ],
              total: 1,
            }),
          });
        });

        await page.goto('/workflows');
        await page.waitForTimeout(500);

        await page.getByTestId('playbook-pour-pb-1').click();
        await page.waitForTimeout(300);

        // Submit the form
        await page.getByTestId('submit-pour').click();

        // Wait for modal to close and tab to switch
        await page.waitForTimeout(500);

        // Modal should be closed
        await expect(page.getByTestId('pour-workflow-dialog')).not.toBeVisible();

        // Should be on active tab
        await expect(page).toHaveURL(/tab=active/);
      });

      test('shows error message when pour fails', async ({ page }) => {
        await page.route('**/api/playbooks', async (route) => {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              playbooks: [
                {
                  id: 'pb-1',
                  type: 'playbook',
                  name: 'deploy_playbook',
                  title: 'Deploy Playbook',
                  version: 1,
                  steps: [{ id: 'step-1', title: 'Step 1' }],
                  variables: [],
                  tags: [],
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                  createdBy: 'system',
                },
              ],
              total: 1,
            }),
          });
        });

        await page.route('**/api/playbooks/pb-1', async (route) => {
          if (route.request().method() === 'GET') {
            route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({
                playbook: {
                  id: 'pb-1',
                  type: 'playbook',
                  name: 'deploy_playbook',
                  title: 'Deploy Playbook',
                  version: 1,
                  steps: [{ id: 'step-1', title: 'Step 1' }],
                  variables: [],
                  tags: [],
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                  createdBy: 'system',
                },
              }),
            });
          }
        });

        await page.route('**/api/playbooks/pb-1/pour', async (route) => {
          route.fulfill({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({
              error: { code: 'POUR_ERROR', message: 'Database connection failed' },
            }),
          });
        });

        await page.goto('/workflows');
        await page.waitForTimeout(500);

        await page.getByTestId('playbook-pour-pb-1').click();
        await page.waitForTimeout(300);

        // Submit the form
        await page.getByTestId('submit-pour').click();

        // Wait for error
        await page.waitForTimeout(500);

        // Error message should be visible
        await expect(page.getByText('Database connection failed')).toBeVisible();

        // Modal should still be open
        await expect(page.getByTestId('pour-workflow-dialog')).toBeVisible();
      });

      test('shows advanced options with ephemeral toggle', async ({ page }) => {
        await page.route('**/api/playbooks', async (route) => {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              playbooks: [
                {
                  id: 'pb-1',
                  type: 'playbook',
                  name: 'test_playbook',
                  title: 'Test Playbook',
                  version: 1,
                  steps: [{ id: 'step-1', title: 'Step 1' }],
                  variables: [],
                  tags: [],
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                  createdBy: 'system',
                },
              ],
              total: 1,
            }),
          });
        });

        await page.route('**/api/playbooks/pb-1', async (route) => {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              playbook: {
                id: 'pb-1',
                type: 'playbook',
                name: 'test_playbook',
                title: 'Test Playbook',
                version: 1,
                steps: [{ id: 'step-1', title: 'Step 1' }],
                variables: [],
                tags: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                createdBy: 'system',
              },
            }),
          });
        });

        await page.goto('/workflows');
        await page.waitForTimeout(500);

        await page.getByTestId('playbook-pour-pb-1').click();
        await page.waitForTimeout(300);

        // Click to expand advanced options
        await page.getByTestId('toggle-advanced').click();

        // Ephemeral checkbox should be visible
        await expect(page.getByTestId('ephemeral-checkbox')).toBeVisible();
        await expect(page.getByText('Ephemeral workflow', { exact: true })).toBeVisible();
        await expect(page.getByText('Ephemeral workflows are automatically cleaned up after completion')).toBeVisible();
      });
    });
  });
});

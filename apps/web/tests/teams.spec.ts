import { test, expect } from '@playwright/test';

test.describe('TB37: Teams Page - List View', () => {
  test('teams endpoint is accessible', async ({ page }) => {
    const response = await page.request.get('/api/teams');
    expect(response.ok()).toBe(true);
    const data = await response.json();
    expect(Array.isArray(data)).toBe(true);
  });

  test('teams page is accessible via navigation', async ({ page }) => {
    await page.goto('/teams');
    await expect(page.getByTestId('teams-page')).toBeVisible({ timeout: 10000 });
  });

  test('sidebar has Teams nav item', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByTestId('sidebar')).toBeVisible({ timeout: 10000 });

    // Check for Teams link in sidebar
    const teamsLink = page.getByRole('link', { name: /Teams/i });
    await expect(teamsLink).toBeVisible();
  });

  test('can navigate to Teams from sidebar', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByTestId('sidebar')).toBeVisible({ timeout: 10000 });

    // Click Teams link
    await page.getByRole('link', { name: /Teams/i }).click();

    // Should be on teams page
    await expect(page.getByTestId('teams-page')).toBeVisible({ timeout: 10000 });
    await expect(page).toHaveURL('/teams');
  });

  test('teams page shows search box', async ({ page }) => {
    await page.goto('/teams');
    await expect(page.getByTestId('teams-page')).toBeVisible({ timeout: 10000 });

    // Check for search box
    await expect(page.getByTestId('team-search')).toBeVisible();
    await expect(page.getByTestId('team-search-input')).toBeVisible();
  });

  test('teams page shows appropriate content based on teams', async ({ page }) => {
    // Get teams from API
    const response = await page.request.get('/api/teams');
    const teams = await response.json();

    await page.goto('/teams');
    await expect(page.getByTestId('teams-page')).toBeVisible({ timeout: 10000 });

    // Wait for loading to complete
    await expect(page.getByTestId('teams-loading')).not.toBeVisible({ timeout: 10000 });

    if (teams.length === 0) {
      // Should show empty state
      await expect(page.getByTestId('teams-empty')).toBeVisible();
      await expect(page.getByText('No teams created')).toBeVisible();
    } else {
      // Should show teams grid
      await expect(page.getByTestId('teams-grid')).toBeVisible();
      // Should show correct count in header
      await expect(page.getByText(new RegExp(`${teams.length} of ${teams.length}`))).toBeVisible();
    }
  });

  test('search filters teams by name', async ({ page }) => {
    // Get teams from API
    const response = await page.request.get('/api/teams');
    const teams = await response.json();

    if (teams.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/teams');
    await expect(page.getByTestId('teams-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('teams-loading')).not.toBeVisible({ timeout: 10000 });

    // Get first team name
    const firstTeam = teams[0];
    const searchTerm = firstTeam.name.substring(0, 3);

    // Type in search box
    await page.getByTestId('team-search-input').fill(searchTerm);

    // Wait for filtering to apply
    await page.waitForTimeout(100);

    // Should show filtered results
    const matchingTeams = teams.filter((t: { name: string; id: string; tags?: string[] }) =>
      t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (t.tags || []).some((tag: string) => tag.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    if (matchingTeams.length > 0) {
      await expect(page.getByTestId('teams-grid')).toBeVisible();
    }
  });

  test('team cards display correct information', async ({ page }) => {
    // Get teams from API
    const response = await page.request.get('/api/teams');
    const teams = await response.json();

    if (teams.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/teams');
    await expect(page.getByTestId('teams-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('teams-loading')).not.toBeVisible({ timeout: 10000 });

    // Check first team card
    const firstTeam = teams[0];
    const card = page.getByTestId(`team-card-${firstTeam.id}`);
    await expect(card).toBeVisible();

    // Check for avatar
    await expect(page.getByTestId(`team-avatar-${firstTeam.id}`)).toBeVisible();

    // Check for member count badge
    await expect(page.getByTestId(`team-member-count-${firstTeam.id}`)).toBeVisible();
  });

  test('team cards show member avatar stack when team has members', async ({ page }) => {
    // Get teams from API
    const response = await page.request.get('/api/teams');
    const teams = await response.json();

    // Find a team with members
    const teamWithMembers = teams.find((t: { members: string[] }) => t.members && t.members.length > 0);

    if (!teamWithMembers) {
      test.skip();
      return;
    }

    await page.goto('/teams');
    await expect(page.getByTestId('teams-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('teams-loading')).not.toBeVisible({ timeout: 10000 });

    // Check the team card
    const card = page.getByTestId(`team-card-${teamWithMembers.id}`);
    await expect(card).toBeVisible();

    // Should show member avatar stack
    await expect(card.getByTestId('member-avatar-stack')).toBeVisible();
  });

  test('search with no results shows empty state', async ({ page }) => {
    await page.goto('/teams');
    await expect(page.getByTestId('teams-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('teams-loading')).not.toBeVisible({ timeout: 10000 });

    // Type a nonsense search term
    await page.getByTestId('team-search-input').fill('xyznonexistent123456');

    // Wait for filtering to apply
    await page.waitForTimeout(100);

    // Should show empty state with clear search option
    await expect(page.getByTestId('teams-empty')).toBeVisible();
    await expect(page.getByText('No teams match your search')).toBeVisible();
    await expect(page.getByTestId('clear-search-button')).toBeVisible();
  });

  test('clear search button works', async ({ page }) => {
    // Get teams from API
    const response = await page.request.get('/api/teams');
    const teams = await response.json();

    await page.goto('/teams');
    await expect(page.getByTestId('teams-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('teams-loading')).not.toBeVisible({ timeout: 10000 });

    // Type a nonsense search term
    await page.getByTestId('team-search-input').fill('xyznonexistent123456');

    // Wait for filtering
    await page.waitForTimeout(100);

    // Should show empty state
    await expect(page.getByTestId('teams-empty')).toBeVisible();

    // Click clear search
    await page.getByTestId('clear-search-button').click();

    // Should now show all teams (or empty state if no teams exist)
    if (teams.length > 0) {
      await expect(page.getByTestId('teams-grid')).toBeVisible();
      await expect(page.getByText(new RegExp(`${teams.length} of ${teams.length}`))).toBeVisible();
    } else {
      await expect(page.getByText('No teams created')).toBeVisible();
    }
  });

  test('clicking team card opens detail panel', async ({ page }) => {
    // Get teams from API
    const response = await page.request.get('/api/teams');
    const teams = await response.json();

    if (teams.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/teams');
    await expect(page.getByTestId('teams-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('teams-loading')).not.toBeVisible({ timeout: 10000 });

    // Click first team card
    const firstTeam = teams[0];
    await page.getByTestId(`team-card-${firstTeam.id}`).click();

    // Detail panel should be visible
    await expect(page.getByTestId('team-detail-container')).toBeVisible();
    await expect(page.getByTestId('team-detail-panel')).toBeVisible();
  });

  test('detail panel shows team information', async ({ page }) => {
    // Get teams from API
    const response = await page.request.get('/api/teams');
    const teams = await response.json();

    if (teams.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/teams');
    await expect(page.getByTestId('teams-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('teams-loading')).not.toBeVisible({ timeout: 10000 });

    // Click first team card
    const firstTeam = teams[0];
    await page.getByTestId(`team-card-${firstTeam.id}`).click();

    // Wait for detail panel to load
    await expect(page.getByTestId('team-detail-panel')).toBeVisible({ timeout: 10000 });

    // Should show team name in detail panel
    const detailPanel = page.getByTestId('team-detail-panel');
    await expect(detailPanel.getByRole('heading', { name: firstTeam.name })).toBeVisible();

    // Should show members section header
    await expect(page.getByText(/Team Members/)).toBeVisible();
  });

  test('close button closes detail panel', async ({ page }) => {
    // Get teams from API
    const response = await page.request.get('/api/teams');
    const teams = await response.json();

    if (teams.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/teams');
    await expect(page.getByTestId('teams-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('teams-loading')).not.toBeVisible({ timeout: 10000 });

    // Click first team card
    const firstTeam = teams[0];
    await page.getByTestId(`team-card-${firstTeam.id}`).click();

    // Detail panel should be visible
    await expect(page.getByTestId('team-detail-panel')).toBeVisible({ timeout: 10000 });

    // Click close button
    await page.getByTestId('team-detail-close').click();

    // Detail panel should be hidden
    await expect(page.getByTestId('team-detail-container')).not.toBeVisible();
  });

  test('split-view layout works correctly', async ({ page }) => {
    // Get teams from API
    const response = await page.request.get('/api/teams');
    const teams = await response.json();

    if (teams.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/teams');
    await expect(page.getByTestId('teams-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('teams-loading')).not.toBeVisible({ timeout: 10000 });

    // Initially, team grid should be full width (3 columns on lg)
    const grid = page.getByTestId('teams-grid').locator('> div');
    await expect(grid).toHaveClass(/lg:grid-cols-3/);

    // Click first team card
    const firstTeam = teams[0];
    await page.getByTestId(`team-card-${firstTeam.id}`).click();

    // Now grid should be single column (detail panel takes half)
    await expect(grid).toHaveClass(/grid-cols-1/);
    await expect(grid).not.toHaveClass(/lg:grid-cols-3/);
  });

  test('selected team card is highlighted', async ({ page }) => {
    // Get teams from API
    const response = await page.request.get('/api/teams');
    const teams = await response.json();

    if (teams.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/teams');
    await expect(page.getByTestId('teams-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('teams-loading')).not.toBeVisible({ timeout: 10000 });

    // Click first team card
    const firstTeam = teams[0];
    const card = page.getByTestId(`team-card-${firstTeam.id}`);
    await card.click();

    // Card should have selected styling (blue border)
    await expect(card).toHaveClass(/border-blue-500/);
    await expect(card).toHaveClass(/ring-2/);
  });

  test('detail panel shows team members when team has members', async ({ page }) => {
    // Get teams from API
    const response = await page.request.get('/api/teams');
    const teams = await response.json();

    // Find a team with members
    const teamWithMembers = teams.find((t: { members: string[] }) => t.members && t.members.length > 0);

    if (!teamWithMembers) {
      test.skip();
      return;
    }

    await page.goto('/teams');
    await expect(page.getByTestId('teams-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('teams-loading')).not.toBeVisible({ timeout: 10000 });

    // Click the team card
    await page.getByTestId(`team-card-${teamWithMembers.id}`).click();

    // Wait for detail panel to load
    await expect(page.getByTestId('team-detail-panel')).toBeVisible({ timeout: 10000 });

    // Should show members list or member count message
    const memberCount = teamWithMembers.members.length;
    await expect(page.getByText(new RegExp(`${memberCount}`))).toBeVisible();
  });

  test('team members endpoint returns members', async ({ page }) => {
    // Get teams from API
    const response = await page.request.get('/api/teams');
    const teams = await response.json();

    // Find a team with members
    const teamWithMembers = teams.find((t: { members: string[] }) => t.members && t.members.length > 0);

    if (!teamWithMembers) {
      test.skip();
      return;
    }

    // Get members from API
    const membersResponse = await page.request.get(`/api/teams/${teamWithMembers.id}/members`);
    expect(membersResponse.ok()).toBe(true);
    const members = await membersResponse.json();
    expect(Array.isArray(members)).toBe(true);
  });

  test('team detail endpoint returns team', async ({ page }) => {
    // Get teams from API
    const response = await page.request.get('/api/teams');
    const teams = await response.json();

    if (teams.length === 0) {
      test.skip();
      return;
    }

    // Get first team from API
    const teamResponse = await page.request.get(`/api/teams/${teams[0].id}`);
    expect(teamResponse.ok()).toBe(true);
    const team = await teamResponse.json();
    expect(team.id).toBe(teams[0].id);
    expect(team.name).toBe(teams[0].name);
    expect(team.type).toBe('team');
  });
});

test.describe('TB38: Team Detail Panel', () => {
  test('team stats endpoint is accessible', async ({ page }) => {
    // Get teams from API
    const response = await page.request.get('/api/teams');
    const teams = await response.json();

    if (teams.length === 0) {
      test.skip();
      return;
    }

    // Get stats for first team
    const firstTeam = teams[0];
    const statsResponse = await page.request.get(`/api/teams/${firstTeam.id}/stats`);
    expect(statsResponse.ok()).toBe(true);
    const stats = await statsResponse.json();
    expect(typeof stats.memberCount).toBe('number');
    expect(typeof stats.totalTasksAssigned).toBe('number');
    expect(typeof stats.activeTasksAssigned).toBe('number');
    expect(typeof stats.completedTasksAssigned).toBe('number');
    expect(typeof stats.createdByTeamMembers).toBe('number');
    expect(Array.isArray(stats.workloadDistribution)).toBe(true);
  });

  test('team stats endpoint returns 404 for non-existent team', async ({ page }) => {
    const statsResponse = await page.request.get('/api/teams/nonexistent-team-id/stats');
    expect(statsResponse.ok()).toBe(false);
    expect(statsResponse.status()).toBe(404);
  });

  test('detail panel shows statistics section', async ({ page }) => {
    // Get teams from API
    const response = await page.request.get('/api/teams');
    const teams = await response.json();

    if (teams.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/teams');
    await expect(page.getByTestId('teams-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('teams-loading')).not.toBeVisible({ timeout: 10000 });

    // Click first team card
    const firstTeam = teams[0];
    await page.getByTestId(`team-card-${firstTeam.id}`).click();

    // Wait for detail panel to load
    await expect(page.getByTestId('team-detail-panel')).toBeVisible({ timeout: 10000 });

    // Should show statistics section
    await expect(page.getByText('Statistics')).toBeVisible();
    await expect(page.getByTestId('team-stats')).toBeVisible({ timeout: 10000 });
  });

  test('detail panel shows total tasks stat', async ({ page }) => {
    // Get teams from API
    const response = await page.request.get('/api/teams');
    const teams = await response.json();

    if (teams.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/teams');
    await expect(page.getByTestId('teams-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('teams-loading')).not.toBeVisible({ timeout: 10000 });

    // Click first team card
    const firstTeam = teams[0];
    await page.getByTestId(`team-card-${firstTeam.id}`).click();

    // Wait for detail panel and stats to load
    await expect(page.getByTestId('team-detail-panel')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('team-stats')).toBeVisible({ timeout: 10000 });

    // Should show Total Tasks stat
    await expect(page.getByText('Total Tasks')).toBeVisible();
  });

  test('detail panel shows active tasks stat', async ({ page }) => {
    // Get teams from API
    const response = await page.request.get('/api/teams');
    const teams = await response.json();

    if (teams.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/teams');
    await expect(page.getByTestId('teams-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('teams-loading')).not.toBeVisible({ timeout: 10000 });

    // Click first team card
    const firstTeam = teams[0];
    await page.getByTestId(`team-card-${firstTeam.id}`).click();

    // Wait for detail panel and stats to load
    await expect(page.getByTestId('team-detail-panel')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('team-stats')).toBeVisible({ timeout: 10000 });

    // Should show Active Tasks stat
    await expect(page.getByText('Active Tasks')).toBeVisible();
  });

  test('detail panel shows completed tasks stat', async ({ page }) => {
    // Get teams from API
    const response = await page.request.get('/api/teams');
    const teams = await response.json();

    if (teams.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/teams');
    await expect(page.getByTestId('teams-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('teams-loading')).not.toBeVisible({ timeout: 10000 });

    // Click first team card
    const firstTeam = teams[0];
    await page.getByTestId(`team-card-${firstTeam.id}`).click();

    // Wait for detail panel and stats to load
    await expect(page.getByTestId('team-detail-panel')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('team-stats')).toBeVisible({ timeout: 10000 });

    // Should show Completed stat
    await expect(page.getByText('Completed')).toBeVisible();
  });

  test('detail panel shows created by team stat', async ({ page }) => {
    // Get teams from API
    const response = await page.request.get('/api/teams');
    const teams = await response.json();

    if (teams.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/teams');
    await expect(page.getByTestId('teams-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('teams-loading')).not.toBeVisible({ timeout: 10000 });

    // Click first team card
    const firstTeam = teams[0];
    await page.getByTestId(`team-card-${firstTeam.id}`).click();

    // Wait for detail panel and stats to load
    await expect(page.getByTestId('team-detail-panel')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('team-stats')).toBeVisible({ timeout: 10000 });

    // Should show Created by Team stat
    await expect(page.getByText('Created by Team')).toBeVisible();
  });

  test('detail panel shows workload distribution when team has assigned tasks', async ({ page }) => {
    // Get teams from API
    const response = await page.request.get('/api/teams');
    const teams = await response.json();

    if (teams.length === 0) {
      test.skip();
      return;
    }

    // Find a team with members and check if they have tasks
    const teamWithMembers = teams.find((t: { members: string[] }) => t.members && t.members.length > 0);

    if (!teamWithMembers) {
      test.skip();
      return;
    }

    // Get stats to check if there are assigned tasks
    const statsResponse = await page.request.get(`/api/teams/${teamWithMembers.id}/stats`);
    const stats = await statsResponse.json();

    if (stats.totalTasksAssigned === 0) {
      test.skip();
      return;
    }

    await page.goto('/teams');
    await expect(page.getByTestId('teams-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('teams-loading')).not.toBeVisible({ timeout: 10000 });

    // Click the team card
    await page.getByTestId(`team-card-${teamWithMembers.id}`).click();

    // Wait for detail panel to load
    await expect(page.getByTestId('team-detail-panel')).toBeVisible({ timeout: 10000 });

    // Should show workload distribution section
    await expect(page.getByText('Workload Distribution')).toBeVisible();
    await expect(page.getByTestId('team-workload')).toBeVisible();
  });

  test('detail panel shows members list', async ({ page }) => {
    // Get teams from API
    const response = await page.request.get('/api/teams');
    const teams = await response.json();

    // Find a team with members
    const teamWithMembers = teams.find((t: { members: string[] }) => t.members && t.members.length > 0);

    if (!teamWithMembers) {
      test.skip();
      return;
    }

    await page.goto('/teams');
    await expect(page.getByTestId('teams-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('teams-loading')).not.toBeVisible({ timeout: 10000 });

    // Click the team card
    await page.getByTestId(`team-card-${teamWithMembers.id}`).click();

    // Wait for detail panel to load
    await expect(page.getByTestId('team-detail-panel')).toBeVisible({ timeout: 10000 });

    // Should show Team Members section
    await expect(page.getByText(/Team Members/)).toBeVisible();

    // Wait for members list to load
    await expect(page.getByTestId('team-members-list')).toBeVisible({ timeout: 10000 });
  });

  test('members list shows member items with type badges', async ({ page }) => {
    // Get teams from API
    const response = await page.request.get('/api/teams');
    const teams = await response.json();

    // Find a team with members
    const teamWithMembers = teams.find((t: { members: string[] }) => t.members && t.members.length > 0);

    if (!teamWithMembers) {
      test.skip();
      return;
    }

    // Get the members
    const membersResponse = await page.request.get(`/api/teams/${teamWithMembers.id}/members`);
    const members = await membersResponse.json();

    if (members.length === 0) {
      test.skip();
      return;
    }

    await page.goto('/teams');
    await expect(page.getByTestId('teams-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('teams-loading')).not.toBeVisible({ timeout: 10000 });

    // Click the team card
    await page.getByTestId(`team-card-${teamWithMembers.id}`).click();

    // Wait for detail panel and members list to load
    await expect(page.getByTestId('team-detail-panel')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('team-members-list')).toBeVisible({ timeout: 10000 });

    // Check first member item is visible
    const firstMember = members[0];
    await expect(page.getByTestId(`member-item-${firstMember.id}`)).toBeVisible();
  });
});

import { test, expect, Page } from '@playwright/test';

test.describe('TB112: @Mention in Tasks', () => {
  // Helper to get first entity for testing
  async function getFirstEntity(page: Page): Promise<{ id: string; name: string } | null> {
    const response = await page.request.get('/api/entities');
    const data = await response.json();
    const entities = data.items || data;
    return entities.length > 0 ? entities[0] : null;
  }

  // Helper to create a test task with notes containing @mention
  async function createTaskWithMentionInNotes(
    page: Page,
    entityId: string,
    entityName: string
  ): Promise<{ id: string; title: string }> {
    const title = `Mention Test Task ${Date.now()}`;
    const notes = `This task mentions @${entityName} for testing purposes.`;

    const response = await page.request.post('/api/tasks', {
      data: {
        title,
        createdBy: entityId,
        notes,
        priority: 3,
        taskType: 'task',
      },
    });
    const task = await response.json();
    return { id: task.id, title };
  }

  // Helper to create a test task without notes
  async function createTaskWithoutNotes(
    page: Page,
    entityId: string
  ): Promise<{ id: string; title: string }> {
    const title = `Notes Test Task ${Date.now()}`;

    const response = await page.request.post('/api/tasks', {
      data: {
        title,
        createdBy: entityId,
        priority: 3,
        taskType: 'task',
      },
    });
    const task = await response.json();
    return { id: task.id, title };
  }

  // Helper to navigate to task detail
  async function navigateToTaskDetail(page: Page, taskId: string) {
    await page.goto(`/tasks?selected=${taskId}`);
    await expect(page.getByTestId('tasks-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('task-detail-panel')).toBeVisible({ timeout: 10000 });
  }

  // ============================================================================
  // Notes section tests
  // ============================================================================

  test('notes section shows "Add Notes" button when no notes', async ({ page }) => {
    const entity = await getFirstEntity(page);
    if (!entity) {
      test.skip();
      return;
    }

    // Create a task without notes
    const task = await createTaskWithoutNotes(page, entity.id);

    // Navigate to task detail
    await navigateToTaskDetail(page, task.id);

    // Notes section should be visible
    const notesSection = page.getByTestId('task-notes-section');
    await expect(notesSection).toBeVisible();

    // Should show "Add Notes" button
    const addNotesBtn = page.getByTestId('add-notes-btn');
    await expect(addNotesBtn).toBeVisible();
  });

  test('clicking Add Notes opens editor', async ({ page }) => {
    const entity = await getFirstEntity(page);
    if (!entity) {
      test.skip();
      return;
    }

    // Create a task without notes
    const task = await createTaskWithoutNotes(page, entity.id);

    // Navigate to task detail
    await navigateToTaskDetail(page, task.id);

    // Click Add Notes button
    const addNotesBtn = page.getByTestId('add-notes-btn');
    await addNotesBtn.click();

    // Editor should be visible
    const editor = page.getByTestId('block-editor');
    await expect(editor).toBeVisible();

    // Save and Cancel buttons should be visible
    await expect(page.getByTestId('notes-save-btn')).toBeVisible();
    await expect(page.getByTestId('notes-cancel-btn')).toBeVisible();
  });

  test('typing @ in notes editor shows mention autocomplete', async ({ page }) => {
    const entity = await getFirstEntity(page);
    if (!entity) {
      test.skip();
      return;
    }

    // Create a task without notes
    const task = await createTaskWithoutNotes(page, entity.id);

    // Navigate to task detail
    await navigateToTaskDetail(page, task.id);

    // Click Add Notes button
    await page.getByTestId('add-notes-btn').click();

    // Type @ in the editor
    const editorContent = page.getByTestId('block-editor-content');
    await editorContent.click();
    await page.keyboard.type('@');

    // Mention autocomplete menu should appear
    await expect(page.getByTestId('mention-autocomplete-menu')).toBeVisible({ timeout: 5000 });
  });

  test('can save notes with @mention', async ({ page }) => {
    const entity = await getFirstEntity(page);
    if (!entity) {
      test.skip();
      return;
    }

    // Create a task without notes
    const task = await createTaskWithoutNotes(page, entity.id);

    // Navigate to task detail
    await navigateToTaskDetail(page, task.id);

    // Click Add Notes button
    await page.getByTestId('add-notes-btn').click();

    // Type some text with @mention
    const editorContent = page.getByTestId('block-editor-content');
    await editorContent.click();
    await page.keyboard.type('Need to discuss with @');

    // Wait for mention autocomplete
    const menu = page.getByTestId('mention-autocomplete-menu');
    await expect(menu).toBeVisible({ timeout: 5000 });

    // Select first entity
    await page.keyboard.press('Enter');
    await expect(menu).not.toBeVisible({ timeout: 3000 });

    // Add more text
    await page.keyboard.type(' about the implementation.');

    // Save
    await page.getByTestId('notes-save-btn').click();

    // Wait for save to complete (editor should close)
    await expect(page.getByTestId('block-editor')).not.toBeVisible({ timeout: 5000 });

    // Notes content should be visible
    await expect(page.getByTestId('task-notes-content')).toBeVisible();
  });

  // ============================================================================
  // Notes @mention rendering tests
  // ============================================================================

  test('notes with @mention renders as clickable link', async ({ page }) => {
    const entity = await getFirstEntity(page);
    if (!entity) {
      test.skip();
      return;
    }

    // Create a task with @mention in notes
    const task = await createTaskWithMentionInNotes(page, entity.id, entity.name);

    // Navigate to task detail
    await navigateToTaskDetail(page, task.id);

    // Find the notes section
    const notesContent = page.getByTestId('task-notes-content');
    await expect(notesContent).toBeVisible();

    // Look for the mention chip with the entity name
    const mentionChip = notesContent.locator('.mention-chip').first();
    await expect(mentionChip).toBeVisible();
    await expect(mentionChip).toContainText(`@${entity.name}`);
  });

  test('@mention in notes links to entity search', async ({ page }) => {
    const entity = await getFirstEntity(page);
    if (!entity) {
      test.skip();
      return;
    }

    // Create a task with @mention in notes
    const task = await createTaskWithMentionInNotes(page, entity.id, entity.name);

    // Navigate to task detail
    await navigateToTaskDetail(page, task.id);

    // Find the mention chip
    const notesContent = page.getByTestId('task-notes-content');
    const mentionChip = notesContent.locator('.mention-chip').first();
    await expect(mentionChip).toBeVisible();

    // Check the href attribute
    const href = await mentionChip.getAttribute('href');
    expect(href).toContain('/entities?search=');
    expect(href).toContain(encodeURIComponent(entity.name));
  });

  // ============================================================================
  // Mentioned Entities section tests
  // ============================================================================

  test('mentioned entities section shows entities from notes', async ({ page }) => {
    const entity = await getFirstEntity(page);
    if (!entity) {
      test.skip();
      return;
    }

    // Create a task with @mention in notes
    const task = await createTaskWithMentionInNotes(page, entity.id, entity.name);

    // Navigate to task detail
    await navigateToTaskDetail(page, task.id);

    // Mentioned entities section should be visible
    const mentionedSection = page.getByTestId('mentioned-entities-section');
    await expect(mentionedSection).toBeVisible();

    // The entity should be listed
    const entityLink = mentionedSection.locator(`[data-testid*="${entity.id}"], [href*="${entity.id}"]`).first();
    await expect(entityLink).toBeVisible();
  });

  test('mentioned entities section can be collapsed and expanded', async ({ page }) => {
    const entity = await getFirstEntity(page);
    if (!entity) {
      test.skip();
      return;
    }

    // Create a task with @mention in notes
    const task = await createTaskWithMentionInNotes(page, entity.id, entity.name);

    // Navigate to task detail
    await navigateToTaskDetail(page, task.id);

    // Find the toggle button
    const toggle = page.getByTestId('mentioned-entities-toggle');
    await expect(toggle).toBeVisible();

    // List should be visible
    const list = page.getByTestId('mentioned-entities-list');
    await expect(list).toBeVisible();

    // Click to collapse
    await toggle.click();

    // List should be hidden
    await expect(list).not.toBeVisible();

    // Click to expand
    await toggle.click();

    // List should be visible again
    await expect(list).toBeVisible();
  });

  test('notes section can be collapsed', async ({ page }) => {
    const entity = await getFirstEntity(page);
    if (!entity) {
      test.skip();
      return;
    }

    // Create a task with notes
    const task = await createTaskWithMentionInNotes(page, entity.id, entity.name);

    // Navigate to task detail
    await navigateToTaskDetail(page, task.id);

    // Find the notes toggle button
    const toggle = page.getByTestId('notes-toggle');
    await expect(toggle).toBeVisible();

    // Notes content should be visible
    const notesContent = page.getByTestId('task-notes-content');
    await expect(notesContent).toBeVisible();

    // Click to collapse
    await toggle.click();

    // Notes content should be hidden
    await expect(notesContent).not.toBeVisible();

    // Click to expand
    await toggle.click();

    // Notes content should be visible again
    await expect(notesContent).toBeVisible();
  });
});

import { expect, type Locator, type Page, type TestInfo } from '@playwright/test';

export async function workflowTaskRemovalJourney(page: Page, info: TestInfo): Promise<void> {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const activate = (locator: Locator) => info.project.use.hasTouch ? locator.tap() : locator.click();
  const capture = async (name: string) => {
    await page.evaluate(async () => { await document.fonts.ready; window.scrollTo({ top: 0, behavior: 'instant' }); });
    await page.screenshot({ path: info.outputPath(name), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  };

  // These pages are opened directly: the parent link must work without relying
  // on the browser's previous history entry.
  await page.goto('/issue-editor.html');
  const breadcrumb = page.getByRole('navigation', { name: 'Breadcrumb', exact: true });
  await expect(breadcrumb.getByRole('link', { name: 'Home', exact: true })).toHaveAttribute('href', './');
  await expect(breadcrumb.getByRole('link', { name: 'Workflow lab', exact: true })).toHaveAttribute('href', './workflows.html');
  await expect(breadcrumb.locator('[aria-current="page"]')).toHaveText('GitLab-style issue editor (unofficial)');
  await capture('issue-breadcrumb.png');
  await breadcrumb.getByRole('link', { name: 'Back to workflow lab', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/workflows\.html$/);
  await expect(breadcrumb.locator('[aria-current="page"]')).toHaveText('Workflow lab');
  await activate(breadcrumb.getByRole('link', { name: 'Back to Home', exact: true }));
  await expect(page).toHaveURL(/\/$/);

  await page.goto('/workflows.html');
  await activate(page.getByRole('link', { name: 'Try the task workspace' }));
  await expect(breadcrumb.locator('[aria-current="page"]')).toHaveText('Todoist-style task briefs (unofficial)');
  const tasks = page.getByRole('navigation', { name: 'Tasks', exact: true });
  const pane = page.locator('.task-pane:not([hidden])');
  const editor = pane.getByRole('textbox', { name: 'Task description editor', exact: true });
  const sidebar = page.locator('.task-sidebar');
  const undoDelete = page.getByRole('button', { name: 'Undo delete', exact: true });
  const add = page.getByRole('button', { name: '+ Add task', exact: true });
  const append = async (text: string) => {
    await activate(editor.locator('p').last());
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.type(text);
  };
  await pane.getByLabel('Task title', { exact: true }).fill('Release brief');
  await pane.getByLabel('Due date', { exact: true }).fill('2026-11-10');
  await pane.getByLabel('Completed', { exact: true }).check();
  await append(' Keep this edited draft.');
  await capture('task-before-delete.png');
  await activate(pane.getByRole('button', { name: 'Delete task', exact: true }));
  await expect(tasks.getByRole('button')).toHaveCount(2);
  await expect(tasks.getByRole('button', { name: 'Release brief' })).toHaveCount(0);
  await expect(tasks.getByRole('button', { name: 'Review the technical notes' })).toBeFocused();
  await expect(sidebar).toContainText('1 of 2 completed');
  await expect(editor).toContainText('Technical review');
  await activate(undoDelete);
  await expect(tasks.getByRole('button', { name: 'Release brief' })).toBeFocused();
  await expect(editor).toContainText('Keep this edited draft.');
  await expect(pane.getByLabel('Due date', { exact: true })).toHaveValue('2026-11-10');
  await expect(pane.getByLabel('Completed', { exact: true })).toBeChecked();
  await activate(editor.locator('p').last());
  await page.keyboard.press('ControlOrMeta+z');
  await expect(editor).not.toContainText('Keep this edited draft.');
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(editor).toContainText('Keep this edited draft.');
  await capture('task-restored-history.png');

  await activate(tasks.getByRole('button', { name: 'Review the technical notes' }));
  await append(' Review stays independent.');
  await activate(pane.getByRole('button', { name: 'Delete task', exact: true }));
  await expect(tasks.getByRole('button', { name: 'Share the finished draft' })).toBeFocused();
  await activate(undoDelete);
  expect(await tasks.getByRole('button').allTextContents()).toEqual([
    '✓Release brief', '○Review the technical notes', '✓Share the finished draft',
  ]);
  await expect(editor).toContainText('Review stays independent.');
  await activate(tasks.getByRole('button', { name: 'Release brief' }));
  await expect(editor).toContainText('Keep this edited draft.');
  await expect(editor).not.toContainText('Review stays independent.');

  await activate(add);
  await pane.getByLabel('Task title', { exact: true }).fill('');
  await activate(pane.getByRole('button', { name: 'Delete task', exact: true }));
  await expect(page.locator('.task-notice')).toContainText('Deleted Untitled task.');
  await activate(undoDelete);
  await expect(pane.getByLabel('Task title', { exact: true })).toHaveValue('');
  for (let index = 0; index < 4; index++) await activate(pane.getByRole('button', { name: 'Delete task', exact: true }));
  await expect(tasks.getByRole('button')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'No tasks', exact: true })).toBeVisible();
  await expect(add).toBeFocused();
  await expect(page.getByRole('button', { name: 'Delete task', exact: true })).toHaveCount(0);
  await capture('task-empty.png');
  await activate(undoDelete);
  await expect(editor).toContainText('Keep this edited draft.');
  await activate(pane.getByRole('button', { name: 'Delete task', exact: true }));
  await activate(page.getByRole('button', { name: 'Add a task', exact: true }));
  await expect(editor).toContainText('Add the details your team needs.');
  await expect(undoDelete).toHaveCount(0);

  // Collection actions release the previous one-step deletion recovery. The
  // live task limit still holds after remove/restore, with no duplicate pane.
  for (let index = 1; index < 20; index++) await activate(add);
  await expect(tasks.getByRole('button')).toHaveCount(20);
  await expect(add).toBeDisabled();
  await activate(pane.getByRole('button', { name: 'Delete task', exact: true }));
  await expect(add).toBeEnabled();
  await activate(undoDelete);
  await expect(tasks.getByRole('button')).toHaveCount(20);
  await expect(add).toBeDisabled();
  await expect(page.locator('.task-pane:not([hidden])')).toHaveCount(1);
  await activate(breadcrumb.getByRole('link', { name: 'Back to workflow lab', exact: true }));
  await expect(page).toHaveURL(/\/workflows\.html$/);
  await capture('workflow-parent.png');
  expect(errors).toEqual([]);
}

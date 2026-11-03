import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const root = 'artifacts/workflow-removal-public-20261103';
await mkdir(root, { recursive: false });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, recordVideo: { dir: root } });
await context.tracing.start({ screenshots: true, snapshots: true });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
try {
  await page.goto('https://eddolo.github.io/fountainjs/task-workflow.html');
  const pane = page.locator('.task-pane:not([hidden])');
  const editor = pane.getByRole('textbox', { name: 'Task description editor', exact: true });
  const tasks = page.getByRole('navigation', { name: 'Tasks', exact: true });
  await expect(editor).toContainText('Launch brief');
  await pane.getByLabel('Task title', { exact: true }).fill('Published-site QA draft');
  await editor.locator('p').last().click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type(' Live deployment check.');
  await pane.getByRole('button', { name: 'Delete task', exact: true }).click();
  await expect(tasks.getByRole('button')).toHaveCount(2);
  await expect(editor).toContainText('Technical review');
  await page.getByRole('button', { name: 'Undo delete', exact: true }).click();
  await expect(editor).toContainText('Live deployment check.');
  await expect(tasks.getByRole('button', { name: 'Published-site QA draft' })).toHaveAttribute('aria-pressed', 'true');
  await editor.locator('p').last().click();
  await page.keyboard.press('ControlOrMeta+z');
  await expect(editor).not.toContainText('Live deployment check.');
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(editor).toContainText('Live deployment check.');
  await page.evaluate(async () => { await document.fonts.ready; window.scrollTo(0, 0); });
  await page.screenshot({ path: root + '/restored-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: root + '/restored-narrow.png', fullPage: true });
  const crumb = page.getByRole('navigation', { name: 'Breadcrumb', exact: true });
  await crumb.getByRole('link', { name: 'Back to workflow lab', exact: true }).click();
  await expect(page).toHaveURL('https://eddolo.github.io/fountainjs/workflows.html');
  await page.getByRole('link', { name: 'Try the issue editor' }).click();
  await expect(crumb.locator('[aria-current="page"]')).toHaveText('GitLab-style issue editor (unofficial)');
  await crumb.getByRole('link', { name: 'Workflow lab', exact: true }).click();
  await crumb.getByRole('link', { name: 'Back to Home', exact: true }).click();
  await expect(page).toHaveURL('https://eddolo.github.io/fountainjs/');
  expect(errors).toEqual([]);
  await writeFile(root + '/result.json', JSON.stringify({
    sourceCommit: '5de64720a4ce8f76b5a8786341130f11a355b304', pagesRun: 41723824119,
    publishedTaskDeletionAndDraftHistoryRecovery: true, sitePrefixParentNavigation: true,
    desktopAndNarrowCaptures: true, errors, physicalDeviceCertified: false,
  }, null, 2) + '\n');
  console.log('Published website: native edit, task deletion/recovery, retained undo/redo and parent links under /fountainjs/ passed.');
} finally {
  await context.tracing.stop({ path: root + '/trace.zip' });
  await context.close(); await browser.close();
}

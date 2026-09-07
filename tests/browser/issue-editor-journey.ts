import { expect, type Page, type TestInfo } from '@playwright/test';
import { issueMarkdown } from '../../examples/react-app/src/issue-example';

export async function issueEditorJourney(page: Page, info: TestInfo): Promise<void> {
  await page.goto('/issue-editor.html');
  const editor = page.getByRole('textbox', { name: 'Issue description editor', exact: true });
  const sourceTab = page.getByRole('button', { name: 'Markdown source', exact: true });
  const visualTab = page.getByRole('button', { name: 'Visual editor', exact: true });
  const previewTab = page.getByRole('button', { name: 'Reader preview', exact: true });
  const source = page.getByRole('textbox', { name: 'Markdown description', exact: true });
  await expect(editor).toContainText('The preview keeps an outdated status');
  for (const task of await editor.locator('[data-fountain-node="task_item"]').all()) {
    expect((await task.boundingBox())!.height).toBeLessThan(100);
  }
  await sourceTab.click();
  await expect(source).toHaveValue(issueMarkdown);
  await visualTab.click();
  await editor.getByText('The preview keeps an outdated status after switching rooms.', { exact: true }).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Confirmed locally.');
  await expect(editor).toContainText('rooms. Confirmed locally.');
  await page.keyboard.press('Control+z');
  await expect(editor).not.toContainText('Confirmed locally.');
  await page.keyboard.press('Control+Shift+z');
  await sourceTab.click();
  const edited = await source.inputValue();
  expect(edited).toContain('rooms. Confirmed locally.');
  expect(edited).toContain('~~~typescript\nswitchRoom("planning");\n~~~');
  expect(edited).toContain('__deliberate source formatting__');
  expect(edited).toContain('[link](https://example.com/docs "Host documentation")');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: info.outputPath('edited-source-fidelity.png'), fullPage: true });
  await source.fill(edited.replace('Needs checking', 'Verified locally'));
  await previewTab.click();
  const preview = page.getByRole('textbox', { name: 'Issue preview', exact: true });
  await expect(preview).toHaveAttribute('contenteditable', 'false');
  await expect(preview).toContainText('Verified locally');
  await expect(page.getByRole('toolbar', { name: 'Formatting and rich content' })).not.toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: info.outputPath('reader-preview.png'), fullPage: true });
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download Markdown draft', exact: true }).click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toBe('issue-description.md');
  const path = info.outputPath('issue-description.md');
  await download.saveAs(path);
  await page.getByLabel('Open Markdown draft file', { exact: true }).setInputFiles(path);
  await expect(editor).toContainText('Verified locally');
  await sourceTab.click();
  await expect(source).toHaveValue(edited.replace('Needs checking', 'Verified locally'));
  await visualTab.click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  const checkbox = editor.locator('input[type="checkbox"]').first();
  await checkbox.check();
  await expect(checkbox).toBeChecked();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(checkbox).not.toBeChecked();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: info.outputPath('reopened-issue.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(async () => {
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  }).toPass();
  await page.screenshot({ path: info.outputPath('mobile-issue.png'), fullPage: true });
}

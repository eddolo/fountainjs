import { expect, type Page, type TestInfo } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';

export async function conversionHTMLPolicyJourney(page: Page, info: TestInfo, format: 'html' | 'markdown') {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const extension = format === 'markdown' ? 'md' : 'html';
  const source = '<section id="chapter-section">\n<p>Before <a id="chapter">Chapter one</a><a id="empty"></a> after.</p>\n<!-- audit -->\n</section>\n';
  await page.goto('/conversion-lab.html');
  const option = page.getByRole('checkbox', { name: 'Preserve supported HTML structure', exact: true });
  const open = (name: string) => page.getByLabel('Choose documents').setInputFiles({ name, mimeType: format === 'html' ? 'text/html' : 'text/markdown', buffer: Buffer.from(source) });
  const standardName = `standard.${extension}`, retainedName = `retained.${extension}`;
  await open(standardName);
  const standard = page.getByRole('region', { name: `Conversion workspace: ${standardName}`, exact: true });
  await expect(standard).toBeVisible();
  await expect(standard.locator('.lab-import-mode')).toContainText('standard import');
  await expect(standard.getByRole('textbox', { name: 'Imported document editor' }).locator('a[id="chapter"]')).toHaveCount(0);
  await option.check();
  await page.locator('.lab-import-options').screenshot({ path: info.outputPath('import-options.png') });
  await open(retainedName);
  const workspace = page.getByRole('region', { name: `Conversion workspace: ${retainedName}`, exact: true });
  const editor = workspace.getByRole('textbox', { name: 'Imported document editor', exact: true });
  const anchor = editor.locator('a[id="chapter"]');
  await expect(anchor).toHaveText('Chapter one');
  expect(await anchor.evaluate(element => getComputedStyle(element).color)).toBe(await anchor.locator('..').evaluate(element => getComputedStyle(element).color));
  await expect(editor.locator('section[id="chapter-section"]')).toHaveCount(1);
  await expect(editor.locator('a[id="empty"]')).toHaveCount(1);
  await expect(editor.locator('[data-fountain-node="html_comment"]')).toHaveCount(1);
  await expect(editor.locator('[data-fountain-html-comment]')).toBeVisible();
  await expect(workspace.locator('.lab-notice')).not.toContainText('discarded-html-comment');
  await expect(workspace.getByLabel('Original source', { exact: true })).toHaveText(source);
  if (format === 'markdown') {
    const download = page.waitForEvent('download');
    await workspace.getByRole('button', { name: 'Download export', exact: true }).click();
    const file = await download;
    await file.saveAs(info.outputPath('untouched.md'));
    expect(await readFile(info.outputPath('untouched.md'), 'utf8')).toBe(source);
  }
  await anchor.dblclick({ position: { x: 20, y: 10 } });
  const selected = await page.evaluate(() => window.getSelection()?.toString() ?? '');
  expect(selected).toMatch(/^Chapter ?$/u);
  await page.keyboard.type(selected.endsWith(' ') ? 'Section ' : 'Section');
  await expect(anchor).toHaveText('Section one');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(anchor).toHaveText('Chapter one');
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(anchor).toHaveText('Section one');
  // Switching next-import settings must not replace this editor or its schema.
  await option.uncheck();
  await page.getByRole('navigation', { name: 'Imported files' }).getByRole('button', { name: standardName, exact: true }).click();
  await expect(standard.locator('.lab-import-mode')).toContainText('standard import');
  await page.getByRole('navigation', { name: 'Imported files' }).getByRole('button', { name: retainedName, exact: true }).click();
  await expect(anchor).toHaveText('Section one');
  await expect(workspace.locator('.lab-import-mode')).toContainText('supported HTML structure preserved');
  for (const output of ['html', 'json', 'markdown']) {
    await workspace.getByRole('combobox', { name: 'Export format', exact: true }).selectOption(output);
    await workspace.getByRole('button', { name: 'Check round trip', exact: true }).click();
    await expect(workspace.getByLabel('Round-trip result', { exact: true })).toContainText('Exact Fountain document equality after reopening.');
    const preview = workspace.getByRole('textbox', { name: 'Reopened export preview' });
    await expect(preview.locator('a[id="chapter"]')).toHaveText('Section one');
    await expect(preview.locator('a[id="empty"]')).toHaveCount(1);
    await expect(preview.locator('[data-fountain-html-comment]')).toHaveCount(1);
    await expect(preview.locator('[data-fountain-html-comment]')).toBeHidden();
  }
  const reportDownload = page.waitForEvent('download');
  await workspace.getByRole('button', { name: 'Download diagnostic report', exact: true }).click();
  const reportFile = await reportDownload;
  await reportFile.saveAs(info.outputPath('conversion-report.json'));
  const report = JSON.parse(await readFile(info.outputPath('conversion-report.json'), 'utf8'));
  expect(report.importOptions).toEqual({ preserveHTMLStructure: true });
  expect(report.policy).toContain('html-structure');
  expect(report.editedDocument).toBeUndefined();
  expect(report.roundTrip.exactFountainJSONEquality).toBe(true);
  await editor.screenshot({ path: info.outputPath('retained-html-editor.png') });
  await workspace.getByLabel('Round-trip result', { exact: true }).screenshot({ path: info.outputPath('retained-html-reopened.png') });
  expect(errors).toEqual([]);
  await writeFile(info.outputPath('conversion-observations.json'), JSON.stringify({ format, selected, report, errors }, null, 2));
}

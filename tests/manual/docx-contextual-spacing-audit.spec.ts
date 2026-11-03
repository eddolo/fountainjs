import { test, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

test('the real conversion lab locates the unresolved Word spacing rule while preserving editing and reopen', async ({ page }, info) => {
  const root = resolve(`artifacts/docx-contextual-spacing-real-20261103/${info.project.name}`);
  await mkdir(root);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/conversion-lab.html');
  await page.getByLabel('Choose documents').setInputFiles(resolve('tests/fixtures/native-docx/cooling-report.docx'));
  const workspace = page.getByRole('region', { name: 'Conversion workspace: cooling-report.docx', exact: true });
  const editor = workspace.getByRole('textbox', { name: 'Imported document editor', exact: true });
  await expect(editor).toContainText('Cooling experiment report');
  const warnings = workspace.locator('li').filter({ has: page.locator('code').filter({ hasText: /^paragraph-contextual-spacing-not-imported$/ }) });
  await expect(warnings).toHaveCount(4);
  await expect(warnings.first()).toContainText('Document path: 0.');
  await expect(warnings.nth(3)).toContainText('Document path: 7.');
  await warnings.nth(3).screenshot({ path: resolve(root, 'located-warning.png') });
  const first = editor.locator('ol > li > p').first();
  await first.click(); await page.keyboard.press('End'); await page.keyboard.type(' Proofread.');
  await expect(first).toHaveText('Record the initial temperature before starting the timer. Proofread.');
  await workspace.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(first).toHaveText('Record the initial temperature before starting the timer.');
  await editor.screenshot({ path: resolve(root, 'editor.png') });
  const reportPending = page.waitForEvent('download');
  await workspace.getByRole('button', { name: 'Download diagnostic report', exact: true }).click();
  await (await reportPending).saveAs(resolve(root, 'diagnostic.json'));
  const report = JSON.parse(await readFile(resolve(root, 'diagnostic.json'), 'utf8'));
  const findings = report.importIssues.filter((issue: { code: string }) => issue.code === 'paragraph-contextual-spacing-not-imported');
  expect(findings.map((issue: { path: number[] }) => issue.path)).toEqual([[0], [5], [6], [7]]);
  await workspace.getByRole('combobox', { name: 'Export format', exact: true }).selectOption('docx');
  const pending = page.waitForEvent('download');
  await workspace.getByRole('button', { name: 'Download export', exact: true }).click();
  await (await pending).saveAs(resolve(root, 'exported.docx'));
  await page.getByLabel('Choose documents').setInputFiles(resolve(root, 'exported.docx'));
  const reopened = page.getByRole('region', { name: 'Conversion workspace: exported.docx', exact: true })
    .getByRole('textbox', { name: 'Imported document editor', exact: true });
  await expect(reopened).toContainText('Cooling experiment report');
  await expect(reopened.locator('ol > li')).toHaveCount(3);
  await expect(reopened.locator('ol > li > p').first()).toHaveText('Record the initial temperature before starting the timer.');
  await reopened.screenshot({ path: resolve(root, 'reopened.png') });
  expect(errors).toEqual([]);
  await writeFile(resolve(root, 'observations.json'), JSON.stringify({
    locatedIssues: findings, typingUndo: true, actualDiagnosticDownload: true, actualDOCXDownloadReopen: true,
    contextualLayoutFixed: false, errors,
  }, null, 2) + '\n');
});

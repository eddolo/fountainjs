import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

test('uses real Word style numbering through authoring and native download', async ({ page }, info) => {
  const root = resolve(process.env.FOUNTAIN_LIST_AUDIT_DIR ?? 'artifacts/docx-style-numbering-final-real-20261103', info.project.name);
  await mkdir(root, { recursive: true });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/conversion-lab.html');
  await page.getByLabel('Choose documents').setInputFiles(resolve('artifacts/docx-style-numbering-source-20261103/runbook.docx'));
  const workspace = page.getByRole('region', { name: 'Conversion workspace: runbook.docx', exact: true });
  const editor = workspace.getByRole('textbox', { name: 'Imported document editor', exact: true });
  const textPosition = (surface: typeof editor) => surface.locator('ol > li > p').first().evaluate(element => {
    const walker = element.ownerDocument.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const text = walker.nextNode();
    if (!text) throw new Error('Missing first numbered instruction.');
    const range = element.ownerDocument.createRange();
    range.setStart(text, 0); range.setEnd(text, Math.min(6, text.textContent?.length ?? 0));
    return { firstWordX: range.getBoundingClientRect().x, paragraphX: element.getBoundingClientRect().x,
      marginLeft: getComputedStyle(element).marginLeft, textIndent: getComputedStyle(element).textIndent };
  });
  const check = async (surface: typeof editor) => {
    await expect(surface.locator('ol')).toHaveCount(1);
    await expect(surface.locator('ol')).toHaveAttribute('start', '3');
    await expect(surface.locator('ol > li')).toHaveCount(2);
    await expect(surface.locator('ul > li')).toHaveCount(2);
    await expect(surface.locator('li').filter({ hasText: 'This note is not numbered.' })).toHaveCount(0);
    await expect(surface.locator('li').filter({ hasText: 'This is an ordinary paragraph despite the style name.' })).toHaveCount(0);
    await expect(surface.locator('p').filter({ hasText: /^This note is not numbered\.$/ })).toBeVisible();
    await expect(surface.locator('p').filter({ hasText: /^This is an ordinary paragraph despite the style name\.$/ })).toBeVisible();
  };
  await check(editor);
  const importedPosition = await textPosition(editor);
  await editor.screenshot({ path: resolve(root, 'imported.png') });
  const ending = editor.locator('p').filter({ hasText: /^Audit complete\./ });
  await ending.click(); await page.keyboard.press('End'); await page.keyboard.type(' Verified in Fountain.');
  await expect(ending).toHaveText('Audit complete. Verified in Fountain.');
  await workspace.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(ending).toHaveText('Audit complete.');
  await workspace.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(ending).toHaveText('Audit complete. Verified in Fountain.');
  await workspace.getByRole('combobox', { name: 'Export format', exact: true }).selectOption('docx');
  const downloaded = page.waitForEvent('download');
  await workspace.getByRole('button', { name: 'Download export', exact: true }).click();
  await (await downloaded).saveAs(resolve(root, 'runbook-export.docx'));
  await page.getByLabel('Choose documents').setInputFiles(resolve(root, 'runbook-export.docx'));
  const reopened = page.getByRole('region', { name: 'Conversion workspace: runbook-export.docx', exact: true })
    .getByRole('textbox', { name: 'Imported document editor', exact: true });
  await check(reopened);
  await expect(reopened).toContainText('Audit complete. Verified in Fountain.');
  await reopened.screenshot({ path: resolve(root, 'reopened.png') });
  expect(errors).toEqual([]);
  await writeFile(resolve(root, 'browser-observations.json'), JSON.stringify({
    actualTypingUndoRedoDownloadReopen: true, errors, importedPosition, reopenedPosition: await textPosition(reopened),
    scope: 'Numbering linkage/removal passed; positions record the still-open list geometry defect rather than accepting it as parity.',
  }, null, 2) + '\n');
});

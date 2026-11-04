import { test, expect, type Locator } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

async function physicalGap(previous: Locator, next: Locator) {
  const a = await previous.boundingBox(), b = await next.boundingBox();
  if (!a || !b) throw new Error('Expected visible paragraphs.');
  return b.y - a.y - a.height;
}

test('a field-review author edits contextual paragraphs and opens the actual exported reader', async ({ page }, info) => {
  const root = resolve(`${process.env.FOUNTAIN_PARAGRAPH_SPACING_AUDIT_DIR ?? 'artifacts/paragraph-spacing-real-20261104'}/${info.project.name}`);
  await mkdir(root);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/conversion-lab.html');
  await page.getByLabel('Choose documents').setInputFiles(resolve('artifacts/paragraph-spacing-source-20261104/spacing-review.html'));
  const workspace = page.getByRole('region', { name: 'Conversion workspace: spacing-review.html', exact: true });
  const editor = workspace.getByRole('textbox', { name: 'Imported document editor', exact: true });
  const paragraph = (text: string) => editor.locator('p').filter({ hasText: text });
  const first = paragraph('First research observation.'), second = paragraph('Second research observation.');
  const intro = paragraph('Review draft. Preserve the authored spacing settings.');
  await expect(second).toBeVisible();
  await expect(first).toHaveText('First research observation.');
  await expect(second).toHaveText('Second research observation.');
  const initialGap = await physicalGap(first, second);
  expect(initialGap).toBeCloseTo(8 / 3, 1);
  const listGap = await physicalGap(paragraph('Step one: record the measurement.'), paragraph('Step two: confirm the reading.'));
  expect(listGap).toBeCloseTo(0, 1);
  const followingListGap = await physicalGap(paragraph('Step two: confirm the reading.'), paragraph('Following note stays in the same step group.'));
  expect(followingListGap).toBeCloseTo(8 / 3, 1);
  await editor.screenshot({ path: resolve(root, 'initial.png') });

  await workspace.getByRole('combobox', { name: 'Export format', exact: true }).selectOption('json');
  let pending = page.waitForEvent('download');
  await workspace.getByRole('button', { name: 'Download export', exact: true }).click();
  await (await pending).saveAs(resolve(root, 'original.json'));
  const saved = JSON.parse(await readFile(resolve(root, 'original.json'), 'utf8'));
  const all: any[] = [];
  const walk = (node: any) => { all.push(node); node.content?.forEach(walk); };
  walk(saved);
  const originalSecond = all.find(node => node.type === 'paragraph' && node.content?.[0]?.text === 'Second research observation.');
  expect(originalSecond.attrs.layout).toMatchObject({ spacingGroup: 'body', spacingBefore: 12, spacingAfter: 0, contextualSpacing: false });

  await first.click(); await page.keyboard.press('End'); await page.keyboard.press('Enter');
  const empty = editor.locator('p').filter({ hasText: /^$/ });
  await expect(empty).toHaveCount(1);
  const enteredLineHeight = (await empty.boundingBox())?.height;
  expect(enteredLineHeight).toBeCloseTo(56 / 3, 1);
  expect(await physicalGap(first, empty)).toBeCloseTo(0, 1);
  expect(await physicalGap(empty, second)).toBeCloseTo(8 / 3, 1);
  await editor.screenshot({ path: resolve(root, 'entered.png') });
  await workspace.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(empty).toHaveCount(0);
  expect(await physicalGap(first, second)).toBeCloseTo(8 / 3, 1);
  await workspace.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(empty).toHaveCount(1);
  await empty.click(); await page.keyboard.press('Home'); await page.keyboard.press('Backspace');
  await expect(empty).toHaveCount(0);
  await expect(first).toHaveText('First research observation.');
  expect(await physicalGap(first, second)).toBeCloseTo(8 / 3, 1);

  await first.click(); await page.keyboard.press('Home'); await page.keyboard.press('Shift+End');
  await expect.poll(() => page.evaluate(() => window.getSelection()?.toString())).toBe('First research observation.');
  await page.keyboard.press('Backspace'); await page.keyboard.press('Backspace');
  await expect(first).toHaveCount(0);
  const afterDeletionGap = await physicalGap(intro, second);
  expect(afterDeletionGap).toBeCloseTo(16, 1);
  await editor.screenshot({ path: resolve(root, 'deleted.png') });

  await workspace.getByRole('combobox', { name: 'Export format', exact: true }).selectOption('html');
  pending = page.waitForEvent('download');
  await workspace.getByRole('button', { name: 'Download export', exact: true }).click();
  await (await pending).saveAs(resolve(root, 'edited-reader.html'));
  const reader = await page.context().newPage();
  reader.on('pageerror', error => errors.push(error.message));
  let readerGap: number;
  try {
    await reader.goto(pathToFileURL(resolve(root, 'edited-reader.html')).href);
    const readerIntro = reader.locator('p').filter({ hasText: /^Review draft\./ });
    const readerSecond = reader.locator('p').filter({ hasText: /^Second research observation\.$/ });
    readerGap = await physicalGap(readerIntro, readerSecond);
    expect(readerGap).toBeCloseTo(16, 1);
    await reader.screenshot({ path: resolve(root, 'reader.png'), fullPage: true });
  } finally { await reader.close(); }
  await workspace.getByRole('combobox', { name: 'Export format', exact: true }).selectOption('docx');
  await workspace.getByRole('button', { name: 'Check round trip', exact: true }).click();
  await expect(workspace.locator('[aria-label="Round-trip result"]')).toContainText('paragraph-contextual-spacing-not-exported');
  await page.getByLabel('Choose documents').setInputFiles(resolve(root, 'edited-reader.html'));
  const reopened = page.getByRole('region', { name: 'Conversion workspace: edited-reader.html', exact: true })
    .getByRole('textbox', { name: 'Imported document editor', exact: true });
  const reopenGap = await physicalGap(reopened.locator('p').filter({ hasText: /^Review draft\./ }), reopened.locator('p').filter({ hasText: /^Second research observation\.$/ }));
  expect(reopenGap).toBeCloseTo(16, 1);
  await reopened.screenshot({ path: resolve(root, 'reopened.png') });
  expect(errors).toEqual([]);
  await writeFile(resolve(root, 'observations.json'), JSON.stringify({
    initialGap, listGap, followingListGap, enteredLineHeight, afterDeletionGap, readerGap, reopenGap,
    originalDeclaredSecond: originalSecond.attrs.layout,
    enterUndoRedoBackspace: true, backwardSelectionAndDeletion: true,
    actualJSONDownload: true, actualHTMLDownloadReaderReopen: true,
    nativeWordUnsupportedRuleReported: true, nativeWordSpacingCertified: false, errors,
  }, null, 2) + '\n');
});

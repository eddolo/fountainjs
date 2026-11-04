import { test, expect, type Locator } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

async function gap(a: Locator, b: Locator) {
  const first = await a.boundingBox(), second = await b.boundingBox();
  if (!first || !second) throw new Error('Expected visible document paragraphs.');
  return second.y - first.y - first.height;
}

test('a researcher edits the actual Word paper, preserves its HTML rule and sees the remaining native export loss', async ({ page }, info) => {
  const root = resolve(`${process.env.FOUNTAIN_DOCX_SPACING_AUDIT_DIR ?? 'artifacts/docx-spacing-identity-real-20261104'}/${info.project.name}`);
  await mkdir(root);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/conversion-lab.html');
  await page.getByLabel('Choose documents').setInputFiles(resolve('tests/fixtures/native-docx/cooling-report.docx'));
  const workspace = page.getByRole('region', { name: 'Conversion workspace: cooling-report.docx', exact: true });
  const editor = workspace.getByRole('textbox', { name: 'Imported document editor', exact: true });
  const items = editor.locator('ol > li');
  const paragraphs = editor.locator('ol > li > p');
  await expect(items).toHaveCount(3);
  const initialGaps = [await gap(paragraphs.nth(0), paragraphs.nth(1)), await gap(paragraphs.nth(1), paragraphs.nth(2))];
  for (const value of initialGaps) expect(value).toBeCloseTo(0, 1);
  await expect(workspace.locator('li code').filter({ hasText: /^paragraph-contextual-spacing-not-imported$/ })).toHaveCount(0);
  await editor.screenshot({ path: resolve(root, 'imported.png') });

  await paragraphs.first().click(); await page.keyboard.press('End'); await page.keyboard.press('Enter');
  await expect(items).toHaveCount(4);
  const empty = paragraphs.filter({ hasText: /^$/ });
  await expect(empty).toHaveCount(1);
  const enteredHeight = (await empty.boundingBox())?.height;
  expect(enteredHeight).toBeGreaterThan(10);
  const emptyMarkerDiagnostic = await empty.evaluate(element => ({
    paragraph: element.outerHTML, item: element.parentElement?.outerHTML,
    beforeContent: getComputedStyle(element, '::before').content,
    beforeDisplay: getComputedStyle(element, '::before').display,
    markerVariable: getComputedStyle(element).getPropertyValue('--fountain-list-marker-content'),
  }));
  expect(await gap(paragraphs.first(), empty)).toBeCloseTo(0, 1);
  expect(await gap(empty, paragraphs.nth(2))).toBeCloseTo(0, 1);
  await editor.screenshot({ path: resolve(root, 'entered.png') });
  await workspace.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(items).toHaveCount(3);
  await workspace.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(items).toHaveCount(4);
  await empty.click(); await page.keyboard.press('Home'); await page.keyboard.press('Backspace');
  await expect(items).toHaveCount(3);
  await expect(paragraphs.first()).toHaveText('Record the initial temperature before starting the timer.');
  expect(await gap(paragraphs.first(), paragraphs.nth(1))).toBeCloseTo(0, 1);

  const download = async (format: string, name: string) => {
    await workspace.getByRole('combobox', { name: 'Export format', exact: true }).selectOption(format);
    const pending = page.waitForEvent('download');
    await workspace.getByRole('button', { name: 'Download export', exact: true }).click();
    await (await pending).saveAs(resolve(root, name));
  };
  await download('json', 'edited.json');
  const saved = JSON.parse(await readFile(resolve(root, 'edited.json'), 'utf8'));
  const list = saved.content.find((node: { type: string }) => node.type === 'ordered_list');
  for (const item of list.content) expect(item.content[0].attrs.layout).toMatchObject({ spacingGroup: 'word:style:ListNumber', contextualSpacing: true, spacingAfter: 7 });
  await download('html', 'reader.html');
  const reader = await page.context().newPage();
  let readerGap: number;
  const readerImages: Array<{ width: number; height: number }> = [];
  try {
    await reader.goto(pathToFileURL(resolve(root, 'reader.html')).href);
    const rendered = reader.locator('ol > li > p');
    readerGap = await gap(rendered.nth(0), rendered.nth(1));
    expect(readerGap).toBeCloseTo(0, 1);
    const images = reader.locator('img');
    await expect(images).toHaveCount(3);
    for (const image of await images.all()) {
      await image.scrollIntoViewIfNeeded();
      await expect.poll(() => image.evaluate(element => element instanceof HTMLImageElement && element.complete && element.naturalWidth > 0)).toBe(true);
      readerImages.push(await image.evaluate(element => {
        if (!(element instanceof HTMLImageElement)) throw new Error('Expected an actual reader image.');
        return { width: element.naturalWidth, height: element.naturalHeight };
      }));
    }
    await reader.screenshot({ path: resolve(root, 'reader.png'), fullPage: true });
  } finally { await reader.close(); }

  await workspace.getByRole('combobox', { name: 'Export format', exact: true }).selectOption('docx');
  await workspace.getByRole('button', { name: 'Check round trip', exact: true }).click();
  await expect(workspace.locator('[aria-label="Round-trip result"]')).toContainText('paragraph-contextual-spacing-not-exported');
  await download('docx', 'actual-export.docx');
  await page.getByLabel('Choose documents').setInputFiles(resolve(root, 'actual-export.docx'));
  const reopened = page.getByRole('region', { name: 'Conversion workspace: actual-export.docx', exact: true })
    .getByRole('textbox', { name: 'Imported document editor', exact: true });
  const reopenedParagraphs = reopened.locator('ol > li > p');
  await expect(reopenedParagraphs).toHaveCount(3);
  const nativeReopenGap = await gap(reopenedParagraphs.nth(0), reopenedParagraphs.nth(1));
  // This is the measured, explicitly reported remaining export loss. It is
  // deliberately not a successful native-fidelity assertion.
  expect(nativeReopenGap).toBeCloseTo(28 / 3, 1);
  await reopened.screenshot({ path: resolve(root, 'native-export-loss.png') });
  expect(errors).toEqual([]);
  await writeFile(resolve(root, 'observations.json'), JSON.stringify({ initialGaps, enteredHeight, emptyMarkerDiagnostic, readerGap, readerImages, nativeReopenGap,
    actualWordSource: true, enterUndoRedoBackspace: true, originalDeclaredAfterPt: 7,
    actualJSONAndHTMLDownloads: true, actualDOCXDownloadReopened: true,
    nativeExportRuleRetained: false, nativeWordSpacingCertified: false, errors }, null, 2) + '\n');
});

import { expect, test, type Page } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { Schema, StarterKit } from 'fountainjs-editor';
import { exportDOCX, importDOCX } from 'fountainjs-editor/docx';
import { conversionLabJourney } from '../browser/conversion-lab-journey';
test('conversion lab file edit report and export journey', async ({ page }, info) => {
  await conversionLabJourney(page, info);
});
test('conversion lab phone file journey', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await conversionLabJourney(page, info);
});

function coolingChart(page: Page) {
  return page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 300; canvas.height = 120;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#e8f5f4'; context.fillRect(0, 0, 300, 120);
    context.fillStyle = '#245765'; context.font = '17px sans-serif';
    context.fillText('Cooling experiment', 20, 25);
    for (const [index, height] of [34, 55, 71].entries()) context.fillRect(42 + 72 * index, 105 - height, 28, height);
    return canvas.toDataURL('image/png').split(',')[1]!;
  });
}

test('recovers an omitted Word image into an undoable draft and native download', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/conversion-lab.html');
  const base64 = await coolingChart(page);
  const image = Buffer.from(base64, 'base64');
  const schema = new Schema(StarterKit.schema);
  const body = schema.node('doc', {}, [schema.node('paragraph', {}, [schema.text('Original report text.')])]);
  const original = Buffer.from(zipSync({ ...unzipSync(exportDOCX(body).bytes), 'word/media/cooling.png': image,
    'word/media/unsafe.png': new TextEncoder().encode('<svg onload="window.sourceRan=true"/>') }));
  await page.getByLabel('Choose documents').setInputFiles({ name: 'cooling.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: original });
  const workspace = page.getByRole('region', { name: 'Conversion workspace: cooling.docx', exact: true });
  const recovery = workspace.getByRole('region', { name: 'Recover source images' });
  const editor = workspace.getByRole('textbox', { name: 'Imported document editor' });
  await expect(editor).toContainText('Original report text.');
  await expect(editor.locator('img')).toHaveCount(0);
  await recovery.getByLabel('Unrepresented media').selectOption('word/media/unsafe.png');
  await recovery.getByRole('button', { name: 'Preview source image' }).click();
  await expect(recovery.getByRole('alert')).toContainText('not a supported PNG');
  expect(await page.evaluate(() => (window as Window & { sourceRan?: boolean }).sourceRan)).toBeUndefined();
  await recovery.getByLabel('Unrepresented media').selectOption('word/media/cooling.png');
  await recovery.getByRole('button', { name: 'Preview source image' }).click();
  const preview = recovery.getByRole('img', { name: 'Preview of cooling.png' });
  await expect.poll(() => preview.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBe(300);
  const pending = page.waitForEvent('download');
  await recovery.getByRole('button', { name: 'Download source image' }).click();
  expect(await readFile((await (await pending).path())!)).toEqual(image);
  await recovery.getByLabel('Image description for the draft').fill('Recovered cooling chart');
  await recovery.screenshot({ path: info.outputPath('source-image-recovery.png') });
  await recovery.getByRole('button', { name: 'Append image to draft' }).click();
  await expect(editor.getByRole('img', { name: 'Recovered cooling chart' })).toBeVisible();
  await workspace.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(editor.locator('img')).toHaveCount(0);
  await workspace.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(editor.getByRole('img', { name: 'Recovered cooling chart' })).toBeVisible();
  const download = page.waitForEvent('download');
  await workspace.getByRole('button', { name: 'Download export' }).click();
  const exportedFile = info.outputPath('recovered-cooling.docx');
  await (await download).saveAs(exportedFile);
  const exported = unzipSync(await readFile(exportedFile));
  const media = Object.entries(exported).filter(([name]) => name.startsWith('word/media/'));
  expect(media).toHaveLength(1);
  expect(Buffer.from(media[0][1])).toEqual(image);
  expect(new TextDecoder().decode(exported['word/document.xml'])).toContain('<wp:extent cx="2857500" cy="1143000"');
  const reopened = workspace.getByRole('textbox', { name: 'Reopened export preview' });
  await expect(reopened.getByRole('img', { name: 'Recovered cooling chart' })).toBeVisible();
  await reopened.screenshot({ path: info.outputPath('recovered-image-reopened.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(391);
  await recovery.screenshot({ path: info.outputPath('source-image-recovery-narrow.png') });
  expect(errors).toEqual([]);
});

test('imports a linked Word image in place from a different package folder', async ({ page }, info) => {
  await page.goto('/conversion-lab.html');
  const base64 = await coolingChart(page);
  const schema = new Schema(StarterKit.schema);
  const image = schema.node('inline_image', {
    src: `data:image/png;base64,${base64}`, alt: 'Cooling experiment chart', width: '300px', height: '120px',
  });
  const document = schema.node('doc', {}, [
    schema.node('heading', { level: 1 }, [schema.text('Cooling experiment report')]),
    schema.node('paragraph', {}, [schema.text('Figure 1 '), image, schema.text(' Three cooling trials.')]),
  ]);
  const parts = unzipSync(exportDOCX(document).bytes);
  const part = Object.keys(parts).find(name => name.startsWith('word/media/'))!;
  const originalImage = parts[part]!;
  const alternatePart = 'assets/plots/cooling chart.png';
  parts[alternatePart] = originalImage;
  delete parts[part];
  const rels = 'word/_rels/document.xml.rels';
  parts[rels] = strToU8(strFromU8(parts[rels]!).replace(part.slice('word/'.length), '../assets/plots/cooling%20chart.png'));
  const buffer = Buffer.from(zipSync(parts));
  await writeFile(info.outputPath('linked-chart-original.docx'), buffer);
  await page.getByLabel('Choose documents').setInputFiles({ name: 'linked-chart.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer });
  const workspace = page.getByRole('region', { name: 'Conversion workspace: linked-chart.docx', exact: true });
  const editor = workspace.getByRole('textbox', { name: 'Imported document editor' });
  const paragraph = editor.locator('p').filter({ hasText: 'Three cooling trials.' });
  const chart = paragraph.getByRole('img', { name: 'Cooling experiment chart' });
  await expect(chart).toBeVisible();
  await expect.poll(() => chart.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBe(300);
  await expect(paragraph).toContainText('Figure 1');
  const inventory = workspace.getByLabel('Source package inventory');
  await inventory.locator('summary').click();
  await expect(inventory.locator('li').filter({ hasText: alternatePart })).toContainText('imported-image');
  await expect(workspace.getByRole('region', { name: 'Recover source images' })).toHaveCount(0);
  await paragraph.click();
  await page.keyboard.press('End');
  await page.keyboard.insertText(' Reviewed.');
  await expect(paragraph).toContainText('Reviewed.');
  await editor.screenshot({ path: info.outputPath('linked-chart-editor.png') });

  const download = page.waitForEvent('download');
  await workspace.getByRole('button', { name: 'Download export' }).click();
  const file = info.outputPath('linked-chart-export.docx');
  await (await download).saveAs(file);
  const bytes = await readFile(file);
  const exported = unzipSync(bytes);
  const exportedImages = Object.entries(exported).filter(([name]) => name.startsWith('word/media/'));
  expect(exportedImages).toHaveLength(1);
  expect(exportedImages[0]![1]).toEqual(originalImage);
  const reopened = importDOCX(bytes, schema).document.child(1);
  expect(reopened.child(0).text).toBe('Figure 1 ');
  expect(reopened.child(1).type.name).toBe('inline_image');
  expect(reopened.child(2).text).toBe(' Three cooling trials. Reviewed.');
  const preview = workspace.getByRole('textbox', { name: 'Reopened export preview' });
  await expect(preview.getByRole('img', { name: 'Cooling experiment chart' })).toBeVisible();
  await preview.screenshot({ path: info.outputPath('linked-chart-export-preview.png') });
});
